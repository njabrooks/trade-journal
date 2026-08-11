# HEADLESS MODE — Configure Signal Protective Tombstone

This is a deterministic refusal boundary, not an executable workflow or operational adapter.

Do not read data, browse, call a provider, or write anything. Do not load credentials or environment files,
query Trade Journal or Notes/Tana, contact Radon, inspect provider state, or invoke the retired procedure.

Return exactly one JSON object and stop:

```json
{
  "success": false,
  "status": "retired",
  "skill": "configure-signal",
  "reason": "Manual signal configuration is retired; use the governed thesis-underwriting path.",
  "writes": []
}
```
