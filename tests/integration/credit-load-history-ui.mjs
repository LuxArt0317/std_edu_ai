import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';
import {mapCreditLoadHistory} from '../../server/creditLoadHistory.js';

const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Synthetic local browser fixtures only.');
const directory='artifacts/credit-load-history',errors=[],contrast=[],geometry={};
const sourceTypography={brandBackground:'rgb(124, 124, 124)',brandWeight:'400',breadcrumbColor:'rgb(76, 143, 189)',breadcrumbWeight:'400',subtitleColor:'rgb(153, 153, 153)',subtitleSize:'13.5px',subtitleLineHeight:'13.5px',navFontSize:'13px',navLineHeight:'20px',navPadding:'12px 15px 11px',navAnchorWidths:[97.6171875,124.1328125,97.6171875,81.8125],navFirstAnchorX1280:767.8203125,footerColor:'rgb(71, 143, 202)',footerLineHeight:'36px',footerX:202,footerHeight:55};
const checkedAt='2026-11-12T10:00:00Z';
const snapshot={checkedAt,officialUniversityData:false,profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'},student:null,
  courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
  scholarship:{periods:[],applications:[]},studentAid:{records:[]},housing:{periods:[],applications:[],assignments:[]},creditLoadHistory:{records:[]}};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function check(page,label,source=false){
  const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(size.document<=size.viewport,label+' page overflow '+JSON.stringify(size));
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(),failures=[];
  for(const violation of result.violations.filter(row=>['serious','critical'].includes(row.impact)))for(const node of violation.nodes){
    const inherited=source&&violation.id==='color-contrast'&&node.target.length===1&&await page.locator(node.target[0]).evaluate(element=>{
      const color=getComputedStyle(element).color,brand=element.closest('.credit-load-brand'),nav=element.closest('.credit-load-nav');
      return Boolean(brand&&color==='rgb(255, 255, 255)'&&getComputedStyle(brand).backgroundColor==='rgb(124, 124, 124)'
        ||nav&&color==='rgb(255, 255, 255)'&&getComputedStyle(nav).backgroundColor==='rgb(67, 142, 185)'
        ||element.closest('.credit-load-breadcrumb')&&color==='rgb(76, 143, 189)'
        ||element.matches('.credit-load-heading small')&&color==='rgb(153, 153, 153)'
        ||element.matches('.credit-load-notes h2,.credit-load-footer')&&color==='rgb(71, 143, 202)');
    });
    const finding={page:label,id:violation.id,target:node.target,summary:node.failureSummary};if(inherited)contrast.push(finding);else failures.push(finding);
  }
  assert.deepEqual(failures,[],label+' unexpected serious accessibility findings');
}
try{
  await mkdir(directory,{recursive:true});const context=await browser.newContext({viewport:{width:1280,height:720}});await mockAffairsAuth(context);
  let failRead=true;const studentWrites=[];
  await context.route('**/api/affairs-data*',route=>failRead?route.fulfill({status:503,json:{error:'Synthetic credit history read failure.'}}):route.fulfill({json:snapshot}));
  await context.route('**/api/affairs-action',route=>{studentWrites.push(route.request().postData());return route.fulfill({status:500,json:{error:'History must remain read-only.'}});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/school-affairs/services/11-3');await page.getByRole('alert').filter({hasText:'Synthetic credit history read failure.'}).waitFor();
  await page.screenshot({path:directory+'/error-1280.png',fullPage:true});failRead=false;await page.getByRole('button',{name:'重新載入',exact:true}).click();await page.getByText('Date/Time : 2026/11/12 18:00:00',{exact:true}).waitFor();
  assert.equal(await page.locator('.credit-load-table-wrap tbody tr').count(),0,'Source closed empty view keeps an empty tbody.');
  assert.deepEqual(await page.locator('.credit-load-table-wrap th').allTextContents(),['申請學年','申請學期','類別','申請超修或減修學分數','申請進度','審核結果']);
  assert.equal(await page.locator('.credit-load-main form,.credit-load-main input,.credit-load-main select,.credit-load-main button,.credit-load-table-wrap a').count(),0,'No unobserved application controls.');
  for(const selector of ['.credit-load-frame','.credit-load-nav','.credit-load-main','.credit-load-heading','.credit-load-heading h1','.credit-load-record-heading','.credit-load-table-wrap table','.credit-load-table-wrap thead','.credit-load-notes h2'])geometry[selector]=await page.locator(selector).boundingBox();
  const table=geometry['.credit-load-table-wrap table'];assert.ok(Math.abs(table.x-100)<.5&&Math.abs(table.y-244.796875)<.5&&Math.abs(table.width-1080)<.5,'Source table geometry '+JSON.stringify(table));
  assert.ok(Math.abs(table.height-36.5703125)<.5,'Source empty table height '+JSON.stringify(table));
  assert.ok(Math.abs(geometry['.credit-load-main'].height-353.421875)<1,'Source empty content geometry '+JSON.stringify(geometry['.credit-load-main']));
  const styles=await page.evaluate(()=>{
    const style=selector=>getComputedStyle(document.querySelector(selector));
    return {brandBackground:style('.credit-load-brand').backgroundColor,brandWeight:style('.credit-load-brand>span').fontWeight,
      breadcrumbColor:style('.credit-load-breadcrumb>a').color,breadcrumbWeight:style('.credit-load-breadcrumb>a').fontWeight,
      subtitleColor:style('.credit-load-heading small').color,subtitleSize:style('.credit-load-heading small').fontSize,subtitleLineHeight:style('.credit-load-heading small').lineHeight,
      footerColor:style('.credit-load-footer').color,footerLineHeight:style('.credit-load-footer').lineHeight,
      menus:[...document.querySelectorAll('.credit-load-nav>button')].map(element=>{const s=getComputedStyle(element),r=element.getBoundingClientRect();return {x:r.x+parseFloat(s.borderLeftWidth),width:r.width-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth),fontSize:s.fontSize,lineHeight:s.lineHeight,padding:s.padding};})};
  });
  for(const key of ['brandBackground','brandWeight','breadcrumbColor','breadcrumbWeight','subtitleColor','subtitleSize','subtitleLineHeight','footerColor','footerLineHeight'])assert.equal(styles[key],sourceTypography[key],key);
  for(const [index,menu]of styles.menus.entries()){
    assert.ok(Math.abs(menu.width-sourceTypography.navAnchorWidths[index])<.5,'Source menu width '+JSON.stringify(menu));
    assert.equal(menu.fontSize,sourceTypography.navFontSize);assert.equal(menu.lineHeight,sourceTypography.navLineHeight);assert.equal(menu.padding,sourceTypography.navPadding);
  }
  assert.ok(Math.abs(styles.menus[0].x-sourceTypography.navFirstAnchorX1280)<.5,'Source menu start '+JSON.stringify(styles.menus));
  geometry.footer=await page.locator('.credit-load-footer').boundingBox();assert.equal(geometry.footer.x,202);assert.equal(geometry.footer.width,1066);assert.equal(geometry.footer.height,55);
  geometry.typography=styles;
  await check(page,'empty1280',true);await page.screenshot({path:directory+'/empty-1280.png',fullPage:true});
  await page.setViewportSize({width:1533,height:900});assert.equal((await page.locator('.credit-load-frame').boundingBox()).x,206.5);
  await check(page,'empty1533',true);await page.screenshot({path:directory+'/empty-1533.png',fullPage:true});
  await page.getByRole('button',{name:'選課資訊',exact:true}).click();
  assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['選課記錄查詢','我的課表','選課確認','棄選','即時教學反應']);
  assert.deepEqual(await page.getByRole('menuitem').evaluateAll(elements=>elements.map(element=>element.getAttribute('href'))),['/school-affairs/services/11-1','/school-affairs/services/11-2','/school-affairs/services/6-6','/school-affairs/services/6-4','/school-affairs/services/7-6']);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'抵免學分',exact:true}).click();
  assert.equal(await page.getByRole('menuitem',{name:'已抵免學分記錄查詢',exact:true}).getAttribute('href'),'https://infosys.stu.edu.tw/WebSelectCourse/StuCcredit/GetCreditTransfer');await page.keyboard.press('Escape');
  const raw={id:randomUUID(),user_id:affairsTestUser.id,academic_year:115,semester:1,category:'under',requested_credits:'0',process_text:null,result_text:null,source_mode:'local_demo',version:1,created_at:checkedAt,updated_at:checkedAt};
  snapshot.creditLoadHistory=mapCreditLoadHistory([raw,{...raw,id:randomUUID(),academic_year:114,semester:2,category:'over',requested_credits:'2.50',process_text:'<img src=x onerror="window.creditInjected=true">',result_text:'站內自訂結果'},
    {...raw,id:randomUUID(),user_id:'another-account',process_text:'OTHER ACCOUNT PRIVATE PROCESS',result_text:'OTHER ACCOUNT PRIVATE RESULT'}]);
  await page.reload();await page.getByRole('cell',{name:'站內自訂結果',exact:true}).waitFor();assert.equal(await page.locator('.credit-load-table-wrap tbody tr').count(),2);
  assert.deepEqual(await page.locator('.credit-load-table-wrap tbody tr').first().locator('td').allTextContents(),['115','1','減修','0','—','—']);
  assert.equal(await page.getByText('OTHER ACCOUNT PRIVATE PROCESS',{exact:true}).count(),0);assert.equal(await page.getByText('OTHER ACCOUNT PRIVATE RESULT',{exact:true}).count(),0);
  assert.equal(await page.locator('.credit-load-table-wrap img').count(),0);assert.equal(await page.evaluate(()=>window.creditInjected),undefined);
  await check(page,'records1533',true);await page.screenshot({path:directory+'/records-1533.png',fullPage:true});
  await page.setViewportSize({width:1280,height:720});await check(page,'records1280',true);await page.screenshot({path:directory+'/records-1280.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await check(page,'records390',true);await page.screenshot({path:directory+'/records-390.png',fullPage:true});
  await page.locator('.credit-load-table-wrap').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.credit-load-table-wrap').scrollLeft>0);
  snapshot.creditLoadHistory={records:[]};await page.reload();await page.getByText('Date/Time : 2026/11/12 18:00:00',{exact:true}).waitFor();await check(page,'empty390',true);await page.screenshot({path:directory+'/empty-390.png',fullPage:true});
  await page.getByRole('button',{name:'Index',exact:true}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Index','Logout']);await page.getByRole('menuitem',{name:'Logout',exact:true}).click();
  await page.waitForURL('**/school-affairs/signed-out');await page.waitForFunction(()=>localStorage.getItem('stu-school-affairs-auth')===null);assert.deepEqual(studentWrites,[]);await context.close();

  const owner={...affairsTestUser,id:randomUUID(),email:'luxart0317@gmail.com',user_metadata:{name:'QA manager'}};
  const adminContext=await browser.newContext({viewport:{width:1533,height:1000}});await mockAffairsAuth(adminContext,{user:owner});
  const otherId=randomUUID(),profiles=[{user_id:affairsTestUser.id,display_name:'Same Name',email:affairsTestUser.email,role:'student'},{user_id:otherId,display_name:'Same Name',email:'other@example.invalid',role:'student'}];
  const adminRows=[],operations=new Map(),writes=[];
  const adminSnapshot={...snapshot,profile:{userId:owner.id,email:owner.email,displayName:'QA manager',role:'admin'},admin:{profiles,students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[],creditLoadHistory:{records:[]}}};
  const sync=()=>{adminSnapshot.admin.creditLoadHistory=mapCreditLoadHistory(adminRows);};
  await adminContext.route('**/api/affairs-data*',route=>route.fulfill({json:adminSnapshot}));
  let loseFirstResponse=true,releaseFirst;const firstBlocked=new Promise(resolve=>{releaseFirst=resolve;});
  await adminContext.route('**/api/affairs-manage',async route=>{
    const action=route.request().postDataJSON(),value=action.payload;writes.push(action);assert.equal(action.kind,'save_credit_load_history');
    const previous=operations.get(value.request_id);
    if(previous){assert.deepEqual(previous.payload,value);return route.fulfill({json:previous.result});}
    const existing=adminRows.find(row=>row.id===value.id);
    if(Number(value.expected_version)!==(existing?.version||0))return route.fulfill({status:409,json:{error:'Synthetic concurrent version changed. Reload the current record.'}});
    const next={...value,academic_year:Number(value.academic_year),semester:Number(value.semester),requested_credits:Number(value.requested_credits),process_text:value.process_text||null,result_text:value.result_text||null,source_mode:'local_demo',version:(existing?.version||0)+1,created_at:existing?.created_at||checkedAt,updated_at:checkedAt};
    if(existing)Object.assign(existing,next);else adminRows.push(next);sync();
    const result={id:value.id,version:next.version,kind:action.kind,summary:'Synthetic credit-load history saved.'};operations.set(value.request_id,{payload:value,result});
    if(loseFirstResponse){loseFirstResponse=false;await firstBlocked;return route.fulfill({status:503,json:{error:'Synthetic response lost after save.'}});}
    return route.fulfill({json:result});
  });
  const managerPage=await adminContext.newPage();managerPage.on('pageerror',error=>errors.push(error.message));await managerPage.goto(base+'/school-affairs/records');await managerPage.getByRole('button',{name:'Open site admin',exact:true}).click();
  const manager=managerPage.locator('.credit-load-manager');await manager.waitFor();
  assert.deepEqual(await manager.locator('select[name=user_id] option').allTextContents(),['Choose an account','Same Name ('+affairsTestUser.email+')','Same Name (other@example.invalid)']);
  await manager.locator('select[name=user_id]').selectOption(affairsTestUser.id);await manager.getByLabel('Academic year · 申請學年',{exact:true}).fill('115');await manager.getByLabel('Semester · 申請學期',{exact:true}).fill('1');
  await manager.locator('select[name=category]').selectOption('over');await manager.getByLabel('Requested credits · 申請超修或減修學分數',{exact:true}).fill('2.5');await manager.getByLabel('Progress label · 申請進度',{exact:true}).fill('合成站內進度');await manager.getByLabel('Result label · 審核結果',{exact:true}).fill('合成站內註記');
  await manager.getByRole('button',{name:'Save credit-load history',exact:true}).click();await manager.getByRole('button',{name:'Saving credit-load history…',exact:true}).waitFor();assert.equal(await manager.getByLabel('Requested credits · 申請超修或減修學分數',{exact:true}).isDisabled(),true);
  releaseFirst();await managerPage.getByRole('alert').filter({hasText:'Synthetic response lost after save.'}).waitFor();await manager.getByRole('button',{name:'Save credit-load history',exact:true}).click();await manager.getByRole('status').filter({hasText:'Local credit-load history saved.'}).waitFor();
  assert.equal(writes.length,2);assert.equal(writes[0].payload.request_id,writes[1].payload.request_id);assert.equal(adminRows.length,1,'Retry replays receipt without a second row.');
  await manager.getByRole('button',{name:'Edit credit-load record',exact:true}).click();assert.equal(await manager.locator('select[name=user_id]').isDisabled(),true);assert.equal(await manager.getByLabel('Progress label · 申請進度',{exact:true}).inputValue(),'合成站內進度');
  await manager.getByLabel('Progress label · 申請進度',{exact:true}).fill('');await manager.getByLabel('Result label · 審核結果',{exact:true}).fill('');await manager.getByRole('button',{name:'Save credit-load history',exact:true}).click();await manager.getByRole('heading',{name:'Add local credit-load history',exact:true}).waitFor();
  assert.equal(adminRows[0].process_text,null);assert.equal(adminRows[0].result_text,null);assert.equal(adminRows[0].version,2);assert.equal(writes.at(-1).payload.user_id,affairsTestUser.id);
  await manager.getByRole('button',{name:'Edit credit-load record',exact:true}).click();adminRows[0].version=3;adminRows[0].result_text='另一位管理員的合成更新';sync();
  await manager.getByLabel('Result label · 審核結果',{exact:true}).fill('不能覆蓋的新文字');await manager.getByRole('button',{name:'Save credit-load history',exact:true}).click();await managerPage.getByRole('alert').filter({hasText:'Synthetic concurrent version changed.'}).waitFor();
  assert.equal(adminRows[0].result_text,'另一位管理員的合成更新');assert.equal(adminRows[0].version,3);
  await managerPage.reload();await managerPage.getByRole('button',{name:'Open site admin',exact:true}).click();await manager.getByRole('button',{name:'Edit credit-load record',exact:true}).click();
  assert.equal(await manager.getByLabel('Result label · 審核結果',{exact:true}).inputValue(),'另一位管理員的合成更新');
  await manager.getByLabel('Result label · 審核結果',{exact:true}).fill('重新載入後的站內註記');await manager.getByRole('button',{name:'Save credit-load history',exact:true}).click();await manager.getByRole('heading',{name:'Add local credit-load history',exact:true}).waitFor();assert.equal(adminRows[0].version,4);assert.equal(writes.at(-1).payload.expected_version,'3');
  assert.equal(await manager.locator('select[name=user_id]').isDisabled(),false);assert.equal(await manager.locator('select[name=user_id]').inputValue(),'');
  await managerPage.setViewportSize({width:390,height:844});await check(managerPage,'manager390');await manager.screenshot({path:directory+'/manager-390.png'});
  assert.deepEqual(errors,[]);await writeFile(directory+'/result.json',JSON.stringify({status:'passed',syntheticOnly:true,geometry,sourceTypography,sourceInheritedContrast:contrast,unexpectedSeriousAccessibilityIssues:0,readOnlyStudent:true,emptySourceLayout:true,ownerFilter:true,escapedLabels:true,noInventedApplyControls:true,managerPrefillClearRetryAndConflict:true,logout:true,externalUnclonedChild:'https://infosys.stu.edu.tw/WebSelectCourse/StuCcredit/GetCreditTransfer'},null,2)+'\n');
  console.log('Credit-load history UI passed: empty/source geometry, desktop/mobile records, account filtering, read errors, no application controls, source menus/logout, manager prefill/clear/idempotent retry/conflict recovery. Source contrast is reported; no new serious/critical axe issues.');
}finally{await browser.close();}
