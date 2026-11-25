import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {buildLiveFacilityRepairCases,facilityRepairCaseManifest as manifest} from './facility-repair-cases.mjs';
import {buildFacilityRepairFixturePlan,changeFacilityRepairFixtureRows,facilityRepairLiveFixtureKey,verifyFacilityRepairFixtureDatabase} from './facility-repair-fixtures.mjs';
import {readFacilityRepairFixtureScopes} from './live-fixtures.mjs';

const owners=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
const runId='40000000-0000-4000-8000-000000000001';
const identities=owners.map((id,index)=>({id,email:`student-${index}@example.invalid`,runId,state:'created'}));
const cases=buildLiveFacilityRepairCases();
const fixture=suffix=>buildFacilityRepairFixturePlan(cases.find(row=>row.id==='account:facility-repair-'+suffix),owners);
const clone=structuredClone;

function transactionMock({reports=[],events=[]}={},auth=identities){
  const data=clone({reports,events}),writes=[];
  const sql=(parts,...values)=>{
    if(!parts.raw)return parts;
    const statement=parts.join('?');
    if(statement.includes('from auth.users'))return auth.map(row=>({id:row.id,email:row.email,run_id:row.runId}));
    if(statement.startsWith('select id,user_id '))return data.reports.filter(row=>values[0].includes(row.id));
    if(statement.startsWith('select * from public.affairs_facility_repairs'))return data.reports.filter(row=>values[0].includes(row.user_id));
    if(statement.startsWith('select * from private.affairs_facility_repair_events'))return data.events.filter(row=>values[0].includes(row.repair_id));
    writes.push(statement);
    if(statement.startsWith('delete from public.affairs_facility_repairs')){
      const [id,owner]=values;
      assert.ok(data.reports.some(row=>row.id===id&&row.user_id===owner));
      data.reports=data.reports.filter(row=>row.id!==id);data.events=data.events.filter(row=>row.repair_id!==id);
    }else if(statement.startsWith('insert into public.affairs_facility_repairs'))data.reports.push(...clone(values[0]));
    else if(statement.startsWith('insert into private.affairs_facility_repair_events'))data.events.push(...clone(values[0]));
    else assert.fail(statement);
  };
  sql.json=value=>value;
  return {data,writes,change:args=>changeFacilityRepairFixtureRows(sql,{identities,runId,...args}),verify:plan=>verifyFacilityRepairFixtureDatabase(sql,plan)};
}

test('live repair templates bind only supported independent records, with a distinct foreign report',()=>{
  assert.equal(cases.length,15);
  for(const row of cases.filter(row=>row.fixtureKey!=='anonymous')){
    assert.ok(facilityRepairLiveFixtureKey(row.fixtureKey),row.id);
    const plan=buildFacilityRepairFixturePlan(row,owners);
    assert.deepEqual(plan.owners,owners);
    assert.equal(plan.reports.filter(report=>report.user_id===owners[1]).length,1);
    assert.ok(plan.events.every(event=>event.actor===null&&plan.reports.some(report=>report.id===event.repair_id)));
  }
  for(const suffix of ['gapped','unavailable','invalid-status'])assert.equal(facilityRepairLiveFixtureKey('facility-repairs:'+suffix),false);
  assert.equal(fixture('empty-owned-list').reports.length,1);
  assert.equal(fixture('latest-blank').events.find(row=>row.repair_id===manifest.reports.primary&&row.version===3).note,'');
  assert.equal(fixture('no-review-event').events.filter(row=>row.repair_id===manifest.reports.primary).length,1);
  assert.throws(()=>buildFacilityRepairFixturePlan(cases[0],[owners[0],owners[0]]),/invalid/u);
});

test('compound case goldens bind the published class at the frozen run time and retain both report facts',()=>{
  const cases=buildLiveFacilityRepairCases({now:'2026-11-16T08:00:00Z'}).filter(row=>row.fixtureKey==='facility-repairs:compound');
  assert.equal(cases.length,2);
  for(const row of cases){
    assert.equal(row.publishedNextClass.next.title,'Digital Learning Basics');
    assert.equal(row.publishedNextClass.next.date,'2026-11-18');
    assert.equal(row.expected.facts[0].label,'A1000001');
    assert.deepEqual(row.expected.requiredTools,['facilityRepairs','courses']);
  }
  const expired=buildLiveFacilityRepairCases({now:'2028-01-01T00:00:00Z'}).filter(row=>row.fixtureKey==='facility-repairs:compound');
  assert.ok(expired.every(row=>row.capability.gap===true&&!row.publishedNextClass));
});

test('exact repair transitions and loss-of-acknowledgment cleanup reconcile both possible commits',async()=>{
  const previous=fixture('latest-note'),next=fixture('latest-blank');
  const first=transactionMock();await first.change({next:previous});
  assert.deepEqual(first.data.reports,previous.reports);
  await first.change({previous,next});assert.deepEqual(first.data.events,next.events);
  await first.verify(next);
  first.data.events[0].payload={unexpected:'field invisible in native API'};
  await assert.rejects(first.verify(next),/database rows differ/u);
  for(const known of [previous,next]){
    const recovery=transactionMock(known);
    await recovery.change({previous,next,recovering:true});
    assert.deepEqual(recovery.data,{reports:[],events:[]});
    assert.equal(recovery.writes.length,known.reports.length);
  }
});

test('wrong identity, occupied report key and unknown event history stop before SQL writes',async()=>{
  const next=fixture('latest-note');
  const badOwner=transactionMock(undefined,identities.map(row=>({...row,runId:owners[0]})));
  await assert.rejects(badOwner.change({next}),/identity/u);assert.equal(badOwner.writes.length,0);
  const collision=transactionMock({reports:[{...next.reports[0],user_id:runId}],events:[]});
  await assert.rejects(collision.change({next}),/belongs to another account/u);assert.equal(collision.writes.length,0);
  const widened=clone(next);widened.reports[0].user_id=runId;
  const rejected=transactionMock();await assert.rejects(rejected.change({next:widened}),/binding changed/u);assert.equal(rejected.writes.length,0);
  const changed=clone(next);changed.events[1].note='Changed after fixture binding';
  const recovery=transactionMock(changed);
  await assert.rejects(recovery.change({previous:next,recovering:true}),/does not match/u);assert.equal(recovery.writes.length,0);
});

const listFields=['id','user_id','building','location','item','status','version','created_at','updated_at'];
function transport(plan,tweak=()=>{}){
  const requests=[];
  const users=owners.map((id,index)=>({id,token:'synthetic-owner-'+index}));
  const fetchImpl=async(url,init)=>{
    const selected=users.find(user=>'Bearer '+user.token===init.headers.Authorization);
    assert.ok(selected);assert.equal(url.pathname,'/api/affairs-data');assert.equal(init.redirect,'error');
    assert.equal(url.searchParams.get('scope'),'facility-repairs');assert.equal(url.searchParams.get('view'),'mine');
    const id=url.searchParams.get('id');requests.push({owner:selected.id,id});
    const reports=plan.reports.filter(row=>row.user_id===selected.id);
    const row=reports.find(item=>item.id===id);
    const status=id&&!row?404:200;
    const body=id?row?{userId:selected.id,detail:clone(row),events:plan.events.filter(event=>event.repair_id===id).map(({version,status,note,occurred_at})=>({version,status,note,occurred_at}))}:{error:'Not found'}:
      {userId:selected.id,page:0,pageSize:25,total:reports.length,rows:reports.map(item=>Object.fromEntries(listFields.map(key=>[key,item[key]])))};
    tweak({body,selected,id});
    return Response.json(body,{status});
  };
  return {requests,read:()=>readFacilityRepairFixtureScopes(plan,users,{origin:'https://stu.best',fetchImpl})};
}

test('native fixture checks both authorized lists, event contents and crossed 404s',async()=>{
  const plan=fixture('latest-note'),mock=transport(plan);
  const read=await mock.read();
  assert.equal(read[owners[0]].detail.length,2);assert.equal(read[owners[1]].detail.length,1);
  assert.ok(mock.requests.some(row=>row.owner===owners[0]&&row.id===manifest.reports.foreign));
  assert.ok(mock.requests.some(row=>row.owner===owners[1]&&row.id===manifest.reports.primary));
  const corrupted=transport(plan,({body,id})=>{if(id===manifest.reports.primary&&body.events)body.events[1].note='replacement';});
  await assert.rejects(corrupted.read(),/fixture-readback/u);
  const disclosed=transport(plan,({body,id,selected})=>{if(id===manifest.reports.foreign&&selected.id===owners[0])body.extraOwner='private';});
  await assert.rejects(disclosed.read(),/fixture-readback/u);
});

test('the live adapter journals both repair plans before writes and rechecks prior to Auth cleanup',async()=>{
  const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
  assert.match(source,/facilityRepairFixture:\s*\{\s*previous:s\.facilityRepairPlan\?\?null,pending:s\.pendingFacilityRepairPlan\?\?null/u);
  assert.match(source,/s\.pendingFacilityRepairPlan=facilityRepairPlan[\s\S]+?await saveLedger\(\)[\s\S]+?await changeFacilityRepairFixtureRows\(tx/u);
  assert.match(source,/await changeFacilityRepairFixtureRows\(s\.sql,\{[^\n]+recovering:true[\s\S]+?auth\.admin\.deleteUser/u);
  assert.equal((source.match(/await currentFacilityRepairFixture\(s,signal\)/gu)||[]).length,2);
});
