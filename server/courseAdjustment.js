import {AffairsWorkspaceError,schoolAffairsDatabaseConfiguration} from './affairsWorkspace.js';
import {feeRemissionUuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {
  adjustmentNoticeScope,adjustmentPaths,adjustmentTerm,parseAdjustmentRow,validAdjustmentPayload,validAdjustmentSelector,
} from './courseAdjustmentContract.js';

async function request(account,path,query,payload) {
  const url = new URL(account.url+'/rest/v1/'+path);
  url.search = new URLSearchParams(query).toString();
  const timeout=Math.min(7000,(account.requestDeadline??Date.now()+7000)-Date.now());
  if(timeout<=0 || !Number.isFinite(timeout))throw new AffairsWorkspaceError('Course adjustment lookup timed out.');
  const response = await fetch(url,{
    method:payload?'POST':'GET',headers:{apikey:account.key,
      ...(account.token?{Authorization:'Bearer '+account.token}:{}),...(payload?{'Content-Type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify({p_payload:payload})}:{}),redirect:'error',signal:AbortSignal.timeout(timeout),
  });
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    const status = [401,403].includes(response.status)?403:[400,409].includes(response.status)?response.status:503;
    throw new AffairsWorkspaceError(status===409?'The decision changed. Reload before saving.':'Course adjustment request could not be completed.',status);
  }
  return readFeeRemissionJson(response);
}

export async function loadAdjustment(account,{phase,academicYear,semester,userId=account.user.id}) {
  if(!feeRemissionUuid(userId)||!validAdjustmentSelector(phase,academicYear,semester))
    throw new AffairsWorkspaceError('Invalid course adjustment selector.',400);
  const rows = await request(account,'affairs_course_adjustment_eligibility',{
    select:'user_id,phase,academic_year,semester,decision,checked_on,version',user_id:'eq.'+userId,phase:'eq.'+phase,
    academic_year:'eq.'+academicYear,semester:'eq.'+semester,limit:'2',
  });
  if(!Array.isArray(rows)||rows.length>1)throw new Error('Invalid eligibility result.');
  return rows.length?parseAdjustmentRow(rows[0],userId,phase,academicYear,semester):null;
}

export async function changeAdjustment(account,payload) {
  if(!validAdjustmentPayload(payload))throw new AffairsWorkspaceError('Invalid course adjustment decision.',400);
  const result = await request(account,'rpc/affairs_set_course_adjustment_eligibility',{},payload);
  const row = parseAdjustmentRow(result,payload.user_id,payload.phase,payload.academic_year,payload.semester);
  if(row.decision!==payload.decision||row.version!==payload.expected_version+1)throw new Error('Invalid course adjustment receipt.');
  return row;
}

export async function loadAdjustmentNotice() {
  const keys=['rules_zh','rules_en','selection_notes','fee_notes'];
  const rows=await request(schoolAffairsDatabaseConfiguration(),'affairs_late_add_notice',{
    id:'eq.1',select:['observed_on',...keys].join(','),limit:'2',
  });
  const row=rows?.[0];
  if(!Array.isArray(rows)||rows.length!==1||!row||typeof row.observed_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(row.observed_on)||
     !keys.every(key=>Array.isArray(row[key])&&row[key].length>=1&&row[key].length<=12&&row[key].every(value=>typeof value==='string'&&value.trim()&&value.length<=1000))||
     row.rules_zh.length!==row.rules_en.length)throw new Error('Invalid late-add notice.');
  return row;
}

export async function serveAdjustmentNotice(request,response) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='GET'){response.setHeader('Allow','GET');response.status(405).json({error:'Method not allowed.'});return;}
  if(request.query?.scope!==adjustmentNoticeScope||Object.keys(request.query).length!==1){
    response.status(400).json({error:'Choose only the late-add notice scope.'});return;
  }
  try{response.status(200).json(await loadAdjustmentNotice());}
  catch{response.status(503).json({error:'Late-add notice temporarily unavailable.'});}
}

export function adjustmentAnswer(view,language,{record,term,notice}={}) {
  const zh=language==='zh',rules=view==='rules',phase=rules?'late_add':view;
  const url=rules?adjustmentPaths.late_add:phase==='late_add'?adjustmentPaths.late_add+'/entry':adjustmentPaths.add_drop;
  const title=phase==='add_drop'?(zh?'加退選':'Course add/drop'):(zh?'補加選':'Late add');
  const decisions={
    eligible:zh?'站內紀錄為符合資格。':'The saved local decision is eligible.',
    ineligible:zh?'站內紀錄為不符合資格。':'The saved local decision is ineligible.',
    unverified:zh?'站內紀錄尚未確認資格。':'Your eligibility has not been verified.',
  };
  const summary=rules
    ? (zh?notice.rules_zh:notice.rules_en).join('\n\n')
    : (zh?`學年 ${term.academicYear} · 第 ${term.semester} 學期`:`Academic year ${term.academicYear}, semester ${term.semester}`) +
      '\n\n' + (record?decisions[record.decision]:(zh?'此學期沒有站內資格紀錄。':'There is no saved eligibility decision for your account in this term.'));
  return {
    status:'answered',answer:summary+'\n\n'+`[${title}](${url})`,
    citations:[{chunkId:rules?'notice:late-add':'account:course-adjustment',claim:summary,title,url,sourceName:rules?'stu.best School Affairs':'My stu.best records',locator:null,effectiveAt:null,reviewedAt:rules?notice.observed_on:record?.checked_on??null}],
    grounding:{source:rules?'directory':'account',webSearched:false},
    suggestedQuestions:[],activity:[{kind:'course-adjustment',label:zh?'查詢選課資料':'Checked course adjustment records',detail:summary,status:'complete'}],
  };
}

export async function readAdjustmentScope(account,query) {
  const {scope,phase,answer,user_id,year,semester,...extras}=query;
  if(Object.keys(extras).length || !['add_drop','late_add'].includes(phase) ||
     (answer!==undefined && !['en','zh'].includes(answer)))throw new AffairsWorkspaceError('Invalid course adjustment scope.',400);
  const manager=scope==='course-adjustment-admin';
  if(manager ? (typeof user_id!=='string'||typeof year!=='string'||!/^\d{3}$/u.test(year)||typeof semester!=='string'||!(/^[12]$/u.test(semester))||answer!==undefined)
    : (user_id!==undefined||year!==undefined||semester!==undefined))throw new AffairsWorkspaceError('Invalid course adjustment selector.',400);
  if(manager){
    // RLS also independently protects the selected record. Check the trusted role
    // before a denied lookup can appear to be a successful empty result.
    const authorized=await request(account,'affairs_profiles',{select:'role',user_id:'eq.'+account.user.id,limit:'2'});
    if(authorized?.length!==1||authorized[0]?.role!=='admin')throw new AffairsWorkspaceError('Administrator required.',403);
  }
  const term=manager?{academicYear:Number(year),semester:Number(semester)}:adjustmentTerm();
  const record=await loadAdjustment(account,{phase,...term,...(manager?{userId:user_id}:{})});
  return answer?adjustmentAnswer(phase,answer,{record,term}):{userId:manager?user_id:account.user.id,term,record};
}
