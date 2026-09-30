import { describe, it, expect } from 'vitest'
import { fillAttestation, buildAttestation, attestationNote, attestationInputs, signatureLines, placeholdersIn, attestationEdited, refreshAttestation, PLACEHOLDER_WARNING } from './attestation'
import { ATTESTATION_DEFAULT, ATTESTATION_EXAMPLE_NOTE } from './builderContent'
import { ATTESTATION_EACH_ENTITY, ADAPTED_ATTESTATION_NOTE } from './attestationWording'
import { S211_ATTESTATION_EXAMPLE, S211_ATTESTATION_SIGNATURE_BLOCK } from './requirements'

describe('the attestation placeholders (review item A5)', () => {
  it('[title] is the signer\'s title; "entity [or entities]" follows the report type', () => {
    const single = fillAttestation({ title: 'Chief Executive Officer', reportType: 'single' })
    expect(single).toContain('in the capacity of Chief Executive Officer, attest')
    expect(single).toContain('on behalf of the governing body of the entity listed above')
    expect(fillAttestation({ title: 'Chair', reportType: 'joint' })).toContain('governing body of the entities listed above')
    expect(placeholdersIn(single)).toEqual([])
  })

  it('nothing given yet: the placeholders stay, so they can be found and warned about', () => {
    expect(fillAttestation({})).toBe(ATTESTATION_DEFAULT)
    expect(placeholdersIn(fillAttestation({}))).toEqual(['[title]', '[or entities]'])
    expect(placeholdersIn(fillAttestation({ title: '  ' }))).toContain('[title]')
  })

  it('the recorded quotation is never changed; only the copy is filled', () => {
    fillAttestation({ title: 'Chair', reportType: 'joint' })
    expect(ATTESTATION_DEFAULT).toBe(S211_ATTESTATION_EXAMPLE)
    expect(S211_ATTESTATION_EXAMPLE).toContain('[title]')
  })

  it('the signature line names the entity from section 1, and closes the statement\'s quotation mark', () => {
    const lines = signatureLines('Harrowgate Outdoor Equipment Inc.')
    expect(lines.slice(0, 3)).toEqual(['Full name', 'Title', 'Date'])
    expect(lines[3]).toBe('Signature, accompanied by the statement "I have the authority to bind Harrowgate Outdoor Equipment Inc."')
    expect(signatureLines('Harrowgate Ltd')[3]).toBe('Signature, accompanied by the statement "I have the authority to bind Harrowgate Ltd."')
    expect(signatureLines('')).toEqual([...S211_ATTESTATION_SIGNATURE_BLOCK])
  })
})

describe('the attestation follows the answers until edited, then asks (same protection as section 9)', () => {
  it('unedited: follows the title as it is typed', () => {
    let s11 = refreshAttestation({}, { reportType: 'single' }).content
    s11 = refreshAttestation({ ...s11, signatory_title: 'C' }, { title: 'C', reportType: 'single' }).content
    s11 = refreshAttestation({ ...s11, signatory_title: 'CEO' }, { title: 'CEO', reportType: 'single' }).content
    expect(s11.attestation_text).toContain('in the capacity of CEO, attest')
    expect(attestationEdited(s11)).toBe(false)
  })

  it('edited: the text is kept, and the new version is offered rather than applied', () => {
    const built = refreshAttestation({}, { title: 'CEO', reportType: 'single' }).content
    const mine = { ...built, attestation_text: `${built.attestation_text} Signed in Toronto.` }
    expect(attestationEdited(mine)).toBe(true)
    const r = refreshAttestation(mine, { title: 'Chair', reportType: 'single' })
    expect(r.content).toBe(mine)
    expect(r.offer).toContain('in the capacity of Chair, attest')
  })

  it('edited, and the answers have not changed what would be generated: no offer', () => {
    const built = refreshAttestation({}, { title: 'CEO', reportType: 'single' }).content
    const mine = { ...built, attestation_text: 'My own words.' }
    expect(refreshAttestation({ ...mine, _attestation_built: 'My own words.' }, { title: 'CEO', reportType: 'single' }).offer).toBeNull()
  })
})

describe('the placeholder warning', () => {
  it('names each placeholder left', () => {
    expect(PLACEHOLDER_WARNING(['[title]'])).toBe('The attestation still contains a placeholder in square brackets: [title]. Replace it before the report is signed.')
    expect(PLACEHOLDER_WARNING(['[title]', '[or entities]'])).toContain('placeholders in square brackets: [title], [or entities]. Replace them')
  })
})

describe('what fills the attestation, by approval basis', () => {
  it('11(4)(a), or no basis chosen yet: Public Safety Canada\'s example exactly as before', () => {
    expect(buildAttestation({ basis: 'single', title: 'Chair of the Board', reportType: 'single' })).toBe(fillAttestation({ title: 'Chair of the Board', reportType: 'single' }))
    expect(buildAttestation({ title: 'Chair', reportType: 'joint' })).toBe(fillAttestation({ title: 'Chair', reportType: 'joint' }))
    expect(buildAttestation({ basis: 'single', title: 'Chair of the Board', reportType: 'single' })).toContain('on behalf of the governing body of the entity listed above')
  })

  it('11(4)(b)(ii): the controlling entity\'s governing body, and the signer\'s title', () => {
    const t = buildAttestation({ basis: 'joint_controlling', title: 'Chair of the Board', controllingEntity: 'Harrowgate Holdings Ltd.', reportType: 'joint' })
    expect(t).toContain('I, in the capacity of Chair of the Board, attest')
    expect(t).toContain('on behalf of the governing body of Harrowgate Holdings Ltd., which controls each entity listed above. Based on my knowledge')
    expect(placeholdersIn(t)).toEqual([])
    expect(placeholdersIn(buildAttestation({ basis: 'joint_controlling' }))).toEqual(['[title]', '[controlling entity]'])
  })

  it('11(4)(b)(i): the "each of the undersigned" wording, with nothing to fill', () => {
    const t = buildAttestation({ basis: 'joint_each', title: 'Chair', reportType: 'joint' })
    expect(t).toBe(ATTESTATION_EACH_ENTITY)
    expect(placeholdersIn(t)).toEqual([])
  })

  it('the inputs carry the basis, the controlling entity and the title from section 11', () => {
    expect(attestationInputs({ approval_basis: 'joint_controlling', signatory_title: 'Chair', controlling_entity: 'H Ltd.' }, { report_type: 'joint', legal_name: 'X Inc.' }))
      .toEqual({ title: 'Chair', reportType: 'joint', legalName: 'X Inc.', basis: 'joint_controlling', controllingEntity: 'H Ltd.' })
  })

  it('changing the basis re-fills an unedited attestation, and only offers the new wording over an edited one', () => {
    const single = refreshAttestation({}, { basis: 'single', title: 'Chair', reportType: 'single' }).content
    const toEach = refreshAttestation({ ...single, approval_basis: 'joint_each' }, { basis: 'joint_each' })
    expect(toEach.offer).toBeNull()
    expect(toEach.content.attestation_text).toBe(ATTESTATION_EACH_ENTITY)
    const edited = { ...single, attestation_text: `${single.attestation_text} Signed in Calgary.` }
    const offered = refreshAttestation({ ...edited, approval_basis: 'joint_each' }, { basis: 'joint_each' })
    expect(offered.content.attestation_text).toBe(edited.attestation_text)
    expect(offered.offer).toBe(ATTESTATION_EACH_ENTITY)
  })

  it('the note under the attestation says whose wording it is', () => {
    expect(attestationNote('single')).toBe(ATTESTATION_EXAMPLE_NOTE)
    expect(attestationNote(undefined)).toBe(ATTESTATION_EXAMPLE_NOTE)
    expect(attestationNote('joint_each')).toBe(ADAPTED_ATTESTATION_NOTE)
    expect(attestationNote('joint_controlling')).toBe(ADAPTED_ATTESTATION_NOTE)
  })
})
