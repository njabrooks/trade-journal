'use client';

import { FeedItemCard } from './FeedItemCard';
import type { FeedItem } from '@/db/queries/unifiedFeed';

interface FeedListProps {
  items: FeedItem[];
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

function formatDateHeader(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' });
}

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function FeedList({ items, hasMore, isLoading, onLoadMore }: FeedListProps) {
  if (items.length === 0 && !isLoading) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No feed items match your filters.</p>
        <p className="text-xs text-muted-foreground mt-1">Try adjusting your source or ticker filters.</p>
      </div>
    );
  }

  // Group items by date for date headers
  let lastDateKey = '';

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const itemDate = new Date(item.timestamp);
        const dateKey = getDateKey(itemDate);
        const showHeader = dateKey !== lastDateKey;
        lastDateKey = dateKey;

        return (
          <div key={item.id}>
            {showHeader && (
              <div className="pt-3 pb-1 first:pt-0">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatDateHeader(itemDate)}
                </h4>
              </div>
            )}
            <FeedItemCard item={item} />
          </div>
        );
      })}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="rounded-md border bg-card px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && items.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card px-4 py-3 animate-pulse">
              <div className="h-3 w-32 bg-accent rounded mb-2" />
              <div className="h-4 w-3/4 bg-accent rounded mb-1.5" />
              <div className="h-3 w-1/2 bg-accent rounded" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
