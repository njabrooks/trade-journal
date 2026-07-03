"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DecisionObjectCard } from "./DecisionObjectCard";
import { groupDecisionsByObject, type DecisionItem } from "./shared";

/**
 * The /decisions page body (Lane B, docs/v2/20) — web twin of the /decisions skill.
 * Fetches ALL active decision packets, groups them one card per thesis/object, and
 * ranks cards by urgency tier (risk → belief upkeep → graph hygiene → additive),
 * oldest first within a tier — the same order list-decisions.ts gives the skill.
 * Actions patch the existing /api/dashboard/decisions endpoint optimistically.
 */
export function DecisionCards() {
  const [decisions, setDecisions] = useState<DecisionItem[] | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/decisions?limit=all")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDecisions(data?.decisions ?? []))
      .catch(() => setDecisions([]));
  }, []);

  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    setDecisions((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
    await fetch("/api/dashboard/decisions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    }).catch(() => {});
  }, []);

  const groups = useMemo(() => groupDecisionsByObject(decisions ?? []), [decisions]);

  if (decisions === null) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-12 text-center">
        <CircleCheck className="h-8 w-8 text-emerald-500" />
        <p className="text-sm font-medium">No open decisions</p>
        <p className="text-xs text-muted-foreground">
          Run <code className="rounded bg-muted px-1 py-0.5">/maintenance</code> to surface new ones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {decisions.length} open decision{decisions.length === 1 ? "" : "s"} across {groups.length}{" "}
        object{groups.length === 1 ? "" : "s"} — ranked by urgency, oldest first. Read them here, then{" "}
        <span className="font-medium text-foreground">resolve in a Claude session</span> (run{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">/decisions</code>, or copy a specific
        command from a card). Snooze parks one for later; dismiss clears noise.
      </p>
      {groups.map((group) => (
        <DecisionObjectCard key={group.key} group={group} onPatch={patch} />
      ))}
    </div>
  );
}
