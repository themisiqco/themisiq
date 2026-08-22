'use client'

/**
 * Where the stakeholder signal and the preparer's determinations point differently — the lead's
 * screen for the register lib/materiality/register.ts produces.
 *
 * ⚠️ THIS SCREEN COMPUTES NOTHING. buildRegister() is the single authority; every figure and every
 * sentence below comes from its output or from survey_aggregate. There is no materiality test here,
 * no threshold comparison, no severity, and no re-derivation of what a sub-topic's numbers mean.
 * The determinations screen makes the same promise about computeSeverity, and CLAUDE.md carries the
 * general form of it as a GHG engine invariant: ONE renderer, and the component is not it.
 *
 * ⚠️ THE ROUND IS NAMED ON SCREEN, AND SO IS THE FACT THAT THERE MAY BE MORE THAN ONE.
 * determine/page.tsx also takes links[0] and says nothing about it. That is survivable there, where
 * the evidence sits beside a judgement being made. It is not survivable here: this screen's whole
 * output is a comparison against ONE round's figures, and a lead reading a later round's results
 * screen will otherwise find numbers that disagree with these and have no way to see why.
 *
 * ⚠️ AN AGGREGATE THAT FAILED IS NOT AN ABSENT SURVEY, AND "NOTHING CAME BACK" IS ITS OWN THIRD
 * STATE. The same three states determine/page.tsx keeps, said as what they are.
 *
 * ⚠️ CATEGORY COMES FROM mr_esrs_topics, JOINED ON topic_code — NEVER FROM THE SUB-TOPIC CODE.
 * It decides mean-versus-max inside computeSeverity, so deriving it from the string would change
 * the number. mr_esrs_topics is keyed on code alone and carries no standard_version; the sub-topic
 * table IS versioned, and is filtered accordingly. A sub-topic whose category cannot be resolved is
 * reported as such and left out of the comparison rather than guessed at.
 *
 * ⚠️ NOTHING ON THIS SCREEN CALLS THIS A DIVERGENCE. That word is the module's internal name for
 * the thing; to a customer it reads as a finding against them. WHAT_THIS_IS_NOT is deliberately not
 * rendered for the same reason — it is written for a developer deciding what to merge, and it uses
 * the word.
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../../components/Nav'
import PaywallCard from '../../../../../components/PaywallCard'
import { supabase } from '../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../lib/useEntitlement'
import { subtopicHeading, resolveSubtopicName } from '../../../../../../lib/materiality/subtopicName'
import type { TopicCategory } from '../../../../../../lib/materiality/severity'
import {
  buildRegister, RegisterInputError,
  HEADING, WHAT_THIS_IS, THRESHOLD_NOTE,
  type Determination, type DivergenceRegister, type OmissionReason,
  type Overall, type RegisterSubTopic,
} from '../../../../../../lib/materiality/register'

const PURPLE = '#7425e3'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
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

const CARD: React.CSSProperties = {
  background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 16,
  padding: '1.5rem', marginBottom: 18,
}
const H2: React.CSSProperties = {
  fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: INK, marginBottom: 6,
}

// ── shared bits, the same three the results screen draws ─────────────────────────────────────────

function Chip({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return (
    <span style={{ display: 'inline-block', background: bg, color: fg, border: `0.5px solid ${fg}33`,
                   borderRadius: 999, padding: '2px 9px', fontSize: 10.5, fontWeight: 600,
                   letterSpacing: 0.2, whiteSpace: 'nowrap' }}>{text}</span>
  )
}

function Disclosure({ summary, children, tone = 'plain' }:
                    { summary: string; children: React.ReactNode; tone?: 'plain' | 'quiet' }) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, color: tone === 'quiet' ? MUTE : PURPLE,
                        listStyle: 'revert' }}>{summary}</summary>
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
  )
}

/** A block of the module's OWN prose. Rendered, never paraphrased. */
function ServerNote({ children, bg = PAPER, fg = MID }:
                    { children: React.ReactNode; bg?: string; fg?: string }) {
  return (
    <div style={{ background: bg, border: `0.5px solid ${LINE}`, borderRadius: 10,
                  padding: '10px 14px', fontSize: 11.5, color: fg, lineHeight: 1.75 }}>
      {children}
    </div>
  )
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
    <Nav />
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>{children}</div>
  </div>
)

/**
 * Plain-language labels for the trigger names and the omission reasons.
 *
 * ⚠️ LABELS ONLY — no meaning is decided here. The payload's names are identifiers, and printing
 * `stakeholder_high` at a customer is printing an enum. Every sentence that carries a REASON still
 * comes from the payload; these say only what the row is called.
 */
const TRIGGER_LABEL: Record<string, string> = {
  stakeholder_high: 'Respondents flagged it, your assessment did not',
  assessment_high: 'Your assessment flagged it, respondents did not',
  respondent_group_breakdown: 'Splitting a topic by respondent group',
}

const REASON_LABEL: Record<OmissionReason, string> = {
  excluded_at_scope: 'Left out of this assessment',
  no_substantive_answers: 'Nobody who was asked gave a rating',
  no_submitted_determination: 'No determination has been submitted yet',
  direction_never_scored: 'Only one side of this topic has been assessed',
  determination_incomplete: 'A determination is unfinished',
}

const DIRECTION_LABEL: Record<string, string> = {
  negative: 'Its negative impacts',
  positive: 'Its positive impacts',
}

type AggSub = {
  subtopic_code: string; topic_code: string; topic_label: string
  short_name: string | null
  status: string; exclusion_reason: string | null
  overall: Overall | null
}
type Agg = { subtopics: AggSub[] }

type Det = {
  subtopic_code: string; direction: 'negative' | 'positive'
  nature: 'actual' | 'potential' | null
  scale: number | null; scope: number | null
  irremediability: number | null; likelihood: number | null
  status: string
}

const isCategory = (v: unknown): v is TopicCategory =>
  v === 'env' || v === 'soc' || v === 'gov'

export default function WorksheetRegister() {
  const isPaid = useEntitlement('climate-risk')
  const params = useParams()
  const assessmentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [company, setCompany] = useState<string | null>(null)

  const [roundId, setRoundId] = useState<string | null>(null)
  const [roundName, setRoundName] = useState<string | null>(null)
  const [roundCount, setRoundCount] = useState(0)
  const [threshold, setThreshold] = useState<number | null>(null)
  const [agg, setAgg] = useState<Agg | null>(null)
  const [aggError, setAggError] = useState<string | null>(null)

  const [dets, setDets] = useState<Det[]>([])
  const [topicOf, setTopicOf] = useState<Record<string, string>>({})
  const [categoryOf, setCategoryOf] = useState<Record<string, string>>({})
  const [refName, setRefName] = useState<Record<string, string>>({})
  const [displayName, setDisplayName] = useState<Record<string, string>>({})
  const [roundSnapshot, setRoundSnapshot] = useState<Record<string, string>>({})
  const [snapshot, setSnapshot] = useState<Record<string, string>>({})

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
    setCompany(asmt.company_name)
    const sv = asmt.standard_version || ''

    const { data: links } = await supabase.from('materiality_assessment_survey_rounds')
      .select('round_id').eq('assessment_id', assessmentId).order('linked_at')
    // ⚠️ THE EARLIEST LINK, and the count is kept so the screen can SAY so. See the header.
    const rid = links && links.length ? (links[0] as { round_id: string }).round_id : null
    setRoundId(rid)
    setRoundCount(links ? links.length : 0)

    if (rid) {
      const [{ data: rd, error: rdErr }, { data: ag, error: agErr }] = await Promise.all([
        supabase.from('materiality_survey_rounds')
          .select('name, top_box_high_min_share').eq('id', rid).maybeSingle(),
        supabase.rpc('survey_aggregate', { p_round_id: rid }),
      ])
      const round = rd as { name: string; top_box_high_min_share: number | null } | null
      setRoundName(round?.name ?? null)
      // The round's OWN snapshotted value — never the current reference row, which may have moved
      // since this round was run.
      setThreshold(round?.top_box_high_min_share ?? null)
      if (rdErr) setLoadError(rdErr.message)

      // ⚠️ THREE STATES, KEPT APART.
      if (agErr) setAggError(agErr.message)
      else if (ag) setAgg(ag as Agg)
      else setAggError('The survey results came back empty, and no reason was given.')
    }

    const [dRes, stRes, tRes, dispRes, qRes, snapRes] = await Promise.all([
      supabase.from('materiality_impact_determinations')
        // ⚠️ value_chain_position and time_horizon are NOT selected here, deliberately. They were,
        // until 21 Aug 2026, and this screen referenced neither — buildRegister() is the single
        // authority for everything it shows, and its payload has no slot for them. A select is a
        // claim that something is read; leaving them in is how the next reader concludes the
        // register uses them. They are displayed on worksheet/[id]/determinations instead.
        .select('subtopic_code, direction, nature, scale, scope, irremediability, likelihood, abstained_dimensions, rationale, status, assignment_id, evidence_in_view, override_reason, overridden_at')
        .eq('assessment_id', assessmentId),
      supabase.from('mr_esrs_subtopics').select('code, topic_code, label').eq('standard_version', sv),
      // ⚠️ NOT versioned — mr_esrs_topics is keyed on code alone and has no standard_version column.
      supabase.from('mr_esrs_topics').select('code, label, category'),
      supabase.from('mr_esrs_subtopic_display').select('subtopic_code, short_name')
        .eq('standard_version', sv),
      rid
        ? supabase.from('materiality_survey_questions')
            .select('subtopic_code, short_name')
            .eq('round_id', rid).eq('status', 'included').not('subtopic_code', 'is', null)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('materiality_impact_assignment_subtopics')
        .select('subtopic_code, short_name').eq('assessment_id', assessmentId),
    ])

    const err = [dRes, stRes, tRes, dispRes, qRes, snapRes].find(r => r.error)?.error
    if (err) { setLoadError(err.message); setLoading(false); return }

    const st = (stRes.data || []) as { code: string; topic_code: string; label: string }[]
    setTopicOf(Object.fromEntries(st.map(r => [r.code, r.topic_code])))
    setRefName(Object.fromEntries(st.map(r => [r.code, r.label])))
    setCategoryOf(Object.fromEntries(
      ((tRes.data || []) as { code: string; category: string }[]).map(r => [r.code, r.category])))
    setDisplayName(Object.fromEntries(
      ((dispRes.data || []) as { subtopic_code: string; short_name: string }[])
        .map(r => [r.subtopic_code, r.short_name])))
    setRoundSnapshot(Object.fromEntries(
      ((qRes.data || []) as { subtopic_code: string; short_name: string }[])
        .map(r => [r.subtopic_code, r.short_name])))
    setSnapshot(Object.fromEntries(
      ((snapRes.data || []) as { subtopic_code: string; short_name: string | null }[])
        .filter(r => r.short_name).map(r => [r.subtopic_code, r.short_name as string])))
    setDets((dRes.data || []) as Det[])
    setLoading(false)
  }

  const sources = useMemo(() => ({
    assignmentSnapshot: snapshot, roundSnapshot, display: displayName, reference: refName,
  }), [snapshot, roundSnapshot, displayName, refName])

  const headingFor = (code: string) => subtopicHeading(code, topicOf[code] || '', sources)

  /**
   * The register, and the sub-topics that could not be put to it.
   *
   * ⚠️ A sub-topic with no resolvable category is HELD BACK, not defaulted. computeSeverity routes
   * on it, so a guess would change a materiality conclusion rather than merely mislabel a row.
   */
  const { register, buildError, noCategory } = useMemo<{
    register: DivergenceRegister | null; buildError: string | null; noCategory: string[]
  }>(() => {
    if (!agg || threshold === null) return { register: null, buildError: null, noCategory: [] }

    const byCode: Record<string, Determination[]> = {}
    for (const d of dets) {
      (byCode[d.subtopic_code] ||= []).push({
        direction: d.direction,
        // ⚠️ nature does NOT enter the severity figure or the materiality conclusion — it selects
        // which likelihood suppression is named, and likelihood is never folded in. A row saved
        // without one therefore cannot change anything this screen prints.
        nature: (d.nature ?? 'actual') as Determination['nature'],
        status: d.status,
        scale: d.scale, scope: d.scope,
        irremediability: d.irremediability, likelihood: d.likelihood,
      })
    }

    const held: string[] = []
    const subtopics: RegisterSubTopic[] = []
    for (const s of agg.subtopics || []) {
      const topicCode = s.topic_code || topicOf[s.subtopic_code] || ''
      const category = categoryOf[topicCode]
      if (!isCategory(category)) { held.push(s.subtopic_code); continue }
      subtopics.push({
        subtopic_code: s.subtopic_code,
        topic_code: topicCode,
        topic_label: s.topic_label,
        short_name: resolveSubtopicName(s.subtopic_code, sources) ?? s.short_name ?? null,
        category,
        status: s.status,
        exclusion_reason: s.exclusion_reason,
        overall: s.overall,
        determinations: byCode[s.subtopic_code] || [],
      })
    }

    try {
      return {
        register: buildRegister({ subtopics, topBoxHighMinShare: threshold }),
        buildError: null, noCategory: held,
      }
    } catch (e) {
      // A contradiction in the stored determinations, said as what it is. The module's own message
      // names the sub-topic and the direction.
      const message = e instanceof RegisterInputError ? e.message
        : e instanceof Error ? e.message : String(e)
      return { register: null, buildError: message, noCategory: held }
    }
  }, [agg, threshold, dets, topicOf, categoryOf, sources])

  if (isPaid === false) return (
    <Shell><PaywallCard title="Unlock the Climate Risk module"
      body="The impact worksheet is part of the Climate Risk &amp; Materiality module."
      href="/pricing?modules=risk" /></Shell>
  )
  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav /><div style={{ textAlign: 'center', padding: '4rem', color: MUTE }}>Loading…</div>
    </div>
  )
  if (loadError) return (
    <Shell><div style={CARD}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 10 }}>
        This could not be shown</div>
      <div style={{ fontSize: 13.5, color: MID, lineHeight: 1.75 }}>{loadError}</div>
    </div></Shell>
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/dashboard/materiality/worksheet" style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← All worksheets</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Assign and chase</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}/determinations`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Determinations</Link>
        </div>

        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>
          {company || 'Assessment'}
        </div>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 4, marginBottom: 20 }}>
          {HEADING}
        </div>

        {/* ── WHICH ROUND, AND WHETHER THERE IS MORE THAN ONE ──────────────────────────────── */}
        {roundId === null ? (
          <div style={CARD}>
            <div style={H2}>There is no survey to compare against</div>
            <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8 }}>
              No survey round is linked to this assessment, so there is no stakeholder view to set
              beside your determinations. Link a round and this page will fill in.
            </div>
          </div>
        ) : (
          <div style={{ background: BLUE_BG, border: `0.5px solid ${BLUE}`, borderRadius: 12,
                        padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            <strong>Compared against {roundName || 'the linked survey round'}.</strong>{' '}
            {roundCount > 1 && (
              <>More than one survey round is linked to this assessment ({roundCount} in total).
              This page reports against the earliest one only, so figures here will not match a
              later round&apos;s results page.</>
            )}
          </div>
        )}

        {aggError && (
          <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 12,
                        padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            <strong>The survey results could not be read.</strong> {aggError} Nothing below is
            missing because respondents said nothing — this page could not get their answers at all.
          </div>
        )}

        {roundId !== null && !aggError && threshold === null && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 12,
                        padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            This round did not record the level at which respondents count as having flagged a
            topic, so the comparison cannot be drawn for it.
          </div>
        )}

        {buildError && (
          <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 12,
                        padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            <strong>This could not be worked out.</strong> {buildError}
          </div>
        )}

        {register && (
          <>
            {/* ── THE REGISTER ───────────────────────────────────────────────────────────── */}
            <div style={CARD}>
              <div style={H2}>{HEADING}</div>
              <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 12 }}>
                {WHAT_THIS_IS}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {register.triggers_active.map(t => (
                  <Chip key={t} text={TRIGGER_LABEL[t] || t} fg={PURPLE} bg="#f1e7fd" />
                ))}
              </div>

              {register.triggers_inactive.map(t => (
                <div key={t.name} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 6 }}>
                    Not included: {TRIGGER_LABEL[t.name] || t.name}
                  </div>
                  {/* The payload's own reason — never a pointer to a method section. */}
                  <ServerNote>{t.reason}</ServerNote>
                </div>
              ))}

              {register.entries.length === 0 ? (
                <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginTop: 12 }}>
                  Everywhere both sides could be judged, they pointed the same way. That is a
                  finding, not a blank page: on every topic where respondents gave enough ratings
                  and your determinations are in, the two agree.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  {register.entries.map(e => {
                    const h = headingFor(e.subtopic_code)
                    return (
                      <div key={e.subtopic_code} style={{ border: `0.5px solid ${LINE}`,
                                                          borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline',
                                      flexWrap: 'wrap', marginBottom: 12 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{h.title}</div>
                          <span style={{ fontSize: 11, color: MUTE }}>
                            {h.code ? `${h.code} · ` : ''}{e.topic_label}
                          </span>
                          <Chip text={e.kind === 'stakeholder_high' ? 'Respondents flagged it'
                                                                   : 'Your assessment flagged it'}
                                fg={e.kind === 'stakeholder_high' ? PURPLE : GREEN}
                                bg={e.kind === 'stakeholder_high' ? '#f1e7fd' : GREEN_BG} />
                        </div>

                        {/* ⚠️ TWO FACTS, SIDE BY SIDE. No verdict, no adjective, and no third
                            sentence saying which one is right. */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div style={{ background: PAPER, borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10.5, color: MUTE, letterSpacing: 0.3,
                                          textTransform: 'uppercase', marginBottom: 5 }}>
                              What respondents said
                            </div>
                            <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
                              {e.stakeholder.statement}
                            </div>
                          </div>

                          <div style={{ background: PAPER, borderRadius: 10, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10.5, color: MUTE, letterSpacing: 0.3,
                                          textTransform: 'uppercase', marginBottom: 5 }}>
                              What your assessment concluded
                            </div>
                            <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
                              {e.assessment.statement}
                            </div>
                            {e.assessment.carried_by.length > 0 && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                {e.assessment.carried_by.map(d => (
                                  <Chip key={d} text={DIRECTION_LABEL[d] || d}
                                        fg={MID} bg="#fff" />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <Disclosure summary="How the respondent side is counted" tone="quiet">
                <ServerNote>{THRESHOLD_NOTE}</ServerNote>
              </Disclosure>
            </div>

            {/* ── WHAT IS STILL OUTSTANDING ──────────────────────────────────────────────── */}
            {(register.omitted.length > 0 || noCategory.length > 0) && (
              <div style={CARD}>
                <div style={H2}>What is still outstanding</div>
                <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 14 }}>
                  These topics are not in the comparison above, and none of them is a topic the two
                  sides agreed on. Each one is listed with what is missing.
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {register.omitted.map(o => {
                    const h = headingFor(o.subtopic_code)
                    return (
                      <div key={o.subtopic_code} style={{ border: `0.5px solid ${LINE}`,
                                                          borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{h.title}</div>
                          <span style={{ fontSize: 11, color: MUTE }}>
                            {h.code ? `${h.code} · ` : ''}{o.topic_label}
                          </span>
                          <Chip text={REASON_LABEL[o.reason]} fg={AMBER} bg={AMBER_BG} />
                        </div>
                        {/* The exclusion reason, and every other detail, exactly as recorded. */}
                        {o.detail && (
                          <div style={{ fontSize: 11.5, color: MID, lineHeight: 1.75, marginTop: 6 }}>
                            {o.detail}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {noCategory.length > 0 && (
                    <div style={{ border: `0.5px solid ${LINE}`, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: INK, marginBottom: 6 }}>
                        {noCategory.length} sub-topic{noCategory.length === 1 ? '' : 's'} could not
                        be placed under a topic
                      </div>
                      <div style={{ fontSize: 11.5, color: MID, lineHeight: 1.75 }}>
                        The topic each one belongs to is not recorded, and that is what decides how
                        its severity is worked out. They have been left out rather than guessed at:{' '}
                        {noCategory.join(', ')}.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
