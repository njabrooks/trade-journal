"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RecomputeTriageButtonProps {
  accountId: string;
  snapshotDate?: string | null;
}

export function RecomputeTriageButton({ accountId, snapshotDate }: RecomputeTriageButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const runRecompute = async () => {
    if (status === "running") return;
    setStatus("running");
    setMessage(null);

    const fallbackDate = new Date().toISOString().slice(0, 10);

    const body = snapshotDate
      ? { accountId, snapshotDate }
      : { accountId, startDate: fallbackDate, endDate: fallbackDate };

    try {
      const response = await fetch("/api/recompute/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to recompute triage");
      }

      const data = await response.json();
      setStatus("success");
      setMessage(data.message || "Recompute complete");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setTimeout(() => {
        setStatus("idle");
        setMessage(null);
      }, 3500);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={runRecompute}
        disabled={status === "running"}
        className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "running" ? "Recomputing…" : "Recompute latest triage"}
      </button>
      {message ? (
        <span
          className={`text-[11px] ${
            status === "error" ? "text-rose-600" : "text-slate-400"
          }`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}

