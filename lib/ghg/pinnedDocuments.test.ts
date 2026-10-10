// lib/ghg/pinnedDocuments.test.ts
//
// T16: which documents a pinned verifier link shows, and what it says of one deleted since the version was saved.

import { describe, it, expect } from 'vitest'
import { pinnedDocuments, deletedDocumentNote } from './pinnedDocuments'

const doc = (id: string | undefined, file: string, path = `u/inv/${file}`) => ({ id, file_name: file, file_path: path, document_type: 'electricity_bill' })
const PINNED = [{ name: 'Leeds', source_docs: [doc('d1', 'jan.pdf'), doc('d2', 'feb.pdf'), doc('d3', 'mar.pdf'), doc(undefined, 'old.pdf')] }]

describe('pinnedDocuments', () => {
  it('a document still held is available, withdrawn ones included; one with no id is left available', () => {
    const live = [{ name: 'Leeds', source_docs: [doc('d1', 'jan.pdf'), { ...doc('d2', 'feb.pdf'), status: 'withdrawn' }, doc('d3', 'mar.pdf')] }]
    const out = pinnedDocuments(PINNED, live, [], 'u')
    expect(out.map(d => [d.file_name, d.status])).toEqual([['jan.pdf', 'available'], ['feb.pdf', 'available'], ['mar.pdf', 'available'], ['old.pdf', 'available']])
    expect(out[0].file_path).toBe('u/inv/jan.pdf')
  })

  it('the documents are the pinned version\'s: one uploaded since is not listed', () => {
    const live = [{ name: 'Leeds', source_docs: [...PINNED[0].source_docs, doc('d9', 'new.pdf')] }]
    expect(pinnedDocuments(PINNED, live, [], 'u').map(d => d.id)).not.toContain('d9')
  })

  it('a document deleted since is listed as deleted, with who, when and why, and the agreed wording', () => {
    const live = [{
      name: 'Leeds', source_docs: [doc('d1', 'jan.pdf'), doc('d3', 'mar.pdf')],
      document_log: [{ kind: 'deleted', docId: 'd2', file: 'feb.pdf', at: '2026-10-05T09:00:00Z', by: { email: 'jo@acme.example' }, reason: 'Uploaded to the wrong site' }],
    }]
    const feb = pinnedDocuments(PINNED, live, [], 'u').find(d => d.id === 'd2')!
    expect(feb.status).toBe('deleted')
    expect(feb.deleted_note).toBe('feb.pdf was deleted from the inventory by jo@acme.example on 5 October 2026, after this version was saved. Reason: Uploaded to the wrong site. The file is no longer held, so it cannot be opened.')
  })

  it('a deletion recorded with its location (location_log) is found too; an unused file says nothing was used', () => {
    const live = [{ name: 'Leeds', source_docs: [doc('d1', 'jan.pdf'), doc('d2', 'feb.pdf')] }]
    const log = [{ documents: [{ kind: 'deleted_unused', docId: 'd3', file: 'mar.pdf', at: '2026-10-06T10:00:00Z', by: { email: 'sam@acme.example' } }] }]
    const mar = pinnedDocuments(PINNED, live, log, 'u').find(d => d.id === 'd3')!
    expect(mar.deleted_note).toBe('mar.pdf was deleted from the inventory by sam@acme.example on 6 October 2026, after this version was saved. Nothing from it had been used. The file is no longer held, so it cannot be opened.')
  })

  it('gone with no record of its deletion: said so, never a silent omission', () => {
    const out = pinnedDocuments(PINNED, [{ name: 'Leeds', source_docs: [] }], null, 'u')
    expect(out.filter(d => d.status === 'deleted').map(d => d.deleted_note)).toEqual([
      'jan.pdf is no longer held, so it cannot be opened. No record of its deletion was kept.',
      'feb.pdf is no longer held, so it cannot be opened. No record of its deletion was kept.',
      'mar.pdf is no longer held, so it cannot be opened. No record of its deletion was kept.',
    ])
  })

  it('sec1: a path outside the owner\'s folder is unavailable, whatever else is true of it; the owner\'s own old and new paths are not', () => {
    const planted = [{ name: 'Leeds', source_docs: [doc('d1', 'jan.pdf', 'other-user/inv-9/2025/Leeds/1_secret.pdf'), doc('d2', 'feb.pdf', 'u/2025/Leeds/2_feb.pdf'),
      doc('d3', 'mar.pdf', 'u/inv-1/2025/Leeds/3_mar.pdf'), doc('d4', 'apr.pdf', 'u2/2025/x.pdf')] }]
    const live = [{ name: 'Leeds', source_docs: planted[0].source_docs }]
    expect(pinnedDocuments(planted, live, [], 'u').map(d => [d.id, d.status])).toEqual([
      ['d1', 'unavailable'], ['d2', 'available'], ['d3', 'available'], ['d4', 'unavailable']])
  })
  it('no wording carries an em dash', () => {
    expect(deletedDocumentNote('a.pdf', null) + deletedDocumentNote('a.pdf', { kind: 'deleted' })).not.toContain(String.fromCharCode(0x2014))
  })
})
