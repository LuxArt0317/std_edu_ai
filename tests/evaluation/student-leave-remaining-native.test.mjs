import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {studentLeaveAssistantPlan,studentLeaveSelectedTools} from '../../server/studentLeaveAssistantPlan.js';
import {ownAffairsTimetableLimits} from '../../server/ownAffairsTimetable.js';
import {gradeCase} from './grading.mjs';
import {buildStudentLeaveFixturePlan,leaveFixtureProject,leaveFixtureTables} from './student-leave-fixture-plan.mjs';
import {leaveFixtureClock,leaveFixtureRow} from './student-leave-native-cases.mjs';
import {studentLeaveRunnerCases} from './student-leave-runner.mjs';

const prefix='account:student-leave-native-';
const cases=new Map(studentLeaveRunnerCases().map(row=>[row.id.slice(prefix.length),row]));
const scenarios=[
  {id:'taipei-today',family:'today',view:'periods',date:'starts_on.lte.2026-11-15,ends_on.gte.2026-11-15',total:1},
  {id:'count-only',family:'month-count',date:'starts_on.lte.2026-11-30,ends_on.gte.2026-11-01',total:17,count:true},
  {id:'category-status-count',family:'category-count',date:'starts_on.lte.2026-11-30,ends_on.gte.2026-11-01',
    filters:',leave_category.in.(sick),status.in.(draft)',total:3,count:true},
  {id:'companion',family:'ordinary',total:1,companion:'charges'},
  {id:'companion-reverse',family:'ordinary',total:1,companion:'courses'},
  {id:'independent',family:'ordinary',companion:'courses',onlyCompanion:true},
  {id:'read-unavailable',family:'ordinary',form:true,formFailure:true,total:1},
  {id:'review-unavailable',family:'ordinary',form:true,reviewFailure:true,total:1},
];

const origin='https://stdedu-1234abcde-v1-d286.vercel.app';
const supabase='https://'+leaveFixtureProject+'.supabase.co';
const {forms,reviews}=leaveFixtureTables;
const ownerToken='OFFLINE_LEAVE_ONLY';
const owner=(runId,email)=>({id:randomUUID(),email,runMarker:runId});
const callers=(runId)=>({A:owner(runId,'evaluation.student@example.invalid'),B:owner(runId,'evaluation.other.'+runId+'@example.invalid')});

test('the eight original Leave gaps grade through the real handler and owner-scoped readers',async t=>{
  t.mock.timers.enable({apis:['Date'],now:leaveFixtureClock});
  const runId=randomUUID(),owners=callers(runId),studentId=randomUUID(),chargeId=randomUUID();
  const binding={origin,projectRef:leaveFixtureProject,sourceRevision:'2'.repeat(40),suiteHash:'3'.repeat(64),runId,owners};
  const student={id:studentId,user_id:owners.A.id};
  const courseId=randomUUID(),termId=randomUUID(),sectionId=randomUUID(),enrollmentId=randomUUID();
  const enrollment={id:enrollmentId,student_id:studentId,section_id:sectionId,status:'enrolled',source_mode:'sample',
    student,section:{id:sectionId,course_id:courseId,term_id:termId,weekday:7,starts_at:'08:10:00',ends_at:'09:10:00',room:'Local room',
      course:{id:courseId,code:'LEAVE701',title:'Leave evaluation next class'},
      term:{id:termId,label:'115/1',starts_on:'2026-09-01',ends_on:'2027-01-15'}}};
  const charge={id:chargeId,student_id:studentId,label:'Leave evaluation tuition',amount_due:'24000.00',amount_paid:'1000.00',
    currency:'TWD',due_on:null,occurrence_on:null,category:'tuition',contact_unit:null,contact_extension:null,payment_unit:null,source_mode:'sample'};
  const handler=createAffairsAssistantHandler({
    verifyToken:async token=>{
      assert.equal(token,ownerToken);
      return {url:supabase,key:'OFFLINE_PUBLIC',token,user:{id:owners.A.id,email:owners.A.email,user_metadata:{assistant_evaluation_run:runId}}};
    },
    loadSnapshot:async()=>assert.fail('No general workspace is needed for these Leave questions.'),
    publicResearch:async()=>assert.fail('Private Leave prompts must not dispatch public research.'),
  });
  let scenario,plan,attempted,rejected,failFirstForms,failCourse;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    try{
      const url=new URL(input);
      assert.equal(url.origin,supabase);
      assert.equal(init.method,'GET');
      assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+ownerToken);
      const query=Object.fromEntries(url.searchParams),table=url.pathname.split('/').at(-1);
      attempted.push(table);
      if(table==='affairs_students'){
        assert.equal(query.user_id,'eq.'+owners.A.id);
        assert.deepEqual(query,{select:'id,user_id',user_id:'eq.'+owners.A.id,limit:scenario.companion==='charges'?'1':'2'});
        return Response.json([student]);
      }
      if(table==='affairs_enrollments'){
        assert.equal(scenario.companion,'courses');
        assert.equal(query.student_id,'eq.'+studentId);
        assert.equal(query.status,'eq.enrolled');
        assert.equal(Number(query.limit),ownAffairsTimetableLimits.pageRows);
        assert.equal(query.offset,'0');
        if(failCourse)return new Response(null,{status:503});
        return Response.json([enrollment],{headers:{'content-range':'0-0/1'}});
      }
      if(table==='affairs_charges'){
        assert.equal(scenario.companion,'charges');
        assert.equal(query.student_id,'eq.'+studentId);
        assert.equal(query.offset,'0');
        return Response.json([charge]);
      }
      const primary=plan.rows[forms].find(row=>row.id===plan.rowsByHandle.A.primary);
      if(table===reviews){
        assert.equal(scenario.reviewFailure,true);
        assert.deepEqual(query,{select:'id,user_id,request_type,status',user_id:'eq.'+owners.A.id,request_type:'eq.general',
          id:'in.('+primary.review_request_id+')',limit:'1',order:'id.asc'});
        return new Response(null,{status:503});
      }
      assert.equal(table,forms);
      assert.equal(scenario.onlyCompanion,undefined);
      assert.equal(new Headers(init.headers).get('prefer'),'count=exact');
      const fields=['id','user_id','service_key','record_type','starts_on','ends_on',
        ...(scenario.filters?['status','leave_category']:[]),...(scenario.view==='periods'?['periods']:[]),
        ...(scenario.reviewFailure?['review_request_id']:[])];
      assert.deepEqual(query,{select:fields.join(','),user_id:'eq.'+owners.A.id,service_key:'eq.leave',record_type:'eq.leave',
        ...(scenario.form?{id:'eq.'+primary.id}:{}),...(scenario.date?{and:'('+scenario.date+(scenario.filters??'')+')'}:{}),
        order:'starts_on.desc,id.asc',limit:scenario.form||scenario.count?'1':'80'});
      if(scenario.formFailure||failFirstForms&&attempted.filter(item=>item===forms).length===1)
        return new Response(null,{status:503});
      const own=plan.rows[forms].filter(row=>row.user_id===owners.A.id);
      const matching=(scenario.family==='month-count'?own.filter(row=>row.starts_on.startsWith('2026-11'))
        :scenario.family==='category-count'?own.filter(row=>row.starts_on.startsWith('2026-11')&&row.status==='draft'&&row.leave_category==='sick')
          :[primary]).sort((a,b)=>b.starts_on.localeCompare(a.starts_on)||a.id.localeCompare(b.id));
      assert.equal(matching.length,scenario.total);
      const rows=(scenario.count?matching.slice(0,1):matching).map(row=>Object.fromEntries(fields.map(field=>[field,row[field]])));
      return Response.json(rows,{status:rows.length===matching.length?200:206,headers:{'content-range':'0-'+(rows.length-1)+'/'+matching.length}});
    }catch(error){rejected.push(error);throw error;}
  });

  async function request(source,{firstFormFails=false,courseFails=false,question}={}){
    scenario=source;attempted=[];rejected=[];failFirstForms=firstFormFails;failCourse=courseFails;
    plan=buildStudentLeaveFixturePlan({binding,family:source.family});
    const frozen=structuredClone(cases.get(source.id));
    // Only translate the frozen fixture's exact record ID. Keep its question,
    // expected dates/counts, source bindings and other rubric fields intact.
    const bound=JSON.parse(JSON.stringify(frozen).replaceAll(leaveFixtureRow,plan.rowsByHandle.A.primary));
    const result={},headers=new Headers();
    const response={setHeader(name,value){headers.set(name,value);},status(code){result.status=code;return this;},json(body){result.body=body;}};
    const body={question:question??bound.question,route:bound.route,history:bound.history,stream:false,consentedResearchUse:false};
    await handler({method:'POST',headers:{authorization:'Bearer '+ownerToken,host:new URL(origin).host},body},response);
    assert.deepEqual(rejected,[]);
    assert.equal(result.status,200);
    assert.doesNotMatch(JSON.stringify(result.body),/OFFLINE|FOREIGN PRIVATE SENTINEL|STUDENT_PRIVATE_REASON|000-000-0000|evaluation\.student@/u);
    assert.equal(result.body.grounding.webSearched,false);
    assert.equal(result.body.proposedAction,undefined);
    const grade=gradeCase(bound,{statusCode:result.status,execution:'deterministic',fixtureKey:bound.fixtureKey,body:result.body});
    return {grade,body:result.body,reads:[...attempted]};
  }
  for(const row of scenarios){
    const {grade,body,reads}=await request(row);
    assert.deepEqual(grade.failures,[],row.id+': '+JSON.stringify(body));
    const wanted=row.formFailure?[forms,forms]:row.reviewFailure?[forms,reviews]:[
      ...(row.companion?['affairs_students',row.companion==='charges'?'affairs_charges':'affairs_enrollments']:[]),
      ...(row.onlyCompanion?[]:[forms]),
    ];
    assert.deepEqual(reads.slice().sort(),wanted.sort(),row.id);
    if(row.count)assert.deepEqual(body.views,[]);
    if(row.id==='companion-reverse')assert.ok(body.answer.indexOf('Next class:')<body.answer.indexOf('2026-11-09'));
    if(row.formFailure)assert.equal(body.verification.status,'unverified');
    if(row.reviewFailure){
      assert.equal(body.grounding.degraded,true);
      assert.doesNotMatch(body.answer,/\bresolved\b/u);
      assert.ok(body.activity.some(step=>step.kind==='student-leave-verified-fragment'));
      assert.ok(!body.activity.some(step=>step.kind==='student-leave-evidence-check'));
    }
  }
  const corrected=await request(scenarios.find(row=>row.id==='count-only'),{firstFormFails:true});
  assert.deepEqual(corrected.grade.failures,[]);
  assert.deepEqual(corrected.reads,[forms,forms]);
  assert.deepEqual(corrected.body.verification,{status:'verified',attempts:2});

  const incomplete=await request(scenarios.find(row=>row.id==='companion-reverse'),{courseFails:true});
  assert.match(incomplete.body.answer,/couldn’t verify your next class/u);
  assert.doesNotMatch(incomplete.body.answer,/Leave evaluation next class/u);
  assert.deepEqual(incomplete.body.citations.map(row=>row.chunkId),['account:leaveRecords']);
  assert.equal(incomplete.body.grounding.degraded,true);
});

test('exact Leave verification keeps third clauses, foreign targets and lookalike paths outside the native pairing',()=>{
  const base='/school-affairs/services/leave/history';
  for(const question of [
    'Show my leave dates and my tuition balance. Show course grades.',
    'Show my leave dates and my tuition balance and my next class.',
    'Show my leave dates and my roommate’s next class.',
  ])assert.notEqual(studentLeaveAssistantPlan(question,base,[])?.deterministicCompanion,true,question);
  assert.equal(studentLeaveAssistantPlan('Show my next class',base+'?user_id='+randomUUID(),[]),null);
  assert.equal(studentLeaveAssistantPlan('Show my next class',base+'-unrelated',[]),null);
  assert.deepEqual(studentLeaveSelectedTools(studentLeaveAssistantPlan('Show my next class',base,[])),['courses']);
});

const runtime=process.env.STU_LEAVE_COUNT_TEST_PGLITE_ENTRY;
test('migrated Leave counts keep crossed owners out and both frozen replies leave state unchanged',
  {skip:!runtime,timeout:30000},async t=>{
  assert.ok(isAbsolute(runtime));
  const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated; set timezone='UTC';`);
  for(const name of ['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
    '20261106010000_affairs_academic_records.sql','20261112010000_student_workspace.sql','20261112020000_leave_application_fields.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  t.mock.timers.enable({apis:['Date'],now:leaveFixtureClock});
  const runId=randomUUID(),owners=callers(runId);
  const binding={origin,projectRef:leaveFixtureProject,sourceRevision:'2'.repeat(40),suiteHash:'3'.repeat(64),runId,owners};
  for(const owner of Object.values(owners)){
    await db.query("insert into auth.users values($1,$2,now(),'{}')",[owner.id,owner.email]);
    await db.query("insert into auth.identities values($1,'google')",[owner.id]);
    await db.query("insert into public.affairs_profiles(user_id,email,display_name) values($1,$2,'Synthetic learner')",[owner.id,owner.email]);
  }
  const handler=createAffairsAssistantHandler({
    verifyToken:async token=>{
      assert.equal(token,ownerToken);
      return {url:supabase,key:'OFFLINE_PUBLIC',token,user:{id:owners.A.id,email:owners.A.email}};
    },
    loadSnapshot:async()=>assert.fail('Unexpected broad account read.'),
    publicResearch:async()=>assert.fail('Unexpected public lookup.'),
  });
  const roleRead=(caller,target,filter,selected)=>db.transaction(async tx=>{
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[caller]);
    const projection=selected.replace(/\b(starts_on|ends_on)\b/gu,'$1::text as $1');
    return (await tx.query(`select ${projection},count(*) over ()::int as visible from public.affairs_service_records
      where user_id=$1 and service_key='leave' and record_type='leave' and starts_on <= '2026-11-30' and ends_on >= '2026-11-01'
      ${filter?"and leave_category='sick' and status='draft'":''} order by starts_on desc,id limit 1`,[target])).rows;
  });
  const rejected=[];
  let scenario,reads=0;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    try{
      const url=new URL(input);
      assert.equal(url.origin,supabase);
      assert.equal(url.pathname,'/rest/v1/'+forms);
      assert.equal(init.method,'GET');
      assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+ownerToken);
      assert.equal(new Headers(init.headers).get('prefer'),'count=exact');
      assert.equal(url.searchParams.get('limit'),'1');
      assert.equal(url.searchParams.get('and'),'('+scenario.date+(scenario.filters??'')+')');
      assert.equal(url.searchParams.get('user_id'),'eq.'+owners.A.id);
      const selected='id,user_id,service_key,record_type,starts_on,ends_on'+(scenario.filters?',status,leave_category':'');
      assert.equal(url.searchParams.get('select'),selected);
      const [row]=await roleRead(owners.A.id,owners.A.id,Boolean(scenario.filters),selected);
      assert.ok(row);
      const {visible,...raw}=row;
      assert.equal(visible,scenario.total);
      reads++;
      return Response.json([raw],
        {status:206,headers:{'content-range':'0-0/'+visible}});
    }catch(error){rejected.push(error);throw error;}
  });
  const fingerprint=async()=>(await db.query(`select
    (select jsonb_agg(to_jsonb(r) order by id) from public.affairs_service_records r) as forms,
    (select jsonb_agg(to_jsonb(r) order by id) from public.affairs_service_requests r) as reviews,
    (select count(*)::int from public.affairs_agent_audit) as audit`)).rows[0];
  for(const row of scenarios.filter(row=>row.count)){
    scenario=row;
    const plan=buildStudentLeaveFixturePlan({binding,family:row.family});
    for(const table of [reviews,forms])await db.query(`insert into public.${table}
      select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,[JSON.stringify(plan.rows[table])]);
    assert.deepEqual(await roleRead(owners.B.id,owners.A.id,Boolean(row.filters),'id'),[]);
    assert.deepEqual(await roleRead(owners.A.id,owners.B.id,false,'id'),[]);
    assert.equal((await roleRead(owners.B.id,owners.B.id,false,'id'))[0].visible,1);
    const before=await fingerprint(),frozen=cases.get(row.id);
    const result={},response={setHeader(){},status(code){result.status=code;return this;},json(body){result.body=body;}};
    await handler({method:'POST',headers:{authorization:'Bearer '+ownerToken,host:new URL(origin).host},
      body:{question:frozen.question,route:frozen.route,history:frozen.history}},response);
    assert.deepEqual(rejected,[]);
    assert.deepEqual(gradeCase(frozen,{statusCode:result.status,execution:'deterministic',fixtureKey:frozen.fixtureKey,body:result.body}).failures,[]);
    assert.deepEqual(await fingerprint(),before);
    for(const table of [forms,reviews])await db.query(`delete from public.${table} where user_id in ($1,$2)`,[owners.A.id,owners.B.id]);
    assert.deepEqual(await fingerprint(),{forms:null,reviews:null,audit:0});
  }
  assert.equal(reads,2);
});
