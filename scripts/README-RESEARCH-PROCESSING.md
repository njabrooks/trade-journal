# Claude Code Research Processing

## Overview

This script allows you to process research artifacts **for free** using Claude Code instead of the Anthropic API. Perfect for development and testing!

## Why Use This?

- **💰 Zero API Costs** - Uses your Claude Pro subscription instead of API billing
- **🔒 Local Processing** - Everything stays on your machine
- **🧪 Perfect for Dev** - Test the research workflow without spending money
- **🤖 Same Quality** - Claude Sonnet 4.5 extracts insights just like the API

## How It Works

1. You upload research to `/research/upload`
2. Run the script: `npx tsx scripts/process-research-with-claude.ts`
3. The script shows you each unprocessed research artifact
4. Claude Code (me!) analyzes it and provides structured insights as JSON
5. You paste the JSON into the terminal
6. Script saves it to the database
7. ✅ Research is now structured and ready to link!

## Usage

### Step 1: Upload Research

Go to http://localhost:3000/research/upload and add your research content (articles, transcripts, notes, etc.)

### Step 2: Run the Script

```bash
npx tsx scripts/process-research-with-claude.ts
```

### Step 3: Wait for Claude

The script will display each research artifact and ask Claude Code to analyze it.

### Step 4: Paste JSON

Claude Code will provide a JSON response in the chat. Copy it and paste into your terminal.

**Example JSON format:**
```json
{
  "summary": "2-3 sentence overview of key takeaways",
  "keyThemes": ["theme1", "theme2", "theme3"],
  "keyClaims": [
    {
      "claim": "Main assertion",
      "evidence": "Supporting evidence",
      "confidence": "high"
    }
  ],
  "supportingEvidence": [
    {
      "point": "Supporting fact",
      "source": "Where in content"
    }
  ],
  "counterEvidence": [
    {
      "point": "Risk or caveat",
      "source": "Where in content"
    }
  ],
  "timeHorizon": "medium_term",
  "confidenceLevel": "high",
  "relevantTickers": ["AAPL", "MSFT"]
}
```

### Step 5: Done!

The script saves the insights to your database. View them at http://localhost:3000/research

## Preferred Workflow

Use the unified `/intake` skill for all new research processing. It handles
classification, extraction, filing, and upload automatically via spawned
Claude agent workflows (Claude Max subscription — no API key needed).

```
/intake notes/inbox/YYYYMMDD-slug.md
/intake https://substack.com/some-article
```

## Tips

- **Skip artifacts**: Type `skip` instead of pasting JSON to skip an artifact
- **Batch processing**: The script processes all pending artifacts in one run
- **Error recovery**: If parsing fails, the script moves to the next artifact
- **Cost tracking**: Script records $0.00 cost for all Claude Code processing

## Troubleshooting

### "No unprocessed research artifacts found"
- Upload research first at `/research/upload`
- Check that artifacts have `status='raw'`

### JSON parsing error
- Make sure you're copying the complete JSON object
- JSON can be in a code block (```json...```) or plain
- Try wrapping in curly braces if needed

### Script hangs waiting for input
- Press Ctrl+D to send EOF
- Or type `skip` to skip current artifact

## Architecture

The script:
1. Queries `research_artifacts` table for `status='raw'`
2. Displays content to Claude Code
3. Reads JSON from stdin
4. Creates `research_insight` record
5. Updates artifact `status='structured'`
6. Creates `research_processing_run` record with method='claude_code_interactive'

All database operations use the same queries as the API, ensuring consistency.
