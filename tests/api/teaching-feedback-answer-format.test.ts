import assert from 'node:assert/strict';
import {test} from 'node:test';
import {micromark} from 'micromark';
import {readTeachingFeedbackEvidence,unavailableTeachingFeedbackEvidence} from '../../server/accountTeachingFeedbackEvidence.js';
import {formatExactTeachingFeedbackAnswer,formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import {exactTeachingFeedbackRead,teachingFeedbackLookupContext} from '../../server/teachingFeedbackEvidenceIntent.js';

type Evidence=Awaited<ReturnType<typeof readTeachingFeedbackEvidence>>;
const id=(n:number)=>'75000000-0000-4000-8000-'+String(n).padStart(12,'0');
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC-KEY',token:'SYNTHETIC-TOKEN',user:{id:id(1)}};
const nativeCourse={id:id(2),course:'Networks Lab',code:'NET201',term:'QA Fall',section:'A1'};
const note='Please explain the rubric.\n\n[unsafe](https://invalid.example)';
const survey={id:id(3),termId:id(4),term:'QA Fall',phase:'midterm',questions:['PRIVATE survey question'],
  opensAt:'2026-10-01T00:00:00Z',closesAt:'2026-11-01T00:00:00Z',version:1,released:true,state:'closed',courses:[{...nativeCourse,completed:true}]};
const feedback={id:id(5),sectionId:id(2),course:nativeCourse.course,code:nativeCourse.code,term:nativeCourse.term,
  comment:note,status:'reviewed',submittedAt:'2026-10-02T08:00:00Z',reviewedAt:'2026-10-03T08:00:00Z'};
const source=(commentRequested=false)=>readTeachingFeedbackEvidence(account,{views:['survey','immediate'],commentRequested},{read:async(_,query)=>({
  userId:id(1),courses:query.view==='immediate'?[nativeCourse]:[],surveys:query.view==='survey'?[survey]:[],
  feedback:query.view==='immediate'?[feedback]:[],terms:[],results:[],
})});
const formatter=formatSupplementalAccountAnswers as unknown as (input:Evidence[],options?:{question?:string})=>{
  status:string;answer:string;views:Array<{rows:string[][]}>;citations:Array<{url:string}>;
};

test('saved survey completion and immediate review stay separate and only explicit comments render',async()=>{
  for(const include of [false,true]){
    const evidence=await source(include);
    const answer=formatter([evidence],{question:'Show my saved teaching evaluation and immediate feedback.'});
    assert.equal(answer.status,'answered');
    assert.match(answer.answer,/NET201 Networks Lab.*completed/u);
    assert.match(answer.answer,/Saved status: ` reviewed `/u);
    assert.match(answer.answer,/2026-10-03T08:00:00Z/u);
    const raw=JSON.stringify(answer);
    assert.doesNotMatch(raw,/PRIVATE survey question|SYNTHETIC-|75000000/u);
    assert.equal(raw.includes('Please explain the rubric.'),include);
    assert.doesNotMatch(micromark(answer.answer),/href="https:\/\/invalid\.example"/u);
    assert.ok(answer.answer.includes('](/school-affairs/services/7-5)'));
    assert.ok(answer.answer.includes('](/school-affairs/services/7-6)'));
    assert.equal(answer.views[0].rows.length,2);
  }
});

test('the formatter rejects leaked fields, wrong view links, conflicting counts and foreign course projections',async()=>{
  const valid=await source();
  for(const command of [
    (row:any)=>{row.views[0].surveys[0].anonymousAnswer='PRIVATE';},
    (row:any)=>{row.views[1].feedback[0].comment='unauthorized';},
    (row:any)=>{row.views[1].counts.feedback.total=0;},
    (row:any)=>{row.selection.course={code:'NOT-NET201'};},
    (row:any)=>{row.capability.write=true;},
  ]){
    const invalid=structuredClone(valid),payload=JSON.parse(invalid.evidence.content);
    command(payload);invalid.evidence.content=JSON.stringify(payload);
    assert.throws(()=>formatter([invalid]),TypeError);
  }
  const wrong=structuredClone(valid);wrong.evidence.urls=['/school-affairs/services/7-6'];
  assert.throws(()=>formatter([wrong]),TypeError);
});

test('unavailable and empty teaching feedback have distinct student-facing text',async()=>{
  const failed=formatter([unavailableTeachingFeedbackEvidence('reader_unavailable')]);
  assert.match(failed.answer,/couldn’t check/u);
  assert.doesNotMatch(failed.answer,/No saved records/u);
  const empty=await readTeachingFeedbackEvidence(account,{views:['immediate']},{read:async()=>({
    userId:id(1),courses:[],feedback:[],surveys:[],terms:[],results:[],
  })});
  assert.match(formatter([empty]).answer,/No saved records were found/u);
});

test('exact teaching answers preserve a selected saved comment and decline mismatched scopes or display excerpts',async()=>{
  const route='/school-affairs/services/7-6',question='What exact comment did I save in immediate teaching feedback for course code NET201?';
  const selection=exactTeachingFeedbackRead(teachingFeedbackLookupContext(question,route));
  assert.ok(selection);
  const read=(amount:number)=>readTeachingFeedbackEvidence(account,{views:['immediate'],commentRequested:true,course:{code:'NET201'}},{read:async()=>({
    userId:id(1),courses:[nativeCourse],surveys:[],feedback:Array.from({length:amount},(_,index)=>({...feedback,id:id(100+index)})),terms:[],results:[],
  })});
  const result=await read(1);
  const answer=formatExactTeachingFeedbackAnswer(result,question,selection);
  assert.ok(answer);
  assert.match(answer.answer,/NET201 Networks Lab/u);
  assert.match(answer.answer,/Please explain the rubric/u);
  assert.doesNotMatch(micromark(answer.answer),/href="https:\/\/invalid\.example"/u);
  assert.deepEqual(answer.views[0].rows.map(row=>row[1]),['NET201 Networks Lab']);
  assert.equal(formatExactTeachingFeedbackAnswer(result,question,{...selection,course:{code:'OTHER'}}),null);
  assert.equal(formatExactTeachingFeedbackAnswer(result,question,{...selection,commentRequested:false}),null);
  assert.equal(formatExactTeachingFeedbackAnswer(await read(13),question,selection),null);
  assert.equal(formatExactTeachingFeedbackAnswer(await source(true),question,selection),null);
  assert.equal(formatExactTeachingFeedbackAnswer(unavailableTeachingFeedbackEvidence('read_failed'),question,selection),null);
});

test('phase comparison requires a unique native term and section identity',async()=>{
  const question='Does completing NET201 in my midterm teaching evaluation also mean my final evaluation is complete?';
  const selection=exactTeachingFeedbackRead(teachingFeedbackLookupContext(question,'/school-affairs/services/7-5'));
  assert.ok(selection);
  for(const sharedTerm of [true,false]){
    const result=await readTeachingFeedbackEvidence(account,{views:['survey']},{read:async()=>({
      userId:id(1),courses:[],feedback:[],terms:[],results:[],surveys:[survey,{
        ...structuredClone(survey),id:id(6),termId:sharedTerm?survey.termId:id(7),phase:'final',courses:[{...nativeCourse,completed:false}],
      }],
    })});
    assert.equal(result.surveyIdentityUnambiguous,sharedTerm);
    const answer=formatExactTeachingFeedbackAnswer(result,question,selection);
    if(sharedTerm)assert.match(answer?.answer??'',/Final — NET201 completion: not completed/u);
    else assert.equal(answer,null);
  }
  for(const inference of ['Does reviewed in my immediate teaching feedback prove my teacher read it while I was absent?',
    'Does completing NET201 in my midterm teaching evaluation mean my teacher changed the lesson?']){
    assert.equal(exactTeachingFeedbackRead(teachingFeedbackLookupContext(inference,'/school-affairs/services/7-5')),null);
  }
});
