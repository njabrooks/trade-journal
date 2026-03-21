'use client';

import { FeedItemRow } from './FeedItemRow';
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

  let lastDateKey = '';

  return (
    <div className="rounded-xl border bg-card divide-y divide-border/50">
      {items.map((item) => {
        const itemDate = new Date(item.timestamp);
        const dateKey = getDateKey(itemDate);
        const showHeader = dateKey !== lastDateKey;
        lastDateKey = dateKey;

        return (
          <div key={item.id}>
            {showHeader && (
              <div className="px-3 pt-2.5 pb-1">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatDateHeader(itemDate)}
                </h4>
              </div>
            )}
            <FeedItemRow item={item} />
          </div>
        );
      })}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center py-2">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="rounded-md px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && items.length === 0 && (
        <div className="p-3 space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-accent/50 rounded animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
