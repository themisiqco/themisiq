// lib/s211/attestationWording.ts
// OUR OWN WORDING, NOT PUBLIC SAFETY CANADA'S. The attestation pre-fills for the two joint approval
// bases, adapted from Public Safety Canada's example (S211_ATTESTATION_EXAMPLE in requirements.ts) so it
// fits who approved the report. Decided by Lisa on 30 Sep 2026.
//
// ⚠️ KEPT OUT OF requirements.ts ON PURPOSE. That file holds only text transcribed verbatim from the
// guidance, and everything in it may be shown as a Public Safety Canada quotation. Nothing here may be:
// attestationWording.test.ts fails if either wording turns up among the recorded constants or is shown
// under the note that calls the text Public Safety Canada's example.
//
// Why each basis needs its own wording (the guidance's example is written for one signer and one body):
//   11(4)(a)      the example as published, with [title] and "entity" filled. Not in this file.
//   11(4)(b)(ii)  one body approved, the controlling entity's, which the report need not cover, so "the
//                 governing body of the entity [or entities] listed above" becomes the controlling
//                 entity's governing body. The rest of the example is unchanged; a test holds it there.
//   11(4)(b)(i)   each entity's body approved and a member of each signs, so the example's single "I"
//                 becomes "each of the undersigned".

/** 11(4)(b)(ii). "[title]" and "[controlling entity]" are filled from section 11. */
export const ATTESTATION_CONTROLLING_TEMPLATE =
  'In accordance with the requirements of the Fighting Against Forced Labour and Child Labour in Supply Chains Act (Act), and in particular section 11 thereof, I, in the capacity of [title], attest that I have reviewed the information contained in the report on behalf of the governing body of [controlling entity], which controls each entity listed above. Based on my knowledge, and having exercised reasonable diligence, I attest that the information in the report is true, accurate and complete in all material respects for the purposes of the Act, for the reporting year listed within this report.'

/** 11(4)(b)(i). No placeholder: each signer's name and title are in their own signature block. */
export const ATTESTATION_EACH_ENTITY =
  'In accordance with the requirements of the Fighting Against Forced Labour and Child Labour in Supply Chains Act (Act), and in particular section 11 thereof, each of the undersigned, in the capacity of a member of the governing body of the entity for which they sign below, attests that they have reviewed the information contained in the report on behalf of that governing body. Based on their knowledge, and having exercised reasonable diligence, each attests that the information in the report is true, accurate and complete in all material respects for the purposes of the Act, for the reporting year listed within this report.'

/** Shown under the attestation for both joint bases, in place of the note that calls it Public Safety Canada's example. */
export const ADAPTED_ATTESTATION_NOTE =
  'This wording is adapted from Public Safety Canada’s example to fit how this report was approved. It is not text Public Safety Canada publishes. You may edit it. What the Act requires is a statement of how the report was approved and the signature of at least one member of each governing body that approved it.'
