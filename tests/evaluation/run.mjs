import {readFile,writeFile,mkdir,mkdtemp,rename,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {discoverSurfaces} from './surface-inventory.mjs';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';
import {buildPublicCases} from './public-cases.mjs';
import {buildServiceCases} from './service-cases.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {accountStatusCases,accountStatusSetupRequired,assertAccountStatusCaseReady} from './account-status-cases.mjs';
import {learningEntryCases,learningEntrySetupRequired,assertLearningEntryCaseReady} from './learning-entry-cases.mjs';
import {campusEntryCases,campusEntrySetupRequired,assertCampusEntryCaseReady} from './campus-entry-cases.mjs';
import {buildPlannedFeeRemissionCases} from './fee-remission-cases.mjs';
import {feeRemissionLivePlanManifest,feeRemissionLiveFamilyForCase} from './fee-remission-live-plan.mjs';
import {fixtureForCase} from './fixtures.mjs';
import {teachingFeedbackRunnerCases,teachingFeedbackCaseAdmission,assertTeachingFeedbackCaseReady,gradeEvaluationCase,teachingFeedbackSetupSummary} from './teaching-feedback-runner.mjs';
import {assessCoverage} from './coverage.mjs';
import {markLegacyDtmAssignmentListFixture} from './dtm-assignment-list-cases.mjs';
import {nativeDtmRunnerCases,nativeDtmSetupRequired,assertNativeDtmCaseReady} from './dtm-native-runner.mjs';
import {elearningCatalogRunnerCases,assertElearningCatalogCaseReady,elearningCatalogSetupRequired,elearningCatalogSetupSummary,gradeElearningCatalogCase,isElearningCatalogReadbackCase,isElearningMetadataCase,isElearningPublishedReadbackCase} from './elearning-catalog-runner.mjs';
import {metadataDispatchObservation as assistantDispatchObservation} from './elearning-metadata-live.mjs';
import {isNativeElearningEnrollmentCase,verifiedElearningEnrollmentRun} from './elearning-fixtures.mjs';
import {assertHealthMetadataLiveCases,gradeHealthMetadataLiveCase,healthMetadataDispatch,healthMetadataFamily,
  healthMetadataFixtureMode,healthMetadataLiveCases,verifiedHealthMetadataReadback} from './health-examination-live.mjs';
import {assertDtmAssignmentListClock,assertDtmAssignmentListLiveCases,dtmAssignmentListDispatch,dtmAssignmentListFamilies,dtmAssignmentListFixtureMode,
  dtmAssignmentListLiveCases,gradeDtmAssignmentListLiveCase,isDtmAssignmentListClockFamily,verifiedDtmAssignmentListReadback} from './dtm-assignment-list-live.mjs';
import {internshipRunnerCases,markLegacyInternshipFixture,nativeInternshipSetupRequired,assertNativeInternshipCaseReady,internshipSetupSummary} from './internship-native-runner.mjs';
import {venueRunnerCases,markLegacyVenueFixture,nativeVenueSetupRequired,assertNativeVenueCaseReady,venueSetupSummary} from './venue-native-runner.mjs';
import {clubAttendanceRunnerCases,clubAttendanceOracle,isClubAttendanceCase,gradeClubAttendanceCase} from './club-attendance-cases.mjs';
import {assertClubEquipmentCaseReady,clubEquipmentRunnerCases,clubEquipmentSetupRequired,clubEquipmentSetupSummary} from './club-equipment-runner.mjs';
import {serviceNoteRunnerCases,serviceNoteRunnerOracle,isServiceNoteCase,serviceNoteSetupRequired,serviceNoteSetupSummary,gradeLiveServiceNoteCase} from './service-note-runner.mjs';
import {studentLeaveRunnerCases,markLegacyStudentLeaveFixture,nativeStudentLeaveSetupRequired,assertNativeStudentLeaveCaseReady,studentLeaveSetupSummary} from './student-leave-runner.mjs';
import {buildGuidanceReviewBinding,validateGuidanceReview} from './guidance-rubric.mjs';
import {createPinnedDeploymentVerifier} from './pinned-deployment.mjs';
import {createTrustedPreviewFetch,isEvaluationPreviewOrigin} from './vercel-preview-transport.mjs';
import {assertPublishedNextClassClock} from './published-next-class.mjs';
import {certificateAwardPreviewHash,certificateBrowserCaseIds} from './certificate-award-preview.mjs';
import {announcementEmailBrowserCases} from './announcement-email-browser-turn.mjs';
import {studentProfileBrowserCases} from './student-profile-browser-turn.mjs';
import {clubAttendanceBrowserCaseIds,verifiedClubAttendanceBrowserObservation} from './club-attendance-browser-preview.mjs';
import {clubMembershipBrowserCases} from './club-membership-browser-turn.mjs';
import {venueBrowserCases,venueBrowserProfile} from './venue-browser-turn.mjs';

const browserDispatchProfiles=new Map([
  ['certificate-awards',{ids:certificateBrowserCaseIds,operation:'runCertificateAwardPreview',request:'certificate-answer',pinnedReads:2,
    cleanup:proof=>proof.certificateAwardPreviewCleanup===true&&proof.certificateAwardCatalogUnchanged===true}],
  ['announcement-email',{ids:announcementEmailBrowserCases.map(row=>row.id),operation:'runAnnouncementEmailBrowserPreview',
    request:'announcement-email-answer',pinnedReads:6,cleanup:proof=>proof.createdUsers===2&&proof.nativeBrowserCleanup==='announcement-email'}],
  ['student-profile',{ids:studentProfileBrowserCases.map(row=>row.id),operation:'runStudentProfileBrowserPreview',
    request:'student-profile-answer',pinnedReads:2,cleanup:proof=>proof.createdUsers===2&&proof.nativeBrowserCleanup==='student-profile'}],
  ['club-membership',{ids:clubMembershipBrowserCases.map(row=>row.id),operation:'runClubMembershipBrowserPreview',
    request:'club-membership-answer',answerMethod:'POST',pinnedReads:2,
    cleanup:proof=>proof.createdUsers===2&&proof.nativeBrowserCleanup==='club-membership'}],
  ['club-attendance',{ids:clubAttendanceBrowserCaseIds,operation:'runClubAttendancePreview',verify:verifiedClubAttendanceBrowserObservation}],
  [venueBrowserProfile,{ids:venueBrowserCases.map(row=>row.id),operation:'runVenueBrowserPreview',request:venueBrowserProfile+'-answer',
    answerMethod:'POST',pinnedReads:2,cleanup:proof=>proof.createdUsers===2&&proof.nativeBrowserCleanup===venueBrowserProfile,
    proof:row=>/^[a-f0-9]{64}$/u.test(row.proofDigest??'')}],
]);

const liveClientObservations=new WeakMap();

process.umask(0o077);
const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function options(args){
  const result={mode:'inventory',only:'',domain:'',now:new Date().toISOString(),origin:'https://stu.best',maxCases:Infinity,intervalMs:5500};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!['--mode','--case-family','--only','--domain','--now','--origin','--approved-preview-origin','--preview-auth','--out','--fixture-module','--max-cases','--browser-acceptance','--client-dispatch','--interval-ms','--review-report','--guidance-reviews','--reviewer'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Unknown or incomplete option: '+key);
    const value=args[++i];result[{'--case-family':'caseFamily','--fixture-module':'fixtureModule','--max-cases':'maxCases','--browser-acceptance':'browserAcceptance','--client-dispatch':'clientDispatch','--interval-ms':'intervalMs','--review-report':'reviewReport','--guidance-reviews':'guidanceReviews','--approved-preview-origin':'approvedPreviewOrigin','--preview-auth':'previewAuth'}[key]||key.slice(2)]=value;
  }
  if(!['inventory','retrieval','draft','live','review'].includes(result.mode))throw new Error('Mode must be inventory, retrieval, draft, live or review.');
  if(result.caseFamily!==undefined){
    const supported=['fee-remission',...dtmAssignmentListFamilies,healthMetadataFamily];
    if(!supported.includes(result.caseFamily))throw new Error('Unknown case family.');
    const label=result.caseFamily===healthMetadataFamily?'Health metadata':dtmAssignmentListFamilies.includes(result.caseFamily)?'Moodle assignment-list':'Fee remission';
    if(!['inventory','live'].includes(result.mode)||result.only||result.domain||result.maxCases!==Infinity)throw new Error(label+' runs require the complete isolated family in inventory or live mode; case filters are not permitted.');
    if(result.mode==='live'&&!result.fixtureModule)throw new Error(label+' live runs require an explicit isolated fixture adapter.');
    if(result.mode==='live'&&isDtmAssignmentListClockFamily(result.caseFamily)&&args.includes('--now'))
      throw new Error('Date-sensitive Moodle live runs use the real clock; --now is not accepted.');
    const projectPreview=result.caseFamily!=='fee-remission'?isEvaluationPreviewOrigin(result.origin)
      :/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-v1-d286\.vercel\.app$/u.test(result.origin);
    if(result.mode==='live'&&(!result.approvedPreviewOrigin||result.origin!==result.approvedPreviewOrigin||!projectPreview))throw new Error(label+' live runs require an explicitly approved exact project Preview origin.');
    if(result.mode==='live'&&result.caseFamily!=='fee-remission'&&result.previewAuth!=='oidc')
      throw new Error(label+' live runs require protected Preview OIDC.');
  }
  if(result.mode==='review'){
    if(!result.reviewReport||!result.guidanceReviews||!result.reviewer||!result.out)throw new Error('Review requires the saved report, independent reviews, reviewer identity and a separate output path.');
    if(!/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,119}$/.test(result.reviewer))throw new Error('Invalid reviewer identity.');
    if(result.only||result.domain||result.fixtureModule||result.maxCases!==Infinity)throw new Error('Review cannot select, rerun or replace cases.');
  }else if(result.reviewReport||result.guidanceReviews||result.reviewer)throw new Error('Independent review inputs require review mode.');
  if(result.approvedPreviewOrigin&&(result.mode!=='live'||result.origin!==result.approvedPreviewOrigin||result.origin==='https://stu.best'))throw new Error('An approved Preview origin must equal the live target origin.');
  if(result.previewAuth!==undefined&&(result.previewAuth!=='oidc'||result.mode!=='live'
    ||result.approvedPreviewOrigin!==result.origin||!isEvaluationPreviewOrigin(result.origin)))throw new Error('Preview OIDC requires an explicitly approved exact project Preview.');
  if(result.clientDispatch!==undefined&&(!browserDispatchProfiles.has(result.clientDispatch)&&result.clientDispatch!=='protected-native'
    ||result.mode!=='live'||result.previewAuth!=='oidc'))
    throw new Error('Signed browser dispatch requires a live, exact protected Preview with OIDC.');
  if(!Number.isFinite(Date.parse(result.now)))throw new Error('Provide an ISO evaluation time.');
  if(result.maxCases!==Infinity){result.maxCases=Number(result.maxCases);if(!Number.isInteger(result.maxCases)||result.maxCases<1)throw new Error('max-cases must be a positive integer.');}
  result.intervalMs=Number(result.intervalMs);
  if(!Number.isSafeInteger(result.intervalMs)||result.intervalMs<5500||result.intervalMs>60000)throw new Error('interval-ms must be an integer from 5500 to 60000.');
  return result;
}
/** Serial request starts stay below the public handler's12/minute limit even
 * when a private question delegates to it. No response is retried or erased. */
export function createLiveRequestPacer(intervalMs=5500,{now=()=>performance.now(),sleep=(ms,signal)=>delay(ms,undefined,{signal})}={}){
  if(!Number.isSafeInteger(intervalMs)||intervalMs<5500||intervalMs>60000)throw new Error('Invalid live pacing interval.');
  let previous=null;
  return async (start,signal,beforeStart)=>{
    if(typeof start!=='function')throw new Error('Live pacing requires a request callback.');
    if(beforeStart!==undefined&&typeof beforeStart!=='function')throw new Error('Live preflight requires a callback.');
    signal?.throwIfAborted();const current=now();
    if(!Number.isFinite(current)||previous!==null&&current<previous)throw new Error('Live pacing clock must be monotonic.');
    const target=previous===null?current:previous+intervalMs;let observed=current,waited=0;
    while(observed<target){
      const remaining=Math.ceil(target-observed);await sleep(remaining,signal);waited+=remaining;
      signal?.throwIfAborted();const resumed=now();
      if(!Number.isFinite(resumed)||resumed<=observed)throw new Error('Live pacing did not reach its scheduled start.');
      observed=resumed;
    }
    signal?.throwIfAborted();
    // Check the release after waiting; timestamp the actual POST, not the
    // potentially slow manifest fetch, to preserve minimum POST spacing.
    if(beforeStart)await beforeStart();
    signal?.throwIfAborted();
    // Invoke the actual request in this same continuation. A timestamp before
    // returning to the caller could undercount delays before fetch starts.
    try{return start(waited);}finally{previous=now();}
  };
}
export async function sourceIdentity(){
  const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const changes=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
  const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean))].sort();
  const digest=createHash('sha256');
  for(const file of files){digest.update(file+'\0');try{for await(const chunk of createReadStream(resolve(root,file)))digest.update(chunk);}catch(error){if(error.code!=='ENOENT')throw error;digest.update('DELETED');}digest.update('\0');}
  return {sourceRevision,workingTreeHash:digest.digest('hex'),dirty:changes.length>0};
}
/** These cases are a scoped acceptance packet, never full-project coverage.
 * Keep the frozen planned oracles and IDs; only correct anonymous dispatch. */
export function feeRemissionRunnerCases(){
  const cases=structuredClone(buildPlannedFeeRemissionCases());
  for(const row of cases)if(row.plannedFixture.auth==='anonymous')row.fixtureKey='anonymous';
  return cases;
}
export function validateFeeRemissionRunnerCases(cases){
  const canonical=feeRemissionRunnerCases(),ids=feeRemissionLivePlanManifest.eligibleCaseIds;
  if(!Array.isArray(cases)||cases.length!==20||ids.length!==20||new Set(ids).size!==20
    ||!isDeepStrictEqual(cases.map(row=>row?.id),ids)||!isDeepStrictEqual(cases,canonical))
    throw new Error('Fee remission requires the exact 20 manifest cases and unchanged independent oracles.');
  return true;
}
export async function evaluationSuite(now,{caseFamily}={}){
  if(caseFamily!==undefined&&!['fee-remission',...dtmAssignmentListFamilies,healthMetadataFamily].includes(caseFamily))throw new Error('Unknown case family.');
  const [graphInventory,clientDispatch]=await Promise.all([discoverSurfaces(),discoverClientDispatchSurfaces()]);
  const inventory={...graphInventory,clientDispatch,hash:hash({graph:graphInventory.hash,clientDispatch})};
  const cases=caseFamily==='fee-remission'?feeRemissionRunnerCases():dtmAssignmentListFamilies.includes(caseFamily)?dtmAssignmentListLiveCases(caseFamily,{now}):caseFamily===healthMetadataFamily?healthMetadataLiveCases()
    :[...serviceNoteRunnerCases({now}),...[...buildServiceCases(),...buildAccountCases({now})].map(markLegacyStudentLeaveFixture).map(markLegacyInternshipFixture).map(markLegacyDtmAssignmentListFixture).map(markLegacyVenueFixture),
      ...teachingFeedbackRunnerCases(),...nativeDtmRunnerCases(),...studentLeaveRunnerCases(),...internshipRunnerCases(),...venueRunnerCases(),
      ...elearningCatalogRunnerCases(),...accountStatusCases(),...clubAttendanceRunnerCases(),...clubEquipmentRunnerCases(),
      ...learningEntryCases(),...campusEntryCases(),...buildPublicCases(inventory)];
  if(caseFamily==='fee-remission')validateFeeRemissionRunnerCases(cases);
  const ids=new Set();
  for(const item of cases){if(!item.id||ids.has(item.id))throw new Error('Duplicate or missing case ID: '+item.id);ids.add(item.id);}
  return {inventory,cases,suiteHash:hash(cases)};
}
/** Bind fixed catalog templates before model evaluation. An adapter may only
 * replace the requested catalog facts; all other case identities stay intact. */
export function validateCatalogCaseBinding(templates,result){
  const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
  const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string'&&item.trim()&&item.length<=2000);
  const matchers=value=>Array.isArray(value)&&value.length<=100&&value.every(item=>strings([item])||exact(item,['anyOf'])&&strings(item.anyOf)&&item.anyOf.length>0&&item.anyOf.length<=100);
  if(!Array.isArray(templates)||new Set(templates.map(row=>row.id)).size!==templates.length)throw new Error('Invalid catalog templates.');
  if(!exact(result,['cases','binding'])||!Array.isArray(result.cases)||result.cases.length!==templates.length)throw new Error('Invalid catalog case binding.');
  const binding=result.binding;
  if(!exact(binding,['version','digest','selected','unavailable'])||binding.version!==1||!/^[a-f0-9]{64}$/.test(binding.digest)||!Array.isArray(binding.selected)||!Array.isArray(binding.unavailable))throw new Error('Invalid catalog binding manifest.');
  const targets=new Set(templates.filter(row=>row.fixtureRequirement==='published_catalog_binding').map(row=>row.id)),seen=new Set();
  for(const row of binding.selected){
    if(!exact(row,['caseId','offeringId','offeringVersion','syllabusVersion','syllabusDigest','publishedSearchRevision'])||!targets.has(row.caseId)||seen.has(row.caseId)
      ||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.offeringId)
      ||!(row.offeringVersion===null||Number.isSafeInteger(row.offeringVersion)&&row.offeringVersion>0)||row.syllabusVersion!==null
      ||!(row.syllabusDigest===null||/^[a-f0-9]{64}$/.test(row.syllabusDigest))||!/^[a-f0-9]{32}$/.test(row.publishedSearchRevision))throw new Error('Invalid selected published binding.');
    seen.add(row.caseId);
  }
  for(const row of binding.unavailable){
    if(!exact(row,['caseId','reason'])||!targets.has(row.caseId)||seen.has(row.caseId)||!/^[a-z][a-z0-9_]{0,60}$/.test(row.reason))throw new Error('Invalid unavailable catalog binding.');
    seen.add(row.caseId);
  }
  if(seen.size!==targets.size||Buffer.byteLength(JSON.stringify(binding),'utf8')>64000)throw new Error('Incomplete or excessive catalog binding manifest.');
  const changes=new Set(['question','route','expected','capability']);
  const chosen=new Map(binding.selected.map(row=>[row.caseId,row]));
  const mixedOracle=buildAccountCases().find(row=>row.id==='account:unfinished-assignments').expected;
  for(let index=0;index<templates.length;index++){
    const original=templates[index],bound=result.cases[index];
    if(!bound||bound.id!==original.id||typeof bound.question!=='string'||!bound.question.trim()||bound.question.length>2000||typeof bound.route!=='string'||bound.route.length>3100)throw new Error('Catalog binding changed case identity.');
    const unchanged=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!changes.has(key)));
    if(!isDeepStrictEqual(unchanged(original),unchanged(bound))||!targets.has(original.id)&&!isDeepStrictEqual(original,bound))throw new Error('Catalog binding changed an unrelated case.');
    if(!targets.has(original.id))continue;
    const selected=chosen.get(original.id);
    if(!selected){if(!isDeepStrictEqual(original,bound))throw new Error('Unavailable catalog templates must remain unchanged.');continue;}
    const empty=original.mode==='empty',mixed=original.expected.requiredTools?.includes('dtm'),expected=bound.expected;
    const path='/school-affairs/services/12-4?'+(original.id==='account:catalog-null-weight'?'syllabus':'course')+'='+selected.offeringId;
    if(original.domain!=='courseCatalog'||!['record','empty'].includes(original.mode)||original.fixtureKey==='anonymous'
      ||bound.route!==path||!bound.question.toLowerCase().includes(selected.offeringId.toLowerCase())
      ||!exact(bound.capability,['level','gap','limitation'])||bound.capability.level!=='native'||bound.capability.gap!==false||!strings([bound.capability.limitation])
      ||!exact(expected,['behavior','requiredText','forbiddenText','requiredLinks','requiredTools','provenance','facts',...(empty?['limitation']:[]),...(mixed?['exactLists']:[])])
      ||expected.behavior!==(empty?'unavailable':'answer')||expected.provenance!=='sample'
      ||!isDeepStrictEqual(expected.requiredTools,original.expected.requiredTools)||!expected.requiredTools.includes('courseCatalog')
      ||!isDeepStrictEqual(expected.requiredLinks,[path,...(mixed?['/dtm/assignments']:[])])
      ||!strings(expected.requiredText)||!matchers(expected.forbiddenText)
      ||!['Your enrollment is confirmed','You are officially enrolled'].every(text=>expected.forbiddenText.includes(text))
      ||!Array.isArray(expected.facts)||expected.facts.length>20)throw new Error('Catalog binding weakened the source or answer contract.');
    if(empty){
      if(expected.limitation!==true||expected.facts.length||selected.offeringVersion!==null||selected.syllabusDigest!==null)throw new Error('Catalog absence must retain its independent empty-detail contract.');
    }else{
      if(selected.offeringVersion===null||selected.syllabusDigest===null||!expected.facts.length)throw new Error('Published catalog answers require versioned independent facts.');
      for(const fact of expected.facts){
        if(!fact||typeof fact!=='object'||Array.isArray(fact)||Object.keys(fact).some(key=>!['label','labels','kind','values'].includes(key))
          ||!strings([fact.label])||!strings(fact.labels||[])||!['text','number','date'].includes(fact.kind)||!Array.isArray(fact.values)||!fact.values.length
          ||fact.values.some(value=>!(typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.trim()||exact(value,['anyOf'])&&strings(value.anyOf)&&value.anyOf.length)))throw new Error('Invalid independent catalog fact.');
      }
      const hasFact=label=>expected.facts.some(fact=>fact.label===label&&fact.values.length);
      if(!hasFact('code')||!expected.requiredText.length)throw new Error('Published catalog identity fact is required.');
      if(['account:catalog-known-fields','account:catalog-mixed-dtm','service:12-4:record'].includes(original.id)&&(!hasFact('teacher')||!hasFact('credits')))throw new Error('Catalog teacher and credit facts cannot be dropped.');
      if(original.id==='account:catalog-null-weight'&&!expected.facts.some(fact=>/^grading row [1-9]\d*$/.test(fact.label)&&fact.values.some(value=>exact(value,['anyOf'])&&value.anyOf.includes('not recorded'))))throw new Error('Catalog null-weight expectation cannot become a zero or generic fact.');
      if(original.id==='account:catalog-enrollment-distinction'&&(!expected.facts.some(fact=>fact.label==='enrollment'&&fact.values.some(value=>exact(value,['anyOf'])&&value.anyOf.includes('does not prove')))
        ||!expected.forbiddenText.some(value=>exact(value,['anyOf'])&&value.anyOf.includes('the listing confirms your enrollment'))))throw new Error('Published catalog facts cannot replace the explicit negative enrollment-inference oracle.');
    }
    if(mixed){
      const lists=expected.exactLists;
      if(!mixedOracle.requiredText.every(text=>expected.requiredText.includes(text))||!Array.isArray(lists)||lists.length!==1
        ||!exact(lists[0],['label','expected','forbidden'])||!strings([lists[0].label])
        ||!isDeepStrictEqual(lists[0].expected,mixedOracle.exactLists[0].expected)||!isDeepStrictEqual(lists[0].forbidden,mixedOracle.exactLists[0].forbidden))throw new Error('Mixed catalog binding dropped the independent Moodle oracle.');
    }
  }
  return structuredClone(result);
}
/** Missing public fixtures remain setup failures, even if an adapter would
 * otherwise return a token. Never spend a model request on an unbound oracle. */
export function assertCatalogCaseBound(testCase,report){
  assertTeachingFeedbackCaseReady(testCase);
  if(['native_health_metadata_planned','native_counseling_appointments_planned','native_clearance_applications_planned','native_tutor_evaluation_planned'].includes(testCase.fixtureRequirement))
    throw new Error('The isolated native fixture adapter is not mounted; this case remains an unexecuted setup failure.');
  if(testCase.fixtureRequirement==='offline_reader_failure')throw new Error('This deliberately unavailable reader case has no live failure-injection fixture; it remains an unexecuted setup failure.');
  if(testCase.fixtureRequirement!=='published_catalog_binding')return;
  if(report.bindingPending!==false||report.catalogBinding?.unavailable?.some(row=>row.caseId===testCase.id)
    ||!report.catalogBinding?.selected?.some(row=>row.caseId===testCase.id)
    ||!report.boundCatalogCases?.some(row=>isDeepStrictEqual(row,testCase)))throw new Error('Published catalog binding is unavailable; this case remains an unexecuted setup failure.');
}
async function saveReport(path,report){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temp=path+'.tmp';await writeFile(temp,JSON.stringify(report,null,2),{mode:0o600});await rename(temp,path);
}
export async function readReply(response){
  const reader=response.body?.getReader();
  if(!reader)throw new Error('Assistant response has no body.');
  const chunks=[];let bytes=0;
  try{
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      bytes+=value.byteLength;
      if(bytes>2_000_000)throw new Error('Assistant response exceeds the evaluation limit.');
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
  if(!response.headers.get('content-type')?.includes('text/event-stream'))return {body:JSON.parse(text),events:[]};
  const events=[];let body,terminal=false;
  for(const block of text.split(/\r?\n\r?\n/)){
    const type=block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
    if(!data)continue;
    const value=JSON.parse(data);
    if(terminal)throw new Error('Assistant emitted data after its terminal stream event.');
    if(type==='result'){body=value;terminal=true;}
    else if(type==='progress'){if(events.length>=100)throw new Error('Assistant emitted too many progress events.');events.push(value);}
    else if(type==='error'){body={error:value.error||'Stream failed'};terminal=true;}
  }
  if(!body)throw new Error('Assistant stream ended without a result.');
  return {body,events};
}
export function validateFixtureAdapter(adapter,{fixtureMode}={}){
  if(!adapter||!['prepare','forCase','cleanup'].every(key=>typeof adapter[key]==='function'))throw new Error('A live fixture adapter must implement prepare, forCase and verified cleanup before any fixture is created.');
  if(fixtureMode==='fee-remission-only'&&(!Array.isArray(adapter.fixtureModes)||!adapter.fixtureModes.includes(fixtureMode)||typeof adapter.afterCase!=='function'))throw new Error('The isolated fee remission adapter must explicitly support fee-remission-only and implement mandatory afterCase readback.');
}
function assertFeeRemissionReadback(envelope){
  const before=envelope.stateBefore?.ownedRecordsDigest,after=envelope.stateAfterProposal?.ownedRecordsDigest;
  if(typeof before!=='string'||!(/^[a-f0-9]{64}$/u.test(before))||before!==after||envelope.fixtureReadback?.verified!==true||envelope.fixtureReadback?.independentGolden!==true)
    throw new Error('Fee remission afterCase did not prove unchanged owned rows against the independent fixture.');
}
export async function deploymentIdentity(origin,signal){
  try{
    const target=new URL(origin);
    if(origin!==target.origin||target.username||target.password||!(target.origin==='https://stu.best'||['localhost','127.0.0.1'].includes(target.hostname)))throw new Error('Unexpected deployment origin');
    const response=await fetch(new URL('/release.json',origin),{redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
    if(response.status!==200||response.redirected||response.url&&response.url!==new URL('/release.json',origin).href||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw new Error('No deployment manifest');
    const reader=response.body?.getReader();if(!reader)throw new Error('No manifest body');
    const chunks=[];let bytes=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096)throw new Error('Oversized manifest');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    // Match the build-generated schema; a local HEAD or test-supplied SHA is not
    // evidence of what an independently deployed endpoint is running.
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='builtAt,environment,revision,source,version'||
      value.version!==1||!/^[a-f0-9]{40}$/.test(value.revision||'')||value.source!=='vercel-git'||
      !['production','preview'].includes(value.environment)||target.origin==='https://stu.best'&&value.environment!=='production'||
      typeof value.builtAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.builtAt)||!Number.isFinite(Date.parse(value.builtAt))||new Date(value.builtAt).toISOString()!==value.builtAt)throw new Error('Invalid deployment manifest');
    return {verified:true,sourceRevision:value.revision};
  }catch{return {verified:false,sourceRevision:'unknown'};}
}
export function gradeRetrievalCase(testCase,evidence,metadata={}){
  const expected=testCase.expected?.retrieval;
  const required=expected?.requiredText||[],forbidden=expected?.forbiddenText||[];
  const text=JSON.stringify(expected?.sourceId?evidence.filter(row=>row.id===expected.sourceId):evidence);
  const checks=[...required.map(value=>({id:'retrieval.required',passed:text.includes(String(value)),detail:String(value)})),
    ...forbidden.map(value=>({id:'retrieval.forbidden',passed:!text.includes(String(value)),detail:String(value)}))];
  if(expected?.sourceId)checks.unshift({id:'retrieval.source',passed:evidence.some(row=>row.id===expected.sourceId),detail:expected.sourceId});
  if(!required.length&&!forbidden.length){
    return {caseId:testCase.id,domain:testCase.domain,...metadata,execution:'deterministic',executed:false,passed:false,failureKind:'setup',checks:[],failures:[{id:'retrieval.noAssertions',detail:'This case has no independent retrieval content assertions; run its endpoint behavior evaluation instead.'}]};
  }
  return {caseId:testCase.id,domain:testCase.domain,...metadata,execution:'deterministic',executed:true,passed:checks.every(row=>row.passed),failureKind:checks.some(row=>!row.passed)?'behavior':null,checks,failures:checks.filter(row=>!row.passed)};
}
export function verifiedNativeBrowserObservation({result,question,sourceRevision,origin,profile}){
  const scope=browserDispatchProfiles.get(profile);
  if(!scope?.ids.includes(question?.id))throw new Error('The signed browser report is outside the frozen profile.');
  if(scope.verify)return scope.verify({result,question,sourceRevision,origin});
  const [row]=result.results;
  const {cleanup,deployment}=result;
  const answerRequests=result.browserDiagnostics?.flatMap(context=>context.observations).filter(event=>
    event.request===scope.request&&event.method===(scope.answerMethod??'GET')&&event.forwarded===true)??[];
  const dispatched=answerRequests.length>0;
  const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
  const passed=answerRequests.length===1&&result.origin===origin&&result.sourceRevision===sourceRevision&&result.execution==='live-browser'
    &&(profile==='certificate-awards'?result.dispatchProfile===undefined:result.dispatchProfile===profile)
    &&result.terminal===true&&result.caseIds.length===1&&result.caseIds[0]===question.id
    &&result.suiteDigest===certificateAwardPreviewHash([question])&&sha(result.boundSuiteDigest)
    &&result.liveAcceptance===true&&result.browserDispatchAcceptance===true&&deployment?.status==='finished'
    &&deployment.sourceRevision===sourceRevision&&deployment.origin===origin&&deployment.completed===scope.pinnedReads&&deployment.issued===scope.pinnedReads
    &&row?.caseId===question.id&&result.results.length===1&&row.passed===true
    &&row.native?.passed===true&&row.native.requestDigest===row.requestDigest&&row.native.responseDigest===row.responseDigest
    &&(!scope.proof||scope.proof(row))
    &&sha(row.requestDigest)&&sha(row.responseDigest)&&row.browserTurn?.answerRequests===1&&row.browserTurn.saveRequests===1
    &&row.browserRestore?.restoreRequests===1&&row.readback?.own===true&&row.readback.crossed===true
    &&row.readback.version===1&&sha(row.readback.messageDigest)&&sha(row.before?.stateDigest)&&isDeepStrictEqual(row.before,row.after)
    &&cleanup.verified===true&&cleanup.protectedOwnerUnchanged===true&&scope.cleanup(cleanup)&&cleanup.conversationCleanup?.verified===true
    &&cleanup.conversationCleanup.conversationRows===0;
  return {id:question.id,dispatched,passed:Boolean(passed),cleanupVerified:cleanup.verified===true,
    reportDigest:hash(result),requestDigest:row?.requestDigest??null,responseDigest:row?.responseDigest??null};
}

export function assessRun(report,{cases,inventory,requestedSuite,sourceRevision,browserAcceptance}){
  const assessment=assessCoverage({cases,results:report.results,inventory,requestedSuite,sourceRevision,browserAcceptance,requireLive:true});
  const integrity=[];
  const campusCases=cases.filter(campusEntrySetupRequired);
  if(campusCases.length){
    assessment.campusEntrySetup={registered:campusCases.length,liveEligible:0,caseIds:campusCases.map(row=>row.id)};
    integrity.push({id:'run.campusEntryFixtureUnbound',detail:'Campus entry cases require deployed route and verified session observations.'});
  }
  const entryCases=cases.filter(learningEntrySetupRequired);
  if(entryCases.length){
    assessment.learningEntrySetup={registered:entryCases.length,liveEligible:0,caseIds:entryCases.map(row=>row.id)};
    integrity.push({id:'run.learningEntryFixtureUnbound',detail:'Learning entry cases require deployed route and verified session observations.'});
  }
  const identityCases=cases.filter(accountStatusSetupRequired);
  if(identityCases.length){
    assessment.accountIdentitySetup={registered:identityCases.length,liveEligible:0,caseIds:identityCases.map(row=>row.id)};
    integrity.push({id:'run.accountIdentityFixtureUnbound',detail:'Sign-in cases require independent verified caller observations on the deployed revision.'});
  }
  const teachingSetup=teachingFeedbackSetupSummary(cases);
  if(teachingSetup.registered){
    assessment.teachingFeedbackSetup=teachingSetup;
    integrity.push({id:'run.teachingFixtureUnbound',detail:'Registered teaching cases still require isolated fixtures and independent request-bound read observations; offline declarations cannot establish live acceptance.'});
  }
  const nativeDtmPending=cases.filter(nativeDtmSetupRequired),nativeDtmSetup=nativeDtmPending.map(row=>row.id);
  if(nativeDtmSetup.length){
    assessment.nativeDtmSetup={registered:nativeDtmSetup.length,liveEligible:0,caseIds:nativeDtmSetup,
      legacyAssignmentListCaseIds:nativeDtmPending.filter(row=>row.fixtureRequirement==='legacy_dtm_assignment_list_rebind').map(row=>row.id)};
    integrity.push({id:'run.nativeDtmFixtureUnbound',detail:'Native DTM record cases require caller-bound fixture and request observations before live execution.'});
  }
  const catalogSetup=elearningCatalogSetupSummary(cases);
  if(catalogSetup.registered)assessment.elearningCatalogSetup=catalogSetup;
  if(catalogSetup.unboundCaseIds.length)
    integrity.push({id:'run.elearningCatalogFixtureUnbound',detail:'The remaining Digital Academy catalog cases require deployed scoped sources and request-bound fixture observations.'});
  const leaveSetup=studentLeaveSetupSummary(cases);
  if(leaveSetup.registered){
    assessment.studentLeaveSetup=leaveSetup;
    integrity.push({id:'run.studentLeaveFixtureUnbound',detail:'Registered Student Leave cases require independent caller-bound fixtures and request observations before live execution.'});
  }
  const internshipSetup=internshipSetupSummary(cases);
  if(internshipSetup.registered){
    assessment.internshipSetup=internshipSetup;
    integrity.push({id:'run.nativeInternshipFixtureUnbound',detail:'Registered native internship cases require isolated caller-bound fixtures and independent request observations before live execution.'});
  }
  const venueSetup=venueSetupSummary(cases);
  if(venueSetup.registered){
    assessment.venueSetup=venueSetup;
    integrity.push({id:'run.nativeVenueFixtureUnbound',detail:'Venue request cases require independent venue and companion fixtures and caller-bound request observations.'});
  }
  const equipmentSetup=clubEquipmentSetupSummary(cases);
  if(equipmentSetup.registered){
    assessment.clubEquipmentSetup=equipmentSetup;
    integrity.push({id:'run.clubEquipmentFixtureUnbound',detail:'Exact protected equipment results are graded by the isolated paired-owner operator; the default runner lacks these observations.'});
  }
  const noteSetup=serviceNoteSetupSummary(cases);
  if(noteSetup.registered)assessment.serviceNoteSetup=noteSetup;
  if(noteSetup.unboundCaseIds.length)integrity.push({id:'run.serviceNoteFixtureUnbound',
    detail:'Service-note companion and source-failure cases retain their independent fixture requirements.'});
  if(inventory.clientDispatch?.questions.length){
    const questions=inventory.clientDispatch.questions.map(item=>item.id);
    const observations=liveClientObservations.get(report)??[];
    const passed=observations.filter(item=>item.passed);
    const missing=questions.filter(id=>!passed.some(item=>item.id===id));
    assessment.clientDispatch={total:questions.length,executed:observations.filter(item=>item.dispatched).length,passed:passed.length,missing};
    if(missing.length){
      assessment.releaseReady=false;
      assessment.passed=false;
      assessment.releaseBlockers.push('client_dispatch_acceptance_missing');
      assessment.failures.push({id:'client_dispatch_acceptance_missing',detail:'The native browser dispatch questions require independent end-to-end execution. Graph API results do not satisfy them.'});
    }
  }
  if(report.runFailure)integrity.push({id:'run.executionFailed',detail:report.runFailure});
  if(report.results.some(row=>row.response?.fixtureIntegrityFailed))integrity.push({id:'run.fixtureReadbackFailed',detail:'Post-request fixture integrity could not be verified.'});
  if(report.cleanup?.complete!==true)integrity.push({id:'run.cleanupUnverified',detail:'Disposable fixture cleanup has not been verified.'});
  if(report.sourceUnchanged!==true)integrity.push({id:'run.sourceChanged',detail:'Release inputs changed during evaluation.'});
  if(report.dirty!==false)integrity.push({id:'run.dirtySource',detail:'The evaluated source has uncommitted changes.'});
  if(report.mode==='live'&&(!report.deployment?.verified||report.deployment.sourceRevision!==sourceRevision))integrity.push({id:'run.deploymentMismatch',detail:'The target deployment could not be matched to the evaluated source revision.'});
  if(report.injectedDependencies===true)integrity.push({id:'run.injectedDependencies',detail:'Offline injected execution cannot establish live release acceptance.'});
  if(report.mode==='live'){
    const pin=report.deploymentPin;
    const complete=pin?.status==='finished'&&pin.failure===null&&pin.pendingRequest===null&&pin.sourceRevision===sourceRevision
      &&pin.manifest?.revision===sourceRevision&&pin.identityKind==='release-manifest'&&pin.deploymentId===null
      &&Number.isSafeInteger(pin.issued)&&pin.issued>=0&&pin.completed===pin.issued
      &&Number.isSafeInteger(pin.rechecked)&&pin.rechecked>=report.results.filter(row=>row.executed!==false&&row.fixtureKey!=='anonymous').length
      &&pin.checked===2+2*pin.issued+pin.rechecked;
    if(!complete)integrity.push({id:'run.deploymentPinUnverified',detail:'Exact release checks before fixtures, around every request, and after cleanup did not complete.'});
    const executed=report.results.filter(row=>row.executed!==false),tickets=executed.map(row=>row.response?.deploymentCheck);
    if(tickets.some(ticket=>ticket?.verified!==true||ticket.sourceRevision!==sourceRevision||!Number.isSafeInteger(ticket.requestIndex)||ticket.requestIndex<1||ticket.requestIndex>pin?.issued)
      ||new Set(tickets.map(ticket=>ticket?.requestIndex)).size!==tickets.length)
      integrity.push({id:'run.responsePinUnverified',detail:'Every executed response needs a distinct paired check against the same pinned release.'});
    if(report.results.some(row=>row.response?.deploymentIntegrityFailed))integrity.push({id:'run.deploymentDrift',detail:'A response could not be attributed to the pinned release; its original response remains in the report.'});
  }
  if(report.bindingPending===true)integrity.push({id:'run.catalogBindingPending',detail:'Required published catalog expectations were not bound before model evaluation.'});
  assessment.integrity={passed:integrity.length===0,failures:integrity};
  assessment.failures.push(...integrity);
  if(integrity.length){assessment.releaseReady=false;assessment.passed=false;assessment.releaseBlockers.push(...integrity.map(row=>row.id));}
  return assessment;
}

/** A completed report is immutable evidence. A human review creates a new
 * assessment of its exact responses; it never reruns or replaces an answer. */
export function applyGuidanceReviews(report,suite,reviewFile,{reviewer,sourceRevision}){
  if(!report||report.version!==1||report.mode!=='live'||typeof report.runId!=='string'||!Array.isArray(report.results)||!Array.isArray(report.selectedCases)
    ||report.sourceRevision!==sourceRevision||!report.finishedAt||report.bindingPending||report.guidanceReviewOf)
    throw new Error('Review requires an original completed live report at the same source revision.');
  if(!reviewFile||reviewFile.version!==1||!Array.isArray(reviewFile.reviews)||reviewFile.reviews.length>1000||Object.keys(reviewFile).some(key=>!['version','reviews'].includes(key)))
    throw new Error('Invalid independent review file.');
  const cases=structuredClone(suite.cases);
  const bound=report.boundCatalogCases||[];
  if(bound.length){
    const verified=validateCatalogCaseBinding(suite.cases.filter(row=>report.selectedCases.includes(row.id)),{cases:suite.cases.filter(row=>report.selectedCases.includes(row.id)).map(row=>bound.find(item=>item.id===row.id)||row),binding:report.catalogBinding});
    const replacements=new Map(verified.cases.map(row=>[row.id,row]));
    for(let i=0;i<cases.length;i++)cases[i]=replacements.get(cases[i].id)||cases[i];
  }
  if(hash(cases)!==report.suiteHash||suite.inventory.hash!==report.inventoryHash)throw new Error('The frozen evaluation suite or inventory has changed.');
  const byCase=new Map(cases.map(row=>[row.id,row])),seen=new Set(),artifacts=new Map();
  if(new Set(report.selectedCases).size!==report.selectedCases.length||report.selectedCases.some(id=>!byCase.has(id)))throw new Error('Invalid selected case identities.');
  for(const artifact of reviewFile.reviews){
    const caseId=artifact?.binding?.caseId??artifact?.caseId;
    if(typeof caseId!=='string'||artifacts.has(caseId)||!report.selectedCases.includes(caseId)||!byCase.get(caseId)?.expected?.guidanceRubric
      ||artifact.reviewer?.id!==reviewer)throw new Error('Duplicate, unrelated or untrusted review artifact.');
    artifacts.set(caseId,artifact);
  }
  const reviewed=structuredClone(report);
  reviewed.results=report.results.map(row=>{
    const testCase=byCase.get(row.caseId);
    if(!testCase||!report.selectedCases.includes(row.caseId)||seen.has(row.caseId)||!row.response)throw new Error('Invalid original result identity or response.');
    seen.add(row.caseId);
    if(row.response.sourceRevision!==sourceRevision||row.response.fixtureKey!==testCase.fixtureKey)throw new Error('Response provenance differs from its frozen case.');
    if(!testCase.expected.guidanceRubric)return structuredClone(row);
    const binding=buildGuidanceReviewBinding({runId:report.runId,finalSuiteHash:report.suiteHash,sourceRevision,testCase,envelope:row.response});
    if(!row.guidanceReviewBinding||!isDeepStrictEqual(row.guidanceReviewBinding,binding))throw new Error('The saved response differs from its original review binding.');
    const artifact=artifacts.get(row.caseId),independentReview=validateGuidanceReview({testCase,envelope:row.response,binding,artifact});
    const grade=gradeEvaluationCase(testCase,row.response,{independentReview});
    return {...structuredClone(row),...grade,guidanceReviewBinding:binding,independentReview,independentReviewArtifact:artifact?structuredClone(artifact):null,
      failureKind:row.response.failureKind||(grade.passed?null:'behavior')};
  });
  if([...artifacts.keys()].some(id=>!seen.has(id)))throw new Error('Review artifact has no original response.');
  reviewed.guidanceReviewOf={runId:report.runId,sha256:hash(report),reviewer,reviewedAt:new Date().toISOString(),reviewsHash:hash(reviewFile)};
  return {report:reviewed,cases};
}

async function boundedReportRead(path,maxBytes){
  const file=resolve(root,path),base=resolve(root,'artifacts/assistant-evaluation');
  if(relative(base,file).startsWith('..')||!file.endsWith('.json')||(await stat(file)).size>maxBytes)throw new Error('Review input must be a bounded JSON file in artifacts/assistant-evaluation.');
  return JSON.parse(await readFile(file,'utf8'));
}
async function reviewSavedReport(opt,identity){
  const [original,reviewFile]=await Promise.all([boundedReportRead(opt.reviewReport,100_000_000),boundedReportRead(opt.guidanceReviews,8_000_000)]);
  const out=resolve(root,opt.out);
  if(relative(resolve(root,'artifacts/assistant-evaluation'),out).startsWith('..')||!out.endsWith('.json')||[opt.reviewReport,opt.guidanceReviews].some(path=>resolve(root,path)===out))throw new Error('Review output must be a separate evaluation JSON report.');
  // Never overwrite an existing acceptance artifact, even another review.
  try{await stat(out);throw new Error('Review output already exists.');}catch(error){if(error.code!=='ENOENT')throw error;}
  const suite=await evaluationSuite(original.evaluationTime,{caseFamily:original.caseFamily});
  const {report,cases}=applyGuidanceReviews(original,suite,reviewFile,{reviewer:opt.reviewer,sourceRevision:identity.sourceRevision});
  let browserAcceptance;
  if(opt.browserAcceptance){
    browserAcceptance=JSON.parse(await readFile(resolve(root,opt.browserAcceptance),'utf8'));
    if(!original.browserEvidence||hash(browserAcceptance)!==original.browserEvidence.sha256)throw new Error('Browser evidence differs from the original run.');
  }
  const after=await sourceIdentity();
  report.reviewSourceUnchanged=after.sourceRevision===identity.sourceRevision&&after.workingTreeHash===identity.workingTreeHash&&identity.dirty===false;
  report.sourceUnchanged=original.sourceUnchanged===true&&report.reviewSourceUnchanged;
  report.assessment=assessRun(report,{cases,inventory:suite.inventory,sourceRevision:identity.sourceRevision,browserAcceptance,requestedSuite:report.caseFamily?'subset':report.selectedCases.length===cases.length?'full':'subset'});
  await mkdir(dirname(out),{recursive:true,mode:0o700});
  await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({mode:'review',report:relative(root,out),originalReport:opt.reviewReport,...report.assessment.totals,releaseReady:report.assessment.releaseReady}));
  if(!report.assessment.releaseReady)process.exitCode=1;
  return report;
}
/** Dependencies are an offline test seam, never a CLI release bypass. Reports
 * from any injected invocation are explicitly ineligible for release. */
export async function main(args=process.argv.slice(2),dependencies={}){
  const identify=dependencies.sourceIdentity||sourceIdentity,buildSuite=dependencies.evaluationSuite||evaluationSuite,
    persist=dependencies.saveReport||saveReport,
    loadAdapter=dependencies.loadFixtureAdapter||(path=>import(pathToFileURL(path).href)),log=dependencies.log||console.log;
  const opt=options(args),identity=await identify();
  if(opt.clientDispatch&&Object.keys(dependencies).length)throw new Error('Signed browser dispatch cannot run with injected dependencies.');
  if(opt.mode==='review'&&Object.keys(dependencies).length)throw new Error('Saved live reports cannot be reviewed with injected dependencies.');
  if(opt.mode==='review')return reviewSavedReport(opt,identity);
  const feeOnly=opt.caseFamily==='fee-remission',assignmentListOnly=dtmAssignmentListFamilies.includes(opt.caseFamily);
  const healthMetadataOnly=opt.caseFamily===healthMetadataFamily;
  const fixtureMode=feeOnly?'fee-remission-only':assignmentListOnly?dtmAssignmentListFixtureMode:healthMetadataOnly?healthMetadataFixtureMode:undefined;
  const isolatedFixture=fixtureMode?{fixtureMode,caseFamily:opt.caseFamily}:{};
  const suite=await buildSuite(opt.now,{caseFamily:opt.caseFamily}),runId=randomUUID();
  if(feeOnly){validateFeeRemissionRunnerCases(suite.cases);if(suite.suiteHash!==hash(suite.cases))throw new Error('Fee remission suite hash does not match its frozen cases.');}
  if(assignmentListOnly){
    assertDtmAssignmentListLiveCases(suite.cases,opt.caseFamily,{now:opt.now});
    if(suite.suiteHash!==hash(suite.cases))throw new Error('Moodle assignment-list suite hash does not match the frozen cases.');
  }
  if(healthMetadataOnly){
    assertHealthMetadataLiveCases(suite.cases);
    if(suite.suiteHash!==hash(suite.cases))throw new Error('Health metadata suite hash does not match the frozen packet.');
  }
  let selected=suite.cases.filter(row=>(!opt.only||row.id.startsWith(opt.only))&&(!opt.domain||row.domain===opt.domain)).slice(0,opt.maxCases);
  if(!selected.length)throw new Error('No cases match.');
  if(opt.mode==='live'&&selected.some(isNativeElearningEnrollmentCase)
    &&(!opt.fixtureModule||opt.previewAuth!=='oidc'||opt.approvedPreviewOrigin!==opt.origin||!isEvaluationPreviewOrigin(opt.origin)))
    throw new Error('Native remote-learning enrollment cases require an authorized exact protected Preview and fixture adapter.');
  // Do not pass an unmounted native case into the legacy adapter: prepare
  // may initialize accounts and seed unrelated data before forCase is called.
  const fixtureCases=selected.filter(row=>!teachingFeedbackCaseAdmission(row)&&!nativeDtmSetupRequired(row)&&!nativeStudentLeaveSetupRequired(row)&&!nativeInternshipSetupRequired(row)&&!elearningCatalogSetupRequired(row)&&!nativeVenueSetupRequired(row)&&!accountStatusSetupRequired(row)&&!serviceNoteSetupRequired(row)&&!learningEntrySetupRequired(row)&&!campusEntrySetupRequired(row)&&!clubEquipmentSetupRequired(row));
  const out=resolve(root,opt.out||`artifacts/assistant-evaluation/${opt.mode}-${runId}.json`);
  if(relative(resolve(root,'artifacts/assistant-evaluation'),out).startsWith('..')||!out.endsWith('.json'))throw new Error('Reports must be JSON under artifacts/assistant-evaluation.');
  let browserAcceptance;
  if(opt.browserAcceptance){
    const path=resolve(root,opt.browserAcceptance),contents=await readFile(path,'utf8');
    if(contents.length>2_000_000)throw new Error('Browser acceptance proof exceeds the evaluation limit.');
    browserAcceptance=JSON.parse(contents);
  }
  const report={version:1,runId,mode:opt.mode,startedAt:new Date().toISOString(),evaluationTime:opt.now,...identity,suiteHash:suite.suiteHash,inventoryHash:suite.inventory.hash,
    injectedDependencies:Object.keys(dependencies).length>0,...isolatedFixture,
    ...(opt.previewAuth?{previewAccess:'vercel-development-oidc'}:{}),
    pacing:{minimumRequestStartIntervalMs:opt.intervalMs,automaticRequestRetries:0},
    browserEvidence:browserAcceptance?{sha256:hash(browserAcceptance),sourceRevision:browserAcceptance.sourceRevision}:null,
    selectedCases:selected.map(row=>row.id),totalCases:suite.cases.length,inventory:suite.inventory,results:[],cleanup:{required:opt.mode==='live',complete:opt.mode!=='live'}};
  if(selected.some(row=>teachingFeedbackCaseAdmission(row)))report.teachingFeedbackSetup=teachingFeedbackSetupSummary(selected);
  if(selected.some(clubEquipmentSetupRequired))report.clubEquipmentSetup=clubEquipmentSetupSummary(selected);
  const leaveSetup=studentLeaveSetupSummary(selected);
  if(leaveSetup.registered)report.studentLeaveSetup=leaveSetup;
  const internshipSetup=internshipSetupSummary(selected);
  if(internshipSetup.registered)report.internshipSetup=internshipSetup;
  const venueSetup=venueSetupSummary(selected);
  if(venueSetup.registered)report.venueSetup=venueSetup;
  const noteSetup=serviceNoteSetupSummary(selected);
  if(noteSetup.registered)report.serviceNoteSetup=noteSetup;
  if(opt.mode==='inventory'){
    report.cases=suite.cases;report.assessment=assessRun({...report,sourceUnchanged:true},{cases:suite.cases,inventory:suite.inventory,sourceRevision:identity.sourceRevision,requestedSuite:opt.caseFamily?'subset':'full'});
    await persist(out,report);log(JSON.stringify({mode:opt.mode,cases:suite.cases.length,services:suite.inventory.services.length,tools:suite.inventory.tools.length,publicPages:suite.inventory.publicPages.length,report:relative(root,out),releaseReady:false}));return report;
  }
  const controller=new AbortController();const interrupt=()=>controller.abort();process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  let adapter,deploymentGate,browserCleanupPending=false;const pace=dependencies.pace||createLiveRequestPacer(opt.intervalMs);
  let fetchImpl=dependencies.fetchImpl||globalThis.fetch;
  try{
    if(opt.mode==='live'){
      if(isDtmAssignmentListClockFamily(opt.caseFamily))
        assertDtmAssignmentListClock(selected[0],new Date().toISOString(),{reserveMs:65_000});
      const config=JSON.parse(await readFile(resolve(root,'deployment.json'),'utf8'));
      if(opt.origin!==config.vercel.productionUrl&&opt.approvedPreviewOrigin!==opt.origin)throw new Error('Live evaluation requires the configured production origin or an explicitly approved exact Preview origin.');
      if(identity.dirty!==false)throw new Error('Live evaluation requires a clean, exact source revision before creating fixtures.');
      if(fixtureCases.some(isElearningPublishedReadbackCase)&&!opt.previewAuth)
        throw new Error('Digital Academy published readbacks require an explicitly approved, exact Preview with OIDC access.');
      if(opt.previewAuth){
        if(config.repository!=='LuxArt0317/std_edu_ai'||config.vercel.teamSlug!=='v1-d286'||config.vercel.projectName!=='std_edu_ai')
          throw new Error('Preview OIDC requires the exact client project checkout.');
        fetchImpl=createTrustedPreviewFetch({origin:opt.origin,token:process.env.VERCEL_OIDC_TOKEN,fetchImpl});
      }
      deploymentGate=createPinnedDeploymentVerifier({origin:opt.origin,expectedRevision:identity.sourceRevision,
        approvedPreviewOrigin:opt.approvedPreviewOrigin,signal:controller.signal,fetchImpl});
      const pinned=await deploymentGate.pin();
      report.deployment={verified:true,sourceRevision:pinned.sourceRevision};report.deploymentPin=deploymentGate.status();
      report.bindingPending=selected.some(row=>row.fixtureRequirement==='published_catalog_binding');
      if(report.bindingPending){report.templateSuiteHash=report.suiteHash;report.suiteHash=null;}
      await persist(out,report);
      if(opt.clientDispatch){
        const fixtures=await import('./live-fixtures.mjs');
        const observations=[];
        const selected=[...browserDispatchProfiles].filter(([profile])=>opt.clientDispatch==='protected-native'||opt.clientDispatch===profile);
        liveClientObservations.set(report,observations);
        for(const [profile,{ids,operation}] of selected)for(const id of ids){
          const question=suite.inventory.clientDispatch.questions.find(item=>item.id===id);
          if(!question)throw new Error('A frozen signed browser question is missing from the inventory.');
          await deploymentGate.assertCurrent();
          await mkdir(dirname(out),{recursive:true,mode:0o700});
          const directory=await mkdtemp(resolve(dirname(out),'client-'+profile+'-'));
          browserCleanupPending=true;
          const result=await fixtures[operation]({origin:opt.origin,sourceRevision:identity.sourceRevision,
            previewToken:process.env.VERCEL_OIDC_TOKEN,browserCase:id,artifactDirectory:directory,
            signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5*60_000)]),
            onCheckpoint:value=>saveReport(resolve(directory,'report.json'),value)});
          browserCleanupPending=result.cleanup.verified!==true;
          observations.push(verifiedNativeBrowserObservation({result,question,sourceRevision:identity.sourceRevision,origin:opt.origin,profile}));
          report.clientDispatchRun=observations.map(item=>({...item}));
          await persist(out,report);
          if(browserCleanupPending)throw new Error('Signed browser fixture disposal needs reconciliation before another fixture starts.');
        }
      }
      if(opt.fixtureModule&&fixtureCases.length&&!fixtureCases.every(row=>isClubAttendanceCase(row)&&row.fixtureKey==='anonymous')){
        const modulePath=resolve(root,opt.fixtureModule);
        if(relative(resolve(root,'tests/evaluation'),modulePath).startsWith('..'))throw new Error('Fixture adapters must be repository evaluation modules.');
        adapter=await loadAdapter(modulePath);
        validateFixtureAdapter(adapter,{fixtureMode});
        if(opt.previewAuth&&adapter.protectedPreviewReadbackVersion!==1)
          throw new Error('The fixture adapter must support exact protected Preview readbacks.');
        if(fixtureCases.some(row=>row.fixtureKey!=='anonymous'&&isClubAttendanceCase(row))
          &&(adapter.clubAttendanceFixtureVersion!==1||typeof adapter.afterCase!=='function'))
          throw new Error('Club attendance requires the bound disposable fixture and both-owner readback adapter.');
        if(fixtureCases.some(row=>isServiceNoteCase(row)&&row.fixtureKey!=='anonymous')
          &&(adapter.serviceNoteFixtureVersion!==1||typeof adapter.afterCase!=='function'))
          throw new Error('Service notes require the exact two-caller fixture adapter and after-request verification.');
        if(fixtureCases.some(row=>row.serviceNoteCompanion)&&adapter.serviceNoteCompanionFixtureVersion!==1)
          throw new Error('Service-note companions require independent hosted timetable or charge readbacks.');
        if(fixtureCases.some(isElearningMetadataCase)
          &&(adapter.elearningMetadataFixtureVersion!==1||typeof adapter.afterCase!=='function'))
          throw new Error('Digital Academy metadata requires paired disposable caller readbacks.');
        if(fixtureCases.some(isElearningCatalogReadbackCase)
          &&(adapter.elearningCatalogFixtureVersion!==1||typeof adapter.afterCase!=='function'))
          throw new Error('Digital Academy course catalog requires paired disposable caller readbacks.');
        if(assignmentListOnly&&(adapter.dtmAssignmentListFixtureVersion!==1||!adapter.fixtureModes?.includes(fixtureMode)||typeof adapter.afterCase!=='function'))
          throw new Error('Moodle assignment-list evaluation requires paired disposable caller readbacks.');
        if(healthMetadataOnly&&(adapter.healthMetadataFixtureVersion!==1||!adapter.fixtureModes?.includes(fixtureMode)||typeof adapter.afterCase!=='function'))
          throw new Error('Health metadata requires the isolated two-caller fixture and protected readbacks.');
        const previewReadbackFetch=opt.previewAuth?async(input,init={})=>{
          if((init.method??'GET')!=='GET')throw new Error('Protected fixture transport is read-only.');
          return fetchImpl(input,init);
        }:undefined;
        await adapter.prepare({runId,cases:feeOnly?structuredClone(fixtureCases):fixtureCases,now:opt.now,origin:opt.origin,signal:controller.signal,
          approvedPreviewOrigin:opt.approvedPreviewOrigin,expectedReleaseRevision:identity.sourceRevision,...isolatedFixture,
          ...(previewReadbackFetch?{previewReadbackFetch}:{})});
        if(report.bindingPending&&typeof adapter.bindCatalogCases==='function'){
          const bound=validateCatalogCaseBinding(selected,await adapter.bindCatalogCases(structuredClone(selected),{signal:controller.signal}));
          selected=bound.cases;const replacements=new Map(selected.map(row=>[row.id,row]));
          suite.cases=suite.cases.map(row=>replacements.get(row.id)||row);suite.suiteHash=hash(suite.cases);
          report.suiteHash=suite.suiteHash;report.catalogBinding=bound.binding;report.bindingPending=false;
          report.boundCatalogCases=structuredClone(selected.filter(row=>row.fixtureRequirement==='published_catalog_binding'));
          // Concrete questions/oracles are fixed and persisted before any
          // assistant call. Missing bindings retain their original case IDs.
          await persist(out,report);
        }
      }else if(fixtureCases.some(row=>row.fixtureKey!=='anonymous'))throw new Error('Signed-in live cases require an explicit disposable fixture adapter; no real account is inferred.');
    }
    const modules=opt.mode==='draft'||opt.mode==='retrieval'?await Promise.all([import('../../server/affairsAnswer.js'),import('../../server/answerVerificationAccount.js'),import('../../server/schoolAffairsDirectory.js')]):null;
    for(const testCase of selected){
      const feeOnly=opt.caseFamily==='fee-remission';
      const nativeClub=isClubAttendanceCase(testCase),serviceNotes=isServiceNoteCase(testCase);
      const nativeMetadata=isElearningMetadataCase(testCase),nativeCatalog=isElearningCatalogReadbackCase(testCase);
      const publishedAcademyReadback=nativeMetadata||nativeCatalog;
      const liveExecution=testCase.executionContract==='live-native'?'live-native':'live-model';
      if(controller.signal.aborted)break;
      const started=Date.now();let envelope,fixtureReady=false,executed=false,phase='setup',pacingWaitMs=0,requestTicket,academyDispatch,assignmentListDispatch,healthDispatch;
      try{
        assertTeachingFeedbackCaseReady(testCase);
        assertNativeDtmCaseReady(testCase);
        assertNativeStudentLeaveCaseReady(testCase);
        assertNativeInternshipCaseReady(testCase);
        assertElearningCatalogCaseReady(testCase);
        if(publishedAcademyReadback&&opt.mode!=='live')throw new Error('Digital Academy published readbacks require the exact protected Preview and both callers.');
        assertNativeVenueCaseReady(testCase);
        assertClubEquipmentCaseReady(testCase);
        assertAccountStatusCaseReady(testCase);
        assertLearningEntryCaseReady(testCase);
        assertCampusEntryCaseReady(testCase);
        if(serviceNotes){
          serviceNoteRunnerOracle(testCase);
          if(serviceNoteSetupRequired(testCase))throw new Error(testCase.setupReason);
          if(opt.mode!=='live')throw new Error('Service-note acceptance requires independent hosted endpoint and fixture observations.');
        }
        if(nativeClub){
          clubAttendanceOracle(testCase);
          if(opt.mode!=='live')throw new Error('Club attendance uses the actual native assistant route; draft or retrieval mode cannot execute it.');
        }
        if(opt.mode==='live'){
          assertCatalogCaseBound(testCase,report);
          if(feeOnly||healthMetadataOnly||testCase.fixtureKey!=='anonymous'){
            // A prior response check cannot authorize the next fixture write:
            // aliases can change between cases even when local source is fixed.
            await deploymentGate.assertCurrent();report.deploymentPin=deploymentGate.status();
          }
          const fixtureContext={signal:controller.signal,...(fixtureMode?{fixtureMode,
            fixtureFamily:feeOnly?feeRemissionLiveFamilyForCase(testCase):opt.caseFamily}:{})};
          const pairedFixture=feeOnly||healthMetadataOnly||assignmentListOnly;
          const context=!pairedFixture&&testCase.fixtureKey==='anonymous'?{}:await adapter.forCase(feeOnly?structuredClone(testCase):testCase,fixtureContext);
          fixtureReady=pairedFixture||testCase.fixtureKey!=='anonymous';
          if(!context||typeof context!=='object')throw new Error('Live fixture did not supply a valid request context.');
          if(testCase.fixtureKey!=='anonymous'&&(typeof context.token!=='string'||!context.token.trim()))throw new Error('Private live fixture did not supply its own session.');
          if(pairedFixture&&testCase.fixtureKey==='anonymous'&&context.token!==undefined)throw new Error('Anonymous private-account cases must not receive a session token.');
          const endpoint=testCase.endpoint||(testCase.fixtureKey==='anonymous'?'/api/research-assistant':'/api/affairs-assistant');
          if(!['/api/research-assistant','/api/affairs-assistant'].includes(endpoint))throw new Error('Unsupported evaluation endpoint.');
          const requestBody=JSON.stringify({question:testCase.question,history:testCase.history||[],route:testCase.route,
            stream:true,consentedResearchUse:false});
          phase='infrastructure';
          const response=await pace(waited=>{
            if(testCase.publishedNextClass){
              try{assertPublishedNextClassClock(testCase.publishedNextClass,{now:new Date().toISOString()});}
              catch(error){phase='setup';throw error;}
            }
            let assignmentListStartedAt;
            if(testCase.assignmentListClock){
              try{assignmentListStartedAt=assertDtmAssignmentListClock(testCase,new Date().toISOString(),{reserveMs:65_000});}
              catch(error){phase='setup';throw error;}
            }
            pacingWaitMs=waited;executed=true;
            if(publishedAcademyReadback)academyDispatch=assistantDispatchObservation(endpoint,requestBody);
            if(assignmentListOnly)assignmentListDispatch=dtmAssignmentListDispatch(endpoint,requestBody,Boolean(context.token),assignmentListStartedAt);
            if(healthMetadataOnly)healthDispatch=healthMetadataDispatch(endpoint,requestBody);
            return fetchImpl(new URL(endpoint,opt.origin),{method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json',...(context.token?{Authorization:'Bearer '+context.token}:{})},
              body:requestBody,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(65000)])});
          },controller.signal,async()=>{
              requestTicket=await deploymentGate.beforeRequest();report.deploymentPin=deploymentGate.status();await persist(out,report);
            });
          if(response.redirected||response.url&&response.url!==new URL(endpoint,opt.origin).href)throw new Error('Assistant response changed the exact target URL.');
          const requestId=response.headers.get('X-Assistant-Request-Id');
          const correlationId=requestId&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)?requestId:undefined;
          envelope={statusCode:response.status,...await readReply(response),...(correlationId?{correlationId}:{}),
            execution:liveExecution,fixtureKey:testCase.fixtureKey,sourceRevision:report.deployment.sourceRevision,
            ...(academyDispatch?{[nativeMetadata?'metadataDispatch':'catalogDispatch']:academyDispatch}:{}),...(assignmentListDispatch?{assignmentListDispatch}:{}),
            ...(healthDispatch?{healthMetadataDispatch:healthDispatch}:{})};
          const expectedStatus=testCase.expected.expectedStatusCode||testCase.expected.statusCode;
          if(response.status>=500||response.status===429||envelope.body?.error&&response.status!==expectedStatus)envelope.failureKind='infrastructure';
        }else{
          if(testCase.expected.expectedStatusCode===401)throw new Error('Authentication behavior requires endpoint execution; draft mode does not simulate successful denial.');
          const snapshot=testCase.mode==='navigation'?null:fixtureForCase(testCase,{now:opt.now});
          if(opt.mode==='retrieval'){
            const evidence=modules[1].accountEvidence(snapshot,testCase.expected.requiredTools||[],{question:testCase.question,route:testCase.route,history:testCase.history||[]});
            const result=gradeRetrievalCase(testCase,evidence,{sourceRevision:identity.sourceRevision,fixtureKey:testCase.fixtureKey,elapsedMs:Date.now()-started});
            report.results.push(result);await persist(out,report);continue;
          }
          executed=true;phase='infrastructure';
          const body=testCase.mode==='navigation'?modules[2].answerDirectoryQuestion(testCase.question,testCase.route):await modules[0].answerPrivateAffairsQuestion(testCase.question,snapshot,testCase.history||[],testCase.route,{draftOnly:true});
          envelope={statusCode:200,body:body||{status:'abstained',answer:'No deterministic answer'},events:[],execution:'deterministic',fixtureKey:testCase.fixtureKey,sourceRevision:identity.sourceRevision};
        }
      }catch(error){
        const execution=phase==='setup'&&(healthMetadataOnly||assignmentListOnly||publishedAcademyReadback||nativeClub||serviceNotes||nativeStudentLeaveSetupRequired(testCase)||nativeInternshipSetupRequired(testCase)||nativeDtmSetupRequired(testCase)||elearningCatalogSetupRequired(testCase)||nativeVenueSetupRequired(testCase)||accountStatusSetupRequired(testCase)||learningEntrySetupRequired(testCase)||campusEntrySetupRequired(testCase)||clubEquipmentSetupRequired(testCase))?'not-run':opt.mode==='live'?liveExecution:'deterministic';
        envelope={statusCode:0,body:{error:error instanceof Error?error.message:'Evaluation request failed'},events:[],failureKind:phase,execution,
          fixtureKey:testCase.fixtureKey,sourceRevision:opt.mode==='live'?report.deployment?.sourceRevision||'unknown':identity.sourceRevision};
      }
      finally{
        if(requestTicket){
          try{await deploymentGate.afterRequest(requestTicket);envelope.deploymentCheck={requestIndex:requestTicket.requestIndex,sourceRevision:requestTicket.sourceRevision,verified:true};}
          catch(error){report.deploymentFailure??=error.message;}
        }
        if(deploymentGate){
          report.deploymentPin=deploymentGate.status();
          if(report.deploymentPin.status==='failed'){
            envelope.deploymentIntegrityFailed=true;envelope.failureKind='infrastructure';envelope.sourceRevision='unknown';
            envelope.deploymentCheck={requestIndex:requestTicket?.requestIndex??null,sourceRevision:identity.sourceRevision,verified:false};
            report.runFailure='Pinned deployment verification failed; no further assistant requests were sent.';
          }
        }
        if(fixtureReady&&adapter?.afterCase&&(!testCase.assignmentListClock||executed)){
          try{
            await adapter.afterCase(feeOnly?structuredClone(testCase):testCase,envelope,{signal:controller.signal,
              ...(fixtureMode?{fixtureMode,fixtureFamily:feeOnly?feeRemissionLiveFamilyForCase(testCase):opt.caseFamily}:{})});
            if(feeOnly)assertFeeRemissionReadback(envelope);
            if(assignmentListOnly&&!verifiedDtmAssignmentListReadback(testCase,envelope))
              throw new Error('The pinned Moodle assignment-list readback is missing or changed.');
            if(healthMetadataOnly&&!verifiedHealthMetadataReadback(testCase,envelope))
              throw new Error('The pinned Health metadata readback is missing or changed.');
            if(serviceNotes&&(!envelope.fixtureReadback?.serviceNotes?.twoOwnersVerified
              ||envelope.fixtureReadback.serviceNotes.caseId!==testCase.id))throw new Error('Exact service-note readback is missing.');

          }
          catch(error){envelope.fixtureIntegrityError=error instanceof Error?error.message:'Fixture readback failed';envelope.fixtureIntegrityFailed=true;
            envelope.failureKind=error?.code==='dtm-assignment-list-clock-invalid'?'setup':'infrastructure';}
        }
      }
      envelope.elapsedMs=Date.now()-started;
      envelope.pacingWaitMs=pacingWaitMs;
      envelope.executed=executed;
      const guidanceReviewBinding=testCase.expected.guidanceRubric&&/^[a-f0-9]{40}$/.test(envelope.sourceRevision||'')&&/^[a-f0-9]{64}$/.test(report.suiteHash||'')?buildGuidanceReviewBinding({runId:report.runId,finalSuiteHash:report.suiteHash,sourceRevision:envelope.sourceRevision,testCase,envelope}):null;
      const independentReview=guidanceReviewBinding?validateGuidanceReview({testCase,envelope,binding:guidanceReviewBinding,artifact:undefined}):undefined;
      const result=healthMetadataOnly?gradeHealthMetadataLiveCase(testCase,envelope):assignmentListOnly?gradeDtmAssignmentListLiveCase(testCase,envelope):serviceNotes?gradeLiveServiceNoteCase(testCase,envelope):nativeClub?gradeClubAttendanceCase(testCase,envelope):testCase.catalogOracle||testCase.metadataOracle?gradeElearningCatalogCase(testCase,envelope,{independentReview}):gradeEvaluationCase(testCase,envelope,{independentReview});
      if(opt.mode==='live'&&executed&&isNativeElearningEnrollmentCase(testCase)){
        const check={id:'elearning.pairedNativeEvidence',passed:verifiedElearningEnrollmentRun(testCase,envelope),
          detail:'The pinned reply retained an exact check and both independent caller projections stayed unchanged.'};
        result.checks.push(check);
        if(!check.passed){result.passed=false;result.failures.push(check);}
      }
      for(const [flag,id] of [['deploymentIntegrityFailed','run.deploymentDrift'],['fixtureIntegrityFailed','run.fixtureReadbackFailed']])if(envelope[flag]){
        const check={id,passed:false,detail:'The original response is retained but its execution integrity was not verified.'};
        result.passed=false;result.checks.push(check);result.failures.push(check);
      }
      report.results.push({...result,executed,failureKind:envelope.failureKind||(result.passed?null:'behavior'),response:envelope,...(guidanceReviewBinding?{guidanceReviewBinding,independentReview}:{})});
      log(JSON.stringify({case:testCase.id,passed:result.passed,failures:result.failures.map(row=>row.id),ms:envelope.elapsedMs}));
      const feeSetupFailed=feeOnly&&envelope.failureKind==='setup';
      if(feeSetupFailed)report.runFailure='Fee remission fixture setup failed; no further cases or fixture transitions were attempted.';
      const clubSetupFailed=nativeClub&&opt.mode==='live'&&envelope.failureKind==='setup';
      if(clubSetupFailed)report.runFailure='Club attendance fixture setup failed; the runner stopped before another assistant request.';
      const noteSetupFailed=serviceNotes&&!serviceNoteSetupRequired(testCase)&&opt.mode==='live'&&envelope.failureKind==='setup';
      if(noteSetupFailed)report.runFailure='Service-note setup failed before dispatch; the runner stopped before another request.';
      const academySetupFailed=publishedAcademyReadback&&opt.mode==='live'&&envelope.failureKind==='setup';
      if(academySetupFailed)report.runFailure='Digital Academy setup failed before dispatch; the runner stopped before another request.';
      const assignmentListSetupFailed=assignmentListOnly&&opt.mode==='live'&&envelope.failureKind==='setup';
      if(assignmentListSetupFailed)report.runFailure='Moodle assignment-list fixture or clock guard failed. No further requests were sent.';
      const healthSetupFailed=healthMetadataOnly&&opt.mode==='live'&&envelope.failureKind==='setup';
      if(healthSetupFailed)report.runFailure='Health metadata fixture setup failed before dispatch.';
      await persist(out,report);
      if(envelope.deploymentIntegrityFailed||envelope.fixtureIntegrityFailed||feeSetupFailed||clubSetupFailed||noteSetupFailed||academySetupFailed||assignmentListSetupFailed||healthSetupFailed)break;
    }
  }catch(error){
    report.runFailure=error instanceof Error?error.message:'Evaluation initialization failed';
    throw error;
  }finally{
    if(adapter?.cleanup){try{const proof=await adapter.cleanup();report.cleanup.complete=proof?.verified===true;report.cleanup.proof=proof?.verified===true?{verified:true}:null;}catch(error){report.cleanup.complete=false;report.cleanup.error=error instanceof Error?error.message:'Fixture cleanup failed';}}
    else report.cleanup.complete=!browserCleanupPending;
    if(deploymentGate){
      try{await deploymentGate.finish();}catch(error){report.deploymentFailure??=error.message;}
      report.deploymentPin=deploymentGate.status();
    }
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
    report.finishedAt=new Date().toISOString();
    const finalIdentity=await identify();
    report.sourceUnchanged=finalIdentity.sourceRevision===identity.sourceRevision&&finalIdentity.workingTreeHash===identity.workingTreeHash;
    report.assessment=assessRun(report,{cases:suite.cases,inventory:suite.inventory,sourceRevision:identity.sourceRevision,browserAcceptance,requestedSuite:opt.caseFamily?'subset':selected.length===suite.cases.length?'full':'subset'});
    await persist(out,report);
  }
  log(JSON.stringify({report:relative(root,out),...report.assessment.totals,releaseReady:report.assessment.releaseReady,cleanup:report.cleanup.complete}));
  if(!report.assessment.releaseReady)process.exitCode=1;
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
