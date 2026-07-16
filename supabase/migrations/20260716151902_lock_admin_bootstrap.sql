-- The production owner account is provisioned before this migration is applied.
-- Further role assignment is performed by an existing administrator through a
-- trusted server-side administrative workflow, never by a browser-editable claim.
revoke execute on function public.claim_initial_admin() from authenticated;
