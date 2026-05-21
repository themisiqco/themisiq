export const runtime = "nodejs"
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { join } from 'path'
import { readFile } from 'fs/promises'

export async function POST(request: NextRequest) {
  try {
    const inv = await request.json()
    const templatePath = join(process.cwd(), 'public', 'SB253_Draft_Scope1_2_GHG_Template.xlsx')
    const templateBuffer = await readFile(templatePath)
    const wb = XLSX.read(templateBuffer, { type: 'buffer' })
    const ws = wb.Sheets['Form']
    const set = (cell: string, value: any) => {
      if (value === null || value === undefined || value === '') return
      ws[cell] = { v: value, t: typeof value === 'number' ? 'n' : 's' }
    }
    const yn = (v: boolean) => v ? 'Yes' : 'No'
    const r4 = (n: number) => Math.round(n * 10000) / 10000
    const s1t = inv.s1_total || 0
    const s1s = inv.s1_stationary || 0
    const s1m = inv.s1_mobile || 0
    const s1p = inv.s1_process || 0
    const s1f = inv.s1_fugitive || 0
    const s2l = inv.s2_location_total || 0
    const s2s = inv.s2_steam || 0
    const s2h = inv.s2_heating || 0
    const s2c = inv.s2_cooling || 0
    const s2k = inv.s2_market_total || 0
    const bio = inv.s1_biogenic || 0
    const rev = inv.revenue_millions || 0
    const yr  = inv.reporting_year || 2024
    set('B2',  'No')
    set('B3',  inv.company_name || '')
    set('B21', yr + '-01-01')
    set('B22', yr + '-12-31')
    set('B23', inv.boundary_approach || 'Operational Control')
    set('B31', yn(s1s > 0))
    set('B32', yn(s1m > 0))
    set('B33', yn(s1p > 0))
    set('B34', yn(s1f > 0))
    set('B35', yn(s2l > 0))
    set('B36', yn(s2h > 0))
    set('B37', yn(s2s > 0))
    set('B38', yn(s2c > 0))
    set('B39', yn(s2k > 0))
    set('B40', 'No'); set('B41', 'No'); set('B42', 'No')
    set('B43', yn(bio > 0)); set('B44', 'No'); set('B45', 'No')
    if (s1t) set('B47', r4(s1t))
    if (s1m) set('B48', r4(s1m))
    if (s1p) set('B49', r4(s1p))
    if (s1f) set('B50', r4(s1f))
    if (rev) set('B51', r4(s1t / rev))
    if (s2l) set('B54', r4(s2l))
    if (rev) set('B58', r4(s2l / rev))
    set('B62', 'US EPA')
    set('B63', String(yr))
    set('B65', 'US EPA eGRID (2023) subregion location-based emission factors')
    set('B66', 'IPCC Fourth Assessment Report (AR4, 2007)')
    set('B67', 'Activity data x emission factor = GHG emissions (mtCO2e)')
    set('B68', 'Standard EPA calculation methodology')
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const name = (inv.company_name || 'Company').replace(/\s+/g, '_')
    const filename = 'CARB_SB253_' + name + '_' + yr + '.xlsx'
    return new NextResponse(out, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Content-Length': out.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('CARB export error:', error)
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}