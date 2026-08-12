'use client'

import { useState } from 'react'
import {
  AI_ACT_HIGH_RISK_STANDALONE, AI_ACT_HIGH_RISK_EMBEDDED, AI_ACT_HIGH_RISK_SENTENCE,
} from '../../lib/aiAct'
import { SB253_FIRST_REPORT_DATE, SB253_DATE_STATUS, SB253_STATUS_SENTENCE, SB253_SCOPE3_FROM } from '../../lib/sb253'
import { SB261_CITATION, SB261_STATUS_SENTENCE } from '../../lib/sb261'
// lib/cs3d.ts: "ANY SURFACE NAMING A CS3D DATE OR THRESHOLD IMPORTS FROM HERE. A literal in copy is
// the defect." The group-parentage entry below names both thresholds and the application date.
import { CS3D_APPLIES_FROM, CS3D_CITATION, CS3D_EMPLOYEE_THRESHOLD, CS3D_TURNOVER_THRESHOLD } from '../../lib/cs3d'
// FX from the SAME dated ECB table lib/deals/assessment.ts uses — no second rate table. The engine's
// rule is that the DEAL's figure converts into the limb's currency, never the reverse, so a statutory
// threshold is never restated in another currency. FX_AS_OF/FX_SOURCE are printed in the copy so a
// reader can see which fixing a borderline call was made on.
import { convertCurrency, FX_AS_OF } from '../../lib/deals/assessment'
// The obligation → module mapping, its link vocabulary and its prices. NONE of this is restated
// here: the shorthand comes from obligationModulesParam (which inverts LEGACY_PRICING_PAGE_ID, so a
// module the cart would silently drop is a type error rather than a lost purchase), and the figure
// comes from obligationPrice, which routes through the same cartQuote that /api/checkout charges
// from. A price shown here and a price charged at checkout therefore cannot disagree.
import {
  OBLIGATIONS, obligationHref, obligationPrice, modulesHref, modulesPrice, modulesLabel,
  priceLabel, driverModules, isDriverId, type ObligationId,
} from '../../lib/obligations'

interface Answers {
  driver?: string
  revenue?: number
  employees?: string
  jurisdictions?: string[]
  sectors?: string[]
  // `listed` was ONE question doing two jobs. Split, because listing status and ownership are
  // independent facts and the combined question forced a choice between them: a US-listed
  // PE-backed company could only declare one, and lost the other's entry.
  listing?: string
  ownership?: string
  ai_use?: string
  supply_chain?: string
}

interface Obligation {
  name: string
  jurisdiction: string
  // Set ONLY where lib/obligations.ts holds a counterpart that genuinely answers this entry. Its
  // presence is what turns the module cell into a priced link, so an id here is a claim that the
  // linked modules can be bought and will do the job. Absent means the cell stays plain text.
  //
  // NOT SET, DELIBERATELY, on: CSRD (no module covers ESRS G1); the CS3D group-parentage entry (the
  // lib `cs3d` entry answers the chain of activities, not the group route this entry is about); the
  // Pay Transparency DAY-ONE entry (the lib entry answers the gap-REPORTING duty — the People module
  // holds nothing for posting salary ranges or the salary-history ban); and all six driver entries,
  // which are circumstances rather than instruments. Those render exactly as they do today.
  obligationId?: ObligationId
  // 'regulatory' = a rule that applies to you by operation of law. 'market' = something a
  // counterparty asks of you. The distinction is load-bearing for the reader: it separates
  // what carries a penalty from what carries a lost contract. Required, not optional, so a
  // new entry cannot be added without deciding which it is.
  group: 'regulatory' | 'market'
  urgency: 'critical' | 'high' | 'medium' | 'monitor'
  urgency_label: string
  // Was `deadline`, rendered under a column headed "Deadline". Roughly five of the ~20 values are
  // actually dates; the rest are statuses ('Active since October 2024'), conditions ('Depends on
  // exact headcount', 'Enforcement paused'), a PAIR of dates for the AI Act, and — for every
  // market-driven entry — 'As requested by your customer' or 'At your own pace'. A column headed
  // "Deadline" over "At your own pace" invents an obligation the entry does not claim.
  timing: string
  module: string
  what: string
  action: string
}

const REVENUE_LABELS = ['Under $50M','$50M','$100M','$250M','$500M','$750M','$1B','$2B','$5B','$10B','$10B+']
const REVENUE_VALUES = [25, 50, 100, 250, 500, 750, 1000, 2000, 5000, 10000, 15000]

function computeObligations(a: Answers): Obligation[] {
  const rev = a.revenue !== undefined ? REVENUE_VALUES[a.revenue] : 0
  const emp = a.employees || ''
  const jur = a.jurisdictions || []
  const sec = a.sectors || []
  const listing = a.listing || ''
  const ownership = a.ownership || ''
  const driver = a.driver || ''
  const ai  = a.ai_use || ''
  const hasEU   = jur.includes('eu')
  const hasUK   = jur.includes('uk')
  const hasCA   = jur.includes('california')
  const hasAU   = jur.includes('australia')
  const isFinancial = sec.includes('financial')
  const isEnergy    = sec.includes('energy')
  const isHealth    = sec.includes('health')
  const isTransport = sec.includes('transport')
  // ── Size bands vs statutory thresholds ──────────────────────────────────────
  // The form collects headcount as a BAND. Several statutes test a number, and a band cannot always
  // answer: '50_249' spans the Pay Transparency 100 AND 150 boundaries, and '1000_4999' sits ON the
  // CSRD >1,000 test at its lower edge. Where a band cannot determine an obligation, the entry SAYS
  // SO rather than guessing — the same rule the Deals engine applies with `not-assessed`.
  const empAtLeast = (n: number): boolean | null => {
    switch (emp) {
      case 'under50':    return n <= 0 ? true : false
      case '50_249':     return n <= 50 ? true : n > 249 ? false : null   // straddles 100 and 150
      case '250_499':    return n <= 250 ? true : n > 499 ? false : null
      case '500_999':    return n <= 500 ? true : n > 999 ? false : null
      case '1000_4999':  return n <= 1000 ? true : n > 4999 ? false : null
      case '5000plus':   return n <= 5000 ? true : null
      default:           return null                                     // unanswered
    }
  }
  // Revenue arrives as a USD-millions slider index. Statutory limbs are in their own currency, so the
  // COMPANY figure converts to the limb's currency — GBP 36m, EUR 450m, EUR 10m, AUD 100m are never
  // restated in dollars. Same direction as lib/deals/assessment.ts's evaluateLimb.
  const revUSD = rev * 1_000_000
  const revIn = (c: 'EUR' | 'GBP' | 'AUD'): number => convertCurrency(revUSD, 'USD', c)
  const fxNote = `Converted from your USD figure at the ECB reference rate of ${FX_AS_OF}; confirm against your reported figure in the statutory currency.`

  // Listing status drives the SEC entries; ownership drives the LP & lender entry. These were one
  // field, so the two could not both be true — a US-listed, PE-backed company had to pick.
  const isPublicUS = listing === 'us_listed'
  const isPE       = ownership === 'pe_vc'
  // 'group' — a subsidiary of a larger parent — is COLLECTED BUT NOT YET SCORED. CSRD and CS3D can
  // both reach a company through its parent, and no determination here is safe without knowing where
  // the parent is established and whether it consolidates you. Deliberately no entry fires on it.
  const regs: Obligation[] = []

  // ── SB 253 ──────────────────────────────────────────────────────────────────
  // STRICT >, not >=: the statute is "in excess of" $1bn. And CARB measures worldwide GROSS RECEIPTS
  // with no deduction for cost of goods sold — materially larger than revenue as a visitor reads it,
  // so a company near the line can be in scope on gross receipts while under $1bn on net revenue.
  if (hasCA && revUSD > 1_000_000_000) regs.push({ name: 'SB 253 — California Climate Corporate Data Accountability Act', obligationId: 'sb253', jurisdiction: 'California, USA', group: 'regulatory', urgency: 'critical', urgency_label: 'IMMEDIATE ACTION', timing: `${SB253_FIRST_REPORT_DATE} (${SB253_DATE_STATUS})`, module: 'Climate · GHG Emissions', what: `California Health & Safety Code §38532: total annual revenues in excess of $1,000,000,000 for an entity doing business in California. CARB measures WORLDWIDE GROSS RECEIPTS with no deduction for cost of goods sold — larger than net revenue, so check the gross figure if you are near the line. ${SB253_STATUS_SENTENCE} Scope 3 follows from ${SB253_SCOPE3_FROM}.`, action: 'Start Scope 1 + 2 GHG inventory immediately using the CARB-approved GHG Protocol methodology.' })

  // ── SB 261 ──────────────────────────────────────────────────────────────────
  // SB 261 posture verified against primary sources 12 August 2026: Ninth Circuit order of
  // 18 November 2025 in Chamber of Commerce v. Sanchez, No. 25-5327, and CARB's SB 261 docket
  // page. No merits ruling as of this date — re-check before relying on "has not ruled".
  if (hasCA && revUSD >= 500_000_000) regs.push({ name: 'SB 261 — California Climate-Related Financial Risk Act', obligationId: 'sb261', jurisdiction: 'California, USA', group: 'regulatory', urgency: 'monitor', urgency_label: 'MONITOR', timing: 'Enforcement paused — no new date set', module: 'Climate · Risk', what: `You meet the $500m revenue threshold. ${SB261_CITATION}. ${SB261_STATUS_SENTENCE}`, action: 'Prepare the TCFD-aligned report now; it is the same deliverable whenever a date is set.' })

  // ── CSRD ────────────────────────────────────────────────────────────────────
  // ONE entry, not two. The 250-employee tier DOES NOT EXIST post-Omnibus: Directive (EU) 2026/470
  // amends the Accounting Directive arts. 19a/29a to >1,000 employees AND >EUR 450m net turnover — a
  // two-limb AND, matching THRESHOLD_TESTS['CSRD']. The old 500+ / 250+ gates asserted a scope the
  // amending directive removed, and neither consulted turnover at all.
  const csrdStaff = empAtLeast(1_001)          // ">1,000" — 1,001 is the first qualifying headcount
  const csrdTurnover = revIn('EUR') > 450_000_000
  if (hasEU && csrdTurnover && csrdStaff !== false) {
    const staffIndeterminate = csrdStaff === null
    regs.push({
      name: 'CSRD / ESRS — Corporate Sustainability Reporting Directive',
      jurisdiction: 'European Union',
      group: 'regulatory',
      urgency: staffIndeterminate ? 'high' : 'critical',
      urgency_label: staffIndeterminate ? 'CONFIRM HEADCOUNT' : 'ACTIVE NOW',
      // The collapsed row is the only line most readers see, so it must say WHAT TO CHECK, not that a
      // check exists. empAtLeast(1_001) returns null for exactly one band — 1,000–4,999 — so naming
      // that band here is safe: it is the only band that can reach this arm.
      timing: staffIndeterminate ? 'Applies above 1,000 employees — your 1,000–4,999 band spans that line' : 'Active — first report on the amended thresholds',
      module: 'Climate · GHG + Risk + People + Supply Chain',
      what: staffIndeterminate
        ? `Post-Omnibus CSRD is a TWO-LIMB AND: more than 1,000 employees AND more than EUR 450,000,000 net turnover (Directive (EU) 2026/470 amending the Accounting Directive, arts. 19a/29a). Your turnover limb is met. YOUR HEADCOUNT BAND CANNOT SETTLE THE OTHER LIMB — it spans the 1,000 boundary, so a figure at or below 1,000 is out of scope. Confirm the exact average headcount for the financial year. ${fxNote}`
        : `Post-Omnibus CSRD is a TWO-LIMB AND: more than 1,000 employees AND more than EUR 450,000,000 net turnover (Directive (EU) 2026/470 amending the Accounting Directive, arts. 19a/29a). Both limbs are met on the figures given. The 250-employee tier no longer exists. ${fxNote}`,
      action: 'Conduct the ESRS double materiality assessment and close disclosure gaps across E1, S1, S2 and G1.',
    })
  }

  // ── GROUP PARENTAGE ─────────────────────────────────────────────────────────
  // ONE entry, and it abstains. Two others were written here and removed before shipping: a CSRD
  // subsidiary-exemption entry and a CSRD third-country-parent entry. Both turned on article
  // subsections and EU-turnover figures that EXIST NOWHERE IN THIS REPO — the subsections were
  // written from outside knowledge, and the two figures were transcribed out of a block comment in
  // lib/deals/assessment.ts rather than imported from any constant. Nothing tested either. On a
  // surface that tells a visitor whether a statute reaches them, an unsourced threshold restated as
  // a string literal is the defect, not the wording around it.
  //
  // What survives is the entry whose every figure and date is IMPORTED and whose claim is that the
  // question cannot be answered here. Gated on hasEU: outside an EU footprint it has nothing to
  // bite on, and an entry about a parent that changes nothing is noise a reader has to disprove.
  //
  // CS3D route (b). lib/cs3d.ts is explicit that group parentage and franchising "are NOT expressed
  // here or there" — no threshold constant models them — so this entry names the route and abstains
  // rather than testing the art. 2(1)(a) limbs against a figure they were not written for.
  const isGroup = ownership === 'group'
  if (isGroup && hasEU) regs.push({
    name: 'CS3D — due diligence through group parentage',
    jurisdiction: 'European Union · group level',
    group: 'regulatory',
    urgency: 'monitor',
    urgency_label: 'CONFIRM STRUCTURE',
    timing: `Group-level obligations from ${CS3D_APPLIES_FROM}`,
    module: 'Supply Chain',
    what: `CS3D (${CS3D_CITATION}) applies from ${CS3D_APPLIES_FROM} and reaches companies by more than one route. The size route tests the COMPANY at ${CS3D_EMPLOYEE_THRESHOLD} and ${CS3D_TURNOVER_THRESHOLD}; a separate route applies the duty AT GROUP LEVEL through the ultimate parent, which can bring a subsidiary that is well under those figures into a group due-diligence programme. THE GROUP ROUTE TURNS ON THE GROUP’S CONSOLIDATED FIGURES, WHICH THIS FORM DOES NOT COLLECT — your own revenue and headcount cannot answer it either way.`,
    action: 'Ask your parent whether the group is in CS3D scope on its consolidated figures, and whether your operations and suppliers fall inside a group due-diligence programme.',
  })

  if (hasEU || hasUK || hasAU || jur.includes('canada') || jur.includes('apac')) regs.push({ name: 'IFRS S2 — Climate-related Disclosures', obligationId: 'ifrs-s2', jurisdiction: '30+ jurisdictions globally', group: 'regulatory', urgency: 'high', urgency_label: 'HIGH PRIORITY', timing: 'Active — jurisdiction dependent', module: 'Climate · Risk', what: 'IFRS S2 has been adopted by 30+ jurisdictions including the EU, UK, Australia, Canada, Singapore, and Japan.', action: 'Run IFRS S2 physical and transition risk assessment.' })
  // Both timing arms named 2 August 2026, and the critical arm appended a HARDCODED '— 77 days',
  // which was an interval to a date that has since both passed and moved. The two dates are printed
  // together because this screen never learns whether a system is stand-alone or embedded in a
  // regulated product, and must not pick one.
  if (hasEU && ai !== 'no') { const urgency = (ai === 'yes_hr' || ai === 'yes_credit') ? 'critical' : 'high'; regs.push({ name: 'EU AI Act — Artificial Intelligence Regulation', obligationId: 'eu-ai-act', jurisdiction: 'European Union (global scope)', group: 'regulatory', urgency, urgency_label: urgency === 'critical' ? 'IMMEDIATE ACTION' : 'HIGH PRIORITY', timing: `${AI_ACT_HIGH_RISK_STANDALONE} (stand-alone) · ${AI_ACT_HIGH_RISK_EMBEDDED} (in a regulated product)`, module: 'AI Governance', what: ai === 'yes_hr' ? `CV screening and hiring AI are Annex III high-risk. ${AI_ACT_HIGH_RISK_SENTENCE}` : 'Your AI systems require risk classification under EU AI Act.', action: 'Inventory all AI systems and begin Article 11 technical documentation.' }) }

  // ── NIS2 / DORA ─────────────────────────────────────────────────────────────
  // DORA IS LEX SPECIALIS. NIS2 art. 4(2) disapplies its risk-management and incident provisions
  // where a sector-specific act imposes at least equivalent requirements, and the ESAs and the
  // Commission have confirmed DORA meets that test. An EU financial entity therefore gets DORA, NOT
  // both — the old logic fired both and told a bank it had two overlapping regimes.
  const nis2Sectors = isEnergy || isFinancial || isHealth || isTransport || sec.includes('tech')
  const doraApplies = isFinancial && hasEU
  // NIS2's real scope test: an Annex I or II sector AND exceeding the medium-enterprise ceiling —
  // 50+ headcount OR EUR 10m+ turnover. The old gate used "sector OR 500+ employees", which both
  // over-called (a 600-person EU retailer in no Annex sector) and under-called (a 60-person energy
  // operator). Either limb suffices, so an indeterminate headcount band with turnover met still lands.
  const nis2Staff = empAtLeast(50)
  const nis2Size = nis2Staff === true || revIn('EUR') >= 10_000_000
  if (hasEU && nis2Sectors && nis2Size && !doraApplies) regs.push({ name: 'EU NIS2 Directive — Network and Information Security', obligationId: 'nis2', jurisdiction: 'European Union · 18 sectors', group: 'regulatory', urgency: 'critical', urgency_label: 'ACTIVE NOW', timing: 'Active since October 2024', module: 'Cyber Governance', what: `NIS2 reaches entities in an Annex I or Annex II sector that exceed the medium-enterprise thresholds — 50 or more staff, or EUR 10,000,000 or more turnover. Your sector and size place you in scope. Board-level accountability, mandatory security measures and 24-hour / 72-hour incident notification apply. ${fxNote}`, action: 'Conduct NIS2 gap assessment and document board cyber governance immediately.' })
  if (doraApplies) regs.push({ name: 'DORA — Digital Operational Resilience Act', obligationId: 'dora', jurisdiction: 'EU financial services', group: 'regulatory', urgency: 'critical', urgency_label: 'ACTIVE NOW', timing: 'Active since January 2025', module: 'Cyber Governance', what: 'As a financial services entity with EU operations, DORA applies in full: ICT risk-management framework, incident classification and reporting, resilience testing, and a critical third-party provider register. DORA is LEX SPECIALIS under NIS2 art. 4(2) — the ESAs and the Commission have confirmed it meets the equivalence test, so NIS2\u2019s risk-management and incident provisions do not additionally apply to you.', action: 'ICT risk framework and Critical Third-Party Provider register required immediately.' })

  if (isPublicUS) regs.push({ name: 'SEC Cybersecurity Disclosure Rules', obligationId: 'sec-cyber', jurisdiction: 'United States · public companies', group: 'regulatory', urgency: 'critical', urgency_label: 'ACTIVE NOW', timing: 'Active since December 2023', module: 'Cyber Governance', what: 'Material cybersecurity incidents must be disclosed on Form 8-K within 4 business days. Annual 10-K must describe your cybersecurity risk management programme.', action: 'Document cyber governance programme for 10-K disclosure.' })
  if (isPublicUS) regs.push({ name: 'SEC Item 101 — Human Capital Disclosure', obligationId: 'sec-item-101', jurisdiction: 'United States · public companies', group: 'regulatory', urgency: 'high', urgency_label: 'HIGH PRIORITY', timing: 'Active · annual Form 10-K', module: 'People & Workforce', what: 'US public companies must include material human capital disclosures in Form 10-K — workforce size, turnover, safety, training investment.', action: 'Audit current 10-K human capital disclosure against peer benchmarks.' })

  // ── EU Pay Transparency (Directive (EU) 2023/970) ────────────────────────────
  // DAY-ONE obligations bind EVERY EU employer with no size threshold at all — the old logic gated
  // the whole directive on 250+, so a 40-person EU employer was told nothing applied.
  if (hasEU) regs.push({ name: 'EU Pay Transparency Directive (2023/970) — day-one obligations', jurisdiction: 'European Union', group: 'regulatory', urgency: 'high', urgency_label: 'ALL EMPLOYERS', timing: 'On national transposition — no size threshold', module: 'People & Workforce', what: 'Directive (EU) 2023/970 imposes obligations on EVERY EU employer regardless of headcount: salary ranges must be given in job postings or before interview, candidates may not be asked about salary history, and employees may request information on their own pay level and the average levels for work of equal value.', action: 'Publish pay ranges in postings, remove salary-history questions from your process, and prepare a pay-information response route.' })
  // Reporting bands. 250+ annual from 7 June 2027; 150–249 triennial from 7 June 2027; 100–149
  // triennial from 7 June 2031; under 100 not required by the Directive. The '50_249' band spans BOTH
  // the 100 and 150 boundaries, so it determines nothing — that entry says so.
  const pt250 = empAtLeast(250)
  if (hasEU && pt250 === true) regs.push({ name: 'EU Pay Transparency (2023/970) — gender pay gap reporting', obligationId: 'eu-pay-transparency', jurisdiction: 'European Union', group: 'regulatory', urgency: 'high', urgency_label: 'HIGH PRIORITY', timing: '7 June 2027, then annually', module: 'People & Workforce', what: 'At 250 or more workers you report the gender pay gap by 7 June 2027 and ANNUALLY thereafter. A reported gap above 5% is NOT automatically unlawful: the trigger is an unjustified gap that is not remedied within six months, at which point a JOINT PAY ASSESSMENT with worker representatives follows.', action: 'Calculate the gap by category of worker performing equal work, and prepare the objective justification for any gap you find.' })
  if (hasEU && pt250 === null) regs.push({ name: 'EU Pay Transparency (2023/970) — reporting band undetermined', obligationId: 'eu-pay-transparency', jurisdiction: 'European Union', group: 'regulatory', urgency: 'monitor', urgency_label: 'CONFIRM HEADCOUNT', timing: 'Depends on exact headcount', module: 'People & Workforce', what: 'Your headcount band (50–249) SPANS THREE DIFFERENT DUTIES under Directive (EU) 2023/970 and cannot determine which applies: 150–249 workers report by 7 June 2027 every three years; 100–149 report by 7 June 2031 every three years; under 100 are not required to report at all. Confirm your exact worker count. The day-one obligations above apply to you either way.', action: 'Establish your exact worker count for the reference period, then set the reporting cycle from it.' })

  // ── California pay data (Gov Code §12999, as amended by SB 1162 and SB 464) ──
  // The test is 100+ PAYROLL EMPLOYEES ANYWHERE IN THE US with AT LEAST ONE working in California —
  // TOTAL headcount, not California headcount. The old gate fired on `hasCA` alone with no size test
  // while its own copy asserted a 100+ threshold. NOTE the form collects GLOBAL headcount, which is
  // not the same population as US payroll headcount — stated in the copy rather than assumed away.
  const caStaff = empAtLeast(100)
  if (hasCA && caStaff !== false) regs.push({
    name: 'California Pay Data Reporting (Gov. Code §12999)', obligationId: 'ca-pay-data',
    jurisdiction: 'California, USA',
    group: 'regulatory',
    urgency: caStaff === null ? 'monitor' : 'high',
    urgency_label: caStaff === null ? 'CONFIRM HEADCOUNT' : 'HIGH PRIORITY',
    timing: 'Second Wednesday of May, annually',
    module: 'People & Workforce',
    what: caStaff === null
      ? 'Government Code §12999, as amended by SB 1162 and SB 464, applies to employers with 100 or more PAYROLL EMPLOYEES ANYWHERE IN THE UNITED STATES where at least one works in California — it is total US headcount that counts, not California headcount. Your band (50–249) cannot settle whether you cross 100. Confirm your US payroll count. Filing is due the second Wednesday of May each year, and penalties are now MANDATORY under SB 464 rather than discretionary.'
      : 'Government Code §12999, as amended by SB 1162 and SB 464, applies to employers with 100 or more PAYROLL EMPLOYEES ANYWHERE IN THE UNITED STATES where at least one works in California — total US headcount, not California headcount. Note this form collects GLOBAL headcount, so confirm the US figure. Pay data by race, ethnicity, sex and job category is due the second Wednesday of May each year, and penalties are now MANDATORY under SB 464 rather than discretionary.',
    action: 'Assemble pay and hours-worked data by establishment, job category and demographic group for the US payroll population.',
  })

  // ── Modern Slavery ──────────────────────────────────────────────────────────
  // Both thresholds are in their OWN currency and were previously compared against the raw USD
  // slider figure, which OVER-CALLS: £36m is about $41m at the dated rate, so a $38m UK company was
  // told it had to file. Converted via lib/deals/assessment.ts's convertCurrency — one rate table.
  const msUK = hasUK && revIn('GBP') > 36_000_000
  const msAU = hasAU && revIn('AUD') >= 100_000_000
  if (msUK || msAU) regs.push({ name: 'Modern Slavery Act — UK / Australia', obligationId: 'modern-slavery', jurisdiction: msUK && msAU ? 'UK + Australia' : msUK ? 'United Kingdom' : 'Australia', group: 'regulatory', urgency: 'medium', urgency_label: 'ANNUAL', timing: 'Annual · 6 months after financial year end', module: 'Supply Chain', what: `${msUK ? 'UK Modern Slavery Act 2015 s.54: GBP 36,000,000 total GLOBAL turnover including subsidiaries, for any body corporate carrying on business in any part of the UK. ' : ''}${msAU ? 'Australian Modern Slavery Act 2018: AUD 100,000,000 consolidated revenue — the threshold is UNDER REVIEW, with a reduction to AUD 50,000,000 proposed. ' : ''}An annual transparency statement is required covering the steps taken to ensure no modern slavery in your operations and supply chains. ${fxNote}`, action: 'Conduct supply chain human rights assessment and draft the Modern Slavery statement.' })

  // ── MARKET-DRIVEN ───────────────────────────────────────────────────────────
  // Nothing below carries a statutory penalty. These fire on who is ASKING — the ownership answer
  // and the driver answer — not on a jurisdiction, a size limb or a sector.
  if (isPE) regs.push({ name: 'LP & Lender ESG Requirements', obligationId: 'lp-lender-esg', jurisdiction: 'Global · capital markets', group: 'market', urgency: 'high', urgency_label: 'HIGH PRIORITY', timing: 'Varies by LP agreement', module: 'Deals & Investment', what: 'Institutional LPs and lenders are requiring documented ESG diligence as a condition of capital deployment.', action: 'Establish portfolio climate monitoring and LP ESG reporting framework.' })
  if (driver === 'customer') regs.push({ name: 'Customer Supplier Questionnaire', jurisdiction: 'Global · your customers', group: 'market', urgency: 'high', urgency_label: 'HIGH PRIORITY', timing: 'As requested by your customer', module: 'Supply Chain', what: 'Your customer is asking you to complete a sustainability questionnaire covering GHG emissions, labour practices, ethics and environmental management.', action: 'Complete a sustainability self-assessment using the ThemisIQ Supplier Portal questionnaire.' })
  if (driver === 'customer') regs.push({ name: 'GHG Inventory — Scope 1 & 2', jurisdiction: 'Global · customer requirement', group: 'market', urgency: 'high', urgency_label: 'HIGH PRIORITY', timing: 'As requested by your customer', module: 'Climate · GHG', what: 'Most customer sustainability questionnaires require your Scope 1 and Scope 2 GHG emissions — the baseline metric every sustainability programme starts with.', action: 'Complete your GHG inventory using the ThemisIQ Climate module.' })
  if (driver === 'bank') regs.push({ name: 'Bank / Insurer ESG Questionnaire', jurisdiction: 'Global · your lender', group: 'market', urgency: 'high', urgency_label: 'HIGH PRIORITY', timing: 'As requested by your bank or insurer', module: 'Climate · GHG + Risk', what: 'Banks and insurers are requiring ESG data for loan renewals and sustainability-linked financing. Climate risk and GHG emissions are the most commonly requested data points.', action: 'Complete your GHG inventory and climate risk assessment.' })
  if (driver === 'board') regs.push({ name: 'Board ESG Governance Programme', jurisdiction: 'Global · internal governance', group: 'market', urgency: 'medium', urgency_label: 'RECOMMENDED', timing: 'As directed by your board', module: 'Climate · GHG', what: 'Boards are requesting ESG performance data for governance, talent attraction and reputational risk management — even without a regulatory mandate.', action: 'Start with a GHG inventory and supply chain risk assessment as the foundation of your ESG programme.' })
  if (driver === 'ahead') regs.push({ name: 'Proactive ESG Programme', jurisdiction: 'Global · best practice', group: 'market', urgency: 'medium', urgency_label: 'RECOMMENDED', timing: 'At your own pace', module: 'Climate · GHG', what: 'Getting ahead of regulations now means less disruption when they become mandatory. SB 253, CSRD, EU AI Act and CS3D are all moving toward broader applicability.', action: 'Start with a GHG inventory and compliance gap assessment.' })
  if (driver === 'investor') regs.push({ name: 'Investor / PE ESG Requirements', jurisdiction: 'Global · your investors', group: 'market', urgency: 'high', urgency_label: 'HIGH PRIORITY', timing: 'As required by your investor', module: 'Deals & Investment', what: 'Investors and PE firms are requiring portfolio companies to measure and report ESG performance as a condition of ongoing investment.', action: 'Establish a GHG inventory, supply chain risk register and governance framework.' })

  // CDP and EcoVadis are BOTH REQUEST-DRIVEN: nobody is obliged to file either one, and neither has
  // a size test of its own. CDP previously fired on `rev >= 500 || hasGlobal` — a $500m gate lifted
  // wholesale from SB 261, which has nothing to do with CDP and produced the same false confidence
  // in the other direction: a $60m manufacturer whose largest customer had just sent a CDP supply
  // chain request was told CDP did not concern it. Both now fire on the ASK.
  const requested = driver === 'customer' || driver === 'investor'
  if (requested) regs.push({ name: 'CDP Climate — Annual Disclosure', obligationId: 'cdp', jurisdiction: 'Global · customer & investor requests', group: 'market', urgency: 'medium', urgency_label: 'ON REQUEST', timing: 'On request · annual July submission window', module: 'Climate · GHG + Risk', what: 'CDP is a disclosure REQUEST, not a filing obligation: investors representing over $130 trillion AUM, and large buyers running CDP Supply Chain programmes, ask companies to respond. There is no revenue or headcount threshold — a request from one customer or one investor is what puts you in scope. CDP C6, C7, C11 and Section P all flow from your GHG inventory.', action: 'Complete GHG inventory to feed CDP C6 and run scenario analysis for CDP Section P.' })
  if (requested) regs.push({ name: 'EcoVadis Sustainability Rating', obligationId: 'ecovadis', jurisdiction: 'Global · customer & investor requests', group: 'market', urgency: 'medium', urgency_label: 'ON REQUEST', timing: 'On request · rating valid 12 months', module: 'Supply Chain', what: 'EcoVadis is a request-driven supplier sustainability rating: a customer or investor asks you to be scored across Environment, Labour & Human Rights, Ethics and Sustainable Procurement, and the scorecard is then visible to everyone who requests it. The evidence it wants — a GHG inventory, published policies, and supplier due diligence — is the same evidence behind the questionnaires above, so it is assembled once and reused.', action: 'Assemble the evidence set once — GHG inventory, policy documents, supplier due diligence — and reuse it across EcoVadis and your customers’ own questionnaires.' })

  const order = { critical: 0, high: 1, medium: 2, monitor: 3 }
  return regs.sort((a, b) => order[a.urgency] - order[b.urgency])
}

// Every question is asked, in array order. There is no conditional-question machinery here: the two
// that had it were removed with the entries they fed, and a `showIf` no caller sets is a trap that
// reads as supported. If a conditional question returns, note that `step` indexes this array, so the
// predicate must read an answer collected at a LOWER index than the question it hides.
type Question = {
  id: keyof Answers
  title: string
  sub: string
  type: 'options' | 'slider' | 'multiselect'
  options?: { value: string; label: string; sub: string }[]
}

// ── Module cell, for entries that map to an ObligationId ─────────────────────
//
// THE LABEL IS DERIVED FROM THE OBLIGATION, NOT FROM THE ENTRY'S OWN `module` STRING. The two
// disagree today and the disagreement is not cosmetic: this page calls EcoVadis 'Supply Chain',
// while lib/obligations maps it to ghg + supply-chain and prices it at the pair. A cell labelled
// 'Supply Chain' above a two-module price is a figure that does not match what the link sells.
// Where an entry maps, the mapping wins; the entry's `module` prose is used only where it does not.
//
// The href, the price and the formatting all come from lib/obligations.ts — the lead email renders
// the same three things and neither surface may hold its own copy.
const obligationModuleLabel = (id: ObligationId): string => modulesLabel(OBLIGATIONS[id].modules)

// Order is the render order: what the law requires of you first, what the market asks of you second.
const OBLIGATION_GROUPS: { key: Obligation['group']; title: string; sub: string }[] = [
  { key: 'regulatory', title: 'Regulatory / compliance', sub: 'Rules that apply to you, based on where you operate, your size and your sector.' },
  { key: 'market',     title: 'Market-driven',           sub: 'What your customers, investors and lenders are asking for. Often because they have a reporting obligation of their own: a large customer’s Scope 3 is your Scope 1 and 2.' },
]

const URGENCY_COLOR: Record<string, string> = { critical: '#B91C1C', high: '#ba7517', medium: '#0C447C', monitor: '#888784' }
const URGENCY_BG: Record<string, string> = { critical: '#FCEBEB', high: '#FEF3E2', medium: '#E6F1FB', monitor: '#f8f7f5' }
const URGENCY_TEXT: Record<string, string> = { critical: '#501313', high: '#633806', medium: '#0C447C', monitor: '#888784' }

export default function AssessPage() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [email, setEmail] = useState({ first: '', last: '', emailAddr: '', company: '', role: '' })

  const goNext = () => setStep(s => s + 1)
  const goBack = () => setStep(s => s - 1)

  // The visitor's answers, resolved to the LABELS THEY ACTUALLY SAW, for the internal alert. Sending
  // the raw `answers` object instead would put `revenue: 5` in the inbox — the slider stores an index
  // into REVENUE_LABELS, not a figure — and `us_listed` where the form said 'Listed in the United
  // States'. Resolving here, from the same array the visitor answered, is what stops the alert from
  // ever naming a value the form no longer offers.
  //
  // Every question is asked, so iterating the array is the whole population; an unanswered one is
  // skipped rather than sent as a blank row. If a conditional question is ever added, this must
  // iterate the list actually shown — a hidden question's stale answer must not reach the alert.
  const answerProfile = () => questions.flatMap(q => {
    const v = answers[q.id]
    if (v === undefined || (Array.isArray(v) && v.length === 0)) return []
    const label = q.type === 'slider'
      ? REVENUE_LABELS[v as number]
      : (Array.isArray(v) ? v : [v]).map(one => q.options?.find(o => o.value === one)?.label ?? String(one)).join(', ')
    return [{ q: q.title, a: label }]
  })

  const submitToAPI = async () => {
    try {
      await fetch('/api/assessment/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: { first: email.first, last: email.last, email: email.emailAddr, company: email.company, role: email.role }, obligations, profile: answerProfile() }),
      })
    } catch (e) {
      console.error('Email send failed:', e)
    }
  }
  const toggleExpand = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const obligations = computeObligations(answers)
  const critical = obligations.filter(o => o.urgency === 'critical').length
  const high = obligations.filter(o => o.urgency === 'high').length

  const questions: Question[] = [
    { id: 'driver' as keyof Answers, title: "What's driving your ESG focus right now?", sub: 'This helps us identify the right starting point.', type: 'options', options: [{ value: 'regulatory', label: 'A regulation applies to us', sub: 'SB 253, CSRD, EU AI Act, NIS2 — mandatory compliance' }, { value: 'customer', label: 'A customer is asking us', sub: 'Supplier questionnaire, EcoVadis, procurement requirement' }, { value: 'investor', label: 'Our investor requires it', sub: 'LP ESG reporting, portfolio climate disclosure' }, { value: 'bank', label: 'Our bank or insurer is asking', sub: 'Sustainability-linked loan, climate risk questionnaire' }, { value: 'board', label: 'Our board wants it', sub: 'Governance, talent, reputation, proactive ESG' }, { value: 'ahead', label: 'We want to get ahead', sub: 'Proactive compliance before mandatory deadlines' }] },

    { id: 'revenue' as keyof Answers, title: "What is your company's global annual revenue?", sub: 'Determines eligibility for SB 253 ($1B), SB 261 ($500M), ESRS/CSRD, and Modern Slavery Act thresholds.', type: 'slider' },
    { id: 'employees' as keyof Answers, title: 'How many employees does your company have globally?', sub: 'Determines CSRD/ESRS scope, EU Pay Transparency, and California Pay Data Reporting thresholds.', type: 'options', options: [{ value: 'under50', label: 'Under 50', sub: 'Small organisation' }, { value: '50_249', label: '50–249', sub: 'NIS2 important entity threshold' }, { value: '250_499', label: '250–499', sub: 'ESRS mid-size · EU Pay Transparency (every 3 years)' }, { value: '500_999', label: '500–999', sub: 'ESRS large entity · EU Pay Transparency annual' }, { value: '1000_4999', label: '1,000–4,999', sub: 'Full ESRS scope · EU AI Act · NIS2 essential entity' }, { value: '5000plus', label: '5,000+', sub: 'All obligations apply · SEC human capital disclosure' }] },
    { id: 'jurisdictions' as keyof Answers, title: 'Where does your company operate or have revenue?', sub: 'Select all that apply. Each jurisdiction triggers different mandatory disclosure obligations.', type: 'multiselect', options: [{ value: 'california', label: '🇺🇸 California, USA', sub: 'SB 253, SB 261, CA Pay Data' }, { value: 'us_other', label: '🇺🇸 United States (other)', sub: 'SEC rules, NIST, Model Risk' }, { value: 'eu', label: '🇪🇺 European Union', sub: 'CSRD, ESRS, NIS2, DORA, EU AI Act' }, { value: 'uk', label: '🇬🇧 United Kingdom', sub: 'TCFD mandatory, Modern Slavery Act' }, { value: 'australia', label: '🇦🇺 Australia', sub: 'Modern Slavery Act, AASB S2' }, { value: 'canada', label: '🇨🇦 Canada', sub: 'IFRS S2 adoption, federal modern slavery' }, { value: 'apac', label: '🌏 Asia Pacific (other)', sub: 'Singapore, Japan, Hong Kong TCFD' }, { value: 'global', label: '🌐 Global / multiple regions', sub: 'CDP, GRI, SBTi, UNGP' }] },
    { id: 'sectors' as keyof Answers, title: 'Which sectors best describe your business?', sub: 'Determines NIS2 essential/important entity status, DORA applicability, and EU AI Act high-risk categories.', type: 'multiselect', options: [{ value: 'financial', label: '🏦 Financial services', sub: 'DORA, NIS2 essential, SR 11-7' }, { value: 'energy', label: '⚡ Energy / utilities', sub: 'NIS2 essential, SB 253, ESRS' }, { value: 'health', label: '🏥 Healthcare', sub: 'NIS2 essential, EU AI Act high-risk' }, { value: 'manufacturing', label: '🏭 Manufacturing / industrial', sub: 'SB 253, ESRS E1, NIS2 important' }, { value: 'tech', label: '💻 Technology / digital', sub: 'EU AI Act, NIS2, DORA (if fintech)' }, { value: 'transport', label: '🚚 Transport / logistics', sub: 'NIS2 essential, Scope 3 Cat.4' }, { value: 'retail', label: '🛍️ Retail / consumer', sub: 'Supply chain, SB 253, ESRS' }, { value: 'other', label: '💼 Professional services', sub: 'ESRS, CDP, GRI' }] },
    // Two questions, not one. SUBTITLES DESCRIBE THE OPTION, NEVER THE OUTCOME — the old ones made
    // determinations before the visitor had answered, and got them wrong: 'EU publicly listed ·
    // CSRD large company · ESRS full suite from FY2024' asserted CSRD scope from listing alone, when
    // post-Omnibus CSRD is size-gated (>1,000 staff AND >EUR 450m turnover) and listing is not the
    // test at all. What each answer triggers is decided in computeObligations and shown in the
    // results — that is the only place a determination belongs.
    { id: 'listing' as keyof Answers, title: 'Is your company publicly listed?', sub: 'Where your shares trade, if anywhere. Securities regulators impose disclosure duties on their own listed issuers.', type: 'options', options: [{ value: 'not_listed', label: 'Not listed', sub: 'No shares traded on a public market' }, { value: 'us_listed', label: 'Listed in the United States', sub: 'NYSE, Nasdaq, or another SEC-registered exchange' }, { value: 'eu_listed', label: 'Listed in the European Union', sub: 'Shares admitted to an EU regulated market' }, { value: 'uk_listed', label: 'Listed in the United Kingdom', sub: 'Shares admitted to the London Stock Exchange' }, { value: 'listed_other', label: 'Listed elsewhere', sub: 'A public market outside the US, EU and UK' }] },
    { id: 'ownership' as keyof Answers, title: 'Who owns your company?', sub: 'Who holds the equity, which shapes what your investors and lenders ask of you — and, where there is a parent, what reaches you through it.', type: 'options', options: [{ value: 'founder_family', label: 'Founder or family owned', sub: 'Held by its founders, a family, or a family office' }, { value: 'pe_vc', label: 'Private equity or VC backed', sub: 'A private equity or venture capital fund holds a stake' }, { value: 'group', label: 'Part of a larger group', sub: 'A subsidiary, division or branch of a parent company' }, { value: 'other', label: 'Other', sub: 'None of the above describes how it is held' }] },
    { id: 'ai_use' as keyof Answers, title: 'Does your company deploy AI systems that affect people?', sub: 'The EU AI Act applies to any organisation using AI that affects EU residents.', type: 'options', options: [{ value: 'yes_hr', label: 'Yes — in HR / hiring decisions', sub: `EU AI Act Annex III high-risk · from ${AI_ACT_HIGH_RISK_STANDALONE}` }, { value: 'yes_credit', label: 'Yes — in credit or financial decisions', sub: 'EU AI Act Annex III high-risk · DORA model risk' }, { value: 'yes_other', label: 'Yes — in other operational contexts', sub: 'Risk classification needed' }, { value: 'no_planned', label: 'Not yet but planning to deploy AI', sub: 'Governance framework needed before deployment' }, { value: 'no', label: 'No AI systems deployed', sub: 'EU AI Act unlikely to apply at this time' }] },
    // QUALIFICATION, NOT COMPLIANCE — and labelled as such. No entry fires on this answer and none
    // honestly could: every framework the old subtitles named ('Scope 3 Cat.1 likely low', 'SB 253
    // Scope 3 2027', 'CS3D HRDD') is gated on turnover, headcount or jurisdiction, which this form
    // already collects. Those subtitles asserted outcomes the answer cannot support — the same
    // defect as the old ownership question. It earns its step by telling an advisor where the work
    // actually is, so it goes to the internal alert and claims nothing in the results.
    { id: 'supply_chain' as keyof Answers, title: 'How complex is your supply chain?', sub: 'Nothing in your results turns on this answer — no obligation is triggered by it. It tells a ThemisIQ advisor where your effort will actually go.', type: 'options', options: [{ value: 'simple', label: 'Simple — few domestic suppliers', sub: 'A small supplier base, mostly in your own country' }, { value: 'moderate', label: 'Moderate — multiple countries', sub: 'Suppliers spread across several countries' }, { value: 'complex', label: 'Complex — global supply chain', sub: 'A global supplier base across many countries' }, { value: 'deep', label: 'Deep — multi-tier, high-risk geographies', sub: 'Multiple tiers, including suppliers in higher-risk regions' }] },
  ]

  // ── Step boundaries — EVERY GUARD *AND* EVERY SETTER DERIVES FROM HERE ──────
  // They used to be literals (email gate at step 7, results at 8, `step / 10` for the bar) against
  // an array of 8. That already meant `supply_chain`, the last entry, WAS NEVER RENDERED. Splitting
  // question 6 into two pushed `ai_use` to index 7, where the hardcoded gate would have swallowed it
  // and silently taken the whole EU AI Act entry off every result.
  //
  // DERIVING THE GUARDS IS ONLY HALF OF IT, and this comment used to claim otherwise — it said
  // derived boundaries made that class of drift impossible. They did not. Five READS were converted
  // (the two render guards, the question counter, the progress label, the intro copy) and one WRITE
  // was missed: the submit button still called setStep(8). Under the old layout 8 meant 'results';
  // once the array grew and supply_chain became a live question it meant the INDEX OF supply_chain,
  // so submitting the lead form re-showed a question and the results screen became unreachable.
  // A boundary is only derived when nothing can still ASSIGN a position by number.
  //
  // NOTHING IN THE PIPELINE CATCHES THIS. A stale integer is type-correct: `tsc --noEmit`, all 942
  // tests and `next build` passed with the broken literal, because the number is valid and there is
  // no test over app/assess/. It was found on 10 AUGUST 2026 BY A PERSON COMPLETING THE FORM and
  // reporting that submitting their name and email showed the supply-chain question again.
  //
  // The rule this leaves: a literal step index is allowed ONLY where it names a position that
  // cannot move. `0` qualifies — first question, useState and 'Start over'. A boundary does not.
  const EMAIL_STEP = questions.length
  const RESULTS_STEP = EMAIL_STEP + 1
  const pct = Math.round((step / RESULTS_STEP) * 100)

  const renderContent = () => {
    // Results
    if (step === RESULTS_STEP) return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, background: '#f8f7f5', border: '0.5px solid #e8e7e4', padding: '4px 14px', borderRadius: 99, marginBottom: 12, color: '#888784' }}>Your Compliance Obligation Map</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, marginBottom: 8, lineHeight: 1.2, color: '#0d0d0d' }}>
            We identified <span style={{ background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontStyle: 'italic' }}>{obligations.length} {obligations.length === 1 ? 'obligation' : 'obligations'}</span> that apply to your company.
          </h2>
          <p style={{ fontSize: 14, color: '#555553', fontWeight: 300 }}>{critical} {critical === 1 ? 'requires' : 'require'} immediate action. {high} {high === 1 ? 'is' : 'are'} high priority. Click each to expand.</p>
          {/* WHERE TO START — the only place the driver answer is shown back. It shapes which entries
              appear and was otherwise never surfaced, so a visitor got a list sorted by urgency with
              no indication of where to begin. The cells below answer "what buys this rule"; this
              answers "what do I buy first", which is the question the driver was asked to settle.

              CAPPED AT TWO MODULES, and the cap applies to the LINK as well as the label. Showing two
              while linking five would put a customer in a configurator holding modules the line never
              named — the same label-and-cart disagreement that made the module cells derive their
              label from the obligation rather than from `ob.module`.

              NO FIGURE ON THE REGULATORY UNION. Its module set is assembled across every obligation
              that fired, so a price would be the cost of everything at once, presented as a starting
              point — and it would move with the urgency mix rather than with anything the visitor
              chose. The five fixed drivers name a deliberate pair, so they carry theirs. */}
          {(() => {
            if (!isDriverId(answers.driver)) return null
            const fired = obligations.map(o => o.obligationId).filter((id): id is ObligationId => !!id)
            const start = driverModules(answers.driver, fired).slice(0, 2)
            // Empty is a TRUE statement — nothing fired that any module answers — and it renders as
            // nothing. A "Start with" heading over no modules reads as a rendering fault.
            if (start.length === 0) return null
            const priced = answers.driver !== 'regulatory'
            return (
              <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, marginTop: 10 }}>
                Start with{' '}
                <a href={modulesHref(start)} style={{ color: '#7425e3', fontWeight: 500, textDecoration: 'none' }}>
                  {modulesLabel(start)}{priced ? ` · ${priceLabel(modulesPrice(start))}` : ''} →
                </a>
              </p>
            )
          })()}
        </div>
        <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, marginTop: 1, color: '#0C447C' }}>✉</span>
          <div style={{ fontSize: 13, color: '#0C447C', lineHeight: 1.55 }}>
            We&apos;ve emailed a copy of your Compliance Obligation Map to <strong>{email.emailAddr || 'your inbox'}</strong>. If you don&apos;t see it within a few minutes, please check your spam or junk folder — and mark it &ldquo;not spam&rdquo; so future updates reach you.
          </div>
        </div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: '1.5rem' }}>
          {[{ val: critical, label: 'Immediate action', color: '#B91C1C' }, { val: high, label: 'High priority', color: '#ba7517' }, { val: obligations.length - critical - high, label: 'Monitor / annual', color: '#1fb1ff' }].map(({ val, label, color }) => (
            <div key={label} style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color, marginBottom: 2 }}>{val}</div>
              <div style={{ fontSize: 11, color: '#888784' }}>{label}</div>
            </div>
          ))}
        </div>
        {/* Two groups, regulatory first. An empty group renders NOTHING — no heading over no rows,
            which would read as "we checked and found none" when it can equally mean "you did not
            answer the question that would have produced one". */}
        {OBLIGATION_GROUPS.map(g => {
          const rows = obligations.filter(ob => ob.group === g.key)
          if (rows.length === 0) return null
          return (
            <div key={g.key} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{g.title}</h3>
              <p style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: 10 }}>{g.sub}</p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {rows.map(ob => (
                  /* Keyed on `name`, not on the index within the group — two groups both start at 0,
                     so an index key would make the first regulatory and first market card share an
                     expand state and open together. Names are unique within a result set. */
                  <div key={ob.name} style={{ border: '0.5px solid #e8e7e4', borderRadius: 10, overflow: 'hidden', background: '#fff', borderLeft: `4px solid ${URGENCY_COLOR[ob.urgency]}` }}>
                    <div onClick={() => toggleExpand(ob.name)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: URGENCY_COLOR[ob.urgency], flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{ob.name}</div>
                          <div style={{ fontSize: 11, color: '#888784', marginTop: 1 }}>{ob.jurisdiction} · {ob.timing}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: URGENCY_BG[ob.urgency], color: URGENCY_TEXT[ob.urgency] }}>{ob.urgency_label}</span>
                        <span style={{ color: '#888784', fontSize: 12 }}>{expanded[ob.name] ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    {expanded[ob.name] && (
                      <div style={{ padding: '0 14px 14px', borderTop: '0.5px solid #e8e7e4' }}>
                        <p style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, margin: '10px 0 8px', fontWeight: 300 }}>{ob.what}</p>
                        {/* MODULE CELL. Linked and priced ONLY where the entry maps to an
                            ObligationId. Where it does not — CSRD, the CS3D group route, the Pay
                            Transparency day-one duties, the six driver entries — it stays plain
                            text with NO href. Deliberately no /advisory or /pricing fallback: a
                            linked module is a promise that the thing on the other end can be bought
                            and will answer this entry, and a link that lands on a page which cannot
                            sell what the label names is worse than no link at all. */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' as const, marginBottom: 10 }}>
                          <span style={{ fontSize: 11, color: '#888784', flexShrink: 0 }}>Answered by</span>
                          {ob.obligationId ? (
                            <a href={obligationHref(ob.obligationId)} style={{ fontSize: 12, fontWeight: 500, color: '#7425e3', textDecoration: 'none' }}>
                              {obligationModuleLabel(ob.obligationId)} · {priceLabel(obligationPrice(ob.obligationId))} →
                            </a>
                          ) : (
                            <span style={{ fontSize: 12, color: '#555553' }}>{ob.module}</span>
                          )}
                        </div>
                        {/* ONE CTA. There were two, both pointing at /advisory, and the primary read
                            'ThemisIQ: {module} →' — styled as the action, worded like a module link,
                            landing on a page that sells nothing. With the module cell above carrying
                            the purchase, it also printed the module name twice. Commerce is the cell;
                            conversation is this. It stays on every card, mapped or not, because for
                            the entries that map to nothing an advisor is the only honest next step. */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                          <a href="/advisory" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 7, background: 'none', color: '#555553', border: '0.5px solid #e8e7e4', textDecoration: 'none' }}>Talk to an advisor</a>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', textAlign: 'center' as const }}>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#fff', marginBottom: 6 }}>Want help navigating all {obligations.length} obligations?</h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: '1.25rem', fontWeight: 300 }}>A ThemisIQ advisor will review your results and tell you exactly what to do first. No charge for the initial call.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            <a href="/advisory" style={{ fontSize: 13, fontWeight: 500, padding: '10px 24px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', textDecoration: 'none' }}>Book free consultation</a>
           <a href="/dashboard/ghg" style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', color: 'rgba(255,255,255,0.6)', border: '0.5px solid rgba(255,255,255,0.15)', textDecoration: 'none' }}>Calculate your emissions →</a>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button onClick={() => { setStep(0); setAnswers({}) }} style={{ fontSize: 12, color: '#888784', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Start over</button>
        </div>
      </div>
    )

    // Email gate
    if (step === EMAIL_STEP) return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>Almost there</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, marginBottom: 8, lineHeight: 1.2, color: '#0d0d0d' }}>Your compliance map is ready.</h2>
          <p style={{ fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.6 }}>Enter your details to see what applies to you — each with its timing, what it requires, and the ThemisIQ module that addresses it.</p>
        </div>
        <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: '#fff', marginBottom: 4 }}>Where should we send your results?</h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 300 }}>Results display instantly. We'll also email a PDF you can share with your board or legal team.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input value={email.first} onChange={e => setEmail(v => ({...v, first: e.target.value}))} placeholder="First name" style={inputStyle} />
            <input value={email.last} onChange={e => setEmail(v => ({...v, last: e.target.value}))} placeholder="Last name" style={inputStyle} />
          </div>
          <input value={email.emailAddr} onChange={e => setEmail(v => ({...v, emailAddr: e.target.value}))} placeholder="Work email address" type="email" style={inputStyle} />
          <input value={email.company} onChange={e => setEmail(v => ({...v, company: e.target.value}))} placeholder="Company name" style={inputStyle} />
          <input value={email.role} onChange={e => setEmail(v => ({...v, role: e.target.value}))} placeholder="Your role (e.g. CFO, Head of Sustainability)" style={inputStyle} />
          {/* setStep(RESULTS_STEP), never a literal. This was `setStep(8)`, which meant 'results'
              only while the email gate sat at a hardcoded step 7 and made questions[7] unreachable.
              Once the array grew and supply_chain became a live question, 8 was the index of
              supply_chain: the visitor submitted the form and was shown a question again. */}
          <button onClick={() => { if (email.emailAddr.includes("@")) { submitToAPI(); setStep(RESULTS_STEP) } }} style={{ fontSize: 14, fontWeight: 500, padding: 12, borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', cursor: 'pointer', marginTop: 4 }}>
            Show my Compliance Obligation Map →
          </button>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center' as const }}>No spam. No sales calls unless you ask.</p>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button onClick={goBack} style={backBtn}>← Back</button>
        </div>
      </div>
    )

    // Questions
    const q = questions[step]
    const val = answers[q.id]
    const multiVal = (answers[q.id] as string[] | undefined) || []
    const canProceed = q.type === 'slider' ? val !== undefined : q.type === 'options' ? !!val : multiVal.length > 0

    return (
      <div>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0d0d0d', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{step + 1}</div>
            <div style={{ fontSize: 11, color: '#888784' }}>Question {step + 1} of {EMAIL_STEP}</div>
          </div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, lineHeight: 1.25, marginBottom: 6, color: '#0d0d0d' }}>{q.title}</h2>
          <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.25rem' }}>{q.sub}</p>

          {q.type === 'slider' && (
            <div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', textAlign: 'center' as const, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 10 }}>
                {REVENUE_LABELS[val as number ?? 5]}
              </div>
              <input type="range" min={0} max={10} value={val as number ?? 5} onChange={e => setAnswers(a => ({ ...a, revenue: Number(e.target.value) }))} style={{ width: '100%', accentColor: '#7425e3' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888784', marginTop: 4 }}>
                <span>Under $50M</span><span>$10B+</span>
              </div>
            </div>
          )}

          {q.type === 'options' && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {q.options?.map(opt => (
                <div key={opt.value} onClick={() => setAnswers(a => ({ ...a, [q.id]: opt.value }))} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', border: `0.5px solid ${val === opt.value ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, cursor: 'pointer', background: val === opt.value ? 'rgba(116,37,227,0.04)' : '#fff' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${val === opt.value ? '#7425e3' : '#e8e7e4'}`, background: val === opt.value ? '#7425e3' : 'none', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {val === opt.value && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#888784', marginTop: 1 }}>{opt.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {q.type === 'multiselect' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {q.options?.map(opt => {
                const isSel = multiVal.includes(opt.value)
                return (
                  <div key={opt.value} onClick={() => { const cur = (answers[q.id] as string[] | undefined) || []; setAnswers(a => ({ ...a, [q.id]: cur.includes(opt.value) ? cur.filter(v => v !== opt.value) : [...cur, opt.value] })) }} style={{ padding: '12px 14px', border: `0.5px solid ${isSel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, cursor: 'pointer', background: isSel ? 'rgba(116,37,227,0.04)' : '#fff', position: 'relative' as const }}>
                    <div style={{ position: 'absolute' as const, top: 10, right: 10, width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${isSel ? '#7425e3' : '#e8e7e4'}`, background: isSel ? '#7425e3' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isSel && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 3, paddingRight: 24 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#888784' }}>{opt.sub}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={goBack} disabled={step === 0} style={{ ...backBtn, opacity: step === 0 ? 0.3 : 1 }}>← Back</button>
          <button onClick={goNext} disabled={!canProceed} style={{ fontSize: 13, fontWeight: 500, padding: '10px 28px', borderRadius: 8, background: canProceed ? '#0d0d0d' : '#e8e7e4', color: canProceed ? '#fff' : '#888784', border: 'none', cursor: canProceed ? 'pointer' : 'not-allowed' }}>Continue →</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', color: '#0d0d0d' }}>

      {/* Progress bar */}
      {step < RESULTS_STEP && (
        <div style={{ background: '#fff', padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '0.5px solid #e8e7e4' }}>
          <div style={{ flex: 1, height: 4, background: '#e8e7e4', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e)', borderRadius: 99, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: '#888784', whiteSpace: 'nowrap' as const }}>
            {step < EMAIL_STEP ? `Step ${step + 1} of ${EMAIL_STEP}` : 'Almost done'}
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ padding: '2.5rem 1.5rem' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>

          {/* Logo — always visible at top */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <a href="/" style={{ display: "block", textAlign: "center" }}>
              <img src="/logo.png" alt="ThemisIQ" style={{ height: 64, width: "auto", mixBlendMode: "multiply", display: "block", margin: "0 auto" }} />
            </a>
          </div>

          {/* Intro text — only on step 0 */}
          {step === 0 && (
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12 }}>Free · 3 minutes · Instant results</div>
              <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '0.75rem', color: '#0d0d0d' }}>
                Which compliance regulations<br />apply to <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>your company?</span>
              </h1>
              <p style={{ fontSize: 15, color: '#555553', fontWeight: 300, lineHeight: 1.7, maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
                Answer {EMAIL_STEP} questions. Get a personalised Compliance Obligation Map — the rules that apply to you, what your customers and investors are asking for, and the ThemisIQ module that addresses each one.
              </p>
            </div>
          )}

          {renderContent()}

        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '11px 14px', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#fff', outline: 'none' }
const backBtn: React.CSSProperties = { fontSize: 13, fontWeight: 400, padding: '10px 20px', borderRadius: 8, background: 'none', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }
