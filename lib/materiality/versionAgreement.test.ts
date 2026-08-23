import { describe, it, expect } from 'vitest'
import {
  determinationSaveMessage,
  assessmentSaveMessage,
  classifyVersionLock,
  DETERMINATION_VERSION_ERRCODE,
  ASSESSMENT_VERSION_ERRCODE,
  type SaveError,
} from './versionAgreement'

/**
 * ⚠️ WHAT THESE TESTS CANNOT DO. vitest has no database, so nothing here can prove that 20260851
 * still raises PT409 and PT412 — the same limit 20260850's comments record for the readiness
 * helpers. E1/E2 pin the literals, which catches an edit on THIS side; an edit on the SQL side is
 * caught only by that migration's own verification block and by its hand tests.
 */

const RAW_409 = 'Determination S1-4/negative carries standard_version esrs_2026, but assessment '
              + '3f2a-… states esrs_2023. Not saved.'
const RAW_412 = 'Assessment 3f2a-… cannot move to esrs_2023: 74 of its recorded determinations are '
              + 'keyed to esrs_2026. Not saved.'

describe('errcodes', () => {
  it('E1: the determination side is PT409, as raised by 20260851 §2', () => {
    expect(DETERMINATION_VERSION_ERRCODE).toBe('PT409')
  })

  it('E2: the assessment side is PT412, as raised by 20260851 §3', () => {
    expect(ASSESSMENT_VERSION_ERRCODE).toBe('PT412')
  })

  // Two sides of one invariant, but the client must tell them apart: one is the customer's own
  // stale page, the other is somebody else's write landing first.
  it('E3: the two codes are distinct', () => {
    expect(DETERMINATION_VERSION_ERRCODE).not.toBe(ASSESSMENT_VERSION_ERRCODE)
  })
})

describe('determinationSaveMessage', () => {
  it('D1: a preparer is told the version changed and to reload — not the raw string', () => {
    const out = determinationSaveMessage({ code: 'PT409', message: RAW_409 }, 'preparer')
    expect(out).not.toBe(RAW_409)
    expect(out).not.toContain('standard_version')
    expect(out).toContain('has changed since this page was opened')
    expect(out).toContain('Reload')
  })

  /**
   * D2 is the one that would have been got wrong. The obvious implementation gives both writers the
   * same sentence, and for the contributor "reload" names a fix that does not exist:
   * impact_save_determination's do-update leaves standard_version alone, so the row stays wrong
   * however many times they reload.
   */
  it('D2: a contributor is NOT told reloading fixes it, and IS told who can', () => {
    const out = determinationSaveMessage({ code: 'PT409', message: RAW_409 }, 'contributor')
    expect(out).toContain('Reloading this page will not clear it')
    expect(out).toContain('they can correct it on the assessment itself')
  })

  it('D3: one errcode, two readings — the writers never get the same sentence', () => {
    const e: SaveError = { code: 'PT409', message: RAW_409 }
    expect(determinationSaveMessage(e, 'preparer'))
      .not.toBe(determinationSaveMessage(e, 'contributor'))
  })

  // D4 — the behaviour both call sites had before this module, preserved exactly.
  it.each(['preparer', 'contributor'] as const)(
    'D4: any other error returns the server sentence verbatim (%s)', writer => {
      const m = 'A positive impact carries no irremediability — there is nothing to remediate '
              + '(ESRS 1 para 41).'
      expect(determinationSaveMessage({ code: '23514', message: m }, writer)).toBe(m)
    })

  it('D5: PT410 is not swallowed by the PT409 branch', () => {
    const m = 'This determination has already been submitted and cannot be changed here.'
    expect(determinationSaveMessage({ code: 'PT410', message: m }, 'contributor')).toBe(m)
  })

  // The two codes are one character apart and mean opposite things about whose page is stale.
  it('D6: PT412 reaching this mapper is not treated as PT409', () => {
    expect(determinationSaveMessage({ code: 'PT412', message: RAW_412 }, 'preparer')).toBe(RAW_412)
  })

  /**
   * D7 — an empty result is a result. Without the fallback a blank message renders as an empty
   * error box: a refusal that looks like nothing happened at all.
   */
  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['null', null],
    ['absent', undefined],
  ])('D7: a %s message becomes a stated non-answer, never blank', (_label, message) => {
    const out = determinationSaveMessage({ code: '23505', message }, 'preparer')
    expect(out.trim().length).toBeGreaterThan(0)
    expect(out).toContain('gave no reason')
  })

  it('D8: a failure with no code at all still yields its message', () => {
    expect(determinationSaveMessage({ message: 'Network request failed' }, 'preparer'))
      .toBe('Network request failed')
  })
})

describe('assessmentSaveMessage', () => {
  it('A1: PT412 becomes the stale-page sentence, not the raw string', () => {
    const out = assessmentSaveMessage({ code: 'PT412', message: RAW_412 })
    expect(out).not.toBe(RAW_412)
    expect(out).not.toContain('standard_version')
    expect(out).toContain('reload it to see what is actually recorded')
  })

  it('A2: anything else is the server sentence verbatim', () => {
    const m = 'new row violates check constraint "materiality_assessments_period_order"'
    expect(assessmentSaveMessage({ code: '23514', message: m })).toBe(m)
  })

  it('A3: a blank message becomes a stated non-answer', () => {
    expect(assessmentSaveMessage({ code: '23505', message: '' })).toContain('gave no reason')
  })
})

describe('classifyVersionLock', () => {
  it('C1: no determinations is a free choice', () => {
    expect(classifyVersionLock({ stated: 'esrs_2026', carried: [], determinations: 0 }))
      .toEqual({ kind: 'free' })
  })

  it('C2: determinations that agree lock the control, and carry the count for the copy', () => {
    expect(classifyVersionLock({ stated: 'esrs_2026', carried: ['esrs_2026'], determinations: 74 }))
      .toEqual({ kind: 'agrees', determinations: 74 })
  })

  /**
   * C3 is the case that did not exist before 20260851. It is the ONLY exit from a disagreement:
   * determinations cannot be deleted (20260838:593) and neither can the assessment (20260827:154),
   * so if this classification is ever removed the state becomes terminal again.
   */
  it('C3: a single carried version that differs is repairable, TO that version', () => {
    expect(classifyVersionLock({ stated: 'esrs_2023', carried: ['esrs_2026'], determinations: 12 }))
      .toEqual({ kind: 'repairable', determinations: 12, to: 'esrs_2026', stated: 'esrs_2023' })
  })

  // The panel says "states X, but the work is keyed to Y", so it needs both.
  it('C4: repairable carries the stated version too, including when it is null', () => {
    const out = classifyVersionLock({ stated: null, carried: ['esrs_2026'], determinations: 3 })
    expect(out).toEqual({ kind: 'repairable', determinations: 3, to: 'esrs_2026', stated: null })
  })

  it('C5: more than one carried version is unrepairable, and names them all', () => {
    expect(classifyVersionLock({
      stated: 'esrs_2026', carried: ['esrs_2023', 'esrs_2026'], determinations: 40,
    })).toEqual({ kind: 'unrepairable', determinations: 40, carried: ['esrs_2023', 'esrs_2026'] })
  })

  /**
   * C6 — standard_version is NOT NULL on the determinations table, so rows carrying no version
   * cannot exist. The read SUCCEEDED and returned something impossible: that is inconsistent data,
   * and it is deliberately NOT the same verdict as a read that failed (C7).
   */
  it('C6: determinations with no carried versions is unrepairable, not unknown', () => {
    expect(classifyVersionLock({ stated: 'esrs_2026', carried: [], determinations: 5 }))
      .toEqual({ kind: 'unrepairable', determinations: 5, carried: [] })
  })

  it('C7: a failed read is unknown — locked, but nothing asserted about the data', () => {
    expect(classifyVersionLock({
      stated: 'esrs_2026', carried: [], determinations: 0, readFailed: true,
    })).toEqual({ kind: 'unknown' })
  })

  /**
   * C8 is the correction itself. Collapsing these two sends a customer whose request merely dropped
   * on an empty assessment to write to us about data that needs looking at on our side.
   */
  it('C8: unknown and unrepairable are distinguishable', () => {
    const unknown = classifyVersionLock({
      stated: 'esrs_2026', carried: [], determinations: 0, readFailed: true,
    })
    const inconsistent = classifyVersionLock({
      stated: 'esrs_2026', carried: [], determinations: 5,
    })
    expect(unknown.kind).toBe('unknown')
    expect(inconsistent.kind).toBe('unrepairable')
    expect(unknown.kind).not.toBe(inconsistent.kind)
  })

  // Whatever rows came back alongside a failed read describe an unknown fraction of the truth.
  it('C9: a failed read wins even when the rows that did arrive look consistent', () => {
    expect(classifyVersionLock({
      stated: 'esrs_2026', carried: ['esrs_2026'], determinations: 74, readFailed: true,
    })).toEqual({ kind: 'unknown' })
  })

  it('C10: a carried value outside StandardVersion is never offered as a repair', () => {
    const out = classifyVersionLock({
      stated: 'esrs_2026', carried: ['esrs_2019_draft'], determinations: 2,
    })
    expect(out.kind).toBe('unrepairable')
    expect(JSON.stringify(out)).not.toContain('"to"')
  })

  // Garbage in both columns still satisfies the invariant, and the invariant is what this decides.
  it('C11: an unknown version that MATCHES the assessment still agrees', () => {
    expect(classifyVersionLock({
      stated: 'esrs_2019_draft', carried: ['esrs_2019_draft'], determinations: 2,
    })).toEqual({ kind: 'agrees', determinations: 2 })
  })

  /**
   * C12 pins the rule the version selector reads: only `free` and `repairable` permit any choice at
   * all, and `repairable` permits exactly one. A new kind added without deciding which side of this
   * line it falls on fails here rather than silently unlocking a control.
   */
  it('C12: free is the only kind that permits an unrestricted choice', () => {
    const kinds = [
      classifyVersionLock({ stated: 'esrs_2026', carried: [], determinations: 0 }),
      classifyVersionLock({ stated: 'esrs_2026', carried: ['esrs_2026'], determinations: 1 }),
      classifyVersionLock({ stated: 'esrs_2023', carried: ['esrs_2026'], determinations: 1 }),
      classifyVersionLock({ stated: 'esrs_2026', carried: ['a', 'b'], determinations: 2 }),
      classifyVersionLock({ stated: 'esrs_2026', carried: [], determinations: 0, readFailed: true }),
    ]
    expect(kinds.map(k => k.kind))
      .toEqual(['free', 'agrees', 'repairable', 'unrepairable', 'unknown'])
    expect(kinds.filter(k => k.kind === 'free')).toHaveLength(1)
  })
})
