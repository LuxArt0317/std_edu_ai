import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter} from 'react-router';
import type {User} from '@supabase/supabase-js';
import type {LearningSupportRow} from '../../server/learningSupport.js';

const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',manager='10000000-0000-4000-8000-000000000003';
const id='27000000-0000-4000-8000-000000000001',stamp='2026-11-15T08:50:00.000001+00:00';
const path='/school-affairs/services/27-1';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window&typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLTextAreaElement','HTMLSelectElement','Node','NodeFilter','Event','CustomEvent','FormData','MouseEvent','MutationObserver','getComputedStyle','localStorage','sessionStorage','navigator'])Object.defineProperty(globalThis,name,{
  value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true,
});
Object.defineProperty(dom.window.HTMLElement.prototype,'scrollTo',{value:()=>{},configurable:true});
const globals=globalThis as typeof globalThis&{__learningSupportTest?:{data:{session:{user:{id:string};access_token:string}|null};error:null}};
const hook=registerHooks({load(url,context,next){
  if(/\/affairs\/authClient\.ts$/.test(url))return {format:'module',shortCircuit:true,source:'export const affairsClient={auth:{getSession:async()=>globalThis.__learningSupportTest}};'};
  if(/\/affairs\/authContext\.ts$/.test(url))return {format:'module',shortCircuit:true,source:'export const useAffairsAuth=()=>({user:globalThis.__learningSupportTest?.data.session?.user,loading:false});'};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};return next(url,context);
}});
const initialFetch=globalThis.fetch,noFetch:typeof fetch=async()=>{throw new Error('Unexpected network request.');};
let routedFetch=noFetch;
globalThis.fetch=(...args)=>routedFetch(...args);
const {render,cleanup,fireEvent,waitFor}=await import('@testing-library/react');
const {default:Portal}=await import('../../src/features/public/affairs/SchoolAffairsPortal');
const {PublicAssistant}=await import('../../src/features/public/PublicAssistant');
afterEach(()=>{cleanup();routedFetch=noFetch;delete globals.__learningSupportTest;dom.window.localStorage.clear();dom.window.sessionStorage.clear();});
after(()=>{globalThis.fetch=initialFetch;hook.deregister();dom.window.close();});
const session=(id:string)=>{globals.__learningSupportTest={data:{session:{user:{id},access_token:'synthetic-'+id}},error:null};};
const portal=(pathname:string,userId:string)=><MemoryRouter initialEntries={[pathname]}><Portal user={{id:userId,email:'synthetic@example.invalid'} as User}/></MemoryRouter>;
const row:LearningSupportRow={id,ownerId:a,topic:'Prepare a reading schedule',details:'Plan weekly reading milestones',status:'submitted',
  reviewNote:'',version:1,submittedAt:stamp,updatedAt:stamp};
const saved=(userId:string,rows:LearningSupportRow[],canReview=false,view='mine')=>Response.json({userId,canReview,view,page:1,total:rows.length,rows});

test('27-1 displays the real local intake, keeps the notes link, and uses the exact same command after a lost submit response',async()=>{
  session(a);
  const writes:Array<{kind:string;payload:{request_id:string;topic?:string;details?:string;id?:string;expected_version?:number}}>=[];
  let rows:LearningSupportRow[]=[],reads=0;
  routedFetch=async(target,init)=>{
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+a);
    if(String(target)==='/api/affairs-data?scope=learning-support&page=1'){reads++;return saved(a,rows);}
    assert.equal(String(target),'/api/affairs-action');
    const action=JSON.parse(String(init?.body));writes.push(action);
    if(action.kind==='submit_learning_support'){
      rows=[row];
      if(writes.length===1)return Response.json({error:'Synthetic lost response'},{status:503});
      return Response.json({id,version:1,status:'submitted',requestId:action.payload.request_id});
    }
    assert.equal(action.kind,'withdraw_learning_support');
    rows=[{...row,status:'withdrawn',version:2}];
    return Response.json({id,version:2,status:'withdrawn',requestId:action.payload.request_id});
  };
  const view=render(portal(path,a));
  await waitFor(()=>assert.ok(view.getByRole('textbox',{name:/Topic/})));
  assert.equal(view.getByRole('link',{name:/Tracking notes/}).getAttribute('href'),path+'/notes');
  assert.equal(view.queryByRole('link',{name:/Review requests/}),null);
  fireEvent.change(view.getByRole('textbox',{name:/Topic/}),{target:{value:row.topic}});
  fireEvent.change(view.getByRole('textbox',{name:/Support needed/}),{target:{value:row.details}});
  fireEvent.click(view.getByRole('button',{name:/Review submission/}));
  assert.ok(view.getByRole('dialog'));assert.equal(writes.length,0);
  fireEvent.click(view.getByRole('button',{name:/Confirm$/}));
  await waitFor(()=>assert.match(view.getByRole('alert').textContent??'',/Synthetic lost response/u));
  fireEvent.click(view.getByRole('button',{name:/Refresh requests/}));
  await waitFor(()=>assert.ok(view.getByRole('cell',{name:/Submitted/})));
  assert.equal(view.queryByRole('dialog'),null);
  assert.equal(reads,2);
  assert.equal(writes.length,1);
  assert.equal((view.getByRole('button',{name:/Review submission/}) as HTMLButtonElement).disabled,true);
  assert.equal((view.getByRole('button',{name:/Withdraw/}) as HTMLButtonElement).disabled,true);
  fireEvent.click(view.getByRole('button',{name:/Resume confirmation/}));
  fireEvent.click(view.getByRole('button',{name:/Retry$/}));
  await waitFor(()=>assert.equal(view.queryByRole('button',{name:/Resume confirmation/}),null));
  await waitFor(()=>assert.equal((view.getByRole('button',{name:/Withdraw/}) as HTMLButtonElement).disabled,false));
  assert.deepEqual(writes[0],writes[1]);
  assert.equal(writes[0].payload.topic,row.topic);
  assert.equal(writes[0].payload.details,row.details);
  fireEvent.click(view.getByRole('button',{name:/Withdraw/}));
  assert.equal(writes.length,2);
  fireEvent.click(view.getByRole('button',{name:/Confirm$/}));
  await waitFor(()=>assert.ok(view.getByRole('cell',{name:/Withdrawn/})));
  assert.equal(writes[2].payload.id,id);assert.equal(writes[2].payload.expected_version,1);
});

test('the review page uses the staff queue and matching versions, and a non-staff account cannot see the queue',async()=>{
  session(manager);
  const requests:Array<{status:string;expected_version:number;note:string}>=[];
  let current=row;
  routedFetch=async(target,init)=>{
    const caller=new Headers(init?.headers).get('Authorization');
    const requestPath=String(target);
    if(caller==='Bearer synthetic-'+b){
      assert.equal(requestPath,'/api/affairs-data?scope=learning-support-review&page=1');
      return Response.json({error:'Review access denied'},{status:403});
    }
    assert.equal(caller,'Bearer synthetic-'+manager);
    if(requestPath==='/api/affairs-data?scope=learning-support-review&page=1')return saved(manager,[current],true,'review');
    assert.equal(requestPath,'/api/affairs-manage');
    const {kind,payload}=JSON.parse(String(init?.body));
    assert.equal(kind,'review_learning_support');assert.equal(payload.id,id);
    requests.push(payload);
    current={...current,status:payload.status,version:payload.expected_version+1,reviewNote:payload.note};
    return Response.json({id,version:current.version,status:current.status,requestId:payload.request_id});
  };
  const view=render(portal(path+'/review',manager));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:/Start review/})));
  fireEvent.click(view.getByRole('button',{name:/Start review/}));
  fireEvent.change(view.getByRole('textbox',{name:/Review note/}),{target:{value:'In-app intake reviewed'}});
  assert.equal(requests.length,0);
  fireEvent.click(view.getByRole('button',{name:/Confirm$/}));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:/Complete review/})));
  fireEvent.click(view.getByRole('button',{name:/Complete review/}));
  fireEvent.click(view.getByRole('button',{name:/Confirm$/}));
  await waitFor(()=>assert.ok(view.getByRole('cell',{name:/Site review complete/})));
  assert.deepEqual(requests.map(({status,expected_version,note})=>[status,expected_version,note]),[
    ['in_review',1,'In-app intake reviewed'],['reviewed',2,'In-app intake reviewed'],
  ]);
  session(b);view.rerender(portal(path+'/review',b));
  await waitFor(()=>assert.match(view.getByRole('alert').textContent??'',/Review access denied/u));
  assert.equal(view.queryByText(row.topic),null);
  assert.equal(view.queryByRole('button',{name:/Complete review/}),null);
});

test('the actual chatbot waits for confirmation and retries the exact native withdrawal command',async()=>{
  session(a);
  const requests:unknown[]=[];
  const requestId='27500000-0000-4000-8000-000000000005';
  routedFetch=async(target,init)=>{
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+a);
    if(String(target).startsWith('/api/affairs-conversations')){
      if(init?.method==='GET')return Response.json({conversations:[]});
      const session=JSON.parse(String(init?.body));
      assert.doesNotMatch(JSON.stringify(session.messages),/expected_version|proposedAction|27500000/u);
      return Response.json({...session,version:1,updatedAt:stamp});
    }
    if(String(target)==='/api/affairs-assistant'){
      assert.match(JSON.parse(String(init?.body)).question,/withdraw my learning support/u);
      return Response.json({status:'answered',answer:'Confirm to withdraw your saved learning support request.',citations:[],suggestedQuestions:[],
        proposedAction:{kind:'withdraw_learning_support',label:'Withdraw learning support request',requestId,payload:{id,expected_version:'1'},url:path}});
    }
    assert.equal(String(target),'/api/affairs-action');
    requests.push(JSON.parse(String(init?.body)));
    return requests.length===1?Response.json({error:'Synthetic lost withdrawal receipt'},{status:503})
      :Response.json({id,version:2,status:'withdrawn',requestId});
  };
  const view=render(<MemoryRouter><PublicAssistant initialOpen /></MemoryRouter>);
  await waitFor(()=>assert.equal((view.getByRole('textbox',{name:/Your question/}) as HTMLTextAreaElement).disabled,false));
  fireEvent.change(view.getByRole('textbox',{name:/Your question/}),{target:{value:'withdraw my learning support request'}});
  fireEvent.click(view.getByRole('button',{name:'Send'}));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'Confirm action'})));
  assert.deepEqual(requests,[]);
  fireEvent.click(view.getByRole('button',{name:'Confirm action'}));
  await waitFor(()=>assert.match(view.getByRole('alert').textContent??'',/Synthetic lost withdrawal receipt/u));
  fireEvent.click(view.getByRole('button',{name:'Confirm action'}));
  const receiptLink=await view.findByRole('link',{name:'View updated records'});
  assert.match(receiptLink.parentElement?.textContent??'',/Withdrew your learning support request/u);
  assert.equal(receiptLink.getAttribute('href'),path);
  assert.deepEqual(requests,Array.from({length:2},()=>({kind:'withdraw_learning_support',payload:{id,expected_version:1,request_id:requestId}})));
  assert.equal(view.queryByRole('button',{name:'Confirm action'}),null);
});
