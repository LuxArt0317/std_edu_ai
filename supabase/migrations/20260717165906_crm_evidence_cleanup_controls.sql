grant delete on public.student_signals, public.interactions to authenticated;

create policy signals_delete_admin on public.student_signals for delete to authenticated
using ((select private.has_role(array['admin'])));

create policy interactions_delete_admin on public.interactions for delete to authenticated
using ((select private.has_role(array['admin'])));
