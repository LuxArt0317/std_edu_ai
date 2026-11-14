import {readFileSync} from 'node:fs';
import {loadDormitoryConduct} from '../../server/dormitoryConduct.js';
import {fixtureForCase} from './fixtures.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {gradeCase} from './grading.mjs';
import {dormitoryConductFixturePlanManifest,buildDormitoryConductFixturePlan,dormitoryConductLiveFixtureKey,dormitoryConductFixtureReadContract,verifyDormitoryConductFixtureReadback,assertDormitoryConductFixtureIdentities,assertDormitoryConductFixtureRows,reconcileDormitoryConductFixturePlans,assertDormitoryConductFixtureCleanup} from './dormitory-conduct-cases.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {buildDormitoryConductCases,dormitoryConductCaseManifest,dormitoryConductFixtureForCase} from './dormitory-conduct-cases.mjs';
import {readDormitoryConductEvidence} from '../../server/accountDormitoryConductEvidence.js';

test('the independent packet enumerates native notice states without claiming detailed-row or live coverage',()=>{
  const rows=buildDormitoryConductCases();
  assert.equal(rows.length,15);assert.equal(new Set(rows.map(row=>row.id)).size,15);
  assert.deepEqual(dormitoryConductCaseManifest.states,['saved_empty','saved_unknown','missing','read_failed']);
  assert.equal(dormitoryConductCaseManifest.mounted,false);
  assert.ok(rows.every(row=>row.capability.gap===true&&row.capability.limitation.includes('no live fixture')));
  const limits=rows.filter(row=>row.expected.limitation);
  assert.ok(limits.some(row=>row.id.endsWith('details-unavailable')));
  assert.ok(limits.some(row=>row.id.endsWith('empty-not-clearance')));
  assert.ok(limits.some(row=>row.id.endsWith('document-unavailable')));
});

test('all authored cases exercise the actual helper using synthetic own, missing, foreign and failed native inputs',async()=>{
  for(const row of buildDormitoryConductCases()){
    const fixture=dormitoryConductFixtureForCase(row);let calls=0;
    const account=row.anonymous?null:{url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'offline',token:'offline',user:{id:fixture.userId}};
    const result=await readDormitoryConductEvidence(account,{question:row.question,route:row.route,history:row.history},{load:async selected=>{
      calls++;assert.equal(selected.user.id,fixture.userId);
      if(fixture.readFailure)throw Object.assign(new Error('synthetic unavailable'),fixture.readFailure);
      return structuredClone(fixture.nativeResult);
    }});
    const body=JSON.parse(result.evidence.content),golden=row.helperExpected;
    assert.equal(result.readState,golden.readState,row.id);assert.equal(result.reason,golden.reason,row.id);
    assert.equal(body.metadataState,golden.metadataState,row.id);assert.equal(body.record?.result??null,golden.result,row.id);
    assert.equal(calls,golden.readCalls,row.id);
    assert.equal(body.counts.metadataRecords,golden.metadataState==='saved'?1:golden.metadataState==='missing'?0:null,row.id);
    assert.equal(body.capability.detailedEntries,false);assert.equal(body.capability.document,false);assert.equal(body.capability.officialClearance,false);
    assert.deepEqual(result.evidence.urls,[dormitoryConductCaseManifest.path]);
    assert.doesNotMatch(result.evidence.content,/E-305-2|8500|23000|d3400000|"(?:userId|version)"\s*:/u);
  }
});

test('compound questions retain independently authored housing and tuition prerequisites without crediting the dorm notice for them',()=>{
  const rows=buildDormitoryConductCases(),housing=rows.find(row=>row.id.endsWith('mixed-housing')),tuition=rows.find(row=>row.id.endsWith('mixed-tuition'));
  assert.deepEqual(housing.expected.requiredTools,['dormitoryConduct','housing']);
  assert.deepEqual(tuition.expected.requiredTools,['dormitoryConduct','charges']);
  assert.deepEqual(housing.expected.facts.at(-1),{label:'housing fee',kind:'number',values:[8500]});
  assert.deepEqual(tuition.expected.facts.at(-1),{label:'tuition balance',kind:'number',values:[23000]});
  for(const row of [housing,tuition]){
    const fixture=dormitoryConductFixtureForCase(row);
    assert.equal(fixture.additionalSourcesPrepared,false);assert.equal(fixture.additionalFacts.length,row.mixedScope.facts.length);
    assert.deepEqual(Object.keys(fixture.nativeResult),['snapshot']);
    assert.deepEqual(Object.keys(fixture.nativeResult.snapshot).sort(),['result','sourceMode','userId','version']);
  }
});

test('fixtures are fresh and reject ambiguous owner or unknown-family inputs',()=>{
  const row=buildDormitoryConductCases()[0],one=dormitoryConductFixtureForCase(row),two=dormitoryConductFixtureForCase(row);
  one.nativeResult.snapshot.result='unknown';assert.equal(two.nativeResult.snapshot.result,'empty');
  assert.throws(()=>dormitoryConductFixtureForCase(row,{userId:dormitoryConductCaseManifest.owners.A,foreignUserId:dormitoryConductCaseManifest.owners.A}),/distinct/u);
  assert.throws(()=>dormitoryConductFixtureForCase(row,{userId:{toString:()=>dormitoryConductCaseManifest.owners.A}}),/distinct/u);
  assert.throws(()=>dormitoryConductFixtureForCase({fixtureKey:'housing'}),/Unsupported/u);
});


const runId='d3400000-0000-4000-8000-000000000010';
const bindings={runId,owners:Object.fromEntries(['A','B'].map(role=>[role,{id:dormitoryConductCaseManifest.owners[role],email:'dorm-'+role.toLowerCase()+'@example.invalid',runMarker:runId}]))};
const planFor=fixtureKey=>buildDormitoryConductFixturePlan({...bindings,fixtureKey});
const notice='affairs_dormitory_conduct',operations='private.affairs_dormitory_conduct_operations';
const identities=()=>structuredClone(Object.values(bindings.owners));
const emptyRows=()=>({[notice]:[],[operations]:[]});
const remaining=()=>Object.fromEntries([notice,operations].map(table=>[table,Object.values(bindings.owners).map(owner=>({userId:owner.id,count:0}))]));

test('two-owner plans are deterministic, disjoint across families, and preserve literal states instead of populated conduct rows',()=>{
  const plans=dormitoryConductFixturePlanManifest.families.map(planFor);
  assert.deepEqual(plans.map(plan=>Object.values(plan.expectedByOwner).map(value=>value.snapshot?.result??null)),[['empty','unknown'],['unknown','empty'],[null,'unknown']]);
  assert.deepEqual(plans.map(plan=>plan.rows[notice].length),[2,2,1]);
  assert.equal(new Set(plans.flatMap(plan=>plan.recordIds)).size,5);
  for(const plan of plans){
    assert.deepEqual(plan,planFor(plan.fixtureKey));assert.equal(assertDormitoryConductFixtureIdentities(plan,identities()),true);
    assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.rows[notice][0]));
    assert.equal(plan.setup[0].kind,'persist-intent');
    assert.ok(plan.setup.findIndex(step=>step.kind==='assert-owned-identities')<plan.setup.findIndex(step=>step.kind==='insert-exact-rows'));
    assert.deepEqual(plan.cleanup.map(step=>step.kind),['assert-owned-identities','reconcile-recorded-plans-or-empty','delete-exact-rows','verify-owned-tables-empty','return-to-existing-auth-cleanup']);
    assert.deepEqual(plan.rows[operations],[]);
  }
  for(const key of ['dormitoryConduct:failed','dormitoryConduct:foreign','housing']){
    assert.equal(dormitoryConductLiveFixtureKey(key),false);assert.throws(()=>planFor(key),/invalid_plan/u);
  }
});

test('the committed migration independently validates the exact row and cleanup dependency contract',()=>{
  const sql=readFileSync(new URL('../../supabase/migrations/20261112220000_dormitory_conduct.sql',import.meta.url),'utf8');
  const create=/create table public\.affairs_dormitory_conduct \(([\s\S]*?)\n\);/u.exec(sql)?.[1];
  assert.ok(create);
  assert.deepEqual([...create.matchAll(/^  (\w+) (?:uuid|text|integer|timestamptz)/gmu)].map(match=>match[1]).sort(),dormitoryConductFixturePlanManifest.rawFields.toSorted());
  assert.match(sql,/check\(result in \('empty','unknown'\)\)/u);
  assert.match(sql,/default 'local_demo' check\(source_mode='local_demo'\)/u);
  assert.match(sql,/version between 1 and 999999999/u);
  assert.match(sql,/unique index affairs_dormitory_conduct_active_owner_idx[\s\S]*where deleted_at is null/u);
  assert.match(sql,/references public\.affairs_profiles\(user_id\) on delete cascade/u);
  assert.match(sql,/grant select on public\.affairs_dormitory_conduct to authenticated/u);
  assert.doesNotMatch(sql,/grant (?:insert|update|delete|all) on public\.affairs_dormitory_conduct to authenticated/iu);
  assert.match(sql,/create table private\.affairs_dormitory_conduct_operations \([\s\S]*user_id uuid not null references public\.affairs_profiles\(user_id\) on delete cascade/u);
});

test('native own GETs for both users match exact authored projections and never accept caller-selecting query fields',async()=>{
  const previousFetch=globalThis.fetch;
  try{
    for(const key of dormitoryConductFixturePlanManifest.families){
      const plan=planFor(key);
      for(const role of ['A','B']){
        const contract=dormitoryConductFixtureReadContract(plan,{role});let calls=0;
        assert.deepEqual(contract.query,{scope:'dormitory-conduct'});assert.equal(contract.path,'/api/affairs-data');
        globalThis.fetch=async(input,options)=>{
          calls++;const url=new URL(String(input));
          assert.equal(url.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');assert.equal(url.pathname,'/rest/v1/'+notice);
          assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);
          assert.equal(new Headers(options.headers).get('Authorization'),'Bearer offline-'+role);
          assert.deepEqual(Object.fromEntries(url.searchParams),contract.native.query);
          return Response.json(plan.rows[notice].filter(row=>row.user_id===contract.ownerId));
        };
        const actual=await loadDormitoryConduct({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'offline',token:'offline-'+role,user:{id:contract.ownerId}});
        assert.equal(calls,1);assert.equal(verifyDormitoryConductFixtureReadback(plan,{role},actual),true);
        assert.deepEqual(actual,contract.expected);
        assert.throws(()=>dormitoryConductFixtureReadContract(plan,{role,user_id:bindings.owners.B.id}),/invalid_request/u);
        assert.throws(()=>verifyDormitoryConductFixtureReadback(plan,{role},{...actual,records:[]}),/readback_mismatch/u);
        if(actual.snapshot){
          assert.throws(()=>verifyDormitoryConductFixtureReadback(plan,{role},{snapshot:{...actual.snapshot,userId:bindings.owners[role==='A'?'B':'A'].id}}),/readback_mismatch/u);
          assert.throws(()=>verifyDormitoryConductFixtureReadback(plan,{role},{snapshot:{...actual.snapshot,sourceMode:'official'}}),/readback_mismatch/u);
        }else assert.throws(()=>verifyDormitoryConductFixtureReadback(plan,{role},{snapshot:{userId:contract.ownerId,sourceMode:'local_demo',version:3,result:'empty'}}),/readback_mismatch/u);
      }
    }
  }finally{globalThis.fetch=previousFetch;}
});

test('canonical SQL proof accepts only exact planned instants and rows, including no unexpected operations or tombstones',()=>{
  const plan=planFor('dormitoryConduct:empty');
  for(const instant of ['2026-11-14T00:00:00+00:00','2026-11-14T08:00:00.000000+08:00',new Date('2026-11-14T00:00:00Z')]){
    const actual=structuredClone(plan.rows);actual[notice][0].created_at=instant;actual[notice][0].updated_at=instant;
    assert.equal(assertDormitoryConductFixtureRows(plan,actual),true);
  }
  for(const patch of [{result:'unknown'},{version:4},{user_id:bindings.owners.B.id},{deleted_at:'2026-11-14T00:00:00Z'},
    {created_at:'2026-11-14T00:00:01Z'},{updated_at:'2026-11-14T00:00:00.000001Z'},{admin:true},{id:{toString(){throw Error('must not coerce');}}}]){
    const actual=structuredClone(plan.rows);Object.assign(actual[notice][0],patch);
    assert.throws(()=>assertDormitoryConductFixtureRows(plan,actual),/fixture_rows_mismatch/u);
  }
  const receipt=structuredClone(plan.rows);receipt[operations].push({user_id:bindings.owners.A.id});
  assert.throws(()=>assertDormitoryConductFixtureRows(plan,receipt),/fixture_rows_mismatch/u);
  const extra=structuredClone(plan.rows);extra[notice].push({...extra[notice][0],id:'d3400000-0000-4000-8000-000000000099'});
  assert.throws(()=>assertDormitoryConductFixtureRows(plan,extra),/fixture_rows_mismatch/u);
});

test('uncertain transitions reconcile whole old/new/empty states and reject partial mixtures before cleanup',()=>{
  const previous=planFor('dormitoryConduct:empty'),next=planFor('dormitoryConduct:unknown');
  for(const [state,actual] of [['previous',previous.rows],['next',next.rows],['empty',emptyRows()]]){
    const result=reconcileDormitoryConductFixturePlans({previous,next,actual});
    assert.equal(result.state,state);assert.equal(result.deleteTargets.length,state==='empty'?0:2);
    assert.ok(result.deleteTargets.every(row=>row.table===notice&&[bindings.owners.A.id,bindings.owners.B.id].includes(row.userId)));
  }
  for(const rows of [[previous.rows[notice][0]],[previous.rows[notice][0],next.rows[notice][1]]]){
    assert.throws(()=>reconcileDormitoryConductFixturePlans({previous,next,actual:{[notice]:rows,[operations]:[]}}),/fixture_rows_mismatch/u);
  }
  const altered=structuredClone(next);altered.rows[notice][0].result='empty';
  assert.throws(()=>reconcileDormitoryConductFixturePlans({previous,next:altered,actual:emptyRows()}),/invalid_plan/u);
});

test('cleanup requires both exact recorded identities and explicit zero row counts for both dependent tables',()=>{
  const plan=planFor('dormitoryConduct:empty'),proof={identities:identities(),remainingByTable:remaining()};
  assert.equal(assertDormitoryConductFixtureCleanup(plan,proof),true);
  const invalidIdentity=structuredClone(proof);invalidIdentity.identities[1].runMarker='d3400000-0000-4000-8000-000000000099';
  assert.throws(()=>assertDormitoryConductFixtureCleanup(plan,invalidIdentity),/fixture_identity_mismatch/u);
  for(const table of [notice,operations]){
    for(const count of [1,'0',-1]){
      const invalid=structuredClone(proof);invalid.remainingByTable[table][1].count=count;
      assert.throws(()=>assertDormitoryConductFixtureCleanup(plan,invalid),/fixture_rows_remain/u);
    }
    const missingOwner=structuredClone(proof);missingOwner.remainingByTable[table].pop();
    assert.throws(()=>assertDormitoryConductFixtureCleanup(plan,missingOwner),/fixture_rows_remain/u);
  }
});

test('compound prerequisites bind existing shared fixture selectors to independent literal bed, fee and balance facts',()=>{
  for(const row of buildDormitoryConductCases().filter(row=>row.mixedScope)){
    assert.deepEqual(row.additionalFixtureSelectors,[row.mixedScope.tool]);
    const snapshot=fixtureForCase({fixtureKey:row.additionalFixtureSelectors[0]},{userId:bindings.owners.A.id,now:'2026-11-14T00:00:00Z'});
    if(row.mixedScope.tool==='housing'){
      const own=snapshot.housing.assignments.filter(value=>value.userId===bindings.owners.A.id);
      assert.equal(own.length,1);assert.equal(own[0].bedNumber,'E-305-2');assert.equal(own[0].accommodationFee,8500);
    }else{
      const tuition=snapshot.charges.find(value=>value.label==='Tuition instalment A');
      assert.equal(tuition.amountDue,28000);assert.equal(tuition.amountPaid,5000);assert.equal(tuition.amountDue-tuition.amountPaid,23000);
    }
  }
});


test('the live housing question accepts a natural label with the exact bed and fee',()=>{
  const row=buildAccountCases().find(item=>item.id==='account:dormitory-conduct-mixed-housing');
  const digest='a'.repeat(64);
  const events=['dormitoryConduct','housing'].flatMap(tool=>[
    {kind:'account-read:'+tool+':1',status:'running'},
    {kind:'account-read:'+tool+':1',status:'complete'},
  ]);
  const answer='Saved local_demo dormitory-conduct result: unknown.\nRecorded beds: E-305-2, accommodation fee NT$8500.';
  const envelope={statusCode:200,execution:'recorded',fixtureKey:row.fixtureKey,events,
    stateBefore:{ownedRecordsDigest:digest},stateAfterProposal:{ownedRecordsDigest:digest},fixtureReadback:{verified:true,independentGolden:true},
    body:{answer,citations:[{url:'/school-affairs/services/34-1'},{url:'/school-affairs/services/34-2'}],
      status:'answered',verification:{status:'verified',attempts:1}}};
  assert.deepEqual(gradeCase(row,envelope).failures,[]);
  envelope.body.answer=answer.replace('E-305-2','FOREIGN-BED');
  assert.deepEqual(gradeCase(row,envelope).failures.map(item=>item.id),['fact.1']);
  envelope.body.answer=answer.replace('8500','85000');
  assert.deepEqual(gradeCase(row,envelope).failures.map(item=>item.id),['fact.2']);
});
