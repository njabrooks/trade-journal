'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  count,
  defaultExpanded = true,
  children,
  headerRight,
  className = '',
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={`bg-card rounded-lg border ${className}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <h3 className="text-base font-semibold text-foreground">
            {title}
            {count !== undefined && (
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                ({count})
              </span>
            )}
          </h3>
        </div>
        {headerRight && (
          <div onClick={(e) => e.stopPropagation()}>
            {headerRight}
          </div>
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
