'use client'

/**
 * Survey results — what the respondents said.
 *
 * Its own route, not a tab on the progress screen: that screen answers "who do I chase", this one
 * answers "what did they say", and this is the URL someone sends a colleague.
 *
 * ⚠️ THE ONLY SOURCE OF EVERY FIGURE HERE IS survey_aggregate (20260837). NOTHING IS RE-DERIVED IN
 * THIS FILE. Not a share, not a median, not a gap, not a suppression decision. The same rule the GHG
 * dashboard learned the hard way — buildWorkings() is rendered, never recomputed — applies with more
 * force here, because the aggregate's suppression is complementary: recomputing one cell in the
 * client could publish a group the server deliberately withheld. The only arithmetic below is
 * turning a stored proportion into a percentage for display, and summing three band counts to width
 * a bar.
 *
 * ⚠️ NO MEAN. ANYWHERE. Not in a figure, not in a chart, not in a sort order, not in a summary line
 * (spec v9 §6.2.5). The screening scale is ordinal and a mean assumes equal spacing between its
 * points. The aggregate does not return one; this file must not invent one. See SECTION 4's comment
 * for why the table has no score sort — the absence is load-bearing, not an omission.
 *
 * THE ORDER OF THIS PAGE IS AN ARGUMENT: findings, then detail, then machinery, then provenance.
 *
 *   1  Participation funnel      the frame for everything else
 *   2  S1/S2 contrast            the sharpest thing the routing produces
 *   3  Disagreement register     where respondents disagree with each other
 *   4  All sub-topics            the reference table
 *   5  Topic roll-up             read only after the detail beneath it
 *   6  Free text
 *   7  Method
 *   8  Integrity
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../../components/Nav'
import PaywallCard from '../../../../../components/PaywallCard'
import { supabase } from '../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../lib/useEntitlement'
// ⚠️ ONE RENDERER. These used to be defined in this file; they were extracted so the
// preparer's determination form draws the same evidence from the same code. See the
// component file's header for why a second renderer is the defect and not the convenience.
import { BANDS, DistBar, Counters, pct, medianText,
         type Dist, type TopBox, type Overall } from '../../../../../components/surveyEvidence'

const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
const AMBER = '#ba7517'
const AMBER_BG = '#FEF3E2'
const BLUE = '#0C447C'
const BLUE_BG = '#E6F1FB'
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'
const PURPLE = '#7425e3'
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

// ── payload types. Mirrors survey_aggregate; every field is read, none is computed. ──────────────
type Cell = {
  value: string; suppressed: boolean
  n_asked: number | null; n_answered: number | null; n_abstained: number | null
  n_skipped: number | null; n_not_asked: number | null
  distribution: Dist | null; top_box: number | null
}
type Breakdown = { omitted: boolean; reason?: string; cells?: Cell[] }
type SubTopic = {
  subtopic_code: string; topic_code: string; topic_label: string
  short_name: string; question_framing: string | null
  status: string; exclusion_reason: string | null
  overall: Overall | null
  breakdowns: Record<string, Breakdown> | null
}
type EntityQ = {
  question_id: string; short_name: string; status: string
  exclusion_reason: string | null; overall: Overall | null
}
type TopicRow = {
  topic_code: string; topic_label: string
  subtopics_included: number; subtopics_excluded: number; subtopics_resolved: number
  n_asked: number; n_answered: number; n_abstained: number; n_skipped: number; n_not_asked: number
  unknown: boolean; unknown_reason: string | null; note: string
}
type DisagreementEntry = {
  subtopic_code: string; short_name: string; topic_label: string
  n_answered: number; distribution: Dist; top_box: number | null
  triggers: string[]
  between_group: { dimension: string; a: { group: string; top_box: number; n_answered: number }
                   b: { group: string; top_box: number; n_answered: number }; gap: number }[]
}
type ContrastSide = { n_answered: number; top_box: number | null; distribution: Dist }
type ContrastEntry = {
  s1_subtopic_code: string; s2_subtopic_code: string; short_name: string
  s1: ContrastSide; s2: ContrastSide
  comparable: boolean; not_comparable_reason: string | null
  gap: number | null; flagged: boolean
}
type Comment = {
  respondent_type: string; track: string | null; stakeholder_category: string | null
  comment: string; subtopic_code?: string; short_name?: string; topic_label?: string
}
type Agg = {
  round: { id: string; name: string; company_name: string | null; standard_version: string
           questionnaire_version: number; status: string; deadline: string | null; frozen_at: string | null }
  method: {
    statistic: string; mean_computed: boolean; mean_note: string; median_convention: string
    dispersion: { method: string; definition: string
                  agreement_coefficient: number | null; agreement_coefficient_note: string }
    thresholds: Record<string, unknown> & { source: string }
    suppression: Record<string, string>
    n_asked_basis: string; not_produced: string
  }
  participation: { invited: number; reached: number; completed: number
                   never_opened: number; revoked: number; expired: number }
  integrity: { responses_off_route: number; responses_other_version: number; note: string }
  subtopics: SubTopic[]
  entity_specific: EntityQ[]
  topics: TopicRow[]
  disagreement_register: { what_this_is: string; triggers_active: string[]
                           triggers_inactive: string[]; entries: DisagreementEntry[] }
  s1_s2_contrast: { what_this_is: string; what_this_is_not: string; entries: ContrastEntry[] }
  free_text: {
    method: Record<string, string>
    individual_comments_withheld: boolean | null
    individual_comment_count: number | null
    closing_comments: Comment[]
    question_comments: Comment[]
  }
}

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const titleise = (s: string | null | undefined) =>
  !s ? '' : s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

// ── shared bits ──────────────────────────────────────────────────────────────────────────────────

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

/** A block of the aggregate's OWN prose. Rendered, never paraphrased. */
function ServerNote({ children, bg = PAPER, fg = MID }:
                    { children: React.ReactNode; bg?: string; fg?: string }) {
  return (
    <div style={{ background: bg, border: `0.5px solid ${LINE}`, borderRadius: 10,
                  padding: '10px 14px', fontSize: 11.5, color: fg, lineHeight: 1.75 }}>
      {children}
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────────────────────────

export default function SurveyResults() {
  const isPaid = useEntitlement('double-materiality')
  const params = useParams()
  const roundId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [agg, setAgg] = useState<Agg | null>(null)
  const [catLabels, setCatLabels] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [roundId])

  const load = async () => {
    setLoading(true); setLoadError(null)

    const [{ data, error }, cats] = await Promise.all([
      supabase.rpc('survey_aggregate', { p_round_id: roundId }),
      supabase.from('mr_stakeholder_categories').select('code, label'),
    ])

    if (error) { setLoadError(error.message); setLoading(false); return }

    /**
     * ⚠️ AN EMPTY RESULT IS A RESULT, AND IT IS NOT AN ERROR. survey_aggregate returns jsonb, so a
     * null here means the round was not found or is not this account's — which RLS makes
     * indistinguishable from the client, and which must therefore be stated as the two things it
     * could be rather than guessed at as one.
     */
    if (data === null || data === undefined) {
      setLoadError('The aggregation returned nothing for this round. That means the round does not '
                 + 'exist, or it belongs to another account — those two cannot be told apart from '
                 + 'here. Nothing was calculated and nothing is being hidden.')
      setLoading(false); return
    }

    setAgg(data as Agg)
    if (cats.data) {
      setCatLabels(Object.fromEntries((cats.data as { code: string; label: string }[])
        .map(c => [c.code, c.label])))
    }
    setLoading(false)
  }

  const catName = (c: string | null | undefined) => !c ? '' : (catLabels[c] || titleise(c))

  // ── derived VIEWS only. No statistic is computed here. ─────────────────────────────────────────
  const byTopic = useMemo(() => {
    if (!agg) return []
    const order: string[] = []
    const map: Record<string, SubTopic[]> = {}
    for (const s of agg.subtopics) {
      if (!map[s.topic_code]) { map[s.topic_code] = []; order.push(s.topic_code) }
      map[s.topic_code].push(s)
    }
    return order.map(code => ({ code, label: map[code][0].topic_label, rows: map[code] }))
  }, [agg])

  /**
   * §6.1 MADE COUNTABLE. A sub-topic where more people said "not enough visibility to assess" than
   * gave a score is a finding about the company's visibility of its own impact — and it is the one
   * finding on this page that a reader will otherwise mistake for its opposite, because a row with
   * no bar looks like a row nobody cared about.
   */
  const abstentionLed = useMemo(() =>
    !agg ? [] : agg.subtopics.filter(s =>
      s.status === 'included' && s.overall && s.overall.n_abstained > s.overall.n_answered
                              && s.overall.n_abstained > 0), [agg])

  if (isPaid === false) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>
        <PaywallCard title="Unlock Impact Materiality"
          body="Stakeholder survey results are part of the Impact Materiality Assessment. Unlock it to run a survey round and read what your stakeholders said."
          href="/pricing?modules=impact" />
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav /><div style={{ textAlign: 'center', padding: '4rem', color: MUTE }}>Loading results…</div>
    </div>
  )

  if (loadError || !agg) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem' }}>
        <div style={CARD}>
          <div style={{ ...H2, fontSize: '1.3rem' }}>Results could not be shown</div>
          <div style={{ fontSize: 13.5, color: MID, lineHeight: 1.75 }}>{loadError}</div>
        </div>
      </div>
    </div>
  )

  const p = agg.participation
  const noResponsesYet = p.reached === 0

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem' }}>

        {/* ── 0 · header ────────────────────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/dashboard/materiality/survey" style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← All survey rounds</Link>
          <Link href={`/dashboard/materiality/survey/${roundId}`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Progress and invitations</Link>
          <Link href={`/dashboard/materiality/survey/${roundId}/scope`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Topics in scope</Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>{agg.round.name}</div>
          <Chip text={agg.round.status === 'closed' ? 'Closed' : 'Open'}
                fg={agg.round.status === 'closed' ? BLUE : GREEN}
                bg={agg.round.status === 'closed' ? BLUE_BG : GREEN_BG} />
        </div>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 4, marginBottom: 20 }}>
          Results{agg.round.company_name ? ` · ${agg.round.company_name}` : ''}
          {' · '}{agg.round.standard_version === 'esrs_2026' ? 'ESRS (2026)' : agg.round.standard_version}
          {agg.round.deadline && ` · deadline ${fmtDate(agg.round.deadline)}`}
        </div>

        {/* ── 1 · participation funnel ───────────────────────────────────────────────────────
            LEADS THE PAGE, AND THE SENTENCE UNDER IT IS THE REASON WHY. Every figure below is
            calculated over the people who REACHED the form, not over the people invited. A reader
            who does not know that reads a small number as a finding about their organisation when
            it is a fact about their invitations. That sentence is body text, never a footnote and
            never a tooltip: a tooltip is what someone skims past, and this is the sentence that
            stops the whole page being misread. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: 12, marginBottom: 12 }}>
          {[
            { label: 'Invited', val: p.invited, color: INK, bg: '#fff' },
            { label: 'Opened the survey', val: p.reached, color: AMBER, bg: AMBER_BG },
            { label: 'Submitted', val: p.completed, color: GREEN, bg: GREEN_BG },
          ].map(t => (
            <div key={t.label} style={{ background: t.bg, border: `0.5px solid ${LINE}`, borderRadius: 12,
                                        padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: t.color }}>{t.val}</div>
              <div style={{ fontSize: 11, color: MUTE, marginTop: 4 }}>{t.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: BLUE_BG, border: `0.5px solid ${BLUE}`, borderRadius: 12,
                      padding: '12px 16px', marginBottom: 8, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
          <strong>Every figure below is out of {p.reached}, the people who opened the survey — not out
          of {p.invited}, the people invited.</strong> An unopened invitation is never counted as
          “asked and skipped”: that would report a delivery problem as a finding about
          {' '}{agg.round.company_name || 'your company'}.
          {p.never_opened > 0 && <> {p.never_opened} {p.never_opened === 1 ? 'person has' : 'people have'} not
          opened it yet — that gap is about your invitations, and it is chased from the{' '}
          <Link href={`/dashboard/materiality/survey/${roundId}`} style={{ color: BLUE }}>progress screen</Link>.</>}
        </div>

        {(p.revoked > 0 || p.expired > 0) && (
          <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 18, lineHeight: 1.7 }}>
            Also on the list and not counted anywhere above:{' '}
            {p.revoked > 0 && `${p.revoked} revoked`}{p.revoked > 0 && p.expired > 0 && ', '}
            {p.expired > 0 && `${p.expired} expired`}.
          </div>
        )}
        <div style={{ height: 10 }} />

        {/* ── 1a · THE EMPTY ROUND. Not an edge case — for most rounds it is the first thing the
            buyer sees, and it should look like a survey waiting rather than a survey that failed.
            37 empty rows, an S1/S2 contrast with nothing in it and ten topics reporting "unknown"
            would all be technically accurate and would all read as a broken page. So sections 2–6
            do not render, and the three things that ARE settled — scope, method, integrity — do. */}
        {noResponsesYet ? (
          <>
            <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <div style={{ ...H2, fontSize: '1.4rem' }}>No responses yet</div>
              <div style={{ fontSize: 13.5, color: MID, lineHeight: 1.8, maxWidth: 560, margin: '0 auto' }}>
                Results appear here as people submit. Nothing is calculated until someone opens the
                survey, so there is nothing on this page to be wrong yet.
                {p.invited === 0
                  ? <> No one has been invited — start on the{' '}
                      <Link href={`/dashboard/materiality/survey/${roundId}/respondents`} style={{ color: PURPLE }}>respondents screen</Link>.</>
                  : <> {p.invited} {p.invited === 1 ? 'invitation is' : 'invitations are'} out.</>}
              </div>
            </div>
            <ScopeSummary agg={agg} />
          </>
        ) : (
          <>
            {/* ── 2 · S1/S2 CONTRAST ─────────────────────────────────────────────────────────
                FIRST, because it is the sharpest output the S1/S2 routing produces: two
                populations describing two different workplaces, side by side.

                ⚠️ what_this_is_not IS STANDING TEXT INSIDE THE SECTION, NOT A TOOLTIP. The entire
                risk with this block is a reader filing it under "our stakeholders disagree", which
                is a different and much weaker claim than the one being made, and a tooltip is
                exactly the thing a reader skims past. It is printed, in full, above the entries. */}
            <div style={CARD}>
              <div style={H2}>Own workforce, beside the value chain</div>
              <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 12 }}>
                {agg.s1_s2_contrast.what_this_is}
              </div>
              <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                            padding: '12px 16px', marginBottom: 18, fontSize: 12, color: INK, lineHeight: 1.8 }}>
                <strong>This is not disagreement.</strong> {agg.s1_s2_contrast.what_this_is_not}
              </div>

              {agg.s1_s2_contrast.entries.length === 0 ? (
                <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.7 }}>
                  No labour pairs to draw. Both sides of a pair have to be in scope for this round.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  {[...agg.s1_s2_contrast.entries]
                    /* ⚠️ ORDERED BY FLAG THEN BY GAP SIZE — a gap between two shares of counts.
                       No mean is involved, and none could be: there is no single number per side. */
                    .sort((a, b) =>
                      (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) ||
                      (b.gap ?? -1) - (a.gap ?? -1))
                    .map(e => (
                    <div key={e.s1_subtopic_code}
                         style={{ border: `0.5px solid ${e.flagged ? PURPLE : LINE}`, borderRadius: 12,
                                  padding: '14px 16px', background: e.flagged ? '#fbf8ff' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
                                    alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
                          {e.short_name}
                          <span style={{ fontSize: 11, color: MUTE, fontWeight: 400, marginLeft: 8 }}>
                            {e.s1_subtopic_code} / {e.s2_subtopic_code}
                          </span>
                        </div>
                        {e.flagged && <Chip text={`GAP ${pct(e.gap)}`} fg={PURPLE} bg="#f1e7fd" />}
                      </div>

                      {e.comparable ? (
                        <div style={{ display: 'grid', gap: 10 }}>
                          {/* ⚠️ BOTH BARS FULL WIDTH, ONE ABOVE THE OTHER. A three-column row put
                              each bar in a different residual width once the side labels differed,
                              and two bars that are not on the same scale cannot be compared by eye
                              — which is the only thing this block is for. The label and the figures
                              share a flex line above the bar and wrap independently. */}
                          {([['Your own workforce', e.s1], ['Workers in your value chain', e.s2]] as const)
                            .map(([who, side]) => (
                            <div key={who}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                                            flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 5 }}>
                                <span style={{ fontSize: 11.5, color: MID }}>{who}</span>
                                <span style={{ fontSize: 11.5, color: MID, fontVariantNumeric: 'tabular-nums' }}>
                                  <strong style={{ color: INK }}>{pct(side.top_box)}</strong> say
                                  significant focus · <span style={{ color: MUTE }}>{side.n_answered} answered</span>
                                </span>
                              </div>
                              <DistBar d={side.distribution} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* NOT HIDDEN. A pair that cannot be drawn because no value-chain worker
                           answered IS the finding — it is invariant 5 wearing a different hat. */
                        <div style={{ fontSize: 12, color: MID, lineHeight: 1.75, background: PAPER,
                                      border: `0.5px solid ${LINE}`, borderRadius: 8, padding: '10px 14px' }}>
                          <strong>Not comparable.</strong> {e.not_comparable_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 3 · DISAGREEMENT REGISTER ─────────────────────────────────────────────────── */}
            <div style={CARD}>
              <div style={H2}>Where people disagree with each other</div>
              <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 12 }}>
                {agg.disagreement_register.what_this_is}
              </div>

              {/* The inactive trigger, stated. This is where agreement_coefficient being null stops
                  looking like a missing number and starts reading as the decision it is. */}
              <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.8, marginBottom: 16 }}>
                Triggers in use: {agg.disagreement_register.triggers_active.map(titleise).join(', ')}.
                {agg.disagreement_register.triggers_inactive.length > 0 && <>
                  {' '}Not in use: {agg.disagreement_register.triggers_inactive.map(titleise).join(', ')} —{' '}
                  <span title={agg.method.dispersion.agreement_coefficient_note}>see the method below.</span>
                </>}
              </div>

              {agg.disagreement_register.entries.length === 0 ? (
                <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.7 }}>
                  Nothing has met a trigger. That is a result, not a blank: no sub-topic above the
                  anonymity floor is split at both ends of the scale, and no two groups differ by
                  more than the disclosed margin.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {agg.disagreement_register.entries.map(e => (
                    <div key={e.subtopic_code} style={{ border: `0.5px solid ${LINE}`, borderRadius: 12,
                                                        padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline',
                                    flexWrap: 'wrap', marginBottom: 10 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{e.short_name}</div>
                        <span style={{ fontSize: 11, color: MUTE }}>{e.subtopic_code} · {e.topic_label}</span>
                        {e.triggers.includes('polarised') && <Chip text="SPLIT ROOM" fg={PURPLE} bg="#f1e7fd" />}
                        {e.triggers.includes('between_group_top_box_gap') && <Chip text="GROUPS DIFFER" fg={AMBER} bg={AMBER_BG} />}
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10,
                                      flexWrap: 'wrap', marginBottom: 5, fontSize: 11.5, color: MID }}>
                          <span><strong style={{ color: INK }}>{pct(e.top_box)}</strong> say significant
                          focus · <span style={{ color: MUTE }}>{e.n_answered} answered</span></span>
                        </div>
                        <DistBar d={e.distribution} />
                      </div>

                      {e.triggers.includes('polarised') && (
                        <div style={{ fontSize: 11.5, color: MID, lineHeight: 1.75, marginTop: 10 }}>
                          People are at both ends and few are in the middle. There is no single
                          figure that would describe this room, which is the point of listing it.
                        </div>
                      )}

                      {e.between_group.map((g, i) => (
                        <div key={i} style={{ fontSize: 11.5, color: MID, lineHeight: 1.8, marginTop: 8,
                                              background: PAPER, borderRadius: 8, padding: '8px 12px' }}>
                          By {titleise(g.dimension)}: <strong>{catName(g.a.group) || titleise(g.a.group)}</strong>{' '}
                          {pct(g.a.top_box)} ({g.a.n_answered} answered) against{' '}
                          <strong>{catName(g.b.group) || titleise(g.b.group)}</strong>{' '}
                          {pct(g.b.top_box)} ({g.b.n_answered} answered) — a gap of {pct(g.gap)}.
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 4 · ALL SUB-TOPICS ──────────────────────────────────────────────────────────
                ⚠️ THERE IS NO SORT CONTROL ON THIS TABLE, DELIBERATELY. The two registers above
                do the "what matters most" job. If this table could be ordered by score it would
                become a ranking, and a ranking of 37 rows wants one number per row to rank by —
                which is the single place a mean would be tempting, and the reason §6.2.5 exists.
                The table is a reference, in survey order, and it stays that way. */}
            <div style={CARD}>
              <div style={H2}>Every sub-topic</div>
              <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 14 }}>
                In the order respondents saw them. This table is a reference, not a ranking — it has
                no score column and no sort, because a single number per sub-topic is the field most
                likely to be read as a decision the survey has not made.
              </div>

              {/* The scale, in the respondent's own words, once. A reader looking at a top_box has
                  to be able to find out what "3" actually said. */}
              <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
                {BANDS.map(b => (
                  <div key={b.v} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ background: b.bg, color: b.fg, borderRadius: 4, minWidth: 20,
                                   textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '2px 0' }}>{b.v}</span>
                    <span style={{ fontSize: 11.5, color: MID, lineHeight: 1.6 }}>{b.full}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ background: PAPER, color: MID, border: `0.5px solid ${LINE}`, borderRadius: 4,
                                 minWidth: 20, textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '2px 0' }}>—</span>
                  <span style={{ fontSize: 11.5, color: MID, lineHeight: 1.6 }}>
                    Not enough visibility to assess — a recorded answer, never a zero and never a low
                  </span>
                </div>
              </div>

              {/* §6.1, LIFTED ABOVE THE TABLE so it is not found only by scrolling. */}
              {abstentionLed.length > 0 && (
                <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                              padding: '12px 16px', marginBottom: 16, fontSize: 12.5, color: INK, lineHeight: 1.8 }}>
                  <strong>On {abstentionLed.length} {abstentionLed.length === 1 ? 'sub-topic' : 'sub-topics'},
                  more people said they could not judge it than gave a view.</strong>{' '}
                  That is a finding about visibility, not a low score — marked below, and usually it
                  means the company cannot yet see its own impact here.
                  <div style={{ marginTop: 6, color: MID, fontSize: 11.5 }}>
                    {abstentionLed.map(s => s.short_name).join(' · ')}
                  </div>
                </div>
              )}

              {byTopic.map(t => (
                <div key={t.code} style={{ marginBottom: 22 }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: INK,
                                paddingBottom: 6, borderBottom: `1px solid ${LINE}`, marginBottom: 10 }}>
                    {t.label} <span style={{ fontSize: 11, color: MUTE }}>{t.code}</span>
                  </div>
                  {t.rows.map(s => (
                    <SubTopicRow key={s.subtopic_code} s={s} catName={catName}
                                 floor={Number(agg.method.thresholds.anonymity_floor)} />
                  ))}
                </div>
              ))}

              {agg.entity_specific.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: INK,
                                paddingBottom: 6, borderBottom: `1px solid ${LINE}`, marginBottom: 10 }}>
                    Entity-specific questions
                  </div>
                  {agg.entity_specific.map(q => (
                    <div key={q.question_id} style={{ padding: '12px 0', borderBottom: `0.5px solid ${LINE}` }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 8 }}>{q.short_name}</div>
                      {q.status !== 'included'
                        ? <div style={{ fontSize: 11.5, color: MUTE }}>Not in scope for this round{q.exclusion_reason ? ` — ${q.exclusion_reason}` : ''}.</div>
                        : q.overall
                          ? <div>
                              <DistBar d={q.overall.distribution} />
                              <Counters o={q.overall} />
                            </div>
                          : <div style={{ fontSize: 11.5, color: MUTE }}>No one who has responded is asked this.</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 5 · TOPIC ROLL-UP ───────────────────────────────────────────────────────────
                AFTER the detail, not before: "E3 is unknown" only means something once you have
                seen what sits under E3. The three unknown reasons are three different sentences —
                see UNKNOWN_COPY. */}
            <div style={CARD}>
              <div style={H2}>By topic</div>
              <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 14 }}>
                {agg.topics[0]?.note || 'Coverage per topic. No topic score is produced.'}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {agg.topics.map(t => <TopicRowView key={t.topic_code} t={t} />)}
              </div>
            </div>

            {/* ── 6 · FREE TEXT ───────────────────────────────────────────────────────────── */}
            <FreeText agg={agg} catName={catName} />

            <ScopeSummary agg={agg} />
          </>
        )}

        {/* ── 7 · METHOD ─────────────────────────────────────────────────────────────────────
            The one-line summary is ALWAYS visible and never collapsed. The absence of a mean is a
            methodological claim this product is making on purpose; a reader should not have to
            click to discover that the thing they expected to find was withheld deliberately. */}
        <div style={CARD}>
          <div style={H2}>How these figures were produced</div>
          <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.8 }}>
            <strong>No mean is computed anywhere on this page.</strong> {agg.method.mean_note}
          </div>

          <Disclosure summary="The full method — median, dispersion, thresholds, suppression, and what is not produced">
            <div style={{ display: 'grid', gap: 12 }}>
              <MethodItem label="Median" body={agg.method.median_convention} />
              <MethodItem label="Spread" body={agg.method.dispersion.definition} />
              <MethodItem label="Agreement coefficient — not computed"
                          body={agg.method.dispersion.agreement_coefficient_note} tone="amber" />
              <MethodItem label="Who counts as asked" body={agg.method.n_asked_basis} />
              <MethodItem label="Suppression" body={agg.method.suppression.rule} />
              <MethodItem label="Two-valued splits" body={agg.method.suppression.two_valued_note} />
              <MethodItem label="Totals are never suppressed" body={agg.method.suppression.overall_note} />
              <MethodItem label="Omitted dimensions" body={agg.method.suppression.single_group_note} />
              <MethodItem label="Not produced" body={agg.method.not_produced} />
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 6 }}>Thresholds used for this round</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  {Object.entries(agg.method.thresholds)
                    .filter(([k]) => k !== 'source')
                    .map(([k, v]) => (
                      <Chip key={k} text={`${titleise(k)}: ${String(v)}`} fg={MID} bg={PAPER} />
                  ))}
                </div>
                <ServerNote>{agg.method.thresholds.source}</ServerNote>
              </div>
            </div>
          </Disclosure>
        </div>

        {/* ── 8 · INTEGRITY. Never hidden — it is the verifier-facing check. ─────────────────── */}
        {(() => {
          const bad = agg.integrity.responses_off_route > 0 || agg.integrity.responses_other_version > 0
          return (
            <div style={{ ...CARD, background: bad ? FAIL_BG : '#fff',
                          borderColor: bad ? FAIL : LINE, marginBottom: 40 }}>
              <div style={{ fontSize: 12.5, color: bad ? FAIL : GREEN, fontWeight: 600, marginBottom: 6 }}>
                {bad ? 'Integrity checks did not pass' : 'Integrity checks passed'}
              </div>
              <div style={{ fontSize: 12, color: MID, lineHeight: 1.8 }}>
                Answers to questions the respondent was never routed to:{' '}
                <strong style={{ color: bad ? FAIL : INK }}>{agg.integrity.responses_off_route}</strong>.
                {' '}Answers against a superseded questionnaire version:{' '}
                <strong style={{ color: bad ? FAIL : INK }}>{agg.integrity.responses_other_version}</strong>.
              </div>
              <Disclosure summary="What these two counts mean" tone="quiet">
                <ServerNote>{agg.integrity.note}</ServerNote>
              </Disclosure>
            </div>
          )
        })()}

      </div>
    </div>
  )
}

// ── section pieces ───────────────────────────────────────────────────────────────────────────────

function MethodItem({ label, body, tone }: { label: string; body: string; tone?: 'amber' }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: tone === 'amber' ? AMBER : INK, marginBottom: 4 }}>{label}</div>
      <ServerNote bg={tone === 'amber' ? AMBER_BG : PAPER}>{body}</ServerNote>
    </div>
  )
}

function SubTopicRow({ s, catName, floor }:
                     { s: SubTopic; catName: (c: string | null | undefined) => string; floor: number }) {
  const o = s.overall
  const abstentionLed = !!o && o.n_abstained > o.n_answered && o.n_abstained > 0

  return (
    <div style={{ padding: '14px 0', borderBottom: `0.5px solid ${LINE}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: s.status === 'included' ? INK : MUTE }}>
          {s.short_name}
        </span>
        <span style={{ fontSize: 11, color: MUTE }}>{s.subtopic_code}</span>
        {o?.polarised && <Chip text="SPLIT ROOM" fg={PURPLE} bg="#f1e7fd" />}
        {abstentionLed && <Chip text="NO VISIBILITY" fg={AMBER} bg={AMBER_BG} />}
      </div>

      {s.status !== 'included' ? (
        <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.7 }}>
          Not in scope for this round{s.exclusion_reason ? ` — ${s.exclusion_reason}` : ''}.
        </div>
      ) : !o || o.n_asked === 0 ? (
        <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.7 }}>
          No one who has responded is asked this sub-topic.
        </div>
      ) : abstentionLed ? (
        /* ⚠️ §6.1 MADE VISIBLE, AND THIS IS THE ROW MOST EASILY MISREAD. A bar drawn from two
           scored answers beside thirteen abstentions would read as a quiet, low-priority topic.
           It is the opposite: nobody can see it. The band replaces the bar so the eye cannot make
           that mistake, and the sentence says which finding it is. */
        <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}55`, borderRadius: 8,
                      padding: '10px 14px' }}>
          <div style={{ fontSize: 12, color: INK, lineHeight: 1.75 }}>
            <strong>{o.n_abstained} of {o.n_asked} said they could not judge this
            {o.n_answered === 0 ? '' : `, and ${o.n_answered} gave a view`}.</strong>{' '}
            {o.n_answered === 0
              ? 'Everyone asked said they could not judge this — a finding about visibility, not a low score.'
              : 'More people could not judge this than gave a view — a finding about visibility, not a low score.'}
          </div>
          {o.n_answered > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10.5, color: MID, marginBottom: 4 }}>
                What the {o.n_answered} who did answer said:
              </div>
              <DistBar d={o.distribution} height={16} />
            </div>
          )}
        </div>
      ) : (
        /* ⚠️ FULL WIDTH, STACKED — the bar, then the summary, then the counters. The stats used to
           sit in a fixed 300px column beside the bar and overflowed the card on narrower screens.
           Nothing here is truncated at any width: the summary is ordinary wrapping text and the
           counters reflow. */
        <div>
          <DistBar d={o.distribution} />
          {o.n_answered === 0 ? (
            /* ⚠️ AN ABSENCE, SAID IN WORDS. This rendered as "— say significant focus (0 of 0) ·
               median —", and two em-dashes read as a broken value rather than as a deliberate
               blank. Every other absence on this page is stated; so is this one. Reaching here
               means nobody abstained either — any abstention sends the row to the §6.1 branch
               above — so the whole of n_asked was skipped. */
            <div style={{ fontSize: 12, color: MID, lineHeight: 1.8, marginTop: 10 }}>
              <strong style={{ color: INK }}>No one gave a view.</strong> All {o.n_asked}{' '}
              {o.n_asked === 1 ? 'person' : 'people'} asked skipped this — nobody scored it, and
              nobody said they could not judge it. There is no distribution, no median and no
              share to report: an absence, not a low score.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: MID, lineHeight: 1.8, marginTop: 10 }}>
              <strong style={{ color: INK }}>{pct(o.top_box.share)}</strong> say significant focus
              {' '}({o.top_box.numerator} of {o.top_box.denominator})
              {' · '}median {medianText(o)}
              {o.modal_share !== null && <> · {pct(o.modal_share)} in the largest band</>}
            </div>
          )}
          <Counters o={o} />
        </div>
      )}

      {s.status === 'included' && o && o.n_asked > 0 && s.breakdowns && (
        <Disclosure summary="Split by group" tone="quiet">
          <div style={{ display: 'grid', gap: 10 }}>
            {Object.entries(s.breakdowns).map(([dim, b]) => (
              <BreakdownView key={dim} dim={dim} b={b} catName={catName} floor={floor} />
            ))}
          </div>
        </Disclosure>
      )}
    </div>
  )
}

/**
 * ⚠️ SUPPRESSION IS STATED, NEVER BLANK. A missing row reads as an oversight; a row that says why
 * it is withheld reads as the protection it is. Three different absences, three different
 * sentences — including 'no_respondents', which until 20260837 was reported as 'single_group' and
 * therefore claimed a group existed when none did.
 */
const OMISSION_COPY: Record<string, string> = {
  no_respondents: 'No one has answered this yet, so there are no groups to compare. This is temporary.',
  single_group: 'Only one group answered this, so a split would just repeat the total above.',
}

function BreakdownView({ dim, b, catName, floor }:
                       { dim: string; b: Breakdown; catName: (c: string | null | undefined) => string; floor: number }) {
  const DIM_LABEL: Record<string, string> = {
    track: 'Internal or external', labour_group: 'Which workforce', category: 'Stakeholder group',
  }
  return (
    <div style={{ border: `0.5px solid ${LINE}`, borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 8 }}>
        {DIM_LABEL[dim] || titleise(dim)}
      </div>
      {b.omitted ? (
        <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.7 }}>
          {OMISSION_COPY[b.reason || ''] || `Not shown — ${b.reason}.`}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {(b.cells || []).map(c => (
            <div key={c.value}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                            flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: MID }}>{catName(c.value) || titleise(c.value)}</span>
                {!c.suppressed && c.distribution && (
                  <span style={{ fontSize: 11, color: MID, fontVariantNumeric: 'tabular-nums' }}>
                    {pct(c.top_box)} · {c.n_answered} answered
                  </span>
                )}
              </div>
              {c.suppressed || !c.distribution ? (
                <div style={{ fontSize: 11, color: MUTE, fontStyle: 'italic', lineHeight: 1.6 }}>
                  Withheld — fewer than {floor} people in this group answered, and showing it would
                  identify them.
                </div>
              ) : (
                <DistBar d={c.distribution} height={16} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The three reasons a topic is unknown, as three sentences. Before 20260837 the middle one was
 * printed in all three situations — telling a customer on day one that their invite list had missed
 * whole categories, when in fact nobody had clicked a link yet.
 */
const UNKNOWN_COPY: Record<string, { text: string; fg: string; bg: string }> = {
  awaiting_first_response: {
    text: 'No one has opened the survey yet.', fg: BLUE, bg: BLUE_BG },
  no_eligible_respondents: {
    text: 'No one who responded belongs to a stakeholder group that is asked about this. That is a '
        + 'finding about who was engaged, not about the topic — to get a view here you have to '
        + 'invite different people.', fg: AMBER, bg: AMBER_BG },
  no_answers: {
    text: 'People were asked and none gave a view.', fg: AMBER, bg: AMBER_BG },
}

function TopicRowView({ t }: { t: TopicRow }) {
  const u = t.unknown ? (UNKNOWN_COPY[t.unknown_reason || ''] ||
                         { text: `Unknown — ${t.unknown_reason}.`, fg: AMBER, bg: AMBER_BG }) : null
  return (
    <div style={{ border: `0.5px solid ${u ? u.fg + '55' : LINE}`, borderRadius: 10,
                  padding: '12px 16px', background: u ? u.bg : '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
                    alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
          {t.topic_label} <span style={{ fontSize: 11, color: MUTE, fontWeight: 400 }}>{t.topic_code}</span>
        </div>
        <div style={{ fontSize: 11, color: MUTE, fontVariantNumeric: 'tabular-nums' }}>
          {t.subtopics_resolved} of {t.subtopics_included} sub-topics answered
          {t.subtopics_excluded > 0 && ` · ${t.subtopics_excluded} out of scope`}
        </div>
      </div>
      {u
        ? <div style={{ fontSize: 11.5, color: INK, lineHeight: 1.75, marginTop: 6 }}>
            <strong style={{ color: u.fg }}>No view from this round.</strong> {u.text}
          </div>
        : <div style={{ fontSize: 11, color: MUTE, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {t.n_answered} answers · {t.n_abstained} could not judge · {t.n_skipped} skipped
          </div>}
    </div>
  )
}

function FreeText({ agg, catName }: { agg: Agg; catName: (c: string | null | undefined) => string }) {
  const ft = agg.free_text
  const label = (c: Comment) => {
    const bits = [c.stakeholder_category ? catName(c.stakeholder_category) : null,
                  c.track ? titleise(c.track) : null].filter(Boolean)
    return bits.length ? bits.join(' · ')
      : c.respondent_type === 'organisation' ? 'An organisation' : 'An individual respondent'
  }
  const Bubble = ({ c, head }: { c: Comment; head?: string }) => (
    <div style={{ border: `0.5px solid ${LINE}`, borderRadius: 10, padding: '12px 16px' }}>
      {head && <div style={{ fontSize: 11, color: MUTE, marginBottom: 6 }}>{head}</div>}
      <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{c.comment}</div>
      <div style={{ fontSize: 10.5, color: MUTE, marginTop: 8 }}>— {label(c)}</div>
    </div>
  )

  const none = ft.closing_comments.length === 0 && ft.question_comments.length === 0

  return (
    <div style={CARD}>
      <div style={H2}>What people wrote</div>
      <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 14 }}>
        Comments are shown exactly as written. The anonymity floor withholds a group <em>label</em>,
        never the text.
      </div>

      {/* WITHHELD IS STATED, NOT SILENT. */}
      {ft.individual_comments_withheld && (
        <div style={{ background: BLUE_BG, border: `0.5px solid ${BLUE}`, borderRadius: 10,
                      padding: '12px 16px', marginBottom: 14, fontSize: 12, color: INK, lineHeight: 1.8 }}>
          <strong>Comments from individuals are being held back for now.</strong> This round holds{' '}
          {ft.individual_comment_count ?? 0}, and none is shown until there are enough of them that a
          new one arriving cannot be matched to whoever just submitted. Comments from organisations
          are shown, because those were invited by name.
        </div>
      )}

      {none ? (
        <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.7 }}>
          {ft.individual_comments_withheld
            ? 'Nothing else to show yet.'
            : 'No one has written a comment. The boxes were optional on every question.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {ft.closing_comments.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 8 }}>
                Anything else that matters ({ft.closing_comments.length})
              </div>
              <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.7, marginBottom: 10 }}>
                Scope is fixed when a round is created, so this is the only route by which something
                outside the question set reaches you.
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {ft.closing_comments.map((c, i) => <Bubble key={i} c={c} />)}
              </div>
            </div>
          )}

          {ft.question_comments.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 10 }}>
                On individual questions ({ft.question_comments.length})
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {ft.question_comments.map((c, i) => (
                  <Bubble key={i} c={c} head={`${c.short_name} · ${c.subtopic_code}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Disclosure summary="How comments are labelled, and what no rule can protect against" tone="quiet">
        <div style={{ display: 'grid', gap: 10 }}>
          {(['verbatim', 'label_rule', 'total_gate', 'what_no_floor_can_do', 'omitted', 'residual'] as const)
            .filter(k => ft.method[k])
            .map(k => <ServerNote key={k}>{ft.method[k]}</ServerNote>)}
        </div>
      </Disclosure>
    </div>
  )
}

/** Settled the moment the round is created, so it is worth showing even with no responses in. */
function ScopeSummary({ agg }: { agg: Agg }) {
  const included = agg.subtopics.filter(s => s.status === 'included')
  const excluded = agg.subtopics.filter(s => s.status !== 'included')
  return (
    <div style={CARD}>
      <div style={H2}>What this round asks about</div>
      <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8 }}>
        {included.length} of {agg.subtopics.length} sub-topics are in scope
        {agg.entity_specific.length > 0 && `, plus ${agg.entity_specific.length} entity-specific ${agg.entity_specific.length === 1 ? 'question' : 'questions'}`}.
        {agg.round.frozen_at && ' The question set is frozen — the first response locked it, so every answer in this round is to the same questions.'}
      </div>
      {excluded.length > 0 && (
        <Disclosure summary={`${excluded.length} left out, and why`} tone="quiet">
          <div style={{ display: 'grid', gap: 6 }}>
            {excluded.map(s => (
              <div key={s.subtopic_code} style={{ fontSize: 11.5, color: MID, lineHeight: 1.7 }}>
                <strong style={{ color: INK }}>{s.short_name}</strong>{' '}
                <span style={{ color: MUTE }}>{s.subtopic_code}</span>
                {s.exclusion_reason ? ` — ${s.exclusion_reason}` : ' — no reason recorded'}
              </div>
            ))}
          </div>
        </Disclosure>
      )}
    </div>
  )
}
