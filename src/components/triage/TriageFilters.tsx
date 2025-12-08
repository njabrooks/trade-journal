"use client";

import { MultiSelectFilter } from "./MultiSelectFilter";

interface TriageFiltersProps {
  severityFilter: string[];
  contextFilter: string[];
  triggerFilter: string[];
  strategyFilter: string[];
  allSeverities: string[];
  allContexts: string[];
  allTriggers: string[];
  allStrategies: string[];
  severityCounts: Record<string, number>;
  contextCounts: Record<string, number>;
  triggerCounts: Record<string, number>;
  strategyCounts: Record<string, number>;
  totalFlags: number;
}

export function TriageFilters({
  severityFilter,
  contextFilter,
  triggerFilter,
  strategyFilter,
  allSeverities,
  allContexts,
  allTriggers,
  allStrategies,
  severityCounts,
  contextCounts,
  triggerCounts,
  strategyCounts,
  totalFlags,
}: TriageFiltersProps) {
  const allParams = {
    severity: severityFilter,
    contextLevel: contextFilter,
    recommendedAction: triggerFilter,
    strategyKey: strategyFilter,
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <MultiSelectFilter
        label="Severity"
        options={allSeverities}
        selected={severityFilter}
        paramKey="severity"
        allParams={allParams}
        counts={severityCounts}
      />
      <MultiSelectFilter
        label="Context"
        options={allContexts}
        selected={contextFilter}
        paramKey="contextLevel"
        allParams={allParams}
        counts={contextCounts}
      />
      <MultiSelectFilter
        label="Trigger"
        options={allTriggers}
        selected={triggerFilter}
        paramKey="recommendedAction"
        allParams={allParams}
        counts={triggerCounts}
      />
      {allStrategies.length > 0 && (
        <MultiSelectFilter
          label="Strategy"
          options={allStrategies}
          selected={strategyFilter}
          paramKey="strategyKey"
          allParams={allParams}
          counts={strategyCounts}
        />
      )}
      <span className="ml-auto text-xs text-slate-400">
        {totalFlags} flags
      </span>
    </div>
  );
}

