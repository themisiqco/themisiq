# Supplier-Portal RLS Remediation Plan

Here's the remediation plan. **Output only — nothing applied, no files edited.** When you're ready, this would land as one new SQL migration plus a small set of code edits, deployed in the order given at the end.

---

## 1. Strategy & the one hard constraint

The fix has three moving parts that must ship **together**:

- **A. Lock the tables** — enable RLS and add authenticated-owner policies (this is genuinely RLS-enforceable).
- **B. Replace the public portal's direct table access with token-scoped `SECURITY DEFINER` functions** — because of the constraint below.
- **C. Move the three anon API routes to the authed-client pattern** `scope3-cat1` already uses, deriving identity from the verified JWT instead of trusting `buyer_id`/`supplier_id` from the client.

**The hard constraint (read this first — it's the thing most likely to be done wrong):**

> You **cannot** satisfy "let an anon visitor read only the single row matching their token" with an RLS `USING` clause on a direct table query.

RLS `USING` is evaluated per row, independent of the `WHERE` the client sends. An anon `SELECT` policy of `USING (true)` makes the portal work — but a malicious anon client just runs `supabase.from('campaign_suppliers').select('*')` with no filter and reads **every** supplier's email and **every** response. There is no `auth.uid()` for anon and RLS can't read the URL token, so there's nothing for the policy to scope on. **The token must be passed as a verified function argument.** That means the anon path moves to `SECURITY DEFINER` RPCs (recommended) — and there are therefore **no anon policies on the tables at all**.

(Alternative to RPCs: route the portal through server-side Next API routes using the `service_role` key, with the route code enforcing `where token = …`. Equivalent safety; more code; keeps logic in TS instead of SQL. I've gone with RPCs below since they keep the boundary in the database next to the data. Either is fine — but **not** anon `USING(true)`.)

---

## 2. SQL Part A — enable RLS + authenticated-owner policies

```sql
-- ── Enable RLS on all three tables ────────────────────────────────────
alter table supplier_campaigns  enable row level security;
alter table campaign_suppliers  enable row level security;
alter table supplier_responses  enable row level security;
-- service_role (BYPASSRLS) still bypasses these — that's intended for any
-- service-role server route. The browser anon/authenticated clients do not.

-- Helpful indexes for the EXISTS checks below (campaign_id may be unindexed):
create index if not exists campaign_suppliers_campaign_id_idx
  on campaign_suppliers (campaign_id);
-- supplier_responses(campaign_supplier_id, question_id) unique index already
-- exists from the schema migration; it covers the responses checks.

-- ── supplier_campaigns: buyer owns the row ────────────────────────────
create policy campaigns_select_own on supplier_campaigns
  for select to authenticated using (buyer_id = auth.uid());
create policy campaigns_insert_own on supplier_campaigns
  for insert to authenticated with check (buyer_id = auth.uid());
create policy campaigns_update_own on supplier_campaigns
  for update to authenticated using (buyer_id = auth.uid())
                                with check (buyer_id = auth.uid());
create policy campaigns_delete_own on supplier_campaigns
  for delete to authenticated using (buyer_id = auth.uid());

-- ── campaign_suppliers: scoped through the owning campaign ─────────────
create policy suppliers_select_own on campaign_suppliers
  for select to authenticated using (
    exists (select 1 from supplier_campaigns c
            where c.id = campaign_suppliers.campaign_id
              and c.buyer_id = auth.uid()));
create policy suppliers_insert_own on campaign_suppliers
  for insert to authenticated with check (
    exists (select 1 from supplier_campaigns c
            where c.id = campaign_id            -- the row being inserted
              and c.buyer_id = auth.uid()));
create policy suppliers_update_own on campaign_suppliers
  for update to authenticated
    using      (exists (select 1 from supplier_campaigns c
                        where c.id = campaign_suppliers.campaign_id
                          and c.buyer_id = auth.uid()))
    with check (exists (select 1 from supplier_campaigns c
                        where c.id = campaign_suppliers.campaign_id
                          and c.buyer_id = auth.uid()));
create policy suppliers_delete_own on campaign_suppliers
  for delete to authenticated using (
    exists (select 1 from supplier_campaigns c
            where c.id = campaign_suppliers.campaign_id
              and c.buyer_id = auth.uid()));

-- ── supplier_responses: scoped through supplier → campaign ────────────
-- Buyers only READ responses (export). All response WRITES happen via the
-- SECURITY DEFINER RPCs in Part B, so no authenticated insert/update here.
create policy responses_select_own on supplier_responses
  for select to authenticated using (
    exists (select 1 from campaign_suppliers s
            join supplier_campaigns c on c.id = s.campaign_id
            where s.id = supplier_responses.campaign_supplier_id
              and c.buyer_id = auth.uid()));
```

Note: no policy mentions `anon`, so after this runs the anon role can read/write **nothing** on these tables directly. That's the point — the portal switches to RPCs.

---

## 3. SQL Part B — token-scoped RPCs for the public portal (the anon path)

```sql
-- Look up the one supplier row + its campaign + existing responses by token,
-- and flip 'invited' → 'in_progress' on first touch. Definer = bypasses RLS,
-- but only ever returns the single row whose token was supplied.
create or replace function public.portal_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  select jsonb_build_object(
           'supplier',  to_jsonb(s),
           'campaign',  to_jsonb(c),
           'responses', coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'question_id', r.question_id, 'response', r.response))
                from supplier_responses r where r.campaign_supplier_id = s.id),
             '[]'::jsonb))
    into v
    from campaign_suppliers s
    join supplier_campaigns c on c.id = s.campaign_id
   where s.token = p_token;

  if v is null then
    raise exception 'invalid token' using errcode = 'no_data_found';
  end if;

  update campaign_suppliers
     set status = 'in_progress'
   where token = p_token and status = 'invited';

  return v;
end;
$$;

-- Upsert a single answer, scoped by token; refuse once submitted.
create or replace function public.portal_save_response(
  p_token text, p_section text, p_question_id text, p_response text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_status text;
begin
  select id, status into v_id, v_status
    from campaign_suppliers where token = p_token;
  if v_id is null then
    raise exception 'invalid token' using errcode = 'no_data_found';
  end if;
  if v_status = 'completed' then
    raise exception 'questionnaire already submitted';
  end if;
  insert into supplier_responses
        (campaign_supplier_id, section, question_id, response, updated_at)
  values (v_id, p_section, p_question_id, p_response, now())
  on conflict (campaign_supplier_id, question_id)
  do update set response = excluded.response,
                section  = excluded.section,
                updated_at = now();
end;
$$;

-- Final submit, scoped by token.
create or replace function public.portal_submit(p_token text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update campaign_suppliers
     set status = 'completed', completed_at = now()
   where token = p_token and status <> 'completed';
  if not found then
    raise exception 'invalid or already-submitted token'
      using errcode = 'no_data_found';
  end if;
end;
$$;

-- Least privilege on the functions: only the portal roles may execute.
revoke all on function public.portal_get(text)                         from public;
revoke all on function public.portal_save_response(text,text,text,text) from public;
revoke all on function public.portal_submit(text)                      from public;
grant execute on function public.portal_get(text)                         to anon, authenticated;
grant execute on function public.portal_save_response(text,text,text,text) to anon, authenticated;
grant execute on function public.portal_submit(text)                      to anon, authenticated;
```

`SET search_path = public` on each is deliberate — without it a `SECURITY DEFINER` function is a privilege-escalation vector. Don't omit it.

---

## 4. Code changes (no edits made — shown for review)

### 4a. `app/api/campaigns/route.ts` — derive `buyer_id` from the verified token
Replace the anon `getSupabase()` with `getAuthedClient(bearerFrom(req))`. Stop reading `buyer_id` from the body/query entirely.

```ts
// POST
const { supabase, userId } = await getAuthedClient(bearerFrom(req))
const { name, description, reporting_year, deadline, questionnaire_template } = body
if (!name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
const { data, error } = await supabase.from('supplier_campaigns')
  .insert({ buyer_id: userId, name, /* …rest… */ }).select().single()

// GET  (drop ?buyer_id — identity comes from the token; RLS filters too)
const { supabase, userId } = await getAuthedClient(bearerFrom(req))
const { data, error } = await supabase.from('supplier_campaigns')
  .select('*').eq('buyer_id', userId).order('created_at', { ascending: false })
```
Wrap both in the same `try/catch (AuthError → 401)` block `scope3-cat1` uses.

### 4b. `app/api/supplier-invite/route.ts` — authed client + ownership via RLS
Switch `getSupabase()` (anon) to `getAuthedClient(bearerFrom(req))`. The existing `.from('campaign_suppliers').select(...).eq('id', supplier_id).single()` then returns a row **only if the caller owns the parent campaign** (RLS), so an unowned `supplier_id` yields the existing `404` and **no email is sent**. The `reminder_sent_at` update is likewise owner-scoped. Resend sending is unchanged. (The `RESEND_API_KEY` stays a server secret in this route — good.)

### 4c. Frontend callers must send the bearer token
- `app/dashboard/supply-chain/portal/page.tsx` → `loadCampaigns`: `fetch('/api/campaigns', { headers: { Authorization: \`Bearer ${session.access_token}\` } })` and drop `?buyer_id=…`. `createCampaign` POST: add the same header, drop `buyer_id` from the body.
- `app/dashboard/supply-chain/portal/[id]/page.tsx` → `sendInvite`: add `Authorization: Bearer <session token>` to the `fetch('/api/supplier-invite', …)` call (it currently sends none).

The other dashboard reads/writes (`portal/[id]/page.tsx` supplier insert/update/read, the counts on the index, the supplier-detail page) use the **browser client, which already carries the logged-in user's JWT** → they run as `authenticated` and are covered by the Part A policies **with no code change**.

### 4d. `app/supplier/[token]/page.tsx` — direct table calls → RPCs
This is the only place that must change to keep the public portal working under locked-down RLS:
- `loadSupplier`: replace the `.from('campaign_suppliers').select('*, supplier_campaigns(*)').eq('token', …)` + responses read + `status='in_progress'` update with **one** `supabase.rpc('portal_get', { p_token: token })`, then read `.supplier`, `.campaign`, `.responses` off the result.
- `saveResponse`: `supabase.rpc('portal_save_response', { p_token: token, p_section, p_question_id: questionId, p_response: value })`.
- `submit`: `supabase.rpc('portal_submit', { p_token: token })`.

It still uses the anon browser client — but now only via the three granted functions.

---

## 5. Deploy order (getting this wrong breaks the portal)

1. **SQL Part B first** (create the RPCs) — harmless while old code still uses direct tables.
2. **Ship the code changes** (4a–4d) — frontend now uses RPCs + bearer-authenticated API routes, but tables are still open, so nothing breaks if there's a lag.
3. **SQL Part A last** (enable RLS + policies) — once the app no longer relies on anon direct-table access.

If you enable RLS (step 3) **before** steps 1–2, the public portal goes blank/500 (anon loses table access) and the three API routes start returning empty/erroring. The authenticated dashboard direct queries keep working throughout (they already run as `authenticated`).

---

## 6. The two-account manual test that proves isolation

Set up **Buyer A** and **Buyer B** (two logins). As **A**: create a campaign, add a supplier (real email), copy the supplier's portal link (capture A's `campaign_id` and the `token`).

**Cross-tenant (the IDOR checks) — logged in as B:**
1. Dashboard browser console: `await supabase.from('supplier_campaigns').select('*')` → returns **only B's** campaigns; `…select('*').eq('id','<A_campaign_id>')` → **empty**.
2. `await supabase.from('campaign_suppliers').select('*')` and `…from('supplier_responses').select('*')` → **0 of A's rows**.
3. `GET /api/campaigns` with B's bearer → only B's campaigns. Re-add the old `?buyer_id=<A_id>` param → **ignored**, still only B's.
4. `POST /api/supplier-invite` with B's bearer and **A's** `supplier_id` → **404**, and **no email arrives** at A's supplier. (This is the key proof the invite IDOR is closed.)

**Anon checks — logged out / no token:**
5. `GET /api/campaigns` with no `Authorization` header → **401**.
6. Anon `supabase.from('campaign_suppliers').select('*')` → **0 rows** (no anon policy).
7. Open `/supplier/<A's real token>` → A's questionnaire loads, autosave works, submit works (proves the RPC path is intact).
8. Open `/supplier/<garbage token>` → "Link not found"; `supabase.rpc('portal_get',{p_token:'garbage'})` → error/empty (proves enumeration is blocked).

**DB sanity:**
9. `select relname, relrowsecurity from pg_class where relname in ('supplier_campaigns','campaign_suppliers','supplier_responses');` → all `true`.

Pass = steps 1–4 and 6 return nothing/deny, 5 and 8 deny, **and** 7 still works.

---

## 7. What could break the portal if done wrong — explicit flags

- **Enabling RLS before the RPCs + code ship** (§5) → public portal and the three API routes break immediately. Sequencing is the biggest risk.
- **Taking the shortcut of an anon `USING(true)` SELECT policy** → portal works, but the IDOR is *not* fixed (anon can dump every supplier email and response). This is the trap; do not do it.
- **`SECURITY DEFINER` without `SET search_path`** → privilege-escalation hole. Keep it on every function.
- **Missing `WITH CHECK` on insert/update** (campaigns and suppliers) → a user could create rows owned by someone else or re-parent a supplier into another buyer's campaign. Both `USING` and `WITH CHECK` are required on updates.
- **Leaving `/api/supplier-invite` on the anon key (or moving it to `service_role` without an ownership check)** → the invite IDOR persists; a caller could trigger emails and read another tenant's supplier/campaign data. It must derive ownership from the verified JWT (it's a buyer-initiated, authenticated action).
- **Forgetting the bearer header in the frontend callers** (loadCampaigns, createCampaign, sendInvite) → those features 401 after Part A even though the backend is correct.
- **Performance**: the child-table policies use `EXISTS` subqueries per row — the `campaign_suppliers(campaign_id)` index in Part A matters; without it, large campaigns get slow. (Optional hardening: wrap the ownership check in a `SECURITY DEFINER` `is_campaign_owner(uuid)` helper to keep the policy expression stable and avoid re-running RLS on the joined table.)
- **`token` must stay populated**: this whole anon path keys on `campaign_suppliers.token`. It still depends on the column default from the (not-yet-applied) schema migration — if that default isn't live, `portal_get` finds nothing and every invite link 404s, independent of RLS.

If you want, I can turn §2–§3 into a ready-to-run `supabase/migrations/20260619_supplier_portal_rls.sql` (idempotent, same style as the others) and stage the §4 code edits as a reviewable diff — but per your instruction I've applied nothing here.
