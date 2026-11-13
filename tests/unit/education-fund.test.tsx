import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {StrictMode} from 'react';
import {MemoryRouter,useLocation} from 'react-router';
import {educationFundReference} from '../../src/features/public/affairs/educationFundContent';

const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new(html:string,options?:{url?:string})=>{window:Window & typeof globalThis}};
const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('/educationFund.css')?{format:'module',source:'export {};',shortCircuit:true}:nextLoad(url,context);}});
const {EducationFundWorkspace}=await import('../../src/features/public/affairs/EducationFundWorkspace');cssHook.deregister();
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
for(const name of ['window','document','HTMLElement','Node','Event','MouseEvent','MutationObserver'])
  Object.defineProperty(globalThis,name,{value:name==='window'?dom.window:name==='document'?dom.window.document:dom.window[name as keyof Window],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,configurable:true,writable:true});
const {render,cleanup,fireEvent}=await import('@testing-library/react');afterEach(cleanup);
function Location(){return <output aria-label="Local route">{useLocation().pathname}</output>;}
const tree=()=> <StrictMode><MemoryRouter initialEntries={[educationFundReference.path]}><EducationFundWorkspace/><Location/></MemoryRouter></StrictMode>;

test('closed-period reference has the observed instruction structure and no invented application workflow',()=>{
  const result=render(tree());
  assert.equal(result.getByRole('heading',{level:1}).textContent,'學產助學金申請系統');
  assert.equal(result.getByRole('article').getAttribute('aria-labelledby'),'education-fund-instructions-title');
  assert.equal(result.getAllByRole('heading',{level:2}).length,1);
  assert.equal(result.getAllByRole('heading',{level:3}).length,6);
  assert.deepEqual([...result.container.querySelectorAll('ol')].map(list=>list.children.length),[2,13,2]);
  assert.match(result.getByRole('article').textContent!,/前學期成績學業成績總平均及格，且德行評量無小過以上之處分。/);
  assert.match(result.getByRole('article').textContent!,/行政院農業委員會之農漁民子女助學金。/);
  assert.equal(result.container.querySelectorAll('form,input,select,textarea,button,table,iframe,object,embed,a[download]').length,0);
  assert.equal(result.container.querySelectorAll('[role="status"],[role="alert"]').length,0);
  assert.doesNotMatch(result.container.textContent!,/您的申請|已核准|申請成功|取得助學金|立即申請/);
});

test('source period and capture metadata stay literal, without an official issuer or calculated eligibility claim',()=>{
  const {container}=render(tree());
  assert.equal(container.querySelector('.education-fund-period')!.textContent,'系統開放時間: 2026/9/1 上午 08:00:00 至 2026/10/12 下午 08:00:00 止');
  assert.equal(container.querySelector('.education-fund')!.getAttribute('data-observed-on'),'2026-11-13');
  assert.match(container.querySelector('footer')!.textContent!,/stu.best \| 07-6158000#2401/);
  assert.doesNotMatch(container.querySelector('footer')!.textContent!,/©|Copyright|Designed by|官方發行/);
});

test('all five observed footer destinations navigate locally, including the existing sign-out boundary',()=>{
  const result=render(tree());
  const links=[['登出','/school-affairs/signed-out'],['HomePage','/school-affairs/services/21-2'],['校務資訊系統','/school-affairs'],['學校首頁','/'],['mySTU','/student-sso']];
  assert.equal(result.getAllByRole('link').length,links.length);
  for(const [name,path] of links){
    const link=result.getByRole('link',{name});
    assert.equal(link.getAttribute('href'),path);assert.equal(link.getAttribute('target'),null);
    fireEvent.click(link);assert.equal(result.getByLabelText('Local route').textContent,path);
  }
});

test('render and navigation need no account snapshot or network and expose only the registered local logo',()=>{
  const originalFetch=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw new Error('No network is permitted in this reference view');};
  try{
    const result=render(tree());fireEvent.click(result.getByRole('link',{name:'HomePage'}));
    const resources=[...result.container.querySelectorAll('[src],[href]')].map(node=>node.getAttribute('src')??node.getAttribute('href'));
    assert.ok(resources.every(path=>path?.startsWith('/')&&!path.startsWith('//')));
    assert.equal(result.container.querySelector('img')!.getAttribute('src'),'/school-assets/03599fb12dbe1c0d2b5c.png');
    assert.equal(requests,0);
  }finally{globalThis.fetch=originalFetch;}
});

test('scoped CSS retains the measured desktop frame and mobile containment rules; logo bytes stay registered',async()=>{
  const css=await readFile(new URL('../../src/features/public/affairs/educationFund.css',import.meta.url),'utf8');
  const styled=new JSDOM('<!doctype html><style>'+css+'</style><body></body>');
  const sheet=styled.window.document.styleSheets[0];
  const rules=[...sheet.cssRules];
  const style=(selector:string)=>(rules.find(rule=>'selectorText' in rule&&rule.selectorText===selector) as CSSStyleRule).style;
  assert.equal(style('.education-fund-shell').getPropertyValue('width'),'960px');
  assert.equal(style('.education-fund-shell').getPropertyValue('border'),'1px solid rgb(201, 202, 203)');
  assert.equal(style('.education-fund-shell').getPropertyValue('max-width'),'calc(100% - 2px)');
  assert.equal(style('.education-fund-container').getPropertyValue('padding'),'2.4px 24px');
  assert.equal(style('.education-fund-instructions').getPropertyValue('width'),'90%');
  const mobile=rules.find(rule=>'conditionText' in rule&&String(rule.conditionText).replace(/\s/g,'')==='(max-width:767px)') as CSSMediaRule;
  assert.ok(mobile);
  const mobileColumns=[...mobile.cssRules].find(rule=>'selectorText' in rule&&String(rule.selectorText).replace(/\s/g,'')==='.education-fund-region,.education-fund-instructions') as CSSStyleRule;
  assert.equal(mobileColumns.style.getPropertyValue('width'),'100%');
  assert.match(mobile.cssText,/overflow-wrap: anywhere/);
  assert.match(mobile.cssText,/flex-wrap: wrap/);
  for(const rule of rules.filter(rule=>'selectorText' in rule))assert.ok((rule as CSSStyleRule).selectorText.startsWith('.education-fund'));
  const logo=await readFile(new URL('../../public/school-assets/03599fb12dbe1c0d2b5c.png',import.meta.url));
  assert.equal(logo.length,610);
  assert.equal(createHash('sha256').update(logo).digest('hex'),'9ec0b3674feed90fab05656e6083f046da9bf1ed4a60674eb2883ddfbc03b79b');
});
