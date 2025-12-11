"use client";

import { MultiSelectFilter } from "@/components/triage/MultiSelectFilter";

interface BlotterFiltersProps {
  sourceFilter: string[];
  actionClassFilter: string[];
  statusFilter: string[];
  strategyFilter: string[];
  followUpFilter: string[];
  allSources: string[];
  allActionClasses: string[];
  allStatuses: string[];
  allStrategies: string[];
  allFollowUps: string[];
  sourceCounts: Record<string, number>;
  actionClassCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  strategyCounts: Record<string, number>;
  followUpCounts: Record<string, number>;
  totalEntries: number;
  basePath?: string;
}

export function BlotterFilters({
  sourceFilter,
  actionClassFilter,
  statusFilter,
  strategyFilter,
  followUpFilter,
  allSources,
  allActionClasses,
  allStatuses,
  allStrategies,
  allFollowUps,
  sourceCounts,
  actionClassCounts,
  statusCounts,
  strategyCounts,
  followUpCounts,
  totalEntries,
  basePath = "/blotter",
}: BlotterFiltersProps) {
  const allParams = {
    source: sourceFilter,
    actionClass: actionClassFilter,
    status: statusFilter,
    strategyKey: strategyFilter,
    followUp: followUpFilter,
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <MultiSelectFilter
        label="Source"
        options={allSources}
        selected={sourceFilter}
        paramKey="source"
        allParams={allParams}
        counts={sourceCounts}
        basePath={basePath}
      />
      <MultiSelectFilter
        label="Action Class"
        options={allActionClasses}
        selected={actionClassFilter}
        paramKey="actionClass"
        allParams={allParams}
        counts={actionClassCounts}
        basePath={basePath}
      />
      <MultiSelectFilter
        label="Status"
        options={allStatuses}
        selected={statusFilter}
        paramKey="status"
        allParams={allParams}
        counts={statusCounts}
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
      <MultiSelectFilter
        label="Follow-up"
        options={allFollowUps}
        selected={followUpFilter}
        paramKey="followUp"
        allParams={allParams}
        counts={followUpCounts}
        basePath={basePath}
      />
      <span className="ml-auto text-xs text-slate-400">
        {totalEntries} entries
      </span>
    </div>
  );
}
