# Domain Docs

How engineering skills should consume Trade Journal's domain documentation while exploring the repository.

## Layout

Trade Journal is a **single-context repository**. It does not use a root `CONTEXT-MAP.md` or package-scoped domain contexts.

The domain-document locations are:

- `CONTEXT.md` at the repository root, when present;
- `docs/adr/` for repository-wide architecture decision records, when present; and
- the existing `CLAUDE.md`, `AGENTS.md`, and relevant `docs/v2/` material for current operating and product context.

The absence of `CONTEXT.md` or `docs/adr/` is valid. Proceed silently rather than creating placeholders or proposing speculative domain terms. Domain-modeling workflows create these artifacts lazily when terminology or decisions are actually resolved.

## Before exploring

1. Read `CONTEXT.md` when it exists.
2. Read ADRs under `docs/adr/` that touch the area being changed.
3. Read `CLAUDE.md` as the canonical repository operating manual and `AGENTS.md` for Codex-specific differences.
4. Read the relevant `docs/v2/` decisions before designing changes to the product direction, belief layer, or loose-agent model.

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, specification, refactor proposal, hypothesis, or test—use the term defined in `CONTEXT.md` when that file exists. Do not drift to synonyms that the glossary explicitly avoids.

Until a root glossary exists, preserve the established repository vocabulary, including the decision hierarchy **macro thesis → asset thesis → strategy → position**, the loose-agent meaning of `monitoring`, and the distinction between Decision Item producers and resolvers.

If a needed concept is not defined, reconsider whether existing vocabulary already covers it. Record a genuine terminology gap for domain modeling rather than silently inventing a competing term.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly rather than overriding it silently. Identify the ADR and explain the new evidence or direct conflict that would justify reopening the decision.
