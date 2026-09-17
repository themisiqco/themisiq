// ── THE INDUSTRY DROPDOWN ────────────────────────────────────────────────────────────────────────
//
// One grouped list of EXIOBASE's 163 industries, built from lib/emissionFactors/exiobaseSectors.json
// so every sector select in the product offers the same options in the same order.
//
// CLIENT-SAFE. This imports the SECTORS file (106 KB) and not the FACTOR files (2.17 MB together),
// which is the whole reason the two are separate artefacts. Factors are resolved server-side; see
// lib/emissionFactors/spendResolver.server.ts.
//
// ⚠️ THE GROUPS ARE OURS AND THE INDUSTRIES ARE EXIOBASE'S, AND A READER OF THE DROPDOWN CANNOT SEE
// THE DIFFERENCE. The 20 headings are presentation only - they are not published by anyone, not
// derived from ISIC or NACE, and no figure is computed from them. They exist so a 163-item select is
// navigable. The industry names and codes beneath them are EXIOBASE 3 v3.8.2 verbatim. Both the
// headings and the assignment are seeded by supabase/migrations/20260914_exiobase_sectors.sql and
// READ from there by the generator, so this file, the JSON and the database cannot disagree.

import sectors from './exiobaseSectors.json'

export interface IndustryOption {
  /** The value an option writes. An EXIOBASE ixi ExioCode, e.g. 'i01.a'. */
  code: string
  /** The label an option shows. EXIOBASE's own name, unaltered - including its typos. */
  name: string
  number: number
}

export interface IndustryOptionGroup {
  heading: string
  industries: IndustryOption[]
}

/** The 20 headings in the JSON's `groups` order - which is the migration's seed order, and is the
 *  optgroup order - each holding its industries in exio_number order. */
export const INDUSTRY_OPTION_GROUPS: readonly IndustryOptionGroup[] = (() => {
  const byHeading = new Map<string, IndustryOption[]>()
  for (const r of sectors.industries as { exio_code: string; exio_name: string; exio_number: number; display_group: string }[]) {
    const list = byHeading.get(r.display_group) ?? []
    list.push({ code: r.exio_code, name: r.exio_name, number: r.exio_number })
    byHeading.set(r.display_group, list)
  }
  return (sectors.groups as { heading: string }[]).map(g => ({
    heading: g.heading,
    industries: (byHeading.get(g.heading) ?? []).sort((a, b) => a.number - b.number),
  }))
})()

/** Every valid ixi code. Used by the CSV import guard, which must reject anything else. */
export const INDUSTRY_CODES: ReadonlySet<string> = new Set(
  (sectors.industries as { exio_code: string }[]).map(r => r.exio_code),
)

const NAME_BY_CODE = new Map(
  (sectors.industries as { exio_code: string; exio_name: string }[]).map(r => [r.exio_code, r.exio_name]),
)

/** EXIOBASE's name for a code, or the code itself if it is not one of the 163. Never throws: this is
 *  used to render values already stored, and a stored value we no longer recognise must still be
 *  visible to the customer rather than blanked. */
export function industryName(code: string): string {
  return NAME_BY_CODE.get(code) ?? code
}
