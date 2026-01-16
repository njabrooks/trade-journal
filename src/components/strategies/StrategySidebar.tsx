import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface StrategySidebarProps {
  strategy: {
    strategyType: string | null;
    templateLabel: string | null;
    underlyingTicker: string | null;
    openedAt: Date | null;
    status: string;
  };
}

export function StrategySidebar({
  strategy,
}: StrategySidebarProps) {
  return (
    <div className="sticky top-6 h-fit w-[28rem] self-start">
      <div className="rounded-lg border bg-white shadow-sm">
        <Accordion type="multiple" className="w-full" defaultValue={["strategy-info"]}>
          <AccordionItem value="strategy-info" className="border-b-0">
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:no-underline">
              Strategy Info
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <dl className="space-y-2 text-sm text-slate-600">
                <InfoRow label="Strategy Type" value={strategy.strategyType ?? "—"} />
                <InfoRow label="Template" value={strategy.templateLabel ?? "—"} />
                <InfoRow label="Underlying" value={strategy.underlyingTicker ?? "—"} />
                <InfoRow
                  label="Opened"
                  value={
                    strategy.openedAt
                      ? new Date(strategy.openedAt).toLocaleDateString('en-GB')
                      : "—"
                  }
                />
                <InfoRow label="Status" value={strategy.status} />
              </dl>
            </AccordionContent>
          </AccordionItem>
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
