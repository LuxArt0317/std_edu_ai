import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import dataHandler from '../../api/affairs-data.ts';
import {announcementEmailForeignAnswer,announcementEmailPath,announcementEmailQuestion} from '../../server/announcementEmailContract.js';
import {announcementEmailBrowserAnswerPath,announcementEmailBrowserCases,gradeAnnouncementEmailBrowserReply,
  verifyProtectedAnnouncementEmailBrowserSave} from './announcement-email-browser-turn.mjs';
import {createAnnouncementEmailBrowserSaveJournal} from './announcement-email-browser-preview.mjs';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {bindAnnouncementEmailBrowserCase,buildAnnouncementEmailBrowserFixture,deleteAnnouncementEmailBrowserFixture,
  observeAnnouncementEmailBrowserCallers,observeAnnouncementEmailBrowserFixture,seedAnnouncementEmailBrowserFixture,
  verifyAnnouncementEmailBrowserFixtureAbsent} from './announcement-email-browser-fixture.mjs';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';
import {seedDisposableNativeBrowserProfiles} from './live-fixtures.mjs';

const runtime=process.env.STU_ANNOUNCEMENT_EMAIL_TEST_PGLITE_ENTRY;
const chrome=process.env.STU_ANNOUNCEMENT_EMAIL_TEST_CHROME;
const runId='a2100000-0000-4000-8000-000000000001';
const owners={A:{id:'a2100000-0000-4000-8000-000000000002',email:'announcement-a@example.invalid',runMarker:runId},
  B:{id:'a2100000-0000-4000-8000-000000000003',email:'announcement-b@example.invalid',runMarker:runId}};
const users=Object.values(owners).map(owner=>({id:owner.id,token:'synthetic-announcement-'+owner.id}));
const origin='https://xiftudmvxphxcjtmfmib.supabase.co',key='synthetic-publishable-key';

test('2-1 selects three exact inventory cases and the original foreign question gets a record-free refusal',async()=>{
  const {questions}=await discoverClientDispatchSurfaces();
  for(const testCase of announcementEmailBrowserCases){
    const frozen=questions.find(row=>row.id===testCase.id);
    assert.equal(frozen.question,testCase.question);
    assert.equal(frozen.route,announcementEmailPath);
    assert.equal(frozen.staticProbe.predicate,'status');
  }
  const foreign=questions.find(row=>row.id==='client:announcement-email:foreign');
  assert.equal(announcementEmailQuestion(foreign.question),'foreign');
  const denial=announcementEmailForeignAnswer(foreign.question);
  assert.equal(denial.status,'handoff');
  assert.match(denial.answer,/can’t check another student’s announcement email preference/u);
  assert.deepEqual(denial.citations,[]);
  assert.deepEqual(denial.grounding,{source:'directory',webSearched:false});
});

test('actual compiled browser dispatcher selects the two 2-1 read shapes and makes no foreign request',
  {skip:!chrome,timeout:30_000},async()=>{
    const {rolldown}=await import('rolldown'),{chromium}=await import('playwright-core');
    const root=new URL('../../',import.meta.url),entry=fileURLToPath(new URL('src/services/schoolAffairsAssistant.ts',root));
    const source=fileURLToPath(new URL('src',root));
    const bundle=await rolldown({input:'announcement-browser-test',platform:'browser',
      resolve:{alias:{'@':source}},transform:{define:{'import.meta.env':'{}'}},
      plugins:[{name:'isolated-announcement-browser',
        resolveId(id){
          if(id==='announcement-browser-test')return '\0announcement-browser-test';
          if(/(?:^|\/)affairs\/authClient(?:\.[cm]?[jt]s)?$/u.test(id))return '\0announcement-browser-auth';
        },
        load(id){
          if(id==='\0announcement-browser-test')return `import {askSchoolAffairsAssistant} from ${JSON.stringify(entry)};
            globalThis.askAnnouncement=question=>askSchoolAffairsAssistant(${JSON.stringify(owners.A.id)},question,[],undefined,[],location.pathname);`;
          if(id==='\0announcement-browser-auth')return `export const affairsClient={auth:{getSession:async()=>({data:{session:{
            user:{id:${JSON.stringify(owners.A.id)}},access_token:'disposable-local-browser-token'}}})}};`;
        },
      }],
    });
    const {output}=await bundle.generate({format:'iife',codeSplitting:false});
    await bundle.close();
    assert.equal(output.length,1);
    const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--disable-background-networking']});
    try{
      const context=await browser.newContext({serviceWorkers:'block'});
      const calls=[],site='https://announcement-browser.invalid',pageUrl=site+announcementEmailPath;
      await context.route('**/*',async route=>{
        const request=route.request(),url=request.url();
        if(url===pageUrl&&request.isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Announcement settings QA</title>'});
        calls.push({method:request.method(),url,authorization:request.headers().authorization});
        if(request.method()==='GET'&&url.startsWith(site+'/api/affairs-data?scope=announcement-email'))
          return route.fulfill({json:{answer:'Observed local preference fixture',grounding:{source:'account'}}});
        return route.abort();
      });
      const page=await context.newPage();
      await page.goto(pageUrl);
      await page.addScriptTag({content:output[0].code});
      for(const testCase of announcementEmailBrowserCases.slice(0,2))
        await page.evaluate(question=>window.askAnnouncement(question),testCase.question);
      const expected=announcementEmailBrowserCases.slice(0,2).map(row=>({
        method:'GET',url:site+announcementEmailBrowserAnswerPath(row.inbox),authorization:'Bearer disposable-local-browser-token',
      }));
      assert.deepEqual(calls,expected);
      const {questions}=await discoverClientDispatchSurfaces();
      const foreign=questions.find(row=>row.id==='client:announcement-email:foreign');
      const denial=await page.evaluate(question=>window.askAnnouncement(question),foreign.question);
      assert.equal(denial.status,'handoff');
      assert.match(denial.answer,/can’t check another student’s announcement email preference/u);
      assert.deepEqual(denial.citations,[]);
      await context.close();
      assert.deepEqual(calls,expected);
    }finally{await browser.close();}
  });

function pgliteSql(db){
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

async function request(user,query){
  const result={};
  const output={status(status){result.status=status;return output;},json(body){result.body=body;},setHeader(){}};
  await dataHandler({method:'GET',headers:{authorization:'Bearer '+user.token},query},output);
  return result;
}

test('actual 2-1 handler verifies retained preference, inbox boundary, missing preference and crossed scope against migrated PostgreSQL',
  {skip:!runtime},async t=>{
    assert.ok(isAbsolute(runtime));
    const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
    const previous={VITE_SUPABASE_URL:process.env.VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ANNOUNCEMENT_EMAIL_RESEND_KEY:process.env.ANNOUNCEMENT_EMAIL_RESEND_KEY};
    Object.assign(process.env,{VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:key,ANNOUNCEMENT_EMAIL_RESEND_KEY:''});
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
    for(const migration of ['20261105010000_school_affairs_workspace.sql','20261114220000_announcement_email_preferences.sql'])
      await db.exec(await readFile(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));
    await db.query('insert into supabase_migrations.schema_migrations values ($1)',['20261114220000']);
    for(const owner of Object.values(owners)){
      await db.query('insert into auth.users values($1,$2,now(),$3)',[owner.id,owner.email,{assistant_evaluation_run:runId}]);
      await db.query('insert into auth.identities values($1,$2)',[owner.id,'google']);
    }
    const plan=buildAnnouncementEmailBrowserFixture(runId,owners),sql=pgliteSql(db);
    await t.test('cleanup permits missing profiles only for exact confirmed owners with no stored preference',async()=>{
      const mismatch={code:'announcement-fixture-mismatch'};
      await db.exec('begin');
      try{
        await deleteAnnouncementEmailBrowserFixture(sql,plan);
        await assert.rejects(seedAnnouncementEmailBrowserFixture(sql,plan),mismatch);
        await db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{},owners.B.id]);
        await assert.rejects(deleteAnnouncementEmailBrowserFixture(sql,plan),mismatch);
        await db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{assistant_evaluation_run:runId},owners.B.id]);
        await db.query("insert into public.affairs_profiles(user_id,email,display_name,role) values($1,$2,'Disposable QA','admin')",[owners.A.id,owners.A.email]);
        await assert.rejects(deleteAnnouncementEmailBrowserFixture(sql,plan),mismatch);
        await db.query("update public.affairs_profiles set role='student' where user_id=$1",[owners.A.id]);
        await deleteAnnouncementEmailBrowserFixture(sql,plan);
        await sql`insert into public.affairs_announcement_email_preferences ${sql(plan.row)}`;
        await assert.rejects(deleteAnnouncementEmailBrowserFixture(sql,plan),mismatch);
      }finally{await db.exec('rollback');}
    });
    await db.exec('begin');
    await seedDisposableNativeBrowserProfiles(sql,plan);
    await seedAnnouncementEmailBrowserFixture(sql,plan);
    await db.exec('commit');
    const before=await observeAnnouncementEmailBrowserFixture(sql,plan),reads=[];
    async function readRpc(user){
      await db.exec('begin; set local role authenticated');
      try{
        await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user.id]);
        return (await db.query('select public.affairs_read_announcement_email() as value')).rows[0].value;
      }finally{await db.exec('rollback');}
    }
    const fetchMock=t.mock.method(globalThis,'fetch',async(input,init)=>{
      const url=new URL(String(input)),headers=new Headers(init.headers);
      assert.equal(url.origin,origin);assert.equal(headers.get('apikey'),key);
      const user=users.find(candidate=>headers.get('authorization')==='Bearer '+candidate.token);
      assert.ok(user);
      if(url.pathname==='/auth/v1/user')return Response.json({id:user.id,identities:[{provider:'google'}]});
      assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_announcement_email');assert.deepEqual(JSON.parse(String(init.body)),{});
      reads.push(user.id);return Response.json(await readRpc(user));
    });
    const pair=await observeAnnouncementEmailBrowserCallers(plan,{users,readRpc,deliveryConfigured:false});
    assert.deepEqual([pair.A.enabled,pair.A.active,pair.B.version],[true,false,0]);
    for(const frozen of announcementEmailBrowserCases){
      const bound=bindAnnouncementEmailBrowserCase(plan,pair,frozen.id),user=users[frozen.role==='A'?0:1];
      const requestPath=announcementEmailBrowserAnswerPath(frozen.inbox);
      const query=Object.fromEntries(new URL(requestPath,origin).searchParams);
      const reply=await request(user,query);
      assert.equal(reply.status,200);
      assert.equal(gradeAnnouncementEmailBrowserReply({...bound,reply:reply.body}).passed,true);
      if(frozen.inbox){
        const id='a2100000-0000-7000-8000-000000000004',messageId='a2100000-0000-4000-8000-000000000005';
        const payload={id,title:frozen.question.slice(0,80),version:0,messages:sanitizeStoredConversation([
          {id:'u-'+messageId,role:'user',content:frozen.question,images:[]},
          {id:'a-'+messageId,role:'assistant',phase:'complete',content:reply.body.answer,result:reply.body,activity:reply.body.activity},
        ])};
        const binding={payload,question:frozen.question,assistantResponse:Buffer.from(JSON.stringify(reply.body)),requestSequence:4,inbox:true};
        const directory=await mkdtemp(join(tmpdir(),'stu-announcement-save-test-'));
        const proof=await createAnnouncementEmailBrowserSaveJournal({directory,runId,ownerId:user.id,
          conversationId:id,sourceRevision:'a'.repeat(40),bound});
        t.after(async()=>{await proof.journal.close();await rm(directory,{recursive:true,force:true});});
        const command={...binding,expected:verifyProtectedAnnouncementEmailBrowserSave(binding),requestPath};
        await assert.rejects(proof.reserveSave({...command,requestPath:announcementEmailBrowserAnswerPath(false)}));
        await proof.reserveSave(command);
        assert.equal((await proof.journal.read()).entries[0].received,null);
        const updatedAt='2026-11-16T00:00:00Z';
        await proof.receiveSave({status:200,announcementEmailReceipt:{id,version:1,updatedAt},
          body:Buffer.from(JSON.stringify({...payload,version:1}))});
        assert.ok((await proof.journal.read()).entries[0].received);
        assert.equal(proof.expected().updatedAt,updatedAt);
      }
    }
    assert.deepEqual(reads,[owners.A.id,owners.A.id,owners.B.id]);
    for(const query of [
      {scope:'announcement-email',answer:'en',user_id:owners.A.id},
      {scope:'announcement-email',answer:'en',inbox_receipt:'send'},
      {scope:'announcement-email',inbox_receipt:'requested'},
      {scope:'announcement-email',answer:'en',inbox_receipt:['requested','requested']},
    ])assert.equal((await request(users[1],query)).status,400);
    assert.equal(reads.length,3);
    assert.ok(fetchMock.mock.callCount()>=3);
    assert.equal(await observeAnnouncementEmailBrowserFixture(sql,plan),before);
    await db.exec('begin');await deleteAnnouncementEmailBrowserFixture(sql,plan);await db.exec('commit');
    await db.query('delete from auth.users where id in ($1,$2)',users.map(user=>user.id));
    assert.equal(await verifyAnnouncementEmailBrowserFixtureAbsent(sql,plan),true);
  });
