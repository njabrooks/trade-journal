'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Globe, Target, FileText, Calendar, BarChart3, Scale, TrendingUp,
  ChevronDown, ChevronUp, ChevronRight, ExternalLink, ArrowUp, ArrowDown, Briefcase, UserCheck,
  Zap, Sparkles, Clock, Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeedItem, FeedItemSource } from '@/db/queries/unifiedFeed';
import { EntityBadge } from '@/components/ui/entity-badge';

// ---------------------------------------------------------------------------
// Config & constants
// ---------------------------------------------------------------------------

const SOURCE_CONFIG: Record<FeedItemSource, {
  icon: React.ComponentType<{ className?: string }>;
  colour: string;
}> = {
  world_monitor: { icon: Globe, colour: 'text-blue-500' },
  thesis_monitor: { icon: Target, colour: 'text-purple-500' },
  sec_filing: { icon: FileText, colour: 'text-indigo-500' },
  economic_event: { icon: Calendar, colour: 'text-amber-500' },
  earnings_event: { icon: BarChart3, colour: 'text-green-500' },
  analyst_action: { icon: Briefcase, colour: 'text-rose-500' },
  insider_transaction: { icon: UserCheck, colour: 'text-emerald-500' },
  claim_evidence: { icon: Scale, colour: 'text-orange-500' },
  quant_snapshot: { icon: TrendingUp, colour: 'text-cyan-500' },
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

const IMPACT_DOT: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-blue-400',
};

const FILING_TYPE_LABELS: Record<string, string> = {
  '144': 'Insider sale notice', '8-K': 'Material event',
  '10-Q': 'Quarterly report', '10-K': 'Annual report',
  '10-K/A': 'Annual report (amended)', '10-Q/A': 'Quarterly report (amended)',
  'SC 13G': 'Passive ownership >5%', 'SC 13G/A': 'Passive ownership update',
  'SC 13D': 'Active ownership >5%', 'SC 13D/A': 'Active ownership update',
  'Form 4': 'Insider ownership change', 'Form 3': 'Initial insider ownership',
  'S-1': 'IPO registration', 'S-3': 'Shelf registration',
  'DEF 14A': 'Proxy statement', '6-K': 'Foreign issuer report',
  '20-F': 'Foreign annual report', 'EFFECT': 'Registration effective',
  'DEFA14A': 'Proxy materials',
};

const COUNTRY_FLAGS: Record<string, string> = {
  US: '\u{1F1FA}\u{1F1F8}', GB: '\u{1F1EC}\u{1F1E7}', CN: '\u{1F1E8}\u{1F1F3}',
  HK: '\u{1F1ED}\u{1F1F0}', EU: '\u{1F1EA}\u{1F1FA}', JP: '\u{1F1EF}\u{1F1F5}',
  DE: '\u{1F1E9}\u{1F1EA}', FR: '\u{1F1EB}\u{1F1F7}', AU: '\u{1F1E6}\u{1F1FA}',
  CA: '\u{1F1E8}\u{1F1E6}',
};

const SECTION_LABELS: Record<string, { label: string; full: string; style: string }> = {
  new_developments: { label: 'New', full: 'New Developments', style: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  running_stories: { label: 'Running', full: 'Running Stories — Status Update', style: 'bg-muted text-muted-foreground' },
  key_themes: { label: 'Theme', full: 'Key Themes & Patterns', style: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  deep_dive: { label: 'Deep Dive', full: 'Domain Deep-Dive', style: 'bg-muted text-muted-foreground' },
  opportunities: { label: 'Signal', full: 'Opportunities & Gaps', style: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
};

const SECTOR_FULL_LABELS: Record<string, string> = {
  geopolitics: 'Geopolitics & Conflicts',
  energy: 'Energy & Commodities',
  tech: 'Tech & AI',
  finance: 'Finance & Markets',
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
  if (diffDays === 1) return '1d';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function stripSourceLines(text: string): string {
  return text.replace(/^-?\s*Source:\s*\[.*?\]\(.*?\)\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

function formatCompact(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return String(value);
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function Badge({ text, style }: { text: string; style: string }) {
  return <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded whitespace-nowrap', style)}>{text}</span>;
}

// ---------------------------------------------------------------------------
// Source-specific content extractors
// Each returns { ticker, badges, content, data } for grid placement
// ---------------------------------------------------------------------------

interface RowSlots {
  ticker: React.ReactNode;
  badges: React.ReactNode;
  content: React.ReactNode;
  data: React.ReactNode;
}

function getEconomicSlots(item: FeedItem): RowSlots {
  const flag = item.country ? COUNTRY_FLAGS[item.country] || item.country : '';
  let surpriseDir: 'beat' | 'miss' | null = null;
  if (item.actual != null && item.forecast != null) {
    const a = parseFloat(item.actual); const f = parseFloat(item.forecast);
    if (!isNaN(a) && !isNaN(f)) surpriseDir = a > f ? 'beat' : a < f ? 'miss' : null;
  }

  return {
    ticker: flag ? <span className="text-xs">{flag}</span> : null,
    badges: item.impactLevel ? (
      <span className={cn('h-1.5 w-1.5 rounded-full inline-block', IMPACT_DOT[item.impactLevel] || 'bg-muted')} />
    ) : null,
    content: <span className="truncate">{item.headline}</span>,
    data: (
      <div className="flex items-center gap-1.5 text-xs font-mono">
        {item.actual != null && (
          <span className={cn('font-semibold',
            surpriseDir === 'beat' ? 'text-green-600 dark:text-green-400' :
            surpriseDir === 'miss' ? 'text-red-600 dark:text-red-400' : 'text-foreground'
          )}>{item.actual}{item.unit || ''}</span>
        )}
        {item.forecast != null && <span className="text-muted-foreground">est {item.forecast}{item.unit || ''}</span>}
        {item.previous != null && <span className="text-muted-foreground/60">prev {item.previous}{item.unit || ''}</span>}
      </div>
    ),
  };
}

function getSecSlots(item: FeedItem): RowSlots {
  const typeLabel = item.filingType ? FILING_TYPE_LABELS[item.filingType] : null;
  return {
    ticker: item.tickers?.[0] ? <span className="font-mono font-semibold text-foreground text-xs">{item.tickers[0]}</span> : null,
    badges: (
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{item.filingType}</span>
        {item.isMaterial && <Badge text="Material" style="bg-destructive/10 text-destructive" />}
      </div>
    ),
    content: <span className="truncate text-muted-foreground">{typeLabel || item.body || ''}</span>,
    data: null,
  };
}

function getEarningsSlots(item: FeedItem): RowSlots {
  let epsBeat: 'beat' | 'miss' | null = null;
  if (item.epsActual != null && item.epsEstimate != null) {
    const a = parseFloat(item.epsActual); const e = parseFloat(item.epsEstimate);
    if (!isNaN(a) && !isNaN(e)) epsBeat = a > e ? 'beat' : a < e ? 'miss' : null;
  }
  const qLabel = item.quarter && item.year ? `${item.quarter} ${item.year}` : item.quarter || '';

  return {
    ticker: item.tickers?.[0] ? <span className="font-mono font-semibold text-foreground text-xs">{item.tickers[0]}</span> : null,
    badges: qLabel ? <span className="text-xs text-muted-foreground">{qLabel}</span> : null,
    content: null,
    data: (
      <div className="flex items-center gap-1.5 text-xs font-mono">
        {item.epsActual != null && (
          <>
            <span className="text-muted-foreground">EPS</span>
            <span className={cn('font-semibold',
              epsBeat === 'beat' ? 'text-green-600 dark:text-green-400' :
              epsBeat === 'miss' ? 'text-red-600 dark:text-red-400' : 'text-foreground'
            )}>{item.epsActual}</span>
          </>
        )}
        {item.epsEstimate != null && <span className="text-muted-foreground">est {item.epsEstimate}</span>}
        {item.revenueActual != null && (
          <>
            <span className="text-muted-foreground ml-1">Rev</span>
            <span className="font-semibold text-foreground">{formatCompact(item.revenueActual)}</span>
          </>
        )}
      </div>
    ),
  };
}

function getAnalystSlots(item: FeedItem): RowSlots {
  const actionLabel = item.analystAction === 'up' ? 'Upgrade' : item.analystAction === 'down' ? 'Downgrade' :
    item.analystAction === 'init' ? 'Initiate' : item.analystAction === 'reit' ? 'Reiterate' :
    item.analystAction === 'main' ? 'Maintain' : item.analystAction;
  const isUp = item.analystAction === 'up'; const isDown = item.analystAction === 'down';

  return {
    ticker: item.tickers?.[0] ? <span className="font-mono font-semibold text-foreground text-xs">{item.tickers[0]}</span> : null,
    badges: (
      <span className={cn('text-xs font-medium',
        isUp ? 'text-green-600 dark:text-green-400' : isDown ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
      )}>
        {isUp && <ArrowUp className="h-3 w-3 inline -mt-0.5 mr-0.5" />}
        {isDown && <ArrowDown className="h-3 w-3 inline -mt-0.5 mr-0.5" />}
        {actionLabel}
      </span>
    ),
    content: <span className="truncate text-muted-foreground">{item.analystFirm}</span>,
    data: (item.fromGrade || item.toGrade) ? (
      <span className="text-xs font-mono text-muted-foreground">
        {item.fromGrade}{item.fromGrade && item.toGrade && ' \u2192 '}
        {item.toGrade && <span className="font-semibold text-foreground">{item.toGrade}</span>}
      </span>
    ) : null,
  };
}

function getInsiderSlots(item: FeedItem): RowSlots {
  const isBuy = item.transactionCode === 'P'; const isSell = item.transactionCode === 'S';
  const codeLabel = item.transactionCode === 'P' ? 'Buy' : item.transactionCode === 'S' ? 'Sell' :
    item.transactionCode === 'A' ? 'Grant' : item.transactionCode === 'M' ? 'Exercise' : item.transactionCode ?? '';
  const totalValue = item.shareChange && item.transactionPrice ? Math.abs(item.shareChange * item.transactionPrice) : null;

  return {
    ticker: item.tickers?.[0] ? <span className="font-mono font-semibold text-foreground text-xs">{item.tickers[0]}</span> : null,
    badges: (
      <span className={cn('text-xs font-medium',
        isBuy ? 'text-green-600 dark:text-green-400' : isSell ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
      )}>{codeLabel}</span>
    ),
    content: <span className="truncate text-muted-foreground">{item.insiderName}</span>,
    data: (
      <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
        {item.shareChange != null && <span>{Math.abs(item.shareChange).toLocaleString()} shares</span>}
        {totalValue != null && totalValue > 0 && <span>${formatCompact(totalValue)}</span>}
      </div>
    ),
  };
}

const SECTOR_BADGE_STYLES: Record<string, string> = {
  geopolitics: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  energy: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  tech: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  finance: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
};

function getWorldThesisSlots(item: FeedItem): RowSlots {
  // Collapsed report summary row (has reportId)
  if (item.reportId && item.severityCounts) {
    const counts = item.severityCounts;
    return {
      ticker: null,
      badges: (
        <div className="flex items-center gap-1">
          {counts.critical > 0 && <Badge text={`${counts.critical} critical`} style={SEVERITY_STYLES.critical} />}
          {counts.high > 0 && <Badge text={`${counts.high} high`} style={SEVERITY_STYLES.high} />}
          {counts.medium > 0 && <Badge text={`${counts.medium} med`} style={SEVERITY_STYLES.medium} />}
        </div>
      ),
      content: <span className="truncate">{item.headline}</span>,
      data: item.itemCount ? (
        <span className="text-xs text-muted-foreground">{item.itemCount} items</span>
      ) : null,
    };
  }

  // Legacy: individual item rows (fallback)
  const sectionInfo = item.reportSection ? SECTION_LABELS[item.reportSection] : null;
  return {
    ticker: item.tickers?.[0] ? (
      <span className="font-mono font-semibold text-foreground text-xs">{item.tickers[0]}</span>
    ) : null,
    badges: (
      <div className="flex items-center gap-1">
        {item.severity && item.severity !== 'info' && <Badge text={item.severity} style={SEVERITY_STYLES[item.severity]} />}
        {sectionInfo && <Badge text={sectionInfo.label} style={sectionInfo.style} />}
        {item.sector && <Badge text={item.sector} style={SECTOR_BADGE_STYLES[item.sector] || 'bg-muted text-muted-foreground'} />}
      </div>
    ),
    content: <span className="truncate">{item.headline}</span>,
    data: item.tickers && item.tickers.length > 1 ? (
      <div className="flex items-center gap-1">
        {item.tickers.slice(1, 4).map((t) => (
          <span key={t} className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">{t}</span>
        ))}
      </div>
    ) : null,
  };
}

function getEvidenceSlots(item: FeedItem): RowSlots {
  return {
    ticker: item.tickers?.[0] ? <span className="font-mono font-semibold text-foreground text-xs">{item.tickers[0]}</span> : null,
    badges: item.assessment ? <Badge text={item.assessment} style={ASSESSMENT_STYLES[item.assessment]} /> : null,
    content: item.claimId ? (
      <a href={`/claims/${item.claimId}`} onClick={(e) => e.stopPropagation()}
        className="truncate block hover:underline">
        {item.headline}
      </a>
    ) : <span className="truncate">{item.headline}</span>,
    data: item.researchSourceTitle ? (
      <span className="text-xs text-muted-foreground truncate max-w-[180px] block">
        {item.researchSourceTitle.length > 40 ? item.researchSourceTitle.slice(0, 40) + '\u2026' : item.researchSourceTitle}
      </span>
    ) : null,
  };
}

function getQuantSlots(item: FeedItem): RowSlots {
  // Collapsed daily summary row (has snapshotDateKey)
  if (item.snapshotDateKey && item.assessmentCounts) {
    const ac = item.assessmentCounts;
    return {
      ticker: null,
      badges: (
        <div className="flex items-center gap-1">
          {ac.strengthening > 0 && <Badge text={`${ac.strengthening} strengthening`} style={ASSESSMENT_STYLES.strengthening} />}
          {ac.confirmed > 0 && <Badge text={`${ac.confirmed} confirmed`} style={ASSESSMENT_STYLES.confirmed} />}
          {ac.weakening > 0 && <Badge text={`${ac.weakening} weakening`} style={ASSESSMENT_STYLES.weakening} />}
          {ac.invalidated > 0 && <Badge text={`${ac.invalidated} invalidated`} style={ASSESSMENT_STYLES.invalidated} />}
        </div>
      ),
      content: <span className="truncate">{item.headline}</span>,
      data: item.itemCount ? (
        <span className="text-xs text-muted-foreground">{item.itemCount} signals</span>
      ) : null,
    };
  }

  // Individual quant snapshot row (legacy/fallback)
  return {
    ticker: item.tickers?.[0] ? <span className="font-mono font-semibold text-foreground text-xs">{item.tickers[0]}</span> : null,
    badges: item.assessment ? <Badge text={item.assessment} style={ASSESSMENT_STYLES[item.assessment]} /> : null,
    content: <span className="truncate">{item.headline}</span>,
    data: (
      <div className="flex items-center gap-1.5 text-xs font-mono">
        {item.observedValue !== undefined && (
          <span className="text-foreground font-semibold">{item.observedValue}{item.unit ? ` ${item.unit}` : ''}</span>
        )}
        {item.thresholdValue !== undefined && (
          <span className="text-muted-foreground">/ {item.thresholdValue}{item.unit ? ` ${item.unit}` : ''}</span>
        )}
        {item.pctToThreshold !== undefined && (
          <span className={cn('inline-flex items-center gap-0.5 font-medium',
            item.pctToThreshold >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {item.pctToThreshold >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(item.pctToThreshold).toFixed(1)}%
          </span>
        )}
      </div>
    ),
  };
}

function ProcessingIcon({ item }: { item: FeedItem }) {
  if (item.processingResult === 'signal_evidence') {
    return <span title="Signal evidence"><Zap className="h-3.5 w-3.5 text-amber-500 opacity-70" /></span>;
  }
  if (item.processingResult === 'claim_candidate') {
    return <span title="Claim candidate"><Sparkles className="h-3.5 w-3.5 text-violet-500 opacity-70" /></span>;
  }
  if (item.processingResult === 'contextual') {
    return <span title="Contextual"><Circle className="h-2 w-2 fill-current text-muted-foreground/40" /></span>;
  }
  if (item.processingStatus === 'pending') {
    return <span title="Pending processing"><Clock className="h-3.5 w-3.5 text-muted-foreground/40" /></span>;
  }
  return null;
}

function getSlots(item: FeedItem): RowSlots {
  switch (item.source) {
    case 'economic_event': return getEconomicSlots(item);
    case 'sec_filing': return getSecSlots(item);
    case 'earnings_event': return getEarningsSlots(item);
    case 'analyst_action': return getAnalystSlots(item);
    case 'insider_transaction': return getInsiderSlots(item);
    case 'claim_evidence': return getEvidenceSlots(item);
    case 'quant_snapshot': return getQuantSlots(item);
    case 'world_monitor': case 'thesis_monitor': return getWorldThesisSlots(item);
    default: return { ticker: null, badges: null, content: <span className="truncate">{item.headline}</span>, data: null };
  }
}

// ---------------------------------------------------------------------------
// Grid row template:
// [icon 16px] [time 32px] [ticker 52px] [badges auto] [content 1fr] [data auto] [chevron 20px]
// ---------------------------------------------------------------------------

const GRID_STYLE = 'grid items-center gap-x-1.5 px-3 py-1.5 min-h-[32px]';
const GRID_COLS = '16px 32px 52px auto 1fr auto 20px';

// Render ticker cell — links to asset thesis detail page when one exists
function renderTickerCell(tickerNode: React.ReactNode, item: FeedItem): React.ReactNode {
  if (!tickerNode) return <div />;

  const linkedThesis = item.linkedAssetTheses?.[0];
  if (linkedThesis) {
    return (
      <a
        href={`/asset-theses/${linkedThesis.id}`}
        onClick={(e) => e.stopPropagation()}
        className="truncate block hover:underline"
        title={linkedThesis.title}
      >
        {tickerNode}
      </a>
    );
  }

  return <div className="truncate">{tickerNode}</div>;
}

export function FeedItemRow({ item }: { item: FeedItem }) {
  const [expanded, setExpanded] = useState(false);
  const config = SOURCE_CONFIG[item.source];
  const Icon = config.icon;
  const slots = getSlots(item);

  // Summary rows link to detail pages instead of expanding
  const isMonitorSummary = !!(item.reportId && (item.source === 'world_monitor' || item.source === 'thesis_monitor'));
  const isQuantSummary = !!(item.snapshotDateKey && item.source === 'quant_snapshot');
  const isSummaryRow = isMonitorSummary || isQuantSummary;

  const hasEntityLinks = !!(
    (item.linkedAssetTheses && item.linkedAssetTheses.length > 0) ||
    (item.linkedStrategies && item.linkedStrategies.length > 0)
  );
  const hasExpandableContent = !isSummaryRow && !!(
    item.body || (item.sourceUrls && item.sourceUrls.length > 0) || item.signalStatement || hasEntityLinks
  );

  if (isSummaryRow) {
    const href = isMonitorSummary
      ? `/news/intelligence/${item.reportId}`
      : `/news/signals/${item.snapshotDateKey}`;
    return (
      <Link href={href}>
        <div
          className={cn(GRID_STYLE, 'transition-colors text-sm cursor-pointer hover:bg-accent/50')}
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <Icon className={cn('h-3.5 w-3.5', config.colour)} />
          <span className="text-[11px] text-muted-foreground text-right font-mono">
            {getTimeAgo(new Date(item.timestamp))}
          </span>
          <div />
          <div className="flex items-center gap-1">{slots.badges}</div>
          <div className="min-w-0 truncate">{slots.content}</div>
          <div className="text-right whitespace-nowrap">{slots.data}</div>
          <div className="flex items-center justify-center">
            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div>
      {/* Grid row */}
      <div
        className={cn(
          GRID_STYLE, 'transition-colors text-sm',
          hasExpandableContent && 'cursor-pointer hover:bg-accent/50',
          expanded && 'bg-accent/30'
        )}
        style={{ gridTemplateColumns: GRID_COLS }}
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
      >
        {/* Col 1: Icon */}
        <Icon className={cn('h-3.5 w-3.5', config.colour)} />

        {/* Col 2: Time */}
        <span className="text-[11px] text-muted-foreground text-right font-mono">
          {getTimeAgo(new Date(item.timestamp))}
        </span>

        {/* Col 3: Ticker — clickable link to asset thesis when linked */}
        {renderTickerCell(slots.ticker, item)}

        {/* Col 4: Badges + processing status */}
        <div className="flex items-center gap-1">
          {slots.badges}
          <ProcessingIcon item={item} />
        </div>

        {/* Col 5: Content */}
        <div className="min-w-0 truncate">{slots.content}</div>

        {/* Col 6: Data */}
        <div className="text-right whitespace-nowrap">{slots.data}</div>

        {/* Col 7: Chevron + signal evaluated dot */}
        <div className="flex items-center justify-center gap-0.5">
          {item.signalId && (
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0',
              item.assessment && ASSESSMENT_STYLES[item.assessment]
                ? {
                    strengthening: 'bg-blue-400',
                    confirmed: 'bg-emerald-500',
                    weakening: 'bg-amber-400',
                    invalidated: 'bg-red-500',
                    neutral: 'bg-zinc-400',
                  }[item.assessment] || 'bg-purple-400'
                : 'bg-purple-400'
            )} title="Signal evidence" />
          )}
          {hasExpandableContent && (
            <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="p-0.5 text-muted-foreground/40 hover:text-foreground">
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && hasExpandableContent && (
        <div className="pl-[64px] pr-3 pb-2 space-y-1.5 bg-accent/20">
          {/* Subheading: full section + sector names */}
          {(item.reportSection || item.sector) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {item.reportSection && SECTION_LABELS[item.reportSection] && (
                <span className="font-medium">{SECTION_LABELS[item.reportSection].full}</span>
              )}
              {item.reportSection && item.sector && <span>·</span>}
              {item.sector && (
                <span>{SECTOR_FULL_LABELS[item.sector] || item.sector}</span>
              )}
            </div>
          )}
          {/* Filing type description for SEC items */}
          {item.filingType && FILING_TYPE_LABELS[item.filingType] && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">{item.filingType}</span> — {FILING_TYPE_LABELS[item.filingType]}
            </div>
          )}
          {item.body && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{stripSourceLines(item.body)}</p>
          )}
          {/* Research source provenance for claim evidence items */}
          {item.source === 'claim_evidence' && item.researchSourceTitle && (
            <a
              href={item.researchSourceId ? `/research/${item.researchSourceId}` : '/research'}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-md bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 transition-colors"
            >
              <FileText className="h-3 w-3" />
              Source: {item.researchSourceTitle.length > 60 ? item.researchSourceTitle.slice(0, 60) + '\u2026' : item.researchSourceTitle}
            </a>
          )}
          {item.signalStatement && (
            <a href={item.signalId ? `/signals/${item.signalId}` : '/signals'}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors">
              Signal: {item.signalStatement.length > 60 ? item.signalStatement.slice(0, 60) + '\u2026' : item.signalStatement}
            </a>
          )}
          {/* Processing status indicators */}
          {item.signalId && item.assessment ? (
            <div className="flex items-center gap-1.5">
              <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded', ASSESSMENT_STYLES[item.assessment] || ASSESSMENT_STYLES.neutral)}>
                Signal Evidence: {item.assessment}
              </span>
            </div>
          ) : item.linkedAssetTheses && item.linkedAssetTheses.length > 0 && !item.signalId ? (
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-sky-500/10 text-sky-600 dark:text-sky-400">
                Contextual Intel
              </span>
              <span className="text-[10px] text-muted-foreground">
                {item.linkedAssetTheses.length} {item.linkedAssetTheses.length === 1 ? 'thesis' : 'theses'}
              </span>
            </div>
          ) : null}
          {item.sourceUrls && item.sourceUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.sourceUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  {getDomain(url)} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          )}
          {hasEntityLinks && (
            <div className="flex flex-wrap items-center gap-1.5">
              {item.linkedAssetTheses?.map((at) => (
                <EntityBadge
                  key={at.id}
                  entityType="asset_thesis"
                  id={at.id}
                  title={at.title.length > 35 ? at.title.slice(0, 35) + '\u2026' : at.title}
                  href={`/asset-theses/${at.id}`}
                  size="sm"
                />
              ))}
              {item.linkedStrategies?.map((s) => (
                <EntityBadge
                  key={s.id}
                  entityType="strategy"
                  id={s.id}
                  title={s.strategyKey}
                  href={`/strategies/${s.id}`}
                  size="sm"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
