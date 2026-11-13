import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {feeRemissionUuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {parseTeachingFeedback,parseTeachingFeedbackReceipt,teachingFeedbackPaths,teachingFeedbackScopes,validTeachingFeedbackAction} from './teachingFeedbackContract.js';

async function rpc(account,operation,body){
  const timeout=Math.min(10000,(account.requestDeadline??Date.now()+10000)-Date.now());
  if(timeout<=0)throw new AffairsWorkspaceError('Teaching feedback request timed out.');
  const response=await fetch(account.url+'/rest/v1/rpc/'+operation,{
    method:'POST',headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},
    body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(timeout),
  });
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status=[401,403].includes(response.status)?403:[400,409].includes(response.status)?response.status:503;
    throw new AffairsWorkspaceError(status===409?'The saved record or period changed. Reload before continuing.':'Teaching feedback request could not be completed.',status);
  }
  return readFeeRemissionJson(response);
}

export async function readTeachingFeedback(account,query){
  const {scope,view,term,survey,section,answer,...extra}=query;
  if(scope!=='teaching-feedback'||!teachingFeedbackScopes.includes(view)||Object.keys(extra).length||
    (view==='manage'?(answer!==undefined||term!==undefined&&!feeRemissionUuid(term)||
      (survey!==undefined||section!==undefined)&&(!feeRemissionUuid(term)||!feeRemissionUuid(survey)||!feeRemissionUuid(section))):
      (term!==undefined||survey!==undefined||section!==undefined||answer!==undefined&&!['en','zh'].includes(answer)))){
    throw new AffairsWorkspaceError('Invalid teaching feedback scope.',400);
  }
  const data=parseTeachingFeedback(await rpc(account,'affairs_read_teaching_feedback',{p_scope:view,p_term:term??null,p_survey:survey??null,p_section:section??null}),account.user.id,view);
  if(!answer)return data;
  const zh=answer==='zh',url=teachingFeedbackPaths[view];
  const title=view==='survey'?(zh?'教學意見問卷調查':'Teaching evaluation'):(zh?'即時反應教學意見':'Immediate teaching feedback');
  const rows=view==='survey'?data.surveys.map(survey=>{
    const completed=survey.courses.filter(course=>course.completed).length;
    const state=(zh?{scheduled:'尚未開始',open:'開放中',closed:'已結束'}:{scheduled:'scheduled',open:'open',closed:'closed'})[survey.state];
    const period=survey.phase==='midterm'?(zh?'期中':'midterm'):(zh?'期末':'final');
    return `${survey.term} · ${period} · ${state} · ${completed}/${survey.courses.length} ${zh?'已完成':'completed'}`;
  }):data.feedback.map(record=>`${record.course} · ${record.status==='reviewed'?(zh?'已檢閱':'reviewed'):(zh?'已送出':'submitted')}`);
  const claim=rows.length?(zh?'已找到您的站內紀錄。':'I found your saved stu.best records.'):
    view==='survey'?(zh?'沒有適用於您課程的站內問卷。':'There are no stu.best teaching evaluations for your courses.'):
      (zh?'沒有已儲存的站內即時教學意見。':'You have no saved immediate teaching feedback on stu.best.');
  return {status:'answered',answer:[claim,rows.slice(0,12).map(row=>'- '+row.replace(/[\[\]<>]/gu,'')).join('\n'),`[${title}](${url})`].filter(Boolean).join('\n\n'),
    citations:[{chunkId:'account:teaching-feedback:'+view,claim,title,url,sourceName:'My stu.best records',locator:null,effectiveAt:null,reviewedAt:null}],
    grounding:{source:'account',webSearched:false},suggestedQuestions:[],
    activity:[{kind:'teaching-feedback',label:zh?'查詢教學意見紀錄':'Checked teaching feedback records',detail:claim,status:'complete'}]};
}

export async function changeTeachingFeedback(account,kind,payload){
  if(!validTeachingFeedbackAction(kind,payload))throw new AffairsWorkspaceError('Invalid teaching feedback fields.',400);
  const row=await rpc(account,'affairs_change_teaching_feedback',{p_kind:kind,p_payload:payload});
  return parseTeachingFeedbackReceipt(row,kind,payload);
}
