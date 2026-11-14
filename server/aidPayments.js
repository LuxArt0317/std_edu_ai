import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {aidPaymentsPageSize,aidPaymentsScope,validAidPayments} from './aidPaymentsContract.js';

export async function readAidPayments(account,query){
  const {scope,view,page='1',summary,...unknown}=query;
  if(scope!==aidPaymentsScope||Object.keys(unknown).length||!['claims','salary'].includes(view)||
    (summary!==undefined&&(summary!=='1'||page!=='1'))||
    typeof page!=='string'||!/^[1-9]\d{0,2}$/.test(page)||Number(page)>201)
    throw new AffairsWorkspaceError('Invalid student payment inquiry.',400);
  const unavailable=()=>new AffairsWorkspaceError('Student payment records are temporarily unavailable.',503);
  const timeout=Math.min(8000,(account.requestDeadline??Date.now()+8000)-Date.now());
  if(timeout<=0)throw unavailable();
  let result;
  try{
    result=await fetch(account.url+'/rest/v1/rpc/affairs_read_aid_payments',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),
      headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},
      body:JSON.stringify({p_view:view,p_offset:(Number(page)-1)*aidPaymentsPageSize,p_summary:summary==='1'}),
    });
  }catch{throw unavailable();}
  if(!result.ok){
    void result.body?.cancel().catch(()=>{});
    if(result.status===403||result.status===401)throw new AffairsWorkspaceError('School Affairs sign-in is required.',403);
    throw unavailable();
  }
  const value=await readFeeRemissionJson(result).catch(()=>{throw unavailable();});
  if(!validAidPayments(value,account.user.id,view))throw unavailable();
  if(summary==='1'&&value.rows.length)throw unavailable();
  return value;
}
