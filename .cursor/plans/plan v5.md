# Implementation Plan v5

This is an implementation plan for this app project, labeled v5 to represent the most up-to-date version of the plan.

## 1. Data ingestion
### 1.1. Automated Flex ingestion
  - Edge function/cron to call IBKR Flex APIs (FLEX token + query IDs)
  - Reuse existing normalizers; trigger recompute on success
  - Keep manual upload for backfills
### 1.2. Underlyings IV history ingestion
  - `src/lib/ingestion/underlyingsIvHistory.ts`
  - Scrape/ingest Option Strategist data (or Massive API) via scheduled job
  - Needed for IV related values required for triage metrics.
## 2. Rules 
### 2.1 Complete rules specifications
  - Refer to `docs/actions.md` for details.
### 2.2 Implement rules
### 2.3 Decision-making assistant
  - Connect decision-making process to ChatGPT at strategy-detail level. 
  - Share decision context with AI and seek recommendations on optimal action (trade) to manage risk and maximise expected value for the strategy.
  - Include feature to manually capture (copy/paste, csv export or screenshot) options data (greeks, IV at relevant strikes and expiries) to facilitate advice from AI.
### 2.4 Rules configuration
  - Make all rules configurable via:
    - `/admin/triage`
    - `/admin/playbook`
## 3. DB problem-solving
### 3.1 Missing fields in schemas
### 3.2 Recompute issues
  - Refer to `trade-journal-user-flow-analysis.plan.md`
### 3.3 Minor adjustments
  - It may be more accurate to change 'severity' field in triage_records schema to 'status'.
  - It may be more accurate to change 'positions' object, context and schema to 'strategy leg'?
## 4. UI dashboard enhancements
### 4.1 Workflows
  - Triage page > Action decision (Quick action)
  - Triage page > Select trigger > Evaluate options > Action decision
### 4.2 Views
  - `app/strategies/[strategyId]` 
    - `Performance` view (like Portfolio view but for a single strategy) `app/strategies/[strategyId]/performance`
      - `Abs Notional` card
      - `Unrealized PnL` card
      - `Pct NAV` card
      - `Open Positions` card
      - `PnL Timeline` sparkline
      - `Abs Notional` sparkline
      - `Open Positions` table
    - `Triage` view (rename `Alerts`?) `app/strategies/[strategyId]/triage`
      - `Playbook` card
        - Fields: Strategy Type, State Code, Template, Underlying, Opened (date), Status
      - `Playbook detail` card
        - Fields: State Code, Category, Label, Description, Checklist_items
      - `Triage Flags` list
      - `AI chat` box
    - `Blotter` view (rename `Journal`?) `app/strategies/[strategyId]/blotter`
      - `Blotter` list
      - `Recent Trades` list (perhaps merge with Blotter list, or fold trades in as a type of Blotter item?)
  - `app/blotter`
    - Require a more detailed display of all data captured and written to the db by the blotter record.
### 4.3 Features
  - search feature
