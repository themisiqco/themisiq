'use client'

/**
 * Impact worksheet — assign and chase. Screen A of three.
 *
 * The lead divides the sub-topics among named colleagues: HR takes S1, facilities takes E2. That
 * division is the design's whole advantage over one person guessing at everything, and it is what
 * makes "assessed with internal experts" a true sentence rather than a claim.
 *
 * NOT HERE: what anyone determined. That is /determinations — its own route, because this screen
 * answers "who is doing what" and that one answers "what did they conclude".
 *
 * ⚠️ SCOPE IS INHERITED, NEVER CHOSEN AGAIN. The sub-topic list comes from the linked round's
 * INCLUDED questions and is read-only here. The round decided what this organisation is asking
 * about; re-deciding it in a second place would let the survey and the assessment disagree about
 * what was in scope, and the report cites both.
 *
 * ⚠️ EVERY REFUSAL ON THIS SCREEN COMES FROM THE DATABASE AND IS PRINTED VERBATIM.
 * One assignee per sub-topic is `unique (assessment_id, subtopic_code)`. A submitted determination
 * staying with its author is materiality_impact_reassign_subtopic's own raise. An assignment with
 * determinations refusing deletion is the ON DELETE RESTRICT. This file re-implements none of them,
 * because a client-side copy of a rule is a second copy, free to drift — and the copy that drifts is
 * always the one the customer sees. What the screen does add is the CONFIRMATION BEFOREHAND, which
 * the database cannot give.
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../components/Nav'
import PaywallCard from '../../../../components/PaywallCard'
import { PAYWALL_HREF, PAYWALL_TITLE, PAYWALL_WORKSHEET } from '@/lib/paywallCopy'
import { supabase } from '../../../../../lib/supabase'
import { useEntitlement } from '../../../../../lib/useEntitlement'
import { resolveTopicLabels, isStandardVersion, type EsrsTopic } from '../../../../../lib/materiality'
// ⚠️ This screen reads names for sub-topics that are not yet assigned — which by definition have no
// snapshot — and it also WRITES the snapshot when one is assigned. Both go through the same chain,
// so what gets frozen onto an assignment is exactly what the lead saw when they assigned it.
import { resolveSubtopicName, subtopicHeading } from '../../../../../lib/materiality/subtopicName'
import { finalisationStamp, type Readiness }
  from '../../../../../lib/materiality/finalisation'

const PURPLE = '#7425e3'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
const AMBER = 'var(--color-module-climate)'
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

/**
 * The customer wording for each standard version.
 *
 * ⚠️ THIS IS A SECOND COPY. app/dashboard/materiality/report/page.tsx holds the same three keys and
 * the same three labels, and two copies of a reference table drift — the copy that drifts is always
 * the one somebody forgot. It belongs in lib/ beside the other shared reference data, read by both;
 * that is a separate change and this comment is here so it is not mistaken for the original.
 *
 * ⚠️ AN UNKNOWN KEY RENDERS NOTHING, never the raw value and never a guess. A code like esrs_2026
 * shown to a customer is a system value leaking; a wrong label is worse, because it names the law
 * the assessment was prepared under.
 */
const STANDARD_VERSION_LABEL: Record<string, string> = {
  esrs_2023: 'ESRS (2023), as last amended by Del. Reg. (EU) 2025/1416',
  esrs_2023_reliefs: 'ESRS (2023) with the reliefs permitted by Del. Reg. C(2026) 5010',
  esrs_2026: 'ESRS (2026) — Del. Reg. C(2026) 5010, applied in full',
}

type Assessment = {
  id: string; company_name: string | null; standard_version: string | null; status: string
}
type Round = { id: string; name: string; status: string }
/** Every round the signed-in user owns — the eligible ones and the rest. RLS does the scoping. */
type PickerRound = { id: string; name: string; status: string; standard_version: string | null }
type ScopeRow = { subtopic_code: string; topic_code: string; short_name: string }
type Assignment = {
  id: string; contributor_name: string | null; contributor_email: string | null
  contributor_role: string | null; status: string
  // ⚠️ invited_at IS NULLABLE SINCE 20260852, and the null is the whole point: it means nobody has
  // been emailed. It was `not null default now()` — the campaign_suppliers defect in its third
  // table — so it read as an invitation date for every colleague ever added. created_at is the
  // creation timestamp and always was; this column is now written only by /api/impact-invite,
  // after Resend has confirmed the send.
  expires_at: string; revoked_at: string | null; invited_at: string | null
  reminder_sent_at: string | null; submitted_at: string | null; created_at: string
}
type AssignedSub = { assignment_id: string; subtopic_code: string }
type Determination = {
  subtopic_code: string; direction: string; status: string
  // overridden_at was selected and typed here and never read — this screen answers "who is doing
  // what", and whether a determination was later overridden is /determinations' question. It is
  // also not a column of the view below. Dropped rather than carried: a select is a claim that
  // something is read (the register screen's own rule, 21 Aug 2026).
  assignment_id: string | null
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const btn: React.CSSProperties = {
  fontSize: 12.5, padding: '7px 14px', borderRadius: 8, border: `1px solid ${LINE}`,
  background: '#fff', color: MID, cursor: 'pointer',
}
const btnPrimary: React.CSSProperties = {
  ...btn, background: INK, color: '#fff', border: 'none', fontWeight: 600,
}
const input: React.CSSProperties = {
  fontSize: 13, padding: '8px 10px', borderRadius: 8, border: `1px solid ${LINE}`,
  background: '#fff', color: INK, width: '100%',
}

export default function WorksheetAssign() {
  const isPaid = useEntitlement('double-materiality')
  const params = useParams()
  const assessmentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const [linkedIds, setLinkedIds] = useState<string[]>([])
  const [allRounds, setAllRounds] = useState<PickerRound[]>([])
  const [linkWorking, setLinkWorking] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkNote, setLinkNote] = useState<string | null>(null)
  const [scopeSource, setScopeSource] = useState<'round' | 'reference' | 'none'>('none')
  const [scope, setScope] = useState<ScopeRow[]>([])
  const [dbTopics, setDbTopics] = useState<EsrsTopic[]>([])
  const [roundNames, setRoundNames] = useState<Record<string, string>>({})
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({})
  const [refNames, setRefNames] = useState<Record<string, string>>({})
  const [topicLabelRows, setTopicLabelRows] = useState<{ topic_code: string; standard_version: string; label: string }[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assigned, setAssigned] = useState<AssignedSub[]>([])
  const [determinations, setDeterminations] = useState<Determination[]>([])
  // ⚠️ THE ONLY MODEL OF READINESS ON THIS SCREEN. Everything the finalise card renders comes from
  // this one object — see the note on Readiness in lib/materiality/finalisation.ts for why nothing
  // here may recompute `ready` from the counts beside it.
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  // A readiness call that FAILED is a fifth thing the card can be, and it must not look like
  // "not ready" — that would show a preparer an outstanding-work card for a network error.
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [finalising, setFinalising] = useState(false)
  const [finaliseError, setFinaliseError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<string>('')
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<{ code: string; message: string }[]>([])

  // Undo covers pure inserts ONLY — see confirmMove.
  const [lastAssign, setLastAssign] = useState<{ label: string; codes: string[] } | null>(null)
  const [confirmMove, setConfirmMove] = useState<
    { toId: string; toLabel: string; fresh: string[]; moves: string[]; draftRows: number } | null>(null)

  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const [confirmRevoke, setConfirmRevoke] = useState<Assignment | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [sendResult, setSendResult] =
    useState<Record<string, { ok: boolean; msg: string }>>({})

  useEffect(() => { load() }, [assessmentId])

  const load = async () => {
    setLoading(true); setLoadError(null)

    const { data: a, error: aErr } = await supabase
      .from('materiality_assessments')
      .select('id, company_name, standard_version, status')
      .eq('id', assessmentId).maybeSingle()

    if (aErr) { setLoadError(aErr.message); setLoading(false); return }
    if (!a) {
      setLoadError('This assessment was not found, or it belongs to another account. Those two '
                 + 'cannot be told apart from here.')
      setLoading(false); return
    }
    const asmt = a as Assessment
    setAssessment(asmt)
    const sv = asmt.standard_version

    // ── scope, inherited ─────────────────────────────────────────────────────────────────────
    // Linked rounds first. 20260827 permits several; this pass reads the first and says so rather
    // than silently unioning, because the union is an unmade decision and a silent one would be
    // indistinguishable from a complete list.
    const { data: links } = await supabase
      .from('materiality_assessment_survey_rounds')
      .select('round_id').eq('assessment_id', assessmentId).order('linked_at')

    // ⚠️ IN LINK ORDER, and the order is load-bearing. The picker names links[0] as the round scope
    // is read from, and says so BEFORE a second link can be made — the union is still unmade.
    setLinkedIds(((links || []) as { round_id: string }[]).map(l => l.round_id))

    let roundId: string | null = null
    if (links && links.length > 0) {
      roundId = (links[0] as { round_id: string }).round_id
      const { data: rd } = await supabase.from('materiality_survey_rounds')
        .select('id, name, status').eq('id', roundId).maybeSingle()
      if (rd) setRound(rd as Round)
    }

    if (roundId) {
      const { data: qs } = await supabase.from('materiality_survey_questions')
        .select('subtopic_code, short_name, sort_order')
        .eq('round_id', roundId).eq('status', 'included')
        .not('subtopic_code', 'is', null).order('sort_order')
      // topic_code is not on the question row; it comes from the reference table below.
      const { data: st } = await supabase.from('mr_esrs_subtopics')
        .select('code, topic_code').eq('standard_version', sv || '')
      const topicOf = Object.fromEntries(((st || []) as { code: string; topic_code: string }[])
        .map(r => [r.code, r.topic_code]))
      setScope(((qs || []) as { subtopic_code: string; short_name: string }[])
        .map(q => ({ subtopic_code: q.subtopic_code, short_name: q.short_name,
                     topic_code: topicOf[q.subtopic_code] || '' })))
      setRoundNames(Object.fromEntries(((qs || []) as { subtopic_code: string; short_name: string }[])
        .map(q => [q.subtopic_code, q.short_name])))
      setScopeSource('round')
    } else if (sv) {
      // No survey round is a supported case (20260838). Falls back to the full reference set for
      // this standard version. ⚠️ mr_esrs_subtopics.label is the VERBATIM Appendix A label, not the
      // house short_name the survey snapshots — so the wording differs from a round-derived list,
      // and the screen says which it is showing.
      const { data: st } = await supabase.from('mr_esrs_subtopics')
        .select('code, topic_code, label, sort_order')
        .eq('standard_version', sv).order('sort_order')
      setScope(((st || []) as { code: string; topic_code: string; label: string }[])
        .map(r => ({ subtopic_code: r.code, topic_code: r.topic_code, short_name: r.label })))
      setScopeSource('reference')
    } else {
      setScopeSource('none')
    }

    const [tp, tl, gRes, sRes, dRes, dispRes, refRes, rRes] = await Promise.all([
      supabase.from('mr_esrs_topics').select('code, label, category, sort_order').order('sort_order'),
      supabase.from('mr_esrs_topic_labels').select('topic_code, standard_version, label')
        .eq('standard_version', sv || ''),
      supabase.from('materiality_impact_assignments')
        .select('id, contributor_name, contributor_email, contributor_role, status, expires_at, revoked_at, invited_at, reminder_sent_at, submitted_at, created_at')
        // ⚠️ ORDERED BY created_at, NOT invited_at. This list is "the colleagues on this
        // assessment, in the order they were added", which is what invited_at USED to mean by
        // accident — both columns were `default now()` in the same INSERT, so they were equal on
        // every row. Since 20260852 invited_at is null until a send, and ordering on it would sort
        // everyone who has not been invited into one undifferentiated block.
        .eq('assessment_id', assessmentId).order('created_at'),
      supabase.from('materiality_impact_assignment_subtopics')
        .select('assignment_id, subtopic_code').eq('assessment_id', assessmentId),
      // ⚠️ THE VIEW, NOT THE TABLE. Every figure this screen derives from these rows is keyed on a
      // SUB-TOPIC — the per-row "submitted" badge, and submittedFromScope, which gates whether a
      // survey round can still be unlinked. After 20260855 a bare select returns a company's named
      // IROs alongside the sub-topic rows, so one IRO submitted under E3.1 would badge E3.1 itself
      // as submitted and would count as a determination made about a question the round asked.
      // Neither is true. materiality_impact_subtopic_determinations pins iro_key = '' so the
      // predicate cannot be forgotten here or at the next reader.
      //
      // ⚠️ THE VIEW PINS iro_key AND NOTHING ELSE — it exposes axis without filtering it. Nothing
      // writes axis = 'financial' today, so these counts are impact-axis by accident of what does
      // not exist yet. When the financial axis lands, this site needs .eq('axis','impact') as well,
      // and the view will not supply it.
      supabase.from('materiality_impact_subtopic_determinations')
        .select('subtopic_code, direction, status, assignment_id')
        .eq('assessment_id', assessmentId),
      supabase.from('mr_esrs_subtopic_display').select('subtopic_code, short_name')
        .eq('standard_version', sv || ''),
      supabase.from('mr_esrs_subtopics').select('code, label').eq('standard_version', sv || ''),
      // ⚠️ EVERY round, not only the usable ones. A list filtered down to the eligible ones is
      // empty exactly when the user most needs to know why, and an empty list explains nothing.
      supabase.from('materiality_survey_rounds')
        .select('id, name, status, standard_version').order('created_at', { ascending: false }),
    ])

    setDisplayNames(Object.fromEntries(
      ((dispRes.data || []) as { subtopic_code: string; short_name: string }[])
        .map(r => [r.subtopic_code, r.short_name])))
    setRefNames(Object.fromEntries(
      ((refRes.data || []) as { code: string; label: string }[]).map(r => [r.code, r.label])))
    setDbTopics((tp.data || []) as EsrsTopic[])
    setTopicLabelRows((tl.data || []) as { topic_code: string; standard_version: string; label: string }[])
    setAssignments((gRes.data || []) as Assignment[])
    setAssigned((sRes.data || []) as AssignedSub[])
    setDeterminations((dRes.data || []) as Determination[])
    setAllRounds((rRes.data || []) as PickerRound[])
    // ⚠️ ONE CALL, AND IT ANSWERS EVERYTHING THE FINALISE CARD NEEDS. Not a fetch of
    // determinations plus a count plus a rule: migration 20260850 exists so this screen asks the
    // question once and renders the answer. materiality_finalise_readiness and materiality_finalise
    // call the same two helpers, so the card and the refusal cannot disagree.
    const { data: rd, error: rdErr } = await supabase
      .rpc('materiality_finalise_readiness', { p_assessment_id: assessmentId })
    if (rdErr) { setReadinessError(rdErr.message); setReadiness(null) }
    else { setReadinessError(null); setReadiness(rd as Readiness) }

    setLoading(false)
  }

  /**
   * ⚠️ NEVER mr_esrs_topics.label DIRECTLY, and then the S1/S2 collision on top.
   * Same treatment as the scope screen: resolveTopicLabels overlays the versioned name, and where
   * two topics resolve to the SAME label — under ESRS (2026) S1 and S2 share Appendix A's one joint
   * title, byte-identical by design — the code is appended to both. Detected generically, so if a
   * later version splits the title the appending stops on its own.
   */
  const topicLabel = useMemo<Record<string, string>>(() => {
    const sv = assessment?.standard_version
    const resolved = resolveTopicLabels(
      dbTopics, topicLabelRows, sv && isStandardVersion(sv) ? sv : null,
    ).topics
    const seen: Record<string, number> = {}
    for (const t of resolved) seen[t.label] = (seen[t.label] ?? 0) + 1
    return Object.fromEntries(
      resolved.map(t => [t.code, seen[t.label] > 1 ? `${t.label} (${t.code})` : t.label]))
  }, [dbTopics, topicLabelRows, assessment?.standard_version])

  /** ⚠️ NO worksheet S1/S2 framing here — this screen divides work, it does not ask the question. */
  const nameFor = (code: string) => subtopicHeading(code, '', {
    roundSnapshot: roundNames, display: displayNames, reference: refNames,
  })

  const topicSort = useMemo<Record<string, number>>(
    () => Object.fromEntries(dbTopics.map(t => [t.code, t.sort_order ?? 0])), [dbTopics])

  const assigneeOf = useMemo<Record<string, string>>(
    () => Object.fromEntries(assigned.map(a => [a.subtopic_code, a.assignment_id])), [assigned])

  const byId = useMemo<Record<string, Assignment>>(
    () => Object.fromEntries(assignments.map(a => [a.id, a])), [assignments])

  const live = useMemo(() => assignments.filter(a => a.status !== 'revoked'), [assignments])
  const revoked = useMemo(() => assignments.filter(a => a.status === 'revoked'), [assignments])

  const groups = useMemo(() => {
    const byTopic: Record<string, ScopeRow[]> = {}
    for (const s of scope) (byTopic[s.topic_code || '__other'] ||= []).push(s)
    return Object.entries(byTopic)
      .map(([code, rows]) => ({ code, label: topicLabel[code] ?? code, rows }))
      .sort((a, b) => (topicSort[a.code] ?? 99) - (topicSort[b.code] ?? 99))
  }, [scope, topicLabel, topicSort])

  /** Submitted determinations per assignment. A sub-topic has two, so this counts rows not topics. */
  const submittedBy = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const d of determinations) {
      if (d.status === 'submitted' && d.assignment_id) out[d.assignment_id] = (out[d.assignment_id] ?? 0) + 1
    }
    return out
  }, [determinations])

  /** Determination rows attributed to an assignment, submitted or not. Used on revoked rows. */
  const rowsBy = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const d of determinations) {
      if (d.assignment_id) out[d.assignment_id] = (out[d.assignment_id] ?? 0) + 1
    }
    return out
  }, [determinations])

  const draftRowsFor = (codes: string[]) =>
    determinations.filter(d => codes.includes(d.subtopic_code) && d.status === 'draft').length

  const unassigned = useMemo(
    () => scope.filter(s => !assigneeOf[s.subtopic_code]), [scope, assigneeOf])

  // ── contributors ───────────────────────────────────────────────────────────────────────────
  const addContributor = async () => {
    setAddError(null)
    if (!newName.trim() && !newEmail.trim()) {
      setAddError('A name or an email is needed — the report names the invitation this determination came from.')
      return
    }
    setWorking(true)
    const { data, error } = await supabase.from('materiality_impact_assignments')
      .insert({
        assessment_id: assessmentId,
        contributor_name: newName.trim() || null,
        contributor_email: newEmail.trim() || null,
        contributor_role: newRole.trim() || null,
      })
      .select('id').maybeSingle()
    setWorking(false)

    // ⚠️ BOTH CHECKED. An insert refused by RLS returns no error AND no row, so testing only the
    // error would report a contributor who was never created.
    if (error) { setAddError(error.message); return }
    if (!data) { setAddError('The contributor was not created, and the server gave no reason. Nothing was saved.'); return }

    setNewName(''); setNewEmail(''); setNewRole('')
    await load()
  }

  /**
   * ⚠️ THE STAMP IS THE ROUTE'S, NOT THIS SCREEN'S, and that is deliberate. This page could write
   * status and invited_at itself — authenticated holds UPDATE on the table (20260838:576) and the
   * revoke button below does exactly that. It must not: a client-side stamp records an intention to
   * send, and the only thing worth recording is a send Resend has confirmed. /api/impact-invite is
   * where the email and the timestamp are the same transaction.
   *
   * `type` chooses the WORDS only. Which columns move is decided by the row's own status inside the
   * route, so a stale tab asking for an "invite" on someone already invited cannot overwrite the
   * date their real invitation went.
   */
  const sendInvite = async (a: Assignment, type: 'invite' | 'reminder') => {
    setSending(a.id)
    setSendResult(prev => { const n = { ...prev }; delete n[a.id]; return n })

    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/impact-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ assignment_id: a.id, type }),
      })
      const data = await res.json().catch(() => ({}))
      // ⚠️ EVERY FAILURE MODE SHOWS ITS MESSAGE AND PERSISTS — the same rule as the survey screen.
      // A badge that clears itself is how a preparer comes to believe a colleague was emailed.
      if (!res.ok || data.error) {
        setSendResult(prev => ({ ...prev, [a.id]: { ok: false, msg: data.error || `The send failed (HTTP ${res.status}).` } }))
      } else if (data.warning) {
        // Sent, but the record of it did not save. Both facts, or the preparer sends twice.
        setSendResult(prev => ({ ...prev, [a.id]: { ok: true, msg: data.warning } }))
      } else {
        setSendResult(prev => ({ ...prev, [a.id]: { ok: true, msg: data.first_send ? 'Invitation sent.' : 'Reminder sent.' } }))
      }
    } catch (e: any) {
      setSendResult(prev => ({ ...prev, [a.id]: { ok: false, msg: `The request did not reach the server (${e?.message || 'network error'}). Nothing was sent.` } }))
    }
    setSending(null)
    await load()
  }

  const revoke = async (a: Assignment) => {
    setWorking(true); setActionError(null)
    const { data, error } = await supabase.from('materiality_impact_assignments')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', a.id).select('id')
    setWorking(false); setConfirmRevoke(null)
    if (error) { setActionError(error.message); return }
    if (!data || data.length === 0) { setActionError('Access was not withdrawn, and the server gave no reason. Nothing changed.'); return }
    await load()
  }

  // ── assignment ─────────────────────────────────────────────────────────────────────────────
  const toggle = (code: string) => {
    const next = new Set(selected)
    if (next.has(code)) next.delete(code); else next.add(code)
    setSelected(next)
  }

  /**
   * Two different operations wear one button, and they are not equally reversible.
   *
   *   FRESH   an unassigned sub-topic -> INSERT. Undoable: delete the rows.
   *   MOVE    an assigned one -> materiality_impact_reassign_subtopic(), which CLEARS DRAFTS.
   *           ⚠️ NOT UNDOABLE. Reassigning back would not restore the cleared answers, so offering
   *           Undo after a move would be a button that lies. A move therefore goes through a
   *           confirmation that states the draft count first, and no Undo is offered afterwards.
   */
  const startAssign = () => {
    setActionError(null); setActionNote(null); setRowErrors([])
    if (!target || selected.size === 0) return
    const codes = [...selected]
    const fresh = codes.filter(c => !assigneeOf[c])
    const moves = codes.filter(c => assigneeOf[c] && assigneeOf[c] !== target)
    const already = codes.length - fresh.length - moves.length

    if (fresh.length === 0 && moves.length === 0) {
      setActionNote(`${already} ${already === 1 ? 'sub-topic is' : 'sub-topics are'} already assigned to that person. Nothing to do.`)
      return
    }
    if (moves.length === 0) { void runAssign(fresh, [], target); return }

    setConfirmMove({
      toId: target,
      toLabel: label(byId[target]),
      fresh, moves,
      draftRows: draftRowsFor(moves),
    })
  }

  const runAssign = async (fresh: string[], moves: string[], toId: string) => {
    setWorking(true); setActionError(null); setActionNote(null); setRowErrors([])
    const errs: { code: string; message: string }[] = []
    const sv = assessment?.standard_version || ''
    let cleared = 0

    if (fresh.length > 0) {
      const rows = fresh.map(code => ({
        assignment_id: toId,
        assessment_id: assessmentId,
        subtopic_code: code,
        standard_version: sv,
        // ⚠️ SNAPSHOT, not a join. A later re-scope must not change what this contributor was
        // asked to determine (20260838).
        // ⚠️ FROZEN FROM THE SAME CHAIN THE SCREEN RENDERED. Snapshotting a different string from
        // the one the lead saw when assigning would make the contributor's form disagree with the
        // screen that created it.
        short_name: resolveSubtopicName(code, {
          roundSnapshot: roundNames, display: displayNames, reference: refNames }),
        source_round_id: scopeSource === 'round' ? round?.id ?? null : null,
      }))
      const { data, error } = await supabase.from('materiality_impact_assignment_subtopics')
        .insert(rows).select('subtopic_code')
      if (error) errs.push({ code: fresh.join(', '), message: error.message })
      else if (!data || data.length !== fresh.length) {
        errs.push({ code: fresh.join(', '), message:
          `${data?.length ?? 0} of ${fresh.length} were created, and the server gave no reason for the rest.` })
      }
    }

    // ⚠️ ONE CALL PER SUB-TOPIC, DELIBERATELY. Each can be refused on its own grounds — a submitted
    // determination anchors its sub-topic — and a single batched write would turn one refusal into a
    // whole failed operation, or worse, hide it.
    for (const code of moves) {
      const { data, error } = await supabase.rpc('materiality_impact_reassign_subtopic', {
        p_assessment_id: assessmentId, p_subtopic_code: code, p_to_assignment_id: toId,
      })
      // The message is the database's, printed as given. See the file header.
      if (error) { errs.push({ code, message: error.message }); continue }
      cleared += typeof data === 'number' ? data : 0
    }

    setWorking(false)
    setRowErrors(errs)
    setConfirmMove(null)
    setSelected(new Set())

    // Undo is offered ONLY when nothing moved, because a move cleared drafts it cannot restore.
    if (moves.length === 0 && fresh.length > 1 && errs.length === 0) {
      setLastAssign({ label: label(byId[toId]), codes: fresh })
    } else {
      setLastAssign(null)
    }

    const done = fresh.length + moves.length - errs.length
    if (done > 0) {
      setActionNote(
        `${done} ${done === 1 ? 'sub-topic' : 'sub-topics'} assigned to ${label(byId[toId])}.` +
        // ⚠️ THE COUNT IS THE FUNCTION'S OWN RETURN VALUE, not the client's prediction. The
        // confirmation showed a forecast; this is what actually happened, and if they differ this
        // is the number that is true.
        (moves.length > 0 ? ` ${cleared} draft ${cleared === 1 ? 'answer was' : 'answers were'} cleared.` : ''))
    }
    await load()
  }

  /**
   * Link a round to this assessment.
   *
   * ⚠️ THE TWO RULES ARE THE DATABASE'S, NOT THIS FILE'S. materiality_assessment_survey_round_link_guard
   * refuses an unclosed round and a version that does not match, and refuses a not-stated assessment
   * version outright. The picker mirrors those rules so nobody meets a raise by surprise; it does not
   * re-implement them, and when one arrives anyway it is printed as given. Same argument as the
   * header makes for every other refusal on this screen.
   *
   * ⚠️ user_id IS NOT SENT. It defaults to auth.uid(); setting it here would be this client
   * asserting an identity the database already knows, and the composite keys check against.
   */
  const linkRound = async (roundId: string) => {
    setLinkWorking(roundId); setLinkError(null); setLinkNote(null)
    const { data, error } = await supabase.from('materiality_assessment_survey_rounds')
      .insert({ assessment_id: assessmentId, round_id: roundId })
      .select('round_id')
    setLinkWorking(null)
    if (error) { setLinkError(error.message); return }
    if (!data || data.length === 0) {
      setLinkError('Nothing was linked, and the server gave no reason. Treat this round as not linked.')
      return
    }
    setLinkNote(linkedIds.length === 0
      ? 'Linked. The sub-topics below are now the ones that round asked about.'
      : 'Linked, and recorded alongside the round already there. Scope still comes from the '
        + 'earliest one — the two have not been merged.')
    // ⚠️ THE EXISTING FETCH, RE-RUN. Scope, names, assignments and determinations all derive from
    // the link, so re-reading in one place is what keeps them consistent with each other.
    await load()
  }

  /**
   * ⚠️ A HARD DELETE. There is no soft-delete column on the join row, and removing it is the
   * deliberate act that lets the round reopen again (20260827). Offered only where nothing was
   * drawn from the round — see canUnlink at the render.
   */
  const unlinkRound = async (roundId: string) => {
    setLinkWorking(roundId); setLinkError(null); setLinkNote(null)
    const { data, error } = await supabase.from('materiality_assessment_survey_rounds')
      .delete().eq('assessment_id', assessmentId).eq('round_id', roundId)
      .select('round_id')
    setLinkWorking(null)
    if (error) { setLinkError(error.message); return }
    if (!data || data.length === 0) {
      setLinkError('Nothing was unlinked, and the server gave no reason. The link may still be in place.')
      return
    }
    setLinkNote('Unlinked. That round can be reopened again.')
    await load()
  }

  const undoAssign = async () => {
    if (!lastAssign) return
    setWorking(true)
    const { error } = await supabase.from('materiality_impact_assignment_subtopics')
      .delete().eq('assessment_id', assessmentId).in('subtopic_code', lastAssign.codes)
    setWorking(false)
    if (error) { setActionError(error.message); return }
    setLastAssign(null); setActionNote(null)
    await load()
  }

  const label = (a: Assignment | undefined) =>
    !a ? 'a contributor' : (a.contributor_name || a.contributor_email || 'an unnamed contributor')

  // ── render ─────────────────────────────────────────────────────────────────────────────────
  if (isPaid === false) return (
    <Shell><PaywallCard title={PAYWALL_TITLE}
      body={PAYWALL_WORKSHEET}
      href={PAYWALL_HREF} /></Shell>
  )

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav /><div style={{ textAlign: 'center', padding: '4rem', color: MUTE }}>Loading worksheet…</div>
    </div>
  )

  if (loadError || !assessment) return (
    <Shell>
      <div style={CARD}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 10 }}>
          This worksheet could not be opened
        </div>
        <div style={{ fontSize: 13.5, color: MID, lineHeight: 1.75 }}>{loadError}</div>
      </div>
    </Shell>
  )

  const noVersion = !assessment.standard_version

  // ── what the picker needs to know, derived from what is already loaded ──────────────────────
  const statusWord = (st: string) =>
    st === 'closed' ? 'closed' : st === 'open' ? 'still collecting answers' : 'not sent out yet'

  /** null for a version with no entry and for a missing one — the caller renders nothing. */
  const versionLabel = (v: string | null | undefined): string | null =>
    (v && STANDARD_VERSION_LABEL[v]) || null

  const earliestLinked = linkedIds[0] ?? null
  const scopeCodes = new Set(scope.map(sc => sc.subtopic_code))
  /**
   * ⚠️ ONLY THE EARLIEST LINKED ROUND CAN HAVE BEEN DRAWN FROM, because only links[0] is read for
   * scope. A later link has never put a sub-topic in front of anyone, so nothing can rest on it and
   * removing it is always safe. That is a fact about this page's own fetch, not an assumption about
   * the data — and it is the reason the refusal below is narrow rather than blanket.
   */
  /**
   * ⚠️ THE DATABASE'S OWN SENTENCE ON FAILURE. materiality_finalise's five refusals each name what
   * to do about them — the version must be stated, the requirements are not seeded for it, these
   * sub-topics are outstanding — and no wrapper here would put any of them better. Same posture as
   * the reassign call above.
   */
  async function finalise() {
    setFinalising(true); setFinaliseError(null)
    const { error } = await supabase.rpc('materiality_finalise', { p_assessment_id: assessmentId })
    setFinalising(false)
    if (error) { setFinaliseError(error.message); return }

    // ⚠️ RE-READ, DO NOT PATCH. The RPC returns version and finalised_at and it is tempting to set
    // them locally. But `ready` and `latest` BOTH move on a successful finalise, and the outstanding
    // and scope counts are computed server-side — patching two of five fields would leave this
    // screen holding a second, partial model of a fact the RPC already owns. One question, asked
    // again.
    await load()
  }

  const finaliseButton = (label: string, quiet = false) => (
    <button onClick={() => void finalise()} disabled={finalising}
            style={{ ...(quiet ? btn : btnPrimary), marginTop: 12,
                     opacity: finalising ? 0.5 : 1,
                     cursor: finalising ? 'wait' : 'pointer' }}>
      {finalising ? 'Finalising…' : label}
    </button>
  )

  /**
   * ⚠️ `reason` IS RENDERED, NEVER INFERRED. Four reasons need four different sentences and, for one
   * of them, a different kind of help entirely. Deducing which from outstanding_count and
   * scope_count would put the RPC's precedence — version, then requirements, then scope, then
   * outstanding — in a second place, which is what migration 20260850 exists to prevent.
   *
   * ⚠️ THE DEFAULT BRANCH IS NOT DEAD CODE. If a later migration adds a fifth reason this screen
   * must not render nothing. It prints the message the RPC sent and says the reason was not
   * recognised: a worse card than a tailored one, and a far better one than a blank.
   */
  const notReadyBody = (r: Readiness) => {
    const p: React.CSSProperties = { fontSize: 12.5, color: INK, lineHeight: 1.8, margin: 0 }
    switch (r.reason) {
      case 'version_not_stated':
        return (
          <>
            <p style={p}>{r.message}</p>
            {/* ⚠️ NO LINK, DELIBERATELY. Nothing in this application sets standard_version after an
                assessment is created — it is written once by /api/materiality from the wizard and
                no screen updates it. A link here would go nowhere, and "set it on the assessment"
                pointing at a page with no control is worse than saying plainly that we cannot help
                from here. The noVersion block higher up this same page has the same gap and the
                same silence; closing it needs an edit surface, not a link. */}
            <p style={{ ...p, marginTop: 8 }}>
              {/* This read "There is no way to change this from the application yet. Contact us and
                  we will set it." until 22 Aug 2026, when the edit screen made it false. */}
              <Link href={`/dashboard/materiality/assessment/${assessmentId}/edit`}
                    style={{ color: PURPLE }}>State it on this assessment</Link>, then finalise.
            </p>
          </>
        )
      case 'no_requirements_for_version':
      case 'no_scope':
        return <p style={p}>{r.message}</p>
      case 'outstanding_determinations':
        return (
          <>
            <p style={p}>{r.message}</p>
            {/* The named pairs, listed rather than only counted — the same reasoning as
                materiality_lead_submit's named-missing list (20260844:117-136): a preparer told
                "4 outstanding" must go and find them. The DIRECTION is shown because a sub-topic
                submitted for harm and not for benefit is not finished, and the pair is what says
                so. */}
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, color: MID,
                         lineHeight: 1.9 }}>
              {r.outstanding.map(o => (
                <li key={`${o.subtopic_code}:${o.direction}`}>
                  {nameFor(o.subtopic_code).title}
                  <span style={{ color: MUTE }}>
                    {' '}— {o.direction === 'negative' ? 'as a harm' : 'as a benefit'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
      default:
        return (
          <>
            <p style={p}>
              {r.message ?? 'This assessment cannot be finalised yet, and no reason was given.'}
            </p>
            <p style={{ ...p, color: MUTE, marginTop: 8 }}>
              This reason was not recognised by the screen, so it is shown as the server sent it.
              That is a gap here, not in your work.
            </p>
          </>
        )
    }
  }

  const submittedFromScope = determinations.filter(
    d => d.status === 'submitted' && scopeCodes.has(d.subtopic_code)).length

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/dashboard/materiality/worksheet" style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← All worksheets</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}/determine`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Your own determinations</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}/determinations`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>All determinations</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}/iro-1`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>IRO-1 disclosure</Link>
          {round && <Link href={`/dashboard/materiality/survey/${round.id}/results`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Survey results</Link>}
        </div>

        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>
          {assessment.company_name || 'Impact worksheet'}
        </div>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 4, marginBottom: 20 }}>
          Assign the severity work · {scope.length} sub-topics in scope
          {scope.length > 0 && ` · ${unassigned.length} not yet assigned`}
        </div>

        {/* ── scope provenance. Stated, because where the list came from changes what it means. ── */}
        {noVersion ? (
          <div style={{ ...CARD, background: FAIL_BG, borderColor: FAIL }}>
            <div style={{ fontSize: 13, color: INK, lineHeight: 1.8 }}>
              <strong>This assessment states no ESRS standard version, so nothing can be assigned.</strong>{' '}
              Every sub-topic is identified by its code <em>and</em> its standard version — the two
              together are what the database stores — so without a version there is no sub-topic to
              point at.{' '}
              {/* Until 22 Aug 2026 this sentence ended here, telling a customer to do something the
                  application gave them no way to do. */}
              <Link href={`/dashboard/materiality/assessment/${assessmentId}/edit`}
                    style={{ color: PURPLE }}>State the version on this assessment</Link>{' '}
              and the sub-topics appear.
            </div>
          </div>
        ) : scopeSource === 'round' ? (
          <div style={{ background: BLUE_BG, border: `0.5px solid ${BLUE}`, borderRadius: 12,
                        padding: '12px 16px', marginBottom: 18, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            <strong>Scope is inherited from “{round?.name}”</strong> and is not chosen again here — the
            {' '}{scope.length} sub-topics below are the ones that round asked about. Changing what is
            in scope is done on the round, so the survey and the assessment cannot come to disagree
            about what was assessed.
          </div>
        ) : (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 12,
                        padding: '12px 16px', marginBottom: 18, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            <strong>No survey round is linked to this assessment</strong>, so the list below is every
            ESRS sub-topic for this standard version, and the wording is the standard’s own rather
            than the plainer wording a survey round carries. Linking a closed round narrows it to what
            you actually asked about.
          </div>
        )}

        {/* ── survey round ──────────────────────────────────────────────────────────────────
            The link this table has never had written to it. Three screens have been sitting in
            their "no round linked" branch for want of this control. */}
        <div style={CARD}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: INK, marginBottom: 6 }}>
            Survey round
          </div>

          {noVersion ? (
            /* ⚠️ NO PICKER AT ALL — not an empty list and not a disabled button. There is nothing
               to choose between, and the fix is on the assessment. The guard's own reasoning. */
            <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8 }}>
              This assessment does not state which ESRS version it was prepared under, so no survey
              round can inform it. Not stated is a real state here, never an assumed version:
              Article 2(2) of Del. Reg. C(2026) 5010 requires the undertaking to state the version,
              and assuming one would be a false statement about which law was applied. State the
              version on the assessment first.
            </div>
          ) : (
            <>
              {/* ⚠️ THE REASONING LIVES HERE, ONCE. It used to sit on every unclosed row, so
                  three unclosed rounds meant three copies of a paragraph already read — and it
                  buried the only part that differed, which is the status and the link. */}
              <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 14 }}>
                Linking a closed round narrows the list below to the sub-topics you actually asked
                about, and brings what respondents said alongside your own determinations. Only a
                closed round can be used: an assessment has to consume a survey whose figures cannot
                change afterwards, or a report saying “9 of 12” one day and “9 of 19” the next
                cannot say which it was, and both were true when printed. Closing stays reversible
                until an assessment consumes the round.
              </div>

              {linkedIds.length > 0 && (
                <div style={{ background: BLUE_BG, border: `0.5px solid ${BLUE}`, borderRadius: 10,
                              padding: '10px 14px', marginBottom: 14, fontSize: 12, color: INK,
                              lineHeight: 1.75 }}>
                  <strong>Scope comes from the first round linked here</strong>
                  {round?.name ? ` — “${round.name}”.` : '.'} Linking another records it alongside;
                  the two are not merged, and the sub-topics below stay the first round’s.
                  {linkedIds.length > 1 && ` ${linkedIds.length} rounds are linked.`}
                </div>
              )}

              {linkError && (
                <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10,
                              padding: '10px 14px', marginBottom: 14, fontSize: 12, color: INK,
                              lineHeight: 1.75 }}>
                  {linkError}
                </div>
              )}
              {linkNote && (
                <div style={{ background: GREEN_BG, border: `0.5px solid ${GREEN}`, borderRadius: 10,
                              padding: '10px 14px', marginBottom: 14, fontSize: 12, color: INK,
                              lineHeight: 1.75 }}>
                  {linkNote}
                </div>
              )}

              {allRounds.length === 0 ? (
                <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.8 }}>
                  You have not created a survey round yet. An assessment does not need one — the
                  list below is then every sub-topic for this standard version — but a round is what
                  brings stakeholder answers into it.{' '}
                  <Link href="/dashboard/materiality/survey" style={{ color: PURPLE }}>Surveys</Link>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {allRounds.map(r => {
                    const isLinked = linkedIds.includes(r.id)
                    const isEarliest = earliestLinked === r.id
                    const closed = r.status === 'closed'
                    const versionMatches = r.standard_version === assessment.standard_version
                    // Only the earliest link can have informed anything. See submittedFromScope.
                    const blockedBy = isEarliest ? submittedFromScope : 0
                    const busy = linkWorking === r.id

                    return (
                      <div key={r.id} style={{ border: `0.5px solid ${LINE}`, borderRadius: 10,
                                               padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
                                      flexWrap: 'wrap', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                              {r.name}
                              {isLinked && (
                                <span style={{ fontSize: 11, color: BLUE, fontWeight: 600,
                                               background: BLUE_BG, borderRadius: 999,
                                               padding: '2px 9px', marginLeft: 8 }}>Linked</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: MUTE, marginTop: 3 }}>
                              {statusWord(r.status)}
                              {versionLabel(r.standard_version) && ` · ${versionLabel(r.standard_version)}`}
                            </div>
                          </div>

                          {/* The one action this row offers, or none. */}
                          {isLinked ? (
                            /* ⚠️ SHOWN AND DISABLED WHEN REFUSED, never removed. A control that
                               vanishes reads as a feature that does not exist; one that is
                               visibly unavailable sends the reader to the sentence below it. */
                            <button onClick={() => void unlinkRound(r.id)}
                                    disabled={busy || blockedBy > 0}
                                    style={{ ...btn, opacity: busy || blockedBy > 0 ? 0.45 : 1,
                                             cursor: blockedBy > 0 ? 'not-allowed' : 'pointer' }}>
                              {busy ? 'Unlinking…' : 'Unlink'}
                            </button>
                          ) : closed && versionMatches ? (
                            <button onClick={() => void linkRound(r.id)} disabled={busy}
                                    style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}>
                              {busy ? 'Linking…' : 'Use this round'}
                            </button>
                          ) : null}
                        </div>

                        {/* Why this row is as it is. One sentence, always present. */}
                        <div style={{ fontSize: 11.5, color: MID, lineHeight: 1.75, marginTop: 8 }}>
                          {isLinked ? (
                            isEarliest ? (
                              blockedBy > 0 ? (
                                <>The sub-topics below come from this round, and {blockedBy}{' '}
                                {blockedBy === 1 ? 'determination has' : 'determinations have'} been
                                submitted against them. Unlinking is not offered: those
                                determinations were made about questions this round asked, and
                                removing the link would leave them citing evidence the assessment no
                                longer holds.</>
                              ) : (
                                <>The sub-topics below come from this round. Nothing has been
                                submitted against them yet, so it can still be unlinked.</>
                              )
                            ) : (
                              <>Recorded on this assessment, but not where the sub-topics below come
                              from — that is the first round linked. Nothing has been drawn from
                              this one.</>
                            )
                          ) : !closed ? (
                            /* Only what is specific to this row. The why is in the intro. */
                            <>This round is {statusWord(r.status)}.{' '}
                            <Link href={`/dashboard/materiality/survey/${r.id}`}
                                  style={{ color: PURPLE }}>Open this round</Link></>
                          ) : !versionMatches ? (
                            versionLabel(r.standard_version) && versionLabel(assessment.standard_version) ? (
                              <>This round was built against {versionLabel(r.standard_version)}, and
                              this assessment is prepared under{' '}
                              {versionLabel(assessment.standard_version)}. The two taxonomies differ
                              in name, in count and in structure, so this round’s answers are keyed
                              to sub-topics that do not exist in this assessment.</>
                            ) : (
                              /* One of the two has no customer wording. The difference is still
                                 stated; neither code is shown to stand in for it. */
                              <>This round was built against a different version of the standard
                              from this assessment. The two taxonomies differ in name, in count and
                              in structure, so this round’s answers are keyed to sub-topics that do
                              not exist in this assessment.</>
                            )
                          ) : (
                            <>Closed, and built against the same version as this assessment.</>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── contributors ──────────────────────────────────────────────────────────────────── */}
        <div style={CARD}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: INK, marginBottom: 6 }}>
            Who is determining what
          </div>
          <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 16 }}>
            An HR director assessing workplace severity is more defensible than one person assessing
            everything. Each sub-topic has exactly one assignee, and their determination is the one
            that stands — you can supersede it later, with a reason that appears in the report.
          </div>

          {live.length === 0 && (
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.7, marginBottom: 14 }}>
              Nobody added yet. Anything you do not assign stays with you.
            </div>
          )}

          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {live.map(a => {
              const mine = assigned.filter(s => s.assignment_id === a.id).length
              return (
                <div key={a.id} style={{ border: `0.5px solid ${LINE}`, borderRadius: 10,
                                         padding: '12px 14px', display: 'flex',
                                         justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                                         alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                      {a.contributor_name || a.contributor_email || 'Unnamed contributor'}
                      {a.contributor_role && (
                        <span style={{ fontSize: 11.5, color: MUTE, fontWeight: 400 }}> · {a.contributor_role}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: MUTE, marginTop: 3 }}>
                      {a.contributor_email || 'no email'} · {mine} {mine === 1 ? 'sub-topic' : 'sub-topics'}
                      {' · '}{submittedBy[a.id] ?? 0} determinations submitted
                    </div>
                    {/* ⚠️ THE SEND STATE, SAID OUT LOUD. Until 20260852 this row carried
                        status 'invited' and an invited_at from the moment it was created, so a
                        colleague nobody had emailed was indistinguishable from one who had been —
                        and the screen simply did not mention it, which is why nobody noticed. Now
                        the row can only say "invited" if /api/impact-invite confirmed a send, and
                        this line prints whichever is true. */}
                    <div style={{ fontSize: 11, color: a.invited_at ? MID : AMBER, marginTop: 3 }}>
                      {a.invited_at
                        ? <>Invited {fmt(a.invited_at)}
                            {a.reminder_sent_at && <> · reminded {fmt(a.reminder_sent_at)}</>}</>
                        : <>Added {fmt(a.created_at)} — <strong>not yet invited</strong></>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* No email, no send — and the button says which of the two states it is in
                        rather than being disabled with no reason given. */}
                    <button
                      onClick={() => void sendInvite(a, a.invited_at ? 'reminder' : 'invite')}
                      disabled={working || sending === a.id || !a.contributor_email || mine === 0}
                      title={!a.contributor_email ? 'This contributor has no email address.'
                             : mine === 0 ? 'Assign them some sub-topics first.' : undefined}
                      style={{ ...btnPrimary,
                               opacity: (!a.contributor_email || mine === 0) ? 0.4 : 1,
                               cursor: (!a.contributor_email || mine === 0) ? 'not-allowed' : 'pointer' }}>
                      {sending === a.id ? 'Sending…' : a.invited_at ? 'Send reminder' : 'Send invitation'}
                    </button>
                    <button onClick={() => setConfirmRevoke(a)} disabled={working} style={btn}>
                      Withdraw access
                    </button>
                  </div>
                  {/* ⚠️ PERSISTS, and shows the reason. Every refusal the route can return names
                      something actionable — no email, no sub-topics assigned, access withdrawn,
                      already submitted, or Resend's own words verbatim. A three-second badge would
                      hide all of them behind "✗". */}
                  {sendResult[a.id] && (
                    <div style={{ flexBasis: '100%', fontSize: 11.5, lineHeight: 1.7,
                                  color: sendResult[a.id].ok ? GREEN : FAIL }}>
                      {sendResult[a.id].msg}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ⚠️ REVOKED ASSIGNMENTS STAY VISIBLE, WITH THEIR WORK COUNTED. Hiding them would make
              withdrawing access look like a way to detach evidence from its author. */}
          {revoked.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: MID, marginBottom: 8 }}>
                Access withdrawn
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {revoked.map(a => {
                  const rows = rowsBy[a.id] ?? 0
                  return (
                    <div key={a.id} style={{ border: `0.5px solid ${LINE}`, borderRadius: 10,
                                             padding: '12px 14px', background: PAPER }}>
                      <div style={{ fontSize: 13, color: INK }}>
                        {a.contributor_name || a.contributor_email || 'Unnamed contributor'}
                        {a.contributor_role && <span style={{ color: MUTE }}> · {a.contributor_role}</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: MID, marginTop: 5, lineHeight: 1.7 }}>
                        Access withdrawn {fmt(a.revoked_at)}.{' '}
                        {rows > 0
                          ? <><strong>{rows} {rows === 1 ? 'determination remains' : 'determinations remain'} attributed to them</strong>{' '}
                              and {rows === 1 ? 'is' : 'are'} unaffected — what was withdrawn is the access, not the judgement.</>
                          : <>They had made no determinations.</>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 10 }}>Add a colleague</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <input style={input} placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
              <input style={input} placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              <input style={input} placeholder="Role, e.g. HR Director" value={newRole} onChange={e => setNewRole(e.target.value)} />
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={addContributor} disabled={working || noVersion} style={btnPrimary}>Add</button>
              <span style={{ fontSize: 11, color: MUTE }}>
                Adding does not send anything. Invitations go out once the contributor form exists.
              </span>
            </div>
            {addError && (
              <div style={{ marginTop: 10, fontSize: 12, color: FAIL, lineHeight: 1.7 }}>{addError}</div>
            )}
          </div>

          {/* ⚠️ THIS BANNER USED TO STATE A REASON THAT HAD STOPPED BEING TRUE, which is the defect
              this module names most often: it said "there is no contributor form and no token path
              yet — 20260838 grants anon nothing and no resolve-token RPC exists". Both clauses were
              false by 20260840, which grants impact_get / impact_save_determination / impact_submit
              to anon (:523-525), and app/impact/[token]/page.tsx has existed alongside them. The
              only true part was that nothing could send, and that was the part the sentence buried.
              Sending now exists, so what remains is the one honest instruction: assign first. */}
          <div style={{ marginTop: 16, background: PAPER, border: `0.5px solid ${LINE}`,
                        borderRadius: 10, padding: '12px 14px', fontSize: 12, color: MID, lineHeight: 1.75 }}>
            <strong style={{ color: INK }}>Divide the sub-topics before you invite anyone.</strong>{' '}
            An invitation names how many topics the colleague has been asked to judge, and their
            screen shows exactly those — so Send stays closed until they have some. Nothing is sent
            when you add a colleague; the invitation goes only when you send it, and this list says
            who has had one.
          </div>
        </div>

        {/* ── assignment ────────────────────────────────────────────────────────────────────── */}
        {!noVersion && scope.length > 0 && (
          <div style={CARD}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: INK, marginBottom: 6 }}>
              Divide the sub-topics
            </div>
            <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 6 }}>
              Grouped by ESRS topic. The grouping is ordering only — assignment is always per
              sub-topic, and anything left unassigned is yours to determine.
            </div>

            {actionNote && (
              <div style={{ background: GREEN_BG, border: `0.5px solid ${GREEN}`, borderRadius: 10,
                            padding: '10px 14px', margin: '12px 0', fontSize: 12.5, color: INK,
                            display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span>{actionNote}</span>
                {lastAssign && (
                  <button onClick={undoAssign} disabled={working}
                          style={{ ...btn, padding: '4px 12px', fontSize: 11.5 }}>Undo</button>
                )}
              </div>
            )}

            {actionError && (
              <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10,
                            padding: '10px 14px', margin: '12px 0', fontSize: 12.5, color: INK, lineHeight: 1.7 }}>
                {actionError}
              </div>
            )}

            {rowErrors.length > 0 && (
              <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                            padding: '12px 14px', margin: '12px 0', fontSize: 12, color: INK, lineHeight: 1.75 }}>
                <strong>{rowErrors.length} {rowErrors.length === 1 ? 'sub-topic was' : 'sub-topics were'} refused.</strong>{' '}
                Everything else went through.
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {rowErrors.map((e, i) => (
                    <div key={i}><strong>{e.code}</strong> — {e.message}</div>
                  ))}
                </div>
              </div>
            )}

            {/* action bar */}
            <div style={{ position: 'sticky', top: 0, background: '#fff', paddingTop: 12,
                          paddingBottom: 12, borderBottom: `1px solid ${LINE}`, marginBottom: 12,
                          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', zIndex: 2 }}>
              <span style={{ fontSize: 12, color: selected.size ? INK : MUTE, fontWeight: selected.size ? 600 : 400 }}>
                {selected.size} selected
              </span>
              <select value={target} onChange={e => setTarget(e.target.value)}
                      style={{ ...input, width: 'auto', minWidth: 190 }}>
                <option value="">Assign to…</option>
                {live.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}
              </select>
              <button onClick={startAssign} disabled={working || !target || selected.size === 0}
                      style={{ ...btnPrimary, opacity: (!target || selected.size === 0) ? 0.5 : 1 }}>
                Assign
              </button>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} style={btn}>Clear selection</button>
              )}
              {unassigned.length > 0 && (
                <button onClick={() => setSelected(new Set(unassigned.map(s => s.subtopic_code)))}
                        style={btn}>Select the {unassigned.length} unassigned</button>
              )}
            </div>

            {groups.map(g => (
              <div key={g.code} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                              gap: 10, paddingBottom: 6, borderBottom: `1px solid ${LINE}`, marginBottom: 8 }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: INK }}>
                    {g.label} <span style={{ fontSize: 11, color: MUTE }}>{g.code}</span>
                  </div>
                  <button
                    onClick={() => {
                      const next = new Set(selected)
                      const codes = g.rows.map(r => r.subtopic_code)
                      const allIn = codes.every(c => next.has(c))
                      for (const c of codes) allIn ? next.delete(c) : next.add(c)
                      setSelected(next)
                    }}
                    style={{ ...btn, padding: '3px 10px', fontSize: 11 }}>
                    Select all {g.rows.length}
                  </button>
                </div>

                {g.rows.map(s => {
                  const owner = assigneeOf[s.subtopic_code]
                  const isSel = selected.has(s.subtopic_code)
                  const submitted = determinations.some(
                    d => d.subtopic_code === s.subtopic_code && d.status === 'submitted')
                  return (
                    <label key={s.subtopic_code}
                           style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 10px',
                                    borderRadius: 8, cursor: 'pointer',
                                    background: isSel ? '#f6f1fe' : 'transparent' }}>
                      <input type="checkbox" checked={isSel}
                             onChange={() => toggle(s.subtopic_code)} />
                      <span style={{ flex: 1, fontSize: 13, color: INK, minWidth: 0 }}>
                        {nameFor(s.subtopic_code).title}
                        {nameFor(s.subtopic_code).code && (
                          <span style={{ fontSize: 11, color: MUTE }}> {nameFor(s.subtopic_code).code}</span>
                        )}
                      </span>
                      <span style={{ fontSize: 11.5, color: owner ? INK : MUTE, textAlign: 'right' }}>
                        {owner ? label(byId[owner]) : 'you'}
                        {submitted && (
                          <span style={{ color: GREEN, marginLeft: 8, fontWeight: 600 }}>submitted</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        {/* ── FINALISE ──────────────────────────────────────────────────────────────────────────
            LAST, because it concludes the three cards above it: the round sets scope, contributors
            take sub-topics, assignment distributes them, and this records the result. Higher up it
            would ask a preparer to conclude before seeing what is outstanding.

            A CARD, NOT A ROUTE, unlike IRO-1. That screen is five fields with three states each and a
            submit of its own; this is one control and one status line, and it belongs beside the work
            it concludes.

            ⚠️ WHAT FINALISING DOES, AND WHY IT IS NOT JUST A FLAG. materiality_finalise (20260849)
            copies every disclosure requirement row in force for the assessment's stated ESRS version
            into materiality_finalisation_requirements. THE COPY IS THE POINT: that reference table
            changes — 20260845 rewrote E1-11's title on 21 Aug 2026 — and without a frozen copy the
            same report generated twice can print different requirement text.

            ⚠️ RE-FINALISATION PROMPTING IS NOT HERE, AND CANNOT BE YET. A card saying "this has
            changed since you finalised" would need to know the DETERMINATIONS moved. Nothing records
            that: materiality_finalisations freezes the requirement ROWS only, and the RPC's
            requirements_changed is about those rows, not about the assessment. Finalising again is
            offered where it is possible, with NO claim that it is needed — because we cannot know.
            Making that claim requires snapshotting determinations too, which is its own design. */}
        <div style={CARD}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: INK, marginBottom: 6 }}>
            Finalise this assessment
          </div>

          {readinessError ? (
            <div style={{ background: FAIL_BG, border: `0.5px solid color-mix(in srgb, ${FAIL} 20%, transparent)`, borderRadius: 10,
                          padding: '12px 14px', fontSize: 12.5, color: INK, lineHeight: 1.8 }}>
              The finalisation status could not be read, so this card cannot say whether the assessment
              is ready. Nothing has changed. {readinessError}
            </div>
          ) : !readiness ? (
            <div style={{ fontSize: 12.5, color: MUTE }}>Checking…</div>
          ) : (() => {
            const r = readiness
            // ⚠️ TWO FIELDS DECIDE WHICH OF FOUR CARDS: `latest` (has it ever been finalised) and
            // `ready` (can it be finalised now). BOTH COME FROM THE RPC. Neither is computed here,
            // and `ready` in particular must never be derived from outstanding_count — see the note
            // on Readiness in lib/materiality/finalisation.ts.
            const stamp = finalisationStamp(r.latest)
            return (
              <>
                {stamp && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap',
                                marginBottom: 10 }}>
                    {/* Inlined rather than imported: Chip is defined on the determinations and
                        register pages, and pulling one route module's component into another to
                        avoid nine lines would couple two screens that have no other relationship.
                        Same styling, deliberately, so the three read as one badge. */}
                    <span style={{ background: GREEN_BG, color: GREEN, border: `0.5px solid color-mix(in srgb, ${GREEN} 20%, transparent)`,
                                   borderRadius: 999, padding: '2px 9px', fontSize: 10.5,
                                   fontWeight: 600 }}>{stamp.toUpperCase()}</span>
                    <span style={{ fontSize: 11.5, color: MUTE }}>
                      {r.requirements_available} disclosure requirements frozen
                    </span>
                  </div>
                )}

                {!r.ready && (
                  <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                                padding: '12px 14px' }}>
                    {/* State 4 when a stamp is present: finalised, and since then something moved
                        back to draft. BOTH HALVES ARE SHOWN — the chip above, this below — because
                        either alone would be a half-truth. */}
                    {stamp && (
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: AMBER, marginBottom: 6 }}>
                        Something has changed since this was finalised
                      </div>
                    )}
                    {notReadyBody(r)}
                  </div>
                )}

                {/* ⚠️ NO BUTTON AT ALL WHEN NOT READY — not a disabled one. wizardSteps.ts's lesson is
                    that a control which cannot act must say what it is waiting for; here the card
                    already IS that sentence, and a greyed button beneath a paragraph naming four
                    outstanding pairs adds nothing but something to click at. */}
                {r.ready && !stamp && (
                  <>
                    <p style={{ fontSize: 12.5, color: INK, lineHeight: 1.8, margin: 0 }}>
                      Finalising records the assessment as it stands and takes a copy of the disclosure
                      requirements in force today, so the report does not change afterwards if the
                      standard text is later corrected.
                    </p>
                    {finaliseButton('Finalise this assessment')}
                  </>
                )}

                {r.ready && stamp && (
                  <>
                    <p style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.8, margin: 0 }}>
                      Nothing is outstanding. Finalising again takes a fresh copy of the requirements
                      and records a new version; the existing one is kept.
                    </p>
                    {finaliseButton('Finalise again', true)}
                  </>
                )}

                {finaliseError && (
                  <div style={{ background: FAIL_BG, border: `0.5px solid color-mix(in srgb, ${FAIL} 20%, transparent)`, borderRadius: 8,
                                padding: '10px 13px', marginTop: 12, fontSize: 12, color: INK,
                                lineHeight: 1.75 }}>
                    {finaliseError}
                  </div>
                )}
              </>
            )
          })()}
        </div>

      </div>


      {/* ── the move confirmation ─────────────────────────────────────────────────────────────
          ⚠️ A NUMBER, BEFORE THE FACT. "This may clear some answers" is the warning that gets
          clicked through. The count comes from the determination rows already loaded — the same
          rows the function will clear — and the message afterwards reports what the function
          actually returned, so the two can be compared rather than assumed equal. */}
      {confirmMove && (
        <Modal>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: INK, marginBottom: 10 }}>
            Move {confirmMove.moves.length} {confirmMove.moves.length === 1 ? 'sub-topic' : 'sub-topics'} to {confirmMove.toLabel}?
          </div>
          <div style={{ fontSize: 13, color: MID, lineHeight: 1.8 }}>
            {confirmMove.fresh.length > 0 && (
              <>{confirmMove.fresh.length} unassigned {confirmMove.fresh.length === 1 ? 'sub-topic' : 'sub-topics'} will also be assigned.{' '}</>
            )}
            {confirmMove.draftRows > 0 ? (
              <><strong>{confirmMove.draftRows} draft {confirmMove.draftRows === 1 ? 'answer' : 'answers'} will be
              cleared</strong> so that whatever {confirmMove.toLabel} submits is theirs. Carrying half-finished
              answers across would record them under the wrong person’s name, and nothing afterwards
              could tell.</>
            ) : (
              <>No draft answers exist on {confirmMove.moves.length === 1 ? 'it' : 'them'}, so nothing is lost.</>
            )}
            <div style={{ marginTop: 10 }}>
              A sub-topic with a submitted determination will be refused and stays with the person who
              made it. <strong>This cannot be undone.</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={() => setConfirmMove(null)} disabled={working} style={btn}>Cancel</button>
            <button onClick={() => runAssign(confirmMove.fresh, confirmMove.moves, confirmMove.toId)}
                    disabled={working} style={btnPrimary}>
              {working ? 'Moving…' : 'Move them'}
            </button>
          </div>
        </Modal>
      )}

      {confirmRevoke && (
        <Modal>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: INK, marginBottom: 10 }}>
            Withdraw {label(confirmRevoke)}’s access?
          </div>
          <div style={{ fontSize: 13, color: MID, lineHeight: 1.8 }}>
            Their link stops working. {(rowsBy[confirmRevoke.id] ?? 0) > 0 ? (
              <><strong>The {rowsBy[confirmRevoke.id]} {rowsBy[confirmRevoke.id] === 1 ? 'determination' : 'determinations'} already
              attributed to them {rowsBy[confirmRevoke.id] === 1 ? 'stays' : 'stay'}</strong>, unchanged and still
              theirs — what is withdrawn is the access, not the judgement. They remain listed, with
              the date, so the report can say who determined what.</>
            ) : (
              <>They have made no determinations. They remain listed with the date.</>
            )}
            <div style={{ marginTop: 10 }}>
              Sub-topics they have not submitted can then be moved to someone else.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={() => setConfirmRevoke(null)} disabled={working} style={btn}>Keep it open</button>
            <button onClick={() => revoke(confirmRevoke)} disabled={working} style={btnPrimary}>
              {working ? 'Withdrawing…' : 'Withdraw access'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>{children}</div>
    </div>
  )
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.45)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '1.8rem', maxWidth: 520, width: '100%' }}>
        {children}
      </div>
    </div>
  )
}
