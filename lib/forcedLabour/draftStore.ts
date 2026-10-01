// lib/forcedLabour/draftStore.ts
// Server-only. The stored answers to per-country questions on a report, from every country this account may see,
// as draft sources (lib/forcedLabour/drafts.ts). Canada's are its sections in s211_report_sections; every other
// country's are its record in fl_report_countries.

import type { SupabaseClient } from '@supabase/supabase-js'
import { FIELD_REGISTRY } from './fieldRegistry'
import { builderFor } from './countryBuilders'
import { visibleCountries } from './countryGate'
import { draftSources, type ConceptAnswer } from './drafts'
import type { CountryKey } from './countries'

const REG = new Map(FIELD_REGISTRY.map(f => [f.key, f]))

/**
 * Draft sources for a report, or an empty map when no other country is on it (so a Canada-only report reads
 * exactly as before, with no extra question asked of the database beyond the country list).
 */
export async function loadDraftSources(supabase: SupabaseClient, s211Id: string | null, flReportId: string | null):
  Promise<Map<string, ConceptAnswer[]>> {
  if (!flReportId) return new Map()
  const { data: rows } = await supabase.from('fl_report_countries').select('country, content').eq('report_id', flReportId)
  const others = (rows ?? []).filter(r => r.country !== 'canada')
  if (others.length === 0) return new Map()
  const visible = new Set<CountryKey>((await visibleCountries(supabase)).map(c => c.key))
  const answers: ConceptAnswer[] = []

  if (s211Id && visible.has('canada')) {
    const { data: sections } = await supabase.from('s211_report_sections').select('section_key, content').eq('report_id', s211Id)
    for (const s of sections ?? []) for (const [field, value] of Object.entries((s.content ?? {}) as Record<string, unknown>)) {
      const key = `${s.section_key}.${field}`
      if (REG.get(key)?.concept) answers.push({ country: 'canada', registryKey: key, value })
    }
  }
  for (const r of others) {
    const country = r.country as CountryKey
    const builder = builderFor(country)
    if (!builder || !visible.has(country)) continue
    const content = (r.content ?? {}) as Record<string, Record<string, unknown>>
    for (const def of builder.sections) for (const f of def.fields) {
      if (!REG.get(f.registryKey)?.concept) continue
      const v = content[def.key]?.[f.key]
      if (v !== undefined) answers.push({ country, registryKey: f.registryKey, value: v })
    }
  }
  return draftSources(answers)
}
