import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {test} from 'node:test';
import postgres from 'postgres';
import affairsData from '../../api/affairs-data.ts';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {buildAccountCases} from './account-cases.mjs';
import {gradeCase} from './grading.mjs';

const socket=process.env.STU_HOUSING_TEST_PG_SOCKET;
const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const key='synthetic-housing-test-publishable-key';
const periodId='34010000-0000-4000-8000-000000000001';
const callers=[
  {id:'34010000-0000-4000-8000-000000000010',token:'scratch-housing-caller-A-only-token',bed:'E-305-2',dorm:'East Hall',bunk:'upper',fee:8500,deposit:1000,subsidy:2000,notice:'unknown'},
  {id:'34010000-0000-4000-8000-000000000020',token:'scratch-housing-caller-B-only-token',bed:'W-104-9',dorm:'West Hall',bunk:'lower',fee:9173,deposit:1743,subsidy:2643,notice:'empty'},
];
const assignmentFields=['id','user_id','period_id','bed_number','version','dormitory','bunk'];
const feeFields=['accommodation_fee','deposit','subsidy_amount'];
const periodFields=['id','academic_year','semester','source_mode','version'];
const noticeFields=['id','user_id','source_mode','version','created_at','updated_at','deleted_at','result'];

async function invoke(handler,request){
  const output={statusCode:200,body:null,events:[]};
  const response={
    setHeader(){},
    status(code){output.statusCode=code;return response;},
    json(value){output.body=value;},
    write(chunk){
      const match=/^event: (.+)\ndata: (.+)\n\n$/u.exec(chunk);
      assert.ok(match);
      const value=JSON.parse(match[2]);
      if(['result','error'].includes(match[1]))output.body=value;
      else output.events.push(value);
    },
    end(){},
  };
  await handler(request,response);
  return output;
}
function reviewer(init){
  const request=JSON.parse(String(init.body));
  assert.equal(request.text.format.name,'answer_evidence_review');
  const draft=JSON.parse(request.input[0].content[0].text);
  const claims=draft.evidence.filter(source=>source.id!=='account-scope').map(source=>{
    const value=JSON.parse(source.content);
    let jsonPaths;
    if(source.id==='account:housing'){
      assert.equal(value.collection,'housingBed');
      assert.equal(value.records.length,1);
      jsonPaths=Object.keys(value.records[0]).map(field=>'/records/0/'+field);
    }else{
      assert.equal(source.id,'account:dormitoryConduct');
      assert.equal(value.metadataState,'saved');
      jsonPaths=['/record/result'];
    }
    return {claim:'Checked the selected native record',supported:true,evidenceId:source.id,quotes:[],jsonPaths};
  });
  const review=JSON.stringify({supported:true,answersQuestion:true,claims});
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:review}]}]});
}
function digest(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

test('published housing beds, fees and separate conduct notices reconcile through the real HTTP handlers and PostgreSQL RLS',
  {skip:!socket,timeout:30000},async t=>{
  assert.match(socket,/^\/(?:(?:private\/)?var\/tmp|tmp)\/stu100-housing-pg\.[A-Za-z0-9]{6}\/socket$/u);
  const dir=await lstat(socket);
  assert.equal(dir.uid,process.getuid());
  assert.equal(dir.mode&0o777,0o700);
  assert.equal(await realpath(socket),socket);
  assert.ok((await lstat(join(socket,'.s.PGSQL.5432'))).isSocket());
  const connect=database=>postgres({
    host:socket,user:'postgres',database,max:1,ssl:false,connect_timeout:3,onnotice:()=>{},
    connection:{application_name:'stu-housing-local-test',statement_timeout:4500},
  });
  const admin=connect('postgres');
  const database='housing_'+randomUUID().replaceAll('-','');
  await admin.unsafe('create database '+database);
  const sql=connect(database),reader=connect(database);
  t.after(async()=>{
    await Promise.all([sql.end(),reader.end()]);
    try{
      await admin.unsafe('drop database '+database);
      assert.equal((await admin`select datname from pg_catalog.pg_database where datname=${database}`).length,0);
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
    '20261105010000_school_affairs_workspace.sql','20261112060000_housing_records.sql','20261112220000_dormitory_conduct.sql',
  ]){
    await sql.unsafe(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  }

  await sql`insert into public.affairs_housing_periods
    (id,term_label,academic_year,semester,opens_at,closes_at,published,agreement_text)
    values(${periodId},'115-1 Scratch Housing',115,1,'2026-07-01T00:00:00+08:00','2026-08-01T00:00:00+08:00',true,'Scratch agreement')`;
  for(const caller of callers){
    const email=caller.id+'@example.invalid';
    await sql`insert into auth.users values(${caller.id},${email},now(),'{}')`;
    await sql`insert into auth.identities values
      (${caller.id},${caller.id},${sql.json({sub:caller.id,email,email_verified:true})},'google')`;
    await sql`insert into public.affairs_profiles(user_id,email,display_name,role)
      values(${caller.id},${email},'Housing test student','student')`;
    await sql`insert into public.affairs_housing_assignments
      (user_id,period_id,bed_number,dormitory,bunk,accommodation_fee,deposit,subsidy_amount)
      values(${caller.id},${periodId},${caller.bed},${caller.dorm},${caller.bunk},${caller.fee},${caller.deposit},${caller.subsidy})`;
    await sql`insert into public.affairs_dormitory_conduct(id,user_id,result) values(gen_random_uuid(),${caller.id},${caller.notice})`;
  }
  const asCaller=(caller,work)=>reader.begin(async tx=>{
    await tx.unsafe('set local role authenticated');
    await tx`select set_config('request.jwt.claim.sub',${caller.id},true)`;
    return work(tx);
  });
  for(const [index,caller] of callers.entries()){
    const other=callers[1-index];
    await asCaller(caller,async tx=>{
      const [term]=await tx`select academic_year,semester,published from public.affairs_housing_periods where id=${periodId}`;
      assert.deepEqual(term,{academic_year:115,semester:1,published:true});
      const beds=Array.from(await tx`select bed_number,user_id from public.affairs_housing_assignments`);
      const notices=Array.from(await tx`select result,user_id from public.affairs_dormitory_conduct`);
      assert.deepEqual(beds,[{bed_number:caller.bed,user_id:caller.id}]);
      assert.deepEqual(notices,[{result:caller.notice,user_id:caller.id}]);
      assert.equal((await tx`select id from public.affairs_housing_assignments where user_id=${other.id}`).length,0);
      assert.equal((await tx`select id from public.affairs_dormitory_conduct where user_id=${other.id}`).length,0);
    });
    await assert.rejects(asCaller(caller,tx=>tx`update public.affairs_housing_assignments
      set bed_number='REJECTED' where user_id=${caller.id}`),{code:'42501'});
  }
  const readPersistedState=async()=>{
    const [{state}]=await sql`select jsonb_build_object(
      'periods',(select jsonb_agg(to_jsonb(row) order by id) from public.affairs_housing_periods row),
      'assignments',(select jsonb_agg(to_jsonb(row) order by id) from public.affairs_housing_assignments row),
      'applications',(select jsonb_agg(to_jsonb(row) order by id) from public.affairs_housing_applications row),
      'notices',(select jsonb_agg(to_jsonb(row) order by id) from public.affairs_dormitory_conduct row),
      'housingOperations',(select jsonb_agg(to_jsonb(row) order by user_id,request_id) from private.affairs_housing_operations row),
      'noticeOperations',(select jsonb_agg(to_jsonb(row) order by user_id,request_id) from private.affairs_dormitory_conduct_operations row),
      'audit',(select jsonb_agg(to_jsonb(row) order by id) from public.affairs_agent_audit row)
    ) as state`;
    return {ownedRecordsDigest:digest(state)};
  };

  const fetchBefore=globalThis.fetch,envBefore={
    OPENAI_API_KEY:process.env.OPENAI_API_KEY,VITE_SUPABASE_URL:process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY:process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  const requests=[],transportErrors=[];
  process.env.OPENAI_API_KEY='synthetic-review-only';
  process.env.VITE_SUPABASE_URL=project;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  globalThis.fetch=async(input,init={})=>{
    try{
      const url=new URL(String(input)),headers=new Headers(init.headers);
      if(url.origin==='https://api.openai.com'){
        assert.equal(url.pathname,'/v1/responses');
        assert.equal(init.method,'POST');
        assert.equal(headers.get('authorization'),'Bearer synthetic-review-only');
        requests.push({resource:'review'});
        return reviewer(init);
      }
      assert.equal(url.origin,project,'Reject every non-fixture origin before a network request');
      assert.equal(init.method??'GET','GET','Student answers must never issue a database write');
      assert.equal(headers.get('apikey'),key);
      const caller=callers.find(item=>headers.get('authorization')==='Bearer '+item.token);
      assert.ok(caller);
      if(url.pathname==='/auth/v1/user'){
        requests.push({resource:'identity',owner:caller.id});
        const [user]=await sql`select u.id,jsonb_agg(jsonb_build_object('provider',i.provider)) as identities
          from auth.users u join auth.identities i on i.user_id=u.id where u.id=${caller.id} group by u.id`;
        assert.ok(user);
        return Response.json(user);
      }
      const resource=url.pathname;
      const query=url.searchParams,columns=query.get('select').split(',');
      requests.push({resource,owner:caller.id,columns});
      assert.equal(init.redirect,'error');
      assert.equal(query.get('order'),'id.asc');
      const rows=await asCaller(caller,async tx=>{
        if(resource==='/rest/v1/affairs_housing_assignments'){
          assert.deepEqual(columns.slice(0,assignmentFields.length),assignmentFields);
          assert.ok(columns.slice(assignmentFields.length).every(field=>feeFields.includes(field)));
          assert.equal(query.get('user_id'),'eq.'+caller.id);
          assert.equal(query.get('limit'),'200');
          assert.equal(headers.get('prefer'),'count=exact');
          return tx`select to_jsonb(record) as row from (
            select ${tx(columns)} from public.affairs_housing_assignments where user_id=${caller.id} order by id
          ) record`;
        }
        if(resource==='/rest/v1/affairs_housing_periods'){
          assert.deepEqual(columns,periodFields);
          assert.equal(query.get('id'),'in.('+periodId+')');
          assert.equal(query.get('limit'),'1');
          assert.equal(headers.get('prefer'),'count=exact');
          return tx`select to_jsonb(record) as row from (
            select ${tx(columns)} from public.affairs_housing_periods where id=${periodId} order by id
          ) record`;
        }
        assert.equal(resource,'/rest/v1/affairs_dormitory_conduct');
        assert.deepEqual(columns,noticeFields);
        assert.equal(query.get('user_id'),'eq.'+caller.id);
        assert.equal(query.get('deleted_at'),'is.null');
        assert.equal(query.get('limit'),'2');
        return tx`select to_jsonb(record) as row from (
          select ${tx(columns)} from public.affairs_dormitory_conduct where user_id=${caller.id} and deleted_at is null order by id
        ) record`;
      });
      return Response.json(rows.map(({row})=>row),
        {headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
    }catch(error){transportErrors.push(error);throw error;}
  };
  try{
    const unexpected=async()=>{
      const error=new Error('A native housing question must not load the general account snapshot or public research.');
      transportErrors.push(error);
      throw error;
    };
    const assistant=createAffairsAssistantHandler({loadSnapshot:unexpected,publicResearch:unexpected});
    const headersFor=caller=>({authorization:'Bearer '+caller.token});
    const cases=buildAccountCases();
    const [owner,other]=callers;
    const scenarios=[
      {id:'account:housing-bed',feeColumns:[],view:[115,1,owner.bed,owner.dorm,owner.bunk]},
      {id:'account:housing-costs',feeColumns:feeFields,view:[115,1,owner.bed,owner.dorm,owner.bunk,owner.fee,owner.deposit,owner.subsidy]},
      {id:'account:dormitory-conduct-mixed-housing',feeColumns:['accommodation_fee'],view:[115,1,owner.bed,owner.dorm,owner.bunk,owner.fee],notice:true},
    ];
    for(const scenario of scenarios){
      const row=cases.find(item=>item.id===scenario.id);
      assert.ok(row);
      const stateBefore=await readPersistedState(),start=requests.length;
      const reply=await invoke(assistant,{method:'POST',headers:headersFor(owner),body:{question:row.question,route:row.route,stream:true}});
      const stateAfterProposal=await readPersistedState();
      assert.deepEqual(transportErrors,[]);
      assert.deepEqual(stateBefore,stateAfterProposal,row.id);
      const outcome=gradeCase(row,{...reply,execution:'deterministic',fixtureKey:row.fixtureKey,
        stateBefore,stateAfterProposal,fixtureReadback:{verified:true,independentGolden:true}});
      assert.deepEqual(outcome.failures,[],row.id);
      assert.equal(reply.body.verification.status,'verified',row.id);
      assert.deepEqual(reply.body.views.find(view=>view.id==='housing').rows,[scenario.view.map(String)],row.id);
      const packet=requests.slice(start);
      assert.ok(packet.every(event=>event.resource==='review'||event.owner===owner.id),row.id);
      assert.equal(packet.filter(event=>event.resource==='identity').length,1,row.id);
      assert.deepEqual(packet.filter(event=>event.resource.endsWith('affairs_housing_assignments')).map(event=>event.columns),
        [[...assignmentFields,...scenario.feeColumns]],row.id);
      assert.equal(packet.filter(event=>event.resource.endsWith('affairs_housing_periods')).length,1,row.id);
      assert.equal(packet.filter(event=>event.resource.endsWith('affairs_dormitory_conduct')).length,scenario.notice?1:0,row.id);
      for(const value of [owner.id,other.id,other.bed,other.dorm,other.fee,other.deposit,other.subsidy])
        assert.equal(JSON.stringify(reply.body).includes(String(value)),false,row.id);
    }

    const stateBefore=await readPersistedState();
    const row=cases.find(item=>item.id==='account:housing-bed');
    const otherReply=await invoke(assistant,{method:'POST',headers:headersFor(other),body:{question:row.question,route:row.route,stream:true}});
    assert.equal(otherReply.body.verification.status,'verified');
    assert.deepEqual(otherReply.body.views.find(view=>view.id==='housing').rows,
      [[115,1,other.bed,other.dorm,other.bunk].map(String)]);
    assert.doesNotMatch(JSON.stringify(otherReply.body),/E-305-2|East Hall/u);

    for(const caller of callers){
      const own=await invoke(affairsData,{method:'GET',headers:headersFor(caller),query:{scope:'dormitory-conduct'}});
      assert.equal(own.statusCode,200);
      assert.deepEqual(own.body,{snapshot:{userId:caller.id,sourceMode:'local_demo',version:1,result:caller.notice}});
      const foreign=callers.find(item=>item!==caller);
      const start=requests.length;
      const crossed=await invoke(affairsData,{method:'GET',headers:headersFor(caller),query:{scope:'dormitory-conduct',user_id:foreign.id}});
      assert.equal(crossed.statusCode,400);
      assert.deepEqual(requests.slice(start),[{resource:'identity',owner:caller.id}]);
    }
    assert.deepEqual(transportErrors,[]);
    assert.deepEqual(await readPersistedState(),stateBefore);
  }finally{
    globalThis.fetch=fetchBefore;
    for(const [name,value] of Object.entries(envBefore)){
      if(value===undefined)delete process.env[name];
      else process.env[name]=value;
    }
  }
});
