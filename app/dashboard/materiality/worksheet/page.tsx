'use client'

/**
 * Impact worksheet — index. Which assessments have severity work, and how far along it is.
 *
 * ⚠️ THIS SCREEN EXISTS BECAUSE THERE WAS NO WAY TO REACH AN ASSESSMENT BY ID AT ALL.
 * /dashboard/materiality redirects to the climate-risk wizard, and the report reads ?id=<uuid> from
 * a URL someone must already hold. So the worksheet had no entry point and would have been
 * reachable only by typing a uuid. Mirrors /dashboard/materiality/survey, deliberately: the two are
 * the same shape of thing — a list of long-running pieces of work, each with its own workspace.
 *
 * Counts are computed here from two flat reads rather than per-assessment queries. RLS scopes both
 * to the signed-in user, so one read of each table is the whole picture.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Nav from '../../../components/Nav'
import PaywallCard from '../../../components/PaywallCard'
import { PAYWALL_HREF, PAYWALL_TITLE, PAYWALL_WORKSHEET_INDEX } from '@/lib/paywallCopy'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'

const PURPLE = '#7425e3'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
const AMBER = 'var(--color-module-climate)'
const AMBER_BG = '#FEF3E2'
const INK = '#0d0d0d'
const MID = '#555553'
const MUTE = 'var(--color-ink-muted)'
const LINE = '#e8e7e4'
const PAPER = '#f8f7f5'

type Assessment = {
  id: string
  company_name: string | null
  standard_version: string | null
  status: string
  created_at: string
}

type Row = Assessment & {
  contributors: number
  revoked: number
  assigned: number
  submitted: number
  overridden: number
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const versionLabel = (v: string | null) =>
  v === 'esrs_2026' ? 'ESRS (2026)'
    : v === 'esrs_2023' ? 'ESRS (2023)'
    : v === 'esrs_2023_reliefs' ? 'ESRS (2023, reliefs)'
    : 'No standard version stated'

export default function WorksheetIndex() {
  const isPaid = useEntitlement('double-materiality')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true); setLoadError(null)

    const [aRes, gRes, sRes, dRes] = await Promise.all([
      supabase.from('materiality_assessments')
        .select('id, company_name, standard_version, status, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('materiality_impact_assignments').select('id, assessment_id, status'),
      supabase.from('materiality_impact_assignment_subtopics').select('assessment_id, subtopic_code'),
      supabase.from('materiality_impact_determinations')
        .select('assessment_id, status, overridden_at'),
    ])

    const firstError = [aRes, gRes, sRes, dRes].find(r => r.error)?.error
    if (firstError) { setLoadError(firstError.message); setLoading(false); return }

    const assessments = (aRes.data || []) as Assessment[]
    const assignments = (gRes.data || []) as { assessment_id: string; status: string }[]
    const subs = (sRes.data || []) as { assessment_id: string; subtopic_code: string }[]
    const dets = (dRes.data || []) as { assessment_id: string; status: string; overridden_at: string | null }[]

    setRows(assessments.map(a => ({
      ...a,
      contributors: assignments.filter(x => x.assessment_id === a.id && x.status !== 'revoked').length,
      revoked:      assignments.filter(x => x.assessment_id === a.id && x.status === 'revoked').length,
      assigned:     new Set(subs.filter(x => x.assessment_id === a.id).map(x => x.subtopic_code)).size,
      submitted:    dets.filter(x => x.assessment_id === a.id && x.status === 'submitted').length,
      overridden:   dets.filter(x => x.assessment_id === a.id && x.overridden_at !== null).length,
    })))
    setLoading(false)
  }

  if (isPaid === false) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>
        <PaywallCard title={PAYWALL_TITLE}
          body={PAYWALL_WORKSHEET_INDEX}
          href={PAYWALL_HREF} />
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav /><div style={{ textAlign: 'center', padding: '4rem', color: MUTE }}>Loading assessments…</div>
    </div>
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  background: PAPER, minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem' }}>

        <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/dashboard/climate-risk" style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← Climate Risk &amp; Materiality</Link>
          <Link href="/dashboard/materiality/survey" style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Stakeholder surveys</Link>
        </div>

        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: INK }}>Impact worksheet</div>
        <div style={{ fontSize: 13, color: MID, marginTop: 6, marginBottom: 22, lineHeight: 1.8, maxWidth: 700 }}>
          Where your own severity determination is recorded, against ESRS 1 — how grave an impact is,
          how widespread, and how hard to put right. The stakeholder survey collects what other people
          think matters; this is the judgement your organisation makes, and it is the part an assurer
          reads as the assessment.
        </div>

        {loadError && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 12,
                        padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: INK, lineHeight: 1.75 }}>
            <strong>The list could not be loaded.</strong> The server said: {loadError}
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Link href="/dashboard/materiality/assessment/new"
                  style={{ fontSize: 12.5, fontWeight: 600, color: PURPLE, textDecoration: 'none' }}>
              + New assessment
            </Link>
          </div>
        )}

        {rows.length === 0 && !loadError ? (
          <div style={{ background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 16,
                        padding: '2.5rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: INK, marginBottom: 10 }}>
              No assessments yet
            </div>
            <div style={{ fontSize: 13, color: MID, lineHeight: 1.8, maxWidth: 520, margin: '0 auto' }}>
              {/* The dependency this used to name is resolved: until 22 Aug 2026 the Climate Risk
                  wizard was the only thing that inserted an assessment row, so a customer holding
                  the Materiality Assessment alone landed here with nothing to open and a link to a module
                  they had not bought. */}
              An impact worksheet hangs off a materiality assessment. Create one to begin — three
              questions: who you are reporting as, which ESRS version you report under, and the
              period it covers.
            </div>
            <Link href="/dashboard/materiality/assessment/new"
                  style={{ display: 'inline-block', marginTop: 18, fontSize: 13, fontWeight: 600,
                           padding: '10px 22px', borderRadius: 8, background: INK, color: '#fff',
                           textDecoration: 'none' }}>
              Create an assessment
            </Link>
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 14, lineHeight: 1.7 }}>
              {/* The other path still exists and still works — a Climate Risk customer's screening
                  run creates an assessment too and lands them on this same list. Naming it keeps a
                  customer who holds both modules from creating a second row for the same year. */}
              If you also hold Climate Risk, running a screening there creates one as well.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {rows.map(r => (
              <Link key={r.id} href={`/dashboard/materiality/worksheet/${r.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 14,
                              padding: '1.1rem 1.3rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
                                alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>
                      {r.company_name || 'Unnamed assessment'}
                    </div>
                    <div style={{ fontSize: 11, color: MUTE }}>
                      {versionLabel(r.standard_version)} · started {fmt(r.created_at)}
                      {' · '}
                      {/* Beside the version label deliberately: this is where a customer notices it
                          is wrong, and until 22 Aug 2026 there was nowhere to go from here. */}
                      <Link href={`/dashboard/materiality/assessment/${r.id}/edit`}
                            style={{ color: PURPLE, textDecoration: 'none' }}>Edit</Link>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {r.contributors === 0 && r.assigned === 0 ? (
                      <span style={{ fontSize: 11.5, color: MUTE }}>
                        No severity work started — nothing assigned, no contributors invited.
                      </span>
                    ) : (
                      <>
                        <Pill text={`${r.contributors} ${r.contributors === 1 ? 'contributor' : 'contributors'}`} fg={INK} bg={PAPER} />
                        <Pill text={`${r.assigned} sub-topics assigned`} fg={INK} bg={PAPER} />
                        <Pill text={`${r.submitted} determinations submitted`}
                              fg={r.submitted > 0 ? GREEN : MUTE} bg={r.submitted > 0 ? GREEN_BG : PAPER} />
                        {r.overridden > 0 && <Pill text={`${r.overridden} superseded by you`} fg={AMBER} bg={AMBER_BG} />}
                        {/* Revoked assignments are counted and named here rather than dropped —
                            withdrawing access does not remove the work someone did. */}
                        {r.revoked > 0 && <Pill text={`${r.revoked} access withdrawn`} fg={MUTE} bg={PAPER} />}
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Pill({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return (
    <span style={{ display: 'inline-block', background: bg, color: fg, border: `0.5px solid ${LINE}`,
                   borderRadius: 999, padding: '3px 10px', fontSize: 11, whiteSpace: 'nowrap' }}>{text}</span>
  )
}
