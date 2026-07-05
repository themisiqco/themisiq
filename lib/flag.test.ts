// lib/flag.test.ts
// Land-sector (FLAG, LSRS Track A) engine tests.
// Exact-number assertions; core invariant: the three categories are reported
// separately and removals are NEVER netted into gross emissions.
import { describe, it, expect } from 'vitest';
import { computeFlag } from './flag/engine';
import { estimateEnteric } from './flag/estimate';
import type { FlagActivity } from './flag/types';

const line = (over: Partial<FlagActivity>): FlagActivity => ({
  id: 'x',
  category: 'land_management',
  emissions: 0,
  ...over,
});

describe('computeFlag — three-category separation + LSRS invariants', () => {
  it('reports the three categories separately; removals not netted', () => {
    const r = computeFlag([
      line({ id: 'luc', category: 'land_use_change', emissions: 1000, hectares: 50 }),
      line({ id: 'mgmt', category: 'land_management', emissions: 400, hectares: 200 }),
      line({ id: 'rem', category: 'removals', emissions: 300, hectares: 0 }),
    ]);
    expect(r.landUseChange).toMatchObject({ emissions: 1000, hectares: 50, lineCount: 1 });
    expect(r.landManagement).toMatchObject({ emissions: 400, hectares: 200, lineCount: 1 });
    expect(r.removals).toMatchObject({ emissions: 300, hectares: 0, lineCount: 1 });
    expect(r.grossEmissions).toBe(1400);   // LUC + management, removals excluded
    expect(r.totalHectares).toBe(250);
    expect(r.gwpBasis).toBe('AR6');
  });

  it('removals are NEVER subtracted — no field equals gross-minus-removals (1100)', () => {
    const r = computeFlag([
      line({ id: 'luc', category: 'land_use_change', emissions: 1000, hectares: 50 }),
      line({ id: 'mgmt', category: 'land_management', emissions: 400, hectares: 200 }),
      line({ id: 'rem', category: 'removals', emissions: 300, hectares: 0 }),
    ]);
    expect(r.grossEmissions).toBe(1400);
    const netted = 1100; // 1400 - 300, the value that would appear if removals were wrongly netted
    expect(r.grossEmissions).not.toBe(netted);
    expect(r.landUseChange.emissions).not.toBe(netted);
    expect(r.landManagement.emissions).not.toBe(netted);
    expect(r.removals.emissions).not.toBe(netted);
  });

  it('hectares are mandatory for an emitting non-removals line → throws', () => {
    expect(() => computeFlag([line({ id: 'm', category: 'land_management', emissions: 400 })])).toThrow();
    expect(() => computeFlag([line({ id: 'l', category: 'land_use_change', emissions: 1000, hectares: 0 })])).toThrow();
  });

  it('a removals line may omit hectares → does NOT throw', () => {
    const r = computeFlag([line({ id: 'rem', category: 'removals', emissions: 300 })]);
    expect(r.removals.emissions).toBe(300);
    expect(r.removals.hectares).toBe(0);
  });

  it('a zero-emission line may omit hectares → does not throw', () => {
    const r = computeFlag([line({ id: 'z', category: 'land_management', emissions: 0 })]);
    expect(r.landManagement.emissions).toBe(0);
    expect(r.landManagement.lineCount).toBe(1);
  });

  it('negative emissions on any line → throws', () => {
    expect(() => computeFlag([line({ id: 'n', category: 'land_management', emissions: -5, hectares: 10 })])).toThrow();
    expect(() => computeFlag([line({ id: 'nr', category: 'removals', emissions: -300 })])).toThrow();
  });

  it('empty inventory → valid zeroed result, does NOT throw', () => {
    const r = computeFlag([]);
    expect(r.landUseChange).toMatchObject({ emissions: 0, hectares: 0, lineCount: 0 });
    expect(r.landManagement).toMatchObject({ emissions: 0, hectares: 0, lineCount: 0 });
    expect(r.removals).toMatchObject({ emissions: 0, hectares: 0, lineCount: 0 });
    expect(r.grossEmissions).toBe(0);
    expect(r.totalHectares).toBe(0);
    expect(r.gwpBasis).toBe('AR6');
  });

  it('gwpBasis passthrough: AR5 → result.gwpBasis AR5', () => {
    expect(computeFlag([], 'AR5').gwpBasis).toBe('AR5');
  });
});

describe('estimateEnteric — IPCC 2019 Tier 1 enteric CH4 (biogenic GWP 27.0)', () => {
  it('NA dairy cow, 1 head → 138 × 27.0 / 1000 = 3.726 tCO2e', () => {
    const e = estimateEnteric({ animal: 'dairy_cattle', headcount: 1, region: 'north_america' });
    expect(e.emissions).toBeCloseTo(3.726, 6);
    expect(e.dataQuality).toBe('secondary');
    expect(e.gas).toBe('CH4');
    expect(e.factor.source).toContain('Table 10.11');
    expect(e.factor.value).toBe(138);
  });

  it('Indian subcontinent buffalo, 100 head → 100 × 85 × 27.0 / 1000 = 229.5 tCO2e', () => {
    const e = estimateEnteric({ animal: 'buffalo', headcount: 100, region: 'indian_subcontinent' });
    expect(e.emissions).toBe(229.5);
    expect(e.factor.value).toBe(85);
  });

  it('sheep (low default), 1000 head → 1000 × 5 × 27.0 / 1000 = 135 tCO2e', () => {
    const e = estimateEnteric({ animal: 'sheep', headcount: 1000 });
    expect(e.emissions).toBe(135);
    expect(e.factor.value).toBe(5);
    expect(e.factor.source).toContain('Table 10.10');
  });

  it('sheep high productivity, 1000 head → 1000 × 9 × 27.0 / 1000 = 243 tCO2e', () => {
    const e = estimateEnteric({ animal: 'sheep', headcount: 1000, productivity: 'high' });
    expect(e.emissions).toBe(243);
    expect(e.factor.value).toBe(9);
  });

  it('headcount 0 → 0 tCO2e, no throw, factor provenance still present', () => {
    const e = estimateEnteric({ animal: 'dairy_cattle', headcount: 0, region: 'north_america' });
    expect(e.emissions).toBe(0);
    expect(e.factor.source).toContain('Table 10.11');
    expect(e.factor.value).toBe(138);
  });

  it('cattle with NO region → throws (refuses to guess)', () => {
    expect(() => estimateEnteric({ animal: 'dairy_cattle', headcount: 10 })).toThrow();
  });

  it('cattle in a region with no buffalo herd (north_america buffalo) → throws', () => {
    expect(() => estimateEnteric({ animal: 'buffalo', headcount: 10, region: 'north_america' })).toThrow();
  });

  it('unknown animal → throws', () => {
    expect(() => estimateEnteric({ animal: 'llama', headcount: 10 })).toThrow();
  });

  it('negative headcount → throws', () => {
    expect(() => estimateEnteric({ animal: 'sheep', headcount: -1 })).toThrow();
  });

  it('provenance: factor carries unit kgCH4/head/yr, tier 1, and a Table 10.10/10.11 source', () => {
    const cow = estimateEnteric({ animal: 'other_cattle', headcount: 1, region: 'africa' });
    expect(cow.factor.unit).toBe('kgCH4/head/yr');
    expect(cow.factor.tier).toBe(1);
    expect(cow.factor.source).toMatch(/Table 10\.11/);
    const goat = estimateEnteric({ animal: 'goats', headcount: 1 });
    expect(goat.factor.unit).toBe('kgCH4/head/yr');
    expect(goat.factor.tier).toBe(1);
    expect(goat.factor.source).toMatch(/Table 10\.10/);
  });
});
