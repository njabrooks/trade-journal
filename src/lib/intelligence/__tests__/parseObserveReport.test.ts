import { describe, it, expect } from 'vitest';
import { parsePriceWatch, parseThesisRelevantNews } from '../parseObserveReport';

// A realistic thesis-observe report fragment matching the SKILL body template, with a
// PRICE & DATA WATCH table and a THESIS-RELEVANT NEWS section, followed by SIGNAL ASSESSMENT
// (to assert the section boundary is respected).
const REPORT = `# Thesis Observe — 2026-06-24 22:00 UTC (Tiers [1])

**Context:** Quiet tape.

## PRICE & DATA WATCH

Freshest spot per observed underlying.

| Thesis | Ticker | Live | Δ vs stored | Target | To target | As of (src) |
|--------|--------|------|-------------|--------|-----------|-------------|
| Bullish TSLA Long Term | TSLA | $375.53 | −12.3% | $500.00 | +33.2% | 20:00 (yahoo) |
| Bullish BTC Long Term | BTC | $61,006.31 | +0.1% | — | — | 21:59 (yahoo) |
| Bearish Oil (CL) Medium Term | CL | — | — | $60.00 | — | — |

## THESIS-RELEVANT NEWS

Items that bear on a thesis but match no specific signal.

- 🔴 **AI-ROI selloff wipes $1.4T off hyperscalers** — Thesis: Bullish AI Hyperscalers
  Mega-cap AI names sold off on ROI doubts; no signal covers capex-payback risk. ([Reuters](https://example.com/ai-roi))
- 🟡 **EU tokenisation framework advances** — Thesis: Bullish Tokenisation
  MiCA II draft expands tokenised-securities scope. https://example.com/mica2
- 🟢 **An item with no thesis linkage that must be skipped**
  Body without a Thesis tag.

## SIGNAL ASSESSMENT

### Bullish TSLA Long Term (asset — bullish)

#### ⚪ TSLA delivers 2M cars
- **Signal ID:** 11111111-1111-1111-1111-111111111111
- **Score:** neutral
- **Evidence:** none
`;

describe('parsePriceWatch', () => {
  it('parses well-formed rows with $/comma/unicode-minus handling', () => {
    const rows = parsePriceWatch(REPORT);
    expect(rows).toHaveLength(3);

    const tsla = rows.find((r) => r.ticker === 'TSLA')!;
    expect(tsla.thesisTitle).toBe('Bullish TSLA Long Term');
    expect(tsla.live).toBe(375.53);
    expect(tsla.deltaVsStoredPct).toBe(-12.3); // unicode minus normalized

    const btc = rows.find((r) => r.ticker === 'BTC')!;
    expect(btc.live).toBe(61006.31); // comma stripped
    expect(btc.deltaVsStoredPct).toBe(0.1);
  });

  it('returns null for unpriced/gap cells (—)', () => {
    const cl = parsePriceWatch(REPORT).find((r) => r.ticker === 'CL')!;
    expect(cl.live).toBeNull();
    expect(cl.deltaVsStoredPct).toBeNull();
  });

  it('skips the header and separator rows', () => {
    const rows = parsePriceWatch(REPORT);
    expect(rows.some((r) => /thesis/i.test(r.ticker) || r.ticker.startsWith('-'))).toBe(false);
  });

  it('does not read past the section into SIGNAL ASSESSMENT', () => {
    // The signal row "TSLA delivers 2M cars" is a #### bullet, not a table row — must be absent.
    const rows = parsePriceWatch(REPORT);
    expect(rows.every((r) => ['TSLA', 'BTC', 'CL'].includes(r.ticker))).toBe(true);
  });

  it('skips unfilled [placeholder] template rows', () => {
    const tpl = `## PRICE & DATA WATCH

| Thesis | Ticker | Live | Δ vs stored | Target | To target | As of (src) |
|--------|--------|------|-------------|--------|-----------|-------------|
| [thesis title] | [TICKER] | [$live or —] | [+/−X.X% or —] | [$target or —] | [+/−X.X% or —] | [HH:MM] |

## NEXT`;
    expect(parsePriceWatch(tpl)).toHaveLength(0);
  });

  it('returns [] when there is no PRICE & DATA WATCH section', () => {
    expect(parsePriceWatch('# Report\n\n## SIGNAL ASSESSMENT\nnothing')).toEqual([]);
  });
});

describe('parseThesisRelevantNews', () => {
  it('parses items with headline, thesis linkage, body, and source URL', () => {
    const items = parseThesisRelevantNews(REPORT);
    expect(items).toHaveLength(2); // the no-linkage item is skipped

    const ai = items[0];
    expect(ai.headline).toBe('AI-ROI selloff wipes $1.4T off hyperscalers');
    expect(ai.thesisTitle).toBe('Bullish AI Hyperscalers');
    expect(ai.sourceUrl).toBe('https://example.com/ai-roi'); // markdown-link form
    expect(ai.body).toContain('capex-payback');
  });

  it('extracts a bare (non-markdown-link) URL', () => {
    const mica = parseThesisRelevantNews(REPORT).find((i) => i.thesisTitle === 'Bullish Tokenisation')!;
    expect(mica.sourceUrl).toBe('https://example.com/mica2');
  });

  it('skips items with no Thesis linkage', () => {
    const items = parseThesisRelevantNews(REPORT);
    expect(items.some((i) => /no thesis linkage/i.test(i.headline))).toBe(false);
  });

  it('does not read past the section boundary', () => {
    const items = parseThesisRelevantNews(REPORT);
    expect(items.every((i) => i.thesisTitle.length > 0)).toBe(true);
    expect(items.some((i) => /Signal ID/.test(i.body))).toBe(false);
  });

  it('returns [] when there is no THESIS-RELEVANT NEWS section', () => {
    expect(parseThesisRelevantNews('# Report\n\n## PRICE & DATA WATCH\n| a |')).toEqual([]);
  });
});
