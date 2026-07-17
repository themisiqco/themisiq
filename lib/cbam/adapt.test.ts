// lib/cbam/adapt.test.ts
// Pins the snake_case DB-row -> camelCase engine-type seam (lib/cbam/adapt.ts). A silent mis-map
// here breaks every downstream calc invisibly (wrong number, no error), so each field is asserted
// explicitly. Two contracts are load-bearing and get their own cases:
//   * null nullable-numeric -> undefined, NOT 0. Number(null) === 0, so a naive coercion would
//     turn an absent emission factor into a real zero and corrupt the mass balance silently.
//   * the output stream's NEGATIVE sign must survive adaptation — the mass balance nets in − out
//     through a single sum, so a lost sign flips a subtraction into an addition.
import { describe, it, expect } from 'vitest';
import { adaptSourceStream, adaptPrecursor, SourceStreamRow, PrecursorInputRow } from './adapt';
import { streamEmissions, massBalance } from './engine';
import type { SourceStream } from './types';

describe('adaptSourceStream', () => {
  it('maps a full direct row, and null emission_factor/ncv become undefined (not null, not 0)', () => {
    const row: SourceStreamRow = {
      stream_kind: 'fuel', activity_data: 100, cc_mode: 'direct',
      carbon_content: 0.5, emission_factor: null, ncv: null, biomass_fraction: 0,
    };
    const s = adaptSourceStream(row);

    expect(s.kind).toBe('fuel');
    expect(s.ad).toBe(100);
    expect(s.ccMode).toBe('direct');
    expect(s.cc).toBe(0.5);
    expect(s.bf).toBe(0);

    // The load-bearing null -> undefined contract. Number(null) === 0, so guard against the 0 trap.
    expect(s.ef).toBeUndefined();
    expect(s.ef).not.toBeNull();
    expect(s.ef).not.toBe(0);
    expect(s.ncv).toBeUndefined();
    expect(s.ncv).not.toBe(0);
  });

  it('maps an ef_per_tj row: ef and ncv carry through, cc is undefined', () => {
    const row: SourceStreamRow = {
      stream_kind: 'fuel', activity_data: 50, cc_mode: 'ef_per_tj',
      carbon_content: null, emission_factor: 3.664, ncv: 1, biomass_fraction: 0,
    };
    const s = adaptSourceStream(row);

    expect(s.ccMode).toBe('ef_per_tj');
    expect(s.ef).toBe(3.664);
    expect(s.ncv).toBe(1);
    expect(s.cc).toBeUndefined();
    expect(s.cc).not.toBe(0);
  });

  it('preserves a negative output stream sign through adaptation (and into the calc)', () => {
    const row: SourceStreamRow = {
      stream_kind: 'output', activity_data: -50, cc_mode: 'direct',
      carbon_content: 0.01, emission_factor: null, ncv: null, biomass_fraction: 0,
    };
    const s = adaptSourceStream(row);

    expect(s.kind).toBe('output');
    expect(s.ad).toBe(-50);              // sign survives adaptation
    // ...and survives into the engine: Em = f × AD × CC = 3.664 × -50 × 0.01 = -1.832 (negative).
    expect(streamEmissions(s)).toBeCloseTo(-1.832);
    expect(streamEmissions(s)).toBeLessThan(0);
  });

  it('round-trip: golden fixture A as DB rows -> adapt -> massBalance = 218.008 (engine-compatible)', () => {
    const rows: SourceStreamRow[] = [
      { stream_kind: 'fuel',   activity_data: 100, cc_mode: 'direct', carbon_content: 0.5,  emission_factor: null, ncv: null, biomass_fraction: 0 },
      { stream_kind: 'fuel',   activity_data: 10,  cc_mode: 'direct', carbon_content: 1.0,  emission_factor: null, ncv: null, biomass_fraction: 0 },
      { stream_kind: 'output', activity_data: -50, cc_mode: 'direct', carbon_content: 0.01, emission_factor: null, ncv: null, biomass_fraction: 0 },
    ];
    const adapted = rows.map(adaptSourceStream);

    // Proves the adapter output is engine-compatible, not merely shaped right.
    expect(massBalance(adapted)).toBeCloseTo(218.008);

    // ...and is identical to the equivalent hand-built engine objects (no drift in the mapping).
    const handBuilt: SourceStream[] = [
      { kind: 'fuel',   ccMode: 'direct', ad: 100, cc: 0.5,  bf: 0 },
      { kind: 'fuel',   ccMode: 'direct', ad: 10,  cc: 1.0,  bf: 0 },
      { kind: 'output', ccMode: 'direct', ad: -50, cc: 0.01, bf: 0 },
    ];
    expect(massBalance(adapted)).toBe(massBalance(handBuilt));
  });
});

describe('adaptPrecursor', () => {
  it('maps a full default row, and null see_value/verifier_report_id become undefined', () => {
    const row: PrecursorInputRow = {
      precursor_cn_code: '7203', precursor_category_code: 'dri', mass_consumed: 110,
      boundary: 'external', provenance: 'default', origin_country: 'TR',
      see_value: null, verifier_report_id: null, reporting_period: 2026,
    };
    const p = adaptPrecursor(row);

    expect(p.cnCode).toBe('7203');
    expect(p.category).toBe('dri');
    expect(p.massConsumed).toBe(110);
    expect(p.boundary).toBe('external');
    expect(p.provenance).toBe('default');
    expect(p.originCountry).toBe('TR');
    expect(p.period).toBe(2026);

    expect(p.seeValue).toBeUndefined();
    expect(p.seeValue).not.toBe(0);        // Number(null) === 0 trap again
    expect(p.verifierReportId).toBeUndefined();
    expect(p.verifierReportId).not.toBeNull();
  });

  it('maps an actual_verified row: real see_value and verifier_report_id carry through as values', () => {
    const row: PrecursorInputRow = {
      precursor_cn_code: '7208', precursor_category_code: 'iron_and_steel', mass_consumed: 42,
      boundary: 'external', provenance: 'actual_verified', origin_country: 'IN',
      see_value: 1.87, verifier_report_id: 'VR-2026-001', reporting_period: 2026,
    };
    const p = adaptPrecursor(row);

    expect(p.provenance).toBe('actual_verified');
    expect(p.seeValue).toBe(1.87);
    expect(p.verifierReportId).toBe('VR-2026-001');
  });
});
