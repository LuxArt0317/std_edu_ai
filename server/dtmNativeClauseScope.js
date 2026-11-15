import {dtmAssignmentLookupContext,dtmAssignmentRoute} from './dtmAssignmentEvidenceIntent.js';
import {isNativeDtmGradeOnlyQuestion,isForeignDtmGradesQuestion,explicitDtmGradeOverview} from './dtmGradeEvidenceIntent.js';

// Pure conservative composition. Nothing here proves record access or contents.
const text=value=>typeof value==='string'&&value.length<=2000&&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\n\r\t]/gu,''))?value.trim():'';
const assignment=/\b(?:assignments?|homework)\b|作業|作业/iu;
const assignmentField=/\b(?:due|deadline|instructions?|details?|description|title|tracker)\b|截止|期限|說明|说明|內容|内容|標題|标题/iu;
const grade=/\b(?:grades?|gradebook|marks?|feedback|weights?|percentages?|ranks?|report|totals?)\b|成績|成绩|評語|评语|權重|权重|總分|总分/iu;
const gradeTopic=/\b(?:moodle|dtm|grade reports?|gradebook)\b|成績報告|成绩报告/iu;
const other=/\b(?:dormitory|dorm|bed|tuition|fees?|balance|charges?|classes|timetable|schedule|housing|health|loan|salary|attendance|leave|files?|uploads?|revisions?|submissions?|materials?|notices?|certificate|wifi|wi-fi)\b|學費|学费|餘額|余额|課表|宿舍|檔案|教材|請假/iu;
const negative=/\b(?:do not|don['’]t|never|exclude|excluding|without|not|nor)\b|不要|不需|排除/iu;
const positive=/^(?:(?:then|also|but)\s+)?(?:please\s+)?(?:show|tell|list|read|check|what|when|give)\b|^(?:請|显示|顯示|查詢)/iu;
const operation=/\b(?:delete|submit|upload|replace|change|update|edit|save|mark|complete)\b|刪除|删除|提交|上傳|修改|儲存/iu;
const foreignGrade=/\b(?:his|her|their)\s+(?:(?:saved|native|local|moodle|dtm)\s+)*(?:grades?|report|feedback|weights?)|\bmy\s+(?:friend|sister|brother|mother|father|classmate|colleague|roommate)\b|\b[\p{L}\d_-]+['’]s\s+(?:(?:saved|native|local|moodle|dtm)\s+)*(?:grades?|report|feedback|weights?)|\b(?:for\s+(?:student|user|account)|belonging to|owned by|recorded for)\s+(?!me\b|myself\b)[\p{L}\d_-]+|(?:他人|別人|其他學生|同學|同学|朋友)的|(?:顯示|显示|查詢|查询)?\s*(?!我|本人|這|这)[\p{Script=Han}]{2,6}(?:自己|本人)?的(?:Moodle|DTM|成績|成绩)/iu;
function split(question){
  const literals=[];
  const masked=question.replace(/"[^"\n]*"|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』/gu,value=>{literals.push(value);return '\uE000'+(literals.length-1)+'\uE001';});
  return masked.split(/[;；。!?！？\n]|\.(?:\s+|$)|\s+(?:and|also|plus|then|but)\s+|以及|並且|还有|還有/iu).map(part=>part.trim().replace(/\uE000(\d+)\uE001/gu,(_,n)=>literals[Number(n)])).filter(Boolean);
}
const quotedMask=value=>value.replace(/"[^"\n]*"|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』/gu,'quoted-course');
function explicitCourse(question){
  return /\b(?:for|in)\s+(?:(?:course|course code|course title)\s+)?(?:[A-Z]{2,}[ -]?\d{2,}[A-Za-z]?|["“][^"”]+["”])|\bcourse\s+(?:code|id|title)\s*[:=]?\s*\S+|(?:課程|课程)[「『]/iu.test(question);
}
function gradeRoute(route,question){
  // A current explicit qualifier wins over an incidental overview page. The
  // reader still resolves that qualifier against the caller's actual courses.
  if(explicitCourse(question)||explicitDtmGradeOverview.test(question))return '/dtm/grades';
  const detail=dtmAssignmentRoute(route);if(detail)return '/dtm/course/'+detail.courseId+'/grades';
  return route;
}
export function dtmNativeClauseScope(question,route='',history=[]){
  const q=text(question),empty={recognized:false,compound:false,tools:[],assignment:null,grades:null,denied:[],otherQuestion:q};
  if(!q||typeof route!=='string'||!Array.isArray(history))return empty;
  if(dtmAssignmentRoute(route)===null)return {...empty,denied:[{source:'dtmAssignment',reason:'invalid_route'},{source:'dtmGradeReport',reason:'invalid_route'}]};
  const groups={assignment:[],grades:[]},denied=[],residual=[];let last=null,negativeScope=false,gradeExcluded=false,gradeFieldExcluded=false;
  const addDenial=(source,reason)=>{if(!denied.some(v=>v.source===source&&v.reason===reason))denied.push({source,reason});};
  for(const part of split(q)){
    const masked=quotedMask(part);if(positive.test(part)&&!negative.test(part))negativeScope=false;if(negative.test(part))negativeScope=true;
    const assignmentContext=Boolean(dtmAssignmentRoute(route))||/\bcourse\s+id\b/iu.test(q)&&/\bassignment\s+id\b/iu.test(q)||/\b(?:dtm|moodle)\s+(?:(?:saved|native|personal)\s+)*assignment/iu.test(masked);
    let source=null;
    if(assignmentContext&&!other.test(masked)&&(assignment.test(masked)&&assignmentField.test(masked)||assignmentField.test(masked)&&last==='assignment'&&!other.test(masked)&&!grade.test(masked)))source='assignment';
    else if(grade.test(masked)&&(gradeTopic.test(masked)||last==='grades'||foreignGrade.test(masked)||/\bmy\b|我的/iu.test(masked))&&!other.test(masked))source='grades';
    else if(assignmentContext&&assignment.test(masked)&&!grade.test(masked)&&!other.test(masked))source='assignment';
    if(!source){if(!negativeScope)residual.push(part);continue;}
    last=source;
    if(source==='assignment'){
      // Preserve native negatives for the existing field-level selector.
      groups.assignment.push(negativeScope&&!negative.test(part)?'Do not show '+part:part);continue;
    }
    if(negativeScope){
      if(/\b(?:grades?|gradebook|reports?)\b|成績|成绩|報告|报告/iu.test(masked)){groups.grades=[];gradeExcluded=true;}
      else gradeFieldExcluded=true;
      continue;
    }
    if(gradeExcluded&&positive.test(part)){gradeExcluded=false;gradeFieldExcluded=false;}
    groups.grades.push(part.replace(/^(?:then|also|but)\s+/iu,''));
  }
  let selectedAssignment=null,selectedGrades=null;
  if(groups.assignment.length){
    const ownQuestion=groups.assignment.join('. '),context=dtmAssignmentLookupContext(ownQuestion,route,[]);
    if(context.selection?.reason)addDenial('dtmAssignment',context.selection.reason);
    else if(context.selection&&!context.otherQuestion)selectedAssignment={question:ownQuestion,route,history:[],selection:context.selection};
    else if(context.excluded&&!context.selection&&!context.otherQuestion)addDenial('dtmAssignment','excluded');
    else residual.push(ownQuestion);
  }
  if(groups.grades.length&&!gradeExcluded){
    const ownQuestion=groups.grades.join(' and '),selectedRoute=gradeRoute(route,ownQuestion),masked=quotedMask(ownQuestion);
    if(isForeignDtmGradesQuestion(ownQuestion,selectedRoute)||foreignGrade.test(masked))addDenial('dtmGradeReport','foreign_request');
    else if(operation.test(masked))addDenial('dtmGradeReport','unsupported_operation');
    else if(gradeFieldExcluded)addDenial('dtmGradeReport','unsupported_field_exclusion');
    else if(explicitCourse(ownQuestion)&&/\boverview\b|\b(?:all|every)\b.{0,30}\bcourses?\b/iu.test(masked)
      ||!explicitCourse(ownQuestion)&&/\b(?:for|in)\s+(?!(?:my|this|that|the|each|all|every|me)\b)[\p{L}]/iu.test(masked))addDenial('dtmGradeReport','ambiguous_selector');
    else if(isNativeDtmGradeOnlyQuestion(ownQuestion,selectedRoute,[]))selectedGrades={question:ownQuestion,route:selectedRoute,history:[]};
    else residual.push(ownQuestion);
  }else if(gradeExcluded)addDenial('dtmGradeReport','excluded');
  const tools=[...(selectedAssignment?['dtmAssignment']:[]),...(selectedGrades?['dtmGradeReport']:[])];
  const represented=new Set([...tools,...denied.map(item=>item.source)]);
  return {compound:represented.has('dtmAssignment')&&represented.has('dtmGradeReport'),recognized:residual.length===0&&(tools.length>0||denied.length>0),tools,assignment:selectedAssignment,grades:selectedGrades,denied,otherQuestion:residual.join(' and ')};
}

// These are factual boundaries of the local lookup, with no student data.
export function dtmNativeClauseNotice(scope,question){
  const zh=/\p{Script=Han}/u.test(question);
  return scope.denied.map(({source,reason})=>{
    const assignment=source==='dtmAssignment';
    const name=assignment?(zh?'作業':'assignment'):(zh?'成績':'grade report');
    if(reason==='foreign_request')return zh?'我只能查閱你自己的'+name+'紀錄。':'I can only check your own '+name+' records.';
    if(reason==='excluded')return zh?'已略過你要求排除的'+name+'。':'I left out the '+name+' as requested.';
    if(reason==='unsupported_operation')return zh?'這個查詢無法修改'+name+'。':'This lookup only reads the '+name+'.';
    if(reason==='unsupported_field_exclusion')return zh?'無法依指定欄位範圍查閱成績，已略過這部分。':'I skipped the grade report because this lookup can’t filter the requested fields safely.';
    return assignment?(zh?'請從指定的作業頁查詢，或提供課程與作業識別碼。':'For the assignment, open its saved page or provide both the course and assignment IDs.')
      :(zh?'請指定要查閱的成績報告。':'Choose the saved grade report you want me to check.');
  }).join('\n\n');
}
