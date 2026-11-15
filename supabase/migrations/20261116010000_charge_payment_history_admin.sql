-- Staff can select a saved payment from the exact charge before reversing it.
create function public.affairs_read_charge_payment_history_admin(
  p_student_id uuid,p_charge_id uuid,p_from date,p_through date,p_offset integer,p_limit integer
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  charge public.affairs_charges;
  entries jsonb;
  matched bigint;
begin
  if (select auth.uid()) is null or not (select private.affairs_is_admin()) then
    raise exception 'Verified School Affairs administrator required' using errcode='42501';
  end if;
  if p_student_id is null or p_charge_id is null
    or p_offset is null or p_offset not between 0 and 5000 or p_limit is null or p_limit not between 1 and 100
    or (p_from is not null and p_from not between date '1900-01-01' and date '2100-12-31')
    or (p_through is not null and p_through not between date '1900-01-01' and date '2100-12-31')
    or p_from>p_through then
    raise exception 'Invalid administrator payment history selection' using errcode='22023';
  end if;
  select c.* into charge from public.affairs_charges c where c.id=p_charge_id and c.student_id=p_student_id;
  if not found then
    raise exception 'Selected charge unavailable' using errcode='PT404';
  end if;
  select count(*) into matched from public.affairs_charge_payment_entries e
    where e.charge_id=charge.id and e.student_id=charge.student_id
      and (p_from is null or e.paid_on>=p_from) and (p_through is null or e.paid_on<=p_through);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'chargeId',e.charge_id,'chargeLabel',charge.label,'chargeCategory',charge.category,
      'entryKind',e.entry_kind,'paidOn',to_char(e.paid_on,'YYYY-MM-DD'),'amount',e.amount::text,
      'currency',e.currency,'sourceMode',e.source_mode,'reversesPaymentId',e.reverses_payment_id,
      'canReverse',e.entry_kind='payment' and not exists (
        select 1 from public.affairs_charge_payment_entries r
        where r.reverses_payment_id=e.id and r.charge_id=e.charge_id and r.student_id=e.student_id
      )
    ) order by e.paid_on desc,e.id desc),'[]'::jsonb)
    into entries from (
      select * from public.affairs_charge_payment_entries e
        where e.charge_id=charge.id and e.student_id=charge.student_id
          and (p_from is null or e.paid_on>=p_from) and (p_through is null or e.paid_on<=p_through)
        order by e.paid_on desc,e.id desc limit p_limit offset p_offset
    ) e;
  return jsonb_build_object('studentId',charge.student_id,'chargeId',charge.id,'rows',entries,'total',matched,
    'hasUndatedPaidAmount',coalesce(charge.legacy_amount_paid,charge.amount_paid)>0);
end;
$$;
revoke all on function public.affairs_read_charge_payment_history_admin(uuid,uuid,date,date,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.affairs_read_charge_payment_history_admin(uuid,uuid,date,date,integer,integer) to authenticated;
