// lib/s211/attestation.ts
// Section 11's attestation: pre-filled from the user's own answers, in the wording that fits the approval
// basis. Pure.
//   11(4)(a), or no basis chosen yet: Public Safety Canada's example, placeholders filled (below).
//   11(4)(b)(ii) and (b)(i): our adaptations in attestationWording.ts, which are NOT Public Safety
//   Canada's text and are labelled so wherever they are shown.
//
// The example (S211_ATTESTATION_EXAMPLE, verbatim in lib/s211/requirements.ts) carries two placeholders,
// "[title]" and "entity [or entities]"; the signature line under it carries 'Name of Entity. They are
// filled here, never in the recorded constant:
//   [title]               the signer's title (section 11), left as "[title]" until one is given
//   entity [or entities]  "entity" for a single report, "entities" for a joint one, left as is until chosen
//   'Name of Entity       the legal name from section 1
//
// ⚠️ NEVER OVER THE USER'S OWN EDITS WITHOUT ASKING. The text last generated is kept as
// _attestation_built. While the attestation still equals it, it follows the answers as they change;
// once the user has edited it, a change is offered, as section 9's rebuild is, and never applied silently.

import { ATTESTATION_DEFAULT, ATTESTATION_SIGNATURE_LINES, ATTESTATION_EXAMPLE_NOTE, type SectionContent } from './builderContent'
import { ATTESTATION_CONTROLLING_TEMPLATE, ATTESTATION_EACH_ENTITY, ADAPTED_ATTESTATION_NOTE } from './attestationWording'

export type AttestationInputs = { title?: unknown; reportType?: unknown; legalName?: unknown; basis?: unknown; controllingEntity?: unknown }
const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function fillAttestation(i: AttestationInputs, template: string = ATTESTATION_DEFAULT): string {
  let t = template
  const title = clean(i.title)
  if (title) t = t.replace('[title]', title)
  if (i.reportType === 'single') t = t.replace('entity [or entities]', 'entity')
  else if (i.reportType === 'joint') t = t.replace('entity [or entities]', 'entities')
  return t
}

/**
 * The attestation to pre-fill for these answers. The published example for a single report (or before a
 * basis is chosen); our adapted wordings for the two joint bases.
 */
export function buildAttestation(i: AttestationInputs): string {
  if (i.basis === 'joint_each') return ATTESTATION_EACH_ENTITY
  if (i.basis === 'joint_controlling') {
    const entity = clean(i.controllingEntity)
    const t = entity ? ATTESTATION_CONTROLLING_TEMPLATE.replace('[controlling entity]', entity) : ATTESTATION_CONTROLLING_TEMPLATE
    return fillAttestation({ title: i.title }, t)
  }
  return fillAttestation(i)
}

/** The note shown under the attestation: whose wording it is. Never the Public Safety Canada note for our text. */
export const attestationNote = (basis: unknown): string =>
  basis === 'joint_each' || basis === 'joint_controlling' ? ADAPTED_ATTESTATION_NOTE : ATTESTATION_EXAMPLE_NOTE

/**
 * The signature lines, with the entity's legal name in the last one when section 1 gives it. The
 * published line opens a double quotation mark before "I have the authority" and never closes it; the
 * filled line closes it after the name, so the statement reads as one quotation. The recorded constant
 * is not changed.
 */
export function signatureLines(legalName: unknown): string[] {
  const name = clean(legalName)
  return ATTESTATION_SIGNATURE_LINES.map(l => (name ? l.replace("'Name of Entity.'", `${name}${name.endsWith('.') ? '' : '.'}"`) : l))
}

/** Any "[...]" placeholder still in a text. */
export const placeholdersIn = (text: unknown): string[] =>
  typeof text === 'string' ? [...text.matchAll(/\[[^\]]+\]/g)].map(m => m[0]) : []

/** True when the user has changed the attestation from the text last generated for them. */
export const attestationEdited = (s11: SectionContent): boolean =>
  typeof s11.attestation_text === 'string' && typeof s11._attestation_built === 'string' &&
  s11.attestation_text.trim() !== s11._attestation_built.trim()

/**
 * Section 11 after an answer changes: the attestation follows it while unedited. When it has been
 * edited, the content is returned unchanged and `offer` holds the new text for the page to show.
 */
export function refreshAttestation(s11: SectionContent, inputs: AttestationInputs): { content: SectionContent; offer: string | null } {
  const next = buildAttestation(inputs)
  const current = typeof s11.attestation_text === 'string' ? s11.attestation_text : null
  if (current === null || !attestationEdited(s11)) {
    if (current === next && s11._attestation_built === next) return { content: s11, offer: null }
    return { content: { ...s11, attestation_text: next, _attestation_built: next }, offer: null }
  }
  return { content: s11, offer: next === current ? null : next }
}

export const PLACEHOLDER_WARNING = (found: string[]) =>
  `The attestation still contains ${found.length === 1 ? 'a placeholder' : 'placeholders'} in square brackets: ${found.join(', ')}. Replace ${found.length === 1 ? 'it' : 'them'} before the report is signed.`

/** What fills the attestation, from section 11 and section 1. */
export function attestationInputs(s11: SectionContent, s1: SectionContent | undefined): AttestationInputs {
  return {
    title: s11.signatory_title,
    reportType: s1?.report_type,
    legalName: s1?.legal_name,
    basis: s11.approval_basis,
    controllingEntity: s11.controlling_entity,
  }
}
