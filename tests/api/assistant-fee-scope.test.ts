import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {isOwnFeeBalanceQuestion} from '../../server/pendingFeesAnswer.js';

const caller='01710111-1111-4111-8111-111111111111';
const student='01710111-1111-4111-8111-111111111112';
const url='https://xiftudmvxphxcjtmfmib.supabase.co';

test('the exact own fee scope leaves compound, public, mutation and other-person queries to their established routing',()=>{
  for(const question of [
    'how much is my remaining balance in school','How much do I still owe?','List my unpaid school fees.',
    'What is my tuition balance?','請問我學費還要繳多少？',
  ])assert.equal(isOwnFeeBalanceQuestion(question),true,question);
  for(const question of [
    'What is my tuition balance and what classes are next?',
    'What is the tuition fee for a freshman?',
    'Why is my tuition balance different from my settlement statement?',
    'Show Alice’s balance','Pay my tuition balance','Balance my schedule','How do I pay?',
  ])assert.equal(isOwnFeeBalanceQuestion(question),false,question);
});

test('the reported balance question reads only its own charge source, even on retry from a separate service',async()=>{
  const before={fetch:globalThis.fetch,key:process.env.OPENAI_API_KEY};
  process.env.OPENAI_API_KEY='mock-test-only';
  let reads=0,reviews=0,corrections=0;
  const readPaths:string[]=[];
  const handler=createAffairsAssistantHandler({
    verifyToken:async value=>{
      assert.equal(value,'mock-caller');
      return {url,token:'mock-caller',key:'mock-publishable',user:{id:caller}};
    },
    loadSnapshot:async()=>assert.fail('Unrelated collections must remain unread'),
  });
  const intercept:typeof fetch=async(input,init)=>{
    const target=new URL(String(input));
    if(target.origin!==url){
      assert.equal(target.origin,'https://api.openai.com');
      const request=JSON.parse(String(init?.body));
      const operation=request.text.format.name;
      const payload=JSON.parse(request.input[0].content[0].text);
      assert.ok(['answer_evidence_review','correct_grounded_answer'].includes(operation));
      assert.deepEqual(payload.evidence.map((item:{id:string})=>item.id),['account-scope','account:charges']);
      const fees=JSON.parse(payload.evidence[1].content);
      assert.equal(fees.studentRecordFound,true);
      assert.equal(fees.records[0].amountPaid,reads===1?5000:6000);
      assert.doesNotMatch(String(init?.body),/mock-caller|mock-publishable|0111-1111-4111-8111-111111111112/u);
      let reply;
      if(operation==='correct_grounded_answer'){
        corrections++;
        reply={status:'answered',answer:'The saved sample tuition charge has NT$22,000 remaining.',sourceIds:['account:charges']};
      }else{
        reviews++;
        reply={supported:reviews===2,answersQuestion:reviews===2,claims:reviews===1?[]:[{
          claim:'The saved sample charge has NT$22,000 remaining.',supported:true,evidenceId:'account:charges',
          quotes:[],jsonPaths:['/records/0/sourceMode','/records/0/amountDue','/records/0/amountPaid'],
        }]};
      }
      return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(reply)}]}]});
    }
    readPaths.push(target.pathname);
    assert.ok(init);
    assert.equal(init.method,'GET');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer mock-caller');
    if(target.pathname.endsWith('/affairs_students')){
      assert.equal(target.searchParams.get('user_id'),'eq.'+caller);
      return Response.json([{user_id:caller,id:student}]);
    }
    assert.equal(target.pathname,'/rest/v1/affairs_charges');
    assert.equal(target.searchParams.get('student_id'),'eq.'+student);
    reads++;
    return Response.json([{id:'01710111-1111-4111-8111-111111111114',student_id:student,label:'Sample tuition',
      amount_due:28000,amount_paid:reads===1?5000:6000,currency:'TWD',source_mode:'sample',due_on:null}]);
  };
  const transportFailures:unknown[]=[];
  globalThis.fetch=(...args)=>intercept(...args).catch(error=>{transportFailures.push(error);throw error;});
  try{
    let status=0,body:unknown;
    const response={status(code:number){status=code;return response;},json(value:unknown){body=value;},setHeader(){}};
    await handler({method:'POST',headers:{authorization:'Bearer mock-caller'},body:{
      question:'how much is my remaining balance in school',route:'/school-affairs/services/34-2',
    }},response);
    assert.deepEqual(transportFailures,[]);
    assert.equal(status,200,JSON.stringify(body));
    const result=body as {answer:string;verification:{status:string;attempts:number};citations:Array<{url:string}>};
    assert.equal(result.verification.status,'verified');
    assert.equal(result.verification.attempts,2);
    assert.match(result.answer,/22,000/u);
    assert.ok(result.citations.some(item=>item.url==='/school-affairs/services/39-1'));
    assert.equal(corrections,1);
    assert.deepEqual(readPaths,['/rest/v1/affairs_students','/rest/v1/affairs_charges','/rest/v1/affairs_students','/rest/v1/affairs_charges']);
  }finally{
    globalThis.fetch=before.fetch;
    if(before.key===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=before.key;
  }
});
