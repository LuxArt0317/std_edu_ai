import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {test} from 'node:test';
import postgres from 'postgres';
import {buildTeachingFeedbackNativeCases} from './teaching-feedback-native-cases.mjs';
import {buildTeachingSampleFixture,createTeachingSampleFixture,expectedTeachingSampleDto,normalizeTeachingNativeDto,
  observeTeachingSampleCallers,readTeachingSampleCatalog} from './teaching-feedback-sample-fixture.mjs';

const socket=process.env.STU_TEACHING_TEST_PG_SOCKET;
const uuid=n=>'75030000-0000-4000-8000-'+String(n).padStart(12,'0');
const runId=uuid(90),ownerA=uuid(1),ownerB=uuid(2);
const owners={A:{id:ownerA,email:'evaluation.student@example.invalid'},
  B:{id:ownerB,email:`evaluation.other.${runId}@example.invalid`}};
const binding={runId,owners};
const callers=Object.values(owners).map((owner,index)=>({...owner,token:'local-teaching-transport-'+index}));
const knownCatalog={termId:uuid(4),programId:uuid(5),sections:[
  ...['Campus Orientation','Digital Learning Basics','Student Services Practice'].map((course,index)=>({
    id:uuid(6+index),course,code:'SAMP10'+(index+1),term:'Sample Fall 2026',section:'A',
  })),
]};
const readResponse=async response=>{
  assert.equal(response.status,200);
  return response.json();
};

test('the sample packet is separate from the 40 frozen questions and keeps distinct course, status, and exact comment values',()=>{
  const frozen=buildTeachingFeedbackNativeCases();
  assert.equal(frozen.length,40);
  assert.match(frozen.find(row=>row.id.endsWith('immediate-comment')).question,/DB701/u);
  const paired=buildTeachingSampleFixture(binding,knownCatalog);
  const empty=buildTeachingSampleFixture(binding,knownCatalog,'second-empty');
  assert.deepEqual(paired.ids,empty.ids);
  assert.deepEqual(expectedTeachingSampleDto(paired,'A','immediate').feedback.map(row=>row.code),['SAMP101','SAMP102']);
  assert.deepEqual(expectedTeachingSampleDto(paired,'B','immediate').feedback.map(row=>row.code),['SAMP101']);
  const [a]=expectedTeachingSampleDto(paired,'A','immediate').feedback,[b]=expectedTeachingSampleDto(paired,'B','immediate').feedback;
  assert.equal(a.sectionId,b.sectionId,'The same section challenges owner-only immediate feedback');
  assert.notEqual(a.id,b.id);
  assert.notEqual(a.comment,b.comment);
  assert.notEqual(a.status,b.status);
  assert.deepEqual(expectedTeachingSampleDto(empty,'B','immediate').feedback,[]);
  assert.equal(expectedTeachingSampleDto(empty,'B','immediate').courses.length,0);
  assert.deepEqual(expectedTeachingSampleDto(paired,'B','survey'),{userId:ownerB,courses:[],surveys:[],feedback:[],terms:[],results:[]});
  assert.throws(()=>buildTeachingSampleFixture({...binding,owners:{...owners,B:{...owners.B,id:ownerA}}},knownCatalog),/exact disposable/u);
  assert.throws(()=>buildTeachingSampleFixture({...binding,owners:{...owners,B:{...owners.B,email:'another@example.invalid'}}},knownCatalog),/exact disposable/u);
  assert.throws(()=>expectedTeachingSampleDto(paired,'A','manage'),/unsupported personal/u);
  assert.deepEqual(normalizeTeachingNativeDto({...expectedTeachingSampleDto(paired,'A','immediate'),
    feedback:[{...a,submittedAt:'2026-11-14T03:04:05+00:00'}]}).feedback,[a]);
});

test('paired projection rejects swapped owners and management or direct table disclosure',async()=>{
  const plan=buildTeachingSampleFixture(binding,knownCatalog);
  const fetch=(changed={})=>async(url,init)=>{
    assert.equal(url.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
    assert.equal(init.redirect,'error');
    assert.equal(init.credentials,'omit');
    const caller=callers.find(actor=>init.headers.authorization==='Bearer '+actor.token);
    assert.ok(caller);
    const selection=caller.id===ownerA?'A':'B';
    if(init.method==='GET'){
      assert.equal(url.pathname,'/rest/v1/affairs_teaching_feedback');
      assert.equal(url.searchParams.get('user_id'),'eq.'+owners[selection==='A'?'B':'A'].id);
      return new Response(null,{status:changed.direct??403});
    }
    assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_teaching_feedback');
    const {p_scope,...selectors}=JSON.parse(init.body);
    assert.deepEqual(selectors,{p_term:null,p_survey:null,p_section:null});
    if(p_scope==='manage')return new Response(null,{status:changed.manage??403});
    return Response.json(expectedTeachingSampleDto(plan,changed.owner??selection,p_scope));
  };
  const options={callers,publishableKey:'controlled-key',readResponse};
  assert.equal((await observeTeachingSampleCallers(plan,{...options,fetchImpl:fetch()})).checks,8);
  for(const [changed,expected] of [[{owner:'B'},/authored rows/u],[{direct:200},/foreign teaching record/u],[{manage:200},/management reader/u]])
    await assert.rejects(observeTeachingSampleCallers(plan,{...options,fetchImpl:fetch(changed)}),expected);
});

test('scratch PostgreSQL preserves the shared sample catalog and enforces paired reads, uncertain transition recovery, and exact cleanup',
  {skip:!socket,timeout:30000},async t=>{
  assert.match(socket,/^\/(?:(?:private\/)?var\/tmp|tmp)\/stu100-teaching-pg\.[A-Za-z0-9]{6}\/socket$/u);
  const dir=await lstat(socket);
  assert.equal(dir.uid,process.getuid());
  assert.equal(dir.mode&0o777,0o700);
  assert.equal(await realpath(socket),socket);
  assert.ok((await lstat(join(socket,'.s.PGSQL.5432'))).isSocket());
  const connect=database=>postgres({host:socket,user:'postgres',database,max:1,ssl:false,connect_timeout:3,onnotice:()=>{},
    connection:{application_name:'stu-teaching-local-test',statement_timeout:4500}});
  const admin=connect('postgres'),database='teaching_'+randomUUID().replaceAll('-','');
  await admin.unsafe('create database '+database);
  const client=connect(database),reader=connect(database),sql=await client.reserve();
  t.after(async()=>{
    await sql.release();
    await Promise.all([client.end(),reader.end()]);
    try{
      await admin.unsafe('drop database '+database);
      assert.equal((await admin`select 1 from pg_catalog.pg_database where datname=${database}`).length,0);
    }finally{await admin.end();}
  });
  await sql.unsafe(`do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end$$;
    create schema auth;create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(provider_id text,user_id uuid references auth.users on delete cascade,identity_data jsonb,provider text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated;`);
  for(const name of [
    '20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
    '20261106010000_affairs_academic_records.sql','20261112100000_course_selection_history.sql',
    '20261114110000_course_withdrawal.sql','20261114140000_teaching_feedback.sql',
  ])await sql.unsafe(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));

  const catalog=await readTeachingSampleCatalog(sql),protectedOwner=uuid(3),protectedReceipt=uuid(11);
  for(const actor of [...Object.values(owners),{id:protectedOwner,email:'unrelated@example.invalid'}]){
    await sql`insert into auth.users values(${actor.id},${actor.email},now(),${sql.json({assistant_evaluation_run:runId})})`;
    await sql`insert into auth.identities values(${actor.id},${actor.id},${sql.json({sub:actor.id,email:actor.email,email_verified:true})},'google')`;
  }
  await sql`insert into public.affairs_teaching_feedback(id,section_id,user_id,comment,request_id)
    values(${protectedReceipt},${catalog.sections[0].id},${protectedOwner},'Unrelated control row',${uuid(12)})`;
  const protectedBefore=Array.from(await sql`select * from public.affairs_teaching_feedback where id=${protectedReceipt}`);
  const journals=[];
  let uncertain=false;
  const options={sql,binding,catalog,assertLease:async()=>{},
    persist:async journal=>journals.push(journal),transaction:async work=>{
      await sql.unsafe('begin');
      try{await work();await sql.unsafe('commit');}
      catch(error){await sql.unsafe('rollback');throw error;}
      if(uncertain)throw new Error('Simulated lost commit acknowledgement');
    }};
  const fixture=createTeachingSampleFixture(options);
  await fixture.transition('paired');
  const original=await fixture.observe();
  const fetchImpl=async(url,init)=>{
    const caller=callers.find(actor=>init.headers.authorization==='Bearer '+actor.token);
    assert.ok(caller);
    try{
      const payload=await reader.begin(async tx=>{
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${caller.id},true)`;
        if(init.method==='GET'){
          const foreign=url.searchParams.get('user_id').slice(3);
          return tx`select id from public.affairs_teaching_feedback where user_id=${foreign}`;
        }
        const args=JSON.parse(init.body);
        const [value]=await tx`select public.affairs_read_teaching_feedback(${args.p_scope},${args.p_term},${args.p_survey},${args.p_section}) as dto`;
        return value.dto;
      });
      return Response.json(payload);
    }catch(error){
      assert.equal(error.code,'42501');
      return new Response(null,{status:403});
    }
  };
  const transport={callers,publishableKey:'synthetic-key',fetchImpl,readResponse};
  const pairedProof=await observeTeachingSampleCallers(fixture.current(),transport);
  assert.equal(pairedProof.checks,8);
  assert.equal(await fixture.observe(),original);
  await fixture.transition('second-empty');
  const emptyProof=await observeTeachingSampleCallers(fixture.current(),transport);
  assert.equal(emptyProof.checks,8);
  assert.notEqual(emptyProof.digest,pairedProof.digest);
  uncertain=true;
  await assert.rejects(fixture.transition('paired'),/lost commit acknowledgement/u);
  assert.deepEqual(journals.at(-1),{previous:'second-empty',pending:'paired',unsettled:true});
  assert.equal((await sql`select id from public.affairs_teaching_feedback where user_id=${ownerB}`).length,1);
  uncertain=false;
  const restarted=createTeachingSampleFixture({...options,recovery:journals.at(-1)});
  await assert.rejects(restarted.transition('paired'),/unsettled/u);
  await restarted.cleanup();
  await restarted.verifyAbsent();
  assert.deepEqual(journals.at(-1),{previous:null,pending:null,unsettled:false});
  assert.deepEqual(await readTeachingSampleCatalog(sql),catalog);
  assert.equal((await sql`select id from public.affairs_teaching_surveys`).length,0);
  assert.equal((await sql`select id from private.affairs_teaching_survey_results`).length,0);
  assert.deepEqual(Array.from(await sql`select * from public.affairs_teaching_feedback`),protectedBefore);
});
