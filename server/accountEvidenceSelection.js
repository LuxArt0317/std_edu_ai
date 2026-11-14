import {schoolServiceEntries,schoolSubjectRecordsPath,studentServiceByKey} from '../src/features/public/affairs/studentServices.js';

const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const escapePattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const contains=(text,value)=>/^[a-z\d_ -]+$/i.test(value)
  ?new RegExp('(?<![a-z\\d_-])'+escapePattern(value)+'(?![a-z\\d_-])','iu').test(text)
  :text.includes(value);
// Canonical codes only for explicit term identifiers. Never infer a term from
// a date range, course code, or the order of the saved history.
export function academicTermCodes(value){
  const text=String(value??'').normalize('NFKC');
  const codes=new Set();
  for(const pattern of [
    /(?<![a-z\d_/-])(1\d{2})\s*[-–]\s*([1-3])(?![a-z\d_/-])/giu,
    /(?<!\d)(1\d{2})\s*學年(?:度)?\s*第?\s*([1-3])\s*學期/gu,
  ]){
    for(const match of text.matchAll(pattern))codes.add(match[1]+'-'+match[2]);
  }
  return [...codes];
}

function filterNamedTerms(rows,requestedTerms){
  return rows.filter(row=>academicTermCodes(row.term).some(code=>requestedTerms.includes(code)));
}

const allServices=question=>/\b(?:all|every) (?:of )?(?:my |the )?(?:saved |local )?(?:service |tracking )?(?:records?|notes?)\b|(?:全部|所有).{0,8}(?:服務|紀錄|記錄|備註)/i.test(question);
const allCourses=question=>/\b(?:all|every) (?:of )?(?:my |the )?(?:moodle |dtm )?(?:courses?|subjects?)\b|(?:全部|所有).{0,8}(?:課程|科目)/i.test(question);
const allAssignments=question=>/\b(?:all|every) (?:of )?(?:my |the )?(?:moodle |dtm )?(?:assignments?|tasks?)\b|(?:全部|所有).{0,8}(?:作業|任務)/i.test(question);
const fieldMatches=(row,question,fields)=>fields.some(key=>{
  const value=normalize(row[key]);
  return value.length>=3&&contains(normalize(question),value);
});
const referenceTokens=question=>[...new Set((String(question).normalize('NFKC').match(/\b[a-z][a-z\d]*-(?:[a-z\d]+-)*[a-z\d]+\b/gi)||[])
  .filter(value=>/\d/.test(value)))];
const matchesReference=(row,references)=>references.some(value=>contains(normalize([row.id,row.title,row.notes].filter(Boolean).join('\n')),normalize(value)));
const allowedServices=new Map(schoolServiceEntries.map(row=>[row.id,row]));
for(const key of ['leave','internship'])allowedServices.set(key,studentServiceByKey(key));
const aliases=[
  [/\b(?:learning.support|study.reward|learning.reward)\b|完善就學|學習輔導/i,['27-1']],
  [/\btutor (?:evaluation|feedback)\b|導師評量/i,['28-1']],
  [/\bcounsel(?:ing|ling)\b|psychological|諮商|心理測驗/i,['29-1']],
  [/\b(?:emergency|injury report)\b|緊急傷病/i,['30-1']],
  [/\b(?:equipment|item) (?:borrow|loan)|物品借用/i,['30-2']],
  [/\b(?:international.student|foreign.student).{0,25}(?:work|employ)|工作證|境外學生工作/i,['31-1']],
  [/\b(?:rental|renting|lease record)\b|租屋/i,['31-2']],
  [/\b(?:campus|school) service\b|愛校服務/i,['32-1']],
  [/\b(?:dormitory|dorm).{0,25}(?:reward|discipline)|宿舍獎懲/i,['34-2']],
  [/\b(?:group|student) insurance\b|團體保險/i,['35-1']],
  [/\b(?:health|medical) (?:exam|check|screen)|健檢|健診/i,['36-1']],
  [/\b(?:payroll|salary|assistant stipend|assistant scholarship)\b|獎助金薪資|兼任助理/i,['37-1']],
  [/\b(?:student|personal) (?:reward|discipline)|個人獎懲/i,['38-1']],
  [/\bleave\b|請假|假單/i,['leave']],
  [/\binternship\b|校外實習/i,['internship']],
];
const canonicalKey=key=>['20-1','33-1'].includes(key)?'leave':key==='53-1'?'internship':key;
const routeKey=route=>{
  const key=/^\/school-affairs\/services\/([^/?#]+)/.exec(String(route||''))?.[1];
  return key&&allowedServices.has(key)?canonicalKey(key):null;
};
function questionContext({question='',history=[]}={}){
  if(/^(?:and\b|what about\b|how about\b|what feedback\b|what (?:is|was) (?:it|its|the status)\b|那|還有|它)|評語呢/i.test(question.trim())){
    const previous=history.filter(row=>row.role==='user').at(-1)?.content;
    if(typeof previous==='string')return previous.slice(0,1000)+'\n'+question;
  }
  return question;
}
/** Explicit owners are filtered even if an upstream caller accidentally mixes snapshots. */
export function ownEvidenceRows(rows,userId){
  return Array.isArray(rows)?rows.filter(row=>row&&typeof row==='object'&&(!row.userId||row.userId===userId)&&(!row.user_id||row.user_id===userId)):[];
}
export function selectServiceRecords(snapshot,context={}){
  const question=questionContext(context),q=normalize(question),direct=[];
  for(const row of schoolServiceEntries){
    if([row.title,row.section].some(label=>label.length>=4&&q.includes(normalize(label))))direct.push(canonicalKey(row.id));
  }
  // Prefer an exact title to its broad shared section (for example insurance vs injury).
  const titleMatches=schoolServiceEntries.filter(row=>row.title.length>=4&&q.includes(normalize(row.title))).map(row=>canonicalKey(row.id));
  const aliasMatches=aliases.filter(([pattern])=>pattern.test(question)).flatMap(([,ids])=>ids);
  const explicitAll=allServices(question);
  let keys=explicitAll?[]:[...titleMatches,...aliasMatches];
  if(!keys.length&&!explicitAll)keys=direct;
  if(!keys.length&&!explicitAll){const current=routeKey(context.route);if(current)keys=[current];}
  keys=[...new Set(keys)].filter(key=>allowedServices.has(key));
  const owned=ownEvidenceRows(snapshot.serviceRecords,snapshot.profile?.userId).filter(row=>allowedServices.has(row.serviceKey));
  const scoped=keys.length?owned.filter(row=>keys.includes(canonicalKey(row.serviceKey))):owned;
  const requestedReferences=referenceTokens(question);
  const relevant=requestedReferences.length?scoped.filter(row=>matchesReference(row,requestedReferences)):scoped;
  const matching=prioritizeEvidenceRows(relevant,question,['id','title','notes'],{filterExact:!explicitAll});
  const selectedKeys=keys.length?keys:[...new Set(matching.map(row=>canonicalKey(row.serviceKey)))];
  const urls=selectedKeys.map(key=>allowedServices.get(key)?.localUrl).filter(Boolean);
  const primary=keys.length===1?allowedServices.get(keys[0]).localUrl:'/school-affairs/records';
  return {records:matching,url:primary,urls:[...new Set([primary,...urls])],selection:{
    serviceKeys:keys,resolvedServiceKeys:selectedKeys,explicitAll,
    requestedReference:requestedReferences[0]||null,requestedReferences,matchedReference:requestedReferences.length?matching.length>0:null,
    scope:keys.length?'selected_services':'all_saved_services',availableRows:owned.length,matchingRows:matching.length,
    note:'Local saved tracking records only. Notes and local status are not institutional decisions, payments, attendance or official submissions.',
  }};
}

/** Rank whole records before applying the evidence budget. Never splice row text. */
export function prioritizeEvidenceRows(rows,question,fields=['id','code','title'],{filterExact=false}={}){
  const q=normalize(question),tokens=(q.match(/[\p{L}\p{N}][\p{L}\p{N}_-]{3,}/gu)||[]).filter(token=>!['what','which','show','does','have','this','that','with','from','about','saved','records','record','course','please','information'].includes(token));
  const ranked=rows.map((row,index)=>{
    const values=fields.map(key=>normalize(row[key])).filter(Boolean);
    const exact=values.some(value=>value.length>=3&&contains(q,value));
    const text=values.join('\n');
    const exactReference=tokens.some(token=>/[\d_-]/.test(token)&&token.length>=3&&contains(text,token));
    return {row,index,strong:exact||exactReference,score:(exact?1000:0)+(exactReference?900:0)+tokens.reduce((total,token)=>total+(text.includes(token)?1:0),0)};
  });
  const matched=filterExact&&ranked.some(row=>row.strong)?ranked.filter(row=>row.strong):ranked;
  return matched.sort((a,b)=>b.score-a.score||a.index-b.index).map(({row})=>row);
}

const childrenFor=(course,key,userId)=>ownEvidenceRows(course[key],userId).filter(row=>
  ['courseId','course_id','dtmCourseId','dtm_course_id'].every(field=>!row[field]||row[field]===course.id));
const childFields={materials:['id','title'],meetings:['id','title','topic'],grades:['id','label','title']};
function ownedCourses(snapshot,userId){
  return ownEvidenceRows(snapshot.dtm?.courses,userId).map(course=>({...course,
    ...Object.fromEntries(Object.keys(childFields).map(key=>[key,childrenFor(course,key,userId)])),
  }));
}
function chooseCourses(courses,question,route,assignments=[],requestedTerms=[]){
  const explicit=courses.filter(row=>fieldMatches(row,question,['id','code','title']));
  if(requestedTerms.length)return {courses:filterNamedTerms(explicit.length?explicit:courses,requestedTerms),scope:'named_course_term'};
  if(explicit.length)return {courses:explicit,scope:'named_owned_courses'};
  const namedTerms=courses.filter(row=>row.term&&normalize(question).includes(normalize(row.term)));
  if(namedTerms.length)return {courses:namedTerms,scope:'named_course_term'};
  const year=/\b(1[0-9]{2})\s*(?:學年|academic year|school year)|(?:academic year|school year)\s*(1[0-9]{2})\b/i.exec(question);
  if(year){
    const semester=/\b(?:semester|term)\s*([1-3])\b|第([1-3])學期/i.exec(question);
    const prefix=(year[1]||year[2])+'學年度'+(semester?'第'+(semester[1]||semester[2])+'學期':'');
    return {courses:courses.filter(row=>row.term?.startsWith(prefix)),scope:'named_course_term'};
  }
  if(allCourses(question))return {courses,scope:'all_owned_courses'};
  const assignmentParents=new Set(assignments.filter(row=>fieldMatches(row,question,['id','title'])).map(row=>row.dtmCourseId));
  const children=courses.filter(course=>assignmentParents.has(course.id)||Object.entries(childFields).some(([key,fields])=>course[key].some(row=>fieldMatches(row,question,fields))));
  if(children.length){
    const routeMatches=children.filter(row=>row.id===route);
    return {courses:routeMatches.length?routeMatches:children,scope:'matching_owned_course_content'};
  }
  if(route)return {courses:courses.filter(row=>row.id===route),scope:'selected_course'};
  const personal=courses.filter(row=>row.sourceMode==='personal');
  return {courses:prioritizeEvidenceRows(personal.length?personal:courses,question),scope:'matching_owned_courses'};
}

export function selectAccountEvidence(snapshot,key,context={}){
  const question=questionContext(context),userId=snapshot.profile?.userId;
  if(key==='serviceRecords')return selectServiceRecords(snapshot,context);
  const dtmRoute=/^\/dtm\/course\/([a-zA-Z0-9-]+)/.exec(context.route||'')?.[1];
  if(key==='dtm'){
    const courses=ownedCourses(snapshot,userId),assignments=ownEvidenceRows(snapshot.assignments,userId);
    const direct=chooseCourses(courses,context.question||'',dtmRoute,assignments,context.courseTerms);
    const selected=question!==context.question&&['selected_course','matching_owned_courses'].includes(direct.scope)?chooseCourses(courses,question,dtmRoute,assignments):direct;
    return {records:{...snapshot.dtm,notices:prioritizeEvidenceRows(ownEvidenceRows(snapshot.dtm?.notices,userId),question,['id','title','body']),courses:selected.courses.map(row=>({...row,
      materials:prioritizeEvidenceRows(row.materials,question,['id','title','summary']),
      meetings:prioritizeEvidenceRows(row.meetings,question,['id','title','topic','notes']),
      grades:prioritizeEvidenceRows(row.grades,question,['id','label','title','feedback']),
    }))},selection:{scope:selected.scope,matchingRows:selected.courses.length}};
  }
  if(key==='assignments'){
    let rows=ownEvidenceRows(snapshot.assignments,userId);
    const courses=ownedCourses(snapshot,userId);
    const namedCourses=courses.filter(row=>fieldMatches(row,question,['id','code','title']));
    const explicitCourse=namedCourses.map(row=>row.id);
    const assignmentMatches=rows.filter(row=>fieldMatches(row,question,['id','title']));
    let scope='matching_owned_assignments';
    if(explicitCourse.length)rows=rows.filter(row=>explicitCourse.includes(row.dtmCourseId));
    else if(allAssignments(question)||allCourses(question))scope='all_owned_assignments';
    else if(assignmentMatches.length)rows=assignmentMatches;
    else {
      const selected=chooseCourses(courses,question,dtmRoute,rows),ids=new Set(selected.courses.map(row=>row.id));
      rows=rows.filter(row=>ids.has(row.dtmCourseId)||!row.dtmCourseId&&!dtmRoute);
      scope=selected.scope;
    }
    rows=prioritizeEvidenceRows(rows,question,['id','title','details','course'],{filterExact:scope!=='all_owned_assignments'});
    return {records:rows,selection:{scope,matchingRows:rows.length}};
  }
  if(Array.isArray(snapshot[key])){
    const owned=ownEvidenceRows(snapshot[key],userId);
    const namedTerms=key==='courses'&&context.courseTerms?.length;
    const scoped=namedTerms?filterNamedTerms(owned,context.courseTerms):owned;
    let rows=prioritizeEvidenceRows(scoped,question,['id','code','title','label','name','details']);
    let scope=namedTerms?'named_course_term':'ranked_owned_records';
    // The bounded user antecedent only selects among owned rows. It is not a
    // source of instructor/room facts. Reuse this selection for evidence and
    // visible record cards so a named follow-up never displays unrelated rows.
    const resolvedFollowup=key==='courses'&&typeof context.resolvedUserQuestion==='string'
      &&context.resolvedUserQuestion.length<=2000&&context.resolvedUserQuestion===context.question;
    const allCourseFollowup=/\b(?:all|every)\s+(?:(?:of|my|the|saved|current|enrolled|local|school|affairs)\s+){0,5}(?:courses?|subjects?|classes)\b|(?:全部|所有).{0,8}(?:課程|科目|修課)/iu.test(question);
    // A cohort plus a named example is a union, not a request for the example
    // alone. Preserve the existing term/cohort selection for independent review.
    const cohortCourseFollowup=/\b(?:current|historical|past|previous|completed|upcoming|future)\s+(?:courses|subjects|classes)\b|\b(?:courses|subjects|classes)\s+(?:(?:in|for|from|during)\s+)?(?:this|current|next|previous|last)\s+(?:term|semester)\b|(?:本學期|這學期|目前|歷史|過去|下學期|未來).{0,8}(?:課程|科目|修課)/iu.test(question);
    if(resolvedFollowup&&!allCourseFollowup&&!cohortCourseFollowup){
      const matching=prioritizeEvidenceRows(rows,question,['enrollmentId','id','code','title'],{filterExact:true});
      if(matching.length<rows.length){rows=matching;scope='named_course_followup';}
    }
    return {records:rows,...(key==='courses'?{url:schoolSubjectRecordsPath}:{}),selection:{
      scope,availableRows:owned.length,matchingRows:rows.length,
      ...(namedTerms?{requestedTerms:context.courseTerms}:{}),
    }};
  }
  return null;
}

/** Keep selected leaf records whole, with explicit omissions and UTF-8 limits. */
export function boundSelectedEvidence(selected,{key,budget}={}){
  if(!Number.isSafeInteger(budget)||budget<1024)throw new RangeError('Account evidence needs an integer byte budget of at least 1024.');
  const encoder=new TextEncoder(),size=value=>encoder.encode(JSON.stringify(value)).byteLength;
  const value={records:null,selection:selected.selection||{},excerpted:false,counts:[],
    rules:'Counts describe loaded owned records, not institutional completeness. Partial or omitted rows cannot establish absence. Included leaf records are whole; provenance and course lineage are preserved.'};
  const count=(collection,matchingRows,availableRows=matchingRows,parentId)=>{
    if(!Number.isSafeInteger(availableRows)||availableRows<matchingRows)throw new TypeError('Loaded evidence counts must be whole nonnegative counts covering the selected rows.');
    const row={collection,...(parentId?{parentId}:{}),availableRows,matchingRows,includedRows:0,partial:matchingRows>0};
    value.counts.push(row);return row;
  };
  const refresh=()=>{for(const row of value.counts)row.partial=row.includedRows<row.matchingRows;value.excerpted=value.counts.some(row=>row.partial);
    if(Array.isArray(value.records)&&value.counts[0]){value.availableRows=value.counts[0].availableRows;value.includedRows=value.counts[0].includedRows;}
  };
  const append=(rows,row,counters)=>{
    rows.push(row);for(const counter of counters)counter.includedRows++;refresh();
    if(size(value)<=budget)return true;
    rows.pop();for(const counter of counters)counter.includedRows--;refresh();return false;
  };
  if(Array.isArray(selected.records)){
    if(selected.selection?.matchingRows!==undefined&&selected.selection.matchingRows!==selected.records.length)throw new TypeError('Selected evidence count does not match its records.');
    value.records=[];
    const counts=count('records',selected.records.length,selected.selection?.availableRows??selected.records.length);
    refresh();if(size(value)>budget)throw new RangeError('Account evidence metadata exceeds its byte budget.');
    for(const row of selected.records)append(value.records,row,[counts]);
  }else if(key==='dtm'&&selected.records&&typeof selected.records==='object'){
    const {courses=[],notices=[],...metadata}=selected.records;
    if(selected.selection?.matchingRows!==undefined&&selected.selection.matchingRows!==courses.length)throw new TypeError('Selected course count does not match its records.');
    value.records={...metadata,courses:[],notices:[]};
    const courseCount=count('courses',courses.length),noticeCount=count('notices',notices.length);
    const childCounts=Object.fromEntries(Object.keys(childFields).map(collection=>[collection,count(collection,courses.reduce((total,course)=>total+(course[collection]?.length||0),0))]));
    refresh();if(size(value)>budget)throw new RangeError('DTM evidence metadata exceeds its byte budget.');
    const included=[];
    for(const course of courses){
      const {materials=[],meetings=[],grades=[],...identity}=course;
      const children={materials,meetings,grades};
      const returned={...identity,materials:[],meetings:[],grades:[]};
      const previousCount=value.counts.length;
      const counters=Object.fromEntries(Object.entries(children).map(([collection,rows])=>[collection,count(collection,rows.length,rows.length,course.id)]));
      if(append(value.records.courses,returned,[courseCount])){
        included.push({returned,children,counters});
        for(const [collection,rows] of Object.entries(children))if(rows.length)append(returned[collection],rows[0],[counters[collection],childCounts[collection]]);
      }
      else {value.counts.splice(previousCount);refresh();}
    }
    // Alternate collections so a large material history cannot consume every
    // byte before the first requested grade or meeting is considered.
    const length=Math.max(notices.length,...included.flatMap(({children})=>Object.values(children).map(rows=>rows.length)));
    for(let index=0;index<length;index++){
      if(index<notices.length)append(value.records.notices,notices[index],[noticeCount]);
      for(const {returned,children,counters} of included)for(const [collection,rows] of Object.entries(children)){
        if(index>0&&index<rows.length)append(returned[collection],rows[index],[counters[collection],childCounts[collection]]);
      }
    }
  }else throw new TypeError('A selected array or DTM evidence collection is required.');
  refresh();return value;
}
