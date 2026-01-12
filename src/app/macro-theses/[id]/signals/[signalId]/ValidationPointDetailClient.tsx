'use client';

import { useRouter } from 'next/navigation';
import { ValidationPointDetail } from '@/components/thesis-synthesis/ValidationPointDetail';
import type { ValidationPoint } from '@/db/schema';

interface ValidationPointDetailClientProps {
  validationPoint: ValidationPoint;
  thesisTitle: string;
  thesisType: 'macro' | 'asset';
  thesisId: string;
}

export function ValidationPointDetailClient({
  validationPoint,
  thesisTitle,
  thesisType,
  thesisId,
}: ValidationPointDetailClientProps) {
  const router = useRouter();

  const handleUpdateStatus = async (data: {
    newStatus: string;
    evidence: {
      source: string;
      summary: string;
      link?: string;
    };
    confidence: string;
    userActionTaken?: string;
  }) => {
    const response = await fetch('/api/thesis-synthesis/validation-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validationPointId: validationPoint.id,
        newStatus: data.newStatus,
        evidence: data.evidence,
        confidence: data.confidence,
        userActionTaken: data.userActionTaken,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update status');
    }

    // Refresh the page to show updated data
    router.refresh();
  };

  return (
    <ValidationPointDetail
      validationPoint={validationPoint}
      thesisTitle={thesisTitle}
      thesisType={thesisType}
      thesisId={thesisId}
      onUpdateStatus={handleUpdateStatus}
    />
  );
}
