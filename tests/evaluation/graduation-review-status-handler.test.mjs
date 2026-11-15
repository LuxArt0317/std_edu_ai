import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {graduationReviewStatusKind,selectGraduationReviewAnswer} from '../../server/graduationReview.js';
import {buildAccountCases} from './account-cases.mjs';
import {fixtureForCase} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

const cases=buildAccountCases();
const legacy=cases.find(row=>row.id==='account:followup-graduation-legacy');
const modern=cases.find(row=>row.id==='account:graduation-modern');
const directLegacy=cases.find(row=>row.id==='account:graduation-legacy');
const core=cases.find(row=>row.id==='account:graduation-core');
const lineage=cases.find(row=>row.id==='account:graduation-course-lineage');
const eligibility=cases.find(row=>row.id==='account:graduation-eligibility-boundary');
const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const token='controlled-graduation-status-caller-token',key='controlled-graduation-status-key';
const statusProjection='user_id,report_kind,source_mode,review_status:report->graduationReview->>text';
const categoryProjection='user_id,report_kind,source_mode,categories:report->categories';

function transport(t,choices){
  const fixture=fixtureForCase(legacy),caller=fixture.profile.userId;
  for(const [name,value] of Object.entries({VITE_SUPABASE_URL:project,VITE_SUPABASE_PUBLISHABLE_KEY:key,OPENAI_API_KEY:'controlled-quota-key'})){
    const previous=process.env[name];process.env[name]=value;
    t.after(()=>{if(previous===undefined)delete process.env[name];else process.env[name]=previous;});
  }
  const calls=[];
  let index=0;
  const failures=[];
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const url=new URL(String(input));
    calls.push(url.pathname);
    if(url.origin==='https://api.openai.com')
      return Response.json({error:{code:'insufficient_quota'}},{status:429});
    try{
      assert.equal(url.origin,project);
      const headers=new Headers(init?.headers);
      assert.equal(headers.get('authorization'),'Bearer '+token);
      assert.equal(headers.get('apikey'),key);
      if(url.pathname==='/auth/v1/user')
        return Response.json({id:caller,identities:[{provider:'google'}]});
      assert.equal(url.pathname,'/rest/v1/affairs_graduation_reviews');
      assert.equal(init?.method,'GET');
      assert.equal(init?.body,undefined);
      assert.equal(init?.redirect,'error');
      assert.equal(headers.get('prefer'),'count=exact');
      assert.deepEqual([...url.searchParams.keys()].sort(),['limit','report_kind','select','user_id']);
      assert.equal(url.searchParams.get('user_id'),'eq.'+caller);
      assert.equal(url.searchParams.get('limit'),'2');
      const next=choices[index++];
      assert.ok(next,'Unexpected graduation review read');
      const kind=url.searchParams.get('report_kind')?.slice(3);
      assert.equal(kind,next.kind??'legacy');
      assert.equal(url.searchParams.get('select'),next.categories?categoryProjection:statusProjection);
      if(next.status)return Response.json({error:'Controlled scoped outage'},{status:next.status});
      const report=fixture.graduationReview.reports.find(row=>row.reportKind===kind);
      const record=next.categories?{categories:report.categories}:{review_status:report.graduationReview.text};
      const row={user_id:caller,report_kind:kind,source_mode:'local_demo',...record,...next.row};
      const rows=next.readRows?await next.readRows({caller,kind,categories:next.categories}):next.empty?[]:next.duplicate?[row,row]:[row];
      const range=rows.length===0?'*/0':`0-${rows.length-1}/${rows.length}`;
      return Response.json(rows,{headers:{'content-range':next.range??range}});
    }catch(error){failures.push(error);return Response.json({}, {status:500});}
  });
  return {calls,failures};
}

async function invoke(handler,item=legacy){
  let status,body;
  const response={setHeader(){},status(code){status=code;return response;},json(value){body=value;}};
  await handler({method:'POST',headers:{authorization:'Bearer '+token},
    body:{question:item.question,route:item.route,history:item.history,stream:false}},response);
  return {status,body};
}

const scopedReads=count=>['/auth/v1/user',...Array(count).fill('/rest/v1/affairs_graduation_reviews')];

test('explicit and immediately preceding own report status resolve only a single requested report kind',()=>{
  assert.equal(graduationReviewStatusKind(legacy.question,legacy.route,legacy.history),'legacy');
  assert.equal(graduationReviewStatusKind(legacy.question,'/school-affairs/services/15-1',legacy.history),'academic_services');
  assert.equal(graduationReviewStatusKind('我的狀態','/',[{role:'user',content:'我的舊版畢業檢核'}]),'legacy');
  assert.equal(graduationReviewStatusKind(legacy.question,'/school-affairs/services/15-2'),'legacy');
  for(const [question,route,history] of [
    [legacy.question,'/',[...legacy.history,{role:'user',content:'Show me my fee balance'}]],
    [legacy.question,'/',[{role:'assistant',content:'Show my legacy graduation report.'}]],
    [legacy.question,'/',[{role:'user',content:'Show Alex’s legacy graduation report.'}]],
    [legacy.question,'/school-affairs/services/15-2?user_id=outside',legacy.history],
    ['What is my status and which credits are missing?','/',legacy.history],
    ['What is my status and how much tuition do I owe?','/',legacy.history],
    ['Can I officially graduate based on this local report?','/school-affairs/services/15-2',legacy.history],
  ])assert.equal(graduationReviewStatusKind(question,route,history),null,question);
});

test('the actual handler with exhausted provider quota passes all three unchanged frozen status cases from one narrow GET each',async t=>{
  const io=transport(t,[{}, {kind:'academic_services',row:{review_status:'Modern review pending'}},{}]);
  const handler=createAffairsAssistantHandler();
  for(const item of [legacy,modern,directLegacy]){
    const {status,body}=await invoke(handler,item);
    assert.deepEqual(io.failures,[]);
    const grade=gradeCase(item,{body,statusCode:status,events:body.activity,fixtureKey:item.fixtureKey,execution:'deterministic'});
    assert.equal(grade.passed,true,item.id+' '+JSON.stringify(grade.failures));
    assert.equal(body.verification.status,'verified');
    assert.equal(body.verification.attempts,1);
    const expected=item.id.includes('modern')?'/school-affairs/services/13-1/graduation':'/school-affairs/services/15-2';
    assert.deepEqual(body.citations.map(row=>row.url),[expected]);
    assert.doesNotMatch(body.answer,/not eligible|student number|requirement ID/u);
    assert.equal(body.proposedAction,undefined);
  }
  assert.deepEqual(io.calls,[...scopedReads(1),...scopedReads(1),...scopedReads(1)]);
});

test('no report, null status and blank status stay distinct without reading the other report',async t=>{
  const io=transport(t,[{empty:true},{row:{review_status:null}},{row:{review_status:''}}]);
  const handler=createAffairsAssistantHandler();
  for(const expected of [/has no saved Legacy/u,/has no recorded status text/u,/status field is blank/u]){
    const {body}=await invoke(handler);
    assert.equal(body.verification.status,'verified');
    assert.match(body.answer,expected);
    assert.doesNotMatch(body.answer,/Academic Services graduation review|Legacy review complete/u);
  }
  assert.deepEqual(io.calls,[...scopedReads(1),...scopedReads(1),...scopedReads(1)]);
  assert.deepEqual(io.failures,[]);
});

test('a transient failure retries only the same owned report and verifies the refreshed literal',async t=>{
  const io=transport(t,[{status:503},{row:{review_status:'Fresh saved status'}}]);
  const {body}=await invoke(createAffairsAssistantHandler());
  assert.deepEqual(io.failures,[]);
  assert.deepEqual(io.calls,scopedReads(2));
  assert.equal(body.verification.status,'verified');
  assert.equal(body.verification.attempts,2);
  assert.match(body.answer,/Fresh saved status/u);
  assert.deepEqual(body.activity.filter(row=>row.kind.startsWith('account-read:')).map(row=>row.status),['unavailable','complete']);
});

for(const [label,result] of [
  ['crossed owner',{row:{user_id:'foreign',review_status:'PRIVATE FOREIGN STATUS'}}],
  ['wrong report kind',{row:{report_kind:'academic_services',review_status:'PRIVATE MODERN STATUS'}}],
  ['unexpected projection',{row:{report:{identity:'PRIVATE ACTUAL IDENTITY'}}}],
  ['duplicate report',{duplicate:true,range:'0-1/2'}],
  ['inexact count',{range:'0-0/2'}],
  ['persistent outage',{status:503}],
])test(label+' withholds status instead of reporting an empty record',async t=>{
  const io=transport(t,[result,result]);
  const {body}=await invoke(createAffairsAssistantHandler());
  assert.deepEqual(io.failures,[]);
  assert.deepEqual(io.calls,scopedReads(2));
  assert.equal(body.status,'abstained');
  assert.equal(body.verification.status,'unverified');
  assert.match(body.answer,/couldn’t verify the saved Legacy graduation review status/u);
  assert.doesNotMatch(body.answer,/no saved|Legacy review complete|PRIVATE/u);
  assert.deepEqual(body.citations,[]);
});

test('a real mixed graduation request keeps its existing handler path',async()=>{
  const data=fixtureForCase(legacy);
  let snapshots=0;
  const handler=createAffairsAssistantHandler({
    verifyToken:async()=>({user:{id:data.profile.userId},token,key,url:project}),
    loadSnapshot:async()=>{snapshots++;return data;},
    answerAccount:async args=>{
      assert.match(args.question,/which credits are missing/u);
      return {status:'answered',answer:'Existing mixed answer.',citations:[],verification:{status:'verified',attempts:1}};
    },
  });
  const {status,body}=await invoke(handler,{...legacy,question:'What is my status and which credits are missing?'});
  assert.equal(status,200);
  assert.equal(snapshots,1);
  assert.equal(body.answer,'Existing mixed answer.');
});

const modernKind='academic_services';
const detailRequests=[{kind:modernKind,categories:true},{kind:modernKind,categories:true},{kind:modernKind}];

test('the exact detail prompts keep their one view and leave mixed requests on their existing path',()=>{
  assert.deepEqual([core,lineage,eligibility].map(item=>selectGraduationReviewAnswer(item.question,item.route,item.history)),[
    {kind:modernKind,view:'credits',name:'Core requirements'},
    {kind:modernKind,view:'matchedCourse',name:'Database requirement'},
    {kind:modernKind,view:'eligibility'},
  ]);
  assert.equal(selectGraduationReviewAnswer(lineage.question,'/school-affairs/services/15-2').kind,'legacy');
  assert.equal(selectGraduationReviewAnswer(eligibility.question,'/',[{role:'user',content:'Show my tuition receipt.'}]),null);
  assert.equal(selectGraduationReviewAnswer(eligibility.question,'/',legacy.history).kind,'legacy');
  for(const question of [
    'What credits are explicitly recorded for Core requirements and Elective requirements?',
    'What credits are explicitly recorded for Core requirements, and what do I owe in fees?',
    'Which course matches my Database requirement in the graduation report? Also list my assignments.',
    'Can I officially graduate based on this local report and a confirmed grade?',
  ])assert.equal(selectGraduationReviewAnswer(question,'/'),null,question);
});

async function exactDetailPacket(io){
  const handler=createAffairsAssistantHandler();
  for(const item of [core,lineage,eligibility]){
    const {status,body}=await invoke(handler,item);
    assert.deepEqual(io.failures,[]);
    const grade=gradeCase(item,{body,statusCode:status,events:body.activity,fixtureKey:item.fixtureKey,execution:'deterministic'});
    assert.equal(grade.passed,true,item.id+' '+JSON.stringify(grade.failures));
    assert.deepEqual(body.citations.map(row=>row.url),['/school-affairs/services/13-1/graduation']);
    assert.equal(body.verification.attempts,1);
    assert.doesNotMatch(JSON.stringify(body),/EVAL-115-001|Evaluation Student|Core pending|Language course pending|Legacy review complete|Synthetic local reference/u);
    if(item===eligibility)assert.match(body.answer,/I can’t verify whether you can officially graduate/u);
    else if(item===lineage)assert.doesNotMatch(body.answer,/Modern review pending|Core requirements/u);
    else assert.doesNotMatch(body.answer,/Database Design|Database requirement|Excluded credits/u);
  }
  assert.deepEqual(io.calls,[...scopedReads(1),...scopedReads(1),...scopedReads(1)]);
}

test('under provider quota the actual handler verifies the three unchanged detail rubrics with no provider dispatch',async t=>{
  await exactDetailPacket(transport(t,detailRequests));
});

test('zero, null, missing and duplicate detail states remain distinct',async t=>{
  const categories=fixtureForCase(core).graduationReview.reports.find(row=>row.reportKind===modernKind).categories;
  const changed=structuredClone(categories),empty=structuredClone(categories);
  changed[0].requiredCredits=0;changed[0].matchedCredits=null;
  empty[0].requirements[0].matchedCourses=[];
  const duplicate=[categories[0],{...structuredClone(categories[0]),id:'second-core',requiredCredits:999}];
  const io=transport(t,[changed,empty,categories,duplicate].map(categories=>({kind:modernKind,categories:true,row:{categories}})));
  const handler=createAffairsAssistantHandler();
  let {body}=await invoke(handler,core);
  assert.match(body.answer,/Required credits: 0/u);assert.match(body.answer,/Matched credits: not recorded/u);
  ({body}=await invoke(handler,lineage));assert.match(body.answer,/has no saved matched courses/u);
  ({body}=await invoke(handler,{...lineage,question:'Which course matches my Data requirement in the graduation report?'}));
  assert.match(body.answer,/no matching course requirement/u);assert.doesNotMatch(body.answer,/Database Design/u);
  ({body}=await invoke(handler,core));assert.match(body.answer,/More than one saved credit category matches/u);
  assert.doesNotMatch(body.answer,/999|Required credits/u);
  assert.deepEqual(io.calls,Array.from({length:4},()=>scopedReads(1)).flat());assert.deepEqual(io.failures,[]);
});

const pgRuntime=process.env.STU_GRADUATION_TEST_PGLITE_ENTRY;
test('the actual handler reads migrated report projections and both roles deny crossed RLS', {skip:!pgRuntime}, async t=>{
  assert.ok(isAbsolute(pgRuntime));
  const {PGlite}=await import(pathToFileURL(pgRuntime).href),db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(user_id uuid references auth.users,provider text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,private to authenticated;`);
  for(const file of ['20261105010000_school_affairs_workspace.sql','20261112130000_graduation_review.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  const fixture=fixtureForCase(legacy),caller=fixture.profile.userId,other='85000000-0000-4000-8000-000000000002';
  for(const [index,owner] of [caller,other].entries()){
    const email=`disposable-grad-${index}@example.invalid`;
    await db.query('insert into auth.users values($1,$2,now(),$3)',[owner,email,{}]);
    await db.query('insert into public.affairs_profiles(user_id,email,display_name) values($1,$2,$3)',[owner,email,'Synthetic student']);
    await db.query("insert into auth.identities values($1,'google')",[owner]);
    for(const {id,userId,reportKind,sourceMode,version,createdAt,updatedAt,...report} of fixture.graduationReview.reports)
      await db.query('insert into public.affairs_graduation_reviews(user_id,report_kind,report) values($1,$2,$3)',[owner,reportKind,report]);
  }
  const readRows=async({caller,kind,categories,target=caller})=>{
    const projection=categories?"report->'categories' as categories":"report->'graduationReview'->>'text' as review_status";
    await db.exec('begin; set local role authenticated;');
    try{
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[caller]);
      const {rows}=await db.query('select user_id,report_kind,source_mode,'+projection
        +' from public.affairs_graduation_reviews where user_id=$1 and report_kind=$2 limit 2',[target,kind]);
      return rows;
    }finally{await db.exec('rollback');}
  };
  assert.deepEqual(await readRows({caller,kind:modernKind,categories:true,target:other}),[]);
  assert.deepEqual(await readRows({caller:other,kind:modernKind,target:caller}),[]);
  await exactDetailPacket(transport(t,detailRequests.map(request=>({...request,readRows}))));
});
