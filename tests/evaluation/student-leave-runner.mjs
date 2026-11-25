import {leaveFixtureClock,leaveFixtureRow,studentLeaveNativeCases} from './student-leave-native-cases.mjs';

const prefix='account:student-leave-native-';
const fixturePrefix='offline:student-leave:';
const requirement='offline_native_student_leave';
const detail='Student Leave cases require isolated caller-bound fixtures and independent request observations. This case was not executed.';
const legacyIds=new Set([
  'account:leave-history','account:cross-domain-absence-work-leave','account:empty-serviceRecords',
  ...['20-1','33-1'].flatMap(service=>['record','empty','action-boundary'].map(mode=>'service:'+service+':'+mode)),
]);
const base='/school-affairs/services/leave';
const statuses={foreign_request:'denial',invalid_route:'clarify',ambiguous_selector:'clarify',unsupported_operation:'clarify',unsupported_field:'clarify',requires_attendance_source:'clarify'};
const boundaries={
  foreign_request:{anyOf:['own saved leave records','只能查詢你自己的請假紀錄']},
  invalid_route:{anyOf:['specify the exact record','指定要查詢的紀錄']},
  ambiguous_selector:{anyOf:['specify the exact record','指定要查詢的紀錄']},
  unsupported_operation:{anyOf:['in School Affairs','在校務系統']},
  unsupported_field:{anyOf:['detail is unavailable','無法提供此項資料']},
  requires_attendance_source:{anyOf:['cannot verify your class attendance','無法確認課堂出席狀況']},
};
const ordinaryFacts={dates:['2026-11-09','2026-11-10'],status:'filed',category:'personal',periods:'週一08:10、週二09:10',reviewStatus:'resolved'};
const caseFacts={
  archive:{dates:['2019-07-30','2019-07-31'],status:'draft'},
  'archive-route':{status:'draft'},
  'archived-english-dates':{dates:['2019-07-30','2019-07-31']},
  'taipei-today':{periods:'週日08:10'},
  'exact-sibling':{dates:['2026-11-11','2026-11-12']},
  'date-from-history':{status:'draft'},
};
const labels={
  startsOn:{label:'Saved start date',labels:['Start date','Starts on','開始日期','起始日期','起日'],kind:'date'},
  endsOn:{label:'Saved end date',labels:['End date','Ends on','結束日期','迄日'],kind:'date'},
  status:{label:'Saved record status',labels:['Record status','Saved tracking status','站內追蹤狀態','紀錄狀態','记录状态'],kind:'text'},
  category:{label:'Saved leave category',labels:['Leave category','假別','假别'],kind:'text'},
  periods:{label:'Saved class periods',labels:['Class periods','Leave periods','Saved periods','已儲存節次','請假節次','请假节次'],kind:'text'},
  reviewStatus:{label:'Saved local review status',labels:['Local review status','Review status','站內審核狀態','站内審核狀態'],kind:'text'},
};
const fieldFact=(field,value)=>({...labels[field],values:[value],exclusive:true});
const factFor=(field,value)=>field==='dates'?[fieldFact('startsOn',value[0]),fieldFact('endsOn',value[1])]:[fieldFact(field,value)];
const extraCases=[
  {id:'index-navigation',question:'Where can I open the student leave form from this page?',route:base+'/index',
    navigation:true,destination:base},
  {id:'confirmed-empty',question:'Show my leave dates on 2026-11-18.',route:base+'/history',view:'history',
    fields:['dates'],mode:'empty',requirement:'A completed exact-date lookup found no matching saved rows.'},
  {id:'read-unavailable',question:'Show the dates on this leave form.',route:base+'/edit/'+leaveFixtureRow,view:'record',
    recordId:leaveFixtureRow,fields:['dates'],mode:'unavailable',requirement:'The selected exact leave read failed. The resulting record is unknown.'},
  {id:'review-unavailable',question:'Show my leave dates and its review status.',route:base+'/edit/'+leaveFixtureRow,view:'record',
    recordId:leaveFixtureRow,fields:['dates'],selectedFields:['dates','reviewStatus'],mode:'partial',
    requirement:'The saved leave dates remain available. The linked local request status is unavailable.'},
  {id:'category-status-count',question:'How many draft sick leaves did I have this month?',route:base+'/history',
    view:'history',fields:[],countOnly:true,matchingCount:3,from:'2026-11-01',through:'2026-11-30'},
  {id:'approval-count-unavailable',question:'How many approved sick leave requests did I have?',route:base+'/history',reason:'unsupported_field'},
  {id:'leave-and-moodle-grades',question:'Show my leave dates and show my Moodle grade overview.',route:base+'/history',
    view:'history',fields:['dates'],companion:'dtmGradeReport'},
  {id:'moodle-grades-and-leave',question:'Show my Moodle grade overview and show my leave dates.',route:base+'/history',
    view:'history',fields:['dates'],companion:'dtmGradeReport'},
];
function makeCase(row){
  const read=Array.isArray(row.fields)&&!row.reason;
  const linkedTool=row.companion??(row.residual==='my tuition balance'?'charges':row.residual==='What is my next class'||row.id==='independent'?'courses':null);
  const tools=[...(read?['leaveRecords']:[]),...(linkedTool?[linkedTool]:[])];
  const unavailable=row.mode==='empty'||row.mode==='unavailable';
  const behavior=statuses[row.reason]??(row.navigation?'navigation':row.excluded?'clarify':unavailable?'unavailable':'answer');
  const facts=read&&!unavailable?(row.countOnly
    ?[{label:'Matching saved leave records',labels:['Saved leave count','Matching records','符合的假單','相符的請假紀錄筆數'],kind:'number',values:[row.matchingCount??17],exclusive:true}]
    :row.fields.flatMap(field=>factFor(field,caseFacts[row.id]?.[field]??ordinaryFacts[field]))):[];
  if(linkedTool==='charges')facts.push({label:'Remaining balance',kind:'number',values:[23000],exclusive:true});
  if(linkedTool==='courses')facts.push({label:'Next class',kind:'text',values:['Leave evaluation next class'],exclusive:true});
  if(linkedTool==='dtmGradeReport')facts.push({label:'Saved total grade text',kind:'text',values:['87.00'],match:'literal',exclusive:true});
  const destination=read?(row.view==='record'?base+'/edit/'+row.recordId:base+'/'+row.view):row.destination??(row.navigation?base+'/history':null);
  const sourceBindings=read&&destination&&!unavailable?[{sourceId:'account:leaveRecords',url:destination}]:[];
  const linkedDestination={charges:'/school-affairs/services/39-1',courses:'/school-affairs/records/subjects',dtmGradeReport:'/dtm/grades'}[linkedTool];
  if(linkedDestination)sourceBindings.push({sourceId:'account:'+linkedTool,url:linkedDestination});
  const limitationText={
    empty:{anyOf:['no matching saved leave records','no matching saved leave rows','沒有相符的已儲存請假紀錄','找不到符合的請假紀錄','沒有符合條件的已儲存假單']},
    unavailable:{anyOf:['read failed','lookup was unavailable','failed to read','could not read','couldn’t read','查詢失敗','無法讀取']},
    partial:{anyOf:['review status is unavailable','review request could not be checked','linked local review is unavailable','linked review requests couldn’t be checked','站內審核請求無法查核','無法確認站內審核狀態']},
  };
  const caseId=prefix+row.id;
  const limitation=row.requirement??(behavior==='unavailable'?'The requested capability is unavailable in the native leave reader.':null);
  return {
    id:caseId,domain:'leaveRecords',route:row.route,mode:row.mode==='partial'?'record':row.mode??(row.navigation?'navigation':row.reason?'boundary':'record'),
    language:/\p{Script=Han}/u.test(row.question)?'zh-Hant':'en',
    fixtureKey:fixturePrefix+row.id,fixtureRequirement:requirement,coveredTools:tools,
    question:row.question,history:row.history??[],
    nativeLeaveContract:{
      caseId,sourceView:row.view??null,recordId:row.recordId??null,dateRange:row.from?{from:row.from,through:row.through}:null,
      referenceClock:new Date(leaveFixtureClock).toISOString(),
      selectedFields:row.selectedFields??row.fields??[],expectedReadState:read?(row.mode??'ok'):null,
      requiresScopedRecordRead:read,requiresCallerBinding:read,requiresRequestObservations:true,fixtureMounted:false,
      ...(limitation?{limitation}:{}),
    },
    expected:{
      behavior,facts,requiredLinks:[destination,linkedDestination].filter(Boolean),requiredSourceBindings:sourceBindings,
      requiredTools:row.mode==='unavailable'?[]:tools,requiredAttemptedTools:tools,allowedTools:tools,maxDistinctAttemptedTools:tools.length,
      noAction:true,forbidPublicResearch:true,localLinksOnly:true,
      ...(row.mode==='unavailable'?{toolTerminalStates:{leaveRecords:['unavailable','error']}}:{}),
      ...(tools.length?{requireToolExecution:true}:{}),
      ...(row.mode==='partial'?{requiredText:[limitationText.partial]}:row.reason?{requiredText:[boundaries[row.reason]]}
        :row.excluded?{requiredText:[{anyOf:['skipped the leave records','已略過你要求排除的請假紀錄']}]}:{}),
      evidenceBoundaries:['leave_local_metadata_only',...(row.mode==='unavailable'?['leave_read_failure_not_empty']:[])],
      ...(read&&!unavailable?{provenance:'local',verification:'verified'}:{}),
      ...(behavior==='unavailable'?{limitation:limitationText[row.mode]??true}:{}),
      forbiddenAccountMarkers:['FOREIGN PRIVATE SENTINEL','STUDENT_PRIVATE_REASON','STUDENT_PRIVATE_PHONE'],
    },
  };
}

/** This registers independent questions and expectations. An external model
 * answer, even one claiming verification, cannot stand in for runtime reads. */
export function studentLeaveRunnerCases(){
  return [...studentLeaveNativeCases,...extraCases].map(makeCase);
}
export function markLegacyStudentLeaveFixture(testCase){
  if(!legacyIds.has(testCase?.id))return testCase;
  return {...testCase,fixtureRequirement:'legacy_student_leave_rebind',
    fixtureSetupDetail:'The original leave question and oracle remain registered. The earlier shared service-record fixture requires a scoped reader binding or a separately evaluated unresolved capability.'};
}
export function nativeStudentLeaveSetupRequired(testCase){
  return testCase?.fixtureRequirement===requirement||testCase?.fixtureRequirement==='legacy_student_leave_rebind'
    ||legacyIds.has(testCase?.id)||typeof testCase?.id==='string'&&testCase.id.startsWith(prefix)
    ||typeof testCase?.fixtureKey==='string'&&testCase.fixtureKey.startsWith(fixturePrefix);
}
export function assertNativeStudentLeaveCaseReady(testCase){
  if(nativeStudentLeaveSetupRequired(testCase))
    throw Object.assign(new Error(detail),{code:'student_leave_fixture_and_observation_unmounted'});
}
export function studentLeaveSetupSummary(cases){
  const caseIds=cases.filter(nativeStudentLeaveSetupRequired).map(row=>row.id);
  return {registered:caseIds.length,liveEligible:0,observationsMounted:false,caseIds,legacyCaseIds:caseIds.filter(id=>legacyIds.has(id))};
}
