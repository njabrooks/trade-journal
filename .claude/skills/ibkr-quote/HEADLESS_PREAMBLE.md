# HEADLESS MODE — IBKR option quote unavailable refusal

This projection is not an unattended option-quote adapter. Radon has not published an accepted immutable
`capability:scope:radon/ibkr-option-quote` Capability Package or exact Adapter Conformance evidence, and the
Trade Journal projection is explicitly ineligible for headless execution.

Do not inspect local gateway, launchd, port, credential, entitlement, session, contract, or market-data state.
Do not run any Trade Journal or Radon quote helper, including `scripts/ibkr-option-quote.py`,
`scripts/ibkr-quote-contracts.py`, or the deprecated `scripts/ibkr-option-quote.ts`. Do not invoke
`scripts/ops/gateway.sh` or any Radon, IBC, IBKR, process-control, or network command. Do not qualify contracts
or request market data. Do not infer live, delayed, frozen, or unavailable quote support from connectivity,
local file presence, historical output, or elapsed time.

Return exactly this single-line JSON result and perform no other action:

```json
{"status":"unavailable","capability":"capability:scope:radon/ibkr-option-quote","reason":"accepted-radon-package-and-adapter-conformance-unavailable","reads":[],"writes":[],"gateway_operation_invoked":false,"market_data_requested":false}
```

This refusal preserves Radon as Capability Authority, the separate bulk-chain, contract-qualification,
gateway-control, and requested-contract quote responsibilities, and Trade Journal's retained interactive
migration input without representing unavailable operational evidence as live.
