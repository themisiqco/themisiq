// lib/flag.test.ts
// Land-sector (FLAG, LSRS Track A) engine tests.
// Exact-number assertions; core invariant: the three categories are reported
// separately and removals are NEVER netted into gross emissions.
import { describe, it, expect } from 'vitest';
import { computeFlag } from './flag/engine';
import { estimateEnteric, estimateManureCH4 } from './flag/estimate';
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

describe('estimateManureCH4 — IPCC 2019 Tier 1 manure CH4 (biogenic GWP 27.0)', () => {
  // VS_annual = VS_mean × weight_mean / 1000 × 365 ; tCO2e = head × VS_annual × factor × 27.0 / 1e6
  it('dairy NA, solid_storage temperate HP, 1 head', () => {
    // VS 9.2 × wt 650 /1000 ×365 = 2182.7 ; × factor 6.4 × 27 /1e6 = 0.37717056
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(0.37717056, 8);
    expect(e.dataQuality).toBe('secondary');
    expect(e.gas).toBe('CH4');
    expect(e.factor.value).toBe(6.4);
    expect(e.factor.unit).toBe('gCH4/kgVS');
    expect(e.factor.source).toContain('Table 10.14');
  });

  it('other_cattle asia, burned_for_fuel HP (climate omitted OK), 1 head', () => {
    // VS 9.8 × wt 299 /1000 ×365 = 1069.523 ; × factor 12.1 × 27 /1e6 = 0.3494131641
    const e = estimateManureCH4({ animal: 'other_cattle', headcount: 1, region: 'asia', system: 'burned_for_fuel', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(0.3494131641, 8);
    expect(e.factor.value).toBe(12.1);
  });

  it('dairy africa, pasture_range_paddock (climate omitted OK), 100 head → factor 0.6', () => {
    // VS 18.2 × wt 260 /1000 ×365 = 1727.18 ; ×100 × 0.6 × 27 /1e6 = 2.7980316
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 100, region: 'africa', system: 'pasture_range_paddock', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(2.7980316, 6);
    expect(e.factor.value).toBe(0.6);
  });

  it('buffalo indian_subcontinent, dry_lot warm — factor borrows other_cattle.low (footnote 6)', () => {
    // buffalo VS 15.2 × wt 321 /1000 ×365 = 1780.908 ; factor = other_cattle.low.dry_lot.warm = 1.7
    // ×10 × 1.7 × 27 /1e6 = 0.817436772
    const e = estimateManureCH4({ animal: 'buffalo', headcount: 10, region: 'indian_subcontinent', system: 'dry_lot', climate: 'warm', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(0.817436772, 8);
    expect(e.factor.value).toBe(1.7);                 // other_cattle.low, NOT dairy/high
    expect(e.factor.note).toMatch(/footnote 6/);
  });

  it('buffalo forces LOW factor even when productivity high is passed', () => {
    // buffalo africa solid_storage cool → other_cattle.low.solid_storage.cool = 1.7 (not other.high 2.4)
    const e = estimateManureCH4({ animal: 'buffalo', headcount: 1, region: 'africa', system: 'solid_storage', climate: 'cool', productivity: 'high' });
    expect(e.factor.value).toBe(1.7);
    expect(e.factor.note).toMatch(/footnote 6/);
  });

  it('buffalo in a non-farmed region (north_america) → throws on VS/weight', () => {
    expect(() => estimateManureCH4({ animal: 'buffalo', headcount: 10, region: 'north_america', system: 'solid_storage', climate: 'cool' })).toThrow();
    expect(() => estimateManureCH4({ animal: 'buffalo', headcount: 10, region: 'oceania', system: 'dry_lot', climate: 'warm' })).toThrow();
  });

  it('climate-keyed system without climate → throws', () => {
    expect(() => estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'solid_storage', productivity: 'high' })).toThrow();
  });

  it('unknown region → throws', () => {
    expect(() => estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'antarctica', system: 'pasture_range_paddock' })).toThrow();
  });

  it('negative headcount → throws', () => {
    expect(() => estimateManureCH4({ animal: 'dairy_cattle', headcount: -1, region: 'north_america', system: 'pasture_range_paddock' })).toThrow();
  });

  it('headcount 0 → 0 tCO2e, no throw, factor provenance present', () => {
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 0, region: 'north_america', system: 'dry_lot', climate: 'cool', productivity: 'low' });
    expect(e.emissions).toBe(0);
    expect(e.factor.value).toBe(0.9);                 // dairy.low.dry_lot.cool
    expect(e.factor.source).toContain('Table 10.14');
  });

  it('productivity defaults to low when omitted', () => {
    // dairy NA solid_storage temperate, no productivity → low factor 3.5 (not high 6.4)
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'solid_storage', climate: 'temperate' });
    expect(e.factor.value).toBe(3.5);
  });
});

describe('estimateManureCH4 — swine & poultry (M2a)', () => {
  it('swine finishing NA (→high) temperate solid_storage, 100 head, factor 12.1', () => {
    // VS_annual = 3.9 × 61 / 1000 × 365 = 86.8335 (NOT 86.8635 — brief's intermediate slipped) ;
    // 100 × 86.8335 × 12.1 × 27 / 1e6 = 2.836850445. Brief's "0.2838 for 100 head" = the 10-head value.
    const e = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 100, region: 'north_america', system: 'solid_storage', climate: 'temperate' });
    expect(e.emissions).toBeCloseTo(2.836850445, 6);
    expect(e.factor.value).toBe(12.1);
    expect(e.dataQuality).toBe('secondary');
    expect(e.gas).toBe('CH4');
    expect(e.factor.source).toContain('Table 10.14');
    // 10 head → 0.28368 (≈ the brief's stated 0.284)
    const e10 = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 10, region: 'north_america', system: 'solid_storage', climate: 'temperate' });
    expect(e10.emissions).toBeCloseTo(0.2836850445, 6);
    expect(e10.emissions).toBeCloseTo(0.284, 3);
  });

  it('poultry broilers NA (→high) warm solid_storage, 10000 head, factor 13.1', () => {
    // VS 16.8 × wt 1.4 /1000 ×365 = 8.5848 ; ×10000 × 13.1 × 27 /1e6 ≈ 30.36
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'broilers', headcount: 10000, region: 'north_america', system: 'solid_storage', climate: 'warm' });
    expect(e.emissions).toBeCloseTo(30.35, 1);
    expect(e.factor.value).toBe(13.1);
  });

  it('poultry LOW → all-systems 2.4, climate ignored (hens Africa dry_lot, 1000 head)', () => {
    // Africa → low; poultry.low = 2.4 flat. VS 10.2 × 1.4 /1000×365 = 5.2122 ; ×1000 ×2.4 ×27 /1e6 ≈ 0.3378
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'hens', headcount: 1000, region: 'africa', system: 'dry_lot' });
    expect(e.emissions).toBeCloseTo(0.338, 3);
    expect(e.factor.value).toBe(2.4);
  });

  it('poultry + pasture_range_paddock → throws (not applicable)', () => {
    expect(() => estimateManureCH4({ animal: 'poultry', subcategory: 'hens', headcount: 1, region: 'north_america', system: 'pasture_range_paddock' })).toThrow();
  });

  it('swine + pasture_range_paddock → throws (not applicable)', () => {
    expect(() => estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 1, region: 'north_america', system: 'pasture_range_paddock', climate: 'temperate' })).toThrow();
  });

  it('poultry + daily_spread → throws (no daily_spread row for poultry)', () => {
    expect(() => estimateManureCH4({ animal: 'poultry', subcategory: 'broilers', headcount: 1, region: 'north_america', system: 'daily_spread', climate: 'warm' })).toThrow();
  });

  it('swine / poultry with NO subcategory → throws', () => {
    expect(() => estimateManureCH4({ animal: 'swine', headcount: 1, region: 'north_america', system: 'solid_storage', climate: 'temperate' })).toThrow();
    expect(() => estimateManureCH4({ animal: 'poultry', headcount: 1, region: 'north_america', system: 'solid_storage', climate: 'warm' })).toThrow();
  });

  it('swine finishing NA solid_storage with NO climate → throws (HP, climate required)', () => {
    expect(() => estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 1, region: 'north_america', system: 'solid_storage' })).toThrow();
  });

  it('headcount 0 → 0 no throw; negative → throws', () => {
    const e = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 0, region: 'north_america', system: 'solid_storage', climate: 'temperate' });
    expect(e.emissions).toBe(0);
    expect(e.factor.value).toBe(12.1);
    expect(() => estimateManureCH4({ animal: 'poultry', subcategory: 'hens', headcount: -1, region: 'africa', system: 'dry_lot' })).toThrow();
  });

  it('cattle path unchanged: dairy NA solid_storage temperate HP, 1 head → 0.37717056', () => {
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(0.37717056, 8);
    expect(e.factor.value).toBe(6.4);
  });
});
