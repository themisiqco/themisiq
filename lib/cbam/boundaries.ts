// lib/cbam/boundaries.ts
// IR (EU) 2025/2547 Annex I §3 system boundaries, as pure data. Same shape of module as
// benchmarks.ts: no React, no Supabase, no I/O, and no imports from anywhere in this repo.
// Callers render this; nothing here fetches or decides.
//
// PROVENANCE — the only rule that matters in this file. Every string in `provisions` and every
// `heading` is transcribed from docs/reference/ir-2025-2547-annex-i-s3-boundaries.md, which is
// committed alongside this file and is itself an extract of the authentic OJ PDF (pp. 18–26).
// Nothing here is written from memory, and nothing is paraphrased. That is spec §11.15's
// requirement: boundary guidance is transcribed §-by-§ from primary text with the § cited
// inline, because a verifier will cross-check it against the OJ.
//
// STANDING RULE — TRANSCRIBE THE OJ, NOT THE EXTRACT'S RENDERING OF IT. `provisions` and
// `heading` hold the text as the Official Journal PRINTS it, not as the reference file RENDERS
// it. That extract is a reading document and carries two things the OJ does not: markdown
// emphasis (**...**) added by us, and hard line breaks from the extract's wrap width. Strip
// both. Each provision is a single-line string — no markdown, no internal newlines, single
// spaces between words. Wording, punctuation, em-dash bullet markers ('— '), decimal commas
// and spelling stay exactly as printed.
//
// The distinction is what makes this file quotable. A verifier holds the OJ, not our extract,
// so any character we added while making the source readable is a character they will not find
// — and a stray '**' in a quoted provision reads as a transcription error in the one file whose
// whole claim is that it is not one.
//
// A CITE NOTE DESCRIBES THE REGULATION, NEVER OUR IMPLEMENTATION STATE. What a point requires,
// what it conditions, what it is the source of — all fair. Whether we have built it is not, and
// neither is "not implemented", "unbuilt", or a pointer to a workplan track.
//
// The reason is what can adjudicate the claim. A note about the regulation is settled by the
// committed extract sitting next to this file: it is checkable today, it stays true, and a
// reader can verify it without leaving the repo. A note about our implementation state is
// settled only by the codebase, which moves — and nothing here watches it move. Such a note is
// wrong the moment the feature lands, wrong silently, and wrong inside a file whose entire
// claim is that its contents can be trusted verbatim. Implementation state belongs where it is
// tracked: the spec, or a test that fails when it changes.
//
// Blockquote lines in the extract (lines beginning '>') are OUR COMMENTARY, not regulation.
// They are never transcribed into `provisions`. Where such an annotation matters, it belongs in
// a `note` on a Cite or in a code comment, where it is visibly ours.
//
// If text is needed that the reference file does not contain, ADD IT TO THE REFERENCE FILE
// FIRST, from the OJ. Do not supply it here.
//
// SCOPE. Four entries: the cross-sectoral rules and the three aluminium boundaries. The steel
// boundaries (§3.11–§3.16) are in the reference file and are NOT yet transcribed here.
//
// ONE DELIBERATE OMISSION, recorded so it is not mistaken for a transcription error. Each
// boundary section opens with a stem — 'For that production route, direct emissions monitoring
// shall take into account:' (§3.17.2.1, §3.17.2.2) and 'For aluminium products, direct
// emissions monitoring shall take into account:' (§3.18.2). `provisions` holds the bullets and,
// where §3.17.2.2 has one, the lead paragraph; it does not hold the stem. The bullets are
// therefore grammatical continuations, not sentences. A render surface that prints them without
// re-supplying the stem loses 'direct emissions monitoring shall take into account' — which is
// the verb of the whole section. Supply it.

/** Which instrument a citation points into. */
export type Instrument = 'ir_2025_2547' | 'reg_2023_956';

export type AnnexId = 'I' | 'II' | 'III' | 'IV' | 'V';

/**
 * An outbound reference from a boundary section.
 *
 * `publishedAs` is present ONLY where the OJ prints a reference that does not resolve.
 * `annex`/`point` carry the OPERATIVE location — where the text actually is. `publishedAs`
 * records what is PRINTED. Both are kept because a verifier reading the OJ will look for the
 * printed reference and a verifier reading the text will look for the operative one, and
 * silently normalising in either direction leaves one of them unable to follow the trail.
 */
export interface Cite {
  instrument: Instrument;
  annex: AnnexId;
  /** Operative point, e.g. 'B.3.2'. Empty where the section cites an Annex as a whole. */
  point: string;
  publishedAs?: { annex: AnnexId; point: string };
  note?: string;
}

/**
 * A place where ThemisIQ's own codes do not line up 1:1 with what the regulation names.
 *
 * Recorded rather than resolved: the divergence is usually correct (our route split is finer
 * than the boundary text's), but it must be visible, because a verifier comparing our codes
 * against the regulation's vocabulary will otherwise read it as an error.
 */
export interface Divergence {
  kind: 'route_split' | 'category_collapse';
  /** Our codes. */
  ours: string[];
  /** What the regulation names. */
  regulation: string;
  /** Where our divergence comes from. */
  basis: string;
  note: string;
}

export interface BoundaryEntry {
  /** Section number as printed, e.g. '3.17.2.2'. */
  section: string;
  /** Verbatim from the reference file. */
  heading: string;
  /**
   * 'special_provisions' holds the .1 subsections of Annex I §3. Those subsections state rules
   * that determine WHAT FALLS INSIDE a category — thresholds, inclusions, allocations between
   * categories — rather than describing a boundary, so they are a different kind of entry and
   * not a boundary with an empty process list.
   *
   * Two invariants follow. They always carry `processes: null`: a .1 subsection never
   * enumerates boundary processes, and null here means the regulation is silent in the same
   * sense it does everywhere else in this file. And their `categoryCodes` name the categories
   * THE RULE GOVERNS, which may be more than one — a rule that allocates between categories
   * touches every category it allocates to, not just the one whose section it is printed under.
   */
  scope: 'cross_sectoral' | 'category' | 'special_provisions';
  /** Null ONLY when scope is 'cross_sectoral'. */
  categoryCodes: string[] | null;
  /** Null where the category has no routes. */
  routeCodes: string[] | null;
  /** The section's operative text verbatim, one element per printed bullet or paragraph. */
  provisions: string[];
  /**
   * Non-null ONLY where the regulation itself enumerates named processes. Where it does not,
   * this is null — and null means THE REGULATION IS SILENT, not that we have not filled it in.
   * Treating silence as an empty include-list would assert a boundary the text does not draw.
   *
   * `included: null` inside this object means the regulation names exclusions but no inclusions.
   */
  processes: { included: string[] | null; excluded: string[] } | null;
  cites: Cite[];
  divergences: Divergence[];
}

export const BOUNDARIES: BoundaryEntry[] = [
  {
    section: '3.1',
    heading: 'Cross-sectoral rules',
    scope: 'cross_sectoral',
    categoryCodes: null,
    routeCodes: null,
    provisions: [
      'Specific embedded emissions shall be calculated as the emissions of the production process and, for complex goods, the embedded emissions of the precursors to produce the functional unit of the good during the reporting period.',
      'The system boundaries are defined per aggregated goods categories and cover the direct emissions, the indirect emissions from electricity consumption where relevant under Regulation (EU) 2023/956, emitted by all processes directly or indirectly linked to the production processes, and the embedded emissions of precursors, independently of whether these precursors are produced in the installation or acquired from a different installation. In addition to these general rules, the specific details of each aggregated goods category are set out in points 3.2 to 3.19. Any CBAM goods produced by means of a production route not listed in points 3.2 to 3.19 is subject to the cross-sectoral rules described in this point, and to the sector-specific rules if the production route is a combination of the production routes listed in points 3.2 to 3.19.',
      'The purchase and maintenance of infrastructure and equipment are excluded from the system boundaries.',
      'When the production process of complex goods listed in Annex II to Regulation (EU) 2023/956 includes one or more precursors not listed in that Annex, the indirect emissions of those precursors will be included in the calculation of the embedded emissions of the complex goods. When the production process of complex goods not listed in that Annex includes one or more precursors listed in that Annex, the indirect emissions of these precursors will not be included in the calculation of the embedded emissions of the complex goods.',
    ],
    // §3.1 enumerates no named processes — it states general rules and one blanket exclusion.
    // The infrastructure/equipment exclusion is carried in `provisions`, not lifted into
    // `processes`, because it excludes a class of expenditure, not a named process.
    processes: null,
    cites: [
      {
        instrument: 'reg_2023_956',
        annex: 'II',
        point: '',
        note:
          "§3.1 turns on Annex II to Regulation (EU) 2023/956 three times in one paragraph — " +
          "complex goods 'listed in Annex II', precursors 'not listed in that Annex', and the " +
          'converse. The rule is asymmetric in both directions and it governs INDIRECT emissions ' +
          'of precursors, not the process boundary itself. The Annex II list decides which arm ' +
          'applies, and this repo does not hold the text of Regulation (EU) 2023/956 — the ' +
          'reference file covers IR 2025/2547 only. Retrieve it from the OJ before relying on ' +
          'membership of that list; do not infer it.',
      },
    ],
    divergences: [],
  },
  {
    section: '3.11.1',
    heading: 'Special provisions',
    scope: 'special_provisions',
    categoryCodes: ['sintered_ore'],
    routeCodes: null,
    provisions: [
      'This aggregated goods category includes all kinds of iron ore pellet production (for sale of pellets as well as for direct use in the same installation) and sinter production. To the extent covered by CN code 2601 12 00, also iron ores used as precursors for ferro-chromium (FeCr), ferro-manganese (FeMn) or ferro-nickel (FeNi) may be covered.',
    ],
    processes: null,
    cites: [],
    divergences: [],
  },
  {
    section: '3.11.2',
    heading: 'System boundary',
    scope: 'category',
    categoryCodes: ['sintered_ore'],
    // Null, and not an oversight: sintered_ore genuinely has no rows in cbam_production_routes.
    // §3.11.2 names no production route either — it gives one boundary for the category as a
    // whole, unlike §3.13.2 and §3.17.2, which split by route.
    routeCodes: null,
    provisions: [
      'For sintered ore, direct emissions monitoring shall encompass:',
      '— all processes emitting CO2 from process materials such as limestone and other carbonates or carbonate ores;',
      '— all processes emitting CO2 from all fuels including coke, waste gases such as coke oven gas, blast furnace gas or converter gas; directly or indirectly linked to the production process, and materials used for flue gas cleaning.',
    ],
    processes: null,
    cites: [],
    divergences: [],
  },
  {
    section: '3.12.1',
    heading: 'Special provisions',
    scope: 'special_provisions',
    // Two categories: the NPI rule allocates between them by nickel content — greater than 10 %
    // falls here, lower than 10 % falls to pig_iron under §3.13.1.
    categoryCodes: ['ferroalloy', 'pig_iron'],
    routeCodes: null,
    provisions: [
      'This process covers only the production of the alloys identified under CN codes 7202 1, 7202 4 and 7202 6. Other iron materials with significant alloy content such as spiegeleisen are not covered. NPI (nickel pig iron) is included if the nickel content is greater than 10 %.',
      'Where waste gases or other flue gases are emitted without abatement, CO contained in the waste gas shall be considered as the molar equivalent of CO2 emissions.',
    ],
    processes: null,
    cites: [],
    divergences: [
      {
        kind: 'category_collapse',
        ours: ['ferroalloy'],
        regulation:
          'this subsection governs FeMn, FeCr and FeNi, which Annex I Table 1 names as three separate aggregated goods categories',
        basis: 'supabase/migrations/20260716_cbam_reference.sql:43-49',
        note:
          'THE COLLAPSE DOES NOT AFFECT COMPUTATION. Benchmarks key on cn_code and default ' +
          'values on (cn_code, country), so neither ever consults category_code; category_code ' +
          'enters only annex_ii_direct_only, which reference.sql:43-49 documents as safe for ' +
          'these three prefixes. IT DOES AFFECT ANNEX IV REPORTING. Annex IV point 2 requires a ' +
          'different sector-specific parameter per ferroalloy — Mn and carbon, Cr and carbon, ' +
          'Ni and carbon — and one collapsed category cannot express which of the three applies.',
      },
    ],
  },
  {
    section: '3.12.2',
    heading: 'System boundary',
    scope: 'category',
    categoryCodes: ['ferroalloy'],
    routeCodes: ['submerged_arc'],
    provisions: [
      'For FeMn, FeCr and FeNi, direct emissions monitoring shall encompass:',
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions caused by fuel inputs, irrespective of whether they are used for energetic or non-energetic use;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from process inputs such as limestone and from flue gas cleaning;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from the consumption of electrodes or electrode pastes;',
      '— carbon remaining in the product or in slags or wastes is taken into account by using a mass balance method in accordance with point B.3.2 of Annex II.',
    ],
    processes: null,
    cites: [
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.3.2',
        note:
          'The fourth bullet does not merely permit a mass balance — it makes B.3.2 the method ' +
          'by which carbon remaining in the product, slags or wastes is accounted for, so the ' +
          'boundary is incomplete without it.',
      },
    ],
    divergences: [
      {
        kind: 'category_collapse',
        ours: ['ferroalloy'],
        regulation:
          'Annex I Table 1 names FeMn, FeCr and FeNi as three separate aggregated goods categories, which share this single boundary section',
        basis: 'supabase/migrations/20260716_cbam_reference.sql:43-49',
        note:
          'THE COLLAPSE DOES NOT AFFECT COMPUTATION. Benchmarks key on cn_code and default ' +
          'values on (cn_code, country), so neither ever consults category_code; category_code ' +
          'enters only annex_ii_direct_only, which reference.sql:43-49 documents as safe for ' +
          'these three prefixes. IT DOES AFFECT ANNEX IV REPORTING. Annex IV point 2 requires a ' +
          'different sector-specific parameter per ferroalloy — Mn and carbon, Cr and carbon, ' +
          'Ni and carbon — and one collapsed category cannot express which of the three applies. ' +
          'Splitting is therefore a reporting requirement, not a calculation fix, and must not ' +
          'be deferred on the grounds that the numbers come out right.',
      },
    ],
  },
  {
    section: '3.13.1',
    heading: 'Special provisions',
    scope: 'special_provisions',
    // Three categories: the NPI threshold reaches ferroalloy (the other side of §3.12.1's 10 %
    // split), and the hot-metal rule sets where pig iron ends and crude steel begins.
    categoryCodes: ['pig_iron', 'ferroalloy', 'crude_steel'],
    routeCodes: null,
    provisions: [
      "This aggregated goods category includes non-alloyed pig iron from blast furnaces as well as alloy-containing pig irons (e.g., spiegeleisen), irrespective of the physical form (e.g. ingots, granules). NPI (nickel pig iron) is included if the nickel content is lower than 10 %. In integrated steel plants, liquid pig iron ('hot metal') directly charged to the oxygen converter is the product which separates the production process for pig iron from the production process of crude steel. Where the installation does not sell or transfer pig iron to other installations, a joint production process including crude steel can be established making subject to the rules of Article 4.",
    ],
    processes: null,
    cites: [],
    divergences: [],
  },
  {
    section: '3.13.2.1',
    heading: 'Blast furnace route',
    scope: 'category',
    categoryCodes: ['pig_iron'],
    routeCodes: ['blast_furnace'],
    provisions: [
      'For that production route, direct emissions monitoring shall encompass:',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from fuels and reducing agents such as coke, coke dust, coal, fuel oils, plastic wastes, natural gas, wood wastes, charcoal, as well as from waste gases such as coke oven gas, blast furnace gas or converter gas;',
      '— where biomass is used, the provisions of point B.3.3 of Annex II shall be taken into account;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from process materials such as limestone, magnesite, and other carbonates, carbonate ores; materials for flue gas cleaning;',
      '— carbon remaining in the product or in slags or wastes is taken into account by using a mass balance method in accordance with point B.3.2 of Annex II.',
    ],
    processes: null,
    cites: [
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.3.3',
        note:
          'Reached only where biomass is used. B.3.3 sets the CRITERIA for zero-rating biomass ' +
          'emissions — it is a conditional gate, not an automatic zero, and a route claiming ' +
          'biomass without meeting them is claiming a reduction it has not earned.',
      },
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.3.2',
        note:
          'Mass balance for carbon remaining in the product, slags or wastes. The same bullet ' +
          'appears verbatim in §3.13.2.2 — one requirement, two routes.',
      },
    ],
    divergences: [],
  },
  {
    section: '3.13.2.2',
    heading: 'Smelting reduction',
    scope: 'category',
    categoryCodes: ['pig_iron'],
    routeCodes: ['smelting_reduction'],
    // Three of these four bullets are word-for-word identical to §3.13.2.1's. Only the first
    // differs, and only in its waste-gas list: the blast furnace route names 'waste gases such
    // as coke oven gas, blast furnace gas or converter gas', smelting reduction names 'waste
    // gases from the process or converter gas'. Do not deduplicate these entries — the routes
    // are separately named in the source and the one differing bullet is the reason why.
    provisions: [
      // 'For THIS production route', where §3.13.2.1 prints 'For THAT production route'. The
      // one-word difference is the OJ's, not a typo here.
      'For this production route, direct emissions monitoring shall encompass:',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from fuels and reducing agents such as coke, coke dust, coal, fuel oils, plastic wastes, natural gas, wood wastes, charcoal, waste gases from the process or converter gas;',
      '— where biomass is used, the provisions of point B.3.3 of Annex II shall be taken into account;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from process materials such as limestone, magnesite, and other carbonates, carbonate ores; materials for flue gas cleaning;',
      '— carbon remaining in the product or in slags or wastes is taken into account by using a mass balance method in accordance with point B.3.2 of Annex II.',
    ],
    processes: null,
    cites: [
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.3.3',
        note: 'Reached only where biomass is used. Same conditional gate as §3.13.2.1.',
      },
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.3.2',
        note:
          'Mass balance for carbon remaining in the product, slags or wastes.',
      },
    ],
    divergences: [],
  },
  {
    section: '3.14.1',
    heading: 'Special provisions',
    scope: 'special_provisions',
    // Two categories: the joint-production-process rule reaches crude steel.
    categoryCodes: ['dri', 'crude_steel'],
    routeCodes: null,
    provisions: [
      'There is only one production route defined, although different technologies may use different qualities of ores, which may require pelletisation or sintering, and different reducing agents (natural gas, diverse fossil fuels or biomass, hydrogen). Therefore, precursors sintered ore or hydrogen may be relevant. As products, iron sponge, hot briquetted iron (HBI) or other forms of direct reduced iron may be relevant, including DRI which is immediately fed to electric arc furnaces or other downstream processes.',
      'Where the installation does not sell or transfer DRI to other installations, a joint production process including steel can be established making subject to the rules of Article 4.',
    ],
    processes: null,
    cites: [],
    divergences: [],
  },
  {
    section: '3.14.2',
    heading: 'System boundary',
    scope: 'category',
    categoryCodes: ['dri'],
    routeCodes: ['direct_reduction'],
    provisions: [
      'For that production route, direct emissions monitoring shall encompass:',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from fuels and reducing agents such as coal, natural gas, fuel oils, waste gases from the process or converter gas, etc.;',
      '— where biogas or other forms of biomass are used, the provisions of point B.3.3 of Annex II shall be taken into account;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from process materials such as limestone, magnesite, and other carbonates, carbonate ores, materials for flue gas cleaning;',
      '— carbon remaining in the product or in slags or wastes is taken into account by using a mass balance method in accordance with point B.3.2 of Annex III.',
    ],
    processes: null,
    cites: [
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.3.3',
        note:
          'Reached where biogas or other forms of biomass are used — a wider trigger than ' +
          "§3.13.2's 'where biomass is used'. B.3.3 sets the criteria for zero-rating biomass " +
          'emissions, not an automatic zero.',
      },
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.3.2',
        publishedAs: { annex: 'III', point: 'B.3.2' },
        note:
          'THE OJ PRINTS ANNEX III AND THE TEXT IS IN ANNEX II. Annex III has no point B.3.2 — ' +
          'Annex III point B is the calculation of specific embedded emissions of complex goods. ' +
          'The mass balance method is Annex II point B.3.2, which §3.12.2 and §3.13.2 cite ' +
          'correctly for the same rule. §3.15.2.1 and §3.15.2.2 carry the same printed ' +
          'reference. Both locations are kept: annex/point is where the text is, publishedAs is ' +
          'what the OJ says, and a reader following either must be able to arrive.',
      },
    ],
    divergences: [],
  },
  {
    section: '3.15.1',
    heading: 'Special provisions',
    scope: 'special_provisions',
    // Two categories: the rolling split allocates between them. Primary hot-rolling and rough
    // forging yielding CN 7207, 7218 or 7224 stay in crude_steel; all other rolling and forging
    // falls to iron_steel_products.
    categoryCodes: ['crude_steel', 'iron_steel_products'],
    routeCodes: null,
    provisions: [
      'The system boundary shall cover all necessary activities and units for obtaining crude steel:',
      '— if the process starts from hot metal (liquid pig iron), the system boundary shall include the basic oxygen converter, vacuum degassing, secondary metallurgy, argon oxygen decarburisation / vacuum oxygen decarburisation, continuous casting or ingot casting, where relevant hot-rolling or forging, and all necessary auxiliary activities such as transfers, re-heating, and flue gas cleaning;',
      '— if the process uses an electric arc furnace, the system boundary shall include all relevant activities and units such as the electric arc furnace itself, secondary metallurgy, vacuum degassing, argon oxygen decarburisation / vacuum oxygen decarburisation, continuous casting or ingot casting, where relevant hot-rolling or forging, and all necessary auxiliary activities such as transfers, heating of raw materials and equipment, re-heating, and flue gas cleaning;',
      "— only primary hot-rolling and rough shaping by forging to obtain the semi-finished products under CN codes 7207, 7218 and 7224 are included in this aggregated goods category. All other rolling and forging processes are included in the aggregated goods category 'iron or steel products'.",
    ],
    processes: null,
    cites: [],
    divergences: [],
  },
  {
    section: '3.15.2.1',
    heading: 'Basic oxygen steelmaking',
    scope: 'category',
    categoryCodes: ['crude_steel'],
    routeCodes: ['bof'],
    provisions: [
      'For that production route, direct emissions monitoring shall encompass:',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from fuels such as coal, natural gas, fuel oils, waste gases such as blast furnace gas, coke oven gas or converter gas;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from process materials such as limestone, magnesite, and other carbonates, carbonate ores; materials for flue gas cleaning;',
      '— carbon entering the process in scrap, alloys, graphite etc. and carbon remaining in the product or in slags or wastes is taken into account by using a mass balance method in accordance with point B.3.2 of Annex III.',
    ],
    processes: null,
    cites: [
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.3.2',
        publishedAs: { annex: 'III', point: 'B.3.2' },
        note:
          'THE OJ PRINTS ANNEX III AND THE TEXT IS IN ANNEX II. Annex III has no point B.3.2 — ' +
          'Annex III point B is the calculation of specific embedded emissions of complex goods. ' +
          'The mass balance method is Annex II point B.3.2, which §3.12.2 and §3.13.2 cite ' +
          'correctly for the same rule. §3.14.2 and §3.15.2.2 carry the same printed reference. ' +
          'Both locations are kept: annex/point is where the text is, publishedAs is what the OJ ' +
          'says, and a reader following either must be able to arrive.',
      },
    ],
    divergences: [],
  },
  {
    section: '3.15.2.2',
    heading: 'Electric arc furnace',
    scope: 'category',
    categoryCodes: ['crude_steel'],
    routeCodes: ['eaf_dri', 'eaf_scrap'],
    provisions: [
      // 'shall take into account', where §3.15.2.1 prints 'shall encompass'. The OJ's own
      // wording, differing between two adjacent subsections of one section.
      'For that production route, direct emissions monitoring shall take into account:',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from fuels such as coal, natural gas, fuel oils, as well as from waste gases such as blast furnace gas, coke oven gas or converter gas;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from the consumption of electrodes and electrode pastes;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 from process materials such as limestone, magnesite, and other carbonates, carbonate ores; materials for flue gas cleaning;',
      '— carbon entering the process, e.g. in the form of scrap, alloys and graphite, and carbon remaining in the product or in slags or wastes is taken into account by using a mass balance method in accordance with point B.3.2 of Annex III.',
    ],
    processes: null,
    cites: [
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.3.2',
        publishedAs: { annex: 'III', point: 'B.3.2' },
        note:
          'THE OJ PRINTS ANNEX III AND THE TEXT IS IN ANNEX II. Annex III has no point B.3.2 — ' +
          'Annex III point B is the calculation of specific embedded emissions of complex goods. ' +
          'The mass balance method is Annex II point B.3.2, which §3.12.2 and §3.13.2 cite ' +
          'correctly for the same rule. §3.14.2 and §3.15.2.1 carry the same printed reference. ' +
          'Both locations are kept: annex/point is where the text is, publishedAs is what the OJ ' +
          'says, and a reader following either must be able to arrive.',
      },
    ],
    divergences: [
      {
        kind: 'route_split',
        ours: ['eaf_dri', 'eaf_scrap'],
        regulation:
          'Annex I §3.15.2 names two crude steel production routes, basic oxygen steelmaking and electric arc furnace; we hold three',
        basis: 'supabase/migrations/20260718_cbam_route_split_eaf.sql',
        note:
          'The split follows the IR 2025/2620 benchmark distinction between DRI-charged and ' +
          'scrap-charged EAF, not the boundary text. Both our routes share this single boundary ' +
          'section unchanged — the same bullets apply to each, and nothing in §3.15.2.2 varies ' +
          'by charge. The divergence is a benchmark-selection concern, not a boundary one.',
      },
    ],
  },
  {
    section: '3.16.1',
    heading: 'Special provisions',
    scope: 'special_provisions',
    categoryCodes: ['iron_steel_products'],
    routeCodes: null,
    // 'None.' is what the regulation prints, and it is a fact — this category has no special
    // provisions. An empty array would read as untranscribed rather than as transcribed silence.
    provisions: ['None.'],
    processes: null,
    cites: [],
    divergences: [],
  },
  {
    section: '3.16.2',
    heading: 'System boundary',
    scope: 'category',
    categoryCodes: ['iron_steel_products'],
    // Null on both counts: iron_steel_products has no rows in cbam_production_routes, and
    // §3.16 names no route either — one boundary for the category, no route subsections.
    routeCodes: null,
    provisions: [
      'For iron or steel products, direct emissions monitoring shall take into account:',
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from combustion of fuels and process emissions from flue gas treatment, including re-heating, re-melting, casting, hot rolling, cold rolling, forging, annealing, coating, galvanizing, wire drawing, pickling and excluding the following processes: plating, cutting, welding and finishing of iron or steel products.',
    ],
    // FOUR exclusions here; §3.18.2 excludes THREE. PLATING IS EXCLUDED FOR IRON AND STEEL
    // PRODUCTS AND NOT FOR ALUMINIUM PRODUCTS. The include-list is the other asymmetry: eleven
    // named processes here, none at all in §3.18.2. Both differences are in the source text.
    // Do NOT normalise the two entries against each other in either direction — not by adding
    // plating to §3.18.2, and not by dropping it here.
    processes: {
      included: [
        're-heating',
        're-melting',
        'casting',
        'hot rolling',
        'cold rolling',
        'forging',
        'annealing',
        'coating',
        'galvanizing',
        'wire drawing',
        'pickling',
      ],
      excluded: ['plating', 'cutting', 'welding', 'finishing'],
    },
    cites: [],
    divergences: [],
  },
  {
    section: '3.17.1',
    heading: 'Special provisions',
    scope: 'special_provisions',
    categoryCodes: ['primary_aluminium'],
    routeCodes: null,
    provisions: [
      'This aggregated goods category includes non-alloyed as well as alloyed aluminium, in physical form typical for unwrought metals, such as ingots, slabs, billets or granules. In integrated aluminium plants, liquid aluminium directly charged to the production of aluminium products is included, too.',
    ],
    processes: null,
    cites: [],
    divergences: [],
  },
  {
    section: '3.17.2.1',
    heading: 'Primary (electrolytic) smelting',
    scope: 'category',
    categoryCodes: ['primary_aluminium'],
    routeCodes: ['primary_electrolysis'],
    provisions: [
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from the consumption of electrodes or electrode pastes;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from any fuels used (e.g. for drying and pre-heating of raw materials, heating of electrolysis cells, heating required for casting);',
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from any flue gas treatment, from soda ash or limestone if relevant;',
      '— perfluorocarbon emissions caused by anode effects monitored in accordance with point B.7 of Annex II.',
    ],
    // The bullets describe emission SOURCES (electrodes, fuels, flue gas treatment, anode
    // effects), not named processes. §3.17.2.1 enumerates no process list, so this is null.
    processes: null,
    cites: [
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'B.7',
        note:
          'The fourth bullet does not merely mention perfluorocarbons — it makes B.7 the ' +
          'monitoring method for them, so the boundary is incomplete without it. B.7 is ' +
          'transcribed in the reference file (Slope Method, Overvoltage Method, and the CO2e ' +
          'determination).',
      },
    ],
    divergences: [],
  },
  {
    section: '3.17.2.2',
    heading: 'Secondary melting (recycling)',
    scope: 'category',
    categoryCodes: ['primary_aluminium'],
    routeCodes: ['secondary_remelt'],
    provisions: [
      'Secondary melting (recycling) of aluminium uses aluminium scrap as main input. However, where unwrought aluminium from other sources is added, it is treated like a precursor.',
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from any fuels used for drying and pre-heating of raw materials, used in melting furnaces, in pre-treatment of scrap such as de-coating and de-oiling, and combustion of the related residues, and fuels required for casting of ingots, billets or slabs;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from any fuels used in associated activities such as treatment of skimmings and slag recovery;',
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from any flue gas treatment, from soda ash or limestone if relevant.',
    ],
    processes: null,
    cites: [
      {
        instrument: 'ir_2025_2547',
        annex: 'II',
        point: 'F',
        note:
          'THE SOURCE OF SCRAP ZERO-RATING, AND IT IS NOT A BOUNDARY RULE. §3.17.2.2 is itself ' +
          'silent on scrap carbon: read alone it neither zero-rates the scrap input nor charges ' +
          'it. Point F (Monitoring of activity levels) is what does the work, and it does so ' +
          'indirectly — off-spec products, by-products, waste and scrap are excluded from the ' +
          'activity level of the process that PRODUCED them, and zero embedded emissions follow ' +
          "'therefore', as a consequence of that exclusion rather than as a freestanding grant. " +
          'Guidance that says "scrap is zero-rated" without naming the mechanism overstates its ' +
          'own basis and will not survive a verifier asking where the rule comes from. Note also ' +
          "the lead paragraph's own rule: unwrought aluminium added from other sources is " +
          'treated like a precursor.',
      },
    ],
    divergences: [],
  },
  {
    section: '3.18.1',
    heading: 'Special provisions',
    scope: 'special_provisions',
    categoryCodes: ['aluminium_products'],
    routeCodes: null,
    provisions: ['None.'],
    processes: null,
    cites: [],
    divergences: [],
  },
  {
    section: '3.18.2',
    heading: 'System boundary',
    scope: 'category',
    categoryCodes: ['aluminium_products'],
    routeCodes: ['primary_electrolysis', 'secondary_remelt'],
    provisions: [
      '— all processes directly or indirectly linked to the production processes emitting CO2 emissions from combustion of fuels and process emissions from flue gas treatment, excluding the following processes: cutting, welding and finishing of aluminium products.',
    ],
    // The ONE entry here where the regulation names processes, and it names only exclusions —
    // hence `included: null`. §3.18.2 carries no include-list at all, where the steel-products
    // boundary (§3.16.2, not yet transcribed) names eleven processes.
    //
    // THREE exclusions, not four. Steel products exclude plating, cutting, welding and
    // finishing; aluminium products exclude cutting, welding and finishing. PLATING IS EXCLUDED
    // FOR STEEL AND NOT EXCLUDED FOR ALUMINIUM. Do not add it here by analogy — the asymmetry
    // is in the source text and is the single fact a user reasoning from steel will get wrong.
    processes: { included: null, excluded: ['cutting', 'welding', 'finishing'] },
    cites: [],
    divergences: [
      {
        kind: 'route_split',
        ours: ['primary_electrolysis', 'secondary_remelt'],
        regulation:
          'Annex I §3.18 names no production route for aluminium products; the section is a single boundary with no route subsections',
        basis: 'supabase/migrations/20260727_cbam_aluminium_seed.sql:43-47',
        note:
          'The routes are inherited from the unwrought aluminium category so a products ' +
          'declaration can record which upstream route its precursor came from. The boundary ' +
          'text itself does not vary by route — §3.18.2 is one bullet applying to aluminium ' +
          'products however the precursor was made.',
      },
    ],
  },
];
