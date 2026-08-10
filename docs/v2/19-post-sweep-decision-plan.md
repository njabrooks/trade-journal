# docs/v2/19 — Post-Sweep Decision Plan (one-by-one, for the session after 2026-06-25)

> ## UPDATE 2026-06-29 — Phases A & B EXECUTED (queue 260 → 5)
> All 258 claim-level decisions resolved: **77 refutes** (58 folded into re-underwrites, 19 acknowledged) + **181 supporting links** (147 bulk-confirmed in Phase B + 34 closed inside the re-underwrites). Remaining active = **5** pre-existing non-A/B types (4 `develop_thin_thesis`, 1 `classify_macro_link`).
>
> ### Outcome decisions — RESOLVED 2026-06-29 (owner calls applied)
> All 10 worked. Net belief changes: **Oil & Inflation restored to MEDIUM** (owner: Iran war over, Hormuz shock transitory — captured as supporting observations + re-underwritten v4/v5); **ETH FLIPPED bullish→bearish** (direction+title+14 mappings inverted, re-underwritten v3 medium — the 2026-06-23 "direction review flagged" annotation is now resolved); **SPACEX** held medium with a NEW unlock/dilution-overhang invalidation (v4, low near-term/medium long-term); **USD** bearish stands (bifurcation reframe declined); **China** dormant/low, **TAO** low, **BTC** medium (de-correlation deemed cyclical), **GLD** long-term bullish/medium (CB force-selling deemed short-term), **AI Hyperscalers** unchanged but expression to be re-scoped toward AI beneficiaries. Decision queue 260→5 (residual = 4 develop_thin_thesis + 1 classify_macro_link, pre-existing).
>
> _Historical (pre-decision) snapshot of the surfaced flags follows:_
>
> **10 theses re-underwritten** (new articulation versions, verified 1:1, no status/direction changed — `build-core-argument` auto-synced confidence only). The genuine OUTCOME decisions these surfaced are below — **these are the live to-dos; work them via `/thesis <X>`:**
>
> **Downgraded to LOW (conviction impaired):**
> - **Bearish Oil (CL)** v3 — kill condition (Hormuz) may be live, near-term direction *up*: downgrade/pause/flip-to-neutral or reframe "right thesis, wrong timing." Decisive observable = actual Hormuz status.
> - **Bearish Inflation** v4 — same Hormuz binary; fades→re-validates, entrenches→reconsider/close.
> - **Bearish USD (Reserve)** v3 — reframe to "geopolitical bifurcation"/neutral, or hold bearish-low pending decomposed (ex-China/Russia) COFER.
> - **Bullish Chinese Equities** v2 — structural bear now first-order; live KWEB expression realized **−$18.3K & flat** → keep-dormant-low / re-express-smaller / reconsider direction.
> - **Bullish TAO** v2 — premise undercut, near-term mechanics against holders → stay-low vs trim/exit.
>
> **Held at MEDIUM, key assumption under live attack:**
> - **Bullish BTC** v4 — decorrelation assumption actively contradicted (84% SPY / 87% gold); if high-beta is structural → low/trim.
> - **Bullish ETH** v2 — bull case hinges on unproven post-Fusaka value accrual (H1 2026); hold vs neutral/close; set entry/target to size the $1,300 downside.
> - **Bullish GLD** v3 — watch EM CB forced-selling spreading Turkey→China/India (would flip to tactical short).
> - **Bullish AI Hyperscalers** v4 — demand HIGH, equity-return leg weak; re-scope expression to AI *beneficiaries* vs *buyers*, or leave.
> - **Bullish SPACEX** v3 — refutes hit entry price not business; express at lower post-IPO entry; optionally → low.
>
> **Synthesis:** Oil + Inflation + (partly) USD-reserve collapse to ONE question — how the June-2026 Iran/Hormuz energy shock resolves. Resolve the Hormuz read first; all three move together.
>
> **Data-quality follow-ups (not acted on):** Bearish-Inflation refuting claims `c50cdc9a` & `83170d15` are title-only stubs (empty body) — backfill; Chinese Equities is `developing` despite a closed KWEB expression (status mismatch — cascade should mark `closed`); several swept refuting claims sit at `draft`; GLD has ~43 ticker-tagged macro claims still unlinked (belong on macro theses — `/relate-research` triage).
>
> ### Phase C — DONE 2026-06-29
> Macro-emergence detector first real run: only 5 unframed assets (AAPL/DOGE/GRPN/HLIT/TAO), all idiosyncratic singletons — **no structural emergent cluster** (confirms the detector can't see Tana-drop clusters; correct). Owner picked 2 of the 7 candidate clusters to develop as NEW macros:
> - **Stablecoin & Payment Rails** (`5c88ee43-71f1-4b9b-87c7-fca6ca6b3d5a`) — draft/secular/bullish/medium, v1, 42 claims (39+/3−). Distinct from Tokenisation (money rails vs RWA).
> - **AI Terminal-Value Collapse** (`5e96082e-adfd-4eac-b2b8-38be3fd93ca3`) — draft/structural/bearish/low, v1, 8 claims (5+/3−). Tail repricing risk.
>
> Fold-ins (18 claims → existing macros): National Resilience +6 (defense), Deglobalization +1/−2 (rare-earths), Semiconductors +6/−1 (adv packaging), Perpetual Futures & Dexes +2 (the only prediction-market claims with a genuine home; rest left unlinked). EM funding-stress deferred. The 3 fold-in refutes will raise `re_underwrite_due` on those macros next maintenance cycle. Both new macros are draft (promote to monitoring only when expressed via a linked asset-thesis→strategy).
>
> **All of plan 19 (Phases A, B, C) is now complete.** Residual queue = 5 pre-existing (4 develop_thin_thesis + 1 classify_macro_link).
>
> ### Data-quality cleanup — DONE 2026-06-29
> - **Stub claims** (`c50cdc9a`, `83170d15`): empty `claim` body backfilled from their (self-contained) titles. The defect originated at extraction — source insight `988d9a8a` also had empty claim/reasoning, so nothing richer to recover.
> - **China status mismatch**: macro "Bullish Chinese Equities" `developing → closed` (sole expression, the KWEB asset thesis, is closed/flat). Dormant-but-intact at low conviction; re-expresses to monitoring automatically if a China position re-opens.
> - **578 draft-but-linked claims**: investigated, **left as-is — benign**. Claim status is functionally cosmetic for the belief layer (nothing in build-core-argument / insert-thesis-articulation / db-queries filters `main_claims` by status), so linked draft claims are already used in articulations. Bulk `draft→active` is a safe one-liner if cosmetic consistency is ever wanted, but has no functional effect.
> - **ETH/GLD unlinked backlogs** (~36 ETH, ~43 GLD): coverage gaps, NOT data-quality — owned by the ongoing `/maintenance` relate loop (ETH just flipped bearish, so a relate pass would now home the ETH-bear claims). Left for maintenance.

---


**Context.** The claims backlog sweep (2026-06-25) related all 117 pre-cutover orphaned insights
to the active thesis set via `/relate-research`. It applied ~271 new claim→thesis links and left
**260 claim-level decisions active** (by design — sweep first, decide later). This doc is the
ordered runbook to work them down one thesis at a time, plus the first new-macro-thesis development.

---

## 0. How the consolidation actually works (answering "does the raiser reduce the count?")

The 260 pending decisions are **claim-level** packets, two types:
- `confirm_claim_link` — 181 (sub-0.7 *supporting* links the engine auto-made but wants a yes/no on)
- `review_refuting_claim` — 77 (evidence *against* a live thesis — the high-value ones)
- (+ 1 `develop_thin_thesis`, 1 `classify_macro_link` — pre-existing)

`scripts/ops/raise-reunderwrite-decisions.ts` is a **separate channel** (`re_underwrite_due`), one
packet per thesis, merging the claim-delta + signal-quality triggers. Its *intent* is consolidation.
**But running it now is effectively a no-op:** its dedup (`raiseOrBump`) keys on the **object**
(any active `decision_required` on the thesis), not the decision-type — so because the sweep already
put claim packets on every due thesis, it finds an active decision and **bumps** instead of inserting
(dry-run 2026-06-25: 28 due, **0 inserted, 28 bumped**). It adds nothing to the queue.

**Therefore: skip the raiser. The real consolidation is the workflow** — open `/thesis <X>` once per
thesis; the re-underwrite reads *all* that thesis's accumulated claims (incl. the new refutes) in one
pass and writes a fresh articulation + derived signals. Then resolve/dismiss that thesis's claim
packets as a group. You make ~25 meaningful thesis-level judgments, not 260 micro-decisions. The
per-thesis grouping you need is already in the claim packets themselves (query below).

> Worklist query (regenerate the live list before starting):
> ```sql
> SELECT object_title, object_type,
>   count(*) FILTER (WHERE metadata->'decision'->>'decision_type'='review_refuting_claim') AS refuting,
>   count(*) FILTER (WHERE metadata->'decision'->>'decision_type'='confirm_claim_link') AS confirm_link,
>   count(*) AS total
> FROM journal_entries
> WHERE action_type='decision_required' AND status='active'
>   AND metadata->'decision'->>'decision_type' IN ('review_refuting_claim','confirm_claim_link')
> GROUP BY 1,2 ORDER BY refuting DESC, total DESC;
> ```

---

## 1. Phase A — re-underwrite the refuting-heavy theses (do these first, one per `/thesis`)

These carry genuine counter-evidence and deserve a real re-underwrite. Order = most refutes first.
For each: `/thesis <name>` → read the case + the refuting packets → re-underwrite (or dismiss the
refutes as non-material) → group-resolve that thesis's `review_refuting_claim` + `confirm_claim_link`
packets.

| # | Thesis | refuting | confirm | Note |
|---|--------|---------:|--------:|------|
| 1 | Bearish Oil (CL) Medium Term | 19 | 1 | Heaviest. Hormuz/physical-deficit cluster argues oil structurally *underpriced* — directly challenges the bear. Likely a real re-underwrite or direction review. |
| 2 | Bullish ETH Medium Term | 9 | 0 | Value-accrual / L2-drain / overvaluation cluster. |
| 3 | Bullish BTC Long Term | 8 | 10 | Correlation-to-SPX/gold, institutional-adoption-antithetical refutes vs adoption supports. |
| 4 | Bullish GLD Medium Term | 5 | 8 | "Gold is a bubble" + CB-forced-sellers vs debasement-bid. |
| 5 | Bullish Semiconductors | 5 | 5 | NVDA-short / momentum-exhaustion vs packaging/supply supports. |
| 6 | Bearish US Dollar as a Reserve Asset | 4 | 3 | Dollar-share-rising / energy-independence refutes. |
| 7 | Bullish AI Hyperscalers | 4 | 1 | Capex-losers / multiple-compression. |
| 8 | Bearish Inflation | 3 | 0 | Hormuz/energy-shock re-acceleration. |
| 9 | Bullish HYPE Medium Term | 2 | 8 | Binance-leads-price-discovery / FDV refutes vs PMF supports. |
| 10 | Bullish Chinese Equities | 2 | 0 | Property/banking insolvency, trilemma. |
| 11 | Bullish SPACEX Medium Term | 2 | 0 | TAM-inflated / IPO-demand-shortfall. |
| 12 | Bullish Silver (SLV) | 2 | 2 | Capitulation-safe-haven-fails. |
| 13 | Bullish TAO Medium Term | 2 | 1 | |
| 14 | misc 1-refute theses | 1 each | — | SOL, Privacy-chains, SaaS, Private Credit, AI Model Layer, Bearish Equities&RE, TSLA, VVV — quick reads; dismiss or fold. |

## 2. Phase B — bulk-confirm the supporting-link theses (lighter; can batch)

No refutes, only `confirm_claim_link`. These are supporting evidence the engine wants ratified —
mostly accept-all unless a link looks wrong. Can be done via `/decisions` in a sweep rather than
full re-underwrites.

Energy Sector (21) · Commodities (15) · AI Infrastructure (12) · Tokenisation (11) · Deglobalization
(7) · Agricultural Commodities ST (6) · Volatility (5) · Wheat ZW (5) · National Resilience (5) ·
Robotics (4) · Perpetual Futures & Dexes (4) · then a long tail of 1–3-link theses (Monetary
Debasement, AI Agents, ASML, GDX, Space Exploration, COIN, MRVL, ZEC, NG, IWM, HLIT, Corn, BTU,
US Healthcare, Latin American Equities, Long-Term Rates, Bearish Wages, Bearish UK, Bearish ORCL, …).

> Tip: after each Phase-A re-underwrite, that thesis's confirm_link packets can be resolved in the
> same pass — so Phase B shrinks as you go.

---

## 3. Phase C — new macro thesis development (the 7 emergent clusters)

These surfaced as **dropped-claim clusters** during the sweep (claims left unlinked in Tana, no active
home). This is the first new-macro-thesis development since the macro-emergence feature (docs/v2/13)
landed. **Important mechanism caveat:**

- The macro-emergence detector (`src/lib/derived/macroEmergence.ts`, surfaced by **`/thesis-review`
  macro-emergence mode**) is **structure-driven only**: it clusters *active asset theses that have no
  macro link* — NOT loose Tana drops. Research-driven emergence is explicitly deferred (relate-research
  drops aren't DB-persisted). So **it will not auto-surface these 7** — most have no asset thesis yet.
- **First, run `/thesis-review` macro-emergence mode anyway** — it's the genuine first exercise of the
  feature and may already propose a `cluster_claims_to_thesis` packet from the *current* unframed
  asset-thesis pool (e.g. an advanced-packaging cluster if ASML/MRVL/ENTG read as unframed).
- For clusters with **no tradeable underlying / no asset thesis**, develop manually:
  `scripts/ops/create-macro-thesis.ts` (draft) → optionally run the governed zero-write research-pipeline CLI → create/link only through separately authorized recorders
  claims → `/build-core-argument`. The dropped-claim evidence lives in Tana; pull it back via
  `/relate-research` *after* the thesis exists (it links to any active thesis).

| Cluster | Tradeable expression? | Suggested path |
|---------|----------------------|----------------|
| Prediction markets (Polymarket/Kalshi) | Thin/none public | Manual macro draft; watch for an equity proxy |
| Stablecoin / payment-rails (Circle/Tether/Stripe/Visa) | COIN/HOOD partial | Manual macro draft; frame COIN/HOOD under it |
| Advanced-packaging / OSAT (Amkor/Ibiden/Besi/Advantest) | ASML/MRVL/ENTG exist | **Best macro-emergence candidate** — try the detector first |
| Defense / military-industrial (LMT/RTX/NOC) | Yes (no asset theses yet) | Create asset theses → let framing/emergence connect, or manual macro |
| AI terminal-value-collapse (2–7x FCF) | Expressed via shorts/Bearish AI | Manual macro draft; currently scatters onto Bearish Equities + AI Infra |
| EM funding-stress / dollar-funding | EM bond/EM equity proxies | Manual macro draft |
| Rare-earths / critical minerals | MP/REMX etc. | Manual macro draft or asset theses under Deglobalization |

> Decide per cluster whether it's worth a thesis at all before creating — don't manufacture beliefs.
> Each new macro starts `draft`; it only goes `monitoring` when actually expressed (a live strategy),
> per the expression-driven cascade.

---

## 4. Order of operations tomorrow
1. Regenerate the worklist query (§0) — counts will have shifted if maintenance ran overnight.
2. Phase A, top-down (Bearish Oil first). One `/thesis <X>` per row; group-resolve its packets.
3. Phase B sweep via `/decisions` for the supporting-only theses.
4. `/thesis-review` macro-emergence mode (first real run), then Phase C manual creation per cluster.
5. **Do NOT run `raise-reunderwrite-decisions.ts`** — it's a no-op while claim packets are active (§0).
