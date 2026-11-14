/**
 * Disposable, account-private evaluation fixtures for the exact client project.
 * Importing this module performs no I/O and reads no credentials. prepare() is
 * the explicit mutation boundary; callers must hold the project DB lease.
 * Never use a real account, alter shared catalog/notices, or execute proposals.
 */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,readdir,mkdir,open,rename,rm,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {fixtureForCase,evaluationDates,EVAL_OTHER_USER_ID,supplementalFixtureRecords} from './fixtures.mjs';
import {loadNativeAcademicRecords} from '../../server/nativeAcademicWorkspace.js';
import {loadOwnAffairsCharges} from '../../server/affairsWorkspace.js';
import {mapScholarshipRecords} from '../../server/scholarshipRecords.js';
import {mapHousingRecords} from '../../server/housingRecords.js';
import {validateEnrollmentCertificatePayload} from '../../server/enrollmentCertificate.js';
import {validateTuitionDocumentPayload} from '../../server/tuitionDocuments.js';
import {validateStudentConductPayload} from '../../server/studentConduct.js';
import {parseStudentLoanSnapshot,validateStudentLoanPayload} from '../../server/studentLoan.js';
import {catalogTextFields,catalogNumberFields,catalogBooleanFields,catalogPeriods} from '../../src/features/public/affairs/courseCatalogModel.js';
import {normalizeCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {bindPublishedSampleEnrollments,sampleEnrollmentManifest} from './published-sample-enrollments.mjs';
import {assertPublishedNextClassClock} from './published-next-class.mjs';
import {createPinnedDeploymentVerifier} from './pinned-deployment.mjs';
import {assertElearningFixtureCatalog,assertElearningFixtureRows,elearningFixtureManifest,elearningFixturePlan,verifyElearningFixtureWorkspace} from './elearning-fixtures.mjs';
import {assertOutlineFixtureRows,assertPublishedOutlineRead,isOutlineFixtureKey,planPublishedOutlineAccess} from './elearning-outline-fixtures.mjs';
import {assertDormitoryConductFixtureIdentities,assertDormitoryConductFixtureRows,buildDormitoryConductFixturePlan,dormitoryConductFixtureReadContract,dormitoryConductLiveFixtureKey,reconcileDormitoryConductFixturePlans,verifyDormitoryConductFixtureReadback} from './dormitory-conduct-cases.mjs';
import {buildFacilityRepairFixturePlan,changeFacilityRepairFixtureRows,facilityRepairLiveFixtureKey,verifyFacilityRepairFixtureDatabase,verifyFacilityRepairFixtureReadback} from './facility-repair-fixtures.mjs';
import {aidPaymentFixtureManifest,aidPaymentFixtureReadContract,assertAidPaymentFixtureEmpty,assertAidPaymentFixtureIdentities,assertAidPaymentFixtureRowTargets,buildAidPaymentFixturePlan,verifyAidPaymentFixtureReadback} from './aid-payment-fixture-plan.mjs';
import {dtmGradeReportFixtureManifest,dtmGradeReportFixtureReadContract,assertDtmGradeReportFixtureEmpty,assertDtmGradeReportFixtureIdentities,assertDtmGradeReportFixtureCourseBindings,assertDtmGradeReportFixtureRowTargets,buildDtmGradeReportFixturePlan,verifyDtmGradeReportFixtureReadback} from './dtm-grade-report-fixture-plan.mjs';
import {buildFeeRemissionFixturePlan,feeRemissionLiveFamilyForCase,feeRemissionLivePlanManifest} from './fee-remission-live-plan.mjs';
import {createFeeRemissionFixtureLifecycle} from './fee-remission-fixture-lifecycle.mjs';
import {readRows as readFeeRows,deleteRows as deleteFeeRows,insertRows as insertFeeRows} from './fee-remission-fixture-sql.mjs';
import {createTranscriptConversationFixture} from './transcript-conversation-fixture.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const PROJECT='xiftudmvxphxcjtmfmib';
const PRIVATE_DIR=resolve(ROOT,'artifacts/assistant-evaluation');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PRIVATE_NATIVE_DOMAINS=['studentAid','creditLoadHistory','courseSelection','academicGrades','graduationReview','academicAttendance'];
const CONDITIONAL_NATIVE_DOMAINS=['courses','scholarship','housing'];
const SUPPLEMENTAL_SCOPES=Object.freeze({enrollmentCertificate:'enrollment-certificate',tuition:'tuition-documents',studentConduct:'student-conduct',studentLoan:'student-loan'});
const SUPPLEMENTAL_TABLES=Object.freeze({enrollmentCertificate:'affairs_enrollment_certificate_assessments',tuition:'affairs_tuition_settlements',studentConduct:'affairs_student_conduct',studentLoan:'affairs_student_loan'});
const SUPPORTED_TOOLS=new Set(['profile','charges','tasks','requests','serviceRecords','dtm','assignments','aidPayments','dtmGradeReport','elearningEnrollments','elearningOutline','facilityRepairs','dormitoryConduct',...PRIVATE_NATIVE_DOMAINS,...CONDITIONAL_NATIVE_DOMAINS,...Object.keys(SUPPLEMENTAL_SCOPES)]);
const FOREIGN_MARKER='FOREIGN PRIVATE SENTINEL';
const FEE_FIXTURE_MODE='fee-remission-only';
export const fixtureModes=Object.freeze([FEE_FIXTURE_MODE]);
export const catalogFixtureSetupReasons=Object.freeze(['catalog_read_unavailable','published_payload_invalid','public_scope_mismatch','no_suitable_published_offering','no_null_weight_offering','absent_probe_not_empty']);
const catalogKinds=Object.freeze({'account:catalog-known-fields':'known-fields','account:catalog-null-weight':'null-weight','account:catalog-unfound':'unfound','account:catalog-enrollment-distinction':'enrollment-distinction','account:catalog-mixed-dtm':'mixed-dtm','service:12-4:record':'known-fields','service:12-4:empty':'unfound'});
let state;

export class LiveFixtureError extends Error {
  constructor(kind,message){super(`[${kind}] ${message}`);this.name='LiveFixtureError';this.code=kind;}
}
const fail=(kind,message)=>{throw new LiveFixtureError(kind,message);};
// Object insertion order can depend on concurrent read completion. Normalize
// keys at every depth; retain array order and JSON's literal/date semantics.
function digestObjectKeys(_key,value){
  return value&&typeof value==='object'&&!Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value;
}
const hash=value=>createHash('sha256').update(JSON.stringify(value,digestObjectKeys)).digest('hex');
const timestamp=value=>value==null?null:new Date(value).toISOString();
const pick=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row[key]??null]));
const sort=rows=>[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
function signals(signal,ms=15000){return signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);}
function ready(){if(!state?.prepared||state.closing)fail('fixture-state','prepare() must complete before fixture access.');return state;}
const transcriptFixtureCases=Object.freeze([
  ['account:reproduction-record-overview','what do you know about my records',['profile','courses','dtm','assignments','charges','tasks','requests']],
  ['account:reproduction-current-courses-year','what courses i have for this semester and what year i am currently at',['profile','courses']],
  ['account:reproduction-remaining-balance','how much is my remaining balance in school',['charges']],
  ['account:reproduction-interview-help','i am asked what makes me qualified to be a software engineer i dont know what cna you help me?',[]],
]);
function assertTranscriptFixtureCase(testCase,index=transcriptFixtureCases.findIndex(row=>row[0]===testCase?.id)){
  const expected=transcriptFixtureCases[index];
  if(!expected||testCase?.id!==expected[0]||testCase.question!==expected[1]||testCase.route!=='/'||testCase.fixtureKey!=='published-sample:records'
    ||testCase.fixtureRequirement!==undefined||JSON.stringify(testCase.expected?.requiredTools)!==JSON.stringify(expected[2]))
    fail('fixture-config','The injected application transport supports only the exact four-turn published-sample packet.');
  return expected[0];
}
/** Only release metadata and a complete own snapshot may use this opt-in
 * application transport. Auth/admin/refresh credentials never use this hook.
 * The dependency owns any authorized Preview session; no cookie is discovered. */
export function createTranscriptFixtureApplicationFetch({origin,fetchImpl,signal,timeoutMs=45000}={}){
  let target;try{target=new URL(origin);}catch{fail('fixture-target','Invalid fixture application target.');}
  if(origin!==target.origin||target.protocol!=='https:'||target.username||target.password||target.port
    ||!(origin==='https://stu.best'||/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u.test(target.hostname))
    ||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>45000
    ||signal!==undefined&&!(signal instanceof AbortSignal))fail('fixture-config','Invalid fixture application transport.');
  return async(input,init={})=>{
    let url,headers;try{url=new URL(String(input));headers=new Headers(init.headers);}catch{fail('fixture-target','Invalid fixture application request.');}
    const manifest=url.pathname==='/release.json';
    if(url.origin!==origin||url.username||url.password||url.search||url.hash||!['/release.json','/api/affairs-data'].includes(url.pathname)
      ||(init.method??'GET')!=='GET'||init.body!==undefined||[...headers.keys()].some(key=>!['accept','authorization'].includes(key))
      ||manifest&&headers.has('authorization')||!manifest&&!/^Bearer [^\s\p{Cc}]+$/u.test(headers.get('authorization')||'')
      ||init.signal!==undefined&&!(init.signal instanceof AbortSignal))fail('fixture-target','The fixture application request is outside its read-only scope.');
    const controller=new AbortController(),active=AbortSignal.any([controller.signal,...[signal,init.signal].filter(Boolean)]),duration=Math.min(timeoutMs,manifest?8000:45000),expiresAt=Date.now()+duration;
    let timer,response,reader,onAbort;
    const cancel=()=>{if(reader)void reader.cancel().catch(()=>{});else if(response?.body)void response.body.cancel().catch(()=>{});};
    try{
      const work=async()=>{
        if(active.aborted||Date.now()>=expiresAt)throw Error();
        response=await fetchImpl(url.href,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers,signal:active});
        if(active.aborted||Date.now()>=expiresAt){cancel();throw Error();}
        if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')||''))throw Error();
        reader=response.body?.getReader();if(!reader)throw Error();
        const chunks=[];let bytes=0,iterations=0;const maximum=manifest?4096:8_000_000;
        for(;;){if(active.aborted||Date.now()>=expiresAt)throw Error();const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maximum||++iterations>4096)throw Error();if(value.byteLength)chunks.push(value);}
        const body=Buffer.concat(chunks);JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
        if(active.aborted||Date.now()>=expiresAt)throw Error();
        const result=new Response(body,{status:200,headers:{'content-type':'application/json'}});
        Object.defineProperty(result,'url',{value:url.href});return result;
      };
      return await Promise.race([work(),new Promise((_,reject)=>{
        onAbort=()=>{cancel();reject(Error());};active.addEventListener('abort',onAbort,{once:true});
        timer=setTimeout(()=>controller.abort(),duration);
      })]);
    }catch{fail('fixture-readback','The scoped fixture application response could not be verified.');}
    finally{
      clearTimeout(timer);if(onAbort)active.removeEventListener('abort',onAbort);controller.abort();cancel();
      if(reader)try{reader.releaseLock();}catch{/* Cancelled read may still settle. */}
    }
  };
}
/** Synthetic sessions stay in memory; no session or refresh token is serializable. */
export function attachFixtureSession(user,session,{url,publishable,signal,fetchImpl=fetch,clock=Date.now,timeoutMs=15000}={}){
  if(!UUID.test(user?.id||'')||url!=='https://'+PROJECT+'.supabase.co'||typeof publishable!=='string'||!publishable||typeof fetchImpl!=='function'||typeof clock!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)
    fail('fixture-session','Synthetic session configuration is invalid.');
  const ownerId=user.id,marginMs=180000,endpoint=url+'/auth/v1/token?grant_type=refresh_token';
  let accessToken=null,refreshToken=null,expiresAt=0,sessionId=null,pending=null,controller=null,closed=false;
  const validToken=value=>typeof value==='string'&&value.length>0&&value.length<=16384&&!/\s/.test(value);
  const accept=(value,initial=false)=>{
    let claims;
    try{
      if(!value||value.user?.id!==ownerId||!validToken(value.access_token)||!validToken(value.refresh_token)||value.token_type!=='bearer')throw new Error();
      const parts=value.access_token.split('.');
      if(parts.length!==3||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))throw new Error();
      claims=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(parts[1],'base64url')));
      if(claims?.sub!==ownerId||claims.iss!==url+'/auth/v1'||claims.role!=='authenticated'||claims.aud!=='authenticated'||!UUID.test(claims.session_id||'')||
        !Number.isSafeInteger(claims.exp)||claims.exp*1000<=clock()+(initial?0:marginMs)||claims.exp*1000>clock()+86400000||
        !initial&&claims.session_id!==sessionId||value.expires_at!==undefined&&(!Number.isSafeInteger(value.expires_at)||Math.abs(value.expires_at-claims.exp)>30))throw new Error();
    }catch{fail('fixture-session','Synthetic session identity, lineage or expiry could not be verified.');}
    accessToken=value.access_token;refreshToken=value.refresh_token;expiresAt=claims.exp*1000;sessionId=claims.session_id;
  };
  const clear=()=>{closed=true;accessToken=null;refreshToken=null;expiresAt=0;sessionId=null;controller?.abort();};
  accept(session,true);session=null;
  Object.defineProperty(user,'id',{value:ownerId,writable:false,configurable:false,enumerable:true});
  Object.defineProperty(user,'token',{enumerable:false,configurable:false,get:()=>accessToken,set:value=>{
    if(value!==null)fail('fixture-session','Synthetic session credentials cannot be replaced externally.');
    clear();
  }});
  const renew=async({signal:callerSignal}={})=>{
    const requestSignal=signal&&callerSignal?AbortSignal.any([signal,callerSignal]):signal||callerSignal;
    if(closed||user.id!==ownerId||!accessToken||!refreshToken)fail('fixture-session','Synthetic session is closed or unavailable.');
    if(requestSignal?.aborted)fail('fixture-aborted','Evaluation was interrupted before session renewal.');
    if(expiresAt-clock()>marginMs)return;
    if(pending){
      // A joining caller can cancel its own wait, but does not own the shared
      // operation. The attached run signal still aborts the operation itself.
      if(!requestSignal)return pending;
      return new Promise((resolve,reject)=>{
        const finish=(callback,value)=>{requestSignal.removeEventListener('abort',aborted);callback(value);};
        const aborted=()=>finish(reject,new LiveFixtureError('fixture-aborted','Evaluation was interrupted while awaiting session renewal.'));
        requestSignal.addEventListener('abort',aborted,{once:true});
        pending.then(value=>finish(resolve,value),error=>finish(reject,error));
      });
    }
    controller=new AbortController();
    const activeController=controller;
    pending=(async()=>{
      let timer,reader,response;
      const aborted=()=>activeController.abort();
      requestSignal?.addEventListener('abort',aborted,{once:true});
      try{
        // Exactly one Auth refresh attempt. A timeout may have rotated the
        // refresh token, so it is never silently retried or used for sign-in.
        const interrupted=new Promise((_,reject)=>{
          activeController.signal.addEventListener('abort',()=>reject(new LiveFixtureError('fixture-session','Synthetic session renewal did not complete.')),{once:true});
          timer=setTimeout(()=>activeController.abort(),timeoutMs);
        });
        const operation=(async()=>{
          response=await fetchImpl(endpoint,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',headers:{apikey:publishable,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refreshToken}),signal:activeController.signal});
          if(activeController.signal.aborted){void response.body?.cancel().catch(()=>{});fail('fixture-session','Synthetic session renewal did not complete.');}
          if(response.redirected||response.url&&response.url!==endpoint||response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))
            fail('fixture-session','Synthetic session renewal was rejected.');
          const length=response.headers.get('content-length');
          if(length!==null&&(!/^\d+$/.test(length)||Number(length)>65536))fail('fixture-session','Synthetic session response exceeded its bound.');
          reader=response.body?.getReader();if(!reader)fail('fixture-session','Synthetic session response is unavailable.');
          const chunks=[];let size=0;
          for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)fail('fixture-session','Synthetic session response exceeded its bound.');chunks.push(part.value);}
          const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
          if(closed||activeController.signal.aborted)fail('fixture-session','Synthetic session was closed during renewal.');
          accept(value);
        })();
        await Promise.race([operation,interrupted]);
      }catch{clear();fail('fixture-session','Synthetic session renewal failed; no model request was retried.');}
      finally{clearTimeout(timer);requestSignal?.removeEventListener('abort',aborted);activeController.abort();if(reader)void reader.cancel().catch(()=>{});else void response?.body?.cancel().catch(()=>{});controller=null;}
    })();
    try{await pending;}finally{pending=null;}
  };
  Object.defineProperties(user,{renewSession:{value:renew},clearSession:{value:clear}});
  return user;
}
/** Metadata only: never forward PostgreSQL message/detail/query or row values. */
export function safeDatabaseDiagnostic(error){
  const fields=[];
  if(/^[A-Z0-9_]{2,35}$/.test(String(error?.code)))fields.push('code '+error.code);
  const identifier=value=>typeof value==='string'&&value.length<=63&&/^(?:affairs_|dtm_)[a-z0-9_]+$/.test(value);
  if(identifier(error?.table_name)||['identities','users'].includes(error?.table_name))fields.push('table '+error.table_name);
  if(identifier(error?.constraint_name))fields.push('constraint '+error.constraint_name);
  return fields.length?' ('+fields.join('; ')+')':'';
}
const diagnostic=safeDatabaseDiagnostic;
async function query(work,label){try{return await work();}catch(error){if(error instanceof LiveFixtureError)throw error;fail('fixture-database',label+diagnostic(error));}}
function checkedProtectedOwnerFingerprint(value){
  const keys=['id','auth_hash','profile_hash','identities_hash'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key))||
    !UUID.test(value.id||'')||!keys.slice(1).every(key=>typeof value[key]==='string'&&/^[a-f0-9]{32}$/.test(value[key])))
    fail('fixture-protected-owner','The protected owner identity and profile baseline could not be verified.');
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,value[key]])));
}
/** Read only the exact configured administrator; never authenticate as that account. */
export async function readProtectedOwnerFingerprint(sql,ownerEmail){
  if(typeof sql!=='function'||typeof ownerEmail!=='string'||ownerEmail.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))
    fail('fixture-protected-owner','The fixed protected owner configuration is invalid.');
  let rows;
  try{
    rows=await sql`select u.id,
      md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,
      md5(to_jsonb(p)::text) as profile_hash,
      (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text)
       from auth.identities i where i.user_id=u.id) as identities_hash
      from auth.users u join public.affairs_profiles p on p.user_id=u.id
      where lower(u.email)=lower(${ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
        and exists(select 1 from auth.identities g where g.user_id=u.id and g.provider='google') limit 2`;
  }catch{fail('fixture-protected-owner','The protected owner identity and profile fingerprint could not be read.');}
  if(!Array.isArray(rows)||rows.length!==1)fail('fixture-protected-owner','Exactly one existing confirmed Google administrator must match the protected owner.');
  return checkedProtectedOwnerFingerprint(rows[0]);
}
export function assertProtectedOwnerUnchanged(before,after){
  const baseline=checkedProtectedOwnerFingerprint(before),current=checkedProtectedOwnerFingerprint(after);
  if(Object.keys(baseline).some(key=>baseline[key]!==current[key]))
    fail('fixture-protected-owner','The protected owner identity or profile changed; the recovery ledger is retained for independent review.');
  return true;
}
export function protectedOwnerFingerprintDigest(value){return hash(checkedProtectedOwnerFingerprint(value));}
async function assertNoPendingRecoveryLedgers(){
  if(!state?.locked)fail('fixture-lease','The fixture lock must be held before inspecting recovery ledgers.');
  let names;
  try{names=await readdir(PRIVATE_DIR);}
  catch{fail('fixture-ledger','Recovery ledgers could not be checked; no fixture account will be created.');}
  if(names.some(name=>{
    const match=/^active-fixtures-(.+)\.json(?:\.tmp)?$/.exec(name);
    return match&&UUID.test(match[1]);
  }))fail('fixture-ledger','An existing fixture recovery ledger requires explicit manual recovery before another fixture run; no ledger or account was changed.');
}
async function reserveLedger(){
  const s=state;
  if(!s?.ledger||s.ledgerOwned)fail('fixture-ledger','A fresh private cleanup ledger must be reserved once.');
  let handle;
  try{handle=await open(s.ledger,'wx',0o600);s.ledgerOwned=true;}
  catch{fail('fixture-ledger','The cleanup ledger already exists or could not be reserved; existing recovery records will not be modified.');}
  finally{await handle?.close();}
}
async function saveLedger(){
  const s=state;if(!s?.ledger)return;
  if(!s.ledgerOwned||s.closed)fail('fixture-ledger','This lifecycle does not own an open cleanup ledger.');
  const protectedOwner={version:1,fingerprint:protectedOwnerFingerprintDigest(s.protectedOwnerBefore)};
  const tmp=s.ledger+'.tmp';
  let handle;
  try{
    // A foreign stale temporary ledger is not ours to overwrite or remove.
    handle=await open(tmp,s.ledgerTempOwned?'w':'wx',0o600);s.ledgerTempOwned=true;
    await handle.writeFile(JSON.stringify({version:1,projectRef:PROJECT,runId:s.runId,origin:s.origin,createdAt:s.startedAt,
      protectedOwner,fixtureUserIds:s.users.map(user=>user.id),identityRequests:s.identityRequests,ownedRecordIds:[...s.recordIds].sort(),supplementalTables:[...(s.supplementalTables||[])].sort(),activeCaseId:s.current?.caseId??null,
      ...(s.feeFixture?{feeRemissionFixture:{students:s.feeFixture.students,journal:s.feeFixture.journal}}:{}),
      ...(s.transcriptConversationRecovery?{transcriptConversation:s.transcriptConversationRecovery}:{}),
      ...(s.dtmReportPlan||s.dtmReportTransitionPending?{dtmReportFixture:{
        previous:dtmReportRecoveryBinding(s.dtmReportPlan),pending:dtmReportRecoveryBinding(s.pendingDtmReportPlan),transitionPending:Boolean(s.dtmReportTransitionPending),
      }}:{}),...(s.elearningPlan||s.elearningTransitionPending?{elearningFixture:{
        previous:s.elearningPlan?.rows??null,pending:s.pendingElearningPlan?.rows??null,transitionPending:Boolean(s.elearningTransitionPending),
      }}:{}),...(s.outlinePlan||s.outlineTransitionPending?{elearningOutlineFixture:{
        previous:s.outlinePlan??null,pending:s.pendingOutlinePlan??null,transitionPending:Boolean(s.outlineTransitionPending),
      }}:{}),...(s.dormitoryPlan||s.dormitoryTransitionPending?{dormitoryConductFixture:{
        previous:s.dormitoryPlan??null,pending:s.pendingDormitoryPlan??null,transitionPending:Boolean(s.dormitoryTransitionPending),
      }}:{}),...(s.facilityRepairPlan||s.facilityRepairTransitionPending?{facilityRepairFixture:{
        previous:s.facilityRepairPlan??null,pending:s.pendingFacilityRepairPlan??null,transitionPending:Boolean(s.facilityRepairTransitionPending),
      }}:{})},null,2));
    await handle.sync();
  }finally{await handle?.close();}
  await rename(tmp,s.ledger);s.ledgerTempOwned=false;await chmod(s.ledger,0o600);
}
async function readSnapshot(user,{signal=state?.signal,cleanup=false}={}){
  const s=state;let response;
  await user.renewSession?.({signal:cleanup?undefined:signal});
  try{response=await (s.applicationFetch??fetch)(new URL('/api/affairs-data',s.origin),{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(cleanup?undefined:signal,45000)});}catch{fail('fixture-readback','Authenticated /api/affairs-data request did not complete.');}
  if(response.status!==200||!response.headers.get('content-type')?.includes('application/json'))fail('fixture-readback',`Authenticated /api/affairs-data returned ${response.status}; no model request may run.`);
  const reader=response.body?.getReader();if(!reader)fail('fixture-readback','Snapshot response has no body.');
  const chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000){await reader.cancel();fail('fixture-readback','Snapshot exceeded the bounded fixture readback size.');}chunks.push(value);}}
  catch(error){if(error instanceof LiveFixtureError)throw error;fail('fixture-readback','Snapshot body did not complete.');}
  let snapshot;try{snapshot=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('fixture-readback','Snapshot response was not JSON.');}
  if(snapshot?.profile?.userId!==user.id)fail('fixture-isolation','Snapshot did not belong to the newly created fixture user.');
  if(user===s.users[0]&&JSON.stringify(snapshot).includes(FOREIGN_MARKER))fail('fixture-isolation','The second fixture account leaked into the first account snapshot.');
  return snapshot;
}
async function createFixtureUser(index){
  const s=state;
  // A fixed .invalid address preserves independently authored golden email facts.
  // Creation fails if a previous run still owns it; no existing account is reused.
  const email=index===0?'evaluation.student@example.invalid':`evaluation.other.${s.runId}@example.invalid`;
  const existing=await query(()=>s.sql`select id from auth.users where lower(email)=lower(${email}) limit 2`,'Could not check the reserved fixture identity.');
  if(existing.length)fail('fixture-create','The reserved synthetic address already exists; existing accounts are never reused or deleted.');
  const identityRequest={email,runId:s.runId,state:'pending'};
  s.identityRequests.push(identityRequest);
  // Record intent before the remote mutation. A timeout is not proof that Auth
  // did not commit; cleanup must reconcile the exact email AND run marker.
  await saveLedger();
  const password=randomBytes(32).toString('base64url')+'Aa1!';
  let created;try{created=await s.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:index===0?'Evaluation Student':'Evaluation Other',assistant_evaluation_run:s.runId}});}catch{identityRequest.state='uncertain';await saveLedger();fail('fixture-create','Disposable account creation did not complete; its pending identity requires cleanup reconciliation.');}
  if(created.error||!UUID.test(created.data?.user?.id||'')||created.data.user.id===s.protectedOwnerBefore.id||created.data.user.email?.toLowerCase()!==email.toLowerCase()){
    // A network/5xx response can follow a committed write. Only a definite
    // client rejection establishes a terminal non-create response.
    const status=created.error?.status;
    identityRequest.state=Number.isInteger(status)&&status>=400&&status<500&&![408,409,425,429].includes(status)?'rejected':'uncertain';
    await saveLedger();fail('fixture-create','Could not create a fresh synthetic account; existing accounts are never reused.');
  }
  identityRequest.state='created';identityRequest.id=created.data.user.id;
  const user={id:created.data.user.id,token:null};s.users.push(user);
  // Durable cleanup identity is written immediately, before any additional write.
  await saveLedger();
  await query(()=>s.sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
    values(${user.id},${user.id},${s.sql.json({sub:user.id,email,email_verified:true})},'google',now(),now())`,'Could not link the disposable Google fixture identity.');
  const auth=createClient(s.url,s.publishable,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:s.boundedFetch}});
  let signed;try{signed=await auth.auth.signInWithPassword({email,password});}catch{fail('fixture-signin','Synthetic account sign-in did not complete.');}
  if(signed.error||signed.data?.session?.user?.id!==user.id)fail('fixture-signin','Synthetic account session could not be verified.');
  attachFixtureSession(user,signed.data.session,{url:s.url,publishable:s.publishable,signal:s.signal,fetchImpl:s.boundedFetch});
  if(s.fixtureMode!==undefined&&s.fixtureMode===FEE_FIXTURE_MODE)return user;
  const initial=await readSnapshot(user);user.studentId=initial.student?.id;
  if(!UUID.test(user.studentId||''))fail('fixture-readback','Synthetic School Affairs student initialization failed.');
  return user;
}

/** No mutation occurs until this explicit lifecycle entry point is invoked. */
export async function prepare({runId,cases,now,origin,approvedPreviewOrigin,expectedReleaseRevision,signal,fixtureMode,caseFamily,applicationFetch}={}){
  if(state)fail('fixture-state','This fixture adapter cannot run overlapping lifecycles.');
  if(!UUID.test(runId||'')||!Array.isArray(cases)||!cases.length||!Number.isFinite(Date.parse(now)))fail('fixture-config','A unique run ID, selected case list and valid evaluation clock are required.');
  let transcriptCaseIds;
  if(applicationFetch!==undefined){
    if(typeof applicationFetch!=='function'||cases.length!==transcriptFixtureCases.length||fixtureMode!==undefined||caseFamily!==undefined
      ||!approvedPreviewOrigin||origin!==approvedPreviewOrigin)fail('fixture-config','The injected transport requires the exact approved Preview four-turn packet.');
    transcriptCaseIds=cases.map((testCase,index)=>assertTranscriptFixtureCase(testCase,index));
  }
  if(fixtureMode!==undefined||caseFamily!==undefined){
    const expected=feeRemissionLivePlanManifest.eligibleCaseIds;
    if(fixtureMode!==FEE_FIXTURE_MODE||caseFamily!=='fee-remission'||!approvedPreviewOrigin||cases.length!==expected.length
      ||new Set(cases.map(row=>row?.id)).size!==expected.length||!expected.every(id=>cases.some(row=>row?.id===id)))
      fail('fixture-config','The fee-only adapter requires the complete approved Preview packet.');
  }
  if(resolve(process.cwd())!==resolve(ROOT))fail('fixture-target','Run this adapter from the exact client checkout root.');
  const config=JSON.parse(await readFile(resolve(ROOT,'deployment.json'),'utf8'));
  if(config.repository!=='LuxArt0317/std_edu_ai'||config.supabase?.projectRef!==PROJECT)fail('fixture-target','Deployment configuration is not the authorized client project.');
  let target;
  try{target=new URL(origin||config.vercel.productionUrl);}catch{fail('fixture-config','Invalid configured application origin.');}
  if(target.username||target.password||target.pathname!=='/'||target.search||target.hash
    ||!(target.origin===config.vercel.productionUrl||target.origin===approvedPreviewOrigin
      ||['127.0.0.1','localhost'].includes(target.hostname)&&['http:','https:'].includes(target.protocol)))
    fail('fixture-target','Only the configured production origin, exact approved preview or explicit loopback is allowed.');
  const scopedApplicationFetch=applicationFetch===undefined?undefined:createTranscriptFixtureApplicationFetch({origin:target.origin,fetchImpl:applicationFetch,signal});
  if(approvedPreviewOrigin!==undefined){
    if(target.origin!==approvedPreviewOrigin||target.origin===config.vercel.productionUrl)
      fail('fixture-target','Preview approval must match the exact non-production origin.');
    try{await createPinnedDeploymentVerifier({origin:target.origin,approvedPreviewOrigin,expectedRevision:expectedReleaseRevision,signal,...(scopedApplicationFetch?{fetchImpl:scopedApplicationFetch}:{})}).pin();}
    catch{fail('fixture-target','The approved Preview could not prove the exact release before fixture setup.');}
  }
  const env=deploymentEnvironment(); // Secrets are resolved only at explicit prepare().
  const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
  const publishable=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!url||!connection||!publishable||!serviceKey)fail('fixture-config','Exact-client database and Auth credentials are required.');
  let db,base;try{db=new URL(connection);base=new URL(url);}catch{fail('fixture-config','Invalid configured project URL.');}
  if(base.protocol!=='https:'||base.hostname!==PROJECT+'.supabase.co'||base.username||base.password)fail('fixture-target','Supabase URL does not match the exact client project.');
  if(!(db.hostname==='db.'+PROJECT+'.supabase.co'||db.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(db.username).endsWith('.'+PROJECT)))fail('fixture-target','Database connection does not match the exact client project.');
  const ignore=await readFile(resolve(ROOT,'.gitignore'),'utf8');if(!/^\/?artifacts\/$/m.test(ignore))fail('fixture-ledger','Private fixture ledger directory must be ignored by Git.');
  await mkdir(PRIVATE_DIR,{recursive:true,mode:0o700});await chmod(PRIVATE_DIR,0o700);
  const boundedFetch=(input,init={})=>fetch(input,{...init,signal:signals(init.signal,15000)});
  state={runId,now,origin:target.origin,url,publishable,signal,boundedFetch,...(scopedApplicationFetch?{applicationFetch:scopedApplicationFetch}:{}),startedAt:new Date().toISOString(),users:[],identityRequests:[],recordIds:new Set(),supplementalTables:new Set(),caseIds:new Set(transcriptCaseIds??cases.map(row=>row.id)),prepared:false,closing:false,closed:false,current:null,ledgerOwned:false,ledgerTempOwned:false,fixtureMode,
    ledger:resolve(PRIVATE_DIR,'active-fixtures-'+runId+'.json'),admin:createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}})};
  try{
    state.sql=postgres(connection,{max:1,connect_timeout:10,idle_timeout:10,max_lifetime:0,
      ssl:{rejectUnauthorized:true,ca:await readFile(resolve(ROOT,'supabase/certs/prod-ca-2021.crt'),'utf8')},onnotice:()=>{},
      connection:{application_name:'stu-assistant-evaluation',statement_timeout:15000,lock_timeout:3000,idle_in_transaction_session_timeout:15000}});
    // Reserve one physical connection: the advisory lock must cover every case.
    state.db=state.sql;state.sql=await query(()=>state.db.reserve(),'Could not reserve the bounded fixture connection.');
    const locked=await query(()=>state.sql`select pg_try_advisory_lock(23101314,115100) as held`,'Could not acquire the fixture exclusivity lock.');
    if(locked[0]?.held!==true)fail('fixture-lease','Another evaluation fixture lifecycle owns the database lock.');state.locked=true;
    await assertNoPendingRecoveryLedgers();
    state.protectedOwnerEmail=config.supabase.ownerEmail;
    state.protectedOwnerBefore=await readProtectedOwnerFingerprint(state.sql,state.protectedOwnerEmail);
    await reserveLedger();
    await saveLedger();
    await createFixtureUser(0);await createFixtureUser(1);
    if(fixtureMode!==undefined&&fixtureMode===FEE_FIXTURE_MODE){
      await prepareFeeFixture(state);
      state.prepared=true;
      return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:['feeRemission','charges']};
    }
    const foreignId=randomUUID();state.recordIds.add(foreignId);await saveLedger();
    await query(()=>state.sql`insert into public.dtm_courses(id,user_id,code,title,term,role,source_mode)
      values(${foreignId},${state.users[1].id},'FOREIGN-EVAL',${FOREIGN_MARKER},'Synthetic private term','student','personal')`,'Could not create the isolated second-account sentinel.');
    state.foreignDtmCourseId=foreignId;
    await readSnapshot(state.users[0]);
    state.prepared=true;
    return {projectRef:PROJECT,fixtureUsers:2,origin:state.origin,supportedDomains:[...SUPPORTED_TOOLS]};
  }catch(error){
    // Limit orphan lifetime when prepare itself fails. A failed cleanup closes
    // the connection and retains its ledger; the runner's later cleanup call
    // reports explicit recovery instead of attempting an invalid closed retry.
    try{await cleanup();}catch{/* The original error is safe; ledger remains. */}
    if(error instanceof LiveFixtureError)throw error;fail('fixture-prepare','Fixture preparation failed'+diagnostic(error)+'.');
  }
}

async function feeTransaction(s,work){
  await s.sql.unsafe('begin');
  try{
    const result=await work();
    await s.sql.unsafe('commit');
    return result;
  }catch(error){
    try{await s.sql.unsafe('rollback');}catch{/* Retain the journal if the outcome is unknown. */}
    throw error;
  }
}

async function assertFeeFixtureLease(s,{runId,projectRef,ownerIds,studentIds}){
  if(state!==s||!s.locked||s.closed||!s.ledgerOwned||runId!==s.runId||projectRef!==PROJECT
    ||!isSameIds(ownerIds,s.users.map(user=>user.id))||!isSameIds(studentIds,Object.values(s.feeFixture.students).map(row=>row.id)))
    fail('fixture-lease','The fee remission fixture is outside its recorded run or owner lease.');
  if(!s.closing)s.signal?.throwIfAborted();
  const locks=await s.sql`select 1 from pg_locks where locktype='advisory' and pid=pg_backend_pid()
    and classid=23101314 and objid=115100 and objsubid=2 and granted`;
  if(locks.length!==1)fail('fixture-lease','The disposable fee fixture lost its database lease.');
  assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
  return true;
}

function isSameIds(actual,expected){
  return Array.isArray(actual)&&actual.length===expected.length&&new Set(actual).size===expected.length&&actual.every(id=>expected.includes(id));
}

async function readFeeFixtureIdentities(s,ownerIds){
  const identities=await s.sql`select u.id,u.email,u.raw_user_meta_data->>'assistant_evaluation_run' as "runMarker"
    from auth.users u where u.id in ${s.sql(ownerIds)} and u.email_confirmed_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
        and i.provider_id=u.id::text and i.identity_data->>'email'=u.email and i.identity_data->>'email_verified'='true')`;
  const students=await s.sql`select st.id,st.user_id from public.affairs_students st
    join public.affairs_profiles p on p.user_id=st.user_id and p.role='student'
    join auth.users u on u.id=st.user_id and u.email=p.email
    where st.user_id in ${s.sql(ownerIds)} and st.source_mode='sample'`;
  return {identities,students};
}

async function feeReadback(s,{role,view,contract}){
  const user=s.users[role==='A'?0:1];
  if(user?.id!==contract.ownerId)fail('fixture-readback','Fee remission fixture caller binding changed.');
  await user.renewSession({signal:s.signal});
  if(view==='charges')return loadOwnAffairsCharges({user:{id:user.id},url:s.url,key:s.publishable,token:user.token});
  if(view!=='feeRemission'||contract.method!=='GET'||contract.path!=='/api/affairs-data'||contract.query.scope!=='fee-remission')
    fail('fixture-readback','Unsupported fee remission readback.');
  const url=new URL('/api/affairs-data?scope=fee-remission',s.origin);
  const response=await fetch(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(s.signal,15000)});
  if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
    await response.body?.cancel();fail('fixture-readback','Caller-scoped fee remission read did not return JSON.');
  }
  const reader=response.body?.getReader();if(!reader)fail('fixture-readback','Fee remission readback did not contain a body.');
  const chunks=[];let bytes=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;if(bytes>131072)fail('fixture-readback','Fee remission readback exceeded its bound.');
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

async function prepareFeeFixture(s){
  const owners=Object.fromEntries(s.users.map((user,index)=>{
    const request=s.identityRequests.find(row=>row.id===user.id);
    return [index===0?'A':'B',{id:user.id,email:request?.email,runMarker:request?.runId}];
  }));
  const ownerIds=Object.values(owners).map(row=>row.id);
  if(ownerIds.length!==2||ownerIds.includes(s.protectedOwnerBefore.id))fail('fixture-create','Fee remission requires two disposable owners.');
  const students=Object.fromEntries(Object.entries(owners).map(([role,owner])=>[role,{id:randomUUID(),user_id:owner.id}]));
  const studentIds=Object.values(students).map(row=>row.id);
  buildFeeRemissionFixturePlan({runId:s.runId,owners,students,fixtureKey:'feeRemission'});
  s.feeFixture={owners,students,journal:null,lifecycle:null};
  await saveLedger();
  await query(()=>feeTransaction(s,async()=>{
    await assertFeeFixtureLease(s,{runId:s.runId,projectRef:PROJECT,ownerIds,studentIds});
    const existing=await readFeeFixtureIdentities(s,ownerIds);
    if(existing.identities.length!==2||!Object.values(owners).every(owner=>existing.identities.some(actual=>
      actual.id===owner.id&&actual.email===owner.email&&actual.runMarker===owner.runMarker)))
      fail('fixture-create','Fee remission requires verified disposable Google identities.');
    const programs=await s.sql`select id from public.affairs_programs where code='SAMPLE-GEN' and source_mode='sample'`;
    if(programs.length!==1)fail('fixture-create','The existing sample program could not be bound.');
    for(const [role,owner] of Object.entries(owners)){
      const name=role==='A'?'Evaluation Student':'Evaluation Other';
      const studentId=students[role].id;
      await s.sql`insert into public.affairs_profiles(user_id,email,display_name,role) values(${owner.id},${owner.email},${name},'student')`;
      await s.sql`insert into public.affairs_students(id,user_id,student_number,full_name,program_id,year_level,source_mode)
        values(${studentId},${owner.id},${'EVAL-'+studentId},${name},${programs[0].id},1,'sample')`;
      // The existing student insert trigger creates a sample charge. Remove
      // that exact trigger result in the same transaction, before seeding cases.
      const [charge,...extra]=await s.sql`select id,student_id,label,amount_due,amount_paid,currency,due_on::text,source_mode,
        occurrence_on,category,contact_unit,contact_extension,payment_unit from public.affairs_charges where student_id=${studentId} limit 2`;
      if(extra.length||charge?.student_id!==studentId||!UUID.test(charge.id)||charge.label!=='Sample Fall 2026 tuition'
        ||Number(charge.amount_due)!==28000||Number(charge.amount_paid)!==5000||charge.currency!=='TWD'||charge.due_on!=='2026-12-15'
        ||charge.source_mode!=='sample'||['occurrence_on','category','contact_unit','contact_extension','payment_unit'].some(key=>charge[key]!==null))
        fail('fixture-create','The generated sample charge differed from the published seed.');
      const deleted=await s.sql`delete from public.affairs_charges where id=${charge.id} and student_id=${studentId} returning id`;
      if(deleted.length!==1||deleted[0].id!==charge.id)fail('fixture-create','The generated charge could not be removed exactly.');
    }
  }),'Could not prepare the isolated fee fixture student bindings.');
  s.users.forEach((user,index)=>{user.studentId=students[index===0?'A':'B'].id;});
  s.feeFixture.lifecycle=createFeeRemissionFixtureLifecycle({
    assertLease:binding=>assertFeeFixtureLease(s,binding),
    readIdentities:binding=>readFeeFixtureIdentities(s,binding.ownerIds),
    readRows:descriptor=>readFeeRows(s.sql,descriptor),
    transaction:work=>query(()=>feeTransaction(s,()=>work({
      readRows:descriptor=>readFeeRows(s.sql,descriptor),deleteRows:descriptor=>deleteFeeRows(s.sql,descriptor),insertRows:descriptor=>insertFeeRows(s.sql,descriptor),
    })),'Could not apply the owned fee fixture transaction.'),
    readNative:descriptor=>feeReadback(s,descriptor),
    writeJournal:async journal=>{
      s.feeFixture.journal=journal;
      journal.recordIds.forEach(id=>s.recordIds.add(id));
      await saveLedger();return true;
    },
    readCleanupProof:async descriptor=>{
      const {identities,students}=await readFeeFixtureIdentities(s,ownerIds);
      const rows=await readFeeRows(s.sql,descriptor);
      if(Object.values(rows).some(items=>items.length))fail('fixture-cleanup','A reserved or owned fee fixture row remains.');
      return {identities,students,
        remainingByTable:Object.fromEntries(Object.keys(rows).map(table=>[table,ownerIds.map(userId=>({userId,count:0}))])),
        reservedByTable:{affairs_fee_remission:0,affairs_charges:0}};
    },
  });
}

function assertSupported(testCase,snapshot){
  const key=testCase.fixtureKey,tools=testCase.expected?.requiredTools||[];
  if(!state.caseIds.has(testCase.id))fail('fixture-case','The case was not included in prepare().');
  if(key==='anonymous')fail('fixture-case','Anonymous requests must bypass the signed-in fixture adapter.');
  if(['mixed-currency','admin'].includes(key))fail('fixture-unsupported',`${key} needs an additional real schema adapter; it is not a model result.`);
  if(['empty:profile','empty:courses','empty:dtm','empty:tasks','empty:announcements'].includes(key))fail('fixture-unsupported',`${key} cannot be represented while the account initializer recreates those records or the records are globally shared.`);
  if(tools.some(tool=>!SUPPORTED_TOOLS.has(tool)&&!(tool==='courseCatalog'&&state.catalogBindings?.has(testCase.id)))){
    const onlyPermissionCheck=testCase.id==='account:action-announcement-denied';
    if(!onlyPermissionCheck)fail('fixture-unsupported',`No private live mapping for ${tools.filter(tool=>!SUPPORTED_TOOLS.has(tool)).join(', ')}; unsupported fixtures never count as passing.`);
  }
  if(testCase.id==='account:dtm-notices')fail('fixture-unsupported','DTM notices are globally shared; this adapter never publishes synthetic notices.');
  if(key==='submissions')fail('fixture-unsupported','This adapter does not create file uploads or submission revisions; a tracker row is not submission evidence.');
  if(snapshot.profile.role!=='student')fail('fixture-unsupported','The live adapter never elevates a fixture to administrator.');
  if(key==='facility-repairs:compound'){
    try{assertPublishedNextClassClock(testCase.publishedNextClass,{now:new Date().toISOString()});}
    catch{fail('fixture-clock','The original published next-class expectation cannot be verified at the current Taipei time.');}
  }
  if(String(key).startsWith('published-sample:')){
    if(key!=='published-sample:records')fail('fixture-unsupported','Unknown published sample fixture family.');
    if(evaluationDates(state.now).today!==evaluationDates(new Date().toISOString()).today)fail('fixture-clock','Published sample evaluation must use the actual campus day; literal term dates cannot be rebased.');
  }
  if(testCase.expected?.timeFixture){
    const expected=evaluationDates(state.now),actual=evaluationDates(new Date().toISOString());
    if(expected.today!==actual.today||expected.nextClass!==actual.nextClass)fail('fixture-clock','Live date boundary no longer matches the authored case; rebuild the suite with the current clock.');
  }
}

// These fields are the persisted migration contract, not answer-derived data.
// Unknown fields cannot become SQL identifiers; all tables and columns below
// are fixed literals. A planner can be exercised entirely offline.
const COMMON=['id','userId','sourceMode','version','createdAt','updatedAt'];
const NATIVE_TABLES={
  studentAid:{records:['affairs_student_aid_records',['applicantLabel','studentName','maskedIdentityNumber','departmentName','phone','applicationKind','relativeCount','subsidyAmount','studentRecordLocked','schoolReviewStatus','ministryReviewStatus','academicYear','semester']]},
  creditLoadHistory:{records:['affairs_credit_load_history',['academicYear','semester','category','requestedCredits','processText','resultText']]},
  courseSelection:{records:['affairs_course_selection_records',['academicYear','semester','selectionPhase','termCourseCode','courseTitle','requiredElectiveText','credits','instructorOne','remarkText','rowOrder','timetableIncluded','meetings']]},
  academicGrades:{
    records:['affairs_academic_grade_records',['recordKind','academicYear','semester','courseTitle','courseCode','categoryText','moduleName','requiredElectiveText','credits','gradeText','remarkText','rowOrder']],
    termSummaries:['affairs_academic_term_summaries',['summaryKind','academicYear','semester','earnedCredits','averageGradeText','attemptedCredits','passedCredits','failedCredits']],
    rankings:['affairs_academic_rankings',['academicYear','semester','departmentRankingText','classRankingText']],
    metadata:['affairs_academic_metadata',['classLabel','englishRequirementText']],
  },
  graduationReview:{reports:['affairs_graduation_reviews',['reportKind']]},
  academicAttendance:{
    statistics:['affairs_academic_attendance_statistics',['academicYear','semester','rowOrder','studentNumber','studentName','courseCode','courseTitle','totalTeachingHours','currentTeachingWeeks','currentTeachingHours','absenceHours','unexcusedAbsenceHours']],
    details:['affairs_academic_attendance_details',['academicYear','semester','rowOrder','courseCode','courseTitle','teacherName','absenceTypeText','courseDate','periodText','rollCalledAt']],
    metadata:['affairs_academic_attendance_metadata',['currentAcademicYear','currentSemester']],
  },
};
const REPORT_FIELDS=['reportedAt','identity','educationProgram','foreignLanguageCompletion','englishRequirement','graduationReview','languageRequirements','categories','otherCourses'];
const PERIOD_FIELDS={scholarship:['termLabel','opensAt','closesAt','published','instructions','sourceMode','version'],housing:['termLabel','academicYear','semester','opensAt','closesAt','published','instructions','agreementText','sourceMode','version']};
const COURSE_FIELDS=['code','title','credits','term','termStartsOn','termEndsOn','instructor','weekday','startsAt','endsAt','room'];
const APPLICATION_FIELDS={
  scholarship:['id','userId','periodId','status','awardAmount','requiredHours','actualHours','reviewNote','submittedAt','reviewedAt','cancelledAt','version'],
  housing:['id','userId','periodId','receiptNumber','fullName','studentNumber','gender','department','birthDate','homePhone','mobilePhone','email','address','postalCode','category','healthNotes','agreementVersion','agreementText','submittedAt','version'],
};
const BED_FIELDS=['id','userId','periodId','bedNumber','dormitory','bunk','accommodationFee','deposit','subsidyAmount','version'];
const snake=key=>key.replace(/[A-Z]/g,character=>'_'+character.toLowerCase());
const ownTables=Object.values(NATIVE_TABLES).flatMap(domain=>Object.values(domain).map(([table])=>table));
const periodTables={scholarship:'affairs_scholarship_periods',housing:'affairs_housing_periods'};
const applicationTables={scholarship:'affairs_scholarship_applications',housing:'affairs_housing_applications'};
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const amount=(value,max,nullable=false)=>nullable&&value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max&&Number(value.toFixed(2))===value;
const validText=(value,max,nullable=false)=>nullable&&value===null||typeof value==='string'&&value.trim().length>0&&[...value].length<=max&&!/[\u0000\ud800-\udfff]/u.test(value);
const validStamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&validDay(value.slice(0,10));
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const requireSchema=(condition,label)=>{if(!condition)fail('fixture-schema',label);};
function requiredFields(row,fields,label){
  requireSchema(row&&typeof row==='object'&&!Array.isArray(row)&&fields.every(key=>Object.hasOwn(row,key)&&row[key]!==undefined),`${label} has missing explicit persisted fields.`);
  return Object.fromEntries(fields.map(key=>[snake(key),structuredClone(row[key])]));
}
function validCommon(row){
  return UUID.test(row.id)&&UUID.test(row.user_id)&&row.source_mode==='local_demo'&&integer(row.version,1,2147483647)&&validStamp(row.created_at)&&validStamp(row.updated_at);
}
function validatePrivateNativeRow(table,row){
  requireSchema(validCommon(row),`Invalid native owner, provenance, version or timestamp in ${table}.`);
  if(table==='affairs_student_aid_records'){
    const mask=row.masked_identity_number;
    requireSchema(validText(row.applicant_label,160)&&validText(row.student_name,160)&&validText(row.department_name,160,true)&&
      (mask===null||typeof mask==='string'&&mask.length>=3&&mask.length<=24&&/^[A-Za-z0-9*•● -]+$/.test(mask)&&/[*•●]{3,}/.test(mask)&&mask.replace(/[^A-Za-z0-9]/g,'').length<=4)&&
      (row.phone===null||typeof row.phone==='string'&&row.phone.length>=3&&row.phone.length<=40&&/^[0-9+()# .-]+$/.test(row.phone))&&
      validText(row.application_kind,120)&&(row.relative_count===null||integer(row.relative_count,0,1000))&&amount(row.subsidy_amount,10000000,true)&&
      [true,false,null].includes(row.student_record_locked)&&validText(row.school_review_status,160,true)&&validText(row.ministry_review_status,160,true)&&
      integer(row.academic_year,1,999)&&integer(row.semester,1,3),'Invalid explicit student aid fields.');
  }else if(table==='affairs_credit_load_history'){
    requireSchema(integer(row.academic_year,1,9999)&&integer(row.semester,1,3)&&['over','under'].includes(row.category)&&amount(row.requested_credits,9999.99)&&validText(row.process_text,300,true)&&validText(row.result_text,300,true),'Invalid credit-load history fields.');
  }else if(table==='affairs_course_selection_records'){
    const seen=new Set(),periods=['1','2','3','4','午','5','6','7','8','傍','A','B','C','D'];
    requireSchema(integer(row.academic_year,1,9999)&&integer(row.semester,1,3)&&['initial','add_drop','withdrawal','summer1'].includes(row.selection_phase)&&
      validText(row.term_course_code,80)&&validText(row.course_title,160)&&validText(row.required_elective_text,30,true)&&amount(row.credits,999.99)&&
      validText(row.instructor_one,160,true)&&validText(row.remark_text,300,true)&&integer(row.row_order,0,999999)&&typeof row.timetable_included==='boolean'&&Array.isArray(row.meetings)&&row.meetings.length<=98,'Invalid course-selection fields.');
    for(const slot of row.meetings){
      requireSchema(slot&&Object.keys(slot).length===3&&integer(slot.weekday,1,7)&&periods.includes(slot.period)&&typeof slot.room==='string'&&[...slot.room].length<=80,'Invalid course-selection meeting slot.');
      const key=slot.weekday+':'+slot.period;requireSchema(!seen.has(key),'Duplicate course-selection meeting slot.');seen.add(key);
    }
  }
}
function sameFields(a,b,fields){return JSON.stringify(canonical(pick(a,fields)))===JSON.stringify(canonical(pick(b,fields)));}
function uniqueRows(rows){
  for(const [table,values] of Object.entries(rows)){
    const ids=new Set();for(const row of values){requireSchema(UUID.test(row.id)&&!ids.has(row.id),`Duplicate or invalid synthetic record ID in ${table}.`);ids.add(row.id);}
  }
  for(const [table,keys] of Object.entries({affairs_scholarship_applications:['user_id','period_id'],affairs_housing_applications:['user_id','period_id'],affairs_housing_assignments:['user_id','period_id'],affairs_enrollments:['student_id','section_id'],affairs_attendance:['enrollment_id','meeting_on']})){
    const seen=new Set();for(const row of rows[table]||[]){const value=JSON.stringify(keys.map(key=>row[key]));requireSchema(!seen.has(value),`Duplicate native uniqueness constraint in ${table}.`);seen.add(value);}
  }
  const beds=new Set(),receipts=new Set();
  for(const row of rows.affairs_housing_assignments||[]){const key=row.period_id+':'+row.bed_number;requireSchema(!beds.has(key),'Duplicate housing bed in a period.');beds.add(key);}
  for(const row of rows.affairs_housing_applications||[]){requireSchema(!receipts.has(row.receipt_number),'Duplicate housing receipt.');receipts.add(row.receipt_number);}
}
function stableRowId(value){const digest=hash(value);return digest.slice(0,8)+'-'+digest.slice(8,12)+'-4'+digest.slice(13,16)+'-a'+digest.slice(17,20)+'-'+digest.slice(20,32);}

const conductFixtureFields=['occurredOnText','studentNumber','studentName','academicYearText','semesterText','yearLevelText','reasonText','conductCode','conductName','quantityText','voidStatusText','rowOrder'];
const loanFixtureFields=['currentTermLabel','currentApplicationState','currentApplicationText','progressText','historyCount','historyText'];
const exactFields=(value,fields)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
function studentRecordSentinels(userId,stamp){
  const common=domain=>({id:stableRowId([userId,domain,'foreign-sentinel']),userId,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp});
  return {
    studentConduct:{records:[{...common('studentConduct'),occurredOnText:null,studentNumber:'FOREIGN-NUMBER',studentName:'FOREIGN-NAME',academicYearText:'114',semesterText:'2',yearLevelText:'2',
      reasonText:FOREIGN_MARKER+' conduct',conductCode:'FOREIGN-CODE',conductName:'FOREIGN CONDUCT',quantityText:'9',voidStatusText:'FOREIGN STATUS',rowOrder:1}]},
    studentLoan:{status:'loaded',record:{...common('studentLoan'),currentTermLabel:'FOREIGN TERM',currentApplicationState:'unknown',currentApplicationText:FOREIGN_MARKER+' loan',
      progressText:'FOREIGN PROGRESS',historyCount:9,historyText:'FOREIGN HISTORY'}},
  };
}
function planStudentRecordRows(value,domain,userId){
  const conduct=domain==='studentConduct',fields=conduct?conductFixtureFields:loanFixtureFields;
  requireSchema(exactFields(value,conduct?['records']:['status','record']),`Invalid exact ${domain} snapshot.`);
  if(conduct)requireSchema(Array.isArray(value.records)&&value.records.length<=1000, 'Invalid complete conduct fixture collection.');
  else requireSchema(value.status==='loaded','Loan fixture must explicitly distinguish loaded metadata from an unavailable read.');
  const items=conduct?value.records:value.record===null?[]:[value.record];
  const rows=[];
  for(const item of items){
    requireSchema(exactFields(item,[...COMMON,...fields])&&item.userId===userId,'Student record fixture owner or exact fields differ from its disposable account.');
    const row={...requiredFields(item,[...COMMON,...fields],domain),deleted_at:null};
    requireSchema(validCommon(row)&&integer(row.version,1,999999999)&&[row.created_at,row.updated_at].every(value=>Number(value.slice(0,4))>0&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value)),'Invalid student record provenance, version or timestamp.');
    const payload={id:row.id,user_id:userId,request_id:row.id,expected_version:0,...Object.fromEntries(fields.map(field=>[snake(field),row[snake(field)]]))};
    requireSchema((conduct?validateStudentConductPayload('save_student_conduct',payload):validateStudentLoanPayload('save_student_loan',payload))===null,'Student record fixture violates its native literal schema.');
    rows.push(row);
  }
  if(!conduct){try{parseStudentLoanSnapshot(value,userId);}catch{fail('fixture-schema','Loan snapshot fails the actual native parser.');}}
  return rows;
}

/** Only private native records. No catalog, document, role or Storage writes. */
export function planSupplementalFixture(snapshot,{userId,otherUserId,domains=[]}={}){
  requireSchema(UUID.test(userId)&&UUID.test(otherUserId)&&userId!==otherUserId&&snapshot?.profile?.userId===userId,'Supplemental fixtures need two distinct disposable owners.');
  requireSchema(Array.isArray(domains)&&new Set(domains).size===domains.length&&domains.every(domain=>Object.hasOwn(SUPPLEMENTAL_SCOPES,domain)),'Unknown supplemental fixture domain.');
  const rows={},expectedByOwner={[userId]:{},[otherUserId]:{}},foreign={...supplementalFixtureRecords(otherUserId,{foreign:true}),...studentRecordSentinels(otherUserId,snapshot.checkedAt)};
  const certificateFields=['academicYear','semester','hasPendingFees','status','resultText','assessedAt'],identityFields=['studentNumber','studentName','departmentName','yearText','classLabel'];
  for(const domain of domains){
    const table=SUPPLEMENTAL_TABLES[domain];rows[table]=[];
    for(const [id,source] of [[userId,snapshot],[otherUserId,foreign]]){
      if(domain==='studentConduct'||domain==='studentLoan'){
        rows[table].push(...planStudentRecordRows(source[domain],domain,id));
        expectedByOwner[id][domain]=structuredClone(source[domain]);continue;
      }
      const value=source[domain];requireSchema(value&&Array.isArray(value.documents)&&value.documents.length===0,'No supplemental fixture may fabricate a document capability.');
      const collection=domain==='enrollmentCertificate'?'assessments':'settlements';
      requireSchema(Array.isArray(value[collection])&&value[collection].length<100&&!(domain==='enrollmentCertificate'&&value[collection].length>1),'Invalid complete supplemental fixture collection.');
      for(const item of value[collection]){
        requireSchema(item.userId===id,'Supplemental fixture row owner differs from its disposable account.');
        let row;
        if(domain==='enrollmentCertificate'){
          row={...requiredFields(item,[...COMMON,...certificateFields],table),...requiredFields(item.identity,identityFields,'certificate identity')};
          const payload={id:row.id,user_id:row.user_id,request_id:row.id,expected_version:0,...Object.fromEntries([...certificateFields,...identityFields].map(key=>[snake(key),row[snake(key)]]))};
          requireSchema(validateEnrollmentCertificatePayload('save_enrollment_certificate_assessment',payload)===null,'Certificate fixture violates its literal persisted field contract.');
        }else{
          row={...requiredFields(item,COMMON,table),period_label:item.periodLabel,statement_text:item.text,row_order:item.rowOrder,deleted_at:null};
          requireSchema(item.periodId===item.id&&validateTuitionDocumentPayload('save_tuition_settlement',{id:row.id,user_id:row.user_id,request_id:row.id,expected_version:0,period_label:row.period_label,statement_text:row.statement_text,row_order:row.row_order})===null,'Tuition fixture violates its literal persisted field contract.');
        }
        requireSchema(validCommon(row),'Supplemental fixture has invalid owner, provenance, revision or timestamps.');rows[table].push(row);
      }
      if(domain==='tuition')assertFactEqual(value.periods,value.settlements.map(row=>({id:row.id,userId:id,label:row.periodLabel})),'complete supplemental period linkage');
      expectedByOwner[id][domain]=structuredClone(value);
    }
  }
  uniqueRows(rows);
  return {domains:[...domains],rows,expectedByOwner,userIds:[userId,otherUserId]};
}
/** Full scoped JSON equality includes both identities, all fields and true emptiness. */
export function verifySupplementalFixtureReadback(actual,plan,userId){
  requireSchema(plan.userIds.includes(userId),'Unknown supplemental readback owner.');
  for(const domain of plan.domains)assertFactEqual(actual[domain],plan.expectedByOwner[userId][domain],domain+' complete scoped records');
  return true;
}
/** Real deployed user-JWT reads. Offline tests inject fetch only; never a mapper oracle. */
export async function readSupplementalFixtureScopes(user,domains,{origin,signal,fetchImpl=fetch}={}){
  await user?.renewSession?.({signal});
  requireSchema(UUID.test(user?.id)&&typeof user.token==='string'&&user.token.length>0&&Array.isArray(domains)&&new Set(domains).size===domains.length&&domains.every(domain=>Object.hasOwn(SUPPLEMENTAL_SCOPES,domain)),'Invalid scoped supplemental readback request.');
  const result={};
  await Promise.all(domains.map(async domain=>{
    const url=new URL('/api/affairs-data',origin);url.searchParams.set('scope',SUPPLEMENTAL_SCOPES[domain]);
    let response;
    try{response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,45000)});}catch{fail('fixture-readback','Scoped supplemental API request did not complete.');}
    if(response.status!==200||!response.headers.get('content-type')?.includes('application/json'))fail('fixture-readback',`Scoped supplemental API returned ${response.status}; no model request may run.`);
    const reader=response.body?.getReader();if(!reader)fail('fixture-readback','Scoped supplemental API returned no body.');
    const chunks=[];let bytes=0;
    try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000){await reader.cancel();fail('fixture-readback','Scoped supplemental readback exceeded its bounded size.');}chunks.push(part.value);}
      result[domain]=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }catch(error){if(error instanceof LiveFixtureError)throw error;fail('fixture-readback','Scoped supplemental API body could not be verified.');}
    finally{reader.releaseLock();}
  }));
  return result;
}

async function verifyAidFixtureIdentity(sql,plan){
  const ids=Object.keys(plan.expectedByOwner);
  const rows=await sql`select id, email, raw_user_meta_data->>'assistant_evaluation_run' as "runMarker" from auth.users where id in ${sql(ids)}`;
  assertAidPaymentFixtureIdentities(plan,rows);
}
const dtmReportRecoveryBinding=plan=>plan?{
  fixtureKey:plan.fixtureKey,courseIds:Object.fromEntries(Object.entries(plan.courseBindings).map(([role,row])=>[role,row.id])),recordIds:plan.recordIds,
}:null;
async function readElearningFixtureTargets(sql,owners){
  return sql`select user_id,course_id,joined_at from public.elearning_enrollments
    where user_id in ${sql(owners)} order by user_id,course_id limit 5`;
}
async function assertElearningFixtureOwners(sql,owners,identities,runId){
  const auths=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as run_id
    from auth.users where id in ${sql(owners)} limit 3`;
  if(auths.length!==2||!owners.every(id=>auths.some(auth=>auth.id===id&&auth.run_id===runId
    &&identities.some(identity=>identity.id===id&&identity.email===auth.email&&identity.runId===runId&&identity.state==='created'))))
    fail('fixture-isolation','Remote-learning fixture owners could not be verified.');
}
// Exact disposable identities and composite keys, under the caller's transaction.
export async function changeElearningFixtureRows(sql,{previous,next,identities,runId}){
  const plan=previous||next;if(!plan)return;
  const owners=plan.owners;
  if(previous&&next&&owners.some((id,index)=>id!==next.owners[index]))fail('fixture-isolation','Remote-learning fixture owners changed.');
  await assertElearningFixtureOwners(sql,owners,identities,runId);
  const existing=await readElearningFixtureTargets(sql,owners);
  if(previous)assertElearningFixtureRows(previous,existing);
  else if(existing.length)fail('fixture-isolation','Unexpected remote-learning rows already exist for a disposable account.');
  if(next){const ids=[elearningFixtureManifest.courseA.id,elearningFixtureManifest.courseB.id];
    assertElearningFixtureCatalog(await sql`select id,title,category_id,position from public.elearning_courses where id in ${sql(ids)}`);
  }
  for(const row of previous?.rows??[])
    await sql`delete from public.elearning_enrollments where user_id=${row.user_id} and course_id=${row.course_id}`;
  if(next)await sql`insert into public.elearning_enrollments ${sql(next.rows)}`;
  const observed=await readElearningFixtureTargets(sql,owners);
  if(next)assertElearningFixtureRows(next,observed);
  else if(observed.length)fail('fixture-cleanup','Remote-learning fixture rows remain.');
}

export async function reconcileElearningFixtureRows(sql,{previous,pending,identities,runId}){
  const plan=previous||pending;if(!plan)return;
  const observed=await readElearningFixtureTargets(sql,plan.owners);
  if(!observed.length)return;
  const known=[previous,pending].filter(Boolean).find(candidate=>{
    try{assertElearningFixtureRows(candidate,observed);return true;}catch{return false;}
  });
  if(!known)fail('fixture-cleanup','The remote-learning fixture commit could not be reconciled.');
  await changeElearningFixtureRows(sql,{previous:known,next:null,identities,runId});
}

async function readOutlineFixtureTargets(sql,owners){
  return sql`select user_id,course_id,created_at from public.elearning_course_access
    where user_id in ${sql(owners)} order by user_id,course_id limit 5`;
}

async function readBoundedFixtureResponse(response,url,maxBytes){
  if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
    await response.body?.cancel();throw new Error('Unexpected fixture response.');
  }
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing fixture response.');
  const chunks=[];let bytes=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;if(bytes>maxBytes)throw new Error('Fixture response exceeded its limit.');
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}

/** Transition only known composite keys for the two verified disposable owners. */
export async function changeOutlineFixtureRows(sql,{previous,next,identities,runId,recovering=false}){
  const plan=previous||next;if(!plan)return;
  for(const value of [previous,next].filter(Boolean))assertOutlineFixtureRows(value,value);
  const owners=plan.map(row=>row.user_id);
  if(previous&&next&&owners.some((owner,index)=>owner!==next[index].user_id))fail('fixture-isolation','Outline fixture owners changed.');
  await assertElearningFixtureOwners(sql,owners,identities,runId);
  const observed=await readOutlineFixtureTargets(sql,owners);
  let known=previous;
  if(recovering){
    if(!observed.length)return;
    known=[previous,next].filter(Boolean).find(candidate=>{
      try{assertOutlineFixtureRows(candidate,observed);return true;}catch{return false;}
    });
    if(!known)fail('fixture-cleanup','The outline fixture transition could not be reconciled.');
  }else if(previous)assertOutlineFixtureRows(previous,observed);
  else if(observed.length)fail('fixture-isolation','Unexpected outline access exists for a disposable account.');
  for(const row of known??[])await sql`delete from public.elearning_course_access where user_id=${row.user_id} and course_id=${row.course_id}`;
  const target=recovering?null:next;
  if(target)await sql`insert into public.elearning_course_access ${sql(target)}`;
  const actual=await readOutlineFixtureTargets(sql,owners);
  if(target)assertOutlineFixtureRows(target,actual);
  else if(actual.length)fail('fixture-cleanup','Disposable outline access remains.');
}

export async function readOutlineFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  assertOutlineFixtureRows(plan,plan);
  const result={};
  try{
    for(const {user_id:owner} of plan){
      const user=users.find(row=>row.id===owner);
      await user?.renewSession?.({signal});
      if(!user?.token)throw new Error();
      result[owner]={};
      for(const course of [9408,9098]){
        const url=new URL('/api/affairs-data',origin);
        url.search=new URLSearchParams({scope:'elearning-course-outline',course:String(course)}).toString();
        const response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
        const payload=await readBoundedFixtureResponse(response,url,32768);
        result[owner][course]=assertPublishedOutlineRead(plan,owner,course,payload);
      }
    }
  }catch{fail('fixture-readback','The native outline did not match both disposable owners and their crossed access outcomes.');}
  return result;
}

const dormNoticeTable='affairs_dormitory_conduct',dormOperationsTable='private.affairs_dormitory_conduct_operations';
function fixtureOwnersFor(s){
  return Object.fromEntries(s.users.map((user,index)=>{
    const request=s.identityRequests.find(row=>row.id===user.id&&row.state==='created');
    return [index===0?'A':'B',{id:user.id,email:request?.email,runMarker:request?.runId}];
  }));
}
async function readDormitoryFixtureTargets(sql,owners,reservedIds=[]){
  const notices=await sql`select id,user_id,source_mode,version,created_at,updated_at,deleted_at,result from public.affairs_dormitory_conduct
    where user_id in ${sql(owners)} or id in ${sql(reservedIds.length?reservedIds:owners)} order by id limit 3`;
  const operations=await sql`select user_id,request_id from private.affairs_dormitory_conduct_operations where user_id in ${sql(owners)} limit 1`;
  return {[dormNoticeTable]:notices,[dormOperationsTable]:operations};
}

export async function changeDormitoryFixtureRows(sql,{previous,next,identities,runId,recovering=false}){
  const plan=previous||next;if(!plan)return;
  const owners=['A','B'].map(role=>plan.owners[role].id);
  for(const value of [previous,next].filter(Boolean)){
    assertDormitoryConductFixtureRows(value,value.rows);
    if(value.runId!==runId||owners.some((owner,index)=>owner!==value.owners[index===0?'A':'B'].id))fail('fixture-isolation','Dormitory fixture owners changed.');
  }
  await assertElearningFixtureOwners(sql,owners,identities,runId);
  const auths=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker" from auth.users where id in ${sql(owners)} limit 3`;
  for(const value of [previous,next].filter(Boolean))assertDormitoryConductFixtureIdentities(value,auths);
  const reservedIds=[...new Set([...(previous?.recordIds??[]),...(next?.recordIds??[])])];
  const actual=await readDormitoryFixtureTargets(sql,owners,reservedIds);
  const {state,deleteTargets}=reconcileDormitoryConductFixturePlans({previous,next,actual});
  if(!recovering&&state!==(previous?'previous':'empty'))fail('fixture-isolation','The dormitory fixture does not match its prior state.');
  for(const row of deleteTargets)await sql`delete from public.affairs_dormitory_conduct where id=${row.id} and user_id=${row.userId}`;
  const target=recovering?null:next;
  if(target)await sql`insert into public.affairs_dormitory_conduct ${sql(target.rows[dormNoticeTable])}`;
  const observed=await readDormitoryFixtureTargets(sql,owners,reservedIds);
  if(target)assertDormitoryConductFixtureRows(target,observed);
  else if(Object.values(observed).some(rows=>rows.length))fail('fixture-cleanup','Disposable dormitory notice rows remain.');
}

export async function readDormitoryFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  const result={};
  try{
    for(const role of ['A','B']){
      const contract=dormitoryConductFixtureReadContract(plan,{role}),user=users.find(row=>row.id===contract.ownerId);
      await user?.renewSession?.({signal});
      if(!user?.token)throw new Error();
      const url=new URL(contract.path,origin);
      url.search=new URLSearchParams(contract.query).toString();
      const response=await fetchImpl(url,{method:contract.method,redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
      const payload=await readBoundedFixtureResponse(response,url,4096);
      verifyDormitoryConductFixtureReadback(plan,{role},payload);
      result[contract.ownerId]=payload;
    }
  }catch{fail('fixture-readback','The saved dormitory notice did not match both disposable callers.');}
  return result;
}

export async function readElearningFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  const result={};
  try{
    for(const owner of plan.owners){
      const user=users.find(row=>row.id===owner);
      await user?.renewSession?.({signal});
      if(!user?.token)throw new Error();
      const url=new URL('/api/affairs-data?scope=elearning-workspace',origin);
      const response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
      if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
        await response.body?.cancel();throw new Error();
      }
      const reader=response.body?.getReader();if(!reader)throw new Error();
      const chunks=[];let bytes=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072)throw new Error();chunks.push(value);}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      result[owner]=verifyElearningFixtureWorkspace(plan,owner,value);
    }
  }catch{fail('fixture-readback','The remote-learning enrollment data did not match the independent caller fixture.');}
  return result;
}

export async function readFacilityRepairFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  try{
    const target=new URL('/api/affairs-data',origin);
    await Promise.all(users.map(user=>user.renewSession?.({signal})));
    return await verifyFacilityRepairFixtureReadback(plan,async(owner,id)=>{
      const user=users.find(row=>row.id===owner);
      if(!user?.token)throw new Error();
      const url=new URL(target);
      url.searchParams.set('scope','facility-repairs');url.searchParams.set('view','mine');
      if(id)url.searchParams.set('id',id);
      const response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
      if(![200,404].includes(response.status)||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
        await response.body?.cancel();throw new Error();
      }
      const reader=response.body?.getReader();if(!reader)throw new Error();
      const chunks=[];let bytes=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072)throw new Error();chunks.push(value);}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      return {status:response.status,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))};
    });
  }catch{fail('fixture-readback','Facility repair status, event history or account isolation differed from the independent fixture.');}
}

async function readDtmReportTargets(sql,plan){
  const owners=Object.keys(plan.expectedByOwner);
  return {dtm_grade_reports:await sql`select id,user_id,course_id,deleted_at from public.dtm_grade_reports
    where user_id in ${sql(owners)} order by id limit 5`};
}

/** Surrounding transaction and existing fixture lease are owned by the caller. */
export async function changeDtmReportFixtureRows(sql,plan,phase){
  if(!plan)return;
  const ownerIds=Object.keys(plan.expectedByOwner);
  const identities=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker" from auth.users where id in ${sql(ownerIds)}`;
  assertDtmGradeReportFixtureIdentities(plan,identities);
  const courses=await sql`select id,user_id as "userId",code,title,term,role,source_mode as "sourceMode" from public.dtm_courses
    where id in ${sql(Object.values(plan.courseBindings).map(row=>row.id))} limit 3`;
  assertDtmGradeReportFixtureCourseBindings(plan,Object.fromEntries(Object.entries(plan.owners).map(([role,owner])=>[role,courses.find(course=>course.userId===owner.id)])));
  const verifyEmpty=async()=>{
    const {dtm_grade_reports:rows}=await readDtmReportTargets(sql,plan);
    assertDtmGradeReportFixtureEmpty(plan,{dtm_grade_reports:ownerIds.map(userId=>({userId,count:rows.filter(row=>row.user_id===userId).length}))});
  };
  if(phase==='remove'){
    assertDtmGradeReportFixtureRowTargets(plan,await readDtmReportTargets(sql,plan));
    for(const row of plan.rows.dtm_grade_reports)
      await sql`delete from public.dtm_grade_reports where id=${row.id} and user_id=${row.user_id} and course_id=${row.course_id}`;
    await verifyEmpty();
    return;
  }
  if(phase!=='insert')fail('fixture-state','Invalid DTM report fixture transition.');
  await verifyEmpty();
  const rows=plan.rows.dtm_grade_reports.map(row=>({...row,report:sql.json(row.report)}));
  await sql`insert into public.dtm_grade_reports ${sql(rows)}`;
  assertDtmGradeReportFixtureRowTargets(plan,await readDtmReportTargets(sql,plan));
}

export async function removeDtmReportFixtureRows(sql,{plan,pending}){
  const candidate=plan||pending;
  if(!candidate)return;
  const observed=await readDtmReportTargets(sql,candidate);
  if(!observed.dtm_grade_reports.length)return;
  const proven=[plan,pending].filter(Boolean).find(item=>{
    try{return assertDtmGradeReportFixtureRowTargets(item,observed);}catch{return false;}
  });
  if(!proven)fail('fixture-cleanup','DTM report fixture ownership could not be reconciled. The exact recovery ledger is retained.');
  await changeDtmReportFixtureRows(sql,proven,'remove');
}

export async function readDtmReportFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  const result={};
  try{
    for(const role of ['A','B']){
      const contract=dtmGradeReportFixtureReadContract(plan,{role});
      const user=users.find(item=>item.id===contract.ownerId);
      await user?.renewSession?.({signal});
      if(!user?.token)throw new Error();
      const url=new URL(contract.path,origin);
      url.search=new URLSearchParams(contract.query).toString();
      const options={method:contract.method,redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)};
      const response=await fetchImpl(url,options);
      if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
        await response.body?.cancel();
        throw new Error();
      }
      const reader=response.body?.getReader();
      if(!reader)throw new Error();
      const chunks=[];
      let bytes=0;
      try{
        for(;;){
          const {done,value}=await reader.read();
          if(done)break;
          bytes+=value.byteLength;
          if(bytes>131072)throw new Error();
          chunks.push(value);
        }
      }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      verifyDtmGradeReportFixtureReadback(plan,{role},payload);
      const other=dtmGradeReportFixtureReadContract(plan,{role:role==='A'?'B':'A'});
      url.search=new URLSearchParams(other.query).toString();
      const cross=await fetchImpl(url,{...options,signal:signals(signal,15000)});
      await cross.body?.cancel();
      if(cross.status!==403||cross.redirected||cross.url&&cross.url!==url.href)throw new Error();
      result[contract.ownerId]=payload;
    }
  }catch{fail('fixture-readback','The DTM report fixture or its other-account denial did not match the expected response.');}
  return result;
}
async function readAidFixtureTargets(sql,owners){
  return Object.fromEntries(await Promise.all(Object.values(aidPaymentFixtureManifest.tables).map(async table=>[table,
    await sql`select id,user_id from ${sql('public.'+table)} where user_id in ${sql(owners)} order by id limit 10`])));
}
/** Exact owned state, under the existing fixture lock and surrounding transaction. */
export async function replaceAidFixtureRows(sql,previous,next){
  const plan=previous||next;
  if(!plan)return;
  await verifyAidFixtureIdentity(sql,plan);
  const owners=Object.keys(plan.expectedByOwner),tables=Object.values(aidPaymentFixtureManifest.tables);
  const read=()=>readAidFixtureTargets(sql,owners);
  const verifyEmpty=async()=>{
    const populated=await read();
    assertAidPaymentFixtureEmpty(plan,Object.fromEntries(tables.map(table=>[table,owners.map(userId=>({userId,count:populated[table].filter(row=>row.user_id===userId).length}))])));
  };
  if(previous){
    assertAidPaymentFixtureRowTargets(previous,await read());
    for(const table of [...tables].reverse())for(const {id,user_id} of previous.rows[table])
      await sql`delete from ${sql('public.'+table)} where id=${id} and user_id=${user_id}`;
  }
  await verifyEmpty();
  if(!next)return;
  for(const table of tables){
    const rows=next.rows[table];
    if(rows.length)await sql`insert into ${sql('public.'+table)} ${sql(rows)}`;
  }
  assertAidPaymentFixtureRowTargets(next,await read());
}

export async function removeAidFixtureRows(sql,{plan,pending}){
  const ownership=plan||pending;
  if(!ownership)return;
  await verifyAidFixtureIdentity(sql,ownership);
  const observed=await readAidFixtureTargets(sql,Object.keys(ownership.expectedByOwner));
  if(Object.values(observed).every(rows=>rows.length===0))return;
  // Either complete pre- or post-transaction state can be safely removed.
  // An unexplained or partial state remains on the recovery ledger.
  const proven=[plan,pending].filter(Boolean).find(candidate=>{
    try{return assertAidPaymentFixtureRowTargets(candidate,observed);}catch{return false;}
  });
  if(!proven)fail('fixture-cleanup','Aid payment fixture ownership could not be reconciled. The exact recovery ledger is retained.');
  await replaceAidFixtureRows(sql,proven,null);
}

export async function readAidFixtureScopes(plan,users,{origin,signal,fetchImpl=fetch}={}){
  const result={};
  for(const role of ['A','B']){
    const ownerId=plan.owners[role].id,user=users.find(item=>item.id===ownerId);
    requireSchema(user,'Missing caller for aid fixture readback.');
    await user.renewSession?.({signal});
    requireSchema(typeof user.token==='string'&&user.token.length>0,'Missing caller session for aid fixture readback.');
    result[ownerId]={};
    for(const view of ['salary','claims'])for(const summary of [false,true]){
      const selector={role,view,summary,page:1},contract=aidPaymentFixtureReadContract(plan,selector);
      const url=new URL(contract.path,origin);url.search=new URLSearchParams(contract.query).toString();
      try{
        const response=await fetchImpl(url,{method:contract.method,redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});
        if(response.status!==200||response.redirected||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('application/json')){
          void response.body?.cancel().catch(()=>{});
          throw new Error();
        }
        const reader=response.body?.getReader();if(!reader)throw new Error();
        const chunks=[];let bytes=0;
        try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>65536)throw new Error();chunks.push(part.value);}}
        finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        verifyAidPaymentFixtureReadback(plan,selector,value);
        result[ownerId][view+(summary?'Summary':'')]=value;
      }catch{fail('fixture-readback','Owned aid payment records did not match the independent fixture.');}
    }
  }
  return result;
}

const catalogSearchQuery=Object.freeze({scope:'syllabus-search',search_scope:'historical',page:'0',page_size:'20',sort:'course_code',direction:'asc'});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exactKeys=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const catalogText=(value,max)=>typeof value==='string'&&[...value].length<=max&&!/[\u0000\ud800-\udfff]/u.test(value);
function catalogSetupError(reason){const error=new Error('Published catalog fixture setup is unavailable.');error.catalogReason=reason;return error;}
/** Independent payload validation; arbitrary responses cannot author golden facts. */
export function validatePublishedCatalogFixture(query,value){
  const reject=()=>{throw catalogSetupError('published_payload_invalid');};
  if(query.scope==='syllabus-search'){
    if(JSON.stringify(query)!==JSON.stringify(catalogSearchQuery)||!exactKeys(value,['scope','total','rows','page','pageSize','hasMore','sort','revision'])||value.scope!=='historical'||!integer(value.total,0,Number.MAX_SAFE_INTEGER)||value.page!==0||value.pageSize!==20||!exactKeys(value.sort,['key','direction'])||value.sort.key!=='course_code'||value.sort.direction!=='asc'||! /^[a-f0-9]{32}$/.test(value.revision)||!Array.isArray(value.rows)||value.rows.length!==Math.min(value.total,20)||value.hasMore!==(value.total>20))reject();
    const ids=new Set(),sequences=new Set();
    for(const row of value.rows){
      if(!exactKeys(row,['id','sequence','course_code','course_name','admission_name','instructor','academicYearText','semesterText'])||!UUID.test(row.id)||ids.has(row.id)||!integer(row.sequence,1,value.total)||sequences.has(row.sequence))reject();
      for(const [key,max]of [['course_code',40],['course_name',160],['admission_name',100],['instructor',100]])if(!catalogText(row[key],max))reject();
      if(![row.academicYearText,row.semesterText].every(text=>text===null||catalogText(text,30)))reject();
      ids.add(row.id);sequences.add(row.sequence);
    }
  }else if(query.scope==='syllabus-detail'){
    if(!exactKeys(query,['scope','id'])||!UUID.test(query.id)||!exactKeys(value,['row']))reject();
    if(value.row===null)return value;
    const row=value.row,keys=[...Object.keys(catalogTextFields),...Object.keys(catalogNumberFields),...Object.keys(catalogBooleanFields),'id','version','source_mode','program_codes','meetings','syllabus'];
    if(!exactKeys(row,keys)||row.id!==query.id||!integer(row.version,1,999999999)||row.source_mode!=='sample'||row.published!==true)reject();
    for(const [key,[,max]]of Object.entries(catalogTextFields))if(!catalogText(row[key],max))reject();
    for(const key of Object.keys(catalogNumberFields))if(typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<0||row[key]>100000)reject();
    for(const key of Object.keys(catalogBooleanFields))if(typeof row[key]!=='boolean')reject();
    if(!Array.isArray(row.program_codes)||row.program_codes.length>30||row.program_codes.some(code=>typeof code!=='string'||! /^[A-Za-z0-9_-]{1,24}$/.test(code))||!Array.isArray(row.meetings)||row.meetings.length>2)reject();
    for(const slot of row.meetings)if(!exactKeys(slot,['weekday','periods'])||!integer(slot.weekday,1,7)||!Array.isArray(slot.periods)||!slot.periods.length||slot.periods.length>15||slot.periods.some(period=>!catalogPeriods.includes(period)))reject();
    try{normalizeCourseSyllabus(row.syllabus);}catch{reject();}
  }else reject();
  return value;
}
/** Exact deployed published API only; no service-role SQL or account filters. */
export async function readPublishedCatalogFixture(user,query,{origin,signal,fetchImpl=fetch}={}){
  await user?.renewSession?.({signal});
  if(!UUID.test(user?.id)||typeof user.token!=='string'||!user.token||!(exactKeys(query,['scope','id'])&&query.scope==='syllabus-detail'&&UUID.test(query.id)||JSON.stringify(query)===JSON.stringify(catalogSearchQuery)))throw catalogSetupError('published_payload_invalid');
  const url=new URL('/api/affairs-data',origin);for(const [key,value]of Object.entries(query))url.searchParams.set(key,value);
  let response;
  try{response=await fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+user.token},signal:signals(signal,15000)});}catch{throw catalogSetupError('catalog_read_unavailable');}
  if(response.status!==200||!response.headers.get('content-type')?.includes('application/json'))throw catalogSetupError('catalog_read_unavailable');
  const reader=response.body?.getReader();if(!reader)throw catalogSetupError('catalog_read_unavailable');
  const chunks=[];let bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000){await reader.cancel();throw catalogSetupError('published_payload_invalid');}chunks.push(part.value);}
    return validatePublishedCatalogFixture(query,JSON.parse(Buffer.concat(chunks).toString('utf8')));
  }catch(error){throw catalogSetupError(catalogFixtureSetupReasons.includes(error?.catalogReason)?error.catalogReason:'published_payload_invalid');}
  finally{reader.releaseLock();}
}
const immutable=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))immutable(item);Object.freeze(value);}return value;};
const catalogDigest=value=>hash(canonical(value));
function catalogQuestionCase(source,kind,row,absentId,nullIndex){
  const id=row?.id||absentId,route='/school-affairs/services/12-4?'+(kind==='null-weight'?'syllabus':'course')+'='+id;
  const facts=[],requiredText=[],forbiddenText=['Your enrollment is confirmed','You are officially enrolled'],base={behavior:'answer',requiredText,forbiddenText,requiredLinks:[route],requiredTools:['courseCatalog'],provenance:'sample',facts};
  let question;
  const fact=(label,values,kind='text',labels=[])=>({label,labels,kind,values:Array.isArray(values)?values:[values]});
  if(kind==='unfound'){
    question=`What published course offering is available at catalog ID ${id}? If none matches, do not substitute a different offering.`;
    base.behavior='unavailable';base.limitation=true;
  }else{
    requiredText.push(row.course_code);facts.push(fact('code',row.course_code,'text',['offering','course']));
    if(kind==='null-weight'){
      question=`For published syllabus offering ID ${id}, state its course code and the weight recorded in grading row ${nullIndex+1}. State if the weight is not recorded; do not replace it with zero.`;
      facts.push(fact('grading row '+(nullIndex+1),{anyOf:['not recorded','unknown','null']},'text',['grading weight','weight']));forbiddenText.push(`grading row ${nullIndex+1}: 0%`);
    }else if(kind==='enrollment-distinction'){
      question=`What course code is listed for published catalog offering ID ${id}, and does that published listing alone prove my personal enrollment?`;
      // A correct course code does not answer the separate enrollment question.
      // Require an explicit negative inference, allowing ordinary paraphrases,
      // and reject an affirmative inference even beside a correct caveat.
      facts.push(fact('enrollment',{anyOf:['does not prove','does not establish','does not confirm','does not demonstrate','does not verify','do not establish','cannot confirm','cannot establish','cannot infer','cannot be inferred','not evidence of','not proof of','not enrollment evidence','no enrollment evidence','no proof','not established','not confirmed','not verified','not an enrollment record','not student enrollment','doesn\u2019t prove',"doesn't prove",'不代表','不能證明','無法確認','不能確認','無法推定']},'text',['enrolment','enrolled','修課','選課']));
      forbiddenText.push({anyOf:['this confirms that you are enrolled','this proves that you are enrolled','the listing confirms your enrollment','the listing proves your enrollment','the listing establishes your enrollment','your enrollment is established','your enrollment is verified','enrollment: confirmed','enrollment: yes','therefore you are enrolled','therefore, you are enrolled','thus you are enrolled','you are definitely enrolled','you are indeed enrolled','已確認您選課','已證明您選課']});
    }
    else{
      question=`For published catalog offering ID ${id}, what course code, teacher and credits are recorded?`;
      facts.push(fact('teacher',row.instructor,'text',['instructor']),fact('credits',row.credits,'number'));
      if(kind==='mixed-dtm'){
        question+=' Also list my unfinished Moodle assignments.';base.requiredTools.push('dtm','assignments');base.requiredLinks.push('/dtm/assignments');
        requiredText.push('Index plan','Final portfolio');base.exactLists=[{label:'unfinished Moodle assignments',expected:['Index plan','Final portfolio'],forbidden:['Reading response']}];
      }
    }
  }
  return {...structuredClone(source),question,route,expected:base,capability:{level:'native',gap:false,limitation:kind==='unfound'?'Only this published detail lookup is empty; it establishes neither unpublished records nor personal enrollment.':'Published sample catalog facts only; no official enrollment or completed teaching is established.'}};
}
/** Bounded offline-testable binder. Every public read must agree for both callers. */
export async function collectPublishedCatalogBinding(cases,{userIds,read,absentId}={}){
  requireSchema(Array.isArray(cases)&&new Set(cases.map(row=>row.id)).size===cases.length&&Array.isArray(userIds)&&userIds.length===2&&userIds.every(id=>UUID.test(id))&&userIds[0]!==userIds[1]&&UUID.test(absentId)&&typeof read==='function','Invalid published fixture binding configuration.');
  const callers=[...userIds],resultCases=structuredClone(cases),templates=resultCases.filter(row=>row.fixtureRequirement==='published_catalog_binding');
  requireSchema(templates.every(row=>Object.hasOwn(catalogKinds,row.id)),'Unknown catalog template cannot rewrite evaluation expectations.');
  const reads=[],bound=new Map(),selected=[],unavailable=[];
  const both=async query=>{
    const a=validatePublishedCatalogFixture(query,await read(callers[0],structuredClone(query))),b=validatePublishedCatalogFixture(query,await read(callers[1],structuredClone(query)));
    if(catalogDigest(a)!==catalogDigest(b))throw catalogSetupError('public_scope_mismatch');
    const record=immutable(structuredClone({query,value:a}));reads.push(record);return record;
  };
  let search,known,nullWeight,probe,setupFailure;
  if(templates.length)try{
    search=await both(catalogSearchQuery);
    // Inspect at most ten details; lack of a suitable row is an explicit gap.
    for(const summary of search.value.rows.slice(0,10)){
      const detail=await both({scope:'syllabus-detail',id:summary.id}),row=detail.value.row;
      if(!row||['course_code','course_name','instructor','admission_name'].some(key=>row[key]!==summary[key]))throw catalogSetupError('published_payload_invalid');
      if(!row.course_code.trim()||!row.course_name.trim()||!row.instructor.trim())continue;
      known ||= detail;
      if(Array.isArray(row.syllabus.grading)&&row.syllabus.grading.some(item=>item.weight===null))nullWeight ||= detail;
      if(known&&nullWeight)break;
    }
    if(known&&templates.some(row=>catalogKinds[row.id]==='unfound'))probe=await both({scope:'syllabus-detail',id:absentId});
  }catch(error){setupFailure=catalogFixtureSetupReasons.includes(error?.catalogReason)?error.catalogReason:'catalog_read_unavailable';}
  for(const template of templates){
    const kind=catalogKinds[template.id],detail=kind==='null-weight'?nullWeight:kind==='unfound'?probe:known;
    const reason=setupFailure||(!known?'no_suitable_published_offering':kind==='null-weight'&&!detail?'no_null_weight_offering':kind==='unfound'&&detail?.value.row!==null?'absent_probe_not_empty':null);
    if(reason){unavailable.push({caseId:template.id,reason});continue;}
    const row=detail.value.row,nullIndex=row?.syllabus.grading?.findIndex(item=>item.weight===null)??-1;
    const testCase=catalogQuestionCase(template,kind,row,absentId,nullIndex);
    resultCases[resultCases.findIndex(item=>item.id===template.id)]=testCase;
    const evidenceReads=[search,detail,...(kind==='unfound'?[known]:[])];
    const record=immutable({caseId:template.id,kind,caseDigest:catalogDigest(testCase),reads:structuredClone(evidenceReads)});bound.set(template.id,record);
    selected.push({caseId:template.id,offeringId:row?.id||absentId,offeringVersion:row?.version??null,syllabusVersion:null,syllabusDigest:row?catalogDigest(row.syllabus):null,publishedSearchRevision:search.value.revision});
  }
  const binding=immutable({version:1,digest:catalogDigest({reads,selected,unavailable}),selected,unavailable});
  return {cases:resultCases,binding,bound};
}
/** Explicit post-prepare, pre-fingerprint step. No golden facts change afterward. */
export async function bindCatalogCases(cases,{signal}={}){
  const s=ready();if(s.current||s.catalogBound)fail('fixture-state','Catalog cases can be bound once before any model case.');
  if(!Array.isArray(cases)||cases.length!==s.caseIds.size||cases.some(row=>!s.caseIds.has(row.id)))fail('fixture-case','Catalog binding must preserve exactly the prepared case IDs.');
  const bounded=signals(signal||s.signal,120000);
  const result=await collectPublishedCatalogBinding(cases,{userIds:s.users.map(user=>user.id),absentId:randomUUID(),read:(userId,query)=>readPublishedCatalogFixture(s.users.find(user=>user.id===userId),query,{origin:s.origin,signal:bounded})});
  s.catalogBound=true;s.catalogBindings=result.bound;s.catalogBindingFailures=new Map(result.binding.unavailable.map(row=>[row.caseId,row.reason]));s.catalogBindingDigest=result.binding.digest;
  return {cases:result.cases,binding:result.binding};
}
/** Drift and changed case expectations fail before/after a model request. */
export async function verifyPublishedCatalogBinding(testCase,binding,{userIds,read}={}){
  if(!binding||binding.caseId!==testCase.id||binding.caseDigest!==catalogDigest(testCase))fail('fixture-catalog','The bound catalog case changed after fingerprinting.');
  requireSchema(Array.isArray(userIds)&&userIds.length===2&&userIds.every(id=>UUID.test(id))&&userIds[0]!==userIds[1]&&typeof read==='function','Catalog rechecks require the two distinct disposable callers.');
  const callers=[...userIds];
  for(const saved of binding.reads)for(const userId of callers){
    const actual=validatePublishedCatalogFixture(saved.query,await read(userId,structuredClone(saved.query)));
    if(catalogDigest(actual)!==catalogDigest(saved.value))fail('fixture-catalog','Published catalog records or revisions changed after binding; rebuild the case bank before evaluation.');
  }
  return catalogDigest(binding.reads);
}

/**
 * Pure translation boundary. shared contains already-read public catalog rows
 * and published periods. Nothing here fetches, resolves credentials or writes.
 * It returns only account-owned rows; no shared table is ever an insertion target.
 */
export async function planNativeFixture(snapshot,{userId,studentId,otherUserId,domains=PRIVATE_NATIVE_DOMAINS,shared={}}={}){
  requireSchema(UUID.test(userId)&&UUID.test(studentId)&&(!otherUserId||UUID.test(otherUserId))&&userId!==otherUserId,'Fixture identities must be distinct valid UUIDs.');
  requireSchema(Array.isArray(domains)&&new Set(domains).size===domains.length&&domains.every(key=>PRIVATE_NATIVE_DOMAINS.includes(key)||CONDITIONAL_NATIVE_DOMAINS.includes(key)),'Unknown or duplicate native fixture domain.');
  const rows={},expected={},owner=source=>{
    if(source===snapshot.profile?.userId)return userId;
    if(source===EVAL_OTHER_USER_ID&&otherUserId)return otherUserId;
    fail('fixture-isolation','A fixture record belongs to an account outside the two disposable identities.');
  };
  for(const domain of domains){
    if(!NATIVE_TABLES[domain])continue;
    expected[domain]={};
    for(const [collection,[table,fields]] of Object.entries(NATIVE_TABLES[domain])){
      const source=snapshot[domain]?.[collection];requireSchema(Array.isArray(source),`Missing ${domain}.${collection} fixture collection.`);
      rows[table]=source.map(item=>{
        const row=requiredFields(item,[...COMMON,...fields],table);row.user_id=owner(item.userId);
        if(domain==='graduationReview')row.report=Object.fromEntries(REPORT_FIELDS.map(key=>{requireSchema(Object.hasOwn(item,key),`Missing graduation report field ${key}.`);return [key,structuredClone(item[key])];}));
        validatePrivateNativeRow(table,row);return row;
      });
      expected[domain][collection]=source.filter(item=>owner(item.userId)===userId).map(item=>({...structuredClone(item),userId}));
      // The reader deliberately omits createdAt for aid; its persisted value is
      // still validated above, rather than fabricated or discarded from SQL.
      if(domain==='studentAid')expected[domain][collection].forEach(item=>delete item.createdAt);
    }
  }
  // Exercise the exact grade/graduation/attendance read validators offline.
  for(const id of [userId,otherUserId].filter(Boolean)){
    try{await loadNativeAcademicRecords(id,false,async table=>(rows[table]||[]).filter(row=>row.user_id===id));}
    catch{fail('fixture-schema','The persisted native academic rows failed the application read contract.');}
  }
  for(const domain of ['scholarship','housing'].filter(key=>domains.includes(key))){
    const value=snapshot[domain],published=shared[domain]?.periods;
    requireSchema(value&&Array.isArray(value.periods)&&Array.isArray(value.applications)&&(domain!=='housing'||Array.isArray(value.assignments)),`Missing ${domain} fixture collections.`);
    if(!Array.isArray(published))fail('fixture-unsupported',`${domain} requires an exact read-only published-period binding.`);
    if(published.length!==value.periods.length)fail('fixture-unsupported',`${domain} published periods do not equal the golden fixture; shared periods will not be changed.`);
    const bindings=new Map();expected[domain]=structuredClone(value);
    expected[domain].periods=value.periods.map(period=>{
      requiredFields(period,['id',...PERIOD_FIELDS[domain]],domain+' period');
      requireSchema(UUID.test(period.id)&&validText(period.termLabel,80)&&validStamp(period.opensAt)&&validStamp(period.closesAt)&&Date.parse(period.opensAt)<Date.parse(period.closesAt)&&period.opensAt.slice(0,10)>='2000-01-01'&&period.closesAt.slice(0,10)<'2101-01-01'&&typeof period.instructions==='string'&&period.instructions.length<=2000&&period.sourceMode==='local_demo'&&integer(period.version,1,2147483647),'Invalid published-period fixture fields.');
      if(domain==='housing')requireSchema(integer(period.academicYear,1,300)&&[1,2].includes(period.semester)&&validText(period.agreementText,4000),'Invalid housing period term or agreement.');
      const matches=published.filter(item=>item.published===true&&sameFields(item,period,PERIOD_FIELDS[domain]));
      if(matches.length!==1||!UUID.test(matches[0].id)||bindings.has(period.id))fail('fixture-unsupported',`${domain} has no unique, exactly matching published period.`);
      bindings.set(period.id,matches[0].id);return {...structuredClone(period),id:matches[0].id};
    });
    const bind=periodId=>{if(!bindings.has(periodId))fail('fixture-schema',`${domain} record references an absent golden period.`);return bindings.get(periodId);};
    rows[applicationTables[domain]]=value.applications.map(item=>{
      const row=requiredFields(item,APPLICATION_FIELDS[domain],domain+' application');row.user_id=owner(item.userId);row.period_id=bind(item.periodId);
      requireSchema(integer(row.version,1,2147483647)&&validStamp(row.submitted_at),'Invalid application version or timestamp.');
      if(domain==='scholarship'){
        requireSchema(['pending','approved','rejected','cancelled'].includes(row.status)&&
          (['approved','rejected'].includes(row.status)?validStamp(row.reviewed_at):row.reviewed_at===null)&&
          (row.status==='cancelled'?validStamp(row.cancelled_at):row.cancelled_at===null)&&
          (row.status==='approved'?amount(row.award_amount,10000000)&&amount(row.required_hours,10000)&&amount(row.actual_hours,10000):row.award_amount===null&&row.required_hours===null&&row.actual_hours===null)&&typeof row.review_note==='string'&&row.review_note.length<=2000,'Invalid scholarship review fields.');
      }else{
        const categories=['general','disability','island','low_income','lower_middle_income','college','academic_award','athlete','dorm_leader','overseas_chinese','international','mainland'];
        requireSchema(validText(row.full_name,80)&&validText(row.student_number,40)&&['male','female'].includes(row.gender)&&validText(row.department,100)&&validDay(row.birth_date)&&row.birth_date>='1900-01-01'&&row.birth_date<='2100-12-31'&&
          [row.home_phone,row.mobile_phone].every(item=>typeof item==='string'&&item.length<=40)&&typeof row.email==='string'&&row.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)&&validText(row.address,300)&&validText(row.postal_code,12)&&categories.includes(row.category)&&
          typeof row.health_notes==='string'&&row.health_notes.length<=250&&integer(row.agreement_version,1,2147483647)&&validText(row.agreement_text,4000),'Housing application is missing valid explicit synthetic form fields.');
      }
      return row;
    });
    expected[domain].applications=value.applications.filter(item=>owner(item.userId)===userId).map(item=>({...structuredClone(item),userId,periodId:bind(item.periodId)}));
    if(domain==='housing'){
      rows.affairs_housing_assignments=value.assignments.map(item=>{
        const row=requiredFields(item,BED_FIELDS,'housing assignment');row.user_id=owner(item.userId);row.period_id=bind(item.periodId);
        const period=value.periods.find(period=>period.id===item.periodId);
        requireSchema(item.academicYear===period.academicYear&&item.semester===period.semester,'Housing bed term differs from the actual bound period.');
        requireSchema(/^[A-Za-z0-9-]{1,32}$/.test(row.bed_number)&&validText(row.dormitory,80)&&[null,'upper','lower'].includes(row.bunk)&&[row.accommodation_fee,row.deposit,row.subsidy_amount].every(value=>amount(value,10000000,true))&&integer(row.version,1,2147483647),'Invalid housing assignment fields.');
        return row;
      });
      expected[domain].assignments=value.assignments.filter(item=>owner(item.userId)===userId).map(item=>({...structuredClone(item),userId,periodId:bind(item.periodId)}));
    }
  }
  if(domains.includes('courses')){
    requireSchema(Array.isArray(snapshot.courses),'Missing enrollment course fixture.');
    if(!Array.isArray(shared.courses))fail('fixture-unsupported','Enrollment fixtures require exact read-only catalog section bindings.');
    rows.affairs_enrollments=[];rows.affairs_grade_items=[];rows.affairs_attendance=[];expected.courses=structuredClone(snapshot.courses);
    for(const course of snapshot.courses){
      requiredFields(course,['enrollmentId','status','sourceMode',...COURSE_FIELDS,'grades','attendance'],'enrollment');
      const matching=shared.courses.filter(row=>sameFields(row,course,COURSE_FIELDS));
      if(matching.length!==1||!UUID.test(matching[0].sectionId))fail('fixture-unsupported','No unique catalog section matches every golden enrollment field, including term dates and meeting times.');
      requireSchema(['enrolled','withdrawn','completed'].includes(course.status)&&['sample','verified'].includes(course.sourceMode),'Invalid enrollment status or provenance.');
      rows.affairs_enrollments.push({id:course.enrollmentId,student_id:studentId,section_id:matching[0].sectionId,status:course.status,source_mode:course.sourceMode});
      requireSchema(Array.isArray(course.grades)&&Array.isArray(course.attendance),'Missing enrollment grade or attendance collection.');
      course.grades.forEach((item,index)=>{
        requireSchema(validText(item.label,10000)&&amount(item.score,999.99)&&amount(item.maximum,999.99)&&item.maximum>0&&item.score<=item.maximum&&['sample','verified'].includes(item.sourceMode),'Invalid enrollment assessment fields.');
        rows.affairs_grade_items.push({id:stableRowId([course.enrollmentId,'grade',index]),enrollment_id:course.enrollmentId,label:item.label,score:item.score,maximum:item.maximum,released_at:snapshot.checkedAt,source_mode:item.sourceMode});
      });
      course.attendance.forEach((item,index)=>{
        requireSchema(validDay(item.date)&&['present','late','absent','excused'].includes(item.status)&&['sample','verified'].includes(item.sourceMode),'Invalid enrollment attendance fields.');
        rows.affairs_attendance.push({id:stableRowId([course.enrollmentId,'attendance',index]),enrollment_id:course.enrollmentId,meeting_on:item.date,status:item.status,source_mode:item.sourceMode});
      });
    }
    if(shared.initializerSectionIds?.some(id=>!rows.affairs_enrollments.some(row=>row.section_id===id)))fail('fixture-unsupported','The account initializer would add catalog enrollments outside this golden fixture; the fixture cannot be evaluated faithfully.');
  }
  uniqueRows(rows);
  return {domains:[...domains],rows,expected,userId,studentId,otherUserId};
}

/** Exact comparison after the real API read; field mismatches are fixture errors. */
export function verifyNativeFixtureReadback(actual,plan){
  for(const domain of plan.domains){
    const ordered=value=>domain==='courses'&&Array.isArray(value)?[...value].sort((a,b)=>String(a.enrollmentId).localeCompare(String(b.enrollmentId))):value;
    assertFactEqual(ordered(actual[domain]),ordered(plan.expected[domain]),domain+' native records');
  }
  if(plan.publishedSampleBinding){
    assertFactEqual(actual.profile?.userId,plan.userId,'published sample caller');
    assertFactEqual(actual.student?.id,plan.studentId,'published sample student');
    assertFactEqual(actual.student?.program,sampleEnrollmentManifest.program.name,'published sample program');
  }
  return true;
}

/** Complete read-only initializer union, not a convenient five-code lookup.
 * The injected query runner preserves the live adapter's connection/timeouts. */
export async function readPublishedSampleInitializerRows(sql,{runQuery=task=>task()}={}){
  requireSchema(typeof sql==='function'&&typeof runQuery==='function','A bounded shared-row query is required.');
  const values=await runQuery(()=>sql`select s.id as section_id,c.id as course_id,t.id as term_id,p.id as program_id,
    c.code,c.title,c.credits,c.source_mode as course_source_mode,p.code as program_code,p.name as program_name,p.department,p.source_mode as program_source_mode,
    t.code as term_code,t.label as term_label,to_char(t.starts_on,'YYYY-MM-DD') as term_starts_on,to_char(t.ends_on,'YYYY-MM-DD') as term_ends_on,t.source_mode as term_source_mode,
    s.section_code,s.instructor,s.weekday,s.starts_at::text,s.ends_at::text,s.room,s.source_mode as section_source_mode
    from public.affairs_sections s join public.affairs_courses c on c.id=s.course_id join public.affairs_terms t on t.id=s.term_id
    left join public.affairs_programs p on p.id=c.program_id
    where t.code='SAMPLE-2026-FALL' or c.code in ('SAMP090','SAMP103','SAMP201') order by s.id limit 501`);
  if(!Array.isArray(values)||values.length>500)fail('fixture-unsupported','The complete published sample initializer union could not be established.');
  return {scope:structuredClone(sampleEnrollmentManifest.scope),complete:true,rows:values.map(row=>({
    sectionId:row.section_id,courseId:row.course_id,termId:row.term_id,programId:row.program_id,code:row.code,title:row.title,credits:Number(row.credits),courseSourceMode:row.course_source_mode,
    programCode:row.program_code,programName:row.program_name,department:row.department,programSourceMode:row.program_source_mode,
    termCode:row.term_code,termLabel:row.term_label,termStartsOn:row.term_starts_on,termEndsOn:row.term_ends_on,termSourceMode:row.term_source_mode,
    sectionCode:row.section_code,instructor:row.instructor,weekday:Number(row.weekday),startsAt:row.starts_at,endsAt:row.ends_at,room:row.room,sectionSourceMode:row.section_source_mode,
  }))};
}

/** Independent migration constants stay golden; only shared UUIDs are bound.
 * These rows target the fresh caller's enrollments, never the shared catalog. */
export async function planPublishedSampleFixture(snapshot,{userId,studentId,otherUserId,now,read,domains=PRIVATE_NATIVE_DOMAINS,shared={}}={}){
  requireSchema(snapshot?.profile?.userId===userId&&snapshot.profile.role==='student'&&Array.isArray(snapshot.courses)&&snapshot.courses.length===5,'Published samples require the exact disposable student and five-course fixture.');
  requireSchema(validStamp(snapshot.checkedAt),'Published sample seeded grades require a valid readback timestamp.');
  requireSchema(snapshot.student?.program===sampleEnrollmentManifest.program.name,'Published sample program must retain its independently authored literal name.');
  const enrollmentIdsByCode=Object.fromEntries(snapshot.courses.map(course=>[course.code,course.enrollmentId]));
  let bound;
  try{bound=bindPublishedSampleEnrollments(read,{userId,studentId,enrollmentIdsByCode,now});}
  catch{fail('fixture-unsupported','Published sample initializer rows or literal evaluation dates do not match the reviewed binding.');}
  // 050100 initializer restores this exact released grade on every read.
  // Keeping it absent would make readback itself mutate the expected fixture.
  const practiceGrade={label:'Sample practice quiz',score:8,maximum:10,sourceMode:'sample'};
  const expectedCourses=bound.expectedCourses.map(course=>({...course,grades:course.code==='SAMP101'?[{...practiceGrade}]:[],attendance:[]}));
  assertFactEqual([...snapshot.courses].sort((a,b)=>a.code.localeCompare(b.code)),[...expectedCourses].sort((a,b)=>a.code.localeCompare(b.code)),'published sample golden enrollment fields');
  const plan=await planNativeFixture(snapshot,{userId,studentId,otherUserId,domains:domains.filter(domain=>domain!=='courses'),shared});
  const enrollment=bound.enrollments.find(row=>row.id===enrollmentIdsByCode.SAMP101);
  plan.domains.push('courses');plan.expected.courses=expectedCourses;
  plan.rows.affairs_enrollments=bound.enrollments.map(row=>({...row}));
  plan.rows.affairs_grade_items=[{id:stableRowId([enrollment.id,'grade',0]),enrollment_id:enrollment.id,...pick(practiceGrade,['label','score','maximum']),released_at:snapshot.checkedAt,source_mode:'sample'}];
  plan.rows.affairs_attendance=[];
  plan.publishedSampleBinding=structuredClone(bound.binding);
  plan.publishedSampleEnrollmentIds={...enrollmentIdsByCode};
  uniqueRows(plan.rows);return plan;
}

/** Re-read all shared facts before and after the model. Never relax a mismatch. */
export async function verifyPublishedSampleFixtureBinding(plan,{read,now}={}){
  requireSchema(plan?.publishedSampleBinding&&typeof read==='function','A published sample binding and complete read are required.');
  let current;
  try{current=bindPublishedSampleEnrollments(await read(),{...plan.publishedSampleBinding.owner,enrollmentIdsByCode:plan.publishedSampleEnrollmentIds,now});}
  catch{fail('fixture-unsupported','Published sample facts changed or their complete read is unavailable.');}
  if(current.binding.sharedDigest!==plan.publishedSampleBinding.sharedDigest)fail('fixture-mapping','Published sample shared identities changed after binding.');
  return current.binding.sharedDigest;
}
/** Matches service row checks, including the separate mental-health time enum. */
export function validateFixtureServiceRecord(row){
  requireSchema(UUID.test(row?.id)&&validText(row.title,160)&&typeof row.notes==='string'&&row.notes.length<=2000&&['draft','filed','withdrawn'].includes(row.status)&&validStamp(row.updatedAt),'Invalid private service record fields.');
  const start=row.startsOn??null,end=row.endsOn??null,category=row.leaveCategory??null,periods=row.periods??null,phone=row.contactPhone??null,time=row.leaveTimePeriod??null;
  requireSchema(start===null&&end===null||validDay(start)&&validDay(end)&&start>='2000-01-01'&&end<='2100-12-31'&&start<=end,'Invalid service record dates.');
  requireSchema(category===null||['personal','sick','official','bereavement','nursing','mental_health','maternity','menstrual','other'].includes(category),'Invalid leave category.');
  requireSchema(row.serviceKey==='leave'&&row.recordType==='leave'&&start!==null&&category!==null&&validText(periods,80)||
    row.serviceKey==='internship'&&['contract','self_assessment','company'].includes(row.recordType)&&category===null&&periods===null||
    /^[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$/.test(row.serviceKey)&&row.recordType==='note'&&start===null&&category===null&&periods===null,'Invalid service-specific record shape.');
  requireSchema(phone===null||row.serviceKey==='leave'&&typeof phone==='string'&&phone.length>=3&&phone.length<=32&&/^[+0-9 ()#.-]+$/.test(phone),'Invalid private leave contact field.');
  requireSchema(category==='mental_health'?['am','pm','day'].includes(time):time===null,'leaveTimePeriod is an am/pm/day mental-health enum; ordinary leave uses periods and must leave it null.');
  requireSchema(row.reviewStatus==null||['open','in_review','resolved'].includes(row.reviewStatus),'Invalid joined service review state.');
  return true;
}
async function readNativeBindings(snapshot,testCase){
  const s=state,publishedSample=testCase.fixtureKey==='published-sample:records'||testCase.fixtureKey==='facility-repairs:compound';
  const required=new Set(testCase.expected?.requiredTools||[]),domains=[...PRIVATE_NATIVE_DOMAINS,...CONDITIONAL_NATIVE_DOMAINS.filter(domain=>required.has(domain)||domain==='courses'&&publishedSample)],shared={};
  for(const domain of ['scholarship','housing'].filter(domain=>domains.includes(domain))){
    const values=await query(()=>s.sql`select * from ${s.sql('public.'+periodTables[domain])} where published=true order by id limit 501`,'Could not read published fixture period bindings.');
    if(values.length>500)fail('fixture-unsupported','Published period bindings exceed the bounded fixture inventory.');
    const normalized=values.map(row=>({...row,opens_at:timestamp(row.opens_at),closes_at:timestamp(row.closes_at)}));
    shared[domain]=domain==='scholarship'?mapScholarshipRecords(normalized,[]):mapHousingRecords(normalized,[],[]);
  }
  if(publishedSample){
    const read=await readPublishedSampleInitializerRows(s.sql,{runQuery:task=>query(task,'Could not read the complete published sample initializer union.')});
    return planPublishedSampleFixture(snapshot,{userId:s.users[0].id,studentId:s.users[0].studentId,otherUserId:s.users[1].id,now:s.now,read,domains,shared});
  }
  if(domains.includes('courses')){
    const codes=snapshot.courses.map(row=>row.code);
    const values=await query(()=>s.sql`select s.id as section_id,c.code,c.title,c.credits,t.label as term,
      to_char(t.starts_on,'YYYY-MM-DD') as term_starts_on,to_char(t.ends_on,'YYYY-MM-DD') as term_ends_on,
      s.instructor,s.weekday,s.starts_at::text,s.ends_at::text,s.room,t.code as term_code
      from public.affairs_sections s join public.affairs_courses c on c.id=s.course_id join public.affairs_terms t on t.id=s.term_id
      where c.code in ${s.sql(codes.length?codes:['__NO_SYNTHETIC_COURSES__'])} or t.code='SAMPLE-2026-FALL' limit 501`,'Could not read exact shared course bindings.');
    if(values.length>500)fail('fixture-unsupported','Catalog bindings exceed the bounded fixture inventory.');
    shared.courses=values.map(row=>({sectionId:row.section_id,code:row.code,title:row.title,credits:Number(row.credits),term:row.term,termStartsOn:row.term_starts_on,termEndsOn:row.term_ends_on,instructor:row.instructor,weekday:Number(row.weekday),startsAt:row.starts_at,endsAt:row.ends_at,room:row.room}));
    shared.initializerSectionIds=values.filter(row=>row.term_code==='SAMPLE-2026-FALL').map(row=>row.section_id);
  }
  return planNativeFixture(snapshot,{userId:s.users[0].id,studentId:s.users[0].studentId,otherUserId:s.users[1].id,domains,shared});
}
function recordsToInsert(snapshot,user){
  const courses=snapshot.dtm.courses.filter(row=>row.sourceMode==='personal');
  const courseIds=new Set(courses.map(row=>row.id));
  const rows={
    dtm_courses:courses.map((row,index)=>({...pick(row,['id','code','title','term','role']),user_id:user.id,source_mode:'personal',created_at:new Date(Date.parse(state.now)-index*1000).toISOString()})),
    dtm_materials:courses.flatMap(course=>course.materials.map(row=>({id:row.id,course_id:course.id,title:row.title,kind:row.kind,summary:row.summary,position:row.position,source_mode:'personal',source_url:row.sourceUrl??null}))),
    dtm_meetings:courses.flatMap(course=>course.meetings.map(row=>({id:row.id,course_id:course.id,meeting_on:row.date,starts_at:row.startsAt,title:row.title,attendance:row.attendance,notes:row.notes}))),
    dtm_grade_items:courses.flatMap(course=>course.grades.map(row=>({id:row.id,course_id:course.id,label:row.label,score:row.score,maximum:row.maximum,graded_on:row.date,feedback:row.feedback}))),
    affairs_assignments:snapshot.assignments.map(row=>{
      if(row.sourceMode!=='personal'||!courseIds.has(row.dtmCourseId)||row.enrollmentId)fail('fixture-unsupported','Only actual private DTM assignments are mapped by this adapter.');
      return {id:row.id,student_id:user.studentId,enrollment_id:null,dtm_course_id:row.dtmCourseId,title:row.title,details:row.details,due_at:row.dueAt,status:row.status,submitted_at:row.submittedAt,source_mode:'personal',meeting_id:row.meetingId,import_key:row.origin==='moodle_calendar'?hash({fixture:row.id}):null};
    }),
    affairs_charges:snapshot.charges.map(row=>({id:row.id,student_id:user.studentId,label:row.label,amount_due:row.amountDue,amount_paid:row.amountPaid,currency:row.currency,due_on:row.dueOn,source_mode:row.sourceMode,occurrence_on:row.occurrenceOn,category:row.category,contact_unit:row.contactUnit,contact_extension:row.contactExtension,payment_unit:row.paymentUnit})),
    affairs_tasks:snapshot.tasks.map(row=>({id:row.id,user_id:user.id,title:row.title,due_at:row.dueAt,completed_at:row.completedAt,source_mode:row.sourceMode})),
    affairs_service_requests:snapshot.requests.map(row=>({id:row.id,user_id:user.id,request_type:row.type,title:row.title,details:row.details,status:row.status,created_at:row.createdAt,updated_at:row.createdAt})),
    affairs_service_records:[],
  };
  for(const row of snapshot.serviceRecords){
    validateFixtureServiceRecord(row);
    if(row.userId&&row.userId!==user.id)fail('fixture-isolation','Service fixture record belongs to a different account.');
    const reviewId=row.reviewStatus?randomUUID():null;
    if(reviewId)rows.affairs_service_requests.push({id:reviewId,user_id:user.id,request_type:'general',title:'Review '+row.title,details:'Synthetic local review request for '+row.title,status:row.reviewStatus,created_at:state.now,updated_at:state.now});
    rows.affairs_service_records.push({id:row.id,user_id:user.id,service_key:row.serviceKey,record_type:row.recordType,title:row.title,notes:row.notes,status:row.status,starts_on:row.startsOn,ends_on:row.endsOn,leave_category:row.leaveCategory,periods:row.periods,review_request_id:reviewId,updated_at:row.updatedAt,contact_phone:row.contactPhone??null,leave_time_period:row.leaveTimePeriod??null});
  }
  for(const [table,values] of Object.entries(rows)){
    const ids=new Set();for(const row of values){if(!UUID.test(row.id)||ids.has(row.id))fail('fixture-schema',`Duplicate or invalid synthetic record ID for ${table}.`);ids.add(row.id);}
  }
  return rows;
}
async function persistSnapshot(snapshot,rows,testCase,nativePlan,supplementalPlan,aidPlan,dtmReportPlan,elearningPlan,facilityRepairPlan,outlinePlan,dormitoryPlan){
  const s=state,user=s.users[0];
  for(const values of Object.values(rows))for(const row of values)s.recordIds.add(row.id);
  for(const domain of supplementalPlan.domains)s.supplementalTables.add(SUPPLEMENTAL_TABLES[domain]);
  if(aidPlan){
    for(const id of aidPlan.recordIds)s.recordIds.add(id);
    for(const table of Object.values(aidPaymentFixtureManifest.tables))s.supplementalTables.add(table);
  }
  if(dtmReportPlan){
    for(const id of dtmReportPlan.recordIds)s.recordIds.add(id);
    s.supplementalTables.add(dtmGradeReportFixtureManifest.table);
  }
  if(dtmReportPlan||s.dtmReportPlan){s.pendingDtmReportPlan=dtmReportPlan;s.dtmReportTransitionPending=true;}
  if(elearningPlan||s.elearningPlan){
    s.supplementalTables.add('elearning_enrollments');
    s.pendingElearningPlan=elearningPlan;s.elearningTransitionPending=true;
  }
  if(outlinePlan||s.outlinePlan){
    s.outlineTouched=true;
    s.pendingOutlinePlan=outlinePlan;s.outlineTransitionPending=true;
  }
  if(dormitoryPlan||s.dormitoryPlan){
    s.dormitoryTouched=true;
    for(const id of dormitoryPlan?.recordIds??[])s.recordIds.add(id);
    s.pendingDormitoryPlan=dormitoryPlan;s.dormitoryTransitionPending=true;
  }
  if(facilityRepairPlan||s.facilityRepairPlan){
    s.pendingFacilityRepairPlan=facilityRepairPlan;s.facilityRepairTransitionPending=true;
  }
  await saveLedger();
  if(aidPlan||s.aidPlan){s.pendingAidPlan=aidPlan;s.aidTransitionPending=true;}
  await query(async()=>{
    const tx=s.sql;await tx.unsafe('begin');
    try{
    if(s.dtmReportPlan)await changeDtmReportFixtureRows(tx,s.dtmReportPlan,'remove');
    // Deletes are scoped only to the freshly created fixture account. Global
    // sample courses, university captures, notices and real people are untouched.
    await tx`delete from public.affairs_service_records where user_id=${user.id}`;
    await tx`delete from public.affairs_service_requests where user_id=${user.id}`;
    await tx`delete from public.affairs_tasks where user_id=${user.id} and source_mode='site'`;
    await tx`delete from public.affairs_assignments where student_id=${user.studentId}`;
    await tx`delete from public.dtm_courses where user_id=${user.id} and source_mode='personal'`;
    await tx`delete from public.affairs_charges where student_id=${user.studentId}`;
    // Both owners are newly created in this lifecycle. Foreign sentinel records
    // are written only to the second fixture account, never a real identity.
    const fixtureUsers=s.users.map(item=>item.id);
    for(const table of [...ownTables,'affairs_scholarship_applications','affairs_housing_applications','affairs_housing_assignments',...s.supplementalTables]){
      if(table==='affairs_aid_payment_claims'||table==='affairs_aid_salary_records'||table==='dtm_grade_reports'||table==='elearning_enrollments')continue;
      await tx`delete from ${tx('public.'+table)} where user_id in ${tx(fixtureUsers)}`;
    }
    if(aidPlan||s.aidPlan)await replaceAidFixtureRows(tx,s.aidPlan,aidPlan);
    if(elearningPlan||s.elearningPlan)await changeElearningFixtureRows(tx,{previous:s.elearningPlan,next:elearningPlan,identities:s.identityRequests,runId:s.runId});
    if(outlinePlan||s.outlinePlan)await changeOutlineFixtureRows(tx,{previous:s.outlinePlan,next:outlinePlan,identities:s.identityRequests,runId:s.runId});
    if(dormitoryPlan||s.dormitoryPlan)await changeDormitoryFixtureRows(tx,{previous:s.dormitoryPlan,next:dormitoryPlan,identities:s.identityRequests,runId:s.runId});
    if(facilityRepairPlan||s.facilityRepairPlan)await changeFacilityRepairFixtureRows(tx,{previous:s.facilityRepairPlan,next:facilityRepairPlan,identities:s.identityRequests,runId:s.runId});
    if(nativePlan.domains.includes('courses'))await tx`delete from public.affairs_enrollments where student_id=${user.studentId}`;
    await tx`update public.affairs_profiles set preferred_name=${snapshot.profile.displayName} where user_id=${user.id}`;
    await tx`update public.affairs_students set student_number=${snapshot.student.studentNumber},full_name=${snapshot.student.fullName},year_level=${snapshot.student.yearLevel} where id=${user.studentId} and user_id=${user.id}`;
    // Programs are shared catalog data. Existing rows may be referenced, never
    // created or changed to accommodate an evaluation.
    if(nativePlan.publishedSampleBinding){
      const programId=nativePlan.publishedSampleBinding.sections[0].programId;
      await tx`update public.affairs_students set program_id=${programId} where id=${user.studentId} and user_id=${user.id}`;
    }else{
      const programs=await tx`select id from public.affairs_programs where name=${snapshot.student.program} order by id limit 2`;
      if(programs.length===1)await tx`update public.affairs_students set program_id=${programs[0].id} where id=${user.studentId} and user_id=${user.id}`;
      else if(JSON.stringify(testCase.expected).includes('Information Studies'))fail('fixture-unsupported','The required synthetic program is absent from the shared catalog; no global catalog row will be created.');
    }
    for(const [table,values] of Object.entries(rows)){
      for(let start=0;start<values.length;start+=100){
        const batch=values.slice(start,start+100).map(row=>({...row,...(table==='affairs_course_selection_records'?{meetings:tx.json(row.meetings)}:{}),...(table==='affairs_graduation_reviews'?{report:tx.json(row.report)}:{})}));
        if(batch.length)await tx`insert into ${tx('public.'+table)} ${tx(batch)}`;
      }
    }
    if(dtmReportPlan)await changeDtmReportFixtureRows(tx,dtmReportPlan,'insert');
    await tx.unsafe('commit');
    if(s.aidTransitionPending){s.aidPlan=aidPlan;s.pendingAidPlan=null;s.aidTransitionPending=false;}
    if(s.dtmReportTransitionPending){s.dtmReportPlan=dtmReportPlan;s.pendingDtmReportPlan=null;s.dtmReportTransitionPending=false;}
    if(s.elearningTransitionPending){s.elearningPlan=elearningPlan;s.pendingElearningPlan=null;s.elearningTransitionPending=false;}
    if(s.outlineTransitionPending){s.outlinePlan=outlinePlan;s.pendingOutlinePlan=null;s.outlineTransitionPending=false;}
    if(s.dormitoryTransitionPending){s.dormitoryPlan=dormitoryPlan;s.pendingDormitoryPlan=null;s.dormitoryTransitionPending=false;}
    if(s.facilityRepairTransitionPending){s.facilityRepairPlan=facilityRepairPlan;s.pendingFacilityRepairPlan=null;s.facilityRepairTransitionPending=false;}
    }catch(error){try{await tx.unsafe('rollback');}catch{/* Preserve the original, sanitized error. */}throw error;}
  },'Could not persist private evaluation rows.');
}
function canonical(value){
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value)){const result=value.map(canonical);return result.every(row=>row&&typeof row==='object'&&row.id)?result.sort((a,b)=>String(a.id).localeCompare(String(b.id))):result;}
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)&&Number.isFinite(Date.parse(value)))return timestamp(value);
  return value;
}
function assertFactEqual(actual,expected,label){
  try{assert.deepEqual(canonical(actual),canonical(expected));}catch{fail('fixture-mapping',`${label} differs between the independent golden fixture and authenticated /api/affairs-data. Model evaluation was not started.`);}
}
function verifyReadback(actual,expected,testCase){
  assertFactEqual(pick(actual.profile,['email','displayName','role']),pick(expected.profile,['email','displayName','role']),'profile');
  assertFactEqual(pick(actual.student,['studentNumber','fullName','yearLevel','status','sourceMode']),pick(expected.student,['studentNumber','fullName','yearLevel','status','sourceMode']),'student identity');
  if(JSON.stringify(testCase.expected).includes('Information Studies'))assertFactEqual(actual.student.program,expected.student.program,'program');
  assertFactEqual(sort(actual.dtm.courses.filter(row=>row.sourceMode==='personal')),sort(expected.dtm.courses.filter(row=>row.sourceMode==='personal')),'personal DTM courses, material content, meetings and grade feedback');
  assertFactEqual(sort(actual.assignments),sort(expected.assignments),'assignment records and linkage');
  assertFactEqual(sort(actual.charges),sort(expected.charges),'fee balances and contact fields');
  assertFactEqual(sort(actual.tasks.filter(row=>row.sourceMode==='site')),sort(expected.tasks),'personal task records');
  const requestIds=new Set(expected.requests.map(row=>row.id));
  assertFactEqual(sort(actual.requests.filter(row=>requestIds.has(row.id))),sort(expected.requests),'request status');
  if(testCase.fixtureKey==='empty:requests')assertFactEqual(actual.requests,[],'empty request collection');
  const serviceKeys=['id','serviceKey','recordType','title','notes','status','startsOn','endsOn','leaveCategory','periods','updatedAt','reviewStatus','contactPhone','leaveTimePeriod'];
  assertFactEqual(sort(actual.serviceRecords.map(row=>pick(row,serviceKeys))),sort(expected.serviceRecords.map(row=>pick(row,serviceKeys))),'service records and joined review status');
}
function ownState(snapshot){
  const keys=['profile','student','courses','assignments','charges','tasks','requests','serviceRecords','scholarship','studentAid','housing','creditLoadHistory','courseSelection','academicGrades','graduationReview','academicAttendance'];
  return canonical({...Object.fromEntries(keys.map(key=>[key,snapshot[key]??null])),dtm:{sourceMode:snapshot.dtm.sourceMode,courses:snapshot.dtm.courses}});
}

/** Persists golden facts, then proves the application's actual auth/RLS read path. */
export async function forCase(testCase,{signal,fixtureMode,fixtureFamily}={}){
  const s=ready();if(s.current)fail('fixture-state','afterCase() must complete before selecting another fixture.');
  const transcript=s.applicationFetch?s.transcriptFixture??null:null;
  if(s.applicationFetch){
    if(transcript?.blocked)fail('fixture-state','The saved transcript fixture requires reconciliation.');
    assertTranscriptFixtureCase(testCase,transcript?.nextIndex??0);
    if(transcript&&(!transcript.publishedSamplePlan||!transcript.beforeHash))
      fail('fixture-state','The saved transcript fixture is not bound.');
    if(transcript)transcript.blocked=true;
  }
  if(s.feeFixture){
    const family=feeRemissionLiveFamilyForCase(testCase);
    const anonymous=testCase.id==='account:fee-remission-anonymous';
    if(fixtureMode!==FEE_FIXTURE_MODE||fixtureFamily!==family||!s.caseIds.has(testCase.id)
      ||testCase.fixtureKey!==(anonymous?'anonymous':'planned:'+family))
      fail('fixture-case','Unexpected case or family for the disposable fee fixture.');
    (signal||s.signal)?.throwIfAborted();
    const {lifecycle,owners,students}=s.feeFixture;
    const plan=buildFeeRemissionFixturePlan({runId:s.runId,owners,students,fixtureKey:family});
    const before=lifecycle.status().currentFamily===family?await lifecycle.verifyUnchanged():await lifecycle.transition(plan);
    if(!anonymous)await s.users[0].renewSession({signal:signal||s.signal});
    s.current={caseId:testCase.id,beforeHash:before.digest,fixtureFamily:family};
    try{await saveLedger();}catch(error){s.current=null;throw error;}
    return anonymous?{}:{token:s.users[0].token};
  }
  if(fixtureMode!==undefined||fixtureFamily!==undefined)fail('fixture-case','Fixture mode changed after preparation.');
  if(s.aidTransitionPending)fail('fixture-state','The preceding aid fixture transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.dtmReportTransitionPending)fail('fixture-state','The preceding DTM report fixture transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.elearningTransitionPending)fail('fixture-state','The preceding remote-learning fixture transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.outlineTransitionPending)fail('fixture-state','The preceding outline access transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.dormitoryTransitionPending)fail('fixture-state','The preceding dormitory notice transaction did not settle. Cleanup must reconcile it before any further case.');
  if(s.facilityRepairTransitionPending)fail('fixture-state','The preceding repair fixture transaction did not settle. Cleanup must reconcile it before any further case.');
  if((signal||s.signal)?.aborted)fail('fixture-aborted','Evaluation was interrupted.');
  await Promise.all(s.users.map(user=>user.renewSession?.({signal:signal||s.signal})));
  const catalogBinding=s.catalogBindings?.get(testCase.id);
  if(testCase.fixtureRequirement==='published_catalog_binding'&&!catalogBinding)fail('fixture-unsupported','Published catalog fixture binding is unavailable; this case remains in the denominator and no model request may run.');
  const checkCatalog=()=>verifyPublishedCatalogBinding(testCase,catalogBinding,{userIds:s.users.map(user=>user.id),read:(userId,query)=>readPublishedCatalogFixture(s.users.find(user=>user.id===userId),query,{origin:s.origin,signal:signal||s.signal})});
  const catalog=catalogBinding?await checkCatalog():null;
  const catalogOnly=Boolean(catalogBinding&&(testCase.expected?.requiredTools||[]).every(key=>key==='courseCatalog'));
  const expected=fixtureForCase(testCase,{userId:s.users[0].id,now:s.now});
  assertSupported(testCase,expected);
  const nativePlan=transcript?.publishedSamplePlan??(catalogOnly?null:await readNativeBindings(expected,testCase));
  const supplementalPlan=planSupplementalFixture(expected,{userId:s.users[0].id,otherUserId:s.users[1].id,domains:(testCase.expected?.requiredTools||[]).filter(key=>Object.hasOwn(SUPPLEMENTAL_SCOPES,key))});
  const aidPlan=['aidPayments','empty:aidPayments'].includes(testCase.fixtureKey)?buildAidPaymentFixturePlan({
    runId:s.runId,fixtureKey:testCase.fixtureKey,owners:Object.fromEntries(s.users.map((user,index)=>{
      const request=s.identityRequests.find(row=>row.id===user.id);
      return [index===0?'A':'B',{id:user.id,email:request?.email,runMarker:request?.runId}];
    })),
  }):null;
  if(!aidPlan&&(testCase.expected?.requiredTools||[]).includes('aidPayments'))fail('fixture-unsupported','No independent aid payment fixture is declared for this case.');
  const dtmReportPlan=/^(?:(?:empty|full):)?dtmGradeReport$/u.test(testCase.fixtureKey??'')?buildDtmGradeReportFixturePlan({
    runId:s.runId,fixtureKey:testCase.fixtureKey,owners:Object.fromEntries(s.users.map((user,index)=>{
      const request=s.identityRequests.find(row=>row.id===user.id);
      return [index===0?'A':'B',{id:user.id,email:request?.email,runMarker:request?.runId}];
    })),
    courseBindings:{
      A:{...pick(expected.dtm.courses.find(row=>row.id===dtmGradeReportFixtureManifest.A.course.id)||{},['id','code','title','term','role','sourceMode']),userId:s.users[0].id},
      B:{...dtmGradeReportFixtureManifest.B.course,id:s.foreignDtmCourseId,userId:s.users[1].id},
    },
  }):null;
  if(!dtmReportPlan&&(testCase.expected?.requiredTools||[]).includes('dtmGradeReport'))fail('fixture-unsupported','No independent DTM report fixture is declared for this case.');
  const enrollmentFixtureKey=testCase.fixtureKey==='elearningOutline:mixed-enrollments'?'elearningEnrollments':testCase.fixtureKey;
  const elearningPlan=/^(?:empty:)?elearningEnrollments$/u.test(enrollmentFixtureKey??'')
    ?elearningFixturePlan(enrollmentFixtureKey,s.users.map(user=>user.id)):null;
  if(!elearningPlan&&(testCase.expected?.requiredTools||[]).includes('elearningEnrollments'))
    fail('fixture-unsupported','No independent remote-learning enrollment fixture is declared for this case.');
  const outlinePlan=testCase.fixtureRequirement==='native_elearning_outline'&&isOutlineFixtureKey(testCase.fixtureKey)
    ?planPublishedOutlineAccess(s.users.map(user=>user.id),testCase.fixtureKey):null;
  if(!outlinePlan&&[...testCase.expected?.requiredTools??[],...testCase.expected?.requiredAttemptedTools??[]].includes('elearningOutline'))
    fail('fixture-unsupported','No independent remote-learning outline fixture is declared for this case.');
  const dormitoryPlan=testCase.fixtureRequirement==='native_dormitory_conduct'&&dormitoryConductLiveFixtureKey(testCase.fixtureKey)
    ?buildDormitoryConductFixturePlan({runId:s.runId,owners:fixtureOwnersFor(s),fixtureKey:testCase.fixtureKey}):null;
  if(!dormitoryPlan&&[...testCase.expected?.requiredTools??[],...testCase.expected?.requiredAttemptedTools??[]].includes('dormitoryConduct'))
    fail('fixture-unsupported','No independent dormitory notice fixture is declared for this case.');
  const facilityRepairPlan=testCase.fixtureRequirement==='native_facility_repair'&&facilityRepairLiveFixtureKey(testCase.fixtureKey)
    ?buildFacilityRepairFixturePlan(testCase,s.users.map(user=>user.id)):null;
  if(!facilityRepairPlan&&[...testCase.expected?.requiredTools??[],...testCase.expected?.requiredAttemptedTools??[]].includes('facilityRepairs'))
    fail('fixture-unsupported','No independent repair history fixture is declared for this case.');
  if(!catalogOnly&&!transcript){
    if(s.applicationFetch)s.transcriptFixture={blocked:true};
    const rows={...recordsToInsert(expected,s.users[0]),...nativePlan.rows,...supplementalPlan.rows};
    await persistSnapshot(expected,rows,testCase,nativePlan,supplementalPlan,aidPlan,dtmReportPlan,elearningPlan,facilityRepairPlan,outlinePlan,dormitoryPlan);
  }
  const actual=await readSnapshot(s.users[0],{signal:signal||s.signal});
  if(!catalogOnly){verifyReadback(actual,expected,testCase);verifyNativeFixtureReadback(actual,nativePlan);}
  const publishedSample=nativePlan?.publishedSampleBinding?await verifyPublishedSampleFixtureBinding(nativePlan,{now:s.now,
    read:()=>readPublishedSampleInitializerRows(s.sql,{runQuery:task=>query(task,'Could not recheck the published sample initializer union.')})}):null;
  const supplementalDomains=Object.keys(SUPPLEMENTAL_TABLES).filter(key=>s.supplementalTables.has(SUPPLEMENTAL_TABLES[key]));
  const supplemental={};
  for(const user of s.users){
    supplemental[user.id]=await readSupplementalFixtureScopes(user,supplementalDomains,{origin:s.origin,signal:signal||s.signal});
    verifySupplementalFixtureReadback(supplemental[user.id],supplementalPlan,user.id);
  }
  const aid=s.aidPlan?await readAidFixtureScopes(s.aidPlan,s.users,{origin:s.origin,signal:signal||s.signal}):null;
  const dtmReport=s.dtmReportPlan?await readDtmReportFixtureScopes(s.dtmReportPlan,s.users,{origin:s.origin,signal:signal||s.signal}):null;
  const elearning=s.elearningPlan?await readElearningFixtureScopes(s.elearningPlan,s.users,{origin:s.origin,signal:signal||s.signal}):null;
  const outline=s.outlinePlan?await currentOutlineFixture(s,signal):null;
  const dormitory=s.dormitoryPlan?await currentDormitoryFixture(s,signal):null;
  const facilityRepairs=s.facilityRepairPlan?await currentFacilityRepairFixture(s,signal):null;
  const before={snapshot:ownState(actual),supplemental,catalog,...(publishedSample?{publishedSample}:{}),...(aid?{aid}:{}),...(dtmReport?{dtmReport}:{}),...(elearning?{elearning}:{}),...(facilityRepairs?{facilityRepairs}:{}),...(outline?{outline}:{}),...(dormitory?{dormitory}:{})};
  const beforeHash=hash(before);
  if(transcript&&beforeHash!==transcript.beforeHash){
    transcript.blocked=true;
    fail('fixture-readback','The saved transcript fixture changed between turns.');
  }
  if(s.applicationFetch)s.transcriptFixture={blocked:true,nextIndex:transcript?.nextIndex??0,beforeHash,publishedSamplePlan:nativePlan};
  s.current={caseId:testCase.id,beforeHash,supplementalDomains,catalogBinding,
    ...(publishedSample?{publishedSamplePlan:nativePlan}:{})};
  await saveLedger();
  await s.users[0].renewSession?.({signal:signal||s.signal});
  return {token:s.users[0].token};
}

async function currentFacilityRepairFixture(s,signal){
  const readback=await readFacilityRepairFixtureScopes(s.facilityRepairPlan,s.users,{origin:s.origin,signal:signal||s.signal});
  await query(()=>verifyFacilityRepairFixtureDatabase(s.sql,s.facilityRepairPlan),'Could not verify persisted repair rows and event metadata.');
  return readback;
}

async function currentOutlineFixture(s,signal){
  const plan=s.outlinePlan,owners=plan.map(row=>row.user_id);
  const rows=await query(()=>readOutlineFixtureTargets(s.sql,owners),'Could not verify saved outline access.');
  assertOutlineFixtureRows(plan,rows);
  return readOutlineFixtureScopes(plan,s.users,{origin:s.origin,signal:signal||s.signal});
}

async function currentDormitoryFixture(s,signal){
  const plan=s.dormitoryPlan,owners=['A','B'].map(role=>plan.owners[role].id);
  const rows=await query(()=>readDormitoryFixtureTargets(s.sql,owners,plan.recordIds),'Could not verify persisted dormitory notices.');
  assertDormitoryConductFixtureRows(plan,rows);
  return readDormitoryFixtureScopes(plan,s.users,{origin:s.origin,signal:signal||s.signal});
}

/** Deliberately never confirms or executes a proposed assistant action. */
export async function afterCase(testCase,envelope,{signal,fixtureMode,fixtureFamily}={}){
  const s=ready();if(s.current?.caseId!==testCase.id)fail('fixture-state','afterCase() does not match the prepared case.');
  const current=s.current;
  try{
    if(s.feeFixture){
      if(fixtureMode!==FEE_FIXTURE_MODE||fixtureFamily!==current.fixtureFamily)fail('fixture-state','Fee fixture scope changed during evaluation.');
      const after=await s.feeFixture.lifecycle.verifyUnchanged();
      if(after.digest!==current.beforeHash)fail('fixture-unapproved-write','The fee records changed during the assistant request.');
      const publicReply=JSON.stringify({body:envelope.body,events:envelope.events});
      const ownerMarkers=[s.feeFixture.owners.B.id,s.feeFixture.students.B.id,s.feeFixture.owners.B.email];
      if(ownerMarkers.some(marker=>publicReply.includes(marker))){
        envelope.body={error:'Fee fixture account isolation failed.'};envelope.events=[];
        fail('fixture-isolation','The assistant exposed a disposable foreign identity.');
      }
      envelope.stateBefore={ownedRecordsDigest:current.beforeHash};
      envelope.stateAfterProposal={ownedRecordsDigest:after.digest};
      envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true};
      return;
    }
    const actual=await readSnapshot(s.users[0],{signal:signal||s.signal});
    let publishedSample=null;
    if(current.publishedSamplePlan){
      verifyNativeFixtureReadback(actual,current.publishedSamplePlan);
      publishedSample=await verifyPublishedSampleFixtureBinding(current.publishedSamplePlan,{now:s.now,
        read:()=>readPublishedSampleInitializerRows(s.sql,{runQuery:task=>query(task,'Could not recheck the published sample initializer union.')})});
    }
    const supplemental={};
    for(const user of s.users)supplemental[user.id]=await readSupplementalFixtureScopes(user,current.supplementalDomains,{origin:s.origin,signal:signal||s.signal});
    const catalog=current.catalogBinding?await verifyPublishedCatalogBinding(testCase,current.catalogBinding,{userIds:s.users.map(user=>user.id),read:(userId,query)=>readPublishedCatalogFixture(s.users.find(user=>user.id===userId),query,{origin:s.origin,signal:signal||s.signal})}):null;
    const aid=s.aidPlan?await readAidFixtureScopes(s.aidPlan,s.users,{origin:s.origin,signal:signal||s.signal}):null;
    const dtmReport=s.dtmReportPlan?await readDtmReportFixtureScopes(s.dtmReportPlan,s.users,{origin:s.origin,signal:signal||s.signal}):null;
    const elearning=s.elearningPlan?await readElearningFixtureScopes(s.elearningPlan,s.users,{origin:s.origin,signal:signal||s.signal}):null;
    const outline=s.outlinePlan?await currentOutlineFixture(s,signal):null;
    const dormitory=s.dormitoryPlan?await currentDormitoryFixture(s,signal):null;
    const facilityRepairs=s.facilityRepairPlan?await currentFacilityRepairFixture(s,signal):null;
    if(testCase.publishedNextClass)assertPublishedNextClassClock(testCase.publishedNextClass,{now:new Date().toISOString()});
    const afterHash=hash({snapshot:ownState(actual),supplemental,catalog,...(publishedSample?{publishedSample}:{}),...(aid?{aid}:{}),...(dtmReport?{dtmReport}:{}),...(elearning?{elearning}:{}),...(facilityRepairs?{facilityRepairs}:{}),...(outline?{outline}:{}),...(dormitory?{dormitory}:{})});
    envelope.stateBefore={ownedRecordsDigest:current.beforeHash};
    envelope.stateAfterProposal={ownedRecordsDigest:afterHash};
    envelope.fixtureReadback={verified:true,projectRef:PROJECT,independentGolden:true};
    if(afterHash!==current.beforeHash)fail('fixture-unapproved-write','Generating an answer or proposal changed the fixture records before confirmation.');
    if(s.applicationFetch&&envelope.statusCode===200){
      s.transcriptFixture.nextIndex++;
      s.transcriptFixture.blocked=false;
    }
  }finally{s.current=null;await saveLedger();}
}

/** Removes only this lifecycle's fresh users and proves cascaded data is absent. */
export function reconcileFixtureIdentity(request,rows){
  if(!request||!UUID.test(request.runId||'')||typeof request.email!=='string'||
    request.id!==undefined&&!UUID.test(request.id)||!['pending','uncertain','created','rejected'].includes(request.state)||!Array.isArray(rows)||rows.length>1)
    fail('fixture-cleanup','Fixture identity reconciliation could not establish a unique owned account.');
  if(!rows.length)return {userId:null,unresolved:['pending','uncertain'].includes(request.state)};
  const row=rows[0];
  if(!UUID.test(row?.id||'')||row.email?.toLowerCase()!==request.email.toLowerCase()||row.run_id!==request.runId||request.id&&request.id!==row.id)
    fail('fixture-cleanup','Reserved identity ownership does not match this run; no existing account will be deleted.');
  return {userId:row.id,unresolved:false};
}

/** Only the exact four-turn application fixture exposes this metadata. No
 * access token, email, student identifier or mutable state escapes. */
export function transcriptFixtureIdentity(){
  const s=ready();
  if(!s.applicationFetch||!s.locked||!s.ledgerOwned||s.users.length!==2||s.users.some(user=>!UUID.test(user.id)))
    fail('fixture-state','The reserved transcript fixture is not ready.');
  return Object.freeze({ownerId:s.users[0].id});
}

export async function reserveTranscriptConversation({conversationId,journal}={}){
  const s=ready(),{ownerId}=transcriptFixtureIdentity();
  if(s.transcriptConversation)fail('fixture-state','This fixture already reserved a transcript conversation.');
  const owners=s.users.map(user=>{
    const matches=s.identityRequests.filter(request=>request.id===user.id&&request.runId===s.runId&&request.state==='created');
    if(matches.length!==1)fail('fixture-state','The transcript owner is not an exact disposable identity.');
    return {id:user.id,email:matches[0].email};
  });
  const fixture=createTranscriptConversationFixture({runId:s.runId,owners,conversationId,journal,sql:s.sql,
    assertLease:async()=>{
      if(state!==s||!s.locked||s.closed||!s.ledgerOwned)fail('fixture-lease','The transcript fixture lease is unavailable.');
      if(!s.closing)s.signal?.throwIfAborted();
      assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));return true;
    },
    persist:async record=>{
      if(state!==s||s.closed||!s.ledgerOwned)fail('fixture-ledger','The transcript cleanup ledger is unavailable.');
      s.transcriptConversationRecovery=record;await saveLedger();
    }});
  // Keep a failed reservation attached: cleanup must not cascade an unexpected
  // pre-existing conversation or lose the reserved-ID collision evidence.
  s.transcriptConversation=fixture;
  await fixture.reserve();
  return Object.freeze({ownerId,conversationId,readback:async()=>{
    if(ready()!==s)fail('fixture-state','The transcript fixture changed.');
    return fixture.readback();
  }});
}

export async function cleanup(){
  const s=state;if(!s)return {verified:true,createdUsers:0};
  // Deletion/reconciliation uses the administrative client, never these tokens.
  // Clear before any await, including failed/uncertain cleanup and closed retry.
  for(const user of s.users)user.token=null;
  if(s.closed){
    for(const user of s.users)user.token=null;
    fail('fixture-cleanup','The previous cleanup could not be completed and its connection is closed; use the retained private ledger for explicit recovery before another fixture run.');
  }
  s.closing=true;let verified=false,protectedOwnerUnchanged=false,cleanupError;
  try{
    let unresolvedCreation=false;const deletable=new Set(),absent=new Set();
    if((s.identityRequests.length||s.users.length)&&!s.ledgerOwned)fail('fixture-cleanup','Fixture identities have no owned cleanup ledger; no account will be deleted.');
    if(s.identityRequests.length||s.users.length||s.ledgerOwned)checkedProtectedOwnerFingerprint(s.protectedOwnerBefore);
    if(s.protectedOwnerBefore&&(s.users.some(user=>user.id===s.protectedOwnerBefore.id)||s.identityRequests.some(request=>request.id===s.protectedOwnerBefore.id||request.email?.toLowerCase()===s.protectedOwnerEmail?.toLowerCase())))
      fail('fixture-protected-owner','The protected owner cannot be treated as a disposable fixture; no account will be deleted.');
    for(const request of s.identityRequests){
      if(request.runId!==s.runId||request.id!==undefined&&!UUID.test(request.id))fail('fixture-cleanup','The fixture recovery request does not belong to this lifecycle.');
      // A changed email must not hide a known ID from ownership validation.
      const rows=await query(()=>s.sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as run_id from auth.users
        where lower(email)=lower(${request.email}) or id=${request.id??null}::uuid limit 2`,'Could not reconcile the pending fixture identity.');
      const resolved=reconcileFixtureIdentity(request,rows);
      if(resolved.userId&&resolved.userId===s.protectedOwnerBefore.id)fail('fixture-protected-owner','The protected owner cannot be treated as a disposable fixture; no account will be deleted.');
      unresolvedCreation ||= resolved.unresolved;
      if(resolved.userId&&!s.users.some(user=>user.id===resolved.userId))s.users.push({id:resolved.userId,token:null});
      if(resolved.userId){request.id=resolved.userId;request.state='created';deletable.add(resolved.userId);}
      else if(request.id)absent.add(request.id);
    }
    if(s.users.some(user=>!UUID.test(user.id)||!deletable.has(user.id)&&!absent.has(user.id)))fail('fixture-cleanup','A known fixture identity could not be reconciled; no account will be deleted.');
    if(s.ledgerOwned)await saveLedger();
    if(s.transcriptConversation){
      await s.transcriptConversation.cleanup();
      await saveLedger();
    }
    if(s.feeFixture?.lifecycle){
      await s.feeFixture.lifecycle.cleanup();
      await saveLedger();
    }
    if(s.dormitoryPlan||s.pendingDormitoryPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await changeDormitoryFixtureRows(s.sql,{previous:s.dormitoryPlan,next:s.pendingDormitoryPlan,identities:s.identityRequests,runId:s.runId,recovering:true});
          await s.sql.unsafe('commit');
          s.dormitoryPlan=null;s.pendingDormitoryPlan=null;s.dormitoryTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable dormitory notice rows.');
      await saveLedger();
    }
    if(s.outlinePlan||s.pendingOutlinePlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await changeOutlineFixtureRows(s.sql,{previous:s.outlinePlan,next:s.pendingOutlinePlan,identities:s.identityRequests,runId:s.runId,recovering:true});
          await s.sql.unsafe('commit');
          s.outlinePlan=null;s.pendingOutlinePlan=null;s.outlineTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable outline access rows.');
      await saveLedger();
    }
    if(s.facilityRepairPlan||s.pendingFacilityRepairPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await changeFacilityRepairFixtureRows(s.sql,{previous:s.facilityRepairPlan,next:s.pendingFacilityRepairPlan,identities:s.identityRequests,runId:s.runId,recovering:true});
          await s.sql.unsafe('commit');
          s.facilityRepairPlan=null;s.pendingFacilityRepairPlan=null;s.facilityRepairTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable repair records and history.');
      await saveLedger();
    }
    if(s.elearningPlan||s.pendingElearningPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await reconcileElearningFixtureRows(s.sql,{previous:s.elearningPlan,pending:s.pendingElearningPlan,identities:s.identityRequests,runId:s.runId});
          await s.sql.unsafe('commit');
          s.elearningPlan=null;s.pendingElearningPlan=null;s.elearningTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable remote-learning enrollments.');
    }
    if(s.dtmReportPlan||s.pendingDtmReportPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await removeDtmReportFixtureRows(s.sql,{plan:s.dtmReportPlan,pending:s.pendingDtmReportPlan});
          await s.sql.unsafe('commit');
          s.dtmReportPlan=null;s.pendingDtmReportPlan=null;s.dtmReportTransitionPending=false;
        }catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable DTM report records.');
    }
    if(s.aidPlan||s.pendingAidPlan){
      await query(async()=>{
        await s.sql.unsafe('begin');
        try{
          await removeAidFixtureRows(s.sql,{plan:s.aidPlan,pending:s.pendingAidPlan});
          await s.sql.unsafe('commit');
          s.aidPlan=null;s.pendingAidPlan=null;s.aidTransitionPending=false;
        }
        catch(error){try{await s.sql.unsafe('rollback');}catch{/* Preserve the original cleanup failure. */}throw error;}
      },'Could not remove the exact disposable aid payment records.');
    }
    for(const user of [...s.users].reverse().filter(user=>deletable.has(user.id))){
      let deleted=false;
      for(let attempt=0;attempt<3;attempt++){
        try{const result=await s.admin.auth.admin.deleteUser(user.id);if(!result.error||result.error.status===404){deleted=true;break;}}catch{/* Retry a bounded Auth call, without tokens in diagnostics. */}
      }
      if(!deleted)fail('fixture-cleanup','Disposable account removal failed; exact IDs remain in the owner-only cleanup ledger.');
      user.token=null;
    }
    if(s.users.length){
      const ids=s.users.map(user=>user.id);
      const remaining=await query(()=>s.sql`select 'auth' as kind,id from auth.users where id in ${s.sql(ids)}
        union all select 'profile',user_id from public.affairs_profiles where user_id in ${s.sql(ids)}
        union all select 'student',id from public.affairs_students where user_id in ${s.sql(ids)}
        union all select 'dtm',id from public.dtm_courses where user_id in ${s.sql(ids)}
        union all select 'service',id from public.affairs_service_records where user_id in ${s.sql(ids)}`,'Could not verify disposable fixture cleanup.');
      if(remaining.length)fail('fixture-cleanup','Fixture-owned rows remain; the private cleanup ledger is retained.');
      if(s.outlineTouched){
        const access=await query(()=>readOutlineFixtureTargets(s.sql,ids),'Could not verify outline access cleanup.');
        if(access.length)fail('fixture-cleanup','Fixture-owned outline access remains.');
      }
      if(s.dormitoryTouched){
        const notices=await query(()=>readDormitoryFixtureTargets(s.sql,ids),'Could not verify dormitory notice cleanup.');
        if(Object.values(notices).some(rows=>rows.length))fail('fixture-cleanup','Fixture-owned dormitory records remain.');
      }
      for(const table of [...ownTables,'affairs_scholarship_applications','affairs_housing_applications','affairs_housing_assignments',...(s.supplementalTables||[])]){
        const native=await query(()=>table==='elearning_enrollments'
          ?s.sql`select user_id from public.elearning_enrollments where user_id in ${s.sql(ids)} limit 1`
          :s.sql`select id from ${s.sql('public.'+table)} where user_id in ${s.sql(ids)} limit 1`,'Could not verify native fixture cleanup.');
        if(native.length)fail('fixture-cleanup','Native fixture-owned rows remain; the private cleanup ledger is retained.');
      }
    }
    if(s.transcriptConversation)s.transcriptConversationCleanup=await s.transcriptConversation.verifyAbsent();
    // A timed-out create with no row yet may still commit later. Keep the
    // exact private recovery intent and never turn an absent row into success.
    if(unresolvedCreation)fail('fixture-cleanup','An Auth creation outcome is still uncertain; the exact pending identity is retained in the private recovery ledger.');
    verified=true;
  }catch(error){cleanupError=error;}
  finally{
    // Verify even after failed cleanup, before releasing the reserved lock.
    // This asserts identity/profile preservation, not all owner records.
    if(s.protectedOwnerBefore){
      try{
        assertProtectedOwnerUnchanged(s.protectedOwnerBefore,await readProtectedOwnerFingerprint(s.sql,s.protectedOwnerEmail));
        protectedOwnerUnchanged=true;
      }catch{cleanupError=new LiveFixtureError('fixture-protected-owner','Protected owner preservation could not be verified; the recovery ledger is retained for independent review.');}
    }
    try{if(s.locked)await s.sql`select pg_advisory_unlock(23101314,115100)`;}catch{if(!cleanupError)cleanupError=new LiveFixtureError('fixture-cleanup','Could not release the fixture advisory lock.');}
    try{await s.sql?.release?.();}catch{if(!cleanupError)cleanupError=new LiveFixtureError('fixture-cleanup','Could not release the reserved fixture database connection.');}
    try{await s.db?.end({timeout:5});}catch{if(!cleanupError)cleanupError=new LiveFixtureError('fixture-cleanup','Could not close the fixture database connection.');}
    for(const user of s.users)user.token=null;
    s.closed=true;
  }
  if(verified&&!cleanupError){
    try{
      if(s.ledgerOwned){if(s.ledgerTempOwned)await rm(s.ledger+'.tmp',{force:true});await rm(s.ledger,{force:true});}
      state=undefined;
    }catch{cleanupError=new LiveFixtureError('fixture-cleanup','Fixture rows were removed, but the owned recovery ledger could not be cleared.');}
  }
  if(cleanupError){if(cleanupError instanceof LiveFixtureError)throw cleanupError;fail('fixture-cleanup','Cleanup could not be verified; the private ledger is retained.');}
  return {verified:true,createdUsers:s.users.length,projectRef:PROJECT,protectedOwnerUnchanged,
    ...(s.transcriptConversation?{conversationCleanup:s.transcriptConversationCleanup}:{})};
}
