import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
import {nativeAcademicCollection,type NativeAcademicEvidenceRow} from '../../server/nativeAcademicEvidence.js';
import {accountEvidence} from '../../server/answerVerificationAccount.js';
import {graduationPageGuide} from '../../server/graduationPageGuide.js';

const owner='own-account',other='other-account',date='2026-11-12T10:00:00Z';
const base={id:'row-one',userId:owner,sourceMode:'local_demo',version:4,createdAt:date,updatedAt:date};
const course={id:'same-course',sequenceText:null,title:'Synthetic actual course',credits:0,requiredElectiveText:null,yearText:null,transferText:null};
const requirement={id:'requirement-one',sequenceText:'R-A',title:'Synthetic requirement',moduleText:null,credits:8,requiredElectiveText:'必',yearText:null,transferText:null,indicator:'attention',matchedCourses:[course]};
const category={id:'category-one',label:'Synthetic category',requiredElectiveText:'必',requiredCredits:8,completedCredits:9,matchedCredits:7,excludedCredits:0,status:{text:'Explicit stored category status',indicator:'passed'},requirements:[requirement],detailSubtotalCredits:2.5};
const report={...base,id:'report-one',reportKind:'academic_services',reportedAt:null,identity:{studentNumber:'SECRET-STUDENT-NUMBER',studentName:'SECRET-NAME',departmentName:'Synthetic department',yearText:'一',enrollmentStatusText:null,curriculumCohortText:'Synthetic cohort',doubleMajorText:null,minorText:null},
  educationProgram:{text:'N',indicator:null},foreignLanguageCompletion:{text:'N',indicator:'attention'},englishRequirement:{text:null,indicator:null},graduationReview:{text:'Explicitly pending',indicator:'attention',note:'Synthetic review note'},
  languageRequirements:[{id:'language-one',label:'Synthetic language requirement',status:{text:'Literal language status',indicator:null},requiredCredits:8,matchedCredits:0,missingCredits:null}],categories:[category],otherCourses:[course]};
const grade={...base,recordKind:'transcript',academicYear:115,semester:1,courseTitle:'Synthetic course',courseCode:null,categoryText:null,moduleName:null,requiredElectiveText:null,credits:0,gradeText:'P / <literal>',remarkText:null,rowOrder:0};
const termSummary={...base,id:'summary-one',summaryKind:'warning',academicYear:115,semester:1,earnedCredits:null,averageGradeText:null,attemptedCredits:0,passedCredits:null,failedCredits:8.5};
const ranking={...base,id:'ranking-one',academicYear:115,semester:1,departmentRankingText:'Literal 2 / 45 (percent unpublished)',classRankingText:null};
const metadata={...base,id:'metadata-one',classLabel:null,englishRequirementText:'Stored requirement result'};
const academicGrades={records:[grade],termSummaries:[termSummary],rankings:[ranking],metadata:[metadata]};
const snapshot={profile:{userId:owner,email:'SECRET-EMAIL'},academicGrades,graduationReview:{reports:[report]}};

test('personal graduation evidence includes curriculum navigation without inferring cohort or eligibility',()=>{
 for(const [kind,route] of [['academic_services','/school-affairs/services/15-1'],['legacy','/school-affairs/services/15-2']] as const){
  const evidence=accountEvidence({...snapshot,checkedAt:date,courses:[],dtm:{courses:[],assignments:[]}},['graduationReview'],{
   question:'What are the graduation requirements for my department?',route,scopedReadOnly:true});
  const source=evidence.find(row=>row.id==='account:graduationReview')!;
  const guide=JSON.parse(source.content).pageGuide;
  assert.deepEqual(guide,graduationPageGuide(kind));
  assert.ok(source.urls?.includes('/school-affairs/services/12-5'));
  assert.equal(guide.review.reportKind,kind);
  assert.match(guide.interpretation,/year level does not establish entry cohort/u);
  assert.match(guide.interpretation,/Total credits alone do not establish/u);
  assert.match(guide.curriculum.capability,/not proof its contents were read/u);
  assert.doesNotMatch(JSON.stringify(guide),/SECRET-EMAIL|Synthetic review note|128 credits/u);
 }
 assert.equal(graduationPageGuide('foreign-kind'),null);
});
const copy=<T>(value:T):T=>structuredClone(value);
const count=(rows:Array<{collection:string;availableRows:number}>,key:string)=>rows.find(row=>row.collection===key)?.availableRows;
type BoundedPart={records:NativeAcademicEvidenceRow[];excerpted:boolean;availableRows?:number;includedRows?:number};
function budgetProjection(value:unknown,budget:number){
  // Exercise the actual private helper read-only, without importing the shared
  // endpoint graph, changing its exports or maintaining a duplicate budgeter.
  const source=readFileSync(new URL('../../server/answerVerificationAccount.js',import.meta.url),'utf8'),start=source.indexOf('function boundedValue('),end=source.indexOf('\nexport function accountEvidence',start);
  assert.ok(start>=0&&end>start,'The shared budget helper must remain identifiable.');
  const bound=runInNewContext(source.slice(start,end)+'\nboundedValue') as (value:unknown,budget:number)=>{records:Record<string,BoundedPart>;excerpted:boolean};
  return bound(value,budget);
}

test('all four academic collections require a nonempty caller and an explicitly matching owner',()=>{
  const mixed=Object.fromEntries(Object.entries(academicGrades).map(([key,rows])=>[key,[{...rows[0],userId:other,courseTitle:'FOREIGN-PRIVATE'},rows[0],{...rows[0],userId:undefined,courseTitle:'OWNERLESS-PRIVATE'},{...rows[0],userId:null},null]]));
  const value=nativeAcademicCollection({profile:{userId:owner},academicGrades:mixed},'academicGrades');
  for(const key of ['records','termSummaries','rankings','metadata'] as const){assert.equal(value[key].length,1);assert.equal(count(value.counts,key),1);assert.equal(value[key][0].userId,undefined);}
  assert.doesNotMatch(JSON.stringify(value),/FOREIGN-PRIVATE|OWNERLESS-PRIVATE/);
  for(const userId of ['',undefined,null,'   ',0]){
    const empty=nativeAcademicCollection({profile:{userId},academicGrades:mixed},'academicGrades');
    assert.equal(empty.coverage[0].callerPresent,false);for(const key of ['records','termSummaries','rankings','metadata'] as const)assert.equal(empty[key].length,0);
  }
  const inherited=Object.assign(Object.create({userId:owner}),{id:'inherited',courseTitle:'INHERITED-PRIVATE'});
  assert.equal(nativeAcademicCollection({profile:{userId:owner},academicGrades:{records:[inherited]}},'academicGrades').records.length,0);
  assert.equal(nativeAcademicCollection({profile:{userId:' '+owner},academicGrades},'academicGrades').records.length,0,'No coercion or trimmed owner matching.');
});

test('academic evidence preserves explicit literals/null/zero/provenance and fixed native links without copying secrets',()=>{
  const input=copy(snapshot);Object.assign(input.academicGrades.records[0],{accessToken:'SECRET-TOKEN',password:'SECRET-PASSWORD',sourceUrl:'https://untrusted.invalid/SECRET-URL',privateIdentity:{number:'SECRET-ID'}});
  const before=JSON.stringify(input),value=nativeAcademicCollection(input,'academicGrades');
  assert.equal(value.records[0].credits,0);assert.equal(value.records[0].gradeText,'P / <literal>');assert.equal(value.records[0].moduleName,null);assert.equal(value.records[0].sourceMode,'local_demo');assert.equal(value.records[0].version,4);
  assert.equal(value.termSummaries[0].attemptedCredits,0);assert.equal(value.termSummaries[0].passedCredits,null);assert.equal(value.termSummaries[0].failedCredits,8.5);assert.equal(value.termSummaries[0].earnedCredits,null);
  assert.equal(value.rankings[0].departmentRankingText,ranking.departmentRankingText);assert.equal(value.rankings[0].classRankingText,null);assert.equal(value.metadata[0].classLabel,null);
  assert.equal(value.records[0].sourceUrl,'/school-affairs/services/13-1/transcript');assert.equal(value.termSummaries[0].sourceUrl,'/school-affairs/services/13-1/warning');assert.equal(value.rankings[0].sourceUrl,'/school-affairs/services/13-1/ranking');
  assert.equal(value.coverage[0].historyCompleteness,'unknown');assert.equal(value.coverage[0].projectionPartial,false);
  assert.doesNotMatch(JSON.stringify(value),/SECRET-|accessToken|password|privateIdentity|userId/);assert.equal(JSON.stringify(input),before);
});

test('graduation rejects cross-account/ownerless reports and excludes unnecessary personal identity at every depth',()=>{
  const input=copy(snapshot);Object.assign(input.graduationReview.reports[0],{email:'SECRET-REPORT-EMAIL',token:'SECRET-TOKEN'});Object.assign(input.graduationReview.reports[0].identity,{nationalId:'SECRET-ID',address:'SECRET-ADDRESS'});Object.assign(input.graduationReview.reports[0].categories[0],{privateNotes:'SECRET-CATEGORY'});Object.assign(input.graduationReview.reports[0].categories[0].requirements[0].matchedCourses[0],{apiKey:'SECRET-KEY'});
  const reports=[{...report,id:'foreign-report',userId:other,graduationReview:{text:'FOREIGN-STATUS',indicator:'passed',note:null}},{...report,id:'ownerless-report',userId:undefined},input.graduationReview.reports[0]];
  const value=nativeAcademicCollection({...input,graduationReview:{reports}},'graduationReview');
  assert.equal(value.coverage[0].ownedReports,1);assert.equal(value.coverage[0].multipleReports,false);assert.equal(count(value.counts,'reports'),1);
  assert.ok(value.reportMetadata.every(row=>row.reportId===report.id));assert.equal(value.reportMetadata.find(row=>row.recordKind==='academicContext')?.departmentName,'Synthetic department');
  assert.doesNotMatch(JSON.stringify(value),/SECRET-|FOREIGN-|foreign-report|ownerless-report|studentNumber|studentName|nationalId|address|apiKey|userId/);
  for(const userId of ['',undefined,null,'   ']){
    const empty=nativeAcademicCollection({profile:{userId},graduationReview:{reports}},'graduationReview');assert.equal(empty.reportMetadata.length,0);assert.equal(empty.statuses.length,0);assert.equal(empty.requirements.length,0);assert.equal(empty.coverage[0].ownedReports,0);
  }
});

test('graduation flattening retains independent status/credit values, source provenance and parent IDs without mutation',()=>{
  const input=copy(snapshot),before=JSON.stringify(input),value=nativeAcademicCollection(input,'graduationReview');
  assert.deepEqual(value.statuses.map(row=>[row.statusKey,row.text,row.indicator]),[['graduationReview','Explicitly pending','attention'],['educationProgram','N',null],['foreignLanguageCompletion','N','attention'],['englishRequirement',null,null]]);
  assert.equal(value.reportMetadata.find(row=>row.recordKind==='report')?.reportedAt,null);assert.equal(value.reportMetadata.find(row=>row.recordKind==='graduationReviewNote')?.note,'Synthetic review note');
  assert.equal(value.categories[0].requiredCredits,8);assert.equal(value.categories[0].completedCredits,9);assert.equal(value.categories[0].matchedCredits,7);assert.equal(value.categories[0].excludedCredits,0);assert.equal(value.categories[0].detailSubtotalCredits,2.5);assert.equal(value.categories[0].statusIndicator,'passed');
  assert.equal(value.languageRequirements[0].matchedCredits,0);assert.equal(value.languageRequirements[0].missingCredits,null);
  assert.equal(value.requirements[0].categoryId,'category-one');assert.equal(value.requirements[0].requirementId,'requirement-one');assert.equal(value.matchedCourses[0].requirementId,'requirement-one');assert.equal(value.matchedCourses[0].credits,0);
  for(const rows of [value.reportMetadata,value.statuses,value.languageRequirements,value.categories,value.requirements,value.matchedCourses,value.otherCourses])for(const row of rows){assert.equal(row.reportId,'report-one');assert.equal(row.sourceMode,'local_demo');assert.equal(row.version,4);assert.equal(row.sourceUrl,'/school-affairs/services/13-1/graduation');assert.ok(Object.values(row).every(item=>item===null||['string','number','boolean'].includes(typeof item)),'Every evidence row is flat.');}
  value.categories[0].label='Changed projected value';assert.equal(JSON.stringify(input),before,'Projection has no references to mutable source rows.');
});

test('repeated matches and multiple owned reports remain distinct with their parent IDs and explicit counts',()=>{
  const duplicated={...report,categories:[category,{...category,id:'category-two'}]};
  const value=nativeAcademicCollection({profile:{userId:owner},graduationReview:{reports:[duplicated,{...duplicated,id:'report-two',version:5}]}},'graduationReview');
  assert.equal(value.coverage[0].multipleReports,true);assert.equal(value.coverage[0].ownedReports,2);assert.equal(count(value.counts,'reports'),2);assert.equal(value.statuses.length,8);
  assert.deepEqual(value.matchedCourses.map(row=>[row.reportId,row.categoryId,row.requirementId,row.id]),[['report-one','category-one','requirement-one','same-course'],['report-one','category-two','requirement-one','same-course'],['report-two','category-one','requirement-one','same-course'],['report-two','category-two','requirement-one','same-course']]);
  assert.equal(value.otherCourses.length,2,'Matches also present in otherCourses are not deduplicated.');assert.equal(value.otherCourses[1].version,5);
  assert.equal(value.coverage[0].duplicateReportKind,true);
});

test('modern and legacy reports keep independent values and local links; unknown kinds are never treated as modern',()=>{
  const legacy={...report,id:'legacy-report',reportKind:'legacy',graduationReview:{text:'Legacy literal status',indicator:null,note:null}};
  const invalid=[undefined,'unrecognized','__proto__',['academic_services']].map((reportKind,index)=>({...report,id:'invalid-'+index,reportKind}));
  const value=nativeAcademicCollection({profile:{userId:owner},graduationReview:{reports:[legacy,report,...invalid]}},'graduationReview');
  assert.equal(value.coverage[0].academicServicesReports,1);assert.equal(value.coverage[0].legacyReports,1);
  assert.equal(value.coverage[0].duplicateReportKind,false);assert.equal(value.coverage[0].suppressedReportKinds,4);assert.equal(value.coverage[0].projectionPartial,true);
  assert.deepEqual(value.statuses.filter(row=>row.statusKey==='graduationReview').map(row=>[row.reportKind,row.text,row.sourceUrl]),[
    ['legacy','Legacy literal status','/school-affairs/services/15-2'],['academic_services','Explicitly pending','/school-affairs/services/13-1/graduation'],
  ]);
  assert.ok(value.matchedCourses.every(row=>typeof row.sourceUrl==='string'&&(row.reportKind==='legacy'?row.sourceUrl.endsWith('/15-2'):row.sourceUrl.endsWith('/13-1/graduation'))));
  assert.doesNotMatch(JSON.stringify(value),/invalid-/);
});

test('a 100-category/1000-course report remains useful through the current verifier whole-row budget',()=>{
  const big={...report,graduationReview:{...report.graduationReview,note:'N'.repeat(1000)},
    categories:Array.from({length:100},(_,categoryIndex)=>({...category,id:'category-'+categoryIndex,requirements:Array.from({length:3},(_,requirementIndex)=>({...requirement,id:'requirement-'+requirementIndex,matchedCourses:[{...course,id:'match-one'},{...course,id:'match-two'}]}))})),
    otherCourses:Array.from({length:100},(_,index)=>({...course,id:'other-'+index}))};
  const value=nativeAcademicCollection({profile:{userId:owner},graduationReview:{reports:[big]}},'graduationReview');
  assert.equal(value.categories.length,100);assert.equal(value.requirements.length,300);assert.equal(value.matchedCourses.length,600);assert.equal(value.otherCourses.length,100);assert.equal(value.requirements.length+value.matchedCourses.length+value.otherCourses.length,1000);
  assert.equal(count(value.counts,'requirements'),300);assert.equal(count(value.counts,'matchedCourses'),600);assert.equal(value.coverage[0].projectionPartial,false);assert.equal(value.coverage[0].historyCompleteness,'unknown');
  for(const budget of [24000,4500]){
    const bounded=budgetProjection(value,budget);assert.equal(bounded.excerpted,true);
    assert.ok(bounded.records.reportMetadata.records.length>0,'Short report provenance survives long report/context/note content.');
    assert.equal(bounded.records.statuses.records[0].statusKey,'graduationReview','The explicit overall status remains evidence; never recompute it.');
    for(const key of ['categories','requirements','matchedCourses','otherCourses']){const part=bounded.records[key];assert.equal(part.excerpted,true);assert.ok(part.includedRows!>0);assert.ok(part.includedRows!<part.availableRows!);assert.equal(part.availableRows,count(value.counts,key));assert.equal(part.records[0].reportId,'report-one');}
  }
});

test('unexpected object-valued fields cannot smuggle nested secrets and are marked as a partial projection',()=>{
  const value=nativeAcademicCollection({profile:{userId:owner},academicGrades:{records:[{...grade,courseTitle:{token:'SECRET-TOKEN'}}]}},'academicGrades');
  assert.equal(value.records[0].courseTitle,undefined);assert.equal(value.coverage[0].projectionPartial,true);assert.equal(value.coverage[0].suppressedValues,1);assert.doesNotMatch(JSON.stringify(value),/SECRET-TOKEN|token/);
  assert.equal(nativeAcademicCollection(snapshot,'unrecognized'),null);assert.equal(nativeAcademicCollection(snapshot,'profile'),null);
  assert.equal(nativeAcademicCollection(null,'academicGrades').records.length,0);assert.equal(nativeAcademicCollection(undefined,'graduationReview').reportMetadata.length,0);
});

const statistic={...base,id:'statistic-one',academicYear:115,semester:1,rowOrder:0,studentNumber:'SECRET-STUDENT-NUMBER',studentName:'SECRET-STUDENT-NAME',courseCode:'QA-ATTENDANCE',courseTitle:'Synthetic attendance course',totalTeachingHours:72,currentTeachingWeeks:0,currentTeachingHours:null,absenceHours:7.5,unexcusedAbsenceHours:0};
const detail={...base,id:'detail-one',academicYear:115,semester:1,rowOrder:0,courseCode:'QA-ATTENDANCE',courseTitle:'Synthetic attendance course',teacherName:'Synthetic instructor',absenceTypeText:'Literal absence category',courseDate:'2026-11-01',periodText:'午',rollCalledAt:'2026-11-03T10:00:00+08:00'};
const attendanceMetadata={...base,id:'attendance-metadata',currentAcademicYear:null,currentSemester:null};
const academicAttendance={statistics:[statistic],details:[detail],metadata:[attendanceMetadata]};

test('attendance statistics/details/metadata all enforce strict owner checks and omit redundant student identity',()=>{
  const mixed=Object.fromEntries(Object.entries(academicAttendance).map(([key,rows])=>[key,[{...rows[0],userId:other,courseTitle:'FOREIGN-ATTENDANCE'},rows[0],{...rows[0],userId:undefined,courseTitle:'OWNERLESS-ATTENDANCE'},null]]));
  const value=nativeAcademicCollection({profile:{userId:owner},academicAttendance:mixed},'academicAttendance');
  for(const key of ['statistics','details','metadata'] as const){assert.equal(value[key].length,1);assert.equal(count(value.counts,key),1);assert.equal(value[key][0].sourceMode,'local_demo');assert.equal(value[key][0].version,4);}
  assert.doesNotMatch(JSON.stringify(value),/SECRET-|FOREIGN-|OWNERLESS-|studentNumber|studentName|userId/);
  assert.equal(value.statistics[0].sourceUrl,'/school-affairs/services/14-1');assert.equal(value.details[0].sourceUrl,'/school-affairs/services/14-1/detail');assert.equal(value.metadata[0].sourceUrl,'/school-affairs/services/14-1');
  for(const userId of ['',undefined,null,'   ',0]){
    const empty=nativeAcademicCollection({profile:{userId},academicAttendance:mixed},'academicAttendance');for(const key of ['statistics','details','metadata'] as const)assert.equal(empty[key].length,0);assert.equal(empty.coverage[0].callerPresent,false);
  }
});

test('attendance retains explicit independent hours, null current-term metadata and distinct class/roll-call dates',()=>{
  const input={profile:{userId:owner},academicAttendance:{statistics:[statistic,{...statistic,id:'newer-history',academicYear:116}],details:[detail,{...detail,id:'same-date-other-period',periodText:'A',rollCalledAt:null}],metadata:[attendanceMetadata]}},before=JSON.stringify(input);
  const value=nativeAcademicCollection(input,'academicAttendance');
  assert.equal(value.statistics[0].totalTeachingHours,72);assert.equal(value.statistics[0].currentTeachingWeeks,0);assert.equal(value.statistics[0].currentTeachingHours,null);assert.equal(value.statistics[0].absenceHours,7.5);assert.equal(value.statistics[0].unexcusedAbsenceHours,0);
  assert.equal(value.details[0].courseDate,'2026-11-01');assert.equal(value.details[0].rollCalledAt,'2026-11-03T10:00:00+08:00');assert.equal(value.details[1].rollCalledAt,null);assert.equal(value.details[1].periodText,'A');assert.equal(value.details.length,2,'Same-date records remain distinct rows, not a derived date count.');
  assert.equal(value.metadata[0].currentAcademicYear,null);assert.equal(value.metadata[0].currentSemester,null);assert.equal(value.statistics[1].academicYear,116,'The newest history is retained, not relabelled as current.');
  assert.equal(value.coverage[0].currentTermSource,'explicit_metadata');assert.equal(value.coverage[0].statisticsDerivedFromDetails,false);assert.equal(value.coverage[0].detailRowsAreDateCount,false);assert.equal(value.coverage[0].historyCompleteness,'unknown');assert.equal(count(value.counts,'details'),2);
  assert.equal(value.statistics[0].dateCount,undefined);assert.equal(value.statistics[0].derivedAbsenceHours,undefined);assert.equal(JSON.stringify(input),before);
  const missing=nativeAcademicCollection({profile:{userId:owner},academicAttendance:{statistics:[statistic],details:[detail]}},'academicAttendance');assert.equal(missing.metadata.length,0,'No calendar or latest-term fallback is fabricated.');
  const designated=nativeAcademicCollection({profile:{userId:owner},academicAttendance:{...academicAttendance,metadata:[{...attendanceMetadata,currentAcademicYear:114,currentSemester:3}]}},'academicAttendance');assert.equal(designated.metadata[0].currentAcademicYear,114);assert.equal(designated.metadata[0].currentSemester,3);
});

test('large attendance evidence keeps whole rows, loaded-owned counts and explicit budget truncation',()=>{
  const rows=Array.from({length:1000},(_,index)=>({...statistic,id:'statistic-'+index,rowOrder:index})),details=Array.from({length:1000},(_,index)=>({...detail,id:'detail-'+index,rowOrder:index}));
  const value=nativeAcademicCollection({profile:{userId:owner},academicAttendance:{statistics:rows,details,metadata:[attendanceMetadata]}},'academicAttendance');
  assert.equal(value.statistics.length,1000);assert.equal(value.details.length,1000);assert.equal(count(value.counts,'statistics'),1000);assert.equal(count(value.counts,'details'),1000);assert.equal(value.coverage[0].projectionPartial,false);
  for(const budget of [24000,4500]){
    const bounded=budgetProjection(value,budget);assert.equal(bounded.excerpted,true);
    for(const key of ['statistics','details']){const part=bounded.records[key];assert.equal(part.availableRows,1000);assert.ok(part.includedRows!>0&&part.includedRows!<1000);assert.equal(part.records[0].courseCode,'QA-ATTENDANCE');}
    assert.equal(bounded.records.statistics.records[0].absenceHours,7.5);assert.equal(bounded.records.details.records[0].courseDate,'2026-11-01');assert.equal(bounded.records.details.records[0].rollCalledAt,'2026-11-03T10:00:00+08:00');
    assert.equal(bounded.records.metadata.records[0].currentAcademicYear,null);assert.equal(bounded.records.coverage.records[0].historyCompleteness,'unknown');
  }
});
