import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {withdrawalPath,withdrawalScope,validWithdrawalTerm,validWithdrawalPayload,parseWithdrawalSnapshot,parseWithdrawalReceipt} from './courseWithdrawalContract.js';

async function request(account,procedure,body) {
  const timeout=Math.min(10000,(account.requestDeadline??Date.now()+10000)-Date.now());
  if(!Number.isFinite(timeout)||timeout<=0)throw new AffairsWorkspaceError('Course withdrawal timed out.');
  const response=await fetch(account.url+'/rest/v1/rpc/'+procedure,{
    method:'POST',headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},
    body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(timeout),
  });
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=[401,403].includes(response.status)?403:[400,409].includes(response.status)?response.status:503;
    throw new AffairsWorkspaceError(status===409?'The withdrawal record or window changed. Refresh before trying again.':'Course withdrawal request could not be completed.',status);
  }
  return readFeeRemissionJson(response);
}

export async function readWithdrawalScope(account,query) {
  const {scope,year,semester,answer,lang,...rest}=query;
  const manager=scope===withdrawalScope+'-admin';
  if(Object.keys(rest).length || (manager ? answer!==undefined||lang!==undefined||typeof year!=='string'||!/^\d{3}$/u.test(year)||typeof semester!=='string'||!/^[12]$/u.test(semester)
    :year!==undefined||semester!==undefined||(answer!==undefined&&!['records','window','guide'].includes(answer))||
      ((answer===undefined)!==(lang===undefined))||(lang!==undefined&&!['en','zh'].includes(lang))))
    throw new AffairsWorkspaceError('Invalid course withdrawal scope.',400);
  const term=manager?{academicYear:Number(year),semester:Number(semester)}:undefined;
  if(term&&!validWithdrawalTerm(term.academicYear,term.semester))throw new AffairsWorkspaceError('Invalid withdrawal term.',400);
  const data=parseWithdrawalSnapshot(await request(account,'affairs_read_course_withdrawal',
    term?{p_year:term.academicYear,p_semester:term.semester}:{}),account.user.id,term);
  return answer?answerWithdrawal(data,answer,lang):data;
}

export async function changeWithdrawal(account,kind,payload) {
  if(!validWithdrawalPayload(kind,payload))throw new AffairsWorkspaceError('Invalid course withdrawal change.',400);
  return parseWithdrawalReceipt(await request(account,'affairs_write_course_withdrawal',{p_kind:kind,p_payload:payload}),
    account.user.id,kind,payload);
}

export function answerWithdrawal(data,view,lang) {
  const zh=lang==='zh';
  const time=value=>new Intl.DateTimeFormat(zh?'zh-TW':'en-GB',{
    timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short',hourCycle:'h23',
  }).format(new Date(value));
  const state={
    unconfigured:zh?'目前尚未設定站內棄選期間。':'No stu.best withdrawal window has been configured.',
    scheduled:zh?'站內棄選期間尚未開始。':'The stu.best withdrawal window has not started.',
    open:zh?'站內棄選期間已開放。':'The stu.best withdrawal window is open.',
    closed:zh?'站內棄選期間已結束。':'The stu.best withdrawal window has closed.',
  }[data.state];
  const dates=data.window?(zh?'台北時間：':'Taipei time: ')+time(data.window.opensAt)+' – '+time(data.window.closesAt):'';
  const summary=[zh?`${data.academicYear} 學年度第 ${data.semester} 學期`:`Academic year ${data.academicYear}, semester ${data.semester}`,state,dates].filter(Boolean).join('\n\n');
  const rows=data.courses.filter(row=>row.remark_text==='Y(W)');
  const history=rows.length?(zh?`已儲存 ${rows.length} 筆棄選。`:`${rows.length} saved course withdrawal${rows.length===1?'':'s'}.`)+'\n\n'+
    rows.slice(0,12).map(row=>'- '+row.term_course_code+' · '+row.course_title).join('\n')
    :zh?'本學期沒有已儲存的棄選紀錄。':'No course withdrawals are saved for this term.';
  const guide=zh?'開啟棄選頁面，選擇課程並確認。已棄選的課程仍在清單中，期間內可還原。':'Open Course withdrawal, select a course and confirm. Withdrawn courses remain in the list and can be restored during the window.';
  const title=zh?'棄選':'Course withdrawal';
  const answer=[summary,view==='records'?history:view==='guide'?guide:'',`[${title}](${withdrawalPath})`].filter(Boolean).join('\n\n');
  return {status:'answered',answer,citations:[{chunkId:'account:course-withdrawal',title,url:withdrawalPath,
    sourceName:'My stu.best records',claim:summary,locator:null,effectiveAt:null,reviewedAt:null}],
    grounding:{source:'account',webSearched:false},suggestedQuestions:[],
    activity:[{kind:'course-withdrawal',label:zh?'查詢棄選紀錄':'Checked course withdrawal records',detail:summary,status:'complete'}]};
}
