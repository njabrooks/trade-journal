# GitHub Actions Setup for Flex Ingestion

This guide helps you set up GitHub Actions to run Flex ingestion daily, even if you're running the app locally.

## How It Works

Instead of calling a production API endpoint, GitHub Actions will:
1. Check out your code
2. Install dependencies
3. Run a standalone script that connects directly to your Supabase database
4. Execute the Flex ingestion logic

This works because your Supabase database is accessible from anywhere, not just localhost.

## Setup Steps

### 1. Add Required Secrets to GitHub

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

**Important:** Use **Repository secrets** (not Environment secrets). Repository secrets are available to all workflows in your repository, which is what you need for this scheduled workflow.

Add these secrets:

#### Database Connection (Required)
- **Name:** `DATABASE_URL_POOLER`
- **Value:** Your Supabase **Transaction Pooler** connection string
  - Get it from: Supabase Dashboard → Settings → Database → Connection string
  - Select **"Transaction"** mode (not Session mode)
  - Use the "URI" format
  - Port should be **6543** (transaction pooler)
  - Example: `postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
  
  **Important:** Replace `[PASSWORD]` with your **database password** (not the anon key!)
  - This is the password you set when creating your Supabase project
  - If you forgot it: Supabase Dashboard → Settings → Database → Reset database password
  - The password is different from `NEXT_PUBLIC_SUPABASE_ANON_KEY` (which is for client-side queries)
  
  **Why Transaction Pooler?**
  - Better for serverless/ephemeral connections (like GitHub Actions)
  - More efficient for short-lived scripts
  - Designed for one-off connections that don't need session state

- **Name:** `DATABASE_URL_DIRECT` (Optional, only if you want to use direct connection)
- **Value:** Your Supabase direct connection string
  - Use the "Direct connection" mode (URI format)

- **Name:** `USE_DIRECT_CONNECTION` (Optional)
- **Value:** `false` (or `true` if you want to use direct connection)

#### IBKR Flex API Credentials (Required)
- **Name:** `IBKR_FLEX_TOKEN`
- **Value:** Your IBKR Flex Web Service token

- **Name:** `IBKR_FLEX_POSITIONS_QUERY_ID`
- **Value:** Your Flex query ID for positions

- **Name:** `IBKR_FLEX_TRADES_QUERY_ID`
- **Value:** Your Flex query ID for trades

- **Name:** `IBKR_FLEX_BASE_URL` (Optional)
- **Value:** `https://www.interactivebrokers.com/Universal/servlet` (default)

- **Name:** `IBKR_FLEX_WAIT_MS` (Optional)
- **Value:** `3000` (default, milliseconds to wait before fetching results)

### 2. Install tsx (if not already installed)

The script uses `tsx` to run TypeScript directly. Install it:

```bash
npm install --save-dev tsx
```

Or if you prefer to use it globally:
```bash
npm install -g tsx
```

### 3. Test the Script Locally

Before relying on GitHub Actions, test the script locally:

```bash
# Make sure your .env.local has all the required variables
npx tsx scripts/run-flex-ingestion.ts
```

This should run the ingestion and show you the results.

### 4. Push to GitHub

The workflow file (`.github/workflows/flex-ingestion.yml`) is already configured. Just commit and push:

```bash
git add .github/workflows/flex-ingestion.yml scripts/run-flex-ingestion.ts package.json
git commit -m "Add GitHub Actions workflow for Flex ingestion"
git push
```

### 5. Verify the Workflow

1. Go to your GitHub repository
2. Click the **Actions** tab
3. You should see "Flex Ingestion" workflow
4. Click on it and then click **"Run workflow"** to test manually
5. Watch it run and check the logs

## Schedule Customization

The workflow is set to run daily at 2 AM UTC. To change it:

1. Edit `.github/workflows/flex-ingestion.yml`
2. Find the `schedule` section:
   ```yaml
   schedule:
     - cron: '0 2 * * *'  # Daily at 2 AM UTC
   ```
3. Change the cron expression:
   - `'0 2 * * *'` = Daily at 2 AM UTC
   - `'0 6 * * *'` = Daily at 6 AM UTC
   - `'0 6 * * 1-5'` = Weekdays at 6 AM UTC
   - `'0 */6 * * *'` = Every 6 hours

Cron format: `minute hour day month day-of-week`

## Manual Trigger

You can manually trigger the workflow anytime:
1. Go to **Actions** tab
2. Click **"Flex Ingestion"** workflow
3. Click **"Run workflow"** button
4. Select branch and click **"Run workflow"**

## Monitoring

### Check Workflow Runs
- Go to **Actions** tab → **Flex Ingestion** → Click on a run to see logs

### Check Ingestion Results
- Go to your app at `/admin/ingestion/flex-configs`
- Check the `lastRunAt` and `lastRunStatus` columns
- Or go to `/admin/processes` to see process logs

## Troubleshooting

### Workflow fails with "DATABASE_URL_POOLER must be set"
- Make sure you added `DATABASE_URL_POOLER` to GitHub secrets
- Check that the secret name matches exactly (case-sensitive)

### Workflow fails with "FLEX_TOKEN is required"
- Make sure you added `IBKR_FLEX_TOKEN` to GitHub secrets
- Or ensure your Flex configs in the database have `flexToken` set

### Script works locally but fails in GitHub Actions
- Check that all required secrets are set in GitHub
- Verify the connection string format (should be a full PostgreSQL URI)
- Check the workflow logs for detailed error messages

### "tsx: command not found"
- Make sure `tsx` is in your `package.json` devDependencies
- The workflow runs `npm ci` which installs all dependencies

## Security Notes

- All secrets are encrypted by GitHub and only accessible during workflow runs
- Secrets are never exposed in logs (GitHub automatically redacts them)
- The script connects directly to your Supabase database (which is already accessible from the internet)
- No production URL or localhost access needed

