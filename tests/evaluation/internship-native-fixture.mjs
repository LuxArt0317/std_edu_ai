import {isDeepStrictEqual} from 'node:util';
import {internshipObservationDigest} from '../../server/internshipObservation.js';
import {buildInternshipNativeCases,internshipNativeFixtureForCase} from './internship-native-cases.mjs';

const frozenBank=buildInternshipNativeCases();
const golden=internshipNativeFixtureForCase(frozenBank[0]);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const emptyTypes=['contract','self_assessment','company'];
const ownerKey=owner=>owner===golden.owners.A?'A':'B';
const recordSource=golden.rows.filter(row=>row.service_key==='internship');
const fail=stage=>{throw new Error('Internship fixture: '+stage+'.');};
const keys={records:['id','user_id','service_key','record_type','title','status','starts_on','ends_on','notes','review_request_id',
  'leave_category','periods','contact_phone','leave_time_period','created_at','updated_at'],
requests:['id','user_id','request_type','title','details','status','created_at','updated_at']};
const sort=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
function normalizeField(name,value){
  if(name.endsWith('_at'))return new Date(value).toISOString();
  if((name==='starts_on'||name==='ends_on')&&value instanceof Date)return value.toISOString().slice(0,10);
  return value;
}
const normalize=rows=>sort(rows).map(row=>Object.fromEntries(Object.entries(row)
  .map(([name,value])=>[name,normalizeField(name,value)])));
const same=(actual,expected)=>isDeepStrictEqual(normalize(actual),normalize(expected));
const project=(row,fields)=>Object.fromEntries(fields.map(key=>[key,row[key]]));
const empty=()=>({records:[],requests:[]});

export const internshipFixtureMode='internship-native-only';

export function buildInternshipFixturePlan(binding,kind='normal'){
  if(!binding||!uuid.test(binding.runId)||!uuid.test(binding.owners?.A)||!uuid.test(binding.owners?.B)
    ||new Set([binding.runId,binding.owners.A,binding.owners.B]).size!==3||!['normal',...emptyTypes].includes(kind))fail('invalid fixture binding');
  const remap=id=>binding.runId.slice(0,24)+id.slice(24);
  const ids={records:recordSource.map(row=>remap(row.id)),requests:golden.requests.map(row=>remap(row.id))};
  if(Object.values(ids).flat().some(id=>[binding.runId,binding.owners.A,binding.owners.B].includes(id)))fail('reserved ID collision');
  const records=recordSource.filter(row=>row.user_id!==golden.owners.A||row.record_type!==kind)
    .map(row=>({...row,id:remap(row.id),user_id:binding.owners[ownerKey(row.user_id)],
      review_request_id:row.review_request_id?remap(row.review_request_id):null,leave_category:null,periods:null,contact_phone:null,
      leave_time_period:null,created_at:row.updated_at}));
  const requests=golden.requests.map(row=>({...row,id:remap(row.id),user_id:binding.owners[ownerKey(row.user_id)],
    request_type:'general',title:'Synthetic internship review',details:'Independent fixture control',
    created_at:golden.asOf,updated_at:golden.asOf}));
  return {kind,owners:{...binding.owners},ids,records,requests};
}

async function readRows(sql,plan){
  const owners=Object.values(plan.owners);
  const records=await sql`select * from public.affairs_service_records
    where id in ${sql(plan.ids.records)} or (user_id in ${sql(owners)} and service_key='internship')
    order by id limit 9`;
  const requests=await sql`select * from public.affairs_service_requests
    where id in ${sql(plan.ids.requests)} or user_id in ${sql(owners)}
    order by id limit 5`;
  return {records,requests};
}
const matches=(actual,plan)=>same(actual.records,plan.records)&&same(actual.requests,plan.requests);

export function createInternshipFixture({sql,binding,assertLease,transaction,persist}){
  const full=buildInternshipFixturePlan(binding);
  let previous=null,pending=null,unsettled=false;
  async function observe(){
    await assertLease();
    if(!previous||unsettled)fail('there is no settled plan to observe');
    const actual=await readRows(sql,full);
    if(!matches(actual,previous))fail('persisted records disagree with the exact fixture');
    return internshipObservationDigest({records:normalize(actual.records),requests:normalize(actual.requests)});
  }
  async function replace(kind,{cleanup=false}={}){
    if(!cleanup&&unsettled)fail('unsettled fixture transition');
    await assertLease({cleanup});
    if(!cleanup)pending=buildInternshipFixturePlan(binding,kind);
    unsettled=true;
    await persist({previous:previous?.kind??null,pending:pending?.kind??null,unsettled});
    await transaction(async()=>{
      const rows=await readRows(sql,full);
      const valid=(cleanup?[previous,pending,empty()]:[previous??empty()]).some(plan=>plan&&matches(rows,plan));
      if(!valid)fail('unrecognized persisted rows; cleanup requires reconciliation');
      for(const row of rows.records)await sql`delete from public.affairs_service_records where id=${row.id} and user_id=${row.user_id}`;
      for(const row of rows.requests)await sql`delete from public.affairs_service_requests where id=${row.id} and user_id=${row.user_id}`;
      if(!cleanup){
        if(pending.requests.length)await sql`insert into public.affairs_service_requests ${sql(pending.requests)}`;
        if(pending.records.length)await sql`insert into public.affairs_service_records ${sql(pending.records)}`;
      }
      if(!matches(await readRows(sql,full),cleanup?empty():pending))fail('fixture transition did not reach the expected state');
    });
    previous=cleanup?null:pending;
    pending=null;
    unsettled=false;
    await persist({previous:previous?.kind??null,pending:null,unsettled:false});
  }
  const verifyAbsent=async()=>{
    await assertLease({cleanup:true});
    if(!matches(await readRows(sql,full),empty()))fail('exact Internship rows remain after cleanup');
  };
  return Object.freeze({transition:kind=>replace(kind),observe,current:()=>previous,cleanup:()=>replace(null,{cleanup:true}),verifyAbsent});
}

const databaseOrigin='https://xiftudmvxphxcjtmfmib.supabase.co';
export async function observeInternshipCallerRows(plan,{callers,publishableKey,fetchImpl,readResponse,signal}){
  if(typeof publishableKey!=='string'||!publishableKey||!Array.isArray(callers)||callers.length!==2
    ||callers.some((caller,index)=>caller.id!==Object.values(plan.owners)[index]||typeof caller.token!=='string'||!caller.token))fail('caller scope is invalid');
  const proof=await Promise.all(callers.flatMap(caller=>Object.values(plan.owners).flatMap(target=>['records','requests'].map(async kind=>{
    const table=kind==='records'?'affairs_service_records':'affairs_service_requests';
    const url=new URL('/rest/v1/'+table,databaseOrigin);
    url.search=new URLSearchParams({select:keys[kind].join(','),user_id:'eq.'+target,...(kind==='records'?{service_key:'eq.internship'}:{}),order:'id.asc',limit:'10'});
    const response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal,
      headers:{apikey:publishableKey,Authorization:'Bearer '+caller.token,Prefer:'count=exact'}});
    const rows=await readResponse(response,url,80000);
    const expected=caller.id===target?plan[kind].filter(row=>row.user_id===caller.id).map(row=>project(row,keys[kind])):[];
    const range=expected.length?'0-'+(expected.length-1)+'/'+expected.length:'*/0';
    if(!Array.isArray(rows)||response.headers.get('content-range')!==range||!same(rows,expected))fail('own or crossed RLS read differs from the exact fixture');
    return {kind,owned:caller.id===target,count:rows.length,digest:internshipObservationDigest(normalize(rows))};
  }))));
  return {checks:proof.length,digest:internshipObservationDigest(proof)};
}
