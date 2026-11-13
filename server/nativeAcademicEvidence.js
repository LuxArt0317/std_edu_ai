// Pure, read-only evidence projection. These collections are account records,
// not a university sync and not an eligibility calculation.
const basePath='/school-affairs/services/13-1';
const graduationPath=basePath+'/graduation';
const graduationPaths={academic_services:graduationPath,legacy:'/school-affairs/services/15-2'};
const attendancePath='/school-affairs/services/14-1';
const own=(value,key)=>Object.hasOwn(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const list=value=>Array.isArray(value)?value:[];
const scalar=value=>value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value);
const provenance=['sourceMode','version','createdAt','updatedAt'];
const academicFields={
  records:['id',...provenance,'recordKind','academicYear','semester','courseTitle','courseCode','categoryText','moduleName','requiredElectiveText','credits','gradeText','remarkText','rowOrder'],
  termSummaries:['id',...provenance,'summaryKind','academicYear','semester','earnedCredits','averageGradeText','attemptedCredits','passedCredits','failedCredits'],
  rankings:['id',...provenance,'academicYear','semester','departmentRankingText','classRankingText'],
  metadata:['id',...provenance,'classLabel','englishRequirementText'],
};
const attendanceFields={
  statistics:['id',...provenance,'academicYear','semester','rowOrder','courseCode','courseTitle','totalTeachingHours','currentTeachingWeeks','currentTeachingHours','absenceHours','unexcusedAbsenceHours'],
  details:['id',...provenance,'academicYear','semester','rowOrder','courseCode','courseTitle','teacherName','absenceTypeText','courseDate','periodText','rollCalledAt'],
  metadata:['id',...provenance,'currentAcademicYear','currentSemester'],
};
const identityFields=['departmentName','yearText','enrollmentStatusText','curriculumCohortText','doubleMajorText','minorText'];
const actualFields=['id','sequenceText','title','credits','requiredElectiveText','yearText','transferText'];

function callerId(snapshot){
  const profile=object(snapshot)&&object(snapshot.profile)?snapshot.profile:null;
  return profile&&own(profile,'userId')&&typeof profile.userId==='string'&&profile.userId.trim()?profile.userId:null;
}
function ownedRows(rows,id){
  if(!id)return [];
  return list(rows).filter(row=>object(row)&&own(row,'userId')&&row.userId===id);
}
function projection(){
  let suppressedValues=0;
  const pick=(row,keys)=>{
    const result={};
    if(!object(row))return result;
    for(const key of keys)if(own(row,key)&&row[key]!==undefined){
      if(scalar(row[key]))result[key]=row[key];else suppressedValues++;
    }
    return result;
  };
  return {pick,suppressed:()=>suppressedValues};
}
function counts(collections){
  return Object.entries(collections).map(([collection,rows])=>({collection,availableRows:rows.length,includedRows:rows.length,partial:false}));
}
function coverage(id,pick,extra={}){
  return [{scope:'loaded_owned_snapshot',callerPresent:Boolean(id),historyCompleteness:'unknown',projectionPartial:pick.suppressed()>0,suppressedValues:pick.suppressed(),...extra}];
}
function academicProjection(snapshot,id){
  const bundle=object(snapshot?.academicGrades)?snapshot.academicGrades:{},safe=projection(),collections={};
  for(const [key,fields] of Object.entries(academicFields))collections[key]=ownedRows(bundle[key],id).map(row=>({
    ...safe.pick(row,fields),
    sourceUrl:key==='rankings'?basePath+'/ranking':key==='metadata'?basePath+'/transcript':row[key==='records'?'recordKind':'summaryKind']==='warning'?basePath+'/warning':basePath+'/transcript',
  }));
  return {coverage:coverage(id,safe),counts:counts(collections),...collections};
}
function attendanceProjection(snapshot,id){
  const bundle=object(snapshot?.academicAttendance)?snapshot.academicAttendance:{},safe=projection(),collections={};
  for(const [key,fields] of Object.entries(attendanceFields))collections[key]=ownedRows(bundle[key],id).map(row=>({
    ...safe.pick(row,fields),sourceUrl:key==='details'?attendancePath+'/detail':attendancePath,
  }));
  return {coverage:coverage(id,safe,{currentTermSource:'explicit_metadata',statisticsDerivedFromDetails:false,detailRowsAreDateCount:false}),counts:counts(collections),...collections};
}
function graduationProjection(snapshot,id){
  const owned=ownedRows(snapshot?.graduationReview?.reports,id),safe=projection();
  const reports=owned.filter(report=>own(report,'reportKind')&&typeof report.reportKind==='string'&&Object.hasOwn(graduationPaths,report.reportKind));
  const collections={reportMetadata:[],statuses:[],languageRequirements:[],categories:[],requirements:[],matchedCourses:[],otherCourses:[]};
  for(const report of reports){
    const context={...safe.pick(report,['sourceMode','version','reportKind']),...safe.pick({reportId:report.id},['reportId']),sourceUrl:graduationPaths[report.reportKind]};
    // Split metadata and long notes too: a long academic context or note must
    // not cause boundedValue to discard the report's short provenance row.
    collections.reportMetadata.push({...context,recordKind:'report',...safe.pick(report,['id','reportedAt','createdAt','updatedAt'])});
    collections.reportMetadata.push({...context,recordKind:'academicContext',...safe.pick(report.identity,identityFields)});
    collections.reportMetadata.push({...context,recordKind:'graduationReviewNote',...safe.pick(report.graduationReview,['note'])});
    // Put the explicit overall result first; retain the other independent
    // statuses without computing one from the others. The long note is above.
    for(const statusKey of ['graduationReview','educationProgram','foreignLanguageCompletion','englishRequirement']){
      collections.statuses.push({...context,statusKey,...safe.pick(report[statusKey],['text','indicator'])});
    }
    // Nested rows belong to this strictly owned report; they have no separate
    // owner column in the validated report schema. Unknown keys are never read.
    for(const row of list(report.languageRequirements).filter(object))collections.languageRequirements.push({
      ...context,...safe.pick(row,['id','label','requiredCredits','matchedCredits','missingCredits']),
      ...safe.pick({statusText:row.status?.text,statusIndicator:row.status?.indicator},['statusText','statusIndicator']),
    });
    for(const category of list(report.categories).filter(object)){
      const categoryContext={...context,...safe.pick({categoryId:category.id},['categoryId'])};
      collections.categories.push({...categoryContext,...safe.pick(category,['id','label','requiredElectiveText','requiredCredits','completedCredits','matchedCredits','excludedCredits','detailSubtotalCredits']),
        ...safe.pick({statusText:category.status?.text,statusIndicator:category.status?.indicator},['statusText','statusIndicator'])});
      for(const requirement of list(category.requirements).filter(object)){
        const requirementContext={...categoryContext,...safe.pick({requirementId:requirement.id},['requirementId'])};
        collections.requirements.push({...requirementContext,...safe.pick(requirement,['id','sequenceText','title','moduleText','credits','requiredElectiveText','yearText','transferText','indicator'])});
        for(const course of list(requirement.matchedCourses).filter(object))collections.matchedCourses.push({...requirementContext,...safe.pick(course,actualFields)});
      }
    }
    for(const course of list(report.otherCourses).filter(object))collections.otherCourses.push({...context,...safe.pick(course,actualFields)});
  }
  // Two different report kinds are independent. Expose malformed same-kind
  // multiplicity instead of merging their status or credit fields.
  const academicServicesReports=reports.filter(report=>report.reportKind==='academic_services').length;
  const legacyReports=reports.filter(report=>report.reportKind==='legacy').length;
  return {coverage:coverage(id,safe,{ownedReports:reports.length,multipleReports:reports.length>1,
    academicServicesReports,legacyReports,duplicateReportKind:academicServicesReports>1||legacyReports>1,
    suppressedReportKinds:owned.length-reports.length,projectionPartial:owned.length!==reports.length||safe.suppressed()>0}),
    counts:[{collection:'reports',availableRows:reports.length,includedRows:reports.length,partial:false},...counts(collections)],...collections};
}

/** Unknown keys fail closed; do not use this as a generic snapshot passthrough. */
export function nativeAcademicCollection(snapshot,key){
  if(key!=='academicGrades'&&key!=='graduationReview'&&key!=='academicAttendance')return null;
  const id=callerId(snapshot);
  if(key==='academicGrades')return academicProjection(snapshot,id);
  return key==='academicAttendance'?attendanceProjection(snapshot,id):graduationProjection(snapshot,id);
}
