import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter,useLocation} from 'react-router';
import type {User} from '@supabase/supabase-js';
import type {AffairsSnapshot} from '../../src/services/schoolAffairsWorkspace';
import type {StudentConductRecord} from '../../src/services/studentConduct';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',manager='10000000-0000-4000-8000-000000000003';
const student='20000000-0000-4000-8000-000000000001',otherStudent='20000000-0000-4000-8000-000000000002',record='30000000-0000-4000-8000-000000000001';
const stamp='2026-01-01T00:00:00Z';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','localStorage'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const globals=globalThis as typeof globalThis&{__conductRoutingSession?:{data:{session:{user:{id:string};access_token:string}|null};error:null}};
const hook=registerHooks({load(url,context,next){
  if(/\/affairs\/authClient\.ts$/.test(url))return {format:'module',shortCircuit:true,source:'export const affairsClient={auth:{getSession:async()=>globalThis.__conductRoutingSession}};'};
  if(/\/public\/PublicAssistant\.tsx$/.test(url))return {format:'module',shortCircuit:true,source:'export const campusAssistantOpenEvent="synthetic-campus-assistant-open";'};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};
  return next(url,context);
}});
const originalFetch=globalThis.fetch;
const unexpected:typeof fetch=async()=>{throw new Error('Unexpected network request in offline conduct routing test.');};
let routedFetch:typeof fetch=unexpected;
globalThis.fetch=(...args)=>routedFetch(...args);
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
const {default:SchoolAffairsPortal}=await import('../../src/features/public/affairs/SchoolAffairsPortal');
const {SchoolRecordManager}=await import('../../src/features/public/affairs/SchoolRecordManager');
const {AffairsContext}=await import('../../src/features/public/affairs/authContext');
afterEach(()=>{cleanup();routedFetch=unexpected;delete globals.__conductRoutingSession;dom.window.localStorage.clear();});
after(()=>{globalThis.fetch=originalFetch;hook.deregister();dom.window.close();});
const session=(id:string)=>{globals.__conductRoutingSession={data:{session:{user:{id},access_token:'synthetic-'+id}},error:null};};
function Path(){return <output aria-label="Current route">{useLocation().pathname}</output>;}
const portal=(path:string,userId=owner)=><MemoryRouter initialEntries={[path]}><SchoolAffairsPortal user={{id:userId,email:'synthetic@example.invalid'} as User}/><Path/></MemoryRouter>;

const identity=(userId:string)=>({profile:{userId},student:{studentNumber:userId===owner?'CALLER-A':'CALLER-B',fullName:userId===owner?'Synthetic Caller A':'Synthetic Caller B'}});
const conductRow=(userId=owner):StudentConductRecord=>({id:record,userId,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,rowOrder:0,
  occurredOnText:null,studentNumber:'LITERAL-ROW',studentName:'Literal record name',academicYearText:'001',semesterText:'',yearLevelText:null,
  reasonText:'Synthetic saved conduct',conductCode:null,conductName:'Synthetic literal name',quantityText:'0',voidStatusText:''});

test('38-1 mounts the native report, independently loads verified caller identity, and keeps document actions unavailable',async()=>{
  session(owner);const calls:string[]=[];
  routedFetch=async(input,init)=>{const path=String(input);calls.push(path);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+owner);
    if(path==='/api/affairs-data')return Response.json(identity(owner));assert.equal(path,'/api/affairs-data?scope=student-conduct');return Response.json({records:[conductRow()]});};
  const view=render(portal('/school-affairs/services/38-1/'));
  await waitFor(()=>assert.equal(view.container.querySelectorAll('tbody tr').length,1));
  assert.equal(view.container.querySelector('.affairs-portal'),null);assert.equal(view.container.querySelectorAll('thead th').length,12);
  assert.equal((view.getByRole('textbox',{name:'學號'}) as HTMLInputElement).value,'CALLER-A');
  assert.equal((view.getByRole('textbox',{name:'姓名'}) as HTMLInputElement).value,'Synthetic Caller A');
  assert.ok(view.getByRole('cell',{name:'LITERAL-ROW'}));assert.ok(view.getByRole('cell',{name:'0',exact:true}));
  assert.deepEqual(calls.sort(),['/api/affairs-data','/api/affairs-data?scope=student-conduct']);
  assert.equal((view.getByRole('button',{name:'下載獎懲紀錄表（stu.best 站內文件）'}) as HTMLButtonElement).disabled,true);
  assert.equal((view.getByRole('button',{name:'檢視第 1 筆站內獎懲明細'}) as HTMLButtonElement).disabled,true);
  assert.equal(view.container.querySelector('a[download],iframe,object'),null);
});

test('identity failures suppress row history and retry both owned sources without substituting a row identity',async()=>{
  session(owner);let identityReads=0,conductReads=0;
  routedFetch=async(input)=>{if(String(input)==='/api/affairs-data'){identityReads++;return identityReads===1?Response.json({error:'Synthetic identity unavailable'},{status:503}):Response.json(identity(owner));}
    assert.equal(String(input),'/api/affairs-data?scope=student-conduct');conductReads++;return Response.json({records:[conductRow()]});};
  const view=render(portal('/school-affairs/services/38-1'));await waitFor(()=>assert.ok(view.getByRole('alert')));
  assert.equal(view.container.querySelectorAll('tbody tr').length,0);assert.equal((view.getByRole('textbox',{name:'學號'}) as HTMLInputElement).value,'');
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));await waitFor(()=>assert.equal(view.container.querySelectorAll('tbody tr').length,1));
  assert.equal(identityReads,2);assert.equal(conductReads,2);assert.equal((view.getByRole('textbox',{name:'學號'}) as HTMLInputElement).value,'CALLER-A');
});

test('route account changes abort both old reads and discard late identity and conduct data',async()=>{
  session(owner);const signals:AbortSignal[]=[],releases:(()=>void)[]=[];
  routedFetch=async(input,init)=>{const path=String(input),first=new Headers(init?.headers).get('Authorization')==='Bearer synthetic-'+owner;
    if(first){signals.push(init?.signal as AbortSignal);await new Promise<void>(resolve=>releases.push(resolve));}
    if(path==='/api/affairs-data')return Response.json(identity(first?owner:other));
    assert.equal(path,'/api/affairs-data?scope=student-conduct');return Response.json({records:first?[conductRow()]:[]});};
  const view=render(portal('/school-affairs/services/38-1'));await waitFor(()=>assert.equal(signals.length,2));session(other);
  view.rerender(portal('/school-affairs/services/38-1',other));assert.ok(signals.every(signal=>signal.aborted));
  await act(async()=>releases.forEach(finish=>finish()));await waitFor(()=>assert.equal((view.getByRole('textbox',{name:'學號'}) as HTMLInputElement).value,'CALLER-B'));
  assert.doesNotMatch(view.container.textContent??'',/Synthetic saved conduct|Literal record name/);assert.equal(view.container.querySelectorAll('tbody tr').length,0);
});

test('record management sends the selected account with the trusted manager session and clears drafts on account change',async()=>{
  session(manager);const calls:{userId:string;signal:AbortSignal}[]=[],writes:Record<string,unknown>[]=[];
  const records=new Map<string,StudentConductRecord[]>([[owner,[]],[other,[]]]);
  routedFetch=async(input,init)=>{
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+manager);const url=new URL(String(input),'http://localhost');
    if(url.pathname==='/api/affairs-manage'){
      const action=JSON.parse(String(init?.body));assert.equal(action.kind,'save_student_conduct');const p=action.payload;writes.push(p);
      records.set(p.user_id,[{...conductRow(p.user_id),id:p.id,reasonText:p.reason_text}]);
      return Response.json({id:p.id,kind:action.kind,version:1,summary:'Saved local record.'});
    }
    assert.equal(url.pathname,'/api/affairs-data');assert.equal(url.searchParams.get('scope'),'student-conduct-admin');const userId=url.searchParams.get('user_id')!;
    assert.ok(records.has(userId));calls.push({userId,signal:init?.signal as AbortSignal});return Response.json({records:records.get(userId)});
  };
  const admin:NonNullable<AffairsSnapshot['admin']>={profiles:[],students:[{id:student,user_id:owner,student_number:'SYN-A',full_name:'Synthetic Alpha'},{id:otherStudent,user_id:other,student_number:'SYN-B',full_name:'Synthetic Beta'}],sections:[],enrollments:[],dtmCourses:[],assignments:[],charges:[],requests:[]};
  let saved=0;
  const tree=(authId:string|null=manager)=><AffairsContext.Provider value={{user:authId?{id:authId} as User:null,loading:false,error:''}}><SchoolRecordManager admin={admin} busy={false} onManage={async()=>{throw new Error('Conduct must not use generic manager dispatch.');}} onRefresh={()=>{saved++;}}/></AffairsContext.Provider>;
  const view=render(tree());assert.equal(calls.length,0);fireEvent.click(view.getByRole('button',{name:'Manage conduct records'}));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存獎懲紀錄'})));assert.deepEqual(calls.map(call=>call.userId),[owner]);
  fireEvent.click(view.getByRole('checkbox',{name:'事由未提供'}));fireEvent.change(view.getByRole('textbox',{name:'事由'}),{target:{value:'Synthetic selected conduct'}});
  fireEvent.click(view.getByRole('button',{name:'Hide conduct records'}));
  assert.equal(view.queryByRole('textbox',{name:'事由'}),null);assert.equal(writes.length,0);
  fireEvent.click(view.getByRole('button',{name:'Manage conduct records'}));
  assert.equal((view.getByRole('textbox',{name:'事由'}) as HTMLTextAreaElement).value,'Synthetic selected conduct');
  assert.equal(calls.length,1,'Collapsing and reopening must not remount or lose draft/retry state.');
  fireEvent.click(view.getByRole('button',{name:'儲存獎懲紀錄'}));await waitFor(()=>assert.equal(saved,1));
  assert.equal(writes[0].user_id,owner);assert.equal(writes[0].expected_version,0);assert.equal(writes[0].reason_text,'Synthetic selected conduct');
  fireEvent.change(view.getByLabelText('Student account'),{target:{value:otherStudent}});await waitFor(()=>assert.equal(calls.at(-1)?.userId,other));
  assert.ok(calls.filter(call=>call.userId===owner).every(call=>call.signal.aborted));assert.equal((view.getByRole('textbox',{name:'事由'}) as HTMLTextAreaElement).value,'');
  view.rerender(tree(null));assert.equal(view.queryByRole('region',{name:'Selected student conduct maintenance'}),null);
});
