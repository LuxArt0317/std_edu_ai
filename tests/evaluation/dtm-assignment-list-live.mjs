import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {gradeCase} from './grading.mjs';
import {dtmAssignmentListCases,dtmAssignmentListFixture} from './dtm-assignment-list-cases.mjs';

export const dtmAssignmentListFamily='dtm-assignment-list';
export const dtmAssignmentListFixtureMode='dtm-assignment-list-only';
export const dtmAssignmentListRequirement='dtm_assignment_list_disposable';
const project='xiftudmvxphxcjtmfmib';
const uuid=/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu;
const digest=value=>createHash('sha256').update(value).digest('hex');
const prefix='account:dtm-assignment-list-';
const mounted=new Map([
  [dtmAssignmentListFamily,['course-all','account-all','exact-day','open-zh','done','graded','submitted','title-only','count',
    'exact-sample','foreign-question','foreign-course','uploads','grades','bulk-change','anonymous']],
  [dtmAssignmentListFamily+'-empty',['empty-course','hide-sample-without-personal-records']],
  [dtmAssignmentListFamily+'-sample',['fallback-sample']],
  [dtmAssignmentListFamily+'-partial',['partial']],
]);
const dated=new Map([
  [dtmAssignmentListFamily+'-relative-fixed',{mode:'fixed',period:'calendar',cases:['today','tomorrow','today-account']}],
  [dtmAssignmentListFamily+'-overdue-fixed',{mode:'fixed',period:'overdue',cases:['overdue']}],
  [dtmAssignmentListFamily+'-relative-portable',{mode:'portable',period:'calendar',cases:['today','tomorrow','today-account']}],
  [dtmAssignmentListFamily+'-overdue-portable',{mode:'portable',period:'overdue',cases:['overdue']}],
]);
export const dtmAssignmentListFamilies=Object.freeze([...mounted.keys(),...dated.keys()]);
export const isDtmAssignmentListClockFamily=family=>dated.has(family);
const dateOffset=8*60*60*1000,dayMs=24*60*60*1000,clockSkewMs=2000;
const iso=value=>new Date(value).toISOString();
const campusDate=value=>iso(value+dateOffset).slice(0,10);
const campusStart=value=>Date.parse(campusDate(value)+'T00:00:00+08:00');
const authoredReference=Date.parse('2026-11-16T16:15:00.000Z');
const authoredIndexDeadline=Date.parse('2026-11-16T10:00:00.000Z');
const authoredSketchDeadline=Date.parse('2026-11-17T01:10:00.000Z');
const clockError=message=>Object.assign(new Error(message),{code:'dtm-assignment-list-clock-invalid'});
const clockTime=value=>{
  const time=typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isFinite(time)||iso(time)!==value)throw clockError('Moodle assignment-list clock must be a canonical UTC timestamp.');
  return time;
};

function clockFor(family,now){
  const definition=dated.get(family);
  if(!definition)return null;
  const {mode,period}=definition;
  const reference=mode==='portable'?clockTime(now):authoredReference;
  const offset=mode==='fixed'?0:period==='overdue'?reference-authoredReference:campusStart(reference)-campusStart(authoredReference);
  const opens=period==='calendar'?campusStart(authoredReference):authoredIndexDeadline+1;
  const closes=period==='calendar'?opens+dayMs:authoredSketchDeadline;
  return {family,mode,period,timeZone:'Asia/Taipei',referenceAt:iso(reference),offset,
    opensAt:iso(opens+offset),validUntil:iso(closes+offset)};
}

export function assertDtmAssignmentListClock(testCase,now,{reserveMs=0}={}){
  const clock=testCase.assignmentListClock;
  if(!clock)return null;
  if(!isDeepStrictEqual(clock,clockFor(clock.family,clock.referenceAt)))
    throw clockError('Moodle assignment-list clock binding differs from its independent scenario.');
  const time=clockTime(now);
  if(clock.mode==='portable'&&time+clockSkewMs<clockTime(clock.referenceAt))
    throw clockError('Moodle assignment-list clock predates the portable fixture binding.');
  if(!Number.isSafeInteger(reserveMs)||reserveMs<0||time<clockTime(clock.opensAt)||time+reserveMs>=clockTime(clock.validUntil))
    throw clockError('Moodle assignment-list fixture is outside its real Taipei time window.');
  return now;
}

function clockReadback(testCase,envelope,checkedAfter){
  const before=assertDtmAssignmentListClock(testCase,envelope.assignmentListDispatch?.startedAt);
  const checkedAt=assertDtmAssignmentListClock(testCase,envelope.body?.grounding?.checkedAt);
  const after=assertDtmAssignmentListClock(testCase,checkedAfter);
  // Allow two seconds for server/client clock skew. All three stamps still
  // must independently satisfy the scoped window and span the same request.
  if(clockTime(after)<clockTime(before)||clockTime(checkedAt)<clockTime(before)-clockSkewMs
    ||clockTime(checkedAt)>clockTime(after)+clockSkewMs)
    throw clockError('Moodle assignment-list server timestamp is outside the request and paired readback bracket.');
  return {binding:testCase.assignmentListClock,before,checkedAt,after};
}

const readEvents=[['account-read:dtmAssignmentList:1','complete'],['verification-1','running'],['verification-1','complete']];
const unavailableEvents=[
  ['account-read:dtmAssignmentList:1','unavailable'],['verification-1','running'],['verification-1','unavailable'],
  ['verification-retry','complete'],['account-read:dtmAssignmentList:2','unavailable'],
  ['verification-2','running'],['verification-2','unavailable'],['verification-stop','unavailable'],
];
const courseFields=['id','user_id','code','source_mode'];
const assignmentFields=['id','student_id','enrollment_id','dtm_course_id','source_mode','title','status','due_at','submitted_at','details'];
const submittedAt='2026-11-15T00:00:00.000Z';
const details='SENSITIVE FULL INSTRUCTIONS';

export function dtmAssignmentListLiveCases(family=dtmAssignmentListFamily,{now}={}){
  const datedFamily=dated.get(family);
  const selected=mounted.get(family)??datedFamily?.cases;
  if(!selected)throw new Error('Unknown Moodle assignment-list evaluation family.');
  const clock=clockFor(family,now);
  return dtmAssignmentListCases().filter(row=>selected.includes(row.id.slice(prefix.length))).map(row=>{
    const portable=clock?.mode==='portable';
    const id=portable?prefix+'portable-'+row.id.slice(prefix.length):row.id;
    const bound={...row,id,fixtureKey:row.auth==='anonymous'?'anonymous':'live:'+family,
      fixtureRequirement:dtmAssignmentListRequirement,executionContract:'live-native',
      capability:{level:'native',gap:false},...(clock?{assignmentListClock:{...clock}}:{})};
    if(portable){
      const {records}=dtmAssignmentListLiveFixture(bound);
      bound.expected={...row.expected,facts:row.expected.facts.map(fact=>{
        const record=records.find(item=>item.title===fact.label);
        return record?.due_at&&fact.fields?{...fact,fields:fact.fields.map(field=>
          field.label==='Saved deadline'?{...field,values:[iso(clockTime(record.due_at)+dateOffset).slice(0,16).replace('T',' ')]}:field)}:fact;
      })};
    }
    return bound;
  });
}

export function assertDtmAssignmentListLiveCases(cases,family=dtmAssignmentListFamily,{now}={}){
  if(!isDeepStrictEqual(cases,dtmAssignmentListLiveCases(family,{now})))
    throw new Error('Moodle assignment-list evaluation requires the complete unchanged disposable packet.');
}

export function dtmAssignmentListLiveFixture(testCase){
  const originalId=testCase.id.replace(prefix+'portable-',prefix);
  const known=dtmAssignmentListCases().find(row=>row.id===originalId);
  const fixture=dtmAssignmentListFixture(known);
  const clock=testCase.assignmentListClock;
  if(clock?.mode==='portable'){
    fixture.records=fixture.records.map(row=>row.due_at?{...row,due_at:iso(Date.parse(row.due_at)+clock.offset)}:row);
    fixture.identity.asOf=clock.referenceAt;
  }
  return fixture;
}

export function dtmAssignmentListExpectedReadCounts(testCase){
  const {courses,records,identity:{caller,other}}=dtmAssignmentListLiveFixture(testCase);
  return [caller,other].map(id=>courses.filter(row=>row.user_id===id).length
    +records.filter(row=>row.affairs_students.user_id===id).length);
}

export function buildDtmAssignmentListFixture(users,family=dtmAssignmentListFamily,{now}={}){
  if(!Array.isArray(users)||users.length!==2||users.some(user=>!uuid.test(user?.id)||!uuid.test(user?.studentId))
    ||new Set(users.flatMap(user=>[user.id,user.studentId])).size!==4)
    throw new Error('Two distinct disposable Moodle callers and student records are required.');
  const [fixtureCase]=dtmAssignmentListLiveCases(family,{now});
  const oracle=dtmAssignmentListLiveFixture(fixtureCase);
  const bind=fixtureOwner=>users[fixtureOwner===oracle.identity.caller?0:1];
  const courses=oracle.courses.map(row=>({...row,user_id:bind(row.user_id).id}));
  const assignments=oracle.records.map(row=>({
    id:row.id,student_id:bind(row.affairs_students.user_id).studentId,enrollment_id:null,
    dtm_course_id:row.dtm_course_id,source_mode:row.source_mode,title:row.title,status:row.status,
    due_at:row.due_at?new Date(row.due_at).toISOString():null,
    submitted_at:row.status==='open'?null:iso(Date.parse(submittedAt)+(fixtureCase.assignmentListClock?.offset??0)),details,
  }));
  return {courses,assignments,recordIds:[...courses,...assignments].map(row=>row.id),
    ...(fixtureCase.assignmentListClock?{assignmentListClock:fixtureCase.assignmentListClock}:{})};
}

export async function initializeDtmAssignmentListStudent(user,{publishable,fetchImpl,readResponse,signal}){
  if(!uuid.test(user?.id??'')||typeof user.token!=='string'||!user.token)
    throw new Error('A verified disposable Moodle caller is required.');
  const origin='https://'+project+'.supabase.co';
  const headers={apikey:publishable,Authorization:'Bearer '+user.token};
  // The full workspace also initializes a real sample Moodle assignment.
  // Provision only the School Affairs student that the independent plan needs.
  const initialize=new URL('/rest/v1/rpc/affairs_initialize_account',origin);
  const initialized=await readResponse(await fetchImpl(initialize,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
    headers:{...headers,'Content-Type':'application/json'},body:'{}',signal}),initialize,16384);
  const profile=Array.isArray(initialized)&&initialized.length===1?initialized[0]:initialized;
  if(profile?.user_id!==user.id||profile.role!=='student')
    throw new Error('School Affairs initialization did not return the disposable student profile.');
  const students=new URL('/rest/v1/affairs_students',origin);
  students.search=new URLSearchParams({select:'id,user_id',user_id:'eq.'+user.id,limit:'2'});
  const rows=await readResponse(await fetchImpl(students,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
    headers,signal}),students,4096);
  if(!Array.isArray(rows)||rows.length!==1||rows[0]?.user_id!==user.id||!uuid.test(rows[0].id??''))
    throw new Error('School Affairs initialization did not bind exactly one disposable student.');
  return rows[0].id;
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

export async function readDtmAssignmentListFixture(plan,users,{family=dtmAssignmentListFamily,publishable,fetchImpl,readResponse,signal}){
  if(!isDeepStrictEqual(plan,buildDtmAssignmentListFixture(users,family,{now:plan?.assignmentListClock?.referenceAt}))
    ||users.some(user=>typeof user.token!=='string'||!user.token)||users[0].token===users[1].token)
    throw new Error('The Moodle assignment-list fixture has no matching caller sessions.');
  const ownerIds='in.('+users.map(row=>row.id).join(',')+')';
  const studentIds='in.('+users.map(row=>row.studentId).join(',')+')';
  // Include room to detect one unexpected row in either caller's scope.
  const limit=String(Math.max(plan.courses.length,plan.assignments.length)+1);
  return Promise.all(users.map(async user=>{
    async function select(table,fields,filter){
      const url=new URL('/rest/v1/'+table,'https://'+project+'.supabase.co');
      url.search=new URLSearchParams({select:fields.join(','),...filter,order:'id.asc',limit});
      const response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{apikey:publishable,Authorization:'Bearer '+user.token},signal});
      return readResponse(response,url,16384);
    }
    // Both callers request both disposable scopes. This also detects extra
    // owner rows outside the reserved record IDs that might change list scope.
    const courses=plan.courses.filter(row=>row.user_id===user.id);
    const assignments=plan.assignments.filter(row=>row.student_id===user.studentId);
    const [actualCourses,actualAssignments]=await Promise.all([
      select('dtm_courses',courseFields,{user_id:ownerIds}),
      select('affairs_assignments',assignmentFields,{student_id:studentIds,dtm_course_id:'not.is.null'}),
    ]);
    assertRows(actualCourses,courses);
    assertRows(actualAssignments,assignments,normalizeAssignment);
    return {count:courses.length+assignments.length,sha256:digest(JSON.stringify([courses,assignments]))};
  }));
}

export function dtmAssignmentListDispatch(endpoint,body,authenticated,startedAt){
  return {endpoint,bodySha256:digest(body),authenticated,...(startedAt?{startedAt}:{})};
}

export function bindDtmAssignmentListReadback(testCase,envelope,{before,after,checkedAfter}){
  const ticket=envelope.deploymentCheck;
  const authenticated=testCase.auth==='signed-in';
  const request=dtmAssignmentListDispatch(authenticated?'/api/affairs-assistant':'/api/research-assistant',JSON.stringify({
    question:testCase.question,history:[],route:testCase.route,stream:true,consentedResearchUse:false,
  }),authenticated,testCase.assignmentListClock?envelope.assignmentListDispatch?.startedAt:undefined);
  const clock=testCase.assignmentListClock?clockReadback(testCase,envelope,checkedAfter):null;
  const events=envelope.events?.map(({kind,status})=>[kind,status]);
  const {body}=envelope;
  const observation=testCase.observation;
  let observedBehavior;
  if(observation.verification==='unverified'){
    observedBehavior=body?.status==='abstained'&&body.verification?.status==='unverified'&&body.verification.attempts===2
      &&body.verification.reason==='evidence_unavailable'&&isDeepStrictEqual(events,unavailableEvents)
      &&isDeepStrictEqual(body.citations,[])&&body.grounding?.webSearched===false&&!body.proposedAction&&!body.views?.length;
  }else if(observation.read){
    observedBehavior=body?.verification?.status==='verified'&&body.verification.attempts===1&&isDeepStrictEqual(events,readEvents);
  }else{
    observedBehavior=body?.status==='handoff'&&body.verification===undefined&&body.grounding?.webSearched===false
      &&!body.proposedAction&&!body.views?.length&&isDeepStrictEqual(events,[])&&Array.isArray(body.citations)
      &&isDeepStrictEqual(body.citations.map(row=>row.url),testCase.expected.requiredLinks);
  }
  const expectedCounts=dtmAssignmentListExpectedReadCounts(testCase);
  const observedReadbacks=Array.isArray(before)&&before.length===2&&before.every(({count,sha256},index)=>
    count===expectedCounts[index]&&/^[a-f0-9]{64}$/u.test(sha256));
  if(!observedReadbacks||!isDeepStrictEqual(before,after)
    ||envelope.execution!=='live-native'||envelope.statusCode!==200||envelope.fixtureIntegrityFailed
    ||!uuid.test(envelope.correlationId)||!/^[a-f0-9]{40}$/u.test(envelope.sourceRevision??'')
    ||ticket?.verified!==true||ticket.sourceRevision!==envelope.sourceRevision
    ||!Number.isSafeInteger(ticket.requestIndex)||ticket.requestIndex<1
    ||!isDeepStrictEqual(request,envelope.assignmentListDispatch)
    ||!observedBehavior)
    throw new Error('Moodle assignment-list evidence did not match the pinned request and two caller readbacks.');
  return {caseId:testCase.id,correlationId:envelope.correlationId,sourceRevision:envelope.sourceRevision,
    requestIndex:ticket.requestIndex,request,before,after,...(clock?{clock}:{})};
}

export function verifiedDtmAssignmentListReadback(testCase,envelope){
  const fixture=envelope.fixtureReadback;
  if(fixture?.verified!==true||fixture.independentGolden!==true||fixture.projectRef!==project||!fixture.dtmAssignmentList)
    return false;
  try{
    const {before,after,clock}=fixture.dtmAssignmentList;
    return isDeepStrictEqual(fixture.dtmAssignmentList,bindDtmAssignmentListReadback(testCase,envelope,{before,after,checkedAfter:clock?.after}));
  }
  catch{return false;}
}


export function gradeDtmAssignmentListLiveCase(testCase,envelope){
  const overall=gradeCase(testCase,envelope);
  const answer=envelope.body?.answer||'';
  const links=[...answer.matchAll(/\]\((\/dtm\/course\/[a-f0-9-]+\/assignment\/[a-f0-9-]+)\)/gu)].map(match=>match[1]);
  let expectedLinks=testCase.expected.requiredLinks.filter(path=>path.includes('/assignment/'));
  if(testCase.observation.partial){
    const {records,identity:{caller}}=dtmAssignmentListLiveFixture(testCase);
    expectedLinks=records.filter(row=>row.affairs_students.user_id===caller&&row.source_mode==='personal')
      .sort((a,b)=>(a.due_at??'9999').localeCompare(b.due_at??'9999')||a.id.localeCompare(b.id))
      .slice(0,20).map(row=>'/dtm/course/'+row.dtm_course_id+'/assignment/'+row.id);
  }
  const reportedCount=answer.match(/(?:Matching saved assignments: |相符的已儲存作業筆數：)(\d+)\./gu)||[];
  const checks=[...overall.checks,
    ...(testCase.assignmentListClock?[{id:'dtm-assignment-list.real-clock',passed:verifiedDtmAssignmentListReadback(testCase,envelope),
      detail:'The selected dates match the protected server clock and immutable paired fixture readbacks.'}]:[]),
    {id:'dtm-assignment-list.exact-links',passed:isDeepStrictEqual(links,expectedLinks),
      detail:'The reply exposes exactly the selected assignment links.'},
    {id:'dtm-assignment-list.exact-count',passed:testCase.observation.verification==='verified'&&testCase.observation.amount>0
      ?reportedCount.length===1&&Number(reportedCount[0].match(/\d+/u)[0])===testCase.observation.amount:reportedCount.length===0,
      detail:'The listed count matches the independent saved-record expectation.'},
  ];
  const failures=checks.filter(check=>!check.passed);
  return {...overall,checks,failures,passed:failures.length===0};
}
