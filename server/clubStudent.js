import { AffairsWorkspaceError } from './affairsWorkspace.js';
import { clubRpc } from './clubServices.js';
import {
  clubFoundationActions,clubSearchViews,clubStudentScope,isClubStudentView,validClubFoundationReceipt,validClubStudentWorkspace,
} from './clubStudentContract.js';

const messages={
  400:'請確認社團資料及查詢條件。',401:'請重新登入校務系統。',403:'此帳戶無法執行這項操作。',
  404:'找不到可存取的申請。',409:'名稱已使用或申請狀態已變更，請重新查詢。',
};
export async function readClubStudent(account,query,observeRequest) {
  const {scope,view,q='',page='1',...extra}=query;
  if(scope!==clubStudentScope||Object.keys(extra).length||!isClubStudentView(view)||
    typeof q!=='string'||[...q].length>100||(q&&!clubSearchViews.includes(view))||
    typeof page!=='string'||!/^([1-9][0-9]{0,2}|1000)$/u.test(page))throw new AffairsWorkspaceError(messages[400],400);
  const result=await clubRpc(account,'affairs_read_club_student',{p_view:view,p_search:q.trim(),p_page:Number(page)},messages,observeRequest);
  if(!validClubStudentWorkspace(result,account.user.id,view,Number(page)))throw new AffairsWorkspaceError('無法確認社團資料。',503);
  return result;
}

export async function writeClubFoundation(account,kind,payload,manager=false) {
  const operation=Object.hasOwn(clubFoundationActions,kind)?clubFoundationActions[kind]:null;
  if(!operation||(operation==='review')!==manager)throw new AffairsWorkspaceError(messages[400],400);
  const result=await clubRpc(account,'affairs_change_club_foundation',{p_operation:operation,p_payload:payload},messages);
  const expected=operation==='submit'?'submitted':operation==='withdraw'?'withdrawn':payload?.status;
  if(!validClubFoundationReceipt(result)||result.status!==expected||(operation!=='submit'&&result.id!==payload?.id))
    throw new AffairsWorkspaceError('無法確認申請結果。',503);
  return result;
}
