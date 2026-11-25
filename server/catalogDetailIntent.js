const catalogPath='/school-affairs/services/12-4';
const syllabusPath='/school-affairs/services/12-3';
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const catalogFilters=new Set(['course','syllabus','yr','dep','ref1','admissionType','credit','grd','prog','required','e_course','english_taught','foreign_language','immersion','keyword','instructor','weekdays','periods','page','sort','direction']);
const syllabusFilters=new Set(['syllabus','search_scope','keyword','term','department','themes','searched']);
const unsafe=/[\u0000-\u001f\u007f\ud800-\udfff]/u;

export function catalogDetailRoute(value){
  if(typeof value!=='string'||value.length>3100||!value.startsWith('/school-affairs/')||/[\s\\#]/u.test(value))return null;
  const [rawPath,search,...remaining]=value.split('?');
  if(!search||remaining.length)return null;
  const path=rawPath.replace(/\/$/u,'');
  if(![catalogPath,syllabusPath].includes(path))return null;
  try{if(unsafe.test(decodeURIComponent(search)))return null;}catch{return null;}
  const params=new URLSearchParams(search),allowed=path===syllabusPath?syllabusFilters:catalogFilters;
  if([...params].some(([key,part])=>!allowed.has(key)||params.getAll(key).length!==1||[...part].length>160))return null;
  const syllabus=params.get('syllabus'),course=params.get('course');
  if(Boolean(syllabus)===Boolean(course)||params.has('syllabus')&&params.has('course'))return null;
  const id=(syllabus??course)?.toLowerCase();
  if(!idPattern.test(id??''))return null;
  // Originating search filters do not select or establish facts about a detail.
  return {id,syllabus:syllabus!==null,path:path+'?'+new URLSearchParams({[syllabus?'syllabus':'course']:id})};
}

export function catalogDetailGuestRoute(value){
  if(typeof value!=='string')return '';
  const login='/school-affairs/login?';
  if(!value.startsWith(login))return catalogDetailRoute(value)?.path??'';
  const params=new URLSearchParams(value.slice(login.length));
  return params.size===1?catalogDetailRoute(params.get('next'))?.path??'':'';
}

const subjects=/\b(?:(?:this|the open|the selected|this published|this local|this sample) (?:catalog )?(?:course|offering|syllabus)|(?:for|of|about) it|its)\b|\bwho (?:teaches|is teaching) this[?!.]*$|(?:這門|這個|此門|本)(?:課程|課|開課|課綱)|這份課綱/iu;
const catalogId=new RegExp(idPattern.source.slice(1,-1),'giu');
const identity=/\b(?:prove|confirm|establish|imply|verify)\b.{0,36}\b(?:enroll(?:ed|ment)|registered)\b|(?:證明|代表|確認).{0,20}(?:選課|修課)/iu;
const other=/\b(?:another|other student|my (?:current |past )?(?:grades?|scores?|classes?|courses?|subjects?|schedule|timetable|gpa|assignments?|credits?|attendance)|tuition|charges?|fees?|balance|assignments?|homework|Moodle|DTM|leave record|next class|last semester|other course)\b|學費|欠費|餘額|我的(?:學分|成績|課表|作業)|下堂課|其他課程|教材網|請假/iu;
const read=/^(?:what|who|how (?:many|much|is|will)|which|does|is|show|list|tell me|for (?:the )?(?:published|this) (?:catalog|course|syllabus)|please (?:show|list|tell me)|有哪些|是誰|多少|有幾|這|此|本|請(?:說明|列出|問))/iu;

const fields=Object.freeze({
  course_name:/\b(?:course (?:name|title)|name|title)\b|課程名稱|課名/iu,
  course_code:/\b(?:course code|code)\b|課程代碼|課號/iu,
  instructor:/\b(?:instructors?|teachers?|who (?:is teaching|teaches|will teach))\b|教師|老師|誰教|授課老師/iu,
  credits:/\bcredits?\b|學分/iu,
  prerequisite:/\bprerequisites?\b|先修/iu,
  grading:/\b(?:grading (?:breakdown|weights?|percentages?|rows?)|assessment weights?|weights? (?:for|in|does)|how (?:is|will) .{1,45} graded)\b|評分(?:標準|比例)|配分/iu,
  objectives:/\b(?:learning |teaching )?objectives?\b|教學目標|學習目標/iu,
  language:/\b(?:language of instruction|teaching language|what language)\b|授課語言/iu,
});

export function catalogDetailIntent(question,route){
  if(typeof question!=='string'||question.length>330||unsafe.test(question))return null;
  const text=question.normalize('NFKC').trim();
  if(!read.test(text)||other.test(text)||/[;；]|[.!?。？！]\s*\S/u.test(text))return null;
  const target=catalogDetailRoute(route);
  if(!target)return null;
  const ids=[...new Set([...text.matchAll(catalogId)].map(match=>match[0].toLowerCase()))];
  if(ids.some(id=>id!==target.id)||!subjects.test(text)&&!ids.length)return null;
  const enrollment=identity.test(text);
  const row=/\bgrading row\s+(\d+)\b|第\s*(\d+)\s*項(?:評分|配分)/iu.exec(text);
  const gradingRow=row?Number(row[1]??row[2]):null;
  if(gradingRow!==null&&(gradingRow<1||gradingRow>4))return null;
  const requested=Object.keys(fields).filter(key=>fields[key].test(text));
  if(!requested.length&&!enrollment&&!/^(?:what|which) published (?:course )?offering\b/iu.test(text))return null;
  return {...target,fields:requested,gradingRow,enrollment};
}
