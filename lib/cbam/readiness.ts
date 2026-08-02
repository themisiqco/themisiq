// lib/cbam/readiness.ts
// CBAM readiness content — the pre-flight "what to gather, and who has it" list.
//
// TWO KINDS OF ENTRY, and the distinction is load-bearing:
//
//   DERIVED — one entry per §1.2 requirement the report builder already declares. These
//   join 1:1 to the completeness accumulator on `${item}|${field}`, and readiness.test.ts
//   enforces that join against buildSummaryReport on an empty input. Add a requirement to
//   build.ts without adding an entry here and the test fails. Content cannot drift from
//   the requirement set because the requirement set is not restated here — only annotated.
//
//   DECLARED — inputs that PRODUCE the emissions figures rather than appearing in the
//   report: fuel consumption, fuel composition, production output, CN codes. §1.2 asks
//   for emissions, not for the invoices behind them, so the accumulator is structurally
//   blind to these. They are the hardest half to gather (FP-5) and they have no state,
//   because nothing tracks whether a customer has their gas bill.
//
// COUNTING: do NOT blend the two into one denominator. Derived items count against the
// report's own supplied/required figure — the same number the report page shows. Declared
// items are listed, not counted. Blending would make the readiness count disagree with the
// report count, which is the drift pattern this codebase keeps paying for.
//
// `inferred: true` marks a claim about WHERE data sits inside a customer's organisation.
// Those are inferences from general industrial practice, NOT sourced from the regulation.
// They are the entries most likely to be wrong and the ones worth correcting from real
// customer contact. Regulatory claims carry `sourceRef` instead.

export type HolderGroup =
  | 'company_records'
  | 'plant_operations'
  | 'finance_procurement'
  | 'suppliers'
  | 'customs'
  | 'external_registry';

export interface HolderGroupMeta {
  label: string;
  blurb: string;
  order: number;
}

export const HOLDER_GROUPS: Record<HolderGroup, HolderGroupMeta> = {
  company_records:    { order: 1, label: 'Your own company records',   blurb: 'Things your organisation already knows about itself.' },
  customs:            { order: 2, label: 'Customs documentation',      blurb: 'Your export paperwork, or your customs broker.' },
  plant_operations:   { order: 3, label: 'Plant and production',       blurb: 'Your site or production management — the people who run the process.' },
  finance_procurement:{ order: 4, label: 'Finance and procurement',    blurb: 'Invoices and bills. Usually the fastest route to fuel and electricity quantities.' },
  suppliers:          { order: 5, label: 'Supplier information',       blurb: 'Fuel specifications, and later your precursor suppliers. Longest lead time — start here first.' },
  external_registry:  { order: 6, label: 'Registry identifiers',       blurb: 'Identifiers you look up or apply for, rather than ask a colleague for.' },
};

export interface ReadinessEntry {
  id: string;
  kind: 'derived' | 'declared';
  /** §1.2 item reference. Non-null for derived, null for declared. */
  item: string | null;
  /** Must match the accumulator's `field` EXACTLY for derived entries. */
  field: string | null;
  label: string;
  holder: HolderGroup;
  /** Where this typically lives in a customer's organisation. */
  whereToFind: string;
  /** What a good-enough answer looks like. */
  goodEnough: string;
  /** Why CBAM asks. Null where the §1.2 item is self-explanatory. */
  whyAsked: string | null;
  /** Primary-source citation. Null where none applies. */
  sourceRef: string | null;
  /** True where whereToFind is inferred from general practice, not sourced. */
  inferred: boolean;
}

export const READINESS_ENTRIES: ReadinessEntry[] = [
  // ── DERIVED — 17 entries, joining 1:1 to the accumulator on an empty input ───────────
  { id: 'operator_name', kind: 'derived', item: '(1)(a)', field: 'operator name',
    label: 'Legal name of the operator', holder: 'company_records',
    whereToFind: 'Your company registration or incorporation documents.',
    goodEnough: 'The registered legal name, not a trading name or abbreviation.',
    whyAsked: null, sourceRef: null, inferred: false },

  { id: 'operator_registration_number', kind: 'derived', item: '(1)(b)', field: 'operator registration number',
    label: 'Operator registration number', holder: 'company_records',
    whereToFind: 'Your company registration document. If you have registered in the CBAM Registry, the identifier issued there may be what is wanted here.',
    goodEnough: 'The identifier as issued. Leave blank rather than guessing which number applies.',
    whyAsked: null, sourceRef: null, inferred: true },

  { id: 'operator_address', kind: 'derived', item: '(1)(c)', field: 'operator full address (in English)',
    label: 'Operator address, in English', holder: 'company_records',
    whereToFind: 'Your company registration documents.',
    goodEnough: 'Street, city and country at minimum, rendered in English.',
    whyAsked: null, sourceRef: null, inferred: false },

  { id: 'installation_name', kind: 'derived', item: '(2)(a)', field: 'installation name',
    label: 'Installation name', holder: 'company_records',
    whereToFind: 'The name your organisation uses for the site.',
    goodEnough: 'Consistent with how the site is named on your other documentation.',
    whyAsked: null, sourceRef: null, inferred: false },

  { id: 'cbam_registry_installation_id', kind: 'derived', item: '(2)(b)', field: 'CBAM Registry installation ID',
    label: 'CBAM Registry installation ID', holder: 'external_registry',
    whereToFind: 'Issued when a non-EU operator registers an installation in the CBAM Registry, via the Commission portal for third-country operators.',
    goodEnough: 'Registration is voluntary for third-country operators. If you have not registered, leave this blank — never invent an identifier.',
    whyAsked: 'It lets your EU customer link your data to a registered installation.',
    sourceRef: 'European Commission, CBAM Registry guidance for non-EU installation operators', inferred: false },

  { id: 'un_locode', kind: 'derived', item: '(2)(c)', field: 'UN/LOCODE',
    label: 'UN/LOCODE for the installation', holder: 'external_registry',
    whereToFind: 'The UN/LOCODE for the town or port nearest your installation. Look it up in the UNECE UN/LOCODE directory. Your logistics or shipping team may already use it on freight documents.',
    goodEnough: 'The five-character code, e.g. TRIST.',
    whyAsked: null, sourceRef: null, inferred: true },

  { id: 'installation_address', kind: 'derived', item: '(2)(d)', field: 'installation full address (in English)',
    label: 'Installation address, in English', holder: 'company_records',
    whereToFind: 'The site address, rendered in English.',
    goodEnough: 'Street, city and country at minimum.',
    whyAsked: null, sourceRef: null, inferred: false },

  { id: 'emission_source_coordinates', kind: 'derived', item: '(2)(e)', field: 'main emission source coordinates',
    label: 'Coordinates of the main emission source', holder: 'plant_operations',
    whereToFind: 'Plant engineering, or your environmental permit. Failing that, read it off a mapping tool.',
    goodEnough: 'Latitude and longitude of the principal stack or vent — the main emission source, not the site entrance or the office.',
    whyAsked: null, sourceRef: null, inferred: true },

  { id: 'processes_and_routes', kind: 'derived', item: '(3)', field: 'production processes and routes',
    label: 'Your production processes and their routes', holder: 'plant_operations',
    whereToFind: 'Production management.',
    goodEnough: 'For each CBAM good you produce: which production route makes it (for example blast furnace versus electric arc), and its CN code.',
    whyAsked: 'The route determines which benchmark and which default value apply.',
    sourceRef: null, inferred: false },

  { id: 'heat_imported', kind: 'derived', item: '(7)', field: 'measurable heat imported',
    label: 'Measurable heat imported from other installations', holder: 'plant_operations',
    whereToFind: 'Energy or utilities management.',
    goodEnough: 'Yes or no. Measurable heat is a net heat flow crossing the installation boundary through identifiable pipelines or ducts, carried by a heat transfer medium — steam, hot air, water, oil, liquid metals or salts. It counts if a heat meter IS OR COULD BE installed: an unmetered flow through a pipeline still qualifies, so do not answer No merely because nothing is metered today. Heat generated and used internally is not imported.',
    whyAsked: null, sourceRef: 'IR (EU) 2025/2547 Annex I def (29)-(31)', inferred: false },

  { id: 'heat_exported', kind: 'derived', item: '(7)', field: 'measurable heat exported',
    label: 'Measurable heat exported to other installations', holder: 'plant_operations',
    whereToFind: 'Energy or utilities management.',
    goodEnough: 'Yes or no, on the same definition as imported heat — including the "is or could be metered" test.',
    whyAsked: null, sourceRef: 'IR (EU) 2025/2547 Annex I def (29)-(31)', inferred: false },

  { id: 'zero_rated_fuels', kind: 'derived', item: '(8)', field: 'zero-rated fuels used',
    label: 'Zero-rated fuels used', holder: 'plant_operations',
    whereToFind: 'Energy or process management.',
    goodEnough: 'Yes or no. If yes, you will also be asked to demonstrate why the zero rating applies.',
    whyAsked: null, sourceRef: null, inferred: true },

  { id: 'waste_gases_produced_used', kind: 'derived', item: '(9)', field: 'waste gases produced and used',
    label: 'Waste gases produced and used in the installation', holder: 'plant_operations',
    whereToFind: 'Process engineering.',
    goodEnough: 'Yes or no. A waste gas contains incompletely oxidised carbon and arises from a process reaction rather than from ordinary combustion. Common in integrated steelmaking — coke oven gas, blast furnace gas, converter gas.',
    whyAsked: null, sourceRef: 'IR (EU) 2025/2547 Annex I def (32), def (16)', inferred: false },

  { id: 'waste_gases_imported', kind: 'derived', item: '(9)', field: 'waste gases imported',
    label: 'Waste gases imported from other installations', holder: 'plant_operations',
    whereToFind: 'Process engineering.',
    goodEnough: 'Yes or no.',
    whyAsked: null, sourceRef: null, inferred: true },

  { id: 'waste_gases_exported', kind: 'derived', item: '(9)', field: 'waste gases exported',
    label: 'Waste gases exported to other installations', holder: 'plant_operations',
    whereToFind: 'Process engineering.',
    goodEnough: 'Yes or no.',
    whyAsked: null, sourceRef: null, inferred: true },

  { id: 'co2_capture', kind: 'derived', item: '(10)', field: 'CO2 capture used',
    label: 'CO₂ capture used', holder: 'plant_operations',
    whereToFind: 'Process or environmental management.',
    goodEnough: 'Yes or no. If yes, you will be asked where the captured CO₂ is transferred to.',
    whyAsked: null, sourceRef: null, inferred: true },

  { id: 'onsite_electricity', kind: 'derived', item: '(11)', field: 'on-site electricity generation',
    label: 'Electricity produced inside the installation', holder: 'plant_operations',
    whereToFind: 'Energy management.',
    goodEnough: 'Yes or no. Answering yes opens four follow-up questions about how it is generated and whether it leaves the process boundary — so answer it before you need those.',
    whyAsked: null, sourceRef: null, inferred: true },

  // ── DECLARED — inputs behind the numbers. Not in the accumulator, not counted. ───────
  { id: 'installation_country', kind: 'declared', item: null, field: null,
    label: 'Country of the installation, as a two-letter code', holder: 'company_records',
    whereToFind: 'You already know this. Enter the ISO 3166 alpha-2 code — CA, TR, IN, CN.',
    goodEnough: 'Two uppercase letters. Anything else is rejected.',
    whyAsked: 'It keys both your electricity grid emission factor and the published default value your EU customer would otherwise have to use.',
    sourceRef: 'IR (EU) 2025/2621 Annex I', inferred: false },

  { id: 'cn_codes', kind: 'declared', item: null, field: null,
    label: 'CN code for each good you produce', holder: 'customs',
    whereToFind: 'Your export documentation, or your customs broker.',
    goodEnough: 'Exactly as it appears on your paperwork. Granularity varies by good — some are listed at four digits, others at six or eight. Do not shorten, pad or infer it.',
    whyAsked: 'It selects the benchmark and the default value. A recognised but incorrect CN code produces a confident, badly wrong answer — we have seen sibling codes differ by a factor of two. Never infer or simplify it.',
    sourceRef: null, inferred: false },

  { id: 'production_output', kind: 'declared', item: null, field: null,
    label: 'How much of each good you produced (the activity level)', holder: 'plant_operations',
    whereToFind: 'Production records for the reporting period.',
    goodEnough: 'Net tonnes of each CBAM good produced during the period, per CN code. This is the activity level — the denominator of your specific embedded emissions — so it drives the figure directly. Where you produce the same good by more than one route, the regulation requires one combined figure covering all routes, not one per route.',
    whyAsked: null, sourceRef: 'IR (EU) 2025/2547 Art 1 def (2), Art 4(2), Art 4(6)', inferred: false },

  { id: 'fuel_consumption', kind: 'declared', item: null, field: null,
    label: 'How much of each fuel and carbon-bearing process material you consumed', holder: 'finance_procurement',
    whereToFind: 'Fuel quantities from invoices (finance or procurement) or from meter readings. Process materials — limestone, carbonates, electrodes, alloys, scrap — usually sit in plant or purchasing records rather than on a utility bill, so expect two sources.',
    goodEnough: 'A quantity per source stream for the reporting period, in tonnes, terajoules, or normal cubic metres for gases. A source stream is any fuel, raw material or product giving rise to emissions — not only things you burn. For steel: coke, coal, natural gas, fuel oil, and limestone, magnesite, other carbonates, carbonate ores, electrodes and electrode pastes, scrap, alloys, graphite. For aluminium: electrodes and electrode pastes, soda ash, limestone. Omitting process materials understates direct emissions, sometimes substantially.',
    whyAsked: 'This is the activity data behind your direct emissions. Without it there is no actual figure and your customer falls back to the default.',
    sourceRef: 'IR (EU) 2025/2547 Art 1 def (8) and (12); Annex I §3.13, §3.15, §3.17', inferred: false },

  { id: 'fuel_composition', kind: 'declared', item: null, field: null,
    label: 'Carbon content or emission factor for each fuel', holder: 'suppliers',
    whereToFind: 'Your fuel supplier\'s specification sheet or safety data sheet.',
    goodEnough: 'One of three, per fuel: a carbon content fraction, an emission factor per tonne, or an emission factor per terajoule together with the net calorific value. Do not use a generic published figure if your supplier states one.',
    whyAsked: null, sourceRef: null, inferred: false },

  { id: 'biomass_fraction', kind: 'declared', item: null, field: null,
    label: 'Biomass fraction of each fuel', holder: 'suppliers',
    whereToFind: 'The same fuel specification.',
    goodEnough: 'Zero for ordinary fossil fuels. Only non-zero where you burn a blended or biogenic fuel.',
    whyAsked: null, sourceRef: null, inferred: false },

  { id: 'electricity_consumed', kind: 'declared', item: null, field: null,
    label: 'Electricity consumed', holder: 'finance_procurement',
    whereToFind: 'Utility bills. Sub-meter readings if your plant meters by production line — but these are not required.',
    goodEnough: 'MWh for the reporting period. You do not need a per-process split: where an installation draws from several sources the default is the weighted average across the whole installation. Treating one process separately is an upgrade requiring evidence, not a prerequisite.',
    whyAsked: 'It drives indirect emissions. Reported for steel and aluminium, though excluded from the certificate obligation because both are Annex II goods.',
    sourceRef: 'IR (EU) 2025/2547 Art 9', inferred: false },

  { id: 'steel_grade', kind: 'declared', item: null, field: null,
    label: 'Steel grade (steel goods only)', holder: 'plant_operations',
    whereToFind: 'Production specification.',
    goodEnough: 'Only asked for crude steel and iron & steel products. Ignore it for aluminium.',
    whyAsked: null, sourceRef: null, inferred: false },

  { id: 'precursor_verification_reports', kind: 'declared', item: null, field: null,
    label: 'A verified emissions report from each precursor supplier', holder: 'suppliers',
    whereToFind: 'Each supplier of a CBAM-listed input you use — pig iron, DRI, crude steel, unwrought aluminium. Ask for their verification report, not for a number in an email.',
    goodEnough: 'A verification report issued by an ACCREDITED verifier, covering the reporting period in which the precursor was produced. An unverified figure from a supplier cannot be used. Where no verified report is available, you may use the published default value for that precursor instead. This is the longest-lead item on this list — your supplier may need to engage a verifier before they can answer, so ask first and ask early.',
    whyAsked: 'Precursor emissions carry into your own figure. Without a verification report your customer falls back to the published default, which carries a mark-up.',
    sourceRef: 'IR (EU) 2025/2547 Annex II A.1.4-5', inferred: false },

  { id: 'evidence_documents', kind: 'declared', item: null, field: null,
    label: 'The source document behind each figure', holder: 'company_records',
    whereToFind: 'Wherever the numbers above came from — the invoice, the meter reading, the spec sheet, the production report.',
    goodEnough: 'One document per figure, attached to the figure it supports. Your verifier will ask for these, and gathering them afterwards is much harder than keeping them as you go.',
    whyAsked: null, sourceRef: null, inferred: false },
];

/** Join key to the completeness accumulator. Derived entries only. */
export function readinessKey(item: string, field: string): string {
  return `${item}|${field}`;
}

/** Look up the readiness entry annotating a given accumulator item. */
export function entryForAccumulatorItem(item: string, field: string): ReadinessEntry | undefined {
  return READINESS_ENTRIES.find(
    (e) => e.kind === 'derived' && e.item === item && e.field === field,
  );
}

/** Entries grouped by holder, in display order, empty groups omitted. */
export function groupedEntries(
  entries: ReadinessEntry[] = READINESS_ENTRIES,
): { group: HolderGroup; meta: HolderGroupMeta; entries: ReadinessEntry[] }[] {
  return (Object.keys(HOLDER_GROUPS) as HolderGroup[])
    .map((g) => ({ group: g, meta: HOLDER_GROUPS[g], entries: entries.filter((e) => e.holder === g) }))
    .filter((g) => g.entries.length > 0)
    .sort((a, b) => a.meta.order - b.meta.order);
}
