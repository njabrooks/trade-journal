'use client';

import { CheckCircle2, Clock, AlertTriangle, TrendingUp, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { Signal } from '@/db/schema';

interface Target {
  label: string;
  price: number;
  denomination: 'BTC' | 'USD';
  positionPct: number | null;
  conditionType: 'price_above' | 'price_below';
  status: 'active' | 'complete';
}

interface StrategySignalsSectionProps {
  strategyId: string;
  strategyKey: string;
  underlyingTicker?: string;
  signals: Signal[];
  showDefinePrompt?: boolean;
}

function formatPrice(price: number, denomination: string): string {
  if (denomination === 'USD') {
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  return price.toPrecision(6);
}

function TargetStatusIcon({ status }: { status: string }) {
  if (status === 'complete') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function isLadderSignal(signal: Signal): boolean {
  const details = signal.explicitDetails as Record<string, unknown> | null;
  return details?.signalKind === 'strategy_price_ladder';
}

function getTargets(signal: Signal): Target[] {
  const details = signal.explicitDetails as Record<string, unknown> | null;
  return (details?.targets as Target[]) || [];
}

function renderLadderSignal(signal: Signal) {
  const targets = getTargets(signal);
  const tpTargets = targets.filter(t => t.conditionType === 'price_above');
  const slTargets = targets.filter(t => t.conditionType === 'price_below');

  // Group TP targets by denomination
  const usdTP = tpTargets.filter(t => t.denomination === 'USD').sort((a, b) => a.price - b.price);
  const btcTP = tpTargets.filter(t => t.denomination === 'BTC').sort((a, b) => a.price - b.price);

  return (
    <div key={signal.id} className="space-y-2">
      <Link
        href={`/signals/${signal.id}`}
        className="text-xs text-muted-foreground hover:underline"
      >
        View signal details
      </Link>

      {/* Take-profit targets */}
      {(usdTP.length > 0 || btcTP.length > 0) && (
        <div className="border rounded-lg border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20">
          <div className="px-3 py-2 border-b border-emerald-200/50 dark:border-emerald-800/50 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Take Profit ({tpTargets.length} targets)
            </span>
          </div>
          <div className="divide-y divide-emerald-100 dark:divide-emerald-800/30">
            {[...usdTP, ...btcTP].map((target, i) => (
              <div key={i} className="px-3 py-2 flex items-center gap-3">
                <TargetStatusIcon status={target.status} />
                <span className="text-sm font-medium text-foreground min-w-[100px]">
                  {formatPrice(target.price, target.denomination)}
                </span>
                {target.denomination === 'BTC' && (
                  <span className="text-xs text-muted-foreground font-mono">BTC</span>
                )}
                {target.positionPct && (
                  <span className="text-xs text-muted-foreground">
                    {target.positionPct}%
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {target.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stop-loss targets */}
      {slTargets.length > 0 && (
        <div className="border rounded-lg border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20">
          <div className="px-3 py-2 border-b border-amber-200/50 dark:border-amber-800/50 flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Stop Loss ({slTargets.length})
            </span>
          </div>
          <div className="divide-y divide-amber-100 dark:divide-amber-800/30">
            {slTargets.map((target, i) => (
              <div key={i} className="px-3 py-2 flex items-center gap-3">
                <TargetStatusIcon status={target.status} />
                <span className="text-sm font-medium text-foreground min-w-[100px]">
                  {formatPrice(target.price, target.denomination)}
                </span>
                {target.denomination === 'BTC' && (
                  <span className="text-xs text-muted-foreground font-mono">BTC</span>
                )}
                {target.positionPct && (
                  <span className="text-xs text-muted-foreground">
                    {target.positionPct}%
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {target.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Render a legacy single-target signal (pre-consolidation) */
function renderLegacySignal(signal: Signal) {
  const details = signal.explicitDetails as Record<string, unknown> | null;
  const price = details?.price as number | undefined;
  const denom = (details?.denomination as string) || 'USD';

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
            <span className="text-xs text-muted-foreground font-mono">{denom}</span>
          </div>
          <p className="text-sm font-medium text-foreground mt-1">{signal.statement}</p>
          {price && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              Target: {formatPrice(price, denom)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function StrategySignalsSection({
  signals,
  showDefinePrompt = false,
}: StrategySignalsSectionProps) {
  const ladderSignals = signals.filter(isLadderSignal);
  const legacySignals = signals.filter(s => !isLadderSignal(s));

  // Count targets across all ladder signals
  const totalTargets = ladderSignals.reduce((sum, s) => sum + getTargets(s).length, 0);
  const tpCount = ladderSignals.reduce((sum, s) =>
    sum + getTargets(s).filter(t => t.conditionType === 'price_above').length, 0);
  const slCount = ladderSignals.reduce((sum, s) =>
    sum + getTargets(s).filter(t => t.conditionType === 'price_below').length, 0);
  // Legacy counts
  const legacyTpCount = legacySignals.filter(s => s.type === 'confirmation').length;
  const legacySlCount = legacySignals.filter(s => s.type === 'invalidation').length;

  const totalTp = tpCount + legacyTpCount;
  const totalSl = slCount + legacySlCount;

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
          {(totalTp > 0 || totalSl > 0) && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {totalTp} take profit • {totalSl} risk
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
        <div className="space-y-3">
          {ladderSignals.map(renderLadderSignal)}
          {legacySignals.length > 0 && (
            <div className="space-y-2">
              {legacySignals.map(renderLegacySignal)}
            </div>
          )}
        </div>
      )}
    </>
  );
}
