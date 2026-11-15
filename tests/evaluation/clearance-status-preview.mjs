import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {buildClearanceApplicationCases,clearanceApplicationCaseManifest,clearanceApplicationFixtureForCase,
  gradeBoundClearanceStatusReply} from './clearance-application-cases.mjs';

export const clearanceStatusPreviewMode='clearance-status-native-preview';
const {paths,caseIds}=clearanceApplicationCaseManifest;
const suffixId=suffix=>'account:clearance-applications-'+suffix;
const byId=new Map(buildClearanceApplicationCases().map(row=>[row.id,row]));
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const termDate=/^\d{4}-\d{2}-\d{2}$/u;
const legalLabel=/^[\p{L}\p{N}][\p{L}\p{N} .(),·–—'’／/（）-]{0,119}$/u;
const officeCases=['office-statuses','cashier-notes','library-notes','notes-exclude-cashier','cashier-note-library-status',
  'statuses-cashier-note','without-notes'];
const denials={
  'foreign-account':/can’t show another student’s graduation clearance records/u,
  'write-submit':/No action was performed/u,
  'write-approve':/No action was performed/u,
  'manager-boundary':/cannot access clearance manager queues/u,
};
const windowCases=['windows','status-and-windows','window-without-application'];
const packet=Object.freeze([
  ...officeCases.map(suffix=>({suffix,side:'A',route:paths.status})),
  {suffix:'empty-applications',side:'B',route:paths.status},
  {suffix:'empty-windows',side:'B',route:paths.apply},
  {suffix:'public-guide',side:'A',route:paths.status},
  {suffix:'apply-guide',side:'A',route:paths.status,question:'Where can I apply for graduation clearance?'},
  ...Object.keys(denials).map(suffix=>({suffix,side:'A',route:suffix==='write-submit'?paths.apply:paths.status})),
  {suffix:'anonymous',side:'guest',route:paths.status},
].map(row=>Object.freeze(row)));
export const clearanceStatusPreviewCaseIds=Object.freeze(packet.map(row=>suffixId(row.suffix)));
export const clearanceStatusPreviewDeferred=Object.freeze(caseIds.filter(id=>!clearanceStatusPreviewCaseIds.includes(id)).map(caseId=>{
  const reason=windowCases.some(suffix=>caseId===suffixId(suffix))?'insufficient-period-bindings'
    :byId.get(caseId).clockBinding?'additional-timetable-fixture':'outside-status-packet';
  return Object.freeze({caseId,reason});
}));
const empty={profiles:[],applications:[],reviews:[],candidates:[],receipts:[]};
export class ClearanceStatusPreviewError extends Error{
  constructor(stage){super('Graduation clearance Preview failed at '+stage+'.');this.stage=stage;}
}
const check=(condition,stage)=>{if(!condition)throw new ClearanceStatusPreviewError(stage);};
export const clearanceStatusDigest=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>
  item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort()):item)).digest('hex');
const ordered=(rows,key)=>[...rows].sort((a,b)=>key(a).localeCompare(key(b)));
const instant=value=>new Date(value).toISOString();

export function assertClearanceStatusTermIds(ids){
  check(Array.isArray(ids)&&ids.length===2&&new Set(ids).size===2&&ids.every(id=>typeof id==='string'&&uuid.test(id)),'approved-term-id-pair');
}

/** Read only the operator-reviewed pair, including the whole shared-row fingerprint. */
export async function readClearanceStatusShared(sql,ids){
  assertClearanceStatusTermIds(ids);
  const rows=await sql`select to_jsonb(t) as term,to_jsonb(p) as period
    from public.affairs_terms t left join public.affairs_clearance_periods p on p.term_id=t.id
    where t.id in ${sql(ids)} and t.starts_on<=current_date limit 3`;
  const bound=ids.map(id=>rows.find(row=>row.term?.id===id));
  check(rows.length===2&&bound.every(row=>row&&legalLabel.test(row.term.label)&&termDate.test(row.term.starts_on)
    &&termDate.test(row.term.ends_on)&&row.term.starts_on<=row.term.ends_on),'reviewed-shared-term-pair');
  const [newer,older]=bound.map(row=>row.term),labels=bound.map(row=>row.term.label.normalize('NFKC').toLowerCase());
  check(newer.starts_on>older.starts_on&&!labels[0].includes(labels[1])&&!labels[1].includes(labels[0]),'distinct-ordered-term-pair');
  check(bound.every(row=>row.period===null),'selected-terms-have-no-configured-periods');
  return bound;
}

export async function assertClearanceStatusSchema(sql){
  const [row]=await sql`with objects as (
    select to_regclass('public.affairs_clearance_periods') as periods,
      to_regclass('public.affairs_clearance_candidates') as candidates,
      to_regclass('public.affairs_clearance_applications') as applications,
      to_regclass('public.affairs_clearance_reviews') as reviews,
      to_regclass('private.affairs_clearance_receipts') as receipts,
      to_regprocedure('public.affairs_read_graduation_clearance(text,uuid,uuid)') as reader,
      to_regprocedure('public.affairs_change_graduation_clearance(text,jsonb)') as writer
  ) select exists(select 1 from supabase_migrations.schema_migrations where version='20261114150000') as applied,
    (select count(*) from pg_class where oid in (periods,candidates,applications,reviews,receipts) and relrowsecurity)=5 as rls,
    not exists(select 1 from unnest(array[periods,candidates,applications,reviews,receipts]) obj
      cross join (values ('anon'),('authenticated')) as actor(role)
      where has_table_privilege(actor.role,obj,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(actor.role,obj,'SELECT,INSERT,UPDATE,REFERENCES')) as caller_tables,
    has_function_privilege('authenticated',reader,'EXECUTE') and has_function_privilege('authenticated',writer,'EXECUTE')
      and not has_function_privilege('anon',reader,'EXECUTE') and not has_function_privilege('anon',writer,'EXECUTE') as caller_rpc,
    has_table_privilege(current_user,applications,'SELECT') and has_table_privilege(current_user,applications,'INSERT')
      and has_table_privilege(current_user,applications,'DELETE') and has_table_privilege(current_user,reviews,'SELECT')
      and has_table_privilege(current_user,reviews,'INSERT') and has_table_privilege(current_user,candidates,'SELECT')
      and has_table_privilege(current_user,receipts,'SELECT') and has_table_privilege(current_user,periods,'SELECT')
      and has_table_privilege(current_user,'public.affairs_terms','SELECT') and has_table_privilege(current_user,'public.affairs_profiles','SELECT')
      and has_table_privilege(current_user,'public.affairs_profiles','INSERT') as operator
    from objects`;
  check(['applied','rls','caller_tables','caller_rpc','operator'].every(key=>row?.[key]===true),'schema-preflight');
}

export function bindClearanceStatusPreview(runId,owners,shared){
  const binding=validateAidPaymentFixtureOwners({runId,owners});
  const basis=clearanceApplicationFixtureForCase(byId.get(suffixId('office-statuses'))).dto;
  const owner=binding.owners.A.id,applications=[],reviews=[];
  const nativeA={userId:owner,targetId:owner,terms:[],periods:[],applications:[]};
  for(const [index,{term}] of shared.entries()){
    const submitted=term.starts_on+'T00:00:00.000Z',reviewed=term.starts_on+'T00:01:00.000Z';
    const id=randomUUID(),track=basis.applications[index].track;
    applications.push({id,term_id:term.id,user_id:owner,track,submitted_at:submitted});
    const rawReviews=basis.applications[index].reviews.map(({office,status,note,version})=>({
      application_id:id,office,status,note,version,reviewed_at:status==='pending'?null:reviewed,
    }));
    reviews.push(...rawReviews);
    nativeA.applications.push({id,termId:term.id,term:term.label,track,submittedAt:submitted,
      reviews:rawReviews.map(({office,status,note,version,reviewed_at})=>({office,status,note,version,reviewedAt:reviewed_at}))});
  }
  const other=binding.owners.B.id;
  const profiles=Object.values(binding.owners).map(owner=>({user_id:owner.id,email:owner.email,display_name:'Evaluation student',role:'student'}));
  return {binding,shared:structuredClone(shared),expected:{...empty,profiles:ordered(profiles,r=>r.user_id),
    applications:ordered(applications,r=>r.id),reviews:ordered(reviews,r=>r.application_id+'/'+r.office)},
    native:{A:nativeA,B:{userId:other,targetId:other,terms:[],periods:[],applications:[]}}};
}

async function assertClearanceOwners(sql,fixture){
  const {runId,owners}=validateAidPaymentFixtureOwners(fixture.binding);
  const ids=Object.values(owners).map(v=>v.id);
  const rows=await sql`select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as marker,
    u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as google
    from auth.users u where u.id in ${sql(ids)} limit 3`;
  check(rows.length===2&&Object.values(owners).every(owner=>rows.some(row=>row.id===owner.id&&row.email===owner.email
    &&row.marker===runId&&row.google===true)),'disposable-owner-binding');
}

export async function readClearanceOwnedRows(sql,fixture){
  const owners=Object.values(fixture.binding.owners).map(v=>v.id),ids=fixture.expected.applications.map(r=>r.id);
  const [row]=await sql`select
    coalesce((select jsonb_agg(to_jsonb(p) order by p.user_id)
      from (select user_id,email,display_name,role from public.affairs_profiles where user_id in ${sql(owners)} limit 3) p),'[]'::jsonb) as profiles,
    coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from (select * from public.affairs_clearance_applications
      where user_id in ${sql(owners)} or id in ${sql(ids)} limit 3) a),'[]'::jsonb) as applications,
    coalesce((select jsonb_agg(to_jsonb(r) order by r.application_id,r.office) from (select * from public.affairs_clearance_reviews
      where application_id in ${sql(ids)} limit 11) r),'[]'::jsonb) as reviews,
    coalesce((select jsonb_agg(to_jsonb(c)) from (select * from public.affairs_clearance_candidates
      where user_id in ${sql(owners)} limit 1) c),'[]'::jsonb) as candidates,
    coalesce((select jsonb_agg(to_jsonb(o)) from (select * from private.affairs_clearance_receipts
      where actor in ${sql(owners)} or target in ${sql(owners)} limit 1) o),'[]'::jsonb) as receipts`;
  check(Object.keys(empty).every(key=>Array.isArray(row?.[key])),'owned-sql-shape');
  return {...row,applications:row.applications.map(a=>({...a,submitted_at:instant(a.submitted_at)})),
    reviews:row.reviews.map(r=>({...r,reviewed_at:r.reviewed_at===null?null:instant(r.reviewed_at)}))};
}

export async function seedClearanceStatusPreview(sql,fixture){
  await assertClearanceOwners(sql,fixture);
  check(isDeepStrictEqual(await readClearanceStatusShared(sql,fixture.shared.map(row=>row.term.id)),fixture.shared),'shared-term-period-changed');
  check(isDeepStrictEqual(await readClearanceOwnedRows(sql,fixture),empty),'empty-owned-scope-before-seed');
  await sql`insert into public.affairs_profiles ${sql(fixture.expected.profiles)}`;
  await sql`insert into public.affairs_clearance_applications ${sql(fixture.expected.applications)}`;
  await sql`insert into public.affairs_clearance_reviews ${sql(fixture.expected.reviews)}`;
  check(isDeepStrictEqual(await readClearanceOwnedRows(sql,fixture),fixture.expected),'exact-owned-seed');
}

export async function cleanupClearanceStatusPreview(sql,fixture){
  await assertClearanceOwners(sql,fixture);
  const owners=Object.values(fixture.binding.owners).map(v=>v.id).sort(),ids=fixture.expected.applications.map(r=>r.id);
  for(const id of owners)await sql`select pg_advisory_xact_lock(hashtextextended('clearance-actor:'||${id},0))`;
  await sql`select id from public.affairs_clearance_applications
    where user_id in ${sql(owners)} or id in ${sql(ids)} order by id for update`;
  const raw=await readClearanceOwnedRows(sql,fixture);
  if(isDeepStrictEqual(raw,empty))return;
  check(isDeepStrictEqual(raw,fixture.expected),'cleanup-exact-owned-scope');
  for(const expected of fixture.expected.applications){
    const rows=await sql`delete from public.affairs_clearance_applications
      where id=${expected.id} and user_id=${expected.user_id} and term_id=${expected.term_id} returning id`;
    check(rows.length===1&&rows[0].id===expected.id,'exact-owned-application-delete');
  }
  check(isDeepStrictEqual(await readClearanceOwnedRows(sql,fixture),{...empty,profiles:fixture.expected.profiles}),
    'owned-application-review-receipt-cleanup');
}

export async function verifyClearanceStatusPreviewAbsent(sql,fixture){
  const owners=Object.values(fixture.binding.owners).map(v=>v.id);
  const [row]=await sql`select (exists(select 1 from auth.users where id in ${sql(owners)})
    or exists(select 1 from auth.identities where user_id in ${sql(owners)})
    or exists(select 1 from public.affairs_profiles where user_id in ${sql(owners)})) as remains`;
  check(row?.remains===false&&isDeepStrictEqual(await readClearanceOwnedRows(sql,fixture),empty),'owned-clearance-and-identity-cleanup');
  return isDeepStrictEqual(await readClearanceStatusShared(sql,fixture.shared.map(row=>row.term.id)),fixture.shared);
}

const normalizeNative=body=>({...body,applications:body.applications.map(a=>({...a,submittedAt:instant(a.submittedAt),
  reviews:a.reviews.map(r=>({...r,reviewedAt:r.reviewedAt===null?null:instant(r.reviewedAt)}))}))});

export async function verifyClearanceStatusPreview({fixture,readShared,readOwned,readNative,ask,onResult,privateMarkers=()=>[]}){
  const {expected,shared,native,binding}=fixture,terms=shared.map(row=>row.term.label),correlations=new Set(),results=[];
  const privateValues=[binding.runId,...Object.values(binding.owners).flatMap(v=>[v.id,v.email]),...expected.applications.map(a=>a.id)];
  const observe=async()=>{
    const raw=await readOwned();
    check(isDeepStrictEqual(raw,expected),'exact-owned-sql-readback');
    check(isDeepStrictEqual(await readShared(),shared),'shared-term-period-changed');
    const callers={};
    for(const side of ['A','B']){
      const reply=await readNative(side);
      check(reply?.status===200&&Array.isArray(reply.body?.applications)
        &&isDeepStrictEqual(normalizeNative(reply.body),native[side]),'exact-owned-native-readback');
      callers[side]=normalizeNative(reply.body);
    }
    return clearanceStatusDigest({raw,callers,shared});
  };
  for(const item of packet){
    const caseId=suffixId(item.suffix),frozen=byId.get(caseId),question=item.question??frozen.question;
    const before=await observe(),reply=await ask(item.side,question,item.route);
    check(reply?.status===(item.side==='guest'?401:200),'assistant-http-status');
    if(item.side!=='guest'){
      check(uuid.test(reply.correlationId??'')&&!correlations.has(reply.correlationId),'assistant-correlation');
      correlations.add(reply.correlationId);
    }
    const {body}=reply,visible=JSON.stringify(body);
    check(body&&![...privateValues,...privateMarkers()].filter(Boolean).some(marker=>visible.includes(marker))
      &&!body.proposedAction,'assistant-privacy-or-action');
    const failures=[];
    if(frozen?.nativeExpectation.calls===1){
      if(body.verification?.status!=='verified')failures.push('clearance.verification');
      failures.push(...gradeBoundClearanceStatusReply(caseId,{statusCode:reply.status,execution:'live-model',body},terms));
    }else if(denials[item.suffix]){
      const activity=body.activity??[];
      const terminal=activity.filter(step=>step.kind?.startsWith('account-read:'));
      const supportedDenial=denials[item.suffix].test(body.answer??'')&&!expected.reviews.some(row=>row.note&&visible.includes(row.note))
        &&!terms.some(term=>visible.includes(term));
      if(!supportedDenial||terminal.some(step=>step.kind.split(':')[1]!=='graduationClearance'||step.status==='complete'))
        failures.push('clearance.denial-boundary');
    }else if(item.side==='guest'){
      if(typeof body.error!=='string'||body.answer||body.views||body.activity?.length)failures.push('clearance.guest-boundary');
    }else{
      const expectedUrl=item.suffix==='apply-guide'?paths.apply:paths.status;
      if(!isDeepStrictEqual(body.citations?.map(citation=>({id:citation.chunkId,url:citation.url})),
        [{id:'directory:graduation-clearance',url:expectedUrl}]))failures.push('clearance.local-navigation');
      if(body.activity?.some(step=>step.kind?.startsWith('account-read:')))failures.push('clearance.navigation-read');
    }
    const after=await observe();
    if(after!==before)failures.push('clearance.persisted-state-changed');
    const row={caseId,passed:failures.length===0,failures,before,after,response:clearanceStatusDigest(body)};
    results.push(row);
    await onResult?.(row);
  }
  return results;
}
