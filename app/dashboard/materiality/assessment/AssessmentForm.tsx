'use client'

/**
 * Create or edit a materiality assessment — the three fields the impact path actually reads.
 *
 * ⚠️ THE EDIT HALF IS NOT A CONVENIENCE. IT IS THE FIX FOR AN EXISTING DEAD END.
 * Nothing in this application had ever updated standard_version or the reporting period after the
 * Climate Risk wizard wrote them. That left two surfaces telling a customer to do something they
 * could not do:
 *     materiality_finalise (20260849)  — 'State the version on the assessment, then finalise.'
 *     worksheet/[id] noVersion block   — 'Set a standard version on the assessment first.'
 * Both sentences were true and neither was actionable. This screen is where they become actionable,
 * and both now link here.
 *
 * ⚠️ A BARE ASSESSMENT IS A SHAPE THAT ALREADY EXISTS — this does not introduce it. No workings and
 * no results are written. Both columns are nullable; materiality_assessments has NO not-null column
 * without a default, so `insert({})` would succeed. The impact path reads neither: a repo-wide
 * search of worksheet/, survey/ and stakeholder/ for `workings` returns one hit, and it is a comment
 * explaining that the board report deliberately reads the COLUMNS instead. The two surfaces that do
 * read workings are the screening's reports, gated on 'climate-risk', and both guard every access
 * with optional chaining. The climate payload is not being skipped here; it was never this path's
 * to write.
 */

import { useState } from 'react'
import {
  STANDARD_VERSION_COPY, STANDARD_VERSION_ORDER, isStandardVersion, type StandardVersion,
} from '../../../../lib/materiality'
import {
  standardVersionOffer, type VersionLock,
} from '../../../../lib/materiality/versionAgreement'

/** The address on the board report's back cover (boardReportPdf.ts:964). One address, both places. */
const CONTACT = 'lisa.foster@themisiq.co'

const PURPLE = '#7425e3'
const AMBER = '#ba7517'
const AMBER_BG = '#FEF3E2'
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'
const INK = '#0d0d0d'
const MID = '#555553'
const MUTE = '#888784'
const LINE = '#e8e7e4'

const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: INK, display: 'block', marginBottom: 6,
}
const input: React.CSSProperties = {
  width: '100%', fontSize: 13, padding: '9px 12px', border: `1px solid ${LINE}`,
  borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const hint: React.CSSProperties = { fontSize: 11, color: MUTE, marginTop: 5, lineHeight: 1.6 }
const LINK_STYLE: React.CSSProperties = { color: PURPLE, textDecoration: 'underline' }
const warn: React.CSSProperties = { fontSize: 11.5, color: AMBER, marginTop: 6, lineHeight: 1.6 }

export type AssessmentFormValues = {
  companyName: string
  version: StandardVersion | null
  periodStart: string
  periodEnd: string
}

/**
 * Re-exported, not defined here: the shape belongs beside the migration whose refusals it mirrors.
 * See lib/materiality/versionAgreement.ts.
 */
export type { VersionLock }

export function AssessmentForm({
  values, onChange, versionLock, finalisedVersion, saving, error, submitLabel, onSubmit, onCancel,
}: {
  values: AssessmentFormValues
  onChange: (v: AssessmentFormValues) => void
  versionLock: VersionLock
  /** The latest finalisation's version number, or null. Does NOT lock anything — see below. */
  finalisedVersion: number | null
  saving: boolean
  error: string | null
  submitLabel: string
  onSubmit: () => void
  onCancel?: () => void
}) {
  const set = (patch: Partial<AssessmentFormValues>) => onChange({ ...values, ...patch })

  // Same rules as the climate-risk wizard and as the CHECK constraints in 20260846, enforced here so
  // a constraint violation never reaches a customer as a raw Postgres string.
  const halfFilled = (!!values.periodStart) !== (!!values.periodEnd)
  const outOfOrder = !!values.periodStart && !!values.periodEnd && values.periodEnd <= values.periodStart

  const missing: string[] = []
  if (!values.companyName.trim()) missing.push('the reporting entity')
  if (!values.version) missing.push('the ESRS version')
  if (!values.periodStart || !values.periodEnd) missing.push('the reporting period')

  /**
   * ⚠️ A HELD VERSION CAN BE UNOFFERABLE WITHOUT ANYONE HAVING CLICKED ANYTHING: a form open across
   * the deploy that withdrew one, or — the case that actually happens — the edit screen loading an
   * assessment created earlier that STATES esrs_2023 and has no determinations yet. Its worksheet
   * is already empty; blocking the whole save is right, because the one edit it needs is the one
   * this refuses to skip. THE `free` TEST IS LOAD-BEARING: it is the only lock kind that writes the
   * form's version, so it is the only one that can write an unavailable one. Under `agrees` the
   * stated version may well be esrs_2023 — a Wave 1 assessment with recorded work — and blocking
   * there would stop that customer editing their own company name over a version nobody is moving.
   */
  const versionUnavailable = versionLock.kind === 'free' && !!values.version
    && !standardVersionOffer(values.version, versionLock).pick
  const blocked = missing.length > 0 || halfFilled || outOfOrder || versionUnavailable

  /**
   * ⚠️ THE ONLY THING THAT MAY EVER BE OFFERED WHEN THE RECORDED WORK DISAGREES IS THE VERSION THAT
   * WORK CARRIES. A free choice here would let a customer resolve a disagreement by picking a THIRD
   * version, orphaning every determination a second time — and 20260851 §3 would refuse the save
   * anyway, so it would be a choice that cannot be taken, presented as one that can.
   *
   * ⚠️ THAT RULE IS NOW ONE OF TWO. The lock says whether THIS assessment's version may move;
   * availability says whether ThemisIQ holds any sub-topics under a version at all
   * (STANDARD_VERSION_SCOPE_SEEDED — esrs_2026 alone today). Both must pass, they refuse for
   * unrelated reasons, and the offer is computed in ONE place so the chooser, the submit button and
   * both pages' payload guards cannot come to different conclusions. `repairable` deliberately does
   * not consult availability: see standardVersionOffer, where the foreign key is the argument.
   */
  const offer = (v: StandardVersion) => standardVersionOffer(v, versionLock)

  /** Falls back to the raw string: a value outside StandardVersion is still what is stored. */
  const versionLabel = (v: string | null) =>
    v && isStandardVersion(v) ? STANDARD_VERSION_COPY[v].l : (v ?? 'no version')

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <label style={label}>Reporting entity</label>
        <input style={input} value={values.companyName} placeholder="Acme Corporation Ltd."
               onChange={e => set({ companyName: e.target.value })} />
        <div style={hint}>
          The name this assessment is prepared for. It appears on the cover of every report.
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={label}>Which version of ESRS do you report under?</label>

        {/* ⚠️ NO "Prefer not to state yet" OPTION HERE, AND THE WIZARD'S HAVING ONE IS NOT AN
            INCONSISTENCY. That wizard produces a screening whose report prints "Not stated" and
            carries on, and Art. 2(2) permits an unstated version — offering it there is correct.
            THIS path leads to an assessment whose only purpose is determinations, and a null version
            cannot be finalised (20260849 refuses it), cannot link a survey round (the link guard
            refuses it), and cannot be lead-submitted without a round. Offering "not stated" here
            would offer a dead end wearing the clothes of a choice. */}
        {/* ⚠️ PER OPTION, NOT PER GROUP. In the `repairable` state exactly ONE version is
            selectable — the one the recorded determinations already carry — and it has to look
            available while the others look closed. A group-level opacity cannot say that. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {STANDARD_VERSION_ORDER.map(v => {
            const sel = values.version === v
            const { pick, note } = offer(v)
            const copy = STANDARD_VERSION_COPY[v]
            return (
              <div key={v}
                   onClick={() => { if (pick) set({ version: v }) }}
                   style={{ border: `1.5px solid ${sel ? PURPLE : LINE}`, borderRadius: 8,
                            padding: '9px 12px', background: sel ? '#f6f1fe' : '#fff',
                            opacity: pick ? 1 : 0.5,
                            cursor: pick ? 'pointer' : 'not-allowed' }}>
                <div style={{ fontSize: 12, fontWeight: sel ? 600 : 500, color: sel ? PURPLE : INK }}>
                  {copy.l}
                </div>
                <div style={{ fontSize: 10.5, color: MUTE, marginTop: 1, lineHeight: 1.4 }}>{copy.d}</div>
                {/* ⚠️ SHOWN AND CLOSED, NEVER REMOVED. A buyer evaluating a compliance product
                    should be able to see that it knows ESRS (2023) exists and has taken a position
                    on it; an option quietly filtered out answers no question and reads as a product
                    that has not heard of the 2023 standards. One line, factual, no date — a date
                    here is a promise about somebody's filing deadline. */}
                {note && (
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: MID, marginTop: 4,
                                lineHeight: 1.4 }}>{note}</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Not on the option — on the selection. This fires when a version already HELD stops being
            offerable, which no click can produce and a stale form or an older assessment can. */}
        {versionUnavailable && values.version && (
          <div style={warn}>
            This assessment states {STANDARD_VERSION_COPY[values.version].l}, which is not yet
            available in ThemisIQ — no sub-topics are held under it, which is why its worksheet
            opens with nothing in it. Choose a version that is available; nothing else on this form
            can be saved until you do.
          </div>
        )}

        {versionLock.kind === 'agrees' && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                        padding: '12px 14px', marginTop: 10, fontSize: 12.5, color: INK,
                        lineHeight: 1.8 }}>
            {/* ⚠️ REFUSE, NOT WARN. materiality_impact_determinations carries its OWN
                standard_version (20260838:418), NOT NULL, with its own FK to mr_esrs_subtopics
                (code, standard_version). The determination rows survive a version change keyed to
                the old taxonomy and simply STOP APPEARING: scope comes from mr_esrs_subtopics for
                the NEW version, so every recorded judgement vanishes from the worksheet and every
                sub-topic reports as outstanding to materiality_lead_submit and materiality_finalise.
                A warning would ask the customer to weigh a consequence they cannot see until after
                it has happened. The survey link guard calls this same mismatch "a data error, not a
                presentation one" and refuses it; this is that error through a different door.

                ⚠️ "NOTHING TIES THEM AND IT RAISES NO ERROR" WAS TRUE WHEN THIS WAS WRITTEN AND IS
                NOT TRUE NOW. 20260851 §3 refuses the change with errcode PT412. This panel is no
                longer the only thing between a customer and silent data loss — it is what tells them
                BEFORE they try, so a server refusal is never the first they hear of it. Both are
                wanted: a refusal no screen predicted reads as a malfunction. */}
            <strong>The ESRS version cannot be changed now.</strong>{' '}
            This assessment holds {versionLock.determinations} recorded
            determination{versionLock.determinations === 1 ? '' : 's'}, each keyed to the version
            above. Sub-topic codes differ in name, count and structure between versions, so changing
            it would leave that work keyed to a taxonomy this assessment no longer uses — it would
            not error, it would silently disappear from the worksheet.

            {/* ⚠️ AND THERE IS NO RECOVERY, WHICH IS A GAP WORTH SOMEONE FINDING.
                A customer in this state cannot get out of it from the application:
                  * determinations CANNOT be deleted — 20260838:593 grants authenticated
                    `select, insert, update` and no DELETE;
                  * the assessment CANNOT be deleted either — 20260827:153-157 records that
                    authenticated holds SELECT, INSERT, UPDATE and NOT DELETE, while the policy
                    matassess_delete exists and is FOR DELETE TO authenticated: "A policy guarding
                    a privilege nobody holds; it can never fire."
                The only thing that IS recoverable is the survey round —
                materiality_assessment_survey_rounds grants `select, insert, delete`, so a round can
                be unlinked here and linked to a new assessment. Everything else is re-entered.
                The wrong assessment then stays in the list permanently, because nothing can remove
                it. THE FIX IS A DELETE GRANT (and a cascade decision), not more copy. Until that
                exists this paragraph is the honest answer and must not be softened into one that
                implies a route that does not exist. */}
            <div style={{ marginTop: 10 }}>
              <strong>What you can do.</strong> Create a new assessment stating the correct version,
              unlink the survey round from this one and link it to the new one, re-invite your
              contributors and record the determinations again. There is no way to move the existing
              determinations across, and <strong>this assessment cannot be deleted</strong> — it will
              stay in your list. If that is the situation you are in,{' '}
              {/* ⚠️ AN INSTRUCTION TO CONTACT US ON A SCREEN WITH NOTHING TO CONTACT IS NOT AN
                  INSTRUCTION. Same address as the board report's back cover
                  (boardReportPdf.ts:964) — one address, quoted, not a second one invented here. */}
              <a href={`mailto:${CONTACT}?subject=Removing%20a%20materiality%20assessment`}
                 style={LINK_STYLE}>email {CONTACT}</a>: removing an assessment needs a change on our
              side, not on yours.
            </div>
          </div>
        )}

        {versionLock.kind === 'repairable' && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                        padding: '12px 14px', marginTop: 10, fontSize: 12.5, color: INK,
                        lineHeight: 1.8 }}>
            {/* ⚠️ THIS IS THE ONLY EXIT FROM A DISAGREEMENT, AND IT EXISTS BECAUSE THE OBVIOUS RULE
                DID NOT LEAVE ONE. Locking whenever determinations exist — the rule this screen
                shipped with — made the state terminal: determinations cannot be deleted
                (20260838:593 grants no DELETE), the assessment cannot be deleted either
                (20260827:153-157), and the version could not be moved back. 20260851 §3 permits
                precisely this change and refuses every other one. */}
            <strong>The recorded work is under a different version.</strong>{' '}
            This assessment states {versionLabel(versionLock.stated)}, but its{' '}
            {versionLock.determinations} recorded
            determination{versionLock.determinations === 1 ? '' : 's'}{' '}
            {versionLock.determinations === 1 ? 'is' : 'are'} keyed to{' '}
            {versionLabel(versionLock.to)}. Sub-topic codes differ in name, count and structure
            between versions, so while the two disagree the worksheet cannot record anything further
            and the assessment cannot be finalised.

            <div style={{ marginTop: 10 }}>
              <strong>What you can do.</strong> Set the version to {versionLabel(versionLock.to)} —
              the one option offered above — which is what the recorded work already uses. Nothing is
              re-entered and nothing is lost. No other version is offered, because moving to a third
              one would leave that work orphaned exactly as it is now.
            </div>
          </div>
        )}

        {versionLock.kind === 'unrepairable' && (
          <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}33`, borderRadius: 10,
                        padding: '12px 14px', marginTop: 10, fontSize: 12.5, color: INK,
                        lineHeight: 1.8 }}>
            {/* ⚠️ SHOULD BE UNREACHABLE, AND SAYS SO RATHER THAN BEING OMITTED. After 20260851 both
                sides refuse it: §2 will not write a determination that disagrees, §3 will not move
                an assessment away from one, and §1 refuses to install over data that already does.
                What remains is hand-run SQL — and a state nobody can produce through the product is
                exactly the state whose existence someone needs to hear about.
                The empty-carried case lands here too, and belongs here: standard_version is NOT NULL
                on that table, so rows carrying none is a SUCCESSFUL read returning something
                impossible. A read that FAILED is `unknown` below, and says something else. */}
            <strong>This one needs looking at, and not from here.</strong>{' '}
            {versionLock.carried.length > 0
              ? <>Its recorded determinations do not all use the same version of the ESRS
                  standards — they carry {versionLock.carried.map(versionLabel).join(' and ')}. No
                  single version agrees with all of them.</>
              : <>The versions its recorded determinations use could not be established, so it is not
                  known whether they agree with this assessment.</>}
            {' '}The version is not editable here, and the worksheet will refuse to record anything
            further.

            <div style={{ marginTop: 10 }}>
              Nothing is lost — every determination is still stored.{' '}
              <a href={`mailto:${CONTACT}?subject=Materiality%20assessment%20version%20mismatch`}
                 style={LINK_STYLE}>Email {CONTACT}</a>{' '}
              and include the address of this page, which identifies the assessment. Putting it right
              needs a change on our side, not on yours.
            </div>
          </div>
        )}

        {versionLock.kind === 'unknown' && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                        padding: '12px 14px', marginTop: 10, fontSize: 12.5, color: INK,
                        lineHeight: 1.8 }}>
            {/* ⚠️ LOCKED LIKE unrepairable, BUT IT ASSERTS NOTHING AND ASKS FOR NOTHING. The read
                failed, so what is stored is unknown — unlocking here would unlock the control on
                the assessment we know least about. What must NOT be borrowed from unrepairable is
                its sentence: telling someone whose request merely dropped that their data needs
                looking at on our side sends them to write an email about a transient error, and
                leaves them believing something is wrong with work that is fine. */}
            <strong>This page could not read the recorded determinations.</strong>{' '}
            Until it can, the ESRS version is not editable — changing it without knowing what work
            already exists is what this screen is here to prevent. Nothing is wrong as far as anyone
            can tell; the request did not complete. Reload the page. The other fields save normally.
          </div>
        )}

        {/* Shown for `repairable` too: the repair IS a version change, and it lands version N's
            frozen requirements beside an assessment now claiming a different standard. */}
        {finalisedVersion !== null
          && (versionLock.kind === 'free' || versionLock.kind === 'repairable') && (
          <div style={{ background: AMBER_BG, border: `0.5px solid ${AMBER}`, borderRadius: 10,
                        padding: '12px 14px', marginTop: 10, fontSize: 12.5, color: INK,
                        lineHeight: 1.8 }}>
            {/* Does NOT lock. A finalisation alone permits a version change provided the
                determinations do not forbid it, because re-finalising genuinely resolves it:
                version N+1 copies the new version's requirements and version N is kept (20260848 —
                superseding is finalising again, never editing). */}
            <strong>This assessment was finalised.</strong>{' '}
            Version {finalisedVersion} froze the disclosure requirements for the version recorded at
            the time. Change the version and that frozen copy describes a different standard than the
            assessment now claims. Finalise again afterwards — the earlier version is kept alongside.
          </div>
        )}
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={label}>Reporting period</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: MUTE, marginBottom: 4 }}>First day of the financial year</div>
            <input style={input} type="date" value={values.periodStart}
                   onChange={e => set({ periodStart: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: MUTE, marginBottom: 4 }}>Last day</div>
            <input style={input} type="date" value={values.periodEnd}
                   onChange={e => set({ periodEnd: e.target.value })} />
          </div>
        </div>
        {/* ⚠️ REQUIRED HERE THOUGH THE COLUMNS ARE NULLABLE. The board report cover prints
            "Not stated" without them and the ESRS 2 IRO-1 prose has no period to describe — both
            honest, and both a worse document than one where the question was simply asked. */}
        <div style={hint}>
          Enter the period as it actually runs. If your financial year is not the calendar year —
          1 April 2026 to 31 March 2027, say — enter those dates. Which ESRS version applies depends
          on the day it begins.
        </div>
        {halfFilled && (
          <div style={warn}>Enter both dates, or clear the one you have entered. A period with only
            one end is not recorded.</div>
        )}
        {outOfOrder && <div style={warn}>The last day must fall after the first day.</div>}

        {finalisedVersion !== null && (
          <div style={{ ...warn, color: MID }}>
            {/* ⚠️ THE SPECIFIC CONSEQUENCE, NOT THE GENERAL ONE. lib/pdf/layout.ts coverPage prints
                these rows in one table: Reporting period, ESRS version, Stakeholder survey, Survey
                closed, Finalised. So the period and the finalisation stamp sit four rows apart on
                the SAME cover. Edit the period after finalising and the customer hands over a paper
                whose cover pairs a period they have just changed with a finalisation date from
                before they changed it — the two read as one statement and are not one. Finalising
                again is what re-pairs them. */}
            The report cover prints the reporting period and the finalisation date in the same table.
            Change the period now and version {finalisedVersion}&apos;s date will sit beside a period
            it was not taken against — finalise again afterwards so the cover states one thing.
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}33`, borderRadius: 8,
                      padding: '10px 13px', marginBottom: 16, fontSize: 12, color: INK,
                      lineHeight: 1.75 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onSubmit} disabled={saving || blocked}
                style={{ fontSize: 13, fontWeight: 600, padding: '9px 22px', borderRadius: 8,
                         background: INK, color: '#fff', border: 'none',
                         cursor: (saving || blocked) ? 'not-allowed' : 'pointer',
                         opacity: (saving || blocked) ? 0.5 : 1 }}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} style={{ fontSize: 13, padding: '9px 18px', borderRadius: 8,
                                              background: '#fff', border: `1px solid ${LINE}`,
                                              color: MID, cursor: 'pointer' }}>Cancel</button>
        )}
        {/* Names everything outstanding, not the first — same reasoning as
            lib/climate/wizardSteps.ts: a customer told one thing at a time goes round the loop once
            per field. */}
        {missing.length > 0 && (
          <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.6 }}>
            Still needed: {missing.length === 1 ? missing[0]
              : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`}.
          </div>
        )}
      </div>
    </>
  )
}
