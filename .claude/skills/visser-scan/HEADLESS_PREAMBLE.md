# HEADLESS MODE — UNAVAILABLE

Issue #70 retains this projection only as a protective discovery and rollback boundary. It is not a governed
Provider Adapter and has no unattended or operational execution authority.

Do not execute the Visser scan procedure, query Trade Journal, read Notes data, browse, or write anything.
Do not load credentials, invoke the extractor, create journal entries or Decision Items, call an ops script,
schedule work, or infer current support from the files that follow.

A headless caller must stop with exactly one unavailable result:

```json
{"success":false,"skill":"visser-scan","status":"unavailable","reason":"adapter_conformance_unavailable","writes":[]}
```

The manual pull-only source remains below for historical and interactive discovery. It may be used only through
separately authorized interactive work and retains its own staleness, live-price recheck, no-write, no-sizing,
no-trade, and explicit-user-confirmation boundaries.
