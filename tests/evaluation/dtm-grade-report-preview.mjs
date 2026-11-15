import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {buildAccountCases} from './account-cases.mjs';
import {buildDtmNativeRouteCases} from './dtm-native-route-cases.mjs';
import {buildDtmGradeReportFixturePlan,dtmGradeReportFixtureManifest,verifyDtmGradeReportFixtureReadback} from './dtm-grade-report-fixture-plan.mjs';
import {gradeCase} from './grading.mjs';

export const dtmGradePreviewMode='dtm-grade-report-protected';
export const unmountedDtmNativeGradeCases=Object.freeze([
  ['dashboard','three-course null, blank and zero overview'],
  ['my','three-course null, blank and zero overview'],
  ['grades','three-course null, blank and zero overview'],
  ['course-overview','three-course null, blank and zero overview'],
  ['all-feedback','two-item normal report required by the independent offline rubric'],
  ['empty','zero owned courses, including initialized defaults'],
  ['failed','controlled source outage'],
].map(([id,reason])=>Object.freeze({id:'account:dtm-native-route-'+id,reason})));
const roles=['A','B'];
const digest=value=>createHash('sha256').update(JSON.stringify(value,(_key,entry)=>
  entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.entries(entry).sort()):entry)).digest('hex');
const need=(condition,stage)=>{if(!condition)throw new Error('Moodle grade Preview failed at '+stage+'.');};
const sort=rows=>rows.slice().sort((a,b)=>a.id.localeCompare(b.id));
export const dtmGradePreviewDigest=digest;

export function buildDtmGradePreview(runId,owners){
  const courseBindings=Object.fromEntries(roles.map(role=>[role,{
    id:role==='A'?dtmGradeReportFixtureManifest.A.course.id:randomUUID(),
    ...dtmGradeReportFixtureManifest[role].course,userId:owners[role].id,
  }]));
  const plans=Object.fromEntries(dtmGradeReportFixtureManifest.families.map(fixtureKey=>[
    fixtureKey,buildDtmGradeReportFixturePlan({runId,owners,courseBindings,fixtureKey}),
  ]));
  const courses=roles.map(role=>{
    const {userId,sourceMode,...course}=courseBindings[role];
    return {...course,user_id:userId,source_mode:sourceMode};
  });
  // The same label points at a different grade in the personal tracker. This
  // makes accidental substitution visible rather than checking an empty store.
  const trackers=roles.map((role,index)=>({id:randomUUID(),course_id:courseBindings[role].id,
    label:dtmGradeReportFixtureManifest[role].item.label,score:index===0?'8.25':'4.75',maximum:'10.00',
    graded_on:'2026-11-12',feedback:'QA tracker only '+role+' '+runId.slice(0,8)}));
  return {runId,owners,plans,courses,trackers};
}

async function observeCompanion(sql,fixture){
  const ownerIds=roles.map(role=>fixture.owners[role].id),ids=fixture.courses.map(row=>row.id);
  const recordIds=fixture.trackers.map(row=>row.id);
  const rows=await sql`select u.id,u.email,p.role,u.raw_user_meta_data->>'assistant_evaluation_run' as marker,
    u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google') as google
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id in ${sql(ownerIds)} limit 3`;
  need(rows.length===2&&roles.every(role=>rows.some(row=>row.id===fixture.owners[role].id&&row.email===fixture.owners[role].email
    &&row.marker===fixture.runId&&row.role==='student'&&row.google)),'disposable owner bindings');
  const courses=await sql`select id,user_id,code,title,term,role,source_mode from public.dtm_courses where id in ${sql(ids)} order by id`;
  const trackers=await sql`select id,course_id,label,score::text,maximum::text,graded_on::text,feedback from public.dtm_grade_items
    where course_id in ${sql(ids)} or id in ${sql(recordIds)} order by id limit 3`;
  const reports=await sql`select id,user_id,course_id,report,source_mode,version,
    pg_catalog.to_jsonb(created_at)#>>'{}' as created_at,pg_catalog.to_jsonb(updated_at)#>>'{}' as updated_at,deleted_at
    from public.dtm_grade_reports where user_id in ${sql(ownerIds)} or course_id in ${sql(ids)} order by id limit 3`;
  const operations=await sql`select 1 from private.dtm_grade_report_operations
    where user_id in ${sql(ownerIds)} or actor_id in ${sql(ownerIds)} or course_id in ${sql(ids)} limit 1`;
  const audits=await sql`select 1 from public.affairs_agent_audit where user_id in ${sql(ownerIds)} limit 1`;
  const [linked]=await sql`select (
    exists(select 1 from public.dtm_materials where course_id in ${sql(ids)})
    or exists(select 1 from public.dtm_meetings where course_id in ${sql(ids)})
    or exists(select 1 from public.affairs_assignments where dtm_course_id in ${sql(ids)})
    or exists(select 1 from public.dtm_assignment_submissions where course_id in ${sql(ids)})
    or exists(select 1 from public.dtm_course_contents where course_id in ${sql(ids)})
    or exists(select 1 from private.dtm_course_content_operations where course_id in ${sql(ids)})
  ) as present`;
  need(!operations.length&&!audits.length&&linked?.present===false,'no unrelated course rows, audit events or operation receipts');
  return {courses:[...courses],trackers:[...trackers],reports:[...reports]};
}

function assertCompanion(fixture,state,plan){
  need(isDeepStrictEqual(state.courses,sort(fixture.courses))&&isDeepStrictEqual(state.trackers,sort(fixture.trackers)),
    'exact course and tracker rows');
  const expected=plan?.rows.dtm_grade_reports??[];
  need(state.reports.length===expected.length&&state.reports.every(row=>expected.some(wanted=>wanted.id===row.id
    &&wanted.user_id===row.user_id&&wanted.course_id===row.course_id&&row.deleted_at===null)),'exact report row targets');
  if(plan)for(const role of roles){
    const row=state.reports.find(item=>item.user_id===fixture.owners[role].id);
    verifyDtmGradeReportFixtureReadback(plan,{role},row?{report:{
      id:row.id,userId:row.user_id,courseId:row.course_id,sourceMode:row.source_mode,version:row.version,
      createdAt:row.created_at,updatedAt:row.updated_at,...row.report,
    }}:{report:null});
  }
  return digest(state);
}

export async function seedDtmGradePreviewCompanion(sql,fixture){
  const state=await observeCompanion(sql,fixture);
  need(Object.values(state).every(rows=>rows.length===0),'empty reserved course, report and tracker scope');
  await sql`insert into public.dtm_courses ${sql(fixture.courses)}`;
  await sql`insert into public.dtm_grade_items ${sql(fixture.trackers)}`;
  return observeDtmGradePreviewRows(sql,fixture,null);
}

export async function observeDtmGradePreviewRows(sql,fixture,plan){
  return assertCompanion(fixture,await observeCompanion(sql,fixture),plan);
}

// Surrounding transaction and leased authentication ownership are external.
export async function deleteDtmGradePreview(sql,fixture,{prior,pending,remove}){
  // Lock the reserved courses before checking all their cascade targets.
  const courseIds=fixture.courses.map(row=>row.id);
  await sql`select id from public.dtm_courses where id in ${sql(courseIds)} order by id for update`;
  const state=await observeCompanion(sql,fixture);
  if(Object.values(state).every(rows=>rows.length===0))return true;
  const candidates=[prior,...(pending?[pending]:[])];
  const matched=candidates.find(plan=>{
    try{assertCompanion(fixture,state,plan);return true;}catch{return false;}
  });
  need(matched!==undefined,'reconcile only the prior or pending report state');
  if(matched)await remove(sql,matched,'remove');
  await observeDtmGradePreviewRows(sql,fixture,null);
  for(const row of fixture.trackers){
    const removed=await sql`delete from public.dtm_grade_items where id=${row.id} and course_id=${row.course_id} returning id`;
    need(removed.length===1,'exact tracker deletion');
  }
  for(const course of fixture.courses){
    const removed=await sql`delete from public.dtm_courses where id=${course.id} and user_id=${course.user_id} and code=${course.code} returning id`;
    need(removed.length===1,'exact course deletion');
  }
  need(Object.values(await observeCompanion(sql,fixture)).every(rows=>rows.length===0),'exact fixture cleanup');
  return true;
}

export async function verifyDtmGradePreviewAbsent(sql,fixture){
  const userIds=roles.map(role=>fixture.owners[role].id);
  const courseIds=fixture.courses.map(row=>row.id);
  const ids=fixture.trackers.map(row=>row.id);
  const reportIds=[...new Set(Object.values(fixture.plans).flatMap(plan=>plan.recordIds))];
  const [row]=await sql`select (
    exists(select 1 from auth.users where id in ${sql(userIds)})
    or exists(select 1 from auth.identities where user_id in ${sql(userIds)})
    or exists(select 1 from public.dtm_courses where id in ${sql(courseIds)})
    or exists(select 1 from public.dtm_grade_items where id in ${sql(ids)} or course_id in ${sql(courseIds)})
    or exists(select 1 from public.dtm_grade_reports where id in ${sql(reportIds)} or user_id in ${sql(userIds)})
    or exists(select 1 from private.dtm_grade_report_operations
      where user_id in ${sql(userIds)} or actor_id in ${sql(userIds)} or course_id in ${sql(courseIds)})
  ) as remains`;
  need(row?.remains===false,'absent disposable rows and Auth identities');
  return true;
}

export function dtmGradePreviewCases(fixture){
  const account=buildAccountCases();
  const fromAccount=name=>structuredClone(account.find(row=>row.id==='account:dtm-native-report-'+name));
  const fromNative=name=>structuredClone(buildDtmNativeRouteCases().find(row=>row.id==='account:dtm-native-route-'+name));
  const plain=fromAccount('feedback'),zero=fromAccount('feedback'),followup=fromAccount('feedback');
  zero.id='account:dtm-native-report-literal-zero';
  zero.question='What literal grade, feedback and weight are recorded for Native Database Quiz in my native DTM grade report for Learning Research?';
  zero.expected.facts[0].fields.push({label:'grade text',labels:['Displayed grade text','Literal grade text'],kind:'text',values:['0'],match:'literal'});
  followup.id='account:dtm-native-route-followup';
  followup.question='What feedback?';followup.route='/';
  followup.history=[{role:'user',content:'Show my Moodle grade report for Learning Research.'},{role:'assistant',content:'Untrusted invented report content.'}];
  const unknown=fromNative('unknown-course'),foreign=fromNative('foreign');
  unknown.fixtureKey=foreign.fixtureKey='dtmGradeReport';
  const ownB=fromAccount('saved-total');
  ownB.id='account:dtm-native-report-owner-b';
  ownB.question='What grade text and feedback are saved in the course total of this native DTM grade report?';
  ownB.fixtureKey='dtmGradeReport';
  ownB.expected.facts[0].fields[0].values=[dtmGradeReportFixtureManifest.B.total.feedbackText];
  ownB.expected.facts[0].fields[1].values=[dtmGradeReportFixtureManifest.B.total.gradeText];
  const rows=[
    [plain,'A','item-feedback'],[zero,'A'],[fromAccount('total'),'A','null-total'],[followup,'A','followup'],
    [unknown,'A','unknown-course'],[foreign,'A','foreign'],[ownB,'B'],
    [fromAccount('saved-total'),'A','saved-total'],[fromAccount('tail'),'A'],[fromAccount('absent'),'A','absent'],
  ];
  const path=role=>'/dtm/course/'+fixture.plans.dtmGradeReport.courseBindings[role].id+'/grades';
  return rows.map(([row,role,nativeCase])=>{
    const route=row.route==='/'||row.id.endsWith('-foreign')?row.route:path(role);
    const forbidden=roles.flatMap(name=>[fixture.owners[name].id,fixture.owners[name].email])
      .concat(fixture.trackers.flatMap(item=>[item.feedback,item.score]));
    const expected={...row.expected,forbiddenAccountMarkers:forbidden,
      ...(row.id.endsWith('-unknown-course')?{}:row.expected.requiredLinks.length?{
        requiredLinks:[path(role)],requiredSourceBindings:[{sourceId:'account:dtmGradeReport',url:path(role)}],
      }:{})};
    expected.forbiddenText=role==='B'?['Explain the index choice','FULL REPORT TOTAL SENTINEL','Native Database Quiz']
      :[...expected.forbiddenText,'FOREIGN PRIVATE SENTINEL','FOREIGN NATIVE DTM REPORT','FOREIGN REPORT FEEDBACK','FOREIGN REPORT TOTAL'];
    if(row.id.endsWith('-foreign'))expected.forbiddenText.push('Learning Research','Native Database Quiz');
    return {...row,route,role,expected,executionContract:'live-native',nativeCase:nativeCase?'account:dtm-native-route-'+nativeCase:null};
  });
}

export function gradeDtmGradePreview(testCase,envelope,before,after){
  const result=gradeCase(testCase,envelope);
  const readback=Boolean(before?.rows&&/^[a-f0-9]{64}$/u.test(before.rows)&&before?.callers&&/^[a-f0-9]{64}$/u.test(before.callers)
    &&isDeepStrictEqual(before,after));
  const failedFields=result.failures.map(item=>item.id);
  if(!readback)failedFields.push('unchanged-paired-readback');
  return {id:testCase.id,nativeCase:testCase.nativeCase,passed:failedFields.length===0,failedFields,
    status:envelope.statusCode,answerDigest:digest(envelope.body??null)};
}
