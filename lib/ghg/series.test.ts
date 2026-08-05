// lib/ghg/series.test.ts
// Regression suite for the multi-year series assembly, and specifically for how it handles a year
// whose stored totals cannot be plotted.
//
// WHY THIS FILE EXISTS. buildCompanySeries had no test coverage at all until the exclusion work.
// Its arithmetic is simple enough to read, which is exactly why the null-propagation rules below
// look like over-caution to someone reading them cold — they are not, and this suite is what says
// so out loud.

import { describe, it, expect } from 'vitest';
import {
  buildCompanySeries, describeYearStatus,
  type InventoryRow, type YearExclusion,
} from './series';

// ── fixture builders ─────────────────────────────────────────────────────────
const row = (year: number, o: Partial<InventoryRow> = {}): InventoryRow => ({
  company_id: 'C1',
  company_name: 'Acme',
  reporting_year: year,
  scope1_total: 100,
  scope2_location_total: 50,   // ⇒ scope12Total 150 for every 'ok' year below
  gwp_version: 'AR6',
  ...o,
});

const blockedSite: YearExclusion = {
  locationName: 'Blocked Site', fuel: 'natural_gas', unit: 'm3', country: 'US',
};

const excluded = (year: number, exclusions: YearExclusion[] = [blockedSite]): InventoryRow =>
  row(year, { dataStatus: 'excluded', exclusions });

const unverifiable = (year: number, reason = 'no location detail to check against'): InventoryRow =>
  row(year, { dataStatus: 'unverifiable', unverifiableReason: reason });

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — the null-propagation rules
//
// ⚠️ EVERY NULL IN THIS GROUP IS DELIBERATE. READ THIS BEFORE "FIXING" ONE.
//
// A year whose total omits a location is UNKNOWN, not low. The stored figure is real arithmetic
// over the locations that were priced — it is simply not that company's emissions for that year.
// Plotted beside complete years it reads as a reduction that never happened, which is the whole
// defect this suite guards.
//
// The two comparison nulls follow from the same principle, and neither is a missing value:
//
//   yoyPct after a gap        — year-on-year needs BOTH ends. When the prior year is unknown there
//                               is no one-year change to state. Reaching back to the last known
//                               year instead would compare across the gap and label a multi-year
//                               movement as a single year's.
//   vsBaselinePct, whole series, when the baseline year is unknown
//                             — every "% vs baseline" divides by the baseline. If the baseline is
//                               partial, every year's percentage is wrong, not just the baseline's.
//                               The basis is ABSENT, so the comparison is withheld rather than
//                               computed against the nearest available number.
//
// Making any of these non-null — substituting the last known year, falling back to a later year as
// the baseline, coercing to 0 — reintroduces the defect in a new place. If a product need pushes
// that way, the answer is to fix the underlying inventory, not to soften these.
// ─────────────────────────────────────────────────────────────────────────────
describe('GROUP A — an unplottable year breaks the series and is never coerced', () => {
  it('A1 the year is EMITTED with null figures, not dropped from the array', () => {
    // Dropping it would let a chart draw a straight line from the year before to the year after —
    // an interpolation across a year we cannot describe. Present-but-null is what makes the gap.
    const [s] = buildCompanySeries([row(2022), excluded(2023), row(2024)]);
    expect(s.years.map(y => y.year)).toEqual([2022, 2023, 2024]);

    const y23 = s.years[1];
    expect(y23.dataStatus).toBe('excluded');
    expect([
      y23.scope1, y23.scope2Location, y23.scope2Market, y23.scope3,
      y23.scope12Total, y23.allScopesTotal, y23.perRevenue, y23.perFte,
      y23.vsBaselinePct, y23.yoyPct,
    ]).toEqual([null, null, null, null, null, null, null, null, null, null]);
  });

  it('A2 neighbouring years are untouched — one bad year does not degrade the rest', () => {
    const [s] = buildCompanySeries([row(2022), excluded(2023), row(2024)]);
    expect(s.years[0].scope12Total).toBe(150);
    expect(s.years[2].scope12Total).toBe(150);
  });

  it('A3 yoyPct is null for the year AFTER a gap — no comparison across the gap', () => {
    const [s] = buildCompanySeries([row(2022), excluded(2023), row(2024, { scope1_total: 200 })]);
    // 2024 differs from 2022, so a "helpful" implementation reaching past 2023 would report a
    // number here. There is no one-year change to state; the field stays null.
    expect(s.years[2].yoyPct).toBeNull();
  });

  it('A4 yoyPct IS computed when both ends are plottable', () => {
    const [s] = buildCompanySeries([row(2022), row(2023), row(2024)]);
    expect(s.years[2].yoyPct).toBe(0);
  });

  it('A5 an unknown BASELINE nulls vsBaselinePct for EVERY year, not just its own', () => {
    const [s] = buildCompanySeries([unverifiable(2022), row(2023), row(2024)]);
    expect(s.baselineUsable).toBe(false);
    expect(s.baselineScope12Total).toBeNull();
    expect(s.years.map(y => y.vsBaselinePct)).toEqual([null, null, null]);
  });

  it('A6 an unknown baseline does NOT suppress the years themselves', () => {
    // The later years are still real measurements. Only the comparison against the baseline is
    // withheld — withholding the figures too would discard data we do have.
    const [s] = buildCompanySeries([unverifiable(2022), row(2023), row(2024)]);
    expect(s.years[1].scope12Total).toBe(150);
    expect(s.years[2].scope12Total).toBe(150);
    expect(s.years[2].yoyPct).toBe(0); // 2023 and 2024 are both plottable
  });

  it('A7 vsBaselinePct survives when the baseline is fine and a LATER year is not', () => {
    const [s] = buildCompanySeries([row(2022), excluded(2023), row(2024)]);
    expect(s.baselineUsable).toBe(true);
    expect(s.baselineScope12Total).toBe(150);
    expect(s.years[2].vsBaselinePct).toBe(0);
  });

  it('A8 nothing is ever coerced to zero', () => {
    const [s] = buildCompanySeries([excluded(2022), unverifiable(2023)]);
    for (const y of s.years) {
      expect(y.scope12Total).not.toBe(0);
      expect(y.scope12Total).toBeNull();
    }
  });

  it('A9 exclusionsPresent flags the series; baselineUsable flags the baseline', () => {
    const clean = buildCompanySeries([row(2022), row(2023)])[0];
    expect(clean.exclusionsPresent).toBe(false);
    expect(clean.baselineUsable).toBe(true);

    const dirty = buildCompanySeries([row(2022), excluded(2023)])[0];
    expect(dirty.exclusionsPresent).toBe(true);
    expect(dirty.baselineUsable).toBe(true); // the BASELINE is still fine — the two are independent
  });

  it('A10 a row with no dataStatus is treated as ok (hand-built rows keep working)', () => {
    const [s] = buildCompanySeries([row(2022), row(2023)]);
    expect(s.years.every(y => y.dataStatus === 'ok')).toBe(true);
    expect(s.years.every(y => y.scope12Total === 150)).toBe(true);
    expect(s.exclusionsPresent).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP B — 'excluded' and 'unverifiable' are two states, not one
//
// They suppress plotting identically, which is exactly why they are easy to merge. They must not
// be: 'excluded' means WE KNOW what the stored total left out and why; 'unverifiable' means we do
// not know whether it left anything out at all. Collapsing them would report "we can't tell" with
// the confidence of "here is what's missing".
// ─────────────────────────────────────────────────────────────────────────────
describe('GROUP B — the two unplottable states stay distinct', () => {
  it('B1 the status is preserved distinctly, not normalised to a single "bad" state', () => {
    const [s] = buildCompanySeries([excluded(2022), unverifiable(2023)]);
    expect(s.years.map(y => y.dataStatus)).toEqual(['excluded', 'unverifiable']);
  });

  it('B2 each state carries only its own evidence field', () => {
    const [s] = buildCompanySeries([excluded(2022), unverifiable(2023, 'saved before we recorded this')]);
    const [ex, un] = s.years;

    expect(ex.exclusions).toEqual([blockedSite]);   // what was left out
    expect(ex.unverifiableReason).toBeNull();

    expect(un.exclusions).toBeNull();               // nothing to name — that IS the point
    expect(un.unverifiableReason).toBe('saved before we recorded this');
  });

  it('B3 the customer-facing copy differs between the two', () => {
    const [s] = buildCompanySeries([excluded(2022), unverifiable(2023)]);
    const exCopy = describeYearStatus(s.years[0])!;
    const unCopy = describeYearStatus(s.years[1])!;

    expect(exCopy).not.toBe(unCopy);
    // 'excluded' states WHAT is missing; 'unverifiable' states that completeness is unknown.
    expect(exCopy).toContain('left out');
    expect(exCopy).toContain('Blocked Site');
    expect(unCopy).toContain("can't confirm");
    expect(unCopy).not.toContain('left out');
  });

  it('B4 a plottable year has no status copy at all', () => {
    const [s] = buildCompanySeries([row(2022)]);
    expect(describeYearStatus(s.years[0])).toBeNull();
  });

  it('B5 excluded copy counts the locations and agrees in number', () => {
    const two: YearExclusion[] = [
      blockedSite,
      { locationName: 'Second Site', fuel: 'natural_gas', unit: 'kwh', country: 'CA' },
    ];
    const one = describeYearStatus(buildCompanySeries([excluded(2022)])[0].years[0])!;
    const many = describeYearStatus(buildCompanySeries([excluded(2022, two)])[0].years[0])!;

    expect(one).toContain('1 location was left out');
    expect(many).toContain('2 locations were left out');
    expect(many).toContain('Second Site');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP C — the copy is for a customer, not for us
//
// describeYearStatus is the ONLY place these tokens become words, and both the trend chart and the
// SBTi surface render its output verbatim. A leak here reaches a customer as jargon they did not
// choose and cannot act on.
// ─────────────────────────────────────────────────────────────────────────────
describe('GROUP C — no internal vocabulary reaches the customer', () => {
  // Engine tokens, storage keys and field names — every one of these is available to
  // describeYearStatus and none may appear in what it returns.
  const FORBIDDEN = [
    // fuel / unit / country tokens
    'natural_gas', 'diesel_mobile', 'fuel_oil', 'm3', 'kwh', 'mcf', 'mmbtu',
    // status + field names
    'dataStatus', 'unverifiableReason', 'exclusions', 'scope12Total', 'locationName',
    'unpriceable', 'MissingEmissionFactorError',
    // storage columns
    'locations_data', 'workings', 'scope1_total', 'scope2_location_total',
  ];

  it('C1 excluded copy leaks no token, field name or column name', () => {
    const copy = describeYearStatus(buildCompanySeries([excluded(2022)])[0].years[0])!;
    for (const token of FORBIDDEN) {
      expect(copy, `"${token}" leaked into: ${copy}`).not.toContain(token);
    }
    // The tokens are TRANSLATED, not merely dropped — the sentence still says what happened.
    expect(copy).toContain('gas');
    expect(copy).toContain('cubic metres');
    expect(copy).toContain('United States');
  });

  it('C2 unverifiable copy leaks nothing either', () => {
    const copy = describeYearStatus(buildCompanySeries([unverifiable(2022)])[0].years[0])!;
    for (const token of FORBIDDEN) {
      expect(copy, `"${token}" leaked into: ${copy}`).not.toContain(token);
    }
  });

  it('C3 a bare ISO country code never surfaces as if it were a place name', () => {
    const copy = describeYearStatus(buildCompanySeries([excluded(2022)])[0].years[0])!;
    expect(copy).not.toMatch(/\bUS\b/);
  });

  it('C4 an unmapped token degrades to the raw word, never to a blank', () => {
    // A fuel or unit added to the engine before it is added to the word maps must still produce a
    // readable sentence. A hole in the middle of the copy is worse than an unfamiliar word: the
    // customer can at least search for the word.
    const odd: YearExclusion = {
      locationName: 'Odd Site', fuel: 'hydrogen', unit: 'nm3', country: 'ZZ',
    };
    const copy = describeYearStatus(buildCompanySeries([excluded(2022, [odd])])[0].years[0])!;
    expect(copy).toContain('hydrogen');
    expect(copy).toContain('nm3');
    expect(copy).toContain('ZZ');
    expect(copy).not.toMatch(/\bundefined\b|\bnull\b/);
  });

  it('C5 a location with no country reads as a missing country, not as a place', () => {
    const noCountry: YearExclusion = {
      locationName: 'Unset Site', fuel: 'natural_gas', unit: 'm3', country: '(unset)',
    };
    const copy = describeYearStatus(buildCompanySeries([excluded(2022, [noCountry])])[0].years[0])!;
    expect(copy).toContain('no country');
    expect(copy).not.toContain('(unset)');
  });
});
