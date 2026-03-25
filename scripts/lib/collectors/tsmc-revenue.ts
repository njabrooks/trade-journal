/**
 * TSMC Monthly Revenue collector via Chrome DevTools Protocol.
 *
 * Extracts monthly consolidated revenue from TSMC's investor relations page
 * by navigating Chrome Debug (port 9222) and reading the rendered table.
 * The page is Cloudflare-protected + SPA-rendered, so direct HTTP fetch won't work.
 *
 * Requires Chrome Debug running on localhost:9222 with a persistent profile
 * that has already passed the Cloudflare challenge for investor.tsmc.com.
 *
 * Revenue is reported in NT$ millions. YoY change is provided by TSMC directly.
 *
 * explicit_details shape:
 * {
 *   dataSource: "tsmc_revenue",
 *   metric: "yoy_growth",             // YoY % change (reported by TSMC)
 *   threshold: 0,                     // e.g., 0% = growth turns negative
 *   thresholdUnit: "% YoY",
 *   thresholdDirection: "below",      // triggers when growth FALLS BELOW threshold
 *   checkFrequency: "weekly",
 *   label: "TSMC Monthly Revenue"
 * }
 */

export interface TSMCRevenueSnapshot {
  observedValue: number;
  thresholdValue: number;
  pctToThreshold: number;
  unit: string;
  evidenceSummary?: string;
}

interface TSMCMonthlyData {
  month: string;        // e.g. "Jan.", "Feb."
  revenue: number;      // NT$ millions
  yoyChange: number;    // % e.g. 36.8
  year: number;
}

const CDP_URL = 'http://127.0.0.1:9222';
const TSMC_BASE = 'https://investor.tsmc.com/english/monthly-revenue';

/**
 * Connect to Chrome Debug, navigate to a TSMC revenue page, and extract table data.
 */
async function extractTSMCTable(year: number): Promise<TSMCMonthlyData[]> {
  // Get the current tab or find a TSMC tab
  const tabsRes = await fetch(`${CDP_URL}/json`);
  const tabs = await tabsRes.json() as Array<{ url: string; webSocketDebuggerUrl: string; id: string }>;

  let tab = tabs.find(t => t.url.includes('investor.tsmc.com'));
  if (!tab) {
    // Use the first tab
    tab = tabs[0];
  }

  if (!tab?.webSocketDebuggerUrl) {
    console.warn('  TSMC: no Chrome Debug tab available');
    return [];
  }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('CDP timeout after 30s'));
    }, 30000);

    let msgId = 0;
    const pending = new Map<number, (result: unknown) => void>();

    function send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
      return new Promise((res) => {
        const id = ++msgId;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)!(msg.result);
        pending.delete(msg.id);
      }
    };

    ws.onopen = async () => {
      try {
        // Navigate to the year page
        await send('Page.navigate', { url: `${TSMC_BASE}/${year}` });

        // Wait for page to load (Cloudflare challenge + SPA render)
        await new Promise(r => setTimeout(r, 8000));

        // Extract table data via JavaScript evaluation
        const evalResult = await send('Runtime.evaluate', {
          expression: `(() => {
            const tables = document.querySelectorAll('table');
            if (!tables.length) return JSON.stringify([]);
            const rows = [];
            tables[0].querySelectorAll('tr').forEach(tr => {
              const cells = [];
              tr.querySelectorAll('td, th').forEach(td => cells.push(td.textContent.trim()));
              if (cells.length >= 2) rows.push(cells);
            });
            return JSON.stringify(rows);
          })()`,
          returnByValue: true,
        }) as { result: { value: string } };

        const rows = JSON.parse(evalResult.result.value) as string[][];

        // Parse table rows into structured data
        const months: TSMCMonthlyData[] = [];
        const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

        for (const row of rows) {
          const monthStr = row[0]?.trim();
          if (!monthNames.includes(monthStr)) continue;

          const revenueStr = row[1]?.replace(/,/g, '').trim();
          const yoyStr = row[2]?.replace(/%/g, '').trim();

          if (!revenueStr || !yoyStr) continue; // Skip empty future months

          const revenue = parseFloat(revenueStr);
          const yoyChange = parseFloat(yoyStr);

          if (!isNaN(revenue) && !isNaN(yoyChange)) {
            months.push({ month: monthStr, revenue, yoyChange, year });
          }
        }

        clearTimeout(timeout);
        ws.close();
        resolve(months);
      } catch (err) {
        clearTimeout(timeout);
        ws.close();
        reject(err);
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err}`));
    };
  });
}

export async function collectTSMCRevenue(
  explicitDetails: Record<string, unknown>
): Promise<TSMCRevenueSnapshot | null> {
  const threshold = explicitDetails.threshold as number | undefined;
  if (threshold === undefined) return null;

  const label = (explicitDetails.label as string) || 'TSMC Monthly Revenue';
  const direction = (explicitDetails.thresholdDirection as string) || 'below';

  const currentYear = new Date().getFullYear();

  // Fetch current year data
  const currentData = await extractTSMCTable(currentYear);

  if (currentData.length === 0) {
    // Try previous year if current year has no data yet (early January)
    const prevData = await extractTSMCTable(currentYear - 1);
    if (prevData.length === 0) {
      console.warn('  TSMC: no revenue data found');
      return null;
    }
    return buildSnapshot(prevData, threshold, direction, label);
  }

  // Also fetch previous year for trend context
  let prevYearData: TSMCMonthlyData[] = [];
  try {
    prevYearData = await extractTSMCTable(currentYear - 1);
  } catch {
    // Non-fatal — we still have current year data
  }

  return buildSnapshot([...prevYearData, ...currentData], threshold, direction, label);
}

function buildSnapshot(
  allData: TSMCMonthlyData[],
  threshold: number,
  direction: string,
  label: string
): TSMCRevenueSnapshot {
  // Latest month is the observed value (YoY growth)
  const latest = allData[allData.length - 1];
  const observedValue = latest.yoyChange;

  // Build evidence summary
  const summaryParts: string[] = [label];
  summaryParts.push(
    `Latest: NT$${(latest.revenue / 1000).toFixed(0)}B ${latest.month} ${latest.year} (${observedValue >= 0 ? '+' : ''}${observedValue.toFixed(1)}% YoY)`
  );

  // Show recent months trend
  const recentMonths = allData.slice(-6);
  if (recentMonths.length >= 3) {
    const trend = recentMonths
      .map(m => `${m.month.replace('.', '')} ${m.year}: ${m.yoyChange >= 0 ? '+' : ''}${m.yoyChange.toFixed(1)}%`)
      .join(' → ');
    summaryParts.push(`Trend: ${trend}`);
  }

  // Annual total if we have full year data
  const currentYearData = allData.filter(d => d.year === latest.year);
  if (currentYearData.length >= 2) {
    const ytdTotal = currentYearData.reduce((s, d) => s + d.revenue, 0);
    summaryParts.push(`YTD ${latest.year}: NT$${(ytdTotal / 1000).toFixed(0)}B (${currentYearData.length} months)`);
  }

  // Calculate pctToThreshold
  // For "below" direction with threshold=0: pct approaches 100% as growth approaches 0%
  // Use the latest observed YoY growth rate
  let pct: number;
  if (direction === 'below') {
    // Triggers when observed FALLS TO threshold from above
    // E.g., growth at 36.8%, threshold 0% → pct = 0/36.8 * 100 = 0% (very safe)
    // E.g., growth at 5%, threshold 0% → pct = ... closer to trigger
    // Special case: threshold is 0 (growth turns negative)
    if (threshold === 0) {
      // Map: 30%+ → ~0%, 10% → ~67%, 5% → ~83%, 0% → 100%, negative → >100%
      if (observedValue <= 0) {
        pct = 100 + Math.abs(observedValue);
      } else {
        pct = Math.max(0, 100 - (observedValue / 0.3));
      }
    } else if (observedValue > 0 && threshold > 0) {
      pct = (threshold / observedValue) * 100;
    } else {
      pct = observedValue <= threshold ? 100 : 0;
    }
  } else {
    pct = threshold > 0 ? (observedValue / threshold) * 100 : 0;
  }

  return {
    observedValue: Math.round(observedValue * 100) / 100,
    thresholdValue: threshold,
    pctToThreshold: Math.round(pct * 100) / 100,
    unit: (label.includes('%') ? '% YoY' : '% YoY'),
    evidenceSummary: summaryParts.join(' | '),
  };
}

/**
 * Fetch historical TSMC revenue data for backfill.
 * Returns monthly data for the specified year range.
 */
export async function fetchTSMCHistorical(
  startYear: number,
  endYear: number
): Promise<TSMCMonthlyData[]> {
  const allData: TSMCMonthlyData[] = [];

  for (let year = startYear; year <= endYear; year++) {
    console.log(`  Fetching TSMC ${year}...`);
    try {
      const yearData = await extractTSMCTable(year);
      allData.push(...yearData);
      // Small delay between years to be polite
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.warn(`  TSMC ${year}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return allData;
}
