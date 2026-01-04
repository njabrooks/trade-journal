'use client';

import Link from 'next/link';
import { ProvenanceLevel } from './ProvenanceLevel';
import { cn } from '@/lib/utils';

interface MacroThesisInfo {
  id: string;
  title: string;
  confidenceLevel: string | null;
  status: string;
}

interface MacroThesesLevelProps {
  macroTheses: MacroThesisInfo[];
}

const CONVICTION_COLORS: Record<string, string> = {
  'high': 'bg-green-100 text-green-800',
  'medium': 'bg-yellow-100 text-yellow-800',
  'low': 'bg-slate-100 text-slate-800',
};

const STATUS_COLORS: Record<string, string> = {
  'active': 'border-green-500',
  'monitoring': 'border-blue-500',
  'invalidated': 'border-red-500',
  'archived': 'border-slate-300',
};

export function MacroThesesLevel({ macroTheses }: MacroThesesLevelProps) {
  const count = macroTheses.length;
  const status = count > 0 ? 'linked' : 'weak-evidence';
  const title = count === 0
    ? 'No Macro Theses'
    : `${count} Macro ${count === 1 ? 'Thesis' : 'Theses'}`;

  return (
    <ProvenanceLevel
      type="macro-thesis"
      title={title}
      count={count}
      status={status}
      defaultExpanded={count > 0}
    >
      {count === 0 ? (
        <div className="text-sm text-slate-500">
          <p className="mb-2">
            No macro theses linked to the asset thesis.
          </p>
          <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
            <strong>Note:</strong> Linking macro theses provides broader market context for this strategy.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {macroTheses.map((thesis) => (
            <Link
              key={thesis.id}
              href={`/macro-theses/${thesis.id}`}
              className={cn(
                'block p-4 border-2 rounded-lg hover:shadow-md transition-all',
                STATUS_COLORS[thesis.status] || 'border-slate-300',
                'bg-white hover:bg-slate-50'
              )}
            >
              <div className="space-y-2">
                <div className="font-semibold text-sm leading-tight">
                  {thesis.title}
                </div>

                <div className="flex items-center gap-2">
                  {thesis.confidenceLevel && (
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                      CONVICTION_COLORS[thesis.confidenceLevel.toLowerCase()] || 'bg-slate-100 text-slate-800'
                    )}>
                      {thesis.confidenceLevel}
                    </span>
                  )}
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                    thesis.status === 'active' ? 'bg-green-100 text-green-800' :
                    thesis.status === 'monitoring' ? 'bg-blue-100 text-blue-800' :
                    thesis.status === 'invalidated' ? 'bg-red-100 text-red-800' :
                    'bg-slate-100 text-slate-600'
                  )}>
                    {thesis.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </ProvenanceLevel>
  );
}
