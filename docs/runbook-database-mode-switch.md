# Runbook: Switching Between Local and Remote Supabase

This runbook documents how to switch the trade-journal application between local-first mode (Mac Mini) and remote-first mode (Supabase cloud).

## Current Architecture (Local-First)

```
Mac Mini (Primary)                    Remote Supabase (Backup)
├── Local Supabase @ :54322    ──────────────────────>  Daily push
├── Launchd scheduled jobs                              (disaster recovery only)
├── IBKR Gateway
└── Claude Code skills
         ↑
         │ Tailscale
         ↓
    MacBook Pro
    (development)
```

## Target Architecture (Remote-First)

```
Remote Supabase (Primary)
         ↑
         │
    ┌────┴────┐
    │         │
GitHub    MacBook Pro / Mac Mini
Actions   (development + Gateway)
```

---

## Switching: Local → Remote

### Prerequisites
- [ ] Remote Supabase is in sync (run `npx tsx scripts/push-to-remote.ts` first)
- [ ] GitHub secrets are configured (see Step 3)

### Step 1: Update Environment Variables

**On MacBook Pro** - Edit `.env.local`:
```bash
# Comment out local connection
# DATABASE_URL_POOLER=postgresql://postgres:postgres@100.75.22.47:54322/postgres
# DATABASE_URL_DIRECT=postgresql://postgres:postgres@100.75.22.47:54322/postgres

# Use remote Supabase
DATABASE_URL_POOLER=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:5432/postgres
```

**On Mac Mini** - Same changes to `.env.local` (if running dev server there).

### Step 2: Disable Launchd Jobs on Mac Mini

SSH into Mac Mini and run:
```bash
cd ~/Desktop/trade-journal
./launchd/install.sh --remove
```

This stops:
- Flex ingestion (04:00, 06:00, 08:00, 12:00 UTC)
- Massive ingestion (21:30 UTC)
- Push-to-remote (07:00 UTC)
- Supabase auto-start

### Step 3: Configure GitHub Secrets

Go to: `https://github.com/<owner>/trade-journal/settings/secrets/actions`

Required secrets:
| Secret | Description |
|--------|-------------|
| `DATABASE_URL_POOLER` | Remote Supabase pooler connection string |
| `IBKR_FLEX_TOKEN` | IBKR Flex Web Service token |
| `IBKR_FLEX_POSITIONS_QUERY_ID` | Flex query ID for positions |
| `IBKR_FLEX_TRADES_QUERY_ID` | Flex query ID for trades |
| `MASSIVE_API_KEY` | Massive.com API key |

### Step 4: Enable GitHub Actions Schedules

Edit `.github/workflows/flex-ingestion.yml`:
```yaml
on:
  schedule:
    # Uncomment these lines:
    - cron: '0 4 * * 1-5'   # 4 AM UTC weekdays
    - cron: '0 6 * * 1-5'   # 6 AM UTC weekdays
    - cron: '0 8 * * 1-5'   # 8 AM UTC weekdays
    - cron: '0 12 * * 1-5'  # 12 PM UTC weekdays
  workflow_dispatch:  # Keep manual trigger
```

Edit `.github/workflows/massive-ingestion.yml`:
```yaml
on:
  schedule:
    # Uncomment:
    - cron: '30 21 * * 1-5'  # 21:30 UTC (4:30 PM ET) weekdays
  workflow_dispatch:
```

Commit and push these changes.

### Step 5: Handle IBKR Gateway (Choose One)

**Option A: Degraded Mode (Simplest)**
- Accept that IBKR Gateway features won't work
- System falls back to Yahoo Finance → Massive for spot/IV data
- No conid resolution for new underlyings

**Option B: Hybrid Mode (Recommended)**
- Keep Mac Mini running with IBKR Gateway
- Gateway-dependent API calls still work when Mac Mini is online
- Mac Mini connects to remote Supabase (same as MacBook Pro)

**Option C: Manual Gateway Mode**
- Run Gateway on MacBook Pro when needed
- Manually trigger Gateway-dependent operations

### Step 6: Verify

```bash
# Test database connection
source .env.local && psql "$DATABASE_URL_POOLER" -c "SELECT COUNT(*) FROM trades;"

# Manually trigger GitHub Actions to verify
# Go to Actions tab → Select workflow → Run workflow

# Check Claude Code skills still work
/read-theses
```

---

## Switching: Remote → Local

### Prerequisites
- [ ] Mac Mini is accessible (Tailscale connected or local network)
- [ ] Local Supabase is running on Mac Mini

### Step 1: Sync Remote → Local (if needed)

If remote has newer data:
```bash
# On Mac Mini
npx tsx scripts/restore-from-remote.ts --dry-run  # Preview
npx tsx scripts/restore-from-remote.ts --confirm  # Execute
```

### Step 2: Update Environment Variables

**On MacBook Pro** - Edit `.env.local`:
```bash
# Use local Supabase via Tailscale
DATABASE_URL_POOLER=postgresql://postgres:postgres@100.75.22.47:54322/postgres
DATABASE_URL_DIRECT=postgresql://postgres:postgres@100.75.22.47:54322/postgres

# Keep remote for sync script
DATABASE_URL_REMOTE=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres
```

**On Mac Mini** - Edit `.env.local`:
```bash
# Use localhost
DATABASE_URL_POOLER=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_URL_DIRECT=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Keep remote for sync script
DATABASE_URL_REMOTE=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres
```

### Step 3: Disable GitHub Actions Schedules

Edit `.github/workflows/flex-ingestion.yml` and `.github/workflows/massive-ingestion.yml`:
- Comment out the `schedule` cron entries
- Keep `workflow_dispatch` for manual runs

Commit and push.

### Step 4: Install Launchd Jobs on Mac Mini

SSH into Mac Mini:
```bash
cd ~/Desktop/trade-journal
./launchd/install.sh
./launchd/install.sh --status  # Verify
```

### Step 5: Start Local Supabase (if not running)

```bash
cd ~/Desktop/trade-journal
npx supabase start
```

Or it will auto-start on login via the launchd job.

### Step 6: Verify

```bash
# Test local connection
source .env.local && psql "$DATABASE_URL_POOLER" -c "SELECT COUNT(*) FROM trades;"

# Check logs for scheduled jobs
tail -f logs/flex-ingestion.log
tail -f logs/massive-ingestion.log

# Test push to remote
npx tsx scripts/push-to-remote.ts --dry-run
```

---

## Quick Reference

| Component | Local-First | Remote-First |
|-----------|-------------|--------------|
| Primary DB | Mac Mini :54322 | Supabase Cloud |
| Ingestion | Launchd jobs | GitHub Actions |
| IBKR Gateway | ✅ Full support | ⚠️ Degraded/Hybrid |
| Push-to-remote | Daily backup | Not needed |
| Tailscale | Required for dev | Not required |
| Claude Code | Works anywhere | Works anywhere |

## Troubleshooting

### "Connection refused" on MacBook Pro
- Check Tailscale is connected: `tailscale status`
- Verify Mac Mini IP: `ping 100.75.22.47`
- Check Supabase is running on Mac Mini: `docker ps | grep supabase`

### GitHub Actions failing
- Check secrets are set correctly
- Verify workflow files have correct syntax
- Check Actions logs for specific errors

### Schema mismatch after switch
Run the sync migration on whichever database is behind:
```bash
psql "$DATABASE_URL_..." -f migrations/sync-remote-schema.sql
```

### IBKR Gateway not connecting
- Gateway requires manual authentication via browser
- Session expires periodically - re-authenticate at `https://localhost:5000`
