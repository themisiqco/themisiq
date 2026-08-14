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
  efJurisdiction, steamFactorFor, findUnpriceableLocations, SUPPLIER_SPECIFIC_ENTRY_METHOD,
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

/**
 * The factor families that are country-routed. See FAMILIES_NOT_COVERED below for the rest.
 *
 * STEAM IS ITS OWN FAMILY RATHER THAN PART OF combustion, and the reason is not tidiness. Folding it
 * in would file a Scope 2 purchased-heat row under a Scope 1 combustion citation: combustionSource()
 * would name EPA's fuels workbook or DEFRA's Fuels tab on a row priced by EPA Table 7 or DEFRA's
 * Scope 2 district-heat row. Those are different tables with different assumptions behind them (the
 * US steam factor is an ASSUMED gas boiler at 80% efficiency), and a verifier reading the edition map
 * would be pointed at the wrong one. It is also only published in two of the six jurisdictions, so a
 * shared family would have to carry an absence the combustion family never has.
 */
export type FactorFamily = 'combustion' | 'electricity' | 'steam'
/** Iterated wherever every family must be visited. One list, so a new family cannot be half-added. */
const FAMILIES: readonly FactorFamily[] = ['combustion', 'electricity', 'steam']

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
// THREE STREAMS ARE ABSENT FROM THIS LIST, and none of the omissions is an oversight:
//   refrigerants    — priced from REFRIGERANT_GWP, a GWP table, not a combustion factor. Its edition
//                     is the AR set, which gwp_version already records.
//   purchased_steam — ITS OWN FAMILY as of 14 Aug 2026, no longer an omission. It was excluded while
//                     EF.steam_mmbtu was the US EPA table for EVERY country and pickEF was never
//                     consulted: filing a UK steam location under "DEFRA 2026" would have been a
//                     wrong attribution. Steam now routes per jurisdiction through STEAM_EF, so the
//                     attribution is real — and it is a family of its own rather than part of this
//                     list, because combustionSource() would cite the wrong TABLE for it. See the
//                     note on FactorFamily.
//   electricity     — its own family, resolved by year rather than by table.
const COMBUSTION_STREAMS = [
  'natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual', 'mobile',
] as const

/** Recorded here so the omissions above are greppable from the consuming code, not just commented. */
export const FAMILIES_NOT_COVERED = ['refrigerants'] as const

// ── DID ANYTHING HERE PRICE FROM A PUBLISHED FACTOR TABLE? ───────────────────────────────────────
//
// WHY THIS EXISTS. An empty factor_editions map has TWO meanings and the surfaces could not tell them
// apart, so both told a verifier the same false thing: that the inventory predated the write path and
// that every figure was priced from a published table. There are fourteen ways to reach {} on a
// current save and both sentences are false for most of them. This is the discriminator:
//   TRUE  -> something WAS priced from a published table, so an empty map is a STALE RECORD.
//   FALSE -> nothing was, so an empty map is the CORRECT and complete answer.
//
// ⚠️ IT READS A STORED SNAPSHOT, NOT THE LIVE ENGINE, AND THAT IS THE WHOLE DESIGN.
// workings and factor_editions are written by the SAME save, so they describe the same calculation by
// construction. Recomputing from locations_data instead would have made the verifier page's output
// depend on deploy time — two verifiers opening one token a week apart could read different text
// about identical frozen figures, and the customer's trends page would say a third thing. Passing the
// rows in keeps this pure and keeps every surface reading one stored fact.
//
// ⚠️ THE TWO EXCLUSIONS ARE STRUCTURAL, NOT RESTATED. Both are derived from the declaration that
// already owns them, so neither can drift:
//   - FAMILIES_NOT_COVERED (above) — refrigerants price from REFRIGERANT_GWP, a GWP table whose
//     edition gwp_version already records. ANYONE ADDING A FAMILY THERE CHANGES THIS PREDICATE TOO,
//     automatically, because this reads that list rather than repeating it.
//   - SUPPLIER_SPECIFIC_ENTRY_METHOD (engine.ts) — a district-heating figure from the customer's own
//     provider prices a row but is not an edition of any publication, so it must not count as one.
// Both were found by measurement, not by inspection: a naive "did any row price" test got 12 of the
// 14 routes right and these exact two wrong.
//
// Structurally typed rather than importing WorkingRow: the verifier page and the engine each have
// their own row shape, and this needs only the five fields both carry.
export type PricedRowProbe = {
  stream?: string | null
  result_tco2e?: number | null
  declaration?: string | null
  entry_method?: string | null
  gwp_basis?: string | null
}

export function anyPublishedFactorApplied(rows: readonly PricedRowProbe[] | null | undefined): boolean {
  if (!Array.isArray(rows)) return false
  return rows.some(r => {
    if (!r) return false
    // A declaration row records an ABSENCE — attested, undeclared, unpriceable, declared-unquantified,
    // or a stream no jurisdiction publishes a factor for. None of them priced anything.
    if (r.declaration) return false
    // result_tco2e null is the engine's own marker for "no figure". Coverage-resolution rows are audit
    // entries rather than calculations and carry their own gwp_basis token.
    if (r.result_tco2e == null) return false
    if (r.gwp_basis === 'coverage_resolution') return false
    // The two exclusions, read from their own declarations.
    if (r.stream && (FAMILIES_NOT_COVERED as readonly string[]).includes(r.stream)) return false
    if (r.entry_method === SUPPLIER_SPECIFIC_ENTRY_METHOD) return false
    return true
  })
}

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
// `steam` is OPTIONAL, and the four absences are the honest shape: only the US and UK publish a
// purchased-steam factor at all. An entry here would assert a table that does not exist.
const CITATIONS: Record<FactorJurisdiction, { combustion: string; electricity: string; steam?: string }> = {
  US: { combustion: EF_SOURCES.combustion,    electricity: EF_SOURCES.electricity_us, steam: EF_SOURCES.steam_us },
  CA: { combustion: EF_SOURCES.combustion_ca, electricity: EF_SOURCES.electricity_ca },
  UK: { combustion: EF_SOURCES.combustion_uk, electricity: EF_SOURCES.electricity_uk, steam: EF_SOURCES.steam_uk },
  EU: { combustion: EF_SOURCES.combustion_eu, electricity: EF_SOURCES.electricity_eu },
  AU: { combustion: EF_SOURCES.combustion_au, electricity: EF_SOURCES.electricity_au },
  NZ: { combustion: EF_SOURCES.combustion_nz, electricity: EF_SOURCES.electricity_nz },
}

// ── THE STEAM EDITION ────────────────────────────────────────────────────────────────────────────
// Declared, like COMBUSTION_EDITION below and for the same reason. Only the two seeded jurisdictions
// appear; an absent key means "this jurisdiction publishes no steam factor", which is exactly what
// STEAM_EF says, and is a different claim from an edition of "none".
//
// ⚠️ A SUPPLIER-SPECIFIC FACTOR RECORDS NO EDITION, and that is correct rather than a gap. This column
// answers "which published edition priced these figures"; a factor the customer obtained from their
// own district energy provider is not an edition of anything, and inventing a label for it would put a
// publication claim on a private figure. The workings row carries the supplier attribution instead.
const STEAM_EDITION: Partial<Record<FactorJurisdiction, string>> = {
  US: 'US EPA 2025 Table 7',
  UK: 'DEFRA 2026',
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
  // STEAM RESOLVES BY ROUTER, NOT BY CITATION, and it is the stronger of the two couplings. The other
  // families have to match a string because their citation functions re-branch on country privately;
  // steam is dispatched by efJurisdiction(), so asking that same function IS asking the engine which
  // table it used. There is no string in between to drift.
  if (family === 'steam') {
    const j = efJurisdiction(loc) as FactorJurisdiction
    return CITATIONS[j].steam ? j : null
  }
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
    // ── EXCLUDED FROM THE TOTALS => NO EDITION, FOR ANY FAMILY ─────────────────────────────────
    //
    // A location whose fuel is recorded in a unit no table carries (a US site holding gas in m3) is
    // excluded WHOLE from every total — see the header on unpriceableReason in engine.ts, which is
    // explicit that "a location either contributes everything or nothing" and that its electricity
    // goes with it. Nothing it holds reaches a figure on the report.
    //
    // ⚠️ THIS IS THE INVERSE OF THE INVENTED-PUBLICATION CASE, AND THEY ARE ONE RULE.
    // The electricity gate below refuses an edition for a family that priced nothing, because that
    // would attach a provenance claim to a TABLE THAT DID NOT PRICE ANYTHING. This refuses an
    // edition for a location that priced nothing, because that would attach a provenance claim to a
    // FIGURE THAT IS NOT IN THE REPORT. One states a publication that does not apply; the other
    // states a calculation that did not happen. Both put something in this column that no number on
    // the report stands behind, which is the one thing it must never carry.
    //
    // ALL THREE FAMILIES, not just combustion. An excluded location can hold quantified electricity
    // with a resolved grid region, and quantified steam with a published factor, and before this
    // gate both recorded an edition — the exclusion is decided per LOCATION and the family gates
    // are decided per STREAM, so no stream-level condition could have caught it.
    //
    // ⚠️ AR6 IS HARDCODED, AND WHAT MAKES THAT SAFE IS ASSERTED — engine.test.ts L6, "the probe is
    // GWP-independent — the same locations are excluded on AR4, AR5 and AR6". Go there before
    // changing this line; it is also what licenses app/dashboard/ghg/page.tsx to probe once at AR6
    // and reuse the answer for all three bases, so the two hardcodes stand or fall together.
    //   The property is STRUCTURAL, not incidental: MissingEmissionFactorError has exactly ONE throw
    // site (assertPriceable), and no function in the chain that reaches it — pickEF, efOr, efMiss,
    // isPriceableEF, assertPriceable — takes a GwpVersion parameter at all. The AR set is passed to
    // calcGas AFTER a factor has been found, only to scale CH4/N2O. A table cannot become
    // GWP-conditional without one of those signatures changing first.
    //   The one soft edge, stated so it is not discovered later: the factor KEY is a caller-supplied
    // string, so a future call site could in principle build one from the GWP set. None does — every
    // key is composed from loc.*_unit fields and grade literals — but that is a convention, not a
    // type. L6 is the behavioural backstop for it, and it currently exercises ONE of the eighteen
    // routes to exclusion (US natural gas in m3); widening it would tighten this guarantee.
    //   It also adds NO new failure path to the save: unpriceableReason absorbs
    // MissingEmissionFactorError and rethrows everything else, and calcInventory and pctEstimated
    // already probe these same locations EARLIER in the same payload, so any other error has already
    // been raised before this line runs.
    if (findUnpriceableLocations([loc], 'AR6', year).length > 0) continue

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

    // ── STEAM — quantified AND priced by a PUBLISHED table.
    // Three ways this records nothing, all of them deliberate:
    //   - not quantified: same gate as the other two families, no row priced, no edition.
    //   - jurisdiction publishes no factor (CA/AU/NZ/EU): steamFactorFor returns an absence, and there
    //     is no edition to name. buildWorkings emits a no_published_factor row instead.
    //   - a SUPPLIER-SPECIFIC factor priced it: not a published edition. See STEAM_EDITION's note.
    //     Checked via steamFactorFor rather than steamPricing precisely so a supplier figure at a US or
    //     UK location does NOT get filed under EPA/DEFRA — the row was not priced by that table.
    if (streamState(loc, 'purchased_steam') === 'quantified'
        && !(typeof loc.purchased_steam_supplier_ef === 'number' && loc.purchased_steam_supplier_ef > 0)
        && steamFactorFor(loc).kind === 'published') {
      const j = factorJurisdiction(loc, 'steam')
      const edition = j ? STEAM_EDITION[j] : undefined
      if (j && edition) (out[j] ??= {}).steam = { source: CITATIONS[j].steam!, edition }
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

/** Do two inventories name the same editions? The comparison behind factorEditionState. */
export function sameFactorEditions(a: FactorEditions, b: FactorEditions): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<FactorJurisdiction>
  for (const j of keys) {
    // FAMILIES, not a literal list — a hardcoded pair here would silently ignore a third family, so
    // two inventories differing only in their steam edition would have compared EQUAL and the trends
    // page would have reported 'consistent' across a factor change. That is the exact failure this
    // module exists to prevent, one family along.
    for (const f of FAMILIES) {
      const x = a[j]?.[f], y = b[j]?.[f]
      if (!x !== !y) return false
      if (x && y && (x.source !== y.source || x.edition !== y.edition)) return false
    }
  }
  return true
}

// ── THE COMPARISON AXIS ──────────────────────────────────────────────────────────────────────────
//
// A UNION, NOT A FOURTH BOOLEAN. CompanySeries already carries gwpConsistent, estimationConsistent
// and exclusionsPresent — three booleans where a state belongs, and one of the three (exclusionsPresent)
// is computed and rendered nowhere at all. A boolean here would have to answer "are the editions
// consistent?" for a series where the honest answer is "we cannot say", and false would then mean
// both "they changed" and "we never recorded them" — the two findings a customer must act on
// differently. Same shape and same reasoning as StreamState in engine.ts, which exists because a
// boolean was hiding a third case and the third case was the one that mattered.
export type FactorEditionState = 'consistent' | 'changed' | 'unknown'

/**
 * The state of a series' factor editions, from the stored maps in reporting-year order.
 *
 * ⚠️ UNKNOWN IS TESTED FIRST, AND THE ORDER IS THE DESIGN DECISION HERE.
 *
 * A series can satisfy both at once: 2024 unrecorded, 2025 on DEFRA 2025, 2026 on DEFRA 2026. Both
 * statements are then true — a year is missing, AND two recorded years demonstrably differ — and the
 * union shows one message, so one has to win.
 *
 * UNKNOWN WINS, because of what each state licenses a reader to conclude. 'changed' says the
 * movement is partly a factor revision, which quietly asserts that the edition set was FULLY
 * OBSERVED — that the revision we found is the whole story. With a year unrecorded that is exactly
 * what we do not know: an unobserved year may hold a further revision, or the same one, and nothing
 * distinguishes those. Showing 'changed' would report "we can't tell" with the confidence of "here
 * is what moved". 'unknown' withholds a fact we are sure of; 'changed' would assert one we are not.
 * This repo already resolves that trade the same way twice — YearDataStatus keeps 'excluded' and
 * 'unverifiable' apart so "we can't tell" is never reported as "here is what's missing", and
 * baselineScope12Total is withheld rather than softened to a best guess when the baseline is
 * unusable.
 *
 * ⚠️ AND THE COST IS REAL, so it is written down rather than left to be discovered: a customer whose
 * 2025→2026 genuinely crossed an edition boundary, but who also holds an unrecorded 2024, sees the
 * 'unknown' message and therefore does NOT see the base-year recalculation-policy prompt for a
 * revision we can prove happened. That is the price of not over-claiming. It shrinks to nothing as
 * the back catalogue is re-saved. If it turns out to matter before then, the fix is at the render
 * site — show the unknown message AND the recalculation sentence when the recorded years differ —
 * not a reordering here.
 */
// ── THE WORDS ────────────────────────────────────────────────────────────────────────────────────
//
// Here rather than in the page, for the reason describeYearStatus() already carries in series.ts:
// the trend chart and the SBTi surface must not describe the same finding in two different ways in
// front of the same verifier. Only trends renders it today; the second consumer is why it is a
// constant and not a literal.
//
// ⚠️ TWO FIELDS BECAUSE THE STRIP CANNOT HOLD THE SENTENCE, AND NOTHING IS TRUNCATED.
// The trends header line is 12px muted text currently holding "Mixed GWP basis — comparison may not
// be valid" (44 characters). The changed disclosure is 233, and shortening it would drop the
// base-year recalculation prompt, which is the actionable half. So `label` goes inline beside the
// GWP span and `detail` goes in an amber panel directly below the header, IN FULL.
//   `label` IS THE OPENING CLAUSE OF `detail`, VERBATIM, up to the em dash — not a paraphrase and
// not new copy. The reader sees the same words in both places, so the strip cannot come to say
// something the panel does not.
//
// An exhaustive Record over the union, so adding a fourth state fails tsc here rather than rendering
// as silence. `null` for consistent is a real entry, not an omission: a series on one factor basis
// says nothing, exactly as gwpConsistent shows the plain "GWP basis: AR6" and no warning.
export const FACTOR_EDITION_DISCLOSURE: Record<FactorEditionState, { label: string; detail: string } | null> = {
  consistent: null,
  changed: {
    label: 'Emission factors changed between years',
    detail:
      'Emission factors changed between years — year-over-year movement reflects both operational ' +
      'change and the factor revision. You may wish to consider whether this affects your base-year ' +
      'recalculation policy.',
  },
  // ⚠️ 'some years' IS NOW LITERALLY TRUE, WHERE IT USED TO BE A GUESS. This message previously fired
  // for any empty map, including years that applied no published factor table at all and had nothing
  // to record — telling a customer editions "were not recorded" for a year where there was nothing to
  // record. Those years are now skipped rather than counted, so this fires only on a real gap: a year
  // that DID price from a published table and did not record which edition.
  unknown: {
    label: 'Emission-factor editions were not recorded for some years',
    detail:
      'Emission-factor editions were not recorded for some years — year-over-year comparison cannot ' +
      'be confirmed on a consistent factor basis. Years that applied no published emission factor ' +
      'table are not counted here; this refers to years where a published table was applied and the ' +
      'edition was not recorded.',
  },
}

/**
 * One year's contribution to the comparison.
 *
 * ⚠️ THE SIGNATURE CHANGED, from `readonly FactorEditions[]` to this. It had to: the distinction this
 * function now makes CANNOT be derived from the maps alone — an empty map looks identical whether the
 * year priced everything from published tables and failed to record them, or priced nothing from a
 * published table at all. `anyPublished` comes from the year's own stored workings via
 * anyPublishedFactorApplied, so it is a fact about the same save, not a recomputation.
 */
export type FactorEditionYear = {
  editions: FactorEditions | null | undefined
  /** Did that year's workings price ANYTHING from a published factor table? See anyPublishedFactorApplied. */
  anyPublished: boolean
}

const isEmpty = (m: FactorEditions | null | undefined) => !m || Object.keys(m).length === 0

export function factorEditionState(
  years: readonly FactorEditionYear[],
): FactorEditionState {
  // No years at all is not a consistent series; there is nothing to have been consistent about.
  if (years.length === 0) return 'unknown'

  // ⚠️ AN EMPTY MAP HAS TWO MEANINGS AND THIS USED TO COLLAPSE THEM. The comment that stood here —
  // "An empty map is the pre-column back catalogue: priced by SOME edition, with no record of which"
  // — was the origin of a false claim on the verifier surface, and it was simply not true: there are
  // fourteen ways to reach {} on a CURRENT save, and in most of them nothing was ever priced from a
  // published table. `anyPublished` is what tells them apart, read from the year's own stored
  // workings.
  //
  //   empty + anyPublished  -> A GENUINE GAP. Something was priced from a published table and the
  //                            edition was not recorded. Poisons the series to 'unknown', as before.
  //   empty + !anyPublished -> NOTHING TO RECORD. That year applied no published factor table at all,
  //                            so it has no factor basis to be consistent or inconsistent WITH. It is
  //                            SKIPPED, not counted as a gap.
  const gap = years.some(y => isEmpty(y.editions) && y.anyPublished)
  if (gap) return 'unknown'
  const recorded = years.filter(y => !isEmpty(y.editions)).map(y => y.editions as FactorEditions)

  // EVERY YEAR HAD NOTHING TO RECORD -> 'consistent', which renders NOTHING. Not 'unknown': that
  // message says a consistent factor basis could not be CONFIRMED, which implies there should have
  // been one to confirm. A series that applied no published factor table in any year has nothing
  // withheld and nothing to warn about, and the honest surface for that is silence.
  //   The same answer covers one-recorded-year-among-nothing-recordable-years: one basis, no gap.
  if (recorded.length === 0) return 'consistent'

  // ONE YEAR IS 'consistent', deliberately, and it mirrors gwpConsistent — a one-year series has a
  // set size of 1 and reports true there too. Nothing is being compared, so nothing is being
  // mis-stated; the trends header shows no message either way, because 'consistent' is silent.
  const [first, ...rest] = recorded
  return rest.every(m => sameFactorEditions(first, m)) ? 'consistent' : 'changed'
}
