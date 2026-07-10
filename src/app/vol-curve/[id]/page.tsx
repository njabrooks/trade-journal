import { DashboardShell } from "@/components/layout/DashboardShell";
import { db } from "@/db";
import { volCurveReports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ReportDetailClient } from "./ReportDetailClient";

export default async function VolCurveReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [report] = await db
    .select()
    .from(volCurveReports)
    .where(eq(volCurveReports.id, id));

  if (!report) notFound();

  const data = report.reportData as any;

  return (
    <DashboardShell
      title={`${report.ticker} Vol Curve`}
      subtitle={`${report.direction} — $${parseFloat(String(report.targetBase)).toFixed(0)} / $${parseFloat(String(report.targetHigh)).toFixed(0)} — ${new Date(report.createdAt).toLocaleDateString()}`}
      activeNav="advisor"
    >
      <ReportDetailClient data={data} />
    </DashboardShell>
  );
}
