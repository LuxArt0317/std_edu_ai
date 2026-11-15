const prefix='account:dtm-assignment-list-';
const id=value=>'91800000-0000-4000-8000-'+String(value).padStart(12,'0');
const mine=id(1),other=id(2);
const course=id(10),later=id(20),sample=id(30),foreign=id(40);
const global='/dtm/assignments';
const scope=id=>'/dtm/course/'+id+'/assignments';
const assignment=(course,id)=>'/dtm/course/'+course+'/assignment/'+id;
const tool='dtmAssignmentList';
const ref='account:'+tool;
const courseData=(id,userId,code,sourceMode)=>({id,user_id:userId,code,source_mode:sourceMode});
const courses=[
  courseData(course,mine,'ARCH201','personal'),courseData(later,mine,'STUD202','personal'),
  courseData(sample,mine,'SAMP301','sample'),courseData(foreign,other,'FOREIGN101','personal'),
];
function row(sequence,ownerCourse,title,status,due){
  return {id:id(sequence),dtm_course_id:ownerCourse.id,source_mode:ownerCourse.source_mode,title,status,due_at:due,
    dtm_courses:ownerCourse,affairs_students:{user_id:ownerCourse.user_id}};
}
const records=[
  row(12,courses[0],'Index benchmark','submitted','2026-11-16T10:00:00+00:00'),
  row(11,courses[0],'Architecture sketch','open','2026-11-17T01:10:00+00:00'),
  row(13,courses[0],'Buffer workshop','graded',null),
  row(21,courses[1],'Research outline','open','2026-11-17T02:00:00+00:00'),
  row(31,courses[2],'Sample diagram','open','2026-11-17T02:10:00+00:00'),
  row(41,courses[3],'OTHER OWNER SENTINEL','open','2026-11-17T02:15:00+00:00'),
];
const identity=Object.freeze({
  caller:mine,other,course,later,sample,foreign,asOf:'2026-11-16T16:15:00.000Z',global,tool,
});
const requirement='offline_dtm_native_fixture';
const legacyIds=new Set(['account:unfinished-assignments','account:tomorrow-assignments','account:assignment-submitted-tracker','account:empty-assignments']);
const ownAndVisible=[records[0],records[1],records[3],records[2]];
const ordinary=records.slice(0,3);
const overdueRecord={...records[0],status:'open'};
const denyFacts=['OTHER OWNER SENTINEL','SENSITIVE FULL INSTRUCTIONS','PRIVATE FILE MARKER','COURSE GRADE SENTINEL'];
const linksFor=row=>assignment(row.dtm_course_id,row.id);
const factsFor=(rows,fields)=>rows.map(row=>({
  label:row.title,kind:'text',values:[row.title],match:'literal',
  ...(fields.length?{fields:fields.map(field=>field==='status'?{label:'Tracker status',labels:['追蹤狀態'],kind:'text',match:'literal',values:[{
    anyOf:row.status==='open'?['Open','未完成']:row.status==='submitted'?['Marked submitted','已標記繳交']:['Marked graded','已標記評分'],
  }]}:{label:'Saved deadline',labels:['已儲存截止時間'],kind:'text',match:'literal',values:[row.due_at?
    ({[records[0].id]:'2026-11-16 18:00',[records[1].id]:'2026-11-17 09:10',[records[3].id]:'2026-11-17 10:00',[records[4].id]:'2026-11-17 10:10'})[row.id]:
    {anyOf:['No saved deadline','沒有已儲存截止時間']}]})}:{}),
}));
function common(suffix,question,target,args={}){
  const {expectedRows=[],fixtures='normal',fields=['due','status'],amount=expectedRows.length,verification=(args.reason?'absent':'verified'),
    reason=null,readMode='all',period=null,behavior=(verification==='unverified'?'unavailable':reason?'denial':!amount?'unavailable':'answer'),
    countOnly=false,partial=false,text=[],forbiddenText=[],additionalLinks,toolStatus=verification==='unverified'?'unavailable':'complete'}=args;
  const route=target?scope(target):global;
  const read=verification!=='absent';
  const requiredTools=read&&toolStatus==='complete'?[tool]:[];
  const attempted=read?[tool]:[];
  const expectedLink=additionalLinks??[route,...expectedRows.map(linksFor)];
  const excludedTitles=records.filter(row=>!expectedRows.some(item=>item.id===row.id)).map(row=>row.title);
  const expectedFacts=read&&verification==='verified'&&amount
    ?countOnly?[{label:'Matching saved assignments',labels:['相符的已儲存作業筆數'],kind:'number',values:[amount],exclusive:true}]
      :factsFor(expectedRows,fields):[];
  return {
    id:prefix+suffix,domain:tool,fixtureKey:'offline:dtm-assignment-list:'+fixtures,fixtureRequirement:requirement,
    route,question,auth:fixtures==='anonymous'?'anonymous':'signed-in',language:/\p{Script=Han}/u.test(question)?'zh-Hant':'en',
    mode:expectedFacts.length?'record':'access',coveredTools:attempted,
    capability:{level:'native',gap:true,limitation:'Trusted caller fixtures and request observations are required before live acceptance.'},
    observation:{fixtures,courseId:target,read,readMode,period,fields:[...fields],countOnly,expectedRows:expectedRows.map(row=>row.id),amount,verification,reason,partial},
    expected:{behavior,facts:expectedFacts,
      requiredText:[...text,...(!amount&&verification==='verified'?[{anyOf:['no matching saved assignments','找不到相符的已儲存作業']}]:[])],
      forbiddenAccountMarkers:[...new Set([...denyFacts,...excludedTitles,...forbiddenText])],requiredLinks:expectedLink,
      requiredSourceBindings:read&&verification==='verified'?[{sourceId:ref,url:route}]:[],
      requiredTools,allowedTools:attempted,requiredAttemptedTools:attempted,maxDistinctAttemptedTools:attempted.length,requireToolExecution:read,noAction:true,forbidPublicResearch:true,localLinksOnly:true,
      evidenceBoundaries:['dtm_assignment_tracker_metadata_only',...(verification==='unverified'?['dtm_assignment_list_read_not_empty']:[])],
      ...(verification!=='absent'?{verification}:{}),
      ...(read?{toolTerminalStates:{[tool]:[toolStatus]}}:{}),
      ...(behavior==='unavailable'?{limitation:true}:{}),
    },
  };
}

export function dtmAssignmentListCases(){
  return [
    common('course-all','List the Moodle assignments in this course.',course,{expectedRows:ordinary}),
    common('account-all','Show my saved Moodle assignments.',null,{expectedRows:ownAndVisible}),
    common('today','Which assignments are due today in this course?',course,{expectedRows:[records[1]],period:'today'}),
    common('tomorrow','Which assignments are due tomorrow in this course?',course,{period:'tomorrow'}),
    common('exact-day','Which assignments are due on 2026-11-16 in this course?',course,{expectedRows:[records[0]],period:'2026-11-16'}),
    common('today-account','What assignments are due today?',null,{expectedRows:[records[1],records[3]],period:'today'}),
    common('open-zh','請列出這門課尚未完成的作業。',course,{expectedRows:[records[1]],readMode:'open'}),
    common('done','Which assignments are completed in this course?',course,{expectedRows:[records[0],records[2]],readMode:'done'}),
    common('graded','Show the assignments marked graded in this course.',course,{expectedRows:[records[2]],readMode:'graded'}),
    common('submitted','Show the assignments marked submitted in this course.',course,{expectedRows:[records[0]],readMode:'submitted'}),
    common('overdue','Which assignments are overdue in this course?',course,{expectedRows:[overdueRecord],period:'overdue',readMode:'open',fixtures:'overdue-open'}),
    common('empty-course','Which assignments are saved for this course?',later,{fixtures:'empty',amount:0}),
    common('hide-sample-without-personal-records','List my saved Moodle assignments.',null,{fixtures:'empty',amount:0}),
    common('fallback-sample','List my saved Moodle assignments.',null,{fixtures:'sample',expectedRows:[records[4]],text:['Sample diagram']}),
    common('exact-sample','Show saved assignments in this course.',sample,{expectedRows:[records[4]],text:['Sample diagram']}),
    common('title-only','List only the titles of the assignments in this course.',course,{expectedRows:ordinary,fields:[],forbiddenText:['Marked submitted','Marked graded','Saved deadline']}),
    common('count','How many assignments are there in this course?',course,{countOnly:true,amount:3,fields:[]}),
    common('partial','Show my saved Moodle assignments.',null,{fixtures:'partial',partial:true,amount:21,expectedRows:ownAndVisible,text:['Showing 20 of 21 matching rows'],forbiddenText:['Additional coursework 17']}),
    common('foreign-question','Show Alice’s assignments from this course.',course,{reason:'foreign',additionalLinks:[],text:[{anyOf:["cannot show another student's Moodle assignments",'cannot show another student’s Moodle assignments']}]}),
    common('foreign-course','Show my saved assignments in this course.',foreign,{fixtures:'foreign',verification:'unverified',additionalLinks:[],text:['could not verify']}),
    common('transport-failed','Show my saved assignments in this course.',course,{fixtures:'failed',verification:'unverified',additionalLinks:[],text:['could not verify'],forbiddenText:['no matching saved assignments']}),
    common('uploads','Which actual submitted files can you verify for my assignments?',course,{reason:'files',text:['committed files'],additionalLinks:[scope(course)]}),
    common('grades','What scores are saved for these assignments?',course,{reason:'grades',text:['grade report'],additionalLinks:['/dtm/course/'+course+'/grades']}),
    common('bulk-change','Submit all my assignments.',course,{reason:'operation',text:['No change was made'],additionalLinks:[scope(course)]}),
    common('anonymous','Show my saved Moodle assignments.',course,{reason:'anonymous',fixtures:'anonymous',
      additionalLinks:['/dtm/login?next='+encodeURIComponent(scope(course))],text:['Sign in']}),
  ];
}

export function dtmAssignmentListFixture(candidate){
  const known=dtmAssignmentListCases().find(row=>row.id===candidate.id);
  if(!known||known.fixtureKey!==candidate.fixtureKey)throw new TypeError('No independent assignment-list fixture.');
  const {fixtures}=known.observation;
  const selectedCourses=fixtures==='sample'?[courses[2],courses[3]]:courses;
  const selectedRows=fixtures==='empty'?records.filter(row=>row.dtm_course_id!==later&&row.dtm_course_id!==course)
    :fixtures==='sample'?records.filter(row=>row.dtm_course_id===sample||row.dtm_course_id===foreign)
    :fixtures==='overdue-open'?[overdueRecord,...records.slice(1)]
    :fixtures==='partial'?[...records,...Array.from({length:17},(_,index)=>row(50+index,courses[0],'Additional coursework '+(index+1),'open',null))]:
      records;
  return structuredClone({courses:selectedCourses,records:selectedRows,identity});
}

export function markLegacyDtmAssignmentListFixture(testCase){
  return legacyIds.has(testCase?.id)?{...testCase,fixtureRequirement:'legacy_dtm_assignment_list_rebind',
    fixtureSetupDetail:'The original broad tracker oracle is preserved. It requires a fresh binding to the native list read and exact page visibility.'}:testCase;
}
export function isNativeDtmAssignmentListCase(testCase){
  return legacyIds.has(testCase?.id)||testCase?.fixtureRequirement==='legacy_dtm_assignment_list_rebind'
    ||typeof testCase?.id==='string'&&testCase.id.startsWith(prefix)
    ||typeof testCase?.fixtureKey==='string'&&testCase.fixtureKey.startsWith('offline:dtm-assignment-list:');
}
