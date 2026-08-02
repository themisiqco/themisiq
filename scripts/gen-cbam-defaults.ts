// scripts/gen-cbam-defaults.ts
// Generates public/data/cbam-defaults.json — every cbam_default_values row, as one static
// file a page could fetch without a runtime Supabase read. No build-step hook.
//
// Run:  npx -y tsx scripts/gen-cbam-defaults.ts
//
// THE OUTPUT IS GITIGNORED, AND ITS ABSENCE IS NORMAL. public/data/ is in .gitignore, so a
// fresh clone has no cbam-defaults.json. That is not a missing file — run this script and it
// reappears. Nothing in the app fetches it today.
//
// It was built for a public lookup page (pick a CN code and country, see the published default
// including the mark-up). That page is shelved: the comparison only means something set against
// a customer's OWN computed figure, inside the module, not as a standalone marketing surface.
// The generator is kept because the shape and the assertions below are the expensive part, and
// an in-module comparison would want the same file.
//
// If anything ever DOES fetch it at runtime, the .gitignore entry has to go in the same pass —
// a gitignored file that a page depends on is a 404 on every fresh deploy.
//
// MANUAL, BY DESIGN. This is not wired into `npm run build`. The data changes only when the
// Commission reissues IR 2025/2621 Annex I, so a build-time query would hit the database on
// every deploy to reproduce a file that almost never changes. Run it when the seed changes, or
// whenever a consumer needs the file present.
//
// COPY, NEVER COMPUTE. Two invariants from 20260716_cbam_default_values.sql that this script
// must not violate:
//   • Mark-ups apply to see_TOTAL, not see_direct. This script does not apply them, derive
//     them, or check them against see_total — it copies the three published columns as-is.
//   • see_total is transcribed VERBATIM from the annex. Source rounding means it may not
//     equal see_direct + see_indirect (row '2601 12 00'/'other': 0.617 + 0.070 = 0.687 against
//     a published 0.686). That discrepancy is the source's, and it ships intact. Never
//     reconcile it, never recompute a leg, never round.
// Every numeric passes through exactly as PostgREST returns it.
//
// THE MARK-UP-ON-TOTAL RULE IS CONFIRMED BY THE DATA, not just by the migration comment.
// Checked 2 Aug 2026 against '2601 12 00'/'other', the one row where direct and total differ:
//
//     see_direct 0.617   see_indirect 0.070   see_total 0.686
//     seeded mark-ups:            0.755        0.823        0.892
//     see_total  x 1.1/1.2/1.3:   0.7546→0.755 0.8232→0.823 0.8918→0.892   ✓ all three match
//     see_direct x 1.1/1.2/1.3:   0.679        0.740        0.802          ✗ none appear
//
// So a consumer showing the direct/indirect split alongside a marked-up figure MUST show the
// total too — 0.617 and 0.755 cannot be reconciled without it, and a reader who tries will
// conclude the mark-up is roughly 22%. Every other row has see_direct === see_total, so this
// is the only row where the distinction is observable at all.
//
// No secrets are printed: only the two NEXT_PUBLIC_* vars are read from .env.local, never echoed.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// --- env: parse ONLY the two public keys from .env.local, in-process, without printing them ---
// Same approach as scripts/cbam-harness.ts: a plain tsx script gets no env from Next.
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
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // production anon path, read-only

const OUT = resolve(process.cwd(), 'public/data/cbam-defaults.json');
const TMP = OUT + '.tmp';

// The tuple layout, shipped in the file as `fields` so a positional array stays readable
// without consulting this script. Order here IS the order in every tuple.
const FIELDS = [
  'see_direct',
  'see_indirect',
  'see_total',
  'markup_2026',
  'markup_2027',
  'markup_2028_plus',
  'cbam_bm_route',
] as const;

// EXPECTED SHAPE OF THE SEED — every one of these is asserted, and a mismatch aborts before
// anything is written. They are not guesses: verified against the live table 2 Aug 2026.
const EXPECT_CODES = 224;
const EXPECT_COUNTRIES = 73;   // 72 ISO alpha-2 + the 'other' fallback
const MAX_DECIMALS = 3;

interface Row {
  cn_code: string;
  country: string;
  description: string | null;
  see_direct: number;
  see_indirect: number | null;
  see_total: number;
  markup_2026: number;
  markup_2027: number;
  markup_2028_plus: number;
  cbam_bm_route: string | null;
  source_ref: string;
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  console.error('  Nothing was written. Resolve this before regenerating.\n');
  if (existsSync(TMP)) unlinkSync(TMP);
  process.exit(1);
}

async function main() {
  // ── 1. Fetch every row. PostgREST caps a response at 1000 and .limit() does not raise it,
  //       so page explicitly. Ordered so the output file is byte-stable across runs and a
  //       data change shows up as a readable diff rather than a reshuffle. ──
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('cbam_default_values')
      .select('*')
      .order('cn_code')
      .order('country')
      .range(from, from + 999);
    if (error) fail(`cbam_default_values fetch failed: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }

  // ── 2. Independent row count, straight from the database. Catches a short read — the
  //       failure mode a paging loop has and a single query does not. ──
  const { count, error: countErr } = await supabase
    .from('cbam_default_values')
    .select('*', { count: 'exact', head: true });
  if (countErr) fail(`row count query failed: ${countErr.message}`);
  if (count !== rows.length) {
    fail(`SHORT READ: the table holds ${count} rows but only ${rows.length} were fetched.`);
  }

  // ── 3. source_ref must be uniform — it is hoisted to the top level of the file, so a second
  //       value would silently mislabel every row that carries it. ──
  const refs = [...new Set(rows.map((r) => r.source_ref))];
  if (refs.length !== 1) {
    fail(`source_ref is not uniform — found ${refs.length} values: ${JSON.stringify(refs)}. ` +
         `It cannot be hoisted to the top level; the shape needs a per-row source_ref first.`);
  }
  const sourceRef = refs[0];

  // ── 4. Precision. Values are copied verbatim, so this does not change anything — it detects
  //       a seed whose precision has changed, which would mean the annex was re-transcribed. ──
  const overPrecise = rows.filter((r) =>
    (['see_direct', 'see_indirect', 'see_total', 'markup_2026', 'markup_2027', 'markup_2028_plus'] as const)
      .some((k) => {
        const v = r[k];
        return v !== null && (String(v).split('.')[1] ?? '').length > MAX_DECIMALS;
      }),
  );
  if (overPrecise.length > 0) {
    const s = overPrecise[0];
    fail(`${overPrecise.length} row(s) carry more than ${MAX_DECIMALS} decimal places, ` +
         `e.g. ${s.cn_code}/${s.country}. The seed's precision has changed — confirm against ` +
         `the annex before regenerating. NOTHING has been rounded.`);
  }

  // ── 5. Build the nested shape: cn_code -> country -> tuple. ──
  // Nesting rather than a flat array is a ~5.8x size reduction: it removes 8,052 repetitions
  // of the column names, which is where nearly all the weight sat.
  //
  // `description` is dropped — null in every row, and the table comment records that labels are
  // sourced later from CN nomenclature, not from the 2621 extract. `cbam_bm_route` is kept
  // PER CELL, not per code: it genuinely varies between countries within one code.
  //
  // NO PER-CODE SUMMARY FLAG. Country coverage is a PER-CELL fact and varies enormously —
  // '7208' carries 33 countries, '7203' carries 9, '7202 49' carries 4. A per-code boolean
  // ("does this code have any country-specific rows?") is true for 223 of 224 codes, so it
  // answers nothing a consumer needs. A consumer asks whether ITS country is present:
  //   const cell = values[code]?.[country] ?? values[code]?.other
  // — presence of the key IS the answer, and the fallback is explicit at the point of use.
  const values: Record<string, Record<string, (number | string | null)[]>> = {};
  for (const r of rows) {
    (values[r.cn_code] ??= {})[r.country] = [
      r.see_direct,
      r.see_indirect,
      r.see_total,
      r.markup_2026,
      r.markup_2027,
      r.markup_2028_plus,
      r.cbam_bm_route,
    ];
  }

  // ── 6. Assertions on the assembled shape. Every one aborts before the file is written. ──
  const codes = Object.keys(values);
  if (codes.length !== EXPECT_CODES) {
    fail(`expected ${EXPECT_CODES} distinct cn_codes, found ${codes.length}.`);
  }

  const countries = new Set(rows.map((r) => r.country));
  if (countries.size !== EXPECT_COUNTRIES) {
    fail(`expected ${EXPECT_COUNTRIES} distinct countries, found ${countries.size}.`);
  }

  // §10.17 seed invariant: every seeded good carries an 'other' fallback row. The engine's
  // defaultLookup falls back to it, so a code without one throws at lookup instead of resolving.
  const missingOther = codes.filter((c) => !('other' in values[c]));
  if (missingOther.length > 0) {
    fail(`${missingOther.length} code(s) have no 'other' fallback row: ${missingOther.join(', ')}. ` +
         `This breaks the §10.17 seed invariant the resolver depends on.`);
  }

  // COUNTRY COUNTS PER CODE. Two bounds, not a summary statistic:
  //   • every code carries at least one country and no more than the 73 that exist;
  //   • the per-code counts must sum to the row count — nothing dropped, nothing duplicated.
  // The second is the real check: a key collision in the nested build would silently lose a
  // row, and the top-level rowCount would still read 8,052 because it counts the FETCH, not
  // the assembled object.
  const perCodeCounts = codes.map((c) => Object.keys(values[c]).length);
  const outOfRange = codes.filter((c, i) => perCodeCounts[i] < 1 || perCodeCounts[i] > EXPECT_COUNTRIES);
  if (outOfRange.length > 0) {
    fail(`${outOfRange.length} code(s) carry a country count outside 1..${EXPECT_COUNTRIES}: ` +
         outOfRange.map((c) => `${c} (${Object.keys(values[c]).length})`).join(', '));
  }
  const summed = perCodeCounts.reduce((a, b) => a + b, 0);
  if (summed !== rows.length) {
    fail(`per-code country counts sum to ${summed}, but ${rows.length} rows were fetched. ` +
         `${rows.length - summed} row(s) were lost assembling the nested shape — a duplicate ` +
         `(cn_code, country) pair would do this.`);
  }

  // ── 7. Write to a temp path, then rename. A failed assertion above exits before this, and a
  //       crash mid-write leaves the .tmp rather than a truncated cbam-defaults.json. ──
  const out = {
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    sourceRef,
    fields: FIELDS,
    values,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(TMP, JSON.stringify(out), 'utf8');
  renameSync(TMP, OUT);

  const bytes = Buffer.byteLength(JSON.stringify(out), 'utf8');
  console.log('\n✓ public/data/cbam-defaults.json written');
  console.log(`  rows            ${rows.length}  (matches the table's own count)`);
  console.log(`  cn_codes        ${codes.length}`);
  console.log(`  countries       ${countries.size}  (${countries.size - 1} ISO + 'other')`);
  console.log(`  countries/code  min ${Math.min(...perCodeCounts)}  max ${Math.max(...perCodeCounts)}  ·  sum ${summed} = rowCount`);
  console.log(`  source_ref      ${sourceRef}`);
  console.log(`  size            ${(bytes / 1024).toFixed(0)} KB uncompressed`);
  console.log("  every 'other' fallback present — §10.17 invariant holds\n");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
