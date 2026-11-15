import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isAbsolute,join} from 'node:path';
import {tmpdir} from 'node:os';
import dataHandler from '../../api/affairs-data.ts';
import {studentProfilePath} from '../../server/studentProfileContract.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';
import {seedDisposableNativeBrowserProfiles} from './live-fixtures.mjs';
import {bindStudentProfileBrowserCase,buildStudentProfileBrowserFixture,deleteStudentProfileBrowserFixture,
  observeStudentProfileBrowserCallers,observeStudentProfileBrowserFixture,seedStudentProfileBrowserFixture,
  verifyStudentProfileBrowserFixtureAbsent} from './student-profile-browser-fixture.mjs';
import {createStudentProfileBrowserSaveJournal} from './student-profile-browser-preview.mjs';
import {gradeStudentProfileBrowserReply,studentProfileBrowserAnswerPath,studentProfileBrowserBootstrap,studentProfileBrowserCases,
  verifyProtectedStudentProfileBrowserSave} from './student-profile-browser-turn.mjs';

const runtime=process.env.STU_STUDENT_PROFILE_TEST_PGLITE_ENTRY;
const chrome=process.env.STU_STUDENT_PROFILE_TEST_CHROME;
const runId='a8100000-0000-4000-8000-000000000001';
const owners={A:{id:'a8100000-0000-4000-8000-000000000002',email:'student-profile-a@example.invalid',runMarker:runId},
  B:{id:'a8100000-0000-4000-8000-000000000003',email:'student-profile-b@example.invalid',runMarker:runId}};
const users=Object.values(owners).map(({id})=>({id,token:'synthetic-profile-'+id}));
const apiOrigin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-publishable-profile-key';
const migrations=['20261105010000_school_affairs_workspace.sql','20261105020000_dtm_sample_workspace.sql',
  '20261106010000_affairs_academic_records.sql','20261114210000_student_profile_confirmation.sql'];

test('the three 8-1 browser cases use the unmodified inventory prompts and select only the requested year',async()=>{
  const {questions}=await discoverClientDispatchSurfaces();
  for(const row of studentProfileBrowserCases){
    const frozen=questions.find(item=>item.id===row.id);
    assert.equal(frozen.question,row.question);
    assert.equal(frozen.route,studentProfilePath);
    assert.equal(frozen.staticProbe.predicate,'status');
    assert.equal(studentProfileBrowserAnswerPath(row.year).includes('year_level=requested'),row.id.endsWith(':multipart'));
  }
});

function sqlTag(db){
  const sql=(template,...values)=>{
    if(!template.raw)return {list:template};
    const parameters=[],param=value=>'$'+parameters.push(value);
    const fragment=value=>{
      if(!value?.list)return param(value);
      if(Array.isArray(value.list))return '('+value.list.map(param).join(',')+')';
      const columns=Object.keys(value.list);
      return '('+columns.join(',')+') values ('+columns.map(column=>param(value.list[column])).join(',')+')';
    };
    const statement=template.reduce((out,part,index)=>out+(index?fragment(values[index-1]):'')+part,'');
    return db.query(statement,parameters).then(result=>result.rows);
  };
  sql.json=value=>JSON.stringify(value);
  return sql;
}

async function invoke(user,path){
  const result={};
  const output={status(status){result.status=status;return output;},json(body){result.body=body;},setHeader(){}};
  await dataHandler({method:'GET',headers:{authorization:'Bearer '+user.token},
    query:Object.fromEntries(new URL(path,apiOrigin).searchParams)},output);
  return result;
}

async function exerciseChromium(pair,plan){
  const {rolldown}=await import('rolldown'),{chromium}=await import('playwright-core');
  const root=new URL('../../',import.meta.url),entry=fileURLToPath(new URL('src/services/schoolAffairsAssistant.ts',root));
  const source=fileURLToPath(new URL('src',root));
  const bundle=await rolldown({input:'profile-local-test',platform:'browser',
    resolve:{alias:{'@':source}},transform:{define:{'import.meta.env':'{}'}},
    plugins:[{name:'isolated-student-profile-browser',
      resolveId(id){
        if(id==='profile-local-test')return '\0profile-local-test';
        if(/(?:^|\/)affairs\/authClient(?:\.[cm]?[jt]s)?$/u.test(id))return '\0profile-local-auth';
      },
      load(id){
        if(id==='\0profile-local-test')return `import {askSchoolAffairsAssistant} from ${JSON.stringify(entry)};
          globalThis.askProfile = (user,question) => {
            globalThis.profileActor=user;
            return askSchoolAffairsAssistant(user.id,question,[],undefined,[],location.pathname);
          };`;
        if(id==='\0profile-local-auth')return `export const affairsClient={auth:{getSession:async()=>({data:{session:{
          user:{id:globalThis.profileActor.id},access_token:globalThis.profileActor.token}}})}};`;
      },
    }],
  });
  const {output}=await bundle.generate({format:'iife',codeSplitting:false});
  await bundle.close();
  assert.equal(output.length,1);
  const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--disable-background-networking']});
  try{
    const context=await browser.newContext({serviceWorkers:'block'}),site='https://profile-browser.invalid';
    const pageUrl=site+studentProfilePath,calls=[];
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.href===pageUrl&&request.isNavigationRequest())
        return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Student Profile QA</title>'});
      const user=users.find(row=>request.headers().authorization==='Bearer '+row.token);
      const path=url.pathname+url.search;
      calls.push({path,owner:user?.id,method:request.method()});
      if(url.origin!==site||request.method()!=='GET'||!user
        ||![studentProfileBrowserAnswerPath(false),studentProfileBrowserAnswerPath(true)].includes(path))return route.abort();
      const {status,body}=await invoke(user,path);
      return route.fulfill({status,json:body});
    });
    const page=await context.newPage();
    await page.goto(pageUrl);
    await page.addScriptTag({content:output[0].code});
    for(const row of studentProfileBrowserCases){
      const user=users[row.role==='A'?0:1],requestPath=studentProfileBrowserAnswerPath(row.year);
      const body=await page.evaluate(({user,question})=>window.askProfile(user,question),{user,question:row.question});
      assert.equal(gradeStudentProfileBrowserReply(bindStudentProfileBrowserCase(plan,pair,row.id),
        {statusCode:200,body,requestPath}).passed,true);
    }
    const foreign=(await discoverClientDispatchSurfaces()).questions.find(item=>item.id==='client:student-profile:foreign');
    const denial=await page.evaluate(({user,question})=>window.askProfile(user,question),{user:users[1],question:foreign.question});
    assert.equal(denial.status,'handoff');
    assert.match(denial.answer,/can’t access another student’s profile records/u);
    assert.deepEqual(calls,studentProfileBrowserCases.map(row=>({method:'GET',owner:owners[row.role].id,path:studentProfileBrowserAnswerPath(row.year)})));
    await context.close();
  }finally{await browser.close();}
}

test('migrated 8-1 browser packet observes two signed scopes, the actual API, exact save journal and fixture disposal',
  {skip:!runtime,timeout:45_000},async t=>{
    assert.ok(isAbsolute(runtime));
    const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
    const previous={VITE_SUPABASE_URL:process.env.VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:process.env.VITE_SUPABASE_PUBLISHABLE_KEY};
    Object.assign(process.env,{VITE_SUPABASE_URL:apiOrigin,VITE_SUPABASE_PUBLISHABLE_KEY:key});
    t.after(async()=>{
      for(const [name,value] of Object.entries(previous))if(value===undefined)delete process.env[name];else process.env[name]=value;
      await db.close();
    });
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private; create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key);
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
      create table auth.sessions(user_id uuid references auth.users on delete cascade);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,private to authenticated; set timezone='UTC';`);
    for(const migration of migrations){
      await db.exec(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));
      await db.query('insert into supabase_migrations.schema_migrations values ($1)',[migration.slice(0,14)]);
    }
    for(const owner of Object.values(owners)){
      await db.query('insert into auth.users values($1,$2,now(),$3)',[owner.id,owner.email,{assistant_evaluation_run:runId}]);
      await db.query('insert into auth.identities values($1,$2)',[owner.id,'google']);
    }
    const plan=buildStudentProfileBrowserFixture(runId,owners),sql=sqlTag(db);
    const inRollback=async work=>{
      await db.exec('begin');
      try{await work();}
      finally{await db.exec('rollback');}
    };
    await t.test('exact Auth owners can recover an empty rolled-back fixture with zero or one app profile',async()=>{
      await inRollback(async()=>{
        await seedDisposableNativeBrowserProfiles(sql,plan);
        await seedStudentProfileBrowserFixture(sql,plan);
      });
      await inRollback(async()=>{
        await assert.rejects(seedStudentProfileBrowserFixture(sql,plan),/student profile fixture mismatch/u);
        await deleteStudentProfileBrowserFixture(sql,plan);
        await db.query("insert into public.affairs_profiles(user_id,email,display_name,role) values($1,$2,'Evaluation Student','student')",
          [owners.A.id,owners.A.email]);
        await assert.rejects(seedStudentProfileBrowserFixture(sql,plan),/student profile fixture mismatch/u);
        await deleteStudentProfileBrowserFixture(sql,plan);
        await db.query("update public.affairs_profiles set role='admin' where user_id=$1",[owners.A.id]);
        await assert.rejects(deleteStudentProfileBrowserFixture(sql,plan),/student profile fixture mismatch/u);
        await db.query('delete from public.affairs_profiles where user_id=$1',[owners.A.id]);
        await db.query("update auth.users set raw_user_meta_data='{}' where id=$1",[owners.B.id]);
        await assert.rejects(deleteStudentProfileBrowserFixture(sql,plan),/student profile fixture mismatch/u);
      });
    });
    await db.exec('begin');
    await seedDisposableNativeBrowserProfiles(sql,plan);
    const savedDigest=await seedStudentProfileBrowserFixture(sql,plan);
    await db.exec('commit');
    await inRollback(async()=>{
      await db.query('delete from public.affairs_profiles where user_id=$1',[owners.B.id]);
      await assert.rejects(deleteStudentProfileBrowserFixture(sql,plan),/student profile fixture mismatch/u);
    });
    let pendingRead=Promise.resolve();
    const authorized=(user,work)=>{
      const reading=pendingRead.then(async()=>{
        await db.exec('begin; set local role authenticated');
        try{
          await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user.id]);
          return await work();
        }finally{await db.exec('rollback');}
      });
      pendingRead=reading.catch(()=>{});
      return reading;
    };
    const readRpc=async(user,selectors)=>{
      try{
        return await authorized(user,async()=>{
          const rows=(await db.query('select public.affairs_read_student_profile($1,$2) as value',
            [selectors.p_target,selectors.p_status_only])).rows;
          return {status:200,body:rows[0].value};
        });
      }catch(error){
        assert.equal(error.code,'42501');
        return {status:403,body:{code:error.code}};
      }
    };
    const readYear=(user,id)=>authorized(user,async()=>{
      const body=(await db.query('select user_id,year_level,source_mode from public.affairs_students where user_id=$1',[id])).rows;
      return {status:200,body,contentRange:body.length?'0-0/1':'*/0'};
    });
    const pair=await observeStudentProfileBrowserCallers(plan,{users,readRpc,readYear});
    assert.deepEqual([pair.A.year.year_level,pair.B.year,pair.B.recordExists],[3,null,false]);
    const reads=[];
    t.mock.method(globalThis,'fetch',async(input,init)=>{
      const url=new URL(String(input)),headers=new Headers(init.headers);
      assert.equal(url.origin,apiOrigin);
      assert.equal(headers.get('apikey'),key);
      const user=users.find(candidate=>headers.get('authorization')==='Bearer '+candidate.token);
      assert.ok(user);
      if(url.pathname==='/auth/v1/user')return Response.json({id:user.id,identities:[{provider:'google'}]});
      if(url.pathname==='/rest/v1/rpc/affairs_read_student_profile'){
        const selectors=JSON.parse(init.body);
        assert.equal(init.method,'POST');
        assert.equal(selectors.p_target,null);
        assert.equal(typeof selectors.p_status_only,'boolean');
        const {status,body}=await readRpc(user,selectors);
        reads.push([selectors.p_status_only?'status':'workspace',user.id]);
        return Response.json(body,{status});
      }
      assert.equal(url.pathname,'/rest/v1/affairs_students');
      assert.equal(init.method,'GET');
      assert.deepEqual(Object.fromEntries(url.searchParams),{select:'user_id,year_level,source_mode',user_id:'eq.'+user.id,limit:'1'});
      const year=await readYear(user,user.id);
      reads.push(['year',user.id]);
      return Response.json(year.body,{status:year.status,headers:{'content-range':year.contentRange}});
    });
    for(const row of studentProfileBrowserCases){
      const user=users[row.role==='A'?0:1],requestPath=studentProfileBrowserAnswerPath(row.year);
      const bound=bindStudentProfileBrowserCase(plan,pair,row.id);
      const {status,body}=await invoke(user,requestPath);
      assert.equal(gradeStudentProfileBrowserReply(bound,{statusCode:status,body,requestPath}).passed,true);
      assert.ok(!JSON.stringify(body).includes(plan.record.student_number));
      assert.ok(!JSON.stringify(body).includes(plan.record.original_mobile));
      const workspace=await invoke(user,studentProfileBrowserBootstrap);
      assert.equal(workspace.status,200);
      assert.deepEqual(workspace.body.record===null?null:{...workspace.body.record,confirmed_at:new Date(workspace.body.record.confirmed_at).toISOString()},
        pair[row.role].workspace);
      if(!row.year)continue;
      const id='a8100000-0000-7000-8000-000000000004',messageId='a8100000-0000-4000-8000-000000000005';
      const payload={id,title:row.question.slice(0,80),version:0,messages:sanitizeStoredConversation([
        {id:'u-'+messageId,role:'user',content:row.question,images:[]},
        {id:'a-'+messageId,role:'assistant',phase:'complete',content:body.answer,result:body,activity:body.activity},
      ])};
      const binding={payload,question:row.question,assistantResponse:Buffer.from(JSON.stringify(body)),requestSequence:5,year:true};
      const directory=await mkdtemp(join(tmpdir(),'stu-profile-save-test-'));
      const journal=await createStudentProfileBrowserSaveJournal({directory,runId,ownerId:user.id,conversationId:id,
        sourceRevision:'a'.repeat(40),bound});
      t.after(async()=>{await journal.journal.close();await rm(directory,{recursive:true,force:true});});
      const command={...binding,expected:verifyProtectedStudentProfileBrowserSave(binding),requestPath};
      assert.equal(command.expected.display.sourceLinks.length,2);
      await assert.rejects(journal.reserveSave({...command,requestPath:studentProfileBrowserAnswerPath(false)}));
      await journal.reserveSave(command);
      assert.equal((await journal.journal.read()).entries[0].received,null);
      const updatedAt='2026-11-16T00:00:00Z';
      await journal.receiveSave({status:200,studentProfileReceipt:{id,version:1,updatedAt},
        body:Buffer.from(JSON.stringify({...payload,version:1}))});
      assert.ok((await journal.journal.read()).entries[0].received);
      assert.equal(journal.expected().updatedAt,updatedAt);
    }
    assert.deepEqual(reads.filter(([kind])=>kind!=='status'&&kind!=='year'),[['workspace',owners.A.id],['workspace',owners.A.id],['workspace',owners.B.id]]);
    assert.deepEqual(reads.filter(([kind])=>kind==='year'),[['year',owners.A.id]]);
    if(chrome)await exerciseChromium(pair,plan);
    assert.equal(await observeStudentProfileBrowserFixture(sql,plan),savedDigest);
    await db.exec('begin');
    await deleteStudentProfileBrowserFixture(sql,plan);
    await db.exec('commit');
    await db.query('delete from auth.users where id in ($1,$2)',users.map(user=>user.id));
    assert.equal(await verifyStudentProfileBrowserFixtureAbsent(sql,plan),true);
  });
