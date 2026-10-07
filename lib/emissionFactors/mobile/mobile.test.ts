import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { MobileGasRow, MobilePublisher } from './types'
import { selectMobileRow, highestRow, R16_RANKING_GWP } from './select'
import { EPA_MOBILE_2025 } from './epa2025'
import { ECCC_MOBILE_2025 } from './eccc2025'
import { DEFRA_MOBILE_2026 } from './defra2026'
import { NGA_MOBILE_2025, NGA_MOBILE_ENERGY_CONTENT_2025 } from './nga2025'
import { MFE_MOBILE_2026 } from './mfe2026'
import { IPCC_MOBILE_2006 } from './ipcc2006'

// ── FI9 DIFF 1: EVERY TRANSCRIBED MOBILE FACTOR, AGAINST ITS CITATION ────────────────────────────────
//
// THE EXPECTED VALUES ARE HARD-CODED HERE, NOT READ FROM THE SOURCES. The workbooks and PDFs are in
// ~/themisiq-sources, which the build machine does not have (FI6a's reason, the same here). The EPA list below was
// read cell by cell out of ghg-emission-factors-hub-2025.xlsx on 7 Oct 2026, separately from the data file; every
// other value is typed from the document and page named beside it.

const ALL: MobilePublisher[] = [EPA_MOBILE_2025, ECCC_MOBILE_2025, DEFRA_MOBILE_2026, NGA_MOBILE_2025, MFE_MOBILE_2026, IPCC_MOBILE_2006]

// EPA Hub 2025, sheet "Emission Factors Hub": [CH4 cell, CH4, N2O cell, N2O]. Table 3 rows 127 to 238 (gasoline on-road,
// g/vehicle-mile; motorcycles 239 to 241 not an R16 type), Table 4 rows 249 to 256 (diesel on-road, g/vehicle-mile),
// Table 5 rows 297 to 328 (non-road equipment, g/gallon; Ships and Boats, Locomotives and Aircraft not R16 types).
const EPA_EXPECTED: [string, number, string, number][] = [
  ['E127', 0.1696, 'F127', 0.0197],
  ['E128', 0.1423, 'F128', 0.0443],
  ['E129', 0.1406, 'F129', 0.0458],
  ['E130', 0.1389, 'F130', 0.0473],
  ['E131', 0.1326, 'F131', 0.0499],
  ['E132', 0.0802, 'F132', 0.0626],
  ['E133', 0.0795, 'F133', 0.0627],
  ['E134', 0.0782, 'F134', 0.063],
  ['E135', 0.0704, 'F135', 0.0647],
  ['E136', 0.0617, 'F136', 0.0603],
  ['E137', 0.0531, 'F137', 0.056],
  ['E138', 0.0434, 'F138', 0.0503],
  ['E139', 0.0337, 'F139', 0.0446],
  ['E140', 0.024, 'F140', 0.0389],
  ['E141', 0.0215, 'F141', 0.0355],
  ['E142', 0.0175, 'F142', 0.0304],
  ['E143', 0.0105, 'F143', 0.0212],
  ['E144', 0.0102, 'F144', 0.0207],
  ['E145', 0.0095, 'F145', 0.0181],
  ['E146', 0.0078, 'F146', 0.0085],
  ['E147', 0.0075, 'F147', 0.0067],
  ['E148', 0.0076, 'F148', 0.0075],
  ['E149', 0.0072, 'F149', 0.0052],
  ['E150', 0.0072, 'F150', 0.0049],
  ['E151', 0.0071, 'F151', 0.0046],
  ['E152', 0.0071, 'F152', 0.0046],
  ['E153', 0.0071, 'F153', 0.0046],
  ['E154', 0.0071, 'F154', 0.0046],
  ['E155', 0.0071, 'F155', 0.0046],
  ['E156', 0.0071, 'F156', 0.0046],
  ['E157', 0.0068, 'F157', 0.0042],
  ['E158', 0.0065, 'F158', 0.0038],
  ['E159', 0.0054, 'F159', 0.0018],
  ['E160', 0.0052, 'F160', 0.0016],
  ['E161', 0.0051, 'F161', 0.0015],
  ['E162', 0.005, 'F162', 0.0014],
  ['E163', 0.0051, 'F163', 0.0014],
  ['E164', 0.005, 'F164', 0.0014],
  ['E165', 0.1908, 'F165', 0.0218],
  ['E166', 0.1634, 'F166', 0.0513],
  ['E167', 0.1594, 'F167', 0.0555],
  ['E168', 0.1614, 'F168', 0.0534],
  ['E169', 0.1594, 'F169', 0.0555],
  ['E170', 0.1479, 'F170', 0.066],
  ['E171', 0.1442, 'F171', 0.0681],
  ['E172', 0.1368, 'F172', 0.0722],
  ['E173', 0.1294, 'F173', 0.0764],
  ['E174', 0.122, 'F174', 0.0806],
  ['E175', 0.1146, 'F175', 0.0848],
  ['E176', 0.0813, 'F176', 0.1035],
  ['E177', 0.0646, 'F177', 0.0982],
  ['E178', 0.0517, 'F178', 0.0908],
  ['E179', 0.0452, 'F179', 0.0871],
  ['E180', 0.0452, 'F180', 0.0871],
  ['E181', 0.0412, 'F181', 0.0787],
  ['E182', 0.0333, 'F182', 0.0618],
  ['E183', 0.034, 'F183', 0.0631],
  ['E184', 0.0221, 'F184', 0.0379],
  ['E185', 0.0242, 'F185', 0.0424],
  ['E186', 0.0221, 'F186', 0.0373],
  ['E187', 0.0115, 'F187', 0.0088],
  ['E188', 0.0105, 'F188', 0.0064],
  ['E189', 0.0108, 'F189', 0.008],
  ['E190', 0.0103, 'F190', 0.0061],
  ['E191', 0.0095, 'F191', 0.0036],
  ['E192', 0.0095, 'F192', 0.0036],
  ['E193', 0.0095, 'F193', 0.0035],
  ['E194', 0.0096, 'F194', 0.0034],
  ['E195', 0.0096, 'F195', 0.0033],
  ['E196', 0.0095, 'F196', 0.0035],
  ['E197', 0.0095, 'F197', 0.0033],
  ['E198', 0.0094, 'F198', 0.0031],
  ['E199', 0.0091, 'F199', 0.0029],
  ['E200', 0.0084, 'F200', 0.0018],
  ['E201', 0.0081, 'F201', 0.0015],
  ['E202', 0.008, 'F202', 0.0013],
  ['E203', 0.0079, 'F203', 0.0012],
  ['E204', 0.0079, 'F204', 0.0012],
  ['E205', 0.0079, 'F205', 0.0012],
  ['E206', 0.4604, 'F206', 0.0497],
  ['E207', 0.4492, 'F207', 0.0538],
  ['E208', 0.409, 'F208', 0.0515],
  ['E209', 0.3675, 'F209', 0.0849],
  ['E210', 0.3492, 'F210', 0.0933],
  ['E211', 0.3246, 'F211', 0.1142],
  ['E212', 0.1278, 'F212', 0.168],
  ['E213', 0.0924, 'F213', 0.1726],
  ['E214', 0.0655, 'F214', 0.175],
  ['E215', 0.0648, 'F215', 0.1724],
  ['E216', 0.063, 'F216', 0.166],
  ['E217', 0.0577, 'F217', 0.1468],
  ['E218', 0.0634, 'F218', 0.1673],
  ['E219', 0.0602, 'F219', 0.1553],
  ['E220', 0.0298, 'F220', 0.0164],
  ['E221', 0.0297, 'F221', 0.0083],
  ['E222', 0.0299, 'F222', 0.0241],
  ['E223', 0.0322, 'F223', 0.0015],
  ['E224', 0.034, 'F224', 0.0015],
  ['E225', 0.0339, 'F225', 0.0015],
  ['E226', 0.032, 'F226', 0.0015],
  ['E227', 0.0304, 'F227', 0.0015],
  ['E228', 0.0313, 'F228', 0.0015],
  ['E229', 0.0313, 'F229', 0.0015],
  ['E230', 0.0315, 'F230', 0.0015],
  ['E231', 0.0332, 'F231', 0.0021],
  ['E232', 0.0321, 'F232', 0.0061],
  ['E233', 0.0329, 'F233', 0.0084],
  ['E234', 0.0326, 'F234', 0.0082],
  ['E235', 0.033, 'F235', 0.0091],
  ['E236', 0.0332, 'F236', 0.01],
  ['E237', 0.0332, 'F237', 0.01],
  ['E238', 0.0332, 'F238', 0.01],
  ['F249', 0.0006, 'G249', 0.0012],
  ['F250', 0.0005, 'G250', 0.001],
  ['F251', 0.0302, 'G251', 0.0192],
  ['F252', 0.0011, 'G252', 0.0017],
  ['F253', 0.0009, 'G253', 0.0014],
  ['F254', 0.029, 'G254', 0.0214],
  ['F255', 0.0051, 'G255', 0.0048],
  ['F256', 0.0095, 'G256', 0.0431],
  ['E297', 6.9, 'F297', 0.47],
  ['E298', 1.93, 'F298', 1.2],
  ['E299', 1.93, 'F299', 1.2],
  ['E300', 1.26, 'F300', 1.07],
  ['E301', 0.92, 'F301', 0.56],
  ['E303', 8, 'F303', 0.12],
  ['E304', 2.86, 'F304', 1.48],
  ['E305', 2.86, 'F305', 1.48],
  ['E306', 1.01, 'F306', 0.94],
  ['E307', 0.92, 'F307', 0.56],
  ['E309', 7.34, 'F309', 0.31],
  ['E310', 3.02, 'F310', 1.5],
  ['E311', 0.67, 'F311', 0.49],
  ['E313', 1.07, 'F313', 1.12],
  ['E314', 1.98, 'F314', 1.21],
  ['E316', 7.3, 'F316', 0.51],
  ['E317', 2.81, 'F317', 1.57],
  ['E318', 0.43, 'F318', 0.62],
  ['E320', 9.62, 'F320', 0],
  ['E321', 3.22, 'F321', 2.05],
  ['E322', 0.49, 'F322', 1.26],
  ['E323', 3.32, 'F323', 1.86],
  ['E324', 0.41, 'F324', 0.97],
  ['E326', 9.86, 'F326', 0.11],
  ['E327', 2.74, 'F327', 1.49],
  ['E328', 0.73, 'F328', 0.66],
]

describe('FI9: mobile combustion factors as published', () => {
  it('EPA: every CH4 and N2O row, by cell', () => {
    expect(EPA_MOBILE_2025.rows).toHaveLength(EPA_EXPECTED.length)
    EPA_EXPECTED.forEach(([ch4Cell, ch4, n2oCell, n2o], i) => {
      const r = EPA_MOBILE_2025.rows[i]
      expect([r.ch4, r.n2o], ch4Cell).toEqual([ch4, n2o])
      expect(r.cite.cell, ch4Cell).toContain(`Emission Factors Hub!${ch4Cell}, Emission Factors Hub!${n2oCell}`)
    })
    // Table 2 (p. 2): Diesel Fuel 10.21, Motor Gasoline 8.78 kg CO2 per gallon.
    expect(EPA_MOBILE_2025.co2.map(c => [c.fuel, c.value, c.unit, c.cite.cell])).toEqual([
      ['diesel', 10.21, 'kg CO2/gallon', 'Emission Factors Hub!D107'], ['petrol', 8.78, 'kg CO2/gallon', 'Emission Factors Hub!D112']])
  })

  it('ECCC NIR 2025 Table A6.1-15 (p. 253, g/L): every row', () => {
    const want: [string, string, number, number][] = [
      ['Light-duty Gasoline Vehicles (LDGVs)', 'Tier 3', 0.111, 0.007], ['Light-duty Gasoline Vehicles (LDGVs)', 'Tier 2', 0.14, 0.022],
      ['Light-duty Gasoline Vehicles (LDGVs)', 'Tier 1', 0.23, 0.47], ['Light-duty Gasoline Vehicles (LDGVs)', 'Tier 0', 0.32, 0.66],
      ['Light-duty Gasoline Vehicles (LDGVs)', 'Oxidation Catalyst', 0.52, 0.20], ['Light-duty Gasoline Vehicles (LDGVs)', 'Non-catalytic Controlled', 0.46, 0.028],
      ['Light-duty Gasoline Trucks (LDGTs)', 'Tier 3', 0.111, 0.007], ['Light-duty Gasoline Trucks (LDGTs)', 'Tier 2', 0.14, 0.022],
      ['Light-duty Gasoline Trucks (LDGTs)', 'Tier 1', 0.24, 0.58], ['Light-duty Gasoline Trucks (LDGTs)', 'Tier 0', 0.21, 0.66],
      ['Light-duty Gasoline Trucks (LDGTs)', 'Oxidation Catalyst', 0.43, 0.20], ['Light-duty Gasoline Trucks (LDGTs)', 'Non-catalytic Controlled', 0.56, 0.028],
      ['Heavy-duty Gasoline Vehicles (HDGVs)', 'Three-way Catalyst', 0.068, 0.20], ['Heavy-duty Gasoline Vehicles (HDGVs)', 'Non-catalytic Controlled', 0.29, 0.047],
      ['Heavy-duty Gasoline Vehicles (HDGVs)', 'Uncontrolled', 0.49, 0.084],
      ['Light-duty Diesel Vehicles (LDDVs)', 'Advanced Control', 0.051, 0.22], ['Light-duty Diesel Vehicles (LDDVs)', 'Moderate Control', 0.068, 0.21],
      ['Light-duty Diesel Vehicles (LDDVs)', 'Uncontrolled', 0.10, 0.16],
      ['Light-duty Diesel Trucks (LDDTs)', 'Advanced Control', 0.068, 0.22], ['Light-duty Diesel Trucks (LDDTs)', 'Moderate Control', 0.068, 0.21],
      ['Light-duty Diesel Trucks (LDDTs)', 'Uncontrolled', 0.085, 0.16],
      ['Heavy-duty Diesel Vehicles (HDDVs)', 'Advanced Control', 0.11, 0.151], ['Heavy-duty Diesel Vehicles (HDDVs)', 'Moderate Control', 0.14, 0.082],
      ['Heavy-duty Diesel Vehicles (HDDVs)', 'Uncontrolled', 0.15, 0.075],
      ['Off-road Gasoline', '2-stroke', 10.56, 0.013], ['Off-road Gasoline', '4-stroke', 5.08, 0.064],
      ['Off-road Diesel', '< 19kW', 0.073, 0.022], ['Off-road Diesel', '\u2265 19kW, Tier 1 - 3', 0.073, 0.022],
      ['Off-road Diesel', '\u2265 19kW, Tier 4', 0.073, 0.227],
    ]
    expect(ECCC_MOBILE_2025.rows.map(r => [r.vehicle, r.detail, r.ch4, r.n2o])).toEqual(want)
    expect(ECCC_MOBILE_2025.rows.every(r => r.cite.page === '253' && r.unit === 'g/L')).toBe(true)
    expect(ECCC_MOBILE_2025.co2.map(c => [c.fuel, c.value])).toEqual([['diesel', 2680.50], ['petrol', 2307.3]])
  })

  it('DEFRA 2026 Fuels sheet: diesel and petrol (average biofuel blend), one row for all three types', () => {
    // Fuels!E72/F72/G72 and E96/F96/G96, kg CO2e per litre.
    expect(DEFRA_MOBILE_2026.co2.map(c => [c.fuel, c.value, c.cite.cell])).toEqual([['diesel', 2.55035, 'Fuels!E72'], ['petrol', 2.06107, 'Fuels!E96']])
    for (const t of ['light', 'heavy', 'non_road'] as const) {
      const d = DEFRA_MOBILE_2026.rows.find(r => r.type === t && r.fuel === 'diesel')!
      const p = DEFRA_MOBILE_2026.rows.find(r => r.type === t && r.fuel === 'petrol')!
      expect([d.ch4, d.n2o, d.cite.cell, d.gas], t).toEqual([0.00029, 0.0329, 'Fuels!F72, Fuels!G72', 'co2e_ar5'])
      expect([p.ch4, p.n2o, p.cite.cell], t).toEqual([0.00806, 0.00587, 'Fuels!F96, Fuels!G96'])
    }
    // The parts add to DEFRA's printed totals (Fuels!D72 2.58354, D96 2.075), which EF_UK carries.
    expect(2.55035 + 0.00029 + 0.0329).toBeCloseTo(2.58354, 9)
    expect(2.06107 + 0.00806 + 0.00587).toBeCloseTo(2.075, 9)
  })

  it('NGA 2025 Table 9 (pp. 26 to 27) and the pre-2004 note (p. 28), kg CO2-e/GJ', () => {
    expect(NGA_MOBILE_2025.rows.map(r => [r.type, r.fuel, r.detail, r.ch4, r.n2o, r.cite.page])).toEqual([
      ['light', 'petrol', 'manufactured 2004 or later', 0.02, 0.2, '26'], ['light', 'petrol', 'manufactured prior to 2004', 0.6, 1.6, '28'],
      ['light', 'diesel', 'manufactured 2004 or later', 0.01, 0.5, '26'], ['light', 'diesel', 'manufactured prior to 2004', 0.1, 0.4, '28'],
      ['heavy', 'diesel', 'Euro iv or higher', 0.07, 0.4, '27'], ['heavy', 'diesel', 'Euro iii', 0.1, 0.4, '27'],
      ['heavy', 'diesel', 'Euro i', 0.2, 0.4, '27'],
      // FI9 diff 1b: heavy petrol from the NGER Determination, Schedule 1 Part 4 (items 53, p. 407, and 64, p. 409).
      ['heavy', 'petrol', 'Division 4.1 (any vehicle; manufactured 2004 or earlier)', 0.6, 1.6, '407'],
      ['heavy', 'petrol', 'Division 4.2 (manufactured after 2004)', 0.02, 0.2, '409'],
      // FI9 diff 1b: non-road is stationary energy under Determination s 2.41(2), so NGA Table 8 (p. 23).
      ['non_road', 'petrol', null, 0.2, 0.2, '23'],
      ['non_road', 'diesel', null, 0.1, 0.2, '23'],
    ])
    expect(NGA_MOBILE_2025.rows.filter(r => r.type === 'non_road').map(r => r.cite.cell)).toEqual(["'Table 8'!D9, E9", "'Table 8'!D14, E14"])
    for (const r of NGA_MOBILE_2025.rows.filter(x => x.type === 'non_road')) expect(r.cite.basis).toContain('registered for road use')
    for (const r of NGA_MOBILE_2025.rows.filter(x => x.type === 'heavy' && x.fuel === 'petrol')) {
      expect(r.cite.document).toContain('Compilation No. 21 (compilation date 1 July 2026)')
    }
    expect(NGA_MOBILE_2025.co2.map(c => [c.fuel, c.value])).toEqual([['petrol', 67.4], ['diesel', 69.9]])
    expect([NGA_MOBILE_ENERGY_CONTENT_2025.petrol.value, NGA_MOBILE_ENERGY_CONTENT_2025.diesel.value]).toEqual([34.2, 38.6])
    expect(NGA_MOBILE_2025.absent).toEqual([])
  })

  it('MfE 2026 v2 Transport Fuel (data!J1438 to J1461), kg CO2-e/litre, no vehicle split', () => {
    expect(MFE_MOBILE_2026.co2.map(c => [c.fuel, c.value, c.cite.cell])).toEqual([['diesel', 2.63045, 'data!J1439'], ['petrol', 2.2619, 'data!J1459']])
    expect(MFE_MOBILE_2026.rows.map(r => [r.type, r.fuel, r.ch4, r.n2o, r.cite.cell])).toEqual([
      ['light', 'diesel', 0.00394905, 0.0373749, 'data!J1438, data!J1440'], ['heavy', 'diesel', 0.00394905, 0.0373749, 'data!J1438, data!J1440'],
      ['light', 'petrol', 0.0302118, 0.0693172, 'data!J1458, data!J1460'], ['heavy', 'petrol', 0.0302118, 0.0693172, 'data!J1458, data!J1460'],
      // FI9 diff 1b: non-road from the same rows, classified by the 2024 guide (section 3.3, p. 29).
      ['non_road', 'diesel', 0.00394905, 0.0373749, 'data!J1438, data!J1440'], ['non_road', 'petrol', 0.0302118, 0.0693172, 'data!J1458, data!J1460'],
    ])
    for (const r of MFE_MOBILE_2026.rows) {
      expect(r.cite.basis).toContain('2024 detailed guide (ME1829)')
      expect(r.cite.basis).toContain('Transport fuels are used in an engine to move a vehicle')
      expect(r.cite.basis).toContain('Factor: the 2026 v2 workbook')
    }
    // The parts add to MfE's printed totals: Diesel 2.67177 (J1441), Regular Petrol 2.36143 (J1461).
    expect(2.63045 + 0.00394905 + 0.0373749).toBeCloseTo(2.67177, 5)
    expect(2.2619 + 0.0302118 + 0.0693172).toBeCloseTo(2.36143, 5)
    expect(MFE_MOBILE_2026.absent).toEqual([])
  })

  it('IPCC 2006 Vol. 2 Ch. 3: Tables 3.2.1 (p. 3.16), 3.2.2 (p. 3.21) and 3.3.1 (p. 3.36), kg/TJ', () => {
    expect(IPCC_MOBILE_2006.co2.map(c => [c.fuel, c.value, c.cite.page])).toEqual([['diesel', 74100, '3.16'], ['petrol', 69300, '3.16']])
    const light = IPCC_MOBILE_2006.rows.filter(r => r.type === 'light').map(r => [r.vehicle, r.ch4, r.n2o])
    expect(light).toEqual([
      ['Motor Gasoline - Uncontrolled', 33, 3.2], ['Motor Gasoline - Oxidation Catalyst', 25, 8.0],
      ['Motor Gasoline - Low Mileage Light Duty Vehicle Vintage 1995 or Later', 3.8, 5.7], ['Gas / Diesel Oil', 3.9, 3.9]])
    // The vintage row names light duty vehicles, so Heavy has the other three (FI9 diff 1b).
    expect(IPCC_MOBILE_2006.rows.filter(r => r.type === 'heavy').map(r => [r.vehicle, r.ch4, r.n2o])).toEqual(light.filter(x => !String(x[0]).includes('Light Duty')))
    expect(IPCC_MOBILE_2006.rows.filter(r => r.type === 'non_road').map(r => [r.vehicle, r.detail, r.ch4, r.n2o])).toEqual([
      ['Diesel', 'Agriculture', 4.15, 28.6], ['Diesel', 'Forestry', 4.15, 28.6], ['Diesel', 'Industry', 4.15, 28.6], ['Diesel', 'Household', 4.15, 28.6],
      ['Motor Gasoline 4-stroke', 'Agriculture', 80, 2], ['Motor Gasoline 4-stroke', 'Industry', 50, 2], ['Motor Gasoline 4-stroke', 'Household', 120, 2],
      ['Motor Gasoline 2-Stroke', 'Agriculture', 140, 0.4], ['Motor Gasoline 2-Stroke', 'Forestry', 170, 0.4],
      ['Motor Gasoline 2-Stroke', 'Industry', 130, 0.4], ['Motor Gasoline 2-Stroke', 'Household', 180, 0.4],
    ])
    // The 4-stroke Forestry cell is blank in the source and stays absent.
    expect(IPCC_MOBILE_2006.rows.some(r => r.vehicle === 'Motor Gasoline 4-stroke' && r.detail === 'Forestry')).toBe(false)
  })
})

describe('FI9: shape and R16 selection (refined 7 Oct 2026)', () => {
  const sel = selectMobileRow
  const row = (r: ReturnType<typeof selectMobileRow>) => r ? `${r.row.vehicle} | ${r.row.detail ?? ''}` : null

  it('every row and every CO2 figure carries a table, a row and a page or a cell', () => {
    for (const p of ALL) {
      for (const r of [...p.rows.map(x => x.cite), ...p.co2.map(x => x.cite)]) {
        expect(r.table, p.publisher).toBeTruthy()
        expect(r.row, p.publisher).toBeTruthy()
        expect(Boolean(r.page || r.cell), `${p.publisher} ${r.row}`).toBe(true)
      }
      expect(p.edition).toBeTruthy()
    }
  })

  it('after FI9 diff 1b no publisher has a type and fuel with no row, so nothing is blocked and nothing needs the fallback', () => {
    for (const p of ALL) {
      expect(p.absent, p.publisher).toEqual([])
      for (const type of ['light', 'heavy', 'non_road'] as const) for (const fuel of ['diesel', 'petrol'] as const) {
        const s = sel(p, { type, fuel, ...(type === 'non_road' ? { equipmentType: 'industrial_commercial' as const } : {}) })
        expect(s, `${p.publisher} ${type} ${fuel}`).not.toBeNull()
        expect(s!.fallback, `${p.publisher} ${type} ${fuel}`).toBe(false)
      }
    }
  })

  it('ranks on CO2-e at AR5, fixed', () => {
    expect(R16_RANKING_GWP).toEqual({ ch4: 28, n2o: 265 })
    // US heavy petrol: 1997 (0.0924, 0.1726) over 1998 (0.0655, 0.175) at AR5; AR4 would have picked 1998.
    expect(row(sel(EPA_MOBILE_2025, { type: 'heavy', fuel: 'petrol' }))).toBe('Gasoline Heavy-Duty Vehicles | Model year 1997')
    // IPCC road petrol: Oxidation Catalyst (25, 8.0) over Uncontrolled (33, 3.2) in CO2-e, though not by mass.
    expect(row(sel(IPCC_MOBILE_2006, { type: 'light', fuel: 'petrol' }))).toBe('Motor Gasoline - Oxidation Catalyst | ')
    const a: MobileGasRow = { ...IPCC_MOBILE_2006.rows[0], ch4: 1, n2o: 1 }
    expect(highestRow([a, { ...a, ch4: 1 }])).toBe(a)   // a tie goes to the first row
  })

  it('US EPA: model-year picks, the no-year pick, and each equipment type', () => {
    expect(sel(EPA_MOBILE_2025, { type: 'light', fuel: 'petrol' })!.reason)
      .toBe('Model year not given, so the highest published row for light vehicles is used.')
    expect(row(sel(EPA_MOBILE_2025, { type: 'light', fuel: 'petrol' }))).toBe('Gasoline Light-Duty Trucks | Model year 1987-1993')
    // 2015 ties a car row and a truck row; the car row is higher in CO2-e.
    const y2015 = sel(EPA_MOBILE_2025, { type: 'light', fuel: 'petrol', modelYear: 2015 })!
    expect(row(y2015)).toBe('Gasoline Passenger Cars | Model year 2015')
    expect(y2015.reason).toBe('Typical model year 2015: US EPA ties 2 rows to it, so the highest of them is used.')
    expect(row(sel(EPA_MOBILE_2025, { type: 'heavy', fuel: 'diesel', modelYear: 2000 }))).toBe('Medium- and Heavy-Duty Vehicles | Model year 1960-2006')
    expect(row(sel(EPA_MOBILE_2025, { type: 'heavy', fuel: 'petrol', modelYear: 1979 }))).toBe('Gasoline Heavy-Duty Vehicles | Model year \u22641980')
    // Table 3's last row is 2022: a later year takes the latest row and says so (R16, Lisa, 7 Oct 2026).
    const y2024 = sel(EPA_MOBILE_2025, { type: 'light', fuel: 'petrol', modelYear: 2024 })!
    expect(y2024.reason).toBe('Model year 2024 is after the latest published row (2022), so the 2022 row is used.')
    expect(y2024.row.detail).toBe('Model year 2022')
    // Diesel's latest rows are a range: the range is named.
    const d2024 = sel(EPA_MOBILE_2025, { type: 'light', fuel: 'diesel', modelYear: 2024 })!
    expect(row(d2024)).toBe('Light-Duty Trucks | Model year 2007-2022')
    expect(d2024.reason).toBe('Model year 2024 is after the latest published row (2007-2022), so the 2007-2022 row is used.')
    // A year inside the range that no row ties still takes the highest (ECCC light 2000, below).
    const eq: [string, string, string][] = [
      ['industrial_commercial', 'Industrial/Commercial Equipment | Diesel', 'Industrial/Commercial Equipment | Gasoline (4 stroke)'],
      ['construction_mining', 'Construction/Mining Equipment | Diesel Equipment', 'Construction/Mining Equipment | Gasoline (4 stroke)'],
      ['agriculture', 'Agricultural Equipment | Diesel Equipment', 'Agricultural Equipment | Gasoline (4 stroke)'],
      ['forestry', 'Logging Equipment | Diesel', 'Logging Equipment | Gasoline (4 stroke)'],
      ['lawn_garden', 'Lawn and Garden Equipment | Diesel', 'Lawn and Garden Equipment | Gasoline (4 stroke)'],
    ]
    for (const [e, d, p] of eq) {
      expect(row(sel(EPA_MOBILE_2025, { type: 'non_road', fuel: 'diesel', equipmentType: e as never })), e).toBe(d)
      expect(row(sel(EPA_MOBILE_2025, { type: 'non_road', fuel: 'petrol', equipmentType: e as never })), e).toBe(p)
    }
  })

  it('ECCC: years only where the NIR ties them; no sector split off road', () => {
    expect(row(sel(ECCC_MOBILE_2025, { type: 'light', fuel: 'petrol' }))).toBe('Light-duty Gasoline Vehicles (LDGVs) | Tier 0')
    expect(row(sel(ECCC_MOBILE_2025, { type: 'light', fuel: 'petrol', modelYear: 2018 }))).toBe('Light-duty Gasoline Vehicles (LDGVs) | Tier 2')
    expect(row(sel(ECCC_MOBILE_2025, { type: 'light', fuel: 'diesel', modelYear: 1990 }))).toBe('Light-duty Diesel Vehicles (LDDVs) | Moderate Control')
    expect(row(sel(ECCC_MOBILE_2025, { type: 'heavy', fuel: 'diesel', modelYear: 2000 }))).toBe('Heavy-duty Diesel Vehicles (HDDVs) | Advanced Control')
    // 1996 to 2003 light, and every heavy gasoline year, reach no tied row: the highest row.
    expect(sel(ECCC_MOBILE_2025, { type: 'light', fuel: 'petrol', modelYear: 2000 })!.reason)
      .toBe('Environment and Climate Change Canada ties no row to model year 2000, so the highest published row for light vehicles is used.')
    expect(row(sel(ECCC_MOBILE_2025, { type: 'heavy', fuel: 'petrol', modelYear: 2018 }))).toBe('Heavy-duty Gasoline Vehicles (HDGVs) | Three-way Catalyst')
    for (const e of ['industrial_commercial', 'construction_mining', 'agriculture', 'forestry', 'lawn_garden'] as const) {
      const d = sel(ECCC_MOBILE_2025, { type: 'non_road', fuel: 'diesel', equipmentType: e })!
      expect(row(d), e).toBe('Off-road Diesel | \u2265 19kW, Tier 4')
      expect(d.reason, e).toMatch(/^Environment and Climate Change Canada does not split non-road equipment by type\. Engine power and emission tier not given/)
      expect(row(sel(ECCC_MOBILE_2025, { type: 'non_road', fuel: 'petrol', equipmentType: e })), e).toBe('Off-road Gasoline | 2-stroke')
    }
  })

  it('DEFRA and MfE: one row per fuel for every type, every year and every equipment type', () => {
    for (const [p, d, pe] of [[DEFRA_MOBILE_2026, 0.0329, 0.00587], [MFE_MOBILE_2026, 0.0373749, 0.0693172]] as const) {
      for (const type of ['light', 'heavy'] as const) {
        expect(sel(p, { type, fuel: 'diesel', modelYear: 2010 })!.row.n2o, p.publisher).toBe(d)
        expect(sel(p, { type, fuel: 'diesel', modelYear: 2010 })!.reason).toBe(`${p.publisher} prints one row for ${type} vehicles; it is not split by model year.`)
        expect(sel(p, { type, fuel: 'petrol' })!.row.n2o).toBe(pe)
      }
      for (const e of ['industrial_commercial', 'construction_mining', 'agriculture', 'forestry', 'lawn_garden'] as const) {
        const s = sel(p, { type: 'non_road', fuel: 'diesel', equipmentType: e })!
        expect(s.row.n2o, `${p.publisher} ${e}`).toBe(d)
        expect(s.reason).toBe(`${p.publisher} prints one non-road row for diesel, not split by equipment type.`)
      }
    }
  })

  it('NGA: model years from the p. 28 note and the Determination; Euro standard has no year; non-road from Table 8', () => {
    expect(row(sel(NGA_MOBILE_2025, { type: 'light', fuel: 'petrol' }))).toBe('Cars and light commercial vehicles | manufactured prior to 2004')
    expect(row(sel(NGA_MOBILE_2025, { type: 'light', fuel: 'petrol', modelYear: 2003 }))).toBe('Cars and light commercial vehicles | manufactured prior to 2004')
    expect(row(sel(NGA_MOBILE_2025, { type: 'light', fuel: 'petrol', modelYear: 2004 }))).toBe('Cars and light commercial vehicles | manufactured 2004 or later')
    expect(sel(NGA_MOBILE_2025, { type: 'light', fuel: 'petrol', modelYear: 2010 })!.reason)
      .toBe('Typical model year 2010: DCCEEW National Greenhouse Accounts Factors, manufactured 2004 or later.')
    expect(row(sel(NGA_MOBILE_2025, { type: 'heavy', fuel: 'petrol' }))).toMatch(/Division 4\.1/)
    expect(row(sel(NGA_MOBILE_2025, { type: 'heavy', fuel: 'petrol', modelYear: 2004 }))).toMatch(/Division 4\.1/)
    expect(row(sel(NGA_MOBILE_2025, { type: 'heavy', fuel: 'petrol', modelYear: 2005 }))).toMatch(/Division 4\.2/)
    expect(sel(NGA_MOBILE_2025, { type: 'heavy', fuel: 'diesel' })!.reason)
      .toBe('Euro standard not given, so the highest published row for heavy vehicles is used.')
    expect(row(sel(NGA_MOBILE_2025, { type: 'heavy', fuel: 'diesel', modelYear: 2015 }))).toBe('Heavy duty vehicles | Euro i')
    for (const e of ['industrial_commercial', 'construction_mining', 'agriculture', 'forestry', 'lawn_garden'] as const) {
      const s = sel(NGA_MOBILE_2025, { type: 'non_road', fuel: 'diesel', equipmentType: e })!
      expect([s.row.ch4, s.row.n2o, s.fallback], e).toEqual([0.1, 0.2, false])
    }
  })

  it('IPCC: the vintage row from 1995 for light petrol; Table 3.3.1 sectors for each equipment type', () => {
    expect(row(sel(IPCC_MOBILE_2006, { type: 'light', fuel: 'petrol', modelYear: 2010 })))
      .toBe('Motor Gasoline - Low Mileage Light Duty Vehicle Vintage 1995 or Later | ')
    expect(row(sel(IPCC_MOBILE_2006, { type: 'light', fuel: 'petrol', modelYear: 1990 }))).toBe('Motor Gasoline - Oxidation Catalyst | ')
    expect(row(sel(IPCC_MOBILE_2006, { type: 'heavy', fuel: 'petrol', modelYear: 2010 }))).toBe('Motor Gasoline - Oxidation Catalyst | ')
    const eq: [string, string, string][] = [
      ['industrial_commercial', 'Diesel | Industry', 'Motor Gasoline 2-Stroke | Industry'],
      ['construction_mining', 'Diesel | Industry', 'Motor Gasoline 2-Stroke | Industry'],
      ['agriculture', 'Diesel | Agriculture', 'Motor Gasoline 2-Stroke | Agriculture'],
      ['forestry', 'Diesel | Forestry', 'Motor Gasoline 2-Stroke | Forestry'],
      ['lawn_garden', 'Diesel | Household', 'Motor Gasoline 2-Stroke | Household'],
    ]
    for (const [e, d, p] of eq) {
      expect(row(sel(IPCC_MOBILE_2006, { type: 'non_road', fuel: 'diesel', equipmentType: e as never })), e).toBe(d)
      expect(row(sel(IPCC_MOBILE_2006, { type: 'non_road', fuel: 'petrol', equipmentType: e as never })), e).toBe(p)
    }
  })

  it('the IPCC fallback: CH4 and N2O from IPCC where a publisher prints no row, with the R16 note', () => {
    const none: MobilePublisher = { ...NGA_MOBILE_2025, rows: [] }
    const off = sel(none, { type: 'non_road', fuel: 'diesel', equipmentType: 'construction_mining' })!
    expect(off.fallback).toBe(true)
    expect(row(off)).toBe('Diesel | Industry')
    expect(off.reason).toBe('IPCC 2006 default for CH4 and N2O; DCCEEW National Greenhouse Accounts Factors publishes no off-road ' +
      'factor for diesel. IPCC prints one row for non-road construction and mining equipment.')
    const road = sel(none, { type: 'heavy', fuel: 'petrol', modelYear: 2010 })!
    expect(road.fallback).toBe(true)
    expect(road.reason).toMatch(/^IPCC 2006 default for CH4 and N2O; DCCEEW National Greenhouse Accounts Factors publishes no road factor for petrol\. /)
  })

  it('the engine prices fleet fuel from every publisher file here (FI9 diff 2b), and no file carries an em dash', () => {
    const dir = __dirname
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8'), f).not.toContain('\u2014')
    const engine = readFileSync(join(dir, '..', '..', 'ghg', 'engine.ts'), 'utf8')
    for (const m of ['select', 'epa2025', 'eccc2025', 'defra2026', 'nga2025', 'mfe2026', 'ipcc2006']) {
      expect(engine, m).toContain(`from '../emissionFactors/mobile/${m}'`)
    }
  })
})
