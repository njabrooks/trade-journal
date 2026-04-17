import { DashboardShell } from "@/components/layout/DashboardShell";
import { VolCurveClient } from "./VolCurveClient";

export default function VolCurvePage() {
  return (
    <DashboardShell
      title="Vol Curve Analyzer"
      subtitle="Find optimal strike selection for directional option structures"
      activeNav="vol-curve"
    >
      <VolCurveClient />
    </DashboardShell>
  );
}
