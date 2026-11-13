import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {useState} from 'react';
import {MemoryRouter} from 'react-router';
import {ownStudentLoanData,ownStudentLoanRecord,studentLoanNotice,studentLoanPaths,studentLoanTextLimits,type StudentLoanRecord,type StudentLoanView} from '../../src/services/studentLoan';
import type {StudentLoanProps} from '../../src/features/public/affairs/StudentLoan';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',stamp='2030-01-01T00:00:00Z';
const record:StudentLoanRecord={id:'20000000-0000-4000-8000-000000000001',userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,
  currentTermLabel:'Synthetic term',currentApplicationState:'not_applied',currentApplicationText:null,progressText:null,historyCount:0,historyText:null};
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','Element','HTMLElement','SVGElement','HTMLButtonElement','HTMLInputElement','HTMLAnchorElement','Node','NodeFilter','Event','MouseEvent','KeyboardEvent','CustomEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('/studentLoan.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {StudentLoan}=await import('../../src/features/public/affairs/StudentLoan');hook.deregister();
const {render,cleanup,fireEvent,waitFor,within}=await import('@testing-library/react');afterEach(cleanup);after(()=>dom.window.close());
const noop=()=>{};
const base:StudentLoanProps={userId:owner,view:'index',data:{status:'loaded',record},onReload:noop,onLogout:noop,onNavigate:noop,onInformation:noop,copyrightYear:2030};
const tree=(props:Partial<StudentLoanProps>={})=><MemoryRouter><StudentLoan {...base} {...props}/></MemoryRouter>;

test('catalog mapping and four local navigation destinations retain the observed source labels',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../../src/features/public/affairs/catalog.json',import.meta.url),'utf8'));
  assert.equal(catalog[20][3][0][0],'就學貸款申請');assert.equal(studentLoanPaths.index,'/school-affairs/services/21-1');
  const calls:unknown[]=[],view=render(tree({onNavigate:(...args)=>{calls.push(args);},onInformation:()=>{calls.push('information');}}));
  assert.equal(view.container.querySelector('.student-loan-heading h1')?.textContent,'\uf19c系統首頁 » 就學貸款申請須知');
  const links=within(view.getByRole('main')).getAllByRole('link');assert.deepEqual(links.map(link=>link.getAttribute('href')),[studentLoanPaths.progress,studentLoanPaths.document,studentLoanPaths.history]);
  for(const link of links)fireEvent.click(link);fireEvent.click(view.getByRole('button',{name:'3.就學貸款資訊專區'}));
  assert.deepEqual(calls,[['progress',undefined],['document',{newTab:true}],['history',undefined],'information']);
  assert.equal(links[1].getAttribute('target'),'_blank');assert.equal(links[1].getAttribute('rel'),'noopener noreferrer');
  assert.equal(view.container.querySelector('form,input,select,table,iframe,object,embed,a[download]'),null);
  assert.equal(view.container.querySelector('.student-loan-brand img')?.getAttribute('src'),'/stu-reference/ee1f2bb8f7f5a9dd.svg');
  assert.ok([...view.container.querySelectorAll('a')].every(link=>!/^https?:/i.test(link.getAttribute('href')??'')));
});

test('strict owned snapshot validation preserves null, blank, zero and literal whitespace without mutation',()=>{
  const literal={...record,currentTermLabel:'',currentApplicationText:' ',progressText:'0',historyText:'',historyCount:0};
  const result=ownStudentLoanRecord(literal,owner)!;assert.deepEqual(result,literal);result.progressText='changed';assert.equal(literal.progressText,'0');
  assert.equal(studentLoanNotice('history',literal),'');assert.equal(studentLoanNotice('progress',literal),' ');
  assert.deepEqual(ownStudentLoanData({status:'loading'},owner),{status:'loading'});
  assert.deepEqual(ownStudentLoanData({status:'loaded',record:null},owner),{status:'unavailable'});
});

test('foreign, ownerless, malformed and capability-bearing snapshots fail closed',()=>{
  const patches:Record<string,unknown>[]=[{userId:other},{userId:undefined},{sourceMode:'official'},{version:0},{version:1.2},{version:1000000000},{id:'not-an-id'},
    {createdAt:'2030-02-30T00:00:00Z'},{currentApplicationState:{toString:()=>'not_applied'}},{currentApplicationState:'approved'},
    {historyCount:-1},{historyCount:'0'},{historyCount:1000001},{historyCount:Number.MAX_SAFE_INTEGER+1},{currentTermLabel:undefined},{progressText:'\ud800'},
    {historyText:'\0'},{downloadUrl:'PRIVATE LOCATION'},...Object.entries(studentLoanTextLimits).map(([key,limit])=>({[key]:'字'.repeat(limit+1)}))];
  for(const patch of patches)assert.equal(ownStudentLoanRecord({...record,...patch},owner),null);
  assert.equal(ownStudentLoanRecord(record,''),null);assert.equal(ownStudentLoanRecord(record,other),null);
  assert.ok(ownStudentLoanRecord({...record,version:999999999,historyCount:1000000},owner));
  assert.deepEqual(ownStudentLoanData({status:'loaded',record,documents:[]},owner),{status:'unavailable'});
  assert.deepEqual(ownStudentLoanData({status:'loading',record},owner),{status:'unavailable'});
  for(const [key,limit] of Object.entries(studentLoanTextLimits))assert.ok(ownStudentLoanRecord({...record,[key]:'\u{20000}'.repeat(limit)},owner));
});

test('explicit negative states are distinct from unknown and never fabricate a term or application',()=>{
  assert.equal(studentLoanNotice('progress',record),'本學期Synthetic term，尚未申請就學貸款。');
  assert.equal(studentLoanNotice('document',{...record,currentTermLabel:null}),'尚未申請就學貸款。');
  assert.equal(studentLoanNotice('progress',{...record,currentTermLabel:'   '}),'尚未申請就學貸款。');
  assert.equal(studentLoanNotice('history',record),'目前沒有歷史申請記錄');
  for(const view of ['progress','history','document'] as const)assert.doesNotMatch(studentLoanNotice(view,null),/尚未申請|沒有歷史/);
  assert.doesNotMatch(studentLoanNotice('history',{...record,historyCount:null}),/沒有歷史/);
  assert.equal(studentLoanNotice('progress',{...record,currentApplicationState:'recorded',progressText:'Literal stored status'}),'Literal stored status');
  assert.equal(studentLoanNotice('document',{...record,currentApplicationState:'recorded',progressText:'Literal stored status'}),'目前無法提供站內就學貸款文件。');
});

test('unknown, loading and failure remain visible and suppress stored history counts',()=>{
  let reloads=0,navigations=0;const view=render(tree({data:{status:'unavailable'},onReload:()=>{reloads++;}}));
  assert.match(view.getByRole('status').textContent!,/無法確認/);assert.doesNotMatch(view.container.textContent!,/記錄\(0\)|尚未申請|沒有歷史/);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));assert.equal(reloads,1);
  view.rerender(tree({data:{status:'loading'},onNavigate:()=>{navigations++;}}));assert.match(view.getByRole('status').textContent!,/載入/);
  fireEvent.click(view.getByRole('link',{name:'1.查詢當期就學貸款進度'}));assert.equal(navigations,0);
  view.rerender(tree({error:'PRIVATE PROVIDER MESSAGE',onReload:()=>{reloads++;}}));assert.ok(view.getByRole('alert'));
  assert.doesNotMatch(view.container.textContent!,/PRIVATE PROVIDER|記錄\(0\)/);fireEvent.click(view.getByRole('button',{name:'重新載入'}));assert.equal(reloads,2);
  view.rerender(tree({data:{status:'loaded',record:{...record,currentApplicationState:'unknown',historyCount:null}}}));
  assert.match(view.getByRole('status').textContent!,/無法確認當期/);assert.doesNotMatch(view.container.textContent!,/尚未申請|記錄\(0\)/);
});

test('source-shaped notices use literal metadata and never invent a populated history table or file link',()=>{
  const view=render(tree({view:'history',data:{status:'loaded',record:{...record,historyCount:3,historyText:'Literal <script>safe()</script> history'}}}));
  assert.equal(view.getByRole('dialog').querySelector('.student-loan-notice')?.textContent,'Literal <script>safe()</script> history');
  assert.equal(document.querySelector('script,table,iframe,object,embed,a[download]'),null);view.unmount();
  const doc=render(tree({view:'document',data:{status:'loaded',record:{...record,currentApplicationState:'recorded'}}}));
  assert.match(doc.getByRole('dialog').textContent!,/目前無法提供站內就學貸款文件/);
  assert.equal(within(doc.getByRole('dialog')).queryByRole('button',{name:/列印|下載/}),null);
});

test('account and revision changes immediately suppress prior private notice content',()=>{
  const current={...record,currentApplicationState:'recorded' as const,progressText:'PRIVATE OLD ACCOUNT'};
  const view=render(tree({view:'progress',data:{status:'loaded',record:current}}));assert.match(view.getByRole('dialog').textContent!,/PRIVATE OLD ACCOUNT/);
  view.rerender(tree({view:'progress',userId:other,data:{status:'loaded',record:current}}));assert.doesNotMatch(document.body.textContent!,/PRIVATE OLD ACCOUNT|尚未申請/);
  assert.match(view.getByRole('dialog').textContent!,/無法確認/);
  view.rerender(tree({view:'progress',data:{status:'loaded',record:{...current,version:2,progressText:'New explicit revision'}}}));assert.match(view.getByRole('dialog').textContent!,/New explicit revision/);
});

test('Escape and OK close the controlled dialog and restore focus to the source action',async()=>{
  function Host(){const [view,setView]=useState<StudentLoanView>('index');return <StudentLoan {...base} view={view} onNavigate={next=>setView(next)}/>;}
  const view=render(<MemoryRouter><Host/></MemoryRouter>),trigger=view.getByRole('link',{name:'4.歷年申請記錄(0)'});
  trigger.focus();fireEvent.click(trigger);await waitFor(()=>assert.ok(view.getByRole('dialog')));
  fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>assert.equal(view.queryByRole('dialog'),null));await waitFor(()=>assert.equal(document.activeElement,trigger));
  fireEvent.click(trigger);await waitFor(()=>assert.ok(view.getByRole('dialog')));fireEvent.click(view.getByRole('button',{name:'OK'}));
  await waitFor(()=>assert.equal(view.queryByRole('dialog'),null));await waitFor(()=>assert.equal(document.activeElement,trigger));
});

test('Index menu contains only source Index and logout actions with no invented loan controls',async()=>{
  let logouts=0;const view=render(tree({onLogout:()=>{logouts++;}}));
  fireEvent.keyDown(view.getByRole('button',{name:'Index'}),{key:'ArrowDown'});await waitFor(()=>assert.ok(view.getByRole('menu')));
  assert.deepEqual(view.getAllByRole('menuitem').map(item=>item.textContent),['Index','登出']);fireEvent.click(view.getByRole('menuitem',{name:'登出'}));assert.equal(logouts,1);
});

test('scoped CSS preserves measured source shell, nested grid and modal dimensions with mobile containment rules',()=>{
  const css=readFileSync(new URL('../../src/features/public/affairs/studentLoan.css',import.meta.url),'utf8');
  for(const value of ['width:1120px;max-width:100%','height:34px','height:45px','height:31px','margin:0 -12px','width:83.33333333%',
    'margin-left:8.33333333%','margin:0 0 10px 16.66666667%','top:30px','width:600px','max-width:calc(100vw - 20px)',
    'margin-top:15px;padding:12px 20px 14px','border:5px solid #428bca','box-shadow:none','@media(max-width:767px)'])assert.ok(css.includes(value),value);
  assert.doesNotMatch(css,/tuition-/);
});
