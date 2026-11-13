import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {feeRemissionUuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {clearanceOffices,clearancePaths,clearanceScope,clearanceStatuses,parseClearance,parseClearanceReceipt,validClearanceAction} from './graduationClearanceContract.js';

async function rpc(account,operation,body){
  const timeout=Math.min(10000,(account.requestDeadline??Date.now()+10000)-Date.now());
  if(timeout<=0)throw new AffairsWorkspaceError('Graduation clearance lookup timed out.');
  const response=await fetch(account.url+'/rest/v1/rpc/'+operation,{method:'POST',signal:AbortSignal.timeout(timeout),redirect:'error',
    headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=[401,403].includes(response.status)?403:[400,409].includes(response.status)?response.status:503;
    throw new AffairsWorkspaceError(status===409?'The application, review or period changed. Reload before continuing.':'Graduation clearance request could not be completed.',status);
  }
  return readFeeRemissionJson(response);
}
export async function readGraduationClearance(account,query){
  const {scope,view,term,user_id,answer,...extra}=query;
  if(scope!==clearanceScope||!['student','manage'].includes(view)||Object.keys(extra).length||
    (view==='manage'?(answer!==undefined||term!==undefined&&!feeRemissionUuid(term)||user_id!==undefined&&(!term||!feeRemissionUuid(user_id))):
      (term!==undefined||user_id!==undefined||answer!==undefined&&!['en','zh'].includes(answer))))throw new AffairsWorkspaceError('Invalid graduation clearance scope.',400);
  const data=parseClearance(await rpc(account,'affairs_read_graduation_clearance',{p_view:view,p_term:term??null,p_student:user_id??null}),account.user.id,view,term,user_id);
  if(!answer)return data;
  const zh=answer==='zh',language=zh?0:1;
  const clean=value=>value.replace(/[\r\n\[\]<>]/gu,' ');
  const states={scheduled:['尚未開放','scheduled'],open:['開放中','open'],closed:['已結束','closed']};
  const title=zh?'離校申請狀態查詢':'Graduation clearance status';
  const summary=data.applications.length?(zh?'已找到您的站內離校申請。':'I found your saved stu.best clearance applications.'):
    (zh?'沒有已送出的站內離校申請。':'You have no submitted graduation clearance application on stu.best.');
  const applications=data.applications.slice(0,8).map(row=>`- ${clean(row.term)} · ${row.reviews.filter(review=>review.status==='cleared').length}/${row.reviews.length} ${zh?'項符合':'offices cleared'}\n`+
    row.reviews.map(review=>`  - ${clearanceOffices[review.office][language]} · ${clearanceStatuses[review.status][language]}`).join('\n'));
  const periods=data.periods.slice(0,8).map(row=>`- ${clean(row.term)} · ${states[row.state][language]}`);
  const periodStatus=periods.length?(zh?'申請期間：':'Application periods:')+'\n'+periods.join('\n'):
    (zh?'目前沒有分配給您的站內申請期間。':'No stu.best application period is assigned to your account.');
  return {status:'answered',answer:[summary,periodStatus,...applications,`[${title}](${clearancePaths.status}) · [${zh?'離校申請':'Apply for clearance'}](${clearancePaths.apply})`].join('\n\n'),
    citations:[{chunkId:'account:graduation-clearance',claim:summary,title,url:clearancePaths.status,sourceName:'My stu.best records',locator:null,effectiveAt:null,reviewedAt:null}],
    grounding:{source:'account',webSearched:false},suggestedQuestions:[],activity:[{kind:'graduation-clearance',label:zh?'查詢離校申請':'Checked graduation clearance',detail:summary,status:'complete'}]};
}
export async function changeGraduationClearance(account,kind,payload){
  if(!validClearanceAction(kind,payload))throw new AffairsWorkspaceError('Invalid graduation clearance fields.',400);
  return parseClearanceReceipt(await rpc(account,'affairs_change_graduation_clearance',{p_action:kind,p_payload:payload}),kind,payload);
}
