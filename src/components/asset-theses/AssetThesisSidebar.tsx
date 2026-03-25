'use client';

import Link from 'next/link';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { EntitySidebar } from '@/components/layout/EntitySidebar';
import { EditAssetThesisButton } from './EditAssetThesisButton';
import type { getAssetThesisById } from '@/db/queries/assetTheses';
import { ChevronRight } from 'lucide-react';

type AssetThesisView = NonNullable<Awaited<ReturnType<typeof getAssetThesisById>>>;

interface LinkedMacroThesis {
  id: string;
  title: string;
}

interface LinkedStrategy {
  id: string;
  label: string | null;
  strategyKey: string;
}

interface AssetThesisSidebarProps {
  thesis: AssetThesisView;
  linkedMacroThesesCount: number;
  linkedStrategiesCount: number;
  claimsCount: number;
  signalsCount: number;
  /** Linked macro theses for hierarchy display */
  linkedMacroTheses?: LinkedMacroThesis[];
  /** Linked strategies for hierarchy display */
  linkedStrategies?: LinkedStrategy[];
}

export function AssetThesisSidebar({
  thesis,
  linkedMacroThesesCount,
  linkedStrategiesCount,
  claimsCount,
  signalsCount,
  linkedMacroTheses = [],
  linkedStrategies = [],
}: AssetThesisSidebarProps) {
  // Build metadata items for Quick Stats
  const metadata = [
    { label: 'Underlying', value: thesis.underlying?.ticker ?? '—' },
    {
      label: 'Direction',
      value: thesis.direction ? (
        <span
          className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${
            thesis.direction === 'bullish'
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : thesis.direction === 'bearish'
                ? 'bg-destructive/15 text-destructive'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {thesis.direction}
        </span>
      ) : (
        '—'
      ),
    },
    { label: 'Time Horizon', value: thesis.timeHorizon?.replace('_', ' ') ?? '—' },
    { label: 'Confidence', value: thesis.confidenceLevel ?? '—' },
  ];

  // Add target price if exists
  if (thesis.targetPrice) {
    metadata.push({
      label: 'Target Price',
      value: `$${Number(thesis.targetPrice).toFixed(2)}`,
    });
  }

  // Add entry reference if exists
  if (thesis.entryReferencePrice) {
    metadata.push({
      label: 'Entry Reference',
      value: `$${Number(thesis.entryReferencePrice).toFixed(2)}`,
    });
  }

  // Add market data if underlying exists
  if (thesis.underlying) {
    if (thesis.underlying.assetClass) {
      metadata.push({ label: 'Asset Class', value: thesis.underlying.assetClass });
    }
    if (thesis.underlying.spot) {
      metadata.push({
        label: 'Spot',
        value: `$${Number(thesis.underlying.spot).toFixed(2)}`,
      });
    }
    if (thesis.underlying.iv30) {
      metadata.push({
        label: 'IV30',
        value: `${(Number(thesis.underlying.iv30) * 100).toFixed(1)}%`,
      });
    }
  }


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
                    className="flex items-center gap-2 text-sm text-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:underline rounded px-2 py-1 -mx-2 transition-colors"
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

          {/* Current Asset Thesis */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Current</p>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground bg-blue-50 dark:bg-blue-900/30 rounded px-2 py-1.5 -mx-2 border border-blue-200 dark:border-blue-800">
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="truncate">{thesis.title}</span>
              {thesis.underlying?.ticker && (
                <span className="text-xs text-muted-foreground font-mono ml-auto flex-shrink-0">
                  {thesis.underlying.ticker}
                </span>
              )}
            </div>
          </div>

          {/* Linked Strategies (downstream) */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Strategies</p>
            {linkedStrategies.length > 0 ? (
              <div className="space-y-1">
                {linkedStrategies.map((s) => (
                  <Link
                    key={s.id}
                    href={`/strategies/${s.id}/overview`}
                    className="flex items-center gap-2 text-sm text-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:underline rounded px-2 py-1 -mx-2 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="truncate">{s.label ?? s.strategyKey}</span>
                    <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-2">No linked strategies</p>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );

  return (
    <EntitySidebar
      metadata={metadata}
      actions={<EditAssetThesisButton thesis={thesis} className="w-full" />}
      additionalSections={hierarchySection}
      defaultExpanded={['quick-stats', 'hierarchy']}
    />
  );
}
