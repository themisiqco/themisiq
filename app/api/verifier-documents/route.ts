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
//   • file_path is NOT returned. STATED HONESTLY: paths still reach the verifier's browser another
//     way. get_verifier_inventory returns the pinned version's snapshot (ghg_verifier_projection),
//     which keeps locations_data[].source_docs[] whole, file_path included, and workings rows'
//     source_file_paths. What IS achieved here is the property that matters: the client never NAMES
//     a path, so there is no traversal surface.
//   • T16: THE DOCUMENTS ARE THE PINNED VERSION'S, not today's (loadPinnedDocuments). A document the
//     version names that has been deleted since is still listed, with status 'deleted' and a note
//     saying who deleted it and when, so the verifier sees why it cannot be opened rather than a gap.

import { createServerClient } from '../../../lib/supabase'
import { validateVerifierGrant } from '../../../lib/ghg/verifierGrant'
import { loadPinnedDocuments } from '../../../lib/ghg/verifierPinned'
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

  // 2. Load ONLY the pinned version's documents, each checked against the live inventory.
  const pinned = await loadPinnedDocuments(admin, grant)
  if (!pinned.ok) return NextResponse.json({ error: pinned.reason }, { status: 404 })

  // 3. Metadata only, never file_path. `id` is the key the sign route resolves back to a path; a
  // document with no id cannot be signed at all, so it comes back as null and the row renders
  // unavailable rather than as a button guaranteed to fail.
  const documents = pinned.documents.map(d => ({
    id: d.id,
    file_name: d.file_name,
    document_type: d.document_type,
    location: d.location,
    status: d.status,
    ...(d.deleted_note ? { deleted_note: d.deleted_note } : {}),
  }))

  return NextResponse.json({ documents })
}
