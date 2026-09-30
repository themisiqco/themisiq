// lib/s211/stepsSummary.ts
// Section 9, the steps taken during the financial year, drafted from the user's own answers in
// sections 3 to 8. Pure.
//
// ⚠️ NO LANGUAGE MODEL, AND NO SENTENCE WITHOUT A SOURCE. Each sentence is a fixed template filled
// only with values the user typed or chose, and carries the section and field it came from. The test
// suite checks that every interpolated value appears in the field it names. So every word in the draft
// traces to an answer.
//
// ⚠️ "IN PROGRESS" IS NOT A STEP TAKEN. The section is about the financial year. An item answered
// In progress is kept out of the summary and offered separately, as work under way.
//
// ⚠️ NEVER OVERWRITES EDITS WITHOUT ASKING. The draft is stored (as _built_summary) beside a fingerprint
// (_built_from) of the answers it
// was built from. When those answers change, the page says so and offers to rebuild; if the user has
// edited the summary since, rebuilding asks first. That flow is in the page; the pieces are here.

import type { SectionContent, SectionKey } from './builderContent'

export type Trace = { section: SectionKey; field: string }
export type StepSentence = { item: StepItem; text: string; sources: Trace[] }
export type StepItem =
  | 'policy' | 'supplier_terms' | 'due_diligence' | 'risk_assessment' | 'risk_areas'
  | 'remediation' | 'grievance' | 'income_remediation' | 'training' | 'effectiveness'

export const STEP_ITEM_LABEL: Record<StepItem, string> = {
  policy: 'Policies adopted or in place',
  supplier_terms: 'Supplier terms requiring the policy',
  due_diligence: 'Due diligence carried out',
  risk_assessment: 'Risks assessed',
  risk_areas: 'Risk areas identified',
  remediation: 'Remediation measures',
  grievance: 'Grievance mechanism',
  income_remediation: 'Remediation of lost income',
  training: 'Training',
  effectiveness: 'Effectiveness checks',
}

type Answers = Partial<Record<SectionKey, SectionContent>>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(r => r && typeof r === 'object') as Record<string, unknown>[] : [])
const checked = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export type StepsAssembly = {
  /** Items that were done in the year, in report order, each with its sentence. */
  sentences: StepSentence[]
  /** Items answered In progress: kept out of the summary. */
  inProgress: { item: StepItem; text: string; sources: Trace[] }[]
  /** The checklist, pre-ticked from the answers. */
  checklist: StepItem[]
}

export function assembleSteps(a: Answers): StepsAssembly {
  const s3 = a.policies_due_diligence ?? {}, s4 = a.risks ?? {}, s5 = a.remediation ?? {}
  const s6 = a.remediation_income_loss ?? {}, s7 = a.training ?? {}, s8 = a.effectiveness ?? {}
  const out: StepSentence[] = []
  const wip: StepsAssembly['inProgress'] = []
  const T = (section: SectionKey, field: string): Trace => ({ section, field })
  const underWay = (item: StepItem, sources: Trace[]) =>
    wip.push({ item, sources, text: `Work under way at the end of the financial year, not yet complete: ${lower(STEP_ITEM_LABEL[item])}.` })

  // Section 3
  if (s3.has_policy === 'Yes') {
    const names = rows(s3.policy_list).map(r => str(r.name)).filter(Boolean)
    out.push({ item: 'policy', sources: [T('policies_due_diligence', 'has_policy'), ...(names.length ? [T('policies_due_diligence', 'policy_list')] : [])],
      text: names.length ? `We had a policy covering forced labour and child labour in place: ${list(names)}.` : 'We had a policy covering forced labour and child labour in place.' })
  } else if (s3.has_policy === 'In progress') underWay('policy', [T('policies_due_diligence', 'has_policy')])
  if (s3.supplier_terms === 'Yes') out.push({ item: 'supplier_terms', sources: [T('policies_due_diligence', 'supplier_terms')],
    text: 'Our contracts or purchase terms required suppliers to follow the policy.' })
  else if (s3.supplier_terms === 'In progress') underWay('supplier_terms', [T('policies_due_diligence', 'supplier_terms')])
  const ddDone = rows(s3.due_diligence_steps).filter(r => str(r.status) === 'Yes').map(r => str(r.step)).filter(Boolean)
  const ddWip = rows(s3.due_diligence_steps).filter(r => str(r.status) === 'In progress').map(r => str(r.step)).filter(Boolean)
  if (ddDone.length) out.push({ item: 'due_diligence', sources: [T('policies_due_diligence', 'due_diligence_steps')],
    text: `We carried out due diligence, covering these steps: ${list(ddDone.map(lower))}.` })
  else if (ddWip.length) underWay('due_diligence', [T('policies_due_diligence', 'due_diligence_steps')])

  // Section 4
  if (s4.risk_assessment_done === 'Yes') {
    const methods = checked(s4.assessment_methods).filter(m => m !== 'Other')
    out.push({ item: 'risk_assessment', sources: [T('risks', 'risk_assessment_done'), ...(methods.length ? [T('risks', 'assessment_methods')] : [])],
      text: methods.length ? `We assessed the risk of forced labour and child labour, using: ${list(methods.map(lower))}.` : 'We assessed the risk of forced labour and child labour.' })
    const areas = rows(s4.risk_areas).map(r => str(r.area)).filter(Boolean)
    if (areas.length) out.push({ item: 'risk_areas', sources: [T('risks', 'risk_areas')],
      text: `We identified ${areas.length} risk area${areas.length === 1 ? '' : 's'}: ${list(areas)}.` })
  } else if (s4.risk_assessment_done === 'In progress') underWay('risk_assessment', [T('risks', 'risk_assessment_done')])

  // Section 5
  if (s5.remediation_taken === 'Yes') out.push({ item: 'remediation', sources: [T('remediation', 'remediation_taken')],
    text: 'We took measures to remediate forced labour or child labour.' })
  if (s5.grievance_mechanism === 'Yes') out.push({ item: 'grievance', sources: [T('remediation', 'grievance_mechanism')],
    text: 'A channel was available for workers or others to report concerns.' })
  else if (s5.grievance_mechanism === 'In progress') underWay('grievance', [T('remediation', 'grievance_mechanism')])

  // Section 6
  if (s6.income_remediation_taken === 'Yes') out.push({ item: 'income_remediation', sources: [T('remediation_income_loss', 'income_remediation_taken')],
    text: 'We took measures to remediate the loss of income to vulnerable families.' })

  // Section 7
  if (s7.training_provided === 'Yes') {
    const n = typeof s7.employees_trained === 'number' && Number.isFinite(s7.employees_trained) ? s7.employees_trained : null
    out.push({ item: 'training', sources: [T('training', 'training_provided'), ...(n !== null ? [T('training', 'employees_trained')] : [])],
      text: n !== null ? `We provided training on forced labour and child labour, completed by ${n} employee${n === 1 ? '' : 's'}.` : 'We provided training on forced labour and child labour to employees.' })
  } else if (s7.training_provided === 'In progress') underWay('training', [T('training', 'training_provided')])

  // Section 8
  if (s8.assesses_effectiveness === 'Yes') {
    const methods = checked(s8.methods).filter(m => m !== 'Other')
    out.push({ item: 'effectiveness', sources: [T('effectiveness', 'assesses_effectiveness'), ...(methods.length ? [T('effectiveness', 'methods')] : [])],
      text: methods.length ? `We checked the effectiveness of our actions by: ${list(methods.map(lower))}.` : 'We checked the effectiveness of our actions.' })
  } else if (s8.assesses_effectiveness === 'In progress') underWay('effectiveness', [T('effectiveness', 'assesses_effectiveness')])

  return { sentences: out, inProgress: wip, checklist: out.map(s => s.item).filter((x, i, arr) => arr.indexOf(x) === i) }
}

/** The summary text from the items still ticked, one sentence each, in order. */
export const summaryText = (assembly: StepsAssembly, ticked: readonly StepItem[] = assembly.checklist): string =>
  assembly.sentences.filter(s => ticked.includes(s.item)).map(s => s.text).join(' ')

/**
 * A fingerprint of every answer section 9 reads. Stored with the draft; when it no longer matches, the
 * answers have changed since the draft was built.
 */
export const stepsFingerprint = (a: Answers): string => {
  const pick = (c: SectionContent | undefined, keys: string[]) => keys.map(k => JSON.stringify(c?.[k] ?? null)).join('|')
  return [
    pick(a.policies_due_diligence, ['has_policy', 'policy_list', 'supplier_terms', 'due_diligence_steps']),
    pick(a.risks, ['risk_assessment_done', 'assessment_methods', 'risk_areas']),
    pick(a.remediation, ['remediation_taken', 'grievance_mechanism']),
    pick(a.remediation_income_loss, ['income_remediation_taken']),
    pick(a.training, ['training_provided', 'employees_trained']),
    pick(a.effectiveness, ['assesses_effectiveness', 'methods']),
  ].join('#')
}

export type StepsDraftState = 'not_built' | 'current' | 'stale'
/** Where section 9's draft stands against the answers now. */
export const stepsDraftState = (s9: SectionContent, a: Answers): StepsDraftState =>
  typeof s9._built_from !== 'string' ? 'not_built' : s9._built_from === stepsFingerprint(a) ? 'current' : 'stale'

/** True when the summary differs from the draft last built: rebuilding would lose the user's edits. */
export const summaryEdited = (s9: SectionContent): boolean =>
  typeof s9._built_summary === 'string' && typeof s9.steps_summary === 'string' && s9.steps_summary.trim() !== s9._built_summary.trim()

export const STALE_NOTICE = 'Your earlier answers have changed since this summary was written.'
export const REBUILD_CONFIRM = 'Rebuilding replaces the summary with a new draft, and your edits to it will be lost. Rebuild anyway?'
export const DRAFT_NOTICE = 'Built from your answers in sections 3 to 8. Read and edit it before marking this section complete.'

/** The section 9 content after (re)building the draft from the answers now. */
export function buildStepsContent(s9: SectionContent, a: Answers, ticked?: readonly StepItem[]): SectionContent {
  const assembly = assembleSteps(a)
  const items = ticked ?? assembly.checklist
  const text = summaryText(assembly, items)
  return { ...s9, steps_checklist: [...items], steps_summary: text, _built_summary: text, _built_from: stepsFingerprint(a) }
}
