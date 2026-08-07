import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('thesis-observe governed ingestion boundary', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts/ingest-world-monitor.ts'), 'utf8');

  it('suppresses legacy intel-item emission only for the explicit governed flag', () => {
    expect(source).toContain("const thesisObserveOnly = args.includes('--thesis-observe-only')");
    expect(source).toContain("parsed.items.length > 0 && !options.thesisObserveOnly");
    expect(source).toContain("!options.thesisObserveOnly && parsed.items.length > 0 && emitted === 0");
  });

  it('refuses the governed flag for a non thesis-observe report', () => {
    expect(source).toContain("options.thesisObserveOnly && parsed.reportType !== 'thesis-observe'");
    expect(source).toContain("--thesis-observe-only requires a report with type: thesis-observe");
  });
});
