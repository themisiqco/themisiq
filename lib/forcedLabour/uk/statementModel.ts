// lib/forcedLabour/uk/statementModel.ts
// The UK Modern Slavery Statement as a document (Stage D2, reviewed 1 Oct 2026): what the PDF prints, built from the
// UK sections and the organisations chosen for the statement. Pure. Drawn by lib/s211/reportPdf.ts, the layout
// Canada's report uses, on A4.
//
// ⚠️ THE ORGANISATION'S DOCUMENT, IN BRITISH ENGLISH, IN ITS OWN WORDS. Only the user's answers print. No builder
// prompt, hint, source tag or parenthetical: narratives under plain report headings (UK_REPORT_HEADING), tables with
// plain column names (UK_PDF_COLUMNS), and every yes/no or single-choice answer turned into a plain sentence.
//
// ⚠️ EVERY SENTENCE TRACES TO AN ANSWER. Sentences are built by say(), which records the answers each one came from;
// buildUkStatement returns that trace with the model, and statementModel.test.ts checks every printed sentence is
// either an answer printed as given or a traced sentence whose answers are filled. Nothing is invented: a "No" or
// "Not applicable" is printed as an honest sentence, and an unanswered question prints nothing.
//
// WHAT IT PRINTS, in the Act's order: the cover ("Modern Slavery Statement", made under section 54, the organisation,
// the financial year, and for a group statement every organisation it covers); the steps taken (s.54(4)), or the
// Act's alternative; each answered topic of s.54(5)(a) to (f); then approval and signing by kind of organisation
// (s.54(6)): one approval sentence where the Act names an approver, one signing sentence, and the signature block.
//
// VOICE. Generated sentences are in the first person plural ("We have a written policy ...", "Our contracts ..."),
// for a single organisation and a group alike. Approval and signing stay in the third person, with the
// organisation's name, because they record what its board and signer did.
//
// LAYOUT (UK_PDF_OPTIONS): the title as the cover's large line; a part's heading never ends a page without the
// first content beneath it; approval and signing on one page together (the part's keepTogether).

import { UK_SECTIONS, UK_SIGNER_ROLE, UK_APPROVER, isBoard, ukFinancialYear, ukDate, type UkSectionKey, type UkOrgType } from './builderContent'
import { isFilled } from '../../s211/sectionStatus'
import type { SectionContent } from '../../s211/builderContent'
import type { Block, SignatureBlock } from '../../s211/reportModel'
import type { PdfDocumentModel, PdfOptions } from '../../s211/reportPdf'

export const UK_STATEMENT_TITLE = 'Modern Slavery Statement'
export const UK_STATEMENT_SUBTITLE = 'Made under section 54 of the Modern Slavery Act 2015'
export const UK_ACT = 'Modern Slavery Act 2015'
/** How the UK statement is drawn: A4, the title as the cover's large line, headings kept with what follows. */
export const UK_PDF_OPTIONS: PdfOptions = { format: 'a4', cover: 'title-first', keepWithNext: true }

export type UkStatementInput = {
  sections: Partial<Record<UkSectionKey, SectionContent>>
  /** The organisation giving the statement, and every organisation it covers (fl_report_entities). */
  giving: string
  covered: string[]
}
/** A sentence and the answers ("section.field") it was built from. */
export type TracedSentence = { text: string; from: string[] }

// ── Dates and lists ───────────────────────────────────────────────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "2024-03" as "March 2024", "2026-05-14" as "14 May 2026"; anything else as typed. Never ISO in the statement. */
export function ukDateText(v: string): string {
  const ym = /^(\d{4})-(\d{2})$/.exec(v.trim())
  if (ym && +ym[2] >= 1 && +ym[2] <= 12) return `${MONTHS[+ym[2] - 1]} ${ym[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return ukDate(v.trim())
  return v
}
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const strings = (v: unknown) => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => (x as string).trim()) : [])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
/** A body as typed, with "the" in front unless it already has one: "Board of Directors" as "the Board of Directors". */
const theBody = (s: string) => (/^the\s/i.test(s) ? s : `the ${s}`)
/** Country names that take "the" in a sentence ("operates in the United Kingdom"). Grammar only: the name is as typed. */
const TAKES_THE = new Set(['United Kingdom', 'United States', 'United States of America', 'United Arab Emirates', 'Netherlands', 'Philippines',
  'Czech Republic', 'Dominican Republic', 'Central African Republic', 'Democratic Republic of the Congo', 'Republic of the Congo', 'Gambia',
  'Bahamas', 'Maldives', 'Comoros', 'Seychelles', 'Solomon Islands', 'Marshall Islands', 'Cayman Islands', 'Channel Islands', 'Falkland Islands'])
const countries = (xs: string[]) => list(xs.map(x => (TAKES_THE.has(x) ? `the ${x}` : x)))

// ── Report headings and table columns: plain, no builder wording ────────────────────────────────────
/** The heading a narrative answer prints under, by field. */
export const UK_REPORT_HEADING: Record<string, string> = {
  structure_description: 'Structure', goods_description: 'Goods and services', supply_chain_description: 'Supply chains',
  unknowns: 'What is not yet known', information_gathering: 'How this information was gathered', changes_since_last_report: 'Changes since the last statement',
  policy_communication: 'How the policies are communicated and enforced',
  due_diligence_description: 'Due diligence during the year', purchasing_practices: 'Purchasing practices',
  remediation_description: 'Remediation', grievance_description: 'How concerns can be raised',
  own_operations_risk: 'Risks in its own operations', management_steps: 'How the risks were managed', stakeholder_engagement: 'Stakeholders engaged',
  effectiveness_description: 'How effectiveness is checked', goals_short_term: 'Short-term goals', goals_medium_term: 'Medium-term goals',
  goals_long_term: 'Long-term goals', progress_since_last_report: 'Progress since the last statement', findings_changed_practice: 'How findings changed practice',
  training_description: 'What the training covers', governance: 'Responsibility and oversight', external_engagement: 'Work with others',
}
/** A short free-text answer's label, as a fact row. */
const UK_FACT_LABEL: Record<string, string> = {
  assessment_timing: 'Timing of the risk assessment', assessment_role: 'Responsible for the risk assessment',
  goal_horizons: 'Time frames', frequency_and_length: 'Length and frequency',
}
/** Table columns, by field and column key. */
export const UK_PDF_COLUMNS: Record<string, Record<string, string>> = {
  policy_list: { name: 'Policy', year: 'Date', approved_by: 'Approved by' },
  risk_areas: { area: 'Area', why: 'Why it carries a risk', worker_groups: 'Workers affected', action: 'What was done' },
  indicators: { indicator: 'Indicator', this_year: 'This year', last_year: 'Last year' },
  due_diligence_steps: { step: 'Step', status: 'Status' },
}
const TABLE_TITLE: Record<string, string> = { policy_list: 'Policies', risk_areas: 'Risk areas', indicators: 'Performance indicators', due_diligence_steps: 'Due diligence steps' }

// ── Building ──────────────────────────────────────────────────────────────────────────────────────
export function buildUkStatement(input: UkStatementInput): { model: PdfDocumentModel; trace: TracedSentence[] } {
  const s = input.sections
  const get = (k: UkSectionKey) => s[k] ?? {}
  const org = input.giving
  const others = input.covered.filter(n => n !== org)
  const group = get('statement_details').is_group_statement === 'Yes' && others.length > 0
  const trace: TracedSentence[] = []
  /** A sentence, recorded with the answers it came from. */
  const say = (text: string, ...from: string[]): Block => { trace.push({ text, from }); return { kind: 'para', text } }
  const v = (k: UkSectionKey, f: string) => (get(k) as Record<string, unknown>)[f]

  /** A narrative answer under its report heading, printed as given. */
  const narrative = (k: UkSectionKey, f: string): Block[] => {
    const t = str(v(k, f))
    return t ? [{ kind: 'subheading', text: UK_REPORT_HEADING[f] }, { kind: 'para', text: t }] : []
  }
  const facts = (k: UkSectionKey, fs: string[]): Block[] => {
    const rows = fs.filter(f => str(v(k, f))).map(f => [UK_FACT_LABEL[f], str(v(k, f))] as [string, string])
    return rows.length ? [{ kind: 'facts', rows }] : []
  }
  const table = (k: UkSectionKey, f: string, cell: (col: string, val: unknown) => string = (_c, x) => String(x ?? '')): Block[] => {
    const rows = (Array.isArray(v(k, f)) ? v(k, f) as Record<string, unknown>[] : []).filter(r => r && typeof r === 'object' && Object.values(r).some(isFilled))
    if (!rows.length) return []
    // A column empty in every row is left out.
    const cols = Object.entries(UK_PDF_COLUMNS[f]).filter(([c]) => rows.some(r => isFilled(r[c])))
    return [{ kind: 'table', title: TABLE_TITLE[f], columns: cols.map(([, l]) => l), rows: rows.map(r => cols.map(([c]) => cell(c, r[c]))) }]
  }

  // s.54(4)
  const steps: Block[] = []
  const fy = ukFinancialYear(get('statement_details'))
  if (v('steps_taken', 'statement_kind') === 'no_steps') {
    steps.push(say(`We have taken no steps during the financial year${fy ? ` ending ${ukDate(fy.end)}` : ''} to ensure that slavery and human trafficking is not taking place in any of our supply chains or in any part of our own business.`,
      'steps_taken.statement_kind'))
  } else {
    if (str(v('steps_taken', 'steps_summary'))) steps.push({ kind: 'para', text: str(v('steps_taken', 'steps_summary')) })
    const scope = v('steps_taken', 'scope_of_actions')
    if (scope === 'Applied to the whole entity and supply chain') steps.push(say('These steps applied across our business and our supply chains.', 'steps_taken.scope_of_actions'))
    if (scope === 'Applied to specific parts') steps.push(say('These steps applied to specific parts of our business and supply chains.', 'steps_taken.scope_of_actions'))
    steps.push(...narrative('steps_taken', 'governance'), ...narrative('steps_taken', 'external_engagement'))
  }

  // s.54(5)(a): structure, business and supply chains (the legal form is not printed)
  const A = 'structure_business_supply_chains' as const
  const a: Block[] = [...narrative(A, 'structure_description'), ...narrative(A, 'goods_description')]
  const ops = strings(v(A, 'operating_countries'))
  if (ops.length) a.push(say(`We operate in ${countries(ops)}.`, `${A}.operating_countries`))
  a.push(...narrative(A, 'supply_chain_description'))
  const seen: Record<string, string> = {
    'Direct suppliers only': 'We can see our direct suppliers only.',
    'Direct and some indirect suppliers': 'We can see our direct suppliers and some of their suppliers.',
    'Mapped to raw materials for main products': 'We have mapped our supply chains back to raw materials for our main products.',
    'Not mapped': 'We have not yet mapped our supply chains.',
  }
  if (seen[str(v(A, 'supply_chain_visibility'))]) a.push(say(seen[str(v(A, 'supply_chain_visibility'))], `${A}.supply_chain_visibility`))
  const src = strings(v(A, 'source_countries'))
  if (src.length) a.push(say(`The goods we buy come from ${countries(src)}.`, `${A}.source_countries`))
  a.push(...narrative(A, 'unknowns'), ...narrative(A, 'information_gathering'), ...narrative(A, 'changes_since_last_report'))

  // s.54(5)(b): policies
  const P = 'policies' as const
  const b: Block[] = []
  const policies = (Array.isArray(v(P, 'policy_list')) ? v(P, 'policy_list') as Record<string, unknown>[] : []).filter(r => str(r?.name))
  const has = v(P, 'has_policy')
  if (has === 'Yes' && policies.length === 1) {
    const p = policies[0]
    const parts = [`our ${str(p.name)}`, ...(str(p.year) ? [`dated ${ukDateText(str(p.year))}`] : []), ...(str(p.approved_by) ? [`approved by ${theBody(str(p.approved_by))}`] : [])]
    b.push(say(`We have a written policy on slavery and human trafficking: ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`, `${P}.has_policy`, `${P}.policy_list`))
  } else if (has === 'Yes') {
    b.push(say(`We have written policies on slavery and human trafficking${policies.length ? ', listed below' : ''}.`, `${P}.has_policy`))
    if (policies.length) b.push(...table(P, 'policy_list', (c, x) => (c === 'year' ? ukDateText(String(x ?? '')) : String(x ?? ''))))
  } else if (has === 'No') b.push(say('We do not have a written policy on slavery and human trafficking.', `${P}.has_policy`))
  else if (has === 'In progress') b.push(say('We are developing a written policy on slavery and human trafficking.', `${P}.has_policy`))
  // "it" or "them", "policy" or "policies", by how many are listed.
  const several = policies.length > 1
  const ourPolicy = several ? 'Our policies' : 'Our policy', itThem = several ? 'them' : 'it'
  const covers = v(P, 'covers_slavery_trafficking')
  if (covers === 'No') b.push(say(`${ourPolicy} ${several ? 'do' : 'does'} not yet cover slavery and human trafficking.`, `${P}.covers_slavery_trafficking`))
  if (covers === 'In progress') b.push(say(`We are extending ${lowerFirst(ourPolicy)} to cover slavery and human trafficking.`, `${P}.covers_slavery_trafficking`))
  const reach: Record<string, string> = { 'Own operations': 'our own operations', 'Direct suppliers': 'our direct suppliers', 'Indirect suppliers': 'our indirect suppliers', 'Controlled entities': 'the organisations we control' }
  const applies = strings(v(P, 'policy_applies_to')).map(x => reach[x] ?? lowerFirst(x))
  if (applies.length) b.push(say(`${ourPolicy} ${several ? 'apply' : 'applies'} to ${list(applies)}.`, `${P}.policy_applies_to`))
  const terms: Record<string, string> = {
    Yes: `Our contracts or purchase terms require suppliers to follow ${itThem}.`,
    No: `Our contracts and purchase terms do not yet require suppliers to follow ${itThem}.`,
    'In progress': `We are adding a requirement to follow ${itThem} to our contracts or purchase terms.`,
  }
  if (terms[str(v(P, 'supplier_terms'))]) b.push(say(terms[str(v(P, 'supplier_terms'))], `${P}.supplier_terms`))
  const topics = strings(v(P, 'policy_topics')).map(lowerFirst)
  if (topics.length) b.push(say(`${ourPolicy} ${several ? 'address' : 'addresses'} ${list(topics)}.`, `${P}.policy_topics`))
  const standards = strings(v(P, 'international_standards'))
  if (standards.length) b.push(say(`${ourPolicy} ${several ? 'refer' : 'refers'} to ${list(standards)}.`, `${P}.international_standards`))
  const accountable = str(v(P, 'responsible_role'))
  if (accountable) b.push(say(`${/^(the|our)\s/i.test(accountable) ? accountable[0].toUpperCase() + accountable.slice(1) : `Our ${accountable}`} is accountable for ${several ? 'these policies' : policies.length === 1 ? 'this policy' : 'these policies'}.`, `${P}.responsible_role`))
  b.push(...narrative(P, 'policy_communication'))

  // s.54(5)(c): due diligence
  const D = 'due_diligence' as const
  const c: Block[] = [...narrative(D, 'due_diligence_description'), ...table(D, 'due_diligence_steps'), ...narrative(D, 'purchasing_practices')]
  const instances: Record<string, string> = {
    'Yes, instances were identified': 'Cases of slavery or human trafficking were identified during the financial year.',
    'No instances were identified': 'No cases of slavery or human trafficking were identified during the financial year.',
    'Not assessed': 'Whether there were cases of slavery or human trafficking was not assessed during the financial year.',
  }
  if (instances[str(v(D, 'instances_identified'))]) c.push(say(instances[str(v(D, 'instances_identified'))], `${D}.instances_identified`))
  const rem = v(D, 'remediation_taken')
  if (rem === 'Yes') c.push(say('Remediation measures were taken.', `${D}.remediation_taken`))
  if (rem === 'No') c.push(say('No remediation measures were taken.', `${D}.remediation_taken`))
  if (rem === 'Not applicable') c.push(v(D, 'instances_identified') === 'No instances were identified'
    ? say('No remediation was needed, as no cases were identified.', `${D}.remediation_taken`, `${D}.instances_identified`)
    : say('Remediation measures were not applicable.', `${D}.remediation_taken`))
  c.push(...narrative(D, 'remediation_description'))
  const channel: Record<string, string> = {
    Yes: 'We have a channel for workers and others to raise concerns.',
    No: 'We do not yet have a channel for workers or others to raise concerns.',
    'In progress': 'We are setting up a channel for workers and others to raise concerns.',
  }
  if (channel[str(v(D, 'grievance_mechanism'))]) c.push(say(channel[str(v(D, 'grievance_mechanism'))], `${D}.grievance_mechanism`))
  c.push(...narrative(D, 'grievance_description'))

  // s.54(5)(d): risk
  const R = 'risk' as const
  const d: Block[] = []
  const assessed: Record<string, string> = {
    Yes: 'We assessed the risk of slavery and human trafficking in our business and supply chains during the financial year.',
    No: 'We did not assess the risk of slavery and human trafficking in our business and supply chains during the financial year.',
    'In progress': 'We were assessing the risk of slavery and human trafficking in our business and supply chains during the financial year.',
  }
  if (assessed[str(v(R, 'risk_assessment_done'))]) d.push(say(assessed[str(v(R, 'risk_assessment_done'))], `${R}.risk_assessment_done`))
  const methods = strings(v(R, 'assessment_methods')).filter(m => m !== 'Other').map(lowerFirst)
  if (methods.length) d.push(say(`We assessed the risks through ${list(methods)}.`, `${R}.assessment_methods`))
  d.push(...table(R, 'risk_areas'), ...narrative(R, 'own_operations_risk'), ...narrative(R, 'management_steps'),
    ...facts(R, ['assessment_timing', 'assessment_role']), ...narrative(R, 'stakeholder_engagement'))

  // s.54(5)(e): effectiveness
  const E = 'effectiveness' as const
  const e: Block[] = []
  const checks: Record<string, string> = {
    Yes: 'We have a way of checking that our actions are working.',
    No: 'We do not yet have a way of checking that our actions are working.',
    'In progress': 'We are developing a way of checking that our actions are working.',
  }
  if (checks[str(v(E, 'assesses_effectiveness'))]) e.push(say(checks[str(v(E, 'assesses_effectiveness'))], `${E}.assesses_effectiveness`))
  const effMethods: Record<string, string> = {}
  const methodField = UK_SECTIONS.find(x => x.key === E)!.fields.find(f => f.key === 'methods')!
  for (const o of methodField.options ?? []) effMethods[o] = lowerFirst(methodField.optionLabels?.[o] ?? o)
  const em = strings(v(E, 'methods')).filter(m => m !== 'Other').map(m => effMethods[m] ?? lowerFirst(m))
  if (em.length) e.push(say(`We check this through ${list(em)}.`, `${E}.methods`))
  e.push(...table(E, 'indicators'), ...narrative(E, 'effectiveness_description'), ...facts(E, ['goal_horizons']),
    ...narrative(E, 'goals_short_term'), ...narrative(E, 'goals_medium_term'), ...narrative(E, 'goals_long_term'),
    ...narrative(E, 'progress_since_last_report'), ...narrative(E, 'findings_changed_practice'))

  // s.54(5)(f): training
  const T = 'training' as const
  const f: Block[] = []
  const trained: Record<string, string> = {
    Yes: 'We made training about slavery and human trafficking available to our staff during the financial year.',
    No: 'We did not provide training about slavery and human trafficking to our staff during the financial year.',
    'In progress': 'We were developing training about slavery and human trafficking during the financial year.',
  }
  if (trained[str(v(T, 'training_provided'))]) f.push(say(trained[str(v(T, 'training_provided'))], `${T}.training_provided`))
  if (v(T, 'covers_slavery_trafficking') === 'No') f.push(say('Our training does not yet cover slavery and human trafficking.', `${T}.covers_slavery_trafficking`))
  if (v(T, 'covers_slavery_trafficking') === 'In progress') f.push(say('We are extending our training to cover slavery and human trafficking.', `${T}.covers_slavery_trafficking`))
  const mandatory: Record<string, string> = { Mandatory: 'It is mandatory.', Optional: 'It is optional.', 'Mandatory for some roles': 'It is mandatory for some roles.' }
  if (mandatory[str(v(T, 'mandatory'))]) f.push(say(mandatory[str(v(T, 'mandatory'))], `${T}.mandatory`))
  const who: Record<string, string> = { 'All employees': 'all staff', 'Procurement and sourcing': 'procurement and sourcing staff', 'Senior management': 'senior management', 'Human resources': 'human resources staff', 'Other roles': 'other roles' }
  const audience = strings(v(T, 'audience')).map(x => who[x] ?? lowerFirst(x))
  if (audience.length) f.push(say(`It was given to ${list(audience)}.`, `${T}.audience`))
  const coversField = UK_SECTIONS.find(x => x.key === T)!.fields.find(x => x.key === 'covers')!
  const covered = strings(v(T, 'covers')).map(x => lowerFirst(coversField.optionLabels?.[x] ?? x).replace(/the organisation[’']s/g, 'our'))
  if (covered.length) f.push(say(`It covers ${list(covered)}.`, `${T}.covers`))
  const dev = v(T, 'developed_by'), devName = str(v(T, 'developer_name'))
  if (dev === 'Internally') f.push(say('We developed it in-house.', `${T}.developed_by`))
  if (typeof dev === 'string' && dev.startsWith('External')) // the stored option value, spelt as Canada's form spells it
    f.push(say(`It was developed by ${devName || 'an external organisation'}.`, `${T}.developed_by`, ...(devName ? [`${T}.developer_name`] : [])))
  if (dev === 'Both') f.push(say(`We developed it in-house with ${devName || 'an external organisation'}.`, `${T}.developed_by`, ...(devName ? [`${T}.developer_name`] : [])))
  f.push(...facts(T, ['frequency_and_length']))
  const n = v(T, 'employees_trained')
  if (typeof n === 'number' && Number.isFinite(n)) f.push(say(`${n.toLocaleString('en-GB')} ${n === 1 ? 'member of staff' : 'staff'} completed it during the financial year.`, `${T}.employees_trained`))
  if (v(T, 'assessment') === 'Yes') f.push(say('It ends with a test or other check.', `${T}.assessment`))
  if (v(T, 'assessment') === 'No') f.push(say('It does not end with a test or other check.', `${T}.assessment`))
  f.push(...narrative(T, 'training_description'))

  // s.54(6): approval and signing
  const AP = 'approval' as const
  const type = v(AP, 'org_type') as UkOrgType | undefined
  const approvalBlocks: Block[] = []
  const approvedOn = str(v(AP, 'approval_date')) ? ` on ${ukDate(str(v(AP, 'approval_date')))}` : ''
  if (type && isBoard(type)) approvalBlocks.push(say(`This statement was approved by ${theBody(str(v(AP, 'approving_body')) || UK_APPROVER[type] || 'the board of directors')} of ${org}${approvedOn}.`,
    `${AP}.org_type`, `${AP}.approving_body`, ...(approvedOn ? [`${AP}.approval_date`] : [])))
  if (type === 'llp') approvalBlocks.push(say(`This statement was approved by the members of ${org}${approvedOn}.`, `${AP}.org_type`, ...(approvedOn ? [`${AP}.approval_date`] : [])))
  const groupRows = (Array.isArray(v(AP, 'group_approvals')) ? v(AP, 'group_approvals') as Record<string, string>[] : []).filter(r => r && Object.values(r).some(isFilled))
  if (group && groupRows.length) {
    const cells = groupRows.map(r => [r.organisation ?? '', r.approved_by ?? '', r.approval_date ? ukDateText(r.approval_date) : '', r.signer_name ?? '', r.signer_title ?? ''])
    const keep = [0, 1, 2, 3, 4].filter(i => cells.some(r => isFilled(r[i]))) // a column empty in every row is left out
    approvalBlocks.push({ kind: 'table', title: 'Approval by each other organisation covered',
      columns: keep.map(i => ['Organisation', 'Approved by', 'Date of approval', 'Signed by', 'Position'][i]), rows: cells.map(r => keep.map(i => r[i])) })
  }
  const name = str(v(AP, 'signer_name')), position = str(v(AP, 'signer_title'))
  const signedOn = str(v(AP, 'signed_date')) ? ukDate(str(v(AP, 'signed_date'))) : ''
  const role = type ? UK_SIGNER_ROLE[type] : null
  // The role is not repeated when the position already states it: "Director of X", not "Director, a director of X".
  const states = role && type ? POSITION_STATES_ROLE[type].test(position) : false
  const signedAs = role ? (states ? `${position} of ${org}` : `${position}, ${role} of ${org}`) : position
  const signing = say(`This statement was signed by ${name}, ${signedAs}${signedOn ? `, on ${signedOn}` : ''}.`,
    `${AP}.signer_name`, `${AP}.signer_title`, ...(role ? [`${AP}.org_type`] : []), ...(signedOn ? [`${AP}.signed_date`] : []))
  const signer: SignatureBlock = { entity: org, statement: '', rows: [
    { label: 'Name', value: name }, { label: 'Position', value: position }, { label: 'Date', value: signedOn }, { label: 'Signature', value: '' }] }
  approvalBlocks.push({ kind: 'signature', heading: 'Signature', attestation: [(signing as { text: string }).text], signers: [signer] })

  const parts: PdfDocumentModel['parts'] = [{ title: 'Steps taken during the financial year', reference: `${UK_ACT}, s.54(4)`, blocks: steps }]
  const topicParts: [UkSectionKey, string, Block[]][] = [
    [A, 'a', a], ['policies', 'b', b], ['due_diligence', 'c', c], ['risk', 'd', d], ['effectiveness', 'e', e], ['training', 'f', f],
  ]
  for (const [k, letter, blocks] of topicParts) if (blocks.length) parts.push({ title: UK_SECTIONS.find(x => x.key === k)!.title, reference: `${UK_ACT}, s.54(5)(${letter})`, blocks })
  parts.push({ title: 'Approval and signing', reference: `${UK_ACT}, s.54(6)`, blocks: approvalBlocks, keepTogether: true })

  const fyText = fy ? `${ukDate(fy.start)} to ${ukDate(fy.end)}` : 'not given'
  const coverRows: [string, string][] = [['Financial year', fy ? fyText : 'Not given']]
  if (group) coverRows.push(['Organisations covered', [org, ...others].join('; ')])
  return {
    model: {
      cover: { title: UK_STATEMENT_TITLE, subtitle: UK_STATEMENT_SUBTITLE, legalName: org, revised: false, rows: coverRows },
      runningHeader: `${org}: ${UK_STATEMENT_TITLE}, financial year ${fyText}`,
      parts,
      footerCredit: null,
      metadata: { title: `${org}: ${UK_STATEMENT_TITLE}`, subject: `${UK_STATEMENT_TITLE}, ${UK_STATEMENT_SUBTITLE.toLowerCase()}, financial year ${fyText}`, author: org, language: 'en-GB' },
    },
    trace,
  }
}

/** A position that already names the role the Act requires, so the signing sentence does not repeat it. */
const POSITION_STATES_ROLE: Record<UkOrgType, RegExp> = {
  company: /\bdirector\b/i,
  body_corporate: /\bdirector\b/i,
  llp: /\bdesignated member\b/i,
  limited_partnership: /\bgeneral partner\b/i,
  other_partnership: /\bpartner\b/i,
}

export const buildUkStatementModel = (input: UkStatementInput): PdfDocumentModel => buildUkStatement(input).model

/** The file name: the organisation, the statement, the financial year's end. */
export function ukStatementFileName(m: PdfDocumentModel, end: string | null): string {
  const org = m.cover.legalName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'organisation'
  return `${org}-modern-slavery-statement${end ? `-${end.slice(0, 4)}` : ''}.pdf`
}
