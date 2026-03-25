'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { EntitySidebar, type SidebarMetadataItem } from '@/components/layout/EntitySidebar';
import { EditMacroThesisButton } from '@/components/theses/EditMacroThesisButton';
import type { MacroThesis } from '@/db/schema';
import { ChevronRight } from 'lucide-react';

interface LinkedAssetThesis {
  id: string;
  title: string;
  ticker?: string | null;
}

interface LinkedStrategy {
  id: string;
  label: string | null;
  strategyKey: string;
}

interface MacroThesisSidebarProps {
  thesis: MacroThesis;
  linkedAssetThesesCount: number;
  linkedStrategiesCount: number;
  claimsCount: number;
  signalsCount: number;
  /** Linked asset theses for hierarchy display */
  linkedAssetTheses?: LinkedAssetThesis[];
  /** Linked strategies for hierarchy display */
  linkedStrategies?: LinkedStrategy[];
}

/**
 * Sidebar component for Macro Thesis detail pages.
 * Displays Quick Stats and Related entity counts.
 */
export function MacroThesisSidebar({
  thesis,
  linkedAssetThesesCount,
  linkedStrategiesCount,
  claimsCount,
  signalsCount,
  linkedAssetTheses = [],
  linkedStrategies = [],
}: MacroThesisSidebarProps) {
  const metadata: SidebarMetadataItem[] = [
    {
      label: 'Status',
      value: <StatusBadge status={thesis.status} />,
    },
    {
      label: 'Type',
      value: <span className="capitalize">{thesis.thesisType}</span>,
    },
    {
      label: 'Direction',
      value: thesis.direction ? <DirectionBadge direction={thesis.direction} /> : '—',
    },
    {
      label: 'Time Horizon',
      value: thesis.timeHorizon?.replace('_', ' ') ?? '—',
    },
    {
      label: 'Confidence',
      value: <span className="capitalize">{thesis.confidenceLevel ?? '—'}</span>,
    },
  ];

  // Add sectors if present
  if (thesis.sectors && thesis.sectors.length > 0) {
    metadata.push({
      label: 'Sectors',
      value: (
        <div className="flex flex-wrap gap-1 justify-end">
          {thesis.sectors.slice(0, 3).map((sector) => (
            <span
              key={sector}
              className="inline-flex px-1.5 py-0.5 text-xs font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-md"
            >
              {sector}
            </span>
          ))}
          {thesis.sectors.length > 3 && (
            <span className="text-xs text-muted-foreground">+{thesis.sectors.length - 3}</span>
          )}
        </div>
      ),
    });
  }


  // Hierarchy accordion section
  const hierarchySection = (
    <AccordionItem value="hierarchy" className="border-b">
      <AccordionTrigger className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline">
        Hierarchy
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <div className="space-y-3">
          {/* Current Macro Thesis */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Current</p>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground bg-purple-50 dark:bg-purple-900/30 rounded px-2 py-1.5 -mx-2 border border-purple-200 dark:border-purple-800">
              <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
              <span className="truncate">{thesis.title}</span>
            </div>
          </div>

          {/* Linked Asset Theses (downstream) */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Asset Theses</p>
            {linkedAssetTheses.length > 0 ? (
              <div className="space-y-1">
                {linkedAssetTheses.map((at) => (
                  <Link
                    key={at.id}
                    href={`/asset-theses/${at.id}`}
                    className="flex items-center gap-2 text-sm text-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:underline rounded px-2 py-1 -mx-2 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    <span className="truncate">{at.title}</span>
                    {at.ticker && (
                      <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        {at.ticker}
                      </span>
                    )}
                    <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-2">No linked asset theses</p>
            )}
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
      actions={
        <EditMacroThesisButton thesis={thesis} className="w-full" />
      }
      additionalSections={hierarchySection}
      defaultExpanded={['quick-stats', 'hierarchy']}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorClass =
    status === 'draft' ? 'bg-muted text-muted-foreground' :
    status === 'developing' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
    status === 'monitoring' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' :
    status === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
    status === 'complete' ? 'bg-muted text-muted-foreground' :
    status === 'rejected' ? 'bg-destructive/15 text-destructive' :
    'bg-muted text-muted-foreground';

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${colorClass}`}>
      {status}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const colorClass =
    direction === 'bullish' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
    direction === 'bearish' ? 'bg-destructive/15 text-destructive' :
    'bg-muted text-muted-foreground';

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${colorClass}`}>
      {direction}
    </span>
  );
}
