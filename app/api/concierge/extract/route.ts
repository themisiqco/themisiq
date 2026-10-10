// app/api/concierge/extract/route.ts
// ThemisIQ — Concierge document extraction (Phase A: de-risk).
//
// Receives ONE uploaded source document (base64) and asks the Anthropic API to
// read the energy/fuel figures off it, returning a structured result per fuel
// type with the source quote it read each number from and a confidence flag.
//
// This is the de-risking endpoint: it accepts the document directly in the
// request body (rather than fetching from Supabase Storage) so extraction
// quality can be tested on a real bill immediately. Once extraction proves out,
// the document-fetch can be repointed to storage with no change to the prompt
// or response shape.
//
// BR2 (10 Oct 2026): THE GUARANTEE. A human-read inventory's bills never reach the AI, enforced here, server side,
// before the file is fetched or the model is called:
//   400  no stored path, a document posted in the body, or a path in the old format (no inventory in it): the old
//        base64 `document` fallback is removed, so every document this route reads is one it found in storage;
//   403  a path naming another user, or an inventory other than the one the request names, or an inventory the
//        caller cannot read (RLS: own rows only);
//   409  the inventory's bills are read by a ThemisIQ specialist (ghg_inventories.bill_review_reading = 'human'),
//        or its reading is anything but 'ai';
//   503  the reading could not be read. Fails closed: no read, no extraction.
// Every refusal is logged with metadata only (the status, the reason, the inventory id), never the path or the file.
// A switch from human to AI is refused by the database until BR4 (20261011_bill_review_reading.sql), so "human now"
// covers every bill uploaded while the inventory was human-read.
// ⚠️ THE BROWSER CHOOSES THE INVENTORY SEGMENT of the path (lib/ghg/uploadPath.ts). This route proves the caller owns
// the path and the inventory; it cannot prove which of the caller's inventories a bill belongs to. Accepted (BR2
// ruling), register BR-01.
//
// COMPLIANCE NOTE: the prompt instructs the model to return value:null /
// confidence:"low" when it is not certain, rather than guessing. For a
// compliance product a flagged blank is safer than a confident wrong number;
// the customer signs off on every figure before any report is finalised.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'

// Fuel types we currently extract, with the unit(s) the GHG inventory expects.
// Keep this list aligned with the GHG module's per-location fields.
// From the shared lib, NOT declared here: the wizard needs the same list, and it cannot import from
// this module without pulling `next/server` into the client bundle. See lib/ghg/conciergeDocTypes.ts.
import { SUPPORTED_FUELS, type FuelType } from '../../../../lib/ghg/conciergeDocTypes'
import { CONCIERGE_ENTITLEMENT_KEYS } from '../../../../lib/pricing'
import { parseUploadPath } from '../../../../lib/ghg/uploadPath'
import { HUMAN_READ_REFUSAL, OLD_PATH_REFUSAL } from '../../../../lib/ghg/billReviewReading'

/** BR2: a refusal, logged with metadata only. */
function refuse(status: number, reason: string, error: string, inventoryId: string | null): NextResponse {
  console.warn('[concierge/extract] refused', { status, reason, inventoryId })
  return NextResponse.json({ error, reason }, { status })
}

const FUEL_GUIDANCE: Record<FuelType, string> = {
  electricity:
    'Electricity consumption for the billing period. Report the figure and its unit EXACTLY as printed on the bill (e.g. kWh, MWh, GJ) — do NOT convert. Use the billed/metered consumption, NOT cost, NOT demand (kW), NOT the raw meter-reading numbers.',
  natural_gas:
    'Natural gas consumption for the billing period. Report the figure and its unit EXACTLY as printed (e.g. m3, ft3, CCF, therms, mcf, mmbtu, or kWh) — do NOT convert. Use billed consumption, not cost.',
  diesel:
    'Diesel fuel quantity delivered or purchased. Report the figure and its unit EXACTLY as printed (e.g. litres, gallons) — do NOT convert.',
  propane:
    'Propane (LPG) quantity delivered or purchased. Report the figure and its unit EXACTLY as printed (e.g. litres, gallons, kg, lbs) — do NOT convert.',
  gasoline:
    'Gasoline (petrol) fuel quantity, typically from fleet or fuel-card records. Report the figure and its unit EXACTLY as printed (e.g. litres, gallons) — do NOT convert. Use the purchased/dispensed volume, not cost.',
}

interface ExtractionField {
  fuelType: FuelType
  value: number | null
  unit: string | null
  periodStart: string | null   // ISO yyyy-mm-dd — billing/service period start
  periodEnd: string | null     // ISO yyyy-mm-dd — billing/service period end
  deliveryDate?: string | null // ISO yyyy-mm-dd — T10b: a single delivery or purchase date, when no period is printed
  periodConfidence: 'high' | 'medium' | 'low' | null
  sourceQuote: string | null
  confidence: 'high' | 'medium' | 'low'
  notes: string | null
}

function buildPrompt(fuelTypes: FuelType[], locationName?: string): string {
  const fuelLines = fuelTypes.map(f => `- ${f}: ${FUEL_GUIDANCE[f]}`).join('\n')
  return `You are a careful data-entry assistant for a greenhouse-gas accounting platform. You are reading a single uploaded document (a utility bill, fuel delivery record, or similar) and extracting energy/fuel consumption figures from it.${locationName ? `\n\nThis document is for the facility/location named: "${locationName}".` : ''}

Extract ONLY the following, when present in this document:
${fuelLines}

For EACH figure you report, also extract the billing/service period that the figure covers:
- periodStart and periodEnd as ISO dates (yyyy-mm-dd).
- If the bill prints explicit start and end dates for the period (e.g. "Dec 01, 2024 - Jan 01, 2025" or "Service period: ..."), use those exact dates VERBATIM, including the printed end date even when it falls on the 1st of the next month. Do NOT round, clamp, or normalize the end date to the last day of a month. Set periodConfidence: "high".
- If the document shows an explicit date range (e.g. "Nov 1 - Nov 30, 2024"), use those exact dates.
- If it shows only a month or month/year (e.g. "Nov 2024"), use the first and last calendar day of that month and set periodConfidence: "medium".
- If no billing period is visible, return periodStart: null, periodEnd: null, periodConfidence: "low".
- DELIVERIES: if the document records a delivery, purchase or dispense of fuel on a single date and prints no service period (for example a propane or diesel delivery invoice, or a single fuel receipt), return that date as deliveryDate (yyyy-mm-dd), with periodStart: null and periodEnd: null. Never return a delivery date as a one-day period (periodStart equal to periodEnd). If the document prints a statement period (for example a monthly fuel-card or account statement), report that period as periodStart and periodEnd and leave deliveryDate null.

CRITICAL RULES — this feeds a regulatory compliance report, so accuracy matters more than completeness:
1. Only report a figure you can actually see in the document. If a fuel type is not present, return value: null for it.
2. If you are not confident which number is the correct billed consumption (e.g. the bill is ambiguous, you can't tell consumption from cost or from a meter reading, or the figure is unclear), return value: null and confidence: "low" with a note explaining the ambiguity. DO NOT GUESS. A blank that gets flagged for human entry is far better than a confident wrong number.
3. For every figure you DO report, set "sourceQuote" to a short, consistent verification string in EXACTLY this format: the consumption figure followed by its unit, as printed on the document — e.g. "585 kWh", "1,234 kWh", "2,410 m3", "18 therms". Preserve the printed number formatting (thousands separators, decimals) and the printed spelling/casing of the unit. This is a normalized value+unit string, NOT a copied line from the bill.
4. sourceQuote must contain ONLY that figure-and-unit and nothing else. Do NOT include billing dates, day counts, date ranges, monetary amounts, rates, taxes, account balances, meter-reading numbers, or surrounding words — dates belong in periodStart/periodEnd. The number in sourceQuote MUST equal "value" and the unit MUST equal "unit". If a figure is printed with no unit anywhere on the document, treat it as ambiguous: return value: null, confidence: "low", and a note — never emit a bare number as the sourceQuote.
5. Set confidence: "high" only when the figure is clearly labelled and unambiguous; "medium" when you had to interpret or convert; "low" when uncertain.
6. Do NOT convert units. Report each figure in the unit exactly as printed on the document — conversion happens later in a separate, audited step. Your job is only to read the figure and its unit faithfully.
7. Do not guess the type of vehicle or equipment a fuel was used in. Mention it in notes only if the document states it plainly (for example "forklift" or "heavy goods vehicle"); a vehicle registration or fleet number is not a vehicle type. The customer chooses the vehicle type at review.

Respond with ONLY a JSON array (no prose, no markdown fences), one object per requested fuel type, each shaped exactly:
{"fuelType": "<one of: ${fuelTypes.join(', ')}>", "value": <number or null>, "unit": "<string or null>", "periodStart": "<yyyy-mm-dd or null>", "periodEnd": "<yyyy-mm-dd or null>", "deliveryDate": "<yyyy-mm-dd or null>", "periodConfidence": "high"|"medium"|"low"|null, "sourceQuote": "<string or null>", "confidence": "high"|"medium"|"low", "notes": "<string or null>"}`
}

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate as the user (same pattern as /api/materiality) ──
    const token = bearerFrom(req)
    const { supabase, userId } = await getAuthedClient(token)

    // ── Entitlement: concierge, NOT ghg ──────────────────────────────
    // These are separate purchases. Concierge is an add-on sold in three tiers on top of the GHG
    // module, so a customer can hold ghg and not hold this. Gating on ghg would have let every GHG
    // customer use bill extraction without buying it — the client gates on useHasConcierge(), and
    // this is the same read: any one of the three tier rows.
    //
    // WHY IT MATTERS THAT THIS EXISTS AT ALL: until now the route checked only that the caller was
    // signed in. Signup is self-serve, so any free account could post a document and have it read
    // at our cost — and this is the more expensive of the two Anthropic endpoints, since it sends
    // whole documents rather than a few lines of chat.
    //
    // No user_id filter: RLS scopes the read to the caller's own rows, exactly as the client's
    // useHasConcierge() does. FAILS CLOSED — a fault here must not hand out extraction.
    const { data: conciergeRows, error: entErr } = await supabase
      .from('entitlements')
      .select('module_key')
      .in('module_key', CONCIERGE_ENTITLEMENT_KEYS)
      // ⚠️ TERM-AWARE SINCE 28 Sep 2026, AND IT WAS NOT BEFORE. This returned true for an
      // EXPIRED Concierge row, so a customer whose term had ended kept bill extraction
      // indefinitely: no error, no symptom, just access that outlived the payment. The GHG check
      // has always compared term_end. This one simply never did.
      // Same comparison enforce_ghg_location_allowance() makes in Postgres, and the same one the
      // server route makes in app/api/concierge/extract/route.ts.
      // ⚠️ NOT THE SAME QUESTION AS isFirstConciergePurchase, which is deliberately NOT term-aware:
      // an expired customer has no access, but has still been billed for onboarding once.
      .gt('term_end', new Date().toISOString())
      .limit(1)
    if (entErr) {
      console.error('[concierge/extract] entitlement read failed (denying):', entErr.message)
      return NextResponse.json(
        { error: 'We couldn’t confirm your plan just now. Please try again in a moment.' },
        { status: 503 },
      )
    }
    if (!conciergeRows || conciergeRows.length === 0) {
      return NextResponse.json(
        { error: 'Reading figures off a document is part of Bill Review. Your upload is still kept as evidence: type the figure into the box above.' },
        { status: 403 },
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Extraction is not configured: ANTHROPIC_API_KEY is missing on the server.' },
        { status: 503 },
      )
    }

    // ── Parse & validate input ───────────────────────────────────────
    const body = await req.json()

    let mediaType: string | undefined = typeof body.mediaType === 'string' ? body.mediaType : undefined
    const filePath: string | undefined = typeof body.filePath === 'string' ? body.filePath : undefined
    const inventoryId: string | null = typeof body.inventoryId === 'string' ? body.inventoryId : null

    // ── BR2: the guarantee, before the file is fetched or the model is called ──
    // The base64 fallback is gone: a document in the body would skip every check below.
    if (body.document !== undefined) return refuse(400, 'document_in_body', 'Documents are read from storage only.', inventoryId)
    if (!filePath) return refuse(400, 'no_file_path', 'filePath is required.', inventoryId)
    if (!inventoryId) return refuse(400, 'no_inventory_id', 'inventoryId is required.', null)
    const named = parseUploadPath(filePath)
    if (!named) return refuse(400, 'old_format_path', OLD_PATH_REFUSAL, inventoryId)
    if (named.userId !== userId) return refuse(403, 'path_other_user', 'That document is not yours.', inventoryId)
    if (named.inventoryId !== inventoryId) return refuse(403, 'path_other_inventory', 'That document belongs to another inventory.', inventoryId)
    // Through the caller's own client: RLS returns only their own rows, so another user's inventory reads as none.
    const { data: inv, error: invErr } = await supabase
      .from('ghg_inventories')
      .select('id, bill_review_reading')
      .eq('id', inventoryId)
      .maybeSingle()
    if (invErr) return refuse(503, 'reading_unknown', 'We couldn\u2019t confirm how this inventory\u2019s bills are read, so this one was not read.', inventoryId)
    if (!inv) return refuse(403, 'inventory_not_found', 'That inventory is not yours.', inventoryId)
    if (inv.bill_review_reading !== 'ai') return refuse(409, 'human_read', HUMAN_READ_REFUSAL, inventoryId)

    // Fetch the file from Supabase Storage server-side, so large phone photos never travel through the JSON request
    // body (avoids HTTP 413).
    let document: string | undefined
    {
      const { data: blob, error: dlErr } = await supabase.storage.from('source-documents').download(filePath)
      if (dlErr || !blob) {
        return NextResponse.json({ error: `Could not read uploaded file from storage: ${dlErr?.message ?? 'not found'}` }, { status: 404 })
      }
      const arrayBuf = await blob.arrayBuffer()
      document = Buffer.from(arrayBuf).toString('base64')
      mediaType = blob.type || mediaType
    }
    const locationName: string | undefined = typeof body.locationName === 'string' ? body.locationName : undefined

    const requestedFuels: FuelType[] = Array.isArray(body.fuelTypes)
      ? body.fuelTypes.filter((f: any): f is FuelType => SUPPORTED_FUELS.includes(f))
      : [...SUPPORTED_FUELS]

    if (!document) {
      return NextResponse.json({ error: 'The stored document was empty.' }, { status: 400 })
    }
    if (requestedFuels.length === 0) {
      return NextResponse.json({ error: 'No supported fuelTypes requested' }, { status: 400 })
    }

    // Build the document content block. PDFs use a "document" block; images use
    // an "image" block. Both are accepted by the Anthropic API as base64 source.
    const isPdf = mediaType === 'application/pdf'
    const allowedImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!isPdf && (!mediaType || !allowedImage.includes(mediaType))) {
      return NextResponse.json(
        { error: `Unsupported mediaType "${mediaType}". Use application/pdf or one of: ${allowedImage.join(', ')}.` },
        { status: 400 },
      )
    }

    const docBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: document } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: document } }

    // ── Call the Anthropic API ───────────────────────────────────────
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 8192,
        // THINKING IS ON DELIBERATELY, AND EXPLICITLY — not left to the model default.
        // The prompt asks this route to tell a billed consumption figure apart from a cost, a rate,
        // a tax line and a raw meter reading, and to return value:null when it cannot tell. That
        // abstention is the route's safety property — a flagged blank is recoverable, a confident
        // wrong number reaches a verifier — and reasoning is what makes the judgement reliable.
        //
        // ⚠️ `{ type: 'enabled', budget_tokens: N }` IS REJECTED. A fixed thinking budget no longer
        // exists on the Opus family; the API answers 400 with: '"thinking.type.enabled" is not
        // supported for this model. Use "thinking.type.adaptive" and "output_config.effort" to
        // control thinking behavior.' Verified live against BOTH claude-opus-5 and claude-opus-4-8
        // on 5 Aug 2026 — this is not a model-choice problem, and switching back does not restore it.
        //
        // `effort` is a DEPTH DIAL, NOT A TOKEN CAP: nothing here bounds thinking to a token count.
        // What bounds the worst case is max_tokens (8192, shared by thinking AND response text) plus
        // the stop_reason guard below, which refuses a truncated read outright.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        messages: [
          {
            role: 'user',
            content: [
              docBlock,
              { type: 'text', text: buildPrompt(requestedFuels, locationName) },
            ],
          },
        ],
      }),
    })

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text()
      console.error('Anthropic API error:', anthropicRes.status, detail)
      return NextResponse.json(
        { error: 'Extraction service error', status: anthropicRes.status },
        { status: 502 },
      )
    }

    const data = await anthropicRes.json()

    // A truncated read is not a partial read — it is an unusable one. The model emits the JSON array
    // (WITH THINKING ON, this guard matters MORE, not less: thinking draws on the same max_tokens
    // budget, so a long deliberation can consume the cap before any text block is emitted. Verified
    // live on 5 Aug 2026 — a truncated thinking turn returns content ['thinking'] with NO text block
    // and stop_reason 'max_tokens'. Without this guard rawText would be '' and the customer would be
    // told the read could not be parsed, which is the wrong diagnosis: it was cut off, not malformed.)
    // in one pass, so hitting the cap severs it mid-array: what survives is a prefix of the fuels,
    // possibly with the last object cut mid-number. Parsing it would either fail as malformed or,
    // worse, succeed on a shorter array and hand the customer a subset of the figures with nothing
    // marking the absence. Refuse the whole response and say which condition was observed.
    if (data.stop_reason === 'max_tokens') {
      console.error('[concierge/extract] response truncated at max_tokens; discarding')
      return NextResponse.json(
        { error: 'The document was too long to read in full.' },
        { status: 502 },
      )
    }

    // The response content is an array of blocks; concatenate any text blocks.
    //
    // ⚠️ THE `b.type === 'text'` TEST IS LOAD-BEARING NOW THAT THINKING IS ON. With thinking the
    // response is `['thinking', 'text']`, and a thinking block has NO `.text` key at all (its field
    // is `.thinking`, empty by default because `display` defaults to "omitted"). Reading `b.text`
    // unconditionally would prepend the string "undefined" to the JSON and fail the parse — which is
    // the ghg-bot defect in CLAUDE.md (a `.map` for `.text` over blocks that had none). Verified
    // live on 5 Aug 2026: this filter yields the JSON array alone and parses cleanly.
    const rawText: string = Array.isArray(data.content)
      ? data.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('').trim()
      : ''

    // Defensive JSON parse: strip any accidental markdown fences, then parse.
    let fields: ExtractionField[]
    try {
      const cleaned = rawText.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      fields = JSON.parse(cleaned)
      if (!Array.isArray(fields)) throw new Error('Expected a JSON array')
    } catch (parseErr) {
      // BR2: METADATA ONLY. The model's text holds figures and quotes read from the bill, so it is neither logged nor
      // returned: only its length and the parser's message.
      console.error('[concierge/extract] parse failed', {
        inventoryId, length: rawText.length, error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      })
      return NextResponse.json({ error: 'Could not parse extraction result' }, { status: 502 })
    }

    // model + usage are returned for OPERATOR TELEMETRY only — the wizard logs them so the
    // per-document cost of a paid add-on is observable. They are metadata about the call, never
    // about the document: no content, no source quotes, nothing derived from what was read.
    return NextResponse.json({
      success: true,
      fields,
      model: data.model ?? null,
      usage: data.usage
        ? { input_tokens: data.usage.input_tokens ?? null, output_tokens: data.usage.output_tokens ?? null }
        : null,
    })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Concierge extract route error:', error)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
