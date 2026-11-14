import {AffairsWorkspaceError,schoolAffairsDatabaseConfiguration} from './affairsWorkspace.js';
import {feeRemissionUuid,readFeeRemissionJson} from './feeRemissionContract.js';
import {
  adjustmentNoticeScope,adjustmentPaths,adjustmentTerm,parseAdjustmentRow,validAdjustmentPayload,validAdjustmentSelector,
  summerNoticeScope,validAcademicYear,
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
  const url=rules?adjustmentPaths.late_add:phase==='late_add'?adjustmentPaths.late_add+'/entry':
    phase==='summer'?adjustmentPaths.summer+'?year='+term.academicYear:adjustmentPaths.add_drop;
  const title=phase==='add_drop'?(zh?'加退選':'Course add/drop'):phase==='summer'?(zh?'暑期選課':'Summer course selection'):(zh?'補加選':'Late add');
  const decisions={
    eligible:zh?'站內紀錄為符合資格。':'The saved local decision is eligible.',
    ineligible:zh?'站內紀錄為不符合資格。':'The saved local decision is ineligible.',
    missing_college:zh?'已儲存的資格結果顯示學籍資料缺少學院代碼。請聯絡教務處。':'Your saved eligibility result reports a missing college code. Contact Academic Affairs.',
    unverified:zh?'站內紀錄尚未確認資格。':'Your eligibility has not been verified.',
  };
  const termLabel=phase==='summer'?(zh?`學年 ${term.academicYear} · 暑期`:`Academic year ${term.academicYear} · summer term`):
    (rules?'':(zh?`學年 ${term.academicYear} · 第 ${term.semester} 學期`:`Academic year ${term.academicYear}, semester ${term.semester}`));
  const summary=rules
    ? (zh?notice.rules_zh:notice.rules_en).join('\n\n')
    : termLabel +
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
  if(Object.keys(extras).length || !['add_drop','late_add','summer'].includes(phase) ||
     (answer!==undefined && !['en','zh'].includes(answer)))throw new AffairsWorkspaceError('Invalid course adjustment scope.',400);
  const manager=scope==='course-adjustment-admin';
  const validYear=typeof year==='string'&&/^[1-9][0-9]{2}$/u.test(year);
  if(manager ? (typeof user_id!=='string'||!validYear||typeof semester!=='string'||!(/^[123]$/u.test(semester))||answer!==undefined)
    : (user_id!==undefined||semester!==undefined||(year!==undefined&&(phase!=='summer'||!validYear))))
    throw new AffairsWorkspaceError('Invalid course adjustment selector.',400);
  if(manager){
    // RLS also independently protects the selected record. Check the trusted role
    // before a denied lookup can appear to be a successful empty result.
    const authorized=await request(account,'affairs_profiles',{select:'role',user_id:'eq.'+account.user.id,limit:'2'});
    if(authorized?.length!==1||authorized[0]?.role!=='admin')throw new AffairsWorkspaceError('Administrator required.',403);
  }
  const term=manager?{academicYear:Number(year),semester:Number(semester)}:adjustmentTerm(new Date(),phase);
  if(!manager&&validYear)term.academicYear=Number(year);
  const record=await loadAdjustment(account,{phase,...term,...(manager?{userId:user_id}:{})});
  return answer?adjustmentAnswer(phase,answer,{record,term}):{userId:manager?user_id:account.user.id,term,record};
}

export async function loadSummerNotice(year) {
  if(!validAcademicYear(year))throw new AffairsWorkspaceError('Choose a valid academic year.',400);
  const rows=await request(schoolAffairsDatabaseConfiguration(),'affairs_summer_selection_notices',{
    academic_year:'eq.'+year,select:'academic_year,published_on,source_url,fee_per_unit,minimum_paid_students,registration_rules_zh,registration_rules_en',limit:'2',
  });
  if(!Array.isArray(rows)||rows.length>1)throw new Error('Invalid summer notice response.');
  if(!rows.length)return null;
  const row=rows[0];
  if(row?.academic_year!==year||!/^\d{4}-\d{2}-\d{2}$/u.test(row.published_on)||
    typeof row.source_url!=='string'||!/^https:\/\/www\.stu\.edu\.tw\/latestnews-single\/\?id=[0-9]+$/u.test(row.source_url)||
    !Number.isInteger(row.fee_per_unit)||row.fee_per_unit<0||row.fee_per_unit>100000||
    !Number.isInteger(row.minimum_paid_students)||row.minimum_paid_students<1||row.minimum_paid_students>500||
    !['registration_rules_zh','registration_rules_en'].every(key=>Array.isArray(row[key])&&row[key].length>=1&&row[key].length<=8&&
      row[key].every(rule=>typeof rule==='string'&&rule.trim()&&rule.length<=400))||
    row.registration_rules_zh.length!==row.registration_rules_en.length)
    throw new Error('Invalid summer notice record.');
  return row;
}

export async function serveSummerNotice(request,response) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='GET'){response.setHeader('Allow','GET');response.status(405).json({error:'Method not allowed.'});return;}
  const {scope,year,...extras}=request.query??{};
  if(scope!==summerNoticeScope||Object.keys(extras).length||typeof year!=='string'||!/^[1-9][0-9]{2}$/u.test(year)){
    response.status(400).json({error:'Choose one summer academic year.'});return;
  }
  try{response.status(200).json({academicYear:Number(year),notice:await loadSummerNotice(Number(year))});}
  catch{response.status(503).json({error:'Summer selection notice temporarily unavailable.'});}
}

export function summerNoticeAnswer(year,language,notice) {
  const zh=language==='zh',url=adjustmentPaths.summer+'/notice?year='+year;
  const title=zh?'暑期選課公告':'Summer selection notice';
  const summary=notice
    ? (zh?`${year} 學年度暑期課程每學分 NT$${notice.fee_per_unit.toLocaleString('en-US')}；零學分課程按每小時計費。開班需至少 ${notice.minimum_paid_students} 位選課並繳費的學生。公告日期 ${notice.published_on}。`:
      `Academic year ${year}: NT$${notice.fee_per_unit.toLocaleString('en-US')} per credit, or per teaching hour for a zero-credit course. A class needs at least ${notice.minimum_paid_students} paid registrations. The notice is dated ${notice.published_on}.`)
    : (zh?`目前沒有 ${year} 學年度的已存暑期選課公告。`:`There is no saved summer selection notice for academic year ${year}.`);
  const rules=notice?(zh?notice.registration_rules_zh:notice.registration_rules_en):[];
  const answer=[summary,...rules,`[${title}](${url})`].join('\n\n');
  return {status:'answered',answer,
    citations:notice?[{chunkId:'notice:summer-selection:'+year,claim:summary,title,url,sourceName:'STU Academic Affairs',
      locator:null,effectiveAt:null,reviewedAt:notice.published_on}]:[],
    grounding:{source:'directory',webSearched:false},suggestedQuestions:[],
    activity:[{kind:'summer-selection',label:zh?'查詢暑期選課公告':'Checked the summer notice',detail:summary,status:'complete'}]};
}
