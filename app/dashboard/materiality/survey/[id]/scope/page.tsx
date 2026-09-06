'use client'

/**
 * Survey scope — buyer screen 2 of 4.
 *
 * Chooses which of the 37 esrs_2026 sub-topics are in scope for one survey round. Every one is
 * INCLUDED from the moment the round is created — the generator trigger in 20260819 writes all 37 —
 * so this screen only ever removes, and removing is a recorded decision rather than a deletion.
 *
 * ⚠️ THE EXCLUSION REASON IS AN ESRS 2 IRO-1 DISCLOSURE, NOT A VALIDATION NAG. Spec v9 §3.2: a
 * deselected topic must appear in the report as "considered and excluded", with the reason, because
 * "a topic that silently vanishes is indistinguishable from one never considered". What the customer
 * types is printed. The copy beside the field says so, because a customer who thinks they are
 * satisfying a form field writes "n/a" and a customer who knows they are writing a disclosure does
 * not.
 *
 * ⚠️ WHICH IS WHY EXCLUSION IS NOT A TOGGLE. materiality_survey_questions carries
 *     check (status = 'included' or (exclusion_reason is not null and length(btrim(...)) > 0))
 * so an optimistic flip to 'excluded' followed by "now tell us why" FAILS AT THE DATABASE, after the
 * row has already gone grey on screen. The reason is collected first and the write is one statement
 * that either succeeds or leaves the row untouched. The reason field is the exclusion control.
 *
 * ⚠️ AND THE FREEZE IS ENFORCED HERE AND NOWHERE ELSE. materiality_survey_questions has NO TRIGGER
 * OF ANY KIND. §3.3 says the question set freezes on first response, but nothing at the database
 * refuses an edit after that — a customer could deselect a sub-topic forty people have already
 * answered, leaving those responses pointing at a question marked "considered and excluded" and the
 * aggregate returning it with overall: null while response rows exist. This screen's soft lock is
 * the only thing there is. If a BEFORE UPDATE guard is ever added to that table, this comment stops
 * being load-bearing; until then it is.
 *
 * NOT IN SCOPE: editing short_name, question_framing or context. Those live on the shared reference
 * table (mr_esrs_subtopic_display), so per-round overrides are a schema question and a later task.
 * This screen ships the default wording and shows it read-only so the customer can see what they are
 * excluding.
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../../components/Nav'
import PaywallCard from '../../../../../components/PaywallCard'
import { PAYWALL_HREF, PAYWALL_SURVEY, PAYWALL_TITLE } from '@/lib/paywallCopy'
import { supabase } from '../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../lib/useEntitlement'
// The SAME pure function /api/materiality and the climate-risk wizard use. Imported rather than
// reimplemented so a fourth surface cannot resolve topic names its own way.
import { resolveTopicLabels, isStandardVersion, type EsrsTopic } from '../../../../../../lib/materiality'

const GRAD = 'var(--color-brand)'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
const AMBER = 'var(--color-module-climate)'
const AMBER_BG = '#FEF3E2'
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'

type SaveState = 'saving' | 'saved' | 'error'

type Question = {
  id: string
  subtopic_code: string | null
  short_name: string
  question_framing: string | null
  status: 'included' | 'excluded'
  exclusion_reason: string | null
  sort_order: number
  shared_with_subtopic_code: string | null
}

type Round = {
  id: string
  name: string
  company_name: string | null
  questionnaire_version: number
  standard_version: string
  frozen_at: string | null
  status: string
}

type Group = { code: string; label: string; questions: Question[] }

export default function SurveyScope() {
  const isPaid = useEntitlement('double-materiality')
  const params = useParams()
  const roundId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])

  // Reference data, read straight from the browser: all four tables grant SELECT to authenticated
  // with a read policy, so no API route sits in front of them.
  const [topicOf, setTopicOf] = useState<Record<string, string>>({})       // subtopic_code -> topic_code
  const [dbTopics, setDbTopics] = useState<EsrsTopic[]>([])
  const [topicLabelRows, setTopicLabelRows] = useState<any[]>([])
  const [contextOf, setContextOf] = useState<Record<string, string>>({})

  const [saveState, setSaveState] = useState<Record<string, SaveState>>({})
  const [saveError, setSaveError] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [draftReason, setDraftReason] = useState('')

  useEffect(() => { load() }, [roundId])

  const load = async () => {
    setLoading(true)
    setLoadError(null)

    const { data: rd, error: rdErr } = await supabase
      .from('materiality_survey_rounds')
      .select('id, name, company_name, questionnaire_version, standard_version, frozen_at, status')
      .eq('id', roundId)
      .maybeSingle()

    if (rdErr) { setLoadError(rdErr.message); setLoading(false); return }
    if (!rd) {
      // RLS returns no rows rather than a permission error for someone else's round, so "not found"
      // and "not yours" are the same result here. Say what is true rather than guessing which.
      setLoadError('This survey round was not found, or it belongs to another account.')
      setLoading(false); return
    }
    setRound(rd as Round)

    const sv = (rd as Round).standard_version

    const [qs, subs, topics, labels, disp] = await Promise.all([
      supabase.from('materiality_survey_questions')
        .select('id, subtopic_code, short_name, question_framing, status, exclusion_reason, sort_order, shared_with_subtopic_code')
        .eq('round_id', roundId)
        .eq('questionnaire_version', (rd as Round).questionnaire_version)
        .order('sort_order'),
      supabase.from('mr_esrs_subtopics')
        .select('code, topic_code').eq('standard_version', sv),
      // ⚠️ mr_esrs_topics.label IS THE PRE-VERSIONING DEFAULT AND MUST NOT BE RENDERED DIRECTLY BY
      // ANY SURFACE THAT KNOWS ITS ROUND'S STANDARD VERSION. It still carries the 2023 names —
      // 'Water & marine resources', 'Biodiversity & ecosystems', 'Resource use & circular economy'
      // — so rendering it on an esrs_2026 round shows three wrong headings. THIS IS THE SECOND
      // SURFACE TO GET IT WRONG; the report was fixed the same way on 15 August
      // (20260815_mr_esrs_topic_labels + resolveTopicLabels). The rows are fetched only as the
      // INPUT to resolveTopicLabels, which overlays the versioned name from mr_esrs_topic_labels
      // and falls back to this one only when a version has no row.
      supabase.from('mr_esrs_topics').select('code, label, category, sort_order'),
      supabase.from('mr_esrs_topic_labels')
        .select('topic_code, standard_version, label').eq('standard_version', sv),
      supabase.from('mr_esrs_subtopic_display')
        .select('subtopic_code, context').eq('standard_version', sv),
    ])

    if (qs.error) { setLoadError(qs.error.message); setLoading(false); return }

    setQuestions((qs.data ?? []) as Question[])
    setTopicOf(Object.fromEntries((subs.data ?? []).map((s: any) => [s.code, s.topic_code])))
    setDbTopics((topics.data ?? []) as EsrsTopic[])
    setTopicLabelRows(labels.data ?? [])
    setContextOf(Object.fromEntries((disp.data ?? []).map((d: any) => [d.subtopic_code, d.context])))
    setLoading(false)
  }

  const frozen = !!round?.frozen_at

  /**
   * Topic headings, resolved to the ROUND'S standard version.
   *
   * ⚠️ Never mr_esrs_topics.label directly — see the fetch above. resolveTopicLabels is the same
   * pure function the report and the climate-risk wizard use; it overlays mr_esrs_topic_labels for
   * this version and falls back per topic only where a version has no row.
   *
   * ⚠️ AND THEN THE COLLISION, WHICH IS WHY THIS IS NOT JUST A SWAP. Under ESRS (2026) S1 and S2
   * take Appendix A's ONE JOINT TITLE — 'Own Workforce and Workers in the Value Chain', byte-
   * identical on both, deliberately (20260822 depends on that identity). Resolving correctly
   * therefore gives this screen two groups with the same heading, six rows each, whose short_names
   * are also identical in pairs. So where two topics resolve to the same label, the ESRS code is
   * appended to both. Detected generically rather than special-cased on S1/S2: if a future version
   * splits the title again the collision disappears and nothing is appended. The code is data, not
   * authored copy, and this is the preparer's screen — a sustainability lead reads S1 and S2 fluently.
   */
  const topicLabel = useMemo<Record<string, string>>(() => {
    const sv = round?.standard_version
    const resolved = resolveTopicLabels(
      dbTopics,
      topicLabelRows,
      sv && isStandardVersion(sv) ? sv : null,
    ).topics

    const seen: Record<string, number> = {}
    for (const t of resolved) seen[t.label] = (seen[t.label] ?? 0) + 1

    return Object.fromEntries(
      resolved.map(t => [t.code, seen[t.label] > 1 ? `${t.label} (${t.code})` : t.label]),
    )
  }, [dbTopics, topicLabelRows, round?.standard_version])

  const topicSort = useMemo<Record<string, number>>(
    () => Object.fromEntries(dbTopics.map(t => [t.code, t.sort_order ?? 0])),
    [dbTopics],
  )

  // ── Groups: by ESRS topic, ordered by the topic's own sort_order then the question's.
  const groups = useMemo<Group[]>(() => {
    const byTopic: Record<string, Question[]> = {}
    const orphans: Question[] = []
    for (const q of questions) {
      const t = q.subtopic_code ? topicOf[q.subtopic_code] : undefined
      if (!t) { orphans.push(q); continue }   // entity-specific matter: no sub-topic, no topic
      ;(byTopic[t] ||= []).push(q)
    }
    const out = Object.entries(byTopic)
      .map(([code, qq]) => ({
        code,
        label: topicLabel[code] ?? code,
        questions: qq.slice().sort((a, b) => a.sort_order - b.sort_order),
      }))
      .sort((a, b) => (topicSort[a.code] ?? 99) - (topicSort[b.code] ?? 99))
    if (orphans.length) {
      out.push({ code: '__entity', label: 'Additional topics', questions: orphans })
    }
    return out
  }, [questions, topicOf, topicLabel, topicSort])

  const included = questions.filter(q => q.status === 'included')

  // ⚠️ 37 IS NOT WHAT ANYONE SEES. A respondent is shown one side of each labour pair, or neither
  // (§3.0.1), so the honest number is per respondent type — and it moves with every exclusion here.
  // Screen 3 shows the same three figures; they are computed the same way so the two agree.
  const counts = useMemo(() => {
    let shared = 0, s1 = 0, s2 = 0
    for (const q of included) {
      const t = q.subtopic_code ? topicOf[q.subtopic_code] : undefined
      if (t === 'S1') s1++
      else if (t === 'S2') s2++
      else shared++
    }
    return { shared, s1, s2, internal: shared + s1, valueChain: shared + s2, other: shared }
  }, [included, topicOf])

  const includedInTopic = (topicCode: string) =>
    questions.filter(q => q.subtopic_code && topicOf[q.subtopic_code] === topicCode && q.status === 'included').length

  const partnerOf = (q: Question) =>
    q.shared_with_subtopic_code
      ? questions.find(x => x.subtopic_code === q.shared_with_subtopic_code)
      : undefined

  // ── Writes ──────────────────────────────────────────────────────────────────
  //
  // ⚠️ AN UPDATE THAT MATCHES NO ROW RETURNS NO ERROR. Under RLS, a row the caller cannot see is
  // simply not matched — PostgREST returns 200 with an empty array. So checking `error` alone would
  // show a tick for a write that changed nothing, which is the defect the respondent page was built
  // to avoid. Both are checked: the error, AND that a row actually came back.
  const write = async (qid: string, patch: Record<string, any>) => {
    setSaveState(prev => ({ ...prev, [qid]: 'saving' }))
    setSaveError(prev => { const n = { ...prev }; delete n[qid]; return n })

    const { data, error } = await supabase
      .from('materiality_survey_questions')
      .update(patch)
      .eq('id', qid)
      .select('id, status, exclusion_reason')

    if (error) {
      setSaveState(prev => ({ ...prev, [qid]: 'error' }))
      setSaveError(prev => ({ ...prev, [qid]: error.message }))
      return false
    }
    if (!data || data.length === 0) {
      setSaveState(prev => ({ ...prev, [qid]: 'error' }))
      setSaveError(prev => ({
        ...prev,
        [qid]: 'The change did not save. No row was updated — the round may belong to another account, or it may have been changed elsewhere. Reload before trying again.',
      }))
      return false
    }

    const row = data[0] as any
    setQuestions(prev => prev.map(q => q.id === qid
      ? { ...q, status: row.status, exclusion_reason: row.exclusion_reason }
      : q))
    setSaveState(prev => ({ ...prev, [qid]: 'saved' }))
    return true
  }

  const confirmExclude = async (q: Question) => {
    const reason = draftReason.trim()
    if (!reason) return
    const ok = await write(q.id, { status: 'excluded', exclusion_reason: reason })
    if (ok) { setEditing(null); setDraftReason('') }
  }

  // Re-including clears the reason: there is no longer a "considered and excluded" disclosure to
  // make, and a stale reason sitting on an included topic reads as a contradiction in the report.
  // Nothing records that the decision was reversed — no schema field carries it today.
  const reinclude = (q: Question) => write(q.id, { status: 'included', exclusion_reason: null })

  // ── Screens ─────────────────────────────────────────────────────────────────
  if (isPaid === false) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>
        <PaywallCard
          title={PAYWALL_TITLE}
          body={PAYWALL_SURVEY}
          href={PAYWALL_HREF}
        />
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: '4rem', color: '#888784' }}>Loading the question set…</div>
    </div>
  )

  if (loadError) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#0d0d0d', marginBottom: 10 }}>This scope screen could not be opened</div>
          <div style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.7 }}>{loadError}</div>
        </div>
      </div>
    </div>
  )

  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase' }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      {/* Sticky header: live counts and jump chips — the same device as the respondent page, so the
          buyer's screen and the respondent's read as one system. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0d0d0d' }}>
        <div style={{ padding: '1rem 2rem 0.75rem' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>Survey scope</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{round?.name}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#64fe3e' }}>{included.length} / {questions.length}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>sub-topics included</div>
            </div>
          </div>

          {/* What each respondent type will actually receive. Three numbers, because the routing
              gives three answers and none of them is the number above. */}
          <div style={{ maxWidth: 900, margin: '10px auto 0', fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
            Respondents will see{' '}
            <strong style={{ color: '#fff' }}>{counts.internal}</strong> questions (own workforce) ·{' '}
            <strong style={{ color: '#fff' }}>{counts.valueChain}</strong> (value chain) ·{' '}
            <strong style={{ color: '#fff' }}>{counts.other}</strong> (everyone else)
            {/* ⚠️ THE GAP NEEDS ATTRIBUTING OR IT READS AS AN ERROR. Three different totals on one
                screen look like a miscount unless the difference is named — and the difference is the
                whole point of the §3.0.1 routing, not a defect in it. Computed from the counts rather
                than written as "6", because excluding a labour sub-topic moves it, and the two sides
                can move independently. */}
            {(counts.s1 > 0 || counts.s2 > 0) && (
              <div style={{ marginTop: 4 }}>
                {counts.s1 === counts.s2
                  ? `The ${counts.s1}-question difference is the workforce topics — only people who can see a workforce are asked about one.`
                  : `The difference is the workforce topics: ${counts.s1} asked of your own workforce, ${counts.s2} of value-chain contacts, and neither asked of anyone else.`}
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', padding: '0.6rem 2rem', overflowX: 'auto' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 6 }}>
            {groups.map((g, i) => {
              const inc = g.questions.filter(q => q.status === 'included').length
              const all = inc === g.questions.length
              return (
                <button key={g.code}
                  onClick={() => document.getElementById(`scope-group-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.15)', background: all ? 'transparent' : 'color-mix(in srgb, var(--color-module-climate) 18%, transparent)', color: all ? 'rgba(255,255,255,0.65)' : '#f0b357', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {g.label} <span style={{ opacity: 0.65 }}>{inc}/{g.questions.length}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 18 }}>
          <Link href="/dashboard/materiality/survey" style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none' }}>← All survey rounds</Link>
        </div>

        {/* ⚠️ THE FREEZE, SOFT-LOCKED AND EXPLAINED. Silent absence of a control is the failure mode
            this codebase keeps finding — a disabled button with no sentence reads as a bug. */}
        {frozen && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, color: '#0d0d0d', lineHeight: 1.7 }}>
              <strong>Scope is locked.</strong> Questions were frozen when the first response arrived.
              Scope can no longer change for this round.
            </div>
          </div>
        )}

        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem 1.75rem', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#0d0d0d', marginBottom: 8 }}>
            Which topics should this survey cover?
          </div>
          <div style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.75 }}>
            All {questions.length} ESRS sub-topics are included by default. Exclude any that do not
            apply to {round?.company_name || 'your company'} — each exclusion is recorded in your
            report as a topic considered and excluded, with the reason you give.
          </div>
        </div>

        {groups.map((group, gi) => {
          const inc = group.questions.filter(q => q.status === 'included').length
          return (
            <div key={group.code} id={`scope-group-${gi}`} style={{ marginBottom: 26, scrollMarginTop: 150 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: '0.5px solid #e8e7e4' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', color: '#0d0d0d' }}>{group.label}</div>
                <div style={{ fontSize: 11.5, color: inc === group.questions.length ? '#888784' : AMBER }}>
                  {inc} of {group.questions.length} included
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.questions.map(q => {
                  const excluded = q.status === 'excluded'
                  const state = saveState[q.id]
                  const isEditing = editing === q.id
                  const partner = partnerOf(q)
                  const lastIncluded = included.length === 1 && !excluded
                  const lastInTopic = group.code !== '__entity' && includedInTopic(group.code) === 1 && !excluded

                  return (
                    <div key={q.id} style={{ background: excluded ? '#f8f7f5' : '#fff', border: `0.5px solid ${state === 'error' ? FAIL : '#e8e7e4'}`, borderRadius: 12, padding: '0.9rem 1.1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: excluded ? '#888784' : '#0d0d0d' }}>{q.short_name}</span>
                            {/* The only thing distinguishing the twelve labour rows: short_name is
                                identical across each pair by design (20260818). */}
                            {q.question_framing && (
                              <span style={{ fontSize: 10.5, fontWeight: 600, color: GREEN, background: GREEN_BG, borderRadius: 99, padding: '2px 8px' }}>{q.question_framing}</span>
                            )}
                            {excluded && (
                              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#888784', background: '#e8e7e4', borderRadius: 99, padding: '2px 8px' }}>EXCLUDED</span>
                            )}
                          </div>
                          {q.subtopic_code && contextOf[q.subtopic_code] && (
                            <div style={{ fontSize: 12.5, color: '#888784', lineHeight: 1.6, marginTop: 4 }}>{contextOf[q.subtopic_code]}</div>
                          )}
                          {excluded && q.exclusion_reason && (
                            <div style={{ fontSize: 12.5, color: '#555553', lineHeight: 1.6, marginTop: 8, paddingLeft: 10, borderLeft: `2px solid #e8e7e4` }}>
                              <span style={{ ...labelStyle, display: 'block', marginBottom: 2 }}>Reason recorded</span>
                              {q.exclusion_reason}
                            </div>
                          )}
                        </div>

                        <div style={{ flexShrink: 0 }}>
                          {!frozen && !isEditing && (
                            excluded ? (
                              <button onClick={() => reinclude(q)} disabled={state === 'saving'}
                                style={{ fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 8, border: '1px solid #e8e7e4', background: '#fff', color: '#0d0d0d', cursor: 'pointer' }}>
                                Include
                              </button>
                            ) : (
                              <button
                                onClick={() => { setEditing(q.id); setDraftReason('') }}
                                disabled={state === 'saving' || lastIncluded}
                                title={lastIncluded ? 'At least one sub-topic must stay in scope' : undefined}
                                style={{ fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 8, border: '1px solid #e8e7e4', background: '#fff', color: lastIncluded ? '#b8b7b4' : '#555553', cursor: lastIncluded ? 'not-allowed' : 'pointer' }}>
                                Exclude
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {lastIncluded && !isEditing && (
                        <div style={{ fontSize: 11.5, color: '#888784', marginTop: 8, lineHeight: 1.6 }}>
                          This is the last sub-topic in scope. A survey with none would show a
                          respondent an empty form, so it cannot be excluded.
                        </div>
                      )}

                      {/* ⚠️ THE REASON PANEL. It is the exclusion control, not a follow-up — the CHECK
                          constraint refuses an excluded row with an empty reason, so the write only
                          happens once there is something to write. */}
                      {isEditing && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #e8e7e4' }}>
                          {lastInTopic && (
                            <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 11.5, color: '#0d0d0d', lineHeight: 1.6 }}>
                              This is the only sub-topic under <strong>{group.label}</strong>.
                              Excluding it removes {group.label.toLowerCase()} from this survey entirely.
                            </div>
                          )}
                          {partner && partner.status === 'included' && (
                            <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 11.5, color: '#0d0d0d', lineHeight: 1.6 }}>
                              The matching sub-topic for the other workforce is still included.
                              Excluding only one side means the own-workforce and value-chain answers
                              cannot be compared for this topic.
                            </div>
                          )}

                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>
                            Why is {q.short_name.toLowerCase()} out of scope?
                          </div>
                          {/* Examples live HERE, above the field, so they read as illustrations. Ghost
                              text inside the box would be a specific factual claim the customer is
                              invited to accept whether or not it is true of them. */}
                          <div style={{ fontSize: 11.5, color: '#888784', lineHeight: 1.6, marginBottom: 8 }}>
                            For example: no manufacturing operations · no sites near protected habitats ·
                            nothing sold directly to consumers.
                          </div>

                          <textarea
                            value={draftReason}
                            onChange={e => setDraftReason(e.target.value)}
                            rows={3}
                            autoFocus
                            placeholder="Why is this out of scope?"
                            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: '1px solid #e8e7e4', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6, color: '#0d0d0d', background: '#fff', resize: 'vertical', outline: 'none' }}
                          />

                          {/* Spec v9 §3.2. The customer is writing a disclosure, and saying so is what
                              stops "n/a" reaching a verifier. */}
                          <div style={{ fontSize: 11.5, color: '#888784', lineHeight: 1.6, marginTop: 6 }}>
                            This is printed in your report as the reason this topic was considered and
                            excluded. It is your disclosure, in your own words, and appears exactly as
                            written — including “n/a”.
                          </div>

                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                            <button onClick={() => { setEditing(null); setDraftReason('') }}
                              style={{ fontSize: 12.5, padding: '7px 16px', borderRadius: 8, border: '1px solid #e8e7e4', background: '#fff', color: '#555553', cursor: 'pointer' }}>
                              Cancel
                            </button>
                            <button
                              onClick={() => confirmExclude(q)}
                              disabled={!draftReason.trim() || state === 'saving'}
                              style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 16px', borderRadius: 8, border: 'none', background: draftReason.trim() ? '#0d0d0d' : '#e8e7e4', color: draftReason.trim() ? '#fff' : '#b8b7b4', cursor: draftReason.trim() ? 'pointer' : 'not-allowed' }}>
                              {state === 'saving' ? 'Saving…' : 'Exclude topic'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* A save that did not save is never shown as saved. */}
                      {state === 'error' && (
                        <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 8, padding: '8px 10px', marginTop: 10 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: FAIL, marginBottom: 3 }}>NOT SAVED</div>
                          <div style={{ fontSize: 11.5, color: '#555553', lineHeight: 1.6 }}>{saveError[q.id]}</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#888784', lineHeight: 1.7 }}>
          Changes save as you make them. Excluded topics and their reasons appear in the report as
          considered and excluded.
        </div>
      </div>
    </div>
  )
}
