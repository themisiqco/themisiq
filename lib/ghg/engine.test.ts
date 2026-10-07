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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildWorkings, calcLocation, calcInventory, analyzeCoverage, exclusiveEnd,
  isResolvedGridRegion, detectGridRegion, getResidualFactor, getGridFactor,
  residualRegionFor,
  pickEF, calcGas, emptyLocation, findUnresolvedCoverage, findUndeclaredStreams, applyResolutions, pctEstimated,
  MissingEmissionFactorError, findUnpriceableLocations,
  streamState, DECLARABLE_STREAMS, STREAM_META, nzTdLoss, NZ_TD_LOSS, EF_SOURCES,
  efJurisdiction, steamFactorFor, findSteamFactorGaps, snapUnitsForCountry, steamToBasis,
  canonicalCountryCode, efRouting, countryRefusal, refusalIsFixable, type EfJurisdiction, type CountryRefusal,
  combustionSourcesFor, gridSourcesFor,
  gridRegionForCountry, gridSource, ngUnitOptions, liquidUnitOptions, fuelOilUnitOptions, GRID_EF,
  changeUnit, unitsForCountryChange, applyUnitOutcomes, unitChangeMessage, convertedUnitChange, UNIT_FIELDS, type UnitOutcome,
  EU_COUNTRIES, combustionSource, propaneUnitOptions, steamUnitOptions,
  EF, EF_CA, EF_UK, EF_EU, EF_AU, EF_NZ,
  type Location, type CoverageResolution, type CoveragePeriod, type SourceDoc, type ExtractedProposal, type StreamAttestation,
  type DeclarableStream,
  billContributions, periodFromYearAndEnd, INVALID_PERIOD_MESSAGE, type BillContribution, reportingYearLabel,
  deriveLocations,
  validateResolution, COVERAGE_MESSAGE, emissionsByLocationField,
  documentsBacking, deriveStoredLocations, factorDerivationsFor,
  canonicalPeriod, deliveryDateOf, deliveriesStatement, isDeliveryGroup, sameDocSet,
  valueProblem, NO_VALUE_MESSAGE, proposalNeedsAttention,
  acceptanceProblem, periodOriginOf, BILLING_MONTH_CONFIRM_MESSAGE,
  findExactDuplicates, twoCopies, EXACT_DUPLICATE_NOT_COUNTED,
  notCountedLines, FIX_DATES, FIX_REVERSED, FIX_UNITS,
  unpricedLines, UNPRICED_MESSAGE, UNPRICED_STATUSES,
  M3_PER_MCF, EF_CA_NG_CO2_M3, NZ_GAS_BASIS_NOTE,
} from './engine';
import { guardConfirm, editPeriod } from './proposalEdits';
import { deliveriesCompleteResolution, estimateResolution, NO_MONTHS_TO_ESTIMATE, exactDuplicateCountOnce, exactDuplicateNotSame, upsertResolution } from './coverageActions';
import { buildMonthlyEmissions, reconcile, type MonthlySlice } from './monthlyEmissions';
import { NOT_PROVIDED } from '../notProvided';
import { countryRefusalText } from './countryRefusalCopy';
import { stripTsComments } from '../testing/stripComments';
import { unitOptionsShowing } from './unitLabels';
import { contributionShareCell } from './workingsCells';
import { convertToCanonical, convertibleUnits, exactConversion, EXACT_CONVERSIONS, L_PER_GAL, GJ_PER_MMBTU, KWH_PER_GJ, M3_PER_MCF as M3_PER_MCF_EXACT } from '../unitConversions';

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

  // T2: a stored straddle choice is IGNORED. The straddling bill is prorated automatically by its own
  // days (12 of 31 in FY2024), whatever the legacy resolution said. Was: next_year → 0.
  it("A2 legacy next_year is ignored → the bill is prorated by its own days, 100 × 12/31", () => {
    const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, [straddleRes('next_year')]);
    expect(ngRow(rows)?.activity_data).toBeCloseTo(100 * 12 / 31, 6);
  });

  // T2: was this_year → 100. The legacy choice is ignored; the bill is prorated by its own days.
  it("A3 legacy this_year is ignored → the bill is prorated by its own days, 100 × 12/31", () => {
    const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, [straddleRes('this_year')]);
    expect(ngRow(rows)?.activity_data).toBeCloseTo(100 * 12 / 31, 6);
  });

  // T2: was "a 'prorate' resolution row implies the figure was prorated". The legacy resolution no longer
  // reaches the figure, so it gets no audit row at all (a row must not claim a method not applied); the
  // proration is disclosed on the figure's own row instead.
  it("A4 a legacy straddle resolution gets NO audit row; the proration is disclosed on the gas row itself", () => {
    for (const choice of ['prorate', 'this_year', 'next_year'] as const) {
      const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, [straddleRes(choice)]);
      expect(rows.filter(r => r.gwp_basis === 'coverage_resolution'), choice).toEqual([]);
      expect(ngRow(rows)?.proration_note, choice).toBe('20 December 2024 to 19 January 2025: 12 of 31 days in reporting year 2024, ×0.387');
    }
  });

  it("A5 a straddle-adjusted number must NOT be stamped entry_method 'concierge' (that means read verbatim off bills)", () => {
    const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, [straddleRes('prorate')]);
    expect(ngRow(rows)?.entry_method).not.toBe('concierge');
    // T2: it is stamped concierge-prorated (allocated, not estimated), and carries no extrapolation note.
    expect(ngRow(rows)?.entry_method).toBe('concierge-prorated');
    expect(ngRow(rows)?.extrapolation_note).toBeUndefined();
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
    // T3: was 'straddle'. A straddle is no longer an issue (the two FY-edge cycles are prorated
    // automatically by their own days, rule R2), so a fully covered year is 'full'. The straddles are
    // still listed for display.
    expect(r.status).toBe('full');
    expect(r.issues).toEqual([]);
    expect(r.straddles.length).toBe(2);
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

  // T3: was status 'none'. A confirmed bill with no dates now raises its own 'undated' issue, with a
  // plain-language message naming the document (ruling "no silent zero").
  it("B3b the gate must SURFACE an undated confirmed bill as 'undated', with its message", () => {
    const l = loc({
      id: 'B3', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf',
      // confirmed gas proposal but NO period dates → periods is empty → early-return swallows 'none'.
      source_docs: [doc('utility_bill_gas', [prop({ periodStart: null, periodEnd: null })])],
    });
    const unresolved = findUnresolvedCoverage([l], 2024, 12, []);
    expect(unresolved).toContainEqual(expect.objectContaining({ status: 'undated', docIds: ['doc1'],
      message: 'utility_bill_gas.pdf has no billing period, so it is not counted. Enter the dates as they appear on the bill.' }));
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
    const res: CoverageResolution = {
      locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 9, pctEstimated: 25,
      note: '9 of 12 months; grossed ×12/9', acknowledgedAt: '2024-06-01T00:00:00Z',
    };
    const inv = { locations: [l], reporting_year: 2024, coverage_resolutions: [res] };
    const slices = buildMonthlyEmissions(inv, deps, 'AR6').slices;
    const r = reconcile(slices, inv, 'AR6');
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
    const inv = { locations: [l], reporting_year: 2024 };
    const slices = buildMonthlyEmissions(inv, deps, 'AR6').slices;
    const r = reconcile(slices, inv, 'AR6');
    expect(r.reconciles).toBe(true);
    expect(r.pct_estimated).toBeCloseTo(0, 2);
    expect(r.scope1_evidenced).toBeCloseTo(annual.s1_total, 2); // evidenced ≈ annual (no gross-up)
    expect(r.months_evidenced).toBe(12);
  });

  // T6: the annual figure is now derived from the bills (T4), so a stored field can no longer exceed them.
  // The defect the reconciler still exists to catch is monthly rows that disagree with the bills: here,
  // rows written while a second bill was on file, read against the inventory after it was removed.
  it("F1c a REAL defect — monthly rows the current bills do not support — does NOT reconcile", () => {
    const jan = doc('utility_bill_gas', [prop({ fuelType: 'natural_gas', value: 900, unit: 'mcf', periodStart: '2024-01-01', periodEnd: '2024-09-30' })], 'kept');
    const oct = doc('utility_bill_gas', [prop({ fuelType: 'natural_gas', value: 400, unit: 'mcf', periodStart: '2024-10-01', periodEnd: '2024-12-31' })], 'removed');
    const before = { locations: [loc({ has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: [jan, oct] })], reporting_year: 2024 };
    const after = { locations: [loc({ has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: [jan] })], reporting_year: 2024 };
    const staleSlices = buildMonthlyEmissions(before, deps, 'AR6').slices;
    expect(reconcile(staleSlices, before, 'AR6').reconciles, 'consistent with the bills they came from').toBe(true);
    const r = reconcile(staleSlices, after, 'AR6');
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
    const on = pickEF(loc({ country: 'CA', grid_region: 'ON', natural_gas_unit: 'm3' }), 'natural_gas_m3').factor;
    const ab = pickEF(loc({ country: 'CA', grid_region: 'AB', natural_gas_unit: 'm3' }), 'natural_gas_m3').factor;
    expect(on.co2).not.toBe(ab.co2);
    expect(on.co2).toBeCloseTo(1.921, 3);
    expect(ab.co2).toBeCloseTo(1.962, 3);
  });

  it('G4 UK/AU/NZ fuels do NOT respond to the AR toggle; US/CA/EU DO', () => {
    const same = (l: Location, key: any) => {
      const ef = pickEF(l, key).factor;
      return calcGas(ef, 1000, 'AR4').total === calcGas(ef, 1000, 'AR6').total;
    };
    // published-basis (CO2e baked into co2, ch4/n2o = 0) → GWP-invariant
    expect(same(loc({ country: 'UK', natural_gas_unit: 'kwh' }), 'natural_gas_kwh')).toBe(true);
    expect(same(loc({ country: 'AU', natural_gas_unit: 'm3' }), 'natural_gas_m3')).toBe(true);
    expect(same(loc({ country: 'NZ', natural_gas_unit: 'kwh' }), 'natural_gas_kwh')).toBe(true);
    // gas-split tables → GWP-sensitive
    expect(same(loc({ country: 'US' }), 'natural_gas_mcf')).toBe(false);
    expect(same(loc({ country: 'CA', grid_region: 'ON', natural_gas_unit: 'm3' }), 'natural_gas_m3')).toBe(false);
    expect(same(loc({ country: 'FR', natural_gas_unit: 'kwh' }), 'natural_gas_kwh')).toBe(false);   // FI3: EU gas per kWh
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
    expect(pctEstimated({ locations: [l], coverage_resolutions: [extrapolate('natural_gas', 1)], reporting_year: 2024 }, 'AR6')).toBeCloseTo(91.67, 1);
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
    const pct = pctEstimated({ locations: [l], coverage_resolutions: [extrapolate('natural_gas', 1)], reporting_year: 2024 }, 'AR6');
    // (gasT × 11/12) / (20 × gasT) × 100 = (11/12)/20 × 100 ≈ 4.58 — NOT 91.7.
    expect(pct).toBeCloseTo(4.58, 1);
    expect(pct).toBeLessThan(10);
  });

  it('J3 fully evidenced 12/12 (no extrapolation) → 0% estimated', () => {
    const l = loc({
      has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'mcf',
      source_docs: [gasBill(1200, '2024-12-31')], // full-year bill, no resolution
    });
    expect(pctEstimated({ locations: [l], coverage_resolutions: [], reporting_year: 2024 }, 'AR6')).toBe(0);
  });

  it('J4 wholly manual inventory (no proposals, no resolutions) → null (an absence, not zero)', () => {
    const l = loc({ has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf' }); // source_docs: []
    expect(pctEstimated({ locations: [l], coverage_resolutions: [], reporting_year: 2024 }, 'AR6')).toBeNull();
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
    expect(pctEstimated({ locations: [l], coverage_resolutions: [strad], reporting_year: 2024 }, 'AR6')).toBe(0);
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
  // FI2 diff 2: US gas in m3 and kWh, and AU gas in kWh, now PRICE through an exact conversion (to Mcf, MMBtu and GJ),
  // so they left this list. What remains is gas in a unit no exact conversion reaches from the country's own table.
  const unpriceable: Array<{ country: string; unit: 'm3' | 'kwh' | 'mcf' | 'mmbtu' | 'therms'; key: string }> = [
    // FI2 follow-up: GB gas in mcf and m3 now price on DEFRA's per-m3 row (1_100_1004_1_1); replaced by CA therms and MMBtu.
    // FI3: CA gas in energy units now prices through the national heat content (R12), and EU gas in energy units through
    // the gross kWh key (R7); replaced by EU gas volumes, which have no cited energy content (R6).
    { country: 'DE', unit: 'm3', key: 'natural_gas_m3' },
    { country: 'FR', unit: 'mcf', key: 'natural_gas_mcf' },
    { country: 'IT', unit: 'm3', key: 'natural_gas_m3' },
    { country: 'ES', unit: 'mcf', key: 'natural_gas_mcf' },
    { country: 'NL', unit: 'm3', key: 'natural_gas_m3' },
    { country: 'NZ', unit: 'mcf', key: 'natural_gas_mcf' },  // MfE prints gas per kWh only
    { country: 'NZ', unit: 'm3',  key: 'natural_gas_m3' },
  ];

  for (const { country, unit, key } of unpriceable) {
    it(`K ${country} + ${unit} throws MissingEmissionFactorError naming fuel, unit and country`, () => {
      const l = loc({ country, grid_region: country === 'CA' ? 'ON' : '', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: unit });

      expect(() => calcGas(pickEF(l, key as any).factor, 1000, 'AR6')).toThrow(MissingEmissionFactorError);

      // The message must carry enough for a customer-facing string to be built from it later.
      try {
        calcGas(pickEF(l, key as any).factor, 1000, 'AR6');
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

      // FI1: calcLocation no longer refuses the LOCATION. The line is unpriced (skipped, never zero), the
      // location is not excluded, and unpricedLines names the line with a blocking factor_missing issue.
      expect(() => calcLocation(l, 'AR6', 2024)).not.toThrow();
      expect(calcLocation(l, 'AR6', 2024).s1_total).toBe(0);
      expect(findUnpriceableLocations([l], 'AR6', 2024)).toEqual([]);
      const [u] = unpricedLines(l);
      expect(u).toMatchObject({ reason: 'factor_missing', locId: l.id, field: 'natural_gas_amount', unit, country, factorKey: key, factor: { value: null } });
      expect(findUnresolvedCoverage([l], 2024, 12, []).filter(i => i.status === 'factor_missing').map(i => i.field)).toEqual(['natural_gas_amount']);
    });
  }

  it('K blank country is still named, not reported as undefined', () => {
    // ⚠️ STILL A FACTOR-LOOKUP TEST, NOT A COUNTRY-REFUSAL ONE, AND THE DISTINCTION SURVIVED THE
    // 21 Sep 2026 change. calcLocation prices a stream and throws the factor error; the COUNTRY
    // refusal is decided a level up, in unpriceableReason, before calcLocation is called at all.
    // So this assertion is unchanged: a blank country reaching pickEF still names itself '(unset)'
    // rather than printing 'undefined'. T16 covers the refusal path for the same blank country.
    const l = loc({ country: '', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' });
    // FI1: calcLocation no longer throws; the factor lookup itself still names the blank country.
    expect(() => calcGas(pickEF(l, 'natural_gas_m3').factor, 1000, 'AR6')).toThrow(/\(unset\)/);
  });

  it('K every priceable (country, unit) pair still prices — the guard refuses absence, not everything', () => {
    const priceable: Array<{ country: string; unit: 'mcf' | 'therms' | 'mmbtu' | 'm3' | 'kwh'; key: string }> = [
      { country: 'US', unit: 'mcf',    key: 'natural_gas_mcf' },
      { country: 'US', unit: 'therms', key: 'natural_gas_therms' },
      { country: 'US', unit: 'mmbtu',  key: 'natural_gas_mmbtu' },
      { country: 'CA', unit: 'm3',     key: 'natural_gas_m3' },
      { country: 'CA', unit: 'mcf',    key: 'natural_gas_mcf' },
      { country: 'GB', unit: 'kwh',    key: 'natural_gas_kwh' },
      { country: 'FR', unit: 'kwh',    key: 'natural_gas_kwh' },   // FI3: EU gas prices per kWh gross (R7)
      { country: 'CA', unit: 'mmbtu',  key: 'natural_gas_mmbtu' }, // FI3: via the national heat content (R12)
      { country: 'GB', unit: 'm3',     key: 'natural_gas_m3' },    // FI3: DEFRA's per-m3 row (R11)
      { country: 'AU', unit: 'm3',     key: 'natural_gas_m3' },
      { country: 'NZ', unit: 'kwh',    key: 'natural_gas_kwh' },
    ];
    for (const { country, unit, key } of priceable) {
      const l = loc({ country, grid_region: country === 'CA' ? 'ON' : '', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: unit });
      const total = calcGas(pickEF(l, key as any).factor, 1000, 'AR6').total;
      expect(Number.isFinite(total), `${country} + ${unit} should price`).toBe(true);
      expect(total).toBeGreaterThan(0);
    }
  });
});

// ── GROUP L — one unpriceable location does not take the inventory with it ────
// The isolation contract: the dashboard renders, priceable locations keep their figures, and the
// blocked one is EXCLUDED (contributing nothing) rather than counted as zero — with the exclusion
// stated in the workings, which is what the saved inventory persists.
// FI1 (design doc section 11): REWRITTEN. This group pinned the whole-location exclusion a missing factor
// used to cause. The ruling "no silent drop-out" replaced it: the LINE is unpriced (never zero, never
// silent), the location stays in every total with its other lines, and export blocks on the line.
describe('GROUP L: an unpriceable line is isolated, unpriced and recorded; the location is not excluded (FI1)', () => {
  const good = () => loc({ id: 'GOOD', name: 'Priceable Site', country: 'US', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf' });
  // FI2 follow-up: a NZ site with gas in m3 (MfE prints gas per kWh only); UK gas in m3 now prices on DEFRA's per-m3 row.
  const bad = () => loc({ id: 'BAD', name: 'Blocked Site', country: 'NZ', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' });

  it('L1 a mixed inventory still totals, and the priceable location keeps its exact figure', () => {
    const aloneTotal = calcInventory([good()], 'AR6', 2024).s1_total;
    const mixed = calcInventory([good(), bad()], 'AR6', 2024);
    expect(aloneTotal).toBeGreaterThan(0);
    expect(mixed.s1_total).toBe(aloneTotal); // the unpriced gas adds nothing, not a zero claim
  });

  it('L2 the location is NOT excluded; its one line is unpriced, and order does not matter', () => {
    expect(calcInventory([bad(), good()], 'AR6', 2024)).toEqual(calcInventory([good(), bad()], 'AR6', 2024));
    expect(findUnpriceableLocations([good(), bad()], 'AR6', 2024)).toEqual([]);
    expect(unpricedLines(bad()).map(u => [u.locId, u.field, u.reason])).toEqual([['BAD', 'natural_gas_amount', 'factor_missing']]);
    expect(unpricedLines(good())).toEqual([]);
  });

  it('L3 WAS "every scope is excluded": now the location\'s priceable electricity IS in every total', () => {
    const badWithPower = loc({ ...bad(), grid_region: 'NZ', electricity_kwh: 50_000 });
    const powerOnly = loc({ ...badWithPower, has_natural_gas: false, natural_gas_amount: 0 });
    const inv = calcInventory([badWithPower], 'AR6', 2024);
    expect(inv.s1_total).toBe(0);
    expect(inv.s2_location).toBeGreaterThan(0);
    expect(inv).toEqual(calcInventory([powerOnly], 'AR6', 2024));
  });

  it('L4 buildWorkings writes ONE unpriced row for the line, with null result and the message, beside its priced rows', () => {
    const rows = buildWorkings([good(), loc({ ...bad(), grid_region: 'NZ', electricity_kwh: 50_000 })], 'AR6', 2024, [], 12);
    const badRows = rows.filter(r => r.location === 'Blocked Site');
    const gas = badRows.filter(r => r.stream === 'natural_gas');
    expect(gas).toHaveLength(1);
    expect(gas[0].declaration).toBe('unpriced');
    expect(gas[0].result_tco2e).toBeNull();       // an absence never renders as 0
    expect(gas[0].activity_data).toBe(1000);
    expect(gas[0].activity_unit).toBe('m3');
    expect(gas[0].note).toBe(`NOT PRICED: ${unpricedLines(bad())[0].message}`);
    expect(gas[0].unpriced).toMatchObject({ reason: 'factor_missing', field: 'natural_gas_amount', factor_key: 'natural_gas_m3', value: null });
    // Its electricity is priced, and no whole-location exclusion row exists any more.
    expect(badRows.some(r => r.stream === 'electricity' && r.result_tco2e > 0)).toBe(true);
    expect(rows.some(r => r.declaration === 'unpriceable')).toBe(false);
    expect(rows.filter(r => r.location === 'Priceable Site' && r.result_tco2e! > 0).length).toBeGreaterThan(0);
  });

  it('L5 pctEstimated measures the estimated share against the same priced set', () => {
    expect(() => pctEstimated({ locations: [good(), bad()], coverage_resolutions: [], reporting_year: 2024 }, 'AR6')).not.toThrow();
    expect(pctEstimated({ locations: [good(), bad()], coverage_resolutions: [], reporting_year: 2024 }, 'AR6')).toBe(pctEstimated({ locations: [good()], coverage_resolutions: [], reporting_year: 2024 }, 'AR6'));
  });

  it('L6 the probe is GWP-independent: the same lines are unpriced on AR4, AR5 and AR6', () => {
    const ls = [good(), bad()];
    const lines = (g: 'AR4' | 'AR5' | 'AR6') => ls.flatMap(l => unpricedLines(l, g)).map(u => `${u.locId}:${u.field}`);
    expect(lines('AR4')).toEqual(['BAD:natural_gas_amount']);
    expect(lines('AR5')).toEqual(lines('AR4'));
    expect(lines('AR6')).toEqual(lines('AR4'));
  });

  it('L7 a non-pricing error is NOT absorbed as an unpriced line', () => {
    // Nothing is caught any more: an unpriced line is decided by a lookup, never by a catch, so a bug in
    // the arithmetic still surfaces rather than turning into a customer-facing message about units.
    const exploding = new Proxy(good(), {
      get(t, p) { if (p === 'has_propane') throw new TypeError('boom'); return (t as any)[p] },
    }) as Location;
    expect(() => calcInventory([exploding], 'AR6', 2024)).toThrow(TypeError);
    expect(() => unpricedLines(exploding)).toThrow(TypeError);
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
    // FI1: with a province. A Canadian gas line with none is now unpriced (it was silently priced at
    // Ontario's 1.921, which is the very factor this row checks); ON gives that same factor, chosen.
    const l = { ...loc(), name: 'CA site', country: 'CA', grid_region: 'ON',
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
    expect(row('AU', 'AR6').result_tco2e).toBeCloseTo(2.70972, 9);      // 1000 L x NGA's printed 2,709.72 kg/kL (FI2 follow-up)
    expect(row('GB', 'AR6').result_tco2e).toBeCloseTo(2.58354, 9);   // DEFRA 2026
    expect(row('NZ', 'AR6').result_tco2e).toBeCloseTo(2.6759, 9);
    expect(row('US', 'AR6').result_tco2e).toBeCloseTo(10.244058, 9);
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
    expect(au.emission_factor).toBe('CO₂e 2.70972 kg/litres — CH₄/N₂O included');
    expect(au.emission_factor, 'a zero that means "already counted" must not print as a measured zero')
      .not.toContain('CH4 0');
    // Gas-split rows keep the split verbatim — the verifier path depends on it.
    expect(row('US', 'AR6').emission_factor).toBe('CO2 10.21, CH4 0.00041, N2O 0.00008 kg/gallons');
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
    // AU is the one intended divergence.
    expect(residualRegionFor(anyLoc({ country: 'AU', grid_region: 'AU_NSW' }))).toBe('AU');
    expect(old(anyLoc({ country: 'AU', grid_region: 'AU_NSW' })), 'what it used to return').toBe('');
    // FI5: an eGRID subregion left on a site outside the US no longer wins. It priced an AU (or GB) site's market-based
    // row from Green-e; it is ignored, and the country's own answer stands.
    expect(residualRegionFor(anyLoc({ country: 'AU', grid_region: 'AU_NSW', residual_region: 'ERCT' }))).toBe('AU');
    expect(residualRegionFor(anyLoc({ country: 'GB', grid_region: 'UK', residual_region: 'NWPP' }))).toBe('');
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
  // FI2 diff 2 (ruling R5): each table holds each grade in its PUBLISHER'S unit (EPA per US gallon, everyone else per
  // litre); the other unit converts exactly at pricing. `grade` reads whichever the table holds.
  // FI3 (R8): EU heating oil is held per kg only (no cited heating-oil density), so `grade` falls back to the mass key.
  const grade = (table: Record<string, any>, g: 'distillate' | 'residual') => table[`fuel_oil_${g}_litre`] ?? table[`fuel_oil_${g}_gallon`] ?? table[`fuel_oil_${g}_kg`];

  it('Z1 the legacy fuel_oil_gallon survives only in the US table, the one whose publisher prints per gallon (FI2)', () => {
    expect((EF as any).fuel_oil_gallon).toEqual({ co2: 10.21, ch4: 0.00041, n2o: 0.00008 });
    // FI2 diff 2 (ruling R5): the CA, UK and EU copies were pre-multiplied from per-litre figures, and are gone.
    for (const t of [EF_CA, EF_UK, EF_EU, EF_AU, (EF_NZ as any).commercial]) expect((t as any).fuel_oil_gallon).toBeUndefined();
  });

  // WHAT IS DELIBERATELY ABSENT, and where the reason lives. Declared here rather than skipped inline,
  // so removing an entry is what a seeding commit does — and the test that owns each reason fails if
  // the absence is filled in without also deleting its pin.
  // EMPTY. It held 'EF (US)': ['residual'] until the EPA Table 1 residual row was transcribed, and
  // 'EF_UK': both grades until the DEFRA 2026 refresh. Kept rather than deleted: it is the shape a
  // future jurisdiction's partial seeding declares itself in, and an empty map asserted by Z16 is a
  // stronger statement than no map at all.
  const NOT_YET_SEEDED: Record<string, readonly ('distillate' | 'residual')[]> = {};

  it('Z2 every jurisdiction resolves its OWN grade keys, in its publisher\'s unit; none falls through to US (FI2)', () => {
    for (const [name, table] of TABLES) {
      const absent = NOT_YET_SEEDED[name] ?? [];
      for (const g of ['distillate', 'residual'] as const) {
        expect(grade(table, g) !== undefined, `${name} ${g}`).toBe(!absent.includes(g));
        const unit = name === 'EF (US)' ? 'gallon' : name === 'EF_EU' && g === 'distillate' ? 'kg' : 'litre';
        expect(table[`fuel_oil_${g}_${unit}`], `${name} ${g} is per ${unit}`).toBeDefined();
      }
    }
    // And a figure in the other unit prices from the location's own table, never the US one.
    for (const c of ['CA', 'GB', 'DE', 'AU', 'NZ']) {
      expect(pickEF(loc({ country: c, grid_region: c === 'CA' ? 'ON' : '' }), 'fuel_oil_residual_gallon').publisher?.jurisdiction, c).not.toBe('US');
    }
  });

  it('Z3 residual is heavier than distillate, everywhere both exist', () => {
    // A physical sanity check on the transcription: No.6 / heavy oil carries more carbon per litre
    // than No.2 / light. A transposed pair fails here before anyone reads a workings row.
    for (const [name, table] of TABLES) {
      if (!grade(table, 'residual')) continue;
      // FI3: EU heating oil has no litre key (R8), so there is no per-litre pair to compare there.
      if (name === 'EF_EU') continue;
      expect(grade(table, 'residual').co2, `${name}: residual must exceed distillate`)
        .toBeGreaterThan(grade(table, 'distillate').co2);
    }
  });

  it('Z4 storage convention is preserved — combined tables keep ch4/n2o at 0', () => {
    // Section X stamps gwp_basis from ch4 === 0 && n2o === 0. A new key with the wrong shape would
    // silently change how its row reports the GWP basis.
    for (const [name, table, style] of TABLES) {
      for (const key of ['distillate', 'residual'] as const) {
        const v = grade(table, key);
        if (!v) continue;
        const isCombined = v.ch4 === 0 && v.n2o === 0;
        expect(isCombined, `${name}.${key} must be stored ${style}`).toBe(style === 'combined');
      }
    }
  });

  it('Z5 the seeded values ARE their published per-litre figures (FI2: stored per litre, not converted)', () => {
    // UK, DEFRA 2026 Fuels tab, combined kgCO2e/L
    expect((EF_UK as any).fuel_oil_distillate_litre.co2).toBe(2.75541);
    expect((EF_UK as any).fuel_oil_residual_litre.co2).toBe(3.17492);
    // NZ, MfE 2026 Table 3.2
    expect((EF_NZ as any).commercial.fuel_oil_distillate_litre.co2).toBe(2.97088);
    expect((EF_NZ as any).commercial.fuel_oil_residual_litre.co2).toBe(3.05359);
    expect((EF_NZ as any).industrial.fuel_oil_distillate_litre.co2).toBe(2.96335);
    expect((EF_NZ as any).industrial.fuel_oil_residual_litre.co2).toBe(3.04601);
    // CA, ECCC v3.0 Table 4.3 Industrial, g/L
    expect((EF_CA as any).fuel_oil_distillate_litre.co2).toBe(2.753);
    expect((EF_CA as any).fuel_oil_residual_litre.co2).toBe(3.156);
    // AU, DCCEEW NGA 2025 Table 8, GJ/kL x kgCO2e/GJ
    expect((EF_AU as any).fuel_oil_distillate_litre.co2).toBeCloseTo(37.3 * 69.73 / 1000, 6);
    expect((EF_AU as any).fuel_oil_residual_litre.co2).toBeCloseTo(39.7 * 73.84 / 1000, 6);
    // EU (FI3): MRR Annex VI Table 1 (t CO2/TJ, TJ/Gg) x JEC's HFO density 970 kg/m3, 6 significant figures stored.
    // Heating oil has no litre key (R8); it is held per kg, MRR's mass basis.
    expect((EF_EU as any).fuel_oil_residual_litre.co2).toBeCloseTo(77400 * 40.4e-6 * 0.970, 5);
    expect((EF_EU as any).fuel_oil_distillate_litre).toBeUndefined();
    expect((EF_EU as any).fuel_oil_distillate_kg.co2).toBeCloseTo(74.1 * 43.0 / 1000, 12);
    // A gallon figure prices at exactly these x 3.785411784, from the same table.
    expect(pickEF(loc({ country: 'GB' }), 'fuel_oil_residual_gallon').factor.co2).toBeCloseTo(3.17492 * G, 12);
  });

  it('Z7 EU distillate shares the Gas/Diesel oil row\'s NCV and factor, but not a density (FI3, R8)', () => {
    // IPCC Table 1.1 puts light heating oil in Gas/Diesel Oil, so the mass keys are the same row. No source prints a
    // heating-oil density, and the diesel density is not used for it, so there is no heating-oil litre key.
    expect((EF_EU as any).fuel_oil_distillate_kg).toEqual((EF_EU as any).diesel_kg);
    expect((EF_EU as any).fuel_oil_distillate_litre).toBeUndefined();
    expect((EF_EU as any).diesel_litre).toBeDefined();
    expect((EF_EU as any).fuel_oil_gallon, 'FI2: the legacy residual gallon key is gone').toBeUndefined();
  });

  it('Z8 every pricing site reads GRADE keys through combustionLines, and the retired fuel_oil_gallon is never built (FI2)', () => {
    // FI2 diff 2: the litre-or-gallon chooser (fuelOilPricing) is gone. combustionLines builds the grade key in the unit
    // entered, and pickEF converts exactly to the unit the publisher prints. One list, read by every consumer.
    const src = readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8');
    const code = stripTsComments(src);
    expect(code).not.toContain('function fuelOilPricing');
    expect(code).not.toContain('function fuelOilToGallons');
    const lines = src.slice(src.indexOf('function combustionLines('), src.indexOf('const LINE_UNITS'));
    expect(lines).toContain('`fuel_oil_distillate_${lit(loc.fuel_oil_distillate_unit ?? \'gallons\')}`');
    expect(lines).toContain('`fuel_oil_residual_${lit(loc.fuel_oil_residual_unit ?? \'gallons\')}`');
    expect(lines, "'fuel_oil_gallon' was retired").not.toContain("'fuel_oil_gallon'");
    for (const fn of ['function calcLocation(', 'function fuelEmissionsByType(', 'function buildWorkings(']) {
      const body = src.slice(src.indexOf(fn));
      expect(body.slice(0, body.indexOf('\n}\n')), fn).toContain('combustionLines(loc)');
    }
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
    // The residual-oil FACTOR did not move either.
    expect((EF_UK as any).fuel_oil_residual_litre.co2).toBe(3.17492);
  });

  it('Z10 no UK _gallon keys: a gallon figure converts exactly from DEFRA\'s per-litre value (FI2)', () => {
    // FI2 diff 2 (ruling R5): the seven pre-multiplied gallon keys are gone. A gallon figure converts at pricing.
    const G = 3.785411784;
    const gb = loc({ country: 'GB' });
    for (const [l, g] of [['propane_litre', 'propane_gallon'], ['diesel_litre', 'diesel_gallon'], ['diesel_mobile_litre', 'diesel_mobile_gallon'],
      ['gasoline_litre', 'gasoline_gallon'], ['fuel_oil_residual_litre', 'fuel_oil_residual_gallon'], ['fuel_oil_distillate_litre', 'fuel_oil_distillate_gallon']]) {
      const p = pickEF(gb, g);
      expect(p.key, g).toBe(l);
      expect(p.factor.co2, `${g} = ${l} x L_PER_GAL, exactly`).toBeCloseTo((EF_UK as any)[l].co2 * G, 12);
    }
    expect(Object.keys(EF_UK).filter(k => k.endsWith('_gallon'))).toEqual([]);
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
      `methodology page and is priced on another. Scope 3 spend factors are a DIFFERENT dataset and\n` +
      `are deliberately not in scope here.\n`).toEqual([]);
  });

  it('Z15 the UK residual and distillate grades are DEFRA\'s two different per-litre rows (FI2)', () => {
    // The legacy fuel_oil_gallon (the residual row x L_PER_GAL) is gone; the residual grade IS that row, per litre.
    expect((EF_UK as any).fuel_oil_gallon).toBeUndefined();
    expect((EF_UK as any).fuel_oil_residual_litre.co2).toBe(3.17492);
    expect((EF_UK as any).fuel_oil_distillate_litre).not.toEqual((EF_UK as any).fuel_oil_residual_litre);
  });

  it('Z16 NOT_YET_SEEDED is EMPTY — every table carries both grades', () => {
    // The seeding backlog is closed. Z6 ("US residual is deliberately absent") went with it.
    // A future partial seeding declares itself here; until then this asserts there is nothing pending.
    expect(NOT_YET_SEEDED).toEqual({});
    for (const [name, table] of TABLES) {
      expect(grade(table, 'distillate'), `${name} distillate`).toBeDefined();
      expect(grade(table, 'residual'), `${name} residual`).toBeDefined();
    }
  });

  it('Z17 the US grades are EPA Table 1\'s printed per-gallon column (FI2 diff 3, ruling R5)', () => {
    const ef = EF as any;
    // Distillate No. 2: 10.21 kg CO2, 0.41 g CH4, 0.08 g N2O per gallon. The legacy key carries the same row.
    expect(ef.fuel_oil_distillate_gallon).toEqual({ co2: 10.21, ch4: 0.00041, n2o: 0.00008 });
    expect(ef.fuel_oil_distillate_gallon, 'legacy key IS Distillate No.2').toEqual(ef.fuel_oil_gallon);
    // Residual No. 6: 11.27 kg CO2, 0.45 g CH4, 0.09 g N2O per gallon. EPA's printed column, not 0.15 x 75.10 = 11.265.
    expect(ef.fuel_oil_residual_gallon).toEqual({ co2: 11.27, ch4: 0.00045, n2o: 0.00009 });
    expect(ef.fuel_oil_residual_gallon.co2, 'the printed column, not the derivation').not.toBe(11.265);
    // Each printed value is EPA's own heat content x per-mmBtu factor, to the printed precision.
    expect(Math.abs(ef.fuel_oil_distillate_gallon.co2 - 0.138 * 73.96)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(ef.fuel_oil_residual_gallon.co2 - 0.15 * 75.10)).toBeLessThanOrEqual(0.005 + 1e-12);
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
    // EPA Table 1 per gallon at AR6 (FI2 diff 3): distillate 10.244058, residual 11.30798.
    const dist = rows.find(r => r.stream === 'fuel_oil_distillate');
    const resid = rows.find(r => r.stream === 'fuel_oil_residual');
    expect(dist.result_tco2e).toBeCloseTo(10.244058, 9);
    expect(resid.result_tco2e, 'residual is the heavier oil').toBeGreaterThan(dist.result_tco2e);
    // The location total is the sum of the two, and the per-fuel breakdown keys them apart.
    const c = calcLocation(both, 'AR6', 2025);
    expect(c.s1_total).toBeCloseTo(dist.result_tco2e + resid.result_tco2e, 9);
    // ⚠️ SITE 2 IS fuelEmissionsByType, NOT calcInventory. My own recon called it "calcInventory's
    // per-fuel add"; it is a standalone function whose sole caller is pctEstimated, and its Record is
    // never returned to a caller. So there is nothing to assert on directly — Z8's textual check is
    // what covers that site. This exercises it end-to-end instead: pctEstimated walks both grades and
    // must not throw or double-count.
    expect(() => pctEstimated({ locations: [both], coverage_resolutions: [], reporting_year: 2025 }, 'AR6')).not.toThrow();
    expect(pctEstimated({ locations: [both], coverage_resolutions: [], reporting_year: 2025 }, 'AR6'), 'null = nothing concierge-derived, so no estimated share to report').toBeNull();
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

  it('AA1 propane_gallon is EPA\'s printed Propane column, and propane_litre converts from it exactly', () => {
    // FI2 diff 3 (ruling R5): Table 1's per-gallon column for Propane, 5.72 kg CO2, 0.27 g CH4, 0.05 g N2O, in place
    // of the full-precision 0.091 x 62.87 = 5.72117. The printed value is that product to two decimals.
    expect(EF.propane_gallon).toEqual({ co2: 5.72, ch4: 0.00027, n2o: 0.00005 });
    expect(EF.propane_gallon.co2, '0.091 x 62.87, as printed').toBeCloseTo(0.091 * 62.87, 2);
    // FI2 diff 2 (ruling R5): no stored per-litre key. Litres convert exactly from EPA's per-gallon figure.
    expect((EF as any).propane_litre, 'the pre-multiplied 1.51137 is gone').toBeUndefined();
    expect(pickEF(loc({ country: 'US' }), 'propane_litre').factor.co2, '5.72 / L_PER_GAL, exactly').toBeCloseTo(5.72 / L_PER_GAL, 12);
  });

  it('AA2 THE OLD AND NEW VALUES, PINNED — this moved a live customer figure', () => {
    // US propane Scope 1 rises 1.88% on unchanged consumption. Stored inventories do not move
    // (workings is a snapshot), so a customer's next inventory differs from their last by this.
    // FI2 diff 3: the corrected value is now EPA's printed 5.72; the size of the 13 Aug correction is still measured
    // against the full-precision 5.72117 it was made to.
    const OLD_GALLON = 5.61561, NEW_GALLON = 5.72117, PRINTED = 5.72;
    const OLD_LITRE = 1.48349;

    expect(EF.propane_gallon.co2).toBe(PRINTED);
    expect(EF.propane_gallon.co2, 'the LPG-derived value must not come back').not.toBe(OLD_GALLON);
    // FI2 diff 2: the per-litre figure is the exact conversion of NEW_GALLON (1.5113732…, was the stored 1.51137).
    const perLitre = pickEF(loc({ country: 'US' }), 'propane_litre').factor.co2;
    expect(perLitre).toBeCloseTo(PRINTED / L_PER_GAL, 12);
    expect(perLitre).not.toBeCloseTo(OLD_LITRE, 3);

    // The size of the correction, so a silent partial revert is visible too.
    expect((NEW_GALLON - OLD_GALLON) / OLD_GALLON, 'a 1.88% rise').toBeCloseTo(0.0187976, 7);
    expect(OLD_GALLON, 'the old value WAS Propane heat content x LPG CO2').toBeCloseTo(0.091 * 61.71, 10);
  });

  it('AA3 propane per litre is propane_gallon divided by 3.785411784, all three gases, exactly (FI2)', () => {
    // FI2 diff 2 (ruling R5): the per-litre key, which stored these quotients rounded to 3 significant figures, is gone.
    const l = pickEF(loc({ country: 'US' }), 'propane_litre');
    for (const g of ['co2', 'ch4', 'n2o'] as const) expect(l.factor[g], g).toBeCloseTo(EF.propane_gallon[g] / L_PER_GAL, 14);
    expect(l.key).toBe('propane_gallon');
    expect(l.conversion?.statement).toBe('1 US gallon = 3.785411784 litres');
  });

  it('AA4 CH4 AND N2O are Propane\'s own printed column, not the LPG row\'s', () => {
    // The defect was one column wide. FI2 diff 3: these are now Table 1's printed 0.27 g and 0.05 g per gallon, which
    // are 0.091 x 3 g and 0.091 x 0.6 g to the printed precision. The LPG row's 0.092 x 3 g would print 0.28 g.
    expect(EF.propane_gallon.ch4, 'printed 0.27 g').toBe(0.00027);
    expect(EF.propane_gallon.n2o, 'printed 0.05 g').toBe(0.00005);
    expect(Math.abs(EF.propane_gallon.ch4 * 1000 - 0.091 * 3), '0.091 x 3 g/mmBtu, as printed').toBeLessThanOrEqual(0.005);
    expect(Math.abs(EF.propane_gallon.n2o * 1000 - 0.091 * 0.6), '0.091 x 0.6 g/mmBtu, as printed').toBeLessThanOrEqual(0.005);
    expect(EF.propane_gallon.ch4, 'not the LPG row (0.092 x 3 g = 0.276 g)').not.toBe(0.00028);
  });

  it('AA5 THE LPG GUARD — fails loudly if the CO2 factor is ever 61.71 again', () => {
    const WHY =
      'PROPANE IS READING THE LPG ROW AGAIN. EPA Table 1 Stationary Combustion, Petroleum Products ' +
      'lists "Propane" (0.091 mmBtu/gal, CO2 62.87 kg/mmBtu) directly above "Liquefied Petroleum ' +
      'Gases (LPG)" (0.092 mmBtu/gal, CO2 61.71 kg/mmBtu). They are adjacent rows with different ' +
      'factors and it is a one-line eye-slip to take the wrong one. 5.61561 = 0.091 x 61.71 is the ' +
      'exact signature of that slip, and it under-reports every US propane customer by 1.88%. This ' +
      'is NOT an edition question — see AA6.';

    // FI2 diff 3: the stored value is EPA's printed 5.72, so the implied factor is 62.87 to within the printed rounding
    // (0.005 / 0.091 = 0.055 kg/mmBtu), and still more than a whole kg/mmBtu from the LPG row's 61.71.
    const impliedCo2Factor = EF.propane_gallon.co2 / 0.091;
    expect(Math.abs(impliedCo2Factor - 62.87), WHY).toBeLessThan(0.06);
    expect(Math.abs(impliedCo2Factor - 61.71), WHY).toBeGreaterThan(1);
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
    // FI2 diff 3: the line now carries EPA's printed 10.21, which is what the table holds.
    const checklist = src.split('\n').filter(l => /^\/\/\s+diesel_gallon 10\.2/.test(l));
    expect(checklist, 'the check-list line moved or was renamed').toHaveLength(1);
    expect(checklist[0], 'the check-list must carry the value the table actually holds')
      .toContain('10.21');
    expect(checklist[0], '10.20608 prices nothing and never did — it was a typo in this list')
      .not.toContain('10.20608');

    // EVERY OTHER KEY, pinned. A factor-table edit that reaches a second row is the failure mode
    // this suite cannot otherwise see: each value below is independently sourced and none of them
    // has any reason to move with propane.
    // FI2 diff 3: the per-Mcf and per-gallon keys are EPA Table 1's printed per-scf (x 1,000) and per-gallon columns.
    expect(EF.natural_gas_mcf).toEqual({ co2: 54.44, ch4: 0.00103, n2o: 0.0001 });
    // FI2 diff 2 (ruling R5): natural_gas_therms and the four per-litre keys are gone; those units convert exactly.
    for (const k of ['natural_gas_therms', 'diesel_litre', 'gasoline_litre', 'diesel_mobile_litre', 'propane_litre']) expect((EF as any)[k], k).toBeUndefined();
    expect(EF.natural_gas_mmbtu).toEqual({ co2: 53.06, ch4: 0.001, n2o: 0.0001 });
    expect(EF.diesel_gallon).toEqual({ co2: 10.21, ch4: 0.00041, n2o: 0.00008 });
    expect((EF as any).fuel_oil_gallon).toEqual({ co2: 10.21, ch4: 0.00041, n2o: 0.00008 });
    expect(EF.fuel_oil_distillate_gallon).toEqual({ co2: 10.21, ch4: 0.00041, n2o: 0.00008 });
    expect(EF.fuel_oil_residual_gallon).toEqual({ co2: 11.27, ch4: 0.00045, n2o: 0.00009 });
    expect(EF.gasoline_gallon).toEqual({ co2: 8.78, ch4: 0.00038, n2o: 0.00008 });
    expect(EF.diesel_mobile_gallon).toEqual({ co2: 10.21, ch4: 0.00041, n2o: 0.00008 });
    expect((EF as any).ammonia).toBe(0);
    // steam_mmbtu was the bare scalar 66.33 — EPA Table 7's CO2 column alone — until 14 Aug 2026.
    // Full three-column pin and the 80%-efficiency derivation live in group S below.
    expect((EF as any).steam_mmbtu).toEqual({ co2: 66.33, ch4: 0.00125, n2o: 0.000125 });

    // AND NO OTHER JURISDICTION'S PROPANE MOVED. Four tables carry their own propane, each from a
    // different publisher; a global find-and-replace on the old figure would be caught here.
    expect((EF_CA as any).propane_litre.co2, 'ECCC (per litre; the gallon key is gone, FI2)').toBe(1.515);
    expect((EF_UK as any).propane_litre.co2, 'DEFRA').toBe(1.54358);
    // FI3: the EU propane litre key is gone (no cited LPG density); EU propane by mass is FI4.
    expect((EF_EU as any).propane_litre, 'IPCC: no EU propane litre key (FI3)').toBeUndefined();
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
    // The ROW carries the table as well as the publication; factor_editions stores the bare citation.
    // Canonicalised 17 Sep 2026: the locator is a separate field, composed onto the row here.
    expect(row.ef_source).toBe(
      'UK DEFRA/DESNZ (2026) GHG Conversion Factors for Company Reporting — flat file v1.2, Scope 2 sheet, ' +
      'Heat and steam > District heat and steam');
    expect(row.ef_source.startsWith(EF_SOURCES.steam_uk), 'the row citation begins with the canonical one').toBe(true);
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
      expect(row.emission_factor, `${country}: no factor may be shown`).toBe(NOT_PROVIDED);
      expect(row.ef_source, `${country}: no citation, because nothing priced it`).toBe(NOT_PROVIDED);
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
    // ⚠️ CHANGED 21 SEP 2026. This list used to read ['', 'US'] and ['JP', 'US'], and the line below
    // used to assert that a Japanese diesel gallon took the US EPA factor. Both were accurate
    // records of the fallback, and the fallback is what was removed: a country this platform holds
    // no factors for now resolves to NO jurisdiction, and its location is excluded from every total
    // rather than priced from somebody else's table.
    const cases: [string, EfJurisdiction | null][] = [['US', 'US'], ['us', 'US'], ['', null], ['JP', null],
      ['GB', 'UK'], ['UK', 'UK'], ['CA', 'CA'], ['DE', 'EU'], ['FR', 'EU'], ['AU', 'AU'], ['NZ', 'NZ']];
    for (const [country, expected] of cases) {
      expect(efJurisdiction({ country }), country).toBe(expected);
    }
    // A supported jurisdiction is untouched: a GB diesel litre is still DEFRA's.
    expect(pickEF(loc({ country: 'GB' }), 'diesel_litre' as any).factor.co2).toBe(2.58354);
    // ⚠️ AND THE JAPANESE ONE IS NOW A REFUSAL, NOT A NUMBER. pickEF returns the same uniform miss
    // marker a missing table row produces, so calcGas declines to price it by the path that already
    // existed. The figure it used to return, 10.20648, was the US EPA diesel factor.
    expect(() => calcGas(pickEF(loc({ country: 'JP' }), 'diesel_gallon' as any).factor, 100, 'AR6')).toThrow(MissingEmissionFactorError);
  });
});

// ── T15. ONE SPELLING PER COUNTRY, AND ONE ROUTER ────────────────────────────────────────────────
//
// Greece is the case these exist for. ISO 3166-1 assigns GR; every factor key in this engine is
// spelled EL. Before canonicalCountryCode, a location stored as 'GR' was wrong in SEVEN separate
// places at once, and the worst of them was silent: gridRegionForCountry returned '' for it, which
// isResolvedGridRegion rejects, so the electricity rows were omitted from the workings and every
// export blocked. Fixing only the factor router would have routed Greek FUELS to the EU tables
// while its electricity stayed unresolved and its units stayed American, which is harder to spot
// than the original defect because the fuel rows would have looked right.
describe('T15 country canonicalisation', () => {
  it('maps the two codes whose ISO spelling is not the engine spelling, and nothing else', () => {
    expect(canonicalCountryCode('GR')).toBe('EL');
    expect(canonicalCountryCode('UK')).toBe('GB');
    // Case and whitespace are handled on the way in, as they always were.
    expect(canonicalCountryCode(' gr ')).toBe('EL');
    expect(canonicalCountryCode('uk')).toBe('GB');
    // Everything else is returned unchanged, upper-cased and trimmed.
    for (const c of ['US', 'CA', 'GB', 'EL', 'AU', 'NZ', 'FR', 'JP', 'OTHER', 'ZZ']) {
      expect(canonicalCountryCode(c), c).toBe(c);
    }
    expect(canonicalCountryCode('')).toBe('');
    expect(canonicalCountryCode(undefined)).toBe('');
    // NOT a name alias table. Names are detectGridRegion's business and are left alone.
    expect(canonicalCountryCode('GREECE')).toBe('GREECE');
  });

  it('GR and EL are indistinguishable to every country-keyed function in the engine', () => {
    const gr = loc({ country: 'GR' }), el = loc({ country: 'EL' });
    // 1. the factor router
    expect(efJurisdiction(gr)).toBe(efJurisdiction(el));
    expect(efJurisdiction(gr)).toBe('EU');
    // 2. the grid region, and it must be a REAL GRID_EF key, not merely equal
    expect(gridRegionForCountry('GR')).toBe(gridRegionForCountry('EL'));
    expect(gridRegionForCountry('GR')).toBe('EU_EL');
    expect(GRID_EF['EU_EL'], 'EU_EL must exist or the grid factor is lost').toBeDefined();
    // 3. + 4. the two citation routers
    expect(gridSource(gr)).toBe(gridSource(el));
    expect(gridSource(gr)).toBe(EF_SOURCES.electricity_eu);
    expect(combustionSource(gr)).toBe(combustionSource(el));
    expect(combustionSource(gr)).toBe(EF_SOURCES.combustion_eu);
    // 5. + 6. the unit option lists: metric, not American
    expect(ngUnitOptions('GR')).toEqual(ngUnitOptions('EL'));
    expect(ngUnitOptions('GR').map(([v]) => v)).toEqual(['kwh']);   // FI3: EU gas is billed in kWh (R6, R7)
    expect(liquidUnitOptions('GR')).toEqual(liquidUnitOptions('EL'));
    expect(liquidUnitOptions('GR').map(([v]) => v)).toEqual(['litres']);
    // 7. and the grid region resolves, so the electricity rows are not dropped
    expect(isResolvedGridRegion(gridRegionForCountry('GR'))).toBe(true);
  });

  it('UK and GB are likewise indistinguishable', () => {
    expect(efJurisdiction({ country: 'UK' })).toBe(efJurisdiction({ country: 'GB' }));
    expect(gridRegionForCountry('UK')).toBe(gridRegionForCountry('GB'));
    expect(gridRegionForCountry('UK')).toBe('UK');
    expect(gridSource(loc({ country: 'UK' }))).toBe(gridSource(loc({ country: 'GB' }))); 
    expect(combustionSource(loc({ country: 'UK' }))).toBe(combustionSource(loc({ country: 'GB' })));
    expect(ngUnitOptions('UK')).toEqual(ngUnitOptions('GB'));
  });
});

// ── T16. THE ROUTER'S THREE REFUSALS ─────────────────────────────────────────────────────────────
//
// A PROBE WITH NO CONSUMER IN THIS COMMIT. efJurisdiction still answers 'US' for an unsupported
// country, exactly as it always has, so nothing this describes changes a figure yet. The states and
// their tests land before the behaviour, on the same footing as reconcile().
describe('T16 country refusals', () => {
  it('every supported country routes, and US routes only from US', () => {
    const supported: [string, string][] = [
      ['US', 'US'], ['CA', 'CA'], ['GB', 'UK'], ['UK', 'UK'], ['AU', 'AU'], ['NZ', 'NZ'],
      ['EL', 'EU'], ['GR', 'EU'], ['DE', 'EU'], ['FR', 'EU'],
    ];
    for (const [country, jurisdiction] of supported) {
      const r = efRouting({ country });
      expect(r.supported, country).toBe(true);
      expect(r.supported && r.jurisdiction, country).toBe(jurisdiction);
      expect(countryRefusal({ country }), country).toBeNull();
    }
    // Every EU member, not just the two spot checks, and each with a real grid key.
    for (const c of EU_COUNTRIES) {
      const r = efRouting({ country: c });
      expect(r.supported && r.jurisdiction, c).toBe('EU');
      expect(GRID_EF[gridRegionForCountry(c)], c).toBeDefined();
    }
  });

  it('the three refusals are distinct and carry what their sentences need', () => {
    // Never answered.
    expect(countryRefusal({ country: '' })).toEqual({ state: 'country_not_set' });
    expect(countryRefusal({})).toEqual({ state: 'country_not_set' });
    // Answered with something that names no country. The value is carried VERBATIM so a surface
    // can quote what was stored rather than paraphrasing it.
    expect(countryRefusal({ country: 'OTHER' })).toEqual({ state: 'country_not_listed', value: 'OTHER' });
    expect(countryRefusal({ country: 'ZZ' })).toEqual({ state: 'country_not_listed', value: 'ZZ' });
    // A real country the platform can NAME but holds no factors for.
    expect(countryRefusal({ country: 'JP' })).toEqual({ state: 'country_not_supported', iso2: 'JP' });
    expect(countryRefusal({ country: 'PH' })).toEqual({ state: 'country_not_supported', iso2: 'PH' });
  });

  it('a code the country list cannot name is not_listed, not not_supported', () => {
    // ⚠️ THIS IS THE LINE THE COPY FORCES. country_not_supported reads "we do not hold emission
    // factors for this location's country (Philippines)", which cannot be written without a name.
    // The concordance holds 212 of the 249 assigned alpha-2 codes, so Jersey, Guernsey, the Isle of
    // Man, Gibraltar and Guam have no name here. Quoting the stored value is the honest answer for
    // them; claiming we know which country it is would not be.
    for (const c of ['JE', 'GG', 'IM', 'GI', 'GU']) {
      expect(countryRefusal({ country: c }), c).toEqual({ state: 'country_not_listed', value: c });
    }
  });

  it('a refused country resolves to NO jurisdiction, and US comes only from US', () => {
    // ⚠️ THIS TEST IS THE INVERSE OF WHAT IT SAID ON 21 SEP 2026 AT TASK 1, WHEN IT ASSERTED THE US
    // FALLBACK WAS STILL IN PLACE. That was true and deliberate for one commit: the router and the
    // three refusal states landed with nothing reading them, so it had to be provable that no
    // figure had moved. This is the commit that moves them.
    expect(efJurisdiction({ country: 'JP' })).toBeNull();
    expect(efJurisdiction({ country: '' })).toBeNull();
    expect(efJurisdiction({ country: 'OTHER' })).toBeNull();
    expect(efJurisdiction({ country: 'US' })).toBe('US');
  });

  it('a location is refused for its COUNTRY even when it has no fuel at all', () => {
    // ⚠️ THE ORDER INSIDE unpriceableReason IS WHAT THIS PINS. calcLocation only asks for a factor
    // when a stream HAS a figure, so a site with electricity alone, or with nothing entered, never
    // reaches pickEF. Checking the country as a consequence of pricing a stream would let exactly
    // those locations through, priced or not, and they are the commonest shape of a new location.
    const elecOnly = loc({ country: 'JP', electricity_kwh: 50_000, grid_region: 'US_FL' });
    const empty = loc({ country: 'JP' });
    for (const l of [elecOnly, empty]) {
      const found = findUnpriceableLocations([l], 'AR6', 2025);
      expect(found.length, l.id).toBe(1);
      expect(found[0].kind).toBe('country');
      expect(found[0].kind === 'country' && found[0].refusal).toEqual({ state: 'country_not_supported', iso2: 'JP' });
    }
    // And it contributes nothing, rather than contributing its electricity.
    expect(calcInventory([elecOnly], 'AR6', 2025).s2_location).toBe(0);
  });

  it('the country answer wins when a location has both problems', () => {
    // A site in Japan holding gas in m3 fails on both counts. "Check the unit on the bill" is the
    // wrong instruction for it: fixing the unit would not make the figure priceable.
    const both = loc({ country: 'JP', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'm3' });
    const found = findUnpriceableLocations([both], 'AR6', 2025);
    expect(found[0].kind).toBe('country');
  });

  it('the monthly write survives a refused location, and leaves it out of the rows', () => {
    // ⚠️ THIS IS THE SAVE PATH, AND A THROW HERE WOULD BE A SILENT SAVE FAILURE. handleSave calls
    // buildMonthlyEmissions after the annual row is already committed, inside a try whose comment
    // says a monthly failure must not escape. Two locations, one refused and one priced, is the
    // shape that matters: the priced one must still produce its rows.
    const priced = loc({
      id: 'ok', name: 'Priced Site', country: 'US', grid_region: 'US_FL',
      has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'mcf',
      source_docs: [doc('utility_bill_gas', [prop({
        fuelType: 'natural_gas', value: 1200, unit: 'mcf', periodStart: '2025-01-01', periodEnd: '2025-12-31',
      })])],
    });
    // The refused one carries BOTH a fuel bill and an electricity bill, and a RESOLVED grid region.
    // The electricity branch is the one that would otherwise slip through: it asks only whether the
    // region resolves, never whose country it is.
    const refused = loc({
      id: 'jp', name: 'Refused Site', country: 'JP', grid_region: 'US_FL',
      electricity_kwh: 50_000,
      has_natural_gas: true, natural_gas_amount: 500, natural_gas_unit: 'mcf',
      source_docs: [doc('utility_bill_gas', [prop({
        fuelType: 'natural_gas', value: 500, unit: 'mcf', periodStart: '2025-01-01', periodEnd: '2025-12-31',
      })]), doc('utility_bill_electric', [prop({
        fuelType: 'electricity', value: 50_000, unit: 'kwh', periodStart: '2025-01-01', periodEnd: '2025-12-31',
      })])],
    });

    // The same four deps handleSave passes at app/dashboard/ghg/page.tsx:1391.
    const monthlyDeps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion };
    let out!: ReturnType<typeof buildMonthlyEmissions>;
    expect(() => { out = buildMonthlyEmissions({ locations: [priced, refused], reporting_year: 2025 }, monthlyDeps, 'AR6'); }).not.toThrow();

    expect(out.slices.length, 'the priced location still produces its rows').toBeGreaterThan(0);
    expect(out.slices.every(s => s.location_name === 'Priced Site'),
      'no slice carries the refused location, electricity included').toBe(true);
    expect(out.slices.some(s => s.scope === 2), 'and the priced site keeps nothing it should not').toBe(false);
    expect(out.skipped.some(k => k.reason.includes('country_not_supported')),
      'the refusal is REPORTED, not silently dropped').toBe(true);
  });

  it('no citation names a publisher for a refused location', () => {
    // ⚠️ THE LAST PLACE A US EPA CLAIM COULD HAVE SURVIVED. combustionSource and gridSource each end
    // with the US citation for any country they do not recognise, and the assurance PDF's
    // methodology page plus the export's source list are both built from these two lists. A
    // Japanese site would have named US EPA as the publisher of figures nothing priced.
    const refused = loc({ id: 'jp', country: 'JP', grid_region: 'US_FL' });
    expect(combustionSourcesFor([refused])).toEqual([]);
    expect(gridSourcesFor([refused])).toEqual([]);
    // Beside a real one, only the real one is cited.
    const gb = loc({ id: 'gb', country: 'GB', grid_region: 'UK' });
    expect(combustionSourcesFor([gb, refused])).toEqual([EF_SOURCES.combustion_uk]);
    expect(gridSourcesFor([gb, refused])).toEqual([EF_SOURCES.electricity_uk]);
  });

  it('a refused location is offered metric units first, and never defaults to a US one', () => {
    // A site that is not in the United States must not be handed a US billing unit as its default.
    for (const country of ['OTHER', 'JP', '', 'ZZ']) {
      expect(liquidUnitOptions(country)[0][0], country).toBe('litres');
      expect(propaneUnitOptions(country)[0][0], country).toBe('litres');
      expect(ngUnitOptions(country)[0][0], country).toBe('m3');
      expect(steamUnitOptions(country).map(([v]) => v), country).toEqual(['gj']);
      // A NEW location, holding nothing, takes opts[0].
      const fresh = snapUnitsForCountry(country, {});
      expect(fresh.diesel_stationary_unit, country).toBe('litres');
      expect(fresh.natural_gas_unit, country).toBe('m3');
      expect(fresh.propane_unit, country).toBe('litres');
    }
    // The United States itself is untouched.
    expect(liquidUnitOptions('US')[0][0]).toBe('gallons');
    expect(ngUnitOptions('US')[0][0]).toBe('mcf');
  });

  it('a refused location KEEPS a US unit it already holds, with the number untouched', () => {
    // ⚠️ THIS IS THE WHOLE REASON THE US UNITS STAY IN THE LIST. snapUnitsForCountry keeps a held
    // unit only while the list still offers it, and otherwise takes opts[0] WITHOUT CONVERTING. A
    // metric-only list here would turn 1,000 gallons into 1,000 litres, a 3.79-fold error, silently.
    const held = { diesel_stationary_unit: 'gallons', natural_gas_unit: 'mcf', propane_unit: 'gallons' };
    for (const country of ['OTHER', 'JP', '', 'ZZ']) {
      const after = snapUnitsForCountry(country, held as never);
      expect(after.diesel_stationary_unit, country).toBe('gallons');
      expect(after.natural_gas_unit, country).toBe('mcf');
      expect(after.propane_unit, country).toBe('gallons');
    }
    // And the figure beside it is not touched by the snap at all: it returns units, nothing else.
    const l = loc({ country: 'US', has_diesel_stationary: true, diesel_stationary_amount: 1000, diesel_stationary_unit: 'gallons' });
    const moved = { ...l, country: 'OTHER', ...snapUnitsForCountry('OTHER', l as never) };
    expect(moved.diesel_stationary_amount, 'the number is unchanged').toBe(1000);
    expect(moved.diesel_stationary_unit, 'and so is its unit').toBe('gallons');
  });

  it('1,000 litres entered under Not listed survives the switch to France', () => {
    // The walkthrough's exact case: FR offers litres only, the held unit is litres, so it is kept.
    const b = loc({ country: 'OTHER', has_diesel_stationary: true, diesel_stationary_amount: 1000, diesel_stationary_unit: 'litres' });
    const after = { ...b, country: 'FR', ...snapUnitsForCountry('FR', b as never) };
    expect(after.diesel_stationary_unit).toBe('litres');
    expect(after.diesel_stationary_amount).toBe(1000);
  });

  it('a refusal blocks the export if and only if its sentence offers a remedy', () => {
    // ⚠️ THE ONE INVARIANT TASK 2a RESTS ON. A gate that blocks with no remedy is a report the
    // customer can never produce: nothing in the wizard turns "Not listed" or an unsupported
    // country into a supported one. A remedy offered where nothing is blocked nags about nothing.
    // Both answers come from refusalIsFixable, so they cannot drift.
    const where = 'Choose the country in "List your locations" on the Company setup step.';
    const cases: CountryRefusal[] = [
      { state: 'country_not_set' },
      { state: 'country_not_listed', value: 'OTHER' },
      { state: 'country_not_listed', value: 'Japn' },
      { state: 'country_not_supported', iso2: 'JP' },
    ];
    for (const r of cases) {
      const fixable = refusalIsFixable(r);
      const offersRemedy = countryRefusalText(r, 'review', false).includes(where);
      expect(offersRemedy, `${r.state}: gate and sentence must agree`).toBe(fixable);
    }
    // And the split itself, spelled out so a change to the predicate has to change this line too.
    expect(refusalIsFixable({ state: 'country_not_set' })).toBe(true);
    expect(refusalIsFixable({ state: 'country_not_listed', value: 'Japn' })).toBe(true);
    expect(refusalIsFixable({ state: 'country_not_listed', value: 'OTHER' })).toBe(false);
    expect(refusalIsFixable({ state: 'country_not_listed', value: ' other ' }), 'case and space').toBe(false);
    expect(refusalIsFixable({ state: 'country_not_supported', iso2: 'JP' })).toBe(false);
  });

  it('a non-blocking refusal is still excluded from every total and still stated', () => {
    // Not blocking is not the same as not counting. The location contributes nothing, carries its
    // own workings row, and that row is what every export surface renders.
    const ok = loc({ id: 'ok', name: 'Priced', country: 'GB', grid_region: 'UK', electricity_kwh: 5000 });
    const out = loc({ id: 'out', name: 'Elsewhere', country: 'JP', electricity_kwh: 9000 });
    const totals = calcInventory([ok, out], 'AR6', 2025);
    const alone = calcInventory([ok], 'AR6', 2025);
    expect(totals.s2_location, 'the refused location adds nothing').toBe(alone.s2_location);
    const rows = buildWorkings([ok, out], 'AR6', 2025);
    expect(rows.filter(r => r.declaration === 'country_not_supported').length).toBe(1);
    expect(rows.some(r => r.location === 'Elsewhere' && r.result_tco2e !== null),
      'and contributes no priced row').toBe(false);
  });

  it('the workings row carries the state as its own declaration literal', () => {
    const rows = buildWorkings([loc({ country: 'JP', electricity_kwh: 1000, grid_region: 'US_FL' })], 'AR6', 2025);
    const excluded = rows.filter(r => r.declaration === 'country_not_supported');
    expect(excluded.length).toBe(1);
    expect(excluded[0].result_tco2e, 'an absence never renders as 0').toBeNull();
    expect(excluded[0].country_refusal).toEqual({ state: 'country_not_supported', iso2: 'JP' });
    // No priced row survives for that location.
    expect(rows.filter(r => r.location === 'Test Site' && r.result_tco2e !== null)).toEqual([]);
  });
});

// ── U. EU COMBUSTION: EVERY PROPERTY CITED ON ITS ROW, OR THE LINE IS UNPRICED (FI3) ─────────────────────────────
//
// Until FI3 the EU per-litre and per-m³ keys rested on densities and an energy content no source printed (0.844, 0.745,
// 0.990, 0.510 kg/L and 36 MJ/m³), disclosed on the row as "DERIVED, not published". Record:
// docs/review/eu-fuel-properties.md; rulings R6 to R10. Each value now comes from a cited document, named on its row:
// MRR Annex VI Table 1 for the factor and NCV, IPCC 2006 Vol. 2 Ch. 2 Tables 2.2/2.3 for CH4 and N2O, the JEC
// Well-to-Tank report v5 for the three densities, IPCC Ch. 1 section 1.4.1.2 for gas's 0.90. Anything else is unpriced.
describe('U. EU combustion: every property cited on its row, or the line is unpriced (FI3)', () => {
  // MRR Annex VI Table 1 (t CO2/TJ, TJ/Gg), transcribed once and used as the expression for every assertion below.
  const ANNEX_VI = {
    motor_gasoline:  { co2_t_per_TJ: 69.3, ncv_TJ_per_Gg: 44.3 },
    gas_diesel_oil:  { co2_t_per_TJ: 74.1, ncv_TJ_per_Gg: 43.0 },
    residual_oil:    { co2_t_per_TJ: 77.4, ncv_TJ_per_Gg: 40.4 },
    natural_gas:     { co2_t_per_TJ: 56.1, ncv_TJ_per_Gg: 48.0 },
  };
  // JEC Well-to-Tank report v5, Annexes section 4.1, Liquids, page 9 (kg/m³ = g/L; /1000 for kg/L).
  const JEC = { gas_diesel_oil: 0.832, motor_gasoline: 0.743, residual_oil: 0.970 };
  // IPCC 2006 Vol. 2 Ch. 2 Tables 2.2/2.3, kg per TJ.
  const RATE = { liquid: { ch4: 3, n2o: 0.6 }, gas: { ch4: 1, n2o: 0.1 } };
  const perLitre = (f: { co2_t_per_TJ: number; ncv_TJ_per_Gg: number }, density: number) => f.co2_t_per_TJ * f.ncv_TJ_per_Gg * density / 1000;
  const round = (x: number, sf: number) => Number(x.toPrecision(sf));
  const EU = EF_EU as Record<string, { co2: number; ch4: number; n2o: number }>;
  const site = (o: Partial<Location>) => loc({ country: 'DE', grid_region: 'EU_DE', ...o });
  const rowsOf = (l: Location) => buildWorkings([l], 'AR6', 2025, [], 12);
  const fuelRow = (l: Location) => rowsOf(l).find(r => r.scope === 1 && r.stream && r.stream !== 'refrigerants' && !r.declaration);

  it('U1 every EU litre key IS MRR factor x MRR NCV x JEC density: CO2 at 6 s.f., CH4 and N2O at 4, one density for all three', () => {
    const cases: [string, keyof typeof JEC][] = [['diesel_litre', 'gas_diesel_oil'], ['diesel_mobile_litre', 'gas_diesel_oil'],
      ['gasoline_litre', 'motor_gasoline'], ['fuel_oil_residual_litre', 'residual_oil']];
    for (const [key, fuel] of cases) {
      const f = ANNEX_VI[fuel], d = JEC[fuel]
      expect(EU[key].co2, key).toBe(round(perLitre(f, d), 6))
      expect(EU[key].ch4, key).toBe(round(RATE.liquid.ch4 * f.ncv_TJ_per_Gg * 1e-6 * d, 4))
      expect(EU[key].n2o, key).toBe(round(RATE.liquid.n2o * f.ncv_TJ_per_Gg * 1e-6 * d, 4))
    }
    expect([EU.diesel_litre.co2, EU.gasoline_litre.co2, EU.fuel_oil_residual_litre.co2]).toEqual([2.651, 2.281, 3.03315])
  })

  it('U2 the mass keys are MRR mass basis, one table: factor per TJ x NCV per Gg', () => {
    for (const [key, fuel] of [['diesel_kg', 'gas_diesel_oil'], ['fuel_oil_distillate_kg', 'gas_diesel_oil'], ['fuel_oil_residual_kg', 'residual_oil']] as const) {
      const f = ANNEX_VI[fuel]
      expect(EU[key].co2, key).toBeCloseTo(f.co2_t_per_TJ * f.ncv_TJ_per_Gg / 1000, 12)
      expect(EU[key].ch4, key).toBeCloseTo(RATE.liquid.ch4 * f.ncv_TJ_per_Gg / 1e6, 15)
      expect(EU[key].n2o, key).toBeCloseTo(RATE.liquid.n2o * f.ncv_TJ_per_Gg / 1e6, 15)
    }
    expect(EU.gasoline_kg, 'petrol gets no mass unit, so no mass key').toBeUndefined()
  })

  it('U3 source test: no EF_EU value or EU note depends on 36, 0.844, 0.745, 0.510 or 0.990; no alias maps distillate to diesel', () => {
    const src = readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8')
    const table = src.slice(src.indexOf('const EF_EU = {'), src.indexOf('// ── THE DERIVATION, ON THE ROW'))
    const notes = src.slice(src.indexOf('const EU_DERIVATION: Partial'), src.indexOf('function euDerivationNote('))
    expect(table.length).toBeGreaterThan(500)
    expect(notes.length).toBeGreaterThan(500)
    for (const v of ['0.844', '0.745', '0.510', '0.990', '36 MJ', '2.0196', '1.52216', '2.68924', '2.28714', '3.09569']) {
      expect(table, `EF_EU: ${v}`).not.toContain(v)
      expect(notes, `EU_DERIVATION: ${v}`).not.toContain(v)
    }
    for (const v of Object.values(EF_EU as Record<string, { co2: number }>)) for (const x of [36, 0.844, 0.745, 0.51, 0.99]) {
      expect(v.co2).not.toBeCloseTo(x, 6)
    }
    expect(notes).not.toMatch(/fuel_oil_distillate[_a-z]*: 'diesel/)
    expect(notes).not.toMatch(/DERIVED/)
    expect(notes).not.toContain('\u2014')
    for (const k of ['natural_gas_m3', 'propane_litre', 'fuel_oil_distillate_litre']) expect(EU[k], k).toBeUndefined()
  })

  it('U4 EU diesel: 1,000 L = 2,651.00 kg CO2 plus CH4 and N2O, and the note names MRR and JEC', () => {
    const r = fuelRow(site({ has_diesel_stationary: true, diesel_stationary_amount: 1000, diesel_stationary_unit: 'litres' }))
    expect(r.result_tco2e).toBeCloseTo((2651.00 + 1000 * 0.0001073 * 29.8 + 1000 * 0.00002147 * 273) / 1000, 9)
    expect(calcGas(EU.diesel_litre, 1000, 'AR6').co2).toBeCloseTo(2.651, 12)
    expect(r.note).toBe('74.1 t CO₂/TJ × 43.0 TJ/Gg (EU MRR 2018/2066, Annex VI Table 1, Gas/Diesel oil) × 832 kg/m³ (JEC Well-to-Tank report v5, Annexes section 4.1, Diesel) = 2.65100 kg CO₂/L. CH4 and N2O: IPCC 2006 Vol. 2 Ch. 2, Tables 2.2 and 2.3, per TJ, on the same NCV and density.')
    expect(r.ef_source).toBe('EU MRR Reg. (EU) 2018/2066 Annex VI Table 1; IPCC 2006 Vol. 2 Ch. 1 and 2; densities from the JEC Well-to-Tank report v5 (EU JRC)')
    expect(r.ef_source).not.toContain('\u2014')
  })

  it('U5 EU heating oil in litres, EU LPG in litres and EU gas in m3 are unpriced with the exact message', () => {
    const msg = (l: Location) => unpricedLines(l).map(u => [u.reason, u.message])
    expect(msg(site({ has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000, fuel_oil_distillate_unit: 'litres' }))).toEqual([['factor_missing',
      'The EU factor for heating oil at Test Site is published per unit of energy, and we hold no cited density to convert litres to it, so this line is not counted. Enter the quantity in kilograms or tonnes, or reject the bill. Export is blocked until this is resolved.']])
    expect(msg(site({ has_propane: true, propane_amount: 500, propane_unit: 'litres' }))).toEqual([['factor_missing',
      'The EU factor for propane at Test Site is published per unit of energy, and we hold no cited density to convert litres to it, so this line is not counted. Reject the bill, or remove the figure. Export is blocked until this is resolved.']])
    expect(msg(site({ has_natural_gas: true, natural_gas_amount: 800, natural_gas_unit: 'm3' }))).toEqual([['factor_missing',
      'The EU factor for natural gas at Test Site is published per unit of energy, and we hold no cited energy content to convert m³ to it, so this line is not counted. Enter the quantity in kWh, as shown on your gas bill, or reject the bill. Export is blocked until this is resolved.']])
    // Gallons and Mcf are the same quantities, and the same answer.
    expect(msg(site({ has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 100, fuel_oil_distillate_unit: 'gallons' }))[0][1]).toContain('convert US gallons to it')
    expect(msg(site({ has_natural_gas: true, natural_gas_amount: 10, natural_gas_unit: 'mcf' }))[0][1]).toContain('convert Mcf to it')
    // They block export, as every FI1 line does.
    const gate = findUnresolvedCoverage([site({ has_natural_gas: true, natural_gas_amount: 800, natural_gas_unit: 'm3' })], 2025, 12, [])
    expect(gate.map(i => i.status)).toContain('factor_missing')
    for (const [, m] of [...msg(site({ has_propane: true, propane_amount: 5, propane_unit: 'litres' }))]) expect(m).not.toContain('\u2014')
  })

  it('U6 EU heating oil by mass: 1 t = 3,186.3 kg CO2, kg and tonnes exact, named to MRR', () => {
    const t = fuelRow(site({ has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1, fuel_oil_distillate_unit: 'tonnes' }))
    expect(t.factor_key).toBe('fuel_oil_distillate_kg')
    expect(calcGas(EU.fuel_oil_distillate_kg, 1000, 'AR6').co2).toBeCloseTo(3186.3 / 1000, 12)
    expect(t.result_tco2e).toBeCloseTo((3186.3 + 1000 * 0.000129 * 29.8 + 1000 * 0.0000258 * 273) / 1000, 9)
    expect(t.note).toContain('1 tonne converted to 1,000 kg (1 tonne = 1000 kg, exact).')
    expect(t.note).toContain('Published on a mass basis: 74.1 t CO₂/TJ × 43.0 TJ/Gg (EU MRR 2018/2066, Annex VI Table 1, Gas/Diesel oil, which includes light heating oil: IPCC 2006 Vol. 2 Ch. 1 Table 1.1)')
    const kg = fuelRow(site({ has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000, fuel_oil_distillate_unit: 'kg' }))
    expect(kg.result_tco2e).toBeCloseTo(t.result_tco2e, 12)
    const hfo = fuelRow(site({ has_fuel_oil_residual: true, fuel_oil_residual_amount: 2, fuel_oil_residual_unit: 'tonnes' }))
    expect(calcGas(EU.fuel_oil_residual_kg, 2000, 'AR6').co2).toBeCloseTo(2 * 3126.96 / 1000, 12)
    expect(hfo.note).toContain('77.4 t CO₂/TJ × 40.4 TJ/Gg (EU MRR 2018/2066, Annex VI Table 1, Residual fuel oil) = 3.12696 kg CO₂/kg')
  })

  it('U7 EU gas: 10,000 kWh = 1,817.64 kg CO2, the note names IPCC and the 0.90; GJ and MJ convert exactly', () => {
    const r = fuelRow(site({ has_natural_gas: true, natural_gas_amount: 10_000, natural_gas_unit: 'kwh' }))
    expect(calcGas(EU.natural_gas_kwh, 10_000, 'AR6').co2).toBeCloseTo(1.81764, 12)
    expect(EU.natural_gas_kwh.co2).toBeCloseTo(56100 * 0.90 * 3.6e-6, 15)
    expect(r.note).toContain('× 0.90 net per gross (IPCC 2006 Vol. 2 Ch. 1 section 1.4.1.2, and the notes under Ch. 2 Tables 2.6 to 2.8)')
    expect(r.note).toContain('EU MRR 2018/2066, Annex VI Table 1, Natural gas')
    const gj = fuelRow(site({ has_natural_gas: true, natural_gas_amount: 36, natural_gas_unit: 'mmbtu' as never }))
    expect(gj.factor_key).toBe('natural_gas_kwh')
    expect(pickEF(site({}), 'natural_gas_gj').factor.co2).toBeCloseTo(0.181764 * KWH_PER_GJ, 12)
    expect(pickEF(site({}), 'natural_gas_mj').factor.co2).toBeCloseTo(0.181764 / 3.6, 12)
  })

  it('U8 only EU rows carry the EU notes; US/CA/UK/AU/NZ cite their own', () => {
    for (const country of ['US', 'CA', 'GB', 'AU', 'NZ']) {
      const r = fuelRow(loc({ country, has_diesel_stationary: true, diesel_stationary_amount: 400, diesel_stationary_unit: country === 'US' ? 'gallons' : 'litres' }))
      expect(r?.note ?? '', country).not.toMatch(/JEC Well-to-Tank|EU MRR/)
    }
  })

  it('U9 gallons convert exactly to the EU litre key; Mcf and m3 have no EU key', () => {
    const de = site({})
    expect(pickEF(de, 'diesel_gallon').factor.co2).toBeCloseTo(EU.diesel_litre.co2 * 3.785411784, 12)
    for (const k of ['natural_gas_mcf', 'natural_gas_m3', 'natural_gas_ccf', 'fuel_oil_distillate_litre', 'propane_litre']) {
      expect((pickEF(de, k as never).factor as unknown as { __missing?: unknown }).__missing, k).toBeDefined()
    }
  })

  it('U10 the units offered: EU gas kWh; EU heating and heavy fuel oil litres, kg, tonnes; UK gas kWh and m3; Canada gas m3, Mcf and GJ', () => {
    expect(ngUnitOptions('DE')).toEqual([['kwh', 'kWh']])
    expect(fuelOilUnitOptions('FR')).toEqual([['litres', 'Litres'], ['kg', 'kg'], ['tonnes', 'Tonnes']])
    expect(liquidUnitOptions('FR')).toEqual([['litres', 'Litres']])
    expect(fuelOilUnitOptions('GB')).toEqual(liquidUnitOptions('GB'))
    expect(ngUnitOptions('GB')).toEqual([['kwh', 'kWh'], ['m3', 'm³']])
    expect(ngUnitOptions('CA')).toEqual([['m3', 'm³'], ['mcf', 'Mcf'], ['gj', 'GJ']])
    for (const f of UNIT_FIELDS.filter(x => x.field.startsWith('fuel_oil_'))) expect(f.options).toBe(fuelOilUnitOptions)
  })

  it('U12 the selector shows a stored EU m3 figure as m3 (not accepted here), and choosing kWh clears it with FI5\'s message', () => {
    const typed = site({ name: 'Lyon depot', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' })
    const options = unitOptionsShowing(ngUnitOptions(typed.country), typed.natural_gas_unit, documentsBacking(typed, 'natural_gas_amount') > 0)
    expect(options).toEqual([['kwh', 'kWh'], ['m3', 'm³ (not accepted here)']])
    expect(options.find(([v]) => v === typed.natural_gas_unit), 'the selected option is the stored unit').toEqual(['m3', 'm³ (not accepted here)'])
    // The page renders exactly this list for gas, selects the stored unit, and sends a choice through changeFieldUnit.
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain("{unitOptionsShowing(ngUnitOptions(loc.country), loc.natural_gas_unit, documentsBacking(loc, 'natural_gas_amount') > 0 && !activeOverride(loc, 'natural_gas_amount')).map(([val, label]) => (")
    expect(page).toContain("onClick={() => changeFieldUnit(activeLocation, 'natural_gas_unit', val)} style={unitBtn(loc.natural_gas_unit === val)}")
    // Choosing kWh: m3 to kWh has no exact conversion, so the figure is cleared and asked for, never relabelled.
    const o = changeUnit('natural_gas_amount', 1000, 'm3', 'kwh')
    expect(o).toEqual({ unit: 'kwh', cleared: true, from: 'm3' })
    const after = applyUnitOutcomes(typed, { natural_gas_unit: o }, '2026-10-07T12:00:00.000Z', null)
    expect([after.natural_gas_unit, after.natural_gas_amount]).toEqual(['kwh', 0])
    const msg = 'The natural gas figure was in m³, which cannot be converted exactly to kWh, so it has been cleared. Enter it in kWh.'
    expect(unitChangeMessage(after.unit_changes!.at(-1)!)).toBe(msg)
    expect(unpricedLines(after).map(u => [u.reason, u.message])).toEqual([['figure_cleared', msg]])
    // A document-backed unit keeps its plain label (T10d), and an offered unit is not repeated.
    expect(unitOptionsShowing(ngUnitOptions('DE'), 'm3', true)).toEqual([['kwh', 'kWh'], ['m3', 'm³']])
    expect(unitOptionsShowing(ngUnitOptions('DE'), 'kwh', false)).toEqual([['kwh', 'kWh']])
  })

  it('U11 a stored EU m3 figure is never relabelled kWh: not on load, and a country change clears it with the record', () => {
    const stored = site({ has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' })
    const derived = deriveLocations({ locations: [stored], reporting_year: 2025 })[0]
    expect([derived.natural_gas_unit, derived.natural_gas_amount]).toEqual(['m3', 1000])
    const moved = applyUnitOutcomes({ ...stored, country: 'FR' }, unitsForCountryChange('FR', stored as never), '2026-10-07T12:00:00.000Z', null)
    expect([moved.natural_gas_unit, moved.natural_gas_amount]).toEqual(['kwh', 0])
    expect(moved.unit_changes?.at(-1)).toMatchObject({ field: 'natural_gas_amount', from: 'm3', to: 'kwh', cleared: true, valueBefore: 1000 })
    expect(changeUnit('natural_gas_amount', 1000, 'm3', 'kwh')).toEqual({ unit: 'kwh', cleared: true, from: 'm3' })
  })
});

// ── FI3: UK gas in m³ (R11) and Canadian gas in GJ (R12) ────────────────────────────────────────────────────────
describe('FI3. UK gas in m3 and Canadian gas in GJ', () => {
  const rowOf = (l: Location) => buildWorkings([l], 'AR6', 2025, [], 12).find(r => r.stream === 'natural_gas' && !r.declaration)

  it('FI3-1 UK gas in m3 is offered and prices at DEFRA 2.02633', () => {
    expect(ngUnitOptions('GB').map(([v]) => v)).toContain('m3')
    const r = rowOf(loc({ country: 'GB', grid_region: 'UK', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' }))
    expect(r.factor_key).toBe('natural_gas_m3')
    expect(r.result_tco2e).toBeCloseTo(2.02633, 12)
  })

  it('FI3-2 Canada: Ontario 100 GJ = 4,978.0 kg CO2, computed from the province factor and the national heat content', () => {
    const on = loc({ country: 'CA', province: 'ON', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'gj' })
    const f = pickEF(on, 'natural_gas_gj')
    expect(f.key).toBe('natural_gas_gj')
    expect(f.factor.co2).toBeCloseTo(1.921 / 0.03859, 12)
    expect(Number((calcGas(f.factor, 100, 'AR6').co2 * 1000).toPrecision(5))).toBe(4978.0)
    expect(f.factor.ch4).toBeCloseTo(0.000037 / 0.03859, 15)
    const r = rowOf(on)
    expect(r.note).toBe("Converted to m³ at 38.59 MJ/m³, Canada's national gross heat content for natural gas (ECCC National Inventory Report 1990-2023, Part 2, Table A4-2). ECCC does not publish a provincial value.")
    // Not a stored literal: another province's factor flows through.
    const bc = pickEF({ ...on, province: 'BC', grid_region: 'BC' }, 'natural_gas_gj')
    expect(bc.factor.co2).toBeCloseTo(1.966 / 0.03859, 12)
    expect((EF_CA as Record<string, unknown>).natural_gas_gj).toBeUndefined()
  })

  it('FI3-3 Canada with no province is unpriced as today; a stored MMBtu figure converts exactly to GJ', () => {
    const none = loc({ country: 'CA', province: '', grid_region: '', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'gj' })
    expect(unpricedLines(none).map(u => u.reason)).toEqual(['province_missing'])
    const mmbtu = loc({ country: 'CA', province: 'ON', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 10, natural_gas_unit: 'mmbtu' })
    const r = rowOf(mmbtu)
    expect(r.factor_key).toBe('natural_gas_gj')
    expect(r.note).toContain('10 MMBtu converted to 10.55 GJ (1 MMBtu = 1.05505585262 GJ, exact).')
    expect(r.result_tco2e).toBeCloseTo(calcGas(pickEF(mmbtu, 'natural_gas_gj').factor, 10 * 1.05505585262, 'AR6').total, 12)
    expect(ngUnitOptions('CA').map(([v]) => v)).not.toContain('mmbtu')
  })
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
  const shownFactor = (r: any) => Number(String(r.emission_factor_display).match(/^[\d.]+/)![0]);
  const rowFor = (l: Location, stream: string) =>
    (buildWorkings([l], 'AR6', 2025, [], 12) as any[]).find(r => r.stream === stream && !r.declaration);

  // Every (jurisdiction, unit) combination the blast-radius sweep turned up, plus the two that were
  // already correct, so a regression in either direction fails.
  // FI3: EU heating oil prices by mass only (R8), so the EU case enters kg.
  const FUEL_OIL: [string, 'gallons' | 'litres' | 'kg'][] = [
    ['US', 'gallons'], ['US', 'litres'], ['CA', 'litres'], ['GB', 'litres'],
    ['DE', 'kg'], ['AU', 'litres'], ['NZ', 'litres'],
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
    // FI3: EU heavy fuel oil, the EU fuel-oil grade that keeps a litre key (R8 removed heating oil's).
    const eu = rowFor(loc({ country: 'DE', has_fuel_oil_residual: true, fuel_oil_residual_amount: 1000,
      fuel_oil_residual_unit: 'litres' }), 'fuel_oil_residual');
    expect(eu.emission_factor_display, 'per litre, matching the activity beside it').toContain('/L');
    // ⚠️ WAS the gallon factor divided by G — a rescale of a rescale. It is now the STORED litre value,
    // with no rescale applied at all, which is what the per-litre seeding bought.
    expect(shownFactor(eu)).toBeCloseTo(3.04307271, 8);
    // A US site that entered gallons is untouched — its factor IS published per gallon.
    const us = rowFor(loc({ country: 'US', has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000,
      fuel_oil_distillate_unit: 'gallons' }), 'fuel_oil_distillate');
    expect(us.emission_factor_display).toContain('/gal');
    expect(shownFactor(us)).toBeCloseTo(10.244058, 7);
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

  it('V5 the EU fuel figures are MRR x JEC, and a heating-oil litre is not counted (FI3)', () => {
    // Was "NO PRICED FIGURE MOVED" across the per-litre re-basing. FI3 moves the EU figures on purpose: the densities are
    // JEC's (R9) and heating oil in litres is unpriced (R8), so it adds nothing to the total.
    const c = calcLocation(loc({ country: 'FR',
      has_diesel_stationary: true, diesel_stationary_amount: 1000, diesel_stationary_unit: 'litres',
      has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000, fuel_oil_distillate_unit: 'litres' }), 'AR6', 2025);
    expect(c.s1_total).toBeCloseTo(2.66005885, 9);
    const diesel = rowFor(loc({ country: 'FR', has_diesel_stationary: true, diesel_stationary_amount: 1000,
      diesel_stationary_unit: 'litres' }), 'diesel_stationary');
    expect(diesel.result_tco2e).toBeCloseTo(2.66005885, 9);
    const heating = (buildWorkings([loc({ country: 'FR', has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000,
      fuel_oil_distillate_unit: 'litres' })], 'AR6', 2025, [], 12) as any[]).find(r => r.stream === 'fuel_oil_distillate');
    expect(heating.declaration).toBe('unpriced');
    expect(heating.result_tco2e).toBeNull();
  });

  it('V6 the EU citation is one line, and still satisfies F16 and F17', () => {
    // F16 needs every token of COMBUSTION_EDITION.EU ('IPCC 2006'); F17 needs a (YYYY). Asserted here
    // too so a shortening pass fails in the file it is being shortened in.
    // FI3: the citation names MRR, IPCC 2006 and JEC; it no longer carries a parenthesised year (F17 updated with it).
    const c = EF_SOURCES.combustion_eu;
    expect(c).toContain('IPCC');
    expect(c).toContain('2006');
    expect(c).toContain('JEC Well-to-Tank report v5');
    expect(c).not.toContain('\u2014');
    expect(c).toContain('2018/2066');
    expect(c.length, 'one line — the derivation belongs in the note').toBeLessThan(140);
    expect(c, 'the citation must not defer to the note for its own content').not.toContain('see row note');
  });

  it('V7 the EU note carries the density and the document it came from (FI3, R10)', () => {
    const r = rowFor(loc({ country: 'DE', has_diesel_stationary: true, diesel_stationary_amount: 1000,
      diesel_stationary_unit: 'litres' }), 'diesel_stationary');
    expect(r.note).toContain('832 kg/m³ (JEC Well-to-Tank report v5, Annexes section 4.1, Diesel)');
    expect(r.note).toContain('(EU MRR 2018/2066, Annex VI Table 1, Gas/Diesel oil)');
    // The arithmetic a verifier retypes.
    expect(r.note).toContain('74.1 t CO₂/TJ × 43.0 TJ/Gg');
    expect(r.note).toContain('= 2.65100 kg CO₂/L');
    expect(r.note).not.toMatch(/EN 590|neither cited source|DERIVED/);
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
  // FI3 (R8): EU heating oil has no litre key, so the EU distillate site enters kg unless a unit is given.
  const site = (country: string, grade: 'distillate' | 'residual', unit?: 'litres' | 'gallons' | 'kg') =>
    loc({ country, [`has_fuel_oil_${grade}`]: true, [`fuel_oil_${grade}_amount`]: 1000,
          [`fuel_oil_${grade}_unit`]: unit ?? (country === 'DE' && grade === 'distillate' ? 'kg' : 'litres') } as Partial<Location>);

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
    // EU (FI3): MRR CO2/TJ x MRR NCV x JEC density (HFO 970 kg/m³). Heating oil has no litre key (R8): MRR's mass basis.
    expect((EF_EU as any).fuel_oil_residual_litre.co2).toBe(Number((77400 * 40.4e-6 * 0.970).toPrecision(6)));
    expect((EF_EU as any).fuel_oil_distillate_litre).toBeUndefined();
    expect((EF_EU as any).fuel_oil_distillate_kg.co2).toBe(Number((74.1 * 43.0 / 1000).toPrecision(6)));
  });

  it('W2 an EU gallon figure prices from the litre key, converted exactly (FI2: no gallon keys)', () => {
    const lit = (EF_EU as any).fuel_oil_residual_litre;
    expect((EF_EU as any).fuel_oil_residual_gallon, 'EU residual gallon key').toBeUndefined();
    const p = pickEF(loc({ country: 'DE' }), 'fuel_oil_residual_gallon');
    for (const gas of ['co2', 'ch4', 'n2o'] as const) expect(p.factor[gas], `EU residual ${gas}`).toBeCloseTo(lit[gas] * G, 14);
    // FI3 (R8): heating oil has no litre key, so a gallon figure has nothing to convert to and is unpriced.
    expect((pickEF(loc({ country: 'DE' }), 'fuel_oil_distillate_gallon').factor as any).__missing).toBeDefined();
  });

  it('W3 a metric row shows the STORED litre factor, with no rescale applied', () => {
    // FI3: DE heating oil has no litre key (R8); its heavy fuel oil litre row is checked below instead.
    const cases: [string, number][] = [['CA', 2.753], ['GB', 2.75541], ['AU', 2.600929], ['NZ', 2.97088]];
    const de = row(site('DE', 'residual'), 'residual');
    expect([de.activity_unit, de.emission_factor.includes('3.03315')]).toEqual(['litres', true]);
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

  it('W5 EU diesel and EU heating oil share a row by mass, not by litre (FI3, R8)', () => {
    // Until FI3 the two were byte-identical per litre, through one density. They share MRR's Gas/Diesel oil NCV and
    // factor, but no source prints a heating-oil density, so heating oil in litres is unpriced and agrees with diesel
    // only by mass.
    const kgRow = (stream: 'diesel_stationary' | 'fuel_oil_distillate') => (buildWorkings([loc({ country: 'FR',
      ...(stream === 'diesel_stationary' ? {} : { has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000, fuel_oil_distillate_unit: 'kg' }) })],
      'AR6', 2025, [], 12) as any[]).find(r => r.stream === stream && !r.declaration);
    expect(pickEF(loc({ country: 'FR' }), 'fuel_oil_distillate_kg').factor).toEqual(pickEF(loc({ country: 'FR' }), 'diesel_kg').factor);
    expect(kgRow('fuel_oil_distillate').result_tco2e).toBeCloseTo(3.1971876, 9);
    const l = loc({ country: 'FR', has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000, fuel_oil_distillate_unit: 'litres' });
    expect(unpricedLines(l).map(u => u.field)).toEqual(['fuel_oil_distillate_amount']);
  });

  it('W6 the EU density disclosure SURVIVED the re-basing', () => {
    // ⚠️ IT DID NOT, at first. euDerivationNote is keyed on the factor key; the live key became
    // fuel_oil_*_litre and was in neither the map nor its alias table, so every EU fuel-oil row lost
    // its disclosure while the figures stayed correct — invisible to every other assertion.
    // FI3: every EU fuel-oil row names its documents (R10): MRR always, JEC where a density was used.
    for (const grade of ['distillate', 'residual'] as const) {
      const r = row(site('DE', grade), grade);
      expect(r.note, `${grade}`).toContain('EU MRR 2018/2066, Annex VI Table 1');
    }
    expect(row(site('DE', 'distillate'), 'distillate').note).toContain('Published on a mass basis');
    expect(row(site('DE', 'residual'), 'residual').note).toContain('970 kg/m³ (JEC Well-to-Tank report v5, Annexes section 4.1, HFO)');
  });

  it('W7 US is untouched — gallons direct, litres still converts', () => {
    // EPA's basis genuinely IS the gallon, so a US litres entry is a REAL convert-then-apply step and
    // keeps its note. No US per-litre fuel-oil factor was invented to avoid it.
    const usGal = row(site('US', 'distillate', 'gallons'), 'distillate');
    expect(usGal.activity_unit).toBe('gallons');
    expect(usGal.result_tco2e).toBeCloseTo(10.244058, 9);
    expect(usGal.note ?? '', 'no conversion for a gallons entry').not.toContain('US gallons');
    const usLit = row(site('US', 'distillate', 'litres'), 'distillate');
    expect(usLit.activity_data, 'still the entered figure').toBe(1000);
    expect(usLit.activity_unit).toBe('litres');
    expect(usLit.note, 'the conversion is real here and must be disclosed').toContain('US gallons');
    expect(usLit.result_tco2e).toBeCloseTo(1000 / G * 10.244058 / 1000, 9);
    expect((EF as any).fuel_oil_distillate_litre, 'no US per-litre factor was invented').toBeUndefined();
  });

  it('W8 totals, the per-fuel breakdown and the workings row all agree on the new basis', () => {
    // fuelOilPricing is one chooser with three consumers; if any had been left on the gallon path the
    // location total and its own workings row would disagree.
    for (const country of ['CA', 'GB', 'DE', 'AU', 'NZ', 'US']) {
      const unit = country === 'US' ? 'gallons' : undefined;   // the site default (EU heating oil in kg, FI3)
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

  // FI2 diff 3 (ruling R5): the per-gallon and per-Mcf keys are EPA's PRINTED columns, rounded by EPA (0.01 g for CH4 and
  // N2O per gallon). So the uniform rate is checked as EPA printed it: each key is its heat content x the one published
  // per-mmBtu rate, to within half the last printed digit. A key moved to another rate misses by far more than that.
  const HEAT_CONTENT: Record<string, number> = { propane_gallon: 0.091, diesel_gallon: 0.138, fuel_oil_gallon: 0.138,
    fuel_oil_distillate_gallon: 0.138, fuel_oil_residual_gallon: 0.15, gasoline_gallon: 0.125, diesel_mobile_gallon: 0.138 };
  const asPrinted = (stored_kg: number, derived_g: number, halfDigit_g: number) => Math.abs(stored_kg * 1000 - derived_g) <= halfDigit_g + 1e-12;

  it('AB1 EPA petroleum CH4/N2O are UNIFORM across the block — this is what makes "no choice" true', () => {
    // ⚠️ THE LOAD-BEARING ASSERTION FOR EF'S SECTOR COMMENT. "No end-use choice was made" is only true
    // while EPA publishes a single 3 / 0.6 for every petroleum product. Every petroleum key, as printed, is its own
    // heat content x that one rate; if EPA ever splits the block by sector, a key stops matching and this fails.
    for (const [key, hc] of Object.entries(HEAT_CONTENT)) {
      const k = (EF as any)[key];
      expect(asPrinted(k.ch4, hc * EPA_PETROLEUM.ch4_g_per_mmbtu, 0.005), `${key}: CH4 is ${hc} x 3 g, as printed`).toBe(true);
      expect(asPrinted(k.n2o, hc * EPA_PETROLEUM.n2o_g_per_mmbtu, 0.005), `${key}: N2O is ${hc} x 0.6 g, as printed`).toBe(true);
    }
    // Natural gas is the OTHER published pair, 1 / 0.1, exact per mmBtu. Per scf EPA prints 0.00103 g CH4 and
    // 0.0001 g N2O (1.026E-3 mmBtu/scf x 1 g and x 0.1 g, rounded), held here x 1,000 per Mcf.
    expect((EF as any).natural_gas_mmbtu.ch4 / (EF as any).natural_gas_mmbtu.n2o)
      .toBeCloseTo(EPA_NATGAS.ch4_g_per_mmbtu / EPA_NATGAS.n2o_g_per_mmbtu, 9);
    expect(asPrinted((EF as any).natural_gas_mcf.ch4, 1.026 * EPA_NATGAS.ch4_g_per_mmbtu, 0.005), 'gas CH4 per Mcf').toBe(true);
    expect(asPrinted((EF as any).natural_gas_mcf.n2o, 1.026 * EPA_NATGAS.n2o_g_per_mmbtu, 0.05), 'gas N2O per Mcf').toBe(true);
  });

  it('AB2 EF CH4/N2O ARE EPA\'s printed per-unit columns (FI2 diff 3)', () => {
    const EF_ = EF as any;
    expect((EF as any).natural_gas_mmbtu.ch4).toBeCloseTo(EPA_NATGAS.ch4_g_per_mmbtu / 1000, 9);
    expect((EF as any).natural_gas_mmbtu.n2o).toBeCloseTo(EPA_NATGAS.n2o_g_per_mmbtu / 1000, 9);
    // Table 1, per gallon: Propane 0.27 / 0.05 g, Distillate No. 2 0.41 / 0.08 g, Residual No. 6 0.45 / 0.09 g,
    // Motor Gasoline 0.38 / 0.08 g; Natural Gas per scf 0.00103 / 0.0001 g, x 1,000 per Mcf.
    expect([EF_.propane_gallon.ch4, EF_.propane_gallon.n2o]).toEqual([0.00027, 0.00005]);
    expect([EF_.fuel_oil_distillate_gallon.ch4, EF_.fuel_oil_distillate_gallon.n2o]).toEqual([0.00041, 0.00008]);
    expect([EF_.fuel_oil_residual_gallon.ch4, EF_.fuel_oil_residual_gallon.n2o]).toEqual([0.00045, 0.00009]);
    expect([EF_.gasoline_gallon.ch4, EF_.gasoline_gallon.n2o]).toEqual([0.00038, 0.00008]);
    expect([EF_.natural_gas_mcf.ch4, EF_.natural_gas_mcf.n2o]).toEqual([0.00103, 0.0001]);
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
    // FI3: the JEC densities (R9), one density for all three gases.
    near(EU.diesel_litre.ch4, perLitre(IPCC_T22.gas_diesel_oil.ch4, 43.0, 0.832), 'diesel CH4');
    near(EU.diesel_litre.n2o, perLitre(IPCC_T22.gas_diesel_oil.n2o, 43.0, 0.832), 'diesel N2O');
    near(EU.fuel_oil_residual_litre.ch4, perLitre(IPCC_T22.residual_oil.ch4, 40.4, 0.970), 'residual CH4');
    near(EU.fuel_oil_residual_litre.n2o, perLitre(IPCC_T22.residual_oil.n2o, 40.4, 0.970), 'residual N2O');
    near(EU.gasoline_litre.ch4, perLitre(IPCC_T22.motor_gasoline.ch4, 44.3, 0.743), 'gasoline CH4');
    near(EU.gasoline_litre.n2o, perLitre(IPCC_T22.motor_gasoline.n2o, 44.3, 0.743), 'gasoline N2O');
    // Natural gas per kWh gross (R7): rate x 0.90 x 3.6e-6 TJ/kWh.
    expect(EU.natural_gas_kwh.ch4).toBeCloseTo(IPCC_T22.natural_gas.ch4 * 0.9 * 3.6e-6, 15);
    expect(EU.natural_gas_kwh.n2o).toBeCloseTo(IPCC_T22.natural_gas.n2o * 0.9 * 3.6e-6, 15);
    // Heating oil shares the gas/diesel oil row by mass (R8), so it carries diesel's rates unchanged.
    expect(EU.fuel_oil_distillate_kg.ch4).toBe(EU.diesel_kg.ch4);
    expect(EU.fuel_oil_distillate_kg.n2o).toBe(EU.diesel_kg.n2o);
  });

  it('AB4 EF_EU is DEFINITIVELY NOT on Table 2.4 or 2.5', () => {
    // Asserted as an exclusion, not just an equality: the point of the comment is that the choice IS
    // identifiable in one direction (not commercial/residential) even though 2.2 and 2.3 cannot be
    // told apart from the stored values. If a sector selector is ever added, this is what should
    // start failing for the locations that move.
    const EU = EF_EU as any;
    const T24 = { gas_diesel_oil: 10, motor_gasoline: 10, residual_oil: 10, lpg: 5, natural_gas: 5 };
    expect(EU.diesel_litre.ch4).not.toBeCloseTo(perLitre(T24.gas_diesel_oil, 43.0, 0.832), 8);
    expect(EU.gasoline_litre.ch4).not.toBeCloseTo(perLitre(T24.motor_gasoline, 44.3, 0.743), 8);
    expect(EU.fuel_oil_residual_litre.ch4).not.toBeCloseTo(perLitre(T24.residual_oil, 40.4, 0.970), 8);
    expect(EU.natural_gas_kwh.ch4).not.toBeCloseTo(T24.natural_gas * 0.9 * 3.6e-6, 10);
    // The switch is NOT uniform scaling — liquids 3.33x, LPG and gas 5x. Recorded so a future change
    // is not applied as one multiplier.
    expect(T24.gas_diesel_oil / IPCC_T22.gas_diesel_oil.ch4).toBeCloseTo(10 / 3, 9);
    expect(T24.lpg / IPCC_T22.lpg.ch4).toBe(5);
  });

  it('AB5 EPA and IPCC DISAGREE on LPG, and both are preserved', () => {
    // EPA puts propane on the petroleum 3 / 0.6; IPCC keeps LPG on the gaseous 1 / 0.1. Two
    // publishers, not a transcription error. Pinned so a "harmonising" edit fails loudly.
    // FI2 diff 3: from EPA's printed 0.27 g per gallon, so the rate comes back to within the printed rounding.
    const usRatePerMmbtu = (EF as any).propane_gallon.ch4 / 0.091 * 1000;   // back to g/mmBtu
    expect(Math.abs(usRatePerMmbtu - 3), 'EPA propane sits on the petroleum rate').toBeLessThan(0.06);
    // FI3: no EU LPG key is held until FI4, so IPCC's side is read off natural gas, the same gaseous pair (1 / 0.1),
    // which is the IPCC LPG rate too (Ch. 2 Tables 2.2/2.3).
    const euRatePerTJ = (EF_EU as any).natural_gas_kwh.ch4 / (0.9 * 3.6e-6);
    expect(euRatePerTJ, 'IPCC LPG sits on the gaseous rate').toBeCloseTo(1, 6);
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
    // And a gallon figure prices at those same rates x L_PER_GAL, converted exactly (FI2: no gallon keys).
    expect(CA.gasoline_gallon, 'the pre-multiplied gallon key is gone').toBeUndefined();
    expect(pickEF(loc({ country: 'CA' }), 'gasoline_gallon').factor.ch4).toBeCloseTo(0.100 / 1000 * G, 14);
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

// ── T1: billContributions (docs/review/design-derived-figures.md, section 11) ─────────────────────────
// Pure and not yet wired: T2 folds these rows into applyResolutions. Day counts are half-open on the
// canonical period [start, exclusiveEnd(end)) (ruling C4). Scenarios A and B are in
// docs/review/recalc/scenarios-additions.md.
describe('T1 billContributions', () => {
  const win2025 = periodFromYearAndEnd(2025, 12);
  const win2026 = periodFromYearAndEnd(2026, 12);
  const elec = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'electricity', value, unit: 'kwh', periodStart, periodEnd, periodConfidence: 'high', sourceQuote: `${value} kWh`, ...o });
  const gas = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'natural_gas', value, unit: 'mcf', periodStart, periodEnd, periodConfidence: 'high', ...o });
  // Scenario A: two adjacent bills with first-of-month end dates.
  const scenarioA = () => loc({
    source_docs: [
      doc('utility_electricity', [elec(1000, '2025-12-01', '2026-01-01')], 'bill1'),
      doc('utility_electricity', [elec(1200, '2026-01-01', '2026-02-01')], 'bill2'),
    ],
  });
  const byDoc = (rows: BillContribution[], id: string) => rows.find(r => r.docId === id)!;

  it('Scenario A, FY2025: Bill 1 counted 31/31, Bill 2 outside the year', () => {
    const rows = billContributions(scenarioA(), [], win2025);
    expect(rows).toHaveLength(2);
    expect(byDoc(rows, 'bill1')).toEqual({
      docId: 'bill1', proposalIndex: 0, fuelType: 'electricity', field: 'electricity_kwh', meterLabel: null,
      periodStart: '2025-12-01', periodEndExclusive: '2026-01-01', periodOrigin: 'printed',
      totalDays: 31, inWindowDays: 31, share: 1, value: 1000, unit: 'kwh', counted: true, reason: 'counted',
    });
    expect(byDoc(rows, 'bill2')).toMatchObject({
      periodStart: '2026-01-01', periodEndExclusive: '2026-02-01',
      totalDays: 31, inWindowDays: 0, share: 0, counted: false, reason: 'outside_year',
    });
  });

  it('Scenario A, FY2026: the reverse', () => {
    const rows = billContributions(scenarioA(), [], win2026);
    expect(byDoc(rows, 'bill1')).toMatchObject({ totalDays: 31, inWindowDays: 0, share: 0, counted: false, reason: 'outside_year' });
    expect(byDoc(rows, 'bill2')).toMatchObject({ totalDays: 31, inWindowDays: 31, share: 1, counted: true, reason: 'counted' });
  });

  it('"Dec 1 – Jan 1" is 31 days, not 32: the printed first-of-month end is the first uncovered day', () => {
    const [row] = billContributions(loc({ source_docs: [doc('utility_electricity', [elec(1, '2025-12-01', '2026-01-01')])] }), [], win2025);
    expect(row.totalDays).toBe(31);
    expect(row.periodEndExclusive).toBe('2026-01-01');
  });

  it('"Dec 20 – Jan 19" is 31 days with 12 in FY2025: prorated by its own days', () => {
    const [row] = billContributions(loc({ source_docs: [doc('utility_electricity', [elec(3100, '2025-12-20', '2026-01-19')])] }), [], win2025);
    expect(row).toMatchObject({ totalDays: 31, inWindowDays: 12, counted: true, reason: 'prorated', periodEndExclusive: '2026-01-20' });
    expect(row.share).toBeCloseTo(12 / 31, 12);
  });

  it('two straddling bills of one fuel each carry their OWN share (not one ratio for both)', () => {
    const rows = billContributions(loc({
      source_docs: [
        doc('utility_bill_gas', [gas(310, '2024-12-20', '2025-01-19')], 'start'),   // 19 of 31 days in FY2025
        doc('utility_bill_gas', [gas(310, '2025-12-15', '2026-01-14')], 'end'),     // 17 of 31 days in FY2025
      ],
    }), [], win2025);
    expect(byDoc(rows, 'start')).toMatchObject({ totalDays: 31, inWindowDays: 19, reason: 'prorated', counted: true });
    expect(byDoc(rows, 'end')).toMatchObject({ totalDays: 31, inWindowDays: 17, reason: 'prorated', counted: true });
    expect(byDoc(rows, 'start').share).toBeCloseTo(19 / 31, 12);
    expect(byDoc(rows, 'end').share).toBeCloseTo(17 / 31, 12);
  });

  it('unconfirmed proposals get a row, not counted, reason not_confirmed; a null value gets no row', () => {
    const rows = billContributions(loc({
      source_docs: [doc('utility_bill_gas', [
        gas(10, '2025-01-01', '2025-01-31', { status: 'extracted' }),
        gas(20, '2025-02-01', '2025-02-28', { status: 'needs_manual_review' }),
        gas(30, '2025-03-01', '2025-03-31', { status: 'rejected' }),
        gas(0, '2025-04-01', '2025-04-30', { value: null }),
      ])],
    }), [], win2025);
    expect(rows.map(r => [r.proposalIndex, r.reason, r.counted])).toEqual([
      [0, 'not_confirmed', false], [1, 'not_confirmed', false], [2, 'not_confirmed', false],
    ]);
  });

  it('mixed units: every confirmed row of the field is not counted; an unconfirmed row keeps not_confirmed', () => {
    const rows = billContributions(loc({
      source_docs: [doc('utility_bill_gas', [
        gas(100, '2025-01-01', '2025-01-31', { unit: 'mcf' }),
        gas(100, '2025-02-01', '2025-02-28', { unit: 'therms' }),
        gas(100, '2025-03-01', '2025-03-31', { unit: 'm3', status: 'extracted' }),
      ])],
    }), [], win2025);
    expect(rows.map(r => [r.reason, r.counted])).toEqual([['mixed_units', false], ['mixed_units', false], ['not_confirmed', false]]);
    // A different field with one unit is unaffected by the gas field's mix.
    const other = billContributions(loc({
      source_docs: [
        doc('utility_bill_gas', [gas(100, '2025-01-01', '2025-01-31', { unit: 'mcf' }), gas(100, '2025-02-01', '2025-02-28', { unit: 'therms' })], 'g'),
        doc('utility_electricity', [elec(500, '2025-01-01', '2025-01-31')], 'e'),
      ],
    }), [], win2025);
    expect(byDoc(other, 'e')).toMatchObject({ reason: 'counted', counted: true });
  });

  it('undated: missing dates is not counted, with no day figures', () => {
    const [row] = billContributions(loc({
      source_docs: [doc('utility_bill_gas', [gas(10, null, null, { periodConfidence: 'low' })])],
    }), [], win2025);
    expect(row).toMatchObject({ reason: 'undated', counted: false, totalDays: null, inWindowDays: null, share: null, periodEndExclusive: null });
    expect(row.periodOrigin).toBeNull();
  });

  it('invalid_period: an end before the start is its own reason, not counted, with no day figures', () => {
    const rows = billContributions(loc({
      source_docs: [doc('utility_bill_gas', [
        gas(10, '2025-03-10', '2025-03-01'),
        gas(10, '2025-03-10', '2025-03-09'),   // end the day before the start: zero days, still invalid
        gas(10, '2025-03-10', '2025-03-10'),   // one-day bill: valid
      ])],
    }), [], win2025);
    expect(rows.map(r => r.reason)).toEqual(['invalid_period', 'invalid_period', 'counted']);
    for (const r of rows.slice(0, 2)) {
      expect(r).toMatchObject({ counted: false, periodProblem: 'reversed', totalDays: null, inWindowDays: null, share: null, periodEndExclusive: null });
    }
    expect(rows[2].periodProblem, 'only invalid_period rows carry a periodProblem').toBeUndefined();
    expect(rows[0].periodStart, 'the stored start is kept verbatim').toBe('2025-03-10');
    expect(rows[2].totalDays).toBe(1);
  });

  it('invalid_period, unparseable: a date string present but not a real date is invalid_period, not undated', () => {
    const rows = billContributions(loc({
      source_docs: [doc('utility_bill_gas', [
        gas(10, 'Jan 2025', '2025-01-31'),          // not yyyy-mm-dd
        gas(10, '2025-01-01', 'unknown'),           // end not a date
        gas(10, '2025-02-01', '2025-02-30'),        // 30 February: Date would roll it to 2 March
        gas(10, '2025-13-01', '2025-13-31'),        // month 13
      ])],
    }), [], win2025);
    for (const r of rows) {
      expect(r).toMatchObject({ reason: 'invalid_period', periodProblem: 'unparseable', counted: false, totalDays: null, inWindowDays: null, share: null, periodEndExclusive: null });
    }
    expect(rows[0].periodStart, 'the stored string is kept verbatim').toBe('Jan 2025');
  });

  it('the two invalid_period kinds have distinct plain-language messages naming the document and dates', () => {
    const unparseable = INVALID_PERIOD_MESSAGE.unparseable('bill_jan.pdf', 'Jan 2025', '2025-01-31');
    const reversed = INVALID_PERIOD_MESSAGE.reversed('bill_mar.pdf', '2025-03-10', '2025-03-01');
    expect(unparseable).toBe('The billing period on bill_jan.pdf could not be read as dates ("Jan 2025" to "2025-01-31"). Enter the dates as they appear on the bill.');
    expect(reversed).toBe('The billing period on bill_mar.pdf ends before it starts (10 March 2025 to 1 March 2025). Check the dates and correct them.');
    expect(unparseable).not.toBe(reversed);
    for (const m of [unparseable, reversed]) expect(m).not.toMatch(/\u2014|invalid_period|periodProblem/);
  });

  it('precedence: not_confirmed and mixed_units outrank invalid_period', () => {
    const rows = billContributions(loc({
      source_docs: [doc('utility_bill_gas', [
        gas(10, '2025-03-10', '2025-03-01', { status: 'extracted' }),
        gas(10, '2025-03-10', '2025-03-01', { unit: 'mcf' }),
        gas(10, '2025-04-01', '2025-04-30', { unit: 'therms' }),
      ])],
    }), [], win2025);
    expect(rows.map(r => r.reason)).toEqual(['not_confirmed', 'mixed_units', 'mixed_units']);
  });

  it('periodOrigin: high → printed, medium → billing_month (Scenario B), missing → null', () => {
    const rows = billContributions(loc({
      source_docs: [doc('utility_electricity', [
        elec(1, '2025-05-01', '2025-05-31', { periodConfidence: 'high' }),
        elec(1, '2026-01-01', '2026-01-31', { periodConfidence: 'medium' }),
        elec(1, '2025-06-01', '2025-06-30', { periodConfidence: undefined }),
      ])],
    }), [], win2026);
    expect(rows.map(r => r.periodOrigin)).toEqual(['printed', 'billing_month', null]);
    // Scenario B: "Jan 2026" stored as Jan 1 to Jan 31 is [2026-01-01, 2026-02-01), counted in FY2026.
    expect(rows[1]).toMatchObject({ periodEndExclusive: '2026-02-01', totalDays: 31, inWindowDays: 31, reason: 'counted' });
  });

  it('meterLabel is the document meter_label, null for the default single meter', () => {
    const rows = billContributions(loc({
      source_docs: [
        doc('utility_electricity', [elec(1, '2025-01-01', '2025-01-31')], 'a'),
        { ...doc('utility_electricity', [elec(1, '2025-01-01', '2025-01-31')], 'b'), meter_label: 'Meter 2' },
      ],
    }), [], win2025);
    expect(byDoc(rows, 'a').meterLabel).toBeNull();
    expect(byDoc(rows, 'b').meterLabel).toBe('Meter 2');
  });

  it('a (document_type, fuelType) with no field produces no row', () => {
    expect(billContributions(loc({ source_docs: [doc('service_record', [gas(5, '2025-01-01', '2025-01-31')])] }), [], win2025)).toEqual([]);
  });

  it('is pure: the location is not mutated', () => {
    const l = scenarioA();
    const before = JSON.stringify(l);
    billContributions(l, [], win2025);
    expect(JSON.stringify(l)).toBe(before);
  });

  // T1's guard was "nothing calls it yet". T2 wired it into applyResolutions; T3 adds findUnresolvedCoverage;
  // T5 adds buildWorkings (contributions on rows) and the evidenced quantity per field, which T6 moved into
  // emissionsByLocationField (shared by pctEstimated and reconcile); T6 adds the monthly split; T8 adds the
  // coverage strip, which shows each bill's prorated share.
  it('is called only by applyResolutions, findUnresolvedCoverage, buildWorkings, emissionsByLocationField, notCountedLines, buildMonthlyEmissions and the coverage strip (T2, T3, T5, T6, T8, T15-fix2)', () => {
    const root = join(__dirname, '..', '..');
    const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap(n => {
      const rel = `${dir}/${n}`;
      if (n === 'node_modules' || n.startsWith('.')) return [];
      return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [rel] : [];
    });
    const calls = [...walk('lib'), ...walk('app')].flatMap(f => {
      const src = stripTsComments(readFileSync(join(root, f), 'utf8')).replace(/export function billContributions\(/, '');
      const n = (src.match(/billContributions\(/g) ?? []).length;
      return n ? [`${f}: ${n}`] : [];
    });
    // T15-fix2: the fifth engine call is notCountedLines, which the page's reading rows read instead of calling
    // billContributions themselves (T15-fix1 did, and that call is gone).
    expect(calls).toEqual(['lib/ghg/engine.ts: 5', 'lib/ghg/monthlyEmissions.ts: 1', 'app/dashboard/ghg/_components/CoverageStrip.tsx: 1']);
    const engineSrc = readFileSync(join(root, 'lib/ghg/engine.ts'), 'utf8');
    for (const fn of ['export function applyResolutions(', 'export function findUnresolvedCoverage(', 'function buildWorkings(', 'export function emissionsByLocationField(', 'export function notCountedLines(']) {
      const body = engineSrc.slice(engineSrc.indexOf(fn));
      expect(body.slice(0, body.indexOf('\n}\n')), fn).toMatch(/billContributions\(/);
    }
  });

  it('exclusiveEnd has exactly one definition in lib/ and app/ (CLAUDE.md invariant)', () => {
    const root = join(__dirname, '..', '..');
    const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap(n => {
      const rel = `${dir}/${n}`;
      if (n === 'node_modules' || n.startsWith('.')) return [];
      return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [rel] : [];
    });
    const defs = [...walk('lib'), ...walk('app')].flatMap(f => {
      const src = stripTsComments(readFileSync(join(root, f), 'utf8'));
      const n = (src.match(/(?:function\s+exclusiveEnd\s*\(|(?:const|let|var)\s+exclusiveEnd\s*=)/g) ?? []).length;
      return n ? [`${f}: ${n}`] : [];
    });
    expect(defs).toEqual(['lib/ghg/engine.ts: 1']);
  });
});

// ── T2: applyResolutions as the fold of billContributions (design doc section 11) ─────────────────────
// The figure is Σ counted bills' value × own share, then the extrapolation gross-up. Scenarios A and B are in
// docs/review/recalc/scenarios-additions.md.
describe('T2 applyResolutions folds billContributions', () => {
  const w = (y: number) => periodFromYearAndEnd(y, 12);
  const elec = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'electricity', value, unit: 'kwh', periodStart, periodEnd, periodConfidence: 'high', sourceQuote: `${value} kWh`, ...o });
  const gas = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'natural_gas', value, unit: 'mcf', periodStart, periodEnd, ...o });
  const scenarioA = () => loc({
    source_docs: [
      doc('utility_electricity', [elec(1000, '2025-12-01', '2026-01-01')], 'bill1'),
      doc('utility_electricity', [elec(1200, '2026-01-01', '2026-02-01')], 'bill2'),
    ],
  });
  const applied = (l: Location, res: CoverageResolution[], y: number) => applyResolutions(l, res, w(y).start, w(y).end);

  it('Scenario A: a bill wholly outside the year contributes 0 (F-09); FY2025 counts Bill 1 only, FY2026 Bill 2 only', () => {
    const a25 = applied(scenarioA(), [], 2025).electricity_kwh;
    expect(a25.value).toBe(1000);
    expect(a25.rawSum, 'rawSum is still every confirmed bill').toBe(2200);
    expect(a25.adjustment).toBeNull();
    expect(applied(scenarioA(), [], 2026).electricity_kwh.value).toBe(1200);
  });

  it('two straddling bills are each prorated by their OWN days, not one shared ratio', () => {
    const l = loc({
      source_docs: [
        doc('utility_bill_gas', [gas(310, '2024-12-20', '2025-01-19')], 'start'), // 19 of 31 in FY2025
        doc('utility_bill_gas', [gas(310, '2025-12-15', '2026-01-14')], 'end'),   // 17 of 31 in FY2025
      ],
    });
    const a = applied(l, [], 2025).natural_gas_amount;
    expect(a.value).toBeCloseTo(310 * 19 / 31 + 310 * 17 / 31, 9);
    expect(a.adjustment).toMatchObject({ kind: 'prorate', method: 'Prorated by billing days' });
    expect(a.adjustment?.basis).toBe(
      '20 December 2024 to 19 January 2025: 19 of 31 days in reporting year 2025, ×0.613; then 15 December 2025 to 14 January 2026: 17 of 31 days in reporting year 2025, ×0.548');
  });

  it('the extrapolation gross-up applies AFTER the fold, and the gross-up drives the stamp', () => {
    const l = loc({ source_docs: [doc('utility_bill_gas', [gas(310, '2024-12-20', '2025-01-19')])] });
    const ext: CoverageResolution = { locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 6, pctEstimated: 50, note: '6 of 12', acknowledgedAt: '2025-06-01T00:00:00Z' };
    const a = applied(l, [ext], 2025).natural_gas_amount;
    expect(a.value).toBeCloseTo((310 * 19 / 31) * (12 / 6), 9);
    expect(a.adjustment?.kind).toBe('extrapolate');
    expect(a.adjustment?.basis.startsWith('20 December 2024 to 19 January 2025: 19 of 31 days in reporting year 2025, ×0.613; then ')).toBe(true);
    const row = buildWorkings([{ ...l, has_natural_gas: true, natural_gas_amount: 1, natural_gas_unit: 'mcf' }], 'AR6', 2025, [ext]).find(r => r.source === 'Natural gas');
    expect(row?.entry_method).toBe('concierge-extrapolated');
    expect(row?.proration_note).toBeUndefined();
  });

  it('a stored straddle resolution is ignored: every legacy choice gives the same figure as none', () => {
    const l = loc({ source_docs: [doc('utility_bill_gas', [gas(310, '2024-12-20', '2025-01-19')])] });
    const none = applied(l, [], 2025).natural_gas_amount.value;
    for (const choice of ['prorate', 'this_year', 'next_year'] as const) {
      expect(applied(l, [{ ...straddleRes(choice), daysInYear: 1, totalDays: 31 }], 2025).natural_gas_amount.value, choice).toBe(none);
    }
  });

  it('buildWorkings still writes audit rows for resolutions that reach the figure (extrapolate), not for a legacy straddle', () => {
    const l = loc({ has_natural_gas: true, natural_gas_amount: 1, natural_gas_unit: 'mcf', source_docs: [doc('utility_bill_gas', [gas(310, '2025-01-01', '2025-06-30')])] });
    const ext: CoverageResolution = { locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 6, pctEstimated: 50, note: '6 of 12', acknowledgedAt: '2025-06-01T00:00:00Z' };
    const rows = buildWorkings([l], 'AR6', 2025, [ext, straddleRes('next_year')]);
    expect(rows.filter(r => r.gwp_basis === 'coverage_resolution').map(r => r.activity_unit)).toEqual(['extrapolate']);
  });

  it('the proration note has no em dash and names each bill, its days and its share', () => {
    const rows = buildWorkings([straddleGasLoc()], 'AR6', 2024, []);
    const note = ngRow(rows)?.proration_note as string;
    expect(note).toBe('20 December 2024 to 19 January 2025: 12 of 31 days in reporting year 2024, ×0.387');
    expect(note).not.toContain('\u2014');
  });

  it('undated and invalid-period bills are not counted (T1 rulings); a dated bill beside them still is', () => {
    const l = loc({
      source_docs: [doc('utility_bill_gas', [
        gas(100, '2025-03-01', '2025-03-31'),
        gas(50, null, null),
        gas(40, '2025-03-10', '2025-03-01'),
        gas(30, 'Mar 2025', '2025-03-31'),
      ])],
    });
    expect(applied(l, [], 2025).natural_gas_amount.value).toBe(100);
  });

  it('mixed units: unchanged, mixedUnits true and value = rawSum (the write path skips it)', () => {
    const l = loc({ source_docs: [doc('utility_bill_gas', [gas(100, '2025-01-01', '2025-01-31', { unit: 'mcf' }), gas(200, '2025-02-01', '2025-02-28', { unit: 'therms' })])] });
    const a = applied(l, [], 2025).natural_gas_amount;
    expect(a.mixedUnits).toBe(true);
    expect(a.value).toBe(300);
  });

  it('Scenario B with Bill 2 in FY2026: both January bills are counted (overlap resolution is T3)', () => {
    const l = loc({ source_docs: [
      doc('utility_electricity', [elec(1200, '2026-01-01', '2026-02-01')], 'bill2'),
      doc('utility_electricity', [elec(1150, '2026-01-01', '2026-01-31', { periodConfidence: 'medium' })], 'monthOnly'),
    ] });
    expect(applied(l, [], 2026).electricity_kwh.value).toBe(2350);
    // In FY2025 both are outside the year: 0, where before T2 both were summed in full (F-10).
    expect(applied(l, [], 2025).electricity_kwh.value).toBe(0);
  });
});

// ── T3: coverage with full-period overlap, meter key, same_bill / different_meters, no silent zero ─────
// docs/review/design-derived-figures.md section 11 T3 and the T3 rulings in section 10.
describe('T3 coverage, resolutions and the no-silent-zero rule', () => {
  const W = (y: number) => periodFromYearAndEnd(y, 12);
  const elec = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'electricity', value, unit: 'kwh', periodStart, periodEnd, periodConfidence: 'high', sourceQuote: `${value} kWh`, ...o });
  const gas = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'natural_gas', value, unit: 'mcf', periodStart, periodEnd, ...o });
  const edoc = (id: string, p: ExtractedProposal, meter?: string): SourceDoc =>
    ({ ...doc('utility_electricity', [p], id), file_name: `${id}.pdf`, ...(meter ? { meter_label: meter } : {}) });
  const res = (o: Partial<CoverageResolution>): CoverageResolution =>
    ({ locId: 'L1', fuelType: 'electricity', kind: 'extrapolate', note: 'n', acknowledgedAt: '2026-03-01T10:00:00Z', ...o } as CoverageResolution);
  // Scenario B with Scenario A's Bill 2: identical January 2026 periods.
  const scenarioB = (meter?: string) => loc({ source_docs: [
    edoc('bill2', elec(1200, '2026-01-01', '2026-02-01')),
    edoc('monthOnly', elec(1150, '2026-01-01', '2026-01-31', { periodConfidence: 'medium' }), meter),
  ] });
  const issues = (l: Location, y: number, r: CoverageResolution[] = []) => findUnresolvedCoverage([l], y, 12, r);
  const value = (l: Location, y: number, r: CoverageResolution[] = []) => applyResolutions(l, r, W(y).start, W(y).end).electricity_kwh?.value;
  const OVERLAP_MSG = 'bill2.pdf and monthOnly.pdf cover the same days (1 January 2026 to 31 January 2026). Choose Same bill, count it once, or Different meters or accounts.';

  it('Scenario B + Bill 2, FY2026: overlap raised with a message naming both documents and the shared days', () => {
    expect(issues(scenarioB(), 2026).filter(i => i.status === 'overlap')).toEqual([
      { locId: 'L1', fuelType: 'electricity', status: 'overlap', docIds: ['bill2', 'monthOnly'], meterLabel: null, documentType: 'utility_electricity', message: OVERLAP_MSG }]);
  });

  it('Scenario B + Bill 2, FY2025: the overlap is STILL raised (full periods), though both contribute 0', () => {
    expect(issues(scenarioB(), 2025).filter(i => i.status === 'overlap').map(i => i.message)).toEqual([OVERLAP_MSG]);
    expect(value(scenarioB(), 2025)).toBe(0);
  });

  it('same_bill: the excluded document is retained as evidence, not counted, and the overlap clears', () => {
    const r = res({ kind: 'same_bill', countedDocId: 'bill2', excludedDocIds: ['monthOnly'] });
    const l = scenarioB();
    expect(validateResolution(r, l)).toBeNull();
    expect(value(l, 2026, [r])).toBe(1200);
    expect(issues(l, 2026, [r]).filter(i => i.status === 'overlap')).toEqual([]);
    const c = billContributions(l, [r], W(2026)).find(x => x.docId === 'monthOnly')!;
    expect(c).toMatchObject({ counted: false, reason: 'same_bill_as', reasonRef: 'bill2' });
    expect(l.source_docs.map(d => d.id), 'retained').toEqual(['bill2', 'monthOnly']);
    expect(buildWorkings([{ ...l, electricity_kwh: 1200, grid_region: 'US_CA' }], 'AR6', 2026, [r])
      .filter(w => w.gwp_basis === 'coverage_resolution').map(w => w.emission_factor)).toEqual(['Same bill, counted once']);
  });

  it('same_bill validation: one counted document, not also excluded, all on the site with this fuel', () => {
    const l = scenarioB();
    expect(validateResolution(res({ kind: 'same_bill', excludedDocIds: ['monthOnly'] }), l)).toBe('Choose the document that counts.');
    expect(validateResolution(res({ kind: 'same_bill', countedDocId: 'bill2', excludedDocIds: [] }), l)).toBe('Choose the document that is the same bill.');
    expect(validateResolution(res({ kind: 'same_bill', countedDocId: 'bill2', excludedDocIds: ['bill2'] }), l)).toBe('The document that counts cannot also be excluded.');
    expect(validateResolution(res({ kind: 'same_bill', countedDocId: 'bill2', excludedDocIds: ['nope'] }), l)).toBe('Every document named must be on this site and carry this fuel.');
  });

  it('different_meters: needs a label that matches the document; then the groups split and both count', () => {
    expect(validateResolution(res({ kind: 'different_meters', docId: 'monthOnly', meterLabel: '  ' }), scenarioB())).toBe('Name the meter or account for the second document.');
    expect(validateResolution(res({ kind: 'different_meters', docId: 'monthOnly', meterLabel: 'Meter 2' }), scenarioB())).toBe("The meter name must match the document's meter label.");
    const l = scenarioB('Meter 2');
    const r = res({ kind: 'different_meters', docId: 'monthOnly', meterLabel: 'Meter 2' });
    expect(validateResolution(r, l)).toBeNull();
    expect(issues(l, 2026, [r]).filter(i => i.status === 'overlap')).toEqual([]);
    expect(value(l, 2026, [r])).toBe(2350);
  });

  it('legacy duplicate is not accepted: the overlap stays, the figure is unchanged, no audit row', () => {
    const dup = res({ kind: 'duplicate' });
    expect(validateResolution(dup, scenarioB())).toBe('This resolution is no longer accepted. Choose Same bill, count it once, or Different meters or accounts.');
    expect(issues(scenarioB(), 2026, [dup]).filter(i => i.status === 'overlap')).toHaveLength(1);
    expect(value(scenarioB(), 2026, [dup])).toBe(2350);
    expect(buildWorkings([{ ...scenarioB(), electricity_kwh: 2350, grid_region: 'US_CA' }], 'AR6', 2026, [dup])
      .filter(w => w.gwp_basis === 'coverage_resolution')).toEqual([]);
  });

  it('meter-keyed gaps: each meter is its own group; an estimate clears only its own meter, grossed by its own factor', () => {
    const months = (n: number, meter?: string, prefix = 'a') => Array.from({ length: n }, (_, i) => {
      const m = String(i + 1).padStart(2, '0');
      const last = new Date(2025, i + 1, 0).getDate();
      return edoc(`${prefix}${i}`, elec(100, `2025-${m}-01`, `2025-${m}-${last}`), meter);
    });
    const l = loc({ source_docs: [...months(12), ...months(6, 'B', 'b')] });
    expect(issues(l, 2025).filter(i => i.status === 'gap')).toEqual([{ locId: 'L1', fuelType: 'electricity', status: 'gap', meterLabel: 'B', documentType: 'utility_electricity' }]);
    const wrongMeter = res({ kind: 'extrapolate', monthsCovered: 6, pctEstimated: 50 });
    expect(issues(l, 2025, [wrongMeter]).filter(i => i.status === 'gap'), 'a default-meter estimate does not clear meter B').toHaveLength(1);
    const meterB = res({ kind: 'extrapolate', monthsCovered: 6, pctEstimated: 50, meterLabel: 'B' });
    expect(issues(l, 2025, [meterB]).filter(i => i.status === 'gap')).toEqual([]);
    expect(value(l, 2025, [meterB])).toBe(1200 + 600 * 2);
  });

  it('no silent zero: undated, both invalid_period kinds and mixed_units each raise a blocking issue naming the document', () => {
    const l = loc({ source_docs: [
      { ...doc('utility_bill_gas', [gas(10, null, null)], 'u'), file_name: 'u.pdf' },
      { ...doc('utility_bill_gas', [gas(10, '2025-03-10', '2025-03-01')], 'rev'), file_name: 'rev.pdf' },
      { ...doc('utility_bill_gas', [gas(10, 'Mar 2025', '2025-03-31')], 'bad'), file_name: 'bad.pdf' },
    ] });
    const got = issues(l, 2025);
    expect(got).toContainEqual(expect.objectContaining({ status: 'undated', message: COVERAGE_MESSAGE.undated('u.pdf') }));
    expect(got).toContainEqual(expect.objectContaining({ status: 'invalid_period', docIds: ['rev'], message: INVALID_PERIOD_MESSAGE.reversed('rev.pdf', '2025-03-10', '2025-03-01') }));
    expect(got).toContainEqual(expect.objectContaining({ status: 'invalid_period', docIds: ['bad'], message: INVALID_PERIOD_MESSAGE.unparseable('bad.pdf', 'Mar 2025', '2025-03-31') }));
    const mixed = loc({ name: 'Plant', source_docs: [
      { ...doc('utility_bill_gas', [gas(1, '2025-01-01', '2025-01-31', { unit: 'mcf' })], 'm1'), file_name: 'm1.pdf' },
      { ...doc('utility_bill_gas', [gas(1, '2025-02-01', '2025-02-28', { unit: 'therms' })], 'm2'), file_name: 'm2.pdf' },
    ] });
    expect(issues(mixed, 2025)).toContainEqual({ locId: 'L1', fuelType: 'natural_gas', status: 'mixed_units', docIds: ['m1', 'm2'],
      message: 'The natural gas bills for Plant are in different units (mcf, therms: m1.pdf, m2.pdf), so none of them is counted. Correct the units, or enter the figure manually.' });
  });

  it('no silent zero: outside_year and same_bill_as raise no issue of their own', () => {
    const outside = loc({ source_docs: [edoc('old', elec(500, '2024-03-01', '2024-03-31'))] });
    expect(issues(outside, 2025).filter(i => i.docIds?.includes('old') && i.status !== 'gap')).toEqual([]);
    const r = res({ kind: 'same_bill', countedDocId: 'bill2', excludedDocIds: ['monthOnly'] });
    expect(issues(scenarioB(), 2026, [r]).filter(i => i.docIds?.includes('monthOnly'))).toEqual([]);
  });

  describe('all documents rejected', () => {
    const rejected = (amount = 0) => loc({ name: 'Plant', has_natural_gas: true, natural_gas_amount: amount, natural_gas_unit: 'mcf', source_docs: [
      { ...doc('utility_bill_gas', [gas(100, '2025-01-01', '2025-01-31', { status: 'rejected' })], 'r1'), file_name: 'r1.pdf' },
      { ...doc('utility_bill_gas', [gas(100, '2025-02-01', '2025-02-28', { status: 'rejected' })], 'r2'), file_name: 'r2.pdf' },
    ] });
    const usedNone = res({ fuelType: 'natural_gas', kind: 'used_none', field: 'natural_gas_amount', by: { userId: 'u-1', email: 'jo@acme.example' } });

    it('raises an export-blocking issue offering a manual figure or "used none"', () => {
      expect(issues(rejected(), 2025)).toContainEqual({ locId: 'L1', fuelType: 'natural_gas', status: 'all_rejected', field: 'natural_gas_amount',
        message: 'Every natural gas document for Plant was rejected and no figure has been entered. Enter the figure manually, or confirm this site used no natural gas.' });
    });

    it('confirming "used none" records who and when, shows in workings, writes 0, clears the issue and the declaration gate', () => {
      expect(findUndeclaredStreams([rejected()]).map(x => x.stream)).toContain('natural_gas');
      expect(validateResolution(usedNone, rejected())).toBeNull();
      expect(issues(rejected(), 2025, [usedNone]).filter(i => i.status === 'all_rejected')).toEqual([]);
      expect(findUndeclaredStreams([rejected()], [usedNone]).map(x => x.stream)).not.toContain('natural_gas');
      // T10 ruling: since T7 a stored value can only have been typed, and a typed figure above 0 supersedes an
      // earlier "used none" (it stays in the record but no longer applies).
      expect(applyResolutions(rejected(50), [usedNone], W(2025).start, W(2025).end).natural_gas_amount, 'a typed figure supersedes used none').toBeUndefined();
      expect(applyResolutions(rejected(0), [usedNone], W(2025).start, W(2025).end).natural_gas_amount.value, 'nothing typed: used none is 0').toBe(0);
      const row = buildWorkings([rejected()], 'AR6', 2025, [usedNone]).find(w => w.gwp_basis === 'coverage_resolution');
      expect(row?.emission_factor).toBe('Site used none, confirmed by jo@acme.example on 1 March 2026');
      expect(row?.resolved_at).toBe('2026-03-01T10:00:00Z');
    });

    it('used_none must record who', () => {
      expect(validateResolution({ ...usedNone, by: undefined }, rejected())).toBe('A confirmation must record who confirmed it.');
      // T10: every field a document type supports can be confirmed as none; a field no document backs cannot.
      expect(validateResolution({ ...usedNone, field: 'revenue_millions' }, rejected())).toBe('Name the figure that is being confirmed as none.');
    });

    it('entering a manual figure also clears it; one rejected and one confirmed document does not raise it', () => {
      expect(issues(rejected(250), 2025).filter(i => i.status === 'all_rejected')).toEqual([]);
      const mixedStatus = loc({ source_docs: [
        doc('utility_bill_gas', [gas(100, '2025-01-01', '2025-01-31', { status: 'rejected' })], 'r1'),
        doc('utility_bill_gas', [gas(100, '2025-02-01', '2025-02-28')], 'c1'),
      ] });
      expect(issues(mixedStatus, 2025).filter(i => i.status === 'all_rejected')).toEqual([]);
    });
  });

  // ── Property tests (seeded, deterministic) ──────────────────────────────────────────────────────
  const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  it('property: once no overlap issue remains, no two counted bills in one group share a day', () => {
    const r = rng(7);
    let blocked = 0, checked = 0;
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(r() * 4);
      const docs: SourceDoc[] = Array.from({ length: n }, (_, i) => {
        const start = new Date(2025, Math.floor(r() * 12), 1 + Math.floor(r() * 27));
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(r() * 60));
        return edoc(`d${i}`, elec(100, iso(start), iso(end)), r() < 0.2 ? 'M2' : undefined);
      });
      const l = loc({ source_docs: docs });
      const resolutions: CoverageResolution[] = [];
      if (r() < 0.6) {
        const counted = `d${Math.floor(r() * n)}`;
        const excluded = docs.map(d => d.id).filter(id => id !== counted && r() < 0.5);
        if (excluded.length) resolutions.push(res({ kind: 'same_bill', countedDocId: counted, excludedDocIds: excluded }));
      }
      if (r() < 0.3) resolutions.push(res({ kind: 'duplicate' }));
      if (issues(l, 2025, resolutions).some(i => i.status === 'overlap')) { blocked++; continue; }
      const cs = billContributions(l, resolutions, W(2025)).filter(c => c.counted);
      if (cs.length > 1) checked++;
      for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
        if (cs[a].meterLabel !== cs[b].meterLabel) continue;
        const aS = cs[a].periodStart as string, aE = cs[a].periodEndExclusive as string;
        const bS = cs[b].periodStart as string, bE = cs[b].periodEndExclusive as string;
        expect(aS >= bE || bS >= aE, `trial ${t}: ${cs[a].docId} and ${cs[b].docId} both counted over shared days`).toBe(true);
      }
    }
    expect(blocked, 'some trials overlap').toBeGreaterThan(20); expect(checked, 'some trials count 2+ bills').toBeGreaterThan(20);
  });

  // Extended in T6: the "uses natural gas" switch is random too. A switched-off field reaches no total, so
  // its figure counts as zero here, and confirmed bills under it must raise the stream_off issue.
  it('property: a field with documents never reaches zero silently (blocking issue, pending proposal, silent reason, or used_none)', () => {
    const r = rng(11);
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const seen = { blocking: 0, silent: 0, usedNone: 0, streamOff: 0, unread: 0, noValue: 0 };
    for (let t = 0; t < 400; t++) {
      const n = 1 + Math.floor(r() * 3);
      const docs: SourceDoc[] = Array.from({ length: n }, (_, i) => {
        const kind = pick(['in', 'out', 'undated', 'reversed', 'unparseable'] as const);
        const dates: [string | null, string | null] =
          kind === 'in' ? ['2025-03-01', '2025-03-31'] : kind === 'out' ? ['2024-03-01', '2024-03-31']
          : kind === 'undated' ? [null, null] : kind === 'reversed' ? ['2025-03-10', '2025-03-01'] : ['Mar 2025', '2025-03-31'];
        const status = pick(['confirmed', 'confirmed', 'rejected', 'extracted'] as const);
        // T10a: sometimes no figure could be read (value null), as with an unconverted unit.
        const value = r() < 0.15 ? null : 100;
        return { ...doc('utility_bill_gas', [gas(100, dates[0], dates[1], { status, value, unit: pick(['mcf', 'mcf', 'therms']) })], `d${i}`), file_name: `d${i}.pdf` };
      });
      const switchOn = r() < 0.75;
      // T10 ruling: sometimes an upload with nothing read from it sits beside the bills.
      const unread = r() < 0.3;
      if (unread) docs.push({ ...doc('utility_bill_gas', [], 'unread'), file_name: 'unread.pdf' });
      const l = loc({ has_natural_gas: switchOn, natural_gas_amount: 0, natural_gas_unit: 'mcf', source_docs: docs });
      const resolutions: CoverageResolution[] = r() < 0.2
        ? [res({ fuelType: 'natural_gas', kind: 'used_none', field: 'natural_gas_amount', by: { userId: 'u', email: 'e@x.example' } })] : [];
      const a = applyResolutions(l, resolutions, W(2025).start, W(2025).end).natural_gas_amount;
      const derived = a ? (a.mixedUnits ? 0 : a.value) : l.natural_gas_amount;
      // What reaches the total: nothing, when the switch is off.
      const figure = switchOn ? derived : 0;
      const confirmedBills = docs.some(d => d.extracted!.some(p => p.status === 'confirmed' && p.value != null));
      if (!switchOn && confirmedBills) {
        expect(issues(l, 2025, resolutions).some(i => i.status === 'stream_off'), `trial ${t}: switch off over confirmed bills`).toBe(true);
        seen.streamOff++;
      }
      // T10a: a confirmed proposal with no figure always blocks, naming its document.
      if (docs.some(d => d.extracted!.some(p => p.status === 'confirmed' && p.value == null))) {
        expect(issues(l, 2025, resolutions).some(i => i.status === 'no_value'), `trial ${t}: confirmed with no figure`).toBe(true);
        seen.noValue++;
      }
      // An unread upload for a fuel with no figure and no "used none" blocks; with a figure it is evidence.
      if (unread) {
        const blocksUnread = issues(l, 2025, resolutions).some(i => i.status === 'none');
        const hasUsedNone = resolutions.some(x => x.kind === 'used_none');
        expect(blocksUnread, `trial ${t}: unread upload, derived ${derived}, used none ${hasUsedNone}`).toBe(derived === 0 && !hasUsedNone);
        if (blocksUnread) seen.unread++;
      }
      if (figure > 0) continue;
      // A gap is left out: it would satisfy this in almost every trial and hide whether the
      // no-silent-zero issues themselves fire.
      const blocking = issues(l, 2025, resolutions).some(i => i.status !== 'gap');
      // An unconfirmed proposal blocks export through conciergePending, in the same conciergeReady gate
      // as the coverage issues (app/dashboard/ghg/page.tsx), so it counts as blocking here.
      const pending = docs.some(d => d.extracted!.some(p => p.status === 'extracted' || p.status === 'needs_manual_review'));
      const decided = billContributions(l, resolutions, W(2025)).filter(c => c.reason !== 'not_confirmed');
      const onlySilent = decided.length > 0 && decided.every(c => c.reason === 'outside_year' || c.reason === 'same_bill_as');
      const usedNone = resolutions.some(x => x.kind === 'used_none');
      if (blocking) seen.blocking++; else if (onlySilent) seen.silent++; else if (usedNone) seen.usedNone++;
      expect(blocking || pending || onlySilent || usedNone, `trial ${t}: ${JSON.stringify(decided.map(c => c.reason))}`).toBe(true);
    }
    // Each way out was actually reached, so the property is not passing vacuously.
    expect(seen.blocking).toBeGreaterThan(20); expect(seen.silent).toBeGreaterThan(5); expect(seen.usedNone).toBeGreaterThan(5);
    expect(seen.streamOff).toBeGreaterThan(20);
    expect(seen.unread).toBeGreaterThan(10);
    expect(seen.noValue).toBeGreaterThan(10);
  });
});

// ── T3a: the reporting-year label, built in one place from the window ─────────────────────────────────
// reporting_year is the calendar year in which the window ENDS (periodFromYearAndEnd: end = last day of the
// year-end month IN reporting_year), so FY2025 with a March year end is 1 Apr 2024 to 31 Mar 2025.
describe('T3a reportingYearLabel', () => {
  const label = (y: number, m: number) => reportingYearLabel(periodFromYearAndEnd(y, m));

  it('December year end: the bare year, and "reporting year {y}" in running text', () => {
    expect(label(2024, 12)).toEqual({ label: '2024', inText: 'reporting year 2024' });
  });

  it('any other year end: "the year ending {last day}", read off the window', () => {
    expect(label(2025, 3)).toEqual({ label: 'the year ending 31 March 2025', inText: 'the year ending 31 March 2025' });
    expect(label(2025, 6).inText).toBe('the year ending 30 June 2025');
    expect(label(2025, 1).inText).toBe('the year ending 31 January 2025');
  });

  it('February year end: 29 in a leap year, 28 otherwise', () => {
    expect(label(2024, 2).inText).toBe('the year ending 29 February 2024');
    expect(label(2025, 2).inText).toBe('the year ending 28 February 2025');
  });

  it('the proration note uses it: December and March year ends, with no em dash', () => {
    const dec = ngRow(buildWorkings([straddleGasLoc()], 'AR6', 2024, []))?.proration_note as string;
    expect(dec).toBe('20 December 2024 to 19 January 2025: 12 of 31 days in reporting year 2024, ×0.387');
    const mar = loc({ has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf',
      source_docs: [doc('utility_bill_gas', [prop({ periodStart: '2025-03-20', periodEnd: '2025-04-19' })])] });
    const note = ngRow(buildWorkings([mar], 'AR6', 2025, [], 3))?.proration_note as string;
    expect(note).toBe('20 March 2025 to 19 April 2025: 12 of 31 days in the year ending 31 March 2025, ×0.387');
    for (const n of [dec, note]) expect(n).not.toContain('\u2014');
  });

  it('source: the label is built only in reportingYearLabel (no FY${...}, no other "reporting year ${" or "year ending ${")', () => {
    const src = stripTsComments(readFileSync(join(__dirname, 'engine.ts'), 'utf8'));
    const start = src.indexOf('export function reportingYearLabel(');
    const helper = src.slice(start, src.indexOf('\n}\n', start));
    const rest = src.slice(0, start) + src.slice(start + helper.length);
    expect(helper).toMatch(/reporting year \$\{/);
    expect(helper).toMatch(/year ending \$\{/);
    expect(rest).not.toMatch(/FY\s?\$\{/);
    expect(rest).not.toMatch(/reporting year \$\{/);
    expect(rest).not.toMatch(/year ending \$\{/);
  });
});

// ── T4: deriveLocations, and totals equal workings by construction ──────────────────────────────────
// docs/review/design-derived-figures.md section 11 T4, and the T4 ruling in section 10: a field with a
// pending proposal is document-backed (0 until confirmed); an all-rejected field, or one with no
// proposals, keeps its stored value as the typed figure.
describe('T4 deriveLocations', () => {
  const gas = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'natural_gas', value, unit: 'mcf', periodStart, periodEnd, sourceQuote: `${value} mcf`, ...o });
  const gdoc = (id: string, p: ExtractedProposal) => doc('utility_bill_gas', [p], id);
  const inv = (locations: Location[], reporting_year = 2025, fiscal_year_end_month = 12, coverage_resolutions: CoverageResolution[] = []) =>
    ({ locations, reporting_year, fiscal_year_end_month, coverage_resolutions });
  const gasSite = (amount: number, docs: SourceDoc[], o: Partial<Location> = {}) =>
    loc({ has_natural_gas: true, natural_gas_amount: amount, natural_gas_unit: 'mcf', source_docs: docs, ...o });
  const derivedGas = (i: ReturnType<typeof inv>) => deriveLocations(i)[0].natural_gas_amount;

  it('a confirmed in-year bill is the figure, whatever the stored field says', () => {
    expect(derivedGas(inv([gasSite(0, [gdoc('a', gas(100, '2025-01-01', '2025-01-31'))])]))).toBe(100);
    expect(derivedGas(inv([gasSite(999, [gdoc('a', gas(100, '2025-01-01', '2025-01-31'))])]))).toBe(100);
  });

  describe('staleness regressions (design section 0)', () => {
    it('remove a document: the figure drops to the remaining bill, and so do the totals', () => {
      const jan = gdoc('jan', gas(100, '2025-01-01', '2025-01-31'));
      // The page wrote 200 when Jan and Feb were both confirmed; Feb was removed, and removeDoc does not
      // touch the field.
      const afterRemove = inv([gasSite(200, [jan])]);
      expect(derivedGas(afterRemove)).toBe(100);
      const derivedTotal = calcInventory(deriveLocations(afterRemove), 'AR6', 2025).s1_total;
      const oneBill = calcInventory([gasSite(100, [])], 'AR6', 2025).s1_total;
      expect(derivedTotal).toBeCloseTo(oneBill, 12);
      expect(calcInventory([gasSite(200, [jan])], 'AR6', 2025).s1_total, 'stored figure was stale').toBeCloseTo(2 * oneBill, 12);
    });

    it('un-confirm the last proposal: a pending proposal makes the field document-backed, so 0', () => {
      for (const status of ['extracted', 'needs_manual_review'] as const) {
        expect(derivedGas(inv([gasSite(100, [gdoc('a', gas(100, '2025-01-01', '2025-01-31', { status }))])])), status).toBe(0);
      }
    });

    it('change the reporting year: a bill outside the new year contributes nothing', () => {
      const site = gasSite(100, [gdoc('a', gas(100, '2024-03-01', '2024-03-31'))]); // written under 2024
      expect(derivedGas(inv([site], 2024))).toBe(100);
      expect(derivedGas(inv([site], 2025))).toBe(0);
    });

    it('change the year end: the window moves, and the figure with it', () => {
      const site = gasSite(100, [gdoc('a', gas(100, '2025-04-01', '2025-04-30'))]);
      expect(derivedGas(inv([site], 2025, 12))).toBe(100);
      expect(derivedGas(inv([site], 2025, 3)), 'Apr 2025 is outside 1 Apr 2024 to 31 Mar 2025').toBe(0);
      expect(derivedGas(inv([site], 2026, 3))).toBe(100);
    });
  });

  it('all rejected, or no proposals: the stored value stands as the typed figure (3.3, T3 ruling)', () => {
    expect(derivedGas(inv([gasSite(250, [gdoc('a', gas(100, '2025-01-01', '2025-01-31', { status: 'rejected' }))])]))).toBe(250);
    expect(derivedGas(inv([gasSite(250, [])]))).toBe(250);
  });

  it('a pending proposal with no value backs nothing (T1: no contribution row)', () => {
    expect(derivedGas(inv([gasSite(250, [gdoc('a', gas(0, '2025-01-01', '2025-01-31', { value: null, status: 'extracted' }))])]))).toBe(250);
  });

  it('mixed units: 0, unit unchanged, and the export-blocking issue says why', () => {
    const site = gasSite(300, [
      gdoc('m1', gas(100, '2025-01-01', '2025-01-31', { unit: 'mcf' })),
      gdoc('m2', gas(200, '2025-02-01', '2025-02-28', { unit: 'therms' })),
    ], { natural_gas_unit: 'therms' });
    const d = deriveLocations(inv([site]))[0];
    expect(d.natural_gas_amount).toBe(0);
    expect(d.natural_gas_unit).toBe('therms');
    expect(findUnresolvedCoverage([site], 2025, 12, []).some(i => i.status === 'mixed_units')).toBe(true);
  });

  // T10 ruling: since T7 a stored value is only ever typed, and a typed figure above 0 supersedes "used none".
  it('used none: 0 while nothing is typed; a typed figure supersedes it', () => {
    const usedNone: CoverageResolution = { locId: 'L1', fuelType: 'natural_gas', kind: 'used_none', field: 'natural_gas_amount',
      by: { userId: 'u', email: 'e@x.example' }, note: 'n', acknowledgedAt: '2026-01-01T00:00:00Z' } as CoverageResolution;
    const rejectedBill = [gdoc('a', gas(100, '2025-01-01', '2025-01-31', { status: 'rejected' }))];
    expect(derivedGas(inv([gasSite(0, rejectedBill)], 2025, 12, [usedNone]))).toBe(0);
    expect(derivedGas(inv([gasSite(300, rejectedBill)], 2025, 12, [usedNone]))).toBe(300);
  });

  it('the unit comes from the documents where the figure is derived', () => {
    const d = deriveLocations(inv([gasSite(0, [gdoc('a', gas(100, '2025-01-01', '2025-01-31'))], { natural_gas_unit: 'therms' })]))[0];
    expect(d.natural_gas_unit).toBe('mcf');
  });

  it('only document-backed fields change; typed fields and the input are untouched', () => {
    const site = gasSite(0, [gdoc('a', gas(100, '2025-01-01', '2025-01-31'))], { has_propane: true, propane_amount: 40, refrigerant_purchased_kg: 3 });
    const before = JSON.stringify(site);
    const d = deriveLocations(inv([site]))[0];
    expect(d.propane_amount).toBe(40);
    expect(d.refrigerant_purchased_kg).toBe(3);
    expect(JSON.stringify(site), 'input not mutated').toBe(before);
  });

  it('is idempotent: deriving derived locations changes nothing', () => {
    const i = inv([gasSite(999, [gdoc('a', gas(310, '2024-12-20', '2025-01-19')), gdoc('b', gas(100, '2025-02-01', '2025-02-28', { status: 'extracted' }))])]);
    const once = deriveLocations(i);
    expect(deriveLocations({ ...i, locations: once })).toEqual(once);
  });

  // Totals and workings both read the same derived locations, so they agree by construction. Rows are
  // mapped to totals the way calcLocation builds them: scope 1 → s1_total; scope 2 location-based →
  // s2_location; scope 2 market-based rows plus steam → s2_market; scope 3 → s3_td.
  describe('derived totals equal the sum of buildWorkings rows', () => {
    const elec = (value: number, periodStart: string, periodEnd: string, o: Partial<ExtractedProposal> = {}) =>
      prop({ fuelType: 'electricity', value, unit: 'kwh', periodStart, periodEnd, sourceQuote: `${value} kWh`, ...o });
    const fleet = (fuelType: 'gasoline' | 'diesel', value: number, o: Partial<ExtractedProposal> = {}) =>
      prop({ fuelType, value, unit: 'gallons', periodStart: '2025-03-01', periodEnd: '2025-03-31', sourceQuote: `${value} gal`, ...o });
    const extrap: CoverageResolution = { locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 2, pctEstimated: 83,
      note: '2 of 12', acknowledgedAt: '2026-01-01T00:00:00Z' };
    const fixtures: [string, ReturnType<typeof inv>][] = [
      ['in-year gas', inv([gasSite(0, [gdoc('a', gas(100, '2025-01-01', '2025-01-31'))])])],
      ['stale stored gas after a removal', inv([gasSite(500, [gdoc('a', gas(100, '2025-01-01', '2025-01-31'))])])],
      ['straddling bill, prorated', inv([gasSite(310, [gdoc('a', gas(310, '2024-12-20', '2025-01-19'))])])],
      ['out-of-year bill', inv([gasSite(100, [gdoc('a', gas(100, '2024-03-01', '2024-03-31'))])])],
      ['extrapolated gas', inv([gasSite(0, [gdoc('a', gas(100, '2025-01-01', '2025-01-31')), gdoc('b', gas(100, '2025-02-01', '2025-02-28'))])], 2025, 12, [extrap])],
      ['pending only, stale stored', inv([gasSite(100, [gdoc('a', gas(100, '2025-01-01', '2025-01-31', { status: 'extracted' }))])])],
      ['all rejected, typed figure', inv([gasSite(250, [gdoc('a', gas(100, '2025-01-01', '2025-01-31', { status: 'rejected' }))])])],
      ['mixed units', inv([gasSite(300, [gdoc('m1', gas(100, '2025-01-01', '2025-01-31')), gdoc('m2', gas(200, '2025-02-01', '2025-02-28', { unit: 'therms' }))])])],
      ['March year end', inv([gasSite(0, [gdoc('a', gas(100, '2024-04-01', '2024-04-30')), gdoc('b', gas(100, '2025-04-01', '2025-04-30'))])], 2025, 3)],
      ['electricity, market-based and gas together', inv([loc({ has_natural_gas: true, natural_gas_amount: 0, grid_region: 'US_CA', electricity_kwh: 7,
        renewable_electricity_kwh: 1000, source_docs: [
          gdoc('g', gas(100, '2025-01-01', '2025-01-31')),
          doc('utility_electricity', [elec(5000, '2025-01-01', '2025-01-31')], 'e1'),
          doc('utility_electricity', [elec(6000, '2024-11-01', '2024-11-30')], 'e2'),
        ] })])],
      ['fleet fuel, typed propane and refrigerant', inv([loc({ has_mobile: true, gasoline_amount: 9, has_propane: true, propane_amount: 40,
        has_hfc_refrigerants: true, refrigerant_purchased_kg: 2, source_docs: [doc('fleet_fuel', [fleet('gasoline', 50), fleet('diesel', 20)], 'f')] })])],
      ['NZ with T&D losses', inv([loc({ country: 'NZ', grid_region: 'NZ', nz_td_losses: true, electricity_kwh: 1,
        source_docs: [doc('utility_electricity', [elec(10_000, '2025-01-01', '2025-01-31')], 'nz')] })])],
    ];

    for (const [label, i] of fixtures) {
      it(label, () => {
        const derived = deriveLocations(i);
        const t = calcInventory(derived, 'AR6', i.reporting_year);
        type Row = { scope?: number; scope2_method?: string; stream?: string; result_tco2e?: number | null };
        const rows = buildWorkings(derived, 'AR6', i.reporting_year, i.coverage_resolutions, i.fiscal_year_end_month) as Row[];
        const sum = (f: (r: Row) => boolean) => rows.filter(r => typeof r.result_tco2e === 'number' && f(r)).reduce((a, r) => a + (r.result_tco2e as number), 0);
        expect(sum(r => r.scope === 1), `${label}: s1`).toBeCloseTo(t.s1_total, 9);
        expect(sum(r => r.scope === 2 && r.scope2_method !== 'market-based'), `${label}: s2 location`).toBeCloseTo(t.s2_location, 9);
        expect(sum(r => r.scope === 2 && (r.scope2_method === 'market-based' || r.stream === 'purchased_steam')), `${label}: s2 market`).toBeCloseTo(t.s2_market, 9);
        expect(sum(r => r.scope === 3), `${label}: s3`).toBeCloseTo(t.s3_td, 9);
      });
    }

    it('the fixtures are not vacuous: most price something, and the stale ones differ from stored', () => {
      const priced = fixtures.filter(([, i]) => { const t = calcInventory(deriveLocations(i), 'AR6', i.reporting_year); return t.s1_total + t.s2_location > 0; });
      expect(priced.length).toBeGreaterThanOrEqual(fixtures.length - 3);
      for (const label of ['stale stored gas after a removal', 'out-of-year bill', 'pending only, stale stored']) {
        const i = fixtures.find(([l]) => l === label)![1];
        expect(calcInventory(deriveLocations(i), 'AR6', 2025).s1_total, label).not.toBeCloseTo(calcInventory(i.locations, 'AR6', 2025).s1_total, 6);
      }
    });
  });

  it('pctEstimated derives the locations itself (T5): stale stored figures give the same share as derived', () => {
    const extrap: CoverageResolution = { locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 6, pctEstimated: 50,
      note: '6 of 12', acknowledgedAt: '2026-01-01T00:00:00Z' };
    const months = Array.from({ length: 6 }, (_, k) => gdoc(`m${k}`, gas(100, `2025-0${k + 1}-01`, `2025-0${k + 1}-${new Date(2025, k + 1, 0).getDate()}`)));
    const i = inv([gasSite(0, months)], 2025, 12, [extrap]); // stored 0: the page never wrote it
    expect(pctEstimated(i, 'AR6')).toBeCloseTo(50, 9);
    expect(pctEstimated({ ...i, locations: deriveLocations(i) }, 'AR6')).toBeCloseTo(50, 9);
  });

  it('unpriced lines are judged on the derived figure: a stale stored figure no document supports is not priced', () => {
    // An unpriceable unit on a stale field: stored says 100 m3-on-a-NZ-site, but the only bill is pending.
    // FI1: the judgement is now per line (unpricedLines), not a whole-location exclusion; the property holds.
    const site = gasSite(100, [gdoc('a', gas(100, '2025-01-01', '2025-01-31', { status: 'extracted' }))], { country: 'NZ', natural_gas_unit: 'm3' });
    expect(unpricedLines(site), 'stored: an unpriced line on a figure nothing supports').toHaveLength(1);
    expect(unpricedLines(deriveLocations(inv([site]))[0])).toEqual([]);
    // findUnresolvedCoverage derives first, so it does not block on the stale figure either.
    expect(findUnresolvedCoverage([site], 2025, 12, []).filter(i => i.status === 'factor_missing')).toEqual([]);
  });
});

// ── T5: contributions on workings rows, no stale fallback, zero rows, documentType, pctEstimated ────
// docs/review/design-derived-figures.md section 11 T5 and the T5 rulings in section 10.
describe('T5 workings rows carry their contributions', () => {
  const gas = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'natural_gas', value, unit: 'mcf', periodStart, periodEnd, sourceQuote: `${value} mcf`, ...o });
  const gdoc = (id: string, p: ExtractedProposal, meter?: string): SourceDoc =>
    ({ ...doc('utility_bill_gas', [p], id), ...(meter ? { meter_label: meter } : {}) });
  const gasSite = (amount: number, docs: SourceDoc[], o: Partial<Location> = {}) =>
    loc({ has_natural_gas: true, natural_gas_amount: amount, natural_gas_unit: 'mcf', source_docs: docs, ...o });
  type Row = { stream?: string; source?: string; scope?: number; activity_data?: number; result_tco2e?: number | null; entry_method?: string;
    declaration?: string; note?: string; contributions?: BillContribution[]; gwp_basis?: string; source_doc_ids?: string[] };
  const rowsOf = (locs: Location[], y = 2025, res: CoverageResolution[] = [], m = 12) => buildWorkings(locs, 'AR6', y, res, m) as Row[];
  const gasRow = (rows: Row[]) => rows.find(r => r.stream === 'natural_gas');
  const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
  const month = (y: number, m: number) => [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${lastDay(y, m)}`] as const;

  it('each document-backed row carries every bill for its field, counted or not, with the reason', () => {
    const rows = rowsOf([gasSite(0, [gdoc('in', gas(100, ...month(2025, 1))), gdoc('old', gas(70, ...month(2024, 3)))])]);
    expect(gasRow(rows)?.contributions?.map(c => [c.docId, c.counted, c.reason])).toEqual([['in', true, 'counted'], ['old', false, 'outside_year']]);
  });

  it('a same-bill exclusion is present with its reason and the document it duplicates', () => {
    const res: CoverageResolution = { locId: 'L1', fuelType: 'natural_gas', kind: 'same_bill', countedDocId: 'a', excludedDocIds: ['b'],
      note: 'n', acknowledgedAt: '2026-01-01T00:00:00Z' };
    const rows = rowsOf([gasSite(0, [gdoc('a', gas(100, ...month(2025, 1))), gdoc('b', gas(100, ...month(2025, 1)))])], 2025, [res]);
    expect(gasRow(rows)?.contributions?.find(c => c.docId === 'b')).toMatchObject({ counted: false, reason: 'same_bill_as', reasonRef: 'a' });
    expect(gasRow(rows)?.activity_data).toBe(100);
  });

  it('a typed figure over all-rejected documents is manual, and still lists the rejected documents', () => {
    const r = gasRow(rowsOf([gasSite(250, [gdoc('x', gas(100, ...month(2025, 1), { status: 'rejected' }))])]));
    expect(r?.entry_method).toBe('manual');
    expect(r?.activity_data).toBe(250);
    expect(r?.contributions?.map(c => c.reason)).toEqual(['not_confirmed']);
  });

  it("entry_method is never 'manual' for a field with confirmed documents, even with no source quote", () => {
    const r = gasRow(rowsOf([gasSite(0, [gdoc('a', gas(100, ...month(2025, 1), { sourceQuote: null }))])]));
    expect(r?.entry_method).toBe('concierge');
    expect(r?.source_doc_ids).toEqual(['a']);
  });

  it('no stale-field fallback: stored locations give the derived figure, not the stored one', () => {
    const stale = gasSite(999, [gdoc('a', gas(100, ...month(2025, 1)))]);
    expect(gasRow(rowsOf([stale]))?.activity_data).toBe(100);
    const pendingOnly = gasSite(999, [gdoc('a', gas(100, ...month(2025, 1), { status: 'extracted' }))]);
    expect(gasRow(rowsOf([pendingOnly]))?.declaration, 'pending only: derived 0, so declared, not priced').toBe('declared_unquantified');
  });

  describe('all-excluded field: zero row', () => {
    it('every confirmed bill outside the year: one zero row with the contributions, and the declaration still shows', () => {
      const rows = rowsOf([gasSite(170, [gdoc('o1', gas(100, ...month(2024, 3))), gdoc('o2', gas(70, ...month(2024, 4)))])]);
      const z = rows.filter(r => r.gwp_basis === 'all_bills_excluded');
      expect(z).toHaveLength(1);
      expect(z[0]).toMatchObject({ source: 'Natural gas', scope: 1, activity_data: 0, result_tco2e: 0, entry_method: 'concierge' });
      expect(z[0].stream, 'untagged, so it does not count as priced').toBeUndefined();
      expect(z[0].contributions?.map(c => c.reason)).toEqual(['outside_year', 'outside_year']);
      expect(z[0].note).toBe('No bill is counted for this line: each confirmed bill is outside reporting year 2025 or is the same bill as another document.');
      expect(rows.find(r => r.stream === 'natural_gas')?.declaration).toBe('declared_unquantified');
    });

    it('a non-December year names the year by its end', () => {
      const rows = rowsOf([gasSite(0, [gdoc('o', gas(100, ...month(2025, 6)))])], 2025, [], 3);
      expect(rows.find(r => r.gwp_basis === 'all_bills_excluded')?.note).toContain('the year ending 31 March 2025');
    });

    it('electricity gets a zero row too, with no em dash in its note', () => {
      const site = loc({ grid_region: 'US_CA', electricity_kwh: 900, source_docs: [doc('utility_electricity',
        [prop({ fuelType: 'electricity', value: 900, unit: 'kwh', periodStart: '2024-05-01', periodEnd: '2024-05-31' })], 'e')] });
      const z = rowsOf([site]).find(r => r.gwp_basis === 'all_bills_excluded');
      expect(z).toMatchObject({ source: 'Electricity', scope: 2, result_tco2e: 0 });
      expect(z?.note).not.toContain('—');
    });

    it('no zero row when any bill counts, when the field is blocked (mixed, undated), or when nothing is confirmed', () => {
      const cases: Location[] = [
        gasSite(0, [gdoc('in', gas(100, ...month(2025, 1))), gdoc('o', gas(100, ...month(2024, 3)))]),
        gasSite(0, [gdoc('a', gas(100, ...month(2024, 3))), gdoc('b', gas(100, ...month(2025, 2), { unit: 'therms' }))]),
        gasSite(0, [gdoc('u', gas(100, null, null))]),
        gasSite(0, [gdoc('p', gas(100, ...month(2024, 3), { status: 'extracted' }))]),
      ];
      for (const [k, c] of cases.entries()) expect(rowsOf([c]).filter(r => r.gwp_basis === 'all_bills_excluded'), `case ${k}`).toEqual([]);
    });

    it('zero rows add nothing: totals still equal the sum of the rows', () => {
      const i = { locations: [gasSite(170, [gdoc('o1', gas(100, ...month(2024, 3)))])], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: [] };
      const rows = rowsOf(i.locations);
      const s1 = rows.filter(r => r.scope === 1 && typeof r.result_tco2e === 'number').reduce((a, r) => a + (r.result_tco2e as number), 0);
      expect(s1).toBe(calcInventory(deriveLocations(i), 'AR6', 2025).s1_total);
    });
  });

  describe('share cell', () => {
    const cell = (reason: string, inWindowDays: number | null, totalDays: number | null, share: number | null) =>
      contributionShareCell({ reason, inWindowDays, totalDays, share });
    it('prorated, counted, excluded and undated bills', () => {
      expect(cell('prorated', 12, 31, 12 / 31)).toBe('12 of 31 days, ×0.387');
      expect(cell('counted', 31, 31, 1)).toBe('31 of 31 days');
      for (const r of ['outside_year', 'same_bill_as', 'not_confirmed', 'mixed_units']) expect(cell(r, 0, 31, 0), r).toBe('Not counted');
      expect(cell('undated', null, null, null)).toBe('Not applicable');
      expect(cell('invalid_period', null, null, null)).toBe('Not applicable');
    });
    it('reads the stored contributions on a real row, matching the proration note', () => {
      const r = gasRow(rowsOf([gasSite(0, [gdoc('s', gas(310, '2024-12-20', '2025-01-19'))])], 2025)) as Row & { proration_note?: string };
      const c = r.contributions![0];
      expect(contributionShareCell(c)).toBe('19 of 31 days, ×0.613');
      expect(r.proration_note).toContain('19 of 31 days in reporting year 2025, ×0.613');
    });
  });
});

describe('T5 gap estimates name their document type', () => {
  const months = (docType: string, fuelType: string, unit: string, n: number, prefix: string) => Array.from({ length: n }, (_, k) => {
    const m = String(k + 1).padStart(2, '0');
    return doc(docType, [prop({ fuelType, value: 10, unit, periodStart: `2025-${m}-01`, periodEnd: `2025-${m}-${new Date(2025, k + 1, 0).getDate()}`, sourceQuote: '10 gal' })], `${prefix}${k}`);
  });
  const est = (o: Partial<CoverageResolution> = {}): CoverageResolution =>
    ({ locId: 'L1', fuelType: 'diesel', kind: 'extrapolate', monthsCovered: 6, pctEstimated: 50, note: '6 of 12', acknowledgedAt: '2026-01-01T00:00:00Z', ...o } as CoverageResolution);
  // Stationary diesel: 6 months. Fleet diesel: 6 months (for the gap tests) or 12 (for pctEstimated).
  const site = (fleetMonths: number) => loc({ has_diesel_stationary: true, diesel_stationary_unit: 'gallons', has_mobile: true, diesel_mobile_unit: 'gallons',
    source_docs: [...months('fuel_diesel', 'diesel', 'gallons', 6, 's'), ...months('fleet_fuel', 'diesel', 'gallons', fleetMonths, 'f')] });
  const W = periodFromYearAndEnd(2025, 12);
  const gaps = (l: Location, r: CoverageResolution[]) => findUnresolvedCoverage([l], 2025, 12, r).filter(i => i.status === 'gap');

  it('an estimate without documentType is not accepted where the fuel has two document types', () => {
    expect(validateResolution(est(), site(6))).toBe('Choose which documents this estimate covers.');
    expect(gaps(site(6), [est()])).toHaveLength(2);
    const a = applyResolutions(site(6), [est()], W.start, W.end);
    expect([a.diesel_stationary_amount.value, a.diesel_mobile_amount.value]).toEqual([60, 60]);
  });

  it('an estimate naming fuel_diesel grosses up and clears stationary diesel only', () => {
    const r = est({ documentType: 'fuel_diesel' });
    expect(validateResolution(r, site(6))).toBeNull();
    const a = applyResolutions(site(6), [r], W.start, W.end);
    expect([a.diesel_stationary_amount.value, a.diesel_mobile_amount.value]).toEqual([120, 60]);
    expect(gaps(site(6), [r])).toHaveLength(1);
  });

  it('a document type not on the site is not accepted', () => {
    expect(validateResolution(est({ documentType: 'utility_bill_gas' }), site(6))).toBe('The estimate names documents that are not on this site.');
  });

  it('a stored estimate without documentType still applies where the fuel has one document type', () => {
    const gasOnly = loc({ has_natural_gas: true, source_docs: months('utility_bill_gas', 'natural_gas', 'mcf', 6, 'g') });
    const r = est({ fuelType: 'natural_gas' });
    expect(validateResolution(r, gasOnly)).toBeNull();
    expect(applyResolutions(gasOnly, [r], W.start, W.end).natural_gas_amount.value).toBe(120);
  });

  it('pctEstimated keeps stationary and fleet diesel apart: an estimate on one does not count the other', () => {
    const l = site(12);
    const r = est({ documentType: 'fuel_diesel' });
    const d = deriveLocations({ locations: [l], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: [r] })[0];
    expect([d.diesel_stationary_amount, d.diesel_mobile_amount]).toEqual([120, 120]);
    const es = calcInventory([loc({ has_diesel_stationary: true, diesel_stationary_amount: 120, diesel_stationary_unit: 'gallons' })], 'AR6', 2025).s1_total;
    const ef = calcInventory([loc({ has_mobile: true, diesel_mobile_amount: 120, diesel_mobile_unit: 'gallons' })], 'AR6', 2025).s1_total;
    const pct = pctEstimated({ locations: [l], reporting_year: 2025, coverage_resolutions: [r] }, 'AR6');
    expect(pct).toBeCloseTo(0.5 * es / (es + ef) * 100, 9);
    expect(pct, 'not half of both diesel streams').not.toBeCloseTo(50, 1);
  });
});

describe('T5 pctEstimated applies each gross-up to its own meter only', () => {
  it('two gas meters, only meter B estimated: the share counts B\'s gross-up, not the whole fuel', () => {
    const bill = (k: number, meter?: string) => {
      const m = String(k).padStart(2, '0');
      return { ...doc('utility_bill_gas', [prop({ fuelType: 'natural_gas', value: 100, unit: 'mcf', periodStart: `2025-${m}-01`,
        periodEnd: `2025-${m}-${new Date(2025, k, 0).getDate()}` })], `${meter ?? 'A'}${k}`), ...(meter ? { meter_label: meter } : {}) };
    };
    const l = loc({ has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: [
      ...Array.from({ length: 12 }, (_, k) => bill(k + 1)), ...Array.from({ length: 6 }, (_, k) => bill(k + 1, 'B'))] });
    const r: CoverageResolution = { locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 6, pctEstimated: 50,
      meterLabel: 'B', note: '6 of 12', acknowledgedAt: '2026-01-01T00:00:00Z' };
    const inv = { locations: [l], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: [r] };
    expect(deriveLocations(inv)[0].natural_gas_amount).toBe(2400);
    // Evidenced 1,800 of 2,400 (A 1,200 + B 600); B's gross-up is 600, a quarter of the figure.
    expect(pctEstimated(inv, 'AR6')).toBeCloseTo(25, 9);
  });
});

// ── T6: monthly reads counted contributions, in-window only; reconcile by location and fuel ─────────
// docs/review/design-derived-figures.md section 6 and section 11 T6.
describe('T6 monthly split', () => {
  const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion };
  const gas = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'natural_gas', value, unit: 'mcf', periodStart, periodEnd, sourceQuote: `${value} mcf`, ...o });
  const elec = (value: number, periodStart: string, periodEnd: string) =>
    prop({ fuelType: 'electricity', value, unit: 'kwh', periodStart, periodEnd, sourceQuote: `${value} kWh` });
  const gdoc = (id: string, p: ExtractedProposal) => doc('utility_bill_gas', [p], id);
  const site = (docs: SourceDoc[], o: Partial<Location> = {}) => loc({ has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: docs, ...o });
  const inv = (locations: Location[], reporting_year: number, fiscal_year_end_month = 12, coverage_resolutions: CoverageResolution[] = []) =>
    ({ locations, reporting_year, fiscal_year_end_month, coverage_resolutions });
  const sum = (xs: MonthlySlice[], f: (s: MonthlySlice) => number) => xs.reduce((a, s) => a + f(s), 0);
  const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
  const month = (y: number, m: number) => [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${lastDay(y, m)}`] as const;
  // Scenario A (docs/review/recalc/scenarios-additions.md): "Dec 1, 2025 – Jan 1, 2026" and "Jan 1, 2026 – Feb 1, 2026".
  const scenarioA = () => site([gdoc('bill1', gas(310, '2025-12-01', '2026-01-01')), gdoc('bill2', gas(280, '2026-01-01', '2026-02-01'))]);

  it('Scenario A, FY2025: writes only December 2025, from Bill 1; Bill 2 writes nothing', () => {
    const { slices, skipped } = buildMonthlyEmissions(inv([scenarioA()], 2025), deps, 'AR6');
    expect(slices.map(s => [s.period_month, s.activity_value, s.reporting_year])).toEqual([['2025-12-01', 310, 2025]]);
    expect(skipped).toContainEqual({ fuelType: 'natural_gas', document_type: 'utility_bill_gas', reason: 'not counted: outside_year' });
  });

  it('Scenario A, FY2026: writes only January 2026, from Bill 2', () => {
    const { slices } = buildMonthlyEmissions(inv([scenarioA()], 2026), deps, 'AR6');
    expect(slices.map(s => [s.period_month, s.activity_value])).toEqual([['2026-01-01', 280]]);
  });

  it('a straddling bill writes only its in-window days, each month a fraction of the whole bill', () => {
    const { slices } = buildMonthlyEmissions(inv([site([gdoc('s', gas(310, '2024-12-20', '2025-01-19'))])], 2025), deps, 'AR6');
    expect(slices.map(s => s.period_month)).toEqual(['2025-01-01']);
    expect(slices[0].activity_value).toBeCloseTo(310 * 19 / 31, 6);
    expect(slices[0].pct_in_month).toBeCloseTo(19 / 31, 6);
  });

  it('a March year end splits over its own window: a bill across 31 March writes only March', () => {
    const { slices } = buildMonthlyEmissions(inv([site([gdoc('m', gas(310, '2025-03-15', '2025-04-14'))])], 2025, 3), deps, 'AR6');
    expect(slices.map(s => [s.period_month, s.reporting_year])).toEqual([['2025-03-01', 2025]]);
    expect(slices[0].activity_value).toBeCloseTo(310 * 17 / 31, 6);
  });

  it('uncounted bills write nothing and are reported: same bill, mixed units, undated; pending is silent', () => {
    const same: CoverageResolution = { locId: 'L1', fuelType: 'natural_gas', kind: 'same_bill', countedDocId: 'a', excludedDocIds: ['b'],
      note: 'n', acknowledgedAt: '2026-01-01T00:00:00Z' };
    const r1 = buildMonthlyEmissions(inv([site([gdoc('a', gas(100, ...month(2025, 1))), gdoc('b', gas(100, ...month(2025, 1)))])], 2025, 12, [same]), deps, 'AR6');
    expect(sum(r1.slices, s => s.activity_value as number), 'counted once').toBeCloseTo(100, 6);
    expect(r1.skipped.map(k => k.reason)).toEqual(['not counted: same_bill_as']);
    const r2 = buildMonthlyEmissions(inv([site([gdoc('a', gas(100, ...month(2025, 1))), gdoc('b', gas(100, ...month(2025, 2), { unit: 'therms' }))])], 2025), deps, 'AR6');
    expect(r2.slices).toEqual([]);
    expect(r2.skipped.map(k => k.reason)).toEqual(['not counted: mixed_units', 'not counted: mixed_units']);
    const r3 = buildMonthlyEmissions(inv([site([gdoc('u', gas(100, null, null)), gdoc('p', gas(100, ...month(2025, 1), { status: 'extracted' }))])], 2025), deps, 'AR6');
    expect(r3.slices).toEqual([]);
    expect(r3.skipped.map(k => k.reason)).toEqual(['not counted: undated']);
  });

  it('an unpriced line writes no monthly row, and the bill is skipped by name (FI1)', () => {
    // WAS "a location the totals exclude as unpriceable writes no monthly row". FI1 keeps the location;
    // the unpriced bill still writes nothing, and lands in skipped with the line's own reason (FI1 diff 2).
    const blocked = site([gdoc('a', gas(100, ...month(2025, 1), { unit: 'm3' }))], { id: 'B', name: 'Blocked', natural_gas_unit: 'm3', country: 'NZ' });
    const r = buildMonthlyEmissions(inv([blocked], 2025), deps, 'AR6');
    expect(findUnpriceableLocations(deriveLocations(inv([blocked], 2025)), 'AR6', 2025)).toEqual([]);
    expect(unpricedLines(deriveLocations(inv([blocked], 2025))[0]).map(u => u.reason)).toEqual(['factor_missing']);
    expect(r.slices).toEqual([]);
    expect(r.skipped).toContainEqual({ fuelType: 'natural_gas', document_type: 'utility_bill_gas', reason: 'factor_missing' });
    expect(r.skipped.some(x => x.reason.startsWith('cannot price'))).toBe(false);
  });

  it('slices carry their location id, for matching by location', () => {
    const { slices } = buildMonthlyEmissions(inv([site([gdoc('a', gas(100, ...month(2025, 1)))], { id: 'site-7' })], 2025), deps, 'AR6');
    expect(slices.every(s => s.location_id === 'site-7')).toBe(true);
  });

  describe('the identity: Σ slices = Σ counted contributions = annual before the gross-up', () => {
    const extrap = (o: Partial<CoverageResolution> = {}): CoverageResolution => ({ locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate',
      monthsCovered: 6, pctEstimated: 50, note: '6 of 12', acknowledgedAt: '2026-01-01T00:00:00Z', ...o });
    const halfYear = () => site(Array.from({ length: 6 }, (_, k) => gdoc(`m${k}`, gas(100, ...month(2025, k + 1)))));

    it('six months evidenced, grossed up ×12/6: slices hold the six, never the gross-up', () => {
      const i = inv([halfYear()], 2025, 12, [extrap()]);
      const { slices } = buildMonthlyEmissions(i, deps, 'AR6');
      expect(deriveLocations(i)[0].natural_gas_amount, 'annual is grossed up').toBe(1200);
      expect(sum(slices, s => s.activity_value as number), 'monthly is not').toBeCloseTo(600, 6);
      const [f] = emissionsByLocationField(i, 'AR6');
      expect(sum(slices, s => s.tco2e)).toBeCloseTo(f.annual - f.estimated, 4);
      expect(new Set(slices.map(s => s.period_month)).size).toBe(6);
    });

    it('Σ slice activity equals Σ counted contributions, bill by bill, including a prorated one', () => {
      const l = site([gdoc('s', gas(310, '2024-12-20', '2025-01-19')), gdoc('f', gas(280, ...month(2025, 2))), gdoc('o', gas(90, ...month(2024, 6)))]);
      const counted = billContributions(l, [], periodFromYearAndEnd(2025, 12)).filter(c => c.counted);
      const { slices } = buildMonthlyEmissions(inv([l], 2025), deps, 'AR6');
      expect(sum(slices, s => s.activity_value as number)).toBeCloseTo(counted.reduce((a, c) => a + c.value * (c.share ?? 0), 0), 6);
    });

    it('guard: the monthly split never reads a gap estimate or an annual figure', () => {
      const src = stripTsComments(readFileSync(join(__dirname, 'monthlyEmissions.ts'), 'utf8'));
      const start = src.indexOf('export function buildMonthlyEmissions(');
      const body = src.slice(start, src.indexOf('\n}\n', start));
      for (const banned of ['monthsCovered', 'extrapolate', 'applyResolutions', 'emissionsByLocationField', 'pctEstimated', '_amount', 'electricity_kwh']) {
        expect(body, banned).not.toContain(banned);
      }
    });
  });

  describe('reconcile by location and fuel', () => {
    const report = (i: ReturnType<typeof inv>) => reconcile(buildMonthlyEmissions(i, deps, 'AR6').slices, i, 'AR6');

    it('Scenario A reconciles with delta 0 in FY2025 and FY2026', () => {
      for (const y of [2025, 2026]) {
        const r = report(inv([scenarioA()], y));
        expect(r.reconciles, `FY${y}`).toBe(true);
        expect(r.unexplained_delta, `FY${y}`).toBe(0);
        expect(r.months_evidenced, `FY${y}`).toBe(1);
      }
    });

    it('two sites, gas and electricity, one extrapolated: every group reconciles, delta 0', () => {
      const a = site(Array.from({ length: 6 }, (_, k) => gdoc(`a${k}`, gas(100, ...month(2025, k + 1)))), { id: 'A', name: 'Site A', grid_region: 'US_CA' });
      a.source_docs.push(doc('utility_electricity', [elec(5000, '2025-01-01', '2025-12-31')], 'ae'));
      const b = site([gdoc('b1', gas(310, '2024-12-20', '2025-01-19')), gdoc('b2', gas(400, '2025-01-20', '2025-12-31'))], { id: 'B', name: 'Site B' });
      const ex: CoverageResolution = { locId: 'A', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 6, pctEstimated: 50, note: '6 of 12', acknowledgedAt: '2026-01-01T00:00:00Z' };
      const r = report(inv([a, b], 2025, 12, [ex]));
      expect(r.groups.map(g => [g.location_id, g.fuel_type])).toEqual([['A', 'natural_gas'], ['A', 'electricity'], ['B', 'natural_gas']]);
      expect(r.groups.every(g => g.unexplained === 0)).toBe(true);
      expect(r.reconciles).toBe(true);
      expect(r.unexplained_delta).toBe(0);
      expect(r.groups.find(g => g.location_id === 'A' && g.fuel_type === 'natural_gas')!.estimated).toBeGreaterThan(0);
    });

    it('a March year end reconciles over its own window', () => {
      const r = report(inv([site([gdoc('x', gas(310, '2025-03-15', '2025-04-14')), gdoc('y', gas(100, '2024-04-01', '2024-04-30'))])], 2025, 3));
      expect(r.reconciles).toBe(true);
      expect(r.unexplained_delta).toBe(0);
    });

    it('typed figures with no counted bill are not compared (no monthly basis)', () => {
      const r = report(inv([site([gdoc('a', gas(100, ...month(2025, 1)))], { has_propane: true, propane_amount: 500 })], 2025));
      expect(r.groups.map(g => g.fuel_type)).toEqual(['natural_gas']);
      expect(r.reconciles).toBe(true);
    });

    it('slices for a location that has no counted bill do not reconcile (compared against 0)', () => {
      const withBill = inv([site([gdoc('a', gas(100, ...month(2025, 1)))])], 2025);
      const without = inv([site([])], 2025);
      const r = reconcile(buildMonthlyEmissions(withBill, deps, 'AR6').slices, without, 'AR6');
      expect(r.reconciles).toBe(false);
    });
  });
});

// ── T6 ruling: confirmed bills under a "uses this fuel" switch that is off ─────────────────────────────
describe('T6 stream_off: a switched-off field with confirmed bills is never silently dropped', () => {
  const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion };
  const lastDay = (m: number) => new Date(2025, m, 0).getDate();
  const bill = (k: number, o: Partial<ExtractedProposal> = {}) => doc('utility_bill_gas', [prop({ fuelType: 'natural_gas', value: 100, unit: 'mcf',
    periodStart: `2025-${String(k).padStart(2, '0')}-01`, periodEnd: `2025-${String(k).padStart(2, '0')}-${lastDay(k)}`, ...o })], `g${k}`);
  const siteA = (hasGas: boolean, o: Partial<ExtractedProposal> = {}) =>
    loc({ name: 'Site A', has_natural_gas: hasGas, natural_gas_unit: 'mcf', source_docs: [bill(1, o), bill(2, o), bill(3, o)] });
  const inv = (l: Location) => ({ locations: [l], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: [] });
  const offIssues = (l: Location) => findUnresolvedCoverage([l], 2025, 12, []).filter(i => i.status === 'stream_off');

  it('raises an issue naming the site, the fuel and the number of confirmed bills', () => {
    expect(offIssues(siteA(false))).toEqual([{ locId: 'L1', fuelType: 'natural_gas', status: 'stream_off', docIds: ['g1', 'g2', 'g3'],
      message: 'Site A is marked as not using natural gas, but 3 natural gas bills are confirmed. Turn natural gas on for this site, or reject the bills.' }]);
  });

  it('it is in the export-blocking list (conciergeReady requires that list to be empty)', () => {
    expect(findUnresolvedCoverage([siteA(false)], 2025, 12, []).length).toBeGreaterThan(0);
  });

  it('singular wording for one bill, and a vehicle stream uses its own verb', () => {
    const one = loc({ name: 'Depot', has_natural_gas: false, source_docs: [bill(1)] });
    expect(offIssues(one)[0].message).toBe('Depot is marked as not using natural gas, but 1 natural gas bill is confirmed. Turn natural gas on for this site, or reject the bill.');
    const fleet = loc({ name: 'Depot', has_mobile: false, source_docs: [doc('fleet_fuel', [prop({ fuelType: 'gasoline', value: 50, unit: 'gallons',
      periodStart: '2025-01-01', periodEnd: '2025-01-31' })], 'f')] });
    expect(offIssues(fleet)[0].message).toBe('Depot is marked as not having company vehicles or mobile equipment, but 1 gasoline bill is confirmed. Turn company vehicles or mobile equipment on for this site, or reject the bill.');
  });

  it('cleared by turning the switch on, or by rejecting the bills', () => {
    expect(offIssues(siteA(true))).toEqual([]);
    expect(offIssues(siteA(false, { status: 'rejected' }))).toEqual([]);
  });

  it('electricity has no switch and never raises it', () => {
    const l = loc({ grid_region: 'US_CA', source_docs: [doc('utility_electricity', [prop({ fuelType: 'electricity', value: 900, unit: 'kwh',
      periodStart: '2025-01-01', periodEnd: '2025-01-31' })], 'e')] });
    expect(offIssues(l)).toEqual([]);
  });

  it('the monthly split writes nothing for the field and reports stream_off, matching the annual figure', () => {
    const { slices, skipped } = buildMonthlyEmissions(inv(siteA(false)), deps, 'AR6');
    expect(slices).toEqual([]);
    expect(skipped.map(k => k.reason)).toEqual(['stream_off', 'stream_off', 'stream_off']);
    expect(calcInventory(deriveLocations(inv(siteA(false))), 'AR6', 2025).s1_total).toBe(0);
  });

  it('reconcile reports zero with the switch off, and with it on', () => {
    for (const on of [false, true]) {
      const i = inv(siteA(on));
      const r = reconcile(buildMonthlyEmissions(i, deps, 'AR6').slices, i, 'AR6');
      expect(r.reconciles, `switch ${on}`).toBe(true);
      expect(r.unexplained_delta, `switch ${on}`).toBe(0);
    }
  });
});

// ── T7: documentsBacking and deriveStoredLocations ───────────────────────────────────────────────────
describe('T7 documentsBacking: the read-only rule for step-2 inputs', () => {
  const g = (status: ExtractedProposal['status'], id: string, value: number | null = 100) =>
    doc('utility_bill_gas', [prop({ status, value })], id);
  it('counts documents with a confirmed or pending proposal with a value; not rejected, not valueless', () => {
    const l = loc({ source_docs: [g('confirmed', 'a'), g('extracted', 'b'), g('needs_manual_review', 'c'), g('rejected', 'd'), g('confirmed', 'e', null)] });
    expect(documentsBacking(l, 'natural_gas_amount')).toBe(3);
    expect(documentsBacking(l, 'propane_amount')).toBe(0);
  });
  it('agrees with deriveLocations: backed means derived, unbacked means typed', () => {
    for (const docs of [[g('confirmed', 'a')], [g('extracted', 'a')], [g('rejected', 'a')], []]) {
      const l = loc({ has_natural_gas: true, natural_gas_amount: 777, source_docs: docs });
      const derived = deriveLocations({ locations: [l], reporting_year: 2024 })[0].natural_gas_amount;
      expect(documentsBacking(l, 'natural_gas_amount') > 0, JSON.stringify(docs.map(d => d.extracted![0].status))).toBe(derived !== 777);
    }
  });
});

describe('T7 deriveStoredLocations: readers of a stored row derive first', () => {
  const row = (locations_data: unknown, o: Record<string, unknown> = {}) => ({ locations_data, reporting_year: 2024, fiscal_year_end_month: 12, coverage_resolutions: [], ...o });
  it('derives a document-backed figure from a raw stored row, with the row\'s own year end and resolutions', () => {
    const raw = [loc({ has_natural_gas: true, natural_gas_amount: 0, source_docs: [doc('utility_bill_gas', [prop({ periodStart: '2024-04-01', periodEnd: '2024-04-30' })])] })];
    expect((deriveStoredLocations(row(raw)) as Location[])[0].natural_gas_amount).toBe(100);
    expect((deriveStoredLocations(row(raw, { fiscal_year_end_month: 3 })) as Location[])[0].natural_gas_amount, 'Apr 2024 is outside the year ending 31 Mar 2024').toBe(0);
  });
  it('passes a non-array through, so the reader reports "no location data" itself', () => {
    for (const v of [null, undefined, {}, 'x']) expect(deriveStoredLocations(row(v))).toBe(v);
  });
  it('an old row without source_docs reads as having no documents; a malformed one is returned unchanged', () => {
    const old = [{ ...loc({ natural_gas_amount: 50 }), source_docs: undefined }];
    expect((deriveStoredLocations(row(old)) as Location[])[0].natural_gas_amount).toBe(50);
    const bad = [{ ...loc({}), source_docs: [{ id: 'x', document_type: 'utility_bill_gas', extracted: 'not an array' }] }];
    expect(deriveStoredLocations(row(bad))).toBe(bad);
  });
});

// ── T10 ruling: an upload with nothing read from it ────────────────────────────────────────────────────
describe('T10 unread uploads: evidence when the fuel has a figure, a blocker naming what to do when not', () => {
  const unreadDoc = (id: string, document_type = 'utility_bill_gas'): SourceDoc => ({ ...doc(document_type, [], id), file_name: `${id}.pdf` });
  const site = (o: Partial<Location>) => loc({ name: 'Site A', has_natural_gas: true, natural_gas_unit: 'mcf', ...o });
  const none = (l: Location, r: CoverageResolution[] = []) => findUnresolvedCoverage([l], 2025, 12, r).filter(i => i.status === 'none');
  const usedNone = (field: string, fuelType = 'natural_gas'): CoverageResolution => ({ locId: 'L1', fuelType, kind: 'used_none', field,
    by: { userId: 'u', email: 'e@x.example' }, note: 'n', acknowledgedAt: '2026-10-02T09:00:00Z' } as CoverageResolution);

  it('beside a typed figure it is evidence, not a blocker', () => {
    expect(none(site({ natural_gas_amount: 400, source_docs: [unreadDoc('scan')] }))).toEqual([]);
  });
  it('beside a counted bill of the same type it is evidence', () => {
    expect(none(site({ source_docs: [unreadDoc('scan'), doc('utility_bill_gas', [prop({ periodStart: '2025-01-01', periodEnd: '2025-01-31' })], 'bill')] }))).toEqual([]);
  });
  it('with no figure it blocks, naming the file, the fuel and the site', () => {
    expect(none(site({ source_docs: [unreadDoc('scan')] }))).toEqual([{ locId: 'L1', fuelType: 'natural_gas', status: 'none', docIds: ['scan'],
      fields: ['natural_gas_amount'],
      message: 'scan.pdf is uploaded for natural gas at Site A, but no figure has been read from it or entered. Enter the figure from the bill, or confirm this site used no natural gas.' }]);
  });
  it('a document type covering several fuels lists them', () => {
    expect(none(site({ source_docs: [unreadDoc('fleet', 'fleet_fuel')] }))[0].message).toContain('uploaded for gasoline and diesel at Site A')
    expect(none(site({ source_docs: [unreadDoc('oil', 'fuel_oil')] }))[0].message).toContain('confirm this site used no heating oil and heavy fuel oil.')
  });
  it('each action clears it: a typed figure, or "used none"', () => {
    const blocked = site({ source_docs: [unreadDoc('scan')] });
    expect(none({ ...blocked, natural_gas_amount: 250 })).toEqual([]);
    expect(none(blocked, [usedNone('natural_gas_amount')])).toEqual([]);
    const oil = site({ source_docs: [unreadDoc('oil', 'fuel_oil')] });
    const r = usedNone('fuel_oil_distillate_amount', 'fuel_oil');
    expect(validateResolution(r, oil), '"used none" works for fields the reader never fills').toBeNull();
    expect(none(oil, [r])).toEqual([]);
    expect(findUndeclaredStreams([{ ...oil, has_fuel_oil_distillate: true }], [r]).map(u => u.stream)).not.toContain('fuel_oil_distillate');
  });
  it('a document type with no fields of its own never blocks', () => {
    expect(none(site({ source_docs: [unreadDoc('other', 'something_else')] }))).toEqual([]);
  });
});

// ── T10a: a confirmed proposal with no figure; Australian gas in MJ ───────────────────────────────────
describe('T10a no figure, and MJ gas', () => {
  const melbourneBill = (id: string, mj: number, k: number, o: Partial<ExtractedProposal> = {}) => {
    const m = String(k).padStart(2, '0');
    const conv = convertToCanonical('natural_gas', mj, 'MJ');
    return { ...doc('utility_bill_gas', [prop({ fuelType: 'natural_gas', rawValue: mj, rawUnit: 'MJ', value: conv.value, unit: conv.unit,
      conversionNote: conv.conversionNote, periodStart: `2025-${m}-01`, periodEnd: `2025-${m}-${new Date(2025, k, 0).getDate()}`, sourceQuote: `${mj} MJ`, ...o })], id), file_name: `${id}.pdf` };
  };
  const melbourne = (docs: SourceDoc[]) => loc({ name: 'Melbourne', country: 'AU', state: 'VIC', grid_region: 'AU_VIC', has_natural_gas: true, natural_gas_unit: 'm3', source_docs: docs });

  it('6 944 MJ converts through GJ to MMBtu, with the arithmetic in the note', () => {
    const c = convertToCanonical('natural_gas', 6944, 'MJ');
    expect(c).toMatchObject({ tier: 2, unit: 'mmbtu' });
    expect(c.value).toBeCloseTo(6.944 / 1.05505585262, 6);
    expect(c.conversionNote).toBe('6,944 MJ ÷ 1,000 = 6.944 GJ; ÷ 1.05505585262 = 6.5816 MMBtu');
    expect(convertToCanonical('natural_gas', 6944, 'megajoules').value).toBe(c.value);
  });

  it('prices against the AU (NGA) factor: 51.53 per GJ, MMBtu converted exactly (FI2)', () => {
    const l = melbourne([melbourneBill('jan', 6944, 1)]);
    const d = deriveLocations({ locations: [l], reporting_year: 2025 })[0];
    expect(d.natural_gas_unit).toBe('mmbtu');
    expect(findUnpriceableLocations([d], 'AR6', 2025)).toEqual([]);
    const t = calcInventory([d], 'AR6', 2025).s1_total;
    // FI2 diff 2: NGA's per-GJ figure, the MMBtu read converted back to GJ exactly (the derived 54.367 per MMBtu is gone).
    expect(t).toBeCloseTo(d.natural_gas_amount * 1.05505585262 * 51.53 / 1000, 12);   // the stored MMBtu read, to GJ exactly
    expect(t).toBeCloseTo(6.944 * 51.53 / 1000, 4);   // the same as NGA's per-GJ factor on the GJ read
    const row = (buildWorkings([l], 'AR6', 2025, [], 12) as { stream?: string; ef_source?: string }[]).find(r => r.stream === 'natural_gas')!;
    expect(row.ef_source).toContain('NGA');
  });

  it('every surface carries the AU gas source, and the methods tables list the conversion the row notes', () => {
    // FI2 diff 2: an MMBtu figure is no longer priced on a derived per-MMBtu factor; it converts to NGA's own GJ exactly.
    // FI2 follow-up: per m3 is NGA's printed 2.025129 (Table 5), cited on the row; it was 0.0393 x 51.53 rounded to 2.025.
    const MMBTU = '6.5816 MMBtu converted to 6.944 GJ (1 MMBtu = 1.05505585262 GJ, exact).';
    const M3 = 'DCCEEW NGA 2025, Energy - Scope 1 sheet (Table 5), Natural gas distributed in a pipeline: 2.025129 kg CO2-e/m³';
    const row = (unit: Location['natural_gas_unit'], amount: number, country = 'AU') => (buildWorkings([loc({ name: 'Melbourne', country, state: 'VIC', grid_region: 'AU_VIC',
      has_natural_gas: true, natural_gas_amount: amount, natural_gas_unit: unit })], 'AR6', 2025, [], 12) as { stream?: string; note?: string; emission_factor?: string }[])
      .find(r => r.stream === 'natural_gas')!;
    // Workings row, and so the verifier page (which renders a row's note, rowNoteOf).
    expect(row('mmbtu', 6.581642).note).toBe(MMBTU);
    expect(row('mmbtu', 6.581642).emission_factor).toContain('54.367');
    expect(row('m3', 1000).note).toBe(M3);
    // A US Mcf row carries EPA's Table 1 citation (FI2 diff 3), never the AU derivation.
    expect(row('mcf', 10, 'US').note, 'only where we derived the figure').not.toContain('NGA');
    // The PDF and XLSX methods tables (FI2 follow-up): the conversion the row notes, once however many rows use it, and
    // nothing for a value NGA prints in the unit entered.
    const melb = loc({ country: 'AU', has_natural_gas: true, natural_gas_amount: 6.58, natural_gas_unit: 'mmbtu' });
    expect(factorDerivationsFor([melb, { ...melb, id: 'L2' }])).toEqual(['Natural gas: MMBtu converted to GJ (1 MMBtu = 1.05505585262 GJ, exact).']);
    const melbM3: Location = { ...melb, natural_gas_unit: 'm3' };
    expect(factorDerivationsFor([melbM3]), 'a printed value is a citation, not a derivation').toEqual([]);
    expect(factorDerivationsFor([loc({ has_natural_gas: true, natural_gas_amount: 5, natural_gas_unit: 'mcf' })])).toEqual([]);
    const root = join(__dirname, '..', '..');
    expect(readFileSync(join(root, 'app/verify/[token]/page.tsx'), 'utf8')).toContain('{rowNoteOf(w) && (');
    expect(readFileSync(join(root, 'lib/assurancePdf.ts'), 'utf8')).toContain("...factorDerivationsFor(inventory.locations).map(d => ['Factor derivation', d]),");
    expect(readFileSync(join(root, 'app/dashboard/ghg/page.tsx'), 'utf8')).toContain("...factorDerivationsFor(derivedLocations).map(d => ['Factor derivation', d]),");
  });

  it('a confirmed proposal with no figure blocks, naming the document', () => {
    const l = melbourne([melbourneBill('jan', 6944, 1, { value: null, unit: null, status: 'confirmed' })]);
    expect(findUnresolvedCoverage([l], 2025, 12, []).filter(i => i.status === 'no_value')).toEqual([{ locId: 'L1', fuelType: 'natural_gas', status: 'no_value', docIds: ['jan'],
      message: 'jan.pdf is confirmed, but no figure could be read from it, so it is not counted. Edit the unit or the figure, or reject the bill.' }]);
  });

  it('every bill for a field rejected, all with no figure: the all-rejected issue is raised (found by the property test)', () => {
    const l = melbourne([melbourneBill('jan', 6944, 1, { value: null, unit: null, status: 'rejected' })]);
    expect(findUnresolvedCoverage([l], 2025, 12, []).map(i => i.status)).toContain('all_rejected');
  });

  it('the Melbourne run-through: five MJ bills saved with no figure block; correcting the unit counts them all', () => {
    const readings = [6944, 7120, 8015, 9230, 10110];
    const saved = melbourne(readings.map((mj, k) => melbourneBill(`b${k}`, mj, k + 1, { value: null, unit: null, status: 'confirmed' })));
    expect(findUnresolvedCoverage([saved], 2025, 12, []).filter(i => i.status === 'no_value')).toHaveLength(5);
    expect(deriveLocations({ locations: [saved], reporting_year: 2025 })[0].natural_gas_amount, 'the silent zero this fixes').toBe(0);
    // "Edit unit" → MJ on each, which re-converts from the raw reading (T9).
    const fixed = { ...saved, source_docs: saved.source_docs.map(d => ({ ...d, extracted: d.extracted!.map(p => ({ ...p, ...convertFields(p) })) })) };
    function convertFields(p: ExtractedProposal) { const c = convertToCanonical('natural_gas', p.rawValue, 'mj'); return { rawUnit: 'mj', value: c.value, unit: c.unit } }
    expect(findUnresolvedCoverage([fixed], 2025, 12, []).filter(i => i.status === 'no_value')).toEqual([]);
    expect(deriveLocations({ locations: [fixed], reporting_year: 2025 })[0].natural_gas_amount).toBeCloseTo(readings.reduce((a, b) => a + b, 0) / 1000 / 1.05505585262, 5);
  });
});

describe('T10b delivery-based fuels', () => {
  // The run-through: six Melbourne LPG invoices, 90 kg each (177.143 L), one delivery date each, no billing
  // period, in a year ending 30 September 2025. Before T10b each was stored as a one-day period.
  const W = periodFromYearAndEnd(2025, 9);
  const DATES = ['2024-10-14', '2024-12-09', '2025-02-03', '2025-04-14', '2025-06-23', '2025-08-25'];
  const lpg = (id: string, date: string, o: Partial<ExtractedProposal> = {}): SourceDoc =>
    ({ ...doc('fuel_propane', [prop({ fuelType: 'propane', rawValue: 90, rawUnit: 'kg', value: 177.143, unit: 'litres',
      periodStart: date, periodEnd: date, sourceQuote: '90 kg', ...o })], id), file_name: `${id}.pdf` });
  const site = (docs: SourceDoc[]) => loc({ name: 'Melbourne', country: 'AU', state: 'VIC', grid_region: 'AU_VIC',
    has_propane: true, propane_unit: 'litres', source_docs: docs });
  const melbourne = () => site(DATES.map((d, k) => lpg(`lpg${k + 1}`, d)));
  const issues = (l: Location, r: CoverageResolution[] = [], y = 2025, m = 9) => findUnresolvedCoverage([l], y, m, r);
  const by = { userId: 'u1', email: 'lisa@example.com' };
  const confirm = (l: Location, at = '2025-10-02T09:00:00Z') => {
    const i = issues(l).find(x => x.status === 'deliveries_unconfirmed')!;
    return deliveriesCompleteResolution({ locId: l.id, fuelType: 'propane', documentType: 'fuel_propane', docIds: i.docIds ?? [],
      statement: deliveriesStatement('propane', 'Melbourne', W), by, at });
  };

  it('deliveryDateOf: the reading decides, within delivery-capable document types only', () => {
    expect(deliveryDateOf('fuel_propane', { periodStart: '2025-03-14', periodEnd: '2025-03-14' }), 'stored before T10b').toBe('2025-03-14');
    expect(deliveryDateOf('fuel_propane', { periodStart: null, periodEnd: null, deliveryDate: '2025-03-14' })).toBe('2025-03-14');
    expect(deliveryDateOf('fleet_fuel', { periodStart: '2025-03-01', periodEnd: '2025-03-31' }), 'a statement').toBeNull();
    expect(deliveryDateOf('utility_bill_gas', { periodStart: '2025-03-14', periodEnd: '2025-03-14' }), 'gas is metered').toBeNull();
    expect(deliveryDateOf('fuel_diesel', { periodStart: null, periodEnd: null }), 'undated').toBeNull();
  });

  it('the Melbourne case: each delivery counts in full, never prorated, with its delivery date', () => {
    const cs = billContributions(melbourne(), [], W);
    expect(cs.map(c => [c.reason, c.share, c.totalDays, c.deliveryDate, c.periodOrigin])).toEqual(
      DATES.map(d => ['delivered', 1, null, d, 'delivery']));
    expect(applyResolutions(melbourne(), [], W.start, W.end).propane_amount?.value).toBeCloseTo(6 * 177.143, 6);
  });

  it('the Melbourne case: no month count and no gap; export waits for the completeness confirmation', () => {
    const got = issues(melbourne());
    expect(got.some(i => i.status === 'gap')).toBe(false);
    expect(got.filter(i => i.status === 'deliveries_unconfirmed')).toEqual([{ locId: 'L1', fuelType: 'propane', status: 'deliveries_unconfirmed',
      documentType: 'fuel_propane', docIds: ['lpg1', 'lpg2', 'lpg3', 'lpg4', 'lpg5', 'lpg6'],
      message: 'Confirm these are all the propane deliveries for Melbourne between 1 October 2024 and 30 September 2025. Export is blocked until you confirm.' }]);
  });

  it('the confirmation names fuel, site and window, records who and when, clears the issue and reaches the workings', () => {
    const l = melbourne();
    const r = confirm(l);
    expect(deliveriesStatement('propane', 'Melbourne', W)).toBe('These are all the propane deliveries for Melbourne between 1 October 2024 and 30 September 2025.');
    expect(r.note).toBe('lisa@example.com confirmed on 2 October 2025: These are all the propane deliveries for Melbourne between 1 October 2024 and 30 September 2025.');
    expect(validateResolution(r, l)).toBeNull();
    expect(issues(l, [r])).toEqual([]);
    const row = buildWorkings([l], 'AR6', 2025, [r], 9).find(w => w.gwp_basis === 'coverage_resolution' && w.activity_unit === 'deliveries_complete');
    expect(row?.emission_factor).toBe('Deliveries confirmed complete by lisa@example.com on 2 October 2025');
    expect(row?.ef_source).toBe(r.note);
  });

  it('adding, removing or rejecting a delivery reopens the confirmation, naming who confirmed and when', () => {
    const l = melbourne();
    const r = confirm(l);
    const CHANGED = 'The propane deliveries for Melbourne have changed since lisa@example.com confirmed them on 2 October 2025. Check the list and confirm again. Export is blocked until you do.';
    const added = { ...l, source_docs: [...l.source_docs, lpg('lpg7', '2025-09-15')] };
    expect(issues(added, [r]).filter(i => i.status === 'deliveries_unconfirmed').map(i => i.message)).toEqual([CHANGED]);
    const removed = { ...l, source_docs: l.source_docs.slice(1) };
    expect(issues(removed, [r]).filter(i => i.status === 'deliveries_unconfirmed').map(i => i.message)).toEqual([CHANGED]);
    const rejected = { ...l, source_docs: l.source_docs.map((d, k) => k === 0 ? { ...d, extracted: d.extracted!.map(p => ({ ...p, status: 'rejected' as const })) } : d) };
    expect(issues(rejected, [r]).filter(i => i.status === 'deliveries_unconfirmed').map(i => i.message)).toEqual([CHANGED]);
    expect(issues(rejected, [confirm(rejected)]), 'confirming again clears it').toEqual([]);
  });

  it('a full year of deliveries exports after confirmation', () => {
    const l = site(Array.from({ length: 12 }, (_, k) => lpg(`m${k + 1}`, `2025-${String(k + 1).padStart(2, '0')}-15`)));
    expect(issues(l, [], 2025, 12).map(i => i.status)).toEqual(['deliveries_unconfirmed']);
    const i = issues(l, [], 2025, 12)[0];
    const r = deliveriesCompleteResolution({ locId: 'L1', fuelType: 'propane', documentType: 'fuel_propane', docIds: i.docIds ?? [],
      statement: deliveriesStatement('propane', 'Melbourne', periodFromYearAndEnd(2025, 12)), by, at: '2026-01-05T09:00:00Z' });
    expect(issues(l, [r], 2025, 12)).toEqual([]);
    expect(deriveLocations({ locations: [l], reporting_year: 2025, coverage_resolutions: [r] })[0].propane_amount).toBeCloseTo(12 * 177.143, 6);
  });

  it('the window: the day before it opens and the day after it closes count zero; the first and last day count in full', () => {
    const l = site([lpg('before', '2024-09-30'), lpg('first', '2024-10-01'), lpg('last', '2025-09-30'), lpg('after', '2025-10-01')]);
    expect(billContributions(l, [], W).map(c => [c.docId, c.reason, c.share])).toEqual([
      ['before', 'outside_year', 0], ['first', 'delivered', 1], ['last', 'delivered', 1], ['after', 'outside_year', 0]]);
  });

  it('a delivery on the 1st of a month counts; it is not an invalid period', () => {
    const c = billContributions(site([lpg('d', '2025-03-01')]), [], W)[0];
    expect([c.reason, c.share, c.deliveryDate]).toEqual(['delivered', 1, '2025-03-01']);
  });

  it('a one-day billing period on the 1st covers that day and is not "reversed"', () => {
    const one = canonicalPeriod(new Date(2025, 2, 1), new Date(2025, 2, 1));
    expect([one.start.getDate(), one.endExclusive.getMonth(), one.endExclusive.getDate()]).toEqual([1, 2, 2]);
    expect(canonicalPeriod(new Date(2024, 11, 1), new Date(2025, 0, 1)).endExclusive.getTime(), 'other periods unchanged').toBe(exclusiveEnd(new Date(2025, 0, 1)).getTime());
    const gas = loc({ has_natural_gas: true, source_docs: [doc('utility_bill_gas', [prop({ periodStart: '2025-03-01', periodEnd: '2025-03-01' })], 'g')] });
    const c = billContributions(gas, [], periodFromYearAndEnd(2025, 12))[0];
    expect([c.reason, c.totalDays, c.inWindowDays]).toEqual(['counted', 1, 1]);
  });

  it('a delivery-based group is never estimated', () => {
    const l = melbourne();
    expect(isDeliveryGroup(l, 'fuel_propane', 'propane')).toBe(true);
    const est = { locId: 'L1', fuelType: 'propane', kind: 'extrapolate', documentType: 'fuel_propane', monthsCovered: 6, pctEstimated: 50,
      note: 'n', acknowledgedAt: '2025-10-02T09:00:00Z' } as CoverageResolution;
    expect(validateResolution(est, l)).toBe('Deliveries are counted as delivered, not estimated.');
    expect(applyResolutions(l, [est], W.start, W.end).propane_amount?.value).toBeCloseTo(6 * 177.143, 6);
  });

  it('the 0-months guard: no estimate is built from zero covered months, and a stored one changes nothing', () => {
    expect(() => estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: null,
      monthsCovered: 0, pctEstimated: 100, at: '2025-10-02T09:00:00Z' })).toThrow(NO_MONTHS_TO_ESTIMATE);
    const gas = loc({ has_natural_gas: true, source_docs: [doc('utility_bill_gas', [prop({ value: 50, periodStart: '2025-03-10', periodEnd: '2025-03-20' })], 'g')] });
    const zero = { locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', documentType: 'utility_bill_gas', monthsCovered: 0, pctEstimated: 100,
      note: 'n', acknowledgedAt: '2025-10-02T09:00:00Z' } as CoverageResolution;
    expect(validateResolution(zero, gas)).toBe('An estimate needs the number of months covered by bills.');
    expect(applyResolutions(gas, [zero], new Date(2025, 0, 1), new Date(2025, 11, 31)).natural_gas_amount?.value).toBe(50);
    expect(findUnresolvedCoverage([gas], 2025, 12, [zero]).map(i => i.status)).toContain('gap');
    const one = estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: null,
      monthsCovered: 1, pctEstimated: 91.7, at: '2025-10-02T09:00:00Z' });
    expect(validateResolution(one, gas)).toBeNull();
  });

  it('a statement in a delivery-capable type is prorated and month-checked as before', () => {
    const fleet = loc({ has_mobile: true, gasoline_unit: 'litres', source_docs: [doc('fleet_fuel', [prop({ fuelType: 'gasoline', value: 400, unit: 'litres',
      periodStart: '2025-03-01', periodEnd: '2025-03-31' })], 'card')] });
    const got = findUnresolvedCoverage([fleet], 2025, 12, []);
    expect(got.map(i => i.status)).toContain('gap');
    expect(got.some(i => i.status === 'deliveries_unconfirmed')).toBe(false);
  });

  it('a mixed field: statements are still prorated by their own days, and the field is confirmed as a whole', () => {
    const statement = doc('fuel_propane', [prop({ fuelType: 'propane', value: 310, unit: 'litres', periodStart: '2024-09-15', periodEnd: '2024-10-14' })], 'stmt');
    const l = site([statement, lpg('lpg1', '2025-02-03')]);
    const cs = billContributions(l, [], W);
    expect(cs.find(c => c.docId === 'stmt')?.reason).toBe('prorated');
    expect(cs.find(c => c.docId === 'stmt')?.share).toBeCloseTo(14 / 30, 6);
    const got = issues(l);
    expect(got.some(i => i.status === 'gap')).toBe(false);
    expect(got.find(i => i.status === 'deliveries_unconfirmed')?.docIds).toEqual(['stmt', 'lpg1']);
  });

  it('a delivery returned as a delivery date with no period is the same delivery', () => {
    const l = site([lpg('new', '', { periodStart: null, periodEnd: null, deliveryDate: '2025-02-03' })]);
    expect(billContributions(l, [], W).map(c => [c.reason, c.deliveryDate])).toEqual([['delivered', '2025-02-03']]);
  });

  it('monthly: each delivery lands whole in its delivery month, tagged delivery, and reconciles', () => {
    const l = melbourne();
    const inv = { locations: [l], reporting_year: 2025, fiscal_year_end_month: 9, coverage_resolutions: [confirm(l)] };
    const { slices } = buildMonthlyEmissions(inv, { calcGas, pickEF, getGridFactor, isResolvedGridRegion }, 'AR6');
    expect(slices.map(s => [s.period_month, s.activity_value, s.pct_in_month, s.basis, s.period_start, s.period_end])).toEqual(
      DATES.map(d => [`${d.slice(0, 7)}-01`, 177.143, 1, 'delivery', d, d]));
    expect(reconcile(slices, inv, 'AR6').reconciles).toBe(true);
  });

  it('sameDocSet ignores order', () => {
    expect(sameDocSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameDocSet(['a', 'b'], ['a'])).toBe(false);
  });
});

describe('T10c run-through wording', () => {
  it('a bill with no figure: the default message, or the quote and fuel when the unit is one we cannot use', () => {
    expect(NO_VALUE_MESSAGE).toBe("We couldn't find a usable figure on this bill. Check the unit or enter the figure yourself, or reject the bill if it shouldn't be included.");
    expect(valueProblem({ value: null })).toBe(NO_VALUE_MESSAGE);
    expect(valueProblem({ value: null, sourceQuote: '6,944 ft3', fuelType: 'natural_gas', rawValue: 6944, rawUnit: 'ft3' }))
      .toBe('We read "6,944 ft3" from this bill, but we can\'t use that unit for natural gas yet. Choose the unit from the list, or enter the figure yourself.');
    expect(valueProblem({ value: null, sourceQuote: '6,944 MJ', fuelType: 'natural_gas', rawValue: 6944, rawUnit: 'mj' }), 'a unit we can convert')
      .toBe(NO_VALUE_MESSAGE);
    expect(valueProblem({ value: null, sourceQuote: '', fuelType: 'natural_gas', rawValue: 6944, rawUnit: 'ft3' }), 'no quote').toBe(NO_VALUE_MESSAGE);
    expect(valueProblem({ value: 12 })).toBeNull();
  });

  it('only a bill confirmed with no figure needs attention', () => {
    expect(proposalNeedsAttention({ status: 'confirmed', value: null })).toBe(true);
    expect(proposalNeedsAttention({ status: 'confirmed', value: 5 })).toBe(false);
    expect(proposalNeedsAttention({ status: 'extracted', value: null })).toBe(false);
  });

  it('the Australian source is named "DCCEEW NGA 2025" on every citation', () => {
    for (const k of ['combustion_au', 'electricity_au', 'residual_au'] as const) {
      expect(EF_SOURCES[k].startsWith('DCCEEW NGA 2025'), k).toBe(true);
    }
    expect(Object.values(EF_SOURCES).join(' ')).not.toMatch(/NGA Factors|National Greenhouse Accounts/);
  });
});

// ── T13: F-09, F-10 and F-11 closed (docs/review/ghg-findings.md) ─────────────────────────────────────
// Each test fails on the code the finding describes. F-09: a bill wholly outside the year was added in full
// to the annual figure while the strip said "not counted". F-10: a month-only "Jan 2026" bill and a
// "Jan 1 to Feb 1 2026" bill were both summed, and the only resolution ("Confirm not a duplicate") changed
// nothing. F-11: periodConfidence was saved and never read, so a month-only period was treated as printed.
describe('T13 F-09, F-10, F-11 regressions', () => {
  const W = (y: number) => periodFromYearAndEnd(y, 12);
  const editor = { userId: 'u-1', email: 'jo@acme.example' };
  const elec = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'electricity', value, unit: 'kwh', periodStart, periodEnd, periodConfidence: 'high', sourceQuote: `${value} kWh`, ...o });
  const edoc = (id: string, p: ExtractedProposal): SourceDoc => ({ ...doc('utility_electricity', [p], id), file_name: `${id}.pdf` });
  const kwh = (l: Location, y: number, r: CoverageResolution[] = []) => applyResolutions(l, r, W(y).start, W(y).end).electricity_kwh?.value;

  it('F-09: a bill wholly outside the year contributes 0 to the annual figure, and the not-counted list matches', () => {
    const l = loc({ country: 'US', grid_region: 'US_CA', source_docs: [
      edoc('jan', elec(1000, '2025-01-01', '2025-01-31')),
      edoc('feb', elec(900, '2025-02-01', '2025-02-28')),
      edoc('old', elec(5000, '2024-03-01', '2024-03-31')),
    ] });
    const c = billContributions(l, [], W(2025));
    const old = c.find(x => x.docId === 'old') as BillContribution;
    expect(old).toMatchObject({ counted: false, reason: 'outside_year', share: 0 });
    // The annual figure is the in-year bills only. On the old code it was rawSum, 6900.
    expect(kwh(l, 2025)).toBe(1900);
    expect(deriveLocations({ locations: [l], reporting_year: 2025 })[0].electricity_kwh).toBe(1900);
    const total = calcInventory(deriveLocations({ locations: [l], reporting_year: 2025 }), 'AR6', 2025);
    const inYearOnly = calcInventory(deriveLocations({ locations: [{ ...l, source_docs: l.source_docs.filter(d => d.id !== 'old') }], reporting_year: 2025 }), 'AR6', 2025);
    expect(inYearOnly.s2_location).toBeGreaterThan(0);
    expect(total.s2_location).toBeCloseTo(inYearOnly.s2_location, 12);
    // What the strip lists as not counted (analyzeCoverage.outOfWindow) is exactly the outside_year bills,
    // and the figure is the sum of the counted ones, so the two cannot disagree.
    const periods: CoveragePeriod[] = c.filter(x => x.counted || x.reason === 'outside_year')
      .map(x => ({ docId: x.docId, pi: x.proposalIndex, start: new Date(`${x.periodStart}T00:00:00`), end: new Date(`${l.source_docs.find(d => d.id === x.docId)!.extracted![0].periodEnd}T00:00:00`) }));
    const cov = analyzeCoverage(periods, W(2025).start, W(2025).end);
    expect(cov.outOfWindow.length).toBe(c.filter(x => x.reason === 'outside_year').length);
    expect(c.filter(x => x.counted).reduce((s, x) => s + x.value * (x.share ?? 0), 0)).toBe(kwh(l, 2025));
  });

  it('F-10: a month-only Jan 2026 bill and a Jan 1 to Feb 1 2026 bill cannot both be summed without a resolution', () => {
    const monthOnly = elec(1150, '2026-01-01', '2026-01-31', { periodConfidence: 'medium', periodOrigin: 'billing_month', status: 'extracted' });
    const printed = elec(1200, '2026-01-01', '2026-02-01');
    // 1. The month-only bill cannot be confirmed until its dates are (R5). Confirm alone is dropped.
    expect(guardConfirm(monthOnly, { status: 'confirmed' }).status).toBeUndefined();
    const pending = loc({ source_docs: [edoc('printed', printed), edoc('monthOnly', monthOnly)] });
    expect(kwh(pending, 2026), 'only the printed bill counts while the month-only one waits').toBe(1200);
    // 2. Once its dates are confirmed, both count, and the overlap blocks export until it is resolved.
    const confirmed = { ...monthOnly, ...guardConfirm(monthOnly, editPeriod(monthOnly, { start: '2026-01-01', end: '2026-01-31', by: editor, at: '2026-02-10T09:00:00Z', confirm: true })) };
    expect(confirmed.status).toBe('confirmed');
    const both = loc({ source_docs: [edoc('printed', printed), edoc('monthOnly', confirmed)] });
    const overlap = (y: number, r: CoverageResolution[] = []) => findUnresolvedCoverage([both], y, 12, r).filter(i => i.status === 'overlap');
    expect(overlap(2026).map(i => i.docIds)).toEqual([['printed', 'monthOnly']]);
    // 3. The old "Confirm not a duplicate" resolution no longer clears it.
    const dup = { locId: 'L1', fuelType: 'electricity', kind: 'duplicate', note: 'accepted as-is', acknowledgedAt: '2026-02-10T09:00:00Z' } as CoverageResolution;
    expect(overlap(2026, [dup]).length).toBe(1);
    // 4. Same bill: counted once, and the overlap clears.
    const same = { locId: 'L1', fuelType: 'electricity', kind: 'same_bill', countedDocId: 'printed', excludedDocIds: ['monthOnly'], note: 'same', acknowledgedAt: '2026-02-10T09:00:00Z' } as CoverageResolution;
    expect(overlap(2026, [same])).toEqual([]);
    expect(kwh(both, 2026, [same])).toBe(1200);
    // 5. In FY2025 both are outside the year: they add 0, and the overlap is still raised (full periods).
    expect(kwh(both, 2025)).toBe(0);
    expect(overlap(2025).length).toBe(1);
  });

  it('F-11: periodConfidence is read: a month-only period saved before T9 cannot be confirmed until its dates are', () => {
    // A proposal saved before T9 carries periodConfidence and no periodOrigin. periodOriginOf reads it.
    const legacy = elec(1150, '2026-01-01', '2026-01-31', { periodConfidence: 'medium', status: 'extracted' });
    delete (legacy as Partial<ExtractedProposal>).periodOrigin;
    expect(periodOriginOf(legacy)).toBe('billing_month');
    expect(acceptanceProblem(legacy)).toBe(BILLING_MONTH_CONFIRM_MESSAGE);
    expect(guardConfirm(legacy, { status: 'confirmed' }).status, 'medium is not treated as printed').toBeUndefined();
    // Printed dates confirm as before; a recorded periodOrigin wins over periodConfidence.
    expect(periodOriginOf({ periodConfidence: 'high' })).toBe('printed');
    expect(guardConfirm(elec(1, '2026-01-01', '2026-01-31', { status: 'extracted' }), { status: 'confirmed' }).status).toBe('confirmed');
    expect(periodOriginOf({ periodConfidence: 'medium', periodOrigin: 'customer_confirmed' })).toBe('customer_confirmed');
    // 'low' (no period visible) gives null dates: undated, not counted, and an export-blocking issue names it.
    const undated = loc({ source_docs: [edoc('nodates', elec(700, null, null, { periodConfidence: 'low' }))] });
    expect(billContributions(undated, [], W(2026))[0]).toMatchObject({ counted: false, reason: 'undated' });
    expect(findUnresolvedCoverage([undated], 2026, 12, []).some(i => i.status === 'undated' && i.docIds?.includes('nodates'))).toBe(true);
  });
});

// ── T15: exact duplicate across document types (rule R6, docs/review/design-derived-figures.md) ──────────
// The same diesel receipt uploaded as stationary fuel (fuel_diesel) and as fleet fuel (fleet_fuel) was counted
// in both fields. It is now a warning that blocks export until the customer says whether it is the same document.
describe('T15 exact duplicate across document types', () => {
  const by = { userId: 'u-1', email: 'jo@acme.example' };
  const AT = '2025-04-02T09:00:00Z';
  const diesel = (value: number, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'diesel', value, unit: 'gallons', periodStart: '2025-03-01', periodEnd: '2025-03-31', sourceQuote: `${value} gal`, ...o });
  const sdoc = (id: string, document_type: string, p: ExtractedProposal, sha256?: string): SourceDoc =>
    ({ ...doc(document_type, [p], id), file_name: `${id}.pdf`, ...(sha256 ? { sha256 } : {}) });
  const site = (docs: SourceDoc[]) => loc({ name: 'Depot', country: 'US', grid_region: 'US_CA', has_diesel_stationary: true, has_mobile: true, source_docs: docs });
  // Same receipt, two kinds of document, same reading: criterion (b). With a shared hash: criterion (a) as well.
  const twin = (hashA?: string, hashB?: string, b: Partial<ExtractedProposal> = {}) => site([
    sdoc('tank', 'fuel_diesel', diesel(100), hashA),
    sdoc('fleet', 'fleet_fuel', diesel(100, b), hashB),
  ]);
  const gate = (l: Location, r: CoverageResolution[] = []) => findUnresolvedCoverage([l], 2025, 12, r).filter(i => i.status === 'exact_duplicate');
  const contrib = (l: Location, r: CoverageResolution[], id: string) => billContributions(l, r, periodFromYearAndEnd(2025, 12)).find(c => c.docId === id) as BillContribution;
  const TANK = { id: 'tank', file: 'tank.pdf', documentType: 'fuel_diesel' }, FLEET = { id: 'fleet', file: 'fleet.pdf', documentType: 'fleet_fuel' };
  const once = (l: Location) => exactDuplicateCountOnce({ locId: l.id, fuelType: 'diesel', counted: TANK, excluded: FLEET, by, at: AT });
  const notSame = (l: Location) => exactDuplicateNotSame({ locId: l.id, fuelType: 'diesel', docs: [TANK, FLEET], by, at: AT });

  it('the same hash across fuel_diesel and fleet_fuel warns, even when the readings differ', () => {
    const l = twin('ab12', 'ab12', { value: 80, periodStart: '2025-03-02' });
    expect(findExactDuplicates(l, [])).toEqual([{ locId: 'L1', fuelType: 'diesel', docIds: ['tank', 'fleet'], match: 'sha256', resolution: null }]);
  });

  it('the same value, unit and period warns with no hash at all', () => {
    expect(findExactDuplicates(twin(), []).map(x => x.match)).toEqual(['reading']);
  });

  it('a missing hash never matches by hash', () => {
    const differ = { value: 80 };
    expect(findExactDuplicates(twin(undefined, undefined, differ), [])).toEqual([]);
    expect(findExactDuplicates(twin('ab12', undefined, differ), [])).toEqual([]);
    expect(findExactDuplicates(twin('', '', differ), [])).toEqual([]);
    // Different hashes, same reading: (b) still fires.
    expect(findExactDuplicates(twin('ab12', 'cd34'), []).map(x => x.match)).toEqual(['reading']);
  });

  it('is only across document types, only for one fuel, and only for accepted proposals', () => {
    // Same type: an overlap, answered by Same bill (rule R3), not an exact duplicate.
    expect(findExactDuplicates(site([sdoc('a', 'fuel_diesel', diesel(100), 'h'), sdoc('b', 'fuel_diesel', diesel(100), 'h')]), [])).toEqual([]);
    // One dual-fuel file read once for gas and once for electricity counts each fuel once.
    const dual = loc({ source_docs: [
      sdoc('g', 'utility_bill_gas', prop({ fuelType: 'natural_gas', value: 40, unit: 'mcf', periodStart: '2025-03-01', periodEnd: '2025-03-31' }), 'h'),
      sdoc('e', 'utility_electricity', prop({ fuelType: 'electricity', value: 900, unit: 'kwh', periodStart: '2025-03-01', periodEnd: '2025-03-31' }), 'h'),
    ] });
    expect(findExactDuplicates(dual, [])).toEqual([]);
    expect(findExactDuplicates(twin('h', 'h', { status: 'extracted' }), [])).toEqual([]);
    expect(findExactDuplicates(twin('h', 'h', { status: 'rejected' }), [])).toEqual([]);
  });

  it('a delivery date stands for both ends of the period in criterion (b)', () => {
    const delivered = (o: Partial<ExtractedProposal> = {}) => diesel(100, { periodStart: null, periodEnd: null, deliveryDate: '2025-03-14', ...o });
    expect(findExactDuplicates(site([sdoc('tank', 'fuel_diesel', delivered()), sdoc('fleet', 'fleet_fuel', delivered())]), []).length).toBe(1);
    expect(findExactDuplicates(site([sdoc('tank', 'fuel_diesel', delivered()), sdoc('fleet', 'fleet_fuel', delivered({ deliveryDate: '2025-03-15' }))]), [])).toEqual([]);
  });

  it('an unacknowledged warning blocks export, naming the site and both documents', () => {
    expect(gate(twin('h', 'h'))).toEqual([{ locId: 'L1', fuelType: 'diesel', status: 'exact_duplicate', docIds: ['tank', 'fleet'],
      message: 'tank.pdf (Diesel purchase record) and fleet.pdf (Fleet fuel record) at Depot are the same file, uploaded as two different kinds of document. Choose Same document, count once, or Not the same. Export is blocked until you choose.' }]);
    expect(gate(twin())[0].message).toBe(COVERAGE_MESSAGE.exact_duplicate('Depot', TANK, FLEET, 'reading', 'diesel'));
    expect(gate(twin())[0].message).toContain('show the same diesel figure, unit and dates');
    // A warning, not a coverage issue: neither document's coverage group reports it.
    expect(findUnresolvedCoverage([twin('h', 'h')], 2025, 12, []).filter(i => i.status === 'overlap')).toEqual([]);
  });

  it('count_once excludes one: exact_duplicate_of the counted document, and the warning clears', () => {
    const l = twin('h', 'h');
    const r = [once(l)];
    expect(contrib(l, r, 'fleet')).toMatchObject({ counted: false, reason: 'exact_duplicate_of', reasonRef: 'tank' });
    expect(contrib(l, r, 'tank')).toMatchObject({ counted: true, reason: 'counted' });
    const d = deriveLocations({ locations: [l], reporting_year: 2025, coverage_resolutions: r })[0];
    expect([d.diesel_stationary_amount, d.diesel_mobile_amount]).toEqual([100, 0]);
    expect(gate(l, r)).toEqual([]);
    expect(findExactDuplicates(l, r)[0].resolution).toEqual(r[0]);
    expect(r[0].note).toBe('jo@acme.example confirmed on 2 April 2025 that tank.pdf (Diesel purchase record) and fleet.pdf (Fleet fuel record) are the same document, so it is counted once, as the Diesel purchase record.');
    // The excluded copy is retained as evidence on the workings, and an audit row records the choice.
    const rows = buildWorkings([l], 'AR6', 2025, r);
    expect(rows.find(w => w.gwp_basis === 'all_bills_excluded')?.contributions?.[0]).toMatchObject({ docId: 'fleet', reason: 'exact_duplicate_of' });
    expect(rows.filter(w => w.gwp_basis === 'coverage_resolution').map(w => w.emission_factor)).toEqual(['Same document, counted once as the Diesel purchase record, chosen by jo@acme.example on 2 April 2025']);
  });

  it('not_same counts both, and the warning clears', () => {
    const l = twin('h', 'h');
    const r = [notSame(l)];
    expect(contrib(l, r, 'fleet')).toMatchObject({ counted: true, reason: 'counted' });
    const d = deriveLocations({ locations: [l], reporting_year: 2025, coverage_resolutions: r })[0];
    expect([d.diesel_stationary_amount, d.diesel_mobile_amount]).toEqual([100, 100]);
    expect(gate(l, r)).toEqual([]);
  });

  it('choosing again for the same documents replaces the earlier choice', () => {
    const l = twin('h', 'h');
    const list = upsertResolution([once(l)], notSame(l));
    expect(list.map(r => r.choice)).toEqual(['not_same']);
  });

  it('validateResolution accepts the two choices and refuses malformed ones', () => {
    const l = twin('h', 'h');
    expect(validateResolution(once(l), l)).toBeNull();
    expect(validateResolution(notSame(l), l)).toBeNull();
    const bad: Array<[string, Partial<CoverageResolution>]> = [
      ['Resolution is for a different location.', { locId: 'L2' }],
      ['Every document named must be on this site and carry this fuel.', { excludedDocIds: ['nowhere'] }],
      ['The document that counts cannot also be excluded.', { excludedDocIds: ['tank'] }],
      ['Choose the document that counts.', { countedDocId: undefined }],
      ['Choose the document that is the same as it.', { excludedDocIds: [] }],
      ['A choice must record who made it.', { by: undefined }],
      ['Choose Same document, count once, or Not the same.', { choice: undefined }],
    ];
    for (const [msg, o] of bad) expect(validateResolution({ ...once(l), ...o } as CoverageResolution, l), msg).toBe(msg);
    expect(validateResolution({ ...notSame(l), docIds: ['tank'] }, l)).toBe('Name the two documents that are not the same.');
    expect(validateResolution({ ...notSame(l), docIds: ['tank', 'nowhere'] }, l)).toBe('Every document named must be on this site and carry this fuel.');
    const sameType = site([sdoc('a', 'fuel_diesel', diesel(100)), sdoc('b', 'fuel_diesel', diesel(100))]);
    expect(validateResolution({ ...once(sameType), countedDocId: 'a', excludedDocIds: ['b'] }, sameType))
      .toBe('These documents are the same kind, so choose Same bill, count it once.');
    // A refused choice changes nothing and clears nothing.
    const refused = { ...once(l), by: undefined } as CoverageResolution;
    expect(contrib(l, [refused], 'fleet').counted).toBe(true);
    expect(gate(l, [refused]).length).toBe(1);
  });

  it('monthly figures and reconcile agree with the annual figure under count_once', () => {
    const l = twin('h', 'h');
    const inv = { locations: [l], reporting_year: 2025, coverage_resolutions: [once(l)] };
    const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion };
    const slices = buildMonthlyEmissions(inv, deps, 'AR6').slices;
    const annual = calcInventory(deriveLocations(inv), 'AR6', 2025);
    const r = reconcile(slices, inv, 'AR6');
    expect(r.reconciles).toBe(true);
    expect(r.scope1_evidenced).toBeCloseTo(annual.s1_total, 3);
    // One slice, the counted copy's 100 gallons in March. The excluded copy writes no month.
    expect(slices.map(x => [x.period_month, x.activity_value])).toEqual([['2025-03-01', 100]]);
    // And the figure is the counted copy alone, not both.
    const alone = calcInventory(deriveLocations({ locations: [site([l.source_docs[0]])], reporting_year: 2025 }), 'AR6', 2025);
    expect(annual.s1_total).toBeGreaterThan(0);
    expect(annual.s1_total).toBeCloseTo(alone.s1_total, 12);
  });
});

// ── T15-fix1: one file uploaded twice, under the same name ────────────────────────────────────────────────
// Found on the preview: test-diesel-receipt-A.pdf, 1,200 litres delivered 14 Mar 2025, uploaded at MONCTON as a
// Diesel purchase record and as a Fleet fuel record. Every T15 fixture used two different file names, so the
// warning that named both copies by file name ("A.pdf and A.pdf") passed its tests and told the customer nothing.
describe('T15-fix1 the same file uploaded twice under one name', () => {
  const by = { userId: 'u-1', email: 'lisa@acme.example' };
  const AT = '2025-04-02T09:00:00Z';
  const FILE = 'test-diesel-receipt-A.pdf';
  const delivery = (): ExtractedProposal => prop({ fuelType: 'diesel', rawValue: 1200, rawUnit: 'litres', value: 1200, unit: 'litres',
    periodStart: null, periodEnd: null, deliveryDate: '2025-03-14', periodOrigin: 'delivery', sourceQuote: '1,200 L' });
  const copy = (id: string, document_type: string): SourceDoc => ({ ...doc(document_type, [delivery()], id), file_name: FILE, sha256: 'ab12' });
  const moncton = () => loc({ name: 'MONCTON', country: 'CA', province: 'NB', grid_region: 'CA_NB',
    has_diesel_stationary: true, diesel_stationary_unit: 'litres', has_mobile: true, diesel_mobile_unit: 'litres',
    source_docs: [copy('tank', 'fuel_diesel'), copy('fleet', 'fleet_fuel')] } as Partial<Location>);
  const TANK = { id: 'tank', file: FILE, documentType: 'fuel_diesel' }, FLEET = { id: 'fleet', file: FILE, documentType: 'fleet_fuel' };
  const choose = (counted: typeof TANK, excluded: typeof TANK): CoverageResolution[] => upsertResolution(
    upsertResolution([], deliveriesCompleteResolution({ locId: 'L1', fuelType: 'diesel', documentType: 'fuel_diesel', docIds: ['tank'], statement: 's', by, at: AT })),
    exactDuplicateCountOnce({ locId: 'L1', fuelType: 'diesel', counted, excluded, by, at: AT }));

  it('Part 2 repro: 1,200 litres counted once, whichever copy counts, in derived figures, totals and workings', () => {
    const l = moncton();
    const allTotal = (r: CoverageResolution[]) => calcInventory(deriveLocations({ locations: [l], reporting_year: 2025, coverage_resolutions: r }), 'AR6', 2025).s1_total;
    const onlyOne = (id: string) => calcInventory(deriveLocations({ locations: [{ ...l, source_docs: l.source_docs.filter(d => d.id === id) }], reporting_year: 2025 }), 'AR6', 2025).s1_total;
    for (const [counted, excluded, countedField, zeroField] of [
      [TANK, FLEET, 'diesel_stationary_amount', 'diesel_mobile_amount'],
      [FLEET, TANK, 'diesel_mobile_amount', 'diesel_stationary_amount'],
    ] as const) {
      const r = choose(counted, excluded);
      const d = deriveLocations({ locations: [l], reporting_year: 2025, coverage_resolutions: r })[0];
      expect(d[countedField], counted.documentType).toBe(1200);
      expect(d[zeroField], counted.documentType).toBe(0);
      expect(allTotal(r)).toBeGreaterThan(0);
      expect(allTotal(r), counted.documentType).toBeCloseTo(onlyOne(counted.id), 12);
      const rows = buildWorkings([l], 'AR6', 2025, r);
      const diesel = rows.filter(w => typeof w.activity_data === 'number' && w.activity_data > 0 && /diesel/i.test(String(w.source)));
      expect(diesel.map(w => w.activity_data), counted.documentType).toEqual([1200]);
    }
  });

  it('the gate message names the file once and the two kinds of record', () => {
    const msg = findUnresolvedCoverage([moncton()], 2025, 12, []).find(i => i.status === 'exact_duplicate')?.message;
    expect(msg).toBe('test-diesel-receipt-A.pdf at MONCTON was uploaded twice, as a Diesel purchase record and as a Fleet fuel record. Choose Same document, count once, or Not the same. Export is blocked until you choose.');
    expect(COVERAGE_MESSAGE.exact_duplicate('MONCTON', TANK, FLEET, 'reading', 'diesel')).toBe(
      'test-diesel-receipt-A.pdf at MONCTON was uploaded as a Diesel purchase record and as a Fleet fuel record, and both show the same diesel figure, unit and dates. Choose Same document, count once, or Not the same. Export is blocked until you choose.');
    expect(COVERAGE_MESSAGE.exact_duplicate('Main', { file: 'x.pdf', documentType: 'utility_electricity' }, { file: 'x.pdf', documentType: 'renewable_cert' }, 'sha256', 'electricity'))
      .toBe('x.pdf at Main was uploaded twice, as an Electricity bill and as a REC / PPA certificate. Choose Same document, count once, or Not the same. Export is blocked until you choose.');
  });

  it('the audit row and the stored note name the counted copy by type, so either choice reads differently', () => {
    const l = moncton();
    const method = (r: CoverageResolution[]) => buildWorkings([l], 'AR6', 2025, r).filter(w => w.gwp_basis === 'coverage_resolution' && w.activity_unit === 'exact_duplicate').map(w => w.emission_factor);
    expect(method(choose(TANK, FLEET))).toEqual(['Same document, counted once as the Diesel purchase record, chosen by lisa@acme.example on 2 April 2025']);
    expect(method(choose(FLEET, TANK))).toEqual(['Same document, counted once as the Fleet fuel record, chosen by lisa@acme.example on 2 April 2025']);
    expect(choose(TANK, FLEET)[1].note).toBe('lisa@acme.example confirmed on 2 April 2025 that test-diesel-receipt-A.pdf, uploaded as a Diesel purchase record and as a Fleet fuel record, is one document, so it is counted once, as the Diesel purchase record.');
    const not = exactDuplicateNotSame({ locId: 'L1', fuelType: 'diesel', docs: [TANK, FLEET], by, at: AT });
    expect(not.note).toBe('lisa@acme.example confirmed on 2 April 2025 that test-diesel-receipt-A.pdf, uploaded as a Diesel purchase record and as a Fleet fuel record, are two different documents, so both are counted.');
    expect(buildWorkings([l], 'AR6', 2025, [not]).filter(w => w.activity_unit === 'exact_duplicate').map(w => w.emission_factor))
      .toEqual(['Not the same document, the Diesel purchase record and the Fleet fuel record each counted, chosen by lisa@acme.example on 2 April 2025']);
  });

  it('the left-out reading says it is not counted, and which copy is', () => {
    expect(EXACT_DUPLICATE_NOT_COUNTED('fuel_diesel')).toBe('Not counted: this is the same document as the Diesel purchase record, which is counted.');
    expect(twoCopies(TANK, FLEET)).toBe('test-diesel-receipt-A.pdf, uploaded as a Diesel purchase record and as a Fleet fuel record,');
    expect(twoCopies({ file: 'a.pdf', documentType: 'fuel_diesel' }, { file: 'b.pdf', documentType: 'fleet_fuel' })).toBe('a.pdf (Diesel purchase record) and b.pdf (Fleet fuel record)');
  });

  it('none of the new copy has an em dash', () => {
    const texts = [
      ...findUnresolvedCoverage([moncton()], 2025, 12, []).map(i => i.message ?? ''),
      ...choose(TANK, FLEET).map(r => r.note),
      EXACT_DUPLICATE_NOT_COUNTED('fleet_fuel'),
      ...buildWorkings([moncton()], 'AR6', 2025, choose(FLEET, TANK)).filter(w => w.activity_unit === 'exact_duplicate').map(w => String(w.emission_factor)),
    ];
    for (const t of texts) expect(t).not.toContain('\u2014');
  });
});

// ── T15-fix2: every confirmed reading that is not counted says so, under the reading ─────────────────────
// A reading shows its figure and "Confirmed". Where it reaches no total, notCountedLines gives the line the page
// prints under it (app/dashboard/ghg/page.tsx, DocUpload). Never for a counted, prorated or delivered reading.
describe('T15-fix2 not-counted line under each confirmed, uncounted reading', () => {
  const W = periodFromYearAndEnd(2025, 12);
  const gas = (value: number, periodStart: string | null, periodEnd: string | null, o: Partial<ExtractedProposal> = {}) =>
    prop({ fuelType: 'natural_gas', value, unit: 'mcf', periodStart, periodEnd, ...o });
  const gdoc = (id: string, p: ExtractedProposal, o: Partial<SourceDoc> = {}): SourceDoc =>
    ({ ...doc('utility_bill_gas', [p], id), file_name: `${id}.pdf`, ...o });
  const site = (docs: SourceDoc[], o: Partial<Location> = {}) => loc({ has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: docs, ...o });
  const lines = (l: Location, r: CoverageResolution[] = []) => Object.fromEntries(notCountedLines(l, r, W));
  const same = (counted: string, excluded: string): CoverageResolution =>
    ({ locId: 'L1', fuelType: 'natural_gas', kind: 'same_bill', countedDocId: counted, excludedDocIds: [excluded], note: 'n', acknowledgedAt: '2025-04-02T09:00:00Z' });

  it('never for a counted, prorated or delivered reading, nor one not yet confirmed', () => {
    const l = site([
      gdoc('jan', gas(100, '2025-01-01', '2025-01-31')),
      gdoc('edge', gas(310, '2024-12-20', '2025-01-19')),        // prorated: counted
      gdoc('pending', gas(90, '2025-02-01', '2025-02-28', { status: 'extracted' })),
      gdoc('rejected', gas(90, '2025-03-01', '2025-03-31', { status: 'rejected' })),
    ]);
    const d = loc({ has_diesel_stationary: true, diesel_stationary_unit: 'litres', source_docs: [
      { ...doc('fuel_diesel', [prop({ fuelType: 'diesel', value: 500, unit: 'litres', periodStart: null, periodEnd: null, deliveryDate: '2025-05-02' })], 'dd'), file_name: 'dd.pdf' }] });
    expect(billContributions(l, [], W).find(c => c.docId === 'edge')?.reason).toBe('prorated');
    expect(lines(l)).toEqual({});
    expect(lines(d)).toEqual({});
  });

  it('outside_year: billed or delivered outside the reporting year', () => {
    const l = site([gdoc('jan', gas(100, '2025-01-01', '2025-01-31')), gdoc('old', gas(999, '2024-03-01', '2024-03-31'))]);
    expect(lines(l)).toEqual({ 'old:0': 'Not counted: billed outside reporting year 2025.' });
    const d = loc({ has_diesel_stationary: true, source_docs: [
      { ...doc('fuel_diesel', [prop({ fuelType: 'diesel', value: 500, unit: 'litres', periodStart: null, periodEnd: null, deliveryDate: '2024-11-02' })], 'dd'), file_name: 'dd.pdf' }] });
    expect(lines(d)).toEqual({ 'dd:0': 'Not counted: delivered outside reporting year 2025.' });
  });

  it('same_bill_as: names the counted copy by file, or by upload date when the names are the same', () => {
    const bills = (aName: string, bName: string, aAt = '2025-04-01T10:05:00', bAt = '2025-04-03T16:40:00') => site([
      gdoc('a', gas(100, '2025-01-01', '2025-01-31'), { file_name: aName, uploaded_at: aAt }),
      gdoc('b', gas(100, '2025-01-01', '2025-01-31'), { file_name: bName, uploaded_at: bAt }),
    ]);
    expect(lines(bills('jan-a.pdf', 'jan-b.pdf'), [same('a', 'b')])).toEqual({ 'b:0': 'Not counted: this is the same bill as jan-a.pdf, which is counted.' });
    expect(lines(bills('jan.pdf', 'jan.pdf'), [same('a', 'b')])).toEqual({ 'b:0': 'Not counted: this is the same bill as the copy uploaded on 1 April 2025, which is counted.' });
    // Same name, same day: to the minute, so the two copies still read differently.
    expect(lines(bills('jan.pdf', 'jan.pdf', '2025-04-01T10:05:00', '2025-04-01T16:40:00'), [same('b', 'a')]))
      .toEqual({ 'a:0': 'Not counted: this is the same bill as the copy uploaded on 1 April 2025 at 16:40, which is counted.' });
  });

  it('exact_duplicate_of: the T15-fix1 line, unchanged', () => {
    const copy = (id: string, t: string): SourceDoc => ({ ...doc(t, [prop({ fuelType: 'diesel', value: 1200, unit: 'litres', periodStart: null, periodEnd: null, deliveryDate: '2025-03-14' })], id), file_name: 'r.pdf', sha256: 'h' });
    const l = loc({ has_diesel_stationary: true, has_mobile: true, source_docs: [copy('tank', 'fuel_diesel'), copy('fleet', 'fleet_fuel')] });
    const r = exactDuplicateCountOnce({ locId: 'L1', fuelType: 'diesel', counted: { id: 'tank', file: 'r.pdf', documentType: 'fuel_diesel' }, excluded: { id: 'fleet', file: 'r.pdf', documentType: 'fleet_fuel' }, by: { userId: 'u', email: 'e@x' }, at: '2025-04-02T09:00:00Z' });
    expect(lines(l, [r])).toEqual({ 'fleet:0': EXACT_DUPLICATE_NOT_COUNTED('fuel_diesel') });
  });

  it('manual_override: you entered this figure by hand instead', () => {
    const l = site([gdoc('jan', gas(100, '2025-01-01', '2025-01-31'))],
      { natural_gas_amount: 1200, manual_overrides: [{ field: 'natural_gas_amount', reason: 'meter read', at: '2025-04-02T09:00:00Z', by: { userId: 'u', email: 'e@x' } }] });
    expect(lines(l)).toEqual({ 'jan:0': 'Not counted: you entered this figure by hand instead.' });
  });

  it('mixed_units, invalid_period and undated: not counted until resolved, with the gate\'s own instruction', () => {
    const mixed = site([gdoc('a', gas(100, '2025-01-01', '2025-01-31')), gdoc('b', gas(200, '2025-02-01', '2025-02-28', { unit: 'therms' }))]);
    const mixedLine = `Not counted until resolved: the natural gas bills for this site are in different units. ${FIX_UNITS}`;
    expect(lines(mixed)).toEqual({ 'a:0': mixedLine, 'b:0': mixedLine });
    expect(findUnresolvedCoverage([mixed], 2025, 12, []).find(i => i.status === 'mixed_units')?.message).toContain(FIX_UNITS);
    const bad = site([gdoc('rev', gas(100, '2025-03-10', '2025-03-01')), gdoc('junk', gas(100, '2025-02-30', '2025-03-31'))]);
    expect(lines(bad)).toEqual({
      'rev:0': `Not counted until resolved: the billing period ends before it starts. ${FIX_REVERSED}`,
      'junk:0': `Not counted until resolved: the billing period could not be read as dates. ${FIX_DATES}`,
    });
    const undated = site([gdoc('nd', gas(100, null, null))]);
    expect(lines(undated)).toEqual({ 'nd:0': `Not counted until resolved: this bill has no billing period. ${FIX_DATES}` });
    // The gate gives the same instruction, from the same constant.
    for (const [l, status, fix] of [[bad, 'invalid_period', FIX_REVERSED], [undated, 'undated', FIX_DATES]] as const)
      expect(findUnresolvedCoverage([l], 2025, 12, []).find(i => i.status === status)?.message).toContain(fix);
  });

  it('a counted bill under a switched-off stream: not counted until resolved', () => {
    const l = site([gdoc('jan', gas(100, '2025-01-01', '2025-01-31'))], { has_natural_gas: false });
    expect(lines(l)).toEqual({ 'jan:0': 'Not counted until resolved: this site is marked as not using natural gas. Turn natural gas on for this site, or reject the bill.' });
  });

  it('no line has an em dash', () => {
    const all = [
      ...notCountedLines(site([gdoc('old', gas(9, '2024-03-01', '2024-03-31')), gdoc('nd', gas(1, null, null)), gdoc('t', gas(2, '2025-01-01', '2025-01-31', { unit: 'therms' }))]), [], W).values(),
      ...notCountedLines(site([gdoc('j', gas(1, '2025-01-01', '2025-01-31'))], { has_natural_gas: false }), [], W).values(),
    ];
    expect(all.length).toBeGreaterThan(2);
    for (const t of all) expect(t).not.toContain('\u2014');
  });
});

// ── FI1: an unpriceable input is a blocking line, never a dropped site ───────────────────────────────
// docs/review/design-derived-figures.md, "FI1". Rulings: no silent drop-out; Canadian gas with no province
// blocks; an unknown refrigerant is an unpriced line, never `?? 0`; an unsupported country stays a stated,
// non-blocking exclusion.
describe('FI1 unpriced lines', () => {
  const BLOCKING = new Set(['factor_missing', 'refrigerant_unknown', 'province_missing']);
  const gate = (l: Location) => findUnresolvedCoverage([l], 2025, 12, []).filter(i => BLOCKING.has(i.status));

  // Every fuel line the wizard or a bill can store: its switch, amount and unit fields, the wizard's own
  // options for the country, and (for a bill) every unit convertibleUnits accepts for the fuel.
  const FUELS: { field: keyof Location; unitField: keyof Location; on: Partial<Location>; options: (c: string) => string[]; bill?: 'natural_gas' | 'propane' | 'diesel' | 'gasoline' }[] = [
    { field: 'natural_gas_amount', unitField: 'natural_gas_unit', on: { has_natural_gas: true }, options: c => ngUnitOptions(c).map(([v]) => v), bill: 'natural_gas' },
    { field: 'propane_amount', unitField: 'propane_unit', on: { has_propane: true }, options: c => propaneUnitOptions(c).map(([v]) => v), bill: 'propane' },
    { field: 'diesel_stationary_amount', unitField: 'diesel_stationary_unit', on: { has_diesel_stationary: true }, options: c => liquidUnitOptions(c).map(([v]) => v), bill: 'diesel' },
    { field: 'fuel_oil_distillate_amount', unitField: 'fuel_oil_distillate_unit', on: { has_fuel_oil_distillate: true }, options: c => liquidUnitOptions(c).map(([v]) => v) },
    { field: 'fuel_oil_residual_amount', unitField: 'fuel_oil_residual_unit', on: { has_fuel_oil_residual: true }, options: c => liquidUnitOptions(c).map(([v]) => v) },
    { field: 'gasoline_amount', unitField: 'gasoline_unit', on: { has_mobile: true }, options: c => liquidUnitOptions(c).map(([v]) => v), bill: 'gasoline' },
    { field: 'diesel_mobile_amount', unitField: 'diesel_mobile_unit', on: { has_mobile: true }, options: c => liquidUnitOptions(c).map(([v]) => v), bill: 'diesel' },
  ];
  const SUPPORTED = ['US', 'CA', 'GB', ...EU_COUNTRIES, 'AU', 'NZ'].filter(c => efRouting({ country: c }).supported);

  it('property: every supported country x fuel x unit is priced, or unpriced with a blocking issue; never ?? 0, never excluded', () => {
    let priced = 0, unpriced = 0;
    for (const country of SUPPORTED) {
      for (const f of FUELS) {
        const units = new Set([...f.options(country), ...(f.bill ? convertibleUnits(f.bill) : [])]);
        for (const unit of units) {
          const l = loc({ name: 'Site', country, grid_region: country === 'CA' ? 'ON' : '', ...f.on, [f.field]: 1000, [f.unitField]: unit } as Partial<Location>);
          const label = `${country} ${String(f.field)} in ${unit}`;
          expect(findUnpriceableLocations([l], 'AR6', 2025), `${label}: never excluded`).toEqual([]);
          const lines = unpricedLines(l);
          const s1 = calcInventory([l], 'AR6', 2025).s1_total;
          if (lines.length === 0) {
            priced++;
            expect(s1, `${label}: priced, so above zero`).toBeGreaterThan(0);
            expect(gate(l), `${label}: priced lines raise nothing`).toEqual([]);
          } else {
            unpriced++;
            expect(lines.map(u => u.field), label).toEqual([f.field]);
            expect(s1, `${label}: unpriced is absent from the total, never a figure`).toBe(0);
            expect(gate(l).map(i => [i.status, i.field]), `${label}: blocks export`).toEqual([[lines[0].reason, String(f.field)]]);
            const row = buildWorkings([l], 'AR6', 2025).find(r => r.declaration === 'unpriced');
            expect(row?.result_tco2e, `${label}: null, not zero`).toBeNull();
          }
        }
      }
    }
    // Not vacuous either way: the sweep must reach both outcomes.
    expect(priced).toBeGreaterThan(20);
    expect(unpriced).toBeGreaterThan(5);
  });

  it('a location with one unpriceable line still has its other lines priced and in every total', () => {
    // FI2 follow-up: a NZ site. MfE prints gas per kWh only, so m3 has no exact route (UK m3 now prices on DEFRA's per-m3 row).
    const mixed = loc({ id: 'M', name: 'Mixed', country: 'NZ', grid_region: 'NZ', electricity_kwh: 40_000,
      has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3',
      has_diesel_stationary: true, diesel_stationary_amount: 500, diesel_stationary_unit: 'gallons' });
    const without = loc({ ...mixed, has_natural_gas: false, natural_gas_amount: 0 });
    expect(calcInventory([mixed], 'AR6', 2025)).toEqual(calcInventory([without], 'AR6', 2025));
    expect(calcInventory([mixed], 'AR6', 2025).s1_total).toBeGreaterThan(0);
    expect(calcInventory([mixed], 'AR6', 2025).s2_location).toBeGreaterThan(0);
    const rows = buildWorkings([mixed], 'AR6', 2025);
    expect(rows.filter(r => r.result_tco2e > 0).map(r => r.stream).sort()).toEqual(['diesel_stationary', 'electricity', 'electricity']);
    expect(rows.filter(r => r.declaration === 'unpriced').map(r => r.stream)).toEqual(['natural_gas']);
    expect(pctEstimated({ locations: [mixed], reporting_year: 2025 }, 'AR6')).toBe(pctEstimated({ locations: [without], reporting_year: 2025 }, 'AR6'));
    // The message names the fuel, the site, the unit, the publisher and the units it does price.
    expect(gate(mixed)).toEqual([{ locId: 'M', fuelType: 'natural_gas', status: 'factor_missing', field: 'natural_gas_amount',
      message: 'Natural gas at Mixed is recorded in m³, and MfE 2026 v2 publishes no factor this figure can be converted to exactly, so it is not counted. Enter it in therms, MMBtu or kWh, or reject the bill. Export is blocked until this is resolved.' }]);
  });

  describe('refrigerants', () => {
    const site = (type: string) => loc({ name: 'Depot', country: 'US', has_hfc_refrigerants: true, refrigerant_type: type, refrigerant_purchased_kg: 50 });
    for (const [name, type] of [['an unrecognised type', 'r999x'], ['a blank type', '']] as const) {
      it(`${name} with 50 kg: an unpriced line, the issue, and a fugitive 0 that is not a priced zero`, () => {
        const l = site(type);
        expect(unpricedLines(l).map(u => [u.reason, u.field, u.amount, u.unit])).toEqual([['refrigerant_unknown', 'refrigerant_purchased_kg', 50, 'kg']]);
        expect(gate(l).map(i => i.message)).toEqual(['The refrigerant type at Depot is not one we hold a GWP for, so it is not counted. Choose the refrigerant type. Export is blocked until it is chosen.']);
        expect(calcLocation(l, 'AR6', 2025).s1_fugitive).toBe(0);
        const row = buildWorkings([l], 'AR6', 2025).find(r => r.stream === 'refrigerants')!;
        expect(row.declaration).toBe('unpriced');
        expect(row.result_tco2e, 'not a priced zero').toBeNull();
        expect(row.activity_data).toBe(50);
      });
    }
    it('choosing a held type clears the issue and prices at kg x GWP', () => {
      const l = site('r410a');
      expect(unpricedLines(l)).toEqual([]);
      expect(gate(l)).toEqual([]);
      expect(calcLocation(l, 'AR6', 2025).s1_fugitive).toBeCloseTo(50 * 2256 / 1000, 12);
      const row = buildWorkings([l], 'AR6', 2025).find(r => r.stream === 'refrigerants')!;
      expect(row.declaration).toBeUndefined();
      expect(row.result_tco2e).toBeCloseTo(50 * 2256 / 1000, 12);
    });
    it('ammonia is unchanged: no line, no issue', () => {
      const l = loc({ ...site(''), uses_ammonia: true });
      expect(unpricedLines(l)).toEqual([]);
      expect(gate(l)).toEqual([]);
      expect(calcLocation(l, 'AR6', 2025).s1_fugitive).toBe(0);
    });
    it('source: no REFRIGERANT_GWP read anywhere falls back to ?? 0', () => {
      const root = join(__dirname, '..', '..');
      const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap(n => {
        const rel = `${dir}/${n}`;
        if (n === 'node_modules' || n.startsWith('.')) return [];
        return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [rel] : [];
      });
      const hits = [...walk('lib'), ...walk('app')].flatMap(f => stripTsComments(readFileSync(join(root, f), 'utf8')).split('\n')
        .filter(l => /REFRIGERANT_GWP\b/.test(l) && /\?\?\s*0\b/.test(l)).map(l => `${f}: ${l.trim()}`));
      expect(hits).toEqual([]);
      expect(readFileSync(join(root, 'lib/ghg/engine.ts'), 'utf8')).toContain('REFRIGERANT_GWP[type]?.[gwpVersion]');
    });
  });

  describe('Canada: natural gas needs the province', () => {
    const ca = (o: Partial<Location> = {}) => loc({ name: 'Moncton', country: 'CA', grid_region: '', province: '', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3', ...o });
    it('no province: unpriced with the province issue, and NOT priced at 1.921', () => {
      const l = ca();
      expect(unpricedLines(l).map(u => u.reason)).toEqual(['province_missing']);
      expect(gate(l).map(i => i.message)).toEqual(['The province for Moncton is not set, so its natural gas is not counted. Choose the province. Export is blocked until it is chosen.']);
      expect(calcInventory([l], 'AR6', 2025).s1_total).toBe(0);
      expect(() => calcGas(pickEF(l, 'natural_gas_m3').factor, 1000, 'AR6')).toThrow(MissingEmissionFactorError);
      // Every unit, not just m3: the province selects the factor whatever the gas is billed in.
      for (const unit of ['mcf', 'kwh', 'therms', 'mmbtu'] as const)
        expect(unpricedLines(ca({ natural_gas_unit: unit })).map(u => u.reason), unit).toEqual(['province_missing']);
    });
    it('an unrecognised province says so, by its own value', () => {
      expect(gate(ca({ grid_region: 'ZZ' })).map(i => i.message)).toEqual(['The province for Moncton (ZZ) is not one we hold a natural gas factor for, so its natural gas is not counted. Choose the province. Export is blocked until it is chosen.']);
    });
    it("choosing ON prices at Ontario's value, AB at Alberta's, and clears the issue", () => {
      const on = ca({ grid_region: 'ON', province: 'ON' }), ab = ca({ grid_region: 'AB', province: 'AB' });
      expect(gate(on)).toEqual([]);
      expect(pickEF(on, 'natural_gas_m3').factor).toEqual({ co2: 1.921, ch4: 0.000037, n2o: 0.000035 });
      expect(pickEF(ab, 'natural_gas_m3').factor).toEqual({ co2: 1.962, ch4: 0.000037, n2o: 0.000035 });
      // FI2: per Mcf at the EXACT 28.316846592 m3/Mcf (NIST SP 811), not the rounded 1000/35.3147 it used to be.
      expect(pickEF(on, 'natural_gas_mcf').factor.co2).toBeCloseTo(1.921 * 28.316846592, 12);
      expect(calcInventory([on], 'AR6', 2025).s1_total).toBeCloseTo(calcGas(pickEF(on, 'natural_gas_m3').factor, 1000, 'AR6').total, 12);
    });
    it('source: the Ontario fallback value is gone from EF_CA', () => {
      const src = readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8');
      const table = src.slice(src.indexOf('const EF_CA = {'), src.indexOf('const EF_CA_NG_CO2_M3'));
      expect(table).not.toMatch(/natural_gas_m3:\s*\{\s*co2/);
      expect(table).not.toMatch(/natural_gas_mcf:\s*\{\s*co2/);
    });
  });

  describe('country refusals are unchanged', () => {
    it('an unsupported country is still excluded, stated, and does not block', () => {
      const jp = loc({ name: 'Osaka', country: 'JP', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' });
      const [u] = findUnpriceableLocations([jp], 'AR6', 2025);
      expect(u.kind === 'country' && u.refusal.state).toBe('country_not_supported');
      expect(u.kind === 'country' && refusalIsFixable(u.refusal)).toBe(false);
      expect(unpricedLines(jp)).toEqual([]);
      expect(gate(jp)).toEqual([]);
      expect(buildWorkings([jp], 'AR6', 2025).map(r => r.declaration)).toEqual(['country_not_supported']);
    });
    it('a not-listed country still blocks (fixable), and has no line-level issue', () => {
      const xx = loc({ name: 'Somewhere', country: 'Atlantis', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' });
      const [u] = findUnpriceableLocations([xx], 'AR6', 2025);
      expect(u.kind === 'country' && u.refusal.state).toBe('country_not_listed');
      expect(u.kind === 'country' && refusalIsFixable(u.refusal)).toBe(true);
      expect(unpricedLines(xx)).toEqual([]);
    });
  });

  it('monthly and annual agree with an unpriced line present: reconcile reports zero unexplained', () => {
    const b = (id: string, value: number, unit: string, fuelType: string, document_type: string) =>
      ({ ...doc(document_type, [prop({ fuelType, value, unit, periodStart: '2025-01-01', periodEnd: '2025-12-31' })], id), file_name: `${id}.pdf` });
    const l = loc({ name: 'Mixed', country: 'NZ', grid_region: 'NZ', has_natural_gas: true, natural_gas_unit: 'm3',
      source_docs: [b('gas', 1000, 'm3', 'natural_gas', 'utility_bill_gas'), b('power', 20_000, 'kwh', 'electricity', 'utility_electricity')] });
    const inv = { locations: [l], reporting_year: 2025 };
    expect(unpricedLines(deriveLocations(inv)[0]).map(u => u.field)).toEqual(['natural_gas_amount']);
    const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion };
    const r = reconcile(buildMonthlyEmissions(inv, deps, 'AR6').slices, inv, 'AR6');
    expect(r.reconciles).toBe(true);
    expect(r.scope2_evidenced).toBeGreaterThan(0);
  });

  it('no message carries an em dash', () => {
    const all = [UNPRICED_MESSAGE.factor_missing('Natural gas', 'A', 'm³', 'P', ['kWh']), UNPRICED_MESSAGE.factor_missing('Natural gas', 'A', 'm³', 'P', []),
      UNPRICED_MESSAGE.refrigerant_unknown('A'), UNPRICED_MESSAGE.province_missing('A', null), UNPRICED_MESSAGE.province_missing('A', 'ZZ')];
    for (const m of all) expect(m).not.toContain('\u2014');
  });
});

// ── FI1 diff 2: consumers. The monthly split, and every issue clearing the moment its input is fixed ────
describe('FI1 consumers', () => {
  const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion };
  const bill = (id: string, document_type: string, fuelType: string, value: number, unit: string) =>
    ({ ...doc(document_type, [prop({ fuelType, value, unit, periodStart: '2025-01-01', periodEnd: '2025-06-30' })], id), file_name: `${id}.pdf` });

  it('monthly: an unpriced bill is skipped with factor_missing, and reconcile reports zero unexplained', () => {
    const l = loc({ name: 'Leeds', country: 'NZ', grid_region: 'NZ', has_natural_gas: true, natural_gas_unit: 'm3',
      source_docs: [bill('gas', 'utility_bill_gas', 'natural_gas', 900, 'm3'), bill('power', 'utility_electricity', 'electricity', 20_000, 'kwh')] });
    const inv = { locations: [l], reporting_year: 2025 };
    const m = buildMonthlyEmissions(inv, deps, 'AR6');
    expect(m.skipped).toContainEqual({ fuelType: 'natural_gas', document_type: 'utility_bill_gas', reason: 'factor_missing' });
    expect(m.slices.every(x => x.fuel_type === 'electricity')).toBe(true);
    const r = reconcile(m.slices, inv, 'AR6');
    expect(r.reconciles).toBe(true);
    expect(r.unexplained_delta).toBeCloseTo(0, 6);
  });

  it('monthly: Canadian gas with no province is skipped with province_missing', () => {
    const l = loc({ name: 'Moncton', country: 'CA', grid_region: '', province: '', has_natural_gas: true, natural_gas_unit: 'm3',
      source_docs: [bill('gas', 'utility_bill_gas', 'natural_gas', 900, 'm3')] });
    const m = buildMonthlyEmissions({ locations: [l], reporting_year: 2025 }, deps, 'AR6');
    expect(m.skipped).toContainEqual({ fuelType: 'natural_gas', document_type: 'utility_bill_gas', reason: 'province_missing' });
    expect(m.slices).toEqual([]);
  });

  it('monthly: the location-level unpriceable skip is gone, because the country check already covers it', () => {
    const src = stripTsComments(readFileSync(join(process.cwd(), 'lib/ghg/monthlyEmissions.ts'), 'utf8'));
    expect(src).not.toContain('location excluded: unpriceable');
    expect(src).not.toContain('findUnpriceableLocations');
    // A refused location still writes nothing, and says so, through the country check.
    const jp = loc({ name: 'Osaka', country: 'JP', grid_region: 'US_CA', electricity_kwh: 1000,
      source_docs: [bill('power', 'utility_electricity', 'electricity', 20_000, 'kwh')] });
    const m = buildMonthlyEmissions({ locations: [jp], reporting_year: 2025 }, deps, 'AR6');
    expect(m.slices).toEqual([]);
    expect(m.skipped).toContainEqual({ fuelType: 'all', document_type: 'all', reason: 'location excluded: country_not_supported' });
  });

  it('each issue clears the moment its input is fixed: unit, refrigerant type, province', () => {
    // The page derives on every render (deriveLocations of the live inventory), so these are what it shows.
    const issues = (l: Location) => findUnresolvedCoverage([l], 2025, 12, []).filter(i => UNPRICED_STATUSES.has(i.status)).map(i => i.status);
    const gas = loc({ name: 'A', country: 'NZ', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'm3' });
    expect(issues(gas)).toEqual(['factor_missing']);
    expect(issues({ ...gas, natural_gas_unit: 'kwh' })).toEqual([]);
    const ref = loc({ name: 'A', country: 'US', has_hfc_refrigerants: true, refrigerant_type: 'r999x', refrigerant_purchased_kg: 50 });
    expect(issues(ref)).toEqual(['refrigerant_unknown']);
    expect(issues({ ...ref, refrigerant_type: 'r134a' })).toEqual([]);
    const ca = loc({ name: 'A', country: 'CA', grid_region: '', province: '', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'm3' });
    expect(issues(ca)).toEqual(['province_missing']);
    // The page writes the province into grid_region as well (page.tsx updateLocation), so both are set.
    expect(issues({ ...ca, province: 'QC', grid_region: 'QC' })).toEqual([]);
    // From bills too: the figure is derived, so fixing the bill's unit clears it with no save.
    const fromBill = loc({ name: 'A', country: 'NZ', has_natural_gas: true, natural_gas_unit: 'kwh', source_docs: [bill('g', 'utility_bill_gas', 'natural_gas', 50, 'm3')] });
    expect(unpricedLines(deriveLocations({ locations: [fromBill], reporting_year: 2025 })[0]).map(u => u.reason)).toEqual(['factor_missing']);
    const fixed = { ...fromBill, source_docs: [bill('g', 'utility_bill_gas', 'natural_gas', 50, 'kwh')] };
    expect(unpricedLines(deriveLocations({ locations: [fixed], reporting_year: 2025 })[0])).toEqual([]);
  });
});

// ── FI2 diff 1: the exact conversion table, and every priced value cited by the table that supplied it ─────────────
// docs/review/design-derived-figures.md "FI2". The US fallback in pickEF is still here (diff 2 removes it); what this
// diff guarantees is that a row never cites one publisher while its value came from another's table.
describe('FI2 exact conversions and honest provenance', () => {
  const close = (a: number, b: number) => Math.abs(a - b) <= Number.EPSILON * Math.max(Math.abs(a), Math.abs(b))

  it('each exact constant equals its definition to full precision, written as published', () => {
    const X = EXACT_CONVERSIONS;
    expect(String(X.L_PER_US_GALLON)).toBe('3.785411784');
    expect(String(X.M3_PER_FT3)).toBe('0.028316846592');
    expect(String(X.M3_PER_MCF)).toBe('28.316846592');
    expect(String(X.M3_PER_CCF)).toBe('2.8316846592');
    expect(String(X.GJ_PER_THERM)).toBe('0.105505585262');
    expect(String(X.GJ_PER_MMBTU)).toBe('1.05505585262');
    expect(String(X.GJ_PER_KWH)).toBe('0.0036');
    expect(String(X.GJ_PER_MJ)).toBe('0.001');
    expect(String(X.KG_PER_LB)).toBe('0.45359237');
    // And each from the definition it states.
    expect(close(X.L_PER_US_GALLON, 231 * 0.0254 ** 3 * 1000)).toBe(true);     // 231 in³, inch = 0.0254 m
    expect(close(X.M3_PER_FT3, 0.3048 ** 3)).toBe(true);                         // foot = 0.3048 m
    expect(close(X.M3_PER_MCF, 1000 * X.M3_PER_FT3)).toBe(true);
    expect(close(X.M3_PER_CCF, 100 * X.M3_PER_FT3)).toBe(true);
    expect(close(X.GJ_PER_MMBTU, 1e6 * 1055.05585262 / 1e9)).toBe(true);         // Btu_IT = 1,055.05585262 J
    expect(close(X.GJ_PER_THERM, 1e5 * 1055.05585262 / 1e9)).toBe(true);
    expect(close(X.GJ_PER_KWH, 3.6e6 / 1e9)).toBe(true);                         // kWh = 3.6 MJ
    expect(close(KWH_PER_GJ, 1 / X.GJ_PER_KWH)).toBe(true);
    // The names the engine already used are the table's, not second copies.
    expect(L_PER_GAL).toBe(X.L_PER_US_GALLON);
    expect(GJ_PER_MMBTU).toBe(X.GJ_PER_MMBTU);
    expect(M3_PER_MCF_EXACT).toBe(X.M3_PER_MCF);
    expect(M3_PER_MCF, 'the engine uses the exact value').toBe(X.M3_PER_MCF);
  });

  it('mcf and ccf round-trip with m3', () => {
    for (const x of [1, 3.7, 1234.5678, 1e6]) {
      expect(close((x * EXACT_CONVERSIONS.M3_PER_MCF) / EXACT_CONVERSIONS.M3_PER_MCF, x)).toBe(true);
      expect(close((x * EXACT_CONVERSIONS.M3_PER_CCF) / EXACT_CONVERSIONS.M3_PER_CCF, x)).toBe(true);
      expect(close(x * EXACT_CONVERSIONS.M3_PER_CCF * 10, x * EXACT_CONVERSIONS.M3_PER_MCF)).toBe(true);
    }
  });

  it('source: the rounded Mcf factor and the "(IEA)" label are gone', () => {
    expect(stripTsComments(readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8'))).not.toContain('35.3147');
    expect(readFileSync(join(process.cwd(), 'lib/unitConversions.ts'), 'utf8')).not.toMatch(/GJ_PER_MMBTU = 1\.05505585262;\s*\/\/.*\(IEA\)/);
  });

  // Every country, fuel and unit a location can store (the Location type's unions); CA with a province.
  const TABLE_BY_SOURCE = new Map<string, Record<string, any>>([
    [EF_SOURCES.combustion, EF], [EF_SOURCES.combustion_ca, EF_CA], [EF_SOURCES.combustion_uk, EF_UK],
    [EF_SOURCES.combustion_eu, EF_EU], [EF_SOURCES.combustion_au, EF_AU], [EF_SOURCES.combustion_nz, EF_NZ.commercial],
  ]);
  const LINES: [keyof Location, keyof Location, Partial<Location>, string[]][] = [
    ['natural_gas_amount', 'natural_gas_unit', { has_natural_gas: true }, ['mcf', 'therms', 'mmbtu', 'm3', 'kwh']],
    ['propane_amount', 'propane_unit', { has_propane: true }, ['gallons', 'litres', 'kg']],
    ['diesel_stationary_amount', 'diesel_stationary_unit', { has_diesel_stationary: true }, ['gallons', 'litres']],
    ['fuel_oil_distillate_amount', 'fuel_oil_distillate_unit', { has_fuel_oil_distillate: true }, ['gallons', 'litres']],
    ['fuel_oil_residual_amount', 'fuel_oil_residual_unit', { has_fuel_oil_residual: true }, ['gallons', 'litres']],
    ['gasoline_amount', 'gasoline_unit', { has_mobile: true }, ['gallons', 'litres']],
    ['diesel_mobile_amount', 'diesel_mobile_unit', { has_mobile: true }, ['gallons', 'litres']],
  ];
  const COUNTRIES = ['US', 'CA', 'GB', ...EU_COUNTRIES, 'AU', 'NZ'];

  it('publisher matches value: every priced row is found in the table its ef_source names, under the key it records', () => {
    let checked = 0, fellBack = 0;
    for (const country of COUNTRIES) for (const [field, unitField, on, units] of LINES) for (const unit of units) {
      const l = loc({ country, grid_region: country === 'CA' ? 'ON' : '', ...on, [field]: 1000, [unitField]: unit } as Partial<Location>);
      for (const r of buildWorkings([l], 'AR6', 2025).filter(r => r.scope === 1 && r.declaration === undefined && r.factor_key)) {
        const label = `${country} ${String(field)} in ${unit}`;
        const table = TABLE_BY_SOURCE.get(r.ef_source);
        expect(table, `${label}: cites "${r.ef_source}", which is no combustion table`).toBeDefined();
        // The value applied, after the recorded exact conversion (FI2 diff 2: conversion_factor = held units per unit entered).
        const ratio = r.conversion_factor ?? 1;
        if (r.conversion_factor !== undefined) expect(r.conversion_note, `${label}: a converted row states its conversion`).toMatch(/converted to .*, exact\)\.$/);
        const shownCo2 = Number(String(r.emission_factor).match(/(?:CO2|CO₂e) ([\d.e-]+)/)![1]);
        let expected: number;
        if (table === EF_CA && /^natural_gas_(m3|mcf)$/.test(r.factor_key)) {
          // Canadian gas: the province's ECCC value (EF_CA_NG_CO2_M3), per m3 or per Mcf at the exact factor.
          expected = EF_CA_NG_CO2_M3.ON * ratio;
        } else if (table === EF_CA && r.factor_key === 'natural_gas_gj') {
          // FI3 (R12): per GJ gross, the province's per-m3 value / 0.03859 GJ per m3 (NIR Table A4-2), computed.
          expected = EF_CA_NG_CO2_M3.ON / 0.03859 * ratio;
        } else {
          expect(table![r.factor_key], `${label}: "${r.factor_key}" is not in the table the row cites`).toBeDefined();
          expected = table![r.factor_key].co2 * ratio;
        }
        expect(Math.abs(shownCo2 - expected) / expected, `${label}: value ${shownCo2} is not ${r.ef_source}'s ${r.factor_key}`).toBeLessThan(1e-9);
        // The edition is the same table's.
        expect(r.factor_vintage, label).toBe(pickEF(l, r.factor_key).publisher?.edition);
        if (country !== 'US' && table === EF) fellBack++;   // FI2 diff 2: must stay 0
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(fellBack, 'FI2 diff 2: no row outside the US is priced from the US table').toBe(0);
  });

  it('every former fallback case now prices from its own table through an exact conversion, or is unpriced (FI2 diff 2)', () => {
    // Diff 1's table of rows the US fallback priced, case by case. [country, field, unit, outcome] where the outcome is
    // the table key the value now comes from, or 'unpriced'.
    const CASES: [string, keyof Location, string, string][] = [
      // FI3: CA gas in energy units via the national heat content (R12); EU gas in energy units via the gross kWh key (R7).
      ['CA', 'natural_gas_amount', 'therms', 'natural_gas_gj'], ['CA', 'natural_gas_amount', 'mmbtu', 'natural_gas_gj'],
      ['GB', 'natural_gas_amount', 'mcf', 'natural_gas_m3'], ['GB', 'natural_gas_amount', 'therms', 'natural_gas_kwh'], ['GB', 'natural_gas_amount', 'mmbtu', 'natural_gas_kwh'],
      ['DE', 'natural_gas_amount', 'therms', 'natural_gas_kwh'], ['DE', 'natural_gas_amount', 'mmbtu', 'natural_gas_kwh'],
      ['AU', 'natural_gas_amount', 'mcf', 'natural_gas_m3'], ['AU', 'natural_gas_amount', 'therms', 'natural_gas_gj'],
      ['AU', 'propane_amount', 'gallons', 'propane_litre'], ['AU', 'diesel_stationary_amount', 'gallons', 'diesel_litre'],
      ['AU', 'gasoline_amount', 'gallons', 'gasoline_litre'], ['AU', 'diesel_mobile_amount', 'gallons', 'diesel_mobile_litre'],
      ['NZ', 'natural_gas_amount', 'mcf', 'unpriced'], ['NZ', 'natural_gas_amount', 'therms', 'natural_gas_kwh'], ['NZ', 'natural_gas_amount', 'mmbtu', 'natural_gas_kwh'],
      ['NZ', 'propane_amount', 'gallons', 'unpriced'], ['NZ', 'propane_amount', 'litres', 'unpriced'],
      ['NZ', 'diesel_stationary_amount', 'gallons', 'diesel_litre'], ['NZ', 'gasoline_amount', 'gallons', 'gasoline_litre'], ['NZ', 'diesel_mobile_amount', 'gallons', 'diesel_mobile_litre'],
    ];
    const ON: Record<string, Partial<Location>> = { natural_gas_amount: { has_natural_gas: true }, propane_amount: { has_propane: true },
      diesel_stationary_amount: { has_diesel_stationary: true }, gasoline_amount: { has_mobile: true }, diesel_mobile_amount: { has_mobile: true } };
    const UNIT_FIELD: Record<string, keyof Location> = { natural_gas_amount: 'natural_gas_unit', propane_amount: 'propane_unit',
      diesel_stationary_amount: 'diesel_stationary_unit', gasoline_amount: 'gasoline_unit', diesel_mobile_amount: 'diesel_mobile_unit' };
    for (const [country, field, unit, outcome] of CASES) {
      const l = loc({ country, grid_region: country === 'CA' ? 'ON' : '', ...ON[field], [field]: 100, [UNIT_FIELD[field]]: unit } as Partial<Location>);
      const label = `${country} ${String(field)} in ${unit}`;
      const rows = buildWorkings([l], 'AR6', 2025).filter(r => r.scope === 1 && r.stream && r.stream !== 'refrigerants');
      if (outcome === 'unpriced') {
        expect(rows.map(r => r.declaration), label).toContain('unpriced');
        expect(unpricedLines(l).map(u => u.field), label).toEqual([field]);
        continue;
      }
      const r = rows.find(x => x.declaration === undefined)!;
      expect(r.factor_key, label).toBe(outcome);
      expect(r.ef_source, `${label}: cites its own publisher`).not.toBe(EF_SOURCES.combustion);
      expect(r.conversion_note, `${label}: states the exact conversion`).toMatch(/converted to .*\(1 .* = .*, exact\)\.$/);
      expect(r.note, label).toContain(r.conversion_note);
    }
  });

  it('calorific basis: AU kWh at 51.53 x 0.0036, EU kWh gross at MRR x 0.90 (FI3), UK therms via kWh at the DEFRA gross factor, NZ kWh with R4', () => {
    const au = loc({ country: 'AU', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' });
    expect(pickEF(au, 'natural_gas_kwh').factor.co2).toBeCloseTo(51.53 * 0.0036, 14);
    expect(calcInventory([au], 'AR6', 2025).s1_total).toBeCloseTo(1000 * 51.53 * 0.0036 / 1000, 12);
    const eu = loc({ name: 'Lyon', country: 'FR', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' });
    // FI3 (R7): EU gas in kWh is gross, as billed, and prices on MRR's net factor x 0.90.
    expect(unpricedLines(eu)).toEqual([]);
    expect(calcInventory([eu], 'AR6', 2025).s1_total).toBeCloseTo(calcGas(pickEF(eu, 'natural_gas_kwh').factor, 1000, 'AR6').total, 12);
    expect(pickEF(eu, 'natural_gas_kwh').factor.co2).toBe(0.181764);
    const uk = buildWorkings([loc({ country: 'GB', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'therms' })], 'AR6', 2025).find(r => r.stream === 'natural_gas')!;
    expect(uk.factor_key).toBe('natural_gas_kwh');
    expect(uk.result_tco2e).toBeCloseTo(100 * (0.105505585262 / 0.0036) * 0.18231 / 1000, 12);
    expect(uk.conversion_note).toBe('100 therms converted to 2,930.71 kWh (1 therm = 0.105505585262 GJ and 1 kWh = 0.0036 GJ, exact).');
    const nz = buildWorkings([loc({ country: 'NZ', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh' })], 'AR6', 2025).find(r => r.stream === 'natural_gas')!;
    expect(nz.note).toBe(NZ_GAS_BASIS_NOTE);
    expect(NZ_GAS_BASIS_NOTE).toContain('Measuring Emissions Guide, Appendix A (A.1), "we have used gross calorific values"');
  });

  it('a stored ccf value prices exactly; an unrecognised unit blocks, never prices as litres (ruling R5)', () => {
    const us = buildWorkings([loc({ country: 'US', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'ccf' })], 'AR6', 2025).find(r => r.stream === 'natural_gas')!;
    expect(us.factor_key).toBe('natural_gas_mcf');
    expect(us.result_tco2e).toBeCloseTo(calcInventory([loc({ country: 'US', has_natural_gas: true, natural_gas_amount: 10, natural_gas_unit: 'mcf' })], 'AR6', 2025).s1_total, 12);
    expect(us.conversion_note).toBe('100 Ccf converted to 10 Mcf (1 Ccf = 2.8316846592 m³ and 1 Mcf = 28.316846592 m³, exact).');
    const ca = buildWorkings([loc({ country: 'CA', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'ccf' })], 'AR6', 2025).find(r => r.stream === 'natural_gas')!;
    expect(ca.result_tco2e).toBeCloseTo(100 * 2.8316846592 * (1.921 + 0.000037 * 29.8 + 0.000035 * 273) / 1000, 12);
    for (const [field, unitField, on, unit] of [['propane_amount', 'propane_unit', { has_propane: true }, 'lbs-ish'], ['diesel_stationary_amount', 'diesel_stationary_unit', { has_diesel_stationary: true }, 'barrels']] as const) {
      const l = loc({ country: 'US', ...on, [field]: 100, [unitField]: unit } as unknown as Partial<Location>);
      expect(unpricedLines(l).map(u => [u.field, u.reason]), unit).toEqual([[field, 'factor_missing']]);
      expect(calcInventory([l], 'AR6', 2025).s1_total, unit).toBe(0);
    }
  });

  it('Canada CH4 and N2O per Mcf are the per-m3 rates x 28.316846592, exactly (ruling R5)', () => {
    const f = pickEF(loc({ country: 'CA', grid_region: 'ON' }), 'natural_gas_mcf');
    expect(f.factor.ch4).toBeCloseTo(0.000037 * 28.316846592, 15);
    expect(f.factor.n2o).toBeCloseTo(0.000035 * 28.316846592, 15);
    expect(f.key).toBe('natural_gas_m3');
  });

  it('every row priced through a property carries a derivation note naming the value and source, from its own table', () => {
    // The derived keys in force: EF_EU (densities and an energy content, FI3's list). A gallon or Mcf figure converts
    // exactly to one of them first, and still carries its note. FI2 follow-up: EF_AU per m3 left this list; it is NGA's
    // own printed 2.025129, and its row cites that (FI2d below).
    // FI3: each property and its document (R10). EU gas by volume and EU LPG in litres are unpriced, so not listed.
    const cases: [string, Partial<Location>, RegExp][] = [
      ['DE', { has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'kwh' }, /0\.90 net per gross \(IPCC 2006 Vol\. 2 Ch\. 1 section 1\.4\.1\.2/],
      ['DE', { has_diesel_stationary: true, diesel_stationary_amount: 100, diesel_stationary_unit: 'gallons' }, /832 kg\/m³ \(JEC Well-to-Tank report v5/],
      ['FR', { has_mobile: true, gasoline_amount: 100, gasoline_unit: 'litres' }, /743 kg\/m³ \(JEC Well-to-Tank report v5/],
      ['DE', { has_fuel_oil_residual: true, fuel_oil_residual_amount: 100, fuel_oil_residual_unit: 'litres' }, /970 kg\/m³ \(JEC Well-to-Tank report v5/],
    ];
    for (const [country, o, value] of cases) {
      const r = buildWorkings([loc({ country, ...o })], 'AR6', 2025).find(x => x.scope === 1 && x.stream && !x.declaration)!;
      expect(r.note, `${country} ${r.factor_key}`).toMatch(value);
      expect(TABLE_BY_SOURCE.get(r.ef_source), `${country}: the property is the publisher's own table, never another country's`).toBe(EF_EU);
    }
  });

  it('source: no fallback lookup in pickEF or anything it calls', () => {
    const src = stripTsComments(readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8'));
    const body = src.slice(src.indexOf('function pickEF('), src.indexOf('export function conversionNote('));
    expect(body.length).toBeGreaterThan(500);
    expect(body).not.toMatch(/\?\?\s*\(?EF\b/);
    expect(body).not.toMatch(/\(EF as [^)]*\)\[/);
    expect(body).not.toContain('COMBUSTION_TABLE_SOURCE.US');
  });

  it('the export source list names the table that priced each line', () => {
    const nzGallons = loc({ country: 'NZ', has_mobile: true, gasoline_amount: 100, gasoline_unit: 'gallons' });
    const nzLitres = loc({ id: 'L2', country: 'NZ', has_mobile: true, gasoline_amount: 100, gasoline_unit: 'litres' });
    // FI2 diff 2: NZ petrol in gallons now converts to MfE's per-litre factor, so both name MfE.
    expect(combustionSourcesFor([nzGallons])).toEqual([EF_SOURCES.combustion_nz]);
    expect(combustionSourcesFor([nzLitres, nzGallons])).toEqual([EF_SOURCES.combustion_nz]);
    // A location with no combustion keeps its country's citation, as before.
    expect(combustionSourcesFor([loc({ country: 'NZ', grid_region: 'NZ', electricity_kwh: 100 })])).toEqual([EF_SOURCES.combustion_nz]);
  });

  it('the only priced value that moves is Canadian gas per Mcf, by the exact factor', () => {
    const on = loc({ country: 'CA', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf' });
    const was = 1.921 * (1000 / 35.3147);
    const now = 1.921 * 28.316846592;
    expect(pickEF(on, 'natural_gas_mcf').factor.co2).toBeCloseTo(now, 12);
    expect(now - was).toBeCloseTo(0.0000512602, 9);
    // Everything else at a Canadian site is unchanged: per m3 is the province's value as published.
    expect(pickEF(on, 'natural_gas_m3').factor.co2).toBe(1.921);
  });
});

// ── FI2 diff 3: EPA's printed columns, and a note on every row whose value is not printed as applied ─────────────────
describe('FI2c. US keys are EPA Table 1 as printed; every derived row says how it was derived', () => {
  const TABLE_1 = 'US EPA GHG Emission Factors Hub, Table 1'
  const fuels = (o: Partial<Location>) => loc({ ...o, has_natural_gas: true, has_propane: true, has_diesel_stationary: true,
    has_fuel_oil_distillate: true, has_fuel_oil_residual: true, has_mobile: true, natural_gas_amount: 1000, propane_amount: 1000,
    diesel_stationary_amount: 1000, fuel_oil_distillate_amount: 1000, fuel_oil_residual_amount: 1000, gasoline_amount: 1000,
    diesel_mobile_amount: 1000 })
  const rowsOf = (l: Location) => (buildWorkings([l], 'AR6', 2025, [], 12) as { declaration?: boolean; scope?: number; source: string; note?: string; result_tco2e: number }[])
    .filter(r => !r.declaration && r.scope === 1)

  it('FI2c1 each replaced US value equals the Table 1 figure (per scf x 1,000 for per Mcf)', () => {
    // Table 1, Stationary Combustion: Natural Gas 0.05444 kg CO2, 0.00103 g CH4, 0.0001 g N2O per scf; Distillate Fuel
    // Oil No. 2 10.21 kg, 0.41 g, 0.08 g; Motor Gasoline 8.78 kg, 0.38 g, 0.08 g; Propane 5.72 kg, 0.27 g, 0.05 g;
    // Residual Fuel Oil No. 6 11.27 kg, 0.45 g, 0.09 g, per gallon. Stored in kg: g / 1,000.
    const perScf = { co2: 0.05444, ch4: 0.00103 / 1000, n2o: 0.0001 / 1000 }
    for (const g of ['co2', 'ch4', 'n2o'] as const) expect(EF.natural_gas_mcf[g], g).toBeCloseTo(perScf[g] * 1000, 12)
    const distillate = { co2: 10.21, ch4: 0.41 / 1000, n2o: 0.08 / 1000 }
    for (const k of ['diesel_gallon', 'fuel_oil_gallon', 'fuel_oil_distillate_gallon', 'diesel_mobile_gallon'] as const) {
      for (const g of ['co2', 'ch4', 'n2o'] as const) expect((EF as any)[k][g], `${k} ${g}`).toBeCloseTo(distillate[g], 12)
    }
    const per = (co2: number, ch4_g: number, n2o_g: number) => ({ co2, ch4: ch4_g / 1000, n2o: n2o_g / 1000 })
    const printed: [keyof typeof EF, ReturnType<typeof per>][] = [
      ['gasoline_gallon', per(8.78, 0.38, 0.08)], ['propane_gallon', per(5.72, 0.27, 0.05)], ['fuel_oil_residual_gallon', per(11.27, 0.45, 0.09)]]
    for (const [k, v] of printed) for (const g of ['co2', 'ch4', 'n2o'] as const) expect((EF as any)[k][g], `${k} ${g}`).toBeCloseTo(v[g], 12)
    // The per-mmBtu key is EPA's own column and did not move.
    expect(EF.natural_gas_mmbtu).toEqual({ co2: 53.06, ch4: 0.001, n2o: 0.0001 })
  })

  it('FI2c2 1,000 units at AR6 on the printed columns', () => {
    const t = (k: keyof typeof EF) => calcGas(EF[k] as any, 1000, 'AR6').total
    expect(t('natural_gas_mcf')).toBeCloseTo(54.497994, 9)
    expect(t('propane_gallon')).toBeCloseTo(5.741696, 9)
    expect(t('fuel_oil_distillate_gallon')).toBeCloseTo(10.244058, 9)
    expect(t('fuel_oil_residual_gallon')).toBeCloseTo(11.30798, 9)
    expect(t('gasoline_gallon')).toBeCloseTo(8.813164, 9)
  })

  it('FI2c3 every US row priced from a printed per-unit column cites Table 1 and the printed figures', () => {
    const rows = rowsOf(fuels({ country: 'US', state: 'NY', natural_gas_unit: 'mcf', propane_unit: 'gallons', diesel_stationary_unit: 'gallons',
      fuel_oil_distillate_unit: 'gallons', fuel_oil_residual_unit: 'gallons', gasoline_unit: 'gallons', diesel_mobile_unit: 'gallons' }))
    expect(rows).toHaveLength(7)
    const noteOf = (src: string) => rows.find(r => r.source === src)!.note ?? ''
    expect(noteOf('Natural gas')).toBe(`${TABLE_1}, Natural Gas, per scf: 0.05444 kg CO2, 0.00103 g CH4, 0.0001 g N2O; per Mcf is per scf × 1,000`)
    expect(noteOf('Propane')).toBe(`${TABLE_1}, Propane, per gallon: 5.72 kg CO2, 0.27 g CH4, 0.05 g N2O`)
    for (const src of ['Diesel (stationary)', 'Heating oil', 'Diesel (mobile)']) {
      expect(noteOf(src), src).toBe(`${TABLE_1}, Distillate Fuel Oil No. 2, per gallon: 10.21 kg CO2, 0.41 g CH4, 0.08 g N2O`)
    }
    expect(noteOf('Heavy fuel oil')).toBe(`${TABLE_1}, Residual Fuel Oil No. 6, per gallon: 11.27 kg CO2, 0.45 g CH4, 0.09 g N2O`)
    expect(noteOf('Gasoline (mobile)')).toBe(`${TABLE_1}, Motor Gasoline, per gallon: 8.78 kg CO2, 0.38 g CH4, 0.08 g N2O`)
    for (const r of rows) expect(r.note ?? '', r.source).not.toContain('\u2014')
    // A converted entry carries the conversion AND the citation; the per-mmBtu key needs neither.
    const m3 = rowsOf(loc({ country: 'US', state: 'NY', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' }))[0]
    expect(m3.note).toContain('converted to')
    expect(m3.note).toContain(`${TABLE_1}, Natural Gas, per scf`)
    const mmbtu = rowsOf(loc({ country: 'US', state: 'NY', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mmbtu' }))[0]
    expect(mmbtu.note ?? '').not.toContain(TABLE_1)
  })

  it('FI2c4 every AU row cites NGA\'s printed per-unit figure (FI2 follow-up supersedes fi2c\'s derivation notes)', () => {
    const rows = rowsOf(fuels({ country: 'AU', state: 'VIC', grid_region: 'AU_VIC', natural_gas_unit: 'm3', propane_unit: 'litres',
      diesel_stationary_unit: 'litres', fuel_oil_distillate_unit: 'litres', fuel_oil_residual_unit: 'litres', gasoline_unit: 'litres',
      diesel_mobile_unit: 'litres' }))
    expect(rows).toHaveLength(7)
    const noteOf = (src: string) => rows.find(r => r.source === src)!.note ?? ''
    const NGA = 'DCCEEW NGA 2025, Energy - Scope 1 sheet'
    const DIESEL = `${NGA} (Table 8), Diesel oil: 2,709.72 kg CO2-e/kL; per litre is per kL ÷ 1,000`
    expect(noteOf('Diesel (stationary)')).toBe(DIESEL)
    expect(noteOf('Diesel (mobile)'), 'the stationary row, as before (FI9)').toBe(DIESEL)
    expect(noteOf('Gasoline (mobile)')).toBe(`${NGA} (Table 8), Automotive gasoline/petrol: 2,318.76 kg CO2-e/kL; per litre is per kL ÷ 1,000`)
    expect(noteOf('Propane')).toBe(`${NGA} (Table 8), Liquefied petroleum gas (LPG): 1,557.42 kg CO2-e/kL; per litre is per kL ÷ 1,000`)
    expect(noteOf('Heating oil')).toBe(`${NGA} (Table 8), Heating oil: 2,600.929 kg CO2-e/kL; per litre is per kL ÷ 1,000`)
    expect(noteOf('Heavy fuel oil')).toBe(`${NGA} (Table 8), Fuel oil: 2,931.448 kg CO2-e/kL; per litre is per kL ÷ 1,000`)
    expect(noteOf('Natural gas')).toBe(`${NGA} (Table 5), Natural gas distributed in a pipeline: 2.025129 kg CO2-e/m³`)
    // No row still shows fi2c's arithmetic or its table references.
    for (const r of rows) {
      expect(r.note ?? '', r.source).not.toMatch(/rounded to|Table 4|Table 1\b/)
      expect(r.note ?? '', r.source).not.toContain('\u2014')
    }
    // A gallons entry converts exactly to the per-litre value, and carries the conversion and the citation.
    const gal = rowsOf(loc({ country: 'AU', state: 'VIC', grid_region: 'AU_VIC', has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 100, fuel_oil_distillate_unit: 'gallons' }))[0]
    expect(gal.note).toContain('converted to')
    expect(gal.note).toContain(`${NGA} (Table 8), Heating oil`)
  })

  it('FI2c5 every key of every table is either printed by its publisher or carries a derivation note', () => {
    // The tables whose values are the publisher's own printed figure: US (FI2c) and AU (FI2 follow-up) cite where it is
    // printed, per key; CA, UK and NZ cite the table. The derived one, EU, carries EU_DERIVATION. natural_gas_gj is NGA's
    // own per-GJ figure and, like EPA's per-mmBtu keys, carries no note beyond the citation.
    const src = readFileSync(join(process.cwd(), 'lib/ghg/engine.ts'), 'utf8')
    const block = src.slice(src.indexOf('const AU_PUBLISHED_NOTE: Record<string, string> = {'), src.indexOf('function auPublishedNote('))
    expect(block.length).toBeGreaterThan(200)
    for (const k of Object.keys(EF_AU)) {
      if (k === 'natural_gas_gj') continue
      expect(block.includes(`  ${k}:`) || block.includes(`${k}: 'diesel_litre'`), `AU ${k} cites NGA`).toBe(true)
    }
    const us = src.slice(src.indexOf('const US_PUBLISHED_NOTE: Record<string, string> = {'), src.indexOf('const US_PUBLISHED_NOTE') + 2000)
    for (const k of Object.keys(EF)) {
      if (['natural_gas_mmbtu', 'ammonia', 'steam_mmbtu'].includes(k)) continue
      expect(us, `US ${k} cites Table 1`).toContain(`  ${k}:`)
    }
  })
})

// ── FI2 follow-up (7 Oct 2026): DEFRA's per-m3 gas row, NGA's printed per-unit figures, and the methods tables ─────
describe('FI2d. publishers\' own per-unit values, and methods tables that agree with the rows', () => {
  const rowsOf = (l: Location) => (buildWorkings([l], 'AR6', 2025, [], 12) as { declaration?: boolean; scope?: number; stream?: string; source: string; note?: string; factor_key?: string; result_tco2e: number | null }[])
    .filter(r => !r.declaration && r.scope === 1)
  const ukGas = (unit: Location['natural_gas_unit'], amount: number) =>
    loc({ country: 'GB', grid_region: 'UK', has_natural_gas: true, natural_gas_amount: amount, natural_gas_unit: unit })

  it('FI2d1 EF_UK.natural_gas_m3 is DEFRA 2026 row 1_100_1004_1_1, combined, and 1,000 m3 prices at 2.02633 t CO2e', () => {
    expect(EF_UK.natural_gas_m3).toEqual({ co2: 2.02633, ch4: 0, n2o: 0 })
    // The gas split DEFRA prints beside it sums to the combined figure.
    expect(2.02231 + 0.00307 + 0.00095).toBeCloseTo(2.02633, 10)
    const [r] = rowsOf(ukGas('m3', 1000))
    expect(r.factor_key).toBe('natural_gas_m3')
    expect(r.result_tco2e).toBeCloseTo(2.02633, 12)
    expect(r.note ?? '', 'priced in the unit DEFRA prints: no conversion').not.toContain('converted')
    // GWP as published: the figure does not move with the AR set.
    for (const g of ['AR4', 'AR5'] as const) expect(calcInventory([ukGas('m3', 1000)], g, 2025).s1_total).toBeCloseTo(2.02633, 12)
  })

  it('FI2d2 UK gas in Mcf and Ccf prices on the m3 row through the exact conversion, stated on the row', () => {
    const [mcf] = rowsOf(ukGas('mcf', 10))
    expect(mcf.factor_key).toBe('natural_gas_m3')
    expect(mcf.result_tco2e).toBeCloseTo(10 * M3_PER_MCF_EXACT * 2.02633 / 1000, 12)
    expect(mcf.note).toBe('10 Mcf converted to 283.17 m³ (1 Mcf = 28.316846592 m³, exact).')
    const [ccf] = rowsOf(ukGas('ccf', 100))
    expect(ccf.factor_key).toBe('natural_gas_m3')
    expect(ccf.result_tco2e).toBeCloseTo(100 * 2.8316846592 * 2.02633 / 1000, 12)
    expect(ccf.note).toBe('100 Ccf converted to 283.17 m³ (1 Ccf = 2.8316846592 m³, exact).')
    expect(unpricedLines(ukGas('ccf', 100))).toEqual([])
    // ccf is a stored unit (FI2 diff 2) the wizard does not offer yet (FI5): a US ccf figure also prices, on EPA's Mcf.
    const [us] = rowsOf(loc({ country: 'US', state: 'NY', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'ccf' }))
    expect(us.factor_key).toBe('natural_gas_mcf')
    expect(us.note).toContain('100 Ccf converted to 10 Mcf')
  })

  it('FI2d3 each AU value is NGA\'s printed Energy - Scope 1 figure, per kL / 1,000 (per m3 as printed)', () => {
    const EA: Record<string, { co2: number; ch4: number; n2o: number }> = EF_AU
    const printed: [string, number][] = [['diesel_litre', 2709.72], ['diesel_mobile_litre', 2709.72], ['gasoline_litre', 2318.76],
      ['propane_litre', 1557.42], ['fuel_oil_distillate_litre', 2600.929], ['fuel_oil_residual_litre', 2931.448]]
    for (const [k, perKl] of printed) {
      expect(EA[k], k).toEqual({ co2: EA[k].co2, ch4: 0, n2o: 0 })
      expect(EA[k].co2, k).toBeCloseTo(perKl / 1000, 12)
    }
    expect(EA.natural_gas_m3).toEqual({ co2: 2.025129, ch4: 0, n2o: 0 })
    expect(EA.natural_gas_gj, 'the per-GJ key is unchanged').toEqual({ co2: 51.53, ch4: 0, n2o: 0 })
    // Each printed figure is NGA's own energy content x per-GJ factor, which is how the sheet computes it.
    expect(0.0393 * 51.53).toBeCloseTo(2.025129, 12)
    expect(34.2 * 67.8).toBeCloseTo(2318.76, 9)
    // 1,000 units: the old 3dp values against the printed ones.
    const t = (k: string) => 1000 * EA[k].co2 / 1000
    expect([t('natural_gas_m3'), t('diesel_litre'), t('gasoline_litre'), t('propane_litre')]).toEqual([2.025129, 2.70972, 2.31876, 1.55742])
  })

  it('FI2d4 the methods tables list every conversion and derivation a row notes, and nothing else', () => {
    const locs: Location[] = [
      ukGas('mcf', 10),
      loc({ id: 'L2', name: 'Lyon', country: 'FR', has_mobile: true, gasoline_amount: 100, gasoline_unit: 'litres' }),
      loc({ id: 'L3', name: 'Perth', country: 'AU', state: 'WA', grid_region: 'AU_WA', has_diesel_stationary: true, diesel_stationary_amount: 50, diesel_stationary_unit: 'gallons' }),
      loc({ id: 'L4', name: 'Austin', country: 'US', state: 'TX', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'mcf' }),
      loc({ id: 'L5', name: 'Leeds', country: 'GB', grid_region: 'UK', has_purchased_steam: true, purchased_steam_mmbtu: 100, purchased_steam_unit: 'gj' }),
    ]
    const methods = factorDerivationsFor(locs)
    expect(methods).toEqual([
      'Natural gas: Mcf converted to m³ (1 Mcf = 28.316846592 m³, exact).',
      `Gasoline (mobile): ${(buildWorkings([locs[1]], 'AR6', 2025) as { note?: string; stream?: string }[]).find(r => r.stream === 'mobile')!.note}`,
      'Diesel (stationary): US gallons converted to litres (1 US gallon = 3.785411784 litres, exact).',
      'Purchased steam: GJ converted to kWh (1 kWh = 0.0036 GJ, exact).',
    ])
    // Agreement: every row note that converts or derives has its methods line, and a printed value (US Mcf) has none.
    const rows = buildWorkings(locs, 'AR6', 2025, [], 12) as { note?: string; source: string; declaration?: string }[]
    for (const r of rows.filter(x => !x.declaration && /converted to|DERIVED|÷ 3\.6|× 3\.6|kWh \(exact/.test(x.note ?? ''))) {
      expect(methods.some(m => m.startsWith(`${r.source.replace(/ \(supplier-specific factor\)$/, '')}:`)), r.source).toBe(true)
    }
    expect(methods.some(m => m.includes('US EPA GHG Emission Factors Hub')), 'a printed US value is a citation, not listed').toBe(false)
    for (const m of methods) expect(m).not.toContain('\u2014')
  })
})

// ── FI5: a unit or country change converts exactly, with the conversion shown and recorded, or clears and asks ──────
// docs/review/design-derived-figures.md "FI5". Closes the CLAUDE.md defect "Unit switch relabels without converting".
describe('FI5. a unit change never relabels a figure', () => {
  const AT = '2026-10-07T12:00:00.000Z'
  const BY = { userId: 'u1', email: 'lisa@example.com' }
  const applyCountry = (l: Location, country: string) => applyUnitOutcomes({ ...l, country }, unitsForCountryChange(country, l as never), AT, BY)
  const applyUnit = (l: Location, unitField: (typeof UNIT_FIELDS)[number]['field'], to: string) => {
    const f = UNIT_FIELDS.find(x => x.field === unitField)!
    const from = String((l as unknown as Record<string, unknown>)[unitField] ?? '')
    return applyUnitOutcomes(l, { [unitField]: changeUnit(f.amount, Number((l as unknown as Record<string, unknown>)[f.amount]), from, to) }, AT, BY)
  }
  const rowsOf = (l: Location) => buildWorkings([l], 'AR6', 2025, [], 12) as { stream?: string; source: string; declaration?: string; note?: string; conversion_note?: string; ef_source?: string; scope2_method?: string; result_tco2e: number | null; activity_data?: number; activity_unit?: string }[]

  it('FI5-1 the CLAUDE.md case: 332 m3 switched to Mcf becomes 11.72447 Mcf, never 332 Mcf, and is recorded', () => {
    const gas = loc({ country: 'US', state: 'NY', has_natural_gas: true, natural_gas_amount: 332, natural_gas_unit: 'm3' })
    const o = changeUnit('natural_gas_amount', 332, 'm3', 'mcf') as Extract<UnitOutcome, { value: number }>
    expect(o.value).toBeCloseTo(332 / 28.316846592, 12)
    expect(o.value.toFixed(5)).toBe('11.72447')
    const after = applyUnit(gas, 'natural_gas_unit', 'mcf')
    expect(after.natural_gas_unit).toBe('mcf')
    expect(after.natural_gas_amount).not.toBe(332)
    expect(after.natural_gas_amount).toBeCloseTo(11.72447, 5)
    expect(after.unit_changes).toEqual([{ field: 'natural_gas_amount', from: 'm3', to: 'mcf', factor: 1 / 28.316846592, valueBefore: 332, valueAfter: o.value, at: AT, by: BY }])
    // The workings row carries the conversion as its conversion_note, and the figure prices as the same gas.
    const [row] = rowsOf(after).filter(r => r.stream === 'natural_gas')
    expect(row.conversion_note).toBe('Converted from 332 m³ to 11.72 Mcf (1 Mcf = 28.316846592 m³). Unit changed by lisa@example.com on 7 October 2026.')
    expect(row.result_tco2e).toBeCloseTo(rowsOf(gas).find(r => r.stream === 'natural_gas')!.result_tco2e!, 12)
  })

  it('FI5-2 US to GB with 1,000 gallons of diesel gives 3,785.41 litres with a note', () => {
    const us = loc({ country: 'US', state: 'NY', has_diesel_stationary: true, diesel_stationary_amount: 1000, diesel_stationary_unit: 'gallons' })
    const gb = applyCountry(us, 'GB')
    expect(gb.diesel_stationary_unit).toBe('litres')
    expect(gb.diesel_stationary_amount).toBeCloseTo(3785.411784, 9)
    const c = gb.unit_changes!.at(-1)!
    expect(unitChangeMessage(c)).toBe('Converted from 1,000 US gallons to 3,785.41 litres (1 US gallon = 3.785411784 litres).')
    expect(convertedUnitChange(gb, 'diesel_stationary_amount')).toEqual(c)
    const row = rowsOf({ ...gb, grid_region: 'UK' }).find(r => r.stream === 'diesel_stationary')!
    expect(row.conversion_note).toContain('Converted from 1,000 US gallons to 3,785.41 litres (1 US gallon = 3.785411784 litres).')
    expect(row.activity_data).toBeCloseTo(3785.411784, 9)
    expect(row.activity_unit).toBe('litres')
  })

  it('FI5-3 US to GB steam in MMBtu converts to kWh exactly', () => {
    const us = loc({ country: 'US', state: 'NY', has_purchased_steam: true, purchased_steam_mmbtu: 100, purchased_steam_unit: 'mmbtu' })
    const gb = applyCountry(us, 'GB')
    expect(gb.purchased_steam_unit).toBe('kwh')
    expect(gb.purchased_steam_mmbtu).toBeCloseTo(100 * GJ_PER_MMBTU * KWH_PER_GJ, 9)
    expect(unitChangeMessage(gb.unit_changes!.at(-1)!)).toBe('Converted from 100 MMBtu to 29,307.11 kWh (1 MMBtu = 1.05505585262 GJ and 1 kWh = 0.0036 GJ).')
    const row = rowsOf({ ...gb, grid_region: 'UK' }).find(r => r.stream === 'purchased_steam')!
    expect(row.conversion_note).toContain('Converted from 100 MMBtu to 29,307.11 kWh')
  })

  it('FI5-4 US to NZ propane in gallons is cleared (volume to mass), with the message, and blocks until entered or confirmed none', () => {
    const us = loc({ country: 'US', state: 'NY', has_propane: true, propane_amount: 500, propane_unit: 'gallons' })
    const out = unitsForCountryChange('NZ', us as never)
    expect(out.propane_unit).toEqual({ unit: 'kg', cleared: true, from: 'gallons' })
    const nz = applyCountry(us, 'NZ')
    expect(nz.propane_amount).toBe(0)
    expect(nz.propane_unit).toBe('kg')
    const c = nz.unit_changes!.at(-1)!
    expect(c).toMatchObject({ field: 'propane_amount', from: 'gallons', to: 'kg', factor: null, valueBefore: 500, valueAfter: 0, cleared: true })
    const MSG = 'The propane / LPG figure was in US gallons, which cannot be converted exactly to kg, so it has been cleared. Enter it in kg.'
    expect(unitChangeMessage(c)).toBe(MSG)
    // FI1's issue: an unpriced line beside the field, and an export-blocking coverage issue, until it is entered.
    const site = { ...nz, grid_region: 'NZ' }
    expect(unpricedLines(site).map(u => [u.reason, u.field, u.message])).toEqual([['figure_cleared', 'propane_amount', MSG]])
    expect(findUnresolvedCoverage([site], 2025, 12, []).filter(i => i.status === 'figure_cleared').map(i => i.message)).toEqual([MSG])
    expect(unpricedLines({ ...site, propane_amount: 200 })).toEqual([])
    // Confirmed as none: an accepted used_none for the field, or the stream answered as not used here.
    const none: CoverageResolution = { locId: site.id, fuelType: 'propane', kind: 'used_none', field: 'propane_amount', acknowledged: true,
      acknowledgedAt: AT, by: BY } as unknown as CoverageResolution
    expect(findUnresolvedCoverage([site], 2025, 12, [none]).filter(i => i.status === 'figure_cleared')).toEqual([])
    expect(unpricedLines({ ...site, has_propane: false })).toEqual([])
    expect(MSG).not.toContain('\u2014')
  })

  it('FI5-5 gas in Mcf to kWh is cleared, by the selector and by a country change', () => {
    expect(changeUnit('natural_gas_amount', 100, 'mcf', 'kwh')).toEqual({ unit: 'kwh', cleared: true, from: 'mcf' })
    const us = loc({ country: 'US', state: 'NY', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf' })
    const nz = applyCountry(us, 'NZ')
    expect([nz.natural_gas_unit, nz.natural_gas_amount]).toEqual(['kwh', 0])
    expect(unitChangeMessage(nz.unit_changes!.at(-1)!)).toBe('The natural gas figure was in Mcf, which cannot be converted exactly to kWh, so it has been cleared. Enter it in kWh.')
    // GB gas is billed in kWh: DEFRA's per-m3 row prices volumes, but the wizard offers kWh, and a volume never
    // becomes an energy here (no calorific value is applied to a typed figure).
    // FI3 (R11): GB now offers m3, so a US Mcf figure converts exactly to it rather than being cleared.
    const gb = applyCountry(us, 'GB')
    expect(gb.natural_gas_unit).toBe('m3')
    expect(gb.natural_gas_amount).toBeCloseTo(100 * 28.316846592, 9)
  })

  it('FI5-6 a document-backed field is not changed by a country change (T7)', () => {
    const backed = loc({ country: 'US', state: 'NY', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf',
      source_docs: [doc('utility_bill_gas', [prop({ value: 100, unit: 'mcf', periodStart: '2025-01-01', periodEnd: '2025-12-31' })])] })
    const out = unitsForCountryChange('NZ', backed as never)
    expect(out.natural_gas_unit).toEqual({ unit: 'mcf', value: 100, conversion: null, locked: true })
    const nz = applyCountry(backed, 'NZ')
    expect([nz.natural_gas_unit, nz.natural_gas_amount, nz.unit_changes]).toEqual(['mcf', 100, undefined])
    expect(unpricedLines(nz).some(u => u.reason === 'figure_cleared')).toBe(false)
  })

  it('FI5-7 a US site with a residual subregion switched to GB has no residual_region, and its market row does not cite Green-e', () => {
    const us = loc({ country: 'US', state: 'WA', grid_region: 'US_WA', residual_region: 'NWPP', electricity_kwh: 100_000 })
    const usMarket = rowsOf(us).find(r => r.scope2_method === 'market-based')!
    expect(usMarket.ef_source).toContain('Green-e')
    // The page's country handler clears it.
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain("locs[idx].residual_region = ''")
    const gbCleared = { ...applyCountry(us, 'GB'), grid_region: 'UK', residual_region: '' }
    expect(gbCleared.residual_region).toBe('')
    // And the engine ignores one left behind, so even a stale record cannot cite Green-e outside the US.
    const gbStale = { ...applyCountry(us, 'GB'), grid_region: 'UK' }
    expect(gbStale.residual_region).toBe('NWPP')
    for (const l of [gbCleared, gbStale]) {
      const market = rowsOf(l).find(r => r.scope2_method === 'market-based')
      expect(market?.ef_source ?? '').not.toContain('Green-e')
    }
    expect(residualRegionFor(gbStale)).toBe('')
  })

  it('FI5-8 property: every country pair, every stream with a figure: converted exactly or cleared, never relabelled', () => {
    const COUNTRIES = ['US', 'CA', 'GB', 'DE', 'FR', 'AU', 'NZ', 'OTHER', 'JP', '']
    const optsFor = (field: (typeof UNIT_FIELDS)[number]['field'], country: string) => UNIT_FIELDS.find(f => f.field === field)!.options(country).map(([v]) => v)
    let checked = 0, converted = 0, cleared = 0
    for (const from of COUNTRIES) for (const to of COUNTRIES) for (const f of UNIT_FIELDS) for (const unit of optsFor(f.field, from)) {
      const before = loc({ country: from, [f.field]: unit, [f.amount]: 1234.5 } as Partial<Location>)
      const after = applyCountry(before, to) as unknown as Record<string, unknown>
      const u = after[f.field] as string, v = after[f.amount] as number
      checked++
      if (u === unit) { expect(v, `${from}->${to} ${f.field} ${unit}: kept`).toBe(1234.5); continue }
      expect(v, `${from}->${to} ${f.field}: ${unit} -> ${u} must not keep the number`).not.toBe(1234.5)
      const tok = (x: string) => x === 'gallons' ? 'gallon' : x === 'litres' ? 'litre' : x
      const c = exactConversion(tok(unit), tok(u))
      if (v === 0) {
        cleared++
        expect(optsFor(f.field, to).some(o => exactConversion(tok(unit), tok(o))), `${from}->${to} ${f.field}: ${unit} cleared only when no unit offered there is exactly reachable`).toBe(false)
        continue
      }
      converted++
      expect(c, `${from}->${to} ${f.field}: ${unit} -> ${u}`).not.toBeNull()
      expect(v).toBeCloseTo(1234.5 * c!.toPerFrom, 9)
    }
    expect(checked).toBeGreaterThan(500)
    expect(converted).toBeGreaterThan(0)
    expect(cleared).toBeGreaterThan(0)
    // And the selector alone: every pair of units each field is offered anywhere.
    for (const f of UNIT_FIELDS) {
      const units = [...new Set(COUNTRIES.flatMap(c => optsFor(f.field, c)))]
      for (const a of units) for (const b of units) {
        const o = changeUnit(f.amount, 50, a, b)
        if (a === b) { expect(o).toEqual({ unit: b, value: 50, conversion: null }); continue }
        if ('cleared' in o) continue
        expect(o.value, `${f.field} ${a} -> ${b}`).not.toBe(50)
      }
    }
  })

  it('FI5-9 ccf: offered at US sites as US bills print it, 100 Ccf prices as 10 Mcf, and switching Ccf to Mcf converts with the note', () => {
    expect(ngUnitOptions('US')).toEqual([['mcf', 'Mcf'], ['ccf', 'Ccf'], ['therms', 'Therms'], ['mmbtu', 'MMBtu']])
    const ccf = loc({ country: 'US', state: 'NY', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'ccf' })
    const mcf = loc({ country: 'US', state: 'NY', has_natural_gas: true, natural_gas_amount: 10, natural_gas_unit: 'mcf' })
    const g = (l: Location) => rowsOf(l).find(r => r.stream === 'natural_gas')!
    expect(g(ccf).result_tco2e).toBeCloseTo(g(mcf).result_tco2e!, 12)
    expect(g(ccf).note).toContain('100 Ccf converted to 10 Mcf')
    const switched = applyUnit(ccf, 'natural_gas_unit', 'mcf')
    expect(switched.natural_gas_amount).toBeCloseTo(10, 12)
    expect(unitChangeMessage(switched.unit_changes!.at(-1)!)).toBe('Converted from 100 Ccf to 10 Mcf (1 Ccf = 2.8316846592 m³ and 1 Mcf = 28.316846592 m³).')
    expect(g(switched).conversion_note).toContain('Converted from 100 Ccf to 10 Mcf')
  })
})
