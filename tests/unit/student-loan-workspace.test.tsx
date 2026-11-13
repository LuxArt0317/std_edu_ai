import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter} from 'react-router';
import {StudentLoanClientError,studentLoanFieldMap,type StudentLoanAction,type StudentLoanClient,type StudentLoanReceipt,type StudentLoanRecord,type StudentLoanSnapshot} from '../../src/services/studentLoanClient';
import type {StudentLoanWorkspaceProps} from '../../src/features/public/affairs/StudentLoanWorkspace';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','Element','HTMLElement','SVGElement','HTMLButtonElement','HTMLInputElement','HTMLTextAreaElement','HTMLAnchorElement','Node','NodeFilter','Event','MouseEvent','KeyboardEvent','CustomEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('/studentLoan.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {StudentLoanWorkspace}=await import('../../src/features/public/affairs/StudentLoanWorkspace');hook.deregister();
const {StudentLoanManager}=await import('../../src/features/public/affairs/StudentLoanManager');
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');afterEach(cleanup);after(()=>dom.window.close());
const manager='10000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00.123456+08:00';
const row:StudentLoanRecord={id,userId:owner,sourceMode:'local_demo',version:2,createdAt:date,updatedAt:date,currentTermLabel:' Literal term ',currentApplicationState:'recorded',currentApplicationText:null,progressText:'Saved private progress',historyCount:0,historyText:''};
const empty:StudentLoanSnapshot={status:'loaded',record:null},disabled=(node:HTMLElement)=>node.matches(':disabled');
const field=(view:ReturnType<typeof render>,label:string,value:string)=>fireEvent.change(view.getByRole('textbox',{name:label}),{target:{value}});
const tree=(client:Pick<StudentLoanClient,'load'>,userId=owner,options:Partial<StudentLoanWorkspaceProps>={})=><MemoryRouter><StudentLoanWorkspace userId={userId} view="index" onNavigate={()=>{}} onLogout={()=>{}} onInformation={()=>{}} client={client} {...options}/></MemoryRouter>;

test('absent loan metadata stays unknown without fabricated application, history count or file capability',async()=>{
  const view=render(tree({load:async userId=>{assert.equal(userId,owner);return empty;}}));assert.match(view.getByRole('status').textContent!,/載入/);
  await waitFor(()=>assert.match(view.getByRole('status').textContent!,/無法確認/));assert.doesNotMatch(view.container.textContent!,/尚未申請|沒有歷史|記錄\(0\)/);
  assert.equal(view.container.querySelector('form,table,iframe,object,input[type="file"],a[download]'),null);
});

test('workspace sanitizes errors, retries and rejects foreign or malformed results without false empty history',async()=>{
  let reads=0;const client={load:async()=>{if(++reads===1)throw new Error('PRIVATE provider detail');return {status:'loaded' as const,record:{...row,currentApplicationState:'not_applied' as const}};}};
  const view=render(tree(client));await waitFor(()=>assert.ok(view.getByRole('alert')));assert.doesNotMatch(view.container.textContent!,/PRIVATE|記錄\(0\)/);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));await waitFor(()=>assert.ok(view.getByRole('link',{name:'4.歷年申請記錄(0)'})));view.unmount();
  for(const record of [{...row,userId:other},{...row,historyCount:'0'} as unknown as StudentLoanRecord]){
    const bad=render(tree({load:async()=>({status:'loaded',record})}));await waitFor(()=>assert.ok(bad.getByRole('alert')));assert.doesNotMatch(document.body.textContent!,/Saved private progress|記錄\(0\)/);bad.unmount();
  }
});

test('account or transport replacement hides old data immediately and aborts late completions',async()=>{
  let finish:(value:StudentLoanSnapshot)=>void=()=>{},signal:AbortSignal|undefined;
  const client={load:async(userId:string,input?:AbortSignal)=>{if(userId===other)return empty;signal=input;return new Promise<StudentLoanSnapshot>(resolve=>{finish=resolve;});}};
  const view=render(tree(client,owner,{view:'progress'}));await waitFor(()=>assert.ok(signal));view.rerender(tree(client,other,{view:'progress'}));assert.equal(signal?.aborted,true);
  await act(async()=>finish({status:'loaded',record:row}));await waitFor(()=>assert.match(view.getByRole('dialog').textContent!,/無法確認/));assert.doesNotMatch(document.body.textContent!,/Saved private progress/);view.unmount();
  const old={load:async()=>({status:'loaded' as const,record:row})},fresh={load:async()=>new Promise<StudentLoanSnapshot>(()=>{})};
  const replacement=render(tree(old,owner,{view:'progress'}));await waitFor(()=>assert.match(replacement.getByRole('dialog').textContent!,/Saved private progress/));
  replacement.rerender(tree(fresh,owner,{view:'progress'}));assert.doesNotMatch(document.body.textContent!,/Saved private progress/);assert.match(replacement.getByRole('dialog').textContent!,/載入/);
});

test('workspace forwards source navigation callbacks without starting applications or fetching files',async()=>{
  const calls:unknown[]=[],client={load:async()=>({status:'loaded' as const,record:row})};
  const view=render(tree(client,owner,{onNavigate:(...args)=>{calls.push(args);},onInformation:()=>{calls.push('information');}}));await waitFor(()=>assert.ok(view.getByRole('link',{name:'4.歷年申請記錄(0)'})));
  fireEvent.click(view.getByRole('link',{name:'1.查詢當期就學貸款進度'}));fireEvent.click(view.getByRole('link',{name:'2.列印當期就學貸款資料'}));fireEvent.click(view.getByRole('button',{name:'3.就學貸款資訊專區'}));
  assert.deepEqual(calls,[['progress',undefined],['document',{newTab:true}],'information']);assert.equal(view.container.querySelector('a[download],iframe,object'),null);
});

async function fixture(initial:StudentLoanSnapshot=empty){
  let snapshot=structuredClone(initial),reads=0,failRead=false,failAfterWrite=false,loseResponse=false,writeError:Error|null=null;
  const writes:StudentLoanAction[]=[],receipts=new Map<string,{action:StudentLoanAction;receipt:StudentLoanReceipt}>();
  const client:Pick<StudentLoanClient,'loadAdmin'|'manage'>={
    loadAdmin:async(caller,userId)=>{assert.equal(caller,manager);assert.equal(userId,owner);reads++;if(failRead){failRead=false;throw new StudentLoanClientError('Synthetic read failed');}return structuredClone(snapshot);},
    manage:async(caller,action)=>{
      assert.equal(caller,manager);assert.equal(action.payload.user_id,owner);writes.push(structuredClone(action));if(writeError){const error=writeError;writeError=null;throw error;}
      const prior=receipts.get(action.payload.request_id);if(prior){assert.deepEqual(prior.action,action);return prior.receipt;}
      assert.equal(snapshot.record?.version??0,action.payload.expected_version);
      if(action.kind==='save_student_loan')snapshot={status:'loaded',record:{...row,id:action.payload.id,version:action.payload.expected_version+1,
        ...Object.fromEntries(studentLoanFieldMap.map(({field,key})=>[key,action.payload[field]])),currentApplicationState:action.payload.current_application_state,historyCount:action.payload.history_count}};
      else snapshot=structuredClone(empty);
      const receipt={id:action.payload.id,kind:action.kind,version:action.payload.expected_version+1,summary:'Synthetic receipt'};receipts.set(action.payload.request_id,{action:structuredClone(action),receipt});
      if(failAfterWrite){failAfterWrite=false;failRead=true;}if(loseResponse){loseResponse=false;throw new StudentLoanClientError('Synthetic response lost');}return receipt;
    },
  };
  const view=render(<StudentLoanManager managerId={manager} userId={owner} client={client}/>);await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存就學貸款紀錄'})));
  return {view,writes,client,reads:()=>reads,saved:()=>snapshot,replace:(next:StudentLoanSnapshot)=>{snapshot=next;},failWrite:(error:Error)=>{writeError=error;},loseResponse:()=>{loseResponse=true;},failReadAfterSave:()=>{failAfterWrite=true;}};
}
const save=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'儲存就學貸款紀錄'}));
const saved=async(view:ReturnType<typeof render>)=>waitFor(()=>assert.ok(view.getByText('已儲存站內就學貸款原文紀錄。')));
const refresh=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'重新載入就學貸款紀錄'}));
const discard=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'放棄草稿並重新載入'}));

test('manager waits for authorized selected-owner data and hides forms on denied or foreign snapshots',async()=>{
  for(const loadAdmin of [async()=>{throw new StudentLoanClientError('Denied',403);},async()=>({status:'loaded' as const,record:{...row,userId:other}})]){
    const view=render(<StudentLoanManager managerId={manager} userId={owner} client={{loadAdmin,manage:async()=>{throw new Error('No writes');}}}/>);
    assert.equal(view.container.querySelector('form'),null);await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(view.container.querySelector('form'),null);assert.doesNotMatch(view.container.textContent!,/Saved private progress/);view.unmount();
  }
});

test('manager creates explicit metadata, edits null/blank/zero and deletes before using a new tombstone-safe ID',async()=>{
  const f=await fixture(),{view}=f;assert.equal((view.getByRole('combobox',{name:'當期申請狀態'}) as HTMLSelectElement).value,'unknown');
  fireEvent.click(view.getByRole('checkbox',{name:'當期進度原文未提供'}));field(view,'當期進度原文',' Literal 😀 ');fireEvent.click(view.getByRole('checkbox',{name:'歷年申請原文未提供'}));
  fireEvent.click(view.getByRole('checkbox',{name:'歷年申請筆數未提供'}));fireEvent.change(view.getByRole('spinbutton',{name:'歷年申請筆數'}),{target:{value:'0'}});
  fireEvent.change(view.getByRole('combobox',{name:'當期申請狀態'}),{target:{value:'recorded'}});save(view);await saved(view);
  const first=f.writes[0];assert.deepEqual(Object.keys(first.payload).sort(),['id','user_id','request_id','expected_version','current_application_state','history_count',...studentLoanFieldMap.map(item=>item.field)].sort());
  assert.equal(f.saved().record!.currentTermLabel,null);assert.equal(f.saved().record!.historyText,'');assert.equal(f.saved().record!.historyCount,0);assert.equal(f.saved().record!.progressText,' Literal 😀 ');assert.equal(first.payload.expected_version,0);
  fireEvent.click(view.getByRole('checkbox',{name:'當期進度原文未提供'}));fireEvent.click(view.getByRole('checkbox',{name:'歷年申請筆數未提供'}));save(view);await saved(view);
  assert.equal(f.saved().record!.progressText,null);assert.equal(f.saved().record!.historyCount,null);assert.equal(f.writes[1].payload.expected_version,1);assert.notEqual(first.payload.request_id,f.writes[1].payload.request_id);
  fireEvent.click(view.getByText('刪除此站內紀錄'));fireEvent.click(view.getByRole('button',{name:'確認刪除就學貸款紀錄'}));await waitFor(()=>assert.ok(view.getByText('已刪除站內就學貸款紀錄；原識別碼仍保留。')));
  assert.equal(f.writes[2].kind,'delete_student_loan');assert.equal(f.writes[2].payload.expected_version,2);assert.equal(f.saved().record,null);
  save(view);await saved(view);assert.notEqual(f.writes[3].payload.id,first.payload.id);assert.equal(f.writes[3].payload.expected_version,0);assert.equal(view.container.querySelector('input[type="file"],a[download]'),null);
});

test('lost committed create and delete responses retain exact operation IDs across refresh',async()=>{
  const f=await fixture(),{view}=f;fireEvent.click(view.getByRole('checkbox',{name:'當期進度原文未提供'}));field(view,'當期進度原文','Retained create');f.loseResponse();save(view);
  await waitFor(()=>assert.ok(view.getByText('Synthetic response lost')));assert.equal(f.saved().record?.version,1);refresh(view);await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存就學貸款紀錄'})),false));
  save(view);await saved(view);assert.deepEqual(f.writes[0],f.writes[1]);assert.equal(f.saved().record?.version,1);
  fireEvent.click(view.getByText('刪除此站內紀錄'));f.loseResponse();fireEvent.click(view.getByRole('button',{name:'確認刪除就學貸款紀錄'}));await waitFor(()=>assert.ok(view.getByText('Synthetic response lost')));
  refresh(view);await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'確認刪除就學貸款紀錄'})),false));fireEvent.click(view.getByRole('button',{name:'確認刪除就學貸款紀錄'}));
  await waitFor(()=>assert.ok(view.getByText('已刪除站內就學貸款紀錄；原識別碼仍保留。')));assert.deepEqual(f.writes[2],f.writes[3]);assert.equal(f.saved().record,null);
});

test('409 refresh retains dirty text while adopting the latest version; deletion cannot discard dirty drafts',async()=>{
  const f=await fixture({status:'loaded',record:row}),{view}=f;field(view,'當期進度原文','Draft survives');fireEvent.click(view.getByText('刪除此站內紀錄'));assert.equal(disabled(view.getByRole('button',{name:'確認刪除就學貸款紀錄'})),true);
  f.replace({status:'loaded',record:{...row,version:4,progressText:'Concurrent saved'}});f.failWrite(new StudentLoanClientError('Synthetic conflict',409));save(view);await waitFor(()=>assert.ok(view.getByText('Synthetic conflict')));
  assert.equal(disabled(view.getByRole('button',{name:'儲存就學貸款紀錄'})),true);fireEvent.submit(view.container.querySelector('form')!);assert.equal(f.writes.length,1);
  refresh(view);await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存就學貸款紀錄'})),false));assert.equal((view.getByRole('textbox',{name:'當期進度原文'}) as HTMLTextAreaElement).value,'Draft survives');save(view);await saved(view);
  assert.equal(f.writes[1].payload.expected_version,4);assert.notEqual(f.writes[0].payload.request_id,f.writes[1].payload.request_id);
});

test('other-ID singleton collision and removed record require explicit discard instead of overwriting or resurrecting',async()=>{
  const f=await fixture(),{view}=f;fireEvent.click(view.getByRole('checkbox',{name:'當期進度原文未提供'}));field(view,'當期進度原文','Uncommitted create');
  f.replace({status:'loaded',record:row});f.failWrite(new StudentLoanClientError('Collision',409));save(view);await waitFor(()=>assert.ok(view.getByText('Collision')));refresh(view);
  await waitFor(()=>assert.ok(view.getByText('此帳戶已有另一筆站內紀錄；請放棄草稿後載入該筆紀錄。')));assert.equal(disabled(view.getByRole('button',{name:'儲存就學貸款紀錄'})),true);
  assert.equal((view.getByRole('textbox',{name:'當期進度原文'}) as HTMLTextAreaElement).value,'Uncommitted create');discard(view);await waitFor(()=>assert.equal((view.getByRole('textbox',{name:'當期進度原文'}) as HTMLTextAreaElement).value,row.progressText));
  field(view,'當期進度原文','Retained removed draft');f.replace(empty);refresh(view);await waitFor(()=>assert.ok(view.getByText('原紀錄已無法取得；請放棄草稿後載入目前紀錄或新增。')));assert.equal(disabled(view.getByRole('button',{name:'儲存就學貸款紀錄'})),true);
  discard(view);await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存就學貸款紀錄'})),false));save(view);await saved(view);assert.notEqual(f.writes[1].payload.id,id);assert.equal(f.writes[1].payload.expected_version,0);
});

test('confirmed mutation with failed refresh cannot be resubmitted; retry verifies the saved revision',async()=>{
  const f=await fixture(),{view}=f;f.failReadAfterSave();save(view);await waitFor(()=>assert.match(view.getByRole('alert').textContent!,/操作已確認/));
  assert.equal(disabled(view.getByRole('button',{name:'儲存就學貸款紀錄'})),true);fireEvent.submit(view.container.querySelector('form')!);assert.equal(f.writes.length,1);
  refresh(view);await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存就學貸款紀錄'})),false));assert.match(view.container.textContent!,/編輯站內就學貸款紀錄 · 版本 1/);assert.equal(view.queryByRole('alert'),null);
});

test('blank count is not zero and Unicode/version bounds preserve invalid drafts without sending',async()=>{
  const f=await fixture(),{view}=f;fireEvent.click(view.getByRole('checkbox',{name:'歷年申請筆數未提供'}));save(view);assert.ok(view.getByRole('alert'));assert.equal(f.writes.length,0);
  fireEvent.change(view.getByRole('spinbutton',{name:'歷年申請筆數'}),{target:{value:'1000001'}});save(view);assert.equal(f.writes.length,0);fireEvent.click(view.getByRole('checkbox',{name:'歷年申請筆數未提供'}));
  fireEvent.click(view.getByRole('checkbox',{name:'當期進度原文未提供'}));field(view,'當期進度原文','\u{20000}'.repeat(2000));save(view);await saved(view);
  field(view,'當期進度原文','\u{20000}'.repeat(2001));fireEvent.submit(view.container.querySelector('form')!);assert.ok(view.getByRole('alert'));assert.equal(f.writes.length,1);view.unmount();
  const exhausted=await fixture({status:'loaded',record:{...row,version:999999999}});assert.equal(disabled(exhausted.view.getByRole('button',{name:'儲存就學貸款紀錄'})),true);save(exhausted.view);assert.equal(exhausted.writes.length,0);
});

test('manager account switch aborts private pending reads and duplicate writes, suppressing late callbacks',async()=>{
  let complete:(value:StudentLoanReceipt)=>void=()=>{},signal:AbortSignal|undefined,savedCalls=0,reads=0;const writes:StudentLoanAction[]=[];
  const client={loadAdmin:async()=>{reads++;return empty;},manage:async(_manager:string,action:StudentLoanAction,input?:AbortSignal)=>{signal=input;writes.push(action);return new Promise<StudentLoanReceipt>(resolve=>{complete=resolve;});}};
  const view=render(<StudentLoanManager managerId={manager} userId={owner} client={client} onSaved={()=>{savedCalls++;}}/>);await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存就學貸款紀錄'})));
  fireEvent.click(view.getByRole('checkbox',{name:'當期進度原文未提供'}));field(view,'當期進度原文','OLD PRIVATE DRAFT');save(view);save(view);fireEvent.submit(view.container.querySelector('form')!);assert.equal(writes.length,1);
  view.rerender(<StudentLoanManager managerId={other} userId={owner} client={client} onSaved={()=>{savedCalls++;}}/>);assert.equal(signal?.aborted,true);
  await act(async()=>complete({id:writes[0].payload.id,kind:writes[0].kind,version:1,summary:'Saved'}));await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存就學貸款紀錄'})));
  assert.equal(savedCalls,0);assert.equal(reads,2);assert.equal((view.getByRole('textbox',{name:'當期進度原文'}) as HTMLTextAreaElement).value,'');assert.equal(view.queryByRole('alert'),null);
});

test('selected-student switch suppresses a late initial private snapshot and permission loss hides the editor',async()=>{
  let complete:(value:StudentLoanSnapshot)=>void=()=>{},signal:AbortSignal|undefined;
  const client={loadAdmin:async(_manager:string,userId:string,input?:AbortSignal)=>{if(userId===other)return empty;signal=input;return new Promise<StudentLoanSnapshot>(resolve=>{complete=resolve;});},manage:async()=>{throw new Error('No writes');}};
  const view=render(<StudentLoanManager managerId={manager} userId={owner} client={client}/>);await waitFor(()=>assert.ok(signal));view.rerender(<StudentLoanManager managerId={manager} userId={other} client={client}/>);assert.equal(signal?.aborted,true);
  await act(async()=>complete({status:'loaded',record:row}));await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存就學貸款紀錄'})));
  assert.equal((view.getByRole('textbox',{name:'當期進度原文'}) as HTMLTextAreaElement).value,'');assert.doesNotMatch(view.container.textContent!,/Saved private progress/);view.unmount();
  const f=await fixture({status:'loaded',record:row});f.failWrite(new StudentLoanClientError('Synthetic permission revoked',403));save(f.view);await waitFor(()=>assert.ok(f.view.getByText('Synthetic permission revoked')));
  assert.equal(f.view.container.querySelector('form'),null);assert.doesNotMatch(f.view.container.textContent!,/Saved private progress/);
});
