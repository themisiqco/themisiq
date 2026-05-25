import { createServerClient } from '../../../lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const BUCKET = 'source-documents'
const SIGNED_URL_TTL = 600 // 10 minutes

interface SourceDoc { file_name?: string; file_path?: string; document_type?: string }
interface LocationData { name?: string; source_docs?: SourceDoc[] }

export async function POST(req: NextRequest) {
  let token: string | undefined
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

  // 1. Validate token: active + not expired
  const { data: access, error: accessErr } = await admin
    .from('verifier_access')
    .select('inventory_id, status, expires_at')
    .eq('token', token)
    .eq('status', 'active')
    .single()

  if (accessErr || !access) {
    return NextResponse.json({ error: 'invalid_or_expired', detail: accessErr?.message || 'no matching row', hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY }, { status: 403 })
  }
  if (new Date(access.expires_at) < new Date()) {
    return NextResponse.json({ error: 'invalid_or_expired' }, { status: 403 })
  }

  // 2. Load ONLY this inventory's locations_data (paths derived here, never from user input)
  const { data: inv, error: invErr } = await admin
    .from('ghg_inventories')
    .select('locations_data')
    .eq('id', access.inventory_id)
    .single()

  if (invErr || !inv) {
    return NextResponse.json({ error: 'inventory_not_found' }, { status: 404 })
  }

  // 3. Collect file paths from this inventory's documents only
  const locations: LocationData[] = Array.isArray(inv.locations_data) ? inv.locations_data : []
  const docs: { file_name: string; document_type: string; location: string; file_path: string }[] = []
  for (const loc of locations) {
    for (const d of (loc.source_docs || [])) {
      if (d.file_path) {
        docs.push({
          file_name: d.file_name || 'document',
          document_type: d.document_type || 'document',
          location: loc.name || 'Location',
          file_path: d.file_path,
        })
      }
    }
  }

  // 4. Short-lived signed URLs for each
  const results: { file_name: string; document_type: string; location: string; signed_url: string | null }[] = []
  for (const d of docs) {
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(d.file_path, SIGNED_URL_TTL)
    results.push({
      file_name: d.file_name,
      document_type: d.document_type,
      location: d.location,
      signed_url: signed?.signedUrl || null,
    })
  }

  return NextResponse.json({ documents: results })
}
