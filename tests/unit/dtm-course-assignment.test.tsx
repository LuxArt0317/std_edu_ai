import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire} from 'node:module';
import type {DtmCourseContentClient,DtmCourseContentAssignmentData} from '../../src/services/dtmCourseContent';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','Node','Event','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const {useDtmCourseAssignment}=await import('../../src/features/public/dtm/useDtmCourseAssignment');
const {renderHook,cleanup,waitFor,act}=await import('@testing-library/react');
afterEach(cleanup);after(()=>dom.window.close());
type Client=Pick<DtmCourseContentClient,'loadAssignment'>;
const user='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const course='20000000-0000-4000-8000-000000000001',assignment='30000000-0000-4000-8000-000000000001';
const data=(userId=user,courseId=course,id=assignment):DtmCourseContentAssignmentData=>({assignment:{id,userId,courseId,title:'Exact activity',details:'Persisted details',dueAt:null,status:'open',submittedAt:null,sourceMode:'personal',meetingId:null,origin:'manual'}});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};}

test('exact assignment lookup does not depend on a generic workspace assignment page',async()=>{
 const calls:unknown[][]=[];const client:Client={loadAssignment:async(...args)=>{calls.push(args);return data();}};
 const view=renderHook(()=>useDtmCourseAssignment(user,course,assignment,'first',client));
 assert.equal(view.result.current.loading,true);await waitFor(()=>assert.equal(view.result.current.assignment?.title,'Exact activity'));
 assert.deepEqual(calls[0].slice(0,3),[user,course,assignment]);assert.ok(calls[0][3] instanceof AbortSignal);
 assert.equal(view.result.current.assignment?.dtmCourseId,course);assert.equal(view.result.current.assignment?.status,'open');
 view.unmount();assert.equal((calls[0][3] as AbortSignal).aborted,true);
});

test('identity, route and client changes clear old data and ignore late completions',async()=>{
 const pending=deferred<DtmCourseContentAssignmentData>(),signals:AbortSignal[]=[];
 const first:Client={loadAssignment:async(owner,_course,id,signal)=>{signals.push(signal!);return owner===user?pending.promise:data(owner,_course,id);}};
 const view=renderHook(({owner,id,client}:{owner:string;id:string|undefined;client:Client})=>useDtmCourseAssignment(owner,course,id,'first',client),{initialProps:{owner:user,id:assignment as string|undefined,client:first}});
 await waitFor(()=>assert.equal(signals.length,1));
 view.rerender({owner:other,id:assignment,client:first});assert.equal(view.result.current.assignment,null);assert.equal(signals[0].aborted,true);
 await waitFor(()=>assert.equal(view.result.current.assignment?.title,'Exact activity'));
 await act(async()=>pending.resolve({assignment:{...data().assignment!,title:'STALE PRIVATE'}}));
 assert.equal(view.result.current.assignment?.title,'Exact activity');
 const next=deferred<DtmCourseContentAssignmentData>();view.rerender({owner:other,id:assignment,client:{loadAssignment:()=>next.promise}});
 assert.equal(view.result.current.assignment,null);assert.equal(view.result.current.loading,true);
 view.rerender({owner:other,id:undefined,client:first});assert.equal(view.result.current.assignment,null);assert.equal(view.result.current.loading,false);
 await act(async()=>next.resolve(data(other)));assert.equal(view.result.current.assignment,null);
});

test('read errors and foreign rows fail closed; retry and refresh re-read exactly',async()=>{
 let calls=0;const client:Client={loadAssignment:async()=>{calls++;if(calls===1)throw Error('PRIVATE provider detail');if(calls===2)return data(other);return data();}};
 const view=renderHook(({refresh})=>useDtmCourseAssignment(user,course,assignment,refresh,client),{initialProps:{refresh:'first'}});
 await waitFor(()=>assert.equal(view.result.current.failed,true));assert.equal(view.result.current.assignment,null);
 await act(async()=>view.result.current.retry());await waitFor(()=>assert.equal(calls,2));await waitFor(()=>assert.equal(view.result.current.failed,true));assert.equal(view.result.current.assignment,null);
 await act(async()=>view.result.current.retry());await waitFor(()=>assert.equal(view.result.current.assignment?.title,'Exact activity'));
 view.rerender({refresh:'next'});assert.equal(view.result.current.assignment,null);await waitFor(()=>assert.equal(calls,4));
});

test('successful missing record is distinct from a failed lookup',async()=>{
 const client:Client={loadAssignment:async()=>({assignment:null})};const stable=renderHook(()=>useDtmCourseAssignment(user,course,assignment,'first',client));
 await waitFor(()=>assert.equal(stable.result.current.loading,false));assert.equal(stable.result.current.failed,false);assert.equal(stable.result.current.assignment,null);
});
