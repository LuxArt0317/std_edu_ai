import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire} from 'node:module';
import type {DtmCourseContentClient,DtmCourseContentData} from '../../src/services/dtmCourseContent';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','Node','Event','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,writable:true,configurable:true});
const {useDtmCourseHeader}=await import('../../src/features/public/dtm/useDtmCourseHeader');
const {renderHook,cleanup,waitFor,act}=await import('@testing-library/react');
afterEach(cleanup);after(()=>dom.window.close());
type Client=Pick<DtmCourseContentClient,'load'>;
const user='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',courseId='20000000-0000-4000-8000-000000000001',otherCourse='20000000-0000-4000-8000-000000000002';
const page=(userId=user,id=courseId):DtmCourseContentData=>({course:{userId,id,title:'Verified course',code:'QA',term:'Synthetic'},content:null,activities:[],total:0,limit:100,nextCursor:null,revision:'a'.repeat(64),unavailableReferenceCount:0});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
test('header uses only the exact first page and does not treat a partial inventory as complete content',async()=>{
 const value=page();value.activities=Array.from({length:100},(_,i)=>({kind:'assignment',id:'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),title:'Synthetic '+i,details:'',dueAt:null}));value.total=101;value.nextCursor={kind:'assignment',id:value.activities[99].id};
 const calls:unknown[][]=[];const client:Client={load:async(...args)=>{calls.push(args);return value;}};
 const view=renderHook(()=>useDtmCourseHeader(user,courseId,'first',client));await waitFor(()=>assert.equal(view.result.current.course?.title,'Verified course'));assert.deepEqual(calls[0].slice(0,3),[user,courseId,{}]);assert.equal(calls.length,1);assert.deepEqual(Object.keys(view.result.current).sort(),['course','failed','loading','retry']);view.unmount();assert.equal((calls[0][3] as AbortSignal).aborted,true);
});
test('account/course/client/refresh changes clear header immediately, abort old work, and suppress stale completion',async()=>{
 const pending=deferred<DtmCourseContentData>(),signals:AbortSignal[]=[];
 const client:Client={load:async(owner,id,_options,signal)=>{signals.push(signal!);return owner===user?pending.promise:page(owner,id);}};
 const initial={owner:user,id:courseId as string|undefined,refresh:'first',client};
 const view=renderHook(({owner,id,refresh,client})=>useDtmCourseHeader(owner,id,refresh,client),{initialProps:initial});await waitFor(()=>assert.equal(signals.length,1));
 view.rerender({...initial,owner:other});assert.equal(view.result.current.course,null);assert.equal(signals[0].aborted,true);await waitFor(()=>assert.equal(view.result.current.course?.userId,other));await act(async()=>pending.resolve(page()));await waitFor(()=>assert.equal(view.result.current.course?.userId,other));
 for(const changed of [{...initial,owner:other,id:otherCourse},{...initial,owner:other,refresh:'next'}]){view.rerender(changed);assert.equal(view.result.current.course,null);await waitFor(()=>assert.equal(view.result.current.course?.id,changed.id));}
 const late=deferred<DtmCourseContentData>();view.rerender({...initial,owner:other,client:{load:()=>late.promise}});assert.equal(view.result.current.course,null);view.rerender({...initial,owner:other,id:undefined});assert.equal(view.result.current.loading,false);await act(async()=>late.resolve(page(other)));assert.equal(view.result.current.course,null);
});
test('wrong owner, wrong course, invalid first-page envelope and read failure expose no header; explicit retry recovers',async()=>{
 const values=[page(other),page(user,otherCourse),{...page(),extra:true},null];let calls=0;const client:Client={load:async()=>{const value=values[calls++];if(value===null)throw Error('PRIVATE provider detail');return value??page();}};
 const view=renderHook(()=>useDtmCourseHeader(user,courseId,'first',client));for(let count=1;count<=4;count++){await waitFor(()=>assert.equal(calls,count));await waitFor(()=>assert.equal(view.result.current.failed,true));assert.equal(view.result.current.course,null);await act(async()=>view.result.current.retry());}
 await waitFor(()=>assert.equal(view.result.current.course?.title,'Verified course'));assert.equal(view.result.current.failed,false);
});
test('disabled hook does not resolve a session or fetch',async()=>{
 let calls=0;const client:Client={load:async()=>{calls++;return page();}};const view=renderHook(()=>useDtmCourseHeader(user,undefined,'first',client));await act(async()=>{});assert.equal(calls,0);assert.equal(view.result.current.loading,false);assert.equal(view.result.current.course,null);assert.equal(view.result.current.failed,false);
});
