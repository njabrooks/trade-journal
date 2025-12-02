interface PlaybookSidebarProps {
  strategy: {
    strategyType: string | null;
    templateLabel: string | null;
    underlyingTicker: string | null;
    openedAt: Date | null;
    status: string;
  };
  currentStateCode: string | null;
  currentPlaybookItem: {
    code: string;
    label: string;
    description: string | null;
    category: string;
    checklistItems: Array<{ order: number; type: string; text: string }> | null;
  } | null;
  strategyMetadata: {
    thesis: string | null;
    profitRules: string | null;
    defenseRules: string | null;
    timeRules: string | null;
  };
}

export function PlaybookSidebar({
  strategy,
  currentStateCode,
  currentPlaybookItem,
  strategyMetadata,
}: PlaybookSidebarProps) {
  return (
    <div className="sticky top-6 h-fit w-[28rem] self-start">
      <div className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
              Strategy Info
            </p>
            <dl className="space-y-2 text-sm text-slate-600">
              <InfoRow label="Strategy Type" value={strategy.strategyType ?? "—"} />
              <InfoRow label="State Code" value={currentStateCode ?? "—"} />
              <InfoRow label="Template" value={strategy.templateLabel ?? "—"} />
              <InfoRow label="Underlying" value={strategy.underlyingTicker ?? "—"} />
              <InfoRow
                label="Opened"
                value={
                  strategy.openedAt
                    ? new Date(strategy.openedAt).toLocaleDateString()
                    : "—"
                }
              />
              <InfoRow label="Status" value={strategy.status} />
            </dl>
          </div>

          {currentPlaybookItem && (
            <div className="border-t pt-4">
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  Current State
                </p>
                <p className="text-xs font-medium text-slate-500">
                  {currentPlaybookItem.code}
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {currentPlaybookItem.label}
                </p>
                <span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                  {currentPlaybookItem.category}
                </span>
              </div>
              {currentPlaybookItem.description && (
                <p className="text-xs text-slate-600 mb-3">
                  {currentPlaybookItem.description}
                </p>
              )}
              {currentPlaybookItem.checklistItems &&
                currentPlaybookItem.checklistItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Actions
                    </p>
                    {currentPlaybookItem.checklistItems.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 mt-0.5">
                          {item.type}
                        </span>
                        <p className="text-xs text-slate-700 flex-1">{item.text}</p>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}

          {(strategyMetadata.thesis ||
            strategyMetadata.profitRules ||
            strategyMetadata.defenseRules ||
            strategyMetadata.timeRules) && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Strategy Rules
              </p>
              {strategyMetadata.thesis && (
                <RuleBlock title="Thesis" body={strategyMetadata.thesis} />
              )}
              {strategyMetadata.profitRules && (
                <RuleBlock title="Profit Rules" body={strategyMetadata.profitRules} />
              )}
              {strategyMetadata.defenseRules && (
                <RuleBlock
                  title="Defense Rules"
                  body={strategyMetadata.defenseRules}
                />
              )}
              {strategyMetadata.timeRules && (
                <RuleBlock title="Time Rules" body={strategyMetadata.timeRules} />
              )}
            </div>
          )}
        </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-medium text-slate-900">{value}</span>
    </div>
  );
}

function RuleBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
        {title}
      </p>
      <p className="text-xs text-slate-600 whitespace-pre-line">{body}</p>
    </div>
  );
}

