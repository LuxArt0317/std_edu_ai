/** Independent literal goldens; unmounted and not a live mutation grant. */
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const dtmAssignmentFixture=freeze({ownerId:'79000000-0000-4000-8000-000000000001',foreignId:'79000000-0000-4000-8000-000000000002',
  courseId:'79000000-0000-4000-8000-000000000101',assignmentId:'79000000-0000-4000-8000-000000000201',
  title:'Sampling comparison',details:'Compare stratified and systematic sampling. Give one limitation for each method.',dueAt:'2026-11-17T18:30:00+08:00',
  trackerStatus:'submitted',trackerSubmittedAt:'2026-11-15T08:00:00+08:00'});
export const dtmAssignmentRoute='/dtm/course/'+dtmAssignmentFixture.courseId+'/assignment/'+dtmAssignmentFixture.assignmentId;
export function dtmAssignmentRaw(mode='normal'){
  if(mode==='empty')return {assignment:null};
  const f=dtmAssignmentFixture;
  return {assignment:{id:f.assignmentId,userId:f.ownerId,courseId:f.courseId,title:f.title,details:mode==='blank'?'':f.details,
    dueAt:mode==='null-deadline'?null:f.dueAt,status:f.trackerStatus,submittedAt:f.trackerSubmittedAt,sourceMode:'personal',meetingId:null,origin:'manual'}};
}
export const dtmAssignmentCases=freeze([
  {id:'detail',question:'What do I need to do for this assignment and when is it due?',fields:['title','details','dueAt']},
  {id:'edit-context',route:dtmAssignmentRoute+'/edit',question:'When is this assignment due?',fields:['title','dueAt']},
  {id:'instructions',question:'Show the saved instructions for this assignment.',fields:['title','details']},
  {id:'null-deadline',mode:'null-deadline',question:'When is this assignment due?',fields:['title','dueAt']},
  {id:'blank',mode:'blank',question:'Show my assignment instructions.',fields:['title','details']},
  {id:'tracker',question:'Show the personal tracker status and tracker submitted time for this assignment.',fields:['title','trackerStatus','trackerSubmittedAt']},
  {id:'empty',mode:'empty',question:'Show my assignment details.',fields:['title','details']},
  {id:'failed',mode:'failed',question:'When is this assignment due?',fields:['title','dueAt']},
  {id:'followup',question:'When is it due?',history:[{role:'user',content:'Show my assignment instructions.'}],fields:['title','dueAt']},
  {id:'negative-details',question:'Show my assignment due date but not instructions.',fields:['title','dueAt']},
  {id:'mixed-fees',question:'When is my assignment due and what is my tuition balance?',fields:['title','dueAt'],companion:'charges'},
  {id:'mixed-reversed',question:'What is my tuition balance and when is my assignment due?',fields:['title','dueAt'],companion:'charges'},
  {id:'foreign',question:'Show my friend’s assignment due date.',stop:'foreign_request'},
  {id:'named',question:'What is the assignment deadline for Alice?',stop:'foreign_request'},
  {id:'write',question:'Change my assignment deadline.',stop:'unsupported_operation'},
  {id:'wrong-target',question:'Show assignment "Other paper" instructions.',stop:'ambiguous_selector'},
  {id:'excluded',question:'Do not show my assignment instructions and due date.',excluded:true},
  {id:'stale',question:'When is it due?',history:[{role:'user',content:'What is my tuition balance?'}],unselected:true},
].map(row=>({route:dtmAssignmentRoute,mode:'normal',history:[],...row,mounted:false,setupEligible:false,
  sourceId:'account:dtmAssignment',liveGate:'Exact two-owner native assignment fixtures, pinned deployment and verified evaluation lease are not wired.'})));
