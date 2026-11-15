import test from 'node:test';
import assert from 'node:assert/strict';
import {micromark} from 'micromark';
import {readFeeRemissionEvidence,unavailableFeeRemissionEvidence,type FeeRemissionEvidenceResult} from '../../server/accountFeeRemissionEvidence.js';
import {readDormitoryConductEvidence} from '../../server/accountDormitoryConductEvidence.js';
import type {FeeRemissionHistory,FeeRemissionRecord} from '../../server/feeRemissionContract.js';
import {formatSupplementalAccountAnswers as format,supplementalAnswerLimits} from '../../server/supplementalAccountAnswers.js';
import {answerLinksSupported,composeEvidenceAnswer,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
// @ts-expect-error Independently authored offline case bank has no TypeScript declaration.
import {buildFeeRemissionCases,feeRemissionFixtureForCase} from '../evaluation/fee-remission-cases.mjs';
import {gradeCase} from '../evaluation/grading.mjs';

const owner='62000000-0000-4000-8000-000000000001',route='/school-affairs/services/21-3';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}};
const row=(index=0,overrides:Partial<FeeRemissionRecord>={}):FeeRemissionRecord=>({id:'62000000-0000-4000-8001-'+String(index+1).padStart(12,'0'),version:3,row_order:index,
  academic_year_text:'115',semester_text:'1',student_number:'PRIVATE_STUDENT_NUMBER',category_text:'QA Remission '+index,amount_text:'0',check_status_text:'Awaiting local review',notes_text:null,...overrides});
const native=(records:FeeRemissionRecord[]=[row()]):FeeRemissionHistory=>({userId:owner,records});
const read=(value:unknown=native(),question='Show my fee remission records.')=>readFeeRemissionEvidence(account,{question,route},{load:async()=>value});
const content=(result:FeeRemissionEvidenceResult)=>JSON.parse(result.evidence.content);
function change(result:FeeRemissionEvidenceResult,update:(payload:any)=>void){const copy=structuredClone(result),payload=content(copy);update(payload);copy.evidence.content=JSON.stringify(payload);return copy;}

test('literal cells remain paired with their row, preserving zero, null, blank, whitespace and period labels',async()=>{
  const data=native([row(0,{academic_year_text:'0115',semester_text:'01',amount_text:' 001,000 ',notes_text:'exact note'}),row(1,{amount_text:'0.00'}),row(2,{amount_text:null,check_status_text:null}),row(3,{amount_text:'',check_status_text:'',notes_text:''}),row(4)]);
  const before=structuredClone(data),source=await read(data),out=format([source]);
  assert.equal(out.status,'answered');assert.equal(out.complete,true);assert.equal(out.views[0].total,5);
  assert.deepEqual(out.views[0].columns,['Academic year','Semester','Category','Amount','Check status','Notes']);
  assert.deepEqual(out.views[0].rows.map(values=>values[3]),[' 001,000 ','0.00','not recorded','(blank)','0']);
  assert.match(out.answer,/- Fee remission record: ` QA Remission 0 `\n  - Academic year: ` 0115 `\n  - Semester: ` 01 `/u);
  assert.match(out.answer,/Amount: `  001,000  `/u);assert.match(out.answer,/Amount: ` 0\.00 `/u);
  assert.doesNotMatch(JSON.stringify(out),/PRIVATE_STUDENT|OFFLINE_|62000000|row_order|"version"|TWD/u);
  assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);assert.deepEqual(data,before);
  assert.equal(Object.hasOwn(out,'verification'),false);assert.equal(Object.hasOwn(out,'proposedAction'),false);
});

test('identity is rendered only when explicitly projected and Chinese display preserves native literals',async()=>{
  const question='Show the student number in my fee remission history.',source=await read(native(),question),out=format([source],{question});
  assert.match(out.answer,/Student number: ` PRIVATE_STUDENT_NUMBER `/u);assert.ok(out.views[0].columns.includes('Student number'));
  const hidden=await read(native(),'Show my fee remission and never show my student number.');assert.doesNotMatch(JSON.stringify(format([hidden])),/PRIVATE_STUDENT/u);
  const zh=format([source],{language:'zh-TW'});assert.match(zh.answer,/金額: ` 0 `/u);assert.match(zh.answer,/學號: ` PRIVATE_STUDENT_NUMBER `/u);
});

test('successful empty, exact-period no match, failed read and malformed owner have different truthful displays',async()=>{
  const empty=format([await read(native([]))]);assert.equal(empty.status,'answered');assert.match(empty.answer,/Remission record count in this local read: 0/u);assert.match(empty.answer,/No saved remission records/u);
  const unmatched=format([await read(native(),'Show my fee remission for academic year 114 semester 2.')]);
  assert.match(unmatched.answer,/Matching remission records: 0/u);assert.match(unmatched.answer,/No matching saved remission records/u);assert.match(unmatched.answer,/local read: 1/u);
  for(const source of [unavailableFeeRemissionEvidence('read_failed'),await read({...native(),userId:'62000000-0000-4000-8000-000000000002'}),await read({userId:owner})]){
    const out=format([source]);assert.equal(out.status,'answered');assert.equal(out.complete,false);assert.equal(out.views.length,0);
    assert.match(out.answer,/remission history is unavailable/u);assert.doesNotMatch(out.answer,/No saved remission records|Remission record count|QA Remission 0/u);
  }
});

test('unknown current term displays only period choices and never selects a future amount or identity',async()=>{
  const source=await read(native([row(),row(1,{academic_year_text:'9999',semester_text:'9',amount_text:'FUTURE_SECRET'})]),'Show my current term fee remission amount.'),out=format([source]);
  assert.equal(out.status,'answered');assert.equal(out.complete,false);assert.match(out.answer,/current term is not designated/u);
  assert.match(out.answer,/exact saved academic year and semester/u);assert.match(out.answer,/Academic year: ` 9999 `/u);
  assert.doesNotMatch(out.answer,/FUTURE_SECRET|PRIVATE_STUDENT|Amount:|Check status:/u);assert.equal(out.views.length,0);
  const invalid=format([await read(native(),'Show my fee remission for academic year ABC.')]);assert.match(invalid.answer,/specify one exact/u);assert.doesNotMatch(invalid.answer,/Remission record count/u);
});

test('readonly, foreign and document limitations do not claim submission, issuance, payment or eligibility',async()=>{
  const write=format([await read(native(),'Change my fee remission amount to 9000 and submit it.')]);
  assert.match(write.answer,/cannot change/u);assert.match(write.answer,/cannot submit/u);assert.equal(write.status,'answered');assert.doesNotMatch(write.answer,/Amount:|9000|successfully submitted/u);
  const foreign=format([await read(native(),"Show Alice's fee remission status.")]);assert.match(foreign.answer,/cannot access another student/u);assert.doesNotMatch(foreign.answer,/QA Remission/u);
  const question='Give me an official fee remission certificate. Has my bank received payment and am I officially eligible?';
  const source=await read(native(),question),out=format([source],{question});
  assert.match(out.answer,/cannot provide an official certificate/u);assert.match(out.answer,/Official payout: not verified/u);assert.match(out.answer,/Official eligibility: not verified/u);
  assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);assert.equal(Object.hasOwn(out,'proposedAction'),false);
});

test('forged fields, source modes, selections, counts, literals and capabilities fail closed',async()=>{
  const source=await read();
  for(const update of [
    (p:any)=>{p.records[0].user_id=owner;},(p:any)=>{p.records[0].student_number='PRIVATE';},(p:any)=>{p.records[0].amount_text=0;},
    (p:any)=>{p.records[0].amount_text='\0';},(p:any)=>{p.records[0].amount_text='x'.repeat(81);},
    (p:any)=>{p.provenance.synchronized=true;},(p:any)=>{p.provenance.source='official';},(p:any)=>{p.capability.write=true;},
    (p:any)=>{p.counts.matching=2;},(p:any)=>{p.counts.omitted=1;},(p:any)=>{p.complete=false;},
    (p:any)=>{p.selection.academicYear='114';},(p:any)=>{p.selection.currentTerm=true;},(p:any)=>{p.periodChoices=[{academic_year_text:'115',semester_text:'1'}];},
  ])assert.throws(()=>format([change(source,update)]),TypeError);
  const badUrl=structuredClone(source);badUrl.evidence.url='/school-affairs/services/39-1';assert.throws(()=>format([badUrl]),TypeError);
  const unavailable=unavailableFeeRemissionEvidence('read_failed');assert.throws(()=>format([change(unavailable,p=>{p.periodChoices=[{academic_year_text:'115',semester_text:'1'}];})]),TypeError);
  const current=await read(native(),'Show my current term fee remission.');assert.throws(()=>format([change(current,p=>{p.selection.currentTerm=false;})]),TypeError);
});

test('record notes cannot become Markdown links, fake headings or executed instructions',async()=>{
  const note='Safe text\n\n[click](https://private.invalid)\n\n# Official payment confirmed\n<script>steal()</script> `quoted`';
  const source=await read(native([row(0,{notes_text:note})])),out=format([source]),html=micromark(out.answer);
  assert.ok(!html.includes('href="https://private.invalid'));assert.ok(!html.includes('<h1>'));assert.ok(!html.includes('<script>'));
  assert.match(out.answer,/\\n\\n/u);assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);
  assert.equal(Object.hasOwn(out,'proposedAction'),false);
});

test('native Unicode maximums and whole-record evidence/display omissions remain bounded and explicit',async()=>{
  const source=await read(native([row(0,{notes_text:'😀'.repeat(2000)})])),out=format([source]);assert.ok(out.answer.includes('😀'.repeat(2000)));
  const many=await read(native(Array.from({length:30},(_,i)=>row(i,{notes_text:'NOTE '+i+' '+('x'.repeat(1900))})))),bounded=format([many]);
  assert.equal(many.readState,'partial');assert.equal(bounded.complete,false);assert.equal(bounded.views[0].total,content(many).counts.included);assert.match(bounded.answer,/Evidence omits whole matching records/u);
  assert.ok(bounded.answer.length<=supplementalAnswerLimits.answerCharacters);assert.ok(Buffer.byteLength(JSON.stringify(bounded))<=supplementalAnswerLimits.resultBytes);
  assert.ok(bounded.views[0].rows.length<=12);assert.doesNotMatch(bounded.answer,/QA Remission 29/u);
  const text=bounded.answer.split('\n');for(let i=0;i<text.length;i++)if(text[i].startsWith('  - '))assert.ok(text.slice(0,i).some(line=>line.startsWith('- Fee remission record:')));
});

test('compound native sources remain independent when one read is unavailable',async()=>{
  const dorm=await readDormitoryConductEvidence(account,{question:'Show my dormitory conduct.'},{load:async()=>({snapshot:{userId:owner,sourceMode:'local_demo',version:1,result:'empty'}})});
  for(const fee of [await read(),unavailableFeeRemissionEvidence('read_failed')]){
    const out=format([fee,dorm],{question:'Show my fee remission and dormitory conduct.'});assert.equal(out.status,'answered');
    assert.deepEqual(out.sourceIds,['account:feeRemission','account:dormitoryConduct']);assert.match(out.answer,/Saved dormitory-conduct result: ` empty/u);
    assert.equal(answerLinksSupported(out.answer,[fee.evidence,dorm.evidence]),true);
    if(fee.readState==='unavailable'){assert.match(out.answer,/remission history is unavailable/u);assert.equal(out.complete,false);assert.doesNotMatch(out.answer,/Amount: ` 0/u);}
  }
});

test('independent native-case facts pass with real reader and formatter; changed amount and foreign literal fail',async()=>{
  const suffixes=['historical-period','zero-amount','null-not-zero','blank-not-null','leading-zero-period','student-number-explicit','student-number-not-requested'];
  for(const item of buildFeeRemissionCases().filter((entry:any)=>suffixes.some(suffix=>entry.id==='account:fee-remission-'+suffix))){
    const fixture=feeRemissionFixtureForCase(item),source=await readFeeRemissionEvidence({...account,user:{id:fixture.owner}},{question:item.question,route:item.route},{load:async()=>fixture.response});
    const out=format([source],{question:item.question});
    // Content oracle only: no model or runtime execution is credited by these deterministic fixtures.
    const contentCase={...item,expected:{behavior:'answer',facts:item.expected.facts,forbiddenText:item.expected.forbiddenText,forbiddenAccountMarkers:item.expected.forbiddenAccountMarkers,requiredLinks:[route]}};
    const envelope={statusCode:200,body:out,events:[],execution:'deterministic',fixtureKey:item.fixtureKey};
    const grade=gradeCase(contentCase,envelope);assert.deepEqual(grade.failures.filter((failure:any)=>failure.id!=='answer.verification'),[],item.id);
    if(item.id.endsWith('zero-amount')){
      const wrong=gradeCase(contentCase,{...envelope,body:{...out,answer:out.answer.replace('Amount: ` 0 `','Amount: ` 9 `'),views:[]}});assert.ok(wrong.failures.some((failure:any)=>failure.id!=='answer.verification'),JSON.stringify(wrong.failures));
    }
    const leaked=gradeCase(contentCase,{...envelope,body:{...out,answer:out.answer+'\nFOREIGN REMISSION CATEGORY'}});assert.ok(leaked.failures.some((failure:any)=>failure.id!=='answer.verification'),JSON.stringify(leaked.failures));
  }
});

test('composition and independent review preserve remission/charge provenance and exact references without extra calls',async()=>{
  const source=await read(),evidence=[source.evidence,{id:'account:charges',url:'/school-affairs/services/39-1',content:JSON.stringify({records:[{label:'QA Tuition instalment',remaining:23000,currency:'TWD'}]})}];
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,requests:any[]=[];
  const answer='Saved fee remission amount is the literal text 0. Separately, QA Tuition instalment has remaining 23000 TWD.';
  const replies:any[]=[{status:'answered',answer,sourceIds:['account:feeRemission','account:charges']},{supported:true,answersQuestion:true,claims:[
    {claim:'Remission amount is saved text 0.',supported:true,evidenceId:'account:feeRemission',quotes:[],jsonPaths:['/records/0/amount_text','/provenance/source']},
    {claim:'Tuition remaining is 23000 TWD.',supported:true,evidenceId:'account:charges',quotes:[],jsonPaths:['/records/0/remaining','/records/0/currency']},
  ]}];
  process.env.OPENAI_API_KEY='offline-synthetic';globalThis.fetch=async(input,init)=>{
    assert.equal(new URL(String(input)).hostname,'api.openai.com');requests.push(JSON.parse(String(init?.body)));assert.ok(replies.length);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(replies.shift())}]}]});
  };
  try{
    const context={question:'Show my remission amount and tuition balance separately.',evidence,deadline:Date.now()+5000};
    const candidate=await composeEvidenceAnswer(context),verdict=await verifyEvidenceAnswer({...context,candidate});assert.equal(verdict.ok,true);assert.equal(requests.length,2);
    for(const request of requests)for(const term of ['account:feeRemission','current_term_not_designated','literal','null','separate charges evidence'])assert.ok(request.instructions.includes(term),term);
    replies.push({supported:true,answersQuestion:true,claims:[{claim:'Saved amount is 999.',supported:true,evidenceId:'account:feeRemission',quotes:['999'],jsonPaths:['/records/99/amount_text']}]});
    const bad=await verifyEvidenceAnswer({...context,candidate:{...candidate,answer:'Saved amount is 999.'}});assert.equal(bad.ok,false);
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});

test('a truthful current-term limitation can pass its first independent review without another read or generation',async()=>{
  let reads=0,reviews=0;
  const question='Show my current term fee remission amount.';
  const source=await readFeeRemissionEvidence(account,{question,route},{load:async()=>{reads++;return native();}}),candidate=format([source],{question});
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='offline-synthetic';
  globalThis.fetch=async(_input,init)=>{
    reviews++;const request=JSON.parse(String(init?.body));assert.equal(request.text.format.name,'answer_evidence_review');
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,answersQuestion:true,claims:[
      {claim:'No current fee-remission term is designated; exact labels are needed.',supported:true,evidenceId:'account:feeRemission',quotes:[],jsonPaths:['/reason','/selection/currentTerm','/periodChoices/0/academic_year_text','/periodChoices/0/semester_text']},
    ]})}]}]});
  };
  try{
    const verdict=await verifyEvidenceAnswer({question,candidate,evidence:[source.evidence],deadline:Date.now()+5000});
    assert.equal(verdict.ok,true);assert.equal(reads,1);assert.equal(reviews,1);assert.equal(candidate.complete,false);
    assert.doesNotMatch(candidate.answer,/Amount:|Check status:|PRIVATE_STUDENT/u);
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
