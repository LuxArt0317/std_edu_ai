import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {graduationReviewStatusKind} from '../../server/graduationReview.js';
import {buildAccountCases} from './account-cases.mjs';
import {fixtureForCase} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

const cases=buildAccountCases();
const legacy=cases.find(row=>row.id==='account:followup-graduation-legacy');
const modern=cases.find(row=>row.id==='account:graduation-modern');
const directLegacy=cases.find(row=>row.id==='account:graduation-legacy');
const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const token='controlled-graduation-status-caller-token',key='controlled-graduation-status-key';
const expectedSelect='user_id,report_kind,source_mode,review_status:report->graduationReview->>text';

function transport(t,choices){
  const caller=fixtureForCase(legacy).profile.userId;
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
      assert.equal(url.searchParams.get('select'),expectedSelect);
      assert.equal(url.searchParams.get('user_id'),'eq.'+caller);
      assert.equal(url.searchParams.get('limit'),'2');
      const next=choices[index++];
      assert.ok(next,'Unexpected graduation review read');
      const kind=url.searchParams.get('report_kind')?.slice(3);
      assert.equal(kind,next.kind??'legacy');
      if(next.status)return Response.json({error:'Controlled scoped outage'},{status:next.status});
      const row={user_id:caller,report_kind:kind,source_mode:'local_demo',review_status:'Legacy review complete',...next.row};
      const rows=next.empty?[]:next.duplicate?[row,row]:[row];
      return Response.json(rows,{headers:{'content-range':next.range??(rows.length===0?'*/0':'0-0/1')}});
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
    assert.equal(grade.passed,true,JSON.stringify(grade.failures));
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
