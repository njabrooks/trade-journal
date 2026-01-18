import * as React from 'react';
import { cn } from '@/lib/utils';

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

/**
 * Simple label/value display row for metadata sidebars.
 * Displays label on left, value on right with consistent styling.
 */
export function InfoRow({ label, value, className }: InfoRowProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-medium text-slate-900">{value}</span>
    </div>
  );
}

interface InfoRowGroupProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Container for grouping InfoRow components with consistent spacing.
 */
export function InfoRowGroup({ children, className }: InfoRowGroupProps) {
  return (
    <dl className={cn('space-y-2 text-sm text-slate-600', className)}>
      {children}
    </dl>
  );
}
