// app/api/cbam/verifier-documents/sign/route.ts
// ThemisIQ — CBAM verifier per-document re-signing endpoint. The sibling
// /api/cbam/verifier-documents route returns documents as ids only (no pre-baked
// URLs); this route mints ONE fresh, short-TTL signed URL for ONE document on
// click, re-validating token + consent + scope EVERY time.
//
// SECURITY POSTURE (mirrors the sibling route):
//   • createServerClient() is the SERVICE-ROLE client: it BYPASSES RLS. The
//     tuple filters below are therefore the ONLY isolation — they must be exact.
//   • The scope tuple (installation_id, company_id, reporting_period) comes ONLY
//     from cbam_verifier_validate_token, NEVER from the request body. The client
//     sends only { token, docId }.
//   • CRITICAL — the in-scope check is a TWO-HOP recomputation identical to the
//     main route: processes for the tuple → source_streams.source_doc_id set.
//     A company_id-only filter would let a verifier sign ANY document the company
//     owns, including docs outside their granted installation/period — a
//     scope-escalation. We verify docId ∈ scopedDocIds before signing anything.
//   • file_path and company_id NEVER leave the server. The response is { url }.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '../../../../../lib/supabase';

const BUCKET = 'cbam-source-documents';   // NOT 'source-documents' — that is GHG evidence.
const SIGNED_URL_TTL = 120;               // 120s — short, since minted on click (was 3600 pre-baked).

// Shape of cbam_verifier_validate_token's jsonb return — same contract the main route consumes.
interface TokenValidation {
  status?: 'invalid' | 'consent_required' | 'valid';
  installation_id?: string;
  company_id?: string;
  reporting_period?: number;
  verifier_name?: string | null;
  installation_name?: string | null;
}

export async function POST(req: NextRequest) {
  // ── Parse the two client inputs. Nothing else is trusted from the body. ──
  let token: unknown;
  let docId: unknown;
  try {
    const body = await req.json();
    token = body?.token;
    docId = body?.docId;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  }
  if (!docId || typeof docId !== 'string') {
    return NextResponse.json({ error: 'missing_doc_id' }, { status: 400 });
  }

  const admin = createServerClient();

  try {
    // ── 1. Validate the grant + consent via the SECURITY DEFINER RPC. Branch identically to the
    // main route: the RPC returns the scope tuple ONLY once accepted_at is set, so this re-enforces
    // token validity AND consent on every click. ──
    const { data: validationData, error: rpcErr } = await admin.rpc('cbam_verifier_validate_token', {
      p_token: token,
    });
    if (rpcErr) {
      console.error('CBAM verifier-sign validate RPC error:', rpcErr);
      return NextResponse.json({ error: 'validation_failed' }, { status: 500 });
    }
    const v = (validationData ?? {}) as TokenValidation;

    if (v.status === 'invalid') {
      return NextResponse.json({ error: 'invalid' }, { status: 403 });
    }
    if (v.status === 'consent_required') {
      return NextResponse.json({ error: 'consent_required' }, { status: 403 });
    }
    if (v.status !== 'valid') {
      // Unknown/absent status — fail closed rather than proceeding without a validated grant.
      return NextResponse.json({ error: 'invalid' }, { status: 403 });
    }

    const installationId = v.installation_id;
    const companyId = v.company_id;
    const reportingPeriod = v.reporting_period;
    // A 'valid' status without the full scope tuple is an internal contract violation, not a client
    // error — never continue with a partial scope.
    if (!installationId || !companyId || reportingPeriod == null) {
      console.error('CBAM verifier-sign validate returned "valid" without a complete scope tuple');
      return NextResponse.json({ error: 'validation_failed' }, { status: 500 });
    }

    // ── 2. Recompute the scoped process ids for the tuple — IDENTICAL derivation to the main route.
    // Service role bypasses RLS, so these three filters are the only isolation. ──
    const { data: processRows, error: processesErr } = await admin
      .from('cbam_production_processes')
      .select('id')
      .eq('installation_id', installationId)
      .eq('company_id', companyId)
      .eq('reporting_period', reportingPeriod);
    if (processesErr) {
      console.error('CBAM verifier-sign processes load error:', processesErr);
      return NextResponse.json({ error: 'scope_load_failed' }, { status: 500 });
    }
    const scopedProcessIds = (processRows ?? []).map((p) => p.id);

    // ── 3. Recompute the in-scope doc id set: source_streams.source_doc_id reachable from the scoped
    // processes, filtered to company_id. Same two-hop the main route uses to assemble documents[]. ──
    const scopedDocIds = new Set<string>();
    if (scopedProcessIds.length > 0) {
      const { data: streamRows, error: streamsErr } = await admin
        .from('cbam_source_streams')
        .select('source_doc_id')
        .eq('company_id', companyId)
        .in('process_id', scopedProcessIds);
      if (streamsErr) {
        console.error('CBAM verifier-sign source_streams load error:', streamsErr);
        return NextResponse.json({ error: 'scope_load_failed' }, { status: 500 });
      }
      for (const r of streamRows ?? []) {
        if (r.source_doc_id != null) scopedDocIds.add(r.source_doc_id as string);
      }
    }

    // ── 4. VERIFY the requested docId is reachable from THIS verifier's granted processes. Never sign
    // a document outside the scoped set, even if the company owns it. ──
    if (!scopedDocIds.has(docId)) {
      return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
    }

    // ── 5. Load the one doc's file_path (company_id-scoped, and already proven in-scope above). ──
    const { data: doc, error: docErr } = await admin
      .from('cbam_source_documents')
      .select('file_path')
      .eq('id', docId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (docErr) {
      console.error('CBAM verifier-sign source_documents load error:', docErr);
      return NextResponse.json({ error: 'document_load_failed' }, { status: 500 });
    }
    if (!doc) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // ── 6. Mint a short-TTL signed URL. file_path never leaves the server — only { url } is returned. ──
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, SIGNED_URL_TTL);
    if (signErr || !signed?.signedUrl) {
      console.error('CBAM verifier-sign createSignedUrl error:', signErr);
      return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
    }

    return NextResponse.json({ url: signed.signedUrl });
  } catch (error) {
    console.error('CBAM verifier-sign route error:', error);
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
  }
}
