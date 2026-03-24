'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntelItem {
  id: string;
  sourceKey: string;
  headline: string;
  body: string | null;
  severity: string;
  tickers: string[];
  occurredAt: Date | string;
  processingStatus: string;
  processingResult: string | null;
}

interface IntelPanelProps {
  items: IntelItem[];
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Config & constants
// ---------------------------------------------------------------------------

const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  finnhub_analyst: { label: 'Analyst', color: 'text-purple-400' },
  sec_edgar: { label: 'SEC', color: 'text-amber-400' },
  economic_calendar: { label: 'Econ', color: 'text-sky-400' },
  earnings_calendar: { label: 'Earnings', color: 'text-emerald-400' },
  insider_transaction: { label: 'Insider', color: 'text-orange-400' },
  world_monitor: { label: 'World', color: 'text-blue-400' },
  thesis_monitor: { label: 'Thesis', color: 'text-violet-400' },
};

const SEVERITY_CONFIG: Record<string, { dot: string; label: string }> = {
  critical: { dot: 'bg-red-500', label: 'Critical' },
  high: { dot: 'bg-amber-500', label: 'High' },
  medium: { dot: 'bg-blue-500', label: 'Medium' },
  info: { dot: 'bg-gray-400', label: 'Info' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w`;
  return new Date(date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function IntelPanelSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-1.5"
        >
          <div className="h-4 w-6 rounded bg-muted animate-pulse" />
          <div className="h-3 w-6 rounded bg-muted animate-pulse" />
          <div className="h-2 w-2 rounded-full bg-muted animate-pulse" />
          <div className="h-3 flex-1 rounded bg-muted animate-pulse" />
          <div className="h-4 w-12 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function IntelRow({ item }: { item: IntelItem }) {
  const [expanded, setExpanded] = useState(false);
  const source = SOURCE_CONFIG[item.sourceKey] || { label: item.sourceKey.slice(0, 6), color: 'text-muted-foreground' };
  const severity = SEVERITY_CONFIG[item.severity] || { dot: 'bg-gray-400', label: 'Info' };
  const occurredDate = item.occurredAt instanceof Date ? item.occurredAt : new Date(item.occurredAt);
  const hasBody = !!item.body;

  // Processing badge logic
  let processingBadge: React.ReactNode = null;
  if (item.processingStatus === 'pending') {
    processingBadge = (
      <span className="text-[10px] text-muted-foreground/60">Pending</span>
    );
  } else if (item.processingResult === 'signal_evidence') {
    processingBadge = <ProvenanceBadge source="automation" detail="Signal Evidence" />;
  } else if (item.processingResult === 'claim_candidate') {
    processingBadge = <ProvenanceBadge source="automation" detail="Claim Candidate" />;
  }
  // processingResult === 'contextual' or null → no badge

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
          hasBody && 'cursor-pointer hover:bg-accent/50',
          expanded && 'bg-accent/30',
        )}
        onClick={() => hasBody && setExpanded(!expanded)}
      >
        {/* Source label */}
        <span className={cn('shrink-0 w-12 text-[11px] font-medium truncate', source.color)}>
          {source.label}
        </span>

        {/* Time ago */}
        <span className="shrink-0 w-7 text-[11px] font-mono text-muted-foreground text-right">
          {getTimeAgo(occurredDate)}
        </span>

        {/* Severity dot with title tooltip */}
        <span
          className={cn('shrink-0 h-1.5 w-1.5 rounded-full', severity.dot)}
          title={severity.label}
        />

        {/* Headline */}
        <span className="min-w-0 truncate text-foreground">{item.headline}</span>

        {/* Processing badge */}
        {processingBadge && (
          <span className="shrink-0">{processingBadge}</span>
        )}

        {/* Tickers */}
        {item.tickers.length > 0 && (
          <div className="shrink-0 flex items-center gap-1">
            {item.tickers.map((t) => (
              <span
                key={t}
                className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Chevron */}
        <div className="shrink-0 w-4 flex justify-center">
          {hasBody && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="p-0.5 text-muted-foreground/40 hover:text-foreground"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && item.body && (
        <div className="pl-[72px] pr-3 pb-2 bg-accent/20">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{item.body}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IntelPanel({ items, isLoading }: IntelPanelProps) {
  if (isLoading) {
    return <IntelPanelSkeleton />;
  }

  if (items.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        No intel items for this thesis yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <IntelRow key={item.id} item={item} />
      ))}
    </div>
  );
}
