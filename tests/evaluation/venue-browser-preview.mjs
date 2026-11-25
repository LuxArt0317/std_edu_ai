import {isDeepStrictEqual} from 'node:util';
import {internshipObservationDigest as digest} from '../../server/internshipObservation.js';
import {deriveProtectedNativeBrowserAssets,runProtectedNativeBrowserTurn} from './certificate-browser-preview.mjs';
import {verifyProtectedNativeBrowserEgress} from './certificate-browser-turn.mjs';
import {verifyRenderedClubRecordBrowserTurn as verifyRenderedGraphTurn} from './club-attendance-browser-turn.mjs';
import {createProtectedVenueBrowserTurn,venueBrowserBootstrap,venueBrowserPath,venueBrowserProfile} from './venue-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

const profile={
  profile:venueBrowserProfile,route:venueBrowserPath,heading:'場地借用申請及查詢',
  bootstrap:venueBrowserBootstrap,receiptKey:'venueReceipt',answerMethod:'POST',
  verifyRendered:verifyRenderedGraphTurn,
  verifyEgress:options=>verifyProtectedNativeBrowserEgress({...options,scope:venueBrowserProfile,answerMethod:'POST'}),
  verifyBootstrap({workspace},reply){
    check(isDeepStrictEqual(workspace,reply),'wrong fixture caller');
  },
  async verifyWorkspace({workspace},page){
    if(!workspace.rows.length){
      await page.getByText('沒有場地申請。',{exact:true}).waitFor({state:'visible'});
      return;
    }
    const table=page.getByRole('region',{name:'場地申請紀錄',exact:true}).getByRole('table');
    await table.waitFor({state:'visible'});
    const actual=await table.locator('tbody tr > td:first-child').allTextContents();
    check(isDeepStrictEqual(actual,workspace.rows.map(row=>row.venue)),'wrong fixture caller');
  },
  grade({testCase},{statusCode,requestPath,body}){
    // The relay has already matched the receipt and literal fields independently.
    const expectedStatus=testCase.mode==='foreign'?'handoff':'answered';
    check(statusCode===200&&requestPath==='/api/affairs-assistant'&&body.status===expectedStatus,'save answer mismatch');
    return {passed:true,requestDigest:digest(testCase),responseDigest:digest(body),checks:[{id:'venue.signed-browser-read',passed:true}]};
  },
};

export const deriveVenueBrowserAssets=options=>deriveProtectedNativeBrowserAssets(options,profile);

export async function runVenueBrowserTurn(options){
  const {bound,origin,sourceRevision,runId,observationKey}=options;
  const graphTurn=createProtectedVenueBrowserTurn({bound,origin,sourceRevision,runId,key:observationKey});
  const result=await runProtectedNativeBrowserTurn({...options,graphTurn},profile);
  return {...result,proofDigest:graphTurn.proofDigest()};
}
