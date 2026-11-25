import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import postgres from 'postgres';
import {buildInternshipFixturePlan,createInternshipFixture,internshipFixtureMode,observeInternshipCallerRows} from './internship-native-fixture.mjs';
import {internshipHostedCases,internshipPublishedTimetableCase,internshipPublishedTimetableCaseIds} from './internship-native-hosted.mjs';
import {prepare,readPublishedSampleInitializerRows,runInternshipPreview} from './live-fixtures.mjs';
import {buildInternshipChargeFixture,cleanupInternshipCharges,observeInternshipChargeCallers,observeInternshipChargeRows,
  stageInternshipCharges,verifyInternshipChargesAbsent} from './internship-charge-fixture.mjs';
import {buildInternshipTimetableFixture,cleanupInternshipTimetable,observeInternshipTimetableCallers,observeInternshipTimetableRows,
  readInternshipNextMeeting,stageInternshipTimetable,verifyInternshipTimetableAbsent} from './internship-timetable-fixture.mjs';

const binding={runId:'53020000-0000-4000-8000-000000000110',owners:{A:'53020000-0000-4000-8000-000000000111',B:'53020000-0000-4000-8000-000000000112'}};
const origin='https://stdedu-abcdef012-v1-d286.vercel.app',sourceRevision='a'.repeat(40);
const {A,B}=binding.owners;
const protectedOwner='53020000-0000-4000-8000-000000000113';
const socket=process.env.STU_INTERNSHIP_TEST_PG_SOCKET;

test('the isolated packet binds distinct owners and keeps three scoped empty states separate',()=>{
  const cases=internshipHostedCases();
  assert.equal(cases.length,26);
  assert.equal(cases.filter(row=>row.auth!=='anonymous').length,25);
  assert.equal(cases.filter(row=>row.observationExpectation.read).length,19);
  assert.throws(()=>internshipHostedCases(['account:internship-native-reader-failed']),/Invalid protected/u);
  assert.throws(()=>internshipHostedCases(['account:internship-native-next-class']),/Invalid protected/u);
  assert.equal(cases.filter(row=>row.observationExpectation.companion==='charges').length,2);
  assert.equal(internshipPublishedTimetableCaseIds.length,2);
  assert.throws(()=>internshipHostedCases(internshipPublishedTimetableCaseIds),/Invalid protected/u);
  assert.throws(()=>buildInternshipFixturePlan({...binding,owners:{A,B:A}}),/binding/u);
  for(const kind of ['normal','contract','self_assessment','company']){
    const plan=buildInternshipFixturePlan(binding,kind);
    const own=plan.records.filter(row=>row.user_id===A),control=plan.records.filter(row=>row.user_id===B);
    assert.equal(control.length,3);
    assert.ok(plan.records.every(row=>row.id!==A&&row.id!==B&&row.service_key==='internship'));
    assert.ok(own.every(row=>row.record_type!==kind));
    for(const row of own.filter(row=>row.review_request_id))
      assert.ok(plan.requests.some(request=>request.id===row.review_request_id&&request.user_id===A));
  }
});

test('the isolated adapter fails closed before credentials or fixture operations',async()=>{
  await assert.rejects(runInternshipPreview({origin:'https://stu.best',sourceRevision}),{code:'fixture-config'});
  await assert.rejects(runInternshipPreview({origin,sourceRevision:'branch'}),{code:'fixture-config'});
  await assert.rejects(runInternshipPreview({origin,sourceRevision,publishedTimetable:true,caseIds:['account:internship-native-fees']}),{code:'fixture-config'});
  for(const invalid of [{origin:'https://stu.best'}, {previewReadbackFetch:undefined},{applicationFetch:async()=>{}},
    {cases:internshipHostedCases().slice(0,1)}]){
    await assert.rejects(prepare({runId:binding.runId,cases:[],now:new Date().toISOString(),origin,approvedPreviewOrigin:origin,
      expectedReleaseRevision:sourceRevision,fixtureMode:internshipFixtureMode,previewReadbackFetch:async()=>assert.fail('Network forbidden'),...invalid}),
    {code:'fixture-config'});
  }
});

test('crossed account and malformed count responses cannot establish fixture evidence',async()=>{
  const plan=buildInternshipFixturePlan(binding),calls=[];
  const callers=[{id:A,token:'synthetic-A'},{id:B,token:'synthetic-B'}];
  const options={callers,publishableKey:'SYNTHETIC_PUBLIC',readResponse:response=>response.json(),
    fetchImpl:async(url,options)=>{
      assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
      assert.equal(url.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
      const caller=callers.find(item=>'Bearer '+item.token===options.headers.Authorization);
      const target=url.searchParams.get('user_id').slice(3);
      const kind=url.pathname.endsWith('records')?'records':'requests',fields=url.searchParams.get('select').split(',');
      calls.push({caller:caller.id,target,kind});
      const rows=caller.id===target?plan[kind].filter(row=>row.user_id===target)
        .map(row=>Object.fromEntries(fields.map(field=>[field,row[field]]))):[];
      return Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
    }};
  const proof=await observeInternshipCallerRows(plan,options);
  assert.equal(proof.checks,8);assert.match(proof.digest,/^[a-f0-9]{64}$/u);
  assert.equal(calls.filter(call=>call.caller!==call.target).length,4);
  await assert.rejects(observeInternshipCallerRows(plan,{...options,fetchImpl:async(url,request)=>{
    const response=await options.fetchImpl(url,request);
    return new Response(response.body,{headers:{'content-range':'0-0/99'}});
  }}),/own or crossed RLS read/u);
});

test('scratch migrations enforce exact own/crossed Internship rows, journal recovery and cleanup', {skip:!socket,timeout:30000},async t=>{
  assert.match(socket,/^\/private\/var\/tmp\/stu100-intern-pg\.[A-Za-z0-9]{6}\/socket$/u);
  const dir=await lstat(socket);
  assert.equal(dir.uid,process.getuid());assert.equal(dir.mode&0o777,0o700);
  assert.equal(await realpath(socket),socket);
  assert.ok((await lstat(join(socket,'.s.PGSQL.5432'))).isSocket());
  const connect=database=>postgres({host:socket,user:'postgres',database,max:1,ssl:false,connect_timeout:3,
    onnotice:()=>{},connection:{application_name:'stu-internship-local-test',statement_timeout:4500}});
  const admin=connect('postgres'),database='internship_'+randomUUID().replaceAll('-','');
  await admin.unsafe('create database '+database);
  const client=connect(database),reader=connect(database),sql=await client.reserve();
  t.after(async()=>{
    await sql.release();
    await Promise.all([client.end(),reader.end()]);
    await admin.unsafe('drop database '+database);
    await admin.end();
  });
  await sql.unsafe(`do $$begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end$$;
    create schema auth;create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(provider_id text,user_id uuid references auth.users on delete cascade,identity_data jsonb,provider text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated;`);
  for(const name of ['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
    '20261106010000_affairs_academic_records.sql','20261112010000_student_workspace.sql','20261112020000_leave_application_fields.sql',
    '20261112080000_pending_fees.sql'])
    await sql.unsafe(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  for(const id of [A,B,protectedOwner]){
    const email=id+'@example.invalid';
    await sql`insert into auth.users values(${id},${email},now(),${sql.json({assistant_evaluation_run:binding.runId})})`;
    await sql`insert into auth.identities values(${id},${id},${sql.json({sub:id,email,email_verified:true})},'google')`;
    await sql`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${id},${email},'Local fixture',${id===protectedOwner?'admin':'student'})`;
  }
  const [control]=await sql`insert into public.affairs_service_records(user_id,service_key,record_type,title)
    values(${protectedOwner},'internship','contract','Protected local row') returning id`;
  const journals=[];
  let uncertain=false;
  const fixture=createInternshipFixture({sql,binding,assertLease:async()=>{},
    persist:async journal=>journals.push(journal),transaction:async work=>{
      await sql.unsafe('begin');
      try{await work();await sql.unsafe('commit');}
      catch(error){await sql.unsafe('rollback');throw error;}
      if(uncertain)throw Error('Synthetic commit acknowledgement lost');
    }});
  await fixture.transition('normal');
  const original=await fixture.observe();
  const callerOptions={callers:[{id:A,token:'synthetic-A'},{id:B,token:'synthetic-B'}],publishableKey:'synthetic-key',
    readResponse:response=>response.json(),fetchImpl:async(url,init)=>{
      const caller=init.headers.Authorization==='Bearer synthetic-A'?A:B;
      const subject=url.searchParams.get('user_id').slice(3);
      const table=url.pathname.endsWith('records')?'affairs_service_records':'affairs_service_requests';
      const fields=url.searchParams.get('select').split(',');
      const rows=await reader.begin(async tx=>{
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${caller},true)`;
        if(table==='affairs_service_records')return tx`select ${tx(fields)} from public.affairs_service_records
          where user_id=${subject} and service_key='internship' order by id`;
        return tx`select ${tx(fields)} from public.affairs_service_requests where user_id=${subject} order by id`;
      });
      const values=rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>
        [key,(key==='starts_on'||key==='ends_on')&&value instanceof Date?value.toISOString().slice(0,10):value])));
      return Response.json(values,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
    }};
  assert.equal((await observeInternshipCallerRows(fixture.current(),callerOptions)).checks,8);
  assert.equal(await fixture.observe(),original);
  uncertain=true;
  await assert.rejects(fixture.transition('company'),/acknowledgement lost/u);
  assert.deepEqual(journals.at(-1),{previous:'normal',pending:'company',unsettled:true});
  uncertain=false;
  await fixture.cleanup();
  await fixture.verifyAbsent();
  assert.deepEqual(journals.at(-1),{previous:null,pending:null,unsettled:false});
  assert.equal((await sql`select id from public.affairs_service_records where id<>${control.id}`).length,0);
  assert.equal((await sql`select id from public.affairs_service_requests`).length,0);
  assert.deepEqual(Array.from(await sql`select id from public.affairs_service_records`),[control]);

  const [program]=await sql`select id from public.affairs_programs where code='SAMPLE-GEN'`;
  const chargePlan=buildInternshipChargeFixture({...binding,programId:program.id});
  const [own,other]=chargePlan.charges;
  await fixtureTransaction(sql,()=>stageInternshipCharges(sql,chargePlan));
  const rowsDigest=await observeInternshipChargeRows(sql,chargePlan);
  const chargeReadOptions={...callerOptions,fetchImpl:async(url,init)=>{
    const caller=init.headers.Authorization==='Bearer synthetic-A'?A:B;
    const fields=url.searchParams.get('select').split(',');
    const values=await reader.begin(async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${caller},true)`;
      if(url.pathname.endsWith('/affairs_students')){
        const userId=url.searchParams.get('user_id').slice(3);
        return tx`select ${tx(fields)} from public.affairs_students where user_id=${userId}`;
      }
      assert.ok(url.pathname.endsWith('/affairs_charges'));
      const studentId=url.searchParams.get('student_id').slice(3);
      const rows=await tx`select ${tx(fields)} from public.affairs_charges where student_id=${studentId}`;
      return rows.map(row=>({...row,amount_due:Number(row.amount_due),amount_paid:Number(row.amount_paid)}));
    });
    return Response.json(values);
  }};
  assert.equal((await observeInternshipChargeCallers(chargePlan,chargeReadOptions)).checks,8);
  assert.equal(await observeInternshipChargeRows(sql,chargePlan),rowsDigest);
  await sql`update public.affairs_charges set label='Unexpected local control' where id=${other.id}`;
  await assert.rejects(fixtureTransaction(sql,()=>cleanupInternshipCharges(sql,chargePlan)),/unrecognized charge or student rows/u);
  assert.equal((await sql`select 1 from public.affairs_charges where id in (${own.id},${other.id})`).length,2);
  await sql`update public.affairs_charges set label=${other.label} where id=${other.id}`;
  await fixtureTransaction(sql,()=>cleanupInternshipCharges(sql,chargePlan));
  await verifyInternshipChargesAbsent(sql,chargePlan);
  assert.deepEqual(Array.from(await sql`select id from public.affairs_service_records`),[control]);

  const read=await readPublishedSampleInitializerRows(sql),now='2026-11-19T20:00:00.000Z';
  const timetable=buildInternshipTimetableFixture({...binding,read,now});
  assert.throws(()=>buildInternshipTimetableFixture({...binding,read,now:'2027-01-16T00:00:00.000Z'}),{reason:'fixture-window-expired'});
  await fixtureTransaction(sql,()=>stageInternshipTimetable(sql,timetable));
  const persisted=await observeInternshipTimetableRows(sql,timetable);
  assert.equal(persisted.enrollments.length,6);
  const next=await readInternshipNextMeeting(sql,timetable.students[0].id,now);
  assert.deepEqual(next,{code:'SAMP103',title:'Student Services Practice',sectionCode:'A',room:'Sample Room 305',date:'2026-11-20',startTime:'10:00'});
  const twoCaseIds=internshipPublishedTimetableCaseIds.map(id=>internshipPublishedTimetableCase(id,next).id);
  assert.deepEqual(twoCaseIds,internshipPublishedTimetableCaseIds);
  assert.throws(()=>internshipPublishedTimetableCase('account:internship-native-next-class',next),/Invalid independently dated/u);
  assert.throws(()=>internshipPublishedTimetableCase(twoCaseIds[0],{...next,sectionCode:'B'}),/Invalid independently dated/u);
  assert.equal((await readInternshipNextMeeting(sql,timetable.students[0].id,'2026-11-20T02:00:00.000Z')).date,'2026-11-27');
  const fridayFinal=await readInternshipNextMeeting(sql,timetable.students[0].id,'2027-01-15T02:00:00.000Z');
  assert.deepEqual(fridayFinal,{code:'SAMP201',title:'Applied Digital Projects',sectionCode:'A',room:'Sample Lab 202',date:'2027-02-16',startTime:'14:00'});
  const timetableReadOptions={...callerOptions,fetchImpl:async(url,init)=>{
    const caller=init.headers.Authorization==='Bearer synthetic-A'?A:B;
    const values=await reader.begin(async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${caller},true)`;
      if(url.pathname.endsWith('/affairs_students')){
        const userId=url.searchParams.get('user_id').slice(3);
        return tx`select id,user_id from public.affairs_students where user_id=${userId}`;
      }
      assert.ok(url.pathname.endsWith('/affairs_enrollments'));
      assert.equal(init.headers.Prefer,'count=exact');
      const studentId=url.searchParams.get('student_id').slice(3);
      return tx`select e.id,e.student_id,e.section_id,e.status,e.source_mode,json_build_object('id',u.id,'user_id',u.user_id) student,
        json_build_object('id',s.id,'course_id',c.id,'term_id',t.id,'weekday',s.weekday,'starts_at',s.starts_at::text,'ends_at',s.ends_at::text,'room',s.room,
          'course',json_build_object('id',c.id,'code',c.code,'title',c.title),
          'term',json_build_object('id',t.id,'label',t.label,'starts_on',t.starts_on,'ends_on',t.ends_on)) section
        from public.affairs_enrollments e join public.affairs_students u on e.student_id=u.id join public.affairs_sections s on e.section_id=s.id
        join public.affairs_courses c on s.course_id=c.id join public.affairs_terms t on s.term_id=t.id
        where e.student_id=${studentId} and e.status='enrolled' order by e.id`;
    });
    return Response.json(values,{headers:{'content-range':values.length?'0-'+(values.length-1)+'/'+values.length:'*/0'}});
  }};
  assert.equal((await observeInternshipTimetableCallers(timetable,persisted,timetableReadOptions)).checks,8);
  await assert.rejects(observeInternshipTimetableCallers(timetable,persisted,{...timetableReadOptions,fetchImpl:async(url,request)=>{
    const response=await timetableReadOptions.fetchImpl(url,request);
    return new Response(response.body,{headers:{'content-range':'0-0/9'}});
  }}),/own or crossed caller rows differ/u);
  const changed=await sql`update public.affairs_enrollments set status='withdrawn' where id=${persisted.enrollments.find(row=>row.status==='enrolled').id} returning id`;
  await assert.rejects(fixtureTransaction(sql,()=>cleanupInternshipTimetable(sql,timetable,persisted)),/scoped trigger rows differ/u);
  await sql`update public.affairs_enrollments set status='enrolled' where id=${changed[0].id}`;
  await fixtureTransaction(sql,()=>cleanupInternshipTimetable(sql,timetable,persisted));
  await verifyInternshipTimetableAbsent(sql,timetable,persisted);
  assert.deepEqual(await readPublishedSampleInitializerRows(sql),read);
  assert.deepEqual(Array.from(await sql`select id from public.affairs_service_records`),[control]);

});

async function fixtureTransaction(sql,work){
  await sql.unsafe('begin');
  try{await work();await sql.unsafe('commit');}
  catch(error){await sql.unsafe('rollback');throw error;}
}
