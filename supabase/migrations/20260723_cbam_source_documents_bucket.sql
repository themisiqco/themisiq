-- supabase/migrations/20260723_cbam_source_documents_bucket.sql
--
-- Storage for CBAM evidence documents: weighbridge tickets, fuel delivery
-- notes, laboratory analyses, production logs. NOT parsed — the operator
-- tallies their own records and enters the figure; the document is the
-- provenance link a verifier traces. Deliberately no extraction: CBAM source
-- documents have no standardised genre (unlike utility bills), and a misread
-- figure would flow into a financial obligation and be tested against the
-- operator's own records on a mandatory site visit.
--
-- The `create policy` statements are NOT idempotent — re-running requires
-- dropping them first.

-- ── CBAM source-document bucket ──────────────────────────────────────────
-- Separate from 'source-documents' (GHG) by deliberate decision: a CBAM
-- verifier and a GHG verifier are different accredited people, and a signed
-- URL issued to one must never resolve to the other's evidence. The isolation
-- is structural, not policy.
--
-- Unlike the GHG bucket, this one carries a size cap and a MIME allowlist.
-- The GHG bucket has neither; that is a gap not worth replicating.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cbam-source-documents',
  'cbam-source-documents',
  false,
  26214400,                       -- 25 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Ownership by path prefix ─────────────────────────────────────────────
-- Mirrors the proven GHG pattern: files live at <auth.uid()>/... and the
-- first folder segment must equal the caller's uid. Scoped by auth.uid(),
-- NOT company_id — consistent with the GHG bucket. Revisit both together if
-- the multi-client agency layer lands.
--
-- SELECT / INSERT / DELETE only. No UPDATE: an uploaded evidence document is
-- immutable. Replacing one means deleting and re-uploading, which leaves a
-- trace; silently mutating a file a verifier has already seen does not.

create policy "CBAM: users can view own documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'cbam-source-documents'
         and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "CBAM: users can upload own documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cbam-source-documents'
              and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "CBAM: users can delete own documents"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cbam-source-documents'
         and (auth.uid())::text = (storage.foldername(name))[1]);
