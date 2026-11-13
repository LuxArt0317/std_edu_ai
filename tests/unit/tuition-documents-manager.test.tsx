import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire} from 'node:module';
import {TuitionDocumentsClientError,type TuitionDocumentsAction,type TuitionDocumentsAdminRecords,type TuitionDocumentsClient,type TuitionSettlement,type TuitionDocumentMetadata} from '../../src/services/tuitionDocumentsClient';
import type {TuitionDocumentReceipt} from '../../server/tuitionDocuments.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','HTMLTextAreaElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const {TuitionDocumentsManager}=await import('../../src/features/public/affairs/TuitionDocumentsManager');
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');afterEach(cleanup);after(()=>dom.window.close());
const manager='10000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003',id='20000000-0000-4000-8000-000000000001',date='2026-01-01T00:00:00Z';
const envelope={id,userId:owner,version:2,sourceMode:'local_demo' as const,createdAt:date,updatedAt:date};
const settlement:TuitionSettlement={...envelope,periodId:id,periodLabel:'Saved period',text:'Saved literal statement',rowOrder:0};
const metadata:TuitionDocumentMetadata={...envelope,kind:'summer',periodLabel:null,noteText:'',status:'metadata_only',issuer:'stu.best'};
const bundle=(settlements:TuitionSettlement[]=[],documentMetadata:TuitionDocumentMetadata[]=[]):TuitionDocumentsAdminRecords=>({periods:settlements.map(row=>({id:row.id,userId:row.userId,label:row.periodLabel})),settlements,documentMetadata,documents:[]});
const disabled=(node:HTMLElement)=>node.matches(':disabled');
async function fixture(initial=bundle()){
  let records=initial,reads=0,failRead=false,writeFailure:Error|null=null,failReadAfterWrite=false,loseWriteResponse=false;
  const writes:TuitionDocumentsAction[]=[];
  const client:Pick<TuitionDocumentsClient,'loadAdmin'|'manage'>={
    loadAdmin:async(caller,userId)=>{assert.equal(caller,manager);assert.equal(userId,owner);reads++;if(failRead){failRead=false;throw new TuitionDocumentsClientError('Synthetic refresh failed');}return structuredClone(records);},
    manage:async(caller,action)=>{
      assert.equal(caller,manager);assert.equal(action.payload.user_id,owner);writes.push(structuredClone(action));
      if(writeFailure){const error=writeFailure;writeFailure=null;throw error;}
      const payload=action.payload,nextEnvelope={...envelope,id:payload.id,version:payload.expected_version+1};
      if(action.kind==='save_tuition_settlement'){
        const row:TuitionSettlement={...nextEnvelope,periodId:payload.id,periodLabel:action.payload.period_label,text:action.payload.statement_text,rowOrder:action.payload.row_order};
        records=bundle([...records.settlements.filter(item=>item.id!==row.id),row],records.documentMetadata);
      }else if(action.kind==='save_tuition_document_metadata'){
        const row:TuitionDocumentMetadata={...nextEnvelope,kind:action.payload.kind,periodLabel:action.payload.period_label,noteText:action.payload.note_text,status:action.payload.status,issuer:'stu.best'};
        records=bundle(records.settlements,[...records.documentMetadata.filter(item=>item.id!==row.id),row]);
      }else if(action.kind==='delete_tuition_settlement')records=bundle(records.settlements.filter(item=>item.id!==payload.id),records.documentMetadata);
      else records=bundle(records.settlements,records.documentMetadata.filter(item=>item.id!==payload.id));
      if(failReadAfterWrite){failReadAfterWrite=false;failRead=true;}
      if(loseWriteResponse){loseWriteResponse=false;throw new TuitionDocumentsClientError('Synthetic committed response lost');}
      return {id:payload.id,kind:action.kind,version:payload.expected_version+1,summary:'Synthetic receipt'};
    },
  };
  const view=render(<TuitionDocumentsManager managerId={manager} userId={owner} client={client}/>);
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'Save tuition settlement'})));
  return {view,writes,client,saved:()=>records,reads:()=>reads,failWrite:(error:Error)=>{writeFailure=error;},failReadAfterSave:()=>{failReadAfterWrite=true;},loseNextWriteResponse:()=>{loseWriteResponse=true;},replace:(next:TuitionDocumentsAdminRecords)=>{records=next;}};
}
const field=(view:ReturnType<typeof render>,label:string,value:string)=>fireEvent.change(view.getByLabelText(label),{target:{value}});

test('manager hides forms until authorized load and fails closed on a foreign response',async()=>{
  let reject:(error:Error)=>void=()=>{};
  const client={loadAdmin:()=>new Promise<TuitionDocumentsAdminRecords>((_resolve,no)=>{reject=no;}),manage:async()=>{throw new Error('No writes');}};
  const view=render(<TuitionDocumentsManager managerId={manager} userId={owner} client={client}/>);assert.equal(view.container.querySelector('form'),null);
  await act(async()=>reject(new TuitionDocumentsClientError('Denied',403)));assert.equal(view.container.querySelector('form'),null);assert.ok(view.getByRole('alert'));view.unmount();
  const foreign=render(<TuitionDocumentsManager managerId={manager} userId={owner} client={{...client,loadAdmin:async()=>bundle([{...settlement,userId:other}])}}/>);
  await waitFor(()=>assert.ok(foreign.getByRole('alert')));assert.equal(foreign.container.querySelector('form'),null);assert.doesNotMatch(foreign.container.textContent??'',/Saved literal statement/);
});

test('settlement creation preserves exact null, blank, zero and versioned selected account',async()=>{
  const f=await fixture(),{view}=f;field(view,'Period label',' Synthetic period ');
  fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));await waitFor(()=>assert.equal(f.reads(),2));
  assert.equal(f.writes[0].kind,'save_tuition_settlement');assert.deepEqual(Object.keys(f.writes[0].payload).sort(),['id','user_id','request_id','expected_version','period_label','statement_text','row_order'].sort());
  assert.equal(f.writes[0].payload.expected_version,0);assert.equal(f.saved().settlements[0].text,null);assert.equal(f.saved().settlements[0].periodLabel,' Synthetic period ');assert.equal(f.saved().settlements[0].rowOrder,0);
  await waitFor(()=>assert.ok(view.getByText('Local tuition record saved. No file or payment was created.')));
  fireEvent.click(view.getByLabelText('Statement text not provided'));fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));await waitFor(()=>assert.equal(f.writes.length,2));
  assert.equal(f.writes[1].payload.expected_version,1);assert.equal(f.saved().settlements[0].text,'');assert.notEqual(f.writes[0].payload.request_id,f.writes[1].payload.request_id);
});

test('metadata has immutable kind/issuer, explicit null/blank fields and persistent deletion only',async()=>{
  const f=await fixture(bundle([], [metadata])),{view}=f;
  fireEvent.click(view.getByRole('button',{name:'Edit summer metadata'}));assert.equal(disabled(view.getByLabelText('Document kind')),true);
  assert.equal((view.getByLabelText('Period label not provided') as HTMLInputElement).checked,true);assert.equal((view.getByLabelText('Metadata note not provided') as HTMLInputElement).checked,false);
  field(view,'Metadata status','revoked');fireEvent.click(view.getByRole('button',{name:'Save tuition document metadata'}));await waitFor(()=>assert.equal(f.reads(),2));
  assert.equal(f.writes[0].kind,'save_tuition_document_metadata');assert.equal(f.saved().documentMetadata[0].issuer,'stu.best');assert.equal(f.saved().documentMetadata[0].noteText,'');assert.equal(f.saved().documentMetadata[0].periodLabel,null);assert.equal(f.saved().documentMetadata[0].status,'revoked');
  await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'Confirm tuition record deletion'})),false));
  fireEvent.click(view.getByRole('button',{name:'Confirm tuition record deletion'}));await waitFor(()=>assert.equal(f.reads(),3));assert.equal(f.writes[1].kind,'delete_tuition_document_metadata');assert.equal(f.writes[1].payload.expected_version,3);assert.deepEqual(f.saved().documentMetadata,[]);
  assert.equal(view.container.querySelector('a[download],input[type="file"],iframe'),null);
});

test('terminal revoked metadata cannot be reactivated by a form event',async()=>{
  const f=await fixture(bundle([], [{...metadata,status:'revoked'}])),{view}=f;
  fireEvent.click(view.getByRole('button',{name:'Edit summer metadata'}));assert.equal(disabled(view.getByLabelText('Metadata status')),true);
  field(view,'Metadata status','metadata_only');fireEvent.submit(view.container.querySelector('form')!);
  assert.equal(f.writes.length,0);assert.match(view.getByRole('alert').textContent??'',/Revocation is terminal/);
});

test('settlement deletion uses its saved revision and the next new record gets a fresh identifier',async()=>{
  const f=await fixture(bundle([settlement])),{view}=f;fireEvent.click(view.getByRole('button',{name:'Edit settlement Saved period'}));
  fireEvent.click(view.getByRole('button',{name:'Confirm tuition record deletion'}));await waitFor(()=>assert.equal(f.reads(),2));
  assert.equal(f.writes[0].kind,'delete_tuition_settlement');assert.equal(f.writes[0].payload.id,id);assert.equal(f.writes[0].payload.expected_version,2);assert.deepEqual(f.saved().settlements,[]);
  await waitFor(()=>assert.ok(view.getByText('Local tuition record deleted. Its identifier remains reserved.')));field(view,'Period label','New independent period');
  fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));await waitFor(()=>assert.equal(f.writes.length,2));assert.notEqual(f.writes[1].payload.id,id);assert.equal(f.writes[1].payload.expected_version,0);
});

test('uncertain failure keeps draft and immutable retry ID; explicit discard reloads saved state',async()=>{
  const f=await fixture(bundle([settlement])),{view}=f;fireEvent.click(view.getByRole('button',{name:'Edit settlement Saved period'}));field(view,'Statement text','Unconfirmed draft');f.failWrite(new TuitionDocumentsClientError('Synthetic unavailable'));
  fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));await waitFor(()=>assert.ok(view.getByText('Synthetic unavailable')));
  assert.equal((view.getByLabelText('Statement text') as HTMLTextAreaElement).value,'Unconfirmed draft');assert.equal(disabled(view.getByRole('button',{name:'New settlement'})),true);
  fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));await waitFor(()=>assert.equal(f.reads(),2));assert.deepEqual(f.writes[0],f.writes[1]);
  await waitFor(()=>assert.ok(view.getByText('Local tuition record saved. No file or payment was created.')));field(view,'Statement text','Discard this unsaved draft');
  fireEvent.click(view.getByRole('button',{name:'Discard draft and reload'}));await waitFor(()=>assert.equal((view.getByLabelText('Statement text') as HTMLTextAreaElement).value,'Unconfirmed draft'));assert.equal(f.writes.length,2);
});

test('committed metadata create with lost response permits exact receipt replay after refresh finds its own ID',async()=>{
  const f=await fixture(),{view}=f;fireEvent.click(view.getByRole('button',{name:'New document metadata'}));
  f.loseNextWriteResponse();fireEvent.click(view.getByRole('button',{name:'Save tuition document metadata'}));
  await waitFor(()=>assert.ok(view.getByText('Synthetic committed response lost')));assert.equal(f.saved().documentMetadata.length,1);
  fireEvent.click(view.getByRole('button',{name:'Refresh tuition records'}));await waitFor(()=>assert.equal(f.reads(),2));
  await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'Save tuition document metadata'})),false));
  fireEvent.click(view.getByRole('button',{name:'Save tuition document metadata'}));await waitFor(()=>assert.equal(f.writes.length,2));
  assert.deepEqual(f.writes[0],f.writes[1]);assert.equal(f.writes[1].payload.expected_version,0);assert.equal(f.saved().documentMetadata.length,1);
  await waitFor(()=>assert.ok(view.getByText('Local tuition record saved. No file or payment was created.')));
});

test('uncertain metadata create does not bypass another-ID collision after refresh',async()=>{
  const f=await fixture(),{view}=f;fireEvent.click(view.getByRole('button',{name:'New document metadata'}));
  f.failWrite(new TuitionDocumentsClientError('Synthetic unavailable'));fireEvent.click(view.getByRole('button',{name:'Save tuition document metadata'}));
  await waitFor(()=>assert.ok(view.getByText('Synthetic unavailable')));f.replace(bundle([], [metadata]));
  fireEvent.click(view.getByRole('button',{name:'Refresh tuition records'}));await waitFor(()=>assert.equal(f.reads(),2));
  assert.equal(disabled(view.getByRole('button',{name:'Save tuition document metadata'})),true);assert.equal(f.writes.length,1);
});

test('409 preserves draft and blocks write until explicit refresh rebases to latest saved revision',async()=>{
  const f=await fixture(bundle([settlement])),{view}=f;fireEvent.click(view.getByRole('button',{name:'Edit settlement Saved period'}));field(view,'Statement text','Retained after conflict');
  f.replace(bundle([{...settlement,version:4,text:'Concurrent saved statement'}]));f.failWrite(new TuitionDocumentsClientError('Synthetic conflict',409));
  fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));await waitFor(()=>assert.ok(view.getByText('Synthetic conflict')));assert.equal(disabled(view.getByRole('button',{name:'Save tuition settlement'})),true);
  fireEvent.click(view.getByRole('button',{name:'Refresh tuition records'}));await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'Save tuition settlement'})),false));assert.equal((view.getByLabelText('Statement text') as HTMLTextAreaElement).value,'Retained after conflict');
  fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));await waitFor(()=>assert.equal(f.writes.length,2));assert.equal(f.writes[1].payload.expected_version,4);assert.notEqual(f.writes[0].payload.request_id,f.writes[1].payload.request_id);
});

test('confirmed write plus failed reload requests only refresh, never another mutation',async()=>{
  const f=await fixture(),{view}=f;field(view,'Period label','Confirmed period');f.failReadAfterSave();
  fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));await waitFor(()=>assert.match(view.getByRole('alert').textContent??'',/write was confirmed/));
  assert.equal(disabled(view.getByRole('button',{name:'Save tuition settlement'})),true);assert.equal(f.writes.length,1);
  fireEvent.click(view.getByRole('button',{name:'Refresh tuition records'}));await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'Save tuition settlement'})),false));assert.equal(f.writes.length,1);assert.equal(f.saved().settlements.length,1);
});

test('deleted records cannot be silently recreated and occupied metadata slots cannot create duplicates',async()=>{
  const f=await fixture(bundle([settlement],[metadata])),{view}=f;fireEvent.click(view.getByRole('button',{name:'Edit settlement Saved period'}));field(view,'Statement text','Lost remote row');
  f.replace(bundle([], [metadata]));fireEvent.click(view.getByRole('button',{name:'Refresh tuition records'}));await waitFor(()=>assert.ok(view.getByText(/This saved record is no longer available/)));assert.equal(disabled(view.getByRole('button',{name:'Save tuition settlement'})),true);
  fireEvent.click(view.getByRole('button',{name:'Discard draft and reload'}));await waitFor(()=>assert.equal(disabled(view.getByRole('button',{name:'New document metadata'})),false));
  fireEvent.click(view.getByRole('button',{name:'New document metadata'}));assert.ok(view.getByText(/already has summer metadata/));assert.equal(disabled(view.getByRole('button',{name:'Save tuition document metadata'})),true);assert.equal(f.writes.length,0);
});

test('account switch aborts pending save and late receipt cannot update the new selected account',async()=>{
  let signal:AbortSignal|undefined,finish:(receipt:TuitionDocumentReceipt)=>void=()=>{},pending:TuitionDocumentsAction|null=null,saved=0;
  const client:Pick<TuitionDocumentsClient,'loadAdmin'|'manage'>={loadAdmin:async(_manager,userId)=>userId===owner?bundle([settlement]):bundle(),manage:async(_manager,action,abort)=>{signal=abort;pending=action;return new Promise<TuitionDocumentReceipt>(resolve=>{finish=resolve;});}};
  const view=render(<TuitionDocumentsManager managerId={manager} userId={owner} client={client} onSaved={()=>saved++}/>);await waitFor(()=>assert.ok(view.getByRole('button',{name:'Edit settlement Saved period'})));
  fireEvent.click(view.getByRole('button',{name:'Edit settlement Saved period'}));field(view,'Statement text','Old account draft');fireEvent.click(view.getByRole('button',{name:'Save tuition settlement'}));
  view.rerender(<TuitionDocumentsManager managerId={manager} userId={other} client={client} onSaved={()=>saved++}/>);assert.equal(signal?.aborted,true);
  const action=pending as unknown as TuitionDocumentsAction;await act(async()=>finish({id:action.payload.id,kind:action.kind,version:action.payload.expected_version+1,summary:'Late'}));
  assert.equal(saved,0);assert.doesNotMatch(view.container.textContent??'',/Old account draft|Saved period/);
});
