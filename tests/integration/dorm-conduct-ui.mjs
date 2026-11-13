import assert from 'node:assert/strict';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

// Fully offline synthetic rendering: no server and no forwarded network requests.
process.umask(0o077);
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const output='artifacts/dorm-conduct-workspace',origin='https://dorm-conduct.invalid';
const css=await readFile('src/features/public/affairs/dormConduct.css','utf8');
const manifest=JSON.parse(await readFile('public/stu-reference/dorm-conduct-assets.json','utf8'));
const assets=new Map();for(const item of manifest.assets){const bytes=await readFile('public'+item.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.equal(bytes.length,item.bytes);assets.set(origin+item.path,bytes);}
const bundled=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {DormConduct} from './src/features/public/affairs/DormConduct.tsx';
const owner=${JSON.stringify(owner)};window.calls={home:0,reload:0};let state={userId:owner,identity:{userId:owner},snapshot:{userId:owner,sourceMode:'local_demo',version:1,result:'empty'},busy:false};
const root=createRoot(document.getElementById('root'));window.updateDorm=patch=>{state={...state,...patch};root.render(React.createElement(DormConduct,{...state,onHome:()=>window.calls.home++,onReload:()=>window.calls.reload++}));};window.updateDorm({});`,resolveDir:process.cwd(),sourcefile:'dorm-conduct-offline.tsx',loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${origin}/"><title>Synthetic Dorm Conduct verification</title><style>html,body{margin:0;padding:0}${css}</style></head><body><div id="root"></div><script>${bundled.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`;
const errors=[],unexpected=[],geometry=[],checks=[],images=[],a11y=[];let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:2,locale:'zh-TW',offline:true,serviceWorkers:'block'});
  await context.route('**/*',route=>{const asset=assets.get(route.request().url());if(route.request().method()==='GET'&&asset)return route.fulfill({contentType:'image/png',body:asset});unexpected.push('Unexpected request');return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
  await page.setContent(html);await page.getByRole('status').waitFor();await page.evaluate(()=>document.fonts.ready);
  const settled=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const update=async patch=>{await page.evaluate(value=>window.updateDorm(value),patch);await settled();};
  const contained=async()=>{await settled();const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(size.document<=size.viewport+1,JSON.stringify(size));return size;};
  await mkdir(output,{recursive:true,mode:0o700});
  // Exact official DOM measurements read by root, viewport 1280x720; no private values.
  for(const [name,selector,expected] of [
    ['outer','.dorm-conduct-shell',{x:179,y:24,width:922,height:465.4297}],
    ['container','.dorm-conduct-container',{x:180,y:25,width:920,height:443.4297}],
    ['content','.dorm-conduct-frame',{x:224,y:57.3984,width:832,height:378.6328}],
    ['vdata','.dorm-conduct-content',{x:224,y:61.3984,width:832,height:354.8672}],
    ['heading','.dorm-conduct-heading',{x:245,y:89.3984,width:790,height:62.875}],
    ['title','.dorm-conduct-heading h1',{x:254,y:99.8984,width:772,height:35.0781}],
    ['logo','.dorm-conduct-logo img',{x:254,y:99.8984,width:42,height:45}],
    ['event','.dorm-conduct-message-row',{x:245,y:182.2734,width:790,height:152.2266}],
    ['notice icon','.dorm-conduct-message-icon img',{x:250,y:187.2734,width:42,height:45}],
    ['message','.dorm-conduct-message',{x:300,y:192.2734,width:730,height:90}],
    ['related','.dorm-conduct-related',{x:300,y:312.2734,width:730,height:17.2266}],
    ['support','.dorm-conduct-support',{x:245,y:367.5,width:790,height:14.7656}],
    ['footer','.dorm-conduct-footer',{x:224,y:421.2656,width:832,height:14.7656}],
  ]){const actual=await page.locator(selector).boundingBox();assert.ok(actual);const deltas=Object.fromEntries(Object.keys(expected).map(key=>[key,actual[key]-expected[key]]));geometry.push({name,expected,actual,deltas});for(const [axis,delta] of Object.entries(deltas))assert.ok(Math.abs(delta)<=1.1,name+' '+axis+' measured DOM: '+delta);}
  await contained();assert.equal(await page.getByRole('status').textContent(),'您尚未有任何住宿的獎懲記錄.');
  assert.equal(await page.locator('table,form,iframe,object,embed,a[download]').count(),0);
  const styles=await page.evaluate(()=>Object.fromEntries(['.dorm-conduct','.dorm-conduct-shell','.dorm-conduct-heading','.dorm-conduct-heading h1','.dorm-conduct-message','.dorm-conduct-footer'].map(selector=>{const s=getComputedStyle(document.querySelector(selector));return [selector,{background:s.backgroundColor,color:s.color,border:s.borderColor,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,fontFamily:s.fontFamily}];})));
  assert.equal(styles['.dorm-conduct'].background,'rgb(239, 239, 240)');assert.equal(styles['.dorm-conduct-shell'].border,'rgb(201, 202, 203)');
  assert.equal(styles['.dorm-conduct-heading h1'].color,'rgb(4, 86, 125)');assert.equal(styles['.dorm-conduct-heading h1'].fontWeight,'600');assert.equal(styles['.dorm-conduct-heading h1'].fontSize,'22px');
  assert.equal(styles['.dorm-conduct-message'].background,'rgb(250, 250, 250)');assert.equal(styles['.dorm-conduct-message'].color,'rgb(155, 58, 15)');assert.equal(styles['.dorm-conduct-message'].lineHeight,'23.8px');assert.equal(styles['.dorm-conduct-footer'].color,'rgb(102, 102, 102)');
  assert.deepEqual(await page.locator('img').evaluateAll(nodes=>nodes.map(node=>[node.complete,node.naturalWidth,node.naturalHeight])),[[true,60,60],[true,64,64]]);
  checks.push('desktop measured source geometry, typography, palette and two verified source PNGs');
  await page.getByRole('link',{name:'HomePage'}).focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.calls.home),1);checks.push('keyboard HomePage callback');
  await page.locator('h1').click();await page.screenshot({path:output+'/empty-1280.jpg',type:'jpeg',quality:35,scale:'css'});images.push('empty-1280.jpg');
  for(const width of [390,320]){await page.setViewportSize({width,height:720});await contained();await page.getByRole('link',{name:'HomePage'}).focus();assert.equal(await page.getByRole('link',{name:'HomePage'}).evaluate(node=>node===document.activeElement),true);}
  await page.locator('h1').click();await page.screenshot({path:output+'/empty-320.jpg',type:'jpeg',quality:35,scale:'css'});images.push('empty-320.jpg');checks.push('390 and 320 contained layouts and visible keyboard navigation');
  await update({userId:other});assert.match(await page.getByRole('status').textContent(),/無法確認/);assert.doesNotMatch(await page.locator('main').textContent(),/尚未有任何/);
  await page.getByRole('button',{name:'重新載入'}).click();assert.equal(await page.evaluate(()=>window.calls.reload),1);
  await update({busy:true});assert.match(await page.getByRole('status').textContent(),/載入/);assert.equal(await page.getByRole('button',{name:'重新載入'}).count(),0);
  await update({busy:false,error:'PRIVATE SYNTHETIC PROVIDER FAILURE'});assert.match(await page.getByRole('alert').textContent(),/無法載入/);assert.doesNotMatch(await page.locator('main').textContent(),/PRIVATE|尚未有任何/);await contained();checks.push('account switch, unknown, loading, safe failure and retry');
  await page.addScriptTag({content:await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'),'utf8')});
  for(const state of ['error','empty']){if(state==='empty')await update({userId:owner,error:null});const violations=await page.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return result.violations.filter(row=>['serious','critical'].includes(row.impact)).map(row=>({id:row.id,targets:row.nodes.flatMap(node=>node.target)}));});a11y.push({state,violations});assert.deepEqual(violations,[]);}
  checks.push('zero serious or critical axe findings in empty and failure states');assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  const imageBytes=(await Promise.all(images.map(name=>stat(output+'/'+name)))).reduce((total,item)=>total+item.size,0);assert.ok(imageBytes<120000);
  await writeFile(output+'/result.json',JSON.stringify({status:'passed',checks,geometry,styles,a11y,imageBytes,networkForwarded:0,sourceProof:{viewport:{width:1280,height:720},method:'Official DOM measurements provided by root; exact public source assets checked by PNG signature and SHA256.',assets:manifest.assets},renderingDifference:'Source heading border1.5px is retained in CSS; this Chromium context rounds it to1px, producing a maximum1.024px geometry delta including fractional font/padding rounding.',sourceLimit:'Only the empty event-message page was observed; populated records and report schema remain unobserved.'},null,2),{mode:0o600});
  console.log(JSON.stringify({status:'passed',groups:checks.length,networkForwarded:0,imageBytes,unexpectedSeriousCritical:0}));
}finally{await browser?.close();}
