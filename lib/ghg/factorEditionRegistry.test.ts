// lib/ghg/factorEditionRegistry.test.ts
//
// T3c diff 1: the edition registry and selectEdition (rulings 8.1 to 8.7, R17 to R19). Windows come from the engine's
// own periodFromYearAndEnd, so the selection is tested on the windows the engine makes.

import { describe, it, expect } from 'vitest'
import { periodFromYearAndEnd } from './engine'
import {
  FACTOR_EDITION_REGISTRY, DATASETS, DATE_NEEDED, SOURCE_FILES, selectEdition, majorityYear, daysByYear, effectiveDate, r19,
  pubDate, ON_OR_BEFORE_EVIDENCE, type DatasetId, type FactorEditionEntry, type SelectEditionResult, type EditionChoice,
} from './factorEditionRegistry'

const PREPARED = '2026-10-08'
const win = (y: number, m: number) => periodFromYearAndEnd(y, m)
const sel = (d: DatasetId, y: number, m: number, prepared = PREPARED, reg?: readonly FactorEditionEntry[]) =>
  selectEdition(d, win(y, m), y, prepared, undefined, reg)
const chosen = (r: SelectEditionResult): EditionChoice => {
  if ('missing' in r || 'provisional' in r) throw new Error(`expected a selection, got ${JSON.stringify(r)}`)
  return r
}
const label = (r: SelectEditionResult): string =>
  'missing' in r ? `missing ${r.missing.edition}` : 'provisional' in r ? `provisional ${r.provisional.edition.label}` : r.edition.label

describe('the majority rule', () => {
  it('December, March, June and September year ends for 2024, 2025 and 2026, including leap 2024', () => {
    for (const y of [2024, 2025, 2026]) {
      expect(majorityYear(win(y, 12)).year, `Dec ${y}`).toBe(y)
      expect(majorityYear(win(y, 3)).year, `Mar ${y}`).toBe(y - 1)
      expect(majorityYear(win(y, 6)).year, `Jun ${y}`).toBe(y - 1)
      expect(majorityYear(win(y, 9)).year, `Sep ${y}`).toBe(y)
    }
    expect(majorityYear(win(2024, 12))).toEqual({ year: 2024, days: 366, total: 366 })
    // Year ending 31 March 2025: 275 days in 2024 (Apr to Dec), 90 in 2025.
    expect([...daysByYear(win(2025, 3))]).toEqual([[2024, 275], [2025, 90]])
    // Year ending 30 June 2024 crosses 29 February 2024: 184 in 2023, 182 in 2024.
    expect([...daysByYear(win(2024, 6))]).toEqual([[2023, 184], [2024, 182]])
  })

  it('a tie goes to the year the window ends in (synthetic window; no month-end window ties)', () => {
    const t = { start: new Date(2025, 11, 30), end: new Date(2026, 0, 2) }      // 2 days each side
    expect([...daysByYear(t)]).toEqual([[2025, 2], [2026, 2]])
    expect(majorityYear(t).year).toBe(2026)
    // And for NGA activity years: 29 June to 2 July 2026 is two days in each.
    const n = { start: new Date(2026, 5, 29), end: new Date(2026, 6, 2) }
    expect([...daysByYear(n, true)]).toEqual([[2025, 2], [2026, 2]])
    expect(majorityYear(n, true).year).toBe(2026)
  })
})

describe('DESNZ (class (a), DESNZ rule)', () => {
  it('March 2025 selects 2024 and March 2024 selects 2023 (held since T3d); March 2023 selects 2022 (published, not held: missing)', () => {
    expect(chosen(sel('desnz_grid', 2025, 3)).edition.label).toBe('DEFRA 2024')
    expect(chosen(sel('desnz_grid', 2024, 3)).edition.label).toBe('DEFRA 2023')
    const r = sel('desnz_grid', 2023, 3)
    expect(r).toEqual({ missing: expect.objectContaining({ edition: 'DEFRA 2022', rule: 'desnz_april_march', reason: 'not_held' }) })
    if ('missing' in r) expect(r.missing.basis).toBe('DEFRA 2022 grid electricity factors are needed for the year ending 31 March 2023 and are not loaded, so this line is not counted. Export is blocked until they are loaded.')
  })

  it('June 2024 selects 2023, because the 2024 edition was first published on 8 July 2024', () => {
    const r = chosen(sel('desnz_grid', 2024, 6))
    expect([r.edition.label, r.rule]).toEqual(['DEFRA 2023', 'desnz_july_june'])   // held since T3d 2024
  })

  it('June 2025 selects 2025 (published 10 June 2025), with the design wording', () => {
    const r = chosen(sel('desnz_grid', 2025, 6))
    expect(r.edition.label).toBe('DEFRA 2025')
    expect(r.basis).toBe('DEFRA 2025 factors (published 10 June 2025), the newest published by 30 June 2025, following DESNZ guidance for July to June years.')
  })

  it('calendar years take the year; September uses the majority fallback', () => {
    expect(chosen(sel('desnz_grid', 2026, 12)).basis).toMatch(/^DESNZ 2026 factors for reporting year 2026, following DESNZ guidance for calendar years\./)
    const sep = chosen(sel('desnz_grid', 2026, 9))
    expect([sep.edition.label, sep.rule]).toEqual(['DEFRA 2026', 'desnz_majority_fallback'])
    expect(sep.basis).toMatch(/^DEFRA 2026 factors: 2026 contains 273 of the 365 days in the year ending 30 September 2026\. DESNZ gives no guidance/)
  })

  it('an edition with no recorded date is never selected', () => {
    const reg = FACTOR_EDITION_REGISTRY.map(e => e.dataset === 'desnz_grid' && e.editionYear === 2025
      ? { ...e, published: { source: 'x' } } : e)
    const r = sel('desnz_grid', 2025, 12, PREPARED, reg)
    expect(r).toEqual({ missing: expect.objectContaining({ edition: 'DEFRA 2025', reason: 'no_date' }) })
    // June 2025 now finds 2024 as the newest dated edition by 30 June 2025, not the undated 2025 (held since T3d).
    expect(chosen(sel('desnz_grid', 2025, 6, PREPARED, reg)).edition.label).toBe('DEFRA 2024')
  })

  it('values come from the latest correction to the file the values are held from (D2)', () => {
    // DESNZ 2026's 31 July correction revised the flat file only; the held full set "has not been revised".
    const r = chosen(sel('desnz_combustion', 2026, 12))
    expect([r.correction, r.correctionHeld]).toEqual([null, true])
    expect(r.basis).toBe('DESNZ 2026 factors for reporting year 2026, following DESNZ guidance for calendar years.')
    const c = r.edition.corrections[0]
    expect([c.date, c.affectsHeldValues]).toEqual(['2026-07-31', false])
    expect(c.source).toContain('"Updated the conversion factors 2026: flat file to correct a number of values that were initially reported as 0"')
    // A full-set correction (DESNZ 2024, Version 1.1) applies; held at that correction, the row says so.
    const reg = FACTOR_EDITION_REGISTRY.map(e => e.dataset === 'desnz_grid' && e.editionYear === 2024 ? { ...e, held: true, heldCorrection: '2024-10-30' } : e)
    const v = chosen(selectEdition('desnz_grid', win(2025, 3), 2025, PREPARED, undefined, reg))
    expect(v.basis).toBe('DESNZ 2024 factors for the year ending 31 March 2025, following DESNZ guidance for April to March years. Values as corrected on 30 October 2024.')
    // Before that correction there was none to apply; held at the original, a later correction is said to be missing.
    expect(chosen(selectEdition('desnz_grid', win(2025, 3), 2025, '2024-09-01', undefined, reg)).correction).toBeNull()
    const old = reg.map(e => e.dataset === 'desnz_grid' && e.editionYear === 2024 ? { ...e, heldCorrection: undefined } : e)
    expect(chosen(selectEdition('desnz_grid', win(2025, 3), 2025, PREPARED, undefined, old)).basis).toMatch(/A correction of 30 October 2024 is not reflected in the values held\.$/)
  })
})

describe('NGA (class (a), activity years 1 July N to 30 June N+1)', () => {
  it('each year end maps per section 8.2', () => {
    const ed = (y: number, m: number) => { const r = sel('nga_grid', y, m); return 'missing' in r ? r.missing.edition : 'provisional' in r ? r.provisional.edition.label : r.edition.label }
    expect([ed(2025, 12), ed(2025, 3), ed(2025, 6), ed(2025, 9)]).toEqual(['DCCEEW NGA 2025', 'DCCEEW NGA 2024', 'DCCEEW NGA 2024', 'DCCEEW NGA 2024'])
    expect([ed(2026, 3), ed(2026, 6), ed(2026, 9)]).toEqual(['DCCEEW NGA 2025', 'DCCEEW NGA 2025', 'DCCEEW NGA 2025'])
    expect(majorityYear(win(2025, 12), true)).toEqual({ year: 2025, days: 184, total: 365 })
    expect(chosen(sel('nga_grid', 2025, 12)).basis).toBe('NGA 2025 factors: the 2025-26 activity year (1 July 2025 to 30 June 2026) contains 184 of the 365 days in reporting year 2025.')
  })

  it('a month-only date is read as that month\'s last day', () => {
    expect(effectiveDate('2025-08')).toBe('2025-08-31')
    expect(chosen(sel('nga_grid', 2026, 3, '2026-10-08')).edition.label).toBe('DCCEEW NGA 2025')
  })
})

describe('class (b): data year, else newest published on or before the preparation date', () => {
  it('the data-year match uses the majority year: March 2025 matches data year 2024 (AIB 2024, on or before 11 August 2025)', () => {
    const m = chosen(sel('aib', 2025, 3))
    expect([m.edition.label, m.rule, m.selected_on]).toEqual(['AIB 2024', 'data_year_match', PREPARED])
    expect(m.basis).toBe('AIB 2024: data year 2024 matches the year ending 31 March 2025, which falls mostly in 2024. ' +
      'Whether the values held reflect the correction of 11 August 2025 is not recorded.')
    // An entry with no date at all is never selected: the match is skipped and the newest is taken instead.
    const reg = FACTOR_EDITION_REGISTRY.map(e => e.dataset === 'aib' && e.dataYear === 2024 ? { ...e, published: { source: 't' } } : e)
    expect(label(selectEdition('aib', win(2025, 3), 2025, PREPARED, undefined, reg))).toBe('AIB 2025')   // held since T3d
  })

  it('R20: an on-or-before date selects like a published date, and the row says "on or before"', () => {
    // ECCC NIR 2025: on or before 24 October 2025 (cited by ECCC v3.0). Prepared before v4.0, it is the newest.
    const r = chosen(sel('eccc_mobile', 2025, 12, '2026-06-01'))
    expect(r.edition.label).toBe('ECCC NIR 2025 (1990-2023)')
    expect(r.basis).toBe('ECCC NIR 2025 (1990-2023) (published on or before 24 October 2025): the newest edition when this inventory was first prepared on 1 June 2026; no 2025 data year was published.')
    // Prepared after v4.0 cites the 2026 NIR (on or before 9 September 2026), that edition is newest, and held (T3d).
    const after = chosen(sel('eccc_mobile', 2025, 12))
    expect(after.edition.label).toBe('ECCC NIR 2026 (1990-2024)')
    expect(after.basis).toMatch(/^ECCC NIR 2026 \(1990-2024\) \(published on or before 9 September 2026\): the newest edition/)
    // Green-e 2025 (2023 data): on or before 30 May 2026, the date ThemisIQ first held it.
    const g = chosen(sel('greene', 2025, 12))
    expect(g.basis).toMatch(/^Green-e 2025 \(2023 data\) \(published on or before 30 May 2026\): the newest edition/)
    // Prepared before that date, nothing is proven published: missing.
    expect(sel('greene', 2025, 12, '2026-05-01')).toEqual({ missing: expect.objectContaining({ reason: 'nothing_published' }) })
  })

  it('EEA: 2023 matches 2023; 2024 matches 2024 (T3d, published 6 November 2025, corrected 10 July 2026); later windows take 2024', () => {
    // T3d 2024 (ruling 1): data year 2023 as revised in the final inventory of 6 November 2025.
    expect(chosen(sel('eea_grid', 2023, 12)).basis).toBe('EEA 2023: data year 2023 matches reporting year 2023. Values as corrected on 6 November 2025.')
    const r24 = chosen(sel('eea_grid', 2024, 12))
    expect([r24.edition.label, r24.correction?.date, r24.correctionHeld]).toEqual(['EEA 2024', '2026-07-10', true])
    expect(chosen(sel('eea_grid', 2025, 12)).basis).toMatch(/^EEA 2024 \(published 6 November 2025, corrected on 10 July 2026\): the newest edition when this inventory was first prepared on 8 October 2026; no 2025 data year was published\./)
    // Prepared before 6 November 2025, 2024 was not yet published: EEA 2023 is the newest.
    expect(chosen(sel('eea_grid', 2025, 12, '2025-10-01')).edition.label).toBe('EEA 2023')
  })

  it('AIB: a March 2024 window selects data year 2023 (majority), held since T3d 2024', () => {
    const r = chosen(sel('aib', 2024, 3))
    expect([r.edition.label, r.rule]).toEqual(['AIB 2023', 'data_year_match'])
  })

  it('eGRID: no 2024 or 2025 data year is registered, so the newest released by the preparation date, with its revision', () => {
    expect(FACTOR_EDITION_REGISTRY.filter(e => e.dataset === 'egrid').map(e => e.label)).toEqual(['eGRID2021', 'eGRID2022', 'eGRID2023'])
    const r = chosen(sel('egrid', 2025, 12))
    expect([r.edition.label, r.rule, r.selected_on]).toEqual(['eGRID2023', 'data_year_newest', PREPARED])
    expect(r.basis).toBe('eGRID2023 (published 15 January 2025, revision 2 of 12 June 2025): the newest edition when this inventory was first prepared on 8 October 2026; no 2025 data year was published. Values as corrected on 12 June 2025.')
    expect(r.correctionHeld).toBe(true)
    expect(chosen(sel('egrid', 2023, 12)).basis).toMatch(/^eGRID2023: data year 2023 matches reporting year 2023\./)
  })

  it('ECCC grid: reporting year 2024 matches data year 2024 (Table 5.4, held since T3d); 2025 and 2026 take the newest, data year 2024', () => {
    for (const y of [2024, 2025, 2026]) {
      const r = chosen(sel('eccc_grid', y, 12))
      expect([r.edition.label, r.rule], String(y)).toEqual(['ECCC Table 5.4 (NIR 1990-2024)', y === 2024 ? 'data_year_match' : 'data_year_newest'])
    }
    // Prepared before v4.0 (9 September 2026), 2025 takes the newest then: data year 2023, held.
    expect(chosen(sel('eccc_grid', 2025, 12, '2026-06-01')).edition.label).toBe('ECCC Table 5.3 (NIR 1990-2023)')
  })

  it('a frozen selection survives a re-save after a newer edition is registered', () => {
    const first = chosen(sel('mfe_grid', 2026, 12, '2026-10-08'))
    expect(first.edition.label).toBe('MfE 2026 v2 (2025 row)')
    const frozen = { dataset: 'mfe_grid' as const, label: first.edition.label, data_year: 2025, rule: first.rule, selected_on: first.selected_on! }
    const newer: FactorEditionEntry = { ...first.edition, label: 'MfE 2027 (2026 row)', dataYear: 2026, published: { date: '2027-05-01', source: 't' } }
    const reg = [...FACTOR_EDITION_REGISTRY, newer]
    expect(chosen(selectEdition('mfe_grid', win(2026, 12), 2026, '2027-06-01', undefined, reg)).edition.label, 'unfrozen: the new one').toBe('MfE 2027 (2026 row)')
    const kept = chosen(selectEdition('mfe_grid', win(2026, 12), 2026, '2027-06-01', frozen, reg))
    expect([kept.edition.label, kept.rule, kept.selected_on]).toEqual(['MfE 2026 v2 (2025 row)', 'frozen', '2026-10-08'])
    expect(kept.basis).toMatch(/^MfE 2026 v2 \(2025 row\): selected on 8 October 2026, when this inventory was first prepared, and kept\./)
  })
})

describe('R19: an edition not yet published', () => {
  it('US EPA Hub, calendar 2026: provisional 2025, with the exact sentence', () => {
    const r = sel('epa_hub_combustion', 2026, 12)
    if (!('provisional' in r)) throw new Error(label(r))
    expect([r.provisional.edition.label, r.provisional.awaited, r.provisional.rule]).toEqual(['US EPA 2025', 2026, 'majority'])
    expect(r.provisional.basis).toBe('The 2026 US EPA combustion factors have not been published yet, so the US EPA 2025 factors are used. This line will be re-priced when the 2026 factors are loaded.')
    expect(r19(2026, DATASETS.epa_hub_combustion, 'US EPA 2025')).toBe(r.provisional.basis)
  })

  it('US EPA Hub, March 2026: 2025, not provisional', () => {
    const r = chosen(sel('epa_hub_combustion', 2026, 3))
    expect([r.edition.label, r.rule]).toEqual(['US EPA 2025', 'majority'])
    expect(r.basis).toBe('US EPA 2025 factors: 2025 contains 275 of the 365 days in the year ending 31 March 2026.')
  })

  it('published but not held is missing, not provisional (DESNZ 2022 for March 2023; 2023 to 2026 held)', () => {
    expect(sel('desnz_combustion', 2023, 3)).toEqual({ missing: expect.objectContaining({ edition: 'DEFRA 2022', reason: 'not_held' }) })
    // An older year the registry does not list is published, not awaited: missing.
    expect(sel('desnz_combustion', 2021, 12)).toEqual({ missing: expect.objectContaining({ edition: 'DEFRA 2021', reason: 'not_held' }) })
  })

  it('a June window that has not ended is provisional: a newer edition may still be published by its last day', () => {
    const r = sel('desnz_grid', 2027, 6, '2026-10-08')
    if (!('provisional' in r)) throw new Error(label(r))
    expect([r.provisional.edition.label, r.provisional.awaited]).toEqual(['DEFRA 2026', 2027])
  })
})

describe('exempt datasets never return missing', () => {
  it('IPCC 2006, EU MRR, JEC and EXIOBASE, for every year and year end', () => {
    for (const d of ['ipcc2006', 'eu_mrr', 'jec_wtt', 'exiobase'] as DatasetId[]) for (const y of [2020, 2024, 2026, 2030]) for (const m of [3, 6, 12]) {
      const r = sel(d, y, m)
      expect('missing' in r || 'provisional' in r, `${d} ${y}/${m}`).toBe(false)
      expect(chosen(r).rule).toBe('exempt')
    }
    expect(chosen(sel('ipcc2006', 2025, 12)).basis).toBe('IPCC 2006: a fixed default with no annual edition, used for every reporting year.')
  })
})

describe('registry integrity', () => {
  it('every entry has a class matching its dataset, and every dataset has an entry', () => {
    for (const e of FACTOR_EDITION_REGISTRY) {
      expect(['a', 'b', 'exempt'], e.label).toContain(e.class)
      expect(e.class, `${e.dataset} ${e.label}`).toBe(DATASETS[e.dataset].class)
      if (e.class === 'a') expect(e.editionYear, e.label).toBeTypeOf('number')
      if (e.class === 'b') expect(e.dataYear, e.label).toBeTypeOf('number')
    }
    for (const d of Object.keys(DATASETS)) expect(FACTOR_EDITION_REGISTRY.some(e => e.dataset === d), d).toBe(true)
  })

  it('every held entry has a published or on-or-before date (R20); DATE_NEEDED names no held edition', () => {
    for (const e of FACTOR_EDITION_REGISTRY) if (e.held && e.class !== 'exempt') expect(pubDate(e), `${e.dataset}: ${e.label}`).toBeTruthy()
    const held = new Set(FACTOR_EDITION_REGISTRY.filter(e => e.held).map(e => `${e.dataset}: ${e.label}`))
    expect(DATE_NEEDED.filter(d => held.has(d))).toEqual([])
    // What is still needed: three earlier Green-e editions, none held.
    expect([...DATE_NEEDED].sort()).toEqual(['greene: Green-e 2021 (2019 data)', 'greene: Green-e 2023 (2021 data)', 'greene: Green-e 2024 (2022 data)'])
  })

  it('R20: an on-or-before date carries its evidence, from the ruling\'s list, and never sits beside a published date', () => {
    const withOob = FACTOR_EDITION_REGISTRY.filter(e => e.published.onOrBefore)
    expect(withOob.map(e => `${e.label}: ${e.published.onOrBefore!.evidence} ${e.published.onOrBefore!.date}`).sort()).toEqual([
      'AIB 2024: printed 2025-08-11',
      'ECCC NIR 2025 (1990-2023): cited_by_publisher 2025-10-24', 'ECCC NIR 2025 (1990-2023): cited_by_publisher 2025-10-24',
      'ECCC NIR 2026 (1990-2024): cited_by_publisher 2026-09-09', 'ECCC NIR 2026 (1990-2024): cited_by_publisher 2026-09-09',
      'Green-e 2025 (2023 data): first_held 2026-05-30',
    ])
    for (const e of withOob) {
      expect(ON_OR_BEFORE_EVIDENCE).toContain(e.published.onOrBefore!.evidence)
      expect(e.published.date, e.label).toBeUndefined()
      expect(e.published.source.length, e.label).toBeGreaterThan(20)
    }
  })

  it('dates are well formed; corrections follow publication', () => {
    for (const e of FACTOR_EDITION_REGISTRY) {
      if (e.published.date) expect(e.published.date, e.label).toMatch(/^\d{4}-\d{2}(-\d{2})?$/)
      for (const c of e.corrections) {
        expect(c.date, e.label).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        if (e.published.date) expect(c.date >= effectiveDate(e.published.date) || e.dataset.startsWith('mfe'), `${e.label} ${c.date}`).toBe(true)
      }
      if (e.heldCorrection && e.heldCorrection !== 'unknown') expect(e.corrections.map(c => c.date), e.label).toContain(e.heldCorrection)
    }
  })

  it('every sourceFile is one of the files in ~/themisiq-sources', () => {
    for (const e of FACTOR_EDITION_REGISTRY) if (e.sourceFile) expect(SOURCE_FILES, `${e.dataset} ${e.label}`).toContain(e.sourceFile)
  })

  it('R18, T3e: DESNZ travel and waste are selected like every DESNZ dataset, with 2023 to 2026 held', () => {
    expect([DATASETS.desnz_travel.selectionWiredIn, DATASETS.desnz_waste.selectionWiredIn]).toEqual([undefined, undefined])
    for (const ds of ['desnz_travel', 'desnz_waste'] as const)
      expect(FACTOR_EDITION_REGISTRY.filter(e => e.dataset === ds && e.held).map(e => e.label), ds).toEqual(['DEFRA 2023', 'DEFRA 2024', 'DEFRA 2025', 'DEFRA 2026'])
    expect(FACTOR_EDITION_REGISTRY.filter(e => e.dataset === 'desnz_travel').map(e => e.label)).toEqual(['DEFRA 2022', 'DEFRA 2023', 'DEFRA 2024', 'DEFRA 2025', 'DEFRA 2026'])
  })

  it('no sentence the selector writes has an em dash', () => {
    const out: string[] = []
    for (const d of Object.keys(DATASETS) as DatasetId[]) for (const y of [2024, 2025, 2026]) for (const m of [3, 6, 9, 12]) {
      const r = sel(d, y, m)
      out.push('missing' in r ? r.missing.basis : 'provisional' in r ? r.provisional.basis : r.basis)
    }
    for (const s of out) expect(s).not.toContain('\u2014')
    for (const e of FACTOR_EDITION_REGISTRY) expect(JSON.stringify(e)).not.toContain('\u2014')
  })
})
