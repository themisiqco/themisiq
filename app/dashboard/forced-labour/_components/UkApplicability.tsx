'use client'

// app/dashboard/forced-labour/_components/UkApplicability.tsx
// "Does section 54 apply?" for the UK tab: the result card and the questions, in the three-step layout of
// Canada's form (Applicability.tsx, whose pieces this reuses). The logic is lib/forcedLabour/uk/applicability.ts.
// UK-specific copy, so British spelling; quotations are the constants'.

import {
  UK_OUTCOME_LABEL, UK_ORG_FORMS, UK_QUOTED, UK_SCREENING_NOTE, ESTIMATE_CAVEAT, estimateLabel, turnoverEstimate,
  type UkApplicabilityForm, type UkApplicability,
} from '../../../../lib/forcedLabour/uk/applicability'
import { longDate } from '../../../../lib/s211/reportModel'
import { APPLICABILITY_CSS, Segmented, Step, AmountField, YES_NO } from './Applicability'
import { S } from './ui'

export function UkApplicabilityResult({ result }: { result: UkApplicability }) {
  return (
    <div style={S.card}>
      <p style={{ ...S.body, margin: '0 0 4px' }}><strong>Section 54:</strong> {UK_OUTCOME_LABEL[result.outcome]}</p>
      {result.reasons.length > 0 && <ul style={{ ...S.muted, margin: '0 0 8px', paddingLeft: 18 }}>{result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      {result.unanswered.length > 0 && result.outcome === 'undetermined' && (
        <>
          <p style={{ ...S.muted, margin: '0 0 4px' }}>Still to answer:</p>
          <ul style={{ ...S.muted, margin: '0 0 8px', paddingLeft: 18 }}>{result.unanswered.map(u => <li key={u}>{u}</li>)}</ul>
        </>
      )}
      {result.restsOnEstimate && <p style={{ ...S.warn, margin: '8px 0' }}>{ESTIMATE_CAVEAT}</p>}
      <p style={{ ...S.muted, margin: '8px 0 0' }}>The Act, s.54(2): a commercial organisation &ldquo;{UK_QUOTED.supplies}&rdquo; and &ldquo;{UK_QUOTED.turnover}&rdquo;.</p>
      <p style={{ ...S.muted, margin: '6px 0 0' }}>The 2015 Regulations, reg. 2: &ldquo;{UK_QUOTED.threshold}&rdquo;</p>
      <p style={{ ...S.hint, marginTop: 10 }}>{UK_SCREENING_NOTE}</p>
    </div>
  )
}

/** The figures an estimate can start from: the organisation's shared revenue, else Canada's own figure. */
export type EstimateSources = { organization: { amount: number; currency: string } | null; canada: { amount: number; currency: string } | null }

export function UkApplicabilityQuestions({ form, onChange, sources }: {
  form: UkApplicabilityForm; onChange: (patch: Partial<UkApplicabilityForm>) => void; sources: EstimateSources
}) {
  const source = sources.organization ?? sources.canada
  const estimate = source ? turnoverEstimate(source.amount, source.currency) : null
  const label = estimateLabel(form, longDate)
  return (
    <div>
      <style>{APPLICABILITY_CSS}</style>
      <Step n={1} title="The organisation" explain="Section 54 applies to a commercial organisation: a body corporate or a partnership carrying on a business, or part of a business, in any part of the United Kingdom.">
        <Segmented name="org_form" legend="What kind of organisation is it?" value={form.org_form} options={UK_ORG_FORMS} onChange={v => onChange({ org_form: v })} />
        <Segmented name="uk_business" legend="Does it carry on a business, or part of a business, in any part of the United Kingdom?" value={form.uk_business} options={YES_NO} onChange={v => onChange({ uk_business: v })} />
        <p style={{ ...S.hint, margin: '8px 0 0' }}>The Act, s.54(12): &ldquo;{UK_QUOTED.commercialOrganisation}&rdquo;.</p>
      </Step>

      <Step n={2} title="What it supplies" explain="Section 54(2)(a): the organisation supplies goods or services.">
        <Segmented name="supplies" legend="Does it supply goods or services?" value={form.supplies} options={YES_NO} onChange={v => onChange({ supplies: v })} />
      </Step>

      <Step n={3} title="Turnover" explain="Total turnover in pounds sterling, as regulation 3 defines it: the organisation's own and its subsidiary undertakings', after trade discounts, VAT and other taxes based on it.">
        <AmountField id="uk-turnover" label="Total turnover (GBP)" value={form.turnover_gbp}
          onChange={v => onChange({ turnover_gbp: v, turnover_basis: 'confirmed' })} />
        {label && (
          <div style={{ ...S.warn, margin: '10px 0 0' }}>
            <p style={{ margin: '0 0 8px' }}>{label}</p>
            <button type="button" style={{ ...S.buttonQuiet, padding: '5px 10px' }} onClick={() => onChange({ turnover_basis: 'confirmed' })}>This is our turnover as regulation 3 defines it</button>
          </div>
        )}
        {!form.turnover_gbp && estimate && (
          <p style={{ margin: '10px 0 0' }}>
            <button type="button" style={{ ...S.buttonQuiet, padding: '5px 10px' }} onClick={() => onChange(estimate)}>
              Start from an estimate ({Number(estimate.estimate_from_amount).toLocaleString('en-GB')} {estimate.estimate_from_currency}{sources.organization ? ', the organisation’s revenue' : ', from the Canada answers'})
            </button>
          </p>
        )}
        <p style={{ ...S.hint, margin: '10px 0 0' }}>Regulation 3(1): &ldquo;{UK_QUOTED.turnoverIncludes}&rdquo;. Regulation 3(2): &ldquo;{UK_QUOTED.turnoverMeans}&rdquo;.</p>
      </Step>
    </div>
  )
}
