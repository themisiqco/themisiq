'use client'

/**
 * Impact worksheet — what came back, and the override. Screen C (and D, which is not a screen).
 *
 * ⚠️ THE OVERRIDE IS AN INTERACTION HERE, NOT ITS OWN ROUTE. An override always happens while
 * reading one determination, and routing away would lose the comparison at the moment it matters
 * most — what the expert concluded, beside what you are about to put there. A separate route would
 * also let someone reach the override form without the thing being overridden on screen.
 *
 * ⚠️ SEVERITY IS DERIVED HERE AND STORED NOWHERE. computeSeverity() is the single authority; no
 * severity column exists and none may be added. The figure and the rule claimed for it cannot
 * disagree if there is only one place the figure exists — the applyResolutions() argument.
 *
 * ⚠️ AND THE SCREEN SHOWS WHICH RULE DECIDED. For a social topic severity is the MAX of the three
 * (ESRS 1 ¶40) and the top-band override is therefore SUBSUMED — it cannot have decided anything,
 * because the maximum already clears the threshold. A screen that said "escalated because one
 * dimension was Severe" about a social row would be claiming something that did not happen, so
 * 'subsumed_override' gets a sentence that states the fact and denies the inference.
 *
 * THE LEAD IS THE ONLY AUDIENCE. This is the side of the firewall where the survey evidence lives.
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../../components/Nav'
import PaywallCard from '../../../../../components/PaywallCard'
import { supabase } from '../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../lib/useEntitlement'
import { resolveTopicLabels, isStandardVersion, type EsrsTopic } from '../../../../../../lib/materiality'
import { computeSeverity, type SeverityInput, type TopicCategory } from '../../../../../../lib/materiality/severity'
// ⚠️ dimensionScale(dim, direction) — the single resolver. This screen renders STORED values back
// as labels, which is the least obvious of the four places the direction-free scale broke: a
// positive impact scored 4 rendered as "4 · Severe" in the summary AND on the override buttons,
// describing a benefit as grave harm in the one view an auditor reads.
import { dimensionScale, NO_VISIBILITY_LABEL, worksheetSubtopicHeading, type DimensionKey }
  from '../../../../../../lib/materiality/severityScale'

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

type Direction = 'negative' | 'positive'
type Det = {
  subtopic_code: string; direction: Direction
  nature: 'actual' | 'potential' | null
  scale: number | null; scope: number | null
  irremediability: number | null; likelihood: number | null
  abstained_dimensions: string[] | null
  value_chain_position: string[] | null; time_horizon: string | null
  rationale: string | null; status: string
  assignment_id: string | null; evidence_in_view: boolean
  override_reason: string | null; overridden_at: string | null
}
type AssigneeDet = Omit<Det, 'status' | 'evidence_in_view' | 'override_reason' | 'overridden_at'>
type Assignment = { id: string; contributor_name: string | null; contributor_email: string | null
                    contributor_role: string | null; status: string; revoked_at: string | null }
type ScopeRow = { subtopic_code: string; short_name: string | null; assignment_id: string }

const DIMS = ['scale', 'scope', 'irremediability', 'likelihood'] as const
type Dim = DimensionKey

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

/**
 * ⚠️ THE RULE, IN WORDS. Four values, four sentences, and the fourth is the one that matters:
 * it states that a dimension was at the top band AND denies that this decided anything, because
 * under max it cannot have.
 */
const RULE_TEXT: Record<string, string> = {
  mean: 'the average of the three',
  override: 'escalated because one dimension was scored at the top band — the average alone was below the threshold',
  max: 'social topic: the highest of the three, not the average (ESRS 1 ¶40 — severity takes precedence over likelihood)',
  subsumed_override:
    'social topic: the highest of the three (ESRS 1 ¶40). One dimension was scored at the top band; '
  + 'on this rule that changes nothing, because the maximum is already 4.',
}

export default function Determinations() {
  const isPaid = useEntitlement('climate-risk')
  const params = useParams()
  const assessmentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [company, setCompany] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [dets, setDets] = useState<Det[]>([])
  const [assignee, setAssignee] = useState<AssigneeDet[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [scope, setScope] = useState<ScopeRow[]>([])
  const [topics, setTopics] = useState<EsrsTopic[]>([])
  const [labelRows, setLabelRows] = useState<{ topic_code: string; standard_version: string; label: string }[]>([])
  const [topicOf, setTopicOf] = useState<Record<string, string>>({})

  const [override, setOverride] = useState<{ det: Det; patch: Partial<Det>; reason: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => { load() }, [assessmentId])

  const load = async () => {
    setLoading(true); setLoadError(null)

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

    const [dRes, adRes, gRes, sRes, tRes, tlRes, stRes] = await Promise.all([
      supabase.from('materiality_impact_determinations')
        .select('subtopic_code, direction, nature, scale, scope, irremediability, likelihood, abstained_dimensions, value_chain_position, time_horizon, rationale, status, assignment_id, evidence_in_view, override_reason, overridden_at')
        .eq('assessment_id', assessmentId),
      supabase.from('materiality_impact_assignee_determinations')
        .select('subtopic_code, direction, nature, scale, scope, irremediability, likelihood, abstained_dimensions, value_chain_position, time_horizon, rationale, assignment_id')
        .eq('assessment_id', assessmentId),
      supabase.from('materiality_impact_assignments')
        .select('id, contributor_name, contributor_email, contributor_role, status, revoked_at')
        .eq('assessment_id', assessmentId),
      supabase.from('materiality_impact_assignment_subtopics')
        .select('subtopic_code, short_name, assignment_id').eq('assessment_id', assessmentId),
      supabase.from('mr_esrs_topics').select('code, label, category, sort_order').order('sort_order'),
      supabase.from('mr_esrs_topic_labels').select('topic_code, standard_version, label')
        .eq('standard_version', sv),
      supabase.from('mr_esrs_subtopics').select('code, topic_code, label').eq('standard_version', sv),
    ])

    const err = [dRes, adRes, gRes, sRes, tRes, tlRes, stRes].find(r => r.error)?.error
    if (err) { setLoadError(err.message); setLoading(false); return }

    setDets((dRes.data || []) as Det[])
    setAssignee((adRes.data || []) as AssigneeDet[])
    setAssignments((gRes.data || []) as Assignment[])
    setScope((sRes.data || []) as ScopeRow[])
    setTopics((tRes.data || []) as EsrsTopic[])
    setLabelRows((tlRes.data || []) as { topic_code: string; standard_version: string; label: string }[])
    setTopicOf(Object.fromEntries(((stRes.data || []) as { code: string; topic_code: string }[])
      .map(r => [r.code, r.topic_code])))
    setLoading(false)
  }

  const nameOf = (id: string | null) => {
    if (!id) return 'you'
    const a = assignments.find(x => x.id === id)
    return a ? (a.contributor_name || a.contributor_email || 'an unnamed contributor') : 'a former contributor'
  }
  const assignmentOf = (id: string | null) => assignments.find(x => x.id === id) || null

  /** Category drives the human-rights rule. ⚠️ From mr_esrs_topics.category, never from the code. */
  const categoryOf = useMemo<Record<string, string>>(
    () => Object.fromEntries(topics.map(t => [t.code, (t as EsrsTopic & { category: string }).category])),
    [topics])

  const topicLabel = useMemo<Record<string, string>>(() => {
    const resolved = resolveTopicLabels(
      topics, labelRows, version && isStandardVersion(version) ? version : null).topics
    const seen: Record<string, number> = {}
    for (const t of resolved) seen[t.label] = (seen[t.label] ?? 0) + 1
    return Object.fromEntries(
      resolved.map(t => [t.code, seen[t.label] > 1 ? `${t.label} (${t.code})` : t.label]))
  }, [topics, labelRows, version])

  const shortOf = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const s of scope) if (s.short_name) out[s.subtopic_code] = s.short_name
    return out
  }, [scope])

  /** Every sub-topic that has either an assignment or a determination, grouped by topic. */
  const groups = useMemo(() => {
    const codes = new Set<string>([...scope.map(s => s.subtopic_code), ...dets.map(d => d.subtopic_code)])
    const byTopic: Record<string, string[]> = {}
    for (const c of codes) (byTopic[topicOf[c] || '__other'] ||= []).push(c)
    const sort = Object.fromEntries(topics.map(t => [t.code, t.sort_order ?? 99]))
    return Object.entries(byTopic)
      .map(([code, list]) => ({ code, label: topicLabel[code] ?? code, codes: list.sort() }))
      .sort((a, b) => (sort[a.code] ?? 99) - (sort[b.code] ?? 99))
  }, [scope, dets, topicOf, topics, topicLabel])

  const det = (code: string, dir: Direction) =>
    dets.find(d => d.subtopic_code === code && d.direction === dir) || null
  const asgn = (code: string, dir: Direction) =>
    assignee.find(d => d.subtopic_code === code && d.direction === dir) || null
  const ownerOf = (code: string) => scope.find(s => s.subtopic_code === code)?.assignment_id ?? null

  const saveOverride = async () => {
    if (!override) return
    setSaving(true); setSaveError(null)
    const { data, error } = await supabase.from('materiality_impact_determinations')
      .update({ ...override.patch, override_reason: override.reason })
      .eq('assessment_id', assessmentId)
      .eq('subtopic_code', override.det.subtopic_code)
      .eq('direction', override.det.direction)
      .select('subtopic_code')
    setSaving(false)
    // The trigger's own sentence, printed as given. It already explains the reason requirement and
    // the refusals better than any wrapper here could.
    if (error) { setSaveError(error.message); return }
    if (!data || data.length === 0) {
      setSaveError('Nothing was changed, and the server gave no reason. Your edit was not saved.')
      return
    }
    setOverride(null)
    await load()
  }

  if (isPaid === false) return (
    <Shell><PaywallCard title="Unlock the Climate Risk module"
      body="The impact worksheet is part of the Climate Risk &amp; Materiality module."
      href="/pricing?modules=risk" /></Shell>
  )
  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav /><div style={{ textAlign: 'center', padding: '4rem', color: MUTE }}>Loading determinations…</div>
    </div>
  )
  if (loadError) return (
    <Shell><div style={CARD}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 10 }}>
        These could not be shown</div>
      <div style={{ fontSize: 13.5, color: MID, lineHeight: 1.75 }}>{loadError}</div>
    </div></Shell>
  )

  const submitted = dets.filter(d => d.status === 'submitted').length
  const overridden = dets.filter(d => d.overridden_at).length

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/dashboard/materiality/worksheet" style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← All worksheets</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Assign and chase</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}/determine`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Your own determinations</Link>
        </div>

        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>
          {company || 'Determinations'}
        </div>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 4, marginBottom: 20 }}>
          {submitted} submitted{overridden > 0 && ` · ${overridden} superseded by you`}
        </div>

        <div style={{ background: BLUE_BG, border: `0.5px solid ${BLUE}`, borderRadius: 12,
                      padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
          <strong>Severity is calculated here, not stored.</strong> It is derived from the three
          judgements each time this page is drawn, so the figure and the rule behind it cannot come
          apart. Each one below says which rule decided it.
        </div>

        {groups.map(g => (
          <div key={g.code} style={{ marginBottom: 26 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: INK,
                          paddingBottom: 6, borderBottom: `1px solid ${LINE}`, marginBottom: 12 }}>
              {g.label} <span style={{ fontSize: 11, color: MUTE }}>{g.code}</span>
            </div>

            {g.codes.map(code => (
              <div key={code} style={{ ...CARD, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
                              alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                    {worksheetSubtopicHeading(shortOf[code] || code, topicOf[code] || '')}
                    <span style={{ fontSize: 11, color: MUTE, fontWeight: 400 }}> {code}</span>
                  </div>
                  <AssigneeChip a={assignmentOf(ownerOf(code))} name={nameOf(ownerOf(code))} />
                </div>

                {(['negative', 'positive'] as Direction[]).map(dir => (
                  <DeterminationRow
                    key={dir}
                    dir={dir}
                    d={det(code, dir)}
                    prior={asgn(code, dir)}
                    category={(categoryOf[topicOf[code]] as TopicCategory) || 'env'}
                    contributor={nameOf(det(code, dir)?.assignment_id ?? ownerOf(code))}
                    onOverride={d => { setSaveError(null); setOverride({ det: d, patch: {}, reason: '' }) }}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}

        {groups.length === 0 && (
          <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 10 }}>
              Nothing assigned yet
            </div>
            <div style={{ fontSize: 13, color: MID, lineHeight: 1.8 }}>
              Determinations appear here as they are made. Start by dividing the sub-topics on the{' '}
              <Link href={`/dashboard/materiality/worksheet/${assessmentId}`} style={{ color: PURPLE }}>assign screen</Link>.
            </div>
          </div>
        )}
      </div>

      {override && (
        <OverridePanel
          state={override} setState={setOverride}
          contributor={nameOf(override.det.assignment_id)}
          saving={saving} error={saveError}
          onSave={saveOverride} onCancel={() => { setOverride(null); setSaveError(null) }}
        />
      )}
    </div>
  )
}

// ── one direction ────────────────────────────────────────────────────────────────────────────────

function DeterminationRow({ dir, d, prior, category, contributor, onOverride }: {
  dir: Direction; d: Det | null; prior: AssigneeDet | null
  category: TopicCategory; contributor: string
  onOverride: (d: Det) => void
}) {
  const harm = dir === 'negative'

  if (!d || !d.nature) return (
    <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12, marginTop: 12,
                  fontSize: 12.5, color: MUTE, lineHeight: 1.7 }}>
      <strong style={{ color: MID }}>{harm ? 'As a harm' : 'As a benefit'}</strong> — not determined
      yet. {contributor === 'you' ? 'This one is yours — it is on your own determinations screen.' : `Waiting on ${contributor}.`}
    </div>
  )

  const input: SeverityInput = {
    direction: dir, nature: d.nature, category,
    scale: d.scale, scope: d.scope,
    irremediability: d.irremediability, likelihood: d.likelihood,
  }
  const sev = computeSeverity(input)

  return (
    <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14, marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
                    alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: harm ? INK : GREEN }}>
          {harm ? 'As a harm' : 'As a benefit'}
          <span style={{ fontWeight: 400, color: MUTE, marginLeft: 8 }}>
            {d.nature === 'actual' ? 'already happening' : 'could happen'}
          </span>
        </div>
        {d.status === 'submitted'
          ? <Chip text="SUBMITTED" fg={GREEN} bg={GREEN_BG} />
          : <Chip text="DRAFT" fg={MUTE} bg={PAPER} />}
      </div>

      {/* ⚠️ INCOMPLETE IS SAID, NOT SCORED. computeSeverity returns complete:false with a null
          severity and the dimensions that are missing; a partial average would look like a real
          figure and would be systematically low. */}
      {!sev.complete ? (
        <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                      padding: '11px 14px', fontSize: 12.5, color: INK, lineHeight: 1.8 }}>
          <strong>No severity — this determination is incomplete.</strong> Still to be judged:{' '}
          {sev.missing.join(', ')}. Nothing is assumed for a dimension nobody has answered.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap',
                      marginBottom: 10 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem',
                        color: sev.material ? PURPLE : INK }}>
            {sev.severity.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: MID, lineHeight: 1.7, flex: 1, minWidth: 220 }}>
            <strong style={{ color: sev.material ? PURPLE : MID }}>
              {sev.material ? 'Material' : 'Below the threshold'}
            </strong>{' — '}{RULE_TEXT[sev.rule] || sev.rule}
          </div>
        </div>
      )}

      <Dims d={d} basis={sev.basis} />

      {d.likelihood !== null && (
        <div style={{ fontSize: 11.5, color: MUTE, marginTop: 6 }}>
          Likelihood {d.likelihood} of 4 — recorded, and not folded into the figure above: the
          weighting has not been set, so nothing is applied rather than a number being invented.
        </div>
      )}

      {d.rationale && (
        <div style={{ background: PAPER, borderRadius: 8, padding: '10px 13px', marginTop: 10,
                      fontSize: 12.5, color: INK, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          “{d.rationale}”
          <div style={{ fontSize: 10.5, color: MUTE, marginTop: 6 }}>— {contributor}</div>
        </div>
      )}

      {/* ⚠️ WHETHER THE SURVEY EVIDENCE WAS IN VIEW. False on every delegated determination by
          constraint, and it is stated rather than assumed: the divergence register depends on this
          being true only where it is true. */}
      <div style={{ fontSize: 11, color: MUTE, marginTop: 10, lineHeight: 1.7 }}>
        {d.evidence_in_view
          ? 'Made with the stakeholder survey results in view.'
          : d.assignment_id
            ? `Made by ${contributor} without the survey results — contributors do not see them.`
            : 'Made without the survey results in view.'}
      </div>

      {/* ── the override record, permanent once it exists ─────────────────────────────────── */}
      {d.overridden_at && prior && (
        <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                      padding: '12px 14px', marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 8 }}>
            You superseded this on {fmt(d.overridden_at)}
          </div>
          <div style={{ fontSize: 12, color: MID, lineHeight: 1.8, marginBottom: 8 }}>
            <strong>{contributor} determined:</strong>{' '}
            {DIMS.filter(k => k !== 'likelihood' || prior.nature === 'potential')
                 .filter(k => k !== 'irremediability' || d.direction === 'negative')
                 .map(k => `${k} ${valueText(prior, k)}`).join(' · ')}
          </div>
          <div style={{ fontSize: 12, color: INK, lineHeight: 1.8 }}>
            <strong>Your reason:</strong> {d.override_reason}
          </div>
        </div>
      )}

      {/* ⚠️ THE ASYMMETRY. A contributor's submitted determination costs a written defence to
          change; your own costs nothing, because no expert's judgement is being set aside. */}
      {d.status === 'submitted' && d.assignment_id && (
        <button onClick={() => onOverride(d)}
                style={{ marginTop: 12, fontSize: 12, padding: '7px 14px', borderRadius: 8,
                         border: `1px solid ${LINE}`, background: '#fff', color: MID, cursor: 'pointer' }}>
          {d.overridden_at ? 'Change it again' : 'Record a different determination'}
        </button>
      )}
    </div>
  )
}

/** A dimension's value in words: a score, a recorded abstention, or nothing yet. Never a blank. */
function valueText(d: { [k: string]: unknown; abstained_dimensions?: string[] | null }, k: Dim): string {
  const v = d[k] as number | null
  if (v !== null && v !== undefined) return `${v}`
  if ((d.abstained_dimensions || []).includes(k)) return '— could not judge'
  return '— not answered'
}

function Dims({ d, basis }: { d: Det; basis: readonly string[] }) {
  // Resolved against THIS determination's direction, so a benefit never borrows harm's words.
  const shown = DIMS.filter(k =>
    basis.includes(k) || (k === 'likelihood' && d.nature === 'potential'))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
      {shown.map(k => {
        const v = d[k] as number | null
        const abstained = (d.abstained_dimensions || []).includes(k)
        const point = v !== null
          ? dimensionScale(k, d.direction).points.find(p => p.value === v) : null
        return (
          <div key={k} style={{ background: PAPER, border: `0.5px solid ${LINE}`, borderRadius: 8,
                                padding: '8px 11px' }}>
            <div style={{ fontSize: 10, color: MUTE, textTransform: 'capitalize' }}>{k}</div>
            <div style={{ fontSize: 12.5, color: abstained ? AMBER : INK, fontWeight: 600, marginTop: 2 }}>
              {/* ⚠️ AN ABSTENTION READS AS AN ANSWER, NOT AS A GAP (§6.1). Never a zero, never a low,
                  and never an empty cell that looks like nobody got to it. */}
              {abstained ? NO_VISIBILITY_LABEL : v !== null ? `${v} · ${point?.label || ''}`.replace(/ · $/, '') : 'Not answered'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── the override ─────────────────────────────────────────────────────────────────────────────────

function OverridePanel({ state, setState, contributor, saving, error, onSave, onCancel }: {
  state: { det: Det; patch: Partial<Det>; reason: string }
  setState: (s: { det: Det; patch: Partial<Det>; reason: string }) => void
  contributor: string; saving: boolean; error: string | null
  onSave: () => void; onCancel: () => void
}) {
  const d = state.det
  const merged = { ...d, ...state.patch }
  const dims = DIMS.filter(k =>
    (k !== 'irremediability' || d.direction === 'negative') &&
    (k !== 'likelihood' || merged.nature === 'potential'))

  const set = (k: Dim, v: number | null) => setState({
    ...state,
    patch: {
      ...state.patch,
      [k]: v,
      abstained_dimensions: v === null
        ? [...(merged.abstained_dimensions || []).filter(x => x !== k), k]
        : (merged.abstained_dimensions || []).filter(x => x !== k),
    },
  })

  const changed = dims.some(k => (merged[k] as number | null) !== (d[k] as number | null))
    || JSON.stringify(merged.abstained_dimensions || []) !== JSON.stringify(d.abstained_dimensions || [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', display: 'flex',
                  alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1.5rem',
                  overflowY: 'auto', zIndex: 60 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '1.8rem', maxWidth: 640, width: '100%' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 8 }}>
          Record a different determination
        </div>
        <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 16 }}>
          {contributor}’s determination is kept exactly as they made it, and both appear in the
          report. Your reason appears beside them.
        </div>

        {dims.map(k => (
          <div key={k} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 2,
                          textTransform: 'capitalize' }}>{k}</div>
            <div style={{ fontSize: 11, color: MUTE, marginBottom: 6 }}>
              {contributor} said: {valueText(d, k)}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {dimensionScale(k, d.direction).points.map(p => {
                const on = (merged[k] as number | null) === p.value
                return (
                  <button key={p.value} onClick={() => set(k, p.value)} title={p.body}
                          style={{ fontSize: 12, padding: '7px 13px', borderRadius: 8,
                                   border: `1px solid ${on ? PURPLE : LINE}`,
                                   background: on ? '#f4ecfe' : '#fff', color: on ? PURPLE : MID,
                                   cursor: 'pointer', fontWeight: on ? 600 : 400 }}>
                    {p.value}{p.label && ` · ${p.label}`}
                  </button>
                )
              })}
              <button onClick={() => set(k, null)}
                      style={{ fontSize: 12, padding: '7px 13px', borderRadius: 8,
                               border: `1px solid ${(merged.abstained_dimensions || []).includes(k) ? PURPLE : LINE}`,
                               background: (merged.abstained_dimensions || []).includes(k) ? '#f4ecfe' : '#fff',
                               color: (merged.abstained_dimensions || []).includes(k) ? PURPLE : MID,
                               cursor: 'pointer' }}>
                — {NO_VISIBILITY_LABEL}
              </button>
            </div>
          </div>
        ))}

        {/* ⚠️ REQUIRED, AND THE TRIGGER IS THE AUTHORITY. The button disables as a courtesy; the
            refusal that matters comes from the database and is printed verbatim below. */}
        <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 6 }}>
          Why are you changing it? <span style={{ color: FAIL }}>Required</span>
        </div>
        <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.7, marginBottom: 8 }}>
          This is printed in the report beside {contributor}’s determination. Accepting an expert’s
          judgement costs nothing; departing from it is recorded.
        </div>
        <textarea value={state.reason} rows={3}
                  onChange={e => setState({ ...state, reason: e.target.value })}
                  style={{ width: '100%', fontSize: 12.5, lineHeight: 1.7, padding: '10px 12px',
                           borderRadius: 10, border: `1px solid ${LINE}`, color: INK,
                           fontFamily: 'inherit', resize: 'vertical' }} />

        {error && (
          <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10,
                        padding: '11px 14px', marginTop: 12, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onCancel} disabled={saving}
                  style={{ fontSize: 13, padding: '9px 18px', borderRadius: 8,
                           border: `1px solid ${LINE}`, background: '#fff', color: MID, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onSave} disabled={saving || !changed || !state.reason.trim()}
                  style={{ fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8,
                           border: 'none', background: INK, color: '#fff',
                           cursor: 'pointer', opacity: (!changed || !state.reason.trim()) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Record it'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssigneeChip({ a, name }: { a: Assignment | null; name: string }) {
  const revoked = a?.status === 'revoked'
  return (
    <div style={{ fontSize: 11.5, color: revoked ? MUTE : MID, textAlign: 'right' }}>
      {name}
      {/* ⚠️ ACCESS WITHDRAWN, NOT THE DETERMINATION. A reader who sees "revoked" beside a figure
          will otherwise assume the figure was retracted. */}
      {revoked && <span style={{ display: 'block', fontSize: 10.5 }}>
        access withdrawn {fmt(a?.revoked_at ?? null)} — their determinations stand
      </span>}
    </div>
  )
}

const Chip = ({ text, fg, bg }: { text: string; fg: string; bg: string }) => (
  <span style={{ background: bg, color: fg, border: `0.5px solid ${fg}33`, borderRadius: 999,
                 padding: '2px 9px', fontSize: 10.5, fontWeight: 600 }}>{text}</span>
)

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
    <Nav />
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>{children}</div>
  </div>
)
