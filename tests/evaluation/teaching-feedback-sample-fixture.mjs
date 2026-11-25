import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const termCode='SAMPLE-2026-FALL';
const termLabel='Sample Fall 2026';
const termStarts='2026-09-07';
const termEnds='2027-01-15';
const programCode='SAMPLE-GEN';
const courseFacts=Object.freeze({
  SAMP101:'Campus Orientation',
  SAMP102:'Digital Learning Basics',
  SAMP103:'Student Services Practice',
});
const receiptFacts=Object.freeze([
  Object.freeze({owner:'A',code:'SAMP101',status:'submitted',comment:'Sample evaluation note: Show the lab steps in order.',
    submittedAt:'2026-11-14T03:04:05.000Z',reviewedAt:null}),
  Object.freeze({owner:'A',code:'SAMP102',status:'reviewed',comment:'Sample evaluation note: The worked examples were clear.',
    submittedAt:'2026-11-13T01:02:03.000Z',reviewedAt:'2026-11-14T05:06:07.000Z'}),
  Object.freeze({owner:'B',code:'SAMP101',status:'reviewed',comment:'Separate sample student note: Add a printable outline.',
    submittedAt:'2026-11-12T09:10:11.000Z',reviewedAt:'2026-11-14T08:22:00.000Z'}),
]);
const scopes=['survey','immediate'];
const variants=['paired','second-empty'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const fail=stage=>{throw new Error('Sample teaching fixture: '+stage+'.');};
const ordered=(rows,key='id')=>[...rows].sort((a,b)=>a[key].localeCompare(b[key]));
const iso=value=>value===null?null:new Date(value).toISOString();
const stable=rows=>[...rows].map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>
  [key,key.endsWith('_at')?iso(value):value])));
const equal=(actual,expected)=>isDeepStrictEqual(actual,expected);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const empty=()=>({profiles:[],students:[],enrollments:[],feedback:[],completions:[],audit:[]});
const eqState=(actual,expected)=>Object.keys(empty()).every(key=>equal(stable(actual[key]),stable(expected[key])));

export const teachingSampleReceiptFacts=receiptFacts;

/** Bind exact, existing published site sample sections without modifying the catalog. */
export async function readTeachingSampleCatalog(sql){
  const rows=await sql`select t.id as "termId",t.label as term,t.starts_on::text as starts,t.ends_on::text as ends,
    t.source_mode as "termSource",p.id as "programId",p.code as program,p.source_mode as "programSource",
    s.id as "sectionId",s.section_code as section,s.source_mode as "sectionSource",
    c.title as course,c.code,c.source_mode as "courseSource",
    exists(select 1 from public.affairs_teaching_surveys v where v.term_id=t.id) as "hasSurvey"
    from public.affairs_terms t join public.affairs_sections s on s.term_id=t.id
    join public.affairs_courses c on c.id=s.course_id join public.affairs_programs p on p.id=c.program_id
    where t.code=${termCode}
    order by c.code,s.section_code,s.id limit 4`;
  if(rows.length!==Object.keys(courseFacts).length)fail('the expected sample section set is missing or ambiguous');
  const [{termId,programId}]=rows;
  if(!uuid.test(termId)||!uuid.test(programId)||new Set(rows.map(row=>row.sectionId)).size!==rows.length)
    fail('the sample catalog identifiers are invalid');
  for(const [index,row] of rows.entries()){
    const code=Object.keys(courseFacts)[index];
    if(row.code!==code||row.course!==courseFacts[code]||row.termId!==termId||row.term!==termLabel||row.starts!==termStarts||row.ends!==termEnds
      ||row.programId!==programId||row.program!==programCode||row.section!=='A'||!uuid.test(row.sectionId)
      ||row.hasSurvey!==false||![row.termSource,row.programSource,row.sectionSource,row.courseSource].every(value=>value==='sample'))
      fail('the sample catalog or empty survey binding changed');
  }
  return {termId,programId,sections:rows.map(({sectionId:id,course,code,term,section})=>({id,course,code,term,section}))};
}

export function buildTeachingSampleFixture(binding,catalog,variant='paired'){
  const accounts=[binding?.owners?.A,binding?.owners?.B];
  const emails=['evaluation.student@example.invalid',`evaluation.other.${binding?.runId}@example.invalid`];
  if(!uuid.test(binding?.runId)||accounts.some((actor,index)=>!actor||!uuid.test(actor.id)||actor.email!==emails[index])
    ||new Set([binding.runId,...accounts.map(actor=>actor.id)]).size!==3||!variants.includes(variant))
    fail('the binding must identify two exact disposable owners');
  const reserved=offset=>binding.runId.slice(0,24)+String(offset).padStart(12,'0');
  if(!uuid.test(catalog?.termId)||!uuid.test(catalog?.programId)||!Array.isArray(catalog?.sections)
    ||catalog.sections.length!==Object.keys(courseFacts).length||catalog.sections.some((row,index)=>
      !uuid.test(row?.id)||row.code!==Object.keys(courseFacts)[index]||row.course!==courseFacts[row.code]||row.term!==termLabel||row.section!=='A'))
    fail('invalid sample catalog binding');
  const sections=Object.fromEntries(catalog.sections.map(row=>[row.code,row]));
  const at='2026-11-12T00:00:00.000Z';
  const profiles=ordered(accounts.map(actor=>({user_id:actor.id,email:actor.email,display_name:'Teaching Evaluation Student',
    role:'student',created_at:at,updated_at:at})),'user_id');
  const feedback=receiptFacts.map((fact,index)=>({
    id:reserved(30+index),user_id:binding.owners[fact.owner].id,section_id:sections[fact.code].id,comment:fact.comment,
    status:fact.status,submitted_at:fact.submittedAt,reviewed_at:fact.reviewedAt,request_id:reserved(40+index),
  }));
  const ids={feedback:feedback.map(row=>row.id),receipts:feedback.map(row=>row.request_id)};
  const allIds=[...Object.values(ids).flat(),...accounts.map(actor=>actor.id),...catalog.sections.map(row=>row.id),catalog.termId,catalog.programId,binding.runId];
  if(new Set(allIds).size!==allIds.length)fail('reserved IDs overlap an account or catalog binding');
  // Saved historical feedback remains available without a current enrollment.
  // Inserting a student row would trigger unrelated sample academic and fee rows.
  return {variant,catalog,owners:{...binding.owners},ids,state:{...empty(),profiles,
    feedback:variant==='second-empty'?feedback.slice(0,2):feedback}};
}

export function expectedTeachingSampleDto(plan,ownerKey,view){
  if(!scopes.includes(view)||!Object.hasOwn(plan.owners,ownerKey))fail('unsupported personal read scope');
  const owner=plan.owners[ownerKey].id;
  const base={userId:owner,courses:[],surveys:[],feedback:[],terms:[],results:[]};
  if(view==='survey')return base;
  const feedback=plan.state.feedback.filter(row=>row.user_id===owner).map(row=>{
    const section=plan.catalog.sections.find(item=>item.id===row.section_id);
    return {id:row.id,sectionId:row.section_id,course:section.course,code:section.code,term:section.term,comment:row.comment,
      status:row.status,submittedAt:row.submitted_at,reviewedAt:row.reviewed_at};
  });
  return {...base,feedback};
}

/** Canonicalize timestamp spelling only. Preserve every field and row order. */
export function normalizeTeachingNativeDto(value){
  if(!value||!Array.isArray(value.feedback))fail('invalid native DTO');
  return {...value,feedback:value.feedback.map(row=>({...row,submittedAt:iso(row.submittedAt),reviewedAt:iso(row.reviewedAt)}))};
}

async function readState(sql,plan){
  const owners=Object.values(plan.owners).map(actor=>actor.id);
  const profiles=await sql`select user_id,email,display_name,role,created_at,updated_at from public.affairs_profiles
    where user_id in ${sql(owners)} order by user_id limit 3`;
  const students=await sql`select id from public.affairs_students where user_id in ${sql(owners)} limit 1`;
  const enrollments=await sql`select e.id from public.affairs_enrollments e join public.affairs_students s on s.id=e.student_id
    where s.user_id in ${sql(owners)} limit 1`;
  const feedback=await sql`select * from public.affairs_teaching_feedback where user_id in ${sql(owners)}
    or id in ${sql(plan.ids.feedback)} or request_id in ${sql(plan.ids.receipts)} order by id limit 4`;
  const completions=await sql`select user_id,survey_id,section_id,request_id from private.affairs_teaching_survey_completions
    where user_id in ${sql(owners)} or request_id in ${sql(plan.ids.receipts)} limit 1`;
  const audit=await sql`select id from public.affairs_agent_audit where user_id in ${sql(owners)}
    or target_id in ${sql(plan.ids.feedback)} limit 1`;
  return {profiles,students,enrollments,feedback,completions,audit};
}

export function createTeachingSampleFixture({sql,binding,catalog,assertLease,transaction,persist,recovery}){
  const full=buildTeachingSampleFixture(binding,catalog);
  let previous=null,pending=null,unsettled=false;
  if(recovery!==undefined){
    if(!recovery||Object.keys(recovery).length!==3
      ||![recovery.previous,recovery.pending].every(variant=>variant===null||variants.includes(variant))
      ||typeof recovery.unsettled!=='boolean'||recovery.pending!==null&&!recovery.unsettled)fail('invalid recovery journal');
    previous=recovery.previous===null?null:buildTeachingSampleFixture(binding,catalog,recovery.previous);
    pending=recovery.pending===null?null:buildTeachingSampleFixture(binding,catalog,recovery.pending);
    unsettled=recovery.unsettled;
  }
  const guard=async cleanup=>{
    await assertLease({cleanup});
    if(!cleanup&&!equal(await readTeachingSampleCatalog(sql),catalog))fail('bound sample section identifiers changed');
  };
  async function replace(variant,{cleanup=false}={}){
    if(!cleanup&&unsettled)fail('unsettled fixture transition');
    await guard(cleanup);
    if(!cleanup)pending=buildTeachingSampleFixture(binding,catalog,variant);
    unsettled=true;
    await persist({previous:previous?.variant??null,pending:pending?.variant??null,unsettled});
    await transaction(async()=>{
      const actual=await readState(sql,full);
      const accepted=cleanup?[previous?.state,pending?.state,empty()]:[previous?.state??empty()];
      if(!accepted.some(state=>state&&eqState(actual,state)))fail('unrecognized persisted rows require reconciliation');
      for(const row of actual.feedback)await sql`delete from public.affairs_teaching_feedback where id=${row.id} and user_id=${row.user_id}`;
      for(const row of actual.profiles)await sql`delete from public.affairs_profiles where user_id=${row.user_id} and role='student'`;
      if(!cleanup){
        await sql`insert into public.affairs_profiles ${sql(pending.state.profiles)}`;
        await sql`insert into public.affairs_teaching_feedback ${sql(pending.state.feedback)}`;
      }
      if(!eqState(await readState(sql,full),cleanup?empty():pending.state))fail('fixture transition did not reach its exact rows');
    });
    previous=cleanup?null:pending;
    pending=null;
    unsettled=false;
    await persist({previous:previous?.variant??null,pending:null,unsettled:false});
  }
  return Object.freeze({
    transition:variant=>replace(variant),current:()=>previous,cleanup:()=>replace(null,{cleanup:true}),
    async observe(){
      await guard(false);
      if(!previous||unsettled)fail('no settled plan is available to observe');
      const actual=await readState(sql,full);
      if(!eqState(actual,previous.state))fail('persisted rows differ from the exact fixture');
      return digest({catalog,state:Object.fromEntries(Object.entries(actual).map(([group,rows])=>[group,stable(rows)]))});
    },
    async verifyAbsent(){
      await assertLease({cleanup:true});
      if(!eqState(await readState(sql,full),empty()))fail('exact teaching fixture rows remain');
    },
  });
}

const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const nativeRpc='/rest/v1/rpc/affairs_read_teaching_feedback';

/** Independently reread each view under both original callers and test inaccessible direct/manager reads. */
export async function observeTeachingSampleCallers(plan,{callers,publishableKey,fetchImpl,readResponse,signal}){
  if(typeof publishableKey!=='string'||!publishableKey||!Array.isArray(callers)||callers.length!==2
    ||callers.some((caller,index)=>caller.id!==Object.values(plan.owners)[index].id||typeof caller.token!=='string'||!caller.token))
    fail('caller credentials are outside the two-owner fixture');
  const checks=[];
  for(const [index,caller] of callers.entries()){
    const ownerKey=index===0?'A':'B';
    const headers={apikey:publishableKey,authorization:'Bearer '+caller.token,'content-type':'application/json'};
    const request=(path,init)=>fetchImpl(new URL(path,project),{redirect:'error',credentials:'omit',cache:'no-store',headers,signal,...init});
    const read=view=>request(nativeRpc,{method:'POST',body:JSON.stringify({p_scope:view,p_term:null,p_survey:null,p_section:null})});
    for(const view of scopes){
      const response=await read(view);
      const value=normalizeTeachingNativeDto(await readResponse(response,new URL(nativeRpc,project),131072));
      const expected=expectedTeachingSampleDto(plan,ownerKey,view);
      if(!equal(value,expected))fail('caller DTO differs from the independently authored rows');
      checks.push({ownerKey,view,count:value.feedback.length+value.surveys.length,digest:digest(expected)});
    }
    const denied=await read('manage');
    await denied.body?.cancel();
    if(![401,403].includes(denied.status))fail('a student could reach the management reader');
    checks.push({ownerKey,denial:'manager'});
    const foreign=callers[1-index];
    const direct=await request('/rest/v1/affairs_teaching_feedback?'+new URLSearchParams({select:'id',user_id:'eq.'+foreign.id}),{method:'GET'});
    await direct.body?.cancel();
    if(![401,403].includes(direct.status))fail('a student could target a foreign teaching record directly');
    checks.push({ownerKey,denial:'crossed-direct'});
  }
  return {checks:checks.length,digest:digest(checks)};
}
