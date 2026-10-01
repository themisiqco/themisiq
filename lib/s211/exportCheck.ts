// lib/s211/exportCheck.ts
// Before the PDF: what blocks export, and what in the report text looks like personal information. Pure.
//
// THE GATE. Export is refused unless every required section is complete AND its required answers are
// still there, and the attestation carries no square-bracket placeholder. "Complete" alone is not
// trusted: a section marked complete before a rule tightened keeps its stored status until its next
// edit, so the gate re-checks the answers as the check page does. Section 10 never blocks: the Act
// does not ask for it.
//
// THE SCAN. Warnings, never blocks. The guidance forbids personal information in the report except
// the attesting official's name and title, so the signer's name and title fields are not scanned. The
// patterns are deliberately broad: a false warning costs the user a glance, a missed one costs a
// published home address. Names cannot be found by pattern, and the check page says so.

import { SECTIONS, sectionDef, type Field, type SectionContent, type SectionKey } from './builderContent'
import { missingRequired, invalidAnswers, type SectionStatus } from './sectionStatus'
import { placeholdersIn, PLACEHOLDER_WARNING } from './attestation'
import { signerMismatches } from './reportModel'
import { charisCovers, codePointLabel } from '../pdf/charisCoverage'
import { fallbackText } from '../pdf/fallbackText'
import { savedDrafts, LAW_SCOPE } from '../forcedLabour/drafts'

export type SectionState = { status: SectionStatus; content: SectionContent }
export type ExportBlocker = { section: SectionKey | null; message: string; missing: string[] }

export function exportGate(sections: Partial<Record<SectionKey, SectionState>>): { ready: boolean; blockers: ExportBlocker[] } {
  const blockers: ExportBlocker[] = []
  for (const d of SECTIONS) {
    if (d.optional) continue
    const st = sections[d.key] ?? { status: 'not_started' as SectionStatus, content: {} }
    const missing = missingRequired(d.key, st.content)
    const invalid = invalidAnswers(d.key, st.content)
    if (st.status !== 'complete') {
      blockers.push({ section: d.key, message: `${d.number}. ${d.title} is not marked complete.`, missing: [...missing, ...invalid] })
    } else if (missing.length || invalid.length) {
      blockers.push({ section: d.key, message: `${d.number}. ${d.title} is marked complete, but an answer it needs is missing or not accepted. Open it and mark it complete again.`, missing: [...missing, ...invalid] })
    }
  }
  const found = placeholdersIn(sections.approval_attestation?.content?.attestation_text)
  if (found.length) blockers.push({ section: 'approval_attestation', message: PLACEHOLDER_WARNING(found), missing: [] })
  // Under 11(4)(b)(i) a member of each entity's governing body signs: every entity covered needs a signer.
  const { unsigned, unknown } = signerMismatches(sections.approval_attestation?.content ?? {}, sections.report_details?.content ?? {})
  // A list of legal names ends a sentence: no second full stop after "Inc.".
  const names = (xs: string[]) => { const t = xs.join('; '); return /[.!?]$/.test(t) ? t : `${t}.` }
  if (unsigned.length) blockers.push({ section: 'approval_attestation', message: `No signer is named for ${names(unsigned)} Each entity's governing body approved the report, so a member of each signs it.`, missing: [] })
  if (unknown.length) blockers.push({ section: 'approval_attestation', message: `A signer row names an entity section 1 does not list: ${names(unknown)} Use the legal name exactly as section 1 gives it.`, missing: [] })
  // An answer started from another country's report (lib/forcedLabour/drafts.ts) and saved without being edited or
  // confirmed. A Canada-only report never has one.
  for (const d of SECTIONS) {
    const drafts = savedDrafts({ [d.key]: sections[d.key]?.content })
    if (!drafts.length) continue
    const labels = drafts.map(x => d.fields.find(f => f.key === x.field)?.label ?? x.field)
    blockers.push({ section: d.key, missing: labels,
      message: `${d.number}. ${d.title}: ${drafts.length === 1 ? 'an answer' : `${drafts.length} answers`} started from another country\u2019s report ${drafts.length === 1 ? 'is' : 'are'} not confirmed. Edit each, or confirm that it covers ${LAW_SCOPE.canada}.` })
  }
  return { ready: blockers.length === 0, blockers }
}

// ── Personal information ──────────────────────────────────────────────────────────────────────────

export type PersonalInfoKind = 'email' | 'phone' | 'address' | 'sin'
export type PersonalInfoHit = { section: SectionKey; number: number; title: string; field: string; kind: PersonalInfoKind; match: string }

export const PERSONAL_INFO_KIND_LABEL: Record<PersonalInfoKind, string> = {
  email: 'an e-mail address',
  phone: 'a telephone number',
  address: 'a street address or postal code',
  sin: 'a nine-digit number that could be a Social Insurance Number (a business number is also nine digits and is not personal information)',
}

/** The one exemption the guidance makes: the attesting official's name and title. */
const EXEMPT = new Set(['approval_attestation.signatory_name', 'approval_attestation.signatory_title', 'approval_attestation.entity_signatories'])

const STREET_TYPES = 'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Crescent|Cres|Place|Pl|Parkway|Pkwy|Highway|Hwy|Terrace|Trail|Circle|Square|Sq'
const PATTERNS: { kind: PersonalInfoKind; re: RegExp; keep?: (m: string) => boolean }[] = [
  { kind: 'email', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  // North American: (416) 555-0100, 416-555-0100, 416.555.0100, 1 416 555 0100, +1-416-555-0100.
  { kind: 'phone', re: /(?<![\d-])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\d-])/g },
  // International, written with a leading +: 8 to 15 digits in groups.
  { kind: 'phone', re: /\+\d{1,3}(?:[\s.-]?\d{1,5}){2,5}(?!\d)/g, keep: m => { const n = m.replace(/\D/g, '').length; return n >= 8 && n <= 15 } },
  // A civic number, up to five capitalized words, and a street type: "221 King Street West".
  { kind: 'address', re: new RegExp(`\\b\\d{1,6}[A-Z]?(?:\\s+[A-Z][\\w'.-]*){0,4}\\s+(?:${STREET_TYPES})\\b\\.?`, 'g') },
  // French civic addresses: "1200, rue Sainte-Catherine", "45 boulevard René-Lévesque".
  { kind: 'address', re: /\b\d{1,6},?\s+(?:rue|avenue|boulevard|boul\.|chemin|route|rang)\s+[A-ZÀ-Ý][\wÀ-ÿ'-]*/gi },
  { kind: 'address', re: /\b(?:P\.?\s?O\.?\s?Box|Post Office Box|Case postale|C\.P\.)\s*\d+/gi },
  // Canadian postal code: A1A 1A1.
  { kind: 'address', re: /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][\s-]?\d[ABCEGHJ-NPRSTV-Z]\d\b/g },
  // Nine digits in three groups, or run together and passing the Luhn check SINs carry.
  { kind: 'sin', re: /(?<![\d-])\d{3}[\s-]\d{3}[\s-]\d{3}(?![\d-])/g },
  { kind: 'sin', re: /(?<![\d,.])\d{9}(?![\d,.])/g, keep: m => luhn(m) },
]

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

/** Every pattern match in one string, a phone number never also reported as a SIN. */
export function findPersonalInfo(text: string): { kind: PersonalInfoKind; match: string }[] {
  const out: { kind: PersonalInfoKind; match: string; at: number; end: number }[] = []
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const match = m[0].trim()
      if (p.keep && !p.keep(match)) continue
      const at = m.index ?? 0, end = at + m[0].length
      if (out.some(o => at < o.end && end > o.at)) continue
      out.push({ kind: p.kind, match, at, end })
    }
  }
  return out.sort((a, b) => a.at - b.at).map(({ kind, match }) => ({ kind, match }))
}

const textsOf = (v: unknown): string[] =>
  typeof v === 'string' ? [v]
    : Array.isArray(v) ? v.flatMap(textsOf)
    : v && typeof v === 'object' ? Object.values(v).flatMap(textsOf)
    : []

/**
 * Scan the text that will be printed. Keys starting with "_" are builder bookkeeping and never print;
 * section 10 is skipped when it is not used, because it is then left out of the report.
 */
export function scanPersonalInformation(sections: Partial<Record<SectionKey, SectionContent>>): PersonalInfoHit[] {
  const hits: PersonalInfoHit[] = []
  for (const d of SECTIONS) {
    const c = sections[d.key] ?? {}
    if (d.optional && c.has_other_information !== 'Yes') continue
    const labelOf = (key: string) => sectionDef(d.key).fields.find((f: Field) => f.key === key)?.label ?? 'Nothing to report sentence'
    for (const [key, value] of Object.entries(c)) {
      if (key.startsWith('_') || EXEMPT.has(`${d.key}.${key}`)) continue
      for (const text of textsOf(value)) {
        for (const h of findPersonalInfo(text)) {
          hits.push({ section: d.key, number: d.number, title: d.title, field: labelOf(key), kind: h.kind, match: h.match })
        }
      }
    }
  }
  return hits
}

export const PERSONAL_INFO_NAMES_NOTE =
  'This check looks for e-mail addresses, telephone numbers, street addresses and Social Insurance Number patterns. It cannot recognize a person’s name, so read the report for names before it is signed.'

// ── Characters the report's typeface cannot draw ──────────────────────────────────────────────────

export type UndrawableHit = { section: SectionKey; number: number; title: string; field: string; chars: string[]; printedAs: string }

/**
 * Typed text containing a character outside the embedded Charis subset (lib/pdf/charisCoverage.ts).
 * The PDF would print it without its accent, or as "?". Every printed answer is checked, names
 * included: the signer's name is exempt from the personal-information rule, not from the typeface.
 * `printedAs` is the first such answer as the PDF would print it.
 */
export function scanUndrawable(sections: Partial<Record<SectionKey, SectionContent>>): UndrawableHit[] {
  const hits: UndrawableHit[] = []
  for (const d of SECTIONS) {
    const c = sections[d.key] ?? {}
    if (d.optional && c.has_other_information !== 'Yes') continue
    for (const [key, value] of Object.entries(c)) {
      if (key.startsWith('_')) continue
      const texts = textsOf(value)
      const chars = [...new Set(texts.flatMap(t => [...t].filter(ch => ch !== '\n' && !charisCovers(ch.codePointAt(0)!))))]
      if (!chars.length) continue
      const first = texts.find(t => [...t].some(ch => chars.includes(ch)))!
      const field = sectionDef(d.key).fields.find((f: Field) => f.key === key)?.label ?? 'Nothing to report sentence'
      hits.push({ section: d.key, number: d.number, title: d.title, field, chars, printedAs: fallbackText(first.length > 120 ? first.slice(0, 120) : first, charisCovers) })
    }
  }
  return hits
}

export const describeChars = (chars: string[]) => chars.map(ch => (ch === '\t' ? `tab (${codePointLabel(ch)})` : `${ch} (${codePointLabel(ch)})`)).join(', ')
