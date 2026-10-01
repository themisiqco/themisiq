// lib/forcedLabour/uk/statementModel.fixtures.ts
// Fictional UK statements for the model tests and the sample PDFs: a company, an LLP, and a group statement. No
// organisation named here exists. Answers are plain illustrations, in British English.

import type { UkStatementInput } from './statementModel'
import type { SectionContent } from '../../s211/builderContent'

const topics = (o: { org: string }): Record<string, SectionContent> => ({
  structure_business_supply_chains: {
    legal_form: 'Corporation',
    structure_description: `${o.org} designs and sells outdoor clothing in the United Kingdom and Ireland from two offices and three shops.`,
    supply_chain_description: 'Finished garments are bought from eleven factories in Vietnam, Portugal and Turkey; fabrics come from mills those factories choose.',
    operating_countries: ['United Kingdom', 'Ireland'],
    supply_chain_visibility: 'Direct and some indirect suppliers',
  },
  policies: {
    has_policy: 'Yes', covers_slavery_trafficking: 'Yes',
    policy_list: [{ name: 'Supplier Code of Conduct', year: '2024-03', approved_by: 'Board of Directors' }],
    supplier_terms: 'Yes', responsible_role: 'Head of Sourcing',
  },
  due_diligence: {
    due_diligence_description: 'Every new factory completes a social audit before the first order. Existing factories are re-audited every two years, and sooner after a finding.',
    instances_identified: 'No instances were identified', remediation_taken: 'Not applicable',
    grievance_mechanism: 'Yes', grievance_description: 'Workers at supplier factories can raise concerns through an independent telephone line in their own language.',
  },
  risk: {
    risk_assessment_done: 'Yes',
    risk_areas: [{ area: 'Cotton from regions with state-imposed forced labour', why: 'Cotton origin is not always traceable', worker_groups: '', action: 'Mills asked to show cotton origin' }],
    management_steps: 'Two mills that could not show cotton origin were replaced during the year.',
  },
  effectiveness: {
    assesses_effectiveness: 'Yes', effectiveness_description: 'The Head of Sourcing reports audit results to the board twice a year.',
    indicators: [{ indicator: 'Factories audited in the last two years', this_year: '11 of 11', last_year: '9 of 11' }],
  },
  training: {
    training_provided: 'Yes', covers_slavery_trafficking: 'Yes', mandatory: 'Mandatory for some roles', audience: ['Procurement and sourcing', 'Senior management'],
    employees_trained: 18, training_description: 'A one-hour course on recognising and reporting signs of forced labour, reviewed each year.',
  },
})

export const UK_SINGLE_COMPANY: UkStatementInput = {
  giving: 'Fellside Outdoor Clothing Ltd', covered: ['Fellside Outdoor Clothing Ltd'],
  sections: {
    statement_details: { is_group_statement: 'No', year_end_month: 12, year_end_day: 31, financial_year_ending: 2025 },
    steps_taken: { statement_kind: 'steps', steps_summary: 'During the year we adopted a Supplier Code of Conduct, audited every factory we buy from, and trained our sourcing team.', governance: 'The board oversees this work; the Head of Sourcing leads it.' },
    ...topics({ org: 'Fellside Outdoor Clothing Ltd' }),
    approval: { org_type: 'company', approving_body: 'Board of Directors', approval_date: '2026-05-14', signer_name: 'Alex Morgan', signer_title: 'Director', signed_date: '2026-05-15', signer_capacity: true, signer_on_board: true },
  },
}

export const UK_LLP: UkStatementInput = {
  giving: 'Harbourside Consulting LLP', covered: ['Harbourside Consulting LLP'],
  sections: {
    statement_details: { is_group_statement: 'No', year_end_month: 3, year_end_day: 31, financial_year_ending: 2026 },
    steps_taken: { statement_kind: 'no_steps' },
    approval: { org_type: 'llp', approval_date: '2026-07-01', signer_name: 'Sam Patel', signer_title: 'Designated Member', signed_date: '2026-07-02', signer_capacity: true },
  },
}

export const UK_GROUP: UkStatementInput = {
  giving: 'Fellside Group plc', covered: ['Fellside Group plc', 'Fellside Outdoor Clothing Ltd', 'Fellside Retail Ltd'],
  sections: {
    statement_details: { is_group_statement: 'Yes', year_end_month: 12, year_end_day: 31, financial_year_ending: 2025 },
    steps_taken: { statement_kind: 'steps', steps_summary: 'Across the group we adopted one Supplier Code of Conduct, audited every factory our companies buy from, and trained sourcing staff in each company.' },
    ...topics({ org: 'Fellside Group plc' }),
    approval: {
      org_type: 'company', approving_body: 'Board of Directors', approval_date: '2026-05-20', signer_name: 'Jordan Reid', signer_title: 'Chief Executive and Director', signed_date: '2026-05-21', signer_capacity: true,
      group_approvals: [
        { organisation: 'Fellside Outdoor Clothing Ltd', approved_by: 'Board of Directors', approval_date: '2026-05-18', signer_name: 'Alex Morgan', signer_title: 'Director' },
        { organisation: 'Fellside Retail Ltd', approved_by: 'Board of Directors', approval_date: '2026-05-19', signer_name: 'Chris Lee', signer_title: 'Director' },
      ],
    },
  },
}
