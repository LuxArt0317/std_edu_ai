import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {readFeeRemissionJson as readBoundedJson} from './feeRemissionContract.js';
import {programRegistrationPath,validProgramRegistrationAction,parseProgramRegistrations,parseProgramRegistrationReceipt} from './programRegistrationContract.js';

const collection='affairs_interdisciplinary_registrations';
const columns='user_id,program_code,academic_year,semester,withdrawn_year,withdrawn_semester,completed_year,completed_semester,version';

async function request(account,operation) {
  const endpoint = new URL(account.url + '/rest/v1/' + (operation ? 'rpc/affairs_change_interdisciplinary_registration' : collection));
  if (!operation) endpoint.search = new URLSearchParams({
    select:columns,user_id:'eq.'+account.user.id,order:'academic_year.desc,semester.desc,program_code.asc',limit:'501',
  }).toString();
  const remaining = Math.min(10000, (account.requestDeadline ?? Date.now()+10000) - Date.now());
  if (!Number.isFinite(remaining) || remaining <= 0) throw new AffairsWorkspaceError('Program registration timed out.');
  const result = await fetch(endpoint,{
    method:operation?'POST':'GET',
    headers:{apikey:account.key,Authorization:`Bearer ${account.token}`,...(operation?{'Content-Type':'application/json'}:{})},
    ...(operation?{body:JSON.stringify({p_payload:operation})}:{}),
    redirect:'error',signal:AbortSignal.timeout(remaining),
  });
  if (!result.ok) {
    void result.body?.cancel().catch(()=>{});
    if ([401,403].includes(result.status)) throw new AffairsWorkspaceError('Program records are unavailable to this account.',403);
    if (result.status === 409) throw new AffairsWorkspaceError('Registration changed. Reload and try again.',409);
    if (result.status === 400) throw new AffairsWorkspaceError('Invalid program registration.',400);
    throw new AffairsWorkspaceError('Program registrations are temporarily unavailable.');
  }
  return readBoundedJson(result);
}

export async function loadProgramRegistrations(account) {
  return parseProgramRegistrations(await request(account),account.user.id);
}

export async function changeProgramRegistration(account,payload) {
  if (!validProgramRegistrationAction(payload)) throw new AffairsWorkspaceError('Invalid program registration.',400);
  return parseProgramRegistrationReceipt(await request(account,payload),account.user.id,payload);
}

export async function answerProgramRegistrations(account,lang) {
  const rows = await loadProgramRegistrations(account);
  const zh = lang === 'zh';
  const title = zh ? '跨院系學分學程登記' : 'Interdisciplinary program registration';
  const summary = zh ? `您的帳戶有 ${rows.length} 筆站內學程登記。` : `Your stu.best account has ${rows.length} interdisciplinary program registrations.`;
  const list = rows.slice(0,12).map(row=>{
    const state = row.completed_year ? (zh?'已完成':'Completed') : row.withdrawn_year ? (zh?'已放棄':'Withdrawn') : (zh?'修習中':'Active');
    return zh
      ? `- **${row.program_code}** · ${row.academic_year} 學年，第 ${row.semester} 學期 · ${state}`
      : `- **${row.program_code}** · ROC academic year ${row.academic_year}, semester ${row.semester} · ${state}`;
  });
  return {
    status:'answered',
    answer:[summary,list.join('\n'),`[${title}](${programRegistrationPath})`].filter(Boolean).join('\n\n'),
    citations:[{chunkId:'account:interdisciplinary-registration',claim:summary,title,sourceName:'My stu.best records',
      url:programRegistrationPath,locator:null,effectiveAt:null,reviewedAt:null}],
    suggestedQuestions:[],
    grounding:{source:'account',webSearched:false,checkedAt:new Date().toISOString()},
    activity:[{kind:'program-registrations',label:'Checked interdisciplinary program registrations',detail:summary,status:'complete'}],
  };
}
