// lib/ghg/proposalEdits.test.ts
//
// T9: dates and unit corrected on the proposal itself, the month-only confirmation (rule R5), and the record
// of what was read and who changed it.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { editPeriod, editUnit, guardConfirm, rejectProposal, undoRejection } from './proposalEdits'
import {
  emptyLocation, acceptanceProblem, periodOriginOf, billContributions, findUnresolvedCoverage, periodFromYearAndEnd,
  deriveLocations, buildWorkings, BILLING_MONTH_CONFIRM_MESSAGE, NO_VALUE_MESSAGE,
  type Location, type SourceDoc, type ExtractedProposal,
} from './engine'
import { convertibleUnits } from '../unitConversions'

const AT = '2026-10-02T09:00:00.000Z'
const BY = { userId: 'u-1', email: 'jo@acme.example' }
const prop = (o: Partial<ExtractedProposal>): ExtractedProposal => ({
  fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf', periodStart: '2025-01-01',
  periodEnd: '2025-01-31', confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed', ...o,
})
const gdoc = (id: string, p: ExtractedProposal): SourceDoc =>
  ({ id, file_name: `${id}.pdf`, document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: `/${id}.pdf`, extracted: [p] })
const site = (docs: SourceDoc[]): Location => ({ ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: docs })
const W = periodFromYearAndEnd(2025, 12)
const apply = (p: ExtractedProposal, patch: Partial<ExtractedProposal>) => ({ ...p, ...guardConfirm(p, patch) })
const contrib = (p: ExtractedProposal) => billContributions(site([gdoc('a', p)]), [], W)[0]
const statuses = (l: Location) => findUnresolvedCoverage([l], 2025, 12, []).map(i => i.status)

describe('month-only bills (rule R5)', () => {
  const monthOnly = prop({ periodOrigin: 'billing_month', status: 'extracted', periodStart: '2025-01-01', periodEnd: '2025-01-31' })

  it('cannot reach confirmed without the dates being confirmed', () => {
    expect(acceptanceProblem(monthOnly)).toBe(BILLING_MONTH_CONFIRM_MESSAGE)
    expect(apply(monthOnly, { status: 'confirmed' }).status, 'Confirm is refused').toBe('extracted')
    expect(apply(monthOnly, { value: 120, status: 'confirmed' }), 'editing the figure does not confirm it either')
      .toMatchObject({ value: 120, status: 'extracted' })
  })

  it('confirming the dates records origin, time and user, and confirms the bill', () => {
    const after = apply(monthOnly, editPeriod(monthOnly, { start: '2025-01-01', end: '2025-01-31', by: BY, at: AT, confirm: true }))
    expect(after).toMatchObject({ status: 'confirmed', periodOrigin: 'customer_confirmed', periodConfirmedAt: AT, periodConfirmedBy: BY })
    expect(after.corrections, 'dates confirmed unchanged are not a correction').toBeUndefined()
    expect(acceptanceProblem(after)).toBeNull()
  })

  it('correcting the dates while confirming keeps the month as read', () => {
    const after = apply(monthOnly, editPeriod(monthOnly, { start: '2025-01-05', end: '2025-02-04', by: BY, at: AT, confirm: true }))
    expect(after).toMatchObject({ status: 'confirmed', periodStart: '2025-01-05', periodEnd: '2025-02-04' })
    expect(after.asRead).toEqual({ periodStart: '2025-01-01', periodEnd: '2025-01-31', unit: 'mcf' })
    expect(after.corrections).toEqual([{ fields: ['period'], at: AT, by: BY }])
  })

  it('legacy medium proposals read billing_month; printed dates confirm as before', () => {
    expect(periodOriginOf({ periodConfidence: 'medium' })).toBe('billing_month')
    expect(acceptanceProblem({ periodConfidence: 'medium' })).not.toBeNull()
    expect(periodOriginOf({ periodConfidence: 'high' })).toBe('printed')
    const printed = prop({ periodConfidence: 'high', status: 'extracted' })
    expect(apply(printed, { status: 'confirmed' }).status).toBe('confirmed')
  })

  it('the contribution carries the recorded origin', () => {
    expect(contrib(prop({ periodOrigin: 'customer_confirmed', periodConfidence: 'medium' })).periodOrigin).toBe('customer_confirmed')
    expect(contrib(prop({ periodConfidence: 'medium' })).periodOrigin).toBe('billing_month')
  })

  it('the page maps the origin at extraction and guards every patch', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    // T10b: a delivery date (no period) is a delivery; otherwise the R5 mapping is unchanged.
    expect(page).toContain("periodOrigin: !f.periodStart && !f.periodEnd && f.deliveryDate ? 'delivery'")
    expect(page).toContain(": f.periodConfidence === 'high' ? 'printed' : f.periodConfidence === 'medium' ? 'billing_month' : null,")
    expect(page).toContain('i === propIdx ? { ...p, ...guardConfirm(p, patch, d.document_type) } : p')
  })
})

describe('undated or invalid period: entering valid dates counts the bill and clears the issue', () => {
  for (const [label, o, before] of [
    ['undated', { periodStart: null, periodEnd: null }, 'undated'],
    ['reversed', { periodStart: '2025-03-10', periodEnd: '2025-03-01' }, 'invalid_period'],
    ['unparseable', { periodStart: 'Mar 2025', periodEnd: '2025-03-31' }, 'invalid_period'],
  ] as const) {
    it(label, () => {
      const p = prop(o)
      expect(contrib(p).reason).toBe(before)
      expect(statuses(site([gdoc('a', p)]))).toContain(before)
      const fixed = apply(p, editPeriod(p, { start: '2025-03-01', end: '2025-03-31', by: BY, at: AT }))
      expect(contrib(fixed)).toMatchObject({ counted: true, reason: 'counted' })
      expect(statuses(site([gdoc('a', fixed)]))).not.toContain(before)
      expect(fixed.asRead).toEqual({ periodStart: o.periodStart, periodEnd: o.periodEnd, unit: 'mcf' })
    })
  }
  it('dates across the year boundary are prorated', () => {
    const p = prop({ periodStart: null, periodEnd: null })
    const fixed = apply(p, editPeriod(p, { start: '2024-12-20', end: '2025-01-19', by: BY, at: AT }))
    expect(contrib(fixed)).toMatchObject({ counted: true, reason: 'prorated', inWindowDays: 19, totalDays: 31 })
  })
})

describe('mixed units: correcting the bill\'s unit re-converts and counts every bill', () => {
  it('a bill misread as therms, corrected to Mcf', () => {
    const a = prop({})
    const b = prop({ rawValue: 200, rawUnit: 'therms', value: 200, unit: 'therms', periodStart: '2025-02-01', periodEnd: '2025-02-28' })
    expect(statuses(site([gdoc('a', a), gdoc('b', b)]))).toContain('mixed_units')
    const fixed = apply(b, editUnit(b, { unit: 'mcf', by: BY, at: AT }))
    expect(fixed).toMatchObject({ rawUnit: 'mcf', rawValue: 200, value: 200, unit: 'mcf' })
    const l = site([gdoc('a', a), gdoc('b', fixed)])
    expect(statuses(l)).not.toContain('mixed_units')
    expect(deriveLocations({ locations: [l], reporting_year: 2025 })[0].natural_gas_amount).toBe(300)
    expect(fixed.asRead).toEqual({ periodStart: '2025-02-01', periodEnd: '2025-02-28', unit: 'therms' })
    expect(fixed.corrections).toEqual([{ fields: ['unit'], at: AT, by: BY }])
  })
  it('the number is the bill\'s, re-converted, never relabelled: 100 Ccf becomes 10 Mcf', () => {
    const p = prop({ rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf' })
    const fixed = apply(p, editUnit(p, { unit: 'ccf', by: BY, at: AT }))
    expect(fixed.rawValue).toBe(100)
    expect(fixed.unit).toBe('mcf')
    expect(fixed.value).toBeCloseTo(10, 9)
  })
  it('a unit the conversion cannot handle leaves the bill for manual review, with no figure guessed', () => {
    const p = prop({ fuelType: 'diesel', rawUnit: 'gallons', unit: 'gallons' })
    const fixed = apply(p, editUnit(p, { unit: 'kwh', by: BY, at: AT }))
    expect(fixed).toMatchObject({ value: null, status: 'needs_manual_review', rawUnit: 'kwh' })
  })
  it('the unit control offers only units the conversion handles', () => {
    expect(convertibleUnits('natural_gas')).toEqual(['mcf', 'therms', 'mmbtu', 'm3', 'kwh', 'ccf', 'gj', 'mj'])
    expect(convertibleUnits('electricity')).toEqual(['kwh', 'mwh', 'gj'])
    expect(convertibleUnits('diesel')).toEqual(['gallons', 'litres'])
  })
})

describe('records', () => {
  it('the original reading is kept once; every change is appended with who and when', () => {
    const p = prop({ rawUnit: 'therms', unit: 'therms' })
    const once = apply(p, editUnit(p, { unit: 'mcf', by: BY, at: AT }))
    const twice = apply(once, editPeriod(once, { start: '2025-01-02', end: '2025-01-31', by: { userId: 'u-2', email: 'sam@acme.example' }, at: '2026-10-03T10:00:00.000Z' }))
    expect(twice.asRead, 'the first reading, not the corrected one').toEqual({ periodStart: '2025-01-01', periodEnd: '2025-01-31', unit: 'therms' })
    expect(twice.corrections?.map(c => [c.fields, c.by.email])).toEqual([[['unit'], 'jo@acme.example'], [['period'], 'sam@acme.example']])
  })
  it('the workings row shows the bill was corrected by the customer, with the reading', () => {
    const p = prop({ rawUnit: 'therms', unit: 'therms' })
    const fixed = apply(p, editUnit(p, { unit: 'mcf', by: BY, at: AT }))
    const rows = buildWorkings([site([gdoc('a', fixed)])], 'AR6', 2025, [], 12) as { stream?: string; contributions?: { asRead?: unknown; corrections?: unknown[] }[] }[]
    const c = rows.find(r => r.stream === 'natural_gas')!.contributions![0]
    expect(c.asRead).toEqual({ periodStart: '2025-01-01', periodEnd: '2025-01-31', unit: 'therms' })
    expect(c.corrections).toHaveLength(1)
  })
  it('an edit touches only its own proposal (the patch carries no other bill)', () => {
    const p = prop({})
    for (const patch of [editPeriod(p, { start: '2025-01-01', end: '2025-01-30', by: BY, at: AT }), editUnit(p, { unit: 'therms', by: BY, at: AT })]) {
      expect(Object.keys(patch).every(k => k in p || ['asRead', 'corrections', 'periodOrigin', 'periodConfirmedAt', 'periodConfirmedBy', 'conversionNote'].includes(k))).toBe(true)
    }
  })
})

describe('Reject and Undo (T9 ruling)', () => {
  const BY2 = { userId: 'u-2', email: 'sam@acme.example' }
  const LATER = '2026-10-03T10:00:00.000Z'
  const reject = (p: ExtractedProposal) => apply(p, rejectProposal(p, { by: BY, at: AT }))
  const undo = (p: ExtractedProposal) => apply(p, undoRejection(p, { by: BY2, at: LATER }))
  const lastDay = (m: number) => new Date(2025, m, 0).getDate()
  const bill = (k: number) => prop({ periodStart: `2025-${String(k).padStart(2, '0')}-01`, periodEnd: `2025-${String(k).padStart(2, '0')}-${lastDay(k)}` })

  it('records who and when, and the status it had; the document stays', () => {
    const doc = gdoc('a', prop({}))
    const r = reject(doc.extracted![0])
    expect(r.status).toBe('rejected')
    expect(r.statusLog).toEqual([{ action: 'rejected', at: AT, by: BY, statusBefore: 'confirmed' }])
    const l = site([{ ...doc, extracted: [r] }])
    expect(l.source_docs.map(d => d.id), 'kept as evidence').toEqual(['a'])
    expect(billContributions(l, [], W)[0]).toMatchObject({ counted: false, reason: 'not_confirmed', statusLog: r.statusLog })
  })

  it('works from review too: a pending bill can be rejected', () => {
    expect(reject(prop({ status: 'extracted' })).status).toBe('rejected')
    expect(reject(prop({ status: 'needs_manual_review', periodOrigin: 'billing_month' })).status).toBe('rejected')
  })

  it('undo restores the previous state, and is recorded too', () => {
    const before = prop({})
    const back = undo(reject(before))
    expect(back.status).toBe('confirmed')
    expect(back.statusLog?.map(e => [e.action, e.by.email, e.at])).toEqual([['rejected', 'jo@acme.example', AT], ['undone', 'sam@acme.example', LATER]])
    expect(contrib(back), 'counted again, exactly as before').toEqual({ ...contrib(before), statusLog: back.statusLog })
    expect(undo(reject(prop({ status: 'extracted' }))).status).toBe('extracted')
  })

  it('undo never gets round the month-only confirmation', () => {
    const legacy = prop({ periodConfidence: 'medium' })     // confirmed on month-only dates before T9
    expect(undo(reject(legacy)).status).toBe('extracted')
  })

  it('rejecting every bill under a switched-off fuel clears stream_off, and leads to the all-rejected issue', () => {
    const off = (docs: SourceDoc[]) => ({ ...site(docs), has_natural_gas: false })
    const docs = [gdoc('a', bill(1)), gdoc('b', bill(2))]
    expect(statuses(off(docs))).toContain('stream_off')
    const one = [{ ...docs[0], extracted: [reject(docs[0].extracted![0])] }, docs[1]]
    expect(statuses(off(one)), 'one bill still confirmed').toContain('stream_off')
    const both = one.map(d => d.id === 'b' ? { ...d, extracted: [reject(d.extracted![0])] } : d)
    expect(statuses(off(both))).not.toContain('stream_off')
    expect(statuses(off(both))).toContain('all_rejected')
  })

  it('rejecting one of two overlapping bills clears the overlap; the other still counts', () => {
    const a = gdoc('a', prop({}))
    const b = gdoc('b', prop({ value: 120, rawValue: 120 }))
    expect(statuses(site([a, b]))).toContain('overlap')
    const l = site([a, { ...b, extracted: [reject(b.extracted![0])] }])
    expect(statuses(l)).not.toContain('overlap')
    expect(deriveLocations({ locations: [l], reporting_year: 2025 })[0].natural_gas_amount).toBe(100)
  })

  it('the review row offers Reject on every live bill, and only Undo on a rejected one', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain("rejectProposal(p, { by: currentUser, at: new Date().toISOString() })")
    expect(page).toContain(">Reject</button>")
    expect(page).toContain("undoRejection(p, { by: currentUser, at: new Date().toISOString() })")
    expect(page).toContain(">Undo</button>")
    expect(page).toContain(") : p.status === 'rejected' ? (")
  })
})

describe('T10a: a proposal with no figure can never be confirmed', () => {
  const blank = prop({ rawValue: 6944, rawUnit: 'MJ', value: null, unit: null, status: 'needs_manual_review' })
  it('Confirm is refused, and so is any patch that confirms without a figure', () => {
    expect(apply(blank, { status: 'confirmed' }).status).toBe('needs_manual_review')
    expect(apply(blank, { notes: 'x', status: 'confirmed' })).toMatchObject({ notes: 'x', status: 'needs_manual_review' })
  })
  it('"Edit figure" confirms, because its patch carries the figure', () => {
    expect(apply(blank, { value: 6.58, status: 'confirmed' })).toMatchObject({ value: 6.58, status: 'confirmed' })
  })
  it('"Edit unit" to MJ gives it a figure, and it can then be confirmed', () => {
    const fixed = apply(blank, editUnit(blank, { unit: 'mj', by: BY, at: AT }))
    expect(fixed.value).toBeCloseTo(6.581642, 6)
    expect(apply(fixed, { status: 'confirmed' }).status).toBe('confirmed')
  })
  it('Undo on a rejected bill with no figure goes back to Needs review, never silently stays rejected', () => {
    const wasConfirmed = prop({ value: null, unit: null, status: 'confirmed' })
    const r = apply(wasConfirmed, rejectProposal(wasConfirmed, { by: BY, at: AT }))
    expect(apply(r, undoRejection(r, { by: BY, at: AT })).status).toBe('needs_manual_review')
  })
  it('the page disables Confirm and says what to do', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain('<button disabled={valueProblem(p) !== null || fleetTypeProblem(doc.document_type, p) !== null}')
    expect(page).toContain("{p.status !== 'rejected' && valueProblem(p) && (")
    expect(NO_VALUE_MESSAGE).toBe("We couldn't find a usable figure on this bill. Check the unit or enter the figure yourself, or reject the bill if it shouldn't be included.")
  })
})

// ── FI9 diff 4 (ruling R16): a fleet-fuel reading's vehicle type, chosen at review ──────────────────────────────
import { chooseFleetType } from './proposalEdits'

describe('FI9 diff 4: the vehicle type of a fleet-fuel reading', () => {
  const fuel = prop({ fuelType: 'diesel', value: 500, unit: 'litres', rawValue: 500, rawUnit: 'litres', status: 'extracted',
    periodStart: '2025-01-01', periodEnd: '2025-12-31' })
  const fdoc = (p: ExtractedProposal): SourceDoc => ({ ...gdoc('f', p), document_type: 'fleet_fuel' })

  it('a receipt cannot be confirmed without a type; with one it can', () => {
    expect(guardConfirm(fuel, { status: 'confirmed' }, 'fleet_fuel')).toEqual({})
    const typed = { ...fuel, ...chooseFleetType(fuel, 'heavy', { by: BY, at: AT }) }
    expect(guardConfirm(typed, { status: 'confirmed' }, 'fleet_fuel')).toEqual({ status: 'confirmed' })
    // Other document types are not asked.
    expect(guardConfirm(fuel, { status: 'confirmed' }, 'fuel_diesel')).toEqual({ status: 'confirmed' })
  })

  it('choosing Heavy routes the reading to heavy_diesel_amount, and the derived figure lands there', () => {
    const typed = { ...fuel, ...chooseFleetType(fuel, 'heavy', { by: BY, at: AT }) }
    const confirmed = { ...typed, ...guardConfirm(typed, { status: 'confirmed' }, 'fleet_fuel') }
    const l = { ...emptyLocation('L1', 'Depot'), country: 'GB', grid_region: 'UK', has_mobile: true, fleet_heavy: true, source_docs: [fdoc(confirmed)] } as Location
    const d = deriveLocations({ locations: [l], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: [] })[0]
    expect([d.heavy_diesel_amount, d.diesel_mobile_amount]).toEqual([500, 0])
    expect(buildWorkings([d], 'AR6', 2025).filter(r => r.stream === 'mobile').map(r => [r.source, r.activity_data])).toEqual([['Diesel (heavy vehicles)', 500]])
  })

  it('the choice is recorded with who and when; changing a confirmed reading\'s type sends it back for confirming', () => {
    const p1 = chooseFleetType(fuel, 'light', { by: BY, at: AT })
    expect(p1).toEqual({ fleetType: 'light', fleetTypeLog: [{ from: null, to: 'light', at: AT, by: BY }] })
    const confirmed = { ...fuel, ...p1, status: 'confirmed' as const }
    expect(chooseFleetType(confirmed, 'light', { by: BY, at: AT }), 'the same type changes nothing').toEqual({})
    const p2 = chooseFleetType(confirmed, 'non_road', { by: BY, at: '2026-10-03T00:00:00.000Z' })
    expect(p2.status).toBe('extracted')
    expect(p2.fleetTypeLog).toEqual([{ from: null, to: 'light', at: AT, by: BY }, { from: 'light', to: 'non_road', at: '2026-10-03T00:00:00.000Z', by: BY }])
  })

  it('an old-field document (read before FI9, no type) is moved by the chooser, with who and when', () => {
    const old = { ...fuel, status: 'confirmed' as const }
    const l = { ...emptyLocation('L1', 'Depot'), country: 'GB', grid_region: 'UK', has_mobile: true, source_docs: [fdoc(old)] } as Location
    const before = deriveLocations({ locations: [l], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: [] })[0]
    expect(before.diesel_mobile_amount).toBe(500)
    expect(findUnresolvedCoverage([l], 2025, 12, []).map(i => i.status)).toContain('fleet_type_missing')
    const patch = chooseFleetType(old, 'heavy', { by: BY, at: AT })
    expect(patch).toEqual({ fleetType: 'heavy', fleetTypeLog: [{ from: null, to: 'heavy', at: AT, by: BY }] })
    const moved = { ...l, fleet_heavy: true, source_docs: [fdoc({ ...old, ...patch })] } as Location
    const after = deriveLocations({ locations: [moved], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: [] })[0]
    expect([after.heavy_diesel_amount, after.diesel_mobile_amount]).toEqual([500, 0])
    expect(findUnresolvedCoverage([moved], 2025, 12, [])).toEqual([])
  })

  it('the page gates Confirm on the type, shows the chooser for fleet fuel, and ticks the chosen type', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain("{doc.document_type === 'fleet_fuel' && p.status !== 'rejected' && (p.fuelType === 'diesel' || p.fuelType === 'gasoline') && (")
    expect(page).toContain('<FleetTypeChooser p={p} by={currentUser} onChoose={patch => onUpdateProposal(locIdx, doc.id, pi, patch)} />')
    expect(page).toContain('if (patch.fleetType) locs[locIdx] = withFleetTypeTicked(locs[locIdx], patch.fleetType)')
  })
})
