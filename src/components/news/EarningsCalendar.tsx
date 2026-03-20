'use client';

import { BarChart3 } from 'lucide-react';

interface EarningsEvent {
  id: string;
  ticker: string;
  reportDate: string;
  reportTime: string | null;
  epsEstimate: string | null;
  epsActual: string | null;
  revenueEstimate: string | null;
  revenueActual: string | null;
  quarter: string | null;
}

interface EarningsCalendarProps {
  events: EarningsEvent[];
}

const TIME_LABELS: Record<string, string> = {
  bmo: 'Pre-market',
  amc: 'After-close',
  dmh: 'During hours',
};

function groupByWeek(events: EarningsEvent[]): { label: string; events: EarningsEvent[] }[] {
  const weeks: Record<string, EarningsEvent[]> = {};
  for (const event of events) {
    const date = new Date(event.reportDate + 'T00:00:00');
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + 1); // Monday
    const key = weekStart.toISOString().split('T')[0];
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(event);
  }

  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, events]) => {
      const start = new Date(weekStart + 'T00:00:00');
      const end = new Date(start);
      end.setDate(end.getDate() + 4); // Friday
      const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      return { label, events: events.sort((a, b) => a.reportDate.localeCompare(b.reportDate)) };
    });
}

export function EarningsCalendar({ events }: EarningsCalendarProps) {
  const weeks = groupByWeek(events);

  if (events.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Earnings Calendar
        </h3>
        <p className="text-sm text-muted-foreground text-center py-4">No upcoming earnings</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Earnings Calendar
        </h3>
      </div>
      <div className="divide-y divide-border">
        {weeks.map(week => (
          <div key={week.label} className="px-4 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Week of {week.label}</p>
            <div className="flex flex-wrap gap-2">
              {week.events.map(event => (
                <div
                  key={event.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted border text-sm"
                >
                  <span className="font-mono font-semibold text-foreground">{event.ticker}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.reportDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {event.reportTime && (
                    <span className="text-xs px-1 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                      {event.reportTime}
                    </span>
                  )}
                  {event.epsActual != null && (
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">
                      ${event.epsActual}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
