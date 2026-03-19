'use client';

import { Calendar } from 'lucide-react';

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

interface EconomicCalendarProps {
  events: EconomicEvent[];
}

const IMPACT_STYLES: Record<string, string> = {
  high: 'bg-destructive/15 text-destructive',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  low: 'bg-muted text-muted-foreground',
};

function groupByDate(events: EconomicEvent[]): Record<string, EconomicEvent[]> {
  const groups: Record<string, EconomicEvent[]> = {};
  for (const event of events) {
    const date = event.eventDate;
    if (!groups[date]) groups[date] = [];
    groups[date].push(event);
  }
  return groups;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function EconomicCalendar({ events }: EconomicCalendarProps) {
  const grouped = groupByDate(events);
  const sortedDates = Object.keys(grouped).sort();

  if (events.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Economic Calendar
        </h3>
        <p className="text-sm text-muted-foreground text-center py-4">No upcoming events</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Economic Calendar
        </h3>
      </div>
      <div className="divide-y divide-slate-100">
        {sortedDates.map(date => (
          <div key={date} className="px-4 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">{formatDate(date)}</p>
            <div className="space-y-1.5">
              {grouped[date].map(event => (
                <div key={event.id} className="flex items-center gap-2 text-sm">
                  {event.impact && (
                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${IMPACT_STYLES[event.impact] || 'bg-muted text-muted-foreground'}`}>
                      {event.impact.toUpperCase()}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 truncate font-medium">{event.eventName}</span>
                  {event.eventTime && (
                    <span className="text-xs text-muted-foreground font-mono">{event.eventTime}</span>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {event.actualValue != null && (
                      <span className="font-semibold text-slate-900">
                        A: {event.actualValue}
                      </span>
                    )}
                    {event.forecastValue != null && (
                      <span>F: {event.forecastValue}</span>
                    )}
                    {event.previousValue != null && (
                      <span>P: {event.previousValue}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
