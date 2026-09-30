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
  it('W1 signed out — screening and findings are shown, the cost estimate is NOT', () => {
    // ⚠️ THIS ASSERTION HAS NOW BEEN THREE THINGS, AND THE HISTORY IS THE POINT.
    //   before 291bd3c   a signed-out visitor ran a full screen and read every finding, including the
    //                    cost estimate, with no account. Nothing gated the render at all.
    //   291bd3c          ALL findings withheld: results: 'hidden'. The reasoning was that the five
    //                    findings blocks are the deliverable and the free tier trades them for an
    //                    account.
    //   26 Sep 2026      results: 'partial'. Withholding the screening meant a visitor could not see
    //                    that the tool does anything, so the screening (step 2) and the risk findings
    //                    (step 3) are shown as proof, and the COST ESTIMATE (step 4) plus saving are
    //                    what the account buys. The report export stays behind the module.
    // The middle state is the one this line replaces; 'hidden' is still in the union and nothing
    // returns it.
    const g = wizard('none', 'anon', none)
    expect(g).toEqual({ kind: 'open', results: 'partial' })
  })

  it('W2 signed out with a saved deal is NOT a state the wall can reach', () => {
    // Defensive: `savedDeal` resolves to 'none' for a session-less visitor because the lookup is
    // owner-scoped and never runs. If some future load path ever hands this combination in, the
    // visitor must still get the anon treatment rather than be shown someone's deal name in a wall.
    const g = wizard('none', 'anon', saved())
    expect(g).toEqual({ kind: 'open', results: 'partial' })
  })

  it('W1b nothing returns results: \'hidden\' any more, across every input combination', () => {
    // ⚠️ THE UNION STILL CARRIES 'hidden' AND NOTHING PRODUCES IT. That is deliberate — see the note on
    // WizardGate — but an unreachable member is exactly the kind of thing that gets "restored" by
    // someone reading the type and assuming a branch is missing. This pins that its absence is the
    // decision, so reintroducing it fails here and has to be argued for.
    for (const access of ACCESSES) {
      for (const session of SESSIONS) {
        for (const sd of [none, saved(), loadingDeal]) {
          for (const idParam of [null, 'd7']) {
            const g = wizard(access, session, sd, idParam)
            if (g.kind === 'open') {
              expect(g.results, `${access}/${session} must not be hidden`).not.toBe('hidden')
            }
          }
        }
      }
    }
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

  it('S2 no Deals surface reads useEntitlementState — Deals needs the term', () => {
    // THE REGRESSION THIS GUARDS. `isPaid` is TRUE for an expired customer by contract, which is
    // correct for surfaces that do not wall a lapsed customer — and wrong here:
    // enforce_deals_free_tier_cap() tests `term_end > now()`, so a Deals surface reading `isPaid`
    // silently stops agreeing with the trigger. That is the exact defect these three changes
    // closed, and it compiles cleanly.
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
    // The FOOTER, closing the slice. Since 29 Sep 2026 its wording lives in buildDealReportModel
    // (lib/deals/reportModel.ts) and the page renders {m.footer.line}, which appears once in this
    // file; the company-name anchor this used before is no longer in the page at all.
    expect(src.split('{m.footer.line}').length - 1, 'the footer anchor must be unique').toBe(1)
    const end = src.indexOf('{m.footer.line}')
    expect(end, 'the report footer must follow the upsell').toBeGreaterThan(start)
    const block = src.slice(start, end)
    expect(block.length, 'the upsell block is empty').toBeGreaterThan(200)
    expect(block, 'the upsell must not print').toContain('className="no-print"')
    expect(block, 'same destination as the PaywallCard on this page').toContain('/pricing?modules=deals')
    expect(block, '/order was considered and rejected — one commercial route out of this module').not.toContain('/order')
  })

  /** STEP_NAMES as the wizard declares it, so the assertion below is keyed on the label a user sees. */
  const stepNames = (): string[] => {
    const m = read(WIZARD).match(/const STEP_NAMES = \[([^\]]*)\]/)
    expect(m, 'STEP_NAMES not found in the wizard').toBeTruthy()
    return [...m![1].matchAll(/'([^']+)'/g)].map(x => x[1])
  }

  /** Each step's `needs`, in table order. */
  const tableNeeds = (table: string): string[] =>
    [...table.matchAll(/render: renderStep\d, needs: '([a-z]+)'/g)].map(x => x[1])

  it('S6 the wizard actually GATES on the resolver, not just calls it', () => {
    // ⚠️ FOUND BY MUTATION, AND IT IS THE GAP THIS WHOLE FILE COULD OTHERWISE HAVE. Replacing the
    // wizard's `resultsShown` with a literal `true` left all thirty-one other tests green: the
    // resolver still returned 'hidden' and was still asked, and nothing noticed that the page had
    // stopped listening. A pure resolver is only worth what its call site does with the answer, and
    // with no DOM harness the call site can only be checked textually.
    const src = read(WIZARD)

    // ⚠️ TWO DERIVATIONS NOW, AND BOTH ARE PINNED. The gate went three-state on 26 Sep 2026, so one
    // boolean could no longer express it: `resultsShown` governs the screening and the findings,
    // `costShown` governs the cost estimate alone. Pinning both is what keeps the mutation this test was
    // written for — replacing either with a literal — from passing.
    expect(src, 'resultsShown must derive from the gate')
      .toContain("const resultsShown = gate.kind !== 'open' || gate.results !== 'hidden'")
    expect(src, 'costShown must derive from the gate')
      .toContain("const costShown = gate.kind !== 'open' || gate.results === 'shown'")
    // ⚠️ AND THEY MUST NOT BE THE SAME EXPRESSION. Deriving both from `=== 'shown'` would silently
    // restore the all-or-nothing gate while leaving every other assertion here green.
    expect(src.includes("const resultsShown = gate.kind !== 'open' || gate.results === 'shown'"),
      'resultsShown must not collapse back onto costShown').toBe(false)

    // And the render sites that consume them. Named individually rather than counted, so a failure says
    // WHICH block stopped being gated.
    expect(src, 'step 1 findings must be withheld').toContain('{resultsShown && <>')
    expect(src, 'the sign-in prompt must replace them').toContain('{!resultsShown && signInPrompt()}')
    expect(src, 'the data-room GAPS panel is a finding')
      // Widened 29 Sep 2026 to include the environmental-claims evidence row; still gated on resultsShown.
      .toContain('{resultsShown && (!deal.has_ghg_data || !deal.has_esg_report || !!wm.risks.claims) && (')
    expect(src, 'steps 2 and 3 read resultsShown, step 4 reads costShown')
      .toContain("steps[step].needs === 'results' && !resultsShown ? signInPrompt()")
    expect(src, 'the cost step gets its OWN prompt, not the results one')
      .toContain("steps[step].needs === 'cost' && !costShown ? costSignInPrompt()")

    // The step table is where a sixth step has to be registered, and `needs` is required by its type —
    // so a new step cannot default quietly into being ungated. It replaced a boolean `findingsOnly` when
    // the gate went three-state: a boolean could only say withheld or not, which is what made the old
    // all-or-nothing gate the easy thing to write.
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
    expect(table, 'step 0 is pure input').toContain("render: renderStep0, needs: 'nothing'")
    expect(table, 'step 1 is mixed and gates internally').toContain("render: renderStep1, needs: 'nothing'")
    // ⚠️ STEPS 2 AND 3 NEED 'results', STEP 4 NEEDS 'cost', AND THE SPLIT IS THE DECISION OF
    // 26 Sep 2026. All three were findingsOnly: true under 291bd3c. Asserted per step rather than in a
    // loop, because the whole point is that they are no longer the same.
    // ⚠️ DERIVED FROM STEP_NAMES, NOT FROM POSITION, BECAUSE POSITION IS EXACTLY WHAT WENT WRONG.
    // renderStepN is zero-indexed and the tab labels are one-based, so the tab reading "4. Cost Estimate"
    // is INDEX 3. The first version of this table read the numbers off the labels and gave index 3
    // 'results' — which a signed-out visitor has — so the full cost estimate rendered to anon, including
    // the consultant range and the ThemisIQ figure. Found in a browser on 26 Sep 2026; no test here saw
    // it, because every assertion named renderStepN and agreed with the mistake.
    //
    // So the mapping is asserted BY LABEL: whatever index carries 'Cost Estimate' must need 'cost'. An
    // off-by-one now fails here rather than shipping.
    const names = stepNames()
    const needsByIndex = tableNeeds(table)
    expect(needsByIndex.length, 'one `needs` per step in STEP_NAMES').toBe(names.length)
    const EXPECTED_BY_LABEL: Record<string, 'nothing' | 'results' | 'cost'> = {
      'Deal Setup': 'nothing',      // pure input
      'ESG Screening': 'nothing',   // MIXED: gates its own findings block internally
      'Risk Findings': 'results',   // shown without an account
      'Cost Estimate': 'cost',      // an account buys it
      'Report': 'cost',             // an account to reach it; the module to export it
    }
    names.forEach((label, i) => {
      expect(EXPECTED_BY_LABEL[label], `STEP_NAMES gained '${label}' with no gating decision`).toBeDefined()
      expect(needsByIndex[i], `'${label}' (index ${i}) must need '${EXPECTED_BY_LABEL[label]}'`)
        .toBe(EXPECTED_BY_LABEL[label])
    })
    // No step may claim 'nothing' beyond the two input steps: that is how a findings step would become
    // ungated by omission rather than by decision.
    // ⚠️ ANCHORED ON `render: renderStepN`, NOT ON `needs: 'nothing'` ALONE. The slice begins at the
    // TYPE ANNOTATION, which contains the string `needs: 'nothing' | 'results' | 'cost'` — so the bare
    // pattern counted three and failed against a correct table. The same shape as every other
    // count-a-substring mistake in this repo: match the construct, not a word inside it.
    const ungated = table.match(/render: renderStep\d, needs: 'nothing'/g) ?? []
    expect(ungated.length, 'only steps 0 and 1 are ungated').toBe(2)
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
