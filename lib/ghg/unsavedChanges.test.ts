// lib/ghg/unsavedChanges.test.ts
//
// T10c: unsaved work. The page is dirty whenever the inventory differs from what was last loaded or saved,
// so an upload, a confirmation, a rejection, an edit or a resolution all count; saving clears it.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inventoryFingerprint, hasUnsavedChanges, showUnsavedNudge } from './unsavedChanges'
import { emptyLocation, type ExtractedProposal, type SourceDoc } from './engine'
import { upsertResolution, usedNoneResolution } from './coverageActions'

const reading: ExtractedProposal = { fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf',
  periodStart: '2025-01-01', periodEnd: '2025-01-31', confidence: 'high', sourceQuote: '100 mcf', notes: null, status: 'extracted' }
const upload: SourceDoc = { id: 'd1', file_name: 'jan.pdf', document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: '/d1.pdf', extracted: [reading] }
const saved = { reporting_year: 2025, coverage_resolutions: [], locations: [{ ...emptyLocation('L1', 'Site A'), source_docs: [] as SourceDoc[] }] }

describe('unsaved changes (T10c)', () => {
  const baseline = inventoryFingerprint(saved)

  it('a loaded or just-saved inventory is not dirty', () => {
    expect(hasUnsavedChanges(baseline, saved)).toBe(false)
    expect(hasUnsavedChanges(baseline, JSON.parse(JSON.stringify(saved))), 'an equal copy').toBe(false)
  })

  it('uploading a bill marks the page dirty', () => {
    const uploaded = { ...saved, locations: [{ ...saved.locations[0], source_docs: [upload] }] }
    expect(hasUnsavedChanges(baseline, uploaded)).toBe(true)
  })

  it('confirming a bill marks the page dirty, and saving clears it', () => {
    const before = { ...saved, locations: [{ ...saved.locations[0], source_docs: [upload] }] }
    const afterSave = inventoryFingerprint(before)
    const confirmed = { ...before, locations: [{ ...before.locations[0], source_docs: [{ ...upload, extracted: [{ ...reading, status: 'confirmed' as const }] }] }] }
    expect(hasUnsavedChanges(afterSave, confirmed)).toBe(true)
    expect(hasUnsavedChanges(inventoryFingerprint(confirmed), confirmed), 'saved').toBe(false)
  })

  it('rejecting, editing and adding a resolution each mark the page dirty', () => {
    const rejected = { ...saved, locations: [{ ...saved.locations[0], source_docs: [{ ...upload, extracted: [{ ...reading, status: 'rejected' as const }] }] }] }
    const base = inventoryFingerprint({ ...saved, locations: [{ ...saved.locations[0], source_docs: [upload] }] })
    expect(hasUnsavedChanges(base, rejected)).toBe(true)
    const edited = { ...saved, locations: [{ ...saved.locations[0], natural_gas_amount: 42 }] }
    expect(hasUnsavedChanges(baseline, edited)).toBe(true)
    const r = usedNoneResolution({ locId: 'L1', fuelType: 'natural_gas', field: 'natural_gas_amount', fuelName: 'natural gas',
      by: { userId: 'u', email: 'e@x.example' }, at: '2026-10-02T09:00:00.000Z' })
    expect(hasUnsavedChanges(baseline, { ...saved, coverage_resolutions: upsertResolution([], r) })).toBe(true)
  })

  it('a restored draft matches nothing saved, so it is dirty', () => {
    expect(hasUnsavedChanges(null, saved)).toBe(true)
  })

  it('the nudge with Save draft shows on every step of the wizard when dirty, and not when clean', () => {
    expect(showUnsavedNudge({ mode: 'wizard', dirty: true })).toBe(true)
    expect(showUnsavedNudge({ mode: 'wizard', dirty: false })).toBe(false)
    expect(showUnsavedNudge({ mode: 'list', dirty: true })).toBe(false)
  })

  it('the page derives dirty from the baseline, warns before leaving when dirty, and gates the nudge on no step', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain('const dirty = baseline !== undefined && hasUnsavedChanges(baseline, inventory)')
    expect(page).toContain("if (mode !== 'wizard' || !dirty) return")
    expect(page).toContain("window.addEventListener('beforeunload', handler)")
    expect(page).toContain('{showUnsavedNudge({ mode, dirty }) && (')
    expect(page).not.toContain('(step === 4 || step === 5) && dirty')
    expect(page).toContain('setBaseline(savingFingerprint)')
    expect(page).not.toMatch(/setDirty\(/)
  })
})
