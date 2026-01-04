'use client';

import { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ThesisArticulationDisplay } from './ThesisArticulationDisplay';
import { ValidationPointsList } from './ValidationPointsList';
import { UpdateValidationStatusModal } from './UpdateValidationStatusModal';
import type { ThesisArticulation, ValidationPoint } from '@/db/schema';

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
          <ValidationPointsList
            validationPoints={validationPoints}
            onUpdateStatus={handleUpdateStatus}
            onViewHistory={handleViewHistory}
          />
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
            <ValidationPointsList
              validationPoints={validationPoints}
              onUpdateStatus={handleUpdateStatus}
              onViewHistory={handleViewHistory}
            />
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
    </div>
  );
}
