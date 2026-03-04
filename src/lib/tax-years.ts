/**
 * Tax year configuration and helpers.
 * Pure logic — no DB imports, safe for client components.
 */

export interface TaxYearConfig {
  label: string;
  startDate: string;
  endDate: string;
}

/**
 * Generate tax years based on owner.
 * TTC: May 1 – Apr 30 (corporate reporting period)
 * Individuals: Apr 6 – Apr 5 (UK tax year)
 */
export function getTaxYears(owner: string): TaxYearConfig[] {
  const isTTC = owner === "TTC";
  const startMonth = isTTC ? 5 : 4;
  const startDay = isTTC ? 1 : 6;
  const years: TaxYearConfig[] = [];

  for (let y = 2018; y <= 2025; y++) {
    const start = `${y}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
    const endYear = y + 1;
    const endMonth = isTTC ? 4 : 4;
    const endDay = isTTC ? 30 : 5;
    const end = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

    years.push({
      label: `${y}/${String(endYear).slice(2)}`,
      startDate: start,
      endDate: end,
    });
  }

  return years;
}
