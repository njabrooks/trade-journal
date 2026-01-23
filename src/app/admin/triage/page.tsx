"use client";

import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";

interface TriageRule {
  id: string;
  ruleSet: string;
  dteThreshold: number;
  assignmentDteThreshold: number;
  sizeAttentionThreshold: number;
  sizeUrgentThreshold: number;
  complexityThreshold: number;
}

const DEFAULT_RULES: TriageRule = {
  id: "default",
  ruleSet: "options_v1",
  dteThreshold: 30,
  assignmentDteThreshold: 10,
  sizeAttentionThreshold: 0.15,
  sizeUrgentThreshold: 0.25,
  complexityThreshold: 10,
};

export default function AdminTriagePage() {
  const [rules, setRules] = useState<TriageRule>(DEFAULT_RULES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      // For now, we'll use the default rules from the code
      // In the future, we can fetch from a database table
      setRules(DEFAULT_RULES);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/triage-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save rules");
      }

      setSuccess("Triage rules saved successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rules");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardShell activeNav="admin-triage" title="Admin: Triage Rules" subtitle="Loading...">
        <div className="text-center text-muted-foreground">Loading rules...</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell activeNav="admin-triage" title="Admin: Triage Rules" subtitle="Configure triage thresholds and triggers">
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            {success}
          </div>
        )}

        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Position-Level Rules</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="dteThreshold" className="block text-sm font-medium text-foreground">
                DTE Threshold (days)
              </label>
              <p className="mb-1 text-xs text-muted-foreground">
                Create triage records for options with DTE less than or equal to this value
              </p>
              <input
                type="number"
                id="dteThreshold"
                min="0"
                max="365"
                value={rules.dteThreshold}
                onChange={(e) =>
                  setRules({ ...rules, dteThreshold: parseInt(e.target.value) || 0 })
                }
                className="w-full rounded-md border border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="assignmentDteThreshold"
                className="block text-sm font-medium text-foreground"
              >
                Assignment Risk DTE Threshold (days)
              </label>
              <p className="mb-1 text-xs text-muted-foreground">
                Flag assignment risk for short ITM options with DTE less than or equal to this value
              </p>
              <input
                type="number"
                id="assignmentDteThreshold"
                min="0"
                max="30"
                value={rules.assignmentDteThreshold}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    assignmentDteThreshold: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full rounded-md border border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Strategy-Level Rules</h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="sizeAttentionThreshold"
                className="block text-sm font-medium text-foreground"
              >
                Size Attention Threshold (% of NAV)
              </label>
              <p className="mb-1 text-xs text-muted-foreground">
                Flag strategies with exposure greater than or equal to this percentage of NAV as "attention"
              </p>
              <input
                type="number"
                id="sizeAttentionThreshold"
                min="0"
                max="1"
                step="0.01"
                value={rules.sizeAttentionThreshold}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    sizeAttentionThreshold: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full rounded-md border border px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Current: {(rules.sizeAttentionThreshold * 100).toFixed(1)}%
              </p>
            </div>

            <div>
              <label
                htmlFor="sizeUrgentThreshold"
                className="block text-sm font-medium text-foreground"
              >
                Size Urgent Threshold (% of NAV)
              </label>
              <p className="mb-1 text-xs text-muted-foreground">
                Flag strategies with exposure greater than or equal to this percentage of NAV as "urgent"
              </p>
              <input
                type="number"
                id="sizeUrgentThreshold"
                min="0"
                max="1"
                step="0.01"
                value={rules.sizeUrgentThreshold}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    sizeUrgentThreshold: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full rounded-md border border px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Current: {(rules.sizeUrgentThreshold * 100).toFixed(1)}%
              </p>
            </div>

            <div>
              <label
                htmlFor="complexityThreshold"
                className="block text-sm font-medium text-foreground"
              >
                Complexity Threshold (number of positions)
              </label>
              <p className="mb-1 text-xs text-muted-foreground">
                Flag strategies with more than this number of open positions as "info" for complexity review
              </p>
              <input
                type="number"
                id="complexityThreshold"
                min="1"
                max="100"
                value={rules.complexityThreshold}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    complexityThreshold: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full rounded-md border border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <button
            onClick={loadRules}
            disabled={saving}
            className="rounded-md border border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Rules"}
          </button>
        </div>

        <section className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Note:</p>
          <p className="mt-1">
            Changes to these rules will take effect the next time triage is recomputed. Use the "Recompute Triage" button on the Triage page to apply new rules.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}

