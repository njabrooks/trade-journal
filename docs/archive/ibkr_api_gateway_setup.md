# IBKR API Gateway Setup

This guide covers setting up the IBKR Client Portal Gateway (clientportal.gw) for direct API access to IBKR data.

## Prerequisites

1. **Java 1.8 update 192+ or OpenJDK 11+**
   - Check if installed: `java -version`
   - If not installed:
     - macOS: `brew install openjdk@11` or download from [Oracle](https://www.oracle.com/java/technetwork/java/javase/downloads/jre8-downloads-2133155.html)
     - After installing, you may need to set JAVA_HOME:
       ```bash
       export JAVA_HOME=$(/usr/libexec/java_home -v 11)
       export PATH=$JAVA_HOME/bin:$PATH
       ```

2. **IBKR Account** with API access enabled

## Setup Steps

### 1. Navigate to Gateway Directory

```bash
cd ~/Desktop/clientportal.gw
```

### 2. Start the Gateway

```bash
./bin/run.sh root/conf.yaml
```

You should see output like:
```
Server listening on port 5001
```

**Note**: The gateway runs on port 5001 with SSL enabled by default (port 5000 is often used by macOS ControlCenter).

### 3. Authenticate

1. Open your browser and go to: **https://localhost:5001/**
2. You'll see the IBKR login page
3. Log in with your IBKR credentials
4. Once authenticated, you can close the browser

### 4. Test the API

Once authenticated, you can test the API endpoints:

```bash
# Check authentication status
curl -k https://localhost:5001/v1/api/iserver/auth/status

# Get account info
curl -k https://localhost:5001/v1/api/portfolio/accounts

# Get market data snapshot (example: SPY)
curl -k "https://localhost:5001/v1/api/iserver/marketdata/snapshot?conids=756733"
```

**Note**: The `-k` flag is needed because the gateway uses a self-signed SSL certificate.

## API Documentation

- **Swagger YAML**: https://gdcdyn.interactivebrokers.com/portal.proxy/v1/portal/swagger/swagger?format=yaml
- **Interactive Docs**: https://interactivebrokers.github.io/cpwebapi
- **ReDoc**: https://rebilly.github.io/ReDoc/?url=https://gdcdyn.interactivebrokers.com/portal.proxy/v1/portal/swagger/swagger?format=yaml

## Key Endpoints for This Project

Based on the requirements in `FUTURE_ENHANCEMENTS.md`, you'll need:

### Spot Prices (✅ TESTED & WORKING)
- **Market Data Snapshot**: `/v1/api/iserver/marketdata/snapshot?conids={conid}&fields=31,84,86`
  - Field 31: Last Price (spot)
  - Field 84: Bid Price
  - Field 86: Ask Price
  - Example: SPY (756733) returns last price `676.03`
  - Need to find contract IDs (conids) for your underlyings

### Historical Data
- **Historical Data**: `/v1/api/iserver/marketdata/history?conid={conid}&period={period}&bar={bar}`
  - Returns historical price data
  - Can be used for historical spot prices

### IV Data (✅ TESTED & WORKING)
- **Underlying IV (30-day forward)**: `/v1/api/iserver/marketdata/snapshot?conids={conid}&fields=7283`
  - Field 7283: "Option Implied Vol. %" - 30-day forward IV based on option prices
  - Example: TSLA (76792991) returns `47.700%`
  - **This is the IV30 data needed for the project**
  
- **Specific Option Strike IV**: `/v1/api/iserver/marketdata/snapshot?conids={optionConid}&fields=7633`
  - Field 7633: "Implied Vol. %" for specific strike
  - Example: TSLA option 260618C00350000 (675955479) returns `58%`
  
- **Additional Option Data**: Fields 7308-7311 (Greeks: Delta, Gamma, Theta, Vega)

### Contract Search
- **Search Contracts**: `/v1/api/iserver/secdef/search?symbol={symbol}`
  - Find contract IDs (conids) for symbols
  - Essential for all other API calls

## Configuration

The default config (`root/conf.yaml`) is set up for:
- **Port**: 5001 (changed from 5000 to avoid conflict with macOS ControlCenter)
- **SSL**: Enabled (self-signed cert)
- **CORS**: Enabled for all origins
- **IP Allowlist**: 127.0.0.1, 192.*, 131.216.*

You can modify `root/conf.yaml` if needed:
- Change port: `listenPort: 5001`
- Disable SSL: `listenSsl: false` (not recommended)
- Adjust CORS settings

## Running in Background

To run the gateway in the background:

```bash
# Using nohup
nohup ./bin/run.sh root/conf.yaml > gateway.log 2>&1 &

# Or using screen/tmux
screen -S ibkr-gateway
./bin/run.sh root/conf.yaml
# Press Ctrl+A then D to detach
```

## Troubleshooting

### Java Not Found
```bash
# Check if Java is installed
java -version

# If not, install OpenJDK 11
brew install openjdk@11

# Set JAVA_HOME (add to ~/.zshrc or ~/.bash_profile)
export JAVA_HOME=$(/usr/libexec/java_home -v 11)
export PATH=$JAVA_HOME/bin:$PATH
```

### Port Already in Use
If port 5000 is already in use:
1. Change `listenPort` in `root/conf.yaml` to another port (e.g., 5001)
2. Update your API client to use the new port

### Authentication Fails
- Make sure you're using the correct IBKR credentials
- Check that API access is enabled in your IBKR account settings
- Try clearing browser cookies and logging in again

### SSL Certificate Warnings
The gateway uses a self-signed certificate. This is normal. Use `-k` flag with curl or configure your HTTP client to accept self-signed certs.

## IV Data Testing Results

✅ **Confirmed Working:**
- **Underlying IV30**: Field 7283 returns 30-day forward implied volatility (e.g., TSLA: 47.700%)
- **Spot Prices**: Field 31 returns last price (e.g., SPY: 676.03)
- **Option Strike IV**: Field 7633 returns IV for specific option contracts
- **Greeks**: Fields 7308-7311 return Delta, Gamma, Theta, Vega

**Test Examples:**
```bash
# TSLA underlying - get spot and IV30
curl -k "https://localhost:5001/v1/api/iserver/marketdata/snapshot?conids=76792991&fields=31,84,86,7283"

# TSLA option - get strike-specific IV
curl -k "https://localhost:5001/v1/api/iserver/marketdata/snapshot?conids=675955479&fields=31,84,86,7633"
```

## Authentication Constraints ⚠️

**Important**: IBKR gateway requires manual authentication and has session limitations:

- **Session Timeout**: 5 minutes of inactivity (requires `/tickle` every minute)
- **Daily Re-authentication**: Maximum 24-hour session (manual login required)
- **No Automation**: IBKR doesn't support automated authentication
- **Single Session**: Only one session per username at a time

**Recommendation**: Use a **local service** rather than GitHub Actions. See `docs/ibkr_local_service_setup.md` for details.

## Next Steps

1. ✅ **IBKR API Client**: Built in `src/lib/services/ibkr/`
2. ✅ **Ingestion Script**: `scripts/ingest-underlyings-ibkr.ts`
3. ✅ **Local Service**: `scripts/ibkr-gateway-service.ts` (maintains connection, runs daily ingestion)
4. **Setup Local Service**: Follow `docs/ibkr_local_service_setup.md` to run as PM2/launchd/systemd service

## Integration with Project

The gateway will be used to:
- Replace Option Strategist scraping for IV/spot data
- Provide daily data that matches position snapshot dates
- Enable historical backfilling for past dates
- Improve accuracy of ITM calculations in triage

See `docs/FUTURE_ENHANCEMENTS.md` section 10a for full requirements.

