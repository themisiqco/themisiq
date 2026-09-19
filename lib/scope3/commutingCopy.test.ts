import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFRA_TRAVEL_META } from '../emissionFactors/defraTravel'
import { evaluateCommuting, withDistance } from './commuting'
import {
  CAT7_SOURCE_SENTENCE, CAT7_FORMULA_SENTENCE, CAT7_DAYS_SENTENCE, CAT7_OCCUPANCY_SENTENCE, CAT7_STAND_IN_SENTENCE,
  CAT7_ELECTRIC_SENTENCE, CAT7_WTT_SENTENCE, CAT7_HOMEWORKING_SENTENCE, CAT7_HOMEWORKING_NOT_UK, CAT7_ASSISTANT_PHRASE,
  cat7MethodDescription, cat7Sentences, cat7Basis, cat7LegacyNotice,
} from './commutingCopy'

const ROOT = join(__dirname, '..', '..')
const sample = evaluateCommuting({
  commute_rows: [{ id: 'c', mode: 'car', car_size: 'average', car_fuel: 'unknown', country_iso2: 'GB', employees: 1, occupancy: 1, days_per_week: 5, weeks_per_year: 46, ...withDistance(20, 'km') }],
  homeworking_rows: [{ id: 'h', country_iso2: 'US', employees: 2, days_per_week: 2, weeks_per_year: 46, hours_per_day: 8 }],
})
const ALL = [
  CAT7_SOURCE_SENTENCE, CAT7_FORMULA_SENTENCE, CAT7_DAYS_SENTENCE, CAT7_OCCUPANCY_SENTENCE, CAT7_STAND_IN_SENTENCE,
  CAT7_ELECTRIC_SENTENCE, CAT7_WTT_SENTENCE, CAT7_HOMEWORKING_SENTENCE, CAT7_HOMEWORKING_NOT_UK, CAT7_ASSISTANT_PHRASE,
  cat7MethodDescription(), ...cat7Sentences(sample, 'GWP.'), cat7Basis(sample).basis, cat7Basis(sample).detail,
]

describe('Category 7 sentences', () => {
  it('K1 no em-dashes, and the attribution is carried verbatim', () => {
    for (const s of ALL) expect(s, s.slice(0, 60)).not.toMatch(/—/)
    expect(cat7MethodDescription().endsWith(` ${DEFRA_TRAVEL_META.attribution_required}`)).toBe(true)
    expect(cat7Sentences(sample, 'GWP.')).toContain(DEFRA_TRAVEL_META.attribution_required)
    // The assistant clause joins categories with semicolons, so the phrase carries none.
    expect(CAT7_ASSISTANT_PHRASE).not.toContain(';')
  })

  it('K2 the homeworking boundary: optional (p. 46), UK only, mostly heating, no cooling, and the baseline question (p. 90)', () => {
    expect(CAT7_HOMEWORKING_SENTENCE).toContain('optional under the GHG Protocol Scope 3 Standard (p. 46)')
    expect(CAT7_HOMEWORKING_SENTENCE).toContain('(Homeworking C24)')
    expect(CAT7_HOMEWORKING_SENTENCE).toContain('a UK average (Homeworking A11), mostly heating, with no cooling component')
    expect(CAT7_HOMEWORKING_SENTENCE).toContain('which the GHG Protocol’s Technical Guidance asks for (p. 90)')
    // The reason alone: every surface supplies its own "Not priced:" or "Not counted:" before it.
    expect(CAT7_HOMEWORKING_NOT_UK).toMatch(/^DEFRA’s homeworking factor is a UK average/)
    expect(cat7Sentences(sample, 'GWP.')).toContain(`Homeworking group 1 is not in this figure: ${CAT7_HOMEWORKING_NOT_UK}.`)
  })

  it('K3 the cited cells, and the editions read from the Index', () => {
    expect(CAT7_OCCUPANCY_SENTENCE).toContain('(Business travel- land A12)')
    expect(CAT7_ELECTRIC_SENTENCE).toContain('(Business travel- land A14)')
    expect(CAT7_ELECTRIC_SENTENCE).toContain("(What's new B22)")
    expect(CAT7_WTT_SENTENCE).toContain('updated in its 2026 publication and those for motorbikes and taxis last in its 2021 publication (Index G44 and Index H44)')
    expect(CAT7_WTT_SENTENCE).toContain('last updated in its 2024 publication (Index H45)')
    expect(CAT7_DAYS_SENTENCE).toContain('excluding homeworking, holiday and business-travel days')
    expect(CAT7_DAYS_SENTENCE).toContain('(p. 92)')
  })

  it('K4 a record saved under the previous form is described and not priced', () => {
    const n = cat7LegacyNotice({ employee_count: 40, avg_commute_km: 20, commute_mode: 'bus', wfh_days: 47 })!
    expect(n.summary).toBe('40 employees, 20 km average one-way commute, mode bus, 1 working-from-home day a week')
    expect(n.sentences[1]).toBe('These figures are not priced and are not in the Cat 7 figure.')
    expect(n.sentences.join(' ')).toMatch(/15 km.*petrol car.*235 working days/)
    expect(cat7LegacyNotice({})).toBeNull()
    expect(cat7LegacyNotice({ employee_count: 0 })!.summary).toBe('0 employees')
  })

  it('K5 ⚠️ the previous calculation and its false guidance are gone from the page', () => {
    const page = readFileSync(join(ROOT, 'app/dashboard/scope3/page.tsx'), 'utf8')
    const code = page.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')
    expect(code).not.toMatch(/including remote-work energy use/)
    expect(code).not.toMatch(/avg_commute_km \|\| 15|235 - wfhDays|EMISSION_FACTORS\.car_petrol|calcCat7/)
    expect(code).not.toMatch(/value=\{catData\['cat7'\]\?\.commute_mode \|\| 'car_petrol'\}/)
  })
})
