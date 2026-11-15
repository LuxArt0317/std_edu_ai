import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {readClubStudent} from './clubStudent.js';
import {clubStudentScope} from './clubStudentContract.js';
import {clubAttendancePage,clubAttendanceSelection} from './clubAttendanceIntent.js';
import {formatOwnTuitionBalance,readOwnTuitionBalance} from './ownTuitionBalance.js';

const sourceId='account:clubAttendance';
const view='my-attendance';
const columns=['id','title','club_name','starts_at','location','academic_year','term','recorded_at'];
const visibleLimit=12;
const workspaceKeys=['userId','view','page','eligible','hasMore','rows'];
const time=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const unavailable=()=>new Error('Club activity attendance evidence was not verified.');
const exact=(value,keys)=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)));
const label=value=>value.replace(/[\s\p{Cc}\p{Cf}]+/gu,' ').trim();
const markdown=value=>value.replace(/[\\`*_~{}[\]()<>#!|]/gu,'\\$&');
const termValue=(value,min,max)=>value===null||Number.isInteger(value)&&value>=min&&value<=max;

function instant(value){
  const stamp=/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,6}))?(?:Z|[+-]\d\d:\d\d)$/u.exec(value);
  const parsed=Date.parse(value);
  if(!stamp||!Number.isFinite(parsed)||new Date(stamp[1]+'T00:00:00Z').toISOString().slice(0,10)!==stamp[1])throw unavailable();
  return BigInt(parsed)*1000n+BigInt((stamp[2]??'').padEnd(6,'0').slice(3));
}

async function readAttendance(account,selection,deadline){
  const workspace=await readClubStudent({...account,requestDeadline:Math.min(deadline,Date.now()+6500)},
    {scope:clubStudentScope,view,page:String(selection.page)});
  if(Date.now()>=deadline||!exact(workspace,workspaceKeys)||workspace.eligible||selection.page===1000&&workspace.hasMore)throw unavailable();
  const seen=new Set();
  let previous;
  for(const row of workspace.rows){
    if(!exact(row,columns)||seen.has(row.id)||!['title','club_name','location'].every(key=>label(row[key]).length>0&&row[key].length<=320)
      ||!termValue(row.academic_year,89,199)||!termValue(row.term,1,3))throw unavailable();
    const starts=instant(row.starts_at);
    instant(row.recorded_at);
    if(previous&&(starts>previous.starts||starts===previous.starts&&row.id<=previous.id))throw unavailable();
    previous={starts,id:row.id};
    seen.add(row.id);
  }
  const rows=selection.countOnly?[]:workspace.rows.slice(0,selection.latest?1:visibleLimit).map(({title,club_name,starts_at,location,academic_year,term,recorded_at})=>({
    title:label(title),club:label(club_name),startsAt:starts_at,location:label(location),year:academic_year,term,recordedAt:recorded_at,
  }));
  return {id:sourceId,url:clubAttendancePage(selection.page),content:JSON.stringify({
    page:selection.page,rows,pageCount:workspace.rows.length,hasMore:workspace.hasMore,checkedAt:new Date().toISOString(),
  })};
}

function formatAttendance(question,selection,source){
  if(source?.id!==sourceId||source.url!==clubAttendancePage(selection.page))throw unavailable();
  const {page,rows,pageCount,hasMore,checkedAt}=JSON.parse(source.content);
  if(page!==selection.page)throw unavailable();
  const zh=/\p{Script=Han}/u.test(question),say=(en,cn)=>zh?cn:en;
  const title=say('My club activity attendance','我的活動參與紀錄');
  const heading=[say('Activity','活動名稱'),say('Club','社團名稱'),say('Starts (Taipei)','活動開始（臺北）'),say('Location','地點'),
    say('Academic year','學年'),say('Term','學期'),say('Recorded (Taipei)','登錄時間（臺北）')];
  const empty=say('Not recorded','未登錄');
  const cells=rows.map(row=>[row.title,row.club,time.format(new Date(row.startsAt)),row.location,
    row.year===null?empty:String(row.year),row.term===null?empty:String(row.term),time.format(new Date(row.recordedAt))]);
  const count=pageCount?say(`Saved attendance entries on page ${page}: ${pageCount}.`,`第 ${page} 頁有 ${pageCount} 筆已儲存的參與紀錄。`)
    :say(`No saved attendance entries were returned on page ${page}.`,`第 ${page} 頁沒有傳回已儲存的參與紀錄。`);
  const local=say('These entries are saved in your stu.best account.','這些參與紀錄已儲存在你的 stu.best 帳戶。');
  const lines=[count];
  if(cells.length===1)lines.push(cells[0].map((value,index)=>heading[index]+': '+markdown(value)).join(' · '));
  if(selection.latest&&cells.length)lines.push(say('Showing the latest entry by activity start time.','依活動開始時間顯示最新一筆。'));
  if(hasMore)lines.push(say('There are more pages. The count above covers this page.','還有後續頁面。以上筆數只計算這一頁。'));
  if(selection.partial)lines.push(say('I verified the saved attendance fields. The other requested details need a separate lookup.',
    '我已驗證儲存的參與欄位，其他資料需另外查詢。'));
  lines.push(local,'['+title+']('+source.url+')');
  return {status:'answered',answer:lines.join('\n\n'),citations:[{chunkId:sourceId,title,url:source.url,
    claim:say('Attendance saved for the signed-in account','登入帳戶下已儲存的參與紀錄'),sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:checkedAt}],
    suggestedQuestions:[],grounding:{source:'account',webSearched:false,checkedAt},
    ...(cells.length>1?{views:[{id:'club-attendance',title,url:source.url,columns:heading,rows:cells,total:pageCount,checkedAt,note:local}]}:{})};
}

function formatAnswer(question,selection,evidence){
  const attendance=evidence.find(item=>item.id===sourceId);
  const charges=evidence.find(item=>item.id==='account:charges');
  const club=attendance?formatAttendance(question,selection,attendance):null;
  if(!selection.tuitionBalance)return club;
  const zh=/\p{Script=Han}/u.test(question);
  const fees=charges?formatOwnTuitionBalance(charges,zh):null;
  if(!club&&!fees)return null;
  const clubMissing=zh?'目前無法查核你的活動參與紀錄。':'I couldn’t verify your saved club attendance.';
  const feeMissing=zh?'目前無法查核你的學費餘額。':'I couldn’t verify your saved tuition balance.';
  const clubSection={reply:club,text:club?.answer??clubMissing};
  const feeSection={reply:fees,text:fees?.answer??feeMissing};
  const sections=selection.tuitionBalance==='first'?[feeSection,clubSection]:[clubSection,feeSection];
  return {status:'answered',answer:sections.map(section=>section.text).join('\n\n'),
    citations:sections.flatMap(section=>section.reply?.citations??[]),suggestedQuestions:[],
    views:sections.flatMap(section=>section.reply?.views??[]),
    grounding:{source:'account',webSearched:false,checkedAt:club?.grounding.checkedAt??JSON.parse(charges.content).checkedAt,
      ...(!club||!fees?{degraded:true}:{})}};
}

export async function answerClubActivityAttendance({account,question,route,selection,deadline,onProgress}){
  const expected=clubAttendanceSelection(question,route);
  if(!expected||expected.reason||!isDeepStrictEqual(expected,selection))throw unavailable();
  const activity=[];
  const progress=step=>{
    const index=activity.findIndex(item=>item.kind===step.kind);
    if(index<0)activity.push(step);else activity[index]=step;
    try{onProgress?.(step);}catch{/* A closed stream does not change evidence. */}
  };
  const caller={...account,user:{id:account.user.id}};
  const retained=new Map();
  const reads=[{id:sourceId,tool:'clubAttendance',label:'Checked club activity attendance',
    missing:'The selected attendance page could not be read.',reader:()=>readAttendance(caller,expected,deadline)}];
  if(expected.tuitionBalance)reads.push({id:'account:charges',tool:'charges',label:'Checked saved tuition balance',
    missing:'The selected tuition records could not be read.',reader:()=>readOwnTuitionBalance(caller,deadline)});
  const read=async attempt=>{
    await Promise.all(reads.map(async ({id,tool,label,missing,reader})=>{
      if(retained.has(id))return;
      const result=await reader().catch(()=>null);
      if(result?.id===id)retained.set(id,result);
      progress({kind:'account-read:'+tool+':'+attempt,label,status:retained.has(id)?'complete':'unavailable',
        detail:retained.has(id)?'Checked the selected records for this signed-in account.':missing});
    }));
    return reads.flatMap(({id})=>retained.has(id)?[retained.get(id)]:[]);
  };
  const first=await read(1);
  const missing={status:'abstained',answer:'',citations:[],grounding:{source:'account',webSearched:false}};
  const format=evidence=>formatAnswer(question,expected,evidence);
  const result=await runAnswerVerification({question,initialAnswer:format(first)??missing,deadline,onProgress:progress,
    loadEvidence:async({attempt})=>attempt===1?first:read(attempt),
    verify:async({candidate,evidence,attempt})=>!evidence.length||attempt===1&&evidence.length<reads.length
      ?{ok:false,reason:'evidence_unavailable'}:{ok:isDeepStrictEqual(candidate,format(evidence))},
    repair:async({evidence})=>format(evidence)??missing,
  });
  if(expected.tuitionBalance&&result.verification?.status==='verified'&&retained.size<reads.length){
    const unavailableSource=retained.has(sourceId)?'tuition':'club_attendance';
    progress({kind:'partial-verification',label:'Verified the available records',status:'complete',
      detail:'One requested source remained unavailable. The answer shows only what was verified.'});
    return {...result,activity,verification:{...result.verification,status:'unverified',reason:unavailableSource+'_evidence_unavailable'}};
  }
  return {...result,activity};
}
