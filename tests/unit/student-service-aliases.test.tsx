import assert from 'node:assert/strict';
import {after, afterEach, test} from 'node:test';
import {createRequire, registerHooks} from 'node:module';
import {MemoryRouter, useLocation, useNavigate} from 'react-router';
import type {User} from '@supabase/supabase-js';
import {nativeServiceAlias, schoolServiceEntries} from '../../src/features/public/affairs/studentServices.js';

const {JSDOM} = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost', pretendToBeVisual:true});
for (const name of ['window','document','Element','SVGElement','NodeFilter','KeyboardEvent','CustomEvent','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle','localStorage'])
  Object.defineProperty(globalThis, name, {value:name === 'window' ? dom.window : name === 'document' ? dom.window.document : dom.window[name], configurable:true});
Object.defineProperty(globalThis, 'navigator', {value:dom.window.navigator, configurable:true});

// Isolate routing from account data and provider calls. The destination components
// expose their received view so these checks prove which workspace is mounted.
const hook = registerHooks({load(url, context, next) {
  if (url.endsWith('/affairs/authClient.ts')) return {format:'module', shortCircuit:true, source:'export const affairsClient={auth:{getSession:async()=>({data:{session:null},error:null})}};'};
  if (url.endsWith('/public/PublicAssistant.tsx')) return {format:'module', shortCircuit:true, source:'export const campusAssistantOpenEvent="offline-assistant-open";'};
  if (url.endsWith('/affairs/useAffairsRecords.ts')) return {format:'module', shortCircuit:true, source:'export function useAffairsRecords(){return {snapshot:null,loading:false,error:"",refresh(){}}}'};
  if (url.endsWith('/affairs/StudentLeaveWorkspace.tsx')) return {format:'module', shortCircuit:true, source:'import React from "react"; export default function Leave({view}){return React.createElement("h1",null,"Leave workspace:"+(view||"form"))}'};
  if (url.endsWith('/affairs/StudentServiceWorkspace.tsx')) return {format:'module', shortCircuit:true, source:'import React from "react"; export function StudentServiceWorkspace({serviceKey,view}){return React.createElement("h1",null,"Service workspace:"+serviceKey+":"+(view||"index"))}'};
  if (url.endsWith('.css')) return {format:'module', shortCircuit:true, source:'export {};'};
  return next(url, context);
}});
const {render, cleanup, fireEvent, waitFor} = await import('@testing-library/react');
const {default: SchoolAffairsPortal} = await import('../../src/features/public/affairs/SchoolAffairsPortal');
const previousFetch = globalThis.fetch;
const networkCalls:string[]=[];
globalThis.fetch = async (input,init) => {networkCalls.push((init?.method??'GET')+' '+String(input));throw new Error('Unexpected network in offline alias test');};
afterEach(() => {cleanup(); dom.window.localStorage.clear();assert.deepEqual(networkCalls,[],'Route navigation must not dispatch account reads or mutations in the isolated fixture');networkCalls.length=0;});
after(() => {globalThis.fetch=previousFetch; hook.deregister(); dom.window.close();});
const user = {id:'10000000-0000-4000-8000-000000000001', email:'synthetic@example.invalid'} as User;
function CurrentRoute() {
  const location=useLocation(), navigate=useNavigate();
  return <><output aria-label="Current route">{location.pathname+location.search+location.hash}</output><button onClick={()=>navigate(-1)}>Test back</button></>;
}
function page(path:string, history?:string) {
  return <MemoryRouter initialEntries={history ? [history,path] : [path]} initialIndex={history ? 1 : 0}>
    <SchoolAffairsPortal user={user}/><CurrentRoute/>
  </MemoryRouter>;
}

test('old numeric service links reach the same native destinations as the current menu', async () => {
  for (const [id,destination,heading] of [
    ['20-1','leave','Leave workspace:form'],
    ['33-1','leave/history','Leave workspace:history'],
    ['53-1','internship','Service workspace:internship:index'],
  ]) {
    assert.equal(nativeServiceAlias(id),schoolServiceEntries.find(entry=>entry.id===id)?.localUrl);
    const view=render(page('/school-affairs/services/'+id+'/?lang=en#details'));
    await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/'+destination+'?lang=en#details'));
    assert.ok(view.getByRole('heading',{name:heading}));
    view.unmount();
  }
});

test('alias replacement preserves the previous page instead of trapping Back in a redirect', async () => {
  const view=render(page('/school-affairs/services/20-1','/school-affairs/menu/sao/all'));
  await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/leave'));
  fireEvent.click(view.getByRole('button',{name:'Test back'}));
  await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/menu/sao/all'));
  fireEvent.click(view.getByRole('link',{name:'請假填單'}));
  await waitFor(()=>assert.ok(view.getByRole('heading',{name:'Leave workspace:form'})));
});

test('source-observed selection confirmation redirects to the native query and preserves search and hash', async () => {
  assert.equal(nativeServiceAlias('6-6'),'/school-affairs/services/11-1');
  for(const suffix of ['', '/']){
    const view=render(page('/school-affairs/services/6-6'+suffix+'?lang=en#selection'));
    await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/11-1?lang=en#selection'));
    assert.ok(view.container.querySelector('.course-selection'));
    assert.ok(view.getByRole('heading',{name:/^選課記錄查詢/}));
    assert.equal(view.queryByRole('heading',{name:/Service workspace:6-6/}),null);
    assert.equal(view.queryByRole('button',{name:/新增紀錄|確認選課|送出/}),null);
    view.unmount();
  }
});

test('catalog confirmation and canonical query open the same native view without trapping browser history', async () => {
  const entry=schoolServiceEntries.find(item=>item.id==='6-6')!;
  assert.equal(entry.title,'選課確認');
  assert.equal(entry.localUrl,'/school-affairs/services/6-6');
  assert.equal(entry.officialUrl,'https://infosys.stu.edu.tw/WebSelectCourse/Login/AspLogin/StuSelConfirm');
  const view=render(page('/school-affairs/menu/aca/all'));
  const confirmation=view.getByRole('link',{name:'選課確認'});
  assert.equal(confirmation.getAttribute('href'),entry.localUrl);
  fireEvent.click(confirmation);
  await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/11-1'));
  assert.ok(view.getByRole('heading',{name:/^選課記錄查詢/}));
  fireEvent.click(view.getByRole('button',{name:'Test back'}));
  await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/menu/aca/all'));
  const query=view.getByRole('link',{name:'選課紀錄查詢'});
  assert.equal(query.getAttribute('href'),'/school-affairs/services/11-1');
  fireEvent.click(query);
  await waitFor(()=>assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/11-1'));
  assert.ok(view.container.querySelector('.course-selection'));
  assert.ok(view.getByRole('heading',{name:/^選課記錄查詢/}));
  assert.deepEqual(networkCalls,[]);
});

test('canonical, unknown and nested routes are not rewritten as numeric aliases', async () => {
  for (const key of ['leave','internship','21-2','unknown','20-1/history','20-10','6-6/unknown','6-60','11-1','7-1']) assert.equal(nativeServiceAlias(key),undefined);
  for(const key of ['20-1','6-6']){
    const view=render(page('/school-affairs/services/'+key+'/unknown'));
    assert.equal(view.getByLabelText('Current route').textContent,'/school-affairs/services/'+key+'/unknown');
    assert.ok(view.getByRole('heading',{name:'Service workspace:'+key+':unknown'}));
    view.unmount();
  }
});
