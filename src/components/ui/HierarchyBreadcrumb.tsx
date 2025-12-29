'use client';

/**
 * HierarchyBreadcrumb - Visual flow diagram showing hierarchy chain
 *
 * Displays the full hierarchy path from Macro Thesis → Asset Thesis → Strategy → Position
 * with visual indicators for linked (green) and missing (amber) connections.
 *
 * Part of Phase 2.6.6: Enhanced Hierarchy Linking UX
 */

import Link from 'next/link';
import { AlertTriangle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HierarchyLevel {
  id: string;
  title: string;
}

interface HierarchyBreadcrumbProps {
  macroThesis?: HierarchyLevel | null;
  assetView?: HierarchyLevel | null;
  strategy?: HierarchyLevel | null;
  position?: HierarchyLevel | null;
  currentLevel: 'macro_thesis' | 'asset_view' | 'strategy' | 'position';
  onLinkMacroThesis?: () => void;
  onLinkAssetThesis?: () => void;
  showFullPath?: boolean; // Show all levels vs just relevant ones
}

export function HierarchyBreadcrumb({
  macroThesis,
  assetView,
  strategy,
  position,
  currentLevel,
  onLinkMacroThesis,
  onLinkAssetThesis,
  showFullPath = false,
}: HierarchyBreadcrumbProps) {
  // Determine which levels to show based on current level and showFullPath
  const levels = [];

  // Always try to show Macro Thesis → Asset Thesis → Strategy chain
  if (currentLevel === 'strategy' || currentLevel === 'position' || showFullPath) {
    levels.push({
      type: 'macro_thesis' as const,
      label: 'Macro Thesis',
      data: macroThesis,
      href: macroThesis ? `/theses/${macroThesis.id}` : null,
      onLink: onLinkMacroThesis,
      required: false, // Recommended but not required
    });

    levels.push({
      type: 'asset_view' as const,
      label: 'Asset Thesis',
      data: assetView,
      href: assetView ? `/asset-theses/${assetView.id}` : null,
      onLink: onLinkAssetThesis,
      required: true, // Required for strategies
    });
  }

  if (currentLevel === 'asset_view' || showFullPath) {
    // When viewing Asset Thesis, show Macro Thesis → Asset Thesis
    if (levels.length === 0) {
      levels.push({
        type: 'macro_thesis' as const,
        label: 'Macro Thesis',
        data: macroThesis,
        href: macroThesis ? `/theses/${macroThesis.id}` : null,
        onLink: onLinkMacroThesis,
        required: true, // Required for asset thesiss
      });
    }
  }

  // Add current level
  if (currentLevel === 'strategy' && strategy) {
    levels.push({
      type: 'strategy' as const,
      label: 'Strategy',
      data: strategy,
      href: null, // Current level, no navigation
      onLink: undefined,
      required: false,
    });
  } else if (currentLevel === 'position' && position) {
    levels.push({
      type: 'position' as const,
      label: 'Position',
      data: position,
      href: null,
      onLink: undefined,
      required: false,
    });
  }

  if (levels.length === 0) {
    return null; // Nothing to show
  }

  return (
    <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg px-6 py-4">
      <div className="flex items-center gap-3 flex-wrap">
        {levels.map((level, index) => {
          const isLinked = !!level.data;
          const isCurrent = level.type === currentLevel;
          const showArrow = index < levels.length - 1;

          return (
            <div key={level.type} className="flex items-center gap-3">
              {/* Level Box */}
              <div
                className={cn(
                  'group relative flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all',
                  isCurrent && 'ring-2 ring-blue-500 ring-offset-2',
                  isLinked
                    ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                    : level.required
                    ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                    : 'border-slate-300 bg-slate-100 hover:bg-slate-200'
                )}
              >
                {/* Level Label */}
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] uppercase tracking-wide font-medium text-slate-500">
                    {level.label}
                  </span>

                  {isLinked && level.data ? (
                    level.href ? (
                      <Link
                        href={level.href}
                        className="text-sm font-medium text-slate-900 hover:text-blue-600 truncate"
                      >
                        {level.data.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {level.data.title}
                      </span>
                    )
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {level.required && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                      )}
                      <span className="text-xs font-medium text-slate-600">
                        {level.required ? 'Required' : 'Not linked'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Link Button (for missing links) */}
                {!isLinked && level.onLink && (
                  <button
                    onClick={level.onLink}
                    className={cn(
                      'flex items-center justify-center w-6 h-6 rounded-full transition-all',
                      level.required
                        ? 'bg-amber-200 text-amber-700 hover:bg-amber-300'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    )}
                    title={`Link to ${level.label}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Connector Arrow */}
              {showArrow && (
                <svg
                  className="h-5 w-5 text-slate-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Helper Text */}
      {levels.some(l => !l.data && l.required) && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-600">
            <AlertTriangle className="inline h-3.5 w-3.5 text-amber-600 mr-1" />
            Required links are missing. Click the <Plus className="inline h-3 w-3 mx-0.5" /> button to link.
          </p>
        </div>
      )}
    </div>
  );
}
