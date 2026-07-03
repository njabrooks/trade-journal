"use client";

import { useState } from "react";
import { Sunrise } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BriefView, type Brief } from "@/components/brief/BriefView";

/**
 * Brief archive browser — date list on the left (newest first, latest pre-selected),
 * the selected brief rendered in full on the right. The Vol Curve saved-reports
 * pattern applied to morning briefs: nothing is ever deleted, every day's synthesis
 * stays revisitable.
 */
export function BriefHistoryClient({ briefs }: { briefs: Brief[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(briefs[0]?.id ?? null);
  const selected = briefs.find((b) => b.id === selectedId) ?? briefs[0];

  if (briefs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-12 text-center">
        <Sunrise className="h-8 w-8 text-sky-500" />
        <p className="text-sm font-medium">No briefs yet</p>
        <p className="text-xs text-muted-foreground">
          The producer runs daily at 08:45 — or run{" "}
          <code className="rounded bg-muted px-1 py-0.5">/morning-brief</code> in a Claude session.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <nav className="shrink-0 lg:w-64">
        <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {briefs.map((b, idx) => (
            <li key={b.id} className="min-w-48 lg:min-w-0">
              <button
                type="button"
                onClick={() => setSelectedId(b.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                  b.id === selected?.id
                    ? "border-sky-500/40 bg-sky-500/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{b.briefDate}</span>
                  {idx === 0 && (
                    <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                      latest
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{b.headline}</p>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {selected && (
        <Card className="min-w-0 flex-1 gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sunrise className="h-4 w-4 text-sky-500" />
              {selected.briefDate}
              <span className="text-xs font-normal text-muted-foreground">
                generated {new Date(selected.updatedAt).toLocaleString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <BriefView brief={selected} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
