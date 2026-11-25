import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const dtmTimingFixtureMode='dtm-submission-timing-only';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const digest=value=>createHash('sha256').update(JSON.stringify(value,(_key,entry)=>
  entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.entries(entry).sort()):entry)).digest('hex');
const need=(condition,stage)=>{if(!condition)throw new Error('Moodle timing Preview failed at '+stage+'.');};
const created='2026-09-20T08:00:00.000000Z',expires='2026-09-28T12:00:00.000000Z';
const question='Was my submission late, and by how much?';
const timestampKeys=new Set(['created_at','due_at','submitted_at','content_modified_at','due_at_at_submission','expires_at','committed_at']);

function preciseUtc(value){
  if(value===null)return null;
  need(typeof value==='string'&&/^(?:\d{4}-\d\d-\d\d)T\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/u.test(value),'saved timestamp shape');
  const date=new Date(value);
  need(Number.isFinite(date.getTime()),'saved timestamp value');
  const fraction=/\.(\d{1,6})/u.exec(value)?.[1]??'';
  return date.toISOString().slice(0,19)+'.'+fraction.padEnd(6,'0')+'Z';
}

const normalize=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,timestampKeys.has(key)?preciseUtc(value):value]));
const sort=rows=>rows.slice().sort((a,b)=>a.id.localeCompare(b.id));
const keys=(rows,key='id')=>rows.map(row=>row[key]);
const equalRows=(left,right)=>isDeepStrictEqual(sort(left.map(normalize)),sort(right.map(normalize)));
const pathFor=row=>'/dtm/course/'+row.dtm_course_id+'/assignment/'+row.id;

export function buildDtmTimingPlan(runId,owners){
  need(uuid(runId)&&Array.isArray(owners)&&owners.length===2&&owners.every(row=>uuid(row?.id)&&uuid(row?.studentId))
    &&new Set([runId,...owners.flatMap(row=>[row.id,row.studentId])]).size===5,'distinct disposable owners');
  const students=owners.map(({id,studentId})=>({id,studentId}));
  const suffix=runId.replaceAll('-','').slice(0,12);
  const courses=students.map(({id},index)=>({id:randomUUID(),user_id:id,role:'student',source_mode:'personal',
    code:'TIMING-'+suffix+'-'+index,title:'Disposable Moodle timing '+index,term:'Timing fixture',created_at:created}));
  const selections=[
    {side:0,key:'late',submitted:'2026-09-22T16:00:00.123456Z',oldDue:'2026-09-22T15:55:00.123456Z',due:'2026-09-29T10:00:00.000000Z'},
    {side:1,key:'early',submitted:'2026-09-24T04:59:59.123455Z',oldDue:'2026-09-24T05:00:00.123456Z',due:'2026-09-24T05:00:00.123456Z'},
    {side:0,key:'no-date',submitted:'2026-09-27T00:00:00.456789Z',oldDue:null,due:'2026-09-30T12:00:00.000000Z'},
  ];
  const assignments=[],submissions=[],uploads=[];
  for(const {side,key,submitted,oldDue,due} of selections){
    const owner=students[side],course=courses[side];
    const assignment={id:randomUUID(),student_id:owner.studentId,dtm_course_id:course.id,source_mode:'personal',
      title:'Disposable '+key+' assignment '+suffix,details:'Synthetic timing fixture only.',status:'submitted',
      due_at:due,submitted_at:submitted};
    const submissionId=randomUUID(),uploadId=randomUUID();
    assignments.push(assignment);
    submissions.push({id:submissionId,assignment_id:assignment.id,user_id:owner.id,course_id:course.id,
      current_upload_id:uploadId,version:1,submitted_at:submitted,content_modified_at:submitted,
      due_at_at_submission:oldDue,source_mode:'local_submission',created_at:created});
    uploads.push({id:uploadId,submission_id:submissionId,user_id:owner.id,object_path:[owner.id,submissionId,uploadId].join('/'),
      filename:'private-timing-'+key+'-'+suffix+'.txt',size_bytes:12,content_type:'text/plain',expected_version:0,state:'current',
      object_id:randomUUID(),object_etag:'metadata-only-'+suffix,created_at:created,committed_at:submitted,expires_at:expires});
  }
  return {runId,owners:students,courses,assignments,submissions,uploads};
}

async function assertOwners(sql,plan){
  const owners=await sql`select u.id,s.id as "studentId",p.role,(u.raw_user_meta_data->>'assistant_evaluation_run') as marker,
    u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as google
    from auth.users u join public.affairs_profiles p on p.user_id=u.id join public.affairs_students s on s.user_id=u.id
    where u.id in ${sql(keys(plan.owners))} limit 3`;
  need(owners.length===2&&plan.owners.every(owner=>owners.some(row=>row.id===owner.id&&row.studentId===owner.studentId
    &&row.role==='student'&&row.marker===plan.runId&&row.google===true)),'independent disposable identity');
}

export async function readDtmTimingState(sql,plan){
  const courseIds=keys(plan.courses),assignmentIds=keys(plan.assignments),submissionIds=keys(plan.submissions),uploadIds=keys(plan.uploads);
  const paths=keys(plan.uploads,'object_path'),ownerIds=keys(plan.owners);
  const [row]=await sql`select jsonb_build_object(
    'courses',coalesce((select jsonb_agg(to_jsonb(c)) from (select id,user_id,code,title,term,role,source_mode,created_at
      from public.dtm_courses where id in ${sql(courseIds)} limit 3)c),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,student_id,dtm_course_id,source_mode,title,details,status,due_at,submitted_at
      from public.affairs_assignments where id in ${sql(assignmentIds)} or dtm_course_id in ${sql(courseIds)} limit 4)a),'[]'::jsonb),
    'submissions',coalesce((select jsonb_agg(to_jsonb(s)) from (select * from public.dtm_assignment_submissions
      where id in ${sql(submissionIds)} or assignment_id in ${sql(assignmentIds)} or course_id in ${sql(courseIds)} limit 4)s),'[]'::jsonb),
    'uploads',coalesce((select jsonb_agg(to_jsonb(u)) from (select * from private.dtm_submission_uploads
      where id in ${sql(uploadIds)} or submission_id in ${sql(submissionIds)} or object_path in ${sql(paths)} limit 4)u),'[]'::jsonb),
    'unexpected',exists(select 1 from public.dtm_submission_reviews where submission_id in ${sql(submissionIds)} or upload_id in ${sql(uploadIds)})
      or exists(select 1 from private.dtm_submission_operations where user_id in ${sql(ownerIds)})
      or exists(select 1 from public.affairs_agent_audit where user_id in ${sql(ownerIds)})
      or exists(select 1 from private.dtm_submission_cleanup where user_id in ${sql(ownerIds)} or object_path in ${sql(paths)})
      or exists(select 1 from storage.objects where id in ${sql(keys(plan.uploads,'object_id'))}
        or bucket_id='dtm-submissions' and name in ${sql(paths)})
    ) as snapshot`;
  const value=row?.snapshot;
  need(value&&['courses','assignments','submissions','uploads'].every(key=>Array.isArray(value[key]))
    &&typeof value.unexpected==='boolean','independent database projection');
  return value;
}

export function emptyDtmTimingState(state){
  return !state.unexpected&&['courses','assignments','submissions','uploads'].every(key=>state[key].length===0);
}

function verifyPlanRows(state,plan){
  need(!state.unexpected&&['courses','assignments','submissions','uploads'].every(key=>equalRows(state[key],plan[key])),
    'exact fixture rows and absent storage, operations and queue');
  return digest(Object.fromEntries(['courses','assignments','submissions','uploads'].map(key=>[key,sort(state[key].map(normalize))])));
}

export async function observeDtmTimingRows(sql,plan){
  await assertOwners(sql,plan);
  return verifyPlanRows(await readDtmTimingState(sql,plan),plan);
}

// Run under the existing leased, reserved connection transaction.
export async function seedDtmTimingRows(sql,plan){
  await assertOwners(sql,plan);
  need(emptyDtmTimingState(await readDtmTimingState(sql,plan)),'empty reserved fixture');
  await sql`insert into public.dtm_courses ${sql(plan.courses)}`;
  // Insert historical deadlines first, then separately edit the visible assignment.
  await sql`insert into public.affairs_assignments ${sql(plan.assignments.map((row,index)=>
    ({...row,due_at:plan.submissions[index].due_at_at_submission})))}`;
  await sql`insert into public.dtm_assignment_submissions ${sql(plan.submissions)}`;
  await sql`insert into private.dtm_submission_uploads ${sql(plan.uploads)}`;
  for(const row of plan.assignments)
    await sql`update public.affairs_assignments set due_at=${row.due_at} where id=${row.id} and student_id=${row.student_id}`;
  return observeDtmTimingRows(sql,plan);
}

export async function deleteDtmTimingRows(sql,plan){
  const initial=await readDtmTimingState(sql,plan);
  if(emptyDtmTimingState(initial))return true;
  await assertOwners(sql,plan);
  verifyPlanRows(initial,plan);
  for(const [index,row] of plan.assignments.entries()){
    const submission=plan.submissions[index],upload=plan.uploads[index];
    const removed=await sql`delete from public.dtm_assignment_submissions
      where id=${submission.id} and assignment_id=${row.id} and user_id=${submission.user_id} returning id`;
    need(removed.length===1,'exact submission and upload cleanup');
    // The metadata delete trigger enqueues the path, even though no Storage
    // object was created. Consume only the just-enqueued fixture pair.
    const queue=await sql`delete from private.dtm_submission_cleanup where object_path=${upload.object_path}
      and user_id=${upload.user_id} returning object_path`;
    need(queue.length===1,'exact synthetic queue cleanup');
    const assignment=await sql`delete from public.affairs_assignments
      where id=${row.id} and student_id=${row.student_id} and dtm_course_id=${row.dtm_course_id} returning id`;
    need(assignment.length===1,'exact assignment cleanup');
  }
  for(const course of plan.courses){
    const rows=await sql`delete from public.dtm_courses where id=${course.id} and user_id=${course.user_id}
      and code=${course.code} returning id`;
    need(rows.length===1,'exact course cleanup');
  }
  need(emptyDtmTimingState(await readDtmTimingState(sql,plan)),'cleanup readback');
  return true;
}

export async function observeDtmTimingCallers(plan,{users,origin,fetchImpl,readResponse,signal}){
  need(users.length===2&&users.every((user,index)=>user.id===plan.owners[index].id&&typeof user.token==='string'&&user.token)
    &&users[0].token!==users[1].token,'paired caller sessions');
  return Promise.all(users.map(async(user)=>{
    const observations=await Promise.all(plan.assignments.map(async(assignment,index)=>{
      const expected=plan.submissions[index],upload=plan.uploads[index];
      const url=new URL('/api/affairs-data',origin);
      url.search=new URLSearchParams({scope:'dtm-submission',assignment_id:assignment.id});
      const own=expected.user_id===user.id;
      const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
        headers:{Authorization:'Bearer '+user.token},signal});
      const body=await readResponse(response,url,65536,own?200:403);
      if(!own){
        need(body&&Object.keys(body).length===1&&typeof body.error==='string'
          &&![expected.id,upload.filename,upload.object_path,expected.submitted_at].some(value=>body.error.includes(value)),
          'crossed caller denial');
        return {status:403};
      }
      const projectedFile={id:upload.id,filename:upload.filename,sizeBytes:upload.size_bytes,contentType:upload.content_type,
        path:upload.object_path,state:'current',expiresAt:upload.expires_at,committedAt:upload.committed_at};
      need(body?.assignmentId===assignment.id&&body.userId===user.id&&body.courseId===assignment.dtm_course_id
        &&preciseUtc(body.dueAt)===assignment.due_at&&body.maxBytes===10485760
        &&equalRows([body.submission],[expected])&&isDeepStrictEqual(body.reviews,[])&&body.files?.length===1,
        'authenticated exact assignment and historical deadline');
      const file=body.files[0];
      need(isDeepStrictEqual({...file,expiresAt:preciseUtc(file.expiresAt),committedAt:preciseUtc(file.committedAt)},projectedFile),
        'authenticated current committed file');
      return {status:200,digest:digest({submission:expected,file:projectedFile,currentDeadline:assignment.due_at})};
    }));
    return {own:observations.filter(row=>row.status===200).length,crossed:observations.filter(row=>row.status===403).length,
      digest:digest(observations)};
  }));
}

export function dtmTimingPreviewCases(plan){
  const [a,b,missing]=plan.assignments.map(pathFor);
  return [
    {id:'a-edited-due',actor:'A',path:a,question,history:[],kind:'answer',
      facts:['5 minutes late.','2026-09-22 23:55:00.123456 Taipei','2026-09-23 00:00:00.123456 Taipei'],
      exclusions:['2026-09-29','was on time']},
    {id:'b-earlier-than-due',actor:'B',path:b,question:'Did I meet the deadline?',history:[],kind:'answer',
      facts:['1 second, 1 microsecond before','2026-09-24 13:00:00.123456 Taipei','2026-09-24 12:59:59.123455 Taipei'],
      exclusions:['5 minutes late','2026-09-22']},
    {id:'a-saved-date-missing',actor:'A',path:missing,question,history:[],kind:'answer',
      facts:['There is no deadline saved with this submission','2026-09-27 08:00:00.456789 Taipei'],
      exclusions:['2026-09-30','was on time','minutes late']},
    {id:'a-utc-followup',actor:'A',path:a,question:'What about in UTC?',kind:'answer',
      history:[{role:'user',content:question}],facts:['5 minutes late.','2026-09-22 15:55:00.123456 UTC','2026-09-22 16:00:00.123456 UTC'],
      exclusions:['Taipei','2026-09-29']},
    {id:'b-cross-a',actor:'B',path:a,question,history:[],kind:'denied',
      facts:['couldn’t verify the saved timing'],exclusions:['2026-09-22','5 minutes late','No committed submission']},
    {id:'guest-assignment',actor:'guest',path:a,question:'Was it late?',history:[],kind:'guest',
      facts:['Sign in to check'],exclusions:['2026-09-22','5 minutes late','No committed submission']},
  ];
}

export function dtmTimingRequest(testCase){
  return {path:testCase.actor==='guest'?'/api/research-assistant':'/api/affairs-assistant',body:JSON.stringify({
    question:testCase.question,route:testCase.path,history:testCase.history,stream:true,consentedResearchUse:false,
  })};
}

export function gradeDtmTimingCase(plan,testCase,{status,body,events=[],correlationId},before,after){
  const readSteps=[...events,...(Array.isArray(body?.activity)?body.activity:[])].filter(step=>
    typeof step?.kind==='string'&&step.kind.startsWith('account-read:dtmSubmissionTiming:'));
  const response=JSON.stringify({body,events});
  const answer=typeof body?.answer==='string'?body.answer:'';
  const marks=[...plan.uploads.flatMap(row=>[row.filename,row.object_path,row.id,row.object_id,row.object_etag]),
    ...keys(plan.submissions),...plan.owners.flatMap(row=>[row.id,row.studentId])];
  const isAnswer=testCase.kind==='answer',guest=testCase.kind==='guest';
  const desiredLink=isAnswer?testCase.path:guest?'/dtm/login?next='+encodeURIComponent(testCase.path):null;
  const observed=before&&/^[a-f0-9]{64}$/u.test(before.rows??'')&&before.callers?.length===2
    &&before.callers.every((caller,index)=>caller.own===(index===0?2:1)&&caller.crossed===(index===0?1:2)&&/^[a-f0-9]{64}$/u.test(caller.digest??''));
  const checks={http:status===200,readback:observed&&isDeepStrictEqual(before,after),result:isAnswer?body?.status==='answered':
    guest?body?.status==='handoff':body?.status==='abstained',facts:testCase.facts.every(text=>answer.includes(text)),
    irrelevantData:testCase.exclusions.every(text=>!answer.includes(text)),privateMetadata:marks.every(marker=>!response.includes(marker)),
    verification:isAnswer?body?.verification?.status==='verified'&&body.verification.attempts===1:
      guest?!body?.verification:body?.verification?.status==='unverified',
    localOnly:body?.grounding?.webSearched===false&&!body?.proposedAction,
    readActivity:isAnswer?readSteps.some(step=>step.status==='complete'):
      guest?readSteps.length===0:readSteps.length>0&&readSteps.every(step=>step.status==='unavailable'),
    correlation:guest||uuid(correlationId),
    citation:desiredLink?body?.citations?.length===1&&body.citations[0].url===desiredLink
      &&body.citations[0].chunkId===(guest?'directory:dtm-signin':'account:dtmSubmissionTiming'):body?.citations?.length===0};
  const failedFields=Object.keys(checks).filter(key=>!checks[key]);
  return {id:testCase.id,passed:failedFields.length===0,failedFields,status,bodyDigest:digest(body??null),
    verificationAttempts:Number.isInteger(body?.verification?.attempts)?body.verification.attempts:0};
}
