import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createStudentLeaveFixtureLifecycle} from './student-leave-fixture-lifecycle.mjs';
import {
  bindStudentLeaveFixtureCase,buildStudentLeaveFixturePlan,checkedStudentLeaveFixtureBinding,
  freezeLeaveFixture,leaveFixtureDigest,leaveFixtureExact,leaveFixtureTables,studentLeaveFixtureManifest,StudentLeaveFixtureError,
} from './student-leave-fixture-plan.mjs';

const {forms,reviews}=leaveFixtureTables;
const endpoint='/api/affairs-assistant';
const source='account:leaveRecords';
const base='/school-affairs/services/leave';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const privateMarkers=/STUDENT_PRIVATE_REASON|FOREIGN PRIVATE SENTINEL|000-000-0000/u;
const cases=new Map(studentLeaveFixtureManifest.cases.map(row=>[row.caseId,row]));
const allowed=new Set(['leave_state_available','boundary_setup_available']);
const effects=['snapshotLoads','companionReads','publicResearch','externalActions','databaseWrites','providerCalls','answerPipelineEntries'];
const fields=['dates','status','category','periods','reviewStatus'];
const filters={categories:{included:[],excluded:[]},statuses:{included:[],excluded:[]}};
class OfflineStudentLeaveError extends Error{
  constructor(code){super('Offline Student Leave evaluation '+code+'.');this.code=code;}
}
function requireOffline(ok,code){if(!ok)throw new OfflineStudentLeaveError(code);}

/** Digests the actual evidence DTO without forwarding its contents to a report.
 * This capture helper is for an injected trusted observer at the reader boundary.
 * Receipt values copied from an assistant response are never an observation. */
export function captureOfflineStudentLeaveEvidence(result){
  requireOffline(leaveFixtureExact(result,['readState','reason','evidence'])
    &&leaveFixtureExact(result.evidence,['id','title','url','urls','provenance','content'])
    &&typeof result.evidence.content==='string'&&Buffer.byteLength(result.evidence.content)<=12000
    &&!privateMarkers.test(result.evidence.content)
    &&typeof result.evidence.url==='string'&&result.evidence.url.startsWith(base+'/'),'invalid_evidence');
  let payload;
  try{payload=JSON.parse(result.evidence.content);}catch{requireOffline(false,'invalid_evidence');}
  requireOffline(leaveFixtureExact(payload,['collection','readState','reason','checkedAt','selection','counts','records','complete','provenance','rules'])
    &&payload.readState===result.readState&&payload.reason===result.reason
    &&typeof payload.checkedAt==='string'&&Number.isFinite(Date.parse(payload.checkedAt))
    &&typeof payload.rules==='string','invalid_evidence');
  const {checkedAt,rules,...selected}=payload;
  void checkedAt;void rules;
  const {content,...metadata}=result.evidence;
  void content;
  return freezeLeaveFixture({...metadata,dtoDigest:leaveFixtureDigest(selected)});
}

function projectedFetch(projectRef,table,ownerId,query,matched,limit,rowsDigest){
  const url=new URL('/rest/v1/'+table,'https://'+projectRef+'.supabase.co');
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
  const selected=matched.slice(0,limit).map(row=>Object.fromEntries(query.select.split(',').map(key=>[key,row[key]])));
  return {
    callerId:ownerId,method:'GET',url:url.href,prefer:'count=exact',statusCode:selected.length<matched.length?206:200,
    contentRange:selected.length?'0-'+(selected.length-1)+'/'+matched.length:'*/0',rowsDigest:rowsDigest(selected),
  };
}

// Derive the oracle from the frozen question definition and fixture rows. The
// runtime selector, reader and answer body are not inputs to this expectation.
export function expectedAttempt(plan,bound,rowsDigest=leaveFixtureDigest){
  const {sourceView,recordId,selectedFields,expectedReadState}=bound.plannedRead;
  // This original empty case encodes its exact date in the frozen question,
  // without a range field. Keep that independent expectation explicit here.
  const dateRange=bound.caseId==='account:student-leave-native-confirmed-empty'
    ?{from:'2026-11-18',through:'2026-11-18'}:bound.plannedRead.dateRange;
  const selected=fields.filter(field=>selectedFields.includes(field));
  const ownerId=bound.ownerId,{projectRef}=plan.binding;
  const formColumns=['id','user_id','service_key','record_type','starts_on','ends_on',
    ...(selected.includes('status')?['status']:[]),...(selected.includes('category')?['leave_category']:[]),
    ...selected.filter(field=>field==='periods'||field==='reviewStatus').map(field=>field==='periods'?field:'review_request_id'),
  ];
  requireOffline(selected.length>0&&selected.length===selectedFields.length&&['ok','empty'].includes(expectedReadState),'unsupported_oracle');
  const archive=sourceView==='archive';
  const matched=plan.rows[forms].filter(row=>row.user_id===ownerId&&(!recordId||row.id===recordId)&&(!archive||row.starts_on<'2019-08-01')
    &&(!dateRange||row.starts_on<=dateRange.through&&row.ends_on>=dateRange.from))
    .sort((a,b)=>b.starts_on.localeCompare(a.starts_on)||a.id.localeCompare(b.id));
  const dateFilters=[...(archive?['starts_on.lt.2019-08-01']:[]),...(dateRange?['starts_on.lte.'+dateRange.through,'ends_on.gte.'+dateRange.from]:[])];
  const limit=recordId?1:80;
  requireOffline(matched.length<=limit&&Boolean(matched.length)===(expectedReadState==='ok'),'unsupported_oracle');
  const reads=[projectedFetch(projectRef,forms,ownerId,{
    select:formColumns.join(','),user_id:'eq.'+ownerId,service_key:'eq.leave',record_type:'eq.leave',
    ...(recordId?{id:'eq.'+recordId}:{}),...(dateFilters.length?{and:'('+dateFilters.join(',')+')'}:{}),
    order:'starts_on.desc,id.asc',limit,
  },matched,limit,rowsDigest)];
  const linkedIds=selected.includes('reviewStatus')?matched.map(row=>row.review_request_id).filter(Boolean).sort():[];
  const linked=plan.rows[reviews].filter(row=>row.user_id===ownerId&&linkedIds.includes(row.id));
  requireOffline(linked.length===linkedIds.length,'unsupported_oracle');
  if(linkedIds.length)reads.push(projectedFetch(projectRef,reviews,ownerId,{
    select:'id,user_id,request_type,status',user_id:'eq.'+ownerId,request_type:'eq.general',id:'in.('+linkedIds.join(',')+')',
    order:'id.asc',limit:linkedIds.length,
  },linked,linkedIds.length,rowsDigest));
  const records=matched.map(row=>Object.fromEntries(selected.flatMap(field=>{
    if(field==='dates')return [['startsOn',row.starts_on],['endsOn',row.ends_on]];
    if(field==='category')return [['category',row.leave_category]];
    if(field==='reviewStatus')return [['reviewStatus',linked.find(item=>item.id===row.review_request_id)?.status??null],
      ['reviewState',row.review_request_id?'saved':'no_request']];
    return [[field,row[field]]];
  })));
  const n=matched.length,url=recordId?base+'/edit/'+recordId:base+'/'+sourceView;
  const dtoDigest=leaveFixtureDigest({
    collection:'leaveRecords',readState:expectedReadState,reason:null,
    selection:{view:sourceView,range:dateRange,filters,fields:selected,countOnly:false},
    counts:{matching:n,returned:n,included:n,unread:0,omitted:0,reviewUnavailable:0},records,complete:true,
    provenance:{sourceMode:'saved_local',system:'stu.best School Affairs',officialUniversityData:false,synchronized:false},
  });
  return {reads,evidence:{id:source,title:'Saved student leave records',url,urls:[url],provenance:'saved_local',dtoDigest}};
}

/** Request fingerprint at either independently observed ingress or evaluator
 * dispatch. Keep the exact body and digest out of user-facing reporting. */
export function offlineStudentLeaveRequestDigest(origin,request){
  return leaveFixtureDigest({method:'POST',url:new URL(endpoint,origin).href,request});
}

function verifyObservation({observed,scope,response,attempt}){
  requireOffline(leaveFixtureExact(response,['statusCode','body','correlationId'])&&response.statusCode===200
    &&typeof response.correlationId==='string'&&uuid.test(response.correlationId),'invalid_response');
  const responseBody=JSON.stringify(response.body);
  requireOffline(typeof responseBody==='string'&&Buffer.byteLength(responseBody)<=128000&&!privateMarkers.test(responseBody),'invalid_response');
  requireOffline(leaveFixtureExact(observed,['complete','scope','callerId','requestDigest','correlationId','responseDigest','effects','totals','attempts'])
    &&observed.complete===true&&isDeepStrictEqual(observed.scope,scope)&&observed.callerId===scope.ownerId
    &&observed.requestDigest===scope.requestDigest&&observed.correlationId===response.correlationId
    &&typeof observed.responseDigest==='string'&&sha.test(observed.responseDigest)
    &&observed.responseDigest===leaveFixtureDigest({statusCode:response.statusCode,body:response.body}),'observation_mismatch');
  const counters=Object.fromEntries(effects.map(name=>[name,name==='answerPipelineEntries'&&attempt?1:0]));
  requireOffline(isDeepStrictEqual(observed.effects,counters),'unexpected_effect');
  const observations=observed.attempts;
  requireOffline(Array.isArray(observations)&&observations.length>=(attempt?1:0)&&observations.length<=(attempt?2:0)
    &&isDeepStrictEqual(observed.totals,{scopedReaderEntries:observations.length,scopedPostgrestRequests:observations.length*(attempt?.reads.length??0)})
    &&observations.every(row=>isDeepStrictEqual(row,attempt)),'read_observation_mismatch');
  return observations.length;
}

/** Offline-only evaluator adapter. The two injected callbacks have separate
 * duties: executeRequest sends the case with the verified owner's session;
 * openObservation observes ingress, request-scoped reads/effects and response
 * at independent boundaries. It receives no fixture plan, oracle or answer. */
export function createOfflineStudentLeaveEvaluationAdapter({binding,fixtureDependencies,executeRequest,openObservation}={}){
  const safeBinding=checkedStudentLeaveFixtureBinding(binding);
  requireOffline(typeof executeRequest==='function'&&typeof openObservation==='function','invalid_dependencies');
  const lifecycle=createStudentLeaveFixtureLifecycle({binding:safeBinding,dependencies:fixtureDependencies});
  let busy=false,blocked=false;
  const seenCorrelations=new Set();
  async function runCase(testCase){
    requireOffline(!busy&&!blocked,'adapter_unavailable');
    const definition=cases.get(testCase?.id);
    requireOffline(definition&&allowed.has(definition.availability),'case_unavailable');
    const plan=buildStudentLeaveFixturePlan({binding:safeBinding,family:definition.family});
    const bound=bindStudentLeaveFixtureCase(plan,testCase);
    const attempt=bound.plannedRead.requiresScopedRecordRead?expectedAttempt(plan,bound):null;
    const request=freezeLeaveFixture({question:bound.question,route:bound.route,history:bound.history,stream:false,consentedResearchUse:false});
    busy=true;
    let capture,completed=false;
    try{
      const before=await lifecycle.transition(plan);
      const scope=freezeLeaveFixture({
        mode:'offline-student-leave',caseId:bound.caseId,runId:bound.runId,projectRef:safeBinding.projectRef,
        origin:bound.origin,ownerId:bound.ownerId,sourceRevision:bound.sourceRevision,suiteHash:bound.suiteHash,
        caseNonce:randomUUID(),fixtureRowDigest:before.rowDigest,requestDigest:offlineStudentLeaveRequestDigest(bound.origin,request),
      });
      capture=await openObservation(scope);
      requireOffline(leaveFixtureExact(capture,['finish','abort'])&&typeof capture.finish==='function'&&typeof capture.abort==='function','invalid_observer');
      const response=await executeRequest(freezeLeaveFixture({ownerId:bound.ownerId,origin:bound.origin,endpoint,request}));
      requireOffline(typeof response?.correlationId==='string'&&uuid.test(response.correlationId)
        &&!seenCorrelations.has(response.correlationId),'correlation_mismatch');
      seenCorrelations.add(response.correlationId);
      const observed=await capture.finish(response.correlationId);
      completed=true;
      const attempts=verifyObservation({observed,scope,response,attempt});
      const after=await lifecycle.verifyUnchanged();
      requireOffline(isDeepStrictEqual(before,after),'fixture_changed');
      return freezeLeaveFixture({mode:'offline-student-leave',caseId:bound.caseId,caseNonce:scope.caseNonce,correlationId:response.correlationId,
        scopeDigest:leaveFixtureDigest(scope),fixtureRowDigest:scope.fixtureRowDigest,requestDigest:scope.requestDigest,responseDigest:observed.responseDigest,
        observedReadAttempts:attempts,observedDataRequests:attempts*(attempt?.reads.length??0),
        observationVerified:true,answerBehaviorEvaluated:false,liveAcceptance:false});
    }catch(error){
      blocked=true;
      if(error instanceof OfflineStudentLeaveError||error instanceof StudentLeaveFixtureError)throw error;
      throw new OfflineStudentLeaveError('request_failed');
    }finally{
      if(!completed&&typeof capture?.abort==='function')await Promise.resolve().then(()=>capture.abort()).catch(()=>{});
      busy=false;
    }
  }
  return Object.freeze({runCase,cleanup(){
    requireOffline(!busy,'adapter_unavailable');
    blocked=true;
    return lifecycle.cleanup();
  }});
}
