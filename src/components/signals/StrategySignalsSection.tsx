'use client';

import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import type { Signal } from '@/db/schema';

interface StrategySignalsSectionProps {
  strategyId: string;
  strategyKey: string;
  underlyingTicker?: string;
  signals: Signal[];
  showDefinePrompt?: boolean;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
    case 'complete':
      return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300';
    case 'rejected':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'active':
      return <Clock className="w-3.5 h-3.5" />;
    case 'complete':
      return <CheckCircle2 className="w-3.5 h-3.5" />;
    default:
      return <Clock className="w-3.5 h-3.5" />;
  }
}

function formatPrice(details: Record<string, unknown>): string {
  const price = details.price as number;
  const denom = details.denomination as string;
  if (!price) return '';
  if (denom === 'USD') {
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  return price.toPrecision(6);
}

export function StrategySignalsSection({
  signals,
  showDefinePrompt = false,
}: StrategySignalsSectionProps) {
  const confirmationSignals = signals.filter((s) => s.type === 'confirmation');
  const invalidationSignals = signals.filter((s) => s.type === 'invalidation');

  return (
    <>
      {showDefinePrompt && signals.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-amber-900 dark:text-amber-100">No Signals Configured</h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Draw TP/SL lines on the Price/BTC TradingView layout and run{' '}
                <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded text-xs">sync-tv-drawings</code>{' '}
                to import price signals.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">
          Strategy Signals ({signals.length})
          {signals.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {confirmationSignals.length} take profit • {invalidationSignals.length} risk
            </span>
          )}
        </h3>
      </div>

      {signals.length === 0 ? (
        !showDefinePrompt && (
          <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No signals configured yet</p>
            <p className="text-xs mt-1">Draw TP/SL on TradingView to create signals</p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {signals.map((signal) => {
            const details = signal.explicitDetails as Record<string, unknown> | null;
            const priceStr = details ? formatPrice(details) : '';
            const denom = details?.denomination as string;

            return (
              <div
                key={signal.id}
                className={`border rounded-lg p-3 ${
                  signal.type === 'confirmation'
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20'
                    : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          signal.type === 'confirmation'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {signal.type === 'confirmation' ? 'Take Profit' : 'Stop Loss'}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(signal.status)}`}
                      >
                        {getStatusIcon(signal.status)}
                        {signal.status}
                      </span>
                      {denom && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {denom}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1">{signal.statement}</p>
                    {priceStr && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        Target: {priceStr}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
