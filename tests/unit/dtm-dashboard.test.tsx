import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {MemoryRouter,useLocation} from 'react-router';
import type {User} from '@supabase/supabase-js';
import type {AffairsSnapshot,DtmCourse} from '../../src/services/schoolAffairsWorkspace';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const courseId='20000000-0000-4000-8000-000000000001';
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','Element','SVGElement','NodeFilter','KeyboardEvent','CustomEvent','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','FormData','getComputedStyle','localStorage'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'PointerEvent',{value:dom.window.MouseEvent,configurable:true});
Object.defineProperty(dom.window,'PointerEvent',{value:dom.window.MouseEvent,configurable:true});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:dom.window.requestAnimationFrame.bind(dom.window),configurable:true});
Object.defineProperty(globalThis,'cancelAnimationFrame',{value:dom.window.cancelAnimationFrame.bind(dom.window),configurable:true});
type SessionResult={data:{session:{user:{id:string};access_token:string}|null};error:null};
const globals=globalThis as typeof globalThis&{__dtmDashboardSession?:SessionResult;__dtmDashboardGetSession?:()=>Promise<SessionResult>;__dtmDashboardSignOut?:()=>void};
const hooks=registerHooks({load(url,context,next){
  if(/\/affairs\/authClient\.ts$/.test(url))return {format:'module',shortCircuit:true,source:`
    export const affairsClient={auth:{getSession:async()=>globalThis.__dtmDashboardGetSession?globalThis.__dtmDashboardGetSession():globalThis.__dtmDashboardSession}};
    export const safeSchoolReturnPath=(value,fallback)=>typeof value==='string'&&value.startsWith('/dtm')?value:fallback;
    export const signOutAffairs=async()=>{globalThis.__dtmDashboardSignOut?.();};
    export const startGoogleSignIn=async()=>{throw new Error('No sign-in network in offline dashboard tests.');};
  `};
  if(/\/public\/PublicAssistant\.tsx$/.test(url))return {format:'module',shortCircuit:true,source:'export const campusAssistantOpenEvent="synthetic-campus-assistant-open";'};
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export {};'};
  return next(url,context);
}});
const css=readFileSync(new URL('../../src/features/public/dtm/digital-materials.css',import.meta.url),'utf8');
const style=dom.window.document.createElement('style');style.textContent=css;dom.window.document.head.append(style);
const originalFetch=globalThis.fetch;
const unexpected:typeof fetch=async()=>{throw new Error('Unexpected network request in offline dashboard test.');};
let respond:typeof fetch=unexpected;
globalThis.fetch=(...args)=>respond(...args);
const {render,cleanup,fireEvent,waitFor,act,within}=await import('@testing-library/react');
const {default:DigitalMaterials}=await import('../../src/features/public/dtm/DigitalMaterials');
const {AffairsContext}=await import('../../src/features/public/affairs/authContext');
afterEach(()=>{cleanup();respond=unexpected;delete globals.__dtmDashboardSession;delete globals.__dtmDashboardGetSession;delete globals.__dtmDashboardSignOut;dom.window.localStorage.clear();});
after(()=>{hooks.deregister();globalThis.fetch=originalFetch;dom.window.close();});

const session=(userId=owner)=>{globals.__dtmDashboardSession={data:{session:{user:{id:userId},access_token:'synthetic-'+userId}},error:null};dom.window.localStorage.setItem('stu-dtm-language','en');};
const course=(id=courseId,title='Synthetic saved course',term='130學年度第2學期'):DtmCourse=>({id,title,term,code:'LOCAL-TEST',role:'student',sourceMode:'personal',materials:[],meetings:[],grades:[]});
const snapshot=(userId=owner,courses=[course()])=>({profile:{userId,displayName:'Synthetic caller',email:'synthetic@example.invalid',role:'student'},dtm:{courses},assignments:[]} as unknown as AffairsSnapshot);
function Path(){return <span aria-label="Current route">{useLocation().pathname}</span>;}
const tree=(path='/dtm/dashboard',userId=owner)=><AffairsContext.Provider value={{user:{id:userId,email:'synthetic@example.invalid',user_metadata:{full_name:'Synthetic caller'},app_metadata:{},aud:'authenticated',created_at:'2030-01-01T00:00:00Z'} satisfies User,loading:false,error:''}}>
  <MemoryRouter initialEntries={[path]}><DigitalMaterials/><Path/></MemoryRouter>
</AffairsContext.Provider>;
async function loaded(path='/dtm/dashboard',value=snapshot()){
  session(value.profile.userId);respond=async(input,init)=>{assert.equal(String(input),'/api/affairs-data');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+value.profile.userId);return Response.json(value);};
  const view=render(tree(path,value.profile.userId));await waitFor(()=>assert.ok(view.container.querySelector('.dtm-dashboard-empty')));return view;
}
async function openCreate(view:ReturnType<typeof render>){
  fireEvent.keyDown(view.getByRole('button',{name:'Account menu: Synthetic caller'}),{key:'Enter'});
  await waitFor(()=>assert.ok(view.getByRole('menuitem',{name:'Add course'})));
  fireEvent.click(view.getByRole('menuitem',{name:'Add course'}));
  await waitFor(()=>assert.ok(view.getByRole('dialog',{name:'Add course'})));
}
function fillCourse(view:ReturnType<typeof render>){
  fireEvent.change(view.getByLabelText('Course code',{exact:true}),{target:{value:'SYNTHETIC-NEW'}});
  fireEvent.change(view.getByLabelText('Academic year and semester',{exact:true}),{target:{value:'131學年度第1學期'}});
  fireEvent.change(view.getByLabelText('Course name',{exact:true}),{target:{value:'Synthetic created course'}});
}

for(const path of ['/dtm/my','/dtm/dashboard'])test(path+' keeps a source-shaped empty center independently of courses and preserves term navigation',async()=>{
  const rows=[course(),{...course('20000000-0000-4000-8000-000000000002','Synthetic second course','129學年度第1學期'),sourceMode:'sample'}];
  const view=await loaded(path,snapshot(owner,rows));
  const center=view.container.querySelector('.dtm-center')!;
  assert.equal(center.textContent,'');assert.equal(center.childElementCount,1);assert.equal(center.querySelector('button,a,form,h2,.dtm-term-list'),null);
  const left=view.container.querySelector('.dtm-left')!;
  assert.deepEqual([...left.querySelectorAll(':scope > section,:scope > nav')].map(node=>node.className),['dtm-card dtm-important-information','dtm-card dtm-navigation','dtm-card dtm-contacts']);
  for(const name of ['Important information','Navigation','Contacts'])assert.ok(within(left as HTMLElement).getByRole('heading',{name}));
  assert.equal(view.queryByText('Teaching guides for students'),null);assert.equal(view.queryByText('Teaching guides for instructors'),null);
  const navigation=view.getByRole('navigation',{name:'My courses navigation'});
  assert.equal(within(navigation).getByRole('link',{name:'Dashboard'}).getAttribute('aria-current'),'page');
  for(const row of rows){const link=left.querySelector(`a[href="/dtm/course/${row.id}"]`);assert.equal(link?.textContent,row.title);assert.ok(link?.closest('details'));}
  const link=left.querySelector<HTMLAnchorElement>(`a[href="/dtm/course/${courseId}"]`)!;
  (link.closest('details') as HTMLDetailsElement).open=true;
  fireEvent.click(link);await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/dtm/course/'+courseId));
  assert.ok(view.getByRole('heading',{name:'Synthetic saved course'}));assert.equal(view.container.querySelector('.is-dashboard'),null);
  fireEvent.keyDown(view.getByRole('button',{name:'Course menu'}),{key:'Enter'});
  await waitFor(()=>assert.ok(view.getByRole('menuitem',{name:'Edit course'})));
  assert.ok(view.getByRole('menuitem',{name:'Delete course'}));
});

test('no courses uses the same empty block, without claiming absent official membership or adding customization controls',async()=>{
  const view=await loaded('/dtm/my',snapshot(owner,[]));
  assert.equal(view.container.querySelector('.dtm-center')?.textContent,'');
  assert.equal(view.queryByText('Add a course to start tracking your records.'),null);
  assert.equal(view.queryByRole('button',{name:/customiz/i}),null);
  await openCreate(view);assert.ok(view.getByLabelText('Course code'));fireEvent.click(view.getByRole('button',{name:'Cancel'}));
  await waitFor(()=>assert.equal(view.queryByRole('dialog'),null));assert.equal(view.getByLabelText('Current route').textContent,'/dtm/my');
});

test('account-menu creation preserves failed input and record ID on retry, saves via the existing action and opens the new course',async()=>{
  const view=await loaded();let value=snapshot();const writes:Array<{kind:string;payload:Record<string,string>}>=[];
  respond=async(input,init)=>{
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+owner);
    if(String(input)==='/api/affairs-data')return Response.json(value);
    assert.equal(String(input),'/api/affairs-action');assert.equal(init?.method,'POST');
    const body=JSON.parse(String(init?.body));writes.push(body);
    if(writes.length===1)return Response.json({error:'Synthetic save failed. Retry.'},{status:503});
    value=snapshot(owner,[...value.dtm.courses,course(body.payload.id,body.payload.title,body.payload.term)]);
    return Response.json({id:body.payload.id,kind:body.kind});
  };
  await openCreate(view);fillCourse(view);fireEvent.submit(view.getByLabelText('Course code').closest('form')!);
  await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal((view.getByLabelText('Course name') as HTMLInputElement).value,'Synthetic created course');
  fireEvent.submit(view.getByLabelText('Course code').closest('form')!);
  await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/dtm/course/'+writes[0].payload.id));
  await waitFor(()=>assert.ok(view.getByRole('heading',{name:'Synthetic created course'})));
  assert.deepEqual(writes[1],writes[0]);assert.equal(writes[0].kind,'save_dtm_course');
  assert.deepEqual(Object.keys(writes[0].payload).sort(),['code','id','term','title']);assert.equal(view.queryByRole('dialog'),null);
});

test('Cancel and Escape do not write and return keyboard focus to the existing account menu',async()=>{
  const view=await loaded();await openCreate(view);fillCourse(view);
  fireEvent.keyDown(document.activeElement||document.body,{key:'Escape'});
  await waitFor(()=>assert.equal(view.queryByRole('dialog'),null));
  await waitFor(()=>assert.equal(document.activeElement,view.getByRole('button',{name:'Account menu: Synthetic caller'})));
  await openCreate(view);assert.equal((view.getByLabelText('Course name') as HTMLInputElement).value,'');
  fireEvent.click(view.getByRole('button',{name:'Cancel'}));await waitFor(()=>assert.equal(view.queryByRole('dialog'),null));
  assert.equal(view.container.querySelector('.dtm-center')?.textContent,'');
});

test('existing course edit and delete stay reachable from the term tree and deletion returns to the empty dashboard',async()=>{
  const view=await loaded();let value=snapshot();const writes:Array<{kind:string;payload:Record<string,string>}>=[];
  respond=async(input,init)=>{
    if(String(input)==='/api/affairs-data')return Response.json(value);
    assert.equal(String(input),'/api/affairs-action');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+owner);
    const body=JSON.parse(String(init?.body));writes.push(body);
    if(body.kind==='save_dtm_course')value=snapshot(owner,[course(body.payload.id,body.payload.title,body.payload.term)]);
    else {assert.equal(body.kind,'delete_dtm_course');value=snapshot(owner,[]);}
    return Response.json({id:body.payload.id,kind:body.kind});
  };
  fireEvent.click(view.container.querySelector(`a[href="/dtm/course/${courseId}"]`)!);
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'Course menu'})));
  fireEvent.keyDown(view.getByRole('button',{name:'Course menu'}),{key:'Enter'});
  fireEvent.click(await view.findByRole('menuitem',{name:'Edit course'}));
  fireEvent.change(view.getByLabelText('Course name'),{target:{value:'Synthetic edited course'}});
  fireEvent.submit(view.getByLabelText('Course code').closest('form')!);
  await waitFor(()=>assert.ok(view.getByRole('heading',{name:'Synthetic edited course'})));
  assert.equal(writes[0].payload.id,courseId);assert.equal(writes[0].kind,'save_dtm_course');
  fireEvent.keyDown(view.getByRole('button',{name:'Course menu'}),{key:'Enter'});
  fireEvent.click(await view.findByRole('menuitem',{name:'Delete course'}));
  fireEvent.click(await view.findByRole('button',{name:'Delete'}));
  await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/dtm/dashboard'));
  await waitFor(()=>assert.ok(view.container.querySelector('.dtm-dashboard-empty')));
  assert.equal(view.container.querySelector(`a[href="/dtm/course/${courseId}"]`),null);
  assert.deepEqual(writes[1],{kind:'delete_dtm_course',payload:{id:courseId}});
});

test('account change hides the old draft and ignores a late successful creation redirect',async()=>{
  const view=await loaded();let release:(response:Response)=>void=()=>{};let dispatched=false;
  respond=async(input,init)=>{
    const token=new Headers(init?.headers).get('Authorization');
    if(String(input)==='/api/affairs-data'){assert.equal(token,'Bearer synthetic-'+other);return Response.json(snapshot(other,[]));}
    assert.equal(String(input),'/api/affairs-action');assert.equal(token,'Bearer synthetic-'+owner);dispatched=true;
    return new Promise<Response>(resolve=>{release=resolve;});
  };
  await openCreate(view);fillCourse(view);fireEvent.submit(view.getByLabelText('Course code').closest('form')!);
  await waitFor(()=>assert.equal(dispatched,true));assert.equal((view.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled,true);
  fireEvent.keyDown(document.activeElement||document.body,{key:'Escape'});assert.ok(view.getByRole('dialog'));
  session(other);view.rerender(tree('/dtm/dashboard',other));await waitFor(()=>assert.ok(view.container.querySelector('.dtm-dashboard-empty')));
  assert.equal(view.queryByRole('dialog'),null);assert.equal(view.container.querySelector(`a[href="/dtm/course/${courseId}"]`),null);
  await act(async()=>{release(Response.json({id:'20000000-0000-4000-8000-000000000099',kind:'save_dtm_course'}));});
  assert.equal(view.getByLabelText('Current route').textContent,'/dtm/dashboard');assert.equal(view.queryByRole('dialog'),null);
});

for(const returnedUser of [owner,other])test('account switch during unresolved session lookup prevents dispatch even when lookup returns '+(returnedUser===owner?'the old caller':'the new caller'),async()=>{
  const view=await loaded();let release:(value:SessionResult)=>void=()=>{};let sessionCalls=0,posts=0;
  globals.__dtmDashboardGetSession=async()=>{
    sessionCalls++;if(sessionCalls===1)return new Promise<SessionResult>(resolve=>{release=resolve;});
    return globals.__dtmDashboardSession!;
  };
  respond=async(input,init)=>{
    if(String(input)==='/api/affairs-action'){posts++;return Response.json({id:courseId,kind:'save_dtm_course'});}
    assert.equal(String(input),'/api/affairs-data');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-'+other);
    return Response.json(snapshot(other,[]));
  };
  await openCreate(view);fillCourse(view);fireEvent.submit(view.getByLabelText('Course code').closest('form')!);
  await waitFor(()=>assert.equal(sessionCalls,1));assert.equal(posts,0);
  session(other);view.rerender(tree('/dtm/dashboard',other));await waitFor(()=>assert.ok(view.container.querySelector('.dtm-dashboard-empty')));
  assert.equal(view.queryByRole('dialog'),null);
  await act(async()=>{release({data:{session:{user:{id:returnedUser},access_token:'synthetic-'+returnedUser}},error:null});});
  assert.equal(posts,0);assert.equal(view.getByLabelText('Current route').textContent,'/dtm/dashboard');
});

test('a mismatched session fails before POST even if the auth-context component has not switched yet',async()=>{
  const view=await loaded();let posts=0;
  globals.__dtmDashboardGetSession=async()=>({data:{session:{user:{id:other},access_token:'synthetic-'+other}},error:null});
  respond=async()=>{posts++;return Response.json({id:courseId,kind:'save_dtm_course'});};
  await openCreate(view);fillCourse(view);fireEvent.submit(view.getByLabelText('Course code').closest('form')!);
  await waitFor(()=>assert.match(view.getByRole('alert').textContent!,/account changed/i));
  assert.equal(posts,0);assert.equal((view.getByLabelText('Course name') as HTMLInputElement).value,'Synthetic created course');
});

test('dashboard footer uses own account records, observed public links and functioning local logout; privacy stays in the account menu',async()=>{
  const view=await loaded();const footer=view.container.querySelector<HTMLElement>('.dtm-dashboard-footer')!;
  assert.equal(footer.querySelectorAll('.dtm-dashboard-footer-column').length,3);
  assert.equal(footer.querySelector('.dtm-dashboard-footer-empty')?.textContent,'');
  assert.equal(within(footer).getByRole('link',{name:'Synthetic caller'}).getAttribute('href'),'/school-affairs/records');
  assert.equal(within(footer).getByRole('link',{name:'University homepage'}).getAttribute('href'),'/');
  const links=[...footer.querySelectorAll<HTMLAnchorElement>('.dtm-dashboard-social')];
  assert.deepEqual(links.map(link=>link.getAttribute('aria-label')),['Android','Apple','YouTube','Wikipedia','Google+','Facebook','University homepage']);
  assert.deepEqual(links.slice(0,-1).map(link=>link.getAttribute('href')),[
    'https://play.google.com/store/apps/details?id=com.stu.webphone','https://itunes.apple.com/tw/app/shu-de-ke-ji-da-xue/id992708520?mt=8',
    'https://www.youtube.com/c/StuEduTw','https://zh.wikipedia.org/wiki/樹德科技大學','https://plus.google.com/','https://www.facebook.com/ShuTeUniversity/',
  ]);
  assert.ok(links.slice(0,-1).every(link=>link.rel==='noopener noreferrer'));
  assert.equal(within(footer).getByRole('link',{name:'Shaun Daubney'}).getAttribute('href'),'https://moodle.org/plugins/view.php?plugin=theme_aardvark');
  fireEvent.keyDown(view.getByRole('button',{name:'Account menu: Synthetic caller'}),{key:'Enter'});
  assert.equal((await view.findByRole('menuitem',{name:'Account and privacy'})).getAttribute('href'),'/school-affairs/privacy');
  fireEvent.keyDown(document.activeElement||document.body,{key:'Escape'});await waitFor(()=>assert.equal(view.queryByRole('menu'),null));
  let loggedOut=0;globals.__dtmDashboardSignOut=()=>{loggedOut++;};
  fireEvent.click(within(footer).getByRole('button',{name:'Log out'}));await waitFor(()=>assert.equal(loggedOut,1));
});

test('measured block gaps are real focusable skip targets and source contact markup stays literal',async()=>{
  const view=await loaded();const left=view.container.querySelector('.dtm-left')!;
  const skips=[...left.querySelectorAll<HTMLAnchorElement>('.dtm-dashboard-block-skip')];
  assert.deepEqual(skips.map(link=>link.textContent),['Skip Important information','Skip Navigation','Skip Contacts']);
  for(const link of skips){
    const target=document.getElementById(link.hash.slice(1))!;
    assert.equal(target.getAttribute('tabindex'),'-1');assert.equal(getComputedStyle(target).height,'1px');
    target.focus();assert.equal(document.activeElement,target);
    assert.ok(target.previousElementSibling?.classList.contains('dtm-card'));
  }
  assert.equal(left.querySelectorAll('.dtm-dashboard-no-overflow').length,2);
  for(const content of left.querySelectorAll('.dtm-dashboard-no-overflow'))assert.equal(getComputedStyle(content).paddingBottom,'1px');
  fireEvent.change(view.getByRole('combobox',{name:'Language / 語言'}),{target:{value:'zh-Hant'}});
  const contacts=left.querySelector('.dtm-contacts')!;
  assert.deepEqual([...contacts.querySelectorAll('.dtm-contact-department')].map(node=>node.textContent),['教務處註冊課務組','推廣教育中心','國際與兩岸事務處','電算中心']);
  assert.match(contacts.textContent!,/07-615800#2505/);assert.doesNotMatch(contacts.textContent!,/07-6158000#2505/);
  assert.equal(contacts.querySelector('strong.dtm-contact-after-hours')?.textContent,'(非上班時間請寫信)');
  assert.equal(getComputedStyle(left.querySelector('.dtm-navigation h2')!).backgroundColor,'rgb(127, 140, 141)');
  assert.equal(getComputedStyle(view.container.querySelector('.dtm-dashboard-login-info')!).fontSize,'11.2px');
  assert.equal(getComputedStyle(view.container.querySelector('.dtm-dashboard-footer-attribution')!).fontSize,'9.8px');
});

test('the shared signed-in header uses measured desktop spacing while keeping the native language selector functional',async()=>{
  const view=await loaded();const top=view.container.querySelector('.dtm-top')!,brand=view.container.querySelector('.dtm-brand')!;
  const select=view.getByRole('combobox',{name:'Language / 語言'}) as HTMLSelectElement;
  assert.equal(parseFloat(getComputedStyle(top).gap),0);assert.equal(getComputedStyle(top).padding,'0px 20px');
  const brandStyle=getComputedStyle(brand);
  assert.equal(brandStyle.marginLeft,'-20px');assert.equal(brandStyle.padding,'15px 20px 10px');
  assert.equal(brandStyle.fontWeight,'200');assert.equal(brandStyle.fontSize,'20px');assert.equal(brandStyle.lineHeight,'20px');
  const languageStyle=getComputedStyle(select);
  assert.equal(languageStyle.padding,'15px');assert.equal(languageStyle.height,'50px');
  assert.ok(Math.abs(parseFloat(languageStyle.width)-173.2734375)<.001,'computed width retains the measured value within CSS serialization precision');
  assert.equal(languageStyle.fontSize,'16.8px');assert.equal(languageStyle.lineHeight,'20px');
  assert.equal(getComputedStyle(select.parentElement!).marginRight,'10px');assert.equal(select.tagName,'SELECT');
  assert.deepEqual([...select.options].map(option=>option.value),['zh-Hant','en']);
  fireEvent.change(select,{target:{value:'zh-Hant'}});assert.equal(view.container.querySelector('.dtm')?.getAttribute('lang'),'zh-Hant');
  assert.equal(dom.window.localStorage.getItem('stu-dtm-language'),'zh-Hant');assert.ok(view.getByRole('button',{name:'帳號選單：Synthetic caller'}));
  fireEvent.change(select,{target:{value:'en'}});await openCreate(view);assert.ok(view.getByRole('dialog',{name:'Add course'}));
  assert.match(css,/@media\(max-width: 990px\)[\s\S]*?margin-left: 0; padding: 6px 0 0; line-height: 24px;/);
  assert.match(css,/\.is-signed-in \.dtm-language select \{ width: auto; height: auto; min-height: 34px;/);
  assert.match(css,/@font-face\s*\{[\s\S]*?font-family: "DTM Open Sans";[\s\S]*?font-weight: 400;/);
});

test('loading and failed reads remain visible and retry restores the dashboard without implying course absence',async()=>{
  session();let release:(response:Response)=>void=()=>{};let dispatched=false;
  respond=async()=>new Promise<Response>(resolve=>{release=resolve;dispatched=true;});
  const view=render(tree('/dtm/my'));assert.ok(view.getByRole('status'));assert.equal(view.container.querySelector('.dtm-dashboard-empty'),null);
  await waitFor(()=>assert.equal(dispatched,true));
  await act(async()=>{release(Response.json({error:'Synthetic records unavailable.'},{status:503}));});
  await waitFor(()=>assert.ok(view.getByRole('alert')));assert.equal(view.container.querySelector('.dtm-dashboard-empty'),null);
  respond=async()=>Response.json(snapshot());fireEvent.click(view.getByRole('button',{name:'Retry'}));
  await waitFor(()=>assert.ok(view.container.querySelector('.dtm-dashboard-empty')));assert.equal(view.queryByRole('alert'),null);
});

test('a foreign snapshot fails closed rather than appearing as an empty or populated dashboard',async()=>{
  session();respond=async()=>Response.json(snapshot(other,[course(courseId,'Foreign synthetic course')]));
  const view=render(tree());await waitFor(()=>assert.ok(view.getByRole('alert')));
  assert.equal(view.queryByText('Foreign synthetic course'),null);assert.equal(view.container.querySelector('.dtm-dashboard-empty'),null);
});

test('measured dashboard styles are scoped, while home and course center rules remain intact',async()=>{
  const view=await loaded();const center=view.container.querySelector('.dtm-center')!,header=view.container.querySelector('.dtm-dashboard-header h1')!;
  assert.equal(parseFloat(getComputedStyle(center).minHeight),0);assert.equal(getComputedStyle(center).padding,'10px');
  assert.equal(getComputedStyle(center).borderTopColor,'rgb(227, 227, 227)');assert.equal(getComputedStyle(header).fontSize,'22px');
  assert.equal(getComputedStyle(header).color,'rgb(153, 153, 153)');assert.equal(parseFloat(getComputedStyle(view.container.querySelector('.dtm-main')!).minHeight),0);
  assert.equal(getComputedStyle(view.container.querySelector('.dtm-dashboard-empty')!).height,'1px');
  const breadcrumb=getComputedStyle(view.getByRole('navigation',{name:'Breadcrumb'}));assert.equal(breadcrumb.paddingLeft,'0px');assert.equal(breadcrumb.marginBottom,'13px');
  assert.equal(getComputedStyle(view.container.querySelector('.dtm-card')!).borderTopWidth,'0px');
  assert.equal(getComputedStyle(view.container.querySelector('.dtm-dashboard-block-content')!).padding,'10px 14px 4px');
  assert.equal(getComputedStyle(view.container.querySelector('.dtm-tree summary')!).minHeight,'23px');
  assert.equal(getComputedStyle(view.container.querySelector('.dtm-dashboard-footer')!).color,'rgb(127, 140, 141)');
  assert.equal(getComputedStyle(view.container.querySelector('.dtm-dashboard-social')!).height,'37.8px');
  fireEvent.click(view.container.querySelector(`a[href="/dtm/course/${courseId}"]`)!);
  await waitFor(()=>assert.equal(view.container.querySelector('.is-dashboard'),null));
  assert.equal(getComputedStyle(view.container.querySelector('.dtm-center')!).minHeight,'220px');
  assert.match(css,/@media\(max-width: 767px\)/);assert.match(css,/\.dtm-columns > \* \{ width: 100%; \}/);
});
