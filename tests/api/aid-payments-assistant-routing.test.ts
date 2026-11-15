import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {aidPaymentsFields,aidPaymentsPaths} from '../../server/aidPaymentsContract.js';
import {planAccountLookup} from '../../server/answerVerificationAccount.js';
import {buildAccountCases} from '../evaluation/account-cases.mjs';
import {buildServiceCases} from '../evaluation/service-cases.mjs';
import {aidPaymentFixtureManifest} from '../evaluation/aid-payment-fixture-plan.mjs';
import {gradeCase} from '../evaluation/grading.mjs';

const path=aidPaymentsPaths.salary;
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const userId='37000000-0000-4000-8000-000000000001';
const account={url:origin,key:'AID_TEST_KEY',token:'AID_TEST_TOKEN',user:{id:userId}};
const blocked=async()=>assert.fail('No broad or public lookup is authorized for this question.');
const signedIn=createAffairsAssistantHandler({
  verifyToken:async token=>{assert.equal(token,account.token);return account;},loadSnapshot:blocked,publicResearch:blocked,
});
const guest=createResearchAssistantHandler();
let address=10;
async function ask(question:string,{handler=signedIn,route=path,history=[] as {role:string;content:string}[],events}: {
  handler?:typeof signedIn;route?:string;history?:{role:string;content:string}[];events?:unknown[];
}={}){
  const result:{body:any;status:number}={body:null,status:200};
  const response={setHeader(){},status(status:number){result.status=status;return response;},json(body:unknown){result.body=body;},end(){},
    write(packet:string){
      const [,type,text]=/^event: (\w+)\ndata: (.+)\n\n$/u.exec(packet)??[];
      if(type==='progress')events?.push(JSON.parse(text));
      if(type==='result'||type==='error')result.body=JSON.parse(text);
    }};
  await handler({method:'POST',headers:{authorization:'Bearer '+account.token,'x-forwarded-for':'192.0.2.'+(address++)},body:{question,route,history,stream:!!events}},response);
  assert.equal(result.status,200,JSON.stringify(result.body));
  return result.body;
}

test('the actual handler passes the independent period, net pay, tax, bank and account-boundary cases',async()=>{
  const original=globalThis.fetch,calls:string[]=[];
  const fixtureUser='37000000-0000-4000-8000-000000000030';
  const handler=createAffairsAssistantHandler({verifyToken:async token=>{
    assert.equal(token,account.token);
    return {...account,user:{id:fixtureUser}};
  },loadSnapshot:blocked,publicResearch:blocked});
  let empty=false;
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),origin+'/rest/v1/rpc/affairs_read_aid_payments');
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
    const request=JSON.parse(String(init?.body));
    const view=request.p_view as 'salary'|'claims';
    assert.deepEqual(request,{p_view:view,p_offset:0,p_summary:false});
    calls.push(view);
    const actual=empty?[]:aidPaymentFixtureManifest.A[view];
    return Response.json({view,userId:fixtureUser,total:actual.length,rows:actual.map((row:unknown,index:number)=>({
      id:'37000000-0000-4000-8000-00000000000'+String(index+2),...(row as object)}))});
  };
  try{
    const bank=buildAccountCases();
    for(const id of ['salary-multipart','salary-tax','both','bank-unavailable','foreign','empty']){
      empty=id==='empty';
      const testCase=bank.find(row=>row.id==='account:aid-payments-'+id);
      assert.ok(testCase);
      const events:unknown[]=[];
      const before=calls.length;
      const body=await ask(testCase.question,{handler,route:testCase.route,events});
      const result=gradeCase(testCase,{statusCode:200,execution:'recorded',fixtureKey:testCase.fixtureKey,events,body});
      assert.equal(result.passed,true,JSON.stringify({id,answer:body.answer,failures:result.failures}));
      assert.equal(calls.length-before,id==='foreign'?0:id==='both'?2:1,id);
      assert.doesNotMatch(JSON.stringify(body),/bank_last4|0101|AID_TEST_TOKEN/);
      if(id==='bank-unavailable'){
        assert.doesNotMatch(body.answer,/5400|6200/);
        assert.deepEqual(body.views,[]);
      }
      if(id==='salary-tax')assert.deepEqual(body.views[0].rows,[
        ['2026-09 local period','0'],['2026-10 local period','not recorded'],
      ]);
      if(id==='both')assert.deepEqual(body.views.map((view:{columns:string[]})=>view.columns),[['Reason'],['Saved period','Net pay']]);
    }
    const claimCases=buildServiceCases().filter(row=>row.serviceId==='37-1'&&row.mode!=='navigation');
    for(const testCase of claimCases){
      empty=testCase.mode==='empty';
      const events:unknown[]=[],before=calls.length;
      const body=await ask(testCase.question,{handler,route:testCase.route,events});
      const {requireUnchangedOwnedRecords:_hostedReadback,...expected}=testCase.expected;
      const result=gradeCase({...testCase,expected},{statusCode:200,execution:'deterministic',fixtureKey:testCase.fixtureKey,events,body});
      assert.deepEqual(result.failures,[],JSON.stringify({id:testCase.id,answer:body.answer}));
      assert.deepEqual(calls.slice(before),['claims'],testCase.id);
    }
    const navigation=buildServiceCases().find(row=>row.id==='service:37-1:navigation')!;
    const before=calls.length,body=await ask(navigation.question,{handler,route:navigation.route});
    assert.equal(body.citations[0].url,aidPaymentsPaths.claims);
    assert.equal(calls.length,before);
  }finally{globalThis.fetch=original;}
});

test('privacy, skip, direct navigation and invalid pages avoid all transport',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=blocked;
  try{
    for(const question of ['Show Alice’s student salary records.','Show the student aid claims for student BZ2048.','查詢王小明的工讀薪資。','Show her records.']){
      for(const handler of [signedIn,guest]){
        const result=await ask(question,{handler});
        assert.equal(result.status,'handoff',question);
        assert.deepEqual(result.citations,[],question);
        assert.equal(result.activity,undefined);
      }
    }
    for(const handler of [signedIn,guest]){
      const navigation=await ask('Where can I see my student salary?',{handler});
      assert.equal(navigation.citations[0].url,path);
      const directions=await ask('Where can I open my student salary records on stu.best?',{handler,route:'/dtm'});
      assert.equal(directions.citations[0].url,path);
      assert.equal((await ask('Where is the student aid claims page?',{handler,route:'/'})).citations[0].url,aidPaymentsPaths.claims);
      const invalid=await ask('Show page 202 of my student salary.',{handler});
      assert.equal(invalid.status,'clarification');
      assert.match(invalid.answer,/1 to 201/u);
      const excluded=await ask('Please do not show my student salary.',{handler});
      assert.match(excluded.answer,/skipped/u);
      assert.deepEqual(excluded.citations,[]);
      for(const [question,pattern,link] of [
        ['Download my official student salary payment certificate.',/can’t download/u,path],
        ['Approve my student aid claim and pay it now.',/can’t approve or pay/u,aidPaymentsPaths.claims],
      ] as const){
        const unsupported=await ask(question,{handler});
        assert.match(unsupported.answer,pattern);
        assert.equal(unsupported.citations[0].url,link);
        assert.equal(unsupported.proposedAction,undefined);
      }
    }
    const next=await ask('Show page 2 of my student salary.',{handler:guest});
    assert.equal(next.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(path+'?page=2'));
  }finally{globalThis.fetch=original;}
});

test('the API and graph agree on salary, fee and timetable collections without stale page history',async()=>{
  for(const [question,expected] of [
    ['Show page 2 of my student salary.',['aidPayments']],
    ['Show my tuition balance. List my saved student salary.',['aidPayments','charges']],
    ['Show my student salary. What is my next class?',['aidPayments','courses']],
    ['Which class do I have next? Do not show my student salary.',['courses']],
  ]){
    const plan=await planAccountLookup(String(question),[],path,Date.now()-1);
    assert.deepEqual(plan.tools,expected,String(question));
  }
  const plan=await planAccountLookup('What is its status?',[
    {role:'user',content:'Show my student salary.'},
    {role:'user',content:'Show my tuition settlement.'},
  ],path,Date.now()-1);
  assert.ok(!plan.tools.includes('aidPayments'));
});

test('native page reads follow the caller token through verification, reread and abstention',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='AID_TEST_MODEL';
  try{
    for(const reject of [0,1,2,3]){
      const sequence:string[]=[],failures:unknown[]=[];
      let reads=0,checks=0;
      async function mock(input:RequestInfo|URL,init?:RequestInit){
        const url=new URL(String(input));
        const body=JSON.parse(String(init?.body));
        if(url.origin===origin){
          assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_aid_payments');
          assert.deepEqual(body,{p_view:'salary',p_offset:25,p_summary:false});
          assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+account.token);
          const row={id:'37000000-0000-4000-8000-000000000002',...Object.fromEntries(aidPaymentsFields.salary.map(([field])=>[field,null])),
            payment_period:'Synthetic period '+(++reads),net:0,bank_last4:'0456'};
          sequence.push('salary');
          return Response.json({view:'salary',userId,total:26,rows:[row]});
        }
        assert.equal(url.origin,'https://api.openai.com');
        const request=JSON.parse(body.input[0].content[0].text),stage=body.text.format.name;
        sequence.push(stage);
        const source='account:aidPayments';
        assert.deepEqual(request.evidence.map((item:{id:string})=>item.id),['account-scope',source]);
        assert.doesNotMatch(JSON.stringify(request.evidence),/0456|AID_TEST_KEY|AID_TEST_TOKEN|bank_last4/u);
        const data=JSON.parse(request.evidence[1].content);
        assert.equal(data.views[0].page,2);
        assert.equal(data.views[0].records[0].payment_period,'Synthetic period '+reads);
        assert.equal(data.views[0].records[0].net,0);
        const supported=stage==='answer_evidence_review'&&++checks>reject;
        const result=stage==='answer_evidence_review'?
          {supported,answersQuestion:supported,claims:[{claim:'Synthetic saved payroll period',supported,evidenceId:source,jsonPaths:['/views/0/records/0/payment_period'],quotes:[]}]}:
          {status:'answered',answer:'Page 2 shows Synthetic period '+reads+' with saved net pay of 0. These are local records.',sourceIds:[source]};
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
      }
      globalThis.fetch=(...args)=>mock(...args).catch(error=>{failures.push(error);throw error;});
      const answer=await ask('Show page 2 of my student salary.');
      assert.deepEqual(failures,[]);
      assert.equal(reads,reject?2:1,JSON.stringify(sequence));
      assert.equal(checks,Math.min(reject+1,3),JSON.stringify(sequence));
      assert.equal(answer.verification.status,reject===3?'unverified':'verified');
      if(reject===3)assert.doesNotMatch(answer.answer,/Synthetic period/u);
      else{
        assert.match(answer.answer,new RegExp('Synthetic period '+reads,'u'));
        assert.ok(answer.citations.some((item:{url:string})=>item.url===path+'?page=2'));
      }
    }
  }finally{
    globalThis.fetch=original;
    if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  }
});

test('combined fee and timetable questions check independent sources in both clause orders',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='AID_TEST_MODEL';
  const studentId='37000000-0000-4000-8000-000000000010';
  const source='account:aidPayments';
  try{
    for(const [target,questionPart] of [['charges','What is my tuition balance?'],['courses','What is my next class?']]){
      for(const reverse of [false,true]){
        const observed:string[]=[],failures:unknown[]=[];
        async function mock(input:RequestInfo|URL,init?:RequestInit){
          const endpoint=new URL(String(input));
          if(endpoint.origin===origin){
            const table=endpoint.pathname.split('/').at(-1)!;
            observed.push(table);
            assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+account.token);
            if(table==='affairs_read_aid_payments'){
              assert.deepEqual(JSON.parse(String(init?.body)),{p_view:'salary',p_offset:0,p_summary:false});
              return Response.json({view:'salary',userId,total:1,rows:[{id:'37000000-0000-4000-8000-000000000002',
                ...Object.fromEntries(aidPaymentsFields.salary.map(([field])=>[field,null])),payment_period:'Local work period',net:1500}]});
            }
            if(table==='affairs_students'){
              assert.equal(endpoint.searchParams.get('user_id'),'eq.'+userId);
              return Response.json([{id:studentId,user_id:userId}]);
            }
            assert.equal(endpoint.searchParams.get('student_id'),'eq.'+studentId);
            if(table==='affairs_enrollments'&&target==='courses')return Response.json([],{headers:{'content-range':'*/0'}});
            assert.equal(target,'charges');
            assert.equal(table,'affairs_charges');
            return Response.json([{id:'37000000-0000-4000-8000-000000000011',student_id:studentId,label:'Local tuition',
              amount_due:28000,amount_paid:5000,currency:'TWD',due_on:null,source_mode:'sample'}],{headers:{'content-range':'0-0/1'}});
          }
          assert.equal(endpoint.origin,'https://api.openai.com');
          const body=JSON.parse(String(init?.body)),request=JSON.parse(body.input[0].content[0].text);
          assert.equal(body.text.format.name,'answer_evidence_review');
          assert.deepEqual(request.evidence.map((item:{id:string})=>item.id),['account-scope','account:'+target,source]);
          assert.equal(JSON.parse(request.evidence[2].content).views[0].records[0].net,1500);
          const accountEvidence=JSON.parse(request.evidence[1].content);
          if(target==='charges')assert.equal(accountEvidence.records[0].amountPaid,5000);
          else assert.equal(accountEvidence.calendar.records.next,null);
          const claims=[
            {claim:'Local salary net is 1500.',supported:true,evidenceId:source,jsonPaths:['/views/0/records/0/net'],quotes:[]},
            {claim:target==='charges'?'Local tuition balance is 23000.':'There is no next meeting in saved enrollments.',supported:true,
              evidenceId:'account:'+target,jsonPaths:target==='charges'?['/records/0/amountDue','/records/0/amountPaid']:['/calendar/records/next'],quotes:[]},
          ];
          return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,answersQuestion:true,claims})}]}]});
        }
        globalThis.fetch=(...args)=>mock(...args).catch(error=>{failures.push(error);throw error;});
        const subject='Show my student salary payment period and net pay.';
        const answer=await ask((reverse?[questionPart,subject]:[subject,questionPart]).join(' '));
        assert.deepEqual(failures,[]);
        assert.equal(answer.verification.status,'verified');
        assert.match(answer.answer,/Local work period/u);
        assert.match(answer.answer,target==='charges'?/23,000/u:/no upcoming meeting/u);
        assert.deepEqual(observed.sort(),['affairs_read_aid_payments','affairs_students',target==='charges'?'affairs_charges':'affairs_enrollments'].sort());
      }
    }
  }finally{
    globalThis.fetch=original;
    if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  }
});
