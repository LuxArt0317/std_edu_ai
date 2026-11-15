import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {buildDtmMaterialCases,dtmMaterialCasePrefix} from './dtm-material-cases.mjs';
import {gradeCase} from './grading.mjs';

export const dtmMaterialPreviewMode='dtm-material-preview';
export const dtmMaterialPreviewGaps=Object.freeze([
  {id:dtmMaterialCasePrefix+'unavailable',reason:'Requires an injected upstream failure and remains in the controlled handler evaluation.'},
]);

const endpoint='/api/affairs-assistant';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hash=/^[0-9a-f]{64}$/u;
const revision=/^[0-9a-f]{40}$/u;
const courseIds=['c0100000-0000-4000-8000-000000000010','c0100000-0000-4000-8000-000000000011'];
const materialIds=['c0100000-0000-4000-8000-000000000020','c0100000-0000-4000-8000-000000000021'];
const itemId=index=>'c0200000-0000-4000-8000-'+String(index).padStart(12,'0');
const reservedMaterials=[...materialIds,...Array.from({length:13},(_,index)=>itemId(index))];
const variants=['baseline','no-link','missing','list-partial'];
const listCases=['overview','list-zh','list-partial'];
const targetUrl='https://example.com/hidden-destination';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(actual,expected)=>isDeepStrictEqual(actual,expected);
const fail=()=>{throw new Error('Moodle material observations did not match the isolated fixture.');};
const sortRows=rows=>[...rows].sort((left,right)=>left.id.localeCompare(right.id));
const frozen=buildDtmMaterialCases().filter(row=>!dtmMaterialPreviewGaps.some(gap=>gap.id===row.id))
  .map(row=>({...row,executionContract:'live-native'}));

export function dtmMaterialPreviewCases(){return structuredClone(frozen);}

function frozenCase(row){
  const known=frozen.find(candidate=>candidate.id===row?.id);
  if(!known||!same(known,row))throw new Error('Moodle materials require an unchanged mounted case.');
  return known;
}

export function dtmMaterialCaseScope(row){
  const {id}=frozenCase(row);
  const suffix=id.slice(dtmMaterialCasePrefix.length);
  return {variant:variants.includes(suffix)?suffix:'baseline',view:listCases.includes(suffix)?'list':'detail'};
}

export function buildDtmMaterialPreviewPlan(users){
  const ownerIds=Array.isArray(users)?users.map(row=>row?.id):[];
  if(ownerIds.length!==2||ownerIds.some(id=>!uuid.test(id))||new Set(ownerIds).size!==2
    ||ownerIds.some(id=>[...courseIds,...reservedMaterials].includes(id)))
    throw new Error('Moodle material evaluation needs two distinct disposable owners.');
  return {ownerIds,courseIds:[...courseIds],materialIds:[...reservedMaterials]};
}

export function dtmMaterialPreviewRows(plan,variant){
  if(!variants.includes(variant)||!same(plan,buildDtmMaterialPreviewPlan(plan?.ownerIds?.map(id=>({id})))))fail();
  const courses=plan.ownerIds.map((user_id,index)=>({id:courseIds[index],user_id,
    code:'QA-MATERIALS-'+(index+1),title:index?'Other disposable course':'Fixture course',
    term:'Moodle materials evaluation',role:'student',source_mode:'personal'}));
  const item=(id,course_id,title,position,summary,target_url=null)=>({id,course_id,title,kind:'file',summary,position,
    source_mode:'personal',source_url:null,target_url});
  const materials=[item(materialIds[1],courseIds[1],'FOREIGN_ITEM',1,'Private fixture for the other caller.')];
  if(variant==='list-partial')materials.push(...Array.from({length:13},(_,index)=>
    item(itemId(index),courseIds[0],'Item '+(index+1),index+1,'')));
  else if(variant!=='missing')materials.unshift(item(materialIds[0],courseIds[0],'Circuit worksheet',1,'Three practice diagrams.',
    variant==='no-link'?null:targetUrl));
  return {courses,materials:sortRows(materials)};
}

export async function readDtmMaterialPreviewRows(sql,plan){
  const [courses,materials]=await Promise.all([
    sql`select id,user_id,code,title,term,role,source_mode from public.dtm_courses
      where id in ${sql(plan.courseIds)} order by id limit 3`,
    sql`select id,course_id,title,kind,summary,position,source_mode,source_url,target_url from public.dtm_materials
      where id in ${sql(plan.materialIds)} or course_id in ${sql(plan.courseIds)} order by id limit 16`,
  ]);
  return {courses:[...courses],materials:[...materials]};
}

export function assertDtmMaterialPreviewRows(plan,variant,actual){
  const expected=dtmMaterialPreviewRows(plan,variant);
  if(!same(expected,actual))fail();
  return sha(expected);
}

const metadata=({id,user_id,title,code,term})=>({id,userId:user_id,title,code,term});
const detailItem=(row,course)=>row?{id:row.id,userId:course.user_id,courseId:course.id,title:row.title,kind:row.kind,
  summary:row.summary,position:row.position,sourceMode:row.source_mode,sourceUrl:row.source_url,targetUrl:row.target_url}:null;
const listItem=row=>({kind:'material',id:row.id,title:row.title,materialKind:row.kind,summary:row.summary,
  position:row.position,sourceMode:row.source_mode,sourceUrl:row.source_url});

function assertOwnedView(actual,course,materials,view,detailId){
  if(view==='detail'){
    const expected={course:{...metadata(course),sourceMode:course.source_mode},
      material:detailItem(materials.find(row=>row.id===detailId),course)};
    if(!same(actual,expected))fail();
    return {count:expected.material?1:0,sha256:sha(expected)};
  }
  const {revision:observedRevision,...rest}=actual??{};
  const expected={course:metadata(course),content:null,activities:materials.map(listItem),total:materials.length,
    limit:100,nextCursor:null,unavailableReferenceCount:0};
  if(!hash.test(observedRevision)||!same(rest,expected))fail();
  return {count:materials.length,sha256:sha([expected,observedRevision])};
}

export async function readDtmMaterialPreviewCallers(plan,scope,users,{origin,previewFetch,projectFetch,projectUrl,
  publishable,readResponse,signal}){
  if(!Array.isArray(users)||!same(plan,buildDtmMaterialPreviewPlan(users))
    ||users.some(row=>typeof row.token!=='string'||!row.token)||users[0].token===users[1].token
    ||!['list','detail'].includes(scope?.view)||projectUrl!=='https://xiftudmvxphxcjtmfmib.supabase.co')fail();
  const {courses,materials}=dtmMaterialPreviewRows(plan,scope.variant);
  const view=scope.view;
  const paths=courses.map((course,index)=>{
    const url=new URL('/api/affairs-data',origin);
    url.search=new URLSearchParams({scope:view==='list'?'dtm-course-content':'dtm-course-resource',course_id:course.id,
      ...(view==='detail'?{material_id:materialIds[index]}:{})});
    return url;
  });
  const rlsUrl=new URL('/rest/v1/dtm_materials',projectUrl);
  rlsUrl.search=new URLSearchParams({select:'id,course_id,title,kind,summary,position,source_mode,source_url,target_url',
    course_id:'in.('+plan.courseIds.join(',')+')',order:'id.asc',limit:'15'});
  return Promise.all(users.map(async (user,index)=>{
    const headers={Authorization:'Bearer '+user.token};
    const request={method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers,signal};
    const [own,cross,rls]=await Promise.all([
      previewFetch(paths[index],request).then(response=>readResponse(response,paths[index],32768)),
      previewFetch(paths[1-index],request).then(response=>readResponse(response,paths[1-index],2048,403)),
      projectFetch(rlsUrl,{...request,headers:{...headers,apikey:publishable}}).then(response=>readResponse(response,rlsUrl,32768)),
    ]);
    const allowed=materials.filter(row=>row.course_id===courses[index].id);
    const error=view==='list'?'This course content is not available to your account.':'This course resource is not available to your account.';
    if(!same(cross,{error})||!same(rls,allowed))fail();
    return {...assertOwnedView(own,courses[index],allowed,view,materialIds[index]),crossedDenied:true,rlsSha256:sha(allowed)};
  }));
}

export function dtmMaterialPreviewRequest(testCase){
  const row=frozenCase(testCase);
  const body=JSON.stringify({question:row.question,history:[],route:row.route,stream:true,consentedResearchUse:false});
  return {path:endpoint,body,bodySha256:createHash('sha256').update(body).digest('hex')};
}

export function gradeDtmMaterialPreviewCase(testCase,envelope,{before,after,deniedMarkers=[]}){
  const row=frozenCase(testCase),scope=dtmMaterialCaseScope(row),request=dtmMaterialPreviewRequest(row);
  const result=gradeCase(row,envelope);
  const runtime=envelope.body??{},events=envelope.events??[];
  const reads=events.filter(step=>step.kind?.startsWith('account-read:')).map(({kind,status})=>[kind,status]);
  const attempts=runtime.verification?.attempts;
  const hasRead=row.coveredTools.length===1;
  const observed=hasRead&&runtime.verification?.status==='verified'
    &&(attempts===1||attempts===2)&&events.some(step=>step.kind==='verification-'+attempts&&step.status==='complete')
    &&same(reads,attempts===1?[['account-read:dtmMaterials:1','complete']]:
      [['account-read:dtmMaterials:1','unavailable'],['account-read:dtmMaterials:2','complete']]);
  const countA=scope.variant==='list-partial'?13:scope.variant==='missing'?0:1;
  const callerProof=hash.test(before?.sqlSha256)&&before?.callers?.length===2
    &&before.callers.every((entry,index)=>entry?.count===[countA,1][index]&&entry.crossedDenied===true
      &&hash.test(entry.sha256)&&hash.test(entry.rlsSha256))&&same(before,after);
  const output=JSON.stringify([runtime,events]).toLowerCase();
  const extra=[
    {id:'dtm-material.request',passed:envelope.execution==='live-native'&&uuid.test(envelope.correlationId)
      &&revision.test(envelope.sourceRevision)&&envelope.deploymentCheck?.verified===true
      &&envelope.deploymentCheck.sourceRevision===envelope.sourceRevision
      &&Number.isSafeInteger(envelope.deploymentCheck.requestIndex)&&envelope.deploymentCheck.requestIndex>0
      &&same(envelope.materialDispatch,{endpoint:request.path,bodySha256:request.bodySha256})},
    {id:'dtm-material.unchanged-readback',passed:callerProof===true},
    {id:'dtm-material.native-activity',passed:hasRead?observed===true:!reads.length&&!runtime.verification&&events.length===0},
    {id:'dtm-material.no-private-destination',passed:[targetUrl,'FOREIGN_ITEM',courseIds[1],materialIds[1],...deniedMarkers]
      .every(marker=>typeof marker==='string'&&marker.length>0&&!output.includes(marker.toLowerCase()))},
  ];
  const checks=[...result.checks,...extra],failures=checks.filter(item=>!item.passed).map(item=>item.id);
  return {caseId:row.id,passed:failures.length===0,failedChecks:failures,verification:runtime.verification?.status??null,
    attempts:attempts??0,before,after};
}
