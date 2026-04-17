"use client";

import { AnalysisResultsView, type AnalysisData } from "../VolCurveClient";

export function ReportDetailClient({ data }: { data: AnalysisData }) {
  return <AnalysisResultsView data={data} />;
}
