import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {gradeCase} from './grading.mjs';
import {dtmAssignmentListCases,dtmAssignmentListFixture} from './dtm-assignment-list-cases.mjs';

export const dtmAssignmentListFamily='dtm-assignment-list';
export const dtmAssignmentListFixtureMode='dtm-assignment-list-only';
export const dtmAssignmentListRequirement='dtm_assignment_list_disposable';
const project='xiftudmvxphxcjtmfmib';
const endpoint='/api/affairs-assistant';
const uuid=/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu;
const digest=value=>createHash('sha256').update(value).digest('hex');
const prefix='account:dtm-assignment-list-';
const mounted=new Set(['course-all','account-all','exact-day','open-zh','done','graded','submitted','title-only','count']);
const courseFields=['id','user_id','code','source_mode'];
const assignmentFields=['id','student_id','enrollment_id','dtm_course_id','source_mode','title','status','due_at','submitted_at','details'];
const submittedAt='2026-11-15T00:00:00.000Z';
const details='SENSITIVE FULL INSTRUCTIONS';

export function dtmAssignmentListLiveCases(){
  return dtmAssignmentListCases().filter(row=>mounted.has(row.id.slice(prefix.length))).map(row=>({
    ...row,
    fixtureKey:'live:'+dtmAssignmentListFamily,
    fixtureRequirement:dtmAssignmentListRequirement,
    executionContract:'live-native',
    capability:{level:'native',gap:false},
  }));
}

export function assertDtmAssignmentListLiveCases(cases){
  if(!isDeepStrictEqual(cases,dtmAssignmentListLiveCases()))
    throw new Error('Moodle assignment-list evaluation requires the complete unchanged disposable packet.');
}

export function buildDtmAssignmentListFixture(users){
  if(!Array.isArray(users)||users.length!==2||users.some(user=>!uuid.test(user?.id)||!uuid.test(user?.studentId))
    ||new Set(users.flatMap(user=>[user.id,user.studentId])).size!==4)
    throw new Error('Two distinct disposable Moodle callers and student records are required.');
  const oracle=dtmAssignmentListFixture(dtmAssignmentListCases()[0]);
  const bind=fixtureOwner=>users[fixtureOwner===oracle.identity.caller?0:1];
  const courses=oracle.courses.map(row=>({...row,user_id:bind(row.user_id).id}));
  const assignments=oracle.records.map(row=>({
    id:row.id,student_id:bind(row.affairs_students.user_id).studentId,enrollment_id:null,
    dtm_course_id:row.dtm_course_id,source_mode:row.source_mode,title:row.title,status:row.status,
    due_at:row.due_at?new Date(row.due_at).toISOString():null,
    submitted_at:row.status==='open'?null:submittedAt,details,
  }));
  return {courses,assignments,recordIds:[...courses,...assignments].map(row=>row.id)};
}

function normalizeAssignment(row){
  const normalized={...row};
  for(const field of ['due_at','submitted_at'])if(row[field]!==null)normalized[field]=new Date(row[field]).toISOString();
  return normalized;
}

function assertRows(response,expected,normalize=value=>value){
  const sort=rows=>rows.slice().sort((a,b)=>a.id.localeCompare(b.id));
  if(!Array.isArray(response)||response.length!==expected.length
    ||!isDeepStrictEqual(sort(response.map(normalize)),sort(expected)))
    throw new Error('Moodle assignment-list fixture returned different rows or crossed an owner boundary.');
}

export async function readDtmAssignmentListFixture(plan,users,{publishable,fetchImpl,readResponse,signal}){
  if(!isDeepStrictEqual(plan,buildDtmAssignmentListFixture(users))
    ||users.some(user=>typeof user.token!=='string'||!user.token)||users[0].token===users[1].token)
    throw new Error('The Moodle assignment-list fixture has no matching caller sessions.');
  const courseIds='in.('+plan.courses.map(row=>row.id).join(',')+')';
  return Promise.all(users.map(async user=>{
    async function select(table,fields,key,filter){
      const url=new URL('/rest/v1/'+table,'https://'+project+'.supabase.co');
      url.search=new URLSearchParams({select:fields.join(','),[key]:filter,order:'id.asc',limit:'12'});
      const response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{apikey:publishable,Authorization:'Bearer '+user.token},signal});
      return readResponse(response,url,16384);
    }
    // Apply the same ID set for both callers. The database must enforce the
    // ownership filter, including the second caller's actual positive control.
    const courses=plan.courses.filter(row=>row.user_id===user.id);
    const assignments=plan.assignments.filter(row=>row.student_id===user.studentId);
    const [actualCourses,actualAssignments]=await Promise.all([
      select('dtm_courses',courseFields,'id',courseIds),
      select('affairs_assignments',assignmentFields,'dtm_course_id',courseIds),
    ]);
    assertRows(actualCourses,courses);
    assertRows(actualAssignments,assignments,normalizeAssignment);
    return {count:courses.length+assignments.length,sha256:digest(JSON.stringify([courses,assignments]))};
  }));
}

export function dtmAssignmentListDispatch(endpoint,body){return {endpoint,bodySha256:digest(body)};}

export function bindDtmAssignmentListReadback(testCase,envelope,{before,after}){
  const ticket=envelope.deploymentCheck;
  const request=dtmAssignmentListDispatch(endpoint,JSON.stringify({
    question:testCase.question,history:[],route:testCase.route,stream:true,consentedResearchUse:false,
  }));
  const events=envelope.events?.map(({kind,status})=>[kind,status]);
  const observedReadbacks=Array.isArray(before)&&before.length===2&&before.every(({count,sha256},index)=>
    count===[8,2][index]&&/^[a-f0-9]{64}$/u.test(sha256));
  if(!observedReadbacks||!isDeepStrictEqual(before,after)
    ||envelope.execution!=='live-native'||envelope.statusCode!==200||envelope.fixtureIntegrityFailed
    ||!uuid.test(envelope.correlationId)||!/^[a-f0-9]{40}$/u.test(envelope.sourceRevision??'')
    ||ticket?.verified!==true||ticket.sourceRevision!==envelope.sourceRevision
    ||!Number.isSafeInteger(ticket.requestIndex)||ticket.requestIndex<1
    ||!isDeepStrictEqual(request,envelope.assignmentListDispatch)
    ||envelope.body?.verification?.status!=='verified'||envelope.body.verification.attempts!==1
    ||!isDeepStrictEqual(events,[['account-read:dtmAssignmentList:1','complete'],['verification-1','running'],['verification-1','complete']]))
    throw new Error('Moodle assignment-list evidence did not match the pinned request and two caller readbacks.');
  return {caseId:testCase.id,correlationId:envelope.correlationId,sourceRevision:envelope.sourceRevision,
    requestIndex:ticket.requestIndex,request,before,after};
}

export function verifiedDtmAssignmentListReadback(testCase,envelope){
  const fixture=envelope.fixtureReadback;
  if(fixture?.verified!==true||fixture.independentGolden!==true||fixture.projectRef!==project||!fixture.dtmAssignmentList)
    return false;
  try{return isDeepStrictEqual(fixture.dtmAssignmentList,bindDtmAssignmentListReadback(testCase,envelope,fixture.dtmAssignmentList));}
  catch{return false;}
}


export function gradeDtmAssignmentListLiveCase(testCase,envelope){
  const overall=gradeCase(testCase,envelope);
  const answer=envelope.body?.answer||'';
  const links=[...answer.matchAll(/\]\((\/dtm\/course\/[a-f0-9-]+\/assignment\/[a-f0-9-]+)\)/gu)].map(match=>match[1]);
  const expectedLinks=testCase.expected.requiredLinks.filter(path=>path.includes('/assignment/'));
  const reportedCount=answer.match(/(?:Matching saved assignments: |相符的已儲存作業筆數：)(\d+)\./gu)||[];
  const checks=[...overall.checks,
    {id:'dtm-assignment-list.exact-links',passed:isDeepStrictEqual(links,expectedLinks),
      detail:'The reply exposes exactly the selected assignment links.'},
    {id:'dtm-assignment-list.exact-count',passed:reportedCount.length===1&&Number(reportedCount[0].match(/\d+/u)[0])===testCase.observation.amount,
      detail:'The listed count matches the independent saved-record expectation.'},
  ];
  const failures=checks.filter(check=>!check.passed);
  return {...overall,checks,failures,passed:failures.length===0};
}
