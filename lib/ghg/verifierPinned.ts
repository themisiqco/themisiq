// lib/ghg/verifierPinned.ts
//
// T16: THE ONE READ of a pinned verifier link's documents, shared by /api/verifier-documents and its /sign route so
// the two can never disagree. Called with the service-role client, and only after validateVerifierGrant said ok.
//
// The version is read by its id AND the grant's inventory, so a token can never reach another inventory's version.
// The live inventory is read only to say which of the version's documents are still held (lib/ghg/pinnedDocuments.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { pinnedDocuments, type PinnedDocument } from './pinnedDocuments'

export type PinnedDocumentsResult =
  | { ok: true; documents: PinnedDocument[] }
  | { ok: false; reason: 'version_missing' | 'inventory_not_found' }

export async function loadPinnedDocuments(
  admin: SupabaseClient,
  grant: { inventoryId: string; inventoryVersionId: string },
): Promise<PinnedDocumentsResult> {
  const { data: version, error: vErr } = await admin
    .from('ghg_inventory_versions')
    .select('snapshot')
    .eq('id', grant.inventoryVersionId)
    .eq('inventory_id', grant.inventoryId)
    .single()
  if (vErr || !version) return { ok: false, reason: 'version_missing' }

  const { data: live, error: lErr } = await admin
    .from('ghg_inventories')
    // user_id: the owner, read here from the inventory row and never from the snapshot (sec1).
    .select('user_id, locations_data, location_log')
    .eq('id', grant.inventoryId)
    .single()
  if (lErr || !live) return { ok: false, reason: 'inventory_not_found' }

  if (typeof live.user_id !== 'string' || !live.user_id) return { ok: false, reason: 'inventory_not_found' }

  const snapshot = (version.snapshot ?? {}) as { locations_data?: unknown }
  const documents = pinnedDocuments(snapshot.locations_data, live.locations_data, live.location_log, live.user_id)
  // sec1: metadata only. Never the path, which is the thing that is wrong.
  const refused = documents.filter(d => d.status === 'unavailable').length
  if (refused > 0) console.warn('[verifier-documents] stored path outside the owner folder, not served', { inventoryId: grant.inventoryId, documents: refused })
  return { ok: true, documents }
}
