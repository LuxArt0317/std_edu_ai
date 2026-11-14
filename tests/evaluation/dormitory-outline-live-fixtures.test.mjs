import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  changeDormitoryFixtureRows,changeOutlineFixtureRows,readDormitoryFixtureScopes,readOutlineFixtureScopes,
} from './live-fixtures.mjs';
import {buildDormitoryConductFixturePlan} from './dormitory-conduct-cases.mjs';
import {planPublishedOutlineAccess} from './elearning-outline-fixtures.mjs';

const runId='b4120000-0000-4000-8000-000000000002';
const ownerIds=['b4120000-0000-4000-8000-000000000010','b4120000-0000-4000-8000-000000000020'];
const owners=Object.fromEntries(ownerIds.map((id,index)=>[index?'B':'A',{id,email:`assistant-eval-${runId}-${index?'other':'student'}@example.invalid`,runMarker:runId}]));
const identities=Object.values(owners).map(({id,email})=>({id,email,runId,state:'created'}));
const users=ownerIds.map((id,index)=>({id,token:'offline-owner-'+index}));
const dorm=fixtureKey=>buildDormitoryConductFixturePlan({runId,owners,fixtureKey});
const outline=fixtureKey=>planPublishedOutlineAccess(ownerIds,fixtureKey);
const origin='https://synthetic.invalid';
const dormitory='affairs_dormitory_conduct',access='elearning_course_access';

function database({notices=[],accessRows=[],operations=[],auths=identities}={}){
  const writes=[];
  const sql=(parts,...values)=>{
    if(!Array.isArray(parts)||!Object.hasOwn(parts,'raw'))return parts;
    const query=parts.join('?');
    if(query.includes('from auth.users')){
      return auths.filter(row=>values[0].includes(row.id)).map(({id,email,runId:marker})=>({id,email,...(query.includes('"runMarker"')?{runMarker:marker}:{run_id:marker})}));
    }
    if(query.includes('from private.affairs_dormitory_conduct_operations'))return operations.filter(row=>values[0].includes(row.user_id));
    const table=query.includes(dormitory)?dormitory:query.includes(access)?access:null;
    assert.ok(table,query);
    const rows=table===dormitory?notices:accessRows;
    if(query.startsWith('select'))return rows.filter(row=>values[0].includes(row.user_id)||values[1]?.includes(row.id));
    writes.push(query);
    if(query.startsWith('insert'))rows.push(...structuredClone(values[0]));
    else if(query.startsWith('delete')){
      const at=rows.findIndex(row=>table===dormitory?row.id===values[0]&&row.user_id===values[1]:row.user_id===values[0]&&row.course_id===values[1]);
      assert.notEqual(at,-1);rows.splice(at,1);
    }else assert.fail(query);
    return [];
  };
  return {sql,writes,notices,accessRows};
}

test('outline access transitions preserve external rows and reconcile either acknowledged state',async()=>{
  const first=outline('elearningOutline:videos'),next=outline('elearningOutline:slides');
  const unrelated={user_id:runId,course_id:9408,created_at:first[0].created_at};
  for(const committed of [first,next]){
    const db=database({accessRows:[unrelated]});
    await changeOutlineFixtureRows(db.sql,{next:first,identities,runId});
    if(committed===next)await changeOutlineFixtureRows(db.sql,{previous:first,next,identities,runId});
    assert.deepEqual(db.accessRows,[unrelated,...committed]);
    await changeOutlineFixtureRows(db.sql,{previous:first,next,identities,runId,recovering:true});
    assert.deepEqual(db.accessRows,[unrelated]);
  }
  const unexpected=database({accessRows:[{...first[0],course_id:9718}]});
  await assert.rejects(changeOutlineFixtureRows(unexpected.sql,{previous:first,next,identities,runId,recovering:true}),/could not be reconciled/u);
  assert.deepEqual(unexpected.writes,[]);
  const foreign=database({auths:identities.slice(0,1)});
  await assert.rejects(changeOutlineFixtureRows(foreign.sql,{next:first,identities,runId}),/could not be verified/u);
  assert.deepEqual(foreign.writes,[]);
});

test('dormitory notice transitions distinguish missing and saved empty with exact operation and collision checks',async()=>{
  const first=dorm('dormitoryConduct:empty'),next=dorm('dormitoryConduct:missing');
  assert.equal(first.rows[dormitory].length,2);assert.equal(next.rows[dormitory].length,1);
  for(const committed of [first,next]){
    const db=database();
    await changeDormitoryFixtureRows(db.sql,{next:first,identities,runId});
    if(committed===next)await changeDormitoryFixtureRows(db.sql,{previous:first,next,identities,runId});
    assert.deepEqual(db.notices,committed.rows[dormitory]);
    await changeDormitoryFixtureRows(db.sql,{previous:first,next,identities,runId,recovering:true});
    assert.deepEqual(db.notices,[]);
  }
  for(const pending of [
    database({notices:[{...first.rows[dormitory][0],user_id:runId}]}),
    database({notices:[{...first.rows[dormitory][0],deleted_at:first.rows[dormitory][0].updated_at}]}),
    database({operations:[{user_id:owners.A.id,request_id:runId}]}),
  ]){
    await assert.rejects(changeDormitoryFixtureRows(pending.sql,{next:first,identities,runId}),/fixture_rows_mismatch/u);
    assert.deepEqual(pending.writes,[]);
  }
});

test('both caller JWTs and crossed outline reads are checked against literal committed records',async()=>{
  const plan=outline('elearningOutline:videos'),observed=[];
  const seeds=await readFile(new URL('../../supabase/migrations/20261115030000_elearning_course_outlines.sql',import.meta.url),'utf8');
  const source=Array.from(seeds.matchAll(/^\s*\((\d+),(\d+),(\d+),(\d+),'(url|attendanceregister)','([^']+)'\)[,;]$/gmu));
  const payload=(owner,course)=>{
    const sections=plan.some(row=>row.user_id===owner&&row.course_id===course)
      ?[...new Set(source.filter(row=>Number(row[2])===course).map(row=>Number(row[3])))].map(position=>({
        position,title:position===1?'課程主題':'課程回饋',activities:source.filter(row=>Number(row[2])===course&&Number(row[3])===position).map(row=>({
          id:Number(row[1]),kind:row[5],title:row[6],purpose:row[5]==='attendanceregister'?'attendance':position===2?'feedback':[281284,281285].includes(Number(row[1]))?'slides':'video',
        })),
      })):[];
    return {userId:owner,courseId:course,sections};
  };
  const reader=async(url,options)=>{
    assert.equal(url.origin,origin);assert.equal(url.pathname,'/api/affairs-data');assert.equal(options.redirect,'error');
    assert.deepEqual([...url.searchParams.keys()],['scope','course']);
    assert.equal(url.searchParams.get('scope'),'elearning-course-outline');
    const owner=users.find(user=>'Bearer '+user.token===options.headers.Authorization)?.id;
    const course=Number(url.searchParams.get('course'));observed.push([owner,course]);
    return Response.json(payload(owner,course));
  };
  const proof=await readOutlineFixtureScopes(plan,users,{origin,fetchImpl:reader});
  assert.deepEqual(observed,ownerIds.flatMap(owner=>[9408,9098].map(course=>[owner,course])));
  assert.equal(proof[ownerIds[0]][9408].sections[0].activities.length,5);
  assert.deepEqual(proof[ownerIds[0]][9098].sections,[]);
  assert.deepEqual(proof[ownerIds[1]][9408].sections,[]);
  await assert.rejects(readOutlineFixtureScopes(plan,users,{origin,fetchImpl:async()=>Response.json(payload(ownerIds[1],9098))}),/crossed access/u);
});

test('dormitory readback transmits the personal scope only and rejects wrong owner or ambiguous null',async()=>{
  const plan=dorm('dormitoryConduct:missing'),calls=[];
  const proof=await readDormitoryFixtureScopes(plan,users,{origin,fetchImpl:async(url,options)=>{
    const owner=users.find(user=>'Bearer '+user.token===options.headers.Authorization)?.id;
    calls.push(owner);assert.equal(options.method,'GET');
    assert.equal(url.href,origin+'/api/affairs-data?scope=dormitory-conduct');
    return Response.json(plan.expectedByOwner[owner]);
  }});
  assert.deepEqual(calls,ownerIds);assert.deepEqual(proof,plan.expectedByOwner);
  await assert.rejects(readDormitoryFixtureScopes(plan,users,{origin,fetchImpl:async()=>Response.json(plan.expectedByOwner[ownerIds[1]])}),/did not match/u);
});
