import {isDeepStrictEqual} from 'node:util';
import {runAnswerVerification} from './answerVerification.js';
import {answerLinksSupported} from './answerVerificationModel.js';
import {loadDtmStudyRecords,parseDtmStudyRecords} from './dtmCourseResource.js';
import {studyCalendar} from './affairsSchedule.js';

const courseRoute=/^\/dtm\/course\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/meetings$/u;
const normalized=value=>value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu,' ');
const literal=value=>value.replace(/[\r\n]+/gu,' ').replace(/[\\<>`*_[\]()~#!|]/gu,'\\$&');
const sourceId='account:dtm';

export function dtmStudySelection(question,route){
  const path=route.replace(/\/$/u,'');
  const text=question.trim().replace(/\s+Use YYYY-MM-DD for dates\.$/u,'').replace(/[.?]$/u,'');
  if(text.length>300||/[;\r\n]/u.test(text))return null;
  if(path==='/dtm'||path==='/dtm/dashboard'||path==='/dtm/my'){
    const term=/^(?:list|show) my (?:moodle|dtm) (?:subjects|courses) (?:for|in) academic year\s*([1-9]\d{0,3})\s+semester\s*([123])$/iu.exec(text);
    if(term)return {kind:'term',courseId:null,term:term[1]+'學年度第'+term[2]+'學期'};
    const role=/^what is my role in ([^?!]+) on (?:moodle|dtm)$/iu.exec(text);
    if(role&&!/\b(?:and|also|plus)\b/iu.test(role[1]))return {kind:'role',courseId:null,name:role[1]};
    return null;
  }
  const courseId=courseRoute.exec(path)?.[1];
  if(!courseId)return null;
  const next=/^when is my next (?:moodle|dtm) meeting in ([^?!]+)$/iu.exec(text);
  if(next&&!/\b(?:and|also|plus)\b/iu.test(next[1]))return {kind:'next',courseId,name:next[1]};
  for(const [kind,pattern] of [['notes',/^what did i record about ([^?!]+) on\s*(20\d\d-\d\d-\d\d)$/iu],
    ['absence',/^was i marked absent for ([^?!]+) on\s*(20\d\d-\d\d-\d\d)$/iu]]){
    const named=pattern.exec(text);
    if(named&&!/\b(?:and|also|plus)\b/iu.test(named[1]))return {kind,courseId,name:named[1],date:named[2]};
  }
  return null;
}

function render(selection,value,at){
  const {courses,courseTotal,meetings,meetingTotal}=value;
  const url=selection.courseId&&courses.length?'/dtm/course/'+selection.courseId+'/meetings':'/dtm';
  const ownedCourses=courses.some(course=>course.source_mode==='personal')?courses.filter(course=>course.source_mode==='personal'):courses;
  let body,degraded=false;
  const href=(title,path)=>'['+literal(title)+']('+path+')';
  const links=new Set([url]);
  const courseLink=course=>{
    const path='/dtm/course/'+course.id;
    links.add(path);
    return href(course.title,path);
  };
  if(courseTotal!==courses.length||meetingTotal!==meetings.length){
    body='This saved Moodle view is incomplete. Open the record page to see more results.';
    degraded=true;
  }else if(selection.kind==='term'){
    const selected=ownedCourses.filter(course=>normalized(course.term).replace(/\s/gu,'')===selection.term);
    body=selected.length?selected.map(course=>'- '+courseLink(course)+' · '+literal(course.term)
      +(course.source_mode==='sample'?' (sample)':'')).join('\n'):'There are no saved Moodle subjects for '+selection.term+'.';
  }else if(selection.kind==='role'){
    const selected=ownedCourses.filter(course=>normalized(course.title)===normalized(selection.name)||normalized(course.code)===normalized(selection.name));
    if(selected.length===1){
      const course=selected[0];
      body=courseLink(course)+' · Role: '+course.role+(course.source_mode==='sample'?' (sample)':'')+'.';
    }else body=selected.length?'More than one saved course matches. Open Moodle to choose the exact course.':'No saved Moodle course matches that name.';
  }else if(!courses.length||selection.kind==='next'&&![courses[0].title,courses[0].code].some(name=>normalized(name)===normalized(selection.name))){
    body='The selected Moodle course could not be matched to a saved course for this account.';
    degraded=true;
  }else {
    const course=courses[0],dateTime=row=>Date.parse(row.meeting_on+'T'+row.starts_at+'+08:00');
    const candidates=selection.kind==='next'?meetings.filter(row=>!row.starts_at.startsWith('00:00:00')&&dateTime(row)>at).sort((a,b)=>dateTime(a)-dateTime(b))
      :meetings.filter(row=>row.meeting_on===selection.date&&normalized(row.title)===normalized(selection.name));
    const row=selection.kind==='next'||candidates.length===1?candidates[0]:null;
    const today=selection.kind==='next'?studyCalendar([],new Date(at).toISOString()).day:null;
    const missingStart=today&&meetings.some(item=>item.starts_at.startsWith('00:00:00')
      &&item.meeting_on>=today&&(!row||item.meeting_on<=row.meeting_on));
    if(missingStart){body='A saved meeting has no usable start time. The next meeting cannot be established.';degraded=true;}
    else if(!row)body=candidates.length?'More than one saved meeting matches that title and date. Open the meeting list to choose one.':'No saved meeting matches that request.';
    else {
      const path=url+'#meeting-'+row.id;
      links.add(path);
      const label=href(row.title,path)+' · '+row.meeting_on;
      body=selection.kind==='notes'?label+' · Notes: '+(row.notes.trim()?literal(row.notes):'No meeting notes are saved.')
        :selection.kind==='absence'?label+' · Attendance: '+(row.attendance==='unknown'?'not recorded':row.attendance)+'.'
        :label+' · '+row.starts_at.slice(0,5)+' Taipei time.';
    }
    if(course.source_mode==='sample')body+=' This course uses sample records.';
  }
  const answer='From your saved stu.best Moodle records.\n\n'+body+'\n\n'+href('Open Moodle records',url);
  if(!answerLinksSupported(answer,[{id:sourceId,url,urls:[...links]}]))return null;
  return {status:'answered',answer,citations:[{chunkId:sourceId,title:'Saved Moodle records',claim:'Selected Moodle records',
    sourceName:'My stu.best records',url,locator:null,effectiveAt:null,reviewedAt:new Date(at).toISOString()}],
    suggestedQuestions:[],views:[],grounding:{source:'account',webSearched:false,checkedAt:new Date(at).toISOString(),degraded}};
}

export async function answerDtmStudyRecords({account,selection,question,route,deadline,onProgress}){
  if(!isDeepStrictEqual(selection,dtmStudySelection(question,route)))throw Error('Invalid Moodle record selection.');
  const at=Date.now(),observed=new Map();
  const emit=value=>{observed.set(value.kind,value);onProgress?.(value);};
  let source=null;
  async function read(attempt){
    try{
      source=await loadDtmStudyRecords({...account,requestDeadline:deadline},selection.courseId);
      emit({kind:'account-read:dtm:'+attempt,label:'Checked saved Moodle records',detail:'Read the owned course or its selected meeting list.',status:'complete'});
      return [source];
    }catch(error){
      source=null;
      emit({kind:'account-read:dtm:'+attempt,label:'Moodle records unavailable',detail:'The scope could not be checked.',status:'unavailable'});
      throw error;
    }
  }
  try{await read(1);}catch{/* The graph rechecks the same scope once if the read fails. */}
  function answer(evidence){
    if(evidence.length!==1||!isDeepStrictEqual(evidence[0],source))return null;
    return render(selection,parseDtmStudyRecords(evidence[0],account.user.id,selection.courseId),at);
  }
  const withheld={status:'abstained',answer:'',citations:[],views:[]};
  const result=await runAnswerVerification({question,deadline,onProgress:emit,initialAnswer:source?answer([source])??withheld:withheld,hasLocalCorrection:true,
    loadEvidence:({attempt})=>attempt===1?(source?[source]:[]):read(attempt),
    verify({candidate,evidence}){
      const rebuilt=answer(evidence);
      if(!rebuilt||!isDeepStrictEqual(candidate,rebuilt))return {ok:false,reason:'evidence_unavailable'};
      emit({kind:'dtm-study-evidence-check',label:'Verified saved Moodle records',detail:'Matched the selected fields and page link to the caller-owned read.',status:'complete'});
      return {ok:true};
    },
    repair:({evidence})=>answer(evidence)??withheld,
  });
  return {...result,views:result.views??[],activity:[...observed.values()]};
}
