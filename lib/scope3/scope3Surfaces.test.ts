import { describe, it, expect, vi } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { scope3MethodDescription, scope3MethodFor, type Scope3Method } from './categoryMethods'
import { methodologyHierarchyLines, assistantScope3Basis, assistantScope3GwpClause, enteredFigureSentence } from './methodSummary'
import { KNOWN_EMISSIONS_PLACEHOLDER } from './formCopy'
import { SCOPE3_FIXTURE_CAT_DATA, SCOPE3_FIXTURE_META, SCOPE3_FIXTURE_GHG } from './scope3SurfacesFixture'

// ── THE SCOPE 3 SURFACE SNAPSHOT ─────────────────────────────────────────────────────────────────
//
// Task 0 of the Category 3 rebuild. It renders the real page component against one fixed fixture
// (scope3SurfacesFixture.ts) and compares every customer-visible surface with the committed snapshot:
// each category's figure, calculated flag, confidence label, status, coverage entry, "Where to find
// it" text, guidance text, CSV rows and factor_basis line, plus the methodology page's Scope 3 lines
// and the assistant prompt's Scope 3 clauses.
//
// ⚠️ WHY A RENDER AND NOT A RE-DERIVATION. The figures, the CSV and the saved factor_basis are built
// inside the component from closures; re-implementing them here would compare the harness with itself.
// The component is imported from a COPY written to the OS temp directory, with its relative and '@/'
// import specifiers rewritten to absolute paths, so no instrumented file is ever created inside the
// repository: `npm run build` runs `vitest run && tsc --noEmit && next build`, and a stray .tsx under
// app/ would be type-checked by the second step of that same command.
//
// ⚠️ CATEGORY 3 IS EXPECTED TO CHANGE, THE OTHER FOURTEEN ARE NOT. The snapshot keeps them apart:
//   others.*  a difference is a regression. There is no flag that updates these quietly.
//   cat3.*, shared.*  Tasks 4 to 9 change these on purpose. Record the change with
//                     `npm run harness:scope3 -- --update-cat3`, and review the diff.
// `shared` sits with cat3 because the methodology line and the assistant clause each cover several
// categories in one string, so Cat 3's new method rewrites them.

const ROOT = join(__dirname, '..', '..')
const PAGE = join(ROOT, 'app/dashboard/scope3/page.tsx')
const SNAPSHOT = join(__dirname, '__snapshots__', 'scope3-surfaces.json')
const IDS = Array.from({ length: 15 }, (_, i) => `cat${i + 1}`)
const UPDATE = process.env.SCOPE3_SNAPSHOT_UPDATE ?? ''

/** State seeded into the copy, anchor -> replacement. Each anchor must match exactly once. */
const SEEDS: [string, string][] = [
  ["const [company, setCompany] = useState('')", `const [company] = useState(${JSON.stringify(SCOPE3_FIXTURE_META.company)})`],
  ["const [sector, setSector] = useState('')", `const [sector] = useState(${JSON.stringify(SCOPE3_FIXTURE_META.sector)})`],
  ['const [reportingYear, setReportingYear] = useState(defaultReportingYear(new Date(), YEAR_FLOOR))', `const [reportingYear] = useState(${SCOPE3_FIXTURE_META.reportingYear})`],
  ["const [currency, setCurrency] = useState('USD')", `const [currency] = useState(${JSON.stringify(SCOPE3_FIXTURE_META.currency)})`],
  ['const [revenue, setRevenue] = useState(0)', `const [revenue] = useState(${SCOPE3_FIXTURE_META.revenue})`],
  ["const [countryIso2, setCountryIso2] = useState('')", `const [countryIso2] = useState(${JSON.stringify(SCOPE3_FIXTURE_META.countryIso2)})`],
  ['const [catData, setCatData] = useState<Record<string, CategoryData>>({})', 'const [catData, setCatData] = useState<Record<string, CategoryData>>((globalThis as any).__SCOPE3_FIXTURE__)'],
  ['const [boundInventoryId, setBoundInventoryId] = useState<string | null>(null)', `const [boundInventoryId] = useState<string | null>(${JSON.stringify(SCOPE3_FIXTURE_META.boundInventoryId)})`],
  ['const [ghgGwpVersion, setGhgGwpVersion] = useState<string | null>(null)', `const [ghgGwpVersion] = useState<string | null>(${JSON.stringify(SCOPE3_FIXTURE_META.ghgGwpVersion)})`],
  // Category 3's only inputs, as bindToInventory would have set them from the bound ghg_inventories row.
  ['const [boundWorkings, setBoundWorkings] = useState<unknown>(null)', 'const [boundWorkings] = useState<unknown>((globalThis as any).__SCOPE3_GHG__.workings)'],
  ['const [boundLocations, setBoundLocations] = useState<unknown>(null)', 'const [boundLocations] = useState<unknown>((globalThis as any).__SCOPE3_GHG__.locations)'],
]
/**
 * Where the capture is attached: the last statement before the component's own return.
 *
 * ⚠️ THIS IS A STRING, SO tsc NEVER SEES IT. On 20 Sep 2026 cat3Sentences gained a third argument and
 * this call was left with two: the missing gwpSentence became `undefined`, went into the sentence list,
 * and was written into the snapshot as `null` at index 7. Nothing failed at the type level and the
 * update flag recorded it happily; what caught it was the compare run, where `undefined` from a fresh
 * capture does not equal `null` from the file. S2 now asserts every captured sentence is a string, so
 * the next arity change fails with its own message rather than as a puzzling inequality.
 */
const CAPTURE_ANCHOR = '  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]'
const CAPTURE = `${CAPTURE_ANCHOR}
  ;(globalThis as any).__SCOPE3_CAPTURE__ = {
    figure: (id: string) => getCatEmissions(id),
    calculated: (id: string) => isCalculated(id),
    confidence: (id: string) => confidenceConfig[getConfidence(id)].label,
    status: (id: string) => statusOf(id),
    coverage: () => scope3Coverage(),
    basis: (id: string) => categoryBasis(id),
    meta: (id: string) => { const c = CATEGORIES.find(x => x.id === id)!; return { num: c.num, name: c.name, dataSource: (c as any).dataSource, guidance: (c as any).guidance } },
    total: totalScope3,
    // Category 3's panel, which is text rather than a figure: the workings card's summary and its
    // sentences, and the amber notice when there is no figure. Captured because this is the surface
    // Task 5 adds, and a snapshot of a figure would not show a word of it.
    cat3Workings: () => (cat3Priced && cat3Priced.status !== 'withheld'
      ? { summary: cat3WorkingsSummary(cat3Priced), sentences: cat3Sentences(cat3Priced, cat3Read, cat3GwpSentence) }
      : null),
    cat3NoFigure: () => cat3NoFigure,
    generateExport,
    saveScope3,
  }`

function instrumentedCopy(): string {
  let src = readFileSync(PAGE, 'utf8')
  src = src.replace(/from '(\.\.?\/[^']+)'/g, (_m, p: string) => `from '${resolve(dirname(PAGE), p)}'`)
  src = src.replace(/from '@\/([^']+)'/g, (_m, p: string) => `from '${join(ROOT, p)}'`)
  for (const [anchor, replacement] of SEEDS) {
    const n = src.split(anchor).length - 1
    expect(n, `the harness seeds state by anchor, and this one no longer matches exactly once: ${anchor}`).toBe(1)
    src = src.replace(anchor, replacement)
  }
  expect(src.split(CAPTURE_ANCHOR).length - 1, `the capture anchor no longer matches exactly once: ${CAPTURE_ANCHOR}`).toBe(1)
  src = src.replace(CAPTURE_ANCHOR, CAPTURE)
  const dir = mkdtempSync(join(tmpdir(), 'themisiq-scope3-harness-'))
  const file = join(dir, 'page.harness.tsx')
  writeFileSync(file, src)
  return file
}

vi.mock('react', () => ({
  useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, () => {}],
  useEffect: () => {}, useRef: (v: unknown) => ({ current: v }), default: {},
}))
vi.mock('react/jsx-runtime', () => ({ jsx: () => null, jsxs: () => null, Fragment: 'Fragment' }))
vi.mock('react/jsx-dev-runtime', () => ({ jsxDEV: () => null, Fragment: 'Fragment' }))
// ⚠️ MOCKED BY ITS RELATIVE SPECIFIER, AND HOISTED. vi.mock runs before the imports above, so the
// factory cannot use join(); and the copy imports lib/supabase by absolute path, which resolves to the
// same module id as '../supabase' does from here, so one mock covers both.
const saved = vi.hoisted(() => ({ payload: undefined as Record<string, unknown> | undefined }))
vi.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'fixture-user' } } } }) },
    from: () => ({
      upsert: async (payload: Record<string, unknown>) => { saved.payload = payload; return { error: null } },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }), order: () => ({ data: [] }) }),
    }),
  },
}))

type Capture = {
  figure: (id: string) => number
  calculated: (id: string) => boolean
  confidence: (id: string) => string
  status: (id: string) => Record<string, unknown>
  coverage: () => Record<string, unknown>
  basis: (id: string) => { basis: string; detail: string }
  meta: (id: string) => { num: number; name: string; dataSource: string; guidance: string }
  total: number
  cat3Workings: () => { summary: string; sentences: string[] } | null
  cat3NoFigure: () => string | null
  generateExport: () => void
  saveScope3: () => Promise<void>
}

async function capture(): Promise<Record<string, unknown>> {
  const file = instrumentedCopy()
  try {
    ;(globalThis as Record<string, unknown>).__SCOPE3_FIXTURE__ = SCOPE3_FIXTURE_CAT_DATA
    ;(globalThis as Record<string, unknown>).__SCOPE3_GHG__ = SCOPE3_FIXTURE_GHG
    let csv = ''
    // ⚠️ createObjectURL IS ADDED TO THE REAL URL, NOT SUBSTITUTED FOR IT. Replacing globalThis.URL
    // breaks Vite's own `new URL(...)` calls mid-run.
    const g = globalThis as Record<string, unknown>
    const realBlob = g.Blob
    g.Blob = class { constructor(parts: string[]) { csv = parts.join('') } }
    ;(URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:harness'
    ;(URL as unknown as Record<string, unknown>).revokeObjectURL = () => {}
    g.document = { createElement: () => ({ click() {} }) }
    const mod = await import(/* @vite-ignore */ file)
    void realBlob
    ;(mod.default as () => unknown)()
    const cap = (globalThis as Record<string, unknown>).__SCOPE3_CAPTURE__ as Capture
    cap.generateExport()
    await cap.saveScope3()
    const rows: string[][] = csv.split('\n').filter(l => !l.startsWith('Generated,')).map(parseCsvLine)
    const factorBasis = String((saved.payload?.factor_basis as string) ?? '').split('\n')
    const coverage = cap.coverage()
    const perCategory = (id: string) => {
      const m = cap.meta(id)
      return {
        figure_mt: Number(cap.figure(id).toFixed(6)),
        is_calculated: cap.calculated(id),
        confidence_label: cap.confidence(id),
        status: cap.status(id),
        coverage_entry: coverage[id] ?? null,
        basis: cap.basis(id),
        data_source: m.dataSource,
        guidance: m.guidance,
        csv_rows: rows.filter(r => r[0] === `Cat ${m.num}`),
        factor_basis_line: factorBasis.find(l => l.startsWith(`Cat ${m.num} `)) ?? null,
      }
    }
    const claimed = new Set(IDS.map(id => `Cat ${cap.meta(id).num}`))
    return {
      shared: {
        methodology_lines: methodologyHierarchyLines(),
        assistant_scope3: assistantScope3Basis(),
        assistant_gwp: assistantScope3GwpClause(),
        method_descriptions: Object.fromEntries(IDS.map(id => [id, scope3MethodDescription(scope3MethodFor(id) as Scope3Method)])),
        entered_figure_sentence: enteredFigureSentence(),
        known_emissions_placeholder: KNOWN_EMISSIONS_PLACEHOLDER,
        total_scope3_mt: Number(cap.total.toFixed(6)),
        csv_other_rows: rows.filter(r => !claimed.has(r[0])),
        saved_counts: {
          relevant: saved.payload?.scope3_categories_relevant ?? null,
          in_total: saved.payload?.scope3_categories_in_total ?? null,
          unpriced: saved.payload?.scope3_categories_unpriced ?? null,
          exclusions_unjustified: saved.payload?.scope3_exclusions_unjustified ?? null,
        },
      },
      // Category 3 carries its panel as well as its figures: the workings card's summary and sentences,
      // and the notice shown when there is none. Added with the panel itself (Task 5).
      cat3: { ...perCategory('cat3'), panel: cap.cat3Workings(), panel_no_figure: cap.cat3NoFigure() },
      others: Object.fromEntries(IDS.filter(id => id !== 'cat3').map(id => [id, perCategory(id)])),
    }
  } finally {
    rmSync(dirname(file), { recursive: true, force: true })
    const g = globalThis as Record<string, unknown>
    delete g.__SCOPE3_CAPTURE__
    delete g.__SCOPE3_FIXTURE__
    delete g.document
    delete (URL as unknown as Record<string, unknown>).createObjectURL
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL
  }
}

/** The CSV is written by the page as quoted fields; read it back the same way. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const fixtureHash = createHash('sha256')
  .update(JSON.stringify({ meta: SCOPE3_FIXTURE_META, cat_data: SCOPE3_FIXTURE_CAT_DATA, ghg: SCOPE3_FIXTURE_GHG }))
  .digest('hex')

describe('Scope 3 surfaces', () => {
  it('S0 every customer-visible Scope 3 surface matches the committed snapshot', async () => {
    const now = await capture()
    if (UPDATE) {
      const prev = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
      const next = UPDATE === 'all'
        ? { ...now, meta: { generated_by: 'lib/scope3/scope3Surfaces.test.ts', fixture_sha256: fixtureHash } }
        : { ...prev, cat3: now.cat3, shared: now.shared, meta: { ...prev.meta, fixture_sha256: fixtureHash } }
      writeFileSync(SNAPSHOT, JSON.stringify(next, null, 1) + '\n')
      return
    }
    const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
    // ⚠️ The fixture is hashed into the snapshot: a fixture edited without a regeneration would
    // otherwise report fifteen differences and read as a regression in the page.
    expect(snap.meta.fixture_sha256,
      'the fixture changed without a regeneration: run `npm run harness:scope3 -- --update-all`').toBe(fixtureHash)
    /** Field by field, so a failure names the surface that moved and not just the category. */
    const compare = (section: string, now_: Record<string, unknown>, then_: Record<string, unknown>, why: string) => {
      expect(Object.keys(now_).sort(), `${section}: the captured fields changed. ${why}`).toEqual(Object.keys(then_ ?? {}).sort())
      for (const field of Object.keys(now_)) {
        expect(now_[field], `${section}.${field} changed. ${why}`).toEqual((then_ ?? {})[field])
      }
    }
    const REGRESSION = 'The other fourteen categories are expected to be byte-identical through the ' +
      'Category 3 rebuild, so this is a regression unless you meant it. Nothing updates them quietly: ' +
      '`npm run harness:scope3 -- --update-all` needs a second flag.'
    const DELIBERATE = 'Tasks 4 to 9 of the Category 3 design change this on purpose. Record it with ' +
      '`npm run harness:scope3 -- --update-cat3`, then review the diff before staging it.'
    // The fourteen.
    for (const id of IDS.filter(i => i !== 'cat3')) {
      compare(`others.${id}`, (now.others as Record<string, Record<string, unknown>>)[id], snap.others?.[id], REGRESSION)
    }
    // Category 3, and the strings that cover several categories at once.
    compare('cat3', now.cat3 as Record<string, unknown>, snap.cat3, DELIBERATE)
    compare('shared', now.shared as Record<string, unknown>, snap.shared, DELIBERATE)
  })

  it('S2 every captured sentence is a string: the capture is a string of code, and tsc cannot check it', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
    const panel = snap.cat3?.panel
    expect(panel, 'Category 3 captures its panel').toBeTruthy()
    expect(typeof panel.summary).toBe('string')
    for (const [i, s] of (panel.sentences as unknown[]).entries()) {
      expect(typeof s, `panel sentence ${i} is ${JSON.stringify(s)}: an argument is missing from the ` +
        'capture in this file, which tsc does not type-check').toBe('string')
    }
    for (const row of snap.cat3.csv_rows as unknown[][]) {
      for (const [i, cell] of row.entries()) expect(typeof cell, `csv cell ${i} of ${JSON.stringify(row[0])}`).toBe('string')
    }
  })

  it('S1 no instrumented copy is left anywhere in the repository', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.next' || name === '.git') continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.harness\.tsx?$|__harness/.test(name)) offenders.push(path)
      }
    }
    walk(ROOT)
    expect(offenders, 'the harness writes its copy to the OS temp directory; nothing belongs in the repo').toEqual([])
  })
})
