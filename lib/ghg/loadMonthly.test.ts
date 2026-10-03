// lib/ghg/loadMonthly.test.ts
//
// T12: the Trends monthly view loads ONE inventory's slices, so a fiscal-year inventory shows its own
// months and two inventories with slices in the same calendar year are never mixed.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A stand-in for ghg_monthly_emissions: rows carry inventory_id, company_id and reporting_year, and the
// stub applies .eq() filters the way the database would, recording which columns were filtered on.
type Slice = { inventory_id: string; company_id: string; reporting_year: number; period_month: string; scope: number; fuel_type: string; tco2e: number; activity_value: number | null; activity_unit: string | null; period_start?: string | null; period_end?: string | null }
const table: Slice[] = []
const filtered: string[] = []
vi.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }) },
    from: () => {
      const conds: [string, unknown][] = []
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => { conds.push([col, v]); filtered.push(col); return q },
        order: async () => ({ data: table.filter(r => conds.every(([c, v]) => (r as Record<string, unknown>)[c] === v))
          .sort((a, b) => a.period_month.localeCompare(b.period_month)), error: null }),
      }
      return q
    },
  },
}))

import { loadMonthly, isDeliveryRow, DELIVERY_BASED_NOTE } from './loadMonthly'
import { buildMonthlyEmissions } from './monthlyEmissions'
import { calcGas, pickEF, getGridFactor, isResolvedGridRegion, emptyLocation, type Location, type ExtractedProposal } from './engine'

const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion }
const bill = (start: string, end: string): ExtractedProposal => ({ fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf',
  periodStart: start, periodEnd: end, confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed' })
const months = (from: [number, number], n: number) => Array.from({ length: n }, (_, k) => {
  const d = new Date(from[0], from[1] - 1 + k, 1)
  const y = d.getFullYear(), m = d.getMonth() + 1
  return bill(`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`)
})
const site = (bills: ExtractedProposal[]): Location => ({ ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_unit: 'mcf',
  source_docs: bills.map((p, i) => ({ id: `d${i}`, file_name: `d${i}.pdf`, document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: `/d${i}.pdf`, extracted: [p] })) })
// Write an inventory's slices the way the save does (page.tsx maps each slice with its inventory_id).
const save = (inventoryId: string, reporting_year: number, fiscal_year_end_month: number, bills: ExtractedProposal[]) => {
  for (const s of buildMonthlyEmissions({ locations: [site(bills)], reporting_year, fiscal_year_end_month }, deps, 'AR6').slices) {
    table.push({ inventory_id: inventoryId, company_id: 'C1', reporting_year: s.reporting_year, period_month: s.period_month,
      scope: s.scope, fuel_type: s.fuel_type, tco2e: s.tco2e, activity_value: s.activity_value, activity_unit: s.activity_unit })
  }
}

beforeEach(() => { table.length = 0; filtered.length = 0 })

describe('Trends monthly view, by inventory (T12)', () => {
  it('filters on the inventory only, not on company and calendar year', async () => {
    save('inv-2025', 2025, 12, months([2025, 1], 3))
    const r = await loadMonthly('inv-2025')
    expect(filtered).toEqual(['inventory_id'])
    expect(r.buckets.map(b => b.month)).toEqual(['2025-01', '2025-02', '2025-03'])
  })

  it('a year ending in March shows April to March, in that order, not the calendar year', async () => {
    // Bills from January 2024 to June 2025: the year ending 31 March 2025 keeps April 2024 to March 2025.
    save('inv-fy25', 2025, 3, months([2024, 1], 18))
    const r = await loadMonthly('inv-fy25')
    expect(r.buckets.map(b => b.month)).toEqual([
      '2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03'])
    expect(r.buckets.map(b => b.monthLabel)).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'])
    expect(r.measuredMonths).toBe(12)
  })

  it('two inventories with slices in the same calendar year are not mixed', async () => {
    // Same company, both with months in calendar 2025: the year ending March 2025 and calendar 2025.
    save('inv-fy25', 2025, 3, months([2024, 4], 12))
    save('inv-cal25', 2025, 12, months([2025, 1], 12))
    const fy = await loadMonthly('inv-fy25')
    const cal = await loadMonthly('inv-cal25')
    expect(fy.buckets.map(b => b.month)).toEqual(months([2024, 4], 12).map(p => p.periodStart!.slice(0, 7)))
    expect(cal.buckets.map(b => b.month)).toEqual(months([2025, 1], 12).map(p => p.periodStart!.slice(0, 7)))
    // January to March 2025 belong to both inventories' windows; each shows only its own figure.
    const janFy = fy.buckets.find(b => b.month === '2025-01')!.total
    const janCal = cal.buckets.find(b => b.month === '2025-01')!.total
    expect(janFy, 'one bill each, so each inventory shows one bill\'s January, not both added together').toBe(janCal)
    expect(cal.totalTco2e).toBeCloseTo(fy.totalTco2e, 4)
  })

  it('the Trends page passes the selected year\'s inventory, and the series carries it', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/trends/page.tsx'), 'utf8')
    expect(page).toContain('const selectedInventoryId = selectedSeries?.years.find((y) => y.year === selectedYear)?.inventoryId ?? null')
    expect(page).toContain('loadMonthly(selectedInventoryId)')
    const series = readFileSync(join(process.cwd(), 'lib/ghg/series.ts'), 'utf8')
    expect((series.match(/inventoryId: r\.inventory_id \?\? null,/g) ?? []).length, 'both kinds of year carry it').toBe(2)
    const load = readFileSync(join(process.cwd(), 'lib/ghg/loadSeries.ts'), 'utf8')
    expect(load).toContain('"id, company_id, company_name, reporting_year, ')
    expect(load).toContain('inventory_id: r.id,')
  })
})

describe('delivery-based months (T10b)', () => {
  const row = (fuel_type: string, period_start: string, period_end: string): Slice => ({ inventory_id: 'inv-d', company_id: 'C1', reporting_year: 2025,
    period_month: `${period_start.slice(0, 7)}-01`, scope: 1, fuel_type, tco2e: 0.27, activity_value: 177.143, activity_unit: 'litres', period_start, period_end })
  it('a propane, diesel or petrol row with one date is a delivery; a gas or electricity bill never is', () => {
    expect(isDeliveryRow(row('propane', '2025-03-14', '2025-03-14'))).toBe(true)
    expect(isDeliveryRow(row('diesel', '2025-03-01', '2025-03-31')), 'a statement').toBe(false)
    expect(isDeliveryRow(row('natural_gas', '2025-03-01', '2025-03-01')), 'a one-day gas bill').toBe(false)
  })
  it('the monthly view flags a year that holds deliveries, so the chart can say how they are counted', async () => {
    table.push(row('propane', '2025-03-14', '2025-03-14'))
    expect((await loadMonthly('inv-d')).deliveryBased).toBe(true)
    table.length = 0
    table.push(row('natural_gas', '2025-03-01', '2025-03-31'))
    expect((await loadMonthly('inv-d')).deliveryBased).toBe(false)
    expect(DELIVERY_BASED_NOTE).toBe('Delivery-based: fuel bought by delivery is counted in the month it was delivered, not the month it was used.')
  })
})
