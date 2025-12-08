# Data Files

This directory contains raw CSV files from IBKR Flex queries for manual ingestion.

## Directory Structure

```
data/
├── flex/
│   ├── positions/     # POST section files (from Positions Query)
│   ├── mtm/           # MTMP section files (from Positions Query)
│   ├── nav/           # EQUT section files (from Positions Query)
│   └── trades/        # TRNT section files (from Trades Query)
└── archive/           # Old/processed files (optional)
```

## Naming Convention

The ingestion UI determines which endpoint to use based on keywords in the filename:

**Recommended naming pattern:**
- `YYYY-MM-DD_positions.csv` - For POST section (filename must contain "position")
- `YYYY-MM-DD_mtm.csv` - For MTMP section (filename must contain "mtm" or "mark")
- `YYYY-MM-DD_nav.csv` - For EQUT section (filename must contain "nav", "account", or "equity")
- `YYYY-MM-DD_trades.csv` - For TRNT section (filename must contain "trade")

**Examples:**
- `2025-01-15_positions.csv` - Processes POST section
- `2025-01-15_mtm.csv` - Processes MTMP section
- `2025-01-15_nav.csv` - Processes EQUT section
- `2025-01-15_trades.csv` - Processes TRNT section

**Note:** Even though POST, EQUT, and MTMP are sections in the same Positions Query file from IBKR, you need to upload them separately because each endpoint processes only one section. You can:
- Create separate files with appropriate names, OR
- Upload the same file multiple times with different names (e.g., rename it to include "mtm" or "nav" keywords)

## Usage

1. Download Flex CSV files from IBKR Client Portal
   - **Positions Query**: One file containing POST, EQUT, and MTMP sections
   - **Trades Query**: One file containing TRNT section
2. Save them in the appropriate subdirectories:
   - Positions Query file → `flex/positions/` (filename must contain "position")
   - Trades Query file → `flex/trades/` (filename must contain "trade")
3. Upload via the admin UI at `/admin/ingestion/flex`

### Positions Query Upload Options

**Option 1: Process all sections at once (Recommended)**
- Upload the Positions Query file (filename contains "position")
- Check the "Process all sections (POST, EQUT, MTMP) from this file" checkbox
- All three sections will be processed in one upload

**Option 2: Process sections separately**
- Upload the same file multiple times with different names:
  - `YYYY-MM-DD_positions.csv` → processes POST section
  - `YYYY-MM-DD_mtm.csv` → processes MTMP section
  - `YYYY-MM-DD_nav.csv` → processes EQUT section

The UI automatically routes to the correct endpoint based on filename keywords.

## Notes

- These files are gitignored (sensitive financial data)
- Keep files organized by date for easy reference
- Archive old files to `archive/` after successful ingestion if desired

