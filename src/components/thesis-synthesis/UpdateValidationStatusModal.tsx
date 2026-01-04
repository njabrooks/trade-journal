'use client';

import { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Eye, Archive } from 'lucide-react';
import type { ValidationPoint } from '@/db/schema';

interface UpdateValidationStatusModalProps {
  point: ValidationPoint;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
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

export function UpdateValidationStatusModal({
  point,
  isOpen,
  onClose,
  onSubmit,
}: UpdateValidationStatusModalProps) {
  const [newStatus, setNewStatus] = useState(point.status);
  const [evidenceSource, setEvidenceSource] = useState('');
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [evidenceLink, setEvidenceLink] = useState('');
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high'>('medium');
  const [userActionTaken, setUserActionTaken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const statusOptions = [
    {
      value: 'not_triggered',
      label: 'Not Triggered',
      description: 'Condition has not yet occurred',
      icon: <Eye className="w-4 h-4 text-slate-400" />,
    },
    {
      value: 'monitoring',
      label: 'Monitoring',
      description: 'Actively watching for this condition',
      icon: <Eye className="w-4 h-4 text-blue-500" />,
    },
    {
      value: 'triggered',
      label: 'Triggered',
      description: 'Condition has been met',
      icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    },
    {
      value: 'superseded',
      label: 'Superseded',
      description: 'No longer relevant (replaced by newer articulation)',
      icon: <Archive className="w-4 h-4 text-slate-400" />,
    },
  ];

  const responseProtocol = point.responseProtocol as {
    description?: string;
    escalation?: string;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!evidenceSource.trim()) {
      setError('Evidence source is required');
      return;
    }
    if (!evidenceSummary.trim()) {
      setError('Evidence summary is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        newStatus,
        evidence: {
          source: evidenceSource.trim(),
          summary: evidenceSummary.trim(),
          link: evidenceLink.trim() || undefined,
        },
        confidence,
        userActionTaken: userActionTaken.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Update Validation Point Status
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Point Summary */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${
                point.type === 'validation'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {point.type}
            </span>
            <span
              className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${
                point.importance === 'critical'
                  ? 'bg-red-100 text-red-700'
                  : point.importance === 'significant'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {point.importance}
            </span>
          </div>
          <p className="text-sm text-slate-900">{point.statement}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* New Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              New Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNewStatus(option.value)}
                  className={`flex items-start gap-2 p-2 rounded-md border text-left transition-colors ${
                    newStatus === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {option.icon}
                  <div>
                    <span className="text-sm font-medium text-slate-900 block">
                      {option.label}
                    </span>
                    <span className="text-xs text-slate-500">{option.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Response Protocol Reminder (if triggered) */}
          {newStatus === 'triggered' && responseProtocol?.description && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">
                Response Protocol Reminder
              </h4>
              <p className="text-sm text-amber-900">{responseProtocol.description}</p>
              {responseProtocol.escalation && (
                <p className="mt-1 text-xs text-amber-700">
                  Escalation: {responseProtocol.escalation.replace('_', ' ')}
                </p>
              )}
            </div>
          )}

          {/* Evidence Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-700">
              Evidence <span className="text-red-500">*</span>
            </h4>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Source</label>
              <input
                type="text"
                value={evidenceSource}
                onChange={(e) => setEvidenceSource(e.target.value)}
                placeholder="e.g., Q4 Earnings Report, Bloomberg article..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Summary</label>
              <textarea
                value={evidenceSummary}
                onChange={(e) => setEvidenceSummary(e.target.value)}
                placeholder="What did you observe? What changed?"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Link (optional)</label>
              <input
                type="url"
                value={evidenceLink}
                onChange={(e) => setEvidenceLink(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Confidence */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Confidence in this assessment
            </label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setConfidence(level)}
                  className={`flex-1 py-2 text-sm font-medium rounded-md border transition-colors ${
                    confidence === level
                      ? level === 'low'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : level === 'medium'
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Action Taken (if triggered) */}
          {newStatus === 'triggered' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Action Taken (optional)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Record what you did in response to this trigger.
              </p>
              <textarea
                value={userActionTaken}
                onChange={(e) => setUserActionTaken(e.target.value)}
                placeholder="What action did you take? If none yet, leave blank."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Status Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
