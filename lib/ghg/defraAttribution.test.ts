import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFRA_DESNZ_PUBLICATION, EF_SOURCES, steamFactorFor, buildWorkings, emptyLocation,
  sourceAttributionsFor, sourceAttributionsForLocations,
} from './engine'
import type { Location } from './engine'

// ⚠️ OGL v3.0's rights END AUTOMATICALLY if the source is not acknowledged. These tests pin the required
// wording, that every DEFRA citation form triggers it, that no other publisher is attributed on a licence
// nobody has read, and that every surface showing a DEFRA-derived Scope 1 or 2 figure reads the record.

const ROOT = join(__dirname, '../..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const bare = (over: Partial<Location>): Location => ({ ...emptyLocation('l1', 'Site'), ...over })

describe('DEFRA/DESNZ licence attribution', () => {
  it('A1 the record holds the wording OGL v3.0 prescribes, verbatim', () => {
    // Typed out here ON PURPOSE, once: this test is what pins the required string. Surfaces read the field.
    expect(DEFRA_DESNZ_PUBLICATION.attribution_required).toBe('Contains public sector information licensed under the Open Government Licence v3.0.')
    expect(DEFRA_DESNZ_PUBLICATION.licence).toBe('Open Government Licence v3.0 (OGL v3.0)')
    expect(DEFRA_DESNZ_PUBLICATION.licence_url).toBe('http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/')
  })

  it('A2 every DEFRA citation form attracts it, including the pre-canonical steam wording stored in old workings', () => {
    const forms = [
      EF_SOURCES.combustion_uk, EF_SOURCES.steam_uk, EF_SOURCES.electricity_uk,
      (steamFactorFor({ country: 'GB' }) as { source: string }).source,
      'UK DESNZ/DEFRA (2026) GHG Conversion Factors, flat file v1.2 — Scope 2, District heat and steam',
    ]
    for (const f of forms) {
      expect(sourceAttributionsFor([f]), f).toEqual([{
        publisher: 'DEFRA/DESNZ', attribution: DEFRA_DESNZ_PUBLICATION.attribution_required,
        licence: DEFRA_DESNZ_PUBLICATION.licence, licence_url: DEFRA_DESNZ_PUBLICATION.licence_url,
      }])
    }
    expect(sourceAttributionsFor(forms), 'one line per publisher, however many rows cite it').toHaveLength(1)
  })

  it('A3 no other publisher is attributed: none has a recorded licence', () => {
    // EF_SOURCES.electricity is excluded because it is a six-publisher CATALOGUE that names DEFRA; it is
    // never a row's citation, and sourceAttributionsFor says not to pass it.
    const others = Object.entries(EF_SOURCES)
      .filter(([k]) => !['combustion_uk', 'steam_uk', 'electricity_uk', 'electricity'].includes(k))
      .map(([, v]) => v)
    expect(sourceAttributionsFor(others)).toEqual([])
    expect(sourceAttributionsFor([null, undefined, '', '—'])).toEqual([])
  })

  it('A4 a UK inventory is attributed from its locations and from its workings rows; a US one is not', () => {
    const uk = bare({ country: 'GB', grid_region: 'UK', electricity_kwh: 10_000 })
    const us = bare({ country: 'US', grid_region: 'US_CA', electricity_kwh: 10_000 })
    expect(sourceAttributionsForLocations([uk])).toHaveLength(1)
    expect(sourceAttributionsForLocations([us])).toEqual([])
    expect(sourceAttributionsForLocations([us, uk])).toHaveLength(1)
    expect(sourceAttributionsFor(buildWorkings([uk], 'AR6', 2026).map(r => r.ef_source))).toHaveLength(1)
    expect(sourceAttributionsFor(buildWorkings([us], 'AR6', 2026).map(r => r.ef_source))).toEqual([])
  })

  it('A5 every surface showing a DEFRA-derived Scope 1 or 2 figure reads the record', () => {
    const ghg = read('app/dashboard/ghg/page.tsx')
    expect(ghg, 'workings').toContain('sourceAttributionsFor(allRows.map(r => r.ef_source))')
    expect(ghg, 'workings').toContain('<SourceAttributions attributions={attributions}')
    expect(ghg, 'framework CSV').toContain('...sourceAttributionsForLocations(inventory.locations).flatMap(a => [')
    expect(read('lib/assurancePdf.ts'), 'assurance PDF').toContain('...sourceAttributionsForLocations(inventory.locations).flatMap(a => [')
    expect(read('app/verify/[token]/page.tsx'), 'verifier page').toContain('<SourceAttributions attributions={sourceAttributionsFor(inv.workings.map(factorSourceOf))}')
    expect(read('app/methodology/page.tsx'), 'methodology').toContain('${DEFRA_DESNZ_PUBLICATION.attribution_required}')
    expect(read('app/components/SourceAttributions.tsx'), 'renderer').toContain('{a.attribution}')
  })

  it('A6 ⚠️ the wording is typed out nowhere under app/ or lib/ except its record', () => {
    // defraPublication.ts is the record. Tests may pin it. Everything else must read the field, so the
    // required string cannot be reworded, shortened or drift on any surface.
    const typed: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) { walk(path); continue }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue
        if (path === join(ROOT, 'lib/ghg/defraPublication.ts')) continue
        if (/public sector information/i.test(readFileSync(path, 'utf8'))) typed.push(path)
      }
    }
    walk(join(ROOT, 'app'))
    walk(join(ROOT, 'lib'))
    expect(typed).toEqual([])
  })
})
