-- Add dedicated S104 cost basis fields to event_calculations
-- Previously, uk_section_104 phase overwrote the GBP ACB fields (cost_basis_gbp, realized_gain_gbp).
-- Now S104 writes to its own fields, preserving both GBP ACB and S104 values.

ALTER TABLE event_calculations
  ADD COLUMN s104_cost_basis_gbp numeric,
  ADD COLUMN s104_realized_gain_gbp numeric;
