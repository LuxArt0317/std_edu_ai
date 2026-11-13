import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {StrictMode} from 'react';
import {JSDOM} from 'jsdom';
import type {DtmSubmissionsClient,DtmSubmissionWorkspaceData} from '../../src/services/dtmSubmissions';
const hook=registerHooks({load(url,context,next){return /\/dtm(?:AssignmentDetail|SubmissionEditor)\.css$/.test(url)?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {DtmSubmissionWorkspace}=await import('../../src/features/public/dtm/DtmSubmissionWorkspace');hook.deregister();
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
const {cleanup,fireEvent,render,waitFor}=await import('@testing-library/react');afterEach(cleanup);
const userId='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',courseId='33333333-3333-4333-8333-333333333333';
const assignment={userId,id,courseId,title:'Synthetic private assignment'};
const fileId='44444444-4444-4444-8444-444444444444',submissionId='55555555-5555-4555-8555-555555555555',stamp='2026-11-13T00:00:00Z';
function harness(){
  const state:DtmSubmissionWorkspaceData={userId,assignmentId:id,courseId,dueAt:null,maxBytes:10485760,
    submission:{id:submissionId,version:1,currentUploadId:fileId,modifiedAt:stamp,submittedAt:stamp,dueAtAtSubmission:null},
    files:[{id:fileId,filename:'synthetic-saved.txt',path:`${userId}/${submissionId}/${fileId}`,contentType:'text/plain',sizeBytes:9,state:'current',expiresAt:stamp,committedAt:stamp}],reviews:[]};
  const signals:AbortSignal[]=[],downloads:string[]=[],mutations:string[]=[];
  const client:DtmSubmissionsClient={
    async load(_assignment,signal){signals.push(signal);signal.throwIfAborted();return structuredClone(state);},
    async begin(){mutations.push('begin');throw new Error('Not expected');},async upload(){mutations.push('upload');throw new Error('Not expected');},
    async commit(){mutations.push('commit');throw new Error('Not expected');},async cancel(){mutations.push('cancel');throw new Error('Not expected');},
    async review(){mutations.push('review');throw new Error('Not expected');},
    async download(_assignment,file,signal){signal.throwIfAborted();downloads.push(file.id);return new Blob(['synthetic']);},
  };
  return {client,state,signals,downloads,mutations};
}
test('full-page detail survives StrictMode, downloads through callback and navigates to the host editor',async()=>{
  const h=harness(),navigation:string[]=[],received:{blob:Blob;filename:string}[]=[];
  const screen=render(<StrictMode><DtmSubmissionWorkspace userId={userId} assignment={assignment} view="detail" client={h.client}
    onNavigate={view=>navigation.push(view)} onDownloaded={value=>received.push(value)}/></StrictMode>);
  await waitFor(()=>assert.ok(screen.getByRole('table',{name:'作業繳交狀態'})));
  assert.equal(screen.container.querySelectorAll('.dtm-assignment-detail').length,1);assert.equal(screen.container.querySelector('a'),null);
  fireEvent.click(screen.getByRole('button',{name:'synthetic-saved.txt'}));await waitFor(()=>assert.equal(received.length,1));
  assert.equal(received[0].filename,'synthetic-saved.txt');assert.equal(await received[0].blob.text(),'synthetic');assert.deepEqual(h.downloads,[fileId]);
  fireEvent.click(screen.getByRole('button',{name:'修改我已繳交的作業'}));await waitFor(()=>assert.deepEqual(navigation,['edit']));
  assert.deepEqual(h.mutations,[]);screen.unmount();assert.ok(h.signals.every(signal=>signal.aborted));
});
test('editor needs a newly selected File; cancel preserves the saved file and Escape stays host-owned',async()=>{
  const h=harness(),navigation:string[]=[];
  const screen=render(<DtmSubmissionWorkspace userId={userId} assignment={assignment} view="edit" client={h.client} onNavigate={view=>navigation.push(view)}/>);
  await waitFor(()=>assert.ok(screen.getByText('synthetic-saved.txt')));
  assert.equal(screen.getByRole('button',{name:'儲存更改'}).hasAttribute('disabled'),true);
  fireEvent.change(screen.getByLabelText('提交檔案',{selector:'input'}),{target:{files:[new File(['pending'],'synthetic-pending.txt',{type:'text/plain'})]}});
  await waitFor(()=>assert.ok(screen.getByText('synthetic-pending.txt')));
  fireEvent.keyDown(screen.getByRole('button',{name:'取消'}),{key:'Escape'});assert.deepEqual(navigation,[]);
  fireEvent.click(screen.getByRole('button',{name:'取消'}));await waitFor(()=>assert.deepEqual(navigation,['detail']));
  assert.deepEqual(h.mutations,[]);assert.equal(h.state.submission?.currentUploadId,fileId);
});
test('account/assignment changes remove all old file UI immediately and abort its requests',async()=>{
  const h=harness(),other='66666666-6666-4666-8666-666666666666';
  const screen=render(<DtmSubmissionWorkspace userId={userId} assignment={assignment} view="detail" client={h.client} onNavigate={()=>{}}/>);
  await waitFor(()=>assert.ok(screen.getByText('synthetic-saved.txt')));
  screen.rerender(<DtmSubmissionWorkspace userId={other} assignment={assignment} view="detail" client={h.client} onNavigate={()=>{}}/>);
  assert.equal(screen.queryByText('synthetic-saved.txt'),null);assert.equal(screen.queryByText(assignment.title),null);assert.equal(screen.queryByRole('table'),null);
  assert.ok(h.signals.every(signal=>signal.aborted));
});
test('initial errors are safe and retryable without an invented saved status',async()=>{
  const h=harness();let attempts=0;
  const load=h.client.load;h.client.load=async(...args)=>{if(++attempts===1)throw new Error('SECRET_PROVIDER_RESPONSE');return load(...args);};
  const screen=render(<DtmSubmissionWorkspace userId={userId} assignment={assignment} view="detail" client={h.client} onNavigate={()=>{}}/>);
  await waitFor(()=>assert.ok(screen.getByRole('alert')));assert.equal(screen.queryByText(/SECRET/),null);assert.equal(screen.queryByRole('table'),null);
  fireEvent.click(screen.getByRole('button',{name:'重新載入'}));await waitFor(()=>assert.ok(screen.getByRole('table')));assert.equal(attempts,2);
});
