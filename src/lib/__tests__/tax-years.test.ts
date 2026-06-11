/**
 * Golden tests for getTaxYears.
 *
 * - UK individuals: tax year runs 6 April → 5 April (following year)
 * - TTC (corporate): reporting period runs 1 May → 30 April
 * - Labels are "YYYY/YY" (start year / two-digit end year)
 * - Years are generated for 2018..2025 (8 entries), non-overlapping and
 *   contiguous (each start is exactly one day after the previous end).
 *
 * tax-years.ts is pure (no DB imports) — no mocking needed.
 */
import { describe, it, expect } from "vitest";
import { getTaxYears, type TaxYearConfig } from "@/lib/tax-years";

/** Day after an ISO date string, computed in UTC. */
function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function assertContiguousAndNonOverlapping(years: TaxYearConfig[]) {
  for (const y of years) {
    // Each range is valid: start strictly before end (ISO strings compare lexically)
    expect(y.startDate < y.endDate).toBe(true);
  }
  for (let i = 1; i < years.length; i++) {
    // Non-overlapping: next start is after previous end...
    expect(years[i].startDate > years[i - 1].endDate).toBe(true);
    // ...and contiguous: exactly one day after
    expect(years[i].startDate).toBe(nextDay(years[i - 1].endDate));
  }
}

describe("getTaxYears — UK individual (Apr 6 → Apr 5)", () => {
  const years = getTaxYears("Nick");

  it("generates 8 years covering 2018/19 through 2025/26", () => {
    expect(years).toHaveLength(8);
    expect(years[0]).toEqual({
      label: "2018/19",
      startDate: "2018-04-06",
      endDate: "2019-04-05",
    });
    expect(years[7]).toEqual({
      label: "2025/26",
      startDate: "2025-04-06",
      endDate: "2026-04-05",
    });
  });

  it("every year runs 6 April to 5 April of the following year", () => {
    for (const y of years) {
      const startYear = Number(y.startDate.slice(0, 4));
      expect(y.startDate).toBe(`${startYear}-04-06`);
      expect(y.endDate).toBe(`${startYear + 1}-04-05`);
    }
  });

  it("labels are 'YYYY/YY' with consecutive years", () => {
    for (const y of years) {
      expect(y.label).toMatch(/^\d{4}\/\d{2}$/);
      const startYear = Number(y.label.slice(0, 4));
      const endYY = y.label.slice(5);
      // End two-digit year = start year + 1 (e.g. 2018 → "19")
      expect(endYY).toBe(String(startYear + 1).slice(2));
      expect(y.startDate.startsWith(String(startYear))).toBe(true);
    }
  });

  it("ranges are non-overlapping and contiguous (Apr 5 → Apr 6)", () => {
    assertContiguousAndNonOverlapping(years);
  });
});

describe("getTaxYears — TTC corporate (May 1 → Apr 30)", () => {
  const years = getTaxYears("TTC");

  it("generates 8 years covering 2018/19 through 2025/26", () => {
    expect(years).toHaveLength(8);
    expect(years[0]).toEqual({
      label: "2018/19",
      startDate: "2018-05-01",
      endDate: "2019-04-30",
    });
    expect(years[7]).toEqual({
      label: "2025/26",
      startDate: "2025-05-01",
      endDate: "2026-04-30",
    });
  });

  it("every year runs 1 May to 30 April of the following year", () => {
    for (const y of years) {
      const startYear = Number(y.startDate.slice(0, 4));
      expect(y.startDate).toBe(`${startYear}-05-01`);
      expect(y.endDate).toBe(`${startYear + 1}-04-30`);
    }
  });

  it("ranges are non-overlapping and contiguous (Apr 30 → May 1)", () => {
    assertContiguousAndNonOverlapping(years);
  });
});

describe("getTaxYears — owner routing", () => {
  it("only the exact owner 'TTC' gets the corporate period", () => {
    expect(getTaxYears("TTC")[0].startDate).toBe("2018-05-01");
    // Any other owner string gets the UK individual year
    expect(getTaxYears("Nick")[0].startDate).toBe("2018-04-06");
    expect(getTaxYears("ttc")[0].startDate).toBe("2018-04-06"); // case-sensitive
    expect(getTaxYears("")[0].startDate).toBe("2018-04-06");
  });
});
