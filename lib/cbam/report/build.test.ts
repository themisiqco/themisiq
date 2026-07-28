// lib/cbam/report/build.test.ts
// Pins the §1.2 summary-report builder (build.ts) — Part 1: identity/processes (1)-(3) and the
// plant-characteristic disclosures (7)-(11), plus the shared derived helpers Part 2 reuses.
//
// The load-bearing behaviours: a null answer is a GAP but a `false` answer is a VALUE (a declared
// negative), and the item-(11) conditional gate resolves to three genuinely different shapes
// depending on whether on-site generation is true / false / unanswered.
import { describe, it, expect } from 'vitest';
import {
  buildSummaryReport, buildItem11,
  reducingAgentApplicable, scrapRatio, preConsumerScrapShare,
  type OperatorProfileRow, type InstallationRow, type ProcessRow, type DisclosuresRow,
  type Report12Input, type ChargeMixRow,
} from './build';
import type { PrecursorInput } from '../types';

// ── Complete fixtures — every required field answered. Tests clone and knock out one field. ──────

const OPERATOR = (): OperatorProfileRow => ({
  operator_name: 'Acme Steel Oy',
  registration_no: 'FI12345678',
  address_line1: '1 Mill Road',
  address_line2: null,
  city: 'Raahe',
  postcode: '92100',
  country: 'Finland',
});

const INSTALLATION = (): InstallationRow => ({
  name: 'Raahe Works',
  cbam_registry_id: 'CBAM-FI-0001',
  un_locode: 'FIRAA',
  address_line1: '1 Mill Road',
  address_line2: null,
  city: 'Raahe',
  postcode: '92100',
  country: 'Finland',
  latitude: 64.68,
  longitude: 24.48,
});

const PROCESS = (): ProcessRow => ({ process_id: 'proc-1', route_code: 'eaf_scrap', cn_code: '7208 10 00' });

// All disclosure booleans answered; gate true so the (11) sub-flags are all required and present.
const DISCLOSURES = (): DisclosuresRow => ({
  heat_imported: true,
  heat_exported: false,
  zero_rated_fuels_used: true,
  zero_rated_fuels_demonstration: 'Sustainability certificates on file',
  waste_gases_produced_used: false,
  waste_gases_imported: false,
  waste_gases_exported: false,
  co2_capture_used: false,
  co2_capture_transferred_to: null,
  electricity_produced_onsite: true,
  elec_cogeneration: true,
  elec_separate_generation: false,
  elec_source_fossil: true,
  elec_source_renewable: false,
  elec_exported_from_process: false,
});

const COMPLETE = (): Report12Input => ({
  operator: OPERATOR(),
  installation: INSTALLATION(),
  processes: [PROCESS()],
  disclosures: DISCLOSURES(),
});

describe('buildSummaryReport — completeness', () => {
  it('every required field present → missing is empty', () => {
    const { missing } = buildSummaryReport(COMPLETE());
    expect(missing).toEqual([]);
  });

  // Each required field, knocked out one at a time → exactly one gap with the right §1.2 reference.
  const cases: Array<{ label: string; item: string; mutate: (i: Report12Input) => void }> = [
    { label: '(1)(a) operator name', item: '(1)(a)', mutate: (i) => { i.operator!.operator_name = null; } },
    { label: '(1)(b) registration', item: '(1)(b)', mutate: (i) => { i.operator!.registration_no = null; } },
    { label: '(1)(c) operator address', item: '(1)(c)', mutate: (i) => { i.operator!.city = null; } },
    { label: '(2)(a) installation name', item: '(2)(a)', mutate: (i) => { i.installation!.name = null; } },
    { label: '(2)(b) registry id', item: '(2)(b)', mutate: (i) => { i.installation!.cbam_registry_id = null; } },
    { label: '(2)(c) UN/LOCODE', item: '(2)(c)', mutate: (i) => { i.installation!.un_locode = null; } },
    { label: '(2)(d) installation address', item: '(2)(d)', mutate: (i) => { i.installation!.address_line1 = null; } },
    { label: '(2)(e) coordinates', item: '(2)(e)', mutate: (i) => { i.installation!.latitude = null; } },
    { label: '(3) route', item: '(3)', mutate: (i) => { i.processes[0].route_code = null; } },
    { label: '(3) goods', item: '(3)', mutate: (i) => { i.processes[0].cn_code = null; } },
    { label: '(7) heat imported', item: '(7)', mutate: (i) => { i.disclosures!.heat_imported = null; } },
    { label: '(8) zero-rated used', item: '(8)', mutate: (i) => { i.disclosures!.zero_rated_fuels_used = null; } },
    { label: '(9) waste gases exported', item: '(9)', mutate: (i) => { i.disclosures!.waste_gases_exported = null; } },
    { label: '(10) CO2 capture used', item: '(10)', mutate: (i) => { i.disclosures!.co2_capture_used = null; } },
    { label: '(11)(a) cogeneration', item: '(11)(a)', mutate: (i) => { i.disclosures!.elec_cogeneration = null; } },
  ];
  for (const c of cases) {
    it(`missing ${c.label} → exactly one gap on ${c.item}`, () => {
      const input = COMPLETE();
      c.mutate(input);
      const { missing } = buildSummaryReport(input);
      expect(missing).toHaveLength(1);
      expect(missing[0].item).toBe(c.item);
    });
  }
});

describe('a false disclosure boolean is a value, not missing', () => {
  it('heat_exported = false is reported as a value and raises no gap', () => {
    const input = COMPLETE();
    input.disclosures!.heat_exported = false;
    const { report, missing } = buildSummaryReport(input);
    expect(report.item7_heat.exported).toEqual({ status: 'value', value: false });
    expect(missing).toEqual([]);
  });
});

// The sub-builders now accumulate EVERY requirement evaluation, not only the absences. These two
// helpers read that accumulation the two ways the assertions below need: `gapsOf` is the same
// order-preserving projection buildSummaryReport uses to derive its `missing` array, so an assertion
// on it is an assertion on what a caller actually receives; `stateFor` reaches the new state channel.
const gapsOf = (acc: import('./types').CompletenessItem[]) => acc
  .filter((i) => i.state === 'outstanding')
  .map(({ item, field, hint }) => ({ item, field, hint }));

const stateFor = (acc: import('./types').CompletenessItem[], item: string) =>
  acc.find((i) => i.item === item)?.state;

describe('item (11) gate — three states', () => {
  it('gate TRUE → sub-flags are required (a null sub-flag becomes a gap)', () => {
    const d = DISCLOSURES();
    d.electricity_produced_onsite = true;
    d.elec_separate_generation = null; // knock out one required sub-flag
    const missing: import('./types').CompletenessItem[] = [];
    const item11 = buildItem11(d, missing);
    expect(item11.producedOnsite).toEqual({ status: 'value', value: true });
    expect(item11.cogeneration.status).toBe('value');
    expect(item11.separateGeneration.status).toBe('missing');
    expect(gapsOf(missing)).toEqual([{ item: '(11)(b)', field: expect.any(String), hint: expect.any(String) }]);
    // The accumulator carries the satisfied requirements too — that is the denominator.
    expect(stateFor(missing, '(11)')).toBe('evidenced');
    expect(stateFor(missing, '(11)(b)')).toBe('outstanding');
    for (const item of ['(11)(a)', '(11)(c)', '(11)(d)']) {
      expect(stateFor(missing, item)).toBe('evidenced');
    }
    for (const i of missing) expect(i.responsibility).toBe('operator');
  });

  it('gate FALSE → every sub-flag is not_applicable with a reason, and no gaps', () => {
    const d = DISCLOSURES();
    d.electricity_produced_onsite = false;
    d.elec_cogeneration = null; d.elec_separate_generation = null;
    d.elec_source_fossil = null; d.elec_source_renewable = null; d.elec_exported_from_process = null;
    const missing: import('./types').CompletenessItem[] = [];
    const item11 = buildItem11(d, missing);
    expect(item11.producedOnsite).toEqual({ status: 'value', value: false });
    for (const f of [item11.cogeneration, item11.separateGeneration, item11.sourceFossil, item11.sourceRenewable, item11.exportedFromProcess]) {
      expect(f.status).toBe('not_applicable');
      if (f.status === 'not_applicable') expect(f.reason).toBe('no on-site electricity generation');
    }
    expect(gapsOf(missing)).toEqual([]);
    // A declared FALSE is a satisfied requirement, not an absence — see the boolField
    // comment in build.ts. The old assertion (an empty array) could not express this:
    // nothing was recorded at all, so a satisfied gate and an unasked gate looked identical.
    // The five sub-flags are correctly absent from the accumulator: a closed gate means
    // they were never required, so they must not enter the denominator.
    expect(missing).toHaveLength(1);
    expect(missing[0].item).toBe('(11)');
    expect(missing[0].state).toBe('evidenced');
  });

  it('gate NULL → the gate and all sub-flags are missing (neither branch assumed)', () => {
    const d = DISCLOSURES();
    d.electricity_produced_onsite = null;
    const missing: import('./types').CompletenessItem[] = [];
    const item11 = buildItem11(d, missing);
    expect(item11.producedOnsite.status).toBe('missing');
    for (const f of [item11.cogeneration, item11.separateGeneration, item11.sourceFossil, item11.sourceRenewable, item11.exportedFromProcess]) {
      expect(f.status).toBe('missing');
    }
    // The one actionable gap is the gate itself — sub-flags are undetermined, not asserted required.
    expect(gapsOf(missing)).toEqual([{ item: '(11)', field: expect.any(String), hint: expect.any(String) }]);
    expect(stateFor(missing, '(11)')).toBe('outstanding');
    // An unanswered gate does not yet REQUIRE the sub-flags, so they never enter the accumulator —
    // they are neither supplied nor outstanding, and must not move the denominator either way.
    for (const item of ['(11)(a)', '(11)(b)', '(11)(c)', '(11)(d)']) {
      expect(stateFor(missing, item)).toBeUndefined();
    }
  });
});

describe('gated text sub-fields (8)/(10) follow the same gate', () => {
  it('(8) demonstration is not_applicable when zero-rated fuels are declared unused', () => {
    const input = COMPLETE();
    input.disclosures!.zero_rated_fuels_used = false;
    input.disclosures!.zero_rated_fuels_demonstration = null;
    const { report, missing } = buildSummaryReport(input);
    expect(report.item8_zeroRatedFuels.demonstration.status).toBe('not_applicable');
    expect(missing).toEqual([]);
  });
});

// ── Shared derived helpers ───────────────────────────────────────────────────────────────────────

const precursor = (over: Partial<PrecursorInput>): PrecursorInput => ({
  cnCode: '7204', category: 'scrap', massConsumed: 100, boundary: 'external',
  provenance: 'default', originCountry: 'CN', period: 2026, ...over,
});

describe('reducingAgentApplicable', () => {
  it('false for a scrap-only precursor set (no reducing agent to report)', () => {
    expect(reducingAgentApplicable([precursor({ category: 'scrap' }), precursor({ category: 'ferroalloy' })])).toBe(false);
  });

  it('true when a DRI precursor is present', () => {
    expect(reducingAgentApplicable([precursor({ category: 'scrap' }), precursor({ category: 'dri' })])).toBe(true);
  });

  it('true when a pig-iron precursor is present (any pig_iron variant)', () => {
    expect(reducingAgentApplicable([precursor({ category: 'pig_iron' })])).toBe(true);
    expect(reducingAgentApplicable([precursor({ category: 'pig_iron_bf' })])).toBe(true);
  });
});

describe('scrapRatio', () => {
  const mix: ChargeMixRow[] = [
    { materialType: 'scrap_pre_consumer', mass: 30 },
    { materialType: 'scrap_post_consumer', mass: 50 },
    { materialType: 'dri', mass: 20 },
  ];

  it('sums BOTH scrap types over the activity level', () => {
    // (30 + 50) / 100 = 0.8
    expect(scrapRatio(mix, 100)).toBeCloseTo(0.8, 10);
  });

  it('returns null when activityLevel ≤ 0', () => {
    expect(scrapRatio(mix, 0)).toBeNull();
  });
});

describe('preConsumerScrapShare', () => {
  it('pre / (pre + post)', () => {
    const mix: ChargeMixRow[] = [
      { materialType: 'scrap_pre_consumer', mass: 30 },
      { materialType: 'scrap_post_consumer', mass: 90 },
    ];
    expect(preConsumerScrapShare(mix)).toBeCloseTo(0.25, 10); // 30 / 120
  });

  it('returns null on a zero denominator — an undefined ratio is not a zero share', () => {
    const noScrap: ChargeMixRow[] = [{ materialType: 'dri', mass: 100 }];
    const share = preConsumerScrapShare(noScrap);
    expect(share).toBeNull();
    expect(share).not.toBe(0);
  });
});
