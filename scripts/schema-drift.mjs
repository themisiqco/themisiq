#!/usr/bin/env node
// scripts/schema-drift.mjs
// Which tables exist in the live schema dump but have no CREATE TABLE in
// supabase/migrations/ — COMPUTED, not asserted.
//
// Run:  node scripts/schema-drift.mjs
//
// WHY THIS EXISTS. docs/backup-record.md §6 states "Sixteen tables have no
// CREATE TABLE in supabase/migrations/" and names four of them. Six migrations
// (20260908_*_rls_initplan.sql, line 19 of each) repeat that count as fact. No
// file enumerates the set, nothing recomputes it, and the doc records no upkeep
// rule — so the number has no way to stay true. This script replaces the
// assertion with a list.
//
// NO DEPENDENCIES, AND .mjs NOT .ts ON PURPOSE. tsconfig.json includes
// **/*.ts with only node_modules excluded, so a .ts file here would be
// typechecked by `tsc --noEmit` inside `npm run build` — putting a report on
// the build's pass/fail surface. This is a report, not a gate: it exits 0
// always, and it must not be able to fail a deploy.
//
// ⚠️ REGEX, NOT A PARSER, AND THAT IS THE STATED SCOPE. It strips comments and
// matches CREATE TABLE. It does not understand string literals containing '--',
// and it takes no view on columns, constraints or policies — two tables with
// the same name and different shapes both read as "covered". A table's PRESENCE
// in a migration is all this measures. For whether a migration PARSES, use
// scripts/check-sql.py.
//
// ⚠️ THE DUMP IS A SNAPSHOT AND CAN BE STALE. The header prints the dump's
// filename and date for exactly that reason: a drift report computed against a
// three-week-old dump is wrong in a way that looks right. The footer also
// counts tables created by migrations that the dump does not contain, which is
// the direct measure of how far behind the dump has fallen.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DUMP_DIR = join(ROOT, 'db', 'dumps')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const DB_DIR = join(ROOT, 'db')

// ── Comment stripping ────────────────────────────────────────────────────────
// Block comments first, then line comments. Without this, prose in a migration
// header ("...does not create table if...") matches the CREATE TABLE regex and
// injects junk like 'if' and 'anywhere' into the table list. That is not
// hypothetical: it is what a naive grep over this repo actually returns.
//
// ⚠️ SINGLE-QUOTED LITERALS ARE DELIBERATELY NOT STRIPPED, AND THAT WAS TESTED.
// Stripping them looks like the principled fix — the dump does contain the
// STRING 'CREATE TABLE AS' at schema_public_20260819_0800.sql:1817, inside an
// event-trigger function body. But a pg_dump carries apostrophes in function
// bodies and prose that no /'(?:[^']|'')*'/ pass can pair correctly: applied to
// this dump it swallowed a region of the file and SILENTLY LOST four real
// tables (supplier_documents, supplier_responses, user_subscriptions,
// verifier_access). Losing a table from a drift report is worse than inventing
// one — a phantom gets investigated, a missing row reads as "covered".
// The column-list requirement on CREATE_TABLE below handles line 1817 exactly,
// because that literal is followed by a comma and not by '('.
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

// ── CREATE TABLE extraction ──────────────────────────────────────────────────
// Matches:  create table foo | CREATE TABLE public.foo | create table if not
//           exists public."foo" (
// Does NOT match `create temp table` / `create temporary table` / `create
// unlogged table`, because 'table' does not directly follow 'create' there —
// deliberate: a temp table inside a DO block is not schema. 20260908_*_rls_
// initplan.sql each create two of them.
// Non-public schemas are dropped: only public is what either side is claiming.
//
// The trailing \s*\( is REQUIRED, not decoration: it demands a column list, so
// the match must be a real table definition rather than the words "create
// table" appearing in sequence. Together with literal-stripping above it is
// what keeps phantom tables out of the report. The cost is that a
// `CREATE TABLE x PARTITION OF y` or `CREATE TABLE x AS SELECT` would not be
// counted — neither form exists in this repo, and adding one means revisiting
// this line rather than trusting the output.
const CREATE_TABLE = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?\s*\(/gi

function tablesIn(sql) {
  const found = new Set()
  const clean = stripComments(sql)
  for (const m of clean.matchAll(CREATE_TABLE)) {
    const schema = (m[1] || 'public').toLowerCase()
    const table = m[2].toLowerCase()
    if (schema !== 'public') continue
    found.add(table)
  }
  return found
}

function tablesInFiles(dir, filter) {
  const map = new Map() // table -> [files]
  if (!existsSync(dir)) return map
  for (const f of readdirSync(dir).sort()) {
    if (!filter(f)) continue
    const sql = readFileSync(join(dir, f), 'utf8')
    for (const t of tablesIn(sql)) {
      if (!map.has(t)) map.set(t, [])
      map.get(t).push(f)
    }
  }
  return map
}

// ── Pick the newest dump by the date in its filename ─────────────────────────
// schema_public_20260819_0800.sql -> 20260819_0800
// schema_public_20260816.sql      -> 20260816
// Sorting the extracted stamp as a string is correct for zero-padded YYYYMMDD
// with an optional _HHMM suffix, and needs no date library.
function newestDump() {
  if (!existsSync(DUMP_DIR)) return null
  const candidates = readdirSync(DUMP_DIR)
    .filter((f) => /^schema_public_\d{8}(_\d{4})?\.sql$/.test(f))
    .map((f) => ({ file: f, stamp: f.match(/(\d{8}(?:_\d{4})?)/)[1] }))
    .sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0))
  return candidates[0] ?? null
}

function prettyStamp(stamp) {
  const [d, t] = stamp.split('_')
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  return t ? `${iso} ${t.slice(0, 2)}:${t.slice(2, 4)}` : iso
}

function printGroup(title, rows) {
  console.log(`\n${title}  (${rows.length})`)
  console.log('-'.repeat(78))
  if (rows.length === 0) {
    console.log('  (none)')
    return
  }
  for (const r of rows) console.log(`  ${r}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────
const dump = newestDump()

console.log('='.repeat(78))
console.log('SCHEMA DRIFT — tables in the dump with no CREATE TABLE in a migration')
console.log('='.repeat(78))

if (!dump) {
  console.log(`\nNo schema_public_*.sql found in db/dumps/. Nothing to compare against.`)
  console.log(`This is a report, not a gate — exiting 0.`)
  process.exit(0)
}

const dumpPath = join(DUMP_DIR, dump.file)
const dumpTables = tablesIn(readFileSync(dumpPath, 'utf8'))
const migTables = tablesInFiles(MIGRATIONS_DIR, (f) => f.endsWith('.sql'))
// db/*.sql only — db/dumps/ is the dump itself, not a source of truth for DDL.
const dbTables = tablesInFiles(DB_DIR, (f) => f.endsWith('.sql'))

console.log(`\nDump file : db/dumps/${dump.file}`)
console.log(`Dump date : ${prettyStamp(dump.stamp)}   <- if this is old, so is everything below`)
console.log(`Tables in dump           : ${dumpTables.size}`)
console.log(`Tables in migrations     : ${migTables.size}`)
console.log(`Tables in db/*.sql       : ${dbTables.size}`)

const sorted = [...dumpTables].sort()
const missing = sorted.filter((t) => !migTables.has(t) && !dbTables.has(t))
const dbOnly = sorted.filter((t) => !migTables.has(t) && dbTables.has(t))
const covered = sorted.filter((t) => migTables.has(t))

printGroup('MISSING FROM MIGRATIONS — no CREATE TABLE anywhere in the repo', missing)
printGroup('COVERED ONLY IN db/ — created, but not by a migration', dbOnly.map((t) => `${t}  <- ${dbTables.get(t).join(', ')}`))
printGroup('COVERED — CREATE TABLE present in supabase/migrations/', covered)

// ── Staleness, stated rather than left to be noticed ─────────────────────────
// Tables a migration creates that the dump has never seen postdate the dump.
// A non-zero count here means the three groups above describe an older
// database than the one that exists.
const newerThanDump = [...migTables.keys()].filter((t) => !dumpTables.has(t)).sort()
console.log(`\n${'='.repeat(78)}`)
console.log(`SUMMARY`)
console.log(`  missing from migrations : ${missing.length}`)
console.log(`  covered only in db/     : ${dbOnly.length}`)
console.log(`  covered by a migration  : ${covered.length}`)
console.log(`  ---------------------------------------------`)
console.log(`  dump total              : ${dumpTables.size}`)
if (newerThanDump.length > 0) {
  console.log(`\n⚠️  ${newerThanDump.length} table(s) are created by a migration but absent from the dump,`)
  console.log(`   so the dump PREDATES them and the counts above describe an older database:`)
  for (const t of newerThanDump) console.log(`     ${t}`)
  console.log(`   Take a fresh schema dump (docs/backup-record.md §3) and re-run.`)
}
console.log(`\nReport only — exiting 0 regardless of findings.`)
process.exit(0)
