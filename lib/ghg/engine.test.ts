// lib/ghg/engine.test.ts
// Regression suite encoding the GHG engine audit (Phase 2). Tests are written to
// FAIL on the current engine — each red test pins one audited defect that Phase 3
// will turn green. GROUP G tests lock in behaviour that already works (they pass).
//
// IMPORTANT SCOPE NOTE. Several audited behaviours (the straddle/extrapolate FIELD
// gross-up, and the export GATES conciergeReady / unresolvedCoverage / fuelOfStrip)
// live in app/dashboard/ghg/page.tsx as unexported React closures — NOT in the
// engine. They cannot be unit-tested here without first extracting them (a Phase-3
// prerequisite). Where a defect is observable at an engine seam (buildWorkings,
// calcInventory, analyzeCoverage) it is pinned there; where it is purely a component
// closure it is marked `it.todo` with the reason. See the Phase-2 report.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildWorkings, calcLocation, calcInventory, analyzeCoverage, exclusiveEnd,
  isResolvedGridRegion, detectGridRegion, getResidualFactor, getGridFactor,
  residualRegionFor,
  pickEF, calcGas, emptyLocation, findUnresolvedCoverage, findUndeclaredStreams, applyResolutions, pctEstimated,
  MissingEmissionFactorError, findUnpriceableLocations,
  streamState, DECLARABLE_STREAMS, STREAM_META, nzTdLoss, NZ_TD_LOSS, EF_SOURCES,
  efJurisdiction, steamFactorFor, findSteamFactorGaps, snapUnitsForCountry, steamToBasis,
  EF, EF_CA, EF_UK, EF_EU, EF_AU, EF_NZ,
  type Location, type CoverageResolution, type CoveragePeriod, type SourceDoc, type ExtractedProposal, type StreamAttestation,
  type DeclarableStream,
} from './engine';
import { buildMonthlyEmissions, reconcile } from './monthlyEmissions';

// ── fixture builders ─────────────────────────────────────────────────────────
const loc = (o: Partial<Location> = {}): Location => ({ ...emptyLocation('L1', 'Test Site'), ...o });

const prop = (o: Partial<ExtractedProposal> = {}): ExtractedProposal => ({
  fuelType: 'natural_gas', rawValue: null, rawUnit: null, value: 100, unit: 'mcf',
  periodStart: '2024-01-01', periodEnd: '2024-12-31', confidence: 'high',
  sourceQuote: 'Total gas: 100 mcf', notes: null, status: 'confirmed', ...o,
});

const doc = (document_type: string, extracted: ExtractedProposal[], id = 'doc1'): SourceDoc => ({
  id, file_name: `${document_type}.pdf`, document_type, uploaded_at: '2024-06-01', file_path: `/${id}.pdf`, extracted,
});

const straddleRes = (choice: 'prorate' | 'next_year' | 'this_year'): CoverageResolution => ({
  locId: 'L1', fuelType: 'natural_gas', kind: 'straddle', straddleChoice: choice,
  daysInYear: 12, totalDays: 31,
  note: `Straddling bill resolved by ${choice}`, acknowledgedAt: '2024-06-01T00:00:00Z',
});

// A location whose natural-gas figure is the RAW confirmed bill value (100), with a
// straddling gas bill on file. This is exactly the state the buggy component leaves it
// in: the straddle resolution is recorded but the figure was never adjusted.
const straddleGasLoc = () => loc({
  has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf',
  source_docs: [doc('utility_bill_gas', [prop({ periodStart: '2024-12-20', periodEnd: '2025-01-19' })])],
});

const ngRow = (rows: any[]) => rows.find(r => r.source === 'Natural gas');

// ── GROUP A — Straddle resolution recorded but never applied [SEV 0] ──────────
// The FIELD-write path (updateProposal / addCoverageResolution) is component-only,
// so A1–A3 are pinned at the verifier-facing engine seam instead: buildWorkings must
// report a gas figure consistent with the straddle choice on file. It currently echoes
// the raw 100 regardless of the choice.
describe('GROUP A — straddle', () => {
  it("A1 prorate → workings gas figure should be 100 × 12/31 ≈ 38.71 (currently 100)", () => {
    const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, [straddleRes('prorate')]);
    expect(ngRow(rows)?.activity_data).toBeCloseTo(100 * 12 / 31, 2); // ≈ 38.71
  });

  it("A2 next_year → workings gas figure should be 0 (bill belongs to next FY)", () => {
    const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, [straddleRes('next_year')]);
    expect(ngRow(rows)?.activity_data).toBe(0);
  });

  it("A3 this_year → workings gas figure should be 100 (full bill counts this FY)", () => {
    // NOTE: this asserts the SAME 100 the engine already echoes, so at the engine seam
    // this is expected to PASS even today. The audited failure is in the component
    // field-write path (not engine-testable). Flagged in the Phase-2 report.
    const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, [straddleRes('this_year')]);
    expect(ngRow(rows)?.activity_data).toBe(100);
  });

  it("A4 buildWorkings must not advertise a method it didn't apply — a 'prorate' resolution row implies the gas figure was prorated", () => {
    const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, [straddleRes('prorate')]);
    const resRow = rows.find(r => r.gwp_basis === 'coverage_resolution' && String(r.emission_factor).includes('prorate'));
    expect(resRow, 'expected a straddle "prorate" coverage-resolution row').toBeTruthy();
    // The workings claim proration; the actual figure must agree with that claim.
    expect(ngRow(rows)?.activity_data).toBeCloseTo(100 * 12 / 31, 2);
  });

  it("A5 a straddle-adjusted number must NOT be stamped entry_method 'concierge' (that means read verbatim off bills)", () => {
    const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, [straddleRes('prorate')]);
    expect(ngRow(rows)?.entry_method).not.toBe('concierge');
  });
});

// ── STEP 1 (Phase 3a) — straddle detection uses the canonical half-open interval ──
describe('straddle detection (canonical, day-map-consistent)', () => {
  const win = { s: new Date(2024, 0, 1), e: new Date(2024, 11, 31) };

  it("2024-12-01 → 2025-01-01 (first-of-next-month) is NOT a straddle — it covers December only; full year → 'full'", () => {
    const periods: CoveragePeriod[] = [
      { docId: 'a', pi: 0, start: new Date(2024, 0, 1), end: new Date(2024, 11, 1) },  // Jan 1 → Dec 1 (Jan–Nov)
      { docId: 'b', pi: 0, start: new Date(2024, 11, 1), end: new Date(2025, 0, 1) },   // Dec 1 → Jan 1 (December)
    ];
    const r = analyzeCoverage(periods, win.s, win.e);
    expect(r.straddles.length).toBe(0);   // the bill that fooled us in June: no phantom straddle
    expect(r.status).toBe('full');
  });

  it("2024-12-20 → 2025-01-19 IS a straddle; daysInYear 12, totalDays 31 (Jan 19 is the last covered day)", () => {
    const periods: CoveragePeriod[] = [{ docId: 's', pi: 0, start: new Date(2024, 11, 20), end: new Date(2025, 0, 19) }];
    const r = analyzeCoverage(periods, win.s, win.e);
    expect(r.straddles.length).toBe(1);
    expect(r.straddles[0].daysInYear).toBe(12);
    // With exclusiveEnd fixed (mid-month = inclusive), Jan 19 is covered → canonical span is 31 days,
    // 12 of them in FY2024. 12/31 = the correct proration, matching A1.
    expect(r.straddles[0].totalDays).toBe(31);
  });
});

// ── exclusiveEnd: mid-month bill ends are INCLUSIVE (H1/H2/H3) [SEV 1] ─────────
// A meter-read cycle "Dec 20 – Jan 19" means Jan 19 IS covered (inclusive). Only the
// 1st of a month reads as exclusive (first-of-next-month convention). The old heuristic
// treated every non-last-day-of-month date as exclusive → dropped a day at every mid-
// month boundary → a phantom gap in every month of a fully-billed year.
describe('exclusiveEnd — mid-month ends are inclusive', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  it('H1 conventions: last-day inclusive, first-of-month exclusive, mid-month inclusive', () => {
    expect(iso(exclusiveEnd(new Date(2024, 4, 31)))).toBe('2024-06-01'); // last day of month → inclusive
    expect(iso(exclusiveEnd(new Date(2024, 5, 1)))).toBe('2024-06-01');  // first of month → exclusive (unchanged)
    expect(iso(exclusiveEnd(new Date(2025, 0, 19)))).toBe('2025-01-20'); // mid-month → inclusive (was WRONG: gave 01-19)
  });

  it('H2 consecutive mid-month meter cycles: NO gap at the boundary — 2025-01-19 must be covered', () => {
    const periods: CoveragePeriod[] = [
      { docId: '1', pi: 0, start: new Date(2024, 11, 20), end: new Date(2025, 0, 19) },
      { docId: '2', pi: 0, start: new Date(2025, 0, 20), end: new Date(2025, 1, 19) },
    ];
    const r = analyzeCoverage(periods, new Date(2025, 0, 1), new Date(2025, 11, 31));
    expect(r.gaps.some(g => g.label.startsWith('Jan'))).toBe(false); // January fully covered — no dropped boundary day
    expect(r.overlaps.length).toBe(0);                                // and no double-count at the seam
  });

  it('H3 a full year of consecutive mid-month bills has NO phantom gaps — all twelve months covered', () => {
    // 13 mid-month cycles (Dec 20 2024 → Jan 19 2026) span calendar FY2025. Mid-month cycles are offset
    // from the calendar, so 13 are needed to cover all twelve months (the task said "twelve"; see report).
    const periods: CoveragePeriod[] = [];
    for (let i = 0; i < 13; i++) {
      const start = new Date(2024, 11, 20); start.setMonth(start.getMonth() + i);
      const end = new Date(2025, 0, 19); end.setMonth(end.getMonth() + i);
      periods.push({ docId: String(i), pi: 0, start, end });
    }
    const r = analyzeCoverage(periods, new Date(2025, 0, 1), new Date(2025, 11, 31));
    expect(r.gaps.length).toBe(0);          // THE FIX: zero phantom gaps at any interior boundary
    expect(r.monthsCovered).toBe(12);       // every month fully covered
    expect(r.status).not.toBe('gap');       // the phantom-gap bug is gone
    // status is 'straddle' (not 'full'): the two FY-edge cycles legitimately cross Jan 1 and need a
    // proration choice. That is correct — mid-month cycles can't align to a calendar year. See report.
    expect(r.status).toBe('straddle');
  });
});

// ── GROUP B — Absence indistinguishable from attested zero [SEV 1] ────────────
describe('GROUP B — silent absence', () => {
  it("B1 buildWorkings emits SOME natural-gas trace row even when has_natural_gas is false (absence must be recorded, not silent)", () => {
    const l = loc({ electricity_kwh: 10000, grid_region: 'US_CA', has_natural_gas: false });
    const rows = buildWorkings([l], 'AR6', 2024, []);
    expect(rows.some(r => /gas/i.test(String(r.source)))).toBe(true);
  });

  it("B2 the completeness gate must flag a stream with neither data nor attestation — electricity present, no gas doc, has_natural_gas=false, no gas attestation → natural_gas is undeclared", () => {
    const l = loc({ id: 'B2', electricity_kwh: 10000, grid_region: 'US_CA', has_natural_gas: false });
    // COMPOSE, not fold: findUnresolvedCoverage only inspects docs that exist, so an absent fuel
    // produces nothing there — and it SHOULDN'T, because the two are different failures with different
    // remedies. A coverage gap is acknowledgeable (extrapolate); an undeclared stream is not (only data
    // or attestation). The absence gate is the SEPARATE findUndeclaredStreams.
    const undeclared = findUndeclaredStreams([l]);
    expect(undeclared.some(u => u.stream === 'natural_gas' && u.locId === 'B2')).toBe(true);
  });

  it("B3a analyzeCoverage returns status 'none' for zero periods (regression guard — this already holds)", () => {
    const r = analyzeCoverage([], new Date(2024, 0, 1), new Date(2024, 11, 31));
    expect(r.status).toBe('none');
  });

  it("B3b the gate must SURFACE 'none' for a doc whose confirmed proposals carry no dates (currently the periods.length===0 early-return discards it)", () => {
    const l = loc({
      id: 'B3', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf',
      // confirmed gas proposal but NO period dates → periods is empty → early-return swallows 'none'.
      source_docs: [doc('utility_bill_gas', [prop({ periodStart: null, periodEnd: null })])],
    });
    const unresolved = findUnresolvedCoverage([l], 2024, 12, []);
    expect(unresolved.some(u => u.status === 'none')).toBe(true); // ← currently false: 'none' never surfaces
  });
});

// ── GROUP C — Coverage keyed on docType, not (docType, fuelType) [SEV 2] ──────
describe('GROUP C — one fuel resolves, the other silently does not', () => {
  it("C1 fleet_fuel carries gasoline AND diesel from the same bills — a gap acknowledged for ONE fuel must NOT clear the gate for the other; acknowledging BOTH grosses both ×12/9", () => {
    const l = loc({
      id: 'C1',
      has_mobile: true, gasoline_amount: 1200, gasoline_unit: 'gallons',
      diesel_mobile_amount: 1200, diesel_mobile_unit: 'gallons',
      source_docs: [doc('fleet_fuel', [
        // Both fuels dated Jan–Sep 2024 → 9/12 months covered, an identical gap (Oct–Dec) for EACH.
        prop({ fuelType: 'gasoline', value: 900, unit: 'gallons', periodStart: '2024-01-01', periodEnd: '2024-09-30', sourceQuote: 'Gasoline 900 gal' }),
        prop({ fuelType: 'diesel', value: 900, unit: 'gallons', periodStart: '2024-01-01', periodEnd: '2024-09-30', sourceQuote: 'Diesel 900 gal' }),
      ])],
    });
    const gasRes: CoverageResolution = {
      locId: 'C1', fuelType: 'gasoline', kind: 'extrapolate', monthsCovered: 9, pctEstimated: 25,
      note: '9 of 12 months; grossed ×12/9', acknowledgedAt: '2024-06-01T00:00:00Z',
    };
    const dieselRes: CoverageResolution = { ...gasRes, fuelType: 'diesel' };

    // THE FIX (gate keyed per (docType, fuelType)): acknowledging gasoline ONLY leaves diesel's identical
    // gap unresolved. The old per-docType gate let the gasoline resolution clear the whole strip.
    const afterGasOnly = findUnresolvedCoverage([l], 2024, 12, [gasRes]);
    expect(afterGasOnly.some(u => u.fuelType === 'diesel')).toBe(true);
    expect(afterGasOnly.some(u => u.fuelType === 'gasoline')).toBe(false);

    // THE OUTCOME: acknowledging BOTH clears the gate AND grosses both fields ×12/9.
    expect(findUnresolvedCoverage([l], 2024, 12, [gasRes, dieselRes]).length).toBe(0);
    const rows = buildWorkings([l], 'AR6', 2024, [gasRes, dieselRes]);
    const gasoline = rows.find(r => r.source === 'Gasoline (mobile)');
    const diesel = rows.find(r => r.source === 'Diesel (mobile)');
    expect(gasoline?.entry_method).toBe('concierge-extrapolated');
    expect(diesel?.entry_method).toBe('concierge-extrapolated');
    expect(gasoline?.activity_data).toBeCloseTo(900 * 12 / 9, 4); // 1200
    expect(diesel?.activity_data).toBeCloseTo(900 * 12 / 9, 4);   // 1200
  });
});

// ── GROUP D — Overlap silently masks a gap [SEV 2] ────────────────────────────
describe('GROUP D — gap + overlap', () => {
  const periods: CoveragePeriod[] = [
    { docId: 'd1', pi: 0, start: new Date(2024, 0, 1), end: new Date(2024, 5, 30) }, // Jan–Jun
    { docId: 'd2', pi: 0, start: new Date(2024, 3, 1), end: new Date(2024, 3, 30) }, // Apr (overlaps d1)
  ];
  const winStart = new Date(2024, 0, 1), winEnd = new Date(2024, 11, 31);

  it("D1 a fuel with BOTH a gap (Jul–Dec) and an overlap (Apr) exposes both in `issues`; acknowledging ONLY the duplicate leaves the gap unresolved and export blocked", () => {
    const r = analyzeCoverage(periods, winStart, winEnd);
    expect(r.gaps.length, 'gaps should be detected').toBeGreaterThan(0);
    expect(r.overlaps.length, 'overlap should be detected').toBeGreaterThan(0);
    // `issues` is a SET of EVERY condition present — it does not collapse to the one `status` names.
    expect(r.issues).toContain('gap');
    expect(r.issues).toContain('overlap');

    // At the gate: gas bills producing this same gap+overlap. Acknowledging ONLY the duplicate must NOT
    // clear the gate — the gap still needs its own extrapolate resolution (the D1 masking bug).
    const l = loc({
      id: 'D1', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf',
      source_docs: [doc('utility_bill_gas', [
        prop({ periodStart: '2024-01-01', periodEnd: '2024-06-30' }), // Jan–Jun
        prop({ periodStart: '2024-04-01', periodEnd: '2024-04-30' }), // Apr overlap; Jul–Dec gap
      ])],
    });
    const dupOnly: CoverageResolution = {
      locId: 'D1', fuelType: 'natural_gas', kind: 'duplicate',
      note: 'overlap accepted', acknowledgedAt: '2024-06-01T00:00:00Z',
    };
    expect(findUnresolvedCoverage([l], 2024, 12, [dupOnly]).length).toBeGreaterThan(0);
  });
});

// ── GROUP E — s3_td is orphaned [SEV 3] ───────────────────────────────────────
describe('GROUP E — NZ T&D losses (Scope 3 Cat 3)', () => {
  const nz = loc({ country: 'NZ', grid_region: 'NZ', electricity_kwh: 100000, nz_td_losses: true });

  it("E1 calcLocation exposes s3_td > 0, but calcInventory must ALSO surface it as a distinct Scope 3 total (currently omitted)", () => {
    expect(calcLocation(nz, 'AR6', 2025).s3_td).toBeGreaterThan(0);           // precondition (holds)
    expect((calcInventory([nz], 'AR6', 2025) as any).s3_td).toBeGreaterThan(0); // ← currently undefined: RED
  });

  it("E2 s3_td must NOT be folded into s1_total or s2_location/s2_market (guard — should already hold)", () => {
    const c = calcLocation(nz, 'AR6', 2025);
    const gridEf = getGridFactor('NZ', 2025).ef;
    expect(c.s1_total).toBe(0);
    expect(c.s2_location).toBeCloseTo(100000 * gridEf / 1000, 6);      // grid only, no T&D
    expect(c.s2_location).not.toBeCloseTo(c.s2_location + c.s3_td, 6); // T&D not added into S2
    expect(c.s3_td).toBeGreaterThan(0);
  });
});

// ── GROUP F — Monthly vs annual reconciliation [SEV 1] ────────────────────────
// CONTRACT (Lisa, confirmed): the monthly/annual divergence is CORRECT. Monthly is evidenced-only;
// annual is evidenced + estimated. `reconcile` must MODEL that divergence and fire only on the
// UNEXPLAINED remainder — the reconciler finally becomes a trust check that can catch a real defect.
describe('GROUP F — monthly/annual reconciliation models the (correct) divergence', () => {
  const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion };

  it("F1a a 9/12 extrapolated inventory reconciles: the annual gross-up fully explains the monthly shortfall", () => {
    // Annual field is grossed up to 1200 (= 900 × 12/9); the confirmed bill on file is the raw 900.
    const l = loc({
      has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'mcf',
      source_docs: [doc('utility_bill_gas', [prop({
        fuelType: 'natural_gas', value: 900, unit: 'mcf', periodStart: '2024-01-01', periodEnd: '2024-09-30',
      })])],
    });
    const annual = calcInventory([l], 'AR6', 2024);
    const res: CoverageResolution = {
      locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 9, pctEstimated: 25,
      note: '9 of 12 months; grossed ×12/9', acknowledgedAt: '2024-06-01T00:00:00Z',
    };
    const slices = buildMonthlyEmissions([l], 2024, deps, 'AR6').slices;
    const r = reconcile(slices, 2024, annual, [res]);
    expect(r.reconciles).toBe(true);
    expect(r.months_evidenced).toBe(9);
    expect(r.pct_estimated).toBeCloseTo(25, 1);
    expect(r.unexplained_delta).toBeCloseTo(0, 2); // ≈ 0; reconciles===true already pins |Δ| < 0.01
  });

  it("F1b a fully-evidenced 12/12 inventory (no resolutions) reconciles with 0% estimated", () => {
    const l = loc({
      has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'mcf',
      source_docs: [doc('utility_bill_gas', [prop({
        fuelType: 'natural_gas', value: 1200, unit: 'mcf', periodStart: '2024-01-01', periodEnd: '2024-12-31',
      })])],
    });
    const annual = calcInventory([l], 'AR6', 2024);
    const slices = buildMonthlyEmissions([l], 2024, deps, 'AR6').slices;
    const r = reconcile(slices, 2024, annual, []);
    expect(r.reconciles).toBe(true);
    expect(r.pct_estimated).toBeCloseTo(0, 2);
    expect(r.scope1_evidenced).toBeCloseTo(annual.s1_total, 2); // evidenced ≈ annual (no gross-up)
    expect(r.months_evidenced).toBe(12);
  });

  it("F1c a REAL defect — annual figure exceeds the bills with NO resolution to explain it — does NOT reconcile", () => {
    // natural_gas_amount 2000 but the only bill is 900 (Jan–Sep) and NO extrapolate resolution on file.
    // The 1100-worth of annual excess is explained by nothing → the reconciler must fire.
    const l = loc({
      has_natural_gas: true, natural_gas_amount: 2000, natural_gas_unit: 'mcf',
      source_docs: [doc('utility_bill_gas', [prop({
        fuelType: 'natural_gas', value: 900, unit: 'mcf', periodStart: '2024-01-01', periodEnd: '2024-09-30',
      })])],
    });
    const annual = calcInventory([l], 'AR6', 2024);
    const slices = buildMonthlyEmissions([l], 2024, deps, 'AR6').slices;
    const r = reconcile(slices, 2024, annual, []); // no resolution — the excess is unexplained
    expect(r.reconciles).toBe(false);
    expect(Math.abs(r.unexplained_delta)).toBeGreaterThan(0.01);
  });
});

// ── GROUP G — Regression guards (these SHOULD pass) ───────────────────────────
describe('GROUP G — regression guards', () => {
  it('G1 unresolved grid regions are unresolved; explicit *_AVG keys are resolved', () => {
    expect(isResolvedGridRegion('us_average')).toBe(false);
    expect(isResolvedGridRegion('')).toBe(false);
    expect(isResolvedGridRegion('ZZ_nope')).toBe(false);
    expect(isResolvedGridRegion('US_AVG')).toBe(true);
    expect(isResolvedGridRegion('EU_AVG')).toBe(true);
    expect(isResolvedGridRegion('AU_AVG')).toBe(true);
  });

  it('G2 blank US and blank AU state resolve to "" (unresolved), never a silent *_AVG', () => {
    expect(detectGridRegion('', 'US')).toBe('');
    expect(detectGridRegion('', 'AU')).toBe('');
  });

  it('G3 CA natural-gas CO2 is per-province (ON ≠ AB)', () => {
    const on = pickEF(loc({ country: 'CA', grid_region: 'ON', natural_gas_unit: 'm3' }), 'natural_gas_m3');
    const ab = pickEF(loc({ country: 'CA', grid_region: 'AB', natural_gas_unit: 'm3' }), 'natural_gas_m3');
    expect(on.co2).not.toBe(ab.co2);
    expect(on.co2).toBeCloseTo(1.921, 3);
    expect(ab.co2).toBeCloseTo(1.962, 3);
  });

  it('G4 UK/AU/NZ fuels do NOT respond to the AR toggle; US/CA/EU DO', () => {
    const same = (l: Location, key: any) => {
      const ef = pickEF(l, key);
      return calcGas(ef, 1000, 'AR4').total === calcGas(ef, 1000, 'AR6').total;
    };
    // published-basis (CO2e baked into co2, ch4/n2o = 0) → GWP-invariant
    expect(same(loc({ country: 'UK', natural_gas_unit: 'kwh' }), 'natural_gas_kwh')).toBe(true);
    expect(same(loc({ country: 'AU', natural_gas_unit: 'm3' }), 'natural_gas_m3')).toBe(true);
    expect(same(loc({ country: 'NZ', natural_gas_unit: 'kwh' }), 'natural_gas_kwh')).toBe(true);
    // gas-split tables → GWP-sensitive
    expect(same(loc({ country: 'US' }), 'natural_gas_mcf')).toBe(false);
    expect(same(loc({ country: 'CA', grid_region: 'ON', natural_gas_unit: 'm3' }), 'natural_gas_m3')).toBe(false);
    expect(same(loc({ country: 'FR', natural_gas_unit: 'm3' }), 'natural_gas_m3')).toBe(false);
  });

  it('G5 EU_AT residual mix is not applicable (full-disclosure regime), ef 0 — NOT treated as zero-emission', () => {
    const r = getResidualFactor('EU_AT', 2024, 'AR6');
    expect(r.applicable).toBe(false);
    expect(r.ef).toBe(0);
  });

  it('G6 exclusiveEnd canonicalizes both bill-end conventions', () => {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(iso(exclusiveEnd(new Date(2024, 4, 31)))).toBe('2024-06-01'); // last-day-of-month → first of next
    expect(iso(exclusiveEnd(new Date(2024, 5, 1)))).toBe('2024-06-01');  // first-of-next-month → unchanged (already exclusive)
  });
});

// ── GROUP I — coverage_resolutions MUST persist (the write-only-feature fix) ──
// ghg_inventories.coverage_resolutions was a write-only feature: the save path
// never wrote the column, so every reload read []. These tests pin WHY the column
// must persist — they document the exact figure divergence a lost resolution causes,
// so nobody strips the persistence later thinking it inert.
describe('GROUP I — coverage_resolutions persistence contract', () => {
  const winStart = new Date(2024, 0, 1);
  const winEnd = new Date(2024, 11, 31); // reporting window for year 2024, FY-end Dec
  // One confirmed 9-month gas bill (Jan–Sep, 900 mcf). natural_gas_amount is 1200 —
  // the grossed-up figure applyResolutions wrote into locations_data last session.
  const nineMonthGasLoc = () => loc({
    has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'mcf',
    source_docs: [doc('utility_bill_gas', [prop({
      fuelType: 'natural_gas', value: 900, unit: 'mcf', periodStart: '2024-01-01', periodEnd: '2024-09-30',
    })])],
  });
  const extrapolateRes: CoverageResolution = {
    locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 9, pctEstimated: 25,
    note: '9 of 12 months; grossed ×12/9', acknowledgedAt: '2024-06-01T00:00:00Z',
  };

  it('I1 round-trip contract: applyResolutions with a 9/12 extrapolate gives value 1200 from rawSum 900; with [] gives 900 — and the two DIFFER', () => {
    const withRes = applyResolutions(nineMonthGasLoc(), [extrapolateRes], winStart, winEnd).natural_gas_amount;
    const without = applyResolutions(nineMonthGasLoc(), [], winStart, winEnd).natural_gas_amount;
    // Grossed up: 900 × 12/9 = 1200, with an adjustment on the figure.
    expect(withRes.rawSum).toBe(900);
    expect(withRes.value).toBeCloseTo(1200, 6);
    expect(withRes.adjustment?.kind).toBe('extrapolate');
    // Resolution lost → falls back to the raw source sum, silently, with no adjustment.
    expect(without.rawSum).toBe(900);
    expect(without.value).toBe(900);
    expect(without.adjustment).toBeNull();
    // THE divergence the missing column caused: same location, same bills, 1200 vs 900,
    // decided solely by whether the resolution survived the reload. This assertion is the
    // whole reason coverage_resolutions must persist — do not delete it.
    expect(withRes.value).not.toBe(without.value);
    expect(withRes.value - without.value).toBeCloseTo(300, 6);
  });

  it('I2 buildWorkings with [] emits NO coverage-resolution audit row, and the recomputed gas figure (900) contradicts the persisted grossed-up field (1200) — a DETECTABLE unexplained discrepancy', () => {
    const l = nineMonthGasLoc(); // locations_data persisted natural_gas_amount = 1200
    const rows = buildWorkings([l], 'AR6', 2024, [], 12);
    // No resolution on file → no audit row explaining any gross-up.
    const auditRow = rows.find(r => r.gwp_basis === 'coverage_resolution');
    expect(auditRow).toBeUndefined();
    // With the resolution gone, the workings gas figure silently reverts to the raw 900
    // (the "silent revert" consequence), while the persisted location field still reads 1200.
    const gas = ngRow(rows);
    expect(gas?.activity_data).toBe(900);
    expect(l.natural_gas_amount).toBe(1200);
    // Detectability: the recomputed workings figure disagrees with the persisted field AND
    // there is no coverage-resolution row to explain either number. If this state weren't
    // detectable we couldn't guard against it. (Sanity: WITH the resolution the two agree
    // and the audit row is present.)
    const inconsistentAndUnexplained = gas!.activity_data !== l.natural_gas_amount && !auditRow;
    expect(inconsistentAndUnexplained).toBe(true);

    const withRes = buildWorkings([l], 'AR6', 2024, [extrapolateRes], 12);
    expect(ngRow(withRes)?.activity_data).toBe(1200);
    expect(withRes.find(r => r.gwp_basis === 'coverage_resolution')).toBeDefined();
  });
});

// ── GROUP J — pctEstimated: estimation share weighted by EMISSIONS, not fuel count ──
// SBTi permits estimation but requires transparency about it. pctEstimated is the
// transparency figure: the share of Scope 1+2 tCO2e that is estimated (extrapolated
// from partial bills), weighted by emissions. These pin the weighting and the
// null-vs-zero contract (a wholly manual inventory has no evidence basis → null).
describe('GROUP J — pctEstimated', () => {
  const extrapolate = (fuelType: string, monthsCovered: number): CoverageResolution => ({
    locId: 'L1', fuelType, kind: 'extrapolate', monthsCovered, pctEstimated: (12 - monthsCovered) / 12 * 100,
    note: `${monthsCovered} of 12 months`, acknowledgedAt: '2024-06-01T00:00:00Z',
  });
  // A confirmed dated bill on the gas field → the location counts as concierge-read.
  const gasBill = (value: number, periodEnd: string) =>
    doc('utility_bill_gas', [prop({ fuelType: 'natural_gas', value, unit: 'mcf', periodStart: '2024-01-01', periodEnd })]);

  it('J1 one fuel, 1/12 months extrapolated, sole emission source → ≈91.7% estimated', () => {
    const l = loc({
      has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'mcf',
      source_docs: [gasBill(100, '2024-01-31')], // 1 month evidenced, grossed ×12 into the 1200 field
    });
    // 11/12 of the sole fuel's emissions are estimated → 91.67%.
    expect(pctEstimated([l], [extrapolate('natural_gas', 1)], 'AR6', 2024)).toBeCloseTo(91.67, 1);
  });

  it('J2 same 1/12 gas extrapolation, but electricity is 95% of tCO2e → estimation is SMALL (~4.6%), not 91.7% — weighting is by emissions, not fuel count', () => {
    // Derive electricity_kwh from the engine so electricity is exactly 19× the gas emissions
    // (gas = 5% of the S1+2 total). No hand-computed EFs → robust to factor-table changes.
    const gasT = calcLocation(loc({ has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf' }), 'AR6', 2024).s1_total;
    const gf = getGridFactor('US_AVG', 2024).ef; // resolved grid key (G1)
    const kwh = (19 * gasT * 1000) / gf; // electricity tCO2e = kwh·gf/1000 = 19·gasT
    const l = loc({
      has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf',
      grid_region: 'US_AVG', electricity_kwh: kwh,
      source_docs: [gasBill(1000 / 12, '2024-01-31')],
    });
    const pct = pctEstimated([l], [extrapolate('natural_gas', 1)], 'AR6', 2024);
    // (gasT × 11/12) / (20 × gasT) × 100 = (11/12)/20 × 100 ≈ 4.58 — NOT 91.7.
    expect(pct).toBeCloseTo(4.58, 1);
    expect(pct).toBeLessThan(10);
  });

  it('J3 fully evidenced 12/12 (no extrapolation) → 0% estimated', () => {
    const l = loc({
      has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'mcf',
      source_docs: [gasBill(1200, '2024-12-31')], // full-year bill, no resolution
    });
    expect(pctEstimated([l], [], 'AR6', 2024)).toBe(0);
  });

  it('J4 wholly manual inventory (no proposals, no resolutions) → null (an absence, not zero)', () => {
    const l = loc({ has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf' }); // source_docs: []
    expect(pctEstimated([l], [], 'AR6', 2024)).toBeNull();
  });

  it('J5 straddle "prorate" only, no extrapolate → 0% (proration allocates real metered data; it is not estimation)', () => {
    const l = loc({
      has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf',
      source_docs: [gasBill(1000, '2024-12-31')],
    });
    const strad: CoverageResolution = {
      locId: 'L1', fuelType: 'natural_gas', kind: 'straddle', straddleChoice: 'prorate',
      daysInYear: 20, totalDays: 31, note: 'prorated', acknowledgedAt: '2024-06-01T00:00:00Z',
    };
    expect(pctEstimated([l], [strad], 'AR6', 2024)).toBe(0);
  });
});

// ── GROUP K — unpriceable (country, unit) pairs refuse by name ────────────────
// Every natural-gas unit the Location type admits, against every country branch that does NOT
// publish a factor for it. Before the guard these split two ways for no defensible reason: the
// US/default branch returned a raw `undefined` and threw "undefined is not an object (evaluating
// 'ef.co2')" during render, while the other five spread the same missing key into `{}` and priced
// the figure as NaN — a wrong number rather than a visible failure. Both are now the same refusal.
//
// These pairs are REACHABLE, not hypothetical: SELECTOR_UNITS in lib/unitConversions.ts is the
// global five-unit list with no country dimension, so a concierge proposal read off an m3 bill is
// Tier-1 "already canonical" and its unit is written straight onto a US location.
describe('GROUP K — a factor the tables do not carry is refused, not priced', () => {
  const unpriceable: Array<{ country: string; unit: 'm3' | 'kwh'; key: string }> = [
    { country: 'US', unit: 'm3',  key: 'natural_gas_m3' },   // ← the reported crash
    { country: 'US', unit: 'kwh', key: 'natural_gas_kwh' },
    { country: 'CA', unit: 'kwh', key: 'natural_gas_kwh' },
    { country: 'GB', unit: 'm3',  key: 'natural_gas_m3' },
    { country: 'FR', unit: 'kwh', key: 'natural_gas_kwh' },  // EU branch
    { country: 'AU', unit: 'kwh', key: 'natural_gas_kwh' },
    { country: 'NZ', unit: 'm3',  key: 'natural_gas_m3' },
  ];

  for (const { country, unit, key } of unpriceable) {
    it(`K ${country} + ${unit} throws MissingEmissionFactorError naming fuel, unit and country`, () => {
      const l = loc({ country, has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: unit });

      expect(() => calcGas(pickEF(l, key as any), 1000, 'AR6')).toThrow(MissingEmissionFactorError);

      // The message must carry enough for a customer-facing string to be built from it later.
      try {
        calcGas(pickEF(l, key as any), 1000, 'AR6');
        throw new Error('expected a throw');
      } catch (e) {
        const err = e as MissingEmissionFactorError;
        expect(err.name).toBe('MissingEmissionFactorError');
        expect(err.fuel).toBe('natural_gas');
        expect(err.unit).toBe(unit);
        expect(err.country).toBe(country);
        expect(err.factorKey).toBe(key);
        expect(err.message).toContain(unit);
        expect(err.message).toContain(country);
      }

      // calcLocation is the per-location price and still refuses outright…
      expect(() => calcLocation(l, 'AR6', 2024)).toThrow(MissingEmissionFactorError);
      // …but calcInventory EXCLUDES rather than throws, so one bad location cannot take the
      // dashboard down. Excluded, not zeroed: see GROUP L for what that distinction buys.
      expect(() => calcInventory([l], 'AR6', 2024)).not.toThrow();
      expect(findUnpriceableLocations([l], 'AR6', 2024)).toEqual([
        { locId: l.id, locName: l.name, fuel: 'natural_gas', unit, country },
      ]);
    });
  }

  it('K blank country is still named, not reported as undefined', () => {
    const l = loc({ country: '', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' });
    expect(() => calcLocation(l, 'AR6', 2024)).toThrow(/\(unset\)/);
  });

  it('K every priceable (country, unit) pair still prices — the guard refuses absence, not everything', () => {
    const priceable: Array<{ country: string; unit: 'mcf' | 'therms' | 'mmbtu' | 'm3' | 'kwh'; key: string }> = [
      { country: 'US', unit: 'mcf',    key: 'natural_gas_mcf' },
      { country: 'US', unit: 'therms', key: 'natural_gas_therms' },
      { country: 'US', unit: 'mmbtu',  key: 'natural_gas_mmbtu' },
      { country: 'CA', unit: 'm3',     key: 'natural_gas_m3' },
      { country: 'CA', unit: 'mcf',    key: 'natural_gas_mcf' },
      { country: 'GB', unit: 'kwh',    key: 'natural_gas_kwh' },
      { country: 'FR', unit: 'm3',     key: 'natural_gas_m3' },
      { country: 'AU', unit: 'm3',     key: 'natural_gas_m3' },
      { country: 'NZ', unit: 'kwh',    key: 'natural_gas_kwh' },
    ];
    for (const { country, unit, key } of priceable) {
      const l = loc({ country, grid_region: country === 'CA' ? 'ON' : '', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: unit });
      const total = calcGas(pickEF(l, key as any), 1000, 'AR6').total;
      expect(Number.isFinite(total), `${country} + ${unit} should price`).toBe(true);
      expect(total).toBeGreaterThan(0);
    }
  });
});

// ── GROUP L — one unpriceable location does not take the inventory with it ────
// The isolation contract: the dashboard renders, priceable locations keep their figures, and the
// blocked one is EXCLUDED (contributing nothing) rather than counted as zero — with the exclusion
// stated in the workings, which is what the saved inventory persists.
describe('GROUP L — unpriceable locations are isolated, excluded, and recorded', () => {
  const good = () => loc({ id: 'GOOD', name: 'Priceable Site', country: 'US', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf' });
  const bad = () => loc({ id: 'BAD', name: 'Blocked Site', country: 'US', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' });

  it('L1 a mixed inventory still totals, and the priceable location keeps its exact figure', () => {
    const aloneTotal = calcInventory([good()], 'AR6', 2024).s1_total;
    const mixed = calcInventory([good(), bad()], 'AR6', 2024);
    expect(aloneTotal).toBeGreaterThan(0);
    expect(mixed.s1_total).toBe(aloneTotal); // unchanged by the blocked neighbour
  });

  it('L2 the blocked location is EXCLUDED, not counted as zero — order does not matter', () => {
    const first = calcInventory([bad(), good()], 'AR6', 2024);
    const last = calcInventory([good(), bad()], 'AR6', 2024);
    expect(first).toEqual(last);
    // Excluded means "absent from the sum", which is only distinguishable from a zero contribution
    // by what the caller is told — hence findUnpriceableLocations and the workings row below.
    expect(findUnpriceableLocations([good(), bad()], 'AR6', 2024).map(u => u.locId)).toEqual(['BAD']);
  });

  it('L3 every scope is excluded, including electricity the location COULD be priced for', () => {
    // Whole-location exclusion (the decision): its electricity is priceable on its own, and is
    // still left out, because a part-priced location would put a knowingly-short figure in a total.
    const badWithPower = loc({ ...bad(), grid_region: 'US_CA', electricity_kwh: 50_000 });
    const inv = calcInventory([badWithPower], 'AR6', 2024);
    expect(inv.s1_total).toBe(0);
    expect(inv.s2_location).toBe(0);
    expect(calcInventory([loc({ ...good(), grid_region: 'US_CA', electricity_kwh: 50_000 })], 'AR6', 2024).s2_location).toBeGreaterThan(0);
  });

  it('L4 buildWorkings does not throw, emits NO priced rows for the blocked location, and records why', () => {
    const rows = buildWorkings([good(), bad()], 'AR6', 2024, [], 12);
    const badRows = rows.filter(r => r.location === 'Blocked Site');
    expect(badRows).toHaveLength(1);
    expect(badRows[0].declaration).toBe('unpriceable');
    expect(badRows[0].result_tco2e).toBeNull();       // an absence never renders as 0
    expect(badRows[0].note).toMatch(/EXCLUDED FROM TOTALS/);
    expect(badRows[0].unpriceable).toEqual({ fuel: 'natural_gas', unit: 'm3', country: 'US' });
    // …while the priceable location's rows are untouched.
    expect(rows.filter(r => r.location === 'Priceable Site' && r.result_tco2e! > 0).length).toBeGreaterThan(0);
  });

  it('L5 pctEstimated measures the estimated share against the same excluded set', () => {
    // Blocked location out of BOTH numerator and denominator — otherwise its estimated emissions
    // would be weighed against a total it is not part of.
    expect(() => pctEstimated([good(), bad()], [], 'AR6', 2024)).not.toThrow();
    expect(pctEstimated([good(), bad()], [], 'AR6', 2024)).toBe(pctEstimated([good()], [], 'AR6', 2024));
  });

  it('L6 the probe is GWP-independent — the same locations are excluded on AR4, AR5 and AR6', () => {
    // This is what licenses the component probing once at AR6 and reusing the answer for all three
    // bases. Whether a factor EXISTS is a property of the table, not of the GWP version.
    const ls = [good(), bad()];
    const ids = (g: 'AR4' | 'AR5' | 'AR6') => findUnpriceableLocations(ls, g, 2024).map(u => u.locId);
    expect(ids('AR4')).toEqual(['BAD']);
    expect(ids('AR5')).toEqual(['BAD']);
    expect(ids('AR6')).toEqual(['BAD']);
  });

  it('L7 a non-pricing error is NOT absorbed as an exclusion', () => {
    // The catch is narrowed to MissingEmissionFactorError on purpose: a bug in the arithmetic must
    // not quietly become "this location is excluded", which would hide it behind a customer-facing
    // message about units.
    const exploding = new Proxy(good(), {
      get(t, p) { if (p === 'has_propane') throw new TypeError('boom'); return (t as any)[p] },
    }) as Location;
    expect(() => calcInventory([exploding], 'AR6', 2024)).toThrow(TypeError);
    expect(() => findUnpriceableLocations([exploding], 'AR6', 2024)).toThrow(TypeError);
  });
});

// ── M. RECOMPUTATION: a verifier retyping the table must land on the number we printed ────────────
//
// THE DEFECT THIS PINS. emission_factor_display rounded with toFixed(3), so a natural-gas factor of
// 1.9316576 kg CO₂e/m³ printed as "1.932". A verifier retyping 120,000 m³ × 1.932 got 231,840 kg
// against our stated 231,798.9 — a 41 kg divergence, on EVERY priced row, on the one surface whose
// whole purpose is to be reproducible. Nothing failed; the arithmetic was right and the evidence for
// it was wrong.
//
// The assertion is the verifier's own procedure, not a paraphrase of it: parse the number back OUT of
// the rendered string and multiply it by the rendered activity data. If that does not reach the
// rendered result, the row cannot be checked by hand and the workings table is decoration.
describe('M. workings rows recompute from what they display', () => {
  // The tolerance is the precision a verifier reads results at — result_tco2e renders to 3–4 dp — so
  // 1e-6 tCO2e (one milligram) is far inside it while still catching a rounded factor.
  const TOL = 1e-6

  const priced = (rows: any[]) => rows.filter(r =>
    r.result_tco2e != null && r.activity_data > 0 && typeof r.emission_factor_display === 'string' &&
    /[\d.]/.test(r.emission_factor_display) && r.declaration === undefined && r.gwp_basis !== 'coverage_resolution')

  // Pulls the leading number out of "1.9316576 kg CO₂e/m³" the way a reader would.
  const displayedFactor = (s: string): number => Number(String(s).match(/^-?[\d.]+/)?.[0])

  const everyRowRecomputes = (rows: any[], label: string) => {
    const rs = priced(rows)
    expect(rs.length, `${label}: no priced rows — the assertion would pass vacuously`).toBeGreaterThan(0)
    for (const r of rs) {
      const f = displayedFactor(r.emission_factor_display)
      expect(Number.isFinite(f), `${label}: ${r.source} — factor not parseable from "${r.emission_factor_display}"`).toBe(true)
      const recomputed = r.activity_data * f / 1000
      expect(Math.abs(recomputed - r.result_tco2e),
        `${label}: ${r.source} — displayed ${r.activity_data} × ${f} = ${recomputed} tCO2e, row states ${r.result_tco2e}`,
      ).toBeLessThan(TOL)
    }
  }

  it('M1 the natural-gas m³ row that started this: 120,000 m³ recomputes exactly', () => {
    // CA, not GB: the 1.9316576 kg CO₂e/m³ factor is the ECCC one. GB/UK publish no m³ natural-gas
    // factor at all, so that location is 'unpriceable' and emits no priced row — which is what the
    // first draft of this test hit, and a useful reminder that the fixture has to be a location the
    // engine can actually price.
    const l = { ...loc(), name: 'CA site', country: 'CA',
      has_natural_gas: true, natural_gas_amount: 120000, natural_gas_unit: 'm3' } as any
    const rows = buildWorkings([l], 'AR6', 2024, []);
    const gas = rows.find((r: any) => r.source === 'Natural gas')!
    // The factor must NOT be the rounded form that produced the 41 kg divergence.
    expect(gas.emission_factor_display).not.toContain('1.932 ')
    everyRowRecomputes(rows, 'M1')
  })

  it('M2 every priced row across fuels, electricity, steam and refrigerant recomputes', () => {
    const l = { ...loc(), name: 'Mixed', country: 'US', grid_region: 'US_CA',
      has_natural_gas: true, natural_gas_amount: 5000, natural_gas_unit: 'mcf',
      has_propane: true, propane_amount: 900, propane_unit: 'gallons',
      has_diesel_stationary: true, diesel_stationary_amount: 400, diesel_stationary_unit: 'gallons',
      has_mobile: true, gasoline_amount: 1200, gasoline_unit: 'gallons',
      diesel_mobile_amount: 700, diesel_mobile_unit: 'gallons',
      electricity_kwh: 250000, renewable_electricity_kwh: 50000,
      has_purchased_steam: true, purchased_steam_mmbtu: 300, purchased_steam_unit: 'mmbtu' } as any
    everyRowRecomputes(buildWorkings([l], 'AR6', 2024, []), 'M2')
  })

  it('M3 holds under AR4 and AR5 too — the factor is combined at the selected set', () => {
    const l = { ...loc(), name: 'EU site', country: 'DE', grid_region: 'EU_DE',
      has_natural_gas: true, natural_gas_amount: 8000, natural_gas_unit: 'm3',
      electricity_kwh: 90000 } as any
    for (const gwp of ['AR4', 'AR5', 'AR6'] as const) everyRowRecomputes(buildWorkings([l], gwp, 2024, []), `M3 ${gwp}`)
  })
})

// ── N. EVERY STREAM PRODUCES A ROW, IN EVERY STATE ───────────────────────────────────────────────
//
// The defect: `has_diesel_stationary: true` with `diesel_stationary_amount: 0` failed the priced-row
// condition (`flag && amount > 0`) AND passed the declaration loop's `streamHasData` (bare flag), so
// the stream produced NO ROW AT ALL — not priced, not attested, not undeclared. The customer had
// affirmatively said the site burns diesel, and the workings a verifier reads said nothing whatever
// about it. The same hole existed for natural gas, propane, fuel oil, mobile and refrigerants.
//
// These tests do NOT check the specific conditions — that would just be a third copy of the thing that
// drifted. They check the PROPERTY: across every stream and every combination of declaration and
// quantity, the count of rows for that stream is never zero.
describe('N. no stream can be silent', () => {
  // Per stream: how to declare it, and how to quantify it. Split deliberately — the two signals are
  // applied independently below so all four combinations get exercised, including the stale-data case
  // (an amount left behind after the box was unchecked).
  const FIXTURES: Record<DeclarableStream, { declare: Partial<Location>; quantify: Partial<Location> }> = {
    natural_gas:       { declare: { has_natural_gas: true },       quantify: { natural_gas_amount: 500 } },
    propane:           { declare: { has_propane: true },           quantify: { propane_amount: 200 } },
    diesel_stationary: { declare: { has_diesel_stationary: true }, quantify: { diesel_stationary_amount: 300 } },
    fuel_oil_distillate: { declare: { has_fuel_oil_distillate: true }, quantify: { fuel_oil_distillate_amount: 400 } },
    fuel_oil_residual: { declare: { has_fuel_oil_residual: true },  quantify: { fuel_oil_residual_amount: 400 } },
    mobile:            { declare: { has_mobile: true },            quantify: { diesel_mobile_amount: 900 } },
    refrigerants:      { declare: { has_hfc_refrigerants: true },  quantify: { refrigerant_purchased_kg: 12 } },
    purchased_steam:   { declare: { has_purchased_steam: true },   quantify: { purchased_steam_mmbtu: 100 } },
    // Electricity has NO checkbox in the wizard — the kWh field is both signals at once, so its
    // declared-unquantified state is unreachable by construction. Same entry for both keys records
    // that rather than hiding it; the four combinations below collapse to two, and still never zero.
    electricity:       { declare: { electricity_kwh: 850_000, grid_region: 'US_CA' },
                         quantify: { electricity_kwh: 850_000, grid_region: 'US_CA' } },
  };

  const rowsFor = (s: DeclarableStream, declared: boolean, quantified: boolean) => {
    const f = FIXTURES[s];
    const l = loc({ ...(declared ? f.declare : {}), ...(quantified ? f.quantify : {}) });
    return buildWorkings([l], 'AR6', 2024, [], 12).filter((r: any) => r.stream === s);
  };

  it('N1 every stream emits at least one row in all four declared/quantified combinations', () => {
    // THE CENTRAL ASSERTION. 8 streams x 4 combinations = 32 cases, none of which may vanish.
    const silent: string[] = [];
    for (const s of DECLARABLE_STREAMS) {
      for (const declared of [true, false]) {
        for (const quantified of [true, false]) {
          if (rowsFor(s, declared, quantified).length === 0) {
            silent.push(`${s} (declared=${declared}, quantified=${quantified})`);
          }
        }
      }
    }
    expect(silent, `these stream/state combinations produced NO ROW — the stream is invisible to a verifier:\n${silent.join('\n')}`).toEqual([]);
  });

  it('N2 the three states map to three distinct row kinds', () => {
    for (const s of DECLARABLE_STREAMS) {
      const undeclared = rowsFor(s, false, false);
      const declaredOnly = rowsFor(s, true, false);
      const priced = rowsFor(s, true, true);

      expect(undeclared.map((r: any) => r.declaration), `${s} undeclared`).toEqual(['undeclared']);
      expect(priced.every((r: any) => r.declaration === undefined), `${s} priced rows carry no declaration`).toBe(true);
      expect(priced.length, `${s} produced no priced row`).toBeGreaterThan(0);

      if (s === 'electricity') continue; // no checkbox — declare implies quantify, see FIXTURES
      expect(declaredOnly.map((r: any) => r.declaration), `${s} declared but unquantified`).toEqual(['declared_unquantified']);
    }
  });

  it('N3 declared-but-unquantified is NOT collapsed into NOT DECLARED', () => {
    // The requirement this test exists for: "we use diesel here, and no figure for it is in the
    // report" is a stronger and more concerning assertion than "nobody has been asked about diesel".
    // Present is not enough — the two rows must READ differently to whoever is reviewing them.
    const declared = rowsFor('diesel_stationary', true, false)[0] as any;
    const undeclared = rowsFor('diesel_stationary', false, false)[0] as any;

    expect(declared.declaration).not.toBe(undeclared.declaration);
    expect(declared.note).not.toBe(undeclared.note);
    expect(declared.note).toContain('DECLARED, NOT QUANTIFIED');
    expect(undeclared.note).toContain('NOT DECLARED');
    // Both are absences of a figure, so neither may render as a number a verifier could add up.
    expect(declared.result_tco2e).toBeNull();
    expect(undeclared.result_tco2e).toBeNull();
    // And the wording names the stream in the same words the customer was asked in.
    expect(declared.note).toContain(STREAM_META.diesel_stationary.name);
  });

  it('N4 no stream ever gets BOTH a priced row and a declaration row', () => {
    // The other direction of the same invariant. If the declaration trigger ever drifted back toward
    // duplicating the pricing condition, the likely symptom is a duplicate: a stream priced AND
    // reported undeclared on the same location, which would double-report it to a verifier.
    for (const s of DECLARABLE_STREAMS) {
      for (const declared of [true, false]) {
        for (const quantified of [true, false]) {
          const rows = rowsFor(s, declared, quantified) as any[];
          const hasPriced = rows.some(r => r.declaration === undefined);
          const hasDeclaration = rows.some(r => r.declaration !== undefined);
          expect(hasPriced && hasDeclaration, `${s} (declared=${declared}, quantified=${quantified}) emitted both`).toBe(false);
        }
      }
    }
  });

  it('N5 an amount left behind after the box is unchecked reads as NOT DECLARED, not as data', () => {
    // The fourth combination, called out separately because it is the one a customer can reach by
    // changing their mind: the figure is still in the record, but nobody is currently asserting the
    // stream exists. It must not price, and it must not be silent.
    const rows = rowsFor('propane', false, true) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].declaration).toBe('undeclared');
    expect(rows[0].result_tco2e).toBeNull();
  });

  it('N6 ammonia is declared and reported, though it is deliberately never priced', () => {
    // NH3 has no global warming potential, so the refrigerant row is gated on `!uses_ammonia` and an
    // ammonia site NEVER produces a priced row. Under the old bare-flag check that made it invisible
    // even with a recharge figure on file — the hole at its widest, because the quantity was there.
    const l = loc({ uses_ammonia: true, refrigerant_purchased_kg: 50 });
    const rows = buildWorkings([l], 'AR6', 2024, [], 12).filter((r: any) => r.stream === 'refrigerants') as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].declaration).toBe('declared_unquantified');
  });

  it('N7 an attestation still answers NOT DECLARED, and cannot cover a declared stream', () => {
    const att: StreamAttestation[] = [{ stream: 'fuel_oil_distillate', attested_at: '2026-08-13T00:00:00Z' }];
    const absent = buildWorkings([loc({ stream_attestations: att })], 'AR6', 2024, [], 12)
      .filter((r: any) => r.stream === 'fuel_oil_distillate') as any[];
    expect(absent[0].declaration).toBe('attested_absent');
    expect(absent[0].result_tco2e).toBe(0); // a CLAIM of no emissions, not an absence

    // Contradiction: the site attests fuel oil absent AND reports using it. The declared state wins,
    // because that is the one a verifier has to resolve.
    const both = buildWorkings([loc({ has_fuel_oil_distillate: true, stream_attestations: att })], 'AR6', 2024, [], 12)
      .filter((r: any) => r.stream === 'fuel_oil_distillate') as any[];
    expect(both).toHaveLength(1);
    expect(both[0].declaration).toBe('declared_unquantified');
  });

  it('N8 streamState agrees with the rows for every stream and combination', () => {
    // streamState is what the export gate reads; the rows are what a verifier reads. They are derived
    // by different routes on purpose (predicate vs observed rows), so this pins them together.
    for (const s of DECLARABLE_STREAMS) {
      for (const declared of [true, false]) {
        for (const quantified of [true, false]) {
          const f = FIXTURES[s];
          const l = loc({ ...(declared ? f.declare : {}), ...(quantified ? f.quantify : {}) });
          const rows = buildWorkings([l], 'AR6', 2024, [], 12).filter((r: any) => r.stream === s) as any[];
          const state = streamState(l, s);
          const expected = rows.some(r => r.declaration === undefined) ? 'quantified'
            : rows[0].declaration === 'declared_unquantified' ? 'declared_unquantified' : 'undeclared';
          expect(state, `${s} (declared=${declared}, quantified=${quantified})`).toBe(expected);
        }
      }
    }
  });

  it('N9 the export gate blocks declared-but-unquantified, and no case is loosened', () => {
    // A TIGHTENING, pinned so it is a deliberate property rather than a side effect. Before this
    // change a location that said it burns diesel and gave no figure PASSED the gate and exported an
    // inventory silently missing that stream.
    const gap = findUndeclaredStreams([loc({ has_diesel_stationary: true })]);
    expect(gap.some(g => g.stream === 'diesel_stationary' && g.state === 'declared_unquantified')).toBe(true);

    // Quantified streams never block.
    const ok = findUndeclaredStreams([loc({ has_diesel_stationary: true, diesel_stationary_amount: 300 })]);
    expect(ok.some(g => g.stream === 'diesel_stationary')).toBe(false);

    // An attestation still clears an undeclared stream.
    const attested = findUndeclaredStreams([loc({ stream_attestations: [{ stream: 'propane', attested_at: 'x' }] })]);
    expect(attested.some(g => g.stream === 'propane')).toBe(false);
  });
});

// ── N10. GOLDEN REGRESSION — THIS FIX MOVES NO NUMBER ────────────────────────────────────────────
describe('N10. the golden inventory is unchanged', () => {
  const golden = (): Location => loc({
    country: 'CA', province: 'ON', grid_region: 'ON',
    has_natural_gas: true, natural_gas_amount: 120_000, natural_gas_unit: 'm3',
    has_mobile: true, diesel_mobile_amount: 5_000, diesel_mobile_unit: 'litres',
    has_hfc_refrigerants: true, refrigerant_type: 'r410a', refrigerant_purchased_kg: 12,
    electricity_kwh: 850_000,
  });

  it('ON, RY2025, gas 120,000 m3 + diesel mobile 5,000 L + R-410A 12 kg + 850,000 kWh = 304.6176 tCO2e', () => {
    const t = calcInventory([golden()], 'AR6', 2025) as any;
    expect(t.s1_total + t.s2_location).toBeCloseTo(304.6176, 4);
    // The components, so a future failure says WHICH one moved rather than only that the total did.
    expect(t.s1_total).toBeCloseTo(272.317564, 6);   // gas 231.798912 + diesel 13.446652 + R-410A 27.072
    expect(t.s2_location).toBeCloseTo(32.3, 6);      // 850,000 kWh x ON 2025 grid 0.038
  });

  it('the declaration rows carry no figure, so the workings still sum to the same total', () => {
    const rows = buildWorkings([golden()], 'AR6', 2025, [], 12) as any[];
    const scope12 = rows.filter(r => r.result_tco2e != null && r.scope !== 3 && r.scope2_method !== 'market-based');
    expect(scope12.reduce((n, r) => n + r.result_tco2e, 0)).toBeCloseTo(304.6176, 4);
    // Four streams are absent from this site and every one of them is on the record as absent.
    const declarations = rows.filter(r => r.declaration).map(r => r.stream).sort();
    expect(declarations).toEqual(['diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual', 'propane', 'purchased_steam']);
  });
});

// ── O. THE NZ T&D ROW STATES THE FACTOR'S OWN VINTAGE, NOT THE INVENTORY'S ───────────────────────
//
// nzTdLoss returned a bare number, so the workings row had no provenance to print and stamped
// `factor_vintage: String(year)` — the INVENTORY year. NZ_TD_LOSS holds exactly one key (2025), so
// every NZ inventory receives the 2025 factor while the row asserted the factor was contemporaneous
// with the reporting year: a 2026 inventory printed "factor_vintage 2026" beside a 2025 figure.
//
// A stale factor applied silently is one defect. A stale factor with a FALSE vintage printed next to
// it is worse: the column exists precisely so a verifier does not have to take the year on trust, and
// a wrong value there is not a gap, it is a wrong answer to the question the column asks.
//
// The market-based row next to it already did this correctly — getResidualFactor returns
// { ef, vintage, note } and the row stamps res.vintage and appends res.note. These tests pin the T&D
// row to that same contract.
describe('O. NZ T&D losses carry their own vintage and disclose a fallback', () => {
  const nzLoc = () => loc({ country: 'NZ', grid_region: 'NZ', electricity_kwh: 100_000, nz_td_losses: true });
  const tdRow = (year: number) =>
    buildWorkings([nzLoc()], 'AR6', year, [], 12).find((r: any) => r.scope === 3) as any;

  it('O1 the table still holds exactly one year — the premise these tests rest on', () => {
    // If a second key is ever added, O2/O3 stop testing a fallback and start testing an exact hit.
    // Pinned so that addition is a deliberate act rather than a silent change of what O2/O3 mean.
    expect(Object.keys(NZ_TD_LOSS)).toEqual(['2025']);
  });

  it('O2 a 2026 inventory stamps the FACTOR year, not the inventory year', () => {
    // THE DEFECT. Was 'factor_vintage: "2026"' over a 2025 factor.
    const r = tdRow(2026);
    expect(r.factor_vintage, 'the row must not claim a vintage the factor does not have').toBe('MfE 2025');
    expect(r.factor_vintage).not.toBe('2026');
  });

  it('O3 the fallback is DISCLOSED, in the same style as the residual helpers', () => {
    // getResidualFactor: 'AIB 2024 residual mix applied to 2026 inventory (latest vintage held).'
    // Same spelling as getResidualFactor and getGridFactor — one vocabulary across all three helpers.
    const r = tdRow(2026);
    expect(r.ef_source).toContain('MfE 2025 T&D loss factor applied to 2026 inventory (latest vintage held).');
    // The source citation itself survives — the note is appended, not substituted.
    expect(r.ef_source).toContain('T&D losses (Scope 3 Cat 3)');
  });

  it('O4 NO note when the factor year and the inventory year match', () => {
    const r = tdRow(2025);
    expect(r.factor_vintage).toBe('MfE 2025');
    expect(r.ef_source, 'a matching year has nothing to disclose').not.toContain('applied to');
  });

  it('O5 resolving FORWARD says so, rather than claiming the latest vintage', () => {
    // `let ty = years[0]` means a 2023 or 2024 inventory — both selectable in the wizard today —
    // resolves forward to the 2025 factor, so a "latest" claim would say the opposite of what
    // happened. The note must also not blame MfE: they publish an annual T&D series back to 2010, so
    // the missing years are OURS. It claims only our own coverage — see the note in nzTdLoss.
    for (const y of [2023, 2024]) {
      const r = tdRow(y);
      expect(r.factor_vintage, `inv ${y}`).toBe('MfE 2025');
      expect(r.ef_source, `inv ${y}`).toContain(`MfE 2025 T&D loss factor applied to ${y} inventory (earliest vintage held).`);
      // TRACKS THE LIVE WORDING. This read `.not.toContain('latest available')`; once that spelling was
      // retired the assertion could never fail again — a guard that had quietly stopped guarding.
      expect(r.ef_source, `inv ${y} must not claim the latest vintage`).not.toContain('latest vintage held');
    }
  });

  it('O6 nzTdLoss returns the residual-helper shape', () => {
    expect(nzTdLoss(2025)).toEqual({ ef: 0.00596, vintage: 'MfE 2025', note: '' });
    expect(nzTdLoss(2026).ef).toBe(0.00596);
    expect(nzTdLoss(2026).note).not.toBe('');
  });

  it('O7 REGRESSION — no figure moved: the calc term and the row still agree, and still exclude S2', () => {
    // This is a provenance fix. calcLocation and buildWorkings share nzTdLoss precisely so the calc
    // term and the workings row cannot diverge; changing the return shape must not break that.
    for (const y of [2023, 2025, 2026]) {
      const c = calcLocation(nzLoc(), 'AR6', y);
      expect(c.s3_td, `inv ${y}`).toBeCloseTo(100_000 * 0.00596 / 1000, 9);
      expect(tdRow(y).result_tco2e, `inv ${y} row vs calc`).toBeCloseTo(c.s3_td, 9);
      expect(tdRow(y).emission_factor).toBe('0.00596 kg CO₂e/kWh');
      // Still Scope 3, still out of every Scope 2 total.
      expect(tdRow(y).scope).toBe(3);
      expect(c.s2_location).toBeCloseTo(100_000 * getGridFactor('NZ', y).ef / 1000, 9);
    }
  });
});

// ── P. THE ELECTRICITY ROWS CITE WHAT PRICED THEM, AND DISCLOSE A STALE VINTAGE ──────────────────
//
// Two defects, one block.
//
// (1) CITATION. When no residual mix applies, the market-based row is priced by the LOCATION GRID
//     FACTOR (`mktEf = res.applicable ? res.ef : gf.ef`) — but it cited Green-e/AIB and stamped no
//     vintage at all, because res.vintage is 'n/a' on that path. A US site with no eGRID subregion
//     selected showed a 2023 grid factor under a Green-e citation with an empty vintage column: both
//     structured fields a verifier reads pointed away from the number in front of them.
//
// (2) DISCLOSURE. 80 of 103 GRID_EF keys resolve to 2023 for a 2026 inventory. factor_vintage was
//     always the factor's own year, so nothing was WRONG — but a bare year is not a disclosure, and
//     the reader has to notice the mismatch and then interpret it.
//
// These tests also pin all five getResidualFactor note strings, which had NO test coverage of any
// kind before this section — the style the grid note was modelled on was itself unguarded.
describe('P. electricity rows: citation and fallback disclosure', () => {
  const elec = (l: Location, y: number) =>
    (buildWorkings([l], 'AR6', y, [], 12) as any[]).filter(r => r.stream === 'electricity' && !r.declaration);
  const byMethod = (l: Location, y: number) => {
    const rows = elec(l, y);
    return { lb: rows.find(r => r.scope2_method === 'location-based'), mb: rows.find(r => r.scope2_method === 'market-based') };
  };
  const usCa = () => loc({ country: 'US', state: 'CA', grid_region: 'US_CA', electricity_kwh: 100_000 });
  const on = () => loc({ country: 'CA', province: 'ON', grid_region: 'ON', electricity_kwh: 100_000 });
  const euDe = () => loc({ country: 'DE', grid_region: 'EU_DE', electricity_kwh: 100_000 });

  it('P1 BACKWARD fallback — US_CA at 2026 discloses on BOTH rows, vintage 2023 on both', () => {
    const { lb, mb } = byMethod(usCa(), 2026);
    const note = 'Grid factor for 2023 applied to 2026 inventory (latest vintage held).';
    expect(lb.factor_vintage).toBe('2023');
    expect(lb.ef_source).toContain(note);
    // Both rows are priced by the SAME factor here, so both must say so.
    expect(mb.factor_vintage, 'market-based vintage was null before this fix').toBe('2023');
    expect(mb.ef_source).toContain(note);
  });

  it('P2 FORWARD fallback — ON at 2023 says "earliest", never "latest"', () => {
    // `let best = years[0]` resolves forward when the inventory year precedes every key. 2023 is
    // selectable in the wizard and ON's earliest key is 2024, so this is live, not hypothetical.
    const { lb, mb } = byMethod(on(), 2023);
    const note = 'Grid factor for 2024 applied to 2023 inventory (earliest vintage held).';
    expect(lb.factor_vintage).toBe('2024');
    expect(lb.ef_source).toContain(note);
    expect(lb.ef_source, 'a forward resolution must not claim the latest vintage').not.toContain('latest vintage held');
    expect(mb.factor_vintage).toBe('2024');
    expect(mb.ef_source).toContain(note);
  });

  it('P3 EXACT match emits no note at all', () => {
    const { lb } = byMethod(on(), 2026);
    expect(lb.factor_vintage).toBe('2026');
    expect(lb.ef_source).toBe(EF_SOURCES.electricity_ca);   // citation only, nothing appended
    expect(lb.ef_source).not.toContain('applied to');
  });

  it('P4 no residual mix → the market row cites the GRID source, not Green-e, and carries a vintage', () => {
    // THE FALSEHOOD THIS FIXES. Before: ef_source began with the Green-e citation and factor_vintage
    // was absent, on a row priced by eGRID.
    const { lb, mb } = byMethod(usCa(), 2026);
    expect(mb.ef_source.startsWith(EF_SOURCES.electricity_us), 'must lead with what priced the row').toBe(true);
    expect(mb.ef_source, 'Green-e did not price this row').not.toContain('Green-e');
    expect(mb.factor_vintage).not.toBeUndefined();
    expect(mb.factor_vintage).not.toBeNull();
    // The residual helper's own fallback note survives — it is why the grid factor is here at all.
    expect(mb.ef_source).toContain('market-based falls back to location factor.');
    // And the two rows now agree on the factor they share.
    expect(mb.emission_factor).toBe(lb.emission_factor);
  });

  it('P5 residual APPLICABLE → the market row is untouched, and carries NO grid note', () => {
    // EU_DE has an AIB residual mix, so res.ef prices this row and gf.ef does not. A grid-vintage note
    // here would describe a factor the row never used — the same class of falsehood as P4, inverted.
    const { lb, mb } = byMethod(euDe(), 2026);
    expect(mb.factor_vintage).toBe('AIB 2024');
    expect(mb.ef_source.startsWith(EF_SOURCES.residual_eu)).toBe(true);
    expect(mb.ef_source).toContain('AIB 2024 residual mix applied to 2026 inventory (latest vintage held).');
    expect(mb.ef_source, 'the grid note must not ride along when the grid factor did not price the row')
      .not.toContain('Grid factor for');
    // The location-based row beside it DOES disclose — EEA 2023 against a 2026 inventory.
    expect(lb.ef_source).toContain('Grid factor for 2023 applied to 2026 inventory (latest vintage held).');
    expect(mb.emission_factor).not.toBe(lb.emission_factor);   // genuinely different factors
  });

  it('P6 all five getResidualFactor note strings, verbatim — previously untested', () => {
    // Zero coverage before this: grep for these strings across *.test.ts returned only section O's
    // comment quoting one of them as the style being copied.
    expect(getResidualFactor('EU_DE', 2026, 'AR6').note)
      .toBe('AIB 2024 residual mix applied to 2026 inventory (latest vintage held).');
    expect(getResidualFactor('EU_DE', 2024, 'AR6').note, 'exact year → silence').toBe('');
    expect(getResidualFactor('EU_AT', 2024, 'AR6').note)
      .toBe('Full-disclosure regime — no residual mix published; market-based falls back to location factor.');
    expect(getResidualFactor('EU_ZZ', 2024, 'AR6').note)
      .toBe('No published residual mix for this region; market-based falls back to location factor.');
    expect(getResidualFactor('CAMX', 2026, 'AR6').note)
      .toBe('Green-e 2025 [2023 data] residual mix applied to 2026 inventory (latest vintage held).');
    expect(getResidualFactor('CAMX', 2023, 'AR6').note, 'exact year → silence').toBe('');
    expect(getResidualFactor('', 2026, 'AR6').note)
      .toBe('No published residual mix for this subregion; market-based falls back to location factor.');
    // AT is applicable:false but NOT a coverage gap — it must never read as a zero-emission mix.
    expect(getResidualFactor('EU_AT', 2024, 'AR6').applicable).toBe(false);
  });

  it('P7 NO FIGURE MOVED — factors and totals pinned across five jurisdictions', () => {
    // This is a citation and disclosure pass. Every number below is the value the engine produced
    // before it, asserted directly rather than recomputed from the same tables that could drift.
    const cases: [string, () => Location, number, number][] = [
      ['US_CA 2026', usCa, 2026, 0.1791],
      ['ON 2023', on, 2023, 0.03],
      ['ON 2026', on, 2026, 0.059],
      ['EU_DE 2026', euDe, 2026, 0.329],
      ['UK 2026', () => loc({ country: 'GB', grid_region: 'UK', electricity_kwh: 100_000 }), 2026, 0.13096],
      ['NZ 2026', () => loc({ country: 'NZ', grid_region: 'NZ', electricity_kwh: 100_000 }), 2026, 0.0787],
    ];
    for (const [label, mk, year, ef] of cases) {
      const l = mk();
      expect(getGridFactor(l.grid_region, year).ef, label).toBe(ef);
      expect(byMethod(l, year).lb.result_tco2e, `${label} row`).toBeCloseTo(100_000 * ef / 1000, 9);
      expect(calcLocation(l, 'AR6', year).s2_location, `${label} calc`).toBeCloseTo(100_000 * ef / 1000, 9);
      expect(calcInventory([l], 'AR6', year).s2_location, `${label} inventory`).toBeCloseTo(100_000 * ef / 1000, 9);
    }
  });

  it('P8 the note is the ONLY thing added — vintage and source were already right on the location row', () => {
    // Guards against a "fix" that starts rewriting factor_vintage on the location-based row. It has
    // always carried gf.usedYear; the defect was the absent note, not a wrong year.
    for (const [mk, year, vintage] of [[usCa, 2026, '2023'], [on, 2023, '2024'], [on, 2026, '2026']] as const) {
      const lb = byMethod(mk(), year).lb;
      expect(lb.factor_vintage, `${year}`).toBe(vintage);
      expect(lb.ef_source.split(' · ')[0], `${year} citation must lead`).toBe(gridSourceFor(mk().country));
    }
  });
});

// The country → citation mapping gridSource() applies, mirrored here so P8 asserts against a named
// expectation rather than against the engine's own output.
function gridSourceFor(country: string): string {
  return country === 'CA' ? EF_SOURCES.electricity_ca
    : country === 'GB' || country === 'UK' ? EF_SOURCES.electricity_uk
    : country === 'DE' ? EF_SOURCES.electricity_eu
    : EF_SOURCES.electricity_us;
}

// ── P9–P12. getResidualFactor resolves FORWARD too, and must say so ──────────────────────────────
//
// `let y = years[0]` in both residual branches means a year below the earliest key resolves FORWARD,
// exactly as getGridFactor and nzTdLoss do. Those two branch on direction; this helper fired one
// wording on `year !== y` and claimed the LATEST vintage while reaching for the EARLIEST.
//
// LIVE, NOT HYPOTHETICAL. Every EU region holds a single key (2024), so an EU location on a 2023
// inventory — 2023 is in the wizard's year list — read "applied to 2023 inventory (latest vintage
// held)" about the only vintage held. That note reaches the assurance PDF (page.tsx:2310) and the
// XLSX methods block (page.tsx:2358), not only the workings table.
describe('P9. residual fallback discloses its direction', () => {
  it('P9 EU_DE at 2023 resolves FORWARD and says "earliest", never "latest"', () => {
    const r = getResidualFactor('EU_DE', 2023, 'AR6');
    expect(r.note).toBe('AIB 2024 residual mix applied to 2023 inventory (earliest vintage held).');
    expect(r.note, 'the 2024 factor is the only one held — it is not the latest of several')
      .not.toContain('latest vintage held');
  });

  it('P10 EU_DE at 2026 still resolves BACKWARD and still says "latest"', () => {
    expect(getResidualFactor('EU_DE', 2026, 'AR6').note)
      .toBe('AIB 2024 residual mix applied to 2026 inventory (latest vintage held).');
  });

  it('P11 EU_DE at 2024 — exact match, no note', () => {
    expect(getResidualFactor('EU_DE', 2024, 'AR6').note).toBe('');
  });

  it('P12 a US subregion resolves FORWARD below its earliest key', () => {
    // Every RESIDUAL_US subregion keys on 2023, so a forward case needs an inventory year <= 2022.
    // NOT reachable from the wizard today (its list starts at 2023) — constructible here, and it
    // becomes reachable the moment the year list gains 2022 or a Green-e refresh moves the key.
    const r = getResidualFactor('CAMX', 2022, 'AR6');
    expect(r.note).toContain('applied to 2022 inventory (earliest vintage held).');
    expect(r.note).not.toContain('latest vintage held');
  });

  it('P13 the note and the vintage name the same factor — neither can drift alone', () => {
    // THE DRIFT THIS PINS. vintage read `Green-e 2025 [2023 data] + eGRID2023 Rev2` while the note read
    // `Green-e 2023` — two names for one factor on one row, and "Green-e 2023" is not an edition
    // Green-e publishes (2023 is the data year, 2025 the edition).
    //
    // They are NOT identical strings, deliberately: the vintage documents both inputs (Green-e mix +
    // eGRID CH4/N2O), while the note is a sentence about which MIX was applied, and eGRID publishes no
    // mix. So the assertion is containment in the direction the code builds them — the vintage is
    // derived from the note's factor name — rather than equality. It holds for EU too, where the two
    // happen to coincide. Asserts the RELATIONSHIP, so it survives a reformat of either string.
    for (const [region, year] of [['CAMX', 2026], ['CAMX', 2022], ['EU_DE', 2026], ['EU_DE', 2023]] as const) {
      const r = getResidualFactor(region, year, 'AR6');
      expect(r.note, `${region} ${year}`).not.toBe('');
      const factorName = r.note.split(' residual mix applied to ')[0];
      expect(factorName, `${region} ${year}: the note must open with a factor name`).not.toBe(r.note);
      expect(r.vintage.startsWith(factorName),
        `${region} ${year}: vintage "${r.vintage}" must be built from the note's factor name "${factorName}"`).toBe(true);
    }
  });

  it('P14 NO FIGURE MOVED — residual factors identical across every year probed', () => {
    // Disclosure only. ef depends on the resolved year, which the direction split does not touch.
    for (const year of [2022, 2023, 2024, 2025, 2026]) {
      expect(getResidualFactor('EU_DE', year, 'AR6').ef, `EU_DE ${year}`).toBeCloseTo(0.72456, 9);
      expect(getResidualFactor('CAMX', year, 'AR6').ef, `CAMX ${year}`).toBeCloseTo(0.19766813612800002, 9);
      expect(getResidualFactor('EU_DE', year, 'AR6').applicable).toBe(true);
    }
    // The four direction-independent strings are untouched.
    expect(getResidualFactor('EU_AT', 2024, 'AR6').note)
      .toBe('Full-disclosure regime — no residual mix published; market-based falls back to location factor.');
    expect(getResidualFactor('EU_ZZ', 2024, 'AR6').note)
      .toBe('No published residual mix for this region; market-based falls back to location factor.');
    expect(getResidualFactor('', 2026, 'AR6').note)
      .toBe('No published residual mix for this subregion; market-based falls back to location factor.');
  });
});

// ── X. A ROW MAY NOT CLAIM A GWP SET THAT DID NOT APPLY TO ITS FACTOR ────────────────────────────
//
// DEFRA, DCCEEW and MfE publish one kgCO2e per unit with their own GWP set already applied. EF_UK,
// EF_AU and EF_NZ therefore store that combined figure in `co2` with ch4/n2o at 0 — and pushFuel
// stamped gwp_basis: gwpVersion regardless, so an Australian diesel row read "AR6" beside a number
// DCCEEW combined on AR5 and which does not move when the toggle does.
//
// GWP_AS_PUBLISHED already existed for exactly this, used on grid, steam and market-based rows.
// Combustion rows never reached for it.
//
// THE CONDITION IS SHAPE-BASED, NOT COUNTRY-BASED — see the comment in pushFuel. X4 is what keeps
// that honest: it declares each table's storage style as a literal and fails if any table stops being
// uniform, which is the only way the shape test could start disagreeing with the tables.
describe('X. combustion rows stamp the GWP basis that actually applied', () => {
  const AS_PUBLISHED = 'as-published — see factor source';
  const SETS = ['AR4', 'AR5', 'AR6'] as const;

  // diesel exists in every table; US takes gallons, the metric jurisdictions litres.
  const dieselLoc = (country: string): Location => loc({
    country,
    has_diesel_stationary: true,
    diesel_stationary_amount: 1000,
    diesel_stationary_unit: country === 'US' ? 'gallons' : 'litres',
  });
  const row = (country: string, g: typeof SETS[number]) =>
    (buildWorkings([dieselLoc(country)], g, 2025, [], 12) as any[])
      .find(r => r.stream === 'diesel_stationary' && !r.declaration);

  it('X1 AU, UK and NZ stamp as-published, under every AR set', () => {
    for (const c of ['AU', 'GB', 'NZ']) {
      for (const g of SETS) {
        expect(row(c, g).gwp_basis, `${c} ${g}: the publisher's GWP set is baked in, not ours`).toBe(AS_PUBLISHED);
        expect(row(c, g).gwp_basis, `${c} ${g}`).not.toBe(g);
      }
    }
  });

  it('X2 US, CA and EU keep stamping the live gwpVersion', () => {
    // These store a real gas split, so the toggle genuinely changes the figure and the row must say
    // which set produced it.
    for (const c of ['US', 'CA', 'DE']) {
      for (const g of SETS) {
        expect(row(c, g).gwp_basis, `${c} ${g}`).toBe(g);
      }
    }
  });

  it('X3 NO FIGURE MOVED — every jurisdiction, every AR set', () => {
    // This is a provenance pass. The combined tables were already inert under the toggle (that is the
    // defect); the split tables must still respond exactly as before.
    const inert = ['AU', 'GB', 'NZ'], responds = ['US', 'CA', 'DE'];
    for (const c of inert) {
      const [a, b, d] = SETS.map(g => row(c, g).result_tco2e);
      expect(a, `${c}: a combined factor cannot move with the toggle`).toBe(b);
      expect(b, `${c}`).toBe(d);
    }
    for (const c of responds) {
      const vals = SETS.map(g => row(c, g).result_tco2e);
      expect(new Set(vals).size, `${c}: a gas split must respond to the toggle`).toBeGreaterThan(1);
    }
    // Absolute pins, so "nothing moved" is measured and not merely self-consistent.
    expect(row('AU', 'AR6').result_tco2e).toBeCloseTo(2.71, 9);          // 1000 L x 2.710 kg/L
    expect(row('GB', 'AR6').result_tco2e).toBeCloseTo(2.58354, 9);   // DEFRA 2026
    expect(row('NZ', 'AR6').result_tco2e).toBeCloseTo(2.6759, 9);
    expect(row('US', 'AR6').result_tco2e).toBeCloseTo(10.2414216, 9);
  });

  it('X4 every table is UNIFORM in its storage style — the shape test cannot drift from the tables', () => {
    // THE GUARD BEHIND X1/X2. The stamping condition reads ch4 === 0 && n2o === 0, which is only a
    // reliable proxy for "combined CO2e" while each table is entirely one style or the other. The
    // expected style is declared HERE as a literal, so a table that changes shape fails this test —
    // it does not quietly reclassify itself and take the stamping with it.
    const DECLARED: [string, Record<string, any>, 'split' | 'combined'][] = [
      ['EF (US)', EF as any, 'split'],
      ['EF_CA', EF_CA as any, 'split'],
      ['EF_EU', EF_EU as any, 'split'],
      ['EF_UK', EF_UK as any, 'combined'],
      ['EF_AU', EF_AU as any, 'combined'],
      ['EF_NZ.commercial', (EF_NZ as any).commercial, 'combined'],
      ['EF_NZ.industrial', (EF_NZ as any).industrial, 'combined'],
    ];
    const offences: string[] = [];
    for (const [name, table, style] of DECLARED) {
      const factors = Object.entries(table).filter(([, v]: any) => v && typeof v === 'object');
      expect(factors.length, `${name} has no factor entries — the walk is broken`).toBeGreaterThan(0);
      for (const [key, v] of factors as [string, any][]) {
        const isCombined = v.ch4 === 0 && v.n2o === 0;
        if (isCombined !== (style === 'combined')) {
          offences.push(`${name}.${key} is stored ${isCombined ? 'COMBINED' : 'SPLIT'} but the table is declared ${style}`);
        }
        // NO FACTOR MAY ZERO EXACTLY ONE GAS. While that holds, `ch4 === 0 && n2o === 0` and a
        // one-clause `ch4 === 0` are indistinguishable — which is why weakening the condition cannot
        // be caught behaviourally today. The first factor to zero one gas and not the other is the
        // moment that stops being true, and this is what surfaces it.
        if ((v.ch4 === 0) !== (v.n2o === 0)) {
          offences.push(`${name}.${key} zeroes exactly one gas (ch4=${v.ch4}, n2o=${v.n2o}) — the stamping condition must be re-examined`);
        }
      }
    }
    expect(offences, offences.length === 0 ? '' :
      `A FACTOR TABLE CHANGED STORAGE STYLE:\n\n${offences.join('\n')}\n\n` +
      `pushFuel decides gwp_basis from ch4 === 0 && n2o === 0. That is only a proxy for "the publisher\n` +
      `combined the gases" while each table is uniform. A mixed table means some rows would stamp\n` +
      `as-published and others the live AR set, from ONE source, with nothing saying why.\n` +
      `TO FIX: if the change is intended, update the DECLARED list above IN THE SAME COMMIT and check\n` +
      `that X1/X2 still name the right jurisdictions.\n`,
    ).toEqual([]);
  });

  it('X6 the condition reads the FACTOR, not a country list', () => {
    // ⚠️ A HARDCODED ['GB','AU','NZ'] PASSES X1-X5 TODAY. It is behaviourally identical for the
    // current tables and silently wrong the moment a fourth table converts to combined storage or one
    // of these three gains a gas split — the list and the tables drift with nothing to notice. X4
    // would eventually catch the fallout; this catches the implementation.
    const src = readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8');
    const line = src.split('\n').filter(l => l.includes('const combinedCo2e ='));
    expect(line, 'combinedCo2e is declared exactly once in pushFuel').toHaveLength(1);
    expect(line[0], 'the condition must ask the factor being applied')
      .toBe("    const combinedCo2e = ef.ch4 === 0 && ef.n2o === 0");
    expect(line[0], 'a country list is what this test exists to reject').not.toContain('country');
  });

  it('X5 the factor cell says the publisher combined the gases, not that they are zero', () => {
    // "CO2 2.71, CH4 0, N2O 0" reads as a measurement — this fuel emits no methane. It is not one.
    const au = row('AU', 'AR6');
    expect(au.emission_factor).toBe('CO₂e 2.71 kg/litres — CH₄/N₂O included');
    expect(au.emission_factor, 'a zero that means "already counted" must not print as a measured zero')
      .not.toContain('CH4 0');
    // Gas-split rows keep the split verbatim — the verifier path depends on it.
    expect(row('US', 'AR6').emission_factor).toBe('CO2 10.20648, CH4 0.000414, N2O 0.0000828 kg/gallons');
  });
});

// ── Y. THE AUSTRALIAN RESIDUAL MIX ──────────────────────────────────────────────────────────────
//
// DCCEEW NGA Factors 2025 Table 2 publishes a national Residual Mix Factor: 0.81 kg CO2-e/kWh Scope 2.
// getResidualFactor had EU and US branches only, so an AU location fell through to the US terminal
// return and its market-based row read "No published residual mix for this SUBREGION" — a sentence
// about eGRID, printed directly after a DCCEEW citation, denying a figure DCCEEW publishes in the very
// workbook the location-based row already cites. It also reached the assurance PDF and the XLSX.
describe('Y. Australia has a published residual mix', () => {
  const SETS = ['AR4', 'AR5', 'AR6'] as const;
  const VINTAGE = 'DCCEEW 2025 RMF (FY basis, 3-yr avg)';

  it('Y1 AU at 2025 — 0.81, applicable, no note', () => {
    const r = getResidualFactor('AU', 2025, 'AR6');
    expect(r.ef).toBe(0.81);
    expect(r.applicable).toBe(true);
    expect(r.note, 'the workbook edition matches the inventory year — nothing to disclose').toBe('');
    expect(r.usedRegion).toBe('AU');
  });

  it('Y2 AU at 2026 resolves BACKWARD and says so', () => {
    const r = getResidualFactor('AU', 2026, 'AR6');
    expect(r.ef).toBe(0.81);
    expect(r.note).toBe(`${VINTAGE} residual mix applied to 2026 inventory (latest vintage held).`);
  });

  it('Y3 AU at 2023 resolves FORWARD and says so', () => {
    const r = getResidualFactor('AU', 2023, 'AR6');
    expect(r.ef).toBe(0.81);
    expect(r.note).toBe(`${VINTAGE} residual mix applied to 2023 inventory (earliest vintage held).`);
    expect(r.note, 'a forward resolution must not claim the latest vintage').not.toContain('latest vintage held');
  });

  it('Y4 the "no published residual mix" strings are unreachable for AU', () => {
    for (const y of [2023, 2024, 2025, 2026]) {
      for (const g of SETS) {
        const r = getResidualFactor('AU', y, g);
        expect(r.note, `AU ${y} ${g}`).not.toContain('No published residual mix');
        expect(r.applicable, `AU ${y} ${g}`).toBe(true);
      }
    }
  });

  it('Y5 the vintage discloses the FINANCIAL-YEAR basis', () => {
    // DCCEEW computes the RMF over years ending June with a 3-year averaging lag, because LGCs are
    // created on a CALENDAR-year basis up to 12 months after generation. A verifier reconciling a
    // calendar-year inventory against 0.81 has to know that, and the vintage column is where they look.
    const v = getResidualFactor('AU', 2025, 'AR6').vintage;
    expect(v).toBe(VINTAGE);
    expect(v).toContain('FY basis');
    expect(v).toContain('3-yr avg');
    expect(v).toContain('DCCEEW');
    expect(v.length, 'the vintage sits in a table cell').toBeLessThan(45);
    // Scope 3 (0.11 in the same table) is NOT seeded — there is no Scope 3 electricity line to put it on.
    expect(getResidualFactor('AU', 2025, 'AR6').ef).not.toBe(0.11);
  });

  it('Y6 AU is national — no state key exists, and none may be added silently', () => {
    // DCCEEW calculates the RMF at national aggregate level: the LGC market spans all networks and
    // creations can come from off-grid generation. A per-state table would not correspond to anything
    // published. AU_NSW is a GRID region, not a residual one, and must not resolve.
    for (const k of ['AU_NSW', 'AU_VIC', 'AU_AVG']) {
      expect(getResidualFactor(k, 2025, 'AR6').applicable, `${k} must not be a residual key`).toBe(false);
    }
  });

  it('Y7 EU and US are unchanged', () => {
    expect(getResidualFactor('EU_DE', 2025, 'AR6').note)
      .toBe('AIB 2024 residual mix applied to 2025 inventory (latest vintage held).');
    expect(getResidualFactor('EU_DE', 2026, 'AR6').ef).toBeCloseTo(0.72456, 9);
    expect(getResidualFactor('CAMX', 2026, 'AR6').ef).toBeCloseTo(0.19766813612800002, 9);
    expect(getResidualFactor('EU_AT', 2024, 'AR6').note)
      .toBe('Full-disclosure regime — no residual mix published; market-based falls back to location factor.');
    expect(getResidualFactor('', 2026, 'AR6').note)
      .toBe('No published residual mix for this subregion; market-based falls back to location factor.');
  });

  // ── residualRegionFor: ONE derivation, four call sites ────────────────────────────────────────
  const anyLoc = (o: Partial<Location>): Location => loc({ electricity_kwh: 100_000, ...o });

  it('Y8 residualRegionFor matches the OLD inline expression for every non-AU location', () => {
    // The extraction must not have changed EU or US behaviour. The old expression is reimplemented
    // here and compared across a spread; AU is excluded because AU is the deliberate difference.
    const old = (l: Location) => l.residual_region || (l.grid_region.startsWith('EU_') ? l.grid_region : '');
    const spread: Location[] = [
      anyLoc({ country: 'US', grid_region: 'US_CA' }),
      anyLoc({ country: 'US', grid_region: 'US_TX', residual_region: 'ERCT' }),
      anyLoc({ country: 'DE', grid_region: 'EU_DE' }),
      anyLoc({ country: 'FR', grid_region: 'EU_FR' }),
      anyLoc({ country: 'AT', grid_region: 'EU_AT' }),
      anyLoc({ country: 'CA', grid_region: 'ON' }),
      anyLoc({ country: 'GB', grid_region: 'UK' }),
      anyLoc({ country: 'NZ', grid_region: 'NZ' }),
      anyLoc({ country: 'US', grid_region: 'us_average' }),
      anyLoc({ country: '', grid_region: '' }),
    ];
    for (const l of spread) {
      expect(residualRegionFor(l), `${l.country || '(blank)'} / ${l.grid_region || '(blank)'}`).toBe(old(l));
    }
    // AU is the one intended divergence, and an explicit residual_region still wins over it.
    expect(residualRegionFor(anyLoc({ country: 'AU', grid_region: 'AU_NSW' }))).toBe('AU');
    expect(old(anyLoc({ country: 'AU', grid_region: 'AU_NSW' })), 'what it used to return').toBe('');
    expect(residualRegionFor(anyLoc({ country: 'AU', grid_region: 'AU_NSW', residual_region: 'ERCT' }))).toBe('ERCT');
  });

  it('Y9 all four call sites call residualRegionFor — read from source, not inferred from values', () => {
    // A COPY THAT AGREES TODAY MUST STILL FAIL. Four sites derived this identically and adding AU meant
    // teaching all four; a value test cannot tell a call from a duplicate that happens to match.
    const files = ['lib/ghg/engine.ts', 'app/dashboard/ghg/page.tsx'];
    const seen: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      for (const [i, ln] of src.split('\n').entries()) {
        if (!ln.includes('const resRegion')) continue;
        seen.push(`${f}:${i + 1}`);
        expect(ln, `${f}:${i + 1} must call the shared helper`).toContain('residualRegionFor(');
        expect(ln, `${f}:${i + 1} still inlines the old expression`).not.toContain('residual_region ||');
      }
      expect(src, `${f} must not keep a stray copy of the inline rule`)
        .not.toContain("grid_region.startsWith('EU_') ? ");
    }
    expect(seen, `expected four resRegion sites, found: ${seen.join(', ')}`).toHaveLength(4);
  });

  it('Y10 workings, assurance PDF and XLSX resolve the SAME residual region', () => {
    // The three surfaces each derive it for their own rendering. One helper means they cannot disagree;
    // this asserts the property for a spread including the new AU case.
    for (const l of [
      anyLoc({ country: 'AU', grid_region: 'AU_NSW' }),
      anyLoc({ country: 'DE', grid_region: 'EU_DE' }),
      anyLoc({ country: 'US', grid_region: 'US_CA', residual_region: 'CAMX' }),
      anyLoc({ country: 'CA', grid_region: 'ON' }),
    ]) {
      const region = residualRegionFor(l);
      const mb = (buildWorkings([l], 'AR6', 2025, [], 12) as any[])
        .find(r => r.scope2_method === 'market-based');
      const res = getResidualFactor(region, 2025, 'AR6');
      // The workings row is built from the same region, so its applied factor must match.
      const expected = res.applicable ? res.ef : getGridFactor(l.grid_region, 2025).ef;
      expect(mb.result_tco2e, `${l.country}`).toBeCloseTo(100_000 * expected / 1000, 9);
    }
  });

  it('Y11 NO NON-AU FIGURE MOVED', () => {
    const pin: [string, Partial<Location>, number][] = [
      ['US_CA no subregion', { country: 'US', grid_region: 'US_CA' }, 0.1791],
      ['US_CA + CAMX', { country: 'US', grid_region: 'US_CA', residual_region: 'CAMX' }, 0.19766813612800002],
      ['EU_DE', { country: 'DE', grid_region: 'EU_DE' }, 0.72456],
      ['CA ON', { country: 'CA', grid_region: 'ON' }, 0.038],
      ['GB', { country: 'GB', grid_region: 'UK' }, 0.177],
      ['NZ', { country: 'NZ', grid_region: 'NZ' }, 0.0787],
    ];
    for (const [label, o, ef] of pin) {
      const mb = (buildWorkings([anyLoc(o)], 'AR6', 2025, [], 12) as any[])
        .find(r => r.scope2_method === 'market-based');
      expect(mb.result_tco2e, label).toBeCloseTo(100_000 * ef / 1000, 9);
    }
    // AU is the one that DOES move — from the 0.64 NSW location factor to the 0.81 national RMF.
    const au = (buildWorkings([anyLoc({ country: 'AU', grid_region: 'AU_NSW' })], 'AR6', 2025, [], 12) as any[])
      .find(r => r.scope2_method === 'market-based');
    expect(au.result_tco2e, 'AU market-based now uses the residual mix, not the location factor').toBeCloseTo(81, 9);
  });
});

// ── Z. GRADE-EXPLICIT FUEL OIL KEYS — SEEDED, NOT YET READ ──────────────────────────────────────
//
// One `fuel_oil_gallon` key held a DIFFERENT PRODUCT in each table: US distillate No.2 (byte-identical
// to diesel), CA light fuel oil, UK and EU residual. lib/vsme/energyContent.ts already carried a
// FUEL_OIL_GRADE_BY_JUR map to work around it, throwing on an unmapped jurisdiction — one module
// compensating for an ambiguity the engine did not express.
//
// This commit is ADDITIVE ONLY. The legacy key is untouched and is still the only one anything reads;
// these tests exist so the seeded values are pinned before commit 2 makes them reachable.
//
// ⚠️ THE IDS RUN IN ORDER, AND THAT IS A PROPERTY TO MAINTAIN, NOT A COINCIDENCE. Z1-Z5 then Z7-Z18,
// each block sitting where its number says. They did not: the file once ran Z1-Z5, Z9, Z15-Z17,
// Z10-Z14, Z7, Z8, Z18, so "delete Z10 through Z14" selected a nine-test span and the deletion was
// caught by the test COUNT rather than by anyone reading it. A new test appends at Z19; it does not
// slot in beside a thematic neighbour.
//   Z6 IS DELIBERATELY ABSENT — it asserted "US residual is deliberately absent" and was retired with
// the backlog it belonged to. See Z16, which records that. Do not renumber to close the hole: the ids
// are cross-referenced from prose elsewhere, including lib/ghg/engine.ts (Z7) and sections U and W (Z5).
describe('Z. fuel oil grades are seeded per table', () => {
  const G = 3.785411784; // L_PER_GAL

  const TABLES: [string, Record<string, any>, 'split' | 'combined'][] = [
    ['EF (US)', EF as any, 'split'],
    ['EF_CA', EF_CA as any, 'split'],
    ['EF_EU', EF_EU as any, 'split'],
    ['EF_UK', EF_UK as any, 'combined'],
    ['EF_AU', EF_AU as any, 'combined'],
    ['EF_NZ.commercial', (EF_NZ as any).commercial, 'combined'],
    ['EF_NZ.industrial', (EF_NZ as any).industrial, 'combined'],
  ];

  it('Z1 the legacy fuel_oil_gallon is byte-identical in all four tables that had one', () => {
    // Was "additive only" when section Z landed. EF_UK has since been refreshed to DEFRA 2026, which
    // corrected its gallon conversion (12.018374 -> 12.018380 — the FACTOR 3.17492 kg/L is unchanged
    // between editions; only the rounding was). The other three are still untouched.
    expect((EF as any).fuel_oil_gallon).toEqual({ co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 });
    expect((EF_CA as any).fuel_oil_gallon).toEqual({ co2: 10.421234, ch4: 0.000023, n2o: 0.000117 });
    expect((EF_UK as any).fuel_oil_gallon).toEqual({ co2: 12.018380, ch4: 0, n2o: 0 });
    expect((EF_EU as any).fuel_oil_gallon).toEqual({ co2: 11.718456, ch4: 0.000454249, n2o: 0.00009085 });
    // AU and NZ never had one — they fall through to US, and that is unchanged.
    expect((EF_AU as any).fuel_oil_gallon).toBeUndefined();
    expect((EF_NZ as any).commercial.fuel_oil_gallon).toBeUndefined();
  });

  // WHAT IS DELIBERATELY ABSENT, and where the reason lives. Declared here rather than skipped inline,
  // so removing an entry is what a seeding commit does — and the test that owns each reason fails if
  // the absence is filled in without also deleting its pin.
  // EMPTY. It held 'EF (US)': ['residual'] until the EPA Table 1 residual row was transcribed, and
  // 'EF_UK': both grades until the DEFRA 2026 refresh. Kept rather than deleted: it is the shape a
  // future jurisdiction's partial seeding declares itself in, and an empty map asserted by Z16 is a
  // stronger statement than no map at all.
  const NOT_YET_SEEDED: Record<string, readonly ('distillate' | 'residual')[]> = {};

  it('Z2 every jurisdiction resolves its OWN grade keys — none falls through to US', () => {
    // pickEF falls back to EF when a table lacks a key. A silent US substitution is what the split
    // exists to end, so each table must answer for itself.
    for (const [name, table] of TABLES) {
      const absent = NOT_YET_SEEDED[name] ?? [];
      for (const grade of ['distillate', 'residual'] as const) {
        const key = `fuel_oil_${grade}_gallon`;
        expect(table[key] !== undefined, `${name} ${grade}`).toBe(!absent.includes(grade));
      }
    }
  });

  it('Z3 residual is heavier than distillate, everywhere both exist', () => {
    // A physical sanity check on the transcription: No.6 / heavy oil carries more carbon per litre
    // than No.2 / light. A transposed pair fails here before anyone reads a workings row.
    for (const [name, table] of TABLES) {
      if (!table.fuel_oil_residual_gallon) continue;
      expect(table.fuel_oil_residual_gallon.co2, `${name}: residual must exceed distillate`)
        .toBeGreaterThan(table.fuel_oil_distillate_gallon.co2);
    }
  });

  it('Z4 storage convention is preserved — combined tables keep ch4/n2o at 0', () => {
    // Section X stamps gwp_basis from ch4 === 0 && n2o === 0. A new key with the wrong shape would
    // silently change how its row reports the GWP basis.
    for (const [name, table, style] of TABLES) {
      for (const key of ['fuel_oil_distillate_gallon', 'fuel_oil_residual_gallon']) {
        const v = table[key];
        if (!v) continue;
        const isCombined = v.ch4 === 0 && v.n2o === 0;
        expect(isCombined, `${name}.${key} must be stored ${style}`).toBe(style === 'combined');
      }
    }
  });

  it('Z5 the seeded values reproduce their published per-litre figures', () => {
    const perL = (x: number) => x / G;
    // UK — DEFRA 2026 Fuels tab, combined kgCO2e/L
    expect(perL((EF_UK as any).fuel_oil_distillate_gallon.co2)).toBeCloseTo(2.75541, 6);
    expect(perL((EF_UK as any).fuel_oil_residual_gallon.co2)).toBeCloseTo(3.17492, 6);
    // NZ — MfE 2026 Table 3.2
    expect(perL((EF_NZ as any).commercial.fuel_oil_distillate_gallon.co2)).toBeCloseTo(2.97088, 6);
    expect(perL((EF_NZ as any).commercial.fuel_oil_residual_gallon.co2)).toBeCloseTo(3.05359, 6);
    expect(perL((EF_NZ as any).industrial.fuel_oil_distillate_gallon.co2)).toBeCloseTo(2.96335, 6);
    expect(perL((EF_NZ as any).industrial.fuel_oil_residual_gallon.co2)).toBeCloseTo(3.04601, 6);
    // CA — ECCC v3.0 Table 4.3 Industrial, g/L
    expect(perL((EF_CA as any).fuel_oil_distillate_gallon.co2)).toBeCloseTo(2.753, 6);
    expect(perL((EF_CA as any).fuel_oil_residual_gallon.co2)).toBeCloseTo(3.156, 6);
    // AU — DCCEEW NGA 2025 Table 8, GJ/kL x kgCO2e/GJ
    expect(perL((EF_AU as any).fuel_oil_distillate_gallon.co2)).toBeCloseTo(37.3 * 69.73 / 1000, 6);
    expect(perL((EF_AU as any).fuel_oil_residual_gallon.co2)).toBeCloseTo(39.7 * 73.84 / 1000, 6);
    // EU — MRR Annex VI Table 1 (t CO2/TJ, TJ/Gg) x density. ASSERTED AS THE EXPRESSION, like the AU
    // lines above: these used to read `toBeCloseTo(3.09569, 5)` against a literal copied out of the
    // table's own comment, which would have passed with ANY density.
    // Tolerance 5 (not 6) because the stored per-litre value is the exact derivation rounded to 6
    // significant figures BEFORE the gallon conversion, and the gallon conversion itself used an
    // imprecise L_PER_GAL. Group U asserts both facts precisely; this line only has to catch a
    // changed input.
    expect(perL((EF_EU as any).fuel_oil_residual_gallon.co2)).toBeCloseTo(77400 * 40.4e-6 * 0.990, 5);
    expect(perL((EF_EU as any).fuel_oil_distillate_gallon.co2)).toBeCloseTo(74100 * 43.0e-6 * 0.844, 5);
  });

  it('Z7 EU distillate equals the gas/diesel oil derivation it is taken from', () => {
    // The three inputs are CO2 74100 kg/TJ, NCV 43.0, dens 0.844 — the same row this table already
    // uses for diesel. Pinned as an equality so the shared provenance is a fact, not a coincidence.
    expect((EF_EU as any).fuel_oil_distillate_gallon).toEqual((EF_EU as any).diesel_gallon);
    expect((EF_EU as any).fuel_oil_residual_gallon).toEqual((EF_EU as any).fuel_oil_gallon);
  });

  it('Z8 ALL THREE pickEF sites read GRADE keys — the retired fuel_oil_gallon is gone', () => {
    // WAS: "nothing reads the new keys yet — no emission figure can have moved." That premise died
    // with the split. Its job now is the inverse: catch a PARTIAL switch.
    //
    // Six calls, not three: two grades x calcLocation / calcInventory's per-fuel add / buildWorkings.
    // Switching two of the three leaves the location total, the per-fuel breakdown and the workings
    // row disagreeing about the same litres, and only the buildWorkings one would be caught elsewhere
    // (by section M's recomputation check). This counts them.
    // ⚠️ THE SHAPE HAS CHANGED TWICE, AND THIS NOW ASSERTS THE PROPERTY RATHER THAN THE SPELLING.
    // No call site names a grade key any more: fuelOilPricing() picks litre-or-gallon per jurisdiction
    // and every consumer prices off `fo.key`. Counting literal occurrences was the right test while
    // the key was written at each site and is simply not measurable now — so what is asserted is the
    // thing that actually mattered: THREE pricing sites, each going through the ONE chooser, and no
    // path reaching the retired ungraded key.
    const src = readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8');
    const calls = src.split('\n').filter(l => /fuelOilPricing\(loc, '(distillate|residual)'/.test(l));
    expect(calls.length, 'two grades x three sites, all through the one chooser').toBe(6);
    expect(calls.filter(c => c.includes("'distillate'")).length, 'three distillate sites').toBe(3);
    expect(calls.filter(c => c.includes("'residual'")).length, 'three residual sites').toBe(3);
    // The chooser itself may only ever build a graded key — never the retired 'fuel_oil_gallon'.
    const chooser = src.slice(src.indexOf('function fuelOilPricing'), src.indexOf('const fuelOilInGallons'));
    expect(chooser).toContain('`fuel_oil_${grade}_litre`');
    expect(chooser).toContain('`fuel_oil_${grade}_gallon`');
    expect(chooser, "'fuel_oil_gallon' was retired — no alias was kept").not.toContain("'fuel_oil_gallon'");
    // THE RAW/RESOLVED DISTINCTION SURVIVES THE SPLIT. buildWorkings prices the coverage-resolution
    // -applied figure; the other two read the stored amount. Collapsing them would silently drop
    // estimation adjustments from the workings row.
    // Asserted as the PROPERTY rather than the call spelling: buildWorkings hoists the resolved
    // figure into `entered` (so the activity column can show it) before converting, so
    // `fuelOilToGallons(figure(...))` is no longer one substring. What must remain true is that the
    // workings path reads figure() and the calc path reads the raw amount.
    // buildWorkings prices the coverage-resolution-APPLIED figure...
    expect(src).toContain("fuelOilPricing(loc, 'distillate', entered)");
    expect(src).toContain("fuelOilPricing(loc, 'residual', entered)");
    // ...while the two calc paths read the STORED amount. Collapsing them would silently drop
    // estimation adjustments from the workings row. (fuelOilInGallons, the old raw-value wrapper, is
    // gone: it always converted to gallons, which is now the exception rather than the rule.)
    expect(src).toContain("fuelOilPricing(loc, 'distillate', loc.fuel_oil_distillate_amount)");
    expect(src).toContain("fuelOilPricing(loc, 'residual', loc.fuel_oil_residual_amount)");
    expect(src, 'the always-convert wrapper must not come back').not.toContain('const fuelOilInGallons =');
  });

  it('Z9 EF_UK is DEFRA 2026 — refreshed whole, and the grade keys are seeded', () => {
    // WAS: "EF_UK has NO grade keys — the table is DEFRA 2025 and must be refreshed whole first."
    // That blocker is gone. The table was refreshed to DEFRA 2026 in full on 13 Aug 2026, so seeding
    // fuel_oil_distillate_gallon / fuel_oil_residual_gallon here no longer mixes editions.
    //
    // THIS TEST NOW GUARDS THE OPPOSITE THING: that the refresh HELD. If any of the three moved keys
    // reverts to its 2025 value, the table is back to a mixed or stale edition and any grade keys
    // seeded on top of it become unattributable.
    const WHY =
      'EF_UK HAS REVERTED TOWARD DEFRA 2025. The table was refreshed WHOLE to DEFRA 2026 because it ' +
      'has no year dimension — one edition prices every reporting year, so a single key from another ' +
      'workbook puts two editions in one table with nothing on any row saying which priced it.';
    expect((EF_UK as any).natural_gas_kwh.co2, WHY).toBe(0.18231);
    expect((EF_UK as any).diesel_litre.co2, WHY).toBe(2.58354);
    expect((EF_UK as any).diesel_mobile_litre.co2, `${WHY} (mobile reuses the diesel row)`).toBe(2.58354);
    expect((EF_UK as any).gasoline_litre.co2, WHY).toBe(2.075);
    // Unchanged between editions — CONFIRMED against the 2026 workbook, not assumed.
    expect((EF_UK as any).propane_litre.co2, 'propane did not move between editions').toBe(1.54358);
    // The residual-oil FACTOR did not move either; only its gallon conversion was corrected.
    expect((EF_UK as any).fuel_oil_gallon.co2).toBe(12.018380);
  });

  it('Z10 every UK _gallon fallback equals its litre value x 3.785411784', () => {
    // Five _gallon keys, not six — the brief said six and there are five. They are UI-unreachable for
    // a GB location (liquidUnitOptions('GB') offers litres only), so they matter only as a consistency
    // property: a stale gallon beside a refreshed litre is a contradiction nothing else would catch.
    const G = 3.785411784;
    const pairs: [string, string][] = [
      ['propane_litre', 'propane_gallon'],
      ['diesel_litre', 'diesel_gallon'],
      ['diesel_mobile_litre', 'diesel_mobile_gallon'],
      ['gasoline_litre', 'gasoline_gallon'],
    ];
    for (const [l, g] of pairs) {
      expect((EF_UK as any)[g].co2, `${g} must be ${l} x L_PER_GAL`)
        .toBeCloseTo((EF_UK as any)[l].co2 * G, 6);
    }
    // The three fuel-oil keys have no litre counterpart — DEFRA publishes them per litre and the
    // engine's fuel-oil path prices per gallon, so each converts straight from its published figure.
    expect((EF_UK as any).fuel_oil_gallon.co2).toBeCloseTo(3.17492 * G, 6);
    expect((EF_UK as any).fuel_oil_residual_gallon.co2).toBeCloseTo(3.17492 * G, 6);
    expect((EF_UK as any).fuel_oil_distillate_gallon.co2).toBeCloseTo(2.75541 * G, 6);
    // SEVEN now: the five fallbacks plus the two grade keys seeded on the DEFRA 2026 refresh. The
    // brief that introduced this test said six and there were five; the count is pinned so a key
    // appearing or vanishing is a decision someone has to make explicitly.
    expect(Object.keys(EF_UK).filter(k => k.endsWith('_gallon')), 'five fallbacks + two grade keys').toHaveLength(7);
  });

  it('Z11 the UK grid holds BOTH editions, and each year resolves to its own', () => {
    // GRID_EF IS year-keyed, so two editions side by side is correct here where it would be wrong in
    // EF_UK. Replacing 2025 would have re-priced every stored 2025 UK inventory at the 2026 factor.
    expect(getGridFactor('UK', 2026).ef, 'DEFRA 2026 UK electricity').toBe(0.13096);
    expect(getGridFactor('UK', 2026).usedYear).toBe(2026);
    expect(getGridFactor('UK', 2026).note, 'exact year — nothing to disclose').toBe('');
    expect(getGridFactor('UK', 2025).ef, 'a 2025 inventory keeps the 2025 factor').toBe(0.177);
    expect(getGridFactor('UK', 2025).usedYear).toBe(2025);
    expect(getGridFactor('UK', 2027).usedYear, 'later years hold at the newest edition').toBe(2026);
  });

  it('Z12 UK figures MOVED; every other jurisdiction is untouched', () => {
    const kwh = (country: string, year: number) =>
      (buildWorkings([loc({ country, grid_region: country === 'GB' ? 'UK' : country === 'CA' ? 'ON' : 'US_CA',
        electricity_kwh: 100_000 })], 'AR6', year, [], 12) as any[])
        .find(r => r.scope2_method === 'location-based').result_tco2e;
    // UK electricity moved, by year.
    expect(kwh('GB', 2026)).toBeCloseTo(13.096, 9);
    expect(kwh('GB', 2025)).toBeCloseTo(17.7, 9);
    // UK combustion moved.
    const gas = (year: number) =>
      (buildWorkings([loc({ country: 'GB', has_natural_gas: true, natural_gas_amount: 100_000, natural_gas_unit: 'kwh' })],
        'AR6', year, [], 12) as any[]).find(r => r.stream === 'natural_gas' && !r.declaration).result_tco2e;
    expect(gas(2026), 'DEFRA 2026: 0.18231').toBeCloseTo(18.231, 9);
    // Every other jurisdiction: unchanged.
    expect(kwh('US', 2026)).toBeCloseTo(17.91, 9);
    expect(kwh('CA', 2026)).toBeCloseTo(5.9, 9);
  });

  it('Z13 the UK table still stamps as-published — ch4/n2o remain 0 after the refresh', () => {
    // The refresh must not have introduced a gas split. Section X decides gwp_basis from the shape.
    for (const [k, v] of Object.entries(EF_UK) as [string, any][]) {
      expect(v.ch4, `${k}`).toBe(0);
      expect(v.n2o, `${k}`).toBe(0);
    }
    const row = (g: 'AR4' | 'AR6') =>
      (buildWorkings([loc({ country: 'GB', has_diesel_stationary: true, diesel_stationary_amount: 1000, diesel_stationary_unit: 'litres' })],
        g, 2026, [], 12) as any[]).find(r => r.stream === 'diesel_stationary' && !r.declaration);
    expect(row('AR6').gwp_basis).toBe('as-published — see factor source');
    expect(row('AR4').result_tco2e, 'a combined factor cannot move with the AR toggle').toBe(row('AR6').result_tco2e);
  });

  it('Z14 no DEFRA 2025 citation survives outside a historical note', () => {
    const files = ['lib/ghg/engine.ts', 'app/dashboard/ghg/page.tsx', 'app/methodology/page.tsx'];
    const offences: string[] = [];
    for (const f of files) {
      for (const [i, ln] of readFileSync(join(process.cwd(), f), 'utf8').split('\n').entries()) {
        // ⚠️ TWO BUGS IN THIS GUARD, BOTH FOUND BY MUTATION, BOTH WORTH RECORDING.
        // (1) The regex was /DEFRA[ /]?(\/DESNZ )?\(?2025/ and did not match "DEFRA/DESNZ (2025)" —
        //     it consumed the slash before the optional group could. `.{0,14}` spans every spelling
        //     in the repo: "DEFRA 2025", "DEFRA (2025)", "DEFRA/DESNZ (2025)".
        // (2) The exceptions were line-level `continue`s. app/methodology/page.tsx:40 is ONE ~2,000
        //     character string carrying BOTH a combustion citation and an electricity one, so an
        //     allowed "DEFRA 2025 and 2026" on that line exempted a disallowed "DEFRA/DESNZ (2025)"
        //     beside it. Reverting the page passed. Allowed spellings are now STRIPPED and the
        //     remainder tested, so one legitimate mention cannot shelter an illegitimate one.
        const allowed = [/WAS DEFRA\/DESNZ 2025/g, /2025 workbook/g, /DEFRA 2025\+2026/g, /DEFRA 2025 and 2026/g];
        let probe = ln;
        for (const a of allowed) probe = probe.replace(a, '');
        if (!/DEFRA.{0,14}2025/.test(probe)) continue;
        offences.push(`${f}:${i + 1} — ${probe.trim().slice(0, 90)}`);
      }
    }
    expect(offences, offences.length === 0 ? '' :
      `A DEFRA 2025 CITATION SURVIVED THE REFRESH:\n\n${offences.join('\n')}\n\n` +
      `EF_UK is DEFRA 2026 now. Every citation must move with it or a customer reads one year on the\n` +
      `methodology page and is priced on another. The Scope 3 DEFRA/Exiobase strings are a DIFFERENT\n` +
      `dataset and are deliberately not in scope here.\n`).toEqual([]);
  });

  it('Z15 the legacy fuel_oil_gallon and the new residual key are the SAME number, by construction', () => {
    // The legacy key always WAS the residual row — its comment has said so since it was seeded — so
    // both hold DEFRA's "Processed fuel oils - residual oil" 3.17492 kg/L converted the same way.
    // Not a coincidence to be tolerated: an identity to be enforced. Editing one alone means one of
    // them is wrong, and nothing else in the suite would notice which.
    expect((EF_UK as any).fuel_oil_residual_gallon).toEqual((EF_UK as any).fuel_oil_gallon);
    expect((EF_UK as any).fuel_oil_residual_gallon.co2).toBe(12.018380);
    // Distillate is a genuinely different row and must NOT equal either.
    expect((EF_UK as any).fuel_oil_distillate_gallon).not.toEqual((EF_UK as any).fuel_oil_gallon);
  });

  it('Z16 NOT_YET_SEEDED is EMPTY — every table carries both grades', () => {
    // The seeding backlog is closed. Z6 ("US residual is deliberately absent") went with it.
    // A future partial seeding declares itself here; until then this asserts there is nothing pending.
    expect(NOT_YET_SEEDED).toEqual({});
    for (const [name, table] of TABLES) {
      expect(table.fuel_oil_distillate_gallon, `${name} distillate`).toBeDefined();
      expect(table.fuel_oil_residual_gallon, `${name} residual`).toBeDefined();
    }
  });

  it('Z17 the US grades derive from EPA heat content x factor, at full precision', () => {
    const ef = EF as any;
    // Distillate No.2 — 0.138 mmBtu/gal x (73.96 CO2, 3 g CH4, 0.6 g N2O). ALL THREE reproduce, which
    // is what ESTABLISHED the legacy key's grade rather than assuming it.
    expect(ef.fuel_oil_distillate_gallon.co2).toBeCloseTo(0.138 * 73.96, 10);
    expect(ef.fuel_oil_distillate_gallon.ch4).toBeCloseTo(0.138 * 3 / 1000, 12);
    expect(ef.fuel_oil_distillate_gallon.n2o).toBeCloseTo(0.138 * 0.6 / 1000, 12);
    expect(ef.fuel_oil_distillate_gallon, 'legacy key IS Distillate No.2').toEqual(ef.fuel_oil_gallon);
    // Residual No.6 — 0.15 mmBtu/gal x (75.10 CO2, 3 g CH4, 0.6 g N2O).
    expect(ef.fuel_oil_residual_gallon.co2).toBeCloseTo(0.15 * 75.10, 10);
    expect(ef.fuel_oil_residual_gallon.ch4).toBeCloseTo(0.15 * 3 / 1000, 12);
    expect(ef.fuel_oil_residual_gallon.n2o).toBeCloseTo(0.15 * 0.6 / 1000, 12);
    // NOT EPA's rounded display column — 11.27 sits 0.005 kg/gal from our own stated arithmetic, and
    // the workings table exists so a verifier can reproduce the row they are shown.
    expect(ef.fuel_oil_residual_gallon.co2, 'carry the derivation, not the rounded column').not.toBe(11.27);
    // EPA publishes the same CH4/N2O per mmBtu for both grades, so they differ only by heat content.
    expect(ef.fuel_oil_residual_gallon.ch4 / ef.fuel_oil_distillate_gallon.ch4).toBeCloseTo(0.15 / 0.138, 9);
  });

  it('Z18 both grades price and emit rows independently, and a site can burn both', () => {
    const G = 3.785411784;
    const both = loc({
      country: 'US',
      has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000, fuel_oil_distillate_unit: 'gallons',
      has_fuel_oil_residual: true, fuel_oil_residual_amount: 1000, fuel_oil_residual_unit: 'gallons',
    });
    const rows = (buildWorkings([both], 'AR6', 2025, [], 12) as any[]).filter(r => !r.declaration && String(r.stream).startsWith('fuel_oil'));
    expect(rows, 'two priced rows, one per grade').toHaveLength(2);
    expect(rows.map(r => r.source).sort()).toEqual(['Heating oil', 'Heavy fuel oil']);
    // EPA distillate 10.2414216 vs residual 11.28942 per gallon at AR6.
    const dist = rows.find(r => r.stream === 'fuel_oil_distillate');
    const resid = rows.find(r => r.stream === 'fuel_oil_residual');
    expect(dist.result_tco2e).toBeCloseTo(10.2414216, 9);
    expect(resid.result_tco2e, 'residual is the heavier oil').toBeGreaterThan(dist.result_tco2e);
    // The location total is the sum of the two, and the per-fuel breakdown keys them apart.
    const c = calcLocation(both, 'AR6', 2025);
    expect(c.s1_total).toBeCloseTo(dist.result_tco2e + resid.result_tco2e, 9);
    // ⚠️ SITE 2 IS fuelEmissionsByType, NOT calcInventory. My own recon called it "calcInventory's
    // per-fuel add"; it is a standalone function whose sole caller is pctEstimated, and its Record is
    // never returned to a caller. So there is nothing to assert on directly — Z8's textual check is
    // what covers that site. This exercises it end-to-end instead: pctEstimated walks both grades and
    // must not throw or double-count.
    expect(() => pctEstimated([both], [], 'AR6', 2025)).not.toThrow();
    expect(pctEstimated([both], [], 'AR6', 2025), 'null = nothing concierge-derived, so no estimated share to report').toBeNull();
    // Each grade declares and quantifies alone.
    expect(streamState(loc({ has_fuel_oil_distillate: true }), 'fuel_oil_distillate')).toBe('declared_unquantified');
    expect(streamState(loc({ has_fuel_oil_distillate: true }), 'fuel_oil_residual')).toBe('undeclared');
    expect(streamState(both, 'fuel_oil_distillate')).toBe('quantified');
    expect(streamState(both, 'fuel_oil_residual')).toBe('quantified');
    // ⚠️ WAS "metric countries convert litres -> gallons"; THEY NO LONGER DO, and that is the point of
    // the per-litre seeding. GB prices from DEFRA's own printed 3.17492 kg CO2e/L, so there is no
    // conversion and therefore no conversion note — asserting its ABSENCE is what keeps the round trip
    // from creeping back in. US-in-gallons above is untouched; US-in-litres still converts (EPA's
    // basis really is the gallon) and V-group covers that.
    const gb = loc({ country: 'GB', has_fuel_oil_residual: true, fuel_oil_residual_amount: 1000, fuel_oil_residual_unit: 'litres' });
    const gbRow = (buildWorkings([gb], 'AR6', 2026, [], 12) as any[]).find(r => r.stream === 'fuel_oil_residual' && !r.declaration);
    expect(gbRow.result_tco2e, "DEFRA's printed per-litre figure, applied directly").toBeCloseTo(1000 * 3.17492 / 1000, 9);
    expect(gbRow.note ?? '', 'no conversion happened, so no conversion note').not.toContain('US gallons');
    expect(G, 'kept as the US-path constant this suite still uses above').toBe(3.785411784);
  });

});

// ── AA. PROPANE READ THE ADJACENT ROW ────────────────────────────────────────────────────────────
//
// EF.propane_gallon carried 5.61561 = 0.091 x 61.71: PROPANE's heat content (0.091 mmBtu/gal) with
// the CO2 factor from LIQUEFIED PETROLEUM GASES (61.71 kg/mmBtu), the row directly beneath it in EPA
// Table 1 Stationary Combustion, Petroleum Products. CH4 and N2O were always derived from Propane's
// own heat content, so exactly one of the three gases came off the wrong line — which is why nothing
// noticed: the row looked internally coherent and every consistency property in this suite held.
//
// ⚠️ NOT AN EDITION DEFECT, AND THE TWO LOOK IDENTICAL FROM INSIDE THE REPO. A wrong-row read and a
// stale table both present as "a factor that does not match the current workbook", and they have
// opposite fixes. The Petroleum Products block carries no blue-text change marker in the 2025 Hub
// workbook, so those rows are the same in the 2024 edition — 62.87 was the 2024 value too. AA4 pins
// that finding so a future reader does not "resolve" this by re-dating EF_SOURCES.combustion.

describe('AA. propane CO2 comes from the Propane row, not the LPG row beneath it', () => {
  const L_PER_GAL = 3.785411784;

  it('AA1 propane_gallon and propane_litre equal their derivations exactly', () => {
    // 0.091 mmBtu/gal x 62.87 kg CO2/mmBtu. toBeCloseTo(10) rather than toBe, because the product is
    // computed in floating point here and stored as a decimal literal there.
    expect(EF.propane_gallon.co2, '0.091 x 62.87').toBeCloseTo(0.091 * 62.87, 10);
    expect(EF.propane_gallon.co2, 'the stored literal').toBe(5.72117);
    expect(EF.propane_litre.co2, '5.72117 / L_PER_GAL at 5dp').toBe(1.51137);
  });

  it('AA2 THE OLD AND NEW VALUES, PINNED — this moved a live customer figure', () => {
    // US propane Scope 1 rises 1.88% on unchanged consumption. Stored inventories do not move
    // (workings is a snapshot), so a customer's next inventory differs from their last by this.
    const OLD_GALLON = 5.61561, NEW_GALLON = 5.72117;
    const OLD_LITRE = 1.48349,  NEW_LITRE = 1.51137;

    expect(EF.propane_gallon.co2).toBe(NEW_GALLON);
    expect(EF.propane_gallon.co2, 'the LPG-derived value must not come back').not.toBe(OLD_GALLON);
    expect(EF.propane_litre.co2).toBe(NEW_LITRE);
    expect(EF.propane_litre.co2).not.toBe(OLD_LITRE);

    // The size of the correction, so a silent partial revert is visible too.
    expect((NEW_GALLON - OLD_GALLON) / OLD_GALLON, 'a 1.88% rise').toBeCloseTo(0.0187976, 7);
    expect(OLD_GALLON, 'the old value WAS Propane heat content x LPG CO2').toBeCloseTo(0.091 * 61.71, 10);
  });

  it('AA3 propane_litre is propane_gallon divided by 3.785411784', () => {
    expect(EF.propane_litre.co2).toBeCloseTo(EF.propane_gallon.co2 / L_PER_GAL, 5);
    // CH4 and N2O are the gallon values through the same constant — confirmed, not assumed.
    // PRECISION 7, NOT 8: these are stored at 3 significant figures (0.0000721, 0.0000144), so the
    // exact quotients sit ~2e-8 away. A tighter tolerance fails against correct values — it did on
    // the first run of this test, which is why the number is spelled out rather than guessed at.
    expect(EF.propane_litre.ch4).toBeCloseTo(EF.propane_gallon.ch4 / L_PER_GAL, 7);
    expect(EF.propane_litre.n2o).toBeCloseTo(EF.propane_gallon.n2o / L_PER_GAL, 7);
  });

  it('AA4 CH4 AND N2O DID NOT MOVE, and still derive from Propane\'s own heat content', () => {
    // The defect was one column wide. If a "fix" moves these too, it has re-read the whole row from
    // somewhere else — including, plausibly, the LPG row's 0.092 heat content.
    expect(EF.propane_gallon.ch4, 'unchanged').toBe(0.000273);
    expect(EF.propane_gallon.n2o, 'unchanged').toBe(0.0000546);
    expect(EF.propane_litre.ch4, 'unchanged').toBe(0.0000721);
    expect(EF.propane_litre.n2o, 'unchanged').toBe(0.0000144);
    expect(EF.propane_gallon.ch4, '0.091 x 3 g/mmBtu').toBeCloseTo(0.091 * 3 / 1000, 12);
    expect(EF.propane_gallon.n2o, '0.091 x 0.6 g/mmBtu').toBeCloseTo(0.091 * 0.6 / 1000, 12);
    // 0.091, NOT the LPG row's 0.092 — the heat content is what the gas factors encode.
    expect(EF.propane_gallon.ch4 / 0.003, 'implied heat content').toBeCloseTo(0.091, 12);
    expect(EF.propane_gallon.ch4 / 0.003).not.toBeCloseTo(0.092, 4);
  });

  it('AA5 THE LPG GUARD — fails loudly if the CO2 factor is ever 61.71 again', () => {
    const WHY =
      'PROPANE IS READING THE LPG ROW AGAIN. EPA Table 1 Stationary Combustion, Petroleum Products ' +
      'lists "Propane" (0.091 mmBtu/gal, CO2 62.87 kg/mmBtu) directly above "Liquefied Petroleum ' +
      'Gases (LPG)" (0.092 mmBtu/gal, CO2 61.71 kg/mmBtu). They are adjacent rows with different ' +
      'factors and it is a one-line eye-slip to take the wrong one. 5.61561 = 0.091 x 61.71 is the ' +
      'exact signature of that slip, and it under-reports every US propane customer by 1.88%. This ' +
      'is NOT an edition question — see AA6.';

    const impliedCo2Factor = EF.propane_gallon.co2 / (EF.propane_gallon.ch4 / 0.003);
    expect(impliedCo2Factor, WHY).toBeCloseTo(62.87, 9);
    expect(impliedCo2Factor, WHY).not.toBeCloseTo(61.71, 4);
    expect(EF.propane_gallon.co2, WHY).not.toBeCloseTo(0.091 * 61.71, 8);
    // And the LPG row's own product, in case someone seeds the whole row rather than the CO2 alone.
    expect(EF.propane_gallon.co2, WHY).not.toBeCloseTo(0.092 * 61.71, 8);
  });

  it('AA6 the finding is recorded as a WRONG-ROW read, not an edition change', () => {
    // Both defects present identically from inside the repo, and re-dating the citation is the
    // plausible wrong fix. The file must say which one this was.
    const src = readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8');
    const block = src.slice(src.indexOf('── PROPANE — EPA Table 1'), src.indexOf('propane_litre:'));
    expect(block.length, 'the propane provenance block is gone').toBeGreaterThan(500);
    expect(block, 'name the adjacent row so the next reader knows which is which').toContain('Liquefied Petroleum Gases (LPG)');
    expect(block, 'both heat contents, so the rows can be told apart').toContain('0.092');
    expect(block, 'the arithmetic, inline').toContain('0.091 x 62.87 = 5.72117');
    expect(block, 'the value it replaced').toContain('5.61561');
    expect(block, 'NOT an edition problem').toMatch(/blue-text marker/);
    // The header's edition warning is NOT resolved by this fix and must survive it.
    expect(src, 'the edition question is still open for every other key').toContain('⚠️ EDITION UNVERIFIED.');
  });

  it('AA7 the check-list transposition is gone, and no other US key moved', () => {
    const src = readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8');
    // SCOPED TO THE CHECK-LIST LINE, not the whole file: the historical note directly below it
    // quotes 10.20608 on purpose, to say what the typo was. A file-wide ban would forbid recording
    // the fix — it failed that way on the first run here.
    const checklist = src.split('\n').filter(l => l.includes('diesel_gallon 10.206'));
    expect(checklist, 'the check-list line moved or was renamed').toHaveLength(1);
    expect(checklist[0], 'the check-list must carry the value the table actually holds')
      .toContain('10.20648');
    expect(checklist[0], '10.20608 prices nothing and never did — it was a typo in this list')
      .not.toContain('10.20608');

    // EVERY OTHER KEY, pinned. A factor-table edit that reaches a second row is the failure mode
    // this suite cannot otherwise see: each value below is independently sourced and none of them
    // has any reason to move with propane.
    expect(EF.natural_gas_mcf).toEqual({ co2: 54.43956, ch4: 0.001026, n2o: 0.0001026 });
    expect(EF.natural_gas_therms).toEqual({ co2: 5.306, ch4: 0.0001, n2o: 0.00001 });
    expect(EF.natural_gas_mmbtu).toEqual({ co2: 53.06, ch4: 0.001, n2o: 0.0001 });
    expect(EF.diesel_gallon).toEqual({ co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 });
    expect(EF.diesel_litre).toEqual({ co2: 2.69627, ch4: 0.0001094, n2o: 0.0000219 });
    expect((EF as any).fuel_oil_gallon).toEqual({ co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 });
    expect(EF.fuel_oil_distillate_gallon).toEqual({ co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 });
    expect(EF.fuel_oil_residual_gallon).toEqual({ co2: 11.265, ch4: 0.00045, n2o: 0.00009 });
    expect(EF.gasoline_gallon).toEqual({ co2: 8.7775, ch4: 0.000375, n2o: 0.000075 });
    expect(EF.gasoline_litre).toEqual({ co2: 2.31877, ch4: 0.0000991, n2o: 0.0000198 });
    expect(EF.diesel_mobile_gallon).toEqual({ co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 });
    expect(EF.diesel_mobile_litre).toEqual({ co2: 2.69627, ch4: 0.0001094, n2o: 0.0000219 });
    expect((EF as any).ammonia).toBe(0);
    // steam_mmbtu was the bare scalar 66.33 — EPA Table 7's CO2 column alone — until 14 Aug 2026.
    // Full three-column pin and the 80%-efficiency derivation live in group S below.
    expect((EF as any).steam_mmbtu).toEqual({ co2: 66.33, ch4: 0.00125, n2o: 0.000125 });

    // AND NO OTHER JURISDICTION'S PROPANE MOVED. Four tables carry their own propane, each from a
    // different publisher; a global find-and-replace on the old figure would be caught here.
    expect((EF_CA as any).propane_gallon.co2, 'ECCC').toBe(5.734896);
    expect((EF_UK as any).propane_litre.co2, 'DEFRA').toBe(1.54358);
    expect((EF_EU as any).propane_gallon.co2, 'IPCC').toBe(5.762);
  });
});

// ── S. PURCHASED STEAM CARRIES EPA TABLE 7 IN FULL ───────────────────────────────────────────────
//
// THE DEFECT THIS PINS. EF.steam_mmbtu was the bare scalar 66.33 — Table 7's CO2 column, alone. The
// workings row displayed it as "kg CO₂e/mmbtu" and hardcoded gwp_basis: GWP_AS_PUBLISHED, which in
// this engine means "the publisher already counted the other gases". That is true of DEFRA, DCCEEW
// and MfE. It is FALSE of EPA, which publishes CH4 and N2O as their own columns — the two we had
// dropped. So a CO2-only number was labelled CO2e and stamped with a basis asserting a completeness
// it did not have: a factor and a citation that do not describe each other.
describe('S. purchased steam — EPA Hub 2025 Table 7, all three columns', () => {
  // Table 7 as published. Source units: CO2 kg/mmBtu, CH4 and N2O GRAMS/mmBtu.
  const TABLE_7 = { co2_kg: 66.33, ch4_g: 1.25, n2o_g: 0.125 };
  const steamLoc = (o: Partial<Location> = {}) =>
    loc({ country: 'US', has_purchased_steam: true, purchased_steam_mmbtu: 1000, purchased_steam_unit: 'mmbtu', ...o });
  const steamRow = (gwp: 'AR4' | 'AR5' | 'AR6' = 'AR6', l = steamLoc()) =>
    (buildWorkings([l], gwp, 2025, [], 12) as any[]).find(r => r.stream === 'purchased_steam' && !r.declaration);

  it('S1 the stored triple is Table 7, in kg', () => {
    // Stored in kg like every other US mass-basis key, so the grams columns divide by 1000.
    expect((EF as any).steam_mmbtu).toEqual({
      co2: TABLE_7.co2_kg, ch4: TABLE_7.ch4_g / 1000, n2o: TABLE_7.n2o_g / 1000,
    });
  });

  it('S2 every column IS the Table 1 natural gas row at 80% thermal efficiency', () => {
    // Table 7's own note: "These factors assume natural gas fuel is used to generate steam or heat at
    // 80 percent thermal efficiency." So this is a DERIVED row, not an independent measurement, and
    // an EPA natural-gas revision must move it too. Pinning the identity — rather than only the three
    // literals — is what catches a commit that updates one table row and not the other.
    const ng = EF.natural_gas_mmbtu, steam = (EF as any).steam_mmbtu;
    // CO2: 53.06 / 0.8 = 66.325, which EPA publishes rounded to 66.33. The rounding is EPA's, so the
    // assertion is to their 2dp — not an invitation to store 66.325.
    expect(Math.round((ng.co2 / 0.8) * 100) / 100, 'CO2: 53.06 / 0.8 -> 66.33').toBe(steam.co2);
    // CH4 and N2O divide exactly, so no rounding step is involved and none is allowed for.
    expect(ng.ch4 / 0.8, 'CH4: 1.00 g / 0.8 = 1.25 g').toBe(steam.ch4);
    expect(ng.n2o / 0.8, 'N2O: 0.10 g / 0.8 = 0.125 g').toBe(steam.n2o);
  });

  it('S3 the row stamps the LIVE GWP set, never as-published', () => {
    // The whole point of the fix. GWP_AS_PUBLISHED was hardcoded here; it is now DETECTED by the same
    // ch4 === 0 && n2o === 0 test every combustion row uses (see factorCells), which the restored
    // triple answers 'false'. If this ever reads as-published again, either the gases were dropped
    // once more or the detection was replaced by an assertion.
    for (const g of ['AR4', 'AR5', 'AR6'] as const) {
      expect(steamRow(g).gwp_basis, `${g}: EPA splits the gases — we combine them, so we own the basis`).toBe(g);
      expect(steamRow(g).gwp_basis, `${g}`).not.toBe('as-published — see factor source');
    }
  });

  it('S4 the combined CO2e per mmBtu, at each AR set', () => {
    // The customer-visible impact, pinned so a GWP-table edit cannot move it silently.
    // AR4 25/298, AR5 28/265, AR6 29.8/273 — restated here as literals rather than read from GWP, so
    // this is an independent second copy and not a tautology.
    const combined = { AR4: 66.3985, AR5: 66.398125, AR6: 66.401375 };
    for (const [g, expected] of Object.entries(combined)) {
      const row = steamRow(g as 'AR6');
      expect(Number(String(row.emission_factor_display).match(/^[\d.]+/)![0]), `${g} displayed factor`).toBeCloseTo(expected, 9);
      // Every one of them exceeds the old CO2-only figure — that IS the recovered CH4/N2O.
      expect(expected).toBeGreaterThan(66.33);
    }
  });

  it('S5 totals and workings state the SAME steam figure', () => {
    // calcLocation and buildWorkings price steam independently (two call sites, one factor). They
    // must not disagree — the invariant that applies to every other stream.
    for (const g of ['AR4', 'AR5', 'AR6'] as const) {
      const l = steamLoc();
      const c = calcLocation(l, g, 2025);
      const row = steamRow(g, l);
      expect(c.s2_location, `${g}: calcLocation vs workings`).toBeCloseTo(row.result_tco2e, 12);
      // No market instrument applies to steam, so the two S2 methods carry an identical steam term.
      expect(c.s2_market, `${g}: market-based carries the same steam term`).toBeCloseTo(c.s2_location, 12);
      // And the inventory total agrees with the location it is made of.
      expect(calcInventory([l], g, 2025).s2_location, `${g}: calcInventory`).toBeCloseTo(row.result_tco2e, 12);
    }
  });

  it('S6 the displayed factor is a true CO2e, and the split is shown as a split', () => {
    const row = steamRow('AR6');
    // THE ORIGINAL MISLABEL: 66.33 is CO2 only. It must never again appear under a CO₂e label.
    expect(row.emission_factor_display, 'a CO2-only figure labelled CO₂e is the defect').not.toBe('66.33 kg CO₂e/mmbtu');
    expect(row.emission_factor_display).toBe('66.401375 kg CO₂e/mmbtu');
    // The raw cell shows the three published columns, so a verifier can see what was combined.
    expect(row.emission_factor).toBe('CO2 66.33, CH4 0.00125, N2O 0.000125 kg/mmbtu');
    // And it must NOT claim the publisher pre-combined them — that wording belongs to DEFRA/MfE rows.
    expect(row.emission_factor).not.toContain('CH₄/N₂O included');
  });

  it('S7 a GJ-entered location converts first, then prices on the full triple', () => {
    // The convert-then-apply path must reach the same factor. 1000 GJ / 1.055056 = 947.8171 mmBtu.
    const row = steamRow('AR6', steamLoc({ purchased_steam_mmbtu: 1000, purchased_steam_unit: 'gj' }));
    // ⚠️ ACTIVITY IS THE ENTERED FIGURE since 14 Aug 2026 — it read 947.8171 mmbtu, an intermediate
    // the customer never saw. The conversion is in the note and the factor is rescaled onto GJ, so
    // the row still reconciles: entered x displayed = result.
    expect(row.activity_unit).toBe('gj');
    expect(row.activity_data).toBe(1000);
    expect(row.note, 'the conversion arithmetic stays on the row').toContain('GJ');
    // Tolerance 6, matching section M's TOL: the displayed factor is efDisplay'd to 10 significant
    // figures, so a recompute from it reconciles to ~1e-9 relative and not bit-exactly. That rounding
    // is the point of toPrecision(10) — it is what makes the printed factor multiply back.
    const shown = Number(String(row.emission_factor_display).match(/^[\d.]+/)![0]);
    expect(row.result_tco2e).toBeCloseTo(row.activity_data * shown / 1000, 6);
    // And the underlying figure is untouched by the presentation change.
    expect(row.result_tco2e).toBeCloseTo(947.8171203133172 * 66.401375 / 1000, 9);
  });
});

// ── T. PURCHASED STEAM IS PER-JURISDICTION ───────────────────────────────────────────────────────
//
// THE DEFECT THIS CLOSES. EF.steam_mmbtu priced EVERY country. A London office on a UK heat network
// was costed with an ASSUMED American natural-gas boiler at 80% thermal efficiency: 1000 GJ read
// 62.9364 tCO2e against DEFRA's 48.6917, a 23% overstatement. The citation was at least honest —
// it said US EPA — but the number was not the UK's.
//
// The rule this suite defends is narrower than "steam is per-country": it is that NO JURISDICTION
// SILENTLY BORROWS ANOTHER'S FACTOR. Four of six publish nothing at all, and the correct output for
// those is a stated absence, never a number.
describe('T. purchased steam — per jurisdiction, with no US fallback', () => {
  const steamLoc = (o: Partial<Location> = {}) =>
    loc({ has_purchased_steam: true, purchased_steam_mmbtu: 1000, purchased_steam_unit: 'gj', ...o });
  const steamRow = (l: Location, gwp: 'AR4' | 'AR5' | 'AR6' = 'AR6') =>
    (buildWorkings([l], gwp, 2025, [], 12) as any[]).find(r => r.stream === 'purchased_steam');
  const UNSEEDED = ['CA', 'AU', 'NZ', 'DE'] as const;

  it('T1 GB prices from EF_UK.steam_kwh, and NOT from EF', () => {
    // 1000 GJ = 277,777.78 kWh; x 0.17529 = 48,691.67 kg = 48.6917 t.
    const row = steamRow(steamLoc({ country: 'GB' }));
    expect(row.result_tco2e).toBeCloseTo(48.6917, 4);
    // Activity is the ENTERED unit; the conversion onto DEFRA's kWh basis is in the note and the
    // displayed factor is rescaled to match. T11 pins the note text.
    expect(row.activity_unit, 'the unit the customer entered').toBe('gj');
    expect(row.activity_data, 'the figure the customer entered').toBe(1000);
    expect(row.ef_source).toBe(EF_SOURCES.steam_uk);
    // The US figure must be nowhere near it — this is the 23% the defect was worth.
    expect(row.result_tco2e).not.toBeCloseTo(62.9364, 2);
  });

  it('T2 GB stamps as-published; US stamps the live set — both DETECTED from the factor', () => {
    // DEFRA combines the gases at AR5 and stores them in `co2` with zeros; EPA Table 7 publishes a
    // real split. factorCells reads ch4 === 0 && n2o === 0, so neither stamp is written by hand.
    for (const g of ['AR4', 'AR5', 'AR6'] as const) {
      expect(steamRow(steamLoc({ country: 'GB' }), g).gwp_basis, `GB ${g}`).toBe('as-published — see factor source');
      expect(steamRow(steamLoc({ country: 'US', purchased_steam_unit: 'mmbtu' }), g).gwp_basis, `US ${g}`).toBe(g);
    }
  });

  it('T3 US is UNCHANGED — 100 MMBtu still prices at 6.6401375 t', () => {
    const row = steamRow(steamLoc({ country: 'US', purchased_steam_mmbtu: 100, purchased_steam_unit: 'mmbtu' }));
    expect(row.result_tco2e).toBeCloseTo(6.6401375, 9);
    expect(row.activity_unit).toBe('mmbtu');
    expect(row.ef_source).toBe(EF_SOURCES.steam_us);
  });

  it('T4 CA/AU/NZ/EU produce NO NUMBER and NO borrowed factor', () => {
    // ⚠️ ASSERTS THE ABSENCE POSITIVELY. A test that only checked "the total did not change" would
    // pass just as happily if the factor silently became 0 — the failure mode this must catch.
    for (const country of UNSEEDED) {
      const l = steamLoc({ country });
      const row = steamRow(l);
      expect(row.declaration, `${country}`).toBe('no_published_factor');
      expect(row.result_tco2e, `${country}: null, never 0 — 0 is a claim of no emissions`).toBeNull();
      expect(row.emission_factor, `${country}: no factor may be shown`).toBe('—');
      expect(row.ef_source, `${country}: no citation, because nothing priced it`).toBe('—');
      // The reported quantity IS carried — "you told us 1000 GJ and we could not price it".
      expect(row.activity_data, `${country}`).toBe(1000);
      expect(row.activity_unit, `${country}`).toBe('gj');
      // And nothing reached the totals.
      expect(calcLocation(l, 'AR6', 2025).s2_location, `${country}`).toBe(0);
      expect(calcLocation(l, 'AR6', 2025).s2_market, `${country}`).toBe(0);
    }
  });

  it('T5 no unseeded jurisdiction lands on the US figure, at any AR set', () => {
    // The specific regression: a `?? EF` reappearing in the steam path. 1000 GJ under the US factor
    // is 62.9364 t; if any of these ever equals that, the fallback is back.
    for (const country of UNSEEDED) {
      for (const g of ['AR4', 'AR5', 'AR6'] as const) {
        const t = calcLocation(steamLoc({ country }), g, 2025).s2_location;
        expect(t, `${country} ${g} must not be the US factor`).not.toBeCloseTo(62.9364, 2);
        expect(t, `${country} ${g}`).toBe(0);
      }
    }
  });

  it('T6 STRUCTURAL — the steam registry contains no fallback to EF', () => {
    // A behavioural test cannot see a fallback that only fires for a jurisdiction added later. This
    // reads the source of the registry region itself, the way engineCallSites.test.ts does.
    const src = readFileSync(join(__dirname, 'engine.ts'), 'utf8');
    const start = src.indexOf('const STEAM_EF: Record<EfJurisdiction, SteamEntry>');
    const end = src.indexOf('function steamTonnes');
    expect(start, 'STEAM_EF declaration not found — has it been renamed?').toBeGreaterThan(-1);
    expect(end, 'steamTonnes not found — has it been renamed?').toBeGreaterThan(start);
    const region = src.slice(start, end).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    // EVERY reference to a factor TABLE in this region, whole-identifier so STEAM_EF itself does not
    // match. Exactly two are legitimate — the seeded US and UK entries. Any third is either a new
    // jurisdiction borrowing a table it should not, or a `??` fallback: both are the defect.
    const tableRefs = [...region.matchAll(/(?<![A-Za-z0-9_$])(EF|EF_CA|EF_UK|EF_EU|EF_AU|EF_NZ)(\.[A-Za-z0-9_]+|\s*\[|\s+as\s+any)/g)]
      .map(m => m[0].trim());
    expect([...new Set(tableRefs)].sort(),
      'A FACTOR TABLE IS REFERENCED IN THE STEAM REGISTRY THAT SHOULD NOT BE.\n\n' +
      'Every pickEF branch ends `?? (EF as any)[key]`, and steam must not. The US steam factor is not\n' +
      'a measurement — EPA derives it by ASSUMING a natural-gas boiler at 80% thermal efficiency — so\n' +
      'serving it to a Canadian location under an ECCC citation invents a boiler that may not exist.\n' +
      'That is also exactly what the commercial factor vendors do, and the defect we are fixing.\n' +
      'STEAM_EF is a TOTAL Record precisely so there is no lookup miss for a fallback to catch.\n' +
      'TO FIX: if a jurisdiction genuinely gained a published factor, seed it and add a `published`\n' +
      'entry naming its own table — do not reach for another country\'s.',
    ).toEqual(['EF.steam_mmbtu', 'EF_UK.steam_kwh']);
  });

  it('T7 the two absence kinds are distinguishable in code, not just in prose', () => {
    // CONFIRMED-UNPUBLISHED (searched, none exists) vs NOT-INVESTIGATED (no primary source consulted)
    // license different actions, and a comment cannot be read by a caller.
    for (const country of ['CA', 'AU', 'NZ']) {
      const e = steamFactorFor({ country }) as any;
      expect(e.kind, `${country} was searched`).toBe('unpublished');
      expect(e.searched.length, `${country} must record WHAT was searched`).toBeGreaterThan(40);
    }
    const eu = steamFactorFor({ country: 'DE' }) as any;
    expect(eu.kind, 'no EU primary source was consulted').toBe('not_searched');
    expect(eu.searched, 'must not claim a search').toBe('');
    // And the customer-facing wording must not assert one either.
    expect(eu.guidance.toLowerCase()).not.toContain('no published');
    expect(steamRow(steamLoc({ country: 'DE' })).quantification_method, 'no "Checked:" line for the EU').toBeUndefined();
    expect(steamRow(steamLoc({ country: 'CA' })).quantification_method).toContain('Checked:');
  });

  it('T8 a supplier-specific factor prices the stream and outranks a published default', () => {
    // The remedy that makes the export block survivable, and primary data where a default exists.
    const ca = steamLoc({ country: 'CA', purchased_steam_supplier_ef: 0.198, purchased_steam_supplier_ef_basis: 'kwh',
                          purchased_steam_supplier_source: 'Enwave Toronto, 2025 statement' });
    const row = steamRow(ca);
    expect(row.declaration, 'no longer a gap').toBeUndefined();
    // 1000 GJ = 277,777.78 kWh x 0.198 = 55,000 kg = 55 t.
    expect(row.result_tco2e).toBeCloseTo(55, 6);
    expect(row.ef_source).toContain('Enwave Toronto');
    expect(row.entry_method).toBe('supplier-specific');
    // A supplier figure is one combined CO2e on the provider's own GWP basis — same convention as DEFRA.
    expect(row.gwp_basis).toBe('as-published — see factor source');
    // It also beats the published GB default, because it is primary data for the network that supplied it.
    const gb = steamLoc({ country: 'GB', purchased_steam_supplier_ef: 0.198, purchased_steam_supplier_ef_basis: 'kwh' });
    expect(steamRow(gb).result_tco2e).toBeCloseTo(55, 6);
    expect(steamRow(gb).result_tco2e).not.toBeCloseTo(48.6917, 3);
  });

  it('T9 other streams still price when steam cannot — no whole-location exclusion', () => {
    // The reason this is NOT MissingEF/assertPriceable: that throws, and unpriceableReason turns a
    // throw into a whole-location exclusion. A Canadian plant must not report nothing because of one
    // district-heat line.
    const l = steamLoc({ country: 'CA', grid_region: 'ON', electricity_kwh: 100_000,
                         has_natural_gas: true, natural_gas_amount: 500, natural_gas_unit: 'm3' });
    const c = calcLocation(l, 'AR6', 2025);
    expect(c.s1_total, 'gas still priced').toBeGreaterThan(0);
    expect(c.s2_location, 'electricity still priced').toBeGreaterThan(0);
    expect(findUnpriceableLocations([l], 'AR6', 2025), 'the location is NOT excluded').toEqual([]);
    // And the steam gap is reported by its own probe rather than by silence.
    expect(findSteamFactorGaps([l]).map(g => g.jurisdiction)).toEqual(['CA']);
  });

  it('T10 findSteamFactorGaps fires exactly when the stream cannot be priced', () => {
    expect(findSteamFactorGaps([steamLoc({ country: 'GB' })]), 'published factor').toEqual([]);
    expect(findSteamFactorGaps([steamLoc({ country: 'US', purchased_steam_unit: 'mmbtu' })]), 'published factor').toEqual([]);
    expect(findSteamFactorGaps([steamLoc({ country: 'CA', purchased_steam_supplier_ef: 0.2, purchased_steam_supplier_ef_basis: 'kwh' })]), 'supplier figure').toEqual([]);
    expect(findSteamFactorGaps([loc({ country: 'CA' })]), 'no steam declared').toEqual([]);
    expect(findSteamFactorGaps([steamLoc({ country: 'CA', purchased_steam_mmbtu: 0 })]), 'declared, no figure').toEqual([]);
    expect(findSteamFactorGaps([steamLoc({ country: 'CA' })]).length, 'declared, quantified, unpriceable').toBe(1);
    // A zero supplier factor is NOT a factor — it is an empty field, and must not price the stream at 0.
    expect(findSteamFactorGaps([steamLoc({ country: 'CA', purchased_steam_supplier_ef: 0 })]).length, '0 is not a factor').toBe(1);
  });

  it('T11 unit conversion reaches the right basis, and the note names the defining constant', () => {
    // GB kWh direct — no conversion, so no note.
    const gbKwh = steamRow(steamLoc({ country: 'GB', purchased_steam_mmbtu: 277777.7778, purchased_steam_unit: 'kwh' }));
    expect(gbKwh.activity_unit).toBe('kwh');
    expect(gbKwh.note, 'no conversion happened').toBeUndefined();
    expect(gbKwh.result_tco2e).toBeCloseTo(48.6917, 3);
    // GB GJ -> kWh.
    const gbGj = steamRow(steamLoc({ country: 'GB' }));
    expect(gbGj.note).toContain('1000 GJ × 277.77777777777777 = 277777.7778 kWh');
    expect(gbGj.note).toContain('exact, 1 kWh ≡ 3.6 MJ by definition');
    expect(gbGj.note).toContain('the published factor is per kWh');
    // US MMBtu direct — no conversion.
    expect(steamRow(steamLoc({ country: 'US', purchased_steam_mmbtu: 100, purchased_steam_unit: 'mmbtu' })).note).toBeUndefined();
    // US GJ -> MMBtu, with the Btu definition named as before.
    const usGj = steamRow(steamLoc({ country: 'US' }));
    expect(usGj.note).toContain('1000 GJ ÷ 1.05505585262 = 947.8171 MMBtu');
    expect(usGj.note).toContain('exact, International Table Btu');
    expect(usGj.note).toContain('the published factor is per MMBtu');
  });

  it('T12 the stored GB fixture means the same thing before and after kWh was added', () => {
    // 212121 GJ is live stored data. Widening GB's unit list must not re-snap or re-interpret it.
    const held = snapUnitsForCountry('GB', { purchased_steam_unit: 'gj' });
    expect(held.purchased_steam_unit, 'a stored GJ value stays GJ').toBe('gj');
    const l = steamLoc({ country: 'GB', purchased_steam_mmbtu: 212121, purchased_steam_unit: 'gj' });
    // 212121 GJ = 58,922,500 kWh x 0.17529 = 10,328,525.025 kg.
    expect(steamRow(l).result_tco2e).toBeCloseTo(10328.525025, 5);
    // And it is NOT being read as 212121 kWh, which would be the silent-relabel failure.
    expect(steamRow(l).result_tco2e).not.toBeCloseTo(212121 * 0.17529 / 1000, 3);
  });

  it('T13 totals, workings and the location breakdown agree on the same steam figure', () => {
    for (const country of ['GB', 'US']) {
      for (const g of ['AR4', 'AR5', 'AR6'] as const) {
        const l = steamLoc({ country, purchased_steam_unit: country === 'US' ? 'mmbtu' : 'gj' });
        const row = steamRow(l, g);
        expect(calcLocation(l, g, 2025).s2_location, `${country} ${g}`).toBeCloseTo(row.result_tco2e, 12);
        expect(calcInventory([l], g, 2025).s2_location, `${country} ${g}`).toBeCloseTo(row.result_tco2e, 12);
      }
    }
  });

  it('T14 efJurisdiction is the ONE router, and pickEF agrees with it', () => {
    // The steam registry keys on efJurisdiction; pickEF switches on it. If they ever disagreed, steam
    // would be looked up under a different table from the fuels at the same location.
    const cases: [string, string][] = [['US', 'US'], ['us', 'US'], ['', 'US'], ['JP', 'US'],
      ['GB', 'UK'], ['UK', 'UK'], ['CA', 'CA'], ['DE', 'EU'], ['FR', 'EU'], ['AU', 'AU'], ['NZ', 'NZ']];
    for (const [country, expected] of cases) {
      expect(efJurisdiction({ country }), country).toBe(expected);
    }
    // pickEF's behaviour is unchanged by the refactor: a GB diesel litre is still DEFRA's, a JP one the US fallback.
    expect(pickEF(loc({ country: 'GB' }), 'diesel_litre' as any).co2).toBe(2.58354);
    expect(pickEF(loc({ country: 'JP' }), 'diesel_gallon' as any).co2).toBe(10.20648);
  });
});

// ── U. THE EU DERIVATION IS SOURCED, BOUNDED WHERE POSSIBLE, AND DISCLOSED ───────────────────────
//
// THE PRIMARY DEFECT THIS CLOSES was not the unsourced densities — it was that the workings row
// asserted something false. It printed a PER-LITRE factor, cited "IPCC (2006) Guidelines Vol.2", and
// left `note` empty. Both cited sources publish on a MASS basis and neither publishes a density, so a
// verifier opening Vol.2 to check 2.68924 kg CO2/L found TJ/Gg and no such number, with nothing on
// the row explaining the step between. The methodology page repeated the claim.
//
// These tests exist because the previous ones could not have caught any of it: Z5 asserted the table
// against a literal copied from its own comment, and NO test anywhere referenced a density.
describe('U. EU combustion — sourced inputs, bounded densities, disclosed derivation', () => {
  // MRR Annex VI Table 1, "Fuel emission factors related to net calorific value (NCV) and net
  // calorific values per mass of fuel", Source column "IPCC 2006 GL". Transcribed ONCE here and used
  // as the expression for every assertion below, so a mis-transcription fails everywhere at once
  // rather than being silently agreed with by a hard-coded expectation.
  const ANNEX_VI = {
    motor_gasoline:  { co2_t_per_TJ: 69.3, ncv_TJ_per_Gg: 44.3 },
    gas_diesel_oil:  { co2_t_per_TJ: 74.1, ncv_TJ_per_Gg: 43.0 },
    residual_oil:    { co2_t_per_TJ: 77.4, ncv_TJ_per_Gg: 40.4 },
    lpg:             { co2_t_per_TJ: 63.1, ncv_TJ_per_Gg: 47.3 },
    natural_gas:     { co2_t_per_TJ: 56.1, ncv_TJ_per_Gg: 48.0 },
  };
  // kg CO2 per litre = (t/TJ x 1000 -> kg/TJ) x (TJ/Gg x 1e-6 -> TJ/kg) x (kg/L)
  const perLitre = (f: { co2_t_per_TJ: number; ncv_TJ_per_Gg: number }, density: number) =>
    f.co2_t_per_TJ * 1000 * f.ncv_TJ_per_Gg * 1e-6 * density;
  const DENSITY = { lpg: 0.510, gas_diesel_oil: 0.844, residual_oil: 0.990, motor_gasoline: 0.745 };
  const G = 3.785411784;   // L_PER_GAL, the repo's conversion authority
  const EU = EF_EU as any;

  // ⚠️ THE STORED VALUES ARE THE EXACT DERIVATION ROUNDED TO 6 SIGNIFICANT FIGURES, and nothing in
  // the table said so until this test. 63100 x 47.3e-6 x 0.510 is 1.5221613, stored as 1.52216; the
  // same rule holds for all four liquids. So the right assertion is EQUALITY against round6(expression)
  // — stronger than any toBeCloseTo, and it states the storage convention as a fact rather than
  // absorbing it into a tolerance.
  const round6 = (x: number) => Number(x.toPrecision(6));

  it('U1 every EU CO2 factor IS the Annex VI expression, at 6 significant figures', () => {
    // Changing ANY of the three inputs now fails. Under the old assertions, changing the density and
    // recomputing both the litre and gallon forms consistently left the suite green.
    expect(EU.propane_litre.co2).toBe(round6(perLitre(ANNEX_VI.lpg, DENSITY.lpg)));
    expect(EU.diesel_litre.co2).toBe(round6(perLitre(ANNEX_VI.gas_diesel_oil, DENSITY.gas_diesel_oil)));
    expect(EU.diesel_mobile_litre.co2).toBe(round6(perLitre(ANNEX_VI.gas_diesel_oil, DENSITY.gas_diesel_oil)));
    expect(EU.gasoline_litre.co2).toBe(round6(perLitre(ANNEX_VI.motor_gasoline, DENSITY.motor_gasoline)));
    // Natural gas takes the volumetric route instead of NCV x density — 56 100 kg/TJ x 36 MJ/m3 — and
    // lands exactly, needing no rounding at all.
    expect(EU.natural_gas_m3.co2).toBe(56100 * 36e-6);
    // Fuel oil is stored per US gallon. Divide back to the litre basis and it reaches the SAME rounded
    // derivation, but only to ~2e-6 — because the gallon key was built from the rounded litre value
    // using an imprecise L_PER_GAL. That second discrepancy is U9's subject, not this test's.
    expect(EU.fuel_oil_residual_gallon.co2 / G).toBeCloseTo(round6(perLitre(ANNEX_VI.residual_oil, DENSITY.residual_oil)), 5);
    expect(EU.fuel_oil_distillate_gallon.co2 / G).toBeCloseTo(round6(perLitre(ANNEX_VI.gas_diesel_oil, DENSITY.gas_diesel_oil)), 5);
  });

  it('U2 the natural-gas volumetric figure decomposes to a density against Annex VI NCV', () => {
    // 36 MJ/m3 / 48.0 MJ/kg = 0.75 kg/m3. Recorded so "~36 MJ/m3" is understood as a density in
    // disguise — the same class of gap as the liquids — rather than a separate mystery.
    const impliedDensity = 36 / (ANNEX_VI.natural_gas.ncv_TJ_per_Gg * 1000 / 1000);
    expect(impliedDensity).toBeCloseTo(0.75, 10);
  });

  it('U3 densities fall INSIDE their European specification ranges — a bound, not a citation', () => {
    // ⚠️ RANGE ASSERTIONS ON PURPOSE. EN 590 and EN 228 specify a range for fuel sold in the EU; they
    // cannot produce a point value, so an equality test here would overstate what the source supports
    // and would freeze a number no publisher actually printed. What IS assertable is that our value is
    // one the specification admits.
    // EN 590, automotive diesel under Directive 98/70/EC: 0.820-0.845 kg/L at 15 C.
    expect(DENSITY.gas_diesel_oil).toBeGreaterThanOrEqual(0.820);
    expect(DENSITY.gas_diesel_oil).toBeLessThanOrEqual(0.845);
    // EN 228, petrol: 0.720-0.775 kg/L at 15 C.
    expect(DENSITY.motor_gasoline).toBeGreaterThanOrEqual(0.720);
    expect(DENSITY.motor_gasoline).toBeLessThanOrEqual(0.775);
    // IPCC Table 1.1 bounds residual fuel oil from BELOW only. Asserted as the one-sided bound it is.
    expect(DENSITY.residual_oil).toBeGreaterThan(0.90);
  });

  it('U4 the two liquid densities sit on DIFFERENT bases, and that is recorded not fixed', () => {
    // Diesel at the conservative top of EN 590, petrol at the EN 228 midpoint. Nobody chose this; it
    // is what comes of values arriving from an unrecorded source. Pinned so the inconsistency stays
    // visible — and NOT harmonised, because harmonising would move a stored figure on an argument no
    // source supports.
    const dieselMid = (0.820 + 0.845) / 2, petrolMid = (0.720 + 0.775) / 2;
    expect(DENSITY.gas_diesel_oil, 'diesel is above its midpoint (conservative)').toBeGreaterThan(dieselMid);
    expect(DENSITY.gas_diesel_oil, 'and within 0.002 of the top of the range').toBeGreaterThan(0.845 - 0.002);
    expect(Math.abs(DENSITY.motor_gasoline - petrolMid), 'petrol is essentially at its midpoint').toBeLessThan(0.005);
  });

  it('U5 propane 0.510 has NO bound test, and its absence is deliberate', () => {
    // ⚠️ READ THIS BEFORE ADDING ONE. Every other density above is checked against a published range.
    // Propane/LPG has none: no European standard bounding it was found, so it is unsourced AND
    // unbounded — the only input in this table in that state. An invented bound here would be exactly
    // the defect this whole change removes, one layer down: a test that manufactures the confidence
    // it is supposed to measure. The gap is asserted as a FACT instead, so it cannot be quietly lost.
    expect(DENSITY.lpg, 'still the stored value — if this moves, the derivation moved with it').toBe(0.510);
    // And the row must SAY SO to the verifier rather than looking like the bounded ones.
    const row = (buildWorkings([loc({ country: 'DE', has_propane: true, propane_amount: 500, propane_unit: 'litres' })],
      'AR6', 2025, [], 12) as any[]).find(r => r.stream === 'propane' && !r.declaration);
    expect(row.note).toContain('no European standard bounding it has been found');
  });

  it('U6 every density-derived EU row carries the derivation, and names the density as unpublished', () => {
    // The empty note field WAS the defect. Each row must now state the arithmetic and disclose which
    // input the citation does not cover.
    const l = loc({ country: 'FR', grid_region: 'EU_FR',
      has_natural_gas: true, natural_gas_amount: 800, natural_gas_unit: 'm3',
      has_propane: true, propane_amount: 500, propane_unit: 'litres',
      has_diesel_stationary: true, diesel_stationary_amount: 400, diesel_stationary_unit: 'litres',
      has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 300, fuel_oil_distillate_unit: 'litres',
      has_fuel_oil_residual: true, fuel_oil_residual_amount: 200, fuel_oil_residual_unit: 'litres',
      has_mobile: true, gasoline_amount: 600, gasoline_unit: 'litres', diesel_mobile_amount: 700, diesel_mobile_unit: 'litres' });
    const priced = (buildWorkings([l], 'AR6', 2025, [], 12) as any[])
      .filter(r => r.scope === 1 && r.result_tco2e != null && !r.declaration);
    // Seven, not six: has_mobile emits petrol AND mobile-diesel as separate rows.
    expect(priced.length, 'seven priced combustion rows').toBe(7);
    for (const r of priced) {
      expect(r.note, `${r.source}: no derivation disclosed`).toBeTruthy();
      expect(r.note, `${r.source}: must not claim the source published this basis`).toMatch(/value DERIVED, not published/);
      expect(r.note, `${r.source}: must disclose the unpublished input`).toContain('from neither cited source');
      expect(r.ef_source, `${r.source}: citation must name the instrument`).toContain('2018/2066');
      expect(r.ef_source, `${r.source}: citation must flag the derivation`).toContain('per-volume derived');
    }
    // ⚠️ WAS "BOTH notes must survive" — the litres->gallons half is GONE, because EU fuel oil now
    // prices from the per-litre derivation directly. The density disclosure must NOT have gone with
    // it: that is the half a verifier needs, and it is the one this group exists to protect.
    const fo = priced.find(r => r.stream === 'fuel_oil_residual');
    expect(fo.note, 'the conversion is gone').not.toContain('US gallons');
    expect(fo.note, 'the disclosure is not').toMatch(/value DERIVED, not published/);
  });

  it('U7 the note names the RIGHT fuel — the key drives both the factor and the prose', () => {
    // pushFuel takes the factor KEY and looks the factor up itself, so a row cannot print one fuel's
    // derivation beside another fuel's number. This is what that buys.
    const rows = (buildWorkings([loc({ country: 'DE',
      has_diesel_stationary: true, diesel_stationary_amount: 400, diesel_stationary_unit: 'litres',
      has_mobile: true, gasoline_amount: 600, gasoline_unit: 'litres' })], 'AR6', 2025, [], 12) as any[]);
    const diesel = rows.find(r => r.source === 'Diesel (stationary)');
    const petrol = rows.find(r => r.source === 'Gasoline (mobile)');
    expect(diesel.note).toContain('74 100 kg CO₂/TJ × 43.0 TJ/Gg × 0.844 kg/L');
    expect(diesel.note).toContain('EN 590');
    expect(petrol.note).toContain('69 300 kg CO₂/TJ × 44.3 TJ/Gg × 0.745 kg/L');
    expect(petrol.note).toContain('EN 228');
    expect(petrol.note, 'petrol must not carry the diesel bound').not.toContain('EN 590');
  });

  it('U8 only EU rows carry the derivation note — US/CA/UK/AU/NZ are published per unit', () => {
    for (const country of ['US', 'CA', 'GB', 'AU', 'NZ']) {
      const r = (buildWorkings([loc({ country, has_diesel_stationary: true, diesel_stationary_amount: 400,
        diesel_stationary_unit: country === 'US' ? 'gallons' : 'litres' })], 'AR6', 2025, [], 12) as any[])
        .find(x => x.source === 'Diesel (stationary)');
      expect(r?.note ?? '', `${country} publishes per unit — nothing to disclose`).not.toMatch(/value DERIVED, not published/);
    }
  });

  it.todo(
    'U9 EU _gallon/_mcf keys should reproduce EXACTLY from their _litre/_m3 form using L_PER_GAL — ' +
    'they do not. Stored vs exact: propane_gallon 5.762 / 5.762002401, diesel_gallon 10.179876 / ' +
    '10.179880786, fuel_oil_gallon 11.718456 / 11.718461406, gasoline_gallon 8.657763 / 8.657766708, ' +
    'natural_gas_mcf 57.188649 / 57.188609280. The gallon keys imply four DIFFERENT values of ' +
    'L_PER_GAL (3.785410004-3.785410207 against the exact 3.785411784) and an M3_PER_MCF of ' +
    '28.316819667 against 28.3168. Effect is ~0.5 ppm. ' +
    'NARROWED 14 Aug 2026, NOT RESOLVED: fuel oil now prices from per-litre keys in every metric ' +
    'jurisdiction, so fuel_oil_gallon / _distillate_gallon / _residual_gallon have LEFT the live EU ' +
    'path and every key named here is now unreachable for an EU location (EU liquids are litres-only). ' +
    'The discrepancy is therefore no longer customer-visible anywhere — it is a latent inconsistency ' +
    'in dead-but-retained keys. KEPT rather than closed because the keys were kept: if any is ever ' +
    'revived, or a jurisdiction gains a gallons entry, it becomes live again at the same 0.5 ppm. ' +
    'W2 pins the litre-to-gallon relationship at the tolerance the discrepancy actually permits.',
  );
});

// ── V. THE ACTIVITY COLUMN SHOWS WHAT THE CUSTOMER ENTERED ──────────────────────────────────────
//
// THE DEFECT. A French site entering 1,000 litres of heating oil read "264.17205 gallons" in the
// Activity data column — the litres→gallons intermediate promoted into the column a verifier reads
// FIRST to confirm what the company consumed, with the actual entry demoted into the note.
//
// SIX JURISDICTIONS, NOT ONE. Fuel-oil factors are stored per US gallon, so every metric jurisdiction
// was affected (CA/UK/EU/AU/NZ) plus a US site that chose litres. Steam had the same shape for a GB
// site entering GJ and a US site entering GJ.
//
// ⚠️ AND THE FACTOR HAD TO MOVE WITH IT. Showing the entered litres beside the published per-GALLON
// factor would have left the row unreproducible by exactly L_PER_GAL: 1000 × 10.21468899 = 10.2147 t
// against a stated 2.6984 t. Section M asserts that reconciliation but its fixtures never exercised a
// converted row (M1 CA gas, M2 steam already in mmbtu, M3 EU gas), so nothing would have caught it.
// These tests close that hole: every case below asserts BOTH halves.
describe('V. activity data is the entered figure, and the row still reconciles', () => {
  const G = 3.785411784;
  const shownFactor = (r: any) => Number(String(r.emission_factor_display).match(/^[\d.]+/)![0]);
  const rowFor = (l: Location, stream: string) =>
    (buildWorkings([l], 'AR6', 2025, [], 12) as any[]).find(r => r.stream === stream && !r.declaration);

  // Every (jurisdiction, unit) combination the blast-radius sweep turned up, plus the two that were
  // already correct, so a regression in either direction fails.
  const FUEL_OIL: [string, 'gallons' | 'litres'][] = [
    ['US', 'gallons'], ['US', 'litres'], ['CA', 'litres'], ['GB', 'litres'],
    ['DE', 'litres'], ['AU', 'litres'], ['NZ', 'litres'],
  ];

  it('V1 fuel oil reports the entered figure and unit in EVERY jurisdiction', () => {
    for (const [country, unit] of FUEL_OIL) {
      const r = rowFor(loc({ country, has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000,
        fuel_oil_distillate_unit: unit }), 'fuel_oil_distillate');
      expect(r.activity_data, `${country}/${unit}: the figure the customer typed`).toBe(1000);
      expect(r.activity_unit, `${country}/${unit}: the unit the customer chose`).toBe(unit);
    }
  });

  it('V2 and the row reconciles — entered x displayed factor = result', () => {
    // The half that would have been silently lost. Under the old shape this passed only because the
    // activity was ALREADY in the factor's unit.
    for (const [country, unit] of FUEL_OIL) {
      const r = rowFor(loc({ country, has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000,
        fuel_oil_distillate_unit: unit }), 'fuel_oil_distillate');
      expect(r.activity_data * shownFactor(r) / 1000, `${country}/${unit} must recompute`).toBeCloseTo(r.result_tco2e, 6);
    }
  });

  it('V3 a litres row shows a per-LITRE factor, not the stored per-gallon one', () => {
    // The specific misreading this removes: "10.21468899 kg CO₂e/gal" printed beside 1,000 litres.
    const eu = rowFor(loc({ country: 'DE', has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000,
      fuel_oil_distillate_unit: 'litres' }), 'fuel_oil_distillate');
    expect(eu.emission_factor_display, 'per litre, matching the activity beside it').toContain('/L');
    // ⚠️ WAS the gallon factor divided by G — a rescale of a rescale. It is now the STORED litre value,
    // with no rescale applied at all, which is what the per-litre seeding bought.
    expect(shownFactor(eu)).toBeCloseTo(2.69843662, 8);
    // A US site that entered gallons is untouched — its factor IS published per gallon.
    const us = rowFor(loc({ country: 'US', has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000,
      fuel_oil_distillate_unit: 'gallons' }), 'fuel_oil_distillate');
    expect(us.emission_factor_display).toContain('/gal');
    expect(shownFactor(us)).toBeCloseTo(10.2414216, 7);
  });

  it('V4 steam reports the entered figure, in both converting jurisdictions', () => {
    const cases: [string, 'gj' | 'kwh' | 'mmbtu'][] = [['GB', 'gj'], ['GB', 'kwh'], ['US', 'gj'], ['US', 'mmbtu']];
    for (const [country, unit] of cases) {
      const r = rowFor(loc({ country, has_purchased_steam: true, purchased_steam_mmbtu: 1000,
        purchased_steam_unit: unit }), 'purchased_steam');
      expect(r.activity_data, `${country}/${unit}`).toBe(1000);
      expect(r.activity_unit, `${country}/${unit}`).toBe(unit);
      expect(r.activity_data * shownFactor(r) / 1000, `${country}/${unit} must recompute`).toBeCloseTo(r.result_tco2e, 6);
    }
  });

  it('V5 NO PRICED FIGURE MOVED — the change is presentation only', () => {
    // Pinned against the values measured live before the change. If any of these moves, the factor
    // rescale has leaked into calcGas, which prices off the UNSCALED factor by design.
    const eu = (u: 'litres') => calcLocation(loc({ country: 'FR',
      has_diesel_stationary: true, diesel_stationary_amount: 1000, diesel_stationary_unit: u,
      has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000, fuel_oil_distillate_unit: u }), 'AR6', 2025);
    const c = eu('litres');
    // ⚠️ THE TWO TERMS ARE NOW EQUAL. They were 2.69843662 and 2.698435354636 — the same gas/diesel
    // oil derivation differing in the ninth decimal because heating oil round-tripped through gallons.
    // That artefact is what the per-litre seeding removes, and V8 asserts the equality directly.
    expect(c.s1_total).toBeCloseTo(2.69843662 * 2, 9);
    // Both rows priced 2.6984 t before this change and must still price 2.6984 t.
    const diesel = rowFor(loc({ country: 'FR', has_diesel_stationary: true, diesel_stationary_amount: 1000,
      diesel_stationary_unit: 'litres' }), 'diesel_stationary');
    const heating = rowFor(loc({ country: 'FR', has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000,
      fuel_oil_distillate_unit: 'litres' }), 'fuel_oil_distillate');
    expect(diesel.result_tco2e.toFixed(4)).toBe('2.6984');
    expect(heating.result_tco2e.toFixed(4)).toBe('2.6984');
    // Priced per litre now. The old via-gallons figure is still what it rounds to at display
    // precision, which is why this re-basing was safe to make.
    expect(heating.result_tco2e).toBeCloseTo(2.69843662, 9);
    expect(((1000 / G) * 10.21468899 / 1000).toFixed(4), 'the old path rounded the same').toBe('2.6984');
  });

  it('V6 the EU citation is one line, and still satisfies F16 and F17', () => {
    // F16 needs every token of COMBUSTION_EDITION.EU ('IPCC 2006'); F17 needs a (YYYY). Asserted here
    // too so a shortening pass fails in the file it is being shortened in.
    const c = EF_SOURCES.combustion_eu;
    expect(c).toContain('IPCC');
    expect(c).toContain('2006');
    expect(/\((\d{4})\)/.test(c), 'F17: a four-digit year in parentheses').toBe(true);
    expect(c).toContain('2018/2066');
    expect(c.length, 'one line — the derivation belongs in the note').toBeLessThan(140);
    expect(c, 'the citation must not defer to the note for its own content').not.toContain('see row note');
  });

  it('V7 the EU note still carries the density and its bound', () => {
    const r = rowFor(loc({ country: 'DE', has_diesel_stationary: true, diesel_stationary_amount: 1000,
      diesel_stationary_unit: 'litres' }), 'diesel_stationary');
    expect(r.note).toContain('0.844 kg/L');
    expect(r.note).toContain('EN 590');
    expect(r.note).toContain('0.820–0.845');
    expect(r.note).toContain('from neither cited source');
    // Trimmed, but not to the point of being uncheckable — the arithmetic must survive.
    expect(r.note).toContain('74 100 kg CO₂/TJ × 43.0 TJ/Gg × 0.844 kg/L = 2.68924');
    expect(r.note.length, 'the citation covers the instrument; the note must not restate it').toBeLessThan(280);
  });
});

// ── W. METRIC FUEL OIL IS PRICED WHERE ITS PUBLISHER PRINTED IT ─────────────────────────────────
//
// Fuel oil was stored per US GALLON in every table, so five of six jurisdictions carried a conversion
// WE imposed: ECCC prints g/L, DEFRA kg/L, DCCEEW per kL, MfE kg/L — only EPA prints per gallon. The
// displayed factor was therefore a rescale of a rescale, and a French site showed 2.698435355 kg
// CO₂e/L for heating oil beside 2.69843662 for diesel: one derivation, two numbers, ninth decimal.
describe('W. metric fuel oil prices per litre, from the publisher\'s own figure', () => {
  const G = 3.785411784;
  const shown = (r: any) => Number(String(r.emission_factor_display).match(/^[\d.]+/)![0]);
  const row = (l: Location, grade: 'distillate' | 'residual') =>
    (buildWorkings([l], 'AR6', 2025, [], 12) as any[]).find(r => r.stream === `fuel_oil_${grade}` && !r.declaration);
  const site = (country: string, grade: 'distillate' | 'residual', unit: 'litres' | 'gallons' = 'litres') =>
    loc({ country, [`has_fuel_oil_${grade}`]: true, [`fuel_oil_${grade}_amount`]: 1000,
          [`fuel_oil_${grade}_unit`]: unit } as Partial<Location>);

  it('W1 each seeded litre key IS its publisher\'s printed figure', () => {
    // EQUALITY where the publisher prints the value; an EXPRESSION where the source needs arithmetic.
    // AU is the only one of the five that publishes neither per litre nor per gallon.
    // CA — ECCC v3.0 Table 4.3 (2026) Industrial rows, g/L -> kg/L.
    // toBeCloseTo per gas, not toEqual: 0.12/1000 is 0.00011999999999999999 in binary float, so an
    // equality against the arithmetic would fail on representation rather than on transcription.
    for (const [grade, co2, ch4, n2o] of [['distillate', 2753, 0.006, 0.031], ['residual', 3156, 0.12, 0.064]] as const) {
      const k = (EF_CA as any)[`fuel_oil_${grade}_litre`];
      expect(k.co2, `CA ${grade} CO2`).toBeCloseTo(co2 / 1000, 10);
      expect(k.ch4, `CA ${grade} CH4`).toBeCloseTo(ch4 / 1000, 10);
      expect(k.n2o, `CA ${grade} N2O`).toBeCloseTo(n2o / 1000, 10);
    }
    // UK — DEFRA 2026 flat file v1.2, printed kg CO2e/L, combined convention.
    expect((EF_UK as any).fuel_oil_distillate_litre).toEqual({ co2: 2.75541, ch4: 0, n2o: 0 });
    expect((EF_UK as any).fuel_oil_residual_litre).toEqual({ co2: 3.17492, ch4: 0, n2o: 0 });
    // NZ — MfE 2026 Table 3.2, printed kg CO2-e/L, per use class.
    expect((EF_NZ as any).commercial.fuel_oil_distillate_litre.co2).toBe(2.97088);
    expect((EF_NZ as any).commercial.fuel_oil_residual_litre.co2).toBe(3.05359);
    expect((EF_NZ as any).industrial.fuel_oil_distillate_litre.co2).toBe(2.96335);
    expect((EF_NZ as any).industrial.fuel_oil_residual_litre.co2).toBe(3.04601);
    // AU — DCCEEW NGA 2025 Table 8: energy content (GJ/kL) x combined Scope 1 EF (kgCO2e/GJ) / 1000.
    // Asserted as the expression, like the AU lines in Z5 — DCCEEW prints neither basis directly.
    expect((EF_AU as any).fuel_oil_distillate_litre.co2).toBeCloseTo(37.3 * 69.73 / 1000, 6);
    expect((EF_AU as any).fuel_oil_residual_litre.co2).toBeCloseTo(39.7 * 73.84 / 1000, 6);
    // EU — the header's own derivation, one step before the gallon keys. CO2/TJ x NCV x density.
    expect((EF_EU as any).fuel_oil_distillate_litre.co2).toBe(Number((74100 * 43.0e-6 * 0.844).toPrecision(6)));
    expect((EF_EU as any).fuel_oil_residual_litre.co2).toBe(Number((77400 * 40.4e-6 * 0.990).toPrecision(6)));
  });

  it('W2 the EU litre keys reproduce the gallon keys they were de-converted from', () => {
    // The cross-check that these are the SAME published row and not a second transcription. CH4/N2O
    // for EU residual are not written per litre anywhere, so this is what establishes them.
    for (const grade of ['distillate', 'residual'] as const) {
      const lit = (EF_EU as any)[`fuel_oil_${grade}_litre`], gal = (EF_EU as any)[`fuel_oil_${grade}_gallon`];
      // ⚠️ TOLERANCE 4, AND THE REASON IS U9, NOT SLOPPINESS. The gallon keys were built with an
      // imprecise L_PER_GAL (3.78541000-3.78541021 against the exact 3.785411784), so litre x G lands
      // ~5.4e-6 from the stored gallon value — just outside 5e-6. That gap is U9's subject and it is
      // now confined to keys the metric path no longer touches. Tightening this would re-assert an
      // exactness the gallon keys do not have.
      for (const gas of ['co2', 'ch4', 'n2o'] as const) {
        expect(lit[gas] * G, `EU ${grade} ${gas}`).toBeCloseTo(gal[gas], 4);
      }
    }
    // Distillate IS the gas/diesel oil row (IPCC Table 1.1), so it is byte-identical to diesel.
    expect((EF_EU as any).fuel_oil_distillate_litre).toEqual((EF_EU as any).diesel_litre);
  });

  it('W3 a metric row shows the STORED litre factor, with no rescale applied', () => {
    const cases: [string, number][] = [['CA', 2.753], ['GB', 2.75541], ['DE', 2.68924], ['AU', 2.600929], ['NZ', 2.97088]];
    for (const [country, storedCo2] of cases) {
      const r = row(site(country, 'distillate'), 'distillate');
      expect(r.activity_data, `${country}`).toBe(1000);
      expect(r.activity_unit, `${country}`).toBe('litres');
      expect(r.emission_factor_display, `${country}`).toContain('/L');
      // The raw split cell carries the stored number itself — pushFuel's rescale ratio is 1 here.
      expect(r.emission_factor, `${country} shows the stored factor`).toContain(String(storedCo2));
      expect(r.activity_data * shown(r) / 1000, `${country} recomputes`).toBeCloseTo(r.result_tco2e, 9);
    }
  });

  it('W4 no metric fuel-oil row carries a litres->gallons conversion any more', () => {
    for (const country of ['CA', 'GB', 'DE', 'AU', 'NZ']) {
      for (const grade of ['distillate', 'residual'] as const) {
        const r = row(site(country, grade), grade);
        expect(r.note ?? '', `${country}/${grade}`).not.toContain('US gallons');
        expect(r.note ?? '', `${country}/${grade}`).not.toContain('3.785411784');
      }
    }
  });

  it('W5 THE ARTEFACT IS GONE — EU diesel and EU heating oil now agree exactly', () => {
    // The visible symptom this task existed to remove: two adjacent rows, one derivation, differing
    // in the ninth decimal because heating oil round-tripped through gallons.
    const l = loc({ country: 'FR',
      has_diesel_stationary: true, diesel_stationary_amount: 1000, diesel_stationary_unit: 'litres',
      has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000, fuel_oil_distillate_unit: 'litres' });
    const rows = buildWorkings([l], 'AR6', 2025, [], 12) as any[];
    const diesel = rows.find(r => r.source === 'Diesel (stationary)');
    const heating = rows.find(r => r.source === 'Heating oil');
    expect(heating.emission_factor_display, 'same displayed factor').toBe(diesel.emission_factor_display);
    expect(heating.result_tco2e, 'same tCO2e, exactly').toBe(diesel.result_tco2e);
    expect(heating.emission_factor).toBe(diesel.emission_factor);
  });

  it('W6 the EU density disclosure SURVIVED the re-basing', () => {
    // ⚠️ IT DID NOT, at first. euDerivationNote is keyed on the factor key; the live key became
    // fuel_oil_*_litre and was in neither the map nor its alias table, so every EU fuel-oil row lost
    // its disclosure while the figures stayed correct — invisible to every other assertion.
    for (const grade of ['distillate', 'residual'] as const) {
      const r = row(site('DE', grade), grade);
      expect(r.note, `${grade}`).toMatch(/value DERIVED, not published/);
      expect(r.note, `${grade}`).toContain('from neither cited source');
    }
    expect(row(site('DE', 'distillate'), 'distillate').note).toContain('0.844 kg/L');
    expect(row(site('DE', 'residual'), 'residual').note).toContain('0.990 kg/L');
  });

  it('W7 US is untouched — gallons direct, litres still converts', () => {
    // EPA's basis genuinely IS the gallon, so a US litres entry is a REAL convert-then-apply step and
    // keeps its note. No US per-litre fuel-oil factor was invented to avoid it.
    const usGal = row(site('US', 'distillate', 'gallons'), 'distillate');
    expect(usGal.activity_unit).toBe('gallons');
    expect(usGal.result_tco2e).toBeCloseTo(10.2414216, 9);
    expect(usGal.note ?? '', 'no conversion for a gallons entry').not.toContain('US gallons');
    const usLit = row(site('US', 'distillate', 'litres'), 'distillate');
    expect(usLit.activity_data, 'still the entered figure').toBe(1000);
    expect(usLit.activity_unit).toBe('litres');
    expect(usLit.note, 'the conversion is real here and must be disclosed').toContain('US gallons');
    expect(usLit.result_tco2e).toBeCloseTo(1000 / G * 10.2414216 / 1000, 9);
    expect((EF as any).fuel_oil_distillate_litre, 'no US per-litre factor was invented').toBeUndefined();
  });

  it('W8 totals, the per-fuel breakdown and the workings row all agree on the new basis', () => {
    // fuelOilPricing is one chooser with three consumers; if any had been left on the gallon path the
    // location total and its own workings row would disagree.
    for (const country of ['CA', 'GB', 'DE', 'AU', 'NZ', 'US']) {
      const unit = country === 'US' ? 'gallons' : 'litres';
      for (const grade of ['distillate', 'residual'] as const) {
        const l = site(country, grade, unit);
        expect(calcLocation(l, 'AR6', 2025).s1_total, `${country}/${grade}`).toBeCloseTo(row(l, grade).result_tco2e, 12);
        expect(calcInventory([l], 'AR6', 2025).s1_total, `${country}/${grade}`).toBeCloseTo(row(l, grade).result_tco2e, 12);
      }
    }
  });
});

// ── AB. THE CH4/N2O SECTOR BASIS IS PINNED, IN EVERY TABLE ──────────────────────────────────────
//
// THE GAP THIS CLOSES. CH4 and N2O rates were asserted NOWHERE. Every existing pin checked CO2 or a
// combined CO2e; the trace-gas rates had to be REVERSE-ENGINEERED out of the stored per-litre values
// to find out which sector table they came from. That is why the choice sat undocumented in five
// tables at once, and why a future sector change could have landed silently.
//
// Publishers split stationary CH4/N2O by END-USE SECTOR. Each table below sits somewhere on that
// axis, and each assertion states WHERE as an expression from the published per-TJ or per-unit rate,
// so a change of sector fails here rather than passing.
describe('AB. CH4/N2O rates are pinned to the sector table they came from', () => {
  const G = 3.785411784;

  // ── EF (US) — EPA Hub 2025 Table 1. Petroleum Products carry ONE column, not a sector set.
  const EPA_PETROLEUM = { ch4_g_per_mmbtu: 3, n2o_g_per_mmbtu: 0.6 };
  const EPA_NATGAS = { ch4_g_per_mmbtu: 1, n2o_g_per_mmbtu: 0.1 };

  it('AB1 EPA petroleum CH4/N2O are UNIFORM across the block — this is what makes "no choice" true', () => {
    // ⚠️ THE LOAD-BEARING ASSERTION FOR EF'S SECTOR COMMENT. "No end-use choice was made" is only true
    // while EPA publishes a single 3 / 0.6 for every petroleum product. Each key stores
    // heat-content x rate, so dividing CH4 by N2O recovers the published RATIO independent of the heat
    // content — and it must be 3/0.6 = 5 on every petroleum key. If EPA ever splits the block by
    // sector, the rows stop agreeing and this fails.
    const expected = EPA_PETROLEUM.ch4_g_per_mmbtu / EPA_PETROLEUM.n2o_g_per_mmbtu;   // 5
    // ⚠️ SPLIT BY STORED PRECISION, NOT BY TOLERANCE-SHOPPING. The per-gallon keys carry the ratio
    // EXACTLY, because they are heat content x rate at full precision. The per-LITRE keys are those
    // values divided by L_PER_GAL and rounded to 3 significant figures, so their ratio drifts up to
    // 0.14% — a property of the rounding, not of the rate. Asserting both at the same tolerance would
    // either fail on the litre keys or stop being exact on the gallon ones.
    const fullPrecision = ['propane_gallon', 'diesel_gallon', 'fuel_oil_gallon',
      'fuel_oil_distillate_gallon', 'fuel_oil_residual_gallon', 'gasoline_gallon', 'diesel_mobile_gallon'];
    for (const key of fullPrecision) {
      const k = (EF as any)[key];
      expect(k.ch4 / k.n2o, `${key}: EPA petroleum ratio 3 / 0.6, exactly`).toBeCloseTo(expected, 9);
    }
    const rounded = ['propane_litre', 'diesel_litre', 'gasoline_litre', 'diesel_mobile_litre'];
    for (const key of rounded) {
      const k = (EF as any)[key];
      // 1% band: ~7x the worst observed rounding drift (0.14%), and ~230x tighter than the gap to any
      // other sector rate, so it still fails instantly if a key moves off the petroleum column.
      expect(Math.abs((k.ch4 / k.n2o) / expected - 1), `${key}: EPA petroleum ratio within rounding`).toBeLessThan(0.01);
    }
    // Natural gas is the OTHER published pair, 1 / 0.1 — same ratio, different level, so the ratio
    // test above cannot tell them apart. The level is pinned directly below.
    for (const key of ['natural_gas_mmbtu', 'natural_gas_mcf', 'natural_gas_therms']) {
      const k = (EF as any)[key];
      expect(k.ch4 / k.n2o, `${key}: EPA gas ratio 1 / 0.1`)
        .toBeCloseTo(EPA_NATGAS.ch4_g_per_mmbtu / EPA_NATGAS.n2o_g_per_mmbtu, 6);
    }
  });

  it('AB2 EF CH4/N2O ARE heat content x the published rate', () => {
    // The level, asserted as the expression. Heat contents are EPA's own, quoted at each key.
    const perMmbtu = (hc: number, g: number) => hc * g / 1000;   // g/mmBtu -> kg/unit
    const P = EPA_PETROLEUM.ch4_g_per_mmbtu, N = EPA_PETROLEUM.n2o_g_per_mmbtu;
    expect((EF as any).natural_gas_mmbtu.ch4).toBeCloseTo(perMmbtu(1, EPA_NATGAS.ch4_g_per_mmbtu), 9);
    expect((EF as any).natural_gas_mmbtu.n2o).toBeCloseTo(perMmbtu(1, EPA_NATGAS.n2o_g_per_mmbtu), 9);
    expect((EF as any).propane_gallon.ch4).toBeCloseTo(perMmbtu(0.091, P), 9);       // 0.091 mmBtu/gal
    expect((EF as any).propane_gallon.n2o).toBeCloseTo(perMmbtu(0.091, N), 9);
    expect((EF as any).fuel_oil_distillate_gallon.ch4).toBeCloseTo(perMmbtu(0.138, P), 9);  // 0.138
    expect((EF as any).fuel_oil_distillate_gallon.n2o).toBeCloseTo(perMmbtu(0.138, N), 9);
    expect((EF as any).fuel_oil_residual_gallon.ch4).toBeCloseTo(perMmbtu(0.15, P), 9);     // 0.15
    expect((EF as any).fuel_oil_residual_gallon.n2o).toBeCloseTo(perMmbtu(0.15, N), 9);
    expect((EF as any).gasoline_gallon.ch4).toBeCloseTo(perMmbtu(0.125, P), 9);             // 0.125
    expect((EF as any).gasoline_gallon.n2o).toBeCloseTo(perMmbtu(0.125, N), 9);
  });

  // ── EF_EU — IPCC 2006 Vol.2 Ch.2. Values are Table 2.2/2.3 (identical for these fuels).
  // T2.4/T2.5 would be 10 for the liquids and 5 for LPG/gas; N2O does not move between tables.
  const IPCC_T22 = {
    natural_gas:    { ch4: 1, n2o: 0.1 },
    lpg:            { ch4: 1, n2o: 0.1 },
    gas_diesel_oil: { ch4: 3, n2o: 0.6 },
    residual_oil:   { ch4: 3, n2o: 0.6 },
    motor_gasoline: { ch4: 3, n2o: 0.6 },
  };
  const perLitre = (rate: number, ncv: number, density: number) => rate * ncv * 1e-6 * density;

  it('AB3 EF_EU is on IPCC Table 2.2/2.3 — the INDUSTRIAL tables, not commercial or residential', () => {
    const EU = EF_EU as any;
    // ⚠️ RELATIVE, 1%, AND NOT AN EQUALITY. These trace-gas values are stored at 2-4 SIGNIFICANT
    // FIGURES depending on the key (propane N2O is 0.0000024, two figures), so an equality would pin
    // each key's ROUNDING rather than its rate, and would have to be re-derived by hand per key. The
    // worst observed drift is 0.51%; the gap to Table 2.4 is +233% for the liquids and +400% for LPG
    // and gas. A 1% band therefore distinguishes the sector tables by a factor of ~230 while staying
    // indifferent to how many figures a key happens to carry.
    const near = (actual: number, expected: number, what: string) =>
      expect(Math.abs(actual / expected - 1), `${what}: within stored rounding of the T2.2/2.3 rate`).toBeLessThan(0.01);
    near(EU.propane_litre.ch4, perLitre(IPCC_T22.lpg.ch4, 47.3, 0.510), 'propane CH4');
    near(EU.propane_litre.n2o, perLitre(IPCC_T22.lpg.n2o, 47.3, 0.510), 'propane N2O');
    near(EU.diesel_litre.ch4, perLitre(IPCC_T22.gas_diesel_oil.ch4, 43.0, 0.844), 'diesel CH4');
    near(EU.diesel_litre.n2o, perLitre(IPCC_T22.gas_diesel_oil.n2o, 43.0, 0.844), 'diesel N2O');
    near(EU.fuel_oil_residual_litre.ch4, perLitre(IPCC_T22.residual_oil.ch4, 40.4, 0.990), 'residual CH4');
    near(EU.fuel_oil_residual_litre.n2o, perLitre(IPCC_T22.residual_oil.n2o, 40.4, 0.990), 'residual N2O');
    near(EU.gasoline_litre.ch4, perLitre(IPCC_T22.motor_gasoline.ch4, 44.3, 0.745), 'gasoline CH4');
    near(EU.gasoline_litre.n2o, perLitre(IPCC_T22.motor_gasoline.n2o, 44.3, 0.745), 'gasoline N2O');
    // Natural gas takes the volumetric route: rate x 36 MJ/m3, and lands exactly.
    expect(EU.natural_gas_m3.ch4).toBeCloseTo(IPCC_T22.natural_gas.ch4 * 36e-6, 12);
    expect(EU.natural_gas_m3.n2o).toBeCloseTo(IPCC_T22.natural_gas.n2o * 36e-6, 12);
    // Distillate shares the gas/diesel oil row, so it must carry diesel's rates unchanged.
    expect(EU.fuel_oil_distillate_litre.ch4).toBe(EU.diesel_litre.ch4);
    expect(EU.fuel_oil_distillate_litre.n2o).toBe(EU.diesel_litre.n2o);
  });

  it('AB4 EF_EU is DEFINITIVELY NOT on Table 2.4 or 2.5', () => {
    // Asserted as an exclusion, not just an equality: the point of the comment is that the choice IS
    // identifiable in one direction (not commercial/residential) even though 2.2 and 2.3 cannot be
    // told apart from the stored values. If a sector selector is ever added, this is what should
    // start failing for the locations that move.
    const EU = EF_EU as any;
    const T24 = { gas_diesel_oil: 10, motor_gasoline: 10, residual_oil: 10, lpg: 5, natural_gas: 5 };
    expect(EU.diesel_litre.ch4).not.toBeCloseTo(perLitre(T24.gas_diesel_oil, 43.0, 0.844), 8);
    expect(EU.gasoline_litre.ch4).not.toBeCloseTo(perLitre(T24.motor_gasoline, 44.3, 0.745), 8);
    expect(EU.fuel_oil_residual_litre.ch4).not.toBeCloseTo(perLitre(T24.residual_oil, 40.4, 0.990), 8);
    expect(EU.propane_litre.ch4).not.toBeCloseTo(perLitre(T24.lpg, 47.3, 0.510), 8);
    expect(EU.natural_gas_m3.ch4).not.toBeCloseTo(T24.natural_gas * 36e-6, 8);
    // The switch is NOT uniform scaling — liquids 3.33x, LPG and gas 5x. Recorded so a future change
    // is not applied as one multiplier.
    expect(T24.gas_diesel_oil / IPCC_T22.gas_diesel_oil.ch4).toBeCloseTo(10 / 3, 9);
    expect(T24.lpg / IPCC_T22.lpg.ch4).toBe(5);
  });

  it('AB5 EPA and IPCC DISAGREE on LPG, and both are preserved', () => {
    // EPA puts propane on the petroleum 3 / 0.6; IPCC keeps LPG on the gaseous 1 / 0.1. Two
    // publishers, not a transcription error. Pinned so a "harmonising" edit fails loudly.
    const usRatePerMmbtu = (EF as any).propane_gallon.ch4 / 0.091 * 1000;   // back to g/mmBtu
    expect(usRatePerMmbtu, 'EPA propane sits on the petroleum rate').toBeCloseTo(3, 6);
    const euRatePerTJ = (EF_EU as any).propane_litre.ch4 / (47.3e-6 * 0.510);
    expect(euRatePerTJ, 'IPCC LPG sits on the gaseous rate').toBeCloseTo(1, 2);
    expect(Math.round(usRatePerMmbtu), 'the two publishers differ, deliberately').not.toBe(Math.round(euRatePerTJ));
  });

  // ── EF_CA — ECCC v3.0, named end-use rows, g/unit published directly.
  it('AB6 EF_CA CH4/N2O are the named ECCC end-use rows, in g/L', () => {
    const CA = EF_CA as any;
    // Light Fuel Oil - Industrial 0.006 / 0.031 g/L; Heavy Fuel Oil - Industrial 0.12 / 0.064 g/L.
    expect(CA.fuel_oil_distillate_litre.ch4).toBeCloseTo(0.006 / 1000, 10);
    expect(CA.fuel_oil_distillate_litre.n2o).toBeCloseTo(0.031 / 1000, 10);
    expect(CA.fuel_oil_residual_litre.ch4).toBeCloseTo(0.12 / 1000, 10);
    expect(CA.fuel_oil_residual_litre.n2o).toBeCloseTo(0.064 / 1000, 10);
    // Diesel "Refineries and Others" 0.078 / 0.022 g/L; propane "All Other Uses" 0.024 / 0.108 g/L;
    // motor gasoline 0.100 / 0.02 g/L. Three DIFFERENT end-use rows, which is the choice the comment
    // records — if any key silently moved to another row, its rate changes and this fails.
    expect(CA.diesel_litre.ch4).toBeCloseTo(0.078 / 1000, 10);
    expect(CA.diesel_litre.n2o).toBeCloseTo(0.022 / 1000, 10);
    expect(CA.propane_litre.ch4).toBeCloseTo(0.024 / 1000, 10);
    expect(CA.propane_litre.n2o).toBeCloseTo(0.108 / 1000, 10);
    expect(CA.gasoline_litre.ch4).toBeCloseTo(0.100 / 1000, 10);
    expect(CA.gasoline_litre.n2o).toBeCloseTo(0.02 / 1000, 10);
    // And the gallon forms are those same rates x L_PER_GAL, so no key drifts between bases.
    expect(CA.gasoline_gallon.ch4).toBeCloseTo(0.100 / 1000 * G, 5);
  });

  it('AB7 UK, AU and NZ have NO sector-varying gas split to pin — the gases are combined at source', () => {
    // Their publishers give one CO2e per unit, so ch4/n2o are 0 by convention and no sector could act
    // on them. Asserted so the ABSENCE of a sector pin for these three reads as "nothing to pin"
    // rather than "nobody wrote one". X4 separately guards that each table stays uniform in style.
    for (const [name, table] of [['EF_UK', EF_UK], ['EF_AU', EF_AU],
                                 ['EF_NZ.commercial', (EF_NZ as any).commercial],
                                 ['EF_NZ.industrial', (EF_NZ as any).industrial]] as [string, any][]) {
      for (const [key, v] of Object.entries(table) as [string, any][]) {
        if (!v || typeof v !== 'object') continue;
        expect(v.ch4, `${name}.${key} combines its gases into co2`).toBe(0);
        expect(v.n2o, `${name}.${key} combines its gases into co2`).toBe(0);
      }
    }
  });

  it('AB8 NZ is the only table with a use-class selector, and it is undisclosed on the row', () => {
    // The precedent the EU and CA open items point at — pinned with BOTH halves, because a future
    // design should start from what nz_use_class actually delivers rather than what it appears to.
    const commercial = loc({ country: 'NZ', nz_use_class: 'commercial', has_diesel_stationary: true,
      diesel_stationary_amount: 1000, diesel_stationary_unit: 'litres' });
    const industrial = { ...commercial, nz_use_class: 'industrial' as const };
    const rowOf = (l: Location) => (buildWorkings([l], 'AR6', 2025, [], 12) as any[])
      .find(r => r.stream === 'diesel_stationary' && !r.declaration);
    // The selector genuinely changes the figure...
    expect(rowOf(commercial).result_tco2e).not.toBe(rowOf(industrial).result_tco2e);
    // ...and NOTHING on the row says which class produced it.
    expect(rowOf(commercial).ef_source, 'same citation for both classes').toBe(rowOf(industrial).ef_source);
    expect(JSON.stringify(rowOf(industrial)), 'use class appears nowhere on the row').not.toContain('industrial');
  });
});
