import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {MemoryRouter,useLocation} from 'react-router';
import type {User} from '@supabase/supabase-js';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','Element','SVGElement','NodeFilter','KeyboardEvent','CustomEvent','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','FormData','getComputedStyle','localStorage'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:dom.window.requestAnimationFrame.bind(dom.window),configurable:true});
Object.defineProperty(globalThis,'cancelAnimationFrame',{value:dom.window.cancelAnimationFrame.bind(dom.window),configurable:true});
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000001',second='20000000-0000-4000-8000-000000000002';
const globalSession=globalThis as typeof globalThis&{__gradeContextUser?:string};
const hook=registerHooks({load(url,context,next){
  if(/\/affairs\/authClient\.ts$/.test(url))return {format:'module',shortCircuit:true,source:`
    export const affairsClient={auth:{getSession:async()=>({data:{session:{user:{id:globalThis.__gradeContextUser},access_token:'synthetic-'+globalThis.__gradeContextUser}},error:null})}};
    export const safeSchoolReturnPath=(value,fallback)=>typeof value==='string'&&value.startsWith('/dtm')?value:fallback;
    export const signOutAffairs=async()=>{};export const startGoogleSignIn=async()=>{throw Error('No network');};`};
  if(/\/public\/PublicAssistant\.tsx$/.test(url))return {format:'module',shortCircuit:true,source:'export const campusAssistantOpenEvent="synthetic-assistant-open";'};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};
  return next(url,context);
}});
const originalFetch=globalThis.fetch,reads:string[]=[];
const row=(courseId=id)=>({id:courseId,title:courseId===id?'Synthetic contextual course':'Synthetic other course',code:'TEST',term:'Synthetic term',role:'student',sourceMode:'personal',materials:[],meetings:[],grades:[]});
const snapshot=(userId=owner)=>({profile:{userId,displayName:'Synthetic caller',email:'synthetic@example.invalid',role:'student'},dtm:{courses:userId===owner?[row(),row(second)]:[],notices:[]},assignments:[]});
let mismatched=false;
globalThis.fetch=async(input,init)=>{
  const path=String(input);reads.push(path);assert.equal(init?.method??'GET','GET');
  assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+globalSession.__gradeContextUser);
  if(path==='/api/affairs-data')return Response.json(snapshot(mismatched?other:globalSession.__gradeContextUser));
  if(path==='/api/affairs-data?scope=dtm-grade-report-overview')return Response.json({courses:[row(),row(second)].map(course=>({id:course.id,title:course.title,code:course.code,term:course.term,userId:owner,gradeText:null})),limit:100,nextCursor:null});
  if(path==='/api/affairs-data?scope=dtm-grade-report&course_id='+id)return Response.json({report:null});
  throw Error('Unexpected read '+path);
};
const {render,cleanup,fireEvent,waitFor,within}=await import('@testing-library/react');
const {default:DigitalMaterials}=await import('../../src/features/public/dtm/DigitalMaterials');
const {AffairsContext}=await import('../../src/features/public/affairs/authContext');
afterEach(()=>{cleanup();reads.length=0;mismatched=false;delete globalSession.__gradeContextUser;dom.window.localStorage.clear();});
after(()=>{hook.deregister();globalThis.fetch=originalFetch;dom.window.close();});
function Path(){return <span aria-label="Current route">{useLocation().pathname}</span>;}
const tree=(path:string,userId=owner)=><AffairsContext.Provider value={{user:{id:userId,email:'synthetic@example.invalid',user_metadata:{full_name:'Synthetic caller'},app_metadata:{},aud:'authenticated',created_at:'2030-01-01T00:00:00Z'} satisfies User,loading:false,error:''}}>
  <MemoryRouter initialEntries={[path]}><DigitalMaterials/><Path/></MemoryRouter>
</AffairsContext.Provider>;
function mounted(path:string){globalSession.__gradeContextUser=owner;dom.window.localStorage.setItem('stu-dtm-language','en');return render(tree(path));}
const path='/dtm/course/'+id+'/grades',overview=path+'/overview';
test('course overview tab round trip retains course header/sidebar and both tabs without report reads',async()=>{
  const view=mounted(path);await view.findByText('Grade report unavailable.');
  const tabs=()=>within(view.getByRole('navigation',{name:'Grade report views'}));
  assert.equal(tabs().getByRole('link',{name:'Overview report'}).getAttribute('href'),overview);
  fireEvent.click(tabs().getByRole('link',{name:'Overview report'}));
  await waitFor(()=>assert.ok(view.container.querySelector('.dtm-grade-overview-table')));
  assert.equal(view.getByLabelText('Current route').textContent,overview);
  assert.ok(view.getByRole('heading',{level:1,name:'Synthetic contextual course: View: Overview report'}));
  assert.ok(view.getByRole('heading',{level:2,name:'Overview report - Synthetic caller'}));
  const breadcrumb=view.getByRole('navigation',{name:'Breadcrumb'});
  assert.equal(within(breadcrumb).getByRole('link',{name:'Synthetic contextual course'}).getAttribute('href'),'/dtm/course/'+id);
  assert.equal(within(breadcrumb).queryByText('Grade administration'),null);
  assert.equal(view.container.querySelector('.dtm-tree-selected > summary')?.textContent,'Synthetic contextual course');
  assert.equal(tabs().getByRole('link',{name:'Overview report'}).getAttribute('aria-current'),'page');
  assert.equal(tabs().getByRole('link',{name:'User report'}).getAttribute('aria-current'),null);
  assert.equal(view.container.querySelector('.dtm-grade-navigation a[aria-current="page"]')?.textContent,'Overview report');
  assert.equal(reads.filter(value=>value.includes('scope=dtm-grade-report&')).length,1,'Overview must not read an individual report');
  assert.equal(view.container.querySelectorAll('.dtm-grade-overview-table tbody tr').length,2,'Course context must not filter all-owned overview rows');
  fireEvent.click(tabs().getByRole('link',{name:'User report'}));await view.findByText('Grade report unavailable.');
  assert.equal(view.getByLabelText('Current route').textContent,path);
  assert.ok(view.getByRole('heading',{level:1,name:'Synthetic contextual course: View: User report'}));
  assert.equal(view.container.querySelector('.dtm-grade-overview-table'),null);
});
test('direct contextual overview supports local mirror alias and uses only overview data',async()=>{
  const view=mounted('/school-sites/dtm.stu.edu.tw/course/'+id+'/grades/overview');
  await waitFor(()=>assert.ok(view.container.querySelector('.dtm-grade-overview-table')));
  assert.ok(view.getByRole('heading',{level:1,name:'Synthetic contextual course: View: Overview report'}));
  assert.equal(reads.some(value=>value.includes('scope=dtm-grade-report&')),false);
  const link=view.container.querySelector<HTMLAnchorElement>('.dtm-grade-overview-table tbody tr:nth-child(2) a');
  assert.equal(link?.getAttribute('href'),'/dtm/course/'+second+'/grades');
});
test('global overview stays global with a single overview tab',async()=>{
  const view=mounted('/dtm/grades');await waitFor(()=>assert.ok(view.container.querySelector('.dtm-grade-overview-table')));
  assert.equal(view.getByLabelText('Current route').textContent,'/dtm/grades');
  assert.equal(view.container.querySelector('.dtm-tree-selected'),null);
  const tabs=within(view.getByRole('navigation',{name:'Grade report views'}));
  assert.equal(tabs.getAllByRole('link').length,1);assert.equal(tabs.getByRole('link',{name:'Overview report'}).getAttribute('href'),'/dtm/grades');
  assert.equal(reads.some(value=>value.includes('scope=dtm-grade-report&')),false);
});
for(const unavailable of ['/dtm/course/20000000-0000-4000-8000-000000000099/grades/overview','/dtm/course/42/grades/overview','/school-sites/dtm.stu.edu.tw/grade/report/overview/index.php?id=42'])test('unmapped or unavailable course fails closed: '+unavailable,async()=>{
  const view=mounted(unavailable);await view.findByRole('heading',{name:'Course or page unavailable'});
  assert.equal(view.container.querySelector('.dtm-grade-overview-table,.dtm-literal-grade-table'),null);
  assert.equal(reads.some(value=>value.includes('scope=dtm-grade-report')),false);
});
test('a foreign snapshot cannot provide contextual course or trigger overview reads',async()=>{
  mismatched=true;const view=mounted(overview);await view.findByText('Your account changed. Reload the workspace.');
  assert.equal(view.container.querySelector('.dtm-grade-overview-table,.dtm-tree-selected'),null);
  assert.equal(reads.some(value=>value.includes('scope=dtm-grade-report')),false);
});
test('switching account hides context and rows and does not reuse the old course',async()=>{
  const view=mounted(overview);await waitFor(()=>assert.ok(view.container.querySelector('.dtm-grade-overview-table')));
  const priorOverviewReads=reads.filter(value=>value.includes('scope=dtm-grade-report')).length;
  globalSession.__gradeContextUser=other;view.rerender(tree(overview,other));
  assert.equal(view.container.querySelector('.dtm-grade-overview-table,.dtm-tree-selected'),null);
  await view.findByRole('heading',{name:'Course or page unavailable'});
  assert.equal(reads.filter(value=>value.includes('scope=dtm-grade-report')).length,priorOverviewReads);
});
