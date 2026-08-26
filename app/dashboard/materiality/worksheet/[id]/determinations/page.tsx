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
import { PAYWALL_HREF, PAYWALL_TITLE, PAYWALL_WORKSHEET } from '@/lib/paywallCopy'
import { supabase } from '../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../lib/useEntitlement'
import { resolveTopicLabels, isStandardVersion, type EsrsTopic } from '../../../../../../lib/materiality'
import { computeSeverity, type SeverityInput, type TopicCategory } from '../../../../../../lib/materiality/severity'
// ⚠️ dimensionScale(dim, direction) — the single resolver. This screen renders STORED values back
// as labels, which is the least obvious of the four places the direction-free scale broke: a
// positive impact scored 4 rendered as "4 · Severe" in the summary AND on the override buttons,
// describing a benefit as grave harm in the one view an auditor reads.
import { dimensionScale, NO_VISIBILITY_LABEL, type DimensionKey }
  from '../../../../../../lib/materiality/severityScale'
import { valueChainLabel, timeHorizonLabel }
  from '../../../../../../lib/materiality/impactContext'
// ⚠️ ONE CHAIN. The assignment snapshot is written only when a sub-topic is ASSIGNED, so a
// lead-only assessment has none — and the heading rendered "E1.1 E1.1". See the resolver's header.
import { subtopicHeading } from '../../../../../../lib/materiality/subtopicName'

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
  // ⚠️ PART OF THE KEY, AND CARRIED SO THE OVERRIDE CAN NAME THE ROW IT IS LOOKING AT. '' is the
  // sub-topic taken as a whole; a non-empty key is a company-named IRO beneath it (20260855). Every
  // row this screen reads today carries '' — a contributor cannot determine an IRO, because
  // impact_save_determination does not name iro_key and impact_get cannot show one — so this is
  // the same value on every row until 1c lands. It is read from the row rather than assumed so
  // that when 1c does land, saveOverride is already correct.
  iro_key: string
  nature: 'actual' | 'potential' | null
  scale: number | null; scope: number | null
  irremediability: number | null; likelihood: number | null
  abstained_dimensions: string[] | null
  value_chain_position: string[] | null; time_horizon: string | null
  rationale: string | null; status: string
  assignment_id: string | null; evidence_in_view: boolean
  override_reason: string | null; overridden_at: string | null
}
// ⚠️ iro_key IS OMITTED HERE BECAUSE THE QUERY BELOW DOES NOT SELECT IT. The snapshot table has
// the column (20260855 §2 added it to both tables), but this screen reads the snapshot only to
// print what the contributor originally said beside the override — `prior`, never a write target.
// Leaving it in the type without selecting it would have the type assert a field that arrives
// undefined at runtime.
type AssigneeDet = Omit<Det, 'status' | 'evidence_in_view' | 'override_reason' | 'overridden_at' | 'iro_key'>
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
  const isPaid = useEntitlement('double-materiality')
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
  const [displayName, setDisplayName] = useState<Record<string, string>>({})
  const [refName, setRefName] = useState<Record<string, string>>({})

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

    const [dRes, adRes, gRes, sRes, tRes, tlRes, stRes, dispRes] = await Promise.all([
      supabase.from('materiality_impact_determinations')
        // iro_key is selected because saveOverride keys on it — see the note on Det.
        .select('subtopic_code, iro_key, direction, nature, scale, scope, irremediability, likelihood, abstained_dimensions, value_chain_position, time_horizon, rationale, status, assignment_id, evidence_in_view, override_reason, overridden_at')
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
      supabase.from('mr_esrs_subtopic_display').select('subtopic_code, short_name')
        .eq('standard_version', sv),
    ])

    const err = [dRes, adRes, gRes, sRes, tRes, tlRes, stRes, dispRes].find(r => r.error)?.error
    if (err) { setLoadError(err.message); setLoading(false); return }

    setDets((dRes.data || []) as Det[])
    setAssignee((adRes.data || []) as AssigneeDet[])
    setAssignments((gRes.data || []) as Assignment[])
    setScope((sRes.data || []) as ScopeRow[])
    setTopics((tRes.data || []) as EsrsTopic[])
    setLabelRows((tlRes.data || []) as { topic_code: string; standard_version: string; label: string }[])
    const st = (stRes.data || []) as { code: string; topic_code: string; label: string }[]
    setTopicOf(Object.fromEntries(st.map(r => [r.code, r.topic_code])))
    setRefName(Object.fromEntries(st.map(r => [r.code, r.label])))
    setDisplayName(Object.fromEntries(
      ((dispRes.data || []) as { subtopic_code: string; short_name: string }[])
        .map(r => [r.subtopic_code, r.short_name])))
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

  /** The snapshot layer of the chain — present only for sub-topics assigned to a colleague. */
  const snapshot = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const s of scope) if (s.short_name) out[s.subtopic_code] = s.short_name
    return out
  }, [scope])

  const headingFor = (code: string) => subtopicHeading(code, topicOf[code] || '', {
    assignmentSnapshot: snapshot, display: displayName, reference: refName,
  })

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
      // ⚠️ ALL FIVE KEY COLUMNS. This predicate named three, and the primary key has been five
      // since 20260855 — so it matched the sub-topic's own row AND every named IRO beneath it,
      // writing the lead's values and the lead's override reason across all of them, snapshotting
      // each one on the way past. `.select('subtopic_code')` would come back with several rows and
      // the length check below would pass. An UPDATE, so it never raised 42P10 the way the upsert
      // on the determine screen did: it was silently correct only while no IRO existed.
      //
      // iro_key COMES FROM THE ROW BEING EDITED, never a literal ''. Every row reachable here
      // carries '' today — the override button needs `assignment_id`, and a contributor cannot
      // determine an IRO — but 20260856 §7 already tells a lead to override rather than delete an
      // IRO's submitted determination, and 1c makes that ordinary. A literal would send the
      // override to the parent row instead, and report success.
      //
      // ⚠️ axis IS A LITERAL, DELIBERATELY, AND WILL NEED THE SAME TREATMENT AS iro_key WHEN THE
      // FINANCIAL AXIS LANDS. This screen is the impact worksheet and nothing writes
      // axis = 'financial' yet, so a wrong literal here fails loudly and immediately — the update
      // matches nothing and the no-rows branch below says so. Once a financial-axis determination
      // exists, key this on the row too; leaving it a literal at that point makes it the same
      // silent cross-axis write this comment describes.
      .eq('assessment_id', assessmentId)
      .eq('subtopic_code', override.det.subtopic_code)
      .eq('axis', 'impact')
      .eq('direction', override.det.direction)
      .eq('iro_key', override.det.iro_key)
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
    <Shell><PaywallCard title={PAYWALL_TITLE}
      body={PAYWALL_WORKSHEET}
      href={PAYWALL_HREF} /></Shell>
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
          <div style={{ marginTop: 8 }}>
            <strong>Where an impact happens and over what period are recorded, not required.</strong>{' '}
            Neither is part of the severity calculation and neither is checked when a determination
            is submitted, so a determination can be complete and material with neither answered. A
            blank below is a blank, not a gap in the work.
          </div>
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
                  {/* ⚠️ The code renders ONCE. Where no name is known it stands alone rather than
                      being printed beside itself, which is what "E1.1 E1.1" was. */}
                  <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                    {headingFor(code).title}
                    {headingFor(code).code && (
                      <span style={{ fontSize: 11, color: MUTE, fontWeight: 400 }}> {headingFor(code).code}</span>
                    )}
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

      {/* ── WHERE IT HAPPENS, AND OVER WHAT PERIOD ────────────────────────────────────────────
          Recorded on every determination since 20260838 and displayed nowhere until 21 Aug 2026.
          This is the audit surface, so both are stated whether or not they were answered.

          ⚠️ AN ABSENCE HERE IS NOT A DEFICIENCY, and the note under the heading above says so once
          rather than this block hedging on every row. The submit RPC validates direction, nature,
          the four dimension ranges, the ¶41 rules and the assignment — and NOT these two. A
          determination can be complete, material and carry neither.

          ⚠️ TWO DIFFERENT ABSENT VALUES, ONE MEANING. value_chain_position is `{}` (text[] NOT NULL
          DEFAULT '{}') and time_horizon is NULL, so the code must test them differently — but both
          denote the same fact, that nothing was recorded, and both forms clear back to the empty
          value when a contributor deselects. Wording them differently would assert a distinction
          that does not exist. Same string, deliberately, and it is valueText's own string for the
          same meaning a few lines below.

          ⚠️ LABELS, NEVER CODES. valueChainLabel/timeHorizonLabel return null for an unrecognised
          code rather than falling back to it, so a stale code cannot reach a reader as "upstream". */}
      <div style={{ fontSize: 11.5, color: MUTE, marginTop: 10, lineHeight: 1.8 }}>
        <div>
          <span style={{ color: MID }}>Where it happens:</span>{' '}
          {(d.value_chain_position || []).length > 0
            ? (d.value_chain_position || [])
                .map(c => valueChainLabel(c))
                .filter((l): l is string => l !== null)
                .join(' · ')
            : '— not answered'}
        </div>
        <div>
          <span style={{ color: MID }}>Over what period:</span>{' '}
          {timeHorizonLabel(d.time_horizon) ?? '— not answered'}
        </div>
      </div>

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
