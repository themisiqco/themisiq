// lib/climate/regions.ts
// ThemisIQ — the ONE shared region-label map for climate-risk / materiality reports.
//
// Source of truth for the region LIST is the DB (mr_regions), fetched by the API routes and the
// wizard's reference route. But the printable report pages render from a stored assessment row that
// carries only region CODES (in `region_codes` / stored `workings.input`), never the labels — so a
// report must map code → human label without a DB round-trip. This is that map, in ONE place.
//
// THE RULE (see the climate-risk region-wiring change): exactly ONE hardcoded region-label map in
// the repo. It used to be copied into each report page; both now import this. Do not re-inline it.
// When mr_countries lands and reports carry labels in their workings, this becomes deletable.
//
// Values mirror mr_regions.label verbatim (AR6 reference-region names). `regionLabel` falls back to
// the raw code so an unknown/retired code still renders something rather than "undefined".

export const REGION_LABEL: Record<string, string> = {
  NWN: 'North-Western North America', NEN: 'North-Eastern North America',
  WNA: 'Western North America', CNA: 'Central North America', ENA: 'Eastern North America',
  CAR: 'Caribbean', NEU: 'Northern Europe', WCE: 'Western & Central Europe',
  MED: 'Mediterranean', EEU: 'Eastern Europe', SAS: 'South Asia', SEA: 'South-East Asia',
  EAS: 'East Asia', ARP: 'Arabian Peninsula', WCA: 'West Central Asia',
  WAF: 'Western Africa', ESAF: 'East Southern Africa', EAU: 'Eastern Australia',
  NAU: 'Northern Australia', PAC: 'Pacific Small Islands',
}

/** Map a region code to its label, falling back to the code itself if unknown. */
export function regionLabel(code: string): string {
  return REGION_LABEL[code] ?? code
}
