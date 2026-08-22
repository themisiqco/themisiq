'use client'

/**
 * The lead's own determinations — the sub-topics nobody else was assigned, with the stakeholder
 * survey evidence beside each one.
 *
 * ⚠️ ITS OWN ROUTE, NOT PART OF /determinations. That screen reads everything back and holds the
 * override; this one is a working surface with per-sub-topic save state, and the two are different
 * sittings — "review what came back" and "do my own share". The same argument that split assign
 * from determinations, and progress from results.
 *
 * ⚠️ THE EVIDENCE IS PER SUB-TOPIC, BESIDE THE JUDGEMENT — NEVER AS A PREAMBLE (spec §1.0).
 * Showing the whole results page first anchors the preparer before they have started: they read
 * "9 of 12 said significant focus" across ten topics, and then score every one of them in that
 * light. Beside the question, the signal informs one judgement at the moment it is made.
 *
 * ⚠️ THE EVIDENCE RENDERERS ARE SHARED, NOT REIMPLEMENTED. DistBar and Counters come from
 * app/components/surveyEvidence.tsx, the same code the results screen draws. Two renderers of the
 * same evidence is the defect the GHG module already paid for and CLAUDE.md carries as an invariant.
 *
 * ⚠️ AND NO MEAN, HERE EITHER. The distribution is three bands with printed counts. Never a marker
 * on a line — that is how a mean gets back in through the picture.
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../../components/Nav'
import PaywallCard from '../../../../../components/PaywallCard'
import { supabase } from '../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../lib/useEntitlement'
import { resolveTopicLabels, isStandardVersion, type EsrsTopic } from '../../../../../../lib/materiality'
// ⚠️ scaleFor(direction), never a direction-free SCALE — there is no longer such an export. The
// scale's heading AND its point-4 label both differ between harm and benefit, so a form that
// resolved the scale without saying which direction it was asking about used to render "Severe —
// grave harm" under "As a benefit". See the module header.
import { scaleFor, SCOPE, IRREMEDIABILITY, LIKELIHOOD }
  from '../../../../../../lib/materiality/severityScale'
// ⚠️ EVERY sub-topic on THIS screen is one the lead kept, so none of them has an assignment
// snapshot — this screen would hit the missing-name case on every row, not occasionally.
import { subtopicHeading } from '../../../../../../lib/materiality/subtopicName'
import { VALUE_CHAIN_POSITIONS as VCP, TIME_HORIZONS as HORIZONS }
  from '../../../../../../lib/materiality/impactContext'
import { ScaleField, Question, Options, Option } from '../../../../../components/severityFields'
import { DistBar, Counters, pct, medianText, type Overall }
  from '../../../../../components/surveyEvidence'

const PURPLE = '#7425e3'
const GREEN = '#0F6E56'
const AMBER = '#ba7517'
const AMBER_BG = '#FEF3E2'
const BLUE = '#0C447C'
const BLUE_BG = '#E6F1FB'
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'
const INK = '#0d0d0d'
const MID = '#555553'
const MUTE = '#888784'
const LINE = '#e8e7e4'
const PAPER = '#f8f7f5'

type Direction = 'negative' | 'positive'
type Dim = 'scale' | 'scope' | 'irremediability' | 'likelihood'

type Draft = {
  nature: 'actual' | 'potential' | null
  scale: number | null; scope: number | null
  irremediability: number | null; likelihood: number | null
  abstained: string[]; vcp: string[]; horizon: string | null; rationale: string
  status: string
}
type AggSub = {
  subtopic_code: string; short_name: string; status: string
  overall: Overall | null
  breakdowns: Record<string, { omitted: boolean; reason?: string;
                               cells?: { suppressed: boolean }[] }> | null
}
type ContrastEntry = {
  s1_subtopic_code: string; s2_subtopic_code: string; short_name: string
  s1: { n_answered: number; top_box: number | null; distribution: { '1': number; '2': number; '3': number } }
  s2: { n_answered: number; top_box: number | null; distribution: { '1': number; '2': number; '3': number } }
  comparable: boolean; not_comparable_reason: string | null; gap: number | null; flagged: boolean
}
type Agg = {
  method: { thresholds: { anonymity_floor: number } }
  subtopics: AggSub[]
  s1_s2_contrast: { what_this_is_not: string; entries: ContrastEntry[] }
}


const key = (c: string, d: Direction) => `${c}::${d}`
const empty = (): Draft => ({
  nature: null, scale: null, scope: null, irremediability: null, likelihood: null,
  abstained: [], vcp: [], horizon: null, rationale: '', status: 'draft',
})
const setDim = (d: Draft, dim: Dim, v: number | null): Partial<Draft> => ({
  [dim]: v,
  abstained: v === null
    ? (d.abstained.includes(dim) ? d.abstained : [...d.abstained, dim])
    : d.abstained.filter(x => x !== dim),
})

export default function LeadDetermine() {
  const isPaid = useEntitlement('impact-materiality')
  const params = useParams()
  const assessmentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [company, setCompany] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [mine, setMine] = useState<{ subtopic_code: string }[]>([])
  const [roundName_, setRoundName_] = useState<Record<string, string>>({})
  const [displayName, setDisplayName] = useState<Record<string, string>>({})
  const [refName, setRefName] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [topics, setTopics] = useState<EsrsTopic[]>([])
  const [labelRows, setLabelRows] = useState<{ topic_code: string; standard_version: string; label: string }[]>([])
  const [topicOf, setTopicOf] = useState<Record<string, string>>({})

  const [agg, setAgg] = useState<Agg | null>(null)
  const [roundName, setRoundName] = useState<string | null>(null)
  const [aggError, setAggError] = useState<string | null>(null)

  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)

  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [blockError, setBlockError] = useState<Record<string, string>>({})
  const [blockNote, setBlockNote] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [assessmentId])

  const load = async () => {
    setLoading(true); setLoadError(null); setAggError(null)

    const { data: a, error: aErr } = await supabase.from('materiality_assessments')
      .select('id, company_name, standard_version').eq('id', assessmentId).maybeSingle()
    if (aErr) { setLoadError(aErr.message); setLoading(false); return }
    if (!a) {
      setLoadError('This assessment was not found, or it belongs to another account. Those two '
                 + 'cannot be told apart from here.')
      setLoading(false); return
    }
    const asmt = a as { company_name: string | null; standard_version: string | null }
    setCompany(asmt.company_name); setVersion(asmt.standard_version)
    const sv = asmt.standard_version || ''

    const { data: links } = await supabase.from('materiality_assessment_survey_rounds')
      .select('round_id').eq('assessment_id', assessmentId).order('linked_at')
    const roundId = links && links.length ? (links[0] as { round_id: string }).round_id : null

    if (roundId) {
      const [{ data: rd }, { data: ag, error: agErr }] = await Promise.all([
        supabase.from('materiality_survey_rounds').select('name').eq('id', roundId).maybeSingle(),
        supabase.rpc('survey_aggregate', { p_round_id: roundId }),
      ])
      setRoundName((rd as { name: string } | null)?.name ?? null)
      // ⚠️ AN AGGREGATE THAT FAILED IS NOT AN ABSENT SURVEY. Said as what it is, because the two
      // lead to different evidence_in_view outcomes and the preparer must know which they are in.
      if (agErr) setAggError(agErr.message)
      else if (ag) setAgg(ag as Agg)
      else setAggError('The survey aggregation returned nothing, and no reason.')
    }

    const [qRes, sRes, dRes, tRes, tlRes, stRes, dispRes] = await Promise.all([
      roundId
        ? supabase.from('materiality_survey_questions')
            .select('subtopic_code, short_name, sort_order')
            .eq('round_id', roundId).eq('status', 'included')
            .not('subtopic_code', 'is', null).order('sort_order')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('materiality_impact_assignment_subtopics')
        .select('subtopic_code').eq('assessment_id', assessmentId),
      supabase.from('materiality_impact_determinations')
        .select('subtopic_code, direction, nature, scale, scope, irremediability, likelihood, abstained_dimensions, value_chain_position, time_horizon, rationale, status, assignment_id')
        .eq('assessment_id', assessmentId).is('assignment_id', null),
      supabase.from('mr_esrs_topics').select('code, label, category, sort_order').order('sort_order'),
      supabase.from('mr_esrs_topic_labels').select('topic_code, standard_version, label').eq('standard_version', sv),
      supabase.from('mr_esrs_subtopics').select('code, topic_code, label').eq('standard_version', sv),
      supabase.from('mr_esrs_subtopic_display').select('subtopic_code, short_name')
        .eq('standard_version', sv),
    ])

    const err = [sRes, dRes, tRes, tlRes, stRes, dispRes].find(r => r.error)?.error
    if (err) { setLoadError(err.message); setLoading(false); return }

    const st = (stRes.data || []) as { code: string; topic_code: string; label: string }[]
    setTopicOf(Object.fromEntries(st.map(r => [r.code, r.topic_code])))
    setRefName(Object.fromEntries(st.map(r => [r.code, r.label])))
    setDisplayName(Object.fromEntries(
      ((dispRes.data || []) as { subtopic_code: string; short_name: string }[])
        .map(r => [r.subtopic_code, r.short_name])))
    setRoundName_(Object.fromEntries(
      ((qRes.data || []) as { subtopic_code: string; short_name: string }[])
        .map(r => [r.subtopic_code, r.short_name])))
    setTopics((tRes.data || []) as EsrsTopic[])
    setLabelRows((tlRes.data || []) as { topic_code: string; standard_version: string; label: string }[])

    // Scope, minus whatever is somebody else's. Falls back to the reference set with no round —
    // 20260838 supports an assessment with no survey, and this is that case.
    // ⚠️ CODES ONLY. The name is resolved at render through the shared chain, so this screen and
    // the determinations screen cannot disagree about what a sub-topic is called.
    const taken = new Set(((sRes.data || []) as { subtopic_code: string }[]).map(r => r.subtopic_code))
    const codes = roundId
      ? ((qRes.data || []) as { subtopic_code: string }[]).map(q => ({ subtopic_code: q.subtopic_code }))
      : st.map(r => ({ subtopic_code: r.code }))
    setMine(codes.filter(s => !taken.has(s.subtopic_code)))

    const next: Record<string, Draft> = {}
    for (const d of (dRes.data || []) as Record<string, unknown>[]) {
      next[key(d.subtopic_code as string, d.direction as Direction)] = {
        nature: (d.nature as Draft['nature']) ?? null,
        scale: (d.scale as number | null) ?? null,
        scope: (d.scope as number | null) ?? null,
        irremediability: (d.irremediability as number | null) ?? null,
        likelihood: (d.likelihood as number | null) ?? null,
        abstained: (d.abstained_dimensions as string[] | null) || [],
        vcp: (d.value_chain_position as string[] | null) || [],
        horizon: (d.time_horizon as string | null) ?? null,
        rationale: (d.rationale as string | null) || '',
        status: (d.status as string) || 'draft',
      }
    }
    setDrafts(next)
    setLoading(false)
  }

  const topicLabel = useMemo<Record<string, string>>(() => {
    const resolved = resolveTopicLabels(
      topics, labelRows, version && isStandardVersion(version) ? version : null).topics
    const seen: Record<string, number> = {}
    for (const t of resolved) seen[t.label] = (seen[t.label] ?? 0) + 1
    return Object.fromEntries(
      resolved.map(t => [t.code, seen[t.label] > 1 ? `${t.label} (${t.code})` : t.label]))
  }, [topics, labelRows, version])

  /**
   * ⚠️ THE EVIDENCE PREDICATE — AND THE WHOLE MEANING OF evidence_in_view.
   *
   * The honest answer to "was the panel actually open?" is that a collapsed panel and an absent one
   * cannot be told apart in any way worth recording, and neither proves the preparer READ anything.
   * So there is no collapse on this screen: the evidence renders inline, always, beside the
   * judgement. The ambiguity is designed out instead of tracked.
   *
   * What the flag therefore claims, exactly, and it is deliberately narrow:
   *     EVIDENCE EXISTED FOR THIS SUB-TOPIC AND WAS ON SCREEN BESIDE THE FORM WHEN THIS WAS SAVED.
   * Not that it was read. Nothing a browser can observe would support the stronger claim, and a
   * flag that quietly meant "read" would be the divergence register asserting something no one
   * checked.
   *
   * n_asked > 0 rather than n_answered > 0, deliberately: a sub-topic every respondent abstained on
   * IS evidence — §6.1's finding that the company cannot see its own impact — and the panel shows
   * it as one. Requiring an answer would discard the most interesting case.
   */
  const evidenceFor = (code: string): AggSub | null => {
    const s = agg?.subtopics.find(x => x.subtopic_code === code) || null
    return s && s.status === 'included' ? s : null
  }
  const hasEvidence = (code: string) => {
    const e = evidenceFor(code)
    return !!e && !!e.overall && e.overall.n_asked > 0
  }

  const contrastFor = (code: string) =>
    agg?.s1_s2_contrast?.entries.find(
      e => e.s1_subtopic_code === code || e.s2_subtopic_code === code) || null

  const save = async (code: string, dir: Direction, d: Draft) => {
    const k = key(code, dir)
    setSaving(s => ({ ...s, [k]: true }))
    setBlockError(e => { const n = { ...e }; delete n[k]; return n })

    const row = {
      assessment_id: assessmentId,
      subtopic_code: code,
      standard_version: version,
      direction: dir,
      nature: d.nature,
      scale: d.scale,
      scope: d.scope,
      irremediability: dir === 'negative' ? d.irremediability : null,
      likelihood: d.nature === 'potential' ? d.likelihood : null,
      abstained_dimensions: d.abstained.filter(x =>
        (x !== 'irremediability' || dir === 'negative') &&
        (x !== 'likelihood' || d.nature === 'potential')),
      value_chain_position: d.vcp,
      time_horizon: d.horizon,
      rationale: d.rationale.trim() || null,
      // ⚠️ EARNED, NOT DEFAULTED. Computed from the same predicate that decides whether the panel
      // above renders evidence — one condition, one source. There is no checkbox and no default.
      evidence_in_view: hasEvidence(code),
      assignment_id: null,
      status: 'draft',
    }

    const { data, error } = await supabase.from('materiality_impact_determinations')
      .upsert(row, { onConflict: 'assessment_id,subtopic_code,direction' })
      .select('subtopic_code')

    setSaving(s => ({ ...s, [k]: false }))
    // The database's own sentence. A ¶41 refusal already explains that nothing was saved rather
    // than quietly dropped, and no wrapper here could put it better.
    if (error) { setBlockError(e => ({ ...e, [k]: error.message })); return }
    if (!data || data.length === 0) {
      setBlockError(e => ({ ...e, [k]:
        'Nothing was saved, and the server gave no reason. Your answer is not recorded.' }))
      return
    }
    setDrafts(cur => ({ ...cur, [k]: d }))
  }

  /**
   * ⚠️ ALL OF IT, AT ONCE. materiality_lead_submit takes the assessment, not a sub-topic: a
   * submission is one considered act covering everything the person is responsible for, which is
   * exactly how a contributor submits through impact_submit. There is deliberately no per-row
   * submit, because a worksheet half-submitted row by row is a state nothing downstream can read.
   *
   * ⚠️ THE REFUSAL IS THE PAYLOAD. When a held sub-topic has no stated nature the function names
   * every one of them, with directions, in one sentence written for the reader. It is rendered
   * whole — never truncated, never summarised to "some are incomplete" — because the list IS the
   * instruction telling them where to go. A lead with 37 sub-topics part-done needs all of it.
   */
  const submitAll = async () => {
    setSubmitting(true); setSubmitError(null)
    const { data, error } = await supabase.rpc('materiality_lead_submit', {
      p_assessment_id: assessmentId,
    })
    setSubmitting(false)
    if (error) { setSubmitError(error.message); return }
    // ⚠️ THREE STATES, AND THIS IS THE THIRD. A call that returns neither an error nor a count is
    // not a success with nothing in it — it is a call whose outcome is unknown, and saying so is
    // the only honest thing available.
    const count = (data as { submitted?: number } | null)?.submitted
    if (typeof count !== 'number') {
      setSubmitError('The submission returned neither a result nor a reason, so it is not known '
                   + 'whether anything was recorded. Reload this page and check before trying again.')
      return
    }
    setSubmittedCount(count)
    setConfirmSubmit(false)
    await load()
  }

  const update = (code: string, dir: Direction, patch: Partial<Draft>) => {
    const k = key(code, dir)
    const next = { ...(drafts[k] || empty()), ...patch }
    setDrafts(cur => ({ ...cur, [k]: next }))
    void save(code, dir, next)
  }
  const edit = (code: string, dir: Direction, patch: Partial<Draft>) => {
    const k = key(code, dir)
    setDrafts(cur => ({ ...cur, [k]: { ...(cur[k] || empty()), ...patch } }))
  }

  /** Switching to "already happening" removes a likelihood answer — and says so. ESRS 1 ¶41. */
  const setNature = (code: string, dir: Direction, nature: 'actual' | 'potential') => {
    const k = key(code, dir)
    const cur = drafts[k] || empty()
    const loses = nature === 'actual' && (cur.likelihood !== null || cur.abstained.includes('likelihood'))
    setBlockNote(n => {
      const c = { ...n }
      if (loses) c[k] = 'Your likelihood answer has been removed. An impact that is already '
                      + 'happening carries no likelihood — applying one would understate it.'
      else delete c[k]
      return c
    })
    update(code, dir, nature === 'actual'
      ? { nature, likelihood: null, abstained: cur.abstained.filter(x => x !== 'likelihood') }
      : { nature })
  }

  const headingFor = (code: string) => subtopicHeading(code, topicOf[code] || '', {
    roundSnapshot: roundName_, display: displayName, reference: refName,
  })

  const groups = useMemo(() => {
    const byTopic: Record<string, typeof mine> = {}
    const order: string[] = []
    for (const s of mine) {
      const t = topicOf[s.subtopic_code] || '__other'
      if (!byTopic[t]) { byTopic[t] = []; order.push(t) }
      byTopic[t].push(s)
    }
    const sort = Object.fromEntries(topics.map(t => [t.code, t.sort_order ?? 99]))
    return order.map(c => ({ code: c, label: topicLabel[c] ?? c, rows: byTopic[c] }))
                .sort((a, b) => (sort[a.code] ?? 99) - (sort[b.code] ?? 99))
  }, [mine, topicOf, topics, topicLabel])

  if (isPaid === false) return (
    <Shell><PaywallCard title="Unlock Impact Materiality"
      body="The impact worksheet is part of the Impact Materiality Assessment."
      href="/pricing?modules=impact" /></Shell>
  )
  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav /><div style={{ textAlign: 'center', padding: '4rem', color: MUTE }}>Loading…</div>
    </div>
  )
  if (loadError) return (
    <Shell><div style={{ background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 16, padding: '2rem' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 10 }}>
        This could not be opened</div>
      <div style={{ fontSize: 13.5, color: MID, lineHeight: 1.75 }}>{loadError}</div>
    </div></Shell>
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← Assign and chase</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}/determinations`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>All determinations</Link>
        </div>

        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>
          Your own determinations
        </div>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 4, marginBottom: 18 }}>
          {company} · {mine.length} {mine.length === 1 ? 'sub-topic' : 'sub-topics'} not assigned to anyone else
        </div>

        {/* Evidence provenance, once, at the top — and it is the ONLY thing said at the top about
            the survey. The findings themselves are beside each question, never here. */}
        {agg ? (
          <div style={{ background: BLUE_BG, border: `0.5px solid ${BLUE}`, borderRadius: 12,
                        padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            <strong>What your stakeholders said is shown beside each question</strong>, not
            summarised here — reading it all first would colour every judgement that followed. From
            “{roundName}”. It informs your determination; it does not make it.
          </div>
        ) : (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 12,
                        padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            {aggError
              ? <><strong>The survey evidence could not be loaded.</strong> Your determinations will
                  be recorded as made without it, which is what will have happened. The server said:
                  {' '}{aggError}</>
              : <><strong>No stakeholder survey is linked to this assessment.</strong> Every
                  determination below will be recorded as made without survey evidence — which is
                  accurate, and is what the report will say.</>}
          </div>
        )}

        {groups.map(g => (
          <div key={g.code} style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: INK,
                          paddingBottom: 6, borderBottom: `1px solid ${LINE}`, marginBottom: 14 }}>
              {g.label} <span style={{ fontSize: 11, color: MUTE }}>{g.code}</span>
            </div>

            {g.rows.map(s => (
              <div key={s.subtopic_code} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 10 }}>
                  {headingFor(s.subtopic_code).title}
                  {headingFor(s.subtopic_code).code && (
                    <span style={{ fontSize: 11, color: MUTE, fontWeight: 400 }}> {headingFor(s.subtopic_code).code}</span>
                  )}
                </div>

                {/* ⚠️ ALWAYS RENDERED, NEVER COLLAPSED. An absent panel and an empty one are
                    different facts and both are stated. The absence of a collapse is what makes
                    evidence_in_view mean something checkable. */}
                <EvidencePanel
                  ev={evidenceFor(s.subtopic_code)}
                  contrast={contrastFor(s.subtopic_code)}
                  hasRound={!!agg}
                  aggFailed={!!aggError}
                  floor={agg?.method?.thresholds?.anonymity_floor ?? 3}
                  contrastCaveat={agg?.s1_s2_contrast?.what_this_is_not ?? ''}
                  code={s.subtopic_code}
                />

                {(['negative', 'positive'] as Direction[]).map(dir => (
                  <Block key={dir} code={s.subtopic_code} dir={dir}
                         d={drafts[key(s.subtopic_code, dir)] || empty()}
                         saving={!!saving[key(s.subtopic_code, dir)]}
                         error={blockError[key(s.subtopic_code, dir)]}
                         note={blockNote[key(s.subtopic_code, dir)]}
                         evidenced={hasEvidence(s.subtopic_code)}
                         onNature={setNature} onChange={update} onEdit={edit} />
                ))}
              </div>
            ))}
          </div>
        ))}

        {mine.length === 0 && (
          <div style={{ background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 16,
                        padding: '2.5rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 10 }}>
              Nothing left for you
            </div>
            <div style={{ fontSize: 13, color: MID, lineHeight: 1.8 }}>
              Every sub-topic in scope is assigned to a colleague. What they conclude appears on{' '}
              <Link href={`/dashboard/materiality/worksheet/${assessmentId}/determinations`}
                    style={{ color: PURPLE }}>the determinations screen</Link>.
            </div>
          </div>
        )}

        {/* ── submit ────────────────────────────────────────────────────────────────────────
            ⚠️ AT THE FOOT, AFTER THE LAST SUB-TOPIC. Not a sticky bar and not at the top: a
            person reaches this having worked down the form, and a submit button in view from the
            first question invites submitting before the work is done. */}
        {mine.length > 0 && (
          <div style={{ marginTop: 26, background: '#fff',
                        border: `0.5px solid ${confirmSubmit ? AMBER : LINE}`,
                        borderRadius: 14, padding: '1.2rem 1.4rem' }}>

            {submittedCount !== null ? (
              <div style={{ background: PAPER, border: `0.5px solid ${GREEN}`, borderRadius: 10,
                            padding: '12px 14px', fontSize: 12.5, color: INK, lineHeight: 1.8 }}>
                <strong>
                  {submittedCount} {submittedCount === 1 ? 'determination' : 'determinations'} submitted.
                </strong>{' '}
                {submittedCount === 0
                  ? 'Everything you hold had already been submitted, so nothing changed.'
                  : 'They are now this assessment’s recorded judgements rather than drafts, and '
                    + 'they appear in the comparison against what your respondents said.'}
              </div>
            ) : !confirmSubmit ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.75, flex: 1, minWidth: 260 }}>
                  <strong style={{ color: INK }}>Finished?</strong> Submitting records all{' '}
                  {mine.length} {mine.length === 1 ? 'sub-topic' : 'sub-topics'} you hold together,
                  in one go. Anything still missing an answer will be named rather than skipped.
                </div>
                <button onClick={() => { setConfirmSubmit(true); setSubmitError(null) }}
                        style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, padding: '9px 18px',
                                 borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff',
                                 color: INK, cursor: 'pointer' }}>
                  Submit your determinations
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', color: INK,
                              marginBottom: 10 }}>
                  Submit your determinations?
                </div>
                <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, display: 'flex',
                              flexDirection: 'column', gap: 8 }}>
                  <div>
                    <strong style={{ color: INK }}>They stop being drafts.</strong> Each becomes
                    this assessment’s recorded judgement about that sub-topic — the answer the
                    report is built from.
                  </div>
                  <div>
                    <strong style={{ color: INK }}>They become part of the comparison.</strong>{' '}
                    What you concluded is set beside what your respondents said, and the two are
                    shown wherever they point in different directions.
                  </div>
                  <div>
                    {/* ⚠️ WHAT IS OBSERVABLE, AND NOTHING MORE. There is no unsubmit control on
                        this screen, and that is all this may claim: whether the database permits a
                        later edit is materiality_impact_determination_lock's business and its
                        behaviour has not been read. "This is permanent" would be a guess, and
                        "you can undo it" would be a guess the customer acts on. */}
                    <strong style={{ color: INK }}>There is no undo here.</strong> Nothing on this
                    screen will turn them back into drafts. If you are still weighing one of them,
                    that is a reason to wait.
                  </div>
                  <div>
                    <strong style={{ color: INK }}>All of them, together.</strong> This covers every
                    sub-topic you hold rather than one at a time. If any is missing an answer, you
                    will be told exactly which — and nothing will be submitted until they are done.
                  </div>
                </div>

                {/* ⚠️ THE FUNCTION'S OWN SENTENCE, WHOLE. The incomplete list can run to dozens of
                    codes; it wraps and it is never cut short, because a truncated list sends the
                    reader looking for sub-topics it did not name. */}
                {submitError && (
                  <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10,
                                padding: '10px 12px', marginTop: 12, fontSize: 12, color: MID,
                                lineHeight: 1.7, overflowWrap: 'anywhere' }}>
                    <strong style={{ color: FAIL, display: 'block', marginBottom: 2 }}>NOT SUBMITTED</strong>
                    {submitError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button onClick={() => { setConfirmSubmit(false); setSubmitError(null) }}
                          disabled={submitting}
                          style={{ fontSize: 13, padding: '9px 18px', borderRadius: 8,
                                   border: `1px solid ${LINE}`, background: '#fff', color: MID,
                                   cursor: 'pointer' }}>
                    Not yet
                  </button>
                  <button onClick={submitAll} disabled={submitting}
                          style={{ fontSize: 13, fontWeight: 600, padding: '9px 20px',
                                   borderRadius: 8, border: 'none', background: INK, color: '#fff',
                                   cursor: submitting ? 'not-allowed' : 'pointer',
                                   opacity: submitting ? 0.6 : 1 }}>
                    {submitting ? 'Submitting…' : 'Submit them'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── the evidence, per sub-topic ──────────────────────────────────────────────────────────────────

function EvidencePanel({ ev, contrast, hasRound, aggFailed, floor, contrastCaveat, code }: {
  ev: AggSub | null; contrast: ContrastEntry | null; hasRound: boolean; aggFailed: boolean
  floor: number; contrastCaveat: string; code: string
}) {
  const wrap = (children: React.ReactNode, tone: 'evidence' | 'none') => (
    <div style={{ background: tone === 'evidence' ? '#fff' : PAPER,
                  border: `0.5px solid ${tone === 'evidence' ? BLUE : LINE}`,
                  borderLeft: `3px solid ${tone === 'evidence' ? BLUE : LINE}`,
                  borderRadius: 10, padding: '13px 16px', marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, color: tone === 'evidence' ? BLUE : MUTE, fontWeight: 700,
                    letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
        What your stakeholders said
      </div>
      {children}
    </div>
  )

  // ⚠️ FOUR DIFFERENT ABSENCES, FOUR DIFFERENT SENTENCES. None of them is a blank panel, and none
  // of them is the same fact. All four record evidence_in_view false.
  if (!hasRound) return wrap(
    <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.75 }}>
      {aggFailed
        ? 'The survey results could not be loaded, so no stakeholder survey informed this determination.'
        : 'No stakeholder survey informed this determination — none is linked to this assessment.'}
    </div>, 'none')

  if (!ev) return wrap(
    <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.75 }}>
      This sub-topic was not in the survey’s scope, so no stakeholder view was collected on it.
    </div>, 'none')

  const o = ev.overall
  if (!o || o.n_asked === 0) return wrap(
    <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.75 }}>
      Nobody who responded to the survey was asked about this, so there is no stakeholder view to
      inform this determination.
    </div>, 'none')

  const abstentionLed = o.n_abstained > o.n_answered && o.n_abstained > 0
  const suppressed = Object.values(ev.breakdowns || {}).some(
    b => b.omitted || (b.cells || []).some(c => c.suppressed))

  return wrap(
    <>
      {abstentionLed ? (
        // §6.1 as a finding, not as a quiet row. A bar drawn from two answers beside thirteen
        // abstentions would read as a low-priority topic; it is the opposite.
        <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}55`, borderRadius: 8,
                      padding: '10px 13px', marginBottom: 10, fontSize: 12, color: INK, lineHeight: 1.75 }}>
          <strong>{o.n_abstained} of {o.n_asked} said they could not judge this.</strong>{' '}
          {o.n_answered === 0
            ? 'Everyone asked said so — a finding about visibility, not a low priority.'
            : 'More could not judge it than gave a view — a finding about visibility, not a low priority.'}
        </div>
      ) : null}

      {o.n_answered > 0 && (
        <>
          <DistBar d={o.distribution} height={18} />
          <div style={{ fontSize: 12, color: MID, lineHeight: 1.8, marginTop: 8 }}>
            <strong style={{ color: INK }}>{pct(o.top_box.share)}</strong> of those who answered say
            this needs significant focus ({o.top_box.numerator} of {o.top_box.denominator})
            {' · '}median {medianText(o)}
            {o.polarised && <> · <strong style={{ color: PURPLE }}>the room is split</strong></>}
          </div>
        </>
      )}

      <Counters o={o} />

      {contrast && contrast.comparable && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 6 }}>
            Own workforce, beside the value chain
          </div>
          {([['Your own workforce', contrast.s1], ['Workers in your value chain', contrast.s2]] as const)
            .map(([who, side]) => (
            <div key={who} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                            flexWrap: 'wrap', fontSize: 11.5, color: MID, marginBottom: 4 }}>
                <span>{who}</span>
                <span><strong style={{ color: INK }}>{pct(side.top_box)}</strong> — {side.n_answered} answered</span>
              </div>
              <DistBar d={side.distribution} height={14} />
            </div>
          ))}
          {/* ⚠️ THE CAVEAT TRAVELS WITH THE CONTRAST, in the payload's own words. The whole risk is
              a reader filing this as disagreement, and it is at its highest here — beside a form,
              where the preparer is about to act on it. */}
          <div style={{ fontSize: 11, color: MID, lineHeight: 1.7, marginTop: 6,
                        background: AMBER_BG, borderRadius: 6, padding: '8px 11px' }}>
            <strong>Not disagreement.</strong> {contrastCaveat}
          </div>
        </div>
      )}

      {contrast && !contrast.comparable && contrast.not_comparable_reason && (
        <div style={{ fontSize: 11.5, color: MID, lineHeight: 1.7, marginTop: 10,
                      borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          <strong>No own-workforce / value-chain comparison.</strong> {contrast.not_comparable_reason}
        </div>
      )}

      {/* Suppression stated, never a silent gap. */}
      {suppressed && (
        <div style={{ fontSize: 11, color: MUTE, lineHeight: 1.7, marginTop: 10 }}>
          Some group-by-group splits are withheld: fewer than {floor} people answered in those
          groups, and showing them would identify individuals. The total above is never suppressed.
        </div>
      )}
    </>, 'evidence')
}

// ── one direction of one sub-topic ───────────────────────────────────────────────────────────────

function Block({ code, dir, d, saving, error, note, evidenced, onNature, onChange, onEdit }: {
  code: string; dir: Direction; d: Draft; saving: boolean
  error?: string; note?: string; evidenced: boolean
  onNature: (c: string, dd: Direction, n: 'actual' | 'potential') => void
  onChange: (c: string, dd: Direction, patch: Partial<Draft>) => void
  onEdit: (c: string, dd: Direction, patch: Partial<Draft>) => void
}) {
  const harm = dir === 'negative'
  return (
    <div style={{ border: `0.5px solid ${LINE}`, borderRadius: 14, padding: '1.1rem 1.3rem',
                  marginBottom: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: harm ? INK : GREEN }}>
          {harm ? 'As a harm' : 'As a benefit'}
        </div>
        <div style={{ fontSize: 11, color: MUTE }}>
          {saving ? 'Saving…' : d.nature ? 'Saved' : ''}
          {/* Stated on the row it applies to, so the record and the screen agree. */}
          {d.nature && <span style={{ marginLeft: 8 }}>
            · recorded as made {evidenced ? 'with' : 'without'} survey evidence
          </span>}
        </div>
      </div>

      <Question text={harm ? 'Is this harm already happening, or could it happen?'
                           : 'Is this benefit already happening, or could it happen?'} />
      <Options>
        {(['actual', 'potential'] as const).map(n => (
          <Option key={n} selected={d.nature === n} onClick={() => onNature(code, dir, n)}
                  badge={n === 'actual' ? '•' : '?'}
                  label={n === 'actual' ? 'Already happening' : 'Could happen'}
                  body={n === 'actual' ? 'It is going on now, or it has happened.'
                                       : 'It has not happened, but it could.'} />
        ))}
      </Options>

      {note && (
        <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 8,
                      padding: '10px 13px', margin: '4px 0 14px', fontSize: 12, color: INK, lineHeight: 1.75 }}>
          {note}
        </div>
      )}

      {d.nature && (
        <>
          {/* ⚠️ NO heading OVERRIDE. The heading travels with the direction-keyed scale, so the
              two halves of the question — "how much good it does" and "Transformative" — can no
              longer come from different places. The positive heading used to be a string literal
              in this file, duplicated in the contributor form: the direction-awareness lived in
              the page and the copy lived half in the constant. */}
          <ScaleField def={scaleFor(dir)} value={d.scale} abstained={d.abstained.includes('scale')}
                      onPick={v => onChange(code, dir, setDim(d, 'scale', v))} />
          <ScaleField def={SCOPE} value={d.scope} abstained={d.abstained.includes('scope')}
                      onPick={v => onChange(code, dir, setDim(d, 'scope', v))} />
          {/* ¶41: no irremediability on a benefit, no likelihood on something already happening. */}
          {harm && (
            <ScaleField def={IRREMEDIABILITY} value={d.irremediability}
                        abstained={d.abstained.includes('irremediability')}
                        onPick={v => onChange(code, dir, setDim(d, 'irremediability', v))} />
          )}
          {d.nature === 'potential' && (
            <ScaleField def={LIKELIHOOD} value={d.likelihood}
                        abstained={d.abstained.includes('likelihood')}
                        onPick={v => onChange(code, dir, setDim(d, 'likelihood', v))} />
          )}

          <Question text="Anything you want to explain?"
                    hint="Optional. Kept with the determination and quoted in the report." />
          <textarea value={d.rationale} rows={3}
                    onChange={e => onEdit(code, dir, { rationale: e.target.value })}
                    onBlur={() => onChange(code, dir, {})}
                    style={{ width: '100%', fontSize: 12.5, lineHeight: 1.7, padding: '10px 12px',
                             borderRadius: 10, border: `1px solid ${LINE}`, color: INK,
                             fontFamily: 'inherit', marginBottom: 18, resize: 'vertical' }} />

          <Question text="Where does it happen?" hint="Choose as many as apply." />
          <Pills items={VCP} on={c => d.vcp.includes(c)}
                 onClick={c => onChange(code, dir, {
                   vcp: d.vcp.includes(c) ? d.vcp.filter(x => x !== c) : [...d.vcp, c] })} />

          <div style={{ height: 14 }} />
          <Question text="Over what period?" />
          <Pills items={HORIZONS} on={c => d.horizon === c}
                 onClick={c => onChange(code, dir, { horizon: d.horizon === c ? null : c })} />
        </>
      )}

      {error && (
        <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 8,
                      padding: '10px 13px', marginTop: 14, fontSize: 12, color: INK, lineHeight: 1.75 }}>
          {error}
        </div>
      )}
    </div>
  )
}

// `readonly` because this component only maps over items and never mutates them, and the shared
// vocabularies in lib/materiality/impactContext.ts are exported readonly so a caller cannot push
// an option that the DB CHECK constraint would then reject. Widening the prop is the right side of
// that trade — dropping readonly from the export to satisfy a component that does not mutate would
// have removed the guarantee to suit the consumer.
const Pills = ({ items, on, onClick }: {
  items: readonly { code: string; label: string }[]
  on: (c: string) => boolean; onClick: (c: string) => void
}) => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {items.map(i => (
      <button key={i.code} type="button" onClick={() => onClick(i.code)}
              style={{ fontSize: 12.5, padding: '8px 14px', borderRadius: 999,
                       border: `1px solid ${on(i.code) ? PURPLE : LINE}`,
                       background: on(i.code) ? '#f4ecfe' : '#fff',
                       color: on(i.code) ? PURPLE : MID, cursor: 'pointer',
                       fontWeight: on(i.code) ? 600 : 400 }}>{i.label}</button>
    ))}
  </div>
)

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
    <Nav />
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>{children}</div>
  </div>
)
