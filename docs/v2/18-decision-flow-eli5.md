# Decision Flow ELI5

Last updated: 2026-06-25

This is the plain-English reference for the belief-layer decision flow. Use it when
the system surfaces a card and you want to understand what kind of judgment it is
asking for.

## The Big Picture

The system has two jobs:

1. Keep the investment graph tidy.
2. Avoid making judgment calls silently.

Most scripts can inspect data and prepare work. They can say, "this thesis looks
thin", "this position needs classifying", or "this evidence might refute the
argument". They should not decide important investment meaning by themselves.

That is why the system has two roles:

- **Producers** find things that may need judgment.
- **Resolvers** record the judgment and do the mechanical write.

The two main entry points are:

- `maintenance`: the producer. It scans for work and raises Decision Items.
- `decisions`: the resolver. It works through the open Decision Items.

In Codex, there are no slash commands. The workflow is the same, but the agent runs
the relevant scripts and skill instructions directly.

## The Decision Item

A Decision Item is an auditable row in `journal_entries` with
`action_type='decision_required'`.

ELI5: it is a sticky note that says, "A human needs to choose what this means."

Each card usually has:

- **Object**: the thing the decision is about, such as a thesis, claim, signal, or strategy.
- **Decision type**: the kind of judgment being asked.
- **Why raised**: why the system thinks this needs attention.
- **Recommended actions**: bounded choices that can resolve it.
- **Runbook**: which workflow should handle it.

The generic reader is:

```bash
npx tsx scripts/ops/list-decisions.ts --json
```

The generic closer is:

```bash
npx tsx scripts/ops/resolve-decision.ts --id <decisionId> --action <action> --by user
```

Some decisions have built-in mechanical writes. Others are delegated: the agent does
the real work in the relevant workflow, then closes the decision with notes and audit
metadata.

## The Normal Flow

1. **Maintenance scans.**
   It looks for new research, stale health checks, thin theses, missing links, and
   re-underwrite triggers.

2. **Maintenance raises cards only where judgment is needed.**
   It should not clutter the strip with everything it can possibly notice.

3. **Decisions ranks the cards.**
   Risk and belief upkeep come first; graph hygiene and additive research come later.

4. **You choose.**
   The choice might be "belief-backed", "tactical", "link this research",
   "run a deep dive", "accept thin", or "dismiss for now".

5. **The resolver records the choice.**
   The choice is written to the journal. If a graph write is needed, it should happen
   through the appropriate script or runbook.

6. **Follow-up work happens.**
   Closing a card records the decision. It does not magically create claims, sources,
   signals, or a fully underwritten thesis. Those come from the downstream workflow.

## Producers vs Resolvers

| Role | ELI5 | Examples |
| --- | --- | --- |
| Producer | The scout that notices something might need attention. | `maintenance`, `relate-research`, `thesis-review`, `thesis-observe` |
| Resolver | The clerk that records the decision and performs the approved write. | `decisions`, `resolve-decision.ts`, specific ops scripts |

The important rule: producers may surface judgment, but they should not quietly make
the judgment.

## Maintenance Worklists

### `relateResearch`

ELI5: "New notes came in. Do any of them belong to existing theses?"

This pulls new research from the Tana/notes side and tries to attach claims to active
investment theses. Clear matches can link automatically. Ambiguous or refuting
matches become decisions.

### `digestRefresh`

ELI5: "The written argument is stale compared with the claims."

This means a thesis has enough claim changes that its articulation may need refreshing.
The output is usually a re-underwrite or build-core-argument style workflow.

### `signalDerivation`

ELI5: "We have a thesis argument, but no dashboard lights."

If a thesis has enough claims or an articulation but no useful signals, the system
derives confirmation, invalidation, and completion signals from the argument. Signals
should come from the thesis's own drivers and counter-arguments, not hand-made
thresholds.

### `signalThin`

ELI5: "We want dashboard lights, but the thesis is too thin to make them honestly."

This is a warning that the system should not invent signals. The right move is usually
research-gap handling: search Tana first, then capture sources or run deeper research.

### `healthDue`

ELI5: "The dashboard lights need a fresh read."

Existing active signals are checked against current evidence. If the evidence is
neutral, nothing may happen. If evidence materially weakens or strengthens the thesis,
the workflow records that and may raise a decision.

### `researchGap`

ELI5: "We have a live or monitored thesis, but not enough research behind it."

This is the position-to-research backfill path. The rule is Tana first:

1. Search Tana for existing material.
2. If relevant material exists, route it through claim generation and relate-research.
3. If Tana lacks material, raise a `develop_thin_thesis` decision with specific source
   suggestions or a deep-dive question.

### `retrospective`

ELI5: "The expression closed. What did we learn?"

This is the post-game review. It separates two questions:

- Was the belief right?
- Was the execution good?

A good retrospective distinguishes a bad thesis from bad sizing, timing, hedging, or
failure to harvest gains.

### `framing`

ELI5: "Which bigger story does this asset belong under?"

This links an asset thesis to a macro thesis. The link can be:

- `related`: the macro gives useful context.
- `gated_by`: the asset thesis depends on the macro thesis being true.

Framing keeps the graph navigable without pretending every asset is mechanically
controlled by a macro.

### `classifyExposure`

ELI5: "Is this live position a real belief or just a trade?"

Sometimes ingestion finds a live position and creates a placeholder thesis. The
decision is whether to:

- keep it as belief-backed and develop it, or
- mark it tactical/hedge and reject or retire the placeholder thesis.

### `reunderwriteDue`

ELI5: "Enough changed that the whole argument may need rebuilding."

This can be triggered by:

- new linked claims since the last articulation,
- a new refuting claim,
- signal-quality problems,
- a meaningful change in the evidence base.

A single refuting claim can be enough to raise this because one strong counterpoint
can matter. But the decision strip should still stay disciplined. Small one-claim
items can be deferred when there is higher-value work.

## Decision Types

| Decision type | ELI5 | Usual next step |
| --- | --- | --- |
| `classify_exposure` | Is this live exposure belief-backed or tactical? | Keep and develop thesis, or mark tactical/reject placeholder. |
| `develop_thin_thesis` | This thesis needs real research before it can carry much weight. | Link Tana material, capture sources, run deep dive, or accept thin. |
| `frame_asset_under_macro` | Does this asset belong under a macro thesis? | Link as `related`, link as `gated_by`, or leave stand-alone. |
| `classify_macro_link` | What kind of macro relationship is this? | Choose `related`, `gated_by`, unlink, or stand-alone. |
| `link_strategy_to_thesis` | Which thesis owns this strategy? | Set `strategies.asset_thesis_id`. |
| `review_refuting_claim` | A claim may argue against the thesis. | Link as refuting, dismiss, or re-underwrite. |
| `confirm_claim_link` | A claim probably belongs, but needs confirmation. | Confirm link or reject link. |
| `cluster_claims_to_thesis` | Several claims may point to a new thesis. | Create/link a thesis or keep claims separate. |
| `weakening_signal_action` | A signal is flashing weakness. | Re-underwrite, reduce conviction, add note, or dismiss as noise. |
| `run_deep_dive` | The system thinks a research pass is worth doing. | Start the research pipeline or dismiss. |
| `resolve_proxy_underlying` | An underlying looks like a proxy for another. | Map it to the parent underlying or leave separate. |
| `re_underwrite_due` | The living argument needs a rebuild. | Run thesis snapshot and build-core-argument. |

## Glossary

### Active Thesis

A thesis that is still in play. It can be `developing`, `monitoring`, or sometimes
`closed` but dormant. Research can attach to active theses based on bearing, not only
current holdings.

### Articulation

The written core argument for a thesis. It includes drivers, assumptions,
counter-arguments, and derived signals.

### Claim

A structured investment statement. Claims can support, refute, or contextualize a
thesis.

### Completion Signal

A sign that the thesis has played out or reached its intended destination.

### Confirmation Signal

A sign that the thesis is becoming more true.

### DecisionStrip

The UI strip that shows active Decision Items. It is intentionally small so the user
is not buried.

### Digest

The current synthesized thesis argument. In newer wording, this is usually the
articulation/core argument.

### Expression

A live strategy or position that expresses a thesis in the portfolio.

### Framing

The act of placing an asset thesis under a macro thesis as `related` or `gated_by`.

### Gated By

A strong macro relationship. If the parent macro thesis fails, the asset thesis likely
needs rethinking.

### Health Check

A fresh read on whether existing signals are strengthening, weakening, neutral, or
invalidated.

### Invalidation Signal

A sign that the thesis may be wrong.

### Monitoring

A lifecycle status meaning the thesis has a live expression. It is derived from active
strategy linkage, not from whether signals exist.

### Re-underwrite

Rebuild the living argument because new evidence, refuting claims, or signal-quality
issues mean the old version may no longer be enough.

### Related

A softer macro relationship. The macro thesis gives context, but the asset thesis does
not strictly depend on it.

### Research Gap

A thesis is live or important, but has too few claims or no useful articulation. The
system should search Tana first before asking for new research.

### Retrospective

A review after an expression closes. It asks "was the belief right?" and "was the
execution good?" separately.

### Signal

A monitorable condition derived from the thesis argument. Signals should be generated
from the core argument, not hand-configured.

### Signal Thin

The thesis is too under-researched to generate honest signals. Add research first.

### Tactical Exposure

A position held for trading, hedging, or mechanical reasons rather than as a developed
belief. Tactical exposure should not force a placeholder thesis to become a real thesis.

### Thin Thesis

A thesis with too few claims, no digest/articulation, or low-confidence support. It can
still be worth holding, but it should be labelled honestly until developed.

## How To Read A Card

When you see a Decision Item, ask:

1. What object is it about?
2. Is the card about risk, belief quality, graph hygiene, or additive research?
3. Is this asking for a real judgment or just a mechanical write?
4. What would happen if we did nothing?
5. Is the default recommendation good enough, or should it be deferred?

## Practical Rules Of Thumb

- Do not treat `monitoring` as "well researched". It only means "has a live expression".
- Do not generate signals from vibes. If the thesis is thin, bridge the research gap.
- Search Tana before asking for new research.
- One strong refuting claim may deserve attention, but it does not mean every one-claim
  delta must be handled immediately.
- Resolved decisions are audit records. They do not always mean the downstream research
  work has been completed.
- Completed or rejected strategies can still matter for retrospectives and linked-thesis
  history.

