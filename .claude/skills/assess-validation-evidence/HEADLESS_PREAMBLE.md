# HEADLESS MODE — Assess Validation Evidence

You are running in **HEADLESS/AUTONOMOUS** mode. Do NOT ask for user input.

## Parameters

- **Thesis ID:** `{{thesisId}}`
- **Thesis Type:** `{{thesisType}}`
- **Content file:** `{{contentFile}}`

## Task

Analyze the content in the file at `{{contentFile}}` against signals for thesis
`{{thesisId}}` ({{thesisType}}).

## Environment Setup

```bash
set -a && source .env.local && set +a
```

## Steps

1. **Load thesis and signals** from the database using psql-query:
   ```bash
   npx tsx scripts/psql-query.ts "SELECT id, title, confidence_level FROM {{thesisTable}} WHERE id = '{{thesisId}}'" --format json
   npx tsx scripts/psql-query.ts "SELECT id, statement, type, importance, status, rationale FROM signals WHERE thesis_id = '{{thesisId}}' AND thesis_type = '{{thesisType}}'" --format json
   ```

2. **Read the content file** at `{{contentFile}}`.

3. **Analyze each signal** against the content. For each signal determine:
   - Whether the content contains relevant evidence
   - Assessment: `strong_confirmation`, `weak_confirmation`, `neutral`, `weak_warning`, `strong_warning`
   - Confidence: `high`, `medium`, `low`
   - Specific evidence points and direct quotes

4. **Output a single JSON result** as your final output:

```json
{
  "success": true,
  "assessments": [
    {
      "signalId": "<uuid>",
      "statement": "<signal statement>",
      "type": "confirmation|warning",
      "importance": "critical|significant|supporting",
      "currentStatus": "<current status>",
      "assessment": "strong_confirmation|weak_confirmation|neutral|weak_warning|strong_warning",
      "confidence": "high|medium|low",
      "evidence": ["Finding 1", "Finding 2"],
      "quotes": ["Direct quote from content"],
      "recommendedAction": "Brief recommendation"
    }
  ],
  "overallSummary": "1-2 sentence summary of key findings"
}
```

## Assessment Rules

- Include ALL signals in output, even those with `neutral` assessment
- Be conservative with `strong_` assessments — require clear, unambiguous evidence
- Use exact quotes from the content
- If a signal is already `triggered`, note whether evidence reinforces or contradicts

On failure:
```json
{
  "success": false,
  "error": "<specific error message>"
}
```
