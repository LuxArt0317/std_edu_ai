import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

// Pure, unmounted plan. This module performs no SQL, HTTP, credential reads or
// identity creation. A live adapter must independently prove fresh identities,
// protected-owner preservation, durable intent, transaction and exact cleanup.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const clone=value=>structuredClone(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const views=['claims','salary'],roles=['A','B'];
const tables={claims:'affairs_aid_payment_claims',salary:'affairs_aid_salary_records'};
const fields={claims:['reason','amount','approval_result','approval_status'],salary:['appointment_type','payment_period','rate','work_units','gross','employer_labor','employer_health',
  'employer_pension','employer_supplement','subtotal','student_labor','student_health','student_pension','student_supplement','tax','net','bank_last4']};
const salary=values=>({...Object.fromEntries(fields.salary.map(field=>[field,null])),...values});
export const aidPaymentFixtureManifest=freeze({
  version:1,sourceMigration:'20261115050000_student_aid_payments.sql',tables:{...tables},fields:clone(fields),
  families:['aidPayments','empty:aidPayments','browser:aidPayments'],
  A:{claims:[{reason:'Library work-study materials',amount:1200,approval_result:null,approval_status:'Waiting for local unit review'}],salary:[
    salary({appointment_type:'Local student assistant',payment_period:'2026-09 local period',rate:200,work_units:27,gross:5800,student_labor:0,tax:0,net:5400,bank_last4:'0101'}),
    salary({appointment_type:'Local research assistant',payment_period:'2026-10 local period',rate:null,work_units:31,gross:null,tax:null,net:6200,bank_last4:null}),
  ]},
  B:{claims:[{reason:'FOREIGN AID CLAIM',amount:8800,approval_result:'FOREIGN RESULT',approval_status:'FOREIGN STATUS'}],salary:[
    salary({appointment_type:'FOREIGN APPOINTMENT',payment_period:'FOREIGN AID PERIOD',rate:19,work_units:7,gross:9909,student_labor:-3,tax:9,net:9901,bank_last4:'9090'}),
  ]},
  boundaries:['Amounts are independent literal numeric fields; no currency or paid-bank status is established.',
    'Graph positive uses both owners positive; graph empty uses A empty and B positive; browser baseline uses B claims empty only.',
    'This plan does not create identities, grant permissions, authorize deployment or establish that supplied identities are disposable.'],
});
const reasons=new Set(['invalid_owners','invalid_plan','invalid_request','fixture_identity_mismatch','fixture_rows_mismatch','fixture_rows_remain','readback_mismatch']);
const fail=reason=>{const safe=reasons.has(reason)?reason:'invalid_plan';throw Object.assign(new Error('Aid payment fixture '+safe+'.'),{name:'AidPaymentFixturePlanError',code:safe});};
const requireValue=(condition,reason)=>{if(!condition)fail(reason);};

export function validateAidPaymentFixtureOwners(input){
  requireValue(exact(input,['runId','owners'])&&uuid(input.runId)&&exact(input.owners,roles),'invalid_owners');
  const ids=[],emails=[];
  for(const role of roles){const owner=input.owners[role];
    requireValue(exact(owner,['id','email','runMarker'])&&uuid(owner.id)&&owner.id!==input.runId&&owner.runMarker===input.runId
      &&typeof owner.email==='string'&&owner.email.length<=254&&/^[a-z0-9][a-z0-9._+-]{0,230}@example\.invalid$/u.test(owner.email),'invalid_owners');
    ids.push(owner.id);emails.push(owner.email);
  }
  requireValue(new Set(ids).size===2&&new Set(emails).size===2,'invalid_owners');
  return freeze(clone(input));
}
function recordId(runId,ownerId,view,position){
  const hash=createHash('sha256').update(JSON.stringify(['aid-payment-fixture-v1',runId,ownerId,view,position])).digest('hex');
  return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
}
function build(input){
  requireValue(plain(input)&&exact(input,Object.hasOwn(input,'fixtureKey')?['runId','owners','fixtureKey']:['runId','owners']),'invalid_plan');
  const fixtureKey=input.fixtureKey??'aidPayments';
  requireValue(aidPaymentFixtureManifest.families.includes(fixtureKey),'invalid_plan');
  const receipt=validateAidPaymentFixtureOwners({runId:input.runId,owners:input.owners}),rows=Object.fromEntries(views.map(view=>[tables[view],[]])),expectedByOwner={};
  for(const role of roles){const owner=receipt.owners[role];expectedByOwner[owner.id]={};
    for(const view of views){
      const empty=fixtureKey==='empty:aidPayments'&&role==='A'||fixtureKey==='browser:aidPayments'&&role==='B'&&view==='claims';
      const values=empty?[]:aidPaymentFixtureManifest[role][view];
      const records=values.map((row,index)=>({id:recordId(receipt.runId,owner.id,view,index+1),user_id:owner.id,position:index+1,...clone(row)}));
      rows[tables[view]].push(...records);
      expectedByOwner[owner.id][view]={userId:owner.id,view,total:records.length,rows:records.map(({user_id:_owner,position:_position,...row})=>row)};
    }
  }
  const allRows=Object.values(rows).flat(),recordIds=allRows.map(row=>row.id);
  requireValue(new Set(recordIds).size===recordIds.length&&!recordIds.some(id=>[receipt.runId,...roles.map(role=>receipt.owners[role].id)].includes(id)),'invalid_plan');
  const rowTargets=view=>rows[tables[view]].map(row=>({id:row.id,userId:row.user_id}));
  const setup=[{kind:'persist-intent',recordIds:[...recordIds],tables:Object.values(tables)},{kind:'assert-owned-identities'},{kind:'assert-owned-tables-empty'},
    ...views.map(view=>({kind:'insert-exact-rows',table:tables[view],rows:clone(rows[tables[view]])})),{kind:'verify-both-caller-readbacks'}];
  const cleanup=[{kind:'assert-owned-identities'},{kind:'assert-exact-owned-row-targets'},
    ...[...views].reverse().map(view=>({kind:'delete-exact-rows',table:tables[view],targets:rowTargets(view)})),{kind:'verify-owned-tables-empty'},{kind:'return-to-existing-auth-cleanup'}];
  return freeze({version:1,kind:'aid-payment-fixture-plan',runId:receipt.runId,fixtureKey,owners:receipt.owners,tables:{...tables},rows,recordIds,expectedByOwner,setup,cleanup});
}
export function buildAidPaymentFixturePlan(input){return build(input);}
function checkedPlan(plan){
  try{requireValue(exact(plan,['version','kind','runId','fixtureKey','owners','tables','rows','recordIds','expectedByOwner','setup','cleanup']),'invalid_plan');
    const expected=build({runId:plan.runId,owners:plan.owners,fixtureKey:plan.fixtureKey});if(!isDeepStrictEqual(plan,expected))fail('invalid_plan');return expected;}
  catch{fail('invalid_plan');}
}
/** Authorization header is supplied only by an eventual caller-session adapter;
 * the plan stores no token and never accepts an owner selector in the request. */
export function aidPaymentFixtureReadContract(plan,options){
  plan=checkedPlan(plan);
  requireValue(exact(options,['role','view','page','summary'])&&roles.includes(options.role)&&views.includes(options.view)&&Number.isInteger(options.page)
    &&options.page>=1&&options.page<=201&&typeof options.summary==='boolean'&&(!options.summary||options.page===1),'invalid_request');
  const {role,view,page,summary}=options,ownerId=plan.owners[role].id,source=plan.expectedByOwner[ownerId][view],offset=(page-1)*25;
  return freeze({ownerId,method:'GET',path:'/api/affairs-data',query:{scope:'aid-payments',view,page:String(page),...(summary?{summary:'1'}:{})},
    rpc:{name:'affairs_read_aid_payments',body:{p_view:view,p_offset:offset,p_summary:summary}},
    expected:{userId:ownerId,view,total:source.total,rows:summary?[]:clone(source.rows.slice(offset,offset+25))}});
}
/** Must be populated by an authoritative identity read under the existing run
 * lease; merely presenting this object is not proof of a fresh account. */
export function assertAidPaymentFixtureIdentities(plan,identities){
  plan=checkedPlan(plan);
  requireValue(Array.isArray(identities)&&identities.length===2,'fixture_identity_mismatch');
  const expected=roles.map(role=>plan.owners[role]);
  for(const owner of expected){const matches=identities.filter(row=>exact(row,['id','email','runMarker'])&&row.id===owner.id);
    requireValue(matches.length===1&&isDeepStrictEqual(matches[0],owner),'fixture_identity_mismatch');}
  return true;
}
/** Refuse unexpected IDs even when they belong to a disposable owner. The
 * adapter retains its recovery ledger rather than deleting unplanned records. */
export function assertAidPaymentFixtureRowTargets(plan,actual){
  plan=checkedPlan(plan);requireValue(exact(actual,Object.values(tables)),'fixture_rows_mismatch');
  for(const table of Object.values(tables)){
    const expected=plan.rows[table].map(row=>({id:row.id,user_id:row.user_id}));
    requireValue(Array.isArray(actual[table])&&actual[table].length===expected.length&&actual[table].every(row=>exact(row,['id','user_id'])),'fixture_rows_mismatch');
    const sorted=value=>[...value].sort((a,b)=>a.id.localeCompare(b.id));
    requireValue(isDeepStrictEqual(sorted(actual[table]),sorted(expected)),'fixture_rows_mismatch');
  }
  return true;
}
export function assertAidPaymentFixtureEmpty(plan,counts){
  plan=checkedPlan(plan);requireValue(exact(counts,Object.values(tables)),'fixture_rows_remain');
  for(const table of Object.values(tables)){
    requireValue(Array.isArray(counts[table])&&counts[table].length===2,'fixture_rows_remain');
    for(const role of roles){const rows=counts[table].filter(row=>exact(row,['userId','count'])&&row.userId===plan.owners[role].id);
      requireValue(rows.length===1&&rows[0].count===0,'fixture_rows_remain');}
  }
  return true;
}
export function verifyAidPaymentFixtureReadback(plan,options,actual){
  const contract=aidPaymentFixtureReadContract(plan,options);
  requireValue(isDeepStrictEqual(actual,contract.expected),'readback_mismatch');return true;
}
export function assertAidPaymentFixtureCleanup(plan,proof){
  requireValue(exact(proof,['identities','remainingByTable']),'fixture_rows_remain');
  assertAidPaymentFixtureIdentities(plan,proof.identities);assertAidPaymentFixtureEmpty(plan,proof.remainingByTable);return true;
}
