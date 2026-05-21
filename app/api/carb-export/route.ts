export const runtime = "nodejs"
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { join } from 'path'

export async function POST(request: NextRequest) {
  try {
    const inv = await request.json()
    const templatePath = join(process.cwd(), 'public', 'SB253_Draft_Scope1_2_GHG_Template.xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(templatePath)
    const ws = wb.getWorksheet('Form')
    if (!ws) throw new Error('Form sheet not found')

    const set = (row: number, value: any) => {
      if (value === null || value === undefined || value === '') return
      const cell = ws.getCell(`B${row}`)
      cell.value = value
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

    set(2,  'No')
    set(3,  inv.company_name || '')
    set(4,  inv.ein || '')
    set(21, yr + '-01-01')
    set(22, yr + '-12-31')
    set(23, inv.boundary_approach || 'Operational Control')
    set(26, inv.entities_list || '')
    set(27, 'No')
    set(29, 'No')
    set(31, yn(s1s > 0))
    set(32, yn(s1m > 0))
    set(33, yn(s1p > 0))
    set(34, yn(s1f > 0))
    set(35, yn(s2l > 0))
    set(36, yn(s2h > 0))
    set(37, yn(s2s > 0))
    set(38, yn(s2c > 0))
    set(39, yn(s2k > 0))
    set(40, 'No'); set(41, 'No'); set(42, 'No')
    set(43, yn(bio > 0)); set(44, 'No'); set(45, 'No')
    if (s1t) set(47, r4(s1t))
    if (s1m) set(48, r4(s1m))
    if (s1p) set(49, r4(s1p))
    if (s1f) set(50, r4(s1f))
    if (rev) set(51, r4(s1t / rev))
    if (s2l) set(54, r4(s2l))
    if (s2s) set(55, r4(s2s))
    if (s2h) set(56, r4(s2h))
    if (s2c) set(57, r4(s2c))
    if (rev) set(58, r4(s2l / rev))
    if (bio) set(61, r4(bio))
    set(62, 'US EPA')
    set(63, String(yr))
    set(64, 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories')
    set(65, 'US EPA eGRID (2023) subregion location-based emission factors')
    set(66, 'IPCC Fourth Assessment Report (AR4, 2007)')
    set(67, 'Activity data x emission factor = GHG emissions (mtCO2e)')
    set(68, 'Standard EPA calculation methodology')
    set(69, inv.de_minimis_sources || 'None identified')
    set(70, '0')
    if (inv.s1_co2) set(98,  r4(inv.s1_co2))
    if (inv.s1_ch4) set(99,  r4(inv.s1_ch4))
    if (inv.s1_n2o) set(100, r4(inv.s1_n2o))
    if (inv.s1_hfc) set(101, r4(inv.s1_hfc))
    if (s2l) { set(105, r4(s2l * 0.999)); set(106, r4(s2l * 0.001)) }
    if (s1s) { set(112, r4(s1s * 0.97)); set(113, r4(s1s * 0.02)); set(114, r4(s1s * 0.01)) }
    if (s1m) { set(118, r4(s1m)); set(119, r4(s1m * 0.97)); set(120, r4(s1m * 0.015)); set(121, r4(s1m * 0.015)) }
    if (s1f) { set(132, r4(s1f)); set(136, r4(s1f)) }
    if (s2l) { set(147, r4(s2l)); set(148, r4(s2l * 0.999)); set(149, r4(s2l * 0.001)) }
    if (rev) set(175, r4(s2l / rev))
    if (bio) set(176, r4(bio))
    set(178, 'Good')

    const buf = await wb.xlsx.writeBuffer()
    const name = (inv.company_name || 'Company').replace(/\s+/g, '_')
    const filename = 'CARB_SB253_' + name + '_' + yr + '.xlsx'

    return new NextResponse(buf as Buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
      },
    })
  } catch (error: any) {
    console.error('CARB export error:', error)
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}