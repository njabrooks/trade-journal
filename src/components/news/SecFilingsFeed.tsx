'use client';

import { FileText, ExternalLink } from 'lucide-react';

interface SecFiling {
  id: string;
  ticker: string;
  filingType: string;
  filingCategory: string | null;
  filedDate: string;
  filingUrl: string;
  description: string | null;
  isMaterial: boolean | null;
}

interface SecFilingsFeedProps {
  filings: SecFiling[];
}

const TYPE_STYLES: Record<string, string> = {
  '10-K': 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  '10-Q': 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  '8-K': 'bg-destructive/15 text-destructive',
  'DEF 14A': 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  'Form 4': 'bg-muted text-muted-foreground',
};

export function SecFilingsFeed({ filings }: SecFilingsFeedProps) {
  if (filings.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          SEC Filings
        </h3>
        <p className="text-sm text-muted-foreground text-center py-4">No recent filings</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4" />
          SEC Filings
        </h3>
      </div>
      <div className="divide-y divide-slate-100">
        {filings.map(filing => (
          <div key={filing.id} className="px-4 py-2.5 flex items-center gap-3">
            <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${TYPE_STYLES[filing.filingType] || 'bg-muted text-muted-foreground'}`}>
              {filing.filingType}
            </span>
            <span className="font-mono text-sm font-semibold text-slate-900">{filing.ticker}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(filing.filedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            {filing.isMaterial && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-destructive/10 text-destructive border border-destructive/20">
                Material
              </span>
            )}
            {filing.description && (
              <span className="flex-1 text-xs text-muted-foreground truncate">{filing.description}</span>
            )}
            <a
              href={filing.filingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-blue-600 transition-colors flex-shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
