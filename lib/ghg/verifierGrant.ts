// lib/ghg/verifierGrant.ts
// SINGLE SOURCE OF TRUTH for "may this GHG verifier token see evidence right now?".
//
// WHY THIS IS SHARED: two routes need the identical answer — /api/verifier-documents (the metadata
// list) and /api/verifier-documents/sign (the per-click signed URL). Both run on the SERVICE-ROLE
// client, which BYPASSES RLS, so these checks are the ONLY isolation there is. Two hand-written
// copies of a security gate is one copy that can be loosened while the other still looks correct —
// and the loosened one is the hole. There is one copy.
//
// The gate is token-only and server-side: nothing the client sends beyond the token is trusted, and
// the inventory id comes back from here rather than from the request body.

import type { SupabaseClient } from '@supabase/supabase-js'

export type GrantDenial = 'invalid_or_expired' | 'consent_required'

export type GrantResult =
  | { ok: true; inventoryId: string }
  | { ok: false; reason: GrantDenial }

// Validates the grant AND the consent hard-gate. Callers must not issue a signed URL, or disclose
// document metadata, on anything but { ok: true }.
export async function validateVerifierGrant(
  admin: SupabaseClient,
  token: string,
): Promise<GrantResult> {
  const { data: access, error } = await admin
    .from('verifier_access')
    .select('inventory_id, status, expires_at, revoked_at, accepted_at')
    .eq('token', token)
    .eq('status', 'active')
    .single()

  if (error || !access) return { ok: false, reason: 'invalid_or_expired' }
  if (new Date(access.expires_at) < new Date() || access.revoked_at != null) {
    return { ok: false, reason: 'invalid_or_expired' }
  }

  // Consent hard-gate — authoritative, server-side, token-only. No document metadata and no signed
  // URL are released until this verifier has accepted (ToS/Privacy). Depends solely on the stored
  // accepted_at, never on anything the client sends.
  if (access.accepted_at == null) return { ok: false, reason: 'consent_required' }

  return { ok: true, inventoryId: access.inventory_id as string }
}

// The stored shape of one uploaded evidence document, as it sits inside ghg_inventories.locations_data.
// Narrower than the engine's SourceDoc on purpose: these routes need identity and location only.
export interface StoredSourceDoc {
  id?: string
  file_name?: string
  file_path?: string
  document_type?: string
}
export interface StoredLocation {
  name?: string
  source_docs?: StoredSourceDoc[]
}

// Flattens an inventory's locations_data into the documents both routes work from. ONE traversal,
// so the list route and the sign route can never disagree about which documents are in scope.
export function flattenSourceDocs(locationsData: unknown): { doc: StoredSourceDoc; location: string }[] {
  const locations: StoredLocation[] = Array.isArray(locationsData) ? locationsData : []
  const out: { doc: StoredSourceDoc; location: string }[] = []
  for (const loc of locations) {
    for (const doc of loc.source_docs || []) {
      if (doc?.file_path) out.push({ doc, location: loc.name || 'Location' })
    }
  }
  return out
}
