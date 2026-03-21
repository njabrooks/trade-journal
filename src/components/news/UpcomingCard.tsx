'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EconomicEvent {
  id: string;
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  category: string | null;
  impact: string | null;
  country: string | null;
  actualValue: string | null;
  forecastValue: string | null;
  previousValue: string | null;
}

interface EarningsEvent {
  id: string;
  ticker: string;
  reportDate: string;
  reportTime: string | null;
  epsEstimate: string | null;
  epsActual: string | null;
  quarter: string | null;
}

interface UpcomingCardProps {
  economicEvents: EconomicEvent[];
  earningsEvents: EarningsEvent[];
}

const IMPACT_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-blue-400',
};

const COUNTRY_FLAGS: Record<string, string> = {
  US: '\u{1F1FA}\u{1F1F8}',
  GB: '\u{1F1EC}\u{1F1E7}',
  CN: '\u{1F1E8}\u{1F1F3}',
  HK: '\u{1F1ED}\u{1F1F0}',
  EU: '\u{1F1EA}\u{1F1FA}',
  JP: '\u{1F1EF}\u{1F1F5}',
  DE: '\u{1F1E9}\u{1F1EA}',
  FR: '\u{1F1EB}\u{1F1F7}',
  AU: '\u{1F1E6}\u{1F1FA}',
  CA: '\u{1F1E8}\u{1F1E6}',
  CH: '\u{1F1E8}\u{1F1ED}',
  NZ: '\u{1F1F3}\u{1F1FF}',
  IN: '\u{1F1EE}\u{1F1F3}',
  KR: '\u{1F1F0}\u{1F1F7}',
  BR: '\u{1F1E7}\u{1F1F7}',
  MX: '\u{1F1F2}\u{1F1FD}',
};

const TIME_LABELS: Record<string, string> = {
  bmo: 'Pre',
  amc: 'Post',
  dmh: 'During',
};

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Unified item for sorting across types
type CalendarItem =
  | { type: 'economic'; date: string; sortKey: string; event: EconomicEvent }
  | { type: 'earnings_group'; date: string; sortKey: string; events: EarningsEvent[] };

function buildSortedItems(econ: EconomicEvent[], earnings: EarningsEvent[]): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const e of econ) {
    items.push({
      type: 'economic',
      date: e.eventDate,
      sortKey: `${e.eventDate}_${e.eventTime || '99:99'}`,
      event: e,
    });
  }

  // Group earnings by date
  const earningsByDate = new Map<string, EarningsEvent[]>();
  for (const e of earnings) {
    const existing = earningsByDate.get(e.reportDate) || [];
    existing.push(e);
    earningsByDate.set(e.reportDate, existing);
  }
  for (const [date, events] of earningsByDate) {
    items.push({
      type: 'earnings_group',
      date: date + 'T23:59:00', // Put earnings at end of day
      sortKey: `${date}_99:99`,
      events,
    });
  }

  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return items;
}

const INITIAL_ITEMS = 10;

export function UpcomingCard({ economicEvents, earningsEvents }: UpcomingCardProps) {
  const [expanded, setExpanded] = useState(false);

  const allItems = buildSortedItems(economicEvents, earningsEvents);
  const totalCount = economicEvents.length + earningsEvents.length;
  const visibleItems = expanded ? allItems : allItems.slice(0, INITIAL_ITEMS);
  const hasMore = allItems.length > INITIAL_ITEMS;
  const hiddenCount = allItems.length - INITIAL_ITEMS;

  if (totalCount === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">No upcoming events in the next 7 days.</p>
      </div>
    );
  }

  // Track date headers
  let lastDateKey = '';

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">What&apos;s Coming <span className="text-[10px] font-normal text-muted-foreground ml-0.5">(UTC)</span></h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {totalCount}
          </span>
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? 'Show less' : `+${hiddenCount} more`}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Items */}
      <div className="px-4 py-2">
        {visibleItems.map((item, idx) => {
          const dateKey = item.date.split('T')[0];
          const showHeader = dateKey !== lastDateKey;
          lastDateKey = dateKey;

          return (
            <div key={item.type === 'economic' ? item.event.id : `earnings-${item.date}`}>
              {showHeader && (
                <div className={cn('text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', idx > 0 ? 'mt-2 mb-1' : 'mb-1')}>
                  {formatDateLabel(dateKey)}
                </div>
              )}

              {item.type === 'economic' ? (
                <div className="flex items-center gap-0 min-h-[26px] text-sm">
                  <div className="w-[16px] flex-shrink-0 flex justify-center">
                    {item.event.impact && (
                      <span className={cn('h-1.5 w-1.5 rounded-full', IMPACT_DOT[item.event.impact] || 'bg-muted')} />
                    )}
                  </div>
                  <span className="w-[44px] flex-shrink-0 text-[11px] text-muted-foreground font-mono text-right pr-2">
                    {item.event.eventTime || ''}
                  </span>
                  <span className="w-[22px] flex-shrink-0 text-xs">
                    {item.event.country ? (COUNTRY_FLAGS[item.event.country] || item.event.country) : ''}
                  </span>
                  <span className="flex-1 text-foreground truncate min-w-0">
                    {item.event.eventName}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2 text-xs font-mono">
                    {item.event.forecastValue != null && (
                      <span className="text-muted-foreground">
                        <span className="text-muted-foreground/60 mr-0.5">fcst</span>
                        {item.event.forecastValue}
                      </span>
                    )}
                    {item.event.previousValue != null && (
                      <span className="text-muted-foreground/50">
                        <span className="mr-0.5">prev</span>
                        {item.event.previousValue}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-h-[26px]">
                  <BarChart3 className="h-3 w-3 text-green-500 flex-shrink-0 ml-[16px]" />
                  <span className="text-[11px] text-muted-foreground mr-1">Earnings</span>
                  <div className="flex flex-wrap gap-1">
                    {item.events.map((e) => (
                      <span key={e.id} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-xs">
                        <span className="font-mono font-semibold text-foreground">{e.ticker}</span>
                        {e.reportTime && (
                          <span className="text-muted-foreground text-[10px]">
                            {TIME_LABELS[e.reportTime] || e.reportTime}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
