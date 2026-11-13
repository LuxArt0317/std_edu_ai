import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {load} from 'cheerio';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {renderDirectSchoolPage} from '../../scripts/lib/direct-school-pages.mjs';

// Presentation only: actual component/Sheet and copied-page host, synthetic
// sessions, no auth/provider/API/model calls. This owns and closes its server.
const root=fileURLToPath(new URL('../../',import.meta.url));
const cache=await mkdtemp(path.join(tmpdir(),'stu-assistant-presentation-'));
const artifact=path.join(root,'artifacts/assistant-presentation');
const entries=JSON.parse(await readFile(path.join(root,'src/features/public/mirror/pages.json'),'utf8'));
const copied=entries.find(page=>page.route==='/');
assert.ok(copied,'The real copied-page wrapper must be available.');
const $=load(renderDirectSchoolPage(root,copied));
const notice=$('.stu-direct-notice').clone();notice.find('iframe').remove();
const outer=notice.toString()+$('.stu-assistant-toggle').toString()+$('#stu-assistant-panel').toString();
assert.ok(outer.includes('/campus-assistant?embed=1'));
const fenced='\n\n```text\nBEGIN_'+('UNBROKEN_TOKEN_'.repeat(70))+'FENCE_END\n```';
const messages=Array.from({length:20},(_,index)=>({id:`synthetic-${index}`,role:'assistant',phase:'complete',content:`Synthetic layout row ${index+1}.\n\n${'Readable conversation content. '.repeat(9)}${index===18?fenced:''}${index===19?'\n\n'+('long-token-'.repeat(100)):''}`}));
const entry=`import React from 'react';
import {createRoot} from 'react-dom/client';
import {PublicAssistant} from '/src/features/public/PublicAssistant.tsx';
import {AffairsContext} from '/src/features/public/affairs/authContext.ts';
import {PreviewNotice} from '/src/features/public/site/PreviewNotice.tsx';
import '/src/index.css';
import '/src/features/public/site/reference.css';
const embedded=location.pathname==='/campus-assistant';
const user=window.__presentationSignedIn?{id:'00000000-0000-4000-8000-000000000001',email:'layout@example.invalid'}:null;
createRoot(document.getElementById('root')).render(React.createElement(AffairsContext.Provider,{value:{user,loading:false,error:''}},React.createElement('main',{className:'public-site-shell'},!user&&!embedded?React.createElement(PreviewNotice,{compact:true}):null,React.createElement('h1',null,'Synthetic presentation fixture'),React.createElement(PublicAssistant,{initialOpen:embedded,embedded}))));`;
const sessionStub=`import {useState} from 'react';
export function useAssistantSessions(){
  const [messages,setMessages]=useState(${JSON.stringify(messages)});
  return {messages,setMessages,active:{id:'synthetic-chat',version:1},conversations:[{id:'synthetic-chat',title:'Synthetic presentation conversation'}],unsavedConversationIds:[],loadingChat:false,syncing:false,syncError:'',persistenceStatus:'Synthetic local fixture',newChat:()=>setMessages([]),chooseChat:()=>{},deleteChat:()=>{},retrySync:()=>{}};
}`;
const blockedStub=`const blocked=()=>{window.__presentationBlockedCalls=(window.__presentationBlockedCalls||0)+1;throw Error('Network/service invocation is outside this presentation test');};export {blocked as askCampusAssistant,blocked as submitAssistantFeedback,blocked as askSchoolAffairsAssistant,blocked as performSchoolAffairsAction};`;
let server,browser;
const results=[],pageErrors=[],blockedRequests=[];
function document(body,embedded=false){return `<!doctype html><html lang="en"${embedded?' class="stu-assistant-embed"':''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Synthetic assistant presentation</title></head><body>${body}</body></html>`;}
function near(actual,expected,label){assert.ok(Math.abs(actual-expected)<1,`${label}: ${actual} != ${expected}`);}
async function settled(page){await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));}
async function settledSurface(surface){await surface.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await surface.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));}
async function bounds(locator){return locator.evaluate(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};});}
try {
  server=await createServer({root,configFile:false,envFile:false,cacheDir:cache,logLevel:'error',resolve:{alias:{'@':path.join(root,'src')}},server:{host:'127.0.0.1',port:0,strictPort:true,hmr:false},plugins:[{
    name:'isolated-assistant-presentation',enforce:'pre',
    resolveId(id){if(id==='/__assistant_presentation.tsx')return '\0assistant-presentation.jsx';},
    load(id){
      if(id==='\0assistant-presentation.jsx')return entry;
      if(id.endsWith('/src/features/public/useAssistantSessions.ts'))return sessionStub;
      if(['/src/services/researchAssistant.ts','/src/services/schoolAffairsAssistant.ts','/src/services/schoolAffairsWorkspace.ts'].some(file=>id.endsWith(file)))return blockedStub;
    },
    configureServer(instance){instance.middlewares.use(async(req,res,next)=>{
      const pathname=new URL(req.url||'/','http://localhost').pathname;
      if(pathname.startsWith('/api/')){res.statusCode=500;res.end('Presentation fixture has no API.');return;}
      if(!['/__native','/__copied','/campus-assistant'].includes(pathname)){next();return;}
      try {
        const html=pathname==='/__copied'
          ? document(`<link rel="stylesheet" href="/direct-school.css"><main><h1>Synthetic copied page</h1><p>Local fixture only.</p></main>${outer}<script src="/direct-school-assistant.js"></script>`)
          : document('<div id="root"></div><script type="module" src="/__assistant_presentation.tsx"></script>',pathname==='/campus-assistant');
        res.setHeader('content-type','text/html');res.end(await instance.transformIndexHtml(req.url,html));
      }catch(error){next(error);}
    });},
  },react(),tailwindcss()]});
  await server.listen();
  const address=server.httpServer.address();assert.ok(address&&typeof address==='object');
  const origin=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  await mkdir(artifact,{recursive:true});
  await rm(path.join(artifact,'result.json'),{force:true});
  for(const signedIn of [false,true])for(const [width,height] of [[1533,900],[640,900],[639,844],[390,844],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
    await context.addInitScript(signed=>{window.__presentationSignedIn=signed;},signedIn);
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin||url.pathname.startsWith('/api/')){blockedRequests.push({origin:url.origin,path:url.pathname});return route.abort();}
      return route.continue();
    });
    try {
      const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>pageErrors.push(error.message));
      for(const mode of ['native','copied']){
        const label=`${mode}-${signedIn?'signed':'guest'}-${width}x${height}`;
        await page.goto(origin+'/__'+mode);
        const launcher=page.getByRole('button',{name:'開啟 AI 校園助理',exact:true});
        await launcher.waitFor();
        assert.equal(await page.locator(mode==='native'?'.public-assistant-surface':'#stu-assistant-panel:popover-open').count(),0,label+' starts closed');
        await launcher.click();
        const view=mode==='native'?page:page.frameLocator('.stu-assistant-frame');
        const surface=view.locator('.public-assistant-surface');await surface.waitFor();await settled(page);
        await settledSurface(surface);
        const panel=mode==='native'?surface:page.locator('#stu-assistant-panel');
        const rect=await bounds(panel),expectedWidth=width<640?width:512;
        near(rect.x,width-expectedWidth,label+' right alignment');near(rect.y,0,label+' top');near(rect.width,expectedWidth,label+' width');near(rect.height,height,label+' full height');near(rect.right,width,label+' right edge');
        if(mode==='copied'){
          const frame=await bounds(page.locator('.stu-assistant-frame')),inside=await bounds(surface);
          near(frame.height,height,label+' iframe height');near(inside.x,0,label+' iframe local x');near(inside.y,0,label+' iframe local y');near(inside.width,frame.width,label+' inner width');near(inside.height,frame.height,label+' inner height');
          assert.equal(await page.locator('#stu-assistant-panel').evaluate(element=>getComputedStyle(element).borderRadius),'0px');
          assert.equal(await view.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).count(),0,label+' no duplicate inner launcher');
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' document containment');
        assert.ok(await surface.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' inner document containment');
        assert.ok(await surface.evaluate(element=>element.scrollWidth<=element.clientWidth),label+' panel containment');
        const log=view.getByRole('log');assert.ok(await log.evaluate(element=>element.scrollHeight>element.clientHeight),label+' conversation scrolls');
        await log.evaluate(element=>{element.scrollTop=0;});assert.equal(await log.evaluate(element=>element.scrollTop),0,label+' conversation start reachable');
        await log.evaluate(element=>{element.scrollTop=element.scrollHeight;});assert.ok(await log.evaluate(element=>element.scrollTop>0),label+' conversation end reachable');
        const ordinary=view.locator('.nexus-message-markdown p').filter({hasText:'long-token-'});
        assert.ok(await ordinary.evaluate(element=>element.scrollWidth<=element.clientWidth&&element.getBoundingClientRect().height>parseFloat(getComputedStyle(element).lineHeight)*2),label+' ordinary long text wraps without clipping');
        const pre=view.locator('.nexus-message-markdown pre');await pre.scrollIntoViewIfNeeded();
        const preSize=await pre.evaluate(element=>({client:element.clientWidth,scroll:element.scrollWidth,overflow:getComputedStyle(element).overflowX}));
        assert.equal(preSize.overflow,'auto',label+' fenced code exposes horizontal scrolling');assert.ok(preSize.scroll>preSize.client*3,label+' fixture exceeds the fenced viewport');
        await pre.evaluate(element=>{element.scrollLeft=0;});await pre.hover();await page.mouse.wheel(preSize.scroll*2,0);
        await pre.evaluate(element=>new Promise((resolve,reject)=>{const deadline=performance.now()+2500;function check(){if(element.scrollLeft+element.clientWidth>=element.scrollWidth-1)resolve();else if(performance.now()>deadline)reject(Error('Fenced code did not scroll to its end with wheel input.'));else requestAnimationFrame(check);}check();}));
        assert.ok(await pre.evaluate(element=>{const text=element.querySelector('code').firstChild,end=text.textContent.lastIndexOf('FENCE_END')+9,range=document.createRange();range.setStart(text,end-9);range.setEnd(text,end);const tail=range.getBoundingClientRect(),box=element.getBoundingClientRect();return tail.left>=box.left-1&&tail.right<=box.right+1;}),label+' final fenced characters are visible');
        assert.ok(await surface.evaluate(element=>element.scrollWidth<=element.clientWidth),label+' fenced scrolling stays inside panel');
        const field=view.getByPlaceholder('Ask a school question…');await field.fill('Synthetic unsent draft');await field.scrollIntoViewIfNeeded();
        const send=view.getByRole('button',{name:'Send',exact:true});await send.scrollIntoViewIfNeeded();
        const sendRect=await bounds(send),surfaceRect=await bounds(surface);
        assert.ok(sendRect.x>=surfaceRect.x&&sendRect.right<=surfaceRect.right+1&&sendRect.y>=0&&sendRect.bottom<=height+1,label+' Send reachable inside viewport');
        const attach=view.locator('button[aria-label="Attach images"]');await attach.scrollIntoViewIfNeeded();
        assert.ok(await attach.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),label+' attachment control is not covered by the unchanged notice');
        if(width===320){
          const cdp=await context.newCDPSession(page);
          try {
            await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:12,right:10,bottom:24,left:6}});
            const safe=await surface.evaluate(element=>{const header=getComputedStyle(element.querySelector('header')),form=getComputedStyle(element.querySelector('form'));return {top:parseFloat(header.paddingTop),right:parseFloat(form.paddingRight),bottom:parseFloat(form.paddingBottom),left:parseFloat(form.paddingLeft)};});
            assert.deepEqual(safe,{top:32,right:26,bottom:40,left:22},label+' emulated safe-area spacing');
            await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{}});
          }finally{await cdp.detach();}
        }
        await field.focus();await page.keyboard.press('Escape');
        await (mode==='native'?surface:page.locator('#stu-assistant-panel')).waitFor({state:'hidden'});
        await launcher.click();await surface.waitFor();await settledSurface(surface);assert.equal(await field.inputValue(),'Synthetic unsent draft',label+' close preserves draft');
        const reopened=await bounds(surface);near(reopened.x,mode==='native'?width-expectedWidth:0,label+' reopened chat remains on screen');
        if(mode==='native')await view.getByRole('button',{name:'Close',exact:true}).click();else await page.getByRole('button',{name:'關閉校園助理',exact:true}).click();
        await (mode==='native'?surface:page.locator('#stu-assistant-panel')).waitFor({state:'hidden'});
        assert.equal(await surface.count(),mode==='native'?0:1);
        assert.equal(await page.evaluate(()=>window.__presentationBlockedCalls||0),0);
        if(mode==='copied')assert.equal(await page.frameLocator('.stu-assistant-frame').locator('body').evaluate(()=>window.__presentationBlockedCalls||0),0);
        results.push({mode,signedIn,width,height,panel:rect,contained:true,scrollAndComposerReachable:true,fencedCodeWheelScrollAndEndVisible:true,ordinaryLongTextWraps:true,closePreservesDraft:true});
        if(!signedIn&&[1533,390].includes(width)){
          await launcher.click();await surface.waitFor();await settled(page);await settledSurface(surface);near((await bounds(surface)).x,mode==='native'?width-expectedWidth:0,label+' screenshot chat position');await page.screenshot({path:path.join(artifact,`${mode}-${width}.jpg`),type:'jpeg',quality:55});
        }
      }
    }finally{await context.close();}
  }
  assert.deepEqual(pageErrors,[]);assert.deepEqual(blockedRequests,[]);
  const result={status:'passed',syntheticOnly:true,actualComponentAndIframe:true,states:results,apiCalls:0,modelCalls:0,externalRequests:0,pageErrors:0,limits:'Synthetic auth/session state; no real conversation persistence, API or model verification. Safe-area CSS is present; physical notched-device behavior is not claimed.'};
  await writeFile(path.join(artifact,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,states:results.length,apiCalls:0,modelCalls:0,externalRequests:0,pageErrors:0,artifacts:'artifacts/assistant-presentation'}));
}finally{await browser?.close();await server?.close();await rm(cache,{recursive:true,force:true});}
