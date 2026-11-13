import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter,useLocation} from 'react-router';
import type {User} from '@supabase/supabase-js';
import type {AffairsSnapshot} from '../../src/services/schoolAffairsWorkspace';
import type {StudentLoanRecord} from '../../src/services/studentLoan';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',manager='10000000-0000-4000-8000-000000000003';
const student='20000000-0000-4000-8000-000000000001',otherStudent='20000000-0000-4000-8000-000000000002',record='30000000-0000-4000-8000-000000000001';
const stamp='2026-01-01T00:00:00Z';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','Element','SVGElement','NodeFilter','KeyboardEvent','CustomEvent','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','localStorage'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const globals=globalThis as typeof globalThis&{__loanRoutingSession?:{data:{session:{user:{id:string};access_token:string}|null};error:null}};
const hook=registerHooks({load(url,context,next){
  if(/\/affairs\/authClient\.ts$/.test(url))return {format:'module',shortCircuit:true,source:'export const affairsClient={auth:{getSession:async()=>globalThis.__loanRoutingSession}};'};
  if(/\/public\/PublicAssistant\.tsx$/.test(url))return {format:'module',shortCircuit:true,source:'export const campusAssistantOpenEvent="synthetic-campus-assistant-open";'};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};
  return next(url,context);
}});
const originalFetch=globalThis.fetch;
const unexpected:typeof fetch=async()=>{throw new Error('Unexpected network request in offline loan routing test.');};
let routedFetch:typeof fetch=unexpected;
globalThis.fetch=(...args)=>routedFetch(...args);
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
const {default:SchoolAffairsPortal}=await import('../../src/features/public/affairs/SchoolAffairsPortal');
const {SchoolRecordManager}=await import('../../src/features/public/affairs/SchoolRecordManager');
const {AffairsContext}=await import('../../src/features/public/affairs/authContext');
afterEach(()=>{cleanup();routedFetch=unexpected;delete globals.__loanRoutingSession;dom.window.localStorage.clear();});
after(()=>{globalThis.fetch=originalFetch;hook.deregister();dom.window.close();});
const session=(id:string)=>{globals.__loanRoutingSession={data:{session:{user:{id},access_token:'synthetic-'+id}},error:null};};
function Path(){return <output aria-label="Current route">{useLocation().pathname}</output>;}
const portal=(path:string,userId=owner)=><MemoryRouter initialEntries={[path]}><SchoolAffairsPortal user={{id:userId,email:'synthetic@example.invalid'} as User}/><Path/></MemoryRouter>;


const loanRow=(userId=owner):StudentLoanRecord=>({id:record,userId,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,
  currentTermLabel:'Synthetic term',currentApplicationState:'not_applied',currentApplicationText:'Synthetic current notice',progressText:null,historyCount:0,historyText:'Synthetic history notice'});

test('21-1 native route reads only its caller-scoped snapshot and opens local progress/history pages',async()=>{
  session(owner);const calls:string[]=[];
  routedFetch=async(input,init)=>{const path=String(input);calls.push(path);assert.equal(path,'/api/affairs-data?scope=student-loan');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+owner);return Response.json({status:'loaded',record:loanRow()});};
  const view=render(portal('/school-affairs/services/21-1/'));
  await waitFor(()=>assert.ok(view.getByRole('link',{name:'4.歷年申請記錄(0)'})));
  assert.equal(view.container.querySelector('.affairs-portal'),null);assert.equal(calls.length,1);
  fireEvent.click(view.getByRole('link',{name:'1.查詢當期就學貸款進度'}));
  await waitFor(()=>assert.ok(view.getByRole('dialog')));assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/21-1/progress');
  assert.ok(view.getByText('Synthetic current notice'));fireEvent.click(view.getByRole('button',{name:'OK'}));
  await waitFor(()=>assert.equal(view.queryByRole('dialog'),null));assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/21-1');
  fireEvent.click(view.getByRole('link',{name:'4.歷年申請記錄(0)'}));await waitFor(()=>assert.ok(view.getByText('Synthetic history notice')));
  assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/21-1/history');assert.equal(calls.length,1,'Modal navigation must preserve the loaded account view.');
});

test('loan document navigation opens a local state page, never a file or the official school',async()=>{
  session(owner);routedFetch=async()=>Response.json({status:'loaded',record:loanRow()});
  const saved=dom.window.open,opened:unknown[][]=[];dom.window.open=(...args)=>{opened.push(args);return null;};
  try{
    const view=render(portal('/school-affairs/services/21-1'));await waitFor(()=>assert.ok(view.getByRole('link',{name:'4.歷年申請記錄(0)'})));
    fireEvent.click(view.getByRole('link',{name:'2.列印當期就學貸款資料'}));assert.deepEqual(opened,[['/school-affairs/services/21-1/document','_blank','noopener,noreferrer']]);
    assert.equal(view.container.querySelector('a[download],iframe,object,embed'),null);
  }finally{dom.window.open=saved;}
});

test('loan route refuses foreign data and account changes discard late old results',async()=>{
  session(owner);const signals:AbortSignal[]=[],releases:(()=>void)[]=[];
  routedFetch=async(_input,init)=>{const first=new Headers(init?.headers).get('Authorization')==='Bearer synthetic-'+owner;
    if(first){signals.push(init?.signal as AbortSignal);await new Promise<void>(resolve=>releases.push(resolve));}
    return Response.json({status:'loaded',record:first?loanRow():null});};
  const view=render(portal('/school-affairs/services/21-1'));await waitFor(()=>assert.equal(signals.length,1));session(other);
  view.rerender(portal('/school-affairs/services/21-1',other));assert.ok(signals[0].aborted);
  await act(async()=>releases.forEach(finish=>finish()));await waitFor(()=>assert.ok(view.getByRole('button',{name:'重新載入'})));
  assert.equal(view.getByRole('link',{name:'4.歷年申請記錄'}).textContent,'4.歷年申請記錄');assert.doesNotMatch(view.container.textContent??'',/Synthetic current notice/);
});

test('loan manager is lazy, retains same-account drafts when hidden, and resets on account or auth changes',async()=>{
  session(manager);const calls:{userId:string;signal:AbortSignal}[]=[];
  routedFetch=async(input,init)=>{assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+manager);const url=new URL(String(input),'http://localhost');
    assert.equal(url.pathname,'/api/affairs-data');assert.equal(url.searchParams.get('scope'),'student-loan-admin');
    calls.push({userId:url.searchParams.get('user_id')!,signal:init?.signal as AbortSignal});return Response.json({status:'loaded',record:null});};
  const admin:NonNullable<AffairsSnapshot['admin']>={profiles:[],students:[{id:student,user_id:owner,student_number:'SYN-A',full_name:'Synthetic Alpha'},{id:otherStudent,user_id:other,student_number:'SYN-B',full_name:'Synthetic Beta'}],sections:[],enrollments:[],dtmCourses:[],assignments:[],charges:[],requests:[]};
  const tree=(authId:string|null=manager)=><AffairsContext.Provider value={{user:authId?{id:authId} as User:null,loading:false,error:''}}><SchoolRecordManager admin={admin} busy={false} onManage={async()=>{throw new Error('Loan cannot use generic dispatch.');}}/></AffairsContext.Provider>;
  const view=render(tree());assert.equal(calls.length,0);fireEvent.click(view.getByRole('button',{name:'Manage loan records'}));
  await waitFor(()=>assert.ok(view.getByRole('textbox',{name:'當期學期原文'})));assert.equal(calls[0].userId,owner);
  fireEvent.click(view.getByRole('checkbox',{name:'當期學期原文未提供'}));fireEvent.change(view.getByRole('textbox',{name:'當期學期原文'}),{target:{value:'Unsent synthetic term'}});
  fireEvent.click(view.getByRole('button',{name:'Hide loan records'}));assert.equal(view.queryByRole('textbox',{name:'當期學期原文'}),null);
  fireEvent.click(view.getByRole('button',{name:'Manage loan records'}));assert.equal((view.getByRole('textbox',{name:'當期學期原文'}) as HTMLInputElement).value,'Unsent synthetic term');assert.equal(calls.length,1);
  fireEvent.change(view.getByLabelText('Student account'),{target:{value:otherStudent}});await waitFor(()=>assert.equal(calls.at(-1)?.userId,other));
  assert.ok(calls[0].signal.aborted);assert.equal((view.getByRole('textbox',{name:'當期學期原文'}) as HTMLInputElement).value,'');
  view.rerender(tree(null));assert.equal(view.queryByRole('region',{name:'Selected student loan maintenance'}),null);
});
