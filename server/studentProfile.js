import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {feeRemissionUuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {loadOwnAffairsStudyYear} from './ownAffairsStudyYear.js';
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

async function readConfirmation(account){
  const result=await profileRpc(account,'affairs_read_student_profile',{p_target:null,p_status_only:true});
  if(Object.keys(result??{}).length!==3||result.userId!==account.user.id||typeof result.recordExists!=='boolean'||
    !(result.confirmedAt===null||(result.recordExists&&typeof result.confirmedAt==='string'&&Number.isFinite(Date.parse(result.confirmedAt)))))
    throw new AffairsWorkspaceError('無法確認資料狀態。');
  return result;
}

export async function readStudentProfile(account,query){
  const {scope,view,user_id,answer,year_level,...extra}=query;
  if(scope!==studentProfileScope||Object.keys(extra).length||!['mine','manage'].includes(view)||
    (view==='manage'?(!feeRemissionUuid(user_id)||answer!==undefined||year_level!==undefined):
      (user_id!==undefined||answer!==undefined&&!['en','zh'].includes(answer)||
        year_level!==undefined&&(year_level!=='requested'||answer===undefined))))throw invalid();
  if(answer===undefined){
    const target=view==='manage'?user_id:null;
    return parseStudentProfile(await profileRpc(account,'affairs_read_student_profile',{p_target:target,p_status_only:false}),target??account.user.id);
  }

  let confirmation,year;
  if(year_level==='requested'){
    const [statusRead,yearRead]=await Promise.allSettled([readConfirmation(account),loadOwnAffairsStudyYear(account)]);
    confirmation=statusRead.status==='fulfilled'?statusRead.value:null;
    year=yearRead.status==='fulfilled'?yearRead.value:null;
  }else confirmation=await readConfirmation(account);

  const zh=answer==='zh',t=(cn,en)=>zh?cn:en;
  const summary=confirmation===null?t('無法查證學生基本資料的確認狀態。','I couldn’t verify whether your student information has been confirmed.'):
    confirmation.confirmedAt?t('目前的基本資料已確認。','Your current student information has been confirmed.'):
    confirmation.recordExists?t('目前的基本資料仍待確認。','Your current student information is awaiting confirmation.'):
      t('目前尚無可確認的學生基本資料。','There is no student profile available to confirm.');
  const title=t('學生基本資料確認','Student information confirmation');
  const link=`[${title}](${studentProfilePath})`;
  const cite=(chunkId,claim,sourceTitle)=>({chunkId,claim,title:sourceTitle,url:studentProfilePath,
    sourceName:'My stu.best records',locator:null,effectiveAt:null,reviewedAt:null});
  const citations=confirmation?[cite('account:student-profile-status',summary,title)]:[];
  const activity=[{kind:'student-profile',label:t('查詢基本資料確認狀態','Checked student information confirmation'),
    detail:summary,status:confirmation?'complete':'unavailable'}];
  const paragraphs=[summary];
  if(year_level==='requested'){
    const yearLine=year===null?t('無法查證已儲存的年級。','I couldn’t verify your recorded year level.'):
      year.student===null?t('此帳戶沒有連結可查詢年級的學生紀錄。','No student record is linked to this account for checking year level.'):
      t(`已記錄的年級：${year.student.yearLevel} 年級`,`Your recorded year level is ${year.student.yearLevel}`)
        +(year.student.sourceMode==='sample'?t('（示範資料）',' (sample data)'):'')+'.';
    const yearTitle=t('校務紀錄年級','Recorded School Affairs year level');
    paragraphs.push(yearLine);
    if(year)citations.push(cite('account:profile',yearLine,yearTitle));
    activity.push({kind:'account-read:profile:1',label:yearTitle,detail:yearLine,status:year?'complete':'unavailable'});
  }
  return {status:confirmation||year?'answered':'handoff',answer:[...paragraphs,link].join('\n\n'),
    citations,suggestedQuestions:[],grounding:{source:'account',webSearched:false},activity};
}

export async function changeStudentProfile(account,operation,payload){
  if(!validProfileAction(operation,payload))throw invalid();
  const result=await profileRpc(account,'affairs_change_student_profile',{p_operation:operation,p_payload:payload});
  return parseProfileReceipt(result,operation==='save'?payload.user_id:account.user.id,payload.expected_version,operation);
}
