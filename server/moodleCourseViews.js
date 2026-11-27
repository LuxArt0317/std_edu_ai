import {readLibrary,libraryEnabled} from './local-dtm/store.js';
/** Cards contain literal API records, never marks extracted from generated prose. */
export function moodleCourseViews(evidence,courseIds=[],answer=''){
 const rows=new Map();let available=0;
 for(const source of evidence||[])try{
  const body=JSON.parse(source.content);const courses=body.data?.courses;
  if(!Array.isArray(courses))continue;
  for(const c of courses){
   if(typeof c.id!=='string'||!/^\d{1,12}$/.test(c.id)||typeof c.title!=='string'||typeof c.term!=='string'||c.url!=='/dtm/course/import-'+c.id+'/grades')continue;
   available++;
   const mentioned=answer&&[c.title.split(' - ')[0],c.title.split(' - ')[0].replace(/\s*[(（]全英語授課[)）]/gu,'').trim(),c.code].some(v=>typeof v==='string'&&v.length>=3&&answer.normalize('NFKC').toLowerCase().includes(v.normalize('NFKC').toLowerCase()));
   if(courseIds.length?!courseIds.includes(c.id):answer&&!mentioned)continue;
   rows.set(c.id,[c.title,c.term,c.gradeText??'',c.rangeText??'',c.percentageText??'',c.url,c.code??'']);
  }
 }catch{/* Unrelated evidence is not a course presentation. */}
 if(!rows.size||!courseIds.length&&!answer&&available>1)return [];
 return [{id:'moodle-courses',title:'Moodle subjects',url:'/dtm',columns:['Subject','Term','Moodle total','Range','Percentage','Report','Code'],rows:[...rows.values()].slice(0,60),total:rows.size,checkedAt:new Date().toISOString(),note:'Literal Moodle report values. A blank or dash is not a zero grade.'}];
}

/** The same presentation adapter also covers the established grade-reader path. */
export async function presentMoodleReply(account,payload,read=readLibrary){
 if(!libraryEnabled()||payload?.verification?.status!=='verified'||payload?.views?.some(v=>v.id==='moodle-courses')||!payload.citations?.some(c=>/^(?:https:\/\/stu\.best)?\/dtm(?:\/|$)/.test(c.url||'')))return payload;
 try{const data=await read(account,{view:'grades'});const views=moodleCourseViews([{content:JSON.stringify({data})}],[],payload.answer);return views.length?{...payload,views:[...views,...(payload.views||[]).filter(v=>v.id!=='dtmGradeReport')].slice(0,3)}:payload;}catch{return payload;}
}
