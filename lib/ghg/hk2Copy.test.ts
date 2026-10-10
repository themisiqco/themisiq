// lib/ghg/hk2Copy.test.ts
//
// hk2: customer- and verifier-facing copy corrected after T16. Each test names the code fact the copy now states.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gwpHeadingWords, displayStoredText, storedCountryWords } from './workingsCells'
import { jurisdictionWords, familyWords } from './editionWords'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const WIZARD = read('app/dashboard/ghg/page.tsx')
const PAGE = read('app/verify/[token]/page.tsx')
const EM_DASH = String.fromCharCode(0x2014)

describe('hk2: the "Invite a verifier" intro says what the code does', () => {
  const intro = WIZARD.slice(WIZARD.indexOf('Generate a read-only link for your independent assurance provider.'))
  const sentence = intro.slice(0, intro.indexOf('\n'))
  it('the version shared, with the audit trail up to it; not the live inventory and its full audit trail (T16)', () => {
    expect(sentence).toContain('the saved version of this inventory you share')
    expect(sentence).toContain('the audit trail up to that version')
    expect(sentence).not.toContain('full audit trail')
    expect(sentence).toContain('Share the latest saved version')
  })
  it('the 90 days is the column default on verifier_access.expires_at, and nothing in the app sets another', () => {
    expect(sentence).toContain('Links expire 90 days after they are created')
    expect(read('supabase/migrations/20260707_verifier_access_baseline_and_consent.sql')).toContain("expires_at        timestamptz not null default (now() + interval '90 days'),")
    const insert = WIZARD.slice(WIZARD.indexOf("from('verifier_access').insert({"), WIZARD.indexOf("from('verifier_access').insert({") + 400)
    expect(insert).not.toContain('expires_at')
  })
  it('no em dash and no "chase"', () => {
    expect(sentence).not.toContain(EM_DASH)
    expect(sentence).not.toMatch(/\bchase\b/i)
  })
})

describe('hk2: the Emission Factor Editions table prints words', () => {
  it('jurisdictions and factor families in words; an unknown key prints as itself, never blank', () => {
    expect(['AU', 'CA', 'US', 'UK', 'EU', 'NZ'].map(jurisdictionWords)).toEqual(['Australia', 'Canada', 'United States', 'United Kingdom', 'European Union', 'New Zealand'])
    expect(['combustion', 'electricity', 'steam', 'mobile'].map(familyWords)).toEqual(['Fuel combustion', 'Electricity', 'Steam', 'Vehicle fuel'])
    expect(jurisdictionWords('ZZ')).toBe('ZZ')
  })
  it('the page prints them through the shared words, as the results email does', () => {
    expect(PAGE).toContain('{jurisdictionWords(juris)}</td>')
    expect(PAGE).toContain('{familyWords(family)}</td>')
    expect(read('lib/ghg/resultsEmail.ts')).toContain('${jurisdictionWords(j)}, ${familyWords(f)}')
  })
  it('the workings are below the table, and the sentence says so', () => {
    expect(PAGE).toContain('calculation workings below, so the two describe the same calculation.')
    expect(PAGE).not.toContain('calculation workings above, so the two')
    expect(PAGE.indexOf('<SectionHead>Emission Factor Editions</SectionHead>')).toBeLessThan(PAGE.indexOf('<WorkingsSourceCell'))
  })
})

describe('hk2: the GWP basis heading names factors published on their own basis', () => {
  it('only when a priced row carries its own basis', () => {
    expect(gwpHeadingWords('AR6', [{ gwp_basis: 'AR6', result_tco2e: 1 }])).toBe('AR6')
    // An Australian NGA factor printed on AR5, in an AR6 inventory.
    expect(gwpHeadingWords('AR6', [{ gwp_basis: 'AR6', result_tco2e: 1 }, { gwp_basis: 'AR5', result_tco2e: 2 }]))
      .toBe('AR6, except factors published with their own GWP basis, as shown on each row.')
    expect(gwpHeadingWords('AR6', [{ gwp_basis: 'as published: see factor source', result_tco2e: 3 }]))
      .toBe('AR6, except factors published with their own GWP basis, as shown on each row.')
    // An older row's dashed token reads the same.
    expect(gwpHeadingWords('AR6', [{ gwp_basis: `as-published ${EM_DASH} see factor source`, result_tco2e: 3 }])).toContain('except factors')
    // Unpriced and record rows say nothing about a factor's basis.
    expect(gwpHeadingWords('AR6', [{ gwp_basis: 'unpriced', result_tco2e: null }, { gwp_basis: 'AR5', result_tco2e: null }, { gwp_basis: 'document_event', result_tco2e: null }])).toBe('AR6')
    expect(gwpHeadingWords('AR6', null)).toBe('AR6')
  })
  it('the page heading reads it from the stored workings', () => {
    expect(PAGE).toContain('GWP basis: {gwpHeadingWords(inv.gwp_version, inv.workings)}')
  })
})

describe('hk2: an older stored refusal note, in words', () => {
  it('no factor key, the unit as the customer reads it, the country in words', () => {
    expect(displayStoredText('No published emission factor for natural gas measured in kwh in FR (factor key "natural_gas_kwh"). This figure cannot be priced.'))
      .toBe('No published emission factor for natural gas measured in kWh in France. This figure cannot be priced.')
    expect(displayStoredText('No published emission factor for propane measured in m3 in UK (factor key "propane_m3").'))
      .toBe('No published emission factor for propane measured in m³ in United Kingdom.')
  })
  it('the factor tables\' own codes read as their countries', () => {
    expect(storedCountryWords('EL')).toBe('Greece')
    expect(storedCountryWords('UK')).toBe('United Kingdom')
    expect(storedCountryWords('EU')).toBe('the European Union')
  })
})
