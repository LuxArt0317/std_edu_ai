grant delete on public.cases, public.crm_tasks, public.admission_leads, public.campaigns, public.knowledge_articles to authenticated;

drop policy if exists cases_delete_staff on public.cases;
create policy cases_delete_staff on public.cases for delete to authenticated
using ((select private.has_role(array['admin', 'advisor', 'support'])));

drop policy if exists knowledge_delete_staff on public.knowledge_articles;
create policy knowledge_delete_staff on public.knowledge_articles for delete to authenticated
using ((select private.has_role(array['admin', 'advisor', 'admissions', 'support'])));
