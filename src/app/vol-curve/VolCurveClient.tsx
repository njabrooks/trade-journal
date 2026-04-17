"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FormLabel } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ComposedChart,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Label,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Loader2, TrendingUp, TrendingDown, Activity, Target, Save, Trash2, ExternalLink, HelpCircle } from "lucide-react";
import Link from "next/link";

function Tip({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-help border-b border-dotted border-muted-foreground/40">
          {children}
          <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

// ===================== TYPES =====================

interface Leg {
  action: "buy" | "sell";
  strike: number;
  type: "call" | "put";
  iv: number;
  marketPrice: number;
  thesisValue: number;
  edgeRatio: number;
  delta: number;
  vega: number;
  theta: number;
  openInterest: number;
}

interface Strategy {
  rank: number;
  label: string;
  type: "naked_call" | "call_spread" | "risk_reversal" | "butterfly";
  expiry: string;
  dte: number;
  legs: Leg[];
  netDebit: number;
  maxProfit: number;
  maxLoss: number;
  breakeven: number;
  payoffAtBase: number;
  payoffAtHigh: number;
  returnOnRiskBase: number;
  returnOnRiskHigh: number;
  annualizedRorBase: number;
  annualizedRorHigh: number;
  netDelta: number;
  netVega: number;
  netTheta: number;
  avgEdgeRatio: number;
  liquidityScore: number;
}

interface VolSurfacePoint {
  strike: number;
  callIv: number | null;
  putIv: number | null;
  callEdgeRatio: number | null;
  callThesisValue: number | null;
  callMarketPrice: number | null;
  callOi: number;
  putOi: number;
}

interface AnalysisData {
  context: {
    ticker: string;
    spot: number;
    iv30: number | null;
    rv20: number | null;
    ivRvRatio: number | null;
    ivRvAssessment: string;
    smileAnalysis: {
      atmIv: number;
      callSkewSlope: number;
      smileDescription: string;
    };
    putSkewAnalysis: {
      putSkewRichness: number;
      description: string;
    };
    thesisSigma: number;
    expiryCount: number;
    contractCount: number;
    dataSource: string;
  };
  thesis: {
    direction: string;
    targetBase: number;
    targetHigh: number;
    downsideFloor: number;
    horizonMonths: number;
    horizonRange: number;
  };
  expiries: Array<{ expiry: string; dte: number; callCount: number; putCount: number }>;
  volSurface: VolSurfacePoint[];
  volSurfaceExpiry: string;
  termStructure?: Array<{
    strike: number;
    expiries: Array<{ expiry: string; dte: number; callIv: number | null; putIv: number | null; callPrice: number | null; putPrice: number | null }>;
  }>;
  volHistory: Array<{ date: string; iv30: number | null; rv20: number | null; spot: number | null }>;
  narrative: {
    volContext: string;
    structureGuidance: string;
    recommendations: Array<{ title: string; body: string }>;
    keyRisks: string;
  };
  volRank: {
    ivRank: number | null;
    ivPercentile: number | null;
    iv52High: number | null;
    iv52Low: number | null;
    rv52High: number | null;
    rv52Low: number | null;
  };
  strategies: Strategy[];
}

// ===================== FORM =====================

interface FormState {
  ticker: string;
  direction: "bullish" | "bearish";
  targetBase: string;
  targetHigh: string;
  horizonMonths: string;
  horizonRange: string;
  downsideFloor: string;
}

function AnalysisForm({
  onSubmit,
  loading,
}: {
  onSubmit: (form: FormState) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<FormState>({
    ticker: "",
    direction: "bullish",
    targetBase: "",
    targetHigh: "",
    horizonMonths: "6",
    horizonRange: "2",
    downsideFloor: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
        <div className="space-y-1.5">
          <FormLabel htmlFor="ticker">Ticker</FormLabel>
          <Input id="ticker" placeholder="NVDA" value={form.ticker} onChange={set("ticker")} className="uppercase" />
        </div>
        <div className="space-y-1.5">
          <FormLabel>Direction</FormLabel>
          <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v as "bullish" | "bearish" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bullish">Bullish</SelectItem>
              <SelectItem value="bearish">Bearish</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FormLabel htmlFor="targetBase">Target (Base)</FormLabel>
          <Input id="targetBase" type="number" step="0.01" placeholder="65" value={form.targetBase} onChange={set("targetBase")} />
        </div>
        <div className="space-y-1.5">
          <FormLabel htmlFor="targetHigh">Target (High)</FormLabel>
          <Input id="targetHigh" type="number" step="0.01" placeholder="80" value={form.targetHigh} onChange={set("targetHigh")} />
        </div>
        <div className="space-y-1.5">
          <FormLabel htmlFor="horizonMonths">Horizon (mo)</FormLabel>
          <Input id="horizonMonths" type="number" step="1" placeholder="6" value={form.horizonMonths} onChange={set("horizonMonths")} />
        </div>
        <div className="space-y-1.5">
          <FormLabel htmlFor="horizonRange">Range +/-</FormLabel>
          <Input id="horizonRange" type="number" step="1" placeholder="2" value={form.horizonRange} onChange={set("horizonRange")} />
        </div>
        <div className="space-y-1.5">
          <FormLabel htmlFor="downsideFloor">Floor</FormLabel>
          <Input id="downsideFloor" type="number" step="0.01" placeholder="35" value={form.downsideFloor} onChange={set("downsideFloor")} />
        </div>
        <Button type="submit" disabled={loading || !form.ticker || !form.targetBase || !form.targetHigh || !form.downsideFloor} className="h-9">
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</> : "Analyze"}
        </Button>
      </div>
    </form>
  );
}

// ===================== CONTEXT PANEL =====================

function ContextPanel({ data }: { data: AnalysisData }) {
  const c = data.context;
  const t = data.thesis;
  const pctToBase = ((t.targetBase / c.spot - 1) * 100).toFixed(0);
  const pctToHigh = ((t.targetHigh / c.spot - 1) * 100).toFixed(0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-sm text-muted-foreground">Spot Price</div>
          <div className="text-2xl font-bold">${c.spot.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {c.dataSource === "live" ? "Live" : "Database"} &middot; {c.contractCount} contracts &middot; {c.expiryCount} expiries
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-sm text-muted-foreground">
            <Tip tip="Implied volatility divided by realized volatility. Above 1 = options are expensive relative to actual stock movement. Below 1 = options are cheap. Favor selling vol (spreads, risk reversals) when high, buying vol (naked calls) when low.">IV / RV Ratio</Tip>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              {c.ivRvRatio ? c.ivRvRatio.toFixed(2) : "N/A"}
            </span>
            {c.ivRvRatio && (
              <Badge variant={c.ivRvRatio > 1.15 ? "destructive" : c.ivRvRatio < 0.9 ? "default" : "secondary"}>
                {c.ivRvRatio > 1 ? "Expensive" : "Cheap"}
              </Badge>
            )}
            {data.volRank.ivRank !== null && (
              <span className="text-xs text-muted-foreground">
                Rank: {(data.volRank.ivRank * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            IV30: {c.iv30 ? (c.iv30 * 100).toFixed(1) + "%" : "—"} &middot; RV20: {c.rv20 ? (c.rv20 * 100).toFixed(1) + "%" : "—"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-sm text-muted-foreground">Thesis</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">${t.targetBase}</span>
            <span className="text-sm text-muted-foreground">/ ${t.targetHigh}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            +{pctToBase}% base &middot; +{pctToHigh}% high &middot; Floor ${t.downsideFloor}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="text-sm text-muted-foreground">Vol Surface</div>
          <div className="text-sm font-medium mt-1">{c.smileAnalysis.smileDescription}</div>
          <div className="text-xs text-muted-foreground mt-1">
            ATM IV: {(c.smileAnalysis.atmIv * 100).toFixed(1)}% &middot; Put richness: {c.putSkewAnalysis.putSkewRichness.toFixed(2)}x
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===================== VOL SMILE CHART =====================

const CALL_COLOR = "#2563eb"; // blue-600
const PUT_COLOR = "#dc2626";  // red-600
const EDGE_COLOR = "#2563eb";
const OI_COLOR = "#a1a1aa";   // zinc-400

const smileConfig: ChartConfig = {
  callIv: { label: "Call IV", color: CALL_COLOR },
  putIv: { label: "Put IV", color: PUT_COLOR },
};

function VolSmileChart({ data, spot, targetBase, targetHigh, downsideFloor }: {
  data: VolSurfacePoint[];
  spot: number;
  targetBase: number;
  targetHigh: number;
  downsideFloor: number;
}) {
  // Focus on strikes from ~30% below floor to ~20% above high target
  // Cap extreme IVs so deep OTM options don't blow the axis
  const minStrike = Math.min(downsideFloor, spot) * 0.7;
  const maxStrike = Math.max(targetHigh, spot) * 1.3;
  const ivCap = 200; // cap at 200% IV

  const chartData = useMemo(() =>
    data
      .filter((d) => d.strike >= minStrike && d.strike <= maxStrike && (d.callIv || d.putIv))
      .map((d) => ({
        strike: d.strike,
        callIv: d.callIv ? Math.min(+(d.callIv * 100).toFixed(1), ivCap) : null,
        putIv: d.putIv ? Math.min(+(d.putIv * 100).toFixed(1), ivCap) : null,
      })),
    [data, minStrike, maxStrike]
  );

  // Compute a sensible Y domain from the visible data
  const allIvs = chartData.flatMap(d => [d.callIv, d.putIv].filter(Boolean) as number[]);
  const yMin = Math.max(0, Math.floor((Math.min(...allIvs) - 5) / 5) * 5);
  const yMax = Math.ceil((Math.max(...allIvs) + 5) / 5) * 5;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Implied Volatility Smile</CardTitle>
        <CardDescription>IV by strike — call and put skew shape</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={smileConfig} className="h-[300px] w-full">
          <LineChart data={chartData} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
            <XAxis
              dataKey="strike"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={[yMin, yMax]}
              tickFormatter={(v) => `${v}%`}
              width={48}
            />
            <ChartTooltip
              content={<ChartTooltipContent formatter={(value) => `${value}%`} />}
            />
            <ReferenceLine x={spot} stroke="hsl(var(--foreground))" strokeDasharray="4 4" strokeWidth={1.5}>
              <Label value="Spot" position="top" fontSize={10} fill="hsl(var(--foreground))" />
            </ReferenceLine>
            <ReferenceLine x={targetBase} stroke="hsl(142 71% 45%)" strokeDasharray="3 3" strokeWidth={1}>
              <Label value="Base" position="top" fontSize={10} fill="hsl(142 71% 45%)" />
            </ReferenceLine>
            <ReferenceLine x={targetHigh} stroke="hsl(142 71% 45%)" strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.6}>
              <Label value="High" position="top" fontSize={10} fill="hsl(142 71% 45%)" />
            </ReferenceLine>
            <ReferenceLine x={downsideFloor} stroke="hsl(0 84% 60%)" strokeDasharray="3 3" strokeWidth={1}>
              <Label value="Floor" position="top" fontSize={10} fill="hsl(0 84% 60%)" />
            </ReferenceLine>
            <Line type="monotone" dataKey="callIv" stroke={CALL_COLOR} strokeWidth={2.5} dot={false} connectNulls name="Call IV" />
            <Line type="monotone" dataKey="putIv" stroke={PUT_COLOR} strokeWidth={2.5} dot={false} connectNulls name="Put IV" />
            <Legend verticalAlign="top" height={28} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ===================== TERM STRUCTURE CHART =====================

const EXPIRY_COLORS = ["#2563eb", "#dc2626", "#f59e0b", "#10b981", "#8b5cf6"];

function TermStructureChart({ data }: { data: AnalysisData }) {
  const ts = data.termStructure;
  const expiries = data.expiries;
  const spot = data.context.spot;
  const { targetBase, targetHigh, downsideFloor } = data.thesis;

  if (!ts || ts.length === 0 || expiries.length < 2) return null;

  const minStrike = Math.min(downsideFloor, spot) * 0.8;
  const maxStrike = Math.max(targetHigh, spot) * 1.3;

  const chartData = useMemo(() =>
    ts
      .filter(row => row.strike >= minStrike && row.strike <= maxStrike)
      .map(row => {
        const point: Record<string, number | null> = { strike: row.strike };
        row.expiries.forEach((exp, i) => {
          point[`callIv_${i}`] = exp.callIv ? +(exp.callIv * 100).toFixed(1) : null;
        });
        return point;
      }),
    [ts, minStrike, maxStrike]
  );

  const allIvs = chartData.flatMap(d =>
    expiries.map((_, i) => d[`callIv_${i}`]).filter(Boolean) as number[]
  );
  if (allIvs.length === 0) return null;
  const yMin = Math.max(0, Math.floor((Math.min(...allIvs) - 5) / 5) * 5);
  const yMax = Math.ceil((Math.max(...allIvs) + 5) / 5) * 5;

  const config: ChartConfig = {};
  expiries.forEach((exp, i) => {
    config[`callIv_${i}`] = {
      label: `${exp.expiry.slice(0, 10)} (${exp.dte}d)`,
      color: EXPIRY_COLORS[i % EXPIRY_COLORS.length]!,
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          <Tip tip="Shows how implied volatility varies by strike AND by expiry. If one expiry's line is consistently below another at the same strike, that expiry's options are cheaper in vol terms. Useful for choosing which expiry to trade.">
            IV Term Structure by Strike
          </Tip>
        </CardTitle>
        <CardDescription>Call IV across expiries — compare where each tenor is cheap or expensive</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <LineChart data={chartData} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
            <XAxis
              dataKey="strike"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={[yMin, yMax]}
              tickFormatter={(v) => `${v}%`}
              width={48}
            />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${value}%`} />} />
            <ReferenceLine x={spot} stroke="hsl(var(--foreground))" strokeDasharray="4 4" strokeWidth={1.5}>
              <Label value="Spot" position="top" fontSize={10} fill="hsl(var(--foreground))" />
            </ReferenceLine>
            <ReferenceLine x={targetBase} stroke="hsl(142 71% 45%)" strokeDasharray="3 3" strokeWidth={1}>
              <Label value="Base" position="top" fontSize={10} fill="hsl(142 71% 45%)" />
            </ReferenceLine>
            {expiries.map((exp, i) => (
              <Line
                key={i}
                type="monotone"
                dataKey={`callIv_${i}`}
                stroke={EXPIRY_COLORS[i % EXPIRY_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
                name={`${exp.expiry.slice(5, 10)} (${exp.dte}d)`}
              />
            ))}
            <Legend verticalAlign="top" height={28} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ===================== EDGE RATIO CHART =====================

const edgeConfig: ChartConfig = {
  edgeRatio: { label: "Edge Ratio", color: EDGE_COLOR },
  openInterest: { label: "Open Interest", color: OI_COLOR },
};

function EdgeRatioChart({ data, spot, targetBase, targetHigh }: {
  data: VolSurfacePoint[];
  spot: number;
  targetBase: number;
  targetHigh: number;
}) {
  const minStrike = spot * 0.85;
  const maxStrike = Math.max(targetHigh, spot) * 1.3;

  const chartData = useMemo(() =>
    data
      .filter((d) => d.callEdgeRatio && d.callEdgeRatio > 0 && d.strike >= minStrike && d.strike <= maxStrike)
      .map((d) => ({
        strike: d.strike,
        edgeRatio: +(d.callEdgeRatio!).toFixed(2),
        openInterest: d.callOi,
      })),
    [data, minStrike, maxStrike]
  );

  const peakEdge = chartData.reduce((best, d) =>
    d.edgeRatio > (best?.edgeRatio ?? 0) ? d : best,
    chartData[0]
  );

  const maxEdge = peakEdge ? Math.ceil(peakEdge.edgeRatio + 1) : 10;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Edge Ratio by Strike</CardTitle>
        <CardDescription>
          Thesis value / market price — peaks at optimal long strike
          {peakEdge && <span className="ml-1 font-medium">(${peakEdge.strike}, {peakEdge.edgeRatio}x)</span>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={edgeConfig} className="h-[300px] w-full">
          <ComposedChart data={chartData} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
            <XAxis
              dataKey="strike"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="edge"
              tick={{ fontSize: 11 }}
              domain={[0, maxEdge]}
              tickFormatter={(v) => `${v}x`}
              width={40}
            />
            <YAxis
              yAxisId="oi"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              width={40}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.3}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ReferenceLine yAxisId="edge" y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1}>
              <Label value="Fair (1x)" position="left" fontSize={9} fill="hsl(var(--muted-foreground))" />
            </ReferenceLine>
            <ReferenceLine yAxisId="edge" x={spot} stroke="hsl(var(--foreground))" strokeDasharray="4 4" strokeWidth={1.5}>
              <Label value="Spot" position="top" fontSize={10} fill="hsl(var(--foreground))" />
            </ReferenceLine>
            {peakEdge && (
              <ReferenceLine yAxisId="edge" x={peakEdge.strike} stroke={EDGE_COLOR} strokeDasharray="2 2" strokeWidth={1}>
                <Label value="Peak" position="top" fontSize={10} fill={EDGE_COLOR} />
              </ReferenceLine>
            )}
            <Bar yAxisId="oi" dataKey="openInterest" fill={OI_COLOR} opacity={0.15} radius={[2, 2, 0, 0]} />
            <Area yAxisId="edge" type="monotone" dataKey="edgeRatio" stroke={EDGE_COLOR} strokeWidth={2.5} fill={EDGE_COLOR} fillOpacity={0.12} dot={false} />
            <Legend verticalAlign="top" height={28} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ===================== VOL HISTORY CHART =====================

const volHistConfig: ChartConfig = {
  iv30: { label: "IV30", color: CALL_COLOR },
  rv20: { label: "RV20", color: "#f59e0b" }, // amber-500
};

function VolHistoryChart({ data, volRank }: {
  data: AnalysisData;
  volRank: AnalysisData["volRank"];
}) {
  const chartData = useMemo(() =>
    data.volHistory
      .filter(h => h.iv30 || h.rv20)
      .map(h => ({
        date: h.date,
        iv30: h.iv30 ? +(h.iv30 * 100).toFixed(1) : null,
        rv20: h.rv20 ? +(h.rv20 * 100).toFixed(1) : null,
      })),
    [data.volHistory]
  );

  if (chartData.length < 5) return null;

  const allVals = chartData.flatMap(d => [d.iv30, d.rv20].filter(Boolean) as number[]);
  const yMax = Math.min(Math.ceil((Math.max(...allVals) + 5) / 10) * 10, 200);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">IV vs Realized Vol History</CardTitle>
            <CardDescription>
              Implied and realized volatility over time
            </CardDescription>
          </div>
          {volRank.ivRank !== null && (
            <div className="flex gap-3 text-xs">
              <div className="text-right">
                <div className="text-muted-foreground">IV Rank</div>
                <div className="font-mono font-bold text-sm">{(volRank.ivRank * 100).toFixed(0)}%</div>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground">IV Percentile</div>
                <div className="font-mono font-bold text-sm">{((volRank.ivPercentile ?? 0) * 100).toFixed(0)}%</div>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground">IV Range</div>
                <div className="font-mono text-sm">
                  {((volRank.iv52Low ?? 0) * 100).toFixed(0)}%-{((volRank.iv52High ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={volHistConfig} className="h-[260px] w-full">
          <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="ivGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CALL_COLOR} stopOpacity={0.2} />
                <stop offset="100%" stopColor={CALL_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rvGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => {
                const d = new Date(v);
                return `${d.toLocaleString("default", { month: "short" })} '${String(d.getFullYear()).slice(2)}`;
              }}
              interval="preserveStartEnd"
              minTickGap={60}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={[0, yMax]}
              tickFormatter={(v) => `${v}%`}
              width={44}
            />
            <ChartTooltip
              content={<ChartTooltipContent
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                formatter={(value) => `${value}%`}
              />}
            />
            <Area type="monotone" dataKey="iv30" stroke={CALL_COLOR} fill="url(#ivGrad)" strokeWidth={2} dot={false} connectNulls name="IV30" />
            <Area type="monotone" dataKey="rv20" stroke="#f59e0b" fill="url(#rvGrad)" strokeWidth={2} dot={false} connectNulls name="RV20" />
            <Legend verticalAlign="top" height={28} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ===================== PAYOFF CHART =====================

const payoffConfig: ChartConfig = {
  pnl: { label: "P&L", color: "hsl(var(--chart-1))" },
};

function PayoffChart({ strategy, spot, targetBase, targetHigh, downsideFloor }: {
  strategy: Strategy;
  spot: number;
  targetBase: number;
  targetHigh: number;
  downsideFloor: number;
}) {
  const chartData = useMemo(() => {
    const allStrikes = strategy.legs.map((l) => l.strike);
    const minPrice = Math.min(...allStrikes, downsideFloor, spot) * 0.7;
    const maxPrice = Math.max(...allStrikes, targetHigh, spot) * 1.3;
    const step = (maxPrice - minPrice) / 120;
    const points: Array<{ price: number; pnl: number; profit: number | null; loss: number | null }> = [];

    for (let price = minPrice; price <= maxPrice; price += step) {
      let pnl = 0;
      for (const leg of strategy.legs) {
        const intrinsic = leg.type === "call"
          ? Math.max(price - leg.strike, 0)
          : Math.max(leg.strike - price, 0);
        pnl += leg.action === "buy"
          ? intrinsic - leg.marketPrice
          : leg.marketPrice - intrinsic;
      }
      const rounded = +pnl.toFixed(2);
      points.push({
        price: +price.toFixed(2),
        pnl: rounded,
        profit: rounded >= 0 ? rounded : null,
        loss: rounded < 0 ? rounded : null,
      });
    }
    return points;
  }, [strategy, spot, targetHigh, downsideFloor]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Payoff at Expiry</CardTitle>
        <CardDescription>{strategy.label} &middot; {strategy.dte} DTE</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={payoffConfig} className="h-[300px] w-full">
          <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
            <defs>
              <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={0.02} />
                <stop offset="100%" stopColor="hsl(0 84% 60%)" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
            <XAxis
              dataKey="price"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
              domain={["dataMin", "dataMax"]}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
              width={48}
            />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => `$${value}`} />} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
            <ReferenceLine x={spot} stroke="hsl(var(--foreground))" strokeDasharray="4 4" strokeWidth={1.5}>
              <Label value="Spot" position="top" fontSize={10} fill="hsl(var(--foreground))" />
            </ReferenceLine>
            <ReferenceLine x={targetBase} stroke="hsl(142 71% 45%)" strokeDasharray="3 3" strokeWidth={1}>
              <Label value="Base" position="top" fontSize={10} fill="hsl(142 71% 45%)" />
            </ReferenceLine>
            <ReferenceLine x={targetHigh} stroke="hsl(142 71% 45%)" strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.6}>
              <Label value="High" position="top" fontSize={10} fill="hsl(142 71% 45%)" />
            </ReferenceLine>
            <ReferenceLine x={strategy.breakeven} stroke="hsl(var(--foreground))" strokeDasharray="2 2" strokeWidth={1} strokeOpacity={0.5}>
              <Label value="BE" position="bottom" fontSize={9} fill="hsl(var(--muted-foreground))" />
            </ReferenceLine>
            <Area type="monotone" dataKey="profit" stroke="hsl(142 71% 45%)" fill="url(#profitGrad)" strokeWidth={2.5} connectNulls={false} dot={false} />
            <Area type="monotone" dataKey="loss" stroke="hsl(0 84% 60%)" fill="url(#lossGrad)" strokeWidth={2.5} connectNulls={false} dot={false} />
            <Line type="monotone" dataKey="pnl" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} opacity={0.7} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ===================== NARRATIVE SECTIONS =====================

function NarrativePanel({ narrative }: { narrative: AnalysisData["narrative"] }) {
  return (
    <div className="space-y-4">
      {/* Vol context + Structure guidance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Volatility Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{narrative.volContext}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{narrative.structureGuidance}</p>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recommendations</CardTitle>
          <CardDescription>How to choose between structure types based on your priorities</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {narrative.recommendations.map((rec, i) => (
            <div key={i} className="border-l-2 border-foreground/20 pl-4">
              <h4 className="text-sm font-semibold mb-1">{rec.title}</h4>
              <p className="text-sm leading-relaxed text-muted-foreground">{rec.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Key Risks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Key Risks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm leading-relaxed text-muted-foreground prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{
              __html: narrative.keyRisks
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\((\d+)\)/g, '<br/><span class="font-medium text-foreground">($1)</span>')
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ===================== STRATEGY TABLE =====================

const TYPE_LABELS: Record<string, string> = {
  naked_call: "Naked Call",
  call_spread: "Call Spread",
  risk_reversal: "Risk Reversal",
  butterfly: "Butterfly",
};

const TYPE_COLORS: Record<string, string> = {
  naked_call: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  call_spread: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  risk_reversal: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  butterfly: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

function StrategyTable({
  strategies,
  selectedIdx,
  onSelect,
}: {
  strategies: Strategy[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ranked Strategies</CardTitle>
        <CardDescription>Click a row to see payoff diagram and details</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="text-left px-4 py-2 font-medium">#</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Structure</th>
                <th className="text-right px-4 py-2 font-medium"><Tip tip="Days to expiration. Shorter DTE = less time for thesis to play out but less vega exposure. Longer = more time but higher premium.">DTE</Tip></th>
                <th className="text-right px-4 py-2 font-medium"><Tip tip="Net premium paid per share. Multiply by 100 for per-contract cost. For risk reversals, this is the call spread cost minus put premium received.">Net Cost</Tip></th>
                <th className="text-right px-4 py-2 font-medium"><Tip tip="P&L per share if the stock reaches your base case target at expiry.">@Base</Tip></th>
                <th className="text-right px-4 py-2 font-medium"><Tip tip="P&L per share if the stock reaches your high case target at expiry. For capped structures (spreads, butterflies), this may equal @Base if the cap is below the high target.">@High</Tip></th>
                <th className="text-right px-4 py-2 font-medium"><Tip tip="Return on risk at base case: payoff divided by capital at risk. For spreads this is payoff / net debit. For risk reversals it includes estimated margin on the short put.">RoR</Tip></th>
                <th className="text-right px-4 py-2 font-medium"><Tip tip="Annualized return on risk: RoR scaled to a 365-day basis. Rewards shorter-dated structures that deliver the same return faster. Linear scaling (not compounded).">Ann. RoR</Tip></th>
                <th className="text-right px-4 py-2 font-medium"><Tip tip="Edge ratio: your thesis-implied expected value divided by what the market charges. Above 1 = your thesis values this option higher than the market does. Peak edge = optimal strike per Campbell framework.">Edge</Tip></th>
                <th className="text-right px-4 py-2 font-medium"><Tip tip="Liquidity score based on open interest and volume at each strike. Higher = easier to fill at fair prices.">Liq.</Tip></th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s, i) => (
                <tr
                  key={i}
                  className={`border-b cursor-pointer transition-colors hover:bg-muted/50 ${selectedIdx === i ? "bg-muted" : ""}`}
                  onClick={() => onSelect(i)}
                >
                  <td className="px-4 py-2 font-medium">{s.rank}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[s.type]}`}>
                      {TYPE_LABELS[s.type]}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{s.label}</td>
                  <td className="text-right px-4 py-2">{s.dte}</td>
                  <td className="text-right px-4 py-2 font-mono">${s.netDebit.toFixed(2)}</td>
                  <td className="text-right px-4 py-2 font-mono text-emerald-600 dark:text-emerald-400">${s.payoffAtBase.toFixed(2)}</td>
                  <td className="text-right px-4 py-2 font-mono text-emerald-600 dark:text-emerald-400">${s.payoffAtHigh.toFixed(2)}</td>
                  <td className="text-right px-4 py-2 font-mono font-medium">{s.returnOnRiskBase.toFixed(1)}x</td>
                  <td className="text-right px-4 py-2 font-mono">{s.annualizedRorBase.toFixed(1)}x</td>
                  <td className="text-right px-4 py-2 font-mono">{s.avgEdgeRatio.toFixed(1)}</td>
                  <td className="text-right px-4 py-2">
                    <div className="w-12 bg-muted rounded-full h-1.5">
                      <div className="bg-foreground rounded-full h-1.5" style={{ width: `${Math.min(s.liquidityScore * 100, 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ===================== STRATEGY DETAIL =====================

function StrategyDetail({ strategy, spot }: { strategy: Strategy; spot: number }) {
  const breakEvenPct = ((strategy.breakeven / spot - 1) * 100).toFixed(1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          <span className={`inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[strategy.type]}`}>
            {TYPE_LABELS[strategy.type]}
          </span>
          {strategy.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <div className="text-xs text-muted-foreground">Net Debit</div>
            <div className="font-mono font-medium">${strategy.netDebit.toFixed(2)} <span className="text-xs text-muted-foreground">(${(strategy.netDebit * 100).toFixed(0)}/ct)</span></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Max Profit</div>
            <div className="font-mono font-medium text-emerald-600 dark:text-emerald-400">${strategy.maxProfit.toFixed(2)} <span className="text-xs text-muted-foreground">(${(strategy.maxProfit * 100).toFixed(0)}/ct)</span></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Max Loss</div>
            <div className="font-mono font-medium text-red-600 dark:text-red-400">${strategy.maxLoss.toFixed(2)} <span className="text-xs text-muted-foreground">(${(strategy.maxLoss * 100).toFixed(0)}/ct)</span></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Breakeven</div>
            <div className="font-mono font-medium">${strategy.breakeven.toFixed(2)} <span className="text-xs text-muted-foreground">({breakEvenPct}%)</span></div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-muted-foreground"><Tip tip="Directional exposure: how much P&L changes per $1 move in the underlying. 0.5 = you make $0.50 per $1 up. Spreads have lower delta than naked calls.">Net Delta</Tip></div>
            <div className="font-mono">{strategy.netDelta.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground"><Tip tip="Volatility exposure: P&L per 1% increase in implied volatility. Positive = you benefit from vol expansion. Spreads reduce vega vs naked calls. Negative vega means vol compression helps you.">Net Vega</Tip></div>
            <div className="font-mono">{strategy.netVega.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground"><Tip tip="Time decay per day: how much value you lose each day from time passing. Negative = the position bleeds value daily. Butterflies and short options have positive theta (you earn from time decay).">Net Theta</Tip></div>
            <div className="font-mono">{strategy.netTheta.toFixed(4)}</div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Legs</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left px-2 py-1">Action</th>
                  <th className="text-right px-2 py-1">Strike</th>
                  <th className="text-left px-2 py-1">Type</th>
                  <th className="text-right px-2 py-1">IV</th>
                  <th className="text-right px-2 py-1">Market $</th>
                  <th className="text-right px-2 py-1">Thesis $</th>
                  <th className="text-right px-2 py-1">Edge</th>
                  <th className="text-right px-2 py-1">OI</th>
                </tr>
              </thead>
              <tbody>
                {strategy.legs.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className={`px-2 py-1 font-medium ${l.action === "buy" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                      {l.action.toUpperCase()}
                    </td>
                    <td className="text-right px-2 py-1 font-mono">${l.strike}</td>
                    <td className="px-2 py-1">{l.type}</td>
                    <td className="text-right px-2 py-1 font-mono">{(l.iv * 100).toFixed(1)}%</td>
                    <td className="text-right px-2 py-1 font-mono">${l.marketPrice.toFixed(2)}</td>
                    <td className="text-right px-2 py-1 font-mono">${l.thesisValue.toFixed(2)}</td>
                    <td className="text-right px-2 py-1 font-mono">{l.edgeRatio.toFixed(1)}x</td>
                    <td className="text-right px-2 py-1 font-mono">{l.openInterest.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===================== MAIN CLIENT COMPONENT =====================

// ===================== REPORT LIST TYPES =====================

interface ReportSummary {
  id: string;
  ticker: string;
  direction: string;
  targetBase: string;
  targetHigh: string;
  spot: string;
  ivRvRatio: string | null;
  ivRank: string | null;
  strategyCount: number;
  topStrategyLabel: string | null;
  topStrategyType: string | null;
  notes: string | null;
  createdAt: string;
}

// ===================== REPORT LIST =====================

function ReportList({ reports, onDelete }: { reports: ReportSummary[]; onDelete: (id: string) => void }) {
  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No saved reports yet. Run an analysis and save it, or use <code className="bg-muted px-1 rounded">/analyze-vol-curve</code> in conversation.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Saved Reports</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="text-left px-4 py-2 font-medium">Ticker</th>
                <th className="text-left px-4 py-2 font-medium">Thesis</th>
                <th className="text-right px-4 py-2 font-medium">Spot</th>
                <th className="text-right px-4 py-2 font-medium">IV/RV</th>
                <th className="text-right px-4 py-2 font-medium">IV Rank</th>
                <th className="text-left px-4 py-2 font-medium">Top Strategy</th>
                <th className="text-right px-4 py-2 font-medium">Date</th>
                <th className="text-right px-4 py-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2">
                    <Link href={`/vol-curve/${r.id}`} className="font-medium hover:underline">
                      {r.ticker}
                    </Link>
                    <Badge variant="secondary" className="ml-1.5 text-[10px]">
                      {r.direction}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    ${parseFloat(r.targetBase).toFixed(0)} / ${parseFloat(r.targetHigh).toFixed(0)}
                  </td>
                  <td className="text-right px-4 py-2 font-mono">${parseFloat(r.spot).toFixed(2)}</td>
                  <td className="text-right px-4 py-2 font-mono">
                    {r.ivRvRatio ? parseFloat(r.ivRvRatio).toFixed(2) : "—"}
                  </td>
                  <td className="text-right px-4 py-2 font-mono">
                    {r.ivRank ? `${(parseFloat(r.ivRank) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono">{r.topStrategyLabel || "—"}</td>
                  <td className="text-right px-4 py-2 text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-right px-4 py-1">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/vol-curve/${r.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ===================== MAIN CLIENT COMPONENT =====================

export function VolCurveClient() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<number | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Load saved reports on mount
  const loadReports = useCallback(async () => {
    try {
      const resp = await fetch("/api/vol-curve/reports");
      if (resp.ok) setReports(await resp.json());
    } catch {}
  }, []);

  useState(() => { loadReports(); });

  const saveReport = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    try {
      const resp = await fetch("/api/vol-curve/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportData: data }),
      });
      if (resp.ok) {
        const { id } = await resp.json();
        setSavedId(id);
        loadReports();
      }
    } catch {} finally {
      setSaving(false);
    }
  }, [data, loadReports]);

  const deleteReport = useCallback(async (id: string) => {
    try {
      await fetch(`/api/vol-curve/reports/${id}`, { method: "DELETE" });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch {}
  }, []);

  const runAnalysis = useCallback(async (form: FormState) => {
    setSavedId(null);
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedStrategy(null);

    try {
      const params = new URLSearchParams({
        ticker: form.ticker.toUpperCase(),
        direction: form.direction,
        targetBase: form.targetBase,
        targetHigh: form.targetHigh,
        horizonMonths: form.horizonMonths,
        horizonRange: form.horizonRange,
        downsideFloor: form.downsideFloor,
      });

      const resp = await fetch(`/api/vol-curve?${params}`);
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || "Analysis failed");
      }

      const result: AnalysisData = await resp.json();
      setData(result);
      if (result.strategies.length > 0) {
        setSelectedStrategy(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const selected = data && selectedStrategy !== null ? data.strategies[selectedStrategy] : null;

  return (
    <div className="space-y-4">
      {/* Input Form */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <AnalysisForm onSubmit={runAnalysis} loading={loading} />
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Fetching options chain and running analysis...</p>
            <p className="text-xs text-muted-foreground">This may take 10-20 seconds for live data</p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Saved Reports */}
      <ReportList reports={reports} onDelete={deleteReport} />

      {/* Results */}
      {data && (
        <>
          {/* Save bar */}
          <Card>
            <CardContent className="pt-3 pb-3 px-4 flex items-center justify-between">
              <div className="text-sm font-medium">
                {data.context.ticker} — {data.strategies.length} strategies analyzed
              </div>
              <div className="flex items-center gap-2">
                {savedId ? (
                  <Link href={`/vol-curve/${savedId}`}>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      View Saved Report
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" onClick={saveReport} disabled={saving}>
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                    Save Report
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Context */}
          <ContextPanel data={data} />

          {/* Assessment */}
          <Card>
            <CardContent className="pt-4 pb-3 px-4 space-y-1">
              <div className="text-sm font-medium">{data.context.ivRvAssessment}</div>
              <div className="text-sm text-muted-foreground">{data.context.putSkewAnalysis.description}</div>
            </CardContent>
          </Card>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <VolSmileChart
              data={data.volSurface}
              spot={data.context.spot}
              targetBase={data.thesis.targetBase}
              targetHigh={data.thesis.targetHigh}
              downsideFloor={data.thesis.downsideFloor}
            />
            <EdgeRatioChart data={data.volSurface} spot={data.context.spot} targetBase={data.thesis.targetBase} targetHigh={data.thesis.targetHigh} />
          </div>

          {/* Term Structure + Vol History side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TermStructureChart data={data} />
            {data.volHistory.length > 5 && (
              <VolHistoryChart data={data} volRank={data.volRank} />
            )}
          </div>

          {/* Narrative Analysis */}
          {data.narrative && (
            <NarrativePanel narrative={data.narrative} />
          )}

          {/* Strategy Table */}
          <StrategyTable
            strategies={data.strategies}
            selectedIdx={selectedStrategy}
            onSelect={setSelectedStrategy}
          />

          {/* Selected Strategy Detail + Payoff */}
          {selected && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PayoffChart
                strategy={selected}
                spot={data.context.spot}
                targetBase={data.thesis.targetBase}
                targetHigh={data.thesis.targetHigh}
                downsideFloor={data.thesis.downsideFloor}
              />
              <StrategyDetail strategy={selected} spot={data.context.spot} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===================== STANDALONE REPORT VIEW (for detail pages) =====================

export function AnalysisResultsView({ data }: { data: AnalysisData }) {
  const [selectedStrategy, setSelectedStrategy] = useState<number | null>(
    data.strategies.length > 0 ? 0 : null
  );
  const selected = selectedStrategy !== null ? data.strategies[selectedStrategy] : null;

  return (
    <div className="space-y-4">
      <ContextPanel data={data} />

      <Card>
        <CardContent className="pt-4 pb-3 px-4 space-y-1">
          <div className="text-sm font-medium">{data.context.ivRvAssessment}</div>
          <div className="text-sm text-muted-foreground">{data.context.putSkewAnalysis.description}</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VolSmileChart
          data={data.volSurface}
          spot={data.context.spot}
          targetBase={data.thesis.targetBase}
          targetHigh={data.thesis.targetHigh}
          downsideFloor={data.thesis.downsideFloor}
        />
        <EdgeRatioChart data={data.volSurface} spot={data.context.spot} targetBase={data.thesis.targetBase} targetHigh={data.thesis.targetHigh} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TermStructureChart data={data} />
        {data.volHistory && data.volHistory.length > 5 && (
          <VolHistoryChart data={data} volRank={data.volRank} />
        )}
      </div>

      {data.narrative && (
        <NarrativePanel narrative={data.narrative} />
      )}

      <StrategyTable
        strategies={data.strategies}
        selectedIdx={selectedStrategy}
        onSelect={setSelectedStrategy}
      />

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PayoffChart
            strategy={selected}
            spot={data.context.spot}
            targetBase={data.thesis.targetBase}
            targetHigh={data.thesis.targetHigh}
            downsideFloor={data.thesis.downsideFloor}
          />
          <StrategyDetail strategy={selected} spot={data.context.spot} />
        </div>
      )}
    </div>
  );
}

// Export types for detail page
export type { AnalysisData };
