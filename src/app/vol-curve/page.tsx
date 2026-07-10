import { Suspense } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { VolCurveClient } from "./VolCurveClient";
import { ScannerTodayClient } from "./ScannerTodayClient";

export default function VolCurvePage() {
  return (
    <DashboardShell
      title="Vol Curve Analyzer"
      subtitle={
        <>
          The advisor&apos;s vol-context sensor + per-name strike deep-dive — recommendations live
          on the{" "}
          <Link href="/advisor" className="underline hover:text-foreground">
            Options Advisor
          </Link>{" "}
          page
        </>
      }
      activeNav="advisor"
    >
      <Tabs defaultValue="scanner" className="w-full">
        <TabsList>
          <TabsTrigger value="scanner">Scanner Today</TabsTrigger>
          <TabsTrigger value="form">Run Analysis</TabsTrigger>
        </TabsList>
        <TabsContent value="scanner" className="mt-4">
          <Suspense>
            <ScannerTodayClient />
          </Suspense>
        </TabsContent>
        <TabsContent value="form" className="mt-4">
          <VolCurveClient />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
