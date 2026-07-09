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
// COMPLIANCE NOTE: the prompt instructs the model to return value:null /
// confidence:"low" when it is not certain, rather than guessing. For a
// compliance product a flagged blank is safer than a confident wrong number;
// the customer signs off on every figure before any report is finalised.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'

// Fuel types we currently extract, with the unit(s) the GHG inventory expects.
// Keep this list aligned with the GHG module's per-location fields.
const SUPPORTED_FUELS = ['electricity', 'natural_gas', 'diesel', 'propane', 'gasoline'] as const
type FuelType = typeof SUPPORTED_FUELS[number]

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

CRITICAL RULES — this feeds a regulatory compliance report, so accuracy matters more than completeness:
1. Only report a figure you can actually see in the document. If a fuel type is not present, return value: null for it.
2. If you are not confident which number is the correct billed consumption (e.g. the bill is ambiguous, you can't tell consumption from cost or from a meter reading, or the figure is unclear), return value: null and confidence: "low" with a note explaining the ambiguity. DO NOT GUESS. A blank that gets flagged for human entry is far better than a confident wrong number.
3. For every figure you DO report, set "sourceQuote" to a short, consistent verification string in EXACTLY this format: the consumption figure followed by its unit, as printed on the document — e.g. "585 kWh", "1,234 kWh", "2,410 m3", "18 therms". Preserve the printed number formatting (thousands separators, decimals) and the printed spelling/casing of the unit. This is a normalized value+unit string, NOT a copied line from the bill.
4. sourceQuote must contain ONLY that figure-and-unit and nothing else. Do NOT include billing dates, day counts, date ranges, monetary amounts, rates, taxes, account balances, meter-reading numbers, or surrounding words — dates belong in periodStart/periodEnd. The number in sourceQuote MUST equal "value" and the unit MUST equal "unit". If a figure is printed with no unit anywhere on the document, treat it as ambiguous: return value: null, confidence: "low", and a note — never emit a bare number as the sourceQuote.
5. Set confidence: "high" only when the figure is clearly labelled and unambiguous; "medium" when you had to interpret or convert; "low" when uncertain.
6. Do NOT convert units. Report each figure in the unit exactly as printed on the document — conversion happens later in a separate, audited step. Your job is only to read the figure and its unit faithfully.

Respond with ONLY a JSON array (no prose, no markdown fences), one object per requested fuel type, each shaped exactly:
{"fuelType": "<one of: ${fuelTypes.join(', ')}>", "value": <number or null>, "unit": "<string or null>", "periodStart": "<yyyy-mm-dd or null>", "periodEnd": "<yyyy-mm-dd or null>", "periodConfidence": "high"|"medium"|"low"|null, "sourceQuote": "<string or null>", "confidence": "high"|"medium"|"low", "notes": "<string or null>"}`
}

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate as the user (same pattern as /api/materiality) ──
    const token = bearerFrom(req)
    const { supabase } = await getAuthedClient(token)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Extraction is not configured: ANTHROPIC_API_KEY is missing on the server.' },
        { status: 503 },
      )
    }

    // ── Parse & validate input ───────────────────────────────────────
    const body = await req.json()

    let document: string | undefined = typeof body.document === 'string' ? body.document : undefined
    let mediaType: string | undefined = typeof body.mediaType === 'string' ? body.mediaType : undefined
    const filePath: string | undefined = typeof body.filePath === 'string' ? body.filePath : undefined

    // Preferred path: fetch the file from Supabase Storage server-side, so large
    // phone photos never travel through the JSON request body (avoids HTTP 413).
    // Falls back to base64 `document` in the body if no filePath is supplied.
    if (filePath) {
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
      return NextResponse.json({ error: 'document (base64) is required' }, { status: 400 })
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
        model: 'claude-opus-4-8',
        max_tokens: 1024,
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

    // The response content is an array of blocks; concatenate any text blocks.
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
      console.error('Extraction parse error:', parseErr, '\nRaw model text:', rawText)
      return NextResponse.json(
        { error: 'Could not parse extraction result', raw: rawText },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      fields,
    })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Concierge extract route error:', error)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
