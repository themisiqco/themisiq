// lib/materiality/respondentImport.ts
//
// Pure helpers for bulk respondent import. No React, no Supabase — everything here is a function of
// its arguments, so the rules that decide whether a row is creatable can be reasoned about (and
// tested) without a database.
//
// ⚠️ THE CATEGORY IS NEVER INFERRED, ONLY MATCHED OR ASSIGNED. A customer's existing list is names
// and emails; asking them to add a column of ESRS codes is how a misspelled value silently routes
// someone to 25 questions instead of 31 — wrong evidence, no error, the same shape as the S2 framing
// defect. So: if a file carries a category column, every value is matched against
// mr_stakeholder_categories and an unmatched one becomes a row that needs assigning, NEVER a
// default. If it does not, the rows arrive unassigned and a human picks from a select.
//
// ⚠️ AND DOMAIN IS AN ORDERING SIGNAL, NEVER AN ASSIGNMENT. groupByDomain exists so a customer can
// select eighteen colleagues in one click. It does not guess that they are own_workforce. Guessing
// would put a wrong category on a row that looks deliberate, which is worse than a blank one.

export type CategoryRef = {
  code: string
  label: string
  track: 'internal' | 'external'
  labour_routing: 's1' | 's2' | 'not_asked'
  typically_surveyed: boolean
}

export type RowProblem =
  | 'no_email'
  | 'bad_email'
  | 'no_name'
  | 'duplicate_in_file'
  | 'duplicate_existing'
  | 'unmatched_category'
  | 'name_is_a_pasted_row'

export type ImportRow = {
  key: string
  line: number                 // 1-based line in the source file, for messages
  name: string
  email: string
  rawCategory: string | null   // exactly as it appeared in the file, for the message
  category: string | null      // resolved code — from the file, or assigned in the UI
  source: 'file' | 'assigned' | null
  problems: RowProblem[]
}

/** Header matching is tolerant of case, spacing and punctuation: "Full Name" == "full_name". */
const normaliseHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

const NAME_KEYS  = ['name', 'fullname', 'respondent', 'contact', 'contactname', 'person']
const EMAIL_KEYS = ['email', 'emailaddress', 'mail', 'e']
const CAT_KEYS   = ['category', 'stakeholdercategory', 'type', 'stakeholder', 'group']

const pick = (row: Record<string, unknown>, keys: string[]): string => {
  for (const k of Object.keys(row)) {
    if (keys.includes(normaliseHeader(k))) {
      const v = row[k]
      if (v == null) continue
      const s = String(v).trim()
      if (s) return s
    }
  }
  return ''
}

// Deliberately permissive: this rejects obvious nonsense, not unusual-but-valid addresses. A false
// rejection here blocks a real respondent, which is worse than letting a bad address through to a
// bounce the progress screen will show.
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export const emailKey = (s: string) => s.trim().toLowerCase()

/**
 * Matches a file's category text against the reference table, case-insensitively, on either the
 * CODE or the LABEL — customers type "Supplier", not "supplier". Returns null when nothing matches,
 * and null is what makes the row need a human rather than a default.
 */
export function matchCategory(raw: string, categories: CategoryRef[]): CategoryRef | null {
  const n = raw.trim().toLowerCase()
  if (!n) return null
  return categories.find(c => c.code.toLowerCase() === n)
      ?? categories.find(c => c.label.toLowerCase() === n)
      ?? null
}

/**
 * Turns parsed records into rows, with every problem attached rather than dropped.
 *
 * `existingEmails` should be the emails of NON-REVOKED respondents already in this round. A revoked
 * invitation does not block re-inviting the same person — the token is dead, the person is not.
 */
export function buildRows(
  records: Record<string, unknown>[],
  categories: CategoryRef[],
  existingEmails: string[],
): ImportRow[] {
  const existing = new Set(existingEmails.map(emailKey))
  const seen = new Set<string>()

  // ⚠️ A ROW WITH NEITHER A NAME NOR AN EMAIL IS NOT A PERSON. Trailing blanks, spacer rows and the
  // guidance text the template carries in a far column all produce records like that, and reporting
  // them as "blocked" would fill the preview with rows the customer cannot act on. Dropped before
  // numbering, so the line numbers still refer to the file.
  return records
    .map((rec, i) => ({ rec, line: i + 1 }))
    .filter(({ rec }) => pick(rec, NAME_KEYS) || pick(rec, EMAIL_KEYS))
    .map(({ rec, line: i }) => {
    const name = pick(rec, NAME_KEYS)
    const email = pick(rec, EMAIL_KEYS)
    const rawCategory = pick(rec, CAT_KEYS) || null

    const problems: RowProblem[] = []
    if (!name) problems.push('no_name')
    // ⚠️ A NAME CELL CONTAINING AN @ IS A PASTED ROW, NOT A NAME.
    // Diagnosed 18 Aug 2026 from a real upload: one row arrived with name =
    // "Dana Reeve,dana@acmesupplies.com,suppliar" while its email parsed correctly. The parser was
    // proved sound against the same shape — a well-formed sheet with an invalid category parses to
    // name="Dana Reeve" — so the CELL contained that text, most likely a CSV line pasted into
    // column A while the other cells were filled separately.
    // It is REJECTED, never repaired. Splitting on the comma would be guessing which fragment is the
    // name, and the cost of guessing wrong is high: invite_name is what the respondent sees as
    // "Completing as", what appears in their invitation email, and what the ESRS 2 SBM-2 engagement
    // record carries. A row that silently becomes a malformed name is worse than a rejected one.
    if (name.includes('@')) problems.push('name_is_a_pasted_row')
    if (!email) problems.push('no_email')
    else if (!looksLikeEmail(email)) problems.push('bad_email')

    const k = emailKey(email)
    if (email && existing.has(k)) problems.push('duplicate_existing')
    if (email && seen.has(k)) problems.push('duplicate_in_file')
    if (email) seen.add(k)

    let category: string | null = null
    let source: ImportRow['source'] = null
    if (rawCategory) {
      const hit = matchCategory(rawCategory, categories)
      if (hit) { category = hit.code; source = 'file' }
      else problems.push('unmatched_category')
    }

    return { key: `r${i}`, line: i, name, email, rawCategory, category, source, problems }
  })
}

/** A row that can never be created, whatever the customer does on this screen. */
export const isBlocked = (r: ImportRow) =>
  r.problems.some(p => p === 'no_email' || p === 'bad_email' || p === 'no_name'
                    || p === 'name_is_a_pasted_row')

/** A row that is deliberately not created because the person is already invited. */
export const isDuplicate = (r: ImportRow) =>
  r.problems.some(p => p === 'duplicate_existing' || p === 'duplicate_in_file')

/** Still needs a human: not blocked, not a duplicate, and no category yet. */
export const needsCategory = (r: ImportRow) =>
  !isBlocked(r) && !isDuplicate(r) && !r.category

/** Will be created on confirm. */
export const isReady = (r: ImportRow) =>
  !isBlocked(r) && !isDuplicate(r) && !!r.category

export function problemText(p: RowProblem, r: ImportRow): string {
  switch (p) {
    case 'no_email':            return 'No email address — there would be nothing to send to.'
    case 'bad_email':           return `“${r.email}” does not look like an email address.`
    case 'no_name':             return 'No name — the respondent sees this as “Completing as”.'
    case 'duplicate_existing':  return 'Already invited to this round.'
    case 'duplicate_in_file':   return 'Appears more than once in this file.'
    case 'unmatched_category':  return `“${r.rawCategory}” is not a stakeholder category — choose one below.`
    case 'name_is_a_pasted_row': return `The name cell contains more than a name — “${r.name}”. It looks like a whole row pasted into one cell. Fix it in your file and upload again; it is not split automatically, because guessing which part is the name would put the wrong text in this person’s invitation.`
  }
}

/** Groups by email domain, for SELECTION only. See the header. */
export function groupByDomain(rows: ImportRow[]): { domain: string; keys: string[] }[] {
  const m = new Map<string, string[]>()
  for (const r of rows) {
    const at = r.email.lastIndexOf('@')
    if (at < 0) continue
    const d = r.email.slice(at).toLowerCase()
    const list = m.get(d) ?? []
    list.push(r.key)
    m.set(d, list)
  }
  return [...m.entries()]
    .map(([domain, keys]) => ({ domain, keys }))
    .sort((a, b) => b.keys.length - a.keys.length)
}

/**
 * How many questions a category's respondents will be asked, from THIS round's included question
 * set. Never hardcoded as 31/25 — the scope screen moves both numbers.
 */
export function questionsFor(
  routing: CategoryRef['labour_routing'],
  counts: { shared: number; s1: number; s2: number },
): number {
  return counts.shared + (routing === 's1' ? counts.s1 : routing === 's2' ? counts.s2 : 0)
}

/**
 * The template's respondent sheet. Header row only — an example row would be imported as a person.
 *
 * ⚠️ THE TEMPLATE IS XLSX ONLY, AND A CSV TEMPLATE WAS DELIBERATELY REMOVED (18 Aug 2026). Everything
 * that makes the template worth downloading lives in cells a CSV cannot carry: the how-to-fill-this-in
 * column on sheet 1, and the eleven-code Categories sheet. A CSV template was three words and a
 * return trip to the screen — offered on the very path most likely to produce a bad category value.
 * CSV UPLOAD is untouched and must stay: people export CSVs from their own systems.
 */
export const TEMPLATE_HEADERS = ['name', 'email', 'category'] as const

/**
 * The reference rows shown on screen and written to the template's second sheet. Generated from
 * mr_stakeholder_categories, never a hardcoded list, so it moves when the table moves.
 */
export function categoryReference(
  categories: CategoryRef[],
  counts: { shared: number; s1: number; s2: number },
): { code: string; label: string; asked: number; note: string }[] {
  return categories.map(c => ({
    code: c.code,
    label: c.label,
    asked: questionsFor(c.labour_routing, counts),
    note:
      c.labour_routing === 's1'
        ? 'Asked about conditions in your own workforce.'
        : c.labour_routing === 's2'
          ? 'Asked about conditions in their own organisation’s workforce, not yours.'
          : 'Not asked the workforce topics — they cannot observe either workforce.',
  }))
}

// ── Shared copy ───────────────────────────────────────────────────────────────
//
// ⚠️ ONE STRING, TWO SURFACES. The explanation below appears on the import screen AND on the
// template's category sheet, because a customer who downloads the file and fills it in offline never
// sees the screen. Two copies would drift, and the clause that matters most is the one most likely
// to be trimmed as wordy.

/** Screen only — it says "here", which is meaningless in a downloaded file. */
export const CATEGORY_COLUMNS_LINE =
  'Three columns: name, email, and category. Fill the category column in or leave it blank — ' +
  'you’ll confirm every person’s category here either way.'

/** Template file only — "in ThemisIQ", because the reader is not looking at the screen. */
export const CATEGORY_COLUMNS_LINE_FILE =
  'Fill the category column in or leave it blank — you’ll confirm every person’s category in ' +
  'ThemisIQ either way.'

/**
 * ⚠️ NO DROPDOWN IS WRITTEN INTO THE TEMPLATE, so this sentence is the only thing standing between a
 * customer typing offline and a silent misroute. SheetJS Community Edition SILENTLY DISCARDS
 * `!dataValidation` — verified by generating a file and grepping the XML, not by reading the docs —
 * and injecting the element by hand needs a zip library the project does not declare. Until a
 * dropdown exists, the file says this instead of implying the cell is guarded.
 */
export const CATEGORY_TYPE_EXACTLY =
  'If you fill the category column in, type a code from the list below EXACTLY as it appears — ' +
  'there is no dropdown in this file to check it for you. Anything unrecognised is not guessed at: ' +
  'it comes back for you to set in ThemisIQ.'

/**
 * ⚠️ THE LAST CLAUSE MUST SURVIVE EDITING. "not asked at all rather than being recorded as having no
 * view" is the not_asked-versus-abstained distinction (spec v9 §3.0.1) in plain words, and it is the
 * whole reason a category cannot be guessed or defaulted: an abstention is a finding about the
 * COMPANY's visibility, and manufacturing one from a wrong category reports a routing mistake as
 * evidence about the undertaking.
 */
export const CATEGORY_MEANING =
  'A person’s category is their relationship to the company — your own employee, a contact at a ' +
  'supplier, a customer, someone from a community near your sites. It decides which questions they ' +
  'see: people who can observe a workforce are asked about workforce conditions, and people who ' +
  'cannot are not asked at all rather than being recorded as having no view.'

/**
 * Counts a round's included questions into the three routing buckets. Extracted so the template
 * route derives them the same way the screens do — four inline copies of this loop is how the
 * template ends up quoting a different number from the page that links to it.
 */
export function deriveQuestionCounts(
  questions: { subtopic_code: string | null; status: string }[],
  topicOf: Record<string, string>,
): { shared: number; s1: number; s2: number } {
  let shared = 0, s1 = 0, s2 = 0
  for (const q of questions) {
    if (q.status !== 'included') continue
    const t = q.subtopic_code ? topicOf[q.subtopic_code] : undefined
    if (t === 'S1') s1++
    else if (t === 'S2') s2++
    else shared++
  }
  return { shared, s1, s2 }
}
