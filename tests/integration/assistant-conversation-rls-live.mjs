import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {boundedAssistantText} from '../../src/services/assistantActivityBudget.js';

// PREPARED ONLY: execution requires the root agent's serialized database lease.
// Exactly one explicit rollback mode and reviewed baseline counts are required.
// --preflight applies only migration190000 inside the fixture transaction.
// --rollback-regression requires190000 already recorded as applied.
// No HTTP, Auth API, Storage, university requests, token creation or commits.
const checkout='/Users/winsonbaring/Documents/GitHub/std_edu_ai-luxart0317';
const project='xiftudmvxphxcjtmfmib';
const migration='20261112190000';
const functionName='public.affairs_save_conversation(uuid,text,jsonb,integer)';

export function parseConversationRegressionOptions(argv) {
  assert.ok(Array.isArray(argv),'Arguments must be an array.');
  assert.equal(argv.filter(value=>value==='--preflight'||value==='--rollback-regression').length,1,'Choose exactly one rollback mode.');
  const count=name=>{
    const values=argv.filter(value=>value.startsWith(name+'='));
    assert.equal(values.length,1,'Supply each reviewed baseline count exactly once.');
    const raw=values[0].slice(name.length+1);
    assert.match(raw,/^[1-9][0-9]*$/,'Baseline counts must be positive integers.');
    const value=Number(raw);assert.ok(Number.isSafeInteger(value),'Baseline count is too large.');return value;
  };
  assert.ok(argv.every(value=>value==='--preflight'||value==='--rollback-regression'||/^--expected-(?:migrations|rls)=/.test(value)),'Unknown rollback-harness argument.');
  return {preflight:argv.includes('--preflight'),expectedMigrations:count('--expected-migrations'),expectedRls:count('--expected-rls')};
}

// Fixtures are synthetic and pure so they can be inspected without loading any
// credential, constructing a database client or issuing a network request.
export function conversationRegressionFixtures() {
  const activity=Array.from({length:40},(_,index)=>({kind:`account-read:synthetic${index}:1`,label:`Checked synthetic record ${index}`,detail:'Read only the signed-in synthetic account record.',status:'complete'}));
  const answer='A'.repeat(8000);
  const messages=sanitizeStoredConversation([{id:'u',role:'user',content:'Show my synthetic records.',images:[{name:'synthetic.txt',dataUrl:'DO_NOT_STORE_IMAGE'}]},
    {id:'a',role:'assistant',content:answer,phase:'complete',activity,result:{answer,status:'answered',citations:[],activity,
      verification:{status:'verified',attempts:1,reason:'DO_NOT_STORE_REASON'},reasoning:'DO_NOT_STORE_REASON',proposedAction:{kind:'create_task',payload:{title:'DO_NOT_STORE_ACTION'}}}}]);
  const emoji=sanitizeStoredConversation([{id:'u',role:'user',content:'Unicode storage'},
    {id:'a',role:'assistant',content:'x'.repeat(7999)+'🙂',result:{answer:'a\u0000\ud800b\udc00🙂',status:'answered',citations:[]}}]);
  const maximum=Array.from({length:24},(_,index)=>({id:`limit-${index}`,role:index%2?'assistant':'user',content:''}));
  let remaining=190000-jsonbBytes(maximum);
  for(const row of maximum){const length=Math.min(8000,remaining);row.content='B'.repeat(length);remaining-=length;}
  assert.equal(remaining,0);assert.equal(jsonbBytes(maximum),190000);
  const overBytes=structuredClone(maximum);overBytes.at(-1).content+='B';
  assert.equal(jsonbBytes(overBytes),190001);
  return {activity,answer,messages,emoji,maximum,overBytes,title:boundedAssistantText('Synthetic\u0000 chat \ud83d',100)};
}

function jsonbBytes(value) {
  const text=JSON.stringify(value).replace(/("(?:[^"\\]|\\.)*")|([:,])/g,(_match,quoted,separator)=>quoted??separator+' ');
  return Buffer.byteLength(text,'utf8');
}

async function run(options) {
  // Configuration and credentials are resolved only after all explicit guards.
  assert.equal(await realpath(process.cwd()),await realpath(checkout),'Use the exact reviewed client checkout.');
  assert.equal(await realpath(fileURLToPath(new URL('../..',import.meta.url))),await realpath(checkout),'Harness must belong to the exact client checkout.');
  const deployment=JSON.parse(await readFile('deployment.json','utf8'));
  assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,project);
  assert.equal(typeof deployment.supabase.ownerEmail,'string');assert.ok(deployment.supabase.ownerEmail.length>0);
  const env=deploymentEnvironment();
  for(const name of ['SUPABASE_URL','VITE_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL'])if(env[name]){
    let target;try{target=new URL(env[name]);}catch{throw new Error('Invalid client project URL.');}
    assert.equal(target.protocol,'https:');assert.equal(target.hostname,project+'.supabase.co');
  }
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
  let target;try{target=new URL(connection);}catch{throw new Error('Client database connection unavailable.');}
  assert.ok(['postgres:','postgresql:'].includes(target.protocol),'A PostgreSQL connection is required.');
  assert.ok(target.hostname===`db.${project}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(target.username).endsWith('.'+project),'Use only the exact client database.');
  const {default:postgres}=await import('postgres');
  const sql=postgres(connection,{max:1,connect_timeout:10,idle_timeout:0,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
  const users=Array.from({length:3},()=>randomUUID()),[one,two,nonGoogle]=users;
  const ids=Array.from({length:8},()=>randomUUID()),fixtures=conversationRegressionFixtures();
  const rollback=Symbol('rollback conversation fixtures'),checks=[];
  let before,originalFunction,owner,rolledBack=false,rollbackVerified=false,timedOut=false,failure=null,stage='connection settings';
  const timer=setTimeout(()=>{timedOut=true;void sql.end({timeout:5});},120000);timer.unref();
  const baseline=async tx=>(await tx`select pg_backend_pid() as backend,
    (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables,
    (select count(*)::int from auth.users) as users,(select count(*)::int from auth.identities) as identities,
    (select count(*)::int from public.affairs_profiles) as profiles,(select count(*)::int from public.affairs_students) as students,
    (select count(*)::int from public.affairs_conversations) as conversations,
    (select count(*)::int from private.affairs_assistant_operations) as operations`)[0];
  const functionState=async tx=>(await tx`select pg_get_functiondef(p.oid) as definition,p.proacl::text as acl,p.proowner::text as owner
    from pg_proc p where p.oid=${functionName}::regprocedure`)[0];
  const fingerprint=async(tx,id)=>(await tx`select u.id,md5(to_jsonb(u)::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb)::text) from public.affairs_conversations c where c.user_id=u.id) as conversations_hash
    from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
  const role=async(tx,id)=>{assert.ok(users.includes(id)||id===owner?.id,'Only fixture accounts or read-only owner checks are permitted.');await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${id},true)`;};
  const denied=(tx,operation,code='42501')=>assert.rejects(tx.savepoint(operation),error=>error?.code===code,`Expected SQLSTATE ${code}.`);
  const save=async(tx,id,title,messages,version)=>(await tx`select public.affairs_save_conversation(${id}::uuid,${title}::text,${tx.json(messages)}::jsonb,${version}::integer) as result`)[0].result;
  const read=async(tx,id)=>await tx`select id,title,messages,version from public.affairs_conversations where id=${id}::uuid`;
  try{
    await sql.unsafe("set statement_timeout='20s';set lock_timeout='8s';set idle_in_transaction_session_timeout='30s'");
    stage='reviewed baseline';before=await baseline(sql);
    assert.equal(before.migrations,options.expectedMigrations);assert.equal(before.rls_tables,options.expectedRls);
    originalFunction=await functionState(sql);assert.ok(originalFunction?.definition);
    const applied=(await sql`select exists(select 1 from supabase_migrations.schema_migrations where version=${migration}) as present`)[0].present;
    assert.equal(applied,!options.preflight,'The selected rollback mode must match migration history.');
    assert.ok(originalFunction.definition.includes(`char_length(v_message->>'content')>${options.preflight?7000:8000}`));
    const [administrator]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.role='admin'
      where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
    assert.ok(administrator,'Existing verified Google administrator required; no owner record will be created or changed.');
    owner=await fingerprint(sql,administrator.id);assert.ok(!users.includes(owner.id));
    await sql.begin(async tx=>{
      await tx.unsafe("set local statement_timeout='20s';set local lock_timeout='8s';set local idle_in_transaction_session_timeout='30s'");
      stage='rollback-only migration';if(options.preflight)await tx.unsafe(await readFile('supabase/migrations/20261112190000_assistant_conversation_content_limit.sql','utf8'));
      assert.ok((await functionState(tx)).definition.includes("char_length(v_message->>'content')>8000"));
      assert.deepEqual(await baseline(tx),before);
      stage='synthetic account initialization';for(const id of users){
        const google=id!==nonGoogle,email=`conversation-qa-${id}@example.invalid`;
        await tx`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          values('00000000-0000-0000-0000-000000000000',${id},'authenticated','authenticated',${email},now(),
            ${tx.json(google?{provider:'google',providers:['google']}:{provider:'email',providers:['email']})},'{"full_name":"Synthetic Conversation QA"}',now(),now())`;
        await tx`insert into auth.identities(provider_id,user_id,identity_data,provider) values(${id},${id},${tx.json({sub:id,email,email_verified:true})},${google?'google':'email'})`;
        if(google){await role(tx,id);await tx`select public.affairs_initialize_account()`;await tx.unsafe('reset role');}
      }
      stage='saved answer and activity';await role(tx,one);
      const first=await save(tx,ids[0],fixtures.title,fixtures.messages,0);
      assert.equal(first.id,ids[0]);assert.equal(first.version,1);assert.equal(Object.hasOwn(first,'user_id'),false);
      assert.deepEqual(first.messages,fixtures.messages);assert.equal(first.messages[1].content.length,8000);
      assert.equal(first.messages[1].activity.length,40);assert.deepEqual(first.messages[1].activity,fixtures.activity);
      assert.doesNotMatch(JSON.stringify(first.messages),/DO_NOT_STORE|proposedAction|dataUrl|reasoning/);
      assert.equal(first.messages[1].actionExpired,true);
      const [reopened]=await read(tx,ids[0]);assert.equal(reopened.title,fixtures.title.trim());assert.deepEqual(reopened.messages,fixtures.messages);
      assert.deepEqual(await save(tx,ids[0],fixtures.title,fixtures.messages,0),first);
      const updated=structuredClone(fixtures.messages);updated[1].content='Updated synthetic answer.';updated[1].result.answer=updated[1].content;
      const second=await save(tx,ids[0],fixtures.title,updated,1);assert.equal(second.version,2);
      assert.deepEqual(await save(tx,ids[0],fixtures.title,updated,1),second);
      await denied(tx,t=>save(t,ids[0],fixtures.title,fixtures.messages,1),'PT409');
      await denied(tx,t=>save(t,ids[0],fixtures.title,fixtures.messages,0),'PT409');
      assert.deepEqual((await read(tx,ids[0]))[0].messages,updated);checks.push('8000-character-answer-40-observed-steps-reopen-replay-and-stale-edit');

      stage='Unicode and raw SQL limits';const unicode=await save(tx,ids[1],'Unicode',fixtures.emoji,0);
      assert.equal(unicode.messages[1].content,'x'.repeat(7999));assert.equal(unicode.messages[1].result.answer,'a\uFFFDb\uFFFD🙂');
      assert.equal((await tx`select octet_length(${tx.json(fixtures.maximum)}::jsonb::text) as bytes`)[0].bytes,190000);
      const maximum=await save(tx,ids[2],'Exact SQL byte limit',fixtures.maximum,0);assert.equal(maximum.messages.length,24);
      assert.equal((await tx`select octet_length(messages::text) as bytes from public.affairs_conversations where id=${ids[2]}`)[0].bytes,190000);
      const invalid=[fixtures.overBytes,Array.from({length:25},(_,i)=>({id:String(i),role:i%2?'assistant':'user',content:''})),
        [{id:'u',role:'user',content:'x'.repeat(8001)}],[{id:'a',role:'assistant',content:'text',result:{proposedAction:{kind:'create_task'}}}],
        [{id:'u',role:'user',content:'text',images:[{name:'synthetic',dataUrl:'data:image/png;base64,AA=='}]}],
        [{id:'x',role:'system',content:'text'}],[{id:'x',role:'user',content:123}],[{id:null,role:'user',content:'text'}]];
      for(const value of invalid)await denied(tx,t=>save(t,ids[3],'Rejected fixture',value,0),'22023');
      for(const title of ['', ' ', 'x'.repeat(101)])await denied(tx,t=>save(t,ids[3],title,[],0),'22023');
      await denied(tx,t=>save(t,null,'Rejected fixture',[],0),'22023');
      for(const version of [null,-1])await denied(tx,t=>save(t,ids[3],'Rejected fixture',[],version),'22023');
      assert.equal((await read(tx,ids[3])).length,0);checks.push('Unicode-sanitizer-and-exact-24-message-190000-JSONB-byte-payload-denials');

      stage='own and cross-account RLS';await role(tx,two);
      const other=await save(tx,ids[4],'Second synthetic account',[{id:'u',role:'user',content:'Other owned message'}],0);assert.equal(other.version,1);
      assert.equal((await read(tx,ids[0])).length,0);await denied(tx,t=>save(t,ids[0],'Cross-account overwrite',[],0));
      assert.equal((await tx`delete from public.affairs_conversations where id=${ids[0]} returning id`).length,0);
      await role(tx,one);assert.equal((await read(tx,ids[4])).length,0);
      await denied(tx,t=>t`insert into public.affairs_conversations(id,user_id,title,messages) values(${ids[5]},${one},'Direct write','[]')`);
      await denied(tx,t=>t`update public.affairs_conversations set title='Direct write' where id=${ids[0]}`);
      await role(tx,owner.id);assert.equal((await read(tx,ids[0])).length,0,'Administrators cannot read another account conversation.');
      await role(tx,nonGoogle);await denied(tx,t=>save(t,ids[5],'Non-Google',[],0));assert.equal((await read(tx,ids[0])).length,0);
      await tx.unsafe('set local role anon');await tx`select set_config('request.jwt.claim.sub','',true)`;
      await denied(tx,t=>save(t,ids[5],'Anonymous',[],0));await denied(tx,t=>read(t,ids[0]));
      await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub','',true)`;await denied(tx,t=>save(t,ids[5],'Missing identity',[],0));
      checks.push('owner-only-reads-writes-deletes-admin-cross-account-anonymous-and-nonGoogle-denials');

      stage='quota and deleted replay';await tx.unsafe('reset role');
      await tx`insert into public.affairs_conversations(id,user_id,title,messages)
        select gen_random_uuid(),${one}::uuid,'Synthetic quota row','[]'::jsonb
        from generate_series(1,100-(select count(*)::int from public.affairs_conversations where user_id=${one}))`;
      await role(tx,one);assert.equal((await tx`select count(*)::int as count from public.affairs_conversations`)[0].count,100);
      await denied(tx,t=>save(t,ids[6],'Quota overflow',[],0),'PT409');
      const third=await save(tx,ids[0],'Existing row at quota',updated,2);assert.equal(third.version,3);
      assert.equal((await tx`delete from public.affairs_conversations where id=${ids[0]} returning id`).length,1);
      await denied(tx,t=>save(t,ids[0],'Existing row at quota',updated,3),'PT409');assert.equal((await read(tx,ids[0])).length,0);
      await tx.unsafe('reset role');assert.deepEqual(await fingerprint(tx,owner.id),owner);checks.push('100-conversation-quota-existing-edit-own-delete-no-stale-resurrection');
      throw rollback;
    });
  }catch(error){if(error===rollback)rolledBack=true;else failure={stage,code:/^[A-Z0-9]{5}$/.test(error?.code||'')?error.code:'ASSERTION_OR_RUNTIME'};}
  finally{
    try{
      if(before&&!timedOut){
        stage='rollback verification';assert.deepEqual(await baseline(sql),before);assert.deepEqual(await functionState(sql),originalFunction);
        for(const table of ['auth.users','auth.identities','public.affairs_profiles','public.affairs_students','public.affairs_conversations']){
          const column=table==='auth.users'?'id':'user_id';
          assert.equal((await sql.unsafe(`select count(*)::int as count from ${table} where ${column}=any($1::uuid[])`,[users]))[0].count,0);
        }
        assert.equal((await sql`select count(*)::int as count from public.affairs_conversations where id=any(${ids}::uuid[])`)[0].count,0);
        if(owner)assert.deepEqual(await fingerprint(sql,owner.id),owner);
        rollbackVerified=true;checks.push('same-connection-exact-function-ACL-baseline-and-owner-restored-no-synthetic-rows');
      }
    }catch(error){failure={stage:'rollback verification',code:/^[A-Z0-9]{5}$/.test(error?.code||'')?error.code:'ASSERTION_OR_RUNTIME'};}
    finally{clearTimeout(timer);await sql.end({timeout:5}).catch(()=>{failure={stage:'connection close',code:'CLOSE_FAILED'};});}
  }
  const passed=rolledBack&&rollbackVerified&&!timedOut&&!failure;
  if(!passed)process.exitCode=1;
  console.log(JSON.stringify({status:passed?'passed':'failed',mode:options.preflight?'rollback_preflight':'rollback_regression',checks,
    rolledBack,rollbackVerified,ownerUnchanged:rollbackVerified&&Boolean(owner),timedOut,failure,
    capabilities:'SQL transaction and RLS only; no real JWT, HTTP, browser, parallel-race or external-service verification.'}));
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{await run(parseConversationRegressionOptions(process.argv.slice(2)));}
  catch{process.exitCode=1;console.error(JSON.stringify({status:'failed',stage:'configuration guards',databaseExecution:'not started or connection setup failed'}));}
}
