import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {StrictMode} from 'react';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLButtonElement','HTMLInputElement','Node','NodeFilter','Element','Event','MouseEvent','KeyboardEvent','CustomEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:dom.window.requestAnimationFrame.bind(dom.window),configurable:true});
Object.defineProperty(globalThis,'cancelAnimationFrame',{value:dom.window.cancelAnimationFrame.bind(dom.window),configurable:true});
const hook=registerHooks({load(url,context,next){return /\/(?:creditLoadApplication|courseSelectionIndex)\.css$/.test(url)?{format:'module',shortCircuit:true,source:'export {};'}:next(url,context);}});
const {CreditLoadApplication}=await import('../../src/features/public/affairs/CreditLoadApplication');
const {CourseSelectionIndex}=await import('../../src/features/public/affairs/CourseSelectionIndex');
const creditLoadEntryReference={path:'/school-affairs/services/7-1'};
const courseSelectionIndexPath='/school-affairs/course-selection';
const {render,cleanup,fireEvent,waitFor}=await import('@testing-library/react');
const originalFetch=globalThis.fetch;let requests=0;
globalThis.fetch=async()=>{requests++;throw Error('Reference views must not send a request');};
afterEach(()=>{cleanup();assert.equal(requests,0);});
after(()=>{hook.deregister();globalThis.fetch=originalFetch;dom.window.close();});
function Location(){return <output aria-label="Current local route">{useLocation().pathname}</output>;}
function tree(path=creditLoadEntryReference.path as string){return <StrictMode><MemoryRouter initialEntries={[path]}><Routes>
  <Route path={creditLoadEntryReference.path} element={<CreditLoadApplication/>}/><Route path={courseSelectionIndexPath} element={<CourseSelectionIndex/>}/>
  <Route path="*" element={<p>Known destination reached</p>}/>
</Routes><Location/></MemoryRouter></StrictMode>;}

test('captured closed-period instructions have four literal statements and no invented form or personal record',()=>{
  const view=render(tree());
  assert.equal(view.getByRole('heading',{level:1}).textContent?.replace(/[\uf000-\uf8ff]/g,'').trim(),'超修減修學分系統  首頁');
  assert.equal(view.container.querySelectorAll('.credit-load-application-instructions li').length,4);
  assert.match(view.container.textContent!,/學分達三分之二不及格/);
  assert.match(view.container.textContent!,/不得要求降低學雜費收費或退費/);
  assert.equal(view.container.querySelectorAll('form,input,select,textarea,table,iframe,a[download]').length,0);
  assert.doesNotMatch(view.container.textContent!,/申請成功|核准紀錄|已送出申請|您的學分/);
  assert.equal(view.container.querySelector('.course-selection-system')?.getAttribute('data-observed-on'),'2026-11-13');
  const main=view.getByRole('main'),description=document.getElementById(main.getAttribute('aria-describedby')!);
  assert.match(description?.textContent||'',/2026-11-13.*不代表目前開放狀態/);
  assert.equal(view.container.querySelector('.course-selection-system-section-title')?.textContent,'線上申請時間：2026/8/3 上午 08:00:00 至 2026/10/2 上午 09:00:00');
  assert.equal(view.container.querySelector('footer')?.textContent,'stu.best');
});

test('acknowledgment is a focus-managed closed-period dialog, repeatable without navigation, storage or a write',async()=>{
  const view=render(tree());const before=view.container.querySelector('.credit-load-application-instructions')!.textContent;
  const button=view.getByRole('button',{name:'我已了解'});button.focus();fireEvent.click(button);
  const dialog=await view.findByRole('alertdialog',{name:'目前非超減修申請時間~'});
  assert.match(dialog.textContent||'',/確認後返回相同說明，未送出申請/);
  assert.equal(view.getByLabelText('Current local route').textContent,creditLoadEntryReference.path);
  fireEvent.click(view.getByRole('button',{name:'OK'}));
  await waitFor(()=>{assert.equal(view.queryByRole('alertdialog'),null);assert.ok(document.activeElement===button,'Focus returns to the acknowledgment button');});
  fireEvent.click(button);await view.findByRole('alertdialog');fireEvent.keyDown(document.activeElement!,{key:'Escape'});
  await waitFor(()=>{assert.equal(view.queryByRole('alertdialog'),null);assert.ok(document.activeElement===button,'Escape returns focus to the acknowledgment button');});
  assert.equal(view.container.querySelector('.credit-load-application-instructions')!.textContent,before);
  assert.equal(dom.window.localStorage.length,0);assert.equal(dom.window.sessionStorage.length,0);
});

test('Exit reaches the observed local system index and application/history remain separate destinations',async()=>{
  const view=render(tree());fireEvent.click(view.getByRole('link',{name:'離開'}));
  assert.equal(view.getByLabelText('Current local route').textContent,courseSelectionIndexPath);
  assert.equal(view.container.querySelectorAll('.course-selection-index-panel').length,6);
  assert.equal(view.getByRole('link',{name:'學生歷年超減修申請紀錄查詢'}).getAttribute('href'),'/school-affairs/services/11-3');
  fireEvent.click(view.getByRole('link',{name:'學生超減修申請'}));
  assert.equal(view.getByLabelText('Current local route').textContent,creditLoadEntryReference.path);
  assert.equal(view.queryByRole('alertdialog'),null);
});

test('source index keeps all nine observed links, including explicit student-session review redirect destinations',()=>{
  const view=render(tree(courseSelectionIndexPath));
  const links=[...view.container.querySelectorAll('.course-selection-index-panel a')].map(a=>[a.textContent,a.getAttribute('href')]);
  assert.deepEqual(links,[
    ['學生超減修申請','/school-affairs/services/7-1'],['學生歷年超減修申請紀錄查詢','/school-affairs/services/11-3'],
    ['導師審核','/school-affairs/course-selection/review/tutor'],['系主任線上審核','/school-affairs/course-selection/review/dean'],['教務組線上審核','/school-affairs/course-selection/review/academic'],
    ['選課記錄查詢','/school-affairs/services/11-1'],['學生一周課表首頁','/school-affairs/services/11-2'],['線上教學反應','/school-affairs/services/7-6'],['棄選','/school-affairs/services/6-4'],
  ]);
  assert.equal(view.container.querySelectorAll('form,input,table').length,0);
});

test('common navigation preserves selection links and its own Index/logout boundary',async()=>{
  const view=render(tree());
  fireEvent.keyDown(view.getByRole('button',{name:'選課資訊'}),{key:'ArrowDown'});
  await view.findByRole('menu');
  assert.deepEqual(view.getAllByRole('menuitem').map(item=>[item.textContent,item.getAttribute('href')]),[
    ['選課記錄查詢','/school-affairs/services/11-1'],['我的課表','/school-affairs/services/11-2'],['選課確認','/school-affairs/services/6-6'],['棄選','/school-affairs/services/6-4'],['即時教學反應','/school-affairs/services/7-6'],
  ]);
  fireEvent.keyDown(document.activeElement!,{key:'Escape'});await waitFor(()=>assert.equal(view.queryByRole('menu'),null));
  fireEvent.keyDown(view.getByRole('button',{name:'Index'}),{key:'ArrowDown'});await view.findByRole('menu');
  assert.equal(view.getByRole('menuitem',{name:'Index'}).getAttribute('href'),courseSelectionIndexPath);
  assert.equal(view.getByRole('menuitem',{name:'Logout'}).getAttribute('href'),'/school-affairs/signed-out');
});

test('the separately observed transfer-record link remains explicit external navigation, never an embedded request',async()=>{
  const view=render(tree());fireEvent.keyDown(view.getByRole('button',{name:'抵免學分'}),{key:'ArrowDown'});await view.findByRole('menu');
  const external=view.getByRole('menuitem',{name:'已抵免學分記錄查詢'});
  assert.equal(external.getAttribute('href'),'https://infosys.stu.edu.tw/WebSelectCourse/StuCcredit/GetCreditTransfer');
  assert.equal(external.getAttribute('target'),'_blank');assert.equal(external.getAttribute('rel'),'noopener noreferrer');
  assert.equal(view.getByRole('menuitem',{name:'抵免學分申請'}).getAttribute('href'),'/school-affairs/services/7-2');
});
