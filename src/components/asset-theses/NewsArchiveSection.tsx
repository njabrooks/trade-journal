'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Newspaper, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NewsItem {
  id: string;
  url: string;
  title: string;
  snippet: string | null;
  sourceDomain: string | null;
  publishedDate: string | null;
  fetchedAt: string;
  matchScore: number | null;
  matchedKeywords: string[] | null;
  queryType: string | null;
  triageRecord: {
    id: string;
    triggerType: string;
    severity: string;
    status: string;
    createdAt: string;
  } | null;
}

interface NewsArchiveSectionProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
}

export function NewsArchiveSection({ thesisId, thesisType }: NewsArchiveSectionProps) {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    async function fetchNews() {
      setLoading(true);
      setError(null);
      try {
        const endpoint = thesisType === 'macro'
          ? `/api/theses/${thesisId}/news`
          : `/api/asset-theses/${thesisId}/news`;
        const limit = showAll ? 100 : 10;
        const response = await fetch(`${endpoint}?limit=${limit}`);
        if (!response.ok) {
          throw new Error('Failed to fetch news');
        }
        const data = await response.json();
        setNewsItems(data.newsItems);
        setTotalCount(data.totalCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    fetchNews();
  }, [thesisId, thesisType, showAll]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
      case 'medium':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'low':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'attention':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-500" />;
      case 'resolved':
        return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
      case 'pending':
        return <Clock className="w-3.5 h-3.5 text-slate-400" />;
      default:
        return null;
    }
  };

  if (loading && newsItems.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-600"></div>
        <p className="mt-2 text-sm text-slate-500">Loading news archive...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (newsItems.length === 0) {
    return (
      <div className="py-8 text-center">
        <Newspaper className="w-8 h-8 mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-500 mb-1">No news items found</p>
        <p className="text-xs text-slate-400">
          News items will appear here after the daily monitoring script runs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* News items list */}
      <div className="divide-y divide-slate-100">
        {newsItems.map((item) => (
          <div key={item.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              {/* Main content */}
              <div className="flex-1 min-w-0">
                {/* Title with link */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-blue-600"
                >
                  <span className="truncate">{item.title}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 flex-shrink-0" />
                </a>

                {/* Metadata row */}
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <span className="font-mono">{item.sourceDomain || 'Unknown'}</span>
                  <span className="text-slate-300">•</span>
                  <span>{formatDate(item.publishedDate || item.fetchedAt)}</span>
                  {item.matchedKeywords && item.matchedKeywords.length > 0 && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-400">
                        matched: {item.matchedKeywords.slice(0, 3).join(', ')}
                        {item.matchedKeywords.length > 3 && '...'}
                      </span>
                    </>
                  )}
                </div>

                {/* Snippet */}
                {item.snippet && (
                  <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">
                    {item.snippet.slice(0, 200)}
                    {item.snippet.length > 200 && '...'}
                  </p>
                )}
              </div>

              {/* Triage status badge */}
              {item.triageRecord && (
                <div className="flex-shrink-0 flex items-center gap-1.5">
                  {getStatusIcon(item.triageRecord.status)}
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getSeverityColor(item.triageRecord.severity)}`}>
                    {item.triageRecord.severity}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Load more button */}
      {totalCount > newsItems.length && !showAll && (
        <div className="pt-2 border-t border-slate-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(true)}
            className="w-full text-slate-600 hover:text-slate-900"
          >
            Show all {totalCount} news items
          </Button>
        </div>
      )}

      {/* Summary footer */}
      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs text-slate-400 text-center">
          {newsItems.length} of {totalCount} news items shown •{' '}
          {newsItems.filter(n => n.triageRecord).length} analyzed
        </p>
      </div>
    </div>
  );
}
