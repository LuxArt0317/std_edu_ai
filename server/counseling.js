import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {feeRemissionUuid as uuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {counselingScope} from './counselingContract.js';

const invalid=()=>new AffairsWorkspaceError('請檢查預約欄位。',400);
async function rpc(account,operation,body){
  const timeout=Math.min(8000,(account.requestDeadline??Date.now()+8000)-Date.now());
  if(timeout<=0)throw new AffairsWorkspaceError('預約服務暫時無法使用。');
  const reply=await fetch(account.url+'/rest/v1/rpc/'+operation,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),
    headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!reply.ok){
    void reply.body?.cancel().catch(()=>{});
    const status=reply.status===401?403:[400,403,404,409].includes(reply.status)?reply.status:503;
    throw new AffairsWorkspaceError(status===409?'預約狀態已更新或目前無法受理。':'無法處理諮商預約。',status);
  }
  return readFeeRemissionJson(reply);
}

export async function readCounseling(account,query){
  const {scope,view,...extra}=query;
  if(scope!==counselingScope||!['mine','queue','access'].includes(view)||Object.keys(extra).length)throw invalid();
  const result=await rpc(account,'affairs_read_counseling',{p_view:view});
  if(result?.userId!==account.user.id||typeof result.available!=='boolean'||typeof result.canCoordinate!=='boolean'||!Array.isArray(result.rows))
    throw new AffairsWorkspaceError('預約資料格式錯誤。');
  return result;
}
export async function changeCounseling(account,kind,payload,manager=false){
  const operation=kind.slice('counseling_'.length);
  if(!(manager?['review','access']:['request','cancel']).includes(operation)||!payload||
    typeof payload!=='object'||Array.isArray(payload)||!uuid(payload.request_id))throw invalid();
  return rpc(account,'affairs_change_counseling',{p_operation:operation,p_payload:payload});
}
