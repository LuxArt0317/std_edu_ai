import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {buildAccountCases} from './account-cases.mjs';
import {buildAccountFixture,DEFAULT_EVAL_NOW,EVAL_IDS,evaluationDates} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

export const dtmStudyPreviewMode='dtm-study-preview';
const caseIds=['dtm-term-courses','dtm-course-role','dtm-meeting-notes','dtm-next-meeting','dtm-absence'].map(id=>'account:'+id);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fail=()=>{throw Error('Unexpected saved Moodle study fixture state.');};
const sorted=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const same=(actual,expected)=>actual.length===expected.length&&actual.every((row,index)=>isDeepStrictEqual(row,expected[index]));
const coursePath='/dtm/course/';
const foreignMarker='PROTECTED FOREIGN MOODLE MEETING';
const courseKeys=['id','user_id','code','title','term','role','source_mode'];
const meetingKeys=['id','course_id','meeting_on','starts_at','title','attendance','notes'];

export function dtmStudyPreviewCases({courseId=EVAL_IDS.dtmCourse,now=DEFAULT_EVAL_NOW}={}){
  if(!uuid.test(courseId))fail();
  const byId=new Map(buildAccountCases({now}).map(row=>[row.id,row]));
  return caseIds.map(id=>{
    const original=byId.get(id);
    if(original?.domain!=='dtm'||original.expected.requiredTools.join()!=='dtm')fail();
    return {...original,route:original.route.replace(coursePath+EVAL_IDS.dtmCourse,coursePath+courseId)};
  });
}

export function buildDtmStudyPreviewPlan(owners,now){
  if(!Array.isArray(owners)||owners.length!==2||new Set(owners.map(row=>row.id)).size!==2||owners.some(row=>!uuid.test(row.id)))fail();
  const ownerIds=owners.map(row=>row.id);
  const standard=buildAccountFixture({userId:ownerIds[0],now}).dtm.courses;
  const courseId=randomUUID(),otherCourseId=randomUUID();
  const courses=standard.map((row,index)=>({id:index===0?courseId:randomUUID(),user_id:ownerIds[0],code:row.code,title:row.title,term:row.term,role:row.role,source_mode:row.sourceMode}));
  courses.push({id:otherCourseId,user_id:ownerIds[1],code:'DTM-B',title:foreignMarker,term:'114學年度第2學期',role:'teacher',source_mode:'personal'});
  const meetings=standard[0].meetings.map(row=>({id:randomUUID(),course_id:courseId,meeting_on:row.date,starts_at:row.startsAt,
    title:row.title,attendance:row.attendance,notes:row.notes}));
  meetings.push({...meetings[0],id:randomUUID(),course_id:otherCourseId,notes:foreignMarker});
  return {ownerIds,courseId,courseIds:courses.map(row=>row.id),meetingIds:meetings.map(row=>row.id),now,
    courses:sorted(courses),meetings:sorted(meetings)};
}

export async function assertDtmStudyPreviewSchema(sql){
  const rows=await sql`select c.relname,c.relrowsecurity from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('dtm_courses','dtm_meetings')`;
  if(rows.length!==2||rows.some(row=>row.relrowsecurity!==true))fail();
}
export async function verifyDtmStudyPreviewRows(sql,plan,{allowEmpty=false,expectEmpty=false}={}){
  const courses=await sql`select id,user_id,code,title,term,role,source_mode from public.dtm_courses
    where user_id in ${sql(plan.ownerIds)} or id in ${sql(plan.courseIds)} order by id`;
  const meetings=await sql`select id,course_id,meeting_on::text,starts_at::text,title,attendance,notes from public.dtm_meetings
    where course_id in ${sql(plan.courseIds)} or id in ${sql(plan.meetingIds)} order by id`;
  const unrelated=await sql`select
    (select count(*)::integer from public.affairs_profiles where user_id in ${sql(plan.ownerIds)}) as profiles,
    (select count(*)::integer from public.affairs_students where user_id in ${sql(plan.ownerIds)}) as students`;
  if(unrelated.length!==1||unrelated[0].profiles||unrelated[0].students)fail();
  const empty=!courses.length&&!meetings.length;
  if(expectEmpty&&!empty||!empty&&(!same(courses,plan.courses)||!same(meetings,plan.meetings))||empty&&!allowEmpty&&!expectEmpty)fail();
  return hash({courses,meetings});
}
export async function seedDtmStudyPreviewRows(sql,plan){
  await verifyDtmStudyPreviewRows(sql,plan,{expectEmpty:true});
  await sql`insert into public.dtm_courses ${sql(plan.courses)}`;
  await sql`insert into public.dtm_meetings ${sql(plan.meetings)}`;
  return verifyDtmStudyPreviewRows(sql,plan);
}

export async function readDtmStudyPreviewCallers(plan,users,{projectOrigin,publishable,fetchImpl,readResponse,signal}){
  if(projectOrigin!=='https://xiftudmvxphxcjtmfmib.supabase.co'||users.length!==2||!publishable
    ||users.some((row,index)=>row.id!==plan.ownerIds[index]||!row.token))fail();
  const matrix=[];
  for(const [index,user] of users.entries())for(const [targetIndex,target] of plan.ownerIds.entries()){
    const owned=plan.courses.filter(row=>row.user_id===target),ids=owned.map(row=>row.id);
    async function read(table,params,keys,expected){
      const address=new URL('/rest/v1/'+table,projectOrigin);
      address.search=new URLSearchParams({select:keys.join(','),order:'id.asc',limit:'50',...params});
      const response=await fetchImpl(address,{method:'GET',redirect:'error',headers:{apikey:publishable,Authorization:'Bearer '+user.token},signal});
      const actual=await readResponse(response,address);
      if(!Array.isArray(actual)||!same(actual,index===targetIndex?expected:[]))fail();
      return hash(actual);
    }
    const courses=await read('dtm_courses',{user_id:'eq.'+target},courseKeys,owned);
    const meetings=await read('dtm_meetings',{course_id:'in.('+ids.join(',')+')'},meetingKeys,plan.meetings.filter(row=>ids.includes(row.course_id)));
    matrix.push({courses,meetings});
  }
  return {sha256:hash(matrix),ownReads:4,crossedReads:4};
}
export function dtmStudyPreviewRequest(plan,testCase){
  const defined=dtmStudyPreviewCases(plan).find(row=>row.id===testCase.id);
  if(!isDeepStrictEqual(testCase,defined))fail();
  const body=JSON.stringify({question:defined.question,route:defined.route,stream:true});
  return {path:'/api/affairs-assistant',body,sha256:hash(body)};
}
export function assertDtmStudyClock(now,actual=new Date().toISOString()){
  if(evaluationDates(now).today!==evaluationDates(actual).today)fail();
}

export function gradeDtmStudyPreview(plan,testCase,envelope,{before,after,privateMarkers=[]}={}){
  const request=dtmStudyPreviewRequest(plan,testCase);
  const failedChecks=gradeCase({...testCase,executionContract:'live-native'},envelope).failures.map(row=>row.id);
  if(!before||!isDeepStrictEqual(before,after)||!/^[a-f0-9]{64}$/u.test(before.rows??'')
    ||!/^[a-f0-9]{64}$/u.test(before.callers?.sha256??'')||before.callers.ownReads!==4||before.callers.crossedReads!==4)failedChecks.push('dtm-study.source');
  if(envelope.requestSha256!==request.sha256||!uuid.test(envelope.correlationId??'')||!Number.isSafeInteger(envelope.requestIndex)||envelope.requestIndex<1)
    failedChecks.push('dtm-study.dispatch');
  const events=envelope.events??envelope.body?.activity??[];
  const tools=new Set(events.map(event=>/^account-read:([^:]+):\d+$/u.exec(event.kind)?.[1]).filter(Boolean));
  if(envelope.execution!=='live-native'||tools.size!==1||!tools.has('dtm')||events.filter(row=>row.kind==='dtm-study-evidence-check'&&row.status==='complete').length!==1
    ||events.some(event=>/^web-|^public-|^account-replan/u.test(event.kind)))failedChecks.push('dtm-study.scope');
  const text=JSON.stringify(envelope.body??{});
  if(envelope.body?.proposedAction||[foreignMarker,...plan.ownerIds,...privateMarkers].some(marker=>marker&&text.includes(marker)))failedChecks.push('dtm-study.isolation');
  return {caseId:testCase.id,passed:failedChecks.length===0,failedChecks,sourceSha256:before?.rows??null,callerSha256:before?.callers?.sha256??null};
}
