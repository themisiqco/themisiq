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
// ⚠️ THE FIELD IS GONE AS OF 14 AUG 2026, AND THESE TESTS NOW COMPUTE ITS VALUE THEMSELVES.
// `.ef` was removed from GRID_REGIONS_CA and GRID_REGIONS_US — see the comment on those constants.
// Until then this file was its ONLY remaining reader, which is a bad place for a suite to be: the
// field existed to be wrong, and every test here read it to prove that it was.
//
// So the year-blind value is reconstructed below by yearBlindEf(), WHICH IS THE FORMULA THE FIELD
// CARRIED, character for character. This is strictly stronger than reading the field was:
//   - the field could be silently emptied or re-derived, and these tests would have followed it into
//     agreeing with the engine and gone green while proving nothing;
//   - the FORMULA is what a regression actually reintroduces. Nobody re-adds a stale number; they
//     re-add `Math.max(...Object.keys(y))` because it looks like "the current factor".
// Every property T1-T4 proved is proved here with the same numbers, from the same table.
//
// TWO KINDS OF TEST HERE, and they need each other:
//   - The VALUE tests (T1-T4) prove the year-blind rule genuinely disagrees with the engine, so the
//     guards below are not vacuous. If they ever coincide, T5-T7 become assertions about a
//     distinction without a difference and T2/T4 fail first, saying so.
//   - The TEXTUAL guards (T5-T7) prove the render site reads the year-aware one, because after the
//     fix the rendered expression IS getGridFactor(...), so a value test comparing them would be a
//     tautology. What can actually regress is someone reintroducing the year-blind lookup at the
//     render site, and only reading the file catches that.
//   - T9 pins the field's absence, so a reader cannot restore the shorter spelling and re-open the
//     whole thing. tsc now catches `{r.ef}` too, but a type error is not a reason to stop stating
//     the invariant that produced it.

const ROOT = process.cwd()
const PAGE = 'app/dashboard/ghg/page.tsx'
const src = readFileSync(join(ROOT, PAGE), 'utf8')

// THE DELETED FIELD'S FORMULA, and the only place it survives. `GRID_REGIONS_CA.map(p => …)` built
// each entry's `ef` as exactly this: the newest year key in the region's table, chosen with no
// reference to any inventory. Kept here so the disagreement it caused stays demonstrable.
const yearBlindEf = (region: string): number => {
  const years = GRID_EF[region]
  return years[Math.max(...Object.keys(years).map(Number))]
}

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
  it('T1 ON at 2023 — the engine prices at 0.03, and the year-blind rule says 0.059', () => {
    // THE DEFECT, IN NUMBERS, AND THE CONCRETE EVIDENCE THE GUARDS BELOW MATTER. 2023 is in the
    // wizard's year list, so this is reachable — a real customer on a real reporting year.
    expect(getGridFactor('ON', 2023).ef).toBe(0.03)
    expect(yearBlindEf('ON'), 'what the deleted GRID_REGIONS_CA.ef held for Ontario').toBe(0.059)
    // Not equal — which is the whole reason the render site had to change, and the reason the field
    // could not be left lying around afterwards.
    expect(getGridFactor('ON', 2023).ef).not.toBe(yearBlindEf('ON'))
    // 1.97x, stated as a ratio rather than left for the reader to divide. This is the size of the
    // error a customer saw, and it is what makes "the two sources disagree" a finding and not a
    // rounding note.
    expect(yearBlindEf('ON') / getGridFactor('ON', 2023).ef).toBeCloseTo(1.9667, 3)
  })

  it('T2 ON at 2026 — the two agree, because the newest key happens to BE 2026', () => {
    // Pinned so a future GRID_EF row for 2027 makes THIS test fail too, not just T1. The year-blind
    // rule tracks the newest key; the moment a newer key lands, 2026 diverges the same way 2023 does.
    expect(getGridFactor('ON', 2026).ef).toBe(0.059)
    expect(yearBlindEf('ON')).toBe(0.059)
    expect(Math.max(...Object.keys(GRID_EF.ON).map(Number)), 'newest ON key').toBe(2026)
  })

  it('T3 a single-year table is invariant — NO CA province is one, so this is asserted on US', () => {
    // ⚠️ THE REQUESTED "province with a single year key" DOES NOT EXIST. All 13 CA provinces and
    // territories carry 2024/2025/2026. Asserting one would mean inventing a fixture that does not
    // match the data, so the property is asserted where it IS real: every US state holds exactly one
    // key (2023), which is why the US dropdown never showed a wrong number even while it, too, could
    // have read a year-blind field. If a CA province ever gains a single-key row, add it here.
    for (const p of CA_PROVINCES) {
      expect(Object.keys(GRID_EF[p]).length, `${p} is expected to be multi-year`).toBeGreaterThan(1)
    }
    for (const year of [2023, 2024, 2025, 2026]) {
      expect(getGridFactor('US_FL', year).ef, `US_FL ${year}`).toBe(0.3579)
      expect(yearBlindEf('US_FL'), 'one key, so the year-blind rule cannot diverge here').toBe(0.3579)
    }
  })

  it('T4 the two sources diverge for EVERY province in 2023, 2024 and 2025 — and agree in 2026', () => {
    // The full matrix. This is what makes the textual guard worth having: without the fix, EVERY
    // Canadian customer on a pre-2026 inventory saw a wrong figure, not just Ontario.
    // Built from CA_PROVINCES + the formula, which is exactly what GRID_REGIONS_CA.map used to do —
    // so the matrix covers the same thirteen regions with the same thirteen numbers as before.
    const stale = CA_PROVINCES.map(p => [p, yearBlindEf(p)] as const)
    expect(stale, 'all thirteen provinces, as GRID_REGIONS_CA covered').toHaveLength(13)
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

  it('T6 the CA province option renders NO year-blind lookup — the exact regression', () => {
    // `{r.ef}` is what was there. Matching on the rendered expression rather than the substring 'r.ef'
    // so the assertion does not trip on `getGridFactor(r.value, …).ef`, which legitimately ends in .ef.
    expect(caOptionLine(), 'r.ef was Math.max over the year keys — it ignored the reporting year')
      .not.toContain('{r.ef}')
    // ⚠️ AND THE REGRESSION HAS CHANGED SHAPE SINCE `.ef` WAS DELETED. `{r.ef}` is now a type error,
    // so the way back in is no longer the field — it is the FORMULA, inlined at the render site by
    // someone who reads `Math.max(...Object.keys(...))` as "the current factor". That compiles.
    expect(caOptionLine(), 'no year-blind lookup may be inlined here either').not.toContain('Math.max')
    expect(caOptionLine(), 'the year comes from the inventory, not from the table').not.toContain('Object.keys')
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

  it('T9 the option lists carry NO factor at all — value and label only', () => {
    // THE FIELD IS GONE, AND THIS IS WHAT KEEPS IT GONE. A cached factor on these objects can only
    // ever be year-blind: they are module-level consts built at import, with no inventory in scope.
    // Whatever it were named, rendering it would restate the 1.97x of T1.
    for (const [name, list] of [['GRID_REGIONS_CA', GRID_REGIONS_CA], ['GRID_REGIONS_US', GRID_REGIONS_US]] as const) {
      expect(list.length, `${name} is empty`).toBeGreaterThan(0)
      for (const entry of list) {
        expect(Object.keys(entry).sort(), `${name} entries are {value,label}`).toEqual(['label', 'value'])
      }
    }
    // Named-field check as well as shape, so the failure message says WHAT came back rather than only
    // that the key count moved.
    expect((GRID_REGIONS_CA[0] as Record<string, unknown>).ef, 'ef must not return').toBeUndefined()
    expect((GRID_REGIONS_US[0] as Record<string, unknown>).ef, 'ef must not return').toBeUndefined()
    // ...and the engine file holds no year-blind derivation on those two lines either. Cheap, and it
    // catches the version that computes the factor into a differently-named field.
    const engineSrc = readFileSync(join(ROOT, 'lib/ghg/engine.ts'), 'utf8')
    for (const decl of ['const GRID_REGIONS_CA =', 'const GRID_REGIONS_US =']) {
      const line = engineSrc.split('\n').filter(l => l.includes(decl))
      expect(line, `${decl} declared once`).toHaveLength(1)
      expect(line[0], `${decl} must not compute a factor`).not.toContain('Math.max')
      expect(line[0], `${decl} must not read GRID_EF`).not.toContain('GRID_EF')
    }
  })
})
