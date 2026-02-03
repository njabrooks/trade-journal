"use client";

interface PieChartSegment {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  segments: PieChartSegment[];
  size?: number;
}

export function PieChart({ segments, size = 120 }: PieChartProps) {
  const positiveSegments = segments.filter((segment) => segment.value > 0);
  const total = positiveSegments.reduce((acc, segment) => acc + segment.value, 0);

  if (total <= 0 || positiveSegments.length === 0) {
    return (
      <div
        className="rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  // Calculate pie slices using conic-gradient
  let currentAngle = 0;
  const gradientStops: string[] = [];

  for (const segment of positiveSegments) {
    const percentage = (segment.value / total) * 100;
    const startAngle = currentAngle;
    const endAngle = currentAngle + percentage;

    gradientStops.push(`${segment.color} ${startAngle}% ${endAngle}%`);
    currentAngle = endAngle;
  }

  const conicGradient = `conic-gradient(${gradientStops.join(", ")})`;

  return (
    <div
      className="rounded-full shadow-inner"
      style={{
        width: size,
        height: size,
        background: conicGradient,
      }}
      title={positiveSegments.map((s) => `${s.label}: ${s.value.toLocaleString()}`).join("\n")}
    />
  );
}
