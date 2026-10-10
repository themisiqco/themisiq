// lib/ghg/aiSurface.test.ts
//
// BR2 (decision 3, the strict reading): no app code sends anything read from a bill to a model, except the extract
// route, which reads the bill itself and refuses a human-read inventory. Read as source, over every non-test file in
// app/ and lib/, so a new caller fails here until it is looked at.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) }
    else if (/\.(ts|tsx|js|mjs)$/.test(e) && !/\.test\.(ts|tsx)$/.test(e)) out.push(relative(ROOT, p))
  }
  return out
}
const FILES = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const MODEL = /api\.anthropic\.com|@anthropic-ai\/sdk|api\.openai\.com/

describe('the AI surface', () => {
  it('two files call a model: the extract route and the assistant route', () => {
    expect(FILES.filter(f => MODEL.test(src(f))).sort()).toEqual(['app/api/concierge/extract/route.ts', 'app/api/ghg-bot/route.ts'])
  })
  it('only the extract route both reads the source-documents bucket and calls a model', () => {
    expect(FILES.filter(f => MODEL.test(src(f)) && src(f).includes("'source-documents'"))).toEqual(['app/api/concierge/extract/route.ts'])
  })
  it('the assistant route reads no inventory, no bill and no storage', () => {
    const bot = src('app/api/ghg-bot/route.ts')
    for (const s of ["'source-documents'", '.storage', "'ghg_inventories'", 'locations_data', 'sourceQuote', 'source_docs']) expect(bot, s).not.toContain(s)
  })
  it('the assistant receives only the step from the wizard, and sends only the step and the messages', () => {
    const page = src('app/dashboard/ghg/page.tsx')
    expect(page).toContain("function GHGBot({ currentStep, aiNotice }: { currentStep: number; aiNotice: boolean }) {")
    expect(page).toContain("<GHGBot currentStep={step} aiNotice={billReviewReading === 'human'} />")
    const send = page.slice(page.indexOf("const res = await fetch('/api/ghg-bot'"), page.indexOf("const data = await res.json().catch(() => null)"))
    expect(send).toContain('body: JSON.stringify({\n          currentStep,\n          messages: ')
    expect(send).not.toMatch(/inventory|locations|source_docs|sourceQuote/)
  })
  it('on a human-read inventory the assistant shows one line saying what it sends', async () => {
    const { ASSISTANT_AI_NOTICE } = await import('./billReviewReading')
    expect(ASSISTANT_AI_NOTICE).toBe('What you type here is sent to the AI.')
    expect(src('app/dashboard/ghg/page.tsx')).toContain('{aiNotice && <div style={{ fontSize: 11, color: \'#fff\', marginTop: 4 }}>{ASSISTANT_AI_NOTICE}</div>}')
  })
})

describe('the wizard never asks the AI to read a human-read bill', () => {
  const page = src('app/dashboard/ghg/page.tsx')
  const upload = page.slice(page.indexOf('const handleFileUpload'), page.indexOf('* Detach a source document'))
  it('the only extract call is behind reading === \'ai\', after the not-ai branch', () => {
    expect([...page.matchAll(/fetch\('\/api\/concierge\/extract'/g)]).toHaveLength(1)
    const notAi = upload.indexOf("if (CONCIERGE_DEV && reading !== 'ai') {")
    const aiBranch = upload.indexOf("} else if (CONCIERGE_DEV && reading === 'ai' && !CONCIERGE_UNREAD_DOC_TYPES.has(docType)) {")
    const call = upload.indexOf("fetch('/api/concierge/extract'")
    expect(notAi).toBeGreaterThan(-1)
    expect(notAi).toBeLessThan(aiBranch)
    expect(aiBranch).toBeLessThan(call)
    expect(upload).toContain('doc.read_note = reading === \'human\' ? HUMAN_READ_NOTE : READING_UNKNOWN_NOTE')
  })
  it('the reading is the database\'s, read through the ref the save and the load set; null is never ai', async () => {
    expect(upload).toContain('const reading = billReviewReadingRef.current')
    expect(page).toContain('setBillReviewReading(readingOf(data.bill_review_reading))')
    const { readingOf } = await import('./billReviewReading')
    expect([readingOf('ai'), readingOf('human'), readingOf(undefined), readingOf('AI'), readingOf(null)]).toEqual(['ai', 'human', null, null, null])
  })
  it('decision 2: the upload saves first and stops, saying so, when the save does not happen', () => {
    const save = upload.indexOf('invId = (await handleSave()) ?? null')
    expect(save).toBeGreaterThan(-1)
    expect(save).toBeLessThan(upload.indexOf(".from('source-documents').upload(path, file)"))
    expect(upload).toContain('UPLOAD_NEEDS_SAVED_INVENTORY')
    expect(page).toContain('const handleSave = async (): Promise<string | null | undefined> => {')
    expect(page).toContain('    return savedId\n    } finally { setIsSaving(false) }')
  })
  it('every new upload is stored under its inventory, and the extract request names it', () => {
    expect(upload).toContain('const path = buildUploadPath(session.user.id, invId, inventory.reporting_year, inventory.locations[locIdx].name, Date.now(), file.name)')
    expect(upload).toContain('body: JSON.stringify({ filePath: doc.file_path, inventoryId: invId, mediaType: file.type, locationName: inventory.locations[locIdx].name }),')
    // The extract request carries no document of its own (the route refuses one): only the stored path.
    const body = upload.slice(upload.indexOf("fetch('/api/concierge/extract'"), upload.indexOf('const json = await res.json()'))
    expect(body).not.toMatch(/\bdocument\s*:/)
  })
})
