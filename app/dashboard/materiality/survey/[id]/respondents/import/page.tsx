'use client'

/**
 * Bulk respondent import — paths 2 and 3. The one-at-a-time form on the respondents screen is
 * untouched and remains available; all three paths coexist.
 *
 *   PATH 2  Download a template (CSV or XLSX) generated from mr_stakeholder_categories.
 *   PATH 3  Upload the customer's own list — name and email only — and assign categories here,
 *           where the value comes from a select and cannot be mistyped.
 *
 * ⚠️ NOTHING IS CREATED UNTIL A PREVIEW IS CONFIRMED, and the confirm is a SINGLE bulk insert. That
 * is not an optimisation: one statement is atomic, so a partial import cannot happen. Duplicates and
 * blocked rows are filtered out before the statement, so it only ever carries rows meant to exist.
 *
 * ⚠️ A ROW WITH NO CATEGORY IS BLOCKED, NEVER DEFAULTED. The category decides which questions a
 * person is asked — 31 or 25 — so a guessed one is wrong evidence with no error. This is the same
 * shape of defect the S2 framing carried, and the reason the file is parsed for name and email only.
 *
 * ⚠️ NO PAGINATION AND NO RENDER CAP. The invariant is that nothing is created until every row has a
 * category; a customer who cannot see the unassigned rows cannot act on them, and a page number
 * hides them. Every row renders. The category control is a BUTTON that mounts a select only for the
 * row being edited, so two hundred rows stay light, and a sticky counter jumps to the next
 * unassigned row so they are reachable as well as visible.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Papa from 'papaparse'
import Nav from '../../../../../../components/Nav'
import PaywallCard from '../../../../../../components/PaywallCard'
import { PAYWALL_HREF, PAYWALL_SURVEY, PAYWALL_TITLE } from '@/lib/paywallCopy'
import { supabase } from '../../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../../lib/useEntitlement'
import {
  buildRows, groupByDomain, isBlocked, isDuplicate, isReady, needsCategory,
  problemText, questionsFor, categoryReference,
  CATEGORY_COLUMNS_LINE, CATEGORY_MEANING,
  type CategoryRef, type ImportRow,
} from '../../../../../../../lib/materiality/respondentImport'

const GRAD = 'var(--color-brand)'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
const AMBER = 'var(--color-module-climate)'
const AMBER_BG = '#FEF3E2'
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'

type Round = { id: string; name: string; company_name: string | null; status: string; questionnaire_version: number; standard_version: string }

export default function RespondentImport() {
  const isPaid = useEntitlement('double-materiality')
  const params = useParams()
  const roundId = params.id as string
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadBoxRef = useRef<HTMLDivElement>(null)
  const chooseBtnRef = useRef<HTMLButtonElement>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const [cats, setCats] = useState<CategoryRef[]>([])
  const [existingEmails, setExistingEmails] = useState<string[]>([])
  const [counts, setCounts] = useState({ shared: 0, s1: 0, s2: 0 })

  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [lastBulk, setLastBulk] = useState<{ label: string; before: Record<string, { category: string | null; source: ImportRow['source'] }> } | null>(null)

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ n: number; skipped: number; blocked: number } | null>(null)

  useEffect(() => { load() }, [roundId])

  const load = async () => {
    setLoading(true); setLoadError(null)
    const { data: rd, error } = await supabase
      .from('materiality_survey_rounds')
      .select('id, name, company_name, status, questionnaire_version, standard_version')
      .eq('id', roundId).maybeSingle()
    if (error) { setLoadError(error.message); setLoading(false); return }
    if (!rd) { setLoadError('This survey round was not found, or it belongs to another account.'); setLoading(false); return }
    setRound(rd as Round)

    const [ct, rp, qs, subs] = await Promise.all([
      supabase.from('mr_stakeholder_categories')
        .select('code, label, track, labour_routing, typically_surveyed').order('sort_order'),
      supabase.from('materiality_survey_respondents')
        .select('invite_email, status').eq('round_id', roundId),
      supabase.from('materiality_survey_questions')
        .select('subtopic_code, status')
        .eq('round_id', roundId).eq('questionnaire_version', (rd as Round).questionnaire_version),
      supabase.from('mr_esrs_subtopics').select('code, topic_code')
        .eq('standard_version', (rd as Round).standard_version),
    ])

    setCats((ct.data ?? []) as CategoryRef[])
    // A revoked invitation does not block re-inviting the same person: the token is dead, they are not.
    setExistingEmails(((rp.data ?? []) as any[])
      .filter(r => r.status !== 'revoked' && r.invite_email)
      .map(r => r.invite_email as string))

    const topicOf = Object.fromEntries(((subs.data ?? []) as any[]).map(s => [s.code, s.topic_code]))
    let shared = 0, s1 = 0, s2 = 0
    for (const q of ((qs.data ?? []) as any[])) {
      if (q.status !== 'included') continue
      const t = q.subtopic_code ? topicOf[q.subtopic_code] : undefined
      if (t === 'S1') s1++; else if (t === 'S2') s2++; else shared++
    }
    setCounts({ shared, s1, s2 })
    setLoading(false)
  }

  const reference = useMemo(() => categoryReference(cats, counts), [cats, counts])

  // ── PATH 2 — the template ───────────────────────────────────────────────────
  const [tplError, setTplError] = useState<string | null>(null)
  const [tplBusy, setTplBusy] = useState<string | null>(null)
  /**
   * ⚠️ A PROMPT, NOT A CLAIM ABOUT STATE. Set when the template download completes, and used only to
   * highlight the upload box and add an INSTRUCTION ("Upload the template here once it is filled
   * in"). It deliberately never asserts what the customer has — a browser save dialog can be
   * cancelled and this code cannot tell, so "the file you just downloaded" would sometimes be false.
   * Component-local and lost on refresh, which degrades to the generic copy rather than to a wrong
   * sentence.
   */
  const [downloaded, setDownloaded] = useState(false)

  /**
   * ⚠️ REWRITTEN. The previous version created a detached <a>, clicked it, and revoked the object URL
   * synchronously. Both are download-killers: Firefox will not act on an anchor that is not in the
   * document, and revoking immediately can abort the transfer before the browser has read the blob.
   * The anchor is now appended, clicked, removed, and the URL revoked on a later tick.
   */
  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  // The file is built server-side (…/respondents/template) so the workbook assembly is in one place
  // and exists whether or not the browser's download step behaves. It is authenticated, because the
  // template carries this round's question counts — so a bearer token, which a plain link cannot
  // send, hence fetch-then-save rather than an <a href>.
  const downloadTemplate = async () => {
    setTplBusy('xlsx'); setTplError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/dashboard/materiality/survey/${roundId}/respondents/template?format=xlsx`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setTplError(body.error || `The template could not be built (HTTP ${res.status}).`)
        return
      }
      const blob = await res.blob()
      if (blob.size === 0) { setTplError('The template came back empty. Nothing was downloaded.'); return }
      const stamp = new Date().toISOString().slice(0, 10)
      saveBlob(blob, `respondents-${stamp}.xlsx`)
      setDownloaded(true)
    } catch (e: any) {
      setTplError(`The template request did not reach the server (${e?.message || 'network error'}).`)
    } finally {
      setTplBusy(null)
    }
  }

  // ── PATH 3 — parse ──────────────────────────────────────────────────────────
  const onFile = async (f: File) => {
    setParseError(null); setRows(null); setSelected(new Set()); setCreated(null); setLastBulk(null)
    setFileName(f.name)
    const lower = f.name.toLowerCase()

    try {
      let records: Record<string, unknown>[] = []
      if (lower.endsWith('.csv') || f.type === 'text/csv') {
        records = await new Promise((resolve, reject) => {
          Papa.parse(f, {
            header: true, skipEmptyLines: true,
            complete: r => resolve(r.data as Record<string, unknown>[]),
            error: (e: any) => reject(e),
          })
        })
      } else if (lower.endsWith('.xlsx')) {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
        const first = wb.SheetNames[0]
        if (!first) throw new Error('The workbook has no sheets.')
        records = XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: '' }) as Record<string, unknown>[]
      } else {
        setParseError(`“${f.name}” is not a .csv or .xlsx file. Legacy .xls is not supported — save it as .xlsx.`)
        return
      }

      if (!records.length) {
        setParseError('That file has no rows under its header. Nothing was read.')
        return
      }
      const built = buildRows(records, cats, existingEmails)
      // Say what was NOT found rather than silently importing blanks.
      if (built.every(r => !r.email && !r.name)) {
        setParseError('No name or email column was recognised. The first row must be a header with columns named name and email.')
        return
      }
      setRows(built)
    } catch (e: any) {
      setParseError(`That file could not be read (${e?.message || 'unknown error'}). Nothing was imported.`)
    }
  }

  // ── Assignment ──────────────────────────────────────────────────────────────
  const setCategory = (keys: string[], code: string | null, label: string) => {
    if (!rows) return
    const before: Record<string, { category: string | null; source: ImportRow['source'] }> = {}
    for (const r of rows) if (keys.includes(r.key)) before[r.key] = { category: r.category, source: r.source }
    setRows(rows.map(r => keys.includes(r.key)
      ? { ...r, category: code, source: code ? 'assigned' : null,
          problems: r.problems.filter(p => p !== 'unmatched_category') }
      : r))
    // Announce and make it undoable — someone will click "assign to all" on the wrong group.
    if (keys.length > 1) setLastBulk({ label, before })
  }

  const undoBulk = () => {
    if (!rows || !lastBulk) return
    setRows(rows.map(r => lastBulk.before[r.key]
      ? { ...r, category: lastBulk.before[r.key].category, source: lastBulk.before[r.key].source }
      : r))
    setLastBulk(null)
  }

  const domains = useMemo(() => rows ? groupByDomain(rows.filter(r => !isBlocked(r) && !isDuplicate(r))) : [], [rows])
  const unassigned = useMemo(() => rows ? rows.filter(needsCategory) : [], [rows])
  const ready = useMemo(() => rows ? rows.filter(isReady) : [], [rows])
  const excluded = useMemo(() => rows ? rows.filter(r => isBlocked(r) || isDuplicate(r)) : [], [rows])

  const jumpToNextUnassigned = () => {
    const first = unassigned[0]
    if (first) document.getElementById(`row-${first.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // ── Confirm — ONE bulk insert ───────────────────────────────────────────────
  const confirm = async () => {
    if (!rows || !ready.length) return
    setCreating(true); setCreateError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const byCode = Object.fromEntries(cats.map(c => [c.code, c]))

    const payload = ready.map(r => {
      const c = byCode[r.category as string]
      return {
        round_id: roundId,
        // ⚠️ NO DEFAULT on this column — an omitted user_id fails NOT NULL and names the wrong problem.
        user_id: session?.user?.id,
        // ⚠️ FROM THE CATEGORY. The composite FK on (stakeholder_category, track) rejects a
        // mismatched pair, and that constraint exists so a miscategorised respondent cannot be
        // silently misrouted between S1 and S2.
        track: c.track,
        stakeholder_category: c.code,
        invite_name: r.name,
        invite_email: r.email,
      }
    })

    const { data, error } = await supabase
      .from('materiality_survey_respondents').insert(payload).select('id')

    setCreating(false)
    if (error) { setCreateError(error.message); return }
    if (!data || data.length !== payload.length) {
      setCreateError(`Expected ${payload.length} respondents to be created but the database returned ${data?.length ?? 0}. Nothing partial has been left behind — the insert is a single statement — but reload and check before trying again.`)
      return
    }
    setCreated({ n: data.length, skipped: excluded.filter(isDuplicate).length, blocked: excluded.filter(isBlocked).length })
    setRows(null); setSelected(new Set()); setLastBulk(null)
    load()
  }

  // ── Screens ─────────────────────────────────────────────────────────────────
  const btn: React.CSSProperties = { fontSize: 12.5, padding: '7px 14px', borderRadius: 8, border: '1px solid #e8e7e4', background: '#fff', color: '#555553', cursor: 'pointer' }

  if (isPaid === false) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav /><div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>
        <PaywallCard title={PAYWALL_TITLE}
          body={PAYWALL_SURVEY}
          href={PAYWALL_HREF} />
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav /><div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-ink-muted)' }}>Loading…</div></div>
  )

  if (loadError) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav /><div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem', fontSize: 13.5, color: '#555553', lineHeight: 1.7 }}>{loadError}</div>
      </div></div>
  )

  // ⚠️ CLOSED ROUNDS ARE BLOCKED. An open round with responses is fine — the question set freezes,
  // the respondent list does not, and someone remembering a colleague mid-round should work. A closed
  // round has produced an aggregate that an assessment may already have consumed (20260827), and
  // moving its denominator afterwards changes evidence that has been read.
  const closed = round?.status === 'closed'

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
          <Link href={`/dashboard/materiality/survey/${roundId}/respondents`} style={{ fontSize: 12, color: 'var(--color-brand)', textDecoration: 'none' }}>← Respondents</Link>
        </div>

        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: '#0d0d0d' }}>Import a list</div>
        {/* ⚠️ LEAD WITH THE COMPANY, LABEL THE ROUND. A bare round name as subtitle renders whatever
            the round was called — "Shaped fixture" on a test round — as though it were the page's
            identity. The company name is the thing that means something to a customer; the round
            name is useful but needs saying what it is. */}
        <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginTop: 4, marginBottom: 20 }}>
          {round?.company_name || 'This survey'}
          {round?.name ? <span style={{ color: 'var(--color-ink-muted)' }}> · round: {round.name}</span> : null}
        </div>

        {closed && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: '#0d0d0d', lineHeight: 1.75 }}>
            <strong>This round is closed.</strong> Respondents cannot be added: a closed round has
            produced results that an assessment may already be using, and adding people afterwards
            changes the basis of figures someone has read. Adding to an <em>open</em> round that
            already has responses is fine.
          </div>
        )}

        {created && (
          <div style={{ background: GREEN_BG, border: `0.5px solid ${GREEN}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: '#0d0d0d', lineHeight: 1.75 }}>
            <strong>{created.n} respondent{created.n === 1 ? '' : 's'} created.</strong>
            {created.skipped > 0 && ` ${created.skipped} skipped as already invited.`}
            {created.blocked > 0 && ` ${created.blocked} could not be created and were not.`}
            {' '}They have not been emailed yet — send invitations from the round overview.
          </div>
        )}

        {/* PATH 2 */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.35rem 1.6rem', marginBottom: 16, opacity: closed ? 0.5 : 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#0d0d0d', marginBottom: 6 }}>Download the template, or upload any list you already have</div>
          <div style={{ fontSize: 12.5, color: '#555553', lineHeight: 1.7, marginBottom: 10 }}>
            The template is a starting point, not a required format — if you already keep a list of
            people, upload it as it is. {CATEGORY_COLUMNS_LINE}
          </div>
          {/* ⚠️ The same string is written into the template's Categories sheet — a customer who
              fills the file in offline never sees this screen. One constant, two surfaces. */}
          <div style={{ fontSize: 12.5, color: '#555553', lineHeight: 1.7, marginBottom: 12 }}>
            {CATEGORY_MEANING}
          </div>
          {/* ⚠️ XLSX ONLY. The CSV template was removed: a CSV carries the three header words and none
              of the guidance or the category list, so it sent customers back to this screen on the
              path most likely to produce a bad category. Uploading a .csv is unaffected. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={downloadTemplate} disabled={closed || !!tplBusy} style={btn}>
              {tplBusy ? 'Building…' : 'Download the template (.xlsx)'}
            </button>
            {/* A disabled control with no reason beside it reads as a broken button. */}
            {closed && <span style={{ fontSize: 11.5, color: 'var(--color-ink-muted)' }}>Unavailable — this round is closed.</span>}
          </div>
          {/* ⚠️ THE TWO BOXES ARE A SEQUENCE FOR A TEMPLATE USER, NOT ALTERNATIVES. Without this the
              second box reads as a different route for a different kind of file, and someone who
              filled the template in has no signal that it comes back here. Scrolls and focuses
              rather than only telling them where to look. */}
          {!closed && (
            <button
              onClick={() => {
                uploadBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                setTimeout(() => chooseBtnRef.current?.focus(), 400)
              }}
              style={{ marginTop: 10, fontSize: 12, color: 'var(--color-brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              Filled it in? Upload it below ↓
            </button>
          )}
          {tplError && (
            <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10, padding: '10px 12px', marginTop: 10, fontSize: 12, color: '#555553', lineHeight: 1.7 }}>
              <strong style={{ color: FAIL, display: 'block', marginBottom: 2 }}>NOT DOWNLOADED</strong>{tplError}
            </div>
          )}

          <details style={{ marginTop: 14 }}>
            <summary style={{ fontSize: 12, color: 'var(--color-brand)', cursor: 'pointer' }}>The {reference.length} stakeholder categories, and what each is asked</summary>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {reference.map(r => (
                <div key={r.code} style={{ display: 'flex', gap: 10, fontSize: 12, color: '#555553', padding: '4px 0', borderBottom: '0.5px solid #f3f2f0' }}>
                  <code style={{ minWidth: 190, color: '#0d0d0d' }}>{r.code}</code>
                  <span style={{ minWidth: 200 }}>{r.label}</span>
                  <strong style={{ minWidth: 90, color: '#0d0d0d' }}>{r.asked} questions</strong>
                  <span style={{ color: 'var(--color-ink-muted)' }}>{r.note}</span>
                </div>
              ))}
            </div>
          </details>
        </div>

        {/* PATH 3 — upload */}
        <div ref={uploadBoxRef} style={{ background: '#fff', border: `0.5px solid ${downloaded && !rows ? GREEN : '#e8e7e4'}`, borderRadius: 16, padding: '1.35rem 1.6rem', marginBottom: 20, opacity: closed ? 0.5 : 1, scrollMarginTop: 20 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#0d0d0d', marginBottom: 6 }}>Upload your list</div>
          <div style={{ fontSize: 12.5, color: '#555553', lineHeight: 1.7, marginBottom: 12 }}>
            The template you just downloaded, or any .csv or .xlsx with a name and an email column.
            Nothing else is needed — you assign categories on the next step, from a list, so a typo
            cannot put someone in the wrong group.
          </div>
          {downloaded && (
            <div style={{ background: GREEN_BG, border: `0.5px solid ${GREEN}`, borderRadius: 8, padding: '8px 11px', marginBottom: 12, fontSize: 12, color: '#0d0d0d' }}>
              Upload the template here once it is filled in.
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button ref={chooseBtnRef} onClick={() => fileRef.current?.click()} disabled={closed}
            style={{ ...btn, fontWeight: 600, background: GRAD, color: 'var(--color-on-dark)', border: 'none' }}>
            Choose a file
          </button>
          {fileName && <span style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginLeft: 10 }}>{fileName}</span>}

          {parseError && (
            <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10, padding: '10px 12px', marginTop: 12, fontSize: 12, color: '#555553', lineHeight: 1.7 }}>
              <strong style={{ color: FAIL, display: 'block', marginBottom: 2 }}>NOT IMPORTED</strong>{parseError}
            </div>
          )}
        </div>

        {/* ── The assign step ──────────────────────────────────────────────── */}
        {rows && (
          <>
            {unassigned.length > 0 && (
              <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14, fontSize: 12.5, color: '#0d0d0d', lineHeight: 1.75 }}>
                {/* ⚠️ THE INVARIANT IS PER ROW, NOT PER IMPORT. This used to read "nothing is created
                    until every row has one", which the partial-import action directly contradicted —
                    one of them had to be wrong and it was the banner. No row is ever created without
                    a category; whether you create the rest now or later is a separate question. */}
                <strong>{unassigned.length} of {rows.length} rows still need a category.</strong> Nobody is
                created without one — the category decides which questions that person is asked, so it
                is never guessed or defaulted.
              </div>
            )}

            {/* Selection chips. These SELECT and never assign — see the module header. */}
            {domains.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Select:</span>
                {domains.slice(0, 6).map(d => (
                  <button key={d.domain} onClick={() => setSelected(new Set(d.keys))}
                    style={{ ...btn, padding: '4px 10px', fontSize: 11.5, borderRadius: 99 }}>
                    {d.keys.length} at {d.domain}
                  </button>
                ))}
                {unassigned.length > 0 && (
                  <button onClick={() => setSelected(new Set(unassigned.map(r => r.key)))}
                    style={{ ...btn, padding: '4px 10px', fontSize: 11.5, borderRadius: 99 }}>
                    all {unassigned.length} unassigned
                  </button>
                )}
              </div>
            )}

            {/* Sticky action bar: selection count, bulk assign, undo, and the jump-to-next that keeps
                unassigned rows reachable in a long list. */}
            <div style={{ position: 'sticky', top: 0, zIndex: 5, background: '#0d0d0d', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#fff' }}>{selected.size} selected</span>
              <select
                value=""
                disabled={selected.size === 0}
                onChange={e => {
                  const c = cats.find(x => x.code === e.target.value)
                  if (c) setCategory([...selected], c.code, `${selected.size} rows → ${c.label}`)
                  e.currentTarget.value = ''
                }}
                style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 7, border: 'none', background: selected.size ? '#fff' : 'rgba(255,255,255,0.25)', color: '#0d0d0d' }}>
                <option value="">Assign category to selected…</option>
                {cats.map(c => <option key={c.code} value={c.code}>{c.label} — {questionsFor(c.labour_routing, counts)} questions</option>)}
              </select>
              {selected.size > 0 && <button onClick={() => setSelected(new Set())} style={{ ...btn, padding: '4px 10px', fontSize: 11.5 }}>Clear</button>}
              <div style={{ flex: 1 }} />
              {unassigned.length > 0 && (
                <button onClick={jumpToNextUnassigned} style={{ ...btn, padding: '4px 10px', fontSize: 11.5, background: AMBER_BG, borderColor: AMBER }}>
                  {unassigned.length} unassigned · go to next
                </button>
              )}
            </div>

            {lastBulk && (
              <div style={{ background: GREEN_BG, border: `0.5px solid ${GREEN}`, borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#0d0d0d', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>Assigned {lastBulk.label}.</span>
                <button onClick={undoBulk} style={{ ...btn, padding: '3px 10px', fontSize: 11.5 }}>Undo</button>
              </div>
            )}

            {/* Groups, ordered by what needs a human. Every row renders — no pagination, no cap. */}
            {[
              { title: `Needs a category · ${unassigned.length}`, list: unassigned, open: true },
              { title: `Ready to create · ${ready.length}`, list: ready, open: unassigned.length === 0 },
              { title: `Won’t be created · ${excluded.length}`, list: excluded, open: false },
            ].filter(g => g.list.length > 0).map(g => (
              <details key={g.title} open={g.open} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '0.9rem 1.1rem', marginBottom: 10 }}>
                <summary style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', cursor: 'pointer' }}>{g.title}</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10 }}>
                  {g.list.map(r => {
                    const blocked = isBlocked(r), dup = isDuplicate(r)
                    const cat = r.category ? cats.find(c => c.code === r.category) : undefined
                    return (
                      <div key={r.key} id={`row-${r.key}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8,
                          borderLeft: `3px solid ${blocked || dup ? '#e8e7e4' : cat ? GREEN : AMBER}`,
                          background: selected.has(r.key) ? 'var(--color-brand-wash)' : 'transparent' }}>
                        {!blocked && !dup && (
                          <input type="checkbox" checked={selected.has(r.key)}
                            onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(r.key) : n.delete(r.key); return n })} />
                        )}
                        <span style={{ minWidth: 160, fontSize: 13, color: blocked || dup ? 'var(--color-ink-muted)' : '#0d0d0d' }}>{r.name || '—'}</span>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--color-ink-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email || '—'}</span>

                        {blocked || dup ? (
                          <span style={{ fontSize: 11.5, color: 'var(--color-ink-muted)' }}>{problemText(r.problems[0], r)}</span>
                        ) : openPicker === r.key ? (
                          // The select mounts only for the row being edited — 200 live selects is a
                          // heavy DOM for no benefit.
                          <select autoFocus value={r.category ?? ''} style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid #e8e7e4' }}
                            onBlur={() => setOpenPicker(null)}
                            onChange={e => { const c = cats.find(x => x.code === e.target.value); setCategory([r.key], c?.code ?? null, ''); setOpenPicker(null) }}>
                            <option value="">— not set —</option>
                            {cats.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                          </select>
                        ) : (
                          <button onClick={() => setOpenPicker(r.key)}
                            style={{ ...btn, padding: '3px 10px', fontSize: 11.5, minWidth: 190, textAlign: 'left',
                              color: cat ? '#0d0d0d' : AMBER, borderColor: cat ? '#e8e7e4' : AMBER }}>
                            {cat ? `${cat.label} · ${questionsFor(cat.labour_routing, counts)}q` : 'Category not set'}
                            {r.source === 'file' && cat ? ' (from file)' : ''}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </details>
            ))}

            {/* Confirm — the state is on the button, not in a tooltip. */}
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.1rem 1.35rem', marginTop: 14 }}>
              <div style={{ fontSize: 12.5, color: '#555553', lineHeight: 1.75, marginBottom: 12 }}>
                <strong style={{ color: '#0d0d0d' }}>{ready.length} to create</strong>
                {excluded.filter(isDuplicate).length > 0 && ` · ${excluded.filter(isDuplicate).length} already invited, skipped`}
                {excluded.filter(isBlocked).length > 0 && ` · ${excluded.filter(isBlocked).length} cannot be created`}
                {unassigned.length > 0 && ` · ${unassigned.length} still need a category`}
                . This list is not saved until you create it — leaving the page discards it.
              </div>
              {createError && (
                <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#555553', lineHeight: 1.7 }}>
                  <strong style={{ color: FAIL, display: 'block', marginBottom: 2 }}>NOTHING WAS CREATED</strong>{createError}
                </div>
              )}
              {/* ⚠️ PARTIAL IMPORT IS DEMOTED, NOT REMOVED. It is legitimate — 38 of 40 assigned, come
                  back for the rest — but it cannot be the most prominent action on a screen whose
                  banner is about not creating people without a category. So the primary button is
                  always the COMPLETE action and is disabled while anything is unassigned, saying what
                  is missing; the partial route is a secondary text action that names what it leaves
                  behind. */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                <button onClick={() => { setRows(null); setSelected(new Set()); setLastBulk(null); setFileName('') }} style={btn}>Start over</button>
                {unassigned.length > 0 && ready.length > 0 && !closed && (
                  <button onClick={confirm} disabled={creating}
                    style={{ fontSize: 12, color: 'var(--color-brand)', background: 'none', border: 'none', padding: '0 6px', cursor: creating ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}>
                    Create the {ready.length} that {ready.length === 1 ? 'is' : 'are'} ready and come back for the {unassigned.length}
                  </button>
                )}
                <button onClick={confirm} disabled={creating || ready.length === 0 || unassigned.length > 0 || closed}
                  title={unassigned.length > 0 ? `${unassigned.length} rows still need a category` : undefined}
                  style={{ fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8, border: 'none',
                    background: ready.length && !unassigned.length && !closed ? '#0d0d0d' : '#e8e7e4',
                    color: ready.length && !unassigned.length && !closed ? '#fff' : 'var(--color-ink-muted)',
                    cursor: ready.length && !unassigned.length && !closed && !creating ? 'pointer' : 'not-allowed' }}>
                  {creating ? 'Creating…'
                    : unassigned.length > 0 ? `${unassigned.length} ${unassigned.length === 1 ? 'row still needs' : 'rows still need'} a category`
                    : ready.length === 0 ? 'Nothing to create yet'
                    : `Create ${ready.length} respondent${ready.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
