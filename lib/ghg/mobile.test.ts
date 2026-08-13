import { describe, it, expect } from 'vitest'
import {
  MOBILE_CA, MOBILE_CA_ENTRIES, MOBILE_IPCC, MOBILE_IPCC_ENTRIES,
  IPCC_CO2_KG_PER_TJ, energyPerLitre, type MobileFactor, type MobileNonCO2Factor,
} from './mobile'

// A TRANSCRIPTION GUARD, AND TWO GUARDS AGAINST A PLAUSIBLE "FIX".
//
// These factors were typed in by hand from a PDF table. Every one of them is a number a verifier may
// cross-check against p. 541, so the first block pins all 34 against the source values — not to test
// the code, which has no logic, but to make a slipped digit fail loudly the day it happens rather than
// the day an auditor finds it.
//
// The second and third blocks guard something different: two patterns in this data that look like
// errors and are not. Diesel N2O RISES with better emission control, and gasoline CH4 does NOT fall
// monotonically with newer tiers. Both invite a well-meaning correction. A pinned value alone would
// catch the edit but not explain it, so these assert the DIRECTION and say why in the failure message.

const dieselRoad = MOBILE_CA.road.diesel
const gasRoad = MOBILE_CA.road.gasoline

// ── 1. TRANSCRIPTION ─────────────────────────────────────────────────────────────────────────────
describe('MOBILE_CA pins ECCC NIR 2026 Table A6.1-15 verbatim', () => {
  const gas = (f: MobileFactor) => [f.co2, f.ch4, f.n2o]

  it('road gasoline — LDGV, all six control technologies', () => {
    expect(gas(gasRoad.ldgv.tier_3)).toEqual([2307.3, 0.111, 0.007])
    expect(gas(gasRoad.ldgv.tier_2)).toEqual([2307.3, 0.14, 0.022])
    expect(gas(gasRoad.ldgv.tier_1)).toEqual([2307.3, 0.23, 0.47])
    expect(gas(gasRoad.ldgv.tier_0)).toEqual([2307.3, 0.32, 0.66])
    expect(gas(gasRoad.ldgv.oxidation_catalyst)).toEqual([2307.3, 0.52, 0.20])
    expect(gas(gasRoad.ldgv.non_catalytic_controlled)).toEqual([2307.3, 0.46, 0.028])
  })

  it('road gasoline — LDGT, all six control technologies', () => {
    expect(gas(gasRoad.ldgt.tier_3)).toEqual([2307.3, 0.111, 0.007])
    expect(gas(gasRoad.ldgt.tier_2)).toEqual([2307.3, 0.14, 0.022])
    expect(gas(gasRoad.ldgt.tier_1)).toEqual([2307.3, 0.24, 0.58])
    expect(gas(gasRoad.ldgt.tier_0)).toEqual([2307.3, 0.21, 0.66])
    expect(gas(gasRoad.ldgt.oxidation_catalyst)).toEqual([2307.3, 0.43, 0.20])
    expect(gas(gasRoad.ldgt.non_catalytic_controlled)).toEqual([2307.3, 0.56, 0.028])
  })

  it('road gasoline — HDGV and motorcycles', () => {
    expect(gas(gasRoad.hdgv.three_way_catalyst)).toEqual([2307.3, 0.068, 0.20])
    expect(gas(gasRoad.hdgv.non_catalytic_controlled)).toEqual([2307.3, 0.29, 0.047])
    expect(gas(gasRoad.hdgv.uncontrolled)).toEqual([2307.3, 0.49, 0.084])
    expect(gas(gasRoad.motorcycles.non_catalytic_controlled)).toEqual([2307.3, 0.77, 0.041])
    expect(gas(gasRoad.motorcycles.uncontrolled)).toEqual([2307.3, 2.3, 0.048])
  })

  it('road diesel — LDDV, LDDT, HDDV', () => {
    expect(gas(dieselRoad.lddv.advanced_control)).toEqual([2680.50, 0.051, 0.22])
    expect(gas(dieselRoad.lddv.moderate_control)).toEqual([2680.50, 0.068, 0.21])
    expect(gas(dieselRoad.lddv.uncontrolled)).toEqual([2680.50, 0.10, 0.16])
    expect(gas(dieselRoad.lddt.advanced_control)).toEqual([2680.50, 0.068, 0.22])
    expect(gas(dieselRoad.lddt.moderate_control)).toEqual([2680.50, 0.068, 0.21])
    expect(gas(dieselRoad.lddt.uncontrolled)).toEqual([2680.50, 0.085, 0.16])
    expect(gas(dieselRoad.hddv.advanced_control)).toEqual([2680.50, 0.11, 0.151])
    expect(gas(dieselRoad.hddv.moderate_control)).toEqual([2680.50, 0.14, 0.082])
    expect(gas(dieselRoad.hddv.uncontrolled)).toEqual([2680.50, 0.15, 0.075])
  })

  it('road other fuels — propane vehicles', () => {
    expect(gas(MOBILE_CA.road.other.propane_vehicles)).toEqual([1515, 0.64, 0.028])
  })

  it('off-road — all seven', () => {
    const o = MOBILE_CA.off_road
    expect(gas(o.gasoline_2_stroke)).toEqual([2307.3, 10.56, 0.013])
    expect(gas(o.gasoline_4_stroke)).toEqual([2307.3, 5.08, 0.064])
    expect(gas(o.diesel_under_19kw)).toEqual([2680.50, 0.073, 0.022])
    expect(gas(o.diesel_19kw_tier_1_3)).toEqual([2680.50, 0.073, 0.022])
    expect(gas(o.diesel_19kw_tier_4)).toEqual([2680.50, 0.073, 0.227])
    expect(gas(o.lubricating_oil_2_stroke)).toEqual([2705.0, 12.69, 0.016])
    expect(gas(o.propane)).toEqual([1515, 0.64, 0.087])
  })

  it('mobile diesel CO2 is 2680.50, NOT the stationary table\'s 2681', () => {
    // Two ECCC tables, both tracing to ECCC (2017), publishing different figures. A6.1-15 (mobile) gives
    // 2680.50 g/L; A6.1-6 (stationary refined petroleum products) rounds to 2681, which is what
    // EF_CA.diesel_litre in engine.ts carries as 2.681 kg/L. Pinned so nobody reconciles them.
    for (const c of ['lddv', 'lddt', 'hddv'] as const) {
      for (const t of Object.values(dieselRoad[c])) expect(t.co2).toBe(2680.50)
    }
    expect(MOBILE_CA.off_road.diesel_under_19kw.co2).toBe(2680.50)
  })

  it('scans all 34 entries — a broken flatten would make the metadata guard vacuous', () => {
    // MOBILE_CA_ENTRIES walks the tree recursively. If that walk silently returned [] or missed a
    // branch, test 4 below would pass over nothing. 17 gasoline + 9 diesel + 1 propane road + 7 off-road.
    expect(MOBILE_CA_ENTRIES).toHaveLength(34)
    expect(MOBILE_CA_ENTRIES.map(e => e.path)).toContain('road.diesel.hddv.advanced_control')
    expect(MOBILE_CA_ENTRIES.map(e => e.path)).toContain('off_road.lubricating_oil_2_stroke')
  })
})

// ── 2. THE COUNTER-INTUITIVE ONE ─────────────────────────────────────────────────────────────────
describe('diesel N2O RISES with better emission control — this is correct', () => {
  // NOx aftertreatment (SCR, NOx adsorbers) converts a portion of NOx to N2O as a by-product. The
  // equipment that cuts the regulated pollutant creates the greenhouse gas. Every instinct reads this
  // as a transposed row. It is not. This test exists so that instinct fails a build instead of shipping.
  const WHY =
    'ECCC A6.1-15 publishes HIGHER N2O for advanced-control diesel than uncontrolled — NOx ' +
    'aftertreatment produces N2O as a by-product. If you are "fixing" this, read lib/ghg/mobile.ts first.'

  for (const cls of ['lddv', 'lddt', 'hddv'] as const) {
    it(`${cls.toUpperCase()}: advanced > moderate > uncontrolled`, () => {
      const c = dieselRoad[cls]
      expect(c.advanced_control.n2o, WHY).toBeGreaterThan(c.uncontrolled.n2o)
      expect(c.moderate_control.n2o, WHY).toBeGreaterThan(c.uncontrolled.n2o)
      expect(c.advanced_control.n2o, WHY).toBeGreaterThanOrEqual(c.moderate_control.n2o)
    })
  }

  it('every mobile diesel N2O exceeds the stationary 0.022 g/L the engine currently reuses', () => {
    // The finding this file was written for: EF_CA.diesel_mobile_litre carries the stationary N2O
    // (0.000022 kg/L = 0.022 g/L). The LOWEST road-mobile figure here is 0.075 — 3.4x — and the
    // highest is 0.22, or 10x. Off-road diesel is excluded: it legitimately sits at 0.022.
    const roadN2O = (['lddv', 'lddt', 'hddv'] as const).flatMap(c => Object.values(dieselRoad[c]).map(t => t.n2o))
    expect(Math.min(...roadN2O)).toBeGreaterThan(0.022)
  })
})

// ── 3. THE OTHER DIRECTION ───────────────────────────────────────────────────────────────────────
describe('gasoline N2O FALLS with newer tier', () => {
  // Opposite sign to diesel, and for a different reason: modern three-way catalysts are tuned to avoid
  // the N2O-forming window that early oxidation catalysts sat in. Asserted for both light-duty classes
  // so the diesel test above cannot be mistaken for a general rule about control technology.
  for (const cls of ['ldgv', 'ldgt'] as const) {
    it(`${cls.toUpperCase()}: tier_3 < tier_2 < tier_1`, () => {
      const c = gasRoad[cls]
      expect(c.tier_3.n2o).toBeLessThan(c.tier_1.n2o)
      expect(c.tier_2.n2o).toBeLessThan(c.tier_1.n2o)
      expect(c.tier_3.n2o).toBeLessThan(c.tier_2.n2o)
    })
  }

  it('gasoline CH4 is NOT monotonic across tiers — LDGT tier_0 sits below tier_1', () => {
    // 0.21 vs 0.24, as published. Recorded so it reads as transcribed rather than mistyped: someone
    // checking "do the numbers get worse as tiers get older" will find one row that does not, and this
    // is where they learn it is the source, not us.
    expect(gasRoad.ldgt.tier_0.ch4).toBeLessThan(gasRoad.ldgt.tier_1.ch4)
    // LDGV, by contrast, IS monotonic over the same pair — so the exception is real and class-specific.
    expect(gasRoad.ldgv.tier_0.ch4).toBeGreaterThan(gasRoad.ldgv.tier_1.ch4)
  })

  it('CO2 is constant across every gasoline row — it tracks fuel carbon, not vehicle', () => {
    const co2s = (['ldgv', 'ldgt', 'hdgv', 'motorcycles'] as const)
      .flatMap(c => Object.values(gasRoad[c]).map(t => t.co2))
    expect(new Set(co2s)).toEqual(new Set([2307.3]))
  })
})

// ── 4. PROVENANCE ────────────────────────────────────────────────────────────────────────────────
describe('every factor carries its source', () => {
  it('source, table and edition are non-empty on all 34, and basis/unit are consistent', () => {
    // An unsourced factor is the failure mode this file exists to prevent: engine.ts's mobile keys are
    // wrong precisely because a value was seeded with a plausible number and an inherited citation.
    for (const { path, factor } of MOBILE_CA_ENTRIES) {
      expect(factor.source.length, `${path} has no source`).toBeGreaterThan(0)
      expect(factor.table, `${path} has no table`).toBe('A6.1-15')
      expect(factor.edition, `${path} has no edition`).toBe('NIR 2026 (1990-2024)')
      expect(factor.basis, `${path} has the wrong basis`).toBe('per_volume')
      expect(factor.unit, `${path} has the wrong unit`).toBe('g/L')
      for (const g of ['co2', 'ch4', 'n2o'] as const) {
        expect(Number.isFinite(factor[g]), `${path}.${g} is not a number`).toBe(true)
        expect(factor[g], `${path}.${g} is negative`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('the source string names the table, the page and the edition', () => {
    // A citation that omits the page sends a verifier to a 700-page PDF. Pinned so a future edit that
    // shortens it has to do so deliberately.
    const s = MOBILE_CA.road.diesel.hddv.advanced_control.source
    expect(s).toContain('A6.1-15')
    expect(s).toContain('p. 541')
    expect(s).toContain('1990–2024')
    expect(s).toContain('Environment and Climate Change Canada')
  })

  it('natural gas vehicles are NOT seeded', () => {
    // The source lists NGV at 1.9 CO2 under a "g/L fuel" header — implausible by three orders of
    // magnitude, so almost certainly g/m3 or another gaseous convention. Absent on purpose. If this
    // test fails because someone added it, they must also have resolved the unit question; delete this
    // test in the same change and say which footnote settled it.
    const paths = MOBILE_CA_ENTRIES.map(e => e.path).join(' ')
    expect(paths).not.toMatch(/natural_gas|ngv/i)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// IPCC DEFAULTS — PER ENERGY
// ═════════════════════════════════════════════════════════════════════════════════════════════════

const ipccRoad = MOBILE_IPCC.road
const ipccOff = MOBILE_IPCC.off_road

describe('MOBILE_IPCC pins 2006 IPCC Guidelines Tables 3.2.2 and 3.3.1 verbatim', () => {
  const nonCo2 = (f: MobileNonCO2Factor) => [f.ch4, f.n2o]

  it('Table 3.2.2 — road, all six fuel/control classes', () => {
    expect(nonCo2(ipccRoad.gasoline_uncontrolled)).toEqual([33, 3.2])
    expect(nonCo2(ipccRoad.gasoline_oxidation_catalyst)).toEqual([25, 8.0])
    expect(nonCo2(ipccRoad.gasoline_light_duty_1995_on)).toEqual([3.8, 5.7])
    expect(nonCo2(ipccRoad.gas_diesel_oil)).toEqual([3.9, 3.9])
    expect(nonCo2(ipccRoad.natural_gas)).toEqual([92, 3])
    expect(nonCo2(ipccRoad.lpg)).toEqual([62, 0.2])
  })

  it('Table 3.3.1 — off-road diesel is sector-invariant at 4.15 / 28.6', () => {
    for (const s of ['agriculture', 'forestry', 'industry', 'household'] as const) {
      expect(nonCo2(ipccOff.diesel[s]), `diesel.${s}`).toEqual([4.15, 28.6])
    }
  })

  it('Table 3.3.1 — off-road gasoline, 4-stroke and 2-stroke', () => {
    expect(nonCo2(ipccOff.gasoline_4_stroke.agriculture)).toEqual([80, 2])
    expect(nonCo2(ipccOff.gasoline_4_stroke.industry)).toEqual([50, 2])
    expect(nonCo2(ipccOff.gasoline_4_stroke.household)).toEqual([120, 2])
    expect(nonCo2(ipccOff.gasoline_2_stroke.agriculture)).toEqual([140, 0.4])
    expect(nonCo2(ipccOff.gasoline_2_stroke.forestry)).toEqual([170, 0.4])
    expect(nonCo2(ipccOff.gasoline_2_stroke.industry)).toEqual([130, 0.4])
    expect(nonCo2(ipccOff.gasoline_2_stroke.household)).toEqual([180, 0.4])
  })

  it('Table 1.4 — the four CO2 defaults used as derivation denominators', () => {
    expect(IPCC_CO2_KG_PER_TJ).toEqual({
      motor_gasoline: 69300, gas_diesel_oil: 74100, lpg: 63100, natural_gas: 56100,
    })
  })

  it('scans all 17 IPCC entries — a broken flatten would make the metadata guard vacuous', () => {
    // 6 road + 4 off-road diesel + 3 four-stroke (forestry absent) + 4 two-stroke.
    expect(MOBILE_IPCC_ENTRIES).toHaveLength(17)
    expect(MOBILE_IPCC_ENTRIES.map(e => e.path)).toContain('off_road.gasoline_2_stroke.forestry')
  })

  it('every IPCC entry carries BOTH sources, its table, edition and per-energy basis', () => {
    for (const { path, factor } of MOBILE_IPCC_ENTRIES) {
      expect(factor.basis, `${path} basis`).toBe('per_energy')
      expect(factor.unit, `${path} unit`).toBe('kg/TJ')
      expect(factor.edition, `${path} edition`).toBe('IPCC 2006 Guidelines')
      expect(['3.2.2', '3.3.1'], `${path} table`).toContain(factor.table)
      // BOTH sources on every entry: the CH4/N2O table it came from, AND Table 1.4, without which
      // the factor cannot reach a litre of fuel at all.
      expect(factor.source, `${path} omits its own table`).toContain(factor.table)
      expect(factor.source, `${path} omits the Table 1.4 CO2 basis`).toContain('Table 1.4')
      expect(factor.source, `${path} omits the publisher`).toContain('IPCC (2006)')
    }
  })

  it('CO2 is null on every IPCC entry — never 0, never absent', () => {
    // The distinction the MobileNonCO2Factor type exists to hold. A 0 would price road transport at
    // zero CO2; an absent key would invite `?? 0` and do the same thing one refactor later.
    for (const { path, factor } of MOBILE_IPCC_ENTRIES) {
      expect(factor.co2, `${path} CO2 should be null`).toBeNull()
      expect('co2' in factor, `${path} must carry the key explicitly`).toBe(true)
    }
  })

  it('4-stroke FORESTRY stays absent — IPCC leaves that cell blank', () => {
    // Interpolating from agriculture (80) and industry (50) would produce a number IPCC declined to
    // publish, wearing an IPCC citation. If this fails because someone added it, they must be able to
    // name the source cell it came from — delete this test in the same change and say which.
    expect('forestry' in ipccOff.gasoline_4_stroke).toBe(false)
    // And the gap is specific, not a truncated table: 2-stroke DOES publish forestry.
    expect(ipccOff.gasoline_2_stroke.forestry.ch4).toBe(170)
  })
})

describe('N2O rises with catalytic control in IPCC too — two publishers, same sign', () => {
  it('road gasoline: oxidation catalyst (8.0) exceeds uncontrolled (3.2)', () => {
    // MOBILE_CA shows this for ECCC diesel aftertreatment; IPCC shows it for road gasoline two decades
    // earlier, independently. Corroboration across sources is why the ECCC figure is not a typo.
    expect(ipccRoad.gasoline_oxidation_catalyst.n2o).toBeGreaterThan(ipccRoad.gasoline_uncontrolled.n2o)
    expect(ipccRoad.gasoline_light_duty_1995_on.n2o).toBeGreaterThan(ipccRoad.gasoline_uncontrolled.n2o)
  })

  it('CH4 falls as control improves, while N2O rises — opposite directions in one row set', () => {
    expect(ipccRoad.gasoline_light_duty_1995_on.ch4).toBeLessThan(ipccRoad.gasoline_oxidation_catalyst.ch4)
    expect(ipccRoad.gasoline_oxidation_catalyst.ch4).toBeLessThan(ipccRoad.gasoline_uncontrolled.ch4)
  })

  it('off-road diesel N2O (28.6) far exceeds road diesel (3.9)', () => {
    expect(ipccOff.diesel.industry.n2o / ipccRoad.gas_diesel_oil.n2o).toBeGreaterThan(7)
  })
})

// ── THE DERIVATION ───────────────────────────────────────────────────────────────────────────────
describe('energyPerLitre bridges the per-volume and per-energy bases', () => {
  const MJ = (tjPerL: number) => tjPerL * 1e6 // TJ -> MJ

  it('is dimensionally self-consistent: (kg/L) / (kg/TJ) = TJ/L, and round-trips', () => {
    // The strongest available check on the algebra with no external constant: multiplying the derived
    // TJ/L back by the kg/TJ denominator must return the kg/L numerator.
    const co2 = MOBILE_CA.road.diesel.hddv.advanced_control.co2 // 2680.50 g/L
    const tjPerL = energyPerLitre(co2, IPCC_CO2_KG_PER_TJ.gas_diesel_oil)
    expect(tjPerL * IPCC_CO2_KG_PER_TJ.gas_diesel_oil * 1000).toBeCloseTo(co2, 9)
  })

  it('lands in the physically expected energy range for each fuel', () => {
    // The check that catches a swapped or mis-scaled denominator — a factor-of-1000 slip or a
    // gasoline/diesel transposition leaves the algebra self-consistent but the physics absurd.
    const gasoline = MJ(energyPerLitre(MOBILE_CA.road.gasoline.ldgv.tier_3.co2, IPCC_CO2_KG_PER_TJ.motor_gasoline))
    const diesel = MJ(energyPerLitre(MOBILE_CA.road.diesel.hddv.advanced_control.co2, IPCC_CO2_KG_PER_TJ.gas_diesel_oil))
    const lpg = MJ(energyPerLitre(MOBILE_CA.road.other.propane_vehicles.co2, IPCC_CO2_KG_PER_TJ.lpg))

    expect(gasoline).toBeGreaterThan(30); expect(gasoline).toBeLessThan(36) // ~33.3 MJ/L
    expect(diesel).toBeGreaterThan(34); expect(diesel).toBeLessThan(40)     // ~36.2 MJ/L
    expect(lpg).toBeGreaterThan(21); expect(lpg).toBeLessThan(27)           // ~24.0 MJ/L

    // Physical ordering: a litre of diesel holds more energy than a litre of petrol, which holds more
    // than a litre of LPG. A transposed denominator breaks this before it breaks any range above.
    expect(diesel).toBeGreaterThan(gasoline)
    expect(gasoline).toBeGreaterThan(lpg)
  })

  it('is monotonic and scale-correct in both arguments', () => {
    expect(energyPerLitre(2000, 70000)).toBeGreaterThan(energyPerLitre(1000, 70000))
    expect(energyPerLitre(2000, 70000)).toBeLessThan(energyPerLitre(2000, 35000))
    expect(energyPerLitre(69300, 69300)).toBeCloseTo(0.001, 12) // 69300 g/L over 69300 kg/TJ = 1e-3 TJ/L
  })
})

// ── THE TWO BASES MUST NOT SILENTLY MIX ──────────────────────────────────────────────────────────
describe('the two source sets stay distinguishable', () => {
  it('no MOBILE_CA entry claims per_energy, and no MOBILE_IPCC entry claims per_volume', () => {
    expect(MOBILE_CA_ENTRIES.every(e => e.factor.basis === 'per_volume')).toBe(true)
    expect(MOBILE_IPCC_ENTRIES.every(e => e.factor.basis === 'per_energy')).toBe(true)
  })

  it('the flatten did not merge the two trees', () => {
    // isLeaf keys on ch4, which both sets have. If the two constants were ever nested under one root
    // by mistake, these counts would move and the basis test above would start seeing mixed entries.
    expect(MOBILE_CA_ENTRIES).toHaveLength(34)
    expect(MOBILE_IPCC_ENTRIES).toHaveLength(17)
    expect(MOBILE_CA_ENTRIES.every(e => e.factor.table === 'A6.1-15')).toBe(true)
    expect(MOBILE_IPCC_ENTRIES.every(e => e.factor.table !== 'A6.1-15')).toBe(true)
  })
})
