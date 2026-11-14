import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {nativePageLookupContext} from '../../server/accountSupplementalLookup.js';
import {planAccountLookup} from '../../server/answerVerificationAccount.js';
import {readStudentConductEvidence} from '../../server/accountStudentConductEvidence.js';

const url='https://xiftudmvxphxcjtmfmib.supabase.co',path='/school-affairs/services/38-1';
const userId='38000000-0000-4000-8000-000000000001';
const account={url,key:'CONDUCT_TEST_KEY',token:'CONDUCT_TEST_TOKEN',user:{id:userId}};
const saved='Show my student conduct code, quantity, reason and void status.';
const stamp='2026-11-12T06:00:00Z';
const record={id:'38000000-0000-4000-8000-000000000002',user_id:userId,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp,
  deleted_at:null,row_order:1,occurred_on_text:'Local date text',student_number:'PRIVATE_STUDENT_NUMBER',student_name:'PRIVATE_STUDENT_NAME',
  academic_year_text:'115',semester_text:'1',year_level_text:null,reason_text:'Local reason text',conduct_code:'QA-0',conduct_name:'Recorded label',
  quantity_text:'0',void_status_text:''};
const defaultHandler=createAffairsAssistantHandler({verifyToken:async token=>{assert.equal(token,account.token);return account;},
  loadSnapshot:async()=>assert.fail('The conduct request should not load the broad workspace'),
  publicResearch:async()=>assert.fail('Personal conduct must not enter public research')});

type History=Array<{role:string;content:string}>;
async function ask(question:string,{handler=defaultHandler,route=path,history=[] as History}={}){
  const result:{body:any;status:number}={body:null,status:200};
  const reply={setHeader(){},status(status:number){result.status=status;return reply;},json(body:unknown){result.body=body;}};
  await handler({method:'POST',headers:{authorization:'Bearer '+account.token,'x-forwarded-for':'192.0.2.38'},body:{question,route,history}},reply);
  assert.equal(result.status,200,JSON.stringify(result.body));return result.body;
}
async function withFakeModel(exercise:()=>Promise<void>,{empty=false,reject=0}={}){
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  let reads=0,checks=0,repairs=0;const errors:unknown[]=[];
  process.env.OPENAI_API_KEY='CONDUCT_TEST_MODEL';
  async function mock(input:RequestInfo|URL,init?:RequestInit){
    const target=new URL(String(input));
    if(target.origin===url){
      assert.equal(init?.redirect,'error');
      assert.equal(target.pathname,'/rest/v1/affairs_student_conduct');
      assert.equal(target.searchParams.get('user_id'),'eq.'+userId);
      assert.equal(target.searchParams.get('deleted_at'),'is.null');
      assert.equal(init?.method,'GET');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
      reads++;
      return Response.json(empty?[]:[{...record,reason_text:'Saved reason ordinal '+reads}]);
    }
    assert.equal(target.origin,'https://api.openai.com');
    const body=JSON.parse(String(init?.body)),request=JSON.parse(body.input[0].content[0].text);
    assert.deepEqual(request.evidence.map(({id}:{id:string})=>id),['account-scope','account:studentConduct']);
    assert.doesNotMatch(JSON.stringify(request.evidence),/PRIVATE_STUDENT|CONDUCT_TEST/u);
    const data=JSON.parse(request.evidence[1].content);
    assert.equal(data.readState,empty?'empty':'ok');
    if(!empty){assert.equal(data.records[0].quantityText,'0');assert.equal(data.records[0].voidStatusText,'');}
    const stage=body.text.format.name,source='account:studentConduct';
    let value;
    if(stage==='answer_evidence_review'){
      const supported=++checks>reject;
      value={supported,answersQuestion:supported,claims:[{claim:empty?'No matching local record is saved.':'Saved reason ordinal '+reads,
        supported,evidenceId:source,jsonPaths:[empty?'/readState':'/records/0/reasonText'],quotes:[]}]};
    }else{
      assert.equal(stage,'correct_grounded_answer');repairs++;
      value={status:'answered',answer:'Your saved local_demo reason is Saved reason ordinal '+reads+'.',sourceIds:[source]};
    }
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
  }
  globalThis.fetch=(...args)=>mock(...args).catch(error=>{errors.push(error);throw error;});
  try{
    try{await exercise();}catch(error){if(errors.length)throw new AggregateError(errors,'Unexpected source calls');throw error;}
    assert.deepEqual(errors,[]);assert.equal(reads,reject?2:1);assert.equal(checks,reject?2:1);assert.equal(repairs,reject?1:0);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}

test('caller-only conduct plan, exact fee and next-class dependencies, and independent dormitory tools',async()=>{
  for(const [question,expected]of [[saved,['studentConduct']],
    ['Show my student conduct records. Show my tuition balance.',['studentConduct','charges']],
    ['Show my tuition balance. Show my student conduct records.',['studentConduct','charges']],
    ['Show my student conduct records. What is my next class?',['studentConduct','courses']],
    ['Compare my student conduct with my dormitory conduct.',['studentConduct','dormitoryConduct']]] as const)
    assert.deepEqual((await planAccountLookup(question,[],path,Date.now()-1)).tools,expected,question);
  assert.equal(nativePageLookupContext(saved,path).readerOnly,true);
  const comparison=nativePageLookupContext('Compare my dormitory conduct with my student conduct.',path);
  assert.match(comparison.questions.studentConduct??'',/student conduct/u);assert.doesNotMatch(comparison.questions.studentConduct??'',/dormitory/u);
});

test('actual reader and graph preserve literal fields, distinguish empty, reread rejected answers and withhold a second rejection',async()=>{
  await withFakeModel(async()=>{
    const result=await ask(saved);assert.equal(result.verification.status,'verified');
    assert.match(result.answer,/Saved reason ordinal 1/u);assert.match(result.answer,/QA-0/u);
    assert.equal(result.citations.at(-1).url,path);assert.equal(result.views[0].id,'studentConduct');
  });
  await withFakeModel(async()=>{
    const result=await ask(saved);assert.equal(result.verification.status,'verified');assert.match(result.answer,/No matching local record/u);
  },{empty:true});
  for(const reject of [1,2])await withFakeModel(async()=>{
    const result=await ask(saved);assert.equal(result.verification.attempts,2);assert.doesNotMatch(result.answer,/ordinal 1/u);
    if(reject===1){assert.equal(result.verification.status,'verified');assert.match(result.answer,/ordinal 2/u);}
    else {assert.equal(result.verification.status,'unverified');assert.doesNotMatch(result.answer,/ordinal 2/u);}
  },{reject});
});

test('foreign, excluded and public navigation use zero private tools; account guidance preserves the sign-in return path',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>assert.fail('No model or database call');
  try{
    for(const question of ['Show Alice’s conduct records.','Does Alice have student conduct records?','Show the student conduct status for Alice.','Show the merit code recorded for Alice.','請顯示王小明本人的獎懲紀錄。']){
      const result=await ask(question);assert.equal(result.status,'handoff');assert.deepEqual(result.citations,[]);
      const read=await readStudentConductEvidence(account,{question,route:path},{load:async()=>assert.fail('Different owner')});
      assert.equal(read.reason,'foreign_request');
    }
    for(const question of ['Do not read my student conduct records.','Show my student conduct records. Do not show my student conduct records.']){
      const result=await ask(question);assert.equal(result.status,'handoff');assert.match(result.answer,/skipped/u);
    }
    const navigation='Where can I find my student conduct records?';
    assert.equal((await ask(navigation)).citations[0].url,path);
    const handler=createResearchAssistantHandler();
    assert.equal((await ask(navigation,{handler})).citations[0].url,path);
    const guest=await ask(saved,{handler});
    assert.equal(guest.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(path));
  }finally{globalThis.fetch=original;}
});

test('conduct navigation does not replace an independent signed-in question',async()=>{
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='CONDUCT_TEST_MODEL';
  const requests:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const target=new URL(String(input));requests.push(target.pathname);
    if(target.origin===url){
      assert.equal(init?.method,'GET');
      if(target.pathname.endsWith('/affairs_students'))return Response.json([]);
      assert.fail('Only the linked-student check is needed for an empty fee balance.');
    }
    assert.equal(target.origin,'https://api.openai.com');
    const body=JSON.parse(String(init?.body)),request=JSON.parse(body.input[0].content[0].text);
    assert.equal(body.text.format.name,'answer_evidence_review');
    assert.deepEqual(request.evidence.map(({id}:{id:string})=>id),['account-scope','account:charges']);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({
      supported:true,answersQuestion:true,claims:[{claim:'No local student is linked.',supported:true,evidenceId:'account:charges',quotes:[],jsonPaths:['/studentRecordFound']}],
    })}]}]});
  };
  try{
    const result=await ask('Where can I find my student conduct records? Also show my tuition balance.');
    assert.equal(result.verification.status,'verified');
    assert.ok(result.citations.some((item:{url:string})=>item.url===path));
    assert.ok(result.citations.some((item:{url:string})=>item.url==='/school-affairs/services/39-1'));
    assert.deepEqual(requests,['/rest/v1/affairs_students','/v1/responses']);
  }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
