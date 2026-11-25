\set ON_ERROR_STOP on
-- psql -h <private-local-socket> -d charge_payment_admin_disposable -f tests/evaluation/charge-payment-history-admin.sql
do $$
begin
  if current_database()<>'charge_payment_admin_disposable' or inet_server_addr() is not null
    or to_regnamespace('auth') is not null or to_regclass('public.affairs_charges') is not null then
    raise exception 'Use an empty, local socket-only disposable test database.';
  end if;
end;
$$;

begin;
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema private;
create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
create table auth.identities(user_id uuid not null references auth.users,provider text not null);
create function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

\ir ../../supabase/migrations/20261105010000_school_affairs_workspace.sql
\ir ../../supabase/migrations/20261112080000_pending_fees.sql
\ir ../../supabase/migrations/20261116000000_charge_payment_history.sql
\ir ../../supabase/migrations/20261116010000_charge_payment_history_admin.sql

do $$
declare
  signature text := 'public.affairs_read_charge_payment_history_admin(uuid,uuid,date,date,integer,integer)';
  operator_email text := substring(pg_get_functiondef('private.affairs_is_admin()'::regprocedure)
    from $rx$lower\(u\.email\)\s*=\s*'([^']+)'$rx$);
begin
  if has_function_privilege('anon',signature,'execute')
    or has_function_privilege('service_role',signature,'execute')
    or not has_function_privilege('authenticated',signature,'execute')
    or has_table_privilege('authenticated','public.affairs_charge_payment_entries','select')
    or has_table_privilege('authenticated','public.affairs_charge_payment_entries','update') then
    raise exception 'Unexpected charge ledger privilege.';
  end if;
  -- Model the existing authorization predicate in this disposable Auth schema.
  -- Keep the configured identity in the original migration.
  insert into auth.users(id,email,email_confirmed_at) values
    ('70000000-0000-4000-8000-000000000001','student-a@example.test',now()),
    ('70000000-0000-4000-8000-000000000002','student-b@example.test',now()),
    ('70000000-0000-4000-8000-000000000003',operator_email,now()),
    ('70000000-0000-4000-8000-000000000004','other-admin@example.test',now()),
    ('70000000-0000-4000-8000-000000000005',operator_email,null),
    ('70000000-0000-4000-8000-000000000006',operator_email,now());
  insert into auth.identities select id,case when right(id::text,1)='6' then 'email' else 'google' end from auth.users;
  insert into public.affairs_profiles(user_id,email,display_name,role)
    select id,email,'Disposable ledger fixture',case when right(id::text,1) in ('1','2') then 'student' else 'admin' end
      from auth.users;
end;
$$;

insert into public.affairs_students(id,user_id,student_number,full_name,program_id,year_level)
select f.id,f.user_id,f.number,f.label,p.id,1
from (values
  ('71000000-0000-4000-8000-000000000001'::uuid,'70000000-0000-4000-8000-000000000001'::uuid,'fixture-a','Fixture A'),
  ('71000000-0000-4000-8000-000000000002'::uuid,'70000000-0000-4000-8000-000000000002'::uuid,'fixture-b','Fixture B')
) f(id,user_id,number,label)
cross join public.affairs_programs p where p.code='SAMPLE-GEN';

insert into public.affairs_charges(id,student_id,label,amount_due,amount_paid,category) values
  ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Mock tuition A',100,4,'Tuition'),
  ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','Mock tuition B',100,0,null),
  ('72000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001','Mock other A',100,0,null);

set role authenticated;
do $$
declare caller text;
begin
  foreach caller in array array['','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000004',
    '70000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000006'] loop
    perform set_config('request.jwt.claim.sub',caller,true);
    begin
      perform public.affairs_read_charge_payment_history_admin(
        '71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',null,null,0,25);
      raise exception 'An unverified caller read the staff ledger.';
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;

do $$
declare
  a uuid := '71000000-0000-4000-8000-000000000001';
  b uuid := '71000000-0000-4000-8000-000000000002';
  charge_a uuid := '72000000-0000-4000-8000-000000000001';
  charge_b uuid := '72000000-0000-4000-8000-000000000002';
  other_charge_a uuid := '72000000-0000-4000-8000-000000000003';
  request_body jsonb;
  paid jsonb;
  newer jsonb;
  correction jsonb;
  ledger jsonb;
begin
  perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
  ledger:=public.affairs_read_charge_payment_history_admin(a,charge_a,null,null,0,25);
  if ledger is distinct from jsonb_build_object('studentId',a,'chargeId',charge_a,'rows','[]'::jsonb,'total',0,'hasUndatedPaidAmount',true) then
    raise exception 'An undated balance was displayed as a dated receipt.';
  end if;
  begin
    perform public.affairs_read_charge_payment_history_admin(b,charge_a,null,null,0,25);
    raise exception 'A charge belonging to another student was admitted.';
  exception when sqlstate 'PT404' then null;
  end;
  begin
    perform public.affairs_read_charge_payment_history_admin(a,null,null,null,0,25);
    raise exception 'An unbound charge was admitted.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.affairs_read_charge_payment_history_admin(a,charge_a,'2026-09-30','2026-09-01',0,25);
    raise exception 'An invalid date range was admitted.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.affairs_read_charge_payment_history_admin(a,charge_a,null,null,5001,25);
    raise exception 'An excessive page offset was admitted.';
  exception when invalid_parameter_value then null;
  end;

  request_body:=jsonb_build_object('request_id','73000000-0000-4000-8000-000000000001',
    'student_id',a,'charge_id',charge_a,'paid_on','2026-09-22','amount','10.25','currency','TWD');
  paid:=public.affairs_change_charge_payment('record_charge_payment',request_body);
  ledger:=public.affairs_read_charge_payment_history_admin(a,charge_a,null,null,0,25);
  if ledger->'rows'->0->'canReverse' is distinct from 'true'::jsonb or ledger->'rows'->0->>'id' is distinct from paid->>'id' then
    raise exception 'The saved receipt cannot be selected for reversal.';
  end if;
  newer:=public.affairs_change_charge_payment('record_charge_payment',request_body || jsonb_build_object(
    'request_id','73000000-0000-4000-8000-000000000002','paid_on','2026-09-30','amount','20.50'));
  perform public.affairs_change_charge_payment('record_charge_payment',request_body || jsonb_build_object(
    'request_id','73000000-0000-4000-8000-000000000003','student_id',b,'charge_id',charge_b));
  perform public.affairs_change_charge_payment('record_charge_payment',request_body || jsonb_build_object(
    'request_id','73000000-0000-4000-8000-000000000004','charge_id',other_charge_a));
  correction:=public.affairs_change_charge_payment('reverse_charge_payment',jsonb_build_object(
    'request_id','73000000-0000-4000-8000-000000000005','student_id',a,'charge_id',charge_a,
    'paid_on','2026-10-01','payment_id',paid->>'id'));

  ledger:=public.affairs_read_charge_payment_history_admin(a,charge_a,'2026-09-22','2026-09-30',1,1);
  if ledger->'total' is distinct from '2'::jsonb or ledger->'hasUndatedPaidAmount' is distinct from 'true'::jsonb
    or ledger->'rows' is distinct from jsonb_build_array(jsonb_build_object(
      'id',paid->>'id','chargeId',charge_a,'chargeLabel','Mock tuition A','chargeCategory','Tuition','entryKind','payment',
      'paidOn','2026-09-22','amount','10.25','currency','TWD','sourceMode','local_recorded',
      'reversesPaymentId',null,'canReverse',false)) then
    raise exception 'Exact paging failed to preserve a reversal outside the selected dates.';
  end if;
  ledger:=public.affairs_read_charge_payment_history_admin(a,charge_a,null,null,0,1);
  if ledger->'total' is distinct from '3'::jsonb or ledger->'rows'->0->>'id' is distinct from correction->>'id'
    or ledger->'rows'->0->'canReverse' is distinct from 'false'::jsonb then
    raise exception 'The correction is missing or was offered for reversal.';
  end if;
  ledger:=public.affairs_read_charge_payment_history_admin(a,charge_a,null,null,1,1);
  if ledger->'rows'->0->>'id' is distinct from newer->>'id' or ledger->'rows'->0->'canReverse' is distinct from 'true'::jsonb then
    raise exception 'The next exact receipt was hidden or its reversal was disabled.';
  end if;
  ledger:=public.affairs_read_charge_payment_history_admin(a,charge_a,null,null,2,1);
  if ledger->'rows'->0->>'id' is distinct from paid->>'id' or ledger->'rows'->0->'canReverse' is distinct from 'false'::jsonb then
    raise exception 'A correction on another page was missed.';
  end if;

  perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
  ledger:=public.affairs_read_charge_payment_history(null,null,charge_a,0,25);
  if ledger->'total' is distinct from '3'::jsonb or ledger->'rows'->0?'canReverse'
    or (public.affairs_read_charge_payment_history(null,null,charge_b,0,25)->'total') is distinct from '0'::jsonb then
    raise exception 'The student projection or caller scope changed.';
  end if;
end;
$$;
reset role;
rollback;
