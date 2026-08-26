'use client'

/**
 * ESRS 2 IRO-1 ¶35 capture — the five things paragraph 35 requires that the assessment does not
 * record and cannot derive.
 *
 * ⚠️ CAPTURE, NOT OUTPUT. Nothing here decides how the disclosure reads. The prose surface is
 * separate work and is not assumed by this screen or by migration 20260847.
 *
 * ⚠️ ITS OWN ROUTE, not a fourth card on worksheet/[id], which is already past 1,100 lines. Same
 * decision as register/ and determine/.
 *
 * ⚠️ THE FIVE LIMBS COME FROM lib/materiality/iro1.ts AND ARE NOT LISTED HERE. Render, three-state
 * display, submit gate and the outstanding line all derive from IRO1_FIELDS, so a sixth limb is one
 * entry rather than four edits. The one thing that array cannot guarantee is agreement with the SQL
 * CHECK that actually refuses a submit — see the note in that file.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../../components/Nav'
import PaywallCard from '../../../../../components/PaywallCard'
import { supabase } from '../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../lib/useEntitlement'
import {
  IRO1_FIELDS, iro1FieldState, iro1Blockers, iro1OutstandingText,
  type Iro1Field, type Iro1FieldKey, type Iro1FieldState, type Iro1Row,
} from '../../../../../../lib/materiality/iro1'

const PURPLE = '#7425e3'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
const BLUE = '#0C447C'
const BLUE_BG = '#E6F1FB'
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'
const INK = '#0d0d0d'
const MID = '#555553'
const MUTE = '#888784'
const LINE = '#e8e7e4'
const PAPER = '#f8f7f5'
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

const CARD: React.CSSProperties = {
  background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 14,
  padding: '1.5rem', marginBottom: 16,
}

/**
 * ⚠️ TWO ACTIONS OF EQUAL WEIGHT — same padding, same size, same border, neither filled and neither
 * a link. A decline offered as a checkbox under a textarea is an opt-out, and opt-outs do not get
 * taken: the preparer leaves the field blank instead, and blank means NEVER ASKED, which is a
 * weaker disclosure than a recorded refusal. 20260847 made the declined state recordable; this
 * style constant is part of what decides whether anyone records it.
 */
const ACTION: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 8,
  border: `1px solid ${LINE}`, background: '#fff', color: INK, cursor: 'pointer',
}

const QUIET: React.CSSProperties = {
  fontSize: 11.5, color: MUTE, background: 'none', border: 'none',
  padding: 0, cursor: 'pointer', textDecoration: 'underline',
}

/**
 * ⚠️ NOT ADDRESSED IS NEUTRAL, NOT A WARNING. Nothing requires these until submit, so an unanswered
 * limb is work not yet done, not a defect. Amber here would put five warnings in front of every
 * preparer opening the screen for the first time — which is the state every preparer starts in.
 *
 * ⚠️ AND DECLINED IS NOT A WARNING EITHER. Recording that you did not do something is a legitimate
 * disclosure under ¶35, not a failure to comply. Blue: distinct from both, and never amber.
 */
const STATE_CHIP: Record<Iro1FieldState, { text: string; fg: string; bg: string }> = {
  not_addressed: { text: 'NOT YET ADDRESSED',    fg: MUTE,  bg: PAPER },
  answered:      { text: 'ANSWERED',             fg: GREEN, bg: GREEN_BG },
  declined:      { text: 'RECORDED AS NOT DONE', fg: BLUE,  bg: BLUE_BG },
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
    <Nav />
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem' }}>{children}</div>
  </div>
)

export default function Iro1Page() {
  const params = useParams()
  const assessmentId = String(params?.id ?? '')
  const isPaid = useEntitlement('double-materiality')

  const [company, setCompany] = useState<string | null>(null)
  const [row, setRow] = useState<(Iro1Row & { status?: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editing, setEditing] = useState<Iro1FieldKey | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [fieldError, setFieldError] = useState<Record<string, string | null>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [nudged, setNudged] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)

    const { data: a, error: aErr } = await supabase.from('materiality_assessments')
      .select('id, company_name').eq('id', assessmentId).maybeSingle()
    if (aErr) { setLoadError(aErr.message); setLoading(false); return }
    if (!a) {
      setLoadError('This assessment was not found, or it belongs to another account. Those two '
                 + 'cannot be told apart from here.')
      setLoading(false); return
    }
    setCompany((a as { company_name: string | null }).company_name)

    // maybeSingle, not single: the row does not exist until the first limb is recorded, and its
    // absence is the ordinary starting state rather than an error.
    const { data: r, error: rErr } = await supabase.from('materiality_iro1')
      .select('*').eq('assessment_id', assessmentId).maybeSingle()
    if (rErr) { setLoadError(rErr.message); setLoading(false); return }
    setRow((r as Iro1Row & { status?: string }) ?? null)
    setLoading(false)
  }, [assessmentId])

  useEffect(() => { if (assessmentId) void load() }, [assessmentId, load])

  const submitted = row?.status === 'submitted'
  const blockers = iro1Blockers(row)
  const outstanding = iro1OutstandingText(blockers)

  /**
   * ⚠️ PARTIAL PAYLOAD, DELIBERATELY. A full-row upsert would write all ten columns from this tab's
   * state, so a second tab open on the same assessment would silently revert limbs saved there.
   * PostgREST's merge-duplicates generates ON CONFLICT DO UPDATE SET for the columns PRESENT in the
   * payload, so this touches one limb and leaves the other four alone.
   *
   * ⚠️ user_id IS NOT SENT. The column carries `default auth.uid()` — correct on insert, untouched
   * on update. Sending it from the client would be a second place for it to be wrong, and the
   * composite FK in 20260847 would then reject the row rather than the default quietly being right.
   *
   * ⚠️ THE READ SIDE IS STILL STALE, AND THIS DOES NOT FIX IT. setRow below merges the value THIS
   * TAB just wrote into THIS TAB's state. It does not re-read, so anything another tab or session
   * saved since this screen loaded is not reflected — the submit gate, the three-state chips and
   * the outstanding line are all computed from a snapshot that may be behind. The partial payload
   * prevents this tab from OVERWRITING that work; it does nothing to make this tab AWARE of it.
   * Two tabs on one assessment will therefore disagree about what is outstanding until one reloads.
   * NOT SOLVED HERE. Solving it means re-reading after each write, or a realtime subscription, or
   * an updated_at precondition on the write — each a real design with its own cost. Stated so the
   * next reader does not assume the partial payload bought more than it did.
   */
  async function writeLimb(f: Iro1Field, text: string | null, declined: boolean | null) {
    setSaving(s => ({ ...s, [f.key]: true }))
    setFieldError(e => ({ ...e, [f.key]: null }))

    const payload: Record<string, unknown> = {
      assessment_id: assessmentId,
      [f.key]: text,
      [f.declinedKey]: declined,
    }

    const { data, error } = await supabase.from('materiality_iro1')
      .upsert(payload, { onConflict: 'assessment_id' })
      .select('assessment_id')

    setSaving(s => ({ ...s, [f.key]: false }))
    // The database's own sentence. A per-limb CHECK refusal already says what was contradictory,
    // and no wrapper here would put it better.
    if (error) { setFieldError(e => ({ ...e, [f.key]: error.message })); return }
    if (!data || data.length === 0) {
      setFieldError(e => ({ ...e, [f.key]:
        'Nothing was saved, and the server gave no reason. This answer is not recorded.' }))
      return
    }
    setRow(r => ({ ...(r ?? {}), [f.key]: text, [f.declinedKey]: declined }))
    setEditing(null); setDraft('')
  }

  const recordAnswer = (f: Iro1Field, text: string) => writeLimb(f, text.trim() || null, null)
  const recordDecline = (f: Iro1Field) => writeLimb(f, null, true)

  /**
   * ⚠️ THE WAY BACK. Both columns to null returns the limb to NOT ADDRESSED — the state a mis-click
   * has to be able to escape to. Without it the only route out of "declined" would be to answer,
   * and the only route out of "answered" would be to type something and delete it, which lands on
   * '' and reads as answered-with-nothing rather than never-asked.
   */
  const returnToNotAddressed = (f: Iro1Field) => writeLimb(f, null, null)

  async function submit() {
    setSubmitError(null)
    const { data, error } = await supabase.from('materiality_iro1')
      .upsert({ assessment_id: assessmentId, status: 'submitted' }, { onConflict: 'assessment_id' })
      .select('assessment_id')
    if (error) { setSubmitError(error.message); return }
    if (!data || data.length === 0) {
      setSubmitError('Nothing was submitted, and the server gave no reason.'); return
    }
    setRow(r => ({ ...(r ?? {}), status: 'submitted' }))
  }

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
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/dashboard/materiality/worksheet" style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← All worksheets</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Assign and chase</Link>
          <Link href={`/dashboard/materiality/worksheet/${assessmentId}/determinations`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Determinations</Link>
        </div>

        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>
          {company || 'IRO-1 disclosure'}
        </div>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 4, marginBottom: 20 }}>
          ESRS 2 IRO-1 · how this materiality assessment was carried out
        </div>

        <div style={{ background: BLUE_BG, border: `0.5px solid ${BLUE}`, borderRadius: 12,
                      padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
          <strong>Paragraph 35 asks five things about the PROCESS, not about the topics.</strong>{' '}
          Each can be answered, or recorded as something you did not do. Both are disclosures and
          both are kept; a limb left untouched is neither, and reads as a question never put.
          Nothing here is required until you submit.
        </div>

        {IRO1_FIELDS.map(f => {
          const state = iro1FieldState(row?.[f.key], row?.[f.declinedKey])
          const chip = STATE_CHIP[state]
          const isEditing = editing === f.key
          const busy = !!saving[f.key]
          const err = fieldError[f.key]

          return (
            <div key={f.key} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
                            alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                              textTransform: 'uppercase', color: PURPLE }}>{f.limb}</div>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                               color: chip.fg, background: chip.bg, border: `0.5px solid ${chip.fg}33`,
                               borderRadius: 999, padding: '3px 10px' }}>{chip.text}</span>
              </div>

              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: INK, marginTop: 6 }}>
                {f.label}
              </div>

              {/* The standard's own words, set apart so a preparer can tell them from ours. */}
              <blockquote style={{ margin: '10px 0 0', paddingLeft: 12, borderLeft: `2px solid ${LINE}`,
                                   fontSize: 12.5, color: MID, lineHeight: 1.75 }}>{f.asks}</blockquote>
              <div style={{ fontSize: 12, color: MUTE, lineHeight: 1.7, marginTop: 8 }}>{f.help}</div>

              {state === 'answered' && !isEditing && (
                <div style={{ background: PAPER, borderRadius: 10, padding: '12px 14px', marginTop: 12,
                              fontSize: 13, color: INK, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {row?.[f.key]}
                </div>
              )}

              {state === 'declined' && !isEditing && (
                <div style={{ background: BLUE_BG, borderRadius: 10, padding: '12px 14px', marginTop: 12,
                              fontSize: 13, color: INK, lineHeight: 1.8 }}>
                  Recorded: this was not done. That is what the disclosure will say — not that the
                  question went unanswered.
                </div>
              )}

              {isEditing ? (
                <div style={{ marginTop: 12 }}>
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={5}
                            autoFocus
                            style={{ width: '100%', fontSize: 13, lineHeight: 1.7, padding: '10px 12px',
                                     borderRadius: 10, border: `1px solid ${LINE}`, color: INK,
                                     fontFamily: 'inherit', resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => void recordAnswer(f, draft)} disabled={busy || !draft.trim()}
                            style={{ ...ACTION, fontWeight: 600,
                                     opacity: (busy || !draft.trim()) ? 0.5 : 1 }}>
                      {busy ? 'Saving…' : 'Save this answer'}
                    </button>
                    <button onClick={() => { setEditing(null); setDraft('') }} style={ACTION}>Cancel</button>
                  </div>
                </div>
              ) : submitted ? null : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12,
                              alignItems: 'center' }}>
                  {state === 'not_addressed' ? (
                    <>
                      <button onClick={() => { setEditing(f.key); setDraft('') }} disabled={busy}
                              style={ACTION}>Record an answer</button>
                      <button onClick={() => void recordDecline(f)} disabled={busy}
                              style={ACTION}>Record that we did not do this</button>
                    </>
                  ) : (
                    <>
                      {state === 'answered' && (
                        <button onClick={() => { setEditing(f.key); setDraft(String(row?.[f.key] ?? '')) }}
                                disabled={busy} style={ACTION}>Edit this answer</button>
                      )}
                      <button onClick={() => void returnToNotAddressed(f)} disabled={busy}
                              style={QUIET}>Return this to not yet addressed</button>
                    </>
                  )}
                </div>
              )}

              {err && (
                <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}33`, borderRadius: 8,
                              padding: '10px 13px', marginTop: 12, fontSize: 12, color: INK,
                              lineHeight: 1.75 }}>{err}</div>
              )}
            </div>
          )
        })}

        {/* ⚠️ supersedes_assessment_id IS NOT CAPTURED HERE, AND THAT IS DELIBERATE.
            ¶35(d) asks what changed against the PRIOR reporting period. A first cycle has nothing to
            point at, and the column is nullable for exactly that reason (20260847). A picker built
            now would offer an empty list to every customer who has one assessment — which is all of
            them — so it waits until a second cycle exists to point at. The column is live; only the
            control is absent. */}

        <div style={CARD}>
          {submitted ? (
            <>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: INK }}>
                Submitted
              </div>
              <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginTop: 8 }}>
                All five limbs are recorded as you intend them. This is what the IRO-1 disclosure
                will be built from.
              </div>
              {/* ⚠️ NO UN-SUBMIT CONTROL, AND ITS ABSENCE IS THE DESIGN.
                  Submitting is the preparer ASSERTING that the five limbs stand as they intend
                  them. This table has no revision history — unlike materiality_impact_determinations,
                  which keeps a contributor's superseded figures in a companion table and a written
                  reason for departing from them (20260839). Returning this row to draft would let a
                  submitted state be edited away with nothing recording that it had ever been
                  asserted, or what it said at the time.
                  UN-SUBMITTING NEEDS A REVISION-HISTORY DESIGN FIRST, not a button. Until that
                  exists the honest shape is one direction only. The DDL permits 'draft' and
                  'submitted' in both directions and nothing at the database level forbids the
                  reverse — this screen simply does not offer it, which is a UI decision and is
                  recorded here as one. */}
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: INK }}>
                Submit the IRO-1 record
              </div>
              <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.8, marginTop: 8, marginBottom: 14 }}>
                Every limb must be answered or recorded as not done. Submitting says these five
                stand as you intend them; there is no way back to draft from this screen.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                <button
                  onClick={() => { if (blockers.length === 0) void submit(); else setNudged(true) }}
                  aria-disabled={blockers.length > 0}
                  style={{ ...ACTION, fontWeight: 600, background: GRAD, border: 'none',
                           cursor: blockers.length ? 'not-allowed' : 'pointer',
                           opacity: blockers.length ? 0.5 : 1 }}>Submit IRO-1</button>
                {/* ⚠️ THE SCREEN SAYS WHAT IS OUTSTANDING; POSTGRES SAYS ONLY THAT SOMETHING IS.
                    materiality_iro1_submitted_is_complete would refuse this submit, and its message
                    names a constraint rather than a limb. One line, every outstanding limb named —
                    not the first, which would send the preparer round the loop once per limb. */}
                {outstanding && (
                  <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.6, maxWidth: 520 }}>
                    Still to record: {outstanding}.
                  </div>
                )}
                {nudged && blockers.length > 0 && (
                  <div style={{ fontSize: 11.5, color: MID, lineHeight: 1.6, maxWidth: 520 }}>
                    Each one above has two buttons — an answer, or a record that it was not done.
                    Either clears it.
                  </div>
                )}
              </div>
            </>
          )}
          {submitError && (
            <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}33`, borderRadius: 8,
                          padding: '10px 13px', marginTop: 12, fontSize: 12, color: INK,
                          lineHeight: 1.75 }}>{submitError}</div>
          )}
        </div>

      </div>
    </div>
  )
}
