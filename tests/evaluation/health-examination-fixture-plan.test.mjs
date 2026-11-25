import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {buildHealthExaminationFixturePlan,healthExaminationFixtureManifest as manifest,healthExaminationFixtureCaseBinding,
  healthExaminationFixtureReadContract,healthExaminationFixtureSqlReadContract,assertHealthExaminationFixtureIdentities,
  assertHealthExaminationFixtureRows,verifyHealthExaminationFixtureReadback,reconcileHealthExaminationFixturePlans,
  assertHealthExaminationFixtureCleanup} from './health-examination-fixture-plan.mjs';
import {readHealthExaminations} from '../../server/healthExaminations.js';
import {readHealthExaminationEvidence} from '../../server/accountHealthExaminationEvidence.js';

const runId='81000000-0000-4000-8000-000000000001',a='82000000-0000-4000-8000-000000000001',b='82000000-0000-4000-8000-000000000002';
const owners={A:{id:a,email:'health.a@example.invalid',runMarker:runId},B:{id:b,email:'health.b@example.invalid',runMarker:runId}};
const input=(fixtureKey='healthExaminations')=>({runId,owners:structuredClone(owners),fixtureKey});
const table='affairs_health_examinations',copy=value=>structuredClone(value),blank=()=>({[table]:[]});
const error=code=>value=>value?.code===code&&value.message==='Health metadata fixture '+code+'.';
const native=(plan,role,page)=>healthExaminationFixtureReadContract(plan,{role,page}).expected;
const identities=()=>({identities:copy(Object.values(owners))});

test('single-table plan independently defines A/B markers and all false flags without Storage, profiles or clinical results',()=>{
  const plan=buildHealthExaminationFixturePlan(input());
  assert.deepEqual(Object.keys(plan.rows),[table]);assert.equal(plan.rows[table].length,4);
  const own=native(plan,'A',1),foreign=native(plan,'B',1);
  assert.deepEqual(own.rows.map(row=>row.examination_code),['QA HEALTH A-01','QA HEALTH A-02','QA HEALTH A-03']);
  assert.deepEqual(foreign.rows.map(row=>row.examination_code),['FOREIGN HEALTH METADATA']);
  assert.equal(own.total,3);assert.equal(foreign.total,1);assert.ok(plan.rows[table].every(row=>row.report_available===false));
  assert.equal(own.rows[0].student_name,'PRIVATE HEALTH NAME A');assert.equal(foreign.rows[0].student_name,'FOREIGN HEALTH NAME');
  assert.deepEqual(plan.rows[table].filter(row=>row.user_id===a).map(row=>row.examined_on),['2026-11-13','2026-11-12',null]);
  assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(own.rows[0]));assert.throws(()=>{own.rows[0].report_available=true;});
  assert.equal(manifest.mounted,false);assert.equal(manifest.liveAcceptance,false);
  assert.ok(plan.setup.every(step=>!['storage','auth','initializer','download'].some(word=>step.kind.includes(word))));
  assert.deepEqual(plan.setup.find(step=>step.kind==='insert-exact-metadata-rows').rows,plan.rows[table]);
});

test('only16 metadata-only cases are self-contained; three cases explicitly require separate charges',()=>{
  assert.equal(manifest.plannedCaseIds.length,19);assert.equal(manifest.metadataOnlyCaseIds.length,16);assert.equal(manifest.compoundCaseIds.length,3);
  for(const id of manifest.plannedCaseIds){
    const binding=healthExaminationFixtureCaseBinding({id});assert.ok(manifest.families.includes(binding.fixtureKey));
    assert.deepEqual(binding.requiresAdditionalFixtures,manifest.compoundCaseIds.includes(id)?['charges']:[]);
    assert.equal(binding.metadataOnly,!manifest.compoundCaseIds.includes(id));
  }
  assert.equal(healthExaminationFixtureCaseBinding('account:health-examinations-empty').fixtureKey,'empty:healthExaminations');
  for(const suffix of ['page-one','page-two','empty-later-page','history-followup','mixed-reversed'])assert.equal(healthExaminationFixtureCaseBinding('account:health-examinations-'+suffix).fixtureKey,'paged:healthExaminations');
  for(const id of manifest.offlineOnlyCaseIds)assert.equal(healthExaminationFixtureCaseBinding(id),null);
  assert.equal(manifest.offlineOnlyCaseIds.length,7);assert.throws(()=>healthExaminationFixtureCaseBinding('account:invented'),error('invalid_case'));
});

test('family IDs are deterministic and disjoint across owners and all three variants',()=>{
  const plans=manifest.families.map(fixtureKey=>buildHealthExaminationFixturePlan(input(fixtureKey)));
  assert.deepEqual(plans.map(plan=>native(plan,'A',1).total),[3,0,26]);assert.deepEqual(plans.map(plan=>native(plan,'B',1).total),[1,1,1]);
  const ids=plans.flatMap(plan=>plan.recordIds);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(id=>![runId,a,b].includes(id)));
  assert.deepEqual(plans[0],buildHealthExaminationFixturePlan(input()));
  for(const plan of plans)assert.equal(new Set(plan.rows[table].map(row=>row.user_id+':'+row.examination_code)).size,plan.rows[table].length);
});

test('exact disposable identity proof rejects real addresses, swapped owners, missing markers and extra fields',()=>{
  const plan=buildHealthExaminationFixturePlan(input());assert.equal(assertHealthExaminationFixtureIdentities(plan,identities()),true);
  for(const alter of [value=>{value.owners.B.id=a;},value=>{value.owners.A.email='real@example.com';},value=>{value.owners.A.runMarker=b;}]){
    const value=input();alter(value);assert.throws(()=>buildHealthExaminationFixturePlan(value),error('invalid_owners'));
  }
  for(const alter of [value=>{value.identities.pop();},value=>{value.identities[0].runMarker=b;},value=>{value.identities[1].id=a;},value=>{value.identities[0].role='admin';}]){
    const value=identities();alter(value);assert.throws(()=>assertHealthExaminationFixtureIdentities(plan,value),error('identity_mismatch'));
  }
});

test('raw observation requires exact eight columns, all-owner/reserved scope, literal dates and false flags',()=>{
  const plan=buildHealthExaminationFixturePlan(input()),contract=healthExaminationFixtureSqlReadContract(plan);
  assert.deepEqual(contract,{table,columns:manifest.columns,dateColumns:['examined_on'],anyOf:[{column:'user_id',values:[a,b]},{column:'id',values:plan.recordIds}],order:['id']});
  assert.equal(assertHealthExaminationFixtureRows(plan,plan.rows),true);
  const reversed=copy(plan.rows);reversed[table].reverse();assert.equal(assertHealthExaminationFixtureRows(plan,reversed),true);
  for(const alter of [value=>{value[table][0].report_available=true;},value=>{value[table][0].report_available=null;},value=>{value[table][0].examined_on=new Date('2026-11-13');},
    value=>{value[table][0].examined_on='2026-11-12';},value=>{value[table][0].user_id=b;},value=>{value[table][0].report_url='https://private.invalid';},
    value=>{value[table].push(value[table][0]);},value=>{value[table][0].examination_code='CHANGED';}]){
    const value=copy(plan.rows);alter(value);assert.throws(()=>assertHealthExaminationFixtureRows(plan,value),error('rows_mismatch'));
  }
});

test('native page contracts preserve totals, exact offsets, sorted null-last rows and later empty pages',()=>{
  const plan=buildHealthExaminationFixturePlan(input('paged:healthExaminations'));
  const first=healthExaminationFixtureReadContract(plan,{role:'A',page:1}),second=healthExaminationFixtureReadContract(plan,{role:'A',page:2}),third=healthExaminationFixtureReadContract(plan,{role:'A',page:3});
  assert.deepEqual(first.query,{scope:'health-examinations',page:'1'});assert.deepEqual(first.rpc,{name:'affairs_read_health_examinations',body:{p_offset:0}});
  assert.deepEqual(second.rpc.body,{p_offset:25});assert.equal(second.localUrl,'/school-affairs/services/36-1?page=2');
  assert.equal(first.expected.rows.length,25);assert.equal(first.expected.rows[0].examination_code,'QA HEALTH PAGE 01');assert.equal(first.expected.rows.at(-1).examination_code,'QA HEALTH PAGE 25');
  assert.equal(second.expected.rows.length,1);assert.equal(second.expected.rows[0].examination_code,'QA HEALTH PAGE 26');
  assert.deepEqual(third.expected,{userId:a,total:26,rows:[]});assert.equal(native(plan,'B',2).total,1);assert.deepEqual(native(plan,'B',2).rows,[]);
  assert.deepEqual(Object.keys(first.expected.rows[0]),manifest.nativeColumns);assert.equal(Object.hasOwn(first.expected.rows[0],'examined_on'),false);
  for(const page of [0,202,-1,1.5,'1',NaN])assert.throws(()=>healthExaminationFixtureReadContract(plan,{role:'A',page}),error('invalid_request'));
  assert.throws(()=>healthExaminationFixtureReadContract(plan,{role:'A',page:1,report:'anything'}),error('invalid_request'));
});

test('readback rejects wrong callers, source substitution, invented availability and page-wide false absence',()=>{
  const plan=buildHealthExaminationFixturePlan(input('paged:healthExaminations'));
  for(const role of ['A','B'])for(const page of [1,2,3,201])assert.equal(verifyHealthExaminationFixtureReadback(plan,{role,page},native(plan,role,page)),true);
  for(const alter of [value=>{value.userId=b;},value=>{value.total=0;},value=>{value.rows.pop();},value=>{value.rows[0].report_available=true;},
    value=>{value.rows[0].student_number='OTHER';},value=>{value.rows[0].examined_on='2026-11-14';}]){
    const value=copy(native(plan,'A',1));alter(value);assert.throws(()=>verifyHealthExaminationFixtureReadback(plan,{role:'A',page:1},value),error('readback_mismatch'));
  }
  assert.throws(()=>verifyHealthExaminationFixtureReadback(plan,{role:'A',page:3},{userId:a,total:0,rows:[]}),error('readback_mismatch'));
});

test('actual native loader uses only own metadata RPC with exact offset, never report authorization or Storage',async()=>{
  const plan=buildHealthExaminationFixturePlan(input('paged:healthExaminations')),original=globalThis.fetch,calls=[];
  try{
    for(const role of ['A','B'])for(const page of [1,2,3]){
      const contract=healthExaminationFixtureReadContract(plan,{role,page}),token='OFFLINE_'+role;
      globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.equal(url,'https://xiftudmvxphxcjtmfmib.supabase.co/rest/v1/rpc/affairs_read_health_examinations');
        assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+token);
        assert.deepEqual(JSON.parse(options.body),contract.rpc.body);return Response.json(contract.expected);};
      const result=await readHealthExaminations({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token,user:{id:contract.ownerId}},contract.query);
      assert.equal(verifyHealthExaminationFixtureReadback(plan,{role,page},result),true);
    }
  }finally{globalThis.fetch=original;}
  assert.equal(calls.length,6);assert.ok(calls.every(url=>!url.includes('/storage/')&&!url.includes('download')));
});

test('actual evidence projection omits every identity/date while preserving false, total0 and page-empty distinctions',async()=>{
  const normal=buildHealthExaminationFixturePlan(input()),paged=buildHealthExaminationFixturePlan(input('paged:healthExaminations')),empty=buildHealthExaminationFixturePlan(input('empty:healthExaminations'));
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:a}};
  for(const [plan,page,state,collection,total,count]of [[normal,1,'ok','records',3,3],[paged,1,'partial','records',26,25],[paged,2,'partial','records',26,1],[paged,3,'partial','page_empty',26,0],[empty,1,'empty','empty',0,0]]){
    const result=await readHealthExaminationEvidence(account,{question:'Show my health examination records.',route:'/school-affairs/services/36-1?page='+page},
      {read:async(captured,query)=>{assert.equal(captured.user.id,a);assert.deepEqual(query,{scope:'health-examinations',page:String(page)});return native(plan,'A',page);}});
    const payload=JSON.parse(result.evidence.content);assert.equal(result.readState,state);assert.equal(payload.collectionState,collection);
    assert.equal(payload.counts.total,total);assert.equal(payload.records.length,count);assert.ok(payload.records.every(row=>row.reportAvailable===false));
    assert.doesNotMatch(JSON.stringify(payload),/PRIVATE HEALTH|FOREIGN HEALTH|student_number|student_name|class_label|examined_on|2026-11-13/u);
    assert.ok(payload.records.every(row=>Object.keys(row).join(',')==='examinationCode,reportAvailable'));
  }
});

test('complete previous/next/empty reconciliation returns only exact owner-qualified metadata targets',()=>{
  const previous=buildHealthExaminationFixturePlan(input()),next=buildHealthExaminationFixturePlan(input('paged:healthExaminations'));
  assert.deepEqual(reconcileHealthExaminationFixturePlans({previous,next,actual:blank()}),{state:'empty',deleteTargets:[]});
  for(const [state,plan]of [['previous',previous],['next',next]]){
    const proof=reconcileHealthExaminationFixturePlans({previous,next,actual:plan.rows});assert.equal(proof.state,state);
    assert.deepEqual(proof.deleteTargets,plan.rows[table].map(row=>({table,id:row.id,userId:row.user_id})));
  }
  for(const actual of [{[table]:[...previous.rows[table],...next.rows[table]]},{[table]:previous.rows[table].slice(1)},
    {[table]:previous.rows[table].map((row,index)=>index===0?{...row,user_id:'89000000-0000-4000-8000-000000000001'}:row)}])
    assert.throws(()=>reconcileHealthExaminationFixturePlans({previous,next,actual}),error('rows_mismatch'));
  const altered=copy(next);altered.rows[table][0].report_available=true;assert.throws(()=>reconcileHealthExaminationFixturePlans({previous,next:altered,actual:next.rows}),error('invalid_plan'));
});

test('cleanup proof requires both exact owners and global reserved-ID zero counts, without a file or lease operation',()=>{
  const plan=buildHealthExaminationFixturePlan(input()),proof={...identities(),remainingByOwner:[{userId:a,count:0},{userId:b,count:0}],reservedRemaining:0};
  assert.equal(assertHealthExaminationFixtureCleanup(plan,proof),true);
  for(const alter of [value=>{value.remainingByOwner.pop();},value=>{value.remainingByOwner[0].count=1;},value=>{value.remainingByOwner[0].count='0';},
    value=>{value.reservedRemaining=1;},value=>{value.identities[0].runMarker=b;},value=>{value.storageObjects=0;}]){
    const value=copy(proof);alter(value);assert.throws(()=>assertHealthExaminationFixtureCleanup(plan,value));
  }
  assert.ok(plan.cleanup.every(step=>!step.kind.includes('download')&&!step.kind.includes('storage')));
});

test('plan columns and literal bounds align with reviewed migration while report-file workflows remain excluded',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261115060000_student_health_reports.sql',import.meta.url),'utf8');
  for(const key of manifest.columns)assert.ok(new RegExp('\\b'+key+'\\b','u').test(sql),key);
  assert.match(sql,/unique\(user_id,examination_code\)/u);assert.match(sql,/report_available boolean not null default false/u);
  assert.match(sql,/order by examined_on desc nulls last,id limit 25 offset p_offset/u);
  assert.match(sql,/report_available and\s+exists\(select 1 from storage.objects/u);
  for(const family of manifest.families)for(const row of buildHealthExaminationFixturePlan(input(family)).rows[table]){
    for(const [key,max]of [['examination_code',40],['student_number',40],['student_name',120],['class_label',120]])assert.ok(row[key].trim().length>=1&&row[key].trim().length<=max);
    assert.equal(row.report_available,false);
  }
});
