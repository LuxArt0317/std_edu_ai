import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {JSDOM} from 'jsdom';
import type {User} from '@supabase/supabase-js';
import type {AffairsSnapshot} from '../../src/services/schoolAffairsWorkspace';
const manager='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const student='44444444-4444-4444-8444-444444444444',otherStudent='55555555-5555-4555-8555-555555555555';
const course='66666666-6666-4666-8666-666666666666',sampleCourse='77777777-7777-4777-8777-777777777777',otherCourse='88888888-8888-4888-8888-888888888888';
const assignment='99999999-9999-4999-8999-999999999999',sampleAssignment='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',otherAssignment='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const submission='cccccccc-cccc-4ccc-8ccc-cccccccccccc',upload='dddddddd-dddd-4ddd-8ddd-dddddddddddd',review='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const stamp='2026-11-13T00:00:00Z';
const globals=globalThis as typeof globalThis&{__dtmManagerSession?:{data:{session:{user:{id:string};access_token:string}|null};error:null}};
const hook=registerHooks({load(url,context,next){
  if(/\/affairs\/authClient\.ts$/.test(url))return {format:'module',shortCircuit:true,source:'export const affairsClient={auth:{getSession:async()=>globalThis.__dtmManagerSession}};'};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};
  return next(url,context);
}});
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
const {cleanup,fireEvent,render,waitFor,within}=await import('@testing-library/react');
const {AffairsContext}=await import('../../src/features/public/affairs/authContext');
const {SchoolRecordManager}=await import('../../src/features/public/affairs/SchoolRecordManager');
const originalFetch=globalThis.fetch;
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;delete globals.__dtmManagerSession;});after(()=>{hook.deregister();dom.window.close();});
type Admin=NonNullable<AffairsSnapshot['admin']>;
function fixture():Admin{
  const base={enrollment_id:null,details:'Synthetic instructions',due_at:null,status:'open'};
  const data={profiles:[],students:[{id:student,user_id:owner,student_number:'SYN-A',full_name:'Synthetic Alpha'},{id:otherStudent,user_id:other,student_number:'SYN-B',full_name:'Synthetic Beta'}],sections:[],enrollments:[],charges:[],requests:[],
    dtmCourses:[{id:course,user_id:owner,code:'PERSONAL-A',title:'Personal Alpha',term:'Synthetic',source_mode:'personal'},
      {id:sampleCourse,user_id:owner,code:'SAMPLE-A',title:'Sample Alpha',term:'Synthetic',source_mode:'sample'},
      {id:otherCourse,user_id:other,code:'PERSONAL-B',title:'Personal Beta',term:'Synthetic',source_mode:'personal'}],
    assignments:[{...base,id:assignment,student_id:student,dtm_course_id:course,title:'Personal Alpha assignment',source_mode:'personal'},
      {...base,id:sampleAssignment,student_id:student,dtm_course_id:sampleCourse,title:'Sample Alpha assignment',source_mode:'sample'},
      {...base,id:otherAssignment,student_id:otherStudent,dtm_course_id:otherCourse,title:'Personal Beta assignment',source_mode:'personal'},
      {...base,id:'synthetic-school-only',student_id:student,dtm_course_id:null,enrollment_id:'synthetic-enrollment',title:'School-only assignment',source_mode:'sample'},
      {...base,id:'synthetic-wrong-owner',student_id:student,dtm_course_id:otherCourse,title:'Wrong course owner assignment',source_mode:'personal'}],
  };
  return data;
}
function mount(admin=fixture(),authId:string|null=manager,busy=false,onRefresh=()=>{}){
  const view=(identity:string|null=authId,isBusy=busy,data=admin)=><AffairsContext.Provider value={{user:identity?{id:identity} as User:null,loading:false,error:''}}><SchoolRecordManager admin={data} busy={isBusy} onManage={async()=>true} onRefresh={onRefresh}/></AffairsContext.Provider>;
  return {...render(view()),view};
}
function transport(){
  globals.__dtmManagerSession={data:{session:{user:{id:manager},access_token:'synthetic-manager-token'}},error:null};
  const calls:{url:string;body:Record<string,unknown>|null;signal:AbortSignal}[]=[],reviews:Record<string,unknown>[]=[];
  const controls={cleanupStatus:200,cleanupGate:null as Promise<void>|null,cleanupResult:{removed:2,remaining:0}};
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input),'http://localhost'),body=init?.body?JSON.parse(String(init.body)):null,signal=init?.signal as AbortSignal;
    calls.push({url:url.pathname+url.search,body,signal});assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-manager-token');
    if(url.pathname==='/api/affairs-action'){
      assert.deepEqual(body,{kind:'cleanup_dtm_submission_uploads',payload:{}});if(controls.cleanupGate)await controls.cleanupGate;
      signal.throwIfAborted();return controls.cleanupStatus===200?Response.json(controls.cleanupResult):new Response('private-provider-path',{status:controls.cleanupStatus});
    }
    if(url.pathname==='/api/affairs-manage'){
      assert.equal(body.kind,'save_dtm_submission_review');const p=body.payload;
      reviews.push({id:review,submission_id:submission,user_id:owner,upload_id:p.upload_id,status:p.status,grade_text:p.grade_text,feedback:p.feedback,version:p.expected_version+1,reviewed_at:stamp});
      return Response.json({kind:body.kind,assignmentId:p.assignment_id,submissionId:submission,uploadId:p.upload_id,reviewId:review,version:p.expected_version+1});
    }
    assert.equal(url.pathname,'/api/affairs-data');
    if(url.searchParams.get('scope')==='enrollment-certificate-admin')return Response.json({assessments:[],documents:[],documentMetadata:[]});
    assert.equal(url.searchParams.get('scope'),'dtm-submission-admin');
    const second=url.searchParams.get('assignment_id')===otherAssignment,who=second?other:owner,whichCourse=second?otherCourse:course;
    return Response.json({assignmentId:url.searchParams.get('assignment_id'),userId:who,courseId:whichCourse,dueAt:null,maxBytes:10485760,
      submission:{id:submission,assignment_id:url.searchParams.get('assignment_id'),user_id:who,course_id:whichCourse,source_mode:'local_submission',version:42,current_upload_id:upload,submitted_at:stamp,content_modified_at:stamp,due_at_at_submission:null},
      files:[{id:upload,filename:second?'synthetic-beta.txt':'synthetic-alpha.txt',path:`${who}/${submission}/${upload}`,sizeBytes:9,contentType:'text/plain',state:'current',expiresAt:stamp,committedAt:stamp}],reviews:second?[]:reviews});
  };
  return {calls,controls};
}
test('manager selection scopes real DTM assignments to student/course owner, preserves sample CRUD, and uses trusted manager JWT for version-zero review',async()=>{
  const h=transport();let refreshed=0;const screen=mount(fixture(),manager,false,()=>{refreshed++;});
  const select=screen.getByLabelText('DTM assignment to review') as HTMLSelectElement;
  assert.deepEqual([...select.options].map(option=>option.value),['',assignment,sampleAssignment]);
  assert.equal(h.calls.length,0,'Selection and cleanup are explicit, not mount effects.');
  const personalRow=screen.getByText('Personal Alpha assignment',{selector:'strong'}).closest('li')!;
  assert.equal(within(personalRow).queryByRole('button'),null);
  assert.ok(within(screen.getByText('Sample Alpha assignment',{selector:'strong'}).closest('li')!).getByRole('button',{name:'Edit'}));
  const sampleSelect=screen.container.querySelector('#manager-assignment-course') as HTMLSelectElement;
  assert.deepEqual([...sampleSelect.options].map(option=>option.value),['',`dtm:${sampleCourse}`]);
  fireEvent.change(select,{target:{value:assignment}});await waitFor(()=>assert.ok(screen.getByRole('form',{name:'Edit current submission review'})));
  fireEvent.change(screen.getByLabelText('Review status'),{target:{value:'graded'}});fireEvent.change(screen.getByLabelText('Grade text'),{target:{value:'0'}});
  fireEvent.change(screen.getByLabelText('Feedback'),{target:{value:' Literal synthetic feedback '}});fireEvent.click(screen.getByRole('button',{name:'Save submission review'}));
  await waitFor(()=>assert.equal(refreshed,1));const write=h.calls.find(call=>call.url==='/api/affairs-manage')!.body!;
  assert.deepEqual({...write.payload as object,request_id:undefined},{assignment_id:assignment,upload_id:upload,expected_version:0,status:'graded',grade_text:'0',feedback:' Literal synthetic feedback ',request_id:undefined});
  fireEvent.change(screen.getByLabelText('Student account'),{target:{value:otherStudent}});
  assert.equal(screen.queryByRole('form',{name:'Edit current submission review'}),null);assert.equal(screen.queryByText(/synthetic-alpha\.txt/),null);
  assert.deepEqual([...(screen.getByLabelText('DTM assignment to review') as HTMLSelectElement).options].map(option=>option.value),['',otherAssignment]);
  assert.ok(h.calls.filter(call=>call.url.startsWith('/api/affairs-data')).every(call=>call.signal.aborted));
  fireEvent.change(screen.getByLabelText('DTM assignment to review'),{target:{value:otherAssignment}});await waitFor(()=>assert.ok(screen.getByRole('option',{name:/synthetic-beta\.txt/})));
  assert.equal(h.calls.filter(call=>call.url==='/api/affairs-action').length,0);
});
test('maintenance is one explicit serialized batch, sanitizes failures, and never claims the entire queue is cleared',async()=>{
  const h=transport(),screen=mount(),section=within(screen.getByRole('region',{name:'Submission file maintenance'}));
  let release!:()=>void;h.controls.cleanupGate=new Promise<void>(resolve=>{release=resolve;});
  fireEvent.click(section.getByRole('button'));fireEvent.click(section.getByRole('button'));
  await waitFor(()=>assert.equal(h.calls.length,1));assert.ok(section.getByRole('button').hasAttribute('disabled'));
  release();await waitFor(()=>assert.match(section.getByRole('status').textContent??'',/acknowledged 2.*0 were not acknowledged/));
  assert.match(section.getByRole('status').textContent??'',/additional queued files may remain/);
  h.controls.cleanupStatus=503;h.controls.cleanupGate=null;fireEvent.click(section.getByRole('button'));
  await waitFor(()=>assert.ok(section.getByRole('alert')));assert.doesNotMatch(section.getByRole('alert').textContent??'',/private-provider-path/);assert.equal(section.queryByRole('status'),null);
  h.controls.cleanupStatus=200;fireEvent.click(section.getByRole('button'));await waitFor(()=>assert.ok(section.getByRole('status')));assert.equal(h.calls.length,3);
});
test('maintenance remains available after account deletion leaves no students, and authentication/busy state controls its availability',async()=>{
  const h=transport(),data=fixture();data.students=[];const screen=mount(data);
  assert.ok(screen.getByRole('button',{name:'Run submission cleanup batch'}));assert.equal(screen.queryByLabelText('DTM assignment to review'),null);
  screen.rerender(screen.view(manager,true));assert.ok(screen.getByRole('button',{name:'Run submission cleanup batch'}).hasAttribute('disabled'));
  screen.rerender(screen.view(null));assert.equal(screen.queryByRole('region',{name:'Submission file maintenance'}),null);assert.equal(h.calls.length,0);
});
test('account changes abort a pending cleanup and prevent its result from rendering in the next account',async()=>{
  const h=transport();let release!:()=>void;h.controls.cleanupGate=new Promise<void>(resolve=>{release=resolve;});const screen=mount();
  fireEvent.click(screen.getByRole('button',{name:'Run submission cleanup batch'}));await waitFor(()=>assert.equal(h.calls.length,1));
  screen.rerender(screen.view(other));assert.ok(h.calls[0].signal.aborted);release();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(within(screen.getByRole('region',{name:'Submission file maintenance'})).queryByRole('status'),null);
  fireEvent.click(screen.getByRole('button',{name:'Run submission cleanup batch'}));await waitFor(()=>assert.match(screen.getByRole('alert').textContent??'',/Sign in again/));assert.equal(h.calls.length,1);
});
test('certificate maintenance opens explicitly for the selected student with manager auth and resets draft on student switch',async()=>{
  const h=transport(),screen=mount();assert.equal(h.calls.length,0);
  fireEvent.click(screen.getByRole('button',{name:'Manage certificate assessment'}));await waitFor(()=>assert.ok(screen.getByRole('form',{name:'Edit certificate assessment'})));
  assert.equal(h.calls[0].url,'/api/affairs-data?scope=enrollment-certificate-admin&user_id='+owner);
  fireEvent.change(screen.getByLabelText('Student name'),{target:{value:'First account unsaved name'}});
  fireEvent.change(screen.getByLabelText('Student account'),{target:{value:otherStudent}});assert.equal(screen.queryByDisplayValue('First account unsaved name'),null);assert.ok(h.calls[0].signal.aborted);
  await waitFor(()=>assert.ok(screen.getByRole('form',{name:'Edit certificate assessment'})));assert.equal(h.calls[1].url,'/api/affairs-data?scope=enrollment-certificate-admin&user_id='+other);
  assert.equal((screen.getByLabelText('Student name') as HTMLInputElement).value,'');
  fireEvent.click(screen.getByRole('button',{name:'Hide certificate assessment'}));assert.equal(screen.queryByRole('form',{name:'Edit certificate assessment'}),null);assert.ok(h.calls[1].signal.aborted);
});
