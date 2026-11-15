import {isDeepStrictEqual} from 'node:util';
import {clubAttendancePath} from '../../server/clubAttendanceIntent.js';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {deriveProtectedNativeBrowserAssets,runProtectedNativeBrowserTurn} from './certificate-browser-preview.mjs';
import {certificateAwardPreviewHash} from './certificate-award-preview.mjs';
import {verifyProtectedNativeBrowserEgress} from './certificate-browser-turn.mjs';
import {discoverClientDispatchSurfaces} from './client-dispatch-inventory.mjs';
import {clubAttendanceBrowserBootstrap,clubAttendanceBrowserProfile,createProtectedClubAttendanceBrowserTurn,
  verifyRenderedClubAttendanceBrowserTurn} from './club-attendance-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

export const clubAttendanceBrowserCaseIds=Object.freeze(['record','multipart','empty','foreign','unavailable']
  .map(mode=>'client:club-activity-attendance:'+mode));

export async function findClubAttendanceBrowserCase(id){
  check(clubAttendanceBrowserCaseIds.includes(id),'invalid fixture config');
  const cases=(await discoverClientDispatchSurfaces()).questions.filter(row=>row.domain==='club-activity-attendance');
  check(isDeepStrictEqual(cases.map(row=>row.id),clubAttendanceBrowserCaseIds),'invalid fixture config');
  return cases.find(row=>row.id===id);
}

const roleFor=mode=>mode==='empty'?'B':'A';
const native={
  profile:clubAttendanceBrowserProfile,route:clubAttendancePath,heading:'活動參與紀錄',
  bootstrap:clubAttendanceBrowserBootstrap,receiptKey:'clubAttendanceReceipt',
  verifyRendered:verifyRenderedClubAttendanceBrowserTurn,
  verifyEgress:options=>verifyProtectedNativeBrowserEgress({...options,scope:clubAttendanceBrowserProfile,answerMethod:'POST'}),
  verifyBootstrap({testCase,readbacks},workspace){
    check(isDeepStrictEqual(workspace,readbacks[roleFor(testCase.mode)].attendance),'wrong fixture caller');
  },
  async verifyWorkspace({testCase,readbacks},page){
    const rows=readbacks[roleFor(testCase.mode)].attendance.rows;
    const table=page.getByRole('table').filter({has:page.getByRole('columnheader',{name:'登錄時間',exact:true})});
    await table.waitFor({state:'visible'});
    const titles=await table.locator('tbody tr > td:first-child').allTextContents();
    check(isDeepStrictEqual(titles,rows.length?rows.map(row=>row.title):['查無資料']),'wrong fixture caller');
  },
  grade({testCase},{statusCode,requestPath,body}){
    // The relay has already checked literal fields against independent data
    // and required the API's signed receipt before admitting this transcript.
    const status={foreign:'handoff','read-failure':'abstained'}[testCase.mode]??'answered';
    check(statusCode===200&&requestPath==='/api/affairs-assistant'&&body.status===status,'save answer mismatch');
    return {passed:true,responseDigest:digest(body),requestDigest:digest({route:testCase.route,question:testCase.question}),
      checks:[{id:'club.attendance.signed-read',passed:true}]};
  },
};

export const deriveClubAttendanceBrowserAssets=options=>deriveProtectedNativeBrowserAssets(options,native);

export async function runClubAttendanceBrowserTurn(options){
  const {origin,sourceRevision,runId,observationKey,readbacks,caseId,observeAfter}=options;
  const testCase=await findClubAttendanceBrowserCase(caseId);
  const graphTurn=createProtectedClubAttendanceBrowserTurn({testCase,key:observationKey,readbacks,
    scope:{origin,sourceRevision,mode:testCase.mode,ownerId:readbacks[roleFor(testCase.mode)].ownerId,runId}});
  const result=await runProtectedNativeBrowserTurn({...options,bound:{testCase,readbacks},graphTurn},native);
  const proof=graphTurn.confirmUnchanged(await observeAfter());
  check(result?.passed&&proof.caseId===caseId&&proof.responseDigest===result.responseDigest,'save receipt mismatch');
  return {...result,...proof};
}

export function verifiedClubAttendanceBrowserObservation({result,question,sourceRevision,origin}){
  const row=result?.results?.[0],deployment=result?.deployment,cleanup=result?.cleanup;
  const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
  const answerRequests=result?.browserDiagnostics?.flatMap(context=>context.observations??[]).filter(event=>
    event.request===clubAttendanceBrowserProfile+'-answer'&&event.method==='POST'&&event.forwarded===true)??[];
  const dispatched=answerRequests.length>0;
  const passed=answerRequests.length===1&&clubAttendanceBrowserCaseIds.includes(question?.id)&&result.origin===origin
    &&result.sourceRevision===sourceRevision&&result.execution==='live-browser'&&result.terminal===true
    &&isDeepStrictEqual(result.caseIds,[question.id])&&result.suiteDigest===certificateAwardPreviewHash([question])
    &&result.liveAcceptance===true&&result.browserDispatchAcceptance===true&&result.modelAcceptance===false
    &&deployment?.status==='finished'&&deployment.origin===origin&&deployment.sourceRevision===sourceRevision&&deployment.issued===6&&deployment.completed===6
    &&result.results.length===1&&row?.caseId===question.id&&row.passed===true&&row.native?.passed===true
    &&hex(row.proofDigest)&&hex(row.scopeDigest)&&hex(row.requestDigest)
    &&row.requestDigest===row.native.requestDigest&&hex(row.responseDigest)&&row.responseDigest===row.native.responseDigest
    &&hex(row.before)&&row.before===row.after&&row.browserTurn?.answerRequests===1&&row.browserTurn.saveRequests===1
    &&row.browserRestore?.restoreRequests===1&&row.readback?.own===true&&row.readback.crossed===true&&row.readback.version===1
    &&hex(row.readback.messageDigest)&&cleanup?.verified===true&&cleanup.protectedOwnerUnchanged===true
    &&cleanup.createdUsers===2&&cleanup.clubAttendanceBrowserCleanup===true&&cleanup.conversationCleanup?.verified===true&&cleanup.conversationCleanup.conversationRows===0;
  return {id:question.id,dispatched,passed:Boolean(passed),cleanupVerified:cleanup?.verified===true,
    reportDigest:digest(result),requestDigest:row?.requestDigest??null,responseDigest:row?.responseDigest??null};
}
