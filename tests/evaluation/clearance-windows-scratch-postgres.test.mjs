import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import postgres from 'postgres';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import affairsData from '../../api/affairs-data.ts';
import {readClearanceEvidence} from '../../server/accountClearanceEvidence.js';
import {buildClearanceApplicationCases,clearanceApplicationFixtureForCase,clearanceApplicationCaseManifest,
  gradeClearanceApplicationCase} from './clearance-application-cases.mjs';

const socket=process.env.STU_CLEARANCE_TEST_PG_SOCKET;
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='scratch-clearance-window-synthetic-key';
const {owners,paths,scope,view}=clearanceApplicationCaseManifest;
const tokens=Object.fromEntries(Object.keys(owners).map(side=>[side,'scratch-clearance-window-token-'+side]));
const nativeQuery={scope,view};
const frozen=buildClearanceApplicationCases();
const rows=Object.fromEntries(['windows','status-and-windows','window-without-application'].map(suffix=>[suffix,
  frozen.find(row=>row.id==='account:clearance-applications-'+suffix)]));
const readMigration=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
const utcZ=stamp=>stamp===null?null:stamp.replace(/\+00:00$/u,'Z');

function normalizedDto(native){
  return {...native,
    applications:native.applications.map(row=>({...row,submittedAt:utcZ(row.submittedAt),
      reviews:row.reviews.map(review=>({...review,reviewedAt:utcZ(review.reviewedAt)}))})),
    periods:native.periods.map(period=>({...period,opensAt:utcZ(period.opensAt),closesAt:utcZ(period.closesAt)})),
  };
}

export async function exerciseClearanceWindowReplay(t,sql,asCaller){
  const A=clearanceApplicationFixtureForCase(rows['status-and-windows']).dto;
  const B={...clearanceApplicationFixtureForCase(rows['window-without-application']).dto,userId:owners.B,targetId:owners.B};
  const expected={A,B};
  const [open,closed]=A.periods;
  const [clock]=await sql`select statement_timestamp()>=${open.opensAt}::timestamptz
    and statement_timestamp()<${open.closesAt}::timestamptz
    and statement_timestamp()>=${closed.closesAt}::timestamptz as matches`;
  assert.equal(clock?.matches,true,'Scratch SQL time must fall within the frozen open period.');

  await sql.unsafe(`do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end$$;
    create schema auth;create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  await sql.unsafe(await readMigration('20261105010000_school_affairs_workspace.sql'));
  const withdrawal=await readMigration('20261114110000_course_withdrawal.sql');
  const helper=withdrawal.slice(withdrawal.indexOf('create function private.affairs_withdrawal_window_state('),
    withdrawal.indexOf('create function public.affairs_read_course_withdrawal('));
  assert.match(helper,/^create function private\.affairs_withdrawal_window_state/u);
  await sql.unsafe(helper);
  await sql.unsafe(await readMigration('20261114150000_graduation_clearance.sql'));

  for(const [side,id] of Object.entries(owners)){
    const email='test-clearance-'+side.toLowerCase()+'@example.invalid';
    await sql`insert into auth.users values(${id},${email},now(),'{}')`;
    await sql`insert into auth.identities values(${id},'google')`;
    await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${id},${email},'Synthetic caller')`;
  }
  const control=randomUUID();
  for(const period of [...A.periods,{...open,termId:control,term:'UNASSIGNED CONTROL PERIOD'}]){
    const opens=period.opensAt.slice(0,10),closes=period.closesAt.slice(0,10);
    await sql`insert into public.affairs_terms(id,code,label,starts_on,ends_on)
      values(${period.termId},${'TEST-'+period.termId},${period.term},${opens},${closes})`;
    await sql`insert into public.affairs_clearance_periods values(${period.termId},${period.opensAt},${period.closesAt},${period.version})`;
    if(period.termId===control)continue;
    for(const id of Object.values(owners))
      await sql`insert into public.affairs_clearance_candidates values(${period.termId},${id},${period.candidate.track},
        ${period.candidate.international},${period.candidate.version})`;
  }
  for(const app of A.applications){
    await sql`insert into public.affairs_clearance_applications values(${app.id},${app.termId},${owners.A},${app.track},${app.submittedAt})`;
    for(const review of app.reviews)
      await sql`insert into public.affairs_clearance_reviews values(${app.id},${review.office},${review.status},${review.note},${review.reviewedAt},${review.version})`;
  }
  const snapshot=async()=>Promise.all([
    sql`select * from public.affairs_terms order by id`,
    sql`select * from public.affairs_clearance_periods order by term_id`,
    sql`select * from public.affairs_clearance_candidates order by term_id,user_id`,
    sql`select * from public.affairs_clearance_applications order by id`,
    sql`select * from public.affairs_clearance_reviews order by application_id,office`,
    sql`select * from private.affairs_clearance_receipts order by actor,request_id`,
  ]);
  const baseline=await snapshot(),requests=[],errors=[],projections=[],reviews=[];
  const handler=createAffairsAssistantHandler({
    loadSnapshot:async()=>assert.fail('Window questions may use only scoped clearance records.'),
    publicResearch:async()=>assert.fail('Own clearance windows cannot be looked up publicly.'),
    readers:{async graduationClearance(account,options){
      const result=await readClearanceEvidence(account,options);
      projections.push(structuredClone(result));
      return result;
    }},
  });
  for(const [name,value] of Object.entries({VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:key,OPENAI_API_KEY:'synthetic-clearance-review'})){
    const original=process.env[name];
    process.env[name]=value;
    t.after(()=>{if(original===undefined)delete process.env[name];else process.env[name]=original;});
  }
  const stub=async(input,init)=>{
    const url=new URL(input),body=init?.body&&JSON.parse(init.body);
    if(url.origin==='https://api.openai.com'){
      assert.equal(body.text.format.name,'answer_evidence_review');
      const {evidence}=JSON.parse(body.input[0].content[0].text);
      assert.deepEqual(evidence.map(row=>row.id),['account-scope','account:graduationClearance']);
      const projected=evidence[1],payload=JSON.parse(projected.content);
      assert.equal(payload.periods.length,2);
      assert.doesNotMatch(projected.content,/UNASSIGNED CONTROL PERIOD|16100000|scratch-clearance-window-token/u);
      reviews.push(projected.id);
      const claims=payload.periods.map((period,index)=>({claim:period.term+' saved period is '+period.state,evidenceId:projected.id,
        jsonPaths:[...['term','opensAt','closesAt','state'].map(field=>'/periods/'+index+'/'+field)],quotes:[],supported:true}));
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,answersQuestion:true,claims})}]}]});
    }
    assert.equal(url.origin,origin);
    const headers=new Headers(init?.headers),side=Object.keys(tokens).find(name=>headers.get('authorization')==='Bearer '+tokens[name]);
    assert.ok(side);
    assert.equal(headers.get('apikey'),key);
    if(url.pathname==='/auth/v1/user')return Response.json({id:owners[side],identities:[{provider:'google'}]});
    assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_graduation_clearance');
    assert.equal(init.method,'POST');
    assert.equal(init.redirect,'error');
    assert.deepEqual(body,{p_view:'student',p_term:null,p_student:null});
    requests.push(side);
    const native=await asCaller(owners[side],async tx=>{
      const [result]=await tx`select public.affairs_read_graduation_clearance('student',null,null) as value`;
      return result.value;
    });
    // The frozen JSON oracle uses Z. Alternate UTC spellings represent the same
    // PostgreSQL timestamp, including any stored fractional seconds.
    return Response.json(normalizedDto(native));
  };
  t.mock.method(globalThis,'fetch',(...args)=>stub(...args).catch(error=>{errors.push(error);throw error;}));

  async function invoke(serve,side,query,body){
    const result={statusCode:0,body:null};
    const response={setHeader(){},status(code){result.statusCode=code;return this;},json(value){result.body=value;}};
    await serve({method:query?'GET':'POST',headers:{authorization:'Bearer '+tokens[side]},query,body},response);
    if(errors.length)throw new AggregateError(errors,'Unexpected scratch clearance request');
    assert.equal(result.statusCode,200,body?.question??'native caller readback');
    return result;
  }
  async function observe(){
    for(const side of ['A','B'])assert.deepEqual((await invoke(affairsData,side,nativeQuery)).body,expected[side]);
    assert.deepEqual(await snapshot(),baseline);
  }
  for(const [suffix,side,route] of [
    ['windows','A',paths.apply],['status-and-windows','A',paths.status],['window-without-application','B',paths.apply],
  ]){
    await observe();
    const record=rows[suffix],before=requests.length,reviewCount=reviews.length,evidenceCount=projections.length;
    const result=await invoke(handler,side,undefined,{question:record.question,route,history:[],stream:false,consentedResearchUse:false});
    assert.deepEqual(requests.slice(before),[side],suffix);
    assert.equal(reviews.length,reviewCount+1,suffix);
    assert.equal(result.body.proposedAction,undefined,suffix);
    assert.deepEqual(result.body.verification,{status:'verified',attempts:1},suffix);
    assert.equal(projections.length,evidenceCount+1,suffix);
    const graded=gradeClearanceApplicationCase(record,{...result,execution:'deterministic',fixtureKey:record.fixtureKey},
      {observation:{readCalls:1,queries:[nativeQuery],writes:[],storage:[],result:projections.at(-1)}});
    assert.deepEqual(graded.failures.map(row=>row.id),[],suffix);
    await observe();
  }
  assert.equal((await sql`select * from private.affairs_clearance_receipts`).length,0);
}

test('three frozen positive clearance windows reconcile through the actual handlers and isolated PostgreSQL',
  {skip:!socket,timeout:30000},async t=>{
  assert.match(socket,/^\/(?:(?:private\/)?var\/tmp|tmp)\/stu100-clearance-pg\.[A-Za-z0-9]{6}\/socket$/u);
  const dir=await lstat(socket);
  assert.equal(dir.uid,process.getuid());
  assert.equal(dir.mode&0o777,0o700);
  assert.equal(await realpath(socket),socket);
  assert.ok((await lstat(join(socket,'.s.PGSQL.5432'))).isSocket());
  const connect=database=>postgres({host:socket,user:'postgres',database,max:1,ssl:false,connect_timeout:3,onnotice:()=>{}});
  const admin=connect('postgres'),database='clearance_windows_'+randomUUID().replaceAll('-','');
  await admin.unsafe('create database '+database);
  const sql=connect(database);
  t.after(async()=>{
    await sql.end();
    try{
      await admin.unsafe('drop database '+database);
      assert.equal((await admin`select datname from pg_catalog.pg_database where datname=${database}`).length,0);
    }finally{await admin.end();}
  });
  await exerciseClearanceWindowReplay(t,sql,(id,work)=>sql.begin(async tx=>{
    await tx.unsafe('set local role authenticated');
    await tx`select set_config('request.jwt.claim.sub',${id},true)`;
    return work(tx);
  }));
});
