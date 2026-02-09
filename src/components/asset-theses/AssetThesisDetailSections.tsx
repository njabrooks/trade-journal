'use client';

import { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { EditAssetThesisButton } from '@/components/asset-theses/EditAssetThesisButton';
import { UnifiedClaimsBrowser } from '@/components/research/UnifiedClaimsBrowser';
import { LinkedMacroThesesSection } from '@/components/asset-theses/LinkedMacroThesesSection';
import { LinkedStrategiesSection } from '@/components/asset-theses/LinkedStrategiesSection';
import { NewsArchiveSection } from '@/components/asset-theses/NewsArchiveSection';
import { TriageAlertSection } from '@/components/asset-theses/TriageAlertSection';
import { ThesisArticulationDisplay } from '@/components/thesis-synthesis/ThesisArticulationDisplay';
import { SynthesizeButton } from '@/components/thesis/SynthesizeButton';
import { SignalsSection } from '@/components/signals/SignalsSection';
import type { ThesisArticulation, ValidationPoint } from '@/db/schema';
import type { getAssetThesisById, getMainClaimsWithSourcesForAssetThesis } from '@/db/queries/assetTheses';
import type { MacroThesisListItem } from '@/db/queries/macroTheses';
import type { StrategyListItem } from '@/db/queries/strategies';

type ClaimWithSource = Awaited<ReturnType<typeof getMainClaimsWithSourcesForAssetThesis>>[number];
type AssetThesisView = NonNullable<Awaited<ReturnType<typeof getAssetThesisById>>>;

interface AssetThesisDetailSectionsProps {
  view: AssetThesisView;
  claimsWithSources: ClaimWithSource[];
  linkedMacroTheses: MacroThesisListItem[];
  linkedStrategies: StrategyListItem[];
  articulation: ThesisArticulation | null;
  validationPoints: ValidationPoint[];
}

export function AssetThesisDetailSections({
  view,
  claimsWithSources,
  linkedMacroTheses,
  linkedStrategies,
  articulation,
  validationPoints,
}: AssetThesisDetailSectionsProps) {
  const currentClaimCount = claimsWithSources?.length ?? 0;
  // Use thesis-level claimsCountAtLastArticulation (set by insert script) for accurate tracking
  // This is more reliable than articulation.claimIdsUsed which only contains explicitly referenced claims
  const articulationClaimCount = view.claimsCountAtLastArticulation ?? 0;
  const newClaimsSinceArticulation = currentClaimCount - articulationClaimCount;

  // Legacy summary staleness (for fallback display)
  const newClaimsSinceSummary = currentClaimCount - (view.aiSummaryClaimCount ?? 0);
  const summaryDaysOld = view.aiSummaryGeneratedAt
    ? Math.floor((Date.now() - new Date(view.aiSummaryGeneratedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Determine which sections should be expanded by default
  const defaultExpanded: string[] = ['overview', 'core-argument'];
  if (validationPoints.length > 0) defaultExpanded.push('validation-points');

  const [expandedSections, setExpandedSections] = useState<string[]>(defaultExpanded);

  // Determine what content to show in Core Argument section
  const hasCoreArgument = !!articulation;
  const hasLegacySummary = !!view.aiSummary;
  const hasDescription = !!view.description;

  return (
    <div className="bg-card rounded-lg border overflow-hidden">
      <Accordion
        type="multiple"
        value={expandedSections}
        onValueChange={setExpandedSections}
      >
        {/* Overview */}
        <AccordionItem value="overview">
          <AccordionTrigger className="px-4">
            <span className="font-semibold">Overview</span>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <div className="flex justify-end mb-2">
              <EditAssetThesisButton thesis={view} />
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Underlying</dt>
                <dd className="mt-0.5 text-sm text-foreground font-mono">
                  {view.underlying?.ticker ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Direction</dt>
                <dd className="mt-0.5">
                  {view.direction ? (
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      view.direction === 'bullish' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
                      view.direction === 'bearish' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                      'bg-muted text-foreground'
                    }`}>
                      {view.direction}
                    </span>
                  ) : <span className="text-sm text-muted-foreground">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Time Horizon</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {view.timeHorizon?.replace('_', ' ') ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Confidence</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {view.confidenceLevel ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                <dd className="mt-0.5">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    view.status === 'draft' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                    view.status === 'active' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                    view.status === 'complete' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
                    view.status === 'rejected' ? 'bg-muted text-muted-foreground' :
                    'bg-muted text-foreground'
                  }`}>
                    {view.status}
                  </span>
                </dd>
              </div>
              {view.targetPrice && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Target Price</dt>
                  <dd className="mt-0.5 text-sm text-foreground font-mono">
                    ${Number(view.targetPrice).toFixed(2)}
                  </dd>
                </div>
              )}
              {view.entryReferencePrice && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Entry Reference</dt>
                  <dd className="mt-0.5 text-sm text-foreground font-mono">
                    ${Number(view.entryReferencePrice).toFixed(2)}
                  </dd>
                </div>
              )}
            </dl>
          </AccordionContent>
        </AccordionItem>

        {/* Triage Alerts - Pending monitoring items requiring attention */}
        <AccordionItem value="triage-alerts">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-semibold">Triage Alerts</span>
              <span className="text-xs text-amber-600">Action Required</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <TriageAlertSection thesisId={view.id} thesisType="asset" />
          </AccordionContent>
        </AccordionItem>

        {/* Core Argument Section - Primary thesis overview */}
        <AccordionItem value="core-argument">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-semibold">Core Argument</span>
              {hasCoreArgument && articulation && (
                <span className="text-xs text-muted-foreground">
                  v{articulation.version} • {new Date(articulation.createdAt).toLocaleDateString('en-GB')}
                </span>
              )}
              {!hasCoreArgument && hasLegacySummary && (
                <span className="text-xs text-amber-600">
                  (legacy summary)
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            {/* Synthesize Button - shown when synthesis is recommended */}
            <div className="flex justify-end mb-3">
              <SynthesizeButton
                thesisId={view.id}
                thesisType="asset"
                thesisTitle={view.title}
                claimCount={currentClaimCount}
                hasArticulation={hasCoreArgument}
                articulationClaimCount={articulationClaimCount}
              />
            </div>

            {/* Priority 1: Show articulation Core Argument */}
            {hasCoreArgument && articulation && (
              <ThesisArticulationDisplay
                articulation={articulation}
                claimCount={currentClaimCount}
                claimsAtLastArticulation={articulationClaimCount}
              />
            )}

            {/* Priority 2: Show legacy ai_summary with upgrade prompt */}
            {!hasCoreArgument && hasLegacySummary && (
              <div className="space-y-4">
                <div className="text-sm whitespace-pre-wrap text-slate-900">
                  {view.aiSummary}
                </div>

                {/* Staleness warning for legacy summary */}
                {newClaimsSinceSummary >= 3 && (
                  <div className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                    ⚠️ {newClaimsSinceSummary} new claims added since generation
                  </div>
                )}
                {newClaimsSinceSummary < 3 && summaryDaysOld >= 30 && (
                  <div className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-300">
                    ⚠️ Summary is {summaryDaysOld} days old
                  </div>
                )}

                {/* Upgrade prompt */}
                <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    💡 This is a legacy summary. Run{' '}
                    <code className="px-1 bg-blue-100 dark:bg-blue-900/30 rounded font-mono">/build-core-argument</code>
                    {' '}to create a full articulation with key drivers, assumptions, and validation points.
                  </p>
                </div>

                {/* Also show manual description if exists */}
                {hasDescription && (
                  <div className="pt-3 border-t border-border">
                    <span className="text-xs font-medium text-muted-foreground block mb-2">
                      MANUAL DESCRIPTION
                    </span>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {view.description}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Priority 3: Show description only */}
            {!hasCoreArgument && !hasLegacySummary && hasDescription && (
              <div className="space-y-4">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {view.description}
                </p>

                {/* Create articulation prompt */}
                <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    💡 Run{' '}
                    <code className="px-1 bg-blue-100 dark:bg-blue-900/30 rounded font-mono">/build-core-argument</code>
                    {' '}to create an articulation with key drivers, assumptions, and validation points.
                  </p>
                </div>
              </div>
            )}

            {/* Priority 4: No content - show create prompt */}
            {!hasCoreArgument && !hasLegacySummary && !hasDescription && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">
                  No articulation exists yet for this thesis.
                </p>
                <p className="text-xs text-muted-foreground">
                  Use{' '}
                  <code className="px-1.5 py-0.5 bg-muted rounded font-mono">
                    /build-core-argument
                  </code>{' '}
                  to generate a Core Argument with key drivers, assumptions, and validation points.
                </p>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Signals - Separate section for accountability */}
        <AccordionItem value="validation-points">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-semibold">Signals</span>
              <span className="text-xs text-muted-foreground">
                ({validationPoints.length})
              </span>
              {validationPoints.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {validationPoints.filter(p => p.type === 'confirmation').length} confirmation •{' '}
                  {validationPoints.filter(p => p.type === 'warning').length} warning
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <SignalsSection
              signals={validationPoints}
              thesisId={view.id}
              thesisType="asset"
              thesisTitle={view.title}
            />
          </AccordionContent>
        </AccordionItem>

        {/* News Archive - Monitoring Results */}
        <AccordionItem value="news-archive">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-semibold">News Archive</span>
              <span className="text-xs text-muted-foreground">Monitoring</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <NewsArchiveSection thesisId={view.id} thesisType="asset" />
          </AccordionContent>
        </AccordionItem>

        {/* Underlying Market Data */}
        {view.underlying && (
          <AccordionItem value="market-data">
            <AccordionTrigger className="px-4">
              <span className="font-semibold">Underlying Market Data</span>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Name</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{view.underlying.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Asset Class</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{view.underlying.assetClass ?? '—'}</dd>
                </div>
                {view.underlying.spot && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Spot</dt>
                    <dd className="mt-0.5 text-sm text-foreground font-mono">
                      ${Number(view.underlying.spot).toFixed(2)}
                    </dd>
                  </div>
                )}
                {view.underlying.iv30 && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">IV30</dt>
                    <dd className="mt-0.5 text-sm text-foreground font-mono">
                      {(Number(view.underlying.iv30) * 100).toFixed(1)}%
                    </dd>
                  </div>
                )}
              </dl>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Main Claims */}
        <AccordionItem value="claims">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-semibold">Main Claims</span>
              <span className="text-xs text-muted-foreground">({claimsWithSources.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            {claimsWithSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No main claims linked to this thesis yet.</p>
            ) : (
              <UnifiedClaimsBrowser claimsWithSources={claimsWithSources} />
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Linked Macro Theses */}
        <AccordionItem value="macro-theses">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-semibold">Linked Macro Theses</span>
              <span className="text-xs text-muted-foreground">({linkedMacroTheses.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <LinkedMacroThesesSection
              assetThesisId={view.id}
              assetThesisTitle={view.title}
              linkedMacroTheses={linkedMacroTheses}
              embedded={true}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Linked Strategies */}
        <AccordionItem value="strategies">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-semibold">Linked Strategies</span>
              <span className="text-xs text-muted-foreground">({linkedStrategies.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <LinkedStrategiesSection
              assetThesisId={view.id}
              assetThesisTitle={view.title}
              linkedStrategies={linkedStrategies}
              embedded={true}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Notes */}
        {view.notes !== null && view.notes !== undefined && (
          <AccordionItem value="notes">
            <AccordionTrigger className="px-4">
              <span className="font-semibold">Notes</span>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <pre className="text-sm text-foreground whitespace-pre-wrap">
                {JSON.stringify(view.notes, null, 2)}
              </pre>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
