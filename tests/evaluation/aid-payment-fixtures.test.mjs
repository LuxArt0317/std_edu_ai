import assert from 'node:assert/strict';
import {test} from 'node:test';
import {aidPaymentFixtureReadContract,buildAidPaymentFixturePlan} from './aid-payment-fixture-plan.mjs';
import {readAidFixtureScopes,removeAidFixtureRows,replaceAidFixtureRows} from './live-fixtures.mjs';
import {fixtureForCase} from './fixtures.mjs';

const runId='10000000-0000-4000-8000-000000000001';
const owners={
  A:{id:'20000000-0000-4000-8000-000000000001',email:'student@example.invalid',runMarker:runId},
  B:{id:'20000000-0000-4000-8000-000000000002',email:'other@example.invalid',runMarker:runId},
};
const plan=(fixtureKey='aidPayments')=>buildAidPaymentFixturePlan({runId,owners,fixtureKey});
const origin='http://127.0.0.1:5191';
function fakeSql(identityRows=Object.values(owners)){
  const rows=new Map(Object.values(plan().tables).map(name=>['public.'+name,[]])),writes=[];
  const sql=(parts,...args)=>{
    if(!Array.isArray(parts)||!Object.hasOwn(parts,'raw'))return parts;
    return execute(parts,...args);
  };
  async function execute(parts,...args){
    const command=parts[0];
    if(command.includes('from auth.users'))return identityRows.filter(owner=>args[0].includes(owner.id));
    const [table,selector,owner]=args;
    assert.ok(rows.has(table));
    if(command.startsWith('select'))return rows.get(table).filter(row=>selector.includes(row.user_id)).map(({id,user_id})=>({id,user_id}));
    if(command.startsWith('insert')){
      writes.push(['insert',table,structuredClone(selector)]);
      rows.get(table).push(...structuredClone(selector));
    }else if(command.startsWith('delete')){
      writes.push(['delete',table,selector,owner]);
      rows.set(table,rows.get(table).filter(row=>row.id!==selector||row.user_id!==owner));
    }else assert.fail('Unexpected SQL query');
  }
  return {sql,rows,writes};
}

test('aid fixture transitions delete exact known rows only and retain unrelated student rows',async()=>{
  const initial=plan(),empty=plan('empty:aidPayments'),{sql,rows,writes}=fakeSql();
  const unrelated={id:'70000000-0000-4000-8000-000000000001',user_id:'70000000-0000-4000-8000-000000000002'};
  rows.get('public.'+initial.tables.salary).push(unrelated);
  await replaceAidFixtureRows(sql,null,initial);
  await replaceAidFixtureRows(sql,initial,empty);
  await replaceAidFixtureRows(sql,empty,null);
  assert.deepEqual(rows.get('public.'+initial.tables.salary),[unrelated]);
  assert.equal(rows.get('public.'+initial.tables.claims).length,0);
  assert.ok(writes.filter(([kind])=>kind==='delete').every(([, ,id,owner])=>initial.recordIds.includes(id)&&Object.values(owners).some(value=>value.id===owner)));
});

test('owner mismatch or an unmatched owned record prevents any deletion or placement',async()=>{
  const active=plan();
  const bad=fakeSql([{...owners.A,runMarker:'different'},owners.B]);
  await assert.rejects(replaceAidFixtureRows(bad.sql,null,active),/fixture_identity_mismatch/);
  assert.deepEqual(bad.writes,[]);
  const exact=fakeSql();
  await replaceAidFixtureRows(exact.sql,null,active);
  const before=exact.writes.length;
  exact.rows.get('public.'+active.tables.claims).push({id:'unplanned',user_id:owners.A.id});
  await assert.rejects(replaceAidFixtureRows(exact.sql,active,null),/fixture_rows_mismatch/);
  assert.equal(exact.writes.length,before);
});

test('uncertain transaction reconciles either complete plan and refuses a partial state',async()=>{
  const initial=plan(),pending=plan('empty:aidPayments');
  for(const observed of [null,initial,pending]){
    const {sql,rows}=fakeSql();
    await replaceAidFixtureRows(sql,null,observed);
    await removeAidFixtureRows(sql,{plan:initial,pending});
    assert.ok([...rows.values()].every(table=>!table.length));
  }
  const partial=fakeSql();
  await replaceAidFixtureRows(partial.sql,null,initial);
  partial.rows.get('public.'+initial.tables.salary).pop();
  const before=partial.writes.length;
  await assert.rejects(removeAidFixtureRows(partial.sql,{plan:initial,pending}),/ownership could not be reconciled/);
  assert.equal(partial.writes.length,before);
});

test('authenticated readback uses eight exact own-view requests and rejects a foreign response',async()=>{
  const active=plan('empty:aidPayments'),users=Object.entries(owners).map(([role,owner])=>({id:owner.id,token:'test-'+role}));
  const calls=[];
  const fetchImpl=async(input,init)=>{
    const url=new URL(input),role=init.headers.Authorization.at(-1),view=url.searchParams.get('view'),summary=url.searchParams.has('summary');
    const contract=aidPaymentFixtureReadContract(active,{role,view,page:1,summary});
    assert.equal(url.origin,origin);assert.equal(url.pathname,contract.path);assert.equal(init.method,'GET');
    assert.deepEqual(Object.fromEntries(url.searchParams),contract.query);assert.equal(init.redirect,'error');
    calls.push({role,view,summary});
    return Response.json(contract.expected);
  };
  const result=await readAidFixtureScopes(active,users,{origin,fetchImpl});
  assert.equal(calls.length,8);
  assert.deepEqual(result[owners.A.id].salary.rows,[]);
  assert.equal(result[owners.B.id].salary.rows[0].net,9901);
  assert.equal(result[owners.B.id].salarySummary.total,1);
  await assert.rejects(readAidFixtureScopes(active,users,{origin,fetchImpl:async()=>Response.json(active.expectedByOwner[owners.B.id].salary)}),/fixture-readback/);
  for(const key of ['aidPayments','empty:aidPayments'])assert.ok(fixtureForCase(key).profile.userId);
});
