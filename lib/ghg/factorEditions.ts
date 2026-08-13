// ── WHICH EMISSION-FACTOR EDITIONS PRICED THIS INVENTORY ─────────────────────────────────────────
//
// A UK customer whose 2025 inventory was priced with DEFRA 2025 and whose 2026 was priced with
// DEFRA 2026 sees Scope 2 fall by roughly a quarter, with nothing on any surface saying the factors
// moved. Part of that fall is real decarbonisation and part is a published revision, and today
// nothing on the record separates them — so the trend line invites the customer to claim both as
// performance, and gives a verifier no way to check. ISO 14064-3:2019 7.1.4.9(b) already obliges the
// verifier to confirm which factor set the figures use; gwp_version answers that for GWP and nothing
// answers it for the factors themselves.
//
// This module builds that record: `ghg_inventories.factor_editions`, keyed by jurisdiction then by
// family, each holding { source, edition }. Pure — no React, no Supabase, no clock. Computed at save
// from the same locations and reporting_year that produced the saved totals, so the editions and the
// figures cannot describe different calculations.
//
// ⚠️ THE ELECTRICITY EDITION COMES FROM getGridFactor().usedYear, NOT FROM THE CITATION STRING.
// This is the whole point of the module and the one thing that is easy to get backwards.
// EF_SOURCES.electricity_uk is DELIBERATELY year-neutral ("UK DEFRA/DESNZ GHG Conversion Factors for
// Company Reporting", no year) because GRID_EF.UK holds 2025 AND 2026 — naming one edition in the
// citation would be wrong for the other, and would contradict factor_vintage on the workings row.
// So gridSource() returns the SAME string for a 2025 and a 2026 UK inventory. Storing its output as
// the edition would record the two years identically and record nothing about the one divergence
// this column exists to expose. usedYear is the year the lookup actually RESOLVED to — including
// when it resolves backward or forward off the end of the table — and it is the only value that
// tells them apart.
//   Combustion is the opposite case, and the asymmetry is deliberate on both sides: EF_UK is a
// single edition refreshed wholesale, so combustionSource() carries its year honestly.

import {
  EF_SOURCES, combustionSource, gridSource, getGridFactor, isResolvedGridRegion, streamState,
} from './engine'
import type { Location } from './engine'

/**
 * The FACTOR-TABLE identity a location resolves to — NOT its country.
 *
 * ⚠️ DE AND FR ARE BOTH 'EU', AND THAT IS THE POINT. loc.country distinguishes them; the factor
 * tables do not. pickEF routes every EU_COUNTRIES member to the same EF_EU combustion table, and
 * gridSource routes every one of them to the same EEA (2023) citation. A key that split them would
 * record a difference that does not exist — two entries a verifier would read as two editions, when
 * one document priced both. Their GRID_EF *values* differ (EU_DE and EU_FR are separate rows), but a
 * value is not an edition: both rows come from the same EEA publication.
 *
 * By the same rule an unlisted country is 'US' and not a key of its own: pickEF falls back to the US
 * EPA table for Japan, so a Japanese location IS priced by US EPA factors and recording that is the
 * truthful answer, not a rounding of it.
 */
export type FactorJurisdiction = 'US' | 'CA' | 'UK' | 'EU' | 'AU' | 'NZ'

/** The two factor families that are country-routed. See FAMILIES_NOT_COVERED below for the rest. */
export type FactorFamily = 'combustion' | 'electricity'

export type FactorEdition = {
  /** The citation as the workings row and the assurance PDF print it — engine-derived, never retyped. */
  source: string
  /** Short edition label. Combustion: declared in COMBUSTION_EDITION. Electricity: usedYear. */
  edition: string
}

/**
 * The stored shape. Partial on BOTH levels, deliberately:
 *   - a jurisdiction key exists only if some location in it priced something;
 *   - a family key exists only if that family priced something in that jurisdiction.
 * An absent key means "nothing here was priced by this table", which is a different claim from an
 * edition of "none" and must stay distinguishable from it.
 */
export type FactorEditions = Partial<Record<FactorJurisdiction, Partial<Record<FactorFamily, FactorEdition>>>>

// ── WHAT COUNTS AS COMBUSTION ────────────────────────────────────────────────────────────────────
// The six Scope 1 streams priced through pickEF, i.e. the ones combustionSource() actually cites.
//
// THREE STREAMS ARE DELIBERATELY ABSENT, and none of the omissions is an oversight:
//   refrigerants    — priced from REFRIGERANT_GWP, a GWP table, not a combustion factor. Its edition
//                     is the AR set, which gwp_version already records.
//   purchased_steam — priced from EF.steam_mmbtu, which is the US EPA table for EVERY country;
//                     pickEF is never consulted. Filing a UK steam location under "DEFRA 2026" would
//                     be a wrong attribution, which is exactly the class of defect combustionSource
//                     was introduced to fix.
//   electricity     — its own family, resolved by year rather than by table.
const COMBUSTION_STREAMS = [
  'natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual', 'mobile',
] as const

/** Recorded here so the omissions above are greppable from the consuming code, not just commented. */
export const FAMILIES_NOT_COVERED = ['refrigerants', 'purchased_steam'] as const

// ── THE JURISDICTION LOOKUP ──────────────────────────────────────────────────────────────────────
//
// KEYED ON THE EF_SOURCES CONSTANTS, NOT ON COUNTRY CODES — structurally, so it cannot drift from
// the engine's own country routing. lib/vsme/b3Energy.ts once carried `jurisdictionOf()`, a
// hand-maintained second copy of pickEF's country branching, and it was deleted for exactly that
// reason: it mapped US/CA/UK/EU only and threw on Australia. Re-deriving the branch here would
// reintroduce the same class of bug one module along.
//
// Because the key is the citation the engine ACTUALLY returned, adding a country to EU_COUNTRIES
// needs no change here at all: combustionSource routes it to combustion_eu and it lands under 'EU'
// automatically. Only a genuinely NEW jurisdiction — a seventh combustion_* / electricity_* pair in
// EF_SOURCES — requires an edit, and factorEditions.test.ts fails against EF_SOURCES itself when one
// appears, so it cannot land silently.
const CITATIONS: Record<FactorJurisdiction, { combustion: string; electricity: string }> = {
  US: { combustion: EF_SOURCES.combustion,    electricity: EF_SOURCES.electricity_us },
  CA: { combustion: EF_SOURCES.combustion_ca, electricity: EF_SOURCES.electricity_ca },
  UK: { combustion: EF_SOURCES.combustion_uk, electricity: EF_SOURCES.electricity_uk },
  EU: { combustion: EF_SOURCES.combustion_eu, electricity: EF_SOURCES.electricity_eu },
  AU: { combustion: EF_SOURCES.combustion_au, electricity: EF_SOURCES.electricity_au },
  NZ: { combustion: EF_SOURCES.combustion_nz, electricity: EF_SOURCES.electricity_nz },
}

const JURISDICTIONS = Object.keys(CITATIONS) as FactorJurisdiction[]

/**
 * The jurisdiction a location's factors come from, resolved from the citation the engine returned.
 *
 * Returns null on an unmapped citation, and the caller SKIPS that location rather than throwing.
 * That is a considered choice, not laziness: handleSave's outer `try` in app/dashboard/ghg/page.tsx
 * has a `finally` and NO `catch`, so a throw raised while building the payload leaves the save as an
 * unhandled rejection — no row written, no alert, nothing in front of the customer. Turning a
 * provenance gap into a silent save failure would be a straight downgrade. The exhaustiveness test
 * over EF_SOURCES is what actually prevents the miss, and it runs before any of this ships.
 */
export function factorJurisdiction(loc: Location, family: FactorFamily): FactorJurisdiction | null {
  const cite = family === 'combustion' ? combustionSource(loc) : gridSource(loc)
  return JURISDICTIONS.find(j => CITATIONS[j][family] === cite) ?? null
}

// ── THE COMBUSTION EDITION ───────────────────────────────────────────────────────────────────────
//
// DECLARED, NOT PARSED. No regex runs over citation prose, and that is the deliberate answer to
// "where does the edition come from" rather than an accident of convenience.
//
// A regex is not merely fragile here, it is already WRONG against the current table. The obvious
// pattern — the year in parentheses, /\((\d{4})\)/ — matches five of the six citations and misses
// Australia outright, because DCCEEW's parenthesised token is not a year:
//     'DCCEEW NGA Factors 2025 (AR5)'   →  captures nothing; a laxer pattern captures "AR5"
// The looser alternative, first four-digit run, gets Australia right and is one edit away from being
// wrong elsewhere: any citation that ever names a standard number, a directive year or a page range
// before its edition silently yields the wrong answer, with no failure to notice.
//
// So the label is written down. It is a second copy of a fact — the risk that always comes with a
// declaration — and EDITION LABELS MATCH THEIR CITATION is the test that closes it, asserting every
// whitespace-separated token of each label appears in the citation it claims to summarise. Refreshing
// a factor table without updating its label fails there, loudly, naming both strings.
const COMBUSTION_EDITION: Record<FactorJurisdiction, string> = {
  US: 'US EPA 2024',      // ⚠️ EF_SOURCES.combustion's year is itself UNVERIFIED — see the EF header.
  CA: 'ECCC 2025 v3.0',
  UK: 'DEFRA 2026',
  EU: 'IPCC 2006',
  AU: 'DCCEEW NGA 2025',
  NZ: 'MfE 2026 v2',
}

/**
 * Build the record for one inventory.
 *
 * `year` MUST be the inventory's reporting_year — the same value passed to buildWorkings and
 * calcInventory in the save payload. Passing anything else records editions for a calculation that
 * was never performed.
 */
export function buildFactorEditions(locations: readonly Location[], year: number): FactorEditions {
  const out: FactorEditions = {}
  // Collected per jurisdiction before being written out, because the electricity edition is a set:
  // see the join below.
  const gridYears: Partial<Record<FactorJurisdiction, Set<number>>> = {}

  for (const loc of locations) {
    // ── COMBUSTION — only if this location actually burned something priced by the table.
    // Reuses streamState rather than re-reading has_*/amount pairs: that convention exists precisely
    // because a `has_*` flag alone once meant both "no such supply" and "not yet asked", and a
    // location with has_diesel_stationary true and no figure priced nothing. 'quantified' is the
    // only state that produces a priced row, so it is the only state that names an edition.
    if (COMBUSTION_STREAMS.some(s => streamState(loc, s) === 'quantified')) {
      const j = factorJurisdiction(loc, 'combustion')
      if (j) (out[j] ??= {}).combustion = { source: combustionSource(loc), edition: COMBUSTION_EDITION[j] }
    }

    // ── ELECTRICITY — the SAME gate calcLocation applies, deliberately mirrored.
    // calcLocation omits the electricity Scope 2 entirely when isResolvedGridRegion is false (a
    // us_average default, a blank, an unmapped country): no getGridFactor call, no contribution. A
    // location whose grid region never resolved was priced by no grid edition, so it names none.
    // Nor does a resolved region with zero kWh — an edition for a family that priced nothing would
    // be an invented provenance, which is the one thing this column must never carry.
    if (isResolvedGridRegion(loc.grid_region) && streamState(loc, 'electricity') === 'quantified') {
      const j = factorJurisdiction(loc, 'electricity')
      if (j) (gridYears[j] ??= new Set()).add(getGridFactor(loc.grid_region, year).usedYear)
    }
  }

  for (const j of JURISDICTIONS) {
    const years = gridYears[j]
    if (!years?.size) continue
    // USUALLY ONE YEAR, BUT NOT GUARANTEED. Every GRID_EF region within a jurisdiction currently
    // holds the same year keys (all 13 CA provinces 2024-2026, all 52 US rows 2023, all 28 EU rows
    // 2023), so one inventory year resolves every location in a jurisdiction to the same usedYear.
    // That is a property of today's tables, not of the code — one region gaining a year the others
    // lack would split them. Recording every distinct year that priced a row is true in both cases;
    // picking the first would quietly drop the other. Sorted so the string is stable across saves
    // and two inventories can be compared by equality.
    ;(out[j] ??= {}).electricity = {
      source: CITATIONS[j].electricity,
      edition: [...years].sort((a, b) => a - b).join(', '),
    }
  }

  return out
}

/**
 * What the save payload should write: the recompute, or what is already stored if it computed nothing.
 *
 * THE FALLBACK IS NOT COSMETIC — same shape, and the same reasoning, as comparability_disclosure's
 * `?? inventory.comparability_disclosure ?? null` in the payload beside it. buildFactorEditions
 * returns {} for a genuine reason (nothing in this inventory is priced yet) and that is not a reason
 * to destroy what an earlier save recorded. The column is `not null default '{}'`, so an erasure
 * here does not even leave a null behind: it leaves a value indistinguishable from an inventory that
 * predates the column, which is the one state the comment on that column says is unrecoverable.
 *
 * A NON-EMPTY RECOMPUTE ALWAYS WINS. The editions are a property of the calculation that produced
 * the totals in the same payload — preserving a stale map beside fresh figures would be the defect,
 * not the fix.
 */
export function factorEditionsForSave(
  locations: readonly Location[], year: number, stored?: FactorEditions | null,
): FactorEditions {
  const fresh = buildFactorEditions(locations, year)
  return Object.keys(fresh).length > 0 ? fresh : (stored ?? {})
}

/**
 * Do two inventories name the same editions? The comparison the trends surface will need.
 *
 * Exported now, with tests, but READ BY NOTHING YET — the disclosure surface is a separate change.
 * Flagged because `exclusionsPresent` in lib/ghg/series.ts is computed and rendered nowhere, and
 * `mr_jurisdictions.active` is a whole column no route reads: this repo has a habit of growing
 * derivations that never reach a customer. If this is still unread when the disclosure lands, it
 * should be deleted rather than kept warm.
 */
export function sameFactorEditions(a: FactorEditions, b: FactorEditions): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<FactorJurisdiction>
  for (const j of keys) {
    for (const f of ['combustion', 'electricity'] as const) {
      const x = a[j]?.[f], y = b[j]?.[f]
      if (!x !== !y) return false
      if (x && y && (x.source !== y.source || x.edition !== y.edition)) return false
    }
  }
  return true
}
