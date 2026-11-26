-- Durable, caller-owned execution claims. Review/receipt signatures are checked
-- by the server; client-visible RPC access cannot forge a server-signed action.
create table public.assistant_api_action_reviews (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
 review jsonb not null check (jsonb_typeof(review)='object' and octet_length(review::text)<=30000),
 expires_at timestamptz not null,
 state text not null default 'pending' check (state in ('pending','executing','completed','failed','outcome_unknown')),
 receipt jsonb check (receipt is null or jsonb_typeof(receipt)='object' and octet_length(receipt::text)<=64000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index assistant_api_reviews_owner on public.assistant_api_action_reviews(user_id,created_at desc);
alter table public.assistant_api_action_reviews enable row level security;
revoke all on public.assistant_api_action_reviews from public,anon,authenticated;
grant select on public.assistant_api_action_reviews to authenticated;
create policy assistant_api_review_owner on public.assistant_api_action_reviews for select to authenticated
 using(user_id=(select auth.uid()) and (select private.affairs_google_identity()));
create function public.assistant_api_create_review(p_record jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_id uuid; v_exp timestamptz;
begin
 if v_uid is null or not private.affairs_google_identity() then raise exception 'Google sign-in required' using errcode='42501';end if;
 if jsonb_typeof(p_record) is distinct from 'object' or octet_length(p_record::text)>30000 or (p_record->>'userId') is distinct from v_uid::text
  or coalesce(p_record->>'signature','') !~ '^[a-f0-9]{64}$' or coalesce(p_record->>'tokenHash','') !~ '^[a-f0-9]{64}$'
  or (p_record->>'state') is distinct from 'pending' or jsonb_typeof(p_record->'call') is distinct from 'object' then raise exception 'Invalid review' using errcode='22023';end if;
 v_id:=(p_record->>'id')::uuid;v_exp:=to_timestamp((p_record->>'expiresAt')::double precision/1000);
 if v_exp is null or v_exp<=now() or v_exp>now()+interval '11 minutes' then raise exception 'Invalid expiry' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('assistant-api-review:'||v_uid::text,0));
 delete from public.assistant_api_action_reviews where user_id=v_uid and state<>'executing' and expires_at<now()-interval '30 days';
 if (select count(*) from public.assistant_api_action_reviews where user_id=v_uid)>=1000 then raise exception 'Review quota reached' using errcode='PT429';end if;
 insert into public.assistant_api_action_reviews(id,user_id,token_hash,review,expires_at) values(v_id,v_uid,p_record->>'tokenHash',p_record,v_exp);
 return jsonb_build_object('id',v_id);
end;$$;
create function public.assistant_api_claim_review(p_id uuid,p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_row public.assistant_api_action_reviews;
begin
 if v_uid is null or not private.affairs_google_identity() then raise exception 'Google sign-in required' using errcode='42501';end if;
 select * into v_row from public.assistant_api_action_reviews where id=p_id and user_id=v_uid and token_hash=p_token_hash for update;
 if not found then raise exception 'Review unavailable' using errcode='42501';end if;
 if v_row.state='completed' then return jsonb_build_object('status','completed','receipt',v_row.receipt);end if;
 if v_row.state<>'pending' or v_row.expires_at<now() then raise exception 'Review expired or already executing' using errcode='PT409';end if;
 update public.assistant_api_action_reviews set state='executing',updated_at=now() where id=p_id;
 return jsonb_build_object('status','claimed','record',v_row.review);
end;$$;
create function public.assistant_api_finish_review(p_id uuid,p_state text,p_receipt jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_row public.assistant_api_action_reviews;
begin
 if v_uid is null or not private.affairs_google_identity() then raise exception 'Google sign-in required' using errcode='42501';end if;
 if p_state is null or p_state not in ('completed','failed','outcome_unknown') or (p_state='completed' and (jsonb_typeof(p_receipt) is distinct from 'object' or octet_length(p_receipt::text)>64000)) then raise exception 'Invalid outcome' using errcode='22023';end if;
 select * into v_row from public.assistant_api_action_reviews where id=p_id and user_id=v_uid for update;
 if not found then raise exception 'Review unavailable' using errcode='42501';end if;
 if v_row.state='completed' and v_row.receipt=p_receipt then return jsonb_build_object('saved',true);end if;
 if v_row.state<>'executing' then raise exception 'Review is not executing' using errcode='PT409';end if;
 update public.assistant_api_action_reviews set state=p_state,receipt=case when p_state='completed' then p_receipt else null end,updated_at=now() where id=p_id;
 return jsonb_build_object('saved',true);
end;$$;
revoke all on function public.assistant_api_create_review(jsonb),public.assistant_api_claim_review(uuid,text),public.assistant_api_finish_review(uuid,text,jsonb) from public,anon;
grant execute on function public.assistant_api_create_review(jsonb),public.assistant_api_claim_review(uuid,text),public.assistant_api_finish_review(uuid,text,jsonb) to authenticated;
