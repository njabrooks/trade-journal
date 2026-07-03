"use client";

import { Clock, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DECISION_TYPE_LABELS,
  deepLinkCommand,
  isMechanicalPacket,
} from "@/lib/types/decisions";
import { CopyCommandButton } from "./CopyCommandButton";
import { decisionAgeDays, STALE_AGE_DAYS, type DecisionItem } from "./shared";

const SNOOZE_DAYS = 7;

export type PatchDecision = (id: string, body: Record<string, unknown>) => void;

/**
 * One decision packet inside an object card. Mechanical packets (clear proposal —
 * confirm_claim_link / classify_exposure / classify_macro_link with a default) get
 * one-click resolve buttons wired to the existing PATCH; judgment packets get the
 * copy-command deep link to their agent runbook. Everything can snooze/dismiss.
 * Age escalates visually past STALE_AGE_DAYS (Lane B §3 — nothing rots silently).
 */
export function DecisionPacketRow({ item, onPatch }: { item: DecisionItem; onPatch: PatchDecision }) {
  const packet = item.decision;
  const mechanical = !!packet && isMechanicalPacket(packet);
  const ageDays = decisionAgeDays(item.timestamp);
  const stale = ageDays > STALE_AGE_DAYS;

  const resolve = (actionTaken: string) =>
    onPatch(item.id, { status: "resolved", resolution: { action_taken: actionTaken } });
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {mechanical && packet ? (
            <>
              {packet.recommended_actions.length > 0 ? (
                packet.recommended_actions.map((a) => (
                  <Button
                    key={a.action}
                    type="button"
                    size="sm"
                    variant={
                      packet.default_recommendation?.action === a.action ? "default" : "outline"
                    }
                    title={a.action}
                    onClick={() => resolve(a.action)}
                  >
                    {a.label}
                  </Button>
                ))
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => resolve("resolved")}>
                  Resolve
                </Button>
              )}
            </>
          ) : (
            packet && <CopyCommandButton command={deepLinkCommand(packet, item.objectTitle)} />
          )}
        </div>
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
