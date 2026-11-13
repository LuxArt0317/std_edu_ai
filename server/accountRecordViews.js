import {nativeAcademicCollection} from './nativeAcademicEvidence.js';
import {academicGradesPaths,academicGradesQuery,isAcademicGradesQuestion} from './academicGrades.js';
import {graduationReviewPaths,graduationReviewQuery,graduationReviewNamesCourse,isGraduationReviewQuestion} from './graduationReview.js';
import {academicAttendancePaths,academicAttendanceQuery,academicAttendanceMatchingRows,isAcademicAttendanceQuestion} from './academicAttendance.js';
import {selectAccountEvidence,selectServiceRecords,ownEvidenceRows} from './accountEvidenceSelection.js';
import {selectedEvidenceLinks} from './accountEvidenceLinks.js';
import {schoolServiceEntries,studentServiceByKey} from '../src/features/public/affairs/studentServices.js';
const clean=value=>String(value??'—').slice(0,200);
const nativeClean=value=>{const text=String(value??'—');return text.length<=200?text:text.slice(0,199).replace(/[\ud800-\udbff]$/,'')+'…';};
const date=value=>!value?'Not set':Number.isFinite(new Date(value).getTime())?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(value)):'Invalid saved date';
const money=(value,currency='TWD')=>new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value));
const nativePredicates={academicGrades:isAcademicGradesQuestion,graduationReview:isGraduationReviewQuestion,academicAttendance:isAcademicAttendanceQuestion};
const term=row=>`${row.academicYear} / ${row.semester}`;
const display=value=>value??'not recorded';
export function nativeAccountQuery(snapshot,key,context={}){
  const collection=nativeAcademicCollection(snapshot,key);
  if(!collection)return null;
  const route=typeof context.route==='string'?context.route.split(/[?#]/)[0].replace(/\/+$/,''):'',history=context.history||[];
  const question=context.question||'',clauses=question.split(/\s+(?:and|also)\s+|[;；\n]|以及|還有/i);
  const relevant=clauses.length>1?clauses.find(clause=>nativePredicates[key](clause,'',[]))||question:question;
  let selection=null;
  const matching=Object.fromEntries(Object.entries(collection).filter(([name])=>name!=='counts'&&name!=='coverage'));
  if(key==='graduationReview'){
    selection=graduationReviewQuery(question,route,history);
    for(const name of Object.keys(matching))matching[name]=matching[name].filter(row=>!selection.multipleScopes&&row.reportKind===selection.reportKind);
    // A late named course must reach the verifier with its exact parents, not
    // disappear behind an excerpt of earlier unrelated requirements.
    const named=Object.fromEntries(['requirements','matchedCourses','otherCourses'].map(name=>[name,matching[name].filter(row=>graduationReviewNamesCourse(question,row.title))]));
    if(Object.values(named).some(rows=>rows.length)){
      selection={...selection,courseScope:'named_course_rows_and_parent_context',namedCourseRows:Object.fromEntries(Object.entries(named).map(([name,rows])=>[name,rows.length])),
        fullReportCourseRows:matching.requirements.length+matching.matchedCourses.length+matching.otherCourses.length};
      const sameRequirement=(row,child)=>row.reportId===child.reportId&&row.categoryId===child.categoryId&&row.id===child.requirementId;
      const parents=matching.requirements.filter(row=>named.matchedCourses.some(child=>sameRequirement(row,child)));
      matching.requirements=[...new Set([...named.requirements,...parents])];
      matching.matchedCourses=named.matchedCourses;matching.otherCourses=named.otherCourses;
      matching.categories=matching.categories.filter(row=>matching.requirements.some(child=>row.reportId===child.reportId&&row.id===child.categoryId));
      matching.languageRequirements=[];
    }
  }else if(nativePredicates[key](relevant,route,history)){
    if(key==='academicGrades'){
      selection=academicGradesQuery(question,route,history);
      const valid=!selection.invalid&&!selection.relativeTermUnresolved&&!selection.multipleScopes;
      const termMatches=row=>(selection.academicYear===undefined||row.academicYear===selection.academicYear)&&(selection.semester===undefined||row.semester===selection.semester);
      matching.records=collection.records.filter(row=>valid&&row.recordKind===selection.view&&termMatches(row))
        .sort((a,b)=>a.academicYear-b.academicYear||a.semester-b.semester||a.rowOrder-b.rowOrder||String(a.id).localeCompare(String(b.id)));
      matching.termSummaries=collection.termSummaries.filter(row=>valid&&row.summaryKind===selection.view&&termMatches(row));
      matching.rankings=collection.rankings.filter(row=>valid&&selection.view==='ranking'&&termMatches(row))
        .sort((a,b)=>b.academicYear-a.academicYear||b.semester-a.semester||String(a.id).localeCompare(String(b.id)));
      matching.metadata=valid&&selection.view==='english'?collection.metadata:[];
    }else{
      selection=academicAttendanceQuery(question,collection.metadata,route,history);
      matching.statistics=selection.view==='statistics'?academicAttendanceMatchingRows(collection.statistics,selection,relevant):[];
      matching.details=selection.view==='details'?academicAttendanceMatchingRows(collection.details,selection,relevant):[];
    }
  }
  return {collection,matching,selection};
}
function nativeDefinitions(snapshot,context){
  const {question=''}=context,route=typeof context.route==='string'?context.route.split(/[?#]/)[0].replace(/\/+$/,''):'';
  const gradeQuery=nativeAccountQuery(snapshot,'academicGrades',context),graduationQuery=nativeAccountQuery(snapshot,'graduationReview',context),attendanceQuery=nativeAccountQuery(snapshot,'academicAttendance',context);
  const grades=gradeQuery.matching,graduation=graduationQuery.matching,attendance=attendanceQuery.matching;
  const gradePath=academicGradesPaths[gradeQuery.selection?.view] || (['english','gpa'].includes(gradeQuery.selection?.view)?academicGradesPaths.transcript:academicGradesPaths.index);
  const ranking=gradePath===academicGradesPaths.ranking,warning=gradePath===academicGradesPaths.warning;
  const unavailable=[academicGradesPaths.current,academicGradesPaths.transfer,academicGradesPaths.cycle].includes(gradePath);
  const gradeRows=unavailable?[]:ranking?grades.rankings.map(row=>[term(row),row.departmentRankingText,row.classRankingText,row.sourceMode]):[
    ...grades.records.filter(row=>row.recordKind===(warning?'warning':'transcript')).map(row=>[term(row),row.courseTitle,row.credits,row.gradeText,row.sourceMode]),
    ...grades.termSummaries.filter(row=>row.summaryKind===(warning?'warning':'transcript')).map(row=>[term(row),'Stored term summary',warning?row.attemptedCredits:row.earnedCredits,
      warning?`Passed: ${display(row.passedCredits)}; failed: ${display(row.failedCredits)}`:row.averageGradeText,row.sourceMode]),
  ];
  const kind=graduationQuery.selection.reportKind,selectedPath=graduationReviewPaths[kind];
  const reports=graduation.reportMetadata.filter(row=>row.recordKind==='report'&&row.reportKind===kind);
  const reportId=reports.length===1?reports[0].reportId:undefined;
  const selected=rows=>reportId===undefined?[]:rows.filter(row=>row.reportKind===kind&&row.reportId===reportId);
  const namedCourses=graduationQuery.selection.courseScope==='named_course_rows_and_parent_context';
  const courseRows=namedCourses?[
    ...selected(graduation.matchedCourses).map(row=>[kind,'Matched course',row.title,
      `Credits: ${display(row.credits)}; parent requirement: ${display(graduation.requirements.find(parent=>parent.reportId===row.reportId&&parent.categoryId===row.categoryId&&parent.id===row.requirementId)?.title)}`,row.sourceMode]),
    ...selected(graduation.otherCourses).map(row=>[kind,'Other actual course',row.title,`Credits: ${display(row.credits)}`,row.sourceMode]),
    ...selected(graduation.requirements).map(row=>[kind,graduationReviewNamesCourse(question,row.title)?'Required course':'Parent requirement',row.title,`Credits: ${display(row.credits)}`,row.sourceMode]),
  ]:[];
  const graduationRows=[...courseRows,
    ...selected(graduation.statuses).map(row=>[kind,row.statusKey,row.text,row.indicator,row.sourceMode]),
    ...selected(graduation.categories).map(row=>[kind,row.label,row.statusText,
      `Required: ${display(row.requiredCredits)}; completed: ${display(row.completedCredits)}; matched: ${display(row.matchedCredits)}; excluded: ${display(row.excludedCredits)}; subtotal: ${display(row.detailSubtotalCredits)}`,row.sourceMode]),
    ...selected(graduation.languageRequirements).map(row=>[kind,row.label,row.statusText,
      `Required: ${display(row.requiredCredits)}; matched: ${display(row.matchedCredits)}; missing: ${display(row.missingCredits)}`,row.sourceMode]),
  ];
  const attendancePath=attendanceQuery.selection?.view==='details'||!attendanceQuery.selection&&route===academicAttendancePaths.detail?academicAttendancePaths.detail:academicAttendancePaths.statistics;
  const detail=attendancePath===academicAttendancePaths.detail;
  const attendanceRows=detail?attendance.details.map(row=>[`${term(row)} · ${row.courseCode} ${row.courseTitle}`,row.courseDate,
    `${display(row.absenceTypeText)} / ${display(row.periodText)}`,row.rollCalledAt,row.sourceMode])
    :attendance.statistics.map(row=>[term(row),`${row.courseCode} ${row.courseTitle}`,row.absenceHours,row.unexcusedAbsenceHours,row.sourceMode]);
  const meta=attendance.metadata.length===1?attendance.metadata[0]:undefined;
  const current=meta?.currentAcademicYear!=null&&meta?.currentSemester!=null?`${meta.currentAcademicYear}/${meta.currentSemester}`:'not designated';
  return {
    academicGrades:[ranking?'Academic semester rankings':warning?'Academic warning records':'Academic transcript records',gradePath,
      ranking?['Term','Department ranking','Class ranking','Data']:['Term','Course / summary','Credits','Literal result','Data'],gradeRows,row=>row,
      gradeQuery.selection?.multipleScopes?'Clarification required: choose one academic view/term; no records selected.':unavailable?'This view has no populated local grade model.':gradeQuery.selection?'Selected view/term only. GPA is not stored. Summaries are explicit, not recomputed.':'All loaded terms. GPA is not stored. Summaries are explicit, not recomputed.',gradeQuery.collection.coverage[0]],
    graduationReview:[kind==='legacy'?'Legacy graduation reference':'Academic Services graduation reference',selectedPath,
      ['Report kind','Status / category','Literal status','Indicator / credits','Data'],graduationRows,row=>row,
      graduationQuery.selection.multipleScopes?'Clarification required: choose one graduation report kind; no records selected.':reports.length!==1?'No unique requested-kind report; no other kind is substituted.':namedCourses?'Named course rows and their parent context only; no eligibility decision.':`Only ${kind}; statuses/credits are reference values, not an eligibility decision.`,graduationQuery.collection.coverage[0]],
    academicAttendance:[detail?'Native absence details':'Native absence statistics',attendancePath,
      detail?['Term / course','Course date','Type / periods','Roll-call timestamp','Data']:['Term','Course','Absence hours','Unexcused hours','Data'],attendanceRows,row=>row,
      attendanceQuery.selection?.reason==='multiple_scopes'?'Clarification required: choose one attendance view/term/course; no records selected.':`${attendanceQuery.selection?'Selected view/term only.':'All loaded terms.'} Explicit current term: ${current}. No hours inferred from details or leave.`,attendanceQuery.collection.coverage[0]],
  };
}
export function accountRecordViews(snapshot,tools,context={}){
  const userId=snapshot.profile?.userId;
  const selectedRows=key=>{
    const value=selectAccountEvidence(snapshot,key,context)?.records;
    return Array.isArray(value)?value:ownEvidenceRows(snapshot[key],userId);
  };
  const dtmSelection=selectAccountEvidence(snapshot,'dtm',context),dtm=dtmSelection?.records||{courses:[]};
  const assignments=selectedRows('assignments'),serviceSelection=selectServiceRecords(snapshot,context);
  const courseUrl=id=>{
    if(typeof id!=='string')return null;
    return selectedEvidenceLinks('dtm',{courses:[{id}]}).find(path=>path.startsWith('/dtm/course/'))||null;
  };
  const dtmUrl=dtm.courses.length===1?courseUrl(dtm.courses[0].id)||'/dtm':'/dtm';
  const assignmentCourses=[...new Set(assignments.map(row=>row.dtmCourseId).filter(Boolean))];
  const assignmentCourse=assignmentCourses.length===1?courseUrl(assignmentCourses[0]):assignments.length===0&&dtm.courses.length===1?courseUrl(dtm.courses[0].id):null;
  const serviceTitle=key=>studentServiceByKey(key)?.title||schoolServiceEntries.find(row=>row.id===key)?.title||'Unknown service';
  const serviceScope=serviceSelection.selection.requestedReference&&serviceSelection.selection.matchedReference===false
    ?'No saved note matched the requested reference; unrelated records were not substituted.'
    :'Only selected owned local tracking records are shown; notes/statuses do not establish university approval, payment or official submission.';
  const definitions={
    courses:['Subjects','/school-affairs/records',['Subject','Term','Status','Room','Data'],selectedRows('courses'),row=>[`${row.code} ${row.title}`,row.term,row.status,row.room,row.sourceMode]],
    charges:['Tuition and fees','/school-affairs/services/39-1',['Item','Due','Paid','Remaining','Data'],selectedRows('charges'),row=>[row.label,money(row.amountDue,row.currency),money(row.amountPaid,row.currency),money(Number(row.amountDue)-Number(row.amountPaid),row.currency),row.sourceMode]],
    assignments:['Assignment tracker',assignmentCourse?assignmentCourse+'/assignments':'/dtm/assignments',['Assignment','Course','Due (Taipei)','Status','Data'],assignments,row=>[row.title,row.course,date(row.dueAt),row.status,row.sourceMode],'Selected owned assignments only; other courses are not evidence for this selection.'],
    tasks:['Your tasks','/school-affairs/records',['Task','Due (Taipei)','Status'],selectedRows('tasks'),row=>[row.title,date(row.dueAt),row.completedAt?'Complete':'Open']],
    requests:['Your service requests','/school-affairs/records',['Request','Type','Status'],selectedRows('requests'),row=>[row.title,row.type,row.status]],
    dtm:['DTM courses',dtmUrl,['Course','Term','Materials','Data'],dtm.courses,row=>[`${row.code} ${row.title}`,row.term,String(row.materials?.length||0),row.sourceMode],'Selected owned courses and materials only; omitted courses are not counted.'],
    serviceRecords:['Your service records',serviceSelection.url,['Service','Record','Type','Status','Starts'],serviceSelection.records,row=>[serviceTitle(row.serviceKey),row.title,row.recordType,row.reviewStatus||row.status,row.startsOn],serviceScope],
    ...nativeDefinitions(snapshot,context),
  };
  const route=typeof context.route==='string'?context.route.split(/[?#]/)[0].replace(/\/+$/,''):'';
  const priority=tools.filter(key=>Object.hasOwn(nativePredicates,key)&&(!context.question||nativePredicates[key](context.question,route,context.history||[])));
  return [...new Set([...priority,...tools])].filter(key=>Object.hasOwn(definitions,key)).slice(0,3).map(key=>{
    const [title,url,columns,records,values,scope,coverage]=definitions[key],native=Object.hasOwn(nativePredicates,key);
    return {id:key,title,url,columns,rows:records.slice(0,12).map(row=>values(row).map(native?nativeClean:clean)),total:records.length,checkedAt:snapshot.checkedAt,
      note:native?`Own loaded snapshot: ${Math.min(12,records.length)}/${records.length} rows shown. local_demo; no university sync; history completeness unknown. ${scope} Compact fields; long cells abbreviated.${coverage.projectionPartial?' Some source values were suppressed.':''}`
        :`Retrieved stu.best records. “sample” means demonstration data. This is not a live university sync. Showing ${Math.min(12,records.length)} of ${records.length} selected rows. ${scope||'Collections may be limited as described in the answer.'}`};
  });
}
