'use client'

/**
 * The contributor's worksheet — screen B. Token-scoped, no account, mirrors /survey/[token].
 *
 * A named colleague — an HR director, a facilities manager — makes the ESRS 1 ¶40-41 severity
 * determination for the sub-topics assigned to them. That division is what makes "assessed with
 * internal experts" a true sentence rather than a claim.
 *
 * ⚠️ NOTHING SURVEY-DERIVED REACHES THIS PAGE, AND THAT IS NOT THIS FILE'S DOING.
 * impact_get's projection (20260840) contains no counter, no distribution, no top-box, no free text
 * and no join to materiality_survey_*. The firewall is in the projection precisely so it cannot be
 * undone here: a page that merely declines to render survey data is one prop away from leaking it.
 * ⚠️ SO DO NOT FETCH ANYTHING ELSE. This page calls exactly three RPCs and reads no table.
 *
 * ⚠️ NO SEVERITY IS SHOWN. lib/materiality/severity.ts is deliberately NOT imported here. The
 * contributor is giving three judgements, not a score; a number that moved as they clicked would
 * invite working backwards from the answer they want, which is the failure the delegated-expert
 * design exists to prevent. Severity appears on the lead's screen and in the report.
 *
 * ⚠️ ALL COPY COMES FROM lib/materiality/severityScale.ts, transcribed from spec v11 §5.3.1/§5.3.2.
 * None of it is written in this file. If a scale point reads badly it is fixed in the spec and
 * re-transcribed, never edited here.
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import {
  SCALE, SCOPE, IRREMEDIABILITY, LIKELIHOOD, NO_VISIBILITY_LABEL,
  worksheetSubtopicHeading,
} from '../../../lib/materiality/severityScale'
// ⚠️ ONE WIDGET. These were defined here; they were extracted so the preparer's own determination
// form asks the identical question with the identical controls. See the component's header.
import { ScaleField, Question, Options, Option } from '../../components/severityFields'

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

type Direction = 'negative' | 'positive'

type Determination = {
  nature: 'actual' | 'potential' | null
  scale: number | null
  scope: number | null
  irremediability: number | null
  likelihood: number | null
  abstained_dimensions: string[] | null
  value_chain_position: string[] | null
  time_horizon: string | null
  rationale: string | null
  status: string
}
type SubTopic = {
  subtopic_code: string
  topic_code: string
  topic_label: string
  short_name: string
  context: string | null
  determinations: { negative: Determination | null; positive: Determination | null }
}
type Payload = {
  contributor: { name: string | null; role: string | null; expires_at: string }
  assessment: { company_name: string | null; standard_version: string | null }
  subtopics: SubTopic[]
}

type Draft = {
  nature: 'actual' | 'potential' | null
  scale: number | null
  scope: number | null
  irremediability: number | null
  likelihood: number | null
  /**
   * ⚠️ WHICH DIMENSIONS WERE RECORDED AS "not enough visibility to assess" (§6.1).
   * Explicit since 20260841, because a bare null could not be told from a question nobody had
   * reached — so a saved abstention came back unselected. Membership here IS the recorded answer.
   */
  abstained: string[]
  vcp: string[]
  horizon: string | null
  rationale: string
  started: boolean
}

const VCP = [
  { code: 'own_operations', label: 'Our own operations' },
  { code: 'upstream', label: 'Upstream — our suppliers' },
  { code: 'downstream', label: 'Downstream — our customers and products' },
]
const HORIZONS = [
  { code: 'short', label: 'Short — within a year' },
  { code: 'medium', label: 'Medium — one to five years' },
  { code: 'long', label: 'Long — more than five years' },
]

const key = (code: string, dir: Direction) => `${code}::${dir}`

const emptyDraft = (): Draft => ({
  nature: null, scale: null, scope: null, irremediability: null,
  likelihood: null, abstained: [], vcp: [], horizon: null, rationale: '', started: false,
})

/**
 * One dimension changing, as a patch. `null` means the contributor chose "not enough visibility to
 * assess" — a recorded answer, so the dimension joins `abstained` rather than merely going blank.
 * A score removes it again: the two states are mutually exclusive and the database refuses a row
 * that claims both.
 */
const setDim = (d: Draft, dim: 'scale' | 'scope' | 'irremediability' | 'likelihood',
                v: number | null): Partial<Draft> => ({
  [dim]: v,
  abstained: v === null
    ? (d.abstained.includes(dim) ? d.abstained : [...d.abstained, dim])
    : d.abstained.filter(x => x !== dim),
})

const fromServer = (d: Determination | null): Draft =>
  !d ? emptyDraft() : {
    nature: d.nature, scale: d.scale, scope: d.scope,
    irremediability: d.irremediability, likelihood: d.likelihood,
    abstained: d.abstained_dimensions || [],
    vcp: d.value_chain_position || [], horizon: d.time_horizon,
    rationale: d.rationale || '',
    started: true,
  }

export default function ImpactWorksheet() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [deadLink, setDeadLink] = useState(false)
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [blockError, setBlockError] = useState<Record<string, string>>({})
  const [blockNote, setBlockNote] = useState<Record<string, string>>({})

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)

  useEffect(() => { load() }, [token])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('impact_get', { p_token: token })

    if (error) {
      /**
       * ⚠️ THREE OUTCOMES, THREE SCREENS. Showing the dead-link screen for all of them would tell a
       * contributor their link had expired when the real cause was something else — an error message
       * naming a cause it cannot verify, which is the failure CLAUDE.md records four instances of.
       *
       * PT410  their part is submitted. NOT an error, and it must not render as one.
       * P0002  unknown / revoked / expired — deliberately indistinguishable, one screen.
       * other  surfaced as given, because a guess would be worse than the server's own sentence.
       */
      if (error.code === 'PT410') setSubmittedMessage(error.message || 'Your part has been submitted.')
      else if (error.code === 'P0002' || error.message === 'invalid token') setDeadLink(true)
      else setLoadError(error.message || 'The worksheet did not load, and returned no reason.')
      setLoading(false)
      return
    }

    if (!data) {
      // impact_get raises rather than returning null. If this fires, say what was observed rather
      // than inventing a cause — a blank screen would be the same defect one layer up.
      setLoadError('The worksheet returned no data and no error. Nothing was loaded.')
      setLoading(false)
      return
    }

    const p = data as Payload
    setPayload(p)

    const next: Record<string, Draft> = {}
    for (const s of p.subtopics) {
      next[key(s.subtopic_code, 'negative')] = fromServer(s.determinations?.negative ?? null)
      next[key(s.subtopic_code, 'positive')] = fromServer(s.determinations?.positive ?? null)
    }
    setDrafts(next)
    setLoading(false)
  }

  const save = async (code: string, dir: Direction, d: Draft) => {
    const k = key(code, dir)
    setSaving(s => ({ ...s, [k]: true }))
    setBlockError(e => { const n = { ...e }; delete n[k]; return n })

    const { error } = await supabase.rpc('impact_save_determination', {
      p_token: token,
      p_subtopic_code: code,
      p_direction: dir,
      p_nature: d.nature,
      p_scale: d.scale,
      p_scope: d.scope,
      // ⚠️ SENT AS NULL WHERE ¶41 FORBIDS THEM, because the form never offers them there. This is
      // not the form quietly dropping an answer — a value that was never asked for cannot be
      // discarded. Where the contributor's own change makes one inapplicable, they are told: see
      // setNature below.
      p_irremediability: dir === 'negative' ? d.irremediability : null,
      p_likelihood: d.nature === 'potential' ? d.likelihood : null,
      // ⚠️ FILTERED THE SAME WAY THE VALUES ARE. ESRS 1 ¶41: a dimension that is never asked cannot
      // be abstained on either — there is no question to decline — and 20260841 refuses it.
      p_abstained_dimensions: d.abstained.filter(x =>
        (x !== 'irremediability' || dir === 'negative') &&
        (x !== 'likelihood' || d.nature === 'potential')),
      p_value_chain_position: d.vcp,
      p_time_horizon: d.horizon,
      p_rationale: d.rationale.trim() || null,
    })

    setSaving(s => ({ ...s, [k]: false }))
    // The server's own sentence, verbatim. A ¶41 refusal already explains that the answer was not
    // saved rather than quietly dropped, and no wrapper here could say it better.
    if (error) setBlockError(e => ({ ...e, [k]: error.message }))
    else setDrafts(cur => ({ ...cur, [k]: { ...d, started: true } }))
  }

  /** Local only. Used where a save per keystroke would be one RPC call per character. */
  const edit = (code: string, dir: Direction, patch: Partial<Draft>) => {
    const k = key(code, dir)
    setDrafts(cur => ({ ...cur, [k]: { ...(cur[k] || emptyDraft()), ...patch } }))
  }

  const update = (code: string, dir: Direction, patch: Partial<Draft>) => {
    const k = key(code, dir)
    const next = { ...(drafts[k] || emptyDraft()), ...patch }
    setDrafts(cur => ({ ...cur, [k]: next }))
    void save(code, dir, next)
  }

  /**
   * ⚠️ CHANGING NATURE TO 'actual' REMOVES A LIKELIHOOD ANSWER, AND SAYS SO.
   * ESRS 1 ¶41: an impact already happening carries no likelihood. The form stops offering it, and
   * the stored value has to go — but the contributor DID answer that question, so removing it in
   * silence would be the discard this module refuses everywhere else. They are told, in the block.
   */
  const setNature = (code: string, dir: Direction, nature: 'actual' | 'potential') => {
    const k = key(code, dir)
    const cur = drafts[k] || emptyDraft()
    const losesLikelihood = nature === 'actual'
      && (cur.likelihood !== null || cur.abstained.includes('likelihood'))
    setBlockNote(n => {
      const copy = { ...n }
      if (losesLikelihood) {
        copy[k] = 'Your likelihood answer has been removed. An impact that is already happening '
                + 'carries no likelihood — applying one would understate how serious it is.'
      } else delete copy[k]
      return copy
    })
    update(code, dir, nature === 'actual'
      ? { nature, likelihood: null, abstained: cur.abstained.filter(x => x !== 'likelihood') }
      : { nature })
  }

  const submit = async () => {
    setSubmitting(true); setSubmitError(null)
    const { data, error } = await supabase.rpc('impact_submit', { p_token: token })
    setSubmitting(false); setConfirmSubmit(false)
    if (error) { setSubmitError(error.message); return }
    setDone((data as { submitted?: number } | null)?.submitted ?? 0)
  }

  /**
   * ⚠️ NEVER mr_esrs_topics.label DIRECTLY — impact_get already overlays the versioned name. What is
   * left is the collision: under ESRS (2026) S1 and S2 resolve to ONE joint title, byte-identical by
   * design. Disambiguated generically, so a later version that splits the title stops the appending
   * on its own.
   */
  const groups = useMemo(() => {
    if (!payload) return []
    const seen: Record<string, Set<string>> = {}
    for (const s of payload.subtopics) (seen[s.topic_label] ||= new Set()).add(s.topic_code)

    const byTopic: Record<string, SubTopic[]> = {}
    const order: string[] = []
    for (const s of payload.subtopics) {
      if (!byTopic[s.topic_code]) { byTopic[s.topic_code] = []; order.push(s.topic_code) }
      byTopic[s.topic_code].push(s)
    }
    return order.map(code => {
      const rows = byTopic[code]
      const label = rows[0].topic_label
      return { code, label: seen[label].size > 1 ? `${label} (${code})` : label, rows }
    })
  }, [payload])

  const totals = useMemo(() => {
    if (!payload) return { done: 0, total: 0 }
    let d = 0
    for (const s of payload.subtopics) {
      for (const dir of ['negative', 'positive'] as Direction[]) {
        if (drafts[key(s.subtopic_code, dir)]?.nature) d++
      }
    }
    return { done: d, total: payload.subtopics.length * 2 }
  }, [payload, drafts])

  // ── refusal and terminal screens ───────────────────────────────────────────────────────────
  if (loading) return <Frame><div style={{ textAlign: 'center', padding: '4rem', color: MUTE }}>Loading…</div></Frame>

  if (submittedMessage) return (
    // ⚠️ NOT AN ERROR FRAME. No red, no fault language. The server's sentence is the whole message.
    <Frame>
      <Card>
        <H>Your part is submitted</H>
        <P>{submittedMessage}</P>
        <P>You can close this page. If something needs changing, ask the person who sent you the
          link — they can record a change, and both versions are kept.</P>
      </Card>
    </Frame>
  )

  if (done !== null) return (
    <Frame>
      <Card>
        <H>Thank you — that is submitted</H>
        <P>{done} {done === 1 ? 'determination' : 'determinations'} recorded against your name.
          Your colleague can see them now.</P>
        <P>This link no longer opens the form. If something needs changing, ask them — they can
          record a change, and what you determined is kept alongside it.</P>
      </Card>
    </Frame>
  )

  if (deadLink) return (
    <Frame>
      <Card>
        <H>This link is not valid</H>
        <P>It may have been withdrawn, it may have expired, or the address may be incomplete. Ask
          the person who sent it to you for a new one.</P>
      </Card>
    </Frame>
  )

  if (loadError || !payload) return (
    <Frame>
      <Card>
        <H>The worksheet could not be opened</H>
        <P>{loadError}</P>
      </Card>
    </Frame>
  )

  const company = payload.assessment.company_name || 'your organisation'

  return (
    <Frame wide>
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: INK }}>
          {company} — impact assessment
        </div>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 6 }}>
          {payload.contributor.name ? `For ${payload.contributor.name}` : 'For you'}
          {payload.contributor.role && `, ${payload.contributor.role}`}
          {' · '}{payload.subtopics.length} {payload.subtopics.length === 1 ? 'topic' : 'topics'}
        </div>
      </div>

      <Card>
        <H small>What you are being asked</H>
        <P>A colleague has asked you to judge how your organisation affects people and the
          environment on the topics below, because you know them better than anyone else here does.
          You are the person whose judgement is recorded — it is kept in your name.</P>
        <P>Each topic is asked twice: once as <strong>harm</strong>, once as <strong>benefit</strong>.
          They are never added together or set against each other — a benefit does not cancel a harm.</P>
        <P><strong>If you cannot judge something, say so.</strong> “{NO_VISIBILITY_LABEL}” is a real
          answer and it is recorded as one. It is never treated as a low score, and a topic nobody
          can see clearly is itself worth knowing about.</P>
        <P style={{ color: MUTE }}>There is no score shown anywhere on this page. You are giving
          judgements, not points, and the arithmetic is done afterwards.</P>
      </Card>

      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: PAPER, padding: '10px 0',
                    borderBottom: `1px solid ${LINE}`, marginBottom: 18, fontSize: 12.5, color: MID }}>
        <strong style={{ color: INK }}>{totals.done} of {totals.total}</strong> started
      </div>

      {groups.map(g => (
        <div key={g.code} style={{ marginBottom: 30 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: INK,
                        paddingBottom: 8, borderBottom: `1px solid ${LINE}`, marginBottom: 16 }}>
            {g.label}
          </div>

          {g.rows.map(s => (
            <div key={s.subtopic_code} style={{ marginBottom: 26 }}>
              {/* ⚠️ THE WORKSHEET'S OWN S1/S2 FRAMING, from §5.3.2 — "on your own workforce" /
                  "on workers in your value chain". NOT the survey's question_framing, which asks
                  what conditions are like where you work. impact_get withholds that string. */}
              <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>
                {worksheetSubtopicHeading(s.short_name, s.topic_code)}
              </div>
              {s.context && (
                <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginBottom: 12,
                              maxWidth: 640 }}>{s.context}</div>
              )}

              {(['negative', 'positive'] as Direction[]).map(dir => (
                <Block
                  key={dir}
                  code={s.subtopic_code} dir={dir}
                  draft={drafts[key(s.subtopic_code, dir)] || emptyDraft()}
                  saving={!!saving[key(s.subtopic_code, dir)]}
                  error={blockError[key(s.subtopic_code, dir)]}
                  note={blockNote[key(s.subtopic_code, dir)]}
                  onNature={setNature}
                  onChange={update}
                  onEdit={edit}
                />
              ))}
            </div>
          ))}
        </div>
      ))}

      <Card>
        <H small>When you are ready</H>
        <P>Submitting records your determinations in your name and closes this link. Your colleague
          can record a change afterwards if they need to, with a reason — and what you determined is
          kept alongside it, not replaced.</P>
        {submitError && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                        padding: '12px 14px', margin: '12px 0', fontSize: 12.5, color: INK, lineHeight: 1.8 }}>
            {submitError}
          </div>
        )}
        <button onClick={() => setConfirmSubmit(true)} disabled={submitting}
                style={{ fontSize: 13.5, fontWeight: 600, padding: '11px 24px', borderRadius: 8,
                         border: 'none', background: INK, color: '#fff', cursor: 'pointer', marginTop: 8 }}>
          Submit my determinations
        </button>
      </Card>

      {confirmSubmit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.45)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.8rem', maxWidth: 500, width: '100%' }}>
            <H small>Submit and close this link?</H>
            <P>Your determinations are recorded in your name. You will not be able to change them
              here afterwards.</P>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setConfirmSubmit(false)} disabled={submitting}
                      style={{ fontSize: 13, padding: '9px 18px', borderRadius: 8,
                               border: `1px solid ${LINE}`, background: '#fff', color: MID, cursor: 'pointer' }}>
                Not yet
              </button>
              <button onClick={submit} disabled={submitting}
                      style={{ fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8,
                               border: 'none', background: INK, color: '#fff', cursor: 'pointer' }}>
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Frame>
  )
}

// ── one direction of one sub-topic ───────────────────────────────────────────────────────────────

function Block({ code, dir, draft, saving, error, note, onNature, onChange, onEdit }: {
  code: string; dir: Direction; draft: Draft; saving: boolean
  error?: string; note?: string
  onNature: (c: string, d: Direction, n: 'actual' | 'potential') => void
  /** Updates state AND saves. */
  onChange: (c: string, d: Direction, patch: Partial<Draft>) => void
  /** Updates state only — for fields where saving per keystroke would be wrong. */
  onEdit: (c: string, d: Direction, patch: Partial<Draft>) => void
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
        <div style={{ fontSize: 11, color: MUTE }}>{saving ? 'Saving…' : draft.started ? 'Saved' : ''}</div>
      </div>

      {/* NATURE FIRST — it branches everything below it. No abstention here: a determination with no
          view on whether something is happening or might happen is not a determination, and
          impact_submit refuses it by name rather than at a constraint. */}
      <Question text={harm ? 'Is this harm already happening, or could it happen?'
                           : 'Is this benefit already happening, or could it happen?'} />
      <Options>
        {(['actual', 'potential'] as const).map(n => (
          <Option key={n} selected={draft.nature === n} onClick={() => onNature(code, dir, n)}
                  badge={n === 'actual' ? '•' : '?'}
                  label={n === 'actual' ? 'Already happening' : 'Could happen'}
                  body={n === 'actual'
                    ? 'It is going on now, or it has happened.'
                    : 'It has not happened, but it could.'} />
        ))}
      </Options>

      {note && (
        <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 8,
                      padding: '10px 13px', margin: '4px 0 14px', fontSize: 12, color: INK, lineHeight: 1.75 }}>
          {note}
        </div>
      )}

      {draft.nature && (
        <>
          <ScaleField def={SCALE} value={draft.scale} abstained={draft.abstained.includes('scale')}
                 onPick={v => onChange(code, dir, setDim(draft, 'scale', v))}
                 heading={harm ? SCALE.heading
                               : 'How much good it does for the people or the environment affected'} />

          <ScaleField def={SCOPE} value={draft.scope} abstained={draft.abstained.includes('scope')}
                 onPick={v => onChange(code, dir, setDim(draft, 'scope', v))} />

          {/* ⚠️ ¶41: no irremediability on a benefit. There is nothing to remediate, the constraint
              refuses it, and offering it would collect an answer the database rejects. */}
          {harm && (
            <ScaleField def={IRREMEDIABILITY} value={draft.irremediability}
                   abstained={draft.abstained.includes('irremediability')}
                   onPick={v => onChange(code, dir, setDim(draft, 'irremediability', v))} />
          )}

          {/* ⚠️ ¶41: no likelihood on something already happening. */}
          {draft.nature === 'potential' && (
            <ScaleField def={LIKELIHOOD} value={draft.likelihood}
                   abstained={draft.abstained.includes('likelihood')}
                   onPick={v => onChange(code, dir, setDim(draft, 'likelihood', v))} />
          )}

          <Question text="Where does it happen?" hint="Choose as many as apply." />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {VCP.map(v => {
              const on = draft.vcp.includes(v.code)
              return (
                <button key={v.code} type="button"
                        onClick={() => onChange(code, dir, {
                          vcp: on ? draft.vcp.filter(x => x !== v.code) : [...draft.vcp, v.code] })}
                        style={{ fontSize: 12.5, padding: '8px 14px', borderRadius: 999,
                                 border: `1px solid ${on ? PURPLE : LINE}`,
                                 background: on ? '#f4ecfe' : '#fff', color: on ? PURPLE : MID,
                                 cursor: 'pointer', fontWeight: on ? 600 : 400 }}>
                  {v.label}
                </button>
              )
            })}
          </div>

          <Question text="Anything you want to explain?"
                    hint="Optional. Your own words are kept with your determination and quoted in the report." />
          {/* Typing is local; the save happens on blur. Saving per keystroke would put one RPC
              call behind every character, and the block's "Saving…" indicator would never settle. */}
          <textarea value={draft.rationale}
                    onChange={e => onEdit(code, dir, { rationale: e.target.value })}
                    onBlur={() => onChange(code, dir, {})}
                    rows={3}
                    style={{ width: '100%', fontSize: 12.5, lineHeight: 1.7, padding: '10px 12px',
                             borderRadius: 10, border: `1px solid ${LINE}`, color: INK,
                             fontFamily: 'inherit', marginBottom: 18, resize: 'vertical' }} />

          <Question text="Over what period?" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {HORIZONS.map(h => {
              const on = draft.horizon === h.code
              return (
                <button key={h.code} type="button"
                        onClick={() => onChange(code, dir, { horizon: on ? null : h.code })}
                        style={{ fontSize: 12.5, padding: '8px 14px', borderRadius: 999,
                                 border: `1px solid ${on ? PURPLE : LINE}`,
                                 background: on ? '#f4ecfe' : '#fff', color: on ? PURPLE : MID,
                                 cursor: 'pointer', fontWeight: on ? 600 : 400 }}>
                  {h.label}
                </button>
              )
            })}
          </div>
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

// ── shell ────────────────────────────────────────────────────────────────────────────────────────

const Frame = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                background: PAPER, minHeight: '100vh' }}>
    <div style={{ background: INK, padding: '18px 0' }}>
      <div style={{ maxWidth: wide ? 820 : 620, margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 19, fontWeight: 700, color: '#fff' }}>ThemisIQ</div>
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 2,
                      textTransform: 'uppercase', letterSpacing: '0.08em' }}>Impact assessment</div>
      </div>
    </div>
    <div style={{ maxWidth: wide ? 820 : 620, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>{children}</div>
  </div>
)

const Card = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 16,
                padding: '1.6rem', marginBottom: 20 }}>{children}</div>
)

const H = ({ children, small }: { children: React.ReactNode; small?: boolean }) => (
  <div style={{ fontFamily: 'Georgia, serif', fontSize: small ? '1.15rem' : '1.4rem',
                color: INK, marginBottom: 10 }}>{children}</div>
)

const P = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ fontSize: 13, color: MID, lineHeight: 1.85, marginBottom: 12, ...style }}>{children}</div>
)
