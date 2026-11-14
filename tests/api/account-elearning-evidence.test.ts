import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readElearningEvidence} from '../../server/accountElearningEvidence.js';
import {requiredSupplementalTools} from '../../server/accountSupplementalLookup.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import {answerLinksSupported} from '../../server/answerVerificationModel.js';
import {selectElearningEvidence} from '../../server/elearningEvidenceIntent.js';
import {answerAccountWithVerification,planAccountLookup} from '../../server/answerVerificationAccount.js';
import {buildAccountFixture} from '../evaluation/fixtures.mjs';

const question='What are my remote-learning Moodle enrollments? Also list my unfinished DTM assignments.';
const route='/elearning/my-courses';
const userId='10000000-0000-4000-8000-000000000001';
const account={user:{id:userId},url:'https://xiftudmvxphxcjtmfmib.supabase.co',token:'synthetic-caller',key:'synthetic-public'};
const course=(id:number,title:string)=>({id,category_id:41,title,self_enroll:false,position:id});
const workspace={userId,categories:[],notices:[{local_body:'UNREQUESTED NOTICE'}],
  courses:[course(9098,'Owned workshop'),course(9099,'Unenrolled catalog entry')],
  enrollments:[{courseId:9098,joinedAt:'2026-11-14T00:00:00Z'}]};

test('remote enrollment and local assignment requests keep separate evidence scopes',()=>{
  assert.deepEqual(selectElearningEvidence(question,route),{enrollment:true,unsupported:false});
  assert.deepEqual(requiredSupplementalTools(question,route),['elearningEnrollments']);
  assert.deepEqual(requiredSupplementalTools('Show my remote-learning Moodle grades.','/dtm/grades'),['elearningEnrollments']);
  assert.equal(selectElearningEvidence('Show my DTM grades.',route),null);
  assert.equal(selectElearningEvidence('Where is the remote-learning Moodle?',route),null);
});

test('the graph preserves the remote-learning page scope for ordinary first-person course questions',async()=>{
  for(const question of ['What are my courses?','What are my current courses?','Show my courses.']){
    const plan=await planAccountLookup(question,[],route,Date.now()+1000);
    assert.deepEqual(plan.tools,['elearningEnrollments'],question);
    assert.deepEqual(plan.publicTopics,[],question);
  }
  const schoolPlan=await planAccountLookup('What are my courses?',[],'/school-affairs',Date.now()+1000);
  assert.deepEqual(schoolPlan.tools,['courses']);
});

test('the native enrollment join is caller-scoped, exact and link-grounded',async()=>{
  const load=(data:unknown)=>readElearningEvidence(account,{question,route},{read:async(selected,query)=>{
    assert.equal(selected.user.id,userId);
    assert.equal(selected.token,account.token);
    assert.deepEqual(query,{scope:'elearning-workspace'});
    return data;
  }});
  const result=await load(workspace);
  assert.equal(result.readState,'ok');
  assert.doesNotMatch(result.evidence.content,/Unenrolled catalog entry|UNREQUESTED NOTICE|synthetic-caller/);
  const candidate=formatSupplementalAccountAnswers([result],{question});
  assert.match(candidate.answer,/Owned workshop/);
  assert.ok(answerLinksSupported(candidate.answer,[result.evidence]));
  assert.equal(candidate.views[0].total,1);
  assert.equal((await load({...workspace,enrollments:[]})).readState,'empty');
  for(const data of [{...workspace,userId:'foreign'},{...workspace,courses:[]}]){
    const unavailable=await load(data);
    assert.equal(unavailable.readState,'unavailable');
    assert.equal(JSON.parse(unavailable.evidence.content).counts.available,null);
  }
});

test('a compound enrollment and DTM assignment question reaches composition and the independent review with both sources',async()=>{
  const originalFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY,calls:string[]=[];
  process.env.OPENAI_API_KEY='synthetic';
  const text='Your saved local remote-learning enrollment is Owned workshop. Your unfinished DTM assignments are Index plan and Final portfolio.';
  let failure:unknown;
  globalThis.fetch=async(input,init)=>{
    try{
      assert.equal(new URL(String(input)).hostname,'api.openai.com');
      const body=JSON.parse(String(init?.body)),name=body.text.format.name,payload=JSON.parse(body.input[0].content[0].text);
      calls.push(name);
      if(name!=='account_lookup_plan'){
        assert.deepEqual(payload.evidence.map((item:{id:string})=>item.id).sort(),
          ['account-scope','account:assignments','account:dtm','account:elearningEnrollments']);
      }
      let response:unknown;
      if(name==='account_lookup_plan')response={tools:['courses','assignments','dtmSubmissions'],publicTopics:[],catalogQuery:null,action:null};
      else if(name==='compose_grounded_answer')response={status:'answered',answer:text,sourceIds:['account:elearningEnrollments','account:assignments']};
      else if(name==='answer_evidence_review')response={supported:true,answersQuestion:true,claims:[
        {claim:'Saved remote enrollment',supported:true,evidenceId:'account:elearningEnrollments',quotes:[],jsonPaths:['/rows/0/title']},
        {claim:'Unfinished DTM work',supported:true,evidenceId:'account:assignments',quotes:[],jsonPaths:['/records/0/status']},
      ]};
      else assert.fail(name);
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(response)}]}]});
    }catch(error){failure??=error;throw error;}
  };
  try{
    const snapshot=buildAccountFixture();
    const result=await answerAccountWithVerification({question,route,snapshot,loadSnapshot:async()=>snapshot,
      supplementalReaders:{elearningEnrollments:context=>readElearningEvidence(account,context,{read:async()=>workspace})}});
    assert.equal(result.verification.status,'verified');
    assert.equal(result.answer,text);
    assert.deepEqual(calls,['account_lookup_plan','compose_grounded_answer','answer_evidence_review']);
  }finally{
    globalThis.fetch=originalFetch;
    if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  }
  if(failure)throw failure;
});
