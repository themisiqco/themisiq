'use client'

/**
 * Create a materiality assessment without the Climate Risk wizard.
 *
 * ⚠️ WHY THIS EXISTS. Until 22 Aug 2026 the wizard at /dashboard/climate-risk was the ONLY thing
 * that inserted a materiality_assessments row, so a customer holding the Materiality Assessment alone —
 * a module sold separately from that day — landed on an empty worksheet list with nothing to open
 * and a link to a module they had not bought.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Nav from '../../../../components/Nav'
import PaywallCard from '../../../../components/PaywallCard'
import { PAYWALL_ASSESSMENT_NEW, PAYWALL_HREF, PAYWALL_TITLE } from '@/lib/paywallCopy'
import { supabase } from '../../../../../lib/supabase'
import { useEntitlement } from '../../../../../lib/useEntitlement'
import { AssessmentForm, type AssessmentFormValues } from '../AssessmentForm'
import {
  standardVersionOffer, unavailableVersionMessage,
} from '../../../../../lib/materiality/versionAgreement'

const PURPLE = '#7425e3'
const INK = '#0d0d0d'
const MID = '#555553'
const MUTE = '#888784'
const LINE = '#e8e7e4'
const PAPER = '#f8f7f5'

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: '-apple-system, sans-serif', background: PAPER, minHeight: '100vh' }}>
    <Nav />
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem' }}>{children}</div>
  </div>
)

export default function NewAssessmentPage() {
  const router = useRouter()
  const isPaid = useEntitlement('double-materiality')

  const [values, setValues] = useState<AssessmentFormValues>({
    companyName: '', version: null, periodStart: '', periodEnd: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    /**
     * ⚠️ AT SUBMIT, NOT ONLY IN THE CHOOSER. The option is closed and the button is disabled while
     * an unavailable version is held — but neither of those is where the payload is built, and a
     * form left open across the deploy that withdrew a version still holds it in state. This is the
     * last point before an INSERT that would produce a perfectly valid row whose worksheet opens
     * empty: the CHECK constraint admits all three versions, so the database will not catch it.
     *
     * `{ kind: 'free' }` is not a shortcut — it is what this screen passes the form, and it is the
     * only lock a row that does not exist yet can have: no assessment, no determinations.
     */
    if (!values.version) {
      setError('Choose the ESRS version this assessment is prepared under. Nothing was created.')
      return
    }
    if (!standardVersionOffer(values.version, { kind: 'free' }).pick) {
      setError(unavailableVersionMessage(values.version, 'created'))
      return
    }
    setSaving(true); setError(null)
    const { data, error: err } = await supabase.from('materiality_assessments')
      .insert({
        company_name: values.companyName.trim() || null,
        standard_version: values.version,
        reporting_period_start: values.periodStart || null,
        reporting_period_end: values.periodEnd || null,
        // ⚠️ NOTHING ELSE IS WRITTEN, DELIBERATELY. mode defaults to 'csrd', which is right for an
        // impact assessment; status defaults to 'draft', which is honest — the wizard writes
        // 'complete' because its RUN is complete at insert, and this row's work has not started.
        // workings and results stay null: see the note at the head of AssessmentForm.tsx.
      })
      .select('id').single()
    setSaving(false)
    // The database's own sentence. The both-or-neither and order CHECKs are guarded in the form, so
    // anything reaching here is something the form did not anticipate and should not paraphrase.
    if (err) { setError(err.message); return }
    if (!data) { setError('Nothing was created, and the server gave no reason.'); return }
    router.push(`/dashboard/materiality/worksheet/${data.id}`)
  }

  if (isPaid === false) return (
    <Shell><PaywallCard title={PAYWALL_TITLE}
      body={PAYWALL_ASSESSMENT_NEW}
      href={PAYWALL_HREF} /></Shell>
  )

  return (
    <Shell>
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard/materiality/worksheet" style={{ fontSize: 12, color: PURPLE, textDecoration: 'none' }}>← Impact worksheet</Link>
      </div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>
        New materiality assessment
      </div>
      <div style={{ fontSize: 13, color: MID, marginTop: 6, marginBottom: 24, lineHeight: 1.8 }}>
        Three questions. Everything else — scope, contributors, the survey — follows from these.
      </div>
      <div style={{ background: '#fff', border: `0.5px solid ${LINE}`, borderRadius: 16, padding: '1.75rem' }}>
        <AssessmentForm
          values={values} onChange={setValues}
          versionLock={{ kind: 'free' }} finalisedVersion={null}
          saving={saving} error={error}
          submitLabel="Create assessment" onSubmit={() => void create()} />
      </div>
      <div style={{ fontSize: 11.5, color: MUTE, marginTop: 14, lineHeight: 1.7 }}>
        This creates the assessment only. It does not run the Climate Risk screening, and does not
        need to — the two are separate modules producing separate documents.
      </div>
    </Shell>
  )
}
