import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import postgres from 'postgres';

const socket=process.env.STU_LEAVE_DRAFT_TEST_PG_SOCKET;
const migrations=[
  '20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
  '20261106010000_affairs_academic_records.sql',
  '20261112010000_student_workspace.sql','20261112020000_leave_application_fields.sql',
  '20261112120000_assistant_conversations.sql','20261116120000_student_leave_draft_action.sql',
];
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const kind='create_student_leave_draft';
async function invoke(handler,body,token){
  let code=0,result;
  const response={setHeader(){},status(value){code=value;return this;},json(value){result=value;}};
  await handler({method:'POST',headers:token?{authorization:'Bearer '+token}:{},body},response);
  return {code,result};
}

test('Leave proposal and concurrent confirmation use the existing form tables under real caller RLS',
  {skip:!socket,timeout:30_000},async t=>{
    assert.match(socket,/^\/(?:(?:private\/)?var\/tmp|tmp)\/stu100-leave-draft-pg\.[A-Za-z0-9]{6}\/socket$/u);
    const dir=await lstat(socket);
    assert.equal(dir.uid,process.getuid());
    assert.equal(dir.mode&0o777,0o700);
    assert.equal(await realpath(socket),socket);
    assert.ok((await lstat(join(socket,'.s.PGSQL.5432'))).isSocket());
    const connect=database=>postgres({host:socket,user:'postgres',database,max:4,ssl:false,connect_timeout:3,onnotice:()=>{},
      connection:{application_name:'stu-leave-draft-local-test',statement_timeout:5000}});
    const admin=connect('postgres'), database='leave_draft_'+randomUUID().replaceAll('-','');
    await admin.unsafe('create database '+database);
    const sql=connect(database);
    t.after(async()=>{
      await sql.end();
      try{
        await admin.unsafe('drop database '+database);
        assert.equal((await admin`select datname from pg_catalog.pg_database where datname=${database}`).length,0);
      }finally{await admin.end();}
    });
    await sql.unsafe(`do $$begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      end$$;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,private to authenticated,anon;`);
    for(const migration of migrations)
      await sql.unsafe(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));

    const owner=[0,1,2].map(index=>({id:randomUUID(),token:'OFFLINE_LEAVE_DRAFT_TOKEN_'+randomUUID(),email:`qa-leave-${index}@example.invalid`}));
    for(const [index,account] of owner.entries()){
      await sql`insert into auth.users values(${account.id},${account.email},now(),'{}')`;
      await sql`insert into auth.identities values(${account.id},${index===2?'email':'google'})`;
      await sql`insert into public.affairs_profiles(user_id,email,display_name) values(${account.id},${account.email},'Disposable learner')`;
    }
    const withCaller=(userId,fn)=>sql.begin(async tx=>{
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${userId},true)`;
      return fn(tx);
    });
    const [rights]=await sql`select
      has_function_privilege('anon','public.affairs_create_student_leave_draft(uuid,jsonb)','execute') as anonymous,
      has_function_privilege('authenticated','public.affairs_create_student_leave_draft(uuid,jsonb)','execute') as member,
      has_table_privilege('authenticated','private.affairs_assistant_operations','select') as receipts`;
    assert.deepEqual(rights,{anonymous:false,member:true,receipts:false});

    const settings={VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:'OFFLINE_LEAVE_DRAFT_PUBLISHABLE'};
    const previous=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));
    Object.assign(process.env,settings);
    t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
    let writes=0;
    t.mock.method(globalThis,'fetch',async(input,init)=>{
      const url=new URL(String(input));
      assert.equal(url.origin,origin);
      const token=new Headers(init.headers).get('authorization')?.replace(/^Bearer /u,'');
      const actor=owner.find(account=>account.token===token);
      assert.ok(actor);
      if(url.pathname==='/auth/v1/user')return Response.json({id:actor.id,identities:[{provider:actor===owner[2]?'email':'google'}]});
      writes++;
      assert.equal(init.method,'POST');
      const body=JSON.parse(init.body);
      try{
        const result=await withCaller(actor.id,async tx=>{
          if(url.pathname==='/rest/v1/rpc/affairs_create_student_leave_draft'){
            const [row]=await tx`select public.affairs_create_student_leave_draft(${body.p_request_id},${tx.json(body.p_payload)}) as result`;
            return row.result;
          }
          assert.equal(url.pathname,'/rest/v1/rpc/affairs_manage_service_record');
          const [row]=await tx`select public.affairs_manage_service_record(${body.p_kind},${tx.json(body.p_payload)}) as result`;
          return row.result;
        });
        return Response.json(result);
      }catch(error){
        const codes={PT409:409,'22023':400,'42501':403};
        assert.ok(Object.hasOwn(codes,error.code),error.message);
        return Response.json({code:error.code},{status:codes[error.code]});
      }
    });
    const [{default:assistant},{default:action}]=await Promise.all([
      import('../../api/affairs-assistant.ts'),import('../../api/affairs-action.ts'),
    ]);
    const proposal=await invoke(assistant,{question:'Save a sick leave draft for 2026-11-19, periods "1–2", reason "private-notes-marker".',
      route:'/school-affairs/services/leave/history'},owner[0].token);
    assert.equal(proposal.code,200);
    assert.deepEqual(proposal.result.verification,{status:'verified',attempts:1});
    const {requestId,payload}=proposal.result.proposedAction;
    assert.equal(writes,0);
    assert.equal((await sql`select id from public.affairs_service_records`).length,0);
    const confirmed={kind,payload,requestId};
    assert.equal((await invoke(action,confirmed)).code,401);
    assert.equal((await invoke(action,confirmed,owner[2].token)).code,401);
    assert.equal((await invoke(action,{kind,payload},owner[0].token)).code,400);
    assert.equal((await invoke(action,{...confirmed,payload:{...payload,status:'filed'}},owner[0].token)).code,400);
    assert.equal(writes,0);

    const receipts=await Promise.all([invoke(action,confirmed,owner[0].token),invoke(action,confirmed,owner[0].token)]);
    const receipt={code:200,result:{id:requestId,kind,summary:'Saved your Student Leave draft'}};
    assert.deepEqual(receipts,[receipt,receipt]);
    assert.equal((await invoke(action,{...confirmed,payload:{...payload,periods:'3'}},owner[0].token)).code,409);
    assert.equal((await invoke(action,confirmed,owner[1].token)).code,409);
    await assert.rejects(withCaller(owner[2].id,tx=>tx`select public.affairs_create_student_leave_draft(${randomUUID()},${tx.json(payload)})`),
      error=>error.code==='42501');
    await assert.rejects(withCaller(owner[0].id,tx=>tx`select public.affairs_reviewed_action(${requestId},'create_task',
      '{"title":"improperly reused operation"}'::jsonb)`),error=>error.code==='PT409');
    const read=actor=>withCaller(actor.id,tx=>tx`select id,status,starts_on::text,ends_on::text,leave_category,periods,notes,review_request_id
      from public.affairs_service_records where id=${requestId}`);
    assert.deepEqual([...(await read(owner[0]))],[{id:requestId,status:'draft',starts_on:'2026-11-19',ends_on:'2026-11-19',
      leave_category:'sick',periods:'1–2',notes:'private-notes-marker',review_request_id:null}]);
    assert.equal((await read(owner[1])).length,0);
    assert.equal((await sql`select id from public.affairs_service_requests`).length,0);
    const audit=await sql`select user_id,action_kind from public.affairs_agent_audit where target_id=${requestId}`;
    assert.deepEqual([...audit],
      [{user_id:owner[0].id,action_kind:kind}]);
    const [operation]=await sql`select user_id,payload from private.affairs_assistant_operations where request_id=${requestId}`;
    assert.equal(operation.user_id,owner[0].id);
    assert.deepEqual(Object.keys(operation.payload),['sha256']);
    assert.match(operation.payload.sha256,/^[a-f0-9]{64}$/u);

    const manualId=randomUUID();
    assert.equal((await invoke(action,{kind:'save_service_record',payload:{...payload,id:manualId,service_key:'leave',
      record_type:'leave',title:'Manual leave draft',status:'draft'}},owner[1].token)).code,200);
    assert.equal((await sql`select id from public.affairs_service_records`).length,2);
    const invalidPayload={...payload,starts_on:'2026-02-30'};
    await assert.rejects(withCaller(owner[0].id,tx=>tx`select public.affairs_create_student_leave_draft(${randomUUID()},${tx.json(invalidPayload)})`),
      error=>error.code==='22023');
  });
