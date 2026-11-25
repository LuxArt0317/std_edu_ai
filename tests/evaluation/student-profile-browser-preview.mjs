import {isDeepStrictEqual} from 'node:util';
import {studentProfilePath} from '../../server/studentProfileContract.js';
import {createProtectedNativeBrowserSaveJournal,deriveProtectedNativeBrowserAssets,runProtectedNativeBrowserTurn} from './certificate-browser-preview.mjs';
import {gradeStudentProfileBrowserReply,inspectStudentProfileBrowserBootstrap,studentProfileBrowserBootstrap,studentProfileBrowserCases,
  studentProfileBrowserProfile,verifyProtectedStudentProfileBrowserEgress} from './student-profile-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

export async function verifyEmptyStudentProfile(page){
  const message=page.getByText(/^目前尚無可確認的學生基本資料。/u);
  await message.getByRole('link',{name:'離開',exact:true}).waitFor({state:'visible'});
}

const studentProfileBrowser={
  profile:studentProfileBrowserProfile,route:studentProfilePath,heading:'學生基本資料確認',
  bootstrap:studentProfileBrowserBootstrap,receiptKey:'studentProfileReceipt',
  grade:gradeStudentProfileBrowserReply,verifyEgress:verifyProtectedStudentProfileBrowserEgress,
  verifyBootstrap({observation},value){
    const {record}=inspectStudentProfileBrowserBootstrap(value,observation.ownerId);
    const normalized=record?.confirmed_at?{...record,confirmed_at:new Date(record.confirmed_at).toISOString()}:record;
    check(isDeepStrictEqual(normalized,observation.workspace),'student profile fixture mismatch');
  },
  async verifyWorkspace({observation},page){
    if(!observation.recordExists){
      return verifyEmptyStudentProfile(page);
    }
    const form=page.getByRole('table',{name:'學生基本資料確認',exact:true});
    await form.getByText(observation.workspace.student_number,{exact:true}).waitFor({state:'visible'});
    await page.getByText('已確認基本資料。',{exact:true}).waitFor({state:'visible'});
  },
};

export const deriveStudentProfileBrowserAssets=options=>deriveProtectedNativeBrowserAssets(options,studentProfileBrowser);
export const createStudentProfileBrowserSaveJournal=options=>createProtectedNativeBrowserSaveJournal(options,studentProfileBrowser);

export function runStudentProfileBrowserTurn(options){
  const {role,testCase}=options.bound;
  const canonical=studentProfileBrowserCases.find(row=>row.id===testCase?.id);
  check(canonical&&canonical.role===role&&canonical.question===testCase.question&&canonical.year===testCase.year&&canonical.local===testCase.local
    &&testCase.route===studentProfilePath,'student profile fixture mismatch');
  return runProtectedNativeBrowserTurn(options,studentProfileBrowser);
}
