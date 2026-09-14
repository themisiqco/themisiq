// ── SPEND FACTOR RESOLUTION — SERVER ONLY ────────────────────────────────────────────────────────
//
// ⚠️ THE .server.ts SUFFIX IS LOAD-BEARING. This module imports 2.17 MB of factor JSON —
// exiobaseFactors2019ixi.json (977 KB) and exiobaseFactors2019pxp.json (1.2 MB) — and bundlers do
// not tree-shake JSON, so importing it for one region ships all 49. It must never reach a browser
// bundle. Import it from route handlers and other server code only. lib/emissionFactors/spend.ts
// holds the types and is client-safe; this file holds the data and is not.
//
// ⚠️ THE SUPPLY-CHAIN WIZARD CANNOT USE THIS RESOLVER, AND THAT IS A DECISION RATHER THAN AN
// OVERSIGHT. app/dashboard/supply-chain/page.tsx runs scoreSupplier() synchronously on every
// keystroke; a round trip per keystroke is not viable, and the alternative — shipping the factor
// table to the client — is what the paragraph above rules out. That module keeps SECTOR_RISK until
// a BATCHED pricing action exists ("price this register", one call, many suppliers). Nothing here
// is wired into any caller yet; see the note at the foot of spend.ts.
//
// WHAT THIS FILE IS FOR. lib/emissionFactors.ts answers "what is the factor?" with a number and
// nothing else, and DEFAULT_SPEND_EF answers it with 0.5 when it does not know. This answers it
// with a number, the region actually priced, the published row it came from, its licence, every
// mismatch between the factor and the query, and whether the value sits in a tail we do not trust —
// or with nothing at all, which is a legitimate answer and the one lib/emissionFactors.ts cannot
// give.

import ixiFile from './exiobaseFactors2019ixi.json'
import pxpFile from './exiobaseFactors2019pxp.json'
import sectorsFile from './exiobaseSectors.json'
import {
  SPEND_EF_SOURCES,
  type PriceBasis,
  type SpendFactor,
  type SpendFactorCaveats,
  type SpendFactorQuery,
  type SpendFactorResult,
  type SpendFactorSource,
  type SpendFactorType,
} from './spend'

// ── ABSENCE THAT CARRIES A REASON ────────────────────────────────────────────────────────────────

/**
 * Why a resolution produced no factor, where we can say something useful about it.
 *
 * ⚠️ AN 'absent' RESULT HAS NO `factor` FIELD, DELIBERATELY. The point of the union is that a
 * reason must never become a value: a caller narrowing on `.kind` can read the explanation and
 * cannot reach a number, because there is no number to reach. Plain `null` remains the answer where
 * we have nothing to say — see the resolver contract below on which cases get which.
 */
export type SpendAbsenceReason = 'secondary_material_not_priced'

export interface SpendFactorAbsent {
  kind: 'absent'
  reason: SpendAbsenceReason
  /** Customer-renderable prose. The caller must show it; it is not optional. */
  explanation: string
  requested_region: string
  sector_key: string
}

export type SpendFactorResolution = SpendFactorResult | SpendFactorAbsent

// ── THE INDEX ────────────────────────────────────────────────────────────────────────────────────

interface RawFactor { region: string; exio_code: string; value: number; unit: string }
interface LocalBound { p5: number; p95: number; n_nonzero_regions: number }

interface SystemIndex {
  byKey: Map<string, RawFactor>
  globalLower: number
  globalUpper: number
  localBounds: Map<string, LocalBound>
  priceYear: number
  currency: string
  priceBasis: PriceBasis
  sourceVersion: string
}

/** kg CO2 eq. per MILLION EUR in the file; per ONE currency unit in a SpendFactor. See
 *  SpendFactorSource.unit_conversion in spend.ts for why this is not one of the three refused
 *  conversions. */
const PER_MILLION = 1e6

/** product_type === 'Waste' in exiobaseSectors.json. EXACT IN BOTH DIRECTIONS, verified: all 14
 *  Waste products are zero in all 49 regions, and no Waste product is non-zero anywhere.
 *
 *  ⚠️ p45.w IS DELIBERATELY NOT IN HERE AND MUST NOT BE FOLDED IN. It reads as a secondary
 *  material — "Secondary construction material for treatment, Re-processing of secondary
 *  construction material into aggregates" — and it is zero in all 49 regions like the other
 *  fourteen. But EXIOBASE types it TransportMargin, not Waste, so the waste-treatment-flow
 *  explanation is not true of how it is modelled. A plausible reason that does not describe the
 *  actual modelling is worse than no reason: it reads as authoritative and sends the reader looking
 *  in the wrong place. p45.w resolves to a plain null, as does p99 (Extra-territorial
 *  organizations and bodies), which is a Commodity and not a secondary material at all. */
const SECONDARY_MATERIAL_CODES: ReadonlySet<string> = new Set(
  (sectorsFile.products as { exio_code: string; type: string }[])
    .filter(p => p.type === 'Waste')
    .map(p => p.exio_code),
)

const SECONDARY_MATERIAL_EXPLANATION =
  'EXIOBASE models secondary materials as waste treatment flows rather than as priced commodities, ' +
  'so it publishes no spend intensity for this category in any region. That is a fact about the ' +
  'model rather than a gap in this extract: every one of these categories is zero in all 49 ' +
  'regions. Supplier-specific data is the route for recycled content — ask the supplier for the ' +
  'emissions attributable to what you bought.'

/** Built once per process, on first call. Two files of 7,987 and 9,800 rows; see the load-time
 *  note in the test. A module-level Map rather than a per-call scan because this runs in a server
 *  process that handles many requests. */
let INDEX: Map<SpendFactorType, SystemIndex> | null = null

function buildIndex(): Map<SpendFactorType, SystemIndex> {
  const out = new Map<SpendFactorType, SystemIndex>()
  for (const [type, file] of [['industry', ixiFile], ['product', pxpFile]] as const) {
    const meta = file.metadata as Record<string, any>
    const bounds = meta.reliability_bounds
    const byKey = new Map<string, RawFactor>()
    for (const f of file.factors as RawFactor[]) {
      byKey.set(`${type}|${f.region}|${f.exio_code}`, f)
    }
    // The per-sector bound map is keyed `bounds` in both files; the SIBLING keys differ
    // ('industries_with_bound' vs 'products_with_bound'), so nothing here reads them. A sector
    // absent from this map is UNBOUNDED, never in range — see resolveBounds.
    const localBounds = new Map<string, LocalBound>(
      Object.entries(bounds.per_industry.bounds as Record<string, LocalBound>),
    )
    out.set(type, {
      byKey,
      globalLower: bounds.global.lower,
      globalUpper: bounds.global.upper,
      localBounds,
      priceYear: meta.price_year,
      currency: meta.currency,
      priceBasis: meta.price_basis as PriceBasis,
      sourceVersion: meta.version,
    })
  }
  return out
}

function index(): Map<SpendFactorType, SystemIndex> {
  if (INDEX === null) INDEX = buildIndex()
  return INDEX
}

/** Exposed for the test's load-time measurement. Not part of the contract. */
export function __resetSpendIndexForTests(): void {
  INDEX = null
}

// ── BOUNDS ───────────────────────────────────────────────────────────────────────────────────────

function resolveBounds(sys: SystemIndex, code: string, value: number): {
  outside: boolean
  incomplete: boolean
} {
  const outsideGlobal = value < sys.globalLower || value > sys.globalUpper
  const local = sys.localBounds.get(code)
  if (!local) {
    // ⚠️ NOT `outside: false`. A sector with too few non-zero regions has no local bound, and the
    // absence of a check is not a passed check. The global result stands on its own and
    // `incomplete` says the other half could not be evaluated, so a caller reading
    // `outside === false` here knows it means "global passed, local unknown".
    return { outside: outsideGlobal, incomplete: true }
  }
  const outsideLocal = value < local.p5 || value > local.p95
  return { outside: outsideGlobal || outsideLocal, incomplete: false }
}

// ── RESOLUTION ───────────────────────────────────────────────────────────────────────────────────

function toFactor(sys: SystemIndex, raw: RawFactor, type: SpendFactorType): SpendFactor {
  return {
    region: raw.region,
    sector_key: raw.exio_code,
    factor_type: type,
    // The one arithmetic step between the file and the type. See PER_MILLION above.
    value: raw.value / PER_MILLION,
    unit: 'kgCO2e_per_currency_unit',
    currency: sys.currency,
    price_year: sys.priceYear,
    price_basis: sys.priceBasis,
    source_id: 'exiobase_38',
    source_version: sys.sourceVersion,
    source_classification: raw.exio_code,
  }
}

function caveatsFor(
  factor: SpendFactor, query: SpendFactorQuery, bounds: { outside: boolean; incomplete: boolean },
): SpendFactorCaveats {
  return {
    currency_mismatch: factor.currency !== query.reporting_currency,
    price_year_mismatch: factor.price_year !== query.reporting_year,
    price_basis_mismatch: factor.price_basis !== query.spend_price_basis,
    outside_reliability_bounds: bounds.outside,
    reliability_bounds_incomplete: bounds.incomplete,
  }
}

function disclosureFor(requested: string, used: string, caveats: SpendFactorCaveats): string {
  const base =
    `No factor is published for ${requested} in this dataset, so the figure uses the ` +
    `${used} factor instead. It describes a different economy and is a substitution, not a ` +
    `measurement of your supplier.`
  // ⚠️ BOTH WEAKNESSES, NAMED SEPARATELY. A borrowed factor is one kind of uncertainty; a borrowed
  // factor that is also an outlier for its own sector is a different and larger one, and reporting
  // them as a single caveat is a weaker claim than the reader is entitled to.
  if (caveats.outside_reliability_bounds) {
    return base +
      ' That substituted value also sits outside the reliability bounds recorded for this dataset,' +
      ' so it is an outlier within its own sector as well as being borrowed.'
  }
  if (caveats.reliability_bounds_incomplete) {
    return base +
      ' This sector has too few regions with published data for a per-sector reliability bound, so' +
      ' the substituted value could not be checked against one.'
  }
  return base
}

/**
 * Resolve one spend-based factor, with its provenance.
 *
 * ⚠️ RETURNS null WHEN THERE IS NO FACTOR, AND THERE IS NO DEFAULT IN THIS MODULE. That is the
 * single most important line in the file. lib/emissionFactors.ts has DEFAULT_SPEND_EF, and
 * app/dashboard/scope3/page.tsx has a literal fallback inside calcGenericSpend; both turn "we do
 * not know" into a number that renders identically to one we do know. A null forces the caller to
 * decide what to show, and "we cannot price this" is a legitimate thing to show.
 *
 * The contract:
 *   - exact region match is preferred and returns kind 'exact'
 *   - a factor from another region returns kind 'fallback', naming used_region and carrying a
 *     disclosure sentence; the discriminated union means TypeScript will not let a caller reach
 *     .factor without narrowing on .kind, so a substitution cannot pass silently
 *   - a fallback is attempted ONLY against query.fallback_regions, in the order given. The resolver
 *     invents no geography; see SpendFactorQuery.fallback_regions
 *   - the full provenance record and its source entry are returned alongside the value; a caller
 *     that wants only the number still receives the rest
 *   - currency, price-year and price-basis mismatches are REPORTED, never corrected here. FX
 *     belongs to a conversion step the customer can see; deflation belongs to a documented index;
 *     a basis conversion belongs to the publisher's own margin and tax matrices. None of the three
 *     is a coefficient this resolver may apply on its own authority
 *   - no factor at all returns null
 *
 * ⚠️ A ZERO-VALUED FACTOR RESOLVES TO null. IT IS AN ABSENT FACTOR, NOT A FACTOR OF ZERO.
 * EXIOBASE is built from national supply-use tables, and where a country or sector has insufficient
 * economic data the cell is empty rather than nil — 1,108 of 7,987 cells in the ixi extract and
 * 1,662 of 9,800 in the pxp one. The plainest case is the first cell of the archive's own x.txt:
 * Austria, paddy rice, output 0. Austria grows no rice, so there is no Austrian paddy-rice
 * intensity to publish, and returning 0.0 would report a purchase of Austrian rice as
 * emissions-free rather than as unpriceable. A customer can act on "we cannot price this" and
 * cannot act on a confident zero.
 *
 * ⚠️ ONE CLASS OF ZERO CARRIES A REASON. Where the code is a secondary-material product —
 * product_type 'Waste', 14 codes, zero in all 49 regions — the absence is a property of the model
 * rather than a gap in the data, and the caller gets kind 'absent' with prose it must render. Every
 * other zero returns plain null, including p45.w and p99: see SECONDARY_MATERIAL_CODES for why
 * those two are excluded on purpose.
 *
 * ⚠️ A FALLBACK RESULT THAT ALSO SITS OUTSIDE THE BOUNDS MUST SAY BOTH THINGS IN ITS DISCLOSURE.
 * `disclosure` on the fallback arm is required prose, and when caveats.outside_reliability_bounds
 * is true on that same result the sentence must name the substituted region AND the fact that the
 * value is in the tail. See disclosureFor.
 */
export function resolveSpendFactor(query: SpendFactorQuery): SpendFactorResolution | null {
  const sys = index().get(query.factor_type)
  if (!sys) return null

  const source: SpendFactorSource = SPEND_EF_SOURCES.exiobase_38

  const lookup = (region: string): RawFactor | undefined =>
    sys.byKey.get(`${query.factor_type}|${region}|${query.sector_key}`)

  const exact = lookup(query.region)

  // A zero is an absent factor. Checked before anything else so a zero can never become a value,
  // and so a zero in the requested region is not quietly papered over by a fallback region that
  // happens to carry one — for a secondary material every region is zero anyway.
  if (exact !== undefined && exact.value === 0) {
    if (SECONDARY_MATERIAL_CODES.has(query.sector_key)) {
      return {
        kind: 'absent',
        reason: 'secondary_material_not_priced',
        explanation: SECONDARY_MATERIAL_EXPLANATION,
        requested_region: query.region,
        sector_key: query.sector_key,
      }
    }
    return null
  }

  if (exact !== undefined) {
    const factor = toFactor(sys, exact, query.factor_type)
    return {
      kind: 'exact',
      factor,
      source,
      requested_region: query.region,
      used_region: query.region,
      caveats: caveatsFor(factor, query, resolveBounds(sys, exact.exio_code, exact.value)),
    }
  }

  // The requested region has no row at all. A secondary material still gets its reason: the code is
  // unpriced everywhere, so the answer does not depend on which region was asked for.
  if (SECONDARY_MATERIAL_CODES.has(query.sector_key)) {
    return {
      kind: 'absent',
      reason: 'secondary_material_not_priced',
      explanation: SECONDARY_MATERIAL_EXPLANATION,
      requested_region: query.region,
      sector_key: query.sector_key,
    }
  }

  for (const region of query.fallback_regions ?? []) {
    if (region === query.region) continue
    const raw = lookup(region)
    if (raw === undefined || raw.value === 0) continue
    const factor = toFactor(sys, raw, query.factor_type)
    const caveats = caveatsFor(factor, query, resolveBounds(sys, raw.exio_code, raw.value))
    return {
      kind: 'fallback',
      factor,
      source,
      requested_region: query.region,
      used_region: region,
      reason: 'no_factor_for_region',
      disclosure: disclosureFor(query.region, region, caveats),
      caveats,
    }
  }

  return null
}
