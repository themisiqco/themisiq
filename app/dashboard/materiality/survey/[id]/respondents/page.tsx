'use client'

/**
 * Survey respondents — buyer screen 3 of 4. Who is asked, and what they are asked.
 *
 * ⚠️ THE CATEGORY IS A SELECT AND NEVER FREE TEXT. stakeholder_category drives the §3.0.1 labour
 * routing, so a typo does not fail — it MISROUTES, silently, and the answer lands against the wrong
 * determination with a provenance chain that reads as correct. The list comes from
 * mr_stakeholder_categories, which is the routing table itself.
 *
 * ⚠️ AND track IS DERIVED FROM THE CATEGORY, NEVER ENTERED. materiality_survey_respondents carries
 * a composite foreign key on (stakeholder_category, track) against mr_stakeholder_categories'
 * UNIQUE (code, track) — 20260819 added that constraint for exactly this reason: without it an
 * invite could carry track='internal' with category='customer' and be silently misrouted between S1
 * and S2 with nothing anywhere going red. The insert below reads track off the chosen category so
 * the pair cannot disagree.
 *
 * ⚠️ user_id HAS NO DEFAULT ON THIS TABLE. materiality_survey_rounds.user_id defaults to auth.uid();
 * materiality_survey_respondents.user_id does not. An insert that omits it fails on the NOT NULL
 * constraint, which is loud but names the wrong problem. It is supplied explicitly below.
 *
 * ⚠️ THERE IS NO DELETE GRANT. 20260819 grants authenticated select, insert and update — no delete,
 * matching cbam_verifier_access's posture: "revoke is a status UPDATE, never a DELETE". Removing an
 * invitee sets status='revoked', which the token gate then refuses. A "delete" control would be a
 * button that cannot work.
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../../components/Nav'
import PaywallCard from '../../../../../components/PaywallCard'
import { PAYWALL_HREF, PAYWALL_SURVEY, PAYWALL_TITLE } from '@/lib/paywallCopy'
import { supabase } from '../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../lib/useEntitlement'

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
const AMBER = '#ba7517'
const AMBER_BG = '#FEF3E2'
const BLUE = '#0C447C'
const BLUE_BG = '#E6F1FB'
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'

type Round = {
  id: string
  name: string
  company_name: string | null
  standard_version: string
  questionnaire_version: number
  status: string
  frozen_at: string | null
}

type Category = {
  code: string
  label: string
  track: 'internal' | 'external'
  labour_routing: 's1' | 's2' | 'not_asked'
  typically_surveyed: boolean
  answers_as: 'individual' | 'organisation'
  sort_order: number
}

type Respondent = {
  id: string
  invite_name: string | null
  invite_email: string | null
  track: string
  stakeholder_category: string
  status: 'invited' | 'in_progress' | 'completed' | 'revoked' | 'expired'
  invited_at: string
  completed_at: string | null
}

const STATUS = {
  invited:     { label: 'Not yet opened', color: BLUE,     bg: BLUE_BG },
  in_progress: { label: 'Opened',         color: AMBER,    bg: AMBER_BG },
  completed:   { label: 'Submitted',      color: GREEN,    bg: GREEN_BG },
  revoked:     { label: 'Revoked',        color: '#888784', bg: '#f8f7f5' },
  expired:     { label: 'Expired',        color: '#888784', bg: '#f8f7f5' },
} as const

export default function SurveyRespondents() {
  const isPaid = useEntitlement('double-materiality')
  const params = useParams()
  const roundId = params.id as string

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const [people, setPeople] = useState<Respondent[]>([])

  // Question counts per routing outcome, from the round's own question set.
  const [routingCounts, setRoutingCounts] = useState({ shared: 0, s1: 0, s2: 0 })

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [roundId])

  const load = async () => {
    setLoading(true)
    setLoadError(null)

    const { data: rd, error: rdErr } = await supabase
      .from('materiality_survey_rounds')
      .select('id, name, company_name, standard_version, questionnaire_version, status, frozen_at')
      .eq('id', roundId)
      .maybeSingle()

    if (rdErr) { setLoadError(rdErr.message); setLoading(false); return }
    if (!rd) {
      setLoadError('This survey round was not found, or it belongs to another account.')
      setLoading(false); return
    }
    setRound(rd as Round)
    const sv = (rd as Round).standard_version

    const [rp, ct, qs, subs] = await Promise.all([
      supabase.from('materiality_survey_respondents')
        .select('id, invite_name, invite_email, track, stakeholder_category, status, invited_at, completed_at')
        .eq('round_id', roundId).order('invited_at', { ascending: false }),
      supabase.from('mr_stakeholder_categories')
        .select('code, label, track, labour_routing, typically_surveyed, answers_as, sort_order')
        .order('sort_order'),
      supabase.from('materiality_survey_questions')
        .select('subtopic_code, status')
        .eq('round_id', roundId)
        .eq('questionnaire_version', (rd as Round).questionnaire_version),
      supabase.from('mr_esrs_subtopics').select('code, topic_code').eq('standard_version', sv),
    ])

    if (rp.error) { setLoadError(rp.error.message); setLoading(false); return }

    setPeople((rp.data ?? []) as Respondent[])
    setCats((ct.data ?? []) as Category[])

    // The three totals a respondent can receive. Computed from the round's own included questions —
    // never hardcoded as 31/25, because the scope screen moves them.
    const topicOf = Object.fromEntries((subs.data ?? []).map((s: any) => [s.code, s.topic_code]))
    let shared = 0, s1 = 0, s2 = 0
    for (const q of (qs.data ?? []) as any[]) {
      if (q.status !== 'included') continue
      const t = q.subtopic_code ? topicOf[q.subtopic_code] : undefined
      if (t === 'S1') s1++
      else if (t === 'S2') s2++
      else shared++
    }
    setRoutingCounts({ shared, s1, s2 })
    setLoading(false)
  }

  const catByCode = useMemo(() => Object.fromEntries(cats.map(c => [c.code, c])), [cats])

  const questionsFor = (routing: Category['labour_routing']) =>
    routingCounts.shared + (routing === 's1' ? routingCounts.s1 : routing === 's2' ? routingCounts.s2 : 0)

  const chosen = category ? catByCode[category] : undefined
  const offered = cats.filter(c => c.typically_surveyed || showAll)
  const hiddenCount = cats.filter(c => !c.typically_surveyed).length

  const add = async () => {
    if (!name.trim() || !email.trim() || !chosen) return
    setSaving(true)
    setAddError(null)

    const { data: { session } } = await supabase.auth.getSession()

    const { data, error } = await supabase
      .from('materiality_survey_respondents')
      .insert({
        round_id: roundId,
        // ⚠️ NO DEFAULT on this column — see the header.
        user_id: session?.user?.id,
        // ⚠️ FROM THE CATEGORY, never a separate field: the composite FK on
        // (stakeholder_category, track) rejects a mismatched pair, and that constraint exists so a
        // miscategorised respondent cannot be silently misrouted between S1 and S2.
        track: chosen.track,
        stakeholder_category: chosen.code,
        invite_name: name.trim(),
        invite_email: email.trim(),
      })
      .select('id')
      .maybeSingle()

    setSaving(false)
    if (error) { setAddError(error.message); return }
    if (!data) {
      setAddError('The respondent was not added. No row was returned and no error was given — nothing was saved. Reload before trying again.')
      return
    }
    setName(''); setEmail(''); setCategory('')
    load()
  }

  // Revoke, not delete: there is no DELETE grant, and a revoked token is refused by the RPC gate.
  const revoke = async (r: Respondent) => {
    setRowError(prev => { const n = { ...prev }; delete n[r.id]; return n })
    const { data, error } = await supabase
      .from('materiality_survey_respondents')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', r.id)
      .select('id')

    if (error) { setRowError(prev => ({ ...prev, [r.id]: error.message })); return }
    if (!data || data.length === 0) {
      setRowError(prev => ({ ...prev, [r.id]: 'Nothing was updated — reload and try again.' }))
      return
    }
    load()
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }

  if (isPaid === false) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>
        <PaywallCard
          title={PAYWALL_TITLE}
          body={PAYWALL_SURVEY}
          href={PAYWALL_HREF}
        />
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: '4rem', color: '#888784' }}>Loading respondents…</div>
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

  const active = people.filter(p => p.status !== 'revoked')

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 18, display: 'flex', gap: 16 }}>
          <Link href="/dashboard/materiality/survey" style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none' }}>← All survey rounds</Link>
          <Link href={`/dashboard/materiality/survey/${roundId}/scope`} style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none' }}>Topics in scope</Link>
        </div>

        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: '#0d0d0d' }}>Who is being asked</div>
        {/* Company first, round name labelled — see the note on the import screen. */}
        <div style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.7, marginTop: 6, maxWidth: 640 }}>
          {round?.company_name || 'This survey'}
          {round?.name ? <span style={{ color: '#888784' }}> · round: {round.name}</span> : null}
        </div>

        {/* ⚠️ THE OPERATIVE RULE, beside the selector rather than in a help page. The consequence —
            two people receiving different-length surveys — is chosen HERE, and someone who did not
            read the setup screen meets it for the first time on this one. */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.1rem 1.35rem', margin: '18px 0', fontSize: 13, color: '#555553', lineHeight: 1.75 }}>
          <strong style={{ color: '#0d0d0d' }}>The category determines which questions each person sees.</strong>{' '}
          Employees and supplier contacts are asked about workforce conditions — their own — while
          customers, regulators and community representatives are not, because they cannot observe
          either workforce.
          <div style={{ marginTop: 10, fontSize: 12.5, color: '#888784' }}>
            In this round that means{' '}
            <strong style={{ color: '#0d0d0d' }}>{questionsFor('s1')}</strong> questions for your own
            workforce ·{' '}
            <strong style={{ color: '#0d0d0d' }}>{questionsFor('s2')}</strong> for value-chain
            contacts ·{' '}
            <strong style={{ color: '#0d0d0d' }}>{questionsFor('not_asked')}</strong> for everyone
            else.
            {(routingCounts.s1 > 0 || routingCounts.s2 > 0) && (
              <> The difference is the workforce topics, and it is the routing working rather than
              a miscount.</>
            )}
          </div>
        </div>

        {/* Add */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem 1.75rem', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: '#0d0d0d' }}>Add a respondent</div>
            {/* The one-at-a-time form below is unchanged; this only points at the bulk paths. */}
            <Link href={`/dashboard/materiality/survey/${roundId}/respondents/import`}
              style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none' }}>
              Import a list instead →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Name <span style={{ color: FAIL }}>*</span></label>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Okafor" />
              <div style={{ fontSize: 11, color: '#888784', marginTop: 5, lineHeight: 1.6 }}>
                Shown to them as “Completing as”. Never stored with their answers.
              </div>
            </div>
            <div>
              <label style={labelStyle}>Email <span style={{ color: FAIL }}>*</span></label>
              <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
              <div style={{ fontSize: 11, color: '#888784', marginTop: 5, lineHeight: 1.6 }}>
                Used to send the invitation, and never attached to a response.
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>Stakeholder category <span style={{ color: FAIL }}>*</span></label>
            {/* A select, never free text — see the file header. */}
            <select style={{ ...inputStyle, maxWidth: 420 }} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Choose a category…</option>
              {offered.map(c => (
                <option key={c.code} value={c.code}>
                  {c.label}{!c.typically_surveyed ? ' — not usually surveyed' : ''}
                </option>
              ))}
            </select>
            {!showAll && hiddenCount > 0 && (
              <button onClick={() => setShowAll(true)}
                style={{ marginLeft: 10, fontSize: 12, color: '#7425e3', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Show {hiddenCount} more categories
              </button>
            )}
          </div>

          {/* What the choice does, before it is made rather than after. */}
          {chosen && (
            <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#555553', lineHeight: 1.7, marginTop: 10, maxWidth: 620 }}>
              A <strong>{chosen.label.toLowerCase()}</strong> will be asked{' '}
              <strong style={{ color: '#0d0d0d' }}>{questionsFor(chosen.labour_routing)}</strong> questions
              {chosen.labour_routing === 'not_asked' ? (
                <> — the workforce topics are left out, because they cannot observe either workforce.
                Their answers are not counted as “no view” on those topics; they are recorded as
                never asked.</>
              ) : chosen.labour_routing === 's1' ? (
                <> — including the workforce topics, about <strong>your own</strong> workforce.</>
              ) : (
                <> — including the workforce topics, about <strong>their own</strong> organisation’s
                workforce, not yours.</>
              )}
              {chosen.answers_as === 'organisation' && (
                <> They answer for an organisation rather than as an individual, so their comments
                are shown to you with their category attached.</>
              )}
            </div>
          )}

          {addError && (
            <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10, padding: '12px 14px', marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: FAIL, marginBottom: 4 }}>RESPONDENT NOT ADDED</div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{addError}</div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={add} disabled={!name.trim() || !email.trim() || !chosen || saving}
              style={{ fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8, border: 'none', background: name.trim() && email.trim() && chosen ? '#0d0d0d' : '#e8e7e4', color: name.trim() && email.trim() && chosen ? '#fff' : '#b8b7b4', cursor: name.trim() && email.trim() && chosen && !saving ? 'pointer' : 'not-allowed' }}>
              {saving ? 'Adding…' : 'Add respondent'}
            </button>
          </div>
        </div>

        {/* List */}
        {people.length === 0 ? (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2.5rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>Nobody added yet</div>
            <div style={{ fontSize: 13, color: '#888784', lineHeight: 1.7, maxWidth: 460, margin: '0 auto' }}>
              Add the people you want to hear from. A mix of internal staff and people outside the
              organisation gives the engagement record ESRS 2 SBM-2 asks for.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#888784', marginBottom: 10 }}>
              {active.length} respondent{active.length === 1 ? '' : 's'}
              {people.length !== active.length && ` · ${people.length - active.length} revoked`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {people.map(p => {
                const c = catByCode[p.stakeholder_category]
                const st = STATUS[p.status] ?? STATUS.invited
                return (
                  <div key={p.id} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '0.85rem 1.1rem', opacity: p.status === 'revoked' ? 0.55 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{p.invite_name || '—'}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: st.color, background: st.bg, borderRadius: 99, padding: '2px 9px' }}>{st.label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#888784', marginTop: 3 }}>
                          {p.invite_email}
                          {c && ` · ${c.label} · ${questionsFor(c.labour_routing)} questions`}
                        </div>
                      </div>
                      {p.status !== 'revoked' && p.status !== 'completed' && (
                        <button onClick={() => revoke(p)}
                          style={{ flexShrink: 0, fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid #e8e7e4', background: '#fff', color: '#555553', cursor: 'pointer' }}>
                          Revoke
                        </button>
                      )}
                    </div>
                    {rowError[p.id] && (
                      <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 8, padding: '8px 10px', marginTop: 8, fontSize: 11.5, color: '#555553' }}>{rowError[p.id]}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#888784', lineHeight: 1.7 }}>
          Sending invitations and watching progress comes next.
        </div>
      </div>
    </div>
  )
}
