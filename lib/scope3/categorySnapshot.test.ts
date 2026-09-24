import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildCategorySnapshot, snapshotMethod, isUnreasonedRestatement, isMissingSnapshotSchema,
  type SnapshotLine, type AcceptedResult,
} from './categorySnapshot'

// ── WHAT A REPORTED CATEGORY FIGURE IS A TOTAL OF ───────────────────────────────────────────────
//
// The figure was a scalar and the workings behind it lived in React state until the page closed.
// These protect the record a verifier reads: that the method describes the lines rather than the
// category, that a correction supersedes rather than overwrites, and that a snapshot is never written
// against a figure that did not go into a total.

const line = (o: Partial<SnapshotLine> = {}): SnapshotLine => ({
  supplier_id: 's1', supplier_name: 'Acme', method: 'supplier-specific',
  data_quality: 'Measured / supplier-specific', value_mt: 10,
  basis: 'Supplier-reported allocated emissions: 10 mt CO2e (allocated by revenue share)',
  supplier_assurance_raw: 'Yes — limited assurance', assurance: 'limited', ...o,
})
const result = (lines: SnapshotLine[]): AcceptedResult => ({
  total_mt: lines.reduce((n, l) => n + l.value_mt, 0), lines, uncovered: [], currency_flags: [],
})
const AT = '2026-09-24T09:00:00.000Z'

describe('the method a snapshot records', () => {
  it('is mixed when the lines are, which is the ordinary Cat 1 case', () => {
    // ⚠️ DERIVED FROM THE LINES, NOT ASSUMED FROM THE CATEGORY. A Cat 1 total is routinely both: a
    // supplier who reported an allocated figure is priced supplier-specific, one who did not is
    // gap-filled from spend, in the same total. Recording either single method would describe most
    // real inventories wrongly, and it is the first claim a verifier checks.
    expect(snapshotMethod([line(), line({ supplier_id: 's2', method: 'spend-based' })])).toBe('mixed')
    expect(snapshotMethod([line(), line({ supplier_id: 's2' })])).toBe('supplier-specific')
    expect(snapshotMethod([line({ method: 'spend-based' })])).toBe('spend-based')
  })
})

describe('building a snapshot', () => {
  it('records the figure that went into the total, not the route total', () => {
    // ⚠️ ONE NUMBER. useCatOneFigure rounds to three decimals before writing supplier_emissions, so a
    // snapshot built from the route's raw total would document a figure that never entered any total.
    const r = result([line({ value_mt: 10.00049 })])
    const snap = buildCategorySnapshot({
      category: 'cat1', figureAsUsed: 10.0, unit: 'mt CO2e', result: r, acceptedAt: AT,
    })
    expect(snap.figure_as_used).toBe(10.0)
    expect(r.total_mt, 'the route total differs, and is not what was recorded').not.toBe(10.0)
  })

  it('keeps the whole line, the parts and the displayed sentence together', () => {
    const snap = buildCategorySnapshot({
      category: 'cat1', figureAsUsed: 10, unit: 'mt CO2e', result: result([line()]), acceptedAt: AT,
    })
    const l = snap.lines[0]
    // The parts are the data.
    expect(l.value_mt).toBe(10)
    expect(l.method).toBe('supplier-specific')
    expect(l.data_quality).toBe('Measured / supplier-specific')
    // The sentence is kept verbatim as what was shown, so the record can reproduce what was accepted.
    expect(l.basis).toContain('allocated by revenue share')
    expect(l.supplier_name, 'a frozen copy, not a join').toBe('Acme')
  })

  it('a first acceptance supersedes nothing and carries no reason', () => {
    const snap = buildCategorySnapshot({
      category: 'cat1', figureAsUsed: 10, unit: 'mt CO2e', result: result([line()]), acceptedAt: AT,
      reason: 'typed for no reason',
    })
    expect(snap.supersedes_id).toBeNull()
    // ⚠️ DROPPED RATHER THAN SENT AND REFUSED. The table's CHECK allows a reason only beside a
    // supersedes_id, so a reason with nothing to restate would fail the whole insert.
    expect(snap.restatement_reason).toBeNull()
  })

  it('a re-acceptance supersedes the last SAVED snapshot and keeps the reason', () => {
    const snap = buildCategorySnapshot({
      category: 'cat1', figureAsUsed: 12, unit: 'mt CO2e', result: result([line({ value_mt: 12 })]),
      acceptedAt: AT, previousId: 'snap-1', reason: '  supplier restated their allocation  ',
    })
    expect(snap.supersedes_id).toBe('snap-1')
    expect(snap.restatement_reason).toBe('supplier restated their allocation')
  })

  it('an empty or blank reason on a restatement is null, not an empty string', () => {
    for (const reason of [undefined, '', '   ']) {
      const snap = buildCategorySnapshot({
        category: 'cat1', figureAsUsed: 12, unit: 'mt CO2e', result: result([line()]),
        acceptedAt: AT, previousId: 'snap-1', reason,
      })
      expect(snap.restatement_reason, JSON.stringify(reason)).toBeNull()
      expect(isUnreasonedRestatement(snap), 'and it is visible as unreasoned').toBe(true)
    }
  })

  it('a reasoned restatement is not flagged, and a first acceptance never is', () => {
    const reasoned = buildCategorySnapshot({
      category: 'cat1', figureAsUsed: 12, unit: 'mt CO2e', result: result([line()]),
      acceptedAt: AT, previousId: 'snap-1', reason: 'restated',
    })
    expect(isUnreasonedRestatement(reasoned)).toBe(false)
    const first = buildCategorySnapshot({
      category: 'cat1', figureAsUsed: 10, unit: 'mt CO2e', result: result([line()]), acceptedAt: AT,
    })
    expect(isUnreasonedRestatement(first), 'nothing was restated').toBe(false)
  })

  it('carries the uncovered suppliers and currency flags, which are the honest part of the total', () => {
    const snap = buildCategorySnapshot({
      category: 'cat1', figureAsUsed: 10, unit: 'mt CO2e', acceptedAt: AT,
      result: {
        total_mt: 10, lines: [line()],
        uncovered: [{ supplier_id: 's9', supplier_name: 'Beta', reason: 'no figure and no spend' }],
        currency_flags: [{ supplier_id: 's8', supplier_name: 'Gamma', spend: 1000, currency: 'EUR', note: 'not converted' }],
      },
    })
    expect(snap.uncovered).toHaveLength(1)
    expect(snap.currency_flags[0].currency).toBe('EUR')
  })
})

describe('tolerating a schema that is not there yet', () => {
  it('matches exactly the three failures that mean the migration has not run', () => {
    // ⚠️ NARROW ON PURPOSE. Tolerating every error would swallow a real write failure and leave a
    // customer believing the workings behind their figures were recorded when they were not.
    for (const code of ['42P01', '42703', 'PGRST204']) {
      expect(isMissingSnapshotSchema({ code }), code).toBe(true)
    }
    for (const code of ['23505', '42501', 'PGRST116', '', undefined]) {
      expect(isMissingSnapshotSchema({ code }), String(code)).toBe(false)
    }
    expect(isMissingSnapshotSchema(null)).toBe(false)
    expect(isMissingSnapshotSchema(undefined)).toBe(false)
  })
})

describe('the migration and the writer agree', () => {
  const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
  const sql = (() => {
    const f = readdirSync(MIGRATIONS).filter(x => /scope3_category_snapshots/.test(x)).sort().pop()!
    return readFileSync(join(MIGRATIONS, f), 'utf8')
  })()

  it('the table carries a policy in the same file, so it does not join the RLS-with-no-policy list', () => {
    // Six tables in this database have RLS on and no policy, which puts their access rule in code
    // review rather than anywhere a linter can see. This one must not be the seventh.
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('create policy scope3_category_snapshots_owner_select')
    expect(sql).toContain('create policy scope3_category_snapshots_owner_insert')
  })

  it('every policy wraps auth.uid() in a scalar subselect', () => {
    // CLAUDE.md's rule. A bare auth.uid() is STABLE and may be re-evaluated per row; the subselect has
    // no outer reference so the planner hoists it to an InitPlan. A sweep of 84 policies removed the
    // bare form on 21 Sep 2026, and a new policy is exactly where it comes back.
    //
    // ⚠️ MATCHED ON `create policy`, NOT ON THE POLICY NAMES, AND THAT IS THE POINT. An earlier draft
    // anchored with sql.indexOf('create policy scope3_category_snapshots_owner') and sliced from there.
    // Splitting `for all` into a _select and an _insert policy renamed both, so indexOf returned -1,
    // slice(-1) took the file's last character, and the assertion PASSED against an empty string. A
    // test that goes quiet when the thing it guards is renamed is worse than no test: this one counts
    // the policies it found, so a rename fails loudly and a third policy cannot arrive unchecked.
    const policies = [...sql.matchAll(/create policy[\s\S]*?;/g)].map(m => m[0])
    expect(policies, 'one policy per command, select and insert').toHaveLength(2)
    for (const policy of policies) {
      expect(policy).toContain('(select auth.uid())')
      expect(policy.replace(/\(select auth\.uid\(\)\)/g, ''), `bare auth.uid() in: ${policy}`)
        .not.toContain('auth.uid()')
    }
  })

  it('the only bare auth.uid() in the file is the user_id column default', () => {
    // ⚠️ THE DEFAULT IS BARE ON PURPOSE AND THIS TEST IS WHERE THAT IS WRITTEN DOWN, so the next person
    // to grep the file for `auth.uid()` finds the exemption already reasoned about rather than
    // "fixing" it. The initplan rule is about policy PREDICATES, where the planner may re-evaluate a
    // STABLE function per row. A column DEFAULT is evaluated once per inserted row by definition:
    // there is nothing to hoist. The assertion is that this stays the ONLY such line.
    const bare = sql.split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .filter(l => l.replace(/\(select auth\.uid\(\)\)/g, '').includes('auth.uid()'))
    expect(bare.map(l => l.trim())).toEqual([
      'user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,',
    ])
  })

  it('immutability is enforced by the policies and the grants, not by a comment', () => {
    // ⚠️ COMMENTS STRIPPED FIRST, AND THE FIRST DRAFT OF THIS TEST FAILED WITHOUT IT. The file's own
    // header explains that UPDATE and DELETE are deliberately not granted, so a pattern run over the
    // raw text matches the prose describing the rule and reports the rule as broken. Same reason
    // check-sql.py and verifierWhitelist.test.ts both strip comments before matching.
    const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    expect(code).toContain('grant select, insert on public.scope3_category_snapshots to authenticated')
    expect(code, 'no update grant').not.toMatch(/grant[^;]*update[^;]*scope3_category_snapshots/i)
    expect(code, 'no delete grant').not.toMatch(/grant[^;]*delete[^;]*scope3_category_snapshots/i)

    // ⚠️ AND SAID TWICE, IN THE POLICY AS WELL AS THE GRANT, BECAUSE A GRANT IS ONE MIGRATION AWAY FROM
    // WIDENING. `for all` with SELECT-and-INSERT grants reads as immutable but is not: a later
    // `grant update` makes the table mutable with nothing in the policy to stop it, and nothing about
    // that shows up as an error. Two policies named per command mean an UPDATE or a DELETE has no
    // policy at all and is refused whatever the grants say.
    expect(code, 'a select policy').toMatch(/create policy[^;]*for select/)
    expect(code, 'an insert policy').toMatch(/create policy[^;]*for insert/)
    expect(code, 'no for all policy').not.toMatch(/create policy[^;]*for all/)
    expect(code, 'no update policy').not.toMatch(/create policy[^;]*for update/)
    expect(code, 'no delete policy').not.toMatch(/create policy[^;]*for delete/)
  })

  it('declares assurance as a required field, which is what makes an absent key mean anything', () => {
    // ⚠️ THE LOAD-BEARING ASSERTION FOR EVERY SNAPSHOT ALREADY WRITTEN. Snapshots are immutable and are
    // NOT backfilled: a row accepted before this field existed did not carry it, and a snapshot records
    // what was known at acceptance. So a reader distinguishes those rows by the KEY BEING ABSENT, and
    // says "supplier assurance status was not recorded when this figure was accepted" rather than "not
    // assured". That inference holds only while every line written from now on carries the key.
    //   Make either field optional and old rows stop being distinguishable from new ones whose supplier
    // was simply never asked. Nothing would report an error; the record would just start lying quietly.
    const src = readFileSync(join(__dirname, 'categorySnapshot.ts'), 'utf8')
    const iface = src.slice(src.indexOf('export interface SnapshotLine {'), src.indexOf('export interface SnapshotUncovered'))
    expect(iface, 'assurance is not optional').toMatch(/^ {2}assurance: AssuranceState$/m)
    expect(iface, 'the raw answer is not optional either').toMatch(/^ {2}supplier_assurance_raw: string \| null$/m)
    expect(iface, 'and null is how an unanswered question is carried').not.toMatch(/supplier_assurance_raw\?:/)
  })

  it('sets assurance on every line the route can produce', () => {
    // ⚠️ THE TYPE ALONE IS NOT ENOUGH ONCE A THIRD BRANCH APPEARS. tsc catches a line built without the
    // field TODAY because SnapshotLine requires it, but the route could grow a branch that spreads a
    // partial or casts. So count the sites: every lines.push in the route must carry an
    // assuranceForLine spread, and the two numbers must match.
    const route = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'campaigns', '[id]', 'scope3-cat1', 'route.ts'), 'utf8')
    const code = route.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    const pushes = [...code.matchAll(/lines\.push\(/g)].length
    const spreads = [...code.matchAll(/\.\.\.assuranceForLine\(/g)].length
    expect(pushes, 'the route still produces lines').toBeGreaterThan(0)
    expect(spreads, `${pushes} lines.push sites, ${spreads} assuranceForLine spreads`).toBe(pushes)
  })

  it('carries the line fields through to the snapshot untouched', () => {
    // buildCategorySnapshot passes result.lines by reference, so a field the route adds arrives here
    // without a change in the builder. That is deliberate, and it means the guard above is the one that
    // has to hold: nothing in the builder would notice a line missing the key.
    const l = line({ supplier_assurance_raw: 'No — internal only', assurance: 'internal_only' })
    const snap = buildCategorySnapshot({ category: 'cat1', figureAsUsed: 10, unit: 'mt CO2e', result: result([l]), acceptedAt: AT })
    expect(snap.lines[0].assurance).toBe('internal_only')
    expect(snap.lines[0].supplier_assurance_raw).toBe('No — internal only')
  })

  it('has one foreign key to a parent, and none to the supplier tables', () => {
    // An FK to campaign_suppliers would inherit its cascade and delete the evidence for a figure
    // still sitting in a filed report.
    expect(sql).toContain('references public.scope3_inventories(id) on delete cascade')
    expect(sql).not.toContain('references public.campaign_suppliers')
    expect(sql).not.toContain('references public.supplier_campaigns')
  })

  it('constrains a reason to a restatement, and only in that direction', () => {
    expect(sql).toContain('check (restatement_reason is null or supersedes_id is not null)')
    expect(sql, 'restatement_reason is nullable with no default')
      .not.toMatch(/restatement_reason\s+text\s+(not null|default)/i)
  })

  // ⚠️ RESOLVED BY WHICH FILE SETS THE COMMENT LAST, NOT BY THE FILE THAT CREATED THE TABLE. `comment
  // on` REPLACES rather than appends, so the newest file carrying this statement holds the entire
  // column comment and every earlier one contributes nothing. Pinning the original file would test
  // text the database no longer has, and would pass while the live comment had lost half its content.
  const linesComment = (() => {
    const needle = 'comment on column public.scope3_category_snapshots.lines is'
    const f = readdirSync(MIGRATIONS)
      .filter(x => x.endsWith('.sql') && readFileSync(join(MIGRATIONS, x), 'utf8').includes(needle))
      .sort().pop()
    expect(f, 'some migration sets the lines comment').toBeDefined()
    const src = readFileSync(join(MIGRATIONS, f!), 'utf8')
    const raw = src.slice(src.indexOf(needle))
    // ⚠️ ASSERTED AGAINST THE COMMENT'S VALUE, NOT ITS SOURCE FORMATTING, and the first draft of the
    // test below failed for exactly that reason: the phrase it looked for was split across two adjacent
    // SQL string literals, so it was present in the comment Postgres stores and absent from the file as
    // written. Reflowing the SQL to fit 100 columns would otherwise break tests that care about wording
    // and not about line breaks. Adjacent literals are joined and SQL's doubled quote is unescaped, so
    // what is matched here is what a reader of the column comment sees.
    const text = raw
      .replace(/'\s*\n\s*'/g, '')
      .replace(/''/g, "'")
    return { file: f!, text }
  })()

  it('the effective lines comment still says why supplier_name is a frozen copy', () => {
    // So a later reader does not "fix" it into a foreign key and reintroduce the cascade. ⚠️ THIS IS
    // ALSO THE GUARD ON THE REPLACE-NOT-APPEND TRAP: a comment migration that adds a paragraph and
    // forgets to restate these sentences deletes them from the database, silently and permanently.
    expect(linesComment.text, `set by ${linesComment.file}`).toContain('FROZEN COPY, NOT A FOREIGN KEY')
    expect(linesComment.text).toContain('Do not "fix" this into a foreign key')
    expect(linesComment.text, 'and says basis is a rendering rather than the authority').toContain('`basis` IS A RENDERING')
  })

  it('the effective lines comment tells a SQL reader that an absent assurance key is not a no', () => {
    // ⚠️ THE ONE PLACE THIS RULE REACHES SOMEONE IN THE SQL EDITOR. It is enforced in TypeScript and by
    // tests, none of which is visible to a person writing a query against this table next year. What
    // they see is rows where some lines carry the key and some do not, with the wrong inference
    // immediately available. The table is immutable and these rows are never backfilled, so the
    // ambiguity is permanent and the note has to be too.
    expect(linesComment.text).toContain('ACCEPTED BEFORE THIS FIELD EXISTED')
    expect(linesComment.text).toContain('IT DOES NOT MEAN "NOT ASSURED"')
    expect(linesComment.text, 'names both absence states so the key-present test makes sense')
      .toMatch(/not_asked[\s\S]*not_answered/)
    expect(linesComment.text, 'and gives the filter that excludes spend-based lines')
      .toMatch(/assurance in \('limited', 'reasonable'\)/)
    expect(linesComment.text, 'and never claims a figure is assured')
      .toContain('never "this figure is assured"')
  })

  it('the comment migration changes nothing but comments', () => {
    // A comment-only file that quietly carries DDL is how a schema change arrives unreviewed.
    const src = readFileSync(join(MIGRATIONS, linesComment.file), 'utf8')
    const code = src.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    if (!/create table/i.test(code)) {
      for (const verb of [/\bcreate\s+(table|policy|index|function)/i, /\balter\s+table/i,
                          /\bdrop\b/i, /\bgrant\b/i, /\brevoke\b/i, /\binsert\s+into/i, /\bupdate\s+/i]) {
        expect(code, `${verb} in a comment-only migration`).not.toMatch(verb)
      }
    }
  })

  it('adds the pointer column as not null with a default, like scope3_coverage', () => {
    expect(sql).toContain("add column if not exists cat_snapshot_ids jsonb not null default '{}'::jsonb")
  })
})
