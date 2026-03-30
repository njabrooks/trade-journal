'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { IntelligenceReportWithItems } from '@/db/queries/intelligence';

interface Props {
  report: IntelligenceReportWithItems;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-600 dark:text-red-400',
  high: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  info: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
};

export function IntelligenceReportView({ report }: Props) {
  const counts = [
    { label: 'Critical', value: report.criticalCount, style: SEVERITY_STYLES.critical },
    { label: 'High', value: report.highCount, style: SEVERITY_STYLES.high },
    { label: 'Medium', value: report.mediumCount, style: SEVERITY_STYLES.medium },
    { label: 'Info', value: report.infoCount, style: SEVERITY_STYLES.info },
  ].filter((c) => c.value && c.value > 0);

  return (
    <div className="rounded-xl border bg-card">
      {/* Header with severity counts */}
      {counts.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-3 border-b">
          {counts.map((c) => (
            <span key={c.label} className={`px-2 py-0.5 text-xs font-medium rounded ${c.style}`}>
              {c.value} {c.label.toLowerCase()}
            </span>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">
            {report.items.length} items
          </span>
        </div>
      )}

      {/* Markdown content */}
      <div className="px-6 py-6">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-bold text-foreground mt-6 mb-3 first:mt-0">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-semibold text-foreground mt-6 mb-2 pb-1 border-b border-border">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-semibold text-foreground mt-4 mb-1.5">{children}</h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-sm font-semibold text-foreground mt-3 mb-1">{children}</h4>
            ),
            p: ({ children }) => (
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="text-sm text-muted-foreground space-y-1 mb-3 ml-4 list-disc">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="text-sm text-muted-foreground space-y-1 mb-3 ml-4 list-decimal">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic">{children}</em>
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-border pl-3 my-3 text-sm text-muted-foreground italic">{children}</blockquote>
            ),
            hr: () => <hr className="my-4 border-border" />,
            table: ({ children }) => (
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-sm border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="border-b border-border">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="text-left text-xs font-semibold text-foreground px-2 py-1.5">{children}</th>
            ),
            td: ({ children }) => (
              <td className="text-left text-xs text-muted-foreground px-2 py-1.5 border-b border-border/50">{children}</td>
            ),
            code: ({ children, className }) => {
              const isBlock = className?.includes('language-');
              if (isBlock) {
                return <code className="block bg-muted rounded p-3 text-xs font-mono overflow-x-auto mb-3">{children}</code>;
              }
              return <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
            },
          }}
        >
          {report.fullMarkdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
