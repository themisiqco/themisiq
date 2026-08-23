'use client'

/**
 * Edit a materiality assessment's three customer-supplied fields.
 *
 * ⚠️ THIS CLOSES AN EXISTING DEAD END, and that is the point of it — see the head of
 * AssessmentForm.tsx. Two surfaces told a customer to state a standard version with nowhere to do
 * it; both now link here.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../../components/Nav'
import PaywallCard from '../../../../../components/PaywallCard'
import { supabase } from '../../../../../../lib/supabase'
import { useEntitlement } from '../../../../../../lib/useEntitlement'
import { isStandardVersion, type StandardVersion } from '../../../../../../lib/materiality'
import { AssessmentForm, type AssessmentFormValues } from '../../AssessmentForm'
import {
  classifyVersionLock, assessmentSaveMessage, standardVersionOffer, unavailableVersionMessage,
  type VersionLock,
} from '../../../../../../lib/materiality/versionAgreement'

const PURPLE = '#7425e3'
const INK = '#0d0d0d'
const MID = '#555553'
const LINE = '#e8e7e4'
const PAPER = '#f8f7f5'

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
    <Nav />
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem' }}>{children}</div>
  </div>
)

export default function EditAssessmentPage() {
  const params = useParams()
  const router = useRouter()
  const assessmentId = String(params?.id ?? '')
  const isPaid = useEntitlement('impact-materiality')

  const [values, setValues] = useState<AssessmentFormValues | null>(null)
  const [versionLock, setVersionLock] = useState<VersionLock>({ kind: 'free' })
  const [finalisedVersion, setFinalisedVersion] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)

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
    setValues({
      companyName: asmt.company_name ?? '',
      version: isStandardVersion(asmt.standard_version) ? asmt.standard_version : null,
      periodStart: asmt.reporting_period_start ?? '',
      periodEnd: asmt.reporting_period_end ?? '',
    })

    // ⚠️ TWO SIGNALS, AND THEY GATE DIFFERENT THINGS. The determinations decide what the version may
    // BECOME — see classifyVersionLock. THE VERSIONS THEY CARRY, NOT HOW MANY THERE ARE: a count can
    // only ever say no, and when the two disagree the carried version is the single value it is safe
    // to offer, so a count would leave the customer with no way out. Reading the column costs
    // nothing — 37 sub-topics x 2 directions is 74 rows of one text field at most.
    // A finalisation does NOT lock anything — it explains a consequence the customer can resolve by
    // finalising again, which is what 20260848's versioning is for.
    const [det, { data: fin }] = await Promise.all([
      supabase.from('materiality_impact_determinations')
        .select('standard_version').eq('assessment_id', assessmentId),
      supabase.from('materiality_finalisations')
        .select('version').eq('assessment_id', assessmentId)
        .order('version', { ascending: false }).limit(1).maybeSingle(),
    ])
    // ⚠️ THE READ FAILURE IS PASSED, NOT ENCODED AS A COUNT. Treating a failed read as "no
    // determinations" would unlock the control on precisely the assessment whose state could not be
    // established; but faking a count of 1 to force a lock told a customer whose empty assessment
    // merely dropped a request that their data needed looking at on our side. Two different facts,
    // two different sentences — classifyVersionLock owns which is which.
    const detRows = (det.data ?? []) as { standard_version: string }[]
    setVersionLock(classifyVersionLock({
      stated: asmt.standard_version,
      carried: Array.from(new Set(detRows.map(r => r.standard_version))).sort(),
      determinations: detRows.length,
      readFailed: !!det.error,
    }))
    setFinalisedVersion((fin as { version: number } | null)?.version ?? null)
    setLoading(false)
  }, [assessmentId])

  useEffect(() => { if (assessmentId) void load() }, [assessmentId, load])

  async function save() {
    if (!values) return
    /**
     * ⚠️ THE SAME GUARD AS new/page.tsx, IN THE SAME PLACE — the payload, not the control. This
     * screen reaches it by a route that one does not: an assessment created BEFORE the version was
     * withdrawn loads with esrs_2023 already in `values`, no determinations, and therefore a `free`
     * lock. Its worksheet is already empty; letting the save through would write the same value
     * back and keep it that way.
     *
     * ⚠️ `free` ONLY, and the other kinds are not oversights. `repairable` writes versionLock.to,
     * which the determinations' foreign key has already proved is in scope (see
     * standardVersionOffer); `agrees`, `unrepairable` and `unknown` omit the column entirely, and
     * refusing the save on those would stop a customer editing their company name over a version
     * this screen is not touching.
     */
    if (versionLock.kind === 'free' && values.version
        && !standardVersionOffer(values.version, versionLock).pick) {
      setError(unavailableVersionMessage(values.version, 'saved'))
      return
    }
    setSaving(true); setError(null)
    // ⚠️ standard_version IS SENT ONLY WHERE IT MAY LEGALLY LAND, and the omission is the guard —
    // not the disabled control, so a stale tab cannot write an old value back over a corrected one.
    // TWO cases send it, not one. `free` is unconstrained. `repairable` sends exactly the version
    // the determinations already carry and nothing else: even a stale form holding a third version
    // fails `values.version === versionLock.to` and is left out of the payload, and 20260851 §3
    // would refuse it again server-side. `agrees`, `unrepairable` and `unknown` never send it.
    const patch: Record<string, unknown> = {
      company_name: values.companyName.trim() || null,
      reporting_period_start: values.periodStart || null,
      reporting_period_end: values.periodEnd || null,
    }
    if (versionLock.kind === 'free') patch.standard_version = values.version
    else if (versionLock.kind === 'repairable' && values.version === versionLock.to) {
      patch.standard_version = versionLock.to
    }

    const { data, error: err } = await supabase.from('materiality_assessments')
      .update(patch).eq('id', assessmentId).select('id')
    setSaving(false)
    // PT412 means this page's lock was computed before someone else recorded determinations, and
    // its raw text is written for a developer. See lib/materiality/versionAgreement.ts.
    if (err) { setError(assessmentSaveMessage(err)); return }
    if (!data || data.length === 0) {
      setError('Nothing was saved, and the server gave no reason. Your changes are not recorded.')
      return
    }
    router.push(`/dashboard/materiality/worksheet/${assessmentId}`)
  }

  if (isPaid === false) return (
    <Shell><PaywallCard title="Unlock Impact Materiality"
      body="Editing an assessment is part of the Impact Materiality Assessment."
      href="/pricing?modules=impact" /></Shell>
  )
  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
      <Nav /><div style={{ textAlign: 'center', padding: '4rem', color: MID }}>Loading…</div>
    </div>
  )
  if (loadError || !values) return (
    <Shell><div style={{ background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 16, padding: '1.5rem' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 10 }}>
        This could not be shown</div>
      <div style={{ fontSize: 13.5, color: MID, lineHeight: 1.75 }}>{loadError}</div>
    </div></Shell>
  )

  return (
    <Shell>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/dashboard/materiality/worksheet" style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← All worksheets</Link>
        <Link href={`/dashboard/materiality/worksheet/${assessmentId}`} style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>Assign and chase</Link>
      </div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>
        Edit this assessment
      </div>
      <div style={{ fontSize: 13, color: MID, marginTop: 6, marginBottom: 24, lineHeight: 1.8 }}>
        The entity, the ESRS version and the period it covers. Everything else on this assessment is
        recorded through the worksheet and the survey.
      </div>
      <div style={{ background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 16, padding: '1.75rem' }}>
        <AssessmentForm
          values={values} onChange={setValues}
          versionLock={versionLock} finalisedVersion={finalisedVersion}
          saving={saving} error={error}
          submitLabel="Save changes" onSubmit={() => void save()}
          onCancel={() => router.push(`/dashboard/materiality/worksheet/${assessmentId}`)} />
      </div>
    </Shell>
  )
}
