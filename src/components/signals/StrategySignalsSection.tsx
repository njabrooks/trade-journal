'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, AlertTriangle, CheckCircle2, Clock, Radio, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StrategySignalConfigForm } from './StrategySignalConfigForm';
import type { Signal } from '@/db/schema';

interface StrategySignalsSectionProps {
  strategyId: string;
  strategyKey: string;
  underlyingTicker?: string;
  signals: Signal[];
  showDefinePrompt?: boolean; // Show when DEFINE_SIGNALS triage is pending
}

// Condition type display mapping
const CONDITION_DISPLAY: Record<string, string> = {
  price_above: 'Price ≥',
  price_below: 'Price ≤',
  dte_lte: 'DTE ≤',
  dte_gte: 'DTE ≥',
  sigma_to_strike_lte: 'Sigma ≤',
  sigma_to_strike_gte: 'Sigma ≥',
  pnl_pct_gte: 'PnL% ≥',
  pnl_pct_lte: 'PnL% ≤',
  iv_rank_gte: 'IV Rank ≥',
  iv_rank_lte: 'IV Rank ≤',
};

interface ConditionConfig {
  id: string;
  type: string;
  value: number;
  ticker?: string;
  tvAlertName?: string;
}

interface ExplicitDetailsConfig {
  logic: 'all' | 'any';
  conditions: ConditionConfig[];
  recommendedAction: string;
  actionNotes?: string;
  tvAlertName?: string;
}

function formatConditions(explicitDetails: unknown): string {
  if (!explicitDetails || typeof explicitDetails !== 'object') return '';

  const config = explicitDetails as ExplicitDetailsConfig;
  if (!config.conditions || !Array.isArray(config.conditions)) return '';

  const conditionStrings = config.conditions.map((c) => {
    const display = CONDITION_DISPLAY[c.type] || c.type;
    const ticker = c.ticker ? `${c.ticker} ` : '';
    return `${ticker}${display} ${c.value}`;
  });

  const connector = config.logic === 'all' ? ' AND ' : ' OR ';
  return conditionStrings.join(connector);
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'triggered':
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'superseded':
      return <CheckCircle2 className="w-4 h-4 text-slate-400" />;
    default:
      return <Clock className="w-4 h-4 text-slate-400" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'triggered':
      return 'bg-amber-100 text-amber-800';
    case 'superseded':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-blue-100 text-blue-800';
  }
}

export function StrategySignalsSection({
  strategyId,
  strategyKey,
  underlyingTicker,
  signals,
  showDefinePrompt = false,
}: StrategySignalsSectionProps) {
  const router = useRouter();
  const [showConfigForm, setShowConfigForm] = useState(false);

  const handleCreateSignal = async (data: {
    statement: string;
    type: 'confirmation' | 'warning';
    importance: 'critical' | 'significant' | 'supporting';
    notes?: string;
    explicitDetails: {
      logic: 'all' | 'any';
      conditions: Array<{
        id: string;
        type: string;
        value: number;
        ticker?: string;
        tvAlertName?: string;
      }>;
      recommendedAction: string;
      actionNotes?: string;
    };
  }) => {
    const response = await fetch('/api/signals/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId,
        ...data,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create signal');
    }

    setShowConfigForm(false);
    router.refresh();
  };

  const confirmationSignals = signals.filter((s) => s.type === 'confirmation');
  const warningSignals = signals.filter((s) => s.type === 'warning');

  return (
    <>
      {/* Define Signals Prompt */}
      {showDefinePrompt && signals.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-amber-900">Define Signals</h4>
              <p className="text-sm text-amber-700 mt-1">
                Configure trigger conditions for this strategy. Signals will alert you when
                specific criteria are met (e.g., price targets, DTE thresholds, profit levels).
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => setShowConfigForm(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add First Signal
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">
          Strategy Signals ({signals.length})
          {signals.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              {confirmationSignals.length} take profit • {warningSignals.length} risk
            </span>
          )}
        </h3>
        <Button variant="outline" size="sm" onClick={() => setShowConfigForm(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Add Signal
        </Button>
      </div>

      {/* Signals List */}
      {signals.length === 0 ? (
        !showDefinePrompt && (
          <div className="text-center py-8 text-slate-400 border rounded-lg bg-slate-50">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No signals configured yet</p>
            <p className="text-xs mt-1">Add signals to track trigger conditions</p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {signals.map((signal) => {
            const config = signal.explicitDetails as ExplicitDetailsConfig | null;

            return (
              <div
                key={signal.id}
                className={`border rounded-lg p-3 ${
                  signal.type === 'confirmation'
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          signal.type === 'confirmation'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {signal.type === 'confirmation' ? 'Take Profit' : 'Risk Alert'}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(signal.status)}`}
                      >
                        {getStatusIcon(signal.status)}
                        <span className="ml-1">{signal.status}</span>
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 mt-1">{signal.statement}</p>
                    {config && (
                      <p className="text-xs text-slate-500 mt-1">
                        Trigger: {formatConditions(config)}
                      </p>
                    )}
                    {config?.recommendedAction && (
                      <p className="text-xs text-slate-600 mt-1">
                        <span className="font-medium">Action:</span> {config.recommendedAction}
                      </p>
                    )}
                    {config?.tvAlertName && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {signal.status === 'triggered' ? (
                          <Radio className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Wifi className="w-3.5 h-3.5 text-blue-500" />
                        )}
                        <span className="text-xs text-slate-500">
                          TradingView: <code className="bg-slate-100 px-1 rounded">{config.tvAlertName}</code>
                        </span>
                        {signal.status === 'not_triggered' && (
                          <span className="text-xs text-slate-400 italic">awaiting trigger</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">
                    {signal.importance}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Config Form Modal */}
      <StrategySignalConfigForm
        strategyId={strategyId}
        strategyKey={strategyKey}
        underlyingTicker={underlyingTicker}
        isOpen={showConfigForm}
        onClose={() => setShowConfigForm(false)}
        onSubmit={handleCreateSignal}
      />
    </>
  );
}
