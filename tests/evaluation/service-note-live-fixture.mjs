import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {serviceNoteCaseManifest} from './service-note-cases.mjs';
import {foreignServiceNoteMarkers,serviceNoteFixtureForRunnerCase} from './service-note-runner.mjs';

const keys=serviceNoteCaseManifest.services.map(row=>row.id);
const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const select='id,user_id,service_key,record_type,title,notes,status,updated_at';
const ordered=rows=>[...rows].sort((left,right)=>left.id.localeCompare(right.id));
const requireProof=(check,message)=>{if(!check)throw new Error(message);};
const cleanRow=row=>Object.fromEntries(select.split(',').map(key=>[key,key==='updated_at'?new Date(row[key]).toISOString():row[key]]));
const absentColumns=['starts_on','ends_on','leave_category','periods','review_request_id','contact_phone','leave_time_period'];

export function buildServiceNotePlan(testCase,owners,{makeId=randomUUID}={}){
  requireProof(Array.isArray(owners)&&owners.length===2&&new Set(owners).size===2&&owners.every(id=>uuid.test(id)),'Two distinct disposable note owners are required.');
  const fixture=serviceNoteFixtureForRunnerCase(testCase);
  const row=(note,owner)=>({id:makeId(),user_id:owner,service_key:note.serviceKey,record_type:'note',title:note.title,notes:note.notes,
    status:note.status,updated_at:note.updatedAt});
  const own=fixture.snapshot.serviceRecords.map(note=>row(note,owners[0]));
  const foreign=keys.map((key,index)=>row({...fixture.foreignRecords[0],serviceKey:key,title:foreignServiceNoteMarkers[index]},owners[1]));
  const rows=ordered([...own,...foreign]);
  requireProof(rows.every(item=>uuid.test(item.id))&&new Set(rows.map(item=>item.id)).size===rows.length,'The disposable notes have conflicting identifiers.');
  return {caseId:testCase.id,owners:[...owners],rows};
}

async function readRows(sql,owners){
  const rows=await sql`select id,user_id,service_key,record_type,title,notes,status,updated_at,
    starts_on,ends_on,leave_category,periods,review_request_id,contact_phone,leave_time_period
    from public.affairs_service_records where user_id in ${sql(owners)} and service_key in ${sql(keys)}
    order by id limit 31`;
  requireProof(rows.length<31&&rows.every(row=>absentColumns.every(key=>row[key]===null)),'Unexpected service-note workflow fields or rows are present.');
  return ordered(rows.map(cleanRow));
}

/** The same reserved connection must hold the run lease. Account claims are
 * checked by the database before every mutation, including bounded cleanup. */
async function assertOwners(sql,{owners,identities,runId}){
  requireProof(uuid.test(runId)&&owners.length===2&&new Set(owners).size===2&&owners.every(id=>uuid.test(id)),'Invalid disposable note-owner scope.');
  const lease=await sql`select exists (select 1 from pg_catalog.pg_locks where locktype='advisory' and pid=pg_backend_pid()
    and classid=23101314 and objid=115100 and objsubid=2 and granted) as held`;
  requireProof(lease.length===1&&lease[0].held===true,'The disposable service-note advisory lock is not held.');
  const admitted=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as run_id from auth.users where id in ${sql(owners)}`;
  requireProof(admitted.length===2&&owners.every(id=>{
    const requests=identities.filter(row=>row.id===id&&row.runId===runId&&row.state==='created');
    return requests.length===1&&admitted.some(row=>row.id===id&&row.email===requests[0].email&&row.run_id===runId);
  }),'Both disposable note owners must match the current run and recorded identities.');
}

/** Replace only exact owned fixture rows, in the transaction owned by the
 * caller. Cleanup can reconcile a transaction whose outcome was uncertain. */
export async function changeServiceNoteRows(sql,{previous,next,owners,identities,runId,recovering=false}){
  await assertOwners(sql,{owners,identities,runId});
  requireProof([previous,next].filter(Boolean).every(plan=>isDeepStrictEqual(plan.owners,owners)),'The note plan changed its disposable owners.');
  const actual=await readRows(sql,owners),before=previous?.rows??[],after=next?.rows??[];
  requireProof(isDeepStrictEqual(actual,before)||recovering&&isDeepStrictEqual(actual,after),'Existing service notes do not equal either authorized fixture state.');
  if(actual.length){
    const removed=await sql`delete from public.affairs_service_records where user_id in ${sql(owners)}
      and service_key in ${sql(keys)} and id in ${sql(actual.map(row=>row.id))} returning id`;
    requireProof(removed.length===actual.length,'Exact disposable note deletion did not settle.');
  }
  if(!recovering&&after.length)await sql`insert into public.affairs_service_records ${sql(after)}`;
  requireProof(isDeepStrictEqual(await readRows(sql,owners),recovering?[]:after),'The transaction did not establish the exact disposable note rows.');
}

export async function readCallerServiceNotes(caller,ownerId,{publishable,signal,fetchImpl=fetch}={}){
  requireProof(uuid.test(caller?.id)&&uuid.test(ownerId)&&typeof caller.token==='string'&&Boolean(caller.token)
    &&typeof publishable==='string'&&Boolean(publishable),'The note readback lacks a bounded authenticated caller.');
  const url=new URL('/rest/v1/affairs_service_records',project);
  for(const [key,value] of Object.entries({select,user_id:'eq.'+ownerId,record_type:'eq.note',service_key:'in.('+keys.join(',')+')',order:'id.asc',limit:'16'}))
    url.searchParams.set(key,value);
  const timeout=AbortSignal.timeout(15000);
  const response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
    headers:{Authorization:'Bearer '+caller.token,apikey:publishable,Prefer:'count=exact'},
    signal:signal?AbortSignal.any([signal,timeout]):timeout});
  requireProof(response.status===200&&!response.redirected&&(!response.url||response.url===url.href)
    &&/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')??''),'Authenticated independent service-note readback failed.');
  const reader=response.body?.getReader();
  requireProof(reader,'The service-note readback has no JSON body.');
  const chunks=[];let size=0;
  for(;;){
    const {value,done}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>180000){
      await reader.cancel();
      throw new Error('The service-note readback exceeded its allowed size.');
    }
    chunks.push(value);
  }
  const rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  const range=response.headers.get('content-range');
  requireProof(Array.isArray(rows)&&rows.length<=15&&range===(rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0')
    &&rows.every(row=>uuid.test(row?.id)&&row.user_id===ownerId&&keys.includes(row.service_key)
      &&Object.keys(row).sort().join(',')===select.split(',').sort().join(',')),'The complete owner-bound service-note payload could not be proved.');
  return ordered(rows.map(cleanRow));
}

export async function observeServiceNoteRows({sql,plan,identities,runId,users,publishable,signal,read=readCallerServiceNotes}){
  const {owners}=plan;
  requireProof(users.length===2&&users.every((user,index)=>user.id===owners[index]),'Service-note observation is missing an exact disposable caller.');
  await assertOwners(sql,{owners,identities,runId});
  const persisted=await readRows(sql,owners);
  requireProof(isDeepStrictEqual(persisted,plan.rows),'Persisted service notes do not match the independent case fixture.');
  const scopes=await Promise.all(users.map(async (user,index)=>{
    const own=await read(user,user.id,{publishable,signal});
    const crossed=await read(user,owners[1-index],{publishable,signal});
    requireProof(isDeepStrictEqual(own,plan.rows.filter(row=>row.user_id===user.id))&&isDeepStrictEqual(crossed,[]),
      'Caller-bound service-note scopes or foreign-row denial could not be established.');
    return own;
  }));
  return createHash('sha256').update(JSON.stringify({persisted,scopes})).digest('hex');
}
