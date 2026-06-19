"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, Clock, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/formatters";
import {
  DECISION_TYPE_LABELS,
  type DecisionPacket,
} from "@/lib/types/decisions";

interface DecisionItem {
  id: string;
  objectType: string;
  objectId: string;
  objectTitle: string | null;
  actionDescription: string;
  rationale: string | null;
  timestamp: string;
  source: string;
  decision: DecisionPacket | null;
}

const ENTITY_PATHS: Record<string, (id: string) => string> = {
  macro_thesis: (id) => `/macro-theses/${id}/overview`,
  asset_thesis: (id) => `/asset-theses/${id}/overview`,
  strategy: (id) => `/strategies/${id}/overview`,
  signal: (id) => `/signals/${id}`,
  claim: (id) => `/claims/${id}`,
};

const SNOOZE_DAYS = 7;

/**
 * "Needs decision" strip — the only inbox-like element in v2 (docs/v2/09 §8).
 * Renders nothing until a Claude review job emits decision_required journal entries.
 * Typed entries carry a decision packet (decision_type chip + recommended actions +
 * the agent runbook that resolves them); legacy bare entries still render. The work
 * happens with an agent — the strip only offers snooze / dismiss; resolution (with the
 * graph write) is done by the agent via resolve-decision.
 */
export function DecisionStrip() {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);

  useEffect(() => {
    fetch("/api/dashboard/decisions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDecisions(data?.decisions ?? []))
      .catch(() => {});
  }, []);

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setDecisions((prev) => prev.filter((d) => d.id !== id));
      await fetch("/api/dashboard/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      }).catch(() => {});
    },
    []
  );

  const dismiss = useCallback((id: string) => patch(id, { status: "dismissed" }), [patch]);
  const snooze = useCallback(
    (id: string) =>
      patch(id, {
        status: "snoozed",
        snoozedUntil: new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString(),
      }),
    [patch]
  );

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
          const packet = d.decision;
          const typeLabel = packet ? DECISION_TYPE_LABELS[packet.decision_type] : null;
          return (
            <li key={d.id} className="flex items-start gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  {typeLabel && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      {typeLabel}
                    </span>
                  )}
                  {href ? (
                    <Link href={href} className="font-medium hover:underline">
                      {d.objectTitle ?? d.objectType}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.objectTitle ?? d.objectType}</span>
                  )}
                  <span className="text-muted-foreground">— {d.actionDescription}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(d.timestamp)}
                  </span>
                </div>
                {(packet?.why_raised || d.rationale) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {packet?.why_raised ?? d.rationale}
                  </p>
                )}
                {packet && packet.recommended_actions.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {packet.recommended_actions.map((a, i) => (
                      <span
                        key={i}
                        className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        title={a.action}
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                )}
                {packet?.agent_runbook && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    ↳ resolve with{" "}
                    <code className="rounded bg-muted px-1 py-0.5">{packet.agent_runbook}</code>
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => snooze(d.id)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title={`Snooze ${SNOOZE_DAYS}d`}
                >
                  <Clock className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(d.id)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
