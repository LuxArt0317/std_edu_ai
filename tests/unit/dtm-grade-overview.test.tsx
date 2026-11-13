import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter} from 'react-router';
import {DtmGradeReportClientError,type DtmGradeReportClient,type DtmGradeReportOverviewData} from '../../src/services/dtmGradeReport';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLButtonElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('/dtmGradeOverview.css')?{format:'module',shortCircuit:true,source:'export {};'}:next(url,context);}});
const {DtmGradeOverview}=await import('../../src/features/public/dtm/DtmGradeOverview');hook.deregister();
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
afterEach(cleanup);after(()=>dom.window.close());
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
type Client=Pick<DtmGradeReportClient,'loadOverview'>;
type Course=DtmGradeReportOverviewData['courses'][number];
const id=(n:number)=>'20000000-0000-4000-8000-'+n.toString().padStart(12,'0');
const course=(n:number,userId=owner,gradeText:string|null=null):Course=>({id:id(n),userId,title:'Synthetic course '+n,code:'LOCAL-'+n,term:'Saved term',gradeText});
const page=(courses:Course[],more=false):DtmGradeReportOverviewData=>({courses,limit:100,nextCursor:more?courses.at(-1)!.id:null});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const tree=(client:Client,userId=owner)=><MemoryRouter><DtmGradeOverview userId={userId} client={client}/></MemoryRouter>;
const rows=(container:HTMLElement)=>container.querySelectorAll('tbody tr');

test('overview renders only two source columns and literal totals with exact local course links',async()=>{
  const records=[course(1,owner,null),course(2,owner,''),course(3,owner,'0'),{...course(4,owner,' P <b> '),title:'<img onerror=alert(1)> Saved course'}];
  let calls=0;
  const view=render(tree({loadOverview:async(userId,options,signal)=>{calls++;assert.equal(userId,owner);assert.deepEqual(options,{});assert.equal(signal?.aborted,false);return page(records);}}));
  assert.match(view.getByRole('status').textContent!,/載入/);
  await waitFor(()=>assert.equal(rows(view.container).length,4));
  assert.deepEqual([...view.container.querySelectorAll('th')].map(node=>node.textContent),['課程名稱','成績']);
  assert.deepEqual([...view.container.querySelectorAll('tbody td:nth-child(2)')].map(node=>node.textContent),['-','','0',' P <b> ']);
  assert.deepEqual([...view.container.querySelectorAll('tbody a')].map(node=>node.getAttribute('href')),records.map(row=>'/dtm/course/'+row.id+'/grades'));
  assert.equal(view.container.querySelector('img,script,input,select,textarea'),null);
  assert.equal(view.queryByRole('button'),null);assert.equal(view.queryByRole('heading'),null);assert.equal(calls,1);
  assert.deepEqual(records.map(row=>row.gradeText),[null,'','0',' P <b> ']);
});

test('failed first read is sanitized and remains unknown until an explicit successful empty retry',async()=>{
  let reads=0;const view=render(tree({loadOverview:async()=>{if(++reads===1)throw Error('PRIVATE provider body');return page([]);}}));
  await waitFor(()=>assert.ok(view.getByRole('alert')));
  assert.equal(view.queryByRole('table'),null);assert.doesNotMatch(view.container.textContent!,/PRIVATE|沒有已儲存/);
  fireEvent.click(view.getByRole('button',{name:'重試'}));
  await waitFor(()=>assert.match(view.getByRole('status').textContent!,/沒有已儲存的課程/));assert.equal(reads,2);assert.equal(rows(view.container).length,0);
});

test('later-page errors retain verified rows, retry the same cursor and never claim completion',async()=>{
  const first=Array.from({length:100},(_,n)=>course(n+1));const held=deferred<DtmGradeReportOverviewData>();
  const cursors:(string|undefined)[]=[];
  const view=render(tree({loadOverview:async(_user,options)=>{
    cursors.push(options?.afterId);if(cursors.length===1)return page(first,true);if(cursors.length===2)return held.promise;return page([course(101,owner,'0')]);
  }}));
  await waitFor(()=>assert.equal(rows(view.container).length,100));assert.deepEqual(cursors,[undefined]);
  const more=view.getByRole('button',{name:'載入更多課程'});fireEvent.click(more);fireEvent.click(more);
  await waitFor(()=>assert.equal(cursors.length,2));assert.equal(more.hasAttribute('disabled'),true);assert.equal(rows(view.container).length,100);
  await act(async()=>held.reject(Error('PRIVATE later-page error')));
  await waitFor(()=>assert.match(view.getByRole('alert').textContent!,/僅顯示已確認的 100/));
  assert.doesNotMatch(view.container.textContent!,/PRIVATE/);assert.equal(rows(view.container).length,100);
  fireEvent.click(view.getByRole('button',{name:'重試'}));
  await waitFor(()=>assert.equal(rows(view.container).length,101));assert.deepEqual(cursors,[undefined,id(100),id(100)]);
  assert.equal(view.queryByRole('alert'),null);assert.equal(view.queryByRole('button'),null);
});

test('malformed, foreign, duplicate and looping pages cannot be displayed as complete or empty',async()=>{
  for(const invalid of [page([course(1,other)]),page([course(1),course(1)]),{...page([course(1)]),limit:99},{...page([course(1)]),nextCursor:id(1)},page([{...course(1),gradeText:0} as unknown as Course])]){
    const view=render(tree({loadOverview:async()=>invalid as DtmGradeReportOverviewData}));
    await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(view.queryByRole('table'),null);view.unmount();
  }
  let calls=0;const first=Array.from({length:100},(_,n)=>course(n+1));
  const view=render(tree({loadOverview:async()=>{calls++;return page(first,true);}}));
  await waitFor(()=>assert.equal(rows(view.container).length,100));fireEvent.click(view.getByRole('button',{name:'載入更多課程'}));
  await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(rows(view.container).length,100);assert.equal(calls,2);
});

test('account changes immediately hide rows, abort pending pages and ignore late foreign completions',async()=>{
  const late=deferred<DtmGradeReportOverviewData>(),next=deferred<DtmGradeReportOverviewData>();let oldSignal:AbortSignal|undefined;
  const client:Client={loadOverview:async(userId,options,signal)=>{
    if(userId===other)return next.promise;
    if(options?.afterId){oldSignal=signal;return late.promise;}
    return page(Array.from({length:100},(_,n)=>course(n+1)),true);
  }};
  const view=render(tree(client));await waitFor(()=>assert.equal(rows(view.container).length,100));
  fireEvent.click(view.getByRole('button',{name:'載入更多課程'}));await waitFor(()=>assert.ok(oldSignal));
  view.rerender(tree(client,other));assert.equal(rows(view.container).length,0);assert.equal(oldSignal?.aborted,true);
  await act(async()=>late.resolve(page([course(101)])));assert.equal(rows(view.container).length,0);
  await act(async()=>next.resolve(page([{...course(200,other,'0'),title:'Second account course'}])));
  await waitFor(()=>assert.equal(rows(view.container).length,1));assert.ok(view.getByRole('link',{name:'Second account course'}));assert.doesNotMatch(view.container.textContent!,/Synthetic course/);
});

test('session or permission loss clears retained pages before the host account prop changes',async()=>{
  for(const status of [401,403]){
    let reads=0;
    const view=render(tree({loadOverview:async()=>{
      if(++reads===1)return page(Array.from({length:100},(_,n)=>course(n+1)),true);
      throw new DtmGradeReportClientError('PRIVATE session detail',status);
    }}));
    await waitFor(()=>assert.equal(rows(view.container).length,100));
    fireEvent.click(view.getByRole('button',{name:'載入更多課程'}));
    await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(view.queryByRole('table'),null);
    assert.doesNotMatch(view.container.textContent!,/Synthetic course|PRIVATE|沒有已儲存/);view.unmount();
  }
});

test('unmount aborts reads and invalid callers never invoke the client',async()=>{
  let signal:AbortSignal|undefined;const pending=deferred<DtmGradeReportOverviewData>();
  const view=render(tree({loadOverview:async(_owner,_options,value)=>{signal=value;return pending.promise;}}));
  await waitFor(()=>assert.ok(signal));view.unmount();assert.equal(signal?.aborted,true);await act(async()=>pending.resolve(page([course(1)])));
  let calls=0;const invalid=render(tree({loadOverview:async()=>{calls++;return page([]);}},'not-a-user'));
  await waitFor(()=>assert.ok(invalid.getByRole('alert')));assert.equal(calls,0);
});

test('the thirty-second bound covers an unresponsive client and retry starts a fresh request',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  try{
    let reads=0,firstSignal:AbortSignal|undefined;
    const view=render(tree({loadOverview:async(_owner,_options,signal)=>{
      if(++reads===1){firstSignal=signal;return new Promise(()=>{});}return page([course(1)]);
    }}));
    await act(async()=>{});assert.equal(reads,1);
    await act(async()=>context.mock.timers.tick(30000));assert.equal(firstSignal?.aborted,true);
    assert.ok(view.getByRole('alert'));assert.equal(view.queryByRole('table'),null);
    fireEvent.click(view.getByRole('button',{name:'重試'}));await act(async()=>{});
    assert.equal(reads,2);assert.equal(rows(view.container).length,1);
  }finally{cleanup();context.mock.timers.reset();}
});

test('pagination can continue beyond one thousand courses without truncation or an arbitrary total cap',async()=>{
  let calls=0;const client:Client={loadOverview:async(_owner,options)=>{
    const start=options?.afterId?Number(options.afterId.slice(-12)):0;calls++;
    return page(Array.from({length:start===1000?1:100},(_,n)=>course(start+n+1)),start<1000);
  }};
  const view=render(tree(client));await waitFor(()=>assert.equal(rows(view.container).length,100));
  for(let n=1;n<=10;n++){
    fireEvent.click(view.getByRole('button',{name:'載入更多課程'}));
    await waitFor(()=>assert.equal(rows(view.container).length,n===10?1001:(n+1)*100));
  }
  assert.equal(calls,11);assert.equal(view.queryByRole('button'),null);assert.equal(view.queryByRole('alert'),null);
});
