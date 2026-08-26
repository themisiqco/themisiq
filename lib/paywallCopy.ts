// lib/paywallCopy.ts
// The Materiality Assessment's paywall copy, in one place.
//
// WHY A FILE AND NOT A DEFAULT. app/components/PaywallCard.tsx removed its title/body defaults
// after they silently made /dashboard/deals/report advertise Climate Risk — "a default that is
// right once in three uses is not a default". That reasoning holds here: this module must not put
// its name back into a component GHG, CBAM and Supply Chain also render. So the copy is a constant
// the call sites import, and passing it stays explicit at every wall.
//
// ⚠️ THE PRODUCT NAME IS READ, NEVER RETYPED. It comes from MODULES in lib/pricing.ts, which is the
// authority for what this module is called. Fifteen walls restating a display name is fifteen
// places to miss when it changes — and it changed twice in one week: the ModuleKey on 25 Aug 2026
// and the display name on 26 Aug.
//
// ⚠️ THE RULE THIS FILE IS BUILT AROUND. "Materiality Assessment" is the PRODUCT; "impact
// materiality" is the AXIS, the inside-out half of double materiality and an ESRS term of art.
// Never one where the other is meant, and never both in one sentence meaning different things.
// Two bodies below used to end "…as evidence for your materiality assessment", which after the
// rename would have printed the product's own name mid-sentence meaning the exercise. The clause is
// dropped: "gather stakeholder views as evidence" says the same thing and cannot be misread.
// "The impact worksheet" survives untouched — that names the AXIS the worksheet covers, correctly.
import { MODULES } from './pricing'

// Non-null asserted deliberately: pricing.test.ts derives its checks from MODULES, so a missing key
// fails a test rather than rendering a wall with a hole in the sentence.
const PRODUCT = MODULES.find(m => m.key === 'double-materiality')!.name

/**
 * One title, all fifteen walls.
 * ⚠️ "the", MATCHING THE OTHER FIVE MODULES. Deals, Climate Risk and Supply Chain all say
 * "Unlock the X module". This module said "Unlock Impact Materiality" — no article, no noun — and
 * was the odd one out before the rename. The article comes back with the new name.
 */
export const PAYWALL_TITLE = `Unlock the ${PRODUCT}`

/**
 * The shape every body takes: what this screen does, then what unlocking buys.
 * The second half is optional — four walls state the fact and stop, which is right where the
 * screen's own purpose already answers "and then what".
 *
 * ⚠️ THE VERB IS AN ARGUMENT, NOT A CONSTANT, AND IT IS NOT FUSSINESS. Two of these subjects are
 * plural ("Stakeholder surveys", "Stakeholder survey results") and the rest are singular. A
 * hardcoded "is" printed "Stakeholder surveys is part of the…" on five of the fifteen walls — the
 * first draft of this file did exactly that, and it was caught only by rendering every string
 * rather than reading the template. A union type makes the choice unskippable at each call.
 */
const body = (subject: string, verb: 'is' | 'are', unlockTo?: string) =>
  `${subject} ${verb} part of the ${PRODUCT}.` + (unlockTo ? ` Unlock it to ${unlockTo}.` : '')

/** Five worksheet routes: [id], determine, determinations, register, iro-1. One string, unchanged. */
export const PAYWALL_WORKSHEET = body('The impact worksheet', 'is')

/** The worksheet INDEX, which is a list and can say what the list becomes. */
export const PAYWALL_WORKSHEET_INDEX = body(
  'The impact worksheet', 'is',
  'record ESRS severity determinations and share the work with colleagues',
)

/**
 * All five survey routes — index, [id], scope, respondents, respondents/import.
 * ⚠️ CONSOLIDATED FROM THREE. The scope and respondents screens carried the fullest sentence, the
 * round screen a four-word variant ("invite stakeholders, and gather their views"), and the import
 * screen only the bare fact. Nothing about importing a respondent list justifies telling the
 * customer less than the scope screen does; the difference was drift, not design.
 */
export const PAYWALL_SURVEY = body(
  'Stakeholder surveys', 'are',
  'run a survey round, choose which ESRS sub-topics are in scope, and gather stakeholder views as evidence',
)

/** Results is its own screen with its own promise. */
export const PAYWALL_SURVEY_RESULTS = body(
  'Stakeholder survey results', 'are',
  'run a survey round and read what your stakeholders said',
)

/** ⚠️ TWO SINGLES, KEPT DISTINCT. Creating and editing are different acts and the wall says which. */
export const PAYWALL_ASSESSMENT_NEW = body('Creating an assessment', 'is')
export const PAYWALL_ASSESSMENT_EDIT = body('Editing an assessment', 'is')

/** The stakeholder board paper. */
export const PAYWALL_STAKEHOLDER_REPORT = body('The stakeholder board paper', 'is')

/**
 * Every wall in this module preselects the module on /pricing.
 * ⚠️ `impact` IS THE SHORTHAND ID, NOT THE ModuleKey — /pricing parses ?modules= against
 * LEGACY_PRICING_PAGE_ID's keys, and an unrecognised slug silently falls back to GHG rather than
 * erroring. See the slug note in app/components/PaywallCard.tsx.
 */
export const PAYWALL_HREF = '/pricing?modules=impact'
