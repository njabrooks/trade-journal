interface StackedBarSegment {
  label: string;
  value: number;
  color?: string;
}

interface StackedBarProps {
  segments: StackedBarSegment[];
}

export function StackedBar({ segments }: StackedBarProps) {
  const positiveSegments = segments.filter((segment) => segment.value > 0);
  const total = positiveSegments.reduce((acc, segment) => acc + segment.value, 0);

  if (total <= 0) {
    return (
      <div className="h-3 w-full rounded-full bg-slate-200 text-center text-xs text-slate-400">
        &nbsp;
      </div>
    );
  }

  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200">
      {positiveSegments.map((segment) => (
        <div
          key={segment.label}
          className="h-full"
          style={{
            width: `${(segment.value / total) * 100}%`,
            backgroundColor: segment.color ?? "oklch(0.5 0.1 240)",
          }}
          title={`${segment.label}: ${segment.value.toLocaleString()}`}
        />
      ))}
    </div>
  );
}

