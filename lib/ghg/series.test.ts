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
  scope3CoverageLabel, describeScope3Basis, describeScope3CoverageDrift,
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
    'natural_gas', 'diesel_mobile', 'fuel_oil_distillate', 'fuel_oil_residual', 'm3', 'kwh', 'mcf', 'mmbtu',
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

// ── GROUP D — Scope 3 coverage ────────────────────────────────────────────────
//
// The Scope 3 total is consumed well beyond the calculator: trends stacks it, and the SBTi dashboard
// takes it as a baseline that is then fixed for the life of a target. These tests pin the three things
// that stop a bare number being read as more than it is: a zero covering nothing is not a figure, an
// unrecorded coverage is not a complete one, and two years are comparable only when they cover the same
// categories — not merely the same number of them.

const cov = (ids: string[], extra: Record<string, { in_total: boolean }> = {}) => ({
  ...Object.fromEntries(ids.map(id => [id, { status: 'relevant_calculated', mt: 1, in_total: true, unpriced: false, reason: null }])),
  ...Object.fromEntries(Object.entries(extra).map(([id, e]) => [id, { status: 'relevant_not_calculated', mt: null, in_total: e.in_total, unpriced: false, reason: null }])),
})

/** A year with a Scope 3 total whose coverage IS recorded. */
const s3 = (year: number, total: number, ids: string[], o: Partial<InventoryRow> = {}) =>
  row(year, {
    scope3_total: total,
    scope3Relevant: ids.length + 1,
    scope3InTotal: ids.length,
    scope3Unpriced: 0,
    scope3ExclusionsUnjustified: 0,
    scope3Coverage: cov(ids) as InventoryRow['scope3Coverage'],
    ...o,
  })

describe('GROUP D — Scope 3 coverage', () => {
  it('D1 a recorded coverage travels with the year, figure included', () => {
    const y = buildCompanySeries([s3(2024, 400, ['cat1', 'cat5'])])[0].years[0]
    expect(y.scope3).toBe(400)
    expect(y.scope3Basis).toBe('measured')
    expect(y.scope3InTotal).toBe(2)
    expect(y.scope3Relevant).toBe(3)
    expect(Object.keys(y.scope3Coverage ?? {})).toEqual(['cat1', 'cat5'])
  })

  it('D2 ⚠️ a zero total covering nothing is NOT a measurement: the figure is nulled and named', () => {
    // A saved inventory with no category answered writes total 0 with in_total 0. Read through the
    // total alone it is a Scope 3 of zero — it would stack, sum, and anchor a baseline.
    const y = buildCompanySeries([row(2024, {
      scope3_total: 0, scope3Relevant: 0, scope3InTotal: 0, scope3Unpriced: 0,
      scope3ExclusionsUnjustified: 0, scope3Coverage: {},
    })])[0].years[0]
    expect(y.scope3).toBeNull()
    expect(y.scope3Basis).toBe('covers_nothing')
    expect(y.allScopesTotal, 'a zero covering nothing must not sum into all scopes').toBeNull()
    // Nothing is hidden: the counts say what the null means.
    expect(y.scope3InTotal).toBe(0)
  })

  it('D3 a pre-migration year keeps its figure and says the coverage is not recorded', () => {
    const y = buildCompanySeries([row(2022, { scope3_total: 900 })])[0].years[0]
    expect(y.scope3).toBe(900)
    expect(y.scope3Basis).toBe('not_recorded')
    expect(y.scope3Relevant).toBeNull()
    expect(y.scope3InTotal).toBeNull()
    expect(y.scope3Coverage).toBeNull()
  })

  it('D4 no Scope 3 record at all is absent, and stays null', () => {
    const y = buildCompanySeries([row(2022)])[0].years[0]
    expect(y.scope3).toBeNull()
    expect(y.scope3Basis).toBe('absent')
    expect(y.scope3Relevant).toBeNull()
  })

  it('D5 ⚠️ the same COUNT is not the same coverage', () => {
    const differentSixes = buildCompanySeries([
      s3(2024, 400, ['cat1', 'cat5']),
      s3(2025, 380, ['cat1', 'cat6']),
    ])[0]
    expect(differentSixes.scope3CoverageConsistent).toBe(false)
    const sameTwo = buildCompanySeries([
      s3(2024, 400, ['cat1', 'cat5']),
      s3(2025, 380, ['cat5', 'cat1']),   // order is not coverage
    ])[0]
    expect(sameTwo.scope3CoverageConsistent).toBe(true)
  })

  it('D6 ⚠️ an unrecorded year makes the comparison false, never true', () => {
    const mixed = buildCompanySeries([
      row(2022, { scope3_total: 900 }),          // not_recorded
      s3(2024, 400, ['cat1', 'cat5']),
    ])[0]
    expect(mixed.scope3CoverageConsistent).toBe(false)
    // Two unrecorded years are no better: nobody knows what either covered.
    expect(buildCompanySeries([
      row(2022, { scope3_total: 900 }), row(2023, { scope3_total: 950 }),
    ])[0].scope3CoverageConsistent).toBe(false)
  })

  it('D7 fewer than two Scope 3 figures is consistent — nothing to compare, as with one GWP basis', () => {
    expect(buildCompanySeries([s3(2024, 400, ['cat1'])])[0].scope3CoverageConsistent).toBe(true)
    expect(buildCompanySeries([row(2022), row(2023)])[0].scope3CoverageConsistent).toBe(true)
    // A year that covers nothing carries no figure, so it is not part of the comparison either.
    expect(buildCompanySeries([
      s3(2024, 400, ['cat1']),
      row(2025, { scope3_total: 0, scope3InTotal: 0, scope3Coverage: {} }),
    ])[0].scope3CoverageConsistent).toBe(true)
  })

  it('D8 the baseline carries its own coverage, and null where there is none to state', () => {
    const s = buildCompanySeries([s3(2024, 400, ['cat1', 'cat5']), s3(2025, 380, ['cat1', 'cat5'])])[0]
    expect(s.baselineYear).toBe(2024)
    expect(s.baselineScope3Coverage).toEqual({
      relevant: 3, inTotal: 2, unpriced: 0, exclusionsUnjustified: 0, categories: ['cat1', 'cat5'],
    })
    // A baseline whose coverage was never recorded states nothing rather than guessing.
    expect(buildCompanySeries([row(2022, { scope3_total: 900 })])[0].baselineScope3Coverage).toBeNull()
    // No Scope 3 at all: also null.
    expect(buildCompanySeries([row(2022)])[0].baselineScope3Coverage).toBeNull()
  })

  it('D9 coverage is surfaced, never gated: an inconsistent series still carries every figure', () => {
    const s = buildCompanySeries([
      s3(2024, 400, ['cat1', 'cat5']),
      s3(2025, 380, ['cat1']),
    ])[0]
    expect(s.scope3CoverageConsistent).toBe(false)
    expect(s.years.map(y => y.scope3)).toEqual([400, 380])
    expect(s.years.map(y => y.allScopesTotal)).toEqual([550, 530])
  })
})

describe('GROUP E — the Scope 3 coverage copy', () => {
  it('E1 the label counts categories, and says nothing when nothing was recorded', () => {
    expect(scope3CoverageLabel({ scope3InTotal: 6, scope3Relevant: 12 })).toBe('6 of 12 relevant categories')
    expect(scope3CoverageLabel({ scope3InTotal: 1, scope3Relevant: 1 })).toBe('1 of 1 relevant category')
    expect(scope3CoverageLabel({ scope3InTotal: null, scope3Relevant: null })).toBeNull()
  })

  it('E2 ⚠️ "covers nothing" never reads as a missing record', () => {
    const y = buildCompanySeries([row(2024, {
      scope3_total: 0, scope3Relevant: 0, scope3InTotal: 0, scope3Coverage: {},
    })])[0].years[0]
    const copy = describeScope3Basis(y)!
    expect(copy).toContain('saved Scope 3 inventory')
    expect(copy).toContain('counts no categories yet')
    expect(copy).toContain('not a missing record')
    expect(copy).not.toMatch(/no Scope 3 recorded|not reported/i)
  })

  it('E3 an unrecorded coverage says so without withholding the figure', () => {
    const y = buildCompanySeries([row(2022, { scope3_total: 900 })])[0].years[0]
    expect(describeScope3Basis(y)).toContain('was not recorded')
    expect(y.scope3).toBe(900)
  })

  it('E4 a measured year needs no sentence of its own', () => {
    expect(describeScope3Basis(buildCompanySeries([s3(2024, 400, ['cat1'])])[0].years[0])).toBeNull()
    expect(describeScope3Basis(buildCompanySeries([row(2024)])[0].years[0])).toBeNull()
  })

  it('E5 the drift line names the years and what each covers', () => {
    const series = buildCompanySeries([s3(2024, 400, ['cat1', 'cat5']), s3(2025, 380, ['cat1'])])[0]
    const copy = describeScope3CoverageDrift(series)!
    expect(copy).toContain('2024 covers 2 of 3 relevant categories')
    expect(copy).toContain('2025 covers 1 of 2 relevant categories')
    expect(copy).toContain('may be a change in what is counted rather than in emissions')
    // Silent when the years agree — the same silence gwpConsistent keeps on one basis.
    expect(describeScope3CoverageDrift(buildCompanySeries([s3(2024, 400, ['cat1']), s3(2025, 380, ['cat1'])])[0])).toBeNull()
  })

  it('E6 an unrecorded year is named as unrecorded in the drift line, not counted', () => {
    const series = buildCompanySeries([row(2022, { scope3_total: 900 }), s3(2024, 400, ['cat1'])])[0]
    const copy = describeScope3CoverageDrift(series)!
    expect(copy).toContain("2022's coverage was not recorded")
    expect(copy).toContain('2024 covers 1 of 2 relevant categories')
  })
})
