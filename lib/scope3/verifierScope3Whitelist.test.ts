import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// THE SCOPE 3 VERIFIER WHITELIST, ASSERTED AGAINST ITS COUPLED SITES.
//
// Modelled on lib/ghg/verifierWhitelist.test.ts and for the same reason: get_verifier_scope3 discloses
// a whitelist, and a whitelist is only a whitelist while something keeps it one. Two things make this
// surface harder than the GHG one.
//
//   1. IT DISCLOSES SOMEBODY ELSE'S DATA. Category 1 lines carry supplier names and the figures those
//      suppliers reported. Every other verifier surface shows the customer their own inventory.
//   2. ITS ACCESS IS A COLUMN, NOT A FUNCTION. RPCs are granted to anon, so the existence of this
//      function would have widened all nine grants live on 24 Sep 2026 had verifier_access.scope3_included
//      not defaulted to false. A test that only checked the projection would miss that entirely.
//
// ⚠️ WHAT THIS CANNOT SEE, same limit the GHG one states: the migration FILE, not the live database. A
// function replaced by hand in the SQL editor and never captured to a migration is invisible here.
// pg_get_functiondef is the only thing that settles what is live.

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')
const VERIFY_PAGE = join(process.cwd(), 'app', 'verify', '[token]', 'page.tsx')

/** The newest migration defining get_verifier_scope3, by filename order, as a reader would. */
function latestRpc(): { name: string; sql: string } {
  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql') && /get_verifier_scope3/i.test(f)).sort()
  expect(files.length, 'no get_verifier_scope3 migration found').toBeGreaterThan(0)
  const name = files[files.length - 1]
  return { name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }
}

/** SQL line comments stripped, so prose about a column is never mistaken for the column. */
const stripSql = (sql: string) => sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

const { name, sql } = latestRpc()
const body = stripSql(sql)
const pageSrc = readFileSync(VERIFY_PAGE, 'utf8')
// ⚠️ WHITESPACE COLLAPSED, AND THE FIRST DRAFT OF S-12 AND S-13 FAILED WITHOUT IT. JSX prose wraps
// across source lines wherever the formatter puts it, so a single-line pattern looking for a sentence
// tests where the line breaks fell rather than what the page says. Same mistake, in a different
// language, as asserting on a SQL file's text while the value lives across two adjacent string
// literals: match the content, never the formatting.
// ⚠️ AND COMMENTS REMOVED AS SPANS BEFORE THAT. S-13 first failed on the page's OWN JSX comment, which
// quotes the phrase "no Scope 3 data" in order to forbid it. Fourth instance in this work of prose about
// a rule reading as a breach of it, after the snapshot grant test, the assurance scope note and the
// carriesThirdPartyAssurance guard. ⚠️ SPANS, NOT LINES: a {/* */} block's continuation lines do not
// begin with a comment marker, so the line filter used elsewhere in this suite would leave the quoted
// phrase behind. docs/backlog.md carries the approved task to make this one shared helper.
const page = pageSrc
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  .replace(/\s+/g, ' ')

describe('the Scope 3 verifier RPC discloses a whitelist and nothing beside it', () => {
  it('S-1 the parse found a real function body', () => {
    // Guards the assertions below from passing vacuously, which is how a source-text test rots.
    expect(body, `${name}: no function`).toContain('create or replace function public.get_verifier_scope3')
    expect(body).toContain('security definer')
    expect(body).toContain('set search_path = public')
    expect(body.split('jsonb_build_object').length - 1, 'projections parsed as none').toBeGreaterThan(4)
  })

  it('S-2 withholds every internal identifier and every field the GHG surface withholds', () => {
    // ⚠️ revenue_millions IS THE ONE TO WATCH. get_verifier_inventory excludes it BY NAME, and two
    // verifier surfaces disagreeing about the same field would be indefensible. The rest are internal
    // uuids, join keys, or the working state whose filed counterpart is the snapshot.
    // Digits included here too, for the reason S-3 records.
    for (const withheld of [
      's.id', 's.user_id', 's.inventory_id', 's.revenue_millions', 's.cat_data',
      's.created_at', 's.updated_at',
      'cs.id', 'cs.user_id', 'cs.accepted_by', 'cs.created_at',
    ]) {
      expect(body, `${withheld} is projected by ${name}`).not.toContain(`', ${withheld}`)
      expect(body, `${withheld} is projected by ${name}`).not.toMatch(
        new RegExp(`'[a-z_]+',\\s+${withheld.replace('.', '\\.')}\\b`))
    }
    // supplier_id is dropped in the jsonb rebuilds: it is a join key into the campaign tables.
    expect(body, 'supplier_id reaches the verifier').not.toContain("'supplier_id'")
    // cat_snapshot_ids is READ to find the snapshots and must not be emitted.
    expect(body, 'cat_snapshot_ids is read').toContain('cat_snapshot_ids')
    expect(body, 'and not emitted').not.toMatch(/'cat_snapshot_ids',/)
  })

  it('S-3 names four distinct verdicts and conflates none of them', () => {
    // A verifier told "invalid" about a valid but narrower link asks the customer to replace a link
    // that will fail identically. app/verify/[token]/page.tsx already carries that scar.
    // ⚠️ [a-z0-9_]+, WITH THE DIGITS. This pattern was written as [a-z_]+ and silently found two of the
    // four, because scope3_not_granted and scope3_not_found both contain a 3. That is the THIRD time in
    // this session a character class without digits has hidden part of a namespace: it also missed the
    // `scope3` and `cs3d` questionnaire templates, twice. A class that excludes digits does not fail, it
    // under-reports, which in a whitelist test means passing while the thing it guards is unchecked.
    const verdicts = [...body.matchAll(/'error',\s*'([a-z0-9_]+)'/g)].map(m => m[1])
    expect([...new Set(verdicts)].sort()).toEqual(
      ['consent_required', 'invalid_or_expired', 'scope3_not_found', 'scope3_not_granted'])
    expect(verdicts.length, 'each verdict returned once').toBe(4)
  })

  it('S-4 enforces consent in the body, which get_verifier_inventory does not', () => {
    // ⚠️ THE DEPARTURE, AND THE POINT OF IT. get_verifier_inventory validates status and expires_at
    // only: pg_get_functiondef on 24 Sep 2026 showed accepted_at appearing once, as an output key. So
    // its consent gate is client-side and a direct RPC call with a valid token bypasses it. This
    // function does not inherit that. It mirrors lib/ghg/verifierGrant.ts, which hard-gates document
    // metadata and signed URLs on accepted_at, and reuses that module's two denial strings verbatim.
    expect(body, 'no consent gate').toMatch(/v_access\.accepted_at is null/)
    expect(body, 'revoked_at untested, unlike verifierGrant.ts').toMatch(/revoked_at is null/)
    expect(body).toMatch(/status = 'active'/)
    expect(body).toMatch(/expires_at > now\(\)/)
  })

  it('S-5 gates on the opt-in column, and the column defaults to false', () => {
    // ⚠️ THE ACCESS DECISION IS THE DEFAULT, NOT THE FUNCTION. RPCs are granted to anon, so a separate
    // function is code organisation. Nine active grants existed when this was written; `default false`
    // is the only reason none of them widened.
    expect(body).toMatch(/coalesce\(v_access\.scope3_included, false\)/)
    expect(body, 'the column must be added not-null default false').toMatch(
      /add column if not exists scope3_included boolean not null default false/)
    expect(body, 'and never defaulted to true').not.toMatch(/scope3_included boolean not null default true/)
  })

  it('S-6 preserves an absent assurance key as absent, as a pair', () => {
    // ⚠️ THE SUBTLEST THING IN THE FILE. A line with no assurance key predates the field and does NOT
    // mean "not assured"; the table is immutable so those rows are never backfilled. `l -> 'assurance'`
    // unconditionally turns absent into null, and null reads as one of the recorded absences.
    // supplier_assurance_raw is conditional on the SAME key because a pre-field line handed
    // supplier_assurance_raw = null would read as a supplier who was asked and did not answer.
    expect(body, "no conditional guard on the assurance key").toMatch(/case when l \? 'assurance'/)
    const guard = body.slice(body.indexOf("case when l ? 'assurance'"))
    const arm = guard.slice(0, guard.indexOf('end'))
    expect(arm, 'the guard must emit BOTH keys').toContain("'assurance'")
    expect(arm, 'the guard must emit BOTH keys').toContain("'supplier_assurance_raw'")
    // Neither may also be emitted unconditionally somewhere else in the rebuild.
    const outside = body.replace(/case when l \? 'assurance'[\s\S]*?end/g, '')
    expect(outside, 'assurance emitted unconditionally as well').not.toContain("'assurance',")
    expect(outside, 'raw answer emitted unconditionally as well').not.toContain("'supplier_assurance_raw',")
  })

  it('S-7 orders categories by number, not by string', () => {
    // Lexical order on cat1..cat15 puts cat10 after cat1 and cat2 after cat15, so a verifier reads a
    // GHG Protocol inventory out of the standard's own order, in a document meant to be checked
    // against it.
    expect(body).toMatch(/order by cat_num/)
    expect(body, 'the sort key is derived from the category').toMatch(/regexp_replace\(cs\.category/)
    expect(body, 'and not ordered by the raw string').not.toMatch(/order by snap ->> 'category'/)
  })

  it('S-8 is ASCII-only, so it pastes whole into the SQL editor', () => {
    // W-6's rule, for W-6's reason: the 13 Aug factor_editions paste landed in pieces and only its
    // `alter table` ran. A migration that lands in pieces is how a live function drifts from the file
    // claiming to define it. This one alters a table AND creates a function, so a partial paste would
    // leave the column without its gate, or the function without its opt-in.
    const nonAscii = [...sql].map((ch, i) => ({ ch, i })).filter(x => x.ch.charCodeAt(0) > 127)
    const where = nonAscii.slice(0, 5).map(x =>
      `line ${sql.slice(0, x.i).split('\n').length}: ${JSON.stringify(x.ch)}`)
    expect(nonAscii.length, `\n\n${name} CONTAINS NON-ASCII:\n  ${where.join('\n  ')}\n`).toBe(0)
  })

  it('S-9 is revoked from public and granted to anon like the surface it belongs to', () => {
    expect(body).toMatch(/revoke all on function public\.get_verifier_scope3\(uuid\) from public/)
    expect(body).toMatch(/grant execute on function public\.get_verifier_scope3\(uuid\) to anon, authenticated/)
  })
})

describe('the verifier page renders what the RPC sends, in the shared wording', () => {
  it('S-10 every line key the RPC emits is read by the page', () => {
    // The coupled site. A key projected with no reader is a disclosure with no purpose; a reader with
    // no key renders undefined to an external verifier.
    const rebuild = body.slice(body.indexOf("'lines', ("), body.indexOf("'uncovered', ("))
    const keys = [...rebuild.matchAll(/'([a-z0-9_]+)',\s+l /g)].map(m => m[1])
    expect(keys.length, 'the lines rebuild parsed as empty').toBeGreaterThan(4)
    for (const k of keys) {
      expect(page, `${k} is projected but the page never reads it`).toMatch(new RegExp(`\\bl\\.${k}\\b|\\b${k}\\??:`))
    }
  })

  it('S-11 uses the shared assurance module rather than its own wording', () => {
    // ⚠️ ONE SET OF SENTENCES FOR BOTH AUDIENCES. The buyer's screen and this page must not be able to
    // say different things about the same supplier answer, and nothing may imply a figure is assured.
    for (const fn of ['assuranceLabel', 'assuranceStatement', 'showsAssuranceChip', 'assuranceWasRecorded']) {
      expect(page, `${fn} is not used on the verifier page`).toContain(`${fn}(`)
    }
    expect(page).toContain('ASSURANCE_SCOPE_NOTE')
    expect(page).toContain('ASSURANCE_NOT_RECORDED_NOTE')
    for (const pat of [/\bassured figure\b/i, /\bassured emissions\b/i, /\bthis figure is assured\b/i]) {
      expect(page, `${pat} on the verifier page`).not.toMatch(pat)
    }
  })

  it('S-12 says why there is no audit trail beside the Scope 3 figures', () => {
    // A verifier who finds a revision history beside Scope 1 and 2 and none here will wonder what is
    // withheld. Nothing is: scope3_inventories carries no audit trigger and the snapshot chain is the
    // record of what was filed. Silence would read as an omission.
    expect(page).toMatch(/no revision history of the kind shown under Audit Trail/)
    expect(page, 'and says what the record is instead').toMatch(/frozen at the moment the company accepted it/)
    expect(body, 'the RPC states it too, so a future consumer is not left to infer it')
      .toMatch(/'has_audit_trail', false/)
  })

  it('S-13 never renders an absent record as "no Scope 3 data"', () => {
    // Absent means the grant excludes it, the inventory has none, or the read failed. None of those
    // licenses a claim about the customer's inventory. An empty result is reported as which empty.
    expect(page, 'a failed read says what was observed').toMatch(/not a statement about whether one exists/)
    expect(page).not.toMatch(/No Scope 3 data/i)
  })
})
