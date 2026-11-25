import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {feeRemissionUuid as uuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {certificateAwardBankReceiptNote,certificateAwardBankReceiptQuestion,certificateAwardPath,certificateAwardScope,certificateAwardLabels,certificateAwardManagerOps,
  certificateAwardStudentOps} from './certificateAwardsContract.js';

const invalid=()=>new AffairsWorkspaceError('請檢查證照申請欄位。',400);
async function rpc(account,method,body){
  const timeout=Math.min(8000,(account.requestDeadline??Date.now()+8000)-Date.now());
  if(timeout<=0)throw new AffairsWorkspaceError('證照資料暫時無法載入。');
  const response=await fetch(account.url+'/rest/v1/rpc/'+method,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),
    headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=response.status===401?403:[400,403,404,409].includes(response.status)?response.status:503;
    const messages={400:'請檢查證照申請欄位。',403:'此帳戶無權操作。',404:'找不到證照申請。',409:'請確認資料版本、證明文件與匯款資料。'};
    throw new AffairsWorkspaceError(messages[status]??'證照資料暫時無法載入。',status);
  }
  return readFeeRemissionJson(response);
}
export async function readCertificateAward(account,query){
  const {scope,view,user_id,id,answer,bank_receipt,code,name,level,issuer,page,...extra}=query;
  if(scope!==certificateAwardScope||Object.keys(extra).length)throw invalid();
  if(view==='catalog'){
    if(user_id!==undefined||id!==undefined||answer!==undefined||bank_receipt!==undefined||
      ![code,name,level,issuer,page].every(value=>value===undefined||typeof value==='string'&&value.length<=160)||
      !/^\d{0,12}$/u.test(code??'')||!/^(?:0|[1-9]\d{0,2})$/u.test(page??'0')||Number(page??0)>200)throw invalid();
    return rpc(account,'affairs_certificate_catalog_search',{
      p_code:code??'',p_name:name?.trim()??'',p_level:level?.trim()??'',p_issuer:issuer?.trim()??'',p_page:Number(page??0),
    });
  }
  if([code,name,level,issuer,page].some(value=>value!==undefined)||!['mine','manage'].includes(view)||
    id!==undefined&&!uuid(id)||(view==='manage'?(!uuid(user_id)||answer!==undefined):user_id!==undefined)||
    answer!==undefined&&!['zh','en'].includes(answer)||bank_receipt!==undefined&&(bank_receipt!=='requested'||answer===undefined))throw invalid();
  const selectedAnswer=answer!==undefined&&id!==undefined;
  // The existing status-only RPC projection is for the account-wide list.
  // A selected answer uses the private record read and projects only status here.
  const result=await rpc(account,'affairs_read_certificate_awards',{p_target:user_id??null,p_id:id??null,
    p_status_only:answer!==undefined&&!selectedAnswer});
  if(result?.userId!==(user_id??account.user.id)||!Array.isArray(result.rows)||
    selectedAnswer&&(result.rows.length!==1||result.rows[0]?.id!==id))
    throw new AffairsWorkspaceError('證照資料格式錯誤。');
  if(answer===undefined)return result;
  const zh=answer==='zh',lang=zh?0:1;
  const url=selectedAnswer?`${certificateAwardPath}/record/${id}`:certificateAwardPath;
  const title=selectedAnswer?(zh?'這筆證照獎補助金申請':'Certificate award application'):
    (zh?'證照獎補助金申請':'Certificate award applications');
  const summary=selectedAnswer?(zh?'這筆已儲存的證照申請：':'Your selected saved certificate application:'):
    result.rows.length?(zh?'最近的證照申請紀錄：':'Your recent certificate applications:'):
    (zh?'此帳戶目前沒有證照申請紀錄。':'This account has no saved certificate applications.');
  const items=result.rows.map(row=>{
    if(!uuid(row.id)||typeof row.name!=='string'||!Object.hasOwn(certificateAwardLabels,row.status))throw new AffairsWorkspaceError('證照狀態格式錯誤。');
    return '- '+row.name.replace(/[\r\n[\]<>]/gu,' ')+' · '+certificateAwardLabels[row.status][lang]+
      (row.wants_award&&row.award_amount!==null?' · NT$'+Number(row.award_amount).toLocaleString('en-US'):'');
  });
  const bankNote=bank_receipt==='requested'?certificateAwardBankReceiptNote[lang]:null;
  const activity=[{kind:'certificate-awards',label:title,detail:summary,status:'complete'}];
  if(bankNote)activity.push({kind:'certificate-awards-bank-receipt',label:zh?'入帳確認':'Bank receipt confirmation',detail:bankNote,status:'unavailable'});
  return {status:'answered',answer:[summary,items.join('\n'),bankNote,`[${title}](${url})`].filter(Boolean).join('\n\n'),
    citations:[{chunkId:'account:certificate-awards',claim:summary,title,url,sourceName:'My stu.best records'}],
    suggestedQuestions:[],grounding:{source:'account',webSearched:false},activity};
}
export async function changeCertificateAward(account,operation,payload,admin=false){
  if(!(admin?certificateAwardManagerOps:certificateAwardStudentOps).includes(operation)||!payload||
    typeof payload!=='object'||Array.isArray(payload)||!uuid(payload.request_id))throw invalid();
  return rpc(account,'affairs_change_certificate_award',{p_operation:operation,p_payload:payload});
}
export function certificateAwardGuide(question,intent){
  const zh=/[\u3400-\u9fff]/u.test(question),title=zh?'證照獎補助金申請':'Certificate award applications';
  const url=intent==='status'?'/school-affairs/login?next='+encodeURIComponent(certificateAwardPath):certificateAwardPath;
  const summary=intent==='status'?(zh?'登入後可查詢您的證照申請狀態。':'Sign in to check your certificate application status.'):
    (zh?'選擇證照，填寫取得日期，上傳 JPG 或 PDF 證明，再確認申請。':'Select the certificate, enter the date earned, attach JPG or PDF proof, and confirm the application.');
  const bankNote=intent==='status'&&certificateAwardBankReceiptQuestion(question)?certificateAwardBankReceiptNote[zh?0:1]:null;
  return {status:intent==='status'?'handoff':'answered',answer:[summary,bankNote,`[${title}](${url})`].filter(Boolean).join('\n\n'),
    citations:[{chunkId:'directory:certificate-awards',claim:summary,title,url,sourceName:'School Affairs'}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}
