// Pure, browser-safe ownership qualification for the narrow current-study read.
// This is not authorization: callers still authenticate and filter every read.
const current = /\b(?:current|currently|this (?:term|semester))\b|本學期|這學期|目前/u;
const course = /\b(?:courses?|subjects?|classes)\b|課程|科目|修課|課/u;
const otherDomain = /\b(?:tuition|fees?|balance|payments?|grades?|gpa|credits?|scores?|attendance|assignments?|homework|next|today|tomorrow|schedule|timetable|teacher|instructor|room|housing|dormitory|scholarship|aid|salary|leave|health|year|profile|records?|details|information|catalog|syllabus|moodle|dtm)\b|學費|費用|餘額|成績|學分|出席|作業|下堂|下一堂|今天|明天|課表|老師|教室|宿舍|助學|薪資|請假|健檢|年級|資料|教材網|數位教材/u;
const relation = /\bmy\s+(?:friend|colleague|classmate|student|teacher|mother|father|parent|sister|brother|partner|child|son|daughter)(?:\b|['’])|我(?:的)?(?:朋友|同學|學生|老師|母親|父親|媽媽|爸爸|姐姐|姊姊|妹妹|哥哥|弟弟|同事|孩子)/u;
const yearTopic = /\byear\s+level\b|\b(?:what|which)\s+(?:(?:school|study|student|recorded|current)\s+)*year\b|\b(?:my|your|his|her|their)\s+(?:(?:recorded|current|study|student)\s+)*year\b|年級/u;

function text(value) {
  return typeof value === 'string' && value.length <= 2000
    && ![...value].some(character=>/\p{Cc}/u.test(character)&&!['\t','\n','\r'].includes(character)) ? value.trim() : '';
}
function normalized(value) { return value.normalize('NFKC').replace(/[‘’]/gu,"'").toLowerCase(); }
function clauses(value) {
  return value.split(/\s+(?:and|also|plus|alongside)\s+|[;；?!？！。\n，,]|\.(?=\s|$)|以及|還有|並且|而且|和|與/iu).map(part=>part.trim()).filter(Boolean);
}
function negated(value) { return /\b(?:not|never|without|exclude|excluding|skip|don't|do not)\b|不要|別(?:顯示|查|讀)|不(?:要|需|查|顯示)|排除/u.test(value); }
function ownYear(value) {
  if (negated(value) || relation.test(value)) return false;
  return /\b(?:what|which)\s+(?:(?:school|study|student|recorded|current)\s+)*year(?:\s+level)?\s+(?:am\s+i|i\s+am)\b|\bmy\s+(?:(?:recorded|current|school|study|student)\s+)*year(?:\s+level)?\b|\byear(?:\s+level)?\s+(?:(?:is|currently)\s+)*(?:recorded\s+)?for\s+(?:me|myself)\b/u.test(value)
    || /(?:^|\s)(?:(?:請問|請顯示|顯示|查看|告訴我)\s*)?(?:我(?:本人|自己)?(?:的)?|本人|自己)(?:目前|現在|就讀|在讀|已記錄|紀錄中|是|為|讀|的|幾|哪個|哪一個|第|\s){0,12}年級/u.test(value);
}
function foreignSubject(value) {
  const subject=value.trim().replace(/[?.!。？！]+$/u,'');
  if (/^(?:i|me|myself)(?:\s|$)|^(?:recorded|saved|current|this|academic|school|semester|term|the (?:current|recorded|saved|academic|school|semester|term|university)|year|level)\b/u.test(subject)) return false;
  if (/^(?:the\s+)?(?:spring|summer|fall|autumn|winter)\s+(?:semester|term|quarter|\d{3,4})(?:\s|$)|^\d{3,4}(?:\s+(?:(?:academic|school)\s+)?(?:year|term|semester))?$/u.test(subject)) return false;
  return /^(?:you|he|she|they|him|her|them|another|other|someone|my (?:friend|colleague|classmate|student|teacher|mother|father|parent|sister|brother|partner|child|son|daughter))\b/u.test(subject)
    || /^(?:(?:student|user|account)\s+(?:id\s*)?)?[a-z\p{L}\d][\p{L}\p{N}_-]*(?:\s+[\p{L}\p{N}_-]+){0,3}(?:\s|$)/u.test(subject);
}
function foreignYear(value) {
  // An explicitly excluded foreign subject must never fall back to an own-year
  // read. The caller may still answer an independent, explicitly owned course.
  if (!yearTopic.test(value)) return false;
  if (relation.test(value) || /\b(?:your|his|her|their)\s+(?:(?:recorded|current|school|study|student)\s+)*year(?:\s+level)?\b/u.test(value)) return true;
  if (/\b[\p{L}\p{N}_-]+(?:'s|')\s+(?:(?:recorded|current|school|study|student)\s+)*year(?:\s+level)?\b/u.test(value)) return true;
  const predicate=/\b(?:what|which)\s+(?:(?:school|study|student|recorded|current)\s+)*year(?:\s+level)?\s+(?:is|are|was)\s+(.+)$/u.exec(value);
  if (predicate && foreignSubject(predicate[1])) return true;
  const postfix=/\byear(?:\s+level)?(?:\s+(?:is|currently|recorded|saved))*\s+(?:for|of|belonging to)\s+(.+)$/u.exec(value);
  if (postfix && foreignSubject(postfix[1])) return true;
  if (/\bfor\s+(?:student|user|account)\s+(?:id\s*)?[\p{L}\p{N}_-]*\d[\p{L}\p{N}_-]*\b/u.test(value)) return true;
  if (/(?:他們|她們|他|她|你|您|別人|他人|另一位學生|其他學生).{0,20}年級/u.test(value)) return true;
  const chinese=value.replace(/^(?:請問|請顯示|顯示|查看|告訴我)\s*/u,'');
  const subject=/^([\p{Script=Han}\p{L}\p{N}_-]{1,20}?)(?:(?:目前|現在)?(?:是|為|在讀|就讀)|的(?:目前|現在|已記錄)?|(?=幾年級))(?:幾|哪個|哪一個|第)?年級/u.exec(chinese)?.[1];
  return Boolean(subject&&!/^(?:我|我本人|我自己|本人|自己)$/u.test(subject));
}
function ownCurrentCourses(value) {
  if (!course.test(value)||!current.test(value)||otherDomain.test(value)||relation.test(value)||negated(value)) return false;
  return /\bmy\s+(?:(?:current|currently|saved|school|enrolled|this|term|semester)\s+)*(?:courses?|subjects?|classes)\b|\b(?:courses?|subjects?|classes)\s+(?:(?:do|did|can)\s+)?i\b/u.test(value)
    || /我(?:本人|自己)?(?:的)?(?:這學期|本學期|目前|現在).{0,20}(?:課程|科目|修課|課)/u.test(value);
}
function foreignCurrentCourses(value) {
  if (!course.test(value)||!current.test(value)) return false;
  if (relation.test(value)||/\b(?:their|his|her|your)\s+(?:current\s+)?(?:courses?|subjects?|classes)\b|\b[\p{L}\p{N}_-]+(?:'s|')\s+(?:current\s+)?(?:courses?|subjects?|classes)\b/u.test(value)) return true;
  const owner=/\b(?:for|of|belonging to)\s+(.+)$/u.exec(value)?.[1];
  return Boolean(owner&&foreignSubject(owner));
}

const courseListRequests=[
  /^(?:please )?(?:list|show(?: me)?|tell me) my (?:current (?:term |semester )?)?(?:courses?|subjects?|classes)(?: (?:in |for |during )?this (?:term|semester))?$/u,
  /^(?:please )?(?:what|which) (?:courses?|subjects?|classes) (?:do i have|am i taking) (?:in |for |during )?this (?:term|semester)$/u,
  /^(?:請)?(?:列出|顯示|告訴我)我(?:的)?(?:這學期|本學期|目前)(?:的)?(?:課程|科目|修課)$/u,
  /^我(?:的)?(?:這學期|本學期|目前)(?:有|修)(?:哪些|哪幾門)(?:課程|科目|課)$/u,
];
const yearRequests=[
  /^(?:what|which) year(?: level)? (?:am i|i am)(?: currently)?(?: in| at)?$/u,
  /^(?:(?:please )?(?:list|show(?: me)?|tell me) |what is )my (?:current |recorded )?year(?: level)?$/u,
  /^我(?:目前|現在)?(?:是|讀)?幾年級$/u,
];
const interviewRequests=[
  /^(?:then |please )*(?:help me (?:to )?)?(?:draft|write|prepare|practi[cs]e) (?:an? )?(?:(?:honest|short|brief|practice|sample) )*(?:(?:job )?interview (?:answer|introduction|example)|self[- ]introduction|answer about why i (?:could be|want to be) (?:an? )?(?:software engineer|software developer|developer))$/u,
  /^(?:再|然後)?(?:請)?幫我(?:準備|草擬|練習|撰寫)(?:一段|一個)?(?:簡短|誠實|真實)?(?:的)?(?:面試回答|面試自我介紹|自我介紹|面試例子)$/u,
];

/** One explicit current-course list, optional own year, and one standalone
 * interview wording request. Extra subjects keep their regular routing. */
export function currentStudyCoachingQuestion(question) {
  const input=text(question);
  if(!input)return null;
  const parts=clauses(input);
  if(parts.length<2||parts.length>3)return null;
  let courses='',year='',coachingQuestion='';
  for(const part of parts){
    const value=normalized(part);
    if(!courses&&ownCurrentCourses(value)&&courseListRequests.some(pattern=>pattern.test(value))){courses=part;continue;}
    if(!year&&ownYear(value)&&!foreignYear(value)&&yearRequests.some(pattern=>pattern.test(value))){year=part;continue;}
    if(!coachingQuestion&&interviewRequests.some(pattern=>pattern.test(value))){coachingQuestion=part;continue;}
    return null;
  }
  if(!courses||!coachingQuestion)return null;
  const zh=/\p{Script=Han}/u.test(courses);
  return {recordQuestion:year?(zh?'我這學期有哪些課？我目前是幾年級？':'What courses do I have this semester and what year am I currently in?')
    :(zh?'我這學期有哪些課？':'What courses do I have this semester?'),
    scope:year?'courses_and_year':'courses',coachingQuestion};
}

/** True only when the year request itself is first-person, not a nearby course. */
export function currentStudyOwnYearClause(question) {
  const input=text(question);
  if (!input) return false;
  const parts=clauses(input).map(normalized),years=parts.filter(part=>yearTopic.test(part));
  return years.length>0&&years.every(part=>ownYear(part)&&!foreignYear(part));
}

/** Keep only an explicit own-current-course clause beside a foreign-year ask.
 * A pure foreign-year question has an empty courseQuestion and needs no read.
 * Any additional domain or unrecognized clause prevents this narrow rewrite.
 */
export function currentStudyForeignYearQuestion(question) {
  const input=text(question);
  if (!input) return null;
  const parts=clauses(input),courseParts=[];
  let foreign=false,foreignCourse=false;
  for (const part of parts) {
    const value=normalized(part);
    if (foreignYear(value)) { foreign=true; continue; }
    if (foreignCurrentCourses(value)) { foreignCourse=true; continue; }
    if (ownCurrentCourses(value)) { courseParts.push(part); continue; }
    return null;
  }
  return foreign&&courseParts.length<=1 ? {courseQuestion:foreignCourse?'':courseParts[0]??''} : null;
}
