import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter} from 'react-router';
import {emptyDtmGradeCells,type DtmGradeReportData,type DtmGradeReportClient} from '../../src/services/dtmGradeReport';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','Node','Event','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:dom.window.requestAnimationFrame.bind(dom.window),configurable:true});
Object.defineProperty(globalThis,'cancelAnimationFrame',{value:dom.window.cancelAnimationFrame.bind(dom.window),configurable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',shortCircuit:true,source:'export {};'}:next(url,context);}});
const {DtmCourseGradeReport}=await import('../../src/features/public/dtm/DtmCourseGradeReport');hook.deregister();
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
afterEach(cleanup);after(()=>dom.window.close());
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const course='20000000-0000-4000-8000-000000000001',otherCourse='20000000-0000-4000-8000-000000000002';
const item='30000000-0000-4000-8000-000000000001';
const record=(userId=owner,courseId=course):DtmGradeReportData=>({report:{id:'40000000-0000-4000-8000-000000000001',userId,courseId,sourceMode:'local_demo',version:1,
 createdAt:'2030-01-01T00:00:00Z',updatedAt:'2030-01-01T00:00:00Z',items:[{...emptyDtmGradeCells(),id:item,label:'Saved assessment',activityKind:null,gradeText:'P'}],total:null}});
type Client=Pick<DtmGradeReportClient,'load'>;
const tree=(client:Client,userId=owner,courseId=course,hash='')=><MemoryRouter initialEntries={['/dtm/course/'+courseId+'/grades'+hash]}><DtmCourseGradeReport client={client} userId={userId} course={{id:courseId,title:'Saved course'}} t={(_zh,en)=>en}/></MemoryRouter>;
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

test('course report clears old account/course data immediately and ignores aborted read completion',async()=>{
 const pending=deferred<DtmGradeReportData>(),signals:AbortSignal[]=[];let reads=0;
 const client:Client={load:async(user,id,signal)=>{signals.push(signal!);return ++reads===1?pending.promise:record(user,id);}};
 const view=render(tree(client));assert.match(view.getByRole('status').textContent!,/Loading/);
 view.rerender(tree(client,other,otherCourse));assert.equal(signals[0].aborted,true);
 await waitFor(()=>assert.equal(view.container.querySelectorAll('tbody tr').length,2));
 await act(async()=>pending.resolve({...record(),report:{...record().report!,items:[{...record().report!.items[0],label:'STALE PRIVATE ITEM'}]}}));
 assert.doesNotMatch(view.container.textContent!,/STALE PRIVATE ITEM/);assert.match(view.container.textContent!,/Saved assessment/);
 view.unmount();assert.equal(signals[1].aborted,true);
});

test('failed reads do not show provider details or empty grades and retry reloads the same course',async()=>{
 let reads=0;const client:Client={load:async(user,id)=>{assert.equal(user,owner);assert.equal(id,course);if(++reads===1)throw Error('PRIVATE provider response');return record();}};
 const view=render(tree(client));await waitFor(()=>assert.ok(view.getByRole('alert')));
 assert.doesNotMatch(view.container.textContent!,/PRIVATE/);assert.equal(view.queryByRole('table'),null);
 fireEvent.click(view.getByRole('button'));
 await waitFor(()=>assert.ok(view.queryByRole('table')));assert.equal(reads,2);
});

test('report anchors resolve after asynchronous loading without using legacy grade IDs',async()=>{
 const pending=deferred<DtmGradeReportData>(),scrolled:string[]=[];
 Object.defineProperty(dom.window.HTMLElement.prototype,'scrollIntoView',{value:function(this:HTMLElement){scrolled.push(this.id);},configurable:true});
 const view=render(tree({load:()=>pending.promise},owner,course,'#report-item-'+item));
 assert.deepEqual(scrolled,[]);await act(async()=>pending.resolve(record()));
 await waitFor(()=>assert.deepEqual(scrolled,['report-item-'+item]));view.unmount();
 render(tree({load:async()=>record()},owner,course,'#grade-'+item));
 await waitFor(()=>assert.ok(document.querySelector('table')));await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));
 assert.deepEqual(scrolled,['report-item-'+item]);
});
