// lib/testing/t17Fixture.ts
//
// T17: the T11 fixture as saved, with a withdrawn document and a deleted one: an excluded bill, a month-only bill, a
// same-bill copy and a manual override. Built by the engine, as a save builds it, for the tests of what the PDF and the
// verifier page print from the stored row. Test support only; nothing in the app imports it.

import { buildWorkings, deriveLocations, emptyLocation, type Location, type ExtractedProposal, type SourceDoc, type CoverageResolution } from '../ghg/engine'
import { addOverride } from '../ghg/overrides'
import { TEST_PREPARED_ON } from './heldSelection'

// The SHA-256 of the string 'gas-apr.pdf': a real 64-character digest, as lib/ghg/fileHash.ts stores one.
export const GAS_APR_SHA256 = 'af3d25816e311a34a769d51ed0dc1f59b091d135040628b5ecb5cf13a12bccbc'
export const BY = { userId: 'u-1', email: 'jo@acme.example' }
const p = (o: Partial<ExtractedProposal>): ExtractedProposal => ({ fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf',
  periodStart: '2025-01-01', periodEnd: '2025-01-31', confidence: 'high', periodConfidence: 'high', sourceQuote: 'January: 100 MCF', notes: null, status: 'confirmed', ...o })
const d = (id: string, type: string, ps: ExtractedProposal[], o: Partial<SourceDoc> = {}): SourceDoc =>
  ({ id, file_name: `${id}.pdf`, document_type: type, uploaded_at: '2025-06-01T10:00:00.000Z', file_path: `/${id}.pdf`, extracted: ps, ...o })

/** The T11 fixture, plus a withdrawn document and a deleted one, as saved. */
export function t17Fixture() {
  let l: Location = { ...emptyLocation('L1', 'Site A'), country: 'US', state: 'CA', grid_region: 'US_CA', has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: [
    d('gas-jan', 'utility_bill_gas', [p({ confirmations: [{ at: '2026-10-02T09:00:00.000Z', by: BY, reading: { value: 100, unit: 'mcf', rawValue: 100, rawUnit: 'mcf', periodStart: '2025-01-01', periodEnd: '2025-01-31', sourceQuote: 'January: 100 MCF' } }] })]),
    d('gas-dec24', 'utility_bill_gas', [p({ periodStart: '2024-12-01', periodEnd: '2024-12-31', value: 90, rawValue: 90, sourceQuote: 'December 2024: 90 MCF' })]),
    d('gas-feb', 'utility_bill_gas', [p({ periodStart: '2025-02-01', periodEnd: '2025-02-28', periodConfidence: 'medium', value: 80, rawValue: 80, sourceQuote: 'February: 80 MCF' })]),
    d('gas-feb-copy', 'utility_bill_gas', [p({ periodStart: '2025-02-01', periodEnd: '2025-02-28', periodConfidence: 'medium', value: 80, rawValue: 80, sourceQuote: 'February copy: 80 MCF' })]),
    d('gas-mar', 'utility_bill_gas', [p({ periodStart: '2025-03-01', periodEnd: '2025-03-31', value: 70, rawValue: 70, status: 'rejected', sourceQuote: 'March: 70 MCF' })],
      { withdrawn: { at: '2026-10-05T09:00:00.000Z', by: BY, reason: 'Uploaded to the wrong site' } }),
    d('elec-q1', 'utility_electricity', [p({ fuelType: 'electricity', rawUnit: 'kwh', unit: 'kwh', value: 5000, rawValue: 5000, periodEnd: '2025-03-31', sourceQuote: 'Q1: 5,000 kWh' })]),
  ], document_log: [{ kind: 'deleted', docId: 'gas-apr', file: 'gas-apr.pdf', documentType: 'utility_bill_gas', uploadedAt: '2025-06-01T10:00:00.000Z', sha256: GAS_APR_SHA256, at: '2026-10-06T09:00:00.000Z', by: BY, reason: 'Holds another tenant\'s account number' }] }
  l = { ...l, ...addOverride(l, { field: 'electricity_kwh', reason: 'Bill covers two tenants; our share is 40%', by: BY, at: '2026-10-03T09:00:00.000Z', startFrom: 5000 }), electricity_kwh: 2000 } as Location
  const res = [{ locId: 'L1', fuelType: 'natural_gas', kind: 'same_bill', countedDocId: 'gas-feb', excludedDocIds: ['gas-feb-copy'], by: BY,
    note: 'gas-feb.pdf and gas-feb-copy.pdf are the same bill, so it is counted once, from gas-feb.pdf.', acknowledgedAt: '2026-10-04T09:00:00.000Z' }] as CoverageResolution[]
  const workings = buildWorkings(deriveLocations({ locations: [l], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: res }), 'AR6', 2025, res, 12, { preparedOn: TEST_PREPARED_ON })
  return { location: l, workings: JSON.parse(JSON.stringify(workings)) as unknown[], resolutions: res }
}
