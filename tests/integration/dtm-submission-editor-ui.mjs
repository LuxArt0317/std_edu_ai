import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

// Local component harness; no mounted app, real accounts, uploaded files or API operations.
process.umask(0o077);
const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const directory='artifacts/dtm-submission-editor-ui';
const source=JSON.parse(await readFile('artifacts/visual-parity/dtm-submission-editor-detailed-layout.json','utf8'));
const assets=JSON.parse(await readFile('artifacts/visual-parity/dtm-submission-editor-assets.json','utf8'));
const mainResponse=await fetch(base+'/src/main.tsx');assert.equal(mainResponse.status,200);const servedMain=await mainResponse.text();
function optimizedModule(file){const match=servedMain.match(new RegExp('"(/node_modules/\\.vite/deps/'+file.replaceAll('.','\\.')+'\\?v=[a-f0-9]+)"'));assert.ok(match,'Live optimized import '+file);return match[1];}
const fixture={userId:'synthetic-owner',assignment:{id:'synthetic-assignment',userId:'synthetic-owner',title:'合成作業檔案編輯'},
  savedFile:{id:'synthetic-saved-file',userId:'synthetic-owner',assignmentId:'synthetic-assignment',filename:'synthetic-saved-coursework.pdf',sizeBytes:100,contentType:'application/pdf'},
  selectedFile:null,selectedFileScope:null,status:'idle'};
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic submission editor verification</title>
<style>body{display:flow-root;margin:0;background:#ecf0f1}main{margin-top:166px;margin-left:calc(20px + (100vw - 40px)*.25641);width:calc((100vw - 40px)*.74359)}@media(max-width:600px){main{margin:12px;width:calc(100% - 24px)}}</style></head><body><main aria-label="合成作業編輯驗證"><div id="root"></div></main><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/@vite/client');
const {default:React}=await import(${JSON.stringify(optimizedModule('react.js'))});const {createRoot}=(await import(${JSON.stringify(optimizedModule('react-dom_client.js'))})).default;
await import('/src/index.css');const {DtmSubmissionEditor}=await import('/src/features/public/dtm/DtmSubmissionEditor.tsx');
window.events=[];window.selectedRefs=[];window.failNextSave=false;
function Fixture(){const [state,setState]=React.useState(${JSON.stringify(fixture)});window.updateEditor=patch=>setState(prior=>({...prior,...patch}));window.editorState=state;
return React.createElement(DtmSubmissionEditor,{...state,onChoose:async file=>{window.events.push('choose');setState(prior=>({...prior,selectedFile:file,selectedFileScope:{userId:prior.userId,assignmentId:prior.assignment.id}}));},
onSave:async file=>{window.events.push('save');window.selectedRefs.push(file);if(window.failNextSave){window.failNextSave=false;throw new Error('Synthetic uncertain save response');}},
onRemovePending:()=>{window.events.push('remove');setState(prior=>({...prior,selectedFile:null,selectedFileScope:null}));},onCancel:()=>{window.events.push('cancel');},onDownload:id=>{window.events.push('download:'+id);}});}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));</script></body></html>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const geometry={},failures=[],sourceContrast=[],errors=[];let apiRequests=0,externalRequests=0;
const near=(value,expected,label,tolerance=.1)=>{if(Math.abs(value-expected)>tolerance)failures.push(`${label}: ${value} versus source ${expected}`);};
const captured=(property,value)=>{const found=source.find(item=>item[property]===value);assert.ok(found,`Source ${property}=${value}`);return found;};
try{
  await mkdir(directory,{recursive:true,mode:0o700});
  const context=await browser.newContext({viewport:{width:1533,height:900},locale:'zh-TW',timezoneId:'Asia/Taipei'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==new URL(base).origin){externalRequests++;return route.abort();}if(url.pathname.startsWith('/api/')){apiRequests++;return route.abort();}return route.continue();});
  await context.route(base+'/__dtm-submission-editor-qa',route=>route.fulfill({contentType:'text/html',body:html}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.goto(base+'/__dtm-submission-editor-qa');await page.locator('.dtm-editor-filebox').waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const [selector,key,value] of [
    ['.dtm-submission-editor','id','region-main'],['.dtm-editor-content-start','id','maincontent'],['.dtm-submission-editor>h2','tag','H2'],
    ['.dtm-editor-form','tag','FORM'],['.dtm-editor-file-field','id','fitem_id_files_filemanager'],['.dtm-editor-label','cls','fitemtitle'],
    ['.dtm-editor-manager','cls','felement ffilemanager'],['.dtm-editor-restrictions','cls','fp-restrictions'],['.dtm-editor-navbar','cls','fp-navbar'],
    ['.dtm-editor-tools','cls','fp-toolbar'],['.dtm-editor-path','cls','fp-pathbar'],['.dtm-editor-content','cls','fp-content'],['.dtm-editor-tile','cls','fp-file fp-hascontextmenu'],
    ['.dtm-editor-thumbnail','cls','fp-thumbnail'],['.dtm-editor-actions','id','fgroup_id_buttonar'],['.dtm-editor-actions>div','cls','felement fgroup'],
    ['.dtm-editor-actions button[type=submit]','id','id_submitbutton'],['.dtm-editor-actions button[type=button]','id','id_cancel']]){
    const actual=await page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {x:r.x,y:r.y,width:r.width,height:r.height,fontSize:s.fontSize,lineHeight:s.lineHeight};});
    geometry[selector]=actual;const expected=captured(key,value).rect;for(const dim of ['x','y','width','height'])near(actual[dim],expected[dim],selector+' '+dim);
  }
  assert.equal(geometry['.dtm-submission-editor>h2'].fontSize,'28px');assert.equal(geometry['.dtm-submission-editor>h2'].lineHeight,'40px');
  assert.equal(geometry['.dtm-editor-manager'].fontSize,'11px');assert.equal(geometry['.dtm-editor-manager'].lineHeight,'20px');
  assert.match(await page.locator('.dtm-editor-restrictions').innerText(),/10 MiB/);assert.doesNotMatch(await page.locator('.dtm-submission-editor').innerText(),/2\s*GB/);
  for(const asset of assets){const response=await context.request.get(base+asset.path);assert.equal(response.status(),200);assert.equal(response.headers()['content-type'].split(';')[0],asset.mime);const bytes=await response.body();assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);}
  assert.equal(await page.locator('.dtm-editor-pdf').evaluate(node=>node.complete&&node.naturalWidth===80),true);
  const thumbnailImage=await page.locator('.dtm-editor-thumbnail img').evaluate(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {x:r.x,y:r.y,width:r.width,height:r.height,padding:s.padding,border:s.border,shadow:s.boxShadow};});
  // Captured inline-image baseline differs by0.4921875px; preserve measured CSS, not a guessed transform.
  for(const [dimension,expected] of Object.entries({x:701.828125,y:350.5546875,width:88,height:88}))near(thumbnailImage[dimension],expected,'PDF thumbnail '+dimension,dimension==='y'?1:.1);
  assert.equal(thumbnailImage.padding,'3px');assert.equal(thumbnailImage.border,'1px solid rgb(221, 221, 221)');assert.equal(thumbnailImage.shadow,'rgb(204, 204, 204) 1px 1px 2px 0px');
  geometry['.dtm-editor-thumbnail img']=thumbnailImage;
  await page.locator('.dtm-submission-editor').screenshot({path:directory+'/desktop.png'});
  assert.equal(await page.getByRole('button',{name:'儲存更改'}).isDisabled(),true);
  await page.getByRole('button',{name:'下載已儲存檔案'}).click();assert.ok((await page.evaluate(()=>window.events)).includes('download:synthetic-saved-file'));
  // Playwright sets the native input directly; no chooser or actual upload occurs.
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-pending.pdf',mimeType:'application/pdf',buffer:Buffer.from('Synthetic PDF test bytes, not an uploaded document.')});
  await page.getByText('synthetic-pending.pdf',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'儲存更改'}).isEnabled(),true);
  await page.evaluate(()=>{window.failNextSave=true;});await page.getByRole('button',{name:'儲存更改'}).click();await page.getByRole('alert').filter({hasText:'Synthetic uncertain save response'}).waitFor();
  await page.getByRole('button',{name:'儲存更改'}).click();await page.waitForFunction(()=>window.selectedRefs.length===2);assert.equal(await page.evaluate(()=>window.selectedRefs[0]===window.selectedRefs[1]),true);
  for(const label of ['清單檢視','樹狀檢視','圖示檢視']){await page.getByRole('button',{name:label}).click();assert.equal(await page.getByRole('button',{name:label}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByText('synthetic-pending.pdf',{exact:true}).count(),1);}
  for(const width of [1533,390,320]){
    await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No viewport overflow '+width);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    for(const violation of result.violations.filter(item=>['serious','critical'].includes(item.impact)))for(const node of violation.nodes){
      const inherited=violation.id==='color-contrast'&&node.target.length===1&&await page.locator(node.target[0]).evaluate(element=>{const s=getComputedStyle(element);return element.matches('.dtm-editor-actions button')&&s.backgroundColor==='rgb(50, 136, 250)'&&s.color==='rgb(255, 255, 255)';});
      if(inherited)sourceContrast.push({width,id:violation.id,target:node.target});else failures.push(`${width} axe ${violation.id}: ${node.target.join(', ')}`);
    }
    if(width===390)await page.locator('.dtm-submission-editor').screenshot({path:directory+'/mobile.png'});
  }
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.events.filter(item=>item==='cancel').length),0);
  await page.getByRole('button',{name:'取消'}).click();assert.equal(await page.evaluate(()=>window.events.filter(item=>item==='cancel').length),1);assert.equal(await page.evaluate(()=>window.editorState.savedFile.id),'synthetic-saved-file');assert.equal(await page.getByText('synthetic-pending.pdf',{exact:true}).count(),1);
  await page.getByRole('button',{name:'移除待儲存檔案'}).click();await page.getByText('synthetic-saved-coursework.pdf',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'儲存更改'}).isDisabled(),true);
  await page.evaluate(()=>window.updateEditor({status:'uploading',progress:25}));assert.equal(await page.getByRole('progressbar').getAttribute('value'),'25');assert.equal(await page.getByRole('button',{name:'取消'}).isDisabled(),true);
  await page.evaluate(()=>window.updateEditor({status:'idle',error:'Synthetic host error'}));await page.getByRole('alert').filter({hasText:'Synthetic host error'}).waitFor();
  await page.evaluate(()=>window.updateEditor({userId:'another-owner'}));await page.getByText('目前沒有可編輯的作業。').waitFor();assert.equal(await page.getByText(/synthetic.*pdf/).count(),0);assert.equal(await page.getByRole('button').count(),0);
  assert.equal(apiRequests,0);assert.equal(externalRequests,0);assert.deepEqual(errors,[]);
  await writeFile(directory+'/result.json',JSON.stringify({passed:failures.length===0,geometry,failures,sourceContrast,apiRequests,externalRequests,errors},null,2)+'\n');
  assert.deepEqual(failures,[]);console.log('Submission editor isolated UI passed: source geometry/assets, controlled file callbacks, retry/cancel/privacy, 1533/390/320 containment, zero API/external requests; only exact source action-button contrast accepted.');
}finally{await browser.close();}
