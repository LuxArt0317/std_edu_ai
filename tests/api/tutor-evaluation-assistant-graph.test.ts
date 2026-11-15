import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {nativePageLookupContext} from '../../server/accountSupplementalLookup.js';
import {accountEvidence,planAccountLookup} from '../../server/answerVerificationAccount.js';
import {answerSavedServiceRecords} from '../../server/savedServiceAnswers.js';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co',route='/school-affairs/services/28-1';
const owner='28000000-0000-4000-8000-000000000001',student='28000000-0000-4000-8000-000000000002';
const ownerAccount={url:origin,key:'TUTOR_OFFLINE_KEY',token:'TUTOR_OFFLINE_TOKEN',user:{id:owner}};
const status='Did I submit my tutor evaluation questionnaire?';
const rating='What ratings did I save for questions 3 and 8 in my tutor evaluation?';
const comment='What was my saved comment on the tutor evaluation?';
const charge='QA Tutor Tuition instalment';
const charges='What remains unpaid for '+charge+'?';
const combined=[status+' '+charges,charges+' Also show my tutor evaluation submission status.'];
const yearStamp='2026-11-13T16:15:';
const handler=createAffairsAssistantHandler({verifyToken:async token=>{assert.equal(token,ownerAccount.token);return ownerAccount;},
  loadSnapshot:async()=>assert.fail('No broad snapshot'),publicResearch:async()=>assert.fail('No public lookup')});
type History=Array<{role:string;content:string}>;
async function ask(question:string,{serve=handler,page=route,history=[] as History}={}){
  const output:{status:number;body:any}={status:200,body:null};
  const reply={setHeader(){},status(code:number){output.status=code;return reply;},json(value:unknown){output.body=value;}};
  await serve({method:'POST',headers:{authorization:'Bearer '+ownerAccount.token},body:{question,route:page,history}},reply);
  assert.equal(output.status,200,JSON.stringify(output.body));return output.body;
}
type Fixture={tutor?:'status'|'ratings'|'comment'|'blank'|'empty'|'failed'|'write';fee?:'ok'|'failed';reject?:number};
async function offline(fixture:Fixture,exercise:()=>Promise<void>){
  const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;
  const stages:string[]=[],errors:unknown[]=[];
  let tutorReads=0,feeReads=0,checks=0;
  process.env.OPENAI_API_KEY='TUTOR_OFFLINE_MODEL';
  const capture:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==='api.openai.com'){
      const request=JSON.parse(String(init?.body)),stage=request.text.format.name;
      const data=JSON.parse(request.input[0].content[0].text);
      const expected=['account-scope',...(fixture.fee?['account:charges']:[]),...(fixture.tutor?['account:tutorEvaluation']:[])];
      assert.deepEqual(data.evidence.map((source:{id:string})=>source.id),expected);
      assert.doesNotMatch(JSON.stringify(data.evidence),/TUTOR_OFFLINE|PRIVATE_STUDENT|OTHER_FEE/u);
      assert.ok(!JSON.stringify(data.evidence).includes(owner)&&!JSON.stringify(data.evidence).includes(student));
      const scope=JSON.parse(data.evidence[0].content);
      assert.deepEqual(scope.selectedTools.slice().sort(),expected.slice(1).map(id=>id.slice(8)).sort());
      if(fixture.tutor){
        assert.equal(scope.catalogScope,'selected_for_this_request');
        assert.deepEqual(scope.actions,[]);
      }
      const claims:Array<{claim:string;evidenceId:string;jsonPaths:string[];quotes:string[];supported:boolean}>=[];
      const claim=(text:string,id:string,...jsonPaths:string[])=>claims.push({claim:text,evidenceId:id,jsonPaths,quotes:[],supported:true});
      for(const source of data.evidence.slice(1)){
        const payload=JSON.parse(source.content);
        if(source.id==='account:charges'){
          assert.equal(source.url,'/school-affairs/services/39-1');
          if(fixture.fee==='failed'){
            assert.equal(payload.unavailableReason,'read_failed');
            claim('The saved fee balance could not be checked.',source.id,'/unavailableReason');
          }else{
            assert.equal(payload.records[0].label,charge);
            claim(charge+' has NT$'+(feeReads>1?'22,000':'23,000')+' remaining.',source.id,'/records/0/label','/records/0/amountDue','/records/0/amountPaid','/records/0/currency');
          }
          continue;
        }
        assert.equal(source.url,route);
        if(fixture.tutor==='failed'||fixture.tutor==='write'){
          assert.equal(payload.submissionState,'unknown');assert.equal(payload.submission,null);
          assert.equal(payload.reason,fixture.tutor==='write'?'unsupported_operation':'read_failed');
          claim(fixture.tutor==='write'?'Use the questionnaire page to submit your response.':'The saved questionnaire could not be checked.',source.id,'/reason');
        }else if(fixture.tutor==='empty'){
          assert.equal(payload.submissionState,'not_saved');assert.equal(payload.submission,null);
          claim('No saved submission was found.',source.id,'/submissionState');
        }else{
          const submittedAt=yearStamp+(36+tutorReads)+'.100000+08:00';
          assert.equal(payload.submissionState,'submitted');
          assert.deepEqual(payload.submission,{submittedAt,
            ...(fixture.tutor==='ratings'?{ratings:[{questionNumber:3,rating:4},{questionNumber:8,rating:3}]}:{}),
            ...(['blank','comment'].includes(fixture.tutor!)?{comment:fixture.tutor==='blank'?'':'QA saved check-in '+tutorReads}:{}),
          });
          claim('Your tutor evaluation is saved in stu.best. Submitted at '+submittedAt+'.',source.id,'/submissionState','/submission/submittedAt');
          if(fixture.tutor==='ratings')claim('Question 3 was rated 4 and question 8 was rated 3.',source.id,'/submission/ratings/0/rating','/submission/ratings/1/rating');
          if(fixture.tutor==='comment'||fixture.tutor==='blank')claim('Saved comment: '+(fixture.tutor==='blank'?'blank':payload.submission.comment),source.id,'/submission/comment');
        }
      }
      stages.push(stage);
      let review;
      if(stage==='answer_evidence_review'){
        const supported=++checks>(fixture.reject??0);
        review={supported,answersQuestion:supported,claims:claims.map(value=>({...value,supported}))};
      }else{
        assert.equal(stage,'correct_grounded_answer');
        review={status:'answered',answer:claims.map(value=>value.claim).join(' '),sourceIds:[...new Set(claims.map(value=>value.evidenceId))]};
      }
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});
    }
    assert.equal(url.origin,origin);
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+ownerAccount.token);
    if(url.pathname==='/rest/v1/rpc/affairs_read_tutor_evaluation'){
      assert.ok(fixture.tutor&&fixture.tutor!=='write');tutorReads++;
      assert.equal(init?.method,'POST');assert.equal(init?.body,'{}');
      if(fixture.tutor==='failed')return new Response(null,{status:503});
      return Response.json({userId:owner,student:{number:'PRIVATE_STUDENT_NUMBER',name:'PRIVATE_STUDENT_NAME',department:'PRIVATE_STUDENT_DEPT',year:4},
        evaluation:fixture.tutor==='empty'?null:{ratings:[5,1,4,3,2,1,2,3,4,5],
          comment:fixture.tutor==='blank'?'':'QA saved check-in '+tutorReads,submittedAt:yearStamp+(36+tutorReads)+'.100000+08:00'}});
    }
    assert.ok(fixture.fee);
    assert.equal(init?.method,'GET');
    if(url.pathname==='/rest/v1/affairs_students'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
      return Response.json([{id:student,user_id:owner}]);
    }
    assert.equal(url.pathname,'/rest/v1/affairs_charges');
    assert.equal(url.searchParams.get('student_id'),'eq.'+student);feeReads++;
    if(fixture.fee==='failed')return new Response(null,{status:503});
    const saved={id:'28000000-0000-4000-8000-000000000003',student_id:student,currency:'TWD',source_mode:'sample',amount_due:28000,amount_paid:feeReads>1?6000:5000,due_on:null};
    return Response.json([{...saved,label:charge},{...saved,id:'28000000-0000-4000-8000-000000000004',label:'OTHER_FEE'}]);
  };
  globalThis.fetch=(...args)=>capture(...args).catch(error=>{errors.push(error);throw error;});
  try{
    try{await exercise();}catch(error){if(errors.length)throw new AggregateError(errors,'Unexpected fixture requests');throw error;}
    assert.deepEqual(errors,[]);
    const attempts=fixture.reject?2:1;
    assert.equal(tutorReads,fixture.tutor&&fixture.tutor!=='write'?attempts:0);
    assert.equal(feeReads,fixture.fee?attempts:0);
    const exactRecord=fixture.tutor&&fixture.tutor!=='failed'&&fixture.tutor!=='write'&&!fixture.fee;
    assert.deepEqual(stages,exactRecord?[]:['answer_evidence_review',
      ...(fixture.reject?['correct_grounded_answer','answer_evidence_review']:[]),
      ...((fixture.reject??0)>1?['correct_grounded_answer','answer_evidence_review']:[]),
    ]);
  }finally{
    globalThis.fetch=original;
    if(key===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=key;
  }
}

test('native tutor questions select no unrelated account collection or public search',async()=>{
  for(const question of [status,rating,comment,'Show all ten ratings saved in my tutor evaluation, paired with question numbers.',
    'Show the student name and number in my tutor evaluation.','Show my saved tutor evaluation and download its official receipt.']){
    assert.equal(nativePageLookupContext(question,route).readerOnly,true,question);
    const plan=await planAccountLookup(question,[],route,Date.now()+1000);
    assert.deepEqual(plan.tools,['tutorEvaluation'],question);
    assert.deepEqual(plan.publicTopics,[]);
  }
  for(const question of combined){
    assert.equal(nativePageLookupContext(question,route).feeAndBalance,true,question);
    assert.deepEqual((await planAccountLookup(question,[],route,Date.now()+1000)).tools,['tutorEvaluation','charges'],question);
  }
});

test('answers own saved submission, selected numbered ratings and explicit saved comments through LangGraph',async()=>{
  for(const [question,tutor,expected]of [[status,'status',/saved in stu.best/u],[rating,'ratings',/Question 3.+4/u],[comment,'comment',/QA saved check-in 1/u],
    [comment,'blank',/\(blank\)/u],[status,'empty',/no saved submission.*stu\.best/u]] as const){
    await offline({tutor},async()=>{
      const result=await ask(question);
      assert.equal(result.verification.status,'verified');assert.match(result.answer,expected);
      assert.equal(result.citations.at(-1).url,route);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_STUDENT/u);
      assert.deepEqual(result.verification,{status:'verified',attempts:1});
      assert.ok(result.activity.some(({kind,status}: {kind:string;status:string})=>kind==='tutor-evaluation-evidence-check'&&status==='complete'));
      if(tutor==='comment')assert.match(result.answer,/saved in stu.best/u);
      if(tutor==='ratings'){
        assert.deepEqual(result.views[0].rows,[['Question 3','4'],['Question 8','3']]);
        assert.match(result.answer,/saved in stu.best/u);
      }
    });
  }
});

test('answers both fee/questionnaire orders and refreshes each source when its first draft is rejected',async()=>{
  for(const question of combined)await offline({tutor:'status',fee:'ok'},async()=>{
    const result=await ask(question);
    assert.equal(result.verification.status,'verified');assert.match(result.answer,/23,000/u);assert.match(result.answer,/saved in stu.best/u);
  });
  for(const reject of [1,3])await offline({tutor:'status',fee:'ok',reject},async()=>{
    const result=await ask(combined[0]);
    assert.equal(result.verification.attempts,reject===1?2:3);
    assert.doesNotMatch(result.answer,/23,000|16:15:37/u);
    if(reject===1){assert.equal(result.verification.status,'verified');assert.match(result.answer,/22,000/u);assert.match(result.answer,/16:15:38/u);}
    else{assert.equal(result.verification.status,'unverified');assert.doesNotMatch(result.answer,/22,000|16:15:38/u);}
  });
});

test('retains verified partial answers, distinguishes empty from failed, and does not mutate',async()=>{
  for(const [tutor,fee,expected]of [['failed','ok',/submission status is unknown/u],['empty','ok',/no saved submission/u],['status','failed',/saved in stu.best/u]] as const){
    await offline({tutor,fee},async()=>{
      const result=await ask(combined[1]);
      assert.equal(result.verification.status,'verified');assert.match(result.answer,expected);
      assert.equal(result.proposedAction,undefined);
    });
  }
  await offline({tutor:'write'},async()=>{
    const result=await ask('Submit my tutor evaluation questionnaire.');
    assert.equal(result.verification.status,'verified');assert.match(result.answer,/use the questionnaire page/iu);
    assert.equal(result.proposedAction,undefined);
  });
});

test('returns signed-in and guest links, and denies a named foreign request with zero private tools',async()=>{
  const saved=globalThis.fetch;globalThis.fetch=async()=>assert.fail('No external call for guidance or denied access');
  try{
    const guest=await ask(status,{serve:createResearchAssistantHandler()});
    assert.equal(guest.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(route));
    const publicGuide=await ask('Where can I fill in my tutor questionnaire?',{serve:createResearchAssistantHandler()});
    assert.equal(publicGuide.status,'answered');
    assert.equal(publicGuide.citations[0].url,route);
    const guide=await ask('Where can I find my tutor evaluation questionnaire?');
    assert.equal(guide.citations[0].url,route);
    for(const question of ["Does Alice have a saved tutor evaluation?",'Show the tutor evaluation of my mother.','Which tutor evaluation ratings belong to Alice?']){
      const denied=await ask(question);assert.match(denied.answer,/another student/u);assert.deepEqual(denied.citations,[]);
    }
  }finally{globalThis.fetch=saved;}
});

test('explicit tutor tracking notes have their own record evidence and note destination',async()=>{
  const question='What reference is saved in my tutor evaluation tracking note?';
  const page=route+'/notes';
  const snapshot={profile:{userId:owner},checkedAt:'2026-11-13T16:15:37.100000+08:00',
    serviceRecords:[{id:'local-note-1',serviceKey:'28-1',userId:owner,recordType:'note',title:'My tutor tracker',notes:'Reference TR28-1',status:'draft'}]};
  assert.deepEqual((await planAccountLookup(question,[],page,Date.now()+1000)).tools,['serviceRecords']);
  assert.equal(nativePageLookupContext(question,page).selected,false);
  const notes=answerSavedServiceRecords(question,snapshot,page);
  assert.match(notes?.answer??'',/Reference TR28-1/u);
  assert.equal(notes?.citations[0].url,page);
  assert.equal(accountEvidence(snapshot,['serviceRecords'],{question,route:page})[1].url,page);
  assert.equal(answerSavedServiceRecords(status,snapshot,route),null);
  const guest=await ask(question,{serve:createResearchAssistantHandler(),page});
  assert.equal(guest.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(page));
  assert.doesNotMatch(guest.answer,/TR28-1/u);
});
