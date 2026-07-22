// lib/cbam/report/types.ts
// Typed contract for the operator's SUMMARY emissions report — IR (EU) 2025/2547 Annex IV §1.2,
// built strictly from §1.2's OWN 16-item list (docs/cbam-annex-iv-verbatim.md §2). Per that doc's
// structural correction (b): §1.2 is independently numbered and reworded from §1.1, so this shape is
// modelled on §1.2's items directly — NOT as a filter/projection over §1.1, a relation that does not
// exist in the source. Item references below use §1.2's parenthesised numbering, e.g. '(2)(c)'.
//
// This file is pure types. The builder (build.ts) and its DB-row inputs live at the seam; nothing
// here touches Supabase — same split as benchmarks.ts / sefa.ts / defaultShare.ts.
import type { SefaBenchmarkWorkings } from '../sefaCompute';

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

// ── §1.2 Part 2 item sub-structures (items (4)-(6), (12)-(16)) ───────────────────────────────────

// (4)(c) — the indirect-emissions block, present only for goods NOT in Annex II. For an Annex II good
// all four fields are not_applicable ('Annex II good — direct emissions only').
export interface Item4Indirect {
  actualShare: ReportField<number>;           // share of indirect emissions determined on ACTUAL values
  defaultShare: ReportField<number>;          // share of indirect emissions determined on DEFAULT values
  criteriaConfirmation: ReportField<boolean>; // confirmation the actual-value criteria are met (unbuilt input)
  specificIndirect: ReportField<number>;      // the specific indirect emissions of the good
}

// (4) — per good. Item (4)(b) maps to the direct default share (see defaultShare.ts). (4)(d) imported
// electricity is always not_applicable here (this installation does not import electricity as a good).
export interface Item4Good {
  processId: string;
  cnCode: string | null;
  specificDirect: ReportField<number>;                    // (4)(a) specific direct embedded emissions
  defaultShareDirect: ReportField<number>;                // (4)(b) share for which default values were used
  indirect: Item4Indirect;                                // (4)(c)
  importedElectricity: ReportField<string>;               // (4)(d) — always not_applicable
  sefa: ReportField<number>;                              // (4)(e) specific embedded free allocation
  benchmarkConfirmation: ReportField<SefaBenchmarkWorkings>; // (4)(f) benchmark used + method
}

// (5) — total DIRECT emissions per process, plus the installation-level total (which needs every
// process for the installation and period; see build.ts for the completeness caveat).
export interface Item5TotalDirect {
  perProcess: Array<{ processId: string; totalDirect: ReportField<number> }>;
  installationTotal: ReportField<number>;
}

// (6) — installation-level INDIRECT emissions. not_applicable for an all-Annex-II installation.
export type Item6Indirect = ReportField<number>;

// (12) — a precursor for which DEFAULT values were used.
export interface Item12DefaultPrecursor {
  cnCode: string;                     // (12)(a)
  name: ReportField<string>;          // (12)(b) name of the good — unbuilt input, no field
  originCountry: ReportField<string>; // (12)(c) country of origin, where known and produced off-site
  defaultValue: ReportField<number>;  // (12)(d) the applicable default value
}

// (13) — a precursor for which ACTUAL values were used.
export interface Item13ActualPrecursor {
  cnCode: string;                        // (13)(a)
  name: ReportField<string>;             // (13)(b) name of the good — unbuilt input, no field
  originCountry: ReportField<string>;    // (13)(c) country of origin, where produced off-site
  reportingPeriod: ReportField<number>;  // (13)(d) the precursor's reporting period
  specificDirect: ReportField<number>;   // (13)(e) specific embedded direct emissions
  specificIndirect: ReportField<number>; // (13)(e) specific embedded indirect — unbuilt (spec §10.6)
}

// (16) — the operator and installation of ORIGIN of a precursor (traceability, not calculation).
export interface Item16PrecursorOrigin {
  cnCode: string;
  operatorName: ReportField<string>;      // name of the operator of origin
  installationName: ReportField<string>;  // name of the installation of origin
  cbamRegistryId: ReportField<string>;    // CBAM Registry ID of origin — "if applicable"
  reportingPeriod: ReportField<number>;   // applicable reporting period
}

// (14) and (15) — conditional Article 14 averaging. Never a 'value' in this build: they resolve to
// not_applicable (the triggering condition does not arise) or missing (it does arise, but Article 14
// multi-period / multi-installation averaging is not implemented). ReportField<never> encodes that.
export type Item14MultiPeriod = ReportField<never>;
export type Item15MultiInstallation = ReportField<never>;

// The summary report — one property per §1.2 item. Items (1)-(3), (7)-(11) are Part 1; (4)-(6) and
// (12)-(16) are Part 2. The Part 2 properties remain OPTIONAL: buildSummaryReport populates them only
// when the caller supplies per-good computations, so a Part-1-only slice (no goods) omits them
// exactly as before rather than fabricating empty per-good items.
export interface Report12 {
  // ── Part 1 ──
  item1_operator: Item1Operator;              // (1)
  item2_installation: Item2Installation;      // (2)
  item3_processes: ReportField<ProcessSummary[]>; // (3)
  item7_heat: Item7Heat;                      // (7)
  item8_zeroRatedFuels: Item8ZeroRatedFuels;  // (8)
  item9_wasteGases: Item9WasteGases;          // (9)
  item10_co2Capture: Item10Co2Capture;        // (10)
  item11_onsiteElectricity: Item11OnsiteElectricity; // (11)

  // ── Part 2 ──
  item4_perGood?: Item4Good[];                             // (4)
  item5_totalDirect?: Item5TotalDirect;                    // (5)
  item6_indirect?: Item6Indirect;                          // (6)
  item12_defaultPrecursors?: Item12DefaultPrecursor[];     // (12)
  item13_actualPrecursors?: Item13ActualPrecursor[];       // (13)
  item14_multiPeriodPrecursor?: Item14MultiPeriod;         // (14)
  item15_multiInstallationPrecursor?: Item15MultiInstallation; // (15)
  item16_precursorOrigin?: Item16PrecursorOrigin[];        // (16)
}
