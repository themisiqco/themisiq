// lib/cbam/report/build.part2.test.ts
// Pins §1.2 report builder Part 2 — items (4), (5), (6), (12)-(16).
//
// Load-bearing behaviours: the Annex II gate on (4)(c) (direct-only goods report no indirect block);
// a pending SEFA is not_applicable with a CSCF reason and NEVER a reported 0; the (12)/(13) partition
// keys off computeSEE's source discriminant, excluding computed_here from both lists (the regulation's
// Article 4(9) exclusion) and refusing to silently place an eu_zero_rated precursor in either; the
// (14)/(15) Article 14 conditions are detected from the origin data; and an installation-level total
// is never inferred from a single process.
import { describe, it, expect } from 'vitest';
import {
  buildSummaryReport, buildItem4, buildItem5,
  type GoodComputation, type SeeRecordRow, type PrecursorReportInput, type PrecursorOriginRow,
  type Report12Input,
} from './build';
import type { PrecursorInput, PrecursorResolution } from '../types';

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────

const seeRecord = (over: Partial<SeeRecordRow> = {}): SeeRecordRow => ({
  see_direct: 3.4,
  see_indirect: 0.5,
  default_share_direct: 0.4,
  default_share_indirect: 0.3,
  sefa: null,
  sefa_status: null,
  workings: null,
  ...over,
});

const originRow = (over: Partial<PrecursorOriginRow> = {}): PrecursorOriginRow => ({
  operatorName: 'Origin Operator',
  installationName: 'Origin Works A',
  cbamRegistryId: 'CBAM-XX-9',
  reportingPeriod: 2026,
  ...over,
});

const prec = (over: Partial<PrecursorInput> = {}): PrecursorInput => ({
  cnCode: '7201 10 11', category: 'pig_iron', massConsumed: 100, boundary: 'external',
  provenance: 'default', originCountry: 'CN', period: 2026, ...over,
});

const resolution = (source: PrecursorResolution['source'], over: Partial<PrecursorResolution> = {}): PrecursorResolution => ({
  direct: 1.4, indirect: 0, source, ...over,
});

const good = (over: Partial<GoodComputation> = {}): GoodComputation => ({
  processId: 'proc-1', cnCode: '7208 10 00', annexIiDirectOnly: true, activityLevel: 100,
  aeG: 2.0, attrEm: 200, seeRecord: seeRecord(), precursors: [], resolutions: new Map(), ...over,
});

// Build a good whose precursors carry the given sources; resolutions map is keyed by object identity,
// exactly as computeSEE returns it.
function goodWith(specs: Array<{ cnCode: string; source: PrecursorResolution['source']; origin?: PrecursorOriginRow }>): GoodComputation {
  const resolutions = new Map<PrecursorInput, PrecursorResolution>();
  const precursors: PrecursorReportInput[] = specs.map((s) => {
    const p = prec({ cnCode: s.cnCode });
    resolutions.set(p, resolution(s.source));
    return { precursor: p, origin: s.origin ?? originRow() };
  });
  return good({ precursors, resolutions });
}

const inputWith = (goods: GoodComputation[], complete?: boolean): Report12Input => ({
  operator: null, installation: null, processes: [], disclosures: null,
  goods, installationProcessesComplete: complete,
});

// Reach the accumulator's two new channels. `missing` is the derived MissingField[] and carries
// neither, so these read the CompletenessItem accumulation directly — the sub-builder out-parameter
// where one is passed, or completeness.items where the test goes through buildSummaryReport.
const itemFor = (acc: import('./types').CompletenessItem[], item: string) =>
  acc.find((i) => i.item === item);

const respFor = (acc: import('./types').CompletenessItem[], item: string) =>
  acc.find((i) => i.item === item)?.responsibility;

// ── (4)(c) Annex II gate ─────────────────────────────────────────────────────────────────────────

describe('(4)(c) indirect block — Annex II gate', () => {
  it('Annex II good → all four indirect sub-fields are not_applicable with the Annex II reason', () => {
    const missing: import('./types').CompletenessItem[] = [];
    const item4 = buildItem4(good({ annexIiDirectOnly: true }), missing);
    const { actualShare, defaultShare, criteriaConfirmation, specificIndirect } = item4.indirect;
    for (const f of [actualShare, defaultShare, criteriaConfirmation, specificIndirect]) {
      expect(f.status).toBe('not_applicable');
      if (f.status === 'not_applicable') expect(f.reason).toBe('Annex II good — direct emissions only');
    }
    // No (4)(c) criteria gap for an Annex II good — the whole block is N/A.
    expect(missing.filter((m) => m.item === '(4)(c)')).toEqual([]);
  });

  it('non-Annex-II good with non-zero indirect → actual share is a real 0, default share 1 (Article 9 = the factor)', () => {
    const missing: import('./types').CompletenessItem[] = [];
    // Only the grid-default factor path is implemented, so all indirect is default-factor-derived.
    // The shares are NOT derived from default_share_indirect (that field serves (4)(b) only).
    const item4 = buildItem4(good({ annexIiDirectOnly: false, seeRecord: seeRecord({ default_share_indirect: 0.3, see_indirect: 0.5 }) }), missing);
    const ind = item4.indirect;
    // actual share is exactly 0 — asserted as a VALUE, not missing and not N/A.
    expect(ind.actualShare).toEqual({ status: 'value', value: 0 });
    expect(ind.defaultShare).toEqual({ status: 'value', value: 1 });
    expect(ind.specificIndirect).toEqual({ status: 'value', value: 0.5 });
    expect(ind.criteriaConfirmation.status).toBe('missing');
    // The unbuilt criteria confirmation IS surfaced as a gap.
    expect(missing.filter((m) => m.item === '(4)(c)')).toHaveLength(1);
    // (4)(c) has no input field — no operator action clears it, so it must NOT be tagged
    // 'operator' or it would enter the denominator and make the total unreachable.
    expect(respFor(missing, '(4)(c)')).toBe('platform');
  });

  it('non-Annex-II good with ZERO indirect → both shares not_applicable (nothing to apportion)', () => {
    const missing: import('./types').CompletenessItem[] = [];
    const item4 = buildItem4(good({ annexIiDirectOnly: false, seeRecord: seeRecord({ see_indirect: 0 }) }), missing);
    const ind = item4.indirect;
    for (const f of [ind.actualShare, ind.defaultShare]) {
      expect(f.status).toBe('not_applicable');
      if (f.status === 'not_applicable') expect(f.reason).toBe('no indirect emissions to apportion');
    }
    expect(ind.specificIndirect).toEqual({ status: 'value', value: 0 });
  });
});

// ── (4)(e)/(4)(f) SEFA pending ───────────────────────────────────────────────────────────────────

describe('(4)(e) SEFA — pending CSCF', () => {
  it('sefa_status pending → not_applicable with a CSCF reason, never a reported 0', () => {
    const item4 = buildItem4(good({ seeRecord: seeRecord({ sefa: null, sefa_status: 'not_determinable_cscf_pending' }) }), []);
    expect(item4.sefa.status).toBe('not_applicable');
    if (item4.sefa.status === 'not_applicable') expect(item4.sefa.reason).toMatch(/CSCF/);
    // Must NOT be a value of any kind, in particular not 0.
    expect(item4.sefa).not.toHaveProperty('value');
    expect(item4.sefa).not.toEqual({ status: 'value', value: 0 });
    // (4)(f) benchmark confirmation follows the same pending path.
    expect(item4.benchmarkConfirmation.status).toBe('not_applicable');
  });

  it('sefa_status computed → the SEFA value is reported', () => {
    const item4 = buildItem4(good({ seeRecord: seeRecord({ sefa: 0.0429, sefa_status: 'computed' }) }), []);
    expect(item4.sefa).toEqual({ status: 'value', value: 0.0429 });
  });
});

// ── (12)/(13) partition ──────────────────────────────────────────────────────────────────────────

describe('(12)/(13) precursor partition on the source discriminant', () => {
  it('default → (12); verified_actual → (13); computed_here excluded from both; eu_zero_rated in neither + a gap', () => {
    const g = goodWith([
      { cnCode: 'DEF-01', source: 'default' },
      { cnCode: 'FALLBACK-01', source: 'default_fallback' },
      { cnCode: 'ACT-01', source: 'verified_actual' },
      { cnCode: 'COMP-01', source: 'computed_here' },
      { cnCode: 'EUZ-01', source: 'eu_zero_rated' },
    ]);
    const { report, missing, completeness } = buildSummaryReport(inputWith([g]));

    const defaultCns = (report.item12_defaultPrecursors ?? []).map((p) => p.cnCode);
    const actualCns = (report.item13_actualPrecursors ?? []).map((p) => p.cnCode);

    expect(defaultCns.sort()).toEqual(['DEF-01', 'FALLBACK-01']);  // both default sources
    expect(actualCns).toEqual(['ACT-01']);

    // computed_here appears in NEITHER list — the Article 4(9) exclusion.
    expect(defaultCns).not.toContain('COMP-01');
    expect(actualCns).not.toContain('COMP-01');

    // eu_zero_rated appears in neither list...
    expect(defaultCns).not.toContain('EUZ-01');
    expect(actualCns).not.toContain('EUZ-01');
    // ...and is NOT silently dropped — it raises a (12)/(13) classification gap.
    expect(missing.filter((m) => m.item === '(12)/(13)' && m.field.includes('EUZ-01'))).toHaveLength(1);
    // (12)/(13) is REGULATOR, not platform: §1.2 does not state which list an EU/zero-rated
    // precursor belongs in. Building a field would not resolve it.
    expect(respFor(completeness.items, '(12)/(13)')).toBe('regulator');
    expect(respFor(completeness.items, '(12)(b)')).toBe('platform');
  });

  it('(12)(d) carries the resolved default value; (13)(e) indirect is missing per §10.6', () => {
    const g = goodWith([{ cnCode: 'DEF-01', source: 'default' }, { cnCode: 'ACT-01', source: 'verified_actual' }]);
    const { report, missing, completeness } = buildSummaryReport(inputWith([g]));
    expect(report.item12_defaultPrecursors?.[0].defaultValue).toEqual({ status: 'value', value: 1.4 });
    expect(report.item13_actualPrecursors?.[0].specificDirect).toEqual({ status: 'value', value: 1.4 });
    expect(report.item13_actualPrecursors?.[0].specificIndirect.status).toBe('missing');
    expect(missing.filter((m) => m.item === '(13)(e)')).toHaveLength(1);
    expect(respFor(completeness.items, '(13)(e)')).toBe('platform');
    expect(respFor(completeness.items, '(13)(b)')).toBe('platform');
  });
});

// ── (14)/(15) Article 14 conditions ──────────────────────────────────────────────────────────────

describe('(14) multi-period condition', () => {
  it('condition absent (one period per CN code) → not_applicable', () => {
    const g = goodWith([
      { cnCode: 'X', source: 'default', origin: originRow({ reportingPeriod: 2026 }) },
      { cnCode: 'X', source: 'default', origin: originRow({ reportingPeriod: 2026 }) },
    ]);
    const { report } = buildSummaryReport(inputWith([g]));
    expect(report.item14_multiPeriodPrecursor?.status).toBe('not_applicable');
  });

  it('condition present (same CN code, two periods) → missing, Article 14(1) not implemented', () => {
    const g = goodWith([
      { cnCode: 'X', source: 'default', origin: originRow({ reportingPeriod: 2025 }) },
      { cnCode: 'X', source: 'default', origin: originRow({ reportingPeriod: 2026 }) },
    ]);
    const { report, missing, completeness } = buildSummaryReport(inputWith([g]));
    expect(report.item14_multiPeriodPrecursor?.status).toBe('missing');
    expect(missing.filter((m) => m.item === '(14)')).toHaveLength(1);
    expect(respFor(completeness.items, '(14)')).toBe('platform');
  });
});

describe('(15) multi-installation condition', () => {
  it('condition absent (one installation per CN code) → not_applicable', () => {
    const g = goodWith([
      { cnCode: 'Y', source: 'default', origin: originRow({ installationName: 'Works A' }) },
      { cnCode: 'Y', source: 'default', origin: originRow({ installationName: 'Works A' }) },
    ]);
    const { report } = buildSummaryReport(inputWith([g]));
    expect(report.item15_multiInstallationPrecursor?.status).toBe('not_applicable');
  });

  it('condition present (same CN code, two installations) → missing, Article 14 not implemented', () => {
    const g = goodWith([
      { cnCode: 'Y', source: 'default', origin: originRow({ installationName: 'Works A' }) },
      { cnCode: 'Y', source: 'default', origin: originRow({ installationName: 'Works B' }) },
    ]);
    const { report, missing, completeness } = buildSummaryReport(inputWith([g]));
    expect(report.item15_multiInstallationPrecursor?.status).toBe('missing');
    expect(missing.filter((m) => m.item === '(15)')).toHaveLength(1);
    expect(respFor(completeness.items, '(15)')).toBe('platform');
  });
});

// ── (5) installation total ───────────────────────────────────────────────────────────────────────

describe('(5) total direct emissions', () => {
  it('single process, completeness not asserted → installation total is missing (per-process total still reported)', () => {
    const { report, missing } = buildSummaryReport(inputWith([good({ attrEm: 200 })]));
    const item5 = report.item5_totalDirect!;
    expect(item5.perProcess[0].totalDirect).toEqual({ status: 'value', value: 200 }); // process total present
    expect(item5.installationTotal.status).toBe('missing');                            // installation total NOT inferred
    expect(missing.filter((m) => m.item === '(5)')).toHaveLength(1);
  });

  it('completeness asserted → installation total sums the processes', () => {
    const g1 = good({ processId: 'p1', attrEm: 200 });
    const g2 = good({ processId: 'p2', attrEm: 50 });
    const { report } = buildSummaryReport(inputWith([g1, g2], true));
    expect(report.item5_totalDirect!.installationTotal).toEqual({ status: 'value', value: 250 });
  });

  it('buildItem5 prefers attrEm but falls back to aeG × activityLevel', () => {
    const item5 = buildItem5([good({ attrEm: null, aeG: 2.0, activityLevel: 100 })], false, []);
    expect(item5.perProcess[0].totalDirect).toEqual({ status: 'value', value: 200 });
  });
});

// ── the completeness denominator ─────────────────────────────────────────────────────────────────

describe('completeness — the denominator', () => {
  // The denominator counts OPERATOR items only. If a platform or regulator item were ever
  // counted, a diligent customer could supply everything and still never reach the total —
  // exactly what the responsibility dimension exists to prevent. Before this test existed,
  // mis-tagging all four platform sites 'operator' left the whole suite green.
  it('requiredCount excludes platform and regulator items — the finish line must be reachable', () => {
    // DEF-01 raises a platform gap ((12)(b) good-name); EUZ-01 raises a regulator gap ((12)/(13)
    // list classification). The null operator/installation/disclosures rows supply the operator items.
    const g = goodWith([
      { cnCode: 'DEF-01', source: 'default' },
      { cnCode: 'EUZ-01', source: 'eu_zero_rated' },
    ]);
    const { completeness } = buildSummaryReport(inputWith([g]));

    expect(completeness.limitations.length).toBeGreaterThan(0);
    for (const i of completeness.limitations) expect(i.responsibility).not.toBe('operator');
    // Both non-operator responsibilities are represented, so this covers each exclusion path.
    expect(itemFor(completeness.limitations, '(12)(b)')?.responsibility).toBe('platform');
    expect(itemFor(completeness.limitations, '(12)/(13)')?.responsibility).toBe('regulator');

    expect(completeness.requiredCount).toBe(
      completeness.items.filter((i) => i.responsibility === 'operator' && i.state !== 'not_applicable').length,
    );
    expect(completeness.suppliedCount + completeness.outstandingCount).toBe(completeness.requiredCount);
  });
});
