// lib/s211/testing/fakeSaveSection.ts
// The in-memory stand-in for public.fl_save_canada_section (supabase/migrations/20261001_fl_save_canada_section.sql),
// used by lib/s211/testing/fakeSupabase.ts. It does what the SQL function does, in the same order, with the
// same checks the tables make, and like one Postgres transaction it restores every table if anything fails.
//
// ⚠️ THIS IS AN IMITATION, AND THE ROUTE TESTS PROVE ONLY THE ROUTE AGAINST IT: that the route saves through
// one call and reports a failed call as a failed save. That the REAL function writes both tables or neither
// is Postgres's transaction, shown in production by supabase/verify/20261001_fl_save_canada_section_verify_atomic.sql.
//
// failInSave: make the first write ('answers') or the second ('section') fail, after any earlier write
// in the call has already been applied, so the restore is what a test sees.

type Row = Record<string, unknown>
export type FailInSave = 'answers' | 'section' | null

const SECTION_KEYS = ['report_details', 'structure_activities_supply_chains', 'policies_due_diligence', 'risks', 'remediation',
  'remediation_income_loss', 'training', 'effectiveness', 'steps_taken', 'other_information', 'approval_attestation']
const STATUSES = ['not_started', 'in_progress', 'complete']
const FIELD_KEY = /^[a-z0-9_]+\.[a-z0-9_]+$/
const isObject = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)

export function fakeSaveSection(db: { tables: Record<string, Row[]> }, args: Record<string, unknown>, failInSave: FailInSave):
  { data: unknown; error: { message: string; code: string } | null } {
  const before = structuredClone(db.tables)
  const fail = (code: string, message: string) => { throw Object.assign(new Error(message), { code }) }
  try {
    const { p_report_id, p_section_key, p_content, p_status, p_answers, p_remove } = args as Record<string, never>
    if (!isObject(p_content) || !isObject(p_answers)) fail('22023', 'content and answers must be JSON objects')
    const report = (db.tables.s211_reports ?? []).find(r => r.id === p_report_id)
    if (!report) fail('P0002', 'report not found')
    const fl = report!.fl_report_id
    if (!fl) fail('55000', 'the report has no Forced Labour parent')
    const now = new Date().toISOString()

    // 1. the shared answers
    const answers = (db.tables.fl_answers ??= [])
    for (const [field_key, value] of Object.entries(p_answers as Record<string, unknown>)) {
      if (!FIELD_KEY.test(field_key)) fail('23514', 'fl_answers_field_key_check')
      const hit = answers.find(a => a.report_id === fl && a.field_key === field_key)
      if (hit) Object.assign(hit, { value, updated_at: now })
      else answers.push({ report_id: fl, field_key, value, updated_at: now })
    }
    const remove = (p_remove ?? []) as string[]
    db.tables.fl_answers = answers.filter(a => !(a.report_id === fl && remove.includes(a.field_key as string)))
    if (failInSave === 'answers') fail('XX000', 'injected failure in the first write')

    // 2. the section
    if (failInSave === 'section') fail('XX000', 'injected failure in the second write')
    if (!SECTION_KEYS.includes(p_section_key)) fail('23514', 's211_report_sections_section_key_check')
    if (!STATUSES.includes(p_status)) fail('23514', 's211_report_sections_status_check')
    const sections = (db.tables.s211_report_sections ??= [])
    let row = sections.find(s => s.report_id === p_report_id && s.section_key === p_section_key)
    if (row) Object.assign(row, { content: p_content, status: p_status, updated_at: now })
    else { row = { report_id: p_report_id, section_key: p_section_key, content: p_content, status: p_status, updated_at: now }; sections.push(row) }

    // 3. the report's updated_at
    report!.updated_at = now
    return { data: { section_key: row.section_key, content: row.content, status: row.status, updated_at: row.updated_at }, error: null }
  } catch (e) {
    // Rolled back: every table as it was before the call, in place, so references the test holds stay valid.
    for (const k of Object.keys(db.tables)) if (!(k in before)) delete db.tables[k]
    for (const [k, rows] of Object.entries(before)) db.tables[k] = rows
    const err = e as { message: string; code?: string }
    return { data: null, error: { message: err.message, code: err.code ?? 'XX000' } }
  }
}

/**
 * The in-memory stand-in for public.fl_save_country_section (supabase/migrations/20261001_fl_save_country_section.sql):
 * the same refusals before any write, the same order, and every table restored on failure. failInSave as above.
 */
export function fakeSaveCountrySection(db: { tables: Record<string, Row[]> }, args: Record<string, unknown>, failInSave: FailInSave):
  { data: unknown; error: { message: string; code: string } | null } {
  const before = structuredClone(db.tables)
  const fail = (code: string, message: string) => { throw Object.assign(new Error(message), { code }) }
  try {
    const { p_report_id, p_country, p_section_key, p_content, p_status, p_answers, p_remove } = args as Record<string, never>
    if (!isObject(p_content) || !isObject(p_answers)) fail('22023', 'content and answers must be JSON objects')
    if (!p_country || p_country === 'canada') fail('22023', 'Canada is saved by fl_save_canada_section')
    if (typeof p_section_key !== 'string' || !/^[a-z0-9_]+$/.test(p_section_key)) fail('22023', 'malformed section key')
    if (!STATUSES.includes(p_status)) fail('22023', 'unknown status')
    const now = new Date().toISOString()

    const answers = (db.tables.fl_answers ??= [])
    for (const [field_key, value] of Object.entries(p_answers as Record<string, unknown>)) {
      if (!FIELD_KEY.test(field_key)) fail('23514', 'fl_answers_field_key_check')
      const hit = answers.find(a => a.report_id === p_report_id && a.field_key === field_key)
      if (hit) Object.assign(hit, { value, updated_at: now })
      else answers.push({ report_id: p_report_id, field_key, value, updated_at: now })
    }
    const remove = (p_remove ?? []) as string[]
    db.tables.fl_answers = answers.filter(a => !(a.report_id === p_report_id && remove.includes(a.field_key as string)))
    if (failInSave === 'answers') fail('XX000', 'injected failure in the first write')

    if (failInSave === 'section') fail('XX000', 'injected failure in the second write')
    const row = (db.tables.fl_report_countries ?? []).find(k => k.report_id === p_report_id && k.country === p_country)
    if (!row) fail('P0002', `the report has no ${p_country} row`)
    row!.content = { ...((row!.content ?? {}) as Row), [p_section_key]: p_content }
    row!.section_status = { ...((row!.section_status ?? {}) as Row), [p_section_key]: p_status }
    row!.updated_at = now
    const parent = (db.tables.fl_reports ?? []).find(r => r.id === p_report_id)
    if (parent) parent.updated_at = now
    return { data: { section_key: p_section_key, content: p_content, status: p_status, updated_at: now }, error: null }
  } catch (e) {
    for (const k of Object.keys(db.tables)) if (!(k in before)) delete db.tables[k]
    for (const [k, rows] of Object.entries(before)) db.tables[k] = rows
    const err = e as { message: string; code?: string }
    return { data: null, error: { message: err.message, code: err.code ?? 'XX000' } }
  }
}

/** In-memory public.fl_set_country_entities (supabase/migrations/20261001_fl_entities_and_create.sql). */
export function fakeSetCountryEntities(db: { tables: Record<string, Row[]> }, args: Record<string, unknown>):
  { data: unknown; error: { message: string; code: string } | null } {
  const before = structuredClone(db.tables)
  const fail = (code: string, message: string) => { throw Object.assign(new Error(message), { code }) }
  try {
    const report = args.p_report_id, country = args.p_country as string
    const giving = String(args.p_giving ?? '').trim()
    const covered = ((args.p_covered ?? []) as string[])
    if (!country || country === 'canada') fail('22023', 'Canada keeps its entities in section 1')
    if (!giving) fail('22023', 'name the giving entity')
    const names = [...new Set([...covered, giving].map(n => n.trim()))]
    if (names.some(n => !n)) fail('22023', 'a blank name')
    const trimmed = covered.map(n => n.trim())
    if (new Set(trimmed).size !== trimmed.length) fail('22023', 'a name is repeated')
    if (!(db.tables.fl_report_countries ?? []).some(k => k.report_id === report && k.country === country)) fail('P0002', `no ${country} row`)
    const ents = (db.tables.fl_report_entities ??= [])
    for (const e of ents.filter(e => e.report_id === report)) {
      e.reporting_in = ((e.reporting_in ?? []) as string[]).filter(c => c !== country)
      e.giving_in = ((e.giving_in ?? []) as string[]).filter(c => c !== country)
    }
    let pos = Math.max(-1, ...ents.filter(e => e.report_id === report).map(e => Number(e.position ?? 0))) + 1
    for (const n of names) if (!ents.some(e => e.report_id === report && e.legal_name === n)) ents.push({ id: `ent-${ents.length + 1}`, report_id: report, legal_name: n, reporting_in: [], giving_in: [], position: pos++ })
    for (const e of ents.filter(e => e.report_id === report && names.includes(e.legal_name as string))) e.reporting_in = [...(e.reporting_in as string[]), country]
    for (const e of ents.filter(e => e.report_id === report && e.legal_name === giving)) e.giving_in = [...(e.giving_in as string[]), country]
    return { data: { giving, covered: names }, error: null }
  } catch (e) {
    for (const k of Object.keys(db.tables)) if (!(k in before)) delete db.tables[k]
    for (const [k, rows] of Object.entries(before)) db.tables[k] = rows
    const err = e as { message: string; code?: string }
    return { data: null, error: { message: err.message, code: err.code ?? 'XX000' } }
  }
}

/** In-memory public.fl_create_report, as the signed-in user `uid`. */
export function fakeCreateReport(db: { tables: Record<string, Row[]> }, args: Record<string, unknown>, uid: string):
  { data: unknown; error: { message: string; code: string } | null } {
  const name = String(args.p_organization_name ?? '').trim()
  const country = args.p_country as string
  if (!name || !country || country === 'canada') return { data: null, error: { message: 'refused', code: '22023' } }
  const id = `fl-${(db.tables.fl_reports ??= []).length + 1}`
  db.tables.fl_reports.push({ id, user_id: uid, organization_name: name, updated_at: new Date().toISOString() })
  ;(db.tables.fl_report_countries ??= []).push({ report_id: id, country, status: 'draft', content: {}, section_status: {}, applicability: {} })
  return { data: id, error: null }
}
