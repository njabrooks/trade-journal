'use client';

import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeedItemSource } from '@/db/queries/unifiedFeed';

export type DaysFilter = 1 | 3 | 7 | 14 | 30;

interface FeedFilterBarProps {
  selectedSources: FeedItemSource[];
  onSourcesChange: (sources: FeedItemSource[]) => void;
  tickerFilter: string;
  onTickerFilterChange: (ticker: string) => void;
  daysFilter: DaysFilter;
  onDaysFilterChange: (days: DaysFilter) => void;
  itemCount: number;
}

const SOURCE_BUTTONS: { label: string; value: FeedItemSource | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'World', value: 'world_monitor' },
  { label: 'Thesis', value: 'thesis_monitor' },
  { label: 'SEC', value: 'sec_filing' },
  { label: 'Economic', value: 'economic_event' },
  { label: 'Earnings', value: 'earnings_event' },
  { label: 'Analyst', value: 'analyst_action' },
  { label: 'Insider', value: 'insider_transaction' },
  { label: 'Evidence', value: 'claim_evidence' },
  { label: 'Quant', value: 'quant_snapshot' },
];

const DAYS_BUTTONS: { label: string; value: DaysFilter }[] = [
  { label: '1d', value: 1 },
  { label: '3d', value: 3 },
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
];

export function FeedFilterBar({
  selectedSources,
  onSourcesChange,
  tickerFilter,
  onTickerFilterChange,
  daysFilter,
  onDaysFilterChange,
  itemCount,
}: FeedFilterBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        if (tickerFilter) {
          onTickerFilterChange('');
        } else {
          searchRef.current?.blur();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [tickerFilter, onTickerFilterChange]);

  const isAllSelected = selectedSources.length === 0;

  function handleSourceClick(value: FeedItemSource | 'all') {
    if (value === 'all') {
      onSourcesChange([]);
      return;
    }
    if (selectedSources.includes(value)) {
      const next = selectedSources.filter((s) => s !== value);
      onSourcesChange(next);
    } else {
      onSourcesChange([...selectedSources, value]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Source filter pills */}
      <div className="flex flex-wrap rounded-lg border bg-muted/50 p-0.5">
        {SOURCE_BUTTONS.map((btn) => {
          const isActive = btn.value === 'all' ? isAllSelected : selectedSources.includes(btn.value as FeedItemSource);
          return (
            <button
              key={btn.value}
              onClick={() => handleSourceClick(btn.value)}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* Date range pills */}
      <div className="flex rounded-lg border bg-muted/50 p-0.5">
        {DAYS_BUTTONS.map((btn) => (
          <button
            key={btn.value}
            onClick={() => onDaysFilterChange(btn.value)}
            className={cn(
              'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              daysFilter === btn.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Ticker search */}
      <div className="relative flex-1 min-w-[140px] max-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          type="text"
          placeholder="Filter by ticker..."
          value={tickerFilter}
          onChange={(e) => onTickerFilterChange(e.target.value.toUpperCase())}
          className="h-8 w-full rounded-md border bg-background pl-8 pr-8 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {tickerFilter && (
          <button
            onClick={() => onTickerFilterChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Count */}
      <span className="text-xs text-muted-foreground">
        {itemCount} item{itemCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
