'use client';

import { useState, useEffect } from 'react';
import { TradeDetailsCard } from '@/components/trades/TradeDetailsCard';
import type { TradeDetail } from '@/types/trades';

/**
 * Trade stages for classifying the type of trade action
 */
export type TradeStage = 'open' | 'close' | 'assignment' | 'hedge' | 'roll' | 'reduce' | 'add';

export const TRADE_STAGES: { value: TradeStage; label: string; description: string }[] = [
  { value: 'open', label: 'Open', description: 'Opening a new position' },
  { value: 'close', label: 'Close', description: 'Closing an existing position' },
  { value: 'assignment', label: 'Assignment', description: 'Option assignment or exercise' },
  { value: 'hedge', label: 'Hedge', description: 'Adding a hedge to an existing position' },
  { value: 'roll', label: 'Roll', description: 'Rolling to a new expiration or strike' },
  { value: 'reduce', label: 'Reduce', description: 'Reducing position size' },
  { value: 'add', label: 'Add', description: 'Adding to an existing position' },
];

// Re-export TradeDetail from shared types for backward compatibility
export type { TradeDetail } from '@/types/trades';

export interface TradeMetadataFormData {
  tradeStage: TradeStage | '';
  tradeReason: string;
  signalLink?: string;
  additionalNotes?: string;
  selectedTradeIds: Set<string>;
  tradeQuantities: Map<string, number>;
}

interface TradeMetadataFormProps {
  /** Trade details to display and select from */
  tradeDetails: TradeDetail[] | null;
  /** Loading state for trade details */
  loadingTrades?: boolean;
  /** Action date for the trades */
  actionDate: string;
  /** Callback when form is submitted - this is the ONLY way to dismiss the form */
  onSubmit: (data: TradeMetadataFormData) => Promise<void>;
  /** Optional: Pre-selected trade IDs */
  initialSelectedTradeIds?: Set<string>;
  /** Optional: Pre-filled trade stage (auto-detected) */
  initialTradeStage?: TradeStage | '';
  /** Optional: Loading state from parent */
  isSubmitting?: boolean;
  /** Optional: Error message from parent */
  error?: string | null;
  /** Whether to show signal linking option */
  showSignalLink?: boolean;
  /** Available signals to link (if showSignalLink is true) */
  availableSignals?: Array<{ id: string; description: string; type: string }>;
}

/**
 * TradeMetadataForm - Compulsory trade metadata capture form
 *
 * This form has NO cancel button - the only way to dismiss it is to complete
 * the required fields and submit. This enforces the DP-8.1 requirement that
 * trade metadata capture cannot be bypassed.
 *
 * Required fields:
 * - Trade Stage (open/close/roll/hedge/add/reduce/assignment)
 * - Trade Reason (narrative explanation)
 *
 * Optional fields:
 * - Signal Link (which signal triggered this trade)
 * - Additional Notes (extended context)
 */
export function TradeMetadataForm({
  tradeDetails,
  loadingTrades = false,
  actionDate,
  onSubmit,
  initialSelectedTradeIds,
  initialTradeStage = '',
  isSubmitting = false,
  error: externalError,
  showSignalLink = false,
  availableSignals = [],
}: TradeMetadataFormProps) {
  // Form state
  const [tradeStage, setTradeStage] = useState<TradeStage | ''>(initialTradeStage);
  const [tradeReason, setTradeReason] = useState('');
  const [signalLink, setSignalLink] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [selectedTradeIds, setSelectedTradeIds] = useState<Set<string>>(
    initialSelectedTradeIds ?? new Set()
  );
  const [tradeQuantities, setTradeQuantities] = useState<Map<string, number>>(new Map());
  const [internalError, setInternalError] = useState<string | null>(null);

  // Initialize selected trades when trade details load
  useEffect(() => {
    if (tradeDetails && tradeDetails.length > 0 && selectedTradeIds.size === 0) {
      // Auto-select all trades by default
      setSelectedTradeIds(new Set(tradeDetails.map(t => t.id)));
      // Initialize quantities
      const quantities = new Map<string, number>();
      tradeDetails.forEach(t => {
        quantities.set(t.id, Math.abs(t.quantity));
      });
      setTradeQuantities(quantities);
    }
  }, [tradeDetails, selectedTradeIds.size]);

  // Check if trades exist (trade selection is only required when trades are available)
  const hasTrades = tradeDetails && tradeDetails.length > 0;

  const handleSubmit = async () => {
    // Validate required fields
    if (!tradeStage) {
      setInternalError('Trade stage is required');
      return;
    }
    if (!tradeReason.trim()) {
      setInternalError('Trade reason is required');
      return;
    }
    // Only require trade selection if trades exist
    if (hasTrades && selectedTradeIds.size === 0) {
      setInternalError('At least one trade must be selected');
      return;
    }

    setInternalError(null);

    await onSubmit({
      tradeStage,
      tradeReason: tradeReason.trim(),
      signalLink: signalLink || undefined,
      additionalNotes: additionalNotes.trim() || undefined,
      selectedTradeIds,
      tradeQuantities,
    });
  };

  const error = externalError || internalError;
  // Trade selection only required when trades exist
  const isValid = tradeStage !== '' && tradeReason.trim() !== '' && (!hasTrades || selectedTradeIds.size > 0);

  return (
    <div className="space-y-4">
      {/* Header - Emphasizes compulsory nature */}
      <div className="border-b border-slate-200 bg-amber-50 px-4 py-3 -mx-4 -mt-4 mb-4 rounded-t-lg">
        <h4 className="text-sm font-semibold text-amber-900">Record Trade Context</h4>
        <p className="mt-0.5 text-xs text-amber-700">
          Complete this form to record your trade decision. All trades require context for the journal.
        </p>
      </div>

      {/* Trade Details Section */}
      {loadingTrades ? (
        <div className="text-sm text-slate-500 py-4">Loading trade executions...</div>
      ) : (
        <div className="space-y-4">
          {/* Trade Execution Details with checkboxes - only show if trades exist */}
          {hasTrades ? (
            <TradeDetailsCard
              tradeDetails={tradeDetails}
              editMode={true}
              selectedTradeIds={selectedTradeIds}
              onTradeSelect={(tradeId, selected) => {
                const newSelected = new Set(selectedTradeIds);
                if (selected) {
                  newSelected.add(tradeId);
                } else {
                  newSelected.delete(tradeId);
                }
                setSelectedTradeIds(newSelected);
              }}
              tradeQuantities={tradeQuantities}
              onQuantityChange={(tradeId, quantity) => {
                const newQuantities = new Map(tradeQuantities);
                newQuantities.set(tradeId, quantity);
                setTradeQuantities(newQuantities);
              }}
              onSelectAll={() => {
                if (tradeDetails) {
                  setSelectedTradeIds(new Set(tradeDetails.map(t => t.id)));
                }
              }}
              onDeselectAll={() => {
                setSelectedTradeIds(new Set());
              }}
            />
          ) : (
            /* No trades available - show info message */
            <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              <div className="text-xs text-blue-800 font-medium">No trade executions found</div>
              <p className="text-xs text-blue-600 mt-1">
                This quantity change has no matching ingested trades. You can still record the trade context (stage and reason) for the journal.
              </p>
            </div>
          )}

          {/* Trade Stage - REQUIRED */}
          <div className="bg-white rounded-md border border-slate-200 p-3">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Trade Stage <span className="text-red-500">*</span>
            </label>
            <select
              value={tradeStage}
              onChange={(e) => setTradeStage(e.target.value as TradeStage | '')}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select trade stage...</option>
              {TRADE_STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              {tradeStage
                ? TRADE_STAGES.find(s => s.value === tradeStage)?.description
                : 'What type of trade action is this?'}
            </p>
          </div>

          {/* Trade Reason - REQUIRED */}
          <div className="bg-white rounded-md border border-slate-200 p-3">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Trade Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={tradeReason}
              onChange={(e) => setTradeReason(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Explain why this trade was made..."
              required
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Brief narrative explaining the reasoning behind this trade
            </p>
          </div>

          {/* Signal Link - OPTIONAL */}
          {showSignalLink && availableSignals.length > 0 && (
            <div className="bg-white rounded-md border border-slate-200 p-3">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Triggered by Signal <span className="text-slate-400">(optional)</span>
              </label>
              <select
                value={signalLink}
                onChange={(e) => setSignalLink(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">No signal link</option>
                {availableSignals.map((signal) => (
                  <option key={signal.id} value={signal.id}>
                    [{signal.type === 'confirmation' ? '✓' : '⚠'}] {signal.description}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                Was this trade triggered by a signal? Linking helps track signal effectiveness.
              </p>
            </div>
          )}

          {/* Additional Notes - OPTIONAL */}
          <div className="bg-white rounded-md border border-slate-200 p-3">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Additional Notes <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              placeholder="Any additional context or notes..."
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              <div className="text-xs text-rose-600 font-medium">{error}</div>
            </div>
          )}

          {/* Submit Button - NO CANCEL OPTION */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                <span className="text-red-500">*</span> Required fields must be completed
              </p>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !isValid}
                className="rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Recording...' : 'Record Trade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
