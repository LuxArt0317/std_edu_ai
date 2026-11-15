import {graduationReviewNamedCourseTitles} from './graduationReview.js';

const basePath='/school-affairs/services/13-1';
export const academicGradesPaths={index:basePath,transcript:basePath+'/transcript',warning:basePath+'/warning',ranking:basePath+'/ranking',
  current:basePath+'/current',transfer:basePath+'/transfer',cycle:basePath+'/cycle'};
export const academicGradeReadSources=[
  {key:'records',table:'affairs_academic_grade_records',order:'academic_year.asc,semester.asc,record_kind.asc,row_order.asc,id.asc'},
  {key:'termSummaries',table:'affairs_academic_term_summaries',order:'academic_year.asc,semester.asc,summary_kind.asc,id.asc'},
  {key:'rankings',table:'affairs_academic_rankings',order:'academic_year.desc,semester.desc,id.asc'},
  {key:'metadata',table:'affairs_academic_metadata',order:'user_id.asc,id.asc'},
];
const topic=/\b(?:grades?|transcripts?|academic results|rankings?|ranks?|class standing|semester average|grade point average|gpa)\b|成績|學期平均|名次|排名|預警|平均績點/i;
const gpaTopic=/\bgpa\b|\bgrade point average\b|平均績點|學分績點/i;
const otherTopic=/\b(?:dtm|moodle|elearning|e-learning|assignments?|homework|course[ -]selection|selection history|timetables?|course schedule|fees?|tuition|scholarships?|housing|dormitory|attendance|credit[ -]load|overload|underload|graduation credits?|credit review|course catalog|syllabus)\b|數位教材|教材網|作業|選課紀錄|選課記錄|選課階段|課表|學費|繳費|獎學金|助學|住宿|宿舍|出缺席|缺曠|超修|減修|畢業學分|課程大綱|開課查詢/i;
const englishTopic=/\benglish\b.{0,35}\b(?:requirements?|threshold|status)\b|(?:英文|英語).{0,12}(?:門檻|檢核|狀態|要求)/i;
const views={transcript:/\b(?:transcripts?|grade history|historical grades?|past grades?|all grades?)\b|歷年成績|成績紀錄|成績記錄/i,
  warning:/\bwarning\b|預警/i,ranking:/\b(?:rankings?|ranks?|class standing)\b|排名|名次/i,
  current:/\b(?:current(?:[ -]term)?|this semester|this term)\b|當學期|本學期|當期|目前/i,
  transfer:/\btransfer\b|抵免/i,cycle:/\bcycle\b|循環/i};
const relativeTerm=/\b(?:current|currently|now)\b|\b(?:this|next|last|previous) (?:term|semester|year)\b|目前|當期|當學期|本學期|這學期|下學期|上學期|今年|去年|明年/i;
export const academicGradesNavigation={id:'academic-grades',match:topic,title:['成績查詢','Academic grades'],
  officialUrl:'https://infosys.stu.edu.tw/AcademicServices/login/AspLoginGrade',localUrl:basePath,
  description:['查詢您的站內歷年成績、預警成績與學期排名。','View your local academic transcript, warning grades and semester rankings.']};
const nullableNumber=value=>value===null || value===undefined?null:Number(value);
const common=row=>({id:row.id,userId:row.user_id,sourceMode:row.source_mode,version:Number(row.version),createdAt:row.created_at,updatedAt:row.updated_at});
const term=row=>({academicYear:Number(row.academic_year),semester:Number(row.semester)});
export function mapAcademicGrades(records=[],termSummaries=[],rankings=[],metadata=[]) {
  return {
    records:records.map(row=>({...common(row),...term(row),recordKind:row.record_kind,courseTitle:row.course_title,
      courseCode:row.course_code ?? null,categoryText:row.category_text ?? null,moduleName:row.module_name ?? null,
      requiredElectiveText:row.required_elective_text ?? null,credits:nullableNumber(row.credits),gradeText:row.grade_text ?? null,
      remarkText:row.remark_text ?? null,rowOrder:Number(row.row_order)})),
    termSummaries:termSummaries.map(row=>({...common(row),...term(row),summaryKind:row.summary_kind,
      earnedCredits:nullableNumber(row.earned_credits),averageGradeText:row.average_grade_text ?? null,
      attemptedCredits:nullableNumber(row.attempted_credits),passedCredits:nullableNumber(row.passed_credits),failedCredits:nullableNumber(row.failed_credits)})),
    rankings:rankings.map(row=>({...common(row),...term(row),departmentRankingText:row.department_ranking_text ?? null,classRankingText:row.class_ranking_text ?? null})),
    metadata:metadata.map(row=>({...common(row),classLabel:row.class_label ?? null,englishRequirementText:row.english_requirement_text ?? null})),
  };
}
function routeView(route) {return Object.entries(academicGradesPaths).find(([,path])=>path===route)?.[0];}
function explicitView(question) {
  if(gpaTopic.test(question))return 'gpa';
  if(englishTopic.test(question))return 'english';
  for(const view of ['warning','ranking','transfer','cycle','transcript','current'])if(views[view].test(question))return view;
  return undefined;
}
function filters(question) {
  // School Affairs users often omit spaces in semester references, including
  // after "in" or "for". Do not mistake digits inside a course code for a term.
  const compact=[...question.matchAll(/(?:^|[^\p{L}\p{N}]|\b(?:in|for)(?=\d+semester))(\d+)\s*semester\s*[:：]?\s*(\d+|one\b|two\b|summer\b)/giu)];
  const rawYear=question.match(/(?:academic\s+year|學年)\s*[:：]?\s*(\d+)/i)?.[1]
    ?? question.match(/(?:^|[^\d])(\d+)\s*(?:學年|academic\s+year\b)/i)?.[1];
  const rawSemester=question.match(/(?:semester|學期)\s*[:：]?\s*(\d+|one\b|two\b|summer\b|[一二暑])/i)?.[1]
    ?? question.match(/(?:^|[^\d])第?\s*(\d+|[一二暑])\s*學期/)?.[1]
    ?? (/暑期/.test(question)?'暑':undefined);
  const years=[rawYear,...compact.map(match=>match[1])].filter(Boolean);
  const semesters=[rawSemester,...compact.map(match=>match[2])].filter(Boolean)
    .map(value=>({one:1,two:2,summer:3,'一':1,'二':2,'暑':3}[value.toLowerCase()]??Number(value)));
  return {academicYear:years.length?Number(years[0]):undefined,semester:semesters[0],
    invalid:years.some(year=>!(/^[1-9]\d{0,3}$/u.test(year)))||semesters.some(semester=>![1,2,3].includes(semester)),
    conflicting:new Set(years.map(Number)).size>1||new Set(semesters).size>1};
}
function contextQuestion(question) {
  const selected=filters(question);
  return /\b(?:my|mine|records?|results?|summary|average|credits?|which|year|semester|term|rank|status|show|details)\b|我的|紀錄|記錄|結果|平均|學分|學年|學期|排名|查詢|顯示/i.test(question) || Boolean(explicitView(question) || selected.academicYear || selected.semester || selected.invalid);
}
const academicClauses=question=>question.split(/\s+(?:and|also)\s+|[;；\n]|以及|還有/i).filter(part=>!otherTopic.test(part));
export function isAcademicGradesQuestion(question,route='',history=[]) {
  if(otherTopic.test(question))return false;
  if(/^(?:please\s+)?(?:remind me|add (?:a )?task|create (?:a )?task|complete (?:my |the )?task|finish (?:my |the )?task)|新增待辦|建立任務|完成任務/i.test(question))return false;
  if(/\b(?:where (?:can|do) i (?:find|open)|(?:link|url|website) for|how (?:do|can) i (?:open|find|access))\b|成績查詢.{0,5}(?:連結|網址)|哪裡開啟/i.test(question))return false;
  if(/\btransfer credits?\b|抵免學分/i.test(question) && !topic.test(question))return false;
  const previous=history.filter(item=>item.role==='user').at(-1)?.content || '';
  const academicExplicit=/\b(?:academic|transcripts?|semester rankings?|warning grades?|gpa|grade point average)\b|歷年成績|預警成績|學期排名|平均績點/i.test(question) || englishTopic.test(question);
  const dtmContext=/^\/dtm(?:\/|$)/i.test(route) || (!routeView(route) && /\b(?:dtm|moodle|elearning|e-learning)\b|數位教材|教材網/i.test(previous));
  if(dtmContext && !academicExplicit)return false;
  if(englishTopic.test(question))return true;
  if(topic.test(question))return true;
  return contextQuestion(question) && Boolean(routeView(route) || !otherTopic.test(previous) && (topic.test(previous) || englishTopic.test(previous)));
}
function termKey(row) {return `${row.academicYear}/${row.semester}`;}
function termLabel(row,zh) {return zh?`${row.academicYear} 學年 · ${row.semester===3?'暑期':`第 ${row.semester} 學期`}`
  :`Academic year ${row.academicYear} · ${row.semester===3?'summer semester':`semester ${row.semester}`}`;}
export function academicGradesQuery(question,route='',history=[]) {
  route=route.split(/[?#]/)[0].replace(/\/+$/,'');
  const clauses=academicClauses(question);
  const scopes=clauses.map(part=>({...filters(part),view:explicitView(part)}));
  const multipleScopes=scopes.some(scope=>scope.conflicting)
    ||['view','academicYear','semester'].some(key=>new Set(scopes.map(scope=>scope[key]).filter(value=>value!==undefined)).size>1);
  // Other record families may have their own term in a multipart question.
  // Preserve all clauses of this family so conflicting scopes are clarified.
  if(clauses.length)question=clauses.join(' and ');
  const previous=history.filter(item=>item.role==='user').at(-1)?.content || '';
  const priorContext=!otherTopic.test(previous) && (topic.test(previous) || englishTopic.test(previous) || routeView(route));
  const view=explicitView(question) || (routeView(route)!=='index'?routeView(route):undefined) || (priorContext?explicitView(previous):undefined);
  const explicit=filters(question),prior=priorContext?filters(previous):{};
  const usePrior=!prior.invalid&&!prior.conflicting;
  return {view:view??null,academicYear:explicit.academicYear??(usePrior?prior.academicYear:undefined),semester:explicit.semester??(usePrior?prior.semester:undefined),
    invalid:explicit.invalid,multipleScopes:multipleScopes||explicit.conflicting,
    relativeTermUnresolved:view!=='english'&&relativeTerm.test(question)&&(explicit.academicYear===undefined||explicit.semester===undefined)};
}
/** Select titles against all owned rows of the requested kind before applying
 * term filters. A title saved only in a different term still narrows the query. */
export function selectAcademicGradeCourses(question,rows){
  const titles=graduationReviewNamedCourseTitles(academicClauses(question).join(' '),rows.map(row=>row.courseTitle));
  return titles.size?rows.filter(row=>titles.has(row.courseTitle)):rows;
}
export function answerAcademicGrades(question,snapshot,route='',history=[]) {
  if(!isAcademicGradesQuestion(question,route,history))return null;
  const zh=/[\u3400-\u9fff]/.test(question),userId=snapshot.profile?.userId,missing=zh?'未記錄':'not recorded';
  const data=snapshot.academicGrades ?? {},own=rows=>userId?(rows ?? []).filter(row=>row.userId===userId):[];
  const selected=academicGradesQuery(question,route,history),{view}=selected;
  const matches=row=>(selected.academicYear===undefined || row.academicYear===selected.academicYear) &&
    (selected.semester===undefined || row.semester===selected.semester);
  const provenance=zh?'站內示範紀錄；不計算及格、畢業資格或校方同步結果。'
    :'Local demonstration records; no pass status, graduation eligibility or university synchronization is inferred.';
  const title=zh?({transcript:'歷年成績',warning:'預警成績',ranking:'學期排名',english:'英文門檻顯示狀態'}[view] || '成績查詢')
    :({transcript:'Academic transcript',warning:'Warning grades',ranking:'Semester rankings',english:'English requirement display status'}[view] || 'Academic grades');
  const url=academicGradesPaths[view] || (['english','gpa'].includes(view)?academicGradesPaths.transcript:basePath);
  const result=answer=>({answer:answer+'\n'+provenance,title,url});
  const partial=coverage=>coverage+'\n'+(zh?`此回覆僅顯示部分符合條件的紀錄，並非完整結果。完整站內查詢：${url}`
    :`This reply shows only part of the matching records, not the complete result. Full local view: ${url}`);
  const render=(lines,footer='')=>result([...lines,footer].filter(Boolean).join('\n'));
  // Measure the complete answer, including counts, the full-view link and
  // provenance. Never truncate a literal record field to meet this budget.
  const encoder=new TextEncoder(),fits=(lines,footer)=>encoder.encode(render(lines,footer).answer).byteLength<=16384;
  const boundedList=(items,format,coverage,prefix=[])=>{
    const lines=[],footer=count=>count<items.length?partial(coverage(count)):'';
    for(const item of items.slice(0,20)){
      const line=format(item);
      if(!fits([...prefix,...lines,line],footer(lines.length+1)))break;
      lines.push(line);
    }
    return render([...prefix,...lines],footer(lines.length));
  };
  if(selected.multipleScopes)return result(zh?'您指定了不同的成績查詢種類或學年學期。請一次選擇一個查詢範圍；本回覆尚未查選或合併紀錄。'
    :'You requested different academic views or terms. Please choose one view and term at a time; no records have been selected or merged for this reply.');
  if(selected.invalid)return result(zh?'請指定有效學年及第一、第二或暑期學期。':'Specify a valid academic year and semester 1, semester 2 or summer.');
  if(!view)return result(zh?'請指定歷年成績、預警成績、學期排名或當期成績；這些查詢的資料範圍不同。'
    :'Please specify the transcript, warning grades, semester ranking or current-term query; these are separate academic views.');
  if(view==='gpa')return result(zh?'本站學業紀錄沒有儲存 GPA（平均績點）。學期平均成績是獨立的顯示文字，不能據此換算或推定 GPA。'
    :'These academic records do not store GPA. A displayed semester average is separate text and cannot be converted into or treated as GPA.');
  if(view==='current')return result(zh?'本站尚未建立當期成績資料模型；可查詢明確儲存的歷年成績、預警成績或排名。'
    :'This local view has no current-term grade model; you can query explicitly saved transcript, warning or ranking records.');
  if(view==='transfer' || view==='cycle')return result(zh?'本站沒有此查詢的成績資料模型。這不表示您的校方紀錄為空。'
    :'This local query has no grade data model. This does not establish that your university records are empty.');
  if(view==='english') {
    const metadata=own(data.metadata)[0];
    return result(zh?`英文門檻顯示狀態：${metadata?.englishRequirementText ?? missing}。此文字不等同畢業資格判定。`
      :`English requirement display status: ${metadata?.englishRequirementText ?? missing}. This text is not a graduation eligibility decision.`);
  }
  if(selected.relativeTermUnresolved)return result(zh?'請指定學年與學期；站內歷年資料沒有被指定為目前學期。'
    :'Please specify the academic year and semester; stored history is not designated as the current term.');
  if(view==='ranking') {
    const rows=own(data.rankings).filter(matches).sort((a,b)=>b.academicYear-a.academicYear || b.semester-a.semester || a.id.localeCompare(b.id));
    if(!rows.length)return result(zh?'沒有符合條件的學期排名紀錄。':'No semester ranking records match these filters.');
    return boundedList(rows,row=>termLabel(row,zh)+(zh?`；系排名：${row.departmentRankingText ?? missing}；班排名：${row.classRankingText ?? missing}。`
      :`; department ranking: ${row.departmentRankingText ?? missing}; class ranking: ${row.classRankingText ?? missing}.`),
    count=>zh?`排名列：顯示 ${count} / ${rows.length} 筆符合條件的紀錄。`:`Ranking rows shown: ${count} of ${rows.length} matching rows.`);
  }
  const rows=selectAcademicGradeCourses(question,own(data.records).filter(row=>row.recordKind===view))
    .filter(matches).sort((a,b)=>a.academicYear-b.academicYear || a.semester-b.semester || a.rowOrder-b.rowOrder || a.id.localeCompare(b.id));
  const summaries=own(data.termSummaries).filter(row=>row.summaryKind===view && matches(row));
  const terms=[...new Map([...rows,...summaries].map(row=>[termKey(row),row])).values()]
    .sort((a,b)=>a.academicYear-b.academicYear || a.semester-b.semester);
  if(view==='warning' && terms.length>1 && (selected.academicYear===undefined || selected.semester===undefined))return boundedList(
    terms,row=>termLabel(row,zh),count=>zh?`預警學期：顯示 ${count} / ${terms.length} 個符合條件的學期。`
      :`Warning terms shown: ${count} of ${terms.length} matching terms.`,
    [zh?'請指定預警成績的學年與學期。':'Specify the academic year and semester for warning grades.']);
  if(!terms.length)return result(zh?'沒有符合條件的成績紀錄。':'No academic grade records match these filters.');
  const rowsByTerm=new Map(),summariesByTerm=new Map();
  for(const row of rows){const key=termKey(row);if(!rowsByTerm.has(key))rowsByTerm.set(key,[]);rowsByTerm.get(key).push(row);}
  for(const summary of summaries){const key=termKey(summary);if(!summariesByTerm.has(key))summariesByTerm.set(key,summary);}
  const formatRow=row=>{
    const credits=row.credits ?? missing;
    return view==='transcript'
      ? (zh?`${row.courseTitle}；類別：${row.categoryText ?? missing}；模組：${row.moduleName ?? missing}；必選修：${row.requiredElectiveText ?? missing}；學分：${credits}；成績：${row.gradeText ?? missing}。`
        :`${row.courseTitle}; category: ${row.categoryText ?? missing}; module: ${row.moduleName ?? missing}; required/elective: ${row.requiredElectiveText ?? missing}; credits: ${credits}; grade: ${row.gradeText ?? missing}.`)
      : (zh?`${row.courseCode} · ${row.courseTitle}；學分：${credits}；成績：${row.gradeText ?? missing}；備註：${row.remarkText ?? missing}。`
        :`${row.courseCode} · ${row.courseTitle}; credits: ${credits}; grade: ${row.gradeText ?? missing}; remark: ${row.remarkText ?? missing}.`);
  };
  const formatSummary=summary=>view==='transcript'
      ? (zh?`明列總計：實得學分 ${summary?.earnedCredits ?? missing}；平均成績 ${summary?.averageGradeText ?? missing}。`
        :`Explicit summary: earned credits ${summary?.earnedCredits ?? missing}; average grade ${summary?.averageGradeText ?? missing}.`)
      : (zh?`明列總計：總修習學分數 ${summary?.attemptedCredits ?? missing}；及格學分數 ${summary?.passedCredits ?? missing}；不及格學分數 ${summary?.failedCredits ?? missing}。`
        :`Explicit summary: attempted credits ${summary?.attemptedCredits ?? missing}; passed credits ${summary?.passedCredits ?? missing}; failed credits ${summary?.failedCredits ?? missing}.`);
  const blocks=[],linesFor=items=>items.flatMap(item=>[item.heading,...item.rows,item.summary]);
  const footer=(termCount,rowCount)=>termCount<terms.length || rowCount<rows.length?partial(zh
    ? `成績列：顯示 ${rowCount} / ${rows.length} 筆符合條件的紀錄。\n學期：顯示 ${termCount} / ${terms.length} 個符合條件的學期。`
    :`Grade rows shown: ${rowCount} of ${rows.length} matching rows.\nTerms shown: ${termCount} of ${terms.length} matching terms.`):'';
  let shownRows=0,rowsStopped=false;
  for(const item of terms.slice(0,10)) {
    const key=termKey(item),block={heading:termLabel(item,zh),rows:[],summary:formatSummary(summariesByTerm.get(key))};
    // A shown term always retains its complete stored summary, even when some
    // course rows are omitted. Summary-only terms remain part of the scope.
    if(!fits(linesFor([...blocks,block]),footer(blocks.length+1,shownRows)))break;
    blocks.push(block);
    if(rowsStopped)continue;
    for(const row of rowsByTerm.get(key) ?? []){
      if(shownRows===20){rowsStopped=true;break;}
      block.rows.push(formatRow(row));
      if(!fits(linesFor(blocks),footer(blocks.length,shownRows+1))){block.rows.pop();rowsStopped=true;break;}
      shownRows++;
    }
  }
  return render(linesFor(blocks),footer(blocks.length,shownRows));
}
