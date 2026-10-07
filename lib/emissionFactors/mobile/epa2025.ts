// ── US EPA GHG EMISSION FACTORS HUB 2025: MOBILE COMBUSTION (TABLES 2 TO 5) ──────────────────────────
//
// FI9 diff 1. Transcribed from ~/themisiq-sources/epa/ghg-emission-factors-hub-2025.xlsx (sheet "Emission Factors
// Hub", the cell on each row) and checked against the PDF of the same edition ("Last Modified: 15 January 2025";
// Tables 2 and 3 on p. 2, Tables 4 and 5 on p. 3). Units are EPA's own (R5). Priced by engine pickFleet (FI9 2b).
//
// CO2 is per gallon (Table 2). CH4 and N2O are per VEHICLE-MILE on the road (Tables 3 and 4), by vehicle type and
// model year, and per gallon off road (Table 5), by equipment and engine. Every table's note reads: "The factors
// represented in the table above represent combustion emissions only (tank-to-wheel) and do not represent upstream
// emissions or well-to-wheel emissions."
//
// Mapping to R16's types: Passenger Cars and Light-Duty Trucks (Vans, Pickup Trucks, SUVs) are Light; Heavy-Duty
// (gasoline) and Medium- and Heavy-Duty (diesel) are Heavy; Table 5's equipment rows are Non-road, except Ships and
// Boats, Locomotives and Aircraft, which are not R16 types and are not transcribed. Gasoline Motorcycles (Table 3)
// are not an R16 type either and are not transcribed. Alternative-fuel rows in Table 4 are not diesel or petrol.

import type { EquipmentType, MobileCite, MobileGasRow, MobilePublisher, YearRange } from './types'

/** EPA's model-year label as a range: "2005", "1984-1993", "≤1980". The label is printed; the range is its reading. */
export function epaYears(label: string): YearRange {
  const t = label.trim()
  if (t.startsWith('≤')) return { from: null, to: Number(t.slice(1)) }
  const [a, b] = t.split('-').map(Number)
  return { from: a, to: b ?? a }
}

/** R16's equipment types to Table 5's equipment rows. Airport, Railroad and Recreational Equipment are no R16 type. */
const EPA_EQUIPMENT: Readonly<Record<string, EquipmentType[]>> = {
  'Agricultural Equipment': ['agriculture'],
  'Construction/Mining Equipment': ['construction_mining'],
  'Lawn and Garden Equipment': ['lawn_garden'],
  'Industrial/Commercial Equipment': ['industrial_commercial'],
  'Logging Equipment': ['forestry'],
  'Airport Equipment': [], 'Railroad Equipment': [], 'Recreational Equipment': [],
}

const SHEET = 'Emission Factors Hub'
const cell = (c: string) => `${SHEET}!${c}`

const t3 = (vehicle: string, type: 'light' | 'heavy', year: string, ch4: number, n2o: number,
  vc: string, yc: string, ch4c: string, n2oc: string): MobileGasRow => ({
  fuel: 'petrol', type, vehicle, detail: `Model year ${year}`, ch4, n2o, unit: 'g/vehicle-mile', gas: 'mass',
  years: epaYears(year),
  cite: { table: 'Table 3 Mobile Combustion CH4 and N2O for On-Road Gasoline Vehicles', row: `${vehicle}, ${year}`,
    column: 'CH4 Factor (g CH4 / vehicle-mile); N2O Factor (g N2O / vehicle-mile)', page: '2',
    cell: `${cell(ch4c)}, ${cell(n2oc)} (vehicle ${vc}, model year ${yc})` },
})
const t4 = (vehicle: string, type: 'light' | 'heavy', year: string, ch4: number, n2o: number, r: number): MobileGasRow => ({
  fuel: 'diesel', type, vehicle, detail: `Model year ${year}`, ch4, n2o, unit: 'g/vehicle-mile', gas: 'mass',
  years: epaYears(year),
  cite: { table: 'Table 4 Mobile Combustion CH4 and N2O for On-Road Diesel and Alternative Fuel Vehicles',
    row: `${vehicle}, Diesel, ${year}`, column: 'CH4 Factor (g CH4 / vehicle-mile); N2O Factor (g N2O / vehicle-mile)',
    page: '3', cell: `${cell(`F${r}`)}, ${cell(`G${r}`)}` },
})
const t5 = (vehicle: string, fuelType: string, ch4: number, n2o: number, r: number): MobileGasRow => ({
  fuel: /^Diesel/.test(fuelType) ? 'diesel' : 'petrol', type: 'non_road', vehicle, detail: fuelType, ch4, n2o,
  unit: 'g/gallon', gas: 'mass', equipment: EPA_EQUIPMENT[vehicle],
  cite: { table: 'Table 5 Mobile Combustion CH4 and N2O for Non-Road Vehicles', row: `${vehicle}, ${fuelType}`,
    column: 'CH4 Factor (g CH4 / gallon); N2O Factor (g N2O / gallon)', page: '3', cell: `${cell(`E${r}`)}, ${cell(`F${r}`)}` },
})

const T2: MobileCite = { table: 'Table 2 Mobile Combustion CO2', row: '', column: 'kg CO2 per unit', page: '2' }

export const EPA_MOBILE_2025: MobilePublisher = {
  publisher: 'US EPA',
  edition: '2025',
  document: 'US EPA GHG Emission Factors Hub 2025 (Last Modified: 15 January 2025)',
  co2: [
    { fuel: 'diesel', value: 10.21, unit: 'kg CO2/gallon', cite: { ...T2, row: 'Diesel Fuel', cell: cell('D107') } },
    { fuel: 'petrol', value: 8.78, unit: 'kg CO2/gallon', cite: { ...T2, row: 'Motor Gasoline', cell: cell('D112') } },
  ],
  rows: [
    // Table 3, on-road gasoline, g per vehicle-mile, by model year.
    t3("Gasoline Passenger Cars", "light", "1973-1974", 0.1696, 0.0197, 'C127', 'D127', 'E127', 'F127'),
    t3("Gasoline Passenger Cars", "light", "1975", 0.1423, 0.0443, 'C128', 'D128', 'E128', 'F128'),
    t3("Gasoline Passenger Cars", "light", "1976-1977", 0.1406, 0.0458, 'C129', 'D129', 'E129', 'F129'),
    t3("Gasoline Passenger Cars", "light", "1978-1979", 0.1389, 0.0473, 'C130', 'D130', 'E130', 'F130'),
    t3("Gasoline Passenger Cars", "light", "1980", 0.1326, 0.0499, 'C131', 'D131', 'E131', 'F131'),
    t3("Gasoline Passenger Cars", "light", "1981", 0.0802, 0.0626, 'C132', 'D132', 'E132', 'F132'),
    t3("Gasoline Passenger Cars", "light", "1982", 0.0795, 0.0627, 'C133', 'D133', 'E133', 'F133'),
    t3("Gasoline Passenger Cars", "light", "1983", 0.0782, 0.063, 'C134', 'D134', 'E134', 'F134'),
    t3("Gasoline Passenger Cars", "light", "1984-1993", 0.0704, 0.0647, 'C135', 'D135', 'E135', 'F135'),
    t3("Gasoline Passenger Cars", "light", "1994", 0.0617, 0.0603, 'C136', 'D136', 'E136', 'F136'),
    t3("Gasoline Passenger Cars", "light", "1995", 0.0531, 0.056, 'C137', 'D137', 'E137', 'F137'),
    t3("Gasoline Passenger Cars", "light", "1996", 0.0434, 0.0503, 'C138', 'D138', 'E138', 'F138'),
    t3("Gasoline Passenger Cars", "light", "1997", 0.0337, 0.0446, 'C139', 'D139', 'E139', 'F139'),
    t3("Gasoline Passenger Cars", "light", "1998", 0.024, 0.0389, 'C140', 'D140', 'E140', 'F140'),
    t3("Gasoline Passenger Cars", "light", "1999", 0.0215, 0.0355, 'C141', 'D141', 'E141', 'F141'),
    t3("Gasoline Passenger Cars", "light", "2000", 0.0175, 0.0304, 'C142', 'D142', 'E142', 'F142'),
    t3("Gasoline Passenger Cars", "light", "2001", 0.0105, 0.0212, 'C143', 'D143', 'E143', 'F143'),
    t3("Gasoline Passenger Cars", "light", "2002", 0.0102, 0.0207, 'C144', 'D144', 'E144', 'F144'),
    t3("Gasoline Passenger Cars", "light", "2003", 0.0095, 0.0181, 'C145', 'D145', 'E145', 'F145'),
    t3("Gasoline Passenger Cars", "light", "2004", 0.0078, 0.0085, 'C146', 'D146', 'E146', 'F146'),
    t3("Gasoline Passenger Cars", "light", "2005", 0.0075, 0.0067, 'C147', 'D147', 'E147', 'F147'),
    t3("Gasoline Passenger Cars", "light", "2006", 0.0076, 0.0075, 'C148', 'D148', 'E148', 'F148'),
    t3("Gasoline Passenger Cars", "light", "2007", 0.0072, 0.0052, 'C149', 'D149', 'E149', 'F149'),
    t3("Gasoline Passenger Cars", "light", "2008", 0.0072, 0.0049, 'C150', 'D150', 'E150', 'F150'),
    t3("Gasoline Passenger Cars", "light", "2009", 0.0071, 0.0046, 'C151', 'D151', 'E151', 'F151'),
    t3("Gasoline Passenger Cars", "light", "2010", 0.0071, 0.0046, 'C152', 'D152', 'E152', 'F152'),
    t3("Gasoline Passenger Cars", "light", "2011", 0.0071, 0.0046, 'C153', 'D153', 'E153', 'F153'),
    t3("Gasoline Passenger Cars", "light", "2012", 0.0071, 0.0046, 'C154', 'D154', 'E154', 'F154'),
    t3("Gasoline Passenger Cars", "light", "2013", 0.0071, 0.0046, 'C155', 'D155', 'E155', 'F155'),
    t3("Gasoline Passenger Cars", "light", "2014", 0.0071, 0.0046, 'C156', 'D156', 'E156', 'F156'),
    t3("Gasoline Passenger Cars", "light", "2015", 0.0068, 0.0042, 'C157', 'D157', 'E157', 'F157'),
    t3("Gasoline Passenger Cars", "light", "2016", 0.0065, 0.0038, 'C158', 'D158', 'E158', 'F158'),
    t3("Gasoline Passenger Cars", "light", "2017", 0.0054, 0.0018, 'C159', 'D159', 'E159', 'F159'),
    t3("Gasoline Passenger Cars", "light", "2018", 0.0052, 0.0016, 'C160', 'D160', 'E160', 'F160'),
    t3("Gasoline Passenger Cars", "light", "2019", 0.0051, 0.0015, 'C161', 'D161', 'E161', 'F161'),
    t3("Gasoline Passenger Cars", "light", "2020", 0.005, 0.0014, 'C162', 'D162', 'E162', 'F162'),
    t3("Gasoline Passenger Cars", "light", "2021", 0.0051, 0.0014, 'C163', 'D163', 'E163', 'F163'),
    t3("Gasoline Passenger Cars", "light", "2022", 0.005, 0.0014, 'C164', 'D164', 'E164', 'F164'),
    t3("Gasoline Light-Duty Trucks", "light", "1973-1974", 0.1908, 0.0218, 'C165', 'D165', 'E165', 'F165'),
    t3("Gasoline Light-Duty Trucks", "light", "1975", 0.1634, 0.0513, 'C166', 'D166', 'E166', 'F166'),
    t3("Gasoline Light-Duty Trucks", "light", "1976", 0.1594, 0.0555, 'C167', 'D167', 'E167', 'F167'),
    t3("Gasoline Light-Duty Trucks", "light", "1977-1978", 0.1614, 0.0534, 'C168', 'D168', 'E168', 'F168'),
    t3("Gasoline Light-Duty Trucks", "light", "1979-1980", 0.1594, 0.0555, 'C169', 'D169', 'E169', 'F169'),
    t3("Gasoline Light-Duty Trucks", "light", "1981", 0.1479, 0.066, 'C170', 'D170', 'E170', 'F170'),
    t3("Gasoline Light-Duty Trucks", "light", "1982", 0.1442, 0.0681, 'C171', 'D171', 'E171', 'F171'),
    t3("Gasoline Light-Duty Trucks", "light", "1983", 0.1368, 0.0722, 'C172', 'D172', 'E172', 'F172'),
    t3("Gasoline Light-Duty Trucks", "light", "1984", 0.1294, 0.0764, 'C173', 'D173', 'E173', 'F173'),
    t3("Gasoline Light-Duty Trucks", "light", "1985", 0.122, 0.0806, 'C174', 'D174', 'E174', 'F174'),
    t3("Gasoline Light-Duty Trucks", "light", "1986", 0.1146, 0.0848, 'C175', 'D175', 'E175', 'F175'),
    t3("Gasoline Light-Duty Trucks", "light", "1987-1993", 0.0813, 0.1035, 'C176', 'D176', 'E176', 'F176'),
    t3("Gasoline Light-Duty Trucks", "light", "1994", 0.0646, 0.0982, 'C177', 'D177', 'E177', 'F177'),
    t3("Gasoline Light-Duty Trucks", "light", "1995", 0.0517, 0.0908, 'C178', 'D178', 'E178', 'F178'),
    t3("Gasoline Light-Duty Trucks", "light", "1996", 0.0452, 0.0871, 'C179', 'D179', 'E179', 'F179'),
    t3("Gasoline Light-Duty Trucks", "light", "1997", 0.0452, 0.0871, 'C180', 'D180', 'E180', 'F180'),
    t3("Gasoline Light-Duty Trucks", "light", "1998", 0.0412, 0.0787, 'C181', 'D181', 'E181', 'F181'),
    t3("Gasoline Light-Duty Trucks", "light", "1999", 0.0333, 0.0618, 'C182', 'D182', 'E182', 'F182'),
    t3("Gasoline Light-Duty Trucks", "light", "2000", 0.034, 0.0631, 'C183', 'D183', 'E183', 'F183'),
    t3("Gasoline Light-Duty Trucks", "light", "2001", 0.0221, 0.0379, 'C184', 'D184', 'E184', 'F184'),
    t3("Gasoline Light-Duty Trucks", "light", "2002", 0.0242, 0.0424, 'C185', 'D185', 'E185', 'F185'),
    t3("Gasoline Light-Duty Trucks", "light", "2003", 0.0221, 0.0373, 'C186', 'D186', 'E186', 'F186'),
    t3("Gasoline Light-Duty Trucks", "light", "2004", 0.0115, 0.0088, 'C187', 'D187', 'E187', 'F187'),
    t3("Gasoline Light-Duty Trucks", "light", "2005", 0.0105, 0.0064, 'C188', 'D188', 'E188', 'F188'),
    t3("Gasoline Light-Duty Trucks", "light", "2006", 0.0108, 0.008, 'C189', 'D189', 'E189', 'F189'),
    t3("Gasoline Light-Duty Trucks", "light", "2007", 0.0103, 0.0061, 'C190', 'D190', 'E190', 'F190'),
    t3("Gasoline Light-Duty Trucks", "light", "2008", 0.0095, 0.0036, 'C191', 'D191', 'E191', 'F191'),
    t3("Gasoline Light-Duty Trucks", "light", "2009", 0.0095, 0.0036, 'C192', 'D192', 'E192', 'F192'),
    t3("Gasoline Light-Duty Trucks", "light", "2010", 0.0095, 0.0035, 'C193', 'D193', 'E193', 'F193'),
    t3("Gasoline Light-Duty Trucks", "light", "2011", 0.0096, 0.0034, 'C194', 'D194', 'E194', 'F194'),
    t3("Gasoline Light-Duty Trucks", "light", "2012", 0.0096, 0.0033, 'C195', 'D195', 'E195', 'F195'),
    t3("Gasoline Light-Duty Trucks", "light", "2013", 0.0095, 0.0035, 'C196', 'D196', 'E196', 'F196'),
    t3("Gasoline Light-Duty Trucks", "light", "2014", 0.0095, 0.0033, 'C197', 'D197', 'E197', 'F197'),
    t3("Gasoline Light-Duty Trucks", "light", "2015", 0.0094, 0.0031, 'C198', 'D198', 'E198', 'F198'),
    t3("Gasoline Light-Duty Trucks", "light", "2016", 0.0091, 0.0029, 'C199', 'D199', 'E199', 'F199'),
    t3("Gasoline Light-Duty Trucks", "light", "2017", 0.0084, 0.0018, 'C200', 'D200', 'E200', 'F200'),
    t3("Gasoline Light-Duty Trucks", "light", "2018", 0.0081, 0.0015, 'C201', 'D201', 'E201', 'F201'),
    t3("Gasoline Light-Duty Trucks", "light", "2019", 0.008, 0.0013, 'C202', 'D202', 'E202', 'F202'),
    t3("Gasoline Light-Duty Trucks", "light", "2020", 0.0079, 0.0012, 'C203', 'D203', 'E203', 'F203'),
    t3("Gasoline Light-Duty Trucks", "light", "2021", 0.0079, 0.0012, 'C204', 'D204', 'E204', 'F204'),
    t3("Gasoline Light-Duty Trucks", "light", "2022", 0.0079, 0.0012, 'C205', 'D205', 'E205', 'F205'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "≤1980", 0.4604, 0.0497, 'C206', 'D206', 'E206', 'F206'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "1981-1984", 0.4492, 0.0538, 'C207', 'D207', 'E207', 'F207'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "1985-1986", 0.409, 0.0515, 'C208', 'D208', 'E208', 'F208'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "1987", 0.3675, 0.0849, 'C209', 'D209', 'E209', 'F209'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "1988-1989", 0.3492, 0.0933, 'C210', 'D210', 'E210', 'F210'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "1990-1995", 0.3246, 0.1142, 'C211', 'D211', 'E211', 'F211'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "1996", 0.1278, 0.168, 'C212', 'D212', 'E212', 'F212'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "1997", 0.0924, 0.1726, 'C213', 'D213', 'E213', 'F213'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "1998", 0.0655, 0.175, 'C214', 'D214', 'E214', 'F214'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "1999", 0.0648, 0.1724, 'C215', 'D215', 'E215', 'F215'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2000", 0.063, 0.166, 'C216', 'D216', 'E216', 'F216'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2001", 0.0577, 0.1468, 'C217', 'D217', 'E217', 'F217'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2002", 0.0634, 0.1673, 'C218', 'D218', 'E218', 'F218'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2003", 0.0602, 0.1553, 'C219', 'D219', 'E219', 'F219'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2004", 0.0298, 0.0164, 'C220', 'D220', 'E220', 'F220'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2005", 0.0297, 0.0083, 'C221', 'D221', 'E221', 'F221'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2006", 0.0299, 0.0241, 'C222', 'D222', 'E222', 'F222'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2007", 0.0322, 0.0015, 'C223', 'D223', 'E223', 'F223'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2008", 0.034, 0.0015, 'C224', 'D224', 'E224', 'F224'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2009", 0.0339, 0.0015, 'C225', 'D225', 'E225', 'F225'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2010", 0.032, 0.0015, 'C226', 'D226', 'E226', 'F226'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2011", 0.0304, 0.0015, 'C227', 'D227', 'E227', 'F227'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2012", 0.0313, 0.0015, 'C228', 'D228', 'E228', 'F228'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2013", 0.0313, 0.0015, 'C229', 'D229', 'E229', 'F229'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2014", 0.0315, 0.0015, 'C230', 'D230', 'E230', 'F230'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2015", 0.0332, 0.0021, 'C231', 'D231', 'E231', 'F231'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2016", 0.0321, 0.0061, 'C232', 'D232', 'E232', 'F232'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2017", 0.0329, 0.0084, 'C233', 'D233', 'E233', 'F233'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2018", 0.0326, 0.0082, 'C234', 'D234', 'E234', 'F234'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2019", 0.033, 0.0091, 'C235', 'D235', 'E235', 'F235'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2020", 0.0332, 0.01, 'C236', 'D236', 'E236', 'F236'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2021", 0.0332, 0.01, 'C237', 'D237', 'E237', 'F237'),
    t3("Gasoline Heavy-Duty Vehicles", "heavy", "2022", 0.0332, 0.01, 'C238', 'D238', 'E238', 'F238'),
    // Table 4, on-road diesel, g per vehicle-mile, by model year.
    t4("Passenger Cars", "light", "1960-1982", 0.0006, 0.0012, 249),
    t4("Passenger Cars", "light", "1983-2006", 0.0005, 0.001, 250),
    t4("Passenger Cars", "light", "2007-2022", 0.0302, 0.0192, 251),
    t4("Light-Duty Trucks", "light", "1960-1982", 0.0011, 0.0017, 252),
    t4("Light-Duty Trucks", "light", "1983-2006", 0.0009, 0.0014, 253),
    t4("Light-Duty Trucks", "light", "2007-2022", 0.029, 0.0214, 254),
    t4("Medium- and Heavy-Duty Vehicles", "heavy", "1960-2006", 0.0051, 0.0048, 255),
    t4("Medium- and Heavy-Duty Vehicles", "heavy", "2007-2022", 0.0095, 0.0431, 256),
    // Table 5, non-road, g per gallon, by equipment and engine (Ships and Boats, Locomotives and Aircraft not transcribed).
    t5("Agricultural Equipment", "Gasoline (2 stroke)", 6.9, 0.47, 297),
    t5("Agricultural Equipment", "Gasoline (4 stroke)", 1.93, 1.2, 298),
    t5("Agricultural Equipment", "Gasoline Off-Road Trucks", 1.93, 1.2, 299),
    t5("Agricultural Equipment", "Diesel Equipment", 1.26, 1.07, 300),
    t5("Agricultural Equipment", "Diesel Off-Road Trucks", 0.92, 0.56, 301),
    t5("Construction/Mining Equipment", "Gasoline (2 stroke)", 8, 0.12, 303),
    t5("Construction/Mining Equipment", "Gasoline (4 stroke)", 2.86, 1.48, 304),
    t5("Construction/Mining Equipment", "Gasoline Off-Road Trucks", 2.86, 1.48, 305),
    t5("Construction/Mining Equipment", "Diesel Equipment", 1.01, 0.94, 306),
    t5("Construction/Mining Equipment", "Diesel Off-Road Trucks", 0.92, 0.56, 307),
    t5("Lawn and Garden Equipment", "Gasoline (2 stroke)", 7.34, 0.31, 309),
    t5("Lawn and Garden Equipment", "Gasoline (4 stroke)", 3.02, 1.5, 310),
    t5("Lawn and Garden Equipment", "Diesel", 0.67, 0.49, 311),
    t5("Airport Equipment", "Gasoline", 1.07, 1.12, 313),
    t5("Airport Equipment", "Diesel", 1.98, 1.21, 314),
    t5("Industrial/Commercial Equipment", "Gasoline (2 stroke)", 7.3, 0.51, 316),
    t5("Industrial/Commercial Equipment", "Gasoline (4 stroke)", 2.81, 1.57, 317),
    t5("Industrial/Commercial Equipment", "Diesel", 0.43, 0.62, 318),
    t5("Logging Equipment", "Gasoline (2 stroke)", 9.62, 0, 320),
    t5("Logging Equipment", "Gasoline (4 stroke)", 3.22, 2.05, 321),
    t5("Logging Equipment", "Diesel", 0.49, 1.26, 322),
    t5("Railroad Equipment", "Gasoline", 3.32, 1.86, 323),
    t5("Railroad Equipment", "Diesel", 0.41, 0.97, 324),
    t5("Recreational Equipment", "Gasoline (2 stroke)", 9.86, 0.11, 326),
    t5("Recreational Equipment", "Gasoline (4 stroke)", 2.74, 1.49, 327),
    t5("Recreational Equipment", "Diesel", 0.73, 0.66, 328),
  ],
  // Every R16 type has diesel and petrol rows.
  absent: [],
  splitBy: {
    'light:petrol': 'Model year', 'light:diesel': 'Model year', 'heavy:petrol': 'Model year', 'heavy:diesel': 'Model year',
    'non_road:petrol': 'Engine type', 'non_road:diesel': 'Equipment or off-road truck',
  },
}
