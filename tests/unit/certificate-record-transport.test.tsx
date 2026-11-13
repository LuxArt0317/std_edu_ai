import assert from 'node:assert/strict';
import test from 'node:test';
import {createCertificateRecordClient,parseCertificateAdminRecords,CertificateRecordError,type CertificateAssessmentInput} from '../../src/services/certificateRecordEditor';
const manager='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const requestId='44444444-4444-4444-8444-444444444444',documentId='55555555-5555-4555-8555-555555555555',stamp='2026-11-13T00:00:00Z';
const signal=()=>new AbortController().signal;
const session=async()=>({userId:manager,accessToken:'synthetic-manager-token'});
function records(){return {assessments:[{id,userId:owner,sourceMode:'local_demo',version:3,createdAt:stamp,updatedAt:stamp,academicYear:null,semester:null,hasPendingFees:'N',status:'blocked',resultText:' Literal <reference> ',assessedAt:null,
  identity:{studentNumber:null,studentName:'Synthetic student',departmentName:null,yearText:null,classLabel:null}}],documents:[],documentMetadata:[{id:documentId,userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,
  assessmentId:id,assessmentVersion:2,issuer:'stu.best',purpose:'local_enrollment_reference',status:'metadata_only',verifiedAt:null,expiresAt:null}]};}
const payload=():CertificateAssessmentInput=>({id,user_id:owner,request_id:requestId,expected_version:3,academic_year:null,semester:null,has_pending_fees:'N',status:'blocked',result_text:' Literal <reference> ',assessed_at:null,student_number:null,student_name:'Synthetic student',department_name:null,year_text:null,class_label:null});
test('certificate transport loads only the exact selected user with the authenticated manager JWT and keeps metadata inert',async()=>{
  let calls=0;const client=createCertificateRecordClient(manager,{getSession:session,fetch:async(input,init)=>{
    calls++;assert.equal(input,'/api/affairs-data?scope=enrollment-certificate-admin&user_id='+owner);assert.equal(init?.method,'GET');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-manager-token');assert.equal(init?.body,undefined);assert.equal(init?.cache,'no-store');assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');
    return Response.json(records());
  }});
  const result=await client.load(owner,signal());assert.equal(calls,1);assert.deepEqual(result.documents,[]);assert.equal(result.assessments[0].hasPendingFees,'N');assert.equal(result.documentMetadata[0].status,'metadata_only');
});
test('certificate transport saves exact approved fields and accepts only the same ID/kind/next-version receipt',async()=>{
  const input=payload(),client=createCertificateRecordClient(manager,{getSession:session,fetch:async(url,init)=>{
    assert.equal(url,'/api/affairs-manage');assert.equal(init?.method,'POST');assert.deepEqual(JSON.parse(String(init?.body)),{kind:'save_enrollment_certificate_assessment',payload:input});
    return Response.json({id,kind:'save_enrollment_certificate_assessment',version:4,summary:'Synthetic saved'});
  }});
  assert.deepEqual(await client.save(input,signal()),{id,kind:'save_enrollment_certificate_assessment',version:4,summary:'Synthetic saved'});
  for(const receipt of [{id:documentId,kind:'save_enrollment_certificate_assessment',version:4,summary:''},{id,kind:'save_enrollment_certificate_document',version:4,summary:''},{id,kind:'save_enrollment_certificate_assessment',version:5,summary:''}]){
    const invalid=createCertificateRecordClient(manager,{getSession:session,fetch:async()=>Response.json(receipt)});await assert.rejects(invalid.save(input,signal()),/could not be verified/);
  }
});
test('certificate transport rejects wrong account, ownerless/duplicate rows, active documents and extra URL fields',()=>{
  const cases:unknown[]=[];
  {const data=records();data.assessments[0].userId=manager;cases.push(data);}
  {const data=records();delete(data.assessments[0] as Partial<typeof data.assessments[0]>).userId;cases.push(data);}
  {const data=records();data.assessments.push({...data.assessments[0],id:requestId});cases.push(data);}
  {const data=records();data.documentMetadata[0].userId=manager;cases.push(data);}
  {const data=records();data.documentMetadata[0].status='available';cases.push(data);}
  {const data=records();data.assessments[0].updatedAt='2026-02-30T00:00:00Z';cases.push(data);}
  {const data=records();data.documentMetadata[0].createdAt='2026-02-30T00:00:00Z';cases.push(data);}
  {const data=records();Object.assign(data.documentMetadata[0],{url:'https://private.invalid/synthetic'});cases.push(data);}
  {const data=records();cases.push({...data,documents:[{id:documentId}]});}
  {const data=records();data.documentMetadata.push({...data.documentMetadata[0]});cases.push(data);}
  for(const data of cases)assert.throws(()=>parseCertificateAdminRecords(data,owner),/could not be verified/);
  assert.throws(()=>parseCertificateAdminRecords(records(),''),/could not be verified/);
  const input=records(),output=parseCertificateAdminRecords(input,owner);output.assessments[0].identity.studentName='Changed';assert.equal(input.assessments[0].identity.studentName,'Synthetic student');
});
test('certificate validation rejects malformed dates, unsupported local-eligible writes and unknown fields before fetch',async()=>{
  let calls=0;const client=createCertificateRecordClient(manager,{getSession:session,fetch:async()=>{calls++;return Response.json({});}});
  for(const input of [{...payload(),academic_year:0},{...payload(),assessed_at:'2026-02-30T00:00:00Z'},{...payload(),status:'local_eligible'},{...payload(),signedUrl:'synthetic'},{...payload(),result_text:'x'.repeat(501)}])
    await assert.rejects(client.save(input as CertificateAssessmentInput,signal()),error=>error instanceof CertificateRecordError&&error.status===400);
  assert.equal(calls,0);
});
test('certificate auth, abort and provider errors are bounded, scoped and sanitized',async()=>{
  let calls=0;const fetcher:typeof fetch=async()=>{calls++;return Response.json(records());};
  for(const getSession of [async()=>null,async()=>({userId:owner,accessToken:'synthetic'}),async()=>{throw new Error('private-auth-detail');}]){
    await assert.rejects(createCertificateRecordClient(manager,{getSession,fetch:fetcher}).load(owner,signal()),error=>error instanceof CertificateRecordError&&error.status===401&&!error.message.includes('private'));
  }
  const aborted=new AbortController();aborted.abort();await assert.rejects(createCertificateRecordClient(manager,{getSession:session,fetch:fetcher}).load(owner,aborted.signal),{name:'AbortError'});assert.equal(calls,0);
  for(const status of [401,403,409,500])await assert.rejects(createCertificateRecordClient(manager,{getSession:session,fetch:async()=>new Response('private-provider-detail',{status})}).save(payload(),signal()),error=>error instanceof CertificateRecordError&&error.status===status&&!error.message.includes('private-provider-detail'));
  await assert.rejects(createCertificateRecordClient(manager,{getSession:session,fetch:async()=>{throw new Error('private-provider-detail');}}).save(payload(),signal()),/operation was not confirmed/);
});
