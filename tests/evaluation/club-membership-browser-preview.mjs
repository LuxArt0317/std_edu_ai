import {isDeepStrictEqual} from 'node:util';
import {clubMembershipPath} from '../../server/clubMembershipIntent.js';
import {deriveProtectedNativeBrowserAssets,runProtectedNativeBrowserTurn} from './certificate-browser-preview.mjs';
import {verifyProtectedNativeBrowserEgress} from './certificate-browser-turn.mjs';
import {verifyRenderedClubRecordBrowserTurn} from './club-attendance-browser-turn.mjs';
import {clubMembershipBrowserBootstrap,clubMembershipBrowserCases,clubMembershipBrowserProfile,createProtectedClubMembershipBrowserTurn,
  gradeClubMembershipBrowserAnswer} from './club-membership-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

const browser={
  profile:clubMembershipBrowserProfile,route:clubMembershipPath,heading:'社團參與紀錄',answerMethod:'POST',
  bootstrap:clubMembershipBrowserBootstrap,receiptKey:'clubMembershipReceipt',grade:gradeClubMembershipBrowserAnswer,
  verifyRendered:verifyRenderedClubRecordBrowserTurn,
  verifyEgress:options=>verifyProtectedNativeBrowserEgress({...options,scope:clubMembershipBrowserProfile,answerMethod:'POST'}),
  verifyBootstrap({observation},workspace){
    check(isDeepStrictEqual(workspace,observation.workspace),'club membership fixture mismatch');
  },
  async verifyWorkspace({observation},page){
    const table=page.getByRole('table').filter({has:page.getByRole('columnheader',{name:'社團狀態',exact:true})});
    await table.waitFor({state:'visible'});
    const rows=await table.locator('tbody tr').evaluateAll(elements=>elements.map(row=>[...row.cells].map(cell=>cell.textContent)));
    const expected=observation.workspace.rows.map(row=>[row.name,row.role_label,String(row.academic_year),String(row.term),row.active?'開放':'已停用']);
    check(isDeepStrictEqual(rows,expected.length?expected:[['查無資料']]),'club membership fixture mismatch');
  },
};

export const deriveClubMembershipBrowserAssets=options=>deriveProtectedNativeBrowserAssets(options,browser);
export function runClubMembershipBrowserTurn(options){
  const {bound,origin}=options;
  const canonical=clubMembershipBrowserCases.find(row=>row.id===bound.testCase.id);
  check(isDeepStrictEqual(canonical,bound.testCase)&&canonical?.role===bound.role,'club membership fixture mismatch');
  const graphTurn=createProtectedClubMembershipBrowserTurn({bound,origin});
  return runProtectedNativeBrowserTurn({...options,graphTurn},browser);
}
