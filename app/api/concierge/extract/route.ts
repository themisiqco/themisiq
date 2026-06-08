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
const SUPPORTED_FUELS = ['electricity', 'natural_gas', 'diesel', 'propane'] as const
type FuelType = typeof SUPPORTED_FUELS[number]

const FUEL_GUIDANCE: Record<FuelType, string> = {
  electricity:
    'Electricity consumption. Preferred unit kWh. Bills may show kWh or MWh (1 MWh = 1000 kWh) — convert to kWh and note the original. Use the billed/metered consumption for the billing period, NOT cost, NOT demand (kW), NOT the meter reading numbers themselves.',
  natural_gas:
    'Natural gas consumption. Provide BOTH a volumetric figure (m3; some bills use ft3, CCF, or therms) AND, if the bill states it, an energy figure (kWh). Use billed consumption for the period, not cost. Note the original unit if not m3.',
  diesel:
    'Diesel fuel quantity. Preferred unit litres (some records use US/UK gallons — convert to litres and note the original). Use the delivered/purchased volume.',
  propane:
    'Propane (LPG) quantity. Preferred unit litres (some records use kg or gallons — if only kg or gallons are given, return that unit and note it; do NOT guess a conversion). Use the delivered/purchased volume.',
}

interface ExtractionField {
  fuelType: FuelType
  value: number | null
  unit: string | null
  sourceQuote: string | null
  confidence: 'high' | 'medium' | 'low'
  notes: string | null
}

function buildPrompt(fuelTypes: FuelType[], locationName?: string): string {
  const fuelLines = fuelTypes.map(f => `- ${f}: ${FUEL_GUIDANCE[f]}`).join('\n')
  return `You are a careful data-entry assistant for a greenhouse-gas accounting platform. You are reading a single uploaded document (a utility bill, fuel delivery record, or similar) and extracting energy/fuel consumption figures from it.${locationName ? `\n\nThis document is for the facility/location named: "${locationName}".` : ''}

Extract ONLY the following, when present in this document:
${fuelLines}

CRITICAL RULES — this feeds a regulatory compliance report, so accuracy matters more than completeness:
1. Only report a figure you can actually see in the document. If a fuel type is not present, return value: null for it.
2. If you are not confident which number is the correct billed consumption (e.g. the bill is ambiguous, you can't tell consumption from cost or from a meter reading, or the figure is unclear), return value: null and confidence: "low" with a note explaining the ambiguity. DO NOT GUESS. A blank that gets flagged for human entry is far better than a confident wrong number.
3. For every figure you DO report, include the exact short text snippet from the document you read it from, in "sourceQuote" (under 15 words), so a human can verify it.
4. Set confidence: "high" only when the figure is clearly labelled and unambiguous; "medium" when you had to interpret or convert; "low" when uncertain.
5. Do unit conversions where instructed (e.g. MWh to kWh) and state the original in "notes". Never invent a conversion you're unsure of.

Respond with ONLY a JSON array (no prose, no markdown fences), one object per requested fuel type, each shaped exactly:
{"fuelType": "<one of: ${fuelTypes.join(', ')}>", "value": <number or null>, "unit": "<string or null>", "sourceQuote": "<string or null>", "confidence": "high"|"medium"|"low", "notes": "<string or null>"}`
}

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate as the user (same pattern as /api/materiality) ──
    const token = bearerFrom(req)
    await getAuthedClient(token)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Extraction is not configured: ANTHROPIC_API_KEY is missing on the server.' },
        { status: 503 },
      )
    }

    // ── Parse & validate input ───────────────────────────────────────
    const body = await req.json()

    const document: string | undefined = typeof body.document === 'string' ? body.document : undefined
    const mediaType: string | undefined = typeof body.mediaType === 'string' ? body.mediaType : undefined
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
        model: 'claude-opus-4-6',
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
