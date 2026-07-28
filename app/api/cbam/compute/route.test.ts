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

// What a table lookup resolves to. `error` is deliberately `unknown`, not `null`: a fixture must be
// able to express a query FAILURE, not only an empty result.
type Fixture = { data: unknown; error: unknown };

// A per-table fixture is either static (the common case) or a function of the filters recorded on
// that query. The function form exists because the route issues TWO queries against
// cbam_default_values in one run — country-specific, then the 'other' fallback — and a filter-blind
// stub answers both identically, making the fallback branch unreachable.
type FixtureEntry = Fixture | ((filters: Record<string, unknown>) => Fixture);

// A chainable, FILTER-AWARE Supabase stub. Terminal single()/maybeSingle() resolve the table's
// fixture; the builder is also thenable so a directly-awaited `.select().eq()` (streams/precursors)
// resolves too. eq() records its (column, value) pair so a function fixture can discriminate on it;
// select/in/order stay no-ops. insert() captures the payload — the whole point of the test — and
// makes single() return the saved row. `overrides` replace defaults per table, so one test can vary
// a single table without disturbing the others.
function makeClient(
  captor: { payload?: Record<string, unknown> },
  overrides: Record<string, FixtureEntry> = {},
) {
  const results: Record<string, FixtureEntry> = {
    cbam_production_processes: { data: PROCESS_ROW, error: null },
    cbam_source_streams: { data: [], error: null },            // no streams → attrEm 0 → aeG 0
    cbam_precursor_inputs: { data: [PRECURSOR_ROW], error: null },
    cbam_installations: { data: { country: 'TR' }, error: null },
    cbam_goods_categories: { data: { annex_ii_direct_only: true }, error: null }, // no indirect leg
    cbam_default_values: { data: { see_direct: 1.4, see_total: 1.4, markup_2026: 1.54, markup_2027: 1.68, markup_2028_plus: 1.82 }, error: null },
    cbam_sefa_params: { data: { cbam_factor: 0.975, cscf: null, cscf_status: 'pending' }, error: null },
    cbam_see_records: { data: null, error: null },
    ...overrides,
  };
  return {
    from(table: string) {
      // Fresh per from() call, NOT per makeClient: the two cbam_default_values queries in one run
      // must not see each other's recorded filters.
      const filters: Record<string, unknown> = {};
      let entry = results[table];
      const resolve = (): Fixture => (typeof entry === 'function' ? entry(filters) : entry);
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => { filters[column] = value; return builder; },
        in: () => builder,
        order: () => builder,
        insert: (payload: Record<string, unknown>) => {
          captor.payload = payload;
          entry = { data: { id: 'see-1', ...payload }, error: null };
          return builder;
        },
        single: () => Promise.resolve(resolve()),
        maybeSingle: () => Promise.resolve(resolve()),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(onF, onR),
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

// runRoute() with no argument behaves exactly as before; overrides vary one table at a time.
async function runRoute(overrides: Record<string, FixtureEntry> = {}): Promise<{ status: number; body: Record<string, unknown>; payload: Record<string, unknown> }> {
  const captor: { payload?: Record<string, unknown> } = {};
  h.client = makeClient(captor, overrides);
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

  // The installation fixture's country is 'TR'; the four branch tests below discriminate on it.
  const OTHER_ROW = { see_direct: 1.4, see_total: 1.4, markup_2026: 1.54, markup_2027: 1.68, markup_2028_plus: 1.82 };

  it('falls back to the country-agnostic default when no country-specific row exists', async () => {
    const { status, payload } = await runRoute({
      cbam_default_values: (filters: Record<string, unknown>) =>
        filters.country === 'other' ? { data: OTHER_ROW, error: null } : { data: null, error: null },
    });
    expect(status).toBe(200);
    const dc = (payload.workings as { defaultComparison: Record<string, unknown> }).defaultComparison;
    expect(dc.countryUsed).toBe('other');
    expect(dc.countrySpecific).toBe(false);
  });

  it('uses the country-specific default when one exists', async () => {
    const TR_ROW = { see_direct: 2.0, see_total: 2.0, markup_2026: 2.2, markup_2027: 2.4, markup_2028_plus: 2.6 };
    const { status, payload } = await runRoute({
      cbam_default_values: (filters: Record<string, unknown>) =>
        filters.country === 'TR' ? { data: TR_ROW, error: null } : { data: OTHER_ROW, error: null },
    });
    expect(status).toBe(200);
    const dc = (payload.workings as { defaultComparison: Record<string, unknown> }).defaultComparison;
    expect(dc.countryUsed).toBe('TR');
    expect(dc.countrySpecific).toBe(true);
    // The country-specific row, not the 'other' fallback — the assertion the filter-blind stub could not make.
    expect(dc.seeDirectDefault).toBe(2.0);
    const exposure = dc.exposure as Record<string, unknown>;
    expect(exposure.markedUpDefault).toBe(2.2);
  });

  it('refuses to compute an exposure delta when the default is not direct-only', async () => {
    const { status, payload } = await runRoute({
      // see_direct !== see_total: the good carries a real indirect leg, so a total-based mark-up is
      // not comparable to a direct SEE.
      cbam_default_values: { data: { see_direct: 1.4, see_total: 1.6, markup_2026: 1.76, markup_2027: 1.92, markup_2028_plus: 2.08 }, error: null },
    });
    expect(status).toBe(200);
    const dc = (payload.workings as { defaultComparison: Record<string, unknown> }).defaultComparison;
    const exposure = dc.exposure as Record<string, unknown>;
    expect(exposure.status).toBe('not_determinable_mixed_basis');
    expect(exposure.markedUpDefault).toBeUndefined();
    // The reasonableness delta is a separate quantity and is unaffected by the mixed basis.
    expect(typeof dc.deltaDirectVsDefault).toBe('number');
  });

  it('omits the comparison block entirely when no default exists for the good', async () => {
    const { status, payload } = await runRoute({
      cbam_default_values: { data: null, error: null },   // no row for any country
    });
    expect(status).toBe(200);
    const workings = payload.workings as Record<string, unknown>;
    // Follows the sefaBenchmark idiom in the route's workings builder: when nothing resolves,
    // NOTHING is recorded — no partial block, and no key a reader could pull a number out of.
    expect('defaultComparison' in workings).toBe(false);
    expect(workings.defaultComparison).toBeUndefined();
    // Two separate storage paths: the workings jsonb (what the verifier reads) and the two
    // columns. Absence must hold on both — a null column and a missing workings key are the
    // same fact recorded twice, and neither may be a zero.
    expect(payload.default_compared).toBeNull();
    expect(payload.delta_vs_default).toBeNull();
  });
});
