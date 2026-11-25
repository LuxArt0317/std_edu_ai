import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {gradeCase} from './grading.mjs';
import {buildHealthExaminationCases,buildPlannedHealthExaminationCases} from './health-examination-cases.mjs';
import {healthExaminationFixtureCaseBinding,healthExaminationFixtureManifest,healthExaminationFixtureReadContract,
  verifyHealthExaminationFixtureReadback} from './health-examination-fixture-plan.mjs';

export const healthMetadataFamily='health-examination-metadata';
export const healthMetadataFixtureMode='health-examination-metadata-only';
export const healthMetadataRequirement='health_metadata_disposable';
export const healthMetadataEndpoint='/api/affairs-assistant';
const {projectRef}=healthExaminationFixtureManifest;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const nativeCases=new Map(buildHealthExaminationCases().map(row=>[row.id,row]));
const eligible=new Set(healthExaminationFixtureManifest.metadataOnlyCaseIds);
const cases=buildPlannedHealthExaminationCases().filter(row=>eligible.has(row.id)).map(row=>({
  ...row,endpoint:healthMetadataEndpoint,fixtureRequirement:healthMetadataRequirement,
  plannedFixture:{...row.plannedFixture,mounted:true},
  capability:{level:'native',gap:false,limitation:null},
}));

export function healthMetadataLiveCases(){return structuredClone(cases);}

export function assertHealthMetadataLiveCases(selected){
  if(!isDeepStrictEqual(selected,cases))throw new Error('Health metadata requires the complete frozen metadata-only packet.');
}

export function healthMetadataCase(testCase){
  const expectedCase=cases.find(row=>row.id===testCase?.id);
  if(!expectedCase||!isDeepStrictEqual(testCase,expectedCase))throw new Error('Health metadata case does not match the frozen packet.');
  const plan=healthExaminationFixtureCaseBinding(testCase);
  return {family:plan.fixtureKey,...nativeCases.get(testCase.id).nativeExpectation};
}

export function healthMetadataRequest(testCase){
  return JSON.stringify({question:testCase.question,history:testCase.history||[],route:testCase.route,
    stream:true,consentedResearchUse:false});
}

export function healthMetadataDispatch(endpoint,body){return {endpoint,bodySha256:digest(body)};}

function scopeReads(page){
  // The second caller's first page is always a positive isolation control.
  return [{role:'A',page},{role:'B',page:1},...(page===1?[]:[{role:'B',page}])];
}

export async function readHealthMetadataPages(plan,page,users,{origin,fetchImpl,readResponse,signal}){
  if(!Array.isArray(users)||users.length!==2||!users.every((user,index)=>user.id===plan.owners[index===0?'A':'B'].id
    &&typeof user.token==='string'&&user.token)||users[0].token===users[1].token)
    throw new Error('Health metadata readback needs both enrolled disposable callers.');
  const observations=[];
  for(const selector of scopeReads(page)){
    const contract=healthExaminationFixtureReadContract(plan,selector);
    const user=users.find(candidate=>candidate.id===contract.ownerId);
    const url=new URL(contract.path,origin);
    url.search=new URLSearchParams(contract.query);
    const response=await fetchImpl(url,{method:contract.method,redirect:'error',credentials:'omit',cache:'no-store',
      headers:{Authorization:'Bearer '+user.token},signal});
    const actual=await readResponse(response,url,32768);
    verifyHealthExaminationFixtureReadback(plan,selector,actual);
    // Private identity markers and row IDs never enter the report.
    observations.push({...selector,total:actual.total,count:actual.rows.length,
      sha256:digest(actual.rows.map(({examination_code,report_available})=>[examination_code,report_available]))});
  }
  return observations;
}

function expectedReadback(family,{role,page}){
  const paged=family==='paged:healthExaminations',start=(page-1)*25;
  const total=role==='B'?1:paged?26:family==='healthExaminations'?3:0;
  const count=Math.min(25,Math.max(0,total-start));
  const rows=Array.from({length:count},(_,index)=>{
    const code=role==='B'?'FOREIGN HEALTH METADATA':(paged?'QA HEALTH PAGE ':'QA HEALTH A-')+String(start+index+1).padStart(2,'0');
    return [code,false];
  });
  return {role,page,total,count,sha256:digest(rows)};
}

export function bindHealthMetadataReadback(testCase,envelope,{before,after}){
  const oracle=healthMetadataCase(testCase),anonymous=testCase.fixtureKey==='anonymous',ticket=envelope.deploymentCheck;
  const request=healthMetadataDispatch(healthMetadataEndpoint,healthMetadataRequest(testCase));
  const expectedReadbacks=scopeReads(oracle.page).map(selector=>expectedReadback(oracle.family,selector));
  const sourceDigest=before?.rowsSha256;
  const events=envelope.events??[];
  const attempts=envelope.body?.verification?.attempts;
  const readsObserved=events.filter(step=>step.kind?.startsWith('account-read:'));
  const readStatus=testCase.expected.toolTerminalStates.healthExaminations?.[0];
  const terminalReads=readsObserved.filter(step=>step.status!=='running');
  const expectedEvents=terminalReads.flatMap((_,index)=>{
    const kind='account-read:healthExaminations:'+(index+1);
    return [[kind,'running'],[kind,readStatus]];
  });
  const expectedStatus=anonymous?401:200;
  if(envelope.execution!=='live-model'||envelope.statusCode!==expectedStatus||envelope.deploymentIntegrityFailed
    ||envelope.fixtureIntegrityFailed||(!anonymous&&!uuid.test(envelope.correlationId))
    ||(anonymous&&(envelope.correlationId!==undefined||events.length!==0))
    ||!/^[a-f0-9]{40}$/u.test(envelope.sourceRevision??'')||ticket?.verified!==true
    ||ticket.sourceRevision!==envelope.sourceRevision||!Number.isSafeInteger(ticket.requestIndex)||ticket.requestIndex<1
    ||!isDeepStrictEqual(envelope.healthMetadataDispatch,request)
    ||!sha.test(sourceDigest??'')||!isDeepStrictEqual(before?.pages,expectedReadbacks)||!isDeepStrictEqual(before,after))
    throw new Error('Health metadata evidence does not match the pinned request and both unchanged caller scopes.');
  if(readStatus!==undefined&&(!Number.isInteger(attempts)||attempts<1||attempts>3
    ||!terminalReads.length||terminalReads.length>attempts
    ||!isDeepStrictEqual(readsObserved.map(({kind,status})=>[kind,status]),expectedEvents))){
    throw new Error('Observed assistant activity did not match the bounded health metadata selector.');
  }
  if(readStatus===undefined&&readsObserved.length)throw new Error('A denied health metadata request executed an account reader.');
  return {caseId:testCase.id,sourceRevision:envelope.sourceRevision,requestIndex:ticket.requestIndex,
    ...(anonymous?{}:{correlationId:envelope.correlationId}),request,before,after,
    method:'pinned response and paired scoped metadata readbacks with unchanged synthetic SQL rows'};
}

export function verifiedHealthMetadataReadback(testCase,envelope){
  const fixture=envelope.fixtureReadback;
  if(fixture?.verified!==true||fixture.independentGolden!==true||fixture.projectRef!==projectRef||!fixture.healthMetadata)return false;
  try{return isDeepStrictEqual(fixture.healthMetadata,bindHealthMetadataReadback(testCase,envelope,fixture.healthMetadata));}
  catch{return false;}
}

export function gradeHealthMetadataLiveCase(testCase,envelope){
  const result=gradeCase(testCase,envelope);
  const proof={id:'health.pinnedReadback',passed:verifiedHealthMetadataReadback(testCase,envelope),
    detail:'The protected Preview response and both unchanged scoped metadata readbacks match the frozen request.'};
  result.checks.push(proof);
  if(!proof.passed)result.failures.push(proof);
  result.passed=result.failures.length===0;
  return result;
}
