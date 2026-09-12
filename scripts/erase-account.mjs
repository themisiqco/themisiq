#!/usr/bin/env node
// scripts/erase-account.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Erase ONE customer account on request: the Postgres rows, the Storage objects,
// the auth user. Dry run is the default and nothing destructive happens without
// BOTH --execute and a --confirm email that matches auth.users.
//
//   node scripts/erase-account.mjs --user <uuid>
//   node scripts/erase-account.mjs --user <uuid> --export ./out
//   node scripts/erase-account.mjs --user <uuid> --execute --confirm a@b.com \
//        --requested-at 2026-09-08 --performed-by "Lisa Foster"
//
// ── WHAT THIS DOES NOT COVER ─────────────────────────────────────────────────
// Erasure here means the ThemisIQ database, the two Storage buckets and the auth
// user. It does not and cannot reach:
//
//   • Stripe — customer, subscription, invoices, payment method. Retained ~7
//     years for financial-record obligations. Deletion there is partial by law.
//   • Resend — every transactional email ever sent to this account remains in
//     Resend's message log with its recipient and body.
//   • The /assess lead emails — app/api/assessment/submit/route.ts writes to NO
//     table at all; the lead's name, company, role and answers exist only in
//     Resend and in the RESEND_MONITOR_EMAIL inbox. A customer who arrived that
//     way has data this script cannot see.
//   • Vercel request logs.
//   • Anthropic — document text and questions sent by the concierge extractor
//     and the GHG bot. No retention control exists in this repo.
//   • Database backups — pg_dump files under ~/themisiq-backups and any
//     Supabase PITR window still contain every row deleted here.
//
// Tell the customer what was erased, not that "everything" was. The list above
// is the honest remainder.
//
// ── DESIGN NOTES THAT ARE LOAD-BEARING ───────────────────────────────────────
// (1) NOTHING IS HARD-CODED THAT CAN BE READ. The FK graph, the delete rules and
//     the cascade closure come from pg_catalog at run time. A table added next
//     month appears in the plan on its own; a hand-maintained list would not.
//     The only hard-coded sets are the explicit roots (tables the account owns
//     through a column with NO FK to auth.users, which no catalogue query can
//     infer) and the never-touch list.
//
// (2) EVERY TABLE IS DELETED EXPLICITLY, CHILDREN FIRST — cascade is not relied
//     on. Four ON DELETE RESTRICT edges inside the materiality module would
//     otherwise abort the whole erasure from inside a cascade, where the error
//     names a constraint rather than a plan:
//         materiality_assessment_survey_rounds  -> materiality_survey_rounds
//         materiality_impact_assignment_subtopics -> materiality_survey_rounds
//         materiality_impact_determinations     -> materiality_impact_assignments
//         materiality_survey_responses          -> materiality_survey_questions
//     A topological delete over the closure removes the class, not the four.
//
// (3) DELETING AUDITED ROWS WRITES THE DELETED ROWS BACK INTO audit_log.
//     log_audit()'s DELETE branch inserts to_jsonb(old). Erasing ghg_entries
//     therefore RE-CREATES the customer's data one table over. The id sets are
//     captured BEFORE any delete, and audit_log is swept LAST, after the rows
//     the deletes themselves wrote. Get this order wrong and the script looks
//     like it worked.
//
// (4) THE DRY RUN AND THE EXECUTE ARE THE SAME CODE PATH. The dry run opens a
//     transaction, builds the same temp tables, counts, and ROLLS BACK. A dry
//     run that exercised a different path would be a rehearsal of the wrong play.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const FAIL = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1) }

// ── 0. THE pg DEPENDENCY ─────────────────────────────────────────────────────
// Checked first and refused loudly. `pg` is a devDependency (added 10 Sep 2026);
// the check stays because this script is run from a clone as often as from a
// working tree. There is deliberately no fallback to the PostgREST client for
// the deletes: PostgREST cannot hold one transaction across twenty statements,
// and a partial erasure is the one outcome this script must not be able to
// produce.
let pg
try {
  pg = (await import('pg')).default
} catch {
  console.error(`
✗ The 'pg' package is not installed, so this script cannot run.

  Install it first:

      npm install --save-dev pg

  Nothing was read and nothing was changed.
`)
  process.exit(2)
}

// ── 1. ENVIRONMENT ───────────────────────────────────────────────────────────
// A plain node script does not get Next.js's .env.local loading, so this parses
// it. Values already in the real environment win, so an operator can override
// without editing the file.
function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}
loadEnvLocal()

// DBURL is NOT in .env.local and is not read by the app. It is the shell variable
// from docs/backup-record.md — export it in the same terminal before running:
//     export DBURL='postgresql://...'
const DBURL = process.env.DBURL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── 2. ARGUMENTS ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { user: null, export: null, execute: false, confirm: null, requestedAt: null, performedBy: null }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    const next = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) FAIL(`${t} needs a value.`); return v }
    switch (t) {
      case '--user':         a.user = next(); break
      case '--export':       a.export = next(); break
      case '--execute':      a.execute = true; break
      case '--confirm':      a.confirm = next(); break
      case '--requested-at': a.requestedAt = next(); break
      case '--performed-by': a.performedBy = next(); break
      case '--help': case '-h':
        console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 20).join('\n'))
        process.exit(0)
      default: FAIL(`Unknown argument: ${t}`)
    }
  }
  return a
}
const args = parseArgs(process.argv.slice(2))

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!args.user) FAIL('--user <uuid> is required.')
if (!UUID_RE.test(args.user)) FAIL(`--user is not a uuid: ${args.user}`)
if (args.execute && !args.confirm) FAIL('--execute requires --confirm <email>. Refusing.')
// The erasure_log row is the only thing that survives the erasure, and a record
// that cannot say WHEN it was asked for or WHO ran it does not evidence much.
// Both are free text and neither is validated — the point is that an operator
// cannot omit them by accident.
if (args.execute && !args.requestedAt) FAIL('--execute requires --requested-at <date> — the erasure record must say when the customer asked. Refusing.')
if (args.execute && !args.performedBy) FAIL('--execute requires --performed-by <name> — the erasure record must say who ran it. Refusing.')
if (args.execute && args.export) FAIL('--export and --execute are separate runs. Export first, check it, then execute.')
if (!DBURL) FAIL("DBURL is not set. Export the connection string first (see docs/backup-record.md §… 'export DBURL=…'), then re-run.")

const MODE = args.execute ? 'EXECUTE' : args.export ? 'EXPORT' : 'DRY RUN'
const UID = args.user

// ── 3. THE THREE HAND-MAINTAINED SETS ────────────────────────────────────────
// EXPLICIT ROOTS — tables the account owns through a column that pg_catalog
// cannot connect to auth.users, because there is no FK. Every one of these is a
// place where deleting the auth user leaves the rows behind, silently.
//   materiality_assessments  user_id, no FK (only organizations/mr_* FKs)
//   verifier_access          customer_user_id, no FK
//   cbam_verifier_access     customer_user_id, no FK
//   cbam_source_documents    user_id FK is NO ACTION — it BLOCKS the auth delete
//   scope3_inventories       same
//   ghg_inventories          same, and the column is NULLABLE
//   rate_limits              keyed by email only; no id anywhere
const ROOT_PREDICATE = {
  'auth.users':                     (a) => `${a}.id = $1::uuid`,
  'public.materiality_assessments': (a) => `${a}.user_id = $1::uuid`,
  'public.verifier_access':         (a) => `${a}.customer_user_id = $1::uuid`,
  'public.cbam_verifier_access':    (a) => `${a}.customer_user_id = $1::uuid`,
  'public.cbam_source_documents':   (a) => `${a}.user_id = $1::uuid`,
  'public.scope3_inventories':      (a) => `${a}.user_id = $1::uuid`,
  'public.ghg_inventories':         (a) => `${a}.user_id = $1::uuid`,
  // ⚠️ THE `$1::uuid is not null` CLAUSE IS NOT DEAD CODE. Every other predicate
  // binds $1; this one keys on email alone. A statement that never references $1
  // makes Postgres refuse the bind with 42P18 (indeterminate parameter type) —
  // the parameter is supplied but never typed. Naming it in a clause that is
  // always true for a real uuid types it without changing the result.
  'public.rate_limits':             (a) => `$1::uuid is not null and $2::text is not null and ${a}.email = $2::text`,
}

// NEVER TOUCH. Reference data shared by every account, plus organizations —
// which has NO owner column at all, is referenced by two tables with ON DELETE
// CASCADE, and therefore cannot be attributed to one account or deleted without
// reaching into another's. If one of these ever turns up inside the computed
// closure, that is a schema change and the script stops rather than guessing.
//
// ⚠️ EXACT NAMES, NEVER A PREFIX. This list was `public.mr_`, `public.cbam_cn_`
// and seven other prefixes until 11 Sep 2026. A prefix silently adopts tables
// nobody has looked at: `public.mr_` would have classified a future
// `mr_customer_notes` as reference data and excluded it from the erasure, and
// nothing would have reported it — the classification gate would have said PASS,
// because the table WAS classified. That is the worst failure this script can
// have, and a prefix is how it arrives.
//
// With exact names, a new table is UNCLASSIFIED until someone writes it down
// here or gives it a root, and the gate stops. Adding a name is a deliberate act
// that says "I have read this table and it holds no customer data". Adding a
// prefix says that about tables that do not exist yet.
//
// The 29 names below are exactly what the retired prefixes matched in
// db/dumps/schema_public_20260819_0800.sql, verified 11 Sep 2026.
// ghg_conversation_starters is the 30th: CLAUDE.md records it as live and
// deliberately world-readable, but it is in NO migration and NOT in the dump —
// the old `public.ghg_conversation_starters` prefix matched nothing, so it has
// never actually been classified by a run. It is named here on the strength of
// that note; confirm it against the live catalogue on the first dry run.
const NEVER_TOUCH = new Set([
  'public.organizations',

  // CBAM reference data — CN codes, goods categories, benchmarks, default values.
  'public.cbam_benchmarks',
  'public.cbam_cn_codes',
  'public.cbam_cn_map',
  'public.cbam_default_values',
  'public.cbam_goods_categories',
  'public.cbam_grid_factors',
  'public.cbam_precursor_edges',
  'public.cbam_production_routes',
  'public.cbam_sefa_params',

  // Materiality reference data — the ESRS taxonomy, industries, regions, scenarios.
  'public.mr_asset_modifiers',
  'public.mr_esrs_disclosure_requirements',
  'public.mr_esrs_subtopic_display',
  'public.mr_esrs_subtopics',
  'public.mr_esrs_topic_labels',
  'public.mr_esrs_topics',
  'public.mr_industries',
  'public.mr_industry_hazards',
  'public.mr_industry_opportunities',
  'public.mr_industry_subtopic_baselines',
  'public.mr_industry_topic_baselines',
  'public.mr_industry_transition_drivers',
  'public.mr_jurisdictions',
  'public.mr_model_config',
  'public.mr_region_aliases',
  'public.mr_region_hazards',
  'public.mr_regions',
  'public.mr_scenarios',
  'public.mr_stakeholder_categories',
  'public.mr_survey_thresholds',

  // Twelve seeded prompt suggestions for the GHG assistant. No user data, no
  // writes, no FKs to customer rows. See the note in CLAUDE.md.
  'public.ghg_conversation_starters',
])
const isNeverTouch = (t) => NEVER_TOUCH.has(t)

// (b) THE EXPLICIT DELETE ROOTS, derived from ROOT_PREDICATE so the two cannot
// drift. auth.users is not a public table and is deleted by its own statement.
const ROOT_TABLES = new Set(Object.keys(ROOT_PREDICATE).filter(t => t !== 'auth.users'))

// (c) HANDLED EXPLICITLY, OUTSIDE THE CLOSURE. Neither is reachable by an FK walk
// and neither is reference data, so without this category both would read as
// unclassified — which is the point of naming them rather than special-casing
// them inside the test.
//   audit_log   — swept by the id-set logic in two passes, never by a reach
//                 predicate; buildClosure() removes it deliberately.
//   erasure_log — this script's own output. It must survive the erasure it
//                 records, so it is neither deleted nor reference data.
const EXPLICIT_OUTSIDE = new Set(['public.audit_log', 'public.erasure_log'])

// COVERAGE COLUMNS — any public table carrying one of these names holds per-account
// data by definition. These now drive a WARNING, not the gate: the gate below
// classifies every table in public, whether or not it carries a known column name.
const OWNER_COLUMNS = ['user_id', 'customer_user_id', 'buyer_id', 'owner_id', 'reviewer', 'extracted_by', 'updated_by']

// THE ONE EXEMPTION FROM THE OWNER-COLUMN GATE, keyed by table AND column rather
// than by table. audit_log.user_id is the ACTOR who made a change, not the subject
// the row is about, and the table is swept by the id-set logic in two passes
// instead of a reach predicate — so it is correctly outside (a) and (b).
//
// ⚠️ PER COLUMN, DELIBERATELY. Exempting the TABLE would mean a second owner
// column added to audit_log later — an owner_id, a subject_user_id — inherited
// the exemption silently and was never erased. Only the column named here is
// forgiven; anything else on this table still stops the script.
const OWNER_SCAN_EXEMPT = { 'public.audit_log': ['user_id'] }

const BUCKETS = ['source-documents', 'cbam-source-documents']

// ── 4. SMALL HELPERS ─────────────────────────────────────────────────────────
const qIdent = (s) => `"${String(s).replace(/"/g, '""')}"`
const qTable = (t) => { const [s, n] = t.split('.'); return `${qIdent(s)}.${qIdent(n)}` }
const DELRULE = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' }
const pad = (s, n) => String(s).padEnd(n)
const num = (n) => String(n).padStart(7)

function banner(title) {
  console.log(`\n${'─'.repeat(74)}\n${title}\n${'─'.repeat(74)}`)
}

// ── 5. CATALOGUE INTROSPECTION ───────────────────────────────────────────────
const SQL_FKS = `
select con.conname                                as name,
       nc.nspname || '.' || cc.relname            as child,
       np.nspname || '.' || cp.relname            as parent,
       con.confdeltype                            as delrule,
       -- ⚠️ ::text IS LOAD-BEARING. pg_attribute.attname is type name, not text, and
       -- node-pg has no array parser registered for name[] (oid 1003) — it hands
       -- back the raw literal '{user_id,company_id}' as a STRING. child_cols.map()
       -- then throws, and it throws while building the delete plan, which reads as
       -- a code defect rather than a type mismatch. Casting makes it text[] (1009),
       -- which node-pg does parse.
       (select array_agg(a.attname::text order by k.ord)
          from unnest(con.conkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as child_cols,
       (select array_agg(a.attname::text order by k.ord)
          from unnest(con.confkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as parent_cols
  from pg_constraint con
  join pg_class     cc on cc.oid = con.conrelid
  join pg_namespace nc on nc.oid = cc.relnamespace
  join pg_class     cp on cp.oid = con.confrelid
  join pg_namespace np on np.oid = cp.relnamespace
 where con.contype = 'f'
   and nc.nspname in ('public', 'auth', 'storage')
`

const SQL_OWNER_TABLES = `
-- ::text for the same reason as SQL_FKS above: name[] reaches node-pg as a
-- string and r.cols.filter() throws. The ORDER BY must be cast too — Postgres
-- requires the sort expression to match the aggregated one under DISTINCT.
select c.relname as table_name, array_agg(distinct a.attname::text order by a.attname::text) as cols
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
 where n.nspname = 'public' and c.relkind = 'r'
   and a.attname = any($1::text[])
 group by c.relname order by c.relname
`

// Every ordinary table in public. The classification gate below is a statement
// about this whole set, not about the subset that happens to carry a column name
// this file already knows.
const SQL_ALL_TABLES = `
select n.nspname || '.' || c.relname as t
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
 order by 1
`

// ── RLS POSTURE ──────────────────────────────────────────────────────────────
// relrowsecurity      RLS is enabled on the table
// relforcerowsecurity RLS applies even to the table's owner
// is_owner            pg_has_role(..., 'USAGE') mirrors Postgres's own ownership
//                     test for RLS (object_ownercheck -> has_privs_of_role), so an
//                     INHERIT member of the owning role counts, as it does live.
const SQL_RLS_POSTURE = `
select n.nspname || '.' || c.relname                   as t,
       c.relrowsecurity                                as rls,
       c.relforcerowsecurity                           as force_rls,
       pg_get_userbyid(c.relowner)                     as owner,
       pg_has_role(current_user, c.relowner, 'USAGE')  as is_owner
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
`

const SQL_CURRENT_ROLE = `
select current_user as who, r.rolsuper, r.rolbypassrls
  from pg_roles r where r.rolname = current_user
`

// Non-CASCADE FKs to auth.users OUTSIDE public. The live check on 10 Sep 2026 was
// that all eight auth-schema FKs cascade. If that has changed, the auth.users
// delete will fail in a way this script should name rather than discover.
const SQL_FOREIGN_BLOCKERS = `
select con.conname as name, n.nspname || '.' || c.relname as child, con.confdeltype as delrule
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
 where con.contype = 'f'
   and con.confrelid = 'auth.users'::regclass
   and n.nspname <> 'public'
   and con.confdeltype <> 'c'
`

// ── 6. CLOSURE AND REACH PREDICATES ──────────────────────────────────────────
// The closure is every table a delete would reach: the roots, plus anything
// CASCADE-reachable from them. The reach predicate is the SQL that says "this row
// belongs to the account", built by walking the same edges backwards.
function buildClosure(fks) {
  const byParent = new Map()
  for (const f of fks) {
    if (!byParent.has(f.parent)) byParent.set(f.parent, [])
    byParent.get(f.parent).push(f)
  }
  const closure = new Set()
  const queue = Object.keys(ROOT_PREDICATE)
  for (const r of queue) if (r !== 'auth.users') closure.add(r)
  const seen = new Set(queue)
  while (queue.length) {
    const t = queue.shift()
    for (const f of byParent.get(t) || []) {
      if (f.delrule !== 'c') continue
      if (!f.child.startsWith('public.')) continue
      if (closure.has(f.child)) continue
      closure.add(f.child)
      if (!seen.has(f.child)) { seen.add(f.child); queue.push(f.child) }
    }
  }
  // audit_log is handled by its own id-set logic, never by a reach predicate.
  closure.delete('public.audit_log')
  return closure
}

function makeReachBuilder(fks, closure) {
  const byChild = new Map()
  for (const f of fks) {
    if (!byChild.has(f.child)) byChild.set(f.child, [])
    byChild.get(f.child).push(f)
  }
  let n = 0
  function reach(table, alias, path) {
    if (path.length > 10) throw new Error(`FK chain deeper than 10 at ${table} — refusing to build a predicate this deep.`)
    const parts = []
    if (ROOT_PREDICATE[table]) parts.push(ROOT_PREDICATE[table](alias))
    for (const f of byChild.get(table) || []) {
      if (f.delrule !== 'c') continue
      if (!closure.has(f.parent) && !ROOT_PREDICATE[f.parent]) continue
      if (path.includes(f.parent)) continue              // cycle guard
      const pa = `p${n++}`
      const on = f.child_cols.map((c, i) => `${pa}.${qIdent(f.parent_cols[i])} = ${alias}.${qIdent(c)}`).join(' and ')
      parts.push(`exists (select 1 from ${qTable(f.parent)} ${pa} where ${on} and (${reach(f.parent, pa, [...path, table])}))`)
    }
    return parts.length ? parts.join('\n         or ') : 'false'
  }
  return (table) => reach(table, 't', [])
}

// Children before parents, over every FK edge between closure tables. Explicit
// order rather than cascade is what makes the four RESTRICT edges a non-event.
function deleteOrder(fks, closure) {
  const deps = new Map([...closure].map(t => [t, new Set()]))   // t -> parents that must wait
  const rdeps = new Map([...closure].map(t => [t, new Set()]))
  for (const f of fks) {
    if (!closure.has(f.child) || !closure.has(f.parent)) continue
    if (f.child === f.parent) continue                           // self-FK: one statement handles it
    deps.get(f.parent).add(f.child)
    rdeps.get(f.child).add(f.parent)
  }
  const order = []
  const ready = [...closure].filter(t => deps.get(t).size === 0).sort()
  const pending = new Map([...closure].map(t => [t, new Set(deps.get(t))]))
  while (ready.length) {
    const t = ready.shift()
    order.push(t)
    for (const p of rdeps.get(t)) {
      const s = pending.get(p); s.delete(t)
      if (s.size === 0) { ready.push(p); ready.sort() }
    }
  }
  if (order.length !== closure.size) {
    const stuck = [...closure].filter(t => !order.includes(t))
    throw new Error(`FK cycle among: ${stuck.join(', ')}. No safe delete order exists; resolve by hand.`)
  }
  return order
}

// ── 7. THE audit_log ID SETS ─────────────────────────────────────────────────
// record_id is uuid NOT NULL in every case, so no per-table casting is needed:
//   ghg_inventories               record_id = the inventory's id
//   ghg_entries                   record_id = the entry's id
//   cbam_production_processes     record_id = the process's id
//   cbam_installation_disclosures record_id = installation_id, NOT a row id —
//     that table has no id column and its PK is (installation_id, reporting_period),
//     so ONE record_id matches every reporting period of that installation. For
//     erasure that is correct (all periods belong to the same company) but it is
//     not a row identity and must not be treated as one.
// The jsonb keys are text, so the uuid is cast to text on the comparison side.
//
// ⚠️ AN ARRAY OF STATEMENTS, NOT ONE STRING, AND NOT A SPLIT ON ';'. The extended
// query protocol — which is what node-pg uses the moment a query carries
// parameters — permits exactly ONE statement per execute. A multi-statement
// string comes back as 42601 "cannot insert multiple commands into a prepared
// statement", naming a syntax error in SQL that is not wrong. Splitting a single
// string on ';' would work today and break the first time a statement contains
// one inside a literal, so the boundaries are declared instead of inferred.
//
// Each element is run in order; only the ones naming $1 are given a parameter,
// because supplying an unused parameter is itself an error (see the rate_limits
// note in ROOT_PREDICATE).
const SQL_TEMP_SETS = [
  `create temp table _era_inv (id uuid primary key) on commit drop`,
  `insert into _era_inv (id)
     select i.id from public.ghg_inventories i where i.user_id = $1::uuid
     union
     select al.record_id from public.audit_log al
      where al.table_name = 'ghg_inventories'
        and (al.old_values->>'user_id' = $1::text or al.new_values->>'user_id' = $1::text)`,

  `create temp table _era_entry (id uuid primary key) on commit drop`,
  `insert into _era_entry (id)
     select e.id from public.ghg_entries e where e.inventory_id in (select id from _era_inv)
     union
     select al.record_id from public.audit_log al
      where al.table_name = 'ghg_entries'
        and coalesce(al.old_values->>'inventory_id', al.new_values->>'inventory_id')
            in (select id::text from _era_inv)`,

  `create temp table _era_company (id uuid primary key) on commit drop`,
  `insert into _era_company (id) select c.id from public.companies c where c.user_id = $1::uuid`,

  `create temp table _era_proc (id uuid primary key) on commit drop`,
  `insert into _era_proc (id)
     select p.id from public.cbam_production_processes p where p.company_id in (select id from _era_company)
     union
     select al.record_id from public.audit_log al
      where al.table_name = 'cbam_production_processes'
        and coalesce(al.old_values->>'company_id', al.new_values->>'company_id')
            in (select id::text from _era_company)`,

  `create temp table _era_disc (installation_id uuid primary key) on commit drop`,
  `insert into _era_disc (installation_id)
     select distinct d.installation_id from public.cbam_installation_disclosures d
      where d.company_id in (select id from _era_company)
     union
     select al.record_id from public.audit_log al
      where al.table_name = 'cbam_installation_disclosures'
        and coalesce(al.old_values->>'company_id', al.new_values->>'company_id')
            in (select id::text from _era_company)`,
]

// The content sweep. Deliberately broader than the id sets on its last arm: any
// audit_log row whose jsonb carries this user_id, whatever table it came from,
// including rows written by THIS run's own deletes.
const AUDIT_CONTENT_WHERE = `
     (al.table_name = 'ghg_inventories'               and al.record_id in (select id from _era_inv))
  or (al.table_name = 'ghg_entries'                   and al.record_id in (select id from _era_entry))
  or (al.table_name = 'cbam_production_processes'     and al.record_id in (select id from _era_proc))
  or (al.table_name = 'cbam_installation_disclosures' and al.record_id in (select installation_id from _era_disc))
  or  al.old_values->>'user_id' = $1::text
  or  al.new_values->>'user_id' = $1::text
  or  al.user_id = $1::uuid
`

// ── 8. STORAGE ───────────────────────────────────────────────────────────────
async function listPrefix(admin, bucket, prefix) {
  const files = []
  const dirs = [prefix]
  while (dirs.length) {
    const dir = dirs.pop()
    let offset = 0
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 100, offset })
      if (error) throw new Error(`storage list ${bucket}/${dir}: ${error.message}`)
      if (!data || data.length === 0) break
      for (const e of data) {
        const full = `${dir}/${e.name}`
        // A folder comes back with a null id and null metadata. This is the
        // documented shape, not an inference from the name: a file with no
        // extension would otherwise be walked as a directory.
        if (e.id === null) dirs.push(full)
        else files.push(full)
      }
      if (data.length < 100) break
      offset += data.length
    }
  }
  return files
}

// ── 9. MAIN ──────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DBURL })
const summary = { tables: {}, storage: {}, notes: [] }
let admin = null

async function main() {
  banner(`ThemisIQ account erasure — ${MODE}`)
  console.log(`  subject : ${UID}`)
  console.log(`  database: ${DBURL.replace(/:\/\/[^@]*@/, '://<redacted>@')}`)
  if (args.export) console.log(`  export  : ${resolve(args.export)}`)

  await client.connect()

  // ── identity + confirmation ────────────────────────────────────────────────
  const who = await client.query('select id, email from auth.users where id = $1::uuid', [UID])
  let accountEmail = who.rowCount ? who.rows[0].email : null
  let resuming = false

  if (!who.rowCount) {
    const prior = await client.query(
      `select count(*)::int as n from public.erasure_log where subject_user_id = $1::uuid`, [UID],
    ).catch(() => ({ rows: [{ n: 0 }] }))   // table may not exist yet
    if (prior.rows[0].n === 0) {
      FAIL(`No auth.users row for ${UID}, and no erasure_log entry either. This uuid is unknown — refusing.`)
    }
    resuming = true
    // RESUME. The auth user is already gone, so the confirmation email cannot be
    // checked against anything — erasure_log holds no email, by design. It is
    // still REQUIRED and still used (rate_limits is keyed by email and nothing
    // else), but the run is labelled unverified so the operator knows which kind
    // of run this was.
    accountEmail = args.confirm || null
    summary.notes.push('resumed: auth.users row already absent; --confirm email could not be verified')
    console.log(`\n  ⚠ RESUMING — auth.users row is already gone. ${prior.rows[0].n} prior erasure_log row(s).`)
  }

  if (args.execute && !resuming) {
    const given = String(args.confirm).trim().toLowerCase()
    const real  = String(accountEmail || '').trim().toLowerCase()
    if (!real) FAIL(`auth.users row for ${UID} has no email; cannot confirm. Refusing.`)
    if (given !== real) FAIL(`--confirm does not match the account email for ${UID}. Refusing.`)
    console.log(`  confirmed: --confirm matches auth.users.email`)
  }

  // ── catalogue ──────────────────────────────────────────────────────────────
  const fks = (await client.query(SQL_FKS)).rows
  const closure = buildClosure(fks)
  const reachOf = makeReachBuilder(fks, closure)
  const order = deleteOrder(fks, closure)

  // ── COVERAGE CHECK — full classification, fails closed, in every mode ──────
  //
  // EVERY table in public must fall in EXACTLY ONE category:
  //   (a) in the computed cascade closure      — deleted by a derived predicate
  //   (b) an explicit delete root              — ROOT_PREDICATE
  //   (c) handled explicitly outside the closure — EXPLICIT_OUTSIDE
  //   (d) never-touch                          — reference data, organizations
  //
  // ⚠️ NONE AND MORE-THAN-ONE ARE BOTH FAILURES, and the second is the one worth
  // the extra code. A table in none is an unerased table — it holds customer data
  // nobody decided about, and the old owner-column test could not see it unless it
  // happened to use a column name this file already knew. A table in two is a
  // CONTRADICTION between two human decisions: a never-touch table that has become
  // CASCADE-reachable would be both preserved and deleted depending on which line
  // of this script you read, and the erasure would quietly do one of them. Naming
  // the collision is the only outcome that cannot be misread.
  banner('Coverage check — classification of every table in public')

  const allTables = (await client.query(SQL_ALL_TABLES)).rows.map(r => r.t)
  const CATEGORY = {
    a: 'cascade closure',
    b: 'explicit delete root',
    c: 'handled outside the closure',
    d: 'never-touch',
  }
  const bucketed = { a: [], b: [], c: [], d: [] }
  const unclassified = []
  const conflicted = []

  for (const t of allTables) {
    const cats = []
    // (a) excludes the roots deliberately: buildClosure() seeds the closure WITH
    // them, so without this they would count twice and every root would conflict.
    if (closure.has(t) && !ROOT_TABLES.has(t)) cats.push('a')
    if (ROOT_TABLES.has(t)) cats.push('b')
    if (EXPLICIT_OUTSIDE.has(t)) cats.push('c')
    if (isNeverTouch(t)) cats.push('d')

    if (cats.length === 1) bucketed[cats[0]].push(t)
    else if (cats.length === 0) unclassified.push(t)
    else conflicted.push(`${t} — ${cats.map(c => `(${c}) ${CATEGORY[c]}`).join(' AND ')}`)
  }

  for (const k of ['a', 'b', 'c', 'd']) {
    console.log(`  (${k}) ${pad(CATEGORY[k], 30)}${num(bucketed[k].length)} table(s)`)
  }
  console.log(`  ${pad('', 34)}${num(allTables.length)} in public`)

  if (conflicted.length) {
    FAIL(`Coverage check FAILED — ${conflicted.length} table(s) fall in MORE THAN ONE category. Two decisions in this file contradict each other; the erasure would silently honour one of them:\n\n    ${conflicted.join('\n    ')}\n\n  Resolve in ROOT_PREDICATE / EXPLICIT_OUTSIDE / NEVER_TOUCH before running. Nothing was done.`)
  }
  if (unclassified.length) {
    FAIL(`Coverage check FAILED — ${unclassified.length} table(s) in public are in NO category. Each is unreachable by the FK walk and undeclared, so an erasure would leave whatever they hold:\n\n    ${unclassified.join('\n    ')}\n\n  For each, add a root to ROOT_PREDICATE, add it to EXPLICIT_OUTSIDE, or declare it reference data in NEVER_TOUCH (by exact name). Nothing was done.`)
  }
  console.log(`  PASS — all ${allTables.length} table(s) classified, none twice.`)

  // ── SECOND CHECK: owner columns outside (a) and (b). FAILS CLOSED. ────────
  //
  // The classification above proves every table was DECIDED about. This proves
  // the decisions were not wrong in one specific direction: a table holding a
  // user id that is neither CASCADE-reachable nor an explicit root will not be
  // erased, whichever category was chosen for it. Declaring such a table
  // never-touch is exactly how customer data survives an erasure while the run
  // reports PASS — so being classified is not sufficient, and this is a gate.
  //
  // One exemption, by table AND column: OWNER_SCAN_EXEMPT.
  const ownerTables = (await client.query(SQL_OWNER_TABLES, [OWNER_COLUMNS])).rows
  // (a) ∪ (b) IS EXACTLY `closure` — buildClosure() seeds it with every root and
  // then walks CASCADE edges — so "outside (a) and (b)" is one membership test.
  const ownerViolations = []
  for (const r of ownerTables) {
    const t = `public.${r.table_name}`
    if (closure.has(t)) continue
    const exempt = OWNER_SCAN_EXEMPT[t] || []
    const bad = r.cols.filter(c => !exempt.includes(c))
    if (bad.length) {
      const cat = EXPLICIT_OUTSIDE.has(t) ? 'c' : isNeverTouch(t) ? 'd' : 'unclassified'
      ownerViolations.push(`${t} — column(s) ${bad.map(c => `\`${c}\``).join(', ')} — currently category (${cat})`)
    }
  }
  if (ownerViolations.length) {
    FAIL(`Owner-column check FAILED — ${ownerViolations.length} table(s) hold a user id but are outside the cascade closure and are not explicit delete roots. Whatever they hold would SURVIVE the erasure:\n\n    ${ownerViolations.join('\n    ')}\n\n  For each: give it a root in ROOT_PREDICATE, or — if the column genuinely does not identify the subject, as audit_log.user_id does not — add the specific column to OWNER_SCAN_EXEMPT with a reason. Nothing was done.`)
  }
  console.log(`  PASS — ${ownerTables.length} owner-column table(s) checked, ${Object.keys(OWNER_SCAN_EXEMPT).length} exemption(s) applied.`)

  // ── PRE-FLIGHT: ROW-LEVEL SECURITY ─────────────────────────────────────────
  //
  // ⚠️ RLS DOES NOT REFUSE. IT FILTERS. A role that neither owns a table nor holds
  // BYPASSRLS sees zero rows on an RLS-enabled table — no error, no warning, an
  // empty result that is indistinguishable from an account with nothing in it. Run
  // that way, this script reports 0 rows found, deletes 0 rows, passes the residual
  // check because the residual count is filtered too, writes a clean erasure_log
  // row, and leaves every byte of the customer's data in place. EVERY OTHER CHECK
  // IN THIS FILE AGREES THAT IT WORKED.
  //
  // That is the single worst outcome the script can produce — worse than a crash,
  // worse than a partial delete — because it ends with a durable record asserting
  // an erasure that did not happen, which is what would be shown to the customer
  // or a regulator. So this runs in EVERY mode, before anything else touches data.
  banner('RLS pre-flight')
  const me = (await client.query(SQL_CURRENT_ROLE)).rows[0]
  console.log(`  connected as ${me.who} — superuser=${me.rolsuper}, bypassrls=${me.rolbypassrls}`)

  if (me.rolsuper || me.rolbypassrls) {
    // Either attribute means check_enable_rls() returns RLS_NONE for every table,
    // so no policy can filter this session. Nothing further to prove.
    console.log('  PASS — this role is never filtered by RLS; table-by-table check not required.')
  } else {
    const rlsScope = new Set([...closure, ...EXPLICIT_OUTSIDE])
    const posture = (await client.query(SQL_RLS_POSTURE)).rows
    const seen = new Set(posture.map(r => r.t))
    const blind = []
    let clear = 0
    for (const r of posture) {
      if (!rlsScope.has(r.t)) continue
      if (!r.rls) { clear++; continue }                      // RLS off: every row visible
      if (r.is_owner && !r.force_rls) { clear++; continue }  // owner bypass applies
      blind.push(r.is_owner
        ? `${r.t} — RLS enabled AND force_rls is on, so even the owner (${r.owner}) is filtered`
        : `${r.t} — RLS enabled and ${me.who} is not the owner (owner: ${r.owner})`)
    }
    // A scoped table absent from the catalogue is not an RLS problem; erasure_log
    // before its migration is the expected case. Named, not failed.
    const missing = [...rlsScope].filter(t => !seen.has(t))
    if (missing.length) console.log(`  not present in the catalogue, skipped: ${missing.join(', ')}`)

    if (blind.length) {
      FAIL(`RLS pre-flight FAILED — ${blind.length} of ${blind.length + clear} table(s) in scope would be FILTERED for ${me.who}:\n\n    ${blind.join('\n    ')}\n\n  This is not a permissions error you would see at run time. RLS returns an EMPTY RESULT, so the run would report 0 rows found, delete nothing, pass the residual check, and write an erasure_log row saying it succeeded.\n\n  Fix by connecting as a role that owns these tables or holds BYPASSRLS — on Supabase, the 'postgres' role in the connection string from docs/backup-record.md, not a pooled application role.\n\n  To confirm the diagnosis before changing anything, run 'set row_security = off;' in a psql session as this role and re-query one table: that setting turns the silent filtering into a loud error instead.\n\n  Nothing was done.`)
    }
    console.log(`  PASS — all ${clear} in-scope table(s) are readable in full by ${me.who}.`)
  }

  // auth.users is deliberately NOT in the scope above. It is not a public table,
  // and both paths that touch it fail LOUDLY rather than silently: a filtered
  // select returns rowCount 0, which the identity check at the top refuses as an
  // unknown uuid, and the delete is already wrapped in the 42501 savepoint.

  // ── the transaction. Dry run and export roll it back; execute commits. ─────
  await client.query('begin')
  let committed = false
  try {
    for (const stmt of SQL_TEMP_SETS) {
      await client.query(stmt, stmt.includes('$1') ? [UID] : [])
    }

    // ── organizations: reported, never deleted ───────────────────────────────
    // ⚠️ BEFORE THE DELETE LOOP, NOT AFTER. Both referencing columns live on rows
    // this loop is about to delete, so run after it this counted zero in execute
    // mode every time and the warning could never fire in the one mode where it
    // matters. Dry run was unaffected, which is exactly why it went unnoticed.
    //
    // BOTH parents are counted. organizations has two CASCADE children —
    // ghg_inventories and materiality_assessments — and an account reaching it
    // only through a materiality assessment is the same finding.
    const orgs = await client.query(
      `select count(distinct o.id)::int as n from public.organizations o
        where exists (select 1 from public.ghg_inventories i
                       where i.organization_id = o.id and i.user_id = $1::uuid)
           or exists (select 1 from public.materiality_assessments a
                       where a.organization_id = o.id and a.user_id = $1::uuid)`,
      [UID],
    )
    if (orgs.rows[0].n > 0) {
      const msg = `${orgs.rows[0].n} organizations row(s) referenced by this account and NOT deleted (no owner column; two CASCADE children)`
      summary.notes.push(msg)
      console.log(`  ⚠ ${msg}`)
    }

    // ── plan + counts ────────────────────────────────────────────────────────
    banner(`Rows ${args.execute ? 'deleted' : 'that would be deleted'} — delete order, children first`)
    console.log(`  ${pad('TABLE', 46)}${num('ROWS')}   RULE INTO PARENT`)

    for (const t of order) {
      const where = reachOf(t)
      // ⚠️ ONLY THE PARAMETERS THE PREDICATE ACTUALLY USES. Postgres rejects a
      // bind that supplies more parameters than the statement references
      // ("bind message supplies 2 parameters, but prepared statement requires
      // 1"), and only rate_limits' predicate carries $2. Passing a fixed pair
      // would fail on every other table in the closure.
      const p = where.includes('$2') ? [UID, accountEmail] : [UID]
      const sqlCount = `select count(*)::bigint as n from ${qTable(t)} t where ${where}`
      const n = Number((await client.query(sqlCount, p)).rows[0].n)
      summary.tables[t] = n
      const intoParent = fks.filter(f => f.child === t && closure.has(f.parent))
        .map(f => DELRULE[f.delrule]).filter((v, i, a) => a.indexOf(v) === i).join('/')
      console.log(`  ${pad(t, 46)}${num(n)}   ${intoParent || '—'}`)

      if (args.export && n > 0) {
        const rows = (await client.query(`select t.* from ${qTable(t)} t where ${where}`, p)).rows
        const f = join(resolve(args.export), `${t}.json`)
        mkdirSync(dirname(f), { recursive: true })
        writeFileSync(f, JSON.stringify(rows, null, 2))
      }
      if (args.execute && n > 0) {
        const r = await client.query(`delete from ${qTable(t)} t where ${where}`, p)
        if (r.rowCount !== n) summary.notes.push(`${t}: counted ${n}, deleted ${r.rowCount}`)
      }
    }

    // ── the null-user_id warning ─────────────────────────────────────────────
    const orphanInv = await client.query(`select count(*)::int as n from public.ghg_inventories where user_id is null`)
    if (orphanInv.rows[0].n > 0) {
      const msg = `${orphanInv.rows[0].n} ghg_inventories row(s) have a NULL user_id and belong to nobody this script can identify — not counted above, not deleted`
      summary.notes.push(msg)
      console.log(`  ⚠ ${msg}`)
    }

    // ── audit_log ────────────────────────────────────────────────────────────
    banner('audit_log')
    const actorN = Number((await client.query(
      `select count(*)::bigint as n from public.audit_log al where al.user_id = $1::uuid`, [UID])).rows[0].n)
    console.log(`  pass (a) actor rows (user_id = subject, the FK that blocks auth.users): ${actorN}`)

    const contentN = Number((await client.query(
      `select count(*)::bigint as n from public.audit_log al where ${AUDIT_CONTENT_WHERE}`, [UID])).rows[0].n)
    console.log(`  pass (b) content rows matching the id sets or the subject's jsonb: ${contentN}`)
    if (!args.execute) {
      summary.tables['public.audit_log (pass a, actor)'] = actorN
      summary.tables['public.audit_log (pass b, content)'] = contentN
      console.log('  (the executed sweep will be larger: the deletes themselves write new rows)')
    }

    if (args.export) {
      const rows = (await client.query(`select al.* from public.audit_log al where ${AUDIT_CONTENT_WHERE}`, [UID])).rows
      const f = join(resolve(args.export), 'public.audit_log.json')
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, JSON.stringify(rows, null, 2))
      console.log(`  exported ${rows.length} audit_log row(s) (content sweep).`)
    }

    if (args.execute) {
      const a = await client.query(`delete from public.audit_log al where al.user_id = $1::uuid`, [UID])
      summary.tables['public.audit_log (pass a, actor)'] = a.rowCount

      // ── auth.users, inside the transaction, behind a savepoint ─────────────
      const foreign = (await client.query(SQL_FOREIGN_BLOCKERS)).rows
      if (foreign.length) {
        FAIL(`A non-CASCADE FK to auth.users has appeared outside public since 10 Sep 2026:\n    ${foreign.map(f => `${f.child} (${f.name}, ${DELRULE[f.delrule]})`).join('\n    ')}\n  Stopping; the transaction is rolled back.`)
      }

      let authDeferred = false
      if (!resuming) {
        await client.query('savepoint sp_auth_user')
        try {
          await client.query('delete from auth.users where id = $1::uuid', [UID])
          summary.tables['auth.users'] = 1
          console.log('  auth.users row deleted in-transaction.')
        } catch (e) {
          if (e.code !== '42501') throw e
          // 42501 insufficient_privilege: this connection's role may not delete
          // from auth. Roll back only the failed statement — the public deletes
          // stand — and hand the row to the admin API after commit. Reported, not
          // silent: the difference between "deleted" and "deleted by another
          // route" is the difference between a clean record and a wrong one.
          await client.query('rollback to savepoint sp_auth_user')
          authDeferred = true
          summary.notes.push('auth.users delete deferred to the admin API (42501 insufficient_privilege on the DBURL role)')
          console.log('  ⚠ auth.users delete refused with 42501 — deferring to supabase.auth.admin.deleteUser after commit.')
        }
      }

      // pass (b): the content sweep, LAST, so it catches the rows the deletes above wrote
      const b = await client.query(`delete from public.audit_log al where ${AUDIT_CONTENT_WHERE}`, [UID])
      summary.tables['public.audit_log (pass b, content)'] = b.rowCount
      console.log(`  pass (b) content rows swept after the deletes: ${b.rowCount}`)

      // ── RESIDUAL ASSERTION — the last thing before the record is written ──
      //
      // Everything above is a PLAN executed. This is the only step that checks
      // the plan was RIGHT, and it asks the question the other way round: not
      // "did every delete I intended succeed?" but "is any row still here that
      // names this user?". A reach predicate that silently matched nothing — a
      // renamed column, an FK dropped last month, a table added to never-touch by
      // mistake — produces a clean run with zero counts and leaves the data in
      // place. Only a direct count can tell that apart from an account that
      // genuinely had no rows.
      //
      // It THROWS rather than calling FAIL(): the catch below issues ROLLBACK, so
      // a failure here undoes every delete in this transaction and the customer's
      // data is still there to try again. FAIL() would exit the process — the
      // rollback would still happen, by connection loss, but by accident rather
      // than by design, and nothing would have run the storage phase's guard.
      //
      // ⚠️ ASSUMES EVERY OWNER COLUMN IS uuid. True of all 27 today. A text or
      // bigint owner column added later fails here with 42883 rather than a
      // wrong answer, which is the right way round.
      banner('Residual check')
      const residual = []
      for (const r of ownerTables) {
        const t = `public.${r.table_name}`
        for (const col of r.cols) {
          const q = `select count(*)::bigint as n from ${qTable(t)} where ${qIdent(col)} = $1::uuid`
          const n = Number((await client.query(q, [UID])).rows[0].n)
          if (n > 0) residual.push(`${t}.${col}: ${n} row(s)`)
        }
      }
      // audit_log's jsonb is not a column the scan above can see, and it is where
      // the deletes themselves write. Both keys, because an UPDATE row carries the
      // user in new_values and a DELETE row in old_values.
      const auditResidual = Number((await client.query(
        `select count(*)::bigint as n from public.audit_log al
          where al.old_values->>'user_id' = $1::text or al.new_values->>'user_id' = $1::text`,
        [UID])).rows[0].n)
      if (auditResidual > 0) residual.push(`public.audit_log.old_values/new_values->>'user_id': ${auditResidual} row(s)`)

      if (residual.length) {
        throw new Error(
          `Residual check FAILED — ${residual.length} location(s) still hold rows naming ${UID} after every delete ran:\n\n    ${residual.join('\n    ')}\n\n  The transaction is rolled back; nothing was erased and the account is intact. A reach predicate is not matching what it should — check the FK graph for the table(s) above before re-running.`,
        )
      }
      console.log(`  PASS — no row in any owner column, and none in audit_log's jsonb, still names the subject.`)

      // ── the erasure record ────────────────────────────────────────────────
      // completed_at stays null here: the Storage calls happen after COMMIT and
      // cannot be inside this transaction. It is set in a second statement once
      // the files are verified gone.
      const ins = await client.query(
        `insert into public.erasure_log (subject_user_id, requested_at, performed_by, table_counts, storage_counts, notes)
         values ($1::uuid, $2::timestamptz, $3::text, $4::jsonb, '{}'::jsonb, $5::text) returning id`,
        [UID, args.requestedAt || null, args.performedBy || null, JSON.stringify(summary.tables),
         summary.notes.length ? summary.notes.join('; ') : null],
      )
      summary.erasureLogId = ins.rows[0].id
      summary.authDeferred = authDeferred

      await client.query('commit')
      committed = true
      console.log(`\n  COMMITTED. erasure_log id ${summary.erasureLogId}`)
    } else {
      await client.query('rollback')
      console.log('\n  ROLLED BACK — nothing was written.')
    }
  } catch (e) {
    if (!committed) { try { await client.query('rollback') } catch {} }
    throw e
  }

  // ── storage, after commit ──────────────────────────────────────────────────
  banner('Storage')
  const { createClient } = await import('@supabase/supabase-js')
  if (!SUPABASE_URL || !SERVICE_KEY) FAIL('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must both be set for the Storage and auth-admin steps.')
  admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  for (const bucket of BUCKETS) {
    const files = await listPrefix(admin, bucket, UID)
    // Every path must live under <uuid>/. Both upload sites build it that way and
    // both bucket policies require it, so a path that does not is either a schema
    // change or a traversal — and deleting it would reach another account.
    const stray = files.filter(p => !p.startsWith(`${UID}/`))
    if (stray.length) FAIL(`${bucket}: ${stray.length} path(s) outside ${UID}/ — refusing to remove anything in this bucket.\n    ${stray.slice(0, 5).join('\n    ')}`)
    summary.storage[bucket] = files.length
    console.log(`  ${pad(bucket, 30)}${num(files.length)} file(s)`)

    if (args.export && files.length) {
      for (const p of files) {
        const { data, error } = await admin.storage.from(bucket).download(p)
        if (error) FAIL(`download ${bucket}/${p}: ${error.message}`)
        const out = join(resolve(args.export), 'storage', bucket, p)
        mkdirSync(dirname(out), { recursive: true })
        writeFileSync(out, Buffer.from(await data.arrayBuffer()))
      }
      console.log(`    downloaded ${files.length} file(s).`)
    }

    if (args.execute && files.length) {
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(files.slice(i, i + 100))
        if (error) FAIL(`remove from ${bucket}: ${error.message}. The database transaction is already committed; re-run --execute to finish.`)
      }
      const left = await listPrefix(admin, bucket, UID)
      if (left.length) FAIL(`${bucket}: ${left.length} file(s) still present after removal. Re-run --execute.`)
      console.log(`    removed ${files.length}, verified 0 remain.`)
    }
  }

  // ── deferred auth delete, and closing the record ───────────────────────────
  if (args.execute) {
    if (summary.authDeferred) {
      const { error } = await admin.auth.admin.deleteUser(UID)
      if (error) FAIL(`admin.deleteUser failed after the 42501 deferral: ${error.message}. The database rows and files are gone; the auth user remains. Re-run --execute.`)
      summary.tables['auth.users'] = 1
      console.log('\n  auth.users deleted via the admin API (privilege forced it).')
    }
    await client.query(
      `update public.erasure_log
          set completed_at = now(), storage_counts = $2::jsonb, table_counts = $3::jsonb, notes = $4::text
        where id = $1::uuid`,
      [summary.erasureLogId, JSON.stringify(summary.storage), JSON.stringify(summary.tables),
       summary.notes.length ? summary.notes.join('; ') : null],
    )
    console.log(`  erasure_log ${summary.erasureLogId} completed.`)
  }

  // ── summary ────────────────────────────────────────────────────────────────
  banner(`Summary — ${MODE}`)
  const totalRows = Object.values(summary.tables).reduce((a, b) => a + b, 0)
  const totalFiles = Object.values(summary.storage).reduce((a, b) => a + b, 0)
  console.log(`  ${Object.keys(summary.tables).filter(k => summary.tables[k] > 0).length} table(s) with rows · ${totalRows} row(s) · ${totalFiles} file(s)`)
  for (const n of summary.notes) console.log(`  ⚠ ${n}`)
  if (!args.execute) console.log('\n  Nothing was changed. Add --execute --confirm <email> to erase.')
  console.log(`
  NOT covered by this run: Stripe records (retained ~7 years), Resend message
  logs, /assess lead emails in the monitor inbox, Vercel logs, Anthropic, and
  every database backup taken before now.
`)
}

main()
  .then(async () => { await client.end(); process.exit(0) })
  .catch(async (e) => {
    try { await client.end() } catch {}
    console.error(`\n✗ ${e.message}\n`)
    if (e.code) console.error(`  postgres code: ${e.code}`)
    console.error('  Nothing is left half-done inside the database: the transaction rolls back as a unit.')
    process.exit(1)
  })
