---
name: decisions
description: The decision-mode front door — open a context and immediately see + work through what needs your judgment. Reads the open Decision Items (the agent-side DecisionStrip) plus the latent maintenance worklists, ranks them, and walks you through resolving each via its runbook. Use when the user asks "what needs me", "what's pending", "what should I decide", "open decisions", "let's go through decisions", "decision mode", "anything need my call", or opens a session wanting to act on the belief layer. Distinct from /maintenance (which PRODUCES decisions); this one RESOLVES them.
user_invocable: true
allowed-tools: Bash, Read, Edit, Write
---

# decisions — the decision-mode front door (docs/v2/10 §3)

## Purpose

The **pull, curious foreground** for a fresh context: one command that answers *"what needs
me right now?"* and then helps you resolve it conversationally. It is the agent-side
counterpart to the web **DecisionStrip**.

It reads two layers and composes them:
1. **Open Decision Items** — already-raised, typed `DecisionPacket`s (`journal_entries`,
   `action_type='decision_required'`, `status='active'`/expired-snooze). These are the
   things to **resolve now**.
2. **Latent maintenance worklists** — work `/maintenance` would surface as decisions but
   hasn't yet (due re-underwrites, signalless/thin theses, framing, research-gaps, …).

**Relationship to `/maintenance`:** `/maintenance` is the *producer* (drains worklists,
raises packets, advances the relate-research cursor — the background freshness-keeper).
`/decisions` is the *consumer/resolver* (the headline conversation). Use `/decisions` to
act; use `/maintenance` to refresh/surface. They share the same dashboard + packet model.

## Principles
- **Resolve genuine decisions, don't manufacture them.** A raised packet already passed the
  "needs judgment" bar — present it with its `default_recommendation`, then let the user
  choose. Never auto-resolve a judgment call silently.
- **Close through the canonical path.** Every resolution hardens via
  `scripts/ops/resolve-decision.ts` (which records the resolution + does the built-in
  mechanical write); status changes go through `update-entity-status.ts`; the real
  belief work happens in the packet's **runbook** skill. Never hand-edit the journal row.
- **Opus throughout, tune effort.** Resolving is interpretive — stay on Opus; control cost
  with effort (low for mechanical closes, higher for re-underwrite / refuting-evidence judgment).
- **Rank, then triage.** Risk first (refuting / weakening), then belief upkeep
  (re-underwrite / thin), then graph hygiene (framing / exposure / links), then additive.

## Workflow

**Step 0 — Environment**
```bash
cd /Users/home-hub/projects/trade-journal
```

**Step 1 — Read both layers**
```bash
npx tsx scripts/ops/list-decisions.ts --json     # open packets, ranked (the resolve-now set)
npx tsx scripts/ops/maintenance-status.ts --json # latent worklists (what /maintenance would raise)
```

**Step 2 — Present the brief**
Lead with a one-line headline: *"N decisions to resolve · M latent maintenance items."*
Then list the open decisions in ranked order — for each: the type label, the subject
(`objectTitle`), `whyRaised`, age/×occurrence, and the `default_recommendation` if present.
Keep it scannable; don't dump JSON.

**Step 3 — Work through them (one at a time, user-led)**
For each open decision, surface its `recommended_actions` + default, get the user's pick, then:
- **Built-in mechanical types** (`frame_asset_under_macro`, `classify_macro_link`,
  `link_strategy_to_thesis`, `resolve_proxy_underlying`) — `resolve-decision.ts` does the
  write **and** the close in one call:
  ```bash
  npx tsx scripts/ops/resolve-decision.ts --id <decisionId> --action <set_gated_by|link|map|stand_alone> [--macro-id|--strategy-id|--thesis-id|--parent-id <uuid>] --by user
  ```
- **Delegated types** (`re_underwrite_due`, `develop_thin_thesis`, `review_refuting_claim`,
  `cluster_claims_to_thesis`, `weakening_signal_action`, `classify_exposure`,
  `confirm_claim_link`) — do the real work in the **runbook** skill first (see table), then
  close + record:
  ```bash
  npx tsx scripts/ops/resolve-decision.ts --id <decisionId> --action acknowledge \
    --notes "<what was done>" --writes '[{"table":"...","op":"update","ids":["<id>"]}]' --by user
  ```
- **Defer** — dismiss (`--action dismiss`) or let the user snooze it on the web strip.

Preview anything ambiguous with `--dry-run` before applying.

**Step 3b — Expression follow-on (docs/v2/21 Phase 5).** When a resolution *changes a
belief about a name* — a re-underwrite lands, a direction/conviction flips, refuting
evidence is accepted, a weakening signal is acted on — offer, in one line, to look at the
expression consequences before moving to the next packet: *"conviction on X changed —
want to look at expressing/protecting it?"* If yes:
```bash
npx tsx scripts/options-advisor.ts --underlying <TICKER>
```
then judge conversationally per the `/options-advisor` doctrine (regime first,
live-verify before acting, standing constraints bind; if the user acts, save a one-rec
batch + mark it acted so Lane C scores it). A decision that changes a belief is exactly
the moment its expression should be revisited — but it's an OFFER, never automatic, and
skip it for mechanical link/classify resolutions.

**Step 4 — When the open queue is empty**
If `list-decisions` is `0` but `maintenance-status.actionable > 0`, say so and offer to
**run `/maintenance`** to drain the agent worklists (or jump straight to the
highest-value one — e.g. the due re-underwrites via `find-theses-due-reunderwrite.ts` → `/thesis <X>`).
If both are `0` and `newInsights === 0`, report "belief layer up to date — nothing needs you."

**Step 5 — Report.** What was resolved (by type, with the writes), what was deferred, and
what latent work remains — so the next context knows where to pick up.

## Runbook by decision_type (from `DECISION_RUNBOOKS`, docs/v2/09 §7)
| decision_type | resolve via |
|---|---|
| `re_underwrite_due` | `/thesis <X>` re-underwrite (new evidence since last version) |
| `review_refuting_claim` · `confirm_claim_link` · `cluster_claims_to_thesis` | `/relate-research` |
| `develop_thin_thesis` | `/thesis-review research-gap` (Tana-first) |
| `weakening_signal_action` | `/thesis-review health` |
| `frame_asset_under_macro` · `classify_macro_link` | link asset→macro (built-in handler) |
| `link_strategy_to_thesis` | link strategy→thesis (built-in handler) |
| `resolve_proxy_underlying` | create-underlying + `parent_underlying_id` (built-in handler) |
| `classify_exposure` | `update-entity-status` (tactical vs belief) |
| `run_deep_dive` | stage-1…5 → `graduate-pipeline-idea` |

## Common mistakes
1. ❌ Auto-resolving a packet without the user's pick — they exist *because* they need judgment.
2. ❌ Closing a decision by editing the journal row — always go through `resolve-decision.ts`.
3. ❌ Making a status change inside the resolution without `update-entity-status.ts` (skips transition validation).
4. ❌ Confusing this with `/maintenance` — that one *raises* decisions; this one *resolves* them. If the queue is empty, point at `/maintenance`, don't re-drain here.
5. ❌ Dumping raw JSON at the user — present a ranked, scannable brief.
