'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';
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

const IMPACT_STYLES: Record<string, string> = {
  high: 'bg-red-500/15 text-red-600 dark:text-red-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  low: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
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

function groupByDate<T extends { eventDate?: string; reportDate?: string }>(
  items: T[],
  dateField: 'eventDate' | 'reportDate'
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const date = (item as Record<string, unknown>)[dateField] as string;
    const existing = groups.get(date) || [];
    existing.push(item);
    groups.set(date, existing);
  }
  return groups;
}

export function UpcomingCard({ economicEvents, earningsEvents }: UpcomingCardProps) {
  const [expanded, setExpanded] = useState(false);

  const econByDate = groupByDate(economicEvents, 'eventDate');
  const earningsByDate = groupByDate(earningsEvents, 'reportDate');

  // Merge all dates and sort
  const allDates = [...new Set([...econByDate.keys(), ...earningsByDate.keys()])].sort();

  const totalCount = economicEvents.length + earningsEvents.length;
  const visibleDates = expanded ? allDates : allDates.slice(0, 3);
  const hasMore = allDates.length > 3;

  if (totalCount === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">No upcoming events in the next 7 days.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">What&apos;s Coming</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {totalCount}
          </span>
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? 'Show less' : `+${allDates.length - 3} more days`}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Date groups */}
      <div className="divide-y divide-border">
        {visibleDates.map((date) => {
          const econ = econByDate.get(date) || [];
          const earnings = earningsByDate.get(date) || [];

          return (
            <div key={date} className="px-4 py-2.5">
              <div className="text-xs font-medium text-muted-foreground mb-1.5">
                {formatDateLabel(date)}
              </div>

              <div className="space-y-1">
                {/* Economic events */}
                {econ.map((event) => (
                  <div key={event.id} className="flex items-center gap-2 text-sm">
                    {event.impact && (
                      <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded', IMPACT_STYLES[event.impact] || 'bg-muted text-muted-foreground')}>
                        {event.impact.toUpperCase()}
                      </span>
                    )}
                    <span className="text-foreground">{event.eventName}</span>
                    {event.eventTime && (
                      <span className="text-xs text-muted-foreground font-mono">{event.eventTime}</span>
                    )}
                    {event.country && (
                      <span className="text-xs text-muted-foreground">{event.country}</span>
                    )}
                  </div>
                ))}

                {/* Earnings events */}
                {earnings.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {earnings.map((event) => (
                      <span
                        key={event.id}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                      >
                        <span className="font-mono font-semibold text-foreground">{event.ticker}</span>
                        {event.reportTime && (
                          <span className="text-muted-foreground uppercase text-[10px]">
                            {TIME_LABELS[event.reportTime] || event.reportTime}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
