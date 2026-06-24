/**
 * Shared signal classification (docs/v2/15 §4.3). Pure — no DB.
 *
 * A signal is "collector-tracked" when it has a quantitative sensor attached
 * (`explicit_details`) or is declared `data_driven`. Two consumers rely on this
 * single derivation:
 *   1. thesis-observe — deterministically DEFERS collector-tracked signals to
 *      collect-signal-data ("neutral per data-driven rules", docs/v2/14 §3.3)
 *      instead of inferring quant-vs-qual from the statement text.
 *   2. signal-quality diagnostics — EXCLUDES them from chronic-neutral (their
 *      statement is measured by the sensor, not by observe's qualitative score;
 *      docs/v2/15 §4.3). Sensor "chronic-flat" triage is a separate P3 concern.
 */
export function isCollectorTracked(s: {
  explicitDetails?: unknown;
  category?: string | null;
}): boolean {
  return s.explicitDetails != null || s.category === 'data_driven';
}
