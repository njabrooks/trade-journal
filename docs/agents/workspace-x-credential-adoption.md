# Workspace X credential adoption

The supported Trade Journal X seam is `scripts/ops/x-read.py`. It is the only repository-owned X consumer, permits only the explicit Bird read-command allowlist, and bootstraps through Workspace service `trade-journal.x-read`. Workspace supplies credential identities `x.auth-token` and `x.ct0` only to the exact allowlisted child process. Raw-token flags, Chrome/Chromium or Firefox profile extraction, and Bird cookie-source selection are refused. This dependency does not add any write, post, reply, follow, or account-mutation authority.

Run its deterministic secret-safety check without live credentials:

```bash
/opt/homebrew/bin/python3 -B scripts/ops/x-read.py --self-test
```

Inspect credential availability without exposing values:

```bash
/Users/home-hub/projects/workspace credential diagnose --service trade-journal.x-read --format json
```

After the Keychain identities are provisioned, use an authorised read-only probe such as:

```bash
/Users/home-hub/projects/workspace credential run trade-journal.x-read -- \
  /opt/homebrew/bin/python3 -B /Users/home-hub/projects/trade-journal/scripts/ops/x-read.py whoami
```

The deterministic check covers successful delivery, missing material, a denied operation, a wrong Workspace service marker, a stale-provider response, and unavailable Workspace or Bird execution. Missing, denied, malformed, stale, or unavailable credentials and providers fail closed. Raw values and their SHA-256 forms are removed from captured child output. No cookie material, credential value, or value-derived hash belongs in logs, evidence, repository files, or issue comments.

An authenticated probe returning HTTP 401 is a stale or rotated credential outcome, not a successful delivery and not permission to fall back to another store. Record only the outcome class. Diagnose the declared identities, leave the consumer unavailable, and defer replacement and rotation to the coordinated cutover.

## Migration window and removal condition

The repository-local inventory found `X_AUTH_TOKEN` and `X_CT0` only in the ignored `.env.local`; their values were not inspected or recorded. That file is a superseded store, and operators must not source it for the supported probe. Direct inheritance of both names remains a compatibility path only when no Workspace service marker is present. A partial Workspace delivery or a marker for another service is refused.

Final compatibility removal belongs only to the human-gated `projects#35` cutover, after every repository adoption ticket closes, the final legacy consumer stops, credentials rotate, authorised services reload, redacted probes pass, and health baselines restart. That cutover removes the `.env.local` entries and GUI launch-environment values without recording them. Issue #114 leaves those values and services untouched and grants neither source broader authority during the migration window.
