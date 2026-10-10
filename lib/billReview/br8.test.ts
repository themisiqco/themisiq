// lib/billReview/br8.test.ts
//
// BR8: the server's check of a specialist's reading, the queue's order, and the switch's words. Pure.

import { describe, it, expect } from 'vitest'
import { checkReading, fuelsFor } from './readingCheck'
import { sortQueue, isOverdue } from './queueOrder'
import { switchSentence, nowLine, ifChangeLine, changeButton } from './switchWords'
import { blankDraft, draftMissing, canSave } from './readingDraft'
import { readingToProposal } from './mergeReadings'

const ok = { fuelType: 'electricity', value: 4210, unit: 'kwh', periodStart: '2026-01-01', periodEnd: '2026-01-31', sourceQuote: 'Total usage 4,210 kWh' }

describe('BR8 reading check: the server re-checks every field', () => {
  it('a good reading becomes a row, and that row becomes the AI’s proposal shape, converted as extraction does', () => {
    const c = checkReading('utility_electricity', { ...ok, value: '12', unit: 'mwh', notes: ' second page ' })
    expect(c).toEqual({ ok: true, row: { fuel_type: 'electricity', raw_value: 12, raw_unit: 'mwh', period_start: '2026-01-01', period_end: '2026-01-31',
      delivery_date: null, source_quote: 'Total usage 4,210 kWh', notes: 'second page', supersedes: null } })
    if (!c.ok) return
    const p = readingToProposal({ ...c.row, id: 'rd-1', bill_review_document_id: 'r-1', read_at: '2026-10-22T10:00:00Z' })
    expect(p).toMatchObject({ rawValue: 12, rawUnit: 'mwh', value: 12000, unit: 'kwh', status: 'extracted', periodOrigin: 'printed' })
  })
  it('fuel: only one the document type carries', () => {
    expect(fuelsFor('utility_electricity')).toEqual(['electricity'])
    expect(fuelsFor('fleet_fuel').sort()).toEqual(['diesel', 'gasoline'])
    expect(checkReading('utility_electricity', { ...ok, fuelType: 'natural_gas' })).toEqual({ ok: false, error: 'Choose a fuel this kind of document carries.' })
  })
  it('value: a finite number, 0 or more', () => {
    for (const value of [-1, 'abc', Infinity, null]) expect(checkReading('utility_electricity', { ...ok, value }).ok, String(value)).toBe(false)
    expect(checkReading('utility_electricity', { ...ok, value: 0 }).ok).toBe(true)
  })
  it('unit: one this fuel is read in, never one that would need manual review', () => {
    expect(checkReading('utility_electricity', { ...ok, unit: 'furlongs' })).toEqual({ ok: false, error: 'Choose a unit this fuel is read in.' })
  })
  it('T10b: a period for a bill; a delivery date only for a delivery document type; never both, never neither', () => {
    expect(checkReading('utility_electricity', { ...ok, periodStart: '', periodEnd: '', deliveryDate: '2026-01-15' }).ok).toBe(false)
    expect(checkReading('fuel_propane', { fuelType: 'propane', value: 500, unit: 'litres', deliveryDate: '2026-01-15', sourceQuote: '500 L delivered' }).ok).toBe(true)
    expect(checkReading('fuel_propane', { fuelType: 'propane', value: 500, unit: 'litres', deliveryDate: '2026-01-15', periodStart: '2026-01-01', periodEnd: '2026-01-31', sourceQuote: 'x' }))
      .toEqual({ ok: false, error: 'Enter a billing period or a delivery date, not both.' })
    expect(checkReading('utility_electricity', { ...ok, periodStart: '', periodEnd: '' })).toEqual({ ok: false, error: 'Enter the billing period.' })
    expect(checkReading('utility_electricity', { ...ok, periodStart: '2026-02-01', periodEnd: '2026-01-31' })).toEqual({ ok: false, error: 'The billing period ends before it starts.' })
    expect(checkReading('utility_electricity', { ...ok, periodEnd: '2026-02-30' })).toEqual({ ok: false, error: 'Enter dates as real calendar dates.' })
  })
  it('quote: required, at most 300 characters; notes at most 1000', () => {
    expect(checkReading('utility_electricity', { ...ok, sourceQuote: '  ' })).toEqual({ ok: false, error: 'Copy the figure and its unit exactly as printed on the bill.' })
    expect(checkReading('utility_electricity', { ...ok, sourceQuote: 'x'.repeat(301) }).ok).toBe(false)
    expect(checkReading('utility_electricity', { ...ok, sourceQuote: 'x'.repeat(300) }).ok).toBe(true)
    expect(checkReading('utility_electricity', { ...ok, notes: 'n'.repeat(1001) }).ok).toBe(false)
  })
  it('supersedes: a reading id or nothing', () => {
    expect(checkReading('utility_electricity', { ...ok, supersedes: 'not-an-id' }).ok).toBe(false)
    expect(checkReading('utility_electricity', { ...ok, supersedes: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }).ok).toBe(true)
  })
  it('no field names who read it: that comes from the session', () => {
    const c = checkReading('utility_electricity', { ...ok, read_by: 'someone' } as never)
    expect(c.ok && Object.keys(c.row)).not.toContain('read_by')
  })
})

describe('BR8 queue order: overdue first (Q7), then oldest first', () => {
  const b = (id: string, submitted_at: string, expected_by: string | null) => ({ id, submitted_at, expected_by })
  it('overdue bills lead, each group oldest first; a bill with no date is never overdue', () => {
    const items = [b('new', '2026-10-20T10:00:00Z', '2026-10-22'), b('late-new', '2026-10-14T10:00:00Z', '2026-10-16'),
      b('old', '2026-10-19T09:00:00Z', '2026-10-21'), b('late-old', '2026-10-12T10:00:00Z', '2026-10-14'), b('undated', '2026-10-13T10:00:00Z', null)]
    expect(sortQueue(items, '2026-10-21').map(x => x.id)).toEqual(['late-old', 'late-new', 'undated', 'old', 'new'])
    expect(isOverdue(b('x', '', '2026-10-21'), '2026-10-21')).toBe(false)
    expect(isOverdue(b('x', '', null), '2030-01-01')).toBe(false)
  })
})

describe('BR8 switch words (Q1)', () => {
  it('the design’s sentences, with the count of bills already read by the AI', () => {
    expect(switchSentence('human', 3)).toBe('From now on, bills uploaded to this inventory will be read by a ThemisIQ specialist and will not be sent to the AI. Bills already uploaded keep their reading: 3 bills were already read by the AI.')
    expect(switchSentence('human', 1)).toContain('1 bill was already read by the AI.')
    expect(switchSentence('ai', 0)).toBe('From now on, bills uploaded to this inventory will be read by the AI, and the customer confirms each one. Bills already read by our team keep their reading, and bills still with our team stay with our team.')
  })
})

describe('BR8 follow-up: the switch screen says now, then if you change it', () => {
  it('the lines', () => {
    expect(nowLine('human')).toBe('Now: read by a ThemisIQ specialist.')
    expect(nowLine('ai')).toBe('Now: read by the AI, and the customer confirms each one.')
    expect(nowLine(null)).toBe('Now: read by the AI, and the customer confirms each one.')
    expect(ifChangeLine('ai')).toBe('If you change it to AI reading:')
    expect(ifChangeLine('human')).toBe('If you change it to specialist reading:')
    expect(changeButton('ai')).toBe('Change to AI reading')
    expect(changeButton('human')).toBe('Change to specialist reading')
  })
})

describe('BR8 follow-up: the reading form', () => {
  it('dates start empty, never today; an untouched form cannot be saved', () => {
    const d = blankDraft('electricity')
    expect([d.periodStart, d.periodEnd, d.deliveryDate]).toEqual(['', '', ''])
    expect(draftMissing(d)).toEqual(['the figure', 'the period start', 'the period end', 'the quote'])
    expect(canSave([d])).toBe(false)
    expect(canSave([])).toBe(false)
  })
  it('the dates are required for the mode chosen; complete drafts can be saved, all of them or none', () => {
    const full = { ...blankDraft('electricity'), value: '4210', sourceQuote: 'Total 4,210 kWh', periodStart: '2026-01-01' }
    expect(draftMissing(full)).toEqual(['the period end'])
    const ok = { ...full, periodEnd: '2026-01-31' }
    expect(canSave([ok])).toBe(true)
    const delivery = { ...ok, dates: 'delivery' as const }
    expect(draftMissing(delivery)).toEqual(['the delivery date'])
    expect(canSave([ok, delivery])).toBe(false)
    expect(canSave([ok, { ...delivery, deliveryDate: '2026-02-03' }])).toBe(true)
  })
})
