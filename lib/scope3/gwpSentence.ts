// ── THE GWP SENTENCE FOR A PUBLISHER'S FACTORS, AGAINST THE BOUND GHG INVENTORY ───────────────────
//
// Every Scope 3 category priced from a DEFRA/DESNZ artefact carries one sentence: the publisher's GWP
// basis, the artefact's own note on it, and whether the bound GHG inventory records the same basis,
// another one, or none. It was the Scope 3 page's wasteGwpSentence, shared by Cats 5 and 12; Cat 6 now
// needs it too, so it lives here and each category passes its own artefact's record.
//
// ⚠️ IT READS THE INVENTORY, IT DOES NOT ASSERT A MIX. The three branches are the three things that can be
// true, and there is no branch that claims agreement without the inventory recording it.
//
// The waste wording is byte-identical to the page's former closure.

export interface PublisherGwp {
  gwp_basis: string
  gwp_basis_note: string
}

export function publisherGwpSentence(m: PublisherGwp, bound: boolean, ghgGwpVersion: string | null): string {
  const mix = !bound ? ''
    : ghgGwpVersion === m.gwp_basis ? ` The linked GHG inventory records ${ghgGwpVersion} as well, so the two share a GWP basis.`
    : ghgGwpVersion ? ` The linked GHG inventory records ${ghgGwpVersion}. These factors are not re-based to it, so the inventory combines ${ghgGwpVersion} and ${m.gwp_basis} figures.`
    : ` The linked GHG inventory records no GWP basis, so whether it shares ${m.gwp_basis} with these factors is not known.`
  return `GWP basis: ${m.gwp_basis}. ${m.gwp_basis_note}${mix}`
}
