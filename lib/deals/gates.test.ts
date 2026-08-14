import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveWizardGate, resolveReportGate,
  type FreeTierDeal, type SessionState, type WizardGate,
} from './gates'
import { parseDealDraft, DEAL_DRAFT_KEY } from './draft'
import type { EntitlementAccess } from '../useEntitlement'

// ── THE FIVE GATE STATES, ASSERTED ───────────────────────────────────────────────────────────────
//
// These decisions used to live inline in three React components, in a repo with NO DOM HARNESS —
// no jsdom, no testing-library, `npm test` is a bare `vitest run` in the node environment. So the
// only way to know what a gate did was to read the page, and two of the three had already stopped
// agreeing: app/dashboard/deals/page.tsx carried a comment asserting that /dashboard/deals/report is
// "FULLY WALLED on this same entitlement", and it never was — the report deliberately lets a free
// reader open their own deal. A claim like that survives precisely because nothing can contradict it.
//
// Extracting the rule into pure functions is what makes these assertions possible at all. The pages
// now render the outcome; the textual guards at the bottom of this file are what stop a second copy
// of the rule growing back beside it.
//
// ⚠️ THESE TESTS ARE ABOUT WHAT THE CLIENT SHOWS, NOT ABOUT WHAT IT PERMITS. The authority for one
// free saved deal is enforce_deals_free_tier_cap(), a SECURITY DEFINER trigger on the database's own
// clock. Nothing here is enforcement, and a test passing here is not evidence that the cap holds.

const ACCESSES: EntitlementAccess[] = ['loading', 'active', 'expired', 'none', 'unknown']
const SESSIONS: SessionState[] = ['loading', 'anon', 'authed']

const saved = (id = 'deal-1', name = 'Acme Bidco'): FreeTierDeal => ({ state: 'saved', id, name })
const none: FreeTierDeal = { state: 'none' }
const loadingDeal: FreeTierDeal = { state: 'loading' }

const wizard = (
  access: EntitlementAccess, session: SessionState, savedDeal: FreeTierDeal, dealIdParam: string | null = null,
): WizardGate => resolveWizardGate({ access, session, savedDeal, dealIdParam })

describe('W. the wizard gate', () => {
  // ── STATE 1: SIGNED OUT ────────────────────────────────────────────────────────────────────
  it('W1 signed out — the form is open and the results are NOT', () => {
    // THE CHANGE THIS FILE EXISTS FOR. A signed-out visitor could previously run a full screen and
    // read every finding without an account: `walled` was false for them (nothing saved), and
    // nothing else gated the render. The form stays open — the engine is pure and client-side and
    // always has been — but the deliverable is now behind a session.
    const g = wizard('none', 'anon', none)
    expect(g).toEqual({ kind: 'open', results: 'hidden' })
  })

  it('W2 signed out with a saved deal is NOT a state the wall can reach', () => {
    // Defensive: `savedDeal` resolves to 'none' for a session-less visitor because the lookup is
    // owner-scoped and never runs. If some future load path ever hands this combination in, the
    // visitor must still be asked to sign in rather than shown someone's deal name in a wall.
    const g = wizard('none', 'anon', saved())
    expect(g).toEqual({ kind: 'open', results: 'hidden' })
  })

  // ── STATE 2: SIGNED IN, NO ENTITLEMENT, NOTHING SAVED ──────────────────────────────────────
  it('W3 signed in, never purchased, no saved deal — full results, no wall', () => {
    // The free deal. This is the state the whole free tier exists to serve, and it must not be
    // walled or degraded: one target, screened end to end, with every finding.
    expect(wizard('none', 'authed', none)).toEqual({ kind: 'open', results: 'shown' })
  })

  // ── STATE 3: SIGNED IN, NO ENTITLEMENT, ONE SAVED DEAL ─────────────────────────────────────
  it('W4 signed in, never purchased, one saved deal — walled, and the wall carries the way back', () => {
    const g = wizard('none', 'authed', saved('d7', 'Northwind'))
    expect(g).toEqual({ kind: 'walled', reason: 'free-deal-used', dealId: 'd7', dealName: 'Northwind' })
  })

  it('W5 ...but opening THAT deal is exempt — the trigger is BEFORE INSERT, so edits are permitted', () => {
    // The client must not enforce a stricter rule than the database. An UPDATE never reaches the
    // cap, so walling the edit path would lock someone out of work the server would happily accept.
    expect(wizard('none', 'authed', saved('d7'), 'd7')).toEqual({ kind: 'open', results: 'shown' })
    // Keyed on the URL PARAM, not on which deal it names: any id suppresses the wall, and the
    // trigger refuses the insert if it turns out to be bogus. Pinned because it looks like a bug.
    expect(wizard('none', 'authed', saved('d7'), 'some-other-id')).toEqual({ kind: 'open', results: 'shown' })
  })

  // ── STATE 4: ENTITLED AND IN TERM ──────────────────────────────────────────────────────────
  it('W6 active entitlement — never walled, whatever is saved', () => {
    expect(wizard('active', 'authed', none)).toEqual({ kind: 'open', results: 'shown' })
    expect(wizard('active', 'authed', saved())).toEqual({ kind: 'open', results: 'shown' })
  })

  // ── STATE 5: ENTITLED BUT EXPIRED ──────────────────────────────────────────────────────────
  it('W7 EXPIRED with a saved deal — walled, and told it expired rather than that they used a free deal', () => {
    // THE TERM-AWARENESS FIX. Before it, `isPaid` was true for an expired customer, so this
    // returned "open" and the customer met the cap only when a save failed against the trigger —
    // whose FIRST test is `term_end > now()`. Client and trigger now agree.
    const g = wizard('expired', 'authed', saved('d9', 'Cinnabar'))
    expect(g).toEqual({ kind: 'walled', reason: 'expired', dealId: 'd9', dealName: 'Cinnabar' })
  })

  it('W8 EXPIRED keeps editing saved deals, and keeps a clean screen when nothing is saved', () => {
    // The trigger deletes nothing and blocks no UPDATE; an expired customer keeps every deal and
    // can still work on it. Only a NEW one is refused.
    expect(wizard('expired', 'authed', saved('d9'), 'd9')).toEqual({ kind: 'open', results: 'shown' })
    expect(wizard('expired', 'authed', none)).toEqual({ kind: 'open', results: 'shown' })
  })

  // ── THE FAILED READ ────────────────────────────────────────────────────────────────────────
  it('W9 unknown — fails closed, and claims NOTHING about the account', () => {
    // 'unknown' means the entitlement read failed. It walls (fails closed, like every other
    // consumer) but must not pick either message: both assert a fact that was never established.
    const g = wizard('unknown', 'authed', saved('d3', 'Vega'))
    expect(g).toEqual({ kind: 'walled', reason: 'unknown', dealId: 'd3', dealName: 'Vega' })
  })

  // ── LOADING ────────────────────────────────────────────────────────────────────────────────
  it('W10 ANY unresolved fact yields loading — a default is not an answer', () => {
    // Exhaustive over the three inputs rather than three hand-picked cases: the failure this
    // prevents is someone adding a fact and forgetting one of its unresolved combinations.
    for (const access of ACCESSES) {
      for (const session of SESSIONS) {
        for (const savedDeal of [loadingDeal, none, saved()]) {
          const unresolved = access === 'loading' || session === 'loading' || savedDeal.state === 'loading'
          const g = wizard(access, session, savedDeal)
          if (unresolved) {
            expect(g.kind, `${access}/${session}/${savedDeal.state}`).toBe('loading')
          } else {
            expect(g.kind, `${access}/${session}/${savedDeal.state}`).not.toBe('loading')
          }
        }
      }
    }
  })

  it('W11 no combination yields a wall without the id and name the wall needs', () => {
    // The wall's only route back to the user's own deal is that id — /dashboard/deals/list is fully
    // walled on the same entitlement, and there is no nav entry or search. A walled arm with a
    // blank id would strand someone's work behind a cap they cannot clear.
    for (const access of ACCESSES) {
      for (const session of SESSIONS) {
        for (const dealIdParam of [null, 'x']) {
          const g = wizard(access, session, saved('id-1', 'Named'), dealIdParam)
          if (g.kind === 'walled') {
            expect(g.dealId, `${access}/${session}`).toBe('id-1')
            expect(g.dealName, `${access}/${session}`).toBe('Named')
          }
        }
      }
    }
  })

  it('W12 results are hidden ONLY when signed out — never as a side effect of entitlement', () => {
    // The free tier's promise: an account, not a purchase, is what unlocks the findings. If this
    // ever fails, someone has made the results a paid feature.
    for (const access of ACCESSES) {
      for (const savedDeal of [none, saved()]) {
        const g = wizard(access, 'authed', savedDeal, 'edit-id')
        if (g.kind === 'open') expect(g.results, `${access}`).toBe('shown')
      }
    }
  })
})

// ── THE REPORT GATE ─────────────────────────────────────────────────────────────────────────────
const report = (
  access: EntitlementAccess, session: SessionState,
  freeTierDealId: string | null, requestedId: string | null, freeTierResolved = true,
) => resolveReportGate({ access, session, freeTierDealId, freeTierResolved, requestedId })

describe('R. the report gate', () => {
  it('R1 the free deal opens its OWN report, in full', () => {
    // Identity, not count. Gating the whole report on entitlement meant a free deal could be
    // screened end to end and then produce nothing to take away.
    expect(report('none', 'authed', 'd1', 'd1')).toEqual({ kind: 'open', upsell: 'never-purchased' })
  })

  it('R2 ...and a DIFFERENT deal is paywalled', () => {
    expect(report('none', 'authed', 'd1', 'd2')).toEqual({ kind: 'paywalled' })
  })

  it('R3 an expired customer keeps the report AND gets the expired upsell', () => {
    expect(report('expired', 'authed', 'd1', 'd1')).toEqual({ kind: 'open', upsell: 'expired' })
  })

  it('R4 an ACTIVE customer opens any of their reports and is sold NOTHING', () => {
    // The constraint that matters commercially: the upsell must never appear to someone who has
    // already bought. Asserted on both the matching and the non-matching id, because an entitled
    // reader is not scoped to their newest deal at all.
    expect(report('active', 'authed', 'd1', 'd1')).toEqual({ kind: 'open', upsell: 'none' })
    expect(report('active', 'authed', 'd1', 'd2')).toEqual({ kind: 'open', upsell: 'none' })
    expect(report('active', 'authed', null, 'd9')).toEqual({ kind: 'open', upsell: 'none' })
  })

  it('R5 a failed entitlement read sells nothing either', () => {
    // 'unknown' reaches the report only on an id match, so the reader owns the deal — but we do not
    // know what they hold, and both messages would assert something unestablished.
    expect(report('unknown', 'authed', 'd1', 'd1')).toEqual({ kind: 'open', upsell: 'none' })
  })

  it('R6 signed out is its own arm — never the paywall', () => {
    // A signed-out reader's problem is that they are signed out. Showing them "unlock the Deals
    // module" would name a cause that has not been established, and sell to someone who may
    // already own it.
    for (const access of ACCESSES.filter(a => a !== 'loading')) {
      expect(report(access, 'anon', null, 'd1').kind, access).toBe('signed-out')
    }
  })

  it('R7 nothing resolves before every fact is in — and the scope null/unresolved split holds', () => {
    expect(report('loading', 'authed', 'd1', 'd1').kind).toBe('loading')
    expect(report('none', 'loading', 'd1', 'd1').kind).toBe('loading')
    // An UNRESOLVED scope is not "they have no free deal". Collapsing the two would paywall a
    // report the reader is entitled to, mid-load, on a page that gets printed.
    expect(report('none', 'authed', null, 'd1', false).kind).toBe('loading')
    expect(report('none', 'authed', null, 'd1', true).kind).toBe('paywalled')
  })

  it('R8 a null requested id can never match a null scope', () => {
    // Both null must NOT read as "this is your free deal". null === null is true in JS, and that
    // would open every report to a user who has saved nothing.
    expect(report('none', 'authed', null, null)).toEqual({ kind: 'paywalled' })
  })

  it('R9 upsell is non-none ONLY where the reader is unentitled and reading their own free deal', () => {
    for (const access of ACCESSES.filter(a => a !== 'loading')) {
      for (const [scope, req] of [['d1', 'd1'], ['d1', 'd2'], [null, 'd1']] as const) {
        const g = report(access, 'authed', scope, req)
        if (g.kind === 'open' && g.upsell !== 'none') {
          expect(access === 'expired' || access === 'none', `${access}`).toBe(true)
          expect(scope, `${access}`).toBe(req)
        }
      }
    }
  })
})

// ── THE DRAFT THAT SURVIVES THE LOGIN BOUNCE ────────────────────────────────────────────────────
describe('D. the wizard draft', () => {
  it('D1 a round trip preserves every field, including a declared zero and an explicit null', () => {
    // employee_count and total_assets sit in NULLABLE columns precisely so undeclared stays distinct
    // from a declared zero. If the round trip collapses either, a holding company with 0 employees
    // comes back as "not known" and its CS3D limb silently stops being evaluated.
    const draft = {
      target_name: 'Acme', sector: 'Technology', revenue: 0,
      employee_count: 0, total_assets: null,
      jurisdiction: 'UK', deal_type: 'pe', deal_value: 12_000_000,
      location_count: 4, currency: 'GBP', has_ghg_data: false, has_esg_report: true, notes: '',
    }
    expect(parseDealDraft(JSON.stringify(draft))).toEqual(draft)
  })

  it('D2 garbage is dropped rather than adopted', () => {
    expect(parseDealDraft(null)).toBeNull()
    expect(parseDealDraft('')).toBeNull()
    expect(parseDealDraft('not json')).toBeNull()
    expect(parseDealDraft('[]')).toBeNull()
    expect(parseDealDraft('"a string"')).toBeNull()
    expect(parseDealDraft('{}')).toBeNull()
    // Every field present but wrongly typed ⇒ nothing survives ⇒ null, not an empty draft. An empty
    // draft would have the wizard announce it restored work it did not restore.
    expect(parseDealDraft(JSON.stringify({ target_name: 5, revenue: 'lots', has_ghg_data: 'yes' }))).toBeNull()
  })

  it('D3 an unknown key is dropped, not carried into the save payload', () => {
    // The draft survives a deploy. A key from an older build riding into React state and then into
    // handleSave's row would have Postgres refuse the whole save.
    const out = parseDealDraft(JSON.stringify({ target_name: 'Acme', legacy_field: 'x', id: 'not-yours' }))
    expect(out).toEqual({ target_name: 'Acme' })
  })

  it('D4 non-finite numbers are rejected — NaN and Infinity are corruption, not emptiness', () => {
    // JSON.stringify turns both into null, so this is what actually arrives.
    expect(parseDealDraft(JSON.stringify({ revenue: NaN, deal_value: Infinity, target_name: 'A' })))
      .toEqual({ target_name: 'A' })
  })

  it('D5 the storage key is namespaced like checkout.ts, and is not the share-link "token"', () => {
    // `token` already means the target-facing share link at /deals/[token]. A draft key that read
    // like one would invite the two to be confused.
    expect(DEAL_DRAFT_KEY).toBe('themisiq:pendingDeal')
    expect(DEAL_DRAFT_KEY.startsWith('themisiq:')).toBe(true)
    expect(DEAL_DRAFT_KEY).not.toContain('token')
  })
})

// ── THE PAGES RENDER THE RESOLVER AND HOLD NO SECOND COPY OF THE RULE ───────────────────────────
//
// The header invariant, enforced. Everything above tests the resolver; none of it can tell whether a
// page still decides for itself, and that is exactly how the "FULLY WALLED" claim survived. Textual,
// because this repo has no DOM harness — the same technique lib/ghg/gridDisplay.test.ts uses.
describe('S. the surfaces defer to the resolver', () => {
  const ROOT = process.cwd()
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  const WIZARD = 'app/dashboard/deals/page.tsx'
  const REPORT = 'app/dashboard/deals/report/page.tsx'
  const LIST = 'app/dashboard/deals/list/page.tsx'

  it('S1 the wizard and the report call the resolver', () => {
    expect(read(WIZARD)).toContain('resolveWizardGate({')
    expect(read(REPORT)).toContain('resolveReportGate({')
  })

  it('S2 no Deals surface reads the term-blind useEntitlementState', () => {
    // THE REGRESSION THIS GUARDS. `isPaid` is TRUE for an expired customer by contract with its
    // seventeen callers, so a surface that reverts to it silently stops agreeing with the trigger
    // — which is the exact defect these three changes closed, and it compiles cleanly.
    for (const f of [WIZARD, REPORT, LIST]) {
      expect(read(f), `${f} must read useEntitlementAccess`).toContain('useEntitlementAccess')
      const src = read(f).split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      expect(src.join('\n'), `${f} must not call useEntitlementState`).not.toContain('useEntitlementState(')
    }
  })

  it('S3 the wizard does not re-derive the wall inline', () => {
    // The old expression, and any restatement of its shape. It read
    // `!isPaid && savedDeal.state === 'saved' && !dealIdParam` — three facts combined in a
    // component, unreachable by any test.
    const src = read(WIZARD)
    expect(src).not.toContain("savedDeal.state === 'saved' && !dealIdParam")
    expect(src, 'the wall must read the resolver output, not the raw state').not.toContain('const walled =')
  })

  it('S4 the report page does not re-derive freeDealAllowed inline', () => {
    expect(read(REPORT)).not.toContain('const freeDealAllowed =')
  })

  it('S5 the upsell is print-suppressed and points where the paywall points', () => {
    // A "buy ThemisIQ" panel inside a saved PDF travels with the document to counterparties and
    // investment committees. Both facts are asserted on the same line-set so a future edit cannot
    // move the block out of `.no-print` while keeping the link.
    const src = read(REPORT)
    // ⚠️ AMBIGUITY IS AN ERROR, NOT A COIN-FLIP — the rule lib/ghg/gridDisplay.test.ts already
    // carries. The first draft of this test closed the slice on 'ThemisIQ Compliance Inc.', which
    // appears THREE times in this file and first at the cover block, hundreds of lines ABOVE the
    // upsell. indexOf picked that one, start > end, and the slice came back EMPTY — so every
    // assertion below passed against nothing. A guard that silently measures the wrong region is
    // worse than one that finds none, so both ends are pinned and the start is checked.
    const start = src.indexOf("{upsell !== 'none' && (")
    expect(start, 'the upsell block moved or was renamed').toBeGreaterThan(-1)
    const end = src.lastIndexOf('ThemisIQ Compliance Inc.')     // the FOOTER line, not the cover
    expect(end, 'the report footer must follow the upsell').toBeGreaterThan(start)
    const block = src.slice(start, end)
    expect(block.length, 'the upsell block is empty').toBeGreaterThan(200)
    expect(block, 'the upsell must not print').toContain('className="no-print"')
    expect(block, 'same destination as the PaywallCard on this page').toContain('/pricing?modules=deals')
    expect(block, '/order was considered and rejected — one commercial route out of this module').not.toContain('/order')
  })

  it('S6 the wizard actually GATES on the resolver, not just calls it', () => {
    // ⚠️ FOUND BY MUTATION, AND IT IS THE GAP THIS WHOLE FILE COULD OTHERWISE HAVE. Replacing the
    // wizard's `resultsShown` with a literal `true` left all thirty-one other tests green: the
    // resolver still returned 'hidden' and was still asked, and nothing noticed that the page had
    // stopped listening. A pure resolver is only worth what its call site does with the answer, and
    // with no DOM harness the call site can only be checked textually.
    const src = read(WIZARD)

    // Derived FROM the gate, not hardcoded. Catches `= true`, `= false`, and any constant.
    expect(src, 'resultsShown must derive from the gate')
      .toContain("const resultsShown = gate.kind !== 'open' || gate.results === 'shown'")

    // And the three render sites that consume it. Named individually rather than counted, so a
    // failure says WHICH block stopped being gated.
    expect(src, 'step 1 findings must be withheld').toContain('{resultsShown && <>')
    expect(src, 'the sign-in prompt must replace them').toContain('{!resultsShown && signInPrompt()}')
    expect(src, 'the data-room GAPS panel is a finding')
      .toContain('{resultsShown && (!deal.has_ghg_data || !deal.has_esg_report) && (')
    expect(src, 'steps 2-4 are findings end to end')
      .toContain('steps[step].findingsOnly && !resultsShown ? signInPrompt() : steps[step].render()')

    // The step table is where a sixth step has to be registered, and `findingsOnly` is required by
    // its type — so a new step cannot default quietly into being ungated.
    //
    // ⚠️ THE END ANCHOR IS THE ARRAY'S CLOSING BRACKET, NOT THE FIRST ']'. The first draft sliced to
    // indexOf(']'), which landed inside the TYPE ANNOTATION — `{ … }[]` — and measured an empty
    // table that every assertion then failed against. Anchored on the newline-indented bracket that
    // closes the literal.
    const start = src.indexOf('const steps: {')
    expect(start, 'the step table moved or was renamed').toBeGreaterThan(-1)
    const end = src.indexOf('\n  ]', start)
    expect(end, 'the step table is not closed where expected').toBeGreaterThan(start)
    const table = src.slice(start, end)
    expect(table, 'step 0 is pure input').toContain('render: renderStep0, findingsOnly: false')
    expect(table, 'step 1 is mixed and gates internally').toContain('render: renderStep1, findingsOnly: false')
    for (const s of ['renderStep2', 'renderStep3', 'renderStep4']) {
      expect(table, `${s} is findings-only`).toContain(`render: ${s}, findingsOnly: true`)
    }
  })

  it('S7 no draft copy can ship as final — the placeholders are gone and must stay gone', () => {
    // ⚠️ THIS ASSERTION WAS INVERTED WHEN THE FINAL COPY LANDED, and the intent is unchanged: no
    // stand-in may reach a customer. While copy was outstanding it asserted the placeholders were
    // still PRESENT, so a plausible-reading draft could not survive review; that guard fired
    // correctly on the commit that replaced them. Now that every branch carries approved copy, the
    // same intent runs the other way — a placeholder reappearing is the regression.
    // ⚠️ PERMANENT, NOT SCAFFOLDING. The original direction was temporary by construction and had a
    // date it stopped being true; this one does not. It is the standing guard that no bracketed
    // stand-in ever reaches a customer on either Deals surface, and it should outlive this commit.
    for (const f of [WIZARD, REPORT]) {
      const placeholders = read(f).match(/\[PLACEHOLDER[^\]]*\]/g) ?? []
      expect(placeholders, `${f} must carry no placeholder copy`).toEqual([])
    }
  })
})
