'use client';

import { useState } from 'react';
import { AddMappingDialog } from './AddMappingDialog';
import { MappingsList } from './MappingsList';

interface MappingsSectionProps {
  insightId: string | null;
  artifactStatus: string;
}

export function MappingsSection({ insightId, artifactStatus }: MappingsSectionProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleMappingCreated = () => {
    // Trigger refresh of mappings list
    setRefreshTrigger((prev) => prev + 1);
  };

  // Only show if we have structured insights
  if (!insightId || artifactStatus !== 'structured') {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Links to Hierarchy</h3>
        <AddMappingDialog
          researchInsightId={insightId}
          onMappingCreated={handleMappingCreated}
        />
      </div>

      <div className="text-sm text-gray-600 mb-4">
        Link this research to your belief hierarchy as supporting evidence, counter-evidence, or
        exploratory research.
      </div>

      <MappingsList insightId={insightId} refreshTrigger={refreshTrigger} />
    </div>
  );
}
