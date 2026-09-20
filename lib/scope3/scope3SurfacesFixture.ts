// ── THE SCOPE 3 SURFACE HARNESS: ONE FIXED EXAMPLE INVENTORY ─────────────────────────────────────
//
// Read by lib/scope3/scope3Surfaces.test.ts, which renders app/dashboard/scope3/page.tsx against this
// record and compares every customer-visible surface with the committed snapshot. It exists so the
// Category 3 rebuild (Tasks 4 to 9 of the Cat 3 design) can prove the other fourteen categories are
// byte-identical, rather than asserting it.
//
// ⚠️ FIXTURE DATA ONLY. Nothing here was read from the database, from a saved inventory or from any
// customer record: the company is invented, the inventory id is a fixed zero-filled UUID, and every
// figure is a round number chosen to exercise a path.
//
// ⚠️ CHANGING THIS FILE CHANGES THE SNAPSHOT. The snapshot records a hash of this object; a change
// without a regeneration fails the test naming the fixture, rather than reporting fifteen differences.
//
// The three EXIOBASE-priced categories deliberately take three different paths, none of which calls the
// pricing route, so the capture is deterministic without faking a route answer:
//   Cat 1  supplier-specific figure entered   (the supplier path)
//   Cat 2  a known figure entered             (the entered-figure path)
//   Cat 4  spend and sector, nothing priced   (the "estimate had not finished" path)

/** The stored shape of one category, as app/dashboard/scope3/page.tsx writes it into cat_data. */
export type FixtureCategory = Record<string, unknown>

export const SCOPE3_FIXTURE_META = {
  company: 'Harness Manufacturing Ltd',
  sector: 'Industrials & Manufacturing',
  reportingYear: 2026,
  currency: 'USD',
  countryIso2: 'US',
  revenue: 50_000_000,
  boundInventoryId: '00000000-0000-4000-8000-000000000001',
  ghgGwpVersion: 'AR6',
} as const

export const SCOPE3_FIXTURE_CAT_DATA: Record<string, FixtureCategory> = {
  // Supplier-specific: calculated, high confidence, no route call.
  cat1: { relevant: true, total_spend: 1_000_000, spend_sector: 'i01.a', has_supplier_data: true, supplier_emissions: 1_234 },
  // Entered figure on an EXIOBASE category.
  cat2: { relevant: true, annual_spend: 250_000, spend_sector: 'p01.a', emissions_override: 88 },
  // Today's flat-factor path. ⚠️ THIS IS THE ENTRY TASKS 4 TO 9 REPLACE.
  cat3: { relevant: true, annual_spend: 400_000 },
  // Spend entered, no sector chosen: the "to estimate from spend, enter…" path. ⚠️ DELIBERATELY NOT a
  // complete-but-unpriced record: that state is `pending`, and saveScope3 refuses to run while any
  // estimate is in flight (page.tsx, `if (anySpendPending) return`), so the factor_basis text could
  // never be captured.
  cat4: { relevant: true, annual_spend: 300_000 },
  cat5: {
    relevant: true,
    wasteRows: [
      { id: 'w1', activity: 'Paper', waste_type: 'Paper and board: board', route: 'Closed-loop', tonnes: 12 },
      { id: 'w2', activity: 'Refuse', waste_type: 'Household residual waste', route: 'Landfill', tonnes: 5 },
    ],
  },
  cat6: {
    relevant: true,
    flights: [{ id: 'f1', origin_iso2: 'GB', destination_iso2: 'US', cabin_class: 'economy', count: 2, distance: 5555, distance_unit: 'km', distance_km: 5555 }],
    rail_journeys: [{ id: 'r1', country_iso2: 'GB', rail_type: 'National rail', distance: 400, distance_unit: 'km', distance_km: 400, passengers: 3 }],
  },
  cat7: {
    relevant: true,
    commute_rows: [{ id: 'c1', mode: 'car', car_size: 'average', car_fuel: 'unknown', country_iso2: 'GB', employees: 20, occupancy: 1.2, days_per_week: 4, weeks_per_year: 45, distance: 15, distance_unit: 'km', distance_km: 15 }],
    homeworking_rows: [{ id: 'h1', country_iso2: 'GB', employees: 10, days_per_week: 2, weeks_per_year: 45, hours_per_day: 7.5 }],
  },
  cat8: { relevant: true, annual_spend: 120_000 },
  cat9: { relevant: true, annual_spend: 90_000 },
  // Relevant: false, so the exclusion text and the justification rule are captured too.
  cat10: { relevant: false, annual_spend: 60_000, excluded_reason: 'Sold products are not processed further by any customer.' },
  cat11: { relevant: true, annual_spend: 500_000 },
  cat12: {
    relevant: true,
    eolMaterials: [
      { id: 'e1', activity: 'Paper', waste_type: 'Paper and board: board', tonnes: 8, shares: { Landfill: 60, 'Closed-loop': 40 } },
      { id: 'e2', activity: 'Refuse', waste_type: 'Household residual waste', tonnes: 4, shares: { Combustion: 100 } },
    ],
  },
  cat13: { relevant: true, annual_spend: 80_000 },
  cat14: { relevant: true, annual_spend: 40_000 },
  cat15: {
    relevant: true,
    pcafAssets: [
      { id: 'p1', assetClass: 'listed_equity_corp_bonds', outstandingAmount: 1_000_000, denominator: 10_000_000, emissions: { reportedEmissions: 50_000, verified: true } },
      { id: 'p2', assetClass: 'business_loans_unlisted_equity', outstandingAmount: 2_000_000, denominator: 40_000_000, emissions: { reportedEmissions: 20_000 } },
    ],
  },
}
