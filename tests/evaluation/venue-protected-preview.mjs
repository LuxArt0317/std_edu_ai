import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {createVenueProbe,venueObservationHeader,verifyVenueObservation} from '../../server/venueObservation.js';
import {gradeCase} from './grading.mjs';
import {expectedVenueProtectedRead,venueProtectedCases} from './venue-protected-fixture.mjs';

const fields=['id','user_id','venue','booking_date','period','purpose','status','review_note','version','created_at'];
const fieldsMatch=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&isDeepStrictEqual(Object.keys(value).sort(),keys.slice().sort());
const selected=row=>Object.fromEntries(fields.map(key=>[key,row[key]]));
const hash=/^[a-f0-9]{64}$/u;

export async function observeVenueProtectedCallers(plan,{users,publishable,origin,previewFetch,directFetch,readResponse,signal}){
  if(!Array.isArray(users)||users.length!==2||!users.every((user,i)=>user.id===plan.owners[i===0?'A':'B'].id&&user.token)
    ||users[0].token===users[1].token)throw new Error('Venue fixture requires two separately confirmed callers.');
  const ids=plan.rows.map(row=>row.id);
  const direct=new URL('/rest/v1/affairs_venue_requests','https://xiftudmvxphxcjtmfmib.supabase.co');
  direct.search=new URLSearchParams({select:fields.join(','),id:'in.('+ids.join(',')+')',order:'id.asc',limit:'3'});
  return Promise.all(users.map(async({id,token},index)=>{
    const mine=new URL('/api/affairs-data?scope=venue-requests&view=mine',origin);
    const manage=new URL('/api/affairs-data?scope=venue-requests&view=manage',origin);
    const init={method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+token},signal};
    const [native,rows,denied]=await Promise.all([
      previewFetch(mine,init).then(response=>readResponse(response,mine,12000)),
      directFetch(direct,{...init,headers:{...init.headers,apikey:publishable}}).then(response=>readResponse(response,direct,12000)),
      previewFetch(manage,init).then(response=>readResponse(response,manage,4096,403)),
    ]);
    const expected=plan.rows.filter(row=>row.user_id===id).map(selected);
    if(!fieldsMatch(native,['userId','rows'])||native.userId!==id||!isDeepStrictEqual(native.rows,expected)
      ||!isDeepStrictEqual(rows,expected)||!fieldsMatch(denied,['error'])||typeof denied.error!=='string'
      ||ids.some(recordId=>denied.error.includes(recordId)))throw new Error('Venue owner projection or management denial did not match.');
    return {role:index===0?'A':'B',count:rows.length,projectionDigest:digest(rows),crossedVisible:0,managementDenied:true};
  }));
}

export async function requestVenueProtectedCase({boundCase,plan,origin,sourceRevision,token,key,signal,fetchImpl,readResponse,correlations,privateMarkers}){
  const {testCase,role,scope}=boundCase,guest=role==='guest';
  const expectedCase=venueProtectedCases().find(row=>row.testCase.id===testCase.id);
  if(!isDeepStrictEqual(boundCase,expectedCase)||Boolean(token)===guest)throw new Error('Venue case or caller selection changed before dispatch.');
  const request={question:testCase.question,route:testCase.route,history:testCase.history,stream:false,consentedResearchUse:false};
  const probe=guest?null:createVenueProbe({ownerId:plan.owners[role].id,runId:plan.runId,origin,sourceRevision,nonce:randomUUID()},request,key);
  const endpoint=new URL(guest?'/api/research-assistant':testCase.endpoint,origin);
  const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',credentials:'omit',headers:{
    'Content-Type':'application/json',Accept:'application/json',...(guest?{}:{Authorization:'Bearer '+token}),
  },body:JSON.stringify(probe?.body??request),signal});
  const receipt=response.headers.get(venueObservationHeader),correlationId=response.headers.get('x-assistant-request-id');
  const body=await readResponse(response,endpoint,64000);
  const failures=[];
  const events=body.activity??[],reader=events.filter(step=>String(step?.kind).startsWith('account-read:'));
  const expected=expectedVenueProtectedRead(plan,boundCase);
  const proof=guest?null:verifyVenueObservation({receipt,binding:probe.binding,correlationId,body},key);
  if(privateMarkers.some(marker=>typeof marker==='string'&&marker&&JSON.stringify(body).includes(marker))
    ||/"(?:user_id|userid|request_id|requestid|purpose|review_note|reviewnote)"\s*:/iu.test(JSON.stringify(body)))
    failures.push('venue.private_field');
  if(guest?Boolean(receipt):!proof||correlations.has(correlationId))failures.push('venue.signed_observation');
  else if(proof)correlations.add(correlationId);
  if(proof&&(!isDeepStrictEqual(proof.read,expected)||proof.verificationMethod!==(scope?'native-exact':'none')))
    failures.push('venue.scope_or_projection');
  if(scope){
    if(!isDeepStrictEqual(reader.map(({kind,status})=>[kind,status]),[['account-read:venueRequests:1','complete']])
      ||!events.some(step=>step.kind==='verification-1'&&step.status==='complete')
      ||!isDeepStrictEqual(body.verification,{status:'verified',attempts:1})||body.grounding?.source!=='account'
      ||body.views!==undefined)
      failures.push('venue.native_verified_activity');
  }else if(reader.length||body.verification||body.views!==undefined)failures.push('venue.boundary_activity');
  if(events.some(row=>/public.search|compose|provider|model|research|action/iu.test(String(row.kind)))||body.grounding?.webSearched!==false)
    failures.push('venue.unexpected_activity');
  if(guest&&body.grounding?.source!=='directory')failures.push('venue.guest_source');
  const grade=gradeCase({...testCase,executionContract:'live-native'},
    {statusCode:response.status,fixtureKey:testCase.fixtureKey,body,events,execution:'live-native'});
  failures.push(...grade.failures.map(item=>item.id));
  return {caseId:testCase.id,role,passed:failures.length===0,failures,observed:Boolean(proof),
    completedNativeCheck:proof?.verificationMethod==='native-exact',
    ...(proof?{correlationId,readDigest:proof.read?.readDigest??null,projectionDigest:proof.read?.evidenceDigest??null,
      responseDigest:proof.responseDigest,receiptDigest:digest(receipt)}:{})};
}

export function hasVenueProtectedProof(results){
  const cases=venueProtectedCases(),correlations=new Set();
  return Array.isArray(results)&&results.length===cases.length&&results.every((row,index)=>{
    const {role,testCase,scope}=cases[index];
    const callers=row?.before?.callers;
    if(row?.caseId!==testCase.id||row.role!==role||row.requestIndex!==index+1||row.passed!==true||row.failures?.length!==0
      ||!hash.test(row.before?.rowsDigest)||!isDeepStrictEqual(row.before,row.after)
      ||index&&!isDeepStrictEqual(results[index-1].after,row.before)
      ||!Array.isArray(callers)||callers.length!==2||!callers.every((item,i)=>item.role===(i===0?'A':'B')
        &&item.count===1&&item.crossedVisible===0&&item.managementDenied===true&&hash.test(item.projectionDigest)))return false;
    if(role==='guest')return row.observed===false&&row.completedNativeCheck===false&&row.correlationId===undefined;
    if(!row.observed||typeof row.correlationId!=='string'||correlations.has(row.correlationId)
      ||![row.responseDigest,row.receiptDigest].every(value=>hash.test(value))
      ||row.completedNativeCheck!==Boolean(scope)||(scope?![row.readDigest,row.projectionDigest].every(value=>hash.test(value))
        :row.readDigest!==null||row.projectionDigest!==null))return false;
    correlations.add(row.correlationId);return true;
  });
}
