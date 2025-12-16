# Massive.com MCP Server Setup for Cursor

This guide will help you set up the Massive.com MCP server in Cursor to query financial market data.

## Prerequisites

✅ **Python 3.10+** - Already installed  
✅ **Astral UV** - Installed at `/Users/twotrees/.local/bin/uvx`  
⚠️ **Massive.com API Key** - You'll need to obtain this from [Massive.com](https://massive.com)

## Step 1: Get Your Massive.com API Key

1. Sign up or log in to [Massive.com](https://massive.com)
2. Navigate to your API settings
3. Copy your API key

## Step 2: Configure MCP Server in Cursor

### Option A: Using Cursor Settings UI (Recommended)

1. Open Cursor IDE
2. Press `⇧+⌘+J` (Shift + Command + J) to open Cursor Settings
3. Navigate to the **MCP** tab
4. Click **"Add MCP Server"**
5. Add the following configuration:

```json
{
  "mcpServers": {
    "massive": {
      "command": "/Users/twotrees/.local/bin/uvx",
      "args": [
        "--from",
        "git+https://github.com/massive-com/mcp_massive@v0.7.0",
        "mcp_massive"
      ],
      "env": {
        "MASSIVE_API_KEY": "paFVaI_60iIdjP0zUBUykVj5RgOMzpvl",
        "HOME": "/Users/twotrees"
      }
    }
  }
}
```

**Important**: Replace `YOUR_API_KEY_HERE` with your actual Massive.com API key.

### Option B: Manual Configuration File

If the UI method doesn't work, you can manually create/edit the MCP configuration file. The location may vary, but try:

```bash
# Check if this directory exists
ls -la ~/Library/Application\ Support/Cursor/User/globalStorage/
```

The configuration should be in a JSON file in the globalStorage directory or in Cursor's settings.

## Step 3: Restart Cursor

After configuring the MCP server:
1. Completely quit Cursor (⌘+Q)
2. Reopen Cursor
3. Open your workspace

## Step 4: Verify Installation

Once Cursor restarts, you should be able to use the Massive MCP server. Test it by asking:

- "Get the latest price for AAPL stock"
- "Show me yesterday's trading volume for MSFT"
- "What were the biggest stock market gainers today?"
- "Get me the latest crypto market data for BTC-USD"

## Available Tools

The Massive MCP server provides access to all Massive.com API endpoints, including:

- `get_aggs` - Stock aggregates (OHLC) data
- `list_trades` - Historical trade data
- `get_last_trade` - Latest trade for a symbol
- `list_ticker_news` - Recent news articles for tickers
- `get_snapshot_ticker` - Current market snapshot
- `get_market_status` - Market status and trading hours
- `list_stock_financials` - Fundamental financial data
- And many more...

## Troubleshooting

### uvx not found
If you get an error that `uvx` is not found:
1. Make sure `uvx` is in your PATH: `which uvx`
2. If not, add it: `export PATH="$HOME/.local/bin:$PATH"`
3. Use the full path in the config: `/Users/twotrees/.local/bin/uvx`

### MCP Server not connecting
1. Check that your API key is correct
2. Verify the `HOME` environment variable is set correctly
3. Check Cursor's output/logs for error messages
4. Try running the server manually to test:
   ```bash
   MASSIVE_API_KEY=your_key_here /Users/twotrees/.local/bin/uvx --from git+https://github.com/massive-com/mcp_massive@v0.7.0 mcp_massive
   ```

### Version Updates
The latest version is `v0.7.0`. To update, change the version in the `args` array:
```json
"git+https://github.com/massive-com/mcp_massive@v0.7.0"
```

## References

- [Massive.com MCP Server GitHub](https://github.com/massive-com/mcp_massive)
- [Massive.com Documentation](https://massive.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io)

