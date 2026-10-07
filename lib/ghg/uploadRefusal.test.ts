import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isPolicyRefusal, uploadFailureMessage, removedAll, UPLOAD_NEEDS_ACTIVE_PLAN, UPLOADS_OFF_EXPIRED, DOCUMENTS_KEPT_INACTIVE } from './uploadRefusal'

// ENF1 (L0, Oct 2026): uploads to source-documents need an active GHG plan, enforced by the storage policy. These
// tests hold the wizard's side (what it shows) and the migration's shape (what Postgres will enforce); the
// behaviour against the real database is L0-ENF1-verify.sql, which needs Supabase.

const ROOT = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const MIGRATION = read('docs/review/patches/L0-ENF1-source-documents-upload.sql')
const VERIFY = read('docs/review/patches/L0-ENF1-verify.sql')
const PAGE = read('app/dashboard/ghg/page.tsx')
const sqlCode = (s: string) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

describe('upload refusal wording', () => {
  it('UR1: a row-level security refusal says what it needs', () => {
    expect(isPolicyRefusal({ message: 'new row violates row-level security policy' })).toBe(true)
    expect(isPolicyRefusal({ message: 'Unauthorized', statusCode: '403' })).toBe(true)
    expect(isPolicyRefusal({ message: 'The resource already exists', statusCode: '409' })).toBe(false)
    expect(uploadFailureMessage('bill.pdf', { message: 'new row violates row-level security policy', statusCode: '403' }))
      .toBe(`bill.pdf didn’t upload. ${UPLOAD_NEEDS_ACTIVE_PLAN}`)
  })

  it('UR2: any other failure keeps its old wording', () => {
    expect(uploadFailureMessage('bill.pdf', { message: 'Network request failed' }))
      .toBe('bill.pdf didn’t upload: Network request failed. Please try again.')
  })

  it('UR3: the expired slot says uploads are off and the documents stay', () => {
    expect(UPLOADS_OFF_EXPIRED).toBe('Uploading documents needs an active GHG plan. Renew to upload more. The documents already here stay readable.')
    expect(DOCUMENTS_KEPT_INACTIVE).toBe('Documents stay as they were while your plan is inactive.')
  })

  it('UR3b: a remove that comes back empty is not a delete', () => {
    expect(removedAll(1, [])).toBe(false)
    expect(removedAll(1, null)).toBe(false)
    expect(removedAll(1, [{ name: 'a' }])).toBe(true)
    expect(removedAll(3, [{}, {}])).toBe(false)
  })
})

describe('the wizard upload control', () => {
  it('UR4: every upload slot turns uploads off unless the plan is active, without hiding the documents', () => {
    const slots = PAGE.match(/isPaid \? <DocUpload /g) ?? []
    expect(slots.length).toBe(11)
    expect(PAGE.match(/isPaid \? <DocUpload uploadsOff=\{ghgAccess === 'active' \? undefined : UPLOADS_OFF_EXPIRED\} /g) ?? []).toHaveLength(11)
    // With uploadsOff set, the picker and the file input are not rendered and a drop does nothing.
    expect(PAGE).toContain("if (!uploadsOff && e.dataTransfer.files && e.dataTransfer.files.length > 0) onUpload(")
    expect(PAGE).toContain('{uploadsOff ? (')
    expect(PAGE).toContain('🔒 Renew to upload')
  })

  it('UR5: a refused upload is mapped, and the handler refuses without an active plan', () => {
    expect(PAGE).toContain('uploadFailureMessage(file.name, error)')
    expect(PAGE).toContain("if (ghgAccess !== 'active') {")
  })

  it('UR5b: no Remove control without an active plan, one plain line instead, and both delete paths are guarded', () => {
    // RM1: the control is also disabled while its own delete is in flight.
    expect(PAGE).toContain("{!uploadsOff && <button disabled={removingDocIds.has(doc.id)} onClick={() => onRemove(locId, doc.id, doc.file_path, `${locIdx}:${docType}`)}")
    expect(PAGE).toContain('{uploadsOff && docs.length > 0 && (')
    // removeDoc: refuses without a plan, and treats an empty remove as not deleted while the document is still
    // listed (RM1: lib/ghg/removeStored.ts, which compares what was asked for with what Storage reports removing).
    expect(PAGE).toContain("setUploadErrors(prev => ({ ...prev, [errorKey]: DOCUMENTS_KEPT_INACTIVE }))")
    expect(PAGE).toContain("setUploadErrors(prev => ({ ...prev, [errorKey]: REMOVE_DOC_REFUSED }))")
    // removeLocation: the same for a location's documents
    expect(PAGE).toContain('alert(`This location has documents. ${DOCUMENTS_KEPT_INACTIVE}`)')
    expect(PAGE).toContain('alert(locationDeleteStorageFailed(facts, `storage removed ${removedCount} of ${paths.length} documents`))')
  })
})

describe('the ENF1 migration (static; the database run is L0-ENF1-verify.sql)', () => {
  const code = sqlCode(MIGRATION)

  // The header records execution (CLAUDE.md: the migration header is the record): RUN 4 Oct 2026, all checks passed.
  it('UR6: RUN header with DO NOT RUN AGAIN, one transaction', () => {
    expect(MIGRATION.split('\n')[2]).toContain('⚠️ RUN 4 Oct 2026')
    expect(MIGRATION).toContain('DO NOT RUN AGAIN')
    expect(VERIFY.split('\n')[2]).toContain('⚠️ RUN 4 Oct 2026')
    expect(code.trim().startsWith('begin;')).toBe(true)
    expect(code.trim().endsWith('commit;')).toBe(true)
  })

  it('UR7: the function asks only about the caller, with a fixed search_path, and anon cannot run it', () => {
    expect(code).toContain('create or replace function public.has_active_entitlement(p_module text)')
    expect(code).toContain('security definer')
    expect(code).toContain("set search_path = ''")
    expect(code).toContain('e.user_id = (select auth.uid())')
    expect(code).toContain('e.term_end > now()')
    expect(code).toContain('revoke all on function public.has_active_entitlement(text) from public, anon, authenticated;')
    expect(code).toContain('grant execute on function public.has_active_entitlement(text) to authenticated;')
  })

  it('UR8: the INSERT and DELETE policies are recreated with the plan check; viewing is untouched', () => {
    expect(code.match(/drop policy/g) ?? []).toHaveLength(2)
    expect(code).toContain('drop policy "Users can upload own documents" on storage.objects;')
    expect(code).toContain('drop policy "Users can delete own documents" on storage.objects;')
    expect(code).toContain('on storage.objects for insert to authenticated')
    expect(code).toContain('on storage.objects for delete to authenticated')
    expect(code.match(/\(\(\(select auth\.uid\(\)\)\)::text = \(storage\.foldername\(name\)\)\[1\]\)/g) ?? []).toHaveLength(2)
    expect(code.match(/and \(select public\.has_active_entitlement\('ghg'\)\)/g) ?? []).toHaveLength(2)
    expect(code).not.toContain('Users can view own documents"')
  })

  it('UR8b: account erasure is unaffected: it deletes through the Storage API with the service role key', () => {
    const erase = read('scripts/erase-account.mjs')
    expect(erase).toContain('const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY')
    expect(erase).toContain('admin = createClient(SUPABASE_URL, SERVICE_KEY')
    expect(erase).toContain('await admin.storage.from(bucket).remove(')
    expect(erase).not.toMatch(/delete from storage\.objects/i)
  })

  it('UR9: the verify script covers active, expired, never bought and the other-folder rule, and undoes itself', () => {
    for (const c of ['1 active: upload accepted', '2 expired: upload refused', '3 expired: own document still readable',
      '4 never bought: upload refused', '5 active, other folder: refused', '6 expired: delete refused, document kept',
      '7 active: delete allowed', '8 erasure (service_role): delete works without a plan']) {
      expect(VERIFY).toContain(c)
    }
    expect(VERIFY).toContain("raise exception 'enf1_undo';")
    expect(VERIFY).toContain("execute 'set local role authenticated';")
    expect(VERIFY).toContain("execute 'set local role service_role';")
    expect(VERIFY).toContain('get diagnostics v_n = row_count;')
  })
})
