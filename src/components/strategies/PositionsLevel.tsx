'use client';

import Link from 'next/link';
import { ProvenanceLevel } from './ProvenanceLevel';
import { cn } from '@/lib/utils';

interface Position {
  id: string;
  ticker: string;
  positionType: string | null;
  quantity: string;
  status: 'open' | 'assigned' | 'closed';
  unrealizedPnl: string | null;
  absNotional: string | null;
}

interface PositionsLevelProps {
  positions: Position[];
}

export function PositionsLevel({ positions }: PositionsLevelProps) {
  // Filter to only open and assigned positions
  const activePositions = positions.filter(
    (p) => p.status === 'open' || p.status === 'assigned'
  );

  const count = activePositions.length;
  const status = count > 0 ? 'linked' : 'missing';

  // Calculate totals
  const totalNotional = activePositions.reduce((sum, pos) => {
    const notional = pos.absNotional ? parseFloat(pos.absNotional) : 0;
    return sum + notional;
  }, 0);

  const totalUnrealizedPnl = activePositions.reduce((sum, pos) => {
    const pnl = pos.unrealizedPnl ? parseFloat(pos.unrealizedPnl) : 0;
    return sum + pnl;
  }, 0);

  const title = count === 0
    ? 'No Active Positions'
    : `${count} Active ${count === 1 ? 'Position' : 'Positions'}`;

  return (
    <ProvenanceLevel
      type="position"
      title={title}
      count={count}
      status={status}
      defaultExpanded={count > 0}
    >
      {count === 0 ? (
        <p className="text-sm text-slate-500">
          This strategy has no active positions.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-md">
            <div>
              <div className="text-xs text-slate-500">Total Notional</div>
              <div className="text-sm font-semibold">
                ${totalNotional.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Unrealized P&L</div>
              <div className={cn(
                "text-sm font-semibold",
                totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          {/* Positions List */}
          <div className="space-y-2">
            {activePositions.map((position) => {
              const pnl = position.unrealizedPnl ? parseFloat(position.unrealizedPnl) : 0;
              const notional = position.absNotional ? parseFloat(position.absNotional) : 0;

              return (
                <Link
                  key={position.id}
                  href={`/positions/${position.id}`}
                  className="block p-3 border border-slate-200 rounded-md hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold">
                        {position.ticker}
                      </span>
                      {position.positionType && (
                        <span className="text-xs text-slate-500">
                          {position.positionType}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        Qty: {position.quantity}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Notional</div>
                        <div className="text-sm font-medium">
                          ${notional.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">P&L</div>
                        <div className={cn(
                          "text-sm font-semibold",
                          pnl >= 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                          {pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </ProvenanceLevel>
  );
}
