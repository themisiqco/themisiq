-- supabase/migrations/20260804_ghg_source_documents_policies.sql
--
-- ⚠️ CAPTURED FROM LIVE, NOT AUTHORED. These three policies already exist in the production
-- database and always have; they were created outside any migration and have never been in git.
-- The definitions below are transcribed VERBATIM from pg_policies — policy names, commands, roles
-- and expressions are reproduced exactly as the live database reports them, not rewritten to a
-- house style. Running this against production is therefore a no-op in effect: it replaces each
-- policy with an identical one. Its purpose is that a from-scratch rebuild restores them.
--
-- WHY IT WAS WRITTEN THIS WAY. 20260723_cbam_source_documents_bucket.sql described the GHG rules
-- from memory as "the proven GHG pattern" — files at <auth.uid()>/... with the first folder segment
-- matching the caller's uid — but a paraphrase in a comment is not a definition, and a rebuild
-- cannot run one. That description is NOW CONFIRMED ACCURATE: with the live definitions in hand,
-- the two sets are identical apart from the bucket id and the policy names. Nothing was reconstructed
-- from the paraphrase; the paraphrase was checked against the source and found to be right.
--
-- ── OBSERVATION, NOT A FIX: THERE IS NO UPDATE POLICY ON EITHER BUCKET ────────────────────────
-- SELECT, INSERT and DELETE are covered here and in the CBAM migration. UPDATE is not, on either
-- bucket, so overwriting an object in place is denied — a file can be uploaded and it can be
-- deleted, but it cannot be silently replaced with different content at the same path.
--
-- For evidence storage that is almost certainly the right behaviour: a verifier who has traced a
-- figure to a document, or an audit trail that references one, must not have the bytes change
-- underneath them. Delete-then-reupload leaves a trace; an in-place overwrite does not. The CBAM
-- migration states this intent explicitly for its own bucket ("an uploaded evidence document is
-- immutable"). No equivalent statement was ever written for GHG, so on this side the same outcome
-- rests on an absence rather than on a recorded decision.
--
-- IT IS RECORDED HERE AND DELIBERATELY NOT CHANGED. Adding an UPDATE policy would alter live
-- behaviour under cover of a capture migration, which is the opposite of what this file is for; and
-- asserting the immutability as intentional would put words in the original author's mouth. What is
-- certain is the current behaviour, and that is what is written down. If the absence turns out to
-- be an oversight rather than a decision, that is a separate change with its own reasoning.
--
-- ── DEPLOY ───────────────────────────────────────────────────────────────────────────────────
-- Idempotent: drop-then-create, so it is safe to re-run. Wrapped in a transaction so there is no
-- moment at which a policy is missing — without it, a re-run against live would briefly leave
-- customers unable to read their own evidence between the DROP and the CREATE.
-- Requires an owner-level role on storage.objects (the Supabase SQL editor's default is fine).
--
-- RLS is already enabled on storage.objects by Supabase and is not touched here.

begin;

-- ── SELECT — a customer reads only their own uploads ─────────────────────────────────────────
-- Scoped by auth.uid(), NOT company_id, matching CBAM. If the multi-client agency layer ever
-- lands, both buckets have to be revisited together — one alone would be a silent asymmetry.
--
-- NOTE: this policy governs the CUSTOMER's own access. It has nothing to do with how a verifier
-- reaches these files: /api/verifier-documents/sign uses the SERVICE-ROLE client, which bypasses
-- RLS entirely, so the grant + consent checks in lib/ghg/verifierGrant.ts are the only thing
-- standing between a token and a document. Loosening this policy would not widen verifier access,
-- and tightening it would not narrow it.
drop policy if exists "Users can view own documents" on storage.objects;
create policy "Users can view own documents"
  on storage.objects for select to authenticated
  using ((bucket_id = 'source-documents'::text)
         and ((auth.uid())::text = (storage.foldername(name))[1]));

-- ── INSERT — a customer writes only under their own uid prefix ───────────────────────────────
-- The with_check expression is identical to the select's using expression, as reported live.
drop policy if exists "Users can upload own documents" on storage.objects;
create policy "Users can upload own documents"
  on storage.objects for insert to authenticated
  with check ((bucket_id = 'source-documents'::text)
              and ((auth.uid())::text = (storage.foldername(name))[1]));

-- ── DELETE — a customer removes only their own uploads ───────────────────────────────────────
-- Reached from the wizard's remove-document control, which deletes the object and then drops the
-- source_docs entry from locations_data.
drop policy if exists "Users can delete own documents" on storage.objects;
create policy "Users can delete own documents"
  on storage.objects for delete to authenticated
  using ((bucket_id = 'source-documents'::text)
         and ((auth.uid())::text = (storage.foldername(name))[1]));

commit;

-- ── What now covers this bucket, in git ──────────────────────────────────────────────────────
--   20260804_ghg_source_documents_bucket_hardening.sql   bucket row: public, size cap, MIME allowlist
--   20260804_ghg_source_documents_policies.sql           this file: the three RLS policies
-- Between them a rebuild restores the bucket and its access rules. Note the pairing matters:
-- the hardening migration's insert creates the bucket row if it is absent, so run it FIRST — these
-- policies reference a bucket id, and policies without the bucket are inert.
