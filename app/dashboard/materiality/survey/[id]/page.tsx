'use client'

/**
 * Survey progress — buyer screen 4 of 4. Send invitations, and see who to chase.
 *
 * ⚠️ THE INVITED-TO-REACHED GAP IS THE POINT OF THIS SCREEN, NOT A DETAIL ON IT.
 * survey_aggregate counts only respondents who REACHED the form (20260826), deliberately: counting
 * an unopened invitation as "asked and skipped" would be a statement about email deliverability
 * dressed as a finding about the company, and it errs in the direction that makes them look worse.
 * The consequence is that the buyer's results are computed over a smaller group than they invited,
 * and the difference is theirs to act on — a bounced address or a spam folder is fixable, and
 * nothing else in the product will tell them. So the gap gets its own tile, its own sentence, and a
 * chase list, rather than being inferable from two numbers that happen to differ.
 *
 * ⚠️ AND 'in_progress' IS TWO DIFFERENT FACTS. Someone who opened the survey and answered nothing,
 * and someone who answered thirty of thirty-one, are both in_progress. For deciding whether to send
 * a reminder they are opposites. materiality_survey_responses grants authenticated nothing — by
 * design — so the counts come from survey_respondent_progress (20260835), which returns counts and
 * never content.
 *
 * NOT HERE: the results screen, and closing the round. See the note at the foot of the file.
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../components/Nav'
import PaywallCard from '../../../../components/PaywallCard'
import { supabase } from '../../../../../lib/supabase'
import { useEntitlement } from '../../../../../lib/useEntitlement'

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
const AMBER = '#ba7517'
const AMBER_BG = '#FEF3E2'
const BLUE = '#0C447C'
const BLUE_BG = '#E6F1FB'
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'

type Round = { id: string; name: string; company_name: string | null; status: string; deadline: string | null; frozen_at: string | null }
type Category = { code: string; label: string; labour_routing: string }
type Respondent = {
  id: string; invite_name: string | null; invite_email: string | null
  stakeholder_category: string; status: 'invited' | 'in_progress' | 'completed' | 'revoked' | 'expired'
  invited_at: string; reminder_sent_at: string | null; completed_at: string | null
}
type Progress = { n_asked: number; n_answered: number; n_abstained: number; n_skipped: number; last_activity: string | null }

export default function SurveyProgress() {
  const isPaid = useEntitlement('climate-risk')
  const params = useParams()
  const roundId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const [people, setPeople] = useState<Respondent[]>([])
  const [cats, setCats] = useState<Record<string, Category>>({})
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [progressError, setProgressError] = useState<string | null>(null)

  const [sending, setSending] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [bulk, setBulk] = useState<{ running: boolean; done: number; total: number; failed: string[] } | null>(null)

  useEffect(() => { load() }, [roundId])

  const load = async () => {
    setLoading(true); setLoadError(null); setProgressError(null)

    const { data: rd, error: rdErr } = await supabase
      .from('materiality_survey_rounds')
      .select('id, name, company_name, status, deadline, frozen_at')
      .eq('id', roundId).maybeSingle()

    if (rdErr) { setLoadError(rdErr.message); setLoading(false); return }
    if (!rd) { setLoadError('This survey round was not found, or it belongs to another account.'); setLoading(false); return }
    setRound(rd as Round)

    const [rp, ct, pr] = await Promise.all([
      supabase.from('materiality_survey_respondents')
        .select('id, invite_name, invite_email, stakeholder_category, status, invited_at, reminder_sent_at, completed_at')
        .eq('round_id', roundId).order('invited_at', { ascending: false }),
      supabase.from('mr_stakeholder_categories').select('code, label, labour_routing').order('sort_order'),
      supabase.rpc('survey_respondent_progress', { p_round_id: roundId }),
    ])

    if (rp.error) { setLoadError(rp.error.message); setLoading(false); return }
    setPeople((rp.data ?? []) as Respondent[])
    setCats(Object.fromEntries(((ct.data ?? []) as Category[]).map(c => [c.code, c])))

    // ⚠️ A MISSING PROGRESS PAYLOAD IS REPORTED, NOT SWALLOWED. Without it the screen can still show
    // the funnel — but it CANNOT tell "opened and answered nothing" from "opened and answered
    // thirty", which is the question it exists to answer. Saying so beats showing every in_progress
    // row as though it were the same.
    if (pr.error) setProgressError(pr.error.message)
    else setProgress((pr.data ?? {}) as Record<string, Progress>)

    setLoading(false)
  }

  const active = useMemo(() => people.filter(p => p.status !== 'revoked' && p.status !== 'expired'), [people])
  const counts = useMemo(() => ({
    invited: active.length,
    reached: active.filter(p => p.status === 'in_progress' || p.status === 'completed').length,
    submitted: active.filter(p => p.status === 'completed').length,
    neverOpened: active.filter(p => p.status === 'invited').length,
  }), [active])

  // Per category, the same three numbers.
  const byCategory = useMemo(() => {
    const m: Record<string, { invited: number; reached: number; submitted: number }> = {}
    for (const p of active) {
      const e = (m[p.stakeholder_category] ||= { invited: 0, reached: 0, submitted: 0 })
      e.invited++
      if (p.status === 'in_progress' || p.status === 'completed') e.reached++
      if (p.status === 'completed') e.submitted++
    }
    return m
  }, [active])

  const send = async (r: Respondent, type: 'invite' | 'reminder'): Promise<boolean> => {
    setSending(r.id)
    setSendResult(prev => { const n = { ...prev }; delete n[r.id]; return n })

    const { data: { session } } = await supabase.auth.getSession()
    let ok = false
    try {
      const res = await fetch('/api/survey-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ respondent_id: r.id, type }),
      })
      const data = await res.json().catch(() => ({}))
      // ⚠️ EVERY FAILURE MODE SHOWS ITS MESSAGE AND PERSISTS. The supplier portal's equivalent sets a
      // badge for three seconds and never shows why; a buyer who blinks sees a row that looks sent.
      if (!res.ok || data.error) {
        setSendResult(prev => ({ ...prev, [r.id]: { ok: false, msg: data.error || `The send failed (HTTP ${res.status}).` } }))
      } else if (data.warning) {
        // Sent, but the timestamp did not save. Both facts, or the buyer sends twice.
        setSendResult(prev => ({ ...prev, [r.id]: { ok: true, msg: data.warning } }))
        ok = true
      } else {
        setSendResult(prev => ({ ...prev, [r.id]: { ok: true, msg: type === 'reminder' ? 'Reminder sent.' : 'Invitation sent.' } }))
        ok = true
      }
    } catch (e: any) {
      setSendResult(prev => ({ ...prev, [r.id]: { ok: false, msg: `The request did not reach the server (${e?.message || 'network error'}). Nothing was sent.` } }))
    }
    setSending(null)
    return ok
  }

  // Sequential on purpose: the send route has no rate limiter, and firing forty concurrent Resend
  // calls is how a provider starts refusing them. Failures are collected rather than aborting.
  const sendAllUnopened = async () => {
    const targets = active.filter(p => p.status === 'invited' && p.invite_email)
    if (!targets.length) return
    setBulk({ running: true, done: 0, total: targets.length, failed: [] })
    const failed: string[] = []
    for (let i = 0; i < targets.length; i++) {
      const okSend = await send(targets[i], 'reminder')
      if (!okSend) failed.push(targets[i].invite_name || targets[i].invite_email || targets[i].id)
      setBulk({ running: true, done: i + 1, total: targets.length, failed })
    }
    setBulk({ running: false, done: targets.length, total: targets.length, failed })
    load()
  }

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'

  if (isPaid === false) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>
        <PaywallCard title="Unlock the Climate Risk module"
          body="Stakeholder surveys are part of the Climate Risk &amp; Materiality module. Unlock it to run a survey round, invite stakeholders, and gather their views as evidence for your materiality assessment."
          href="/pricing?modules=risk" />
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav /><div style={{ textAlign: 'center', padding: '4rem', color: '#888784' }}>Loading progress…</div>
    </div>
  )

  if (loadError) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#0d0d0d', marginBottom: 10 }}>This round could not be opened</div>
          <div style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.7 }}>{loadError}</div>
        </div>
      </div>
    </div>
  )

  const chase = active.filter(p => p.status !== 'completed')

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
          <Link href="/dashboard/materiality/survey" style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none' }}>← All survey rounds</Link>
          <Link href={`/dashboard/materiality/survey/${roundId}/scope`} style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none' }}>Topics in scope</Link>
          <Link href={`/dashboard/materiality/survey/${roundId}/respondents`} style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none' }}>Respondents</Link>
        </div>

        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: '#0d0d0d' }}>{round?.name}</div>
        <div style={{ fontSize: 13, color: '#888784', marginTop: 4, marginBottom: 20 }}>
          {round?.company_name}{round?.deadline && ` · deadline ${fmt(round.deadline)}`}
        </div>

        {/* Funnel */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
          {[
            { label: 'Invited', val: counts.invited, color: '#0d0d0d', bg: '#fff' },
            { label: 'Opened the survey', val: counts.reached, color: AMBER, bg: AMBER_BG },
            { label: 'Submitted', val: counts.submitted, color: GREEN, bg: GREEN_BG },
            { label: 'Never opened it', val: counts.neverOpened, color: BLUE, bg: BLUE_BG },
          ].map(t => (
            <div key={t.label} style={{ background: t.bg, border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: t.color }}>{t.val}</div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 4 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* ⚠️ THE GAP, NAMED. Two numbers that differ invite the reader to assume the smaller one is a
            finding about their organisation. It is a fact about their invitations. */}
        {counts.neverOpened > 0 && (
          <div style={{ background: BLUE_BG, border: `0.5px solid ${BLUE}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: '#0d0d0d', lineHeight: 1.75 }}>
            <strong>{counts.neverOpened} of {counts.invited} people have not opened the survey.</strong>{' '}
            Results are calculated over the {counts.reached} who did — an unopened invitation is not
            counted as “asked and skipped”, because that would report a delivery problem as a finding
            about {round?.company_name || 'your company'}. This gap is about your invitations: check
            the addresses, and whether the mail reached them.
          </div>
        )}

        {progressError && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: '#0d0d0d', lineHeight: 1.7 }}>
            <strong>Answer counts are unavailable.</strong> The funnel below is accurate, but “opened”
            cannot be split into who has answered a lot and who has answered nothing. The server said:
            {' '}{progressError}
          </div>
        )}

        {/* Per category */}
        {Object.keys(byCategory).length > 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 10 }}>By stakeholder category</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(byCategory).map(([code, c]) => (
                <div key={code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: '#555553', padding: '5px 0', borderBottom: '0.5px solid #f3f2f0' }}>
                  <span style={{ color: '#0d0d0d' }}>{cats[code]?.label ?? code}</span>
                  <span>
                    {c.invited} invited · {c.reached} opened ·{' '}
                    <strong style={{ color: c.submitted > 0 ? GREEN : '#888784' }}>{c.submitted} submitted</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chase list */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: '#0d0d0d' }}>
            {chase.length === 0 ? 'Everyone has submitted' : `${chase.length} still to hear from`}
          </div>
          {counts.neverOpened > 0 && (
            <button onClick={sendAllUnopened} disabled={bulk?.running}
              style={{ fontSize: 12.5, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: bulk?.running ? 'not-allowed' : 'pointer', opacity: bulk?.running ? 0.6 : 1 }}>
              {bulk?.running ? `Sending ${bulk.done} of ${bulk.total}…` : `Remind the ${counts.neverOpened} who never opened it`}
            </button>
          )}
        </div>

        {bulk && !bulk.running && (
          <div style={{ background: bulk.failed.length ? FAIL_BG : GREEN_BG, border: `0.5px solid ${bulk.failed.length ? FAIL : GREEN}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: '#0d0d0d', lineHeight: 1.7 }}>
            {bulk.failed.length === 0
              ? `Sent ${bulk.total} reminder${bulk.total === 1 ? '' : 's'}.`
              : `Sent ${bulk.total - bulk.failed.length} of ${bulk.total}. These did NOT send: ${bulk.failed.join(', ')}. They have not been marked as reminded.`}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {active.map(p => {
            const pg = progress[p.id]
            const res = sendResult[p.id]
            const done = pg ? pg.n_answered + pg.n_abstained : null
            return (
              <div key={p.id} style={{ background: '#fff', border: `0.5px solid ${res && !res.ok ? FAIL : '#e8e7e4'}`, borderRadius: 12, padding: '0.85rem 1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{p.invite_name || p.invite_email || '—'}</div>
                    <div style={{ fontSize: 12, color: '#888784', marginTop: 3 }}>
                      {cats[p.stakeholder_category]?.label ?? p.stakeholder_category}
                      {' · '}
                      {/* ⚠️ THE TWO in_progress STATES, TOLD APART. */}
                      {p.status === 'completed'
                        ? <span style={{ color: GREEN }}>submitted {fmt(p.completed_at)}{done !== null && pg ? ` · ${done} of ${pg.n_asked} answered` : ''}</span>
                        : p.status === 'invited'
                          ? <span style={{ color: BLUE }}>never opened · invited {fmt(p.invited_at)}{p.reminder_sent_at ? ` · reminded ${fmt(p.reminder_sent_at)}` : ''}</span>
                          : done === 0
                            ? <span style={{ color: AMBER }}>opened, nothing answered yet</span>
                            : <span style={{ color: AMBER }}>opened · {done} of {pg?.n_asked} answered, not submitted</span>}
                    </div>
                  </div>
                  {p.status !== 'completed' && p.invite_email && (
                    <button onClick={() => send(p, p.status === 'invited' ? 'invite' : 'reminder')} disabled={sending === p.id || bulk?.running}
                      style={{ flexShrink: 0, fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #e8e7e4', background: '#fff', color: '#555553', cursor: 'pointer' }}>
                      {sending === p.id ? 'Sending…' : p.status === 'invited' ? 'Resend invitation' : 'Send reminder'}
                    </button>
                  )}
                </div>
                {res && (
                  <div style={{ background: res.ok ? GREEN_BG : FAIL_BG, border: `0.5px solid ${res.ok ? GREEN : FAIL}`, borderRadius: 8, padding: '7px 10px', marginTop: 8, fontSize: 11.5, color: '#555553', lineHeight: 1.6 }}>
                    {!res.ok && <strong style={{ color: FAIL, display: 'block', marginBottom: 2 }}>NOT SENT</strong>}
                    {res.msg}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ⚠️ CLOSING THE ROUND IS NOT BUILT, AND THIS IS WHERE THE BUTTON GOES.
            What it needs, none of which exists yet:
              * an UPDATE setting status='closed' — nothing moves a round off 'draft' today;
              * a warning that it is close to one-way: 20260827 refuses to let a round leave 'closed'
                once an assessment has consumed it, and unlinking is the only way back;
              * a check that responses are worth closing on — closing a round nobody submitted to
                produces an aggregate whose every breakdown is suppressed;
              * and the results screen, since "is this ready to close?" is really "have I got enough
                to read?", which this screen can only half answer. */}
        <div style={{ marginTop: 26, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem 1.25rem', fontSize: 12.5, color: '#888784', lineHeight: 1.75 }}>
          {counts.submitted > 0
            ? <>{counts.submitted} of {counts.invited} have submitted. Reading the results, and closing the round so an assessment can use it, come next.</>
            : <>Nobody has submitted yet. Reading the results, and closing the round so an assessment can use it, come next.</>}
        </div>
      </div>
    </div>
  )
}
