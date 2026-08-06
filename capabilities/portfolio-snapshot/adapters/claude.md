## Claude Provider Adapter

1. Translate a JSON request to `--format json`; otherwise request the human-readable result.
2. Pass an account filter only as `--account-ids` followed by a comma-separated list of account UUIDs.
3. From the Trade Journal repository root, invoke `npx tsx scripts/pull-portfolio.ts` with only those supported flags.
4. Return the command result with its reported snapshot date. When JSON was requested, preserve the complete JSON object for downstream use.
5. Treat missing credentials, database errors, invalid UUID filters, and non-zero execution as explicit unavailability or failure.

This adapter is read-only. Its authority ends at presenting the returned snapshot; it does not mutate Trade Journal state or place trades.
