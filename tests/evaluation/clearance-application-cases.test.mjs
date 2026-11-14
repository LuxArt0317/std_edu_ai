import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {buildClearanceApplicationCases,buildPlannedClearanceApplicationCases,clearanceApplicationCaseManifest,clearanceApplicationFixtureForCase,gradeClearanceApplicationCase} from './clearance-application-cases.mjs';
import {readClearanceEvidence} from '../../server/accountClearanceEvidence.js';
import {selectClearanceEvidence} from '../../server/clearanceEvidenceIntent.js';
import {readGraduationClearance} from '../../server/graduationClearance.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';

const cases=buildClearanceApplicationCases(),manifest=clearanceApplicationCaseManifest,path=manifest.paths.status;
const find=suffix=>cases.find(row=>row.id==='account:clearance-applications-'+suffix),copy=value=>structuredClone(value);
function independentObservation(testCase){
  const f=clearanceApplicationFixtureForCase(testCase),n=testCase.nativeExpectation,failed=n.readState==='unavailable';
  const applications=n.applicationsSelected&&!failed?f.dto.applications.map((row,index)=>({position:index+1,term:row.term,submittedAt:row.submittedAt,totalReviewCount:row.reviews.length,
    reviews:row.reviews.filter(r=>n.offices.includes(r.office)).map(r=>({office:r.office,status:r.status,reviewedAt:r.reviewedAt,...(n.noteOffices.includes(r.office)?{note:r.note}:{})}))})):[];
  const periods=n.periodsSelected&&!failed?f.dto.periods.map(row=>({term:row.term,opensAt:row.opensAt,closesAt:row.closesAt,state:row.state})):[];
  const counts=(name,rows)=>{const selected=n[name+'Selected'],count=selected&&!failed?n[name+'Returned']:null;return {selected,returned:count,included:rows.length,omitted:count===null?null:count-rows.length,
    total:count===100?null:count,totalLowerBound:count,nativeLimit:100,truncationPossible:count===null?null:count===100};};
  return {readCalls:n.calls,queries:n.calls?[{scope:'graduation-clearance',view:'student'}]:[],writes:[],storage:[],result:n.selected===false?null:{readState:n.readState,reason:n.reason,
    evidence:{id:'account:graduationClearance',url:n.periodsSelected&&!n.applicationsSelected?manifest.paths.apply:path,content:JSON.stringify({readState:n.readState,
      complete:n.readState==='ok'||n.readState==='empty',collectionState:failed?'unavailable':n.readState==='empty'?'empty':'records',applications,periods,counts:{applications:counts('applications',applications),periods:counts('periods',periods)}})}}};
}
function response(testCase,answer){return {statusCode:testCase.expected.expectedStatusCode??200,execution:'deterministic',fixtureKey:testCase.fixtureKey,
  events:testCase.toolPolicy.required.map(tool=>({kind:'account-read:'+tool+':1',status:testCase.toolPolicy.failed.includes(tool)?'unavailable':'complete'})),
  body:{status:testCase.expected.behavior==='denial'?'handoff':'answered',answer,citations:testCase.expected.requiredSourceBindings.map(({sourceId,url})=>({chunkId:sourceId,url})),verification:{status:'verified',attempts:1}}};}
function answer(testCase,{table=false}={}){
  const intro='Saved local clearance records.\n';
  let body;
  if(table)body='| Term | Office | Status | Note |\n| --- | --- | --- | --- |\n'+testCase.clearancePairs.map(p=>`| ${p.term} | ${p.office} | ${p.status} | ${Object.hasOwn(p,'note')?p.note||'saved blank':''} |`).join('\n');
  else body=[...new Set(testCase.clearancePairs.map(p=>p.term))].map(term=>`### ${term}\n`+testCase.clearancePairs.filter(p=>p.term===term).map(p=>`- ${p.office}: ${p.status}${Object.hasOwn(p,'note')?'; Note: '+(p.note||'saved blank'):''}`).join('\n')).join('\n\n');
  return intro+body+'\n'+testCase.expected.requiredLinks.map(url=>`[Open local page](${url})`).join(' ');
}
const runGrade=(row,value,observation=independentObservation(row),now=row.clockBinding?.asOf)=>gradeClearanceApplicationCase(row,value,{observation,now});

test('34 independent cases preserve explicit planned versus offline setup boundaries',()=>{
  assert.equal(cases.length,34);assert.equal(new Set(cases.map(row=>row.id)).size,34);assert.deepEqual(cases.map(row=>row.id),manifest.caseIds);
  assert.equal(manifest.mounted,false);assert.equal(manifest.liveAcceptance,false);assert.equal(manifest.nativeLimit,100);
  const planned=buildPlannedClearanceApplicationCases();assert.equal(planned.length,25);assert.equal(manifest.offlineOnlyCaseIds.length,9);
  assert.deepEqual(planned.map(row=>row.id),manifest.eligibleCaseIds);
  for(const row of planned){assert.equal(row.plannedFixture.mounted,false);assert.equal(row.plannedFixture.setupEligible,false);assert.equal(row.capability.gap,true);
    assert.equal(row.plannedFixture.requiresNoSharedWrites,true);assert.equal(row.plannedFixture.requiresSharedPeriodBinding,true);assert.equal(row.expected.requireUnchangedOwnedRecords,true);
    assert.deepEqual(row.plannedFixture.requiresAdditionalFixtures,row.expected.allowedTools.includes('courses')?['published-sample:records']:[]);}
  assert.ok(['capped-applications','capped-windows','bounded-notes'].every(s=>!planned.some(row=>row.id==='account:clearance-applications-'+s)));
  assert.throws(()=>clearanceApplicationFixtureForCase({...find('office-statuses'),fixtureKey:'arbitrary'}));
  assert.throws(()=>gradeClearanceApplicationCase({...find('office-statuses'),clearancePairs:[]},{}));
});

test('actual native transport uses only caller-scoped student RPC and accepts the independent exact DTO',async()=>{
  const f=clearanceApplicationFixtureForCase(find('office-statuses')),original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),method:options.method,body:JSON.parse(options.body)});return Response.json(f.dto);};
  try{
    const account={url:'https://offline.invalid',key:'OFFLINE',token:'OFFLINE',user:{id:f.owner}};
    assert.deepEqual(await readGraduationClearance(account,{scope:'graduation-clearance',view:'student'}),f.dto);
    assert.deepEqual(calls,[{url:'https://offline.invalid/rest/v1/rpc/affairs_read_graduation_clearance',method:'POST',body:{p_view:'student',p_term:null,p_student:null}}]);
    await assert.rejects(readGraduationClearance(account,{scope:'graduation-clearance',view:'student',user_id:f.foreignOwner}));assert.equal(calls.length,1);
    globalThis.fetch=async()=>Response.json({...f.dto,targetId:f.foreignOwner});await assert.rejects(readGraduationClearance(account,{scope:'graduation-clearance',view:'student'}));
  }finally{globalThis.fetch=original;}
});

test('all34 independent questions agree with actual reader selections, exact projection and failure semantics',async()=>{
  const original=globalThis.fetch;let unexpected=0;const failures=[];
  globalThis.fetch=async()=>{unexpected++;throw new Error('No network or Storage in offline cases.');};
  try{for(const row of cases){
    const f=clearanceApplicationFixtureForCase(row),obs={readCalls:0,queries:[],writes:[],storage:[],result:null};
    if(selectClearanceEvidence(row.question,row.route,row.history??[])!==null)obs.result=await readClearanceEvidence(row.fixtureKey==='anonymous'?{}:{url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE',token:'OFFLINE',user:{id:f.owner}},
      {question:row.question,route:row.route,history:row.history??[]},{read:async(account,query)=>{obs.readCalls++;obs.queries.push(copy(query));assert.equal(account.user.id,f.owner);if(f.error)throw Object.assign(new Error('PRIVATE TRANSPORT MESSAGE'),f.error);return copy(f.dto);}});
    const result=runGrade(row,response(row,''),obs);
    const native=result.checks.filter(c=>/^clearance\.(?:readCalls|query|notSelected|readState|source|completeness|counts\.|projection\.|noHiddenProjection|noSideEffects)/u.test(c.id));
    const failed=native.filter(c=>!c.passed);if(failed.length)failures.push({id:row.id,reason:obs.result?.reason,failed:failed.map(c=>c.id)});
  }assert.equal(unexpected,0);assert.deepEqual(failures,[]);}finally{globalThis.fetch=original;}
});

test('term→office status pairing accepts headings and explicit tables, rejects swapped offices/terms and contradictions',()=>{
  const row=find('office-statuses');for(const table of [false,true]){
    const good=response(row,answer(row,{table}));assert.equal(runGrade(row,good).passed,true,JSON.stringify(runGrade(row,good).failures));
    for(const mutate of [text=>text.replace('library: pending','library: cleared').replace('| library | pending |','| library | cleared |'),
      text=>text.replace('QA Clearance 115-1','TEMP TERM').replaceAll('QA Clearance 114-2','QA Clearance 115-1').replace('TEMP TERM','QA Clearance 114-2'),
      text=>text.replace('cashier: action_required','cashier: pending action_required').replace('| cashier | action_required |','| cashier | pending action_required |')]){
      const wrong=copy(good);wrong.body.answer=mutate(wrong.body.answer);assert.equal(runGrade(row,wrong).passed,false);}
  }
  const good=response(row,answer(row));good.body.answer=good.body.answer.replace('library: pending','library: not pending');assert.equal(runGrade(row,good).passed,false);
});

test('explicit office notes are literal, retain saved blank and cannot cross term/office boundaries',()=>{
  for(const suffix of ['cashier-notes','library-notes','notes-exclude-cashier','cashier-note-library-status','statuses-cashier-note','without-notes','history-followup']){
    const row=find(suffix),good=response(row,answer(row));assert.equal(runGrade(row,good).passed,true,suffix+JSON.stringify(runGrade(row,good).failures));
  }
  const row=find('cashier-notes'),good=response(row,answer(row));
  for(const mutate of [text=>text.replace('Bring instalment receipt QA-CASH-115','Receipt checked QA-CASH-114'),text=>text.replace('Receipt checked QA-CASH-114','Bring instalment receipt QA-CASH-115'),
    text=>text.replace(/; Note: [^\n]+/u,'')]){const changed=copy(good);changed.body.answer=mutate(changed.body.answer);assert.equal(runGrade(row,changed).passed,false);}
  const blank=find('library-notes'),changed=response(blank,answer(blank).replace('saved blank','not included'));assert.equal(runGrade(blank,changed).passed,false);
  assert.equal(runGrade(blank,response(blank,answer(blank).replace('saved blank','not blank'))).passed,false);
  assert.equal(runGrade(row,response(row,answer(row).replace('Note: Bring','Note: not Bring'))).passed,false);
  const scoped=find('cashier-note-library-status'),leak=response(scoped,answer(scoped));leak.body.views=[{note:'Return archive book QA-LIB-114'}];assert.equal(runGrade(scoped,leak).passed,false);
  const follow=find('history-followup'),leaked=response(follow,answer(follow)+'\nBring instalment receipt QA-CASH-115');assert.equal(runGrade(follow,leaked).passed,false);
});

test('repeated adjacent office field labels retain one composite record without masking contradictory status',()=>{
  const row=find('cashier-notes'),text=answer(row).replace(/- cashier: ([^;\n]+); Note: ([^\n]+)/gu,'  - Cashier · Status: $1\n  - Cashier · Reviewed at: saved review time\n  - Cashier · Note: $2');
  const good=response(row,text);assert.equal(runGrade(row,good).passed,true,JSON.stringify(runGrade(row,good).failures));
  const bad=copy(good);bad.body.answer=bad.body.answer.replace('Cashier · Reviewed at: saved review time','Cashier · Status: pending');assert.equal(runGrade(row,bad).passed,false);
});

test('actual native→concise formatter status/note/empty candidates satisfy independent semantics without model credit',async()=>{
  for(const suffix of ['office-statuses','cashier-notes','library-notes','notes-exclude-cashier','cashier-note-library-status','statuses-cashier-note','without-notes','history-followup','empty-applications','empty-windows']){
    const row=find(suffix),f=clearanceApplicationFixtureForCase(row),obs={readCalls:0,queries:[],writes:[],storage:[],result:null};
    obs.result=await readClearanceEvidence({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE',token:'OFFLINE',user:{id:f.owner}},
      {question:row.question,route:row.route,history:row.history??[]},{read:async(_account,query)=>{obs.readCalls++;obs.queries.push(copy(query));return copy(f.dto);}});
    const envelope=response(row,'');envelope.body=formatSupplementalAccountAnswers([obs.result],{question:row.question});
    const result=runGrade(row,envelope,obs),failures=result.failures.filter(check=>!['answer.verification','answer.verification.expected','answer.behavior'].includes(check.id));
    assert.deepEqual(failures,[],suffix);assert.equal(result.passed,false,'A formatter candidate never earns actual model verification credit.');
  }
});

test('a correct paragraph cannot conceal wrong-term, wrong-office or foreign record cards',()=>{
  const row=find('office-statuses'),good=response(row,answer(row));
  good.body.views=[{title:'Clearance reviews',columns:['Term','Office','Status'],rows:row.clearancePairs.map(p=>[p.term,p.office,p.status])}];
  assert.equal(runGrade(row,good).passed,true);
  for(const mutate of [r=>{r[0][2]='cleared';},r=>{r[0][0]='QA Clearance 114-2';},r=>{r[0][1]='cashier';},r=>{r[0][1]='Another student library';}]){
    const bad=copy(good);mutate(bad.body.views[0].rows);assert.equal(runGrade(row,bad).passed,false);}
  const foreign=response(row,answer(row).replace('library: pending','another student library: pending'));assert.equal(runGrade(row,foreign).passed,false);
  const disclaimer=response(row,answer(row)+'\nI cannot read another student’s records.');assert.equal(runGrade(row,disclaimer).passed,true);
});

test('projection mutations expose lost review lineage, extra note, IDs and false source',()=>{
  const row=find('office-statuses'),good=response(row,answer(row));
  for(const mutate of [p=>{p.applications[0].reviews[0].status='cleared';},p=>{p.applications[0].reviews[0].note='PRIVATE NOTE';},p=>{p.applications[0].id='PRIVATE';},
    p=>{p.applications[0].term='QA Clearance 114-2';},p=>{p.applications[0].reviews.pop();},p=>{p.counts.applications.total=0;},p=>{p.complete=false;},p=>{p.collectionState='empty';}]){
    const obs=independentObservation(row),p=JSON.parse(obs.result.evidence.content);mutate(p);obs.result.evidence.content=JSON.stringify(p);assert.equal(runGrade(row,good,obs).passed,false);}
  const wrong=independentObservation(row);wrong.result.evidence.id='account:serviceRecords';assert.equal(runGrade(row,good,wrong).passed,false);
});

test('native empty, unselected and failed reads cannot exchange their count semantics',()=>{
  const empty=find('empty-applications'),emptyAnswer='No saved applications. Application records are not available in this saved local clearance collection. [Open]('+path+')';
  assert.equal(runGrade(empty,response(empty,emptyAnswer)).passed,true,JSON.stringify(runGrade(empty,response(empty,emptyAnswer)).failures));
  const failed=find('read-unavailable'),message='The local clearance lookup failed; these records are unavailable. [Open]('+path+')';
  assert.equal(runGrade(failed,response(failed,message)).passed,true,JSON.stringify(runGrade(failed,response(failed,message)).failures));
  const falseEmpty=response(failed,'No saved applications. [Open]('+path+')');assert.equal(runGrade(failed,falseEmpty).passed,false);
  const obs=independentObservation(empty),p=JSON.parse(obs.result.evidence.content);p.counts.periods.total=0;obs.result.evidence.content=JSON.stringify(p);assert.equal(runGrade(empty,response(empty,emptyAnswer),obs).passed,false);
});

test('both mixed orders require separate course source and an immutable independently bound next occurrence',()=>{
  for(const suffix of ['mixed-next-class','mixed-next-class-reversed','negative-clearance']){
    const row=find(suffix),next=row.clockBinding.next;
    const text=answer(row)+`\nSample timetable: ${next.code} ${next.title}; Date: ${next.date}; Start: ${next.startsAt.slice(0,5)}; Room: ${next.room}.`;
    const good=response(row,text);assert.equal(runGrade(row,good).passed,true,suffix+JSON.stringify(runGrade(row,good).failures));
    const noClass=copy(good);noClass.body.answer=answer(row);assert.equal(runGrade(row,noClass).passed,false);
    const noSource=copy(good);noSource.body.citations=noSource.body.citations.filter(c=>c.chunkId!=='account:courses');assert.equal(runGrade(row,noSource).passed,false);
    const noRead=copy(good);noRead.events=noRead.events.filter(e=>!e.kind.includes('courses'));assert.equal(runGrade(row,noRead).passed,false);
    assert.equal(runGrade(row,good,independentObservation(row),row.clockBinding.validUntil).passed,false);
  }
  const late=buildClearanceApplicationCases({now:'2026-11-16T01:00:00Z'}).find(row=>row.id.endsWith('-mixed-next-class'));
  assert.notEqual(late.clockBinding.next.code,find('mixed-next-class').clockBinding.next.code);
  assert.throws(()=>buildClearanceApplicationCases({now:'2027-01-15T16:00:00Z'}));
});

test('off-source telemetry, foreign facts, side effects and official card claims never pass',()=>{
  const row=find('office-statuses'),good=response(row,answer(row));
  for(const change of [r=>r.events.push({kind:'account-read:charges:1',status:'unavailable'}),r=>r.events.push({kind:'web-search',status:'complete'}),
    r=>r.body.citations.push({chunkId:'account:profile',url:path}),r=>r.body.answer+='\nFOREIGN CLEARANCE NOTE',r=>r.body.views=[{title:'Outcome',note:'You are eligible to graduate.'}],
    r=>r.body.answer+='\nThis is not official. Your degree is awarded.',r=>r.body.views=[{title:'Document',note:'Download your official certificate.'}],
    r=>r.body.proposedAction={kind:'submit_graduation_clearance',payload:{}}]){const bad=copy(good);change(bad);assert.equal(runGrade(row,bad).passed,false);}
  for(const key of ['writes','storage']){const obs=independentObservation(row);obs[key].push({kind:'unexpected'});assert.equal(runGrade(row,good,obs).passed,false);}
});

test('native schema explains fixture limits without requiring shared writes or action receipts',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261114150000_graduation_clearance.sql',import.meta.url),'utf8');
  assert.match(sql,/term_id uuid primary key references public\.affairs_terms/u);assert.match(sql,/unique \(term_id,user_id\)/u);
  assert.match(sql,/private\.affairs_withdrawal_window_state\(p\.opens_at,p\.closes_at,statement_timestamp\(\)\)/u);
  const read=sql.slice(sql.indexOf('create function public.affairs_read_graduation_clearance'),sql.indexOf('create function public.affairs_change_graduation_clearance'));
  assert.equal((read.match(/limit 100/gu)||[]).length,2);assert.match(read,/where a\.user_id=target/u);assert.match(read,/c\.user_id=target/u);
  assert.equal(manifest.boundaries.some(value=>value.includes('no shared writes')),true);
});
