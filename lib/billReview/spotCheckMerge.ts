// lib/billReview/spotCheckMerge.ts
//
// BR8b: A SPOT-CHECK DIFFERENCE REACHES THE CUSTOMER'S BILL. Pure. The wizard reads its own disagreements (RLS: own rows;
// checked_by is not among the columns a customer can read) on load and when the page becomes visible again, and passes
// them here. Each lands on the reading it is about (document, fuel, position) as `spotCheck { checkId, note, checkedAt }`,
// which the engine turns into an export-blocking issue until the customer confirms that reading again or corrects it
// (spotCheckOpen). The figure is never changed. Idempotent: a reading already carrying the check is left as it is.

import type { Location } from '../ghg/engine'

export type SpotCheckRow = { id: string; source_doc_id: string; fuel_type: string; proposal_index: number; result: string; note: string | null; checked_at: string }

export function mergeSpotChecks(locations: Location[], checks: SpotCheckRow[]): { locations: Location[]; changed: boolean } {
  const differences = checks.filter(c => c.result === 'disagrees' && c.note)
  if (differences.length === 0) return { locations, changed: false }
  let changed = false
  const out = locations.map(loc => {
    let locChanged = false
    const docs = loc.source_docs.map(doc => {
      const here = differences.filter(c => c.source_doc_id === doc.id)
      if (here.length === 0 || !doc.extracted) return doc
      let docChanged = false
      const extracted = doc.extracted.map((p, i) => {
        const c = here.find(x => x.proposal_index === i && x.fuel_type === p.fuelType)
        if (!c || p.spotCheck?.checkId === c.id) return p
        docChanged = true
        return { ...p, spotCheck: { checkId: c.id, note: c.note as string, checkedAt: new Date(c.checked_at).toISOString() } }
      })
      if (!docChanged) return doc
      locChanged = true
      return { ...doc, extracted }
    })
    if (!locChanged) return loc
    changed = true
    return { ...loc, source_docs: docs }
  })
  return { locations: changed ? out : locations, changed }
}
