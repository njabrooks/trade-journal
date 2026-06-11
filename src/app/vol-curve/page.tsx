import { Suspense } from "react";
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
      subtitle="Find optimal strike selection for directional option structures"
      activeNav="vol-curve"
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
