import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dtmDashboardLayoutDefaults,parseDtmDashboardLayout} from '../../../server/dtmDashboardLayout.js';
import {parseDtmCourseContentAssignmentData,parseDtmCourseContentData} from '../../../server/dtmCourseContent.js';
import {parseDtmCourseResourceData} from '../../../server/dtmCourseResource.js';
import {parseDtmGradeReportData,parseDtmGradeReportOverviewData} from '../../../server/dtmGradeReport.js';
import {fixtureIds as ids} from './assistant-renderer-inventory.mjs';

const course = {id:ids.course,code:'QA-DTM',title:'Renderer fixture DTM course',term:'115學年度第1學期'};
const material = {id:ids.material,title:'Renderer fixture DTM material',kind:'page',
  summary:'Saved renderer material description.',position:1,sourceMode:'personal'};
const assignment = {id:ids.assignment,title:'Renderer fixture DTM assignment',details:'Saved renderer assignment instructions.',
  dueAt:'2026-11-18T15:59:00Z',status:'submitted',submittedAt:'2026-11-18T16:04:00Z',sourceMode:'personal',meetingId:null,origin:'manual'};
const gradeLabel = 'Renderer fixture grade item', gradeText = 'Pass with distinction', gradeTotal = 'Renderer total';
const stamp = '2026-11-13T00:00:00Z', filename = 'renderer-submission.pdf';
const submissionId = '45000000-0000-4000-8000-000000000006', uploadId = '45000000-0000-4000-8000-000000000007';
const gradeItemId = '45000000-0000-4000-8000-000000000008', gradeReportId = '45000000-0000-4000-8000-000000000009';
const layout = parseDtmDashboardLayout({version:1,updatedAt:stamp,blocks:dtmDashboardLayoutDefaults().blocks.map(block=>
  block.id==='contacts'?{...block,region:'side-post'}:block)});
const activities = [
  {kind:'assignment',id:assignment.id,title:assignment.title,details:assignment.details,dueAt:assignment.dueAt},
  {...material,kind:'material',materialKind:material.kind,sourceUrl:null},
];
const cells = {score:null,maximum:null,gradeText:null,rangeText:null,percentageText:null,weightText:null,weightNote:null,
  rankText:null,feedbackText:null,contributionText:null};
export const rendererDtmSnapshotCourse = {...course,role:'student',sourceMode:'personal',materials:[material],meetings:[],grades:[]};
export function rendererDtmRead(url,userId) {
  const scope = url.searchParams.get('scope'), ownedCourse = {...course,userId};
  const exactQuery = (selectors={})=>assert.deepEqual(Object.fromEntries(url.searchParams),{scope,...selectors});
  const course_id = course.id, assignment_id = assignment.id, material_id = material.id;
  switch(scope){
    case 'dtm-dashboard-layout':
      exactQuery();
      return layout;
    case 'dtm-course-content':
      exactQuery({course_id});
      return parseDtmCourseContentData({course:ownedCourse,content:null,activities,total:activities.length,limit:100,nextCursor:null,
        revision:createHash('sha256').update(JSON.stringify(activities)).digest('hex'),unavailableReferenceCount:0},userId,course_id);
    case 'dtm-course-content-assignment':
      exactQuery({course_id,assignment_id});
      return parseDtmCourseContentAssignmentData({assignment:{...assignment,userId,courseId:course_id}},userId,course_id,assignment_id);
    case 'dtm-course-resource':
      exactQuery({course_id,material_id});
      return parseDtmCourseResourceData({course:{...ownedCourse,sourceMode:'personal'},
        material:{...material,userId,courseId:course_id,sourceUrl:null,targetUrl:'https://example.com/qa-material'}},userId,course_id,material_id);
    case 'dtm-grade-report':
      exactQuery({course_id});
      return parseDtmGradeReportData({report:{id:gradeReportId,userId,courseId:course_id,sourceMode:'local_demo',version:1,
        createdAt:stamp,updatedAt:stamp,items:[{...cells,id:gradeItemId,label:gradeLabel,activityKind:'assignment',gradeText}],
        total:{...cells,gradeText:gradeTotal}}},userId,course_id);
    case 'dtm-grade-report-overview':
      exactQuery();
      return parseDtmGradeReportOverviewData({courses:[{...ownedCourse,gradeText:gradeTotal}],limit:100,nextCursor:null},userId);
    case 'dtm-submission':
      exactQuery({assignment_id});
      return {assignmentId:assignment_id,userId,courseId:course_id,dueAt:assignment.dueAt,maxBytes:10485760,
        submission:{id:submissionId,user_id:userId,assignment_id,course_id,source_mode:'local_submission',version:1,current_upload_id:uploadId,
          submitted_at:assignment.submittedAt,content_modified_at:assignment.submittedAt,due_at_at_submission:assignment.dueAt},
        files:[{id:uploadId,filename,sizeBytes:512,contentType:'application/pdf',path:userId+'/'+submissionId+'/'+uploadId,state:'current',
          expiresAt:'2026-11-19T00:00:00Z',committedAt:assignment.submittedAt}],reviews:[]};
    default:
      return null;
  }
}

const coursePath = '/dtm/course/'+course.id;
const assignmentPath = coursePath+'/assignment/'+assignment.id;
const materialPath = coursePath+'/material/'+material.id;
const courseContent = {scopes:['dtm-course-content'],selector:'#material-'+material.id,text:material.title};
const dashboard = {scopes:['dtm-dashboard-layout'],selector:'.dtm-dashboard-right .dtm-contacts'};
const grades = {scopes:['dtm-grade-report-overview'],selector:'.dtm-grade-overview-table tbody',text:gradeTotal};
const submitted = {scopes:['dtm-course-content','dtm-course-content-assignment','dtm-submission'],text:filename};
const protectedReads = new Map([
  ['/dtm/dashboard',dashboard],['/dtm/my',dashboard],
  ['/dtm/grades',grades],[coursePath+'/grades/overview',grades],
  [coursePath,courseContent],[coursePath+'/materials',courseContent],
  [coursePath+'/grades',{scopes:['dtm-grade-report'],selector:'#report-item-'+gradeItemId,text:gradeText}],
  [materialPath,{scopes:['dtm-course-resource'],selector:'.dtm-course-resource h2',text:material.title}],
  [assignmentPath,{...submitted,selector:'.dtm-assignment-status-table'}],
  [assignmentPath+'/edit',{...submitted,selector:'.dtm-editor-content'}],
]);
const copyPath = path=>'/school-sites/dtm.stu.edu.tw'+path.slice('/dtm'.length);
protectedReads.set(copyPath(coursePath+'/grades/overview'),grades);
protectedReads.set(copyPath(assignmentPath+'/edit'),protectedReads.get(assignmentPath+'/edit'));
export function rendererDtmExpectation(route){return protectedReads.get(route);}
export const rendererDtmContextProbes = new Map([
  [materialPath,{route:materialPath,question:'What is this saved material about?'}],
  [coursePath+'/grades',{route:coursePath+'/grades',question:'What is my grade in this course?'}],
  [copyPath(coursePath+'/grades/overview'),{route:coursePath+'/grades/overview',question:'What grades are in my course overview?'}],
  [copyPath(assignmentPath+'/edit'),{route:assignmentPath+'/edit',question:'Was my submission late?'}],
]);
