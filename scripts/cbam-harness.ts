// scripts/cbam-harness.ts
// End-to-end sanity harness: DB -> resolver -> engine, using the PRODUCTION anon path.
// Proves the stack before the real compute route exists. Read-only against the live DB.
//
// Run:  npx -y tsx scripts/cbam-harness.ts
//
// Two fixtures:
//   A — scrap-EAF, no precursors. makeResolveContext must construct against the live anon
//       client without error; resolver is never queried (no precursors).
//   B — same process + one EXTERNAL DEFAULT precursor (DRI 7203). makeResolveContext pre-fetches
//       DRI's default from the live cbam_default_values; computeSEE folds it in via Eq 61/62.
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

function show(label: string, r: { see: number; aeG: number; precursorContribution: number; unresolved: unknown[] }) {
  console.log(`\n=== ${label} ===`);
  console.log(`  see                   = ${r.see}`);
  console.log(`  aeG                   = ${r.aeG}`);
  console.log(`  precursorContribution = ${r.precursorContribution}`);
  console.log(`  unresolved            = ${JSON.stringify(r.unresolved)}`);
}

async function main() {
  const attrEm = attributeDirect(streams);
  console.log(`attributeDirect(streams) = ${attrEm}   (expect 218.008)`);

  // Fixture A — no precursors. Resolver constructs against live anon client but is never queried.
  const ctxA = await makeResolveContext(supabase, []);
  const rA = computeSEE(attrEm, AL, [], ctxA);
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
  const rB = computeSEE(attrEm, AL, [precursor], ctxB);
  show('Fixture B (+DRI 7203 external default)  expect m_i 1.1 x 1.325 = 1.4575, see ~3.63758', rB);

  console.log('\nDONE.');
  process.exit(0);
}

main().catch((e) => {
  console.error('\nHARNESS THREW:');
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(1);
});
