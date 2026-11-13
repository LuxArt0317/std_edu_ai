import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter} from 'react-router';
import type {TuitionDocumentsRecords,TuitionDocumentsClient} from '../../src/services/tuitionDocumentsClient';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('/tuitionDocuments.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {TuitionDocumentsWorkspace}=await import('../../src/features/public/affairs/TuitionDocumentsWorkspace');hook.deregister();
const {render,cleanup,fireEvent,waitFor,act,within}=await import('@testing-library/react');afterEach(cleanup);after(()=>dom.window.close());
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000001';
const data=(text:string|null=null):TuitionDocumentsRecords=>({periods:[{id,userId:owner,label:'Synthetic local period'}],settlements:[{id,userId:owner,sourceMode:'local_demo',version:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',periodId:id,periodLabel:'Synthetic local period',text,rowOrder:0}],documents:[]});
const tree=(client:Pick<TuitionDocumentsClient,'load'>,userId=owner,view:'settlement'|'summer'|'evening'|'extended'='settlement')=><MemoryRouter><TuitionDocumentsWorkspace userId={userId} view={view} onLogout={()=>{}} client={client}/></MemoryRouter>;

test('selection waits for an explicit query; null remains unknown and blank remains literal blank',async()=>{
  let calls=0,text:string|null=null;const client={load:async(user:string)=>{assert.equal(user,owner);calls++;return data(text);}};
  const view=render(tree(client));await waitFor(()=>assert.ok(view.getByRole('option',{name:'Synthetic local period'})));
  assert.equal(view.queryByRole('region',{name:'站內結算紀錄'}),null);assert.equal(calls,1);
  fireEvent.change(view.getByRole('combobox'),{target:{value:id}});assert.equal(calls,1);
  fireEvent.click(within(view.getByRole('main')).getByRole('button',{name:'查詢'}));await waitFor(()=>assert.equal(view.getByRole('region',{name:'站內結算紀錄'}).textContent,'—'));assert.equal(calls,2);
  text='';fireEvent.click(within(view.getByRole('main')).getByRole('button',{name:'查詢'}));await waitFor(()=>assert.equal(calls,3));await waitFor(()=>assert.equal(view.getByRole('region',{name:'站內結算紀錄'}).textContent,''));
});

test('query errors hide prior results and retry the same selected period without provider details',async()=>{
  let calls=0;const client={load:async()=>{if(++calls===3)throw new Error('PRIVATE provider error');return data('Saved literal text');}};
  const view=render(tree(client));await waitFor(()=>assert.ok(view.getByRole('option',{name:'Synthetic local period'})));fireEvent.change(view.getByRole('combobox'),{target:{value:id}});
  const query=()=>within(view.getByRole('main')).getByRole('button',{name:'查詢'});fireEvent.click(query());await waitFor(()=>assert.ok(view.getByText('Saved literal text')));
  fireEvent.click(query());await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(view.queryByText('Saved literal text'),null);assert.doesNotMatch(view.container.textContent??'',/PRIVATE/);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));await waitFor(()=>assert.ok(view.getByText('Saved literal text')));assert.equal((view.getByRole('combobox') as HTMLSelectElement).value,id);assert.equal(calls,4);
});

test('account switch aborts old requests and rejects foreign or capability-bearing responses',async()=>{
  let finish:(value:TuitionDocumentsRecords)=>void=()=>{},signal:AbortSignal|undefined;
  const client={load:async(user:string,input?:AbortSignal)=>{if(user===other)return {periods:[],settlements:[],documents:[]};signal=input;return new Promise<TuitionDocumentsRecords>(resolve=>{finish=resolve;});}};
  const view=render(tree(client));view.rerender(tree(client,other));assert.equal(signal?.aborted,true);await act(async()=>finish(data('OLD ACCOUNT SECRET')));
  await waitFor(()=>assert.ok(view.getByRole('option',{name:'無對應資料'})));assert.doesNotMatch(view.container.textContent??'',/SECRET|Synthetic local period/);
  view.unmount();
  for(const value of [{...data(),settlements:[{...data().settlements[0],userId:other}]},{...data(),documents:[{availability:'verified_local_file'}]}]){
    const bad=render(tree({load:async()=>value as TuitionDocumentsRecords}));await waitFor(()=>assert.ok(bad.getByRole('alert')));assert.doesNotMatch(bad.container.textContent??'',/Synthetic local period/);bad.unmount();
  }
});

test('summer/evening landing controls remain disabled; metadata never creates a print callback',async()=>{
  for(const mode of ['summer','evening'] as const){
    const view=render(tree({load:async()=>data()},owner,mode));await waitFor(()=>assert.equal(view.getByRole('main').getAttribute('aria-busy'),'false'));
    assert.equal((view.container.querySelector('.tuition-print-button') as HTMLButtonElement).disabled,true);assert.equal(view.container.querySelector('a[download],iframe,object'),null);view.unmount();
  }
});
