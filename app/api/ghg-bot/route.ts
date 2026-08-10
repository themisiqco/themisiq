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
// The prompt text below moved VERBATIM from GHGBot in app/dashboard/ghg/page.tsx. It is unchanged
// including its known defects — it twice tells the customer Scope 3 is "not covered in this tool",
// which stopped being true when the 15-category Scope 3 module shipped. Correcting the copy is a
// separate pass; doing it here would mix a security change with a content change in one diff.

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { SB253_FIRST_REPORT_DATE } from '../../../lib/sb253'
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

ABOUT THEMISIQ: ThemisIQ is a compliance platform that helps companies complete GHG inventories for multiple frameworks at once — enter data once, get all reports automatically. The assessment at www.themisiq.co/assess helps companies determine which frameworks apply to them.

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
- Scope 3 = all other indirect emissions (supply chain, business travel, employee commuting) — not covered in this tool
- Mcf = thousand cubic feet of natural gas (common US utility billing unit)
- Therms = unit of natural gas energy (1 therm = 100,000 BTU)
- MMBtu = million British thermal units of natural gas
- kWh = kilowatt hours of electricity (always shown on utility bills)
- eGRID = US EPA electricity grid regions with different emission factors
- AR4 GWP = IPCC 4th Assessment Report global warming potentials (selectable alternate; not the default basis)
- AR5 GWP = IPCC 5th Assessment Report (selectable alternate; not the default basis)
- AR6 GWP = IPCC 6th Assessment Report global warming potentials (ThemisIQ's default basis, applied across all frameworks)
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
- "What if our landlord pays electricity?" = If you don't pay the utility bill directly, you may not have access to the data. Request consumption data from your landlord or property manager — this is increasingly common and often required.
- "Do leased vehicles count?" = Yes, if your company pays for the fuel and controls the vehicle operations, include them in Scope 1 mobile combustion.
- "What about employee personal vehicles?" = Personal vehicles used for business travel are Scope 3, not covered in this tool.
- "We have rooftop solar — how do I handle it?" = Electricity you generate and consume on-site is not Scope 2 (it's not purchased). Only purchased grid electricity goes in Scope 2.
- "What if I don't have 12 months of bills?" = Use what you have and annualize (e.g. 9 months of data × 12/9). Note this in your workings.
- "Multiple meters at one location?" = Add them all together for that location's total.
- "What's the difference between stationary and mobile diesel?" = Stationary = diesel in generators, boilers, heating equipment that doesn't move. Mobile = diesel in vehicles and mobile equipment.
- "Which GWP basis does ThemisIQ use?" = ThemisIQ applies IPCC AR6 (2021) global warming potentials by default across all frameworks; AR4 and AR5 remain available as selectable alternates. The IPCC revises these values between assessments — methane's 100-year GWP is 25 under AR4 and roughly 28-30 under AR5 and AR6 — but for most companies the difference is small.
- "What's an intensity ratio?" = Emissions per unit of economic output (e.g. mtCO2e per $million revenue). Allows comparison across companies of different sizes.
- "Do I need a third-party verifier?" = SB 253 requires limited assurance from an accredited verifier. ThemisIQ's assurance-ready export is designed to make that process faster and cheaper.
- "Can I submit the CSV directly to CARB?" = The CSV is your working document. CARB will have a specific submission portal — ThemisIQ's export gives you all the data you need to complete that submission.
- "What does assurance-ready mean?" = Your inventory includes cited emission factors, documented calculation workings, and source document uploads — everything a third-party verifier needs to review your numbers.

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

  // ── 2. Entitlement. Mirrors useEntitlement('ghg'): no user_id filter, because RLS scopes the
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
