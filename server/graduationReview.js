import {isCombinedAcademicOutcomeQuestion} from './academicOutcomeIntent.js';
// Pure module: the manager and server share these validation rules without
// importing credentials, a database client, or server-only runtime modules.
export const graduationReviewMaxPayloadBytes=131072;
export const graduationReviewKinds=['academic_services','legacy'];
export const graduationReviewPaths={academic_services:'/school-affairs/services/13-1/graduation',legacy:'/school-affairs/services/15-2'};
export const graduationReviewPath=graduationReviewPaths.academic_services;
export const isGraduationReviewKind=value=>value==='academic_services'||value==='legacy';
export const graduationReviewReadSource={table:'affairs_graduation_reviews',order:'user_id.asc,id.asc'};
const idPattern=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const object=(value,keys)=>value!==null && typeof value==='object' && !Array.isArray(value)
  && [Object.prototype,null].includes(Object.getPrototypeOf(value))
  && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
function unicodeValid(value) {
  for(const character of value){const point=character.codePointAt(0);if(point===0 || point>=0xd800 && point<=0xdfff)return false;}
  return true;
}
const text=(value,max,required=false)=>value===null?!required:typeof value==='string' && unicodeValid(value)
  && [...value].length<=max && (!required || value.trim().length>0);
const credit=value=>value===null || typeof value==='number' && Number.isFinite(value) && value>=0 && value<=1000 && Number(value.toFixed(2))===value;
const indicator=value=>value===null || value==='passed' || value==='attention';
const status=(value,note=false)=>object(value,note?['text','indicator','note']:['text','indicator']) && text(value.text,160)
  && indicator(value.indicator) && (!note || text(value.note,1000));
function ids(value,max) {
  return Array.isArray(value) && value.length<=max && Array.from(value).every(item=>item && typeof item==='object' && typeof item.id==='string' && idPattern.test(item.id))
    && new Set(value.map(item=>item.id)).size===value.length;
}
function timestamp(value) {
  if(value===null)return true;
  if(typeof value!=='string')return false;
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(?:Z|[+-](0\d|1[0-5]):[0-5]\d)$/);
  if(!match)return false;
  const [,yearText,monthText,dayText]=match,year=Number(yearText),month=Number(monthText),day=Number(dayText);
  const days=[31,year%4===0 && (year%100!==0 || year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>0 && month>=1 && month<=12 && day>=1 && day<=days[month-1];
}
function course(value) {
  return object(value,['id','sequenceText','title','credits','requiredElectiveText','yearText','transferText'])
    && typeof value.id==='string' && idPattern.test(value.id) && text(value.sequenceText,30) && text(value.title,160,true)
    && credit(value.credits) && text(value.requiredElectiveText,30) && text(value.yearText,30) && text(value.transferText,80);
}
// PostgreSQL jsonb::text uses a space after each comma and colon. Property order
// does not affect byte length. Valid reports contain no exponent-sized numbers.
export function graduationReviewPayloadBytes(value) {
  const seen=new Set();
  const serialize=item=>{
    if(item===null)return 'null';
    if(typeof item==='string'){if(!unicodeValid(item))throw new Error('Invalid JSON string');return JSON.stringify(item);}
    if(typeof item==='number'){if(!Number.isFinite(item))throw new Error('Invalid JSON number');return JSON.stringify(item);}
    if(typeof item==='boolean')return String(item);
    if(typeof item!=='object' || seen.has(item))throw new Error('Invalid JSON value');
    seen.add(item);
    let result;
    if(Array.isArray(item))result='['+Array.from(item,serialize).join(', ')+']';
    else {
      if(![Object.prototype,null].includes(Object.getPrototypeOf(item)))throw new Error('Invalid JSON object');
      result='{'+Object.entries(item).map(([key,entry])=>serialize(key)+': '+serialize(entry)).join(', ')+'}';
    }
    seen.delete(item);return result;
  };
  try{return new TextEncoder().encode(serialize(value)).byteLength;}catch{return Infinity;}
}
export function validateGraduationReviewContent(value) {
  if(!object(value,['reportedAt','identity','educationProgram','foreignLanguageCompletion','englishRequirement','graduationReview','languageRequirements','categories','otherCourses']))return 'The report must contain exactly the approved report fields.';
  if(!timestamp(value.reportedAt))return 'reportedAt must be null or a valid ISO timestamp with timezone.';
  const identityKeys=['studentNumber','studentName','departmentName','yearText','enrollmentStatusText','curriculumCohortText','doubleMajorText','minorText'];
  if(!object(value.identity,identityKeys) || !identityKeys.every(key=>text(value.identity[key],key==='yearText'?30:160)))return 'Identity fields must be explicit nullable text within their length limits.';
  if(!['educationProgram','foreignLanguageCompletion','englishRequirement'].every(key=>status(value[key])) || !status(value.graduationReview,true))return 'Status fields must contain nullable text and passed, attention or null indicators; the review must include its nullable note.';
  if(!ids(value.languageRequirements,100) || !ids(value.categories,100) || !ids(value.otherCourses,1000))return 'Report arrays exceed their limits or contain invalid or duplicate IDs.';
  for(const item of value.languageRequirements) {
    if(!object(item,['id','label','status','requiredCredits','matchedCredits','missingCredits']) || !text(item.label,160,true)
      || !status(item.status) || !['requiredCredits','matchedCredits','missingCredits'].every(key=>credit(item[key])))return 'A language requirement has invalid fields, text, status or credits.';
  }
  let total=value.otherCourses.length;
  const rowLimit='At most 1000 combined requirement, matched-course and other-course rows are allowed.';
  for(const item of value.categories) {
    if(!object(item,['id','label','requiredElectiveText','requiredCredits','completedCredits','matchedCredits','excludedCredits','status','requirements','detailSubtotalCredits'])
      || !text(item.label,160,true) || !text(item.requiredElectiveText,30) || !status(item.status)
      || !['requiredCredits','completedCredits','matchedCredits','excludedCredits','detailSubtotalCredits'].every(key=>credit(item[key]))
      || !ids(item.requirements,1000))return 'A category has invalid fields, text, status, credits or requirement IDs.';
    total+=item.requirements.length;if(total>1000)return rowLimit;
    for(const row of item.requirements) {
      if(!object(row,['id','sequenceText','title','moduleText','credits','requiredElectiveText','yearText','transferText','indicator','matchedCourses'])
        || !text(row.sequenceText,30) || !text(row.title,160,true) || !text(row.moduleText,160) || !credit(row.credits)
        || !text(row.requiredElectiveText,30) || !text(row.yearText,30) || !text(row.transferText,80) || !indicator(row.indicator)
        || !ids(row.matchedCourses,1000) || !row.matchedCourses.every(course))return 'A requirement or matched course has invalid fields, text, credits or IDs.';
      total+=row.matchedCourses.length;if(total>1000)return rowLimit;
    }
  }
  if(!value.otherCourses.every(course))return 'An other-course row has invalid fields, text or credits.';
  if(graduationReviewPayloadBytes(value)>graduationReviewMaxPayloadBytes)return 'The report exceeds the 131072-byte JSONB limit.';
  return null;
}
export function mapGraduationReview(rows=[]) {
  return {reports:rows.filter(row=>isGraduationReviewKind(row.report_kind)).map(row=>({...row.report,id:row.id,userId:row.user_id,reportKind:row.report_kind,sourceMode:row.source_mode,version:Number(row.version),createdAt:row.created_at,updatedAt:row.updated_at}))};
}
const routePath=route=>typeof route==='string'?route.split(/[?#]/)[0].replace(/\/+$/,''):'';
const routeKind=route=>{
  const path=routePath(route);
  if(path===graduationReviewPaths.legacy)return 'legacy';
  if(path===graduationReviewPath || path==='/school-affairs/services/15-1')return 'academic_services';
  return undefined;
};
const legacyQuestion=/\blegacy\b|\b15-2\b|舊版|舊式/i;
const topic=/\b(?:graduation (?:review|audit|report|requirements?|credits?|eligibility|status)|degree audit|(?:eligible|ready) to graduate|(?:can|may) i graduate|qualify for graduation)\b|\b(?:credits?|requirements?)\b.{0,60}\b(?:to|for) graduat(?:e|ion)\b|畢業(?:審核|審查|檢核|學分|資格|條件|要求|狀態)|能否畢業|可以畢業|(?:學分|條件).{0,16}畢業/i;
const otherTopic=/\b(?:dtm|moodle|elearning|e-learning|assignments?|transcripts?|grades?|gpa|rankings?|course[ -]selection|selection history|timetables?|fees?|tuition|scholarships?|housing|dormitory|attendance|credit[ -]load|overload|underload|transfer credits?|course catalog|syllabus)\b|數位教材|教材網|作業|歷年成績|預警成績|學期排名|選課紀錄|選課記錄|課表|學費|繳費|獎學金|助學|住宿|宿舍|出缺席|超修|減修|抵免學分|課程大綱|開課查詢/i;
const contextTopic=/\b(?:my|mine|status|credits?|requirements?|missing|gaps?|matched|completed|courses?|details?|report|results?|english|language)\b|我的|狀態|學分|要求|尚缺|符合|課程|結果|明細|英文|英語/i;
function precedingReportQuestion(history) {
  // Only the immediately preceding user topic can provide context. Assistant
  // prose and older topics must not resurrect a different private report kind.
  for(let index=history.length-1;index>=0;index--){
    const item=history[index];if(item.role!=='user')continue;
    return !otherTopic.test(item.content) && topic.test(item.content)?item.content:'';
  }
  return '';
}
export const graduationReviewNavigation={id:'graduation-review',match:topic,title:['畢業學分檢核','Graduation review'],
  officialUrl:'https://infosys.stu.edu.tw/AcademicServices/Login/AspLoginGradReview',localUrl:graduationReviewPath,
  description:['查看您的站內畢業檢核參考報告與明列學分。','View your local graduation-reference report and its explicitly recorded credits.']};
export function isGraduationReviewQuestion(question,route='',history=[]) {
  if(isCombinedAcademicOutcomeQuestion(question))return true;
  if(otherTopic.test(question))return false;
  if(/^(?:please\s+)?(?:remind me|add (?:a )?task|create (?:a )?task|complete (?:my |the )?task|finish (?:my |the )?task)|新增待辦|建立任務|完成任務/i.test(question))return false;
  if(/\b(?:where (?:can|do) i (?:find|open)|where is|(?:link|url|website) for|how (?:do|can) i (?:open|find|access))\b|(?:連結|網址)|哪裡開啟/i.test(question))return false;
  if(topic.test(question))return true;
  return contextTopic.test(question) && (routeKind(route)!==undefined || precedingReportQuestion(history)!=='');
}
export function graduationReviewQueryKind(question,route='',history=[]) {
  const clauses=question.split(/\s+(?:and|also)\s+|[;；\n]|以及|還有/i);
  const relevant=clauses.find(clause=>topic.test(clause)&&!otherTopic.test(clause));
  if(relevant)question=relevant;
  const currentKind=routeKind(route);
  return currentKind==='legacy'||legacyQuestion.test(question)?'legacy'
    :currentKind || (!topic.test(question) && legacyQuestion.test(precedingReportQuestion(history))?'legacy':'academic_services');
}
export function graduationReviewQuery(question,route='',history=[]) {
  const clauses=question.split(/\s+(?:and|also)\s+|[;；\n]|以及|還有/i).filter(part=>topic.test(part)&&!otherTopic.test(part));
  const kinds=clauses.map(part=>legacyQuestion.test(part)?'legacy':'academic_services');
  return {reportKind:graduationReviewQueryKind(question,route,history),multipleScopes:new Set(kinds).size>1};
}
const statusOnly=/^(?:what is my status|what's my status|my status|我的(?:檢核)?狀態|我的狀態是什麼)$/iu;
const ownExplicitStatus=/^(?:(?:what is|what's|(?:please )?show(?: me)?) my (?:(?:modern|legacy|academic services) )?graduation (?:review |report )?status|(?:請)?(?:查詢|顯示|告訴我)我(?:的)?(?:舊版|新版|教務應用服務)?畢業(?:檢核|審核)(?:的)?狀態)$/iu;
const ownReportContext=/^(?:(?:(?:please )?(?:show(?: me)?|open|view|check|read) )?my (?:(?:modern|legacy|academic services) )?graduation (?:report|review)|(?:請)?(?:查看|顯示|開啟)?我(?:的)?(?:15-2|舊版|新版|教務應用服務)?畢業(?:檢核|審核)(?:表|報告)?)$/iu;
const statusText=value=>typeof value==='string'&&value.length<=200
  ?value.normalize('NFKC').trim().replace(/[’]/gu,"'").replace(/[?.!。！？]+$/u,''):'';

/** Exact status requests only. Full reports and mixed questions keep their
 * existing routing. A bare follow-up may use the last explicit own report. */
export function graduationReviewStatusKind(question,route='',history=[]){
  const text=statusText(question);
  if(!text||/[?#]/u.test(route))return null;
  if(!ownExplicitStatus.test(text)){
    if(!statusOnly.test(text))return null;
    const previous=[...history].reverse().find(row=>row?.role==='user');
    const precedesOwnReport=ownReportContext.test(statusText(previous?.content));
    if(previous&&topic.test(previous.content)&&!precedesOwnReport)return null;
    if(!routeKind(route)&&!precedesOwnReport)return null;
  }
  if(!isGraduationReviewQuestion(question,route,history))return null;
  const selection=graduationReviewQuery(question,route,history);
  return selection.multipleScopes?null:selection.reportKind;
}

const recordedCredits=/^what credits are explicitly recorded for ([\p{L}\p{N}][\p{L}\p{M}\p{N} '&-]{0,80} requirements?)$/iu;
const matchedRequirement=/^which courses? match(?:es)? my ([\p{L}\p{N}][\p{L}\p{M}\p{N} '&-]{0,80} requirement) in the (?:(?:legacy|academic services) )?graduation report$/iu;
const officialEligibility=/^can i officially graduate based on (?:this|my|the) (?:local |legacy |academic services )?report$/iu;
const multipleNames=/\b(?:and|or|also|plus)\b/iu;
const creditFields=['requiredCredits','completedCredits','matchedCredits','detailSubtotalCredits'];
const selectionName=value=>value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();

export function selectGraduationReviewAnswer(question,route='',history=[]){
  const kind=graduationReviewStatusKind(question,route,history);
  if(kind)return {kind,view:'status'};
  const text=statusText(question);
  if(!text||/[?#]/u.test(route))return null;
  const category=recordedCredits.exec(text)?.[1];
  const requirement=matchedRequirement.exec(text)?.[1];
  const name=category??requirement;
  const view=category?'credits':requirement?'matchedCourse':officialEligibility.test(text)?'eligibility':null;
  if(!view||name&&multipleNames.test(name))return null;
  // Some terse questions refer to a report without repeating its name. An
  // explicit report route takes precedence over the immediately previous topic.
  const previous=[...history].reverse().find(row=>row?.role==='user');
  const activeReport=routeKind(route),previousOwnReport=ownReportContext.test(statusText(previous?.content));
  if(!activeReport&&!previousOwnReport){
    if(previous&&topic.test(previous.content))return null;
    if(view==='credits'||view==='eligibility'&&!/\b(?:legacy|academic services)\b/iu.test(text))return null;
  }
  const report=graduationReviewQuery(question,route,history);
  return report.multipleScopes?null:{kind:report.reportKind,view,...(name?{name}:{})};
}

/** Reduce report categories to the requested literal fields and their lineage.
 * Never derive totals or treat a similar title as the selected requirement. */
export function projectGraduationReviewDetail(categories,{view,name}){
  if(!ids(categories,100)||categories.some(row=>!text(row.label,160,true)))throw new TypeError('Invalid report categories.');
  const normalized=selectionName(name);
  if(view==='credits'){
    const matches=categories.filter(row=>selectionName(row.label)===normalized);
    if(matches.length!==1)return {state:matches.length?'ambiguous':'missing'};
    const category=matches[0];
    if(!creditFields.every(key=>credit(category[key])))throw new TypeError('Invalid recorded graduation credits.');
    return {state:'found',label:category.label,...Object.fromEntries(creditFields.map(key=>[key,category[key]]))};
  }
  if(view!=='matchedCourse')throw new TypeError('Invalid report detail selection.');
  const requirements=[];
  for(const category of categories){
    if(!ids(category.requirements,1000)||requirements.length+category.requirements.length>1000
      ||category.requirements.some(row=>!text(row.title,160,true)))throw new TypeError('Invalid report requirements.');
    requirements.push(...category.requirements);
  }
  const matches=requirements.filter(row=>selectionName(row.title)===normalized);
  if(matches.length!==1)return {state:matches.length?'ambiguous':'missing'};
  const match=matches[0];
  if(!ids(match.matchedCourses,1000)||match.matchedCourses.some(row=>!text(row.title,160,true)))
    throw new TypeError('Invalid matched courses.');
  return {state:'found',label:match.title,matchedTitles:match.matchedCourses.map(row=>row.title)};
}

function graduationCourseNameRanges(question,title) {
  if(typeof title!=='string'||title.trim().length<3)return [];
  const text=question.toLocaleLowerCase(),name=title.trim().toLocaleLowerCase(),word=/[a-z0-9]/i;
  const ranges=[];
  for(let index=text.indexOf(name);index!==-1;index=text.indexOf(name,index+1)){
    // Do not select "Course 9" when the user names "Course 99". Chinese
    // surrounding prose may adjoin a title without an English word boundary.
    if((!word.test(name[0])||!word.test(text[index-1]||''))&&(!word.test(name.at(-1))||!word.test(text[index+name.length]||'')))ranges.push([index,index+name.length]);
  }
  return ranges;
}
export function graduationReviewNamesCourse(question,title) {
  return graduationCourseNameRanges(question,title).length>0;
}
export function graduationReviewNamedCourseTitles(question,titles) {
  const matches=[...new Set(titles)].filter(title=>typeof title==='string').map(title=>({title,ranges:graduationCourseNameRanges(question,title)})).filter(item=>item.ranges.length);
  // "Database" inside the requested "Database Design" is not a second
  // request. A separate mention of "requirement Database" still counts.
  return new Set(matches.filter(item=>item.ranges.some(([start,end])=>!matches.some(other=>other!==item
    &&other.ranges.some(([otherStart,otherEnd])=>otherStart<=start&&otherEnd>=end&&otherEnd-otherStart>end-start)))).map(item=>item.title));
}
// Both the draft and its evidence/cards use this selection. Inputs must already
// be restricted to one owned report kind; IDs are joined with their full lineage.
export function selectGraduationReviewCourses(question,collections) {
  const keys=['requirements','matchedCourses','otherCourses'];
  const rows=Object.fromEntries(keys.map(key=>[key,collections[key]||[]]));
  const fullReportCourseRows=keys.reduce((total,key)=>total+rows[key].length,0);
  const namedTitles=graduationReviewNamedCourseTitles(question,keys.flatMap(key=>rows[key].map(row=>row.title)));
  const named=Object.fromEntries(keys.map(key=>[key,rows[key].filter(row=>namedTitles.has(row.title))]));
  const parentOf=(parent,child)=>typeof parent.reportId==='string'&&typeof parent.categoryId==='string'&&typeof parent.id==='string'
    &&parent.reportId===child.reportId&&parent.categoryId===child.categoryId&&parent.id===child.requirementId;
  if(keys.some(key=>named[key].length)) {
    const parents=rows.requirements.filter(row=>named.matchedCourses.some(child=>parentOf(row,child)));
    // Only a directly named requirement expands to its saved matches. A
    // requirement added as parent context must not pull in sibling courses.
    const children=rows.matchedCourses.filter(child=>named.requirements.some(parent=>parentOf(parent,child)));
    return {courseScope:'named_course_rows_and_parent_context',fullReportCourseRows,
      namedCourseRows:Object.fromEntries(keys.map(key=>[key,named[key].length])),
      linkedCourseRows:{requirements:parents.filter(row=>!named.requirements.includes(row)).length,
        matchedCourses:children.filter(row=>!named.matchedCourses.includes(row)).length,otherCourses:0},
      ...named,requirements:[...new Set([...named.requirements,...parents])],matchedCourses:[...new Set([...named.matchedCourses,...children])]};
  }
  const requested=/\b(?:courses?|details?|matched)\b|課程|明細|符合/i.test(question);
  const required=/\b(?:required|requirement)\s+courses?\b|應修課程|必修課程/i.test(question);
  const matched=/\bmatched\s+courses?\b|對應課程|符合課程/i.test(question);
  const other=/\bother(?:\s+actual)?\s+courses?\b|其他(?:實修)?課程/i.test(question);
  const explicit=required||matched||other;
  const selected={requirements:requested&&(!explicit||required)?rows.requirements:[],
    matchedCourses:requested&&(!explicit||required||matched)?rows.matchedCourses:[],
    otherCourses:requested&&(!explicit||other)?rows.otherCourses:[]};
  // Required rows are context for a matched-course request, not extra courses
  // inferred from credits. Keep exact parent rows even when IDs repeat elsewhere.
  if(matched&&!required)selected.requirements=rows.requirements.filter(row=>selected.matchedCourses.some(child=>parentOf(row,child)));
  return {courseScope:!requested?'summary_only':!explicit?'all_course_rows':required&&!matched&&!other?'required_course_rows_and_matches'
    :matched&&!required&&!other?'matched_course_rows_and_parent_context':other&&!required&&!matched?'other_course_rows':'requested_course_types',
    fullReportCourseRows,...selected};
}
export function answerGraduationReview(question,snapshot,route='',history=[]) {
  if(!isGraduationReviewQuestion(question,route,history))return null;
  const zh=/[\u3400-\u9fff]/.test(question),userId=snapshot.profile?.userId;
  const query=graduationReviewQuery(question,route,history),{reportKind}=query;
  const path=graduationReviewPaths[reportKind];
  const owned=typeof userId==='string'&&userId.trim()?snapshot.graduationReview?.reports.filter(row=>Object.hasOwn(row,'userId')&&row.userId===userId&&isGraduationReviewKind(row.reportKind))??[]:[];
  const matching=owned.filter(row=>row.reportKind===reportKind),report=matching.length===1?matching[0]:undefined;
  const label=zh?(reportKind==='legacy'?'舊版畢業檢核表（15-2）':'教務應用服務畢業檢核表（13-1）')
    :(reportKind==='legacy'?'Legacy graduation report (15-2)':'Academic Services graduation report (13-1)');
  const provenance=zh?'站內示範參考報告。文字與學分均為明列值，不計算或判定畢業資格。'
    :'Local demonstration reference report. Text and credits are explicitly recorded values, not a calculation or decision of graduation eligibility.';
  const result=answer=>({answer:answer+'\n'+provenance,title:label,url:path});
  if(query.multipleScopes)return result(zh?'您同時指定了不同種類的畢業檢核報告。請一次選擇教務應用服務或舊版報告；本回覆尚未查選或合併紀錄。'
    :'You requested different graduation report kinds. Please choose Academic Services or legacy for one query; no records have been selected or merged for this reply.');
  if(matching.length>1)return result(zh?`${label}有多筆站內紀錄，無法確定應顯示哪一份；本回覆未合併或選取其中一份。`
    :`Multiple saved records match ${label}; this answer has not merged or selected one.`);
  if(!report){
    const otherKind=reportKind==='legacy'?'academic_services':'legacy',otherAvailable=owned.some(row=>row.reportKind===otherKind);
    return result((zh?`您的帳號尚未儲存${label}。這不表示您的校方紀錄為空。`:`Your account has no saved ${label}. This does not establish that your university records are empty.`)
      +(otherAvailable?(zh?`\n帳號另有${otherKind==='legacy'?'舊版（15-2）':'教務應用服務（13-1）'}報告，可至 ${graduationReviewPaths[otherKind]} 查看；兩種報告各自保存，不互相代用。`
        :`\nA separate ${otherKind==='legacy'?'legacy (15-2)':'Academic Services (13-1)'} report is available at ${graduationReviewPaths[otherKind]}. The report kinds are stored independently and are not substitutes.`):''));
  }
  const missing=zh?'未記錄':'not recorded',display=value=>value ?? missing;
  const flag=value=>value===null?missing:zh?(value==='passed'?'通過標示':'注意標示'):value;
  const lines=[zh?`報告種類：${label}`:`Report kind: ${label}`,zh?`報告記錄時間：${display(report.reportedAt)}`:`Report timestamp: ${display(report.reportedAt)}`];
  for(const [key,zhLabel,enLabel] of [['educationProgram','教育學程','Education program'],['foreignLanguageCompletion','外語課程','Foreign-language completion'],
    ['englishRequirement','英文門檻','English requirement'],['graduationReview','畢業審核','Graduation review']]) {
    const value=report[key];lines.push(zh?`報告所載 ${zhLabel}：${display(value.text)}；標示：${flag(value.indicator)}。`
      :`Report-stated ${enLabel}: ${display(value.text)}; indicator: ${flag(value.indicator)}.`);
  }
  if(report.graduationReview.note!==null)lines.push((zh?'報告備註：':'Report note: ')+report.graduationReview.note);
  if(/\b(?:credits?|requirements?|missing|gaps?|matched|completed|courses?|details?)\b|學分|要求|尚缺|符合|課程|明細/i.test(question)) {
    const details=report.categories.flatMap(category=>category.requirements.flatMap(row=>[
      {kind:'required',row:{...row,reportId:report.id,categoryId:category.id},categoryId:category.id},
      ...row.matchedCourses.map(matched=>({kind:'matched',row:{...matched,reportId:report.id,categoryId:category.id,requirementId:row.id},parent:row.title,categoryId:category.id})),
    ])).concat(report.otherCourses.map(row=>({kind:'other',row:{...row,reportId:report.id}})));
    const courseSelection=selectGraduationReviewCourses(question,{requirements:details.filter(item=>item.kind==='required').map(item=>item.row),
      matchedCourses:details.filter(item=>item.kind==='matched').map(item=>item.row),otherCourses:details.filter(item=>item.kind==='other').map(item=>item.row)});
    const namedTitles=graduationReviewNamedCourseTitles(question,details.map(item=>item.row.title));
    const named=details.filter(item=>namedTitles.has(item.row.title));
    const parentCategories=report.categories.filter(category=>named.some(item=>item.categoryId===category.id));
    const categoryScope=named.length?parentCategories:report.categories;
    const languages=named.length?[]:report.languageRequirements.slice(0,10),categories=categoryScope.slice(0,10);
    let clipped=(!named.length&&languages.length<report.languageRequirements.length) || categories.length<categoryScope.length;
    for(const item of languages)lines.push(zh?`${item.label}：應修 ${display(item.requiredCredits)}；符合 ${display(item.matchedCredits)}；尚缺 ${display(item.missingCredits)}；報告狀態 ${display(item.status.text)}。`
      :`${item.label}: required ${display(item.requiredCredits)}; matched ${display(item.matchedCredits)}; missing ${display(item.missingCredits)}; report status ${display(item.status.text)}.`);
    if(!named.length)lines.push(zh?`語言條件列：顯示 ${languages.length} / ${report.languageRequirements.length} 列。`
      :`Language rows shown: ${languages.length} of ${report.languageRequirements.length}.`);
    for(const item of categories) {
      lines.push(zh?`${item.label}：應修 ${display(item.requiredCredits)}；已修 ${display(item.completedCredits)}；符合 ${display(item.matchedCredits)}；不計入 ${display(item.excludedCredits)}；明細小計 ${display(item.detailSubtotalCredits)}；報告狀態 ${display(item.status.text)}。`
        :`${item.label}: required ${display(item.requiredCredits)}; completed ${display(item.completedCredits)}; matched ${display(item.matchedCredits)}; excluded ${display(item.excludedCredits)}; detail subtotal ${display(item.detailSubtotalCredits)}; report status ${display(item.status.text)}.`);
    }
    lines.push(named.length
      ? (zh?`名稱符合課程的所屬類別：顯示 ${categories.length} / ${categoryScope.length} 列。`:`Parent category rows for named courses shown: ${categories.length} of ${categoryScope.length}.`)
      : (zh?`課程類別列：顯示 ${categories.length} / ${report.categories.length} 列。`:`Category rows shown: ${categories.length} of ${report.categories.length}.`));
    if(/\b(?:courses?|details?|matched)\b|課程|明細|符合/i.test(question)) {
      const selectedRows=new Set([...courseSelection.requirements,...courseSelection.matchedCourses,...courseSelection.otherCourses]);
      const selected=details.filter(item=>selectedRows.has(item.row)),shown=selected.slice(0,20);
      if(courseSelection.courseScope==='required_course_rows_and_matches')lines.push(zh?'課程範圍：應修課程及其對應課程。':'Course scope: required courses and their matched courses.');
      if(courseSelection.courseScope==='matched_course_rows_and_parent_context')lines.push(zh?'課程範圍：對應課程及其所屬應修課程。':'Course scope: matched courses and their parent requirements.');
      if(courseSelection.courseScope==='other_course_rows')lines.push(zh?'課程範圍：其他實修課程。':'Course scope: other actual courses.');
      clipped ||= shown.length<selected.length || named.length>0 && named.length<details.length;
      for(const item of shown){
        const row=item.row;
        if(item.kind==='required')lines.push(zh?`應修課程 ${row.title}：學分 ${display(row.credits)}；模組 ${display(row.moduleText)}；標示 ${flag(row.indicator)}。`
          :`Required course ${row.title}: credits ${display(row.credits)}; module ${display(row.moduleText)}; indicator ${flag(row.indicator)}.`);
        else if(item.kind==='matched')lines.push(zh?`對應課程 ${row.title}：學分 ${display(row.credits)}；對應 ${item.parent}。`
          :`Matched course ${row.title}: credits ${display(row.credits)}; matched to ${item.parent}.`);
        else lines.push(zh?`其他實修課程 ${row.title}：學分 ${display(row.credits)}。`:`Other actual course ${row.title}: credits ${display(row.credits)}.`);
      }
      const shownNamed=shown.filter(item=>named.includes(item)).length;
      const shownParents=shown.filter(item=>item.kind==='required'&&!named.includes(item)).length;
      const shownLinkedMatches=shown.filter(item=>item.kind==='matched'&&!named.includes(item)).length;
      lines.push(named.length
        ? (zh?`名稱符合的課程列：顯示 ${shownNamed} / ${named.length} 列；另顯示 ${shownParents} 列所屬應修課程、${shownLinkedMatches} 列關聯對應課程；完整報告共有 ${details.length} 列課程明細。`
          :`Named course rows shown: ${shownNamed} of ${named.length} matches; ${shownParents} parent requirement rows shown; ${shownLinkedMatches} linked matched-course rows shown; the full report contains ${details.length} course-detail rows.`)
        : (zh?`課程明細列：顯示 ${shown.length} / ${selected.length} 列。`:`Course-detail rows shown: ${shown.length} of ${selected.length}.`));
    }
    if(clipped)lines.push(zh?`此回覆僅顯示部分報告列；完整資料保留於站內報告：${path}`
      :`This reply shows only part of the report; all saved rows remain available in the local report: ${path}`);
  }
  return result(lines.join('\n'));
}
