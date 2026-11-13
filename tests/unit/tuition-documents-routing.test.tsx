import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter,useLocation} from 'react-router';
import type {User} from '@supabase/supabase-js';
import type {AffairsSnapshot} from '../../src/services/schoolAffairsWorkspace';
import type {TuitionDocumentsAdminRecords} from '../../src/services/tuitionDocumentsClient';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',manager='10000000-0000-4000-8000-000000000003';
const student='20000000-0000-4000-8000-000000000001',otherStudent='20000000-0000-4000-8000-000000000002',record='30000000-0000-4000-8000-000000000001';
const stamp='2026-01-01T00:00:00Z';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','localStorage'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const globals=globalThis as typeof globalThis&{__tuitionRoutingSession?:{data:{session:{user:{id:string};access_token:string}|null};error:null}};
const hook=registerHooks({load(url,context,next){
  if(/\/affairs\/authClient\.ts$/.test(url))return {format:'module',shortCircuit:true,source:'export const affairsClient={auth:{getSession:async()=>globalThis.__tuitionRoutingSession}};'};
  if(/\/public\/PublicAssistant\.tsx$/.test(url))return {format:'module',shortCircuit:true,source:'export const campusAssistantOpenEvent="synthetic-campus-assistant-open";'};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};
  return next(url,context);
}});
const originalFetch=globalThis.fetch;
const unexpected:typeof fetch=async()=>{throw new Error('Unexpected network request in offline tuition routing test.');};
let routedFetch:typeof fetch=unexpected;
globalThis.fetch=(...args)=>routedFetch(...args);
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
const {default:SchoolAffairsPortal}=await import('../../src/features/public/affairs/SchoolAffairsPortal');
const {SchoolRecordManager}=await import('../../src/features/public/affairs/SchoolRecordManager');
const {AffairsContext}=await import('../../src/features/public/affairs/authContext');
afterEach(()=>{cleanup();routedFetch=unexpected;delete globals.__tuitionRoutingSession;dom.window.localStorage.clear();});
after(()=>{globalThis.fetch=originalFetch;hook.deregister();dom.window.close();});
const session=(id:string)=>{globals.__tuitionRoutingSession={data:{session:{user:{id},access_token:'synthetic-'+id}},error:null};};
const empty=():TuitionDocumentsAdminRecords=>({periods:[],settlements:[],documents:[],documentMetadata:[]});
function Path(){return <output aria-label="Current route">{useLocation().pathname}</output>;}
const portal=(path:string,userId=owner)=><MemoryRouter initialEntries={[path]}><SchoolAffairsPortal user={{id:userId,email:'synthetic@example.invalid'} as User}/><Path/></MemoryRouter>;

test('all four tuition destinations mount native views with only the caller-scoped loader, including a trailing slash',async()=>{
  session(owner);const calls:string[]=[];
  routedFetch=async(input,init)=>{calls.push(String(input));assert.equal(String(input),'/api/affairs-data?scope=tuition-documents');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+owner);return Response.json({periods:[],settlements:[],documents:[]});};
  for(const [path,title] of [['48-1','暑修生選課清單暨繳費收據'],['48-2','Index'],['48-3','進修部學分學雜費結算繳費單'],['49-1/','學分學雜費結算差額明細查詢']]){
    const view=render(portal('/school-affairs/services/'+path));
    await waitFor(()=>assert.equal(view.getByRole('main').getAttribute('aria-busy'),'false'));
    assert.ok(view.container.querySelector('.tuition-documents'));assert.equal(view.container.querySelector('.affairs-portal'),null);
    assert.match(view.getByRole('heading',{level:1}).textContent??'',new RegExp(title));
    if(path==='48-1'||path==='48-3')assert.equal((view.container.querySelector('.tuition-print-button') as HTMLButtonElement).disabled,true);
    assert.equal(view.container.querySelector('a[download],iframe,object'),null);view.unmount();
  }
  assert.equal(calls.length,4);
});

test('the observed extended index links navigate to the native settlement and keep explicit query behavior',async()=>{
  session(owner);let reads=0;
  routedFetch=async(input)=>{assert.equal(String(input),'/api/affairs-data?scope=tuition-documents');reads++;return Response.json({periods:[{id:record,userId:owner,label:'Synthetic selection'}],settlements:[{id:record,userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,periodId:record,periodLabel:'Synthetic selection',text:null,rowOrder:0}],documents:[]});};
  const view=render(portal('/school-affairs/services/48-2'));await waitFor(()=>assert.equal(reads,1));
  fireEvent.click(view.getByRole('link',{name:'學分學雜費結算差額明細查詢'}));
  await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/49-1'));
  await waitFor(()=>assert.ok(view.getByRole('option',{name:'Synthetic selection'})));
  assert.equal(view.queryByRole('region',{name:'站內結算紀錄'}),null);assert.equal(reads,2);
  fireEvent.change(view.getByRole('combobox'),{target:{value:record}});fireEvent.submit(view.getByRole('combobox').closest('form')!);
  await waitFor(()=>assert.equal(view.getByRole('region',{name:'站內結算紀錄'}).textContent,'—'));assert.equal(reads,3);
});

test('route account changes abort the old HTTP load and never show its late student records',async()=>{
  session(owner);let release:()=>void=()=>{},oldSignal:AbortSignal|null=null;
  routedFetch=async(input,init)=>{
    assert.equal(String(input),'/api/affairs-data?scope=tuition-documents');
    if(new Headers(init?.headers).get('Authorization')==='Bearer synthetic-'+owner){oldSignal=init?.signal as AbortSignal;await new Promise<void>(resolve=>{release=resolve;});return Response.json({periods:[{id:record,userId:owner,label:'Synthetic old account'}],settlements:[{id:record,userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,periodId:record,periodLabel:'Synthetic old account',text:'Old account value',rowOrder:0}],documents:[]});}
    return Response.json({periods:[],settlements:[],documents:[]});
  };
  const view=render(portal('/school-affairs/services/49-1'));await waitFor(()=>assert.ok(oldSignal));session(other);
  view.rerender(portal('/school-affairs/services/49-1',other));assert.equal((oldSignal as unknown as AbortSignal).aborted,true);
  await act(async()=>release());await waitFor(()=>assert.ok(view.getByRole('option',{name:'無對應資料'})));
  assert.doesNotMatch(view.container.textContent??'',/Synthetic old account|Old account value/);
});

test('record manager opens tuition explicitly, writes the selected account with the trusted manager session, and aborts on selection changes',async()=>{
  session(manager);const calls:{userId:string;signal:AbortSignal}[]=[],writes:Record<string,unknown>[]=[];
  const records=new Map([[owner,empty()],[other,empty()]]);
  routedFetch=async(input,init)=>{
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+manager);
    const url=new URL(String(input),'http://localhost');
    if(url.pathname==='/api/affairs-manage'){
      const action=JSON.parse(String(init?.body));assert.equal(action.kind,'save_tuition_settlement');writes.push(action.payload);
      const p=action.payload;records.set(p.user_id,{periods:[{id:p.id,userId:p.user_id,label:p.period_label}],settlements:[{id:p.id,userId:p.user_id,periodId:p.id,periodLabel:p.period_label,text:p.statement_text,rowOrder:p.row_order,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp}],documents:[],documentMetadata:[]});
      return Response.json({id:p.id,kind:action.kind,version:1,summary:'Saved local record.'});
    }
    assert.equal(url.pathname,'/api/affairs-data');assert.equal(url.searchParams.get('scope'),'tuition-documents-admin');
    const userId=url.searchParams.get('user_id')!;assert.ok(records.has(userId));calls.push({userId,signal:init?.signal as AbortSignal});return Response.json(records.get(userId));
  };
  const admin:NonNullable<AffairsSnapshot['admin']>={profiles:[],students:[{id:student,user_id:owner,student_number:'SYN-A',full_name:'Synthetic Alpha'},{id:otherStudent,user_id:other,student_number:'SYN-B',full_name:'Synthetic Beta'}],sections:[],enrollments:[],dtmCourses:[],assignments:[],charges:[],requests:[]};
  let saved=0;
  const tree=(authId:string|null=manager)=><AffairsContext.Provider value={{user:authId?{id:authId} as User:null,loading:false,error:''}}><SchoolRecordManager admin={admin} busy={false} onManage={async()=>{throw new Error('Tuition must not use generic manager dispatch.');}} onRefresh={()=>{saved++;}}/></AffairsContext.Provider>;
  const view=render(tree());assert.equal(calls.length,0);fireEvent.click(view.getByRole('button',{name:'Manage tuition statements'}));
  await waitFor(()=>assert.ok(view.getByLabelText('Period label')));assert.deepEqual(calls.map(call=>call.userId),[owner]);
  fireEvent.change(view.getByLabelText('Period label'),{target:{value:'Synthetic selected account'}});fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));
  await waitFor(()=>assert.equal(saved,1));assert.equal(writes[0].user_id,owner);assert.equal(writes[0].expected_version,0);assert.equal(writes[0].statement_text,null);
  fireEvent.change(view.getByLabelText('Student account'),{target:{value:otherStudent}});
  await waitFor(()=>assert.equal(calls.at(-1)?.userId,other));assert.ok(calls.filter(call=>call.userId===owner).every(call=>call.signal.aborted));
  assert.equal(view.queryByText(/Synthetic selected account/),null);view.rerender(tree(null));assert.equal(view.queryByRole('region',{name:'Selected student tuition maintenance'}),null);
});
