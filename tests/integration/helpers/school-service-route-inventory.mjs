import assert from 'node:assert/strict';
import {schoolServiceEntries} from '../../../src/features/public/affairs/studentServices.js';

// Explicit review inventory, not inferred from the presence of a generic body.
// A native mount says nothing about unobserved workflows or live backend acceptance.
const service = id => '/school-affairs/services/'+id;
const genericIds = '1-1 2-1 4-2 4-3 5-1 6-1 6-2 6-3 6-4 6-5 7-2 7-3 7-4 7-5 7-6 8-1 10-1 12-1 12-2 12-5 12-6 12-7 12-8 16-1 18-1 19-1 24-1 27-1 29-1 30-1 30-2 31-1 31-2 32-1 35-1 36-1 37-1 40-1 41-1 43-1 44-1 45-1 46-1 47-1 50-1 50-2 51-1 52-1 54-1 55-1 56-1 57-1 57-2 57-3 57-4'.split(' ');
const native = [
  ['7-1','.credit-load-application','credit-load-application-ui.mjs','Observed instructions and closed-period acknowledgement only; open application and staff review forms remain unobserved.'],
  ['9-1','.student-scholarship','scholarship-ui.mjs','Observed scholarship workflow; distinct from other aid forms.'],
  ['11-1','.course-selection','course-selection-ui.mjs','Phase-scoped selection history, not current enrolled courses.'],
  ['11-2','.course-selection','course-selection-ui.mjs','Explicit phase-scoped timetable, not inferred from grades.'],
  ['11-3','.credit-load-history','credit-load-history-ui.mjs','Observed history only; unseen credit-load application is excluded.'],
  ['12-3','.syllabus-search','syllabus-search-workspace-ui.mjs','Published offering search; no inferred current term.'],
  ['12-4','.course-catalog','course-catalog-ui.mjs','Offering catalog and observed syllabus; unverified instructor popup excluded.'],
  ['13-1','.academic-grades','academic-grades-ui.mjs','Academic grade index; separate from Moodle assignment grades.'],
  ['14-1','.academic-attendance','academic-attendance-ui.mjs','Explicit attendance records; no inferred leave or hour totals.'],
  ['15-1','.graduation-review','graduation-review-ui.mjs','Modern literal report; no computed eligibility.'],
  ['15-2','.legacy-graduation','legacy-graduation-review-ui.mjs','Separate legacy report; never fall back to the modern report.'],
  ['17-1','.enrollment-certificate','enrollment-certificate-ui.mjs','Observed assessment; metadata does not grant certificate download.'],
  ['21-1','.student-loan','student-loan-workspace-ui.mjs','Observed loan status/navigation; no application or payment integration.'],
  ['21-2','.education-fund','education-fund-ui.mjs','Observed closed-period instructions; application controls unobserved.'],
  ['21-3','.fee-remission','fee-remission-ui.mjs','Observed closed-period instructions and account-owned seven-column history.'],
  ['22-1','.student-aid','student-aid-ui.mjs','Observed aid record list; no inferred eligibility.'],
  ['26-1','.housing-workspace','housing-ui.mjs','Local housing application workflow; no institutional synchronization.'],
  ['34-1','.housing-history','housing-ui.mjs','Local housing history and assigned beds.'],
  ['34-2','.dorm-conduct','dorm-conduct-ui.mjs','Only empty/unknown source result observed; no populated-row schema.'],
  ['38-1','.student-conduct','student-conduct-workspace-ui.mjs','Observed table; unobserved details and document downloads disabled.'],
  ['39-1','.pending-fees','pending-fees-ui.mjs','Explicit pending charges; no payment execution.'],
  ['48-1','.tuition-documents','tuition-documents-workspace-ui.mjs','Observed summer print instructions; no verified document capability.'],
  ['48-2','.tuition-documents','tuition-documents-workspace-ui.mjs','Observed Index/unavailable destination; populated extended-study view unobserved.'],
  ['48-3','.tuition-documents','tuition-documents-workspace-ui.mjs','Observed evening print instructions; no verified document capability.'],
  ['49-1','.tuition-documents','tuition-documents-workspace-ui.mjs','Observed empty period selector; filled official result columns unobserved.'],
];
const descriptors = [
  ...genericIds.map(id => ({id,kind:'generic',href:service(id),finalUrl:service(id),selector:'.student-service',workflowSuite:null,
    sourceBoundary:'Generic personal tracker only; source destination is not implemented.'})),
  ...native.map(([id,selector,suite,sourceBoundary]) => ({id,kind:'native',href:service(id),finalUrl:service(id),selector,
    workflowSuite:'tests/integration/'+suite,sourceBoundary})),
  ...[['20-1','leave'],['33-1','leave/history']].map(([id,path]) => ({id,kind:'native',href:service(path),finalUrl:service(path),
    selector:'.student-leave',workflowSuite:'tests/integration/school-affairs-ui.mjs',sourceBoundary:'Observed Leave UI with local records; no school submission integration.'})),
  ...['25-1','25-2'].map(id => ({id,kind:'partial',href:service(id),finalUrl:service(id),selector:'.ta-index',
    workflowSuite:'tests/integration/tutor-evaluation-ui.mjs',sourceBoundary:'Observed common index, no-questionnaire page and report notice return; populated TA forms remain unobserved.'})),
  {id:'42-1',kind:'partial',href:service('42-1'),finalUrl:service('42-1'),selector:'.service-leadership',
    workflowSuite:'tests/integration/service-leadership-ui.mjs',sourceBoundary:'Observed index with four local destinations and exact university sign-in handoffs; protected details remain unobserved.'},
  {id:'28-1',kind:'native',href:service('28-1'),finalUrl:service('28-1'),selector:'.tutor-evaluation',
    workflowSuite:'tests/integration/tutor-evaluation-ui.mjs',sourceBoundary:'Observed ten-question layout with private stu.best submissions; university survey transmission is unavailable.'},
  {id:'23-1',kind:'partial',href:service('23-1'),finalUrl:service('23-1'),selector:'.exchange-grant',
    workflowSuite:'tests/integration/exchange-grant-ui.mjs',sourceBoundary:'Observed index and instructions, local conference drafts and reports; current application, roster and receipt issuance remain unverified.'},
  {id:'53-1',kind:'partial',href:service('internship'),finalUrl:service('internship'),selector:'.student-internship',
    workflowSuite:'tests/integration/school-affairs-ui.mjs',sourceBoundary:'Observed internship index; detail forms use generic local records.'},
  {id:'6-6',kind:'redirect',href:service('6-6'),finalUrl:service('11-1'),selector:'.course-selection',
    workflowSuite:'tests/unit/student-service-aliases.test.tsx',sourceBoundary:'Source confirmation redirects to selection query; no separate form observed.'},
  {id:'3-1',kind:'local-portal',href:'/school-affairs/notifications',finalUrl:'/school-affairs/notifications',selector:'.portal-page-title',heading:'通知訊息查詢',
    workflowSuite:'tests/integration/school-affairs-ui.mjs',sourceBoundary:'Local account notifications.'},
  {id:'3-2',kind:'local-portal',href:'/school-affairs/bookmarks',finalUrl:'/school-affairs/bookmarks',selector:'.portal-page-title',heading:'已收藏消息查詢',
    workflowSuite:'tests/integration/school-affairs-ui.mjs',sourceBoundary:'Local saved announcements.'},
  {id:'4-1',kind:'preview',href:'/student-sso',finalUrl:'/student-sso',selector:'.student-sso-preview',workflowSuite:null,
    sourceBoundary:'Disabled visual SSO preview only; no university authentication integration.'},
  {id:'4-4',kind:'local-document',href:'/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/',
    finalUrl:'/school-sites/www.aca.stu.edu.tw/%E8%A1%8C%E4%BA%8B%E6%9B%86%EF%BD%9Ccalendar/',selector:'#page',
    workflowSuite:'tests/api/student-service-calendar.test.ts',sourceBoundary:'Captured public calendar HTML and six local PDFs; not a personal record form.'},
  {id:'4-5',kind:'local-document',href:'/',finalUrl:'/',selector:'body.home.page-id-243',workflowSuite:null,
    sourceBoundary:'Captured public homepage; not a protected workflow.'},
];
assert.equal(descriptors.length,94); assert.equal(new Set(descriptors.map(row=>row.id)).size,94);
const byId = new Map(descriptors.map(row => [row.id,row]));
assert.equal(schoolServiceEntries.length,94);
export const schoolServiceRouteInventory = Object.freeze(schoolServiceEntries.map(entry => {
  const descriptor=byId.get(entry.id);assert.ok(descriptor,'Unclassified catalog entry: '+entry.id);
  assert.equal(entry.localUrl,descriptor.href,'Catalog destination changed; review the inventory for '+entry.id);
  return Object.freeze({...descriptor,title:entry.title,officialSource:entry.officialUrl,workflowVerified:false});
}));
export function summarizeServiceRoutes(rows=schoolServiceRouteInventory) {
  return {catalogEntries:rows.length,kinds:rows.reduce((counts,row)=>({...counts,[row.kind]:(counts[row.kind]||0)+1}),{}),
    genericGaps:rows.filter(row=>row.kind==='generic').map(row=>row.id),externalDestinations:rows.filter(row=>row.kind==='external').length,workflowVerified:0,
    coverage:'Navigation and mounted-view checks only; linked family suites are separate workflow evidence, not executed by this inventory.',
    dtm:'Separate /dtm family; not one of these 94 catalog entries. elearning and CU remain distinct generic gaps.'};
}
export function expectedFinalServiceUrl(entry,href,origin) {
  const actual=new URL(href,origin),expected=new URL(entry.href,origin);
  assert.equal(actual.origin,expected.origin,'Unexpected destination origin for '+entry.id);
  assert.equal(actual.pathname,expected.pathname,'Unexpected destination path for '+entry.id);
  const final=new URL(entry.finalUrl,origin);final.search=actual.search;final.hash=actual.hash;return final.href;
}

export function schoolServiceSnapshot(user) {
  return {checkedAt:'2026-11-13T00:00:00Z',officialUniversityData:false,
    profile:{userId:user.id,email:user.email,displayName:'QA Student',role:'student'},student:null,
    courses:[{enrollmentId:'ae7dd8b2-f2a7-4f9f-a7ba-d59bd4087cc8',code:'SAMPLE-101',title:'Campus Orientation',term:'QA semester',
      status:'enrolled',sourceMode:'sample',credits:2,weekday:2,startsAt:'09:00:00',endsAt:'10:30:00',termStartsOn:'2026-09-01',termEndsOn:'2027-01-31',instructor:'Synthetic teacher',room:'Synthetic room',
      grades:[{label:'Sample quiz',score:8,maximum:10,sourceMode:'sample'}],attendance:[]}],
    charges:[{id:'aa2c8025-e33c-47a9-8555-efb84e48ed90',label:'Sample tuition',amountDue:12000,amountPaid:3000,currency:'TWD',dueOn:null,sourceMode:'sample'}],
    assignments:[],announcements:[],tasks:[],requests:[],serviceRecords:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
    scholarship:{periods:[],applications:[]},studentAid:{records:[]},housing:{periods:[],applications:[],assignments:[]},
    creditLoadHistory:{records:[]},courseSelection:{records:[]},academicGrades:{records:[],termSummaries:[],rankings:[],metadata:[]},
    graduationReview:{reports:[]},academicAttendance:{statistics:[],details:[],metadata:[]}};
}
/** Exact read-only fixture dispatcher. Unknown scopes and every mutation fail closed. */
export function schoolServiceReadFixture(rawUrl,method,user,origin) {
  const url=new URL(rawUrl,origin);assert.equal(url.origin,origin);assert.equal(method,'GET','No API mutations in menu QA.');
  for(const key of new Set(url.searchParams.keys()))assert.equal(url.searchParams.getAll(key).length,1,'Repeated query key.');
  if(url.pathname==='/api/affairs-conversations') {assert.equal(url.search,'');return {conversations:[]};}
  assert.equal(url.pathname,'/api/affairs-data','Unknown API path.');
  if(!url.search)return schoolServiceSnapshot(user);
  const scope=url.searchParams.get('scope');
  if(scope==='catalog') {
    assert.deepEqual(Object.fromEntries(url.searchParams),{yr:'1151',dep:'0',admissionType:'0',credit:'0',grd:'0',prog:'0',scope:'catalog'},'Menu opens the source-default catalog filters only.');
    return {rows:[],total:0,can_manage:false,page:0,page_size:100,terms:[]};
  }
  assert.deepEqual([...url.searchParams.keys()],['scope'],'Account filters and unknown selectors are forbidden.');
  switch(scope) {
    case 'syllabus-options':return {terms:[],departments:[]};
    case 'enrollment-certificate':return {assessments:[],documents:[]};
    case 'student-conduct':return {records:[]};
    case 'tutor-evaluation':return {userId:user.id,student:null,evaluation:null};
    case 'exchange-grant':
    case 'fee-remission':return {userId:user.id,records:[]};
    case 'dormitory-conduct':return {snapshot:null};
    case 'student-loan':return {status:'loaded',record:null};
    case 'tuition-documents':return {periods:[],settlements:[],documents:[]};
    default:throw new Error('Unmocked read scope: '+scope);
  }
}
