import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter,useLocation} from 'react-router';
import type {User} from '@supabase/supabase-js';
import type {AffairsSnapshot} from '../../src/services/schoolAffairsWorkspace';
import type {DormitoryConductAdminRecord} from '../../src/services/dormitoryConduct';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',manager='10000000-0000-4000-8000-000000000003';
const student='20000000-0000-4000-8000-000000000001',otherStudent='20000000-0000-4000-8000-000000000002',stamp='2030-01-01T00:00:00Z';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','Element','SVGElement','NodeFilter','KeyboardEvent','CustomEvent','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','localStorage'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const globals=globalThis as typeof globalThis&{__dormRoutingSession?:{data:{session:{user:{id:string};access_token:string}|null};error:null}};
const hook=registerHooks({load(url,context,next){
  if(/\/affairs\/authClient\.ts$/.test(url))return {format:'module',shortCircuit:true,source:'export const affairsClient={auth:{getSession:async()=>globalThis.__dormRoutingSession}};'};
  if(/\/public\/PublicAssistant\.tsx$/.test(url))return {format:'module',shortCircuit:true,source:'export const campusAssistantOpenEvent="synthetic-campus-assistant-open";'};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};
  return next(url,context);
}});
const originalFetch=globalThis.fetch;
const unexpected:typeof fetch=async()=>{throw new Error('Unexpected network request in offline dorm routing test.');};
let routedFetch:typeof fetch=unexpected;
globalThis.fetch=(...args)=>routedFetch(...args);
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
const {default:SchoolAffairsPortal}=await import('../../src/features/public/affairs/SchoolAffairsPortal');
const {SchoolRecordManager}=await import('../../src/features/public/affairs/SchoolRecordManager');
const {AffairsContext}=await import('../../src/features/public/affairs/authContext');
afterEach(()=>{cleanup();routedFetch=unexpected;delete globals.__dormRoutingSession;dom.window.localStorage.clear();});
after(()=>{globalThis.fetch=originalFetch;hook.deregister();dom.window.close();});
const session=(id:string)=>{globals.__dormRoutingSession={data:{session:{user:{id},access_token:'synthetic-'+id}},error:null};};
function Path(){return <span aria-label="Current route">{useLocation().pathname}</span>;}
const portal=(path='/school-affairs/services/34-2',userId=owner)=><MemoryRouter initialEntries={[path]}><SchoolAffairsPortal user={{id:userId,email:'synthetic@example.invalid'} as User}/><Path/></MemoryRouter>;
const identity=(userId:string)=>({profile:{userId},student:{studentNumber:'SYNTHETIC',fullName:'Synthetic Caller'},requests:[],announcements:[]});
const snapshot=(userId=owner)=>({userId,sourceMode:'local_demo',version:1,result:'empty'});

test('34-2 mounts the native message page, reads independent caller identity and returns HomePage locally',async()=>{
  session(owner);const calls:string[]=[];
  routedFetch=async(input,init)=>{const path=String(input);calls.push(path);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+owner);
    if(path==='/api/affairs-data')return Response.json(identity(owner));assert.equal(path,'/api/affairs-data?scope=dormitory-conduct');return Response.json({snapshot:snapshot()});};
  const view=render(portal('/school-affairs/services/34-2/'));await waitFor(()=>assert.match(view.getByRole('status').textContent!,/尚未有任何住宿的獎懲記錄/));
  assert.equal(view.container.querySelector('.affairs-portal'),null);assert.ok(view.container.querySelector('.dorm-conduct'));
  assert.deepEqual(calls.sort(),['/api/affairs-data','/api/affairs-data?scope=dormitory-conduct']);assert.equal(view.container.querySelector('table,form,a[download],iframe,object'),null);
  assert.doesNotMatch(view.container.textContent!,/Synthetic Caller|SYNTHETIC/);
  fireEvent.click(view.getByRole('link',{name:'HomePage'}));await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs'));assert.equal(view.container.querySelector('.dorm-conduct'),null);
});

test('identity errors suppress an empty claim and retry both readers; missing or foreign data remains unknown',async()=>{
  session(owner);let identities=0,snapshots=0;
  routedFetch=async input=>{if(String(input)==='/api/affairs-data'){identities++;return identities===1?Response.json({error:'PRIVATE IDENTITY'},{status:503}):Response.json(identity(owner));}
    assert.equal(String(input),'/api/affairs-data?scope=dormitory-conduct');snapshots++;return Response.json({snapshot:snapshot()});};
  const view=render(portal());await waitFor(()=>assert.ok(view.getByRole('alert')));assert.doesNotMatch(view.container.textContent!,/尚未有任何|PRIVATE/);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));await waitFor(()=>assert.match(view.getByRole('status').textContent!,/尚未有任何/));assert.equal(identities,2);assert.equal(snapshots,2);view.unmount();
  for(const data of [null,snapshot(other)]){
    routedFetch=async input=>Response.json(String(input)==='/api/affairs-data'?identity(owner):{snapshot:data});
    const missing=render(portal());await waitFor(()=>assert.ok(missing.getByRole('button',{name:'重新載入'})));assert.doesNotMatch(missing.container.textContent!,/尚未有任何/);missing.unmount();
  }
});

test('route account switch aborts both prior reads and discards their late empty result',async()=>{
  session(owner);const signals:AbortSignal[]=[],releases:(()=>void)[]=[];
  routedFetch=async(input,init)=>{const first=new Headers(init?.headers).get('Authorization')==='Bearer synthetic-'+owner;
    if(first){signals.push(init?.signal as AbortSignal);await new Promise<void>(resolve=>releases.push(resolve));}
    if(String(input)==='/api/affairs-data')return Response.json(identity(first?owner:other));assert.equal(String(input),'/api/affairs-data?scope=dormitory-conduct');return Response.json({snapshot:first?snapshot():null});};
  const view=render(portal());await waitFor(()=>assert.equal(signals.length,2));session(other);view.rerender(portal('/school-affairs/services/34-2',other));assert.ok(signals.every(signal=>signal.aborted));
  await act(async()=>releases.forEach(finish=>finish()));await waitFor(()=>assert.match(view.getByRole('status').textContent!,/無法確認/));assert.doesNotMatch(view.container.textContent!,/尚未有任何/);
});

const admin:NonNullable<AffairsSnapshot['admin']>={profiles:[],students:[{id:student,user_id:owner,student_number:'SYN-A',full_name:'Synthetic Alpha'},{id:otherStudent,user_id:other,student_number:'SYN-B',full_name:'Synthetic Beta'}],sections:[],enrollments:[],dtmCourses:[],assignments:[],charges:[],requests:[]};
test('manager opens explicitly with trusted caller and selected owner, preserving drafts and uncertain IDs when collapsed',async()=>{
  session(manager);const calls:{userId:string;signal:AbortSignal}[]=[],writes:{kind:string;payload:{id:string;user_id:string;request_id:string;expected_version:number;result:'unknown'|'empty'}}[]=[];
  let stored:DormitoryConductAdminRecord|null=null,loseResponse=true,refreshed=0;
  routedFetch=async(input,init)=>{assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+manager);const url=new URL(String(input),'http://localhost');
    if(url.pathname==='/api/affairs-manage'){
      const action=JSON.parse(String(init?.body));writes.push(action);assert.equal(action.kind,'save_dormitory_conduct');assert.equal(action.payload.user_id,owner);
      stored={id:action.payload.id,userId:owner,sourceMode:'local_demo',version:1,result:action.payload.result,createdAt:stamp,updatedAt:stamp};
      if(loseResponse){loseResponse=false;throw new Error('Uncertain synthetic response');}return Response.json({id:action.payload.id,kind:action.kind,version:1,summary:'Saved'});
    }
    assert.equal(url.pathname,'/api/affairs-data');assert.equal(url.searchParams.get('scope'),'dormitory-conduct-admin');const userId=url.searchParams.get('user_id')!;
    assert.ok([owner,other].includes(userId));calls.push({userId,signal:init?.signal as AbortSignal});return Response.json({record:userId===owner?stored:null});
  };
  const tree=(authId:string|null=manager,loading=false)=><AffairsContext.Provider value={{user:authId?{id:authId} as User:null,loading,error:''}}><SchoolRecordManager admin={admin} busy={false} onManage={async()=>{throw new Error('Dorm must not use generic dispatch.');}} onRefresh={()=>{refreshed++;}}/></AffairsContext.Provider>;
  const view=render(tree());assert.equal(calls.length,0);fireEvent.click(view.getByRole('button',{name:'Manage dormitory conduct status'}));await waitFor(()=>assert.ok(view.getByRole('combobox',{name:'住宿獎懲狀態'})));assert.equal(calls[0].userId,owner);
  fireEvent.change(view.getByRole('combobox',{name:'住宿獎懲狀態'}),{target:{value:'empty'}});
  fireEvent.click(view.getByRole('button',{name:'Hide dormitory conduct status'}));assert.equal(view.queryByRole('combobox',{name:'住宿獎懲狀態'}),null);
  fireEvent.click(view.getByRole('button',{name:'Manage dormitory conduct status'}));assert.equal((view.getByRole('combobox',{name:'住宿獎懲狀態'}) as HTMLSelectElement).value,'empty');assert.equal(calls.length,1);
  fireEvent.click(view.getByRole('button',{name:'儲存住宿獎懲狀態'}));await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(writes.length,1);
  fireEvent.click(view.getByRole('button',{name:'Hide dormitory conduct status'}));fireEvent.click(view.getByRole('button',{name:'Manage dormitory conduct status'}));assert.equal(calls.length,1);
  fireEvent.click(view.getByRole('button',{name:'儲存住宿獎懲狀態'}));await waitFor(()=>assert.equal(refreshed,1));assert.deepEqual(writes[0],writes[1]);assert.equal(writes[0].payload.expected_version,0);
  fireEvent.change(view.getByLabelText('Student account'),{target:{value:otherStudent}});await waitFor(()=>assert.equal(calls.at(-1)?.userId,other));assert.ok(calls.filter(call=>call.userId===owner).every(call=>call.signal.aborted));
  assert.equal((view.getByRole('combobox',{name:'住宿獎懲狀態'}) as HTMLSelectElement).value,'unknown');view.rerender(tree(manager,true));assert.equal(view.queryByRole('region',{name:'Selected student dormitory conduct maintenance'}),null);
  view.rerender(tree(null));assert.equal(view.queryByRole('region',{name:'Selected student dormitory conduct maintenance'}),null);
});

test('busy host cannot open maintenance and a selected-owner change while hidden requires explicit reopening',async()=>{
  session(manager);const calls:string[]=[];routedFetch=async input=>{const url=new URL(String(input),'http://localhost');assert.equal(url.searchParams.get('scope'),'dormitory-conduct-admin');calls.push(url.searchParams.get('user_id')!);return Response.json({record:null});};
  const tree=(busy:boolean)=><AffairsContext.Provider value={{user:{id:manager} as User,loading:false,error:''}}><SchoolRecordManager admin={admin} busy={busy} onManage={async()=>false}/></AffairsContext.Provider>;
  const view=render(tree(true));assert.equal((view.getByRole('button',{name:'Manage dormitory conduct status'}) as HTMLButtonElement).disabled,true);fireEvent.click(view.getByRole('button',{name:'Manage dormitory conduct status'}));assert.equal(calls.length,0);
  view.rerender(tree(false));fireEvent.click(view.getByRole('button',{name:'Manage dormitory conduct status'}));await waitFor(()=>assert.ok(view.getByRole('combobox',{name:'住宿獎懲狀態'})));
  fireEvent.change(view.getByRole('combobox',{name:'住宿獎懲狀態'}),{target:{value:'empty'}});fireEvent.click(view.getByRole('button',{name:'Hide dormitory conduct status'}));
  fireEvent.change(view.getByLabelText('Student account'),{target:{value:otherStudent}});await act(async()=>{});assert.deepEqual(calls,[owner]);
  fireEvent.click(view.getByRole('button',{name:'Manage dormitory conduct status'}));await waitFor(()=>assert.deepEqual(calls,[owner,other]));assert.equal((view.getByRole('combobox',{name:'住宿獎懲狀態'}) as HTMLSelectElement).value,'unknown');
});
