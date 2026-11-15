import {isDeepStrictEqual} from 'node:util';
import {announcementEmailPath} from '../../server/announcementEmailContract.js';
import {createProtectedNativeBrowserSaveJournal,deriveProtectedNativeBrowserAssets,runProtectedNativeBrowserTurn} from './certificate-browser-preview.mjs';
import {announcementEmailBrowserAnswerPath,announcementEmailBrowserBootstrap,announcementEmailBrowserCases,announcementEmailBrowserProfile,
  gradeAnnouncementEmailBrowserReply,verifyProtectedAnnouncementEmailBrowserEgress} from './announcement-email-browser-turn.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';

const announcementEmailBrowser={
  profile:announcementEmailBrowserProfile,route:announcementEmailPath,heading:'校園最新公告個人E-MAIL接收設定',
  bootstrap:announcementEmailBrowserBootstrap,receiptKey:'announcementEmailReceipt',
  grade({testCase,preference},{statusCode,body,requestPath}){
    check(statusCode===200&&requestPath===announcementEmailBrowserAnswerPath(testCase.inbox),'announcement fixture mismatch');
    return gradeAnnouncementEmailBrowserReply({testCase,preference,reply:body});
  },
  verifyEgress:verifyProtectedAnnouncementEmailBrowserEgress,
  verifyBootstrap({preference},value){
    check(isDeepStrictEqual(value,preference),'announcement fixture mismatch');
  },
  async verifyWorkspace({preference},page){
    const control=page.getByRole('checkbox',{name:'校園最新公告直接寄到個人 E-MAIL信箱',exact:true});
    await control.waitFor({state:'visible'});
    check(await control.isChecked()===preference.enabled,'announcement fixture mismatch');
  },
};

export function deriveAnnouncementEmailBrowserAssets(options){
  return deriveProtectedNativeBrowserAssets(options,announcementEmailBrowser);
}

export function createAnnouncementEmailBrowserSaveJournal(options){
  return createProtectedNativeBrowserSaveJournal(options,announcementEmailBrowser);
}

/** The host supplies the already leased identity, paired readback and exact
 * disposal functions. This module does not discover or create any account. */
export function runAnnouncementEmailBrowserTurn(options){
  const {role,testCase}=options.bound;
  const canonical=announcementEmailBrowserCases.find(row=>row.id===testCase?.id);
  check(canonical&&canonical.role===role&&canonical.question===testCase.question&&canonical.inbox===testCase.inbox
    &&testCase.route===announcementEmailPath,'announcement fixture mismatch');
  return runProtectedNativeBrowserTurn(options,announcementEmailBrowser);
}
