import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {feeRemissionUuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {creditTransferPath,creditTransferScope,creditTransferSave,creditTransferSubmit,creditTransferDecisions,
  validCreditTransferAction,parseCreditTransferRows,parseCreditTransferRow} from './creditTransferContract.js';

async function request(account,path,query,body) {
  const target=new URL(account.url+'/rest/v1/'+path);
  target.search=new URLSearchParams(query).toString();
  const timeout=Math.min(10000,(account.requestDeadline??Date.now()+10000)-Date.now());
  if(!Number.isFinite(timeout)||timeout<=0)throw new AffairsWorkspaceError('Credit transfer lookup timed out.');
  const response=await fetch(target,{
    method:body?'POST':'GET',headers:{apikey:account.key,Authorization:'Bearer '+account.token,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(timeout),
  });
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=[401,403].includes(response.status)?403:[400,409].includes(response.status)?response.status:503;
    throw new AffairsWorkspaceError(status===409?'The application changed. Reload it before continuing.':'Credit transfer could not be completed.',status);
  }
  return readFeeRemissionJson(response);
}

export async function readCreditTransfer(account,query) {
  const {scope,user_id,answer,...extra}=query;
  const admin=scope===creditTransferScope+'-admin';
  if(Object.keys(extra).length || (admin?(!feeRemissionUuid(user_id)||answer!==undefined)
    :(user_id!==undefined||(answer!==undefined&&!['en','zh'].includes(answer)))))throw new AffairsWorkspaceError('Invalid credit transfer scope.',400);
  if(admin){
    const role=await request(account,'affairs_profiles',{select:'role',user_id:'eq.'+account.user.id,limit:'2'});
    if(role?.length!==1||role[0]?.role!=='admin')throw new AffairsWorkspaceError('Administrator required.',403);
  }
  const userId=admin?user_id:account.user.id;
  const rows=parseCreditTransferRows(await request(account,'affairs_credit_transfer_applications',{
    select:'id,user_id,reason,previous_school,courses,status,decisions,version,submitted_at,reviewed_at',
    user_id:'eq.'+userId,order:'submitted_at.desc.nullslast,id.asc',limit:'7',
  }),userId);
  return answer?creditTransferAnswer(rows,answer):{userId,rows};
}

export async function changeCreditTransfer(account,kind,payload) {
  if(!validCreditTransferAction(kind,payload))throw new AffairsWorkspaceError('Invalid credit transfer fields.',400);
  const row=await request(account,'rpc/affairs_change_credit_transfer',{}, {p_kind:kind,p_payload:payload});
  const parsed=parseCreditTransferRow(row,kind===creditTransferSave||kind===creditTransferSubmit?account.user.id:row?.user_id);
  const status=kind===creditTransferSave?'draft':kind===creditTransferSubmit?'submitted':'reviewed';
  if(parsed.id!==payload.id||parsed.version!==payload.expected_version+1||parsed.status!==status)throw new Error('Invalid credit transfer receipt.');
  return parsed;
}

function creditTransferAnswer(rows,lang) {
  const zh=lang==='zh';
  const title=zh?'抵免學分紀錄':'Credit transfer history';
  const counts={draft:0,submitted:0,reviewed:0};
  const results=[];
  for(const row of rows){
    counts[row.status]++;
    row.decisions?.forEach((decision,index)=>{
      const safeTitle=row.courses[index].requested_title.replace(/[\r\n]/gu,' ').replace(/[[\]<>!]/gu,'');
      results.push('- '+safeTitle+' · '+(zh?creditTransferDecisions[decision]:decision));
    });
  }
  const claim=rows.length?(zh?`站內草稿 ${counts.draft} 筆，待審查 ${counts.submitted} 筆，已審查 ${counts.reviewed} 筆。`
    :`stu.best has ${counts.draft} draft, ${counts.submitted} awaiting review and ${counts.reviewed} reviewed.`)
    :(zh?'您的帳戶沒有站內抵免申請紀錄。':'Your account has no saved credit transfer applications.');
  return {status:'answered',answer:[claim,results.slice(0,12).join('\n'),`[${title}](${creditTransferPath}/history)`].filter(Boolean).join('\n\n'),
    citations:[{chunkId:'account:credit-transfer',claim,title,url:creditTransferPath+'/history',sourceName:'My stu.best records',
      locator:null,effectiveAt:null,reviewedAt:null}],grounding:{source:'account',webSearched:false},suggestedQuestions:[],
    activity:[{kind:'credit-transfer',label:zh?'查詢抵免紀錄':'Checked saved credit transfer records',detail:claim,status:'complete'}]};
}
