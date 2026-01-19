'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UnifiedSignalsTable } from '@/components/signals/UnifiedSignalsTable';
import { SignalConfigForm } from '@/components/signals/SignalConfigForm';
import { AssessEvidenceButton } from '@/components/signals/AssessEvidenceButton';
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
  const [selectedSignalForUpgrade, setSelectedSignalForUpgrade] = useState<Signal | null>(null);
  const [selectedSignalForStatus, setSelectedSignalForStatus] = useState<Signal | null>(null);

  const handleConvertToDataDriven = (signal: Signal) => {
    setSelectedSignalForUpgrade(signal);
  };

  const handleUpdateStatus = (signalId: string) => {
    const signal = signals.find(s => s.id === signalId);
    if (signal) {
      setSelectedSignalForStatus(signal);
    }
  };

  const handleConfigSubmit = async (config: {
    dataSource: string;
    metric: string;
    operator: string;
    threshold?: number;
    thresholdUnit?: string;
    durationCount?: number;
    durationPeriod?: string;
    checkFrequency: string;
    notes?: string;
  }) => {
    if (!selectedSignalForUpgrade) return;

    // Update the signal to data-driven with the config
    const response = await fetch(`/api/validation-points/${selectedSignalForUpgrade.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'data_driven',
        explicitDetails: {
          dataSource: config.dataSource,
          metric: config.metric,
          operator: config.operator,
          threshold: config.threshold,
          thresholdUnit: config.thresholdUnit,
          durationCount: config.durationCount,
          durationPeriod: config.durationPeriod,
          checkFrequency: config.checkFrequency,
          notes: config.notes,
        },
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to upgrade signal to data-driven');
    }

    setSelectedSignalForUpgrade(null);
    router.refresh();
  };

  return (
    <>
      {/* Content - Unified Signals Table in browse mode with AssessEvidenceButton in header */}
      <UnifiedSignalsTable
        signals={signals}
        thesisId={thesisId}
        thesisType={thesisType}
        thesisTitle={thesisTitle}
        mode="browse"
        onUpdateStatus={handleUpdateStatus}
        onConvertToDataDriven={handleConvertToDataDriven}
        headerAction={
          <AssessEvidenceButton
            thesisId={thesisId}
            thesisType={thesisType}
            thesisTitle={thesisTitle}
            signalCount={signals.length}
            onComplete={() => router.refresh()}
          />
        }
      />

      {/* Signal Config Form Dialog for upgrading to data-driven */}
      <SignalConfigForm
        signal={selectedSignalForUpgrade ?? undefined}
        isOpen={selectedSignalForUpgrade !== null}
        onClose={() => setSelectedSignalForUpgrade(null)}
        onSubmit={handleConfigSubmit}
        mode="upgrade"
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
