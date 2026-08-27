'use client'

/**
 * The board paper — assemble it, and hand it over as a PDF.
 *
 * ⚠️ NOT A PREVIEW. This page does not render the report. A preview is a second renderer of the
 * same content, free to drift from the one that produces the artefact, and the artefact is what a
 * board actually reads — the lib/ghg/engine.ts rule CLAUDE.md carries, one document along. What is
 * on screen is a short statement of what the paper contains and what it drew on, so somebody can
 * see whether it is worth generating before they generate it.
 *
 * ⚠️ THE FETCH IS THE REGISTER SCREEN'S, DELIBERATELY.
 * app/dashboard/materiality/worksheet/[id]/register/page.tsx already reads exactly this data and
 * already handles its absence states correctly. This follows it closely rather than opening a
 * second path to the same rows: two fetches of one dataset is two chances to disagree about scope,
 * and the register and the report must never describe different work.
 *
 * ⚠️ THE ENTITLEMENT GATE IS INHERITED AND IS EXPECTED TO CHANGE.
 * useEntitlement('double-materiality') is what the worksheet routes use, and this route sits under
 * /dashboard/stakeholder — the first page of a module being split out with its own entitlement.
 * When that split lands, this gate changes with it. It is written the same way as its siblings so
 * that change is one edit in an obvious place, not an archaeology exercise.
 *
 * ⚠️ WHICH STATUS COUNTS AS "OPENED" IS DECIDED HERE, ONCE.
 * lib/materiality/boardReport.ts takes invited / opened / answered from the caller on purpose: it
 * is a reading of the instrument, not a fact about the data, and it must not be made differently
 * in two places. The reading is the survey screen's own — see the note above participationOf().
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../components/Nav'
import PaywallCard from '../../../../components/PaywallCard'
import { PAYWALL_HREF, PAYWALL_STAKEHOLDER_REPORT, PAYWALL_TITLE } from '@/lib/paywallCopy'
import { supabase } from '../../../../../lib/supabase'
import { useEntitlement } from '../../../../../lib/useEntitlement'
import { resolveSubtopicName } from '../../../../../lib/materiality/subtopicName'
import { formatPeriodSpan, formatReportDate } from '../../../../../lib/reportDates'
import { finalisationStamp, type FinalisationLatest }
  from '../../../../../lib/materiality/finalisation'
import { NOT_FINALISED_NOTE, type RoadmapRequirementRow }
  from '../../../../../lib/materiality/boardReport'
import type { TopicCategory } from '../../../../../lib/materiality/severity'
import { buildBoardReport, standardVersionLabel,
         type BoardReportInput, type CategoryParticipation, type ContrastEntry,
         type ThresholdRow }
  from '../../../../../lib/materiality/boardReport'
/**
 * ⚠️ generateBoardReportPDF IS NOT IMPORTED HERE. It is loaded on demand inside download().
 *
 * Its import graph reaches lib/pdf/layout.ts, and through that lib/fonts/charis.ts (163.8 KB) and
 * lib/pdf/logo.ts (68.7 KB) — around 232 KB of base64 before jsPDF itself. A static import puts
 * every byte of that in the bundle for everyone who opens this page, and most people who open it
 * open it to find out whether the paper is READY. That question is answered entirely by
 * buildBoardReport's input and needs no font, no wordmark and no PDF engine.
 *
 * buildBoardReport stays static, and that was checked rather than assumed: boardReport.ts imports
 * only ./severity and ./register, and severity.ts imports nothing at all. Nothing in that graph
 * carries a payload, and this page uses its output to describe what the paper contains.
 */
import type { Determination, Overall, RegisterSubTopic }
  from '../../../../../lib/materiality/register'

const PURPLE = '#7425e3'
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

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
    <Nav />
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>{children}</div>
  </div>
)

type AggSub = {
  subtopic_code: string; topic_code: string; topic_label: string
  short_name: string | null
  status: string; exclusion_reason: string | null
  overall: Overall | null
}
/**
 * Only the parts of survey_aggregate this page reads. The shapes are
 * app/dashboard/materiality/survey/[id]/results/page.tsx's, which declares the whole payload and is
 * the authority for it — copied, not recalled.
 *
 * ⚠️ ContrastEntry IS IMPORTED FROM THE MODULE, NOT REDECLARED. The results screen declares its own
 * because it renders the payload directly; a third declaration here would be the drift problem this
 * codebase has spent the day closing. The two shapes are identical but for one field: the results
 * screen types `distribution` as always present, while the module allows null — which is what
 * survey_aggregate can actually emit for a side nobody answered, and what the renderer guards on.
 * The more permissive type is the safer one to cast untyped RPC data into.
 */
type Agg = {
  method: {
    dispersion: { method: string; definition: string
                  agreement_coefficient: number | null; agreement_coefficient_note: string }
    /** Snapshotted onto the round at creation. Values are unknown-typed in the payload. */
    thresholds: Record<string, unknown> & { source: string }
  }
  subtopics: AggSub[]
  s1_s2_contrast: { what_this_is: string; what_this_is_not: string; entries: ContrastEntry[] }
}

type Det = {
  subtopic_code: string
  /**
   * Which unit under the sub-topic this row is. '' is the sub-topic taken as a whole; a non-empty
   * value names a company-defined IRO (20260855). SELECTED, not defaulted: until 25 Aug 2026 the
   * query omitted it, so every IRO determination arrived indistinguishable from its parent's own
   * row — see the assembly note below for what that cost.
   */
  iro_key: string
  direction: 'negative' | 'positive'
  nature: 'actual' | 'potential' | null
  scale: number | null; scope: number | null
  irremediability: number | null; likelihood: number | null
  /**
   * ⚠️ SELECTED SINCE 20260841 AND UNDECLARED UNTIL 27 Aug 2026 — the shape of the defect, twice.
   * The query above already asked for this column; the type did not name it, so the mapping below
   * dropped it and computeSeverity could not tell a dimension the assessor DECLINED from one nobody
   * reached. A field fetched and untyped is a field silently discarded.
   */
  abstained_dimensions: string[] | null
  status: string
}

/**
 * A row of materiality_custom_iros — the ONLY place a named IRO's name exists.
 * materiality_impact_determinations carries iro_key and no name, deliberately: 20260855 keeps the
 * name off the key so renaming an IRO mid-assessment does not move its determinations.
 */
type IroRow = { subtopic_code: string; iro_key: string; name: string }

type Person = {
  stakeholder_category: string
  status: 'invited' | 'in_progress' | 'completed' | 'revoked' | 'expired'
}

/**
 * The unit a determination belongs to: a sub-topic AND which IRO under it. '' is the sub-topic
 * taken as a whole. `|` is unambiguous as a separator — iro_key is checked `^[a-z0-9][a-z0-9-]*$`
 * by 20260855 and cannot contain one.
 */
const unitKey = (subtopicCode: string, iroKey: string) => `${subtopicCode}|${iroKey}`

/**
 * The name shown for a determination whose iro_key has no row in materiality_custom_iros.
 *
 * ⚠️ AN EXPLICIT STRING, NEVER null. lib/materiality/register.ts:412 sets Carrier.name from
 * short_name and boardReportPdf.ts:294 renders `c.name ?? c.iro_key`, so null would put the raw
 * machine slug into a board paper. The entry and its determinations are KEPT either way — dropping
 * an orphan would silently remove a carrier that may be what made the topic material.
 *
 * Says what was observed, not why. The name row may have been deleted mid-assessment (20260856
 * carries a delete path) or be invisible under RLS; this cannot tell those apart and does not guess.
 */
const orphanIroName = (iroKey: string) => `Unnamed issue (${iroKey})`

const isCategory = (v: unknown): v is TopicCategory =>
  v === 'env' || v === 'soc' || v === 'gov'

/**
 * Invited / opened / answered, from respondent status.
 *
 * ⚠️ THE SAME READING THE SURVEY SCREEN USES, AND THAT IS THE POINT OF PUTTING IT HERE.
 *   invited  — everyone still on the list. Revoked and expired invitations are excluded: they are
 *              people who were never able to take part, and counting them makes the response rate
 *              look worse than the exercise was.
 *   opened   — started or finished. "in_progress" means the link was opened.
 *   answered — finished and submitted.
 *
 * Someone who opened the survey and answered nothing counts as opened and not as answered, which is
 * exactly what those two numbers are for.
 */
const participationOf = (people: Person[], label: (code: string) => string) => {
  const active = people.filter(p => p.status !== 'revoked' && p.status !== 'expired')
  const count = (rows: Person[]) => ({
    invited: rows.length,
    opened: rows.filter(p => p.status === 'in_progress' || p.status === 'completed').length,
    answered: rows.filter(p => p.status === 'completed').length,
  })

  const byCategory: Record<string, Person[]> = {}
  for (const p of active) (byCategory[p.stakeholder_category] ||= []).push(p)

  const by_category: CategoryParticipation[] = Object.entries(byCategory)
    // ⚠️ RESOLVED HERE, because CategoryParticipation.category is documented as already-resolved
    // display text. An unlabelled code prints AS the code — never blank, and never a label this
    // page invented for it.
    .map(([code, rows]) => ({ category: label(code), ...count(rows) }))
    .sort((a, b) => b.invited - a.invited)

  return { totals: count(active), by_category }
}

export default function StakeholderBoardReport() {
  // See the header: inherited from the worksheet routes, expected to change when this module gets
  // its own entitlement.
  const isPaid = useEntitlement('double-materiality')
  const params = useParams()
  const assessmentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // 'loading' is the chunk arriving; 'building' is the document being assembled. They are separate
  // because they fail differently and a reader waiting deserves to know which one they are in.
  const [phase, setPhase] = useState<'idle' | 'loading' | 'building'>('idle')
  const [buildError, setBuildError] = useState<string | null>(null)
  const busy = phase !== 'idle'

  const [company, setCompany] = useState<string | null>(null)
  const [standardVersion, setStandardVersion] = useState<string | null>(null)
  const [periodStart, setPeriodStart] = useState<string | null>(null)
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [finalisation, setFinalisation] = useState<FinalisationLatest | null>(null)
  const [frozenRequirements, setFrozenRequirements] = useState<RoadmapRequirementRow[]>([])

  const [roundId, setRoundId] = useState<string | null>(null)
  const [roundName, setRoundName] = useState<string | null>(null)
  // ⚠️ frozen_at, NOT closed_at — see the select below.
  const [roundFrozenAt, setRoundFrozenAt] = useState<string | null>(null)
  const [roundCount, setRoundCount] = useState(0)
  const [threshold, setThreshold] = useState<number | null>(null)

  const [agg, setAgg] = useState<Agg | null>(null)
  const [aggError, setAggError] = useState<string | null>(null)

  const [dets, setDets] = useState<Det[]>([])
  const [iros, setIros] = useState<IroRow[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [thresholdRows, setThresholdRows] = useState<ThresholdRow[]>([])
  const [categoryLabel, setCategoryLabel] = useState<Record<string, string>>({})
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
      .select('id, company_name, standard_version, reporting_period_start, reporting_period_end')
      .eq('id', assessmentId).maybeSingle()
    if (aErr) { setLoadError(aErr.message); setLoading(false); return }
    if (!a) {
      setLoadError('This assessment was not found, or it belongs to another account. Those two '
                 + 'cannot be told apart from here.')
      setLoading(false); return
    }
    const asmt = a as {
      company_name: string | null; standard_version: string | null
      reporting_period_start: string | null; reporting_period_end: string | null
    }
    setCompany(asmt.company_name)
    setStandardVersion(asmt.standard_version)
    setPeriodStart(asmt.reporting_period_start ?? null)
    setPeriodEnd(asmt.reporting_period_end ?? null)

    // ⚠️ THE TABLES DIRECTLY, NOT materiality_finalise_readiness. Three reasons, in order of weight:
    // the RPC does not return the frozen ROWS — only `latest` — so it would be a first call BEFORE
    // this one rather than instead of it; ownership was established by the maybeSingle above and
    // re-checking it would be a second copy of a refusal this screen already made; and the RPC
    // answers "can this be finalised?", a question about the FUTURE, while a report asks "what was
    // frozen?", a question about the PAST. An assessment finalised and since edited returns
    // ready:false — true, and entirely irrelevant to printing version 1.
    const { data: fin } = await supabase.from('materiality_finalisations')
      .select('version, finalised_at, standard_version')
      .eq('assessment_id', assessmentId)
      .order('version', { ascending: false }).limit(1).maybeSingle()
    const latest = (fin as FinalisationLatest | null) ?? null
    setFinalisation(latest)

    if (latest) {
      // Ordered by the same (topic_code, sort_order) the roadmap prints in —
      // materiality_finalisation_requirements_order_idx exists for exactly this read.
      const { data: fr } = await supabase.from('materiality_finalisation_requirements')
        .select('dr_code, topic_code, title, datapoints, sort_order')
        .eq('assessment_id', assessmentId)
        .eq('version', latest.version)
        .order('topic_code').order('sort_order')
      setFrozenRequirements((fr ?? []) as RoadmapRequirementRow[])
    } else {
      setFrozenRequirements([])
    }

    const sv = asmt.standard_version || ''

    const { data: links } = await supabase.from('materiality_assessment_survey_rounds')
      .select('round_id').eq('assessment_id', assessmentId).order('linked_at')
    // ⚠️ THE EARLIEST LINK, and the count is kept so the page can SAY so.
    const rid = links && links.length ? (links[0] as { round_id: string }).round_id : null
    setRoundId(rid)
    setRoundCount(links ? links.length : 0)

    if (rid) {
      const [{ data: rd, error: rdErr }, { data: ag, error: agErr }] = await Promise.all([
        supabase.from('materiality_survey_rounds')
          // ⚠️ frozen_at, and the name is the more accurate one. There is no closed_at column:
          // what the timestamp records is the round's FIGURES BEING FIXED, which is what closing
          // does and what the board paper's cover is actually stating — "the survey this drew on,
          // and the moment its numbers stopped moving". A column called closed_at would describe
          // the button somebody pressed; frozen_at describes the fact the reader needs.
          .select('name, status, frozen_at, top_box_high_min_share').eq('id', rid).maybeSingle(),
        supabase.rpc('survey_aggregate', { p_round_id: rid }),
      ])
      const round = rd as {
        name: string; status: string; frozen_at: string | null
        top_box_high_min_share: number | null
      } | null
      setRoundName(round?.name ?? null)
      setRoundFrozenAt(round?.frozen_at ?? null)
      // The round's OWN snapshotted value, never the current reference row.
      setThreshold(round?.top_box_high_min_share ?? null)
      if (rdErr) setLoadError(rdErr.message)

      // ⚠️ THREE STATES, KEPT APART. An error is not an absent survey, and a call that returns
      // nothing with no reason is neither of those.
      if (agErr) setAggError(agErr.message)
      else if (ag) setAgg(ag as Agg)
      else setAggError('The survey results came back empty, and no reason was given.')
    }

    const [dRes, stRes, tRes, dispRes, qRes, snapRes, pRes, thRes, catRes, iroRes] = await Promise.all([
      // ⚠️ iro_key SELECTED AND axis PINNED. Both were absent until 25 Aug 2026. Without iro_key
      // an IRO's determination is read as its parent's own row; without the axis pin a
      // financial-axis row lands in an impact paper — the two predicates
      // materiality_impact_subtopic_determinations exists to hold, which this screen does not read
      // through only because it also needs iro_key, which that view deliberately withholds.
      supabase.from('materiality_impact_determinations')
        .select('subtopic_code, iro_key, direction, nature, scale, scope, irremediability, likelihood, abstained_dimensions, value_chain_position, time_horizon, rationale, status, assignment_id, evidence_in_view, override_reason, overridden_at')
        .eq('assessment_id', assessmentId)
        .eq('axis', 'impact'),
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
      rid
        ? supabase.from('materiality_survey_respondents')
            .select('stakeholder_category, status').eq('round_id', rid)
        : Promise.resolve({ data: [], error: null }),
      // Section 8 prints the definition and the source as written — that prose is the disclosure.
      supabase.from('mr_survey_thresholds').select('key, value, definition, source').order('key'),
      // ⚠️ THE LABELS, because the codes are enum values. The results screen renders these same
      // rows; without them the report prints own_workforce and value_chain_worker at a board.
      supabase.from('mr_stakeholder_categories').select('code, label'),
      // ⚠️ THE NAMES, AND THE ONLY SOURCE OF THEM. Without this the assembly below can key IRO
      // entries correctly and still print them unnamed, which is the one thing ATTRIBUTION_NOTE
      // promises it will not do.
      supabase.from('materiality_custom_iros')
        .select('subtopic_code, iro_key, name').eq('assessment_id', assessmentId),
    ])

    const err = [dRes, stRes, tRes, dispRes, qRes, snapRes, pRes, thRes, catRes, iroRes]
      .find(r => r.error)?.error
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
    setIros((iroRes.data || []) as IroRow[])
    setPeople((pRes.data || []) as Person[])
    setThresholdRows((thRes.data || []) as ThresholdRow[])
    setCategoryLabel(Object.fromEntries(
      ((catRes.data || []) as { code: string; label: string | null }[])
        .filter(r => r.label).map(r => [r.code, r.label as string])))
    setLoading(false)
  }

  const sources = useMemo(() => ({
    assignmentSnapshot: snapshot, roundSnapshot, display: displayName, reference: refName,
  }), [snapshot, roundSnapshot, displayName, refName])

  /** The input the module takes, assembled once and used both to report readiness and to build. */
  const input = useMemo<BoardReportInput | null>(() => {
    if (!agg || threshold === null) return null

    /**
     * ⚠️ THIS ASSEMBLY IS NOT COVERED BY ANY TEST, AND THAT IS A KNOWN GAP, NOT AN OVERSIGHT.
     *
     * lib/materiality/boardReport.test.ts and lib/materiality/register.test.ts both hand the
     * library hand-built RegisterSubTopic[]. Neither exercises a payload assembled from query
     * rows — which is exactly why a query missing iro_key passed 81 green tests while every IRO
     * determination arrived claiming to be its sub-topic's own row.
     *
     * Left open because both ways of closing it are worse than the gap: a test that rebuilds this
     * loop tests the copy, and the loop is inline in a .tsx and not exported, so covering the real
     * one means extracting it to lib/materiality/ — a real refactor with its own commit. Extract
     * it and the test follows for free.
     */
    const byUnit: Record<string, Determination[]> = {}
    for (const d of dets) {
      (byUnit[unitKey(d.subtopic_code, d.iro_key)] ||= []).push({
        direction: d.direction,
        nature: (d.nature ?? 'actual') as Determination['nature'],
        status: d.status,
        scale: d.scale, scope: d.scope,
        irremediability: d.irremediability, likelihood: d.likelihood,
        // ⚠️ CARRIED, NOT DROPPED. This mapping narrowed the fetched row and silently discarded
        // abstained_dimensions — the column was selected above and thrown away here, which is where
        // "the assessor declined" became indistinguishable from "nobody reached it".
        abstained_dimensions: d.abstained_dimensions,
      })
    }

    /**
     * Every named IRO per sub-topic, as the UNION of two sources — neither alone is complete:
     *   materiality_custom_iros  an IRO created but not yet scored. It carries nothing, and belongs
     *                            here so buildRegister reports it unjudged rather than let it vanish.
     *   the determinations       an IRO whose name row is gone. Its determinations must be kept —
     *                            they may be what made the topic material.
     * Sorted, so the entry order is deterministic rather than the database's.
     */
    const iroKeysOf: Record<string, Set<string>> = {}
    const iroNameOf: Record<string, string> = {}
    for (const i of iros) {
      (iroKeysOf[i.subtopic_code] ||= new Set()).add(i.iro_key)
      iroNameOf[unitKey(i.subtopic_code, i.iro_key)] = i.name
    }
    for (const d of dets) {
      if (d.iro_key !== '') (iroKeysOf[d.subtopic_code] ||= new Set()).add(d.iro_key)
    }

    const subtopics: RegisterSubTopic[] = []
    for (const s of agg.subtopics || []) {
      const topicCode = s.topic_code || topicOf[s.subtopic_code] || ''
      const category = categoryOf[topicCode]
      // ⚠️ Held back rather than defaulted — category decides mean-versus-max inside computeSeverity,
      // so a guess would change a materiality conclusion rather than mislabel a row.
      if (!isCategory(category)) continue

      /**
       * ⚠️ ONE ENTRY PER (subtopic_code, iro_key) — NOT ONE PER SUB-TOPIC. This is the shape
       * lib/materiality/register.ts takes: rollUpDeterminations collapses the units back to one
       * entry per code, and that collapse IS the disjunction. Flatten them here instead and
       * submittedFor() sees two submitted rows for one direction and throws — or, when the
       * directions happen not to collide, silently reads a named IRO's judgement as the
       * sub-topic's own, so material_on_own_row reads true and nothing is marked "via".
       */
      subtopics.push({
        subtopic_code: s.subtopic_code,
        iro_key: '',
        topic_code: topicCode,
        topic_label: s.topic_label,
        short_name: resolveSubtopicName(s.subtopic_code, sources) ?? s.short_name ?? null,
        category,
        status: s.status,
        exclusion_reason: s.exclusion_reason,
        overall: s.overall,
        determinations: byUnit[unitKey(s.subtopic_code, '')] || [],
      })

      for (const iroKey of [...(iroKeysOf[s.subtopic_code] ?? [])].sort()) {
        subtopics.push({
          subtopic_code: s.subtopic_code,
          iro_key: iroKey,
          topic_code: topicCode,
          topic_label: s.topic_label,
          // The IRO's OWN name. Never the parent's — that would print the sub-topic's label where
          // the paper promises the named issue that carried it.
          short_name: iroNameOf[unitKey(s.subtopic_code, iroKey)] ?? orphanIroName(iroKey),
          category,
          // Scope is the parent's: an IRO under an excluded sub-topic is out of scope with it.
          status: s.status,
          exclusion_reason: null,
          // ⚠️ null, ALWAYS. `overall` is the STAKEHOLDER aggregate, and no stakeholder was ever
          // asked about a company-defined IRO. Copying the parent's would attribute a survey
          // answer to a question nobody was put.
          overall: null,
          determinations: byUnit[unitKey(s.subtopic_code, iroKey)] || [],
        })
      }
    }

    const participation = participationOf(people, code => categoryLabel[code] || code)

    return {
      company_name: company,
      assessment_name: roundName ? `Materiality assessment · ${roundName}` : 'Materiality assessment',
      standard_version: standardVersion,
      // BoardReportInput documents `e.g. "1 January – 31 December 2026"` and formatPeriodSpan is
      // what produces it. Null when the assessment records no period — the cover still prints
      // "Not stated", which remains the truth; it is simply no longer the only possible answer.
      //
      // No legacy FY-label fallback here, deliberately: this screen reads the COLUMNS, and the
      // pre-21-Aug-2026 label lives in workings.disclosure on the climate-risk and materiality
      // assessments, which this screen does not load.
      reporting_period: formatPeriodSpan(periodStart, periodEnd),
      finalised_stamp: finalisationStamp(finalisation),
      // ⚠️ THE ROWS AND THE STAMP COME FROM THE SAME FINALISATION, so a paper cannot print
      // "Finalised 22 August 2026" over a roadmap built from nothing, or vice versa. Both are null
      // or both are populated, because both derive from `finalisation`.
      disclosure_requirements: frozenRequirements,
      // ⚠️ NULL IN BOTH CASES, AND FOR TWO DIFFERENT REASONS.
      //   FINALISED   — the rows came frozen from materiality_finalisation_requirements, so a note
      //                 saying they were read at generation and may differ later would be false.
      //   UNFINALISED — this screen resolves NOTHING at read either: it passes no rows at all, the
      //                 roadmap is empty, every material topic prints the no-requirements line, and
      //                 NOT_FINALISED_NOTE on the cover is what explains it. False there too.
      // The field would only ever be true for a caller that genuinely resolves at read, and after
      // finalisation there is none. See its declaration in lib/materiality/boardReport.ts.
      requirements_resolved_note: null,
      round_name: roundName,
      // The module's field is round_closed_at; the value is frozen_at.
      //
      // ⚠️ FORMATTED HERE, BECAUSE THE TYPE SAYS SO — "ISO string from the round. Formatted by the
      // caller; this module generates no dates." It was NOT formatted until 21 Aug 2026: the raw
      // value went straight through boardReportPdf.ts to lib/pdf/layout.ts, so the PDF cover would
      // have printed "2026-08-20T14:33:12.123Z" under SURVEY CLOSED the moment a round had a
      // frozen_at. Nothing errored — it had simply never been exercised with a frozen round.
      //
      // ⚠️ SEPARATE OPEN ISSUE, NOT SOLVED HERE: frozen_at records when the FIRST RESPONSE ARRIVED,
      // not when the round closed — see the note on the select above. So this row is labelled
      // "Survey closed" and carries a different event. Formatting it makes it legible, not correct.
      // Either the label or the column has to change, and that is its own decision.
      round_closed_at: formatReportDate(roundFrozenAt),
      participation: participation.totals,
      by_category: participation.by_category,
      subtopics,
      topBoxHighMinShare: threshold,
      thresholds: thresholdRows,
      // ⚠️ THE ROUND'S SNAPSHOTTED NUMBERS, NOT THE AGGREGATE'S SENTENCE. method.dispersion.definition
      // names its own columns — polarised_extreme_min_n, polarised_middle_max_share — and that is
      // developer prose. The module turns these two numbers into a sentence a board can read; the
      // full definitions still reach a verifier through section 8's threshold rows.
      polarisation_levels: (() => {
        const t = agg.method?.thresholds as Record<string, unknown> | undefined
        const n = Number(t?.polarised_extreme_min_n)
        const share = Number(t?.polarised_middle_max_share)
        return Number.isFinite(n) && Number.isFinite(share)
          ? { extreme_min_n: n, middle_max_share: share }
          : null
      })(),
      // Section 5c. Absent means the section says the comparison was not drawn — never that no
      // difference exists. ?? null rather than a bare pass so an older round whose payload predates
      // s1_s2_contrast degrades to that honest state instead of throwing.
      contrast: agg.s1_s2_contrast ?? null,
    }
  }, [agg, threshold, dets, topicOf, categoryOf, sources, people, company, standardVersion,
      roundName, roundFrozenAt, periodStart, periodEnd, finalisation, frozenRequirements, thresholdRows, categoryLabel])

  const submittedCount = useMemo(
    () => dets.filter(d => d.status === 'submitted').length, [dets])

  const download = async () => {
    if (!input) return
    setBuildError(null)

    // ── the chunk ────────────────────────────────────────────────────────────────────────────
    // ⚠️ ITS OWN try, AND ITS OWN SENTENCE. A dynamic import fails for reasons that have nothing to
    // do with the report — an offline tab, a stale build whose chunk no longer exists on the CDN,
    // a blocked request. Folded into the build's catch it would surface as though the paper itself
    // were at fault, and swallowed entirely it would present as a click that did nothing, which is
    // the worst of the three: the reader clicks again, and again, and has no idea why.
    setPhase('loading')
    let generate: typeof import('../../../../../lib/materiality/boardReportPdf')['generateBoardReportPDF']
    try {
      const mod = await import('../../../../../lib/materiality/boardReportPdf')
      generate = mod.generateBoardReportPDF
    } catch (e) {
      setPhase('idle')
      setBuildError('The document generator could not be loaded, so nothing was produced. This is '
                  + 'usually a connection that dropped, or a browser tab left open across a new '
                  + 'release. Reload the page and try again. '
                  + (e instanceof Error ? e.message : String(e)))
      return
    }

    // ── the document ─────────────────────────────────────────────────────────────────────────
    setPhase('building')
    try {
      const report = buildBoardReport(input)
      const doc = generate(report)
      // The naming shape lib/assurancePdf.ts uses.
      //
      // ⚠️ THIS FILENAME IS A SECOND COPY OF THE REPORT'S TITLE AND IT HAS ALREADY DRIFTED ONCE.
      // TITLE in lib/materiality/boardReport.ts was renamed on 26 Aug 2026 with the product; this
      // string was missed and shipped a day naming a product that no longer existed — in the one
      // place a customer keeps, their Downloads folder. Corrected 27 Aug 2026.
      // IT COULD READ FROM TITLE, and that is the right end state: this file already imports from
      // boardReport.ts twice. What stopped it being done here is that TITLE is sentence case
      // ("Materiality assessment report") and a filename wants Pascal case, so the transform is a
      // convention decision that belongs in one shared helper rather than re-derived per caller.
      // Until that exists, this string is a known copy — if TITLE moves, MOVE THIS WITH IT.
      doc.save(`ThemisIQ_MaterialityAssessmentReport_${(company || 'Company').replace(/\s+/g, '_')}.pdf`)
    } catch (e) {
      // Said as what it is. No half-written PDF exists: the failure happens before save.
      setBuildError('The paper could not be assembled, and nothing was downloaded. '
                  + (e instanceof Error ? e.message : String(e)))
    } finally {
      setPhase('idle')
    }
  }

  if (isPaid === false) return (
    <Shell><PaywallCard title={PAYWALL_TITLE}
      body={PAYWALL_STAKEHOLDER_REPORT}
      href={PAYWALL_HREF} /></Shell>
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

  // What stops a paper being worth producing, in the order a reader can act on.
  const blockers: string[] = []
  if (roundId === null) {
    blockers.push('No stakeholder survey is linked to this assessment, so there is nothing to set '
                + 'beside your own determinations. Link a closed round on the worksheet first.')
  }
  if (roundId !== null && aggError) {
    blockers.push(`The survey results could not be read, so the paper would be missing the half of `
                + `it that reports what people told you. ${aggError}`)
  }
  if (roundId !== null && !aggError && threshold === null) {
    blockers.push('This round did not record the level at which respondents count as having '
                + 'flagged a topic, so the comparison cannot be drawn for it.')
  }
  if (submittedCount === 0) {
    blockers.push('No determinations have been submitted yet. Until they are, the paper would '
                + 'report an assessment that has not concluded anything.')
  }

  const ready = blockers.length === 0 && input !== null

  return (
    <Shell>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href={`/dashboard/materiality/worksheet/${assessmentId}`}
              style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← Worksheet</Link>
        <Link href={`/dashboard/materiality/worksheet/${assessmentId}/register`}
              style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Where views differ</Link>
      </div>

      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>
        {company || 'Board paper'}
      </div>
      <div style={{ fontSize: 13, color: MUTE, marginTop: 4, marginBottom: 20 }}>
        A paper for your board, about what this assessment found
      </div>

      <div style={CARD}>
        <div style={H2}>What the paper contains</div>
        <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.9 }}>
          It opens with what we asked and what your own assessment did, then gives three figures —
          topics assessed, topics found material, and topics where the two views point differently.
          After that: who took part, what respondents said on each topic, what your assessment
          concluded and why, where the two differ, the rules and thresholds applied, what the paper
          does not cover, and what it tells a board beyond compliance.
        </div>
        <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.9, marginTop: 10 }}>
          It is written for directors or senior leadership rather than for specialists, and it asks
          the reader to approve nothing — it reports what was found.
        </div>
      </div>

      <div style={CARD}>
        <div style={H2}>What it draws on</div>
        <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.9 }}>
          {roundName
            ? <>The stakeholder survey <strong style={{ color: INK }}>{roundName}</strong>
                {roundCount > 1 && <>, the earliest of the {roundCount} linked to this assessment.
                  {' '}Figures will not match a later round&apos;s results.</>}
              </>
            : <>No stakeholder survey is linked yet.</>}
        </div>
        <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.9, marginTop: 8 }}>
          {submittedCount > 0
            ? <>{submittedCount} submitted {submittedCount === 1 ? 'determination' : 'determinations'} from your own assessment.</>
            : <>No submitted determinations yet.</>}
        </div>
        <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.9, marginTop: 8 }}>
          Prepared under{' '}
          <strong style={{ color: INK }}>
            {standardVersionLabel(standardVersion) ?? 'a standard version that has not been stated'}
          </strong>.
        </div>
      </div>

      {blockers.length > 0 && (
        <div style={{ ...CARD, background: AMBER_BG, borderColor: AMBER }}>
          <div style={H2}>Not ready yet</div>
          <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.9 }}>
            {/* ⚠️ NO DOWNLOAD IS OFFERED HERE. A paper generated from this state would open, look
                finished, and report nothing — which is worse than no paper, because somebody would
                send it. */}
            The paper is not offered yet, because it would be produced without the things that make
            it worth reading:
          </div>
          <ul style={{ margin: '10px 0 0 18px', padding: 0 }}>
            {blockers.map((b, i) => (
              <li key={i} style={{ fontSize: 12.5, color: INK, lineHeight: 1.9, marginBottom: 6 }}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {buildError && (
        <div style={{ ...CARD, background: FAIL_BG, borderColor: FAIL }}>
          <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.8 }}>
            <strong>The paper was not produced.</strong> {buildError} Nothing was downloaded.
          </div>
        </div>
      )}

      {ready && (
        <div style={{ ...CARD, background: BLUE_BG, borderColor: BLUE }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.8, flex: 1, minWidth: 260 }}>
              <strong>Ready.</strong> The paper is generated here in your browser and downloaded —
              it is not stored on our servers, and nothing is sent anywhere.
            </div>
            <button onClick={() => void download()} disabled={busy}
                    style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, padding: '9px 20px',
                             borderRadius: 8, border: 'none', background: INK, color: '#fff',
                             cursor: busy ? 'not-allowed' : 'pointer',
                             opacity: busy ? 0.6 : 1 }}>
              {phase === 'loading' ? 'Loading the generator…'
                : phase === 'building' ? 'Preparing the paper…'
                : 'Download the paper'}
            </button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.8 }}>
        The paper reports the impact half of double materiality — the effect your organisation has
        on people and the environment. It does not assess how sustainability matters affect your
        own finances, and it says so on its own limitations page.
      </div>
    </Shell>
  )
}
