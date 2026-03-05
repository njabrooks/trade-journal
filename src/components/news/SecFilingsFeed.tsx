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
  '10-K': 'bg-purple-100 text-purple-700',
  '10-Q': 'bg-indigo-100 text-indigo-700',
  '8-K': 'bg-red-100 text-red-700',
  'DEF 14A': 'bg-orange-100 text-orange-700',
  'Form 4': 'bg-slate-100 text-slate-600',
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
            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${TYPE_STYLES[filing.filingType] || 'bg-slate-100 text-slate-600'}`}>
              {filing.filingType}
            </span>
            <span className="font-mono text-sm font-semibold text-slate-900">{filing.ticker}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(filing.filedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            {filing.isMaterial && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-50 text-red-600 border border-red-200">
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
              className="text-blue-600 hover:text-blue-800 flex-shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
