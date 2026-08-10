# Visser Scan — AI Macro Nexus on demand

## What this is (and is not)

An external-perspective lens, called manually when the user wants it. VisserLabs
(Jordi Visser / 22V Research) publishes weekend Excel dashboards scoring a
~100-name AI value-chain universe across 6 themes. The user drops the files in
`/Users/home-hub/projects/notes/jordi-visser/`.

Deliberate design constraints — do not violate:

- **Standalone.** No DB writes, no new tables, no launchd/cron, no coupling to
  the advisor/brief/maintenance loops. The source may stop arriving at any
  point; nothing in the trade journal may depend on it.
- **Suggestions only.** Output is analysis + candidate option structures. Never
  auto-create strategies, decisions, or journal entries. If a finding warrants
  persistence, ASK the user, then use the normal ops scripts (e.g.
  `add-journal-note.ts`) — only on explicit confirmation.
- **Labels over scores.** Per Visser's own methodology: the raw 0–100 score is
  pro-cyclical and its checks are correlated. Act on setup LABELS + context
  (exhaustion, 200D status), never the bare number. Nothing here informs
  position SIZING — conviction input only.

## Step 1 — Locate & date the data

```bash
ls -lt /Users/home-hub/projects/notes/jordi-visser/
```

Identify the newest file set (dates are in filenames like `_2026-07-02` or
`-070326`, else use mtime). Expected kinds (names may drift week to week):

| Kind | Filename hint | Key sheets |
|---|---|---|
| Technical dashboard | `AI_Macro_Nexus_Technical` | Signal Sheet (per-name metrics + Score + Setup + Monday Note), Theme Summary, Earnings Calendar, Action List |
| Exhaustion scores | `Exhaustion_Scores` | one sheet: per-name Exh Score, Band, RSI14/RSI5, Will %R, ATR extensions, TD Setup/Countdown |
| Consolidation playbook | `Consolidation_Playbook` | Final_Ranking (Final Score + Bucket + Action), Consolidation_Screen, Benchmarks |
| Methodology docs | `VisserLabs_*.docx` | reference only — the framework is summarized below, don't re-read these every run |

**Staleness gate:** state the as-of date prominently in your output. If the
newest data is >10 days old, lead with a warning that setups have likely moved
and price-level anchors (20D/50D) must be re-checked against live prices before
acting. If the folder is empty or has no xlsx files, say so and stop — do not
improvise from memory.

## Step 2 — Extract

Use the bundled stdlib-only extractor (no openpyxl/pandoc needed):

```bash
python3 /Users/home-hub/projects/trade-journal/.claude/skills/visser-scan/scripts/extract_office.py <file.xlsx> > <scratchpad>/<name>.tsv
```

Extract the xlsx files into the session scratchpad, then Read the TSVs. The
Signal Sheet / Final_Ranking / Exhaustion sheets are the payload; skip
Raw_Data_Log. If a second (older) dated file set exists in the folder, also
extract the prior week's Signal Sheet — label transitions week-over-week on
names we hold are high-value signal.

## Step 3 — Pull book context (read-only)

Run from `/Users/home-hub/projects/trade-journal`:

```bash
# Active theses with tickers (monitoring = live expression, developing = building)
npx tsx scripts/psql-query.ts "SELECT at.title, u.ticker, at.direction, at.status, at.confidence_level FROM asset_theses at JOIN underlyings u ON at.underlying_id = u.id WHERE at.status IN ('developing','monitoring') ORDER BY at.status, u.ticker" --format json

# Open strategies + current market value (equity book)
npx tsx scripts/psql-query.ts "SELECT s.strategy_key, s.status, s.direction, u.ticker, ROUND(SUM(p.market_value_usd)::numeric,0) AS mv_usd FROM strategies s JOIN positions p ON p.strategy_id = s.id AND p.is_open = true JOIN underlyings u ON u.id = p.underlying_id WHERE s.status = 'active' GROUP BY s.strategy_key, s.status, s.direction, u.ticker ORDER BY ABS(SUM(p.market_value_usd)) DESC NULLS LAST" --format json
```

**Ticker mapping traps** (check before claiming an overlap):

- `SOI` in our DB = **Soitec** = Visser's `SOI.PA`. Same company. (NOT Solaris.)
- Our `BTC` thesis ↔ Visser's `IBIT` (iShares Bitcoin) — valid proxy, say so explicitly.
- Visser's `MRK.DE` = Merck KGaA ≠ our `MRK` (Merck & Co). **Not** a match.
- Visser's `Q` = Qnity Electronics — not a ticker we're likely to hold; don't fuzzy-match.
- International suffixes (`.T`, `.KS`, `.DE`, `.PA`, `.MI`, `.L`, `.NS`, `.AS`) — match on company identity, not string similarity.

## Step 4 — Analyze

Default to BOTH modes unless the user asked for one.

### Mode A — New opportunities ("what's buyable in this data today?")

Filter the Signal Sheet + Final_Ranking for:

- `Strong Uptrend / Buyable` (score 80–100, not extended)
- `Pullback Opportunity` (structural uptrend intact + RSI cooled — Visser calls
  this "historically the highest-quality entry profile")
- Consolidation bucket `Best Consolidation in Uptrend` / top `Healthy Pullback`

Split output into: **(a) names where we already have a thesis** — the data is
entry-timing evidence, note the thesis status/direction alongside; **(b) fresh
names with no thesis** — candidate ideas; if one interests the user, the path
is the governed research-pipeline `--idea-intake` stage or `/thesis`, not this skill. Use the Earnings Calendar
sheet to flag any candidate reporting within ~14 days (binary-event risk on new
entries). Note theme-level breadth from Theme Summary (which themes are
confirming vs weak) as context for the AI-complex macro theses.

### Mode B — Book review ("what does this say about existing strategies?")

For every overlap between (theses ∪ open strategies) and the Visser universe,
report: setup label, trend score, exhaustion score/band, TD counts, distance to
50D/200D, next earnings date — then map to a suggested option action:

| Visser state | Suggested action shape |
|---|---|
| Bullish thesis + `Pullback Opportunity` or "Buy near 50D" note | **Cash-secured put** struck at/just below the 20D or 50D MA level (the retest he's flagging). Get the actual MA level from the sheet's `vs 20D`/`vs 50D` columns + price. |
| Held + `Strong but Extended`, or exhaustion ≥60, or TD Setup/Countdown ≥9 | **Collar or covered call** — sell the extension, optionally finance a put at the 50D. (The GLW 2026-06-29 pattern; judge each case, don't auto-apply.) |
| Held or thesis-relevant + `Breakdown Risk` / `Trend Damage` bucket | **Hedge review** — protection struck below the 200D / failed base; also flag as possible refuting technical evidence for the thesis (user may want to feed it into `/thesis <X>`). |
| Held + week-over-week label deterioration (e.g. Buyable → Weakening) | Flag for reduce-on-strength review. Transition, not level, is the signal. |
| `Neutral / Watch`, `Constructive` with "Hold" note | No action — say so; silence on a name the user holds reads as "not covered". |

Respect standing user decisions from memory (e.g. **no short-term downside
hedges on GLXY below mid-$40s** — GLXY isn't in Visser's universe anyway, but
IBIT-driven "hedge crypto" reasoning must not route there).

For any structure worth pricing, offer `/options-advisor` (portfolio-aware
generation) or `/ibkr-quote` (live quote on a specific structure) as follow-ups
— do not silently invoke them.

## Reference — the framework (self-contained; survives loss of the docx files)

**Trend Score (0–100, ten binary checks):** P>200D +20 · P>50D +15 · P>20D +5 ·
50D slope up +10 · 200D slope up +10 · 1M return >0 +10 · 3M return >0 +10 ·
**RSI in 50–70 band** +10 (RSI>70 forfeits — extension is penalized by design) ·
RS vs SPY >0 +5 · volume >20D avg +5.

**Setup labels:** 80–100 `Strong Uptrend / Buyable` · ≥75 & RSI>72 `Strong but
Extended` (hold, don't chase) · 65–79 `Constructive` · 50–64 & RSI<45 & >200D
`Pullback Opportunity` (best entry profile) · 50–64 `Neutral / Watch` · 35–49 +
rising 50D slope `Early Trend Improvement` · 35–49 `Weakening` (reduce on
strength) · <35 `Breakdown Risk` (avoid until base forms).

**Exhaustion score (absolute 1–100):** blends RSI14/RSI5, Williams %R, 20D
position, ATR-normalized extension vs 20D/50D, 1M return/vol, 5-day impulse,
volume ratio, ATR expansion, TD Sequential Setup/Countdown. Bands: ≥75 extreme,
≥60 elevated, ≥40 moderate, else low. High exhaustion on a held winner =
collar/call-sale territory, not a sell signal.

**Known limitations (Visser's own):** checks are mechanically correlated (a
high score ≠ many independent confirmations); binary thresholds make scores
jumpy near boundaries; the score is pro-cyclical (highest on the most
priced-in names — that's why labels exist); no volatility normalization
(score 75 on a utility ≠ score 75 on a semi — sizing must handle that, and
sizing is out of scope here).

**Themes (6):** Whole Rack · Semicon Architecture · Optical & Interconnects ·
Chemicals & Materials · Energy & Infrastructure · Macro Satellites.

## Output format

1. **Header:** data as-of date, file set used, staleness warning if applicable.
2. **TL;DR:** 2–4 sentences — the single most actionable finding in each mode.
3. **Mode A table** (opportunities): ticker, theme, score, label, our-thesis
   status, earnings-in-N-days, one-line read.
4. **Mode B table** (book): ticker, our position/thesis, label, exhaustion,
   suggested action shape with concrete strike anchor level.
5. **Theme breadth** one-liner + anything week-over-week if a prior file existed.
6. **Follow-up offers** (advisor / ibkr-quote / thesis / stage-1) — offers, not actions.
