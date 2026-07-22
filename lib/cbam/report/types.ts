// lib/cbam/report/types.ts
// Typed contract for the operator's SUMMARY emissions report — IR (EU) 2025/2547 Annex IV §1.2,
// built strictly from §1.2's OWN 16-item list (docs/cbam-annex-iv-verbatim.md §2). Per that doc's
// structural correction (b): §1.2 is independently numbered and reworded from §1.1, so this shape is
// modelled on §1.2's items directly — NOT as a filter/projection over §1.1, a relation that does not
// exist in the source. Item references below use §1.2's parenthesised numbering, e.g. '(2)(c)'.
//
// This file is pure types. The builder (build.ts) and its DB-row inputs live at the seam; nothing
// here touches Supabase — same split as benchmarks.ts / sefa.ts / defaultShare.ts.

// Three-state wrapper for every reportable field. The three states are genuinely distinct on a
// verifier-facing report and must never collapse into one another:
//   • 'value'          — an answer is present.
//   • 'missing'        — no answer yet. Reads as "not computed / operator must supply this."
//   • 'not_applicable' — deliberately absent, and we can say WHY. The reason is REQUIRED: a blank
//                        N/A reads as "not computed", an explicit reason reads as "we know why this
//                        is absent." That difference is a verifier-credibility requirement, not
//                        cosmetics — an unexplained gap invites the question the reason pre-empts.
export type ReportField<T> =
  | { status: 'value'; value: T }
  | { status: 'missing' }
  | { status: 'not_applicable'; reason: string };

// One actionable gap: a required field the operator still has to supply. The builder accumulates
// these so a caller can render a to-do list without walking the whole report tree.
export interface MissingField {
  item: string;    // §1.2 reference, e.g. '(2)(c)'
  field: string;   // human-readable, e.g. 'UN/LOCODE'
  hint?: string;   // where the operator supplies it
}

// ── §1.2 item sub-structures (Part 1: items (1)-(3), (7)-(11)) ───────────────────────────────────

// (1) Identification of the operator. All three parts required.
export interface Item1Operator {
  name: ReportField<string>;            // (1)(a) name of the operator
  registrationNo: ReportField<string>;  // (1)(b) corporate or activity registration number
  address: ReportField<string>;         // (1)(c) full address in English
}

// (2) The installation under verification.
export interface Coordinates {
  latitude: number;
  longitude: number;
}
export interface Item2Installation {
  name: ReportField<string>;             // (2)(a) name of the installation (pre-existing cbam_installations.name)
  cbamRegistryId: ReportField<string>;   // (2)(b) unique installation identifier in the CBAM Registry
  unLocode: ReportField<string>;         // (2)(c) UN/LOCODE of the location
  address: ReportField<string>;          // (2)(d) full address in English
  coordinates: ReportField<Coordinates>; // (2)(e) coordinates of the main emission source
}

// (3) Production processes and routes, with goods per process.
export interface ProcessSummary {
  processId: string;
  route: string | null;   // the CBAM production route carried out
  goods: string[];        // goods (CN codes) produced by this process
}

// (7) Measurable heat imported from / exported to other installations.
export interface Item7Heat {
  imported: ReportField<boolean>;
  exported: ReportField<boolean>;
}

// (8) Zero-rated fuels: whether used, and how applicability is demonstrated. The demonstration is
// conditional on `used` — required when true, not_applicable when false, undetermined when unanswered.
export interface Item8ZeroRatedFuels {
  used: ReportField<boolean>;
  demonstration: ReportField<string>;
}

// (9) Waste gases: produced-and-used, imported, exported. Three INDEPENDENT declarations — a plant
// may import waste gas without producing it, so none gates another (unlike item (11)).
export interface Item9WasteGases {
  producedUsed: ReportField<boolean>;
  imported: ReportField<boolean>;
  exported: ReportField<boolean>;
}

// (10) CO2 capture: whether used, and where it is transferred. transferredTo is conditional on `used`,
// same gate shape as (8)'s demonstration.
export interface Item10Co2Capture {
  used: ReportField<boolean>;
  transferredTo: ReportField<string>;
}

// (11) On-site electricity. `producedOnsite` is the CONDITIONAL GATE (§1.2 (11) is prefaced "where
// electricity is produced inside the installation"): the (a)-(d) sub-flags are required only when it
// is true, not_applicable when it is false, and — when the gate itself is unanswered — undetermined
// alongside it (we cannot assume either branch). See build.ts for the gate logic.
export interface Item11OnsiteElectricity {
  producedOnsite: ReportField<boolean>;      // the gate — always required
  cogeneration: ReportField<boolean>;        // (11)(a) produced by co-generation
  separateGeneration: ReportField<boolean>;  // (11)(b) produced by separate generation
  sourceFossil: ReportField<boolean>;        // (11)(c) produced from fossil sources    (both (c) flags may be true)
  sourceRenewable: ReportField<boolean>;     // (11)(c) produced from renewable sources (both (c) flags may be true)
  exportedFromProcess: ReportField<boolean>; // (11)(d) exported from a production process's system boundaries
}

// Placeholder for §1.2 items built in Part 2. The property is RESERVED in the report shape now so the
// contract is stable, but not populated yet — Part 1's builder omits these (they are optional).
export interface Part2Pending {
  readonly _part2NotYetBuilt: true;
}

// The summary report — one property per §1.2 item. Items (1)-(3) and (7)-(11) are fully typed and
// built in Part 1; items (4)-(6) and (12)-(16) are declared as optional Part2Pending placeholders,
// to be typed and built in Part 2. Optionality is what lets the Part-1 builder return a valid Report12
// without fabricating the items it does not yet compute.
export interface Report12 {
  // ── Part 1 (implemented) ──
  item1_operator: Item1Operator;              // (1)
  item2_installation: Item2Installation;      // (2)
  item3_processes: ReportField<ProcessSummary[]>; // (3)
  item7_heat: Item7Heat;                      // (7)
  item8_zeroRatedFuels: Item8ZeroRatedFuels;  // (8)
  item9_wasteGases: Item9WasteGases;          // (9)
  item10_co2Capture: Item10Co2Capture;        // (10)
  item11_onsiteElectricity: Item11OnsiteElectricity; // (11)

  // ── Part 2 (declared, not yet built) ──
  item4_perGood?: Part2Pending;                    // (4) per-good direct emissions / default share / SEFA
  item5_totalDirect?: Part2Pending;                // (5) total direct emissions of the installation + per process
  item6_indirect?: Part2Pending;                   // (6) indirect emissions (non-Annex-II goods)
  item12_defaultPrecursors?: Part2Pending;         // (12) precursors using default values
  item13_actualPrecursors?: Part2Pending;          // (13) precursors using actual values
  item14_multiPeriodPrecursor?: Part2Pending;      // (14) precursors from different reporting periods
  item15_multiInstallationPrecursor?: Part2Pending; // (15) precursor from multiple installations
  item16_precursorOrigin?: Part2Pending;           // (16) operator/installation of origin of the precursor
}
