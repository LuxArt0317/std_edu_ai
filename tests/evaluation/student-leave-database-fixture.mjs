import {isDeepStrictEqual} from 'node:util';
import {createStudentLeaveFixtureLifecycle,studentLeaveJournalBinding} from './student-leave-fixture-lifecycle.mjs';
import {
  assertLeaveFixture,buildStudentLeaveFixturePlan,checkedStudentLeaveFixtureBinding,checkedStudentLeaveFixtureRows,
  leaveFixtureExact,leaveFixtureFamilies,leaveFixtureRoles,leaveFixtureTables,StudentLeaveFixtureError,
  studentLeaveFixtureProbeContracts,studentLeaveFixtureReadContracts,
} from './student-leave-fixture-plan.mjs';
import {isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';

const {forms,reviews,audit}=leaveFixtureTables;
const dateFields=new Set(['starts_on','ends_on']);
const timeFields=new Set(['created_at','updated_at']);
const maxResponseBytes=256*1024;
const tables=[forms,reviews,audit];
const same=isDeepStrictEqual;

function exactColumns(columns,alias){
  return columns.map(column=>{
    const field=alias+'.'+column;
    if(dateFields.has(column))return field+'::text as '+column;
    if(timeFields.has(column))return `to_char(${field} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ${column}`;
    return field;
  }).join(',');
}

function normalizeTimes(rows){
  return rows.map(row=>Object.fromEntries(Object.entries(row).map(([field,value])=>[
    field,timeFields.has(field)&&typeof value==='string'?value.replace(/(\.\d{3})000Z$/u,'$1Z'):value,
  ])));
}

function callerToken(token,id){
  if(typeof token!=='string'||token.length>16000||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token))return false;
  try{
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));
    return claims.sub===id&&claims.role==='authenticated';
  }catch{return false;}
}

async function boundedJson(response){
  const reader=response.body?.getReader();
  assertLeaveFixture(reader,'native_readback_failed');
  const chunks=[];
  let size=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.length;
      if(size>maxResponseBytes||chunks.length>=1024)assertLeaveFixture(false,'native_readback_failed');
      chunks.push(value);
    }
    const rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    assertLeaveFixture(Array.isArray(rows)&&rows.length<=80,'native_readback_failed');
    return rows;
  }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}

/** Exact data dependencies for an operator who already owns the existing fixture
 * lease, two disposable sessions and an independently pinned release. This
 * mounts data preparation, RLS probes and cleanup. Assistant ingress and
 * reader observations have their own admission gate. */
export function createStudentLeaveDatabaseFixture({
  binding,sql,assertLease,assertCurrentRelease,assertProtectedOwner,journal,publishableKey,getCaller,fetchImpl,
}={}){
  binding=checkedStudentLeaveFixtureBinding(binding);
  assertLeaveFixture(isEvaluationPreviewOrigin(binding.origin)&&typeof sql?.unsafe==='function'
    &&[assertLease,assertCurrentRelease,assertProtectedOwner,getCaller,fetchImpl].every(fn=>typeof fn==='function')
    &&typeof publishableKey==='string'&&/^[A-Za-z0-9._-]{8,4096}$/u.test(publishableKey),'invalid_dependencies');
  const journalBinding=studentLeaveJournalBinding(binding);
  const plans=leaveFixtureFamilies.map(family=>buildStudentLeaveFixturePlan({binding,family}));
  const knownIds=new Map(plans.flatMap(plan=>plan.recordIds.map(id=>[id,plan])));
  const columns=Object.fromEntries(studentLeaveFixtureReadContracts([plans[0]]).map(row=>[row.table,row.columns]));
  const probeContracts=plans.flatMap(plan=>studentLeaveFixtureProbeContracts(plan).map(({expected:_expected,...request})=>request));
  const owners=leaveFixtureRoles.map(role=>binding.owners[role]);
  const ownerRows=JSON.stringify(owners.map(({id,email})=>({id,email})));
  const googleIdentity=`exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
    and i.provider_id=u.id::text and i.identity_data->>'email'=u.email and i.identity_data->>'email_verified'='true')`;
  const ownerJoin=`jsonb_to_recordset($2::text::jsonb) as expected(id uuid,email text)
    join auth.users u on u.id=expected.id and u.email=expected.email
    join public.affairs_profiles p on p.user_id=u.id and p.email=u.email and p.role='student'`;
  const runIdentity=`u.email_confirmed_at is not null and u.raw_user_meta_data->>'assistant_evaluation_run'=$3 and `+googleIdentity;
  const ownerGuard=alias=>'exists (select 1 from '+ownerJoin+' where u.id='+alias+'.user_id and '+runIdentity+')';
  async function query(text,values=[]){
    try{return await sql.unsafe(text,values);}catch{throw new StudentLeaveFixtureError('transaction_failed');}
  }
  async function verifyLease(){
    assertLeaveFixture(await assertLease(journalBinding)===true,'lease_unavailable');
  }
  function recognizedContracts(input,extra=[]){
    assertLeaveFixture(leaveFixtureExact(input,[...Object.keys(journalBinding),'contracts',...extra])
      &&Object.entries(journalBinding).every(([key,value])=>same(input[key],value))
      &&Array.isArray(input.contracts)&&input.contracts.length===tables.length,'invalid_plan');
    const checkedAudit=input.contracts[2]?.anyOf?.[1]?.values;
    assertLeaveFixture(Array.isArray(checkedAudit)&&checkedAudit.length>0&&checkedAudit.length<=150&&checkedAudit.every(id=>knownIds.has(id)),'invalid_plan');
    const selected=[...new Set(checkedAudit.map(id=>knownIds.get(id)))];
    const contracts=studentLeaveFixtureReadContracts(selected);
    assertLeaveFixture(same(input.contracts,contracts),'invalid_plan');
    return {selected,contracts};
  }
  async function readIdentities(request){
    assertLeaveFixture(same(request,journalBinding),'invalid_binding');
    await verifyLease();
    return query(`select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as "runMarker",p.role,
      (${googleIdentity}) as "googleIdentity"
      from auth.users u join public.affairs_profiles p on p.user_id=u.id and p.email=u.email
      where u.id=any($1::uuid[]) and u.email_confirmed_at is not null order by u.id`,[journalBinding.ownerIds]);
  }
  async function readRows(request){
    const {contracts}=recognizedContracts(request);
    await verifyLease();
    const result={};
    for(const {table,anyOf} of contracts){
      const where=anyOf.map(({column},index)=>'r.'+column+'=any($'+(index+1)+'::uuid[])').join(' or ');
      result[table]=normalizeTimes(await query('select '+exactColumns(columns[table],'r')+' from public.'+table+' r where '+where+' order by r.id limit 151',
        anyOf.map(({values})=>values)));
    }
    return checkedStudentLeaveFixtureRows(result);
  }
  async function mutate(input,selected,contracts,insert){
    assertLeaveFixture(leaveFixtureExact(input,['runId','table','rows','contracts'])&&input.runId===binding.runId&&same(input.contracts,contracts)
      &&[forms,reviews].includes(input.table)&&Array.isArray(input.rows)&&input.rows.length>0
      &&selected.some(plan=>same(plan.rows[input.table],input.rows)),'invalid_plan');
    await verifyLease();
    const {table,rows}=input;
    const target='public.'+table;
    const fields=columns[table];
    const source='jsonb_populate_recordset(null::'+target+',$1::text::jsonb)';
    const returned=' returning '+exactColumns(fields,'r');
    const compare=fields.map(field=>'r.'+field+' is not distinct from v.'+field).join(' and ');
    const exactOwner='r.id=v.id and r.user_id=v.user_id and '+compare+' and '+ownerGuard('r');
    const parameters=[JSON.stringify(rows),ownerRows,binding.runId];
    // The review FK uses ON DELETE SET NULL. Hold the exact parent locks
    // before rechecking references so a new form cannot be changed by cleanup.
    if(!insert&&table===reviews){
      const locked=await query('select r.id from '+target+' r join '+source+' v on '+exactOwner+' order by r.id for update of r',parameters);
      assertLeaveFixture(same(locked.map(row=>row.id),rows.map(row=>row.id)),'mutation_readback_mismatch');
    }
    const unreferenced=table===reviews?' and not exists (select 1 from public.'+forms+' d where d.review_request_id=r.id)':'';
    const statement=insert
      ?'insert into '+target+' as r ('+fields.join(',')+') select '+fields.map(field=>'v.'+field).join(',')+
        ' from '+source+' v where '+ownerGuard('v')+returned
      :'delete from '+target+' r using '+source+' v where '+exactOwner+unreferenced+returned;
    const actual=normalizeTimes(await query(statement,parameters))
      .sort((a,b)=>a.id.localeCompare(b.id));
    assertLeaveFixture(same(actual,rows),'mutation_readback_mismatch');
    return actual;
  }
  async function transaction(request,work){
    const {selected,contracts}=recognizedContracts(request,['operation']);
    assertLeaveFixture(['transition','cleanup'].includes(request.operation)&&typeof work==='function','invalid_plan');
    await verifyLease();
    await query('begin');
    try{
      await work({
        readRows(input){assertLeaveFixture(same(input.contracts,contracts),'invalid_plan');return readRows(input);},
        insertExactRows(input){assertLeaveFixture(request.operation==='transition','invalid_plan');return mutate(input,selected,contracts,true);},
        deleteExactRows(input){return mutate(input,selected,contracts,false);},
      });
      await verifyLease();
      try{await query('commit');}catch{throw new StudentLeaveFixtureError('transaction_uncertain');}
      return {committed:true};
    }catch(error){
      try{await query('rollback');}catch{throw new StudentLeaveFixtureError('transaction_uncertain');}
      throw error;
    }
  }
  async function readProbe(request){
    assertLeaveFixture(probeContracts.some(row=>same(row,request)),'invalid_plan');
    await verifyLease();
    const signal=AbortSignal.timeout(15000);
    const session=await getCaller(request.callerId,{signal});
    assertLeaveFixture(session?.id===request.callerId&&callerToken(session.token,request.callerId),'identity_mismatch');
    const url=new URL(request.path,'https://'+binding.projectRef+'.supabase.co');
    url.search=new URLSearchParams(request.query).toString();
    const response=await fetchImpl(url,{method:'GET',headers:{apikey:publishableKey,Authorization:'Bearer '+session.token,Prefer:request.prefer},
      cache:'no-store',redirect:'error',credentials:'omit',signal});
    assertLeaveFixture(response.status===200&&!response.redirected&&(!response.url||response.url===url.href)
      &&response.headers.get('content-type')?.includes('application/json'),'native_readback_failed');
    return {callerId:session.id,statusCode:response.status,contentRange:response.headers.get('content-range'),rows:await boundedJson(response)};
  }
  return createStudentLeaveFixtureLifecycle({binding,dependencies:{assertLease,assertCurrentRelease,assertProtectedOwner,
    journal,readIdentities,readRows,readProbe,transaction}});
}
