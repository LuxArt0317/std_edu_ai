import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {answerStudentSupportGuidance} from '../../server/studentSupportGuidance.js';

const cases=[
  {question:'what is the school wifi pass',content:/STU-Dot1x-5G.*802\.1X.*STUWLAN/su,url:'https://www.ecc.stu.edu.tw/wireless/'},
  {question:'im planning to stop going to school is there anything i should do',content:/semester leave.*withdrawal.*Registration and Curriculum Division.*deadline/su,
    url:'https://www2.stu.edu.tw/latestnews_single.php?id=223587'},
  {question:'where can i file a leave',content:/class absence.*Student Leave.*semester leave process/su,
    url:'https://infosys.stu.edu.tw/StuLeave/Login/AspLoginStu'},
  {question:'How do I connect to the campus Wi-Fi?',content:/STU-Dot1x-5G.*802\.1X.*STUWLAN/su,
    url:'https://help.ecc.stu.edu.tw/wireless-setting/'},
  {question:'I’m thinking of taking this semester off. What should I do?',content:/semester leave.*withdrawal.*Registration and Curriculum Division/su,
    url:'https://www2.stu.edu.tw/latestnews_single.php?id=223587'},
  {question:'Where can I submit a leave request for class?',content:/class absence.*Student Leave.*semester leave process/su,
    url:'https://infosys.stu.edu.tw/StuLeave/Login/AspLoginStu'},
];
type Turn={role:'user'|'assistant';content:string};
type Handler=ReturnType<typeof createAffairsAssistantHandler>|ReturnType<typeof createResearchAssistantHandler>;
async function request(handler:Handler,question:string,route:string,history:Turn[],address:string){
  let result:any,code=0;
  const steps:unknown[]=[];
  const response={status(value:number){code=value;return this;},setHeader(){},json(value:unknown){result=value;},
    write(packet:string){
      const [,event,data]=/^event: (\w+)\ndata: (.+)\n\n$/u.exec(packet)??[];
      if(event==='progress')steps.push(JSON.parse(data));
      if(event==='result')result=JSON.parse(data);
    },end(){}};
  await handler({method:'POST',body:{question,route,history,stream:true},
    headers:{authorization:'Bearer guidance-test','x-forwarded-for':address,'user-agent':'stu-guidance-regression'}},response);
  return {code,result,steps};
}

test('reported questions and natural variants use sourced guidance in guest and signed-in chat with prior private context',async t=>{
  const unexpected=()=>assert.fail('Guidance should use neither private records nor a model or network call.');
  t.mock.method(globalThis,'fetch',unexpected);
  const signed=createAffairsAssistantHandler({
    verifyToken:async token=>{
      assert.equal(token,'guidance-test');
      return {user:{id:'2f734a98-0000-4000-8000-000000000900'},token,key:'fixture-key',url:'https://xiftudmvxphxcjtmfmib.supabase.co'};
    },
    loadSnapshot:unexpected,answerAccount:unexpected,publicResearch:unexpected,
  });
  const guest=createResearchAssistantHandler();
  const history:Turn[]=[{role:'user',content:'What subjects and assignments do I have?'},{role:'assistant',content:'Private course sentinel.'}];
  for(const [index,scenario] of cases.entries()){
    for(const [handler,route] of [[guest,'/campus-assistant'],[signed,'/school-affairs/services/leave'],[signed,'/dtm']] as const){
      const {result,code,steps}=await request(handler,scenario.question,route,history,'guidance-regression-'+index);
      assert.equal(code,200);
      assert.equal(result.status,'answered');
      assert.match(result.answer,scenario.content);
      assert.ok(result.citations.some((citation:{url:string})=>citation.url===scenario.url));
      assert.deepEqual(result.grounding,{source:'directory',webSearched:false});
      assert.equal(result.views,undefined);
      assert.equal(result.proposedAction,undefined);
      assert.equal(result.verification,undefined);
      assert.deepEqual(steps,result.activity);
      assert.deepEqual(result.activity.map(({kind}:{kind:string})=>kind),['student-support-guidance']);
      assert.doesNotMatch(JSON.stringify(result),/Private course sentinel/u);
    }
    history.push({role:'user',content:scenario.question},{role:'assistant',content:'Previous guidance.'});
  }
});

test('variants stay distinct and leave explicitly targeted records and actions to their existing handlers',()=>{
  for(const [prompt,detail] of [
    ['What’s the campus Wi-Fi password?','Campus Wi-Fi access'],
    ['Where can I find the school wifi passcode?','Campus Wi-Fi access'],
    ['Is there a shared password for STU-Dot1x-5G?','Campus Wi-Fi access'],
    ['Where’s the campus Wi-Fi setup guide?','Campus Wi-Fi access'],
    ['請問學校無線網路密碼是多少？','校園無線網路連線'],
    ['請問校園 Wi-Fi 怎麼連線？','校園無線網路連線'],
    ['How do I apply for a leave of absence for this semester?','Taking a semester off or withdrawing'],
    ['Can I take next semester off?','Taking a semester off or withdrawing'],
    ['我想休學該怎麼辦？','休學與退學'],
    ['How do I file sick leave?','Student Leave form'],
    ['Where is the class absence form?','Student Leave form'],
    ['Where do I file for leave?','Student Leave form'],
    ['請問學生假單要在哪裡填寫？','學生請假填單'],
  ]){
    assert.equal(answerStudentSupportGuidance(prompt)?.activity?.[0].detail,detail,prompt);
  }
  for(const prompt of ['Show my current leave status','Where can I file a leave request on stu.best?',
    'File a leave for me','Withdraw my leave request','Withdraw my Database Design course','How do I withdraw my tuition refund?',
    'what is the school wifi pass and what is my remaining balance','what is my wi-fi password: secret',
    'Send me someone else’s school Wi-Fi password','where can I file a leave and how many have I filed?','我想查詢我的休學狀態',
    'Where can I submit my leave request?','Why is my Wi-Fi password wrong?','How do I connect to the campus Wi-Fi and check my grades?',
    'I need to stop attending my Database Design class','I’m thinking of dropping my leave request']){
    assert.equal(answerStudentSupportGuidance(prompt),null,prompt);
  }
});

test('profile and announcement privacy requests do not load either account data or public research',async t=>{
  const unexpected=()=>assert.fail('Privacy questions must use neither an account lookup nor public research.');
  t.mock.method(globalThis,'fetch',unexpected);
  const signed=createAffairsAssistantHandler({
    verifyToken:async token=>({user:{id:'2f734a98-0000-4000-8000-000000000905'},token,key:'fixture-key',url:'https://xiftudmvxphxcjtmfmib.supabase.co'}),
    loadSnapshot:unexpected,answerAccount:unexpected,publicResearch:unexpected,
  });
  const guest=createResearchAssistantHandler();
  for(const [index,[question,route,answer]] of [
    ['Show another student’s student profile records.','/school-affairs/services/8-1','I can’t access another student’s profile records.'],
    ['Show another student’s announcement email records.','/school-affairs/services/2-1','I can’t check another student’s announcement email preference.'],
  ].entries()){
    for(const handler of [guest,signed]){
      const {result,code}=await request(handler,question,route,[],'privacy-case-'+index);
      assert.equal(code,200);
      assert.equal(result.status,'handoff');
      assert.equal(result.answer.split('\n\n')[0],answer);
      assert.deepEqual(result.citations,[]);
      assert.equal(result.views,undefined);
    }
  }
});

test('venue verification retries temporary scoped reads, keeps the third check on reload, and never discloses a foreign row',async t=>{
  const {sanitizeStoredConversation}=await import('../../server/assistantConversationData.js');
  const origin='https://xiftudmvxphxcjtmfmib.supabase.co',route='/school-affairs/services/44-1';
  const owner='2f734a98-0000-4000-8000-000000000910',peer='2f734a98-0000-4000-8000-000000000911';
  const question='Show my saved venue requests.';
  const requests:string[]=[];
  const baseRecord={id:'2f734a98-0000-4000-8000-000000000912',user_id:owner,venue:'T0308',booking_date:'2026-11-23',
    period:'2',status:'approved',created_at:'2026-11-15T07:00:00.000123+00:00'};
  let run:'recover'|'persistent'|'foreign'='recover';
  t.mock.method(globalThis,'fetch',async (value:URL,init:RequestInit)=>{
    assert.equal(value.origin,origin);
    assert.equal(value.pathname,'/rest/v1/affairs_venue_requests');
    assert.equal(value.searchParams.get('user_id'),'eq.'+owner);
    assert.equal(value.searchParams.get('select'),'id,user_id,venue,booking_date,period,status,created_at');
    assert.equal(init.method,'GET');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer guidance-test');
    requests.push(value.href);
    if(run==='persistent'||run==='recover'&&requests.length<3||run==='foreign'&&requests.length===1)
      return new Response(null,{status:503});
    const record=run==='foreign'?{...baseRecord,user_id:peer,venue:'M9999'}:baseRecord;
    return Response.json([record],{headers:{'content-range':'0-0/1'}});
  });
  const unexpected=()=>assert.fail('Venue questions require only the scoped reader.');
  const signed=createAffairsAssistantHandler({
    verifyToken:async token=>({user:{id:owner},token,key:'fixture-key',url:origin}),
    loadSnapshot:unexpected,answerAccount:unexpected,publicResearch:unexpected,
  });
  const recovered=await request(signed,question,route,[],'venue');
  assert.deepEqual(recovered.result.verification,{status:'verified',attempts:3});
  assert.match(recovered.result.answer,/T0308/u);
  assert.equal(requests.length,3);
  assert.equal(new Set(requests).size,1);
  const [saved]=sanitizeStoredConversation([{id:'a0',role:'assistant',content:recovered.result.answer,result:recovered.result}]);
  assert.deepEqual(saved.result?.verification,{status:'verified',attempts:3});

  run='persistent';requests.length=0;
  const unavailable=await request(signed,question,route,[],'venue');
  assert.deepEqual(unavailable.result.verification,{status:'unverified',attempts:3,reason:'evidence_unavailable'});
  assert.match(unavailable.result.answer,/couldn’t verify your saved venue requests/u);
  assert.ok(unavailable.result.answer.includes(route));
  assert.equal(requests.length,3);

  run='foreign';requests.length=0;
  const denied=await request(signed,question,route,[],'venue');
  assert.deepEqual(denied.result.verification,{status:'unverified',attempts:2,reason:'evidence_unavailable'});
  assert.doesNotMatch(JSON.stringify(denied.result),/M9999/u);
  assert.equal(requests.length,2);
});
