import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {DormitoryConductClientError,type DormitoryConductClient,type DormitoryConductAction,type DormitoryConductAdminData,type DormitoryConductData,type DormitoryConductReceipt} from '../../src/services/dormitoryConductClient';
import type {DormitoryConductAdminRecord} from '../../src/services/dormitoryConduct';
import type {DormConductWorkspaceProps} from '../../src/features/public/affairs/DormConductWorkspace';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLSelectElement','HTMLButtonElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('/dormConduct.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {DormConductWorkspace}=await import('../../src/features/public/affairs/DormConductWorkspace');hook.deregister();
const {DormConductManager}=await import('../../src/features/public/affairs/DormConductManager');
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');afterEach(cleanup);after(()=>dom.window.close());
const manager='10000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00Z';
const record:DormitoryConductAdminRecord={id,userId:owner,sourceMode:'local_demo',version:2,createdAt:date,updatedAt:date,result:'unknown'};
const snapshot={userId:owner,sourceMode:'local_demo' as const,version:1,result:'empty' as const};
const disabled=(node:HTMLElement)=>node.matches(':disabled');
const tree=(client:Pick<DormitoryConductClient,'load'>,props:Partial<DormConductWorkspaceProps>={})=><DormConductWorkspace userId={owner} identity={{userId:owner}} onHome={()=>{}} client={client} {...props}/>;

test('workspace distinguishes missing metadata from explicit empty and forwards local navigation',async()=>{
  let homes=0;const view=render(tree({load:async()=>({snapshot:null})},{onHome:()=>{homes++;}}));assert.match(view.getByRole('status').textContent!,/正在載入/);
  await waitFor(()=>assert.match(view.getByRole('status').textContent!,/無法確認/));assert.doesNotMatch(view.container.textContent!,/尚未有任何/);
  fireEvent.click(view.getByRole('link',{name:'HomePage'}));assert.equal(homes,1);view.unmount();
  const empty=render(tree({load:async()=>({snapshot})}));await waitFor(()=>assert.match(empty.getByRole('status').textContent!,/尚未有任何/));assert.equal(empty.container.querySelector('table,form,iframe,object,a[download]'),null);
});

test('workspace rejects malformed/foreign snapshots, sanitizes failures and retries both independent reads',async()=>{
  let reads=0,identityReads=0;const client={load:async()=>{reads++;if(reads===1)throw new Error('PRIVATE PROVIDER');return {snapshot};}};
  const view=render(tree(client,{onReloadIdentity:()=>{identityReads++;}}));await waitFor(()=>assert.ok(view.getByRole('alert')));assert.doesNotMatch(view.container.textContent!,/PRIVATE|尚未有任何/);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));await waitFor(()=>assert.match(view.getByRole('status').textContent!,/尚未有任何/));assert.equal(identityReads,1);
  view.rerender(tree(client,{identity:null,identityLoading:true}));assert.match(view.getByRole('status').textContent!,/正在載入/);
  view.rerender(tree(client,{identity:null,identityError:'PRIVATE IDENTITY'}));assert.ok(view.getByRole('alert'));assert.doesNotMatch(view.container.textContent!,/PRIVATE|尚未有任何/);view.unmount();
  for(const bad of [{...snapshot,userId:other},{...snapshot,result:'recorded'},record]){const invalid=render(tree({load:async()=>({snapshot:bad}) as DormitoryConductData}));await waitFor(()=>assert.ok(invalid.getByRole('alert')));assert.doesNotMatch(invalid.container.textContent!,/尚未有任何/);invalid.unmount();}
});

test('account and client changes abort reads and immediately hide late or previously loaded results',async()=>{
  let complete:(value:DormitoryConductData)=>void=()=>{},signal:AbortSignal|undefined;
  const client={load:async(userId:string,input?:AbortSignal)=>{if(userId===other)return {snapshot:null};signal=input;return new Promise<DormitoryConductData>(resolve=>{complete=resolve;});}};
  const view=render(tree(client));await waitFor(()=>assert.ok(signal));view.rerender(tree(client,{userId:other,identity:{userId:other}}));assert.equal(signal?.aborted,true);
  await act(async()=>complete({snapshot}));await waitFor(()=>assert.match(view.getByRole('status').textContent!,/無法確認/));assert.doesNotMatch(view.container.textContent!,/尚未有任何/);view.unmount();
  const loaded={load:async()=>({snapshot})},pending={load:async()=>new Promise<DormitoryConductData>(()=>{})};const replacement=render(tree(loaded));await waitFor(()=>assert.match(replacement.getByRole('status').textContent!,/尚未有任何/));replacement.rerender(tree(pending));assert.match(replacement.getByRole('status').textContent!,/正在載入/);assert.doesNotMatch(replacement.container.textContent!,/尚未有任何/);
});

async function fixture(initial:DormitoryConductAdminData={record:null}){
  let data=structuredClone(initial),failRead=false,failAfterWrite=false,loseResponse=false,writeError:Error|null=null,savedCalls=0;
  const writes:DormitoryConductAction[]=[],receipts=new Map<string,{action:DormitoryConductAction;receipt:DormitoryConductReceipt}>();
  const client:Pick<DormitoryConductClient,'loadAdmin'|'manage'>={loadAdmin:async(caller,userId)=>{assert.equal(caller,manager);assert.equal(userId,owner);if(failRead){failRead=false;throw new DormitoryConductClientError('Synthetic read failed');}return structuredClone(data);},
    manage:async(caller,action)=>{assert.equal(caller,manager);assert.equal(action.payload.user_id,owner);writes.push(structuredClone(action));if(writeError){const reason=writeError;writeError=null;throw reason;}
      const prior=receipts.get(action.payload.request_id);if(prior){assert.deepEqual(prior.action,action);return prior.receipt;}
      assert.equal(data.record?.version??0,action.payload.expected_version);
      data={record:action.kind==='save_dormitory_conduct'?{...record,id:action.payload.id,version:action.payload.expected_version+1,result:action.payload.result}:null};
      const receipt={id:action.payload.id,kind:action.kind,version:action.payload.expected_version+1,summary:'Synthetic receipt'};receipts.set(action.payload.request_id,{action:structuredClone(action),receipt});
      if(failAfterWrite){failAfterWrite=false;failRead=true;}if(loseResponse){loseResponse=false;throw new DormitoryConductClientError('Synthetic response lost');}return receipt;
    }};
  const view=render(<DormConductManager managerId={manager} userId={owner} client={client} onSaved={()=>{savedCalls++;}}/>);await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存住宿獎懲狀態'})));
  return {view,client,writes,savedCalls:()=>savedCalls,data:()=>data,replace:(next:DormitoryConductAdminData)=>{data=next;},failWrite:(reason:Error)=>{writeError=reason;},loseResponse:()=>{loseResponse=true;},failReadAfterWrite:()=>{failAfterWrite=true;},failRead:()=>{failRead=true;}};
}
const select=(view:ReturnType<typeof render>,value:string)=>fireEvent.change(view.getByRole('combobox',{name:'住宿獎懲狀態'}),{target:{value}});
const value=(view:ReturnType<typeof render>)=>(view.getByRole('combobox',{name:'住宿獎懲狀態'}) as HTMLSelectElement).value;
const save=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'儲存住宿獎懲狀態'}));
const saved=(view:ReturnType<typeof render>)=>waitFor(()=>assert.ok(view.getByText('已儲存站內住宿獎懲狀態。')));
const refresh=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'重新載入住宿獎懲狀態'}));
const discard=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'放棄草稿並重新載入'}));
const remove=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'確認刪除住宿獎懲狀態'}));

test('manager exposes no form before authorized own-selected load or after malformed/denied data',async()=>{
  for(const loadAdmin of [async()=>{throw new DormitoryConductClientError('Denied',403);},async()=>({record:{...record,userId:other}}),async()=>({record:{...record,result:'recorded'}} as unknown as DormitoryConductAdminData)]){
    const view=render(<DormConductManager managerId={manager} userId={owner} client={{loadAdmin,manage:async()=>{throw new Error('No writes');}}}/>);assert.equal(view.container.querySelector('form'),null);
    await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(view.container.querySelector('form'),null);view.unmount();
  }
});

test('manager saves only explicit singleton states and deletes without reusing tombstoned IDs',async()=>{
  const f=await fixture(),{view}=f;assert.equal(value(view),'unknown');assert.match(view.getByLabelText('已儲存住宿獎懲狀態').textContent!,/未知/);
  assert.deepEqual([...view.getByRole('combobox').querySelectorAll('option')].map(node=>node.value),['unknown','empty']);
  select(view,'empty');save(view);await saved(view);assert.equal(f.data().record?.result,'empty');assert.equal(f.writes[0].payload.expected_version,0);
  assert.deepEqual(Object.keys(f.writes[0].payload).sort(),['expected_version','id','request_id','result','user_id']);
  select(view,'unknown');save(view);await saved(view);assert.equal(f.data().record?.result,'unknown');assert.equal(f.writes[1].payload.expected_version,1);
  fireEvent.click(view.getByText('刪除此站內狀態'));remove(view);await waitFor(()=>assert.ok(view.getByText('已刪除站內住宿獎懲狀態；原識別碼仍保留。')));assert.equal(f.data().record,null);
  save(view);await saved(view);assert.notEqual(f.writes[3].payload.id,f.writes[0].payload.id);assert.equal(f.writes[3].payload.expected_version,0);
  assert.equal(view.container.querySelector('table,textarea,input[type="file"],a[download]'),null);assert.equal(f.savedCalls(),4);
});

test('lost committed create/delete responses retain exact request identities through refresh and failed reads',async()=>{
  const f=await fixture(),{view}=f;select(view,'empty');f.loseResponse();save(view);await waitFor(()=>assert.ok(view.getByText('Synthetic response lost')));
  assert.equal(f.data().record?.version,1);assert.equal(disabled(view.getByRole('combobox')),true);f.failRead();refresh(view);await waitFor(()=>assert.ok(view.getByText('Synthetic read failed')));
  refresh(view);await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存住宿獎懲狀態'})),false));save(view);await saved(view);assert.deepEqual(f.writes[0],f.writes[1]);assert.equal(f.data().record?.version,1);
  fireEvent.click(view.getByText('刪除此站內狀態'));f.loseResponse();remove(view);await waitFor(()=>assert.ok(view.getByText('Synthetic response lost')));refresh(view);
  await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'確認刪除住宿獎懲狀態'})),false));assert.equal(disabled(view.getByRole('button',{name:'儲存住宿獎懲狀態'})),true);remove(view);
  await waitFor(()=>assert.ok(view.getByText('已刪除站內住宿獎懲狀態；原識別碼仍保留。')));assert.deepEqual(f.writes[2],f.writes[3]);assert.equal(f.data().record,null);
});

test('409 requires refresh, retains selection, adopts current version and prevents deletion of dirty drafts',async()=>{
  const f=await fixture({record}),{view}=f;select(view,'empty');fireEvent.click(view.getByText('刪除此站內狀態'));assert.equal(disabled(view.getByRole('button',{name:'確認刪除住宿獎懲狀態'})),true);
  f.replace({record:{...record,version:4}});f.failWrite(new DormitoryConductClientError('Conflict',409));save(view);await waitFor(()=>assert.ok(view.getByText('Conflict')));fireEvent.submit(view.container.querySelector('form')!);assert.equal(f.writes.length,1);
  refresh(view);await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存住宿獎懲狀態'})),false));assert.equal(value(view),'empty');save(view);await saved(view);
  assert.equal(f.writes[1].payload.expected_version,4);assert.notEqual(f.writes[0].payload.request_id,f.writes[1].payload.request_id);
});

test('singleton replacement or deletion requires explicit discard and never silently targets another record',async()=>{
  const f=await fixture(),{view}=f;select(view,'empty');f.replace({record});f.failWrite(new DormitoryConductClientError('Collision',409));save(view);await waitFor(()=>assert.ok(view.getByText('Collision')));refresh(view);
  await waitFor(()=>assert.ok(view.getByText('此帳戶已有另一筆站內資料；請放棄草稿後載入該筆資料。')));assert.equal(value(view),'empty');assert.equal(disabled(view.getByRole('button',{name:'儲存住宿獎懲狀態'})),true);
  discard(view);await waitFor(()=>assert.equal(value(view),'unknown'));select(view,'empty');f.replace({record:null});refresh(view);await waitFor(()=>assert.ok(view.getByText('原資料已無法取得；請放棄草稿後載入目前資料或新增。')));
  assert.equal(value(view),'empty');discard(view);await waitFor(()=>assert.equal(value(view),'unknown'));save(view);await saved(view);assert.notEqual(f.writes[1].payload.id,id);assert.equal(f.writes[1].payload.expected_version,0);
});

test('confirmed save with failed read cannot replay; later refresh recovers confirmation exactly once',async()=>{
  const f=await fixture(),{view}=f;f.failReadAfterWrite();save(view);await waitFor(()=>assert.match(view.getByRole('alert').textContent!,/操作已確認/));
  fireEvent.submit(view.container.querySelector('form')!);assert.equal(f.writes.length,1);assert.equal(f.savedCalls(),0);refresh(view);
  await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存住宿獎懲狀態'})),false));assert.equal(f.savedCalls(),1);assert.match(view.getByLabelText('已儲存住宿獎懲狀態').textContent!,/版本 1/);
});

test('account switches abort pending writes and late completions; repeated submits dispatch only once',async()=>{
  let complete:(value:DormitoryConductReceipt)=>void=()=>{},signal:AbortSignal|undefined,savedCalls=0;const writes:DormitoryConductAction[]=[];
  const client={loadAdmin:async()=>({record:null}),manage:async(_caller:string,action:DormitoryConductAction,input?:AbortSignal)=>{signal=input;writes.push(action);return new Promise<DormitoryConductReceipt>(resolve=>{complete=resolve;});}};
  const view=render(<DormConductManager managerId={manager} userId={owner} client={client} onSaved={()=>{savedCalls++;}}/>);await waitFor(()=>assert.ok(view.getByRole('combobox')));
  select(view,'empty');save(view);save(view);fireEvent.submit(view.container.querySelector('form')!);assert.equal(writes.length,1);
  view.rerender(<DormConductManager managerId={other} userId={owner} client={client} onSaved={()=>{savedCalls++;}}/>);assert.equal(signal?.aborted,true);
  await act(async()=>complete({id:writes[0].payload.id,kind:writes[0].kind,version:1,summary:'Saved'}));await waitFor(()=>assert.ok(view.getByRole('combobox')));assert.equal(value(view),'unknown');assert.equal(savedCalls,0);
});

test('selected owner and client changes hide old forms; permission loss and version exhaustion disable writes',async()=>{
  let complete:(value:DormitoryConductAdminData)=>void=()=>{},signal:AbortSignal|undefined;
  const client={loadAdmin:async(_caller:string,userId:string,input?:AbortSignal)=>{if(userId===other)return {record:null};signal=input;return new Promise<DormitoryConductAdminData>(resolve=>{complete=resolve;});},manage:async()=>{throw new Error('No writes');}};
  const view=render(<DormConductManager managerId={manager} userId={owner} client={client}/>);await waitFor(()=>assert.ok(signal));view.rerender(<DormConductManager managerId={manager} userId={other} client={client}/>);assert.equal(signal?.aborted,true);
  await act(async()=>complete({record:{...record,result:'empty'}}));await waitFor(()=>assert.ok(view.getByRole('combobox')));assert.equal(value(view),'unknown');
  view.rerender(<DormConductManager managerId={manager} userId={other} client={{...client,loadAdmin:async()=>new Promise<DormitoryConductAdminData>(()=>{})}}/>);assert.equal(view.container.querySelector('form'),null);view.unmount();
  const f=await fixture({record});f.failWrite(new DormitoryConductClientError('Permission revoked',403));save(f.view);await waitFor(()=>assert.ok(f.view.getByText('Permission revoked')));assert.equal(f.view.container.querySelector('form'),null);f.view.unmount();
  const exhausted=await fixture({record:{...record,version:999999999}});assert.equal(disabled(exhausted.view.getByRole('button',{name:'儲存住宿獎懲狀態'})),true);fireEvent.submit(exhausted.view.container.querySelector('form')!);assert.equal(exhausted.writes.length,0);
});

test('unverified receipts remain retryable, while host notification failure does not undo confirmed writes',async()=>{
  let data:DormitoryConductAdminData={record:null},badReceipt=true;const writes:DormitoryConductAction[]=[];
  const client={loadAdmin:async()=>data,manage:async(_caller:string,action:DormitoryConductAction)=>{writes.push(structuredClone(action));
    if(badReceipt){badReceipt=false;return {id:action.payload.id,kind:action.kind,version:99,summary:'Invalid receipt'};}
    data={record:{...record,id:action.payload.id,version:1,result:'unknown'}};return {id:action.payload.id,kind:action.kind,version:1,summary:'Saved'};
  }};
  const view=render(<DormConductManager managerId={manager} userId={owner} client={client} onSaved={()=>{throw new Error('PRIVATE HOST ERROR');}}/>);await waitFor(()=>assert.ok(view.getByRole('combobox')));
  save(view);await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(disabled(view.getByRole('button',{name:'儲存住宿獎懲狀態'})),false);
  save(view);await waitFor(()=>assert.match(view.container.textContent!,/外層資料尚未更新/));assert.deepEqual(writes[0],writes[1]);assert.equal(view.queryByRole('alert'),null);assert.doesNotMatch(view.container.textContent!,/PRIVATE HOST/);
  assert.match(view.getByLabelText('已儲存住宿獎懲狀態').textContent!,/版本 1/);
});
