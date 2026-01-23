'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Target, AlertTriangle, Lightbulb, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ThesisArticulation } from '@/db/schema';

interface ThesisArticulationDisplayProps {
  articulation: ThesisArticulation;
  claimCount?: number;
  /** Claim count at time of last articulation (from thesis.claimsCountAtLastArticulation) */
  claimsAtLastArticulation?: number;
  onViewHistory?: () => void;
}

export function ThesisArticulationDisplay({
  articulation,
  claimCount,
  claimsAtLastArticulation,
  onViewHistory,
}: ThesisArticulationDisplayProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['drivers', 'assumptions'])
  );

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    setExpandedSections(next);
  };

  const timeframe = articulation.timeframe as { horizon?: string; expectedResolution?: string; keyMilestones?: string[] } | null;

  // keyDrivers can be string[] (legacy) or structured objects
  const rawDrivers = articulation.keyDrivers as Array<string | { driver: string; detail?: string; supporting_claims?: string[] }> || [];
  const keyDrivers = rawDrivers.map((d) =>
    typeof d === 'string' ? { driver: d, detail: undefined } : { driver: d.driver, detail: d.detail }
  );

  // keyAssumptions can be string[] (legacy) or structured objects
  const rawAssumptions = articulation.keyAssumptions as Array<string | { assumption: string; detail?: string }> || [];
  const keyAssumptions = rawAssumptions.map((a) =>
    typeof a === 'string' ? { assumption: a, detail: undefined } : { assumption: a.assumption, detail: a.detail }
  );

  const evidenceGaps = (articulation.evidenceGaps as string[]) || [];
  const referencedTheses = (articulation.referencedTheses as Array<{
    thesisId: string;
    thesisType: string;
    title?: string;
    thesisTitle?: string;
    relationship: string;
    notes?: string;
  }>) || [];
  const claimIdsUsed = (articulation.claimIdsUsed as string[]) || [];

  const confidenceColors: Record<string, string> = {
    low: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    medium: 'bg-amber-100 text-amber-700 dark:text-amber-300 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    high: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    very_high: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  };

  const horizonLabels: Record<string, string> = {
    immediate: 'Immediate (<1 month)',
    short_term: 'Short-term (1-3 months)',
    medium_term: 'Medium-term (3-12 months)',
    long_term: 'Long-term (1-3 years)',
    secular: 'Secular (3+ years)',
  };

  return (
    <div className="bg-card rounded-lg border border">
      {/* Header - Version and metadata */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              v{articulation.version}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {new Date(articulation.createdAt).toLocaleDateString('en-GB')}
            </span>
            <span className="text-xs text-muted-foreground">{claimIdsUsed.length} claims synthesized</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {onViewHistory && (
              <button
                onClick={onViewHistory}
                className="text-blue-600 hover:text-blue-700 hover:underline"
              >
                View history
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Confidence & Timeframe Row */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Confidence:</span>
            <span
              className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${
                confidenceColors[articulation.confidenceLevel] || 'bg-slate-100 text-foreground'
              }`}
            >
              {articulation.confidenceLevel.replace('_', ' ')}
            </span>
          </div>
          {timeframe?.horizon && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Horizon:</span>
              <span className="text-xs text-foreground">
                {horizonLabels[timeframe.horizon] || timeframe.horizon}
              </span>
            </div>
          )}
          {timeframe?.expectedResolution && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Expected:</span>
              <span className="text-xs text-foreground">{timeframe.expectedResolution}</span>
            </div>
          )}
        </div>

        {/* Core Argument Content */}
        <div>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {articulation.coreArgument}
          </p>
        </div>

        {/* Confidence Rationale */}
        {articulation.confidenceRationale && (
          <div className="bg-muted rounded-md p-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Confidence Rationale
            </h4>
            <p className="text-sm text-foreground">{articulation.confidenceRationale}</p>
          </div>
        )}

        {/* Key Drivers */}
        {keyDrivers.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('drivers')}
              className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-foreground"
            >
              {expandedSections.has('drivers') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <Target className="w-4 h-4 text-emerald-600" />
              Key Drivers ({keyDrivers.length})
            </button>
            {expandedSections.has('drivers') && (
              <ul className="mt-2 ml-6 space-y-2">
                {keyDrivers.map((driver, idx) => (
                  <li key={idx} className="text-sm text-foreground">
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-500 mt-1">•</span>
                      <div>
                        <span className="font-medium">{driver.driver}</span>
                        {driver.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{driver.detail}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Key Assumptions */}
        {keyAssumptions.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('assumptions')}
              className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-foreground"
            >
              {expandedSections.has('assumptions') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Key Assumptions ({keyAssumptions.length})
            </button>
            {expandedSections.has('assumptions') && (
              <ul className="mt-2 ml-6 space-y-2">
                {keyAssumptions.map((assumption, idx) => (
                  <li key={idx} className="text-sm text-foreground">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-500 mt-1">•</span>
                      <div>
                        <span className="font-medium">{assumption.assumption}</span>
                        {assumption.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{assumption.detail}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Evidence Gaps */}
        {evidenceGaps.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('gaps')}
              className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-foreground"
            >
              {expandedSections.has('gaps') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <Lightbulb className="w-4 h-4 text-blue-600" />
              Evidence Gaps ({evidenceGaps.length})
            </button>
            {expandedSections.has('gaps') && (
              <ul className="mt-2 ml-6 space-y-1">
                {evidenceGaps.map((gap, idx) => (
                  <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Referenced Theses (Compositional Dependencies) */}
        {referencedTheses.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection('dependencies')}
              className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-foreground"
            >
              {expandedSections.has('dependencies') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <Link2 className="w-4 h-4 text-purple-600" />
              Dependencies ({referencedTheses.length})
            </button>
            {expandedSections.has('dependencies') && (
              <div className="mt-2 ml-6 space-y-2">
                {referencedTheses.map((dep, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-sm p-2 bg-purple-50 dark:bg-purple-900/20 rounded-md"
                  >
                    <span
                      className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${
                        dep.relationship === 'depends_on'
                          ? 'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200'
                          : dep.relationship === 'supports'
                          ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200'
                          : 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200'
                      }`}
                    >
                      {dep.relationship.replace('_', ' ')}
                    </span>
                    <div>
                      <span className="font-medium text-foreground">{dep.title || dep.thesisTitle}</span>
                      <span className="text-muted-foreground ml-1">({dep.thesisType})</span>
                      {dep.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">{dep.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* User Edits Note */}
        {articulation.userEdits && (
          <div className="mt-4 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">User modifications:</span> {articulation.userEdits}
            </p>
          </div>
        )}

        {/* Staleness Check - compare current claims with claims at last articulation, not claimIdsUsed */}
        {claimCount !== undefined && claimsAtLastArticulation !== undefined && claimCount > claimsAtLastArticulation && (
          <div className="mt-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {claimCount - claimsAtLastArticulation} new claims added since this articulation.
              Consider re-synthesizing with <code className="px-1 bg-amber-100 dark:bg-amber-900/30 rounded">/synthesize-thesis</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
