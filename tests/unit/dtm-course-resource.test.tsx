import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import type {DtmCourseResourceClient,DtmCourseResourceData} from '../../src/services/dtmCourseResource';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','Node','Event','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,writable:true,configurable:true});
const hooks=registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',shortCircuit:true,source:'export {};'}:next(url,context);}});
const {useDtmCourseResource}=await import('../../src/features/public/dtm/useDtmCourseResource');
const {DtmCourseResource}=await import('../../src/features/public/dtm/DtmCourseResource');
const {render,renderHook,cleanup,waitFor,act}=await import('@testing-library/react');
afterEach(cleanup);after(()=>{hooks.deregister();dom.window.close();});
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',courseId='20000000-0000-4000-8000-000000000001',materialId='30000000-0000-4000-8000-000000000001';
const data=(userId=owner,course=courseId,id=materialId):DtmCourseResourceData=>({course:{id:course,userId,title:'Synthetic course',code:'QA',term:'Synthetic term',sourceMode:'personal'},material:{id,userId,courseId:course,title:'Synthetic resource',kind:'page',summary:'https://ignored.example.com',position:1,sourceMode:'personal',sourceUrl:'https://dtm.stu.edu.tw/mod/url/view.php?id=123',targetUrl:'https://example.com/resource?unit=1#details'}});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
const t=(zh:string)=>zh;
test('resource pane displays only title and literal safe target with no navigation side effect or provenance fallback',()=>{
 const material=data().material!;const view=render(<DtmCourseResource material={material} t={t}/>);
 assert.ok(view.getByRole('heading',{level:2,name:'Synthetic resource'}));const link=view.getByRole('link',{name:material.targetUrl!});
 assert.equal(link.getAttribute('href'),material.targetUrl);assert.equal(link.getAttribute('target'),'_blank');assert.equal(link.getAttribute('rel'),'noopener noreferrer');
 assert.equal(view.container.querySelector('.urlworkaround')?.textContent,'點選 '+material.targetUrl+' 來開啟資源。');
 assert.equal(view.queryByText(material.summary),null);assert.equal(view.container.querySelector('button,iframe,form,img'),null);
 assert.equal(dom.window.location.href,'http://localhost/');
});
test('null or unsafe destination stays unavailable despite populated summary and source URL',()=>{
 for(const targetUrl of [null,'','javascript:alert(1)','https://127.0.0.1/','https://user:pass@example.com/']){
  const view=render(<DtmCourseResource material={{...data().material!,targetUrl}} t={t}/>);assert.ok(view.getByText('資源連結尚未提供。'));assert.equal(view.queryByRole('link'),null);view.unmount();
 }
});
test('exact resource hook retains owned course even when material is absent and supports refresh',async()=>{
 const calls:unknown[][]=[];const client:DtmCourseResourceClient={load:async(...args)=>{calls.push(args);return{...data(),material:null};}};
 const view=renderHook(({refresh})=>useDtmCourseResource(owner,courseId,materialId,refresh,client),{initialProps:{refresh:'first'}});
 assert.equal(view.result.current.loading,true);await waitFor(()=>assert.equal(view.result.current.loading,false));assert.equal(view.result.current.failed,false);assert.equal(view.result.current.data?.course.title,'Synthetic course');assert.equal(view.result.current.data?.material,null);
 assert.deepEqual(calls[0].slice(0,3),[owner,courseId,materialId]);view.rerender({refresh:'second'});assert.equal(view.result.current.data,null);await waitFor(()=>assert.equal(calls.length,2));view.unmount();assert.equal((calls[1][3] as AbortSignal).aborted,true);
});
test('account, course, material and client changes hide previous data immediately and suppress late responses',async()=>{
 const pending=deferred<DtmCourseResourceData>(),signals:AbortSignal[]=[];const first:DtmCourseResourceClient={load:async(user,course,id,signal)=>{signals.push(signal!);return user===owner?pending.promise:data(user,course,id);}};
 const initial={user:owner,course:courseId,id:materialId as string|undefined,client:first};
 const view=renderHook(({user,course,id,client})=>useDtmCourseResource(user,course,id,'first',client),{initialProps:initial});
 await waitFor(()=>assert.equal(signals.length,1));view.rerender({...initial,user:other});assert.equal(signals[0].aborted,true);assert.equal(view.result.current.data,null);
 await waitFor(()=>assert.equal(view.result.current.data?.course.userId,other));await act(async()=>pending.resolve(data()));await waitFor(()=>assert.equal(view.result.current.data?.course.userId,other));
 for(const changed of [{...initial,user:other,course:materialId},{...initial,user:other,id:courseId}]){view.rerender(changed);assert.equal(view.result.current.data,null);await waitFor(()=>assert.equal(view.result.current.loading,false));await waitFor(()=>assert.equal(view.result.current.data?.material?.id,changed.id));}
 const next=deferred<DtmCourseResourceData>();view.rerender({...initial,user:other,client:{load:()=>next.promise}});assert.equal(view.result.current.data,null);view.rerender({...initial,user:other,id:undefined});assert.equal(view.result.current.loading,false);await act(async()=>next.resolve(data(other)));assert.equal(view.result.current.data,null);
});
test('failed and malformed/foreign reads expose no partial data and retry can recover',async()=>{
 let calls=0;const client:DtmCourseResourceClient={load:async()=>{calls++;if(calls===1)throw Error('PRIVATE provider detail');if(calls===2)return data(other);if(calls===3)return{...data(),extra:true} as DtmCourseResourceData;return data();}};
 const view=renderHook(()=>useDtmCourseResource(owner,courseId,materialId,'first',client));
 for(let attempt=1;attempt<=3;attempt++){await waitFor(()=>assert.equal(calls,attempt));await waitFor(()=>assert.equal(view.result.current.failed,true));assert.equal(view.result.current.data,null);await act(async()=>view.result.current.retry());}
 await waitFor(()=>assert.equal(view.result.current.data?.material?.title,'Synthetic resource'));assert.equal(view.result.current.failed,false);
});
