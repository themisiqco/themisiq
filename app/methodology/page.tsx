'use client'

import Nav from '../components/Nav'

const GRAD = 'var(--color-brand)'

// A section's content is either one paragraph (42 of the 43 entries, unchanged) or an array of
// them. The renderer used to drop the string straight into a <div>, so newlines collapsed and any
// multi-paragraph text ran together — which is why every entry had been written as a single block
// regardless of how many ideas it carried. An array now maps to <p> elements, spaced the same way
// the disclaimer paragraphs at the foot of this page already are.
function SectionContent({ content }: { content: string | string[] }) {
  if (!Array.isArray(content)) return <>{content}</>
  return (
    <>
      {content.map((para, i) => (
        <p key={i} style={{ margin: i === content.length - 1 ? 0 : '0 0 10px' }}>{para}</p>
      ))}
    </>
  )
}

const METHODOLOGIES = [
  {
    module: 'GHG Inventory — Scope 1 & 2',
    color: '#0F6E56',
    bg: '#E1F5EE',
    standard: 'GHG Protocol Corporate Accounting and Reporting Standard',
    sections: [
      {
        title: 'Primary standard',
        content: 'ThemisIQ follows the GHG Protocol Corporate Accounting and Reporting Standard — the most widely used GHG accounting framework globally, required by SB 253, CDP, ESRS E1, GRI 305, and IFRS S2.',
      },
      {
        title: 'Global Warming Potentials (GWP)',
        content: 'ThemisIQ applies IPCC Sixth Assessment Report (AR6) 100-year GWP values by default — the latest published IPCC set — across CDP, ESRS E1, GRI 305, EcoVadis, and IFRS S2. The one exception is California SB 253, which is reported on IPCC AR4 values for consistency with CARB\'s existing AB 32 / Mandatory Reporting Regulation program. AR6 distinguishes fossil from non-fossil (biogenic) methane (fossil CH₄ GWP 29.8, non-fossil 27.0, N₂O 273); the correct GWP set is applied automatically based on each selected framework and stamped on every export.',
      },
      {
        title: 'Emission factors',
        content: 'Combustion factors are country-matched: US locations use US EPA (2024) factors, Canadian locations use Environment and Climate Change Canada (ECCC) "Emission factors and reference values" v3.0, UK locations use UK DEFRA/DESNZ (2026) Greenhouse Gas Conversion Factors for Company Reporting, and EU member-state locations use the EU Monitoring and Reporting Regulation (Commission Implementing Regulation (EU) 2018/2066), Annex VI Table 1, which carries the IPCC (2006 Guidelines, Vol. 2) Tier 1 defaults as directly applicable EU law. For Canadian locations, natural gas CO₂ is applied per province (ECCC marketable values) and reported in m³ or Mcf. For UK locations, factors follow the DEFRA published basis — natural gas reported in kWh on a gross calorific value basis — so reported combustion figures reconcile directly to DEFRA for SECR assurance; because DEFRA factors embed a fixed GWP basis, UK combustion figures are reported on that basis rather than the user-selected AR4/AR5 set. For EU locations, note that both cited sources publish on a MASS basis — emission factors per terajoule and net calorific values per gigagram of fuel — whereas EU customers record consumption by volume. ThemisIQ therefore converts these factors to a per-litre and per-m³ basis using fuel densities, and those densities are published by neither source. Where a European specification bounds the value we state it as a bound rather than a citation: the diesel density falls within the EN 590 range for automotive diesel sold in the EU (0.820–0.845 kg/L at 15 °C), at its conservative upper end, and the petrol density within the EN 228 range (0.720–0.775 kg/L at 15 °C), near its midpoint. The density used for LPG is not bounded by any European standard we have identified. Every affected calculation row in your workings states the arithmetic applied and says which input is not published by the cited source, so a verifier can see the step rather than infer it. These are also 100% fossil factors and exclude any biofuel-blend adjustment: national blended factors embed the fuel-supply mandate of a single country, which is not an appropriate assumption to apply across 27 member states. Locations outside the US, Canada, UK, and EU fall back to US EPA combustion factors. Electricity factors are location-based and country-matched: eGRID 2023 (US states), ECCC NIR (Canadian provinces), DEFRA 2025 and 2026 (UK, by reporting year), and European Environment Agency 2023 per-country generation intensities (all 27 EU member states). All factors are versioned, country-matched, and cited in exports.',
      },
      {
        title: 'Scope 2 accounting',
        content: 'ThemisIQ supports both location-based and market-based Scope 2 accounting, following the GHG Protocol Scope 2 Guidance dual-reporting requirement (ESRS E1 and GRI 305). Location-based figures use grid-average emission factors. Market-based figures apply a residual-mix emission factor to the electricity NOT covered by a contractual instrument (PPAs, RECs, green tariffs) — rather than deducting contracted volumes from the grid average — so emissions attributable to untracked supply are not understated. Residual-mix factors are sourced from the Association of Issuing Bodies (AIB) European Residual Mixes 2024 for EU member states, and from Green-e (2025 residual mix, 2023 data) combined with US EPA eGRID2023 for US locations, keyed by eGRID subregion. For full-disclosure jurisdictions where no residual mix is published (e.g. Austria), the location-based factor is applied with that treatment disclosed. Every market-based factor is vintage-stamped and cited in exports.',
      },
      {
        title: 'Assurance readiness',
        content: 'All calculation workings are documented per emission source with factor citations, unit conversions, and GWP references — aligned with ISO 14064-3 and ISAE 3410 limited assurance requirements.',
      },
      {
        // The first section on this page whose content is an ARRAY rather than a string. Three
        // paragraphs, because the argument has three parts — the requirement, what the platform
        // does, and the distinction between the two states — and welding them into one block was
        // the only alternative the renderer offered before SectionContent existed.
        title: 'Comparability between reporting years',
        content: [
          'ISO 14064-3:2019 clause 6.3.1.5 requires a verifier to determine whether changes from prior periods that make those periods incomparable have been disclosed by the reporting organisation.',
          'A year whose total omits a location is not comparable with a year that includes it. ThemisIQ therefore does not present such a year as a lower figure. The year is carried through as unknown: no value is plotted, no line is drawn across it, and year-on-year and baseline comparisons that would span it return no result rather than a number.',
          'Two states are distinguished. Excluded means the stored workings record which location was left out and why. Unverifiable means a location cannot be priced today, but the composition of the saved total is unknown. Both withhold the figure; only the first can say what is missing.',
        ],
      },
    ],
  },
  {
    module: 'Scope 3 — Full Value Chain',
    color: '#0F6E56',
    bg: '#E1F5EE',
    standard: 'GHG Protocol Corporate Value Chain (Scope 3) Standard',
    sections: [
      {
        title: 'Primary standard',
        content: 'ThemisIQ follows the GHG Protocol Corporate Value Chain (Scope 3) Accounting and Reporting Standard across all 15 upstream and downstream categories.',
      },
      {
        title: 'Calculation hierarchy',
        content: 'ThemisIQ applies a three-tier data quality hierarchy: (1) Supplier-specific primary data — highest accuracy; (2) Activity-based calculations using industry average factors; (3) Spend-based estimates using DEFRA and Exiobase emission intensity factors. Each category displays its data quality level in all exports.',
      },
      {
        title: 'Category 15 — Financed emissions',
        content: 'Category 15 financed emissions use a PCAF-aligned methodology (Partnership for Carbon Accounting Financials). Current estimates are spend-based (PCAF data-quality tier 5); ThemisIQ is not a PCAF signatory or PCAF-accredited.',
      },
      {
        title: 'Materiality',
        content: 'ThemisIQ applies sector-based materiality screening aligned with GHG Protocol guidance — automatically identifying which categories are likely material for your sector and flagging immaterial categories for exclusion with documented justification.',
      },
    ],
  },
  {
    module: 'CBAM — Carbon Border Adjustment Mechanism',
    color: '#0C447C',
    bg: '#E6F1FB',
    standard: 'Regulation (EU) 2023/956 · IR (EU) 2025/2547 · 2025/2620 · 2025/2621 · 2025/2546 · DR (EU) 2025/2551 (EN ISO/IEC 14065)',
    sections: [
      {
        title: 'What it computes',
        content: 'CBAM requires an EU importer to declare the embedded emissions of each imported good, under the CBAM Regulation (Regulation (EU) 2023/956). ThemisIQ produces the Specific Embedded Emissions (SEE) — the emissions intensity per tonne of a CBAM good that the importer carries into their annual CBAM declaration. Following the embedded-emissions methodology of Implementing Regulation (EU) 2025/2547, SEE is the sum of direct and indirect embedded emissions divided by the net production of the good, expressed in tonnes of CO₂e per tonne: SEE = (direct embedded emissions + indirect embedded emissions) / net production.',
      },
      {
        title: 'Direct & indirect emissions',
        content: 'Direct process emissions are always included. Indirect (electricity) emissions are included only where the regulation requires: for Annex II goods such as iron, steel and aluminium, indirect emissions are reported but excluded from the CBAM certificate obligation, so the certificate-relevant figure is direct-only. For complex goods, the embedded emissions of precursors carry into the finished good\'s SEE.',
      },
      {
        title: 'Data basis',
        content: 'SEE is computed from installation-level actual data. Where you attach a source document to a figure, that link is carried through to the verifier\'s view. Under Article 7(2) of Regulation (EU) 2023/956, as amended by Regulation (EU) 2025/2083, the importer may declare either verified actual values or the default values published in Implementing Regulation (EU) 2025/2621. Defaults carry a mark-up on top of the country figure — 10% for 2026, 20% for 2027 and 30% from 2028 for iron and steel, aluminium, cement and hydrogen; 1% for fertilisers — accounting for installations whose emissions exceed the average for their producer country.',
      },
      {
        title: 'Free allocation & benchmarks',
        content: 'The free-allocation adjustment applies production-route benchmarks set out in Implementing Regulation (EU) 2025/2620.',
      },
      {
        title: 'Verification',
        content: 'All declared embedded emissions require independent third-party verification by an accredited verifier under Implementing Regulation (EU) 2025/2546. Verifier accreditation is governed by Delegated Regulation (EU) 2025/2551, to EN ISO/IEC 14065.',
      },
      {
        title: 'Sector coverage',
        content: 'Available now for iron & steel and aluminium; further CBAM sectors (cement, fertilisers, hydrogen) in active development.',
      },
    ],
  },
  {
    module: 'Climate Risk',
    color: 'var(--color-module-climate)',
    bg: '#FEF3E2',
    standard: 'TCFD · IPCC AR6 · IFRS S2 · ESRS E1',
    sections: [
      {
        title: 'Scenario framework',
        // "available for single-scenario assessments", not "used by the integrated risk engine".
        // Neither half of this section was false, but the adjacency was: a sentence about the
        // frameworks requiring RESILIENCE TESTING ACROSS A RANGE sat immediately before one naming
        // the full SSP/NGFS set, inviting the reading that the resilience run spans both sets. It
        // does not. RESILIENCE_TRIO (lib/materiality.ts) is hardcoded ssp126/ssp245/ssp585 — all-SSP
        // for a monotonic warming range — and every resilience surface already says so correctly.
        // The six-scenario set is what a SINGLE assessment picks one from; the trio is fixed.
        content: 'ThemisIQ supports climate risk assessment across recognised IPCC-aligned warming pathways and NGFS finance-oriented transition scenarios. Both IFRS S2 and CSRD ESRS E1 require testing resilience across a range of scenarios rather than against a single forecast. See the Climate Risk & Materiality methodology below for the full SSP/NGFS scenario set available for single-scenario assessments.',
      },
      {
        title: 'Physical risk data',
        content: 'Physical risk assessments draw on IPCC AR6 Working Group I and II regional findings, peer-reviewed climate science, and published national adaptation plans. Hazard classifications follow IPCC climatic impact-driver categories and TCFD acute/chronic terminology.',
      },
      {
        title: 'Transition risk data',
        // ⚠️ REWRITTEN 19 Aug 2026. WHAT THIS SECTION SAID BEFORE, AND WHY IT WAS WRONG — because
        // the shape of the error is more useful than the correction, and it will recur.
        //
        // It read: "Transition risks are mapped to IEA Net Zero 2050 pathway milestones, EU taxonomy
        // activity classifications, and published regulatory transition timelines. Sector-specific
        // transition risks reflect NGFS scenario narratives and the four TCFD transition-risk
        // categories: policy and legal, technology, market, and reputation."
        //
        // FOUR NAMED SOURCES, THREE OF WHICH ENTER NO CALCULATION. computeTransition() reads exactly
        // five inputs: mr_industries.carbon_exposure, mr_industry_transition_drivers.weight,
        // mr_jurisdictions.policy_intensity (policy driver only), mr_scenarios.transition_mult, and
        // the horizon multiplier. No IEA milestone, no EU taxonomy classification, no NGFS narrative
        // is read anywhere. The only IEA reference in the repo is a unit-conversion constant; every
        // EU Taxonomy reference is in the Deals module.
        //
        // AND "SECTOR-SPECIFIC ... REFLECT NGFS" INVERTED THE ONE THING THAT IS CHECKABLE.
        // transition_mult is a SINGLE SCALAR applied uniformly to all four drivers and every sector,
        // so scenario choice rescales the whole profile and cannot alter its sector shape at all.
        // The sector differentiation comes entirely from the 52 ThemisIQ driver weights, which carry
        // no scenario dimension. The sentence attributed to NGFS the one effect NGFS provably has no
        // hand in, while omitting the real one — that transition_mult genuinely scales the output.
        //
        // ⚠️ THE PART WORTH REMEMBERING: THE DATABASE HAD ALREADY REFUSED THIS ATTRIBUTION.
        // supabase/migrations/20260715_mr_scenarios_provenance.sql, five weeks earlier, upgraded the
        // three SSP rows to 'primary_source' for their LABELS AND DESCRIPTORS ONLY and said so in
        // terms: "What is NOT being sourced: physical_mult / transition_mult. Those are ThemisIQ
        // METHODOLOGICAL choices ... Do not add them." It then left all three NGFS rows at 'starter'
        // with the citation block commented out, reasoning that "asserting a specific citation we
        // cannot verify would be half-right provenance — worse than an honest 'starter'."
        //
        // So the row said 'starter' and the public methodology page said NGFS narratives. A
        // migration author declined to make a claim they could not verify, and it was made anyway,
        // one layer up, where a verifier reads it and no test covers it. Copy is not exempt from
        // provenance: BEFORE NAMING A SOURCE ON THIS PAGE, CHECK WHAT THE REFERENCE ROW CLAIMS FOR
        // ITSELF. If it says 'starter', this page may not say otherwise.
        //
        // What survives is real and is kept deliberately: the engine IS scenario-agnostic, the three
        // NGFS rows carry distinct non-neutral multipliers (orderly 0.8/1.25, disorderly 1.0/1.5,
        // hothouse 1.5/0.5), and selecting one genuinely scales all four transition scores. NGFS
        // supplies the scenario set, its names and its directional logic — not the numbers, and not
        // the sector differentiation.
        content: 'Transition risk is scored across the four TCFD transition-risk categories: policy and legal, technology, market, and reputation. Each category combines the sector\'s carbon exposure with a per-sector weighting for that category and the selected time horizon; policy and legal is additionally scaled by the policy intensity of the jurisdictions selected, since transition exposure follows which regulatory regimes apply rather than where assets sit. The selected scenario then scales all four — choosing an NGFS pathway (Orderly, Disorderly, Hot House) applies that pathway\'s transition multiplier, so transition pressure rises under rapid or abrupt-policy futures and falls under high-warming ones. The per-sector weightings and the scenario multipliers are ThemisIQ methodological defaults, not values published by NGFS or the IPCC; each report identifies them as platform reference values in its data-lineage and provenance sections.',
      },
      {
        title: 'Disclosure alignment',
        content: 'Output is structured to support TCFD four-pillar disclosure (Governance, Strategy, Risk Management, Metrics & Targets), IFRS S2 climate-related disclosures, CSRD ESRS E1 climate change requirements, and California SB 261 climate-related financial risk reporting.',
      },
    ],
  },
  {
    module: 'Climate Risk & Materiality',
    color: 'var(--color-brand)',
    bg: 'var(--color-brand-wash)',
    standard: 'IFRS S2 single materiality · CSRD ESRS double materiality · IPCC AR6 · TCFD',
    sections: [
      {
        title: 'Primary standards',
        content: 'ThemisIQ supports two distinct materiality determination modes kept architecturally separate because they answer fundamentally different questions: IFRS S2 single (financial) materiality — how climate-related risks affect the entity\'s enterprise value, cash flows and access to finance — and CSRD ESRS double materiality, which retains the financial axis and adds impact materiality (how the entity affects people and the environment). Double materiality is operationalised as the union of the two axes: a topic is reportable if material on either.',
      },
      {
        title: 'Risk model',
        content: 'Material climate risk is modelled as the product of four factors. Physical risk = industry sensitivity × IPCC AR6 regional hazard exposure × scenario severity × time horizon. Transition risk = industry carbon exposure × jurisdictional policy intensity × scenario policy-speed × time horizon. Physical and transition geographies are deliberately distinct: physical exposure depends on where assets are; transition exposure depends on which regulatory regimes apply. A risk is flagged only where industry sensitivity intersects with real regional or jurisdictional exposure — preventing common false-positives.',
      },
      {
        title: 'Scenario framework',
        content: 'Scenarios use two public, widely-adopted sets. IPCC Shared Socioeconomic Pathways (SSP1-2.6, SSP2-4.5, SSP5-8.5) provide the warming dimension. NGFS scenarios (Orderly, Disorderly, Hot House) provide a finance-oriented transition dimension. Scenarios carry inverse physical and transition multipliers: high-warming pathways raise physical risk and lower transition pressure; rapid-policy pathways raise transition risk and lower physical pressure. Resilient strategy requires testing across both ends — a disclosable judgment under both IFRS S2 and ESRS.',
      },
      {
        title: 'Geographic and topic frameworks',
        content: 'Physical-risk geography uses the IPCC Sixth Assessment Report (AR6) Working Group I reference regions (Iturbide et al., 2020) — public, climate-science-defined land regions, not country borders. Transition risks use the TCFD four-category classification. The impact-materiality axis (CSRD mode) uses the ten ESRS topical standards: E1–E5 environmental, S1–S4 social, G1 governance.',
      },
      {
        title: 'Scoring scheme',
        content: 'All factor scores are held on simple ordinal scales and combined multiplicatively, then mapped to a 0–10 materiality score and a high/medium/low band. The scheme is intentionally transparent: any flagged risk or material topic can be traced to its inputs. Scoring values are starter values, independently derived from the public frameworks listed and pending entity-specific calibration. Calibration is an ongoing process; the model version active at run time is stamped on every report so users can trace outputs to the specific version that produced them.',
      },
      {
        title: 'Independent derivation',
        content: 'No input layer reproduces or is structured to mirror any licensed proprietary classification. Every weighting and topic mapping is traceable to its public source framework. This is a deliberate design choice documented in the full methodology specification.',
      },
      {
        title: 'Limitations',
        content: 'The Climate Risk & Materiality assessment is a structured screening intended to scope and support a formal IFRS S2 disclosure or CSRD double-materiality assessment. A fully compliant ESRS assessment additionally requires (a) a defined materiality threshold agreed by the entity\'s governance body, and (b) stakeholder engagement informing the impact-materiality axis. The tool produces the prioritisation structure but does not replace either requirement, and outputs are not a substitute for independent professional review prior to publication.',
      },
      {
        title: 'Full specification',
        content: 'The complete published methodology specification — framework basis, full risk model, scoring tables, calibration approach, and limitations — is available as a downloadable PDF for advisors, auditors and assurance providers conducting diligence.',
        download: { href: '/themisiq-materiality-methodology.pdf', label: 'Download methodology PDF (v1.0)' },
      },
    ],
  },
  {
    module: 'Supply Chain & Sustainable Procurement',
    color: 'var(--color-brand)',
    bg: 'var(--color-brand-wash)',
    standard: 'GHG Protocol Scope 3 · CS3D · EcoVadis Framework',
    sections: [
      {
        title: 'Supplier risk scoring',
        content: 'Supplier risk scores combine country-level ESG risk (using World Bank governance indicators and climate vulnerability indices), sector risk (based on GHG Protocol Scope 3 emission intensity and CS3D high-risk sector classifications), and spend-weighted exposure.',
      },
      {
        title: 'Questionnaire frameworks',
        content: 'ThemisIQ questionnaire templates are aligned with EcoVadis assessment methodology (Environment, Labour & Human Rights, Ethics, Sustainable Procurement), the GHG Protocol Scope 3 Category 1 data collection requirements, CS3D Human Rights Due Diligence requirements, and the UK and Australian Modern Slavery Acts.',
      },
      {
        title: 'Scope 3 Category 1',
        content: 'Spend-based estimates use sector-specific emission intensity factors from DEFRA (2023) and Exiobase v3. Supplier-specific data submitted via the portal automatically supersedes spend-based estimates, improving inventory accuracy over time.',
      },
    ],
  },
  {
    module: 'People & Workforce',
    color: '#0C447C',
    bg: '#E6F1FB',
    standard: 'EU Pay Transparency Directive · ESRS S1 · GRI 405',
    sections: [
      {
        title: 'Gender pay gap methodology',
        content: 'ThemisIQ calculates mean and median gender pay gap figures following the EU Pay Transparency Directive (2023/970/EU) methodology — comparing ordinary pay across gender, by job category, and across the organisation. Calculations align with UK Gender Pay Gap Reporting and California Pay Data Reporting requirements.',
      },
      {
        title: 'Disclosure frameworks',
        content: 'Workforce metrics are mapped to ESRS S1 (Own workforce), GRI 401-410 (Labour practices and decent work), SEC Item 101 human capital disclosure requirements, and ISO 45001 occupational health and safety indicators.',
      },
    ],
  },
  {
    module: 'AI Governance',
    color: '#B91C1C',
    bg: '#FCEBEB',
    standard: 'EU AI Act · NIST AI RMF · ISO 42001',
    sections: [
      {
        title: 'Risk classification',
        content: 'AI system classification follows the EU AI Act (Regulation 2024/1689) risk taxonomy: Prohibited (Article 5), High-risk Annex III, Limited risk (transparency obligations), and Minimal risk. Classification logic reflects the European Commission\'s published guidance on Annex III interpretation.',
      },
      {
        title: 'Conformity assessment',
        content: 'High-risk AI system requirements follow EU AI Act Articles 8-15: risk management system, data governance, technical documentation (Article 11), transparency, human oversight, accuracy and robustness. ThemisIQ maps each requirement to specific evidence items.',
      },
      {
        title: 'NIST AI RMF alignment',
        content: 'Governance controls are cross-referenced to the NIST AI Risk Management Framework (AI RMF 1.0) four functions: GOVERN, MAP, MEASURE, MANAGE — enabling dual EU/US framework compliance.',
      },
      {
        title: 'Regulatory status note',
        content: 'ThemisIQ monitors EU AI Act implementation guidance and updates its classification logic as Commission guidance evolves. Regulation (EU) 2026/1744 — published in the Official Journal on 24 July 2026 and in force from 27 July 2026 — replaced Article 113(3)(c) of Regulation (EU) 2024/1689, deferring the high-risk obligations. They now apply from 2 December 2027 for stand-alone systems within Article 6(2) and Annex III, and from 2 August 2028 where the AI is a safety component of a product already covered by the EU product-safety instruments listed in Annex I (Article 6(1)). This supersedes the previous dates of 2 August 2026 and 2 August 2027. Nothing else in the application timetable moved: the Article 5 prohibitions have applied since 2 February 2025 (with the prohibitions added by Regulation (EU) 2026/1744 applying from 2 December 2026), general-purpose AI obligations since 2 August 2025, and the Article 50 transparency obligations retain their original schedule.',
      },
    ],
  },
  {
    module: 'Cyber Governance',
    color: '#B91C1C',
    bg: '#FCEBEB',
    standard: 'NIS2 · DORA · SEC Cyber · NIST CSF 2.0',
    sections: [
      {
        title: 'NIS2 controls',
        content: 'Gap assessment is structured around NIS2 Directive (2022/2555/EU) Article 21 minimum security measures: risk management policies, incident handling, business continuity, supply chain security, network security, access control, cryptography, HR security, MFA, and secure communications.',
      },
      {
        title: 'DORA requirements',
        content: 'DORA (Regulation 2022/2554/EU) ICT risk management requirements are mapped across five pillars: ICT risk management framework, ICT-related incident management, digital operational resilience testing, ICT third-party risk management, and information sharing.',
      },
      {
        title: 'NIST CSF 2.0 alignment',
        content: 'All controls are cross-referenced to NIST Cybersecurity Framework 2.0 six functions: GOVERN, IDENTIFY, PROTECT, DETECT, RESPOND, RECOVER — providing a globally recognised control reference.',
      },
    ],
  },
  {
    module: 'Deals & Investment',
    color: '#0C447C',
    bg: '#E6F1FB',
    standard: 'TCFD · IFRS S2 · SFDR · SBTi',
    sections: [
      {
        title: 'ESG risk screening',
        content: 'Deal-level ESG risk screening combines sector-specific physical and transition climate risks (aligned with TCFD recommendations), regulatory compliance exposure by jurisdiction, and ESG governance factors — producing a weighted risk rating for investment decision support.',
      },
      {
        title: 'Compliance cost estimation',
        content: 'Compliance cost estimates are indicative ranges based on publicly available regulatory implementation cost data, published industry benchmarks, and ThemisIQ practitioner experience. They are not a substitute for professional legal or financial advice.',
      },
      {
        title: 'Framework alignment',
        content: 'Output supports IFRS S2 climate-related financial disclosure requirements, EU SFDR sustainability-related disclosure obligations, and SBTi portfolio coverage target methodologies.',
      },
    ],
  },
]

export default function MethodologyPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      {/* Hero */}
      <section style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '4rem 2.5rem 3rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-ink-muted)', marginBottom: 12 }}>ThemisIQ · Methodologies</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1.25rem', color: '#0d0d0d' }}>
            How ThemisIQ calculates,<br />
            <em style={{ background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>classifies and reports.</em>
          </h1>
          <p style={{ fontSize: 16, color: '#555553', maxWidth: 620, lineHeight: 1.75, fontWeight: 400, marginBottom: '2rem' }}>
            Every number ThemisIQ produces is grounded in a recognised international standard or regulatory framework. We don&apos;t invent methodologies — we implement the ones that matter, correctly, and keep them current.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
            {['GHG Protocol', 'IPCC AR6', 'TCFD', 'IFRS S2', 'CSRD ESRS', 'EU AI Act', 'NIST CSF 2.0', 'PCAF-aligned', 'CS3D', 'CBAM'].map(tag => (
              <span key={tag} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Update cadence notice */}
      <div style={{ background: '#E1F5EE', borderBottom: '0.5px solid rgba(15,110,86,0.2)', padding: '1rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0F6E56', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#0F6E56', fontWeight: 500 }}>Emission factors and regulatory mappings are reviewed and updated annually — or immediately when a material regulatory change occurs. Last reviewed: July 2026.</span>
        </div>
      </div>

      {/* Methodology sections */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '2.5rem' }}>
          {METHODOLOGIES.map(method => (
            <div key={method.module} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ background: method.bg, padding: '1.5rem 2rem', borderBottom: `1px solid color-mix(in srgb, ${method.color} 13%, transparent)` }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: method.color, marginBottom: 6 }}>Module methodology</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{method.module}</div>
                <div style={{ fontSize: 12, color: '#555553', fontWeight: 500 }}>{method.standard}</div>
              </div>
              <div style={{ padding: '1.5rem 2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
                  {method.sections.map(section => (
                    <div key={section.title} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, paddingBottom: 16, borderBottom: '0.5px solid #f3f4f6' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: method.color, lineHeight: 1.4 }}>{section.title}</div>
                      <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, fontWeight: 400 }}>
                        <SectionContent content={section.content} />
                        {(section as any).download && (
                          <div style={{ marginTop: 12 }}>
                            <a
                              href={(section as any).download.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-block',
                                padding: '8px 16px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#fff',
                                background: method.color,
                                textDecoration: 'none',
                              }}
                            >
                              ⬇ {(section as any).download.label}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div style={{ marginTop: '2.5rem', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#555553', marginBottom: 8 }}>Important note</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', lineHeight: 1.7, fontWeight: 400 }}>
            <p style={{ margin: '0 0 10px' }}>This document and all outputs generated through the ThemisIQ platform are provided for informational, screening, planning, and prioritization purposes only. They do not constitute legal, regulatory, accounting, financial, assurance, investment, or other professional advice and do not, by themselves, satisfy any reporting, disclosure, filing, compliance, assurance, or certification obligation under IFRS, ISSB, CSRD, ESRS, SEC, California climate disclosure regulations, or any other framework or jurisdiction.</p>
            <p style={{ margin: '0 0 10px' }}>Platform outputs are dependent upon information provided by users and other third-party sources. ThemisIQ Compliance Inc. does not independently verify such information and makes no representation or warranty, express or implied, regarding the completeness, accuracy, reliability, suitability, or fitness for a particular purpose of any output.</p>
            <p style={{ margin: '0 0 10px' }}>Sustainability-related laws, regulations, standards, guidance, and interpretations continue to evolve. Users remain solely responsible for determining the applicability of regulatory requirements and for obtaining independent legal, accounting, assurance, and other professional advice where appropriate.</p>
            <p style={{ margin: '0 0 10px' }}>Use of the platform does not create a professional-client, advisory, assurance, accounting, consulting, fiduciary, or legal relationship with ThemisIQ Compliance Inc.</p>
            <p style={{ margin: '0 0 10px' }}>To the maximum extent permitted by law, ThemisIQ Compliance Inc., its directors, officers, employees, contractors, and affiliates shall not be liable for any direct, indirect, incidental, consequential, special, punitive, or economic damages arising from the use of, or reliance upon, any platform output.</p>
            <p style={{ margin: '0' }}>ThemisIQ is a software platform and is not an accredited assurance provider, certification body, or regulatory authority.</p>
          </div>
        </div>

        {/* CTA */}
        <div className="tq-band" style={{ marginTop: '2rem', borderRadius: 14, padding: '2rem', textAlign: 'center' as const }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, marginBottom: 8 }}>Questions about our methodologies?</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginBottom: 20 }}>Our team includes practitioners who have applied these frameworks in real reporting contexts.</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            <a href="/trust" style={{ fontSize: 13, fontWeight: 500, padding: '10px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none' }}>How we handle your data →</a>
            <a href="/assess" style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', color: 'var(--color-brand)', border: '0.5px solid var(--color-brand)', textDecoration: 'none' }}>See which frameworks apply to you →</a>
          </div>
        </div>
      </div>
    </div>
  )
}
