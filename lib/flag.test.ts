// lib/flag.test.ts
// Land-sector (FLAG, LSRS Track A) engine tests.
// Exact-number assertions; core invariant: the three categories are reported
// separately and removals are NEVER netted into gross emissions.
import { describe, it, expect } from 'vitest';
import { computeFlag } from './flag/engine';
import { estimateEnteric, estimateManureCH4, estimateManureN2O, estimateManureN2OIndirect, estimateSyntheticFertiliserN2O, estimateAppliedManureN2O, estimateGrazingDepositionN2O, estimateCropResidueN2O, estimateLUCtoCropland, forestBiomassCarbon } from './flag/estimate';
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

describe('estimateManureCH4 — biogas: anaerobic_digestion (M3c, 3-zone + digester quality)', () => {
  it('1. dairy NA temperate biogas gas_tight, 1 head → factor 3.7', () => {
    // VS_annual 2182.7 ; 2182.7 × 3.7 × 27 / 1e6 = 0.2181
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'temperate', digesterQuality: 'gas_tight' });
    expect(e.emissions).toBeCloseTo(0.218, 3);
    expect(e.factor.value).toBe(3.7);
    expect(e.basis).toContain('gas_tight');
    expect(e.basis).toContain('footnote 8');
  });

  it('2. dairy NA temperate biogas, NO digesterQuality (default leaky) → factor 9.5 (> gas_tight)', () => {
    // 2182.7 × 9.5 × 27 / 1e6 = 0.5599
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'temperate' });
    expect(e.emissions).toBeCloseTo(0.560, 3);
    expect(e.factor.value).toBe(9.5);          // inversion: leaky default > gas_tight
    expect(e.basis).toContain('leaky');
    expect(e.basis).toContain('conservative default');
  });

  it('3. swine finishing NA warm biogas (default leaky), 100 head → factor 21.2', () => {
    // VS_annual 86.8335 ; 100 × 86.8335 × 21.2 × 27 / 1e6 = 4.9703
    const e = estimateManureCH4({ animal: 'swine', subcategory: 'finishing', headcount: 100, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'warm' });
    expect(e.emissions).toBeCloseTo(4.97, 2);
    expect(e.factor.value).toBe(21.2);
  });

  it('4. poultry broilers NA cool biogas gas_tight, 1000 head → factor 5.2', () => {
    // VS 16.8 × wt 1.4 /1000 ×365 = 8.5848 ; 1000 × 8.5848 × 5.2 × 27 / 1e6 = 1.2053
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'broilers', headcount: 1000, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'cool', digesterQuality: 'gas_tight' });
    expect(e.emissions).toBeCloseTo(1.205, 3);
    expect(e.factor.value).toBe(5.2);
  });

  it('5. poultry leaky biogas → 2.4 (no poultry.leaky row)', () => {
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'hens', headcount: 1, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'warm', digesterQuality: 'leaky' });
    expect(e.factor.value).toBe(2.4);
  });

  it('6. buffalo WE cool biogas gas_tight → other_cattle.gas_tight[cool] 2.4 (footnote 6)', () => {
    // buffalo VS 7.7 × wt 509 /1000 ×365 = 1430.5445 ; 1 × 1430.5445 × 2.4 × 27 / 1e6 = 0.09270
    const e = estimateManureCH4({ animal: 'buffalo', headcount: 1, region: 'western_europe', system: 'anaerobic_digestion_biogas', climate: 'cool', digesterQuality: 'gas_tight' });
    expect(e.emissions).toBeCloseTo(0.093, 3);
    expect(e.factor.value).toBe(2.4);
    expect(e.factor.note).toMatch(/footnote 6/);
  });

  it('7. sheep + biogas throws; biogas with climateZone (no climate) throws', () => {
    expect(() => estimateManureCH4({ animal: 'sheep', headcount: 1, region: 'developed', system: 'anaerobic_digestion_biogas', climate: 'temperate' })).toThrow();
    expect(() => estimateManureCH4({ animal: 'dairy_cattle', headcount: 1, region: 'north_america', system: 'anaerobic_digestion_biogas', climateZone: 'tropical_wet' })).toThrow();
  });

  it('8. biogas IGNORES productivity — same result with/without productivity set', () => {
    const withProd = estimateManureCH4({ animal: 'dairy_cattle', headcount: 5, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'temperate', digesterQuality: 'gas_tight', productivity: 'high' });
    const noProd = estimateManureCH4({ animal: 'dairy_cattle', headcount: 5, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'temperate', digesterQuality: 'gas_tight' });
    expect(withProd.factor.value).toBe(3.7);
    expect(withProd.emissions).toBe(noProd.emissions);
  });

  it('9. headcount 0 → 0', () => {
    const e = estimateManureCH4({ animal: 'dairy_cattle', headcount: 0, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'temperate' });
    expect(e.emissions).toBe(0);
    expect(e.factor.value).toBe(9.5); // default leaky
  });
});

describe('estimateManureCH4 — turkeys & ducks (M2c poultry sub-categories, global VS/weight)', () => {
  it('1. turkeys (global VS 10.3/wt 6.8) temperate solid_storage HIGH, 1000 head → poultry.high 10.5', () => {
    // VS_annual = 10.3 × 6.8 / 1000 × 365 = 25.5646 ; 1000 × 25.5646 × 10.5 × 27 / 1e6 = 7.2476
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'turkeys', headcount: 1000, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(7.247, 2);
    expect(e.factor.value).toBe(10.5);
    expect(e.factor.source).toContain('Table 10.14'); // shared poultry factor block
  });

  it('2. ducks (global VS 7.4/wt 2.7) warm solid_storage, default LOW → poultry-LOW 2.4, 5000 head', () => {
    // VS_annual = 7.4 × 2.7 / 1000 × 365 = 7.2927 ; 5000 × 7.2927 × 2.4 × 27 / 1e6 = 2.3628
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'ducks', headcount: 5000, region: 'north_america', system: 'solid_storage', climate: 'warm' });
    expect(e.emissions).toBeCloseTo(2.363, 2);
    expect(e.factor.value).toBe(2.4); // inherits poultry-LOW all-systems collapse
  });

  it('3. turkeys: region IGNORED (global) — NA vs asia give identical result', () => {
    const na = estimateManureCH4({ animal: 'poultry', subcategory: 'turkeys', headcount: 100, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    const asia = estimateManureCH4({ animal: 'poultry', subcategory: 'turkeys', headcount: 100, region: 'asia', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(na.emissions).toBe(asia.emissions);
    expect(na.factor.value).toBe(asia.factor.value);
  });

  it('4. turkeys tropical_wet lagoon HIGH, 100 head → poultry.high lagoon 209.0', () => {
    // VS_annual 25.5646 ; 100 × 25.5646 × 209.0 × 27 / 1e6 = 14.4283
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'turkeys', headcount: 100, region: 'north_america', system: 'uncovered_anaerobic_lagoon', climateZone: 'tropical_wet', productivity: 'high' });
    expect(e.emissions).toBeCloseTo(14.43, 1);
    expect(e.factor.value).toBe(209.0);
  });

  it('5. ducks cool biogas gas_tight → poultry.gas_tight[cool] 5.2, 1000 head', () => {
    // VS_annual 7.2927 ; 1000 × 7.2927 × 5.2 × 27 / 1e6 = 1.0239
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'ducks', headcount: 1000, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'cool', digesterQuality: 'gas_tight' });
    expect(e.emissions).toBeCloseTo(1.024, 3);
    expect(e.factor.value).toBe(5.2);
  });

  it('6. ducks biogas leaky (default) → 2.4 (poultry-leaky all-systems)', () => {
    const e = estimateManureCH4({ animal: 'poultry', subcategory: 'ducks', headcount: 1, region: 'north_america', system: 'anaerobic_digestion_biogas', climate: 'warm' });
    expect(e.factor.value).toBe(2.4);
  });

  it('7. turkeys + a system poultry does not support (daily_spread / pasture) → throws', () => {
    expect(() => estimateManureCH4({ animal: 'poultry', subcategory: 'turkeys', headcount: 1, region: 'north_america', system: 'daily_spread', climate: 'warm' })).toThrow();
    expect(() => estimateManureCH4({ animal: 'poultry', subcategory: 'turkeys', headcount: 1, region: 'north_america', system: 'pasture_range_paddock' })).toThrow();
  });

  it('8. headcount 0 → 0; existing chicken (hens) vector unchanged', () => {
    const t0 = estimateManureCH4({ animal: 'poultry', subcategory: 'turkeys', headcount: 0, region: 'north_america', system: 'solid_storage', climate: 'temperate', productivity: 'high' });
    expect(t0.emissions).toBe(0);
    // chicken path unchanged: hens africa dry_lot default low → 2.4
    const hens = estimateManureCH4({ animal: 'poultry', subcategory: 'hens', headcount: 1000, region: 'africa', system: 'dry_lot' });
    expect(hens.factor.value).toBe(2.4);
    expect(hens.emissions).toBeCloseTo(0.338, 3);
  });
});

describe('estimateManureN2O — direct manure-management N2O (Eq. 10.25)', () => {
  it('1. dairy NA solid_storage, 100 head → ~60.05 tCO2e (44/28 chain)', () => {
    // N_ex = 0.59×650/1000×365 = 139.9775 ; 100 × 139.9775 × 0.010 × 44/28 × 273 / 1000 = 60.0503
    const e = estimateManureN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 100, system: 'solid_storage' });
    expect(e.emissions).toBeCloseTo(60.05, 1);
    expect(e.gas).toBe('N2O');
    expect(e.dataQuality).toBe('secondary');
    expect(e.factor.value).toBe(0.010);
    expect(e.factor.unit).toBe('kgN2O-N/kgN');
    expect(e.factor.source).toContain('Table 10.21');
  });

  it('2. dairy NA uncovered_anaerobic_lagoon → EF3 0 → 0 tCO2e (legit zero, factor present)', () => {
    const e = estimateManureN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 100, system: 'uncovered_anaerobic_lagoon' });
    expect(e.emissions).toBe(0);
    expect(e.factor.value).toBe(0);
    expect(e.factor.source).toContain('Table 10.21');
  });

  it('3. dairy NA daily_spread → 0 (legit zero, no throw)', () => {
    const e = estimateManureN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 100, system: 'daily_spread' });
    expect(e.emissions).toBe(0);
  });

  it('4. dairy NA pasture_range_paddock → THROWS (Chapter 11 redirect)', () => {
    expect(() => estimateManureN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 1, system: 'pasture_range_paddock' })).toThrow(/Chapter 11/);
  });

  it('5. dairy NA burned_for_fuel → THROWS (Fuel Combustion redirect)', () => {
    expect(() => estimateManureN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 1, system: 'burned_for_fuel' })).toThrow(/Fuel Combustion/);
  });

  it('6. buffalo north_america solid_storage → THROWS (NA region absent)', () => {
    expect(() => estimateManureN2O({ animal: 'buffalo', region: 'north_america', headcount: 1, system: 'solid_storage' })).toThrow();
  });

  it('7. swine finishing WEu deep_bedding_active_mix (EF3 0.07), 100 head → ~50.81', () => {
    // N_ex = 0.76×61/1000×365 = 16.9214 ; 100 × 16.9214 × 0.07 × 44/28 × 273 / 1000 = 50.8150
    const e = estimateManureN2O({ animal: 'swine', subcategory: 'finishing', region: 'western_europe', headcount: 100, system: 'deep_bedding_active_mix' });
    expect(e.emissions).toBeCloseTo(50.81, 1);
    expect(e.factor.value).toBe(0.07);
  });

  it('8. turkeys (global Nrate 0.74/wt 6.8) solid_storage, 1000 head → ~7.879', () => {
    const e = estimateManureN2O({ animal: 'poultry', subcategory: 'turkeys', region: 'north_america', headcount: 1000, system: 'solid_storage' });
    expect(e.emissions).toBeCloseTo(7.879, 2);
    expect(e.factor.value).toBe(0.010);
  });

  it('9. sheep developed uses TWO-WAY N-rate (0.35) — differs from developing (0.32)', () => {
    // developed: 0.35×40/1000×365 → 21.9219 ; developing: 0.32×31/1000×365 → 15.5332
    const dev = estimateManureN2O({ animal: 'sheep', region: 'developed', headcount: 1000, system: 'solid_storage' });
    const devg = estimateManureN2O({ animal: 'sheep', region: 'developing', headcount: 1000, system: 'solid_storage' });
    expect(dev.emissions).toBeCloseTo(21.92, 1);
    expect(devg.emissions).toBeCloseTo(15.53, 1);
    expect(dev.emissions).not.toBe(devg.emissions);
  });

  it('10. headcount 0 → 0; negative → throws; niche system (composting_in_vessel) → throws', () => {
    const e0 = estimateManureN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 0, system: 'solid_storage' });
    expect(e0.emissions).toBe(0);
    expect(() => estimateManureN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: -1, system: 'solid_storage' })).toThrow();
    expect(() => estimateManureN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 1, system: 'composting_in_vessel' })).toThrow();
  });

  it('camels use GLOBAL N-rate (0.46) and GLOBAL weight (217) — region ignored', () => {
    // N_ex = 0.46×217/1000×365 = 36.4343 ; 1 × 36.4343 × 0.010 × 44/28 × 273 / 1000 = 0.15630
    const na = estimateManureN2O({ animal: 'camels', region: 'north_america', headcount: 1, system: 'solid_storage' });
    const asia = estimateManureN2O({ animal: 'camels', region: 'asia', headcount: 1, system: 'solid_storage' });
    expect(na.emissions).toBeCloseTo(0.156, 3);
    expect(na.emissions).toBe(asia.emissions); // region ignored (fully global)
    expect(na.factor.value).toBe(0.010);
  });
});

describe('estimateManureN2OIndirect — volatilisation (Eq.10.26) + leaching (Eq.10.27)', () => {
  it('1. dairy NA solid_storage WET, 100 head → vol 25.221 + leach 1.321 = 26.542', () => {
    // N_ex 139.9775 ; FracGas(dairy_cow,solid_storage)=0.30, EF4(wet)=0.014 ; FracLeach=0.02, EF5=0.011
    const e = estimateManureN2OIndirect({ animal: 'dairy_cattle', region: 'north_america', headcount: 100, system: 'solid_storage', climate: 'wet' });
    expect(e.emissions).toBeCloseTo(26.542, 2);
    expect(e.breakdown!.volatilisation).toBeCloseTo(25.221, 2);
    expect(e.breakdown!.leaching).toBeCloseTo(1.321, 2);
    expect(e.gas).toBe('N2O');
    expect(e.dataQuality).toBe('secondary');
    expect(e.factor.value).toBe(0.014); // EF4 wet
    expect(e.factor.source).toContain('Table 11.3');
  });

  it('2. dairy NA solid_storage DRY → EF4 0.005, leaching EXACTLY 0', () => {
    const e = estimateManureN2OIndirect({ animal: 'dairy_cattle', region: 'north_america', headcount: 100, system: 'solid_storage', climate: 'dry' });
    expect(e.breakdown!.leaching).toBe(0);          // dry-climate leaching gate
    expect(e.breakdown!.volatilisation).toBeCloseTo(9.008, 2);
    expect(e.emissions).toBeCloseTo(9.008, 2);
    expect(e.factor.value).toBe(0.005);             // EF4 dry
  });

  it('3. poultry broilers dry_lot WET → THROWS (dry_lot poultry = NA)', () => {
    expect(() => estimateManureN2OIndirect({ animal: 'poultry', subcategory: 'broilers', region: 'north_america', headcount: 1, system: 'dry_lot', climate: 'wet' })).toThrow(/not applicable.*NA/);
  });

  it('4. poultry liquid_slurry_crust → THROWS "no data / country-specific" (NODATA, not NA)', () => {
    expect(() => estimateManureN2OIndirect({ animal: 'poultry', subcategory: 'hens', region: 'north_america', headcount: 1, system: 'liquid_slurry_crust', climate: 'wet' }))
      .toThrow(/no IPCC default.*country-specific/);
  });

  it('5. buffalo WEu → other_cattle group; solid_storage WET computes (FracGas 0.45)', () => {
    // buffalo Nrate WEu 0.45 × wt 509 → N_ex 83.60325 ; FracGas(other_cattle,solid_storage)=0.45
    const e = estimateManureN2OIndirect({ animal: 'buffalo', region: 'western_europe', headcount: 1, system: 'solid_storage', climate: 'wet' });
    expect(e.emissions).toBeCloseTo(0.234, 2);
  });

  it('6. digester default 0.50 vs override 0.10; override out of range throws', () => {
    const def = estimateManureN2OIndirect({ animal: 'dairy_cattle', region: 'north_america', headcount: 1, system: 'anaerobic_digester', climate: 'wet' });
    expect(def.emissions).toBeCloseTo(0.42035, 3);       // FracGas 0.50, FracLeach 0
    expect(def.breakdown!.leaching).toBe(0);
    const ov = estimateManureN2OIndirect({ animal: 'dairy_cattle', region: 'north_america', headcount: 1, system: 'anaerobic_digester', climate: 'wet', digesterFracGasOverride: 0.10 });
    expect(ov.emissions).toBeCloseTo(0.08407, 3);
    expect(() => estimateManureN2OIndirect({ animal: 'dairy_cattle', region: 'north_america', headcount: 1, system: 'anaerobic_digester', climate: 'wet', digesterFracGasOverride: 0.6 })).toThrow();
  });

  it('7. lagoon WET → FracGas computes, FracLeach 0 → leaching 0 even in wet', () => {
    const e = estimateManureN2OIndirect({ animal: 'dairy_cattle', region: 'north_america', headcount: 1, system: 'uncovered_anaerobic_lagoon', climate: 'wet' });
    expect(e.breakdown!.leaching).toBe(0);
    expect(e.breakdown!.volatilisation).toBeGreaterThan(0);
  });

  it('8. climate omitted → throws; headcount 0 → 0; negative → throws', () => {
    // @ts-expect-error climate is required
    expect(() => estimateManureN2OIndirect({ animal: 'dairy_cattle', region: 'north_america', headcount: 1, system: 'solid_storage' })).toThrow();
    const e0 = estimateManureN2OIndirect({ animal: 'dairy_cattle', region: 'north_america', headcount: 0, system: 'solid_storage', climate: 'wet' });
    expect(e0.emissions).toBe(0);
    expect(() => estimateManureN2OIndirect({ animal: 'dairy_cattle', region: 'north_america', headcount: -1, system: 'solid_storage', climate: 'wet' })).toThrow();
  });
});

describe('estimateSyntheticFertiliserN2O — managed soils, synthetic fertiliser (Ch.11)', () => {
  it('1. urea WET, 1000 kg N → direct 6.864 + vol 0.9009 + leach 1.13256 = 8.89746', () => {
    // CONV = 44/28 × 273 / 1000 ; EF1(wet)=0.016, FracGASF(urea)=0.15, EF4(wet)=0.014, FracLEACH=0.24, EF5=0.011
    const e = estimateSyntheticFertiliserN2O({ nApplied: 1000, climate: 'wet', fertiliserType: 'urea' });
    expect(e.breakdown!.direct!).toBeCloseTo(6.864, 3);
    expect(e.breakdown!.volatilisation).toBeCloseTo(0.9009, 4);
    expect(e.breakdown!.leaching).toBeCloseTo(1.13256, 4);
    expect(e.emissions).toBeCloseTo(8.89746, 4);
    expect(e.gas).toBe('N2O');
    expect(e.dataQuality).toBe('secondary');
    expect(e.factor.value).toBe(0.016); // EF1 wet (synthetic-specific)
    expect(e.factor.source).toContain('Table 11.1');
  });

  it('2. urea DRY, 1000 kg N → EF1 0.005, leaching EXACTLY 0', () => {
    const e = estimateSyntheticFertiliserN2O({ nApplied: 1000, climate: 'dry', fertiliserType: 'urea' });
    expect(e.breakdown!.leaching).toBe(0);       // dry-climate gate
    expect(e.breakdown!.direct!).toBeCloseTo(2.145, 3);        // 1000 × 0.005 × CONV
    expect(e.breakdown!.volatilisation).toBeCloseTo(0.32175, 4); // 1000 × 0.15 × 0.005 × CONV
    expect(e.emissions).toBeCloseTo(2.46675, 4);
    expect(e.factor.value).toBe(0.005);
  });

  it('3. nitrate-based WET, 500 kg N → FracGASF(nitrate) 0.01 (low) → total 4.02831', () => {
    const e = estimateSyntheticFertiliserN2O({ nApplied: 500, climate: 'wet', fertiliserType: 'nitrate' });
    expect(e.emissions).toBeCloseTo(4.02831, 4);
  });

  it('4. unspecified type WET, 1000 kg N → FracGASF default 0.11 → total 8.65722', () => {
    const e = estimateSyntheticFertiliserN2O({ nApplied: 1000, climate: 'wet' });
    expect(e.emissions).toBeCloseTo(8.65722, 4);
  });

  it('5. nApplied 0 → 0 (all components 0), no throw; negative → throws; climate omitted → throws', () => {
    const e0 = estimateSyntheticFertiliserN2O({ nApplied: 0, climate: 'wet', fertiliserType: 'urea' });
    expect(e0.emissions).toBe(0);
    expect(e0.breakdown).toEqual({ direct: 0, volatilisation: 0, leaching: 0 });
    expect(() => estimateSyntheticFertiliserN2O({ nApplied: -1, climate: 'wet' })).toThrow();
    // @ts-expect-error climate is required
    expect(() => estimateSyntheticFertiliserN2O({ nApplied: 1000, fertiliserType: 'urea' })).toThrow();
  });

  it('6. EF1 wet is 0.016 (synthetic-specific), NOT EF4 0.014 — direct = 1000×0.016×CONV = 6.864', () => {
    const e = estimateSyntheticFertiliserN2O({ nApplied: 1000, climate: 'wet', fertiliserType: 'urea' });
    expect(e.breakdown!.direct!).toBeCloseTo(6.864, 3);   // 0.016 path
    expect(e.breakdown!.direct!).not.toBeCloseTo(6.006, 3); // would be the 0.014 (EF4) regression
  });
});

describe('estimateAppliedManureN2O & estimateGrazingDepositionN2O — managed soils', () => {
  // CONV = 44/28 × 273 / 1000 = 0.429
  it('(a1) applied manure WET, 1000 kg N → direct 2.574 + vol 1.26126 + leach 1.13256 = 4.96782', () => {
    const e = estimateAppliedManureN2O({ nApplied: 1000, climate: 'wet' });
    expect(e.breakdown!.direct!).toBeCloseTo(2.574, 3);
    expect(e.breakdown!.volatilisation).toBeCloseTo(1.26126, 4);
    expect(e.breakdown!.leaching).toBeCloseTo(1.13256, 4);
    expect(e.emissions).toBeCloseTo(4.96782, 4);
    expect(e.gas).toBe('N2O');
    expect(e.factor.value).toBe(0.006);       // EF1-other wet
    expect(e.factor.source).toContain('Table 11.1');
  });

  it('(a2) applied manure DRY, 1000 kg N → EF1 0.005, leaching EXACTLY 0, total 2.59545', () => {
    const e = estimateAppliedManureN2O({ nApplied: 1000, climate: 'dry' });
    expect(e.breakdown!.leaching).toBe(0);
    expect(e.emissions).toBeCloseTo(2.59545, 4);
    expect(e.factor.value).toBe(0.005);
  });

  it('(3) grazing dairy NA WET, 100 head → cpp EF3PRP 0.006 → total 69.5383', () => {
    // N_ex 139.9775 ; N_dep 13997.75 ; direct 36.03021 + vol 17.65480 + leach 15.85329
    const e = estimateGrazingDepositionN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 100, climate: 'wet' });
    expect(e.emissions).toBeCloseTo(69.5383, 2);
    expect(e.factor.value).toBe(0.006);       // EF3PRP cpp wet
    expect(e.breakdown!.direct!).toBeCloseTo(36.0302, 2);
  });

  it('(4) grazing sheep developed WET, 1000 head → SO EF3PRP flat 0.003 → total 18.80899', () => {
    // N_ex 5.11 ; N_dep 5110 ; direct = 5110 × 0.003 × 0.429 = 6.57657
    const e = estimateGrazingDepositionN2O({ animal: 'sheep', region: 'developed', headcount: 1000, climate: 'wet' });
    expect(e.breakdown!.direct!).toBeCloseTo(6.57657, 4); // SO flat 0.003
    expect(e.emissions).toBeCloseTo(18.80899, 3);
  });

  it('(5) grazing sheep DRY → SO EF3PRP still 0.003 (no dry variant); leaching 0; vol uses EF4 dry', () => {
    const e = estimateGrazingDepositionN2O({ animal: 'sheep', region: 'developed', headcount: 1000, climate: 'dry' });
    expect(e.factor.value).toBe(0.003);       // flat, NOT a dry-specific value
    expect(e.breakdown!.direct!).toBeCloseTo(6.57657, 4);
    expect(e.breakdown!.leaching).toBe(0);
    expect(e.breakdown!.volatilisation).toBeCloseTo(2.3017995, 5); // 5110 × 0.21 × 0.005 × 0.429
  });

  it('(6) grazing group mapping: camels → SO 0.003; buffalo → CPP 0.006 wet / 0.002 dry', () => {
    const camel = estimateGrazingDepositionN2O({ animal: 'camels', region: 'north_america', headcount: 1, climate: 'wet' });
    expect(camel.factor.value).toBe(0.003);
    const buffWet = estimateGrazingDepositionN2O({ animal: 'buffalo', region: 'western_europe', headcount: 1, climate: 'wet' });
    expect(buffWet.factor.value).toBe(0.006);
    const buffDry = estimateGrazingDepositionN2O({ animal: 'buffalo', region: 'western_europe', headcount: 1, climate: 'dry' });
    expect(buffDry.factor.value).toBe(0.002);
  });

  it('(7) grazing buffalo north_america → THROWS (NA region, reuses manure N-rate NA handling)', () => {
    expect(() => estimateGrazingDepositionN2O({ animal: 'buffalo', region: 'north_america', headcount: 1, climate: 'wet' })).toThrow();
  });

  it('(8) zero → 0; negative → throws; climate omitted → throws (both estimators)', () => {
    expect(estimateAppliedManureN2O({ nApplied: 0, climate: 'wet' }).emissions).toBe(0);
    expect(estimateGrazingDepositionN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 0, climate: 'wet' }).emissions).toBe(0);
    expect(() => estimateAppliedManureN2O({ nApplied: -1, climate: 'wet' })).toThrow();
    expect(() => estimateGrazingDepositionN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: -1, climate: 'wet' })).toThrow();
    // @ts-expect-error climate required
    expect(() => estimateAppliedManureN2O({ nApplied: 1000 })).toThrow();
    // @ts-expect-error climate required
    expect(() => estimateGrazingDepositionN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 1 })).toThrow();
  });

  it('(9) direct-manure pasture redirect now names estimateGrazingDepositionN2O', () => {
    expect(() => estimateManureN2O({ animal: 'dairy_cattle', region: 'north_america', headcount: 1, system: 'pasture_range_paddock' }))
      .toThrow(/estimateGrazingDepositionN2O/);
  });
});

describe('estimateCropResidueN2O — managed soils, crop-residue N (Eq.11.6/11.7)', () => {
  // CONV = 0.429
  it('1. maize WET, yield 8000, area 100, defaults → F_CR 6319.68, total 31.395', () => {
    // Crop_dm 6960 ; AG_DM 6960 ; AGR 696000 ; agN 4176 ; BGR 306240 ; bgN 2143.68 ; F_CR 6319.68
    const e = estimateCropResidueN2O({ crop: 'maize', yieldFresh: 8000, area: 100, climate: 'wet' });
    expect(e.fCrKgN!).toBeCloseTo(6319.68, 2);
    expect(e.breakdown!.direct!).toBeCloseTo(16.26686, 3);
    expect(e.breakdown!.volatilisation).toBeCloseTo(7.97076, 3);
    expect(e.breakdown!.leaching).toBeCloseTo(7.15742, 3);
    expect(e.emissions).toBeCloseTo(31.39503, 3);
    expect(e.gas).toBe('N2O');
    expect(e.factor.value).toBe(0.006); // EF1-other wet
  });

  it('2. maize DRY → EF1 0.005, EF4 dry, leaching EXACTLY 0, total 16.40241', () => {
    const e = estimateCropResidueN2O({ crop: 'maize', yieldFresh: 8000, area: 100, climate: 'dry' });
    expect(e.breakdown!.leaching).toBe(0);
    expect(e.emissions).toBeCloseTo(16.40241, 3);
    expect(e.factor.value).toBe(0.005);
  });

  it('3. rice (nBg null) → BGR-N term 0; F_CR = agN only (2616.6)', () => {
    const e = estimateCropResidueN2O({ crop: 'rice', yieldFresh: 6000, area: 50, climate: 'wet' });
    expect(e.fCrKgN!).toBeCloseTo(2616.6, 1);
  });

  it("4. unknown crop 'quinoa' → generic params (F_CR 8132.8); basis notes generic default", () => {
    const e = estimateCropResidueN2O({ crop: 'quinoa', yieldFresh: 8000, area: 100, climate: 'wet' });
    expect(e.fCrKgN!).toBeCloseTo(8132.8, 1);
    expect(e.basis).toContain('generic crop default');
  });

  it('5. fracRemove 0.5, maize wet → agN halved (2088); F_CR 4231.68', () => {
    const e = estimateCropResidueN2O({ crop: 'maize', yieldFresh: 8000, area: 100, climate: 'wet', fracRemove: 0.5 });
    expect(e.fCrKgN!).toBeCloseTo(4231.68, 2); // agN 2088 + bgN 2143.68
  });

  it('6. fracRemove 0.7 + fracBurnt 0.5 + cf 0.8 → (1−0.7−0.4) < 0 → throws', () => {
    expect(() => estimateCropResidueN2O({ crop: 'maize', yieldFresh: 8000, area: 100, climate: 'wet', fracRemove: 0.7, fracBurnt: 0.5, cf: 0.8 })).toThrow(/exceeds 1/);
  });

  it('7. alfalfa (rAg null) → AG residue 0, agN 0; F_CR = bgN only (5472)', () => {
    const e = estimateCropResidueN2O({ crop: 'alfalfa', yieldFresh: 8000, area: 100, climate: 'wet' });
    expect(e.fCrKgN!).toBeCloseTo(5472, 1); // bgN only
  });

  it('8. yield 0 → 0; area 0 → 0; negative → throws; climate omitted → throws', () => {
    expect(estimateCropResidueN2O({ crop: 'maize', yieldFresh: 0, area: 100, climate: 'wet' }).emissions).toBe(0);
    expect(estimateCropResidueN2O({ crop: 'maize', yieldFresh: 8000, area: 0, climate: 'wet' }).emissions).toBe(0);
    expect(() => estimateCropResidueN2O({ crop: 'maize', yieldFresh: -1, area: 100, climate: 'wet' })).toThrow();
    // @ts-expect-error climate required
    expect(() => estimateCropResidueN2O({ crop: 'maize', yieldFresh: 8000, area: 100 })).toThrow();
  });
});

describe('estimateLUCtoCropland & forestBiomassCarbon — LUC biomass carbon stock change', () => {
  it('1. forestBiomassCarbon tropical_rainforest/americas → 300 × 1.37 × 0.5 = 205.5', () => {
    expect(forestBiomassCarbon('tropical_rainforest', 'americas')).toBeCloseTo(205.5, 4);
  });

  it('2. LUC bBefore 205.5, 100 ha, annual → (205.5−5.0) × 100 × 44/12 = 73516.67 tCO2', () => {
    const e = estimateLUCtoCropland({ bBefore_tCha: 205.5, area_ha: 100, cropType: 'annual' });
    expect(e.emissions).toBeCloseTo(73516.67, 0);
    expect(e.gas).toBe('CO2');
    expect(e.category).toBe('land_use_change'); // NOT land_management
    expect(e.hectares).toBe(100);
    expect(e.carbonStock!.soil).toBeNull();
    expect(e.dataQuality).toBe('secondary');
    expect(e.basis).toContain('SCREENING ESTIMATE');
  });

  it('3. forestBiomassCarbon temperate_oceanic/north_america → 405.9; convert 40 ha → 58798.67', () => {
    expect(forestBiomassCarbon('temperate_oceanic', 'north_america')).toBeCloseTo(405.9, 4);
    const e = estimateLUCtoCropland({ bBefore_tCha: 405.9, area_ha: 40, cropType: 'annual' });
    expect(e.emissions).toBeCloseTo(58798.67, 0);
  });

  it('4. perennial_tropical_wet ΔC_G 10.0: bBefore 205.5, 100 ha → 71683.33', () => {
    const e = estimateLUCtoCropland({ bBefore_tCha: 205.5, area_ha: 100, cropType: 'perennial_tropical_wet' });
    expect(e.emissions).toBeCloseTo(71683.33, 0);
  });

  it('5. grassland origin → biomass term computed (1100) BUT soil-dominated incompleteness flag present', () => {
    const e = estimateLUCtoCropland({ bBefore_tCha: 8, area_ha: 100, cropType: 'annual', originLandType: 'grassland' });
    expect(e.emissions).toBeCloseTo(1100, 4); // netLoss 3.0 × 100 × 44/12
    expect(e.basis).toMatch(/SOIL-dominated/);
    expect(e.basis).toMatch(/materially incomplete/);
  });

  it('6. forestBiomassCarbon omitted range zone (tropical_mountain) → throws "supply bBefore directly"', () => {
    expect(() => forestBiomassCarbon('tropical_mountain', 'africa')).toThrow(/supply bBefore directly/);
  });

  it('7. forestBiomassCarbon tropical_rainforest/europe → throws (no europe value for that zone)', () => {
    expect(() => forestBiomassCarbon('tropical_rainforest', 'europe')).toThrow();
  });

  it('8. area 0 → 0; negative bBefore/area → throws', () => {
    expect(estimateLUCtoCropland({ bBefore_tCha: 205.5, area_ha: 0, cropType: 'annual' }).emissions).toBe(0);
    expect(() => estimateLUCtoCropland({ bBefore_tCha: -1, area_ha: 100, cropType: 'annual' })).toThrow();
    expect(() => estimateLUCtoCropland({ bBefore_tCha: 205.5, area_ha: -1, cropType: 'annual' })).toThrow();
  });

  it('9. CF is 0.5 not 0.47 (locks Table 5.8): rainforest/americas = 205.5, NOT 193.17', () => {
    const v = forestBiomassCarbon('tropical_rainforest', 'americas');
    expect(v).toBeCloseTo(205.5, 4);
    expect(v).not.toBeCloseTo(193.17, 2); // 300 × 1.37 × 0.47 regression
  });
});
