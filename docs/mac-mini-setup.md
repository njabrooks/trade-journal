# Mac Mini Setup Guide

This guide covers setting up the trade-journal system on Mac Mini as the primary local-first data server.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    MAC MINI (Primary - Always On)           │
├─────────────────────────────────────────────────────────────┤
│  Local Supabase @ 127.0.0.1:54322                          │
│                                                             │
│  Scheduled Jobs (launchd):                                  │
│  ├── Flex ingestion: 4 AM, 6 AM, 12 PM                     │
│  ├── Massive ingestion: 4:30 PM                            │
│  └── Push to remote: 11 PM                                 │
│                                                             │
│  All activity happens here:                                 │
│  ├── Ingestion → Derived computations → User edits         │
│  └── Claude skills → Research uploads                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Daily backup (11 PM)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              REMOTE SUPABASE (Backup + Travel)              │
├─────────────────────────────────────────────────────────────┤
│  Mirror of local (pushed nightly)                          │
│  Used when: Mac Mini down OR traveling                     │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- macOS (Apple Silicon recommended)
- Homebrew installed
- Git access to the repository

## Step 1: Install Docker Desktop

1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/
2. Install and launch Docker Desktop
3. Grant required permissions (File Sharing, etc.)
4. Verify installation:

```bash
docker --version
docker info
```

## Step 2: Install PostgreSQL 17 Client Tools

The sync scripts require `psql` and `pg_dump` matching the Supabase server version (17.x):

```bash
brew install postgresql@17
```

Verify the tools are available:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql --version
/opt/homebrew/opt/postgresql@17/bin/pg_dump --version
```

## Step 3: Clone and Setup Project

```bash
cd ~/Desktop
git clone <repository-url> trade-journal
cd trade-journal
npm install
```

## Step 4: Configure Environment

Copy `.env.local` from your laptop or create it with these variables:

```bash
# Database - Local Supabase (primary)
DATABASE_URL_POOLER=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_URL_DIRECT=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Database - Remote Supabase (for backup sync)
DATABASE_URL_REMOTE=postgresql://postgres.xxx:password@aws-1-eu-north-1.pooler.supabase.com:6543/postgres

USE_DIRECT_CONNECTION=false

# IBKR Flex API
IBKR_FLEX_TOKEN=<your-token>
IBKR_FLEX_POSITIONS_QUERY_ID=<query-id>
IBKR_FLEX_TRADES_QUERY_ID=<query-id>
IBKR_FLEX_BASE_URL=https://gdcdyn.interactivebrokers.com/Universal/servlet

# Massive.com
MASSIVE_API_KEY=<api-key>
MASSIVE_API_BASE_URL=https://api.massive.com

# (Add other keys as needed: IBKR Gateway, Perplexity, etc.)
```

## Step 5: Start Local Supabase

```bash
cd ~/Desktop/trade-journal
npx supabase start
```

This will:
- Pull required Docker images (first time only)
- Start PostgreSQL, PostgREST, Auth, and other Supabase services
- Database available at `127.0.0.1:54322`

Verify Supabase is running:

```bash
npx supabase status
```

## Step 6: Restore Data from Remote

If this is a fresh setup, restore data from remote Supabase:

```bash
# Dry run first (see what would be restored)
npx tsx scripts/restore-from-remote.ts --dry-run

# Actually restore (requires confirmation)
npx tsx scripts/restore-from-remote.ts --confirm
```

This pulls all data from remote Supabase to your local instance.

## Step 7: Install Scheduled Jobs (launchd)

```bash
./launchd/install.sh
```

This installs three scheduled jobs:

| Job | Schedule | Description |
|-----|----------|-------------|
| `com.trade-journal.flex-ingestion` | 4 AM, 6 AM, 12 PM | IBKR Flex data ingestion |
| `com.trade-journal.massive-ingestion` | 4:30 PM | Massive.com IV/spot data |
| `com.trade-journal.push-to-remote` | 11 PM | Backup local → remote |

Check status:

```bash
./launchd/install.sh --status
```

## Step 8: Verify Setup

### Test local database connection:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "SELECT COUNT(*) FROM trades;"
```

### Test ingestion manually:

```bash
# Test Flex ingestion
npx tsx scripts/run-flex-ingestion.ts

# Test push to remote (dry run)
npx tsx scripts/push-to-remote.ts --dry-run
```

### Check launchd job logs:

```bash
tail -f /tmp/flex-ingestion.log
tail -f /tmp/massive-ingestion.log
tail -f /tmp/push-to-remote.log
```

## Managing Scheduled Jobs

### Check status
```bash
./launchd/install.sh --status
```

### Remove all jobs
```bash
./launchd/install.sh --remove
```

### Reinstall after updates
```bash
git pull
./launchd/install.sh
```

### Manually trigger a job
```bash
launchctl start com.trade-journal.flex-ingestion
launchctl start com.trade-journal.massive-ingestion
launchctl start com.trade-journal.push-to-remote
```

## Keep Mac Mini Awake

For scheduled jobs to run reliably, prevent sleep:

1. **System Settings → Energy Saver**:
   - Disable "Put hard disks to sleep when possible"
   - Enable "Prevent automatic sleeping when the display is off"
   - Enable "Wake for network access"

2. Or use `caffeinate` (temporary):
   ```bash
   caffeinate -s  # Prevent sleep while running
   ```

3. Or create a permanent no-sleep setting via `pmset`:
   ```bash
   sudo pmset -c sleep 0       # Never sleep on AC power
   sudo pmset -c displaysleep 0  # Never sleep display on AC
   ```

## Troubleshooting

### Supabase won't start
```bash
# Check Docker is running
docker info

# Restart Supabase
npx supabase stop
npx supabase start
```

### Push/restore fails with connection error
```bash
# Verify local Supabase is running
npx supabase status

# Test connection
/opt/homebrew/opt/postgresql@17/bin/psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "SELECT 1;"
```

### Schema mismatch between local and remote
If local has schema changes not on remote, sync the schema:

```bash
# Dump local schema
/opt/homebrew/opt/postgresql@17/bin/pg_dump "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  --schema-only --clean --if-exists --schema=public \
  > /tmp/schema.sql

# Apply to remote (careful - this drops and recreates!)
/opt/homebrew/opt/postgresql@17/bin/psql "$DATABASE_URL_REMOTE" < /tmp/schema.sql
```

### launchd jobs not running
```bash
# Check if loaded
launchctl list | grep trade-journal

# Reload jobs
./launchd/install.sh --remove
./launchd/install.sh
```

## When Traveling

When away from Mac Mini, switch to remote Supabase:

1. Edit `.env.local` on your laptop:
   ```bash
   # Comment out local, uncomment remote
   # DATABASE_URL_POOLER=postgresql://postgres:postgres@127.0.0.1:54322/postgres
   DATABASE_URL_POOLER=postgresql://postgres.xxx:password@aws-1-eu-north-1.pooler.supabase.com:6543/postgres
   ```

2. When back, restore from remote if needed:
   ```bash
   npx tsx scripts/restore-from-remote.ts --confirm
   ```

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/push-to-remote.ts` | Push local → remote (backup) |
| `scripts/restore-from-remote.ts` | Pull remote → local (disaster recovery) |
| `launchd/install.sh` | Install/manage scheduled jobs |
| `launchd/com.trade-journal.*.plist` | launchd job definitions |
| `.github/workflows/*.yml` | GitHub Actions (disabled, emergency backup only) |
