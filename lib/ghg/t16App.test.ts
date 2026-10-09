// lib/ghg/t16App.test.ts
//
// T16: the app side of pinned verifier links. The version wording is tested as functions; the page and the wizard
// are read as source, because they are client components with no harness here, to pin what each must do.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verifierVersionLines, versionSavedLine, grantVersionLine, NEWER_VERSION_NOTICE, DELETED_FILE_QUOTE_SUFFIX } from './versionWords'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const PAGE = read('app/verify/[token]/page.tsx')
const WIZARD = read('app/dashboard/ghg/page.tsx')
const EM_DASH = String.fromCharCode(0x2014)

describe('T16 version wording', () => {
  it('the verifier reads the version line, then "Shared with you on {date}." (ruling B)', () => {
    expect(verifierVersionLines({ version_no: 2, saved_at: '2026-10-08T10:05:00Z', shared_at: '2026-10-09T11:00:00+00:00', shared_by_customer: true }))
      .toEqual(['Version 2, saved on 8 October 2026 at 10:05 UTC.', 'Shared with you on 9 October 2026.'])
  })
  it('a link pinned by the migration says so, rather than claim a share nobody made', () => {
    const lines = verifierVersionLines({ version_no: 1, saved_at: '2026-10-10T08:00:00Z', shared_at: '2026-10-10T08:00:00Z', shared_by_customer: false })
    expect(lines).toEqual(['Version 1, saved on 10 October 2026 at 08:00 UTC.', 'This link was set to show it on 10 October 2026, when verifier links began showing a saved version of the inventory instead of the live one.'])
    expect(lines.join(' ')).not.toContain('Shared with you')
  })
  it('the customer reads "Version {n}, shared on {date}" beside each link', () => {
    expect(grantVersionLine(4, '2026-10-09T23:30:00Z')).toBe('Version 4, shared on 9 October 2026')
    expect(grantVersionLine(null, null)).toBe('No saved version recorded for this link.')
  })
  it('the version line is "Version {n}, saved on {date} at {time} UTC.", from the version\'s saved_at', () => {
    expect(versionSavedLine(3, '2026-10-09T14:32:05.123Z')).toBe('Version 3, saved on 9 October 2026 at 14:32 UTC.')
    expect(versionSavedLine(3, null)).toBeNull()
  })
  it('no wording carries an em dash', () => {
    const all = [...verifierVersionLines({ version_no: 1, saved_at: 'x', shared_at: null, shared_by_customer: false }), NEWER_VERSION_NOTICE, DELETED_FILE_QUOTE_SUFFIX,
      grantVersionLine(1, null)].join(' ')
    expect(all).not.toContain(EM_DASH)
  })
})

describe('T16 verifier page', () => {
  it('consent before figures: consent_required shows the consent step with the company name, and the inventory is read again after', () => {
    expect(PAGE).toContain("const consentPending = data?.error === 'consent_required'")
    expect(PAGE).toContain('const gateCompany = data.inventory?.company_name ?? data.company_name')
    expect(PAGE).toContain('setLoadKey(k => k + 1)')
    expect(PAGE).toContain('}, [token, loadKey])')
    // The gate returns before the inventory is read for display.
    expect(PAGE.indexOf("if ((!alreadyAccepted && !accepted) || consentPending || !data.inventory) {")).toBeLessThan(PAGE.indexOf('const inv = data.inventory'))
  })
  it('version_missing has its own screen, never the expired-link verdict', () => {
    expect(PAGE.indexOf("if (data?.error === 'version_missing') {")).toBeLessThan(PAGE.indexOf('Link invalid or expired'))
  })
  it('the version line and the newer-version notice', () => {
    expect(PAGE).toContain('{verifierVersionLines(data.version).map((l, i) => <div key={i}>{l}</div>)}')
    expect(PAGE).toContain('{data.newer_version_exists && (')
    expect(PAGE).toContain('{NEWER_VERSION_NOTICE}')
  })
  it('a deleted file renders the agreed wording and no link, in the list and in the quotes', () => {
    expect(PAGE).toContain("{doc.status === 'deleted' ? (")
    expect(PAGE).toContain('{doc.deleted_note}</span>')
    expect(PAGE).toContain('docId && deletedDocIds.has(docId) ? `"${q}" ${DELETED_FILE_QUOTE_SUFFIX}`')
  })
})

describe('T16 wizard', () => {
  it('every link-issue path snapshots first: the one insert into verifier_access passes the snapshot it just took', () => {
    const inserts = [...WIZARD.matchAll(/from\('verifier_access'\)\.insert\(/g)]
    expect(inserts).toHaveLength(1)
    const before = WIZARD.slice(0, inserts[0].index)
    expect(before.lastIndexOf('const snap = await snapshotSavedVersion(inventoryId)')).toBeGreaterThan(before.lastIndexOf('const createInvite = async'))
    expect(WIZARD.slice(inserts[0].index, inserts[0].index! + 200)).toContain('inventory_version_id: snap.id,')
    // No other code in the app writes a link.
    for (const f of ['app/api/verifier-documents/route.ts', 'app/api/verifier-documents/sign/route.ts', 'app/verify/[token]/page.tsx']) {
      expect(read(f)).not.toMatch(/verifier_access'\)\s*\.(insert|upsert)/)
    }
  })
  it('the snapshot is the owner RPC', () => {
    expect(WIZARD).toContain("supabase.rpc('ghg_snapshot_inventory_version', { p_inventory_id: inventoryId })")
  })
  it('"Share the latest saved version": refused while unsaved, snapshot, then the grant updated; same version says so', () => {
    const fn = WIZARD.slice(WIZARD.indexOf('const shareLatest = async'), WIZARD.indexOf('const linkFor ='))
    expect(fn.indexOf('if (dirty) {')).toBeLessThan(fn.indexOf('snapshotSavedVersion(inventoryId)'))
    expect(fn).toContain('if (snap.id === g.inventory_version_id) {')
    expect(fn).toContain(".update({ inventory_version_id: snap.id }).eq('id', g.id)")
    expect(WIZARD).toContain("Share the latest saved version")
  })
  it('each link shows its version; the grants read the version number', () => {
    expect(WIZARD).toContain(".select('*, ghg_inventory_versions(version_no, saved_at)')")
    expect(WIZARD).toContain('{grantVersionLine(g.ghg_inventory_versions?.version_no, g.version_shared_at)}')
  })
  it('PDF export snapshots the saved row and prints its version number; no version, no package', () => {
    const fn = WIZARD.slice(WIZARD.indexOf('const generateAssurance = async'), WIZARD.indexOf('const generateExport = async'))
    expect(fn.indexOf("from('ghg_inventories').select('*')")).toBeLessThan(fn.indexOf('snapshotSavedVersion(inventoryId)'))
    expect(fn).toContain('if (!snap.ok) {')
    expect(fn).toContain('version_no: snap.version_no, version_saved_at: snap.saved_at }')
    // The version's own saved_at comes back with its id, read from the version row the snapshot returned.
    const helper = WIZARD.slice(WIZARD.indexOf('async function snapshotSavedVersion'), WIZARD.indexOf('function VerifierInvite'))
    expect(helper).toContain(".from('ghg_inventory_versions').select('version_no, saved_at').eq('id', data)")
    expect(helper).toContain('return { ok: true, id: data, version_no: ver.version_no, saved_at: ver.saved_at }')
  })
})
