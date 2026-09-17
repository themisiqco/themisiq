// ── THE DEFRA/DESNZ PUBLICATION: ITS CITATION, ITS LICENCE, AND THE ATTRIBUTION THAT LICENCE REQUIRES ─
//
// Split out of lib/ghg/engine.ts on 17 Sep 2026, which re-exports everything here, so that a surface
// needing only the citation or the attribution (the public methodology page) does not import the engine.
// Pure: no imports.
//
// THE PUBLICATION, CITED ONE WAY.
//
// ⚠️ ONE PUBLICATION, WHICH UNTIL 17 SEP 2026 WAS WORDED THREE WAYS. combustion_uk read "UK DEFRA/DESNZ
// (2026) GHG Conversion Factors for Company Reporting"; electricity_uk the same without the year;
// steam_uk "UK DESNZ/DEFRA (2026) GHG Conversion Factors, flat file v1.2 — Scope 2, District heat and
// steam" — publishers reversed, "for Company Reporting" dropped, and a file version and sheet baked into
// the prose. Waste and business travel were about to make it five. The citation is now BUILT from the
// fields below, and where a factor was read from — file, version, sheet, row — is a separate record
// (EF_SOURCE_LOCATORS), not part of the citation.
//
// ⚠️ THE CANONICAL WORDING IS THE ONE ALREADY STORED, CHOSEN SO THAT STORED RECORDS DO NOT MOVE.
// EF_SOURCES strings are written into ghg_inventories.factor_editions, and factorEditionState compares
// the stored `source` of each year (sameFactorEditions). Rewording a citation that inventories have
// already stored would make two years priced from the SAME edition compare as different, and the trends
// page would tell a customer "Emission factors changed between years" when nothing changed. So the
// combustion and electricity strings are byte-identical to what they were; only steam_uk moves, and the
// consequence of that is recorded in the Part A report of 17 Sep 2026.
//
// `title_as_published` is the workbook's own heading, row 1 of every sheet of the 2026 full set
// (data/reference/defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx): "UK Government GHG
// Conversion Factors for Company Reporting". The citation names the publishers instead of "UK
// Government" because that is the form every stored record already carries.
//
// ⚠️ THE LICENCE IS RECORDED HERE, AND IT CARRIES A CONDITION. The factors are published under the Open
// Government Licence v3.0, whose rights END AUTOMATICALLY if the source is not acknowledged. Until
// 17 Sep 2026 no Scope 1 or 2 surface acknowledged it. `attribution_required` is the wording OGL v3.0
// prescribes where the provider gives none of its own: a REQUIRED STRING, read by every surface that
// shows a DEFRA-derived figure (see sourceAttributionsFor) and never typed out anywhere else.
// lib/emissionFactors/defraWaste2026.json records the same fields for the Cat 5 waste factors, and
// defraWaste2026.test.ts asserts the two records are identical.
export const DEFRA_DESNZ_PUBLICATION = {
  publishers: 'DEFRA/DESNZ',
  title: 'GHG Conversion Factors for Company Reporting',
  title_as_published: 'UK Government GHG Conversion Factors for Company Reporting',
  licence: 'Open Government Licence v3.0 (OGL v3.0)',
  licence_url: 'http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  attribution_required: 'Contains public sector information licensed under the Open Government Licence v3.0.',
  // ⚠️ WHAT WAS VERIFIED, AND WHAT WAS NOT. The statement was read on the 2026 publication page. GRID_EF.UK's
  // 2025 value comes from the 2025 edition, whose page was not checked; it is attributed on the same
  // basis because it is the same publisher's same series, which is an assumption, not a reading.
  licence_basis:
    'Stated on the 2026 publication page on gov.uk ("All content is available under the Open Government ' +
    'Licence v3.0, except where otherwise stated"), verified 17 Sep 2026. The workbooks themselves state no ' +
    'licence. The 2025 edition\'s page, the source of GRID_EF.UK 2025, was not separately checked.',
} as const

/**
 * The citation for the DEFRA/DESNZ conversion factors: with a year where the table it cites holds ONE
 * edition, without one where it holds several (GRID_EF.UK holds 2025 and 2026, and the year then comes
 * from the lookup, not the citation — see electricity_uk).
 *
 * Every word of the edition label 'DEFRA 2026' appears in defraCitation(2026), which is what F16 in
 * factorEditions.test.ts requires of a label and the citation it summarises.
 */
export function defraCitation(year?: number): string {
  const p = DEFRA_DESNZ_PUBLICATION
  return `UK ${p.publishers}${year === undefined ? '' : ` (${year})`} ${p.title}`
}

/** An attribution a cited source's licence requires, as a surface must print it. */
export type SourceAttribution = {
  publisher: string
  /** Verbatim. Never reworded, never shortened. */
  attribution: string
  licence: string
  licence_url: string
}

/**
 * The licence attributions required by the sources behind a set of citations, one per publisher.
 *
 * ⚠️ ONLY DEFRA/DESNZ HAS A RECORDED LICENCE. EPA/eGRID, ECCC, EEA, DCCEEW, NZ MfE, Green-e, AIB and the
 * EU MRR/IPCC defaults have none recorded, and their terms have not been read. An empty result for an
 * inventory priced from those is therefore NOT a finding that no attribution is owed; it is the absence of
 * a record. Add a publisher here only from its licence as read, never from what it is likely to be.
 *
 * Matched on the publisher's name in the citation, so it covers every DEFRA citation form, including the
 * pre-17 Sep 2026 "UK DESNZ/DEFRA (2026) ..." steam wording still held in stored workings. Pass citations,
 * not EF_SOURCES.electricity: that string is a six-publisher catalogue, not a record of what priced a row.
 */
export function sourceAttributionsFor(citations: readonly (string | null | undefined)[]): SourceAttribution[] {
  const out: SourceAttribution[] = []
  if (citations.some(c => typeof c === 'string' && /\bDEFRA\b|\bDESNZ\b/.test(c))) {
    const p = DEFRA_DESNZ_PUBLICATION
    out.push({ publisher: p.publishers, attribution: p.attribution_required, licence: p.licence, licence_url: p.licence_url })
  }
  return out
}
