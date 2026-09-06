'use client'

/**
 * Stakeholder screening survey — the respondent page.
 *
 * Token-scoped, unauthenticated, anon client. Every read and write goes through the three
 * SECURITY DEFINER RPCs in supabase/migrations/20260820_materiality_survey_rpcs.sql; this page
 * touches no table directly and could not if it tried (anon holds no grant on any of the four).
 *
 * Design authority: docs/materiality-questionnaire-spec-v8.md — §5.1 (the four options, verbatim
 * below), §6.1 (abstention), §3.0.1 (routing, and the five counters this page must not corrupt).
 *
 * MODELLED ON app/supplier/[token]/page.tsx, WITH ITS ONE DEFECT FIXED. That page destructures no
 * error from any of its three rpc calls: a failed save shows a green tick and a failed submit shows
 * the thank-you screen. Here every call checks `error`, a save that did not save is never shown as
 * saved, and submit is blocked while anything is unsaved — because submit resolves only what
 * actually reached the database.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠️ THREE GAPS BETWEEN WHAT THIS SHIPS AND WHAT §5.1 DESCRIBES. None blocks the page; all three
 * are real, and the first is the big one.
 *
 * 1. EVERY QUESTION HAS NULL CONTEXT, AND WILL UNTIL THE QUESTION EDITOR EXISTS.
 *    §5.1 specifies a customer-editable context block of 2–4 sentences per topic — what the topic
 *    is, why it matters to THIS company, what the company does today. It is the Bay State pattern
 *    and it is the reason a Finance manager can answer a question about biodiversity at all; §1
 *    exists because you cannot ask one to rate irremediability cold.
 *    The generator in 20260819 populates short_name, question_framing, wording and sort_order. It
 *    never populates `context`, and nothing else writes it. So today this page renders 31 bare
 *    one-line questions with no context anywhere, and the code below renders nothing rather than an
 *    empty box — which is the most it can do about it.
 *    THIS IS THE SINGLE BIGGEST GAP BETWEEN WHAT SHIPS AND WHAT THE BAY STATE SURVEY ACTUALLY DID.
 *    The instrument works; it is thinner than the design. The fix is the customer-side question
 *    editor, which is therefore on the critical path for this survey being GOOD rather than merely
 *    functional — not a later nicety.
 *
 * 2. company_name IS NULLABLE, AND THE COPY LEANS ON IT HARD. §5.1's stem — "What strategic
 *    priority should [Company] assign to this topic?" — is asked 31 times, and the intro variants
 *    name the company in almost every sentence. The fallbacks are per variant and one of them is
 *    invented; see the note above `companyInline` for the detail, including the heading case the
 *    copy doc does not cover. THE ROUND-CREATION SCREEN SHOULD REQUIRE company_name. The column is
 *    deliberately nullable at the database (20260819) and that is fine; the requirement belongs in
 *    the UI that creates a round, and every fallback here is a worse sentence than the real name.
 *    Same for respondent.display_name (invite_name is nullable) — handled, same way, less serious.
 *
 * 3. ✎ CLOSED 16 Aug 2026 — FREE TEXT IS NOW CAPTURED. §5.1's optional per-question comment and the
 *    closing "Is there anything affecting people, the environment or the business that we have not
 *    asked about?" both ship, via survey_save_free_text and survey_save_closing_comment (20260830).
 *    NOT as a fifth parameter on survey_save_response: a defaulted p_free_text would have nulled a
 *    saved note on every autosave that omitted it — a respondent types a comment, clicks a different
 *    radio, and the comment is gone with no error.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠️ AND THE THING THAT ARRIVED WITH IT. The intro paragraph promising answers are "combined with
 * everyone else's" is TRUE OF A SCORE AND FALSE OF A COMMENT. COMMENT_CARVE_OUT is rendered directly
 * beneath it for every variant, and COMMENT_BOX_NOTE sits under every box. If comment boxes are ever
 * shown without those two, the page is making a promise the feature breaks — take the boxes off
 * rather than the copy.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

const GRAD = 'var(--color-brand)'
const GREEN = '#0F6E56'
const GREEN_BG = '#E1F5EE'
// Failure state. Not in the brand constants — a save that did not save has to be legible as a
// failure, and none of the five neutrals can carry that on its own.
const FAIL = '#b42318'
const FAIL_BG = '#fef3f2'

/**
 * §5.1, verbatim. The three scale points are the maturity framing, which beats a bare Low/Med/High
 * because it asks about the GAP rather than the topic's importance in the abstract.
 *
 * ⚠️ THE FOURTH OPTION IS NOT A FALLBACK AND IS NOT STYLED AS ONE. §6.1: "Not enough visibility to
 * assess" is null, never zero and never a low; it is a RECORDED answer, and a sub-topic most
 * respondents abstained on is a finding in its own right — usually that the company has no
 * visibility of its own impact, which is material information.
 * It therefore renders with the same size, padding, border, badge and selected state as the other
 * three, in the same list, 31 times. Greying it, shrinking it, or moving it below a rule would make
 * it read as "give up here", and the answers this survey most needs are the honest ones.
 */
const SCALE = [
  { key: 1 as const, badge: '1', label: 'Existing programs are sufficient; continuous improvement is appropriate' },
  { key: 2 as const, badge: '2', label: 'Existing programs are sufficient, but improvements would strengthen performance or reduce risk' },
  { key: 3 as const, badge: '3', label: 'Existing programs need significant strategic focus to close gaps, reduce risk or capture opportunity' },
  { key: 'abstain' as const, badge: '—', label: 'Not enough visibility to assess' },
]

/**
 * INTRO COPY — docs/survey-intro-copy.md, transcribed. Three variants, selected by the
 * `intro_variant` the server resolves (20260823_survey_get_intro_variant.sql).
 *
 * ⚠️ THE VARIANT IS NOT DERIVED HERE, AND COULD NOT BE. stakeholder_category is deliberately
 * withheld from the payload — it is the S1/S2 routing key — so the page is TOLD which of three
 * paragraphs to print and is told nothing about why. Three values over eleven categories: `supplier`,
 * `value_chain_worker` and `workers_rep_value_chain` all arrive as 'value_chain' and are
 * indistinguishable from each other here.
 *
 * ⚠️ THE SHARED BLOCKS ARE A SEPARATE ARRAY, RENDERED ONCE, OUTSIDE THE VARIANT SWITCH.
 * That is structural, not stylistic. §6.1's abstention rule has to read identically to every
 * respondent, or n_abstained means different things for different populations and the counters stop
 * being comparable — which is the finding §6.1 exists to protect. Three copies that happen to agree
 * today would drift the first time someone edits one; one array cannot. A variant has no way to
 * reach these strings.
 *
 * Substitution: {Company} is capitalised (sentence-initial), {company} is inserted verbatim,
 * {n} is the question count and comes from the payload — see the note where it is used.
 *
 * ⚠️ TWO VOCABULARY RULES, IF YOU EDIT THESE STRINGS. Both are decisions, not oversights, and the
 * reasoning is in docs/survey-intro-copy.md:
 *   • NO "ESG" and no "environmental, social and governance". Jargon that means nothing to a
 *     warehouse worker. The openings name actual topics instead — energy, waste, working
 *     conditions, health and safety, communities — which is more concrete and lets a respondent
 *     tell whether they have anything to contribute.
 *   • NO "journey". The audiences most likely to notice — a regulator, a workers' representative,
 *     an NGO — read it as a company saying nothing carefully, and it softens what is in fact a
 *     formal assessment with a legal disclosure at the end.
 */
type IntroVariant = 'internal' | 'value_chain' | 'external'
type IntroBlock = { lead?: string; body: string }

/**
 * ⚠️ THE COMMENT CARVE-OUT. ONE STRING, RENDERED FOR EVERY VARIANT, between the variant paragraphs
 * and the practical tips.
 *
 * It is a separate constant for the same structural reason SHARED_BLOCKS is: a promise about what
 * happens to a respondent's words must read identically to everyone. Three copies that agree today
 * would drift the first time one is edited, and the drift would mean the product promised different
 * things to different populations about the same feature.
 *
 * It exists because the paragraph immediately above it says answers are "combined with everyone
 * else's" and "not shown individually" — TRUE of a score, FALSE of a verbatim comment. Shipping a
 * comment box under that sentence without this one makes the page's own promise false.
 */
const COMMENT_CARVE_OUT: IntroBlock = {
  lead: 'Comment boxes are different.',
  body: 'Anything you type in your own words is passed on as you wrote it. Scores are combined; comments are not. Don’t include anything you wouldn’t want read as yours — and if a comment would identify you by what it describes, consider whether the score alone says enough.',
}

/** Small print beside every comment box, for the same reason, at the moment of typing. */
const COMMENT_BOX_NOTE = 'Passed on as written, not combined.'

const INTRO_VARIANTS: Record<IntroVariant, { paragraphs: IntroBlock[]; tips: IntroBlock[] }> = {
  internal: {
    paragraphs: [
    { body: '{Company} is conducting a sustainability materiality assessment — working out which topics matter most to the business and to the people its work affects. That covers a wide range: from energy and waste to working conditions, health and safety, and how the company treats the communities around it. Some of it can be established from data. The rest depends on what people inside the organisation see day to day, which is why you have been asked.' },
      { body: 'Your answers are not shown individually. They are combined with everyone else’s, so what {company} sees is where the people who know it collectively think the priorities are.' },
    ],
    tips: [
      { lead: 'Answer from where you sit.', body: 'There is nothing to look up. You are not expected to have a view on every topic — a warehouse manager and someone in finance will see different parts of this company, and that difference is useful information rather than a problem.' },
    ],
  },
  value_chain: {
    paragraphs: [
    // The first paragraph is why this variant exists: a supplier contact has no relationship with the
    // company asking and may not know why they are being asked.
    // ⚠️ IT ADDRESSES AN ORGANISATION, NOT A WORKER. The respondent is a named representative
    // answering institutionally about their own organisation's workforce — see
    // 20260828_mr_esrs_subtopic_display_s2_framing_fix.sql. The earlier version ended "asking the
    // people doing the work rather than assuming", which describes an instrument this is not: it
    // promised a worker survey to someone who is not being asked as a worker.
    { body: '{Company} is conducting a sustainability materiality assessment across its own business and the companies it buys from. It is a customer of the organisation you work for. The assessment covers working conditions, health and safety, environmental impact and how suppliers are treated — and part of doing it properly means asking its suppliers directly rather than assuming.' },
    // ⚠️ THE CLAIM IN THIS PARAGRAPH IS TRUE OF THE SCHEMA AND MUST STAY THAT WAY. Responses belong
    // to the round; the supplier organisation has no access to them. It is not, and does not claim
    // to be, a promise about what the customer's own staff do with results informally — no software
    // prevents that. If materiality_survey_responses ever gains a policy or a grant that widens who
    // can read an individual answer, this sentence has to change in the same commit.
      { body: 'Your answers go to {company}, not to your employer, and are combined with everyone else’s before anyone sees them. No individual answer is shown on its own.' },
      // Variant B only, and it sits HERE rather than after the carve-out so that "That applies to
      // comments too" keeps the paragraph above as its antecedent. The reassurance is narrower than
      // the one it qualifies — the routing is unchanged for comments, only the aggregation is.
      { body: 'That applies to comments too. {Company} sees them; your employer does not.' },
    ],
    tips: [
    // ⚠️ REMOVED 16 Aug 2026: "Answer about your own workplace. Where a question asks about working
    // conditions, health and safety or similar, it means the conditions you and your colleagues work
    // in — not {company}'s own offices." It addressed an individual worker describing their own
    // conditions, which is not who answers S2. The question_framing badge now carries the same
    // instruction institutionally ("in your organisation's workforce"), on every question rather
    // than once at the top, so nothing is lost by dropping it.
      { lead: 'There is no right answer, and nothing here is a test of your employer.', body: 'Saying a topic needs attention is what this survey is for.' },
    ],
  },
  external: {
    paragraphs: [
      { body: '{Company} is conducting a sustainability materiality assessment — working out which topics matter most to the business and to the people and places its work affects. That covers environmental impact, working conditions in its own operations and its suppliers’, and its effect on surrounding communities. It is seeking views from a range of people outside the organisation, including those who see it from where you do.' },
      { body: 'Your answers are not shown individually. They are combined with everyone else’s, so what {company} sees is where the people it asked collectively think the priorities are.' },
    ],
    tips: [
      { lead: 'Answer from your own vantage point.', body: 'You are being asked precisely because you see this company from outside it. There is nothing to look up, and no expectation that you have a view on everything.' },
    ],
  },
}

/**
 * ⚠️ IDENTICAL FOR EVERY RESPONDENT. Do not move any of these into INTRO_VARIANTS, and do not add a
 * variant-specific sentence about abstaining, skipping or saving. See the note above.
 */
const SHARED_BLOCKS: IntroBlock[] = [
  { lead: 'One question per topic, {n} in all.', body: 'Around fifteen minutes.' },
  { lead: '“Not enough visibility to assess” is a real answer, not a blank.', body: 'Nobody sees every part of an organisation. Choosing it records that the visibility is not there — and a topic many people cannot assess tells {company} something worth knowing.' },
  { lead: 'Leaving a question unanswered is different again, and also fine.', body: 'You can submit with questions unanswered.' },
  { lead: 'Your answers save as you go.', body: 'Close the page and come back to the same link whenever you like.' },
]

const fill = (s: string, company: string, n: number) =>
  s.replace(/\{Company\}/g, company.charAt(0).toUpperCase() + company.slice(1))
   .replace(/\{company\}/g, company)
   .replace(/\{n\}/g, String(n))

type Choice = 1 | 2 | 3 | 'abstain'
type SaveState = 'saving' | 'saved' | 'error'

type Question = {
  question_id: string
  short_name: string
  question_framing: string | null
  wording: string
  context: string | null
  topic_label: string | null
}

type Group = { label: string; questions: Question[]; entitySpecific: boolean }

export default function StakeholderSurvey() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  // Two distinct failure kinds, never merged — see loadSurvey.
  const [deadLink, setDeadLink] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  /**
   * ⚠️ A CLOSED ROUND IS NOT AN ERROR, AND MUST NOT BORROW THE ERROR FRAME.
   * survey_get raises PT410 when the round's status is 'closed' (20260836) — the link was valid, the
   * survey ended on schedule, and for a half-finished respondent their answers are already in the
   * results. Rendered through `loadError` it read "This survey could not be opened… this is what the
   * server reported… please send this message to the company — it tells them exactly what went
   * wrong." Nothing went wrong, and that footer invited a support message about a non-problem.
   */
  const [closedMessage, setClosedMessage] = useState<string | null>(null)

  const [round, setRound] = useState<{ name: string; company_name: string | null; deadline: string | null } | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [introVariant, setIntroVariant] = useState<IntroVariant | null>(null)

  // `answers` is what the radio shows (optimistic, updates on click).
  // `saved` is what the DATABASE holds (updates only on a confirmed write).
  // They are separate on purpose: progress, the tick and the submit gate all read `saved`, so a
  // failed write can never present as a saved one.
  const [answers, setAnswers] = useState<Record<string, Choice>>({})
  const [saved, setSaved] = useState<Record<string, Choice>>({})
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({})
  const [saveError, setSaveError] = useState<Record<string, string>>({})

  // Free text, kept in the same optimistic/persisted pair as the scores and for the same reason:
  // `comments` is what the textarea shows, `commentSaved` is what the database confirmed, and only
  // the second drives the tick and the submit gate.
  const [comments, setComments] = useState<Record<string, string>>({})
  const [commentSaved, setCommentSaved] = useState<Record<string, string>>({})
  const [commentState, setCommentState] = useState<Record<string, SaveState>>({})
  const [commentError, setCommentError] = useState<Record<string, string>>({})

  const [closing, setClosing] = useState('')
  const [closingSaved, setClosingSaved] = useState('')
  const [closingState, setClosingState] = useState<SaveState | undefined>(undefined)
  const [closingError, setClosingError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Per-question write counter. Two fast clicks on one question race, and without this the older
  // response could land last and leave `saved` describing a choice the respondent has moved off.
  const seqRef = useRef<Record<string, number>>({})

  useEffect(() => { loadSurvey() }, [token])

  const loadSurvey = async () => {
    setLoading(true)
    setDeadLink(false)
    setLoadError(null)
    setClosedMessage(null)

    const { data, error } = await supabase.rpc('survey_get', { p_token: token })

    if (error) {
      /**
       * ⚠️ THREE ERROR CASES, AND THEY MUST NOT BE COLLAPSED INTO ONE SCREEN.
       *
       * survey_get raises 'invalid token' with errcode no_data_found (SQLSTATE P0002) for an
       * unknown, revoked, expired or already-submitted token — deliberately indistinguishable, so a
       * caller cannot probe a token. It ALSO raises two P0001s with descriptive messages: the
       * routing-failure guard, and the empty-form refusal.
       *
       * Showing the dead-link screen for all three would tell a respondent their link had expired
       * when the real cause was a routing defect — an error message naming a cause it cannot
       * verify, which is the thing this codebase has paid for repeatedly (see CLAUDE.md's four
       * instances). So P0002 gets the human dead-link screen, and anything else surfaces the actual
       * message it was given.
       */
      // PT410 — the round closed. Its own screen: the server's sentence is the whole message, and
      // it already differs by whether this person has answers, so nothing is added around it.
      if (error.code === 'PT410') setClosedMessage(error.message || 'This survey has closed.')
      else if (error.code === 'P0002' || error.message === 'invalid token') setDeadLink(true)
      else setLoadError(error.message || 'The survey did not load, and returned no reason.')
      setLoading(false)
      return
    }

    if (!data) {
      // survey_get cannot return null — it raises instead. If this ever fires, say what was observed
      // rather than guessing why; a blank screen would be the same defect one layer up.
      setLoadError('The survey returned no data and no error. Nothing was loaded.')
      setLoading(false)
      return
    }

    const qs: Question[] = data.questions || []
    setRound(data.round || null)
    setDisplayName(data.respondent?.display_name ?? null)
    setQuestions(qs)

    /**
     * ⚠️ NEVER DEFAULT TO A VARIANT. survey_get raises rather than returning a null intro_variant
     * (20260823), so the only way this is missing is a deploy-ordering error — this page running
     * against a survey_get older than that migration. Guessing 'internal' would tell a supplier
     * their answers are anonymous within their own organisation, which is not what variant B
     * promises them and not what the schema does. Printing no opening paragraph is a smaller wrong
     * than printing the wrong one, and the warning is where a developer will find it.
     */
    const variant = data.intro_variant
    if (variant === 'internal' || variant === 'value_chain' || variant === 'external') {
      setIntroVariant(variant)
    } else {
      setIntroVariant(null)
      console.warn(
        `survey_get returned no usable intro_variant (${JSON.stringify(variant)}). The opening ` +
        `copy is omitted rather than guessed. The only cause is this page running against a ` +
        `survey_get older than 20260823_survey_get_intro_variant.sql.`
      )
    }

    /**
     * ⚠️ SEED `saved` FROM THE RESPONSES, BUT ONLY FOR QUESTIONS STILL BEING SHOWN.
     * survey_get returns every response row this respondent has, including one for a question the
     * customer has since deselected — that row comes back with no question to attach it to. Keying
     * the count off the response array would then show "32 of 31". The denominator and the
     * numerator both come from `questions`.
     */
    const shown = new Set(qs.map(q => q.question_id))
    const initial: Record<string, Choice> = {}
    const initialComments: Record<string, string> = {}
    for (const r of (data.responses || []) as {
      question_id: string; value: number | null; abstained: boolean; free_text: string | null
    }[]) {
      if (!shown.has(r.question_id)) continue
      initial[r.question_id] = r.abstained ? 'abstain' : (r.value as 1 | 2 | 3)
      // Save-and-return for comments, scoped to currently-shown questions for the same reason the
      // answers are: a response for a since-deselected question has no box to go in.
      if (r.free_text) initialComments[r.question_id] = r.free_text
    }
    setAnswers(initial)
    setSaved(initial)
    setComments(initialComments)
    setCommentSaved(initialComments)

    const existingClosing = (data.closing_comment as string | null) ?? ''
    setClosing(existingClosing)
    setClosingSaved(existingClosing)

    setLoading(false)
  }

  const choose = async (questionId: string, choice: Choice) => {
    setAnswers(prev => ({ ...prev, [questionId]: choice }))
    setSaveState(prev => ({ ...prev, [questionId]: 'saving' }))
    setSaveError(prev => { const next = { ...prev }; delete next[questionId]; return next })

    const seq = (seqRef.current[questionId] ?? 0) + 1
    seqRef.current[questionId] = seq

    // XOR, as the table's CHECK constraint requires and as §6.1 means: a value OR an abstention,
    // never both and never neither.
    const { error } = await supabase.rpc('survey_save_response', {
      p_token: token,
      p_question_id: questionId,
      p_value: choice === 'abstain' ? null : choice,
      p_abstained: choice === 'abstain',
    })

    if (seqRef.current[questionId] !== seq) return  // superseded by a later click; that one wins

    if (error) {
      setSaveState(prev => ({ ...prev, [questionId]: 'error' }))
      setSaveError(prev => ({
        ...prev,
        [questionId]: error.message || 'The answer did not save, and no reason was given.',
      }))
      return   // `saved` is NOT updated. The tick does not appear and the count does not move.
    }

    setSaved(prev => ({ ...prev, [questionId]: choice }))
    setSaveState(prev => ({ ...prev, [questionId]: 'saved' }))
  }

  /**
   * Saved on blur rather than on every keystroke. Debouncing a textarea would mean a save in flight
   * whenever someone pauses mid-sentence, and the submit gate blocks on saves in flight — which would
   * make Submit flicker between enabled and disabled while a respondent is typing. Blur is a moment
   * they chose, and the not-saved state is legible at exactly that moment.
   *
   * ⚠️ The server REFUSES a comment on an unanswered question (the XOR — see 20260830), so the box is
   * disabled until an option is chosen. This function is not the guard; it must never be reachable
   * with no answer, and if it ever is, the refusal message is what the respondent sees after typing.
   */
  const saveComment = async (questionId: string) => {
    const text = comments[questionId] ?? ''
    if (text === (commentSaved[questionId] ?? '')) return   // nothing changed; don't burn a call

    setCommentState(prev => ({ ...prev, [questionId]: 'saving' }))
    setCommentError(prev => { const next = { ...prev }; delete next[questionId]; return next })

    const seqKey = `c:${questionId}`
    const seq = (seqRef.current[seqKey] ?? 0) + 1
    seqRef.current[seqKey] = seq

    const { error } = await supabase.rpc('survey_save_free_text', {
      p_token: token,
      p_question_id: questionId,
      p_free_text: text,
    })

    if (seqRef.current[seqKey] !== seq) return

    if (error) {
      setCommentState(prev => ({ ...prev, [questionId]: 'error' }))
      setCommentError(prev => ({
        ...prev,
        [questionId]: error.message || 'The comment did not save, and no reason was given.',
      }))
      return   // commentSaved is NOT updated: an unsaved comment never shows as saved.
    }
    setCommentSaved(prev => ({ ...prev, [questionId]: text }))
    setCommentState(prev => ({ ...prev, [questionId]: 'saved' }))
  }

  const saveClosing = async () => {
    if (closing === closingSaved) return

    setClosingState('saving')
    setClosingError(null)

    const seq = (seqRef.current['closing'] ?? 0) + 1
    seqRef.current['closing'] = seq

    const { error } = await supabase.rpc('survey_save_closing_comment', {
      p_token: token,
      p_comment: closing,
    })

    if (seqRef.current['closing'] !== seq) return

    if (error) {
      setClosingState('error')
      setClosingError(error.message || 'The comment did not save, and no reason was given.')
      return
    }
    setClosingSaved(closing)
    setClosingState('saved')
  }

  const submit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    const { error } = await supabase.rpc('survey_submit', { p_token: token })
    setSubmitting(false)
    if (error) {
      setSubmitError(error.message || 'The survey did not submit, and no reason was given.')
      return   // stay on the form. The portal's bug is showing the thank-you page here.
    }
    setSubmitted(true)
  }

  /**
   * ⚠️ THE NULL-company_name FALLBACK IS PER VARIANT, BECAUSE ONE STRING CANNOT SERVE ALL THREE.
   * "your organisation" reads correctly in A and C. In B it produces "your organisation is a
   * customer of the organisation you work for", which is nonsense to the one respondent who most
   * needs that sentence to land — so B falls back to "the company that has asked for your view".
   *
   * ⚠️ AND B'S FALLBACK BREAKS THE HEADING, WHICH THE COPY DOC DOES NOT COVER: "The company that
   * has asked for your view would like your view" is circular. So when there is no company name AND
   * the variant is B, the heading drops the subject entirely — "We would like your view". That is
   * the one word of copy on this page not taken from docs/survey-intro-copy.md, and it is flagged
   * rather than quietly introduced.
   *
   * All of this is a fallback and none of it is a fix. THE ROUND-CREATION SCREEN SHOULD REQUIRE
   * company_name: the column is nullable at the database on purpose, and the requirement belongs in
   * the UI that creates a round. A survey that asks about an unnamed company is a worse artefact
   * than one that will not send.
   */
  const companyName = round?.company_name?.trim() || null
  const companyInline = companyName
    || (introVariant === 'value_chain' ? 'the company that has asked for your view' : 'your organisation')
  const headingSubject = companyName || (introVariant === 'value_chain' ? null : 'your organisation')
  const introHeading = headingSubject
    ? `${headingSubject.charAt(0).toUpperCase()}${headingSubject.slice(1)} would like your view`
    : 'We would like your view'

  /**
   * Grouping, by CONSECUTIVE RUNS of topic_label rather than by a dictionary keyed on it.
   *
   * survey_get returns the questions ordered by (topic.sort_order, subtopic.sort_order), so a run
   * of one label IS one topic. Bucketing by label instead would merge two non-adjacent runs that
   * happened to share a string — which is not hypothetical here: S1 and S2 carry Appendix A's
   * byte-identical joint title, and that identity is exactly why the label is safe to send at all
   * (see 20260822_survey_get_topic_label.sql). A respondent only ever sees one side, so it cannot
   * bite today; consecutive runs mean it cannot bite tomorrow either.
   *
   * A null label is an entity-specific matter (§3.2, subtopic_code null server-side). Those collect
   * into ONE named group at the end, rendered only when non-empty — a null must never become a
   * blank heading, and it must not drift silently into whichever topic happened to precede it.
   * Nothing generates such a row yet; this path is built before the question editor, on purpose.
   */
  const groups = useMemo<Group[]>(() => {
    const out: Group[] = []
    const entitySpecific: Question[] = []
    for (const q of questions) {
      if (!q.topic_label) { entitySpecific.push(q); continue }
      const last = out[out.length - 1]
      if (last && !last.entitySpecific && last.label === q.topic_label) last.questions.push(q)
      else out.push({ label: q.topic_label, questions: [q], entitySpecific: false })
    }
    if (entitySpecific.length > 0) {
      out.push({ label: `Additional topics for ${companyInline}`, questions: entitySpecific, entitySpecific: true })
    }
    return out
  }, [questions, companyInline])

  // Global 1..n numbering, in the order the questions are rendered.
  const numberOf = useMemo(() => {
    const map: Record<string, number> = {}
    let n = 0
    for (const g of groups) for (const q of g.questions) map[q.question_id] = ++n
    return map
  }, [groups])

  const total = questions.length
  const savedCount = questions.filter(q => saved[q.question_id] !== undefined).length
  const pct = total > 0 ? Math.round((savedCount / total) * 100) : 0

  // Anything in flight or failed. Submit is blocked on this: survey_submit resolves what is IN THE
  // DATABASE, so submitting over an unsaved answer would silently drop it from the determination.
  // ⚠️ COMMENTS COUNT TOO, and the closing one most of all: it is the module's only emerging-topic
  // catch, so submitting over an unsaved one loses the single thing no other field can carry.
  const unsaved = questions.filter(q =>
    saveState[q.question_id] === 'saving' || saveState[q.question_id] === 'error' ||
    commentState[q.question_id] === 'saving' || commentState[q.question_id] === 'error')
  const failed = questions.filter(q =>
    saveState[q.question_id] === 'error' || commentState[q.question_id] === 'error')
  const closingUnsaved = closingState === 'saving' || closingState === 'error'
                         || closing !== closingSaved
  const blockSubmit = unsaved.length > 0 || closingUnsaved
  const unanswered = questions.filter(q => saved[q.question_id] === undefined)

  // ── Screens ──────────────────────────────────────────────────────────────────

  const shell = (children: React.ReactNode) => (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2.5rem', maxWidth: 520, width: '100%' }}>
        {children}
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#888784', fontSize: 14 }}>Loading your survey…</div>
    </div>
  )

  /**
   * ⚠️ THE DEAD-LINK SCREEN NAMES THE POSSIBILITIES AND PICKS NONE OF THEM.
   * survey_get gives one message for expired, revoked, unknown and already-submitted, deliberately,
   * so a token cannot be probed. This page genuinely does not know which applies, so it says so by
   * listing them as possibilities rather than asserting one. Writing "this link has expired" would
   * be inventing a diagnosis out of an ambiguity — the same move as the portal's "your browser
   * blocked the pop-up", which named a cause that had never once occurred.
   */
  /**
   * ⚠️ THE FRAME CARRIES NOTHING THAT CONTRADICTS THE SENTENCE. No "could not be opened", no "what
   * went wrong", no instruction to contact anyone. A muted marker, the server's own words, and the
   * footer — because the message is already complete and already true for this particular reader.
   */
  if (closedMessage) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f8f7f5', color: '#888784', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: 24 }}>✓</div>
      <div style={{ fontSize: 15, color: '#0d0d0d', lineHeight: 1.75 }}>{closedMessage}</div>
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '0.5px solid #e8e7e4', fontSize: 12, color: '#888784' }}>
        Powered by <a href="https://www.themisiq.co" style={{ color: '#7425e3', textDecoration: 'none' }}>ThemisIQ</a>
      </div>
    </div>
  )

  if (deadLink) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 10 }}>This survey link is no longer active</div>
      <div style={{ fontSize: 14, color: '#555553', lineHeight: 1.7 }}>
        It may have expired, it may have been withdrawn, or the survey may already have been
        submitted from this link. This page is not told which.
      </div>
      <div style={{ fontSize: 13, color: '#888784', lineHeight: 1.7, marginTop: 14 }}>
        Please contact the company that sent you the link.
      </div>
    </div>
  )

  // Anything that is NOT the token gate. The actual message is shown rather than paraphrased.
  if (loadError) return shell(
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 10 }}>This survey could not be opened</div>
      <div style={{ fontSize: 14, color: '#555553', lineHeight: 1.7, marginBottom: 14 }}>
        The link itself is valid. Something else stopped the survey loading, and this is what the
        server reported:
      </div>
      <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#0d0d0d', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {loadError}
      </div>
      <div style={{ fontSize: 13, color: '#888784', lineHeight: 1.7, marginTop: 14 }}>
        Please send this message to the company that sent you the link — it tells them exactly what
        went wrong.
      </div>
    </div>
  )

  if (submitted) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: GREEN_BG, color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: 28 }}>✓</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: '#0d0d0d', marginBottom: 10 }}>Thank you</div>
      <div style={{ fontSize: 14, color: '#555553', lineHeight: 1.7 }}>
        Your responses for <strong>{round?.name}</strong> have been submitted to {companyInline}.
      </div>
      <div style={{ fontSize: 13, color: '#888784', lineHeight: 1.7, marginTop: 12 }}>
        {savedCount} of {total} questions answered. This link is now closed and cannot be reopened.
      </div>
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '0.5px solid #e8e7e4', fontSize: 12, color: '#888784' }}>
        Powered by <a href="https://www.themisiq.co" style={{ color: '#7425e3', textDecoration: 'none' }}>ThemisIQ</a>
      </div>
    </div>
  )

  // ── The survey ───────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>

      {/* Sticky header: progress, and jump navigation. NOT pagination — every question stays on the
          page, so the length is honest and the four options render identically throughout. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0d0d0d' }}>
        <div style={{ padding: '1rem 2rem 0.75rem' }}>
          <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>Stakeholder survey</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{round?.name}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#64fe3e' }}>{savedCount} / {total}</div>
              {/* Say what the number counts. Answered-or-abstained, out of shown, and saved. */}
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>answered or marked “not enough visibility”</div>
            </div>
          </div>
          <div style={{ maxWidth: 780, margin: '10px auto 0' }}>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: GRAD, borderRadius: 99, transition: 'width 0.3s' }} />
            </div>
          </div>
        </div>

        <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', padding: '0.6rem 2rem', overflowX: 'auto' }}>
          <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', gap: 6 }}>
            {groups.map((g, i) => {
              const done = g.questions.filter(q => saved[q.question_id] !== undefined).length
              return (
                <button
                  key={`${g.label}-${i}`}
                  onClick={() => document.getElementById(`survey-group-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.15)', background: done === g.questions.length ? 'rgba(100,254,62,0.12)' : 'transparent', color: done === g.questions.length ? '#64fe3e' : 'rgba(255,255,255,0.65)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {g.label} <span style={{ opacity: 0.6 }}>{done}/{g.questions.length}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0.7rem 2rem' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', fontSize: 13, color: '#888784' }}>
          Completing as: <strong style={{ color: '#0d0d0d' }}>{displayName || 'an invited stakeholder'}</strong>
          {round?.deadline && ` · Deadline: ${new Date(round.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '2rem' }}>

        {/* How this works. The scale is explained ONCE, here, so each question can render four
            visually equal options with no per-question commentary tilting the choice. */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem 1.75rem', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', color: '#0d0d0d', marginBottom: 10 }}>
            {introHeading}
          </div>

          {/* Varies by track. Absent — never guessed — if the server did not resolve a variant. */}
          {introVariant && INTRO_VARIANTS[introVariant].paragraphs.map((block, i) => (
            <div key={`para-${i}`} style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.75, marginTop: i === 0 ? 0 : 12 }}>
              {fill(block.body, companyInline, total)}
            </div>
          ))}

          {/* ⚠️ THE CARVE-OUT. One string for every variant, rendered immediately after the
              paragraph that says answers are combined — because that sentence is true of a score and
              false of a comment, and a comment box under it would make the page's own promise false. */}
          <div style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.75, marginTop: 12 }}>
            <strong style={{ color: '#0d0d0d' }}>{fill(COMMENT_CARVE_OUT.lead as string, companyInline, total)}</strong>{' '}
            {fill(COMMENT_CARVE_OUT.body, companyInline, total)}
          </div>

          {introVariant && INTRO_VARIANTS[introVariant].tips.map((block, i) => (
            <div key={`tip-${i}`} style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.75, marginTop: 12 }}>
              {block.lead && <strong style={{ color: '#0d0d0d' }}>{fill(block.lead, companyInline, total)}</strong>}
              {block.lead && ' '}
              {fill(block.body, companyInline, total)}
            </div>
          ))}

          {/* ⚠️ SHARED. One array, rendered here for every respondent, outside the variant switch —
              §6.1's abstention rule must read identically to everyone or n_abstained means different
              things for different populations. {n} comes from the payload via `total`: it is 31 or
              25 depending on routing, and a page that says 31 to someone shown 25 is a small lie the
              respondent can check by counting. */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '0.5px solid #e8e7e4' }}>
            {SHARED_BLOCKS.map((block, i) => (
              <div key={`shared-${i}`} style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.75, marginTop: i === 0 ? 0 : 12 }}>
                <strong style={{ color: '#0d0d0d' }}>{fill(block.lead as string, companyInline, total)}</strong>{' '}
                {fill(block.body, companyInline, total)}
              </div>
            ))}
          </div>
        </div>

        {/* ⚠️ THE SCOPE LINE. ONCE, above the whole list — never a clause in each context string.
            Every context string says "the company", meaning the company running this survey, and
            this line says which parts of it are in scope. Repeating it 31 times would add a
            sentence to every question that carries no per-question information.

            ⚠️ IT DOES NOT GOVERN THE SIX LABOUR ROWS, AND MUST NOT BE READ AS DOING SO. Those carry
            question_framing — "in your own workforce" / "in your organisation's workforce"
            (20260828) — which is scope stated more specifically, for the population the routing
            picked. This global line is for the other 25 (or all 31, for a respondent whose category
            routes the labour rows to not_asked and who therefore never sees a framing badge).
            The badge wins where both apply: it is narrower and it sits adjacent to the question,
            which is how a reader resolves a general line against a specific one. No deference
            clause is added here on purpose — a sentence explaining which line governs would draw
            attention to a conflict a respondent does not otherwise perceive. */}
        <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: 20, paddingBottom: 14, borderBottom: '0.5px solid #e8e7e4' }}>
          Answer about the company’s own operations and its suppliers, where relevant to you.
        </div>

        {groups.map((group, gi) => (
          <div key={`${group.label}-${gi}`} id={`survey-group-${gi}`} style={{ marginBottom: 28, scrollMarginTop: 130 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, paddingBottom: 8, borderBottom: '0.5px solid #e8e7e4' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d' }}>{group.label}</div>
              <div style={{ fontSize: 11.5, color: '#888784' }}>
                {group.questions.filter(q => saved[q.question_id] !== undefined).length} of {group.questions.length}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {group.questions.map(q => {
                const current = answers[q.question_id]
                const state = saveState[q.question_id]
                const isSaved = saved[q.question_id] !== undefined && state !== 'error'

                return (
                  <div key={q.question_id} style={{ background: '#fff', border: `0.5px solid ${state === 'error' ? FAIL : '#e8e7e4'}`, borderRadius: 14, padding: '1.25rem 1.5rem' }}>

                    {/* ⚠️ THE FRAMING IS THE ONLY THING TELLING THE SIX LABOUR QUESTIONS APART.
                        "Health and safety in your own workforce" and "Health and safety for workers
                        in your suppliers' and value-chain operations" share a short_name, and
                        subtopic_code is deliberately withheld from this payload, so there is no
                        second signal to fall back on. It renders as a qualifier ABOVE the question,
                        never inline and never omitted. Null on the other 25. */}
                    {q.question_framing && (
                      <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', color: GREEN, background: GREEN_BG, borderRadius: 99, padding: '3px 10px', marginBottom: 8 }}>
                        {q.question_framing}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <div style={{ fontSize: 12, color: '#888784', flexShrink: 0, minWidth: 20 }}>{numberOf[q.question_id]}.</div>
                      <div style={{ flex: 1 }}>
                        {/* `wording` is the question, and it is the layer §3.1 gives the customer to
                            edit. It is seeded as short_name + framing, so it repeats the qualifier
                            above until someone edits it — which is the expected steady state, and
                            far better than the client reconstructing the server's default
                            composition to decide what to hide. short_name is not rendered here for
                            the same reason; it is used in the pre-submit list below. */}
                        <div style={{ fontSize: 15, fontWeight: 500, color: '#0d0d0d', lineHeight: 1.5 }}>{q.wording}</div>

                        {/* Null on every question today — see gap 1 in this file's header. Renders
                            nothing rather than an empty block. */}
                        {q.context && (
                          <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginTop: 8 }}>{q.context}</div>
                        )}

                        <div style={{ fontSize: 13, color: '#888784', marginTop: 10, marginBottom: 10 }}>
                          What strategic priority should {companyInline} assign to this topic?
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {SCALE.map(opt => {
                            const on = current === opt.key
                            return (
                              <label
                                key={String(opt.key)}
                                style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer', padding: '10px 12px', borderRadius: 10, border: `1px solid ${on ? GREEN : '#e8e7e4'}`, background: on ? GREEN_BG : '#fff', transition: 'all 0.1s' }}
                              >
                                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: `1.5px solid ${on ? GREEN : '#e8e7e4'}`, background: on ? GREEN : '#fff', color: on ? '#fff' : '#888784' }}>
                                  {opt.badge}
                                </div>
                                <input
                                  type="radio"
                                  name={q.question_id}
                                  checked={on}
                                  onChange={() => choose(q.question_id, opt.key)}
                                  style={{ display: 'none' }}
                                />
                                <span style={{ fontSize: 13, color: '#0d0d0d', lineHeight: 1.5 }}>{opt.label}</span>
                              </label>
                            )
                          })}
                        </div>

                        {/* ⚠️ A SAVE THAT DID NOT SAVE MUST NEVER LOOK SAVED. The tick is driven by
                            `saved`, which only a confirmed write updates, and a failure shows the
                            server's own message with a retry rather than a tick. */}
                        <div style={{ minHeight: 18, marginTop: 8 }}>
                          {state === 'saving' && <span style={{ fontSize: 11.5, color: '#888784' }}>Saving…</span>}
                          {state === 'error' && (
                            <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: FAIL, marginBottom: 3 }}>NOT SAVED</div>
                              <div style={{ fontSize: 11.5, color: '#555553', lineHeight: 1.6 }}>{saveError[q.question_id]}</div>
                              <button
                                onClick={() => current !== undefined && choose(q.question_id, current)}
                                style={{ marginTop: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: `1px solid ${FAIL}`, background: '#fff', color: FAIL, cursor: 'pointer' }}
                              >
                                Try again
                              </button>
                            </div>
                          )}
                          {state !== 'saving' && state !== 'error' && isSaved && (
                            <span style={{ fontSize: 11.5, color: GREEN, fontWeight: 600 }}>✓ Saved</span>
                          )}
                        </div>

                        {/* ⚠️ DISABLED UNTIL AN OPTION IS CHOSEN. materiality_survey_responses'
                            XOR requires a value or an abstention on every row, so there is no row
                            for a comment with no answer and survey_save_free_text refuses one. If
                            this were enabled first, a respondent would type into it and meet the
                            refusal after the fact. "Not enough visibility to assess" IS an answer,
                            so anyone with something to say can always reach the box. */}
                        {(() => {
                          const answered = current !== undefined
                          const cState = commentState[q.question_id]
                          const cText = comments[q.question_id] ?? ''
                          return (
                            <div style={{ marginTop: 10 }}>
                              <textarea
                                value={cText}
                                disabled={!answered}
                                onChange={e => setComments(prev => ({ ...prev, [q.question_id]: e.target.value }))}
                                onBlur={() => saveComment(q.question_id)}
                                maxLength={4000}
                                rows={2}
                                placeholder={answered
                                  ? 'Add a comment (optional)'
                                  : 'Choose an answer above to add a comment'}
                                style={{
                                  width: '100%', boxSizing: 'border-box', padding: '9px 11px',
                                  borderRadius: 9,
                                  border: `1px solid ${cState === 'error' ? FAIL : '#e8e7e4'}`,
                                  background: answered ? '#fff' : '#f8f7f5',
                                  color: answered ? '#0d0d0d' : '#888784',
                                  fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6,
                                  resize: 'vertical', outline: 'none',
                                  cursor: answered ? 'text' : 'not-allowed',
                                }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4, minHeight: 16 }}>
                                {/* The carve-out again, at the moment of typing. */}
                                <span style={{ fontSize: 11, color: '#888784' }}>{COMMENT_BOX_NOTE}</span>
                                {cState === 'saving' && <span style={{ fontSize: 11, color: '#888784' }}>Saving…</span>}
                                {cState === 'saved' && cText === (commentSaved[q.question_id] ?? '') && cText !== '' && (
                                  <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>✓ Saved</span>
                                )}
                              </div>
                              {cState === 'error' && (
                                <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 8, padding: '8px 10px', marginTop: 4 }}>
                                  <div style={{ fontSize: 11.5, fontWeight: 700, color: FAIL, marginBottom: 3 }}>COMMENT NOT SAVED</div>
                                  <div style={{ fontSize: 11.5, color: '#555553', lineHeight: 1.6 }}>{commentError[q.question_id]}</div>
                                  <button
                                    onClick={() => saveComment(q.question_id)}
                                    style={{ marginTop: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: `1px solid ${FAIL}`, background: '#fff', color: FAIL, cursor: 'pointer' }}
                                  >
                                    Try again
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* ⚠️ THE CLOSING QUESTION — THE MODULE'S ENTIRE EMERGING-TOPIC CATCH.
            Survey scope is fixed at round creation and there is no second scoping moment, so this
            box is the ONLY route by which a matter nobody thought to ask about reaches the preparer.
            ESRS 2 IRO-1 expects such a route and this is it. It is deliberately NOT a small field
            at the foot of the page: it sits in its own card, immediately before Submit, at the same
            visual weight as a question. */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem 1.75rem', marginTop: 8, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>
            One last question
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#0d0d0d', lineHeight: 1.5, marginBottom: 4 }}>
            Is there anything affecting people, the environment or the business that we have not
            asked about?
          </div>
          <div style={{ fontSize: 13, color: '#888784', lineHeight: 1.7, marginBottom: 10 }}>
            Optional. The questions above cover the topics {companyInline} chose to ask about — if
            something matters and is not among them, this is the place to say so.
          </div>

          <textarea
            value={closing}
            onChange={e => setClosing(e.target.value)}
            onBlur={saveClosing}
            maxLength={4000}
            rows={4}
            placeholder="Anything else (optional)"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9,
              border: `1px solid ${closingState === 'error' ? FAIL : '#e8e7e4'}`,
              background: '#fff', color: '#0d0d0d', fontSize: 13.5, fontFamily: 'inherit',
              lineHeight: 1.7, resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4, minHeight: 16 }}>
            <span style={{ fontSize: 11, color: '#888784' }}>{COMMENT_BOX_NOTE}</span>
            {closingState === 'saving' && <span style={{ fontSize: 11, color: '#888784' }}>Saving…</span>}
            {closingState === 'saved' && closing === closingSaved && closing !== '' && (
              <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>✓ Saved</span>
            )}
          </div>
          {closingState === 'error' && (
            <div style={{ background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 8, padding: '8px 10px', marginTop: 4 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: FAIL, marginBottom: 3 }}>NOT SAVED</div>
              <div style={{ fontSize: 11.5, color: '#555553', lineHeight: 1.6 }}>{closingError}</div>
              <button
                onClick={saveClosing}
                style={{ marginTop: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: `1px solid ${FAIL}`, background: '#fff', color: FAIL, cursor: 'pointer' }}
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Submit */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem 1.75rem', marginTop: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 10 }}>Submit your responses</div>

          {/* One-way, said BEFORE the button rather than in a confirm dialog after it. survey_submit
              refuses a second call and there is no unlock path — 20260821 makes that a database
              fact, not a convention — so the warning has to be true and prominent. */}
          <div style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.75 }}>
            <strong style={{ color: '#0d0d0d' }}>Submitting is final.</strong> Once you submit, this
            link closes and you will not be able to change an answer or add one. If something needs
            to change afterwards, you will need to contact {companyInline} directly.
          </div>

          <div style={{ fontSize: 13.5, color: '#555553', lineHeight: 1.75, marginTop: 10 }}>
            You can submit with questions unanswered — an unanswered question is recorded as
            unanswered, which is not the same as “not enough visibility to assess”.
          </div>

          {unanswered.length > 0 && (
            <div style={{ marginTop: 14, background: '#f8f7f5', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>
                {unanswered.length} {unanswered.length === 1 ? 'question is' : 'questions are'} not yet answered
              </div>
              <div style={{ fontSize: 12, color: '#888784', lineHeight: 1.7 }}>
                {unanswered.map(q => q.short_name).join(' · ')}
              </div>
            </div>
          )}

          {/* Blocked, not merely warned: survey_submit resolves what is in the database, so an
              unsaved answer submitted over would be silently absent from the determination. */}
          {blockSubmit && (
            <div style={{ marginTop: 14, background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: FAIL, marginBottom: 4 }}>
                {failed.length > 0 || closingState === 'error' ? 'SOMETHING DID NOT SAVE' : 'NOT SAVED YET'}
              </div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.7 }}>
                {failed.length > 0 && (
                  <>{failed.length} {failed.length === 1 ? 'answer or comment' : 'answers or comments'} did not reach the survey: {failed.map(q => q.short_name).join(' · ')}. Use “Try again” on {failed.length === 1 ? 'that question' : 'those questions'} first.{' '}</>
                )}
                {/* The closing comment gets its own sentence rather than being folded into a count.
                    It is the only emerging-topic route the module has, so losing it is not one
                    missing answer among many. */}
                {closingUnsaved && (
                  <>Your answer to the last question has not been saved — click outside the box, or
                  use “Try again” if it failed. It is the only place to raise something the survey
                  did not ask about, so submitting without it would lose it entirely.{' '}</>
                )}
                {!failed.length && !closingUnsaved && 'Something is still being saved. This will clear in a moment.'}
              </div>
            </div>
          )}

          {submitError && (
            <div style={{ marginTop: 14, background: FAIL_BG, border: `0.5px solid ${FAIL}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: FAIL, marginBottom: 4 }}>NOT SUBMITTED</div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.7 }}>{submitError}</div>
              <div style={{ fontSize: 12, color: '#888784', lineHeight: 1.7, marginTop: 6 }}>
                Your saved answers are unaffected. You can try again, or come back to this link later.
              </div>
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || blockSubmit}
            style={{ marginTop: 16, fontSize: 13.5, fontWeight: 600, padding: '12px 26px', borderRadius: 9, background: '#0d0d0d', color: '#fff', border: 'none', cursor: submitting || blockSubmit ? 'not-allowed' : 'pointer', opacity: submitting || blockSubmit ? 0.45 : 1 }}
          >
            {submitting ? 'Submitting…' : `Submit ${savedCount} of ${total} answers — final`}
          </button>
        </div>

        {/* The anonymity claim used to be repeated here. It is not any more: each variant now makes
            it in its own words at the top, and variant B's version is materially stronger and more
            specific ("go to {company}, not to your employer"). A vaguer restatement of the same
            promise at the foot of the page is the drift docs/survey-intro-copy.md warns about — two
            wordings of one claim, and the weaker one is the one someone would edit. */}
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#888784', lineHeight: 1.7 }}>
          Powered by <a href="https://www.themisiq.co" style={{ color: '#7425e3', textDecoration: 'none' }}>ThemisIQ</a>
        </div>
      </div>
    </div>
  )
}
