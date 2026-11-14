import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {feeRemissionUuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {parseProfileReceipt,parseStudentProfile,studentProfilePath,studentProfileScope,validProfileAction} from './studentProfileContract.js';

const invalid=()=>new AffairsWorkspaceError('請檢查學生基本資料。',400);
async function profileRpc(account,method,body){
  const timeout=Math.min(8000,(account.requestDeadline??Date.now()+8000)-Date.now());
  if(timeout<=0)throw new AffairsWorkspaceError('學生基本資料暫時無法載入。');
  const response=await fetch(account.url+'/rest/v1/rpc/'+method,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),
    headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=response.status===401?403:[400,403,404,409].includes(response.status)?response.status:503;
    const errors={400:'請檢查學生基本資料。',403:'您的帳戶無法使用此操作。',404:'找不到學生基本資料。',409:'資料已更新，請重新載入。'};
    throw new AffairsWorkspaceError(errors[status]??'學生基本資料暫時無法載入。',status);
  }
  return readFeeRemissionJson(response);
}

export async function readStudentProfile(account,query){
  const {scope,view,user_id,answer,...extra}=query;
  if(scope!==studentProfileScope||Object.keys(extra).length||!['mine','manage'].includes(view)||
    (view==='manage'?(!feeRemissionUuid(user_id)||answer!==undefined):
      (user_id!==undefined||(answer!==undefined&&!['en','zh'].includes(answer)))))throw invalid();
  const target=view==='manage'?user_id:null;
  const result=await profileRpc(account,'affairs_read_student_profile',{p_target:target,p_status_only:answer!==undefined});
  if(answer===undefined)return parseStudentProfile(result,target??account.user.id);
  if(result?.userId!==account.user.id||typeof result.recordExists!=='boolean'||
    !(result.confirmedAt===null||(result.recordExists&&typeof result.confirmedAt==='string'&&Number.isFinite(Date.parse(result.confirmedAt)))))
    throw new AffairsWorkspaceError('無法確認資料狀態。');
  const zh=answer==='zh';
  const summary=result.confirmedAt?(zh?'目前的基本資料已確認。':'Your current student information has been confirmed.'):
    result.recordExists?(zh?'目前的基本資料仍待確認。':'Your current student information is awaiting confirmation.'):
      (zh?'目前尚無可確認的學生基本資料。':'There is no student profile available to confirm.');
  const title=zh?'學生基本資料確認':'Student information confirmation';
  return {status:'answered',answer:summary+'\n\n'+`[${title}](${studentProfilePath})`,
    citations:[{chunkId:'account:student-profile-status',claim:summary,title,url:studentProfilePath,sourceName:'My stu.best records',
      locator:null,effectiveAt:null,reviewedAt:null}],suggestedQuestions:[],grounding:{source:'account',webSearched:false},
    activity:[{kind:'student-profile',label:zh?'查詢基本資料確認狀態':'Checked student information confirmation',detail:summary,status:'complete'}]};
}

export async function changeStudentProfile(account,operation,payload){
  if(!validProfileAction(operation,payload))throw invalid();
  const result=await profileRpc(account,'affairs_change_student_profile',{p_operation:operation,p_payload:payload});
  return parseProfileReceipt(result,operation==='save'?payload.user_id:account.user.id,payload.expected_version,operation);
}
