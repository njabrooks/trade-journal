"use client";

import { useState, useRef, useCallback } from "react";
import { formatCurrency } from "@/lib/formatters";

export interface LineChartDataPoint {
  label: string;
  value: number | null;
}

interface LineChartProps {
  data: LineChartDataPoint[];
  height?: number;
  stroke?: string;
  fillOpacity?: number;
}

const PADDING = { top: 8, right: 8, bottom: 24, left: 44 };

function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function LineChart({
  data,
  height = 200,
  stroke = "#2563eb",
  fillOpacity = 0.1,
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const sanitized = data.filter(
    (point): point is { label: string; value: number } =>
      typeof point.value === "number" && Number.isFinite(point.value)
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || sanitized.length === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const chartLeft = (PADDING.left / svgWidth) * rect.width;
      const chartRight = ((svgWidth - PADDING.right) / svgWidth) * rect.width;
      const chartW = chartRight - chartLeft;

      if (x < chartLeft || x > chartRight) {
        setHoverIndex(null);
        return;
      }

      const ratio = (x - chartLeft) / chartW;
      const idx = Math.round(ratio * (sanitized.length - 1));
      setHoverIndex(Math.max(0, Math.min(sanitized.length - 1, idx)));
    },
    [sanitized.length]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  if (sanitized.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>
        No data
      </div>
    );
  }

  const values = sanitized.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const svgWidth = 600;
  const chartW = svgWidth - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const points = sanitized.map((point, index) => {
    const x = PADDING.left + (index / Math.max(1, sanitized.length - 1)) * chartW;
    const y = PADDING.top + (1 - (point.value - min) / range) * chartH;
    return { x, y, ...point };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const areaPath = [
    `M ${points[0].x},${points[0].y}`,
    ...points.slice(1).map((p) => `L ${p.x},${p.y}`),
    `L ${points[points.length - 1].x},${PADDING.top + chartH}`,
    `L ${points[0].x},${PADDING.top + chartH}`,
    "Z",
  ].join(" ");

  // Y-axis: 3 ticks
  const yTicks = [max, (max + min) / 2, min];

  // X-axis: start, middle, end
  const xLabelIndices = [...new Set([0, Math.floor(sanitized.length / 2), sanitized.length - 1])];

  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg viewBox={`0 0 ${svgWidth} ${height}`} className="w-full" style={{ height }}>
        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = PADDING.top + (1 - (tick - min) / range) * chartH;
          return (
            <line
              key={i}
              x1={PADDING.left}
              y1={y}
              x2={svgWidth - PADDING.right}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.06}
              strokeWidth={1}
            />
          );
        })}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => {
          const y = PADDING.top + (1 - (tick - min) / range) * chartH;
          return (
            <text
              key={i}
              x={PADDING.left - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={9}
            >
              {formatCompactCurrency(tick)}
            </text>
          );
        })}

        {/* Gradient fill */}
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={fillOpacity} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" />

        {/* Line */}
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polylinePoints}
        />

        {/* X-axis labels */}
        {xLabelIndices.map((idx) => {
          const p = points[idx];
          return (
            <text
              key={idx}
              x={p.x}
              y={height - 4}
              textAnchor={idx === 0 ? "start" : idx === sanitized.length - 1 ? "end" : "middle"}
              className="fill-muted-foreground"
              fontSize={9}
            >
              {p.label}
            </text>
          );
        })}

        {/* Hover crosshair + dot */}
        {hoverPoint && (
          <>
            <line
              x1={hoverPoint.x}
              y1={PADDING.top}
              x2={hoverPoint.x}
              y2={PADDING.top + chartH}
              stroke="currentColor"
              strokeOpacity={0.15}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={4} fill="white" stroke={stroke} strokeWidth={2} />
          </>
        )}
      </svg>

      {/* Hover tooltip */}
      {hoverPoint && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${(hoverPoint.x / svgWidth) * 100}%`,
            top: 0,
          }}
        >
          <p className="font-medium text-foreground">{formatCurrency(hoverPoint.value)}</p>
          <p className="text-muted-foreground">{hoverPoint.label}</p>
        </div>
      )}
    </div>
  );
}
