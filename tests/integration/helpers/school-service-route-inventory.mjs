import assert from 'node:assert/strict';
import {schoolServiceEntries} from '../../../src/features/public/affairs/studentServices.js';

// Explicit review inventory, not inferred from the presence of a generic body.
// A native mount says nothing about unobserved workflows or live backend acceptance.
const service = id => '/school-affairs/services/'+id;
const genericIds = '1-1 4-2 4-3 5-1 12-1 18-1 19-1 24-1 27-1 29-1 30-1 30-2 31-1 31-2 32-1 35-1 36-1 37-1 40-1 41-1 43-1 50-1 50-2 51-1 52-1 54-1 55-1 56-1 57-1 57-2 57-3 57-4'.split(' ');
const native = [
  ['7-3','.program-registration','program-registration-ui.mjs','Private interdisciplinary registration history and local registration controls.'],
  ['7-1','.credit-load-application','credit-load-application-ui.mjs','Observed instructions and closed-period acknowledgement only; open application and staff review forms remain unobserved.'],
  ['9-1','.student-scholarship','scholarship-ui.mjs','Observed scholarship workflow; distinct from other aid forms.'],
  ['11-1','.course-selection','course-selection-ui.mjs','Phase-scoped selection history, not current enrolled courses.'],
  ['11-2','.course-selection','course-selection-ui.mjs','Explicit phase-scoped timetable, not inferred from grades.'],
  ['11-3','.credit-load-history','credit-load-history-ui.mjs','Observed history only; unseen credit-load application is excluded.'],
  ['12-2','.permanent-course-catalog','permanent-courses-ui.mjs','Public permanent course catalog with database search, descriptions and print. Protected course maintenance is separate.'],
  ['12-3','.syllabus-search','syllabus-search-workspace-ui.mjs','Published offering search; no inferred current term.'],
  ['12-5','.curriculum-plans','curriculum-plans-ui.mjs','Public source program and archive tables with allowlisted plan previews.'],
  ['12-6','.interdisciplinary-programs','interdisciplinary-programs-ui.mjs','Published public program directory and captured program PDFs.'],
  ['12-8','.course-substitution','course-substitution-ui.mjs','Public course substitutions with live exact selectors and dated database snapshots.'],
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
  ['47-1','.venue-workspace','venue-booking-ui.mjs','Public university weekly venue schedule with persisted occupancy and local approved slots.'],
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
  {id:'6-1',kind:'partial',href:service('6-1'),finalUrl:service('6-1'),selector:'.first-selection',
    workflowSuite:'tests/integration/first-selection-ui.mjs',sourceBoundary:'Database-backed schedule and fee notice. The open-period selection interface remains unobserved.'},
  {id:'6-2',kind:'partial',href:service('6-2'),finalUrl:service('6-2'),selector:'.course-adjustment-event',
    workflowSuite:'tests/integration/course-adjustment-ui.mjs',sourceBoundary:'Observed event layout with an account-scoped eligibility decision. The eligible enrollment form remains unobserved.'},
  {id:'6-3',kind:'partial',href:service('6-3'),finalUrl:service('6-3'),selector:'.course-adjustment-late',
    workflowSuite:'tests/integration/course-adjustment-ui.mjs',sourceBoundary:'Late-add rules, notice and fee pages with a private eligibility lookup. The eligible enrollment form remains unobserved.'},
  {id:'6-5',kind:'partial',href:service('6-5'),finalUrl:service('6-5'),selector:'.summer-selection',
    workflowSuite:'tests/integration/summer-selection-ui.mjs',sourceBoundary:'Observed missing-college screen with account-owned decisions and dated public notice. Eligible registration form remains unobserved.'},
  {id:'2-1',kind:'partial',href:service('2-1'),finalUrl:service('2-1'),selector:'.announcement-email-settings',
    workflowSuite:'tests/integration/announcement-email-ui.mjs',sourceBoundary:'Observed setting and next-day opt-in. Production mail transport has not been verified.'},
  {id:'8-1',kind:'partial',href:service('8-1'),finalUrl:service('8-1'),selector:'.student-profile',
    workflowSuite:'tests/integration/student-profile-ui.mjs',sourceBoundary:'Observed form and one editable mobile field. University submission outcome remains unobserved.'},
  {id:'6-4',kind:'partial',href:service('6-4'),finalUrl:service('6-4'),selector:'.course-withdrawal',
    workflowSuite:'tests/integration/course-withdrawal-ui.mjs',sourceBoundary:'Local withdrawal and restore follow the official handbook. The current protected source layout remains unobserved.'},
  ...['10-1','16-1'].map(id=>({id,kind:'partial',href:service(id),finalUrl:service(id),selector:'.graduation-clearance',
    workflowSuite:'tests/integration/graduation-clearance-ui.mjs',sourceBoundary:'Published clearance workflow and local application/status. Authenticated university screens remain unobserved.'})),
  ...['7-5','7-6'].map(id=>({id,kind:'partial',href:service(id),finalUrl:service(id),selector:'.teaching-feedback',
    workflowSuite:'tests/integration/teaching-feedback-ui.mjs',sourceBoundary:'Published teaching feedback procedure, local forms and persisted records. Authenticated university layout remains unobserved.'})),
  {id:'7-4',kind:'partial',href:service('7-4'),finalUrl:service('7-4'),selector:'.early-graduation',
    workflowSuite:'tests/integration/early-graduation-ui.mjs',sourceBoundary:'Observed closed notice and nine-column history. Open application and cancellation screens remain unobserved.'},
  {id:'7-2',kind:'partial',href:service('7-2'),finalUrl:service('7-2'),selector:'.credit-transfer',
    workflowSuite:'tests/integration/credit-transfer-ui.mjs',sourceBoundary:'Local application, print, history and review use the published form. Current open university form remains unobserved.'},
  {id:'12-7',kind:'partial',href:service('12-7'),finalUrl:service('12-7'),selector:'.curriculum-map',
    workflowSuite:'tests/integration/curriculum-maps-ui.mjs',sourceBoundary:'Public map and live course lookup. The career and competency details require university sign-in.'},
  {id:'46-1',kind:'partial',href:service('46-1'),finalUrl:service('46-1'),selector:'.parking-permits',
    workflowSuite:'tests/integration/parking-permits-ui.mjs',sourceBoundary:'Observed parking entry and instructions; the university-authenticated form and records remain unobserved.'},
  {id:'44-1',kind:'partial',href:service('44-1'),finalUrl:service('44-1'),selector:'.venue-workspace',
    workflowSuite:'tests/integration/venue-booking-ui.mjs',sourceBoundary:'Local application and review linked to public availability. Protected university application layout is unobserved.'},
  {id:'45-1',kind:'partial',href:service('45-1'),finalUrl:service('45-1'),selector:'.facility-repair',
    workflowSuite:'tests/integration/facility-repair-ui.mjs',sourceBoundary:'Local reporting, private status and review. Protected university form remains unobserved.'},
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
  if(scope==='announcement-email'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope});
    return {userId:user.id,enabled:false,active:false,effectiveAt:null,version:0,deliveryConfigured:false};
  }
  if(scope==='student-profile'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,view:'mine'});
    return {userId:user.id,record:null};
  }
  if(scope==='facility-repairs'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,view:'catalog'});
    return {userId:user.id,areas:[{code:'AR0500',label:'管理大樓',outdoor:false,sort_order:6}],
      items:[{code:'RI2004',label:'日光燈',category:2,category_label:'電燈設備'}]};
  }
  if(scope==='venue-requests'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,view:'mine'});
    return {userId:user.id,rows:[]};
  }
  if(scope==='permanent-courses'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope});
    return {rows:[],kinds:[],divisions:[],total:0,page:0,pageSize:50,capturedAt:'2026-11-14T00:00:00Z'};
  }
  if(scope==='course-adjustment'&&url.searchParams.get('phase')==='summer'){
    assert.deepEqual([...url.searchParams.keys()],['scope','phase','year']);
    return {userId:user.id,term:{academicYear:Number(url.searchParams.get('year')),semester:3},record:null};
  }
  if(scope==='course-adjustment'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope:'course-adjustment',phase:'add_drop'});
    return {userId:user.id,term:{academicYear:115,semester:1},record:null};
  }
  if(scope==='catalog') {
    assert.deepEqual(Object.fromEntries(url.searchParams),{yr:'1151',dep:'0',admissionType:'0',credit:'0',grd:'0',prog:'0',scope:'catalog'},'Menu opens the source-default catalog filters only.');
    return {rows:[],total:0,can_manage:false,page:0,page_size:100,terms:[]};
  }
  if(scope==='graduation-clearance'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,view:'student'});
    return {userId:user.id,targetId:user.id,terms:[],periods:[],applications:[]};
  }
  if(scope==='teaching-feedback'){
    assert.deepEqual([...url.searchParams.keys()],['scope','view']);
    assert.ok(['survey','immediate'].includes(url.searchParams.get('view')));
    return {userId:user.id,courses:[],surveys:[],feedback:[],terms:[],results:[]};
  }
  assert.deepEqual([...url.searchParams.keys()],['scope'],'Account filters and unknown selectors are forbidden.');
  switch(scope) {
    case 'late-add-notice':return {observed_on:'2026-11-14',rules_zh:['測試公告'],rules_en:['Fixture rules'],selection_notes:['Fixture notes'],fee_notes:['Fixture fees']};
    case 'first-selection-notice':return {academicYear:115,semester:1,observedOn:'2026-11-14',
      notices:['Fixture instructions'],reminders:['Fixture reminders'],feeNotes:['Fixture fees'],feeNotesEn:['Fixture fees'],
      windows:[1,2,3].map(phase=>({phase,opensAt:'2026-06-08T02:00:00Z',closesAt:'2026-06-18T01:00:00Z',
        audience:'Fixture audience',audienceEn:'Fixture audience',details:'Fixture details'}))};
    case 'program-registrations':return {userId:user.id,records:[]};
    case 'early-graduation':return {userId:user.id,academicYear:115,semester:1,state:'unconfigured',window:null,candidate:null,records:[]};
    case 'credit-transfer':return {userId:user.id,rows:[]};
    case 'course-withdrawal':return {userId:user.id,academicYear:115,semester:1,state:'unconfigured',window:null,courses:[]};
    case 'interdisciplinary-programs':return {programs:[]};
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
