-- Explicit local payment records. Existing charge totals remain undated.
alter table public.affairs_charges
  add column legacy_amount_paid numeric(12,2),
  add constraint affairs_charges_legacy_paid_check
    check(legacy_amount_paid is null or legacy_amount_paid between 0 and amount_paid),
  add constraint affairs_charges_payment_owner_key unique(id,student_id);
comment on column public.affairs_charges.legacy_amount_paid is
  'Cumulative paid amount already on the charge before the first dated entry. Undated and immutable once captured. NULL means the existing paid amount is still wholly undated.';

create table public.affairs_charge_payment_entries (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null,
  student_id uuid not null,
  entry_kind text not null check(entry_kind in ('payment','reversal')),
  paid_on date not null check(paid_on between date '1900-01-01' and date '2100-12-31'),
  amount numeric(12,2) not null check(amount>0),
  currency text not null check(currency='TWD'),
  source_mode text not null default 'local_recorded' check(source_mode='local_recorded'),
  reverses_payment_id uuid unique,
  recorded_at timestamptz not null default now(),
  unique(id,charge_id,student_id),
  foreign key(charge_id,student_id) references public.affairs_charges(id,student_id) on delete restrict,
  foreign key(reverses_payment_id,charge_id,student_id)
    references public.affairs_charge_payment_entries(id,charge_id,student_id) on delete restrict,
  check((entry_kind='reversal')=(reverses_payment_id is not null) and id is distinct from reverses_payment_id)
);
create index affairs_charge_payment_entries_student_date_idx
  on public.affairs_charge_payment_entries(student_id,paid_on desc,id desc);
create index affairs_charge_payment_entries_charge_idx
  on public.affairs_charge_payment_entries(charge_id,student_id);
comment on table public.affairs_charge_payment_entries is
  'Append-only local entries, not institutional, bank or provider confirmation. paid_on is the explicitly supplied Taipei business date of the event; recorded_at is administrative capture time. A reversal corrects a local entry and does not assert a refund.';

create table private.affairs_charge_payment_operations (
  actor_id uuid not null references public.affairs_profiles(user_id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  payload jsonb not null,
  receipt jsonb not null,
  primary key(actor_id,request_id)
);
alter table public.affairs_charge_payment_entries enable row level security;
alter table private.affairs_charge_payment_operations enable row level security;
revoke all on public.affairs_charge_payment_entries,private.affairs_charge_payment_operations
  from public,anon,authenticated,service_role;

-- The old manager may still change an undated charge or edit its other fields.
-- A dated payment is inserted under the charge row lock before changing its total.
create function private.affairs_guard_charge_payment_total() returns trigger
language plpgsql set search_path='' as $$
declare expected_paid numeric;
begin
  if tg_op='INSERT' then
    if new.legacy_amount_paid is not null then
      raise exception 'A new charge cannot start with a dated-payment baseline' using errcode='22023';
    end if;
    return new;
  end if;
  if old.legacy_amount_paid is null and new.legacy_amount_paid is null then return new; end if;
  if new.legacy_amount_paid is distinct from coalesce(old.legacy_amount_paid,old.amount_paid) then
    raise exception 'The undated payment baseline is immutable' using errcode='PT409';
  end if;
  if old.legacy_amount_paid is not null and new.amount_paid=old.amount_paid then return new; end if;
  select new.legacy_amount_paid+sum(case when entry_kind='payment' then amount else -amount end)
    into expected_paid from public.affairs_charge_payment_entries
    where charge_id=new.id and student_id=new.student_id;
  if new.amount_paid is distinct from expected_paid then
    raise exception 'Use the dated payment ledger to change the recorded paid amount' using errcode='PT409';
  end if;
  return new;
end;
$$;
revoke all on function private.affairs_guard_charge_payment_total() from public,anon,authenticated,service_role;
create trigger affairs_guard_charge_payment_total
  before insert or update of amount_paid,legacy_amount_paid on public.affairs_charges
  for each row execute function private.affairs_guard_charge_payment_total();

create function public.affairs_change_charge_payment(p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=(select auth.uid());
  request_key uuid;
  charge public.affairs_charges;
  entry public.affairs_charge_payment_entries;
  original public.affairs_charge_payment_entries;
  previous private.affairs_charge_payment_operations;
  fields text[];
  value_date date;
  value_amount numeric(12,2);
  next_paid numeric;
  result jsonb;
begin
  if actor is null or not (select private.affairs_google_identity()) or not (select private.affairs_is_admin()) then
    raise exception 'Verified administrator access required' using errcode='42501';
  end if;
  fields:=case p_kind
    when 'record_charge_payment' then array['request_id','student_id','charge_id','paid_on','amount','currency']
    when 'reverse_charge_payment' then array['request_id','student_id','charge_id','paid_on','payment_id'] end;
  if fields is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>1500 or not(p_payload ?& fields) or p_payload-fields<>'{}'::jsonb
    or exists(select 1 from jsonb_each(p_payload) where jsonb_typeof(value)<>'string') then
    raise exception 'Invalid dated charge payment request' using errcode='22023';
  end if;
  if exists(select 1 from unnest(fields) as field(name) where right(field.name,3)='_id'
    and p_payload->>field.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    or p_payload->>'paid_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid payment identifiers or date' using errcode='22023';
  end if;
  begin
    value_date:=(p_payload->>'paid_on')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid payment business date' using errcode='22023';
  end;
  if value_date<date '1900-01-01' or value_date>date '2100-12-31'
    or value_date>(clock_timestamp() at time zone 'Asia/Taipei')::date then
    raise exception 'Choose a valid Taipei payment business date' using errcode='22023';
  end if;
  if p_kind='record_charge_payment' then
    if p_payload->>'amount' !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' or p_payload->>'currency'<>'TWD' then
      raise exception 'Amount must be a positive exact decimal in TWD' using errcode='22023';
    end if;
    value_amount:=(p_payload->>'amount')::numeric;
    if value_amount=0 then raise exception 'Amount must be positive' using errcode='22023'; end if;
  end if;

  request_key:=(p_payload->>'request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request_key::text,584890));
  select * into previous from private.affairs_charge_payment_operations where actor_id=actor and request_id=request_key;
  if found then
    if previous.kind<>p_kind or previous.payload<>p_payload then
      raise exception 'Payment request identifier was reused with different details' using errcode='PT409';
    end if;
    return previous.receipt;
  end if;

  select * into charge from public.affairs_charges
    where id=(p_payload->>'charge_id')::uuid and student_id=(p_payload->>'student_id')::uuid for update;
  if not found then raise exception 'Selected charge is unavailable' using errcode='PT404'; end if;
  if p_kind='record_charge_payment' then
    next_paid:=charge.amount_paid+value_amount;
    if next_paid>charge.amount_due then
      raise exception 'Payment exceeds the charge balance' using errcode='PT409';
    end if;
  else
    select * into original from public.affairs_charge_payment_entries
      where id=(p_payload->>'payment_id')::uuid and charge_id=charge.id and student_id=charge.student_id and entry_kind='payment';
    if not found then raise exception 'Selected payment is unavailable' using errcode='PT404'; end if;
    if value_date<original.paid_on then
      raise exception 'Reversal date cannot precede the payment date' using errcode='22023';
    end if;
    if exists(select 1 from public.affairs_charge_payment_entries where reverses_payment_id=original.id) then
      raise exception 'The payment is already reversed' using errcode='PT409';
    end if;
    value_amount:=original.amount;
    next_paid:=charge.amount_paid-value_amount;
  end if;
  insert into public.affairs_charge_payment_entries(charge_id,student_id,entry_kind,paid_on,amount,currency,reverses_payment_id)
    values(charge.id,charge.student_id,case p_kind when 'record_charge_payment' then 'payment' else 'reversal' end,
      value_date,value_amount,charge.currency,original.id)
    returning * into entry;

  update public.affairs_charges set amount_paid=next_paid,legacy_amount_paid=coalesce(charge.legacy_amount_paid,charge.amount_paid)
    where id=charge.id and student_id=charge.student_id returning * into charge;
  result:=jsonb_build_object('id',entry.id,'chargeId',charge.id,'studentId',charge.student_id,'entryKind',entry.entry_kind,
    'paidOn',to_char(entry.paid_on,'YYYY-MM-DD'),'amount',entry.amount::text,'currency',entry.currency,
    'sourceMode',entry.source_mode,'reversesPaymentId',entry.reverses_payment_id,
    'amountPaid',charge.amount_paid::text,'legacyAmountPaid',charge.legacy_amount_paid::text);
  insert into public.affairs_agent_audit(user_id,action_kind,target_id,summary)
    values(actor,p_kind,entry.id,case entry.entry_kind when 'payment' then 'Recorded dated local charge payment'
      else 'Reversed dated local charge payment' end);
  insert into private.affairs_charge_payment_operations(actor_id,request_id,kind,payload,receipt)
    values(actor,request_key,p_kind,p_payload,result);
  return result;
end;
$$;
revoke all on function public.affairs_change_charge_payment(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.affairs_change_charge_payment(text,jsonb) to authenticated;

create function public.affairs_read_charge_payment_history(
  p_from date,p_through date,p_charge_id uuid,p_offset integer,p_limit integer
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid());
  student uuid;
  entries jsonb;
  matched bigint;
  undated boolean;
begin
  if caller is null or not(select private.affairs_google_identity()) then
    raise exception 'Verified School Affairs sign-in required' using errcode='42501';
  end if;
  if p_offset is null or p_offset not between 0 and 5000 or p_limit is null or p_limit not between 1 and 100
    or (p_from is not null and p_from not between date '1900-01-01' and date '2100-12-31')
    or (p_through is not null and p_through not between date '1900-01-01' and date '2100-12-31')
    or p_from>p_through then
    raise exception 'Invalid charge payment history range' using errcode='22023';
  end if;
  select id into student from public.affairs_students where user_id=caller;
  select count(*) into matched from public.affairs_charge_payment_entries e
    where e.student_id=student and (p_charge_id is null or e.charge_id=p_charge_id)
      and (p_from is null or e.paid_on>=p_from) and (p_through is null or e.paid_on<=p_through);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'chargeId',e.charge_id,'chargeLabel',c.label,
      'chargeCategory',c.category,
      'entryKind',e.entry_kind,'paidOn',to_char(e.paid_on,'YYYY-MM-DD'),'amount',e.amount::text,
      'currency',e.currency,'sourceMode',e.source_mode,'reversesPaymentId',e.reverses_payment_id) order by e.paid_on desc,e.id desc),'[]'::jsonb)
    into entries from (
      select * from public.affairs_charge_payment_entries e
        where e.student_id=student and (p_charge_id is null or e.charge_id=p_charge_id)
          and (p_from is null or e.paid_on>=p_from) and (p_through is null or e.paid_on<=p_through)
        order by e.paid_on desc,e.id desc limit p_limit offset p_offset
    ) e join public.affairs_charges c on c.id=e.charge_id and c.student_id=e.student_id;
  select exists(select 1 from public.affairs_charges c where c.student_id=student
    and (p_charge_id is null or c.id=p_charge_id) and coalesce(c.legacy_amount_paid,c.amount_paid)>0) into undated;
  return jsonb_build_object('userId',caller,'studentRecordFound',student is not null,'rows',entries,'total',matched,
    'hasUndatedPaidAmount',undated);
end;
$$;
revoke all on function public.affairs_read_charge_payment_history(date,date,uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.affairs_read_charge_payment_history(date,date,uuid,integer,integer) to authenticated;
