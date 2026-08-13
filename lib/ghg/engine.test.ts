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
  MissingEmissionFactorError, findUnpriceableLocations,
  streamState, DECLARABLE_STREAMS, STREAM_META, nzTdLoss, NZ_TD_LOSS,
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
    fuel_oil:          { declare: { has_fuel_oil: true },          quantify: { fuel_oil_gallons: 400 } },
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
    const att: StreamAttestation[] = [{ stream: 'fuel_oil', attested_at: '2026-08-13T00:00:00Z' }];
    const absent = buildWorkings([loc({ stream_attestations: att })], 'AR6', 2024, [], 12)
      .filter((r: any) => r.stream === 'fuel_oil') as any[];
    expect(absent[0].declaration).toBe('attested_absent');
    expect(absent[0].result_tco2e).toBe(0); // a CLAIM of no emissions, not an absence

    // Contradiction: the site attests fuel oil absent AND reports using it. The declared state wins,
    // because that is the one a verifier has to resolve.
    const both = buildWorkings([loc({ has_fuel_oil: true, stream_attestations: att })], 'AR6', 2024, [], 12)
      .filter((r: any) => r.stream === 'fuel_oil') as any[];
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
    expect(declarations).toEqual(['diesel_stationary', 'fuel_oil', 'propane', 'purchased_steam']);
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
    // getResidualFactor: 'AIB 2024 residual mix applied to 2026 inventory (latest available).'
    const r = tdRow(2026);
    expect(r.ef_source).toContain('MfE 2025 T&D loss factor applied to 2026 inventory (latest available).');
    // The source citation itself survives — the note is appended, not substituted.
    expect(r.ef_source).toContain('T&D losses (Scope 3 Cat 3)');
  });

  it('O4 NO note when the factor year and the inventory year match', () => {
    const r = tdRow(2025);
    expect(r.factor_vintage).toBe('MfE 2025');
    expect(r.ef_source, 'a matching year has nothing to disclose').not.toContain('applied to');
  });

  it('O5 resolving FORWARD says so, rather than claiming "latest available"', () => {
    // `let ty = years[0]` means a 2023 or 2024 inventory — both selectable in the wizard today —
    // resolves forward to the 2025 factor, so "latest available" would say the opposite of what
    // happened. The note must also not blame MfE: they publish an annual T&D series back to 2010, so
    // the missing years are OURS. It claims only our own coverage — see the note in nzTdLoss.
    for (const y of [2023, 2024]) {
      const r = tdRow(y);
      expect(r.factor_vintage, `inv ${y}`).toBe('MfE 2025');
      expect(r.ef_source, `inv ${y}`).toContain(`MfE 2025 T&D loss factor applied to ${y} inventory (earliest factor held).`);
      expect(r.ef_source, `inv ${y} must not claim "latest available"`).not.toContain('latest available');
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
