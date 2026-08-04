// app/api/verifier-documents/sign/route.ts
// ThemisIQ — GHG verifier per-document re-signing endpoint. The sibling ../route.ts returns
// documents as ids only (no pre-baked URLs); this route mints ONE fresh, short-TTL signed URL for
// ONE document on click, re-validating the grant and consent EVERY time. Mirrors
// app/api/cbam/verifier-documents/sign/route.ts.
//
// SECURITY POSTURE:
//   • createServerClient() is the SERVICE-ROLE client: it BYPASSES RLS. validateVerifierGrant is
//     therefore the ONLY isolation, and it is the SAME function the list route calls.
//   • The inventory id comes from the validated grant, NEVER from the request body. The client
//     sends only { token, docId } — never a path. The path is resolved here, from this inventory's
//     own locations_data, so a document belonging to any other inventory is unreachable by
//     construction rather than by a filter someone has to remember to write.
//   • The response is { url }. file_path does not appear in it.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase'
import { validateVerifierGrant, flattenSourceDocs } from '../../../../lib/ghg/verifierGrant'

const BUCKET = 'source-documents'   // NOT 'cbam-source-documents' — that is CBAM evidence.
const SIGNED_URL_TTL = 120          // 120s, matching CBAM. Short is affordable because the window
                                    // now starts at the CLICK, not at page load.

export async function POST(req: NextRequest) {
  let token: unknown
  let docId: unknown
  try {
    const body = await req.json()
    token = body?.token
    docId = body?.docId
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 })
  }
  if (!docId || typeof docId !== 'string') {
    return NextResponse.json({ error: 'missing_doc_id' }, { status: 400 })
  }

  const admin = createServerClient()

  try {
    // ── 1. Grant + consent, re-checked on every click. A grant revoked since page load stops
    // working here, which is the whole point of not pre-baking. ──
    const grant = await validateVerifierGrant(admin, token)
    if (!grant.ok) return NextResponse.json({ error: grant.reason }, { status: 403 })

    // ── 2. Load ONLY this inventory's documents. ──
    const { data: inv, error: invErr } = await admin
      .from('ghg_inventories')
      .select('locations_data')
      .eq('id', grant.inventoryId)
      .single()
    if (invErr || !inv) {
      return NextResponse.json({ error: 'inventory_not_found' }, { status: 404 })
    }

    // ── 3. Resolve the id to a path, within this inventory only. ──
    //
    // AMBIGUITY IS REFUSED, NOT RESOLVED. Document ids are client-generated at upload, and the
    // original form was a bare `Date.now().toString()` — two files uploaded in the same millisecond
    // could take the SAME id. (The current form appends a random suffix; old inventories still hold
    // the old ids.) Serving "whichever matched first" would hand an assurance provider a document
    // that is not the one behind the figure they clicked, and nothing on screen would say so. A
    // verifier can act on a link that fails; they cannot act on one that quietly lies.
    const matches = flattenSourceDocs(inv.locations_data).filter(d => d.doc.id === docId)
    if (matches.length === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (matches.length > 1) {
      return NextResponse.json({ error: 'ambiguous_document' }, { status: 409 })
    }
    const filePath = matches[0].doc.file_path
    if (!filePath) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // ── 4. Mint a short-TTL signed URL. file_path never appears in the response. ──
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(filePath, SIGNED_URL_TTL)
    if (signErr || !signed?.signedUrl) {
      console.error('GHG verifier-sign createSignedUrl error:', signErr)
      return NextResponse.json({ error: 'sign_failed' }, { status: 500 })
    }

    return NextResponse.json({ url: signed.signedUrl })
  } catch (error) {
    console.error('GHG verifier-sign route error:', error)
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 })
  }
}
