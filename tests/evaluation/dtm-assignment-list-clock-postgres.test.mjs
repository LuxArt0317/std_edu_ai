import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {assertDtmAssignmentListClock,bindDtmAssignmentListReadback,buildDtmAssignmentListFixture,dtmAssignmentListDispatch,
  dtmAssignmentListLiveCases,gradeDtmAssignmentListLiveCase,readDtmAssignmentListFixture} from './dtm-assignment-list-live.mjs';
import {readReply} from './run.mjs';

const runtime=process.env.STU_DTM_CLOCK_TEST_PGLITE_ENTRY;
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const migrations=['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
  '20261106010000_affairs_academic_records.sql','20261112010000_student_workspace.sql'];
const families=['dtm-assignment-list-relative-portable','dtm-assignment-list-overdue-portable'];
const now=()=>new Date().toISOString();

test('portable clock uses the real app clock and migrated PostgreSQL owner policies before and after the handler',
  {skip:!runtime},async t=>{
  assert.ok(isAbsolute(runtime),'Supply an already installed PGlite runtime.');
  const {PGlite}=await import(pathToFileURL(runtime).href);
  const db=new PGlite(),original=globalThis.fetch;
  t.after(async()=>{globalThis.fetch=original;await db.close();});
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(provider_id text,user_id uuid references auth.users on delete cascade,identity_data jsonb,provider text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated; set timezone='UTC';`);
  for(const name of migrations)await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  const users=Array.from({length:2},()=>({id:randomUUID(),studentId:randomUUID(),token:randomUUID()}));
  for(const user of users){
    const email=user.id+'@example.invalid';
    await db.query("insert into auth.users values($1,$2,now(),'{}')",[user.id,email]);
    await db.query("insert into auth.identities values($1::uuid::text,$1,jsonb_build_object('sub',$1::uuid::text,'email_verified',true),'google')",[user.id]);
    await db.query("insert into public.affairs_profiles(user_id,email,display_name) values($1,$2,'Scratch student')",[user.id,email]);
    await db.query("insert into public.affairs_students(id,user_id,student_number,full_name,program_id,year_level) select $1,$2,$3,'Scratch student',id,1 from public.affairs_programs where code='SAMPLE-GEN'",[user.studentId,user.id,user.id]);
  }
  const as=(user,statement,parameters)=>db.transaction(async sql=>{
    await sql.exec('set local role authenticated');
    await sql.query("select set_config('request.jwt.claim.sub',$1,true)",[user.id]);
    return (await sql.query(statement,parameters)).rows;
  });
  const courseFields='id,user_id,code,source_mode',assignmentFields='id,student_id,enrollment_id,dtm_course_id,source_mode,title,status,due_at,submitted_at,details';
  const unsupported=[];
  let clockReads=[];
  globalThis.fetch=async(input,init)=>{
    try{
      const url=new URL(String(input)),params=url.searchParams;
      assert.equal(url.origin,origin);
      assert.equal(init.method,'GET');
      assert.equal(init.body,undefined);
      const auth=new Headers(init.headers),user=users.find(item=>auth.get('authorization')==='Bearer '+item.token);
      assert.ok(user);
      const readback=params.get('order')==='id.asc'&&params.get('limit')==='7';
      if(url.pathname==='/rest/v1/dtm_courses'){
        assert.equal(params.get('select'),courseFields);
        if(readback){
          assert.equal(params.get('user_id'),'in.('+users.map(item=>item.id).join(',')+')');
          return Response.json(await as(user,'select '+courseFields+' from public.dtm_courses where user_id=any($1) order by id',[users.map(item=>item.id)]));
        }
        assert.equal(params.get('user_id'),'eq.'+user.id);
        return Response.json(await as(user,'select '+courseFields+' from public.dtm_courses where user_id=$1 and ($2::uuid is null or id=$2) and ($3::text is null or source_mode=$3) order by id limit 1',
          [user.id,params.get('id')?.slice(3)??null,params.get('source_mode')?.slice(3)??null]));
      }
      assert.equal(url.pathname,'/rest/v1/affairs_assignments');
      if(readback){
        assert.equal(params.get('select'),assignmentFields);
        assert.equal(params.get('student_id'),'in.('+users.map(item=>item.studentId).join(',')+')');
        return Response.json(await as(user,'select '+assignmentFields+' from public.affairs_assignments where student_id=any($1) and dtm_course_id is not null order by id',[users.map(item=>item.studentId)]));
      }
      assert.equal(auth.get('Prefer'),'count=exact');
      assert.equal(params.get('dtm_courses.user_id'),'eq.'+user.id);
      assert.equal(params.get('affairs_students.user_id'),'eq.'+user.id);
      assert.equal(params.get('enrollment_id'),'is.null');
      const bounded=params.get('and');
      const range=bounded?/^\(due_at\.gte\.([^,]+),due_at\.lt\.([^,]+)\)$/u.exec(bounded):null;
      const deadline=params.get('due_at')?.slice(3)??null;
      assert.ok(range||deadline);
      clockReads.push({range:range?.slice(1)??null,deadline});
      const rows=await as(user,`select a.id,a.dtm_course_id,a.source_mode,a.title,a.status,a.due_at,
        jsonb_build_object('id',c.id,'user_id',c.user_id,'code',c.code,'source_mode',c.source_mode) dtm_courses,
        jsonb_build_object('user_id',s.user_id) affairs_students
        from public.affairs_assignments a join public.dtm_courses c on c.id=a.dtm_course_id
        join public.affairs_students s on a.student_id=s.id
        where c.user_id=$1 and s.user_id=$1 and a.enrollment_id is null
          and ($2::uuid is null or c.id=$2) and ($3::text is null or c.source_mode=$3)
          and ($4::text is null or a.status=$4) and ($5::timestamptz is null or a.due_at >= $5) and a.due_at < $6
        order by a.due_at asc nulls last,a.id asc limit 20`,
      [user.id,params.get('dtm_course_id').startsWith('eq.')?params.get('dtm_course_id').slice(3):null,
        params.get('dtm_courses.source_mode')?.slice(3)??null,params.get('status')?.slice(3)??null,range?.[1]??null,range?.[2]??deadline]);
      return Response.json(rows,{headers:{'Content-Range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
    }catch(error){unsupported.push(error);throw error;}
  };
  const block=()=>assert.fail('Unexpected broad source or provider call.');
  const handler=createAffairsAssistantHandler({verifyToken:async token=>{
    assert.equal(token,users[0].token);
    return {url:origin,user:{id:users[0].id},key:'scratch-publishable',token};
  },loadSnapshot:block,publicResearch:block,answerAccount:block});
  for(const family of families)await t.test(family,async bench=>{
    const basis=now(),cases=dtmAssignmentListLiveCases(family,{now:basis});
    if(Date.parse(cases[0].assignmentListClock.validUntil)-Date.now()<10_000){
      bench.skip('Too close to the real Taipei midnight to finish paired reads.');
      return;
    }
    const plan=buildDtmAssignmentListFixture(users,family,{now:basis});
    for(const c of plan.courses)await db.query(`insert into public.dtm_courses(id,user_id,code,source_mode,title,term,role)
      values($1,$2,$3,$4,$3,'Moodle evaluation','student')`,[c.id,c.user_id,c.code,c.source_mode]);
    for(const a of plan.assignments)await db.query(`insert into public.affairs_assignments(${assignmentFields})
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,Object.values(a));
    const observe=()=>readDtmAssignmentListFixture(plan,users,{family,publishable:'scratch-publishable',fetchImpl:globalThis.fetch,readResponse:response=>response.json()});
    for(const item of cases)await bench.test(item.id,async()=>{
      const before=await observe();
      const started=assertDtmAssignmentListClock(item,now());
      const request={question:item.question,history:[],route:item.route,stream:true,consentedResearchUse:false};
      const headers=new Headers(),chunks=[];
      const response={statusCode:200,setHeader(name,value){headers.set(name,value);},status(value){this.statusCode=value;return this;},
        json(body){assert.fail(JSON.stringify(body));},write(chunk){chunks.push(chunk);},end(){}};
      clockReads=[];
      await handler({method:'POST',headers:{authorization:'Bearer '+users[0].token},body:request},response);
      const revision='a'.repeat(40),envelope={...await readReply(new Response(chunks.join(''),{headers})),statusCode:response.statusCode,
        execution:'live-native',sourceRevision:revision,fixtureKey:item.fixtureKey,correlationId:headers.get('x-assistant-request-id'),
        deploymentCheck:{verified:true,sourceRevision:revision,requestIndex:1},
        assignmentListDispatch:dtmAssignmentListDispatch('/api/affairs-assistant',JSON.stringify(request),true,started)};
      const after=await observe();
      assert.deepEqual(unsupported,[]);
      assert.deepEqual(before,after);
      assert.deepEqual(before.map(row=>row.count),[8,2]);
      assert.equal(clockReads.length,1);
      if(item.observation.period==='overdue')assert.equal(clockReads[0].deadline,envelope.body.grounding.checkedAt);
      envelope.fixtureReadback={verified:true,independentGolden:true,projectRef:'xiftudmvxphxcjtmfmib',
        dtmAssignmentList:bindDtmAssignmentListReadback(item,envelope,{before,after,checkedAfter:now()})};
      assert.deepEqual(gradeDtmAssignmentListLiveCase(item,envelope).failures,[],envelope.body.answer);
    });
    await db.query('delete from public.affairs_assignments where id=any($1)',[plan.assignments.map(a=>a.id)]);
    await db.query('delete from public.dtm_courses where id=any($1)',[plan.courses.map(c=>c.id)]);
    assert.equal((await db.query('select count(*) from public.dtm_courses where user_id=any($1)',[users.map(user=>user.id)])).rows[0].count,0);
    assert.equal((await db.query('select count(*) from public.affairs_assignments where student_id=any($1) and dtm_course_id is not null',[users.map(user=>user.studentId)])).rows[0].count,0);
  });
});
