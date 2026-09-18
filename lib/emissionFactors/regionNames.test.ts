import { describe, it, expect } from 'vitest'
import { ROW_BUCKET_NAMES, regionName, countryName, regionLabel, countryLabel } from './regionNames'
import ixiFile from './exiobaseFactors2019ixi.json'
import concordance from './countryRegions.json'

// A region code in a sentence a customer reads is internal vocabulary, like a sector code. These
// tests pin that every region the factors cover has a NAME, that the names are English whatever the
// runtime's locale, and that WF means one thing as a region and another as a country.

const REGIONS = [...new Set((ixiFile.factors as { region: string }[]).map(f => f.region))].sort()

describe('regionNames', () => {
  it('N1 every one of the 49 factor regions has a name, and none is the bare code', () => {
    expect(REGIONS).toHaveLength(49)
    const unnamed = REGIONS.filter(r => regionName(r) === r)
    expect(unnamed).toEqual([])
  })

  it('N2 the five buckets carry their published names, spelled as the concordance workbook spells them', () => {
    expect(ROW_BUCKET_NAMES).toEqual({
      WA: 'RoW Asia and Pacific', WE: 'RoW Europe', WF: 'RoW Africa', WL: 'RoW America', WM: 'RoW Middle East',
    })
    for (const code of Object.keys(ROW_BUCKET_NAMES)) expect(REGIONS, code).toContain(code)
  })

  it('N3 labels put the code in brackets after the name', () => {
    expect(regionLabel('WA')).toBe('RoW Asia and Pacific (WA)')
    expect(regionLabel('DE')).toBe('Germany (DE)')
    expect(countryLabel('VN')).toBe('Vietnam (VN)')
  })

  it('N4 ⚠️ WF: RoW Africa as a region; as a country it is Wallis and Futuna, which is not supported', () => {
    expect(regionName('WF')).toBe('RoW Africa')
    // Wallis and Futuna has no concordance row, so as a COUNTRY the code is not named at all — and in
    // particular never borrows the region's name.
    expect(countryName('WF')).toBe('WF')
    expect(countryLabel('WF')).toBe('WF')
  })

  it('N5 a code outside the 49 regions / 212 countries is returned as itself — never a CLDR invention', () => {
    // Intl.DisplayNames would answer these with "Unknown Region", "Outlying Oceania", "Pseudo-Accents",
    // "European Union" and (as an alias) "United Kingdom". None is a region or country this product
    // describes, so none may come back as a name.
    for (const code of ['ZZ', 'QO', 'XA', 'EU', 'UK', 'AA']) {
      expect(regionName(code), code).toBe(code)
      expect(countryName(code), code).toBe(code)
      expect(regionLabel(code), code).toBe(code)
    }
  })

  it('N7 every one of the 212 concordance countries has a name', () => {
    const iso2 = (concordance as { mapping: { iso2: string }[] }).mapping.map(r => r.iso2)
    expect(iso2).toHaveLength(212)
    const unnamed = iso2.filter(c => countryName(c) === c)
    expect(unnamed).toEqual([])
    expect(countryName('XK')).toBe('Kosovo')
  })

  it('N6 names are English regardless of the process locale', () => {
    // The module asks Intl for 'en' explicitly. A German-locale process must still write "Germany".
    expect(regionName('DE')).toBe(new Intl.DisplayNames(['en'], { type: 'region' }).of('DE'))
    expect(regionName('DE')).toBe('Germany')
  })
})
