'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Clock,
  Target,
  Scale,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusTimeline } from './StatusTimeline';
import { UpdateValidationStatusModal } from './UpdateValidationStatusModal';
import type { ValidationPoint, ValidationStatusHistory } from '@/db/schema';

interface ValidationPointDetailProps {
  validationPoint: ValidationPoint;
  thesisTitle: string;
  thesisType: 'macro' | 'asset';
  thesisId: string;
  onUpdateStatus?: (data: {
    newStatus: string;
    evidence: {
      source: string;
      summary: string;
      link?: string;
    };
    confidence: string;
    userActionTaken?: string;
  }) => Promise<void>;
}

export function ValidationPointDetail({
  validationPoint,
  thesisTitle,
  thesisType,
  thesisId,
  onUpdateStatus,
}: ValidationPointDetailProps) {
  const router = useRouter();
  const [statusHistory, setStatusHistory] = useState<ValidationStatusHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Fetch status history
  const fetchStatusHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(
        `/api/thesis-synthesis/validation-status?validationPointId=${validationPoint.id}`
      );
      if (response.ok) {
        const data = await response.json();
        setStatusHistory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to fetch status history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchStatusHistory();
  }, [validationPoint.id]);

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
    if (onUpdateStatus) {
      await onUpdateStatus(data);
      // Refresh history after update
      fetchStatusHistory();
    }
  };

  const statusIcons: Record<string, React.ReactNode> = {
    draft: <Clock className="w-5 h-5 text-purple-400" />,
    active: <Eye className="w-5 h-5 text-blue-500" />,
    complete: <AlertTriangle className="w-5 h-5 text-emerald-500" />,
    rejected: <Archive className="w-5 h-5 text-muted-foreground" />,
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
    active: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    complete: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    rejected: 'bg-muted text-muted-foreground border',
  };

  const importanceColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    significant: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    supporting: 'bg-muted text-muted-foreground border',
  };

  const categoryIcons: Record<string, React.ReactNode> = {
    data_driven: <Target className="w-4 h-4" />,
    judgment: <Scale className="w-4 h-4" />,
  };

  const explicitDetails = validationPoint.explicitDetails as {
    metric?: string;
    threshold?: string;
    dataSources?: string[];
    monitoringFrequency?: string;
  } | null;

  const backUrl = thesisType === 'macro' ? `/theses/${thesisId}` : `/asset-theses/${thesisId}`;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push(backUrl)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {thesisTitle}
      </button>

      {/* Header */}
      <div className="bg-card rounded-lg border border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 text-sm font-medium rounded ${
                  validationPoint.type === 'confirmation'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                }`}
              >
                {validationPoint.type === 'confirmation' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                {validationPoint.type}
              </span>

              <span
                className={`inline-flex items-center gap-1 px-2 py-1 text-sm font-medium rounded border ${
                  importanceColors[validationPoint.importance]
                }`}
              >
                {validationPoint.importance}
              </span>

              <span className="inline-flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground bg-muted rounded">
                {categoryIcons[validationPoint.category]}
                {validationPoint.category.replace('_', ' ')}
              </span>
            </div>

            {/* Statement */}
            <h1 className="text-xl font-semibold text-foreground mb-2">
              {validationPoint.statement}
            </h1>

            {/* Notes */}
            {validationPoint.notes && (
              <p className="text-muted-foreground whitespace-pre-wrap">{validationPoint.notes}</p>
            )}
          </div>

          {/* Status and actions */}
          <div className="text-right">
            <div
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${
                statusColors[validationPoint.status]
              }`}
            >
              {statusIcons[validationPoint.status]}
              <span className="font-medium">{validationPoint.status.replace('_', ' ')}</span>
            </div>

            {validationPoint.status !== 'rejected' && (
              <Button
                onClick={() => setIsUpdateModalOpen(true)}
                className="mt-3"
              >
                Update Status
              </Button>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-sm text-muted-foreground">
          {validationPoint.timeframe && (
            <span>
              <Clock className="w-4 h-4 inline mr-1" />
              Timeframe: {validationPoint.timeframe.replace('_', ' ')}
            </span>
          )}
          <span>
            Created: {new Date(validationPoint.createdAt).toLocaleDateString('en-GB')}
          </span>
          {validationPoint.updatedAt !== validationPoint.createdAt && (
            <span>
              Updated: {new Date(validationPoint.updatedAt).toLocaleDateString('en-GB')}
            </span>
          )}
        </div>
      </div>

      {/* Details cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data-driven trigger criteria */}
        {validationPoint.category === 'data_driven' && explicitDetails && (
          <div className="bg-card rounded-lg border border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Trigger Criteria
            </h3>
            <dl className="space-y-2 text-sm">
              {explicitDetails.metric && (
                <div>
                  <dt className="text-muted-foreground">Metric</dt>
                  <dd className="text-foreground font-medium">{explicitDetails.metric}</dd>
                </div>
              )}
              {explicitDetails.threshold && (
                <div>
                  <dt className="text-muted-foreground">Threshold</dt>
                  <dd className="text-foreground font-mono">{explicitDetails.threshold}</dd>
                </div>
              )}
              {explicitDetails.dataSources && explicitDetails.dataSources.length > 0 && (
                <div>
                  <dt className="text-muted-foreground">Data Sources</dt>
                  <dd className="text-foreground">{explicitDetails.dataSources.join(', ')}</dd>
                </div>
              )}
              {explicitDetails.monitoringFrequency && (
                <div>
                  <dt className="text-muted-foreground">Monitoring Frequency</dt>
                  <dd className="text-foreground">{explicitDetails.monitoringFrequency}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Dependent thesis */}
        {validationPoint.dependentThesisId && (
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800 p-4">
            <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
              Dependent Thesis Trigger
            </h3>
            <p className="text-sm text-purple-800 dark:text-purple-200">
              This signal triggers when the{' '}
              <span className="font-medium">{validationPoint.dependentThesisType}</span> thesis is{' '}
              <span className="font-medium">{validationPoint.dependentThesisCondition}</span>
              {validationPoint.dependentThesisConditionDetail && (
                <> ({validationPoint.dependentThesisConditionDetail})</>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Status History */}
      <div className="bg-card rounded-lg border border">
        <div className="px-4 py-3 border-b border">
          <h3 className="text-sm font-semibold text-foreground">
            Status History
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({statusHistory.length} {statusHistory.length === 1 ? 'entry' : 'entries'})
            </span>
          </h3>
        </div>
        <div className="p-4">
          <StatusTimeline history={statusHistory} isLoading={isLoadingHistory} />
        </div>
      </div>

      {/* Update status modal */}
      <UpdateValidationStatusModal
        point={validationPoint}
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        onSubmit={handleUpdateStatus}
      />
    </div>
  );
}
