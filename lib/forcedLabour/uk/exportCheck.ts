// lib/forcedLabour/uk/exportCheck.ts
// Before the UK statement PDF (Stage D2, 1 Oct 2026): what blocks export, and what to warn about. Pure. The same
// pattern as Canada's lib/s211/exportCheck.ts. UK-specific copy, so British spelling.
//
// THE GATE. Export is refused unless:
//   statement details, steps taken and approval are each marked complete, with their required answers still there
//     (the six topics are optional: the Act lists them as what a statement may include);
//   the financial year can be worked out, and the organisation giving the statement is chosen;
//   a group statement names the organisations it covers;
//   no answer started from another country's report is left unconfirmed (lib/forcedLabour/drafts.ts).
// THE SCANS. Warnings, never blocks: what looks like personal information (the signer's name and position, and the
// group approval rows, are not scanned), and characters the typeface cannot draw. Personal information is looked for
// in UK forms first (postcodes, telephone numbers, National Insurance numbers: ukFindPersonalInfo), then in the forms
// Canada's scan knows (e-mail, North American and other + numbers, street addresses); a stretch of text is reported once.

import { UK_SECTIONS, ukFinancialYear, type UkSectionKey } from './builderContent'
import { countryMissingRequired, countryInvalidAnswers } from '../countryAdapter'
import { savedDrafts, LAW_SCOPE } from '../drafts'
import { findPersonalInfo, type PersonalInfoKind } from '../../s211/exportCheck'
import { charisCovers } from '../../pdf/charisCoverage'
import { fallbackText } from '../../pdf/fallbackText'
import type { SectionContent } from '../../s211/builderContent'
import type { SectionStatus } from '../../s211/sectionStatus'

export type UkSectionState = { status: SectionStatus; content: SectionContent }
export type UkBlocker = { section: UkSectionKey | null; message: string; missing: string[] }
export const UK_REQUIRED_SECTIONS: readonly UkSectionKey[] = ['statement_details', 'steps_taken', 'approval']

export function ukExportGate(sections: Partial<Record<UkSectionKey, UkSectionState>>, entities: { giving: string | null; covered: string[] }):
  { ready: boolean; blockers: UkBlocker[] } {
  const blockers: UkBlocker[] = []
  for (const d of UK_SECTIONS.filter(s => UK_REQUIRED_SECTIONS.includes(s.key))) {
    const st = sections[d.key] ?? { status: 'not_started' as SectionStatus, content: {} }
    const missing = [...countryMissingRequired(d, st.content), ...countryInvalidAnswers(d, st.content)]
    if (st.status !== 'complete') blockers.push({ section: d.key, message: `${d.number}. ${d.title} is not marked complete.`, missing })
    else if (missing.length) blockers.push({ section: d.key, message: `${d.number}. ${d.title} is marked complete, but an answer it needs is missing or not accepted. Open it and mark it complete again.`, missing })
  }
  const details = sections.statement_details?.content ?? {}
  if (!ukFinancialYear(details)) blockers.push({ section: 'statement_details', message: 'The financial year the statement covers is not complete: give the year-end month, day and year.', missing: [] })
  if (!entities.giving) blockers.push({ section: 'statement_details', message: 'Choose the organisation giving the statement.', missing: [] })
  if (details.is_group_statement === 'Yes' && entities.covered.filter(n => n !== entities.giving).length === 0)
    blockers.push({ section: 'statement_details', message: 'A group statement covers more than one organisation: choose the others it covers.', missing: [] })
  for (const d of UK_SECTIONS) {
    const drafts = savedDrafts({ [d.key]: sections[d.key]?.content })
    if (!drafts.length) continue
    blockers.push({ section: d.key, missing: drafts.map(x => d.fields.find(f => f.key === x.field)?.label ?? x.field),
      message: `${d.number}. ${d.title}: ${drafts.length === 1 ? 'an answer' : `${drafts.length} answers`} started from another country’s report ${drafts.length === 1 ? 'is' : 'are'} not confirmed. Edit each, or confirm that it covers ${LAW_SCOPE.uk}.` })
  }
  return { ready: blockers.length === 0, blockers }
}

const EXEMPT = new Set(['approval.signer_name', 'approval.signer_title', 'approval.group_approvals'])
const textsOf = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(textsOf) : v && typeof v === 'object' ? Object.values(v).flatMap(textsOf) : []

export type UkPersonalInfoKind = PersonalInfoKind | 'postcode' | 'ni_number'
export const UK_PERSONAL_INFO_KIND_LABEL: Record<UkPersonalInfoKind, string> = {
  email: 'an email address',
  phone: 'a telephone number',
  address: 'a street address or postcode',
  postcode: 'a UK postcode',
  ni_number: 'a National Insurance number',
  sin: 'a nine-digit number that could be a Canadian Social Insurance Number',
}

// UK forms. Upper case only, as written on letters and forms, so ordinary words are not caught.
const UK_PATTERNS: { kind: UkPersonalInfoKind; re: RegExp; keep?: (m: string) => boolean }[] = [
  // Postcodes: "SW1A 1AA", "M1 1AE", "B33 8TH", "CR2 6XH", "DN55 1PT", "EC1A1BB". The inward part's letters exclude C, I, K, M, O, V.
  { kind: 'postcode', re: /\b(?:GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-HJKPSTUW\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b/g },
  // +44, with or without "(0)": "+44 20 7946 0958", "+44 (0)161 496 0000", "+44 7700 900123". 10 digits after the 44.
  { kind: 'phone', re: /\+44[\s.-]?(?:\(0\)[\s.-]?)?\d(?:[\s.-]?\d){8,9}(?!\d)/g, keep: m => m.replace(/\(0\)/, '').replace(/\D/g, '').length === 12 },
  // 0-prefixed landline and mobile, 10 or 11 digits: "020 7946 0958", "(0161) 496 0000", "01632 960001", "07700 900123".
  { kind: 'phone', re: /(?<![\w+(.\/-])\(?0\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?![\w.\/-])/g, keep: m => /^\(?0[1-9]/.test(m) && [10, 11].includes(m.replace(/\D/g, '').length) },
  // National Insurance numbers: "AB 12 34 56 C". Prefixes HMRC never issues (D, F, I, Q, U, V; O second; BG, GB, KN, NK, NT, TN, ZZ) are left out.
  { kind: 'ni_number', re: /\b(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z] ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g },
]

/** Every pattern match in one string: UK forms first, then Canada's; overlapping matches are reported once. */
export function ukFindPersonalInfo(text: string): { kind: UkPersonalInfoKind; match: string }[] {
  const out: { kind: UkPersonalInfoKind; match: string; at: number; end: number }[] = []
  const add = (kind: UkPersonalInfoKind, raw: string, at: number) => {
    const end = at + raw.length
    if (!out.some(o => at < o.end && end > o.at)) out.push({ kind, match: raw.trim(), at, end })
  }
  for (const p of UK_PATTERNS) for (const m of text.matchAll(p.re)) if (!p.keep || p.keep(m[0].trim())) add(p.kind, m[0], m.index ?? 0)
  let from = 0
  for (const h of findPersonalInfo(text)) {
    const at = text.indexOf(h.match, from)
    if (at < 0) continue
    from = at + 1
    add(h.kind, h.match, at)
  }
  return out.sort((a, b) => a.at - b.at).map(({ kind, match }) => ({ kind, match }))
}

export type UkPersonalInfoHit = { section: UkSectionKey; title: string; field: string; kind: UkPersonalInfoKind; match: string }
export function ukScanPersonalInformation(sections: Partial<Record<UkSectionKey, SectionContent>>): UkPersonalInfoHit[] {
  const hits: UkPersonalInfoHit[] = []
  for (const d of UK_SECTIONS) for (const [key, value] of Object.entries(sections[d.key] ?? {})) {
    if (key.startsWith('_') || EXEMPT.has(`${d.key}.${key}`)) continue
    const label = d.fields.find(f => f.key === key)?.label ?? key
    for (const t of textsOf(value)) for (const h of ukFindPersonalInfo(t)) hits.push({ section: d.key, title: `${d.number}. ${d.title}`, field: label, kind: h.kind, match: h.match })
  }
  return hits
}
export const UK_PERSONAL_INFO_NOTE =
  'This check looks for email addresses, UK postcodes, UK telephone numbers (+44, landline and mobile), National Insurance numbers, other telephone numbers written with a leading +, and street addresses written in North American form. It does not recognise a UK street address without its postcode, or a person’s name, so read the statement for these before it is signed.'

export type UkUndrawableHit = { section: UkSectionKey; title: string; field: string; chars: string[]; printedAs: string }
export function ukScanUndrawable(sections: Partial<Record<UkSectionKey, SectionContent>>): UkUndrawableHit[] {
  const hits: UkUndrawableHit[] = []
  for (const d of UK_SECTIONS) for (const [key, value] of Object.entries(sections[d.key] ?? {})) {
    if (key.startsWith('_')) continue
    const texts = textsOf(value)
    const chars = [...new Set(texts.flatMap(t => [...t].filter(ch => ch !== '\n' && !charisCovers(ch.codePointAt(0)!))))]
    if (!chars.length) continue
    const first = texts.find(t => [...t].some(ch => chars.includes(ch)))!
    hits.push({ section: d.key, title: `${d.number}. ${d.title}`, field: d.fields.find(f => f.key === key)?.label ?? key, chars,
      printedAs: fallbackText(first.length > 120 ? first.slice(0, 120) : first, charisCovers) })
  }
  return hits
}
