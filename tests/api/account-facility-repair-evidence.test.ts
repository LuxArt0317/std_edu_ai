import test from 'node:test';
import assert from 'node:assert/strict';
import {readFacilityRepairEvidence,unavailableFacilityRepairEvidence,facilityRepairEvidenceMaxBytes,isFacilityRepairEvidenceQuestion,isForeignFacilityRepairQuestion} from '../../server/accountFacilityRepairEvidence.js';
import {selectFacilityRepairEvidence} from '../../server/facilityRepairEvidenceIntent.js';

const owner='20000000-0000-4000-8000-000000000001',foreign='20000000-0000-4000-8000-000000000002';
const report='30000000-0000-4000-8000-000000000001',otherReport='30000000-0000-4000-8000-000000000002';
const stamp='2026-11-14T02:00:00Z',history='/school-affairs/services/45-1/history',path=history+'/'+report;
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC-KEY',token:'SYNTHETIC-TOKEN',user:{id:owner}};
const row=()=>({id:report,user_id:owner,building:'QA Hall',location:'QA Desk',item:'QA Light',status:'resolved',version:3,created_at:stamp,updated_at:stamp});
const detail=()=>({...row(),description:'Original complaint only',area_code:'AR0001',equipment_code:'RI0001',contact_phone:'PRIVATE PHONE',room:'QA101',floor_label:'1樓',bed:'',location_remark:'',other_item:''});
const events=()=>[{version:1,status:'submitted',note:'',occurred_at:stamp},{version:2,status:'in_progress',note:'Older handling note',occurred_at:stamp},
  {version:3,status:'resolved',note:'Latest handling note',occurred_at:stamp}];
const full=()=>({userId:owner,detail:detail(),events:events()});
const list=(rows=[row()],total=rows.length,page=0)=>({userId:owner,rows,total,page,pageSize:25});
const decode=(result:Awaited<ReturnType<typeof readFacilityRepairEvidence>>)=>JSON.parse(result.evidence.content);
const read=(source:unknown,question='Show my facility repair status and latest technician note.',route=path)=>
  readFacilityRepairEvidence(account,{question,route},{read:async()=>source});

test('explicit repair parts survive mixed queries while unrelated, foreign, negated and network intent do not',()=>{
  for(const question of ['What is the status of my facility repair reports? Also show my next scheduled class.',
    'When is my next class, and what is the status of my facility repair reports?','我的報修進度和下一堂課在哪裡？','Show my saved maintenance requests.',
    'Cancel my repair and remind me what time my class is.','Show my repairs.','Show our repair status.'])
    assert.equal(isFacilityRepairEvidenceQuestion(question),true,question);
  for(const question of ['Where do I file a facility repair report?','What is my next class?','Show another student repair report.',
    'Do not show my facility repair reports. Show my classes.','Show my dorm WiFi facility repair status.','Show the facility repair reports of my mother.',
    'Show my roommate’s facility repair status.','What are my repair skills?','Show my repair shop.', 'Please repair my code.',
    'Do not show my repairs.','不要顯示我的報修紀錄。','Show Alice’s saved facility repair records.','What is Alice’s facility repair status?'])
    assert.equal(isFacilityRepairEvidenceQuestion(question,path),false,question);
  assert.equal(isForeignFacilityRepairQuestion('Show another student repair report.'),true);
  assert.equal(isFacilityRepairEvidenceQuestion('What is its status?','/',[{role:'user',content:'Show my repair report '+report}]),true);
  assert.equal(isFacilityRepairEvidenceQuestion('What is its status?','/',[{role:'assistant',content:'Show my repair report '+report}]),false);
  assert.equal(isFacilityRepairEvidenceQuestion('What is its status?','/',[{role:'user',content:'Show my repair reports.'},{role:'user',content:'Show my grades.'}]),false);
  for(const question of ['What are my repair skills?','Show my repair shop.','Please repair my code.'])
    assert.equal(isFacilityRepairEvidenceQuestion(question),false,question);
  for(const question of ['What is my repair’s status?','Show my facility repair note containing “Alice’s facility repair report”.',
    'Show my saved facility repair records for me.','Show my saved facility repair reported by me.',
    'Show my facility repair note containing “repair reported by Alice”.','Show my repair reports for lab equipment.',
    '請顯示我的報修進度。']){
    assert.equal(isForeignFacilityRepairQuestion(question),false,question);assert.equal(isFacilityRepairEvidenceQuestion(question),true,question);
  }
});

test('named foreign ownership fails before a native read, including a separate public question',async()=>{
  for(const question of ['Show Alice’s saved facility repair records.','What is Alice’s facility repair status?',
    'Show the saved facility repair records for Alice.','What is the status of the facility repair reported by Alice?',
    'What is the facility repair status for Alice?','Show facility repair notes for Bob.','Show the status of the repair for Alice.','Show the status of my repair for Alice.',
    '請顯示王小明的報修進度。',
    'Show Alice’s facility repair status and where can I find the campus Wi-Fi instructions?']){
    assert.equal(isForeignFacilityRepairQuestion(question),true,question);
    let reads=0;const result=await readFacilityRepairEvidence(account,{question,route:path},{read:async()=>{reads++;return full();}});
    assert.equal(reads,0);assert.equal(result.readState,'unavailable');
  }
  let reads=0;
  const unclear=await readFacilityRepairEvidence(account,{question:'Show the saved facility repair records for alice.',route:path},
    {read:async()=>{reads++;return full();}});
  assert.equal(reads,0);assert.equal(unclear.reason,'ambiguous_selection');
});

test('repair field requests are clause-local and do not borrow assignment notes or class location',()=>{
  for(const question of ['Show my repair report status and my assignment notes.','Show my repair report status and where is my next class?',
    '我的報修進度和作業留言','Show my repair report status but do not show its notes.','Show my repair report status, not notes.',
    'Show my facility repair status, not my repair notes.']){
    const selection=selectFacilityRepairEvidence(question);assert.ok(selection,question);assert.equal(selection.latestNoteRequested,false,question);assert.equal(selection.fields.location,false,question);
  }
  assert.equal(selectFacilityRepairEvidence('Show my repair report status and its latest note.')?.latestNoteRequested,true);
  assert.equal(selectFacilityRepairEvidence('我的報修進度和處理備註')?.latestNoteRequested,true);
  assert.equal(selectFacilityRepairEvidence('Who is the technician for my repair report?')?.latestNoteRequested,false);
});

test('routes and references are exact; explicit report ID overrides incidental route and ambiguous IDs never read',async()=>{
  const explicit=selectFacilityRepairEvidence('Show my repair report '+otherReport+' status.',path);assert.equal(explicit?.id,otherReport);assert.equal(explicit?.idSource,'question');
  const selection=selectFacilityRepairEvidence('Show my facility repair history.',history+'?page=2&status=in_progress');assert.equal(selection?.page,2);assert.equal(selection?.status,'in_progress');
  assert.equal(selectFacilityRepairEvidence('Show all my facility repair reports.',history+'?page=2&status=in_progress')?.status,'');
  for(const route of ['https://evil.invalid'+path,path+'?owner='+foreign,path+'?page=0',history+'?page=0&page=1',history+'?status=approved',
    history+'/bad-reference',history+'/../history',history+'/%2e%2e/history',history+'\\'+report,path+'#fragment'])
    assert.equal(selectFacilityRepairEvidence('Show my facility repair status.',route),null,route);
  let calls=0;
  for(const question of ['Show my repair report 30000000 status.','What is the status of my repair #1234?',
    'What is the status of my repair ticket ID ABC?','我的報修編號 ABC 狀態','Show all my repair reports including repair report '+report,
    'Show my repair report '+report+' and repair report '+otherReport+' notes.']){
    const result=await readFacilityRepairEvidence(account,{question},{read:async()=>{calls++;return full();}});assert.equal(result.reason,'ambiguous_selection',question);
  }
  assert.equal(calls,0);
  const queries:Record<string,string>[]=[];
  const all=await readFacilityRepairEvidence(account,{question:'Show all my repair requests.',route:path},{read:async(_,query)=>{queries.push({...query});return list();}});
  assert.equal(all.readState,'ok');assert.equal(decode(all).selection.scope,'owned_page');assert.equal(decode(all).selection.id,null);
  assert.deepEqual(queries,[{scope:'facility-repairs',view:'mine',page:'0',status:''}]);
});

test('latest saved review-status note preserves exact status but never invents technician role or exposes unrelated personal text',async()=>{
  const source=full(),before=structuredClone(source),result=await read(source),value=decode(result);
  assert.equal(result.readState,'ok');assert.equal(result.evidence.id,'account:facilityRepairs');assert.equal(result.evidence.provenance,'saved_local');
  assert.equal(result.evidence.url,path);assert.deepEqual(result.evidence.urls,[path]);assert.equal(value.records[0].status,'resolved');
  assert.deepEqual(value.latestHandlingNote,{state:'recorded',event:{version:3,status:'resolved',text:'Latest handling note',occurredAt:stamp,basis:'saved_review_status'},authorRole:null});
  assert.equal(value.provenance.eventAuthorRoleAvailable,false);assert.equal(value.provenance.officialUniversityData,false);assert.equal(value.capabilities.write,false);
  assert.equal(value.eventCoverage.completeHistory,true);assert.match(value.rules,/not proof that a technician wrote it/);
  for(const secret of [owner,foreign,'SYNTHETIC-','PRIVATE PHONE','Original complaint only','Older handling note','QA Desk'])assert.ok(!JSON.stringify(result).includes(secret),secret);
  assert.deepEqual(source,before);
});

test('newest blank note is preserved rather than substituted; successful no-review differs from unknown event history',async()=>{
  const blank=full();blank.events[2].note='';const value=decode(await read(blank));assert.equal(value.latestHandlingNote.state,'recorded');assert.equal(value.latestHandlingNote.event.text,'');
  const initial={userId:owner,detail:{...detail(),status:'submitted',version:1},events:[events()[0]]};
  assert.equal(decode(await read(initial)).latestHandlingNote.state,'not_recorded');
  for(const source of [{...full(),events:[]},{...full(),events:events().slice(0,2)},{...full(),events:[events()[0],events()[2]]}]){
    const result=await read(source);assert.equal(result.readState,'partial');assert.equal(result.reason,'incomplete_event_history');assert.equal(decode(result).latestHandlingNote.event,null);
  }
  const tail={...full(),detail:{...detail(),version:103},events:[{...events()[1],version:102},{...events()[2],version:103}]};
  const result=await read(tail);assert.equal(result.readState,'ok');assert.equal(decode(result).eventCoverage.completeHistory,false);assert.equal(decode(result).latestHandlingNote.event.version,103);
  const all=await read(full(),'Show all notes from my facility repair history.');assert.equal(all.readState,'partial');assert.equal(all.reason,'full_note_history_unavailable');
});

test('impossible review transitions, author fields, wrong owner and malformed detail fail closed',async()=>{
  const bad:unknown[]=[{...full(),userId:foreign},{...full(),detail:{...detail(),user_id:foreign}},{...full(),detail:{...detail(),id:otherReport}},
    {...full(),detail:{...detail(),unexpected:'private'}},{...full(),events:[events()[0],{...events()[1],status:'resolved'},events()[2]]},
    {...full(),events:[{...events()[0],note:'not a handling note'},...events().slice(1)]},
    {...full(),events:[events()[0],{...events()[1],actor:foreign},events()[2]]},{...full(),events:events().reverse()},
    {...full(),events:[events()[0],events()[1],events()[1],events()[2]]},{...full(),events:[{...events()[0],status:'resolved'},...events().slice(1)]},
    {...full(),events:[events()[0],{...events()[1],occurred_at:'2026-02-30T01:00:00Z'},events()[2]]},
    {...full(),detail:{...detail(),created_at:'2026-11-14T02:00:00+19:00'}},{...full(),detail:{...detail(),description:'\ud800'}}];
  let coercions=0,getters=0;bad.push({...full(),detail:{...detail(),id:{toString(){coercions++;return report;}}}});
  const accessor={...detail()};Object.defineProperty(accessor,'contact_phone',{enumerable:true,get(){getters++;return 'secret';}});bad.push({...full(),detail:accessor});
  for(const source of bad){const result=await read(source);assert.equal(result.reason,'invalid_records');assert.equal(decode(result).recordPresent,null);assert.deepEqual(decode(result).records,[]);}
  assert.equal(coercions,0);assert.equal(getters,0);
});

test('status-only projects no note or contact; requested description/location are separate fields',async()=>{
  const statusOnly=decode(await read(full(),'Show my facility repair status.'));assert.equal(statusOnly.latestHandlingNote.state,'not_requested');assert.equal(statusOnly.eventCoverage,null);
  for(const text of ['Latest handling note','Original complaint only','PRIVATE PHONE','QA Desk'])assert.ok(!JSON.stringify(statusOnly).includes(text));
  const requested=decode(await read(full(),'Show my facility repair description, location and equipment.'));
  assert.equal(requested.records[0].description,'Original complaint only');assert.equal(requested.records[0].location,'QA Desk');assert.equal(requested.records[0].item,'QA Light');
  assert.equal(requested.latestHandlingNote.state,'not_requested');assert.ok(!JSON.stringify(requested).includes('PRIVATE PHONE'));
});

test('unselected single matching record uses one own detail; multiple reports require a choice instead of another report note',async()=>{
  for(const question of ['Show my facility repair latest note.','Show my facility repair description.']){
    const calls:Record<string,string>[]=[];const result=await readFacilityRepairEvidence(account,{question},{read:async(_,query)=>{calls.push({...query});return query.id?full():list();}});
    assert.equal(calls.length,2);assert.deepEqual(calls[0],{scope:'facility-repairs',view:'mine',page:'0',status:''});assert.equal(calls[1].id,report);
    assert.equal(result.readState,'ok');assert.equal(decode(result).selection.idSource,'only_matching_report');assert.equal(result.evidence.url,path);
    let multiCalls=0;const choices=await readFacilityRepairEvidence(account,{question},{read:async()=>{multiCalls++;return list([{...row(),id:otherReport},row()]);}});
    assert.equal(multiCalls,1);assert.equal(choices.reason,'selection_required');assert.equal(decode(choices).requiresClarification,true);assert.equal(decode(choices).records.length,2);
    assert.ok(!JSON.stringify(choices).includes('Latest handling note'));
  }
});

test('successful zero, missing exact report and unavailable reads remain distinct and redact failure strings',async()=>{
  const zero=await read(list([]),'Show my facility repair latest note.','/');assert.equal(zero.readState,'empty');assert.equal(decode(zero).recordPresent,false);
  assert.equal(decode(zero).latestHandlingNote.state,'no_saved_report');assert.deepEqual(decode(zero).counts,{available:0,returned:0,included:0,omitted:0});
  for(const [error,reason] of [[{status:401},'unauthorized'],[{status:403},'forbidden'],[{status:404},'record_not_found'],[new Error('PRIVATE RESPONSE'),'read_failed']] as const){
    const result=await readFacilityRepairEvidence(account,{question:'Show my facility repair latest note.',route:path},{read:async()=>{throw error;}});
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,reason);assert.equal(decode(result).recordPresent,null);assert.equal(decode(result).counts.available,null);
    assert.equal(result.evidence.url,path);assert.ok(!JSON.stringify(result).includes('PRIVATE RESPONSE'));
  }
  assert.equal(unavailableFacilityRepairEvidence('PRIVATE RAW ERROR').reason,'read_unavailable');
});

test('whole records and selected-only links respect the full UTF8 envelope cap, pagination and omitted counts',async()=>{
  const rows=Array.from({length:25},(_,index)=>({...row(),id:'30000000-0000-4000-8000-'+String(99-index).padStart(12,'0'),building:'課'.repeat(100),location:'課'.repeat(120),item:'課'.repeat(100)}));
  const result=await read(list(rows,50),'Show all my facility repair reports with location and equipment.','/'),value=decode(result);
  assert.equal(result.readState,'partial');assert.equal(value.counts.available,50);assert.equal(value.counts.returned,25);assert.ok(value.records.length>0&&value.records.length<25);
  assert.equal(value.counts.omitted,50-value.records.length);assert.equal(value.excerpted,true);assert.equal(value.complete,false);
  assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=facilityRepairEvidenceMaxBytes);
  assert.deepEqual(result.evidence.urls,[history,...value.records.map((entry:{url:string})=>entry.url)]);
  for(const record of value.records){assert.equal(record.building,'課'.repeat(100));assert.equal(record.location,'課'.repeat(120));assert.equal(record.item,'課'.repeat(100));}
  const page=await read(list([row()],26,1),'Show my facility repair status.',history+'?page=1');assert.equal(page.readState,'partial');assert.equal(decode(page).counts.omitted,25);
});

test('malformed list totals, duplicate rows, ordering, status mismatch and unknown fields do not become a partial success',async()=>{
  const cases=[list([row()],2),list([row(),row()]),list([row(),{...row(),id:otherReport}]),{...list(),userId:foreign},
    list([{...row(),user_id:foreign}]),list([{...row(),status:'approved'}]),list([{...row(),version:0}]),{...list(),rows:[{...row(),contact_phone:'private'}]},
    {...list(),pageSize:100},{...list(),total:-1}];
  for(const source of cases){const result=await read(source,'Show my facility repair status.','/');assert.equal(result.reason,'invalid_records');assert.equal(decode(result).recordPresent,null);}
  assert.equal((await read(list(),'Show my facility repair status.',history+'?status=in_progress')).reason,'invalid_records');
});

test('caller credentials, owner, query and selected response are immutable across both asynchronous reads',async()=>{
  const mutable={...account,user:{id:owner}},options={question:'Show my facility repair latest note.',route:'/',deadline:Date.now()+2000};
  const captured:unknown[]=[],queries:unknown[]=[];let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const pending=readFacilityRepairEvidence(mutable,options,{read:async(caller,query)=>{
    captured.push(structuredClone(caller));queries.push({...query});assert.ok(Object.isFrozen(caller)&&Object.isFrozen(caller.user)&&Object.isFrozen(query));
    if(!query.id){await gate;return list();}return full();
  }});
  mutable.user.id=foreign;mutable.url='https://evil.invalid';mutable.key='CHANGED';mutable.token='CHANGED';options.question='Show my other repair report.';options.route=history+'/'+otherReport;
  release();const result=await pending;assert.equal(result.readState,'ok');assert.equal(captured.length,2);
  for(const caller of captured)assert.deepEqual(caller,{...account,user:{id:owner},requestDeadline:options.deadline});
  assert.deepEqual(queries,[{scope:'facility-repairs',view:'mine',page:'0',status:''},{scope:'facility-repairs',view:'mine',id:report}]);
});

test('invalid accounts, injected options and deadlines fail before any transport or coercion',async()=>{
  let calls=0,coercions=0;const dependencies={read:async()=>{calls++;return full();}},question='Show my facility repair status.';
  const bad=[{...account,user:{id:'invalid'}},{...account,url:'https://other.supabase.co'},{...account,token:''},{...account,key:''},
    {...account,user:{id:{toString(){coercions++;return owner;}}}}];
  for(const source of bad)assert.equal((await readFacilityRepairEvidence(source as typeof account,{question},dependencies)).reason,'unauthorized');
  for(const deadline of [NaN,Infinity])assert.equal((await readFacilityRepairEvidence(account,{question,deadline},dependencies)).reason,'invalid_deadline');
  assert.equal((await readFacilityRepairEvidence(account,{question,deadline:Date.now()-1},dependencies)).reason,'deadline_exceeded');
  assert.equal((await readFacilityRepairEvidence(account,{question,userId:foreign} as {question:string},dependencies)).reason,'invalid_context');
  assert.equal((await readFacilityRepairEvidence(account,{question:'Show another student repair report.'},dependencies)).reason,'forbidden');
  const accessor={...account};Object.defineProperty(accessor,'token',{get(){throw new Error('DO NOT INVOKE');}});
  assert.equal((await readFacilityRepairEvidence(accessor,{question},dependencies)).reason,'unauthorized');assert.equal(calls,0);assert.equal(coercions,0);
});

test('shared finite deadline bounds a hung read and prohibits second read after the remaining budget expires',async()=>{
  const question='Show my facility repair latest note.';let calls=0;
  const started=Date.now(),result=await readFacilityRepairEvidence(account,{question,deadline:started+50},{read:async()=>{calls++;return new Promise(()=>{});}});
  assert.equal(result.reason,'deadline_exceeded');assert.equal(calls,1);assert.ok(Date.now()-started<1500);
  const callerDeadline=Date.now()+2000;await readFacilityRepairEvidence({...account,requestDeadline:callerDeadline},{question,route:path,deadline:Date.now()+60000},
    {read:async captured=>{assert.equal(captured.requestDeadline,callerDeadline);return full();}});
  await readFacilityRepairEvidence(account,{question,route:path,deadline:Date.now()+60000},{read:async captured=>{assert.ok(captured.requestDeadline!<=Date.now()+8000);return full();}});
});

test('default native transport uses only exact project caller RPC with management false, never an answer shortcut or write',async()=>{
  const original=globalThis.fetch;const calls:unknown[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.origin,account.url);assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_facility_repairs');
    assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);assert.ok(init?.signal);
    const query=JSON.parse(String(init?.body));calls.push(query);assert.equal(query.p_manage,false);
    return new Response(JSON.stringify(query.p_id?full():list()),{status:200,headers:{'content-type':'application/json'}});
  };
  try{const result=await readFacilityRepairEvidence(account,{question:'Show my facility repair latest note.'});assert.equal(result.readState,'ok');
    assert.deepEqual(calls,[{p_manage:false,p_id:null,p_page:0,p_status:''},{p_manage:false,p_id:report,p_page:0,p_status:''}]);}
  finally{globalThis.fetch=original;}
});
