'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UnifiedSignalsTable } from '@/components/signals/UnifiedSignalsTable';
import { UpdateValidationStatusModal } from '@/components/thesis-synthesis/UpdateValidationStatusModal';
import type { Signal } from '@/db/schema';

interface SignalsSectionProps {
  signals: Signal[];
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
}

export function SignalsSection({
  signals,
  thesisId,
  thesisType,
  thesisTitle,
}: SignalsSectionProps) {
  const router = useRouter();
  const [selectedSignalForStatus, setSelectedSignalForStatus] = useState<Signal | null>(null);

  const handleUpdateStatus = (signalId: string) => {
    const signal = signals.find(s => s.id === signalId);
    if (signal) {
      setSelectedSignalForStatus(signal);
    }
  };

  return (
    <>
      <UnifiedSignalsTable
        signals={signals}
        thesisId={thesisId}
        thesisType={thesisType}
        thesisTitle={thesisTitle}
        mode="browse"
        onUpdateStatus={handleUpdateStatus}
      />

      {/* Update Status Modal */}
      {selectedSignalForStatus && (
        <UpdateValidationStatusModal
          point={selectedSignalForStatus}
          isOpen={selectedSignalForStatus !== null}
          onClose={() => setSelectedSignalForStatus(null)}
          onSubmit={async (data) => {
            const response = await fetch(`/api/validation-points/${selectedSignalForStatus.id}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                newStatus: data.newStatus,
                evidence: data.evidence,
                confidence: data.confidence,
                userActionTaken: data.userActionTaken,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to update status');
            }

            toast.success('Signal status updated');
            setSelectedSignalForStatus(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
