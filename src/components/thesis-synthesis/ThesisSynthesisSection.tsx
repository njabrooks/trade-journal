'use client';

import { useState, useEffect } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ThesisArticulationDisplay } from './ThesisArticulationDisplay';
import { ValidationPointsList } from './ValidationPointsList';
import { UpdateValidationStatusModal } from './UpdateValidationStatusModal';
import { MonitoringSpecForm } from './MonitoringSpecForm';
import { ManualCheckDialog } from './ManualCheckDialog';
import type { ThesisArticulation, ValidationPoint, MonitoringSpec, MonitoringEvent } from '@/db/schema';

interface ThesisSynthesisSectionProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  articulation: ThesisArticulation | null;
  validationPoints: ValidationPoint[];
  claimCount?: number;
}

export function ThesisSynthesisSection({
  thesisId,
  thesisType,
  articulation,
  validationPoints: initialPoints,
  claimCount,
}: ThesisSynthesisSectionProps) {
  const [validationPoints, setValidationPoints] = useState(initialPoints);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Monitoring state
  const [monitoringSpecs, setMonitoringSpecs] = useState<Array<{
    spec: MonitoringSpec & { lastCheckEvent?: MonitoringEvent | null };
    validationPoint: ValidationPoint;
  }>>([]);
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false);
  const [isSpecFormOpen, setIsSpecFormOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<MonitoringSpec | null>(null);
  const [selectedSpecForCheck, setSelectedSpecForCheck] = useState<MonitoringSpec | null>(null);

  // Default both sections expanded if articulation exists
  const [expandedSections, setExpandedSections] = useState<string[]>(
    articulation ? ['articulation', 'validation-points'] : ['validation-points']
  );

  const selectedPoint = selectedPointId
    ? validationPoints.find((p) => p.id === selectedPointId)
    : null;

  const handleUpdateStatus = (pointId: string) => {
    setSelectedPointId(pointId);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPointId(null);
  };

  const handleSubmitStatus = async (data: {
    newStatus: string;
    evidence: {
      source: string;
      summary: string;
      link?: string;
    };
    confidence: string;
    userActionTaken?: string;
  }) => {
    if (!selectedPointId) return;

    const response = await fetch('/api/thesis-synthesis/validation-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validationPointId: selectedPointId,
        ...data,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update status');
    }

    const result = await response.json();

    // Update local state with the updated point
    setValidationPoints((prev) =>
      prev.map((p) =>
        p.id === selectedPointId ? result.validationPoint : p
      )
    );
  };

  const handleViewHistory = (pointId: string) => {
    // For now, just log - could open a history modal
    console.log('View history for:', pointId);
    // TODO: Implement history view modal
  };

  // Fetch monitoring specs on mount
  useEffect(() => {
    const fetchSpecs = async () => {
      setIsLoadingSpecs(true);
      try {
        const response = await fetch(
          `/api/monitoring/specs?thesisId=${thesisId}&thesisType=${thesisType}`
        );
        if (response.ok) {
          const data = await response.json();
          setMonitoringSpecs(data.specs || []);
        }
      } catch (error) {
        console.error('Error fetching monitoring specs:', error);
      } finally {
        setIsLoadingSpecs(false);
      }
    };

    fetchSpecs();
  }, [thesisId, thesisType]);

  // Monitoring handlers
  const handleCreateSpec = (validationPointId?: string) => {
    setEditingSpec(null);
    setIsSpecFormOpen(true);
  };

  const handleEditSpec = (specId: string) => {
    const item = monitoringSpecs.find(s => s.spec.id === specId);
    if (item) {
      setEditingSpec(item.spec);
      setIsSpecFormOpen(true);
    }
  };

  const handleCloseSpecForm = () => {
    setIsSpecFormOpen(false);
    setEditingSpec(null);
  };

  const handleSubmitSpec = async (specData: any) => {
    const url = editingSpec
      ? `/api/monitoring/specs/${editingSpec.id}`
      : '/api/monitoring/specs';
    const method = editingSpec ? 'PUT' : 'POST';

    const saveResponse = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(specData),
    });

    if (!saveResponse.ok) {
      const error = await saveResponse.json();
      throw new Error(error.error || 'Failed to save monitoring spec');
    }

    // Refresh specs list after create/update
    const refreshResponse = await fetch(
      `/api/monitoring/specs?thesisId=${thesisId}&thesisType=${thesisType}`
    );
    if (refreshResponse.ok) {
      const data = await refreshResponse.json();
      setMonitoringSpecs(data.specs || []);
    }
  };

  const handleRunCheck = (specId: string) => {
    const item = monitoringSpecs.find(s => s.spec.id === specId);
    if (item) {
      setSelectedSpecForCheck(item.spec);
    }
  };

  const handleCloseCheckDialog = () => {
    setSelectedSpecForCheck(null);
  };

  const handleStatusUpdate = async (validationPointId: string) => {
    // Refresh validation points and specs after status update
    try {
      // Refresh validation points (this would need to be fetched from parent or API)
      // For now, we'll just refresh specs
      const response = await fetch(
        `/api/monitoring/specs?thesisId=${thesisId}&thesisType=${thesisType}`
      );
      if (response.ok) {
        const data = await response.json();
        setMonitoringSpecs(data.specs || []);
      }
    } catch (error) {
      console.error('Error refreshing after status update:', error);
    }
  };

  const handleToggleEnabled = async (specId: string, enabled: boolean) => {
    const response = await fetch(`/api/monitoring/specs/${specId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });

    if (response.ok) {
      // Refresh specs list
      const refreshResponse = await fetch(
        `/api/monitoring/specs?thesisId=${thesisId}&thesisType=${thesisType}`
      );
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        setMonitoringSpecs(data.specs || []);
      }
    }
  };

  // If no articulation exists, show placeholder
  if (!articulation) {
    return (
      <div className="space-y-4">
        <div className="text-center py-4">
          <p className="text-sm text-slate-500 mb-2">
            No articulation exists yet. Create one to define explicit validation and invalidation criteria.
          </p>
          <p className="text-xs text-slate-400">
            Use{' '}
            <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono">
              /synthesize-thesis
            </code>{' '}
            to generate an articulation with validation points.
          </p>
        </div>

        {/* Show validation points even without articulation (in case they exist from partial run) */}
        {validationPoints.length > 0 && (
          <>
            {isLoadingSpecs ? (
              <div className="text-center py-8 text-slate-500">Loading monitoring specs...</div>
            ) : (
              <ValidationPointsList
                validationPoints={validationPoints}
                onUpdateStatus={handleUpdateStatus}
                onViewHistory={handleViewHistory}
                monitoringSpecs={monitoringSpecs}
                onCreateSpec={handleCreateSpec}
                onEditSpec={handleEditSpec}
                onRunCheck={handleRunCheck}
                onToggleEnabled={handleToggleEnabled}
              />
            )}
          </>
        )}

        {selectedPoint && (
          <UpdateValidationStatusModal
            point={selectedPoint}
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            onSubmit={handleSubmitStatus}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <Accordion
        type="multiple"
        value={expandedSections}
        onValueChange={setExpandedSections}
        className="border border-slate-200 rounded-lg overflow-hidden"
      >
        {/* Articulation Display */}
        <AccordionItem value="articulation">
          <AccordionTrigger className="px-4 bg-slate-50">
            <span className="font-medium text-slate-700">Core Articulation</span>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <ThesisArticulationDisplay
              articulation={articulation}
              claimCount={claimCount}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Validation Points */}
        <AccordionItem value="validation-points">
          <AccordionTrigger className="px-4 bg-slate-50">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-medium text-slate-700">Validation Points</span>
              <span className="text-xs text-slate-500">({validationPoints.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            {isLoadingSpecs ? (
              <div className="text-center py-8 text-slate-500">Loading monitoring specs...</div>
            ) : (
              <ValidationPointsList
                validationPoints={validationPoints}
                onUpdateStatus={handleUpdateStatus}
                onViewHistory={handleViewHistory}
                monitoringSpecs={monitoringSpecs}
                onCreateSpec={handleCreateSpec}
                onEditSpec={handleEditSpec}
                onRunCheck={handleRunCheck}
                onToggleEnabled={handleToggleEnabled}
              />
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Status Update Modal */}
      {selectedPoint && (
        <UpdateValidationStatusModal
          point={selectedPoint}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSubmit={handleSubmitStatus}
        />
      )}

      {/* Monitoring Spec Form */}
      {isSpecFormOpen && (
        <MonitoringSpecForm
          validationPoint={
            editingSpec
              ? validationPoints.find((p) => p.id === editingSpec.validationPointId)!
              : validationPoints[0]
          }
          existingSpec={editingSpec}
          isOpen={isSpecFormOpen}
          onClose={handleCloseSpecForm}
          onSubmit={handleSubmitSpec}
        />
      )}

      {/* Manual Check Dialog */}
      {selectedSpecForCheck && (
        <ManualCheckDialog
          spec={selectedSpecForCheck}
          validationPoint={
            validationPoints.find((p) => p.id === selectedSpecForCheck.validationPointId)!
          }
          isOpen={!!selectedSpecForCheck}
          onClose={handleCloseCheckDialog}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </div>
  );
}
