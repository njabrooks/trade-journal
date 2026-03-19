'use client';

import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

interface IntelligenceItem {
  id: string;
  severity: string;
  sector: string | null;
  headline: string;
  body: string | null;
  sourceUrls: string[] | null;
  relevantTickers: string[] | null;
  section: string | null;
}

const SEVERITY_STYLES: Record<string, { dot: string; bg: string }> = {
  critical: { dot: 'bg-red-500', bg: 'hover:bg-red-50' },
  high: { dot: 'bg-orange-500', bg: 'hover:bg-orange-50' },
  medium: { dot: 'bg-yellow-500', bg: 'hover:bg-yellow-50' },
  info: { dot: 'bg-blue-400', bg: 'hover:bg-blue-50' },
};

interface IntelligenceItemRowProps {
  item: IntelligenceItem;
  compact?: boolean;
}

export function IntelligenceItemRow({ item, compact = false }: IntelligenceItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const styles = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
  const hasBody = item.body && item.body.length > 0;

  return (
    <div className={`rounded-md px-3 py-2 transition-colors ${styles.bg}`}>
      <div
        className="flex items-start gap-2 cursor-pointer"
        onClick={() => hasBody && setExpanded(!expanded)}
      >
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium text-slate-900 ${compact ? 'line-clamp-2' : ''}`}>
            {item.headline}
          </p>
          {compact && hasBody && !expanded && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.body}</p>
          )}
        </div>
        {hasBody && (
          <button className="flex-shrink-0 mt-0.5 text-muted-foreground">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {expanded && item.body && (
        <div className="mt-2 ml-4 space-y-2">
          <p className="text-sm text-slate-700 whitespace-pre-line">{item.body}</p>

          {item.relevantTickers && item.relevantTickers.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {item.relevantTickers.map(ticker => (
                <span key={ticker} className="px-1.5 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground rounded">
                  {ticker}
                </span>
              ))}
            </div>
          )}

          {item.sourceUrls && item.sourceUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.sourceUrls.map((url, i) => {
                const domain = getDomain(url);
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {domain}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}
