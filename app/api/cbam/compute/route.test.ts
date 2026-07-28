// app/api/cbam/compute/route.test.ts
// Pins the default-value share wiring in the CBAM compute route: computeDefaultShare is called with
// computeSEE's OWN resolutions map, and its two legs are persisted onto the cbam_see_records insert.
//
// The two behaviours protected here:
//   • a computed share reaches the insert payload (default_share_direct), and
//   • a zero-denominator leg passes through as null — NEVER coerced to 0 (default_share_indirect).
//
// Supabase and the ResolveContext are mocked so this exercises the real route/engine/defaultShare
// composition without a database. The engine math is genuine: with attrEm 0 (no streams) and one
// default precursor, the direct leg is entirely the precursor's defaulted contribution → share 1.0,
// while the Annex II good has no indirect leg → indirect denominator 0 → share null.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mutable holders the mocked modules read at call time (vi.mock is hoisted above imports).
const h = vi.hoisted(() => ({
  client: null as unknown,
  ctx: null as unknown,
}));

vi.mock('../../../../lib/supabaseAuthed', () => ({
  getAuthedClient: async () => ({ supabase: h.client, userId: 'u', email: undefined }),
  bearerFrom: () => 'tok',
  AuthError: class AuthError extends Error {},
}));

// makeResolveContext is mocked so the resolver never touches Supabase; computeSEE still resolves each
// precursor through this ctx exactly as in production.
vi.mock('../../../../lib/cbam/resolver', () => ({
  makeResolveContext: async () => h.ctx,
}));

import { POST } from './route';

const PROCESS_ROW = {
  id: 'proc-1',
  company_id: 'co-1',
  cn_code: '7208 10 00',
  category_code: 'cat',
  activity_level: 100,
  reporting_period: 2026,
  installation_id: 'inst',
  electricity_consumed: null,
  steel_grade: null,
  route_code: null,
};

const PRECURSOR_ROW = {
  precursor_cn_code: '7201 10 11',
  precursor_category_code: 'pig_iron',
  mass_consumed: 100,
  boundary: 'external',
  provenance: 'default',
  origin_country: 'CN',
  see_value: null,
  verifier_report_id: null,
  reporting_period: 2026,
};

// A default-resolving ResolveContext: SEE_i,direct = 1.4, indirect = 0 (an Annex II precursor).
const CTX = {
  isEuOrExempted: () => false,
  defaultLookup: () => ({ direct: 1.4, indirect: 0 }),
  gridFactor: () => 0,
  hasValidVerifierReport: () => false,
  computeChildSEE: () => { throw new Error('not in test'); },
};

// A chainable Supabase stub. Terminal single()/maybeSingle() resolve the table's result; the builder
// is also thenable so a directly-awaited `.select().eq()` (streams/precursors) resolves too. insert()
// captures the payload — the whole point of the test — and makes single() return the saved row.
function makeClient(captor: { payload?: Record<string, unknown> }) {
  const results: Record<string, { data: unknown; error: null }> = {
    cbam_production_processes: { data: PROCESS_ROW, error: null },
    cbam_source_streams: { data: [], error: null },            // no streams → attrEm 0 → aeG 0
    cbam_precursor_inputs: { data: [PRECURSOR_ROW], error: null },
    cbam_installations: { data: { country: 'TR' }, error: null },
    cbam_goods_categories: { data: { annex_ii_direct_only: true }, error: null }, // no indirect leg
    cbam_default_values: { data: { see_direct: 1.4, see_total: 1.4, markup_2026: 1.54, markup_2027: 1.68, markup_2028_plus: 1.82 }, error: null },
    cbam_sefa_params: { data: { cbam_factor: 0.975, cscf: null, cscf_status: 'pending' }, error: null },
    cbam_see_records: { data: null, error: null },
  };
  return {
    from(table: string) {
      let result = results[table];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        insert: (payload: Record<string, unknown>) => {
          captor.payload = payload;
          result = { data: { id: 'see-1', ...payload }, error: null };
          return builder;
        },
        single: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(onF, onR),
      };
      return builder;
    },
  };
}

function fakeReq() {
  return {
    headers: { get: () => 'Bearer tok' },
    json: async () => ({ process_id: 'proc-1' }),
  } as unknown as Request;
}

async function runRoute(): Promise<{ status: number; body: Record<string, unknown>; payload: Record<string, unknown> }> {
  const captor: { payload?: Record<string, unknown> } = {};
  h.client = makeClient(captor);
  h.ctx = CTX;
  const res = await POST(fakeReq() as never);
  const body = await res.json();
  return { status: res.status, body, payload: captor.payload ?? {} };
}

describe('CBAM compute route — default-value share persistence', () => {
  beforeEach(() => {
    h.client = null;
    h.ctx = null;
  });

  it('persists the computed direct share onto the see_record insert', async () => {
    const { status, payload } = await runRoute();
    expect(status).toBe(200);
    // attrEm 0 → aeG 0; one default precursor m_i 1 × 1.4 → direct 1.4, all of it defaulted → share 1.0.
    expect(payload.default_share_direct).toBeCloseTo(1.0, 10);
    expect(payload.default_share_direct).not.toBeNull();
  });

  it('passes a zero-denominator (indirect) leg through as null, never 0', async () => {
    const { status, payload } = await runRoute();
    expect(status).toBe(200);
    // Annex II good: no indirect leg → indirect denominator 0 → share is UNDEFINED, persisted as null.
    expect(payload.default_share_indirect).toBeNull();
    expect(payload.default_share_indirect).not.toBe(0);
  });

  it('records the default comparison and a computed exposure delta in workings', async () => {
    const { status, payload } = await runRoute();
    expect(status).toBe(200);
    // STUB LIMITATION: the stub returns one fixed result per table and ignores .eq() filters, so the
    // country-specific query always resolves and countryUsed reflects the fixture's installation
    // country rather than a real per-country lookup. The block's SHAPE is what this test protects,
    // not the country resolution.
    const workings = payload.workings as { defaultComparison?: Record<string, unknown> };
    const dc = workings.defaultComparison as Record<string, unknown>;
    expect(dc).toBeDefined();
    expect(dc.source).toBe('IR 2025/2621 Annex I');
    expect(typeof dc.countryUsed).toBe('string');
    expect((dc.countryUsed as string).length).toBeGreaterThan(0);
    expect(typeof dc.deltaDirectVsDefault).toBe('number');
    const exposure = dc.exposure as Record<string, unknown>;
    expect(exposure.status).toBe('computed');
    // PROCESS_ROW.reporting_period is 2026, so markup_2026 (1.54) is the marked-up basis.
    expect(exposure.basisYear).toBe(2026);
    expect(exposure.markedUpDefault).toBe(1.54);
  });
});
