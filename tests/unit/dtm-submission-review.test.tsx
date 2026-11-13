import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {StrictMode} from 'react';
import {JSDOM} from 'jsdom';
import {DtmSubmissionClientError,type DtmSubmissionReviewInput,type DtmSubmissionWorkspaceData,type DtmSubmissionsClient} from '../../src/services/dtmSubmissions';
import {DtmSubmissionReview} from '../../src/features/public/dtm/DtmSubmissionReview';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
const {cleanup,fireEvent,render,waitFor,within}=await import('@testing-library/react');afterEach(cleanup);
const manager='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',assignmentId='33333333-3333-4333-8333-333333333333';
const course='44444444-4444-4444-8444-444444444444',submission='55555555-5555-4555-8555-555555555555',current='66666666-6666-4666-8666-666666666666',retired='77777777-7777-4777-8777-777777777777';
const stamp='2026-11-13T00:00:00Z',assignment={id:assignmentId,userId:owner,courseId:course,title:'Synthetic assignment review'};
function harness(){
  const data:DtmSubmissionWorkspaceData={assignmentId,userId:owner,courseId:course,maxBytes:10485760,dueAt:null,
    submission:{id:submission,version:42,currentUploadId:current,submittedAt:stamp,modifiedAt:stamp,dueAtAtSubmission:null},
    files:[{id:current,filename:'synthetic-current.txt',path:`${owner}/${submission}/${current}`,sizeBytes:9,contentType:'text/plain',state:'current',expiresAt:stamp,committedAt:stamp},
      {id:retired,filename:'synthetic-retired.txt',path:`${owner}/${submission}/${retired}`,sizeBytes:9,contentType:'text/plain',state:'retired',expiresAt:stamp,committedAt:stamp}],
    reviews:[{id:crypto.randomUUID(),uploadId:current,status:'graded',gradeText:'0',feedback:' Literal <feedback>\n preserved ',version:7,reviewedAt:stamp},
      {id:crypto.randomUUID(),uploadId:retired,status:'graded',gradeText:'Earlier literal grade',feedback:null,version:3,reviewedAt:stamp}]};
  const payloads:DtmSubmissionReviewInput[]=[],loads:{admin:boolean|undefined;signal:AbortSignal}[]=[],downloads:string[]=[];
  const controls={loadError:false,saveError:0,saveGate:null as Promise<void>|null,downloadGate:null as Promise<void>|null};
  const client:DtmSubmissionsClient={
    async load(_assignment,signal,admin){loads.push({admin,signal});signal.throwIfAborted();if(controls.loadError)throw new DtmSubmissionClientError('Synthetic denied',403);return structuredClone(data);},
    async review(payload,signal){payloads.push({...payload});if(controls.saveGate)await controls.saveGate;signal.throwIfAborted();
      if(controls.saveError){const status=controls.saveError;controls.saveError=0;throw new DtmSubmissionClientError('Synthetic review failure',status,status===503);}
      const prior=data.reviews.find(row=>row.uploadId===payload.upload_id);
      if((prior?.version??0)!==payload.expected_version)throw new DtmSubmissionClientError('Synthetic conflict',409);
      const next={id:prior?.id??crypto.randomUUID(),uploadId:payload.upload_id,status:payload.status,gradeText:payload.grade_text,feedback:payload.feedback,version:payload.expected_version+1,reviewedAt:stamp};
      data.reviews=data.reviews.filter(row=>row.uploadId!==payload.upload_id).concat(next);
      return {kind:'save_dtm_submission_review',assignmentId,submissionId:submission,uploadId:payload.upload_id,reviewId:next.id,version:next.version};
    },
    async download(_assignment,file,signal){downloads.push(file.id);if(controls.downloadGate)await controls.downloadGate;signal.throwIfAborted();return new Blob(['synthetic']);},
    async begin(){throw new Error('No upload operation belongs in review.');},async upload(){throw new Error('No upload operation belongs in review.');},
    async commit(){throw new Error('No upload operation belongs in review.');},async cancel(){throw new Error('No cancellation belongs in review.');},
  };
  return {client,data,controls,payloads,loads,downloads};
}
async function loaded(h:ReturnType<typeof harness>){const screen=render(<DtmSubmissionReview userId={manager} assignment={assignment} client={h.client}/>);await waitFor(()=>assert.ok(screen.getByRole('form',{name:'Edit current submission review'})));return screen;}

test('authorized admin load is required before any form, and denied loads expose no assignment/file data',async()=>{
  const h=harness();h.controls.loadError=true;
  const screen=render(<StrictMode><DtmSubmissionReview userId={manager} assignment={assignment} client={h.client}/></StrictMode>);
  assert.equal(screen.queryByRole('form'),null);await waitFor(()=>assert.ok(screen.getByRole('alert')));
  assert.equal(screen.queryByRole('form'),null);assert.equal(screen.queryByText(assignment.title),null);assert.equal(screen.queryByText(/synthetic-current/),null);
  assert.ok(h.loads.every(call=>call.admin===true));h.controls.loadError=false;fireEvent.click(screen.getByRole('button',{name:'Refresh submission reviews'}));
  await waitFor(()=>assert.ok(screen.getByRole('form')));screen.unmount();assert.ok(h.loads.every(call=>call.signal.aborted));
});

test('current and reviewed retired revisions display literal saved values; archived download is transient and read-only',async()=>{
  const h=harness(),received:{blob:Blob;filename:string}[]=[];
  const screen=render(<DtmSubmissionReview userId={manager} assignment={assignment} client={h.client} onDownloaded={value=>received.push(value)}/>);
  await waitFor(()=>assert.ok(screen.getByRole('form')));
  assert.equal((screen.getByLabelText('Grade text') as HTMLInputElement).value,'0');
  assert.equal((screen.getByLabelText('Feedback') as HTMLTextAreaElement).value,' Literal <feedback>\n preserved ');
  assert.equal(screen.container.querySelector('feedback'),null);assert.equal(screen.container.querySelector('a'),null);
  fireEvent.change(screen.getByLabelText('Submission revision'),{target:{value:retired}});
  assert.equal(screen.queryByRole('form'),null);assert.ok(screen.getByText('Earlier literal grade'));assert.ok(screen.getByText('This earlier revision is read-only.'));
  fireEvent.click(screen.getByRole('button',{name:'Download selected revision'}));await waitFor(()=>assert.equal(received.length,1));
  assert.deepEqual(h.downloads,[retired]);assert.equal(received[0].filename,'synthetic-retired.txt');assert.equal(await received[0].blob.text(),'synthetic');assert.equal(h.payloads.length,0);
});

test('save uses review version rather than submission version and not-graded explicitly clears grade without trimming feedback',async()=>{
  const h=harness(),screen=await loaded(h);
  fireEvent.change(screen.getByLabelText('Review status'),{target:{value:'not_graded'}});
  fireEvent.change(screen.getByLabelText('Feedback'),{target:{value:' Literal revised feedback '}});
  fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));await waitFor(()=>assert.ok(screen.getByText('Local submission review saved.')));
  assert.equal(h.payloads[0].expected_version,7);assert.equal(h.payloads[0].grade_text,null);assert.equal(h.payloads[0].feedback,' Literal revised feedback ');
  assert.equal(h.payloads[0].status,'not_graded');assert.equal(h.data.submission?.version,42);
  assert.equal(h.payloads[0].assignment_id,assignmentId);assert.equal(h.payloads[0].upload_id,current);
});

test('a previously unreviewed current revision starts at version zero and accepts literal zero grade',async()=>{
  const h=harness();h.data.reviews=h.data.reviews.filter(row=>row.uploadId!==current);const screen=await loaded(h);
  assert.ok(screen.getByText('No saved review'));fireEvent.change(screen.getByLabelText('Review status'),{target:{value:'graded'}});
  fireEvent.change(screen.getByLabelText('Grade text'),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));
  await waitFor(()=>assert.ok(screen.getByText('Local submission review saved.')));assert.equal(h.payloads[0].expected_version,0);assert.equal(h.payloads[0].grade_text,'0');assert.equal(h.payloads[0].feedback,null);
});

test('uncertain retries retain request ID and draft; changed feedback creates a new request',async()=>{
  const h=harness(),screen=await loaded(h);h.controls.saveError=503;
  fireEvent.change(screen.getByLabelText('Feedback'),{target:{value:'Retry this exact draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));await waitFor(()=>assert.ok(screen.getByRole('alert')));
  assert.equal((screen.getByLabelText('Feedback') as HTMLTextAreaElement).value,'Retry this exact draft');h.controls.saveError=503;
  fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));await waitFor(()=>assert.equal(h.payloads.length,2));
  await waitFor(()=>assert.ok(screen.getByRole('alert')));assert.equal(h.payloads[0].request_id,h.payloads[1].request_id);
  fireEvent.change(screen.getByLabelText('Feedback'),{target:{value:'Changed intentional draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));await waitFor(()=>assert.ok(screen.getByText('Local submission review saved.')));
  assert.notEqual(h.payloads[1].request_id,h.payloads[2].request_id);
});

test('matching saved text after an uncertain response does not prove ownership of the write or discard its retry ID',async()=>{
  const h=harness(),screen=await loaded(h);h.controls.saveError=503;
  fireEvent.change(screen.getByLabelText('Feedback'),{target:{value:'Possibly committed feedback'}});
  fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));await waitFor(()=>assert.ok(screen.getByRole('alert')));
  h.data.reviews[0]={...h.data.reviews[0],version:8,feedback:'Possibly committed feedback'};
  fireEvent.click(screen.getByRole('button',{name:'Refresh submission reviews'}));await waitFor(()=>assert.ok(screen.getByText(/Saved reviews refreshed/)));
  h.controls.saveError=503;fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));await waitFor(()=>assert.equal(h.payloads.length,2));
  await waitFor(()=>assert.ok(screen.getByRole('alert')));assert.equal(h.payloads[0].request_id,h.payloads[1].request_id);assert.equal(h.payloads[1].expected_version,7);
});

test('409 requires explicit refresh and retains unsaved feedback while updating the review version',async()=>{
  const h=harness(),screen=await loaded(h);h.controls.saveError=409;
  fireEvent.change(screen.getByLabelText('Feedback'),{target:{value:'Preserved local feedback'}});fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));
  await waitFor(()=>assert.ok(screen.getByRole('alert')));assert.equal(screen.getByRole('button',{name:'Save submission review'}).hasAttribute('disabled'),true);
  h.data.reviews[0]={...h.data.reviews[0],version:8,feedback:'Concurrent saved feedback'};
  fireEvent.click(screen.getByRole('button',{name:'Refresh submission reviews'}));
  await waitFor(()=>assert.ok(screen.getByText('Concurrent saved feedback')));assert.equal((screen.getByLabelText('Feedback') as HTMLTextAreaElement).value,'Preserved local feedback');
  fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));await waitFor(()=>assert.ok(screen.getByText('Local submission review saved.')));
  assert.equal(h.payloads[1].expected_version,8);assert.notEqual(h.payloads[0].request_id,h.payloads[1].request_id);assert.equal(h.payloads[1].feedback,'Preserved local feedback');
});

test('replacement makes the old revision read-only without losing its dirty draft or applying it to the new file',async()=>{
  const h=harness(),screen=await loaded(h);fireEvent.change(screen.getByLabelText('Feedback'),{target:{value:'Old revision unsaved feedback'}});
  const next=crypto.randomUUID();h.data.files[0].state='retired';h.data.files.push({...h.data.files[0],id:next,filename:'synthetic-new-current.txt',path:`${owner}/${submission}/${next}`,state:'current'});h.data.submission!.currentUploadId=next;
  fireEvent.click(screen.getByRole('button',{name:'Refresh submission reviews'}));await waitFor(()=>assert.ok(screen.getByText('This earlier revision is read-only.')));
  assert.equal(screen.queryByRole('form'),null);assert.ok(screen.getByText('Old revision unsaved feedback'));
  fireEvent.change(screen.getByLabelText('Submission revision'),{target:{value:next}});assert.ok(screen.getByRole('form'));
  assert.equal((screen.getByLabelText('Feedback') as HTMLTextAreaElement).value,'');assert.ok(screen.getByText('No saved review'));assert.equal(h.payloads.length,0);
});

test('save serialization disables controls and account/assignment changes abort old work without callbacks or private UI',async()=>{
  const h=harness();let release!:()=>void;h.controls.saveGate=new Promise<void>(resolve=>{release=resolve;});let saved=0;
  const screen=render(<DtmSubmissionReview userId={manager} assignment={assignment} client={h.client} onSaved={()=>{saved++;}}/>);
  await waitFor(()=>assert.ok(screen.getByRole('form')));const form=screen.getByRole('form');fireEvent.submit(form);fireEvent.submit(form);
  assert.equal(h.payloads.length,1);assert.equal(within(form).getByRole('group').hasAttribute('disabled'),true);
  screen.rerender(<DtmSubmissionReview userId={manager} assignment={null} client={h.client} onSaved={()=>{saved++;}}/>);
  assert.equal(screen.queryByText(assignment.title),null);assert.equal(screen.queryByRole('form'),null);assert.ok(h.loads.every(call=>call.signal.aborted));
  release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(saved,0);
});

test('invalid scope and oversized escaped metadata never reach a write',async()=>{
  const h=harness(),screen=render(<DtmSubmissionReview userId="" assignment={assignment} client={h.client}/>);
  assert.equal(screen.queryByRole('form'),null);assert.equal(h.loads.length,0);
  screen.rerender(<DtmSubmissionReview userId={manager} assignment={assignment} client={h.client}/>);await waitFor(()=>assert.ok(screen.getByRole('form')));
  fireEvent.change(screen.getByLabelText('Feedback'),{target:{value:'\u0001'.repeat(2000)}});fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));
  await waitFor(()=>assert.match(screen.getByRole('alert').textContent??'',/metadata size/));assert.equal(h.payloads.length,0);
});
