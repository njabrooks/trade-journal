"use client";

import { formatCurrency } from "@/lib/formatters";

interface SparklineDataPoint {
  label: string;
  value: number | null;
}

interface SparklineProps {
  data: SparklineDataPoint[];
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  showHighLow?: boolean;
}

export function Sparkline({
  data,
  height = 80,
  stroke = "#0f172a",
  strokeWidth = 2,
  showHighLow = false,
}: SparklineProps) {
  const sanitized = data.filter(
    (point): point is { label: string; value: number } =>
      typeof point.value === "number" && Number.isFinite(point.value)
  );

  if (sanitized.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        No data
      </div>
    );
  }

  const values = sanitized.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = sanitized
    .map((point, index) => {
      const x = (index / Math.max(1, sanitized.length - 1)) * 100;
      const y = 100 - ((point.value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  const minPoint = sanitized.find((p) => p.value === min);
  const maxPoint = sanitized.find((p) => p.value === max);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ height }}
        className="w-full"
      >
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
      {showHighLow && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            Low: {minPoint ? `${minPoint.label} ${formatCurrency(min)}` : formatCurrency(min)}
          </span>
          <span>
            High: {maxPoint ? `${maxPoint.label} ${formatCurrency(max)}` : formatCurrency(max)}
          </span>
        </div>
      )}
    </div>
  );
}

