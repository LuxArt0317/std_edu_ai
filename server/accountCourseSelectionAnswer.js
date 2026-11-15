import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {answerLinksSupported} from './answerVerificationModel.js';
import {AffairsWorkspaceReadUnavailableError,loadOwnCourseSelection} from './affairsWorkspace.js';
import {courseSelectionFilters,courseSelectionPeriods} from './courseSelection.js';

const historyPath='/school-affairs/services/11-1',timetablePath='/school-affairs/services/11-2';
const phase='(?:initial(?:[ -]selection)?|add[ /-]drop|withdrawal|(?:first summer|summer ?1))';
const term='academic year\\s*[1-9]\\d{0,3}\\s+semester\\s*(?:[123]|one|two|summer)';
const own='(?:show(?: me)? my|list my|what is my|my)';
const title="[\\p{L}\\p{N}][\\p{L}\\p{N} '\\u2019()/-]{0,119}";
const historyQuestion=new RegExp(`^${own} (?:saved )?(?:${phase} )?(?:course[ -]selection (?:records|history)|selection history)(?: (?:for |in )?${term}(?: ${phase})?)?$`,'iu');
const timetableQuestion=new RegExp(`^${own} (?:saved )?(?:${phase} )?(?:weekly )?(?:course )?timetable(?: (?:for |in )?${term}(?: ${phase})?)?$`,'iu');
const namedTimetable=new RegExp(`^in my ${phase} timetable for ${term}, when and where is (${title})$`,'iu');
const namedRoomDay=new RegExp(`^what classroom and weekday are recorded in my weekly timetable for (${title})$`,'iu');
const remarkApproval=new RegExp(`^does the remark ["“]?(${title})["”]? mean (?:my )?(${title}) enrollment was approved$`,'iu');
const zhQuery=/^(?:(?:請)?(?:顯示|列出|查詢)(?:我(?:的)?)?|我的)(?:\d{1,4}\s*學年(?:度)?第?\s*[一二暑123]\s*學期)?(?:初選|加退選|棄選|暑一)?(?:的)?(?:選課(?:紀錄|記錄|歷史)|課表)$/u;
const extraIntent=/\b(?:and|or|also) (?:what|how|where|who|when|which|will|tell|show)\b|以及|還有/iu;
const localLinks=new Map([[historyPath,/^請給我「選課(?:紀錄|記錄)查詢」在 stu\.best 的連結[。！!？?]?$/u],
  [timetablePath,/^請給我「我的(?:功課表|課表)」在 stu\.best 的連結[。！!？?]?$/u]]);
const writeRequest=/^(?:please )?(?:change|update|edit|delete|modify) my (?:official )?(course[ -]selection history|weekly timetable) record(?: now)?(?: without confirmation)?[.!?]?$/iu;
const enDays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const zhDays=['週一','週二','週三','週四','週五','週六','週日'];
const periods=new Map(courseSelectionPeriods.map((slot,index)=>[slot.period,{time:slot.time,index}]));
const phaseLabels={initial:['initial selection','初選'],add_drop:['add/drop','加退選'],withdrawal:['withdrawal','棄選'],summer1:['summer 1','暑一']};
const literal=value=>String(value).replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/[&<>\x60*_[\]#!~|]/gu,c=>'&#'+c.codePointAt(0)+';');
const key=text=>text.trim().normalize('NFKC').toLowerCase();

export function courseSelectionPageDisposition(question,route){
  const path=route.split(/[?#]/)[0].replace(/\/+$/u,'');
  if(!localLinks.has(path))return null;
  const text=question.trim().normalize('NFKC');
  if(localLinks.get(path).test(text))return {kind:'navigation',url:path};
  const write=writeRequest.exec(text);
  if(!write||(write[1].toLowerCase()==='weekly timetable')!==(path===timetablePath))return null;
  return {kind:'unsupported-write',url:path};
}

export function courseSelectionWriteBoundary(url){
  if(!localLinks.has(url))throw new TypeError('Invalid course-selection destination.');
  const timetable=url===timetablePath;
  const title=timetable?'My weekly timetable':'Course-selection history';
  return {status:'handoff',answer:`I can show your saved ${timetable?'timetable':'course-selection history'}. I cannot change that record in chat.\n\n[${title}](${url})`,
    citations:[{chunkId:'directory:course-selection',title,url}],suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

export function selectExactCourseSelection(question,route,history=[]){
  if(typeof question!=='string'||question.length>300||typeof route!=='string'||history.length)return null;
  const path=route.split(/[?#]/)[0].replace(/\/+$/u,'');
  if(path!==historyPath&&path!==timetablePath)return null;
  const text=question.trim().normalize('NFKC').replace(/\? Do not infer any if none are stored\.$/iu,'').replace(/[?？。.！!]+$/u,'');
  const phaseNamesOnly=/, including phase and course names$/iu.test(text);
  const scopeQuestion=phaseNamesOnly?text.replace(/, including phase and course names$/iu,''):text;
  const timetableCourse=namedTimetable.exec(text),roomDay=namedRoomDay.exec(text),remark=remarkApproval.exec(text);
  const chinese=zhQuery.test(text);
  const timetable=Boolean(timetableCourse||roomDay||timetableQuestion.test(text)||chinese&&text.endsWith('課表')
    ||/^what weekly timetable records are saved for me$/iu.test(text));
  const historyOnly=historyQuestion.test(scopeQuestion)||chinese&&!timetable
    ||/^what course[ -]selection (?:history )?records are saved(?: for me)?$/iu.test(text);
  if(!timetable&&!historyOnly&&!remark||remark&&path!==historyPath)return null;
  const namedCourse=timetableCourse?.[1]??roomDay?.[1]??remark?.[2]??null;
  if(namedCourse&&extraIntent.test(namedCourse)||remark&&extraIntent.test(remark[1]))return null;
  const scopeText=remark||roomDay?'':timetableCourse?text.split(',')[0]:scopeQuestion;
  const {academicYear,semester,selectionPhase,ambiguousPhase,invalidSemester}=courseSelectionFilters(scopeText);
  if(invalidSemester||(/academic year|學年/iu.test(scopeText)&&academicYear===undefined)
    ||phaseNamesOnly&&(academicYear===undefined||semester===undefined))return null;
  return {view:remark?'remark':timetable?'timetable':'history',scope:{academicYear,semester,selectionPhase,timetable},chinese,
    ambiguous:Boolean(ambiguousPhase),course:namedCourse,remark:remark?.[1]??null,phaseNamesOnly,roomAndWeekdayOnly:Boolean(roomDay)};
}

function makeCourseSelectionCandidate(plan,rows,checkedAt){
  const {view,scope,course,remark,chinese}=plan,say=(en,zh)=>chinese?zh:en;
  const title=say(view==='timetable'?'My weekly timetable':'Course-selection history',view==='timetable'?'我的課表':'選課記錄查詢');
  const url=view==='timetable'?timetablePath:historyPath;
  const scoped=rows.filter(row=>!course||[row.courseTitle,row.termCourseCode].some(value=>key(value)===key(course)));
  const matched=remark===null?scoped:scoped.filter(row=>row.remarkText!==null&&key(row.remarkText)===key(remark));
  const scopeKey=row=>[row.academicYear,row.semester,row.selectionPhase].join('/');
  const needsScope=(view!=='remark'&&!plan.phaseNamesOnly&&new Set(scoped.map(scopeKey)).size>1)||plan.ambiguous;
  const seen=new Set(),selected=[];
  const lines=[view==='timetable'?say('Saved local demonstration timetable.','已儲存的站內示範課表。')
    :say('Saved local demonstration course-selection records.','已儲存的站內示範選課紀錄。')];
  if(needsScope){
    lines.push(say('Please specify the academic year, semester and one selection phase to choose a saved snapshot.',
      '請指定學年、學期與一個選課階段。'));
  }else if(view==='remark'){
    const stored=matched[0];
    if(stored){
      selected.push({courseTitle:stored.courseTitle,remarkText:stored.remarkText});
      lines.push(say(`${literal(stored.courseTitle)} · Saved remark: ${literal(stored.remarkText)}.`,
        `${literal(stored.courseTitle)} · 已儲存備註：${literal(stored.remarkText)}。`));
    }else lines.push(say('No saved remark matches that course and wording.','沒有符合該科目和文字的已儲存備註。'));
    lines.push(say('A selection remark does not establish approved enrollment.','選課備註無法確認選課已獲核准。'));
  }else if(!scoped.length)lines.push(view==='timetable'
    ?say('No saved records match this timetable selection.','沒有符合條件的課表紀錄。')
    :say('No course-selection records match this selection.','沒有符合條件的選課紀錄。'));
  else{
    let remaining=5000;
    for(const row of scoped.slice(0,20)){
      const termLabel=say(`Academic year ${row.academicYear} · semester ${row.semester} · selection phase: ${phaseLabels[row.selectionPhase][0]}`,
        `${row.academicYear} 學年 · 第 ${row.semester} 學期 · 選課階段：${phaseLabels[row.selectionPhase][1]}`);
      const rowTitle=literal(row.courseTitle)+' ('+literal(row.termCourseCode)+')';
      const selectedRow={academicYear:row.academicYear,semester:row.semester,selectionPhase:row.selectionPhase,
        courseTitle:row.courseTitle,termCourseCode:row.termCourseCode};
      let recordText;
      if(view==='timetable'){
        const meetings=[...row.meetings].sort((a,b)=>a.weekday-b.weekday||periods.get(a.period).index-periods.get(b.period).index);
        const slots=meetings.map(slot=>[
          (chinese?zhDays:enDays)[slot.weekday-1],...(plan.roomAndWeekdayOnly?[]:[say('period','節次'),slot.period,periods.get(slot.period).time]),
          '·',say('room','教室'),slot.room?literal(slot.room):say('not recorded','未記錄'),
        ].join(' '));
        recordText=rowTitle+' — '+(slots.length?slots.join(' / '):say('Unscheduled course','未排課科目'));
        selectedRow.meetings=plan.roomAndWeekdayOnly?meetings.map(({weekday,room})=>({weekday,room})):meetings;
      }else if(plan.phaseNamesOnly){
        recordText=rowTitle+say(` · academic year ${row.academicYear} · selection phase: ${phaseLabels[row.selectionPhase][0]}`,
          ` · 學年 ${row.academicYear} · 選課階段：${phaseLabels[row.selectionPhase][1]}`);
      }else{
        const display=value=>value===null?say('not recorded','未記錄'):literal(value);
        recordText=rowTitle+say(` · ${row.credits} credits · Instructor: ${display(row.instructorOne)} · Required/elective: ${display(row.requiredElectiveText)} · Remark: ${display(row.remarkText)}`,
          ` · ${row.credits} 學分 · 教師：${display(row.instructorOne)} · 必選修：${display(row.requiredElectiveText)} · 備註：${display(row.remarkText)}`);
        Object.assign(selectedRow,{instructorOne:row.instructorOne,credits:row.credits,requiredElectiveText:row.requiredElectiveText,remarkText:row.remarkText});
      }
      const header=seen.has(termLabel)?'':'\n'+termLabel;
      remaining-=header.length+recordText.length+3;
      if(remaining<0)break;
      if(header){lines.push(header);seen.add(termLabel);}
      lines.push('- '+recordText);
      selected.push(selectedRow);
    }
    if(selected.length<scoped.length)lines.push(say(`Showing ${selected.length} of ${scoped.length} matching records.`,
      `顯示 ${scoped.length} 筆中的 ${selected.length} 筆。`));
  }
  const excerpted=view!=='remark'&&!needsScope&&selected.length<scoped.length;
  const source={id:'account:courseSelection',title,url,content:JSON.stringify({scope,view,needsScope,rows:selected,excerpted})};
  const answer=lines.join('\n')+`\n\n[${title}](${url})`;
  if(!answerLinksSupported(answer,[source]))return null;
  return {source,candidate:{status:'answered',answer,citations:[{chunkId:source.id,title,url,sourceMode:'local_demo'}],
    views:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false,checkedAt,degraded:excerpted||undefined}}};
}

export async function answerExactCourseSelection({account,question,route,plan,deadline,onProgress}){
  if(!isDeepStrictEqual(plan,selectExactCourseSelection(question,route)))throw new TypeError('Invalid course selection plan.');
  const activity=new Map(),emit=step=>{activity.set(step.kind,step);onProgress?.(step);};
  const fallback={status:'abstained',answer:'',citations:[],views:[]};
  let rows=null,observed=null,checkedAt;
  async function read(attempt){
    try{
      rows=plan.ambiguous?[]:await loadOwnCourseSelection(account,plan.scope,{deadline});
      checkedAt=new Date().toISOString();
      observed=makeCourseSelectionCandidate(plan,rows,checkedAt);
      emit({kind:'account-read:courseSelection:'+attempt,label:'Checked course selection',
        detail:plan.ambiguous?'Checked which selection scope was requested.':'Read only the selected saved course records for the signed-in account.',
        status:'complete'});
    }catch(error){
      if(!(error instanceof AffairsWorkspaceReadUnavailableError))throw error;
      emit({kind:'account-read:courseSelection:'+attempt,label:'Course-selection records unavailable',
        detail:'The selected records could not be read.',status:'unavailable'});
    }
  }
  await read(1);
  const checked=await runAnswerVerification({question,initialAnswer:observed?.candidate??fallback,deadline,onProgress:emit,hasLocalCorrection:true,
    async loadEvidence({attempt}){
      if(attempt>1&&!rows)await read(attempt);
      return observed?[observed.source]:[];
    },
    verify:async({candidate,evidence})=>{
      const expected=rows&&makeCourseSelectionCandidate(plan,rows,checkedAt);
      if(!expected||!isDeepStrictEqual(candidate,expected.candidate)||!isDeepStrictEqual(evidence,[expected.source]))
        return {ok:false,reason:'evidence_unavailable'};
      emit({kind:'course-selection-evidence-check',label:'Verified the saved course-selection answer',
        detail:'Matched the reply and its local link to the requested view and saved fields.',status:'complete'});
      return {ok:true};
    },
    repair:async()=>observed?.candidate??fallback,
  });
  return {...checked,activity:[...activity.values()],grounding:checked.verification?.status==='verified'?checked.grounding:
    {source:'account',webSearched:false,degraded:true}};
}
