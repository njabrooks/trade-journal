import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

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
      <div className="rounded-lg border bg-white shadow-sm">
        <Accordion type="multiple" className="w-full" defaultValue={["strategy-info"]}>
          <AccordionItem value="strategy-info" className="border-b">
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:no-underline">
              Strategy Info
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
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
            </AccordionContent>
          </AccordionItem>

          {currentPlaybookItem && (
            <AccordionItem value="current-state" className="border-b">
              <AccordionTrigger className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:no-underline">
                Current State
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {currentPlaybookItem.code}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {currentPlaybookItem.label}
                  </p>
                  <Badge variant="secondary" className="mt-1 bg-blue-100 text-blue-800">
                    {currentPlaybookItem.category}
                  </Badge>
                </div>
                {currentPlaybookItem.description && (
                  <p className="text-xs text-slate-600">
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
                          <Badge variant="outline" className="mt-0.5 text-xs">
                            {item.type}
                          </Badge>
                          <p className="text-xs text-slate-700 flex-1">{item.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
              </AccordionContent>
            </AccordionItem>
          )}

          {(strategyMetadata.thesis ||
            strategyMetadata.profitRules ||
            strategyMetadata.defenseRules ||
            strategyMetadata.timeRules) && (
            <AccordionItem value="strategy-rules" className="border-b">
              <AccordionTrigger className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:no-underline">
                Strategy Rules
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
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
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
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

