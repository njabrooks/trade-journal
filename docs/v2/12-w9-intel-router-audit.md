# Trade Journal v2 — W9: Intel Router Quality Audit

**Date:** 2026-06-23
**Status:** audit complete — **verdict: SPLIT (keep ingestion+display, kill the routing engine).** Execution of the kill is gated on explicit GO (it stops a live cron + removes the engine).
**Scope:** the intel *router* (`src/lib/intelligence/evaluate.ts` + `scripts/evaluate-intel-items.ts`), per spec W9. The World Monitor `thesis_monitor` snapshot path (`ingest-world-monitor.ts → generateQualitativeSnapshots`) is a separate stream and out of scope here.

---

## What the subsystem is — two fully separable halves

| Half | Path | Consumed? |
|---|---|---|
| **(A) Ingestion + display** | `ingest-world-monitor.ts → emitIntelItems.ts → intel_items` table; `getIntelItemsForThesis()` (ticker match) renders "recent intel" on both thesis overview pages (`limit 20`) | **YES** — live on every thesis page; independent of routing |
| **(B) Routing engine** | `evaluate-intel-items.ts` (cron every 4h) → `evaluate.ts` scores each pending item vs the belief hierarchy → `signal_data_snapshots` (`data_source='intelligence_routing'`) + `claim_candidate` journal entries | **Effectively no** (see evidence) |

Half (A) does **not** depend on half (B): the thesis-page query matches `intel_items.tickers` directly and never reads `processing_result` or the signal snapshots.

---

## Evidence (3 months: 2026-03-23 → 06-22)

**Throughput:** 7,311 items processed, 1,562 skipped, 14 pending.

**Routing outcomes (of 7,311 processed):**
| processing_result | n | % |
|---|---|---|
| signal_evidence | 3,936 | 54% |
| contextual (label only, no write) | 2,731 | 37% |
| claim_candidate | 417 | 6% |
| null | 227 | 3% |

**The signal-evidence output is noise:**
- **36,795** `intelligence_routing` snapshots written (≈82% of the entire 45K `signal_data_snapshots` table).
- **85% are `neutral`** (31,411) — no directional information. Only 2,686 strengthening / 2,698 weakening.
- The direction heuristic (`assessFromHeuristic`) assigns strengthening/weakening **by the signal's *type*, not by what the news says** — a "confirmation" signal always yields "strengthening" on any keyword match. So even the non-neutral 15% are directionally unreliable.
- **84% sit `pending` forever** (30,957). The 16% "accepted" are **blanket auto-accepted** by `synthesize-signal-day.ts`'s daily pre-pass (`status pending→accepted` for the day, no review) — "accepted" carries zero quality signal.

**The claim-candidate output is dead:**
- 417 items labeled `claim_candidate`, but **0** `claim_candidate_identified` journal entries exist (`source='automation'` shows only the old pre-prune `triage_*` types, frozen ~2026-06-11). The path produces nothing discoverable.

**The scoring basis is rotting:**
- `scoreContentAgainstSignal` leans on `extractMonitorKeywords(signal.explicit_details)`. But the loose-agent model (docs/v2/10) auto-derives qualitative signals with **`explicit_details=NULL`** — currently **38 of 57 active signals (67%)** have no keywords at all. The keyword path returns `[]` for two-thirds of signals and degrades further with every new underwriting. The engine was built for the retired v1 metric-signal model.

---

## Verdict

### KEEP — (A) intel ingestion + thesis-page news
`ingest-world-monitor.ts → emitIntelItems → intel_items` and `getIntelItemsForThesis`. It's consumed, low-cost, and the "recent intel for this ticker" panel is genuinely useful glanceable context. No change.

### KILL — (B) the `evaluate.ts` routing engine
It produces ~1,200 mostly-neutral, unreviewed, directionally-unreliable snapshots a month on a rotting scoring basis, its claim-candidate path emits nothing, and it is **redundant with relate-research** — which already routes research evidence to signals (`data_source='research_routing'`) with real Claude judgment, and which the loose-agent **agent thesis-health pass** consumes. The crude heuristic ancestor adds noise, not coverage.

This is consistent with the v2 governing principle (no unreviewed queues) and the prune philosophy.

---

## Kill scope (on GO)

1. **Stop the cron:** delete `.github/workflows/evaluate-intel-items.yml`.
2. **Remove the runner + engine:** `scripts/evaluate-intel-items.ts`; the routing functions in `src/lib/intelligence/evaluate.ts` (`evaluateIntelItem`, `evaluatePendingIntelItems`, `assessFromHeuristic`, `buildEvidenceSummary`).
3. **Keep (shared):** `resolver.ts` (used by relate-research), `scoring.ts` (used by `ingest-world-monitor` + assess-validation-evidence/process-inbox skills), `emitIntelItems.ts`, `parseWorldMonitor.ts`, the `intel_items` table, `getIntelItemsForThesis`.
4. **`synthesize-signal-day.ts` stays** — it's source-agnostic; after the kill it still synthesizes `thesis_monitor` (World Monitor) + `research_routing` (relate-research) snapshots. It just stops receiving intel-routing input.
5. **Snapshot disposition (separate, recommended):** stop-generating is immediate via (1)/(2). The 36,795 historical `intelligence_routing` rows can be left in place, or — since they're 82% of the table and pure past noise — dumped to `archive/db-dumps/` and deleted in a follow-up migration (prune convention). Low risk: they're past-dated and already synthesized.
6. **`intel_items.processing_status`/`processing_result` columns** become vestigial (nothing routes), but harmless — leave until a natural schema-migration moment (non-goal §8: no premature legacy-field removal).

## What stays coherent after the kill
Evidence→signal routing is owned by **relate-research** (Claude-judged, `research_routing`) and the **World Monitor** path (`thesis_monitor`); thesis news context is owned by the **intel_items display**. The heuristic middle layer is removed. Net: less noise, one fewer rotting v1 mechanism, no loss of consumed function.
