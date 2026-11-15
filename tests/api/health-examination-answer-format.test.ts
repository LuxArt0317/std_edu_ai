import test from 'node:test';
import assert from 'node:assert/strict';
import {micromark} from 'micromark';
import {readHealthExaminationEvidence,unavailableHealthExaminationEvidence,type HealthExaminationEvidenceResult} from '../../server/accountHealthExaminationEvidence.js';
import {readFeeRemissionEvidence} from '../../server/accountFeeRemissionEvidence.js';
import {formatSupplementalAccountAnswers as format,supplementalAnswerLimits} from '../../server/supplementalAccountAnswers.js';
import {answerLinksSupported,composeEvidenceAnswer,repairEvidenceAnswer,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';

const owner='36000000-0000-4000-8000-000000000001',route='/school-affairs/services/36-1';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}};
const question='Show my health examination records.';
const row=(index=1,available=false,code='EXAM-'+index)=>({id:'36000000-0000-4000-8001-'+String(index).padStart(12,'0'),examination_code:code,
  student_number:'PRIVATE_STUDENT_NUMBER',student_name:'PRIVATE_NAME',class_label:'PRIVATE_CLASS',report_available:available});
const native=(total=2,rows=[row(),row(2,true)])=>({userId:owner,total,rows});
const read=(value:unknown=native(),q=question,page=1)=>readHealthExaminationEvidence(account,{question:q,route:route+(page>1?'?page='+page:'')},{read:async()=>value});
const content=(result:HealthExaminationEvidenceResult)=>JSON.parse(result.evidence.content);
function change(source:HealthExaminationEvidenceResult,update:(value:any)=>void){const result=structuredClone(source),p=content(result);update(p);result.evidence.content=JSON.stringify(p);return result;}

test('actual native availability fields remain exactly paired without identity, file or clinical projection',async()=>{
  const data=native(2,[row(1,false,' 0001 '),row(2,true,'HEALTH-002')]),before=structuredClone(data);
  const source=await read(data),out=format([source],{question});
  assert.equal(out.status,'answered');assert.equal(out.complete,true);assert.deepEqual(out.sourceIds,['account:healthExaminations']);
  assert.deepEqual(out.views[0].columns,['Examination code','Saved report availability']);
  assert.deepEqual(out.views[0].rows,[[' 0001 ','false'],['HEALTH-002','true']]);assert.equal(out.views[0].total,2);
  assert.match(out.answer,/- Examination code: `  0001  `\n  - Saved report availability: ` false `/u);
  assert.match(out.answer,/- Examination code: ` HEALTH-002 `\n  - Saved report availability: ` true `/u);
  assert.match(out.answer,/not a clinical report/u);assert.match(out.answer,/file access is not guaranteed/u);
  assert.doesNotMatch(JSON.stringify(out),/PRIVATE_|OFFLINE_|36000000|storage\/v1|\.pdf\b|user_id|student_number/u);
  assert.deepEqual(data,before);assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);
  assert.equal(Object.hasOwn(out,'verification'),false);assert.equal(Object.hasOwn(out,'proposedAction'),false);
});

test('successful zero collection differs from empty later page and unread earlier or later pages',async()=>{
  const empty=format([await read(native(0,[]))]);assert.equal(empty.complete,true);
  assert.match(empty.answer,/Saved examination-record count: 0/u);assert.match(empty.answer,/successful local read returned zero saved examination records/u);
  const laterSource=await read(native(2,[]),question,2),later=format([laterSource]);assert.equal(later.complete,false);
  assert.match(later.answer,/Saved examination-record count: 2/u);assert.match(later.answer,/Selected page: 2/u);
  assert.match(later.answer,/selected page contains no rows, but saved records exist on other pages/u);
  assert.doesNotMatch(later.answer,/returned zero saved examination records/u);assert.equal(later.views[0].total,0);
  assert.equal(later.citations[0].url,route+'?page=2');assert.equal(answerLinksSupported(later.answer,[laterSource.evidence]),true);
  const first=await read(native(26,Array.from({length:25},(_,i)=>row(i+1,i%2===0)))),out=format([first]);
  assert.equal(out.complete,false);assert.match(out.answer,/count: 26/u);assert.match(out.answer,/Returned on this page: 25/u);
  assert.match(out.answer,/More saved rows exist after this page/u);assert.equal(out.views[0].total,25);
  assert.equal(out.views[0].rows.length,12);assert.ok(out.formatting.omittedViewRows>0);assert.match(out.answer,/Display excerpt/u);
  const last=format([await read(native(26,[row(26,true)]),question,2)]);
  assert.match(last.answer,/offset 25/u);assert.match(last.answer,/Earlier pages were not included/u);assert.doesNotMatch(last.answer,/More saved rows exist after/u);
});

test('failed, denied and malformed reads answer only a precise limitation, never zero availability',async()=>{
  for(const source of [unavailableHealthExaminationEvidence('read_failed'),unavailableHealthExaminationEvidence('reader_unavailable'),await read({...native(),userId:'36000000-0000-4000-8000-000000000002'})]){
    const out=format([source]);assert.equal(out.status,'answered');assert.equal(out.complete,false);assert.deepEqual(out.views,[]);
    assert.match(out.answer,/record count and report availability remain unknown/u);assert.doesNotMatch(out.answer,/Saved examination-record count:|Examination code:|Saved report availability:/u);
    assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);
  }
  const denied=await readHealthExaminationEvidence(account,{question,route},{read:async()=>{throw Object.assign(new Error('PRIVATE_ERROR'),{status:403});}});
  assert.doesNotMatch(format([denied]).answer,/PRIVATE_ERROR|no saved records|count: 0/iu);
});

test('clinical and file questions retain metadata while clearly withholding clinical dates and file authorization',async()=>{
  const q='Show my health examination results and available PDF reports.',source=await read(native(),q),out=format([source],{question:q});
  assert.equal(content(source).selection.clinical,true);assert.equal(content(source).selection.document,true);
  assert.equal(out.status,'answered');assert.equal(out.complete,false);assert.equal(out.views[0].rows.length,2);
  assert.match(out.answer,/cannot determine clinical results, diagnoses or examination dates/u);
  assert.match(out.answer,/cannot provide a report file, signed URL, printout or download authorization/u);
  assert.match(out.answer,/false flag does not establish no examination, no medical condition or a normal result/u);
  assert.deepEqual(out.citations.map(c=>c.url),[route]);assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);
  assert.doesNotMatch(out.answer,/examination date is|diagnosis is|your results are normal|download here/iu);
  const zh=format([source],{language:'zh-TW'});assert.match(zh.answer,/檢查代碼: ` EXAM-1 `/u);assert.match(zh.answer,/已儲存報告可用旗標: ` false `/u);
  assert.match(zh.answer,/無法從這些資料判定臨床結果/u);
  const continued='Show my health examination results, examination date and PDF reports.';
  const continuedSource=await read(native(),continued),continuedOut=format([continuedSource],{question:continued});
  assert.equal(content(continuedSource).selection.clinical,true);assert.equal(content(continuedSource).selection.document,true);
  assert.equal(continuedOut.complete,false);assert.match(continuedOut.answer,/cannot provide a report file/u);
});

test('foreign, guest, action and malformed page limitations never make another read or expose requested values',async()=>{
  for(const [q,pattern]of [["Show Alice's health records.",/cannot access another student/u],['Delete my health records.',/cannot delete or change .*cannot upload or submit reports/u],['Show my health records page two.',/choose one explicit health-record page number/u]] as const){
    const source=await readHealthExaminationEvidence(account,{question:q,route},{read:async()=>assert.fail('Boundary must not read')}),out=format([source],{question:q});
    assert.equal(out.status,'answered');assert.equal(out.complete,false);assert.match(out.answer,pattern);
    assert.doesNotMatch(out.answer,/EXAM-1|Alice|Examination code:/u);assert.equal(Object.hasOwn(out,'proposedAction'),false);
  }
  const source=await readHealthExaminationEvidence({...account,token:''},{question},{read:async()=>assert.fail('Guest must not read')});
  assert.match(format([source]).answer,/Sign in to read your own/u);
});

test('forged fields, page arithmetic, source links, availability flags and capabilities fail closed',async()=>{
  const source=await read();
  for(const update of [
    (p:any)=>{p.records[0].student_name='PRIVATE';},(p:any)=>{p.records[0].id=owner;},(p:any)=>{p.records[0].examinationDate='2026-11-14';},
    (p:any)=>{p.records[0].clinicalContent='PRIVATE';},(p:any)=>{p.records[0].reportAvailable='true';},(p:any)=>{p.records[0].examinationCode='bad\ncode';},
    (p:any)=>{p.records[0].examinationCode='x'.repeat(81);},(p:any)=>{p.records[1].examinationCode=p.records[0].examinationCode;},
    (p:any)=>{p.counts.total=3;},(p:any)=>{p.counts.included=1;},(p:any)=>{p.counts.omitted=1;},(p:any)=>{p.counts.offset=25;},
    (p:any)=>{p.counts.pageSize=26;},(p:any)=>{p.counts.hasMore=true;},(p:any)=>{p.collectionState='page_empty';},(p:any)=>{p.complete=false;},
    (p:any)=>{p.selection.page=202;},(p:any)=>{p.selection.reason='foreign_request';},(p:any)=>{p.capability.downloads=true;},
    (p:any)=>{p.provenance.synchronized=true;},(p:any)=>{p.provenance.sourceMode='official';},
  ])assert.throws(()=>format([change(source,update)]),TypeError);
  for(const url of [route+'?page=1',route+'?page=2',route+'?page=202',route+'?owner='+owner,'https://stu.best'+route]){
    const bad=structuredClone(source);bad.evidence.url=url;bad.evidence.urls=[url];assert.throws(()=>format([bad]),TypeError);
  }
  const failed=unavailableHealthExaminationEvidence('read_failed');assert.throws(()=>format([change(failed,p=>{p.counts.total=0;})]),TypeError);
});

test('untrusted examination code remains inert Markdown and cannot introduce a file link or a clinical conclusion',async()=>{
  const code='[Normal diagnosis](https://private.invalid) <b>normal</b> `x`';
  const source=await read(native(1,[row(1,true,code)])),out=format([source]),html=micromark(out.answer);
  assert.ok(!html.includes('href="https://private.invalid'));assert.ok(!html.includes('<b>normal</b>'));
  assert.match(out.answer,/Examination code:/u);assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);
  assert.equal(out.views[0].rows[0][0],code);assert.equal(Object.hasOwn(out,'proposedAction'),false);
});

test('whole-row evidence and display limits preserve explicit omitted counts and truthful retrieved card total',async()=>{
  const rows=Array.from({length:25},(_,i)=>row(i+1,i%2===0,String(i).padStart(2,'0')+'健'.repeat(78)));
  const source=await read(native(25,rows)),p=content(source),out=format([source]);
  assert.equal(out.views[0].total,p.counts.included);assert.equal(p.counts.included+p.counts.omitted,25);
  assert.ok(out.answer.length<=supplementalAnswerLimits.answerCharacters);assert.ok(Buffer.byteLength(JSON.stringify(out))<=supplementalAnswerLimits.resultBytes);
  if(p.counts.omitted){assert.match(out.answer,/Whole page records were omitted/u);assert.equal(out.complete,false);}
  for(const values of out.views[0].rows)assert.ok(rows.some(sourceRow=>sourceRow.examination_code===values[0]&&String(sourceRow.report_available)===values[1]));
});

test('health and remission display stay separate when one source fails',async()=>{
  const fee=await readFeeRemissionEvidence(account,{question:'Show my fee remission.'},{load:async()=>({userId:owner,records:[{id:'36000000-0000-4000-8001-000000000099',version:1,row_order:0,academic_year_text:'115',semester_text:'1',student_number:'PRIVATE_NUMBER',category_text:'QA Fee',amount_text:'0.00',check_status_text:'Saved',notes_text:null}]})});
  for(const health of [await read(),unavailableHealthExaminationEvidence('read_failed')]){
    const out=format([health,fee],{question:'Show my health records and fee remission.'});
    assert.deepEqual(out.sourceIds,['account:healthExaminations','account:feeRemission']);assert.match(out.answer,/Amount: ` 0\.00 `/u);
    assert.equal(answerLinksSupported(out.answer,[health.evidence,fee.evidence]),true);assert.doesNotMatch(JSON.stringify(out),/PRIVATE_NUMBER/u);
    if(health.readState==='unavailable'){assert.equal(out.complete,false);assert.match(out.answer,/report availability remain unknown/u);assert.doesNotMatch(out.answer,/EXAM-1/u);}
  }
});

test('precise failed-read metadata limitation reaches first independent review without generation or another read',async()=>{
  let reads=0,reviews=0;
  const source=await readHealthExaminationEvidence(account,{question},{read:async()=>{reads++;throw new Error('PRIVATE_ERROR');}}),candidate=format([source],{question});
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='offline-synthetic';
  globalThis.fetch=async(_input,init)=>{reviews++;const request=JSON.parse(String(init?.body));assert.equal(request.text.format.name,'answer_evidence_review');
    assert.match(request.instructions,/account:healthExaminations/u);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,answersQuestion:true,claims:[
      {claim:'The saved local metadata could not be checked; count and availability remain unknown.',supported:true,evidenceId:'account:healthExaminations',quotes:[],jsonPaths:['/readState','/reason','/counts/total','/provenance/sourceMode','/rules']},
    ]})}]}]});};
  try{assert.equal((await verifyEvidenceAnswer({question,candidate,evidence:[source.evidence],deadline:Date.now()+5000})).ok,true);assert.equal(reads,1);assert.equal(reviews,1);}
  finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});

test('compose, correction and independent review receive metadata-only policy and reject invented clinical references',async()=>{
  const source=await read(),evidence=[source.evidence,{id:'account:charges',url:'/school-affairs/services/39-1',content:JSON.stringify({records:[{label:'QA Tuition',remaining:23000,currency:'TWD'}]})}];
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,requests:any[]=[];
  const answer='Saved local examination code EXAM-2 has reportAvailable true. Separately, QA Tuition has remaining 23000 TWD. No clinical content is supplied.';
  const generated={status:'answered',answer,sourceIds:['account:healthExaminations','account:charges']};
  const replies:any[]=[generated,generated,{supported:true,answersQuestion:true,claims:[
    {claim:'EXAM-2 has true availability metadata.',supported:true,evidenceId:'account:healthExaminations',quotes:[],jsonPaths:['/records/1/examinationCode','/records/1/reportAvailable','/provenance/sourceMode','/rules']},
    {claim:'QA Tuition remaining is 23000 TWD.',supported:true,evidenceId:'account:charges',quotes:[],jsonPaths:['/records/0/label','/records/0/remaining','/records/0/currency']},
  ]}];
  process.env.OPENAI_API_KEY='offline-synthetic';globalThis.fetch=async(_input,init)=>{requests.push(JSON.parse(String(init?.body)));assert.ok(replies.length);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(replies.shift())}]}]});};
  try{
    const context={question:'Show my health reports and tuition balance.',evidence,deadline:Date.now()+5000};
    const first=await composeEvidenceAnswer(context),candidate=await repairEvidenceAnswer({...context,candidate:first,feedback:['Keep availability separate from clinical content.']});
    assert.equal((await verifyEvidenceAnswer({...context,candidate})).ok,true);assert.equal(requests.length,3);
    for(const request of requests){assert.match(request.instructions,/account:healthExaminations/u);assert.match(request.instructions,/checkedAt/u);assert.match(request.instructions,/clinical/u);assert.doesNotMatch(JSON.stringify(request),/PRIVATE_|OFFLINE_TOKEN|36000000/u);}
    replies.push({supported:true,answersQuestion:true,claims:[{claim:'Your examination was normal.',supported:true,evidenceId:'account:healthExaminations',quotes:[],jsonPaths:['/records/0/diagnosis']}]});
    assert.equal((await verifyEvidenceAnswer({...context,candidate:{...candidate,answer:'Your examination was normal.'}})).ok,false);
    assert.equal(answerLinksSupported('Open [PDF](https://private.invalid/report.pdf)',evidence),false);
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
