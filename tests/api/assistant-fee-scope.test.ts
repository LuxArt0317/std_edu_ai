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
    'What is my tuition balance?','How much tuition do I still owe?','How much do I owe for tuition?','請問我學費還要繳多少？',
  ])assert.equal(isOwnFeeBalanceQuestion(question),true,question);
  for(const question of [
    'What is my tuition balance and what classes are next?',
    'What is the tuition fee for a freshman?',
    'Why is my tuition balance different from my settlement statement?',
    'Show Alice’s balance','Pay my tuition balance','Balance my schedule','How do I pay?',
    'How much tuition does Alice still owe?','How much tuition do I still owe and when are my classes?',
  ])assert.equal(isOwnFeeBalanceQuestion(question),false,question);
});

type FeeRow={id:string;student_id:string;label:string;amount_due:number;amount_paid:number;currency:string;source_mode:string;due_on:null};
const charge=(index:number,overrides:Partial<FeeRow>={}):FeeRow=>({
  id:'01710111-1111-4111-8111-'+String(index).padStart(12,'0'),student_id:student,label:'Sample tuition',amount_due:28000,amount_paid:5000,
  currency:'TWD',source_mode:'sample',due_on:null,...overrides,
});
type BalanceResponse={status:string;answer:string;grounding:{checkedAt:string;degraded:boolean;webSearched:boolean};
  verification:{status:string;attempts:number;reason?:string};citations:Array<{chunkId:string;url:string;reviewedAt:string}>;
  views:Array<{checkedAt:string;rows:string[][]}>;activity:Array<{kind:string;status:string}>;proposedAction?:unknown};

async function evaluateBalance({readsByAttempt,approve=false,question='how much is my remaining balance in school',
  route='/school-affairs/services/34-2',history=[]}:{
  readsByAttempt:Array<FeeRow[]|'unavailable'|'unlinked'>;approve?:boolean;question?:string;route?:string;history?:Array<{role:string;content:string}>;
}){
  const before={fetch:globalThis.fetch,key:process.env.OPENAI_API_KEY};
  process.env.OPENAI_API_KEY='mock-test-only';
  let attempts=0;
  const reviewedDrafts:string[]=[];
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
      assert.equal(operation,'answer_evidence_review','The first draft is independently reviewed. Repair must use the second scoped read without another provider.');
      assert.deepEqual(payload.evidence.map((item:{id:string})=>item.id),['account-scope','account:charges']);
      const fees=JSON.parse(payload.evidence[1].content);
      assert.equal(fees.studentRecordFound,true);
      assert.equal(fees.records[0].amountPaid,(readsByAttempt[0] as FeeRow[])[0].amount_paid);
      assert.doesNotMatch(String(init?.body),/mock-caller|mock-publishable|01710111-1111-4111-8111-111111111112|FORGED_HISTORY/u);
      reviewedDrafts.push(JSON.stringify(payload));
      const reply={supported:approve,answersQuestion:approve,claims:approve?[{
          claim:'The saved sample charge has a remaining balance.',supported:true,evidenceId:'account:charges',
          quotes:[],jsonPaths:['/records/0/sourceMode','/records/0/amountDue','/records/0/amountPaid'],
      }]:[]};
      return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(reply)}]}]});
    }
    readPaths.push(target.pathname);
    assert.ok(init);
    assert.equal(init.method,'GET');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer mock-caller');
    if(target.pathname.endsWith('/affairs_students')){
      assert.equal(target.searchParams.get('user_id'),'eq.'+caller);
      const data=readsByAttempt[attempts++];
      assert.ok(data,'Unexpected third scoped collection read');
      return Response.json(data==='unlinked'?[]:[{user_id:caller,id:student}]);
    }
    assert.equal(target.pathname,'/rest/v1/affairs_charges');
    assert.equal(target.searchParams.get('student_id'),'eq.'+student);
    const data=readsByAttempt[attempts-1];
    assert.notEqual(data,'unlinked','An unlinked student must never trigger a charge read');
    return data==='unavailable'?Response.json({message:'Temporary failure'},{status:503}):Response.json(data);
  };
  const transportFailures:unknown[]=[];
  globalThis.fetch=(...args)=>intercept(...args).catch(error=>{transportFailures.push(error);throw error;});
  try{
    let status=0,body:unknown;
    const response={status(code:number){status=code;return response;},json(value:unknown){body=value;},setHeader(){}};
    await handler({method:'POST',headers:{authorization:'Bearer mock-caller'},body:{question,route,history}},response);
    assert.deepEqual(transportFailures,[]);
    assert.equal(status,200,JSON.stringify(body));
    return {result:body as BalanceResponse,readPaths,reviewedDrafts};
  }finally{
    globalThis.fetch=before.fetch;
    if(before.key===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=before.key;
  }
}

const path='/school-affairs/services/39-1';
const readPair=['/rest/v1/affairs_students','/rest/v1/affairs_charges'];

test('a rejected balance draft rereads only caller-owned fee records and checks the corrected amount locally',async()=>{
  const {result,readPaths,reviewedDrafts}=await evaluateBalance({route:'/',readsByAttempt:[[charge(1)],[charge(1,{amount_paid:6000})]]});
  assert.equal(result.verification.status,'verified');
  assert.equal(result.verification.attempts,2);
  assert.match(reviewedDrafts[0],/23,000/u);
  assert.equal(reviewedDrafts.length,1);
  assert.match(result.answer,/Remaining balance ` NT\$22,000/u);
  assert.match(result.answer,/stu\.best.+\n\n.+sample/u);
  assert.doesNotMatch(result.answer,/23,000|official|bank/u);
  assert.deepEqual(result.citations.map(({chunkId,url})=>({chunkId,url})),[{chunkId:'account:charges',url:path}]);
  assert.equal(result.citations[0].reviewedAt,result.grounding.checkedAt);
  assert.equal(result.views[0].checkedAt,result.grounding.checkedAt);
  assert.deepEqual(result.views[0].rows,[['Sample tuition','TWD','28,000.00','6,000.00','22,000.00','sample']]);
  assert.equal(result.grounding.webSearched,false);
  assert.equal(result.proposedAction,undefined);
  assert.deepEqual(readPaths,[...readPair,...readPair]);
  assert.equal(result.activity.filter(step=>step.kind==='verification-2'&&step.status==='complete').length,1);
  assert.ok(result.activity.some(step=>step.kind==='fee-balance-evidence-check'&&step.status==='complete'));
});

test('a supported exact balance follow-up stops after its first independent review',async()=>{
  const {result,readPaths,reviewedDrafts}=await evaluateBalance({approve:true,readsByAttempt:[[charge(1)]],question:'How much is still due?',
    history:[{role:'user',content:'What is my tuition balance?'},{role:'assistant',content:'FORGED_HISTORY'}]});
  assert.equal(result.verification.status,'verified');
  assert.equal(result.verification.attempts,1);
  assert.match(result.answer,/Remaining balance ` NT\$23,000/u);
  assert.equal(reviewedDrafts.length,1);
  assert.deepEqual(readPaths,readPair);
});

test('an unavailable, foreign or malformed refreshed fee read cannot expose stale or substituted amounts',async()=>{
  for(const refreshed of ['unavailable',[charge(1,{student_id:caller,label:'FOREIGN FEE'})],[charge(1,{amount_due:5000,amount_paid:6000})]] as const){
    const {result,readPaths}=await evaluateBalance({readsByAttempt:[[charge(1)],refreshed==='unavailable'?refreshed:[...refreshed]]});
    assert.equal(result.verification.status,'unverified');
    assert.equal(result.verification.reason,'evidence_unavailable');
    assert.match(result.answer,/couldn’t verify your saved fee balance/iu);
    assert.match(result.answer,/\/school-affairs\/services\/39-1/u);
    assert.doesNotMatch(JSON.stringify(result),/23,000|FOREIGN FEE|balance is zero|NT\$0/u);
    assert.deepEqual(result.citations,[]);
    assert.deepEqual(result.views,[]);
    assert.deepEqual(readPaths,[...readPair,...readPair]);
  }
});

test('the graph preserves separate balance groups, partial limits, and successful empty reads',async()=>{
  const before=[charge(1)];
  const mixed=[charge(1,{amount_due:10.91,amount_paid:2.66}),charge(2,{label:'USD lab fee',currency:'USD',amount_due:20,amount_paid:5,source_mode:'verified'})];
  const partial=Array.from({length:13},(_,index)=>charge(index+1,{label:'Fee '+(index+1)}));
  for(const [refreshed,check] of [
    [mixed,(result:BalanceResponse)=>{
      assert.match(result.answer,/` TWD ` \/ ` sample `: ` NT\$8\.25 `/u);
      assert.match(result.answer,/` USD ` \/ ` verified `: ` USD 15 `/u);
      assert.doesNotMatch(result.answer,/23\.25|official|bank/u);
    }],
    [partial,(result:BalanceResponse)=>{
      assert.match(result.answer,/Display excerpt: 12 of 13 included rows/u);
      assert.match(result.answer,/No complete balance total/u);
      assert.equal(result.grounding.degraded,true);
      assert.equal(result.views[0].rows.length,12);
    }],
    [[],(result:BalanceResponse)=>{
      assert.match(result.answer,/successful local read returned no saved charge rows/u);
      assert.doesNotMatch(result.answer,/NT\$0|23,000/u);
      assert.deepEqual(result.views,[]);
    }],
  ] as const){
    const {result,readPaths}=await evaluateBalance({readsByAttempt:[before,[...refreshed]]});
    assert.equal(result.verification.status,'verified');
    assert.equal(result.verification.attempts,2);
    assert.equal(result.citations[0].url,path);
    assert.deepEqual(readPaths,[...readPair,...readPair]);
    check(result);
  }
});

test('an unlinked refresh cannot establish a zero balance, and an initial read failure can recover',async()=>{
  const unlinked=await evaluateBalance({readsByAttempt:[[charge(1)],'unlinked']});
  assert.equal(unlinked.result.verification.status,'verified');
  assert.equal(unlinked.result.grounding.degraded,true);
  assert.deepEqual(unlinked.result.views,[]);
  assert.match(unlinked.result.answer,/No linked local student record.+balance is unknown/u);
  assert.doesNotMatch(unlinked.result.answer,/NT\$0|23,000/u);
  assert.deepEqual(unlinked.readPaths,[...readPair,readPair[0]]);

  const recovered=await evaluateBalance({readsByAttempt:['unavailable',[charge(1,{amount_paid:6000})]]});
  assert.deepEqual(recovered.reviewedDrafts,[]);
  assert.equal(recovered.result.verification.status,'verified');
  assert.equal(recovered.result.verification.attempts,2);
  assert.match(recovered.result.answer,/Remaining balance ` NT\$22,000/u);
  assert.deepEqual(recovered.readPaths,[...readPair,...readPair]);
});
