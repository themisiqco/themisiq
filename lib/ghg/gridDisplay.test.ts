import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GRID_REGIONS_CA, GRID_REGIONS_US, GRID_EF, getGridFactor, CA_PROVINCES } from './engine'

// THE NUMBER SHOWN AT SELECTION MUST BE THE NUMBER THAT PRICES THE INVENTORY.
//
// GRID_REGIONS_CA is a module-level const built with `Math.max(...Object.keys(y))` — the NEWEST year
// in each province's table, computed once at import, with no access to any inventory. The province
// dropdown rendered `r.ef` from it, so on a 2023 Ontario inventory the customer picked "ON — 0.059"
// and the engine then priced the location at 0.03: a 1.97x gap between the figure offered and the
// figure applied, on the same screen, with nothing reconciling them.
//
// Every other factor surface — the US state dropdown, all four confirmation banners, the green setup
// label — already called getGridFactor(region, inventory.reporting_year). The CA dropdown was the one
// display path reading the year-blind constant.
//
// TWO KINDS OF TEST HERE, and they need each other:
//   - The VALUE tests prove the two sources genuinely disagree, so the guard below is not vacuous.
//   - The TEXTUAL guard proves the render site reads the year-aware one, because after the fix the
//     rendered expression IS getGridFactor(...), so a value test comparing them would be a tautology.
//     What can actually regress is someone putting `r.ef` back, and only reading the file catches that.

const ROOT = process.cwd()
const PAGE = 'app/dashboard/ghg/page.tsx'
const src = readFileSync(join(ROOT, PAGE), 'utf8')

// The CA province <select>, isolated from the US one beside it. Anchored on GRID_REGIONS_CA.map so it
// cannot accidentally match the US branch, which is a different array on the next line.
const lineContaining = (anchor: string): string => {
  const hits = src.split('\n').filter(l => l.includes(anchor))
  if (hits.length === 0) throw new Error(`no line containing '${anchor}' in ${PAGE} — the render site moved or was renamed`)
  // ⚠️ AMBIGUITY IS AN ERROR, NOT A COIN-FLIP. The first draft anchored the US dropdown on
  // 'US_STATES.map(s =>' and silently matched line 1470 — a DIFFERENT state <select> on the locations
  // step that shows no factor at all — so the assertion failed against innocent code. A guard that
  // picks the wrong line is worse than one that finds none: it reports on something nobody asked about.
  if (hits.length > 1) throw new Error(`'${anchor}' matches ${hits.length} lines in ${PAGE} — anchor is ambiguous`)
  return hits[0]
}
const caOptionLine = () => lineContaining('GRID_REGIONS_CA.map')
// Anchored on the prompt text, which appears once. 'US_STATES.map' appears twice — see above.
const usOptionLine = () => lineContaining('Select state…')

describe('the CA province dropdown shows the factor the engine will apply', () => {
  // ── THE VALUES ────────────────────────────────────────────────────────────────────────────────
  it('T1 ON at 2023 — the engine prices at 0.03, and the year-blind constant says 0.059', () => {
    // The defect, in numbers. 2023 is in the wizard's year list, so this is reachable.
    expect(getGridFactor('ON', 2023).ef).toBe(0.03)
    expect(GRID_REGIONS_CA.find(r => r.value === 'ON')!.ef).toBe(0.059)
    // Not equal — which is the whole reason the render site had to change.
    expect(getGridFactor('ON', 2023).ef).not.toBe(GRID_REGIONS_CA.find(r => r.value === 'ON')!.ef)
  })

  it('T2 ON at 2026 — the two agree, because Math.max happens to pick 2026', () => {
    // Pinned so a future GRID_EF row for 2027 makes THIS test fail too, not just T1. The constant
    // tracks the newest key; the moment a newer key lands, 2026 diverges the same way 2023 does.
    expect(getGridFactor('ON', 2026).ef).toBe(0.059)
    expect(GRID_REGIONS_CA.find(r => r.value === 'ON')!.ef).toBe(0.059)
    expect(Math.max(...Object.keys(GRID_EF.ON).map(Number)), 'newest ON key').toBe(2026)
  })

  it('T3 a single-year table is invariant — NO CA province is one, so this is asserted on US', () => {
    // ⚠️ THE REQUESTED "province with a single year key" DOES NOT EXIST. All 13 CA provinces and
    // territories carry 2024/2025/2026. Asserting one would mean inventing a fixture that does not
    // match the data, so the property is asserted where it IS real: every US state holds exactly one
    // key (2023), which is why GRID_REGIONS_US.ef has never diverged and the US dropdown never showed
    // a wrong number. If a CA province ever gains a single-key row, add it here.
    for (const p of CA_PROVINCES) {
      expect(Object.keys(GRID_EF[p]).length, `${p} is expected to be multi-year`).toBeGreaterThan(1)
    }
    for (const year of [2023, 2024, 2025, 2026]) {
      expect(getGridFactor('US_FL', year).ef, `US_FL ${year}`).toBe(0.3579)
      expect(GRID_REGIONS_US.find(r => r.value === 'US_FL')!.ef).toBe(0.3579)
    }
  })

  it('T4 the two sources diverge for EVERY province in 2023, 2024 and 2025 — and agree in 2026', () => {
    // The full matrix. This is what makes the textual guard worth having: without the fix, EVERY
    // Canadian customer on a pre-2026 inventory saw a wrong figure, not just Ontario.
    const stale = GRID_REGIONS_CA.map(r => [r.value, r.ef] as const)
    for (const [p, constEf] of stale) {
      expect(getGridFactor(p, 2026).ef, `${p} 2026 should match the newest key`).toBe(constEf)
    }
    const divergent: string[] = []
    for (const year of [2023, 2024, 2025]) {
      for (const [p, constEf] of stale) {
        if (getGridFactor(p, year).ef !== constEf) divergent.push(`${p} ${year}`)
      }
    }
    // 13 provinces x 3 years = 39 cells. QC/NL are flat enough that some coincide; assert the bulk
    // diverge rather than a fragile exact count, and assert Ontario specifically is among them.
    expect(divergent.length, 'the year-blind constant should disagree with the engine widely').toBeGreaterThan(20)
    expect(divergent).toContain('ON 2023')
    expect(divergent).toContain('ON 2025')
  })

  // ── THE RENDER SITE ───────────────────────────────────────────────────────────────────────────
  it('T5 the CA province option calls getGridFactor with the reporting year', () => {
    const line = caOptionLine()
    expect(line, 'the CA option must price through the engine, not a module-level constant')
      .toContain('getGridFactor(r.value, inventory.reporting_year).ef')
  })

  it('T6 the CA province option does NOT render the year-blind r.ef — the exact regression', () => {
    // `{r.ef}` is what was there. Matching on the rendered expression rather than the substring 'r.ef'
    // so the assertion does not trip on `getGridFactor(r.value, …).ef`, which legitimately ends in .ef.
    expect(caOptionLine(), 'r.ef is Math.max over the year keys — it ignores the reporting year')
      .not.toContain('{r.ef}')
  })

  it('T7 the CA and US dropdowns now price the same way', () => {
    // They sit on consecutive lines and did the same job by different routes. Pinning the symmetry is
    // what stops one being "fixed" back to the constant when the other is edited.
    expect(usOptionLine()).toContain("getGridFactor('US_' + s, inventory.reporting_year).ef")
    expect(caOptionLine()).toContain('inventory.reporting_year')
  })

  it('T8 scans a real file — a moved render site fails loudly instead of passing vacuously', () => {
    // caOptionLine() throws if the anchor is gone, so T5-T7 cannot go green on an empty match. This
    // asserts the file itself is the one we think it is.
    expect(src.length, `${PAGE} looks empty`).toBeGreaterThan(10_000)
    expect(src).toContain('GRID_REGIONS_CA')
    expect(() => caOptionLine()).not.toThrow()
    expect(() => usOptionLine()).not.toThrow()
  })
})
