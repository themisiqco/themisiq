// lib/cbam/boundaryGuidanceView.test.ts
// Pins the view model against the real BOUNDARIES array — no fixtures. The guarantees worth
// testing here are about what reaches a customer, so a stand-in would test nothing.
//
// The load-bearing test is the identity sweep: every provision string in the output must be
// STRICTLY EQUAL to a string in boundaries.ts. That is what makes the byte-identical claim
// checkable rather than asserted. A paraphrase, a trim, a re-wrap or a sentence-case would all
// still read fine and would all fail it.
import { describe, it, expect } from 'vitest';
import { buildBoundaryGuidanceView } from './boundaryGuidanceView';
import { BOUNDARIES } from './boundaries';

/** Every provision string that exists in the source data, by identity. */
const SOURCE_PROVISIONS = new Set<string>(BOUNDARIES.flatMap((e) => e.provisions));

const cites = (v: { groups: { entries: { cite: string }[] }[] }) =>
  v.groups.flatMap((g) => g.entries.map((e) => e.cite));

const allProvisions = (v: { groups: { entries: { provisions: string[] }[] }[] }) =>
  v.groups.flatMap((g) => g.entries.flatMap((e) => e.provisions));

describe('buildBoundaryGuidanceView — nothing selected', () => {
  it('returns null for a null category', () => {
    // Null, not an empty view. 'Nothing to show yet' and 'we looked and found nothing' are
    // different claims and the second would be false.
    expect(buildBoundaryGuidanceView(null)).toBeNull();
  });

  it('returns null for an empty or whitespace category', () => {
    expect(buildBoundaryGuidanceView('')).toBeNull();
    expect(buildBoundaryGuidanceView('   ')).toBeNull();
    expect(buildBoundaryGuidanceView('', 'bof')).toBeNull();
  });
});

describe('buildBoundaryGuidanceView — route narrowing', () => {
  it('crude_steel with no route returns entries for all its routes', () => {
    const v = buildBoundaryGuidanceView('crude_steel')!;
    expect(cites(v)).toContain('Annex I, point 3.15.2.1');
    expect(cites(v)).toContain('Annex I, point 3.15.2.2');
  });

  it("crude_steel + 'eaf_scrap' returns a subset of the unnarrowed result", () => {
    const all = buildBoundaryGuidanceView('crude_steel')!;
    const narrowed = buildBoundaryGuidanceView('crude_steel', 'eaf_scrap')!;

    const allCites = cites(all);
    for (const c of cites(narrowed)) expect(allCites).toContain(c);
    expect(cites(narrowed).length).toBeLessThan(allCites.length);

    expect(cites(narrowed)).toContain('Annex I, point 3.15.2.2');
    expect(cites(narrowed)).not.toContain('Annex I, point 3.15.2.1');
  });

  it('sintered_ore has no routes and still returns a non-empty result', () => {
    // A category whose entries carry no routes must not be filtered to nothing. This is the
    // failure that would blank the guidance entirely for sintered ore.
    const v = buildBoundaryGuidanceView('sintered_ore')!;
    expect(v).not.toBeNull();
    expect(v.groups.length).toBeGreaterThan(0);
    expect(v.totalProvisions).toBeGreaterThan(0);
    expect(cites(v)).toContain('Annex I, point 3.11.2');

    // And still non-empty when a route is passed that means nothing to it.
    const withRoute = buildBoundaryGuidanceView('sintered_ore', 'bof')!;
    expect(cites(withRoute)).toContain('Annex I, point 3.11.2');
  });
});

describe('buildBoundaryGuidanceView — cross-category reach', () => {
  it('§3.15.1 appears for both crude_steel and iron_steel_products', () => {
    expect(cites(buildBoundaryGuidanceView('crude_steel')!)).toContain('Annex I, point 3.15.1');
    expect(cites(buildBoundaryGuidanceView('iron_steel_products')!)).toContain('Annex I, point 3.15.1');
  });
});

describe('buildBoundaryGuidanceView — text integrity', () => {
  it('every provision in the output is strictly equal to a provision in boundaries.ts', () => {
    const failures: string[] = [];
    for (const cat of [
      'sintered_ore', 'pig_iron', 'dri', 'ferroalloy',
      'crude_steel', 'iron_steel_products', 'primary_aluminium', 'aluminium_products',
    ]) {
      for (const route of [undefined, 'bof', 'eaf_dri', 'eaf_scrap', 'primary_electrolysis', 'secondary_remelt']) {
        const v = buildBoundaryGuidanceView(cat, route);
        if (v === null) continue;
        for (const p of allProvisions(v)) {
          // Set membership is === for strings. A paraphrase, trim, re-wrap or case change all
          // miss.
          if (!SOURCE_PROVISIONS.has(p)) {
            failures.push(`${cat}/${route ?? 'no route'}: "${p.slice(0, 60)}"`);
          }
        }
      }
    }
    expect(failures, `provisions not identical to boundaries.ts:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('no display string contains a category code or a route code', () => {
    const CODES = [
      'sintered_ore', 'pig_iron', 'dri', 'ferroalloy', 'crude_steel', 'iron_steel_products',
      'primary_aluminium', 'aluminium_products', 'bof', 'eaf_dri', 'eaf_scrap',
      'blast_furnace', 'smelting_reduction', 'direct_reduction', 'submerged_arc',
      'primary_electrolysis', 'secondary_remelt',
    ];
    const failures: string[] = [];
    for (const cat of ['crude_steel', 'iron_steel_products', 'sintered_ore', 'primary_aluminium']) {
      const v = buildBoundaryGuidanceView(cat, 'bof')!;
      const strings = [
        ...v.groups.map((g) => g.heading),
        ...v.groups.map((g) => g.leadIn),
        ...cites(v),
      ];
      for (const s of strings) {
        for (const code of CODES) {
          if (s.includes(code)) failures.push(`${cat}: "${s}" contains "${code}"`);
        }
      }
    }
    expect(failures, `codes leaked into display strings:\n  ${failures.join('\n  ')}`).toEqual([]);
  });
});

describe('buildBoundaryGuidanceView — shape', () => {
  it('totalProvisions equals the summed length of all entry.provisions arrays', () => {
    for (const cat of ['crude_steel', 'iron_steel_products', 'sintered_ore', 'aluminium_products']) {
      for (const route of [undefined, 'bof', 'secondary_remelt']) {
        const v = buildBoundaryGuidanceView(cat, route)!;
        const summed = v.groups.reduce(
          (n, g) => n + g.entries.reduce((m, e) => m + e.provisions.length, 0),
          0,
        );
        expect(v.totalProvisions, `${cat}/${route ?? 'no route'}`).toBe(summed);
      }
    }
  });

  it('groups appear in the fixed order and no group is empty', () => {
    const v = buildBoundaryGuidanceView('crude_steel')!;
    expect(v.groups.map((g) => g.key)).toEqual(['crossSectoral', 'specialProvisions', 'boundaries']);
    for (const g of v.groups) expect(g.entries.length).toBeGreaterThan(0);
  });

  it('an unknown category omits the category-scoped groups but keeps the cross-sectoral one', () => {
    const v = buildBoundaryGuidanceView('not_a_category')!;
    expect(v.groups.map((g) => g.key)).toEqual(['crossSectoral']);
    expect(v.totalProvisions).toBeGreaterThan(0);
  });

  it('mutating the returned provisions does not reach BOUNDARIES', () => {
    const before = BOUNDARIES.flatMap((e) => e.provisions).length;
    const v = buildBoundaryGuidanceView('crude_steel')!;
    v.groups[0].entries[0].provisions.push('injected');
    expect(BOUNDARIES.flatMap((e) => e.provisions).length).toBe(before);
  });
});
