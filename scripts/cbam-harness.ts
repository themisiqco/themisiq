// scripts/cbam-harness.ts
// End-to-end sanity harness: DB -> resolver -> engine, using the PRODUCTION anon path.
// Proves the stack before the real compute route exists. Read-only against the live DB.
//
// Run:  npx -y tsx scripts/cbam-harness.ts
//
// Four fixtures:
//   A — scrap-EAF, no precursors. makeResolveContext must construct against the live anon
//       client without error; resolver is never queried (no precursors).
//   B — same process + one EXTERNAL DEFAULT precursor (DRI 7203). makeResolveContext pre-fetches
//       DRI's default from the live cbam_default_values; computeSEE folds it in via Eq 61/62.
//   C — OWN INDIRECT path: same streams + same DRI precursor, but a NON-Annex-II good with 50 MWh
//       metered Turkish grid power. Direct must be identical to B (increment 2 changed no direct
//       math); indirect = 50 x gridFactor('TR') / AL, plus any inherited DRI indirect.
//   D — INHERITED INDIRECT path: Annex II good (own indirect SUPPRESSED) drawing the same 50 MWh,
//       with a sintered-ore precursor whose see_indirect is non-null. Proves the Annex II gate
//       applies ONLY to ownIndirect and never suppresses a precursor's inherited indirect leg.
//
// No secrets are printed: only the two NEXT_PUBLIC_* vars are read from .env.local, never echoed.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { attributeDirect, computeSEE } from '../lib/cbam/engine';
import { makeResolveContext } from '../lib/cbam/resolver';
import type { SourceStream, PrecursorInput } from '../lib/cbam/types';

// --- env: parse ONLY the two public keys from .env.local, in-process, without printing them ---
function readEnv(name: string): string {
  const file = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of file.split('\n')) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error(`readEnv: ${name} not found in .env.local`);
}

const SUPABASE_URL = readEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // production anon path

// --- golden fixture A streams (mirrors lib/cbam/engine.test.ts FIXTURE_A; DirEm* = 218.008) ---
const streams: SourceStream[] = [
  { kind: 'fuel',   ad: 100, cc: 0.5,  bf: 0, ccMode: 'direct' },
  { kind: 'fuel',   ad: 10,  cc: 1.0,  bf: 0, ccMode: 'direct' },
  { kind: 'output', ad: -50, cc: 0.01, bf: 0, ccMode: 'direct' },
];
const AL = 100;

function show(label: string, r: { direct: number; indirect: number; aeG: number; precursorContribution: number; unresolved: unknown[] }) {
  console.log(`\n=== ${label} ===`);
  console.log(`  direct                = ${r.direct}`);
  console.log(`  indirect              = ${r.indirect}`);
  console.log(`  aeG                   = ${r.aeG}`);
  console.log(`  precursorContribution = ${r.precursorContribution}`);
  console.log(`  unresolved            = ${JSON.stringify(r.unresolved)}`);
}

async function main() {
  const attrEm = attributeDirect(streams);
  console.log(`attributeDirect(streams) = ${attrEm}   (expect 218.008)`);

  // Fixture A — no precursors. Resolver constructs against live anon client but is never queried.
  const ctxA = await makeResolveContext(supabase, []);
  // scrap-EAF crude steel is an Annex II good (own indirect suppressed), no metered electricity here.
  const eafOpts = { annexIiDirectOnly: true, electricityConsumed: null, installationCountry: 'TR' };
  const rA = computeSEE(attrEm, AL, [], ctxA, eafOpts);
  show('Fixture A (scrap-EAF, no precursors)  expect see/aeG ~2.18008, contrib 0, unresolved []', rA);

  // Fixture B — one external DRI default precursor. makeResolveContext pre-fetches 7203 from live.
  const precursor: PrecursorInput = {
    cnCode: '7203',
    category: 'dri',
    massConsumed: 110,
    boundary: 'external',
    provenance: 'default',
    originCountry: 'TR',
    period: 2026,
  };
  const ctxB = await makeResolveContext(supabase, [precursor]);
  const rB = computeSEE(attrEm, AL, [precursor], ctxB, eafOpts);
  show('Fixture B (+DRI 7203 external default)  expect m_i 1.1 x 1.325 = 1.4575, see ~3.63758', rB);

  // --- live reference values these fixtures depend on, printed so the expected numbers are checkable ---
  const { data: dv, error: dvErr } = await supabase
    .from('cbam_default_values')
    .select('cn_code, country, see_direct, see_indirect')
    .in('cn_code', ['7203', '2601 12 00'])
    .in('country', ['TR', 'other']);
  if (dvErr) throw new Error(`default_values probe failed: ${dvErr.message}`);
  console.log('\n--- live cbam_default_values rows in play ---');
  for (const r of dv ?? []) {
    console.log(`  ${r.cn_code} / ${r.country}: see_direct=${r.see_direct}  see_indirect=${r.see_indirect}`);
  }
  const { data: gf, error: gfErr } = await supabase
    .from('cbam_grid_factors')
    .select('country_code, ef_co2e_mwh')
    .in('country_code', ['TR', 'other']);
  if (gfErr) throw new Error(`grid_factors probe failed: ${gfErr.message}`);
  console.log('--- live cbam_grid_factors rows in play ---');
  for (const r of gf ?? []) console.log(`  ${r.country_code}: ef_co2e_mwh=${r.ef_co2e_mwh}`);

  // Fixture C — OWN indirect. Non-Annex-II good (gate open) + 50 MWh Turkish grid power.
  // Direct must match B exactly. ownIndirect = 50 x EF(TR) / 100; plus 1.1 x DRI's see_indirect.
  const cOpts = { annexIiDirectOnly: false, electricityConsumed: 50, installationCountry: 'TR' };
  const ctxC = await makeResolveContext(supabase, [precursor]);
  const rC = computeSEE(attrEm, AL, [precursor], ctxC, cOpts);
  show('Fixture C (non-Annex-II, 50 MWh TR, +DRI 7203)  expect direct ~3.63758, indirect 0.21 + 1.1 x DRI see_indirect', rC);

  // Fixture D — INHERITED indirect. Annex II good: own indirect suppressed despite the same 50 MWh.
  // Sintered ore carries a non-null see_indirect, so indirect = 0 (own) + 1.1 x 0.070 = 0.077.
  const sinteredOre: PrecursorInput = {
    cnCode: '2601 12 00',
    category: 'sintered_ore',
    massConsumed: 110,
    boundary: 'external',
    provenance: 'default',
    originCountry: 'TR',
    period: 2026,
  };
  const dOpts = { annexIiDirectOnly: true, electricityConsumed: 50, installationCountry: 'TR' };
  const ctxD = await makeResolveContext(supabase, [sinteredOre]);
  const rD = computeSEE(attrEm, AL, [sinteredOre], ctxD, dOpts);
  show('Fixture D (Annex II, 50 MWh TR suppressed, +sintered ore)  expect own indirect 0, inherited 1.1 x 0.070 = 0.077', rD);

  console.log('\nDONE.');
  process.exit(0);
}

main().catch((e) => {
  console.error('\nHARNESS THREW:');
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(1);
});
