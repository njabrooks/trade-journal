/**
 * Pure parsers for the two ambient sections of a thesis-observe directive report
 * (docs/v2/14 §3.4, §10.2 — Lane A / docs/v2/16 §2). Kept DB-free and exported so they
 * are unit-testable in isolation; `scripts/ingest-world-monitor.ts` imports them.
 *
 * - PRICE & DATA WATCH (P4 #1) — parsed for OBSERVABILITY only (not persisted; the live
 *   prices are authoritative in the observe bundle and livePrices is never written back).
 * - THESIS-RELEVANT NEWS (P2)  — the no-signal-matched items the harvest turns into
 *   `candidate_signal` journal rows.
 *
 * Both scope to their `## ` section and stop at the next `## [A-Z]` header, so they never
 * read into SIGNAL ASSESSMENT (whose own parser is `parseSignalScores`).
 */

export interface PriceWatchRow {
  thesisTitle: string;
  ticker: string;
  live: number | null;
  deltaVsStoredPct: number | null;
}

/** Strip `$ , %` and unicode minus, returning a finite number or null (for `—`/blank/header). */
function parseNumCell(cell: string): number | null {
  const t = (cell ?? '').replace(/[$,%\s]/g, '').replace(/[−–]/g, '-');
  if (!t || t === '-' || t === '—') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/**
 * Parse the `## PRICE & DATA WATCH` markdown table.
 *
 * Column contract (thesis-observe SKILL body template — positional):
 *   | Thesis | Ticker | Live | Δ vs stored | Target | To target | As of (src) |
 *
 * Header, separator (`|---|`), and unfilled `[placeholder]` rows are skipped.
 */
export function parsePriceWatch(markdown: string): PriceWatchRow[] {
  const m = markdown.match(/## PRICE & DATA WATCH\n([\s\S]*?)(?=\n## [A-Z]|\n---\s*$|$)/);
  if (!m) return [];
  const rows: PriceWatchRow[] = [];
  for (const line of m[1].split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;
    const [thesisTitle, ticker, live, delta] = cells;
    if (/^thesis$/i.test(thesisTitle) || /^-{2,}$/.test(thesisTitle.replace(/\s/g, ''))) continue; // header/separator
    if (!ticker || /^ticker$/i.test(ticker) || ticker.startsWith('[')) continue; // header or unfilled placeholder
    rows.push({ thesisTitle, ticker: ticker.toUpperCase(), live: parseNumCell(live), deltaVsStoredPct: parseNumCell(delta) });
  }
  return rows;
}

export interface ThesisNewsItem {
  headline: string;
  thesisTitle: string;
  body: string;
  sourceUrl: string | null;
}

/**
 * Parse the `## THESIS-RELEVANT NEWS` section. Each item:
 *   - {severity emoji} **[Headline]** — Thesis: [title]
 *     [1–2 sentences + source URL]
 *
 * Items without both a `**headline**` and a `Thesis:` linkage are skipped (we never guess
 * which thesis an item bears on).
 */
export function parseThesisRelevantNews(markdown: string): ThesisNewsItem[] {
  const m = markdown.match(/## THESIS-RELEVANT NEWS\n([\s\S]*?)(?=\n## [A-Z]|\n---\s*$|$)/);
  if (!m) return [];
  const EMOJI = '🔴|🟠|🟡|🟢|⚪|🔵|✅|ℹ️';
  const blocks = m[1].split(new RegExp(`(?=^- (?:${EMOJI}))`, 'm'));
  const items: ThesisNewsItem[] = [];
  for (const block of blocks) {
    const t = block.trim();
    if (!t.startsWith('- ')) continue;
    const hl = t.match(/\*\*(.+?)\*\*/);
    const th = t.match(/Thesis:\s*([^\n]+)/i);
    if (!hl || !th) continue; // need both a headline and a thesis linkage
    const headline = hl[1].replace(/^\[|\]$/g, '').trim();
    const thesisTitle = th[1].trim().replace(/\*+/g, '').replace(/^\[|\]$/g, '').replace(/[.;,]\s*$/, '').trim();
    const nl = t.indexOf('\n');
    const body = nl >= 0 ? t.slice(nl + 1).replace(/\s+/g, ' ').trim() : '';
    const sourceUrl = block.match(/\((https?:\/\/[^)]+)\)/)?.[1] ?? block.match(/(https?:\/\/\S+)/)?.[1] ?? null;
    if (headline) items.push({ headline, thesisTitle, body, sourceUrl });
  }
  return items;
}
