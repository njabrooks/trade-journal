import { Metadata } from "next";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SignalsBrowser } from "@/components/signals/SignalsBrowser";
import { getAllSignalsWithContext } from "@/db/queries/signals";

export const metadata: Metadata = {
  title: "Signals",
};

export default async function SignalsPage() {
  const { signals, counts } = await getAllSignalsWithContext();

  return (
    <DashboardShell
      activeNav="signals"
      title="Signals"
      subtitle={`${counts.active} active signals across ${counts.macroThesis + counts.assetThesis} thesis and ${counts.strategy} strategy signals`}
    >
      <SignalsBrowser signals={signals} counts={counts} />
    </DashboardShell>
  );
}
