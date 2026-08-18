'use client'

/**
 * Survey rounds — buyer screen 1 of 4. List, and create.
 *
 * Creating a round is the only step that cannot be undone cheaply: the INSERT fires
 * materiality_survey_generate_questions(), which writes a row for ALL 37 esrs_2026 sub-topics in the
 * same statement (20260819). So the round arrives fully scoped and this screen hands straight off to
 * the scope screen, where topics are removed rather than added.
 *
 * ⚠️ THE INSERT CAN FAIL WITH A MESSAGE WORTH READING, AND THIS SCREEN SHOWS IT VERBATIM. Two
 * triggers fire on it and both RAISE with specific text: the threshold snapshot refuses if
 * mr_survey_thresholds is missing a row, and the generator refuses if any sub-topic has no display
 * row — "Cannot generate a question set for esrs_2026: N sub-topic(s) have no row in
 * mr_esrs_subtopic_display". Replacing either with "Something went wrong" would hide a migration
 * that has not been run behind a message about nothing.
 *
 * NOT HERE: respondents and progress (screen 3/4), and results. This screen lists rounds and makes
 * one.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../components/Nav'
import PaywallCard from '../../../components/PaywallCard'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
const AMBER = '#ba7517'
const AMBER_BG = '#FEF3E2'
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'

type Round = {
  id: string
  name: string
  company_name: string | null
  standard_version: string
  status: 'draft' | 'open' | 'closed'
  deadline: string | null
  anonymity_floor: number
  frozen_at: string | null
  created_at: string
}

const STATUS = {
  draft:  { label: 'Draft',  color: '#0C447C', bg: '#E6F1FB' },
  open:   { label: 'Open',   color: AMBER,     bg: AMBER_BG },
  closed: { label: 'Closed', color: GREEN,     bg: GREEN_BG },
} as const

export default function SurveyRounds() {
  const isPaid = useEntitlement('climate-risk')
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rounds, setRounds] = useState<Round[]>([])
  const [scope, setScope] = useState<Record<string, { included: number; total: number }>>({})

  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [deadline, setDeadline] = useState('')
  const [floor, setFloor] = useState(3)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setLoadError(null)

    const { data, error } = await supabase
      .from('materiality_survey_rounds')
      .select('id, name, company_name, standard_version, status, deadline, anonymity_floor, frozen_at, created_at')
      .order('created_at', { ascending: false })

    if (error) { setLoadError(error.message); setLoading(false); return }
    const rs = (data ?? []) as Round[]
    setRounds(rs)

    // One query for every round's scope, counted client-side. RLS scopes it to this user's rounds,
    // so no round_id filter is needed and none is given — adding one would imply the policy is not
    // doing it.
    if (rs.length) {
      const { data: qs } = await supabase
        .from('materiality_survey_questions')
        .select('round_id, status')
      const acc: Record<string, { included: number; total: number }> = {}
      for (const q of (qs ?? []) as any[]) {
        const e = (acc[q.round_id] ||= { included: 0, total: 0 })
        e.total++
        if (q.status === 'included') e.included++
      }
      setScope(acc)
    }
    setLoading(false)
  }

  const nameOk = name.trim().length > 0
  const companyOk = company.trim().length > 0

  const create = async () => {
    if (!nameOk || !companyOk) return
    setSaving(true)
    setCreateError(null)

    const { data: { session } } = await supabase.auth.getSession()

    const { data, error } = await supabase
      .from('materiality_survey_rounds')
      .insert({
        // user_id defaults to auth.uid() in the table, but it is set explicitly here for the reason
        // /api/materiality gives at its own insert: the ownership dependency stays visible in the
        // code, so a later change of client cannot silently remove it.
        user_id: session?.user?.id,
        name: name.trim(),
        company_name: company.trim(),
        // ⚠️ NOT A FIELD. The CHECK admits one value (spec v9 §3.3): mr_esrs_subtopics is seeded for
        // esrs_2026 alone, so a round on another version would generate zero questions and present
        // to a respondent as an empty form. The UI's job is to say WHY, which the note beside the
        // form does — a disabled dropdown with one option says nothing.
        standard_version: 'esrs_2026',
        deadline: deadline || null,
        anonymity_floor: floor,
      })
      .select('id')
      .maybeSingle()

    setSaving(false)

    if (error) {
      // Verbatim. The generator and the threshold-snapshot triggers both raise with text that names
      // the missing migration; paraphrasing it would hide the fix.
      setCreateError(error.message)
      return
    }
    if (!data) {
      setCreateError('The round did not save, and the database returned no error and no row. Nothing was created — reload and try again.')
      return
    }

    // Straight to scope: the round already has all 37 questions, and choosing which apply is the
    // next thing anyone wants to do.
    router.push(`/dashboard/materiality/survey/${data.id}/scope`)
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }

  if (isPaid === false) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>
        <PaywallCard
          title="Unlock the Climate Risk module"
          body="Stakeholder surveys are part of the Climate Risk &amp; Materiality module. Unlock it to run a survey round, choose which ESRS sub-topics are in scope, and gather stakeholder views as evidence for your materiality assessment."
          href="/pricing?modules=risk"
        />
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 6 }}>
          <div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: '#0d0d0d' }}>Stakeholder surveys</div>
            <div style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.7, marginTop: 6, maxWidth: 620 }}>
              Ask the people who see your company — staff, suppliers, communities, customers — which
              sustainability topics they think you should prioritise. Their answers are the
              stakeholder-engagement evidence ESRS 2 SBM-2 asks for, and the input your materiality
              assessment is set against.
            </div>
          </div>
          {!showNew && (
            <button onClick={() => setShowNew(true)}
              style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, padding: '10px 20px', borderRadius: 9, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>
              New survey round
            </button>
          )}
        </div>

        {showNew && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem 1.75rem', margin: '20px 0' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: '#0d0d0d', marginBottom: 16 }}>New survey round</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Round name <span style={{ color: FAIL }}>*</span></label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)}
                  placeholder="FY2026 stakeholder survey" />
                <div style={{ fontSize: 11, color: '#888784', marginTop: 5, lineHeight: 1.6 }}>
                  Your reference for this round. Respondents see it at the top of the survey.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Company name <span style={{ color: FAIL }}>*</span></label>
                <input style={inputStyle} value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="Acme Foods Ltd" />
                {/* ⚠️ REQUIRED, AND NOT WITH A FALLBACK. The respondent copy names the company in
                    almost every sentence, and variant B — the one a supplier's contact reads — opens
                    "{Company} is a customer of the organisation you work for". With no name that
                    becomes "your organisation is a customer of the organisation you work for", which
                    is nonsense to the one respondent who most needs the sentence to land. The column
                    is nullable at the database on purpose; the requirement belongs here. */}
                <div style={{ fontSize: 11, color: '#888784', marginTop: 5, lineHeight: 1.6 }}>
                  Used throughout the survey — “What strategic priority should <em>{company.trim() || 'Acme Foods Ltd'}</em> assign
                  to this topic?” Respondents outside your organisation need it to know who is asking.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Deadline</label>
                <input style={inputStyle} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
                <div style={{ fontSize: 11, color: '#888784', marginTop: 5, lineHeight: 1.6 }}>
                  Optional. Shown to respondents and in the invitation email.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Anonymity floor</label>
                <input style={{ ...inputStyle, maxWidth: 110 }} type="number" min={1} value={floor}
                  onChange={e => setFloor(Math.max(1, Number(e.target.value) || 1))} />
                {/* Immutable once the first response arrives (20260825), so this is the only moment
                    it can be set. */}
                <div style={{ fontSize: 11, color: '#888784', marginTop: 5, lineHeight: 1.6 }}>
                  Results are never broken down by group where fewer than this many people answered,
                  so no individual can be identified. Fixed once the first response arrives.
                </div>
              </div>
            </div>

            <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#555553', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* ⚠️ A SILENT SINGLE OPTION SAYS NOTHING. An ESRS (2023) customer needs to be told why
                  they cannot run a survey, not shown a dropdown with one entry. */}
              <div>
                This round is built against <strong>ESRS (2026)</strong> and its 37 sub-topics. Rounds
                against ESRS (2023) are not yet supported — that taxonomy is a different instrument,
                three levels deep, and has to be transcribed before a survey can be built on it.
              </div>

              {/* ⚠️ THIS LINE MUST NOT SAY THE DESCRIPTIONS CAN BE CUSTOMISED, AND CANNOT UNTIL A
                  SCHEMA CHANGE SHIPS. short_name, question_framing and context all live on
                  mr_esrs_subtopic_display — ONE SHARED REFERENCE TABLE — so a bakery editing "energy"
                  would edit it for every customer on the platform. Promising customisation would be a
                  claim the code does not support, which is the class of defect the /deals and
                  /climate-risk pages were cleaned of this week.
                  WHEN PER-ROUND OVERRIDES SHIP, this line gains "…or write your own". Not before. */}
              <div>
                Each topic carries a plain-language description written for people who do not work in
                sustainability.
              </div>

              {/* Advance notice of the routing. The choice is made on the respondents screen, but the
                  consequence — two people receiving different-length surveys — surprises anyone who
                  meets it there first. */}
              <div>
                <strong>Not everyone is asked the same questions.</strong> ESRS treats your own
                workforce and workers in your suppliers’ operations as separate topics, so people are
                asked about the one they can actually see. You choose who is asked what when you add
                respondents.
              </div>
            </div>

            {createError && (
              <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10, padding: '12px 14px', marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: FAIL, marginBottom: 4 }}>ROUND NOT CREATED</div>
                <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{createError}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => { setShowNew(false); setCreateError(null) }}
                style={{ fontSize: 13, padding: '9px 18px', borderRadius: 8, border: '1px solid #e8e7e4', background: '#fff', color: '#555553', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={create} disabled={!nameOk || !companyOk || saving}
                title={!companyOk ? 'A company name is required — the survey copy names it throughout' : undefined}
                style={{ fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8, border: 'none', background: nameOk && companyOk ? '#0d0d0d' : '#e8e7e4', color: nameOk && companyOk ? '#fff' : '#b8b7b4', cursor: nameOk && companyOk && !saving ? 'pointer' : 'not-allowed' }}>
                {saving ? 'Creating…' : 'Create and choose topics'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#888784', marginTop: 10, textAlign: 'right', lineHeight: 1.6 }}>
              All 37 ESRS sub-topics are included to begin with. You choose what to exclude next.
            </div>
          </div>
        )}

        {loading && <div style={{ padding: '3rem', textAlign: 'center', color: '#888784' }}>Loading survey rounds…</div>}

        {loadError && (
          <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 12, padding: '14px 16px', marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: FAIL, marginBottom: 4 }}>COULD NOT LOAD</div>
            <div style={{ fontSize: 12.5, color: '#555553', lineHeight: 1.7 }}>{loadError}</div>
          </div>
        )}

        {!loading && !loadError && rounds.length === 0 && !showNew && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2.5rem', textAlign: 'center', marginTop: 20 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: '#0d0d0d', marginBottom: 8 }}>No survey rounds yet</div>
            <div style={{ fontSize: 13, color: '#888784', lineHeight: 1.7, maxWidth: 460, margin: '0 auto' }}>
              A round is one survey sent to one group of people. Most companies run several — staff
              first, then suppliers, then communities — and use them together.
            </div>
          </div>
        )}

        {!loading && rounds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
            {rounds.map(r => {
              const s = STATUS[r.status] ?? STATUS.draft
              const sc = scope[r.id]
              return (
                <Link key={r.id} href={`/dashboard/materiality/survey/${r.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14.5, fontWeight: 500, color: '#0d0d0d' }}>{r.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.color, background: s.bg, borderRadius: 99, padding: '2px 9px' }}>{s.label}</span>
                        {r.frozen_at && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#888784', background: '#f8f7f5', borderRadius: 99, padding: '2px 9px' }}>RESPONSES IN</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#888784', marginTop: 4 }}>
                        {r.company_name}
                        {sc && ` · ${sc.included} of ${sc.total} topics in scope`}
                        {r.deadline && ` · deadline ${new Date(r.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#7425e3', flexShrink: 0 }}>Open →</div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 28, textAlign: 'center', fontSize: 12, color: '#888784', lineHeight: 1.7 }}>
          <Link href="/dashboard/climate-risk" style={{ color: '#7425e3', textDecoration: 'none' }}>← Climate Risk &amp; Materiality</Link>
        </div>
      </div>
    </div>
  )
}
