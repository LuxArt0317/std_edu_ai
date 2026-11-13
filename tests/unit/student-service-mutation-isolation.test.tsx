import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter,useLocation} from 'react-router';
import type {AffairsSnapshot,ServiceRecord} from '../../src/services/schoolAffairsWorkspace';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const recordId='20000000-0000-4000-8000-000000000001',periodId='30000000-0000-4000-8000-000000000001';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','Element','SVGElement','NodeFilter','KeyboardEvent','CustomEvent','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','FormData','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'PointerEvent',{value:dom.window.MouseEvent,configurable:true});
Object.defineProperty(dom.window,'PointerEvent',{value:dom.window.MouseEvent,configurable:true});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:dom.window.requestAnimationFrame.bind(dom.window),configurable:true});
Object.defineProperty(globalThis,'cancelAnimationFrame',{value:dom.window.cancelAnimationFrame.bind(dom.window),configurable:true});
type SessionResult={data:{session:{user:{id:string};access_token:string}|null};error:null};
const session=(id:string|null=owner):SessionResult=>({data:{session:id?{user:{id},access_token:'synthetic-'+id}:null},error:null});
const globals=globalThis as typeof globalThis&{__serviceMutationSession?:()=>Promise<SessionResult>;__serviceMutationSnapshot?:AffairsSnapshot;__serviceMutationRefresh?:()=>void};
const hooks=registerHooks({load(url,context,next){
  if(/\/affairs\/authClient\.ts$/.test(url))return {format:'module',shortCircuit:true,source:'export const affairsClient={auth:{getSession:async()=>globalThis.__serviceMutationSession()}};'};
  if(/\/affairs\/useAffairsRecords\.ts$/.test(url))return {format:'module',shortCircuit:true,source:'export function useAffairsRecords(userId){const value=globalThis.__serviceMutationSnapshot;return {snapshot:value?.profile.userId===userId?value:undefined,loading:false,error:undefined,refresh:()=>globalThis.__serviceMutationRefresh()};}'};
  if(/\/public\/PublicAssistant\.tsx$/.test(url))return {format:'module',shortCircuit:true,source:'export const campusAssistantOpenEvent="synthetic-assistant-open";'};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};
  return next(url,context);
}});
const {render,cleanup,fireEvent,waitFor,act,within}=await import('@testing-library/react');
const {default:StudentLeaveWorkspace}=await import('../../src/features/public/affairs/StudentLeaveWorkspace');
const {StudentServiceWorkspace}=await import('../../src/features/public/affairs/StudentServiceWorkspace');
const {StudentScholarshipWorkspace}=await import('../../src/features/public/affairs/StudentScholarshipWorkspace');
type Variant='leave-save'|'leave-review'|'leave-delete'|'generic-save'|'internship-save'|'internship-review'|'internship-delete'|'scholarship-apply'|'scholarship-cancel';
const variants:Variant[]=['leave-save','leave-review','leave-delete','generic-save','internship-save','internship-review','internship-delete','scholarship-apply','scholarship-cancel'];
let refreshes=0;
const posts:Array<{body:{kind:string;payload:Record<string,string>};authorization:string|null;signal:AbortSignal|null|undefined}>=[];
const originalFetch=globalThis.fetch;
let respond:()=>Promise<Response>=async()=>Response.json({id:recordId,kind:'saved'});
globalThis.fetch=async(input,init)=>{assert.equal(String(input),'/api/affairs-action','Only injected local actions are allowed.');assert.equal(init?.method,'POST');posts.push({body:JSON.parse(String(init?.body)),authorization:new Headers(init?.headers).get('Authorization'),signal:init?.signal});return respond();};
afterEach(()=>{cleanup();posts.length=0;refreshes=0;delete globals.__serviceMutationSession;delete globals.__serviceMutationSnapshot;delete globals.__serviceMutationRefresh;respond=async()=>Response.json({id:recordId,kind:'saved'});});
after(()=>{hooks.deregister();globalThis.fetch=originalFetch;dom.window.close();});
function snapshot(variant:Variant,userId=owner):AffairsSnapshot{
  const record:ServiceRecord={id:recordId,serviceKey:variant.startsWith('leave')?'leave':'internship',recordType:variant.startsWith('leave')?'leave':'contract',title:'Private saved draft for A',notes:'Private saved notes for A',status:'draft',startsOn:'2030-01-01',endsOn:'2030-01-02',leaveCategory:'personal',periods:'2–3',updatedAt:'2030-01-01T00:00:00Z',reviewStatus:null};
  return {profile:{userId,displayName:'Synthetic caller',email:'synthetic@example.invalid',role:'student'},student:{id:recordId,studentNumber:'SYNTHETIC',fullName:'Synthetic student',yearLevel:1,status:'active',sourceMode:'sample',program:'Synthetic program'},courses:[],charges:[],assignments:[],requests:[],tasks:[],terms:[],dtm:{sourceMode:'sample',courses:[],notices:[]},
    serviceRecords:userId===owner?[record]:[],scholarship:{periods:[{id:periodId,termLabel:'Synthetic period',opensAt:new Date(Date.now()-86400000).toISOString(),closesAt:new Date(Date.now()+86400000).toISOString(),published:true,instructions:'',sourceMode:'local_demo',version:1}],applications:variant==='scholarship-cancel'&&userId===owner?[{id:recordId,userId,periodId,status:'pending',awardAmount:null,requiredHours:null,actualHours:null,reviewNote:'',version:2}]:[]}} as unknown as AffairsSnapshot;
}
function Path(){return <output aria-label="Current route">{useLocation().pathname}</output>;}
function tree(variant:Variant,userId=owner){return <MemoryRouter initialEntries={['/school-affairs/services/test']}>
  {variant.startsWith('leave')?<StudentLeaveWorkspace userId={userId} view={variant==='leave-save'?'':'history'}/>:variant.startsWith('scholarship')?<StudentScholarshipWorkspace userId={userId}/>:<StudentServiceWorkspace userId={userId} serviceKey={variant==='generic-save'?'7-1':'internship'} view={variant==='generic-save'?'':'contract'}/>}<Path/>
</MemoryRouter>;}
function fixture(variant:Variant){globals.__serviceMutationSession=async()=>session();globals.__serviceMutationSnapshot=snapshot(variant);globals.__serviceMutationRefresh=()=>{refreshes++;};return render(tree(variant));}
function prepare(view:ReturnType<typeof render>,variant:Variant){
  if(variant==='leave-save'){
    fireEvent.change(view.getByLabelText('開始請假日期',{exact:true}),{target:{value:'2030-01-01'}});fireEvent.change(view.getByLabelText('結束請假日期',{exact:true}),{target:{value:'2030-01-02'}});fireEvent.click(view.getByRole('radio',{name:'事假'}));fireEvent.change(view.getByLabelText('請假節次',{exact:true}),{target:{value:'2–3'}});fireEvent.change(view.getByLabelText('請假事由',{exact:true}),{target:{value:'Private new draft for A'}});
    return ()=>fireEvent.submit(view.container.querySelector('form')!);
  }
  if(variant==='generic-save'||variant==='internship-save'){
    fireEvent.click(view.getByRole('button',{name:/新增紀錄/}));fireEvent.change(view.container.querySelector('input[name="title"]')!,{target:{value:'Private new draft for A'}});fireEvent.change(view.container.querySelector('textarea[name="notes"]')!,{target:{value:'Private new notes for A'}});
    return ()=>fireEvent.submit(view.container.querySelector('form')!);
  }
  const review=variant.endsWith('review'),scholarship=variant.startsWith('scholarship');
  fireEvent.click(view.getByRole('button',{name:scholarship?(variant==='scholarship-apply'?'申請獎助學金':'取消申請'):review?(variant.startsWith('leave')?'送站內審核':/Request site review/):variant.startsWith('leave')?'刪除':/Delete/}));
  return ()=>fireEvent.click(within(view.getByRole('dialog')).getByRole('button',{name:scholarship?'確認':review?(variant.startsWith('leave')?'送出':'送出 · Send request'):variant.startsWith('leave')?'刪除':'刪除 · Delete'}));
}
for(const variant of variants)test(variant+' rejects a replacement session before POST and retains the original draft',async()=>{
  const view=fixture(variant),submit=prepare(view,variant);globals.__serviceMutationSession=async()=>session(other);submit();
  await waitFor(()=>assert.match(view.getByRole('alert').textContent!,/account changed/i));assert.equal(posts.length,0);
  if(variant==='leave-save')assert.equal((view.getByLabelText('請假事由') as HTMLTextAreaElement).value,'Private new draft for A');
  else if(variant.endsWith('save'))assert.equal((view.container.querySelector('input[name="title"]') as HTMLInputElement).value,'Private new draft for A');
  else assert.ok(view.getByRole('dialog'));
});
for(const returnedUser of [owner,other])for(const variant of variants)test(variant+' aborts held session lookup on user change even if lookup returns '+(returnedUser===owner?'old caller':'new caller'),async()=>{
  const view=fixture(variant),submit=prepare(view,variant);let complete:(value:SessionResult)=>void=()=>{};let calls=0;
  globals.__serviceMutationSession=()=>{calls++;return new Promise(resolve=>{complete=resolve;});};submit();await waitFor(()=>assert.equal(calls,1));
  globals.__serviceMutationSnapshot=snapshot(variant,other);view.rerender(tree(variant,other));assert.equal(view.queryByRole('dialog'),null);assert.doesNotMatch(view.container.textContent!,/Private saved draft for A|Private saved notes for A/);
  await act(async()=>{complete(session(returnedUser));});assert.equal(posts.length,0);assert.equal(refreshes,0);assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/test');
});
for(const variant of variants)test(variant+' aborts dispatched request on unmount and ignores late success',async()=>{
  const view=fixture(variant),submit=prepare(view,variant);let complete:(value:Response)=>void=()=>{};respond=()=>new Promise(resolve=>{complete=resolve;});
  submit();await waitFor(()=>assert.equal(posts.length,1));assert.equal(posts[0].authorization,'Bearer synthetic-'+owner);assert.equal(posts[0].signal?.aborted,false);view.unmount();assert.equal(posts[0].signal?.aborted,true);
  await act(async()=>{complete(Response.json({id:recordId,kind:posts[0].body.kind}));});assert.equal(refreshes,0);
});
for(const variant of ['leave-save','generic-save','internship-save','scholarship-apply','scholarship-cancel'] as const)test(variant+' retains identity on retry and prevents same-tick double dispatch',async()=>{
  const view=fixture(variant),submit=prepare(view,variant);let complete:(value:Response)=>void=()=>{};respond=()=>new Promise(resolve=>{complete=resolve;});
  act(()=>{submit();submit();});await waitFor(()=>assert.equal(posts.length,1));const first=structuredClone(posts[0].body);
  await act(async()=>{complete(Response.json({error:'Temporary synthetic failure'},{status:503}));});await waitFor(()=>assert.match(view.getByRole('alert').textContent!,/Temporary synthetic failure/));
  respond=async()=>Response.json({id:recordId,kind:first.kind});submit();await waitFor(()=>assert.equal(posts.length,2));assert.deepEqual(posts[1].body,first);assert.equal(posts[1].authorization,'Bearer synthetic-'+owner);
  await waitFor(()=>variant==='leave-save'?assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/leave/history'):assert.ok(refreshes>0));
});
test('sign-out during session lookup rejects before dispatch and keeps draft for a later signed-in retry',async()=>{
  const view=fixture('leave-save'),submit=prepare(view,'leave-save');globals.__serviceMutationSession=async()=>session(null);submit();await waitFor(()=>assert.match(view.getByRole('alert').textContent!,/Sign in/));assert.equal(posts.length,0);assert.equal((view.getByLabelText('請假事由') as HTMLTextAreaElement).value,'Private new draft for A');
});
