# Flex Ingestion Scheduling - Quick Start

## Already Set Up

✅ **Vercel Cron** - `vercel.json` configured for daily runs at 2 AM UTC  
✅ **GitHub Actions** - `.github/workflows/flex-ingestion.yml` ready to use  
✅ **API Route** - `/api/ingest/flex/automated?all=true` accepts optional authentication

## Quick Setup

### For Vercel Deployments

1. **Deploy to Vercel:**
   ```bash
   vercel --prod
   ```

2. **Optional: Add authentication secret**
   - Add to Vercel environment variables: `CRON_SECRET=your-random-secret`
   - Vercel cron jobs are automatically authenticated, but this adds extra security

3. **Verify cron job:**
   - Go to Vercel Dashboard → Your Project → Cron Jobs
   - Should see "flex-ingestion" scheduled for daily at 2 AM UTC

4. **Test manually:**
   ```bash
   curl -X POST "https://your-app.vercel.app/api/ingest/flex/automated?all=true"
   ```

### For GitHub Actions

1. **Set up secrets:**
   - Go to GitHub repo → Settings → Secrets and variables → Actions
   - Add `APP_URL`: `https://your-app.vercel.app` (or your production URL)
   - Add `CRON_SECRET` (optional): Random secret token

2. **Enable workflow:**
   - Go to Actions tab → "Flex Ingestion" workflow
   - Click "Run workflow" to test manually
   - Workflow will run automatically daily at 2 AM UTC

3. **Test manually:**
   - Actions tab → Flex Ingestion → Run workflow → Run workflow

## Change Schedule

### Vercel Cron

Edit `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/ingest/flex/automated?all=true",
      "schedule": "0 6 * * *"  // Change to 6 AM UTC
    }
  ]
}
```

Cron format: `"minute hour day month day-of-week"`
- `"0 2 * * *"` = Daily at 2 AM UTC
- `"0 6 * * 1-5"` = Weekdays at 6 AM UTC
- `"0 */6 * * *"` = Every 6 hours

### GitHub Actions

Edit `.github/workflows/flex-ingestion.yml`:
```yaml
schedule:
  - cron: '0 6 * * *'  # Change to 6 AM UTC
```

## Security (Optional)

The API route supports optional authentication via `CRON_SECRET`:

1. **Set environment variable:**
   ```bash
   # .env.local
   CRON_SECRET=your-random-secret-token
   ```

2. **Include in requests:**
   ```bash
   curl -X POST "https://your-app.com/api/ingest/flex/automated?all=true" \
     -H "Authorization: Bearer your-random-secret-token"
   ```

3. **For GitHub Actions:**
   - Add `CRON_SECRET` to GitHub secrets
   - Workflow already includes it in the request

**Note:** Vercel cron jobs are automatically authenticated by Vercel, so `CRON_SECRET` is optional for Vercel deployments.

## Verify It's Working

1. **Check process logs:**
   - Go to `/admin/processes` in your app
   - Look for `flex_automated_ingestion` process runs

2. **Check Flex configs:**
   - Go to `/admin/ingestion/flex-configs`
   - Check `lastRunAt` and `lastRunStatus` columns

3. **Check logs:**
   - Vercel: Dashboard → Your Project → Logs
   - GitHub Actions: Actions tab → Flex Ingestion → Latest run

## Troubleshooting

**Cron not running:**
- Verify deployment succeeded
- Check Vercel cron jobs page or GitHub Actions tab
- Ensure at least one Flex config is active

**401 Unauthorized:**
- If using `CRON_SECRET`, ensure it matches in both places
- Vercel cron jobs don't need `CRON_SECRET` (they're auto-authenticated)

**Ingestion fails:**
- Check Flex configs are active
- Verify IBKR credentials in environment variables
- Check process logs for detailed error messages

