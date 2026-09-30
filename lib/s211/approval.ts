// lib/s211/approval.ts
// The approval bases section 11 offers, limited by the report type chosen in section 1. The Act
// (s.11(4)) allows one basis for a single-entity report and two for a joint report, and s.11(5)(a)
// requires the statement to say which applied.

export type ReportType = 'single' | 'joint'
export type ApprovalBasis = 'single' | 'joint_each' | 'joint_controlling'

export const APPROVAL_BASIS_LABEL: Record<ApprovalBasis, string> = {
  single: 'Approved by the governing body of the entity (paragraph 11(4)(a))',
  joint_each: 'Approved by the governing body of each entity included in the report (subparagraph 11(4)(b)(i))',
  joint_controlling: 'Approved by the governing body of the entity that controls each entity included in the report (subparagraph 11(4)(b)(ii))',
}

/** The bases a report of this type may use. No report type yet: none, until section 1 says which. */
export const approvalBasisOptions = (reportType: unknown): ApprovalBasis[] =>
  reportType === 'single' ? ['single'] : reportType === 'joint' ? ['joint_each', 'joint_controlling'] : []

export const APPROVAL_BASIS_NEEDS_REPORT_TYPE = 'Choose single or joint report in section 1 first. The approval basis depends on it.'
