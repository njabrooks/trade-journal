"use client";

import type { BlotterEntry } from "@/db/queries/blotter";

interface PositionDetailsCardProps {
  entry: BlotterEntry;
}

export function PositionDetailsCard({ entry }: PositionDetailsCardProps) {
  const position = entry.positionDetails;
  
  if (!position) {
    return null;
  }

  const isOption = position.assetClass === "OPT" || position.expiry !== null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
        Position Details
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-slate-500 mr-2">Symbol:</span>
          <span className="font-medium text-slate-900">{position.symbol}</span>
        </div>
        {position.assetClass && (
          <div>
            <span className="text-slate-500 mr-2">Asset Class:</span>
            <span className="text-slate-900">{position.assetClass}</span>
          </div>
        )}
        {isOption && position.expiry && (
          <div>
            <span className="text-slate-500 mr-2">Expiry:</span>
            <span className="text-slate-900">{position.expiry}</span>
          </div>
        )}
        {isOption && position.strike !== null && (
          <div>
            <span className="text-slate-500 mr-2">Strike:</span>
            <span className="text-slate-900">${position.strike.toFixed(2)}</span>
          </div>
        )}
        {isOption && position.optionRight && (
          <div>
            <span className="text-slate-500 mr-2">Type:</span>
            <span className="text-slate-900">{position.optionRight}</span>
          </div>
        )}
        {position.quantity !== null && (
          <div>
            <span className="text-slate-500 mr-2">Quantity:</span>
            <span className="text-slate-900">
              {position.quantity > 0 ? "+" : ""}
              {position.quantity}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

