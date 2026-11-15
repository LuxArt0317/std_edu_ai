import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import dataHandler from '../../api/affairs-data.ts';
import {certificateAwardQuestion,certificateAwardRecordId} from '../../server/certificateAwardsContract.js';
import {bindCertificateAwardBrowserCase,bindCertificateAwardPreviewCases,buildCertificateAwardPreviewPlan,certificateAwardPreviewManifest,certificateAwardPreviewMode,certificateBrowserCaseIds,
  deleteCertificateAwardPreview,observeCertificateAwardPreview,observeCertificateAwardPreviewCallers,readCertificateAwardPreviewCatalog,
  requestCertificateAwardPreviewCase,seedCertificateAwardPreview,verifyCertificateAwardPreviewAbsent} from './certificate-award-preview.mjs';
import {prepare,runCertificateAwardPreview} from './live-fixtures.mjs';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';

const runtime=process.env.STU_CERTIFICATE_TEST_PGLITE_ENTRY;
const runId='4ce10000-0000-4000-8000-000000000001';
const owners={A:{id:'4ce10000-0000-4000-8000-000000000002',email:'certificate-a@example.invalid',runMarker:runId},
  B:{id:'4ce10000-0000-4000-8000-000000000003',email:'certificate-b@example.invalid',runMarker:runId}};
const origin='https://stdedu-aaabbb111-v1-d286.vercel.app',revision='a'.repeat(40);
const project='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-certificate-publishable-key';
const users=Object.values(owners).map(owner=>({id:owner.id,token:`synthetic-certificate-caller-${owner.id}`}));
const readResponse=async(response,_url,maxBytes,status)=>{
  assert.equal(response.status,status);
  const text=await response.text();assert.ok(Buffer.byteLength(text)<=maxBytes);
  return JSON.parse(text);
};

test('the packet freezes caller, route, language and positive and denied status cases',()=>{
  const plan=buildCertificateAwardPreviewPlan(runId,owners,'d'.repeat(64)),cases=bindCertificateAwardPreviewCases(plan);
  assert.deepEqual(cases.map(row=>[row.role,row.testCase.language,row.testCase.expected.statusCode,row.recordId]),[
    ['A','en',200,plan.targets.selected],['A','zh',200,plan.targets.selected],['B','en',200,plan.targets.second],
    ['A','en',404,plan.targets.second],['B','zh',404,plan.targets.selected],['A','en',404,plan.targets.missing],
    ['A','en',200,null],['A','en',200,plan.targets.newer],
  ]);
  assert.deepEqual(cases.map(row=>row.testCase.id),certificateAwardPreviewManifest().map(row=>row.id));
  for(const {testCase,recordId} of cases){
    assert.equal(certificateAwardQuestion(testCase.question),'status');
    assert.equal(certificateAwardRecordId(testCase.route),recordId);
  }
  assert.equal(cases.at(-2).expectedRows.length,2);
  assert.match(cases[0].expectedRows[0],/Under review · NT\$0$/u);
  assert.match(cases.at(-2).expectedRows[0],/Approved · NT\$900$/u);
  assert.deepEqual(cases.filter(row=>row.bankReceipt),[cases.at(-1)]);
  assert.deepEqual(cases.at(-1).expectedRows,['- 財產保險業務員專業科目資格測驗 · Approved · NT$900']);
  assert.throws(()=>bindCertificateAwardPreviewCases({...plan,targets:{...plan.targets,selected:plan.targets.newer}}));
});

test('the shared lifecycle and operator refuse alternate targets or case payloads before fixture setup',async()=>{
  await assert.rejects(runCertificateAwardPreview({origin:'https://stu.best',sourceRevision:revision}),{code:'fixture-config'});
  await assert.rejects(runCertificateAwardPreview({origin,sourceRevision:'partial'}),{code:'fixture-config'});
  const prepareArgs={runId,cases:[],now:'2026-11-16T00:00:00Z',origin,approvedPreviewOrigin:origin,
    expectedReleaseRevision:revision,fixtureMode:certificateAwardPreviewMode};
  await assert.rejects(prepare(prepareArgs),{code:'fixture-config'});
  const blocked=()=>assert.fail('No alternate request may reach the Preview.');
  await assert.rejects(prepare({...prepareArgs,approvedPreviewOrigin:'https://stu.best',previewReadbackFetch:blocked}),{code:'fixture-config'});
  await assert.rejects(prepare({...prepareArgs,cases:[{id:'altered'}],previewReadbackFetch:blocked}),{code:'fixture-config'});
});

function pgliteSql(db){
  return function sql(template,...values){
    if(!template.raw)return {list:template};
    const parameters=[],param=value=>'$'+parameters.push(value);
    function fragment(value){
      if(!Array.isArray(value?.list))return param(value);
      const items=value.list;
      if(typeof items[0]!=='object')return '('+items.map(param).join(',')+')';
      const columns=Object.keys(items[0]);
      return '('+columns.join(',')+') values '+items.map(item=>'('+columns.map(column=>param(item[column])).join(',')+')').join(',');
    }
    const statement=template.reduce((out,part,index)=>out+(index?fragment(values[index-1]):'')+part,'');
    return db.query(statement,parameters).then(result=>result.rows);
  };
}

test('migrated PostgreSQL verifies the eight native cases and two original browser selectors with exact disposal', {skip:!runtime}, async t=>{
  assert.ok(isAbsolute(runtime),'Supply an existing PGlite runtime entry. This test never installs a package.');
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
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text,name text,metadata jsonb);
    create table supabase_migrations.schema_migrations(version text primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated; set timezone='UTC';`);
  for(const migration of ['20261105010000_school_affairs_workspace.sql','20261114210000_student_profile_confirmation.sql','20261114230000_certificate_awards.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));
  await db.query('insert into supabase_migrations.schema_migrations values ($1)',['20261114230000']);
  for(const owner of Object.values(owners)){
    await db.query('insert into auth.users values($1,$2,now(),$3)',[owner.id,owner.email,{assistant_evaluation_run:runId}]);
    await db.query('insert into auth.identities values($1,$2)',[owner.id,'google']);
  }
  const sql=pgliteSql(db),plan=buildCertificateAwardPreviewPlan(runId,owners,await readCertificateAwardPreviewCatalog(sql));
  await db.exec('begin');await seedCertificateAwardPreview(sql,plan);await db.exec('commit');
  const calls=[];
  const directFetch=async(input,init)=>{
    const url=new URL(String(input)),headers=new Headers(init.headers);
    assert.equal(url.origin,project);assert.equal(headers.get('apikey'),key);
    const user=users.find(user=>headers.get('authorization')==='Bearer '+user.token);
    assert.ok(user,'An RPC must use one exact caller token.');
    if(url.pathname==='/auth/v1/user')return Response.json({id:user.id,identities:[{provider:'google'}]});
    assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_certificate_awards');assert.equal(init.method,'POST');
    const request=JSON.parse(init.body);
    assert.deepEqual(Object.keys(request).sort(),['p_id','p_status_only','p_target']);assert.equal(request.p_target,null);
    calls.push({user:user.id,...request});
    await db.exec('begin; set local role authenticated');
    try{
      await db.query(`select set_config('request.jwt.claim.sub',$1,true)`,[user.id]);
      const {rows:[row]}=await db.query('select public.affairs_read_certificate_awards($1::uuid,$2::uuid,$3::boolean) as value',
        [request.p_target,request.p_id,request.p_status_only]);
      return Response.json(row.value);
    }catch(error){
      if(error.code==='PT404')return Response.json({code:error.code},{status:404});
      throw error;
    }finally{await db.exec('rollback');}
  };
  t.mock.method(globalThis,'fetch',directFetch);
  const appFetch=async(url,init)=>{
    assert.equal(url.origin,origin);assert.equal(url.pathname,'/api/affairs-data');assert.equal(init.method,'GET');
    assert.equal(init.body,undefined);
    let status,body;
    const response={setHeader(){},status(code){status=code;return response;},json(value){body=value;}};
    await dataHandler({method:init.method,query:Object.fromEntries(url.searchParams),headers:{authorization:init.headers.Authorization}},response);
    return Response.json(body,{status});
  };
  const observe=async()=>({sql:await observeCertificateAwardPreview(sql,plan),callers:await observeCertificateAwardPreviewCallers(plan,
    {users,origin:project,publishable:key,fetchImpl:directFetch,readResponse})});
  const initial=await observe();
  assert.deepEqual(initial.callers.map(({role,target,status})=>[role,target,status]),[
    ['A','selected',200],['A','second',404],['A','newer',200],['B','selected',404],['B','second',200],['B','newer',404],
  ]);
  const {questions}=await discoverClientDispatchSurfaces();
  const browserCases=certificateBrowserCaseIds.map(id=>questions.find(row=>row.id===id));
  const browserBindings=browserCases.map(row=>bindCertificateAwardBrowserCase(plan,row));
  assert.deepEqual(browserBindings.map(row=>[row.testCase.id,row.recordId,row.expectedRows.length,row.bankReceipt??false]),[
    [certificateBrowserCaseIds[0],null,2,false],[certificateBrowserCaseIds[1],null,2,true],
  ]);
  for(const testCase of browserCases){
    assert.throws(()=>bindCertificateAwardBrowserCase(plan,{...testCase,route:testCase.route+'/record/'+plan.targets.newer}));
    assert.throws(()=>bindCertificateAwardBrowserCase(plan,{...testCase,question:testCase.question+' Changed.'}));
  }
  for(const bound of [...bindCertificateAwardPreviewCases(plan),...browserBindings]){
    const token=users.find(user=>user.id===owners[bound.role].id).token,checkpoint=calls.length;
    const result=await requestCertificateAwardPreviewCase({bound,token,origin,fetchImpl:appFetch,readResponse});
    assert.equal(result.passed,true,JSON.stringify(result.checks.filter(check=>!check.passed)));
    assert.deepEqual(calls.slice(checkpoint),[{user:owners[bound.role].id,p_id:bound.recordId,p_target:null,p_status_only:bound.recordId===null}]);
    assert.deepEqual(await observe(),initial);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE NOTE|example\.invalid|synthetic-certificate-caller/u);
  }
  await db.query('update public.affairs_certificate_applications set review_note = $1 where id = $2',['UNEXPECTED',plan.targets.selected]);
  await assert.rejects(deleteCertificateAwardPreview(sql,plan),/does not match/u);
  await db.query('update public.affairs_certificate_applications set review_note = $1 where id = $2',[plan.rows[0].review_note,plan.targets.selected]);
  await db.exec('begin');await deleteCertificateAwardPreview(sql,plan);await db.exec('commit');
  await db.exec('begin');await deleteCertificateAwardPreview(sql,plan);await db.exec('commit');
  for(const {id} of users)await db.query('delete from auth.users where id=$1',[id]);
  assert.equal(await verifyCertificateAwardPreviewAbsent(sql,plan),true);
});
