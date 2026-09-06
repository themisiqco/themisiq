'use client'

// app/dashboard/materiality/report/page.tsx
// ThemisIQ — Printable CSRD double materiality report.
//
// Reads ?id=<uuid> from the URL, fetches the assessment from the authed GET API,
// renders the full report (cover, exec summary, methodology, scenario rationale,
// matrix, materiality table, risk register, limitations, disclaimer).
//
// Print-optimized via @media print CSS: page breaks, white background, no nav.

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'
import { useReportTitle, reportTitle } from '../../../../lib/useReportTitle'
import PaywallCard from '../../../components/PaywallCard'
import { REGION_LABEL } from '../../../../lib/climate/regions'
import { disclaimerParas } from '../../../../lib/disclaimer'
import { reportingPeriodText } from '../../../../lib/reportDates'

// ─── Lookup helpers (labels we don't store on the assessment row) ─────────────

// Article 2(2) of the 2026 delegated act requires the undertaking to STATE which ESRS version it
// applied for a financial year beginning in 2026. That is why this prints on the report's face
// rather than in an appendix, and why a null renders "Not stated" and never an assumed version.
const STANDARD_VERSION_LABEL: Record<string, string> = {
  esrs_2023: 'ESRS (2023), as last amended by Del. Reg. (EU) 2025/1416',
  esrs_2023_reliefs: 'ESRS (2023) with the reliefs permitted by Del. Reg. C(2026) 5010',
  esrs_2026: 'ESRS (2026) — Del. Reg. C(2026) 5010, applied in full',
}

// How the topic names in this report were arrived at, from workings.labelResolution.
//
// EVERY STRING BELOW STATES WHAT WAS OBSERVED, NEVER A CAUSE. "No version-specific topic names
// were resolved" is checkable; "not yet transcribed" would be a guess — an empty result with no
// error is also exactly what a dropped RLS policy looks like, so naming transcription as the
// reason would hide a grants regression behind a plausible sentence. Same discipline as the
// window.open note in CLAUDE.md: report the observation, let the reader diagnose.
//
// The default names are described as "the platform's default names" and are NEVER attributed to
// a standard. They are the pre-versioning labels in mr_esrs_topics, whose provenance is not
// established — printing them under a stated version as if they were that version's wording is
// exactly what this disclosure exists to prevent.
function labelResolutionNote(lr: any): string | null {
  // Absent on records saved before Part 3 shipped — itself an observation, and reported as one.
  if (!lr || typeof lr !== 'object') {
    return 'This assessment predates version-specific topic naming. The topic names shown are the platform\'s default names.'
  }
  switch (lr.source) {
    case 'versioned':
      return null
    case 'versioned_partial':
      return `Version-specific topic names were resolved for ${lr.resolved} of ${lr.resolved + (lr.fallbackTopics?.length ?? 0)} topics. `
        + `The names shown for ${(lr.fallbackTopics ?? []).join(', ')} are the platform's default names, not names taken from the standard version stated above.`
    case 'default_none_resolved':
      return 'No version-specific topic names were resolved for the standard version stated above. The topic names shown are the platform\'s default names.'
    case 'default_fetch_error':
      return 'Version-specific topic names could not be read when this assessment was run. The topic names shown are the platform\'s default names.'
    case 'default_no_version':
      return 'No ESRS standard version was stated for this assessment. The topic names shown are the platform\'s default names.'
    default:
      // An unrecognised source value is itself worth surfacing rather than swallowing.
      return 'The basis for the topic names in this report could not be determined. The names shown may be the platform\'s default names.'
  }
}

// ── How the DISCLOSURE REQUIREMENTS in this report were arrived at, from workings.drResolution ──
//
// A SEPARATE NOTE FROM labelResolutionNote, AND A LOUDER ONE, because the two fallbacks are not
// the same kind of event. A label fallback shows a familiar name attributed to no standard. A
// requirement fallback shows ANOTHER STANDARD'S REQUIREMENTS — and since ESRS (2026) renumbered
// them, the codes collide: 49 exist in both versions with different titles. A reader cannot tell
// the vintage of a row by looking at it, which is exactly why it has to be said in words.
//
// SAME DISCIPLINE AS ITS SIBLING: every string states what was OBSERVED, never a cause. An empty
// result with no error is also what a dropped RLS policy looks like.
//
// The FALLBACK is named as ESRS (2023) explicitly rather than as "the default", because that is
// what it is — a different instrument, not a house style.
function drResolutionNote(dr: any): string | null {
  // Absent on every record saved before Part B. That is an observation, and reporting it is why
  // this is a separate key rather than extra fields on labelResolution: an old record simply has
  // no drResolution, where a widened labelResolution would have been half-populated and
  // indistinguishable from a partial failure.
  if (!dr || typeof dr !== 'object') {
    return 'This assessment predates version-specific disclosure requirements. The requirements below are ThemisIQ\'s ESRS (2023) set as it stood in the platform at the time, and are not attributed to a stated standard version.'
  }
  const fell: string[] = Array.isArray(dr.fallbackTopics) ? dr.fallbackTopics : []
  const unserved: string[] = Array.isArray(dr.unservedTopics) ? dr.unservedTopics : []
  const parts: string[] = []

  // ⚠️ THE MIXED-VINTAGE SENTENCE COMES FIRST AND IS UNCONDITIONAL ON `source`. A roadmap can mix
  // vintages under several source states, and this is the fact a preparer acts on — it must not be
  // reachable only through one branch of a switch.
  if (fell.length > 0) {
    parts.push(
      `The requirements shown for ${fell.join(', ')} are taken from ESRS (2023), not from the standard version stated above. `
      + 'Disclosure-requirement codes were renumbered between the two versions, so a code in those sections may correspond to a different requirement under the version stated.',
    )
  }
  if (unserved.length > 0) {
    parts.push(`No disclosure requirements are held for ${unserved.join(', ')} in any version, so no requirements are listed for ${unserved.length === 1 ? 'it' : 'them'}. That is an absence of stored requirements, not a finding that none apply.`)
  }
  switch (dr.source) {
    case 'versioned':
      break
    case 'versioned_partial':
      break   // the per-topic sentences above already say which topics and how
    case 'default_none_resolved':
      parts.push('No disclosure requirements were held for the standard version stated above, so the requirements below are ESRS (2023) throughout.')
      break
    case 'default_fetch_error':
      parts.push('Version-specific disclosure requirements could not be read when this assessment was run, so the requirements below are ESRS (2023) throughout.')
      break
    case 'default_no_version':
      parts.push('No ESRS standard version was stated for this assessment, so the requirements below are ESRS (2023).')
      break
    default:
      parts.push('The basis for the disclosure requirements in this report could not be determined.')
  }
  // Stated whenever any row lacks a summary, independently of how the version resolved — the two
  // are unrelated facts and a reader needs both.
  if (typeof dr.datapointsMissing === 'number' && dr.datapointsMissing > 0) {
    parts.push(`${dr.datapointsMissing} of ${dr.requirementCount ?? '?'} requirements below carry no datapoint summary. Those rows say so; an absent summary is not an indication that there is nothing to collect.`)
  }
  return parts.length ? parts.join(' ') : null
}

// ── THE QUICK-FIX PHASE-IN, AND WHY IT IS SUPPRESSED UNDER ESRS (2026) ──────────────────────────
//
// WHAT THE BADGE CLAIMS. That a Wave 1 undertaking may DEFER a material topic's disclosures for
// FY2025–2026 under Del. Reg. (EU) 2025/1416, subject to the ESRS 2.17 summary. It was rendering
// UNCONDITIONALLY, so a roadmap stating ESRS (2026) printed it against E4, S2 and S3 — a
// 2025/1416 concept under an instrument 2025/1416 does not amend.
//
// ⚠️ THE SUPPRESSION STANDS, BUT NOT FOR THE REASON IT ORIGINALLY DID — AND THE NEW REASON IS THE
// STRONGER ONE. The first version of this note said the 2026 equivalent could not be established.
// It has since been established, and it EXISTS. The badge is still suppressed, because what cannot
// be established is now something else entirely: whether THIS UNDERTAKING QUALIFIES.
//
//   ESTABLISHED:
//     · A topic-level phase-in DOES exist under ESRS (2026) — ESRS 1 §10.3, ¶125–127 of the
//       adopted Annex I — and it carries forward THE SAME FOUR TOPICS: E4, S2, S3, S4.
//     · It has THREE CATEGORIES with THREE DIFFERENT WINDOWS:
//         · wave-one, >EUR 450m net turnover AND >1,000 employees
//               -> may omit E4/S2/S3/S4 for financial years prior to FY2027
//         · wave-one, NOT exceeding both
//               -> may omit ALL topical standard DRs for financial years prior to FY2027
//         · other undertakings
//               -> may omit E4/S2/S3/S4 for their FIRST TWO financial years of reporting
//     · The 2023-family phase-in is a separate creature: Del. Reg. (EU) 2025/1416, the quick fix,
//       window FY2025–2026. docs/materiality-questionnaire-spec-v5.md §2 and
//       20260815_mr_esrs_subtopics.sql both define 'esrs_2023' as "as last amended by" it, so both
//       2023-family versions inherit it. Two instruments, two windows, four shared topics.
//
//   NOT ESTABLISHED — and this is now the operative gap:
//     · WHETHER THIS UNDERTAKING QUALIFIES FOR ANY OF THE THREE CATEGORIES. Eligibility turns on
//       WAVE-ONE STATUS, NET TURNOVER and AVERAGE EMPLOYEE COUNT. The materiality intake captures
//       NONE of the three — not in the wizard, not on materiality_assessments, not in `workings`.
//       The third category additionally turns on which financial year of reporting the undertaking
//       is in, which is not captured either.
//
// SO THE MODULE CANNOT ASSERT A RELIEF WHOSE CONDITIONS IT CANNOT EVALUATE. That is a rule about
// this module's evidence, not a doubt about the law, and it is why the 2026 badge stays off.
//
// ⚠️ FOR A RELIEF, THE FALSE POSITIVE IS THE DANGEROUS DIRECTION — the opposite of everywhere else
// in this module. A materiality finding withheld in error makes a preparer do work they did not
// have to; a RELIEF asserted in error tells them THEY MAY OMIT A DISCLOSURE. One costs effort, the
// other creates a compliance gap in a filed statement, and only the second is discovered by an
// auditor — after filing. Printing the badge on every 2026 roadmap would assert the first category
// for every undertaking, including the two-thirds of them it does not describe.
//
//   WHAT WOULD CHANGE THIS: capturing wave-one status, net turnover and average employee count.
//   With those three, the 2026 badge becomes assertable — per category, with its own window, and
//   NOT by widening PHASE_IN_VERSIONS, because the 2026 windows differ from the 2025/1416 one and
//   the second category is not topic-scoped at all. THAT IS A WIZARD INTAKE QUESTION, NOT A
//   RENDERING ONE. It is logged below, deliberately unbuilt.
//
// ⚠️ PROVENANCE, AND A LIMIT ON HOW THIS MAY BE CITED. The annex's own footnote to §10.3 still
// reads "[O.P.: please insert the number, the date, the OJ reference and ELI number of that
// Delegated Regulation C(2026) 5010]" — the adopted text HAS NOT YET BEEN PUBLISHED IN THE
// OFFICIAL JOURNAL. Every citation here is to the ADOPTED ACT, never to an OJ reference, and no
// customer-facing string may imply otherwise until that footnote is resolved.
const PHASE_IN_INSTRUMENT = 'Del. Reg. (EU) 2025/1416'
const PHASE_IN_VERSIONS: readonly string[] = ['esrs_2023', 'esrs_2023_reliefs']

// ── LOGGED, NOT BUILT: THE ESRS (2026) TRANSITIONAL OMISSIONS ───────────────────────────────────
//
// Recorded here so the next person starts from the reading rather than from the PDF. NONE of this
// is implemented, NOTHING renders from it, and it must not be wired up piecemeal — the eligibility
// facts above gate all of it, and a half-applied omission set is a relief asserted without its
// conditions, which is the failure this whole block exists to prevent.
//
// TWO KINDS, and they are independent of each other:
//
//   1. TOPIC-LEVEL (ESRS 1 §10.3 ¶125–127) — the three categories above. Scoped to E4/S2/S3/S4
//      except in the second category, which reaches ALL topical standard DRs.
//
//   2. DR-LEVEL, CUTTING ACROSS TOPICS — these do NOT follow the four-topic list and would need
//      their own per-requirement model, keyed on dr_code and financial year:
//         E1-11                            omissible until FY2028; quantitative until FY2030
//         E2-5  substances of concern      until FY2030
//               SVHC                       until FY2028
//         S1-6                             until FY2027
//         S1-7  non-EEA employees          until FY2027
//         S1-10, S1-11, S1-12, S1-13       datapoints, until FY2027
//         S1-14                            until FY2027
//
// ⚠️ THE DR CODES ABOVE ARE 2026 CODES. S1-14 here is 'Work-life balance metrics', NOT the 2023
// 'Health and safety' — the renumbering applies to this list exactly as it applies to everything
// else in this section, and reading it against the 2023 set would defer the wrong requirements.
//
// A model for (2) would live in the requirements table, not here: it is a property of a
// (dr_code, standard_version) pair, which is precisely that table's primary key.

/**
 * Does the quick-fix phase-in badge apply to this assessment at all?
 *
 * Keyed on the version whose REQUIREMENTS WERE SERVED, not on the version the assessment states.
 * Those differ on a fallback, and the badge sits beside the requirement rows — so it has to follow
 * the rows. A 2026 assessment whose S2 fell back to 2023 rows shows 2023 requirements, and the
 * phase-in genuinely does attach to those.
 *
 * A null/absent drResolution is a pre-Part-B record. Those roadmaps are ESRS (2023) throughout —
 * that is what the module printed before requirements were versioned — so the badge stands.
 */
function phaseInApplies(dr: any, topicCode: string): boolean {
  if (!dr || typeof dr !== 'object') return true            // pre-Part-B record: 2023 throughout
  const fell: string[] = Array.isArray(dr.fallbackTopics) ? dr.fallbackTopics : []
  if (fell.includes(topicCode)) return true                 // this topic IS showing 2023 rows
  const resolved: string[] = Array.isArray(dr.resolvedTopics) ? dr.resolvedTopics : []
  if (!resolved.includes(topicCode)) return false           // unserved — no rows, no relief claim
  return PHASE_IN_VERSIONS.includes(dr.standardVersion)
}

// ── THE ROADMAP'S VINTAGE, FROM THE RESOLVED VERSION ────────────────────────────────────────────
// The heading used to read 'Disclosure roadmap' with the vintage hardcoded into the prose beneath
// it. It now names the version whose requirements are actually below it — which is NOT always the
// version the assessment states, because a fallback serves the 2023 rows.
const VERSION_SHORT: Record<string, string> = {
  esrs_2023: 'ESRS (2023)',
  esrs_2023_reliefs: 'ESRS (2023) with reliefs',
  esrs_2026: 'ESRS (2026)',
}
function roadmapVintage(dr: any): string | null {
  if (!dr || typeof dr !== 'object') return VERSION_SHORT.esrs_2023
  const fell = Array.isArray(dr.fallbackTopics) ? dr.fallbackTopics.length : 0
  const resolved = Array.isArray(dr.resolvedTopics) ? dr.resolvedTopics.length : 0
  // MIXED IS NAMED, NOT ROUNDED TO THE MAJORITY. Picking whichever version served more topics
  // would put one standard's name over another standard's rows — the exact substitution the
  // versioning exists to end, moved into the heading.
  if (resolved > 0 && fell > 0) return 'mixed standard versions'
  if (resolved > 0) return VERSION_SHORT[dr.standardVersion] ?? null
  if (fell > 0) return VERSION_SHORT.esrs_2023
  return null                                                // nothing served — claim no vintage
}

const SECTOR_LABEL: Record<string, string> = {
  energy: 'Energy & Utilities', finance: 'Financial Services', realestate: 'Real Estate',
  tech: 'Technology', health: 'Healthcare & Pharma', manuf: 'Industrials & Manufacturing',
  retail: 'Consumer & Retail', agri: 'Agriculture & Food', transport: 'Transport & Logistics',
  extract: 'Mining & Metals', construction: 'Construction & Materials',
  profservices: 'Professional Services', other: 'Other',
}
// REGION_LABEL is imported from lib/climate/regions (the ONE shared region-label map). It used to be
// duplicated inline here; do not re-inline it.
const JURISDICTION_LABEL: Record<string, string> = {
  eu_ets: 'EU (EU ETS)', cbam: 'EU CBAM exposure', uk_ets: 'UK (UK ETS)',
  ca: 'Canada (federal pricing)', us_fed: 'US (federal)', us_ca: 'US — California cap-and-trade',
  cn: 'China (national ETS)', kr: 'South Korea (K-ETS)', jp: 'Japan',
  au: 'Australia (Safeguard)', nz: 'New Zealand (NZ ETS)', ch: 'Switzerland (CH ETS)',
  in: 'India (CCTS)', id: 'Indonesia (ETS)', sg: 'Singapore (carbon tax)',
  za: 'South Africa (carbon tax)', mx: 'Mexico (carbon tax)', cl: 'Chile (carbon tax)',
  tw: 'Taiwan (carbon fee)', kz: 'Kazakhstan (ETS)',
}
const SCENARIO_LABEL: Record<string, { l: string; d: string }> = {
  ssp245: { l: 'IPCC SSP2-4.5', d: '~2.7°C' }, ssp126: { l: 'IPCC SSP1-2.6', d: '~1.8°C' },
  ssp585: { l: 'IPCC SSP5-8.5', d: '~4.4°C' },
  ngfs_orderly: { l: 'NGFS Orderly', d: 'Early policy' },
  ngfs_disorderly: { l: 'NGFS Disorderly', d: 'Late, abrupt' },
  ngfs_hothouse: { l: 'NGFS Hot House', d: 'Limited action' },
}

// ─── Styled bits (print-friendly) ─────────────────────────────────────────────
const GRAD = 'var(--color-brand)'
const SEV = {
  high: { color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  med:  { color: 'var(--color-module-climate)', bg: '#FEF3E2', border: 'var(--color-module-climate)' },
  low:  { color: '#888784', bg: '#f8f7f5', border: '#e8e7e4' },
} as const

// TCFD opportunity descriptions — for the report's climate-opportunities section
const OPPORTUNITY_DESC: Record<string, string> = {
  'Resource efficiency': 'Lower operating costs through more efficient production, materials, transport, and energy use.',
  'Energy source': 'Shifting to low-carbon energy (renewables, PPAs, electrified process heat) and the savings that follow.',
  'Products & services': 'Developing low-emission products or services that meet rising demand for sustainable options.',
  'Markets': 'Accessing new markets and customer segments opened up by the low-carbon transition.',
  'Resilience': 'Strengthening adaptive capacity so the business withstands physical and transition climate pressures.',
}
const OPP_LABEL: Record<string, string> = { high: 'STRONG', med: 'MODERATE', low: 'LIMITED' }

// ── ESRS Set 1 disclosure-requirement map (Commission Delegated Regulation (EU) 2023/2772) ──
// ⚠️ `relief` WAS RENAMED TO `quickFixPhaseIn`, AND THE RENAME IS THE POINT.
//
// TWO DIFFERENT INSTRUMENTS IN THIS CODEBASE ARE CALLED "RELIEFS", and a bare `relief` named
// neither of them:
//
//   1. Del. Reg. (EU) 2025/1416 — the QUICK FIX. A TOPIC-LEVEL PHASE-IN letting Wave 1
//      undertakings defer E4, S2, S3 and S4 for FY2025–2026. That is this flag.
//   2. Del. Reg. C(2026) 5010 — EIGHT NAMED ESRS 1 PARAGRAPH RELIEFS (¶27, ¶32–33, ¶74–75, ¶90,
//      ¶91, ¶92, ¶106, ¶110), which are what standard_version = 'esrs_2023_reliefs' SELECTS.
//      Nothing on this object has ever had anything to do with those.
//
// A reader who met `relief: true` on E4 and `esrs_2023_reliefs` in the same file had no way to
// know they were unrelated. The field now names its instrument; see PHASE_IN_INSTRUMENT below.
//
// `drs` IS NO LONGER RENDERED — the requirements come from the frozen
// workings.disclosureRequirements (Part B). It is retained ONLY because it is the source the
// esrs_2023 rows in mr_esrs_disclosure_requirements were migrated FROM, so deleting it would
// discard the provenance of 61 seeded rows while that seed is still labelled as unverified. Do not
// render from it; lib/materialityDrResolution.test.ts asserts that.
const ESRS_DR_MAP: Record<string, { name: string; quickFixPhaseIn?: boolean; drs: { code: string; title: string; data: string }[] }> = {
  E1: { name: 'Climate change', drs: [
    { code: 'E1-1', title: 'Transition plan for climate change mitigation', data: 'Plan compatibility with limiting warming to 1.5°C; decarbonisation levers (disclosed only where a plan exists)' },
    { code: 'E1-2', title: 'Policies', data: 'Climate change mitigation and adaptation policies' },
    { code: 'E1-3', title: 'Actions and resources', data: 'Key actions, expected GHG reductions, CapEx/OpEx allocated' },
    { code: 'E1-4', title: 'Targets', data: 'GHG reduction targets, base year, milestone/target years, absolute and intensity' },
    { code: 'E1-5', title: 'Energy consumption and mix', data: 'Total energy consumption (MWh); fossil / nuclear / renewable split; energy intensity per net revenue' },
    { code: 'E1-6', title: 'Gross Scopes 1, 2, 3 and total GHG emissions', data: 'Scope 1; Scope 2 (location- and market-based); Scope 3 by category; total GHG; intensity per net revenue' },
    { code: 'E1-7', title: 'GHG removals and carbon credits', data: 'Removals (tCO₂e); carbon credits cancelled or planned' },
    { code: 'E1-8', title: 'Internal carbon pricing', data: 'Schemes applied, prices used, scope of emissions covered' },
    { code: 'E1-9', title: 'Anticipated financial effects', data: 'Monetary exposure from material physical and transition risks; climate-related opportunities' },
  ]},
  E2: { name: 'Pollution', drs: [
    { code: 'E2-1', title: 'Policies', data: 'Policies to prevent and control pollution of air, water and soil' },
    { code: 'E2-2', title: 'Actions and resources', data: 'Actions taken and resources allocated' },
    { code: 'E2-3', title: 'Targets', data: 'Pollution-reduction targets' },
    { code: 'E2-4', title: 'Pollution of air, water and soil', data: 'Emissions of pollutants to air, water, soil (tonnes), by pollutant' },
    { code: 'E2-5', title: 'Substances of concern', data: 'Production/use of substances of concern and of very high concern (tonnes)' },
    { code: 'E2-6', title: 'Anticipated financial effects', data: 'Monetary exposure from pollution-related risks and opportunities' },
  ]},
  E3: { name: 'Water and marine resources', drs: [
    { code: 'E3-1', title: 'Policies', data: 'Water and marine-resources policies' },
    { code: 'E3-2', title: 'Actions and resources', data: 'Actions taken and resources allocated' },
    { code: 'E3-3', title: 'Targets', data: 'Water-related targets' },
    { code: 'E3-4', title: 'Water consumption', data: 'Total water consumption (m³); consumption in water-stressed areas; water intensity per net revenue' },
    { code: 'E3-5', title: 'Anticipated financial effects', data: 'Monetary exposure from water-related risks and opportunities' },
  ]},
  E4: { name: 'Biodiversity and ecosystems', quickFixPhaseIn: true, drs: [
    { code: 'E4-1', title: 'Transition plan and resilience', data: 'Biodiversity transition plan; resilience of the strategy' },
    { code: 'E4-2', title: 'Policies', data: 'Biodiversity and ecosystems policies' },
    { code: 'E4-3', title: 'Actions and resources', data: 'Actions taken and resources allocated' },
    { code: 'E4-4', title: 'Targets', data: 'Biodiversity and ecosystems targets' },
    { code: 'E4-5', title: 'Impact metrics', data: 'Land-use change; state of species and ecosystems' },
    { code: 'E4-6', title: 'Anticipated financial effects', data: 'Monetary exposure from biodiversity-related risks and opportunities' },
  ]},
  E5: { name: 'Resource use and circular economy', drs: [
    { code: 'E5-1', title: 'Policies', data: 'Resource-use and circular-economy policies' },
    { code: 'E5-2', title: 'Actions and resources', data: 'Actions taken and resources allocated' },
    { code: 'E5-3', title: 'Targets', data: 'Resource-use and circular-economy targets' },
    { code: 'E5-4', title: 'Resource inflows', data: 'Materials used (tonnes); share of recycled / renewable inputs' },
    { code: 'E5-5', title: 'Resource outflows', data: 'Products, materials and waste (tonnes); recyclable content; hazardous / non-hazardous waste' },
    { code: 'E5-6', title: 'Anticipated financial effects', data: 'Monetary exposure from resource-related risks and opportunities' },
  ]},
  S1: { name: 'Own workforce', drs: [
    { code: 'S1-1', title: 'Policies', data: 'Own-workforce policies' },
    { code: 'S1-3', title: 'Channels to raise concerns', data: 'Grievance channels and remediation for own workforce' },
    { code: 'S1-4', title: 'Actions', data: 'Actions on material impacts and their effectiveness' },
    { code: 'S1-5', title: 'Targets', data: 'Workforce-related targets' },
    { code: 'S1-6', title: 'Characteristics of employees', data: 'Headcount by gender, country and contract type; turnover' },
    { code: 'S1-14', title: 'Health and safety', data: 'Coverage; recordable work-related injuries, fatalities, and ill-health' },
    { code: 'S1-16', title: 'Remuneration (pay gap)', data: 'Gender pay gap (%); total-remuneration ratio (highest-paid to median)' },
    { code: 'S1-17', title: 'Incidents and complaints', data: 'Discrimination / harassment incidents; severe human-rights incidents' },
  ]},
  S2: { name: 'Workers in the value chain', quickFixPhaseIn: true, drs: [
    { code: 'S2-1', title: 'Policies', data: 'Value-chain-worker policies' },
    { code: 'S2-2', title: 'Engagement', data: 'Processes to engage value-chain workers on impacts' },
    { code: 'S2-3', title: 'Channels to raise concerns', data: 'Grievance channels and remediation' },
    { code: 'S2-4', title: 'Actions', data: 'Actions on material impacts and their effectiveness' },
    { code: 'S2-5', title: 'Targets', data: 'Value-chain-worker targets' },
  ]},
  S3: { name: 'Affected communities', quickFixPhaseIn: true, drs: [
    { code: 'S3-1', title: 'Policies', data: 'Affected-communities policies' },
    { code: 'S3-2', title: 'Engagement', data: 'Processes to engage affected communities on impacts' },
    { code: 'S3-3', title: 'Channels to raise concerns', data: 'Grievance channels and remediation' },
    { code: 'S3-4', title: 'Actions', data: 'Actions on material impacts and their effectiveness' },
    { code: 'S3-5', title: 'Targets', data: 'Community-related targets' },
  ]},
  S4: { name: 'Consumers and end-users', quickFixPhaseIn: true, drs: [
    { code: 'S4-1', title: 'Policies', data: 'Consumer / end-user policies' },
    { code: 'S4-2', title: 'Engagement', data: 'Processes to engage consumers and end-users on impacts' },
    { code: 'S4-3', title: 'Channels to raise concerns', data: 'Grievance channels and remediation' },
    { code: 'S4-4', title: 'Actions', data: 'Actions on material impacts and their effectiveness' },
    { code: 'S4-5', title: 'Targets', data: 'Consumer / end-user targets' },
  ]},
  G1: { name: 'Business conduct', drs: [
    { code: 'G1-1', title: 'Business conduct policies and corporate culture', data: 'Conduct policies; description of corporate culture' },
    { code: 'G1-2', title: 'Management of supplier relationships', data: 'Approach to supplier relationships; payment-practices policy' },
    { code: 'G1-3', title: 'Prevention and detection of corruption and bribery', data: 'Procedures in place; training coverage' },
    { code: 'G1-4', title: 'Confirmed incidents of corruption or bribery', data: 'Number of confirmed incidents; convictions; fines' },
    { code: 'G1-5', title: 'Political influence and lobbying', data: 'Political contributions; lobbying spend' },
    { code: 'G1-6', title: 'Payment practices', data: 'Average time to pay; standard terms; late-payment status' },
  ]},
}

export default function CsrdReportPage() {
  // useSearchParams must be inside a Suspense boundary for Next.js to prerender this page.
  return (
    <Suspense fallback={<Centered>Loading report…</Centered>}>
      <ReportInner />
    </Suspense>
  )
}

function ReportInner() {
  const params = useSearchParams()
  // ⚠️ STAYS ON 'climate-risk', AND THIS IS NOT AN OVERSIGHT.
  // This is the SCREENING's report — the ten-topic matrix produced by the climate-risk wizard at
  // /dashboard/climate-risk. It lives under /dashboard/materiality/ because of a naming accident,
  // not because it belongs to the Materiality Assessment module: nothing here reads a determination, a
  // survey response or a finalisation. Moving this gate to 'double-materiality' would take a
  // climate-risk customer's OWN OUTPUT away from them — they paid for the wizard and this is what
  // the wizard produces.
  // The inconsistency is in the URL, not in the gate. Fix it by moving the route if it ever
  // matters; do not fix it by moving the entitlement.
  const isPaid = useEntitlement('climate-risk')
  const id = params.get('id')
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [a, setA] = useState<any>(null)   // assessment row

  useEffect(() => {
    if (!id) { setError('No assessment id provided.'); setLoading(false); return }
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) { setError('Please sign in to view the report.'); setLoading(false); return }
        const res = await fetch(`/api/materiality/${id}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error || 'Failed to load assessment.'); setLoading(false); return }
        setA(json.assessment); setLoading(false)
      } catch (e: any) {
        setError(e?.message || 'Something went wrong.'); setLoading(false)
      }
    })()
  }, [id])

  // A resilience record has its own report — there is ONE renderer now
  // (app/dashboard/climate-risk/report). Redirect any resilience id there.
  useEffect(() => {
    if (a && (a.results || {}).analysisType === 'resilience' && id) {
      router.replace(`/dashboard/climate-risk/report?id=${id}`)
    }
  }, [a, id, router])

  // Names the saved PDF. Null until the assessment has loaded, and withheld for a resilience record
  // — that one is being redirected to its own report and must not be titled as a materiality one.
  const isResilienceRecord = !!a && (a.results || {}).analysisType === 'resilience'
  useReportTitle(a && !isResilienceRecord
    ? reportTitle(
        a.workings?.disclosure?.legalEntity || a.company_name,
        a.mode === 'csrd' ? 'CSRD Double Materiality Report' : 'IFRS S2 Single Materiality Report',
      )
    : null)

  // WRITTEN OUT RATHER THAN INHERITED. This is the one page the old PaywallCard default actually
  // described correctly — it is the double-materiality report — so the copy below is that default
  // word for word. Spelling it out changes nothing a customer sees; it makes the wording a choice
  // this page made rather than one it happened to receive, which is the whole point of removing
  // the default. `risk` is the shorthand slug for climate-risk on /pricing (LEGACY_PRICING_PAGE_ID).
  if (!isPaid) return (
    <PaywallCard
      title="Unlock the Climate Risk module"
      body="This report is part of the Climate Risk module. Unlock it to view the full double-materiality assessment, generate the CSRD / IFRS S2 report, and download it as a PDF."
      href="/pricing?modules=risk"
    />
  )
  if (loading) return <Centered>Loading report…</Centered>
  if (error) return <Centered>{error}</Centered>
  if (!a) return <Centered>No assessment data.</Centered>

  const result = a.results || {}
  const prov = result.provenance   // provenance roll-up; absent on records saved before provenance shipped
  const physical: any[] = result.physical || []
  const transition: any[] = result.transition || []
  const matrix: any[] = result.matrix || []
  const isCsrd = a.mode === 'csrd'

  const rationale = a.workings?.input ? null : null  // placeholder; we read from saved workings below
  const savedRationale = (a as any).workings?.rationale  // not always present, set in stage-two wizard

  const reportDate = new Date(a.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
  // The ACTUAL scenario the user ran (a.scenario_code). Fall back to the raw code — never a placeholder.
  const scenarioLabel = SCENARIO_LABEL[a.scenario_code]?.l || a.scenario_code
  const scenarioDescriptor = SCENARIO_LABEL[a.scenario_code]?.d

  // Resilience records are rendered by the single canonical report (climate-risk/report); the effect
  // above redirects. Show a placeholder meanwhile — this route no longer has its own resilience renderer.
  if ((a.results || {}).analysisType === 'resilience') {
    return <Centered>Redirecting to the resilience report…</Centered>
  }

  return (
    <div className="report-root" style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#0d0d0d' }}>
      {/* Print button (hidden when printing) */}
      <div className="no-print" style={{ position: 'sticky', top: 0, background: 'var(--color-ink)', color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>ThemisIQ · {isCsrd ? 'CSRD double materiality report' : 'IFRS S2 single materiality report'}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontSize: 13, fontWeight: 500, padding: '8px 20px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer' }}>
            ⬇ Save as PDF (Cmd+P)
          </button>
        </div>
      </div>

      <div className="report-body" style={{ maxWidth: 780, margin: '0 auto', padding: '3rem 3rem 4rem' }}>

        {/* ── COVER ───────────────────────────────────────────────────────── */}
        <section className="page">
          <div style={{ height: 6, background: GRAD, marginBottom: 32, borderRadius: 2 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 12 }}>
            Prepared by ThemisIQ Compliance Inc.
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px', color: '#0d0d0d' }}>
            {isCsrd ? 'Double Materiality Screening Report' : 'Climate Risk & Scenario Analysis Report'}
          </h1>
          <p style={{ fontSize: 15, color: '#555553', marginBottom: 36, lineHeight: 1.6 }}>
            {isCsrd
              ? 'CSRD / ESRS — financial and impact materiality screening across the ten ESRS topical standards.'
              : 'IFRS S2 — single (financial) materiality screening for climate-related risks and opportunities.'}
          </p>
          <div style={{ borderTop: '1px solid #e8e7e4', borderBottom: '1px solid #e8e7e4', padding: '20px 0', marginBottom: 24 }}>
            <Row k="Legal entity" v={a.workings?.disclosure?.legalEntity || 'Not specified'} />
            <Row k="Reporting period" v={reportingPeriodText(a.reporting_period_start, a.reporting_period_end, a.workings?.disclosure?.reportingPeriod)} />
            <Row k="Primary sector" v={SECTOR_LABEL[a.industry_code] || a.industry_code} />
            <Row k="Operating regions (IPCC AR6)" v={(a.region_codes || []).map((c: string) => `${REGION_LABEL[c] || c} (${c})`).join(', ') || '—'} />
            <Row k="Policy jurisdictions" v={(a.jurisdiction_codes || []).map((c: string) => JURISDICTION_LABEL[c] || c).join(', ') || '—'} />
            <Row k="Scenario tested" v={`${SCENARIO_LABEL[a.scenario_code]?.l || a.scenario_code} (${SCENARIO_LABEL[a.scenario_code]?.d || ''})`} />
            <Row k="Time horizon" v={`${a.horizon} term`} />
            <Row k="Asset profile" v={a.asset_profile} />
            {/* Art. 2(2) disclosure — on the report's FACE, not in an appendix. A null is a real
                state ("not stated"), never an assumed version: an assumed one would be a false
                statement about which law was applied, which is worse than an absent one.
                CSRD ONLY. An IFRS S2 run produces no ESRS matrix and is not an ESRS filing, so an
                ESRS version line on it would be a disclosure about a standard the document does
                not report under — noise at best, misleading at worst. The column is still written
                (null) for s2 records; it is simply not a fact that report has to state. */}
            {isCsrd && <Row k="ESRS standard version" v={STANDARD_VERSION_LABEL[a.standard_version] || 'Not stated'} />}
            <Row k="Model version" v={a.model_version || result.modelVersion || '—'} />
            <Row k="Assessment date" v={reportDate} />
          </div>
          {/* Rendered only when the topic names are not fully version-resolved. A fallback that is
              invisible is indistinguishable from a correct resolve — and with a standard version
              printed directly above, an unannounced default would read as that standard's own
              wording. See labelResolutionNote: it states what was observed, never a cause.
              CSRD ONLY, for the same reason as the row above: it explains where ESRS TOPIC names
              came from, and an s2 report has no topic table for it to explain. */}
          {/* ── Period / ESRS-version disagreement, AS RECORDED AT WRITE ───────────────────────
              Read straight from workings.disclosure.periodVersionCheck — deliberately NOT
              re-derived here. The rule can change; what this assessment found cannot, and a report
              re-run months later must reprint the finding it was written with.

              Absent on every record saved before 18 Aug 2026, which is why the optional chain
              simply yields nothing rather than a "could not be checked" note: those records were
              never checked, and saying so on the cover would read as a defect in the assessment
              rather than as the date the check shipped.

              'conflict' only. 'ok' needs no words; 'not_stated' is already visible from the two
              rows above; and 'unparseable' belongs to a free-text API caller, not to this cover. */}
          {isCsrd && a.workings?.disclosure?.periodVersionCheck?.status === 'conflict' && (
            <p style={{ fontSize: 11, color: '#555553', lineHeight: 1.6, margin: '0 0 12px', padding: '10px 12px', background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-module-climate) 30%, transparent)', borderRadius: 8 }}>
              <strong style={{ color: '#0d0d0d' }}>Reporting period and standard version.</strong>{' '}
              {a.workings.disclosure.periodVersionCheck.message}{' '}
              {a.workings.disclosure.periodVersionCheck.certainty === 'inferred' && (
                <>This is read from the scope of Article 2(1) rather than from a prohibition in terms.{' '}</>
              )}
              Both are stated here as the undertaking supplied them; neither has been altered.
            </p>
          )}
          {isCsrd && labelResolutionNote(a.workings?.labelResolution) && (
            <p style={{ fontSize: 11, color: '#555553', lineHeight: 1.6, margin: '0 0 24px', padding: '10px 12px', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8 }}>
              <strong style={{ color: '#0d0d0d' }}>Topic naming.</strong>{' '}
              {labelResolutionNote(a.workings?.labelResolution)}
            </p>
          )}
        </section>

        {/* ── EXECUTIVE SUMMARY ─────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Executive summary</H>
          <p style={p}>
            This {isCsrd ? 'double materiality' : 'single materiality'} screening identifies climate-related risks and {isCsrd ? 'sustainability topics' : 'transition exposures'} that are likely to be material for{' '}
            <strong>{a.company_name || SECTOR_LABEL[a.industry_code] || 'the entity'}</strong>{' '}
            under the {SCENARIO_LABEL[a.scenario_code]?.l} pathway over the {a.horizon} term.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isCsrd ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 12, margin: '18px 0' }}>
            <Stat label="High physical risks" val={result.summary?.physicalHigh ?? 0} color="#B91C1C" bg="#FCEBEB" />
            <Stat label="High transition risks" val={result.summary?.transitionHigh ?? 0} color="var(--color-module-climate)" bg="#FEF3E2" />
            {isCsrd && <Stat label="Topics material on both axes" val={result.summary?.topicsBothAxes ?? 0} color="#7425e3" bg="#EDE9FE" />}
          </div>
          <h3 style={h3}>Key findings</h3>
          <ul style={ul}>
            {physical.filter(p => p.band === 'high').slice(0, 3).map((p, i) => (
              <li key={'phf'+i} style={li}>Physical risk: <strong>{p.hazard}</strong> is material (high band, score {p.score}) — driven by exposure in <strong>{p.drivingRegion}</strong>.</li>
            ))}
            {transition.filter(t => t.band === 'high').slice(0, 2).map((t, i) => (
              <li key={'trf'+i} style={li}>Transition risk: <strong>{t.driver}</strong> is material (high band) under the chosen scenario and jurisdictions.</li>
            ))}
            {isCsrd && matrix.filter(m => m.quadrant === 'both').slice(0, 4).map((m, i) => (
              <li key={'mf'+i} style={li}>{m.code} <strong>{m.label}</strong> is material on <strong>both axes</strong> (financial {m.financial.toFixed(1)} / impact {m.impact.toFixed(1)}).</li>
            ))}
            {physical.filter(p => p.band === 'high').length === 0 && transition.filter(t => t.band === 'high').length === 0 && (
              <li style={li}>No <em>high-band</em> risks were flagged at this combination of industry, geography and scenario. Medium-band items below still warrant review.</li>
            )}
          </ul>
        </section>

        {/* ── METHODOLOGY ───────────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Methodology and basis</H>
          <p style={p}>
            This screening combines four public, independently-sourced frameworks. No proprietary or licensed third-party classification is reproduced.
          </p>
          <h3 style={h3}>Timing of the analysis</h3>
          <p style={p}><strong>Scenario analysis carried out:</strong> {reportDate}.<br /><strong>Reporting period covered:</strong> {reportingPeriodText(a.reporting_period_start, a.reporting_period_end, a.workings?.disclosure?.reportingPeriod)}.</p>
          <p style={p}>IFRS S2 permits climate-related scenario analysis to be refreshed on the entity&rsquo;s strategic planning cycle rather than annually. The materiality conclusions drawn from it must be reassessed and disclosed in every annual reporting period. ESRS E1 likewise requires the materiality assessment to be current for the reporting period.</p>
          <h3 style={h3}>Frameworks</h3>
          <ul style={ul}>
            <li style={li}><strong>IPCC AR6 WGI reference regions</strong> — the 20 land regions used here are drawn from the Sixth Assessment Report Working Group I reference-region set (Iturbide et al., 2020), each with its characteristic profile of climatic impact-drivers.</li>
            <li style={li}><strong>IPCC climatic impact-drivers</strong> — the physical hazards (extreme heat, drought, water stress, inland flooding, coastal flooding, wildfire, storms/cyclones, cold/permafrost) follow the AR6 climatic-impact-driver categories.</li>
            <li style={li}><strong>TCFD transition risk categories</strong> — transition risks follow the Task Force on Climate-related Financial Disclosures classification: policy and legal, technology, market, and reputation.</li>
            {isCsrd && <li style={li}><strong>ESRS topical standards</strong> — the impact-materiality axis assesses the ten ESRS topical standards (E1–E5 environment, S1–S4 social, G1 governance).</li>}
            <li style={li}><strong>Scenario pathways</strong> — both IPCC Shared Socioeconomic Pathways (SSP1-2.6, SSP2-4.5, SSP5-8.5) and NGFS scenarios (Orderly, Disorderly, Hot House) are available; this screening uses {SCENARIO_LABEL[a.scenario_code]?.l}.</li>
          </ul>
          <h3 style={h3}>Risk model</h3>
          <p style={p}>
            <strong>Physical risk</strong> is computed as industry sensitivity × regional hazard exposure × scenario severity × time-horizon multiplier. A risk is flagged only where industry sensitivity and regional hazard exposure intersect — preventing the common error of flagging, for example, drought for any agricultural entity regardless of where it operates.
          </p>
          <p style={p}>
            <strong>Transition risk</strong> is computed as industry carbon exposure × jurisdictional policy intensity × scenario policy-speed × time-horizon multiplier. Transition geography (policy jurisdictions) is deliberately distinct from physical geography (IPCC regions): physical exposure depends on where assets and hazards are; transition exposure depends on which policy regimes apply.
          </p>
          {isCsrd && (
            <>
              <h3 style={h3}>Impact materiality (inside-out)</h3>
              <p style={p}>
                <strong>Double materiality</strong> combines single (financial) materiality and impact materiality: <em>double materiality = financial + impact</em>. The financial (outside-in) axis uses the engine above; the climate (E1) financial score is taken directly from the physical + transition computation.
              </p>
              <p style={p}>
                The impact (inside-out) axis assesses how the undertaking's own activities affect people and the environment across the ten ESRS topics. Under ESRS, impact materiality is a function of the <strong>severity</strong> of an impact — its scale, scope, and irremediability — and, for potential impacts, its <strong>likelihood</strong>. Each topic starts from a sector baseline and is refined by the preparer's self-assessment; a topic is material where it is significant on the impact axis, the financial axis, or both.
              </p>
            </>
          )}
          <h3 style={h3}>Scenario inversion</h3>
          <p style={p}>
            Physical and transition risk move in opposite directions across scenarios: high-warming pathways raise physical risk and lower transition pressure; rapid- or abrupt-policy pathways raise transition risk and lower physical pressure. A resilient strategy must hold up across both ends, which is why both frameworks require testing resilience across a range rather than against a single forecast.
          </p>
        </section>

        {/* ── SCENARIO RATIONALE ─────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Scenario selection and rationale</H>
          <p style={p}>
            <strong>Pathway used:</strong> {SCENARIO_LABEL[a.scenario_code]?.l} ({SCENARIO_LABEL[a.scenario_code]?.d}).
          </p>
          <p style={p}>
            {savedRationale?.scenario || 'A middle pathway (SSP2-4.5, ~2.7°C) was selected as a reasonable central case for first-pass screening. Higher- or lower-warming pathways can be tested to assess resilience across a range.'}
          </p>
          <p style={p}>
            <strong>Time horizon used:</strong> {a.horizon} term.
          </p>
          <p style={p}>
            {savedRationale?.horizon || 'A medium-term horizon (to 2040) was selected as the default screening lens. Companies with long-lived physical assets may prefer the long-term view; near-term commitments may benefit from the short-term view.'}
          </p>
          <p style={p}>
            Under both IFRS S2 and CSRD/ESRS, the choice of scenarios used and the rationale for that choice are themselves disclosable. This section documents that judgment.
          </p>
          <h3 style={h3}>Scenario selection and relevance</h3>
          <p style={p}>This assessment runs a single scenario — {scenarioLabel}{scenarioDescriptor ? ` (${scenarioDescriptor})` : ''} — selected by the user. It is not tailored to your entity.</p>
          <p style={p}>Both IFRS S2 22(b)(i) and ESRS E1 require an entity to explain why its chosen scenario is relevant to it, and IFRS S2 further requires that a diverse range of scenarios, including one aligned with the latest international agreement on climate change, be used to assess climate resilience. A single pathway does not meet that requirement.</p>
          <p style={p}>A formal assessment should (a) select scenarios that stress the specific hazards and jurisdictions identified in this screening, (b) include a Paris-aligned pathway, and (c) state that reasoning. Scenario selection is a matter for management. The Resilience Analysis in this module runs a diverse three-scenario trio and should be used where a resilience conclusion is required.</p>
        </section>

        {/* ── MATRIX (CSRD only) ─────────────────────────────────────────── */}
        {isCsrd && matrix.length > 0 && (
          <section className="page" style={{ marginTop: 48 }}>
            <H>Double materiality matrix</H>
            <p style={p}>
              Each ESRS topic is plotted on the two axes — financial materiality (vertical) and impact materiality (horizontal). Topics in the top-right quadrant are material on both axes and represent the highest reporting and management priority.
            </p>
            <Matrix topics={matrix} />
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: '#555553' }}>
              {[['#A32D2D', 'Material on both'], ['var(--color-module-climate)', 'Material on one axis'], ['#888784', 'Lower priority']].map(([c, l]) => (
                <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}</span>
              ))}
            </div>
          </section>
        )}

        {/* ── MATERIALITY TABLE (CSRD) ───────────────────────────────────── */}
        {isCsrd && matrix.length > 0 && (
          <section className="page" style={{ marginTop: 48 }}>
            <H>Materiality determination — all topics</H>
            <p style={p}>
              All ten ESRS topical standards, with their financial and impact materiality scores (0–10) and band. Sorted by maximum of the two axes.
            </p>
            <MatrixTable topics={matrix} />
          </section>
        )}

        {/* ── DISCLOSURE ROADMAP (CSRD) ──────────────────────────────────── */}
        {isCsrd && matrix.length > 0 && (
          <>
            <section className="page" style={{ marginTop: 48 }}>
              {/* ITEM 1 — THE VINTAGE IS IN THE HEADING, DRIVEN BY WHAT WAS SERVED.
                  It used to be hardcoded into the prose below, which is how it came to contradict
                  the tables. roadmapVintage reads the frozen drResolution, so the heading cannot
                  name a version the rows beneath it do not come from. Null on an empty roadmap:
                  a heading claims a vintage only when there are rows to have one. */}
              <H>{roadmapVintage(a.workings?.drResolution)
                ? `Disclosure roadmap — ${roadmapVintage(a.workings?.drResolution)}`
                : 'Disclosure roadmap'}</H>
              <p style={p}>
                Each topic determined material above triggers a defined set of ESRS disclosure requirements. This roadmap maps those topics to the requirements ESRS Set 1 attaches to them, so <strong>{a.company_name || SECTOR_LABEL[a.industry_code] || 'the entity'}</strong> can see what these screening conclusions point to — turning <em>what is material</em> into <em>what to scope for collection and reporting</em>. It does not determine what the entity must file; applicability is the entity's own determination, made on its own facts. The key disclosure requirements are shown per topic; the full set within each topical standard applies.
              </p>
              <p style={p}>
                Two cross-cutting elements always apply regardless of which topics are material: <strong>ESRS 2 General disclosures</strong> (governance, strategy, and the IRO-1 / IRO-2 / SBM-3 disclosures that document this materiality process), and the minimum disclosure requirements on policies, actions, targets and metrics (MDR-P / A / T / M) referenced within each topic below.
              </p>
              {/* ITEM 2 — THE PROVENANCE PARAGRAPH, REWRITTEN.
                  WHAT IT USED TO SAY, AND WHY IT HAD TO GO: "Mapped to ESRS Set 1 (Commission
                  Delegated Regulation (EU) 2023/2772) … ThemisIQ tracks both." Printed directly
                  above 2026 requirements it was simply false — one hardcoded sentence asserting a
                  2023 mapping over rows resolved against whatever version the assessment stated.
                  "ThemisIQ tracks both" was a product claim standing in for a provenance
                  statement, and it was the only thing in the section that could not be checked
                  against the record.
                  WHAT REPLACES IT IS ONLY WHAT THE RECORD SUPPORTS: which version served the rows,
                  that they were frozen at run time, and — for the 2023 rows specifically — that
                  they are ThemisIQ's own curated set rather than the instrument's text. That last
                  clause is not modesty; the migration header records the 2023 fidelity as
                  UNVERIFIED, and a report that cites them as the regulation would launder that. */}
              <p style={{ ...p, fontSize: 11, color: '#888784' }}>
                The requirements listed below are those held for{' '}
                <strong>{roadmapVintage(a.workings?.drResolution) ?? 'the standard version stated above'}</strong>,
                resolved when this assessment was run and stored with it — so this roadmap reprints the
                requirements as they stood on that date rather than as they stand today. Disclosure-requirement
                codes were renumbered between ESRS (2023) and ESRS (2026), so a code alone does not identify a
                requirement across versions.
                {' '}Requirements shown for ESRS (2023) are ThemisIQ&rsquo;s own summary set, not a transcription
                of Commission Delegated Regulation (EU) 2023/2772, and do not cover every requirement in that
                instrument. Requirements shown for ESRS (2026) are taken from the adopted text of Del. Reg.
                C(2026) 5010, Annex I.
              </p>
              {/* The phase-in sentence moved OUT of the paragraph above and is conditional on the
                  same predicate as the badges. Printing it unconditionally described a relief that
                  does not attach to the version served — see phaseInApplies. */}
              {matrix.some((t: any) => ESRS_DR_MAP[t.code]?.quickFixPhaseIn && phaseInApplies(a.workings?.drResolution, t.code)) && (
                <p style={{ ...p, fontSize: 11, color: '#888784' }}>
                  Topics marked &ldquo;FY25&ndash;26 phase-in&rdquo; may be phased in for FY2025&ndash;2026 under
                  the quick-fix amendment, {PHASE_IN_INSTRUMENT}, subject to the ESRS 2.17 summary disclosure
                  where the topic is material.
                </p>
              )}
              {/* ⚠️ SHOWN WHERE THE BADGE IS NOT, AND IT IS NOT THE SAME SENTENCE.
                  The earlier version of this said an ESRS (2026) equivalent "is not established" —
                  which was true when written and is now FALSE: it exists, at ESRS 1 §10.3
                  ¶125–127, over the same four topics. What is not established is whether THIS
                  undertaking qualifies, because eligibility turns on wave-one status, net turnover
                  and average employee count and this assessment collects none of them.
                  Saying so is materially different from silence: a preparer who may in fact be
                  entitled to omit E4/S2/S3/S4 needs to know the relief exists and that this report
                  is not the thing that decides it. Withholding that would be its own false
                  negative — and the one place this module can afford neither direction is where it
                  has no evidence at all, so it states the position instead of picking a side.
                  Cited to the ADOPTED ACT: the annex's §10.3 footnote still carries an unresolved
                  "[O.P.: please insert … the OJ reference …]", so there is no OJ citation to give. */}
              {roadmapVintage(a.workings?.drResolution) === VERSION_SHORT.esrs_2026 && (
                <p style={{ ...p, fontSize: 11, color: '#888784' }}>
                  ESRS (2026) provides its own transitional omissions for biodiversity (E4), value-chain
                  workers (S2), affected communities (S3) and consumers and end-users (S4), at ESRS 1
                  §10.3 (paragraphs 125&ndash;127 of the adopted Annex I), together with further omissions
                  for individual disclosure requirements. Eligibility and the length of the window depend
                  on the undertaking&rsquo;s reporting wave, its net turnover, its average number of employees
                  and how many years it has been reporting. This assessment does not collect those facts, so
                  no transitional omission is applied or implied here &mdash; the requirements below are listed
                  in full. Confirm your eligibility against the standard before omitting any of them.
                </p>
              )}
            </section>
            {/* Stated BEFORE the tables, because it governs every row in them. A reader who has
                already worked through the roadmap has relied on it. */}
            {drResolutionNote(a.workings?.drResolution) && (
              <section className="page" style={{ marginTop: 0 }}>
                <p style={{ ...p, fontSize: 11, color: '#854F0B', background: '#FAEEDA', border: '0.5px solid #EF9F27', borderRadius: 6, padding: '10px 12px' }}>
                  {drResolutionNote(a.workings?.drResolution)}
                </p>
              </section>
            )}
            <DisclosureRoadmap matrix={matrix} requirements={a.workings?.disclosureRequirements} drResolution={a.workings?.drResolution} />
          </>
        )}

        {/* ── RISK REGISTER ──────────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Risk register</H>
          <h3 style={h3}>Physical risks</h3>
          <p style={p}><em>Industry sensitivity × regional hazard exposure × scenario × horizon. Flagged only where industry sensitivity meets real regional hazard exposure.</em></p>
          {physical.length > 0 ? (
            <table style={tbl}>
              <thead><tr style={trh}><th style={th}>Hazard</th><th style={th}>Severity</th><th style={th}>Driving region</th><th style={th}>Score</th></tr></thead>
              <tbody>
                {physical.map((p, i) => (
                  <tr key={'pr'+i} style={tr}>
                    <td style={td}>{p.hazard}</td>
                    <td style={td}><Pill band={p.band} /></td>
                    <td style={td}>{REGION_LABEL[p.drivingRegion] || p.drivingRegion} ({p.drivingRegion})</td>
                    <td style={td}>{p.score == null ? 'N/A' : p.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ ...p, color: '#888784' }}>No material physical risks flagged at this intersection of industry, region and scenario.</p>
          )}
          <h3 style={{ ...h3, marginTop: 28 }}>Transition risks</h3>
          <p style={p}><em>Industry carbon exposure × jurisdictional policy intensity × scenario policy-speed × horizon.</em></p>
          <table style={tbl}>
            <thead><tr style={trh}><th style={th}>Driver</th><th style={th}>Severity</th></tr></thead>
            <tbody>
              {transition.map((t, i) => (
                <tr key={'tr'+i} style={tr}>
                  <td style={td}>{t.driver}</td>
                  <td style={td}><Pill band={t.band} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── CLIMATE OPPORTUNITIES ──────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Climate opportunities</H>
          <p style={p}><em>TCFD opportunity categories × industry × scenario. The upside view that IFRS S2 and the ESRS anticipated-financial-effects disclosures ask for alongside risk.</em></p>
          {(result.opportunities || []).length > 0 ? (
            <table style={tbl}>
              <thead><tr style={trh}><th style={th}>Opportunity</th><th style={th}>Relevance</th><th style={th}>Description</th></tr></thead>
              <tbody>
                {(result.opportunities || []).map((o: any, i: number) => (
                  <tr key={'op'+i} style={tr}>
                    <td style={td}>{o.label}</td>
                    <td style={td}><span style={{ background: '#E1F5EE', color: '#0F6E56', border: '0.5px solid #0F6E56', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{OPP_LABEL[o.band] || String(o.band).toUpperCase()}</span></td>
                    <td style={td}>{OPPORTUNITY_DESC[o.label] || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ ...p, color: '#888784' }}>No opportunity profile available for this industry yet.</p>}
        </section>

        {/* ── ASSUMPTIONS REGISTER ───────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Assumptions register</H>
          <ul style={ul}>
            <li style={li}>All scoring inputs are ordinal sector-level starter defaults (0–3 and 0–10 scales) derived from the public frameworks above. They are not empirically calibrated to the entity and require validation against entity-specific data.</li>
            <li style={li}><strong>Impact-materiality baselines.</strong> Each ESRS topic's impact score starts from a sector baseline and is refined by the preparer's self-assessment. ESRS does not prescribe numeric impact scores — severity (scale, scope, irremediability) and likelihood are a disclosed, preparer-set judgement.</li>
            <li style={li}><strong>Financial-materiality engine.</strong> The financial axis is the physical + transition computation (industry × geography × jurisdiction × scenario × horizon); the climate (E1) financial score is taken directly from it.</li>
            <li style={li}><strong>Materiality threshold.</strong> The matrix quadrants use a mid-scale split for illustration. ESRS requires the undertaking to set and document its own materiality threshold through its governance process; that threshold is not set by this screening.</li>
            <li style={li}><strong>Single scenario.</strong> This determination uses the selected scenario ({SCENARIO_LABEL[a.scenario_code]?.l || a.scenario_code}). Resilience across a diverse range of scenarios is assessed in the separate resilience analysis, as ESRS E1 requires.</li>
          </ul>
        </section>

        {/* ── DATA LINEAGE ───────────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Data lineage</H>
          <p style={p}>The following inputs were provided by the user for this assessment: primary sector, operating regions, policy jurisdictions, asset profile, time horizon, scenario, and the per-topic impact-materiality self-assessment. All scoring defaults — hazard sensitivities, regional hazard intensities, carbon exposure, jurisdictional policy intensities, transition-driver weights, opportunity relevances, and ESRS topic baselines — are platform reference values, not entity-supplied. The boundary matters for assurance: user inputs scope the assessment; platform defaults and the impact self-assessment must be validated, and informed by stakeholder engagement, before any disclosure.</p>
        </section>

        {/* ── DATA PROVENANCE — how firm the reference values are. Disclosed, never gated. ── */}
        {prov && prov.nTotal > 0 && (
          <section className="page" style={{ marginTop: 48 }}>
            <H>Data provenance</H>
            <p style={p}>This assessment draws on {prov.nTotal} reference {prov.nTotal === 1 ? 'value' : 'values'}.</p>
            <ul style={ul}>
              <li style={li}><strong>{prov.nPrimarySource}</strong> transcribed from named primary sources{prov.nPrimarySource > 0 ? ' (listed below)' : ''}</li>
              <li style={li}><strong>{prov.nExpertJudgment}</strong> disclosed ThemisIQ expert-judgment determinations</li>
              <li style={li}><strong>{prov.nStarter}</strong> starter values pending calibration</li>
            </ul>
            <p style={p}>Starter values are reasonable sector- and region-level defaults derived from public frameworks (IPCC AR6, TCFD, ESRS, EU Taxonomy). They have not yet been individually validated against a primary source and should be reviewed against entity-specific data before disclosure.</p>
            {Array.isArray(prov.primarySources) && prov.primarySources.length > 0 && (
              <>
                <h3 style={h3}>Primary sources</h3>
                <ul style={ul}>
                  {prov.primarySources.map((s: string, i: number) => <li key={'ps' + i} style={li}>{s}</li>)}
                </ul>
              </>
            )}
          </section>
        )}

        {/* ── LIMITATIONS ────────────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Limitations</H>
          <ul style={ul}>
            <li style={li}>This is a <strong>screening</strong> to scope a formal CSRD / ESRS double materiality assessment, not the assessment itself. Before publication, a governance-approved materiality threshold, documented stakeholder engagement informing the impact axis, and independent professional review are required.</li>
            <li style={li}>Scores are <strong>ordinal and relative</strong>, not absolute measures of probability, magnitude, or monetary loss.</li>
            <li style={li}>The <strong>disclosure roadmap</strong> lists the requirements each material topic triggers under ESRS Set 1; it does not assert that the entity's disclosures are complete or compliant. Datapoint applicability depends on the entity's own facts and on the final revised ESRS for FY2027.</li>
            <li style={li}>For <strong>financial institutions</strong>, this entity-level screen understates portfolio (financed-emissions) exposure, which requires a separate assessment.</li>
            <li style={li}>Final determination of material topics is a matter for management judgement, informed by entity-specific data and, where required, independent professional review.</li>
          </ul>
        </section>

        {/* ── IMPORTANT NOTICE ───────────────────────────────────────────────
            Now rendered in the printed report itself. Previously the disclaimer
            was only shown on-screen as a pre-generation acknowledgment; once a
            saved PDF circulates to a third party that on-screen gate isn't
            attached to it, so the document carries its own notice. */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Important Notice</H>
          {disclaimerParas('screening').map((para, i) => (
            <p key={'disc' + i} style={{ ...p, fontSize: 11, color: '#888784' }}>{para}</p>
          ))}
        </section>

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '0.5px solid #e8e7e4', fontSize: 11, color: '#888784', textAlign: 'center' }}>
          ThemisIQ Compliance Inc. · www.themisiq.co · Report ID {String(a.id).slice(0, 8)}… · Assessment date {reportDate}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .report-body { padding: 0 !important; max-width: none !important; }
          body { background: white !important; }
          /* Avoid breaking short sections across pages. Sections that cannot fit on one
             page must be allowed to split: an unbreakable box taller than the page box
             gets pushed whole and clipped, which silently drops content. */
          .page { page-break-inside: auto; break-inside: auto; }
          .page > h2 { page-break-after: avoid; break-after: avoid; }
          .page > *  { page-break-inside: avoid; break-inside: avoid; }
          /* ...except anything that can ITSELF exceed a page box. The rule above would make a
             long table — or the wrapper div some of them sit in, or a nested .page section —
             unbreakable, reintroducing the same defect one level down. Those stay breakable
             and the protection moves to the row. */
          .page .page, .page table, .page tbody, .page div:has(table) {
            page-break-inside: auto; break-inside: auto;
          }
          .page tr { page-break-inside: avoid; break-inside: avoid; }
          .page thead { display: table-header-group; }   /* repeat the header on each page */
          .report-body svg { max-height: 16cm !important; width: 100% !important; height: auto !important; }
          section.page { margin-top: 24px !important; }
          h2 { page-break-after: avoid; }
        }
        @page { size: A4; margin: 1.6cm 1.6cm 2cm; }
      `}</style>
    </div>
  )
}

// ─── Small shared components & styles ─────────────────────────────────────────

const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: '#333', margin: '0 0 12px' }
const h3: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 400, color: '#0d0d0d', margin: '18px 0 8px' }
const ul: React.CSSProperties = { paddingLeft: 22, margin: '0 0 12px' }
const li: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: '#333', marginBottom: 4 }
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12, margin: '8px 0 16px' }
const trh: React.CSSProperties = { background: '#f8f7f5' }
const tr: React.CSSProperties = { borderBottom: '0.5px solid #e8e7e4' }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#555553', borderBottom: '1px solid #e8e7e4' }
const td: React.CSSProperties = { padding: '8px 10px', color: '#0d0d0d', verticalAlign: 'top' }

function H({ children }: { children: any }) {
  return <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: '#0d0d0d', margin: '0 0 12px', paddingBottom: 8, borderBottom: '1px solid #e8e7e4' }}>{children}</h2>
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: '#888784' }}>{k}</span>
      <span style={{ color: '#0d0d0d' }}>{v}</span>
    </div>
  )
}
function Stat({ label, val, color, bg }: { label: string; val: number; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.9rem', color, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 11, color: '#555553', marginTop: 4 }}>{label}</div>
    </div>
  )
}
function Pill({ band }: { band: 'high' | 'med' | 'low' | 'unknown' }) {
  // 'unknown' = a data gap (no baseline for this industry × topic, or no reference hazard data —
  // engine FIX A/C). Amber "Not assessed", NEVER an assessed LOW: a gap must not read as immateriality.
  if (band === 'unknown') {
    return <span style={{ background: '#FDF6EC', color: 'var(--color-module-climate)', border: '0.5px solid #EAD9BE', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>NOT ASSESSED</span>
  }
  const c = SEV[band]
  return <span style={{ background: c.bg, color: c.color, border: `0.5px solid ${c.border}`, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{band.toUpperCase()}</span>
}
function Centered({ children }: { children: any }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', color: '#555' }}>{children}</div>
}

function Matrix({ topics }: { topics: any[] }) {
  const W = 600, H = 400, padL = 56, padR = 20, padT = 20, padB = 48
  const midX = padL + 0.5 * (W - padL - padR)
  const midY = padT + 0.5 * (H - padT - padB)
  const color = (q: string) => q === 'both' ? '#A32D2D' : (q === 'financial' || q === 'impact') ? 'var(--color-module-climate)' : '#888784'

  // Offset dots that would land on top of an earlier-placed dot so labels stay readable.
  // 8 directions in a small circle; first collision -> right, second -> left, etc.
  const OFFSET = 16
  const OFFSETS: [number, number][] = [
    [0, 0], [OFFSET, 0], [-OFFSET, 0], [0, OFFSET], [0, -OFFSET],
    [OFFSET, OFFSET], [-OFFSET, -OFFSET], [OFFSET, -OFFSET], [-OFFSET, OFFSET],
  ]
  // Exclude unassessed topics (no baseline → null financial/impact). Plotting them at (0,0) puts them
  // in the bottom-left, which reads as an assessed finding of immateriality. They appear as "N/A" in
  // the table below instead. Assessed topics only.
  const assessed = (topics || []).filter((t: any) => t.financial != null && t.impact != null)
  type Placed = { code: string; cx: number; cy: number; q: string }
  const placed: Placed[] = []
  for (const t of assessed) {
    const bx = Math.round(padL + (t.impact / 10) * (W - padL - padR))
    const by = Math.round(padT + (1 - t.financial / 10) * (H - padT - padB))
    let collisions = 0
    for (const pp of placed) {
      const dx = bx - pp.cx, dy = by - pp.cy
      if (dx * dx + dy * dy < 20 * 20) collisions++
    }
    const [ox, oy] = OFFSETS[Math.min(collisions, OFFSETS.length - 1)]
    placed.push({ code: t.code, cx: bx + ox, cy: by + oy, q: t.quadrant })
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10 }} role="img" aria-label="Double materiality matrix">
      <line x1={padL} y1={midY} x2={W - padR} y2={midY} stroke="#e8e7e4" strokeDasharray="4 4" />
      <line x1={midX} y1={padT} x2={midX} y2={H - padB} stroke="#e8e7e4" strokeDasharray="4 4" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#888784" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#888784" />
      <text x={padL - 8} y={padT + 10} textAnchor="end" fontSize="11" fill="#888784">High</text>
      <text x={padL - 8} y={H - padB} textAnchor="end" fontSize="11" fill="#888784">Low</text>
      <text x="18" y={H / 2} textAnchor="middle" fontSize="12" fill="#555553" transform={`rotate(-90 18 ${H / 2})`}>Financial materiality →</text>
      <text x={W / 2} y={H - 10} textAnchor="middle" fontSize="12" fill="#555553">Impact materiality →</text>
      {placed.map(pp => (
        <g key={pp.code}>
          <circle cx={pp.cx} cy={pp.cy} r={15} fill={color(pp.q)} opacity={0.88} />
          <text x={pp.cx} y={pp.cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{pp.code}</text>
        </g>
      ))}
    </svg>
  )
}

function MatrixTable({ topics }: { topics: any[] }) {
  // Unassessed topics (no baseline → null financial/impact) sort LAST and render "N/A" — never 0/low.
  const sorted = [...topics].sort((a, b) => Math.max(b.financial ?? -1, b.impact ?? -1) - Math.max(a.financial ?? -1, a.impact ?? -1))
  const band = (v: number | null): 'high' | 'med' | 'low' | 'unknown' => v == null ? 'unknown' : v >= 8 ? 'high' : v >= 5 ? 'med' : 'low'
  const num = (v: number | null) => v == null ? 'N/A' : v.toFixed(1)
  return (
    <table style={tbl}>
      <thead><tr style={trh}><th style={th}>ESRS topic</th><th style={th}>Financial</th><th style={th}>Impact</th></tr></thead>
      <tbody>
        {sorted.map(t => (
          <tr key={t.code} style={tr}>
            <td style={td}><span style={{ color: '#aaa', fontSize: 11 }}>{t.code}</span> {t.label}</td>
            <td style={td}><Pill band={band(t.financial)} /> <span style={{ fontSize: 11, color: '#888784', marginLeft: 4 }}>{num(t.financial)}</span></td>
            <td style={td}><Pill band={band(t.impact)} /> <span style={{ fontSize: 11, color: '#888784', marginLeft: 4 }}>{num(t.impact)}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Resilience scenario-response map ──────────────────────────────────────────
// Plots each RISK (physical + transition; opportunities excluded) by its band
// under the Paris-aligned (rapid-policy) future on the x-axis and under the
// high-warming future on the y-axis. Band-based axes (Low/Mod/High), not raw
// scores — bands are calibrated per driver and comparable across channels,
// whereas raw scores are not (policy runs on a wider range). Risks toward the
// top-right are exposed whichever way the future unfolds; the spread between the
// physical (top) and transition (right) groups is the two-channel exposure.


// ── Disclosure roadmap: material topics → the DRs they trigger, AS FROZEN AT WRITE ──
//
// ⚠️ THE REQUIREMENTS COME FROM THE RECORD, NOT FROM ESRS_DR_MAP. `workings.disclosureRequirements`
// was resolved against the assessment's stated standard version when it ran, and frozen. Reading
// the constant here would reprint TODAY's bundle under a version the report states on its face —
// and because ESRS (2026) renumbered the DRs, that is not a stale-name problem. 49 codes exist
// under both versions with different titles; S1-14 is 'Health and safety' under 2023 and
// 'Work-life balance metrics' under 2026. A preparer sent to S1-14 for injury data under a 2026
// report collects work-life balance instead, and nothing errors.
//
// ESRS_DR_MAP is still read for ONE thing — the `relief` phase-in flag — because that flag has no
// home in the requirements table. It is 2023-only and Part C settles what happens to it.
//
// Each material topic renders as its own `.page` section so print pagination keeps
// each topic's table whole without trying to hold the entire (tall) roadmap together.
function DisclosureRoadmap({ matrix, requirements, drResolution }: { matrix: any[]; requirements: any[]; drResolution: any }) {
  // Group the frozen rows by topic, preserving their stored order — sort_order is per topic and
  // was already applied at write.
  const byTopic = new Map<string, any[]>()
  for (const r of Array.isArray(requirements) ? requirements : []) {
    if (!r || typeof r.topic_code !== 'string') continue
    const list = byTopic.get(r.topic_code) ?? []
    list.push(r)
    byTopic.set(r.topic_code, list)
  }
  const material = [...matrix]
    .filter((t: any) => Math.max(t.financial ?? 0, t.impact ?? 0) >= 5 && (byTopic.get(t.code)?.length ?? 0) > 0)
    .sort((a: any, b: any) => Math.max(b.financial, b.impact) - Math.max(a.financial, a.impact))
  if (!material.length) return null
  return (
    <>
      {material.map((t: any) => {
        const m = ESRS_DR_MAP[t.code]           // `relief` only — see the header
        const drs = byTopic.get(t.code) ?? []
        return (
          <section key={t.code} className="page" style={{ marginTop: 18 }}>
            {/* Topic NAME comes from the matrix row (t.label), never from ESRS_DR_MAP.name.
                `material` is a filter over `matrix`, so t is the same object MatrixTable renders
                — one topic name, one source, one spelling per PDF. The two used to disagree on
                E3/E4/E5/S4 ("Water and marine resources" here vs "Water & marine resources" in
                the matrix table) because ESRS_DR_MAP.name was a second, hand-written copy of the
                mr_esrs_topics labels. It is also the STORED label, so a report reprints the name
                as it stood when the assessment ran rather than whatever the bundle says today.
                ESRS_DR_MAP keeps `relief` and `drs`, which are its actual job. */}
            <h3 style={{ ...h3, marginTop: 0, marginBottom: 6 }}>
              <span style={{ color: '#aaa', fontSize: 12 }}>{t.code}</span> {t.label}
              {/* Two conditions, and both are load-bearing. The topic must be one the quick fix
                  names (E4/S2/S3/S4), AND the requirements shown for it must be from a version the
                  quick fix amends. Before Part C only the first was checked, so a 2026 roadmap
                  printed the badge — a relief asserted under an instrument that does not grant it.
                  See phaseInApplies for why the false positive is the dangerous direction here. */}
              {m?.quickFixPhaseIn && phaseInApplies(drResolution, t.code) && (
                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: '#854F0B', background: '#FAEEDA', border: '0.5px solid #EF9F27', borderRadius: 99, padding: '2px 8px', verticalAlign: 'middle' }}>FY25–26 phase-in</span>
              )}
            </h3>
            <table style={tbl}>
              <thead><tr style={trh}><th style={{ ...th, width: '30%' }}>Disclosure requirement</th><th style={th}>Key datapoints to collect</th></tr></thead>
              <tbody>
                {drs.map((d: any) => (
                  <tr key={d.dr_code} style={tr}>
                    <td style={td}><strong>{d.dr_code}</strong>&nbsp;{d.title}</td>
                    {/* ⚠️ A NULL datapoints RENDERS AS AN EXPLICIT ABSENCE, NEVER AS AN EMPTY CELL.
                        Every esrs_2026 row is null today: the summaries are ThemisIQ-authored prose,
                        and the 2026 equivalents have to be WRITTEN against renumbered and rescoped
                        requirements rather than transcribed. An empty cell under a column headed
                        "Key datapoints to collect" reads as "nothing to collect" — a finding this
                        column cannot support, and the same absence-rendered-as-a-finding failure the
                        GHG engine's declaration states exist to prevent. */}
                    <td style={d.datapoints ? td : { ...td, color: '#888784', fontStyle: 'italic' }}>
                      {d.datapoints || 'Not yet summarised — see the standard text for this requirement.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </>
  )
}

