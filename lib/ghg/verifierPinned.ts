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
    .select('locations_data, location_log')
    .eq('id', grant.inventoryId)
    .single()
  if (lErr || !live) return { ok: false, reason: 'inventory_not_found' }

  const snapshot = (version.snapshot ?? {}) as { locations_data?: unknown }
  return { ok: true, documents: pinnedDocuments(snapshot.locations_data, live.locations_data, live.location_log) }
}
