import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decideSave, keepPromptShown, unsavedNudgeArm, type VisitorState } from './keepResults'
import { showUnsavedNudge } from './unsavedChanges'
import {
  keepReducer, initialKeepState, claimOutcome, confirmStep, savedHref, inventoryHref, keptLine, normaliseCode,
  parsePendingMarker, readPendingMarker, writePendingMarker, clearPendingMarker, clearDraftOnRestore,
  KEEP_COPY, KEEP_PENDING_KEY, CODE_TTL_MS, type KeepState, type ClaimOutcome,
} from './keepResults'
import { claimFreeCalc, type ClaimDeps } from './freeCalcService'
import { FREE_CALC_MESSAGES } from './freeCalc'
import { CONFIRM_LANDING } from '../auth/linkAction'

// "Keep my results", the wizard side (LEAD1 L4, Oct 2026; docs/review/design-lead1.md sections 1.1 to 1.6). Save
// routing and the placements per visitor are in lib/ghg/entry.test.ts (EN2 to EN14).

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const MODAL = 'app/dashboard/ghg/_components/KeepResultsModal.tsx'
const PAGE = 'app/dashboard/ghg/page.tsx'
const CONFIRM = 'app/auth/confirm/page.tsx'

const run = (s: KeepState, ...events: Parameters<typeof keepReducer>[1][]) => events.reduce(keepReducer, s)

describe('the modal states', () => {
  it('K1: form, sending, code, verifying, claiming, done', () => {
    const s = run(initialKeepState('form'),
      { type: 'submit' }, { type: 'code_sent', email: 'a@b.co' }, { type: 'verify' }, { type: 'claim' },
      { type: 'claimed', outcome: { kind: 'saved', id: 'inv1', freeTier: true, emailed: true } })
    expect(s).toEqual({ step: 'done', id: 'inv1', freeTier: true })
  })

  it('K2: a refused send goes back to the form with the reason; a refused code back to the code with the reason', () => {
    expect(run(initialKeepState('form'), { type: 'submit' }, { type: 'send_failed', message: FREE_CALC_MESSAGES.rateLimited }))
      .toEqual({ step: 'form', error: FREE_CALC_MESSAGES.rateLimited })
    expect(run(initialKeepState('code', 'a@b.co'), { type: 'verify' }, { type: 'verify_failed', message: 'Token has expired or is invalid' }))
      .toEqual({ step: 'code', email: 'a@b.co', error: 'Token has expired or is invalid', notice: null })
  })

  it('K3: "Send a new code" says so; "Use a different email" goes back to the form', () => {
    const code = initialKeepState('code', 'a@b.co')
    expect(run(code, { type: 'code_sent', email: 'a@b.co', resent: true })).toEqual({ step: 'code', email: 'a@b.co', error: null, notice: KEEP_COPY.newCodeSent })
    expect(run(code, { type: 'resend_failed', message: 'x' })).toMatchObject({ step: 'code', error: 'x' })
    expect(run(code, { type: 'change_email' })).toEqual({ step: 'form', error: null })
  })

  it('K4: the one-free choice and the conflict choice, each with the route\'s own sentence', () => {
    const free = { id: 'f1', company: 'Acme', year: 2025 }
    const one = run(initialKeepState('claim'), { type: 'claimed', outcome: { kind: 'one_free', message: FREE_CALC_MESSAGES.oneFree('Acme', 2025), free } })
    expect(one).toEqual({ step: 'one_free', message: 'Your free account keeps one calculation: Acme, 2025.', free, error: null })
    // "Replace it with this one" claims again.
    expect(run(one, { type: 'claim' })).toEqual({ step: 'claiming' })

    const existing = { id: 'e1', company: 'Acme', year: 2025 }
    const c = run(initialKeepState('claim'), { type: 'claimed', outcome: { kind: 'conflict', message: FREE_CALC_MESSAGES.conflict('Acme', 2025), existing } })
    expect(c).toEqual({ step: 'conflict', message: 'You already have a 2025 inventory for "Acme".', existing, editing: false })
    // "Save this calculation under a different year or company" shows the fields, then claims again.
    const editing = run(c, { type: 'edit_company_year' })
    expect(editing).toMatchObject({ step: 'conflict', editing: true })
    expect(run(editing, { type: 'claim' })).toEqual({ step: 'claiming' })
  })

  it('K5: a failed claim shows its message and can be tried again', () => {
    const e = run(initialKeepState('claim'), { type: 'claimed', outcome: { kind: 'failed', message: 'm' } })
    expect(e).toEqual({ step: 'error', message: 'm' })
    expect(run(e, { type: 'claim' })).toEqual({ step: 'claiming' })
  })

  it('K6: a late reply cannot move a modal that has moved on', () => {
    const done: KeepState = { step: 'done', id: 'i', freeTier: true }
    expect(run(done, { type: 'code_sent', email: 'a@b.co' }, { type: 'send_failed', message: 'x' }, { type: 'verify_failed', message: 'x' })).toBe(done)
    const code = initialKeepState('code', 'a@b.co')
    expect(run(code, { type: 'claimed', outcome: { kind: 'saved', id: 'i', freeTier: true, emailed: true } })).toBe(code)
    expect(run(code, { type: 'submit' })).toBe(code)
  })

  it('K7: where the modal starts: the form signed out, the claim signed in, the code after a reload', () => {
    expect(initialKeepState('form')).toEqual({ step: 'form', error: null })
    expect(initialKeepState('claim')).toEqual({ step: 'claiming' })
    expect(initialKeepState('code', 'a@b.co')).toEqual({ step: 'code', email: 'a@b.co', error: null, notice: null })
  })

  it('K8: the code is six digits; spaces are dropped', () => {
    expect(normaliseCode('123456')).toBe('123456')
    expect(normaliseCode(' 123 456 ')).toBe('123456')
    expect(normaliseCode('12345')).toBeNull()
    expect(normaliseCode('12345a')).toBeNull()
  })
})

describe('the claim response, as the route sends it', () => {
  const inventory = { company_name: 'Acme', reporting_year: 2025, locations: [{ id: '1', name: 'HQ', country: 'CA' }] }
  const deps = (over: Partial<ClaimDeps>): ClaimDeps => ({
    user: { id: 'u1', email: 'a@b.co' }, now: new Date('2026-10-04T12:00:00Z'),
    getAccess: async () => 'none',
    listOwnInventories: async () => [],
    resolveCompany: async () => ({ id: 'c1' }),
    insertInventory: async () => ({ id: 'new1' }),
    replaceFreeInventory: async () => ({ updated: 1 }),
    getPendingById: async () => null,
    latestPending: async () => null,
    deletePendingForEmail: async () => {},
    upsertProfile: async () => {},
    readSavedRow: async () => null,
    profileFullName: async () => null,
    sendResults: async () => ({ ok: true, id: null }),
    siteUrl: 'https://www.themisiq.co',
    ...over,
  })
  const outcomeOf = async (body: unknown, d: Partial<ClaimDeps>): Promise<ClaimOutcome> => {
    const r = await claimFreeCalc(body, deps(d))
    return claimOutcome(r.status, r.body)
  }

  it('K9: saved, free or on a plan', async () => {
    expect(await outcomeOf({ inventory }, {})).toEqual({ kind: 'saved', id: 'new1', freeTier: true, emailed: false })
    expect(await outcomeOf({ inventory }, { getAccess: async () => 'active' })).toEqual({ kind: 'saved', id: 'new1', freeTier: false, emailed: false })
  })

  it('K10: the one-free choice and the conflict, with their ids and the exact sentences', async () => {
    const free = { id: 'f1', company_name: 'Other', reporting_year: 2024, free_tier: true }
    expect(await outcomeOf({ inventory }, { listOwnInventories: async () => [free] })).toEqual({
      kind: 'one_free', message: 'Your free account keeps one calculation: Other, 2024.', free: { id: 'f1', company: 'Other', year: 2024 },
    })
    const real = { id: 'r1', company_name: 'Acme', reporting_year: 2025, free_tier: false }
    expect(await outcomeOf({ inventory }, { getAccess: async () => 'active', listOwnInventories: async () => [real] })).toEqual({
      kind: 'conflict', message: 'You already have a 2025 inventory for "Acme".', existing: { id: 'r1', company: 'Acme', year: 2025 },
    })
  })

  it('K11: nothing waiting is "nothing"; every other refusal shows the route\'s sentence', async () => {
    expect(await outcomeOf({}, {})).toEqual({ kind: 'nothing', message: FREE_CALC_MESSAGES.nothingToClaim })
    expect(await outcomeOf({}, { latestPending: async () => ({ id: 'p', email: 'a@b.co', email_key: 'a@b.co', full_name: null, company: null, payload: inventory, created_at: '', expires_at: '2026-10-01T00:00:00Z' }) }))
      .toEqual({ kind: 'failed', message: FREE_CALC_MESSAGES.expired })
    expect(await outcomeOf({ inventory }, { getAccess: async () => 'unknown' })).toMatchObject({ kind: 'failed' })
  })

  it('K12: a response with no sentence says nothing was saved, and guesses no cause', () => {
    expect(claimOutcome(0, {})).toEqual({ kind: 'failed', message: KEEP_COPY.claimFailed })
    expect(claimOutcome(502, 'not json')).toEqual({ kind: 'failed', message: KEEP_COPY.claimFailed })
    expect(KEEP_COPY.claimFailed).toContain('Nothing was saved')
    // The race the database catches (23505 on the one-free index) carries no ids: the choice still shows.
    expect(claimOutcome(409, { ok: false, code: 'one_free', message: 'Your free account keeps one calculation.' }))
      .toEqual({ kind: 'one_free', message: 'Your free account keeps one calculation.', free: null })
  })
})

describe('/auth/confirm after the link', () => {
  it('K13: saved opens the calculation; nothing waiting lands as before; the choices keep the route\'s sentence', () => {
    expect(confirmStep({ kind: 'saved', id: 'i1', freeTier: true, emailed: true }, CONFIRM_LANDING)).toEqual({ go: '/dashboard/ghg?id=i1&kept=free&emailed=1' })
    expect(confirmStep({ kind: 'nothing', message: 'x' }, CONFIRM_LANDING)).toEqual({ go: CONFIRM_LANDING })
    expect(confirmStep({ kind: 'one_free', message: 'm', free: { id: 'f1', company: 'A', year: 2025 } }, CONFIRM_LANDING)).toEqual({
      message: 'm', actions: [{ label: KEEP_COPY.replace, replaceFreeId: 'f1' }, { label: KEEP_COPY.openSaved, href: '/dashboard/ghg?id=f1' }],
    })
    expect(confirmStep({ kind: 'conflict', message: 'm', existing: { id: 'e1', company: 'A', year: 2025 } }, CONFIRM_LANDING)).toEqual({
      message: 'm', actions: [{ label: KEEP_COPY.openExisting, href: '/dashboard/ghg?id=e1' }, { label: 'Go to the calculator', href: CONFIRM_LANDING }],
    })
    expect(confirmStep({ kind: 'failed', message: 'm' }, CONFIRM_LANDING)).toEqual({ message: 'm', actions: [{ label: 'Go to the calculator', href: CONFIRM_LANDING }] })
  })

  it('K14: the page verifies, then claims with no calculation in hand, and follows confirmStep', () => {
    const c = read(CONFIRM)
    expect(c).toContain('completeSignIn(window.location.href, supabase.auth)')
    expect(c).toContain("fetch('/api/ghg/free-calc/claim'")
    expect(c).toContain('follow(await claimHeld())')
    expect(c).toContain('const outcome = claimOutcome(res.status')
    expect(c).toContain('return confirmStep(outcome, CONFIRM_LANDING)')
    expect(c).toContain('window.location.replace(step.go)')
  })

  it('K15: the confirmation line, and the hrefs it is reached by', () => {
    expect(savedHref('a b', false)).toBe('/dashboard/ghg?id=a%20b&kept=plan&emailed=0')
    expect(inventoryHref('x')).toBe('/dashboard/ghg?id=x')
    expect(keptLine('free')).toBe('Your calculation is saved to your free account.')
    expect(keptLine('plan')).toBe('Your calculation is saved to your account.')
    expect(keptLine(null)).toBeNull()
    expect(keptLine('other')).toBeNull()
  })
})

describe('the draft survives a pending code (design 1.6)', () => {
  const mem = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m }
  }

  it('K16: the marker is written, read back, and lapses with the code', () => {
    const s = mem()
    const marker = { email: 'a@b.co', fullName: 'A B', company: 'Acme', sentAt: 1_000_000 }
    writePendingMarker(marker, s)
    expect(s.m.has(KEEP_PENDING_KEY)).toBe(true)
    expect(readPendingMarker(1_000_000 + 1000, s)).toEqual(marker)
    expect(readPendingMarker(1_000_000 + CODE_TTL_MS, s)).toBeNull()
    clearPendingMarker(s)
    expect(readPendingMarker(1_000_000, s)).toBeNull()
    expect(parsePendingMarker('not json', 0)).toBeNull()
    expect(parsePendingMarker(JSON.stringify({ email: '', sentAt: 0 }), 0)).toBeNull()
  })

  it('K17: the restore keeps the draft while a code is pending, and clears it otherwise, as before', () => {
    expect(clearDraftOnRestore(null)).toBe(true)
    expect(clearDraftOnRestore({ email: 'a@b.co', fullName: '', company: '', sentAt: 0 })).toBe(false)
    const page = read(PAGE)
    expect(page).toContain('const keepPending = readPendingMarker()')
    expect(page).toContain('if (clearDraftOnRestore(keepPending)) clearGhgDraft()')
    expect(page).toContain("else setKeepModal({ start: 'code', pending: keepPending })")
  })

  it('K18: the modal writes the draft BEFORE the hold and the code, drops ?start=new, and clears both only on a save', () => {
    const m = read(MODAL)
    const draft = m.indexOf('saveGhgDraft(inventory, { anon: true, owner: null })')
    const hold = m.indexOf("fetch('/api/ghg/free-calc/pending'")
    const otp = m.indexOf('const failed = await askForCode(addr)')
    const marker = m.indexOf('writePendingMarker({ email: addr')
    expect(draft).toBeGreaterThan(0)
    expect(draft).toBeLessThan(hold)
    expect(hold).toBeLessThan(otp)
    expect(otp).toBeLessThan(marker)
    expect(m).toContain('dropStartNew()')
    const saved = m.slice(m.indexOf("if (outcome.kind === 'saved') {"))
    expect(saved.indexOf('clearGhgDraft()')).toBeGreaterThan(0)
    expect(saved.indexOf('clearPendingMarker()')).toBeGreaterThan(0)
  })
})

describe('the modal and the placements, in the source', () => {
  it('K19: the form has the fields, the honeypot, Turnstile, the Terms sentence, and a marked place for L6 consent', () => {
    const m = read(MODAL)
    for (const id of ['keep-name', 'keep-email', 'keep-company', 'keep-code']) expect(m).toContain(`id="${id}"`)
    expect(m).toContain('name={HONEYPOT_FIELD} tabIndex={-1} aria-hidden="true"')
    expect(m).toContain('<Turnstile onToken={onToken} resetKey={captchaReset} />')
    // L6 filled the place L4 marked: one checkbox, the marketing box, unticked unless the visitor ticks it.
    expect(m.match(/type="checkbox"/g) ?? []).toHaveLength(1)
    expect(m).toContain('<input id="keep-marketing" type="checkbox" checked={marketing}')
    expect(m).toContain('>Terms</Link> and the <Link href="/privacy"')
    expect(KEEP_COPY.terms).toBe('By creating a free account you agree to the Terms and the Privacy Policy.')
    // Prefilled from the calculation.
    expect(m).toContain("useState(pending?.company || inventory.company_name || '')")
  })

  it('K20: the code: signInWithOtp creating the user with the free-account metadata, then verifyOtp type email, then the claim', () => {
    const m = read(MODAL)
    expect(m).toContain('shouldCreateUser: true,')
    expect(m).toContain("data: { full_name: fullName.trim(), company: company.trim(), signup_source: 'free_calc' },")
    expect(m).toContain("emailRedirectTo: `${window.location.origin}/auth/confirm`,")
    expect(m).toContain("supabase.auth.verifyOtp({ email: state.email, token: c, type: 'email' })")
    expect(m).toContain('Send a new code')
    expect(m).toContain('Use a different email')
  })

  it('K21: phone width and keyboard: fits at 320px, a dialog, Escape closes, focus trapped and returned', () => {
    const m = read(MODAL)
    expect(m).toContain('role="dialog" aria-modal="true" aria-labelledby="keep-results-title"')
    expect(m).toContain("maxWidth: 440, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', boxSizing: 'border-box'")
    expect(m).toContain("padding: 16, boxSizing: 'border-box'")
    expect(m).toContain("if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }")
    expect(m).toContain('return () => { opener?.focus?.() }')
    expect(m).toContain("if (e.key !== 'Tab' || !panel.current) return")
    // 16px fields: iOS does not zoom into them.
    expect(m).toContain("fontSize: 16, padding: '10px 12px'")
    // Closing keeps the calculation: the page's onClose only hides the modal.
    expect(read(PAGE)).toContain('onClose={() => setKeepModal(null)}')
  })

  it('K22: the four placements and the banners are in the page', () => {
    const p = read(PAGE)
    expect(p).toContain('data-keep-results="step4"')
    expect(p).toContain('data-keep-results="banner"')
    expect(p).toContain('onKeep={showKeep ? openKeepForm : undefined}')
    expect(p).toContain("setKeepModal({ start: outcome === 'keep_form' ? 'form' : 'claim', pending: null })")
    expect(p).toContain('const showKeep = keepPromptShown(visitor)')
    expect(p).toContain('{unsavedNudgeArm(visitor) === \'keep\' ? (')
    expect(p).toContain('setEditingFree(data.free_tier === true)')
    expect(p).toContain('<>{KEEP_COPY.freeRowBanner}{emailAgain.message && ')
    expect(p).toContain('{keptMessage && inventoryId && (')
    // L5: the results email is sent on claim, so the prompt says so (design 1.1).
    expect(KEEP_COPY.line).toBe('Create a free account and we\'ll email your results to you and keep this calculation.')
    expect(KEEP_COPY.savedFree).toBe('Your calculation is saved to your free account.')
  })

  it('K23: no em dash in the new customer-facing words', () => {
    for (const v of Object.values(KEEP_COPY)) {
      const text = typeof v === 'function' ? v('a@b.co') : v
      expect(text).not.toContain('—')
    }
  })
})

describe('after the code or the link', () => {
  it('K24: a verified code clears the marker and tells the page, before the claim', () => {
    const m = read(MODAL)
    const verified = m.slice(m.indexOf("supabase.auth.verifyOtp({ email: state.email"))
    expect(verified.indexOf('clearPendingMarker()')).toBeLessThan(verified.indexOf('await claim()'))
    expect(verified.indexOf('onSignedIn()')).toBeLessThan(verified.indexOf('await claim()'))
    expect(read(PAGE)).toContain('setSignedIn(true)')
  })

  it('K25: a link claim that saved clears this browser\'s draft and marker', () => {
    expect(read(CONFIRM)).toContain("if (outcome.kind === 'saved') { clearGhgDraft(); clearPendingMarker() }")
  })
})

// LEAD1 L4 fix1 (Lisa's preview test, 5 Oct 2026): signed in by code on /login as the account from test A, which has
// its free calculation, then /dashboard/ghg?start=new. "Keep my results" showed, and the one-free banner did not.
describe('fix1: a signed-in account with its free calculation, on a new calculation', () => {
  // Every state the page passes through on ?start=new while its three reads land, in any order: the session
  // (null until read), the plan ('loading' until read), the free-calculation lookup (null until read, and only
  // sent once there is a session).
  const states: VisitorState[] = []
  for (const signedIn of [null, true] as const)
    for (const access of ['loading', 'none'] as const)
      for (const hasFreeCalc of (signedIn ? [null, true] : [null]) as Array<boolean | null>)
        states.push({ signedIn, access, hasInventoryId: false, editingFree: false, hasFreeCalc })

  it('F1: no "Keep my results" prompt at any point while the reads land, so nothing flashes up', () => {
    expect(states).toHaveLength(6)
    for (const v of states) {
      expect(keepPromptShown(v), JSON.stringify(v)).toBe(false)
      expect(unsavedNudgeArm(v), JSON.stringify(v)).not.toBe('keep')
    }
  })

  it('F2: once everything is read: no prompt, the one-free banner after the first edit, and Save offers the one-free choice', () => {
    const v: VisitorState = { signedIn: true, access: 'none', hasInventoryId: false, editingFree: false, hasFreeCalc: true }
    expect(keepPromptShown(v)).toBe(false)
    expect(showUnsavedNudge({ mode: 'wizard', dirty: false })).toBe(false)
    expect(showUnsavedNudge({ mode: 'wizard', dirty: true })).toBe(true)
    expect(unsavedNudgeArm(v)).toBe('one_free')
    expect(KEEP_COPY.oneFreeNudge).toBe('Your free account keeps one calculation.')
    // handleSave passes the session it has just read.
    expect(decideSave(v)).toBe('one_free_choice')
    // And while the lookup is still in flight, Save still goes to the claim, never to the sign-up form: the claim
    // route reads the account and states the one-free choice itself.
    expect(decideSave({ ...v, hasFreeCalc: null })).toBe('claim_free')
    expect(decideSave({ ...v, hasFreeCalc: null })).not.toBe('keep_form')
  })

  it('F3: a failed lookup is not "no free calculation": no prompt, Save goes to the claim route', () => {
    const v: VisitorState = { signedIn: true, access: 'none', hasInventoryId: false, editingFree: false, hasFreeCalc: null }
    expect(keepPromptShown(v)).toBe(false)
    expect(unsavedNudgeArm(v)).toBe('save')
    expect(decideSave(v)).toBe('claim_free')
  })

  it('F4: a signed-out visitor still gets the prompt, once the session read says signed out', () => {
    const out: VisitorState = { signedIn: false, access: 'none', hasInventoryId: false, editingFree: false, hasFreeCalc: null }
    expect(keepPromptShown({ ...out, signedIn: null })).toBe(false)
    expect(keepPromptShown(out)).toBe(true)
    expect(unsavedNudgeArm(out)).toBe('keep')
    expect(decideSave(out)).toBe('keep_form')
  })

  it('F5: the page passes unknown through, reads the free calculation on every entry, and logs a failed lookup', () => {
    const p = read(PAGE)
    expect(p).toContain('const visitor = { signedIn, access: ghgAccess, hasInventoryId: !!inventoryId, editingFree, hasFreeCalc }')
    expect(p).not.toContain('signedIn: signedIn === true')
    expect(p).toContain('const [hasFreeCalc, setHasFreeCalc] = useState<boolean | null>(null)')
    expect(p).toContain("if (error) { console.error('[ghg] free calculation lookup failed:', error.message); return null }")
    // In the mount effect, which no URL parameter gates (not the ?id= load effect).
    const mount = p.slice(p.indexOf('const sessionUser = useRef'), p.indexOf('return () => { cancelled = true; sub.subscription.unsubscribe() }'))
    expect(mount).toContain('void readFreeCalc().then(')
    expect(mount).not.toContain("searchParams")
    // It follows sign-ins and sign-outs after mount, outside supabase-js's auth lock.
    expect(mount).toContain("if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => apply(session), 0)")
  })
})

// Stale browser state after testing several accounts in one browser (Lisa, 5 Oct 2026): a draft stashed under one
// account restored under another carried that account's company_id, and Save was refused by the owner policy.
describe('stale state across accounts in one browser', () => {
  it('S1: Save checks a company_id belongs to the signed-in account before using it, else resolves by name', () => {
    const p = read(PAGE)
    const save = p.slice(p.indexOf('let resolvedCompanyId = inventory.company_id || null'))
    const check = save.indexOf(".from('companies').select('id').eq('id', resolvedCompanyId).eq('user_id', session.user.id).maybeSingle()")
    const byName = save.indexOf('if (!resolvedCompanyId && trimmedName) {')
    expect(check).toBeGreaterThan(0)
    expect(save).toContain('if (!own) resolvedCompanyId = null')
    expect(check).toBeLessThan(byName)
  })

  it('S2: a pending code for a different address is dropped once the session is known', () => {
    const p = read(PAGE)
    expect(p).toContain("if (id && marker && marker.email.trim().toLowerCase() !== (u?.email ?? '').trim().toLowerCase()) {")
    expect(p).toContain("setKeepModal(k => (k?.start === 'code' ? null : k))")
  })
})

describe('item 3 (5 Oct 2026): every save from one tab refused by the owner policy', () => {
  it('S3: a sign-in change with the page open clears the company id and reads the company list again', () => {
    const p = read(PAGE)
    expect(p).toContain('const switched = sessionUser.current !== undefined')
    expect(p).toContain('setInventory(inv => (inv.company_id ? { ...inv, company_id: null } : inv))')
    expect(p).toContain(".from('companies').select('id, name').order('name').then(({ data }) => { if (!cancelled && sessionUser.current === id) setCompanies(data ?? []) })")
  })

  it('S4: Save with no company name is refused before anything is written', () => {
    const p = read(PAGE)
    expect(p).toContain("const COMPANY_NAME_NEEDED = 'Enter your company name on the first step before saving. Nothing was saved.'")
    const save = p.slice(p.indexOf('const handleSave = async (): Promise<string | null | undefined> => {'))
    const guard = save.indexOf("if (!(inventory.company_name || '').trim()) {")
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(save.indexOf('let resolvedCompanyId = inventory.company_id || null'))
    expect(guard).toBeLessThan(save.indexOf(".from('ghg_inventories').insert(payload)"))
  })
})
