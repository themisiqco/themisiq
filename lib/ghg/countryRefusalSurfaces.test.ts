// ── WHAT A CUSTOMER AND A VERIFIER ACTUALLY SEE FOR A LOCATION THIS PLATFORM CANNOT PRICE ────────
//
// The engine's own tests pin the arithmetic and the refusal states. This file pins the SURFACES:
// which units a new location is given, which banners are allowed to speak, what each heading
// promises, and whether every figure derived from incomplete totals says so. None of that changes a
// number, and all of it changes what the number means to the person reading it.
//
// ⚠️ EVERY CASE HERE CAME FROM LOOKING AT THE PREVIEW, NOT FROM READING THE CODE. A site set to
// "Not listed" defaulted to US gallons; an amber box asked for a grid region no control could
// supply; a heading promised a fix that was not coming; the CSV results block stated three figures
// and no exclusion; a location named "other" was printed as "Other". Each one type-checked, and the
// whole suite was green.

import { describe, it, expect } from 'vitest'
import {
  emptyLocation, unitsForCountryChange, snapUnitsForCountry, buildWorkings, countryRefusal,
  gridRegionForCountry, isResolvedGridRegion, type Location,
} from './engine'
import { refusalBannerHeading, refusalBannerTrailer, countryRefusalText, countryRefusalLabel, type RefusalSurface } from './countryRefusalCopy'
import type { CountryRefusal } from './engine'

const ALL_REFUSALS: CountryRefusal[] = [
  { state: 'country_not_set' },
  { state: 'country_not_listed', value: 'OTHER' },
  { state: 'country_not_listed', value: 'Japn' },
  { state: 'country_not_supported', iso2: 'PH' },
]
const SURFACES: RefusalSurface[] = ['review', 'verifier']
import { cat3InputsFrom } from '../scope3/cat3Inputs'
import { priceCat3 } from '../scope3/cat3Energy'
import { cat3WorkingsSummary, cat3SkippedText } from '../scope3/cat3Copy'

const loc = (o: Partial<Location> = {}): Location => ({ ...emptyLocation('L1', 'Test Site'), ...o })

// ── A NEW LOCATION'S UNITS FOLLOW ITS COUNTRY ────────────────────────────────────────────────
describe('a new location takes its country defaults on the first country choice', () => {
  it('reproduces the preview sequence: add a location, choose Not listed, diesel is litres', () => {
    // ⚠️ THIS IS THE EXACT SEQUENCE FROM THE PREVIEW AND IT FAILED BEFORE unitsForCountryChange.
    // emptyLocation seeds gallons before any country exists, and the refused states RETAIN gallons
    // so a held unit is never relabelled. snapUnitsForCountry therefore saw a "held" gallons and
    // kept it, and the site set to Not listed defaulted to a United States billing unit.
    const fresh = emptyLocation('new', 'other')
    expect(fresh.diesel_stationary_unit, 'the template seeds US units before a country exists').toBe('gallons')
    const after = { ...fresh, country: 'OTHER', ...unitsForCountryChange('OTHER', fresh as never) }
    expect(after.diesel_stationary_unit).toBe('litres')
    expect(after.natural_gas_unit).toBe('m3')
    expect(after.purchased_steam_unit).toBe('gj')
  })

  it('GB, FR and AU were already right, and stay right', () => {
    // They escaped the defect only because their lists drop gallons entirely, so the old snap fell
    // through to opts[0]. Pinned so the new path does not regress what the old one got right.
    const fresh = emptyLocation('new', 'x')
    for (const [country, diesel, gas] of [['GB', 'litres', 'kwh'], ['FR', 'litres', 'm3'], ['AU', 'litres', 'm3']] as const) {
      const after = unitsForCountryChange(country, fresh as never)
      expect(after.diesel_stationary_unit, country).toBe(diesel)
      expect(after.natural_gas_unit, country).toBe(gas)
    }
  })

  it('NEVER relabels a figure the customer entered', () => {
    // The whole safety property. A stream carrying a figure keeps its unit, because a figure is the
    // one honest evidence that the unit was chosen rather than seeded.
    const entered = loc({ country: 'US', has_diesel_stationary: true, diesel_stationary_amount: 1000, diesel_stationary_unit: 'gallons' })
    const after = { ...entered, country: 'OTHER', ...unitsForCountryChange('OTHER', entered as never) }
    expect(after.diesel_stationary_unit, '1,000 gallons must not become 1,000 litres').toBe('gallons')
    expect(after.diesel_stationary_amount).toBe(1000)
  })

  it('leaves snapUnitsForCountry alone, because other callers rely on its contract', () => {
    expect(snapUnitsForCountry('OTHER', { diesel_stationary_unit: 'gallons' }).diesel_stationary_unit).toBe('gallons')
  })
})

// ── NO SECOND REASON ON A REFUSED LOCATION ───────────────────────────────────────────────────
describe('a refused location is never asked for a grid region', () => {
  it('a refused location has no resolvable grid region, which is why no banner may ask for one', () => {
    for (const country of ['OTHER', 'JP', '']) {
      const l = loc({ country, grid_region: gridRegionForCountry(country) })
      expect(countryRefusal(l), country).not.toBeNull()
      expect(isResolvedGridRegion(l.grid_region), country).toBe(false)
    }
  })

  it('a supported country with an unresolved region is NOT refused, so its banner must still show', () => {
    const us = loc({ country: 'US', grid_region: '' })
    expect(countryRefusal(us)).toBeNull()
    expect(isResolvedGridRegion(us.grid_region)).toBe(false)
  })
})

// ── THE BANNER SHELL ─────────────────────────────────────────────────────────────────────────
describe('the banner heading matches whether the problem can be fixed', () => {
  it('fixable states promise a fix, unfixable ones do not', () => {
    expect(refusalBannerHeading({ state: 'country_not_set' })).toBe("We can't work out this location's emissions yet")
    expect(refusalBannerHeading({ state: 'country_not_listed', value: 'Japn' })).toBe("We can't work out this location's emissions yet")
    expect(refusalBannerHeading({ state: 'country_not_listed', value: 'OTHER' })).toBe("We don't calculate emissions for this location")
    expect(refusalBannerHeading({ state: 'country_not_supported', iso2: 'JP' })).toBe("We don't calculate emissions for this location")
  })

  it('the trailer says only what the sentence above it has not', () => {
    const r: CountryRefusal = { state: 'country_not_supported', iso2: 'JP' }
    // With figures, the sentence ends "Its figures are kept as entered", so the trailer drops that
    // clause too and is left with the one thing neither has said.
    expect(countryRefusalText(r, 'review', true)).toContain('Its figures are kept as entered.')
    expect(refusalBannerTrailer(r, true)).toBe("It isn't counted as zero.")
    // With nothing entered the sentence makes no such promise, so the clause is worth keeping.
    expect(countryRefusalText(r, 'review', false)).not.toContain('kept as entered')
    expect(refusalBannerTrailer(r, false)).toBe("It isn't counted as zero, and nothing you've entered here is lost.")
    // Neither form repeats the exclusion, which every sentence already states.
    for (const f of [true, false]) expect(refusalBannerTrailer(r, f), String(f)).not.toContain('left out')
  })

  it('every sentence uses the straight apostrophe the rest of the product uses', () => {
    // ⚠️ ONE CONVENTION, CHECKED RATHER THAN ASSUMED. The refusal sentences used the curly U+2019
    // while the page's own strings beside them use straight quotes ("don't", "isn't"), so one
    // amber box rendered both. A count across the GHG page, the verifier page, cat3Copy, series and
    // the assurance PDF found straight apostrophes outnumbering curly ones by about fourteen to one.
    const all = [
      ...ALL_REFUSALS.flatMap(r => SURFACES.flatMap(s => [countryRefusalText(r, s, true), countryRefusalText(r, s, false)])),
      ...ALL_REFUSALS.map(r => countryRefusalLabel(r)),
      ...ALL_REFUSALS.map(r => refusalBannerHeading(r)),
      ...ALL_REFUSALS.flatMap(r => [refusalBannerTrailer(r, true), refusalBannerTrailer(r, false)]),
    ]
    for (const t of all) expect(t, t).not.toContain('\u2019')
  })
})

// ── NO DOUBLED EXCLUSION STATEMENT ON A REFUSAL ROW ──────────────────────────────────────────
describe('the workings row states the exclusion once', () => {
  it('a refusal row carries the sentence alone, with no EXCLUDED FROM TOTALS prefix', () => {
    const rows = buildWorkings([loc({ country: 'JP', electricity_kwh: 1000 })], 'AR6', 2025)
    const row = rows.find(r => r.declaration === 'country_not_supported')!
    expect(row.note!.startsWith('No emission factor set is held')).toBe(true)
    expect(row.note, 'said once in the note').not.toContain('EXCLUDED FROM TOTALS')
    expect(row.gwp_basis, 'and once more in the basis cell, which is enough').toBe('excluded')
  })

  it('a unit-mismatch row KEEPS its prefix, because its message does not say it', () => {
    const rows = buildWorkings([loc({ country: 'US', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'm3' })], 'AR6', 2025)
    const row = rows.find(r => r.declaration === 'unpriceable')!
    expect(row.note).toContain('EXCLUDED FROM TOTALS')
  })
})

// ── CATEGORY 3 ───────────────────────────────────────────────────────────────────────────
describe('the Category 3 summary says a location was left out', () => {
  const T = '2026-09-21T00:00:00Z'
  const STREAMS = ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual', 'mobile', 'refrigerants', 'electricity', 'purchased_steam']
  const attest = (used: string[]) => STREAMS.filter(x => !used.includes(x)).map(stream => ({ stream, attested_at: T }))
  const A = loc({ id: 'A', name: 'Location 1', country: 'GB', grid_region: 'UK', has_natural_gas: true, natural_gas_amount: 10_000, natural_gas_unit: 'kwh', electricity_kwh: 5_000, stream_attestations: attest(['natural_gas', 'electricity']) as never })
  const B = loc({ id: 'B', name: 'other', country: 'OTHER', has_diesel_stationary: true, diesel_stationary_amount: 1_000, diesel_stationary_unit: 'litres', electricity_kwh: 2_000, stream_attestations: attest(['diesel_stationary', 'electricity']) as never })

  it('names the excluded location in the summary line', () => {
    const read = cat3InputsFrom(buildWorkings([A, B], 'AR6', 2025) as never, [A, B] as never)
    const summary = cat3WorkingsSummary(priceCat3(read.inputs!), read.skipped)
    expect(summary).toContain('at 1 location')
    expect(summary).toContain('1 location excluded (other)')
  })

  it('says nothing when nothing is excluded', () => {
    const read = cat3InputsFrom(buildWorkings([A], 'AR6', 2025) as never, [A] as never)
    expect(cat3WorkingsSummary(priceCat3(read.inputs!), read.skipped)).not.toContain('excluded')
  })

  it('a location name is reproduced exactly as entered, never capitalised by position', () => {
    // ⚠️ A NAME IS DATA, NOT PROSE. "other" rendered as "Other is excluded..." is a different name
    // from the one on the customer's screen, and a verifier matching sites by name would not find it.
    const text = cat3SkippedText({ code: 'location_excluded', location: 'other' })
    expect(text).toContain('the location other is excluded')
    expect(text, 'never sentence-initial').not.toMatch(/^Other\b/)
    const read = cat3InputsFrom(buildWorkings([A, B], 'AR6', 2025) as never, [A, B] as never)
    expect(cat3WorkingsSummary(priceCat3(read.inputs!), read.skipped)).toContain('(other)')
    // And on the GHG side, the sentence never opens with the name either.
    const rows = buildWorkings([B], 'AR6', 2025)
    expect(rows.find(r => r.declaration === 'country_not_listed')!.note).not.toMatch(/^other\b/i)
  })
})

// ── SURFACES THAT LIVE IN THE PAGE ──────────────────────────────────────────────────
//
// Read from disk, like lib/ghg/declarationStates.test.ts and the date guards. These are facts about
// one JSX file that no import can reach: a banner's guard, a label's wording, the position of a row
// in an array literal. A weaker check here than a rendered assertion, and the alternative is no
// check at all on the surfaces a customer actually reads.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const PAGE = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')

describe('the GHG page surfaces', () => {
  it('the grid banner chain is guarded by countryRefusal', () => {
    expect(PAGE, 'the whole banner chain must be skipped for a refused location')
      .toContain('{countryRefusal(loc) ? null : loc.country === ')
    // The supported-but-unresolved branch still exists and is still reachable.
    expect(PAGE).toContain("Select your {loc.country === 'CA' ? 'province' : 'state'}/region")
  })

  it('Review labels the intensity as the export does', () => {
    expect(PAGE, 'one figure must not have two names across two documents').toContain('S1 intensity: {')
    expect(PAGE, 'the old label is gone').not.toContain('>Intensity: {')
  })

  it('the exclusion note appears ONCE per card, not once per figure', () => {
    // ⚠️ A NOTE ADDED UNDER THE INTENSITY RENDERED TWICE, DIRECTLY ABOVE THE CARD'S OWN NOTE, and
    // the comment beside that one already said the note belongs to the card rather than to a line.
    // Every figure on the card comes from the same excluded set, so one note covers all of them.
    // An intensity needs its own only where it appears WITHOUT the totals: the CSV RESULTS block
    // and the assurance package's summary table, which each carry one.
    expect(PAGE).not.toContain('{rev > 0 && exclusionNote &&')
    const card = PAGE.slice(PAGE.indexOf('S1 intensity: {'), PAGE.indexOf('S1 intensity: {') + 2500)
    const notes = card.split('exclusionNote && (').length - 1
    expect(notes, 'exactly one exclusion note between the intensity and the end of the card').toBe(1)
  })

  it('the Review card drops its prefix for a refusal, and keeps it for a unit mismatch', () => {
    expect(PAGE).toContain("{blocked.kind === 'country' ? '' : 'Not included in any total. '}")
  })

  it('the CSV RESULTS block states what the figures exclude, before METHODS', () => {
    const results = PAGE.indexOf("['RESULTS'],")
    const methods = PAGE.indexOf("['METHODS'],", results)
    expect(results, 'RESULTS block not found').toBeGreaterThan(-1)
    expect(methods, 'METHODS block not found').toBeGreaterThan(results)
    const block = PAGE.slice(results, methods)
    expect(block, 'the exclusion row must sit inside RESULTS, not below in the breakdown')
      .toContain("['Excluded from the figures above', exclusionNote]")
    // ⚠️ INSIDE THE SHARED ROWS, NOT A PER-FRAMEWORK BRANCH. cdp, esrs, gri, ecovadis and ifrs all
    // build from this one array; a row added inside a `fw.id === ...` branch would appear in one
    // file and be missing from four.
    const row = block.indexOf("['Excluded from the figures above'")
    const branchBefore = block.lastIndexOf("fw.id ===", row)
    const closeBefore = block.lastIndexOf('] : []),', row)
    expect(closeBefore, 'the row must not be inside a framework branch').toBeGreaterThan(branchBefore)
  })
})
