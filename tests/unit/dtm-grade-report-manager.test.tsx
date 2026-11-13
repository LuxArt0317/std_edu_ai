import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire} from 'node:module';
import {DtmGradeReportClientError,emptyDtmGradeCells,type DtmGradeReportAction,type DtmGradeReportClient,type DtmGradeReportData,type DtmGradeReportReceipt,type DtmGradeReportRecord} from '../../src/services/dtmGradeReport';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLSelectElement','HTMLButtonElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'] as const)Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,writable:true,configurable:true});
const {DtmGradeReportManager}=await import('../../src/features/public/affairs/DtmGradeReportManager');
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');afterEach(cleanup);after(()=>dom.window.close());
const manager='10000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003',courseId='20000000-0000-4000-8000-000000000001',date='2030-01-01T00:00:00Z';
const course={id:courseId,userId:owner,title:'Synthetic course',code:'SYN-1',term:'Synthetic term'};
const record:DtmGradeReportRecord={id:'30000000-0000-4000-8000-000000000001',userId:owner,courseId,sourceMode:'local_demo',version:2,createdAt:date,updatedAt:date,items:[{...emptyDtmGradeCells(),id:'40000000-0000-4000-8000-000000000001',label:'Stored item',activityKind:null,gradeText:'P'}],total:null};
type Client=Pick<DtmGradeReportClient,'loadCoursesAdmin'|'loadAdmin'|'manage'>;
const disabled=(node:HTMLElement)=>node.matches(':disabled');
const save=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'儲存成績原文報告'}));
const saved=(view:ReturnType<typeof render>)=>waitFor(()=>assert.ok(view.getByText('已儲存站內成績原文報告。')));
const refresh=(view:ReturnType<typeof render>)=>fireEvent.click(view.getByRole('button',{name:'重新載入成績原文報告'}));
const field=(view:ReturnType<typeof render>,name:string,value:string)=>fireEvent.change(view.getByLabelText(name),{target:{value}});
const toggle=(view:ReturnType<typeof render>,name:string)=>fireEvent.click(view.getByRole('checkbox',{name}));
async function select(view:ReturnType<typeof render>){await waitFor(()=>assert.ok(view.getByRole('combobox',{name:'成績報告課程'})));fireEvent.change(view.getByRole('combobox',{name:'成績報告課程'}),{target:{value:courseId}});await waitFor(()=>assert.ok(view.getByRole('button',{name:'儲存成績原文報告'})));}
async function fixture(initial:DtmGradeReportData={report:null}){
 let data=structuredClone(initial),readFail=false,loseResponse=false,failAfterWrite=false,writeError:Error|null=null,savedCount=0;
 const writes:DtmGradeReportAction[]=[],receipts=new Map<string,{action:DtmGradeReportAction;receipt:DtmGradeReportReceipt}>();
 const client:Client={loadCoursesAdmin:async(caller,user)=>{assert.equal(caller,manager);assert.equal(user,owner);return {courses:[course],limit:100,nextCursor:null};},loadAdmin:async(caller,user,selected)=>{assert.equal(caller,manager);assert.equal(user,owner);assert.equal(selected,courseId);if(readFail){readFail=false;throw new DtmGradeReportClientError('Synthetic read failure');}return structuredClone(data);},manage:async(caller,action)=>{
 assert.equal(caller,manager);assert.equal(action.payload.user_id,owner);assert.equal(action.payload.course_id,courseId);writes.push(structuredClone(action));if(writeError){const reason=writeError;writeError=null;throw reason;}
 const prior=receipts.get(action.payload.request_id);if(prior){assert.deepEqual(action,prior.action);return prior.receipt;}
 assert.equal(action.payload.expected_version,data.report?.version??0);data={report:action.kind==='save_dtm_grade_report'?{...record,...action.payload.report,id:action.payload.id,version:action.payload.expected_version+1}:null};
 const receipt:DtmGradeReportReceipt={id:action.payload.id,userId:owner,courseId,kind:action.kind,version:action.payload.expected_version+1,summary:'Synthetic saved'};receipts.set(action.payload.request_id,{action:structuredClone(action),receipt});
 if(failAfterWrite){failAfterWrite=false;readFail=true;}if(loseResponse){loseResponse=false;throw new DtmGradeReportClientError('Synthetic lost response');}return receipt;
 }};
 const view=render(<DtmGradeReportManager managerId={manager} userId={owner} client={client} onSaved={()=>savedCount++}/>);await select(view);
 return {view,client,writes,data:()=>data,setData:(value:DtmGradeReportData)=>{data=value;},lose:()=>{loseResponse=true;},failRead:()=>{readFail=true;},failAfterWrite:()=>{failAfterWrite=true;},failWrite:(error:Error)=>{writeError=error;},savedCount:()=>savedCount};
}
test('manager loads only the selected owned course and rejects denied or malformed course lists',async()=>{
 for(const loadCoursesAdmin of [async()=>{throw new DtmGradeReportClientError('Denied',403);},async()=>({courses:[{...course,userId:other}],limit:100 as const,nextCursor:null})]){
 let reportReads=0;const view=render(<DtmGradeReportManager managerId={manager} userId={owner} client={{loadCoursesAdmin,loadAdmin:async()=>{reportReads++;return {report:null};},manage:async()=>{throw Error('No writes');}}}/>);await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(reportReads,0);assert.equal(view.container.querySelector('form'),null);view.unmount();}
 const f=await fixture();assert.equal(f.view.container.querySelectorAll('select').length,1);assert.match(f.view.getByLabelText('已儲存成績原文報告').textContent!,/目前沒有/);assert.equal(f.writes.length,0);
});
test('structured editor saves null, blank, zero, item order and explicit total without computed display fields',async()=>{
 const f=await fixture(),v=f.view;fireEvent.click(v.getByRole('button',{name:'新增評分項目'}));field(v,'評分項目 1 名稱','Synthetic first');
 toggle(v,'評分項目 1 成績原文未提供');field(v,'評分項目 1 成績原文','0');toggle(v,'評分項目 1 全距原文未提供');
 toggle(v,'評分項目 1 分數數值（獨立欄位）未提供');field(v,'評分項目 1 分數數值（獨立欄位）','0');
 fireEvent.click(v.getByRole('button',{name:'新增評分項目'}));field(v,'評分項目 2 名稱','Synthetic second');fireEvent.click(v.getByRole('button',{name:'上移評分項目 2'}));
 toggle(v,'提供課程總分原文');toggle(v,'課程總分 成績原文未提供');field(v,'課程總分 成績原文','P');
 assert.equal(disabled(v.getByRole('combobox',{name:'成績報告課程'})),true);save(v);await saved(v);
 const report=f.data().report!;assert.deepEqual(report.items.map(x=>x.label),['Synthetic second','Synthetic first']);const first=report.items[1];assert.equal(first.gradeText,'0');assert.equal(first.rangeText,'');assert.equal(first.score,0);assert.equal(first.maximum,null);assert.equal(first.percentageText,null);assert.equal(report.total?.gradeText,'P');assert.equal(report.total?.score,null);assert.equal(f.savedCount(),1);
 fireEvent.click(v.getByRole('button',{name:'移除評分項目 1'}));save(v);await saved(v);assert.equal(f.data().report?.items.length,1);assert.equal(f.writes[1].payload.expected_version,1);
});
test('invalid numeric blank is not zero and malformed receipts never confirm a save',async()=>{
 const f=await fixture(),v=f.view;fireEvent.click(v.getByRole('button',{name:'新增評分項目'}));field(v,'評分項目 1 名稱','Synthetic');toggle(v,'評分項目 1 分數數值（獨立欄位）未提供');save(v);await waitFor(()=>assert.ok(v.getByRole('alert')));assert.equal(f.writes.length,0);
 v.unmount();const client:Client={loadCoursesAdmin:async()=>({courses:[course],limit:100,nextCursor:null}),loadAdmin:async()=>({report:null}),manage:async(_caller,action)=>({id:action.payload.id,userId:owner,courseId,kind:action.kind,version:1,summary:''})};
 const malformed=render(<DtmGradeReportManager managerId={manager} userId={owner} client={client}/>);await select(malformed);save(malformed);await waitFor(()=>assert.ok(malformed.getByRole('alert')));assert.match(malformed.container.textContent!,/先前操作尚未確認/);assert.equal(malformed.queryByText('已儲存站內成績原文報告。'),null);
});
test('lost committed create and delete keep exact retries after refresh and failed reads',async()=>{
 const f=await fixture(),v=f.view;f.lose();save(v);await waitFor(()=>assert.ok(v.getByText('Synthetic lost response')));assert.equal(f.data().report?.version,1);f.failRead();refresh(v);await waitFor(()=>assert.ok(v.getByText('Synthetic read failure')));
 refresh(v);await waitFor(()=>assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),false));save(v);await saved(v);assert.deepEqual(f.writes[0],f.writes[1]);assert.equal(f.data().report?.version,1);
 fireEvent.click(v.getByText('刪除此站內報告'));f.lose();fireEvent.click(v.getByRole('button',{name:'確認刪除成績原文報告'}));await waitFor(()=>assert.ok(v.getByText('Synthetic lost response')));refresh(v);
 await waitFor(()=>assert.equal(disabled(v.getByRole('button',{name:'確認刪除成績原文報告'})),false));assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),true);fireEvent.click(v.getByRole('button',{name:'確認刪除成績原文報告'}));await waitFor(()=>assert.ok(v.getByText('已刪除站內成績原文報告；原識別碼保留。')));assert.deepEqual(f.writes[2],f.writes[3]);
 save(v);await saved(v);assert.notEqual(f.writes[4].payload.id,f.writes[0].payload.id);assert.equal(f.writes[4].payload.expected_version,0);
});
test('409 requires explicit refresh and preserves draft while adopting the latest revision',async()=>{
 const f=await fixture({report:record}),v=f.view;fireEvent.click(v.getByRole('button',{name:'編輯評分項目 1'}));field(v,'評分項目 1 名稱','Unsaved draft');f.setData({report:{...record,version:3,items:[{...record.items[0],label:'Concurrent saved'}]}});f.failWrite(new DtmGradeReportClientError('Synthetic conflict',409));save(v);await waitFor(()=>assert.ok(v.getByText('Synthetic conflict')));assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),true);
 refresh(v);await waitFor(()=>assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),false));assert.equal((v.getByLabelText('評分項目 1 名稱') as HTMLInputElement).value,'Unsaved draft');assert.equal(disabled(v.getByRole('button',{name:'確認刪除成績原文報告',hidden:true})),true);save(v);await saved(v);assert.equal(f.writes[1].payload.expected_version,3);assert.notEqual(f.writes[0].payload.request_id,f.writes[1].payload.request_id);assert.equal(f.data().report?.items[0].label,'Unsaved draft');
});
test('confirmed save with failed read cannot repeat write and refresh recovers; collision/missing require discard',async()=>{
 const f=await fixture(),v=f.view;f.failAfterWrite();save(v);await waitFor(()=>assert.match(v.getByRole('alert').textContent!,/操作已確認/));assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),true);refresh(v);await waitFor(()=>assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),false));assert.equal(f.writes.length,1);assert.equal(f.savedCount(),1);
 f.setData({report:null});refresh(v);await waitFor(()=>assert.ok(v.getByText(/原報告已無法取得/)));assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),true);fireEvent.click(v.getByRole('button',{name:'放棄草稿並重新載入'}));await waitFor(()=>assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),false));save(v);await saved(v);assert.notEqual(f.writes[0].payload.id,f.writes[1].payload.id);
});
test('load more preserves the selected report draft and page errors retain existing courses',async()=>{
 const hundred=Array.from({length:100},(_,i)=>({...course,id:'20000000-0000-4000-8000-'+String(i+1).padStart(12,'0')}));let pages=0,fail=true;
 const client:Client={loadCoursesAdmin:async(_manager,_user,options)=>{pages++;if(!options?.afterId)return {courses:hundred,limit:100,nextCursor:hundred[99].id};if(fail){fail=false;throw new DtmGradeReportClientError('Synthetic page failure');}return {courses:[{...course,id:'20000000-0000-4000-8000-000000000101'}],limit:100,nextCursor:null};},loadAdmin:async()=>({report:record}),manage:async()=>{throw Error('No writes');}};
 const v=render(<DtmGradeReportManager managerId={manager} userId={owner} client={client}/>);await select(v);fireEvent.click(v.getByRole('button',{name:'編輯評分項目 1'}));field(v,'評分項目 1 名稱','Retained draft');fireEvent.click(v.getByRole('button',{name:'載入更多課程'}));await waitFor(()=>assert.ok(v.getByText('Synthetic page failure')));assert.equal(v.getByRole('combobox',{name:'成績報告課程'}).querySelectorAll('option').length,101);
 fireEvent.click(v.getByRole('button',{name:'載入更多課程'}));await waitFor(()=>assert.ok(!v.queryByRole('button',{name:'載入更多課程'})));assert.equal((v.getByLabelText('評分項目 1 名稱') as HTMLInputElement).value,'Retained draft');assert.equal(pages,3);assert.equal(disabled(v.getByRole('combobox',{name:'成績報告課程'})),true);
});
test('account/client changes abort queued reads and old completion, preventing cross-account draft or success',async()=>{
 let resolve!:(value:DtmGradeReportData)=>void,oldSignal:AbortSignal|undefined;
 const client:Client={loadCoursesAdmin:async(_m,user)=>({courses:[{...course,userId:user}],limit:100,nextCursor:null}),loadAdmin:async(_m,user,_c,signal)=>{if(user!==owner)return {report:null};oldSignal=signal;return new Promise(done=>{resolve=done;});},manage:async()=>{throw Error('No writes');}};
 const v=render(<DtmGradeReportManager managerId={manager} userId={owner} client={client}/>);await waitFor(()=>assert.ok(v.getByRole('combobox')));fireEvent.change(v.getByRole('combobox'),{target:{value:courseId}});await waitFor(()=>assert.ok(oldSignal));v.rerender(<DtmGradeReportManager managerId={manager} userId={other} client={client}/>);assert.equal(oldSignal?.aborted,true);await act(async()=>resolve({report:record}));assert.doesNotMatch(v.container.textContent!,/Stored item|版本 2/);assert.equal(v.container.querySelector('form'),null);
 v.unmount();const f=await fixture({report:record});let finish!:(value:DtmGradeReportReceipt)=>void,writeSignal:AbortSignal|undefined;const pendingClient={...f.client,manage:async(_m:string,_a:DtmGradeReportAction,signal?:AbortSignal)=>{writeSignal=signal;return new Promise<DtmGradeReportReceipt>(done=>{finish=done;});}};
 f.view.rerender(<DtmGradeReportManager managerId={manager} userId={owner} client={pendingClient}/>);await select(f.view);save(f.view);await waitFor(()=>assert.ok(writeSignal));f.view.rerender(<DtmGradeReportManager managerId={manager} userId={other} client={client}/>);assert.equal(writeSignal?.aborted,true);await act(async()=>finish({id:record.id,userId:owner,courseId,kind:'save_dtm_grade_report',version:3,summary:'Synthetic late success'}));assert.equal(f.savedCount(),0);assert.doesNotMatch(f.view.container.textContent!,/已儲存站內成績原文報告。|Stored item/);
});
test('authorization loss on a later course page clears retained courses and editor immediately',async()=>{
 const rows=Array.from({length:100},(_,i)=>({...course,id:'20000000-0000-4000-8000-'+String(i+1).padStart(12,'0')}));
 const client:Client={loadCoursesAdmin:async(_m,_u,options)=>{if(options?.afterId)throw new DtmGradeReportClientError('Synthetic revoked',403);return {courses:rows,limit:100,nextCursor:rows[99].id};},loadAdmin:async()=>({report:record}),manage:async()=>{throw Error('No write');}};
 const v=render(<DtmGradeReportManager managerId={manager} userId={owner} client={client}/>);await select(v);fireEvent.click(v.getByRole('button',{name:'編輯評分項目 1'}));assert.equal((v.getByLabelText('評分項目 1 名稱') as HTMLInputElement).value,'Stored item');fireEvent.click(v.getByRole('button',{name:'載入更多課程'}));await waitFor(()=>assert.ok(v.getByText('Synthetic revoked')));assert.equal(v.container.querySelector('form,select'),null);assert.doesNotMatch(v.container.textContent!,/Stored item|Synthetic course/);
});
test('duplicate submits share one pending operation and an existing singleton requires explicit discard before editing',async()=>{
 const f=await fixture(),v=f.view;f.setData({report:record});f.failWrite(new DtmGradeReportClientError('Synthetic singleton conflict',409));save(v);await waitFor(()=>assert.ok(v.getByText('Synthetic singleton conflict')));refresh(v);await waitFor(()=>assert.ok(v.getByText(/已有另一筆報告/)));assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),true);fireEvent.click(v.getByRole('button',{name:'放棄草稿並重新載入'}));await waitFor(()=>assert.equal(disabled(v.getByRole('button',{name:'儲存成績原文報告'})),false));assert.match(v.getByLabelText('已儲存成績原文報告').textContent!,/版本 2/);v.unmount();
 let writes=0,resolve!:(value:DtmGradeReportReceipt)=>void,command:DtmGradeReportAction|undefined;const client:Client={loadCoursesAdmin:async()=>({courses:[course],limit:100,nextCursor:null}),loadAdmin:async()=>({report:null}),manage:async(_m,a)=>{writes++;command=a;return new Promise(done=>{resolve=done;});}};
 const pending=render(<DtmGradeReportManager managerId={manager} userId={owner} client={client}/>);await select(pending);const form=pending.container.querySelector('form')!;fireEvent.submit(form);fireEvent.submit(form);await waitFor(()=>assert.equal(writes,1));pending.unmount();await act(async()=>resolve({id:command!.payload.id,userId:owner,courseId,kind:command!.kind,version:1,summary:'Synthetic delayed receipt'}));assert.equal(writes,1);
});
test('version ceiling is read-only and no further save or delete is dispatched',async()=>{
 const f=await fixture({report:{...record,version:999999999}});assert.equal(disabled(f.view.getByRole('button',{name:'儲存成績原文報告'})),true);fireEvent.click(f.view.getByText('刪除此站內報告'));assert.equal(disabled(f.view.getByRole('button',{name:'確認刪除成績原文報告'})),true);assert.equal(f.writes.length,0);
});
