import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ExportCsvButton } from "@/components/blotter/ExportCsvButton";
import { getPrimaryAccount } from "@/db/queries/accounts";
import { getBlotterEntries } from "@/db/queries/blotter";
import { formatCurrency, formatDateLabel, formatDateTime } from "@/lib/formatters";

interface BlotterPageProps {
  searchParams?: Promise<{
    actionClass?: string;
    followUp?: string;
  }>;
}

const FOLLOW_UP_FILTERS = ["all", "pending", "completed"] as const;

export default async function BlotterPage({ searchParams }: BlotterPageProps) {
  const account = await getPrimaryAccount();

  if (!account) {
    return (
      <DashboardShell
        activeNav="blotter"
        title="Blotter"
        subtitle="Create an account to start logging actions."
      >
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No accounts found. Head to <a href="/admin/accounts" className="text-blue-600 underline">Admin &gt; Accounts</a> to add one.
        </div>
      </DashboardShell>
    );
  }

  const resolvedSearchParams = await searchParams;
  const actionClassFilter = (resolvedSearchParams?.actionClass ?? "all").toLowerCase();
  const followUpFilter = (resolvedSearchParams?.followUp ?? "all").toLowerCase() as
    | "all"
    | "pending"
    | "completed";

  const entries = await getBlotterEntries(account.id, {
    actionClass: actionClassFilter,
    followUp: followUpFilter,
  });

  const uniqueActionClasses = Array.from(
    new Set(entries.map((entry) => entry.actionClass).filter(Boolean))
  ) as string[];
  if (!uniqueActionClasses.includes(actionClassFilter) && actionClassFilter !== "all") {
    uniqueActionClasses.push(actionClassFilter);
  }
  const actionClassOptions = ["all", ...uniqueActionClasses];

  const pendingFollowUps = entries.filter(
    (entry) => entry.followUpRequired && !entry.completed
  );

  return (
    <DashboardShell
      activeNav="blotter"
      title="Blotter"
      subtitle="Journal of decisions and follow-ups"
      actions={
        <ExportCsvButton
          rows={entries}
          columns={[
            { key: "actionDate", label: "action_date" },
            { key: "strategyKey", label: "strategy_key" },
            { key: "actionClass", label: "action_class" },
            { key: "actionDetail", label: "action_detail" },
            { key: "reasonCode", label: "reason_code" },
            { key: "qtyChange", label: "qty_change" },
            { key: "premiumChange", label: "premium_change" },
            { key: "realizedPnl", label: "realized_pnl" },
            { key: "followUpRequired", label: "follow_up_required" },
            { key: "followUpDate", label: "follow_up_date" },
            { key: "completed", label: "completed" },
          ]}
          filename="blotter_export.csv"
        />
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Entries" value={entries.length.toString()} />
        <SummaryCard label="Action class" value={actionClassFilter} />
        <SummaryCard
          label="Pending follow-ups"
          value={pendingFollowUps.length.toString()}
          valueClass={pendingFollowUps.length > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <SummaryCard
          label="Unmatched trades"
          value={entries.filter(
            (e) => e.source === 'trade_ingestion' && !e.linkedBlotterActionId
          ).length.toString()}
          valueClass={
            entries.filter((e) => e.source === 'trade_ingestion' && !e.linkedBlotterActionId)
              .length > 0
              ? "text-amber-600"
              : "text-slate-900"
          }
        />
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="uppercase tracking-wide text-slate-400">Action class</span>
          <div className="flex flex-wrap gap-2">
            {actionClassOptions.map((option) => (
              <Link
                key={option}
                href={buildBlotterHref({
                  actionClass: option,
                  followUp: followUpFilter,
                })}
                className={`rounded-full px-3 py-1 font-medium ${
                  actionClassFilter === option
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {option}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <span className="uppercase tracking-wide text-slate-400">Follow-up</span>
          <div className="flex flex-wrap gap-2">
            {FOLLOW_UP_FILTERS.map((option) => (
              <Link
                key={option}
                href={buildBlotterHref({
                  actionClass: actionClassFilter,
                  followUp: option,
                })}
                className={`rounded-full px-3 py-1 font-medium ${
                  followUpFilter === option
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {option}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Strategy</th>
                <th className="px-6 py-3">Class</th>
                <th className="px-6 py-3">Detail</th>
                <th className="px-6 py-3 text-right">Qty Δ</th>
                <th className="px-6 py-3 text-right">Premium Δ</th>
                <th className="px-6 py-3 text-right">Realized</th>
                <th className="px-6 py-3">Metadata</th>
                <th className="px-6 py-3">Follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-slate-400">
                    No blotter actions match the selected filters.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isTrade = entry.source === 'trade_ingestion';
                  const isTradeAction = entry.actionClass === 'TRADE' && entry.source === 'triage_action';
                  const isMatched = !!entry.linkedBlotterActionId;
                  const needsMetadata = isTrade && !isMatched;
                  const needsTrade = isTradeAction && !isMatched;

                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-slate-50 ${
                        needsMetadata || needsTrade ? 'bg-amber-50/50 border-l-4 border-l-amber-400' : ''
                      }`}
                    >
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {entry.createdAt ? formatDateTime(entry.createdAt) : formatDateLabel(entry.actionDate)}
                    </td>
                    <td className="px-6 py-3">
                      {entry.strategyId ? (
                        <Link
                          href={`/strategies/${entry.strategyId}`}
                          className="font-medium text-slate-900 hover:text-blue-600"
                        >
                          {entry.strategyKey ?? "Strategy"}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Unlinked</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs uppercase tracking-wide text-slate-500">
                      {entry.actionClass || "—"}
                    </td>
                    <td className="px-6 py-3">
                        <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-900">
                          {entry.actionDetail || entry.reasonCode || "—"}
                        </span>
                          {entry.reasonCode && entry.reasonCode !== entry.actionDetail ? (
                          <span className="text-xs text-slate-400">{entry.reasonCode}</span>
                        ) : null}
                          {isTrade && entry.tradeCount && entry.tradeCount > 1 && (
                            <span className="text-xs text-slate-400">
                              {entry.tradeCount} trades aggregated
                            </span>
                          )}
                          {/* Show notes for MONITOR/DISMISS actions */}
                          {entry.notes && (entry.actionDetail === 'MONITOR' || entry.actionDetail === 'DISMISS') && (
                            <span className="text-xs text-slate-600 italic mt-1">
                              {entry.notes}
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {entry.qtyChange ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {formatCurrency(entry.premiumChange)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {formatCurrency(entry.realizedPnl)}
                    </td>
                      <td className="px-6 py-3">
                        {isTrade ? (
                          isMatched ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                <svg
                                  className="h-3 w-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                Matched
                              </span>
                              {entry.linkedTradeReason && (
                                <span className="text-xs text-slate-600">
                                  {entry.linkedTradeReason}
                                  {entry.linkedTradeStage && (
                                    <span className="text-slate-400"> · {entry.linkedTradeStage}</span>
                                  )}
                                </span>
                              )}
                              {entry.linkedNotes && (
                                <span className="text-xs text-slate-500 italic">
                                  {entry.linkedNotes}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                              </svg>
                              Needs metadata
                            </span>
                          )
                        ) : entry.actionClass === 'TRADE' && entry.source === 'triage_action' ? (
                          // TRADE action from triage (created before trade ingestion)
                          isMatched ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                              Linked to trade
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              Needs trade
                            </span>
                          )
                        ) : entry.linkedBlotterActionId || entry.linkedTradeEntries ? (
                          // Other triage actions (like QUANTITY_CHANGE) linked to trades
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                              {entry.linkedTradeEntries && entry.linkedTradeEntries.length > 1
                                ? `Linked to ${entry.linkedTradeEntries.length} trades`
                                : 'Linked to trade'}
                            </span>
                            {entry.linkedTradeEntries && entry.linkedTradeEntries.length > 1 && (
                              <div className="flex flex-col gap-0.5 text-xs text-slate-600">
                                {entry.linkedTradeEntries.map((linkedTrade) => (
                                  <span key={linkedTrade.id} className="text-xs">
                                    {linkedTrade.ticker}: {linkedTrade.qtyChange && linkedTrade.qtyChange > 0 ? '+' : ''}{linkedTrade.qtyChange} @ {formatCurrency(linkedTrade.premiumChange)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    <td className="px-6 py-3">
                      {entry.followUpRequired ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            entry.completed
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {entry.completed ? "Done" : "Pending"}
                          {entry.followUpDate ? `· ${formatDateLabel(entry.followUpDate)}` : ""}
                        </span>
                        ) : (entry.actionDetail === 'MONITOR' || entry.actionDetail === 'DISMISS') ? (
                          // MONITOR/DISMISS actions - show status and details
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                entry.actionDetail === 'MONITOR'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {entry.actionDetail === 'MONITOR' ? (
                                <>
                                  <svg
                                    className="h-3 w-3"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                  </svg>
                                  Monitoring
                                </>
                              ) : (
                                <>
                                  <svg
                                    className="h-3 w-3"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                  Dismissed
                                </>
                              )}
                            </span>
                            {entry.actionDetail === 'MONITOR' && entry.overrideExpiresDate && (
                              <span className="text-xs text-slate-500">
                                Expires: {formatDateLabel(entry.overrideExpiresDate)}
                                {entry.monitorDays && (
                                  <span className="text-slate-400"> ({entry.monitorDays} days)</span>
                                )}
                              </span>
                            )}
                            {entry.actionDetail === 'DISMISS' && entry.severityOverride === 'info' && (
                              <span className="text-xs text-slate-500">Permanent override</span>
                            )}
                          </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}

function SummaryCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function buildBlotterHref({
  actionClass,
  followUp,
}: {
  actionClass: string;
  followUp: string;
}) {
  const params = new URLSearchParams();
  if (actionClass && actionClass !== "all") {
    params.set("actionClass", actionClass);
  }
  if (followUp && followUp !== "all") {
    params.set("followUp", followUp);
  }
  const query = params.toString();
  return `/blotter${query ? `?${query}` : ""}`;
}

