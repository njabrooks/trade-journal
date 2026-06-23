# Trade Journal v2 — Claim-Suggestion Subsystem Cutover (handoff to the notes-pipeline session)

**Date:** 2026-06-23
**Status:** task brief — **blocked on a live-pipeline change owned by the notes/operational session.**
**Why this doc exists:** While closing the V2 build tail, we went to prune the "claim-suggestion" subsystem (CLAUDE.md lists it under *"Deferred to W8 … until its replacement exists"*). It turned out **not to be dead code** — it is still actively written by the **live Tana ingest cron** and the **`/finalize-for-upload` skill**, and read by the Claims Browser UI. Removing it is therefore **not cleanup — it is completing the relate-research cutover**, which means editing the live 15-min cron. That is operational/notes-pipeline work, so it is handed to that session.

---

## TL;DR

There are **two parallel claim→thesis linking paths** in production right now:

| | OLD path (curation queue) | NEW path (anticipatory, auto) |
|---|---|---|
| Generator | `tana-content-ingest.py` cron + `/finalize-for-upload` skill score promoted claims vs theses (LLM), write **pending** rows | `/maintenance` (scheduled 2×/day) → `relate-research` judges claims vs the active thesis catalog |
| Store | `research_hierarchy_recommendations` (status=`pending`) | `claim_thesis_mappings` (`mapped_by='relate_research'`) directly, **or** a `decision_required` journal entry |
| Human step | User reviews **"AI Suggested Linkages → accept/reject"** in Claims Browser | **None** — clear matches auto-link silently; only genuine ambiguity/refutes surface as a Decision |
| Philosophy | Review queue / curation UI | "System curates, you only touch genuine decisions" |

The NEW path is the v2 design (docs/v2/10 loose-agent model; relate-research is its D2 component). The OLD path is exactly the **curation UI the v2 principle says to kill** — but its cutover was never finished, so both run today. **This task = finish the cutover, then delete the OLD path.**

---

## Exact touchpoints (so a fresh session can act cold)

### OLD path — to be retired
**notes repo:**
- `notes/scripts/tana-content-ingest.py` — `generate_thesis_linkage_suggestions()` (≈L2253), called in the main flow (≈L2631); pipes JSON to the script below.
- `notes/.claude/skills/{process-inbox,intake,tana-process-inbox}/SKILL.md` + `components/generate-linkage.md` — reference the suggestion step (mostly legacy skill docs; verify which are still invoked).

**trade-journal repo:**
- `scripts/ops/insert-claim-suggestions.ts` — stdin JSON → bulk-insert `research_hierarchy_recommendations`.
- `scripts/backfill-claim-suggestions.ts` — one-off backfill into the same table.
- `.claude/skills/finalize-for-upload/SKILL.md` — **step 5c** generates + inserts suggestions ("appear in the Claims Browser UI for user review").
- API: `src/app/api/research/claims/suggestions/route.ts` (GET), `…/suggestions/[id]/accept/route.ts` (writes the real `claim_thesis_mapping`), `…/suggestions/[id]/reject/route.ts`.
- UI: `src/components/research/InlineClaimSuggestions.tsx`; rendered in `src/app/claims/[id]/page.tsx` (≈L451, "AI Suggested Linkages") and `src/components/research/UnifiedClaimsBrowser.tsx` (≈L758, L1178). `ConvertClaimToEntityDialog.tsx` also fetches `suggestions?claimId=`.
- Queries: `src/db/queries/research.ts` — `getSuggestionsForClaims` + the `suggestions` field merged into `getMainClaimById` / the browser loaders (≈L414, L534, L637); insert/select/update helpers (≈L777–817).
- Table: `research_hierarchy_recommendations` (`src/db/schema.ts` ≈L1230).
- **Fold in:** `research_processing_runs` (schema ≈L1296) + its `research.ts` query helpers (≈L694–729) — same W8-deferred research-processing infra; trace callers and drop together.

### NEW path — the replacement (already on main, live)
- `src/lib/intelligence/relateResearch.ts` (engine) + `scripts/relate-research.ts` (CLI). Reads claims from `research_insights`; Claude judges each vs `getActiveThesisCatalog` (all **active** theses, developing **and** monitoring after the D2 gate drop). Policy: **≥0.7** supports/foundation → auto-link silently; **0.4–0.7 or any refute** → `decision_required` journal entry → dashboard DecisionStrip; **<0.4** dropped. Idempotent (dedup unique indexes on `main_claims(source_insight_id, source_claim_id)` and the `research_routing` snapshot).
- Invoked automatically by `/maintenance` (launchd `com.trade-journal.maintenance`, 08:00 + 20:00 Europe/London).

### KEEP — load-bearing, NOT part of this cutover
`available-entities` · `link-to-entities` · `update-status` routes; `StandardLinkDialog` · `ConvertClaimToEntityDialog` (minus its suggestion fetch) · `ClaimLinkButton` · `LinkButton`. These back **manual** claim linking + claim-status changes on the kept browse pages (`/claims`, `/research`). Do not remove.

---

## Prerequisite to verify FIRST (the one real open question)

The cron's suggestion step scores *promoted* claims; relate-research reads from `research_insights`. **Confirm the input is intact** before deleting the generator:

1. Does `tana-content-ingest.py`, post the 2026-06-22 notes-repo cutover, still land investment claims where relate-research can see them (i.e. `research_insights`, the `/finalize-for-upload` upload target)? The cutover note said it "stops the unconditional `main_claims` dump; relate-research owns promotion+linking" — confirm that's the *current* behavior in the file, not just intent.
2. Confirm the scheduled `/maintenance → relate-research` run actually covers the same claims the cron's suggestion step covered (so removing the step leaves no gap). If relate-research only runs on the `research_insights` handoff and the cron promotes elsewhere, wire that first.

If (1)/(2) hold, the suggestion-gen step is **redundant** with scheduled relate-research and safe to remove.

---

## Cutover steps (ordered)

1. **Verify the prerequisite above.**
2. **notes cron:** remove (or feature-flag off) `generate_thesis_linkage_suggestions()` and its call site in `tana-content-ingest.py`. Confirm claims still reach `research_insights`.
3. **`/finalize-for-upload` skill:** delete step 5c (suggestion generation); if a manual relate pass is wanted post-upload, point it at `relate-research` instead.
4. **trade-journal dead-infra removal** (this part can be done here in the build session once 2–3 land — ping back):
   - Delete `InlineClaimSuggestions.tsx`; remove the "AI Suggested Linkages" blocks in `claims/[id]/page.tsx` + `UnifiedClaimsBrowser.tsx`; drop the `suggestions` fetch in `ConvertClaimToEntityDialog.tsx` (keep its manual-link path).
   - Delete the `suggestions` GET + `accept` + `reject` routes.
   - Remove `getSuggestionsForClaims` + the `suggestions` field from the `research.ts` loaders.
   - Delete `insert-claim-suggestions.ts` + `backfill-claim-suggestions.ts`.
   - Migration: drop `research_hierarchy_recommendations` (+ `research_processing_runs` once its query callers are confirmed dead). Update `schema.ts` first, write `migrations/`, run via psql, verify.
5. **Verify:** `npm run build` exit 0 → restart the persistent dev server (`launchctl kickstart -k gui/$UID/com.tradej`); load `/claims`, `/claims/[id]`, `/research` and confirm manual linking + status changes still work and the AI-suggestions section is gone.

## Rollback
The OLD path is additive (it only writes `pending` rows + renders a section). If anything regresses, restore the cron step + skill 5c and the table; no data migration is destructive until step 4's table drop (dump `research_hierarchy_recommendations` to `archive/db-dumps/` before dropping, per prune convention).

## Coordination
- **notes/operational session owns** steps 1–3 (live cron + skill).
- **build session can own** step 4 (trade-journal dead-infra removal) once the cron stops writing — hand back when ready.
- Governing principle (docs/v2 / CLAUDE.md): the system curates; the user only touches genuine decisions. This cutover removes the last claim-linking *review queue*.

---

## OUTCOME — executed 2026-06-23 (full cutover, both repos)

**The review queue is gone; the W8-deferred tables stay (correctly).**

**Done:**
- **Notes cron** (`tana-content-ingest.py`): removed `generate_linkage` (call site + def); repointed the `route_signals` docstring to relate-research. `linkage_count` left initialized to 0 (harmless — audit log now always reports 0). Valid syntax confirmed.
- **`/finalize-for-upload`**: step 5c (suggestion generation → `insert-claim-suggestions.ts`) replaced with a `/relate-research` pointer; the 4 downstream references cleaned.
- **Notes skill docs**: `components/generate-linkage.md` deleted; references scrubbed + repointed to `/relate-research` in `tana-promote`, `tana-process-inbox`, `process-inbox`, `intake`.
- **Trade-journal read-side deleted**: `InlineClaimSuggestions.tsx`, the 3 `claims/suggestions` API routes, `getSuggestionsForClaims` + the `suggestions` field/merges in `research.ts`, and the 2 scripts. UI usages removed from `claims/[id]/page.tsx`, `UnifiedClaimsBrowser.tsx`, `ConvertClaimToEntityDialog.tsx` (manual-link path kept), `ArtifactClaimsBrowser.tsx`. Dead-symbol grep = 0.

**DEVIATION from step 4 (deliberate, CLAUDE.md-compliant): the tables were NOT dropped.**
Verification found `research_hierarchy_recommendations` + `research_processing_runs` are still referenced by **W8-deferred infra CLAUDE.md says not to prune**: `src/lib/services/claim-thesis-suggestions.ts` (dormant — **no live caller**) writes both via `createResearchHierarchyRecommendation` + the processing-run helpers. The only *active* reader was `checkArtifactCompleteness` (via `upload-audit.ts`) — its obsolete linkage check (#4) was **removed** (claim linking is no longer an upload-completeness criterion; left in, it would have spuriously flagged every post-cutover artifact "deficient" and triggered needless re-uploads). Net: tables + schema defs + the dormant write helpers **retained for W8**; the active suggestion pathway is fully severed. When W8 removes `claim-thesis-suggestions.ts`, the tables become truly dead and can be dropped.

**Verification:** build **compiled** clean (cutover code type-checks — failure was at prerender, post-compile); `/claims`, `/claims/[id]`, `/research` smoke **HTTP 200** on the dev server with manual linking intact. ⚠️ The full `npm run build` is currently **red on a pre-existing, unrelated bug**: `/strategies` prerender fails with PG error 42601 ("syntax error at or near ','") — the generated SQL has `strategy_id in (, , …, $1…$224)` with ~49 empty entries (`src/db/queries/strategies.ts:104` → `inArray(positions.strategyId, strategyIds)`), untouched by this cutover. Flagged for separate fix.
