# Domain Docs

How engineering skills should consume Trade Journal's domain documentation while exploring the repository.

## Layout

Trade Journal is a **single-context repository**. It does not use a root `CONTEXT-MAP.md` or package-scoped domain contexts.

The domain-document locations are:

- `CONTEXT.md` at the repository root;
- `docs/adr/` for repository-wide architecture decision records; and
- the existing `CLAUDE.md`, `AGENTS.md`, and relevant `docs/v2/` material for current operating and product context.

These canonical Workspace Standard discovery surfaces are always present. Do not create speculative terms or
ADRs merely to populate them; the ADR index explicitly records when no standalone ADR has been adopted.

## Before exploring

1. Read `CONTEXT.md`.
2. Read ADRs under `docs/adr/` that touch the area being changed.
3. Read `CLAUDE.md` as the canonical repository operating manual and `AGENTS.md` for Codex-specific differences.
4. Read the relevant `docs/v2/` decisions before designing changes to the product direction, belief layer, or loose-agent model.

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, specification, refactor proposal, hypothesis, or test—use the term defined in `CONTEXT.md`. Do not drift to synonyms that the glossary explicitly avoids.

If a needed concept is not defined, reconsider whether existing vocabulary already covers it. Record a genuine terminology gap for domain modeling rather than silently inventing a competing term.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly rather than overriding it silently. Identify the ADR and explain the new evidence or direct conflict that would justify reopening the decision.
