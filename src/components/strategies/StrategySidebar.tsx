'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { EntitySidebar } from '@/components/layout/EntitySidebar';
import { EntityStatusBadge } from '@/components/ui/badge';
import { StrategyConfirmationDialog } from '@/components/strategies/StrategyConfirmationDialog';
import { ChevronRight, Pencil, CheckCircle } from 'lucide-react';

interface LinkedMacroThesis {
  id: string;
  title: string;
}

interface LinkedAssetThesis {
  id: string;
  title: string;
  ticker?: string | null;
}

interface StrategySidebarProps {
  strategy: {
    id: string;
    strategyKey: string;
    label: string | null;
    strategyType: string | null;
    templateLabel: string | null;
    underlyingTicker: string | null;
    openedAt: Date | null;
    closedAt: Date | null;
    status: string;
    direction?: string | null;
    assetThesisId?: string | null;
  };
  /** Counts for related entities */
  openPositionsCount?: number;
  triageCount?: number;
  signalsCount?: number;
  /** Linked macro theses for hierarchy display */
  linkedMacroTheses?: LinkedMacroThesis[];
  /** Linked asset thesis for hierarchy display */
  linkedAssetThesis?: LinkedAssetThesis | null;
}

export function StrategySidebar({
  strategy,
  openPositionsCount,
  triageCount,
  signalsCount,
  linkedMacroTheses = [],
  linkedAssetThesis,
}: StrategySidebarProps) {
  const router = useRouter();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Check if strategy needs confirmation (draft status or missing required fields)
  const needsConfirmation = strategy.status === 'draft' || !strategy.strategyType || !linkedAssetThesis;

  const handleConfirmSuccess = () => {
    setShowConfirmDialog(false);
    router.refresh();
  };

  // Contextual hint text based on strategy state
  const getContextualHint = (): string | null => {
    if (strategy.status === 'draft') return 'Needs type, direction, and thesis link';
    if (strategy.status === 'active' && !linkedAssetThesis) return 'No thesis linked';
    if (strategy.status === 'complete' && strategy.closedAt) return 'Manually closed — can reopen';
    if (strategy.status === 'rejected') return 'Rejected — can reconsider';
    return null;
  };
  const contextualHint = getContextualHint();

  // Build metadata items for Quick Stats
  const metadata = [
    { label: 'Strategy Type', value: strategy.strategyType ?? '—' },
    { label: 'Template', value: strategy.templateLabel ?? '—' },
    { label: 'Underlying', value: strategy.underlyingTicker ?? '—' },
    {
      label: 'Opened',
      value: strategy.openedAt
        ? new Date(strategy.openedAt).toLocaleDateString('en-GB')
        : '—',
    },
    {
      label: 'Status',
      value: <EntityStatusBadge status={strategy.status} />,
    },
  ];


  // Hierarchy accordion section
  const hierarchySection = (
    <AccordionItem value="hierarchy" className="border-b">
      <AccordionTrigger className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline">
        Hierarchy
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <div className="space-y-3">
          {/* Linked Macro Theses (upstream) */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Macro Theses</p>
            {linkedMacroTheses.length > 0 ? (
              <div className="space-y-1">
                {linkedMacroTheses.map((mt) => (
                  <Link
                    key={mt.id}
                    href={`/macro-theses/${mt.id}`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-muted rounded px-2 py-1 -mx-2 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
                    <span className="truncate">{mt.title}</span>
                    <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-2">No linked macro theses</p>
            )}
          </div>

          {/* Linked Asset Thesis */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Asset Thesis</p>
            {linkedAssetThesis ? (
              <Link
                href={`/asset-theses/${linkedAssetThesis.id}`}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-muted rounded px-2 py-1 -mx-2 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                <span className="truncate">{linkedAssetThesis.title}</span>
                {linkedAssetThesis.ticker && (
                  <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                    {linkedAssetThesis.ticker}
                  </span>
                )}
                <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground italic px-2">No linked asset thesis</p>
            )}
          </div>

          {/* Current Strategy */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Current</p>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground bg-emerald-50 dark:bg-emerald-900/30 rounded px-2 py-1.5 -mx-2 border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="truncate">{strategy.label ?? strategy.strategyKey}</span>
              {strategy.underlyingTicker && (
                <span className="text-xs text-muted-foreground font-mono ml-auto flex-shrink-0">
                  {strategy.underlyingTicker}
                </span>
              )}
            </div>
          </div>

          {/* Positions (downstream) */}
          {openPositionsCount !== undefined && openPositionsCount > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Positions</p>
              <Link
                href={`/strategies/${strategy.id}/overview`}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-muted rounded px-2 py-1 -mx-2 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                <span>{openPositionsCount} open position{openPositionsCount !== 1 ? 's' : ''}</span>
                <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
              </Link>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );

  return (
    <>
      <EntitySidebar
        metadata={metadata}
        actions={
          <div className="space-y-2">
            {/* Primary action: Confirm or Edit Strategy */}
            <button
              onClick={() => setShowConfirmDialog(true)}
              className={
                needsConfirmation
                  ? 'inline-flex items-center justify-center gap-2 w-full px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors'
                  : 'inline-flex items-center justify-center gap-2 w-full px-3 py-1.5 text-sm font-medium text-foreground bg-card border rounded-md hover:bg-muted transition-colors'
              }
            >
              {needsConfirmation ? (
                <><CheckCircle className="h-4 w-4" /> Confirm Strategy</>
              ) : (
                <><Pencil className="h-4 w-4" /> Edit Strategy</>
              )}
            </button>
            {/* Contextual hint */}
            {contextualHint && (
              <p className="text-xs text-muted-foreground px-1">{contextualHint}</p>
            )}
            {/* Link Positions - separate operation */}
            <Link
              href={`/admin/strategies/${strategy.id}/link`}
              className="inline-flex items-center justify-center gap-2 w-full px-3 py-1.5 text-sm font-medium text-foreground bg-card border rounded-md hover:bg-muted transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Link Positions
            </Link>
          </div>
        }
        additionalSections={hierarchySection}
        defaultExpanded={['quick-stats', 'hierarchy']}
      />

      {/* Strategy Confirmation Dialog */}
      <StrategyConfirmationDialog
        strategy={{
          id: strategy.id,
          strategyKey: strategy.strategyKey,
          underlyingTicker: strategy.underlyingTicker,
          label: strategy.label,
          status: strategy.status,
          strategyType: strategy.strategyType,
          direction: strategy.direction,
          assetThesisId: strategy.assetThesisId ?? linkedAssetThesis?.id,
          closedAt: strategy.closedAt,
        }}
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onSuccess={handleConfirmSuccess}
      />
    </>
  );
}
