import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import actionHandler from '../../api/affairs-action.ts';
import assistantHandler from '../../api/affairs-assistant.ts';
import {assertConfirmedAssignmentTrackerSchema,checkConfirmedAssignmentTrackerRoundTrip,confirmedAssignmentTrackerContract,confirmedAssignmentTrackerDigest,
  confirmedAssignmentTrackerMode,confirmedAssignmentTrackerPlan,deleteConfirmedAssignmentTrackerRows,observeConfirmedAssignmentTrackerCallers,
  readConfirmedAssignmentTrackerRows,seedConfirmedAssignmentTrackerRows,verifyConfirmedAssignmentTrackerAbsent} from './confirmed-assignment-tracker-preview.mjs';
import {initializeDtmAssignmentListStudent} from './dtm-assignment-list-live.mjs';
import {prepare,runConfirmedAssignmentTrackerPreview} from './live-fixtures.mjs';

const runtime=process.env.STU_TRACKER_TEST_PGLITE_ENTRY;
const runId='d7a10000-0000-4000-8000-000000000001';
const owners={A:{id:'d7a10000-0000-4000-8000-000000000002',email:'tracker-a@example.invalid',runMarker:runId},
  B:{id:'d7a20000-0000-4000-8000-000000000003',email:'tracker-b@example.invalid',runMarker:runId}};
const students={A:'d7a10000-0000-4000-8000-000000000004',B:'d7a10000-0000-4000-8000-000000000005'};
const origin='https://stdedu-aaabbb111-v1-d286.vercel.app',revision='a'.repeat(40);
const project='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-tracker-publishable-key';
const users=Object.values(owners).map(owner=>({id:owner.id,token:'synthetic-tracker-caller-'+owner.id}));
const readResponse=async(response,_url,maxBytes,status=200)=>{
  assert.equal(response.status,status);
  const text=await response.text();assert.ok(Buffer.byteLength(text)<=maxBytes);
  return JSON.parse(text);
};

test('tracker packet freezes a distinct sample, graded and crossed owner and refuses alternate deployments',async()=>{
  const plan=confirmedAssignmentTrackerPlan(runId,owners,students);
  assert.deepEqual(plan,confirmedAssignmentTrackerPlan(runId,owners,students));
  assert.equal(confirmedAssignmentTrackerContract.question,'Mark my personal assignment Index plan as submitted.');
  assert.equal(confirmedAssignmentTrackerContract.route,'/dtm/assignments');
  assert.throws(()=>confirmedAssignmentTrackerPlan(runId,owners,{...students,B:students.A}),/fixture owners/u);
  assert.throws(()=>confirmedAssignmentTrackerPlan(runId,{...owners,A:{...owners.A,email:'person@university.example'}},students),/invalid_owners/u);
  const row=target=>plan.assignments.find(row=>row.id===plan.targets[target]);
  assert.equal(row('own').status,'open');
  assert.equal(row('sample').source_mode,'sample');
  assert.equal(row('graded').status,'graded');
  assert.equal(row('other').student_id,students.B);
  assert.equal(row('other').status,'submitted');
  await assert.rejects(runConfirmedAssignmentTrackerPreview({origin:'https://stu.best',sourceRevision:revision}),{code:'fixture-config'});
  await assert.rejects(runConfirmedAssignmentTrackerPreview({origin,sourceRevision:'partial'}),{code:'fixture-config'});
  const args={runId,cases:[],now:'2026-11-16T00:00:00Z',origin,approvedPreviewOrigin:origin,
    expectedReleaseRevision:revision,fixtureMode:confirmedAssignmentTrackerMode};
  await assert.rejects(prepare(args),{code:'fixture-config'});
  const blocked=()=>assert.fail('Alternate transport must remain unused.');
  await assert.rejects(prepare({...args,applicationFetch:blocked,previewReadbackFetch:blocked}),{code:'fixture-config'});
  await assert.rejects(prepare({...args,cases:[{id:'different'}],previewReadbackFetch:blocked}),{code:'fixture-config'});
});

function pgliteSql(db){
  return function sql(template,...values){
    if(!template.raw)return {list:template};
    const params=[],param=value=>'$'+params.push(value);
    const list=value=>{
      if(!Array.isArray(value?.list))return param(value);
      const rows=value.list;
      if(typeof rows[0]!=='object')return '('+rows.map(param).join(',')+')';
      const columns=Object.keys(rows[0]);
      return '('+columns.join(',')+') values '+rows.map(row=>'('+columns.map(key=>param(row[key])).join(',')+')').join(',');
    };
    const statement=template.reduce((out,part,index)=>out+(index?list(values[index-1]):'')+part,'');
    return db.query(statement,params).then(result=>result.rows);
  };
}

async function transaction(db,work,user){
  await db.exec('begin');
  try{
    if(user){
      await db.exec('set local role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    }
    const result=await work();
    await db.exec('commit');
    return result;
  }catch(error){
    await db.exec('rollback');
    throw error;
  }
}

function scopedRead(db,url,table){
  assert.ok(['affairs_profiles','affairs_students','affairs_assignments','dtm_courses'].includes(table));
  const select=url.searchParams.get('select');
  assert.match(select,/^[a-z_,]+$/u);
  const values=[],where=[];
  for(const [field,value] of url.searchParams){
    if(['select','order','limit'].includes(field))continue;
    assert.ok(['user_id','student_id','dtm_course_id','id','title'].includes(field));
    if(field==='dtm_course_id'&&value==='not.is.null')where.push(field+' is not null');
    else if(value.startsWith('eq.'))where.push(field+'=$'+values.push(value.slice(3)));
    else{
      assert.match(value,/^in\.\([a-f0-9,-]+\)$/u);
      where.push(field+' in ('+value.slice(4,-1).split(',').map(id=>'$'+values.push(id)).join(',')+')');
    }
  }
  const limit=Number(url.searchParams.get('limit'));
  assert.ok(where.length&&Number.isInteger(limit)&&limit>=1&&limit<=10);
  assert.ok([null,'id.asc'].includes(url.searchParams.get('order')));
  return db.query('select '+select+' from public.'+table+' where '+where.join(' and ')
    +(url.searchParams.has('order')?' order by id':'')+' limit '+limit,values).then(result=>result.rows);
}

test('actual assistant and action handlers prove the confirmed tracker with migrated PostgreSQL and independent caller RLS', {skip:!runtime},async t=>{
  assert.ok(isAbsolute(runtime),'Supply an existing PGlite runtime entry.');
  const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
  const previousUrl=process.env.VITE_SUPABASE_URL,previousKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL=project;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  t.after(async()=>{
    if(previousUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=previousUrl;
    if(previousKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=previousKey;
    await db.close();
  });
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private; create schema storage; create schema supabase_migrations;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
    create table auth.sessions(user_id uuid references auth.users on delete cascade);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer);
    create table storage.objects(id uuid primary key,bucket_id text,name text,metadata jsonb);
    create table supabase_migrations.schema_migrations(version text primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated; set timezone='UTC';`);
  for(const migration of ['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
    '20261106010000_affairs_academic_records.sql','20261112010000_student_workspace.sql','20261112120000_assistant_conversations.sql',
    '20261112150000_dtm_submissions.sql','20261114000000_dtm_grade_reports.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));
  const sql=pgliteSql(db);
  await assert.rejects(assertConfirmedAssignmentTrackerSchema(sql),/applied reviewed action/u);
  await db.query('insert into supabase_migrations.schema_migrations values ($1)',['20261112120000']);
  await assertConfirmedAssignmentTrackerSchema(sql);
  for(const owner of Object.values(owners)){
    await db.query('insert into auth.users values($1,$2,now(),$3)',[owner.id,owner.email,{assistant_evaluation_run:runId}]);
    await db.query('insert into auth.identities values($1,$2)',[owner.id,'google']);
  }
  const writes=[],providerRequests=[];
  const directFetch=async(input,init)=>{
    const url=new URL(String(input)),headers=new Headers(init.headers);
    if(url.origin!==project){
      providerRequests.push(url.pathname);
      assert.fail('A deterministic action should only call the controlled database.');
    }
    assert.equal(headers.get('apikey'),key);
    const user=users.find(row=>headers.get('authorization')==='Bearer '+row.token);
    assert.ok(user);
    if(url.pathname==='/auth/v1/user')return Response.json({id:user.id,identities:[{provider:'google'}]});
    try{
      return await transaction(db,async()=>{
        if(url.pathname==='/rest/v1/rpc/affairs_initialize_account'){
          assert.equal(init.method,'POST');
          const {rows}=await db.query('select * from public.affairs_initialize_account()');
          return Response.json(rows[0]);
        }
        if(url.pathname==='/rest/v1/rpc/affairs_reviewed_action'){
          assert.equal(init.method,'POST');
          const payload=JSON.parse(init.body);
          assert.deepEqual(Object.keys(payload).sort(),['p_kind','p_payload','p_request_id']);
          writes.push({user:user.id,...payload});
          const {rows}=await db.query('select public.affairs_reviewed_action($1::uuid,$2::text,$3::jsonb) as value',
            [payload.p_request_id,payload.p_kind,JSON.stringify(payload.p_payload)]);
          return Response.json(rows[0].value);
        }
        assert.equal(init.method,'GET');
        return Response.json(await scopedRead(db,url,url.pathname.replace('/rest/v1/','')));
      },user.id);
    }catch(error){
      if(error.code==='42501'||error.code==='PT409')
        return Response.json({code:error.code},{status:error.code==='42501'?403:409});
      throw error;
    }
  };
  t.mock.method(globalThis,'fetch',directFetch);
  const person={};
  for(const [index,user] of users.entries())
    person[index===0?'A':'B']=await initializeDtmAssignmentListStudent(user,{publishable:key,fetchImpl:directFetch,readResponse});
  const plan=confirmedAssignmentTrackerPlan(runId,owners,person);
  await transaction(db,()=>seedConfirmedAssignmentTrackerRows(sql,plan));
  await assert.rejects(transaction(db,()=>seedConfirmedAssignmentTrackerRows(sql,plan)),/empty fixture targets/u);
  const invoke=async(handler,role,input)=>{
    let status,body;
    const headers=new Headers();
    const response={setHeader(name,value){headers.set(name,value);},status(code){status=code;return response;},json(value){body=value;}};
    await handler({method:'POST',headers:{authorization:'Bearer '+users.find(row=>row.id===owners[role].id).token},body:input},response);
    return {status,body,...(handler===assistantHandler?{correlationId:headers.get('x-assistant-request-id')}:{})};
  };
  const read=async()=>{
    const state=await readConfirmedAssignmentTrackerRows(sql,plan);
    const callers=await observeConfirmedAssignmentTrackerCallers(plan,users,state,{origin:project,publishable:key,fetchImpl:directFetch,readResponse});
    return {state,callers};
  };
  const journal=[];
  const result=await checkConfirmedAssignmentTrackerRoundTrip({plan,read,
    propose:async(role,question)=>{
      const response=await invoke(assistantHandler,role,{question,route:confirmedAssignmentTrackerContract.route,stream:false,consentedResearchUse:false});
      assert.equal(writes.length,0);
      return response;
    },
    submit:async(role,command,stage)=>{
      journal.push({stage,userId:owners[role].id,requestId:command.requestId,kind:command.kind,payloadDigest:confirmedAssignmentTrackerDigest(command.payload)});
      return invoke(actionHandler,role,command);
    },
  });
  assert.equal(result.passed,true);
  assert.equal(result.proposalsChecked,confirmedAssignmentTrackerContract.proposals);
  assert.equal(result.actionRequestsChecked,confirmedAssignmentTrackerContract.confirmationRequests);
  assert.equal(writes.length,confirmedAssignmentTrackerContract.confirmationRequests);
  assert.deepEqual(writes.map(row=>row.user),['B','A','A','A','A','A','A','B'].map(role=>owners[role].id));
  assert.deepEqual(writes[3],writes[4]);
  assert.deepEqual(providerRequests,[]);
  assert.doesNotMatch(JSON.stringify(result),/Index plan|example\.invalid|synthetic-tracker-caller/u);

  const changed=await read();
  await assert.rejects(transaction(db,()=>deleteConfirmedAssignmentTrackerRows(sql,plan,[])),/journaled confirmation/u);
  assert.deepEqual(await read(),changed);
  await db.query('update public.affairs_assignments set details=$1 where id=$2',['Unexpected row change',plan.targets.other]);
  await assert.rejects(transaction(db,()=>deleteConfirmedAssignmentTrackerRows(sql,plan,journal)),/one owned tracker status/u);
  await db.query('update public.affairs_assignments set details=$1 where id=$2',[plan.assignments[0].details,plan.targets.other]);
  assert.deepEqual(await read(),changed);
  const unexpectedFile='d7a10000-0000-4000-8000-000000000006';
  await db.query('insert into storage.objects(id,bucket_id,name) values($1,$2,$3)',
    [unexpectedFile,'dtm-submissions',owners.A.id+'/unexpected/file']);
  await assert.rejects(transaction(db,()=>deleteConfirmedAssignmentTrackerRows(sql,plan,journal)),/without files or grades/u);
  await db.query('delete from storage.objects where id=$1',[unexpectedFile]);
  await transaction(db,()=>deleteConfirmedAssignmentTrackerRows(sql,plan,journal));
  await transaction(db,()=>deleteConfirmedAssignmentTrackerRows(sql,plan,journal));
  await assert.rejects(verifyConfirmedAssignmentTrackerAbsent(sql,plan),/identity cleanup/u);
  for(const {id} of users)await db.query('delete from auth.users where id=$1',[id]);
  await verifyConfirmedAssignmentTrackerAbsent(sql,plan);
});
