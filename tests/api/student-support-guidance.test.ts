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

test('the three reported questions use directly sourced guidance in guest and signed-in chat with prior private context',async t=>{
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
    ['請問學校無線網路密碼是多少？','校園無線網路連線'],
    ['How do I apply for a leave of absence for this semester?','Taking a semester off or withdrawing'],
    ['我想休學該怎麼辦？','休學與退學'],
    ['How do I file sick leave?','Student Leave form'],
    ['請問學生假單要在哪裡填寫？','學生請假填單'],
  ]){
    assert.equal(answerStudentSupportGuidance(prompt)?.activity?.[0].detail,detail,prompt);
  }
  for(const prompt of ['Show my current leave status','Where can I file a leave request on stu.best?',
    'File a leave for me','Withdraw my leave request','Withdraw my Database Design course','How do I withdraw my tuition refund?',
    'what is the school wifi pass and what is my remaining balance','what is my wi-fi password: secret',
    'Send me someone else’s school Wi-Fi password','where can I file a leave and how many have I filed?','我想查詢我的休學狀態']){
    assert.equal(answerStudentSupportGuidance(prompt),null,prompt);
  }
});
