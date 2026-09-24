import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  SUPPLIER_STATUS, noFigureReasonForStatus, supplierStatusLabel, supplierStatusTone,
  type SupplierStatus,
} from './supplierStatus'

// ── WHAT A VERIFIER IS TOLD ABOUT A SUPPLIER WHO CONTRIBUTED NOTHING ────────────────────────────
//
// The reason string here is frozen into scope3_category_snapshots.uncovered at acceptance and cannot be
// corrected in place afterwards, so it has to be right before it is written rather than after. These
// protect two things: that the database enum never reaches prose again, and that one authority serves
// both the badge and the sentence.

const ALL: SupplierStatus[] = ['invited', 'in_progress', 'completed', 'expired']
const ROOT = join(__dirname, '..', '..')

describe('the four statuses the database permits', () => {
  it('are exactly the four the CHECK constraint names', () => {
    // ⚠️ READ OUT OF THE SCHEMA DUMP, AND THE DUMP IS THE ONLY SOURCE IN GIT. campaign_suppliers is
    // created by 20260618_supplier_portal_schema.sql, but that file declares `status text NOT NULL
    // DEFAULT 'invited'` with NO CHECK: `campaign_suppliers_status_check` appears in no migration at
    // all and exists only in the live database. So this is the DB-only schema problem CLAUDE.md
    // describes, applied to a constraint rather than a table, and db/dumps is the only place in the
    // repository that records which four values are permitted.
    //   ⚠️ WHICH MEANS THIS TEST IS ONLY AS FRESH AS THE NEWEST DUMP. If the constraint is widened in
    // the database and no dump is taken, this keeps passing against a stale list. It is still worth
    // having: it catches the case where someone adds a fifth status to this module without a label and
    // a sentence, and it fails loudly if the dump ever disappears rather than skipping.
    const dumps = join(ROOT, 'db', 'dumps')
    const newest = readdirSync(dumps).filter(f => /^schema_public_.*\.sql$/.test(f)).sort().pop()!
    const sql = readFileSync(join(dumps, newest), 'utf8')
    const table = sql.slice(sql.indexOf('CREATE TABLE public.campaign_suppliers'))
    const check = /campaign_suppliers_status_check CHECK \(\(status = ANY \(ARRAY\[([^\]]+)\]\)\)\)/.exec(table)
    expect(check, `no status CHECK found in ${newest}`).not.toBeNull()
    const permitted = [...check![1].matchAll(/'([a-z_]+)'::text/g)].map(m => m[1]).sort()
    expect(Object.keys(SUPPLIER_STATUS).sort(), `against ${newest}`).toEqual(permitted)
  })

  it('each has a badge label and a whole sentence, and they are not the same string', () => {
    for (const s of ALL) {
      expect(SUPPLIER_STATUS[s].label, `${s} label`).toBeTruthy()
      expect(SUPPLIER_STATUS[s].noFigureReason, `${s} ends as a sentence`).toMatch(/\.$/)
      expect(SUPPLIER_STATUS[s].noFigureReason, `${s} sentence is not the badge label`)
        .not.toBe(SUPPLIER_STATUS[s].label)
    }
  })
})

describe('the reason a verifier reads', () => {
  it('never contains a machine token, and the check is not a substring test', () => {
    // ⚠️ THE DEFECT THIS FILE EXISTS FOR. `Questionnaire ${s.status}` put "Questionnaire in_progress"
    // into the uncovered reason, and every acceptance froze it into an immutable snapshot.
    //
    // ⚠️ MATCHED AS snake_case, NOT AS THE STATUS VALUE. The first draft asserted the sentence does not
    // CONTAIN its own status name, and it failed on 'expired' — because "The questionnaire invitation
    // expired" is correct English that happens to contain the enum. The test was wrong, not the copy.
    // What made the old string machine-facing was the UNDERSCORE, so that is what to forbid.
    for (const s of ALL) {
      const out = noFigureReasonForStatus(s)
      expect(out, `${s} contains a snake_case token`).not.toMatch(/[a-z]+_[a-z]+/)
      expect(out, `${s} reproduces the old "Questionnaire <status>" shape`)
        .not.toMatch(/Questionnaire (invited|in_progress|completed|expired)\b/)
    }
  })

  it('carries no em-dash or arrow', () => {
    for (const s of ALL) expect(noFigureReasonForStatus(s)).not.toMatch(/[—–→←]/)
  })

  it('says both halves: no figure from the supplier and no spend from the buyer', () => {
    // A verifier needs to know the line is absent for BOTH reasons, not just the questionnaire one.
    // This branch of the route is reached only when neither is present.
    for (const s of ALL) {
      expect(noFigureReasonForStatus(s), `${s} names the missing figure`).toMatch(/allocated (emissions )?figure/)
      expect(noFigureReasonForStatus(s), `${s} names the missing spend`).toMatch(/spend/)
    }
  })

  it('offers "yet" only where asking again the same way could change the answer', () => {
    // The copy rule: "yet" implies a route to a different outcome. A reminder can still produce a figure
    // from a supplier who has not opened or not submitted. One who submitted without a figure, or whose
    // invitation expired, will not answer differently for being sent the same link again.
    expect(noFigureReasonForStatus('invited')).toContain('yet')
    expect(noFigureReasonForStatus('in_progress')).toContain('yet')
    expect(noFigureReasonForStatus('completed'), 'they answered; asking again changes nothing').not.toContain('yet')
    expect(noFigureReasonForStatus('expired'), 'that invitation is spent').not.toContain('yet')
  })

  it('reports an unrecognised status as given rather than interpreting it', () => {
    // Same treatment an off-list supplier answer gets. Unreachable while the CHECK holds, which is
    // exactly why it is tested: nobody exercises this branch by using the product.
    const out = noFigureReasonForStatus('archived')
    expect(out).toContain('recorded as "archived"')
    expect(out).toContain('not a status this platform recognises')
    expect(out, 'and still says what is missing').toContain('No allocated figure and no spend')
  })
})

describe('one authority, read by both surfaces', () => {
  it('the route builds the reason here and interpolates no status of its own', () => {
    const src = readFileSync(join(ROOT, 'app', 'api', 'campaigns', '[id]', 'scope3-cat1', 'route.ts'), 'utf8')
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(code, 'the reason comes from the shared module').toContain('noFigureReasonForStatus(s.status)')
    expect(code, 'no template literal interpolates a status into prose').not.toMatch(/`[^`]*\$\{s\.status\}[^`]*`/)
  })

  it('the buyer campaign screen holds no second copy of the labels', () => {
    // ⚠️ THE FIX WAS NOT A TRANSLATION, IT WAS REACH. The labels existed; the route could not import a
    // const declared inside a client page. A second copy beside the route would have fixed the symptom
    // and seeded the next drift.
    const src = readFileSync(join(ROOT, 'app', 'dashboard', 'supply-chain', 'portal', '[id]', 'page.tsx'), 'utf8')
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(code, 'STATUS_CONFIG is gone from the page').not.toMatch(/const STATUS_CONFIG\s*=/)
    expect(code, 'and the labels come from the module').toContain('supplierStatusLabel(s.status)')
    // ⚠️ THE BADGE MAP, NOT EVERY OCCURRENCE OF THE WORDS. A first draft forbade the label strings
    // anywhere in the file and failed on the summary tiles, which read
    // `{ label: 'Completed' }` and `{ label: 'In progress' }` beside `{ label: 'Awaiting response' }`.
    // Those are STAT labels, not status names: "Awaiting response" is better copy for a count than
    // "Invited" would be, and forcing the tiles through this module would either regress that wording or
    // make the module carry a third register for one screen. So what is forbidden is a map KEYED BY THE
    // ENUM, which is the thing that drifts.
    expect(code, 'no object keyed by the status enum remains in the page')
      .not.toMatch(/\bin_progress\s*:\s*\{/)
  })

  it('gives an unrecognised status a muted badge rather than a normal-looking one', () => {
    expect(supplierStatusLabel('archived'), 'shown as given').toBe('archived')
    expect(supplierStatusTone('archived')).toEqual({ color: 'var(--color-ink-muted)', bg: '#f8f7f5' })
    expect(supplierStatusTone('completed')).toEqual({ color: '#0F6E56', bg: '#E1F5EE' })
  })
})
