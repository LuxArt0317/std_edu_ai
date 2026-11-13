import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter,useLocation} from 'react-router';
import type {AffairsSnapshot,DtmCourse,DtmMaterial} from '../../src/services/schoolAffairsWorkspace';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',courseId='20000000-0000-4000-8000-000000000001',materialId='30000000-0000-4000-8000-000000000001';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','Element','SVGElement','NodeFilter','KeyboardEvent','CustomEvent','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','FormData','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});Object.defineProperty(globalThis,'PointerEvent',{value:dom.window.MouseEvent,configurable:true});Object.defineProperty(dom.window,'PointerEvent',{value:dom.window.MouseEvent,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,writable:true,configurable:true});
type Session={data:{session:{user:{id:string};access_token:string}};error:null};
const session=(id=owner):Session=>({data:{session:{user:{id},access_token:'synthetic-'+id}},error:null});
const globals=globalThis as typeof globalThis&{__resourceEditorSession:()=>Promise<Session>};globals.__resourceEditorSession=async()=>session();
const hooks=registerHooks({load(url,context,next){
 if(/\/affairs\/authClient\.ts$/.test(url))return{format:'module',shortCircuit:true,source:'export const affairsClient={auth:{getSession:()=>globalThis.__resourceEditorSession()}};'};
 if(url.endsWith('.css'))return{format:'module',shortCircuit:true,source:'export {};'};return next(url,context);
}});
const originalFetch=globalThis.fetch;const unexpected:typeof fetch=async()=>{throw Error('Unexpected offline request');};let respond=unexpected;globalThis.fetch=(...args)=>respond(...args);
const {render,cleanup,fireEvent,waitFor,act,within}=await import('@testing-library/react');
const {DtmStudentRecords}=await import('../../src/features/public/dtm/DtmStudentRecords');
afterEach(()=>{cleanup();respond=unexpected;globals.__resourceEditorSession=async()=>session();});after(()=>{hooks.deregister();globalThis.fetch=originalFetch;dom.window.close();});
const material=(targetUrl:string|null|undefined='https://example.com/old'):DtmMaterial=>({id:materialId,title:'Synthetic material',kind:'page',summary:'Synthetic summary',position:1,sourceMode:'personal',sourceUrl:'https://dtm.stu.edu.tw/mod/url/view.php?id=123',...(targetUrl===undefined?{}:{targetUrl})});
const course=(row=material()):DtmCourse=>({id:courseId,title:'Synthetic course',code:'QA',term:'Synthetic term',sourceMode:'personal',role:'student',materials:[row],meetings:[],grades:[{id:'40000000-0000-4000-8000-000000000001',label:'Synthetic grade',score:0,maximum:10,date:null,feedback:'Synthetic feedback'}]});
const snapshot=(userId=owner,row=course())=>({profile:{userId,displayName:'Synthetic caller',email:'synthetic@example.invalid',role:'student'},dtm:{courses:[row]},assignments:[],checkedAt:'2030-01-01T00:00:00Z'} as unknown as AffairsSnapshot);
const t=(_zh:string,en:string)=>en;function Path(){return <span aria-label="Current route">{useLocation().pathname}</span>;}
const tree=(userId=owner,row=course(),refresh=()=>{},view:'materials'|'meetings'='meetings')=><MemoryRouter initialEntries={['/dtm/course/'+courseId]}><DtmStudentRecords snapshot={snapshot(userId,row)} course={row} mode="course" view={view} t={t} refresh={refresh}/><Path/></MemoryRouter>;
async function menu(view:ReturnType<typeof render>,label:string){fireEvent.keyDown(view.getByRole('button',{name:'Course menu'}),{key:'Enter'});await waitFor(()=>assert.ok(view.getByRole('menuitem',{name:label})));fireEvent.click(view.getByRole('menuitem',{name:label}));}
async function edit(view:ReturnType<typeof render>){await menu(view,'Manage materials');await waitFor(()=>assert.ok(view.getByRole('dialog',{name:'Manage materials'})));fireEvent.click(within(view.getByRole('dialog')).getByRole('button',{name:'Edit'}));await waitFor(()=>assert.ok(view.getByLabelText('Resource destination URL (optional)')));}
const submit=(view:ReturnType<typeof render>)=>fireEvent.submit(view.getByLabelText('Material name').closest('form')!);
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};

test('course material opens its native route instead of a summary dialog or remote target',async()=>{
 respond=async(input,init)=>{assert.equal(String(input),'/api/affairs-data?scope=dtm-course-content&course_id='+courseId);assert.equal(init?.method,'GET');return Response.json({course:{id:courseId,userId:owner,title:'Synthetic course',code:'QA',term:'Synthetic term'},content:null,activities:[{kind:'material',id:materialId,title:'Synthetic material',materialKind:'page',summary:'Synthetic summary',position:1,sourceMode:'personal',sourceUrl:null}],total:1,limit:100,nextCursor:null,revision:'a'.repeat(64),unavailableReferenceCount:0});};
 const view=render(tree(owner,course(),()=>{},'materials'));await waitFor(()=>assert.ok(view.getByRole('button',{name:'Synthetic material'})));fireEvent.click(view.getByRole('button',{name:'Synthetic material'}));await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/dtm/course/'+courseId+'/material/'+materialId));assert.equal(view.queryByRole('dialog'),null);
});
test('material management validates destinations separately, preserves failed drafts and retries the exact save',async()=>{
 const writes:Array<{kind:string;payload:Record<string,string>}>=[];let refreshed=0;
 respond=async(input,init)=>{assert.equal(String(input),'/api/affairs-action');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+owner);const body=JSON.parse(String(init?.body));writes.push(body);return writes.length===1?Response.json({error:'Synthetic retry'},{status:503}):Response.json({id:body.payload.id,kind:body.kind});};
 const view=render(tree(owner,course(),()=>refreshed++));await edit(view);
 assert.equal((view.getByLabelText('Resource destination URL (optional)') as HTMLInputElement).value,'https://example.com/old');
 const field=view.getByLabelText('Resource destination URL (optional)');for(const invalid of ['http://example.com/','https://127.0.0.1/','https://example.com/ x',' https://example.com/','https://user:pass@example.com/']){fireEvent.change(field,{target:{value:invalid}});submit(view);assert.ok(view.getByRole('alert'));assert.equal(writes.length,0);}
 const target='https://Example.com:443/unit?value=1#details';fireEvent.change(field,{target:{value:target}});submit(view);await waitFor(()=>assert.equal(writes.length,1));await waitFor(()=>assert.equal(view.getByRole('alert').textContent,'Synthetic retry'));assert.equal((field as HTMLInputElement).value,target);submit(view);await waitFor(()=>assert.equal(refreshed,1));assert.deepEqual(writes[0],writes[1]);assert.equal(writes[0].payload.target_url,target);assert.equal(writes[0].payload.source_url,material().sourceUrl);assert.equal(writes[0].kind,'save_dtm_material');
});
test('explicit clear and absent older target field have distinct write semantics; Cancel does not write',async()=>{
 const writes:Array<Record<string,string>>=[];respond=async(_path,init)=>{const action=JSON.parse(String(init?.body));writes.push(action.payload);return Response.json({id:action.payload.id,kind:action.kind});};
 let view=render(tree());await edit(view);fireEvent.change(view.getByLabelText('Resource destination URL (optional)'),{target:{value:''}});submit(view);await waitFor(()=>assert.equal(writes.length,1));assert.equal(writes[0].target_url,'');view.unmount();
 const old=material();delete old.targetUrl;view=render(tree(owner,course(old)));await edit(view);submit(view);await waitFor(()=>assert.equal(writes.length,2));assert.equal(Object.hasOwn(writes[1],'target_url'),false);view.unmount();
 view=render(tree());await edit(view);fireEvent.change(view.getByLabelText('Resource destination URL (optional)'),{target:{value:'https://example.com/discard'}});fireEvent.click(view.getByRole('button',{name:'Cancel'}));assert.equal(writes.length,2);assert.equal(view.queryByLabelText('Resource destination URL (optional)'),null);
});
for(const returned of [owner,other])test('pending material save is aborted on account switch even when queued session returns '+(returned===owner?'old':'new')+' caller',async()=>{
 const pending=deferred<Session>();let writes=0;globals.__resourceEditorSession=()=>pending.promise;respond=async()=>{writes++;throw Error('No write allowed');};
 const view=render(tree());await edit(view);submit(view);submit(view);view.rerender(tree(other));await act(async()=>pending.resolve(session(returned)));assert.equal(writes,0);assert.equal(view.queryByLabelText('Resource destination URL (optional)'),null);assert.equal(view.queryByRole('alert'),null);
});
test('late save completion after unmount cannot refresh and synchronous duplicate submission is suppressed',async()=>{
 const pending=deferred<Response>();let writes=0,refreshed=0;let signal:AbortSignal|undefined;
 respond=async(_path,init)=>{writes++;signal=init?.signal as AbortSignal;return pending.promise;};const view=render(tree(owner,course(),()=>refreshed++));await edit(view);submit(view);submit(view);await waitFor(()=>assert.equal(writes,1));view.unmount();assert.equal(signal?.aborted,true);await act(async()=>pending.resolve(Response.json({id:materialId,kind:'save_dtm_material'})));assert.equal(refreshed,0);
});
test('material delete remains available with failed retry and current caller scope',async()=>{
 let refreshed=0;const writes:unknown[]=[];respond=async(_path,init)=>{assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+owner);const action=JSON.parse(String(init?.body));writes.push(action);return writes.length===1?Response.json({error:'Synthetic retry'},{status:503}):Response.json({id:materialId,kind:'delete_dtm_material'});};
 const view=render(tree(owner,course(),()=>refreshed++));await menu(view,'Manage materials');await waitFor(()=>assert.ok(view.getByRole('dialog',{name:'Manage materials'})));fireEvent.click(within(view.getByRole('dialog')).getByRole('button',{name:'Delete'}));await waitFor(()=>assert.ok(view.getByRole('dialog',{name:'Delete record'})));fireEvent.click(within(view.getByRole('dialog')).getByRole('button',{name:'Delete'}));await waitFor(()=>assert.equal(view.getByRole('alert').textContent,'Synthetic retry'));fireEvent.click(within(view.getByRole('dialog')).getByRole('button',{name:'Delete'}));await waitFor(()=>assert.equal(refreshed,1));assert.deepEqual(writes,[{kind:'delete_dtm_material',payload:{id:materialId,course_id:courseId}},{kind:'delete_dtm_material',payload:{id:materialId,course_id:courseId}}]);
});
test('existing personal grade modal and grade edit remain separate from resource navigation',async()=>{
 const view=render(tree());await menu(view,'Personal grade entries');await waitFor(()=>assert.ok(view.getByRole('dialog',{name:'Personal grade entries'})));fireEvent.click(within(view.getByRole('dialog')).getByRole('button',{name:'Synthetic grade'}));await waitFor(()=>assert.ok(view.getByRole('dialog',{name:'Synthetic grade'})));assert.ok(view.getByText('Synthetic feedback'));assert.ok(view.getByText('0 / 10 · 0.0%'));fireEvent.click(within(view.getByRole('dialog')).getByRole('button',{name:'Edit'}));assert.ok(view.getByLabelText('Score'));assert.equal(view.queryByLabelText('Resource destination URL (optional)'),null);fireEvent.click(view.getByRole('button',{name:'Cancel'}));assert.equal(view.getByLabelText('Current route').textContent,'/dtm/course/'+courseId);
});
