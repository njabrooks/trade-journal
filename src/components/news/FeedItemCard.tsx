'use client';

import { useState } from 'react';
import {
  Globe,
  Target,
  FileText,
  Calendar,
  BarChart3,
  Scale,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeedItem, FeedItemSource } from '@/db/queries/unifiedFeed';

// ---------------------------------------------------------------------------
// Source config
// ---------------------------------------------------------------------------

const SOURCE_CONFIG: Record<FeedItemSource, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  colour: string;
}> = {
  world_monitor: { icon: Globe, label: 'World Monitor', colour: 'text-blue-500' },
  thesis_monitor: { icon: Target, label: 'Thesis Monitor', colour: 'text-purple-500' },
  sec_filing: { icon: FileText, label: 'SEC Filing', colour: 'text-indigo-500' },
  economic_event: { icon: Calendar, label: 'Economic', colour: 'text-amber-500' },
  earnings_event: { icon: BarChart3, label: 'Earnings', colour: 'text-green-500' },
  claim_evidence: { icon: Scale, label: 'Evidence', colour: 'text-orange-500' },
  quant_snapshot: { icon: TrendingUp, label: 'Quant', colour: 'text-cyan-500' },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-600 dark:text-red-400',
  high: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  info: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
};

const ASSESSMENT_STYLES: Record<string, string> = {
  strengthening: 'bg-green-500/15 text-green-600 dark:text-green-400',
  confirmed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  weakening: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  invalidated: 'bg-red-500/15 text-red-600 dark:text-red-400',
  neutral: 'bg-muted text-muted-foreground',
};

const IMPACT_STYLES: Record<string, string> = {
  high: 'bg-red-500/15 text-red-600 dark:text-red-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  low: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FeedItemCardProps {
  item: FeedItem;
}

export function FeedItemCard({ item }: FeedItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = SOURCE_CONFIG[item.source];
  const Icon = config.icon;

  const hasExpandableContent = !!(
    item.body ||
    (item.sourceUrls && item.sourceUrls.length > 0) ||
    (item.tickers && item.tickers.length > 3) ||
    item.observedValue !== undefined
  );

  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-4 py-3 transition-colors',
        hasExpandableContent && 'cursor-pointer hover:bg-accent/50'
      )}
      onClick={() => hasExpandableContent && setExpanded(!expanded)}
    >
      {/* Row 1: Source + timestamp + badges */}
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', config.colour)} />
        <span className="text-xs text-muted-foreground">{config.label}</span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{getTimeAgo(new Date(item.timestamp))}</span>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Severity badge */}
          {item.severity && (
            <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded', SEVERITY_STYLES[item.severity])}>
              {item.severity}
            </span>
          )}

          {/* Impact badge (economic events) */}
          {item.impactLevel && !item.severity && (
            <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded', IMPACT_STYLES[item.impactLevel])}>
              {item.impactLevel}
            </span>
          )}

          {/* Assessment badge */}
          {item.assessment && (
            <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded', ASSESSMENT_STYLES[item.assessment])}>
              {item.assessment}
            </span>
          )}

          {/* Material badge (SEC filings) */}
          {item.isMaterial && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-destructive/10 text-destructive border border-destructive/20">
              Material
            </span>
          )}

          {/* Filing type badge */}
          {item.filingType && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              {item.filingType}
            </span>
          )}

          {/* Expand chevron */}
          {hasExpandableContent && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Headline */}
      <p className={cn('text-sm font-medium text-foreground', !expanded && 'line-clamp-1')}>
        {item.headline}
      </p>

      {/* Row 3: Quant data inline (for quant snapshots) */}
      {item.source === 'quant_snapshot' && item.observedValue !== undefined && (
        <div className="flex items-center gap-2 mt-1 text-xs">
          <span className="text-muted-foreground">
            {item.observedValue}{item.unit ? ` ${item.unit}` : ''}
          </span>
          {item.thresholdValue !== undefined && (
            <>
              <span className="text-muted-foreground">→</span>
              <span className="text-muted-foreground">
                {item.thresholdValue}{item.unit ? ` ${item.unit}` : ''}
              </span>
            </>
          )}
          {item.pctToThreshold !== undefined && (
            <span className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              item.pctToThreshold >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {item.pctToThreshold >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(item.pctToThreshold).toFixed(1)}%
            </span>
          )}
        </div>
      )}

      {/* Row 4: Entity pills + tickers (compact) */}
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        {item.signalStatement && (
          <a
            href={`/signals`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors"
          >
            Signal: {item.signalStatement.length > 50 ? item.signalStatement.slice(0, 50) + '...' : item.signalStatement}
          </a>
        )}
        {item.thesisTitle && item.thesisId && (
          <a
            href={item.thesisType === 'macro' ? `/macro-theses/${item.thesisId}` : `/asset-theses/${item.thesisId}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            {item.thesisTitle.length > 40 ? item.thesisTitle.slice(0, 40) + '...' : item.thesisTitle}
          </a>
        )}
        {item.tickers && item.tickers.slice(0, expanded ? undefined : 3).map((t) => (
          <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
            {t}
          </span>
        ))}
        {!expanded && item.tickers && item.tickers.length > 3 && (
          <span className="text-[11px] text-muted-foreground">+{item.tickers.length - 3}</span>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {/* Body text */}
          {item.body && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{item.body}</p>
          )}

          {/* Source URLs */}
          {item.sourceUrls && item.sourceUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.sourceUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {getDomain(url)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
