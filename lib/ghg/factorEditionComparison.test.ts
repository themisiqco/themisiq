import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyLocation, getGridFactor, selectionFor, type Inventory, type Location } from './engine'
import { figuresForSave } from './savePayload'
import { selectionContextFor } from './factorSelection'
import { compareFactorEditions, type PriorYearPricing } from './factorEditionComparison'
import { buildComparabilityDisclosure, buildComparabilityRecord, comparabilitySurfaceLines, factorEditionSurfaceLines, type InventorySummary } from './comparability'
import { DATASETS } from './factorEditionRegistry'
import { FACTOR_EDITION_DISCLOSURE } from './factorEditions'

// T3c diff 4, F-06: factor editions in the year-on-year disclosure. Design: docs/review/design-derived-figures.md,
// T3c, "F-06"; ISO 14064-3:2019 cl. 6.3.1.5 (ruling of 2 Oct 2026).

const JUNE = new Date(2026, 5, 1)
const OCT = new Date(2026, 9, 8)
const L = (o: Partial<Location>) => ({ ...emptyLocation(String(o.id), String(o.name)), ...o }) as Location
const UK = L({ id: 'uk', name: 'Leeds', country: 'GB', grid_region: 'UK', electricity_kwh: 10_000 })
const DE = L({ id: 'de', name: 'Berlin', country: 'DE', grid_region: 'EU_DE', electricity_kwh: 10_000 })
const ON = L({ id: 'on', name: 'Toronto', country: 'CA', province: 'ON', grid_region: 'ON', electricity_kwh: 850_000 })
const inv = (locations: Location[], year: number, o: Partial<Inventory> = {}) => ({
  company_name: 'Acme', company_id: null, reporting_year: year, fiscal_year_end_month: 12, revenue_millions: 0, employee_count: 0,
  boundary_approach: 'operational_control', california_nexus: false, coverage_resolutions: [], prior_year_s1: 0, prior_year_s2: 0,
  selected_frameworks: ['sb253'], locations, ...o,
}) as unknown as Inventory
/** A prior year as the page reads it back: saved on `savedOn`, with what that save wrote. */
const priorSaved = (locations: Location[], year: number, savedOn: Date, o: Partial<PriorYearPricing> = {}): PriorYearPricing => {
  const f = figuresForSave(inv(locations, year), 'AR6', { preparedOn: savedOn })
  return { locations, reporting_year: year, fiscal_year_end_month: 12, coverage_resolutions: [], factor_selection: f.factor_selection,
    factor_editions: f.factor_editions, workings: f.workings, updated_at: savedOn.toISOString(), ...o }
}
const compare = (locations: Location[], year: number, prior: PriorYearPricing, today = OCT) =>
  compareFactorEditions({ locations, reporting_year: year, fiscal_year_end_month: 12, coverage_resolutions: [] }, selectionContextFor(inv(locations, year), today), prior)
const summary = (locations: Location[]): InventorySummary => ({ locationCount: locations.length, fuelTypes: ['electricity'], jurisdictions: locations.map(l => l.country), boundaryApproach: 'operational_control' })
const disclosure = (locations: Location[], year: number, prior: PriorYearPricing) => buildComparabilityDisclosure({
  priorScope1: null, priorScope2: null, thisScope1: 0, thisScope2: 1, priorYearState: 'clean', priorSummary: summary(prior.locations),
  thisSummary: summary(locations), factorEditions: compare(locations, year, prior),
})!
const editionLines = (d: ReturnType<typeof disclosure>) => d.observations.filter(o => o.kind === 'factor_edition')

describe('F-06: the factor_edition observation', () => {
  it('two inventories whose DESNZ grid edition differs: one observation, effect = activity x (prior factor - current factor)', () => {
    const prior = priorSaved([UK], 2025, JUNE)
    const d = disclosure([UK], 2026, prior)
    const lines = editionLines(d)
    expect(lines.map(o => o.factorEdition?.dataset)).toEqual(['desnz_grid'])
    const c = lines[0].factorEdition!
    expect([c.publisher, c.family, c.priorEdition, c.currentEdition]).toEqual(['UK DESNZ', 'grid electricity', 'DEFRA 2025', 'DEFRA 2026'])
    const f25 = getGridFactor('UK', selectionFor(2025, 12, { preparedOn: JUNE })).ef
    const f26 = getGridFactor('UK', selectionFor(2026, 12, { preparedOn: OCT })).ef
    expect(c.effect_tco2e!.scope2_location).toBeCloseTo(10_000 * (f25 - f26) / 1000, 9)
    expect(c.effect_tco2e!.scope1).toBeUndefined()
    expect(lines[0].text).toBe(`Emission factors changed between reporting year 2025 and reporting year 2026: UK DESNZ grid electricity factors, DEFRA 2025 to DEFRA 2026. Pricing this year's activity at last year's factors would give ${(Math.abs(c.effect_tco2e!.scope2_location!)).toLocaleString('en-US', { maximumSignificantDigits: 7 })} tCO₂e ${f25 > f26 ? 'more' : 'less'} in Scope 2 (location-based) and ${(Math.abs(c.effect_tco2e!.scope2_market!)).toLocaleString('en-US', { maximumSignificantDigits: 7 })} tCO₂e ${f25 > f26 ? 'more' : 'less'} in Scope 2 (market-based).`)
    expect(d.factorEditions!.state).toBe('changed')
    expect(d.factorEditions!.disclosure).toBe(FACTOR_EDITION_DISCLOSURE.changed!.detail)
  })

  it('the same edition in both years gives no observation', () => {
    // Germany: EEA 2024 and AIB 2025 price both 2025 and 2026.
    const d = disclosure([DE], 2026, priorSaved([DE], 2025, OCT))
    expect(editionLines(d)).toEqual([])
    expect([d.factorEditions!.state, d.factorEditions!.disclosure]).toEqual(['consistent', null])
    expect(d.observations.map(o => o.kind)).toEqual(['structure_unchanged'])
  })

  it('a prior edition not held gives a null effect, with the reason, and still names the change', () => {
    // Calendar 2022 needs DEFRA 2022, published and not held: the prior year's grid line was unpriced.
    const prior = priorSaved([UK], 2022, JUNE, { factor_editions: { UK: { combustion: { source: 'x', edition: 'DEFRA 2022' } } } as never })
    const [line] = editionLines(disclosure([UK], 2023, prior))
    expect(line.factorEdition).toMatchObject({ priorEdition: 'DEFRA 2022', currentEdition: 'DEFRA 2023', effect_tco2e: null,
      effectWithheldBecause: 'the DEFRA 2022 factors are not loaded', effect_basis: 'The DEFRA 2022 factors are not loaded, so the effect of the change could not be calculated.' })
    expect(line.text).toBe('Emission factors changed between reporting year 2022 and reporting year 2023: UK DESNZ grid electricity factors, DEFRA 2022 to DEFRA 2023. The effect could not be calculated because the DEFRA 2022 factors are not loaded.')
  })

  it('a prior year with no recorded factor_editions gives one observation saying the comparison could not be made, and why', () => {
    const prior = priorSaved([UK], 2025, JUNE, { factor_editions: {} })
    const d = disclosure([UK], 2026, prior)
    expect(editionLines(d).map(o => o.text)).toEqual(["Whether emission factors changed between reporting year 2025 and reporting year 2026 could not be checked: last year's inventory was saved before the factor editions that priced it were recorded."])
    expect([d.factorEditions!.state, d.factorEditions!.disclosure]).toEqual(['unknown', FACTOR_EDITION_DISCLOSURE.unknown!.detail])
    // A prior year that priced nothing from a published table has nothing to have recorded, and says nothing.
    const nothing = priorSaved([L({ id: 'x', name: 'Empty' })], 2025, JUNE, { factor_editions: {} })
    expect(editionLines(disclosure([UK], 2026, nothing))).toEqual([])
  })

  it('a prior year priced on a frozen class (b) edition compares against that frozen edition, not today\'s', () => {
    // Ontario 2025, first saved on 1 June 2026: ECCC Table 5.3 frozen. Re-saved since (updated_at today): still 5.3.
    const frozen = { ...priorSaved([ON], 2025, JUNE), updated_at: OCT.toISOString() }
    const c = editionLines(disclosure([ON], 2026, frozen)).map(o => o.factorEdition!).find(x => x.dataset === 'eccc_grid')!
    expect([c.priorEdition, c.currentEdition]).toEqual(['ECCC Table 5.3 (NIR 1990-2023)', 'ECCC Table 5.4 (NIR 1990-2024)'])
    expect(c.effect_tco2e!.scope2_location).toBeCloseTo(850_000 * (getGridFactor('ON', selectionFor(2025, 12, { preparedOn: JUNE })).ef
      - getGridFactor('ON', selectionFor(2026, 12, { preparedOn: OCT })).ef) / 1000, 9)
    // Today's selection for 2025 would be Table 5.4, the same as this year's: no grid change at all.
    const unfrozen = { ...frozen, factor_selection: {} }
    expect(editionLines(disclosure([ON], 2026, unfrozen)).map(o => o.factorEdition?.dataset)).not.toContain('eccc_grid')
  })

  it('only datasets both years used are compared; a country added this year is a structural line, not an edition change', () => {
    const d = disclosure([UK, DE], 2026, priorSaved([UK], 2025, JUNE))
    expect(editionLines(d).map(o => o.factorEdition?.dataset)).toEqual(['desnz_grid'])
  })

  it('the observation never prints a raw dataset key or an internal publisher name', () => {
    const NZ = L({ id: 'nz', name: 'Auckland', country: 'NZ', grid_region: 'NZ', electricity_kwh: 10_000, nz_td_losses: true })
    const AU = L({ id: 'au', name: 'Sydney', country: 'AU', state: 'NSW', grid_region: 'AU_NSW', electricity_kwh: 10_000 })
    const US = L({ id: 'us', name: 'Austin', country: 'US', state: 'TX', grid_region: 'US_TX', electricity_kwh: 10_000, has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf' })
    const sites = [UK, ON, NZ, AU, US, DE]
    const d = disclosure(sites, 2026, priorSaved(sites, 2024, JUNE))
    const lines = editionLines(d)
    expect(lines.length).toBeGreaterThan(2)
    for (const { text: t, factorEdition: c } of lines) {
      for (const k of Object.keys(DATASETS)) expect(t, k).not.toContain(k)
      expect(t).not.toMatch(/\b[a-z0-9]+_[a-z0-9_]+\b/)
      expect(t).not.toContain('\u2014')
      // The publisher is named as an organisation; the edition keeps its published label ("MfE 2026 v2 (2024 row)").
      expect(['NGA', 'MfE', 'eGRID'], t).not.toContain(c!.publisher)
      expect(t).toContain(`: ${c!.publisher} ${c!.family} factors, ${c!.priorEdition} to ${c!.currentEdition}.`)
    }
  })
})

describe('F-06: the disclosure travels with the record to every surface', () => {
  const prior = priorSaved([UK], 2025, JUNE)
  const d = disclosure([UK], 2026, prior)
  const capture = { observations: d.observations.map(o => o.text), question: d.question, answer: 'nothing_changed' as const, basis: d.basis, answeredAt: OCT.toISOString() }

  it('the saved record carries the comparison, recomputed at save', () => {
    const rec = buildComparabilityRecord({ capture, note: '', priorYearLookupFailed: false, current: d, checkedAt: OCT.toISOString() })!
    expect(rec.factorEditions).toEqual(d.factorEditions)
    expect(rec.observationsChanged).toBe(false)
  })

  it('the surface lines: the answer, what was shown, the basis, then FACTOR_EDITION_DISCLOSURE; an edition line is never printed twice', () => {
    const rec = buildComparabilityRecord({ capture, note: '', priorYearLookupFailed: false, current: d, checkedAt: OCT.toISOString() })!
    const lines = comparabilitySurfaceLines(rec)
    const edition = editionLines(d)[0].text
    expect(lines.filter(l => l === edition)).toHaveLength(1)
    expect(lines.at(-1)).toBe(FACTOR_EDITION_DISCLOSURE.changed!.detail)
    expect(lines[0]).toBe('The company states nothing changed that would affect comparability; the difference reflects normal business activity.')
    // A record answered before F-06 (no edition lines in what was shown) gains them from the save's comparison.
    const old = { ...rec, observations: capture.observations.filter(l => l !== edition) }
    expect(factorEditionSurfaceLines(old)).toEqual([edition, FACTOR_EDITION_DISCLOSURE.changed!.detail])
    // No record at all: says so, and the live comparison still prints (export screen and CSV).
    expect(comparabilitySurfaceLines(null, d.factorEditions)).toEqual(['The comparability question has not been answered for this inventory.', edition, FACTOR_EDITION_DISCLOSURE.changed!.detail])
  })

  const ROOT = join(__dirname, '..', '..')
  const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

  it('the export screen and the CSV/XLSX print the block ("Comparability with {prior year}")', () => {
    const page = read('app/dashboard/ghg/page.tsx')
    expect(page).toContain('lines: comparabilitySurfaceLines(record, comparability?.factorEditions ?? null)')
    expect(page).toContain('[exportComparability.heading.toUpperCase()], ...exportComparability.lines.map(l => [l])')
    expect(page).toContain('{exportComparability.lines.map((l, i) =>')
    expect(page).toContain('factorEditions: priorYear.status === \'found\' && priorYear.pricing')
  })

  it('the verifier page prints the edition lines inside the comparability section', () => {
    const v = read('app/verify/[token]/page.tsx')
    expect(v).toContain('factorEditionSurfaceLines(inv.comparability_disclosure, inv.factor_edition_comparison).map(')
    expect(v).toContain('{COMPARABILITY_ANSWER_WORDS[inv.comparability_disclosure.answer]}')
  })

  it('unanswered, on the verifier page: the platform comparison prints on its own, with no company answer', () => {
    // The lines the block renders: the edition change and FACTOR_EDITION_DISCLOSURE, from the stored column alone.
    expect(factorEditionSurfaceLines(null, d.factorEditions)).toEqual([editionLines(d)[0].text, FACTOR_EDITION_DISCLOSURE.changed!.detail])
    expect(factorEditionSurfaceLines(null, { ...d.factorEditions!, changes: [], state: 'consistent', disclosure: null })).toEqual([])
    const v = read('app/verify/[token]/page.tsx')
    expect(v).toContain('{!inv.comparability_disclosure && factorEditionSurfaceLines(null, inv.factor_edition_comparison).length > 0 && (')
    expect(v).toContain('{factorEditionSurfaceLines(null, inv.factor_edition_comparison).map((line, i) =>')
    expect(v).toContain('The company has not answered the comparability question.')
    // The answered section is unchanged: it renders only from a record, with the company's answer first.
    expect(v).toContain('{inv.comparability_disclosure && (')
    expect(v).toContain("factor_edition_comparison: 'Emission factor editions compared with the prior year',")
  })

  it('the column and its projection: nullable, column-scoped grants, projected and audited by the RPC, ASCII only', () => {
    const col = read('supabase/migrations/20261008_ghg_factor_edition_comparison.sql')
    const stmts = (sql: string) => sql.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
    expect(stmts(col)).toContain('add column if not exists factor_edition_comparison jsonb;')
    expect(stmts(col)).toContain('grant select (factor_edition_comparison), insert (factor_edition_comparison), update (factor_edition_comparison)\n  on public.ghg_inventories to authenticated;')
    expect(stmts(col)).not.toMatch(/\banon\b|default/)
    const rpc = read('supabase/migrations/20261009_get_verifier_inventory_factor_edition_comparison.sql')
    expect(rpc).toContain("'factor_edition_comparison', i.factor_edition_comparison")
    expect(rpc).toContain("'factor_editions', 'factor_edition_comparison'")
    for (const sql of [col, rpc]) expect([...sql].every(ch => ch.charCodeAt(0) < 128)).toBe(true)
    // The page writes it on every save, from the resolved lookup only.
    expect(read('app/dashboard/ghg/page.tsx')).toContain("const savedEditionComparison = priorYear.status === 'found' ? (comparability?.factorEditions ?? null)")
  })

  it('the climate-ghg FAQ claims only what is built', () => {
    const cg = read('app/climate-ghg/page.tsx')
    expect(cg).not.toContain('including which factor editions were applied')
    expect(cg).toContain("When last year\\'s inventory is held on the platform, it names each emission factor edition that changed")
  })
})
