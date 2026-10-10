// lib/staff/br8Page.test.ts
//
// BR8: the specialist page is protected by its data, kept out of search, and never imports the server-only staff code.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import robots from '../../app/robots'
import sitemap from '../../app/sitemap'
import { metadata } from '../../app/staff/bill-review/layout'

const PAGE = readFileSync(join(process.cwd(), 'app/staff/bill-review/page.tsx'), 'utf8')

describe('BR8 page: out of search', () => {
  it('robots disallows /staff; the sitemap does not list it; the layout says noindex, nofollow', async () => {
    const r = robots()
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules
    expect(rules.disallow).toContain('/staff')
    const urls = (await Promise.resolve(sitemap())).map(e => e.url)
    expect(urls.some(u => u.includes('/staff'))).toBe(false)
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})

describe('BR8 page: protected by its data', () => {
  it('shows nothing but a sentence until the queue route answers 200; a refusal shows the route’s own sentence', () => {
    expect(PAGE).toContain("if (phase === 'loading') return <main")
    expect(PAGE).toContain("if (phase !== 'ready' || !queue) return <main style={{ padding: '3rem', fontSize: 14, color: '#0d0d0d' }}>{message}</main>")
    expect(PAGE).toContain("if (r.status === 200 && r.body?.ok) { setQueue(r.body); setPhase('ready'); return }")
    expect(PAGE).toContain("setMessage(typeof r.body?.message === 'string' ? r.body.message")
  })
  it('every datum comes from a staff route; no server-only staff code, no service role, no direct table read', () => {
    expect(PAGE).not.toMatch(/from '[^']*lib\/staff|createServerClient|SERVICE_ROLE/)
    expect(PAGE).not.toMatch(/supabase\.from\(|\.storage\./)
    for (const route of ["api('queue')", "api('open'", "api('read'", "api('unreadable'", 'api(`reading-switch?inventoryId=', "api('reading-switch'", "api('reading-switch/inventories')"]) expect(PAGE, route).toContain(route)
    expect(PAGE).toContain('fetch(`/api/staff/bill-review/${path}`')
  })
  it('the bill is opened by its row id only; the page never sends a path', () => {
    expect(PAGE).toContain("api('open', { body: { documentId: id } })")
    expect(PAGE).not.toMatch(/filePath|file_path:/)
  })
  it('no em dash, no "chase"', () => {
    expect(PAGE).not.toContain(String.fromCharCode(0x2014))
    expect(PAGE).not.toMatch(/\bchase\b/i)
  })
})

describe('BR8: the manual script stays, as the fallback', () => {
  it('its header names the staff page as the usual way', () => {
    const s = readFileSync(join(process.cwd(), 'supabase/manual/20261015_set_bill_review_reading.sql'), 'utf8')
    expect(s).toContain('-- THE FALLBACK (BR8, ruled 10 Oct 2026). The usual way is the staff page: /staff/bill-review')
  })
  it('every figure and count is written through formatActivity: no bare raw_value, rawValue, attempts or length in the text', () => {
    expect(PAGE).toContain("import { formatActivity } from '../../../lib/ghg/workingsCells'")
    for (const bare of ['{r.raw_value}', '{rd.rawValue ??', '{e.attempts}', '({queue.waiting.length})', '${r.body.saved}', '${drafts.length} readings']) expect(PAGE, bare).not.toContain(bare)
    for (const formatted of ['{num(r.raw_value)}', 'num(rd.rawValue)', '{num(e.attempts)}', '({num(queue.waiting.length)})']) expect(PAGE, formatted).toContain(formatted)
  })
  it('the reading form: Save is disabled until every reading is complete; the dates are never prefilled', () => {
    expect(PAGE).toContain('disabled={!canSave(drafts)}')
    expect(PAGE).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/)
    expect(PAGE).not.toMatch(/blankDraft\s*=/)
  })
})
