import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {StrictMode} from 'react';
import {MemoryRouter} from 'react-router';
import type {TuitionDocumentsProps,TuitionLocalDocument,TuitionDocumentRequest,TuitionView} from '../../src/features/public/affairs/TuitionDocuments';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options?:{url?:string;pretendToBeVisual?:boolean})=>{window:Window & typeof globalThis}};
const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('/tuitionDocuments.css')?{format:'module',source:'export {};',shortCircuit:true}:nextLoad(url,context);}});
const {TuitionDocuments}=await import('../../src/features/public/affairs/TuitionDocuments');cssHook.deregister();
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','KeyboardEvent','MutationObserver','getComputedStyle'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const {render,cleanup,fireEvent,waitFor,act,within}=await import('@testing-library/react');afterEach(cleanup);
const owner='synthetic-owner',other='synthetic-other',noop=()=>{};
const base:TuitionDocumentsProps={view:'summer',userId:owner,busy:false,onReload:noop,onLogout:noop};
const file:TuitionLocalDocument={id:'synthetic-file',userId:owner,kind:'summer',version:2,sourceMode:'local_demo',issuer:'stu.best',availability:'verified_local_file'};
const tree=(props:Partial<TuitionDocumentsProps>={})=><StrictMode><MemoryRouter><TuitionDocuments {...base} {...props}/></MemoryRouter></StrictMode>;
const printButton=(container:HTMLElement)=>container.querySelector<HTMLButtonElement>('.tuition-print-button')!;

test('four observed destinations retain distinct source titles and no invented PDF/payment or settlement table',()=>{
  const expected:Record<TuitionView,string>={summer:'暑修生選課清單暨繳費收據',evening:'進修部學分學雜費結算繳費單',extended:'Index',settlement:'學分學雜費結算差額明細查詢'};
  const routes={summer:'/school-affairs/services/48-1',extended:'/school-affairs/services/48-2',evening:'/school-affairs/services/48-3',settlement:'/school-affairs/services/49-1'};
  for(const view of Object.keys(expected) as TuitionView[]){
    const result=render(tree({view})),{container}=result;
    assert.ok(container.querySelector('h1')!.textContent!.includes(expected[view]));
    if(view!=='extended')assert.equal(container.querySelector('.tuition-breadcrumb a:last-child')!.getAttribute('href'),routes[view]);
    assert.equal(container.querySelectorAll('table,iframe,object,embed,a[download],input[type="file"]').length,0);
    if(view==='summer'||view==='evening'){
      assert.equal(result.getByRole('heading',{name:'系統需求資訊'}).textContent,'系統需求資訊');
      assert.equal(printButton(container).disabled,true);assert.equal(printButton(container).textContent,`繼續列印 ${expected[view]} PDF`);
      assert.match(printButton(container).getAttribute('title')!,/目前沒有.*stu.best/);
      assert.equal(result.getByRole('link',{name:'ADOBE'}).getAttribute('href'),'https://get.adobe.com/reader/');
    }
    if(view==='evening')assert.match(container.textContent!,/不辦理就學貸款學生.*延修生註冊須知.*以便產生正確學費應繳金額/);
    if(view==='extended'){
      assert.equal(container.querySelectorAll('form,select,input,.tuition-print-button').length,0);
      assert.equal(result.getByRole('status').textContent,'延修生繳費資料目前無法提供。');
      assert.equal(result.getByRole('link',{name:'暑修選課繳費查詢'}).getAttribute('href'),routes.summer);
    }
    assert.doesNotMatch(container.querySelector('footer')!.textContent!,/Copyright|資訊中心/);result.unmount();
  }
});

test('empty settlement shows only observed criteria and account-office explanation; disclosure exposes its expanded state',()=>{
  const result=render(tree({view:'settlement'}));
  const select=result.getByRole('combobox',{name:'歷年結算資料'}) as HTMLSelectElement;
  assert.deepEqual([...select.options].map(option=>option.text),['請選擇歷年結算資料','無對應資料']);
  assert.equal(select.selectedOptions[0].text,'無對應資料');assert.equal(select.disabled,true);
  assert.equal((within(result.getByRole('main')).getByRole('button',{name:'查詢'}) as HTMLButtonElement).disabled,true);
  assert.ok(result.getByRole('heading',{name:'輸入關鍵字查詢符合條件記錄'}));
  assert.match(result.container.textContent!,/學分學雜費結算金額有疑問者，請電洽會計室6158000分機1501。/);
  const toggle=result.getByRole('button',{name:/查詢條件輸入/});assert.equal(toggle.getAttribute('aria-expanded'),'true');
  fireEvent.click(toggle);assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.equal(document.getElementById(toggle.getAttribute('aria-controls')!)!.hidden,true);
  fireEvent.click(toggle);assert.equal(toggle.getAttribute('aria-expanded'),'true');
});

test('settlement choices and literal result remain own-account only; controlled query preserves selection and prevents duplicate dispatch',async()=>{
  const calls:string[]=[],changes:string[]=[];let resolve:()=>void=noop;
  const settlement:NonNullable<TuitionDocumentsProps['settlement']>={periods:[{id:'one',userId:owner,label:'Synthetic local term'},
    {id:'foreign',userId:other,label:'FOREIGN PRIVATE TERM'},{id:'duplicate',userId:owner,label:'Duplicate A'},{id:'duplicate',userId:owner,label:'Duplicate B'}],
    selectedId:'one',onSelect:id=>changes.push(id),onQuery:id=>{calls.push(id);return new Promise<void>(done=>{resolve=done;});},queryCompleted:true,
    record:{id:'result',userId:owner,periodId:'one',text:'Synthetic local note <script>private()</script>'}};
  const result=render(tree({view:'settlement',settlement}));
  assert.doesNotMatch(result.container.textContent!,/FOREIGN PRIVATE|Duplicate A|Duplicate B/);assert.equal(result.container.querySelectorAll('script,table').length,0);
  assert.match(result.getByRole('region',{name:'站內結算紀錄'}).textContent!,/<script>private\(\)<\/script>/);
  const query=within(result.getByRole('main')).getByRole('button',{name:'查詢'});fireEvent.click(query);fireEvent.click(query);
  assert.deepEqual(calls,['one']);assert.equal((query as HTMLButtonElement).disabled,true);
  assert.equal((result.getByRole('combobox') as HTMLSelectElement).value,'one');
  await act(async()=>resolve());assert.equal((query as HTMLButtonElement).disabled,false);
  result.rerender(tree({view:'settlement',settlement:{...settlement,record:{...settlement.record!,userId:other,text:'FOREIGN PRIVATE RESULT'}}}));
  assert.doesNotMatch(result.container.textContent!,/FOREIGN PRIVATE/);assert.match(result.getByRole('status').textContent!,/沒有對應的站內結算紀錄/);
  result.rerender(tree({view:'settlement',userId:other,settlement}));
  assert.doesNotMatch(result.container.textContent!,/Synthetic local term|Synthetic local note/);
  assert.equal((within(result.getByRole('main')).getByRole('button',{name:'查詢'}) as HTMLButtonElement).disabled,true);assert.deepEqual(changes,[]);
});

test('only an own verified local file enables the print callback; wrong family, metadata and foreign descriptors stay disabled',()=>{
  const calls:TuitionDocumentRequest[]=[];
  const result=render(tree({document:file,onOpenLocalDocument:request=>{calls.push(request);}}));
  assert.equal(printButton(result.container).disabled,false);
  for(const patch of [{userId:other},{kind:'evening'},{issuer:'University'},{availability:'metadata_only'},{sourceMode:'official'},{version:0}]){
    result.rerender(tree({document:{...file,...patch} as TuitionLocalDocument,onOpenLocalDocument:request=>{calls.push(request);}}));
    assert.equal(printButton(result.container).disabled,true);fireEvent.click(printButton(result.container));
  }
  result.rerender(tree({document:file}));assert.equal(printButton(result.container).disabled,true);assert.equal(calls.length,0);
  result.rerender(tree({view:'extended',document:file,onOpenLocalDocument:request=>{calls.push(request);}}));assert.equal(result.container.querySelector('.tuition-print-button'),null);
});

test('failed settlement refresh hides old result text, keeps the selected account period and permits retry',async()=>{
  let calls=0;
  const result=render(tree({view:'settlement',settlement:{periods:[{id:'one',userId:owner,label:'Synthetic period'}],selectedId:'one',onSelect:noop,
    onQuery:async()=>{calls++;throw new Error('PRIVATE PROVIDER RESPONSE');},queryCompleted:true,record:{id:'row',userId:owner,periodId:'one',text:'Previous local result'}}}));
  const query=within(result.getByRole('main')).getByRole('button',{name:'查詢'});
  fireEvent.click(query);await waitFor(()=>assert.match(result.getByRole('alert').textContent!,/暫時無法查詢/));
  assert.doesNotMatch(result.container.textContent!,/Previous local result|PRIVATE PROVIDER RESPONSE/);
  assert.equal((result.getByRole('combobox') as HTMLSelectElement).value,'one');assert.equal((query as HTMLButtonElement).disabled,false);
  fireEvent.click(query);await waitFor(()=>assert.equal(calls,2));
});

test('local file failure stays retryable with sanitized errors, stable revision and no duplicate callback',async()=>{
  const calls:TuitionDocumentRequest[]=[];let reject:(reason:Error)=>void=noop;
  const onOpenLocalDocument=(request:TuitionDocumentRequest)=>{calls.push(request);return new Promise<void>((_resolve,fail)=>{reject=fail;});};
  const result=render(tree({document:file,onOpenLocalDocument}));
  fireEvent.click(printButton(result.container));fireEvent.click(printButton(result.container));
  assert.deepEqual(calls,[{documentId:file.id,documentVersion:2,kind:'summer'}]);assert.equal(printButton(result.container).disabled,true);
  await act(async()=>reject(new Error('PRIVATE STORAGE LOCATION')));
  await waitFor(()=>assert.match(result.getByRole('alert').textContent!,/站內文件目前無法開啟/));
  assert.doesNotMatch(result.container.textContent!,/PRIVATE STORAGE/);assert.equal(printButton(result.container).disabled,false);
  fireEvent.click(printButton(result.container));assert.equal(calls.length,2);
  result.rerender(tree({userId:other,document:file,onOpenLocalDocument}));
  await act(async()=>reject(new Error('LATE PRIVATE FAILURE')));
  assert.equal(printButton(result.container).disabled,true);assert.equal(result.queryByRole('alert'),null);
});

test('loading and errors disable actions; retry is controlled and old records are hidden until resolved',()=>{
  let retries=0;
  const result=render(tree({busy:true,document:file,onOpenLocalDocument:noop}));
  assert.equal(result.container.querySelector('main')!.getAttribute('aria-busy'),'true');assert.match(result.getByRole('status').textContent!,/載入/);
  assert.equal(printButton(result.container).disabled,true);
  result.rerender(tree({error:'合成資料暫時無法載入',document:file,onOpenLocalDocument:noop,onReload:()=>{retries++;}}));
  assert.equal(printButton(result.container).disabled,true);fireEvent.click(result.getByRole('button',{name:'重新載入'}));assert.equal(retries,1);
  result.rerender(tree({view:'settlement',error:'合成查詢錯誤',settlement:{periods:[{id:'one',userId:owner,label:'Local'}],selectedId:'one',
    onSelect:noop,onQuery:noop,record:{id:'row',userId:owner,periodId:'one',text:'STALE LOCAL RESULT'}}}));
  assert.doesNotMatch(result.container.textContent!,/STALE LOCAL RESULT/);assert.equal((within(result.getByRole('main')).getByRole('button',{name:'查詢'}) as HTMLButtonElement).disabled,true);
});
