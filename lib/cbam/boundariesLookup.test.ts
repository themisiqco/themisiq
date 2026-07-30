// lib/cbam/boundariesLookup.test.ts
// Pins the selection rules in boundariesLookup.ts against the real BOUNDARIES array — no
// fixtures. The point of this module is which entries come back for a given (category, route),
// and a fixture would only test that .filter works.
//
// Two things here are gates rather than examples. The eight-category sweep fails if any live
// category has no boundary entry at all, naming the category — a category a customer can
// select but for which we hold nothing is a defect, not an empty state. And the route tests
// pin that a null routeCodes entry survives route filtering, which is the failure that would
// silently blank the guidance for sintered ore and iron or steel products.
import { describe, it, expect } from 'vitest';
import { lookupBoundaries } from './boundariesLookup';

const sections = (entries: { section: string }[]) => entries.map((e) => e.section);

/** The eight categories seeded in cbam_goods_categories — what a customer can actually pick. */
const LIVE_CATEGORIES = [
  'sintered_ore',
  'pig_iron',
  'dri',
  'ferroalloy',
  'crude_steel',
  'iron_steel_products',
  'primary_aluminium',
  'aluminium_products',
];

describe('lookupBoundaries — route narrowing', () => {
  it("crude_steel + 'bof' returns §3.15.2.1 and not §3.15.2.2", () => {
    const r = lookupBoundaries('crude_steel', 'bof');
    expect(sections(r.boundaries)).toContain('3.15.2.1');
    expect(sections(r.boundaries)).not.toContain('3.15.2.2');
  });

  it("crude_steel + 'eaf_dri' returns §3.15.2.2 and not §3.15.2.1", () => {
    const r = lookupBoundaries('crude_steel', 'eaf_dri');
    expect(sections(r.boundaries)).toContain('3.15.2.2');
    expect(sections(r.boundaries)).not.toContain('3.15.2.1');
  });

  it('crude_steel with no route returns BOTH routes — no narrowing, not a guess', () => {
    // The caller has not said which route, so both boundaries are shown and the split stays
    // visible. Silently picking one would answer a question they did not ask.
    for (const noRoute of [undefined, null, '']) {
      const r = lookupBoundaries('crude_steel', noRoute);
      expect(sections(r.boundaries)).toContain('3.15.2.1');
      expect(sections(r.boundaries)).toContain('3.15.2.2');
    }
  });

  it("'eaf_scrap' selects the same boundary as 'eaf_dri' — both our routes share §3.15.2.2", () => {
    // The EAF split is ours, from the IR 2025/2620 benchmark distinction; §3.15.2 names one
    // electric arc furnace route. Both must reach the same section.
    expect(sections(lookupBoundaries('crude_steel', 'eaf_scrap').boundaries)).toContain('3.15.2.2');
  });

  it('an entry with routeCodes null survives route filtering', () => {
    // §3.16.2 applies to the whole category — the regulation names no route for iron or steel
    // products. Filtering it out because a route was passed would leave the category with no
    // boundary at all.
    const r = lookupBoundaries('iron_steel_products', 'bof');
    expect(sections(r.boundaries)).toContain('3.16.2');
  });

  it('sintered_ore returns §3.11.2, whose routeCodes are null', () => {
    expect(sections(lookupBoundaries('sintered_ore').boundaries)).toContain('3.11.2');
    expect(sections(lookupBoundaries('sintered_ore', 'anything').boundaries)).toContain('3.11.2');
  });
});

describe('lookupBoundaries — special provisions', () => {
  it('crude_steel returns §3.15.1', () => {
    expect(sections(lookupBoundaries('crude_steel').specialProvisions)).toContain('3.15.1');
  });

  it('iron_steel_products ALSO returns §3.15.1 — the cross-category case', () => {
    // Selection is by categoryCodes, never by section number. §3.15.1 lists both crude_steel
    // and iron_steel_products, and whoever picked products needs it most: their own §3.16.1
    // reads 'None.', while the rule deciding whether their rolled product belongs in crude
    // steel at all is printed under §3.15.1.
    const r = lookupBoundaries('iron_steel_products');
    expect(sections(r.specialProvisions)).toContain('3.15.1');
    expect(sections(r.specialProvisions)).toContain('3.16.1');
  });

  it('the NPI threshold reaches both sides of its 10 % split', () => {
    // §3.12.1 sets the threshold and lists ferroalloy and pig_iron; §3.13.1 lists pig_iron,
    // ferroalloy and crude_steel. Each category sees the rule that allocates it.
    expect(sections(lookupBoundaries('ferroalloy').specialProvisions)).toContain('3.12.1');
    expect(sections(lookupBoundaries('pig_iron').specialProvisions)).toContain('3.12.1');
    expect(sections(lookupBoundaries('ferroalloy').specialProvisions)).toContain('3.13.1');
  });

  it('groups are disjoint by scope — a special provision is never returned as a boundary', () => {
    for (const cat of LIVE_CATEGORIES) {
      const r = lookupBoundaries(cat);
      expect(r.specialProvisions.every((e) => e.scope === 'special_provisions')).toBe(true);
      expect(r.boundaries.every((e) => e.scope === 'category')).toBe(true);
      expect(r.crossSectoral.every((e) => e.scope === 'cross_sectoral')).toBe(true);
    }
  });
});

describe('lookupBoundaries — coverage of the live categories', () => {
  it('every live category returns at least one boundary entry', () => {
    // A GATE, not an example. A category a customer can select but for which we hold no
    // boundary is a defect; this names which one.
    const empty = LIVE_CATEGORIES.filter((c) => lookupBoundaries(c).boundaries.length === 0);
    expect(empty, `categories with no boundary entry: ${empty.join(', ')}`).toEqual([]);
  });

  it('every live category returns at least one special provision', () => {
    const empty = LIVE_CATEGORIES.filter((c) => lookupBoundaries(c).specialProvisions.length === 0);
    expect(empty, `categories with no special-provisions entry: ${empty.join(', ')}`).toEqual([]);
  });

  it('crossSectoral is non-empty and identical for every category', () => {
    // §3.1 governs all categories, so it must not vary with the selection — if it does, it is
    // being filtered by something it should be immune to.
    const first = sections(lookupBoundaries(LIVE_CATEGORIES[0]).crossSectoral);
    expect(first.length).toBeGreaterThan(0);
    for (const cat of LIVE_CATEGORIES) {
      expect(sections(lookupBoundaries(cat).crossSectoral)).toEqual(first);
      expect(sections(lookupBoundaries(cat, 'bof').crossSectoral)).toEqual(first);
    }
  });

  it('results follow BOUNDARIES array order, which is section order', () => {
    const r = lookupBoundaries('crude_steel');
    expect(sections(r.specialProvisions)).toEqual(['3.13.1', '3.14.1', '3.15.1']);
    expect(sections(r.boundaries)).toEqual(['3.15.2.1', '3.15.2.2']);
  });
});

describe('lookupBoundaries — absent and unknown input', () => {
  it('an empty category returns three empty groups and does not throw', () => {
    for (const cat of ['', '   ']) {
      expect(() => lookupBoundaries(cat)).not.toThrow();
      const r = lookupBoundaries(cat);
      expect(r.crossSectoral).toEqual([]);
      expect(r.specialProvisions).toEqual([]);
      expect(r.boundaries).toEqual([]);
    }
  });

  it('an unknown category returns nothing category-scoped, but still the cross-sectoral rules', () => {
    // §3.1 governs every category — including one this function has never heard of. Withholding
    // it would be asserting the rules do not apply, which is a stronger claim than "unknown".
    const r = lookupBoundaries('not_a_category');
    expect(r.specialProvisions).toEqual([]);
    expect(r.boundaries).toEqual([]);
    expect(r.crossSectoral.length).toBeGreaterThan(0);
  });

  it('echoes back what it was asked, with an absent route normalised to null', () => {
    expect(lookupBoundaries('crude_steel', 'bof').routeCode).toBe('bof');
    expect(lookupBoundaries('crude_steel', '').routeCode).toBeNull();
    expect(lookupBoundaries('crude_steel').routeCode).toBeNull();
    expect(lookupBoundaries('  crude_steel  ').categoryCode).toBe('crude_steel');
  });
});
