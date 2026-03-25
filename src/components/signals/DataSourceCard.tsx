"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap, Activity, Database, ExternalLink } from "lucide-react";

export type DataSourceCategory = "price" | "fundamental" | "economic" | "sentiment" | "qualitative" | "derived" | "internal";
export type MeasureType = "quantitative" | "qualitative";
export type IngestionMethod = "automated_cron" | "automated_derived" | "manual_skill" | "manual_cdp";

export interface AvailableMetric {
  metric: string;
  unit: string;
  description: string;
}

export interface DataSourceRow {
  id: string;
  key: string;
  name: string;
  description: string;
  category: DataSourceCategory;
  measureType: MeasureType;
  availableMetrics: AvailableMetric[];
  assetScope: string;
  ingestionMethod: IngestionMethod;
  ingestionScript: string | null;
  ingestionSchedule: string | null;
  sourceUrl: string | null;
  activeSignals: number;
  totalSnapshots: number;
  lastSnapshot: string | null;
}

const CATEGORY_COLORS: Record<DataSourceCategory, string> = {
  price: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  fundamental: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  economic: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sentiment: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  qualitative: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  derived: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  internal: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
};

const MEASURE_TYPE_COLORS: Record<MeasureType, string> = {
  quantitative: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  qualitative: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

const INGESTION_LABELS: Record<IngestionMethod, { label: string; icon: typeof Zap }> = {
  automated_cron: { label: "Automated (cron)", icon: Clock },
  automated_derived: { label: "Automated (derived)", icon: Activity },
  manual_skill: { label: "Manual (skill)", icon: Zap },
  manual_cdp: { label: "Manual (CDP)", icon: Database },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "< 1h ago";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DataSourceCard({ source }: { source: DataSourceRow }) {
  const ingestion = INGESTION_LABELS[source.ingestionMethod];
  const IngestionIcon = ingestion.icon;
  const metrics = Array.isArray(source.availableMetrics) ? source.availableMetrics : [];

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="gap-1.5 pb-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`border-transparent ${CATEGORY_COLORS[source.category]}`}>
            {source.category}
          </Badge>
          <Badge className={`border-transparent ${MEASURE_TYPE_COLORS[source.measureType]}`}>
            {source.measureType}
          </Badge>
        </div>
        <CardTitle className="text-base">
          {source.sourceUrl ? (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              {source.name}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          ) : (
            source.name
          )}
        </CardTitle>
        <CardDescription>{source.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {metrics.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Available Metrics</p>
            <div className="space-y-1">
              {metrics.map((m) => (
                <div key={m.metric} className="flex items-baseline gap-2 text-sm">
                  <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono shrink-0">
                    {m.metric}
                  </code>
                  <span className="text-muted-foreground text-xs truncate">{m.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IngestionIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{ingestion.label}</span>
          {source.ingestionSchedule && (
            <span className="text-xs">({source.ingestionSchedule})</span>
          )}
        </div>
      </CardContent>

      <CardFooter className="gap-4 text-xs text-muted-foreground border-t pt-3">
        <span>
          <span className="font-medium text-foreground">{source.activeSignals}</span> active signal{source.activeSignals !== 1 ? "s" : ""}
        </span>
        <span>
          <span className="font-medium text-foreground">{source.totalSnapshots.toLocaleString()}</span> snapshot{source.totalSnapshots !== 1 ? "s" : ""}
        </span>
        {source.lastSnapshot && (
          <span className="ml-auto">
            Last: {formatRelativeTime(source.lastSnapshot)}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
