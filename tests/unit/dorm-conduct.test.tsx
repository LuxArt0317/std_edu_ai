import assert from 'node:assert/strict';
import {after,afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {DormConductProps,DormConductSnapshot} from '../../src/features/public/affairs/DormConduct';

const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const snapshot:DormConductSnapshot={userId:owner,sourceMode:'local_demo',version:1,result:'empty'};
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options:object)=>{window:Window & typeof globalThis}};
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLButtonElement','Node','Event','MouseEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const hook=registerHooks({load(url,context,next){return url.endsWith('/dormConduct.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const {DormConduct,ownDormConductResult}=await import('../../src/features/public/affairs/DormConduct');hook.deregister();
const {render,cleanup,fireEvent}=await import('@testing-library/react');afterEach(cleanup);after(()=>dom.window.close());
const noop=()=>{};
const base:DormConductProps={userId:owner,identity:{userId:owner},snapshot,busy:false,onReload:noop,onHome:noop};
const tree=(props:Partial<DormConductProps>={})=><DormConduct {...base} {...props}/>;

test('only an explicit valid owned snapshot establishes the source no-record notice',()=>{
  assert.equal(ownDormConductResult(owner,{userId:owner},snapshot),'empty');
  assert.equal(ownDormConductResult(owner,{userId:owner},{...snapshot,version:999999999}),'empty');
  assert.equal(ownDormConductResult(owner,{userId:owner},{...snapshot,result:'unknown'}),'unknown');
  assert.deepEqual(snapshot,{userId:owner,sourceMode:'local_demo',version:1,result:'empty'});
  const view=render(tree());
  assert.equal(view.getByRole('heading',{level:1}).textContent,'校務系統事件訊息');
  assert.equal(view.getByRole('status').textContent,'您尚未有任何住宿的獎懲記錄.');
  assert.match(view.container.textContent!,/倘若有任何問題，請與電算中心聯繫/);
  assert.match(view.container.textContent!,/Shu-Te University 樹德科技大學/);
  assert.doesNotMatch(view.container.textContent!,new RegExp(owner));
  assert.equal(view.container.querySelector('table,form,input,select,iframe,object,embed,a[download]'),null);
});

test('foreign, missing, malformed and capability-bearing data remains unknown without coercion',()=>{
  const cases:unknown[]=[null,[],Object.assign(Object.create({}),snapshot),{...snapshot,userId:other},{...snapshot,userId:undefined},
    {...snapshot,sourceMode:'official'},{...snapshot,version:0},{...snapshot,version:-1},{...snapshot,version:1.5},
    {...snapshot,version:1000000000},{...snapshot,version:NaN},{...snapshot,version:'1'},
    {...snapshot,result:'recorded'},{...snapshot,result:{toString(){throw new Error('must not coerce');}}},
    {...snapshot,downloadUrl:'PRIVATE PROVIDER LOCATION'},{...snapshot,result:undefined}];
  for(const value of cases)assert.equal(ownDormConductResult(owner,{userId:owner},value),'unknown');
  for(const identity of [null,[],{userId:other},{userId:owner,name:'PRIVATE IDENTITY'},{}])assert.equal(ownDormConductResult(owner,identity,snapshot),'unknown');
  for(const userId of ['',null,other,'not-a-uuid'])assert.equal(ownDormConductResult(userId,{userId:owner},snapshot),'unknown');
  const view=render(tree({snapshot:null}));assert.match(view.getByRole('status').textContent!,/無法確認/);
  assert.doesNotMatch(view.container.textContent!,/尚未有任何/);
});

test('loading and errors suppress stale emptiness and expose only safe retry text',()=>{
  let reloads=0;const view=render(tree({busy:true,onReload:()=>{reloads++;}}));
  assert.equal(view.getByRole('main').getAttribute('aria-busy'),'true');
  assert.match(view.getByRole('status').textContent!,/正在載入/);
  assert.equal(view.queryByRole('button',{name:'重新載入'}),null);assert.doesNotMatch(view.container.textContent!,/尚未有任何/);
  view.rerender(tree({error:'PRIVATE PROVIDER TOKEN AND LOCATION',onReload:()=>{reloads++;}}));
  assert.match(view.getByRole('alert').textContent!,/目前無法載入/);assert.doesNotMatch(view.container.textContent!,/PRIVATE|尚未有任何/);
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));assert.equal(reloads,1);
  view.rerender(tree({identity:null,onReload:()=>{reloads++;}}));
  fireEvent.click(view.getByRole('button',{name:'重新載入'}));assert.equal(reloads,2);
});

test('account changes immediately clear prior empty claims until identity and result both match',()=>{
  const view=render(tree());assert.match(view.getByRole('status').textContent!,/尚未有任何/);
  view.rerender(tree({userId:other}));assert.match(view.getByRole('status').textContent!,/無法確認/);
  view.rerender(tree({userId:other,identity:{userId:other}}));assert.match(view.getByRole('status').textContent!,/無法確認/);
  view.rerender(tree({userId:other,identity:{userId:other},snapshot:{...snapshot,userId:other}}));
  assert.equal(view.getByRole('status').textContent,'您尚未有任何住宿的獎懲記錄.');
  assert.doesNotMatch(view.container.textContent!,new RegExp(`${owner}|${other}`));
});

test('HomePage delegates locally and adds no unobserved report or housing action',()=>{
  let navigations=0;const view=render(tree({onHome:()=>{navigations++;}}));
  const link=view.getByRole('link',{name:'HomePage'});link.focus();assert.equal(document.activeElement,link);
  fireEvent.click(link);assert.equal(navigations,1);
  assert.deepEqual(view.getAllByRole('link').map(item=>item.textContent),['HomePage']);
  assert.equal(view.container.querySelector('a[href],button[type="submit"],form'),null);
  assert.equal(view.container.querySelector('.dorm-conduct-heading img')?.getAttribute('src'),'/stu-reference/dorm-conduct-logo.png');
});

test('both exact public source images are local, verified PNGs without private source queries',()=>{
  const view=render(tree());
  const manifest=JSON.parse(readFileSync(new URL('../../public/stu-reference/dorm-conduct-assets.json',import.meta.url),'utf8')) as {assets:Array<{path:string;source:string;mimeType:string;bytes:number;sha256:string}>};
  assert.deepEqual(manifest.assets.map(row=>row.source),['https://info.stu.edu.tw/aptools/images/notice.png','https://info.stu.edu.tw/aptools/images/Tlogo.png']);
  for(const item of manifest.assets){
    const bytes=readFileSync(new URL('../../public'+item.path,import.meta.url));
    assert.equal(item.mimeType,'image/png');assert.equal(bytes.length,item.bytes);
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
    const img=view.container.querySelector('img[src="'+item.path+'"]');assert.ok(img);assert.equal(img.getAttribute('width'),'42');assert.equal(img.getAttribute('height'),'45');
  }
  assert.equal(view.container.querySelectorAll('img').length,2);
});
