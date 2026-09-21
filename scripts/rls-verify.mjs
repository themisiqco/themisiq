#!/usr/bin/env node
// ── DID THE RLS SWEEP CHANGE ONLY WHAT IT WAS MEANT TO CHANGE? ───────────────────────────────────
//
// Compares a BEFORE snapshot of pg_policies with an AFTER one and asserts that every difference is
// the one substitution the sweep exists to make:
//
//     auth.uid()   ->   ( SELECT auth.uid() AS uid)
//
// ⚠️ THE POINT IS THE THINGS IT REFUSES TO ACCEPT, NOT THE DIFF. Each of the six migrations verifies
// itself inside its own transaction; this runs afterwards, across all six, from outside the database,
// against snapshots a human exported. It is the check that survives a batch being run twice, run out
// of order, or run by hand in the SQL editor with a line missed.
//
// ⚠️ A DROPPED-AND-NOT-RECREATED POLICY IS THE FAILURE THAT LOOKS LIKE SUCCESS. `drop policy` leaves a
// table either fail-closed (no policy, RLS on) or wide open (RLS off), and neither raises. So the
// count per table is checked, not only that every surviving policy is well formed.
//
// Usage:
//   node scripts/rls-verify.mjs --before rls-before.csv --after rls-after.csv
//   node scripts/rls-verify.mjs --before rls-before-1.md,rls-before-2.md --after rls-after.md
//   ... --expect-unwrapped public=1,storage=0     (the state after all six batches)
//   ... --out-of-scope public.audit_log.audit_select_own
//
// Both formats are accepted on either side: .csv with the header
//   schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
// or the Supabase SQL editor's markdown grid, where <br> is a newline and `null` is SQL NULL.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

// ⚠️ THE SCRIPT EXPANDS `~` ITSELF. The paths arrive comma-separated in one argument, and a shell
// expands only the first: `--before a.md,~/b.md` reaches us with the second one literal.
const resolve = p => p.trim().replace(/^~(?=\/|$)/, homedir())

// ── INPUT ────────────────────────────────────────────────────────────────────────────────────────

const COLS = ['schemaname', 'tablename', 'policyname', 'permissive', 'roles', 'cmd', 'qual', 'with_check']

/** The markdown grid. Every row must hold exactly 8 cells: a predicate containing a pipe (SQL's ||,
 *  a regex alternation) would split into more and silently truncate the policy it belongs to. */
function readMarkdown(path) {
  const rows = []
  const bad = []
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    const s = line.trim()
    if (!s) return
    if (!s.startsWith('|')) { bad.push([i + 1, 'not a table row', s.slice(0, 120)]); return }
    const cells = s.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
    if (cells[0] === 'schemaname') return
    if (cells.every(c => /^-*$/.test(c))) return
    if (cells.length !== 8) { bad.push([i + 1, `${cells.length} cells`, s.slice(0, 160)]); return }
    rows.push(Object.fromEntries(COLS.map((c, n) => {
      const v = cells[n].replace(/<br>/g, '\n')
      return [c, v === 'null' ? '' : v]
    })))
  })
  if (bad.length) {
    console.error(`STOP: ${bad.length} row(s) in ${path} are not 8 cells. Nothing compared.`)
    for (const [n, why, text] of bad.slice(0, 20)) console.error(`  line ${n}: ${why}\n      ${text}`)
    process.exit(2)
  }
  return rows
}

/** RFC 4180 enough for these files: quoted fields, doubled quotes, newlines inside quotes. */
function readCsv(path) {
  const text = readFileSync(path, 'utf8')
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const header = rows.shift()
  if (COLS.some((c, i) => header[i] !== c)) {
    console.error(`STOP: ${path} header is ${header.join(',')}\n      expected ${COLS.join(',')}`)
    process.exit(2)
  }
  return rows.filter(r => r.length === COLS.length || r.length === 1 && r[0] === '')
             .filter(r => r.length === COLS.length)
             .map(r => Object.fromEntries(COLS.map((c, i) => [c, r[i]])))
}

const read = paths => paths.split(',').map(resolve)
  .flatMap(p => (p.endsWith('.md') ? readMarkdown : readCsv)(p))

// ── THE ONE SUBSTITUTION ─────────────────────────────────────────────────────────────────────────

const WRAPPED = /\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\)/gi
const BARE = /auth\.uid\(\)/g
const ws = s => (s || '').replace(/\s+/g, ' ').trim()
/** After-text with the wrap reversed: what it must equal before, once whitespace is collapsed. */
const unwrap = s => ws((s || '').replace(WRAPPED, 'auth.uid()'))
/** Is there a bare auth.uid() left once every wrapped form is removed? */
const isUnwrapped = r => BARE.test(`${r.qual} ${r.with_check}`.replace(WRAPPED, '')) && (BARE.lastIndex = 0, true)
const countBare = s => ((s || '').replace(WRAPPED, '').match(BARE) || []).length

// ── COMPARE ──────────────────────────────────────────────────────────────────────────────────────

const arg = (name, dflt = null) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`)) ??
    (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : null)
  return hit ? hit.replace(`--${name}=`, '') : dflt
}
const beforePath = arg('before'), afterPath = arg('after')
if (!beforePath || !afterPath) { console.error('usage: --before <files> --after <files>'); process.exit(2) }
const outOfScope = new Set((arg('out-of-scope', 'public.audit_log.audit_select_own') || '').split(',').filter(Boolean))
const expect = Object.fromEntries((arg('expect-unwrapped', '') || '').split(',').filter(Boolean)
  .map(p => { const [k, v] = p.split('='); return [k, Number(v)] }))

const key = r => `${r.schemaname}.${r.tablename}.${r.policyname}`
const before = new Map(read(beforePath).map(r => [key(r), r]))
const after = new Map(read(afterPath).map(r => [key(r), r]))
const fail = []
const note = (k, what, a, b) => fail.push({ k, what, before: a, after: b })

let substitutions = 0
const bucket = { swept: 0, alreadyWrapped: 0, noAuthUid: 0, byDesign: [], stillBare: [], dropped: [] }

// 1. Nothing vanished, nothing appeared.
for (const k of before.keys()) if (!after.has(k)) { bucket.dropped.push(k); note(k, 'DROPPED AND NOT RECREATED', '(present)', '(absent)') }
for (const k of after.keys()) if (!before.has(k)) note(k, 'NEW POLICY, not in the before snapshot', '(absent)', '(present)')

// 2. Per-table counts.
const tally = rows => { const m = new Map(); for (const r of rows) { const t = `${r.schemaname}.${r.tablename}`; m.set(t, (m.get(t) || 0) + 1) } return m }
const [tb, ta] = [tally(before.values()), tally(after.values())]
for (const [t, n] of tb) if ((ta.get(t) || 0) !== n) note(t, 'POLICY COUNT CHANGED', String(n), String(ta.get(t) || 0))
for (const [t, n] of ta) if (!tb.has(t)) note(t, 'TABLE GAINED POLICIES', '0', String(n))

// 3. Every surviving policy: structure identical, text identical once the wrap is reversed.
for (const [k, b] of before) {
  const a = after.get(k)
  if (!a) continue
  for (const f of ['roles', 'cmd', 'permissive']) if (ws(b[f]) !== ws(a[f])) note(k, `${f.toUpperCase()} CHANGED`, b[f], a[f])
  for (const f of ['qual', 'with_check']) {
    const hadClause = !!(b[f] || '').trim(), hasClause = !!(a[f] || '').trim()
    if (hadClause !== hasClause) { note(k, `${f} CLAUSE ${hasClause ? 'APPEARED' : 'VANISHED'}`, b[f] || '(null)', a[f] || '(null)'); continue }
    // ⚠️ THE WRAP IS REVERSED ON BOTH SIDES, NOT ONLY ON AFTER. Four public policies were already
    // wrapped before the sweep (concierge_jobs, concierge_job_documents, concierge_proposals,
    // supply_chain_registers); reversing only the after text reports every one of them as a
    // difference. Normalising both says the same thing about the policies the sweep does change,
    // and the direction is caught by the two checks below.
    if (unwrap(a[f]) !== unwrap(b[f])) { note(k, `${f} DIFFERS BEYOND THE WRAP`, ws(b[f]), ws(a[f])); continue }
    const [wb, wa] = [(b[f] || '').match(WRAPPED)?.length ?? 0, (a[f] || '').match(WRAPPED)?.length ?? 0]
    WRAPPED.lastIndex = 0
    if (wa < wb) note(k, `${f} LOST A WRAP THAT WAS ALREADY THERE`, `${wb} wrapped`, `${wa} wrapped`)
  }
  // ── ACCOUNTING ─────────────────────────────────────────────────────────────────────────────────
  // ⚠️ EVERY POLICY LANDS IN EXACTLY ONE BUCKET, AND THE BUCKETS MUST SUM TO THE SNAPSHOT SIZE.
  // An earlier version printed three numbers that did not add up (84 + 135 + 39 against 124 rows),
  // which reads as a defect whether or not one is there: `substitutions` counts occurrences, not
  // policies, and the residue — already-wrapped, no auth.uid() at all, left bare on purpose — was
  // partly uncounted. A total that reconciles is the only way to see that nothing fell through.
  const wasUnwrapped = isUnwrapped(b)
  if (wasUnwrapped && !isUnwrapped(a)) { bucket.swept++; substitutions += countBare(`${b.qual} ${b.with_check}`) }
  else if (wasUnwrapped && isUnwrapped(a)) {
    if (outOfScope.has(k)) bucket.byDesign.push(k)
    else { bucket.stillBare.push(k); note(k, 'STILL CARRIES A BARE auth.uid()', `${countBare(`${b.qual} ${b.with_check}`)} bare`, `${countBare(`${a.qual} ${a.with_check}`)} bare`) }
  } else if (/auth\.uid\(\)/.test(`${b.qual} ${b.with_check}`)) bucket.alreadyWrapped++
  else bucket.noAuthUid++
}

// 4. The counts the sweep is expected to leave behind.
const unwrappedBySchema = rows => { const m = {}; for (const r of rows) if (isUnwrapped(r)) m[r.schemaname] = (m[r.schemaname] || 0) + 1; return m }
const leftover = unwrappedBySchema(after.values())
for (const [schema, n] of Object.entries(expect)) {
  const got = leftover[schema] || 0
  if (got !== n) note(`schema ${schema}`, 'UNWRAPPED COUNT NOT AS EXPECTED', `expected ${n}`, `found ${got}`)
}

// ── REPORT ───────────────────────────────────────────────────────────────────────────────────────

const lines = [
  ['swept (bare auth.uid() wrapped by this run)', bucket.swept, `${substitutions} occurrence(s) substituted`],
  ['already wrapped before the sweep', bucket.alreadyWrapped, ''],
  ['no auth.uid() in either clause', bucket.noAuthUid, ''],
  ['left unwrapped by design', bucket.byDesign.length, bucket.byDesign.join(', ')],
  ['STILL BARE, not by design', bucket.stillBare.length, bucket.stillBare.join(', ')],
  ['DROPPED AND NOT RECREATED', bucket.dropped.length, bucket.dropped.join(', ')],
]
const counted = lines.reduce((n, [, v]) => n + v, 0)
console.log(`before: ${before.size} policies    after: ${after.size} policies`)
for (const [label, n, extra] of lines) console.log(`  ${String(n).padStart(4)}  ${label}${extra ? `  —  ${extra}` : ''}`)
console.log(`  ${String(counted).padStart(4)}  TOTAL, against ${before.size} in the before snapshot` +
  (counted === before.size ? '' : '   ⚠️ THE BUCKETS DO NOT ADD UP'))
if (counted !== before.size) note('accounting', 'BUCKETS DO NOT SUM TO THE BEFORE SNAPSHOT', String(before.size), String(counted))
console.log(`still unwrapped after: ${JSON.stringify(leftover)}`)
if (!fail.length) { console.log('\nPASS: every difference is the wrap, and nothing else moved.'); process.exit(0) }
console.log(`\nFAIL: ${fail.length} problem(s)\n`)
for (const f of fail) {
  console.log(`  ${f.k}\n     ${f.what}\n       before: ${String(f.before).slice(0, 200)}\n       after : ${String(f.after).slice(0, 200)}`)
}
process.exit(1)
