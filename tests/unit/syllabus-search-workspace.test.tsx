import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {readSyllabusSearchRoute,syllabusSearchRouteParams,SyllabusSearchClientError,type CompleteSyllabusSearchResult,type SyllabusSearchApiClient,type SyllabusSearchClient,type SyllabusSearchOptions} from '../../src/services/syllabusSearchClient';
import type {SyllabusSearchFilters} from '../../src/features/public/affairs/SyllabusSearch';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','FormData','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const hook=registerHooks({load(url,context,next){return ['/syllabusSearch.css','/courseSyllabus.css'].some(path=>url.endsWith(path))?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {SyllabusSearchWorkspace,SyllabusSearchRoute}=await import('../../src/features/public/affairs/SyllabusSearchWorkspace');hook.deregister();
const {MemoryRouter,useLocation}=await import('react-router');
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');afterEach(cleanup);
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const options:SyllabusSearchOptions={terms:[{value:'T1',label:'合成學期'}],departments:[{value:'DEMO',label:'合成系所'}]};
const filters:SyllabusSearchFilters={keyword:'restored',scope:'historical',term:'T1',department:'DEMO',themes:['1','26']};
const result=(name='合成公開課程'):CompleteSyllabusSearchResult=>({scope:'historical',total:1,revision:'a'.repeat(32),sort:{key:'sequence',direction:'asc'},rows:[{id:'20000000-0000-4000-8000-000000000001',sequence:1,course_code:'DEMO-001',course_name:name,admission_name:'',instructor:'合成教師',academicYearText:null,semesterText:'0'}]});
const noDetail=()=>{};
function deferred<T>(){let resolve:(value:T)=>void=()=>{},reject:(reason:unknown)=>void=()=>{};const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

test('host loads only options initially and never treats an unqueried catalogue as empty',async()=>{
  let searches=0;const client:SyllabusSearchClient={loadOptions:async userId=>{assert.equal(userId,owner);return options;},search:async()=>{searches++;return result();}};
  const view=render(<SyllabusSearchWorkspace userId={owner} client={client} onOpenDetail={noDetail}/>);
  await waitFor(()=>assert.ok(view.getByText('請設定條件後查詢。')));assert.equal(searches,0);assert.equal(view.queryByText(/查詢結果計0筆/),null);
  assert.equal((view.getByLabelText('學年學期') as HTMLSelectElement).value,'');assert.equal(view.queryByRole('button',{name:/下一頁|上一頁/}),null);
});

test('failed search retains submitted retry criteria even after the visible draft changes',async()=>{
  const calls:SyllabusSearchFilters[]=[],saved:SyllabusSearchFilters[]=[],pending=deferred<CompleteSyllabusSearchResult>();
  const client:SyllabusSearchClient={loadOptions:async()=>options,search:async(_userId,query)=>{calls.push(structuredClone(query));return calls.length===1?pending.promise:{...result(),scope:query.scope};}};
  const view=render(<SyllabusSearchWorkspace userId={owner} client={client} onOpenDetail={noDetail} onFiltersChange={value=>saved.push(value)}/>);
  await waitFor(()=>assert.ok(view.getByText('請設定條件後查詢。')));
  fireEvent.change(view.getByLabelText('關鍵字'),{target:{value:'submitted'}});fireEvent.click(view.getByRole('button',{name:'查詢'}));
  assert.ok(view.getByText('查詢中…'));await act(async()=>pending.reject(new SyllabusSearchClientError('合成連線失敗')));
  assert.equal(view.getByRole('alert').textContent,'合成連線失敗');assert.equal(view.queryByText(/查詢結果計0筆/),null);
  fireEvent.change(view.getByLabelText('關鍵字'),{target:{value:'unsubmitted'}});fireEvent.click(view.getByRole('button',{name:'重試'}));
  await waitFor(()=>assert.ok(view.getByText('當期課綱查詢結果計1筆')));assert.deepEqual(calls.map(item=>item.keyword),['submitted','submitted']);assert.equal(saved.length,1);
  assert.equal((view.getByLabelText('關鍵字') as HTMLInputElement).value,'unsubmitted');
});

test('option errors retry metadata, preserve initial criteria and never invent fallback options',async()=>{
  let loads=0,searches=0;const client:SyllabusSearchClient={loadOptions:async()=>{if(++loads===1)throw new SyllabusSearchClientError('合成選項錯誤');return options;},search:async(_userId,query)=>{searches++;assert.deepEqual(query,filters);return result();}};
  const view=render(<SyllabusSearchWorkspace userId={owner} client={client} initialFilters={filters} initialSearch onOpenDetail={noDetail}/>);
  await waitFor(()=>assert.equal(view.getByRole('alert').textContent,'合成選項錯誤'));assert.equal(view.queryByText('合成學期'),null);assert.equal(searches,0);
  fireEvent.click(view.getByRole('button',{name:'重試'}));await waitFor(()=>assert.ok(view.getByText('歷史課綱查詢結果計1筆')));assert.equal(loads,2);assert.equal(searches,1);
});

test('account switch immediately hides prior rows and aborts in-flight work; late responses cannot repopulate',async()=>{
  const delayed=deferred<CompleteSyllabusSearchResult>(),signals:AbortSignal[]=[],accounts:string[]=[];let firstSearch=true;
  const client:SyllabusSearchClient={loadOptions:async()=>options,search:async(userId,_query,signal)=>{accounts.push(userId);signals.push(signal!);if(firstSearch){firstSearch=false;return result('先前帳戶課程');}return delayed.promise;}};
  const view=render(<SyllabusSearchWorkspace userId={owner} client={client} initialFilters={filters} initialSearch onOpenDetail={noDetail}/>);
  await waitFor(()=>assert.ok(view.getByText('先前帳戶課程')));fireEvent.click(view.getByRole('button',{name:'查詢'}));assert.equal(view.queryByText('先前帳戶課程'),null);
  view.rerender(<SyllabusSearchWorkspace userId={other} client={client} onOpenDetail={noDetail}/>);
  assert.equal(view.queryByText('先前帳戶課程'),null);assert.equal(signals.at(-1)?.aborted,true);assert.equal((view.getByLabelText('關鍵字') as HTMLInputElement).value,'');
  await act(async()=>delayed.resolve(result('過期回應')));await waitFor(()=>assert.ok(view.getByText('請設定條件後查詢。')));
  assert.equal(view.queryByText('過期回應'),null);assert.deepEqual(accounts,[owner,owner]);
});

test('local detail callback and parent navigation identity restore explicit submitted filters without URLs',async()=>{
  const calls:SyllabusSearchFilters[]=[],opened:string[]=[];
  const client:SyllabusSearchClient={loadOptions:async()=>options,search:async(_userId,query)=>{calls.push(structuredClone(query));return result();}};
  const view=render(<SyllabusSearchWorkspace userId={owner} client={client} initialFilters={filters} initialSearch navigationKey="back-1" onOpenDetail={row=>opened.push(row.id)}/>);
  await waitFor(()=>assert.ok(view.getByText('歷史課綱查詢結果計1筆')));fireEvent.click(view.getByRole('button',{name:'合成公開課程：DEMO-001，開啟課程大綱'}));assert.deepEqual(opened,[result().rows[0].id]);
  fireEvent.change(view.getByLabelText('關鍵字'),{target:{value:'not submitted'}});
  view.rerender(<SyllabusSearchWorkspace userId={owner} client={client} initialFilters={filters} initialSearch navigationKey="back-2" onOpenDetail={noDetail}/>);
  assert.equal((view.getByLabelText('關鍵字') as HTMLInputElement).value,'restored');await waitFor(()=>assert.equal(calls.length,2));assert.deepEqual(calls,[filters,filters]);
  assert.equal(view.container.querySelector('a[href]'),null);assert.equal(window.location.href,'http://localhost/');
});

test('unknown selected metadata fails explicitly instead of producing misleading empty results',async()=>{
  let searches=0;const client:SyllabusSearchClient={loadOptions:async()=>options,search:async()=>{searches++;return result();}};
  const view=render(<SyllabusSearchWorkspace userId={owner} client={client} initialFilters={{...filters,term:'missing'}} initialSearch onOpenDetail={noDetail}/>);
  await waitFor(()=>assert.match(view.getByRole('alert').textContent??'',/所選學期或系所/));assert.equal(searches,0);assert.equal(view.queryByText(/查詢結果計0筆/),null);
  fireEvent.change(view.getByLabelText('學年學期'),{target:{value:'T1'}});fireEvent.click(view.getByRole('button',{name:'查詢'}));await waitFor(()=>assert.equal(searches,1));
});

test('unmount aborts metadata work and a late rejection cannot update a discarded host',async()=>{
  const pending=deferred<SyllabusSearchOptions>();let signal:AbortSignal|undefined;
  const client:SyllabusSearchClient={loadOptions:async(_userId,input)=>{signal=input;return pending.promise;},search:async()=>result()};
  const view=render(<SyllabusSearchWorkspace userId={owner} client={client} onOpenDetail={noDetail}/>);view.unmount();assert.equal(signal?.aborted,true);
  await act(async()=>pending.reject(new Error('late synthetic failure')));
});

test('native local route submits once, opens full syllabus, and restores explicit query on back',async()=>{
  const calls:SyllabusSearchFilters[]=[],details:string[]=[];
  const client:SyllabusSearchApiClient={loadOptions:async()=>options,search:async(_user,query)=>{calls.push(structuredClone(query));return result();},loadDetail:async(user,id)=>{assert.equal(user,owner);details.push(id);return {row:{...newCourseOffering(),id,version:1,published:true,course_name:'合成詳情',syllabus:newCourseSyllabus()}};},saveMetadata:async()=>{throw new Error('No writes permitted');}};
  function Location(){const location=useLocation();return <output data-testid="location">{location.pathname+location.search}</output>;}
  const view=render(<MemoryRouter initialEntries={['/school-affairs/services/12-3']}><Location/><SyllabusSearchRoute userId={owner} client={client}/></MemoryRouter>);
  await waitFor(()=>assert.ok(view.getByText('請設定條件後查詢。')));
  fireEvent.change(view.getByLabelText('關鍵字'),{target:{value:'explicit'}});fireEvent.click(view.getByLabelText('歷年課程'));fireEvent.click(view.getByRole('button',{name:'查詢'}));
  await waitFor(()=>assert.ok(view.getByText('歷史課綱查詢結果計1筆')));assert.equal(calls.length,1);assert.match(view.getByTestId('location').textContent??'',/keyword=explicit/);
  fireEvent.click(view.getByRole('button',{name:'合成公開課程：DEMO-001，開啟課程大綱'}));await waitFor(()=>assert.ok(view.getByRole('heading',{name:'樹德科技大學 課程大綱'})));
  assert.equal(view.container.querySelectorAll('.syllabus-weeks tbody tr').length,18);assert.equal(details.length,1);assert.equal(view.getByRole('link',{name:'回上頁'}).getAttribute('href'),'/school-affairs/services/12-3?search_scope=historical&keyword=explicit&searched=1');
  fireEvent.click(view.getByRole('link',{name:'回上頁'}));await waitFor(()=>assert.ok(view.getByText('歷史課綱查詢結果計1筆')));assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal((view.getByLabelText('關鍵字') as HTMLInputElement).value,'explicit');
});

test('route rejects repeated, unbounded, external-return or invalid detail parameters without fetching them',()=>{
  for(const query of ['keyword=a&keyword=b','return=https://official.invalid','syllabus=bad','search_scope=other','searched=true','themes=1,27','keyword='+'a'.repeat(161)]){
    const parsed=readSyllabusSearchRoute(new URLSearchParams(query));assert.ok(parsed.error);assert.equal(parsed.id,null);assert.equal(parsed.searched,false);
  }
  const parsed=readSyllabusSearchRoute(syllabusSearchRouteParams(filters,true,result().rows[0].id));assert.deepEqual(parsed,{filters,searched:true,id:result().rows[0].id,error:null});
});

test('unavailable published detail never falls back to the broader catalog reader',async()=>{
  const id=result().rows[0].id;let reads=0;
  const client:SyllabusSearchApiClient={loadOptions:async()=>{throw new Error('Unexpected options');},search:async()=>{throw new Error('Unexpected search');},loadDetail:async()=>{reads++;return {row:null};},saveMetadata:async()=>{throw new Error('Unexpected write');}};
  const view=render(<MemoryRouter initialEntries={['/school-affairs/services/12-3?syllabus='+id]}><SyllabusSearchRoute userId={owner} client={client}/></MemoryRouter>);
  await waitFor(()=>assert.ok(view.getByText('此課程大綱目前無法提供。')));assert.equal(reads,1);assert.equal(view.queryByRole('heading',{name:'樹德科技大學 課程大綱'}),null);assert.ok(view.getByRole('link',{name:'回上頁'}));
});
