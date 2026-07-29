// lib/cbam/cnMapSeed.test.ts
// Seed-integrity test for cbam_cn_map: every seeded row must be well-formed, and this is the
// place that says WHICH row is not.
//
// WHAT THIS PROTECTS. assessCnCategory (cn.ts) returns 'malformed_reference_row' when a
// cn_prefix fails to normalise, but it cannot name the row: matchCnPrefix throws on the first
// bad prefix it meets, and the assessor deliberately absorbs that throw so a render-time hint
// never crashes the form. Row identity therefore has to live somewhere else — here, at CI
// time, before a user's form ever encounters it. A malformed prefix is a system defect and
// this is the loud channel for it.
//
// WHY IT PARSES MIGRATIONS RATHER THAN QUERYING THE DATABASE. Three reasons, in order:
// the test must run in CI with no credentials and no network; the migrations are the artefact
// under review in a pull request, so catching a bad row there is catching it before it is
// applied; and cbam_cn_map is append-only reference data with no runtime writer, so the files
// ARE the authority for it. That last point is what makes file-parsing legitimate here and
// would NOT make it legitimate for cbam_default_values — see the §10.9(c) note below.
//
// PARSER — spec §10.9 documents three ways a naive read of these files returns a wrong count,
// and all three were hit in practice:
//   (a) a `;` inside a `--` comment terminates the statement for a naive splitter;
//   (b) a `;` inside a single-quoted STRING LITERAL does the same — comment-stripping alone is
//       not sufficient, so the scanner below tracks quote state and only treats `--` as a
//       comment when outside a literal;
//   (c) a tuple count is not a row contribution where a seed ends in `on conflict … do
//       nothing`. It does not bite for cbam_cn_map — the 58 prefixes are disjoint, so nothing
//       is discarded — but the cross-file duplicate check below exists precisely because the
//       aluminium seed carries that clause, and a colliding prefix would be silently dropped.
//
// THE SANITY GATE IS THE POINT. §10.9(a)'s symptom is a parser that returns 11 of 44 rows and
// reports success. A green test over a silently-truncated list is worse than no test, so the
// expected counts are asserted BEFORE any per-row assertion, with a message that says the
// parse is suspect rather than that the data is fine.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeCn } from './cn';

// Resolve from this file, not from cwd: the test must locate the migrations the same way
// whether vitest is invoked from the repo root or from a workspace subdirectory.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = resolve(REPO_ROOT, 'supabase', 'migrations');

const SEEDS = [
  { file: '20260716_cbam_reference.sql', expectedCnMapRows: 44, expectedCategoryRows: 6 },
  { file: '20260727_cbam_aluminium_seed.sql', expectedCnMapRows: 14, expectedCategoryRows: 2 },
] as const;

/**
 * Split SQL into statements, quote-aware and comment-aware — §10.9 (a) and (b).
 *
 * Single pass, tracking whether we are inside a single-quoted literal. `--` starts a comment
 * ONLY outside a literal; `;` terminates a statement ONLY outside a literal. Doubled quotes
 * ('') are the SQL escape for a literal apostrophe and do not close the string.
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inString = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") { cur += "''"; i += 2; continue; }  // escaped quote
        inString = false;
      }
      cur += ch; i++; continue;
    }
    if (ch === "'") { inString = true; cur += ch; i++; continue; }
    if (ch === '-' && sql[i + 1] === '-') {                          // comment to end of line
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === ';') { out.push(cur); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

/** First two quoted literals of each VALUES tuple in every insert into `table`. */
function parseTuples(sql: string, table: string): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const stmt of splitStatements(sql)) {
    if (!stmt.includes(`insert into public.${table}`)) continue;
    const rx = /\(\s*'([^']*)'\s*,\s*'([^']*)'/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(stmt)) !== null) rows.push([m[1], m[2]]);
  }
  return rows;
}

interface SeededPrefix { cn_prefix: string; category_code: string; file: string }

const cnMapRows: SeededPrefix[] = [];
const categoryCodes = new Set<string>();
const perFileCnMap = new Map<string, SeededPrefix[]>();
const perFileCategoryCount = new Map<string, number>();

for (const seed of SEEDS) {
  const sql = readFileSync(resolve(MIGRATIONS, seed.file), 'utf8');
  const map = parseTuples(sql, 'cbam_cn_map').map(([cn_prefix, category_code]) => ({
    cn_prefix, category_code, file: seed.file,
  }));
  perFileCnMap.set(seed.file, map);
  cnMapRows.push(...map);

  const cats = parseTuples(sql, 'cbam_goods_categories');
  perFileCategoryCount.set(seed.file, cats.length);
  for (const [code] of cats) categoryCodes.add(code);
}

describe('cbam_cn_map seed — parse sanity gate (§10.9)', () => {
  // MUST come first. §10.9(a)'s symptom is a parser that captures 11 of 44 rows and reports
  // success; every per-row assertion below would then pass over a truncated list and prove
  // nothing. If these fail, distrust the parser before distrusting the data.
  for (const seed of SEEDS) {
    it(`${seed.file} yields exactly ${seed.expectedCnMapRows} cbam_cn_map rows`, () => {
      const got = perFileCnMap.get(seed.file)!.length;
      expect(
        got,
        `PARSE SUSPECT: expected ${seed.expectedCnMapRows} cbam_cn_map rows in ${seed.file} but read ${got}. ` +
          `Do not treat the per-row assertions in this file as meaningful until this is resolved — ` +
          `a short read passes them vacuously (spec §10.9(a)). Check the statement splitter against ` +
          `semicolons inside comments and inside string literals before changing the expected count.`,
      ).toBe(seed.expectedCnMapRows);
    });

    it(`${seed.file} yields exactly ${seed.expectedCategoryRows} cbam_goods_categories rows`, () => {
      const got = perFileCategoryCount.get(seed.file)!;
      expect(
        got,
        `PARSE SUSPECT: expected ${seed.expectedCategoryRows} cbam_goods_categories rows in ${seed.file} but read ${got}. ` +
          `The category-existence check below is only as good as this parse.`,
      ).toBe(seed.expectedCategoryRows);
    });
  }

  it('the two seeds together yield 58 cbam_cn_map rows and 8 categories', () => {
    expect(cnMapRows.length, `PARSE SUSPECT: expected 58 cbam_cn_map rows across both seeds, read ${cnMapRows.length}`).toBe(58);
    expect(categoryCodes.size, `PARSE SUSPECT: expected 8 distinct category codes across both seeds, read ${categoryCodes.size}`).toBe(8);
  });
});

describe('cbam_cn_map seed — every row is well-formed', () => {
  it('every cn_prefix survives normalizeCn', () => {
    // Asserted through normalizeCn itself, not a look-alike regex: this is the exact function
    // matchCnPrefix calls, so a prefix that passes here cannot make assessCnCategory return
    // 'malformed_reference_row'. A regex that merely resembles it could drift from it.
    const failures: string[] = [];
    for (const row of cnMapRows) {
      try {
        normalizeCn(row.cn_prefix);
      } catch (e) {
        failures.push(`"${row.cn_prefix}" (${row.file}, category ${row.category_code}): ${(e as Error).message}`);
      }
    }
    expect(failures, `cn_prefix values that do not normalise:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('every cn_prefix is non-empty after normalisation', () => {
    const empty = cnMapRows
      .filter((r) => r.cn_prefix.replace(/\s+/g, '') === '')
      .map((r) => `${r.file} (category ${r.category_code})`);
    expect(empty, `cn_prefix values that are empty after normalisation:\n  ${empty.join('\n  ')}`).toEqual([]);
  });

  it('cn_prefix is unique WITHIN each seed file', () => {
    for (const seed of SEEDS) {
      const rows = perFileCnMap.get(seed.file)!;
      const seen = new Map<string, number>();
      for (const r of rows) seen.set(r.cn_prefix, (seen.get(r.cn_prefix) ?? 0) + 1);
      const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([p, n]) => `"${p}" ×${n}`);
      expect(dupes, `duplicate cn_prefix within ${seed.file}: ${dupes.join(', ')}`).toEqual([]);
    }
  });

  it('no cn_prefix is declared in BOTH seeds — a cross-file collision is silently discarded', () => {
    // The aluminium seed ends `on conflict (cn_prefix) do nothing`, so a prefix already seeded
    // on 16 Jul would be dropped without error and the aluminium category_code would never
    // take effect. Not strictly invalid — but silent, and therefore worth failing on.
    const [a, b] = SEEDS.map((s) => perFileCnMap.get(s.file)!);
    const firstFile = new Set(a.map((r) => r.cn_prefix));
    const overlap = b
      .filter((r) => firstFile.has(r.cn_prefix))
      .map((r) => `"${r.cn_prefix}" (${SEEDS[0].file} → ${a.find((x) => x.cn_prefix === r.cn_prefix)!.category_code}, ${r.file} → ${r.category_code}; the second is discarded on conflict)`);
    expect(overlap, `cn_prefix declared in both seeds:\n  ${overlap.join('\n  ')}`).toEqual([]);
  });

  it('every category_code exists in cbam_goods_categories', () => {
    // The FK cbam_cn_map.category_code -> cbam_goods_categories(code) enforces this in the
    // database. Asserting it here catches a bad row in review, before the migration is applied
    // and before the FK has anything to reject.
    const orphans = cnMapRows
      .filter((r) => !categoryCodes.has(r.category_code))
      .map((r) => `"${r.cn_prefix}" → "${r.category_code}" (${r.file})`);
    expect(
      orphans,
      `cn_prefix rows whose category_code is not seeded in cbam_goods_categories:\n  ${orphans.join('\n  ')}\n` +
        `known categories: ${[...categoryCodes].sort().join(', ')}`,
    ).toEqual([]);
  });
});
