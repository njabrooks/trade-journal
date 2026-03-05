'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IntelligenceItemRow } from './IntelligenceItemRow';

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

interface IntelligenceReport {
  id: string;
  reportDate: string;
  generatedAt: Date | string;
  timeWindow: string | null;
  executiveSummary: string | null;
  criticalCount: number | null;
  highCount: number | null;
  mediumCount: number | null;
  infoCount: number | null;
  items: IntelligenceItem[];
}

interface IntelligenceReportCardProps {
  report: IntelligenceReport;
}

function SeverityBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>
      {count} {label}
    </span>
  );
}

export function IntelligenceReportCard({ report }: IntelligenceReportCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const generatedAt = new Date(report.generatedAt);
  const timeAgo = getTimeAgo(generatedAt);

  const execItems = report.items.filter(i => i.section === 'executive_summary');
  const deepDiveItems = report.items.filter(i => i.section === 'deep_dive');
  const opportunityItems = report.items.filter(i => i.section === 'opportunities');

  const sectors = [...new Set(deepDiveItems.map(i => i.sector).filter(Boolean))] as string[];

  const filteredDeepDive = sectorFilter
    ? deepDiveItems.filter(i => i.sector === sectorFilter)
    : deepDiveItems;

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">World Monitor</h3>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{timeAgo}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge label="critical" count={report.criticalCount || 0} color="bg-red-100 text-red-700" />
            <SeverityBadge label="high" count={report.highCount || 0} color="bg-orange-100 text-orange-700" />
            <SeverityBadge label="medium" count={report.mediumCount || 0} color="bg-yellow-100 text-yellow-700" />
            <SeverityBadge label="info" count={report.infoCount || 0} color="bg-blue-100 text-blue-700" />
          </div>
        </div>
      </div>

      {/* Executive summary items */}
      <div className="px-4 py-3">
        <div className="space-y-2">
          {execItems.slice(0, expanded ? undefined : 4).map((item) => (
            <IntelligenceItemRow key={item.id} item={item} compact />
          ))}
          {execItems.length === 0 && report.executiveSummary && (
            <p className="text-sm text-muted-foreground line-clamp-4">{report.executiveSummary.slice(0, 500)}</p>
          )}
        </div>
      </div>

      {/* Expanded: deep dives */}
      {expanded && (
        <>
          {deepDiveItems.length > 0 && (
            <div className="px-4 py-3 border-t">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deep Dives</h4>
                <div className="flex gap-1">
                  <button
                    onClick={() => setSectorFilter(null)}
                    className={`px-2 py-0.5 text-xs rounded-full ${!sectorFilter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    All
                  </button>
                  {sectors.map(sector => (
                    <button
                      key={sector}
                      onClick={() => setSectorFilter(sector)}
                      className={`px-2 py-0.5 text-xs rounded-full capitalize ${sectorFilter === sector ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {sector}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {filteredDeepDive.map((item) => (
                  <IntelligenceItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {opportunityItems.length > 0 && (
            <div className="px-4 py-3 border-t">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Opportunities</h4>
              <div className="space-y-2">
                {opportunityItems.map((item) => (
                  <IntelligenceItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Toggle */}
      <div className="px-4 py-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs text-muted-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3 mr-1" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3 mr-1" />
              Show {deepDiveItems.length + opportunityItems.length} more items
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
