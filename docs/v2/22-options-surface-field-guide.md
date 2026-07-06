# 22 — Options & Market-Structure Surface: Field Guide

**Status:** LIVING DOC (2026-07-06) · companion to [21-radon-integration-options-strategy-surface.md](21-radon-integration-options-strategy-surface.md)
**Purpose:** the one-page mental model for everything options/market-structure. If you're wondering "what do I look at / ask for, and when" — this page.

## The model: six layers, one loop

```
SENSE  →  SYNTHESIZE  →  RECOMMEND  →  DECIDE  →  DIALOGUE  →  ACT & LEARN
(cron)     (morning)      (advisor)     (queue)    (per-name)    (record + score)
   ▲                                                                   │
   └───────────────────────── outcomes feed back ──────────────────────┘
```

**You only ever *touch* three doors** (DECIDE, DIALOGUE, and reading the morning
brief). Everything else runs itself and surfaces through those doors.

### 1 · SENSE — ambient, automated, no action required
| What | Cadence | Where it lands |
|---|---|---|
| Regime scan — CRI crash-risk + VCG vol/credit (radon, IB-only) | 07:40 / 15:10 / 21:10 wd | `regime_snapshots` → dashboard **RegimeStrip** + brief |
| Options scanner — 50-ticker vol-curve universe | 14:50 wd | `vol_scan_*` → ScannerSnapshot cheap-vol list, advisor volContext |
| Thesis-observe — news/price vs signal statements | 07:00 daily | signal evidence → brief "overnight" |
| Signal collectors | 06:30 daily | `signal_data_snapshots` |
| IB Gateway (the substrate) | 24/5, Monday 2FA tap | port 4001; health in SessionStart nudge; `/gateway` to pause/resume/status |

### 2 · SYNTHESIZE — one judged read per day
**Morning brief (08:45)** — NAV delta, regime line, overnight evidence, open
decisions, advisor recs, sizing coherence, execution patterns, 48h calendar →
one headline + ranked attention list (≤5) on the dashboard. *If you read one
thing per day, it's this.*

### 3 · RECOMMEND — the advisor (seven scenarios, one storage path)
`/options-advisor` (engine `scripts/options-advisor.ts` + skill judgment) →
`advisor_recommendations` (per-scenario batch supersede, 7-day expiry) →
dashboard **ScannerSnapshot** grouped by scenario, hit-rates attached (Lane C).

| Scenario | Universe | The question it answers |
|---|---|---|
| hedge | large net-long exposures | "what's cheap protection on what I'm carrying?" |
| income | run-up holds | "which holds should sell calls?" |
| collar | run-up holds | "stay long but band it — put paid for by the call" |
| put_entry | bullish theses | "get paid to enter names I want lower" |
| risk_reversal | bullish theses | "harvest rich put skew into upside" (⚠ undefined risk, always flagged) |
| leap_entry | bullish theses (IB live) | "long-dated calls where IV is below realized vol" |
| opportunistic | vol-regime extremes | "anything unusual worth judgment?" |

**Scheduled producers (weekdays):** 08:05 — the six Massive-chain scenarios,
regime-aware, before the 08:45 brief; 15:20 — leap_entry against the live
gateway with the US market open. Fresh batches announce themselves via the
SessionStart nudge ("🟢 N fresh advisor recs → dashboard"). Regime-aware
twice over: judgment reads the latest regime first, and the dashboard orders
protection scenarios (hedge, collar) first whenever a regime band is elevated.

### 4 · DECIDE — the queue of genuine judgment calls
`/decisions` (+ dashboard DecisionStrip) — belief-layer packets only (re-underwrites,
refuting evidence, direction flips). Advisor recs are NOT decisions — they're
advisory until you act. Phase 5 adds the bridge: resolving a decision that
changes a belief offers expression/protection for that name on the spot.

### 5 · DIALOGUE — per-name depth, on demand
| Ask | Skill | Use when |
|---|---|---|
| "where does X stand / re-underwrite X / how do I express X" | `/thesis <X>` | belief first, with the **express/protect** move (targeted advisor run inline) |
| "hedge the book / run the advisor / collar X" | `/options-advisor` | book-wide or scenario-specific recommendations |
| "optimal strikes for X" | `/analyze-vol-curve` | strike-level EV work on one name |
| "price this structure live" | `/ibkr-quote` | verify before acting — **always** (see doctrine below) |
| "what's the visser data saying" | `/visser-scan` | external AI-universe lens on the book |
| "pause/resume the gateway" / "switch to <profile>" | `/gateway` | manual IBKR login needed (subscriptions etc.) or a deliberate login-profile switch |
| deep single-name RR matrix / portfolio stress | radon `risk_reversal.py`, `scenario_analysis.py` | occasional deep-dives (market hours) |

### 6 · ACT & LEARN — close the loop
You act in your broker (this system never executes). `record-action` (Lane C)
captures what you did → `score-advisor-outcomes` grades it later → hit-rates
surface next to each scenario on the dashboard → the morning brief inherits the
patterns. Dialogue-served recommendations get recorded the same way.

## Data doctrine (settled empirically 2026-07-06)

**Screen on Massive, verify on IBKR.** Massive EOD chains give breadth + IV
history (percentiles) and pick structure geometry well; their marks drift
(median 11.6% premium / 2.7 IV pts over a holiday weekend) and die on holidays
(no bid/ask — fallback to `last`). IBKR gives point-in-time truth — every
structure is live-verified before saving/acting. IB data types: live where
subscribed, free 15-min delayed otherwise (type 3 requests auto-upgrade when
subscriptions land). The comparison harness (`scripts/ops/compare-chain-sources.ts`)
re-measures the drift any time.

## Gateway ops quick-reference

- One session per IBKR username. The gateway runs a **credential profile**
  (`~/ibc/profiles/*.ini`; currently `nick` = the dedicated data username the
  gateway normally holds, `maisy` = the alternate). Whichever username the
  gateway holds cannot be logged in elsewhere; the others are untouched.
- Manual login as the gateway's username (e.g. market-data subscriptions):
  "pause the gateway" → do it → "resume the gateway".
- Deliberate switch: "switch the gateway to maisy" (pause → swap → resume,
  2FA tap for the incoming username). The switcher refuses unfilled profiles.
- Weekly rhythm: tokens reset Sunday 01:00 ET → prompts start Sunday evening →
  one 2FA tap whenever; daily 23:40 restarts are tap-free.
- Read-only API is enforced in every profile — this connection can never
  trade or move funds.
- Dead gateway = SessionStart nudge line, never silence.

## Build status (docs/v2/21)

All phases LIVE as of 2026-07-06: gateway (Phase 0), regime feed (1),
leap_entry (2, first scheduled batch pending), collar + risk_reversal (3),
scheduling + login surfacing (4), and the expression dialogue (5) — `/thesis`
has an **express/protect** move and `/decisions` offers expression whenever a
resolution changes a belief, both via `options-advisor.ts --underlying <ticker>`.
The daily loop is: *log in → nudge/brief/dashboard tell you what matters →
open one of three doors → structures come to you inside the conversation.*
