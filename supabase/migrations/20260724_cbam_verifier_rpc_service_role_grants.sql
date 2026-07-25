-- CBAM verifier portal — Step 4c of 5: service_role EXECUTE on verifier RPCs
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS: cbam_verifier_validate_token and cbam_verifier_accept_invite
-- were originally granted EXECUTE to anon + authenticated only, because they
-- were designed for an unauthenticated verifier calling from the browser.
--
-- The Fork-2 architecture changed the caller: app/api/cbam/verifier-documents/
-- route.ts calls cbam_verifier_validate_token via the SERVICE-ROLE client, so
-- the token is validated server-side and the report is assembled once, under a
-- single trusted identity. service_role was never granted EXECUTE, so the route
-- fails at its first step with a permission error (mapped to validation_failed).
-- Same grants-are-separate-from-RLS class as the table grants (step 4b), one
-- layer up: a route that compiles still fails without the function grant.
--
-- Both RPCs are granted for symmetry. The route currently calls only
-- validate_token, but leaving accept_invite un-granted to service_role is the
-- kind of asymmetry that produces a puzzling failure if a future server path
-- ever calls it. Both remain granted to anon + authenticated as before — this
-- migration is purely additive.
--
-- DEPLOY: do NOT auto-run. Hand-run in the Supabase SQL editor after review.

grant execute on function public.cbam_verifier_validate_token(uuid) to service_role;
grant execute on function public.cbam_verifier_accept_invite(uuid, text, text) to service_role;
