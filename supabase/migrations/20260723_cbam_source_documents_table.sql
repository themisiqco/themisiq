-- supabase/migrations/20260723_cbam_source_documents_table.sql
--
-- Metadata rows for the 'cbam-source-documents' bucket, plus the FK that
-- makes cbam_source_streams.source_doc_id mean something.

-- ── CBAM source documents ────────────────────────────────────────────────
-- Metadata for evidence stored in the 'cbam-source-documents' bucket. Separate
-- from the GHG `source_documents` table by the same reasoning as the bucket:
-- a CBAM verifier's access must never reach GHG evidence, and sharing the
-- table would undermine at the row level what the bucket separation achieves.
--
-- NOT parsed. The operator tallies their own records and enters the figure;
-- this row is the provenance link a verifier follows from a number back to
-- the document behind it.
create table if not exists public.cbam_source_documents (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  file_path     text not null,          -- storage path; ownership is the <uid>/ prefix
  file_name     text not null,
  file_size_kb  numeric,
  mime_type     text,
  document_type text,                   -- free text for now: weighbridge ticket, lab analysis, etc.
  notes         text,
  uploaded_at   timestamptz not null default now(),
  unique (company_id, file_path)
);

-- Composite unique so the FK from cbam_source_streams can enforce that a
-- stream and its document belong to the same company — the same pattern the
-- other cbam_* ownership FKs use.
create unique index if not exists cbam_source_documents_id_company_uniq
  on public.cbam_source_documents (id, company_id);

alter table public.cbam_source_documents enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public'
                   and tablename = 'cbam_source_documents'
                   and policyname = 'cbam_source_documents_owner') then
    create policy cbam_source_documents_owner on public.cbam_source_documents
      for all
      using (company_id in (select id from public.companies where user_id = auth.uid()))
      with check (company_id in (select id from public.companies where user_id = auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on public.cbam_source_documents to authenticated;

-- source_doc_id has been an unconstrained uuid since the table was created —
-- it could hold any value, including one pointing at another company's
-- document or at nothing. The composite FK enforces both that the target
-- exists and that it belongs to the same company as the stream, matching the
-- pattern used by cbam_source_streams_process_company_fk.
--
-- ON DELETE SET NULL, not CASCADE: deleting an evidence document must never
-- silently delete the activity data that cited it. The stream survives with a
-- null provenance link, which the report can surface as a gap.
alter table public.cbam_source_streams
  add constraint cbam_source_streams_doc_company_fk
  foreign key (source_doc_id, company_id)
  references public.cbam_source_documents (id, company_id)
  on delete set null;
