-- supabase/migrations/20260804_ghg_source_documents_bucket_hardening.sql
--
-- ⚠️ NOT YET APPLIED. Lisa runs this by hand in the Supabase SQL editor. It changes LIVE storage
-- configuration for the bucket holding every GHG customer's evidence.
--
-- ── WHAT THIS FIXES ───────────────────────────────────────────────────────────────────────────
-- The 'source-documents' bucket (GHG evidence) has never declared allowed_mime_types or
-- file_size_limit. 20260723_cbam_source_documents_bucket.sql set both for the CBAM bucket and
-- named this gap in a comment — "The GHG bucket has neither; that is a gap not worth replicating"
-- — but nothing closed it here. This closes it.
--
-- WHY IT MATTERS, CONCRETELY. Without an allowlist a customer can upload an HTML file. Supabase
-- stores the browser-reported MIME type and serves it back with that Content-Type, so the file
-- renders as a PAGE — running script — when an assurance provider opens it from /verify/[token].
-- The party who benefits from redirecting or misleading a verifier is the party being verified, so
-- this is not a theoretical actor. The verifier pages also sever window.opener on every document
-- they open, which blocks the reverse-tabnabbing route specifically; this stops the document being
-- an executable page in the first place, which is the better place to stop it.
--
-- IT IS A SERVER-SIDE CONTROL, WHICH IS THE POINT. The wizard's file picker carries
-- accept=".pdf,.xlsx,.csv,.jpg,.png" (app/dashboard/ghg/page.tsx), but `accept` is a hint to the
-- file dialog and nothing more: a customer can bypass the page and call the Storage API directly
-- with their own session and any Content-Type they choose. allowed_mime_types is enforced by the
-- storage service and cannot be bypassed that way.
--
-- ── ⚠️ WHAT THIS DOES NOT DO — READ BEFORE ASSUMING THE HOLE IS CLOSED ────────────────────────
-- allowed_mime_types applies to NEW uploads only. It does not inspect, re-type, quarantine or
-- delete anything already in the bucket. If an HTML file was uploaded before this runs, it keeps
-- its stored content-type and is STILL served as text/html afterwards. Same for file_size_limit:
-- existing oversized objects stay.
--
-- The audit queries at the foot of this file are therefore part of the change, not optional
-- follow-up. Run them BEFORE applying, so the answer is known rather than assumed.

-- ── The bucket declaration ───────────────────────────────────────────────────────────────────
-- Idempotent, and re-runnable: insert-or-update on the primary key, same shape as the CBAM
-- migration. If the row exists (it does — customers have been uploading to it), this is an UPDATE
-- of the three settings and nothing else. No policies are created here, so unlike the CBAM
-- migration there is nothing in this file that fails on a second run.
--
-- `public` is asserted false rather than left alone. It is not recorded anywhere in git today, so
-- a rebuild has no way to know what it should be, and every verifier flow assumes it: the whole
-- signed-URL design is pointless against a public bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-documents',
  'source-documents',
  false,
  26214400,                       -- 25 MB — see the reasoning block below.
  array[
    -- The five CBAM declares, so the two evidence buckets accept the same genres of document.
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',   -- .xlsx

    -- ── Two additions CBAM does not have, and needs. ──
    -- The MIME type stored is whatever the BROWSER reports for the chosen file
    -- (supabase-js uploads a File inside multipart form-data, so the part's own type wins — it is
    -- not something this codebase sets). Browsers do not agree about .csv:
    --   • Windows with Excel installed reports 'application/vnd.ms-excel' for a .csv file.
    --   • Some systems report 'text/plain'.
    -- The picker invites .csv, so rejecting the two forms most Windows customers would actually
    -- produce would wall off a file type the product asks for. Neither renders as an active
    -- document, so neither reopens the hole this migration closes.
    'application/vnd.ms-excel',
    'text/plain'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Why 25 MB ────────────────────────────────────────────────────────────────────────────────
-- The concierge upload copy promises "PDF or photo (JPG, PNG) — large phone photos are fine"
-- (app/dashboard/ghg/page.tsx), so the cap has to clear a large phone photo with room to spare:
--   • a typical iPhone/Android JPEG           2–5 MB
--   • a 48MP JPEG at maximum quality         10–15 MB
--   • a scanned multi-page utility bill       5–20 MB
-- 25 MB clears all three, and matches CBAM so the two buckets do not need separate explanations.
-- The likelier thing to hit it is a long scanned PDF, not a photo, so the copy stays honest.
--
-- If a customer does hit it they SEE it: the wizard surfaces the storage error verbatim
-- ("<file> didn't upload — <message>"), so this fails loudly rather than silently dropping a file.
-- Raising the number later is a one-line re-run of this file. Note it cannot exceed the
-- project-level upload limit set in Supabase (Settings → Storage); 25 MB is inside the default.

-- ── ⚠️ RUN THESE FIRST — what is already in the bucket ────────────────────────────────────────
-- Read-only. Neither changes anything. They answer the two questions this migration cannot:
-- whether anything already stored falls outside the new list, and whether anything exceeds the cap.
--
-- (1) Every MIME type present, most common first. Anything NOT in the array above is a file this
--     migration would have blocked — and which is still being served as-is. 'text/html',
--     'image/svg+xml' or 'application/xhtml+xml' appearing here is the live hazard and should be
--     inspected and removed, not left:
--
--     select coalesce(metadata->>'mimetype', '(none recorded)') as mime,
--            count(*) as files,
--            pg_size_pretty(max((metadata->>'size')::bigint)) as largest
--       from storage.objects
--      where bucket_id = 'source-documents'
--      group by 1
--      order by 2 desc;
--
-- (2) The specific files that would now be rejected, so each can be looked at by name:
--
--     select name, metadata->>'mimetype' as mime, created_at
--       from storage.objects
--      where bucket_id = 'source-documents'
--        and coalesce(metadata->>'mimetype', '') <> all (array[
--              'application/pdf','image/png','image/jpeg','text/csv',
--              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
--              'application/vnd.ms-excel','text/plain'])
--      order by created_at desc;
--
-- (3) Anything above the new 25 MB cap. These keep working; they just could not be re-uploaded:
--
--     select name, pg_size_pretty((metadata->>'size')::bigint) as size, created_at
--       from storage.objects
--      where bucket_id = 'source-documents'
--        and (metadata->>'size')::bigint > 26214400
--      order by (metadata->>'size')::bigint desc;

-- ── STILL NOT IN GIT: this bucket's RLS policies ─────────────────────────────────────────────
-- The CBAM migration describes its own policies as mirroring "the proven GHG pattern" — files at
-- <auth.uid()>/... with the first folder segment matching the caller's uid — but the GHG policies
-- themselves have never been captured, so a from-scratch rebuild would restore this bucket with
-- NO row-level policies at all. They are deliberately not reproduced here from that description:
-- writing a security policy from a second-hand paraphrase is how a rebuild ends up with something
-- that looks right and is not.
--
-- To capture them properly, run this and the output can be committed verbatim as its own migration:
--
--     select policyname, cmd, roles, qual, with_check
--       from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--      order by policyname;
--
-- (Filter the result to the policies naming 'source-documents'.) Until that exists, this bucket
-- belongs on the CLAUDE.md list of DB state the repo is not the source of truth for.
