-- Issue #126: close the two remaining anonymous research-analysis RPC grants.
-- Public participation RPCs remain token-scoped; analysis is authenticated and role/RLS scoped.
revoke execute on function public.research_sus_score(uuid,text) from public,anon;
revoke execute on function public.research_anonymized_export(uuid) from public,anon;
grant execute on function public.research_sus_score(uuid,text) to authenticated,service_role;
grant execute on function public.research_anonymized_export(uuid) to authenticated,service_role;

