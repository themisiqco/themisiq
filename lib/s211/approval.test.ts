import { describe, it, expect } from 'vitest'
import { approvalBasisOptions, APPROVAL_BASIS_LABEL } from './approval'

describe('section 11: approval basis limited by the report type', () => {
  it('single: only paragraph 11(4)(a)', () => { expect(approvalBasisOptions('single')).toEqual(['single']) })
  it('joint: the two subparagraphs of 11(4)(b)', () => { expect(approvalBasisOptions('joint')).toEqual(['joint_each', 'joint_controlling']) })
  it('no report type yet: nothing to choose from', () => {
    for (const t of [undefined, null, '', 'other']) expect(approvalBasisOptions(t)).toEqual([])
  })
  it('each label names its provision', () => {
    expect(APPROVAL_BASIS_LABEL.single).toContain('paragraph 11(4)(a)')
    expect(APPROVAL_BASIS_LABEL.joint_each).toContain('subparagraph 11(4)(b)(i)')
    expect(APPROVAL_BASIS_LABEL.joint_controlling).toContain('subparagraph 11(4)(b)(ii)')
  })
})
