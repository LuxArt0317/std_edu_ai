import test from 'node:test';
import assert from 'node:assert/strict';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {nativePageLookupContext} from '../../server/accountSupplementalLookup.js';
import {planAccountLookup} from '../../server/answerVerificationAccount.js';

const route='/school-affairs/services/21-3',owner='22000000-0000-4000-8000-000000000001',student='22000000-0000-4000-8000-000000000002',charge='22000000-0000-4000-8000-000000000003';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}};
const positives=[
  'Show my fee remission without my student number. Also show my tuition balance.',
  'Show my fee remission. Also please show my tuition balance.',
  'Show my fee remission. Then please show my tuition balance separately.',
  'Also show my tuition balance. Show my fee remission without my student number.',
  'Show my fee remission. Also what remains unpaid for QA Tuition instalment?',
];
const negatives=[
  'Show my fee remission. Also do not show my tuition balance.',
  'Show my fee remission. Please do not show my tuition balance.',
  'Show my fee remission. Also please never show my tuition balance.',
  'Show my fee remission. Then do not show my tuition balance and my grades.',
  'Show my fee remission without my tuition balance and my grades.',
];
test('courtesy/continuation prefixes normalize only the single positive fee-balance clause',async()=>{
  for(const question of positives){
    const selected=nativePageLookupContext(question,route);assert.equal(selected.feeAndBalance,true,question);
    assert.deepEqual((await planAccountLookup(question,[],route,0)).tools,['feeRemission','charges'],question);
  }
  assert.equal(nativePageLookupContext(positives.at(-1)!,route).feeChargeLabel,'QA Tuition instalment');
  for(const question of negatives){
    const selected=nativePageLookupContext(question,route);assert.equal(selected.feeAndBalance,false,question);assert.equal(selected.readerOnly,true,question);
    assert.deepEqual((await planAccountLookup(question,[],route,0)).tools,['feeRemission'],question);
  }
  for(const question of ['Show my fee remission. Also show my tuition balance and my grades.','Show my fee remission. Also show my tuition balance for Alice.','Show my fee remission. Please pay my tuition balance.']){
    assert.equal(nativePageLookupContext(question,route).feeAndBalance,false,question);
  }
});

test('actual API uses only the scoped charges reader for either clause order and performs no charge read for exclusions',async()=>{
  const original=globalThis.fetch;let requests:string[]=[];
  const native={userId:owner,records:[{id:charge,version:1,row_order:0,academic_year_text:'115',semester_text:'1',student_number:'EXCLUDED_STUDENT_NUMBER',category_text:'QA remission',amount_text:'0',check_status_text:null,notes_text:null}]};
  const transportErrors:unknown[]=[];
  globalThis.fetch=async(input,init)=>{
    try{
      const target=new URL(String(input));assert.equal(target.origin,account.url);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
      requests.push(target.pathname);
      if(target.pathname==='/rest/v1/rpc/affairs_read_fee_remission'){assert.equal(init?.method,'POST');assert.equal(init?.body,'{}');return Response.json(native);}
      assert.equal(init?.method,'GET');
      if(target.pathname==='/rest/v1/affairs_students'){assert.equal(target.searchParams.get('user_id'),'eq.'+owner);return Response.json([{id:student,user_id:owner}]);}
      assert.equal(target.pathname,'/rest/v1/affairs_charges');assert.equal(target.searchParams.get('student_id'),'eq.'+student);
      return Response.json([{id:charge,student_id:student,label:'QA Tuition instalment',amount_due:28000,amount_paid:5000,currency:'TWD',source_mode:'sample',due_on:null}]);
    }catch(error){transportErrors.push(error);throw error;}
  };
  try{
    for(const question of [...positives,...negatives]){
      requests=[];const withCharges=positives.includes(question);let answerCalls=0;
      const handler=createAffairsAssistantHandler({verifyToken:async()=>account,loadSnapshot:async()=>assert.fail('A broad workspace read is not authorized by these two clauses'),
        publicResearch:async()=>assert.fail('No public research for this account-only request'),
        answerAccount:async options=>{
          answerCalls++;assert.deepEqual(Object.keys(options.snapshot).sort(),withCharges?['charges','checkedAt','profile','studentRecordFound',...(question===positives.at(-1)?['chargeSelectionLabel']:[])].sort():['checkedAt','profile']);
          assert.equal(options.snapshot.profile.userId,owner);
          if(withCharges)assert.deepEqual(options.snapshot.charges.map((row:{label:string})=>row.label),['QA Tuition instalment']);
          const fee=await options.supplementalReaders!.feeRemission!({question,route,history:[],snapshot:options.snapshot,deadline:Date.now()+5000});
          assert.equal(fee.readState,'ok');assert.doesNotMatch(fee.evidence.content,/EXCLUDED_STUDENT_NUMBER/u);
          // This boundary test supplies no verification verdict; graph verification is covered separately.
          return {status:'answered',answer:'Offline scoped-transport check.',citations:[]};
        }});
      const result:{status:number;body:unknown}={status:200,body:null};
      const response={status(value:number){result.status=value;return response;},json(value:unknown){result.body=value;},setHeader(){}};
      await handler({method:'POST',headers:{authorization:'Bearer '+account.token},body:{question,route}},response);
      assert.equal(result.status,200,question);assert.equal(answerCalls,1,question);
      assert.deepEqual(requests,[...(withCharges?['/rest/v1/affairs_students','/rest/v1/affairs_charges']:[]),'/rest/v1/rpc/affairs_read_fee_remission'],question);
      assert.deepEqual(transportErrors,[]);
    }
  }finally{globalThis.fetch=original;}
});
