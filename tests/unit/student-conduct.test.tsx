import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {StrictMode} from 'react';
import {MemoryRouter} from 'react-router';
import {ownStudentConductRecords,type StudentConductRecord} from '../../src/services/studentConduct';
import type {StudentConductProps,StudentConductDocument,StudentConductDetail,StudentConductDocumentRequest,StudentConductDetailRequest} from '../../src/features/public/affairs/StudentConduct';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options?:{url?:string})=>{window:Window & typeof globalThis}};
const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('/studentConduct.css')?{format:'module',source:'export {};',shortCircuit:true}:nextLoad(url,context);}});
const {StudentConduct}=await import('../../src/features/public/affairs/StudentConduct');cssHook.deregister();
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
for(const name of ['window','document','HTMLElement','HTMLButtonElement','HTMLInputElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const {render,cleanup,fireEvent,act,waitFor}=await import('@testing-library/react');afterEach(cleanup);
const owner='synthetic-owner',other='synthetic-other',noop=()=>{};
const row:StudentConductRecord={id:'synthetic-record',userId:owner,sourceMode:'local_demo',version:3,createdAt:'2030-01-01T00:00:00Z',updatedAt:'2030-01-02T00:00:00Z',
  occurredOnText:null,studentNumber:'SYNTHETIC-A',studentName:'Synthetic Student A',academicYearText:'001',semesterText:'暑期（原文）',yearLevelText:'',
  reasonText:'合成站內事由 <script>notExecutable()</script>',conductCode:'LOCAL-A',conductName:'明確輸入的文字',quantityText:'0',voidStatusText:null,rowOrder:0};
const base:StudentConductProps={userId:owner,identity:{userId:owner,studentNumber:'SYNTHETIC-A',studentName:'Synthetic Student A'},records:{records:[]},busy:false,onReload:noop};
const tree=(props:Partial<StudentConductProps>={})=><StrictMode><MemoryRouter><StudentConduct {...base} {...props}/></MemoryRouter></StrictMode>;
const file:StudentConductDocument={id:'synthetic-file',userId:owner,sourceMode:'local_demo',version:2,issuer:'stu.best',availability:'verified_local_file'};
const detail:StudentConductDetail={id:'synthetic-detail',userId:owner,sourceMode:'local_demo',version:4,recordId:row.id,recordVersion:row.version,availability:'verified_local_detail'};
const download=(container:HTMLElement)=>container.querySelector<HTMLButtonElement>('.student-conduct-download')!;
const view=(container:HTMLElement)=>container.querySelector<HTMLButtonElement>('.student-conduct-view')!;

test('source empty frame has twelve exact headers, read-only identity, inert indicators and no invented record or issuing action',()=>{
  const result=render(tree()),{container}=result;
  assert.equal(result.getByRole('heading',{name:'獎懲列印作業(學生)'}).tagName,'H1');
  assert.deepEqual([...container.querySelectorAll('thead th')].map(cell=>cell.textContent),['發生日期','學號','姓名','學年','學期','年級','事由','獎懲代號','獎懲名稱','數量','作廢狀態','檢視']);
  assert.equal(container.querySelectorAll('tbody tr').length,0);assert.equal(container.querySelectorAll('thead button').length,0);assert.equal(container.querySelectorAll('.student-conduct-sort-indicator[aria-hidden="true"]').length,6);
  for(const name of ['學號','姓名'])assert.equal((result.getByRole('textbox',{name}) as HTMLInputElement).readOnly,true);
  assert.equal(download(container).disabled,true);assert.equal(download(container).textContent,'下載獎懲紀錄表(證明)');
  assert.equal(container.querySelectorAll('input:not([readonly]),select,textarea,a[download],iframe,object,embed').length,0);
  assert.match(container.textContent!,/為輸入查詢條件欄位，其它欄位不做為查詢條件輸入欄位。/);
  assert.equal(result.getByRole('region',{name:'獎懲紀錄表，可水平捲動'}).getAttribute('tabindex'),'0');
  assert.match(result.getByRole('status').textContent!,/目前沒有獎懲紀錄/);
  assert.doesNotMatch(container.querySelector('footer')!.textContent!,/Copyright|2012|University|官方/);
  assert.equal(result.getByRole('link',{name:'top'}).getAttribute('href'),'#'+container.firstElementChild!.id);
});

test('owned rows retain literal null, blank, zero and source text without deriving totals or executing markup',()=>{
  const result=render(tree({records:{records:[row]}})),cells=[...result.container.querySelectorAll('tbody td')];
  assert.equal(cells.length,12);assert.deepEqual(cells.slice(0,11).map(cell=>cell.textContent),['—','SYNTHETIC-A','Synthetic Student A','001','暑期（原文）','',row.reasonText,'LOCAL-A','明確輸入的文字','0','—']);
  assert.equal(result.container.querySelectorAll('script,tbody img,tfoot').length,0);assert.equal(view(result.container).disabled,true);
  assert.doesNotMatch(result.container.textContent!,/總計|總分|合格|不合格/);
});

test('ownership guards exclude foreign data and preserve explicit row order',()=>{
  const foreign={...row,userId:other,id:'other-record',studentName:'FOREIGN PRIVATE NAME'};
  const later={...row,id:'later-record',rowOrder:8,reasonText:'Later explicit row'};
  const records={records:[later,foreign,row]};
  assert.deepEqual(ownStudentConductRecords(records,owner)!.map(item=>item.id),[row.id,later.id]);
  const result=render(tree({records}));assert.doesNotMatch(result.container.textContent!,/FOREIGN PRIVATE/);
  result.rerender(tree({records,userId:other}));
  assert.equal(result.container.querySelectorAll('tbody tr').length,0);assert.equal((result.getByRole('textbox',{name:'學號'}) as HTMLInputElement).value,'');
  assert.match(result.getByRole('status').textContent!,/無法確認/);
  result.rerender(tree({identity:{...base.identity!,userId:other},records}));assert.equal(result.container.querySelectorAll('tbody tr').length,0);
});

test('malformed, duplicate or excessive owned data is unavailable with retry, never a partial or empty history',()=>{
  const inherited=Object.assign(Object.create({userId:owner}),Object.fromEntries(Object.entries(row).filter(([key])=>key!=='userId'))) as StudentConductRecord;
  const invalidNumber={...row,id:'invalid-number',quantityText:0} as unknown as StudentConductRecord;
  const missingCell=Object.fromEntries(Object.entries(row).filter(([key])=>key!=='reasonText')) as StudentConductRecord;
  const oversized=Array.from({length:1001},(_,index)=>({...row,id:'row-'+index}));
  let retries=0;const result=render(tree());
  for(const records of [[row,{...row}],[row,invalidNumber],[inherited],[missingCell],oversized]){
    assert.equal(ownStudentConductRecords({records},owner),null);
    result.rerender(tree({records:{records},onReload:()=>{retries++;},document:file,onDownload:noop}));
    assert.equal(result.container.querySelectorAll('tbody tr').length,0);assert.equal(download(result.container).disabled,true);
    assert.match(result.getByRole('status').textContent!,/目前無法確認/);assert.doesNotMatch(result.container.textContent!,/目前沒有獎懲紀錄/);
    fireEvent.click(result.getByRole('button',{name:'重新載入'}));
  }
  assert.equal(retries,5);assert.deepEqual(ownStudentConductRecords({records:[]},owner),[]);
  result.rerender(tree());assert.match(result.getByRole('status').textContent!,/目前沒有獎懲紀錄/);assert.equal(result.queryByRole('button',{name:'重新載入'}),null);
});

test('loading, unknown and error states hide stale records and keep controlled retry available',()=>{
  let retries=0;const result=render(tree({records:{records:[row]},busy:true}));
  assert.equal(result.container.querySelector('main')!.getAttribute('aria-busy'),'true');assert.equal(result.container.querySelectorAll('tbody tr').length,0);assert.match(result.getByRole('status').textContent!,/載入/);
  result.rerender(tree({records:null}));assert.match(result.getByRole('status').textContent!,/無法確認/);
  result.rerender(tree({records:{records:[row]},error:'合成查詢錯誤',onReload:()=>{retries++;}}));
  assert.equal(result.container.querySelectorAll('tbody tr').length,0);assert.equal(download(result.container).disabled,true);
  fireEvent.click(result.getByRole('button',{name:'重新載入'}));assert.equal(retries,1);
});

test('document metadata, foreign ownership and invalid versions cannot activate download',()=>{
  let calls=0;const onDownload=()=>{calls++;};const result=render(tree({document:file,onDownload}));assert.equal(download(result.container).disabled,false);
  assert.match(download(result.container).textContent!,/stu.best/);
  for(const patch of [{userId:other},{sourceMode:'official'},{issuer:'University'},{availability:'metadata_only'},{version:0},{id:''}]){
    result.rerender(tree({document:{...file,...patch} as StudentConductDocument,onDownload}));assert.equal(download(result.container).disabled,true);fireEvent.click(download(result.container));
  }
  result.rerender(tree({document:file}));assert.equal(download(result.container).disabled,true);assert.equal(calls,0);
});

test('detail capabilities must match the exact owned record revision and stay separate from row metadata',async()=>{
  const calls:StudentConductDetailRequest[]=[];const onViewDetail=(request:StudentConductDetailRequest)=>{calls.push(request);};
  const result=render(tree({records:{records:[row]},details:[detail],onViewDetail}));assert.equal(view(result.container).disabled,false);
  await act(async()=>fireEvent.click(view(result.container)));assert.deepEqual(calls,[{detailId:detail.id,detailVersion:detail.version,recordId:row.id,recordVersion:row.version}]);
  for(const details of [[{...detail,userId:other}],[{...detail,recordVersion:2}],[{...detail,recordId:'other'}],[{...detail,availability:'metadata_only'} as unknown as StudentConductDetail],[detail,{...detail}]]){
    result.rerender(tree({records:{records:[row]},details,onViewDetail}));assert.equal(view(result.container).disabled,true);
  }
  const metadataOnly={...row,detail};result.rerender(tree({records:{records:[metadataOnly]},onViewDetail}));assert.equal(view(result.container).disabled,true);assert.equal(calls.length,1);
});

test('asynchronous capabilities suppress duplicate dispatch, sanitize failures and reset on account switch',async()=>{
  const calls:StudentConductDocumentRequest[]=[];let reject:(reason:Error)=>void=noop;
  const onDownload=(request:StudentConductDocumentRequest)=>{calls.push(request);return new Promise<void>((_resolve,fail)=>{reject=fail;});};
  const result=render(tree({document:file,onDownload}));fireEvent.click(download(result.container));fireEvent.click(download(result.container));
  assert.deepEqual(calls,[{documentId:file.id,documentVersion:2}]);assert.equal(download(result.container).disabled,true);
  await act(async()=>reject(new Error('PRIVATE OBJECT PATH')));await waitFor(()=>assert.match(result.getByRole('alert').textContent!,/站內資料目前無法開啟/));
  assert.doesNotMatch(result.container.textContent!,/PRIVATE OBJECT PATH/);assert.equal(download(result.container).disabled,false);
  fireEvent.click(download(result.container));assert.equal(calls.length,2);result.rerender(tree({userId:other,document:file,onDownload}));
  await act(async()=>reject(new Error('LATE PRIVATE FAILURE')));assert.equal(result.queryByRole('alert'),null);assert.equal(download(result.container).disabled,true);
});

test('four locally copied observed bitmaps match their provenance checksums without external asset references',async()=>{
  const manifest=JSON.parse(await readFile('public/stu-reference/conduct-assets.json','utf8')) as {assets:{source:string;file:string;checksum:string;sourceChecksum:string;bytes:number}[]};
  assert.equal(manifest.assets.length,4);
  for(const entry of manifest.assets){assert.match(entry.source,/^https:\/\/info\.stu\.edu\.tw\/SAO\/conduct\/images\//);assert.match(entry.file,/^\/stu-reference\/conduct-[a-z-]+\.(png|jpg)$/);
    const bytes=await readFile('public'+entry.file);assert.equal(bytes.byteLength,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.checksum);assert.equal(entry.checksum,entry.sourceChecksum);}
  const result=render(tree());assert.ok([...result.container.querySelectorAll('img')].every(img=>img.getAttribute('src')!.startsWith('/stu-reference/conduct-')));
});
