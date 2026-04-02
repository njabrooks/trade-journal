'use client';

import { MarkdownDisplay } from '@/components/ui/markdown-display';
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
      <MarkdownDisplay content={report.fullMarkdown} className="px-6 py-6" />
    </div>
  );
}
