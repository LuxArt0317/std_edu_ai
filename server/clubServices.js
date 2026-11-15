import { clubOfficerActions,clubOfficerScope,clubOfficerViews,validClubApplicationReceipt,validClubOfficerWorkspace } from './clubOfficerContract.js';
import { AffairsWorkspaceError } from './affairsWorkspace.js';
import { clubActions,clubMonth,clubScope,clubUuid,validClubReceipt,validClubWorkspace } from './clubServicesContract.js';

export async function clubRpc(account, name, body, messages, observeRequest) {
  const unavailable = () => new AffairsWorkspaceError('無法連線至社團活動系統，請重試。',503);
  const timeout = Math.min(9000, (account.requestDeadline ?? Date.now()+9000)-Date.now());
  if (timeout<=0) throw unavailable();
  let result;
  try {
    result = await fetch(account.url+'/rest/v1/rpc/'+name,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),
      headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
  } catch {
    observeRequest?.('network-error');
    throw unavailable();
  }
  observeRequest?.(result.status);
  if (!result.ok) {
    void result.body?.cancel().catch(()=>{});
    if (messages[result.status]) throw new AffairsWorkspaceError(messages[result.status],result.status);
    throw unavailable();
  }
  return await result.json().catch(()=>{throw unavailable();});
}

export async function readClubServices(account,query) {
  const {scope,view,month,...unknown}=query;
  if (scope!==clubScope || Object.keys(unknown).length || !['activities','equipment','review'].includes(view) ||
      (view==='activities' ? typeof month!=='string' || !clubMonth.test(month) : month!==undefined)) {
    throw new AffairsWorkspaceError('社團活動查詢參數有誤。',400);
  }
  const result=await clubRpc(account,'affairs_read_club_services',{p_view:view,p_month:month ? month+'-01' : null},
    {400:'查詢月份有誤。',401:'請重新登入校務系統。',403:'此帳戶無法查看這個頁面。'});
  if (!validClubWorkspace(result,account.user.id,view)) throw new AffairsWorkspaceError('無法確認社團活動資料。',503);
  return result;
}
export async function changeClubEquipment(account,kind,payload,manager=false) {
  if (!clubActions.includes(kind) || (kind==='review_club_equipment')!==manager) {
    throw new AffairsWorkspaceError('器材借用操作有誤。',400);
  }
  const operation=kind.split('_')[0];
  const result=await clubRpc(account,'affairs_change_club_equipment',{p_operation:operation,p_payload:payload},
    {400:'請確認借用資料。領取與歸還須為上班日，請至少提前三天申請。',
     401:'請重新登入校務系統。',403:'此帳戶無法執行這項操作。',404:'找不到這筆器材借用紀錄。',
     409:'器材或申請狀態已變更，或您的社團資格尚未建立。請重新整理後再試。'});
  if (!validClubReceipt(result)) throw new AffairsWorkspaceError('無法確認器材借用操作。請重新整理清單。',503);
  return result;
}

export async function readClubOfficer(account,query) {
  const {scope,view,club,...unknown}=query;
  if(scope!==clubOfficerScope||Object.keys(unknown).length||!clubOfficerViews.includes(view)||
    (club!==undefined&&(!['members','participation'].includes(view)||typeof club!=='string'||!clubUuid.test(club)))){
    throw new AffairsWorkspaceError('社團幹部查詢參數有誤。',400);
  }
  const result=await clubRpc(account,'affairs_read_club_officer',{p_view:view,p_club:club??null},
    {400:'請確認查詢項目。',401:'請重新登入校務系統。',403:'此帳戶無法查看這個頁面。',404:'找不到可管理的社團。'});
  if(!validClubOfficerWorkspace(result,account.user.id,view))throw new AffairsWorkspaceError('無法確認社團資料。',503);
  return result;
}

export async function changeClubOfficer(account,kind,payload,manager=false) {
  const operation=Object.hasOwn(clubOfficerActions,kind)?clubOfficerActions[kind]:undefined;
  if(!operation||(operation==='review')!==manager)throw new AffairsWorkspaceError('社團活動申請操作有誤。',400);
  const result=await clubRpc(account,'affairs_change_club_officer',{p_operation:operation,p_payload:payload},
    {400:'請確認活動資料、日期與時數。',401:'請重新登入校務系統。',403:'此帳戶無法執行這項操作。',
     404:'找不到可管理的申請。',409:'申請已變更或處理，請重新查詢。'});
  if(!validClubApplicationReceipt(result))throw new AffairsWorkspaceError('無法確認申請結果，請重試。',503);
  return result;
}
