import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import postgres from 'postgres';
import {buildInternshipFixturePlan,createInternshipFixture,internshipFixtureMode,observeInternshipCallerRows} from './internship-native-fixture.mjs';
import {internshipHostedCases} from './internship-native-hosted.mjs';
import {prepare,runInternshipPreview} from './live-fixtures.mjs';

const binding={runId:'53020000-0000-4000-8000-000000000110',owners:{A:'53020000-0000-4000-8000-000000000111',B:'53020000-0000-4000-8000-000000000112'}};
const origin='https://stdedu-abcdef012-v1-d286.vercel.app',sourceRevision='a'.repeat(40);
const {A,B}=binding.owners;
const protectedOwner='53020000-0000-4000-8000-000000000113';
const socket=process.env.STU_INTERNSHIP_TEST_PG_SOCKET;

test('the isolated packet binds distinct owners and keeps three scoped empty states separate',()=>{
  const cases=internshipHostedCases();
  assert.equal(cases.length,24);
  assert.equal(cases.filter(row=>row.auth!=='anonymous').length,23);
  assert.equal(cases.filter(row=>row.observationExpectation.read).length,17);
  assert.throws(()=>internshipHostedCases(['account:internship-native-reader-failed']),/Invalid protected/u);
  assert.throws(()=>internshipHostedCases(['account:internship-native-next-class']),/Invalid protected/u);
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
    '20261106010000_affairs_academic_records.sql','20261112010000_student_workspace.sql','20261112020000_leave_application_fields.sql'])
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
});
