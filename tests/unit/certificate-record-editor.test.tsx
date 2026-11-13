import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {JSDOM} from 'jsdom';
import {StrictMode} from 'react';
import {CertificateRecordEditor} from '../../src/features/public/affairs/CertificateRecordEditor';
import {CertificateRecordError,type CertificateRecordClient,type CertificateAssessmentInput} from '../../src/services/certificateRecordEditor';
import type {EnrollmentCertificateAdminRecords} from '../../server/enrollmentCertificate.js';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
const {cleanup,fireEvent,render,waitFor,within}=await import('@testing-library/react');afterEach(cleanup);
const manager='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const id='44444444-4444-4444-8444-444444444444',documentId='55555555-5555-4555-8555-555555555555',stamp='2026-11-13T00:00:00Z';
function harness(empty=false){
  const records:EnrollmentCertificateAdminRecords={assessments:empty?[]:[{id,userId:owner,sourceMode:'local_demo',version:7,createdAt:stamp,updatedAt:stamp,academicYear:null,semester:null,hasPendingFees:'N',status:'blocked',resultText:' Literal saved <result> ',assessedAt:null,
    identity:{studentNumber:null,studentName:'Synthetic student',departmentName:null,yearText:null,classLabel:null}}],documents:[],documentMetadata:[{id:documentId,userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,assessmentId:id,assessmentVersion:6,issuer:'stu.best',purpose:'local_enrollment_reference',status:'metadata_only',verifiedAt:null,expiresAt:null}]};
  const writes:CertificateAssessmentInput[]=[],loads:{userId:string;signal:AbortSignal}[]=[];
  const control={loadError:0,saveError:0,gate:null as Promise<void>|null,readGate:null as Promise<void>|null};
  const client:CertificateRecordClient={
    async load(userId,signal){loads.push({userId,signal});if(control.readGate)await control.readGate;signal.throwIfAborted();if(control.loadError)throw new CertificateRecordError('Synthetic authorized-load denial',control.loadError);return structuredClone(records);},
    async save(payload,signal){writes.push({...payload});if(control.gate)await control.gate;signal.throwIfAborted();if(control.saveError){const status=control.saveError;control.saveError=0;throw new CertificateRecordError('Synthetic unconfirmed write',status);}
      records.assessments=[{id:payload.id,userId:payload.user_id,sourceMode:'local_demo',version:payload.expected_version+1,createdAt:stamp,updatedAt:stamp,academicYear:payload.academic_year,semester:payload.semester,hasPendingFees:payload.has_pending_fees,status:payload.status,resultText:payload.result_text,assessedAt:payload.assessed_at,
        identity:{studentNumber:payload.student_number,studentName:payload.student_name,departmentName:payload.department_name,yearText:payload.year_text,classLabel:payload.class_label}}];
      return {id:payload.id,kind:'save_enrollment_certificate_assessment',version:payload.expected_version+1,summary:'Synthetic saved'};
    },
  };return {records,writes,loads,control,client};
}
async function mount(h= harness()){const screen=render(<CertificateRecordEditor managerId={manager} userId={owner} client={h.client}/>);await waitFor(()=>assert.ok(screen.getByRole('form',{name:'Edit certificate assessment'})));return screen;}
test('certificate editor requires a successful selected-account load before showing fields, including denied-load retry',async()=>{
  const h=harness();h.control.loadError=403;const screen=render(<StrictMode><CertificateRecordEditor managerId={manager} userId={owner} client={h.client}/></StrictMode>);
  assert.equal(screen.queryByRole('form'),null);await waitFor(()=>assert.ok(screen.getByRole('alert')));assert.equal(screen.queryByRole('form'),null);assert.equal(screen.queryByDisplayValue('Synthetic student'),null);
  h.control.loadError=0;fireEvent.click(screen.getByRole('button',{name:'Refresh certificate records'}));await waitFor(()=>assert.ok(screen.getByRole('form')));assert.ok(h.loads.every(row=>row.userId===owner));
  screen.unmount();assert.ok(h.loads.every(row=>row.signal.aborted));
});
test('certificate editor preserves literal null/N/Y, display identity, ISO time and saved status without deriving fee eligibility',async()=>{
  const h=harness(),screen=await mount(h);assert.equal((screen.getByLabelText('Pending fee flag') as HTMLSelectElement).value,'N');assert.equal((screen.getByLabelText('Local assessment status') as HTMLSelectElement).value,'blocked');
  fireEvent.change(screen.getByLabelText('Academic year'),{target:{value:'115'}});fireEvent.change(screen.getByLabelText('Certificate semester'),{target:{value:'2'}});
  fireEvent.change(screen.getByLabelText('Pending fee flag'),{target:{value:'Y'}});assert.equal((screen.getByLabelText('Local assessment status') as HTMLSelectElement).value,'blocked');
  fireEvent.change(screen.getByLabelText('Local assessment status'),{target:{value:'unknown'}});fireEvent.change(screen.getByLabelText('Student name'),{target:{value:' Literal synthetic name '}});
  fireEvent.change(screen.getByLabelText('Assessed at (ISO timestamp, or blank)'),{target:{value:'2026-11-13T08:30:00+08:00'}});fireEvent.change(screen.getByLabelText('Result text'),{target:{value:'0'}});
  fireEvent.click(screen.getByRole('button',{name:'Save certificate assessment'}));await waitFor(()=>assert.ok(screen.getByText('Local certificate assessment saved. No document was issued.')));
  const write=h.writes[0];assert.equal(write.user_id,owner);assert.equal(write.expected_version,7);assert.equal(write.has_pending_fees,'Y');assert.equal(write.status,'unknown');assert.equal(write.student_name,' Literal synthetic name ');assert.equal(write.student_number,null);assert.equal(write.result_text,'0');assert.equal(write.assessed_at,'2026-11-13T08:30:00+08:00');
  fireEvent.change(screen.getByLabelText('Pending fee flag'),{target:{value:''}});fireEvent.change(screen.getByLabelText('Student name'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Save certificate assessment'}));await waitFor(()=>assert.equal(h.writes.length,2));assert.equal(h.writes[1].has_pending_fees,null);assert.equal(h.writes[1].student_name,null);assert.equal(h.writes[1].expected_version,8);
});
test('certificate creation starts at version zero; document metadata is literal read-only content with no action/link',async()=>{
  const h=harness(true),screen=await mount(h);assert.ok(screen.getByText('No assessment saved'));assert.ok(screen.getByText('metadata_only'));assert.equal(screen.container.querySelector('a'),null);
  assert.equal(screen.queryByRole('button',{name:/issue|download|document/i}),null);assert.equal(screen.container.querySelector('result'),null);
  fireEvent.click(screen.getByRole('button',{name:'Save certificate assessment'}));await waitFor(()=>assert.ok(screen.getByText('Local certificate assessment saved. No document was issued.')));
  assert.equal(h.writes[0].expected_version,0);assert.match(h.writes[0].id,/^[a-f0-9-]{36}$/);assert.equal(h.writes[0].status,'unknown');assert.equal(h.writes[0].academic_year,null);assert.equal(h.writes[0].has_pending_fees,null);
});
test('uncertain certificate retries keep request ID/version and changed drafts start a distinct request',async()=>{
  const h=harness(),screen=await mount(h);h.control.saveError=503;fireEvent.change(screen.getByLabelText('Result text'),{target:{value:'Retained draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Save certificate assessment'}));await waitFor(()=>assert.ok(screen.getByRole('alert')));
  h.records.assessments[0]={...h.records.assessments[0],version:8,resultText:'Retained draft'};
  fireEvent.click(screen.getByRole('button',{name:'Refresh certificate records'}));await waitFor(()=>assert.ok(screen.getByText(/Saved records refreshed/)));
  h.control.saveError=503;fireEvent.click(screen.getByRole('button',{name:'Save certificate assessment'}));await waitFor(()=>assert.equal(h.writes.length,2));await waitFor(()=>assert.ok(screen.getByRole('alert')));
  assert.equal(h.writes[1].request_id,h.writes[0].request_id);assert.equal(h.writes[1].expected_version,7);assert.equal((screen.getByLabelText('Result text') as HTMLTextAreaElement).value,'Retained draft');
  fireEvent.change(screen.getByLabelText('Result text'),{target:{value:'Explicit changed draft'}});fireEvent.click(screen.getByRole('button',{name:'Save certificate assessment'}));await waitFor(()=>assert.ok(screen.getByText('Local certificate assessment saved. No document was issued.')));assert.notEqual(h.writes[2].request_id,h.writes[1].request_id);
});
test('409 blocks saving until explicit refresh, keeps unsaved values, and updates expected version after refresh',async()=>{
  const h=harness(),screen=await mount(h);h.control.saveError=409;fireEvent.change(screen.getByLabelText('Result text'),{target:{value:'My preserved assessment'}});fireEvent.click(screen.getByRole('button',{name:'Save certificate assessment'}));await waitFor(()=>assert.ok(screen.getByRole('alert')));
  assert.ok(screen.getByRole('button',{name:'Save certificate assessment'}).hasAttribute('disabled'));h.records.assessments[0]={...h.records.assessments[0],version:9,resultText:'Concurrent literal result'};
  fireEvent.click(screen.getByRole('button',{name:'Refresh certificate records'}));await waitFor(()=>assert.ok(screen.getByText('Concurrent literal result')));assert.equal((screen.getByLabelText('Result text') as HTMLTextAreaElement).value,'My preserved assessment');
  fireEvent.click(screen.getByRole('button',{name:'Save certificate assessment'}));await waitFor(()=>assert.ok(screen.getByText('Local certificate assessment saved. No document was issued.')));assert.equal(h.writes[1].expected_version,9);assert.notEqual(h.writes[0].request_id,h.writes[1].request_id);
});
test('account switches abort loads/writes, hide old identity immediately and suppress late save callbacks',async()=>{
  const h=harness();let saved=0,release!:()=>void;h.control.gate=new Promise<void>(resolve=>{release=resolve;});
  const screen=render(<CertificateRecordEditor managerId={manager} userId={owner} client={h.client} onSaved={()=>{saved++;}}/>);await waitFor(()=>assert.ok(screen.getByRole('form')));
  const form=screen.getByRole('form');fireEvent.submit(form);fireEvent.submit(form);assert.equal(h.writes.length,1);assert.ok(within(form).getByRole('group').hasAttribute('disabled'));
  screen.rerender(<CertificateRecordEditor managerId={manager} userId={other} client={h.client} onSaved={()=>{saved++;}}/>);assert.equal(screen.queryByDisplayValue('Synthetic student'),null);assert.ok(h.loads[0].signal.aborted);
  release();await waitFor(()=>assert.ok(screen.getByRole('alert')));assert.equal(screen.queryByRole('form'),null);assert.equal(saved,0);assert.match(screen.getByRole('alert').textContent??'',/selected account/);
});
test('existing local-eligible status is displayed literally but cannot be saved or activate a document',async()=>{
  const h=harness();h.records.assessments[0].status='local_eligible';const screen=await mount(h);
  assert.ok(screen.getByText('local_eligible',{selector:'dd'}));assert.ok(screen.getByRole('button',{name:'Save certificate assessment'}).hasAttribute('disabled'));
  fireEvent.submit(screen.getByRole('form'));assert.equal(h.writes.length,0);assert.equal(screen.container.querySelector('a'),null);
  fireEvent.change(screen.getByLabelText('Local assessment status'),{target:{value:'blocked'}});fireEvent.click(screen.getByRole('button',{name:'Save certificate assessment'}));await waitFor(()=>assert.ok(screen.getByText('Local certificate assessment saved. No document was issued.')));assert.equal(h.writes[0].status,'blocked');
});
test('invalid account and malformed academic year never reach certificate writes',async()=>{
  const h=harness(),screen=render(<CertificateRecordEditor managerId="" userId={owner} client={h.client}/>);assert.equal(h.loads.length,0);
  screen.rerender(<CertificateRecordEditor managerId={manager} userId={owner} client={h.client}/>);await waitFor(()=>assert.ok(screen.getByRole('form')));
  fireEvent.change(screen.getByLabelText('Academic year'),{target:{value:'1e2'}});fireEvent.submit(screen.getByRole('form'));assert.match(screen.getByRole('alert').textContent??'',/whole number/);assert.equal(h.writes.length,0);
});
