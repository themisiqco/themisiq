# FI9 diff 2 onwards: the fleet split (design note)

**Status.** Proposal only, 7 Oct 2026, on `factor-integrity-2` at fe84778. No code. Rulings: R16 as refined (section
10 of design-derived-figures.md); factors and selection: lib/emissionFactors/mobile/ and mobile-factors.md.

**R16 additions to record with this note (Lisa, 7 Oct 2026):**
- A model year later than a publisher's latest row uses the latest row, and the row says so (US EPA: rows end at
  2022). This replaces "a year no row is tied to takes the highest row" for years after the last row only; a year
  inside a publisher's range with no tied row still takes the highest.
- US road: optional miles per type, asked beside model year. Without miles, CO2 prices and CH4/N2O show as not counted
  with a plain reason; that alone does not block export.
- AU non-road from NGA Table 8 (NGER Determination s 2.41(2)) and NZ non-road from MfE Transport Fuel (2024 guide
  s 3.2 and 3.3): both readings accepted.

## 1. Data model: discrete fields per type and fuel

**Proposal: discrete fields on Location, not a fleet array.** Every piece of machinery the figure passes through is
keyed by a field name (`keyof Location`): `fieldFor` (document to field), `DOC_TYPE_FIELDS`, `FIELD_STREAM`,
`FIELD_SWITCH`, `FIELD_NAME`, `UNIT_FIELDS`, `documentsBacking`, `manual_overrides`, `unit_changes`, the T7 derived
figures (`deriveLocations`), `FigureInput`, `UnpricedNote` and the FI1 unpriced lines. Six new amount fields slot into
all of them by adding map entries; an array would need a second key (index or id) threaded through every one of those,
which is the riskier change. Six is a fixed, small set (3 types x 2 fuels), so the array's flexibility buys nothing.

| Field | Type | Shown when |
|---|---|---|
| `fleet_light`, `fleet_heavy`, `fleet_nonroad` | boolean, default false | always, under `has_mobile` |
| `light_petrol_amount` / `_unit`, `light_diesel_amount` / `_unit` | number / `'gallons' \| 'litres'` | `fleet_light` |
| `heavy_petrol_amount` / `_unit`, `heavy_diesel_amount` / `_unit` | same | `fleet_heavy` |
| `nonroad_petrol_amount` / `_unit`, `nonroad_diesel_amount` / `_unit` | same | `fleet_nonroad` |
| `light_model_year`, `heavy_model_year` | number, optional | the type is on |
| `light_petrol_miles`, `light_diesel_miles`, `heavy_petrol_miles`, `heavy_diesel_miles` | number, optional | US site, that fuel has a quantity |
| `nonroad_petrol_equipment`, `nonroad_diesel_equipment` | `EquipmentType`, optional, no default | that fuel has a quantity |

- `has_mobile` stays the stream switch (declarations, attestations and `FIELD_SWITCH` are keyed by stream `mobile`).
  The three type booleans only decide which sections show; a field under a type that is off is not priced, the same
  rule as `has_*` today (`streamSwitchOff` gains the type switch).
- Units: `liquidUnitOptions(country)` as today (US gallons and litres, everywhere else litres). FI5's `changeUnit` and
  `unitsForCountryChange` take the six new unit fields through `UNIT_FIELDS`.
- Miles are per type and fuel, because EPA's CH4 and N2O are per vehicle-mile by vehicle type and fuel (Tables 3 and 4);
  one miles figure for a mixed petrol and diesel light fleet could not be split without inventing a ratio.
- Equipment type is per fuel, so a site with diesel forklifts and petrol mowers is not forced into one row.
- All of it lives in `locations_data` (JSON). No SQL.

## 2. Existing data (`gasoline_amount`, `diesel_mobile_amount`)

Pre-launch, test data only. **Proposal: neither moved nor deleted silently.** The two fields stay in the type as
legacy, read-only. A location holding either with a figure gets one FI1 unpriced line, export-blocking: "{site} has
{n} {unit} of {fuel} for vehicles recorded before vehicle types were asked. Choose the vehicle type it was used in."
Beside it, one button per type ("These were light vehicles", ...) moves the figure, its unit and any `unit_changes` to
that type's fields, records the move on the location (`fleet_assignments`: from, to, value, unit, who, when), and the
line says the figure is now priced with that type's mobile factors. Nothing is reassigned without a click, and the
number it produces is shown on the next render. Legacy fields backed by confirmed documents move with their
proposals (section 3). After launch the legacy path can be removed once no stored inventory carries a figure there
(a one-line SQL count, for Lisa to run).

Alternative: clear both with a message. Rejected as the default because it destroys typed data for no gain; it remains
open choice 2.

## 3. Documents (fleet fuel receipts and fuel-card statements)

- `ExtractedProposal` gains `fleetType?: FleetType`. The extractor does not set it: the AI and the specialist read
  quantity, unit, dates and fuel exactly as today; the vehicle type is the customer's statement, never a guess.
- `fieldFor(docType, fuelType, fleetType)` maps `fleet_fuel` + fuel + type to the six fields. With no type it returns
  null, and `acceptanceProblem` refuses confirmation: "Choose the vehicles this {fuel} was for before confirming."
  `guardConfirm` enforces it, so no figure lands on a field until a type is chosen.
- Review UI, on a `fleet_fuel` proposal row only: "Vehicles: Light (cars, vans, utes) / Heavy (trucks, buses) /
  Non-road (forklifts, plant, machinery)", three buttons, no default, beside the existing period and unit editors. The
  choice is stored on the proposal with who and when (T18), and changing it after confirmation un-confirms the bill,
  as a period edit does today.
- One proposal is one type. A statement covering several types is either uploaded per type, or entered by hand on
  each type with the documents kept as evidence (T10 override). Splitting one proposal across types is open choice 4.
- `DOC_TYPE_FIELDS.fleet_fuel` lists the six fields; coverage (`analyzeCoverage`, keyed per document type, fuel and
  meter) adds the type to the group key so a light-diesel gap is not masked by heavy-diesel bills.
- Proposals already confirmed on the legacy fields carry no type; they take the type chosen in section 2's button,
  recorded on each proposal.

## 4. Wizard layout, one location

Under the existing mobile question ("Delivery trucks, forklifts, company cars"), once answered yes:

1. "Which vehicles use this fuel?" Three checkboxes: Light (cars, vans, utes), Heavy (trucks, buses), Non-road
   (forklifts, plant, machinery). None ticked by default.
2. Per ticked type, one compact block: petrol and diesel quantity, each with its unit select (FigureInput, UnpricedNote,
   UnitChangeNote, documents, overrides exactly as today's two fields).
   - Road types: "Typical model year (optional)" under the quantities. US only: "Miles driven (optional)" beside each
     fuel that has a quantity, with the hint "Used for methane and nitrous oxide; without it only CO2 is counted."
   - Non-road: "Equipment" select per fuel with a quantity (the five types), no default; until chosen, that fuel's
     line is an FI1 unpriced line ("Choose the equipment type for {fuel} used in non-road equipment at {site}.").
3. One "Upload fleet fuel records" control for the whole question, as today; the type is chosen at review.

A customer with one van ticks Light, types one diesel figure and is done: three clicks more than today, no required
field beyond the quantity.

## 5. Engine path

- `pickMobile(loc, type, fuel)` replaces the mobile keys in `pickEF`: jurisdiction to publisher file (US EPA, CA ECCC,
  UK DEFRA, EU IPCC with MRR and JEC, AU NGA, NZ MfE), then `selectMobileRow` with the type's model year or equipment
  type, plus the publisher's mobile CO2. The `diesel_mobile_*` and `gasoline_*` keys leave `EF`, `EF_CA`, `EF_UK`,
  `EF_EU`, `EF_AU` and `EF_NZ` (FI9's source test: no mobile key copies a stationary one).
- Units, per publisher, exact or cited only (FI2, FI3, R10): EPA per gallon (litres convert exactly); ECCC per litre;
  DEFRA and MfE per litre; NGA per GJ at Table 9 or Table 8 energy content; IPCC per TJ through MRR NCV and JEC density.
  Mass-basis CH4 and N2O take the inventory's GWP set; CO2-e-printed rows are applied as published (as today).
- `calcLocation` and `buildWorkings` emit one row per type and fuel with a quantity: source "{Fuel} ({type label})",
  stream `mobile`, field the type's amount field. Row note, in this order: publisher and row ("US EPA Hub 2025 Table 4,
  Light-Duty Trucks, Diesel, model year 2007-2022"); why ("Typical model year 2015" / "model year 2024 is after the
  latest published row (2022), so the 2022 row is used" / "Model year not given, so the highest published row for
  light vehicles is used" / "Equipment type: Construction and mining"); and the fallback sentence where it applies.
- US CO2-only: the row prices CO2 from Table 2 and carries `ch4_n2o: 'not_counted'` with the note "Methane and nitrous
  oxide not counted: EPA publishes them per mile, and no miles were given for light-vehicle diesel." The row is a
  priced row, not unpriced; the workings card, PDF and XLSX show the sentence; nothing blocks on it.
- Unpriced (FI1, blocking): a type and fuel with a quantity and no row even after the IPCC fallback (none today); a
  non-road fuel with no equipment type; a legacy figure (section 2).
- `select.ts` gains the latest-row rule: a model year after every tied range takes the row with the latest range.

## 6. Other surfaces that read the two old fields

| File | Change |
|---|---|
| lib/ghg/engine.ts | Location type, `emptyLocation`, `UNIT_FIELDS`, pushFuel lines (3051 to 3054), `FIELD_STREAM`, `FIELD_SWITCH`, `FIELD_NAME`, `DOC_TYPE_FIELDS`, `fieldFor`, the field lists at 3063, 3213, 3308, 3404, 3675, 4363, stream-quantified at 5149, `fuelEmissionsByType` keys |
| app/dashboard/ghg/page.tsx | the fleet block (2583 to 2610); `fuelTypesPresent` (133 to 134) reports `gasoline` and `diesel_mobile` by fuel, unchanged keys, so trends stay comparable; the "has any fuel" check (502); XLSX rows come from workings (no change beyond the new notes) |
| lib/scope3/cat3Inputs.ts | `declaredAndQuantified('mobile')` reads the six amounts; `mobileStream` matches the new source strings ("Petrol (...)", "Diesel (...)") and keeps the old two for saved workings |
| lib/vsme/b3Energy.ts | energy in MWh sums the six fields by fuel (the factor is per fuel, not per type) |
| lib/ghg/monthlyEmissions.ts | `fleet_fuel` classification (182 to 183) takes the proposal's `fleetType` to reach the type's factor |
| lib/ghg/loadMonthly.ts, CoverageStrip.tsx | delivery-fuel handling unchanged in kind; group key gains the type |
| lib/ghg/series.ts | labels (323 to 324): keep "vehicle diesel" and "petrol" by fuel; no per-type split in trends |
| lib/ghg/conciergeDocTypes.ts | no change (fleet_fuel still reads gasoline and diesel) |
| app/api/concierge/extract/route.ts | no change to what is extracted; one sentence added to the gasoline and diesel guidance: "Do not infer the vehicle type." |
| app/verify/[token], lib/assurancePdf.ts | none: both render stored workings; new rows and notes appear as rows |
| results email (lib/email), free calculator (same wizard, entry mode) | none beyond the wizard change; neither reads the fields |
| lib/scope3/scope3SurfacesFixture.ts, test fixtures (11 test files use the old fields) | updated to the new fields |
| app/methodology/page.tsx, policy snapshot, CLAUDE.md | mobile paragraph, dated change entry, invariant "A fleet line is priced only with a mobile factor; a stationary factor is never used for a vehicle." |

## 7. Tests

- Engine, per country: a Light, a Heavy and a Non-road line each price from the publisher's mobile row, by value and
  citation (FI2's cross-publisher test extended to fleet rows), with CO2, CH4 and N2O as the row shows them.
- Source test: no `*_mobile_*` or `gasoline_*` key in any stationary table.
- US: with miles, CH4 and N2O priced per mile; without, CO2 only, the not-counted note, and export not blocked.
- Model year: given and tied; inside the range and untied (highest); after the latest row (latest, labelled).
- Non-road: each equipment type selects its row; no equipment type is an unpriced line naming the fuel and site.
- Legacy: a figure in `gasoline_amount` is an unpriced line; each type button moves it, records the move, and the
  total changes by the expected amount; nothing moves without the action.
- Documents: a `fleet_fuel` proposal with no type cannot be confirmed; with a type it lands on that field; coverage
  per type; changing the type un-confirms.
- Unit changes and country changes on the six fields (FI5), and overrides (T10).
- Category 3, VSME B3 and monthly read the new fields; the scope 3 surface snapshot moves only where expected.
- Engine count only goes up.

## 8. Diffs

- **Diff 2, engine and readers.** Location fields, pricing (`pickMobile`, units, CO2-only), workings rows and notes,
  legacy unpriced line and the move function (engine side), `select.ts` latest-row rule, the field maps, Category 3,
  VSME, monthly classification, series labels, fixtures, tests. The wizard still shows the old two fields during this
  diff, so old entries become legacy lines: acceptable on the branch, not deployable alone.
- **Diff 3, wizard.** The fleet block (section 4), the legacy move buttons, XLSX check, page tests.
- **Diff 4, documents and copy.** `fleetType` on proposals, the review chooser, `fieldFor` and coverage keyed by type,
  the extraction prompt sentence, methodology page and snapshot, CLAUDE.md invariant and count, R16 additions.

Diff 2 is the large one; if it reviews poorly it splits into 2a (fields, maps, legacy line) and 2b (pricing and rows).

## 9. Open choices for Lisa

1. **Miles: per type and fuel (proposed) or per type.** Recommend per type and fuel: EPA's rows are by type and fuel,
   and a single figure for a mixed fleet would need an invented split.
2. **Legacy figures: assign by button (proposed) or clear with a message.** Recommend the button: no typed figure is
   destroyed, and nothing moves without the customer saying which type.
3. **Equipment type: per fuel (proposed) or one per location.** Recommend per fuel: one more select, only shown when
   both fuels are used off road.
4. **One proposal across several types.** Recommend not now: per-type uploads or a typed figure per type with the
   documents as evidence. Splitting one bill's quantity between types needs a ratio only the customer can give, and
   a split editor is a separate design.
5. **Type booleans persisted (proposed) or derived from quantities.** Recommend persisted: a type ticked with no figure
   yet is a real state ("we have trucks, figure to follow") that the declarations gate should see.
6. **US model years after 2022 (ruled above).** Implement with the latest row and its sentence; confirm the wording
   "model year {y} is after the latest published row ({last}), so the {last} row is used."
