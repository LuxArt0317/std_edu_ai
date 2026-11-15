import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {announcementEmailPath,parseAnnouncementEmail} from '../../server/announcementEmailContract.js';
import {announcementEmailBrowserCases} from './announcement-email-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

// Use a deliberately distant activation time. A crashed operator must not
// leave a fixture eligible for the shared publication trigger or delivery worker.
const future='2099-01-01T00:00:00.000Z';
const updated='2026-01-01T00:00:00.000Z';
const roles=['A','B'];
const need=condition=>check(condition,'announcement fixture mismatch');

export function buildAnnouncementEmailBrowserFixture(runId,owners){
  return {...validateAidPaymentFixtureOwners({runId,owners}),
    row:{user_id:owners.A.id,enabled:true,effective_at:future,version:1,updated_at:updated}};
}

async function observeRows(sql,plan,{lock=false,allowMissingProfiles=false}={}){
  need(isDeepStrictEqual(plan,buildAnnouncementEmailBrowserFixture(plan.runId,plan.owners)));
  const users=roles.map(role=>plan.owners[role].id).sort();
  if(lock)for(const owner of users)await sql`select pg_advisory_xact_lock(hashtextextended('announcement-email:'||${owner},0))`;
  const people=await sql`select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as "runMarker",
    u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as disposable,
    p.role as "profileRole"
    from auth.users u left join public.affairs_profiles p on p.user_id=u.id where u.id in ${sql(users)} limit 3`;
  need(people.length===2&&roles.every(role=>people.some(({disposable,profileRole,...person})=>disposable===true
    &&isDeepStrictEqual(person,plan.owners[role]))));
  const [guard]=await sql`select now()<${future}::timestamptz-interval '1 day' as inactive,
    exists(select 1 from private.affairs_announcement_email_changes where user_id in ${sql(users)}) as changes,
    exists(select 1 from private.affairs_announcement_email_queue where user_id in ${sql(users)}) as queue`;
  need(guard?.inactive===true&&guard.changes===false&&guard.queue===false);
  const rows=await sql`select user_id,enabled,to_char(effective_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as effective_at,
    version,to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
    from public.affairs_announcement_email_preferences where user_id in ${sql(users)} order by user_id limit 3`;
  need(people.every(({profileRole})=>profileRole==='student'
    ||(allowMissingProfiles&&rows.length===0&&profileRole===null)));
  return [...rows];
}

export async function assertAnnouncementEmailBrowserSchema(sql){
  const [state]=await sql`select exists(select 1 from supabase_migrations.schema_migrations where version='20261114220000')
    and coalesce(has_function_privilege('authenticated',to_regprocedure('public.affairs_read_announcement_email()'),'EXECUTE'),false)
    and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.affairs_announcement_email_preferences')),false) as ready`;
  need(state?.ready===true);
}

/** Call within the shared fixture lease's SQL transaction after journaling the plan. */
export async function seedAnnouncementEmailBrowserFixture(sql,plan){
  await assertAnnouncementEmailBrowserSchema(sql);
  need((await observeRows(sql,plan,{lock:true})).length===0);
  await sql`insert into public.affairs_announcement_email_preferences ${sql(plan.row)}`;
  need(isDeepStrictEqual(await observeRows(sql,plan),[plan.row]));
}

export async function observeAnnouncementEmailBrowserFixture(sql,plan){
  const rows=await observeRows(sql,plan);
  need(isDeepStrictEqual(rows,[plan.row]));
  return digest(rows);
}

/** Reconcile the exact preference before deleting disposable Auth identities. */
export async function deleteAnnouncementEmailBrowserFixture(sql,plan){
  const rows=await observeRows(sql,plan,{lock:true,allowMissingProfiles:true});
  if(rows.length===0)return;
  need(isDeepStrictEqual(rows,[plan.row]));
  const removed=await sql`delete from public.affairs_announcement_email_preferences
    where user_id=${plan.row.user_id} and version=${plan.row.version} returning user_id`;
  need(removed.length===1&&removed[0].user_id===plan.row.user_id&&(await observeRows(sql,plan)).length===0);
}

export async function verifyAnnouncementEmailBrowserFixtureAbsent(sql,plan){
  const ids=roles.map(role=>plan.owners[role].id);
  const [state]=await sql`select exists(select 1 from auth.users where id in ${sql(ids)})
    or exists(select 1 from auth.identities where user_id in ${sql(ids)})
    or exists(select 1 from auth.sessions where user_id in ${sql(ids)})
    or exists(select 1 from public.affairs_profiles where user_id in ${sql(ids)})
    or exists(select 1 from public.affairs_announcement_email_preferences where user_id in ${sql(ids)})
    or exists(select 1 from private.affairs_announcement_email_changes where user_id in ${sql(ids)})
    or exists(select 1 from private.affairs_announcement_email_queue where user_id in ${sql(ids)}) as remains`;
  return state?.remains===false;
}

/** Read the no-argument RPC using each reserved caller's real or controlled
 * credential transport. The two views must independently distinguish A and B. */
export async function observeAnnouncementEmailBrowserCallers(plan,{users,readRpc,deliveryConfigured}){
  need(typeof readRpc==='function'&&typeof deliveryConfigured==='boolean'&&Array.isArray(users)&&users.length===2
    &&roles.every((role,index)=>users[index]?.id===plan.owners[role].id&&typeof users[index].token==='string'&&users[index].token)
    &&users[0].token!==users[1].token);
  const callers={};
  for(const [index,role] of roles.entries()){
    const preference=parseAnnouncementEmail(await readRpc(users[index]),plan.owners[role].id);
    need(role==='A'?preference.enabled&&!preference.active&&preference.version===plan.row.version
      &&Date.parse(preference.effectiveAt)===Date.parse(plan.row.effective_at)
      :!preference.enabled&&!preference.active&&preference.version===0&&preference.effectiveAt===null);
    callers[role]={...preference,deliveryConfigured};
  }
  return callers;
}

export function bindAnnouncementEmailBrowserCase(plan,callers,caseId){
  const frozen=announcementEmailBrowserCases.find(row=>row.id===caseId);
  need(frozen);
  const {role,...testCase}=frozen,preference=callers[role];
  need(preference?.userId===plan.owners[role].id);
  return {role,testCase:{...testCase,route:announcementEmailPath},preference:structuredClone(preference)};
}
