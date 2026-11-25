import assert from 'node:assert/strict';
import test from 'node:test';
import {readInternshipEvidence,internshipEvidenceMaxBytes} from '../../server/accountInternshipEvidence.js';
import {formatInternshipEvidence,parseInternshipEvidence} from '../../server/internshipEvidenceContract.js';
import {internshipLookupContext} from '../../server/internshipEvidenceIntent.js';
import {buildInternshipNativeCases,internshipNativeFixtureForCase,internshipNativeManifest} from './internship-native-cases.mjs';

const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_USER_TOKEN',
  user:{id:internshipNativeManifest.owners.A}};
const contract='/school-affairs/services/internship/contract';
const ordinary={question:'Show my saved internship contract records.',route:contract};
const columns={title:'title',status:'status',startsOn:'starts_on',endsOn:'ends_on',notes:'notes'};
const markers={title:'QA Harbor Analytics',id:'53010000-0000-4000-8000-000000000011'};
const callsFor=mock=>{
  const calls=[];
  return {calls,fetchImpl:async(url,init)=>{calls.push({url,init});return mock(url,init);}};
};
function response(rows,total=rows.length,status=total>rows.length?206:200){
  return new Response(JSON.stringify(rows),{status,headers:{'content-range':(rows.length?'0-'+(rows.length-1):'*')+'/'+total}});
}
const baseRow=(extra={})=>({id:markers.id,user_id:account.user.id,service_key:'internship',record_type:'contract',title:markers.title,status:'draft',...extra});
const read=(options,mock,verified=account)=>readInternshipEvidence(verified,options,{fetchImpl:mock});
function checked(result){
  const payload=parseInternshipEvidence(result);
  assert.ok(payload);
  return payload;
}
function wireFields(request){
  const own=['id','user_id','service_key','record_type',...request.fields.filter(field=>field!=='reviewStatus').map(field=>columns[field])];
  return request.fields.includes('reviewStatus')?[...own,'review_request_id',
    'site_review:affairs_service_requests!affairs_service_records_review_request_id_fkey(id,user_id,status)']:own;
}

test('actual reader and selector agree with the independent offline question bank',async t=>{
  for(const row of buildInternshipNativeCases())await t.test(row.id,async()=>{
    const {sourceRead,requests,rows}=internshipNativeFixtureForCase(row);
    const {denial,companion}=row.observationExpectation;
    const options={question:row.question,route:row.route,history:row.history};
    if(row.auth!=='anonymous'){
      const plan=internshipLookupContext(row.question,row.route,row.history);
      assert.equal(plan.reason,denial);
      assert.equal(plan.companion,companion);
      assert.equal(plan.selection?.view,sourceRead?.view);
      assert.deepEqual(plan.selection?.fields,sourceRead?.fields);
      if(companion)assert.doesNotMatch(plan.otherQuestion,/show my saved internship|which internship companies/iu);
    }
    const wire=callsFor((url,init)=>{
      assert.ok(sourceRead);
      assert.equal(url.origin,account.url);
      assert.equal(url.pathname,'/rest/v1/affairs_service_records');
      assert.deepEqual(Object.fromEntries(url.searchParams),{select:wireFields(sourceRead).join(','),service_key:'eq.internship',
        record_type:'eq.'+sourceRead.recordType,user_id:'eq.'+account.user.id,order:'id.asc',limit:'25'});
      assert.equal(init.method,'GET');
      assert.equal(init.redirect,'error');
      assert.equal(init.headers.Authorization,'Bearer '+account.token);
      assert.equal(init.headers.Prefer,'count=exact');
      assert.equal(init.body,undefined);
      if(sourceRead.state==='unavailable')return new Response('test provider outage',{status:503});
      const owned=rows.filter(value=>value.user_id===account.user.id&&value.service_key===sourceRead.serviceKey&&value.record_type===sourceRead.recordType);
      return response(owned.map(value=>Object.fromEntries(wireFields(sourceRead).map(field=>{
        if(field.startsWith('site_review:'))return ['site_review',requests.find(request=>request.id===value.review_request_id)??null];
        return [field,value[field]];
      }))));
    });
    const result=await read(options,wire.fetchImpl,row.auth==='anonymous'?null:account);
    assert.equal(wire.calls.length,sourceRead?1:0);
    const p=checked(result);
    assert.equal(p.readState,sourceRead?.state??'unavailable');
    assert.equal(p.counts.available,sourceRead?.count??null);
    assert.deepEqual(p.records,sourceRead?.records??[]);
    if(sourceRead)assert.equal(result.evidence.url,row.route);
    const formatted=formatInternshipEvidence(result,row.question);
    assert.ok(formatted);
    for(const marker of row.expected.forbiddenAccountMarkers)assert.equal(formatted.answer.includes(marker),false,'Foreign or unrequested value: '+marker);
    assert.doesNotMatch(result.evidence.content,/OFFLINE_USER_TOKEN|OFFLINE_KEY/u);
    if(denial==='foreign_request')assert.doesNotMatch(formatted.answer,/\]\(/u);
  });
});

test('foreign rows, wrong subtype, exact selector drift and contradictory counts fail closed',async()=>{
  const adversarial=[
    ()=>response([baseRow({user_id:internshipNativeManifest.owners.B})]),
    ()=>response([baseRow({record_type:'self_assessment'})]),
    ()=>response([baseRow({service_key:'leave'})]),
    ()=>response([baseRow({notes:'unexpected private note'})]),
    ()=>response([baseRow(),baseRow()]),
    ()=>new Response(JSON.stringify([baseRow()]),{status:200,headers:{'content-range':'25-25/37'}}),
    ()=>response([],25),
    ()=>response([baseRow()],2),
    ()=>new Response(JSON.stringify([baseRow()])),
  ];
  for(const mock of adversarial){
    const result=await read(ordinary,mock),p=checked(result);
    assert.equal(p.readState,'unavailable');
    assert.equal(p.reason,'invalid_records');
    assert.deepEqual(p.records,[]);
    assert.doesNotMatch(result.evidence.content,/QA Harbor Analytics|unexpected private note/u);
  }
  const exact={...ordinary,question:ordinary.question.slice(0,-1)+' with record ID '+markers.id+'.'};
  const correct=await read(exact,url=>{
    assert.equal(url.searchParams.get('id'),'eq.'+markers.id);
    assert.equal(url.searchParams.get('limit'),'1');
    return response([baseRow()]);
  });
  assert.equal(correct.readState,'ok');
  const unrelated=await read(exact,()=>response([baseRow({id:'53010000-0000-4000-8000-000000000012'})]));
  assert.equal(unrelated.reason,'invalid_records');
  const never=callsFor(()=>{throw Error('invalid selectors must not call transport');});
  for(const question of ['Show my internship contract with record ID xyz.','Show my internship contracts for account ID 42.',
    'Show my internship contract with record ID '+markers.id+' and contract ID 53010000-0000-4000-8000-000000000012.']){
    assert.equal((await read({...ordinary,question},never.fetchImpl)).readState,'unavailable');
  }
  assert.equal(never.calls.length,0);
});

test('missing, crossed and mismatched review joins stay distinct from the own tracker status',async()=>{
  const options={...ordinary,question:'Show the site review status of my saved internship contracts.'};
  const requestId='53010000-0000-4000-8000-000000000031';
  for(const [relation,state,expected,reason] of [
    [null,'partial','unavailable','linked_review_unavailable'],
    [{id:requestId,user_id:account.user.id,status:'resolved'},'ok','recorded',null],
    [{id:requestId,user_id:internshipNativeManifest.owners.B,status:'resolved'},'unavailable',null,'invalid_records'],
    [{id:markers.id,user_id:account.user.id,status:'resolved'},'unavailable',null,'invalid_records'],
  ]){
    const p=checked(await read(options,()=>response([baseRow({review_request_id:requestId,site_review:relation})])));
    assert.equal(p.readState,state);
    assert.equal(p.reason,reason);
    assert.equal(p.records[0]?.reviewState??null,expected);
    if(expected)assert.equal(p.records[0].status,'draft');
  }
  const absent=checked(await read(options,()=>response([baseRow({review_request_id:null,site_review:null})])));
  assert.equal(absent.records[0].reviewState,'not_requested');
  assert.equal(absent.records[0].reviewStatus,null);
});

test('row and UTF-8 evidence limits retain exact counts and never include truncated text',async()=>{
  const options={...ordinary,question:'Show my saved internship contract notes.'};
  const notes='字'.repeat(2000);
  const rows=Array.from({length:25},(_,index)=>baseRow({
    id:'53010000-0000-4000-8000-'+String(index+11).padStart(12,'0'),title:'Selected '+index,notes,
  }));
  const result=await read(options,()=>response(rows,50));
  const p=checked(result);
  assert.equal(p.readState,'partial');
  assert.equal(p.reason,'bounded_results');
  assert.equal(p.counts.available,50);
  assert.equal(p.counts.returned,25);
  assert.equal(p.counts.omitted,50-p.counts.included);
  assert.ok(p.records.length>0&&p.records.length<25);
  assert.ok(Buffer.byteLength(result.evidence.content)<=internshipEvidenceMaxBytes);
  assert.ok(p.records.every(row=>row.notes===notes));
  rows.at(-1).notes='not accepted'+notes;
  assert.equal((await read(options,()=>response(rows,50))).reason,'invalid_records');
});

test('route/operation decisions cannot grant broad reads and residuals stay separate',async()=>{
  const untouched=callsFor(()=>{throw Error('unrelated inputs cannot call transport');});
  for(const [question,route]of [
    ['What is the weather?',contract],
    ['How much tuition do I still owe?',contract],
    ['Show my internship contract dates.',contract+'/unknown'],
    ['Show my internship contract and then delete it.',''],
    ['Show my internship contract and her notes.',contract],
    ['List all students’ internship contracts.',contract],
    ['Show the site review notes for my internship contract.',contract],
    ['Show my supervisor’s internship contract notes.',contract],
    ['Please show no records.','/school-affairs'],
  ])assert.equal((await read({question,route},untouched.fetchImpl)).readState,'unavailable');
  assert.equal(untouched.calls.length,0);
  const composite=internshipLookupContext('Show my saved internship contracts and my upcoming grade report.',contract);
  assert.equal(composite.companion,null);
  assert.equal(composite.otherQuestion,'my upcoming grade report');
  assert.equal(composite.selection.recordType,'contract');
  const denied=internshipLookupContext('Show Alice’s internship contracts. Also show my tuition balance.',contract);
  assert.equal(denied.reason,'foreign_request');
  assert.equal(denied.companion,'charges');
  assert.equal(denied.selection,null);
});

test('explicit title-only request excludes status and untrusted note links are rendered as literal text',async()=>{
  const names={...ordinary,question:'Show only the titles of my internship contracts.'};
  const title=await read(names,url=>{
    assert.equal(url.searchParams.get('select'),'id,user_id,service_key,record_type,title');
    const {status:_unrequested,...record}=baseRow();
    return response([record]);
  });
  assert.equal(title.readState,'ok');
  assert.deepEqual(checked(title).records,[{title:markers.title}]);
});

test('access denial, read failure, bad JSON and elapsed deadlines are unavailable',async()=>{
  for(const [mock,reason]of [
    [()=>new Response(null,{status:403}),'access_denied'],
    [()=>new Response(null,{status:500}),'read_failed'],
    [()=>new Response('invalid json',{headers:{'content-range':'0-0/1'}}),'invalid_records'],
    [()=>new Response('[]',{headers:{'content-range':'*/0','content-length':'450000'}}),'invalid_records'],
    [()=>Promise.reject(Error('unavailable')),'read_failed'],
  ])assert.equal(checked(await read(ordinary,mock)).reason,reason);
  let attempts=0;
  assert.equal((await read({...ordinary,deadline:Date.now()-10},()=>{attempts++;})).reason,'deadline_exceeded');
  assert.equal(attempts,0);
  const result=await read({...ordinary,deadline:Date.now()+40},(_url,init)=>{
    attempts++;
    assert.ok(init.signal);
    return new Promise(()=>{});
  });
  assert.equal(result.reason,'deadline_exceeded');
  assert.equal(attempts,1);
});

test('date pairs, type, route, count and review projection cannot be forged',async()=>{
  const options={...ordinary,question:'List my saved internship contract dates and notes.'};
  const row=baseRow({starts_on:'2026-12-01',ends_on:'2026-12-31',notes:'[Unsafe](https://example.invalid)\n<iframe>bad</iframe>'});
  const result=await read(options,()=>response([row])),draft=formatInternshipEvidence(result,options.question);
  assert.equal(result.readState,'ok');
  assert.ok(draft.answer.includes('\\[Unsafe\\]\\(https&#58;//example.invalid\\)'));
  assert.doesNotMatch(draft.answer,/<iframe>/);
  for(const change of [
    p=>p.records[0].notes=1,p=>p.selection.route='/app',p=>p.counts.available=7,p=>p.records[0].reviewStatus='resolved',
    p=>p.records[0].endsOn='2026-11-30',p=>p.selection.recordType='company',
  ]){
    const forged=structuredClone(result),p=JSON.parse(forged.evidence.content);
    change(p);forged.evidence.content=JSON.stringify(p);
    assert.equal(formatInternshipEvidence(forged),null);
  }
  for(const dates of [{starts_on:'2026-02-29',ends_on:'2026-03-03'},{starts_on:null,ends_on:'2026-03-03'}])
    assert.equal((await read(options,()=>response([{...row,...dates}]))).reason,'invalid_records');
});

test('public internship policy or navigation needs no account evidence even on a native page',async()=>{
  const wire=callsFor(()=>assert.fail('Public guidance may not start a private reader'));
  for(const question of [
    'What is an internship contract?',
    'What rules apply to internship contracts?',
    'Explain school policy for student internship contracts.',
    'How should students complete the internship self-assessment?',
    '校外實習契約的申請條件是什麼？',
    'Where can I find the internship contract page?',
  ]){
    assert.equal(internshipLookupContext(question,contract).recognized,false,question);
    assert.equal((await read({question,route:contract},wire.fetchImpl)).readState,'unavailable');
  }
  assert.equal(wire.calls.length,0);
});
