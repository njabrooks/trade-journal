'use client';

import { useState, useCallback, useMemo } from 'react';
import { UpcomingCard } from './UpcomingCard';
import { FeedFilterBar, type DaysFilter } from './FeedFilterBar';
import { FeedList } from './FeedList';
import type { FeedItem, FeedItemSource, UpcomingCalendarData, UnifiedFeedResult } from '@/db/queries/unifiedFeed';

interface IntelligenceFeedProps {
  upcoming: UpcomingCalendarData;
  initialFeed: UnifiedFeedResult;
}

export function IntelligenceFeed({ upcoming, initialFeed }: IntelligenceFeedProps) {
  const [allItems, setAllItems] = useState<FeedItem[]>(initialFeed.items);
  const [hasMore, setHasMore] = useState(initialFeed.hasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSources, setSelectedSources] = useState<FeedItemSource[]>([]);
  const [tickerFilter, setTickerFilter] = useState('');
  const [daysFilter, setDaysFilter] = useState<DaysFilter>(3);

  // Client-side filtering of loaded items
  const filteredItems = useMemo(() => {
    let items = allItems;

    if (selectedSources.length > 0) {
      items = items.filter((item) => selectedSources.includes(item.source));
    }

    if (tickerFilter) {
      const upper = tickerFilter.toUpperCase();
      items = items.filter((item) =>
        item.tickers?.some((t) => t.toUpperCase().includes(upper))
      );
    }

    return items;
  }, [allItems, selectedSources, tickerFilter]);

  // Reload feed when days filter changes
  const reloadFeed = useCallback(async (days: DaysFilter) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        days: String(days),
        limit: '200',
      });

      const res = await fetch(`/api/news/feed?${params}`);
      if (!res.ok) throw new Error('Failed to load feed');

      const data: UnifiedFeedResult = await res.json();
      const items = data.items.map((item) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }));

      setAllItems(items);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('Failed to reload feed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDaysChange = useCallback((days: DaysFilter) => {
    setDaysFilter(days);
    reloadFeed(days);
  }, [reloadFeed]);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        offset: String(allItems.length),
        limit: '200',
        days: String(daysFilter),
      });
      if (selectedSources.length > 0) {
        params.set('sources', selectedSources.join(','));
      }
      if (tickerFilter) {
        params.set('ticker', tickerFilter);
      }

      const res = await fetch(`/api/news/feed?${params}`);
      if (!res.ok) throw new Error('Failed to load feed');

      const data: UnifiedFeedResult = await res.json();
      const newItems = data.items.map((item) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }));

      setAllItems((prev) => [...prev, ...newItems]);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('Failed to load more feed items:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, allItems.length, selectedSources, tickerFilter, daysFilter]);

  return (
    <div className="space-y-4">
      {/* Zone 1: What's Coming */}
      <UpcomingCard
        economicEvents={upcoming.economicEvents}
        earningsEvents={upcoming.earningsEvents}
      />

      {/* Feed controls */}
      <FeedFilterBar
        selectedSources={selectedSources}
        onSourcesChange={setSelectedSources}
        tickerFilter={tickerFilter}
        onTickerFilterChange={setTickerFilter}
        daysFilter={daysFilter}
        onDaysFilterChange={handleDaysChange}
        itemCount={filteredItems.length}
      />

      {/* Zone 2: Feed */}
      <FeedList
        items={filteredItems}
        hasMore={hasMore}
        isLoading={isLoading}
        onLoadMore={loadMore}
      />
    </div>
  );
}
