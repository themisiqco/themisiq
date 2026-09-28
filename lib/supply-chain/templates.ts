// Supplier questionnaire definition — the single source of truth for what the
// questionnaire asks. Consumed by the supplier-facing portal (app/supplier/[token])
// and the buyer-facing response viewer.
//
// It previously existed twice: a full copy in the portal and an abbreviated
// { id, label } copy in the viewer. They drifted — the viewer was missing the three
// s3cat1_* questions entirely (so those answers were invisible to the buyer) and
// disagreed with the portal on 68 of 75 shared labels, several of which dropped
// qualifiers that change what the answer means ("in the past 3 years", "if
// processing EU personal data"). One definition, one wording.

// ⚠️ SECTION COLOURS ARE CATEGORY ACCENTS, NOT STATES, AND THREE OF THEM MOVED ON 25 SEP 2026. The
// Sustainable Procurement, Child Labour and Monitoring & Disclosure headers carried
// --color-module-climate, which is the Climate Risk module's hue and was also the platform's warning
// colour. None of those sections is a warning and none belongs to Climate Risk: "Forced & Compulsory
// Labour" is drawn in red and "Prevention & Remediation" in green, and neither is a claim. They are
// categories that need telling apart. The three now read --color-accent-amber, same value.
//   ⚠️ THE OTHER TEN STILL CARRY LITERALS, four of them the retired brand violet #7425e3, which is
// deliberately not an accent token yet. docs/backlog.md carries both.

export type QuestionType = 'radio' | 'checkbox' | 'number' | 'text' | 'textarea'

/**
 * What an answer means to a buyer reading the response viewer.
 *
 * ⚠️ THE TONE IS ON THE OPTION BECAUSE MEANING IS PER QUESTION, and the alternative was measured and
 * found wrong. The viewer used to prefix-match the answer's prose against two global lists, testing the
 * positive list first, so `'yes'` matched before anything else could: on 27 Sep 2026 **Yes — unresolved**
 * rendered GREEN on child labour (`lab_child`, `ms_child_incidents`), on corruption (`eth_incidents`) and
 * on forced labour (`ms_forced`), **Yes — ongoing** rendered green on regulatory sanctions, and the good
 * answers — `No` on sanctions, `No — confirmed through assessment` on forced labour, `No harm identified`
 * on remediation — rendered RED. No global map can fix that: `no` is the good answer for `eth_sanctions`
 * and the bad answer for `env_policy`.
 *
 * ⚠️ AND A QUALIFIED YES IS NOT A YES. An answer that is informal, ad hoc, occasional, not yet enforced,
 * or limited in scope is 'watch', whether or not it begins with "Yes" — because the buyer is judging the
 * practice, not the grammar. options.test.ts enforces this from the label text, with a named allow-list
 * for the handful where a qualifier does not weaken the answer (an internal policy is a complete policy).
 *
 * 'neutral' is for an answer that carries no signal either way: a stated non-obligation, a valid choice
 * among equals (which GHG Protocol boundary), or "Other". It renders in muted ink, never a state colour,
 * so the traffic light keeps meaning what it says.
 */
export type Tone = 'good' | 'watch' | 'bad' | 'neutral'

/**
 * ⚠️ `value` IS WHAT IS STORED, `label` IS WHAT IS READ. Until 27 Sep 2026 the label WAS the stored value:
 * supplier_responses.response held the prose, the portal compared it with `===` to know which radio was
 * selected, and lib/scope3/supplierAssurance.ts matched four of them exactly. Rewording an option
 * therefore orphaned every answer already given to it and silently changed an assurance state. Values are
 * slugs of the labels as they stood that day, so the mapping is total and reversible, and the labels are
 * free to change.
 */
export interface QuestionOption {
  value: string
  label: string
  tone: Tone
  /**
   * The wording this option carried before the labels were swept, where it has changed.
   *
   * ⚠️ IT IS A DATA KEY, NOT COPY, AND IT IS NEVER SHOWN. Answers stored before 27 Sep 2026 hold the
   * option's prose, and every `supplier_assurance_raw` frozen into a scope3_category_snapshot still does
   * — a snapshot is the record of what was reported and is never rewritten. optionValue() therefore
   * accepts this form as well, which is what lets a historic row resolve to its option and read with the
   * CURRENT label. Removing one of these silently turns those rows into answers that match nothing.
   *
   * It is also what db/sql/supplier-options/ maps FROM: the backfill looks for what is stored, and what
   * is stored is this, not the label above it.
   */
  legacyLabel?: string
}

export interface Question {
  id: string
  // A union, not a bare string: the render arms in the portal switch on this, and
  // an unhandled value renders a labelled question with no input at all.
  type: QuestionType
  label: string
  hint?: string
  options?: QuestionOption[]
}

export interface Section {
  id: string
  title: string
  color: string
  bg: string
  desc: string
  questions: Question[]
}

export const TEMPLATES: Record<string, { sections: Section[] }> = {

  // ── EcoVadis-style (full 38 questions) ──────────────────────────────────────
  ecovadis: {
    sections: [
      {
        id: 'environment', title: 'Environment', color: '#0F6E56', bg: '#E1F5EE',
        desc: 'Energy, emissions, environmental management',
        questions: [
          { id: 'env_policy', type: 'radio', label: 'Does your company have a formal environmental policy?', options: [
            { value: 'yes_board_approved', label: 'Yes, board approved', tone: 'good', legacyLabel: 'Yes — board approved' },
            { value: 'yes_management_approved', label: 'Yes, management approved', tone: 'good', legacyLabel: 'Yes — management approved' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'env_iso14001', type: 'radio', label: 'Is your company certified to ISO 14001?', options: [
            { value: 'yes_current_certificate', label: 'Yes, current certificate', tone: 'good', legacyLabel: 'Yes — current certificate' },
            { value: 'in_progress', label: 'In progress', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'env_ghg_scope1', type: 'number', label: 'Scope 1 emissions (mt CO₂e)', hint: 'Direct emissions from owned/controlled sources. Enter 0 if not measured.' },
          { id: 'env_ghg_scope2', type: 'number', label: 'Scope 2 emissions (mt CO₂e)', hint: 'Indirect emissions from purchased electricity. Enter 0 if not measured.' },
          { id: 'env_ghg_scope3', type: 'number', label: 'Scope 3 emissions (mt CO₂e)', hint: 'Value chain emissions. Enter 0 if not measured.' },
          { id: 's3cat1_allocated', type: 'number', label: 'Emissions attributable to purchases by your customer (mt CO₂e)', hint: 'Of your total footprint above, the share attributable to the goods/services THIS customer purchased from you this reporting year. This is what feeds their Scope 3 Category 1. Leave blank if you cannot allocate it.' },
          { id: 's3cat1_method', type: 'text', label: 'How did you allocate that figure?', hint: 'e.g. by share of revenue, by units shipped, or by mass. Helps your customer document the method for their auditor.' },
          { id: 's3cat1_quality', type: 'radio', label: 'Basis of the attributable figure', options: [
            { value: 'measured_supplier_specific', label: 'Measured / supplier-specific', tone: 'good' },
            { value: 'estimated', label: 'Estimated', tone: 'watch' },
            { value: 'not_provided', label: 'Not provided', tone: 'watch' },
          ] },
          { id: 'env_ghg_year', type: 'text', label: 'Emissions reporting year', hint: 'e.g. 2024' },
          { id: 'env_renewable', type: 'radio', label: 'Do you use renewable energy?', options: [
            { value: 'yes_more_than_50', label: 'Yes, more than 50%', tone: 'good', legacyLabel: 'Yes — more than 50%' },
            { value: 'yes_less_than_50', label: 'Yes, less than 50%', tone: 'watch', legacyLabel: 'Yes — less than 50%' },
            { value: 'in_progress', label: 'In progress', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'env_target', type: 'radio', label: 'Has your company set a carbon reduction target?', options: [
            { value: 'yes_science_based_sbti', label: 'Yes, science-based (SBTi)', tone: 'good', legacyLabel: 'Yes — science-based (SBTi)' },
            { value: 'yes_internal_target', label: 'Yes, internal target', tone: 'good', legacyLabel: 'Yes — internal target' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'env_reporting', type: 'checkbox', label: 'Do you report to any environmental framework?', options: [
            { value: 'cdp', label: 'CDP', tone: 'good' },
            { value: 'gri', label: 'GRI', tone: 'good' },
            { value: 'esrs_csrd', label: 'ESRS/CSRD', tone: 'good' },
            { value: 'ecovadis', label: 'EcoVadis', tone: 'good' },
            { value: 'other', label: 'Other', tone: 'neutral' },
            { value: 'none', label: 'None', tone: 'bad' },
          ] },
        ],
      },
      {
        id: 'labour', title: 'Labour & Human Rights', color: '#7425e3', bg: '#EDE9FE',
        desc: 'Health & safety, working conditions, human rights',
        questions: [
          { id: 'lab_policy', type: 'radio', label: 'Does your company have a formal health & safety policy?', options: [
            { value: 'yes_board_approved', label: 'Yes, board approved', tone: 'good', legacyLabel: 'Yes — board approved' },
            { value: 'yes_management_approved', label: 'Yes, management approved', tone: 'good', legacyLabel: 'Yes — management approved' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'lab_iso45001', type: 'radio', label: 'Is your company certified to ISO 45001?', options: [
            { value: 'yes_current_certificate', label: 'Yes, current certificate', tone: 'good', legacyLabel: 'Yes — current certificate' },
            { value: 'in_progress', label: 'In progress', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'lab_ltifr', type: 'number', label: 'Lost Time Injury Frequency Rate (LTIFR)', hint: 'Injuries per million hours worked. Enter 0 if none.' },
          { id: 'lab_fatalities', type: 'number', label: 'Work-related fatalities in reporting year', hint: 'Enter 0 if none.' },
          { id: 'lab_hours', type: 'radio', label: 'Do all workers comply with maximum working hour regulations?', options: [
            { value: 'yes_always', label: 'Yes, always', tone: 'good', legacyLabel: 'Yes — always' },
            { value: 'mostly_occasional_exceptions', label: 'Mostly, with occasional exceptions', tone: 'watch', legacyLabel: 'Mostly — occasional exceptions' },
            { value: 'no', label: 'No', tone: 'bad' },
            { value: 'unknown', label: 'Unknown', tone: 'bad' },
          ] },
          { id: 'lab_wages', type: 'radio', label: 'Do all workers receive at least the legal minimum wage?', options: [
            { value: 'yes_all_workers', label: 'Yes, all workers', tone: 'good', legacyLabel: 'Yes — all workers' },
            { value: 'yes_direct_employees_only', label: 'Yes, direct employees only', tone: 'watch', legacyLabel: 'Yes — direct employees only' },
            { value: 'no', label: 'No', tone: 'bad' },
            { value: 'unknown', label: 'Unknown', tone: 'bad' },
          ] },
          { id: 'lab_freedom', type: 'radio', label: 'Do workers have freedom of association rights?', options: [
            { value: 'yes_fully_respected', label: 'Yes, fully respected', tone: 'good', legacyLabel: 'Yes — fully respected' },
            { value: 'partially', label: 'Partially', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
            { value: 'unknown', label: 'Unknown', tone: 'bad' },
          ] },
          { id: 'lab_forced', type: 'radio', label: 'Has your company conducted a forced labour risk assessment?', options: [
            { value: 'yes_documented', label: 'Yes, documented', tone: 'good', legacyLabel: 'Yes — documented' },
            { value: 'informal_assessment', label: 'Informal assessment', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'lab_child', type: 'radio', label: 'Have there been any child labour incidents in the past 3 years?', options: [
            { value: 'no_incidents', label: 'No incidents', tone: 'good' },
            { value: 'yes_remediated', label: 'Yes, remediated', tone: 'watch', legacyLabel: 'Yes — remediated' },
            { value: 'yes_unresolved', label: 'Yes, unresolved', tone: 'bad', legacyLabel: 'Yes — unresolved' },
            { value: 'unknown', label: 'Unknown', tone: 'bad' },
          ] },
          { id: 'lab_hrdd', type: 'radio', label: 'Has your company conducted a human rights due diligence (HRDD) assessment?', options: [
            { value: 'yes_documented', label: 'Yes, documented', tone: 'good', legacyLabel: 'Yes — documented' },
            { value: 'in_progress', label: 'In progress', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
        ],
      },
      {
        id: 'ethics', title: 'Ethics', color: '#0C447C', bg: '#E6F1FB',
        desc: 'Anti-corruption, whistleblowing, data privacy',
        questions: [
          { id: 'eth_anticorruption', type: 'radio', label: 'Does your company have a formal anti-corruption policy?', options: [
            { value: 'yes_board_approved', label: 'Yes, board approved', tone: 'good', legacyLabel: 'Yes — board approved' },
            { value: 'yes_management_approved', label: 'Yes, management approved', tone: 'good', legacyLabel: 'Yes — management approved' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'eth_training', type: 'radio', label: 'Do employees receive anti-corruption training?', options: [
            { value: 'yes_mandatory_annual', label: 'Yes, mandatory annual', tone: 'good', legacyLabel: 'Yes — mandatory annual' },
            { value: 'yes_on_joining', label: 'Yes, on joining', tone: 'good', legacyLabel: 'Yes — on joining' },
            { value: 'ad_hoc', label: 'Ad hoc', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'eth_incidents', type: 'radio', label: 'Have there been any corruption or bribery incidents in the past 3 years?', options: [
            { value: 'no_incidents', label: 'No incidents', tone: 'good' },
            { value: 'yes_investigated_and_resolved', label: 'Yes, investigated and resolved', tone: 'watch', legacyLabel: 'Yes — investigated and resolved' },
            { value: 'yes_unresolved', label: 'Yes, unresolved', tone: 'bad', legacyLabel: 'Yes — unresolved' },
            { value: 'unknown', label: 'Unknown', tone: 'bad' },
          ] },
          { id: 'eth_whistleblower', type: 'radio', label: 'Does your company have a whistleblower/grievance mechanism?', options: [
            { value: 'yes_anonymous_channel_available', label: 'Yes, anonymous channel available', tone: 'good', legacyLabel: 'Yes — anonymous channel available' },
            { value: 'yes_named_reporting_only', label: 'Yes, named reporting only', tone: 'good', legacyLabel: 'Yes — named reporting only' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'eth_conflicts', type: 'radio', label: 'Does your company have a conflicts of interest policy?', options: [
            { value: 'yes_documented', label: 'Yes, documented', tone: 'good', legacyLabel: 'Yes — documented' },
            { value: 'informal', label: 'Informal', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'eth_gdpr', type: 'radio', label: 'Is your company GDPR compliant (if processing EU personal data)?', options: [
            { value: 'yes_fully_compliant', label: 'Yes, fully compliant', tone: 'good', legacyLabel: 'Yes — fully compliant' },
            { value: 'partially_compliant', label: 'Partially compliant', tone: 'watch' },
            { value: 'not_applicable', label: 'Not applicable', tone: 'neutral' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'eth_sanctions', type: 'radio', label: 'Has your company been subject to regulatory sanctions in the past 3 years?', options: [
            { value: 'no', label: 'No', tone: 'good' },
            { value: 'yes_resolved', label: 'Yes, resolved', tone: 'watch', legacyLabel: 'Yes — resolved' },
            { value: 'yes_ongoing', label: 'Yes, ongoing', tone: 'bad', legacyLabel: 'Yes — ongoing' },
          ] },
        ],
      },
      {
        id: 'procurement', title: 'Sustainable Procurement', color: 'var(--color-accent-amber)', bg: 'var(--color-accent-amber-wash)',
        desc: 'Your own supply chain sustainability practices',
        questions: [
          { id: 'proc_code', type: 'radio', label: 'Do you have a supplier code of conduct?', options: [
            { value: 'yes_signed_by_suppliers', label: 'Yes, signed by suppliers', tone: 'good', legacyLabel: 'Yes — signed by suppliers' },
            { value: 'yes_not_yet_enforced', label: 'Yes, not yet enforced', tone: 'watch', legacyLabel: 'Yes — not yet enforced' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'proc_assess', type: 'radio', label: 'Do you assess your own suppliers for sustainability risks?', options: [
            { value: 'yes_all_key_suppliers', label: 'Yes, all key suppliers', tone: 'good', legacyLabel: 'Yes — all key suppliers' },
            { value: 'yes_selected_suppliers', label: 'Yes, selected suppliers', tone: 'good', legacyLabel: 'Yes — selected suppliers' },
            { value: 'occasionally', label: 'Occasionally', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'proc_audit', type: 'radio', label: 'Do you conduct or require third-party audits of suppliers?', options: [
            { value: 'yes_regular_audits', label: 'Yes, regular audits', tone: 'good', legacyLabel: 'Yes — regular audits' },
            { value: 'yes_occasional', label: 'Yes, occasional', tone: 'watch', legacyLabel: 'Yes — occasional' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'proc_traceability', type: 'radio', label: 'Can you trace your key raw materials to source?', options: [
            { value: 'yes_tier_1_and_beyond', label: 'Yes, tier 1 and beyond', tone: 'good', legacyLabel: 'Yes — tier 1 and beyond' },
            { value: 'yes_tier_1_only', label: 'Yes, tier 1 only', tone: 'watch', legacyLabel: 'Yes — tier 1 only' },
            { value: 'partially', label: 'Partially', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'proc_ecovadis', type: 'radio', label: 'Does your company have an EcoVadis rating?', options: [
            { value: 'yes_gold', label: 'Yes, Gold', tone: 'good', legacyLabel: 'Yes — Gold' },
            { value: 'yes_silver', label: 'Yes, Silver', tone: 'good', legacyLabel: 'Yes — Silver' },
            { value: 'yes_bronze', label: 'Yes, Bronze', tone: 'good', legacyLabel: 'Yes — Bronze' },
            { value: 'yes_rated_no_medal', label: 'Yes, rated (no medal)', tone: 'watch', legacyLabel: 'Yes — rated (no medal)' },
            { value: 'no_rating', label: 'No rating', tone: 'watch' },
          ] },
          { id: 'proc_scope3cat1', type: 'radio', label: 'Do you collect primary emissions data from your own suppliers?', options: [
            { value: 'yes_most_suppliers', label: 'Yes, most suppliers', tone: 'good', legacyLabel: 'Yes — most suppliers' },
            { value: 'yes_key_suppliers_only', label: 'Yes, key suppliers only', tone: 'good', legacyLabel: 'Yes — key suppliers only' },
            { value: 'no_spend_based_only', label: 'No, spend-based only', tone: 'watch', legacyLabel: 'No — spend-based only' },
            { value: 'no_measurement', label: 'No measurement', tone: 'bad' },
          ] },
        ],
      },
    ],
  },

  // ── Scope 3 Cat.1 (8 questions) ─────────────────────────────────────────────
  scope3: {
    sections: [
      {
        id: 'emissions', title: 'GHG Emissions Data', color: '#0F6E56', bg: '#E1F5EE',
        desc: 'Greenhouse gas emissions, energy use and reduction targets',
        questions: [
          { id: 's3_scope1', type: 'number', label: 'Scope 1 emissions (mt CO₂e)', hint: 'Direct emissions from owned/controlled sources. Enter 0 if not yet measured.' },
          { id: 's3_scope2_lb', type: 'number', label: 'Scope 2 emissions — location-based (mt CO₂e)', hint: 'Based on grid average emission factors.' },
          { id: 's3_scope2_mb', type: 'number', label: 'Scope 2 emissions — market-based (mt CO₂e)', hint: 'Based on contractual instruments. Enter 0 if not available.' },
          { id: 's3_scope3', type: 'number', label: 'Scope 3 emissions — total (mt CO₂e)', hint: 'All value chain emissions combined. Enter 0 if not yet measured.' },
          { id: 's3cat1_allocated', type: 'number', label: 'Emissions attributable to purchases by your customer (mt CO₂e)', hint: 'Of your total footprint above, the share attributable to the goods/services THIS customer purchased from you this reporting year. This is what feeds their Scope 3 Category 1. Leave blank if you cannot allocate it.' },
          { id: 's3cat1_method', type: 'text', label: 'How did you allocate that figure?', hint: 'e.g. by share of revenue, by units shipped, or by mass. Helps your customer document the method for their auditor.' },
          { id: 's3cat1_quality', type: 'radio', label: 'Basis of the attributable figure', options: [
            { value: 'measured_supplier_specific', label: 'Measured / supplier-specific', tone: 'good' },
            { value: 'estimated', label: 'Estimated', tone: 'watch' },
            { value: 'not_provided', label: 'Not provided', tone: 'watch' },
          ] },
          { id: 's3_year', type: 'text', label: 'Reporting year', hint: 'e.g. 2024' },
          { id: 's3_boundary', type: 'radio', label: 'What organisational boundary do you use?', options: [
            { value: 'operational_control', label: 'Operational control', tone: 'neutral' },
            { value: 'financial_control', label: 'Financial control', tone: 'neutral' },
            { value: 'equity_share', label: 'Equity share', tone: 'neutral' },
            { value: 'not_defined', label: 'Not defined', tone: 'bad' },
          ] },
          { id: 's3_renewable', type: 'radio', label: 'What percentage of your electricity comes from renewable sources?', options: [
            { value: '100', label: '100%', tone: 'good' },
            { value: '75_99', label: '75–99%', tone: 'good' },
            { value: '50_74', label: '50–74%', tone: 'watch' },
            { value: '25_49', label: '25–49%', tone: 'watch' },
            { value: 'less_than_25', label: 'Less than 25%', tone: 'watch' },
            { value: 'none', label: 'None', tone: 'bad' },
            { value: 'unknown', label: 'Unknown', tone: 'watch' },
          ] },
          { id: 's3_target', type: 'radio', label: 'Has your company set a carbon reduction target?', options: [
            { value: 'yes_science_based_sbti_committed', label: 'Yes, science-based (SBTi committed)', tone: 'good', legacyLabel: 'Yes — science-based (SBTi committed)' },
            { value: 'yes_sbti_approved', label: 'Yes, SBTi approved', tone: 'good', legacyLabel: 'Yes — SBTi approved' },
            { value: 'yes_net_zero_target', label: 'Yes, net zero target', tone: 'good', legacyLabel: 'Yes — net zero target' },
            { value: 'yes_internal_reduction_target', label: 'Yes, internal reduction target', tone: 'good', legacyLabel: 'Yes — internal reduction target' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no_target', label: 'No target', tone: 'bad' },
          ] },
          { id: 's3_assurance', type: 'radio', label: 'Are your emissions figures independently assured?', options: [
            { value: 'yes_limited_assurance', label: 'Yes, limited assurance', tone: 'good', legacyLabel: 'Yes — limited assurance' },
            { value: 'yes_reasonable_assurance', label: 'Yes, reasonable assurance', tone: 'good', legacyLabel: 'Yes — reasonable assurance' },
            { value: 'no_internal_only', label: 'No, internal only', tone: 'watch', legacyLabel: 'No — internal only' },
            { value: 'no_measurement', label: 'No measurement', tone: 'bad' },
          ] },
        ],
      },
    ],
  },

  // ── Modern Slavery Act (12 questions) ───────────────────────────────────────
  modern_slavery: {
    sections: [
      {
        id: 'forced_labour', title: 'Forced & Compulsory Labour', color: '#B91C1C', bg: '#FCEBEB',
        desc: 'Forced labour, debt bondage and worker freedom',
        questions: [
          { id: 'ms_policy', type: 'radio', label: 'Does your company have a formal modern slavery or human trafficking policy?', options: [
            { value: 'yes_publicly_available', label: 'Yes, publicly available', tone: 'good', legacyLabel: 'Yes — publicly available' },
            { value: 'yes_internal_only', label: 'Yes, internal only', tone: 'good', legacyLabel: 'Yes — internal only' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'ms_risk_assess', type: 'radio', label: 'Has your company conducted a modern slavery risk assessment?', options: [
            { value: 'yes_documented_and_reviewed_annually', label: 'Yes, documented and reviewed annually', tone: 'good', legacyLabel: 'Yes — documented and reviewed annually' },
            { value: 'yes_conducted_once', label: 'Yes, conducted once', tone: 'good', legacyLabel: 'Yes — conducted once' },
            { value: 'in_progress', label: 'In progress', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'ms_forced', type: 'radio', label: 'Has your company identified any forced labour in its operations or supply chain in the past 3 years?', options: [
            { value: 'no_confirmed_through_assessment', label: 'No, confirmed through assessment', tone: 'good', legacyLabel: 'No — confirmed through assessment' },
            { value: 'no_not_assessed', label: 'No, not assessed', tone: 'bad', legacyLabel: 'No — not assessed' },
            { value: 'yes_remediated', label: 'Yes, remediated', tone: 'watch', legacyLabel: 'Yes — remediated' },
            { value: 'yes_unresolved', label: 'Yes, unresolved', tone: 'bad', legacyLabel: 'Yes — unresolved' },
          ] },
          { id: 'ms_recruitment', type: 'radio', label: 'Does your company prohibit the use of recruitment fees charged to workers?', options: [
            { value: 'yes_policy_in_place_and_enforced', label: 'Yes, policy in place and enforced', tone: 'good', legacyLabel: 'Yes — policy in place and enforced' },
            { value: 'yes_policy_in_place', label: 'Yes, policy in place', tone: 'good', legacyLabel: 'Yes — policy in place' },
            { value: 'no_explicit_prohibition', label: 'No explicit prohibition', tone: 'bad' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
        ],
      },
      {
        id: 'child_labour', title: 'Child Labour', color: 'var(--color-accent-amber)', bg: 'var(--color-accent-amber-wash)',
        desc: 'Child labour prevention and minimum age compliance',
        questions: [
          { id: 'ms_child_policy', type: 'radio', label: 'Does your company have a minimum age policy aligned to ILO Convention 138?', options: [
            { value: 'yes_documented_and_enforced', label: 'Yes, documented and enforced', tone: 'good', legacyLabel: 'Yes — documented and enforced' },
            { value: 'yes_informal', label: 'Yes, informal', tone: 'watch', legacyLabel: 'Yes — informal' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'ms_child_incidents', type: 'radio', label: 'Have there been any child labour incidents in your operations or supply chain in the past 3 years?', options: [
            { value: 'no_incidents', label: 'No incidents', tone: 'good' },
            { value: 'yes_investigated_and_remediated', label: 'Yes, investigated and remediated', tone: 'watch', legacyLabel: 'Yes — investigated and remediated' },
            { value: 'yes_unresolved', label: 'Yes, unresolved', tone: 'bad', legacyLabel: 'Yes — unresolved' },
            { value: 'unknown', label: 'Unknown', tone: 'bad' },
          ] },
        ],
      },
      {
        id: 'due_diligence', title: 'Due Diligence & Remediation', color: '#0C447C', bg: '#E6F1FB',
        desc: 'Supply chain due diligence and grievance mechanisms',
        questions: [
          { id: 'ms_dd_suppliers', type: 'radio', label: 'Do you conduct modern slavery due diligence on your suppliers?', options: [
            { value: 'yes_all_tier_1_suppliers', label: 'Yes, all tier 1 suppliers', tone: 'good', legacyLabel: 'Yes — all tier 1 suppliers' },
            { value: 'yes_high_risk_suppliers_only', label: 'Yes, high-risk suppliers only', tone: 'good', legacyLabel: 'Yes — high-risk suppliers only' },
            { value: 'occasionally', label: 'Occasionally', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'ms_grievance', type: 'radio', label: 'Does your company have a grievance mechanism accessible to workers in your supply chain?', options: [
            { value: 'yes_anonymous_and_accessible', label: 'Yes, anonymous and accessible', tone: 'good', legacyLabel: 'Yes — anonymous and accessible' },
            { value: 'yes_limited_access', label: 'Yes, limited access', tone: 'good', legacyLabel: 'Yes — limited access' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'ms_training', type: 'radio', label: 'Do relevant employees receive training on modern slavery recognition?', options: [
            { value: 'yes_mandatory_annual', label: 'Yes, mandatory annual', tone: 'good', legacyLabel: 'Yes — mandatory annual' },
            { value: 'yes_on_induction', label: 'Yes, on induction', tone: 'good', legacyLabel: 'Yes — on induction' },
            { value: 'ad_hoc', label: 'Ad hoc', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'ms_statement', type: 'radio', label: 'Does your company publish a Modern Slavery Act transparency statement?', options: [
            { value: 'yes_annual_board_approved', label: 'Yes, annual and board approved', tone: 'good', legacyLabel: 'Yes — annual, board approved' },
            { value: 'yes_published_but_not_annual', label: 'Yes, published but not annual', tone: 'good', legacyLabel: 'Yes — published but not annual' },
            { value: 'no_below_threshold', label: 'No, below threshold', tone: 'neutral', legacyLabel: 'No — below threshold' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'ms_kpis', type: 'radio', label: 'Does your company track KPIs to measure effectiveness of modern slavery actions?', options: [
            { value: 'yes_reported_publicly', label: 'Yes, reported publicly', tone: 'good', legacyLabel: 'Yes — reported publicly' },
            { value: 'yes_internal_only', label: 'Yes, internal only', tone: 'good', legacyLabel: 'Yes — internal only' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'ms_incidents_reported', type: 'number', label: 'Number of modern slavery concerns reported via grievance mechanism in past year', hint: 'Enter 0 if none reported.' },
        ],
      },
    ],
  },

  // ── CS3D HRDD (15 questions) ─────────────────────────────────────────────────
  cs3d: {
    sections: [
      {
        id: 'hrdd_governance', title: 'HRDD Governance', color: '#0C447C', bg: '#E6F1FB',
        desc: 'Human rights due diligence governance and policy',
        questions: [
          { id: 'cs_policy', type: 'radio', label: 'Does your company have a human rights policy aligned to the UN Guiding Principles (UNGPs)?', options: [
            { value: 'yes_publicly_available_board_approved', label: 'Yes, publicly available and board approved', tone: 'good', legacyLabel: 'Yes — publicly available, board approved' },
            { value: 'yes_internal_policy', label: 'Yes, internal policy', tone: 'good', legacyLabel: 'Yes — internal policy' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'cs_governance', type: 'radio', label: 'Is board or senior management accountable for human rights due diligence?', options: [
            { value: 'yes_board_level', label: 'Yes, board level', tone: 'good', legacyLabel: 'Yes — board level' },
            { value: 'yes_senior_management', label: 'Yes, senior management', tone: 'good', legacyLabel: 'Yes — senior management' },
            { value: 'delegated_to_sustainability_team', label: 'Delegated to sustainability team', tone: 'watch' },
            { value: 'no_formal_accountability', label: 'No formal accountability', tone: 'bad' },
          ] },
          { id: 'cs_scope', type: 'radio', label: 'Does your HRDD programme cover your full value chain (upstream and downstream)?', options: [
            { value: 'yes_full_value_chain', label: 'Yes, full value chain', tone: 'good', legacyLabel: 'Yes — full value chain' },
            { value: 'yes_direct_suppliers_only', label: 'Yes, direct suppliers only', tone: 'watch', legacyLabel: 'Yes — direct suppliers only' },
            { value: 'operations_only', label: 'Operations only', tone: 'watch' },
            { value: 'no_hrdd_programme', label: 'No HRDD programme', tone: 'bad' },
          ] },
        ],
      },
      {
        id: 'hrdd_identification', title: 'Risk Identification', color: '#7425e3', bg: '#EDE9FE',
        desc: 'Identification and assessment of human rights risks',
        questions: [
          { id: 'cs_risk_assess', type: 'radio', label: 'Does your company conduct human rights risk assessments?', options: [
            { value: 'yes_annual_documented', label: 'Yes, annual and documented', tone: 'good', legacyLabel: 'Yes — annual, documented' },
            { value: 'yes_ad_hoc', label: 'Yes, ad hoc', tone: 'watch', legacyLabel: 'Yes — ad hoc' },
            { value: 'in_progress', label: 'In progress', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'cs_risk_method', type: 'radio', label: 'What methodology do you use for human rights risk assessment?', options: [
            { value: 'ungp_aligned_framework', label: 'UNGP-aligned framework', tone: 'good' },
            { value: 'industry_sector_standard', label: 'Industry sector standard', tone: 'watch' },
            { value: 'internal_methodology', label: 'Internal methodology', tone: 'watch' },
            { value: 'third_party_assessment', label: 'Third-party assessment', tone: 'good' },
            { value: 'none', label: 'None', tone: 'bad' },
          ] },
          { id: 'cs_salient', type: 'radio', label: 'Has your company identified its salient human rights issues?', options: [
            { value: 'yes_publicly_disclosed', label: 'Yes, publicly disclosed', tone: 'good', legacyLabel: 'Yes — publicly disclosed' },
            { value: 'yes_internal_only', label: 'Yes, internal only', tone: 'good', legacyLabel: 'Yes — internal only' },
            { value: 'in_progress', label: 'In progress', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'cs_high_risk', type: 'radio', label: 'Have you identified high-risk geographies or sectors in your supply chain?', options: [
            { value: 'yes_documented_and_monitored', label: 'Yes, documented and monitored', tone: 'good', legacyLabel: 'Yes — documented and monitored' },
            { value: 'yes_identified_informally', label: 'Yes, identified informally', tone: 'watch', legacyLabel: 'Yes — identified informally' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
        ],
      },
      {
        id: 'hrdd_action', title: 'Prevention & Remediation', color: '#0F6E56', bg: '#E1F5EE',
        desc: 'Actions taken to prevent and remediate human rights harms',
        questions: [
          { id: 'cs_prevention', type: 'radio', label: 'Does your company have action plans to prevent or mitigate identified human rights risks?', options: [
            { value: 'yes_documented_with_timelines', label: 'Yes, documented with timelines', tone: 'good', legacyLabel: 'Yes — documented with timelines' },
            { value: 'yes_informal_plans', label: 'Yes, informal plans', tone: 'watch', legacyLabel: 'Yes — informal plans' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'cs_supplier_code', type: 'radio', label: 'Does your supplier code of conduct include human rights requirements aligned to ILO core conventions?', options: [
            { value: 'yes_fully_aligned', label: 'Yes, fully aligned', tone: 'good', legacyLabel: 'Yes — fully aligned' },
            { value: 'partially_aligned', label: 'Partially aligned', tone: 'watch' },
            { value: 'code_exists_but_not_hrdd_focused', label: 'Code exists but not HRDD-focused', tone: 'watch' },
            { value: 'no_code', label: 'No code', tone: 'bad' },
          ] },
          { id: 'cs_grievance', type: 'radio', label: 'Does your company operate a grievance mechanism accessible to affected stakeholders?', options: [
            { value: 'yes_operational_anonymous', label: 'Yes, operational and anonymous', tone: 'good', legacyLabel: 'Yes — operational, anonymous' },
            { value: 'yes_limited_access', label: 'Yes, limited access', tone: 'good', legacyLabel: 'Yes — limited access' },
            { value: 'in_development', label: 'In development', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'cs_remediation', type: 'radio', label: 'Has your company provided or facilitated remediation for any human rights harm in the past 3 years?', options: [
            { value: 'yes_documented', label: 'Yes, documented', tone: 'good', legacyLabel: 'Yes — documented' },
            { value: 'yes_informal', label: 'Yes, informal', tone: 'watch', legacyLabel: 'Yes — informal' },
            { value: 'no_harm_identified', label: 'No harm identified', tone: 'good' },
            { value: 'no_harm_identified_but_not_remediated', label: 'No, harm identified but not remediated', tone: 'bad', legacyLabel: 'No — harm identified but not remediated' },
          ] },
        ],
      },
      {
        id: 'hrdd_monitoring', title: 'Monitoring & Disclosure', color: 'var(--color-accent-amber)', bg: 'var(--color-accent-amber-wash)',
        desc: 'Monitoring effectiveness and public disclosure',
        questions: [
          { id: 'cs_monitoring', type: 'radio', label: 'Does your company monitor the effectiveness of its HRDD measures?', options: [
            { value: 'yes_kpis_tracked_and_reported', label: 'Yes, KPIs tracked and reported', tone: 'good', legacyLabel: 'Yes — KPIs tracked and reported' },
            { value: 'yes_internal_monitoring', label: 'Yes, internal monitoring', tone: 'good', legacyLabel: 'Yes — internal monitoring' },
            { value: 'ad_hoc', label: 'Ad hoc', tone: 'watch' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'cs_disclosure', type: 'radio', label: 'Does your company publicly disclose its HRDD approach and findings?', options: [
            { value: 'yes_annual_report_or_dedicated_statement', label: 'Yes, annual report or dedicated statement', tone: 'good', legacyLabel: 'Yes — annual report or dedicated statement' },
            { value: 'yes_on_request', label: 'Yes, on request', tone: 'good', legacyLabel: 'Yes — on request' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'cs_stakeholder', type: 'radio', label: 'Does your company engage with affected stakeholders (workers, communities) in its HRDD process?', options: [
            { value: 'yes_formal_engagement_process', label: 'Yes, formal engagement process', tone: 'good', legacyLabel: 'Yes — formal engagement process' },
            { value: 'yes_ad_hoc', label: 'Yes, ad hoc', tone: 'watch', legacyLabel: 'Yes — ad hoc' },
            { value: 'no', label: 'No', tone: 'bad' },
          ] },
          { id: 'cs_incidents', type: 'number', label: 'Number of human rights incidents identified in your value chain in the past year', hint: 'Enter 0 if none identified.' },
        ],
      },
    ],
  },

  // ── Custom (buyer-defined) ───────────────────────────────────────────────────
  custom: {
    sections: [
      {
        id: 'custom', title: 'Sustainability Questionnaire', color: '#7425e3', bg: '#EDE9FE',
        desc: 'Questions defined by the requesting organisation',
        questions: [
          { id: 'custom_overview', type: 'textarea', label: 'Please provide an overview of your company\'s sustainability approach and key initiatives', hint: 'Include any certifications, frameworks followed, or notable achievements.' },
          { id: 'custom_env', type: 'textarea', label: 'Describe your environmental management practices and targets', hint: 'Include GHG emissions data if available, energy use, waste management and any environmental certifications.' },
          { id: 'custom_social', type: 'textarea', label: 'Describe your approach to labour rights, worker welfare and human rights', hint: 'Include health & safety performance, working conditions, freedom of association and any relevant policies.' },
          { id: 'custom_ethics', type: 'textarea', label: 'Describe your ethics and governance practices', hint: 'Include anti-corruption, whistleblower mechanisms, conflicts of interest and any regulatory compliance.' },
          { id: 'custom_supply', type: 'textarea', label: 'Describe how you manage sustainability in your own supply chain', hint: 'Include supplier assessments, codes of conduct, audits and traceability.' },
          { id: 'custom_certifications', type: 'text', label: 'List any relevant sustainability certifications your company holds', hint: 'e.g. ISO 14001, ISO 45001, B Corp, EcoVadis, FSC, etc.' },
          { id: 'custom_contact', type: 'text', label: 'Name and email of your sustainability contact for follow-up questions', hint: 'e.g. Jane Smith, jane@company.com' },
        ],
      },
    ],
  },
}

// ── WHICH QUESTIONNAIRE A CAMPAIGN ACTUALLY SENT ────────────────────────────────────────────────
//
// ⚠️ AN UNKNOWN TEMPLATE KEY FALLS BACK TO ecovadis, AND THAT FALLBACK IS THE WHOLE REASON THIS
// HELPER EXISTS. Both readers already do it: the supplier portal resolves
// `camp.questionnaire_template || 'ecovadis'` and then `TEMPLATES[template]?.sections ||
// TEMPLATES.ecovadis.sections`, and the buyer's response viewer does `(TEMPLATES[template] ||
// TEMPLATES.ecovadis).sections`. So a campaign carrying a null, an empty string or a typo showed its
// supplier the EcoVadis form.
//   Anything asking "was this question put to the supplier?" MUST resolve through the same fallback or
// it answers about a questionnaire nobody saw. That answer is not cosmetic: templateAsks drives
// whether a Category 1 line records 'not_asked', which is a claim a verifier reads about what was and
// was not asked of a supplier. Two spellings of the fallback would eventually disagree.
export function resolveTemplate(template: string | null | undefined): { key: string; sections: Section[] } {
  const requested = template || 'ecovadis'
  const found = TEMPLATES[requested]
  return found ? { key: requested, sections: found.sections } : { key: 'ecovadis', sections: TEMPLATES.ecovadis.sections }
}

// ⚠️ FOUR OF THE FIVE TEMPLATES, INCLUDING THE DEFAULT, DO NOT ASK ABOUT ASSURANCE. s3_assurance is in
// `scope3` alone; `ecovadis` has no assurance question at all, and its proc_audit and proc_ecovadis
// are about the supplier's OWN suppliers and their rating, neither of which is assurance of their
// figures. Meanwhile the three s3cat1_* questions that feed Category 1 are in BOTH ecovadis and
// scope3. So the ordinary case is a campaign that produces supplier-specific Cat 1 lines for which
// the assurance question was never put to the supplier, and that is a different fact from a supplier
// declining to answer it.
export function templateAsks(template: string | null | undefined, questionId: string): boolean {
  return resolveTemplate(template).sections.some(sec => sec.questions.some(q => q.id === questionId))
}

// id -> label, flattened across every template. Three ids (s3cat1_allocated,
// s3cat1_method, s3cat1_quality) appear in both ecovadis and scope3; their labels
// are byte-identical in both, so the flattening is lossless. If a future edit gives
// one of them different wording per template, this Map silently keeps whichever
// template is defined last — so keep shared ids worded the same, or key by template.
const LABEL_BY_QUESTION_ID: Map<string, string> = new Map(
  Object.values(TEMPLATES)
    .flatMap(t => t.sections)
    .flatMap(s => s.questions)
    .map(q => [q.id, q.label] as [string, string]),
)

// Returns null — not the id — when unknown, so the caller decides what an
// unrecognised question looks like in its own output.
export function labelForQuestionId(id: string): string | null {
  return LABEL_BY_QUESTION_ID.get(id) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// READING A STORED ANSWER
//
// Every surface goes through these four functions. Nothing outside this file compares a stored answer
// against option prose, which options.test.ts asserts by reading the other files from disk.
// ─────────────────────────────────────────────────────────────────────────────

const OPTIONS_BY_QUESTION_ID: Map<string, QuestionOption[]> = new Map(
  Object.values(TEMPLATES)
    .flatMap(t => t.sections)
    .flatMap(s => s.questions)
    .filter(q => q.options)
    .map(q => [q.id, q.options as QuestionOption[]]),
)

/** The options for a question, or an empty list for one that has none (number, text, textarea). */
export function optionsFor(questionId: string): QuestionOption[] {
  return OPTIONS_BY_QUESTION_ID.get(questionId) ?? []
}

/**
 * The stored answer, normalised to a value.
 *
 * ⚠️ IT ACCEPTS EITHER LABEL, AND THAT IS WHAT MAKES THE BACKFILL OPTIONAL RATHER THAN A CUTOVER. Rows
 * written before the values migration hold the option's prose, and rows written before the labels were
 * swept hold the OLDER prose (see legacyLabel); a supplier with the questionnaire already open keeps
 * writing whatever their loaded page holds. Both resolve here, so no window exists in which the
 * application and the data disagree.
 *
 * Returns the input unchanged when it matches no option: free-text answers pass through, and an off-list
 * value stays visible as itself rather than being mapped to a neighbour.
 */
export function optionValue(questionId: string, stored: string): string {
  const opts = optionsFor(questionId)
  if (opts.some(o => o.value === stored)) return stored
  return opts.find(o => o.label === stored || o.legacyLabel === stored)?.value ?? stored
}

/** What a human reads: the label for a value, or the input unchanged if it names no option. */
export function optionLabel(questionId: string, stored: string): string {
  const v = optionValue(questionId, stored)
  return optionsFor(questionId).find(o => o.value === v)?.label ?? stored
}

/**
 * The tone for a stored answer. 'neutral' for anything off-list, because an answer we cannot interpret
 * must not be coloured as though we had: the same rule as the assurance map's 'unrecognised'.
 */
export function optionTone(questionId: string, stored: string): Tone {
  const v = optionValue(questionId, stored)
  return optionsFor(questionId).find(o => o.value === v)?.tone ?? 'neutral'
}
