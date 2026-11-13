import assert from 'node:assert/strict';
import test from 'node:test';
import {access} from 'node:fs/promises';
import {schoolServiceEntries} from '../../../src/features/public/affairs/studentServices.js';
import {parseStudentLoanSnapshot} from '../../../server/studentLoan.js';
import {parseDormitoryConductData} from '../../../server/dormitoryConduct.js';
import {schoolServiceRouteInventory as inventory, summarizeServiceRoutes, expectedFinalServiceUrl, schoolServiceReadFixture} from './school-service-route-inventory.mjs';
import {affairsTestUser} from './affairs-auth.mjs';
const origin='http://127.0.0.1:5176';
const read=(path,method='GET')=>schoolServiceReadFixture(path,method,affairsTestUser,origin);

test('all 94 catalog entries have explicit destinations and honest independent source boundaries',async()=>{
  assert.equal(inventory.length,94);assert.equal(new Set(inventory.map(row=>row.id)).size,94);
  assert.deepEqual(inventory.map(row=>row.id),schoolServiceEntries.map(row=>row.id));
  for(const row of inventory){
    assert.equal(row.href,schoolServiceEntries.find(entry=>entry.id===row.id).localUrl);
    assert.ok(row.selector&&row.sourceBoundary&&row.officialSource);assert.equal(row.workflowVerified,false);
    if(row.workflowSuite)await access(row.workflowSuite);
  }
  const result=summarizeServiceRoutes();
  assert.deepEqual(result.kinds,{generic:59,'local-portal':2,preview:1,'local-document':2,redirect:1,native:27,partial:2});
  assert.equal(result.workflowVerified,0);assert.equal(result.genericGaps.length,59);
  assert.equal(result.externalDestinations,0,'Official-source provenance URLs are not actual menu destinations.');
  assert.match(result.dtm,/not one of these 94/);
  for(const id of ['4-2','4-3'])assert.equal(inventory.find(row=>row.id===id).kind,'generic','Separate Moodle instances are not implemented by DTM.');
  assert.equal(inventory.find(row=>row.id==='4-1').kind,'preview');
  assert.match(inventory.find(row=>row.id==='48-2').sourceBoundary,/unavailable/);
  assert.match(inventory.find(row=>row.id==='21-2').sourceBoundary,/closed-period/);
  assert.match(inventory.find(row=>row.id==='7-1').sourceBoundary,/open application and staff review forms remain unobserved/);
});
test('full URL comparison keeps query/hash and distinguishes the observed redirect from aliases',()=>{
  for(const id of ['6-6','20-1','33-1','53-1','4-4','4-5']){
    const row=inventory.find(entry=>entry.id===id),url=expectedFinalServiceUrl(row,row.href+'?a=space%20value&b=0#section',origin);
    assert.equal(url,new URL(row.finalUrl+'?a=space%20value&b=0#section',origin).href);
    assert.throws(()=>expectedFinalServiceUrl(row,'https://example.invalid'+row.href,origin));
    assert.throws(()=>expectedFinalServiceUrl(row,'/school-affairs/services/not-the-entry',origin));
  }
  assert.equal(inventory.find(row=>row.id==='6-6').finalUrl,'/school-affairs/services/11-1');
});
test('scoped empty fixtures preserve absent/unknown versus asserted empty records and expose no documents',()=>{
  assert.deepEqual(parseStudentLoanSnapshot(read('/api/affairs-data?scope=student-loan'),affairsTestUser.id),{status:'loaded',record:null});
  assert.deepEqual(parseDormitoryConductData(read('/api/affairs-data?scope=dormitory-conduct'),affairsTestUser.id),{snapshot:null});
  assert.deepEqual(read('/api/affairs-data?scope=student-conduct'),{records:[]});
  assert.deepEqual(read('/api/affairs-data?scope=enrollment-certificate'),{assessments:[],documents:[]});
  assert.deepEqual(read('/api/affairs-data?scope=tuition-documents'),{periods:[],settlements:[],documents:[]});
  assert.deepEqual(read('/api/affairs-data?scope=syllabus-options'),{terms:[],departments:[]});
  assert.deepEqual(read('/api/affairs-data?yr=1151&dep=0&admissionType=0&credit=0&grd=0&prog=0&scope=catalog'),{rows:[],total:0,can_manage:false,page:0,page_size:100,terms:[]});
  assert.deepEqual(read('/api/affairs-conversations'),{conversations:[]});
});
test('shared snapshot separates native academic records from synthetic enrollment/fee UI fixtures',()=>{
  const snapshot=read('/api/affairs-data');
  assert.equal(snapshot.profile.userId,affairsTestUser.id);assert.equal(snapshot.officialUniversityData,false);
  assert.equal(snapshot.courses[0].grades[0].label,'Sample quiz');assert.equal(snapshot.courses[0].sourceMode,'sample');
  assert.deepEqual(snapshot.academicGrades,{records:[],termSummaries:[],rankings:[],metadata:[]});
  assert.deepEqual(snapshot.courseSelection,{records:[]});assert.deepEqual(snapshot.graduationReview,{reports:[]});
  assert.deepEqual(snapshot.academicAttendance,{statistics:[],details:[],metadata:[]});
  snapshot.academicGrades.records.push({private:'mutated fixture'});
  assert.deepEqual(read('/api/affairs-data').academicGrades.records,[],'Each read returns a fresh isolated fixture.');
});
test('unregistered APIs, methods, account selectors, repetitions and remote origins fail closed',()=>{
  for(const path of ['/api/affairs-manage','/api/affairs-assistant','/api/affairs-data?scope=admin',
    '/api/affairs-data?scope=student-loan-admin&user_id='+affairsTestUser.id,
    '/api/affairs-data?scope=student-loan&user_id='+affairsTestUser.id,
    '/api/affairs-data?scope=student-loan&scope=student-loan','/api/affairs-conversations?id=unrequested',
    '/api/affairs-data?scope=catalog&id=unrequested','https://example.invalid/api/affairs-data'])assert.throws(()=>read(path));
  for(const method of ['POST','PUT','DELETE','PATCH'])assert.throws(()=>read('/api/affairs-data',method));
});
