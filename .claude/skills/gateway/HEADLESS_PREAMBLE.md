# HEADLESS MODE — Gateway unavailable refusal

This projection is not an unattended gateway controller. Radon has not published an accepted immutable
`capability:scope:radon/ibkr-gateway-control` Capability Package or exact Adapter Conformance evidence, and
the Trade Journal projection is explicitly ineligible for headless execution.

Do not inspect local gateway, launchd, profile, port, JVM, credential, or session state. Do not run
`scripts/ops/gateway.sh` or any Radon, IBC, IBKR, `launchctl`, process-control, or network command. Do not
read credentials or infer availability from connectivity or local file presence. Do not pause, resume,
restart, switch, or otherwise change gateway operation.

Return exactly this single-line JSON result and perform no other action:

```json
{"status":"unavailable","capability":"capability:scope:radon/ibkr-gateway-control","reason":"accepted-radon-package-and-adapter-conformance-unavailable","reads":[],"writes":[],"gateway_operation_invoked":false}
```

This refusal preserves Radon as Capability Authority, Trade Journal's interactive migration input, and the
assigned Trade Journal client-id range 20–49 without representing unavailable operational evidence as live.
