create table public.affairs_aid_payment_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position > 0),
  reason text not null check (length(btrim(reason)) between 1 and 160),
  amount numeric(12,2) check (amount >= 0 and amount <= 9999999999.99),
  approval_result text check (length(approval_result) <= 160),
  approval_status text check (length(approval_status) <= 300),
  unique(user_id,position)
);
create table public.affairs_aid_salary_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position > 0),
  appointment_type text check (length(appointment_type) <= 160),
  payment_period text check (length(payment_period) <= 80),
  rate numeric(12,2), work_units numeric(12,2), gross numeric(12,2),
  employer_labor numeric(12,2), employer_health numeric(12,2), employer_pension numeric(12,2), employer_supplement numeric(12,2),
  subtotal numeric(12,2), student_labor numeric(12,2), student_health numeric(12,2),
  student_pension numeric(12,2), student_supplement numeric(12,2), tax numeric(12,2), net numeric(12,2),
  bank_last4 text check (bank_last4 ~ '^[0-9]{4}$'),
  unique(user_id,position)
);
alter table public.affairs_aid_payment_claims enable row level security;
alter table public.affairs_aid_salary_records enable row level security;
revoke all on public.affairs_aid_payment_claims,public.affairs_aid_salary_records from public,anon,authenticated;
grant select,insert,update,delete on public.affairs_aid_payment_claims,public.affairs_aid_salary_records to service_role;

create function public.affairs_read_aid_payments(p_view text,p_offset integer,p_summary boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid());
  result jsonb;
  total integer;
begin
  if caller is null or not (select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  if p_view is null or p_view not in ('claims','salary') or p_offset is null or p_offset<0 or p_offset>5000 or p_offset%25<>0
    or p_summary is null or (p_summary and p_offset<>0) then
    raise exception 'Invalid payment inquiry' using errcode='22023';
  end if;
  if p_view='claims' then
    select count(*) into total from public.affairs_aid_payment_claims where user_id=caller;
    select coalesce(jsonb_agg(to_jsonb(r)-'user_id'-'position' order by position),'[]') into result
      from (select * from public.affairs_aid_payment_claims where user_id=caller and not p_summary order by position limit 25 offset p_offset) r;
  else
    select count(*) into total from public.affairs_aid_salary_records where user_id=caller;
    select coalesce(jsonb_agg(to_jsonb(r)-'user_id'-'position' order by position),'[]') into result
      from (select * from public.affairs_aid_salary_records where user_id=caller and not p_summary order by position limit 25 offset p_offset) r;
  end if;
  return jsonb_build_object('userId',caller,'view',p_view,'total',total,'rows',result);
end;
$$;
revoke all on function public.affairs_read_aid_payments(text,integer,boolean) from public,anon;
grant execute on function public.affairs_read_aid_payments(text,integer,boolean) to authenticated;
