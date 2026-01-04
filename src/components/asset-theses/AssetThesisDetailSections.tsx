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
import { ThesisSynthesisSection } from '@/components/thesis-synthesis';
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
  const newClaims = currentClaimCount - (view.aiSummaryClaimCount ?? 0);
  const daysOld = view.aiSummaryGeneratedAt
    ? Math.floor((Date.now() - new Date(view.aiSummaryGeneratedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Determine which sections should be expanded by default
  const defaultExpanded: string[] = ['overview'];
  if (view.aiSummary || view.description) defaultExpanded.push('summary');
  if (articulation) defaultExpanded.push('articulation');

  const [expandedSections, setExpandedSections] = useState<string[]>(defaultExpanded);

  const hasSummary = view.aiSummary || view.description;

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <Accordion
        type="multiple"
        value={expandedSections}
        onValueChange={setExpandedSections}
      >
        {/* Overview */}
        <AccordionItem value="overview">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-semibold">Overview</span>
              <div onClick={(e) => e.stopPropagation()}>
                <EditAssetThesisButton thesis={view} />
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
              <div>
                <dt className="text-xs font-medium text-slate-500">Underlying</dt>
                <dd className="mt-0.5 text-sm text-slate-900 font-mono">
                  {view.underlying?.ticker ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Direction</dt>
                <dd className="mt-0.5">
                  {view.direction ? (
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      view.direction === 'bullish' ? 'bg-emerald-100 text-emerald-700' :
                      view.direction === 'bearish' ? 'bg-red-100 text-red-700' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {view.direction}
                    </span>
                  ) : <span className="text-sm text-slate-500">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Time Horizon</dt>
                <dd className="mt-0.5 text-sm text-slate-900">
                  {view.timeHorizon?.replace('_', ' ') ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Confidence</dt>
                <dd className="mt-0.5 text-sm text-slate-900">
                  {view.confidenceLevel ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Status</dt>
                <dd className="mt-0.5">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    view.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    view.status === 'under_review' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-200 text-slate-700'
                  }`}>
                    {view.status}
                  </span>
                </dd>
              </div>
              {view.targetPrice && (
                <div>
                  <dt className="text-xs font-medium text-slate-500">Target Price</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 font-mono">
                    ${Number(view.targetPrice).toFixed(2)}
                  </dd>
                </div>
              )}
              {view.entryReferencePrice && (
                <div>
                  <dt className="text-xs font-medium text-slate-500">Entry Reference</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 font-mono">
                    ${Number(view.entryReferencePrice).toFixed(2)}
                  </dd>
                </div>
              )}
            </dl>
          </AccordionContent>
        </AccordionItem>

        {/* Summary Section */}
        {hasSummary && (
          <AccordionItem value="summary">
            <AccordionTrigger className="px-4">
              <div className="flex items-center gap-3 flex-1">
                <span className="font-semibold">Summary</span>
                {view.aiSummary && view.aiSummaryGeneratedAt && (
                  <span className="text-xs text-slate-500">
                    {new Date(view.aiSummaryGeneratedAt).toLocaleDateString()} • {view.aiSummaryClaimCount} claims
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              {/* AI Summary */}
              {view.aiSummary && (
                <div className="mb-4">
                  <div className="text-sm whitespace-pre-wrap text-slate-900">
                    {view.aiSummary}
                  </div>

                  {/* Staleness warning */}
                  {newClaims >= 3 && (
                    <div className="mt-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                      ⚠️ {newClaims} new claims added since generation — consider regenerating with /generate-summary
                    </div>
                  )}
                  {newClaims < 3 && daysOld >= 30 && (
                    <div className="mt-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                      ⚠️ Summary is {daysOld} days old — consider regenerating with /generate-summary
                    </div>
                  )}
                </div>
              )}

              {/* Manual Description */}
              {view.description && (
                <div>
                  <span className="text-xs font-medium text-slate-500 block mb-2">
                    MANUAL DESCRIPTION
                  </span>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {view.description}
                  </p>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Thesis Articulation */}
        <AccordionItem value="articulation">
          <AccordionTrigger className="px-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-semibold">Thesis Articulation</span>
              {validationPoints.length > 0 && (
                <span className="text-xs text-slate-500">
                  {validationPoints.length} validation points
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <ThesisSynthesisSection
              thesisId={view.id}
              thesisType="asset"
              articulation={articulation}
              validationPoints={validationPoints}
              claimCount={claimsWithSources.length}
            />
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
                  <dt className="text-xs font-medium text-slate-500">Name</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{view.underlying.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Asset Class</dt>
                  <dd className="mt-0.5 text-sm text-slate-900">{view.underlying.assetClass ?? '—'}</dd>
                </div>
                {view.underlying.spot && (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Spot</dt>
                    <dd className="mt-0.5 text-sm text-slate-900 font-mono">
                      ${Number(view.underlying.spot).toFixed(2)}
                    </dd>
                  </div>
                )}
                {view.underlying.iv30 && (
                  <div>
                    <dt className="text-xs font-medium text-slate-500">IV30</dt>
                    <dd className="mt-0.5 text-sm text-slate-900 font-mono">
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
              <span className="text-xs text-slate-500">({claimsWithSources.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            {claimsWithSources.length === 0 ? (
              <p className="text-sm text-slate-500">No main claims linked to this thesis yet.</p>
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
              <span className="text-xs text-slate-500">({linkedMacroTheses.length})</span>
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
              <span className="text-xs text-slate-500">({linkedStrategies.length})</span>
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
              <pre className="text-sm text-slate-700 whitespace-pre-wrap">
                {JSON.stringify(view.notes, null, 2)}
              </pre>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
