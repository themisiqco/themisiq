import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as R from './requirements'
import { ATTESTATION_CONTROLLING_TEMPLATE, ATTESTATION_EACH_ENTITY, ADAPTED_ATTESTATION_NOTE } from './attestationWording'
import { ATTESTATION_EXAMPLE_NOTE } from './builderContent'
import { attestationNote } from './attestation'

const recorded = (() => {
  const out = new Set<string>()
  const walk = (v: unknown) => { if (typeof v === 'string') out.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk) }
  Object.values(R).forEach(walk)
  return out
})()
const OURS = [ATTESTATION_CONTROLLING_TEMPLATE, ATTESTATION_EACH_ENTITY]

describe('the adapted attestation wordings are ours, never labelled as Public Safety Canada text', () => {
  it('neither is among the verified quotations, and requirements.ts does not contain them', () => {
    const src = readFileSync(join(process.cwd(), 'lib/s211/requirements.ts'), 'utf8')
    for (const w of OURS) expect(recorded.has(w)).toBe(false)
    // The phrases that are ours, not the example's.
    for (const phrase of ['which controls each entity listed above', 'each of the undersigned', 'on behalf of that governing body']) {
      expect(src).not.toContain(phrase)
      expect([...recorded].some(r => r.includes(phrase)), phrase).toBe(false)
    }
  })

  it('both joint bases show the adapted note, which says it is not Public Safety Canada\'s text; the single basis keeps the example note', () => {
    expect(ADAPTED_ATTESTATION_NOTE).toContain('adapted from Public Safety Canada’s example')
    expect(ADAPTED_ATTESTATION_NOTE).toContain('It is not text Public Safety Canada publishes')
    expect(ADAPTED_ATTESTATION_NOTE).toContain('You may edit it')
    for (const b of ['joint_each', 'joint_controlling']) expect(attestationNote(b)).not.toBe(ATTESTATION_EXAMPLE_NOTE)
    expect(ATTESTATION_EXAMPLE_NOTE).toContain('This is Public Safety Canada\'s example wording')
  })

  it('the (b)(ii) wording is the published example with one phrase changed, and nothing else', () => {
    expect(ATTESTATION_CONTROLLING_TEMPLATE).toBe(R.S211_ATTESTATION_EXAMPLE.replace(
      'on behalf of the governing body of the entity [or entities] listed above.',
      'on behalf of the governing body of [controlling entity], which controls each entity listed above.'))
  })

  it('the (b)(i) wording is the text decided on 30 Sep 2026, word for word', () => {
    expect(ATTESTATION_EACH_ENTITY).toBe('In accordance with the requirements of the Fighting Against Forced Labour and Child Labour in Supply Chains Act (Act), and in particular section 11 thereof, each of the undersigned, in the capacity of a member of the governing body of the entity for which they sign below, attests that they have reviewed the information contained in the report on behalf of that governing body. Based on their knowledge, and having exercised reasonable diligence, each attests that the information in the report is true, accurate and complete in all material respects for the purposes of the Act, for the reporting year listed within this report.')
  })

  it('the section page shows the note for the basis, not the fixed example note', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/forced-labour/_components/SectionPage.tsx'), 'utf8')
    expect(page).toContain('{attestationNote(content.approval_basis)}')
    expect(page).not.toContain('{ATTESTATION_EXAMPLE_NOTE}')
  })
})
