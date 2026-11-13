import {feeRemissionUuid as uuid} from './feeRemissionContract.js';

export const teachingFeedbackPaths={survey:'/school-affairs/services/7-5',immediate:'/school-affairs/services/7-6'};
export const teachingFeedbackScopes=['survey','immediate','manage'];
export const teachingFeedbackStudentActions=['submit_teaching_survey','submit_teaching_feedback'];
export const teachingFeedbackManagerActions=['save_teaching_survey','release_teaching_survey','review_teaching_feedback'];
export const teachingFeedbackMaxBytes=12288;
const fields={
  submit_teaching_survey:['survey_id','section_id','request_id','version','ratings','comment'],
  submit_teaching_feedback:['section_id','request_id','comment'],
  save_teaching_survey:['term_id','phase','expected_version','opens_at','closes_at','questions'],
  release_teaching_survey:['survey_id','expected_version','confirm_release','grades_published'],
  review_teaching_feedback:['feedback_id'],
};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const size=(value,min,max)=>typeof value==='string'&&!value.includes('\0')&&[...value.trim()].length>=min&&[...value].length<=max;
const version=(value,min=1)=>Number.isInteger(value)&&value>=min&&value<=1000000;
const instant=(value)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/u.test(value)&&Number.isFinite(Date.parse(value));
const phase=(value)=>value==='midterm'||value==='final';
const questions=(value)=>Array.isArray(value)&&value.length>=1&&value.length<=16&&value.every(q=>size(q,1,160))&&
  new Set(value.map(q=>q.trim())).size===value.length;
const window=(start,end)=>instant(start)&&instant(end)&&Date.parse(start)<Date.parse(end)&&Date.parse(end)-Date.parse(start)<=180*86400000;

export function validTeachingFeedbackAction(kind,payload){
  if(typeof kind!=='string'||!Object.hasOwn(fields,kind)||!exact(payload,fields[kind])||
    !fields[kind].filter(key=>key.endsWith('_id')).every(key=>uuid(payload[key]))||
    new TextEncoder().encode(JSON.stringify(payload)).length>teachingFeedbackMaxBytes-128)return false;
  switch(kind){
    case 'submit_teaching_survey':return version(payload.version)&&Array.isArray(payload.ratings)&&payload.ratings.length>=1&&payload.ratings.length<=16&&
      payload.ratings.every(rating=>Number.isInteger(rating)&&rating>=1&&rating<=5)&&size(payload.comment,0,2000);
    case 'submit_teaching_feedback':return size(payload.comment,5,2000);
    case 'save_teaching_survey':return phase(payload.phase)&&version(payload.expected_version,0)&&questions(payload.questions)&&
      window(payload.opens_at,payload.closes_at)&&[payload.opens_at,payload.closes_at].every(value=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u.test(value));
    case 'release_teaching_survey':return version(payload.expected_version)&&payload.confirm_release===true&&typeof payload.grades_published==='boolean';
    case 'review_teaching_feedback':return true;
    default:return false;
  }
}
const course=(row,survey=false)=>exact(row,['id','course','code','term','section',...(survey?['completed']:[])])&&uuid(row.id)&&
  [row.course,row.code,row.term,row.section].every(value=>typeof value==='string')&&(!survey||typeof row.completed==='boolean');
const feedback=(row)=>exact(row,['id','sectionId','course','code','term','comment','status','submittedAt','reviewedAt'])&&uuid(row.id)&&uuid(row.sectionId)&&
  [row.course,row.code,row.term].every(value=>typeof value==='string')&&size(row.comment,5,2000)&&instant(row.submittedAt)&&
  (row.status==='submitted'&&row.reviewedAt===null||row.status==='reviewed'&&instant(row.reviewedAt));
const survey=(row)=>exact(row,['id','termId','term','phase','questions','opensAt','closesAt','version','released','state','courses'])&&uuid(row.id)&&
  uuid(row.termId)&&typeof row.term==='string'&&phase(row.phase)&&questions(row.questions)&&window(row.opensAt,row.closesAt)&&version(row.version)&&
  typeof row.released==='boolean'&&['scheduled','open','closed'].includes(row.state)&&Array.isArray(row.courses)&&row.courses.every(item=>course(item,true));
const result=(row)=>exact(row,['surveyId','sectionId','course','code','section','count','averages','comments'])&&uuid(row.surveyId)&&uuid(row.sectionId)&&
  [row.course,row.code,row.section].every(value=>typeof value==='string')&&Number.isInteger(row.count)&&row.count>=5&&
  Array.isArray(row.averages)&&row.averages.length>=1&&row.averages.length<=16&&row.averages.every(value=>typeof value==='number'&&value>=1&&value<=5)&&
  Array.isArray(row.comments)&&row.comments.length<=100&&row.comments.every(value=>size(value,1,2000));

export function parseTeachingFeedback(value,userId,scope){
  const keys=['userId','courses','surveys','feedback','terms','results'];
  if(!exact(value,keys)||!uuid(userId)||value.userId!==userId||keys.slice(1).some(key=>!Array.isArray(value[key]))||
    !value.courses.every(row=>course(row))||!value.surveys.every(survey)||!value.feedback.every(feedback)||
    !value.terms.every(row=>exact(row,['id','label'])&&uuid(row.id)&&typeof row.label==='string')||!value.results.every(result)||
    (scope==='survey'&&['courses','feedback','terms','results'].some(key=>value[key].length>0))||
    (scope==='immediate'&&['surveys','terms','results'].some(key=>value[key].length>0))||
    (scope==='manage'&&value.courses.length>0))throw new Error('Invalid teaching feedback data.');
  return value;
}

export function parseTeachingFeedbackReceipt(value,kind,payload){
  let valid;
  switch(kind){
    case 'submit_teaching_survey':valid=exact(value,['surveyId','sectionId','completed'])&&value.surveyId===payload.survey_id&&
      value.sectionId===payload.section_id&&value.completed===true;break;
    case 'submit_teaching_feedback':valid=feedback(value)&&value.sectionId===payload.section_id&&value.comment===payload.comment.trim();break;
    case 'review_teaching_feedback':valid=feedback(value)&&value.id===payload.feedback_id&&value.status==='reviewed';break;
    case 'save_teaching_survey':case 'release_teaching_survey':valid=exact(value,['id','version'])&&uuid(value.id)&&
      (!payload.survey_id||value.id===payload.survey_id)&&value.version===payload.expected_version+1;break;
  }
  if(!valid)throw new Error('Invalid teaching feedback receipt.');
  return value;
}

export function teachingFeedbackQuestion(question){
  const q=question.normalize('NFKC');
  if(/password|refresh_token|access_token|another student|別人的|密碼|替我|幫我送|\bsubmit my\b/iu.test(q))return null;
  if(/\b(?:teaching|course) (?:evaluation|survey)s?\b|教學(?:成效|意見|評量)問卷/iu.test(q))return 'survey';
  if(/\b(?:(?:immediate|real[- ]time) teaching feedback|teaching feedback|course feedback)\b|即時反應教學意見|教學意見反應/iu.test(q))return 'immediate';
  return null;
}
