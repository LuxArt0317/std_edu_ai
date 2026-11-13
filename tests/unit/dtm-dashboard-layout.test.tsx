import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {StrictMode} from 'react';
import {createDtmDashboardLayoutClient,dtmDashboardLayoutDefaults,DtmDashboardLayoutError,type DtmDashboardLayoutAction,type DtmDashboardLayoutClient,type DtmDashboardLayoutSnapshot} from '../../src/services/dtmDashboardLayout';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const requestId='20000000-0000-4000-8000-000000000001';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const hooks=registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',shortCircuit:true,source:'export {};'}:next(url,context);}});
const {render,cleanup,fireEvent,waitFor,act,within}=await import('@testing-library/react');
const {DtmDashboardLayout}=await import('../../src/features/public/dtm/DtmDashboardLayout');
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('No network permitted in this suite.');};
afterEach(cleanup);after(()=>{hooks.deregister();globalThis.fetch=originalFetch;dom.window.close();});
const t=(_zh:string,en:string)=>en;
const labels={important:'Important information',navigation:'Navigation',contacts:'Contacts'};
const blocks=(id:keyof typeof labels,controls:React.ReactNode)=><section className="dtm-card" data-testid={id}><h2>{labels[id]}</h2>{controls}<p>Synthetic {id} content</p></section>;
const tree=(client:DtmDashboardLayoutClient,userId=owner)=><div className="dtm is-dashboard"><DtmDashboardLayout userId={userId} client={client} t={t} renderBlock={blocks}/></div>;
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
function fixture(){let value=dtmDashboardLayoutDefaults();const writes:DtmDashboardLayoutAction[]=[];const client:DtmDashboardLayoutClient={load:async()=>structuredClone(value),write:async(_id,action)=>{writes.push(structuredClone(action));value={version:action.payload.expected_version+1,blocks:action.kind==='save_dtm_dashboard_layout'?action.payload.blocks:dtmDashboardLayoutDefaults().blocks,updatedAt:'2030-01-01T00:00:00.123456Z'};return structuredClone(value);}};return {client,writes,get value(){return value;},set value(next:DtmDashboardLayoutSnapshot){value=next;}};}
async function ready(client:DtmDashboardLayoutClient){const view=render(tree(client));await waitFor(()=>assert.ok(view.getByRole('button',{name:'Customize this page'})));return view;}
function edit(view:ReturnType<typeof render>){fireEvent.click(view.getByRole('button',{name:'Customize this page'}));}
function configure(view:ReturnType<typeof render>,id:keyof typeof labels='important'){
  const block=view.getByTestId(id);(block.querySelector('details') as HTMLDetailsElement).open=true;
  fireEvent.click(within(block).getByRole('button',{name:'Configure '+labels[id]+' block'}));
}
function pageFields(view:ReturnType<typeof render>){fireEvent.click(view.getByRole('button',{name:/On this page/}));}
const saveAction=():DtmDashboardLayoutAction=>({kind:'save_dtm_dashboard_layout',payload:{request_id:requestId,expected_version:0,blocks:dtmDashboardLayoutDefaults().blocks}});

test('defaults appear only after a successful read; failed reads show no default blocks',async()=>{
  const first=deferred<DtmDashboardLayoutSnapshot>();let fail=true;
  const client:DtmDashboardLayoutClient={load:async()=>{if(fail)return first.promise;return dtmDashboardLayoutDefaults();},write:async()=>{throw new Error('Unexpected write');}};
  const view=render(tree(client));assert.ok(!view.queryByTestId('important'));assert.ok(view.getByRole('status'));
  await act(async()=>{first.resolve(Promise.reject(new Error('Synthetic unavailable')) as never);});
  await waitFor(()=>assert.ok(view.getByRole('alert')));assert.ok(!view.queryByRole('button',{name:'Customize this page'}));
  fail=false;fireEvent.click(view.getByRole('button',{name:'Reload'}));await waitFor(()=>assert.ok(view.getByTestId('important')));
});

test('source configuration is collapsed, static settings stay read-only, cancel performs no write',async()=>{
  const f=fixture(),view=await ready(f.client);edit(view);configure(view,'contacts');
  assert.ok(view.getByRole('heading',{name:'Configure Contacts block'}));assert.equal((view.getByLabelText('Block title') as HTMLInputElement).readOnly,true);
  assert.equal((view.getByLabelText('Additional CSS classes') as HTMLInputElement).readOnly,true);
  assert.ok(!view.queryByRole('combobox',{name:'Visible'}));assert.equal(view.getByRole('button',{name:/Where this block appears/}).getAttribute('aria-expanded'),'false');
  fireEvent.click(view.getByRole('button',{name:'Expand all'}));assert.equal(view.getAllByRole('combobox').length,3);assert.equal(view.getByRole('combobox',{name:'Weight'}).querySelectorAll('option').length,21);
  assert.ok(view.getByText('System'));assert.ok(view.getByText('1',{selector:'.dtm-block-value'}));
  fireEvent.change(view.getByRole('combobox',{name:'Region'}),{target:{value:'content'}});fireEvent.click(view.getByRole('button',{name:'Cancel'}));
  assert.equal(f.writes.length,0);assert.ok(view.getByTestId('contacts').closest('.dtm-left'));
  configure(view,'navigation');assert.equal((view.getByLabelText('Trim length') as HTMLInputElement).value,'50');assert.equal((view.getByLabelText('Trim length') as HTMLInputElement).readOnly,true);
});

test('save sends all3 blocks, applies saved region/weight, hides only outside edit mode, and resets persisted defaults',async()=>{
  const f=fixture(),view=await ready(f.client);edit(view);configure(view,'navigation');pageFields(view);
  fireEvent.change(view.getByRole('combobox',{name:'Region'}),{target:{value:'side-post'}});fireEvent.change(view.getByRole('combobox',{name:'Weight'}),{target:{value:'-10'}});fireEvent.change(view.getByRole('combobox',{name:'Visible'}),{target:{value:'false'}});
  fireEvent.click(view.getByRole('button',{name:'Save changes'}));await waitFor(()=>assert.ok(view.getByRole('button',{name:'Stop customizing this page'})));
  assert.equal(f.writes[0].kind,'save_dtm_dashboard_layout');assert.equal('blocks' in f.writes[0].payload&&f.writes[0].payload.blocks.length,3);assert.ok(view.getByTestId('navigation').closest('.dtm-dashboard-right'));
  fireEvent.click(view.getByRole('button',{name:'Stop customizing this page'}));assert.ok(!view.queryByTestId('navigation'));
  edit(view);assert.ok(view.getByTestId('navigation'));fireEvent.click(view.getByRole('button',{name:'Reset page to default'}));await waitFor(()=>assert.equal(f.writes.length,2));
  await waitFor(()=>assert.ok(view.getByTestId('navigation').closest('.dtm-left')));assert.equal(f.writes[1].payload.expected_version,1);assert.equal(f.value.version,2);
});

test('Hide is offered only for Important/Contacts and its failure reuses the exact operation',async()=>{
  const f=fixture(),base=f.client.write;let fail=true;f.client.write=async(id,action,signal)=>{if(fail){f.writes.push(structuredClone(action));throw new DtmDashboardLayoutError('Uncertain response');}return base(id,action,signal);};
  const view=await ready(f.client);edit(view);for(const details of view.container.querySelectorAll('details'))details.open=true;
  assert.ok(!view.queryByRole('button',{name:'Hide Navigation block'}));fireEvent.click(view.getByRole('button',{name:'Hide Important information block'}));await waitFor(()=>assert.ok(view.getByRole('alert')));
  fail=false;fireEvent.click(view.getByRole('button',{name:'Retry'}));await waitFor(()=>assert.equal(f.writes.length,2));assert.deepEqual(f.writes[1],f.writes[0]);
  await waitFor(()=>assert.ok(!view.queryByRole('alert')));fireEvent.click(view.getByRole('button',{name:'Stop customizing this page'}));assert.ok(!view.queryByTestId('important'));
});

test('lost save response retains exact request and draft even after Refresh observes the committed row',async()=>{
  const f=fixture(),base=f.client.write;let lose=true;f.client.write=async(id,action,signal)=>{const result=await base(id,action,signal);if(lose)throw new DtmDashboardLayoutError('Lost response');return result;};
  const view=await ready(f.client);edit(view);configure(view);pageFields(view);fireEvent.change(view.getByRole('combobox',{name:'Weight'}),{target:{value:'7'}});fireEvent.click(view.getByRole('button',{name:'Save changes'}));
  await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal((view.getByRole('combobox',{name:'Weight'}) as HTMLSelectElement).value,'7');
  fireEvent.click(view.getByRole('button',{name:'Reload'}));await waitFor(()=>assert.equal((view.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled,false));lose=false;fireEvent.click(view.getByRole('button',{name:'Save changes'}));
  await waitFor(()=>assert.equal(f.writes.length,2));assert.deepEqual(f.writes[1],f.writes[0]);await waitFor(()=>assert.ok(!view.queryByRole('heading',{name:'Configure Important information block'})));
});

for(const kind of ['hide','reset'] as const)test('uncertain '+kind+' remains retryable after Reload, with the exact original request',async()=>{
  const f=fixture(),base=f.client.write;let lose=true;f.client.write=async(id,action,signal)=>{const value=await base(id,action,signal);if(lose)throw new DtmDashboardLayoutError('Synthetic lost response');return value;};
  const view=await ready(f.client);edit(view);
  if(kind==='hide'){const block=view.getByTestId('important');(block.querySelector('details') as HTMLDetailsElement).open=true;fireEvent.click(within(block).getByRole('button',{name:'Hide Important information block'}));}
  else fireEvent.click(view.getByRole('button',{name:'Reset page to default'}));
  await waitFor(()=>assert.ok(view.getByRole('alert')));fireEvent.click(view.getByRole('button',{name:'Reload'}));await waitFor(()=>assert.ok(view.getByRole('status').textContent?.includes('unconfirmed')));
  lose=false;fireEvent.click(view.getByRole('button',{name:'Retry'}));await waitFor(()=>assert.equal(f.writes.length,2));assert.deepEqual(f.writes[1],f.writes[0]);await waitFor(()=>assert.equal((view.getByRole('button',{name:'Stop customizing this page'}) as HTMLButtonElement).disabled,false));
});

test('409 keeps draft and requires successful explicit reload before a fresh-version save',async()=>{
  const f=fixture(),base=f.client.write;let stale=true;f.client.write=async(id,action,signal)=>{if(stale){f.writes.push(structuredClone(action));throw new DtmDashboardLayoutError('Changed',409);}return base(id,action,signal);};
  const view=await ready(f.client);edit(view);configure(view);pageFields(view);fireEvent.change(view.getByRole('combobox',{name:'Region'}),{target:{value:'content'}});fireEvent.click(view.getByRole('button',{name:'Save changes'}));
  await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal((view.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled,true);
  f.value={...f.value,version:4,updatedAt:'2030-01-01T00:00:00Z'};fireEvent.click(view.getByRole('button',{name:'Reload'}));await waitFor(()=>assert.equal((view.getByRole('button',{name:'Save changes'}) as HTMLButtonElement).disabled,false));
  assert.equal((view.getByRole('combobox',{name:'Region'}) as HTMLSelectElement).value,'content');stale=false;fireEvent.click(view.getByRole('button',{name:'Save changes'}));await waitFor(()=>assert.equal(f.writes.length,2));
  assert.equal(f.writes[1].payload.expected_version,4);assert.notEqual(f.writes[1].payload.request_id,f.writes[0].payload.request_id);
});

test('account changes abort and hide drafts; late writes cannot apply to the new account',async()=>{
  const f=fixture(),late=deferred<DtmDashboardLayoutSnapshot>();let sentSignal:AbortSignal|undefined;f.client.write=async(_id,_action,signal)=>{sentSignal=signal;return late.promise;};
  const view=await ready(f.client);edit(view);configure(view);pageFields(view);fireEvent.change(view.getByRole('combobox',{name:'Visible'}),{target:{value:'false'}});fireEvent.click(view.getByRole('button',{name:'Save changes'}));
  view.rerender(tree(f.client,other));await waitFor(()=>assert.ok(view.getByRole('button',{name:'Customize this page'})));assert.equal(sentSignal?.aborted,true);
  await act(async()=>late.resolve({version:1,blocks:f.value.blocks.map(block=>({...block,visible:false})),updatedAt:'2030-01-01T00:00:00Z'}));
  assert.ok(view.getByTestId('important'));assert.ok(!view.queryByRole('combobox',{name:'Visible'}));
});

test('an authentication mismatch during save removes the prior layout before the auth context catches up',async()=>{
  const f=fixture();f.client.write=async()=>{throw new DtmDashboardLayoutError('Account changed',401);};
  const view=await ready(f.client);edit(view);configure(view);fireEvent.click(view.getByRole('button',{name:'Save changes'}));
  await waitFor(()=>assert.ok(view.getByRole('alert')));assert.ok(!view.queryByTestId('important'));assert.ok(!view.queryByRole('button',{name:'Customize this page'}));assert.ok(!view.queryByRole('heading',{name:'Configure Important information block'}));
});

test('StrictMode effect restart never reuses an aborted load and menus close on Escape',async()=>{
  const f=fixture(),signals:AbortSignal[]=[];f.client.load=async(_id,signal)=>{signals.push(signal!);return dtmDashboardLayoutDefaults();};
  const view=render(<StrictMode>{tree(f.client)}</StrictMode>);await waitFor(()=>assert.ok(view.getByRole('button',{name:'Customize this page'})));assert.equal(signals.length,2);assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
  edit(view);const details=view.getByTestId('important').querySelector('details')!;details.open=true;fireEvent.keyDown(details,{key:'Escape'});assert.equal(details.open,false);assert.equal(document.activeElement,details.querySelector('summary'));
  assert.ok(!view.queryByText('HTML'));assert.ok(!view.queryByText('Administration'));
});

test('transport verifies exact caller before dispatch and after response; delayed session switches cannot write',async()=>{
  for(const resolvedId of [owner,other]){const delayed=deferred<{userId:string;token:string}|null>(),controller=new AbortController();let posts=0;
    const client=createDtmDashboardLayoutClient(()=>delayed.promise,async()=>{posts++;return Response.json(dtmDashboardLayoutDefaults());});
    const writing=client.write(owner,saveAction(),controller.signal);controller.abort();delayed.resolve({userId:resolvedId,token:'synthetic'});await assert.rejects(writing);assert.equal(posts,0);}
  let calls=0,reads=0;const client=createDtmDashboardLayoutClient(async()=>({userId:++reads===1?owner:other,token:'synthetic'}),async()=>{calls++;return Response.json(dtmDashboardLayoutDefaults());});
  await assert.rejects(client.load(owner),(error:unknown)=>error instanceof DtmDashboardLayoutError&&error.status===401);assert.equal(calls,1);
});

test('transport uses exact scope/JWT and freezes request fields before session awaits',async()=>{
  const delayed=deferred<{userId:string;token:string}|null>(),action=saveAction();let body:DtmDashboardLayoutAction|undefined;
  const client=createDtmDashboardLayoutClient(()=>delayed.promise,async(input,init)=>{assert.equal(String(input),'/api/affairs-action');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-token');assert.equal(init?.credentials,'omit');body=JSON.parse(String(init?.body));return Response.json({version:1,blocks:dtmDashboardLayoutDefaults().blocks,updatedAt:'2030-01-01T00:00:00Z'});});
  const writing=client.write(owner,action);action.payload.expected_version=6;delayed.resolve({userId:owner,token:'synthetic-token'});await writing;assert.equal(body?.payload.expected_version,0);
  const reader=createDtmDashboardLayoutClient(async()=>({userId:owner,token:'synthetic'}),async input=>{assert.equal(String(input),'/api/affairs-data?scope=dtm-dashboard-layout');return Response.json(dtmDashboardLayoutDefaults());});assert.deepEqual(await reader.load(owner),dtmDashboardLayoutDefaults());
});

test('malformed layouts, invented blocks, version0 nondefaults, invalid timestamps and oversized bodies fail closed',async()=>{
  const good=dtmDashboardLayoutDefaults();const values=[{...good,ownerId:other},{...good,blocks:[...good.blocks,good.blocks[0]]},{...good,blocks:good.blocks.map(block=>({...block,weight:0}))},{...good,version:1},{...good,version:1,updatedAt:'2030-02-30T00:00:00Z'},'x'.repeat(4100)];
  for(const value of values){const client=createDtmDashboardLayoutClient(async()=>({userId:owner,token:'synthetic'}),async()=>Response.json(value));await assert.rejects(client.load(owner));}
  let writes=0;const client=createDtmDashboardLayoutClient(async()=>({userId:owner,token:'synthetic'}),async()=>{writes++;return Response.json(good);});
  const invalid=saveAction();if(invalid.kind==='save_dtm_dashboard_layout')invalid.payload.blocks[0].weight=11;await assert.rejects(client.write(owner,invalid));assert.equal(writes,0);
});

test('write verifies returned version and exact saved blocks; failure status and stalled body deadline stay bounded',async()=>{
  for(const reply of [dtmDashboardLayoutDefaults(),{version:1,blocks:dtmDashboardLayoutDefaults().blocks.map(block=>({...block,visible:false})),updatedAt:'2030-01-01T00:00:00Z'}]){
    const client=createDtmDashboardLayoutClient(async()=>({userId:owner,token:'synthetic'}),async()=>Response.json(reply));await assert.rejects(client.write(owner,saveAction()));}
  const stale=createDtmDashboardLayoutClient(async()=>({userId:owner,token:'synthetic'}),async()=>Response.json({error:'private upstream text'},{status:409}));await assert.rejects(stale.write(owner,saveAction()),(error:unknown)=>error instanceof DtmDashboardLayoutError&&error.status===409&&!error.message.includes('private upstream'));
  let cancelled=false;const timeout=createDtmDashboardLayoutClient(async()=>({userId:owner,token:'synthetic'}),async()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),15);await assert.rejects(timeout.load(owner),(error:unknown)=>error instanceof DtmDashboardLayoutError&&error.status===504);assert.equal(cancelled,true);
});

test('source measured form CSS and responsive containment rules stay scoped',()=>{
  const css=readFileSync(new URL('../../src/features/public/dtm/dtm-dashboard-layout.css',import.meta.url),'utf8');
  const theme=readFileSync(new URL('../../src/features/public/dtm/digital-materials.css',import.meta.url),'utf8');
  assert.match(theme,/font-family: "DTM Navigation Icons"/);assert.match(css,/font: 14px\/19px "DTM Navigation Icons"/);assert.doesNotMatch(css,/\bDTMNavigationIcons\b/);
  assert.match(css,/flex: 0 0 245px/);assert.match(css,/padding-top: 5px; font-size: 14px; font-weight: 700; line-height: 20px/);
  assert.match(css,/width: 220px/);assert.match(css,/height: 42px/);assert.match(css,/font: 14px\/20px "Helvetica Neue",Helvetica,Arial,sans-serif/);
  for(const width of ['44.5','77.5','108.5'])assert.ok(css.includes('width: '+width+'px'));
  assert.match(css,/margin: 20px 0; padding: 19px 20px 20px 0/);assert.match(css,/margin-left: 265px/);assert.match(css,/margin: 0 0 10px 5px/);assert.match(css,/display: flow-root; margin: 0; padding: 0; border: 0/);
  assert.match(css,/@media\(max-width:767px\)/);assert.match(css,/minmax\(0,1fr\)/);
});
