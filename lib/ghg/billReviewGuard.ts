// lib/ghg/billReviewGuard.ts
//
// BR2 + BR4: THE ONE COPY OF THE CHECKS ON A STORED BILL, shared by /api/concierge/extract (which wants an AI-read
// inventory) and /api/bill-review/submit (which wants a human-read one). Moved here from the extract route in BR4 so
// the two routes cannot disagree about which bill belongs to whom.
//
// Both run with the caller's own client (getAuthedClient: the anon key and the caller's token), so RLS returns only
// the caller's rows: another user's inventory reads as none.
//
// ⚠️ THE BROWSER CHOOSES THE INVENTORY SEGMENT of the path (lib/ghg/uploadPath.ts). These checks prove the caller owns
// the path and the inventory it names, not which of the caller's inventories a bill belongs to (register BR-01).

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseUploadPath } from './uploadPath'
import { readingOf, HUMAN_READ_REFUSAL, OLD_PATH_REFUSAL } from './billReviewReading'
import { CONCIERGE_ENTITLEMENT_KEYS, type BillReviewReading } from '../pricing'

export type GuardRefusal = { ok: false; status: 400 | 403 | 409 | 503; reason: string; error: string }
export type GuardPass = { ok: true; inventory: { id: string; reading: BillReviewReading; readingSetAt: string | null } }

export const AI_READ_REFUSAL = 'This inventory’s bills are read by AI, so they are not sent to the Bill Review team.'

/**
 * Bill Review is held, and its term has not ended. Term-aware (since 28 Sep 2026) and FAILS CLOSED: a fault here must
 * not hand out a reading. No user_id filter: RLS scopes the read to the caller's own rows, as useHasConcierge() does.
 */
export async function billReviewEntitlement(supabase: SupabaseClient): Promise<'active' | 'none' | 'error'> {
  const { data, error } = await supabase
    .from('entitlements')
    .select('module_key')
    .in('module_key', CONCIERGE_ENTITLEMENT_KEYS)
    .gt('term_end', new Date().toISOString())
    .limit(1)
  if (error) return 'error'
  return data && data.length > 0 ? 'active' : 'none'
}

/**
 * The stored bill's path is in the BR2 format, names the caller and the inventory the request names, the caller can
 * read that inventory, and its bills are read the way this route needs (`want`). Every refusal names its reason.
 */
export async function checkStoredBill(
  supabase: SupabaseClient, userId: string,
  req: { filePath: string | null | undefined; inventoryId: string | null | undefined },
  want: BillReviewReading,
): Promise<GuardPass | GuardRefusal> {
  if (!req.filePath) return { ok: false, status: 400, reason: 'no_file_path', error: 'filePath is required.' }
  if (!req.inventoryId) return { ok: false, status: 400, reason: 'no_inventory_id', error: 'inventoryId is required.' }
  const named = parseUploadPath(req.filePath)
  if (!named) return { ok: false, status: 400, reason: 'old_format_path', error: OLD_PATH_REFUSAL }
  if (named.userId !== userId) return { ok: false, status: 403, reason: 'path_other_user', error: 'That document is not yours.' }
  if (named.inventoryId !== req.inventoryId) return { ok: false, status: 403, reason: 'path_other_inventory', error: 'That document belongs to another inventory.' }
  const { data: inv, error } = await supabase
    .from('ghg_inventories')
    .select('id, bill_review_reading, bill_review_reading_set_at')
    .eq('id', req.inventoryId)
    .maybeSingle()
  if (error) return { ok: false, status: 503, reason: 'reading_unknown', error: 'We couldn’t confirm how this inventory’s bills are read, so this one was not read.' }
  if (!inv) return { ok: false, status: 403, reason: 'inventory_not_found', error: 'That inventory is not yours.' }
  const reading = readingOf(inv.bill_review_reading)
  if (reading !== want) {
    return want === 'ai'
      ? { ok: false, status: 409, reason: 'human_read', error: HUMAN_READ_REFUSAL }
      : { ok: false, status: 409, reason: 'ai_read', error: AI_READ_REFUSAL }
  }
  return { ok: true, inventory: { id: inv.id, reading, readingSetAt: typeof inv.bill_review_reading_set_at === 'string' ? inv.bill_review_reading_set_at : null } }
}
