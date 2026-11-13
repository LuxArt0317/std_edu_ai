// Local synthetic rendering only. Official application, review and database writes are never exercised.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';

const origin=new URL(process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5176');
assert.ok(origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname)
  &&origin.pathname==='/'&&!origin.username&&!origin.password&&!origin.search&&!origin.hash,
'This synthetic suite requires a plain local HTTP origin.');
const base=origin.origin,entry='/school-affairs/services/7-1',indexPath='/school-affairs/course-selection';
const sourceDirectory='artifacts/visual-parity/credit-load-entry-source';
const directory=resolve('artifacts/credit-load-application-ui',new Date().toISOString().replaceAll(':','-'));
const captures={};
const sourceHashes={};
for(const name of ['capture.json','selection-index.json','review-destinations.json']){
  const bytes=await readFile(sourceDirectory+'/'+name);captures[name]=JSON.parse(bytes.toString());
  sourceHashes[name]=createHash('sha256').update(bytes).digest('hex');
}
assert.deepEqual(captures['capture.json'].viewport,{height:1399,width:1533});
assert.deepEqual(captures['selection-index.json'].viewport,{height:1399,width:1533});
assert.equal(captures['capture.json'].elements.length,30);
assert.equal(captures['selection-index.json'].elements.length,54);
for(const role of ['tutor','dean','academic'])assert.equal(captures['review-destinations.json'][role].final,'https://infosys.stu.edu.tw/WebSelectCourse/');
const snapshot={checkedAt:'2026-11-13T00:00:00Z',officialUniversityData:false,
  profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'},
  student:null,courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],serviceRecords:[],
  courseSelection:{records:[]},creditLoadHistory:{records:[]},dtm:{sourceMode:'personal',courses:[],notices:[]}};
const evidence={status:'running',stage:'initialization',syntheticOnly:true,sourceHashes,sourceViewport:{width:1533,height:1399},
  geometry:[],screenshots:[],navigation:[],dialogs:[],guestRoutes:[],apiReads:[],mockAuthCalls:[],
  blockedRequests:[],suppressedLocalWebSockets:0,pageErrors:[],sourceBoundary:'Observed instructions, closed alert and student Index only; open application and staff review forms remain unobserved.',
  genericNavigationOnly:['7-6','6-4'],liveApiCalls:0,liveAuthCalls:0,modelCalls:0};
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const authLogs=[];
let diagnosticPage;

async function context(signedIn){
  const ctx=await browser.newContext({viewport:{width:1533,height:1399},reducedMotion:'reduce',serviceWorkers:'block'});
  ctx.setDefaultTimeout(12000);ctx.setDefaultNavigationTimeout(30000);
  await ctx.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==base||request.method()!=='GET'){
      evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname});
      return route.abort('blockedbyclient');
    }
    if(url.pathname.startsWith('/api/')){
      if(url.search===''&&['/api/affairs-data','/api/affairs-conversations'].includes(url.pathname)){
        evidence.apiReads.push(url.pathname);
        return route.fulfill({json:url.pathname==='/api/affairs-data'?snapshot:{conversations:[]}});
      }
      evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname});
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  authLogs.push(await mockAffairsAuth(ctx,{signedIn}));
  await ctx.routeWebSocket('**/*',socket=>{
    const url=new URL(socket.url());
    // Vite's local HMR may reconnect after a document navigation. It is still never connected.
    if(url.protocol==='ws:'&&url.host===origin.host)evidence.suppressedLocalWebSockets++;
    else evidence.blockedRequests.push({method:'WEBSOCKET',origin:url.origin,path:url.pathname});
    socket.close();
  });
  ctx.on('page',page=>page.on('pageerror',error=>evidence.pageErrors.push(error.message)));
  return ctx;
}
async function settle(page){
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
}
async function visit(page,path,selector){
  await page.goto(base+path);await page.locator(selector).waitFor();await settle(page);
  assert.equal(new URL(page.url()).pathname,path.split(/[?#]/)[0]);
}
async function measure(page,selector,sourceName,sourceIndex,nth=0,fields=['x','y','width','height']){
  const actual=await page.locator(selector).nth(nth).boundingBox(),expected=captures[sourceName].elements[sourceIndex].rect;
  assert.ok(actual,`Missing geometry element ${selector}[${nth}]`);
  evidence.geometry.push({page:new URL(page.url()).pathname,selector,nth,sourceName,sourceIndex,actual,expected,
    delta:Object.fromEntries(fields.map(key=>[key,actual[key]-expected[key]]))});
}
async function screenshot(page,label,width){
  await page.setViewportSize({width,height:1399});await settle(page);
  const bounds=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,
    elements:[...document.querySelectorAll('.course-selection-system-frame,.course-selection-system-main,.course-selection-index-panel,.credit-load-application,.course-selection-system-footer')].map(element=>{
      const r=element.getBoundingClientRect();return {className:element.className,left:r.left,right:r.right};
    })}));
  const path=directory+'/'+label+'-'+width+'.png';await page.screenshot({path,fullPage:true});
  evidence.screenshots.push({label,width,path,bounds});
  assert.ok(bounds.scroll<=width+1,`${label} document overflows ${width}px: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.elements.every(rect=>rect.left>=0&&rect.right<=width+1),`${label} content overflows ${width}px`);
}
async function closedDialog(page,method,width){
  const button=page.getByRole('button',{name:'我已了解',exact:true}),before=page.url(),reads=evidence.apiReads.length;
  await button.click();const dialog=page.getByRole('alertdialog');await dialog.waitFor();await settle(page);
  assert.equal(await dialog.getByRole('heading',{name:'目前非超減修申請時間~',exact:true}).count(),1);
  const confirm=dialog.getByRole('button',{name:'OK',exact:true});
  assert.ok(await dialog.evaluate(element=>element.contains(document.activeElement)),'Alert receives keyboard focus.');
  await page.keyboard.press('Tab');
  assert.ok(await dialog.evaluate(element=>element.contains(document.activeElement)),'Focus stays in the alert.');
  const bounds=await dialog.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1,'Alert stays within the viewport.');
  if(method==='escape')await page.keyboard.press('Escape');else await confirm.click();
  await dialog.waitFor({state:'hidden'});
  assert.ok(await button.evaluate(element=>element===document.activeElement),'Closing the alert returns focus to acknowledgement.');
  assert.equal(page.url(),before,'Closed-period acknowledgement does not submit or leave the entry page.');
  assert.equal(evidence.apiReads.length,reads,'Acknowledgement has no record-read side effect.');
  evidence.dialogs.push({method,width,focusRestored:true});
}

try{
  const signedIn=await context(true),page=await signedIn.newPage();diagnosticPage=page;
  evidence.stage='entry-source-geometry';
  await visit(page,entry,'.credit-load-application');
  assert.equal(await page.locator('.student-service,.student-service-body').count(),0,'7-1 replaces the generic tracker.');
  assert.equal(await page.locator('.credit-load-application input,.credit-load-application select,.credit-load-application textarea,.credit-load-application form').count(),0,'No unobserved application inputs.');
  assert.deepEqual(await page.locator('.credit-load-application-instructions li').allTextContents(),captures['capture.json'].elements.slice(21,25).map(row=>row.text.trim()));
  assert.equal((await page.locator('.course-selection-system-section-title').textContent()).trim(),captures['capture.json'].elements[19].text.trim());
  assert.equal(await page.locator('.course-selection-system-footer').textContent(),'stu.best');
  assert.ok(await page.locator('.course-selection-system-brand img').evaluate(img=>img.complete&&img.naturalWidth>0));
  for(const [selector,sourceIndex]of [
    ['.course-selection-system-frame',2],['.course-selection-system-brand img',4],['.course-selection-system-main',17],
    ['.course-selection-system-heading h1',18],['.course-selection-system-section-title',19],
    ['.credit-load-application-instructions ol',20],['.credit-load-application-button:not(.credit-load-application-exit)',25],
    ['.credit-load-application-exit',26],['.credit-load-application-info',27],
  ])await measure(page,selector,'capture.json',sourceIndex);
  for(let n=0;n<4;n++){
    await measure(page,'.credit-load-application-instructions li','capture.json',21+n,n);
    // Source LI includes the two one-pixel nav separators, matching the local button border box.
    await measure(page,'.course-selection-system-nav>button','capture.json',5+n*2,n);
  }
  for(const width of [1533,390,320]){
    await screenshot(page,'entry',width);await closedDialog(page,'confirm',width);await closedDialog(page,'escape',width);
  }
  assert.equal(evidence.apiReads.filter(path=>path==='/api/affairs-data').length,0,'Static entry needs no account-record fetch.');
  evidence.stage='exit-and-index-source-geometry';
  await page.setViewportSize({width:1533,height:1399});
  assert.equal(await page.getByRole('link',{name:'離開',exact:true}).getAttribute('href'),indexPath);
  await page.getByRole('link',{name:'離開',exact:true}).click();
  await page.waitForURL(url=>url.pathname===indexPath);await page.locator('.course-selection-index-column').waitFor();await settle(page);
  assert.equal(await page.locator('.course-selection-index-panel').count(),6);
  for(const [selector,sourceIndex]of [
    ['.course-selection-system-frame',2],['.course-selection-system-brand img',5],['.course-selection-system-nav',6],
    ['.course-selection-system-main',18],['.course-selection-system-heading',19],['.course-selection-system-heading h1',20],
    ['.course-selection-index-column',24],['.course-selection-system-section-title',25],['.course-selection-system-footer',51],
  ])await measure(page,selector,'selection-index.json',sourceIndex);
  for(const [n,sourceIndex]of [26,29,32,35,38,41].entries())await measure(page,'.course-selection-index-panel','selection-index.json',sourceIndex,n);
  for(const [n,sourceIndex]of [28,31,34,37,40,43,45,47,49].entries())await measure(page,'.course-selection-index-panel a','selection-index.json',sourceIndex,n);
  for(const width of [1533,390,320])await screenshot(page,'index',width);

  evidence.stage='index-link-destinations';await page.setViewportSize({width:1533,height:1399});
  const destinations=[
    ['學生超減修申請',entry,entry,'.credit-load-application','native-entry'],
    ['學生歷年超減修申請紀錄查詢','/school-affairs/services/11-3','/school-affairs/services/11-3','.credit-load-history','native-history'],
    ['導師審核',indexPath+'/review/tutor',indexPath,'.course-selection-index-column','observed-redirect'],
    ['系主任線上審核',indexPath+'/review/dean',indexPath,'.course-selection-index-column','observed-redirect'],
    ['教務組線上審核',indexPath+'/review/academic',indexPath,'.course-selection-index-column','observed-redirect'],
    ['選課記錄查詢','/school-affairs/services/11-1','/school-affairs/services/11-1','.course-selection','native-history'],
    ['學生一周課表首頁','/school-affairs/services/11-2','/school-affairs/services/11-2','.course-selection','native-timetable'],
    ['線上教學反應','/school-affairs/services/7-6','/school-affairs/services/7-6','.student-service','generic-navigation-only'],
    ['棄選','/school-affairs/services/6-4','/school-affairs/services/6-4','.student-service','generic-navigation-only'],
  ];
  assert.deepEqual(await page.locator('.course-selection-index-panel a').allTextContents(),destinations.map(row=>row[0]));
  for(const [label,href,finalPath,selector,coverage]of destinations){
    await visit(page,indexPath,'.course-selection-index-column');
    const link=page.locator('.course-selection-index-column').getByRole('link',{name:label,exact:true});
    assert.equal(await link.getAttribute('href'),href);await link.click();
    await page.waitForURL(url=>url.pathname===finalPath);await page.locator(selector).waitFor();
    evidence.navigation.push({label,href,finalPath,coverage});
  }
  for(const role of ['tutor','dean','academic']){
    await page.goto(base+indexPath+'/review/'+role+'?qa=preserved%20space#source');
    await page.waitForURL(url=>url.pathname===indexPath);await page.locator('.course-selection-index-column').waitFor();
    assert.equal(new URL(page.url()).search,'?qa=preserved%20space');assert.equal(new URL(page.url()).hash,'#source');
  }
  evidence.stage='catalog-and-history-links';
  await page.goto(base+'/school-affairs/menu/aca/input');
  const menuLink=page.getByRole('link',{name:'超減修學分申請',exact:true});await menuLink.waitFor();
  assert.equal(await menuLink.getAttribute('href'),entry);await menuLink.click();await page.locator('.credit-load-application').waitFor();
  await page.reload();await page.locator('.credit-load-application').waitFor();
  for(const [path,selector]of [['11-1','.course-selection-breadcrumb'],['11-2','.course-selection-breadcrumb'],['11-3','.credit-load-breadcrumb']]){
    await visit(page,'/school-affairs/services/'+path,selector);
    const link=page.locator(selector).getByRole('link',{name:'Index',exact:true});assert.equal(await link.getAttribute('href'),indexPath);
    await link.click();await page.waitForURL(url=>url.pathname===indexPath);await page.locator('.course-selection-index-column').waitFor();
  }
  for(const [path,heading]of [[entry+'/unobserved','找不到服務 · Service not found'],[indexPath+'/review/unknown','找不到選單']]){
    await page.goto(base+path);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
    assert.equal(await page.locator('.credit-load-application,.course-selection-index-column').count(),0);
  }
  await signedIn.close();diagnosticPage=undefined;
  evidence.stage='guest-gating';const guest=await context(false),guestPage=await guest.newPage();diagnosticPage=guestPage;
  for(const path of [entry,indexPath,...['tutor','dean','academic'].map(role=>indexPath+'/review/'+role)]){
    await guestPage.goto(base+path);await guestPage.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
    assert.equal(new URL(guestPage.url()).pathname,'/school-affairs/login');assert.equal(new URL(guestPage.url()).searchParams.get('next'),path);
    assert.equal(await guestPage.locator('.credit-load-application,.course-selection-index-column').count(),0);evidence.guestRoutes.push(path);
  }
  await guest.close();diagnosticPage=undefined;
  evidence.stage='final-evidence-checks';
  for(const call of authLogs.flat()){
    evidence.mockAuthCalls.push(call.pathname);
    assert.ok(['/auth/v1/user','/auth/v1/settings'].includes(call.pathname),'Unexpected synthetic provider operation: '+call.pathname);
  }
  assert.deepEqual(evidence.blockedRequests,[]);assert.deepEqual(evidence.pageErrors,[]);
  for(const row of evidence.geometry)for(const [key,delta]of Object.entries(row.delta))assert.ok(Math.abs(delta)<1,
    `${row.page} ${row.selector}[${row.nth}] ${key} differs from source by ${delta}px`);
  evidence.status='passed';
  console.log('Credit-load entry UI passed: source geometry, desktop/390/320 containment, closed alert/focus, local Exit/Index/native and redirect navigation, guest gating. Two existing generic destinations are navigation-only; no open application or staff-review capability claimed. Zero live API/auth/model calls.');
}catch(error){
  evidence.status='failed';evidence.error=error instanceof Error?error.message:'UI verification failed';
  if(diagnosticPage&&!diagnosticPage.isClosed())evidence.failurePath=new URL(diagnosticPage.url()).pathname;
  if(diagnosticPage&&!diagnosticPage.isClosed())await diagnosticPage.screenshot({path:directory+'/failure.png',fullPage:true}).catch(()=>{});
  throw error;
}finally{
  await browser.close();await writeFile(directory+'/result.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  console.log('Evidence: '+directory+'/result.json');
}
