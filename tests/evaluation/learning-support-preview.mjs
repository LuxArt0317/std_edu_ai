import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {createTrustedPreviewFetch} from './vercel-preview-transport.mjs';
import {buildLearningSupportNativePlan,learningSupportNativeBaseline,learningSupportWithdrawalSnapshot,
  readLearningSupportNativeRows} from './learning-support-native-packet.mjs';

export const learningSupportPreviewMode='learning-support-native-preview';
const empty={rows:[],operations:[]};
export class LearningSupportPreviewError extends Error{
  constructor(stage){super('Learning support Preview failed at '+stage+'.');this.stage=stage;}
}
const check=(condition,stage)=>{if(!condition)throw new LearningSupportPreviewError(stage);};

export async function assertLearningSupportPreviewSchema(sql){
  const [contract]=await sql`with objects as (
    select to_regclass('public.affairs_learning_support_requests') as requests,
      to_regclass('private.affairs_learning_support_operations') as operations,
      to_regprocedure('public.affairs_read_learning_support(text,integer)') as reader,
      to_regprocedure('public.affairs_change_learning_support(text,jsonb)') as writer
  )
  select exists(select 1 from supabase_migrations.schema_migrations where version='20261116100000') as applied,
    requests is not null and operations is not null
      and (select count(*) from pg_class where oid in (requests,operations) and relrowsecurity)=2
      and (select count(*) from pg_policy where polrelid in (requests,operations))=1
      and exists(select 1 from pg_policy where polrelid=requests and polname='affairs_learning_support_own'
        and polcmd='r' and polroles=array[(select oid from pg_roles where rolname='authenticated')] and polqual is not null) as rls,
    has_table_privilege('authenticated',requests,'SELECT')
      and not has_table_privilege('authenticated',requests,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_any_column_privilege('authenticated',requests,'INSERT,UPDATE,REFERENCES')
      and not has_table_privilege('authenticated',operations,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_any_column_privilege('authenticated',operations,'SELECT,INSERT,UPDATE,REFERENCES')
      and not has_table_privilege('anon',requests,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_table_privilege('anon',operations,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_any_column_privilege('anon',requests,'SELECT,INSERT,UPDATE,REFERENCES')
      and not has_any_column_privilege('anon',operations,'SELECT,INSERT,UPDATE,REFERENCES') as caller_tables,
    has_function_privilege('authenticated',reader,'EXECUTE')
      and has_function_privilege('authenticated',writer,'EXECUTE')
      and not has_function_privilege('anon',reader,'EXECUTE')
      and not has_function_privilege('anon',writer,'EXECUTE') as caller_rpc,
    has_table_privilege(current_user,requests,'SELECT') and has_table_privilege(current_user,requests,'INSERT')
      and has_table_privilege(current_user,requests,'DELETE') and has_table_privilege(current_user,operations,'SELECT') as operator
  from objects`;
  check(['applied','rls','caller_tables','caller_rpc','operator'].every(name=>contract?.[name]===true),'schema-preflight');
}

export function bindLearningSupportPreview(runId,owners){
  const binding=validateAidPaymentFixtureOwners({runId,owners});
  const plan=buildLearningSupportNativePlan(runId,{A:owners.A.id,B:owners.B.id});
  return {binding,plan,command:null};
}

async function verifyLearningSupportOwners(sql,fixture){
  const {binding,plan}=fixture;
  const {owners}=validateAidPaymentFixtureOwners(binding);
  const ids=Object.values(owners).map(owner=>owner.id);
  check(plan.runId===binding.runId&&plan.owners.A===owners.A.id&&plan.owners.B===owners.B.id,'fixture-plan-identity-binding');
  const rows=await sql`select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as marker,
    u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as google
    from auth.users u where u.id in ${sql(ids)} limit 3`;
  check(rows.length===2&&Object.values(owners).every(owner=>rows.some(row=>row.id===owner.id&&row.email===owner.email
    &&row.marker===binding.runId&&row.google===true)),'disposable-owner-binding');
}

/** Called by the existing fixture lease in its bounded SQL transaction. */
export async function seedLearningSupportPreview(sql,fixture){
  await verifyLearningSupportOwners(sql,fixture);
  const {plan}=fixture;
  check(isDeepStrictEqual(await readLearningSupportNativeRows(sql,plan),empty),'empty-reserved-learning-support-scope');
  await sql`insert into public.affairs_learning_support_requests ${sql(plan.rows)}`;
  check(isDeepStrictEqual(await readLearningSupportNativeRows(sql,plan),learningSupportNativeBaseline(plan)),'exact-seed-readback');
}

/** Acquire the real actor locks and validate the entire private fixture before any deletion. */
export async function cleanupLearningSupportPreview(sql,fixture){
  await verifyLearningSupportOwners(sql,fixture);
  const {plan,command}=fixture;
  for(const id of Object.values(plan.owners).sort())
    await sql`select pg_advisory_xact_lock(hashtextextended('learning-support-actor:'||${id},0))`;
  await sql`select id from public.affairs_learning_support_requests where id in ${sql(plan.rows.map(row=>row.id))} order by id for update`;
  const current=await readLearningSupportNativeRows(sql,plan);
  if(isDeepStrictEqual(current,empty))return;
  const expected=current.operations.length?learningSupportWithdrawalSnapshot(plan,current,command):learningSupportNativeBaseline(plan);
  check(isDeepStrictEqual(current,expected),'cleanup-exact-learning-support-scope');
  for(const row of plan.rows){
    const removed=await sql`delete from public.affairs_learning_support_requests
      where id=${row.id} and user_id=${row.user_id} returning id`;
    check(removed.length===1&&removed[0].id===row.id,'exact-learning-support-delete');
  }
  check(isDeepStrictEqual(await readLearningSupportNativeRows(sql,plan),empty),'learning-support-row-and-operation-cleanup');
}

export async function verifyLearningSupportPreviewAbsent(sql,{plan}){
  const ids=Object.values(plan.owners);
  const [value]=await sql`select (exists(select 1 from auth.users where id in ${sql(ids)})
    or exists(select 1 from auth.identities where user_id in ${sql(ids)})) as remains`;
  check(value?.remains===false&&isDeepStrictEqual(await readLearningSupportNativeRows(sql,plan),empty),
    'learning-support-row-operation-and-identity-cleanup');
}

export function learningSupportPreviewHttp({origin,previewToken,readback,readResponse,fetchImpl,privateMarkers=()=>[]}){
  return async ({mode,callerToken,question,route,command,signal})=>{
    const native=mode==='read',action=mode==='confirm';
    check(['read','ask','confirm'].includes(mode)&&(native||action?typeof callerToken==='string':true),'request-scope');
    const path=native?'/api/affairs-data?scope=learning-support&page=1':action?'/api/affairs-action'
      :callerToken?'/api/affairs-assistant':'/api/research-assistant';
    const endpoint=new URL(path,origin);
    const body=action?command:{question,route,stream:false,consentedResearchUse:false};
    const transport=action?createTrustedPreviewFetch({origin,token:previewToken,confirmedLearningSupportCommand:{callerToken,body},
      ...(fetchImpl?{fetchImpl}:{})}):readback;
    const response=await transport(endpoint,{method:native?'GET':'POST',
      headers:{Accept:'application/json',...(callerToken?{Authorization:'Bearer '+callerToken}:{}),
        ...(native?{}:{'Content-Type':'application/json'})},...(native?{}:{body:JSON.stringify(body)}),signal});
    const status=response.status;
    const parsed=await readResponse(response,endpoint,action?4096:48000,status);
    const responseText=JSON.stringify(parsed);
    const markers=[callerToken,...privateMarkers()].filter(value=>typeof value==='string'&&value);
    check(markers.every(value=>!responseText.includes(value)),'credential-and-email-boundary');
    return {status,body:parsed,activity:parsed?.activity??[],correlationId:response.headers.get('x-assistant-request-id')};
  };
}
