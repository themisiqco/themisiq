// lib/ghg/conciergeDocTypes.ts
// Which uploaded documents the concierge reads a figure from, and which it keeps as evidence only.
//
// WHY THIS IS A SHARED LIB rather than living in the route or the wizard: both need it, and the
// route imports `next/server`. A 'use client' page importing from the route would pull server-only
// code into the browser bundle, so the fuel list lives here and the route imports it from here.
//
// Two lists have to agree — the fuels the extractor can read, and the document types the wizard
// declines to send. When they disagree the customer pays for a model call that returns figures the
// client then discards, and sees an upload that appears to have done nothing. That agreement is
// enforced by lib/ghg/conciergeDocTypes.test.ts, not by a comment asking two lists to be kept in step.

// The fuels the extraction prompt can identify on a document. THE authority — the route builds its
// prompt from this and the wizard filters returned proposals against it.
export const SUPPORTED_FUELS = ['electricity', 'natural_gas', 'diesel', 'propane', 'gasoline'] as const
export type FuelType = typeof SUPPORTED_FUELS[number]

// What each upload slot actually contains, as data.
//
// This mapping did not exist anywhere before — it was implicit in the wizard's slot labels and in
// `fieldFor` in the engine, so nothing could check it. Writing it down is what lets the guard below
// ask "does this document hold anything the extractor can read?" instead of trusting a comment.
//
// Fuel names OUTSIDE SUPPORTED_FUELS are deliberate and load-bearing: 'fuel_oil', 'steam',
// 'refrigerant' and 'biogenic_co2' say what the document holds, and the fact that they are absent
// from SUPPORTED_FUELS is precisely why those slots are evidence-only.
export const DOC_TYPE_FUELS: Record<string, readonly string[]> = {
  utility_bill_gas:    ['natural_gas'],
  utility_electricity: ['electricity'],
  fuel_propane:        ['propane'],
  fuel_diesel:         ['diesel'],
  fleet_fuel:          ['gasoline', 'diesel'],   // one bill carries both
  fuel_oil:            ['fuel_oil'],             // no factor per litre; not an extractable fuel type
  purchased_steam:     ['steam'],                // energy delivered, not a combusted fuel
  service_record:      ['refrigerant'],          // kg of refrigerant, not a fuel
  renewable_cert:      ['electricity'],          // a REC states kWh — readable in principle, see below
  biogenic:            ['biogenic_co2'],         // biomass records; no extractable fuel figure
}

// What each upload slot is CALLED, for anyone who did not choose the token.
//
// The verifier page was rendering `utility_bill_gas` verbatim, in front of an assurance provider —
// our schema on screen where the name of a document should be. These are NOUNS naming the document
// ("Gas bill"), not the wizard's upload prompts ("Upload gas bills"): the wizard is asking for
// something, every other surface is describing something that already exists.
//
// It lives here rather than beside the wizard's <DocUpload label=…> props because those are inline
// JSX, two of them interpolate the location name, and a second surface now needs the same words.
// Keyed identically to DOC_TYPE_FUELS, and conciergeDocTypes.test.ts fails if the two ever diverge —
// this file exists because two lists of these tokens drifted apart once already.
export const DOC_TYPE_LABELS: Record<string, string> = {
  utility_bill_gas:    'Gas bill',
  utility_electricity: 'Electricity bill',
  fuel_propane:        'Propane delivery record',
  fuel_diesel:         'Diesel purchase record',
  fleet_fuel:          'Fleet fuel record',
  fuel_oil:            'Fuel oil delivery record',
  purchased_steam:     'Steam / district heating bill',
  service_record:      'Refrigeration service record',
  renewable_cert:      'REC / PPA certificate',
  biogenic:            'Biomass record',
}

// An unknown token falls back to a neutral noun, NOT to the token itself. Printing the raw token is
// the defect this map removes; reintroducing it as a fallback would just move it to a rarer path.
// The parity test makes an unlabelled-but-known type impossible, so this only fires for a document
// type outside the mapping entirely.
export const docTypeLabel = (docType: string): string =>
  DOC_TYPE_LABELS[docType] ?? 'Source document'

// Document types the concierge does NOT send for extraction.
export const CONCIERGE_UNREAD_DOC_TYPES = new Set<string>([
  'service_record', 'fuel_oil', 'purchased_steam', 'renewable_cert', 'biogenic',
])

// A doc type is READABLE when it holds at least one fuel the extractor supports.
export const docTypeIsReadable = (docType: string): boolean =>
  (DOC_TYPE_FUELS[docType] ?? []).some(f => (SUPPORTED_FUELS as readonly string[]).includes(f))

// Doc types excluded by DECISION — whether or not capability also excludes them. Each needs a
// reason, so an exception reads as a judgement someone made and can argue with, not as a hole.
//
// The two levels are worth separating. For renewable_cert the extractor CAN read the figure and we
// decline; for service_record the proximate cause is that 'refrigerant' is not in SUPPORTED_FUELS,
// but it is absent from that list for the reason below — the decision came first and the capability
// gap follows from it. Recording both keeps the reason attached to the decision rather than leaving
// it implicit in an omission.
//
// Without this, the guard would have two ways to go green: exclude everything the extractor cannot
// read (right), or quietly drop anything inconvenient (wrong). A stated reason separates them.
export const JUDGEMENT_EXCLUDED: Record<string, string> = {
  service_record:
    'Refrigerant accounting is a judgement call — Tier-2/3 method choice, leak and top-up assumptions — ' +
    'not a figure to lift off a page. A confident-looking number here would be worse than a blank.',
  renewable_cert:
    'A REC or PPA certificate states kWh CERTIFICATED, which is not kWh consumed. The extractor could ' +
    'read the number, but writing it into a consumption field would conflate two different quantities. ' +
    'Kept as evidence; the operator enters the covered kWh themselves.',
}
