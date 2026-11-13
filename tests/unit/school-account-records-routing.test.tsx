import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter,Route,Routes,useLocation,useNavigate} from 'react-router';
import type {User} from '@supabase/supabase-js';
import type {AffairsSnapshot} from '../../src/services/schoolAffairsWorkspace';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
type Session={data:{session:{user:{id:string};access_token:string}};error:null};
const session=(id:string):Session=>({data:{session:{user:{id},access_token:'synthetic-'+id}},error:null});
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','Element','SVGElement','NodeFilter','KeyboardEvent','CustomEvent','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','localStorage'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:dom.window.requestAnimationFrame.bind(dom.window),configurable:true});
Object.defineProperty(globalThis,'cancelAnimationFrame',{value:dom.window.cancelAnimationFrame.bind(dom.window),configurable:true});
const globals=globalThis as typeof globalThis&{__recordsSession:()=>Promise<Session>};
globals.__recordsSession=async()=>session(owner);
const hook=registerHooks({load(url,context,next){
  if(url.endsWith('/affairs/authClient.ts'))return {format:'module',shortCircuit:true,source:`export const affairsClient={auth:{getSession:()=>globalThis.__recordsSession()}};export const affairsCallbackPath='/school-affairs/auth';export const completeGoogleSignIn=async()=>{};export const consumeGoogleReturnPath=()=>'/school-affairs';export const safeSchoolReturnPath=value=>typeof value==='string'&&value.startsWith('/school-affairs')?value:'/school-affairs';export const startGoogleSignIn=async()=>{};export const signOutAffairs=async()=>{};`};
  if(url.endsWith('/public/PublicAssistant.tsx'))return {format:'module',shortCircuit:true,source:'export const campusAssistantOpenEvent="offline-assistant-open";'};
  if(url.endsWith('/affairs/SchoolRecordManager.tsx'))return {format:'module',shortCircuit:true,source:`import React,{useState} from 'react';export function SchoolRecordManager({busy,onManage,onRefresh}){const[draft,setDraft]=useState('');return React.createElement('section',{'aria-label':'Existing record manager'},React.createElement('input',{'aria-label':'Manager draft',value:draft,disabled:busy,onChange:event=>setDraft(event.target.value)}),React.createElement('button',{disabled:busy,onClick:()=>void onManage({kind:'save_charge',payload:{id:'synthetic-charge',label:'Synthetic saved fee',amount_due:0,amount_paid:0}})},'Save managed record'),React.createElement('button',{disabled:busy,onClick:onRefresh},'Refresh managed records'));}`};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};
  return next(url,context);
}});
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
const {default:Portal}=await import('../../src/features/public/affairs/SchoolAffairsPortal');
const {default:Entry}=await import('../../src/features/public/affairs/SchoolAffairsEntry');
const {AffairsContext}=await import('../../src/features/public/affairs/authContext');
const {manageSchoolAffairsRecord,performSchoolAffairsAction}=await import('../../src/services/schoolAffairsWorkspace');
const originalFetch=globalThis.fetch;
const calls:Array<{path:string;method:string;body:unknown;signal:AbortSignal|null|undefined}>=[];
let role:'student'|'admin'='student',readFailure=false;
function data(id=owner):AffairsSnapshot{return {
  checkedAt:'2030-01-01T00:00:00Z',officialUniversityData:false,
  profile:{userId:id,email:'synthetic@example.invalid',displayName:'Synthetic',role},student:null,
  courses:[{code:'DO-NOT-RENDER-PERSONAL-SUBJECT'}] as AffairsSnapshot['courses'],charges:[{label:'DO-NOT-RENDER-PERSONAL-FEE'}] as AffairsSnapshot['charges'],assignments:[],tasks:[],requests:[],announcements:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
  admin:role==='admin'?{profiles:[{user_id:id,email:'synthetic@example.invalid',display_name:'Synthetic administrator',role:'admin',created_at:'2030-01-01T00:00:00Z'}],students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[{id:'synthetic-request',user_id:id,request_type:'general',title:'Synthetic request',details:'Synthetic request details',status:'open',created_at:'2030-01-01T00:00:00Z'}]}:undefined,
};}
let fetchImpl:typeof fetch=async(input,init)=>{
  const path=String(input),method=init?.method||'GET';calls.push({path,method,body:init?.body?JSON.parse(String(init.body)):null,signal:init?.signal});
  if(method!=='GET')return Response.json({id:'synthetic-result',kind:'saved',summary:'Synthetic save completed'});
  assert.ok(['/api/affairs-data','/api/affairs-data?scope=admin'].includes(path));
  if(readFailure)return Response.json({error:'Synthetic read failed'},{status:503});
  const id=new Headers(init?.headers).get('Authorization')?.replace('Bearer synthetic-','')||owner;
  return Response.json(data(id));
};
const defaultFetch=fetchImpl;globalThis.fetch=(...args)=>fetchImpl(...args);
afterEach(()=>{cleanup();calls.length=0;role='student';readFailure=false;fetchImpl=defaultFetch;globals.__recordsSession=async()=>session(owner);dom.window.localStorage.clear();});
after(()=>{globalThis.fetch=originalFetch;hook.deregister();dom.window.close();});
const user=(id=owner):User=>({id,email:'synthetic@example.invalid',app_metadata:{role:'admin'},user_metadata:{},aud:'authenticated',created_at:'2030-01-01T00:00:00Z'});
function Location(){const location=useLocation(),navigate=useNavigate();return <><output aria-label="Current route">{location.pathname+location.search+location.hash}</output><button onClick={()=>navigate(-1)}>Test back</button></>;}
function page(path:string,id=owner,previous?:string){return <AffairsContext.Provider value={{user:user(id),loading:false,error:''}}><MemoryRouter initialEntries={previous?[previous,path]:[path]} initialIndex={previous?1:0}><Portal user={user(id)}/><Location/></MemoryRouter></AffairsContext.Provider>;}
async function openAccount(view:ReturnType<typeof render>){fireEvent.keyDown(view.getByRole('button',{name:'Welcome, synthetic@example.invalid 帳號選單'}),{key:'ArrowDown'});await waitFor(()=>assert.ok(view.getByRole('menu')));}

test('old records URLs replace history with source-shaped Index, without overview cards or writes',async()=>{
  const preserved=JSON.stringify(data());
  for(const suffix of ['','/','?view=tasks#profile']){
    const view=render(page('/school-affairs/records'+suffix,owner,'/school-affairs/bookmarks'));
    await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs'));
    assert.ok(view.getByRole('heading',{name:'校務系統入口'}));assert.equal(view.queryByRole('heading',{name:'My School Affairs'}),null);
    assert.doesNotMatch(view.container.textContent||'',/DO-NOT-RENDER-PERSONAL|Add a task|Ask the site admin/);
    assert.equal(view.container.querySelector('.portal-account-records'),null);
    fireEvent.click(view.getByRole('button',{name:'Test back'}));await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/bookmarks'));
    view.unmount();
  }
  assert.ok(calls.every(call=>call.method==='GET'&&call.path==='/api/affairs-data'));
  assert.equal(JSON.stringify(data()),preserved,'The fixture is preserved; the UI issues no data mutation.');
});

test('student menu has no custom profile summary or admin link, despite user metadata claiming admin',async()=>{
  const view=render(page('/school-affairs'));await waitFor(()=>assert.equal(calls.length,1));await openAccount(view);
  assert.equal(view.queryByRole('menuitem',{name:'個人資料'}),null);
  assert.equal(view.queryByRole('menuitem',{name:'School Affairs administration'}),null);
  assert.ok(view.getByRole('menuitem',{name:'個人使用者通知查詢'}));assert.ok(view.getByRole('menuitem',{name:'Privacy & account information'}));
});

test('verified admin menu reaches separate maintenance without exposing the personal overview or writing on entry',async()=>{
  role='admin';const view=render(page('/school-affairs'));await waitFor(()=>assert.equal(calls.length,1));await openAccount(view);
  const link=view.getByRole('menuitem',{name:'School Affairs administration'});assert.equal(link.getAttribute('href'),'/school-affairs/admin/records');fireEvent.click(link);
  await waitFor(()=>assert.ok(view.getByRole('heading',{name:'School Affairs administration'})));
  assert.ok(view.getByRole('region',{name:'Existing record manager'}));assert.ok(view.getByRole('button',{name:'Resolve'}));assert.ok(view.getByRole('button',{name:'Publish notice'}));
  assert.equal(view.queryByRole('button',{name:'Open site admin'}),null);assert.doesNotMatch(view.container.textContent||'',/My School Affairs|DO-NOT-RENDER-PERSONAL/);
  assert.ok(calls.every(call=>call.method==='GET'));assert.ok(calls.some(call=>call.path==='/api/affairs-data?scope=admin'));
});

test('student and anonymous admin routes cannot render maintenance or request administrator data',async()=>{
  const view=render(page('/school-affairs/admin/records'));await waitFor(()=>assert.match(view.getByRole('alert').textContent||'',/verified site administrator/));
  assert.equal(view.queryByRole('region',{name:'Existing record manager'}),null);assert.deepEqual(calls.map(call=>call.path),['/api/affairs-data']);view.unmount();calls.length=0;
  const anonymous=render(<AffairsContext.Provider value={{user:null,loading:false,error:''}}><MemoryRouter initialEntries={['/school-affairs/admin/records']}><Routes><Route path="/school-affairs/login" element={<h1>Sign in required</h1>}/><Route path="*" element={<Entry/>}/></Routes><Location/></MemoryRouter></AffairsContext.Provider>);
  await waitFor(()=>assert.ok(anonymous.getByRole('heading',{name:'Sign in required'})));assert.equal(calls.length,0);
});

test('admin refresh preserves an existing manager draft, and read failures disable mutations',async()=>{
  role='admin';const view=render(page('/school-affairs/admin/records'));await waitFor(()=>assert.ok(view.getByLabelText('Manager draft')));
  fireEvent.change(view.getByLabelText('Manager draft'),{target:{value:'Retained unsaved metadata'}});readFailure=true;
  fireEvent.click(view.getByRole('button',{name:'Refresh managed records'}));await waitFor(()=>assert.match(view.getByRole('alert').textContent||'',/Synthetic read failed/));
  assert.equal((view.getByLabelText('Manager draft') as HTMLInputElement).value,'Retained unsaved metadata');assert.equal((view.getByRole('button',{name:'Save managed record'}) as HTMLButtonElement).disabled,true);
  readFailure=false;fireEvent.click(view.getByRole('button',{name:'Try again'}));await waitFor(()=>assert.equal((view.getByRole('button',{name:'Save managed record'}) as HTMLButtonElement).disabled,false));
  assert.equal((view.getByLabelText('Manager draft') as HTMLInputElement).value,'Retained unsaved metadata');assert.ok(calls.every(call=>call.method==='GET'));
});

for(const kind of ['manage','action'] as const)for(const returnedId of [owner,other])test(`${kind} rejects delayed-session account switch (${returnedId===owner?'old':'new'} session), before POST`,async()=>{
  role='admin';const view=render(page('/school-affairs/admin/records'));await waitFor(()=>assert.ok(view.getByLabelText('Manager draft')));
  let finish!:(value:Session)=>void,sessionCalls=0;globals.__recordsSession=()=>{sessionCalls++;return new Promise(resolve=>{finish=resolve;});};
  if(kind==='manage')fireEvent.click(view.getByRole('button',{name:'Save managed record'}));else fireEvent.click(view.getByRole('button',{name:'Resolve'}));
  assert.equal(sessionCalls,1);globals.__recordsSession=async()=>session(other);view.rerender(page('/school-affairs/admin/records',other));
  await act(async()=>{finish(session(returnedId));});await waitFor(()=>assert.ok(view.getByRole('heading',{name:'School Affairs administration'})));
  assert.ok(calls.every(call=>call.method==='GET'));assert.doesNotMatch(view.container.textContent||'',/Synthetic save completed/);
});

test('synchronous duplicate admin submits dispatch once and a late completed response cannot update a switched account',async()=>{
  role='admin';const view=render(page('/school-affairs/admin/records'));await waitFor(()=>assert.ok(view.getByLabelText('Announcement title')));
  fireEvent.change(view.getByLabelText('Announcement title'),{target:{value:'Synthetic publication'}});fireEvent.change(view.getByLabelText('Announcement body'),{target:{value:'Synthetic publication body'}});
  let finish!:(response:Response)=>void;fetchImpl=async(input,init)=>{if(init?.method==='POST'){calls.push({path:String(input),method:'POST',body:JSON.parse(String(init.body)),signal:init.signal});return new Promise(resolve=>{finish=resolve;});}return defaultFetch(input,init);};
  const form=view.getByRole('button',{name:'Publish notice'}).closest('form')!;
  act(()=>{fireEvent.submit(form);fireEvent.submit(form);});await waitFor(()=>assert.equal(calls.filter(call=>call.method==='POST').length,1));
  const sent=calls.find(call=>call.method==='POST')!;assert.deepEqual(sent.body,{kind:'publish_announcement',payload:{title:'Synthetic publication',body:'Synthetic publication body'}});
  globals.__recordsSession=async()=>session(other);view.rerender(page('/school-affairs/admin/records',other));assert.equal(sent.signal?.aborted,true);
  await act(async()=>{finish(Response.json({id:'synthetic-result',kind:'publish_announcement',summary:'LATE RESULT MUST NOT APPEAR'}));});
  await waitFor(()=>assert.ok(view.getByLabelText('Announcement title')));assert.equal((view.getByLabelText('Announcement title') as HTMLInputElement).value,'');assert.doesNotMatch(view.container.textContent||'',/LATE RESULT/);
});

test('both actual transports reject mismatched identities and preserve ordinary unguarded callers',async()=>{
  globals.__recordsSession=async()=>session(other);
  await assert.rejects(manageSchoolAffairsRecord({kind:'delete_charge',payload:{id:'synthetic-charge'}},{expectedUserId:owner}),/account changed/);
  await assert.rejects(performSchoolAffairsAction({kind:'complete_task',payload:{task_id:'synthetic-task'}},{expectedUserId:owner}),/account changed/);assert.equal(calls.length,0);
  await manageSchoolAffairsRecord({kind:'delete_charge',payload:{id:'synthetic-charge'}});await performSchoolAffairsAction({kind:'complete_task',payload:{task_id:'synthetic-task'}});
  assert.deepEqual(calls.map(call=>call.path),['/api/affairs-manage','/api/affairs-action']);
});

test('catalog home and calendar use document navigation, while native internal destinations retain SPA routing',async()=>{
  const view=render(page('/school-affairs/search'));await waitFor(()=>assert.equal(calls.length,1));
  for(const id of ['4-5','4-4']){
    const anchor=view.container.querySelector<HTMLAnchorElement>(`a[data-program-id="${id}"]`)!;assert.ok(anchor);if(id==='4-5')assert.equal(anchor.getAttribute('href'),'/');
    let prevented:boolean|undefined;window.addEventListener('click',event=>{prevented=event.defaultPrevented;event.preventDefault();},{once:true});fireEvent.click(anchor);assert.equal(prevented,false,id+' lets the browser load the copied document');
    assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/search');
  }
  const native=view.container.querySelector<HTMLAnchorElement>('a[data-program-id="11-1"]')!;let prevented:boolean|undefined;
  window.addEventListener('click',event=>{prevented=event.defaultPrevented;event.preventDefault();},{once:true});fireEvent.click(native);
  await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/11-1'));assert.equal(prevented,true);assert.ok(view.container.querySelector('.course-selection'));
});

test('privacy remains accessible with no account summary or service requests',()=>{
  const view=render(<AffairsContext.Provider value={{user:null,loading:false,error:''}}><MemoryRouter initialEntries={['/school-affairs/privacy']}><Entry/></MemoryRouter></AffairsContext.Provider>);
  assert.ok(view.getByRole('heading',{name:'stu.best sign-in privacy'}));assert.equal(view.queryByRole('heading',{name:'My School Affairs'}),null);assert.equal(calls.length,0);
});
