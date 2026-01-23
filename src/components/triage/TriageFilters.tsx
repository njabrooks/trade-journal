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
  basePath?: string;
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
  basePath = "/triage",
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
        basePath={basePath}
      />
      <MultiSelectFilter
        label="Context"
        options={allContexts}
        selected={contextFilter}
        paramKey="contextLevel"
        allParams={allParams}
        counts={contextCounts}
        basePath={basePath}
      />
      <MultiSelectFilter
        label="Trigger"
        options={allTriggers}
        selected={triggerFilter}
        paramKey="recommendedAction"
        allParams={allParams}
        counts={triggerCounts}
        basePath={basePath}
      />
      {allStrategies.length > 0 && (
        <MultiSelectFilter
          label="Strategy"
          options={allStrategies}
          selected={strategyFilter}
          paramKey="strategyKey"
          allParams={allParams}
          counts={strategyCounts}
          basePath={basePath}
        />
      )}
      <span className="ml-auto text-xs text-muted-foreground">
        {totalFlags} flags
      </span>
    </div>
  );
}

