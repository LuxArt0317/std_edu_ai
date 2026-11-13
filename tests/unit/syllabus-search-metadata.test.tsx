import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {createRequire} from 'node:module';
import {newCourseOffering,type CourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {SyllabusSearchClientError,type SyllabusMetadataPayload,type SyllabusMetadataReceipt,type SyllabusSearchApiClient} from '../../src/services/syllabusSearchClient';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const {SyllabusSearchMetadataEditor}=await import('../../src/features/public/affairs/SyllabusSearchMetadataEditor');
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');afterEach(cleanup);
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const record:CourseOffering={...newCourseOffering(),id:'20000000-0000-4000-8000-000000000001',version:2,syllabus_is_current:null,academic_year_text:null,semester_text:''};
const receipt=(payload:SyllabusMetadataPayload):SyllabusMetadataReceipt=>({id:payload.id,version:payload.expected_version+1,kind:'save_syllabus_search_metadata',summary:'Saved'});
const noAction=()=>{};
const base={userId:owner,record,latest:record,disabled:false,onBusyChange:noAction,onSaved:noAction,onReload:noAction};
function deferred<T>(){let resolve:(value:T)=>void=()=>{},reject:(reason:unknown)=>void=()=>{};const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

test('metadata fields preserve null, false, empty and literal Unicode without term inference',async()=>{
  const calls:SyllabusMetadataPayload[]=[];const client:Pick<SyllabusSearchApiClient,'saveMetadata'>={saveMetadata:async(user,payload)=>{assert.equal(user,owner);calls.push(payload);return receipt(payload);}};
  const view=render(<SyllabusSearchMetadataEditor {...base} client={client}/>);
  assert.equal((view.getByLabelText('當期課綱歸屬') as HTMLSelectElement).value,'');assert.equal((view.getByLabelText('學年顯示文字未提供') as HTMLInputElement).checked,true);assert.equal((view.getByLabelText('學期顯示文字未提供') as HTMLInputElement).checked,false);
  fireEvent.change(view.getByLabelText('當期課綱歸屬'),{target:{value:'false'}});fireEvent.click(view.getByLabelText('學年顯示文字未提供'));fireEvent.change(view.getByLabelText('學年顯示文字'),{target:{value:' 𐀀學年 '}});fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));
  await waitFor(()=>assert.equal(calls.length,1));assert.equal(calls[0].expected_version,2);assert.equal(calls[0].syllabus_is_current,false);assert.equal(calls[0].academic_year_text,' 𐀀學年 ');assert.equal(calls[0].semester_text,'');
  await waitFor(()=>assert.ok(view.getByText('已儲存課綱查詢設定。')));fireEvent.click(view.getByRole('button',{name:'清空查詢設定'}));fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));
  await waitFor(()=>assert.equal(calls.length,2));assert.equal(calls[1].expected_version,3);assert.equal(calls[1].syllabus_is_current,null);assert.equal(calls[1].academic_year_text,null);assert.equal(calls[1].semester_text,null);
});

test('network retry keeps the same receipt and version while simultaneous saves are blocked',async()=>{
  const calls:SyllabusMetadataPayload[]=[],pending=deferred<SyllabusMetadataReceipt>(),busy:boolean[]=[];
  const client:Pick<SyllabusSearchApiClient,'saveMetadata'>={saveMetadata:async(_user,payload)=>{calls.push(payload);if(calls.length===1)throw new SyllabusSearchClientError('合成失敗');return pending.promise;}};
  const view=render(<SyllabusSearchMetadataEditor {...base} client={client} onBusyChange={value=>busy.push(value)}/>);
  fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));await waitFor(()=>assert.ok(view.getByText('合成失敗')));
  fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));fireEvent.submit(view.container.querySelector('form')!);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
  await act(async()=>pending.resolve(receipt(calls[1])));assert.deepEqual(busy,[true,false,true,false]);
});

test('changed payload gets a new request ID; codepoint limits permit 30 supplementary characters only',async()=>{
  const calls:SyllabusMetadataPayload[]=[];const client:Pick<SyllabusSearchApiClient,'saveMetadata'>={saveMetadata:async(_user,payload)=>{calls.push(payload);throw new SyllabusSearchClientError('合成失敗');}};
  const view=render(<SyllabusSearchMetadataEditor {...base} client={client}/>);fireEvent.click(view.getByLabelText('學年顯示文字未提供'));
  fireEvent.change(view.getByLabelText('學年顯示文字'),{target:{value:'字'.repeat(31)}});fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));assert.equal(calls.length,0);assert.match(view.getByRole('alert').textContent??'',/30/);
  fireEvent.change(view.getByLabelText('學年顯示文字'),{target:{value:'𐀀'.repeat(30)}});fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));await waitFor(()=>assert.ok(view.getByText('合成失敗')));
  fireEvent.change(view.getByLabelText('學年顯示文字'),{target:{value:'changed'}});fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));await waitFor(()=>assert.equal(calls.length,2));assert.notEqual(calls[0].request_id,calls[1].request_id);assert.equal(calls[0].academic_year_text,'𐀀'.repeat(30));
});

test('stale dirty data and 409 conflicts require an explicit refresh, never automatic rebase',async()=>{
  let calls=0,reloads=0;const client:Pick<SyllabusSearchApiClient,'saveMetadata'>={saveMetadata:async()=>{calls++;throw new SyllabusSearchClientError('合成版本衝突',409);}};
  const view=render(<SyllabusSearchMetadataEditor {...base} client={client} onReload={()=>reloads++}/>);
  fireEvent.change(view.getByLabelText('當期課綱歸屬'),{target:{value:'true'}});view.rerender(<SyllabusSearchMetadataEditor {...base} latest={{...record,version:3}} client={client} onReload={()=>reloads++}/>);
  assert.equal((view.getByRole('button',{name:'儲存課綱查詢設定'}) as HTMLButtonElement).disabled,true);assert.equal((view.getByLabelText('當期課綱歸屬') as HTMLSelectElement).value,'true');fireEvent.click(view.getByRole('button',{name:'重新載入課程'}));assert.equal(reloads,1);assert.equal(calls,0);
  view.rerender(<SyllabusSearchMetadataEditor {...base} client={client} onReload={()=>reloads++}/>);fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));await waitFor(()=>assert.ok(view.getByText('合成版本衝突')));assert.equal(calls,1);
  assert.equal((view.getByRole('button',{name:'儲存課綱查詢設定'}) as HTMLButtonElement).disabled,true);
});

test('account change aborts the pending write and never emits its late result for the next account',async()=>{
  const pending=deferred<SyllabusMetadataReceipt>(),calls:SyllabusMetadataPayload[]=[];let signal:AbortSignal|undefined,saved=0;
  const client:Pick<SyllabusSearchApiClient,'saveMetadata'>={saveMetadata:async(_user,payload,input)=>{calls.push(payload);signal=input;return pending.promise;}};
  const view=render(<SyllabusSearchMetadataEditor {...base} client={client} onSaved={()=>saved++}/>);fireEvent.click(view.getByRole('button',{name:'儲存課綱查詢設定'}));
  view.rerender(<SyllabusSearchMetadataEditor {...base} userId={other} client={client} onSaved={()=>saved++}/>);assert.equal(signal?.aborted,true);
  await act(async()=>pending.resolve(receipt(calls[0])));assert.equal(saved,0);assert.equal(view.queryByText('已儲存課綱查詢設定。'),null);
});

test('new or removed offerings cannot create metadata independently',()=>{
  const client:Pick<SyllabusSearchApiClient,'saveMetadata'>={saveMetadata:async()=>{throw new Error('No write');}};
  const view=render(<SyllabusSearchMetadataEditor {...base} record={{...record,version:0}} latest={undefined} client={client}/>);assert.ok(view.getByText('請先儲存課程，再維護課綱查詢設定。'));assert.equal((view.getByRole('button',{name:'儲存課綱查詢設定'}) as HTMLButtonElement).disabled,true);
  view.rerender(<SyllabusSearchMetadataEditor {...base} latest={undefined} client={client}/>);assert.equal((view.getByRole('button',{name:'儲存課綱查詢設定'}) as HTMLButtonElement).disabled,true);
});
