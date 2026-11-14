import assert from 'node:assert/strict';
import {test} from 'node:test';
import {elearningFixtureManifest,elearningFixturePlan,verifyElearningFixtureWorkspace} from './elearning-fixtures.mjs';
import {changeElearningFixtureRows,readElearningFixtureScopes,reconcileElearningFixtureRows} from './live-fixtures.mjs';
import {EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';

const owners=[EVAL_USER_ID,EVAL_OTHER_USER_ID],runId=evalId(906);
const identities=owners.map((id,index)=>({id,email:'test-'+index+'@example.invalid',runId,state:'created'}));
const {courseA,courseB,joinedAt}=elearningFixtureManifest;
const origin='https://synthetic.invalid';
const full=elearningFixturePlan('elearningEnrollments',owners),empty=elearningFixturePlan('empty:elearningEnrollments',owners);

function database({auths=identities.map(item=>({id:item.id,email:item.email,run_id:item.runId})),catalog=[courseA,courseB],rows=[]}={}){
  const mutations=[];
  const sql=(parts,...values)=>{
    if(!Array.isArray(parts)||!Object.hasOwn(parts,'raw'))return parts;
    const query=parts.join('?');
    if(query.includes('from auth.users'))return auths.filter(row=>values[0].includes(row.id));
    if(query.includes('from public.elearning_courses'))return catalog.filter(row=>values[0].includes(row.id));
    if(query.startsWith('select user_id'))return rows.filter(row=>values[0].includes(row.user_id));
    mutations.push(query);
    if(query.startsWith('insert into public.elearning_enrollments'))rows.push(...structuredClone(values[0]));
    else if(query.startsWith('delete from public.elearning_enrollments')){
      const index=rows.findIndex(row=>row.user_id===values[0]&&row.course_id===values[1]);
      assert.ok(index>=0);rows.splice(index,1);
    }else assert.fail('Unexpected write: '+query);
    return [];
  };
  return {sql,rows,mutations};
}

test('fixture plan verifies exact published sources and only its disposable composite enrollment keys',async()=>{
  const extra={user_id:evalId(807),course_id:courseA.id,joined_at:joinedAt};
  const {sql,rows}=database({rows:[extra]});
  await changeElearningFixtureRows(sql,{previous:null,next:full,identities,runId});
  await changeElearningFixtureRows(sql,{previous:full,next:empty,identities,runId});
  assert.deepEqual(rows,[extra,...empty.rows]);
  await reconcileElearningFixtureRows(sql,{previous:full,pending:empty,identities,runId});
  assert.deepEqual(rows,[extra]);
  for(const parameters of [{catalog:[{...courseA,title:'Different'},courseB]},{auths:[]}]) {
    const unavailable=database(parameters);
    await assert.rejects(changeElearningFixtureRows(unavailable.sql,{next:full,identities,runId}));
    assert.deepEqual(unavailable.mutations,[]);
  }
  const unknown=database({rows:[{...full.rows[0],course_id:10}]});
  await assert.rejects(reconcileElearningFixtureRows(unknown.sql,{previous:full,pending:empty,identities,runId}),/could not be reconciled/);
  assert.deepEqual(unknown.mutations,[]);
});

test('caller workspace readback verifies exact enrollment facts, complete owned rows and distinct foreign course',async()=>{
  const users=owners.map((id,index)=>({id,token:'fixture-'+index}));
  const payload=owner=>({userId:owner,courses:[courseA,courseB],
    enrollments:full.rows.filter(row=>row.user_id===owner).map(row=>({courseId:row.course_id,joinedAt:row.joined_at})),
  });
  const requests=[];
  const result=await readElearningFixtureScopes(full,users,{origin,fetchImpl:async(url,options)=>{
    assert.equal(url.href,origin+'/api/affairs-data?scope=elearning-workspace');
    assert.equal(options.redirect,'error');
    const index=Number(options.headers.Authorization.at(-1));requests.push(index);
    return Response.json(payload(owners[index]));
  }});
  assert.deepEqual(requests,[0,1]);
  assert.equal(result[owners[0]].enrollments[0].title,courseA.title);
  assert.equal(result[owners[1]].enrollments[0].title,courseB.title);
  assert.throws(()=>verifyElearningFixtureWorkspace(full,owners[0],payload(owners[1])),/does not match the caller/);
  const tampered=payload(owners[0]);tampered.enrollments[0].joinedAt='2026-11-14T00:00:00.000001Z';
  assert.throws(()=>verifyElearningFixtureWorkspace(full,owners[0],tampered),/facts differ/);
});
