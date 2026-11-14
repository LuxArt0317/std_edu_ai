import assert from 'node:assert/strict';
import test from 'node:test';
import {readHealthExaminationEvidence,healthExaminationEvidenceMaxBytes,unavailableHealthExaminationEvidence,type HealthExaminationEvidenceAccount} from '../../server/accountHealthExaminationEvidence.js';
import {selectHealthExaminationEvidence as select,isHealthExaminationEvidenceQuestion} from '../../server/healthExaminationEvidenceIntent.js';
const owner='36000000-0000-4000-8000-000000000001',foreign='36000000-0000-4000-8000-000000000002';
const path='/school-affairs/services/36-1',question='Show my health examination records.';
const account=():HealthExaminationEvidenceAccount=>({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC_KEY',token:'SYNTHETIC_TOKEN',user:{id:owner}});
const row=(index=1,available=false)=>({id:'36000000-0000-4000-8000-'+String(index+100).padStart(12,'0'),examination_code:'EXAM-'+index,
  student_number:'PRIVATE-STUDENT-NUMBER',student_name:'PRIVATE-STUDENT-NAME',class_label:'PRIVATE-CLASS',report_available:available});
const native=(total=2,rows=[row(1),row(2,true)])=>({userId:owner,total,rows});
const payload=(value:Awaited<ReturnType<typeof readHealthExaminationEvidence>>)=>JSON.parse(value.evidence.content);

test('actual native DTO is projected to code and availability only, without report authorization',async()=>{
  const original=globalThis.fetch,calls:Array<{url:string;body:unknown}>=[];
  globalThis.fetch=async(input,init)=>{calls.push({url:String(input),body:JSON.parse(String(init?.body))});
    assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer SYNTHETIC_TOKEN');
    return Response.json(native());};
  try{
    const result=await readHealthExaminationEvidence(account(),{question,route:path});
    assert.equal(result.readState,'ok');assert.equal(result.reason,null);
    assert.deepEqual(calls,[{url:account().url+'/rest/v1/rpc/affairs_read_health_examinations',body:{p_offset:0}}]);
    const value=payload(result);
    assert.deepEqual(value.records,[{examinationCode:'EXAM-1',reportAvailable:false},{examinationCode:'EXAM-2',reportAvailable:true}]);
    assert.deepEqual(value.counts,{total:2,offset:0,pageSize:25,returned:2,included:2,omitted:0,hasMore:false});
    assert.equal(value.complete,true);assert.equal(value.collectionState,'records');
    assert.deepEqual(result.evidence.urls,[path]);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE-|SYNTHETIC_|36000000|storage\/v1|signedURL|examined_on/u);
    assert.deepEqual(value.capability,{metadata:true,identity:false,clinicalContent:false,examinationDate:false,downloads:false,write:false});
  }finally{globalThis.fetch=original;}
});

test('selected page maps to exact offset; later-page emptiness never becomes an empty collection',async()=>{
  for(const [page,total,rows,state,collection]of [[1,0,[],'empty','empty'],[2,2,[],'partial','page_empty'],
    [2,26,[row(26)],'partial','records'],[1,26,Array.from({length:25},(_,i)=>row(i+1)),'partial','records']] as const){
    const result=await readHealthExaminationEvidence(account(),{question,route:path+'?page='+page},{read:async(_caller,query)=>{
      assert.deepEqual(query,{scope:'health-examinations',page:String(page)});return native(total,[...rows]);}});
    const value=payload(result);assert.equal(result.readState,state);assert.equal(value.collectionState,collection);
    assert.equal(value.counts.total,total);assert.equal(value.counts.offset,(page-1)*25);assert.equal(value.counts.returned,rows.length);
    assert.equal(value.complete,total===0);assert.equal(value.counts.hasMore,page===1&&total===26);
    assert.equal(result.evidence.url,path+(page===1?'':'?page='+page));
  }
  const selected=await readHealthExaminationEvidence(account(),{question:'On page 2, show my health records.',route:path},{read:async(_caller,query)=>{
    assert.deepEqual(query,{scope:'health-examinations',page:'2'});return native(26,[row(26)]);}});
  assert.equal(payload(selected).counts.offset,25);
  assert.equal(selected.evidence.url,path+'?page=2');
});

test('selector preserves explicit numeric pages and own follow-up context, never speculative public navigation',()=>{
  assert.equal(select('Show my health records on page 2.',path+'?page=3')?.page,2);
  assert.equal(select('查看我的健檢紀錄第2頁。')?.page,2);
  assert.equal(select('On page 2, show my health records.',path)?.page,2);
  assert.equal(select('Show my health records, page 2.',path)?.page,2);
  assert.equal(select('What about reports?', '/', [{role:'user',content:'Show my health records on page 2.'}])?.page,2);
  assert.equal(select('Are my reports available?',path+'?page=3')?.page,3);
  for(const value of ['Where can I find my health examination records?','Show me a link to my health records.',
    'What is a health examination?','學生健康資料卡在哪裡？','健檢紀錄在哪裡？',
    'Don’t show my health examination records.','Show my tuition balance without my health records.',
    'Show my tuition balance and never show my health reports.','Show my tuition balance and do not show my health reports.']){
    assert.equal(select(value,path,[{role:'user',content:question}]),null,value);
    assert.equal(isHealthExaminationEvidenceQuestion(value,path),false,value);
  }
});

test('malformed and conflicting selectors fail before an own read instead of silently selecting page one',async()=>{
  const variants=[['Show my health records page -1.',path,'invalid_selector'],['Show my health records page 2.5.',path,'invalid_selector'],
    ['Show my health records page two.',path,'invalid_selector'],['Show my health records page 202.',path,'invalid_selector'],
    ['On page two, show my health records.',path,'invalid_selector'],
    ['Show my tuition balance, page 2, show my health records.',path,'ambiguous_selector'],
    ['Show my health records page 2 and page 3.',path,'ambiguous_selector'],['Next page',path,'invalid_selector'],
    [question,path+'?page=1&page=2','invalid_route'],[question,path+'?report='+row().id,'invalid_route'],
    [question,path+'?owner='+foreign,'invalid_route'],[question,'https://other.invalid'+path,'invalid_route'],
    [question,'/school-affairs/../school-affairs/services/36-1','invalid_route'],[question,path+'?page=0','invalid_route']];
  for(const [q,route,reason]of variants){
    const result=await readHealthExaminationEvidence(account(),{question:q,route},{read:async()=>assert.fail('Invalid selectors must not read')});
    assert.equal(result.reason,reason,q+' '+route);assert.equal(result.readState,'unavailable');assert.equal(payload(result).counts.total,null);
  }
});

test('foreign named and relational owners are denied while genuine own Chinese requests remain private',async()=>{
  for(const value of ["Show Alice’s health examination records.",'Show health records for Alice.',"Show my colleague’s health reports.",
    'Show their saved health reports.','Show Bob health reports.','What saved health reports does Alice have?',
    'Is the health report available for Alice?','Show the health examination for Alice.',
    'Show health records that Bob owns.','請顯示王小明健檢紀錄。',
    '請顯示王小明自己的健檢紀錄。','請顯示王小明本人的健康檢查報告。']){
    const result=await readHealthExaminationEvidence(account(),{question:value,route:path},{read:async()=>assert.fail('Foreign request must not read')});
    assert.equal(result.reason,'foreign_request',value);assert.equal(payload(result).records.length,0);
  }
  for(const value of ['請顯示我自己的健檢紀錄。','請顯示我本人的健檢紀錄。','請查我的最新健檢報告。',
    'What health examinations do I have?','What saved health reports do I have?',
    'Show health records that I own.','What is on page 2 of my health records?'])assert.equal(select(value,path)?.reason,null,value);
  const follow=await readHealthExaminationEvidence(account(),{question:'What about reports?',route:path,history:[{role:'user',content:'Show Alice’s health examination records.'}]},
    {read:async()=>assert.fail('Foreign follow-up must not substitute own records')});
  assert.equal(follow.reason,'foreign_request');
  const result=await readHealthExaminationEvidence({} as HealthExaminationEvidenceAccount,{question},{read:async()=>assert.fail('Anonymous must not read')});
  assert.equal(result.reason,'unauthorized');
});

test('clinical and document questions expose metadata limits; edits never execute',async()=>{
  const result=await readHealthExaminationEvidence(account(),{question:'Show my health examination results and available PDF reports.',route:path},{read:async()=>native()});
  const value=payload(result);assert.equal(value.selection.clinical,true);assert.equal(value.selection.document,true);
  assert.equal(value.capability.clinicalContent,false);assert.equal(value.capability.downloads,false);assert.deepEqual(result.evidence.urls,[path]);
  const action=await readHealthExaminationEvidence(account(),{question:'Delete my health examination records.',route:path},{read:async()=>assert.fail('Mutation must not read')});
  assert.equal(action.reason,'unsupported_operation');assert.equal(payload(action).records.length,0);
});

test('wrong owners, extra fields, duplicate identities and inconsistent page counts fail closed',async()=>{
  const mutations:Array<(v:any)=>void>=[v=>{v.userId=foreign;},v=>{v.rows[1].id=v.rows[0].id;},v=>{v.rows[1].examination_code=v.rows[0].examination_code;},
    v=>{v.rows[0].clinical_text='PRIVATE-MEDICAL';},v=>{v.rows[0].report_available='true';},v=>{v.total=3;},v=>{v.rows[0].student_name=null;},
    v=>{v.rows[0].id={toString:()=>row().id};},v=>{v.rows[0].examination_code='bad\ntext';},v=>{v.total=-1;},v=>{v.extra='PRIVATE';}];
  for(const update of mutations){const value=native();update(value);
    const result=await readHealthExaminationEvidence(account(),{question},{read:async()=>value});
    assert.equal(result.reason,'invalid_records');assert.equal(payload(result).counts.total,null);assert.deepEqual(payload(result).records,[]);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE-MEDICAL|PRIVATE-STUDENT/u);
  }
});

test('failure, denied access and a hung injected reader cannot become an empty health history',async()=>{
  for(const [error,reason]of [[new Error('SECRET MESSAGE'),'read_failed'],[Object.assign(new Error('SECRET'),{status:403}),'access_denied']] as const){
    const result=await readHealthExaminationEvidence(account(),{question},{read:async()=>{throw error;}});
    assert.equal(result.reason,reason);assert.equal(payload(result).collectionState,'unavailable');assert.equal(payload(result).counts.total,null);
    assert.doesNotMatch(JSON.stringify(result),/SECRET/u);
  }
  const started=Date.now(),result=await readHealthExaminationEvidence({...account(),requestDeadline:Date.now()+25},{question,deadline:Date.now()+500},{read:async()=>new Promise(()=>{})});
  assert.equal(result.reason,'deadline_exceeded');assert.ok(Date.now()-started<500);
  assert.equal(unavailableHealthExaminationEvidence('reader_unavailable').readState,'unavailable');
});

test('caller credentials, owner and page are captured before asynchronous work',async()=>{
  const caller=account(),options={question,route:path+'?page=2'};let captured=false;
  const pending=readHealthExaminationEvidence(caller,options,{read:async(saved,query)=>{
    captured=true;assert.equal(saved.user.id,owner);assert.equal(saved.key,'SYNTHETIC_KEY');assert.equal(saved.token,'SYNTHETIC_TOKEN');
    assert.equal(saved.url,'https://xiftudmvxphxcjtmfmib.supabase.co');assert.deepEqual(query,{scope:'health-examinations',page:'2'});
    assert.equal(Object.isFrozen(saved.user),true);assert.equal(Object.isFrozen(query),true);return native(26,[row(26)]);
  }});
  caller.user.id=foreign;caller.token='MUTATED';caller.key='MUTATED';caller.url='https://other.invalid';options.route=path;
  const result=await pending;assert.equal(captured,true);assert.equal(result.readState,'partial');assert.equal(result.evidence.url,path+'?page=2');
  assert.doesNotMatch(JSON.stringify(result),/MUTATED/u);
});

test('UTF-8 envelope stays bounded and complete rows survive without mutating native inputs',async()=>{
  const rows=Array.from({length:25},(_,i)=>({...row(i+1),examination_code:String(i).padStart(2,'0')+'健'.repeat(78)}));
  const value=native(25,rows),before=structuredClone(value);
  const result=await readHealthExaminationEvidence(account(),{question},{read:async()=>value});
  assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=healthExaminationEvidenceMaxBytes);
  assert.deepEqual(value,before);assert.equal(payload(result).counts.included+payload(result).counts.omitted,25);
  assert.ok(payload(result).records.every((r:{examinationCode:string})=>rows.some(input=>input.examination_code===r.examinationCode)));
});
