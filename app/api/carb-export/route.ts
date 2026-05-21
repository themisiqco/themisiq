export const runtime = "nodejs"
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { join } from 'path'
import { readFile } from 'fs/promises'

export async function POST(request: NextRequest) {
  try {
    const { createServerClient } = await import('../../../lib/supabase')
    const supabase = createServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
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
    set('B2',  inv.trade_secret || 'No')
    set('B3',  inv.company_name || '')
    set('B4',  inv.ein || '')
    set('B21', inv.period_start || yr + '-01-01')
    set('B22', inv.period_end || yr + '-12-31')
    set('B23', inv.boundary_approach || 'Operational Control')
    set('B26', inv.entities_list || '')
    set('B27', 'No')
    set('B29', 'No')
    set('B31', yn(s1s > 0))
    set('B32', yn(s1m > 0))
    set('B33', yn(s1p > 0))
    set('B34', yn(s1f > 0))
    set('B35', yn(s2l > 0))
    set('B36', yn(s2h > 0))
    set('B37', yn(s2s > 0))
    set('B38', yn(s2c > 0))
    set('B39', yn(s2k > 0))
    set('B40', 'No')
    set('B41', 'No')
    set('B42', 'No')
    set('B43', yn(bio > 0))
    set('B44', 'No')
    set('B45', 'No')
    if (s1t) set('B47', r4(s1t))
    if (s1m) set('B48', r4(s1m))
    if (s1p) set('B49', r4(s1p))
    if (s1f) set('B50', r4(s1f))
    if (rev) set('B51', r4(s1t / rev))
    if (s2l) set('B54', r4(s2l))
    if (s2s) set('B55', r4(s2s))
    if (s2h) set('B56', r4(s2h))
    if (s2c) set('B57', r4(s2c))
    if (rev) set('B58', r4(s2l / rev))
    if (bio) set('B61', r4(bio))
    set('B62', 'US EPA')
    set('B63', String(yr))
    set('B64', 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories')
    set('B65', 'US EPA eGRID (2023) subregion location-based emission factors')
    set('B66', 'IPCC Fourth Assessment Report (AR4, 2007)')
    set('B67', 'Activity data x emission factor = GHG emissions (mtCO2e)')
    set('B68', 'Standard EPA calculation methodology')
    set('B69', inv.de_minimis_sources || 'None identified')
    set('B70', '0')
    if (inv.s1_co2) set('B98',  r4(inv.s1_co2))
    if (inv.s1_ch4) set('B99',  r4(inv.s1_ch4))
    if (inv.s1_n2o) set('B100', r4(inv.s1_n2o))
    if (inv.s1_hfc) set('B101', r4(inv.s1_hfc))
    if (s2l) { set('B105', r4(s2l * 0.999)); set('B106', r4(s2l * 0.001)) }
    if (s1s) { set('B112', r4(s1s * 0.97)); set('B113', r4(s1s * 0.02)); set('B114', r4(s1s * 0.01)) }
    if (s1m) { set('B118', r4(s1m)); set('B119', r4(s1m * 0.97)); set('B120', r4(s1m * 0.015)); set('B121', r4(s1m * 0.015)) }
    if (s1f) { set('B132', r4(s1f)); set('B136', r4(s1f)) }
    if (s2l) { set('B147', r4(s2l)); set('B148', r4(s2l * 0.999)); set('B149', r4(s2l * 0.001)) }
    if (rev) set('B175', r4(s2l / rev))
    if (bio) set('B176', r4(bio))
    set('B178', 'Good')
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
  } catch (error) {
    console.error('CARB export error:', error)
    return NextResponse.json({ error: 'Failed to generate CARB template' }, { status: 500 })
  }
}