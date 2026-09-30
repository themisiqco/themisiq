// app/api/s211/sections.test.ts
// Saving a section through the real route: what autosave sends is what is stored, and the status is
// decided on the server by the rules in lib/s211/sectionStatus.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type FakeDb } from '../../../lib/s211/testing/fakeSupabase'

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }))
vi.mock('../../../lib/supabaseAuthed', () => ({
  getAuthedClient: async () => ({ supabase: fakeSupabase(h.db), userId: 'u1', email: undefined }),
  bearerFrom: () => 'tok',
  AuthError: class AuthError extends Error {},
}))
import { PUT } from './reports/[id]/sections/[key]/route'

const put = (key: string, body: unknown) =>
  PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'r1', key }) })
const stored = (key: string) => h.db.tables.s211_report_sections.find(r => r.section_key === key)

beforeEach(() => {
  h.db = { tables: { s211_reports: [{ id: 'r1', user_id: 'u1' }], s211_report_sections: [] }, calls: [], rpc: { s211_can_read: { data: true, error: null }, s211_can_write: { data: true, error: null } } }
})

describe('saving a section', () => {
  it('stores the content as sent, and the second save replaces the first (one row per section)', async () => {
    expect((await put('training', { content: { training_provided: 'Yes' } })).status).toBe(200)
    expect((await put('training', { content: { training_provided: 'Yes', employees_trained: 14 } })).status).toBe(200)
    expect(h.db.tables.s211_report_sections.filter(r => r.section_key === 'training')).toHaveLength(1)
    expect(stored('training')).toMatchObject({ report_id: 'r1', content: { training_provided: 'Yes', employees_trained: 14 }, status: 'in_progress' })
  })

  it('status: empty is not started; anything entered is in progress; bookkeeping keys do not count', async () => {
    await put('risks', { content: {} })
    expect(stored('risks')!.status).toBe('not_started')
    await put('report_details', { content: { _applicability: { producesGoods: 'yes' } } })
    expect(stored('report_details')!.status).toBe('not_started')
    await put('risks', { content: { risk_assessment_done: 'No' } })
    expect(stored('risks')!.status).toBe('in_progress')
  })

  it('"Mark as complete" is refused with a 422 naming the empty required fields, and nothing is marked', async () => {
    const r = await put('training', { content: { training_provided: 'Yes' }, action: 'complete' })
    expect(r.status).toBe(422)
    const body = await r.json()
    expect(body.missing).toEqual(['What the training covers, and how it is reviewed'])
    expect(body.error).toBe('This section cannot be marked complete yet. Fill in \u201CWhat the training covers, and how it is reviewed\u201D.')
    expect(stored('training')).toBeUndefined()
  })

  it('complete when every required field is filled; editing keeps it complete; emptying a required field reopens it', async () => {
    const full = { training_provided: 'Yes', training_description: 'A 90-minute course for sourcing staff.' }
    expect((await put('training', { content: full, action: 'complete' })).status).toBe(200)
    expect(stored('training')!.status).toBe('complete')
    await put('training', { content: { ...full, employees_trained: 14 } })
    expect(stored('training')!.status).toBe('complete')
    await put('training', { content: { training_provided: 'Yes', training_description: '' } })
    expect(stored('training')!.status).toBe('in_progress')
  })

  it('the client cannot set the status: a status in the body is ignored', async () => {
    await put('training', { content: { training_provided: 'Yes' }, status: 'complete' })
    expect(stored('training')!.status).toBe('in_progress')
  })

  it('reopen returns a complete section to in progress', async () => {
    await put('training', { content: { training_provided: 'No' }, action: 'complete' })
    expect(stored('training')!.status).toBe('complete')
    await put('training', { content: { training_provided: 'No' }, action: 'reopen' })
    expect(stored('training')!.status).toBe('in_progress')
  })

  it('refuses a body that is not an object, and one too large to be a section', async () => {
    expect((await put('training', { content: ['x'] })).status).toBe(400)
    expect((await put('training', { content: { t: 'x'.repeat(200_001) } })).status).toBe(413)
  })
})
