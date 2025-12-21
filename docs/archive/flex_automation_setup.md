# Automated Flex Ingestion Setup

This document describes how to set up automated Flex ingestion using IBKR Flex Web Service API.

## Overview

Automated Flex ingestion fetches Flex query results from IBKR Flex Web Service API on a schedule and processes them through the existing ingestion pipeline. This eliminates the need for manual CSV uploads.

## Prerequisites

1. **IBKR Flex Web Service Token**: Obtain your FLEX token from IBKR Client Portal
   - Go to Account Management → Flex Web Service
   - Generate or copy your FLEX token
   
2. **Flex Query IDs**: Create Flex queries in IBKR Client Portal
   - Positions Query: Should include POST, EQUT, MTMP sections
   - Trades Query: Should include TRNT section
   - Note the Query ID for each query

## Setup Steps

### 1. Configure Flex Query Configs

Use the admin UI at `/admin/ingestion/flex-configs` to add Flex query configurations:

- **Query Name**: Descriptive name (e.g., "Daily Positions", "Daily Trades")
- **Query Type**: "positions" or "trades"
- **FLEX Token**: Your IBKR Flex Web Service token
- **Query ID**: The ID of your Flex query
- **Account**: Select the account this query belongs to
- **Schedule Cron** (optional): Cron expression for scheduled runs (e.g., "0 2 * * *" for daily at 2 AM)

### 2. Test Manual Run

Test the configuration by running a manual ingestion:

```bash
# Run specific config
curl -X POST "https://your-app.com/api/ingest/flex/automated?configId={config-id}"

# Run all active configs
curl -X POST "https://your-app.com/api/ingest/flex/automated?all=true"
```

### 3. Set Up Scheduled Automation

Choose one of the following methods:

#### Option A: Vercel Cron Jobs (Recommended for Vercel deployments)

The `vercel.json` file is already configured. It will run daily at 2 AM UTC.

**To customize the schedule:**
- Edit `vercel.json` and change the `schedule` field
- Cron format: `"minute hour day month day-of-week"`
- Example: `"0 2 * * *"` = daily at 2 AM UTC
- Example: `"0 6 * * 1-5"` = weekdays at 6 AM UTC

**Optional: Add authentication**
Add to your `.env.local` (and Vercel environment variables):
```bash
CRON_SECRET=your-secret-token-here
```

The API route will check for this secret if set. Vercel cron jobs automatically include authentication headers, but you can add this for extra security.

**Deploy to Vercel:**
```bash
vercel --prod
```

#### Option B: GitHub Actions (Recommended for GitHub-hosted projects)

The `.github/workflows/flex-ingestion.yml` file is already configured.

**Setup:**
1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `APP_URL`: Your production app URL (e.g., `https://your-app.vercel.app`)
   - `CRON_SECRET` (optional): Secret token for authentication

**To customize the schedule:**
- Edit `.github/workflows/flex-ingestion.yml`
- Change the cron expression: `'0 2 * * *'` = daily at 2 AM UTC
- You can also manually trigger from GitHub Actions tab → "Run workflow"

#### Option C: External Cron Service

Use a service like:
- **Cron-job.org**: Set up HTTP request to your API endpoint
- **EasyCron**: Scheduled HTTP requests
- **Your own server**: Use system cron

**Example system cron (Linux/Mac):**
```bash
# Add to crontab: crontab -e
0 2 * * * curl -X POST "https://your-app.com/api/ingest/flex/automated?all=true" -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Example cron-job.org:**
- URL: `https://your-app.com/api/ingest/flex/automated?all=true`
- Method: POST
- Headers: `Authorization: Bearer YOUR_CRON_SECRET` (if using CRON_SECRET)

#### Option C: Supabase Edge Function + pg_cron

If using Supabase, you can set up a database function and pg_cron:

```sql
-- Create Edge Function that calls the API endpoint
-- Then schedule with pg_cron:
SELECT cron.schedule(
  'flex-ingestion-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-app.com/api/ingest/flex/automated?all=true',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

## API Endpoints

### POST `/api/ingest/flex/automated`

Runs automated Flex ingestion.

**Query Parameters:**
- `configId` (optional): Run specific config by ID
- `all` (optional): Set to `true` to run all active configs

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 2,
    "success": 2,
    "failures": 0
  },
  "results": [
    {
      "configId": "...",
      "queryName": "Daily Positions",
      "queryType": "positions",
      "success": true,
      "summary": { ... }
    }
  ]
}
```

### GET `/api/ingest/flex/automated`

Lists all Flex query configurations.

**Query Parameters:**
- `activeOnly` (optional): Set to `true` to show only active configs

**Response:**
```json
{
  "configs": [
    {
      "id": "...",
      "accountId": "...",
      "queryName": "Daily Positions",
      "queryType": "positions",
      "isActive": true,
      "scheduleCron": "0 2 * * *",
      "lastRunAt": "2024-01-15T02:00:00Z",
      "lastRunStatus": "success",
      "lastRunError": null
    }
  ]
}
```

## Monitoring

- Check the `/admin/processes` page to view ingestion runs
- Each automated run creates a process record with status and results
- Failed runs are logged with error messages in the `flex_query_configs.last_run_error` field

## Troubleshooting

### Common Issues

1. **"FLEX_TOKEN and QUERY_ID are required"**
   - Ensure the config has both token and query ID set

2. **"Flex API returned an error page"**
   - Verify your FLEX token is valid and not expired
   - Check that the Query ID is correct
   - Ensure the Flex query is active in IBKR Client Portal

3. **"Empty response from Flex API"**
   - The query may not have data for the requested date range
   - Check your Flex query settings in IBKR

4. **Ingestion fails after API call succeeds**
   - Check the ingestion logs in `/admin/processes`
   - Verify the CSV format matches expected Flex format
   - Check that account IDs match between Flex data and database

## Security Notes

- FLEX tokens are stored in the database - ensure proper access controls
- Consider encrypting FLEX tokens at rest
- Use environment variables for sensitive configuration if possible
- Restrict access to the admin UI for managing configs

