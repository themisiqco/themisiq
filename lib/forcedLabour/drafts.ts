// lib/forcedLabour/drafts.ts
// Drafts across countries (Stage D1b, 1 Oct 2026). Pure.
//
// A per-country answer (fieldRegistry.ts PER_COUNTRY) is the country's own, because its meaning depends on the
// law's scope. When a country opens one that has no answer yet, it starts from another country's answer to the
// same question (the same `concept`), as a DRAFT: the value is filled in, and the section records where it came
// from under DRAFT_KEY until the user edits that field or confirms it. The badge names the source country and
// this law's scope, from the constants (LAW_SCOPE), so the user checks the draft covers it.
//
// OFFERED, THEN SAVED (1 Oct 2026). A draft filled in on reading is OFFERED (OFFERED_KEY): shown with its note,
// stored nowhere. When the user saves the section, every offered draft still holding its value becomes a SAVED
// draft (DRAFT_KEY), still marked (settleOffered, called by both save routes). A saved draft blocks export for its
// country until the user edits the field or confirms it; an offered one does not, because nothing of it would
// print. Only countries this account may see are sources, so a country in preview never shows through another
// country's drafts.

import { FIELD_REGISTRY } from './fieldRegistry'
import { COUNTRIES, type CountryKey } from './countries'
import { isFilled } from '../s211/sectionStatus'
import type { SectionContent } from '../s211/builderContent'

/** Saved drafts, in a section's stored content: { "<field>": "<country the draft came from>" }. These block export. */
export const DRAFT_KEY = '_drafts'
/** Offered drafts, only ever in what a read returns: the same shape. Never stored (settleOffered). */
export const OFFERED_KEY = '_offered'

/**
 * Each law's scope as its own text words it: Canada's Act s.11(3)(b) "forced labour and child labour", the UK Act
 * s.54(4) "slavery and human trafficking", Australia's Act s.16(1)(c) "modern slavery". drafts.test.ts holds each
 * to its constant.
 */
export const LAW_SCOPE: Record<CountryKey, string> = {
  canada: 'forced labour and child labour',
  uk: 'slavery and human trafficking',
  australia: 'modern slavery',
}

const REG = new Map(FIELD_REGISTRY.map(f => [f.key, f]))
export const conceptOf = (registryKey: string): string | undefined => REG.get(registryKey)?.concept

/** One country's stored answer to a per-country question. */
export type ConceptAnswer = { country: CountryKey; registryKey: string; value: unknown }
/** The answers available as drafts, by concept, in COUNTRIES order (Canada first). */
export function draftSources(answers: readonly ConceptAnswer[]): Map<string, ConceptAnswer[]> {
  const order = new Map(COUNTRIES.map((c, i) => [c.key, i]))
  const out = new Map<string, ConceptAnswer[]>()
  for (const a of answers) {
    const concept = conceptOf(a.registryKey)
    if (!concept || !isFilled(a.value)) continue
    out.set(concept, [...(out.get(concept) ?? []), a])
  }
  for (const list of out.values()) list.sort((x, y) => (order.get(x.country) ?? 9) - (order.get(y.country) ?? 9))
  return out
}

const marks = (c: SectionContent, key: string): Record<string, CountryKey> => {
  const d = (c as Record<string, unknown>)[key]
  return d && typeof d === 'object' && !Array.isArray(d) ? d as Record<string, CountryKey> : {}
}
/** Saved drafts: these block export. */
export const draftsOf = (c: SectionContent): Record<string, CountryKey> => marks(c, DRAFT_KEY)
/** Offered drafts: shown, not stored, not blocking. */
export const offeredOf = (c: SectionContent): Record<string, CountryKey> => marks(c, OFFERED_KEY)
/** Every draft the page shows a note for, offered or saved. */
export const draftNotes = (c: SectionContent): Record<string, CountryKey> => ({ ...offeredOf(c), ...draftsOf(c) })

/**
 * The section as `country` opens it: every per-country field with no answer yet filled from another country's
 * answer to the same question, and marked. `skip` lists fields that draft themselves (Canada's steps summary).
 */
export function withDrafts(country: CountryKey, fields: readonly { key: string; registryKey: string }[], content: SectionContent,
  sources: ReadonlyMap<string, readonly ConceptAnswer[]>, skip: ReadonlySet<string> = new Set()): SectionContent {
  let out: Record<string, unknown> | null = null
  for (const f of fields) {
    if (skip.has(f.key)) continue
    const concept = conceptOf(f.registryKey)
    if (!concept || isFilled((content as Record<string, unknown>)[f.key])) continue
    const src = sources.get(concept)?.find(a => a.country !== country)
    if (!src) continue
    out ??= { ...(content as Record<string, unknown>), [OFFERED_KEY]: { ...offeredOf(content) } }
    out[f.key] = src.value
    ;(out[OFFERED_KEY] as Record<string, CountryKey>)[f.key] = src.country
  }
  return (out ?? content) as SectionContent
}

const without = (c: Record<string, unknown>, markKey: string, field: string) => {
  const d = marks(c as SectionContent, markKey)
  if (!(field in d)) return
  const { [field]: _gone, ...rest } = d
  void _gone
  if (Object.keys(rest).length) c[markKey] = rest
  else delete c[markKey]
}
/** The field edited or confirmed: no longer a draft, offered or saved. */
export function clearDraft(c: SectionContent, key: string): SectionContent {
  if (!(key in draftsOf(c)) && !(key in offeredOf(c))) return c
  const out: Record<string, unknown> = { ...(c as Record<string, unknown>) }
  without(out, DRAFT_KEY, key)
  without(out, OFFERED_KEY, key)
  return out as SectionContent
}

/**
 * What a save stores: offered drafts the user kept (the field still holds a value) become saved drafts, still
 * marked; the offered mark itself is never stored. Called by the Canada and the country section save routes.
 */
export function settleOffered(c: SectionContent): SectionContent {
  const offered = offeredOf(c)
  if (!(OFFERED_KEY in (c as Record<string, unknown>))) return c
  const out: Record<string, unknown> = { ...(c as Record<string, unknown>) }
  delete out[OFFERED_KEY]
  const kept = Object.fromEntries(Object.entries(offered).filter(([f]) => isFilled(out[f])))
  if (Object.keys(kept).length) out[DRAFT_KEY] = { ...draftsOf(c), ...kept }
  return out as SectionContent
}

/** Every saved draft in a set of sections, for the export gate and the check page. */
export function savedDrafts(sections: Record<string, SectionContent | undefined>): { section: string; field: string; from: CountryKey }[] {
  return Object.entries(sections).flatMap(([section, c]) => Object.entries(draftsOf(c ?? {})).map(([field, from]) => ({ section, field, from })))
}

const nameOf = (k: CountryKey) => COUNTRIES.find(c => c.key === k)?.name ?? k
/** The badge on a draft. UK copy in British spelling is the same sentence: no word differs. */
export const draftBadge = (from: CountryKey, to: CountryKey): string =>
  `Started from your ${nameOf(from)} answer: check it covers ${LAW_SCOPE[to]}`
export const draftConfirmLabel = (to: CountryKey): string => `It covers ${LAW_SCOPE[to]}`

/**
 * A section as it is STORED: without the drafts a read offered (their values and their mark). What a check page runs
 * the export gate on, so it agrees with the export, which reads only what is stored.
 */
export function withoutOffered(c: SectionContent): SectionContent {
  const offered = offeredOf(c)
  if (!(OFFERED_KEY in (c as Record<string, unknown>))) return c
  const out: Record<string, unknown> = { ...(c as Record<string, unknown>) }
  delete out[OFFERED_KEY]
  for (const f of Object.keys(offered)) delete out[f]
  return out as SectionContent
}

