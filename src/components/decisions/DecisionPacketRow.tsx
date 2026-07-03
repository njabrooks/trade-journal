"use client";

import { Clock, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DECISION_TYPE_LABELS, deepLinkCommand } from "@/lib/types/decisions";
import { CopyCommandButton } from "./CopyCommandButton";
import { decisionAgeDays, STALE_AGE_DAYS, type DecisionItem } from "./shared";

const SNOOZE_DAYS = 7;

export type PatchDecision = (id: string, body: Record<string, unknown>) => void;

/**
 * One decision packet inside an object card — a READING surface, not an action one.
 *
 * The graph writes (confirm a claim link, classify exposure, re-underwrite, …) all go
 * through the agent via resolve-decision.ts, which validates transitions and captures
 * the judgment. The app never mutates the belief graph from here — an earlier build put
 * one-click "resolve" buttons on this row wired to a PATCH that only closed the journal
 * row without doing the write, so clicking "Confirm" silently dropped the link. Those
 * are gone.
 *
 * What remains: the packet's proposed actions shown read-only (so you know what the agent
 * would do), a copy-command hand-off to the runbook that actually resolves it, and the two
 * genuinely-safe status-only controls — snooze and dismiss. Age escalates past
 * STALE_AGE_DAYS (Lane B §3 — nothing rots silently).
 */
export function DecisionPacketRow({ item, onPatch }: { item: DecisionItem; onPatch: PatchDecision }) {
  const packet = item.decision;
  const ageDays = decisionAgeDays(item.timestamp);
  const stale = ageDays > STALE_AGE_DAYS;

  const snooze = () =>
    onPatch(item.id, {
      status: "snoozed",
      snoozedUntil: new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString(),
    });
  const dismiss = () => onPatch(item.id, { status: "dismissed" });

  return (
    <li className="flex items-start gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {packet && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              {DECISION_TYPE_LABELS[packet.decision_type]}
            </span>
          )}
          <span className="text-muted-foreground">{item.actionDescription}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              stale ? "font-medium text-red-500" : "text-muted-foreground"
            )}
            title={new Date(item.timestamp).toLocaleString()}
          >
            {stale && <TriangleAlert className="h-3 w-3" />}
            {ageDays === 0 ? "today" : `${ageDays}d`}
          </span>
        </div>
        {(packet?.why_raised || item.rationale) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {packet?.why_raised ?? item.rationale}
          </p>
        )}
        {packet && packet.recommended_actions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground">Agent can:</span>
            {packet.recommended_actions.map((a) => (
              <span
                key={a.action}
                className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                title={a.action}
              >
                {a.label}
              </span>
            ))}
          </div>
        )}
        {packet && (
          <div className="mt-2">
            <CopyCommandButton command={deepLinkCommand(packet, item.objectTitle)} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={snooze}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={`Snooze ${SNOOZE_DAYS}d`}
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
