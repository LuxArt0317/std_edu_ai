import {isDeepStrictEqual} from 'node:util';
import {facilityRepairCaseManifest as manifest,facilityRepairFixtureForCase} from './facility-repair-cases.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const listFields=['id','user_id','building','location','item','status','version','created_at','updated_at'];
const eventFields=['version','status','note','occurred_at'];
const detailDefaults={area_code:null,equipment_code:null,contact_phone:'',room:'',floor_label:'',bed:'',location_remark:'',other_item:''};
const liveKinds=new Set(['detail','blank','initial','list','ambiguous','not-found','empty','foreign','compound']);
const ids=Object.values(manifest.reports);
const fail=message=>{throw new Error('Facility repair fixture '+message+'.');};
const pick=(value,fields)=>Object.fromEntries(fields.map(field=>[field,value[field]]));

function normalized(value){
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(normalized);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,normalized(entry)]));
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)&&Number.isFinite(Date.parse(value)))return new Date(value).toISOString();
  return value;
}
const same=(actual,expected)=>isDeepStrictEqual(normalized(actual),normalized(expected));

export function facilityRepairLiveFixtureKey(key){
  return typeof key==='string'&&key.startsWith('facility-repairs:')&&liveKinds.has(key.slice('facility-repairs:'.length));
}

export function buildFacilityRepairFixturePlan(testCase,owners){
  if(!facilityRepairLiveFixtureKey(testCase?.fixtureKey)||!Array.isArray(owners)||owners.length!==2||owners[0]===owners[1]||owners.some(id=>!uuid.test(id)))fail('binding is invalid');
  const fixture=facilityRepairFixtureForCase({...testCase,fixtureKey:'offline:'+testCase.fixtureKey});
  const ownRows=fixture.list.rows.map(row=>({...detailDefaults,...row,user_id:owners[0],
    description:row.id===fixture.detail.detail.id?fixture.detail.detail.description:'Synthetic alternate repair report'}));
  if(ownRows.length&&testCase.fixtureKey.endsWith(':initial'))Object.assign(ownRows[0],{status:'submitted',version:1,updated_at:fixture.detail.events[0].occurred_at});
  const foreign={...detailDefaults,...fixture.foreignDetail.detail,user_id:owners[1]};
  const reports=[...ownRows,foreign];
  const events=reports.flatMap(row=>{
    const source=row.id===foreign.id?fixture.foreignDetail.events:row.id===fixture.detail.detail.id?fixture.detail.events:
      [{version:1,status:'submitted',note:'',occurred_at:row.created_at},{version:2,status:'in_progress',note:'Synthetic second report handling',occurred_at:row.updated_at}];
    return source.map(event=>({...event,repair_id:row.id,actor:null,action:event.version===1?'submit':'review',payload:{},
      request_id:row.id.slice(0,-4)+String(event.version).padStart(4,'0')}));
  });
  return {owners:[...owners],reports,events};
}

function verifyRows(plan,reports,events){
  const ordered=(rows,key)=>[...rows].sort((a,b)=>key(a).localeCompare(key(b)));
  if(!same(ordered(reports,row=>row.id),ordered(plan.reports,row=>row.id))
    ||!same(ordered(events,row=>row.repair_id+':'+row.version),ordered(plan.events,row=>row.repair_id+':'+row.version)))fail('database rows differ from the recorded fixture');
}

async function targets(sql,owners){
  const idsInUse=await sql`select id,user_id from public.affairs_facility_repairs where id in ${sql(ids)} order by id`;
  if(idsInUse.some(row=>!owners.includes(row.user_id)))fail('reserved report key belongs to another account');
  const reports=await sql`select * from public.affairs_facility_repairs where user_id in ${sql(owners)} order by id limit 5`;
  const events=await sql`select * from private.affairs_facility_repair_events where repair_id in ${sql(ids)} order by repair_id,version limit 12`;
  return {reports,events};
}

export async function verifyFacilityRepairFixtureDatabase(sql,plan){
  const {reports,events}=await targets(sql,plan.owners);
  verifyRows(plan,reports,events);
}

/** The existing live adapter owns the transaction and journals both plans. */
export async function changeFacilityRepairFixtureRows(sql,{previous,next,identities,runId,recovering=false}){
  const binding=previous||next;if(!binding)return;
  const {owners}=binding;
  for(const plan of [previous,next].filter(Boolean)){
    const reportIds=new Set(plan.reports.map(row=>row.id));
    if(!same(plan.owners,owners)||new Set(owners).size!==2||owners.some(id=>!uuid.test(id))
      ||reportIds.size!==plan.reports.length||plan.reports.some(row=>!owners.includes(row.user_id)||!ids.includes(row.id)||row.id===manifest.reports.missing)
      ||plan.events.some(row=>!reportIds.has(row.repair_id)||row.actor!==null))fail('owner or event binding changed');
  }
  const auths=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as run_id from auth.users where id in ${sql(owners)} limit 3`;
  if(auths.length!==2||!owners.every(id=>auths.some(auth=>auth.id===id&&auth.run_id===runId&&identities.some(identity=>
    identity.id===id&&identity.email===auth.email&&identity.runId===runId&&identity.state==='created'))))fail('owner identity could not be verified');
  const actual=await targets(sql,owners);
  if(recovering&&!actual.reports.length&&!actual.events.length)return;
  let prior=previous;
  if(recovering){
    prior=[previous,next].filter(Boolean).find(plan=>{try{verifyRows(plan,actual.reports,actual.events);return true;}catch{return false;}});
    if(!prior)fail('uncertain transaction does not match either recorded plan');
  }else if(prior)verifyRows(prior,actual.reports,actual.events);
  else if(actual.reports.length||actual.events.length)fail('unexpected repair rows or event keys already exist');
  for(const row of prior?.reports??[])await sql`delete from public.affairs_facility_repairs where id=${row.id} and user_id=${row.user_id}`;
  if(!recovering&&next){
    await sql`insert into public.affairs_facility_repairs ${sql(next.reports)}`;
    await sql`insert into private.affairs_facility_repair_events ${sql(next.events.map(event=>({...event,payload:sql.json(event.payload)})))}`;
  }
  const observed=await targets(sql,owners);
  verifyRows(!recovering&&next?next:{reports:[],events:[]},observed.reports,observed.events);
}

/** Compare the native list and full detail lineage using both caller sessions. */
export async function verifyFacilityRepairFixtureReadback(plan,read,{missingId=manifest.reports.missing}={}){
  const proof={};
  for(const owner of plan.owners){
    const reports=plan.reports.filter(row=>row.user_id===owner).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
    const list=await read(owner,null);
    if(list.status!==200||!same(list.body,{userId:owner,rows:reports.map(row=>pick(row,listFields)),total:reports.length,page:0,pageSize:25}))fail('native list does not match the caller');
    const detail=[];
    for(const row of reports){
      const response=await read(owner,row.id);
      const events=plan.events.filter(event=>event.repair_id===row.id).map(event=>pick(event,eventFields));
      if(response.status!==200||!same(response.body,{userId:owner,detail:row,events}))fail('native detail or event history differs');
      detail.push(normalized(response.body));
    }
    for(const id of [missingId,...plan.reports.filter(row=>row.user_id!==owner).map(row=>row.id)]){
      const denied=await read(owner,id);
      if(denied.status!==404||typeof denied.body?.error!=='string'||Object.keys(denied.body).length!==1)fail('missing or other-account report was not fenced');
    }
    proof[owner]={list:normalized(list.body),detail};
  }
  return proof;
}
