# Configure Signal — protective tombstone

This former workflow is retired. It is retained only to prevent old discovery paths or remembered invocations
from reviving manual signal configuration.

Do not read data, browse, call a provider, or write anything. Do not configure `explicit_details`, thresholds,
data sources, or monitoring rules. Do not query or mutate Trade Journal, Notes/Tana, Radon, credentials,
schedulers, theses, claims, signals, strategies, positions, orders, or trades.

Current authority is the loose-agent underwriting model in `docs/v2/10-thesis-underwriting-loose-agent-model.md`:
`build-core-argument` derives qualitative resolution signals from the thesis's linked claims and their
counter-arguments. Existing legacy metric fields may remain for compatibility, but this tombstone grants no
authority to create or edit them.

If invoked, stop immediately and return this refusal without side effects:

```json
{
  "success": false,
  "status": "retired",
  "skill": "configure-signal",
  "reason": "Manual signal configuration is retired; use the governed thesis-underwriting path.",
  "writes": []
}
```
