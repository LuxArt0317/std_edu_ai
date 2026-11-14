import test from 'node:test';
import assert from 'node:assert/strict';
import {micromark} from 'micromark';
import {formatSelectedChargeEvidence as format,selectedChargeAnswerLimits} from '../../server/selectedChargeEvidenceAnswer.js';
import {accountEvidence} from '../../server/answerVerificationAccount.js';
import {loadOwnAffairsCharges} from '../../server/affairsWorkspace.js';
import {answerLinksSupported,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
import {readHealthExaminationEvidence} from '../../server/accountHealthExaminationEvidence.js';
import {readFeeRemissionEvidence} from '../../server/accountFeeRemissionEvidence.js';
import {readCounselingEvidence} from '../../server/accountCounselingEvidence.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import type {VerificationEvidence} from '../../server/answerVerification.js';

const owner='39000000-0000-4000-8000-000000000001',student='39000000-0000-4000-8000-000000000002';
const path='/school-affairs/services/39-1',checkedAt='2026-11-14T12:00:00.000Z';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}};
const row=(index=1,overrides:Record<string,unknown>={})=>({id:'39000000-0000-4000-8001-'+String(index).padStart(12,'0'),label:'QA tuition '+index,
  amountDue:30000,amountPaid:7000,currency:'TWD',sourceMode:'sample',dueOn:null,occurrenceOn:null,category:null,
  contactUnit:'PRIVATE_CONTACT',contactExtension:'PRIVATE_EXTENSION',paymentUnit:'PRIVATE_PAYMENT_UNIT',...overrides});
const source=(rows:Record<string,unknown>[]=[row()],extra:Record<string,unknown>={},budget=70000)=>accountEvidence({checkedAt,profile:{userId:owner},studentRecordFound:true,charges:rows,...extra},['charges'],{budget}).find(value=>value.id==='account:charges')!;
const change=(evidence:VerificationEvidence,fn:(payload:any)=>void)=>{const result=structuredClone(evidence),payload=JSON.parse(result.content);fn(payload);result.content=JSON.stringify(payload);return result;};

test('actual caller-scoped loader → bounded source → candidate retains exact paired values and minimizes identity',async()=>{
  const originalFetch=globalThis.fetch,calls:URL[]=[];
  globalThis.fetch=async(input,init)=>{const url=new URL(String(input));calls.push(url);assert.equal(init?.method,'GET');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer OFFLINE_TOKEN');
    if(url.pathname.endsWith('/affairs_students')){assert.equal(url.searchParams.get('user_id'),'eq.'+owner);return Response.json([{id:student,user_id:owner}]);}
    assert.ok(url.pathname.endsWith('/affairs_charges'));assert.equal(url.searchParams.get('student_id'),'eq.'+student);
    return Response.json([{id:row().id,student_id:student,label:'QA tuition',amount_due:'30000.29',amount_paid:'7000.20',currency:'TWD',source_mode:'sample',due_on:'2026-12-01',contact_unit:'PRIVATE_CONTACT'}]);};
  try{
    const snapshot=await loadOwnAffairsCharges(account),evidence=accountEvidence(snapshot,['charges']).find(value=>value.id==='account:charges')!,before=structuredClone(evidence),out=format(evidence);
    assert.equal(calls.length,2);assert.equal(out.status,'answered');assert.equal(out.complete,true);assert.deepEqual(out.sourceIds,['account:charges']);
    assert.deepEqual(out.views[0].rows,[['QA tuition','TWD','30,000.29','7,000.20','23,000.09','sample']]);assert.equal(out.views[0].total,1);
    assert.match(out.answer,/^` QA tuition ` has ` NT\$23,000\.09 ` remaining \(` NT\$30,000\.29 ` charged, ` NT\$7,000\.2 ` paid\)\./u);
    assert.match(out.answer,/sample rows are demonstration data/u);assert.match(out.answer,/not confirm university balances or bank transfers/u);
    assert.doesNotMatch(out.answer,/Remaining totals|Loaded owned rows/u);assert.match(out.views[0].note,/Loaded owned rows: 1/u);assert.match(out.views[0].note,/not every financial obligation/u);assert.ok(out.answer.length<600);
    assert.doesNotMatch(JSON.stringify(out),/PRIVATE_|OFFLINE_|39000000|2026-12-01|student_id|user_id/u);
    assert.equal(answerLinksSupported(out.answer,[evidence]),true);assert.deepEqual(evidence,before);
    assert.equal(Object.hasOwn(out,'verification'),false);assert.equal(Object.hasOwn(out,'proposedAction'),false);
  }finally{globalThis.fetch=originalFetch;}
});

test('zero, exact cents and distinct currency/provenance groups never become a combined account balance',()=>{
  const out=format(source([row(1,{amountDue:0,amountPaid:0}),row(2,{amountDue:0.29,amountPaid:0.2}),row(3,{amountDue:100,amountPaid:1,currency:'USD'}),row(4,{amountDue:7,amountPaid:0,sourceMode:'verified'})]));
  assert.deepEqual(out.views[0].rows.map(values=>values.slice(1)),[['TWD','0.00','0.00','0.00','sample'],['TWD','0.29','0.20','0.09','sample'],['USD','100.00','1.00','99.00','sample'],['TWD','7.00','0.00','7.00','verified']]);
  assert.match(out.answer,/- ` TWD ` \/ ` sample `: ` 0\.09 `/u);assert.match(out.answer,/` USD 99 ` remaining/u);assert.match(out.answer,/` NT\$7 ` remaining/u);
  assert.doesNotMatch(out.answer,/106\.09|7\.09|payment (?:is )?confirmed|no debt|total account balance/iu);
  assert.match(out.answer,/“Verified” is a saved source label/u);
  const literalCurrency=format(source([row(1,{currency:'Saved currency'})]));assert.match(literalCurrency.answer,/` Saved currency 23,000 `/u);assert.doesNotMatch(literalCurrency.answer,/NT\$|TWD/u);
});

test('successful empty, exact selected-label empty, failed read and unlinked account remain distinct',()=>{
  const empty=format(source([]));assert.equal(empty.complete,true);assert.match(empty.answer,/successful local read returned no saved charge rows/u);assert.doesNotMatch(empty.answer,/remaining.*0\.00/iu);
  const selected=format(source([],{chargeSelectionLabel:'QA selected tuition'}));assert.match(selected.answer,/no saved charge matching that exact label/u);assert.match(selected.answer,/not mean there are no other charges/u);
  const selectedPositive=format(source([row(1,{label:'QA selected tuition'})],{chargeSelectionLabel:' QA SELECTED TUITION '}));assert.equal(selectedPositive.complete,true);assert.match(selectedPositive.answer,/^` QA selected tuition ` has/u);
  const failed=format(source([],{studentRecordFound:undefined,chargeReadUnavailable:true}));assert.equal(failed.complete,false);assert.match(failed.answer,/could not be read/u);assert.match(failed.answer,/balance is unknown/u);assert.doesNotMatch(failed.answer,/Loaded owned rows: 0|no saved charge|successful local/u);assert.deepEqual(failed.views,[]);
  const unlinked=format(source([],{studentRecordFound:false}));assert.equal(unlinked.complete,false);assert.match(unlinked.answer,/No linked local student record/u);assert.match(unlinked.answer,/fee balance is unknown/u);assert.doesNotMatch(unlinked.answer,/no saved charge|Loaded owned rows: 0/u);
  const legacy=format(source([],{studentRecordFound:undefined}));assert.equal(legacy.complete,false);assert.match(legacy.answer,/successful scoped-read metadata is absent/u);assert.doesNotMatch(legacy.answer,/successful local read returned no/u);
});

test('budgeted whole rows, selected-scope counts and legacy rows never establish an overall balance',()=>{
  const rows=[row(1,{label:'Oversized '+ 'x'.repeat(30000)}),row(2,{label:'Small selected charge',amountDue:1,amountPaid:0})];
  const evidence=source(rows);
  const out=format(evidence);assert.equal(out.complete,false);assert.equal(out.views[0].total,1);assert.equal(out.views[0].rows[0][0],'Small selected charge');
  assert.match(out.answer,/selected rows: 2; included in this evidence: 1; omitted from evidence: 1/u);assert.match(out.answer,/No complete balance total/u);assert.doesNotMatch(out.answer,/Remaining totals for/u);
  const none=change(evidence,p=>{p.records=[];p.counts[0].includedRows=0;p.includedRows=0;});const noneOut=format(none);
  assert.match(noneOut.answer,/Selected charge rows exist but none fit/u);assert.doesNotMatch(noneOut.answer,/no saved charge|zero balance/u);assert.deepEqual(noneOut.views,[]);
  const narrowed=change(source([row()]),p=>{p.counts[0].availableRows=2;p.availableRows=2;p.selection.availableRows=2;});assert.equal(format(narrowed).complete,false);assert.doesNotMatch(format(narrowed).answer,/Remaining totals for/u);
  assert.doesNotMatch(format(source([row()],{studentRecordFound:undefined})).answer,/Remaining totals for/u);
});

test('the actual budget-failure envelope yields only an actionable unknown limitation',()=>{
  const evidence=source([row()],{chargeSelectionLabel:'z'.repeat(20000)},6000),p=JSON.parse(evidence.content);
  assert.equal(p.excerpted,true);assert.match(p.unavailableReason,/budget/u);
  const out=format(evidence);assert.equal(out.status,'answered');assert.equal(out.complete,false);assert.deepEqual(out.views,[]);assert.match(out.answer,/did not fit the answer budget/u);assert.equal(answerLinksSupported(out.answer,[evidence]),true);
});

test('display limits keep whole record fields paired, skip oversized rows and disclose omitted totals',()=>{
  const rows=Array.from({length:25},(_,index)=>row(index+1,{label:index===0?'Oversized '+ 'x'.repeat(10000):'Charge '+index,amountDue:index,amountPaid:0}));
  const evidence=source(rows),p=JSON.parse(evidence.content),out=format(evidence);assert.equal(p.records.length,25);
  assert.equal(out.complete,false);assert.equal(out.views[0].rows.length,12);assert.equal(out.views[0].total,25);assert.equal(out.formatting.omittedItems,13);
  assert.equal(out.views[0].rows[0][0],'Charge 1');assert.match(out.answer,/Display excerpt: 12 of 25 included rows/u);assert.doesNotMatch(out.answer,/Remaining totals for/u);
  assert.ok(out.answer.length<=selectedChargeAnswerLimits.answerCharacters);assert.ok(Buffer.byteLength(JSON.stringify(out))<=selectedChargeAnswerLimits.resultBytes);
  for(const view of out.views[0].rows)assert.ok(rows.some(item=>item.label===view[0]&&Number(item.amountDue).toFixed(2)===view[2]));
});

test('malformed sources, numeric coercion, identity extras and contradictory counts fail closed',()=>{
  const evidence=source();
  for(const fn of [
    (p:any)=>{p.records[0].amountDue=null;},(p:any)=>{p.records[0].amountPaid='0';},(p:any)=>{p.records[0].amountDue=1.005;},
    (p:any)=>{p.records[0].amountPaid=30001;},(p:any)=>{p.records[0].amountPaid=-1;},(p:any)=>{p.records[0].currency=null;},
    (p:any)=>{p.records[0].sourceMode='official';},(p:any)=>{p.records[0].student_name='PRIVATE';},(p:any)=>{p.records[0].bank_last4='1234';},
    (p:any)=>{p.counts[0].includedRows=0;},(p:any)=>{p.counts[0].matchingRows=0;},(p:any)=>{p.counts[0].partial=true;},
    (p:any)=>{p.excerpted=true;},(p:any)=>{p.selection.availableRows=99;},(p:any)=>{p.studentRecordFound=false;},
    (p:any)=>{p.unavailableReason='read_failed';},(p:any)=>{p.selectionLabel='Other charge';},(p:any)=>{p.checkedAt='not a timestamp';},(p:any)=>{p.checkedAt='2026-02-31T12:00:00Z';},
    (p:any)=>{p.records.push(p.records[0]);p.counts[0].includedRows=2;p.counts[0].matchingRows=2;p.counts[0].availableRows=2;p.selection.availableRows=2;p.selection.matchingRows=2;p.availableRows=2;p.includedRows=2;},
  ])assert.throws(()=>format(change(evidence,fn)),TypeError);
  for(const bad of [{...evidence,id:'account:tuition'},{...evidence,url:'https://private.invalid'},{...evidence,urls:[path,'/school-affairs/records']},{...evidence,content:'{}'}])assert.throws(()=>format(bad),TypeError);
});

test('stored Markdown and multiline labels remain inert while all genuine links stay source-bound',()=>{
  const label='Safe\n\n[click](https://private.invalid)\n\n<b>secret</b> `` test';const evidence=source([row(1,{label})]),out=format(evidence),html=micromark(out.answer);
  assert.ok(!html.includes('href="https://private.invalid'));assert.ok(!html.includes('<b>secret</b>'));assert.equal(out.views[0].rows[0][0],label);
  assert.equal(answerLinksSupported(out.answer,[evidence]),true);assert.deepEqual(out.citations.map(item=>item.url),[path]);
  const zh=format(source(),{language:'zh-TW'});assert.match(zh.answer,/剩餘 ` NT\$23,000 `（應繳 ` NT\$30,000 `，已繳 ` NT\$7,000 `）/u);assert.match(zh.answer,/不確認校方餘額或銀行匯款/u);
});

test('native health, counseling and fee sections concatenate without applying remission or mixing their facts',async()=>{
  const health=await readHealthExaminationEvidence(account,{question:'Show my health records.'},{read:async()=>({userId:owner,total:1,rows:[{id:row().id,examination_code:'EXAM-QA',report_available:false,student_name:'PRIVATE_HEALTH_NAME'}]})});
  const remission=await readFeeRemissionEvidence(account,{question:'Show my fee remission.'},{load:async()=>({userId:owner,records:[{id:row().id,version:1,row_order:0,academic_year_text:'115',semester_text:'1',student_number:'PRIVATE_NUMBER',category_text:'QA Fee',amount_text:'90000',check_status_text:'Saved',notes_text:null}]})});
  const counseling=await readCounselingEvidence(account,{question:'Show my counseling appointments.'},{read:async()=>({userId:owner,available:true,canCoordinate:false,rows:[{id:row().id,kind:'counseling',status:'requested',preferred_on:'2026-11-20',preferred_period:'morning',scheduled_at:null,version:1,updated_at:checkedAt}]})});
  const evidence=source(),charge=format(evidence);
  for(const native of [health,remission,counseling]){
    const other=formatSupplementalAccountAnswers([native]),answer=other.answer+'\n\n'+charge.answer;
    assert.equal(answerLinksSupported(answer,[native.evidence,evidence]),true);assert.match(answer,/NT\$23,000/u);
    assert.doesNotMatch(answer,/PRIVATE_|-67,000|remaining.*(?:67,000|90,000)/iu);assert.deepEqual(charge.sourceIds,['account:charges']);
  }
});

test('a precise failed-read candidate reaches independent review without an extra composition or read call',async()=>{
  const evidence=source([],{studentRecordFound:undefined,chargeReadUnavailable:true}),candidate=format(evidence);
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;let reviews=0;process.env.OPENAI_API_KEY='offline-only';
  globalThis.fetch=async(_input,init)=>{reviews++;const body=JSON.parse(String(init?.body));assert.equal(body.text.format.name,'answer_evidence_review');
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,answersQuestion:true,claims:[{claim:'The selected charge read failed and the balance is unknown.',supported:true,evidenceId:'account:charges',quotes:[],jsonPaths:['/unavailableReason']}]})}]}]});};
  try{assert.equal((await verifyEvidenceAnswer({question:'Show my tuition balance.',candidate,evidence:[evidence],deadline:Date.now()+5000})).ok,true);assert.equal(reviews,1);}
  finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
