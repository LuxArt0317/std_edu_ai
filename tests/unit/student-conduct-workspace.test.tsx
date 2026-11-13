import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter} from 'react-router';
import {StudentConductClientError,studentConductFieldMap,type StudentConductAction,type StudentConductClient,type StudentConductRecord,type StudentConductRecords,type StudentConductReceipt} from '../../src/services/studentConductClient';
import type {StudentConductWorkspaceProps} from '../../src/features/public/affairs/StudentConductWorkspace';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLTextAreaElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('/studentConduct.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {StudentConductWorkspace}=await import('../../src/features/public/affairs/StudentConductWorkspace');hook.deregister();
const {StudentConductManager}=await import('../../src/features/public/affairs/StudentConductManager');
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');afterEach(cleanup);after(()=>dom.window.close());
const manager='10000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const id='20000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00Z';
const row:StudentConductRecord={id,userId:owner,sourceMode:'local_demo',version:2,createdAt:date,updatedAt:date,rowOrder:0,
  occurredOnText:null,studentNumber:'SYNTHETIC-ROW',studentName:'Synthetic Row Name',academicYearText:'001',semesterText:'',yearLevelText:null,
  reasonText:'Saved local text',conductCode:null,conductName:'Saved local name',quantityText:'0',voidStatusText:''};
const disabled=(node:HTMLElement)=>node.matches(':disabled');
const field=(view:ReturnType<typeof render>,label:string,value:string)=>fireEvent.change(view.getByRole('textbox',{name:label}),{target:{value}});
const tree=(client:Pick<StudentConductClient,'load'>,userId=owner,options:Partial<StudentConductWorkspaceProps>={})=><MemoryRouter><StudentConductWorkspace userId={userId} identity={{userId,studentNumber:'SYNTHETIC-CALLER',studentName:'Synthetic Caller'}} client={client} {...options}/></MemoryRouter>;

test('workspace displays caller identity separately, literal rows and no document or detail capability',async()=>{
  const view=render(tree({load:async userId=>{assert.equal(userId,owner);return {records:[row]};}}));
  assert.match(view.getByRole('status').textContent!,/載入/);await waitFor(()=>assert.equal(view.container.querySelectorAll('tbody tr').length,1));
  assert.equal((view.getByRole('textbox',{name:'學號'}) as HTMLInputElement).value,'SYNTHETIC-CALLER');
  const cells=[...view.container.querySelectorAll('tbody td')];assert.equal(cells[0].textContent,'—');assert.equal(cells[4].textContent,'');assert.equal(cells[9].textContent,'0');
  assert.equal(disabled(view.getByRole('button',{name:'下載獎懲紀錄表（stu.best 站內文件）'})),true);assert.equal(disabled(view.getByRole('button',{name:/檢視/})),true);
  assert.equal(view.container.querySelector('a[download],iframe,object'),null);
});

test('workspace sanitizes failures and retries; malformed data never becomes an empty history',async()=>{
  let reads=0;const view=render(tree({load:async()=>{if(++reads===1)throw new Error('PRIVATE provider details');return {records:[]};}}));
  await waitFor(()=>assert.ok(view.getByRole('alert')));assert.doesNotMatch(view.container.textContent!,/PRIVATE|目前沒有獎懲紀錄/);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));await waitFor(()=>assert.match(view.getByRole('status').textContent!,/目前沒有獎懲紀錄/));view.unmount();
  for(const records of [[row,row],[{...row,userId:other}],[{...row,quantityText:0} as unknown as StudentConductRecord]]){
    const bad=render(tree({load:async()=>({records})}));await waitFor(()=>assert.ok(bad.getByRole('alert')));
    assert.equal(bad.container.querySelectorAll('tbody tr').length,0);assert.doesNotMatch(bad.container.textContent!,/Saved local text|目前沒有獎懲紀錄/);bad.unmount();
  }
});

test('workspace account change aborts old work and never displays its late result',async()=>{
  let finish:(value:StudentConductRecords)=>void=()=>{},signal:AbortSignal|undefined;
  const client={load:async(userId:string,input?:AbortSignal)=>{if(userId===other)return {records:[]};signal=input;return new Promise<StudentConductRecords>(resolve=>{finish=resolve;});}};
  const view=render(tree(client));await waitFor(()=>assert.ok(signal));view.rerender(tree(client,other));assert.equal(signal?.aborted,true);
  await act(async()=>finish({records:[{...row,reasonText:'OLD PRIVATE ROW'}]}));await waitFor(()=>assert.match(view.getByRole('status').textContent!,/目前沒有獎懲紀錄/));
  assert.doesNotMatch(view.container.textContent!,/OLD PRIVATE ROW/);
});

test('independent identity loading and errors hide records; retry reloads both identity and conduct',async()=>{
  let reads=0,identityReloads=0;const client={load:async()=>{reads++;return {records:[row]};}},onReloadIdentity=()=>{identityReloads++;};
  const view=render(tree(client,owner,{identity:null,identityLoading:true,onReloadIdentity}));await waitFor(()=>assert.equal(reads,1));
  assert.match(view.getByRole('status').textContent!,/載入/);assert.equal(view.container.querySelectorAll('tbody tr').length,0);
  view.rerender(tree(client,owner,{identity:null,identityError:'Synthetic identity load failed',onReloadIdentity}));
  await waitFor(()=>assert.ok(view.getByText('Synthetic identity load failed')));assert.equal(view.container.querySelectorAll('tbody tr').length,0);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));assert.equal(identityReloads,1);await waitFor(()=>assert.equal(reads,2));
  view.rerender(tree(client,owner,{onReloadIdentity}));await waitFor(()=>assert.equal(view.container.querySelectorAll('tbody tr').length,1));
  assert.equal((view.getByRole('textbox',{name:'學號'}) as HTMLInputElement).value,'SYNTHETIC-CALLER');
});

async function fixture(initial:StudentConductRecords={records:[]}){
  let records=initial,reads=0,failRead=false,failAfterWrite=false,loseResponse=false,writeError:Error|null=null;
  const writes:StudentConductAction[]=[],receipts=new Map<string,{action:StudentConductAction;receipt:StudentConductReceipt}>();
  const client:Pick<StudentConductClient,'loadAdmin'|'manage'>={
    loadAdmin:async(caller,userId)=>{assert.equal(caller,manager);assert.equal(userId,owner);reads++;if(failRead){failRead=false;throw new StudentConductClientError('Synthetic read failed');}return structuredClone(records);},
    manage:async(caller,action)=>{
      assert.equal(caller,manager);assert.equal(action.payload.user_id,owner);writes.push(structuredClone(action));
      if(writeError){const error=writeError;writeError=null;throw error;}
      const previous=receipts.get(action.payload.request_id);if(previous){assert.deepEqual(previous.action,action);return previous.receipt;}
      const current=records.records.find(value=>value.id===action.payload.id);assert.equal(current?.version??0,action.payload.expected_version);
      if(action.kind==='save_student_conduct'){
        const saved={...row,id:action.payload.id,version:action.payload.expected_version+1,rowOrder:action.payload.row_order,
          ...Object.fromEntries(studentConductFieldMap.map(({field,key})=>[key,action.payload[field]]))} as StudentConductRecord;
        records={records:[...records.records.filter(value=>value.id!==saved.id),saved]};
      }else records={records:records.records.filter(value=>value.id!==action.payload.id)};
      const receipt={id:action.payload.id,kind:action.kind,version:action.payload.expected_version+1,summary:'Synthetic receipt'};
      receipts.set(action.payload.request_id,{action:structuredClone(action),receipt});
      if(failAfterWrite){failAfterWrite=false;failRead=true;}if(loseResponse){loseResponse=false;throw new StudentConductClientError('Synthetic response lost');}return receipt;
    },
  };
  const view=render(<StudentConductManager managerId={manager} userId={owner} client={client}/>);
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存獎懲紀錄'})));
  return {view,writes,client,reads:()=>reads,saved:()=>records,replace:(next:StudentConductRecords)=>{records=next;},
    failWrite:(error:Error)=>{writeError=error;},loseResponse:()=>{loseResponse=true;},failReadAfterSave:()=>{failAfterWrite=true;}};
}
const save=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'儲存獎懲紀錄'}));
const saved=async(view:ReturnType<typeof render>)=>waitFor(()=>assert.ok(view.getByText('已儲存站內獎懲紀錄。')));

test('manager waits for authorized account data and hides forms on denied or foreign results',async()=>{
  let reject:(error:Error)=>void=()=>{};
  const client={loadAdmin:()=>new Promise<StudentConductRecords>((_resolve,no)=>{reject=no;}),manage:async()=>{throw new Error('No writes');}};
  const view=render(<StudentConductManager managerId={manager} userId={owner} client={client}/>);assert.equal(view.container.querySelector('form'),null);
  await act(async()=>{await Promise.resolve();reject(new StudentConductClientError('Denied',403));});assert.equal(view.container.querySelector('form'),null);assert.ok(view.getByRole('alert'));view.unmount();
  const foreign=render(<StudentConductManager managerId={manager} userId={owner} client={{...client,loadAdmin:async()=>({records:[{...row,userId:other}]})}}/>);
  await waitFor(()=>assert.ok(foreign.getByRole('alert')));assert.equal(foreign.container.querySelector('form'),null);assert.doesNotMatch(foreign.container.textContent!,/Saved local text/);
});

test('manager creates, edits, clears and deletes all literal cells with immutable owner and fresh revisions',async()=>{
  const f=await fixture(),{view}=f;fireEvent.click(view.getByRole('checkbox',{name:'事由未提供'}));field(view,'事由',' Literal \u{20000} text ');
  fireEvent.click(view.getByRole('checkbox',{name:'數量未提供'}));field(view,'數量','0');fireEvent.click(view.getByRole('checkbox',{name:'學期未提供'}));
  save(view);await saved(view);const first=f.writes[0];assert.equal(first.kind,'save_student_conduct');
  assert.deepEqual(Object.keys(first.payload).sort(),['id','user_id','request_id','expected_version','row_order',...studentConductFieldMap.map(item=>item.field)].sort());
  assert.equal(first.payload.expected_version,0);assert.equal(f.saved().records[0].occurredOnText,null);assert.equal(f.saved().records[0].semesterText,'');assert.equal(f.saved().records[0].quantityText,'0');
  fireEvent.click(view.getByRole('checkbox',{name:'事由未提供'}));save(view);await saved(view);assert.equal(f.saved().records[0].reasonText,null);assert.equal(f.writes[1].payload.expected_version,1);
  assert.notEqual(first.payload.request_id,f.writes[1].payload.request_id);assert.equal(view.container.querySelector('select,input[type="file"],a[download]'),null);
  fireEvent.click(view.getByText('刪除此站內紀錄'));fireEvent.click(view.getByRole('button',{name:'確認刪除獎懲紀錄'}));
  await waitFor(()=>assert.ok(view.getByText('已刪除站內獎懲紀錄；原識別碼仍保留。')));assert.equal(f.writes[2].kind,'delete_student_conduct');assert.equal(f.writes[2].payload.expected_version,2);
  assert.deepEqual(f.saved(),{records:[]});save(view);await saved(view);assert.notEqual(f.writes[3].payload.id,first.payload.id);assert.equal(f.writes[3].payload.expected_version,0);
});

test('dirty drafts lock row switching and deletion; explicit discard loads saved state',async()=>{
  const f=await fixture({records:[row]}),{view}=f;fireEvent.click(view.getByRole('button',{name:'編輯第 1 筆'}));field(view,'事由','Unsaved draft');
  assert.equal(disabled(view.getByRole('button',{name:'新增獎懲紀錄'})),true);assert.equal(disabled(view.getByRole('button',{name:'編輯第 1 筆'})),true);
  fireEvent.click(view.getByText('刪除此站內紀錄'));assert.equal(disabled(view.getByRole('button',{name:'確認刪除獎懲紀錄'})),true);
  fireEvent.click(view.getByRole('button',{name:'放棄草稿並重新載入'}));await waitFor(()=>assert.equal((view.getByRole('textbox',{name:'事由'}) as HTMLTextAreaElement).value,'Saved local text'));
  assert.equal(f.writes.length,0);assert.equal(disabled(view.getByRole('button',{name:'新增獎懲紀錄'})),false);
});

test('lost committed create response replays the exact receipt after refresh without duplicating a row',async()=>{
  const f=await fixture(),{view}=f;fireEvent.click(view.getByRole('checkbox',{name:'事由未提供'}));field(view,'事由','Retained create');f.loseResponse();save(view);
  await waitFor(()=>assert.ok(view.getByText('Synthetic response lost')));assert.equal(f.saved().records.length,1);
  fireEvent.click(view.getByRole('button',{name:'重新載入獎懲紀錄'}));await waitFor(()=>assert.equal(f.reads(),2));await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存獎懲紀錄'})),false));
  assert.equal((view.getByRole('textbox',{name:'事由'}) as HTMLTextAreaElement).value,'Retained create');save(view);await saved(view);
  assert.deepEqual(f.writes[0],f.writes[1]);assert.equal(f.saved().records.length,1);assert.equal(f.saved().records[0].version,1);
});

test('409 blocks saving until explicit refresh, preserving draft and taking the latest revision',async()=>{
  const f=await fixture({records:[row]}),{view}=f;fireEvent.click(view.getByRole('button',{name:'編輯第 1 筆'}));field(view,'事由','Draft survives conflict');
  f.replace({records:[{...row,version:4,reasonText:'Concurrent saved text'}]});f.failWrite(new StudentConductClientError('Synthetic conflict',409));save(view);
  await waitFor(()=>assert.ok(view.getByText('Synthetic conflict')));assert.equal(disabled(view.getByRole('button',{name:'儲存獎懲紀錄'})),true);
  fireEvent.submit(view.container.querySelector('form')!);assert.equal(f.writes.length,1);
  fireEvent.click(view.getByRole('button',{name:'重新載入獎懲紀錄'}));await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存獎懲紀錄'})),false));
  assert.equal((view.getByRole('textbox',{name:'事由'}) as HTMLTextAreaElement).value,'Draft survives conflict');save(view);await saved(view);
  assert.equal(f.writes[1].payload.expected_version,4);assert.notEqual(f.writes[0].payload.request_id,f.writes[1].payload.request_id);
});

test('confirmed write with failed refresh cannot be resubmitted until its saved revision is loaded',async()=>{
  const f=await fixture(),{view}=f;f.failReadAfterSave();save(view);await waitFor(()=>assert.match(view.getByRole('alert').textContent!,/操作已確認/));
  assert.equal(disabled(view.getByRole('button',{name:'儲存獎懲紀錄'})),true);fireEvent.submit(view.container.querySelector('form')!);assert.equal(f.writes.length,1);
  fireEvent.click(view.getByRole('button',{name:'重新載入獎懲紀錄'}));await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存獎懲紀錄'})),false));
  assert.equal(view.queryByRole('alert'),null);assert.match(view.container.textContent!,/編輯站內獎懲紀錄 · 版本 1/);
});

test('Unicode bounds and row order validation reject writes while preserving entered text',async()=>{
  const f=await fixture(),{view}=f;fireEvent.click(view.getByRole('checkbox',{name:'事由未提供'}));field(view,'事由','\u{20000}'.repeat(2000));save(view);await saved(view);
  field(view,'事由','\u{20000}'.repeat(2001));fireEvent.submit(view.container.querySelector('form')!);assert.ok(view.getByRole('alert'));assert.equal(f.writes.length,1);
  field(view,'事由','');fireEvent.change(view.getByRole('spinbutton',{name:'顯示順序'}),{target:{value:'10001'}});fireEvent.submit(view.container.querySelector('form')!);
  assert.ok(view.getByRole('alert'));assert.equal(f.writes.length,1);assert.equal((view.getByRole('textbox',{name:'事由'}) as HTMLTextAreaElement).value,'');
});

test('manager account switch aborts old work and discards private draft/late response',async()=>{
  let complete:(value:StudentConductRecords)=>void=()=>{},signal:AbortSignal|undefined;
  const client={loadAdmin:async(_caller:string,userId:string,input?:AbortSignal)=>{if(userId===other)return {records:[]};signal=input;return new Promise<StudentConductRecords>(resolve=>{complete=resolve;});},manage:async()=>{throw new Error('No writes');}};
  const view=render(<StudentConductManager managerId={manager} userId={owner} client={client}/>);await waitFor(()=>assert.ok(signal));
  view.rerender(<StudentConductManager managerId={manager} userId={other} client={client}/>);assert.equal(signal?.aborted,true);
  await act(async()=>complete({records:[{...row,reasonText:'OLD ACCOUNT PRIVATE'}]}));await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存獎懲紀錄'})));
  assert.doesNotMatch(view.container.textContent!,/OLD ACCOUNT PRIVATE/);assert.equal((view.getByRole('checkbox',{name:'事由未提供'}) as HTMLInputElement).checked,true);
});

test('busy writes cannot dispatch twice and account switching aborts their private completion',async()=>{
  const writes:StudentConductAction[]=[];let signal:AbortSignal|undefined,complete:(value:StudentConductReceipt)=>void=()=>{};
  let onSaved=0,reads=0;
  const client={loadAdmin:async()=>{reads++;return {records:[]};},manage:async(_caller:string,action:StudentConductAction,input?:AbortSignal)=>{
    signal=input;writes.push(action);return new Promise<StudentConductReceipt>(resolve=>{complete=resolve;});
  }};
  const view=render(<StudentConductManager managerId={manager} userId={owner} client={client} onSaved={()=>{onSaved++;}}/>);
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存獎懲紀錄'})));fireEvent.click(view.getByRole('checkbox',{name:'事由未提供'}));field(view,'事由','OLD UNSAVED PRIVATE');
  save(view);save(view);fireEvent.submit(view.container.querySelector('form')!);assert.equal(writes.length,1);
  assert.equal(disabled(view.getByRole('textbox',{name:'事由'})),true);
  view.rerender(<StudentConductManager managerId={manager} userId={other} client={client} onSaved={()=>{onSaved++;}}/>);assert.equal(signal?.aborted,true);
  await act(async()=>complete({id:writes[0].payload.id,kind:writes[0].kind,version:1,summary:'Saved'}));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存獎懲紀錄'})));assert.equal(reads,2);assert.equal(onSaved,0);assert.equal(view.queryByRole('alert'),null);
  assert.equal((view.getByRole('textbox',{name:'事由'}) as HTMLTextAreaElement).value,'');assert.doesNotMatch(view.container.textContent!,/OLD UNSAVED PRIVATE/);
});

test('a concurrently removed record cannot be recreated under its reserved ID',async()=>{
  const f=await fixture({records:[row]}),{view}=f;fireEvent.click(view.getByRole('button',{name:'編輯第 1 筆'}));field(view,'事由','Retained draft');f.replace({records:[]});
  fireEvent.click(view.getByRole('button',{name:'重新載入獎懲紀錄'}));await waitFor(()=>assert.ok(view.getByText('原紀錄已無法取得；請放棄草稿後再新增紀錄。')));
  assert.equal(disabled(view.getByRole('button',{name:'儲存獎懲紀錄'})),true);fireEvent.submit(view.container.querySelector('form')!);assert.equal(f.writes.length,0);
  fireEvent.click(view.getByRole('button',{name:'放棄草稿並重新載入'}));await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'儲存獎懲紀錄'})),false));
  save(view);await saved(view);assert.notEqual(f.writes[0].payload.id,id);assert.equal(f.writes[0].payload.expected_version,0);
});
