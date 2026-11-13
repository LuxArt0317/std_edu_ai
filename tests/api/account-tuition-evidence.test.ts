import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isTuitionEvidenceQuestion,readTuitionEvidence,tuitionEvidenceMaxBytes} from '../../server/accountTuitionEvidence.js';

const owner='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000002';
const id=(number=1)=>`20000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
const stamp='2026-11-13T02:00:00Z',path='/school-affairs/services/49-1';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',token:'PRIVATE-TOKEN',key:'PRIVATE-KEY'};
const row=(number=1,label='Recorded Period A',text:string|null='Literal settlement difference: TWD 730.00; pending review.')=>({id:id(number),userId:owner,sourceMode:'local_demo',version:1,
  createdAt:stamp,updatedAt:stamp,periodId:id(number),periodLabel:label,text,rowOrder:number});
const records=(rows=[row()])=>({periods:rows.map(value=>({id:value.periodId,userId:value.userId,label:value.periodLabel})),settlements:rows,documents:[]});
const decode=(value:Awaited<ReturnType<typeof readTuitionEvidence>>)=>JSON.parse(value.evidence.content);
const read=(value:unknown=records(),question='Show my tuition settlement statement.',route=path)=>readTuitionEvidence(account,{question,route},{load:async()=>value});

test('explicit tuition sources match English/Chinese while unrelated balances and stale contexts do not',()=>{
  for(const question of ['Show my tuition settlement.','What does my fee statement say?','List my settlement periods.',
    'Print my summer tuition receipt.','Show my evening tuition statement.','My extended-study fees.','我的學分學雜費結算差額','暑修選課繳費查詢','進修部繳費單','延修繳費資料'])
    assert.equal(isTuitionEvidenceQuestion(question,'/dtm'),true,question);
  const history=[{role:'user',content:'Show my tuition settlement.'}];
  for(const question of ['How much tuition do I owe?','What is my unpaid balance?','Show my payment history.','What are my grades?','Where is my next class?','What is my email?','查詢我的請假狀態','我的學費餘額？'])
    assert.equal(isTuitionEvidenceQuestion(question,path,history),false,question);
  assert.equal(isTuitionEvidenceQuestion('What does this say?',path),true);
  assert.equal(isTuitionEvidenceQuestion('What does it say?','/dtm',history),true);
  assert.equal(isTuitionEvidenceQuestion('What does it say?','/dtm',[...history,{role:'user',content:'Show my grades'}]),false);
  assert.equal(isTuitionEvidenceQuestion('What does it say?','/dtm',[{role:'assistant',content:history[0].content}]),false);
  for(const route of ['https://other.invalid'+path,'//other.invalid'+path,path+'0','/school-affairs/services/49-2'])assert.equal(isTuitionEvidenceQuestion('What does this say?',route),false);
  assert.equal(isTuitionEvidenceQuestion('What does this say?','https://stu.best'+path+'/?view=records#top'),true);
});

test('personal read keeps literal statements and uses a clamped caller deadline without credentials or owner metadata',async()=>{
  const requested=Date.now()+2000;let calls=0;
  const result=await readTuitionEvidence({...account,role:'admin'} as typeof account,{question:'Show my tuition settlement.',route:path,deadline:requested},{load:async selected=>{
    calls++;assert.equal(selected.user.id,owner);assert.equal(selected.token,account.token);assert.equal(selected.requestDeadline,requested);return records();
  }});
  const value=decode(result);assert.equal(calls,1);assert.equal(result.readState,'ok');assert.equal(result.reason,null);
  assert.equal(result.evidence.id,'account:tuition');assert.equal(result.evidence.url,path);assert.equal(result.evidence.provenance,'local_demo');
  assert.deepEqual(value.records.settlements,[{id:id(),periodId:id(),periodLabel:row().periodLabel,text:row().text,sourceMode:'local_demo',version:1,updatedAt:stamp,url:path}]);
  assert.deepEqual(value.counts,{available:1,matching:1,included:1,omitted:0});assert.equal(value.complete,true);assert.equal(value.excerpted,false);
  assert.match(value.rules,/not official university records/);assert.match(value.rules,/Charges are a separate collection/);
  for(const forbidden of [owner,foreign,'PRIVATE-TOKEN','PRIVATE-KEY','documentMetadata','createdAt','reviewer','storagePath'])assert.ok(!JSON.stringify(result).includes(forbidden),forbidden);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=tuitionEvidenceMaxBytes);
});

test('mutable caller account and options cannot change the captured transport, owner or period selection',async()=>{
  const original={...account,user:{...account.user},requestDeadline:Date.now()+2000};
  const options={question:'Show my tuition statement for Recorded Period A.',route:path,deadline:Date.now()+1000};
  const expected={url:original.url,key:original.key,token:original.token,user:{id:owner},requestDeadline:options.deadline};
  let captured:unknown;const pending=readTuitionEvidence(original,options,{load:async value=>{captured=structuredClone(value);return records([row(),row(2,'Other period')]);}});
  original.url='https://other.invalid';original.key='changed key';original.token='changed token';original.user.id=foreign;original.requestDeadline=0;
  options.question='Show all my tuition statements.';options.deadline=0;
  const result=await pending;assert.equal(result.readState,'ok');assert.deepEqual(captured,expected);
  assert.deepEqual(decode(result).records.settlements.map((value:any)=>value.periodLabel),['Recorded Period A']);
});

test('null, blank and zero statement text remain distinct literal values',async()=>{
  for(const text of [null,'','0','Amount 8; credits 3; stored subtotal 2.5.']){
    const result=decode(await read(records([row(1,'Recorded Period A',text)])));
    assert.equal(result.records.settlements[0].text,text);assert.equal(result.records.settlements[0].periodLabel,'Recorded Period A');
    assert.equal(Object.hasOwn(result.records.settlements[0],'amount'),false);assert.equal(Object.hasOwn(result.records.settlements[0],'paid'),false);
  }
});

test('literal season labels cannot redirect explicit settlement questions to document capabilities',async()=>{
  for(const label of ['114 Summer reconciliation','114 Evening reconciliation','114 Extended-study reconciliation']){
    let calls=0;
    const result=await readTuitionEvidence(account,{question:`What literal statement text is saved for ${label} in my tuition settlements?`,route:path},{load:async()=>{calls++;return records([row(1,label,''),row(2,'Other period','Do not substitute')]);}});
    const value=decode(result);
    assert.equal(calls,1);assert.equal(result.readState,'ok');assert.equal(result.evidence.url,path);
    assert.deepEqual(value.selection.requestedViews,['settlement']);
    assert.equal(value.selection.scope,'named_period_labels');assert.equal(value.selection.requiresClarification,false);
    assert.deepEqual(value.records.settlements.map((item:any)=>[item.periodLabel,item.text]),[[label,'']]);
    assert.equal(value.capabilities.paymentLedger,false);assert.equal(value.capabilities.documentIssuance,false);
  }
});

test('explicit document capabilities and a settlement can both be requested within one clause',async()=>{
  for(const [question,views] of [
    ['Show my summer tuition receipt, with my tuition settlement for Recorded Period A.',['summer','settlement']],
    ['Show my summer tuition payment receipt, with my tuition settlement for Recorded Period A.',['summer','settlement']],
    ['Show my summer official tuition receipt, with my tuition settlement for Recorded Period A.',['summer','settlement']],
    ['Show my evening official tuition payment statement, with my tuition settlement for Recorded Period A.',['evening','settlement']],
    ['Show my evening tuition statement, with my tuition settlement for Recorded Period A.',['evening','settlement']],
    ['Show my extended-study payment records, with my tuition settlement for Recorded Period A.',['extended','settlement']],
    ['查詢暑修收據，還要我的學費結算 Recorded Period A。',['summer','settlement']],
  ] as const){
    const result=await read(records(),question),value=decode(result);
    assert.equal(result.readState,'ok',question);assert.equal(result.evidence.url,path);
    assert.deepEqual(value.selection.requestedViews,views,question);
    assert.equal(value.records.settlements[0].text,row().text);
    assert.equal(value.capabilities.paymentLedger,false);assert.equal(value.capabilities.documentIssuance,false);
  }
});

test('multiple periods require explicit choice; labels and UUIDs select only the requested owned row',async()=>{
  const data=records([row(1,'115學年第1學期','Statement one'),row(2,'115學年第2學期','Statement two')]);
  const ambiguous=decode(await read(data));assert.equal(ambiguous.selection.requiresClarification,true);assert.equal(ambiguous.selection.choices.length,2);
  assert.deepEqual(ambiguous.records.settlements,[]);assert.equal(ambiguous.readState,'ok');assert.equal(ambiguous.complete,true);
  for(const question of ['Show my tuition settlement for115學年第2學期.',`Show my tuition settlement for ${id(2)}.`]){
    const value=decode(await read(data,question));assert.deepEqual(value.records.settlements.map((item:any)=>item.text),['Statement two']);
    assert.equal(value.counts.available,2);assert.equal(value.counts.matching,1);assert.equal(value.selection.requiresClarification,false);
  }
  const explicitAll=decode(await read(data,'Show all my saved tuition statements.'));assert.equal(explicitAll.records.settlements.length,2);
});

test('longer exact period labels outrank embedded shorter labels and duplicate labels are ambiguous',async()=>{
  const data=records([row(1,'Fall Session','FIRST'),row(2,'Fall Session Extended','SECOND')]);
  assert.deepEqual(decode(await read(data,'Show my tuition settlement for Fall Session Extended.')).records.settlements.map((item:any)=>item.text),['SECOND']);
  const duplicates=records([row(1,'Same label','One'),row(2,'Same label','Two')]);
  const result=decode(await read(duplicates,'Show my tuition settlement for Same label.'));
  assert.equal(result.selection.scope,'ambiguous_period_label');assert.equal(result.selection.requiresClarification,true);assert.equal(result.selection.choices.length,2);assert.deepEqual(result.records.settlements,[]);
  const precise=decode(await read(duplicates,`Show my tuition statement for ${id(2)}.`));assert.equal(precise.records.settlements[0].text,'Two');
  const summer=await read(records([row(1,'Summer2026','Period statement')]),'Show my tuition statement for Summer2026.');
  assert.equal(summer.evidence.url,path);assert.equal(decode(summer).records.settlements[0].text,'Period statement');
});

test('unresolved chronology or unknown period cannot silently select a different single record',async()=>{
  for(const question of ['Show my current tuition statement.','Show my latest tuition settlement.','Show my tuition statement for2025.',
    'Show all my 2025 tuition statements.','Show my tuition statement for "Unknown period".','查詢我的本學期學費結算']){
    const value=decode(await read(records(),question));assert.equal(value.selection.requiresClarification,true,question);assert.equal(value.selection.scope,'unresolved_period');assert.deepEqual(value.records.settlements,[]);
  }
  const absent=decode(await read(records(),`Show my tuition settlement for ${id(99)}.`));
  assert.equal(absent.readState,'empty');assert.equal(absent.counts.available,1);assert.equal(absent.counts.matching,0);assert.equal(absent.complete,true);
});

test('period listing omits statement bodies and reports exact listed-row coverage',async()=>{
  const result=await read(records([row(1,'First saved period','PRIVATE BODY ONE'),row(2,'Second saved period','PRIVATE BODY TWO')]),'Which tuition settlement periods are available?');
  const value=decode(result);assert.equal(value.selection.periodsOnly,true);assert.equal(value.records.periods.length,2);assert.deepEqual(value.records.settlements,[]);
  assert.equal(value.counts.included,2);assert.doesNotMatch(JSON.stringify(result),/PRIVATE BODY/);
});

test('48-1 and48-3 never claim verified files while48-2 explicitly remains unavailable, without loading settlements',async()=>{
  for(const [question,route,reason] of [['Print my summer tuition receipt.','/school-affairs/services/48-1','verified_file_unavailable'],
    ['Show my evening tuition statement.','/school-affairs/services/48-3','verified_file_unavailable'],
    ['Show my extended-study fees.','/school-affairs/services/48-2','extended_records_unavailable']]){
    let calls=0;const result=await readTuitionEvidence(account,{question,route:path},{load:async()=>{calls++;return records();}});
    assert.equal(calls,0);assert.equal(result.evidence.url,route);assert.equal(result.readState,'unavailable');assert.equal(result.reason,reason);
    const value=decode(result);assert.equal(value.capabilities.documentIssuance,false);assert.equal(value.capabilities.summerVerifiedFile,false);assert.equal(value.capabilities.eveningVerifiedFile,false);
    assert.equal(value.selection.scope,'capability_only');assert.deepEqual(value.records.settlements,[]);
  }
});

test('explicit combined tuition questions read settlement once and retain each requested service limitation',async()=>{
  let calls=0;const question='Show my tuition settlement and evening tuition statement availability.';
  const result=await readTuitionEvidence(account,{question},{load:async()=>{calls++;return records();}}),value=decode(result);
  assert.equal(calls,1);assert.equal(result.readState,'ok');assert.equal(result.reason,null);assert.equal(value.selection.requiresClarification,false);
  assert.deepEqual(value.selection.requestedViews,['settlement','evening']);assert.equal(value.records.settlements[0].text,row().text);
  assert.deepEqual(value.serviceAvailability,[{view:'settlement',url:path,capability:'literal_settlement_records'},
    {view:'evening',url:'/school-affairs/services/48-3',capability:'verified_file_unavailable'}]);
  assert.deepEqual(result.evidence.urls,[path,'/school-affairs/services/48-3']);assert.equal(value.coverageScope,'selected_settlement_records_and_periods_only');
  assert.deepEqual(value.counts,{available:1,matching:1,included:1,omitted:0});assert.equal(value.complete,true);
  const unavailable=await readTuitionEvidence(account,{question},{load:async()=>{throw new Error('PRIVATE FAILURE');}}),failed=decode(unavailable);
  assert.equal(unavailable.readState,'unavailable');assert.equal(unavailable.reason,'read_failed');assert.equal(failed.complete,false);
  assert.deepEqual(failed.serviceAvailability,value.serviceAvailability);assert.deepEqual(failed.records.settlements,[]);
  assert.match(failed.rules,/failed settlement reads remain unknown/);assert.doesNotMatch(JSON.stringify(unavailable),/PRIVATE FAILURE/);
  const concise=decode(await read(records(),'Show my settlement and evening statement availability.'));
  assert.deepEqual(concise.selection.requestedViews,['settlement','evening']);assert.equal(concise.records.settlements[0].text,row().text);
});

test('multiple explicit document-service requests need no unnecessary choice or unrelated record read',async()=>{
  let calls=0;const result=await readTuitionEvidence(account,{question:'Show my summer tuition receipt and my evening tuition statement and extended-study fees.'},{load:async()=>{calls++;return records();}});
  const value=decode(result);assert.equal(calls,0);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'capabilities_unavailable');
  assert.equal(value.selection.requiresClarification,false);assert.deepEqual(value.selection.requestedViews,['summer','evening','extended']);
  assert.deepEqual(value.serviceAvailability.map((item:any)=>item.capability),['verified_file_unavailable','verified_file_unavailable','extended_records_unavailable']);
  assert.deepEqual(result.evidence.urls,['/school-affairs/services/48-1','/school-affairs/services/48-3','/school-affairs/services/48-2']);
});

test('unrelated route query strings do not act as selected UI periods or authorize another record',async()=>{
  const result=decode(await read(records([row(),row(2,'Other period')]),'What does this say?',path+'?periodId='+id(2)));
  assert.equal(result.selection.requiresClarification,true);assert.deepEqual(result.records.settlements,[]);
});

test('foreign owners, inherited ownership, duplicate IDs and period lineage mismatches reject the complete read',async()=>{
  const cases:any[]=[records([{...row(),userId:foreign}]),records([row(),row()]),records(),records(),records(),records()];
  cases[2].periods[0].userId=foreign;cases[3].settlements[0].periodId=id(99);cases[4].periods[0].label='Different';cases[5].periods=[];
  const inherited:any=records();inherited.settlements[0]=Object.assign(Object.create({userId:owner}),row());delete inherited.settlements[0].userId;cases.push(inherited);
  for(const value of cases){const result=await read(value);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_records');assert.deepEqual(decode(result).records.settlements,[]);}
});

test('unknown metadata, documents and malformed literal fields never enter assistant evidence',async()=>{
  const malformed:any[]=[];
  for(const patch of [{sourceMode:'official'},{version:0},{text:undefined},{text:3},{text:'x'.repeat(4001)},{text:'\u0000'},{text:'\ud800'},
    {periodLabel:' '},{rowOrder:-1},{createdAt:'0000-01-01T00:00:00Z'},{updatedAt:'2026-02-29T00:00:00Z'},{updatedAt:'2026-11-13T00:00:00+16:00'},
    {storagePath:'DO_NOT_EXPOSE'}])malformed.push(records([{...row(),...patch}] as any));
  malformed.push({...records(),documentMetadata:[{noteText:'DO_NOT_EXPOSE'}]});malformed.push({...records(),documents:[{url:'DO_NOT_EXPOSE'}]});
  for(const value of malformed){const result=await read(value);assert.equal(result.reason,'invalid_records');assert.doesNotMatch(JSON.stringify(result),/DO_NOT_EXPOSE/);}
});

test('read failures and permission errors remain unavailable rather than empty',async()=>{
  for(const [error,reason] of [[new Error('PRIVATE ERROR'),'read_failed'],[{status:401},'unauthorized'],[{status:403},'forbidden'],[{status:409},'record_changed']] as const){
    const result=await readTuitionEvidence(account,{question:'Show my tuition statement.'},{load:async()=>{throw error;}});
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,reason);assert.equal(decode(result).complete,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE ERROR/);
  }
  const empty=await read(records([]));assert.equal(empty.readState,'empty');assert.equal(decode(empty).complete,true);assert.equal(empty.reason,null);
});

test('invalid account, unrelated context and expired deadlines never call the loader',async()=>{
  let calls=0;const dependencies={load:async()=>{calls++;return records();}};
  for(const invalid of [{...account,user:{id:foreign+'x'}},{...account,url:'https://wrong.supabase.co'},{...account,token:''},{...account,key:''}])
    assert.equal((await readTuitionEvidence(invalid,{question:'Show my tuition statement.'},dependencies)).reason,'unauthorized');
  assert.equal((await readTuitionEvidence(account,{question:'Show my grades.',route:path},dependencies)).reason,'unrelated_question');
  for(const deadline of [NaN,Infinity])assert.equal((await readTuitionEvidence(account,{question:'Show my tuition statement.',deadline},dependencies)).reason,'invalid_deadline');
  assert.equal((await readTuitionEvidence(account,{question:'Show my tuition statement.',deadline:Date.now()-1},dependencies)).reason,'deadline_exceeded');
  assert.equal((await readTuitionEvidence({...account,requestDeadline:Date.now()-1},{question:'Show my tuition statement.'},dependencies)).reason,'deadline_exceeded');
  assert.equal(calls,0);
});

test('the reader enforces both caller and helper deadlines even for an injected hung loader',async()=>{
  const accountDeadline=Date.now()+1500;
  await readTuitionEvidence({...account,requestDeadline:accountDeadline},{question:'Show my tuition statement.',deadline:Date.now()+60000},{load:async selected=>{
    assert.equal(selected.requestDeadline,accountDeadline);return records();
  }});
  const before=Date.now();const result=await readTuitionEvidence(account,{question:'Show my tuition statement.',deadline:before+15},{load:async()=>new Promise(()=>{})});
  assert.equal(result.reason,'deadline_exceeded');assert.ok(Date.now()-before<1000);
});

test('16KB full-envelope budget retains whole Unicode statements and explicit omitted counts',async()=>{
  const data=records(Array.from({length:40},(_,index)=>row(index+1,'Period '+(index+1),'課'.repeat(2000)+String(index))));
  const result=await read(data,'Show all my saved tuition statements.'),value=decode(result);
  assert.equal(result.readState,'ok');assert.equal(value.complete,false);assert.equal(value.excerpted,true);
  assert.equal(value.counts.available,40);assert.equal(value.counts.matching,40);assert.ok(value.counts.included>0&&value.counts.included<40);
  assert.equal(value.counts.omitted,40-value.counts.included);assert.equal(value.records.periods.length,value.counts.included);
  for(const included of value.records.settlements)assert.equal(included.text,data.settlements.find(item=>item.id===included.id)!.text);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=tuitionEvidenceMaxBytes);
  const tooLarge=decode(await read(records([row(1,'Emoji period','🙂'.repeat(4000))])));
  assert.equal(tooLarge.counts.matching,1);assert.equal(tooLarge.counts.included,0);assert.equal(tooLarge.counts.omitted,1);assert.equal(tooLarge.complete,false);assert.equal(tooLarge.excerpted,true);
});

test('large ambiguity lists are bounded with choice omissions, never represented as complete',async()=>{
  const result=await read(records(Array.from({length:200},(_,index)=>row(index+1,'期'.repeat(150)+String(index)))));
  const value=decode(result);assert.equal(value.selection.requiresClarification,true);assert.equal(value.selection.choiceCounts.available,200);
  assert.ok(value.selection.choiceCounts.included<200);assert.equal(value.selection.choiceCounts.omitted,200-value.selection.choiceCounts.included);
  assert.equal(value.complete,false);assert.equal(value.excerpted,true);assert.ok(Buffer.byteLength(JSON.stringify(result))<=tuitionEvidenceMaxBytes);
});

test('the actual personal loader uses only an own-filtered GET, never an administrator RPC or storage',async()=>{
  const original=globalThis.fetch,calls:string[]=[];
  globalThis.fetch=(async(input,init)=>{
    const url=new URL(String(input));calls.push(url.pathname);assert.equal(url.origin,account.url);
    assert.equal(url.pathname,'/rest/v1/affairs_tuition_settlements');assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+account.token);
    return new Response(JSON.stringify([{id:id(),user_id:owner,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp,deleted_at:null,
      period_label:'Readback period',statement_text:'Saved literal statement',row_order:1}]),{status:200,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  try{
    const result=await readTuitionEvidence(account,{question:'Show my tuition statement.',route:path});assert.equal(result.readState,'ok');
    assert.equal(decode(result).records.settlements[0].text,'Saved literal statement');assert.deepEqual(calls,['/rest/v1/affairs_tuition_settlements']);
  }finally{globalThis.fetch=original;}
});
