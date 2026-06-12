"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/formatters";

interface DecisionItem {
  id: string;
  objectType: string;
  objectId: string;
  objectTitle: string | null;
  actionDescription: string;
  rationale: string | null;
  timestamp: string;
  source: string;
}

const ENTITY_PATHS: Record<string, (id: string) => string> = {
  macro_thesis: (id) => `/macro-theses/${id}/overview`,
  asset_thesis: (id) => `/asset-theses/${id}/overview`,
  strategy: (id) => `/strategies/${id}/overview`,
  signal: (id) => `/signals/${id}`,
  claim: (id) => `/claims/${id}`,
};

/**
 * "Needs decision" strip — the only inbox-like element in v2 (spec §3).
 * Renders nothing until a Claude review job (W8) emits decision_required
 * journal entries. Hard-capped server-side; each item is a genuine decision,
 * dismissible inline.
 */
export function DecisionStrip() {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);

  useEffect(() => {
    fetch("/api/dashboard/decisions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDecisions(data?.decisions ?? []))
      .catch(() => {});
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setDecisions((prev) => prev.filter((d) => d.id !== id));
    await fetch("/api/dashboard/decisions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "dismissed" }),
    }).catch(() => {});
  }, []);

  if (decisions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <CircleAlert className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold">Needs decision</h3>
        <span className="text-xs text-muted-foreground">{decisions.length}</span>
      </div>
      <ul className="space-y-2">
        {decisions.map((d) => {
          const href = ENTITY_PATHS[d.objectType]?.(d.objectId);
          return (
            <li key={d.id} className="flex items-start gap-3 text-sm">
              <div className="min-w-0 flex-1">
                {href ? (
                  <Link href={href} className="font-medium hover:underline">
                    {d.objectTitle ?? d.objectType}
                  </Link>
                ) : (
                  <span className="font-medium">{d.objectTitle ?? d.objectType}</span>
                )}
                <span className="text-muted-foreground"> — {d.actionDescription}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatRelativeTime(d.timestamp)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => dismiss(d.id)}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
