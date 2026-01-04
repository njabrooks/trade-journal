'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProvenanceLevelProps {
  type: 'position' | 'strategy' | 'asset-thesis' | 'macro-thesis' | 'claims';
  title: string;
  count: number;
  status: 'linked' | 'missing' | 'weak-evidence';
  children: ReactNode;
  href?: string;
  defaultExpanded?: boolean;
}

const TYPE_LABELS: Record<ProvenanceLevelProps['type'], string> = {
  position: 'Positions',
  strategy: 'Strategy',
  'asset-thesis': 'Asset Thesis',
  'macro-thesis': 'Macro Theses',
  claims: 'Claims',
};

const STATUS_STYLES: Record<ProvenanceLevelProps['status'], string> = {
  linked: 'border-green-500 bg-green-50',
  missing: 'border-amber-500 bg-amber-50',
  'weak-evidence': 'border-yellow-500 bg-yellow-50',
};

export function ProvenanceLevel({
  type,
  title,
  count,
  status,
  children,
  href,
  defaultExpanded = false,
}: ProvenanceLevelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const typeLabel = TYPE_LABELS[type];
  const borderStyle = STATUS_STYLES[status];

  const header = (
    <div
      className="flex items-center justify-between cursor-pointer p-4"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {typeLabel}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{title}</span>
          <span className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            status === 'linked' ? 'bg-green-100 text-green-800' :
            status === 'missing' ? 'bg-amber-100 text-amber-800' :
            'bg-yellow-100 text-yellow-800'
          )}>
            {count}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {href && (
          <Link
            href={href}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View Details
          </Link>
        )}
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-white shadow-sm transition-all',
        borderStyle
      )}
    >
      {header}
      {isExpanded && (
        <div className="border-t border-slate-200 p-4 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}
