'use client'

// app/dashboard/forced-labour/_components/Applicability.tsx
// "Does the Act apply?": the result card and the questions, shared by a report's home in the builder and
// the free check at /forced-labour/canada/check, so both ask the same questions and show the same reasons and
// quotations. The logic is lib/s211/applicability.ts; this only draws it.

import { useState } from 'react'
import {
  PRESENCE_QUESTIONS, ACTIVITY_QUESTIONS, YEARS, FIGURES, ENTITY_LABEL, ACT_9A_LABEL, SCREENING_NOTE,
  parseAmountInput, formatAmount, formCurrency, currenciesDiffer, withCurrency, isListed, noCanadaConnection,
  type ApplicabilityForm, type evaluateApplicability,
} from '../../../../lib/s211/applicability'
import { S211_ACT_DEFINITION_ENTITY } from '../../../../lib/s211/requirements'
import { FX_CURRENCIES, FX_AS_OF } from '../../../../lib/fx'
import { longDate } from '../../../../lib/s211/reportModel'
import { S211_OUTCOME_LABEL } from '../../../../lib/s211/obligation'
import { S } from './ui'

export function ApplicabilityResult({ result }: { result: ReturnType<typeof evaluateApplicability> }) {
  return (
    <div style={S.card}>
      <p style={{ ...S.body, margin: '0 0 4px' }}><strong>Entity test:</strong> {ENTITY_LABEL[result.entity.outcome]}</p>
      <ul style={{ ...S.muted, margin: '0 0 10px', paddingLeft: 18 }}>{result.entity.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      <p style={{ ...S.body, margin: '0 0 4px' }}><strong>Reporting obligation:</strong> {S211_OUTCOME_LABEL[result.obligation.outcome]}</p>
      <ul style={{ ...S.muted, margin: 0, paddingLeft: 18 }}>{result.obligation.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      {/* The Act's words and the current guidance first; notes about earlier versions of the guidance after. */}
      {result.obligation.actQuoted && <p style={{ ...S.muted, margin: '8px 0 0' }}>{ACT_9A_LABEL}: &ldquo;{result.obligation.actQuoted}&rdquo;</p>}
      {result.obligation.guidanceQuoted.map((q, i) => <p key={i} style={{ ...S.muted, margin: '8px 0 0' }}>Public Safety Canada guidance: &ldquo;{q}&rdquo;</p>)}
      {result.obligation.notes.map((n, i) => <p key={i} style={{ ...S.muted, margin: '8px 0 0' }}>{n}</p>)}
      {result.unanswered > 0 && <p style={{ ...S.hint, marginTop: 10 }}>{result.unanswered} of the questions about goods are not answered yet. Until they are, they are treated as &ldquo;not sure&rdquo;.</p>}
      <p style={{ ...S.hint, marginTop: 10 }}>{SCREENING_NOTE}</p>
    </div>
  )
}

// ── The questions ─────────────────────────────────────────────────────────────────────────────────
// Three numbered steps, each its own card. Segmented Yes / No (and Not sure for goods) in place of the
// dropdowns: native radio inputs, so a group is one tab stop and the arrow keys move within it, with the
// labels as the visible segments. Nothing selected is "not answered"; choosing the selected answer again
// clears it, so an answer can always be taken back. The values are the dropdowns' values exactly.

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] as const
const YES_NO_NOT_SURE = [...YES_NO, { value: 'not-sure', label: 'Not sure' }] as const

/** The Act's own words for the two notes in step 2 (s.2 "entity", paragraphs (a) and (b)). */
const LISTED_WORDS = S211_ACT_DEFINITION_ENTITY.paragraphs[0].text.replace(/;$/, '')
const CONNECTION_WORDS = S211_ACT_DEFINITION_ENTITY.paragraphs[1].text.split(' and that')[0]

export const APPLICABILITY_CSS = `
.fl-step { border: 1px solid #e8e7e4; border-radius: 12px; background: #fff; padding: 18px 20px; margin-bottom: 16px; }
.fl-step-head { display: flex; gap: 12px; align-items: baseline; margin-bottom: 4px; }
.fl-step-n { flex-shrink: 0; width: 26px; height: 26px; border-radius: 99px; background: var(--color-brand); color: #fff; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.fl-q { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 16px; padding: 10px 0; border-top: 1px solid #f0efec; margin: 0; min-width: 0; }
.fl-q legend { float: left; padding: 0; font-size: 14px; color: var(--color-ink); line-height: 1.5; max-width: 100%; }
.fl-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.fl-seg label { position: relative; }
.fl-seg input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
.fl-seg span { display: inline-block; min-width: 56px; text-align: center; padding: 6px 14px; font-size: 13px; border: 1px solid #d6d4cf; border-radius: 8px; background: #fff; color: var(--color-ink); cursor: pointer; }
.fl-seg input:checked + span { background: var(--color-brand); border-color: var(--color-brand); color: #fff; font-weight: 600; }
.fl-seg input:focus-visible + span { outline: 2px solid var(--color-brand); outline-offset: 2px; }
.fl-seg input:disabled + span { cursor: default; opacity: 0.7; }
.fl-years { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px; margin-top: 12px; }
.fl-year { border: 1px solid #f0efec; border-radius: 10px; padding: 12px 14px; background: #FBFAF8; }
.fl-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr)); gap: 8px; }
.fl-check { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
@media (min-width: 980px) {
  .fl-check { grid-template-columns: minmax(0, 1fr) 380px; }
  .fl-side { position: sticky; top: 16px; }
}
`

function Segmented({ name, legend, value, options, onChange }: {
  name: string; legend: string; value: string | undefined
  options: readonly { value: string; label: string }[]; onChange: (v: string) => void
}) {
  return (
    <fieldset className="fl-q">
      <legend>{legend}</legend>
      <div className="fl-seg" role="radiogroup" aria-label={legend}>
        {options.map(o => (
          <label key={o.value}>
            <input type="radio" name={name} value={o.value} checked={value === o.value}
              onChange={() => onChange(o.value)}
              // Choosing the selected answer again takes it back to "not answered".
              onClick={() => { if (value === o.value) onChange('') }} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Step({ n, title, explain, children }: { n: number; title: string; explain: string; children: React.ReactNode }) {
  return (
    <section className="fl-step" aria-labelledby={`fl-step-${n}`}>
      <div className="fl-step-head">
        <span className="fl-step-n" aria-hidden="true">{n}</span>
        <h2 id={`fl-step-${n}`} style={{ ...S.h2, margin: 0, fontSize: '1.05rem' }}>{title}</h2>
      </div>
      <p style={{ ...S.hint, margin: '0 0 8px 38px' }}>{explain}</p>
      {children}
    </section>
  )
}

function AmountField({ id, label, value, onChange }: { id: string; label: string; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{label}
      {/* Text, not type="number": no spinner, and room for the separators. The stored value is plain digits. */}
      <input id={id} type="text" inputMode="decimal" autoComplete="off" style={{ ...S.input, marginTop: 3 }}
        value={formatAmount(value)} onChange={e => onChange(parseAmountInput(e.target.value))} />
    </label>
  )
}

export function ApplicabilityQuestions({ form, onChange }: { form: ApplicabilityForm; onChange: (key: string, value: string) => void }) {
  // Folding step 2 is display only: the figures stay in the form and still reach the test.
  const [showSize, setShowSize] = useState(false)
  const sizeFolded = isListed(form) && !showSize
  const currency = formCurrency(form)
  const setCurrency = (c: string) => { const next = withCurrency(form, c); onChange('recent_fy_currency', next.recent_fy_currency); onChange('prior_fy_currency', next.prior_fy_currency) }
  const currencies = ['CAD', ...FX_CURRENCIES.filter(c => c !== 'CAD').sort()]

  return (
    <div>
      <style>{APPLICABILITY_CSS}</style>
      <Step n={1} title="Your connection to Canada" explain="Whether the entity is listed in Canada, or has a place of business, does business or has assets there.">
        {PRESENCE_QUESTIONS.map(([k, label]) => (
          <Segmented key={k} name={k} legend={label} value={form[k]} options={YES_NO} onChange={v => onChange(k, v)} />
        ))}
      </Step>

      <Step n={2} title="Your size" explain="Assets, revenue and average employees for the two most recent financial years, from consolidated financial statements. Leave a figure blank if you do not have it.">
        {sizeFolded ? (
          <div style={{ ...S.warn, margin: '4px 0 0' }}>
            <p style={{ margin: '0 0 8px' }}>
              Size does not matter for an entity listed on a stock exchange in Canada. Section 2 of the Act makes it an entity if it &ldquo;{LISTED_WORDS}&rdquo;, with no size condition. Any figures you entered are kept.
            </p>
            <button type="button" style={{ ...S.buttonQuiet, padding: '5px 10px' }} onClick={() => setShowSize(true)}>Show the size questions</button>
          </div>
        ) : (
          <>
            {noCanadaConnection(form) && (
              <p style={{ ...S.warn, margin: '4px 0 10px' }}>
                The size conditions only matter for an entity with a connection to Canada. Section 2 of the Act applies them to one that &ldquo;{CONNECTION_WORDS}&rdquo;. You can still enter your figures.
              </p>
            )}
            <label htmlFor="fl-currency" style={{ ...S.label, marginTop: 4 }}>Currency of your financial statements</label>
            <select id="fl-currency" style={{ ...S.input, maxWidth: 220 }} value={currency} onChange={e => setCurrency(e.target.value)}>
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {currenciesDiffer(form) && <p style={{ ...S.hint, margin: '6px 0 0' }}>The two years were saved in different currencies. Choosing one here applies it to both.</p>}
            <div className="fl-years">
              {YEARS.map(p => (
                <div key={p} className="fl-year" role="group" aria-labelledby={`fl-year-${p}`}>
                  <p id={`fl-year-${p}`} style={{ ...S.label, margin: '0 0 8px' }}>{p === 'recent' ? 'Most recent financial year' : 'The financial year before it'}</p>
                  <div className="fl-fields">
                    {FIGURES.map(([k, l]) => (
                      <AmountField key={k} id={`fl-${p}-${k}`} label={k === 'avg_employees' ? l : `${l} (${currency})`}
                        value={form[`${p}_fy_${k}`]} onChange={v => onChange(`${p}_fy_${k}`, v)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ ...S.hint, margin: '10px 0 0' }}>
              Figures in another currency are converted to Canadian dollars at the ECB reference rates of {longDate(FX_AS_OF)}, the rates this module uses.
            </p>
            {isListed(form) && <button type="button" style={{ ...S.buttonQuiet, padding: '5px 10px', marginTop: 10 }} onClick={() => setShowSize(false)}>Fold the size questions away</button>}
          </>
        )}
      </Step>

      <Step n={3} title="What you do with goods" explain="The activities section 9 of the Act covers. A question left unanswered counts as not sure.">
        {ACTIVITY_QUESTIONS.map(([k, q]) => (
          <Segmented key={k} name={k} legend={q} value={form[k]} options={YES_NO_NOT_SURE} onChange={v => onChange(k, v)} />
        ))}
      </Step>
    </div>
  )
}
