import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {selectExactCourseSelection} from '../../server/accountCourseSelectionAnswer.js';
import {buildAccountCases} from './account-cases.mjs';
import {EVAL_OTHER_USER_ID,evalId,fixtureForCase} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

const runtime=process.env.STU_COURSE_SELECTION_TEST_PGLITE_ENTRY;
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const key='isolated-selection-publishable-key';
const base='/school-affairs/services/11-1',timetable='/school-affairs/services/11-2';
const endpoint='/rest/v1/affairs_course_selection_records';
const order='academic_year.desc,semester.desc,selection_phase.asc,row_order.asc,id.asc';
const frozen=buildAccountCases().filter(row=>row.domain==='courseSelection');
const initial=frozen.find(row=>row.id==='account:selection-initial');
const meeting=frozen.find(row=>row.id==='account:selection-timetable');
const remark=frozen.find(row=>row.id==='account:selection-no-enrollment-inference');
const expectedScope={
  'account:selection-initial':{academic_year:'eq.115',semester:'eq.1',selection_phase:'eq.initial'},
  'account:selection-timetable':{academic_year:'eq.115',semester:'eq.1',selection_phase:'eq.initial',timetable_included:'eq.true'},
  'account:selection-no-enrollment-inference':{},
  'account:empty-courseSelection':{},
};
const token=owner=>'isolated-selection-fixture-'+owner;

function persisted(row){
  return Object.fromEntries(Object.entries(row).map(([field,value])=>[field.replace(/[A-Z]/gu,letter=>'_'+letter.toLowerCase()),value]));
}
function selected(row,scope){
  return Object.entries(scope).every(([column,expected])=>'eq.'+String(row[column])===expected);
}
async function reply(t,{question,route=base,owner,scope={},read,guest=false}){
  const calls=[],errors=[];
  const handler=createAffairsAssistantHandler({
    verifyToken:async header=>{
      assert.equal(header,guest?'':token(owner));
      if(guest)throw new AffairsWorkspaceError('Sign in first.',401);
      return {url:origin,token:header,key,user:{id:owner}};
    },
    loadSnapshot:async()=>{const error=new Error('Unexpected broad account snapshot.');errors.push(error);throw error;},
    publicResearch:async()=>{const error=new Error('Unexpected public research.');errors.push(error);throw error;},
  });
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    try{
      const url=new URL(String(input)),headers=new Headers(init.headers);
      assert.equal(url.origin,origin);assert.equal(url.pathname,endpoint);
      assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
      assert.equal(headers.get('authorization'),'Bearer '+token(owner));
      assert.equal(headers.get('apikey'),key);assert.equal(headers.get('prefer'),'count=exact');
      assert.deepEqual(Object.fromEntries(url.searchParams),{select:'*',order,user_id:'eq.'+owner,limit:'100',...scope});
      calls.push(url.pathname);
      const result=await read(calls.length);
      if(result instanceof Response)return result;
      return Response.json(result,{headers:{'content-range':result.length?`0-${result.length-1}/${result.length}`:'*/0'}});
    }catch(error){errors.push(error);throw error;}
  });
  let body,statusCode=200;
  const response={setHeader(){},status(code){statusCode=code;return this;},json(value){body=value;}};
  await handler({method:'POST',headers:guest?{}:{authorization:'Bearer '+token(owner)},body:{question,route}},response);
  assert.deepEqual(errors,[]);
  return {body,statusCode,calls,events:body?.activity??[]};
}
function accepted(row,observed){
  assert.equal(observed.statusCode,200,JSON.stringify(observed.body));
  assert.deepEqual(gradeCase(row,{...observed,execution:'deterministic',fixtureKey:row.fixtureKey}).failures,[],observed.body.answer);
  assert.deepEqual(observed.body.verification,{status:'verified',attempts:1});
  assert.equal(observed.body.grounding.source,'account');
  assert.equal(observed.body.grounding.webSearched,false);
  assert.equal(observed.body.proposedAction,undefined);
  assert.ok(observed.events.some(({kind,status})=>kind==='course-selection-evidence-check'&&status==='complete'));
}

test('actual School Affairs handler verifies four unchanged selection questions without a provider',async t=>{
  assert.equal(frozen.length,4);
  for(const row of frozen)await t.test(row.id,async t=>{
    const fixture=fixtureForCase(row.fixtureKey),records=fixture.courseSelection.records.map(persisted);
    const before=structuredClone(records),scope=expectedScope[row.id];
    const observed=await reply(t,{...row,owner:fixture.profile.userId,scope,read:()=>records.filter(record=>selected(record,scope))});
    accepted(row,observed);
    assert.deepEqual(observed.calls,[endpoint]);assert.deepEqual(records,before);
  });
});

test('scoped lookup keeps matched, unapproved, ambiguous and failed results separate',async t=>{
  const fixture=fixtureForCase(initial.fixtureKey),owner=fixture.profile.userId,record=persisted(fixture.courseSelection.records[0]);
  await t.test('Traditional Chinese filters leave the previous year outside the query',async t=>{
    const scope={academic_year:'eq.115',semester:'eq.1',selection_phase:'eq.initial'};
    const observed=await reply(t,{question:'請顯示我的115學年第1學期初選選課記錄',owner,scope,read:()=>[record]});
    assert.match(observed.body.answer,/選課階段：初選/u);assert.match(observed.body.answer,/3 學分/u);
    assert.deepEqual(observed.body.verification,{status:'verified',attempts:1});
  });
  await t.test('ambiguous saved scopes ask which phase rather than expose course details',async t=>{
    const observed=await reply(t,{question:'Show my course-selection history',owner,
      read:()=>[record,{...record,id:evalId(1914),selection_phase:'add_drop',course_title:'Other Phase Control'}]});
    assert.match(observed.body.answer,/Please specify the academic year, semester and one selection phase/u);
    assert.doesNotMatch(observed.body.answer,/Networks Workshop|Other Phase Control/u);
    assert.deepEqual(observed.body.verification,{status:'verified',attempts:1});
  });
  await t.test('a different remark stays distinct from the supplied phrase',async t=>{
    const observed=await reply(t,{...remark,owner,read:()=>[{...record,remark_text:'Other private remark control'}]});
    assert.match(observed.body.answer,/No saved remark matches/u);
    assert.match(observed.body.answer,/does not establish approved enrollment/u);
    assert.doesNotMatch(observed.body.answer,/Selected for local review|Other private remark control/u);
  });
  await t.test('timetable membership and empty meetings are independent',async t=>{
    const scope=expectedScope[meeting.id];
    const observed=await reply(t,{...meeting,owner,scope,read:()=>[{...record,meetings:[]}]});
    assert.match(observed.body.answer,/Unscheduled course/u);
    assert.doesNotMatch(observed.body.answer,/R301/u);
  });
  await t.test('mixed or cross-owner rows fail without a retry',async t=>{
    for(const other of [{...record,user_id:EVAL_OTHER_USER_ID},{...record,selection_phase:'add_drop'}]){
      const observed=await reply(t,{...initial,owner,scope:expectedScope[initial.id],read:()=>[other]});
      assert.equal(observed.statusCode,503);assert.deepEqual(observed.calls,[endpoint]);
      assert.doesNotMatch(JSON.stringify(observed.body),/Networks Workshop/u);
    }
  });
  await t.test('a temporary read recovers using the same scope',async t=>{
    const observed=await reply(t,{...initial,owner,scope:expectedScope[initial.id],
      read:attempt=>attempt===1?new Response(null,{status:503}):[record]});
    assert.deepEqual(observed.calls,[endpoint,endpoint]);
    assert.deepEqual(observed.body.verification,{status:'verified',attempts:2});
    assert.match(observed.body.answer,/Networks Workshop/u);
  });
  await t.test('an unavailable read never becomes a verified empty answer',async t=>{
    const observed=await reply(t,{...initial,owner,scope:expectedScope[initial.id],read:()=>new Response(null,{status:503})});
    assert.deepEqual(observed.calls,[endpoint,endpoint]);
    assert.equal(observed.body.verification.status,'unverified');
    assert.doesNotMatch(observed.body.answer,/No course-selection records|Networks Workshop/u);
  });
  await t.test('guest requests never reach the private reader',async t=>{
    const observed=await reply(t,{...initial,owner,guest:true});
    assert.deepEqual(observed.calls,[]);
    assert.doesNotMatch(JSON.stringify(observed.body),/Networks Workshop/u);
  });
  assert.equal(selectExactCourseSelection(initial.question+' How much do I owe?',base),null);
  assert.equal(selectExactCourseSelection(meeting.question.replace('?',' and what is my display name?'),timetable),null);
  assert.equal(selectExactCourseSelection("Show Alice's selection history",base),null);
  assert.equal(selectExactCourseSelection('Can you approve my course selection?',base),null);
  assert.equal(selectExactCourseSelection(initial.question,'/dtm'),null);
});

test('migrated course-selection records preserve the frozen replies for two RLS callers',
  {skip:!runtime,timeout:30000},async t=>{
  assert.ok(isAbsolute(runtime),'Provide an existing PGlite runtime entry.');
  const {PGlite}=await import(pathToFileURL(runtime).href),db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(user_id uuid references auth.users on delete cascade,provider text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated; set timezone='UTC';`);
  for(const name of ['20261105010000_school_affairs_workspace.sql','20261112100000_course_selection_history.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  const fixture=fixtureForCase(initial.fixtureKey),owner=fixture.profile.userId,other=EVAL_OTHER_USER_ID;
  for(const caller of [owner,other]){
    await db.query("insert into auth.users values($1,$2,now(),'{}'::jsonb)",[caller,caller+'@example.invalid']);
    await db.query("insert into auth.identities values($1,'google')",[caller]);
    await db.query("insert into public.affairs_profiles(user_id,email,display_name,role) values($1,$2,'Synthetic learner','student')",
      [caller,caller+'@example.invalid']);
  }
  const record=persisted(fixture.courseSelection.records[0]);
  const rest=async(caller,filter,requestedOwner=caller)=>db.transaction(async tx=>{
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[caller]);
    const terms=Object.keys(filter);
    assert.ok(terms.every(name=>['academic_year','semester','selection_phase','timetable_included'].includes(name)));
    const where=terms.map((term,index)=>' and '+term+'::text=$'+(index+2)).join('');
    const {rows:[result]}=await tx.query(`select coalesce(jsonb_agg(to_jsonb(selected)),'[]'::jsonb) as rows from
      (select * from public.affairs_course_selection_records where user_id=$1${where}
       order by academic_year desc, semester desc, selection_phase, row_order, id) selected`,
      [requestedOwner,...terms.map(term=>filter[term].slice(3))]);
    return result.rows;
  });
  assert.deepEqual(await rest(owner,{}),[]);
  const empty=frozen.find(row=>row.id==='account:empty-courseSelection');
  accepted(empty,await reply(t,{...empty,owner,read:()=>rest(owner,{})}));
  const records=[record,
    {...record,id:evalId(1901),timetable_included:false,term_course_code:'EXCLUDED-A',course_title:'Excluded by timetable flag'},
    {...record,id:evalId(1902),selection_phase:'add_drop',term_course_code:'OTHER-PHASE',course_title:'Other Phase Control'},
    {...record,id:evalId(1903),user_id:other,term_course_code:'OTHER-OWNER',course_title:'FOREIGN SELECTION CONTROL',remark_text:'Foreign remark'}];
  for(const row of records)await db.query('insert into public.affairs_course_selection_records select (jsonb_populate_record(null::public.affairs_course_selection_records,$1::jsonb)).*',[JSON.stringify(row)]);
  const fingerprint=async()=>(await db.query(`select jsonb_agg(to_jsonb(r) order by id) as rows,
    (select count(*)::int from private.affairs_course_selection_operations) as operations,
    (select count(*)::int from public.affairs_agent_audit) as audits from public.affairs_course_selection_records r`)).rows[0];
  const before=await fingerprint();
  assert.deepEqual(await rest(other,{},owner),[]);assert.deepEqual(await rest(owner,{},other),[]);
  for(const row of frozen.filter(row=>row!==empty)){
    const scope=expectedScope[row.id],observed=await reply(t,{...row,owner,scope,read:()=>rest(owner,scope)});
    accepted(row,observed);
    assert.doesNotMatch(observed.body.answer,/FOREIGN SELECTION CONTROL|Other Phase Control/u);
    if(row===meeting)assert.doesNotMatch(observed.body.answer,/Excluded by timetable flag/u);
  }
  const scoped=expectedScope[initial.id];
  const second=await reply(t,{...initial,owner:other,scope:scoped,read:()=>rest(other,scoped)});
  assert.match(second.body.answer,/FOREIGN SELECTION CONTROL/u);
  assert.doesNotMatch(second.body.answer,/Networks Workshop/u);
  assert.deepEqual(await fingerprint(),before);
  assert.equal(before.operations,0);assert.equal(before.audits,0);

  await db.query('delete from auth.users where id in($1,$2)',[owner,other]);
  assert.equal((await db.query('select count(*)::int as count from public.affairs_course_selection_records')).rows[0].count,0);
});
