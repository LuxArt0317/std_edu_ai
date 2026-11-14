import {feeRemissionLivePlanManifest as manifest} from './fee-remission-live-plan.mjs';
import {feeRemissionFields} from '../../server/feeRemissionContract.js';

// Injected, offline-testable SQL transport only. The caller owns the same physical
// leased transaction, durable plan/intent, exact pre/post state and crash recovery.
// Nothing here creates identities, starts a transaction, or grants mutation authority.
const fee='affairs_fee_remission',charges='affairs_charges',operations='private.affairs_fee_remission_operations',audit='affairs_agent_audit';
const schema={
  [fee]:{name:'public.affairs_fee_remission',columns:manifest.remissionFields,predicates:['user_id','id'],order:'id'},
  [charges]:{name:'public.affairs_charges',columns:manifest.chargeFields,predicates:['student_id','id'],order:'id'},
  [operations]:{name:operations,columns:['actor_id','user_id','request_id','kind','payload','result'],predicates:['actor_id','user_id'],order:'actor_id,request_id'},
  [audit]:{name:'public.affairs_agent_audit',columns:['id','user_id','action_kind','target_id','summary','created_at'],predicates:['user_id','target_id'],order:'id'},
};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,keys)=>object(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const array=(value,max=1000)=>Array.isArray(value)&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1
  &&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,i)).every(item=>item&&Object.hasOwn(item,'value'));
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const sameSet=(a,b)=>a.length===b.length&&new Set(a).size===a.length&&a.every(value=>b.includes(value));
const equalList=(a,b)=>array(a,b.length)&&a.length===b.length&&a.every((value,index)=>value===b[index]);
const fail=code=>{throw Object.assign(new Error('Fee fixture SQL '+code+'.'),{name:'FeeRemissionFixtureSqlError',code});};
const requireValue=(value,code='invalid_request')=>{if(!value)fail(code);};
const listSql=(values,params)=>values.length?values.map(value=>{params.push(value);return '$'+params.length+'::uuid';}).join(','):'NULL::uuid';
const validIds=values=>array(values)&&values.every(uuid)&&new Set(values).size===values.length;
function request(sql,input,keys){requireValue(sql!==null&&(typeof sql==='object'||typeof sql==='function')&&typeof sql.unsafe==='function'&&exact(input,keys)&&uuid(input.runId));}
async function query(sql,text,params){try{return await sql.unsafe(text,params);}catch{fail('query_failed');}}
const rowsValid=rows=>Array.isArray(rows)&&rows.length<=1000;
const byteLength=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
async function guard(sql,runId,owners,students=[]){
  requireValue(validIds(owners)&&validIds(students)&&owners.length<=2&&students.length<=2);
  let bindings=[];
  if(students.length){
    const params=[];bindings=await query(sql,'select id,user_id from public.affairs_students where id in ('+listSql(students,params)+') order by id',params);
    requireValue(rowsValid(bindings)&&bindings.length===students.length&&bindings.every(row=>exact(row,['id','user_id'])&&uuid(row.id)&&uuid(row.user_id))
      &&sameSet(bindings.map(row=>row.id),students)&&new Set(bindings.map(row=>row.user_id)).size===students.length,'identity_mismatch');
  }
  const ownerIds=[...new Set([...owners,...bindings.map(row=>row.user_id)])];
  requireValue(ownerIds.length>0&&ownerIds.length<=2&&!ownerIds.includes(runId)&&!students.some(id=>ownerIds.includes(id)||id===runId),'identity_mismatch');
  const params=[];
  const identities=await query(sql,'select u.id,u.email,u.raw_user_meta_data->>\'assistant_evaluation_run\' as "runMarker",p.role from auth.users u left join public.affairs_profiles p on p.user_id=u.id where u.id in ('+listSql(ownerIds,params)+') order by u.id',params);
  requireValue(rowsValid(identities)&&identities.length===ownerIds.length&&sameSet(identities.map(row=>row.id),ownerIds)&&identities.every(row=>exact(row,['id','email','runMarker','role'])
    &&row.runMarker===runId&&row.role==='student'&&typeof row.email==='string'&&row.email.length<=254&&/^[a-z0-9][a-z0-9._+-]{0,230}@example\.invalid$/u.test(row.email)),'identity_mismatch');
  requireValue(new Set(identities.map(row=>row.email)).size===identities.length,'identity_mismatch');
  return bindings;
}
function contractsFor(input){
  requireValue(array(input,4)&&input.length===4);
  const contracts=input.map(item=>{
    requireValue(object(item)&&Object.hasOwn(schema,item.table));const rule=schema[item.table];
    requireValue(exact(item,['table','columns','anyOf',...(item.table===fee?['includeDeleted']:[])])&&equalList(item.columns,rule.columns)
      &&array(item.anyOf,2)&&item.anyOf.length===2&&(item.table!==fee||item.includeDeleted===true));
    for(const [index,predicate]of item.anyOf.entries())requireValue(exact(predicate,['column','values'])&&predicate.column===rule.predicates[index]&&validIds(predicate.values));
    return structuredClone(item);
  });
  requireValue(sameSet(contracts.map(item=>item.table),Object.keys(schema)));
  const byTable=Object.fromEntries(contracts.map(item=>[item.table,item])),owners=byTable[fee].anyOf[0].values,students=byTable[charges].anyOf[0].values;
  requireValue(owners.length===2&&students.length===2&&[...byTable[operations].anyOf,byTable[audit].anyOf[0]].every(item=>sameSet(item.values,owners)));
  const reserved=[...byTable[fee].anyOf[1].values,...byTable[charges].anyOf[1].values];
  requireValue(new Set(reserved).size===reserved.length&&sameSet(byTable[audit].anyOf[1].values,reserved));
  return {byTable,owners,students};
}

/** Exact union contracts from feeRemissionLifecycleReadContracts, including all
 * owned tombstones and reserved IDs across owners. Over-limit reads fail closed. */
export async function readRows(sql,input){
  request(sql,input,['runId','contracts']);const runId=input.runId,{byTable,owners,students}=contractsFor(input.contracts);
  const bindings=await guard(sql,runId,owners,students);requireValue(sameSet(bindings.map(row=>row.user_id),owners),'identity_mismatch');
  const result={};let bytes=0;
  for(const table of manifest.tables){
    const contract=byTable[table],rule=schema[table],params=[];
    const where=contract.anyOf.map(item=>item.column+' in ('+listSql(item.values,params)+')').join(' or ');
    const columns=rule.columns.map(key=>table===charges&&['due_on','occurrence_on'].includes(key)?key+'::text as '+key:key);
    const rows=await query(sql,'select '+columns.join(',')+' from '+rule.name+' where ('+where+') order by '+rule.order+' limit 1001',params);
    requireValue(rowsValid(rows)&&rows.every(row=>exact(row,rule.columns)),'invalid_rows');
    try{bytes+=byteLength(rows);}catch{fail('invalid_rows');}requireValue(bytes<=4*1024*1024,'read_limit');
    result[table]=Array.from(rows);
  }
  return result;
}
const text=(value,max)=>value===null||typeof value==='string'&&value.length<=max*2&&!value.includes('\0')&&[...value].length<=max&&!/[\ud800-\udfff]/u.test(value);
const date=value=>value===null||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const money=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=9999999999.99&&Math.abs(value*100-Math.round(value*100))<0.0001;
function mutationRows(table,rows){
  requireValue([fee,charges].includes(table)&&array(rows,500));const keys=schema[table].columns;
  for(const row of rows){
    requireValue(exact(row,keys)&&uuid(row.id));
    if(table===fee)requireValue(uuid(row.user_id)&&feeRemissionFields.every(([key,,max])=>text(row[key],max))&&integer(row.row_order,0,10000)&&row.version===1&&row.updated_at===manifest.stamp&&row.deleted_at===null);
    else requireValue(uuid(row.student_id)&&typeof row.label==='string'&&row.label.trim().length>0&&text(row.label,2000)&&money(row.amount_due)&&money(row.amount_paid)&&row.amount_paid<=row.amount_due
      &&row.currency==='TWD'&&row.source_mode==='sample'&&date(row.due_on)&&date(row.occurrence_on)
      &&[['category',80],['contact_unit',160],['contact_extension',40],['payment_unit',160]].every(([key,max])=>text(row[key],max)&&(row[key]===null||row[key].trim().length>0)));
  }
  requireValue(new Set(rows.map(row=>row.id)).size===rows.length);return structuredClone(rows);
}
function ownerGuard(alias,table,runParameter){
  const owner=table===fee?alias+'.user_id':'s.user_id';
  return 'exists (select 1 from '+(table===fee?'auth.users u':'public.affairs_students s join auth.users u on u.id=s.user_id')
    +' join public.affairs_profiles p on p.user_id=u.id where '+(table===fee?'u.id='+owner:'s.id='+alias+'.student_id')
    +' and u.raw_user_meta_data->>\'assistant_evaluation_run\'='+runParameter+' and p.role=\'student\' and u.email ~ \'^[a-z0-9][a-z0-9._+-]{0,230}@example[.]invalid$\')';
}
/** Caller must supply targets from exact reconciled plans inside its transaction.
 * Composite row+owner predicates and inline run guards prohibit broad deletion. */
export async function deleteRows(sql,input){
  request(sql,input,['runId','targets']);requireValue(array(input.targets,502));const runId=input.runId;
  for(const target of input.targets)requireValue(object(target)&&exact(target,target.table===fee?['table','id','userId']:['table','id','studentId'])&&[fee,charges].includes(target.table)
    &&uuid(target.id)&&uuid(target.table===fee?target.userId:target.studentId));
  const targets=structuredClone(input.targets);
  requireValue(new Set(targets.map(target=>target.table+':'+target.id)).size===targets.length);
  if(!targets.length)return {deleted:0};
  await guard(sql,runId,[...new Set(targets.filter(row=>row.table===fee).map(row=>row.userId))],[...new Set(targets.filter(row=>row.table===charges).map(row=>row.studentId))]);
  let deleted=0;
  for(const table of [fee,charges]){
    const selected=targets.filter(target=>target.table===table);if(!selected.length)continue;
    const column=table===fee?'user_id':'student_id',payload=selected.map(target=>({id:target.id,[column]:target[table===fee?'userId':'studentId']}));
    const result=await query(sql,'delete from '+schema[table].name+' as r using jsonb_to_recordset($1::jsonb) as v(id uuid,'+column+' uuid) where r.id=v.id and r.'+column+'=v.'+column+' and '+ownerGuard('r',table,'$2')+' returning r.id,r.'+column,[JSON.stringify(payload),runId]);
    requireValue(rowsValid(result)&&result.length===selected.length&&result.every(row=>exact(row,['id',column]))
      &&sameSet(result.map(row=>row.id+':'+row[column]),payload.map(row=>row.id+':'+row[column])),'mutation_mismatch');deleted+=result.length;
  }
  return {deleted};
}
/** Only literal plan rows; no upsert, manager RPC, operation receipt or audit. */
export async function insertRows(sql,input){
  request(sql,input,['runId','table','rows']);const {runId,table}=input,rows=mutationRows(table,input.rows);if(!rows.length)return {inserted:0};
  const column=table===fee?'user_id':'student_id',owners=table===fee?[...new Set(rows.map(row=>row.user_id))]:[],students=table===charges?[...new Set(rows.map(row=>row.student_id))]:[];
  await guard(sql,runId,owners,students);
  const rule=schema[table],result=await query(sql,'insert into '+rule.name+' ('+rule.columns.join(',')+') select '+rule.columns.map(key=>'v.'+key).join(',')
    +' from jsonb_populate_recordset(null::'+rule.name+',$1::jsonb) as v where '+ownerGuard('v',table,'$2')+' returning id,'+column,[JSON.stringify(rows),runId]);
  requireValue(rowsValid(result)&&result.length===rows.length&&result.every(row=>exact(row,['id',column]))
    &&sameSet(result.map(row=>row.id+':'+row[column]),rows.map(row=>row.id+':'+row[column])),'mutation_mismatch');
  return {inserted:result.length};
}
