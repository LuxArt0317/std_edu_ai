import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';

const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local synthetic browser fixtures only.');
const directory='artifacts/pending-fees',errors=[],contrast=[],geometry={};
const baseCharge={currency:'TWD',sourceMode:'sample',occurrenceOn:null,category:null,contactUnit:null,contactExtension:null,paymentUnit:null,dueOn:'2030-01-01'};
const ownCharges=[{...baseCharge,id:'partial',label:'合成住宿材料費 Synthetic residence supplies',amountDue:1250.75,amountPaid:250.5,occurrenceOn:'2026-11-10',category:'站內測試費用 Local test',contactUnit:'示範單位',contactExtension:'1234 / 5678',paymentUnit:'示範繳費單位'},
  {...baseCharge,id:'unknown',label:'<img src=x onerror="window.feeInjected=true">',amountDue:200,amountPaid:0},
  {...baseCharge,id:'settled',label:'SETTLED ROW SHOULD NOT APPEAR',amountDue:300,amountPaid:300},
  {...baseCharge,id:'zero',label:'ZERO ROW SHOULD NOT APPEAR',amountDue:0,amountPaid:0}];
const snapshot={checkedAt:'2026-11-12T13:00:00Z',officialUniversityData:false,profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'},student:null,
  courses:[],charges:ownCharges,assignments:[],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
  scholarship:{periods:[],applications:[]},studentAid:{records:[]},housing:{periods:[],applications:[],assignments:[]}};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function check(page,label){
  const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  assert.ok(size.document<=size.viewport,label+' overflow '+JSON.stringify(size));
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();const failures=[];
  for(const violation of axe.violations.filter(item=>['serious','critical'].includes(item.impact)))for(const node of violation.nodes){
    const inherited=violation.id==='color-contrast'&&node.target.length===1&&await page.locator(node.target[0]).evaluate(element=>{
      const style=getComputedStyle(element),brand=element.closest('.pending-fees-brand');
      const sourceRed=element.closest('.pending-fees-status,.pending-fees-notes li>span');
      return Boolean(brand&&style.color==='rgb(255, 255, 255)'&&getComputedStyle(brand).backgroundColor==='rgb(124, 124, 124)'
        ||sourceRed&&style.color==='rgb(255, 0, 0)'
        ||element.matches('.pending-fees-datetime')&&style.color==='rgb(145, 150, 159)');
    });
    const finding={page:label,id:violation.id,target:node.target,summary:node.failureSummary};
    if(inherited)contrast.push(finding);else failures.push(finding);
  }
  assert.deepEqual(failures,[],label+' unexpected accessibility issues');
}
try{
  await mkdir(directory,{recursive:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}});await mockAffairsAuth(context);
  let failRead=true;const writes=[];
  await context.route('**/api/affairs-data*',route=>failRead?route.fulfill({status:503,json:{error:'Synthetic pending fees read failure.'}}):route.fulfill({json:snapshot}));
  await context.route('**/api/affairs-action',route=>{writes.push(route.request().postData());return route.fulfill({status:500,json:{error:'Read-only view must not write.'}});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/school-affairs/services/39-1');
  await page.getByRole('alert').filter({hasText:'Synthetic pending fees read failure.'}).waitFor();
  await page.screenshot({path:directory+'/error-1280.png',fullPage:true});failRead=false;await page.getByRole('button',{name:'重新載入',exact:true}).click();
  await page.getByRole('cell',{name:'合成住宿材料費 Synthetic residence supplies',exact:true}).waitFor();
  const table=page.locator('.pending-fees-table-wrap table');assert.equal(await table.locator('tbody tr').count(),2);
  assert.deepEqual((await table.locator('th').allTextContents()).map(text=>text.replace(/\s+/g,'')),['發生日期Date','發生原因Details','類別Category','待繳金額Amount','連絡單位ContactUnit','連絡分機ContactExtension','繳費單位UnitinCharge','繳費狀態PaymentStatus']);
  assert.deepEqual(await table.locator('tbody tr').first().locator('td').allTextContents(),['2026/11/10','合成住宿材料費 Synthetic residence supplies','站內測試費用 Local test','1,000.25','示範單位','1234 / 5678','示範繳費單位','未繳Pending Payment']);
  assert.equal(await table.locator('tbody tr').nth(1).locator('td').first().innerText(),'—','Missing occurrence date must not fall back to due date.');
  assert.equal(await page.getByText('2030/01/01',{exact:true}).count(),0);assert.equal(await page.getByText('SETTLED ROW SHOULD NOT APPEAR',{exact:true}).count(),0);
  assert.equal(await table.locator('tbody a,tbody button,tbody input,tbody select').count(),0);assert.equal(await page.locator('.pending-fees-main form').count(),0);
  assert.equal(await table.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.feeInjected),undefined);
  for(const selector of ['.pending-fees-shell','.pending-fees-brand','.pending-fees-nav','.pending-fees-breadcrumb','.pending-fees-heading','.pending-fees-main h2','.pending-fees-table-wrap table','.pending-fees-table-wrap thead'])geometry[selector]=await page.locator(selector).boundingBox();
  const shell=geometry['.pending-fees-shell'],box=geometry['.pending-fees-table-wrap table'],header=geometry['.pending-fees-table-wrap thead'];
  assert.ok(Math.abs(shell.x-106.6667)<1&&Math.abs(shell.y-13)<1&&Math.abs(shell.width-1066.667)<1,'Source shell geometry '+JSON.stringify(shell));
  assert.ok(Math.abs(box.x-129.414)<1&&Math.abs(box.y-222.5)<1&&Math.abs(box.width-1027.664)<1,'Source table geometry '+JSON.stringify(box));
  assert.ok(Math.abs(header.height-75.09375)<1,'Source header height '+JSON.stringify(header));
  await page.screenshot({path:directory+'/records-1280.png',fullPage:true});await check(page,'populated desktop');
  await page.setViewportSize({width:1533,height:1000});await check(page,'populated wide desktop');await page.screenshot({path:directory+'/records-1533.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await check(page,'populated mobile');await page.screenshot({path:directory+'/records-390.png',fullPage:true});
  await page.locator('.pending-fees-table-wrap').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.pending-fees-table-wrap').scrollLeft>0);
  snapshot.charges=[ownCharges[2],ownCharges[3]];await page.reload();await page.getByRole('status').filter({hasText:'No pending payment records.'}).waitFor();
  assert.equal(await page.locator('.pending-fees-table-wrap tbody tr').count(),0);await check(page,'empty mobile');await page.screenshot({path:directory+'/empty-390.png',fullPage:true});
  await page.getByRole('button',{name:'待繳費用維護',exact:true}).click();await page.getByRole('menuitem',{name:'學生待繳費用查詢',exact:true}).click();
  await page.getByRole('button',{name:'Index',exact:true}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Index','Logout']);
  await page.getByRole('menuitem',{name:'Logout',exact:true}).click();await page.waitForURL('**/school-affairs/signed-out');await page.waitForFunction(()=>localStorage.getItem('stu-school-affairs-auth')===null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('stu-school-affairs-auth')),null);
  assert.deepEqual(writes,[]);await context.close();

  const mismatchContext=await browser.newContext({viewport:{width:390,height:844}});await mockAffairsAuth(mismatchContext);
  await mismatchContext.route('**/api/affairs-data*',route=>route.fulfill({json:{...snapshot,profile:{...snapshot.profile,userId:'other-private-account'},charges:[{...ownCharges[0],label:'OTHER ACCOUNT PRIVATE FEE'}]}}));
  const mismatch=await mismatchContext.newPage();mismatch.on('pageerror',error=>errors.push(error.message));await mismatch.goto(base+'/school-affairs/services/39-1');
  await mismatch.getByRole('alert').filter({hasText:'Your account changed.'}).waitFor();assert.equal(await mismatch.getByText('OTHER ACCOUNT PRIVATE FEE',{exact:true}).count(),0);
  assert.equal(await mismatch.locator('.pending-fees-table-wrap tbody tr').count(),0);await mismatchContext.close();

  const owner={...affairsTestUser,id:'40acc589-1bfc-4ee8-8bb6-6721c0671dd5',email:'luxart0317@gmail.com',user_metadata:{name:'QA manager'}};
  const adminContext=await browser.newContext({viewport:{width:1280,height:900}});await mockAffairsAuth(adminContext,{user:owner});
  const rawCharge={id:'admin-charge',student_id:'own-student',label:'Synthetic admin charge',amount_due:1000,amount_paid:0,due_on:'2030-01-01',occurrence_on:'2026-11-10',category:'Local category',contact_unit:'Local contact',contact_extension:'1234',payment_unit:'Local payment desk'};
  const adminSnapshot={...snapshot,profile:{userId:owner.id,email:owner.email,displayName:'QA manager',role:'admin'},charges:[],admin:{profiles:[],students:[{id:'own-student',user_id:affairsTestUser.id,student_number:'QA0001',full_name:'Synthetic student'}],sections:[],enrollments:[],dtmCourses:[],charges:[rawCharge],assignments:[],requests:[]}};
  const managerWrites=[];
  await adminContext.route('**/api/affairs-data*',route=>route.fulfill({json:adminSnapshot}));
  await adminContext.route('**/api/affairs-manage',route=>{const action=route.request().postDataJSON();managerWrites.push(action);Object.assign(rawCharge,action.payload);return route.fulfill({json:{id:rawCharge.id,kind:'save_charge',summary:'Synthetic charge metadata saved.'}});});
  const manager=await adminContext.newPage();manager.on('pageerror',error=>errors.push(error.message));await manager.goto(base+'/school-affairs/records');await manager.getByRole('button',{name:'Open site admin',exact:true}).click();
  const fees=manager.locator('.affairs-record-grid>section').filter({has:manager.getByRole('heading',{name:'Tuition and fees',exact:true})});
  await fees.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await fees.getByLabel('Occurrence date · 發生日期',{exact:true}).inputValue(),'2026-11-10');
  assert.equal(await fees.getByLabel('Due date',{exact:true}).inputValue(),'2030-01-01');
  await fees.getByLabel('Contact extension · 連絡分機',{exact:true}).fill('');await fees.getByLabel('Fee category · 類別',{exact:true}).fill('Updated local category');
  await fees.getByRole('button',{name:'Save charge',exact:true}).click();await manager.waitForFunction(()=>document.querySelector('input[name="occurrence_on"]')?.value==='');
  assert.equal(managerWrites.length,1);assert.equal(managerWrites[0].payload.occurrence_on,'2026-11-10');assert.equal(managerWrites[0].payload.due_on,'2030-01-01');assert.equal(managerWrites[0].payload.contact_extension,'');assert.equal(managerWrites[0].payload.payment_unit,'Local payment desk');
  await manager.waitForFunction(()=>document.querySelector('input[name="occurrence_on"]')?.value==='');
  await manager.setViewportSize({width:390,height:844});await check(manager,'manager mobile');await fees.screenshot({path:directory+'/manager-390.png'});
  assert.deepEqual(errors,[]);
  await writeFile(directory+'/result.json',JSON.stringify({status:'passed',syntheticOnly:true,geometry,sourceInheritedContrast:contrast,unexpectedSeriousAccessibilityIssues:0,pendingBalancesOnly:true,noPaymentActions:true,occurrenceDistinctFromDue:true,unknownMetadataNotInvented:true,errorRetry:true,accountMismatchRejected:true,metadataAdminEdit:true,logout:true},null,2)+'\n');
  console.log('Pending fees UI passed: source desktop geometry, responsive read-only pending rows, empty/error/retry, escaped labels, account mismatch, metadata edits and logout. Source brand, red text and timestamp contrast are documented; no new serious/critical axe issues.');
}finally{await browser.close();}
