import {isDeepStrictEqual} from 'node:util';
import {academicAttendanceMatchingRows,academicAttendancePaths,academicAttendanceQuery,isAcademicAttendanceQuestion} from './academicAttendance.js';
import {runAnswerVerification} from './answerVerification.js';
import {answerLinksSupported} from './answerVerificationModel.js';
import {AffairsWorkspaceReadUnavailableError,loadOwnAcademicAttendance} from './affairsWorkspace.js';

const date='\\d{4}-\\d{2}-\\d{2}';
const courseTitle="[\\p{L}\\p{N}][\\p{L}\\p{N} '\\u2019.-]{0,79}";
const detailQuestion=new RegExp(`^when and which periods was i absent for (${courseTitle})$`,'iu');
const rollCallQuestion=new RegExp(`^what is the roll[- ]call timestamp for my (${date}) (${courseTitle}) absence$`,'iu');
const termHoursQuestion=new RegExp(`^how many (?:term|semester) (absence|unexcused absence) hours (?:are (?:recorded|saved|stored)|do i have) (?:for|in) (?:my )?(${courseTitle})$`,'iu');
const hours=/^(?:how many (?:absence and unexcused absence|unexcused absence|absence) hours (?:are recorded this term|did i have (?:this term|(?:last|this) (?:day|week|month)))|how many hours was i absent (?:last|this) (?:day|week|month)|what are my recorded absence and unexcused hours this term)$/iu;
const plain=/^(?:(?:show(?: me)?|list|check) my (?:saved |current )?(?:(?:academic )?attendance (?:statistics|records)|absence details)|what attendance records are saved|my (?:academic )?attendance)(?: (?:for |in )?academic year\s*\d{1,4}\s+semester\s*(?:[123]|one|two|summer))?$/iu;
const datedDetails=new RegExp(`^show(?: me)? my absence details on ${date}$`,'iu');
const zhPlain=/^(?:請)?(?:顯示|列出|查詢)(?:我(?:的)?)?(?:(?:當學期|本學期|這學期|目前)|\d{1,4}\s*學年(?:度)?(?:第)?\s*[一二暑123]\s*學期)?(?:的)?(?:缺曠(?:課)?(?:統計|明細|紀錄|記錄)|缺課(?:時數|明細)|曠課(?:時數|明細))$/u;
const safeLiteral=value=>String(value).replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/[&<>\x60*_[\]()#!~|]/gu,char=>'&#'+char.codePointAt(0)+';');
const taipeiClock=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const courseKey=value=>value.normalize('NFKC').trim().toLowerCase();

/** Accept independently renderable, explicit attendance questions on the attendance pages. */
export function selectExactAcademicAttendance(question,route,history=[]){
  if(typeof question!=='string'||question.length>300||history.length||typeof route!=='string')return null;
  const path=route.split(/[?#]/)[0].replace(/\/+$/u,'');
  if(!Object.values(academicAttendancePaths).includes(path))return null;
  const selected=question.trim().replace(/\s+Use YYYY-MM-DD for dates\.$/iu,'').replace(/[?？。.!！]+$/u,'')
    .normalize('NFKC').replace(/\bmy(?=\d{4}-\d{2}-\d{2}\b)/iu,'my ');
  if(!isAcademicAttendanceQuestion(selected,path)||/[;；\n]|[.!?]\s+\S|\b(?:and|also|plus)\s+(?:my|show|can|make|delete|send|post)\b|並且|另外|其他學生|別人/iu.test(selected))return null;
  const detail=detailQuestion.exec(selected),rollCall=rollCallQuestion.exec(selected),termHours=termHoursQuestion.exec(selected);
  if(!detail&&!rollCall&&!termHours&&!hours.test(selected)&&!plain.test(selected)&&!datedDetails.test(selected)&&!zhPlain.test(selected))return null;
  const namedCourse=detail?.[1]??rollCall?.[2]??termHours?.[2]??null;
  if(namedCourse&&/\b(?:and|or|also) (?:what|how|where|who|when|which|is|will|tell)\b|以及|還有/u.test(namedCourse.toLowerCase()))return null;
  return {question:selected,route:termHours?academicAttendancePaths.statistics:path,courseTitle:namedCourse,rollCallOnly:Boolean(rollCall),
    fullStatistics:/\bstatistics\b|統計/iu.test(selected),
    unexcusedOnly:termHours?.[1].toLowerCase()==='unexcused absence'||/^how many unexcused|曠課時數$/iu.test(selected),
    absenceOnly:termHours?.[1].toLowerCase()==='absence'||/^how many absence hours |缺課時數$/iu.test(selected)};
}

function buildCandidate(plan,result,checkedAt){
  const {selection,records}=result;
  if(!isDeepStrictEqual(academicAttendanceQuery(plan.question,records.metadata,plan.route),selection))return null;
  const detail=selection.view==='details',url=detail||selection.reason==='subterm_hours_unavailable'
    ?academicAttendancePaths.detail:academicAttendancePaths.statistics;
  const zh=/\p{Script=Han}/u.test(plan.question),say=(en,cn)=>zh?cn:en;
  const title=detail||selection.reason==='subterm_hours_unavailable'?say('Absence details','缺曠課明細'):say('Absence statistics','缺曠課統計');
  const byView=academicAttendanceMatchingRows(records[selection.view],selection,plan.question)
    .filter(row=>!plan.courseTitle||courseKey(row.courseTitle)===courseKey(plan.courseTitle));
  const display=value=>value==null?say('not recorded','未記錄'):safeLiteral(value);
  const labels=[
    ...(plan.fullStatistics?[
      ['totalTeachingHours','Term teaching hours','學期授課總時數'],
      ['currentTeachingWeeks','Current teaching weeks','目前授課週次'],
      ['currentTeachingHours','Current teaching hours','目前授課時數'],
    ]:[]),
    ...(!plan.unexcusedOnly?[['absenceHours','Absence hours','缺課時數']]:[]),
    ...(!plan.absenceOnly?[['unexcusedAbsenceHours','Unexcused absence hours','曠課時數']]:[]),
  ];
  const fields=detail?['courseCode','courseTitle',...(plan.rollCallOnly?[]:['teacherName','courseDate','periodText','absenceTypeText']),'rollCalledAt']
    :['courseCode','courseTitle',...labels.map(([field])=>field)];
  const selected=byView.slice(0,20).map(row=>Object.fromEntries(fields.map(field=>[field,row[field]])));
  const lines=[];
  if(selection.reason==='current_term_missing'){
    lines.push(say('Your current term has not been explicitly designated in the local attendance records. Specify the academic year and semester to check that term.',
      '您的站內缺曠課紀錄尚未設定當學期。請提供學年與學期以查詢該學期的紀錄。'));
  }else if(selection.reason==='subterm_hours_unavailable'){
    lines.push(say('Daily, weekly and monthly absence hour totals are unavailable. Saved local hours are for the term. Detail rows and period labels do not establish hour totals.',
      '沒有每日、每週或每月的缺曠課時數。站內儲存時數以學期為單位，明細筆數與節次無法換算為時數。'));
  }else if(selection.reason==='current_term_conflict'){
    lines.push(say('The requested term differs from the current term designated in your local attendance records. Specify which term to check.',
      '指定的學期與站內缺曠課目前設定的當學期不同。請確認要查詢的學期。'));
  }else if(selection.reason==='invalid_date'){
    lines.push(say('Specify a valid course date in YYYY-MM-DD format.','請輸入有效的 YYYY-MM-DD 課程日期。'));
  }else if(selection.reason)return null;
  else{
    lines.push(say(`Saved local ${selected.length?'demonstration ':''}attendance records for academic year ${selection.academicYear}, semester ${selection.semester}.`,
      `已儲存的 ${selection.academicYear} 學年第 ${selection.semester} 學期站內紀錄${selected.length?'（示範資料）':''}。`));
    if(!selected.length)lines.push(say('No saved attendance records match this selection.','沒有符合此查詢範圍的已儲存缺曠課紀錄。'));
    for(const row of selected){
      const name=display(row.courseTitle)+' ('+display(row.courseCode)+')';
      if(detail){
        const stamp=row.rollCalledAt;
        // PostgREST may normalize a zoned column to UTC. Keep the exact stored
        // instant and provide the Taipei clock shown on the attendance page.
        const localClock=stamp?taipeiClock.format(new Date(stamp)):null;
        const localSuffix=localClock&&localClock!==stamp.slice(0,19).replace('T',' ')
          ?say(` (${localClock} Taipei time)`,`（台北時間 ${localClock}）`):'';
        const rollCall=say('Roll-call timestamp recorded','點名時間')+' '+display(stamp)+localSuffix;
        lines.push('- '+name+(plan.rollCallOnly?` · ${rollCall}`:
          say(` · Course date ${display(row.courseDate)} · Period ${display(row.periodText)} · Teacher ${display(row.teacherName)} · Category ${display(row.absenceTypeText)} · ${rollCall}`,
            ` · 課程日期 ${display(row.courseDate)} · 節次 ${display(row.periodText)} · 授課老師 ${display(row.teacherName)} · 類別 ${display(row.absenceTypeText)} · ${rollCall}`)));
      }else{
        lines.push('- '+[name,...labels.map(([field,en,cn])=>say(en,cn)+' '+display(row[field]))].join(' · '));
      }
    }
    if(selected.length<byView.length)lines.push(say(`Showing ${selected.length} of ${byView.length} matching records.`,`顯示 ${byView.length} 筆中的 ${selected.length} 筆。`));
  }
  const source={id:'account:academicAttendance',title,url,content:JSON.stringify({selection,rows:selected,total:byView.length})};
  const answer=lines.join('\n\n')+`\n\n[${title}](${url})`;
  if(!answerLinksSupported(answer,[source]))return null;
  return {source,candidate:{status:'answered',answer,citations:[{chunkId:source.id,title,url,sourceMode:'local_demo'}],
    views:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false,checkedAt,degraded:selected.length<byView.length||undefined}}};
}

export async function answerExactAcademicAttendance({account,question,route,plan,deadline,onProgress}){
  if(!isDeepStrictEqual(plan,selectExactAcademicAttendance(question,route)))throw new TypeError('Invalid academic attendance selection.');
  const activity=new Map(),emit=step=>{activity.set(step.kind,step);onProgress?.(step);};
  const fallback={status:'abstained',answer:'',citations:[],views:[]};
  let result=null,observed=null,checkedAt;
  async function read(attempt){
    try{
      result=await loadOwnAcademicAttendance(account,plan.question,plan.route,{deadline});
      checkedAt=new Date().toISOString();
      observed=buildCandidate(plan,result,checkedAt);
      const sourceDetail=result.selection.reason==='current_term_missing'||result.selection.reason==='current_term_conflict'
        ?'Checked the saved current-term setting for the signed-in account.'
        :result.selection.reason?'Checked the supported scope without loading unrelated attendance rows.'
          :'Read the selected attendance term and view for the signed-in account.';
      emit({kind:'account-read:academicAttendance:'+attempt,label:'Checked the attendance request',
        detail:sourceDetail,status:'complete'});
    }catch(error){
      if(!(error instanceof AffairsWorkspaceReadUnavailableError))throw error;
      emit({kind:'account-read:academicAttendance:'+attempt,label:'Attendance records unavailable',
        detail:'The requested attendance source could not be read.',status:'unavailable'});
    }
  }
  await read(1);
  const verdict=await runAnswerVerification({question,deadline,onProgress:emit,initialAnswer:observed?.candidate??fallback,hasLocalCorrection:true,
    async loadEvidence({attempt}){
      if(attempt>1&&!result)await read(attempt);
      return observed?[observed.source]:[];
    },
    verify:async({evidence,candidate})=>{
      const expected=result&&buildCandidate(plan,result,checkedAt);
      if(!expected||!isDeepStrictEqual(evidence,[expected.source])||!isDeepStrictEqual(candidate,expected.candidate))
        return {ok:false,reason:'evidence_unavailable'};
      emit({kind:'academic-attendance-evidence-check',label:'Verified the selected attendance view',
        detail:'Matched the reply and its page link to the selected saved fields and scope.',status:'complete'});
      return {ok:true};
    },
    repair:async()=>observed?.candidate??fallback,
  });
  const verified=verdict.verification?.status==='verified';
  return {...verdict,views:verdict.views??[],activity:[...activity.values()],
    grounding:verified?verdict.grounding:{source:'account',webSearched:false,degraded:true}};
}
