// lib/s211/reportModel.fixtures.ts
// Fictional S-211 reports for the model and PDF tests and the sample PDFs. No company named here exists.
// Narratives are the builder's own "strong answer" examples (lib/s211/builderContent.ts), so the samples
// read as a real report would.

import { sectionDef, OECD_STEPS, ATTESTATION_DEFAULT, type SectionContent, type SectionKey } from './builderContent'
import { fillAttestation, buildAttestation } from './attestation'
import { NOTHING_TO_REPORT_KEY, type SectionStatus } from './sectionStatus'

export type FixtureReport = { reportingYear: number; sections: Partial<Record<SectionKey, SectionContent>> }
const strong = (k: SectionKey) => sectionDef(k).strongExample

export const SINGLE_REPORT: FixtureReport = {
  reportingYear: 2026,
  sections: {
    report_details: {
      legal_name: 'Harrowgate Outdoor Equipment Inc.', year_end_month: 12, year_end_day: 31, financial_year_confirmed: true,
      report_type: 'single', is_revised: 'No', other_jurisdictions: ['UK Modern Slavery Act 2015'],
    },
    structure_activities_supply_chains: {
      legal_form: 'Corporation',
      structure_description: 'Harrowgate Outdoor Equipment Inc. is a privately held corporation based in Alberta. It has two business units, wholesale and retail, and controls no other entity.',
      employees_canada: 310, employees_outside_canada: 40,
      activities: ['Importing goods into Canada', 'Selling goods'],
      goods_description: 'Tents, sleeping bags, backpacks and camp furniture, about 420,000 units a year.',
      operating_countries: ['Canada', 'United States'],
      supply_chain_description: strong('structure_activities_supply_chains'),
      supply_chain_visibility: 'Direct and some indirect suppliers',
      source_countries: ['Vietnam', 'China', 'Taiwan', 'Canada'],
      unknowns: 'We do not yet know the mills that supply fabric to our finished-goods factories.',
    },
    policies_due_diligence: {
      has_policy: 'Yes',
      policy_list: [{ name: 'Supplier Code of Conduct', year: '2024-03', approved_by: 'Board of Directors' }, { name: 'Responsible Sourcing Policy', year: '2025-01', approved_by: '' }],
      policy_applies_to: ['Own operations', 'Direct suppliers'],
      supplier_terms: 'Yes',
      due_diligence_steps: OECD_STEPS.map((step, i) => ({ step, status: i < 4 ? 'Yes' : i === 4 ? 'In progress' : 'No' })),
      due_diligence_description: strong('policies_due_diligence'),
      responsible_role: 'Vice-President, Operations',
      policy_topics: ['Worker-paid recruitment fees', 'Confiscation of identity documents'],
      international_standards: ['UN Guiding Principles on Business and Human Rights'],
    },
    risks: {
      risk_assessment_done: 'Yes', assessment_methods: ['Supplier questionnaires', 'Audits', 'Desk-based research'],
      risk_areas: [
        { area: 'Sewn goods, Vietnam', why: 'Factories recruit migrant workers through labour agencies.', worker_groups: 'Migrant workers', action: 'Independent audit in September 2025.' },
        { area: 'Cotton fabric', why: 'Origin of the fibre cannot yet be traced.', worker_groups: '', action: 'Asked fabric suppliers to name their mills.' },
      ],
      management_steps: strong('risks'),
      assessment_timing: 'September 2025; reviewed every year',
    },
    remediation: {
      instances_identified: 'Yes, instances were identified', remediation_taken: 'Yes',
      remediation_description: strong('remediation'), grievance_mechanism: 'Yes',
      grievance_description: 'An independent provider runs a telephone line for workers at our suppliers, in their own language. Reports go to our Vice-President, Operations.',
    },
    remediation_income_loss: {
      measures_caused_loss: 'Yes', income_remediation_taken: 'Yes', income_remediation_description: strong('remediation_income_loss'),
    },
    training: {
      training_provided: 'Yes', mandatory: 'Mandatory for some roles', audience: ['Procurement and sourcing'],
      covers: ['Forced labour', 'Child labour'], developed_by: 'External organization', developer_name: 'Outdoor Industry Sourcing Network',
      frequency_and_length: '90 minutes, once a year', employees_trained: 14, assessment: 'Yes',
      training_description: strong('training'),
    },
    effectiveness: {
      assesses_effectiveness: 'Yes', methods: ['Other'],
      indicators: [
        { indicator: 'Direct suppliers that signed the code', this_year: '96%', last_year: '81%' },
        { indicator: 'Supplier audits completed', this_year: '9', last_year: '4' },
      ],
      effectiveness_description: strong('effectiveness'),
      goal_horizons: 'Short term: within one year. Medium term: one to three years. Long term: beyond three years.',
      goals_short_term: 'Every direct supplier signs the code by December 2026.',
    },
    steps_taken: {
      steps_summary: strong('steps_taken'), scope_of_actions: 'Applied to the whole entity and supply chain',
      governance: 'The Vice-President, Operations leads this work and reports to the audit committee twice a year.',
    },
    other_information: {
      has_other_information: 'Yes', other_description: strong('other_information'),
      links: [{ title: 'Supplier Code of Conduct', url: 'https://www.harrowgate.example/supplier-code' }],
    },
    approval_attestation: {
      governing_body: 'Board of Directors', approval_basis: 'single', approval_date: '2026-04-14',
      signatory_name: 'Jordan Avery', signatory_title: 'Chair of the Board',
      attestation_text: fillAttestation({ title: 'Chair of the Board', reportType: 'single' }), authority_to_bind: true,
    },
  },
}

export const JOINT_REPORT: FixtureReport = {
  reportingYear: 2026,
  sections: {
    ...SINGLE_REPORT.sections,
    report_details: {
      legal_name: 'Harrowgate Outdoor Equipment Inc.', year_end_month: 3, year_end_day: 31, financial_year_confirmed: true,
      report_type: 'joint', joint_entities: ['Harrowgate Outdoor Equipment Inc.', 'Harrowgate Retail Ltd.', 'Société Harrowgate Québec Inc.'],
      is_revised: 'Yes', revision_date: '2026-05-20', revision_changes: 'Section 4 now lists the cotton fabric risk area, which the original report left out.',
      other_jurisdictions: ['None'],
    },
    structure_activities_supply_chains: {
      ...SINGLE_REPORT.sections.structure_activities_supply_chains,
      structure_description: 'Harrowgate Outdoor Equipment Inc. controls Harrowgate Retail Ltd., which runs 12 stores in Western Canada, and Société Harrowgate Québec Inc., which distributes our goods in Quebec.',
      activities: ['Importing goods into Canada', 'Selling goods', 'Distributing goods', 'Controlling an entity that does any of these'],
    },
    other_information: { has_other_information: 'No' },
    approval_attestation: {
      governing_body: 'Board of Directors', approval_basis: 'joint_controlling', approval_date: '2026-05-22',
      controlling_entity: 'Harrowgate Outdoor Equipment Inc.',
      signatory_name: 'Jordan Avery', signatory_title: 'Chair of the Board',
      attestation_text: buildAttestation({ basis: 'joint_controlling', title: 'Chair of the Board', controllingEntity: 'Harrowgate Outdoor Equipment Inc.' }), authority_to_bind: true,
    },
  },
}

/** A joint report approved by the governing body of EACH entity (11(4)(b)(i)): one signer per entity. */
export const JOINT_EACH_REPORT: FixtureReport = {
  reportingYear: 2026,
  sections: {
    ...JOINT_REPORT.sections,
    report_details: { ...JOINT_REPORT.sections.report_details, is_revised: 'No', revision_date: undefined, revision_changes: undefined },
    approval_attestation: {
      governing_body: 'Board of Directors', approval_basis: 'joint_each', approval_date: '2026-05-22',
      entity_signatories: [
        { entity: 'Harrowgate Outdoor Equipment Inc.', name: 'Jordan Avery', title: 'Chair of the Board' },
        { entity: 'Harrowgate Retail Ltd.', name: 'Sam Okafor', title: 'Director' },
        { entity: 'Société Harrowgate Québec Inc.', name: 'Marie-Ève Tremblay', title: 'Présidente du conseil' },
      ],
      attestation_text: buildAttestation({ basis: 'joint_each' }),
      authority_to_bind: true,
    },
  },
}

/** Sections 3, 7 and 8 answered with the plain "nothing to report" sentence. */
export const NOTHING_REPORT: FixtureReport = {
  reportingYear: 2026,
  sections: {
    ...SINGLE_REPORT.sections,
    policies_due_diligence: { has_policy: 'No', [NOTHING_TO_REPORT_KEY]: sectionDef('policies_due_diligence').nothingToReport },
    training: { training_provided: 'No', [NOTHING_TO_REPORT_KEY]: sectionDef('training').nothingToReport },
    effectiveness: { assesses_effectiveness: 'No', [NOTHING_TO_REPORT_KEY]: sectionDef('effectiveness').nothingToReport },
    other_information: { has_other_information: 'No' },
  },
}

/** Every section marked complete, for the export gate. */
export const allComplete = (r: FixtureReport): Partial<Record<SectionKey, { status: SectionStatus; content: SectionContent }>> =>
  // Cloned, so a test that edits the result cannot change the fixture for the tests after it.
  Object.fromEntries(Object.entries(structuredClone(r.sections)).map(([k, c]) => [k, { status: 'complete' as SectionStatus, content: c! }]))

/** Unused here but kept beside the fixtures: the unfilled example, for tests that need the placeholders. */
export const UNFILLED_ATTESTATION = ATTESTATION_DEFAULT
