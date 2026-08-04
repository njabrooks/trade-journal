# Issue tracker: GitHub

Repository-owned issues and specifications for Trade Journal live in GitHub Issues for `njabrooks/trade-journal`. Use the `gh` CLI from the repository root for all operations. Workspace-level Initiatives may coordinate this work through native cross-repository relationships, but the Trade Journal issue remains the Record Authority for changes to this repository.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments with `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

The repository is explicit rather than inferred: `njabrooks/trade-journal` is the tracker authority. A bare `#42` in repository-local work refers to the issue or pull request numbered 42 in this repository unless another repository is named.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. If a bare reference is ambiguous, resolve it with `gh pr view <number>` and fall back to `gh issue view <number>`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `njabrooks/trade-journal`.

## When a skill says "fetch the relevant ticket"

Read the repository issue and its comments with `gh issue view <number> --comments`.

## Wayfinding operations

Used by the Wayfinder workflow. The map is one issue with child issues as tickets.

- **Map**: one issue labelled `wayfinder:map`, containing Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child ticket**: link the issue to the map as a native GitHub sub-issue. If sub-issues are unavailable, add the child to a task list in the map and put `Part of #<map>` at the top of the child body.
- **Ticket type**: apply one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- **Blocking**: use native GitHub issue dependencies. Add an edge with `gh api --method POST repos/njabrooks/trade-journal/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`, where the database id comes from `gh api repos/<owner>/<repo>/issues/<number> --jq .id`. If dependencies are unavailable, use a `Blocked by: #<n>, #<n>` fallback line in the child body.
- **Frontier**: open, unassigned child tickets whose blockers are all closed, in map order.
- **Claim**: assign the ticket to the driving developer before doing work.
- **Resolve**: record evidence in a comment, close the ticket, and append a concise context pointer to the map's Decisions so far.

## Tracker authority boundary

- GitHub Issues for `njabrooks/trade-journal` are authoritative for repository-owned specifications and implementation Work Items.
- Workspace-level coordination records link to these issues; they do not copy or replace their durable requirements.
- Linear is not an authoritative tracker or fallback for this repository.
