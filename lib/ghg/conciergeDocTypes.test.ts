import { describe, it, expect } from 'vitest'
import {
  SUPPORTED_FUELS, DOC_TYPE_FUELS, CONCIERGE_UNREAD_DOC_TYPES,
  JUDGEMENT_EXCLUDED, docTypeIsReadable,
} from './conciergeDocTypes'

// ── What the concierge SENDS must match what the extractor can READ ─────────────────────────────
//
// Two lists have to agree: SUPPORTED_FUELS, the fuels the extraction prompt can identify, and
// CONCIERGE_UNREAD_DOC_TYPES, the document types the wizard declines to send. When they disagree in
// either direction a customer is harmed and told nothing:
//
//   sent but unreadable  — the upload burns a model call, the client discards every returned figure
//                          because none matches a supported fuel, and the customer sees an upload
//                          that silently did nothing.
//   unread but readable  — a document the extractor could have read is never sent, so the customer
//                          types in a figure the product could have offered them.
//
// The first is what shipped for fuel oil, steam and RECs before this guard existed.

const FILE = 'lib/ghg/conciergeDocTypes.ts'

describe('every document type the wizard declines to send is one the extractor cannot read', () => {
  it.each([...CONCIERGE_UNREAD_DOC_TYPES])('%s is excluded for a stated reason', docType => {
    const fuels = DOC_TYPE_FUELS[docType] ?? []
    const readable = docTypeIsReadable(docType)
    const judgement = JUDGEMENT_EXCLUDED[docType]

    expect(DOC_TYPE_FUELS[docType],
      `\n\n"${docType}" is in CONCIERGE_UNREAD_DOC_TYPES but has no entry in DOC_TYPE_FUELS, so there\n` +
      `is no way to tell whether excluding it is correct.\n\n` +
      `TO FIX: add "${docType}" to DOC_TYPE_FUELS in ${FILE}, naming what the document actually holds.\n`,
    ).toBeDefined()

    // Readable AND excluded is allowed — but only as a recorded decision, never by silence.
    if (readable) {
      expect(typeof judgement,
        `\n\n"${docType}" holds ${fuels.join(', ')}, which the extractor CAN read — but it is in\n` +
        `CONCIERGE_UNREAD_DOC_TYPES, so it is never sent.\n\n` +
        `WHAT THIS MEANS: the customer types in a figure the product could have read for them, and\n` +
        `nothing on screen explains why this document is treated differently from a gas bill.\n\n` +
        `TO FIX, one of two ways in ${FILE}:\n` +
        `  • it SHOULD be read — remove "${docType}" from CONCIERGE_UNREAD_DOC_TYPES; or\n` +
        `  • it should not — add "${docType}" to JUDGEMENT_EXCLUDED with the reason, so the exclusion\n` +
        `    reads as a decision someone made rather than a list that fell behind.\n`,
      ).toBe('string')

      expect((judgement ?? '').length,
        `\n\n"${docType}" is in JUDGEMENT_EXCLUDED but its reason is empty. The reason is the whole\n` +
        `point — it is what stops an exception being indistinguishable from an oversight.\n`,
      ).toBeGreaterThan(30)
    }
  })
})

describe('every document type the extractor cannot read is one the wizard declines to send', () => {
  it.each(Object.keys(DOC_TYPE_FUELS))('%s is sent only if something on it is readable', docType => {
    const readable = docTypeIsReadable(docType)
    const excluded = CONCIERGE_UNREAD_DOC_TYPES.has(docType)
    const fuels = DOC_TYPE_FUELS[docType]

    if (!readable) {
      expect(excluded,
        `\n\n"${docType}" holds ${fuels.join(', ')}, none of which the extractor supports\n` +
        `(SUPPORTED_FUELS: ${SUPPORTED_FUELS.join(', ')}) — yet it is NOT in CONCIERGE_UNREAD_DOC_TYPES,\n` +
        `so the wizard sends it anyway.\n\n` +
        `WHAT THIS MEANS: the upload costs a model call, every figure that comes back is discarded by\n` +
        `the client's fuel filter, and the customer sees an upload that appears to have failed with no\n` +
        `reason given. This is exactly what fuel oil, steam and RECs did before this guard existed.\n\n` +
        `TO FIX, one of two ways in ${FILE}:\n` +
        `  • add "${docType}" to CONCIERGE_UNREAD_DOC_TYPES so it is kept as evidence and never sent; or\n` +
        `  • if the extractor has learned this fuel, add it to SUPPORTED_FUELS — and update the route's\n` +
        `    FUEL_GUIDANCE and the wizard's knownFuels filter in the same edit.\n`,
      ).toBe(true)
    }
  })
})

describe('the exception list stays honest', () => {
  it('every judgement exclusion is actually excluded', () => {
    const notExcluded = Object.keys(JUDGEMENT_EXCLUDED).filter(d => !CONCIERGE_UNREAD_DOC_TYPES.has(d))
    expect(notExcluded,
      `\n\nThese have a recorded reason for NOT being read, but are not in CONCIERGE_UNREAD_DOC_TYPES,\n` +
      `so they are sent anyway and the reason is dead text:\n` +
      notExcluded.map(d => `    ${d}`).join('\n') +
      `\n\nTO FIX: either exclude them, or drop the JUDGEMENT_EXCLUDED entry in ${FILE}.\n`,
    ).toEqual([])
  })

  it('every judgement exclusion names a document the wizard actually offers', () => {
    const unknown = Object.keys(JUDGEMENT_EXCLUDED).filter(d => !(d in DOC_TYPE_FUELS))
    expect(unknown,
      `\n\nJUDGEMENT_EXCLUDED names document types that do not exist:\n` +
      unknown.map(d => `    ${d}`).join('\n') +
      `\n\nTO FIX: correct the spelling against DOC_TYPE_FUELS in ${FILE}, or remove the entry.\n`,
    ).toEqual([])
  })

  // A guard I wrote and removed: "a capability-excluded type must not also carry a judgement
  // reason". It failed on service_record, and service_record was right. 'refrigerant' is absent from
  // SUPPORTED_FUELS *because* of the judgement recorded against it — the decision is upstream of the
  // capability gap, not an alternative to it. Asserting the two are mutually exclusive would have
  // forced the reason to be deleted to go green, which is the opposite of what these guards are for.
})

describe('the mapping covers what the wizard uploads', () => {
  it('names every fuel the extractor supports at least once', () => {
    const mapped = new Set(Object.values(DOC_TYPE_FUELS).flat())
    const unreachable = SUPPORTED_FUELS.filter(f => !mapped.has(f))
    expect(unreachable,
      `\n\nThe extractor supports these fuels, but no document type holds them, so nothing can ever be\n` +
      `read for them:\n` +
      unreachable.map(f => `    ${f}`).join('\n') +
      `\n\nTO FIX: either add the fuel to the right entry in DOC_TYPE_FUELS in ${FILE}, or remove it from\n` +
      `SUPPORTED_FUELS and from the route's FUEL_GUIDANCE.\n`,
    ).toEqual([])
  })
})
