// app/api/ghg-bot/route.ts
// ThemisIQ — the in-wizard GHG guide (the chat bubble in the GHG module).
//
// ── WHAT THIS ROUTE USED TO BE ────────────────────────────────────────────────────────────────
// Sixteen lines that parsed the request body and forwarded it UNMODIFIED to the Anthropic Messages
// API using ANTHROPIC_API_KEY, with no authentication, no entitlement check, no validation and no
// rate limit — then returned the upstream response raw. Every field came from the caller: model,
// max_tokens and the entire system prompt. Anyone who could POST to it had free use of the key with
// a prompt of their own choosing, and any upstream error detail came straight back to the browser.
//
// ── WHAT CHANGED, AND WHY EACH PART ───────────────────────────────────────────────────────────
//   • The system prompt lives HERE now, not in the browser. That is the actual fix: while the
//     prompt was built client-side and sent over the wire, "validate the system field" would only
//     ever have been a guess at which prompts are acceptable. The route now takes the conversation
//     and nothing else, so there is no system field to police.
//   • model and max_tokens are server constants for the same reason — a caller choosing the model
//     chooses the price.
//   • Bearer auth, following /api/concierge/extract: getAuthedClient VERIFIES the token against
//     Supabase and resolves the user; a client-sent id is never trusted.
//   • The ghg entitlement is required. Auth alone would stop the open internet but leave the key
//     usable by anyone who can open a free account, and signup is self-serve.
//   • The conversation is bounded, and the response is narrowed to { reply } so upstream error
//     bodies stop reaching the browser.
//
// The prompt text below moved VERBATIM from GHGBot in app/dashboard/ghg/page.tsx, defects included, so
// that the security change carried no content change with it.
//
// ⚠️ THE SCOPE 3 DEFECT IS FIXED — 17 Sep 2026, in its own pass. The prompt twice said Scope 3 was "not
// covered in this tool", which stopped being true when the 15-category module shipped. It now says Scope 3
// is a separate module and names what each category rests on, because those differ by an order of
// magnitude in quality.
//
// ⚠️ WHICH CATEGORY RESTS ON WHICH METHOD IS NO LONGER TYPED HERE. It was, and it went stale within a day:
// the prompt gave the flat-factor group a hand-typed count of ten and named Category 1 alone as EXIOBASE,
// after Categories 2 and 4 had moved and the true count was eight. (The old wording is not quoted here:
// methodSummary.test.ts SM7 forbids it anywhere in this file, comments included.) The clause is now
// assistantScope3Basis() from lib/scope3/methodSummary.ts, grouped by scope3MethodFor — the map the
// Scope 3 calculator dispatches on — with the flat group's size counted rather than written. Change a
// method's WORDING there; change which categories it covers in lib/scope3/categoryMethods.ts.
//
// Two claims in the prompt are still loose, and were left alone deliberately on the same date: "enter data
// once, get all reports automatically" (the export gates mean "automatically" holds only once an inventory
// is complete) and "kWh ... always shown on utility bills".

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { SB253_FIRST_REPORT_DATE } from '../../../lib/sb253'
import { assistantScope3Basis } from '../../../lib/scope3/methodSummary'
import { getAuthedClient, bearerFrom, AuthError } from '../../../lib/supabaseAuthed'
import { checkAndRecordRateLimit, ipFromHeaders } from '../../../lib/rateLimit'
import { WIZARD_STEP_NAMES, isWizardStep } from '../../../lib/ghg/wizardSteps'

// Server constants. The client used to send all three.
//
// ⚠️ A RETIRED MODEL STRING FAILS AS AN UPSTREAM 404, NOT AS ANYTHING OBVIOUSLY FATAL. This route
// carried 'claude-sonnet-4-20250514' for as long as that model existed, and then went on carrying it
// after it stopped existing. The API answers { "type": "not_found_error", "message": "model: ..." }
// with status 404 — just another unhappy response, indistinguishable at a glance from a transient
// upstream problem. Worse, before this route logged upstream failures the client read `data.content`
// off that error body, found nothing, and said "Sorry, try again." So the guide was dead for an
// unknown stretch and looked merely flaky. Nobody reported it, because that is what flaky looks like.
//
// THE CHECK IS ONE LIVE CALL. Nothing static catches this — tsc, eslint, the tests and the build all
// pass with a model that no longer exists, because it is only a string. Before changing MODEL, send
// it, and do not trust a model list in place of a response:
//   curl -s -o /dev/null -w '%{http_code}\n' https://api.anthropic.com/v1/messages \
//     -H 'content-type: application/json' -H "x-api-key: $ANTHROPIC_API_KEY" \
//     -H 'anthropic-version: 2023-06-01' \
//     -d '{"model":"<the string>","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}'
// 200 means it resolves; 404 means it does not.
//
// WHY sonnet-5 AND NOT an Opus: recorded in CLAUDE.md too, so it is not "corrected" back. The
// retired string was a Sonnet, so this keeps the tier its author chose; the guide answers from a
// fixed ~7 KB prompt rather than reasoning over a document the way /api/concierge/extract does; and
// the rate limit below admits 30 calls per user per ten minutes, which is a great many glossary
// lookups to pay Opus prices for.
//
// ⚠️ THIS NO LONGER DEVIATES FROM A SINGLE STANDARD, BECAUSE THERE ISN'T ONE. This comment used to
// justify itself against "claude-opus-4-8, the app-side standard CLAUDE.md names". That standard is
// gone: /api/concierge/extract moved to claude-opus-5 (with thinking on) on 5 Aug 2026, and CLAUDE.md
// now records a per-route choice rather than one default. The reasoning above stands on its own —
// it never depended on what the other route happened to use.
const MODEL = 'claude-sonnet-5'

// ⚠️ MAX_TOKENS IS NOT THE ANSWER'S LENGTH ANY MORE. On claude-sonnet-5 adaptive thinking runs by
// default when `thinking` is omitted, and thinking tokens are drawn from THIS SAME budget. The model
// can therefore spend most of the ceiling reasoning and have little — or nothing — left for the reply
// the customer actually reads.
//
// 1000 was sized against a pre-thinking model, where the number meant what it looked like it meant.
// Carried across unchanged it under-reads the ceiling, and it fails in a shape that does not look
// like a configuration mistake: a truncated answer, or a blank one. 4000 leaves room for both halves.
//
// The empty-reply handling further down is the backstop for when even this is not enough, and it
// names the cause rather than returning nothing.
const MAX_TOKENS = 4000

// ── Conversation bounds ──────────────────────────────────────────────────────────────────────
// The wizard holds the whole thread in React state and re-sends it EVERY turn, so input grows with
// the conversation and nothing capped it. 40 messages is 20 exchanges — far past any real help
// session (a handful of questions), close enough that a customer who hits it has genuinely been
// going a long time. 4,000 characters per message is generous for a single-line input box.
//
// Over the limit is a REFUSAL, not a silent truncation. Dropping the oldest turns would quietly
// change what the model was told — it could lose the caveat that framed everything after it — and
// the customer would have no way to know the answer rested on less than they had said. They are
// told to start a fresh chat instead.
const MAX_MESSAGES = 40
const MAX_MESSAGE_CHARS = 4000

// ── Rate limit ───────────────────────────────────────────────────────────────────────────────
// A backstop, not the main control — entitlement is that. This catches a runaway client loop and an
// abused account. Keyed primarily on the verified EMAIL rather than the IP, because identity is what
// we are limiting and a customer office shares one address; the IP ceiling is set high enough that
// several colleagues working at once do not collide, while still bounding one machine.
const RATE_BUCKET = 'ghg-bot'
const RATE_WINDOW_MS = 10 * 60 * 1000   // 10 minutes
const RATE_EMAIL_LIMIT = 30             // 30 questions per user per 10 min
const RATE_IP_LIMIT = 120               // 120 per address per 10 min — a shared office, not a loop

interface BotMessage { role: 'user' | 'assistant'; content: string }

function buildSystemPrompt(currentStep: number): string {
  return `You are a friendly, expert GHG inventory guide built into the ThemisIQ platform. The user is on step ${currentStep + 1} of 6: ${WIZARD_STEP_NAMES[currentStep]}. Your job is to help them complete their GHG inventory with confidence, answer questions clearly, and guide them toward completing the assessment if they haven't already.

ABOUT THEMISIQ: ThemisIQ is a compliance platform for GHG inventories. Scope 1 and 2 are entered once in this wizard and exported to each framework the customer selected, without re-entry — Scope 3 is a separate module, with its own inputs, so "once" describes Scope 1 and 2 rather than the whole platform. Exports UNLOCK RATHER THAN RUN AUTOMATICALLY: every location has to be priceable and its streams declared, every coverage question and grid region resolved, the data confirmed, and, in concierge mode, the extracted figures approved. Until then the export buttons stay disabled and the wizard names what is outstanding, so never tell a customer a report will be produced automatically. The assessment at www.themisiq.co/assess helps companies determine which frameworks apply to them.

FRAMEWORK GUIDANCE:
- SB 253 (CARB): Required for companies with $1B+ global annual revenue AND California nexus (operations, employees, or sales in California). CARB has PROPOSED ${SB253_FIRST_REPORT_DATE} for the first report (Scope 1 and 2); it is NOT FINAL and still requires OAL approval, so never state it as a settled deadline. If unsure whether they qualify, direct them to www.themisiq.co/assess.
- CDP: Voluntary but widely requested by investors and large customers. If a customer or investor has asked them to complete CDP, they need this. Direct undecided users to www.themisiq.co/assess.
- ESRS E1: Mandatory for large EU-incorporated companies under EU CSRD. Deadline was FY2024 for the largest companies. If they have EU operations or are incorporated in the EU, they likely need this.
- GRI 305: Most widely used voluntary emissions standard globally. Used for sustainability reports, supply chain questionnaires, and stakeholder communications. Not mandatory but widely expected by customers and ESG raters.
- EcoVadis: Required when a corporate customer has requested an EcoVadis supplier assessment. If a customer asked them to complete EcoVadis, they need this module.
- IFRS S2: Emerging global standard for climate financial disclosures. Being adopted in Canada, UK, Australia, Singapore, and others. If they file financial statements in these jurisdictions, IFRS S2 may apply.
- Not sure which frameworks apply? Always direct them to: www.themisiq.co/assess — the free 2-minute eligibility assessment.

KEY TECHNICAL FACTS:
- Scope 1 = direct emissions from owned/controlled sources (natural gas, propane, diesel, gasoline, refrigerants)
- Scope 2 = indirect emissions from purchased electricity and steam
- Scope 3 = all other indirect emissions (supply chain, business travel, employee commuting). Not part of this wizard, which covers Scope 1 and 2: ThemisIQ has a separate Scope 3 module that binds to this inventory and has all 15 categories. WHAT IT RESTS ON DIFFERS SHARPLY BY CATEGORY, and you must say so rather than describing it as one inventory: ${assistantScope3Basis()}
- Mcf = thousand cubic feet of natural gas (common US utility billing unit)
- Therms = unit of natural gas energy (1 therm = 100,000 BTU)
- MMBtu = million British thermal units of natural gas
- kWh = kilowatt hours of electricity (usually the billed quantity on an electricity bill)
- eGRID = US EPA electricity grid regions with different emission factors
- AR6 GWP = IPCC 6th Assessment Report global warming potentials. ThemisIQ uses AR6 for every framework (SB 253, CDP, ESRS E1, GRI 305, EcoVadis, IFRS S2). It is fixed: there is no setting, option or request that changes it.
- AR5 GWP = IPCC 5th Assessment Report. ThemisIQ does not apply AR5 itself. Some published emission factors arrive with the gases already combined on AR5 (the UK, Australian and New Zealand fuel factors, and UK district heat); ThemisIQ uses those exactly as published, and the calculation workings mark them.
- AR4 GWP = IPCC 4th Assessment Report. ThemisIQ does not apply AR4. SB 253 inventories were calculated on AR4 until June 2026 and have used AR6 since.
- Location-based Scope 2 = uses grid average emission factors
- Market-based Scope 2 = accounts for renewable energy certificates (RECs) and PPAs
- PPA = Power Purchase Agreement (contract for renewable electricity)
- REC = Renewable Energy Certificate (proves renewable electricity was generated)
- Organizational boundary = which entities/facilities are included (operational control is most common)

COMMON QUESTIONS AND ANSWERS:
- "What's California nexus?" = Having operations, employees, customers, or sales in California. Even one employee working remotely in California can create nexus.
- "Our revenue is just under $1B" = SB 253 threshold is $1B+ global revenue. If under, you likely don't need to file but should monitor as thresholds may change.
- "When is the SB 253 deadline?" = CARB has proposed ${SB253_FIRST_REPORT_DATE} for the first report, but it is not final — it still needs OAL approval and has already moved twice. ThemisIQ keeps the date current; the wizard takes about 20 minutes with bills in hand.
- "Operational vs financial control?" = Operational control means you include facilities where you control operations. Financial control means you include entities where you have financial control. Most companies use operational control.
- "Do I include subsidiaries?" = Under operational control, yes — include any facility your company operates. Under equity share, include proportional to ownership.
- "What if our landlord pays electricity?" = If you don't pay the utility bill directly you may not hold the data. Ask your landlord or property manager for the consumption figures or a copy of the bills; many will share them. If they won't, enter what you do have and say so in your workings — ThemisIQ leaves a location it has no figure for out of the totals and names the gap, rather than counting it as zero.
- "Do leased vehicles count?" = Yes, if your company pays for the fuel and controls the vehicle operations, include them in Scope 1 mobile combustion.
- "What about employee personal vehicles?" = Business travel in a personal vehicle is Scope 3, Category 6, so it belongs in the Scope 3 module rather than this wizard. Note what that category takes today: number of flights, hotel nights and rail distance, so car mileage has no field of its own yet. Commuting in a personal vehicle is Category 7, which does take a commute distance and mode. Fuel your company pays for in a vehicle it controls is Scope 1 mobile combustion, here in this wizard.
- "We have rooftop solar — how do I handle it?" = Electricity you generate and consume on-site is not Scope 2 (it's not purchased). Only purchased grid electricity goes in Scope 2.
- "What if I don't have 12 months of bills?" = Annualising is normal and ThemisIQ supports it — the point is WHERE the multiplication happens. Upload the bills you have; where they are machine-read, a coverage strip appears under the upload showing how many of the 12 months are evidenced, with an "Acknowledge & estimate" button. That grosses the metered figure up by 12 over the months covered, writes the extrapolation and its basis into the calculation workings ("9 of 12 months from bills; grossed ×1.33"), and records the estimated percentage on the inventory. Doing the arithmetic yourself and typing the grossed-up number into a quantity box is worse, and this is the reason to say so: nothing marks it, so it arrives looking like a metered figure, the workings show no extrapolation, and the estimated share is recorded as nothing rather than as a proportion. If the bills are not machine-read — no concierge tier, or a spreadsheet or CSV upload — there is no coverage strip for them today, so keep your own record of what you multiplied and raise it with your verifier.
- "Multiple meters at one location?" = Add them together for that location's total: there is one figure per fuel per location. Upload every bill you added up, and keep your own arithmetic — the stored figure is a sum, and no single document shows it, so a verifier sampling that line needs the whole set of bills to get back to it.
- "What's the difference between stationary and mobile diesel?" = Stationary = diesel in generators, boilers, heating equipment that doesn't move. Mobile = diesel in vehicles and mobile equipment.
- "Which GWP basis does ThemisIQ use?" = IPCC AR6 (2021), for every framework including SB 253. Factors a publisher has already combined, such as the UK, Australian and New Zealand fuel factors on AR5, are used as published and marked in the workings. The IPCC revises these values between assessments — methane's 100-year GWP is 25 under AR4, 28 under AR5, and 29.8 (fossil) or 27.0 (non-fossil) under AR6 — but for most companies the difference is small.
- "Can I use AR4 or AR5 instead?" / "Can I switch the GWP basis?" = No. ThemisIQ calculates every framework on AR6 and has no setting, export option or workaround for AR4 or AR5, so do not suggest one. If a regulator, customer or verifier asks for figures on another basis, say plainly that ThemisIQ does not produce them and suggest they confirm the requirement with their verifier.
- GWP RULE: never tell a user they can choose, select, switch, toggle or request a GWP basis, and never describe AR4 or AR5 as available, optional or an alternative in ThemisIQ. If unsure, say ThemisIQ uses AR6 for everything.
- GWP UNIFORMITY: when you describe the GWP basis, never call it consistent, uniform, the same throughout, or applied across the board. AR6 is the set ThemisIQ applies where it combines CO2, CH4 and N2O itself; factors that arrive from their publisher already combined keep that publisher's basis (AR5 for the UK, Australian and New Zealand fuel factors and UK district heat), and the workings mark those rows. Name both parts whenever you state the basis, and never imply that one basis covers the whole inventory.
- SUFFICIENCY RULE — THIS APPLIES TO EVERYTHING YOU DESCRIBE, NOT ONLY GWP. Say what ThemisIQ does: which GWP set it applies, which emission factors and editions it uses, which boundary or method a figure rests on, what an export contains. Never say that any of it satisfies a regulator, framework, standard, programme, customer or verifier. Do not call a basis, factor, source, boundary, method, figure or export correct, required, accepted, compliant, sufficient, adequate, standard, industry-standard or increasingly used, and do not say it meets a requirement, is what a regulator wants, or will be accepted. Sufficiency is a question for the customer's verifier or professional adviser, and you send it there — even when the customer asks you to confirm it, even when they seem to want reassurance, and even when the answer looks obvious to you. Describing the platform is your job; vouching for it is not.
- "What's an intensity ratio?" = Emissions per unit of economic output (e.g. mtCO2e per $million revenue). Allows comparison across companies of different sizes.
- "Do I need a third-party verifier?" = SB 253 requires limited assurance from an accredited verifier — that is in the statute, not something ThemisIQ decides. What ThemisIQ produces for you to hand over is the assurance package: the calculation workings, the emission factor citations and editions, your uploaded source documents and the audit trail. Whether it answers a particular verifier's questions is theirs to say, so ask them early what they want to see.
- "Can I submit the CSV directly to CARB?" = The CSV is your working document, and ThemisIQ does not file anything for you — CARB will have its own submission portal. The CSV carries your Scope 1 and Scope 2 totals, the organisation and boundary details, the emission factor citations and a per-location breakdown; the calculation workings and audit trail are in the assurance PDF. Read it against the fields the portal asks for, and put anything you are unsure about to your verifier or adviser.
- "What does assurance-ready mean?" = It describes what the package contains, not a verdict on it: emission factors cited with their source and edition, the calculation workings behind every figure, the source documents you uploaded, and an audit trail of every saved change to this inventory, written by a database trigger rather than by the application. Two limits to state if they come up: the trail records each save of the inventory, not each keystroke, and it covers the GHG inventory — the Scope 3 module is not audited. A verifier may want more than the package holds, and only they can say whether it is enough for their opinion.

Always be encouraging, concise, and jargon-free. If someone seems confused about which frameworks they need, always suggest www.themisiq.co/assess. Never make up regulatory deadlines or requirements you're not sure about.
`
}

export async function POST(req: NextRequest) {
  // ── 1. Authenticate. The token is verified server-side; AuthError covers missing and invalid. ──
  let userId: string
  let email: string | undefined
  let supabase
  try {
    const authed = await getAuthedClient(bearerFrom(req))
    supabase = authed.supabase
    userId = authed.userId
    email = authed.email
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }
    console.error('[ghg-bot] auth failed:', err)
    return NextResponse.json({ error: 'auth_failed' }, { status: 500 })
  }

  // ── 2. Entitlement. Mirrors useEntitlementAccess('ghg'): no user_id filter, because RLS scopes the
  // read to this user's own rows. FAILS CLOSED — unlike the rate limiter, which fails open, a fault
  // here must not hand out use of the API key. A paying customer sees a retryable message. ──
  const { data: ent, error: entErr } = await supabase
    .from('entitlements')
    .select('module_key')
    .eq('module_key', 'ghg')
    .maybeSingle()
  if (entErr) {
    console.error('[ghg-bot] entitlement read failed (denying):', entErr.message)
    return NextResponse.json({ error: 'entitlement_check_failed' }, { status: 503 })
  }
  if (!ent) {
    return NextResponse.json({ error: 'entitlement_required' }, { status: 403 })
  }

  // ── 3. Rate limit, now that there is a verified identity to key on. ──
  const rl = await checkAndRecordRateLimit({
    bucket: RATE_BUCKET,
    ip: ipFromHeaders(req),
    email: email ?? userId,
    ipLimit: RATE_IP_LIMIT,
    emailLimit: RATE_EMAIL_LIMIT,
    windowMs: RATE_WINDOW_MS,
  })
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited', retryAfterSec: rl.retryAfterSec }, { status: 429 })
  }

  // ── 4. Parse and validate. The ONLY accepted fields are messages and currentStep. ──
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const { messages: rawMessages, currentStep } = (body ?? {}) as {
    messages?: unknown
    currentStep?: unknown
  }

  // Validated, not clamped: an out-of-range step would otherwise index undefined into the prompt
  // and assert to the model that the customer is somewhere the wizard does not have.
  if (!isWizardStep(currentStep)) {
    return NextResponse.json({ error: 'invalid_step' }, { status: 400 })
  }

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  if (rawMessages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: 'conversation_too_long' }, { status: 400 })
  }

  const messages: BotMessage[] = []
  for (const m of rawMessages) {
    if (typeof m !== 'object' || m === null) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    }
    const { role, content } = m as { role?: unknown; content?: unknown }
    if (role !== 'user' && role !== 'assistant') {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: 'message_too_long' }, { status: 400 })
    }
    messages.push({ role, content })
  }

  // The wizard seeds its thread with a greeting it renders itself ("Hi! I'm your GHG inventory
  // guide..."). That is interface, not conversation, so it is dropped here rather than presented to
  // the model as a turn it took. Any leading assistant messages go the same way.
  while (messages.length > 0 && messages[0].role === 'assistant') messages.shift()
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    // A trailing assistant message would make the model CONTINUE that text rather than reply to a
    // question — a way for a caller to put words in the guide's mouth. The contract is that the
    // last turn is the customer's.
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // ── 5. Call Anthropic. ──
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[ghg-bot] ANTHROPIC_API_KEY is missing on the server')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(currentStep),
        messages,
      }),
    })

    if (!res.ok) {
      // The upstream body is LOGGED, not returned. It can carry account, quota and billing detail,
      // and the old route handed all of it to the browser.
      console.error('[ghg-bot] upstream error', res.status, await res.text().catch(() => ''))
      return NextResponse.json({ error: 'upstream_failed' }, { status: 502 })
    }

    const data = await res.json()

    // WHY generation ended. This is the difference between "the model had nothing to say" and "the
    // model ran out of budget part-way through", which look identical from the joined text alone.
    const stopReason: string = typeof data?.stop_reason === 'string' ? data.stop_reason : 'unknown'

    // TEXT BLOCKS ONLY. With adaptive thinking the content array can also carry `thinking` and
    // `redacted_thinking` blocks. Those have no `text` property, so the previous `c?.text || ''`
    // happened to skip them — but by accident rather than by construction, and the accident was one
    // field name away from putting the model's private reasoning in front of a customer. Filtering on
    // the block type is what /api/concierge/extract already does.
    const reply = Array.isArray(data?.content)
      ? data.content
          .filter((c: { type?: string }) => c?.type === 'text')
          .map((c: { text?: string }) => c?.text || '')
          .join('')
      : ''

    if (!reply) {
      // NEVER return an empty string. A blank bubble is indistinguishable from a working answer that
      // happened to say nothing, and it leaves the customer with no way to tell whether asking again
      // would help. Both branches below name a cause.
      console.error('[ghg-bot] empty reply — stop_reason=%s', stopReason)
      return stopReason === 'max_tokens'
        // The whole budget went on the response — thinking included — and no text survived. Ours to
        // fix by raising MAX_TOKENS, but genuinely recoverable by the customer in the moment, so the
        // message says what happened and what helps rather than blaming the connection.
        ? NextResponse.json({ error: 'answer_too_long' }, { status: 502 })
        // Anything else here is the upstream behaving in a way we did not expect — a stop_reason we
        // do not handle, or a content array with no text blocks at all. Say so plainly.
        : NextResponse.json({ error: 'empty_reply' }, { status: 502 })
    }

    // Logged on the happy path too, so the ratio is visible: a run of 'max_tokens' on answers that
    // DID return text is the early warning that MAX_TOKENS is short again, before it starts
    // truncating to nothing. Metadata only — no message content, no customer data.
    console.log('[ghg-bot] ok — stop_reason=%s chars=%d', stopReason, reply.length)

    // A non-empty answer that stopped on max_tokens is returned AS IT STANDS — truncated, but real
    // text the customer can read and act on, which beats replacing it with an apology. It is FLAGGED
    // rather than returned bare: an answer that stops mid-thought looks exactly like a complete one,
    // and a customer acting on half an explanation has no way to know a half is what they got.
    //
    // A SECOND FIELD, not a sentence spliced onto `reply`. The truncation is a fact ABOUT the answer,
    // not part of it — folded into the string it would inherit the message bubble and read as the
    // guide's own words, the client could not tell our note from the model's, and a customer copying
    // the reply into their working papers would carry our annotation with it.
    const incomplete = stopReason === 'max_tokens'

    // Narrowed response: the reply text, plus the flag when there is something to flag.
    return NextResponse.json(incomplete ? { reply, incomplete: true } : { reply })
  } catch (err) {
    console.error('[ghg-bot] request failed:', err)
    return NextResponse.json({ error: 'upstream_failed' }, { status: 502 })
  }
}
