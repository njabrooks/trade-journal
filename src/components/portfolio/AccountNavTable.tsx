"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { AccountNavBreakdownRow } from "@/db/queries/portfolio";

interface OwnerGroup {
  owner: string;
  accounts: AccountNavBreakdownRow[];
  totalNav: number;
  totalCash: number;
}

interface AccountNavTableProps {
  rows: AccountNavBreakdownRow[];
}

export function AccountNavTable({ rows }: AccountNavTableProps) {
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());

  const ownerGroups = useMemo<OwnerGroup[]>(() => {
    const byOwner = new Map<string, OwnerGroup>();
    for (const row of rows) {
      let group = byOwner.get(row.owner);
      if (!group) {
        group = { owner: row.owner, accounts: [], totalNav: 0, totalCash: 0 };
        byOwner.set(row.owner, group);
      }
      group.accounts.push(row);
      group.totalNav += row.nav;
      group.totalCash += row.cashUsd;
    }
    for (const group of byOwner.values()) {
      group.accounts.sort((a, b) => b.nav - a.nav);
    }
    return [...byOwner.values()].sort((a, b) => b.totalNav - a.totalNav);
  }, [rows]);

  const totalNav = useMemo(
    () => ownerGroups.reduce((sum, g) => sum + g.totalNav, 0),
    [ownerGroups]
  );
  const totalCash = useMemo(
    () => ownerGroups.reduce((sum, g) => sum + g.totalCash, 0),
    [ownerGroups]
  );

  const toggleOwner = (owner: string) => {
    setExpandedOwners((prev) => {
      const next = new Set(prev);
      if (next.has(owner)) next.delete(owner);
      else next.add(owner);
      return next;
    });
  };

  const allExpanded = expandedOwners.size === ownerGroups.length && ownerGroups.length > 0;
  const toggleAll = () => {
    setExpandedOwners(
      allExpanded ? new Set() : new Set(ownerGroups.map((g) => g.owner))
    );
  };

  if (ownerGroups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
        No account NAV data available for the selected accounts.
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">
          Owners ({ownerGroups.length})
        </h2>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {allExpanded ? "Collapse All" : "Expand All"}
        </button>
      </div>
      <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-2 pl-3 pr-3 w-8"></th>
              <th className="py-2 pr-3">Owner / Account</th>
              <th className="py-2 pr-3 text-right"># Accounts</th>
              <th className="py-2 pr-3 text-right">NAV</th>
              <th className="py-2 pr-3 text-right">Cash</th>
              <th className="py-2 pr-3 text-right">% NAV</th>
              <th className="py-2 pr-3 text-right">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ownerGroups.map((group) => {
              const isExpanded = expandedOwners.has(group.owner);
              const pctNav = totalNav > 0 ? (group.totalNav / totalNav) * 100 : null;
              return (
                <OwnerRow
                  key={group.owner}
                  group={group}
                  pctNav={pctNav}
                  totalNav={totalNav}
                  isExpanded={isExpanded}
                  onToggle={() => toggleOwner(group.owner)}
                />
              );
            })}
            {/* Total row */}
            <tr className="bg-muted/30 font-medium">
              <td className="py-2 pl-3 pr-3"></td>
              <td className="py-2 pr-3 text-sm">Total</td>
              <td className="py-2 pr-3 text-right text-sm">
                {rows.length}
              </td>
              <td className="py-2 pr-3 text-right text-sm tabular-nums">
                {formatCurrency(totalNav)}
              </td>
              <td className="py-2 pr-3 text-right text-sm tabular-nums">
                {formatCurrency(totalCash)}
              </td>
              <td className="py-2 pr-3 text-right text-sm text-muted-foreground">
                100%
              </td>
              <td className="py-2 pr-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface OwnerRowProps {
  group: OwnerGroup;
  pctNav: number | null;
  totalNav: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function OwnerRow({ group, pctNav, totalNav, isExpanded, onToggle }: OwnerRowProps) {
  return (
    <>
      <tr
        className={cn(
          "cursor-pointer hover:bg-muted/40 transition-colors",
          isExpanded && "bg-muted/20"
        )}
        onClick={onToggle}
      >
        <td className="py-2 pl-3 pr-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="py-2 pr-3 text-sm font-medium">{group.owner}</td>
        <td className="py-2 pr-3 text-right text-sm text-muted-foreground">
          {group.accounts.length}
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums">
          {formatCurrency(group.totalNav)}
        </td>
        <td className="py-2 pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {formatCurrency(group.totalCash)}
        </td>
        <td className="py-2 pr-3 text-right text-sm text-muted-foreground tabular-nums">
          {formatPercent(pctNav)}
        </td>
        <td className="py-2 pr-3 text-right text-xs text-muted-foreground">
          {summarizeBrokers(group.accounts)}
        </td>
      </tr>
      {isExpanded &&
        group.accounts.map((acct) => {
          const acctPct = totalNav > 0 ? (acct.nav / totalNav) * 100 : null;
          return (
            <tr key={acct.accountId} className="bg-background/40">
              <td className="py-1.5 pl-3 pr-3"></td>
              <td className="py-1.5 pr-3 pl-6 text-sm">
                <div className="flex flex-col">
                  <span className="text-foreground">
                    {acct.label || acct.brokerAccountId}
                  </span>
                  {acct.label && (
                    <span className="text-xs text-muted-foreground">
                      {acct.brokerAccountId}
                    </span>
                  )}
                </div>
              </td>
              <td className="py-1.5 pr-3"></td>
              <td className="py-1.5 pr-3 text-right text-sm tabular-nums">
                {formatCurrency(acct.nav)}
              </td>
              <td className="py-1.5 pr-3 text-right text-sm tabular-nums text-muted-foreground">
                {formatCurrency(acct.cashUsd)}
              </td>
              <td className="py-1.5 pr-3 text-right text-sm text-muted-foreground tabular-nums">
                {formatPercent(acctPct)}
              </td>
              <td className="py-1.5 pr-3 text-right text-xs text-muted-foreground">
                {acct.brokerName}
              </td>
            </tr>
          );
        })}
    </>
  );
}

function summarizeBrokers(accts: AccountNavBreakdownRow[]): string {
  const brokers = new Set(accts.map((a) => a.brokerName));
  if (brokers.size === 0) return "";
  if (brokers.size === 1) return [...brokers][0];
  return `${brokers.size} sources`;
}
