import { describe, it, expect } from 'vitest'
import { ukFindPersonalInfo, ukScanPersonalInformation, UK_PERSONAL_INFO_KIND_LABEL, UK_PERSONAL_INFO_NOTE } from './exportCheck'
import { UK_SINGLE_COMPANY, UK_LLP, UK_GROUP } from './statementModel.fixtures'

const kinds = (t: string) => ukFindPersonalInfo(t).map(h => [h.kind, h.match])

describe('UK personal information: hits', () => {
  it.each([
    ['Write to us at 10 Downing Street, London SW1A 2AA.', 'postcode', 'SW1A 2AA'],
    ['Office: M1 1AE', 'postcode', 'M1 1AE'],
    ['Warehouse at B33 8TH', 'postcode', 'B33 8TH'],
    ['Depot CR2 6XH', 'postcode', 'CR2 6XH'],
    ['Post room DN55 1PT', 'postcode', 'DN55 1PT'],
    ['EC1A1BB', 'postcode', 'EC1A1BB'],
    ['Call +44 20 7946 0958 any time', 'phone', '+44 20 7946 0958'],
    ['Call +44 (0)161 496 0000', 'phone', '+44 (0)161 496 0000'],
    ['Mobile +447700900123', 'phone', '+447700900123'],
    ['Phone 020 7946 0958', 'phone', '020 7946 0958'],
    ['Phone (0161) 496 0000', 'phone', '(0161) 496 0000'],
    ['Phone 01632 960001', 'phone', '01632 960001'],
    ['Text 07700 900123', 'phone', '07700 900123'],
    ['Text 07700900123', 'phone', '07700900123'],
    ['Her NI number is AB 12 34 56 C.', 'ni_number', 'AB 12 34 56 C'],
    ['NI: JH123456A', 'ni_number', 'JH123456A'],
  ])('%s', (text, kind, match) => {
    expect(kinds(text)).toContainEqual([kind, match])
  })
  it('still finds what Canada’s scan finds', () => {
    expect(kinds('Email jo@example.co.uk or call (416) 555-0100')).toEqual([['email', 'jo@example.co.uk'], ['phone', '(416) 555-0100']])
  })
  it('reports a stretch of text once', () => {
    expect(ukFindPersonalInfo('+44 20 7946 0958')).toHaveLength(1)
  })
})

describe('UK personal information: non-hits', () => {
  it.each([
    'ISO 14001 and ISO 45001 certified',
    'Scope 3, Category 1',
    'Financial year 1 January 2025 to 31 December 2025, approved 14 May 2026',
    '18 staff completed the A4 course in Q3 2025',
    'SB 253 and AR6 GWP values',
    'Covers 2,450 workers in 11 factories; £1 200 000 spent',
    'Audit ref 01/04/2025-3',
    'Version 0.12.3',
    'GB 12 34 56 A',
    'QQ 12 34 56 C',
    'B2B, CO2 and PM2.5',
    'Invoice 0012345',
    '1200 suppliers, 300 audited',
  ])('%s', text => {
    expect(kinds(text)).toEqual([])
  })
  it('the fixtures are clean', () => {
    for (const f of [UK_SINGLE_COMPANY, UK_LLP, UK_GROUP]) expect(ukScanPersonalInformation(f.sections), f.giving).toEqual([])
  })
})

describe('labels and note', () => {
  it('every kind has a British label, and the note names the UK forms', () => {
    for (const k of ['email', 'phone', 'address', 'postcode', 'ni_number', 'sin'] as const) expect(UK_PERSONAL_INFO_KIND_LABEL[k]).toBeTruthy()
    expect(UK_PERSONAL_INFO_NOTE).toMatch(/UK postcodes/)
    expect(UK_PERSONAL_INFO_NOTE).toMatch(/National Insurance numbers/)
    expect(UK_PERSONAL_INFO_NOTE).toMatch(/\+44/)
    expect(UK_PERSONAL_INFO_NOTE).not.toMatch(/does not recognise UK postcodes|organiz|recogniz/)
  })
  it('a hit in a section is reported with its section and field', () => {
    expect(ukScanPersonalInformation({ due_diligence: { grievance_description: 'Ring 0800 123 4567 or write to PO Box 12, LS1 4AP.' } })).toEqual([
      { section: 'due_diligence', title: '5. Due diligence', field: expect.any(String), kind: 'phone', match: '0800 123 4567' },
      { section: 'due_diligence', title: '5. Due diligence', field: expect.any(String), kind: 'address', match: 'PO Box 12' },
      { section: 'due_diligence', title: '5. Due diligence', field: expect.any(String), kind: 'postcode', match: 'LS1 4AP' },
    ])
  })
})
