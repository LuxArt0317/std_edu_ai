import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {feeRemissionUuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {validWithdrawalTerm} from './courseWithdrawalContract.js';
import {earlyGraduationPath,earlyGraduationScope,validEarlyGraduationAction,parseEarlyGraduation,parseEarlyGraduationReceipt} from './earlyGraduationContract.js';

async function rpc(account,operation,body) {
  const timeout=Math.min(10000,(account.requestDeadline??Date.now()+10000)-Date.now());
  if(!Number.isFinite(timeout)||timeout<=0)throw new AffairsWorkspaceError('Early graduation lookup timed out.');
  const response=await fetch(account.url+'/rest/v1/rpc/'+operation,{
    method:'POST',headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},
    body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(timeout),
  });
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=[401,403].includes(response.status)?403:[400,409].includes(response.status)?response.status:503;
    throw new AffairsWorkspaceError(status===409?'The saved record or window changed. Reload before continuing.':'Early graduation request could not be completed.',status);
  }
  return readFeeRemissionJson(response);
}

export async function readEarlyGraduation(account,query) {
  const {scope,year,semester,user_id,answer,...extra}=query;
  const admin=scope===earlyGraduationScope+'-admin';
  if((!admin&&scope!==earlyGraduationScope)||Object.keys(extra).length || (admin?(answer!==undefined||typeof year!=='string'||!/^\d{3}$/u.test(year)||
    typeof semester!=='string'||!/^[12]$/u.test(semester)||user_id!==undefined&&!feeRemissionUuid(user_id))
    :(year!==undefined||semester!==undefined||user_id!==undefined||answer!==undefined&&!['en','zh'].includes(answer))))
    throw new AffairsWorkspaceError('Invalid early graduation scope.',400);
  const term=admin?{academicYear:Number(year),semester:Number(semester)}:undefined;
  if(term&&!validWithdrawalTerm(term.academicYear,term.semester))throw new AffairsWorkspaceError('Invalid graduation term.',400);
  const data=parseEarlyGraduation(await rpc(account,'affairs_read_early_graduation',
    term?{p_year:term.academicYear,p_semester:term.semester,p_student:user_id??null}:{}),admin?user_id??null:account.user.id,term);
  if(!answer)return data;
  const zh=answer==='zh';
  const title=zh?'提前畢業申請':'Early graduation application';
  const state={
    unconfigured:zh?'尚未設定站內申請期間。':'No stu.best application window is configured.',
    scheduled:zh?'站內申請期間尚未開始。':'The stu.best application window has not started.',
    open:zh?'站內申請期間已開放。':'The stu.best application window is open.',
    closed:zh?'站內申請期間已結束。':'The stu.best application window has closed.',
  };
  const eligibility={eligible:zh?'站內資格：符合。':'Saved local eligibility: eligible.',
    ineligible:zh?'站內資格：不符合。':'Saved local eligibility: ineligible.',
    unverified:zh?'站內資格：未確認。':'Saved local eligibility: unverified.'};
  const statuses={submitted:zh?'待審查':'Pending review',cancelled:zh?'已取消':'Cancelled',approved:zh?'站內通過':'Approved on stu.best',rejected:zh?'站內未通過':'Rejected on stu.best'};
  const time=value=>new Intl.DateTimeFormat(zh?'zh-TW':'en-GB',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  const dates=data.window?(zh?'台北時間：':'Taipei time: ')+time(data.window.opens_at)+' – '+time(data.window.closes_at):'';
  const claim=[state[data.state],dates,data.candidate?eligibility[data.candidate.eligibility]:eligibility.unverified].filter(Boolean).join('\n');
  const records=data.records.length?data.records.slice(0,12).map(row=>'- '+row.academic_year+'/'+row.semester+' · '+statuses[row.status]).join('\n')
    :zh?'沒有站內提前畢業申請紀錄。':'No early graduation application is saved on stu.best.';
  return {status:'answered',answer:[claim,records,`[${title}](${earlyGraduationPath})`].join('\n\n'),
    citations:[{chunkId:'account:early-graduation',claim,title,url:earlyGraduationPath,sourceName:'My stu.best records',locator:null,effectiveAt:null,reviewedAt:null}],
    grounding:{source:'account',webSearched:false},suggestedQuestions:[],
    activity:[{kind:'early-graduation',label:zh?'查詢提前畢業':'Checked early graduation records',detail:claim,status:'complete'}]};
}

export async function changeEarlyGraduation(account,kind,payload) {
  if(!validEarlyGraduationAction(kind,payload))throw new AffairsWorkspaceError('Invalid early graduation fields.',400);
  const row=await rpc(account,'affairs_change_early_graduation',{p_kind:kind,p_payload:payload});
  return parseEarlyGraduationReceipt(row,kind,payload,payload.user_id??account.user.id);
}
