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
import {
  buildWorkings, calcLocation, calcInventory, analyzeCoverage, exclusiveEnd,
  isResolvedGridRegion, detectGridRegion, getResidualFactor, getGridFactor,
  pickEF, calcGas, emptyLocation, findUnresolvedCoverage, findUndeclaredStreams, applyResolutions, pctEstimated,
  MissingEmissionFactorError,
  type Location, type CoverageResolution, type CoveragePeriod, type SourceDoc, type ExtractedProposal, type StreamAttestation,
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

      // …and the render path that actually crashed refuses the same way.
      expect(() => calcLocation(l, 'AR6', 2024)).toThrow(MissingEmissionFactorError);
      expect(() => calcInventory([l], 'AR6', 2024)).toThrow(MissingEmissionFactorError);
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
