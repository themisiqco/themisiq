// app/api/verifier-documents/route.ts
// ThemisIQ — GHG verifier source-document LIST. Returns metadata only: no signed URLs and no
// storage paths. Its sibling ./sign/route.ts mints ONE fresh, short-TTL URL for ONE document on
// click, re-validating the grant and consent every time.
//
// WHY NOT PRE-BAKED (this route used to batch-sign every document at page load, TTL 600s):
// the clock started when the PAGE loaded, not when the verifier clicked. An assurance provider who
// read the workings for eleven minutes and then clicked View got a dead link — and so did every
// other link on the page, simultaneously, with no recovery but a reload nobody had told them to
// perform. The on-click flow is CBAM's (app/api/cbam/verifier-documents/sign/route.ts), which moved
// off the pre-baked pattern for the same reason and cut its TTL by 30x once it could.
//
// SECURITY POSTURE:
//   • createServerClient() is the SERVICE-ROLE client: it BYPASSES RLS. validateVerifierGrant is
//     therefore the ONLY isolation, and it is shared with the sign route so the two cannot drift.
//   • The inventory id comes from the validated grant, NEVER from the request body. The client
//     sends only { token }.
//   • file_path is NOT returned. STATED HONESTLY: that does not mean paths stay server-side the way
//     they do for CBAM. get_verifier_inventory returns to_jsonb(i) — the WHOLE inventory row — so
//     locations_data[].source_docs[].file_path and workings[].source_file_paths still reach the
//     verifier's browser through that RPC. Closing that means rewriting a live SECURITY DEFINER
//     function that feeds the entire page, which is a separate change. What IS achieved here is the
//     property that matters: the client never NAMES a path, so there is no traversal surface.

import { createServerClient } from '../../../lib/supabase'
import { validateVerifierGrant, flattenSourceDocs } from '../../../lib/ghg/verifierGrant'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  let token: unknown
  try {
    const body = await req.json()
    token = body?.token
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 })
  }

  const admin = createServerClient()

  // 1. Grant + consent, both server-side and token-only.
  const grant = await validateVerifierGrant(admin, token)
  if (!grant.ok) return NextResponse.json({ error: grant.reason }, { status: 403 })

  // 2. Load ONLY this inventory's locations_data.
  const { data: inv, error: invErr } = await admin
    .from('ghg_inventories')
    .select('locations_data')
    .eq('id', grant.inventoryId)
    .single()

  if (invErr || !inv) {
    return NextResponse.json({ error: 'inventory_not_found' }, { status: 404 })
  }

  // 3. Metadata only. `id` is the key the sign route resolves back to a path; a document with no id
  // cannot be signed at all, so it comes back as null and the row renders unavailable rather than
  // as a button guaranteed to fail.
  const documents = flattenSourceDocs(inv.locations_data).map(({ doc, location }) => ({
    id: doc.id ?? null,
    file_name: doc.file_name || 'document',
    document_type: doc.document_type || 'document',
    location,
  }))

  return NextResponse.json({ documents })
}
