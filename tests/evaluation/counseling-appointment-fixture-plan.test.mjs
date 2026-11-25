import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {buildCounselingAppointmentFixturePlan,counselingAppointmentFixtureManifest as manifest,counselingAppointmentFixtureCaseBinding,
  counselingAppointmentFixtureReadContract,counselingAppointmentFixtureSqlReadContract,assertCounselingAppointmentFixtureIdentities,
  assertCounselingAppointmentFixtureRows,verifyCounselingAppointmentFixtureReadback,reconcileCounselingAppointmentFixturePlans,
  assertCounselingAppointmentFixtureCleanup} from './counseling-appointment-fixture-plan.mjs';
import {buildCounselingAppointmentCases,counselingAppointmentFixtureForCase} from './counseling-appointment-cases.mjs';
import {readCounseling} from '../../server/counseling.js';
import {readCounselingEvidence} from '../../server/accountCounselingEvidence.js';

const runId='83000000-0000-4000-8000-000000000001',a='84000000-0000-4000-8000-000000000001',b='84000000-0000-4000-8000-000000000002';
const owners={A:{id:a,email:'counseling.a@example.invalid',runMarker:runId},B:{id:b,email:'counseling.b@example.invalid',runMarker:runId}};
const input=(fixtureKey='counselingAppointments')=>({runId,owners:structuredClone(owners),fixtureKey});
const table='affairs_counseling_appointments',copy=value=>structuredClone(value),blank=()=>({[table]:[]});
const error=code=>value=>value?.code===code&&value.message==='Counseling metadata fixture '+code+'.';
const native=(plan,role)=>({...copy(counselingAppointmentFixtureReadContract(plan,{role}).expected),available:true,canCoordinate:false});
const identities=()=>({identities:copy(Object.values(owners))});
const project=rows=>rows.map(({kind,status,preferred_on,preferred_period,scheduled_at})=>({kind,status,preferred_on,preferred_period,scheduled_at}));

test('independent exact metadata rows preserve requested, cancelled and closed timestamps without coordinator/actions',()=>{
  const plan=buildCounselingAppointmentFixturePlan(input());assert.deepEqual(Object.keys(plan.rows),[table]);assert.equal(plan.rows[table].length,4);
  const own=native(plan,'A'),foreign=native(plan,'B');
  assert.deepEqual(own.rows.map(row=>[row.preferred_on,row.status,row.scheduled_at]),[
    ['2026-11-25','requested',null],['2026-10-20','cancelled','2026-10-22T06:00:00Z'],['2026-09-15','closed','2026-09-18T01:00:00Z']]);
  assert.equal(foreign.rows[0].preferred_on,'2027-01-19');assert.equal(foreign.rows[0].kind,'assessment');
  assert.ok(plan.rows[table].every(row=>row.consent_version==='stu-best-2026-11-14'));
  assert.deepEqual(Object.keys(plan.rows[table][0]).sort(),[...manifest.columns].sort());assert.equal(manifest.columns.length,11);
  assert.equal(manifest.mounted,false);assert.equal(manifest.liveAcceptance,false);assert.ok(Object.isFrozen(plan.rows[table][0]));
  assert.throws(()=>{plan.rows[table][0].status='scheduled';});
  assert.ok(plan.setup.every(step=>!['queue','coordinator','initializer','request-appointment','cancel-appointment'].some(word=>step.kind.includes(word))));
  assert.deepEqual(plan.setup.find(step=>step.kind==='insert-exact-metadata-rows').rows,plan.rows[table]);
});
test('four family namespaces are deterministic, distinct, exact one-open and preserve independent B control',()=>{
  const plans=manifest.families.map(key=>buildCounselingAppointmentFixturePlan(input(key)));
  assert.deepEqual(plans.map(plan=>native(plan,'A').rows.length),[3,3,0,50]);
  assert.ok(plans.every(plan=>native(plan,'B').rows.length===1));
  const ids=plans.flatMap(plan=>plan.recordIds);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(id=>![runId,a,b].includes(id)));
  for(const plan of plans)for(const owner of [a,b])assert.ok(plan.rows[table].filter(row=>row.user_id===owner&&['requested','scheduled'].includes(row.status)).length<=1);
  assert.deepEqual(plans[0],buildCounselingAppointmentFixturePlan(input()));
  assert.equal(native(plans[1],'A').rows[0].scheduled_at,'2026-11-27T02:30:00Z');
  assert.equal(native(plans[3],'A').rows[0].preferred_on,'2026-01-01');assert.equal(native(plans[3],'A').rows.at(-1).preferred_on,'2026-02-19');
});
test('21 planned cases align with independent packet; three require charges and seven cannot be prepared by own-row fixtures',()=>{
  assert.equal(manifest.plannedCaseIds.length,21);assert.equal(manifest.metadataOnlyCaseIds.length,18);assert.equal(manifest.compoundCaseIds.length,3);
  const cases=buildCounselingAppointmentCases();assert.equal(cases.length,28);
  for(const row of cases){const binding=counselingAppointmentFixtureCaseBinding(row);
    if(manifest.offlineOnlyCaseIds.includes(row.id)){assert.equal(binding,null);continue;}
    assert.ok(manifest.families.includes(binding.fixtureKey));assert.deepEqual(binding.requiresAdditionalFixtures,manifest.compoundCaseIds.includes(row.id)?['charges']:[]);
    assert.equal(binding.metadataOnly,!manifest.compoundCaseIds.includes(row.id));
    const expected=counselingAppointmentFixtureForCase(row),plan=buildCounselingAppointmentFixturePlan(input(binding.fixtureKey));
    assert.deepEqual(project(native(plan,'A').rows),project(expected.rows),row.id);
  }
  assert.equal(counselingAppointmentFixtureCaseBinding('account:counseling-appointments-service-unavailable'),null);
  assert.throws(()=>counselingAppointmentFixtureCaseBinding('account:invented'),error('invalid_case'));
});
test('exact disposable identity proof rejects real addresses, missing markers and forged additional authority',()=>{
  const plan=buildCounselingAppointmentFixturePlan(input());assert.equal(assertCounselingAppointmentFixtureIdentities(plan,identities()),true);
  for(const alter of [v=>{v.owners.B.id=a;},v=>{v.owners.A.email='real@example.com';},v=>{v.owners.A.runMarker=b;},v=>{v.owners.A.role='admin';}]){
    const value=input();alter(value);assert.throws(()=>buildCounselingAppointmentFixturePlan(value),error('invalid_owners'));}
  const proof=identities();proof.identities[0].runMarker=b;assert.throws(()=>assertCounselingAppointmentFixtureIdentities(plan,proof),error('identity_mismatch'));
  const mutated=copy(plan);mutated.rows[table][0].version=7;assert.throws(()=>assertCounselingAppointmentFixtureRows(mutated,mutated.rows),error('invalid_plan'));
});
test('canonical SQL contract observes full owners and all reserved IDs with exact11 fields',()=>{
  const plan=buildCounselingAppointmentFixturePlan(input()),contract=counselingAppointmentFixtureSqlReadContract(plan);
  assert.deepEqual(contract,{table,columns:manifest.columns,dateColumns:['preferred_on'],timestampColumns:['scheduled_at','consent_at','updated_at'],
    anyOf:[{column:'user_id',values:[a,b]},{column:'id',values:plan.recordIds}],order:['id']});
  const rows=copy(plan.rows);rows[table].reverse();assert.equal(assertCounselingAppointmentFixtureRows(plan,rows),true);
  for(const alter of [v=>{v[table][0].user_id=b;},v=>{v[table][0].status='closed';},v=>{v[table][0].consent_at='2026-08-02T00:00:00Z';},
    v=>{v[table][0].clinical_notes='PRIVATE';},v=>{v[table][0].preferred_on='2026-11-26';},v=>{v[table].push(v[table][0]);},v=>{v[table].pop();}]){
    const value=copy(plan.rows);alter(value);assert.throws(()=>assertCounselingAppointmentFixtureRows(plan,value),error('rows_mismatch'));}
});
test('native read contract is own mine only; coordinator booleans are validated observations, not expected fixtures',()=>{
  const plan=buildCounselingAppointmentFixturePlan(input()),contract=counselingAppointmentFixtureReadContract(plan,{role:'A'});
  assert.deepEqual(contract.query,{scope:'counseling-appointments',view:'mine'});assert.deepEqual(contract.rpc,{name:'affairs_read_counseling',body:{p_view:'mine'}});
  assert.equal(contract.ownerId,a);assert.equal(contract.localUrl,manifest.path);assert.deepEqual(contract.observedBooleanFields,['available','canCoordinate']);
  for(const available of [true,false])for(const canCoordinate of [true,false])assert.equal(verifyCounselingAppointmentFixtureReadback(plan,{role:'A'},{...native(plan,'A'),available,canCoordinate}),true);
  for(const options of [{role:'A',view:'queue'},{role:'A',page:2},{role:'C'},null])assert.throws(()=>counselingAppointmentFixtureReadContract(plan,options),error('invalid_request'));
  for(const alter of [v=>{v.userId=b;},v=>{v.available=null;},v=>{delete v.canCoordinate;},v=>{v.rows.reverse();},v=>{v.rows[0].user_id=a;},v=>{v.queue=[];}]){
    const value=native(plan,'A');alter(value);assert.throws(()=>verifyCounselingAppointmentFixtureReadback(plan,{role:'A'},value),error('readback_mismatch'));}
});
test('wire timestamps allow exact equivalent instants but reject microsecond drift, invalid dates or Date objects',()=>{
  const plan=buildCounselingAppointmentFixturePlan(input()),rows=copy(plan.rows);
  rows[table][0].updated_at='2026-11-18T11:00:00.000000+08:00';rows[table][0].consent_at='2026-08-01T00:00:00+00:00';
  assert.equal(assertCounselingAppointmentFixtureRows(plan,rows),true);
  const dto=native(plan,'A');dto.rows[1].scheduled_at='2026-10-22T14:00:00.000+08:00';
  assert.equal(verifyCounselingAppointmentFixtureReadback(plan,{role:'A'},dto),true);
  for(const bad of ['2026-11-18T03:00:00.000001Z','2026-11-18T03:00:01Z','2026-11-31T03:00:00Z',new Date('2026-11-18T03:00:00Z'),'2026-11-18 03:00:00']){
    const value=copy(plan.rows);value[table][0].updated_at=bad;assert.throws(()=>assertCounselingAppointmentFixtureRows(plan,value),error('rows_mismatch'));}
});
test('reconciliation permits only complete old/new/absent state; partial, mixed and moved rows never authorize deletion',()=>{
  const previous=buildCounselingAppointmentFixturePlan(input()),next=buildCounselingAppointmentFixturePlan(input('scheduled:counselingAppointments'));
  for(const [state,actual]of [['previous',previous.rows],['next',next.rows],['empty',blank()]]){
    const result=reconcileCounselingAppointmentFixturePlans({previous,next,actual});assert.equal(result.state,state);
    assert.deepEqual(result.deleteTargets,state==='empty'?[]:(state==='previous'?previous:next).rows[table].map(row=>({table,id:row.id,userId:row.user_id})));}
  const partial=copy(previous.rows);partial[table].pop();const moved=copy(previous.rows);moved[table][0].user_id=b;
  for(const actual of [partial,moved,{[table]:[...previous.rows[table],...next.rows[table]]},{[table]:[...previous.rows[table],{...previous.rows[table][0],id:runId}]}])
    assert.throws(()=>reconcileCounselingAppointmentFixturePlans({previous,next,actual}),error('rows_mismatch'));
  const other=buildCounselingAppointmentFixturePlan({...input(),runId:b,owners:{A:{...owners.A,runMarker:b},B:{...owners.B,id:'85000000-0000-4000-8000-000000000001',runMarker:b}}});
  assert.throws(()=>reconcileCounselingAppointmentFixturePlans({previous,next:other,actual:blank()}),error('invalid_plan'));
});
test('cleanup requires both exact identities and owner/global-reserved zero, without broad cascades',()=>{
  const plan=buildCounselingAppointmentFixturePlan(input()),proof={...identities(),remainingByOwner:[{userId:a,count:0},{userId:b,count:0}],reservedRemaining:0};
  assert.equal(assertCounselingAppointmentFixtureCleanup(plan,proof),true);
  for(const alter of [v=>{v.remainingByOwner.pop();},v=>{v.remainingByOwner[1].count=1;},v=>{v.reservedRemaining=1;},v=>{v.remainingByOwner[1].userId=a;},v=>{v.identities[0].email='changed@example.invalid';}]){
    const value=copy(proof);alter(value);assert.throws(()=>assertCounselingAppointmentFixtureCleanup(plan,value));}
  const kinds=plan.cleanup.map(step=>step.kind);assert.ok(kinds.indexOf('verify-owned-and-global-reserved-zero-state')<kinds.indexOf('return-to-existing-auth-cleanup'));
});
test('actual native mine transport and evidence reader consume independent planned DTO, including true50 uncertainty',async()=>{
  const original=globalThis.fetch,calls=[];let dto;
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body)});assert.equal(init.method,'POST');return new Response(JSON.stringify(dto),{status:200});};
  try{for(const fixtureKey of manifest.families){const plan=buildCounselingAppointmentFixturePlan(input(fixtureKey));dto=native(plan,'A');
    const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'synthetic-key',token:'synthetic-token',user:{id:a}};
    const read=await readCounseling(account,{scope:'counseling-appointments',view:'mine'});assert.equal(verifyCounselingAppointmentFixtureReadback(plan,{role:'A'},read),true);
    const result=await readCounselingEvidence(account,{question:'Show my counseling appointment history.',route:manifest.path},{read:async()=>read});
    const p=JSON.parse(result.evidence.content),count=dto.rows.length;
    assert.equal(p.counts.returned,count);assert.equal(p.counts.total,count===50?null:count);assert.equal(p.counts.truncationPossible,count===50);
    assert.equal(result.readState,count===50?'partial':count?'ok':'empty');assert.equal(p.records.length,count);
    assert.ok(!JSON.stringify(p).includes(a));assert.ok(!JSON.stringify(p).includes('canCoordinate'));assert.ok(!/"consent_(?:at|version)"/u.test(JSON.stringify(p)));
  }}finally{globalThis.fetch=original;}
  assert.equal(calls.length,4);assert.ok(calls.every(call=>call.url.endsWith('/rest/v1/rpc/affairs_read_counseling')&&JSON.stringify(call.body)==='{"p_view":"mine"}'));
});
test('migration confirms one-open constraint, exact11 columns and two-stage capped own-read ordering',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261115000000_counseling_appointments.sql',import.meta.url),'utf8');
  const definition=sql.match(/create table public\.affairs_counseling_appointments \(([\s\S]*?)\n\);/u)?.[1];assert.ok(definition);
  for(const field of manifest.columns)assert.match(definition,new RegExp('\\n  '+field+' '));
  assert.match(sql,/create unique index affairs_counseling_open_student[\s\S]*?where status in \('requested','scheduled'\)/u);
  assert.match(sql,/where r\.user_id=caller\s+order by \(r\.status in \('requested','scheduled'\)\) desc,r\.updated_at desc,r\.id limit 50/u);
  assert.match(sql,/jsonb_agg\(to_jsonb\(a\) order by a\.updated_at desc,a\.id\)/u);
  assert.match(sql,/check \(status<>'scheduled' or scheduled_at is not null\)/u);
});
