# GHG verifier-grade roadmap — the six deliverables the add-on claimed and the module does not produce

**Why this file exists.** The Verification Readiness add-on ($1,499/yr, `ADDONS.verification`) was
**retired on 10 August 2026** and its marketing page deleted. Two reasons:

1. **Its entitlement was written and never read.** `grantFromMetadata` upserted a `verification` row
   into `entitlements` on purchase, and nothing in the codebase ever queried it. There was no
   `useEntitlement('verification')` — there could not be, since `useEntitlement` takes `ModuleKey` and
   `verification` was an `AddOnKey`. No page, route, export or feature flag rendered differently for a
   holder. Whatever a buyer received was either already available to every GHG customer, or was
   delivered off-platform with no record of it in the repo.
2. **Half its claims duplicated what GHG Essentials already includes.** `app/climate-ghg/page.tsx`
   lists `'Audit trail + assurance package'` as an Essentials feature at $4,900, calls the module
   *"verifier-ready"* and *"Assurance-ready"*, and `lib/assurancePdf.ts` plus `/verify/[token]` both
   already cite **ISO 14064-3 / ISAE 3410** — the two standards the add-on page led with.

**These six are what would have justified it.** They were the only claims on that page with no
counterpart in the module. Captured here before the page was deleted, so the analysis is not lost with
it. Nothing below is committed work — this is a roadmap, not a plan of record.

---

## 1. Management assertion, with signature capture

**Claimed:** *"The signed responsible-party statement an engagement is built around — enforced before
issue."*

**Adjacent today.** The closest existing thing is `stream_attestations` on `Location`
(`lib/ghg/engine.ts:1657`), a per-stream *"this site has no such supply"* record:

```ts
export interface StreamAttestation { stream: DeclarableStream; attested_at: string }
```

The `STREAM_META` comment calls this *"a timestamped legal assertion in the assurance package"* and
notes that the words a user is **asked** and the words they **attest** are deliberately identical,
derived from one source. So the platform already has the *shape* of an attestation — a timestamped
statement bound to specific wording — at stream granularity.

Also adjacent: the GHG wizard's `dataConfirmed` checkbox and the export gate
(`canExport = dataConfirmed && coverage resolved && (concierge ⇒ customer_approved)`), and the
comparability disclosure capture (`lib/ghg/comparability.ts`).

**What building it would take.** A single inventory-level assertion, not per-stream: fixed statutory
wording, the asserting person's name and role, a timestamp, and an immutable record of the inventory
state at the moment of signing (a hash or version pin — an assertion over data that later changed is
worthless). `dataConfirmed` is a boolean on component state and is not that. *"Enforced before issue"*
means the export gate would need a fourth conjunct. The hard part is not the UI, it is deciding what
the statement says and who is competent to sign it, which is a methodology question.

## 2. Control testing

**Claimed:** *"Evidence that each control actually operated over the period — not just that it exists."*

**⚠️ QUESTION THIS ONE FIRST.** It presumes a **control framework the module does not have**. There is
no controls register, no control owners, no control descriptions, no test plan, and nothing that
records a control operating. The other five deliverables describe artefacts assembled from data the
platform holds; this one describes an audit procedure performed *on* an organisation.

It reads as **consulting language, not a feature** — closer to `/advisory`'s *"Verifier Preparation —
From $6,000"* than to anything a wizard generates. Before any engineering, decide whether ThemisIQ
means (a) build a controls module, (b) sell this as advisory, or (c) drop the claim. Building it
implies asserting that a customer's controls operated, which is an assurance activity, and
`/verification-readiness` itself said *"We're the tool — never the verifier."* Those two claims sat on
the same page and are in tension.

## 3. Sampling register

**Claimed:** *"Population counts ready for the verifier to select against — independence preserved."*

**Adjacent today.** The populations exist and are already enumerable:
`locations_data` (sites), each `Location.source_docs` (evidence items), `buildWorkings()` rows
(per-location, per-source calculation lines), and `buildMonthlyEmissions` slices. `analyzeCoverage`
already counts covered vs uncovered periods per `(document_type, fuelType)` group, and
`assessCompleteness` produces a verdict over `workings` + `locations_data`.

**What building it would take.** Comparatively little: a derived read-only view that counts each
population and exposes stable identifiers a verifier can select against, surfaced in `/verify/[token]`
and the assurance PDF. The engineering is small; the discipline is that ThemisIQ must **not** choose
the sample — the note *"independence preserved"* is the whole point, so the deliverable is counts and
identifiers, never a suggested selection.

## 4. Readiness findings

**Claimed:** *"Prioritised list of what to fix before fieldwork — generated from the package itself."*

**Adjacent today, and closer than any of the others.** The module already computes most of the inputs:

- `analyzeCoverage` — gaps, overlaps, straddles per `(document_type, fuelType)`, at day level
- `reconcile()` — **exported and tested but not surfaced in any UI**; models the expected
  monthly-vs-annual gap, and a non-zero `unexplained_delta` is documented as a real defect
- `assessCompleteness` (`lib/ghg/loadSeries.ts`) — a completeness verdict
- `findUndeclaredStreams` — streams nobody has answered, which already block export
- `EF_SOURCES` vintages, with vintage-mismatch flags
- `needs_manual_review` flags from `lib/unitConversions.ts`'s three-tier cascade
- the open unit-switch defect in CLAUDE.md (relabels without converting) — exactly the kind of thing a
  findings report should surface

**What building it would take.** Mostly aggregation and ranking: collect the existing signals into one
ordered list with a severity per finding and a stated remedy. `reconcile()` being tested but unsurfaced
means part of this is already built and simply not rendered. The judgement is the ordering — what
blocks fieldwork versus what a verifier will merely ask about.

## 5. Owner and reviewer per stream

**Claimed:** *"Monthly data per source, plus the named owner and reviewer for each stream."*

**Adjacent today.** The monthly half exists — `buildMonthlyEmissions` produces dated slices from
concierge-confirmed bills, and the engine's invariant is that *"a dated slice must not assert
consumption no bill supports"*. The audit trail (`lib/assurancePdf.ts:199-226`) records
`r.user_email || 'System'` per change, so **who touched a figure** is captured.

**What is missing is roles, not identity.** `Location` has no owner or reviewer field, and the audit
trail records an actor per *change event*, not an accountable person per *stream*. There is also no
reviewer concept at all — no second-person sign-off distinct from the person who entered the data.

**What building it would take.** Two nullable fields per stream (or per location-stream pair) plus a
review action that is separable from the edit action, which means the audit trail needs an event type
it does not have. Multi-user accounts are a prerequisite: `entitlements` is keyed `user_id`, so today
one account is one person and "owner vs reviewer" cannot be two people.

## 6. SHA-256 chain of custody

**Claimed:** *"Source documents linked to each data point, with SHA-256 hashing and chain of custody."*

**Adjacent today.** The *linking* half is done and load-bearing: `SourceDoc` carries
`{ id, file_name, document_type, uploaded_at, file_path, extracted? }`, documents live in the
`source-documents` Storage bucket (hardened in
`supabase/migrations/20260804_ghg_source_documents_bucket_hardening.sql` with three RLS policies),
`/api/verifier-documents` iterates `source_docs` generically and `/api/verifier-documents/sign` issues
signed URLs to a token-holding verifier. The assurance PDF has a **Source Document Index** section.

**What is missing is the hash.** `SourceDoc` has **no hash field** — grep finds no SHA-256 anywhere in
the document path. The assurance PDF calls the audit trail *"tamper-evident"*, which is a claim about
the append-only change log, not about the documents. So *"SHA-256 hashing"* was asserted and does not
exist.

**What building it would take.** Hash on upload, store it on `SourceDoc`, print it in the Source
Document Index, and re-verify on read so a substituted file is detectable. Backfill is the awkward
part: existing documents have no hash, and a hash computed later proves only that the file has not
changed *since then* — which must be stated rather than implied, or the field becomes the same kind of
unearned assurance the claim was.

---

## Cross-cutting notes

- **Two of the six are mostly-built and unsurfaced** (sampling register, readiness findings). If any of
  this is revived, those are the ones with real substance behind them.
- **One is a claim about a missing primitive** (SHA-256). It was stated as present and was not.
- **Two need data-model and multi-user work** (management assertion, owner/reviewer).
- **One should probably not be built** (control testing) — see §2.
- **What did NOT need building**, because Essentials already ships it: basis of preparation, boundary
  decision register, emission factor register, calculation workbook, reconciliation checks, evidence
  register, audit trail and lineage. Those seven were the duplicated half.
