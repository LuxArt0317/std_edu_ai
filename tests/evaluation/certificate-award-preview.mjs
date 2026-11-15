import {isDeepStrictEqual} from 'node:util';
import {certificateAwardPath,certificateAwardScope,certificateProofBucket} from '../../server/certificateAwardsContract.js';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {validateAidPaymentFixtureOwners} from './aid-payment-fixture-plan.mjs';
import {extractAnswerLinks,gradeCase} from './grading.mjs';

export const certificateAwardPreviewMode='certificate-award-selected-preview';
const scope=certificateAwardScope,source='account:certificate-awards';
const prefix='client:certificate-awards:protected-';
const roles=['A','B'];
const catalog=[{code:'3345',name:'(MOS)Excel Associate Microsoft 365 Apps'},
  {code:'472',name:'財產保險業務員專業科目資格測驗'},{code:'3282',name:'永續發展基礎能力測驗'}];
const recordPath=id=>certificateAwardPath+'/record/'+id;
const sorted=rows=>rows.slice().sort((a,b)=>a.id.localeCompare(b.id));
const privateFields=['phone','teacher_code','review_note','payout','object_path','files','bank','account_last_four'];
const requireExact=(condition,message)=>{if(!condition)throw new Error(message);};

export function certificateAwardPreviewManifest(){
  return [
    {id:'selected-en',role:'A',target:'selected',language:'en',question:'What is the status of this certificate award?'},
    {id:'selected-zh',role:'A',target:'selected',language:'zh',question:'我的這筆證照獎助金審核狀態？'},
    {id:'reverse-owner',role:'B',target:'second',language:'en',question:'What is the status of this certificate award?'},
    {id:'crossed-a',role:'A',target:'second',language:'en',question:'What is the status of this certificate award?',denied:true},
    {id:'crossed-b',role:'B',target:'selected',language:'zh',question:'我的這筆證照獎助金審核狀態？',denied:true},
    {id:'missing',role:'A',target:'missing',language:'en',question:'What is the status of this certificate award?',denied:true},
    {id:'aggregate-control',role:'A',target:null,language:'en',question:'What is the status of my professional certificate subsidy application?'},
  ].map(row=>({...row,id:prefix+row.id}));
}

function fixtureId(runId,label){
  const hash=digest(['certificate-award-preview-v1',runId,label]);
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

export function buildCertificateAwardPreviewPlan(runId,owners,catalogDigest){
  const binding=validateAidPaymentFixtureOwners({runId,owners});
  requireExact(typeof catalogDigest==='string'&&/^[a-f0-9]{64}$/u.test(catalogDigest),'Missing exact published certificate catalog proof.');
  const targets=Object.fromEntries(['selected','newer','second','missing'].map(label=>[label,fixtureId(runId,label)]));
  const profiles=roles.map(role=>({user_id:owners[role].id,email:owners[role].email,display_name:'Certificate QA '+role,role:'student'}));
  const record=(label,role,index,status,amount)=>({id:targets[label],user_id:owners[role].id,certificate_code:catalog[index].code,
    obtained_on:'2026-01-10',phone:'090000001'+index,teacher_code:'QAB'+index,wants_award:true,status,
    application_fee:0,award_amount:amount,review_note:'CERTIFICATE QA PRIVATE NOTE '+index,version:2,
    updated_at:`2026-01-1${index+1}T01:00:00Z`});
  const rows=[record('selected','A',0,'reviewing',0),record('newer','A',1,'approved',900),record('second','B',2,'needs_documents',null)];
  requireExact(new Set([runId,...profiles.map(row=>row.user_id),...Object.values(targets)]).size===7,'Certificate record IDs overlap fixture identities.');
  return {...binding,catalogDigest,targets,profiles,rows};
}

function assertPlan(plan){
  requireExact(isDeepStrictEqual(plan,buildCertificateAwardPreviewPlan(plan.runId,plan.owners,plan.catalogDigest)),
    'The reserved certificate fixture plan changed.');
}

export async function readCertificateAwardPreviewCatalog(sql,{allowCatalogChanges=false}={}){
  const [schema]=await sql`select exists(select 1 from supabase_migrations.schema_migrations where version='20261114230000')
    and coalesce(has_function_privilege('authenticated',to_regprocedure('public.affairs_read_certificate_awards(uuid,uuid,boolean)'),'EXECUTE'),false) as ready`;
  requireExact(schema?.ready===true,'The exact certificate award migration and authenticated RPC are required.');
  const rows=await sql`select code,name,level,issuer,sort_order,active from public.affairs_certificate_catalog
    where code in ${sql(catalog.map(row=>row.code))} order by code`;
  requireExact(allowCatalogChanges||rows.length===catalog.length&&catalog.every(expected=>rows.some(row=>row.code===expected.code&&row.name===expected.name&&row.active===true)),
    'The three existing published certificate catalog bindings could not be verified.');
  return digest([...rows]);
}

async function assertOwners(sql,plan){
  const rows=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker",
    email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as google
    from auth.users u where id in ${sql(plan.profiles.map(row=>row.user_id))} limit 3`;
  requireExact(rows.length===2&&Object.values(plan.owners).every(owner=>rows.some(({google,...row})=>google===true&&isDeepStrictEqual(row,owner))),
    'Certificate scope is outside the recorded disposable Google identities.');
}

async function storedState(sql,plan,lock=false){
  const owners=plan.profiles.map(row=>row.user_id),ids=Object.values(plan.targets);
  if(lock){
    for(const owner of owners.slice().sort())await sql`select pg_advisory_xact_lock(hashtextextended('certificate-actor:'||${owner},0))`;
    await sql`select user_id from public.affairs_profiles where user_id in ${sql(owners)} order by user_id for update`;
    await sql`select id from public.affairs_certificate_applications where id in ${sql(ids)} or user_id in ${sql(owners)} order by id for update`;
  }
  const rows=await sql`select id,user_id,certificate_code,obtained_on::text as obtained_on,phone,teacher_code,wants_award,status,
    application_fee,award_amount,review_note,version,to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
    from public.affairs_certificate_applications where id in ${sql(ids)} or user_id in ${sql(owners)} order by id limit 4`;
  const profiles=await sql`select user_id,email,display_name,role from public.affairs_profiles where user_id in ${sql(owners)} order by user_id`;
  const [sideEffects]=await sql`select
    exists(select 1 from public.affairs_certificate_payout_profiles where user_id in ${sql(owners)}) as payout,
    exists(select 1 from private.affairs_certificate_files where user_id in ${sql(owners)} or application_id in ${sql(ids)}) as files,
    exists(select 1 from private.affairs_certificate_receipts where actor in ${sql(owners)} or result->>'id' in ${sql(ids)}) as receipts,
    exists(select 1 from storage.objects where bucket_id=${certificateProofBucket} and split_part(name,'/',1) in ${sql(owners)}) as storage`;
  requireExact(sideEffects&&Object.values(sideEffects).every(value=>value===false),'Unexpected certificate payout, receipt, file or Storage state.');
  return {rows:[...rows],profiles:[...profiles]};
}

const empty=state=>state.rows.length===0&&state.profiles.length===0;
const profilesSorted=profiles=>profiles.slice().sort((a,b)=>a.user_id.localeCompare(b.user_id));
function assertStored(state,plan){
  requireExact(isDeepStrictEqual(sorted(state.rows),sorted(plan.rows))&&isDeepStrictEqual(state.profiles,profilesSorted(plan.profiles)),
    'The persisted certificate fixture does not match the reserved rows.');
}

export async function seedCertificateAwardPreview(sql,plan){
  assertPlan(plan);
  await assertOwners(sql,plan);
  requireExact(await readCertificateAwardPreviewCatalog(sql)===plan.catalogDigest,'Published certificate catalog changed before seeding.');
  requireExact(empty(await storedState(sql,plan,true)),'Certificate fixture overlaps existing rows.');
  await sql`insert into public.affairs_profiles ${sql(plan.profiles)}`;
  await sql`insert into public.affairs_certificate_applications ${sql(plan.rows)}`;
  assertStored(await storedState(sql,plan),plan);
}

export async function observeCertificateAwardPreview(sql,plan){
  assertPlan(plan);
  await assertOwners(sql,plan);
  const stored=await storedState(sql,plan),catalogDigest=await readCertificateAwardPreviewCatalog(sql);
  assertStored(stored,plan);
  requireExact(catalogDigest===plan.catalogDigest,'Published certificate catalog changed during the run.');
  return {stateDigest:digest(stored),catalogDigest};
}

export async function deleteCertificateAwardPreview(sql,plan){
  assertPlan(plan);
  await assertOwners(sql,plan);
  const state=await storedState(sql,plan,true);
  if(state.rows.length===0){
    requireExact(state.profiles.length===0||isDeepStrictEqual(state.profiles,profilesSorted(plan.profiles)),
      'The remaining certificate fixture profiles do not match the reserved owners.');
    return;
  }
  assertStored(state,plan);
  for(const {id,user_id} of plan.rows){
    const deleted=await sql`delete from public.affairs_certificate_applications where id=${id} and user_id=${user_id} returning id`;
    requireExact(deleted.length===1&&deleted[0].id===id,'Could not delete the exact reserved certificate application.');
  }
  requireExact((await storedState(sql,plan)).rows.length===0,'Reserved certificate applications still exist.');
}

export async function verifyCertificateAwardPreviewAbsent(sql,plan){
  assertPlan(plan);
  requireExact(empty(await storedState(sql,plan)),'A reserved certificate profile or application remains.');
  const ownerIds=plan.profiles.map(row=>row.user_id);
  const [result]=await sql`select exists(select 1 from auth.users where id in ${sql(ownerIds)})
    or exists(select 1 from auth.sessions where user_id in ${sql(ownerIds)})
    or exists(select 1 from auth.identities where user_id in ${sql(ownerIds)}) as remains`;
  requireExact(result?.remains===false,'A reserved certificate fixture identity remains.');
  return await readCertificateAwardPreviewCatalog(sql,{allowCatalogChanges:true})===plan.catalogDigest;
}

const label={reviewing:{en:'Under review',zh:'審查中'},approved:{en:'Approved',zh:'通過'},needs_documents:{en:'Documents required',zh:'需補件'}};
const localizedName=row=>catalog.find(item=>item.code===row.certificate_code).name;
const sum=row=>row.award_amount===null?'':' · NT$'+row.award_amount;
const renderedRow=(row,language)=>`- ${localizedName(row)} · ${label[row.status][language]}${sum(row)}`;
const selectedRows=(plan,role)=>plan.rows.filter(row=>row.user_id===plan.owners[role].id).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));

export function bindCertificateAwardPreviewCases(plan){
  assertPlan(plan);
  return certificateAwardPreviewManifest().map(({role,target,language,denied=false,id,question})=>{
    const recordId=target?plan.targets[target]:null,route=recordId?recordPath(recordId):certificateAwardPath;
    const list=denied?[]:selectedRows(plan,role).filter(row=>!recordId||row.id===recordId);
    requireExact(denied||list.length===(recordId?1:2),'Independently bound certificate row count is incorrect.');
    const expected={behavior:denied?'denial':'answer',statusCode:denied?404:200,noAction:true,forbidPublicResearch:true,localLinksOnly:true,
      ...(denied?{}:{requiredLinks:[route],requiredSourceBindings:[{sourceId:source,url:route}]}),
      forbiddenText:[...privateFields,...plan.profiles.flatMap(row=>[row.email,row.user_id]),...plan.rows.flatMap(row=>[row.phone,row.review_note]),
        ...plan.rows.filter(row=>!list.includes(row)).map(localizedName)]};
    const testCase={id,domain:'certificate-awards',mode:'native-status',route,question,language,
      executionContract:'live-native',fixtureKey:certificateAwardPreviewMode,expected};
    return {testCase,role,recordId,expectedRows:list.map(row=>renderedRow(row,language))};
  });
}

export async function observeCertificateAwardPreviewCallers(plan,{users,origin,publishable,fetchImpl,readResponse,signal}){
  assertPlan(plan);
  const reads=[];
  for(const role of roles){
    const owner=plan.owners[role],user=users.find(item=>item.id===owner.id);
    requireExact(typeof user?.token==='string'&&user.token,'The independent certificate read needs the exact disposable caller.');
    const native=new URL('/rest/v1/rpc/affairs_read_certificate_awards',origin);
    for(const target of ['selected','second']){
      const recordId=plan.targets[target],row=selectedRows(plan,role).find(item=>item.id===recordId);
      const request={p_target:null,p_id:recordId,p_status_only:false};
      const reply=await fetchImpl(native,{method:'POST',headers:{apikey:publishable,Authorization:'Bearer '+user.token,'Content-Type':'application/json'},
        body:JSON.stringify(request),credentials:'omit',redirect:'error',signal});
      const result=await readResponse(reply,native,16384,row?200:404);
      if(row){
        const {user_id,...expected}=row;
        requireExact(result?.userId===user_id&&result.identity===null&&result.payout===null&&isDeepStrictEqual(result.files,[])
          &&Array.isArray(result.rows)&&result.rows.length===1,'The independent certificate RPC returned the wrong owner or row count.');
        const {name,level,issuer,updated_at,...values}=result.rows[0];
        requireExact(name===localizedName(row)&&typeof level==='string'&&typeof issuer==='string'
          &&Date.parse(updated_at)===Date.parse(row.updated_at)&&isDeepStrictEqual(values,expectedWithoutTimestamp(expected)),
          'The independent certificate RPC returned the wrong selected record.');
      }else requireExact(result?.code==='PT404','The independent crossed certificate request did not produce the owner denial.');
      reads.push({role,target,status:reply.status,digest:digest(result)});
    }
  }
  return reads;
}

function expectedWithoutTimestamp({updated_at,...row}) {return row;}

export async function requestCertificateAwardPreviewCase({bound,token,origin,fetchImpl,readResponse,signal}){
  const {testCase,recordId}=bound,language=testCase.language;
  requireExact(typeof token==='string'&&token,'A protected certificate status request requires an authenticated caller.');
  const url=new URL('/api/affairs-data',origin);
  url.search=new URLSearchParams({scope,view:'mine',answer:language,...(recordId?{id:recordId}:{})});
  const reply=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',credentials:'omit',signal});
  const statusCode=reply.status;
  // Retain a behavioral result when a valid fixture receives the wrong status.
  requireExact(statusCode===200||statusCode===404,'Unexpected protected certificate response status.');
  const body=await readResponse(reply,url,32768,statusCode);
  const envelope={body,statusCode,fixtureKey:testCase.fixtureKey,execution:'live-native',events:body?.activity??[]};
  const {checks}=gradeCase(testCase,envelope);
  const check=(id,passed,detail)=>checks.push({id,passed:passed===true,detail});
  const denied=testCase.expected.behavior==='denial';
  if(denied)check('certificate.denial',isDeepStrictEqual(body,{error:'找不到證照申請。'}),
    'The crossed or missing application yields the same data-free 404.');
  else{
    const summary=recordId?(language==='zh'?'這筆已儲存的證照申請：':'Your selected saved certificate application:'):'Your recent certificate applications:';
    const title=recordId?(language==='zh'?'這筆證照獎補助金申請':'Certificate award application'):'Certificate award applications';
    const visible=[summary,bound.expectedRows.join('\n'),`[${title}](${testCase.route})`].join('\n\n');
    check('certificate.answer',body?.answer===visible,'The exact selected saved name, status and award value match the independent rows in the requested language.');
    check('certificate.scope',body?.grounding?.source==='account'&&body.grounding.webSearched===false
      &&extractAnswerLinks(body).every(link=>link===testCase.route)&&body.citations?.length===1
      &&Object.keys(body).sort().join(',')==='activity,answer,citations,grounding,status,suggestedQuestions',
    'The response uses one exact caller-owned status citation and omits unrelated record data.');
  }
  return {caseId:testCase.id,role:bound.role,statusCode,passed:checks.every(check=>check.passed),checks,
    requestDigest:digest({method:'GET',path:url.pathname+url.search,role:bound.role,question:testCase.question}),responseDigest:digest(body)};
}

export const certificateAwardPreviewHash=value=>digest(value);
