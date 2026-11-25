import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {academicGradeReadSources} from '../../server/academicGrades.js';
import {buildAccountCases} from './account-cases.mjs';
import {fixtureForCase} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

export const academicGradesPreviewMode='academic-grades-preview';
const prefix='account:';
const ids=['transcript-grade','transcript-summary','warning-grades','academic-rankings','academic-english',
  'academic-null-zero','academic-other-account','academic-gpa-gap','academic-current-gap','academic-transfer-gap','academic-cycle-gap'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const unexpected=()=>{throw new Error('Unexpected protected academic grades fixture state.');};
const sorted=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const academicTables=academicGradeReadSources.map(({table})=>table);

export function academicGradesPreviewCases(){
  const bank=new Map(buildAccountCases().map(row=>[row.id,row]));
  return ids.map(id=>{
    const row=bank.get(prefix+id);
    if(row?.domain!=='academicGrades'||row.expected.requiredTools.join()!=='academicGrades')unexpected();
    return row;
  });
}
export const academicGradesPreviewActor=testCase=>testCase.id==='account:academic-null-zero'?1:0;
const snake=s=>s.replace(/[A-Z]/g,l=>'_'+l.toLowerCase());
const raw=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[snake(key),value]));
function normalized(row){
  return Object.fromEntries(Object.keys(row).sort().map(key=>[key,['created_at','updated_at'].includes(key)?new Date(row[key]).toISOString():row[key]]));
}

export function buildAcademicGradesPreviewPlan(identities){
  if(!Array.isArray(identities)||identities.length!==2||new Set(identities.map(row=>row.id)).size!==2
    ||identities.some(row=>!uuid.test(row.id)||typeof row.email!=='string'||!row.email.endsWith('@example.invalid')))unexpected();
  const ownerIds=identities.map(row=>row.id);
  const selected=academicGradesPreviewCases();
  const variants=[selected[0],selected.find(row=>academicGradesPreviewActor(row)===1)];
  const records=ownerIds.map((userId,index)=>fixtureForCase(variants[index],{userId}).academicGrades);
  for(const data of records){
    data.records.push({...data.records[0],academicYear:114,gradeText:'WRONG TERM PROTECTED RECORD'});
    data.records.push({...data.records[1],academicYear:114,gradeText:'WRONG TERM PROTECTED RECORD'});
    data.termSummaries.push({...data.termSummaries[0],academicYear:114,averageGradeText:'WRONG TERM PROTECTED RECORD'});
    data.rankings.push({...data.rankings[0],academicYear:114,classRankingText:'WRONG TERM PROTECTED RECORD'});
  }
  records[1].records.push({...records[1].records[0],courseTitle:'FOREIGN PRIVATE SENTINEL',gradeText:'99'});
  const rows=Object.fromEntries(academicGradeReadSources.map(({key,table})=>[table,
    sorted(records.flatMap(data=>data[key].map(row=>normalized(raw({...row,id:randomUUID()})))))]));
  const profiles=identities.map((row,index)=>({user_id:row.id,email:row.email,
    display_name:index===0?'Evaluation Student':'Evaluation Other',role:'student'}));
  return {ownerIds,profiles,rows,recordIds:Object.values(rows).flat().map(row=>row.id)};
}

export async function assertAcademicGradesPreviewSchema(sql){
  const actual=await sql`select c.relname,c.relrowsecurity from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ${sql(academicTables)}`;
  if(actual.length!==academicTables.length||actual.some(row=>row.relrowsecurity!==true))unexpected();
}

async function persisted(sql,plan){
  const rows=Object.fromEntries(await Promise.all(academicTables.map(async table=>{
    const ids=plan.rows[table].map(row=>row.id);
    const result=await sql`select to_jsonb(r) as row from public.${sql(table)} r
      where r.id in ${sql(ids)} or r.user_id in ${sql(plan.ownerIds)} order by r.id`;
    return [table,result.map(item=>normalized(item.row))];
  })));
  const profiles=await sql`select user_id,email,display_name,role from public.affairs_profiles where user_id in ${sql(plan.ownerIds)}`;
  const unrelated=await sql`select
    (select count(*)::integer from public.affairs_students where user_id in ${sql(plan.ownerIds)}) as students,
    (select count(*)::integer from public.dtm_courses where user_id in ${sql(plan.ownerIds)}) as moodle`;
  if(unrelated.length!==1||unrelated[0].students!==0||unrelated[0].moodle!==0)unexpected();
  return {rows,profiles:profiles.map(row=>({...row})).sort((a,b)=>a.user_id.localeCompare(b.user_id))};
}
function matches(plan,observed,empty){
  const expected=empty?[]:[...plan.profiles].sort((a,b)=>a.user_id.localeCompare(b.user_id));
  if(!isDeepStrictEqual(observed.profiles,expected)||academicTables.some(table=>!isDeepStrictEqual(observed.rows[table],empty?[]:plan.rows[table])))unexpected();
  return hash(observed);
}
export async function verifyAcademicGradesPreviewRows(sql,plan,{allowEmpty=false,expectEmpty=false}={}){
  const observed=await persisted(sql,plan);
  const empty=observed.profiles.length===0&&academicTables.every(table=>observed.rows[table].length===0);
  if(expectEmpty&&!empty)unexpected();
  return matches(plan,observed,expectEmpty||allowEmpty&&empty);
}
export async function seedAcademicGradesPreviewRows(sql,plan){
  await verifyAcademicGradesPreviewRows(sql,plan,{expectEmpty:true});
  await sql`insert into public.affairs_profiles ${sql(plan.profiles)}`;
  for(const table of academicTables)await sql`insert into public.${sql(table)} ${sql(plan.rows[table])}`;
  return verifyAcademicGradesPreviewRows(sql,plan);
}

export async function readAcademicGradesPreviewCallers(plan,callers,{projectOrigin,publishable,fetchImpl,readResponse,signal}){
  if(callers.length!==2||callers.some((caller,index)=>caller.id!==plan.ownerIds[index]||!caller.token)||!publishable
    ||projectOrigin!=='https://xiftudmvxphxcjtmfmib.supabase.co')unexpected();
  const result=[];
  for(const [index,caller] of callers.entries())for(const [role,userId] of plan.ownerIds.entries()){
    const observed=await Promise.all(academicTables.map(async table=>{
      const target=new URL('/rest/v1/'+table,projectOrigin);
      target.search=new URLSearchParams({select:'*',user_id:'eq.'+userId,order:'id.asc',limit:'40'});
      const response=await fetchImpl(target,{method:'GET',redirect:'error',headers:{apikey:publishable,Authorization:'Bearer '+caller.token},signal});
      if(response.status!==200||response.redirected||response.url&&response.url!==target.href)unexpected();
      const value=await readResponse(response,target);
      const expected=index===role?plan.rows[table].filter(row=>row.user_id===userId):[];
      if(!Array.isArray(value)||!isDeepStrictEqual(value.map(normalized),expected))unexpected();
      return {count:value.length,sha256:hash(value.map(normalized))};
    }));
    result.push(observed);
  }
  return {sha256:hash(result),ownReads:8,crossedReads:8};
}

export function academicGradesPreviewRequest(testCase){
  const canonical=academicGradesPreviewCases().find(row=>row.id===testCase?.id);
  if(!canonical||!isDeepStrictEqual(canonical,testCase))unexpected();
  const body=JSON.stringify({question:canonical.question,route:canonical.route,stream:true});
  return {path:'/api/affairs-assistant',body,sha256:hash(body)};
}
export function gradeAcademicGradesPreview(testCase,envelope,{before,after,deniedMarkers=[]}={}){
  const request=academicGradesPreviewRequest(testCase),failedChecks=[];
  const {failures}=gradeCase({...testCase,executionContract:'live-native'},envelope);
  failedChecks.push(...failures.map(row=>row.id));
  const safe=/^[a-f0-9]{64}$/u;
  if(!before||!isDeepStrictEqual(before,after)||!safe.test(before.rows??'')||!safe.test(before.callers?.sha256??'')
    ||before.callers.ownReads!==8||before.callers.crossedReads!==8)failedChecks.push('academic-preview.source');
  if(!uuid.test(envelope.correlationId??'')||envelope.requestSha256!==request.sha256
    ||!Number.isSafeInteger(envelope.requestIndex)||envelope.requestIndex<1)failedChecks.push('academic-preview.dispatch');
  const events=envelope.events??envelope.body?.activity??[];
  const tools=new Set(events.map(event=>/^account-read:([^:]+):\d+$/u.exec(event.kind)?.[1]).filter(Boolean));
  if(envelope.execution!=='live-native'||tools.size!==1||!tools.has('academicGrades')
    ||events.filter(event=>event.kind==='academic-grades-evidence-check'&&event.status==='complete').length!==1
    ||events.some(event=>/^web-|^public-|^account-replan/u.test(event.kind)))failedChecks.push('academic-preview.scope');
  const output=JSON.stringify(envelope.body??{});
  if([...(academicGradesPreviewActor(testCase)===0?['FOREIGN PRIVATE SENTINEL']:[]),'WRONG TERM PROTECTED RECORD',...deniedMarkers]
    .some(marker=>marker&&output.includes(marker))||envelope.body?.proposedAction)failedChecks.push('academic-preview.isolation');
  return {caseId:testCase.id,passed:failedChecks.length===0,failedChecks,sourceSha256:before?.rows??null,callerSha256:before?.callers?.sha256??null};
}
