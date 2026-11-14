import {teachingFeedbackPaths} from './teachingFeedbackContract.js';

const viewKeys=Object.freeze(['survey','immediate']);
const states=Object.freeze(['ok','empty','partial','unavailable']);
const counterKeys=['returned','matching','included','omitted','total','totalLowerBound','nativeLimit','capReached'];
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>isObject(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const text=(value,max,allowBlank=false)=>typeof value==='string'&&(allowBlank||value.trim().length>0)&&[...value].length<=max
  &&!/[\p{Cc}\p{Cs}]/u.test(value.replace(/[\r\n\t]/gu,''));
const instant=value=>typeof value==='string'&&value.length<=40&&/^\d{4}-\d{2}-\d{2}T/u.test(value)&&Number.isFinite(Date.parse(value));

function validateCounter(counter,rows,limit,unavailable,inheritedCap=false){
  if(!exact(counter,counterKeys)||counter.nativeLimit!==limit||counter.included!==rows)return false;
  if(unavailable)return rows===0&&['returned','matching','omitted','total','totalLowerBound','capReached'].every(key=>counter[key]===null);
  if(!integer(counter.returned)||!integer(counter.matching)||counter.matching>counter.returned||counter.matching<rows
    ||counter.omitted!==counter.matching-rows||(limit!==null&&counter.returned>limit))return false;
  const capped=limit===null?inheritedCap:counter.returned===limit;
  return counter.capReached===capped&&counter.total===(capped?null:counter.returned)&&counter.totalLowerBound===counter.returned;
}

function matchesCourse(row,course){
  return course===null||(!course.code||course.code===row.code)&&(!course.title||course.title===row.course);
}
function validCourse(row,selector,completion=false){
  return exact(row,['course','code','term','section',...(completion?['completed']:[])])
    &&text(row.course,600,true)&&text(row.code,80,true)&&text(row.term,200,true)&&text(row.section,80,true)
    &&(!completion||typeof row.completed==='boolean')&&matchesCourse(row,selector);
}
function validSurveyRows(rows,selector){
  return rows.every(row=>exact(row,['term','phase','opensAt','closesAt','state','courses'])
    &&text(row.term,200,true)&&['midterm','final'].includes(row.phase)&&['scheduled','open','closed'].includes(row.state)
    &&instant(row.opensAt)&&instant(row.closesAt)&&Date.parse(row.closesAt)>Date.parse(row.opensAt)
    &&Array.isArray(row.courses)&&row.courses.every(item=>validCourse(item,selector,true)&&item.term===row.term));
}
function validImmediateRows(rows,selector,commentRequested){
  return rows.every(row=>exact(row,['course','code','term','status','submittedAt','reviewedAt',...(commentRequested?['comment']:[])])
    &&text(row.course,600,true)&&text(row.code,80,true)&&text(row.term,200,true)&&instant(row.submittedAt)
    &&(row.status==='submitted'?row.reviewedAt===null:row.status==='reviewed'&&instant(row.reviewedAt))
    &&(!commentRequested||text(row.comment,2000))&&matchesCourse(row,selector));
}

/** Verify the reader-to-formatter boundary independently of the raw RPC parser. */
export function validateTeachingFeedbackAnswerEvidence(envelope,payload){
  const {evidence}=envelope,selection=payload.selection,capability=payload.capability,provenance=payload.provenance;
  if(!exact(payload,['collection','checkedAt','selection','readState','complete','views','provenance','capability','rules'])
    ||payload.collection!=='teachingFeedback'||payload.readState!==envelope.readState||!states.includes(payload.readState)
    ||typeof payload.complete!=='boolean'||!instant(payload.checkedAt)||!text(payload.rules,4000)||!Array.isArray(payload.views))return false;
  if(selection!==null&&(!exact(selection,['views','commentRequested','course'])||typeof selection.commentRequested!=='boolean'
    ||!Array.isArray(selection.views)||!selection.views.length||selection.views.some(value=>!viewKeys.includes(value))
    ||new Set(selection.views).size!==selection.views.length||selection.commentRequested&&!selection.views.includes('immediate')))return false;
  if(payload.views.length!==(selection?.views.length??0)||selection===null&&!text(envelope.reason,120))return false;
  const selector=selection?.course??null;
  if(selector!==null&&(!isObject(selector)||!Object.keys(selector).length||Object.keys(selector).some(key=>!['code','title'].includes(key)||!text(selector[key],key==='code'?80:600))))return false;
  if(!exact(provenance,['sourceMode','officialUniversityData','synchronized'])||provenance.sourceMode!=='saved_local'
    ||provenance.officialUniversityData!==false||provenance.synchronized!==false||evidence.provenance!=='saved_local'
    ||!exact(capability,['surveyCompletion','immediateStatus','immediateComment','anonymousSurveyAnswers','identity','managerResults','write'])
    ||capability.surveyCompletion!==true||capability.immediateStatus!==true||capability.immediateComment!==(selection?.commentRequested===true)
    ||['anonymousSurveyAnswers','identity','managerResults','write'].some(key=>capability[key]!==false))return false;
  const paths=(selection?.views??[]).map(view=>teachingFeedbackPaths[view]);
  if(!Array.isArray(evidence.urls)||evidence.urls.length!==paths.length||evidence.urls.some((path,index)=>path!==paths[index])
    ||evidence.url!==(paths[0]??teachingFeedbackPaths.survey))return false;
  let loaded=0,nonempty=0,incomplete=0;
  for(const [index,view] of payload.views.entries()){
    const mode=selection.views[index],survey=mode==='survey';
    const keys=survey?['surveys']:['courses','feedback'];
    if(!exact(view,['view','readState','reason','complete','counts',...keys])||view.view!==mode||!states.includes(view.readState)
      ||typeof view.complete!=='boolean'||!(view.reason===null||text(view.reason,120))||keys.some(key=>!Array.isArray(view[key])))return false;
    const unavailable=view.readState==='unavailable',counts=view.counts;
    if(survey){
      if(!exact(counts,['surveys','courseCompletions'])||!validSurveyRows(view.surveys,selector)
        ||!validateCounter(counts.surveys,view.surveys.length,50,unavailable)
        ||!validateCounter(counts.courseCompletions,view.surveys.reduce((sum,row)=>sum+row.courses.length,0),null,unavailable,counts.surveys.capReached))return false;
    }else if(!exact(counts,['eligibleCourses','feedback'])||!view.courses.every(row=>validCourse(row,selector))
      ||!validImmediateRows(view.feedback,selector,selection.commentRequested)
      ||!validateCounter(counts.eligibleCourses,view.courses.length,200,unavailable)
      ||!validateCounter(counts.feedback,view.feedback.length,100,unavailable))return false;
    if(unavailable){if(view.complete||!view.reason)return false;continue;}
    loaded++;
    const groups=Object.values(counts),omitted=groups.some(counter=>counter.omitted>0),capped=groups.some(counter=>counter.capReached);
    const partial=omitted||capped,empty=groups.every(counter=>counter.matching===0);
    if(!empty)nonempty++;
    if(partial)incomplete++;
    if(view.reason!==(omitted?'excerpted':capped?'native_cap_reached':null)
      ||view.complete!==!partial||view.readState!==(partial?'partial':empty?'empty':'ok'))return false;
  }
  const complete=loaded>0&&loaded===paths.length&&incomplete===0;
  const state=loaded===0?'unavailable':!complete?'partial':nonempty?'ok':'empty';
  return payload.complete===complete&&payload.readState===state;
}
