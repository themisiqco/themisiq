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
  it('swine finishing NA, HIGH (Tier 1a explicit) temperate solid_storage, 100 head, factor 12.1', () => {
    // VS_annual = 3.9 × 61 / 1000 × 365 = 86.8335 (NOT 86.8635 — brief's intermediate slipped) ;
    // 100 × 86.8335 × 12.1 × 27 / 1e6 = 2.836850445. HIGH is now an explicit Tier 1a opt-in.
    const e = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 100, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(2.836850445, 6);
    expect(e.factor.value).toBe(12.1);
    expect(e.dataQuality).toBe('secondary');
    expect(e.gas).toBe('CH4');
    expect(e.factor.source).toContain('Table 10.14');
    // 10 head → 0.28368
    const e10 = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 10, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e10.emissions).toBeCloseTo(0.2836850445, 6);
    expect(e10.emissions).toBeCloseTo(0.284, 3);
  });

  it('poultry broilers NA, HIGH (Tier 1a explicit) warm solid_storage, 10000 head, factor 13.1', () => {
    // VS 16.8 × wt 1.4 /1000 ×365 = 8.5848 ; ×10000 × 13.1 × 27 /1e6 ≈ 30.36
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'broilers', headcount: 10000, region: 'north_america', system: 'solid_storage', climate: 'warm', productivity: 'high' });
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

  it('headcount 0 → 0 no throw; negative → throws (default LOW factor 7.8)', () => {
    // No explicit productivity → simple Tier 1 low default → swine.low.solid_storage.temperate = 7.8.
    const e = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 0, region: 'north_america', system: 'solid_storage', climate: 'temperate' });
    expect(e.emissions).toBe(0);
    expect(e.factor.value).toBe(7.8);
    expect(() => estimateManureCH4({ animal: 'poultry', subcategory: 'hens', headcount: -1, region: 'africa', system: 'dry_lot' })).toThrow();
  });

  it('cattle path unchanged: dairy NA solid_storage temperate HP, 1 head → 0.37717056', () => {
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(0.37717056, 8);
    expect(e.factor.value).toBe(6.4);
  });
});

describe('estimateManureCH4 — sheep/goats/horses/mules_asses/camels (M2b)', () => {
  it('1. sheep developed, HIGH (Tier 1a explicit) temperate solid_storage, 1000 head, factor 5.1', () => {
    // VS_annual = 8.2 × 40 / 1000 × 365 = 119.72 ; 1000 × 119.72 × 5.1 × 27 / 1e6 = 16.485444
    const e = estimateManureCH4({ animal: 'sheep', headcount: 1000, region: 'developed', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(16.49, 1);
    expect(e.factor.value).toBe(5.1);
    expect(e.dataQuality).toBe('secondary');
    expect(e.gas).toBe('CH4');
    expect(e.factor.source).toContain('Table 10.14');
  });

  it('2. camels HIGH warm dry_lot, 100 head, factor 0.0 → exactly 0 (legit zero, not throw)', () => {
    const e = estimateManureCH4({ animal: 'camels', headcount: 100, region: 'developed', system: 'dry_lot', climate: 'warm', productivity: 'high' });
    expect(e.emissions).toBe(0);
    expect(e.factor.value).toBe(0);
  });

  it('3. camels HIGH warm solid_storage, 100 head, factor 8.7 (global VS 11.5/wt 217)', () => {
    // VS_annual = 11.5 × 217 / 1000 × 365 = 910.8575 ; 100 × 910.8575 × 8.7 × 27 / 1e6 = 21.396
    const e = estimateManureCH4({ animal: 'camels', headcount: 100, region: 'developed', system: 'solid_storage', climate: 'warm', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(21.4, 1);
    expect(e.factor.value).toBe(8.7);
  });

  it('4. horses developing (→low) cool solid_storage, 10 head, factor 3.5', () => {
    // VS_annual = 7.2 × 238 / 1000 × 365 = 625.464 ; 10 × 625.464 × 3.5 × 27 / 1e6 = 0.5910635
    const e = estimateManureCH4({ animal: 'horses', headcount: 10, region: 'developing', system: 'solid_storage', climate: 'cool' });
    expect(e.emissions).toBeCloseTo(0.591, 3);
    expect(e.factor.value).toBe(3.5);
  });

  it('5. sheep + daily_spread throws; goats + burned_for_fuel throws', () => {
    expect(() => estimateManureCH4({ animal: 'sheep', headcount: 1, region: 'developed', system: 'daily_spread', climate: 'temperate' })).toThrow();
    expect(() => estimateManureCH4({ animal: 'goats', headcount: 1, region: 'developed', system: 'burned_for_fuel' })).toThrow();
  });

  it('6. sheep developed pasture_range_paddock, 100 head → factor 0.6 (climate ignored)', () => {
    // VS_annual 119.72 ; 100 × 119.72 × 0.6 × 27 / 1e6 = 0.1939464
    const e = estimateManureCH4({ animal: 'sheep', headcount: 100, region: 'developed', system: 'pasture_range_paddock' });
    expect(e.emissions).toBeCloseTo(0.194, 3);
    expect(e.factor.value).toBe(0.6);
  });

  it('7. mules_asses global: any region → same VS 7.2 / wt 130; temperate high solid_storage, 50 head, factor 8.8', () => {
    // VS_annual = 7.2 × 130 / 1000 × 365 = 341.64 ; 50 × 341.64 × 8.8 × 27 / 1e6 = 4.0586832
    const e = estimateManureCH4({ animal: 'mules_asses', headcount: 50, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(4.06, 2);
    expect(e.factor.value).toBe(8.8);
    // region-invariant VS/weight: a different region yields the identical emissions.
    const e2 = estimateManureCH4({ animal: 'mules_asses', headcount: 50, region: 'africa', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e2.emissions).toBeCloseTo(4.06, 2);
  });

  it('8. climate omitted on solid_storage throws; headcount 0 → 0; negative → throws', () => {
    expect(() => estimateManureCH4({ animal: 'sheep', headcount: 1, region: 'developed', system: 'solid_storage' })).toThrow();
    const e0 = estimateManureCH4({ animal: 'sheep', headcount: 0, region: 'developed', system: 'solid_storage', climate: 'temperate' });
    expect(e0.emissions).toBe(0);
    expect(() => estimateManureCH4({ animal: 'sheep', headcount: -1, region: 'developed', system: 'solid_storage', climate: 'temperate' })).toThrow();
  });

  it('9. region resolution: 9-region key maps VS/weight two-way (default low factor for both)', () => {
    // Under the unified LOW default, factor is 3.5 for BOTH regions; but VS/weight two-way
    // resolution still differs (developed 9/40 vs developing 10.4/24) → emissions differ.
    const dev = estimateManureCH4({ animal: 'goats', headcount: 100, region: 'western_europe', system: 'solid_storage', climate: 'temperate' });
    const devg = estimateManureCH4({ animal: 'goats', headcount: 100, region: 'africa', system: 'solid_storage', climate: 'temperate' });
    expect(dev.factor.value).toBe(3.5);   // simple Tier 1 low default (was 4.8 under old developed→high)
    expect(devg.factor.value).toBe(3.5);
    expect(dev.emissions).not.toBe(devg.emissions); // VS/weight two-way still differ
    expect(dev.factor.unit).toBe('gCH4/kgVS');
    expect(dev.factor.tier).toBe(1);
    // explicit high still selects the high column (Tier 1a)
    const devHigh = estimateManureCH4({ animal: 'goats', headcount: 100, region: 'western_europe', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(devHigh.factor.value).toBe(4.8);
  });
});

describe('estimateManureCH4 — liquid: uncovered_anaerobic_lagoon (M3a, 10-zone)', () => {
  it('1. swine finishing NA lagoon tropical_wet — HIGH explicit → 241.2; default LOW → 155.4', () => {
    // HIGH (Tier 1a): VS_annual 86.8335 ; 100 × 86.8335 × 241.2 × 27 / 1e6 = 56.549
    const hi = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 100, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'tropical_wet', productivity: 'high' });
    expect(hi.emissions).toBeCloseTo(56.55, 1);
    expect(hi.factor.value).toBe(241.2);
    expect(hi.factor.source).toContain('Table 10.14');
    // DEFAULT (no productivity) → simple Tier 1 low → swine.low lagoon tropical_wet = 155.4
    // 100 × 86.8335 × 155.4 × 27 / 1e6 = 36.4336
    const lo = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 100, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'tropical_wet' });
    expect(lo.emissions).toBeCloseTo(36.43, 1);
    expect(lo.factor.value).toBe(155.4);
  });

  it('2. dairy NA cool_temp_moist lagoon, 1 head, HIGH explicit → factor 96.5', () => {
    // VS_annual = 9.2 × 650 / 1000 × 365 = 2182.7 ; 2182.7 × 96.5 × 27 / 1e6 = 5.687
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'cool_temp_moist', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(5.687, 2);
    expect(e.factor.value).toBe(96.5);
  });

  it('3. poultry broilers Africa (→low) tropical_dry lagoon → factor 2.4 (poultry-LP, NOT lagoon value)', () => {
    // VS 15.9 × wt 0.8 /1000 ×365 = 4.6428 ; 1000 × 4.6428 × 2.4 × 27 / 1e6 = 0.30085
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'broilers', headcount: 1000, region: 'africa', system: 'uncovered_anaerobic_lagoon', climateZone: 'tropical_dry' });
    expect(e.emissions).toBeCloseTo(0.301, 3);
    expect(e.factor.value).toBe(2.4);
  });

  it('4. other_cattle LP lagoon cool_temp_moist == dairy LP lagoon (both 52.3)', () => {
    const other = estimateManureCH4({ animal: 'other_cattle', headcount: 1, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'cool_temp_moist', productivity: 'low' });
    const dairy = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'cool_temp_moist', productivity: 'low' });
    expect(other.factor.value).toBe(52.3);
    expect(dairy.factor.value).toBe(52.3);
  });

  it('5. buffalo western_europe warm_temp_dry lagoon → other_cattle.low factor 66.2 (footnote 6), buffalo own VS/wt', () => {
    // buffalo VS 7.7 × wt 509 /1000 ×365 = 1430.5445 ; 10 × 1430.5445 × 66.2 × 27 / 1e6 = 25.564
    const e = estimateManureCH4({ animal: 'buffalo', headcount: 10, region: 'western_europe', system: 'uncovered_anaerobic_lagoon', climateZone: 'warm_temp_dry' });
    expect(e.emissions).toBeCloseTo(25.6, 1);
    expect(e.factor.value).toBe(66.2);
    expect(e.factor.note).toMatch(/footnote 6/);
  });

  it('6. sheep + lagoon → throws (no liquid systems for sheep)', () => {
    expect(() => estimateManureCH4({ animal: 'sheep', headcount: 1, region: 'developed', system: 'uncovered_anaerobic_lagoon', climateZone: 'cool_temp_moist' })).toThrow();
  });

  it('7. lagoon with NO climateZone → throws; dry solid_storage still works with 3-zone climate', () => {
    expect(() => estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'uncovered_anaerobic_lagoon' })).toThrow();
    // dry path unchanged: dairy NA solid_storage temperate HP, 1 head → 0.37717056
    const dry = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(dry.emissions).toBeCloseTo(0.37717056, 8);
    expect(dry.factor.value).toBe(6.4);
  });

  it('8. headcount 0 → 0 (no throw, default LOW factor 52.3); negative → throws', () => {
    // No explicit productivity → simple Tier 1 low → dairy.low lagoon cool_temp_moist = 52.3.
    const e0 = estimateManureCH4({ animal: 'dairy_cattle', headcount: 0, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'cool_temp_moist' });
    expect(e0.emissions).toBe(0);
    expect(e0.factor.value).toBe(52.3);
    expect(() => estimateManureCH4({ animal: 'dairy_cattle', headcount: -1, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'cool_temp_moist' })).toThrow();
  });
});

describe('estimateManureCH4 — productivity default = simple Tier 1 low (Tier 1a is opt-in)', () => {
  it('dairy NA solid_storage temperate, NO productivity → LOW factor 3.5 + simple-Tier-1 basis', () => {
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'solid_storage', climate: 'temperate' });
    expect(e.factor.value).toBe(3.5); // dairy.low.solid_storage.temperate (NOT high 6.4)
    expect(e.factor.tier).toBe(1);
    expect(e.basis).toContain('simple Tier 1');
    expect(e.basis).toContain('low-productivity default');
  });

  it("dairy NA solid_storage temperate, productivity:'high' → Tier 1a factor 6.4 + Tier-1a basis", () => {
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e.factor.value).toBe(6.4); // Tier 1a opt-in
    expect(e.factor.tier).toBe(1);    // shared tier field stays 1; basis carries the 1a distinction
    expect(e.basis).toContain('Tier 1a');
    expect(e.basis).toContain('caller-specified');
  });

  it('swine developed tropical_wet lagoon: default LOW 155.4 vs explicit HIGH 241.2', () => {
    const lo = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 1, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'tropical_wet' });
    const hi = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 1, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'tropical_wet', productivity: 'high' });
    expect(lo.factor.value).toBe(155.4);
    expect(hi.factor.value).toBe(241.2);
    expect(lo.basis).toContain('simple Tier 1');
    expect(hi.basis).toContain('Tier 1a');
  });
});

describe('estimateManureCH4 — liquid: slurry/pit >1mo & <1mo (M3b, 10-zone)', () => {
  it('1. dairy NA default-low tropical_wet gt_1_month, 1 head → factor 66.2', () => {
    // VS_annual 2182.7 ; 2182.7 × 66.2 × 27 / 1e6 = 3.9014
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'liquid_slurry_pit_gt_1_month', climateZone: 'tropical_wet' });
    expect(e.emissions).toBeCloseTo(3.901, 2);
    expect(e.factor.value).toBe(66.2);
    expect(e.factor.source).toContain('Table 10.14');
  });

  it('2. swine finishing NA tropical_dry lt_1_month, HIGH explicit, 100 head → factor 126.6', () => {
    // VS_annual 86.8335 ; 100 × 86.8335 × 126.6 × 27 / 1e6 = 29.681
    const e = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 100, region: 'north_america', system: 'liquid_slurry_pit_lt_1_month', climateZone: 'tropical_dry', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(29.68, 1);
    expect(e.factor.value).toBe(126.6);
  });

  it('3. swine finishing NA tropical_dry lt_1_month, default LOW, 100 head → factor 81.6', () => {
    // 100 × 86.8335 × 81.6 × 27 / 1e6 = 19.131
    const e = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 100, region: 'north_america', system: 'liquid_slurry_pit_lt_1_month', climateZone: 'tropical_dry' });
    expect(e.emissions).toBeCloseTo(19.13, 1);
    expect(e.factor.value).toBe(81.6);
  });

  it('4. dairy + lt_1_month → throws (no <1 month row for dairy)', () => {
    expect(() => estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'liquid_slurry_pit_lt_1_month', climateZone: 'tropical_dry' })).toThrow();
  });

  it('5. buffalo WE warm_temp_dry gt_1_month → other_cattle.low factor 35.7 (footnote 6), 10 head', () => {
    // buffalo VS 7.7 × wt 509 /1000 ×365 = 1430.5445 ; 10 × 1430.5445 × 35.7 × 27 / 1e6 = 13.789
    const e = estimateManureCH4({ animal: 'buffalo', headcount: 10, region: 'western_europe', system: 'liquid_slurry_pit_gt_1_month', climateZone: 'warm_temp_dry' });
    expect(e.emissions).toBeCloseTo(13.8, 1);
    expect(e.factor.value).toBe(35.7);
    expect(e.factor.note).toMatch(/footnote 6/);
  });

  it('6. buffalo + lt_1_month → throws (no other_cattle source row)', () => {
    expect(() => estimateManureCH4({ animal: 'buffalo', headcount: 1, region: 'western_europe', system: 'liquid_slurry_pit_lt_1_month', climateZone: 'warm_temp_dry' })).toThrow();
  });

  it('7. sheep + gt_1_month throws; poultry LOW + gt_1_month → 2.4 (not the gt_1_month value)', () => {
    expect(() => estimateManureCH4({ animal: 'sheep', headcount: 1, region: 'developed', system: 'liquid_slurry_pit_gt_1_month', climateZone: 'cool_temp_moist' })).toThrow();
    const p = estimateManureCH4({ animal: 'poultry', subcategory: 'hens', headcount: 1, region: 'africa', system: 'liquid_slurry_pit_gt_1_month', climateZone: 'tropical_wet' });
    expect(p.factor.value).toBe(2.4);
  });

  it('8. other_cattle.low gt_1_month == dairy.low gt_1_month at cool_temp_moist (both 18.3)', () => {
    const other = estimateManureCH4({ animal: 'other_cattle', headcount: 1, region: 'north_america', system: 'liquid_slurry_pit_gt_1_month', climateZone: 'cool_temp_moist', productivity: 'low' });
    const dairy = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'liquid_slurry_pit_gt_1_month', climateZone: 'cool_temp_moist', productivity: 'low' });
    expect(other.factor.value).toBe(18.3);
    expect(dairy.factor.value).toBe(18.3);
  });

  it('9. gt_1_month with no climateZone → throws; headcount 0 → 0', () => {
    expect(() => estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'liquid_slurry_pit_gt_1_month' })).toThrow();
    const e0 = estimateManureCH4({ animal: 'dairy_cattle', headcount: 0, region: 'north_america', system: 'liquid_slurry_pit_gt_1_month', climateZone: 'tropical_wet' });
    expect(e0.emissions).toBe(0);
    expect(e0.factor.value).toBe(66.2); // default low
  });
});
