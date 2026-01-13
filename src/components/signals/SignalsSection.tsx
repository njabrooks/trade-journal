'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ValidationPointsList } from '@/components/thesis-synthesis/ValidationPointsList';
import { SignalConfigForm } from '@/components/signals/SignalConfigForm';
import { AssessEvidenceButton } from '@/components/signals/AssessEvidenceButton';
import type { ValidationPoint, MonitoringSpec, MonitoringEvent } from '@/db/schema';

interface SignalsSectionProps {
  signals: ValidationPoint[];
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  monitoringSpecs?: Array<{
    spec: MonitoringSpec & { lastCheckEvent?: MonitoringEvent | null };
    validationPoint: ValidationPoint;
  }>;
}

export function SignalsSection({
  signals,
  thesisId,
  thesisType,
  thesisTitle,
  monitoringSpecs = [],
}: SignalsSectionProps) {
  const router = useRouter();
  const [selectedSignalForUpgrade, setSelectedSignalForUpgrade] = useState<ValidationPoint | null>(null);

  const handleConvertToExplicit = (signal: ValidationPoint) => {
    setSelectedSignalForUpgrade(signal);
  };

  const handleConfigSubmit = async (config: {
    dataSource: string;
    metric: string;
    operator: string;
    threshold: number;
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

  const confirmationCount = signals.filter(s => s.type === 'confirmation').length;
  const warningCount = signals.filter(s => s.type === 'warning').length;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">
          Signals ({signals.length})
          {signals.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              {confirmationCount} confirmation • {warningCount} warning
            </span>
          )}
        </h3>
        <AssessEvidenceButton
          thesisId={thesisId}
          thesisType={thesisType}
          thesisTitle={thesisTitle}
          signalCount={signals.length}
          onComplete={() => router.refresh()}
        />
      </div>

      {/* Content */}
      {signals.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-slate-500 mb-2">
            No signals defined yet.
          </p>
          <p className="text-xs text-slate-400">
            Signals are created when you run{' '}
            <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono">
              /synthesize-thesis
            </code>
          </p>
        </div>
      ) : (
        <ValidationPointsList
          validationPoints={signals}
          thesisId={thesisId}
          thesisType={thesisType}
          monitoringSpecs={monitoringSpecs}
          onConvertToExplicit={handleConvertToExplicit}
        />
      )}

      {/* Signal Config Form Dialog for upgrading to explicit */}
      <SignalConfigForm
        signal={selectedSignalForUpgrade ?? undefined}
        isOpen={selectedSignalForUpgrade !== null}
        onClose={() => setSelectedSignalForUpgrade(null)}
        onSubmit={handleConfigSubmit}
        mode="upgrade"
      />
    </>
  );
}
