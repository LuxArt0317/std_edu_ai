import {sampleEnrollmentManifest} from './published-sample-enrollments.mjs';
import {serviceNoteFixture} from './service-cases.mjs';
import {facilityRepairLiveFixtureKey} from './facility-repair-fixtures.mjs';
/** Synthetic, local-only golden records. No production answer helpers or credentials. */
export const EVAL_USER_ID='00000000-0000-4000-8000-000000000001';
export const EVAL_OTHER_USER_ID='00000000-0000-4000-8000-000000000002';
export const DEFAULT_EVAL_NOW='2026-11-13T02:00:00Z';
export const evalId=number=>'10000000-0000-4000-8000-'+String(number).padStart(12,'0');
export const EVAL_IDS=Object.freeze({dtmCourse:evalId(101),historicalDtmCourse:evalId(102),futureDtmCourse:evalId(103),meeting:evalId(201),nextMeeting:evalId(202),assignment:evalId(301),submittedAssignment:evalId(302),futureAssignment:evalId(303),grade:evalId(401),material:evalId(501),task:evalId(601)});
const status=(text,indicator=null)=>({text,indicator});
export function evaluationDates(now=DEFAULT_EVAL_NOW){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const today=`${parts.year}-${parts.month}-${parts.day}`,epoch=Date.parse(today+'T00:00:00Z');
  const offset=n=>new Date(epoch+n*86400000).toISOString().slice(0,10),weekday=new Date(epoch).getUTCDay()||7;
  return {today,tomorrow:offset(1),nextMonday:offset((8-weekday)%7||7),nextClass:Number(parts.hour)*60+Number(parts.minute)<790?today:offset(7),weekday,termStart:offset(-60),termEnd:offset(60),historicalStart:offset(-300),historicalEnd:offset(-100),futureStart:offset(90),futureEnd:offset(180)};
}
const stamp='2026-11-01T02:00:00Z';
const common=(id,userId)=>({id:evalId(id),userId,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp});
/** Independent literals for the two scoped readers, not inferred from charges/profile. */
export function supplementalFixtureRecords(userId=EVAL_USER_ID,{foreign=false}={}){
  const assessment={...common(foreign?919:911,userId),academicYear:115,semester:1,hasPendingFees:'N',status:'blocked',resultText:foreign?'FOREIGN PRIVATE SENTINEL certificate':'Registrar review remains pending.',assessedAt:'2026-11-09T03:00:00Z',identity:{studentNumber:foreign?'FOREIGN-CERT-99':'CERT-EVAL-115',studentName:foreign?'FOREIGN PRIVATE SENTINEL':'Certificate Evaluation Name',departmentName:'Certificate Studies',yearText:'Third year',classLabel:'Certificate Class C'}};
  const statements=foreign?[[929,'Foreign private period','FOREIGN PRIVATE SENTINEL tuition']]:[[921,'115 Fall reconciliation','Local statement: adjustment TWD 640; this is not a remaining balance.'],[922,'114 Spring reconciliation',null],[923,'114 Summer reconciliation',''],[924,'113 Fall reconciliation','0']];
  const settlements=statements.map(([id,periodLabel,text],rowOrder)=>({...common(id,userId),periodId:evalId(id),periodLabel,text,rowOrder}));
  return {enrollmentCertificate:{assessments:[assessment],documents:[]},tuition:{settlements,periods:settlements.map(row=>({id:row.id,userId,label:row.periodLabel})),documents:[]}};
}
function graduationReport(userId,kind){
  return {...common(kind==='legacy'?902:901,userId),reportKind:kind,reportedAt:stamp,
    identity:{studentNumber:'EVAL-115-001',studentName:'Evaluation Student',departmentName:'Information Studies',yearText:'3',enrollmentStatusText:'enrolled',curriculumCohortText:'113',doubleMajorText:null,minorText:null},
    educationProgram:status('Program requirement recorded'),foreignLanguageCompletion:status('Language course pending'),englishRequirement:status('English display only'),
    graduationReview:{...status(kind==='legacy'?'Legacy review complete':'Modern review pending',kind==='legacy'?'passed':'attention'),note:'Synthetic local reference; not an official eligibility decision.'},
    languageRequirements:[{id:'language-1',label:'English requirement',status:status('Pending', 'attention'),requiredCredits:6,matchedCredits:3,missingCredits:3}],
    categories:[{id:'core',label:'Core requirements',requiredElectiveText:'required',requiredCredits:30,completedCredits:18,matchedCredits:15,excludedCredits:3,detailSubtotalCredits:17,
      status:status('Core pending','attention'),requirements:[{id:'req-db',sequenceText:'1',title:'Database requirement',moduleText:'Core',credits:3,requiredElectiveText:'required',yearText:'2',transferText:null,indicator:'passed',
        matchedCourses:[{id:'match-db',sequenceText:'1',title:'Database Design',credits:3,requiredElectiveText:'required',yearText:'2',transferText:null}]}]}],otherCourses:[]};
}
export function buildAccountFixture({userId=EVAL_USER_ID,now=DEFAULT_EVAL_NOW}={}){
  if(!Number.isFinite(Date.parse(now)))throw new Error('Evaluation now must be a valid timestamp.');
  const dates=evaluationDates(now);
  const course=(n,values)=>({enrollmentId:evalId(n),status:'enrolled',sourceMode:'sample',code:'EVAL'+n,title:'Synthetic course',credits:3,term:'115學年度第1學期',termStartsOn:dates.termStart,termEndsOn:dates.termEnd,instructor:'Teacher Lin',weekday:dates.weekday,startsAt:'13:10:00',endsAt:'15:00:00',room:'R301',grades:[],attendance:[],...values});
  const current=course(1,{code:'DB301',title:'Database Design',grades:[{label:'Practice quiz',score:18,maximum:20,sourceMode:'sample'}],attendance:[{date:'2026-11-10',status:'absent',sourceMode:'sample'}]});
  const dtmCourse={id:EVAL_IDS.dtmCourse,code:'DTM301',title:'Learning Research',term:'115學年度第1學期',role:'student',sourceMode:'personal',
    materials:[{id:EVAL_IDS.material,title:'Review notes',kind:'page',summary:'The quiz covers normalization and transaction isolation.',position:1,sourceMode:'personal',sourceUrl:null}],
    meetings:[{id:EVAL_IDS.meeting,date:'2026-11-10',startsAt:'09:00:00',title:'Database indexes',attendance:'absent',notes:'Compare B-tree and hash indexes; prepare an index plan.'},
      {id:EVAL_IDS.nextMeeting,date:dates.tomorrow,startsAt:'09:00:00',title:'Transaction lab',attendance:'unknown',notes:'Bring the saved laboratory worksheet.'}],
    grades:[{id:EVAL_IDS.grade,label:'Quiz 1',score:12,maximum:20,date:'2026-11-10',feedback:'Revise normalization examples.'}]};
  return {
    ...supplementalFixtureRecords(userId),
    checkedAt:now,source:'stu.best School Affairs',officialUniversityData:false,
    completeness:Object.fromEntries(['terms','programs','catalog','sections','enrollments','grades','attendance','announcements','dtmNotices','tasks','requests'].map(key=>[key,{returned:0,complete:true,cap:1000}])),
    profile:{userId,email:'evaluation.student@example.invalid',displayName:'Evaluation Student',role:'student'},
    student:{id:evalId(10),studentNumber:'EVAL-115-001',fullName:'Evaluation Student',yearLevel:3,status:'active',sourceMode:'sample',program:'Information Studies'},
    courses:[current,course(2,{code:'HIS102',title:'Historical Methods',status:'completed',term:'114學年度第2學期',termStartsOn:dates.historicalStart,termEndsOn:dates.historicalEnd,room:'R102'}),
      course(3,{code:'FUT401',title:'Research Practicum',term:'115學年度第2學期',termStartsOn:dates.futureStart,termEndsOn:dates.futureEnd,weekday:1,startsAt:'09:10:00',endsAt:'11:00:00',room:'R401'}),
      course(4,{code:'DROP100',title:'Withdrawn Studio',status:'withdrawn'})],
    assignments:[{id:EVAL_IDS.assignment,title:'Index plan',details:'Compare B-tree and hash indexes in two pages.',dueAt:dates.tomorrow+'T04:00:00Z',status:'open',submittedAt:null,sourceMode:'personal',enrollmentId:null,dtmCourseId:EVAL_IDS.dtmCourse,course:'DTM301',meetingId:EVAL_IDS.meeting,origin:'manual'},
      {id:EVAL_IDS.submittedAssignment,title:'Reading response',details:'Reflect on the introduction.',dueAt:'2026-11-11T04:00:00Z',status:'submitted',submittedAt:'2026-11-10T06:00:00Z',sourceMode:'personal',enrollmentId:null,dtmCourseId:EVAL_IDS.dtmCourse,course:'DTM301',meetingId:null,origin:'manual'},
      {id:EVAL_IDS.futureAssignment,title:'Final portfolio',details:'Compile the project portfolio.',dueAt:'2026-12-20T04:00:00Z',status:'open',submittedAt:null,sourceMode:'personal',enrollmentId:null,dtmCourseId:EVAL_IDS.dtmCourse,course:'DTM301',meetingId:null,origin:'moodle_calendar'}],
    dtm:{sourceMode:'personal',courses:[dtmCourse,
      {id:EVAL_IDS.historicalDtmCourse,code:'DTM102',title:'Introduction to Research',term:'114學年度第2學期',role:'student',sourceMode:'personal',materials:[],meetings:[],grades:[]},
      {id:EVAL_IDS.futureDtmCourse,code:'DTM401',title:'Advanced Research',term:'115學年度第2學期',role:'student',sourceMode:'personal',materials:[],meetings:[],grades:[]}],
      notices:[{id:evalId(701),title:'DTM laboratory notice',body:'The synthetic laboratory opens at 08:30 on Saturday.',publishedAt:'2026-11-12T00:00:00Z',sourceMode:'sample'}]},
    charges:[{id:evalId(801),label:'Tuition instalment A',amountDue:28000,amountPaid:5000,currency:'TWD',dueOn:'2026-11-30',sourceMode:'sample',occurrenceOn:'2026-09-01',category:'Tuition',contactUnit:'Cashier',contactExtension:'2042',paymentUnit:'Cashier counter'},
      {id:evalId(802),label:'Laboratory fee',amountDue:1200,amountPaid:1200,currency:'TWD',dueOn:'2026-10-01',sourceMode:'sample',occurrenceOn:'2026-09-05',category:'Laboratory',contactUnit:null,contactExtension:null,paymentUnit:null}],
    tasks:[{id:EVAL_IDS.task,title:'Collect reading list',dueAt:'2026-11-16T04:00:00Z',completedAt:null,sourceMode:'site'},
      {id:evalId(602),title:'Check timetable',dueAt:null,completedAt:'2026-11-12T02:00:00Z',sourceMode:'site'}],
    requests:[{id:evalId(611),type:'general',title:'Library access request',details:'Restore access to the local library practice workspace.',status:'in_review',createdAt:'2026-11-11T02:00:00Z'}],
    announcements:[{id:evalId(711),title:'Campus laboratory update',body:'The synthetic library closes at 17:30 on Friday.',publishedAt:'2026-11-12T03:00:00Z',sourceMode:'sample'}],
    serviceRecords:[{id:evalId(621),userId,serviceKey:'leave',recordType:'leave',title:'Clinic leave',notes:'Bring the clinic note to the local reviewer.',status:'draft',startsOn:'2026-11-10',endsOn:'2026-11-10',leaveCategory:'sick',periods:'3-4',updatedAt:stamp,reviewStatus:'in_review',leaveTimePeriod:null},
      {id:evalId(622),userId,serviceKey:'internship',recordType:'contract',title:'Community Internship',notes:'Local placement planning record.',status:'filed',startsOn:'2026-12-01',endsOn:'2027-01-31',leaveCategory:null,periods:null,updatedAt:stamp,reviewStatus:'open'}],
    scholarship:{periods:[{id:evalId(631),termLabel:'115 Fall Scholarship',opensAt:'2026-11-01T00:00:00Z',closesAt:'2026-11-30T15:59:00Z',published:true,instructions:'Synthetic local award application.',sourceMode:'local_demo',version:1}],
      applications:[{id:evalId(632),userId,periodId:evalId(631),status:'approved',awardAmount:12000,requiredHours:12,actualHours:8,reviewNote:'Award approved locally.',submittedAt:stamp,reviewedAt:'2026-11-05T02:00:00Z',cancelledAt:null,version:1}]},
    studentAid:{records:[{...common(641,userId),applicantLabel:'EVAL-115-001',studentName:'Evaluation Student',maskedIdentityNumber:null,departmentName:'Information Studies',phone:null,applicationKind:'Living assistance',relativeCount:2,subsidyAmount:15000,studentRecordLocked:true,schoolReviewStatus:'Approved locally',ministryReviewStatus:'Pending review',academicYear:115,semester:1}]},
    housing:{periods:[{id:evalId(651),termLabel:'115 Fall Housing',academicYear:115,semester:1,opensAt:'2026-11-01T00:00:00Z',closesAt:'2026-11-30T15:59:00Z',published:true,instructions:'Synthetic housing period.',agreementText:'Local demonstration agreement.',sourceMode:'local_demo',version:1}],
      applications:[{id:evalId(652),userId,periodId:evalId(651),receiptNumber:'HOUSING-EVAL-001',fullName:'Evaluation Student',studentNumber:'EVAL-115-001',gender:'female',department:'Information Studies',birthDate:'2004-01-01',homePhone:'',mobilePhone:'',email:'evaluation.student@example.invalid',address:'Synthetic evaluation residence',postalCode:'00000',category:'general',healthNotes:'',agreementVersion:1,agreementText:'Local demonstration agreement.',submittedAt:stamp,version:1}],
      assignments:[{id:evalId(653),userId,periodId:evalId(651),academicYear:115,semester:1,bedNumber:'E-305-2',dormitory:'East Hall',bunk:'upper',accommodationFee:8500,deposit:1000,subsidyAmount:2000,version:1}]},
    creditLoadHistory:{records:[{...common(661,userId),academicYear:115,semester:1,category:'over',requestedCredits:25,processText:'Advisor review complete',resultText:'Approved locally'}]},
    courseSelection:{records:[{...common(671,userId),academicYear:115,semester:1,selectionPhase:'initial',termCourseCode:'NET301',courseTitle:'Networks Workshop',requiredElectiveText:'elective',credits:3,instructorOne:'Teacher Chen',remarkText:'Selected for local review',rowOrder:0,timetableIncluded:true,meetings:[{weekday:3,period:'3',room:'R301'}]}]},
    academicGrades:{records:[{...common(681,userId),recordKind:'transcript',academicYear:115,semester:1,courseTitle:'Database Design',courseCode:null,categoryText:'Core',moduleName:'Information Studies',requiredElectiveText:'required',credits:3,gradeText:'87',remarkText:null,rowOrder:0},
      {...common(682,userId),recordKind:'warning',academicYear:115,semester:1,courseTitle:'Research Writing',courseCode:'WR201',categoryText:null,moduleName:null,requiredElectiveText:null,credits:2,gradeText:'42',remarkText:'Consult the course teacher',rowOrder:0}],
      termSummaries:[{...common(683,userId),summaryKind:'transcript',academicYear:115,semester:1,earnedCredits:18,averageGradeText:'84.5',attemptedCredits:null,passedCredits:null,failedCredits:null},
        {...common(684,userId),summaryKind:'warning',academicYear:115,semester:1,earnedCredits:null,averageGradeText:null,attemptedCredits:20,passedCredits:18,failedCredits:2}],
      rankings:[{...common(685,userId),academicYear:115,semester:1,departmentRankingText:'12 / 140',classRankingText:'5 / 42'}],
      metadata:[{...common(686,userId),classLabel:'Evaluation class A',englishRequirementText:'English requirement awaiting local review'}]},
    graduationReview:{reports:[graduationReport(userId,'academic_services'),graduationReport(userId,'legacy')]},
    academicAttendance:{statistics:[{...common(691,userId),academicYear:115,semester:1,rowOrder:0,studentNumber:null,studentName:null,courseCode:'DB301',courseTitle:'Database Design',totalTeachingHours:54,currentTeachingWeeks:10,currentTeachingHours:30,absenceHours:6,unexcusedAbsenceHours:2}],
      details:[{...common(692,userId),academicYear:115,semester:1,rowOrder:0,courseCode:'DB301',courseTitle:'Database Design',teacherName:'Teacher Lin',absenceTypeText:'Sick leave pending',courseDate:'2026-11-10',periodText:'3-4',rollCalledAt:'2026-11-10T10:12:00+08:00'}],
      metadata:[{...common(693,userId),currentAcademicYear:115,currentSemester:1}]},
  };
}
export const baseSyntheticSnapshot=buildAccountFixture;
const emptyDomain=(snapshot,domain)=>{
  if(domain==='profile')snapshot.student=null;
  else if(['leave','internship'].includes(domain))snapshot.serviceRecords=snapshot.serviceRecords.filter(row=>row.serviceKey!==domain);
  else if(domain==='serviceRecords')snapshot.serviceRecords=[];
  else if(domain==='requests'){snapshot.requests=[];snapshot.serviceRecords=snapshot.serviceRecords.map(row=>({...row,reviewStatus:null}));}
  else if(domain==='dtm'){snapshot.dtm={sourceMode:'personal',courses:[],notices:[]};snapshot.assignments=[];}
  else if(domain==='academicGrades')snapshot.academicGrades={records:[],termSummaries:[],rankings:[],metadata:[]};
  else if(domain==='academicAttendance')snapshot.academicAttendance={statistics:[],details:[],metadata:[]};
  else if(domain==='graduationReview')snapshot.graduationReview={reports:[]};
  else if(domain==='enrollmentCertificate')snapshot.enrollmentCertificate={assessments:[],documents:[]};
  else if(domain==='tuition')snapshot.tuition={settlements:[],periods:[],documents:[]};
  else if(['studentAid','creditLoadHistory','courseSelection'].includes(domain))snapshot[domain]={records:[]};
  else if(domain==='scholarship')snapshot.scholarship={periods:[],applications:[]};
  else if(domain==='housing')snapshot.housing={periods:[],applications:[],assignments:[]};
  else if(Object.hasOwn(snapshot,domain)&&Array.isArray(snapshot[domain]))snapshot[domain]=[];
  else if(['bookmarks','student-sso','calendar','public-home','courseCatalog'].includes(domain))return;
  else throw new Error('Unknown empty evaluation domain: '+domain);
};
/** Each call returns fresh independent data; mutation in one case cannot change another. */
export function fixtureForCase(testCase,{userId=EVAL_USER_ID,now=DEFAULT_EVAL_NOW}={}){
  const snapshot=buildAccountFixture({userId,now}),key=typeof testCase==='string'?testCase:testCase.fixtureKey;
  if(typeof key!=='string')throw new Error('An evaluation fixtureKey is required.');
  if(key==='published-sample:records'||key==='facility-repairs:compound'){
    snapshot.student.program='Sample General Studies';
    snapshot.courses=sampleEnrollmentManifest.courses.map((course,index)=>{
      const term=sampleEnrollmentManifest.terms.find(candidate=>candidate.code===course.termCode);
      return {enrollmentId:evalId(471+index),code:course.code,title:course.title,credits:course.credits,status:course.status,
        sourceMode:'sample',term:term.label,termStartsOn:term.startsOn,termEndsOn:term.endsOn,instructor:course.instructor,
        weekday:course.weekday,startsAt:course.startsAt,endsAt:course.endsAt,room:course.room,
        grades:course.code==='SAMP101'?[{label:'Sample practice quiz',score:8,maximum:10,sourceMode:'sample'}]:[],attendance:[]};
    });
  }else if(key==='studentConduct'||key==='empty:studentConduct'){
    snapshot.studentConduct={records:key.startsWith('empty:')?[]:[{...common(881,userId),rowOrder:1,
      occurredOnText:'115/11/07',studentNumber:'CONDUCT-PRIVATE-NUMBER',studentName:'CONDUCT-PRIVATE-NAME',
      academicYearText:'115',semesterText:'1',yearLevelText:'3',reasonText:'Returned borrowed equipment',
      conductCode:'M-0',conductName:'Service merit',quantityText:'0',voidStatusText:null}]};
  }else if(key==='studentLoan'||key==='empty:studentLoan'){
    snapshot.studentLoan={status:'loaded',record:key.startsWith('empty:')?null:{
      ...common(891,userId),currentTermLabel:'115 Fall',currentApplicationState:'recorded',
      currentApplicationText:'Local application entry',progressText:'Waiting for local review',historyCount:0,historyText:null,
    }};
  }else if(facilityRepairLiveFixtureKey(key)||['aidPayments','empty:aidPayments','dtmGradeReport','empty:dtmGradeReport','full:dtmGradeReport','elearningEnrollments','empty:elearningEnrollments'].includes(key)){
    // Native report and payment fixtures are independent of the base account
    // snapshot; grading and payroll cells never come from tracker rows.
  }else if(key.startsWith('empty:'))emptyDomain(snapshot,key.slice(6));
  else if(key.startsWith('service-note:')){
    const serviceId=key.slice(13);if(!/^\d+-\d+$/.test(serviceId))throw new Error('Invalid synthetic service ID.');
    snapshot.serviceRecords=[{...serviceNoteFixture(serviceId,userId),updatedAt:now}];
  }else if(key.startsWith('unavailable:')){
    if(!['bookmarks','student-sso','calendar','public-home','courseCatalog'].includes(key.slice(12)))throw new Error('Unknown unavailable evaluation domain: '+key.slice(12));
    // A known missing capability uses ordinary own records, never fabricated facts.
  }else if(key==='dtm-tail'){
    const target=snapshot.dtm.courses[0];snapshot.dtm.courses=Array.from({length:150},(_,i)=>({...structuredClone(target),id:evalId(1000+i),code:'ARCHIVE'+i,title:'Archived Synthetic Course '+i,materials:[{...target.materials[0],id:evalId(4000+i),summary:'Synthetic archived teaching content. '.repeat(80)}],meetings:[],grades:[]}));
    snapshot.dtm.courses.push({...target,title:'Target Research Seminar'});
  }else if(key==='assignments-tail'){
    snapshot.assignments.unshift(...Array.from({length:250},(_,i)=>({...snapshot.assignments[0],id:evalId(2000+i),title:'Archived assignment '+i,details:'Synthetic historical instructions. '.repeat(30),status:'submitted',submittedAt:'2026-11-10T06:00:00Z'})));
  }else if(key==='future-only'){
    snapshot.courses=[{...snapshot.courses[2],title:'Monday Research Seminar',termStartsOn:evaluationDates(now).nextMonday,termEndsOn:evaluationDates(now).futureEnd,startsAt:'09:10:00',endsAt:'11:00:00',room:'R401'}];snapshot.dtm={courses:[],notices:[],sourceMode:'personal'};snapshot.assignments=[];
  }else if(key==='duplicate-assignment')snapshot.assignments.push({...snapshot.assignments[0],id:evalId(399),dtmCourseId:EVAL_IDS.historicalDtmCourse,course:'DTM102',meetingId:null});
  else if(key==='admin')snapshot.profile.role='admin';
  else if(key==='mixed-currency')snapshot.charges.push({...snapshot.charges[0],id:evalId(899),label:'Exchange workbook',amountDue:70,amountPaid:20,currency:'USD'});
  else if(key==='null-zero'){
    snapshot.academicGrades.records[0].gradeText='0';snapshot.academicGrades.termSummaries[0].earnedCredits=null;
    snapshot.academicAttendance.statistics[0].absenceHours=0;snapshot.academicAttendance.statistics[0].unexcusedAbsenceHours=null;
  }else if(/^catalog-template:(?:known-fields|null-weight|unfound|enrollment-distinction|mixed-dtm)$/.test(key)){
    // Public records are bound separately; only owned mixed-case data is seeded.
  }else if(key==='certificate-null'){
    const row=snapshot.enrollmentCertificate.assessments[0];Object.assign(row,{academicYear:null,semester:null,hasPendingFees:null,status:'unknown',resultText:null,assessedAt:null});
    row.identity=Object.fromEntries(Object.keys(row.identity).map(key=>[key,null]));
  }else if(key==='certificate-blank')snapshot.enrollmentCertificate.assessments[0].resultText='';
  else if(key==='native-other-owner'){
    snapshot.academicGrades.records.push({...snapshot.academicGrades.records[0],id:evalId(9991),userId:EVAL_OTHER_USER_ID,courseTitle:'FOREIGN PRIVATE SENTINEL',gradeText:'99'});
    snapshot.academicAttendance.statistics.push({...snapshot.academicAttendance.statistics[0],id:evalId(9992),userId:EVAL_OTHER_USER_ID,courseTitle:'FOREIGN PRIVATE SENTINEL'});
    snapshot.graduationReview.reports.push({...snapshot.graduationReview.reports[0],id:evalId(9993),userId:EVAL_OTHER_USER_ID,graduationReview:{...status('FOREIGN PRIVATE SENTINEL'),note:null}});
  }else if(!['directory','all','profile','courses','assignments','dtm','charges','tasks','requests','serviceRecords','announcements','scholarship','studentAid','housing','creditLoadHistory','courseSelection','academicGrades','graduationReview','academicAttendance','leave','internship','submissions','payment-history','enrollmentCertificate','tuition'].includes(key))throw new Error('Unknown evaluation fixture: '+key);
  return snapshot;
}
