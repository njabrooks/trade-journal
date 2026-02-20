"use client";

import { useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OwnerNavComparison } from "@/db/queries/reconciliation";

function StatusBadge({
  snapshotNav,
  eventSourcedNav,
  deltaPct,
}: {
  snapshotNav: number | null;
  eventSourcedNav: number | null;
  deltaPct: number | null;
}) {
  if (snapshotNav == null)
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
        ES-only
      </span>
    );
  if (eventSourcedNav == null)
    return (
      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
        Snap-only
      </span>
    );
  const absPct = Math.abs(deltaPct ?? 0);
  if (absPct < 1)
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        Match
      </span>
    );
  if (absPct < 5)
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        Mismatch
      </span>
    );
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
      Mismatch
    </span>
  );
}

interface ReconciliationOwnerTableProps {
  owners: OwnerNavComparison[];
}

export function ReconciliationOwnerTable({
  owners,
}: ReconciliationOwnerTableProps) {
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());

  function toggleExpand(owner: string) {
    setExpandedOwners((prev) => {
      const next = new Set(prev);
      if (next.has(owner)) next.delete(owner);
      else next.add(owner);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto min-w-0">
      <table className="w-full">
        <thead className="border-b">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[20%]">
              Owner
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-[18%]">
              Snapshot NAV
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-[18%]">
              Event-Sourced NAV
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-[16%]">
              Delta
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-[10%]">
              Delta %
            </th>
            <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-[18%]">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {owners.map((owner) => {
            const isExpanded = expandedOwners.has(owner.owner);
            const hasAccounts = owner.accounts.length > 0;

            return (
              <OwnerRow
                key={owner.owner}
                owner={owner}
                isExpanded={isExpanded}
                hasAccounts={hasAccounts}
                onToggle={() => toggleExpand(owner.owner)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OwnerRow({
  owner,
  isExpanded,
  hasAccounts,
  onToggle,
}: {
  owner: OwnerNavComparison;
  isExpanded: boolean;
  hasAccounts: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`hover:bg-muted/50 transition-colors ${hasAccounts ? "cursor-pointer" : ""}`}
        onClick={hasAccounts ? onToggle : undefined}
      >
        <td className="px-3 py-2 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            {hasAccounts &&
              (isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              ))}
            {owner.owner}
          </span>
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums">
          {owner.snapshotNavTotal != null
            ? formatCurrency(owner.snapshotNavTotal)
            : "—"}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums">
          {owner.eventSourcedNavTotal != null
            ? formatCurrency(owner.eventSourcedNavTotal)
            : "—"}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums font-medium">
          {owner.delta != null ? formatCurrency(owner.delta) : "—"}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums">
          {owner.deltaPct != null ? formatPercent(owner.deltaPct) : "—"}
        </td>
        <td className="px-3 py-2 text-center">
          <StatusBadge
            snapshotNav={owner.snapshotNavTotal}
            eventSourcedNav={owner.eventSourcedNavTotal}
            deltaPct={owner.deltaPct}
          />
        </td>
      </tr>
      {isExpanded &&
        owner.accounts.map((acct, idx) => (
          <tr key={idx} className="bg-muted/30">
            <td className="pl-8 pr-3 py-1.5 text-xs text-muted-foreground">
              {acct.snapshotAccount ?? acct.eventSourcedAccount ?? "—"}
              {acct.snapshotAccountId && (
                <span className="ml-1 text-muted-foreground/60">
                  ({acct.snapshotAccountId.slice(0, 8)}...)
                </span>
              )}
            </td>
            <td className="px-3 py-1.5 text-xs text-right tabular-nums text-muted-foreground">
              {acct.snapshotNav != null
                ? formatCurrency(acct.snapshotNav)
                : "—"}
            </td>
            <td className="px-3 py-1.5 text-xs text-right tabular-nums text-muted-foreground">
              {acct.eventSourcedNav != null
                ? formatCurrency(acct.eventSourcedNav)
                : "—"}
            </td>
            <td className="px-3 py-1.5 text-xs text-right tabular-nums text-muted-foreground">
              {acct.snapshotNav != null || acct.eventSourcedNav != null
                ? formatCurrency((acct.snapshotNav ?? 0) - (acct.eventSourcedNav ?? 0))
                : "—"}
            </td>
            <td className="px-3 py-1.5 text-xs text-right tabular-nums text-muted-foreground" />
            <td className="px-3 py-1.5 text-center">
              <span
                className={`text-xs ${
                  acct.matchStatus === "matched"
                    ? "text-emerald-600"
                    : acct.matchStatus === "snapshot_only"
                      ? "text-purple-600"
                      : "text-blue-600"
                }`}
              >
                {acct.matchStatus === "matched"
                  ? "Matched"
                  : acct.matchStatus === "snapshot_only"
                    ? "Snap-only"
                    : "ES-only"}
              </span>
            </td>
          </tr>
        ))}
    </>
  );
}
