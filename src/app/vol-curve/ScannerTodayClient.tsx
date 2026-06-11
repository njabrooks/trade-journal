"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { HelpCircle } from "lucide-react";

interface ScannerSnapshot {
  id: string;
  ticker: string;
  regime: 'cheap' | 'rich' | 'mixed' | 'neutral' | null;
  cheapnessScore: number | null;
  richnessScore: number | null;
  ivPercentile252: number | null;
  ivRv20Ratio: number | null;
  termStructureSlope: number | null;
  skew25d: number | null;
  hasOpenPosition: boolean;
  iv30: number | null;
  rv20: number | null;
  spot: number | null;
  dataSource: string | null;
  thesisTitles: string | null;
  reportCount: number;
  latestReportId: string | null;
}

interface ScannerRun {
  id: string;
  runDate: string;
  universeSource: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'unknown';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // Locale-formatted "May 15, 14:45 UTC"
  return (
    d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

interface ScannerResponse {
  run: ScannerRun | null;
  snapshots: ScannerSnapshot[];
}

const REGIME_BADGE: Record<string, { label: string; cls: string }> = {
  cheap: { label: 'Cheap', cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  rich: { label: 'Rich', cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30' },
  mixed: { label: 'Mixed', cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  neutral: { label: 'Neutral', cls: 'bg-slate-500/10 text-slate-600 border-slate-500/30' },
};

function formatPct(v: number | null, digits = 1): string {
  return v == null ? '—' : `${v.toFixed(digits)}%`;
}

function formatRatio(v: number | null, digits = 2): string {
  return v == null ? '—' : v.toFixed(digits);
}

function formatPp(v: number | null, digits = 1): string {
  return v == null ? '—' : `${(v * 100).toFixed(digits)}pp`;
}

type SortKey =
  | 'ticker'
  | 'regime'
  | 'score'
  | 'ivPercentile252'
  | 'ivRv20Ratio'
  | 'termStructureSlope'
  | 'skew25d'
  | 'hasOpenPosition';

function sortValue(s: ScannerSnapshot, key: SortKey): number | string {
  switch (key) {
    case 'ticker':
      return s.ticker;
    case 'regime':
      return s.regime ?? 'zzz';
    case 'score':
      return s.regime === 'rich'
        ? s.richnessScore ?? 0
        : s.regime === 'cheap'
        ? s.cheapnessScore ?? 0
        : Math.max(s.cheapnessScore ?? 0, s.richnessScore ?? 0);
    case 'ivPercentile252':
      return s.ivPercentile252 ?? -Infinity;
    case 'ivRv20Ratio':
      return s.ivRv20Ratio ?? -Infinity;
    case 'termStructureSlope':
      return s.termStructureSlope ?? -Infinity;
    case 'skew25d':
      return s.skew25d ?? -Infinity;
    case 'hasOpenPosition':
      return s.hasOpenPosition ? 1 : 0;
  }
}

const TERM_DELTA_TOOLTIP =
  'Term-structure slope: back-month ATM IV (~6M) minus front-month ATM IV (~30 DTE), in vol points. ' +
  'Positive = normal contango (back > front). Negative = backwardation, often event-driven stress in front. ' +
  'Used to gauge whether buying back-month vol is supported by curve shape.';

const SKEW_TOOLTIP =
  '25-delta skew at front expiry: IV of the 25-delta put minus IV of the 25-delta call, in vol points. ' +
  'Positive = put skew (downside puts more expensive than equivalent calls — typical for equities). ' +
  'Large positive skew indicates demand for downside protection. Negative skew suggests upside chase or short squeeze positioning.';

function HeaderHelp({ tooltip }: { tooltip: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="ml-1 inline-block h-3 w-3 text-muted-foreground/60 hover:text-foreground" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ScannerTodayClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<ScannerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'cheap' | 'rich' | 'mixed'>('all');

  // SortableHeader writes ?sort=<col>&direction=<asc|desc> to the URL.
  // Default sort: score descending.
  const sortKey = (searchParams.get('sort') as SortKey | null) ?? 'score';
  const sortDir = (searchParams.get('direction') as 'asc' | 'desc' | null) ?? 'desc';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vol-curve/scanner-today');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ScannerResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRerun = useCallback(async () => {
    setRerunning(true);
    setError(null);
    try {
      const res = await fetch('/api/vol-curve/scanner-rerun', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(`Re-run failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setRerunning(false);
    }
  }, [load]);

  const onAnalyze = useCallback(
    async (snap: ScannerSnapshot) => {
      setAnalyzing(snap.id);
      try {
        const res = await fetch(`/api/vol-curve/analyze-snapshot/${snap.id}`, {
          method: 'POST',
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (json.reportId) {
          router.push(`/vol-curve/${json.reportId}`);
        }
      } catch (err) {
        setError(`${snap.ticker}: ${err instanceof Error ? err.message : 'Failed'}`);
      } finally {
        setAnalyzing(null);
      }
    },
    [router]
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading scanner output…</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-600">Error: {error}</CardContent>
      </Card>
    );
  }

  if (!data?.run) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No scanner runs found. The daily scanner runs at 13:45/14:45 UTC weekdays.
        </CardContent>
      </Card>
    );
  }

  const filteredSnaps = data.snapshots
    .filter((s) => {
      if (filter === 'all') return s.regime !== 'neutral';
      return s.regime === filter;
    })
    .slice()
    .sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va === vb) return 0;
      const cmp = va < vb ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const regimeCounts = data.snapshots.reduce(
    (acc, s) => {
      const k = (s.regime ?? 'neutral') as keyof typeof acc;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    { cheap: 0, rich: 0, mixed: 0, neutral: 0 } as Record<string, number>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Scanner Today</CardTitle>
              <CardDescription className="mt-1">
                <span className="font-medium text-foreground">{data.run.runDate}</span>
                {' · '}
                <span className="text-foreground">{formatAbsolute(data.run.completedAt ?? data.run.startedAt)}</span>
                {' '}
                <span className="text-muted-foreground/80">
                  ({formatRelative(data.run.completedAt ?? data.run.startedAt)})
                </span>
                {' · '}
                {data.run.universeSource}
                <br />
                <span className="text-emerald-600">{regimeCounts.cheap} cheap</span>,{' '}
                <span className="text-rose-600">{regimeCounts.rich} rich</span>,{' '}
                <span className="text-amber-600">{regimeCounts.mixed} mixed</span>,{' '}
                <span className="text-slate-500">{regimeCounts.neutral} neutral</span>
                <br />
                <span className="text-xs text-muted-foreground/70">
                  Data: Massive options chains + Yahoo Finance spot. Quote freshness
                  depends on the active Massive plan (real-time on paid options tiers,
                  ~15 min delayed otherwise). The "Re-run Scanner" button recomputes
                  metrics from already-ingested chains; a full chain refresh requires
                  <code className="text-[10px] mx-1">ingest-radar-back-months.ts</code>
                  from terminal.
                </span>
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={rerunning}
              onClick={onRerun}
              className="shrink-0"
            >
              {rerunning ? 'Re-running…' : 'Re-run Scanner'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList className="mb-3">
              <TabsTrigger value="all">Actionable ({regimeCounts.cheap + regimeCounts.rich + regimeCounts.mixed})</TabsTrigger>
              <TabsTrigger value="cheap">Cheap ({regimeCounts.cheap})</TabsTrigger>
              <TabsTrigger value="rich">Rich ({regimeCounts.rich})</TabsTrigger>
              <TabsTrigger value="mixed">Mixed ({regimeCounts.mixed})</TabsTrigger>
            </TabsList>
            <TabsContent value={filter}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b select-none">
                    <tr>
                      <SortableHeader column="ticker" className="text-left">Ticker</SortableHeader>
                      <SortableHeader column="regime" className="text-left">Regime</SortableHeader>
                      <SortableHeader column="score" className="text-right">Score</SortableHeader>
                      <SortableHeader column="ivPercentile252" className="text-right">IV %ile</SortableHeader>
                      <SortableHeader column="ivRv20Ratio" className="text-right">IV/RV</SortableHeader>
                      <SortableHeader column="termStructureSlope" className="text-right">
                        <span>Term Δ<HeaderHelp tooltip={TERM_DELTA_TOOLTIP} /></span>
                      </SortableHeader>
                      <SortableHeader column="skew25d" className="text-right">
                        <span>25Δ Skew<HeaderHelp tooltip={SKEW_TOOLTIP} /></span>
                      </SortableHeader>
                      <SortableHeader column="hasOpenPosition" className="text-center">Pos</SortableHeader>
                      <th className="text-left py-2 px-2">Thesis</th>
                      <th className="text-right py-2 px-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSnaps.map((s) => {
                      const score =
                        s.regime === 'rich'
                          ? s.richnessScore
                          : s.regime === 'cheap'
                          ? s.cheapnessScore
                          : Math.max(s.cheapnessScore ?? 0, s.richnessScore ?? 0);
                      const badge = REGIME_BADGE[s.regime ?? 'neutral'];
                      return (
                        <tr key={s.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-2 font-mono font-semibold">{s.ticker}</td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className={badge?.cls}>{badge?.label}</Badge>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums font-medium">
                            {score == null ? '—' : score.toFixed(0)}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{formatPct(s.ivPercentile252)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{formatRatio(s.ivRv20Ratio)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{formatPp(s.termStructureSlope)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{formatPp(s.skew25d)}</td>
                          <td className="py-2 px-2 text-center">
                            {s.hasOpenPosition ? <span className="text-emerald-600">●</span> : <span className="text-muted-foreground">○</span>}
                          </td>
                          <td className="py-2 px-2 text-xs truncate max-w-[200px] text-muted-foreground">
                            {s.thesisTitles || '—'}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {s.latestReportId ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/vol-curve/${s.latestReportId}`)}
                              >
                                View
                              </Button>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                disabled={analyzing === s.id}
                                onClick={() => onAnalyze(s)}
                              >
                                {analyzing === s.id ? 'Analyzing…' : 'Analyze'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredSnaps.length === 0 && (
                  <div className="py-6 text-sm text-center text-muted-foreground">
                    No tickers in this regime today.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
