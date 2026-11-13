import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';
import {mapHousingRecords} from '../../server/housingRecords.js';

const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Synthetic browser fixtures are local only.');
const directory='artifacts/housing';
const now=new Date(),offset=delta=>new Date(now.getTime()+delta).toISOString();
const period={id:randomUUID(),term_label:'合成住宿申請 115-1',academic_year:115,semester:1,opens_at:offset(-3600000),closes_at:offset(3600000),published:true,instructions:'站內合成測試期間。',agreement_text:'我同意將本次合成住宿申請儲存於自己的 stu.best 帳號。',source_mode:'local_demo',version:1};
const upcoming={...period,id:randomUUID(),term_label:'合成尚未開放期間',academic_year:116,opens_at:offset(3600000),closes_at:offset(7200000)};
const closed={...period,id:randomUUID(),term_label:'合成已結束期間',academic_year:114,opens_at:offset(-7200000),closes_at:offset(-3600000)};
const beds=[{id:randomUUID(),user_id:affairsTestUser.id,period_id:period.id,bed_number:'DEMO-A',dormitory:'示範宿舍',bunk:'upper',accommodation_fee:1250.75,deposit:0,subsidy_amount:null,version:1},
  {id:randomUUID(),user_id:affairsTestUser.id,period_id:closed.id,bed_number:'DEMO-B',dormitory:'測試宿舍',bunk:null,accommodation_fee:null,deposit:null,subsidy_amount:0,version:1}];
const rawApplications=[];
const snapshot={checkedAt:now.toISOString(),officialUniversityData:false,
  profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'},student:null,
  courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
  scholarship:{periods:[],applications:[]},studentAid:{records:[]},housing:mapHousingRecords([period,upcoming,closed],rawApplications,beds)};
const writes=[],errors=[],geometry={};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function check(page,label) {
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(overflow.scroll<=overflow.width,label+' page overflow '+JSON.stringify(overflow));
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(result.violations.filter(row=>['serious','critical'].includes(row.impact)).map(row=>({id:row.id,nodes:row.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})),[],label+' accessibility');
}
try {
  await mkdir(directory,{recursive:true});
  const context=await browser.newContext({viewport:{width:1533,height:1000}});
  await mockAffairsAuth(context);
  await context.addInitScript(()=>{window.print=()=>{window.housingPrintCount=(window.housingPrintCount||0)+1;};});
  let failRead=true,failWrite=true,releaseWrite;
  const blockedWrite=new Promise(resolve=>{releaseWrite=resolve;});
  await context.route('**/api/affairs-data*',route=>failRead?route.fulfill({status:503,json:{error:'Synthetic housing read failure.'}}):route.fulfill({json:snapshot}));
  await context.route('**/api/affairs-action',async route=>{
    const action=route.request().postDataJSON();writes.push(action);
    assert.equal(action.kind,'submit_housing_application');
    assert.equal(action.payload.period_id,period.id);assert.equal(action.payload.period_version,'1');
    assert.equal(action.payload.accepted_agreement,'true');assert.equal(action.payload.expected_version,'0');
    assert.ok(!Object.keys(action.payload).some(key=>/identity|national|user_id/i.test(key)),'No national ID or caller override collected.');
    if(failWrite){failWrite=false;await blockedWrite;return route.fulfill({status:503,json:{error:'Synthetic housing save failure.'}});}
    const receipt={...action.payload,id:randomUUID(),user_id:affairsTestUser.id,receipt_number:'H-'+randomUUID().replaceAll('-','').toUpperCase(),agreement_version:1,agreement_text:period.agreement_text,submitted_at:now.toISOString(),version:1};
    rawApplications.push(receipt);snapshot.housing=mapHousingRecords([period,upcoming,closed],rawApplications,beds);
    return route.fulfill({json:{id:receipt.id,kind:action.kind,version:1,summary:'Synthetic local housing saved.'}});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/school-affairs/services/26-1');
  await page.getByRole('alert').filter({hasText:'Synthetic housing read failure.'}).waitFor();
  failRead=false;await page.getByRole('button',{name:'重新載入',exact:true}).click();
  await page.getByText('申請尚未開始。',{exact:true}).waitFor();await page.getByText('申請已截止。',{exact:true}).waitFor();
  geometry.applicationMain=await page.locator('.housing-main').boundingBox();
  assert.equal(geometry.applicationMain.x,166);assert.equal(geometry.applicationMain.y,128);
  await check(page,'application desktop');await page.screenshot({path:directory+'/application-1533.png',fullPage:true});
  await page.locator('.housing-period').filter({hasText:period.term_label}).getByRole('button',{name:'住宿申請(舊生)',exact:true}).click();
  await page.getByRole('heading',{name:'學生宿舍申請同意書',exact:true}).waitFor();
  await page.getByRole('button',{name:'不同意',exact:true}).click();assert.equal(writes.length,0);
  await page.locator('.housing-period').filter({hasText:period.term_label}).getByRole('button',{name:'住宿申請(舊生)',exact:true}).click();
  await page.getByRole('button',{name:'同意',exact:true}).click();
  const form=page.locator('.housing-application-form');
  assert.equal(await form.locator('input[name*="identity"],input[name*="national"]').count(),0);
  assert.equal(await form.getByLabel('姓名',{exact:true}).inputValue(),'QA Student');
  assert.equal(await form.getByLabel('學號',{exact:true}).inputValue(),'');
  await form.getByLabel('姓名',{exact:true}).fill('合成學生');await form.getByLabel('女',{exact:true}).check();
  await form.getByLabel('系別',{exact:true}).fill('示範學系');await form.getByLabel('學號',{exact:true}).fill('DEMO123');
  await form.getByLabel('出生年（民國）',{exact:true}).selectOption('2000');await form.getByLabel('出生月',{exact:true}).selectOption('2');await form.getByLabel('出生日',{exact:true}).selectOption('31');
  await form.getByLabel('戶籍地址',{exact:true}).fill('合成測試地址');await form.getByLabel('郵遞區號(戶籍地址)',{exact:true}).fill('824');
  await form.getByLabel('三、身體狀況或特殊疾病說明(250字以內)',{exact:true}).fill('合成健康備註，不是真人醫療資料');
  await form.getByRole('button',{name:'送出',exact:true}).click();await page.getByRole('alert').filter({hasText:'請選擇有效的出生日期。'}).waitFor();assert.equal(writes.length,0);
  await form.getByLabel('出生日',{exact:true}).selectOption('29');
  await check(page,'form desktop');await page.screenshot({path:directory+'/form-1533.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await check(page,'form mobile');await page.screenshot({path:directory+'/form-390.png',fullPage:true});
  await form.getByRole('button',{name:'送出',exact:true}).click();await page.locator('.housing-review').waitFor();assert.equal(writes.length,0,'Review is not submission.');
  await page.getByRole('button',{name:'回上一頁',exact:true}).click();assert.equal(await form.getByLabel('姓名',{exact:true}).inputValue(),'合成學生');
  await form.getByRole('button',{name:'送出',exact:true}).click();
  await page.getByRole('button',{name:'確認無誤，送出…',exact:true}).click();
  await page.getByRole('button',{name:'儲存中…',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'儲存中…',exact:true}).isDisabled(),true);
  releaseWrite();await page.getByRole('alert').filter({hasText:'Synthetic housing save failure.'}).waitFor();
  await page.getByRole('button',{name:'確認無誤，送出…',exact:true}).click();await page.locator('.housing-receipt-number').waitFor();
  assert.equal(writes.length,2);assert.equal(writes[0].payload.request_id,writes[1].payload.request_id,'Retry preserves receipt identity.');
  assert.equal(snapshot.housing.applications.length,1);assert.match(await page.locator('.housing-receipt-number').innerText(),/H-[A-F0-9]{32}/);
  await page.getByRole('button',{name:'列印(請務必列印存查)',exact:true}).click();assert.equal(await page.evaluate(()=>window.housingPrintCount),1);
  await check(page,'receipt mobile');await page.screenshot({path:directory+'/receipt-390.png',fullPage:true});
  await page.reload();await page.locator('.housing-period').filter({hasText:period.term_label}).getByRole('button',{name:'列印存查',exact:true}).click();
  await page.locator('.housing-receipt-number').waitFor();assert.equal(await page.getByRole('button',{name:/取消申請|撤銷申請/}).count(),0);
  await page.goto(base+'/school-affairs/services/34-1');await page.setViewportSize({width:1280,height:800});
  await page.getByRole('cell',{name:'DEMO-A',exact:true}).waitFor();
  assert.deepEqual(await page.locator('.housing-history-table th').allTextContents(),['學年','學期','床位編號','宿舍名稱','上下舖','住宿費','保證金','補助金額']);
  assert.deepEqual(await page.locator('.housing-history-table tbody tr').first().locator('td').allTextContents(),['115','1','DEMO-A','示範宿舍','上舖','1250.75','0','—']);
  for(const selector of ['.housing-history-shell','.housing-history header','.housing-history-table-wrap','.housing-history-table','.housing-history-table thead'])geometry[selector]=await page.locator(selector).boundingBox();
  const shell=geometry['.housing-history-shell'],table=geometry['.housing-history-table'];
  assert.ok(Math.abs(shell.x-159)<=1&&Math.abs(shell.width-962)<=1,'Source document geometry '+JSON.stringify(shell));
  assert.ok(Math.abs(table.x-237.8)<=1&&Math.abs(table.y-130)<=1&&Math.abs(table.width-804.4)<=1,'Source table geometry '+JSON.stringify(table));
  await check(page,'history desktop');await page.screenshot({path:directory+'/history-1280.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await check(page,'history mobile');await page.screenshot({path:directory+'/history-390.png',fullPage:true});
  await page.locator('.housing-history-table-wrap').focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('.housing-history-table-wrap').scrollLeft>0);
  assert.ok(await page.locator('.housing-history-table-wrap').evaluate(element=>element.scrollLeft>0),'History region supports keyboard horizontal scrolling.');
  await context.close();

  for(const scenario of ['changed-agreement','closed-period','lost-response']){
    const recoveryContext=await browser.newContext({viewport:{width:1280,height:800}});await mockAffairsAuth(recoveryContext);
    const recoverySnapshot={...snapshot,housing:mapHousingRecords([period],[],[])};const recoveryWrites=[];
    await recoveryContext.route('**/api/affairs-data*',route=>route.fulfill({json:recoverySnapshot}));
    await recoveryContext.route('**/api/affairs-action',async route=>{
      const action=route.request().postDataJSON();recoveryWrites.push(action);
      if(recoveryWrites.length===1&&scenario!=='lost-response'){
        const changed=recoverySnapshot.housing.periods[0];changed.version=2;
        if(scenario==='changed-agreement')changed.agreementText='更新的站內合成同意書。';else changed.closesAt=offset(-1000);
        return route.fulfill({status:409,json:{error:'Synthetic period changed.'}});
      }
      recoverySnapshot.housing.applications=mapHousingRecords([period],[{...action.payload,id:randomUUID(),user_id:affairsTestUser.id,receipt_number:'H-'+randomUUID().replaceAll('-','').toUpperCase(),agreement_version:Number(action.payload.period_version),agreement_text:recoverySnapshot.housing.periods[0].agreementText,submitted_at:now.toISOString(),version:1}],[]).applications;
      return scenario==='lost-response'?route.fulfill({status:503,json:{error:'Synthetic response lost after saving.'}}):route.fulfill({json:{id:recoverySnapshot.housing.applications[0].id,kind:action.kind,version:1}});
    });
    const recoveryPage=await recoveryContext.newPage();recoveryPage.on('pageerror',error=>errors.push(error.message));
    await recoveryPage.goto(base+'/school-affairs/services/26-1');await recoveryPage.locator('.housing-period').getByRole('button',{name:'住宿申請(舊生)',exact:true}).click();await recoveryPage.getByRole('button',{name:'同意',exact:true}).click();
    const recoveryForm=recoveryPage.locator('.housing-application-form');
    await recoveryForm.getByLabel('男',{exact:true}).check();await recoveryForm.getByLabel('系別',{exact:true}).fill('示範學系');await recoveryForm.getByLabel('學號',{exact:true}).fill('DEMO-RECOVERY');
    await recoveryForm.getByLabel('出生年（民國）',{exact:true}).selectOption('2000');await recoveryForm.getByLabel('出生月',{exact:true}).selectOption('1');await recoveryForm.getByLabel('出生日',{exact:true}).selectOption('1');
    await recoveryForm.getByLabel('戶籍地址',{exact:true}).fill('合成測試地址');await recoveryForm.getByLabel('郵遞區號(戶籍地址)',{exact:true}).fill('824');
    await recoveryForm.getByRole('button',{name:'送出',exact:true}).click();await recoveryPage.getByRole('button',{name:'確認無誤，送出…',exact:true}).click();
    if(scenario==='closed-period'){
      await recoveryPage.getByRole('alert').filter({hasText:'申請期間已結束或不再開放'}).waitFor();
      assert.equal(await recoveryPage.locator('.housing-review,.housing-application-form').count(),0);assert.equal(await recoveryPage.getByRole('button',{name:'確認無誤，送出…',exact:true}).count(),0);
    }else{
      if(scenario==='changed-agreement'){
        await recoveryPage.getByRole('alert').filter({hasText:'申請期間或同意書已更新'}).waitFor();await recoveryPage.getByText('更新的站內合成同意書。',{exact:true}).waitFor();
        await recoveryPage.getByRole('button',{name:'同意',exact:true}).click();assert.equal(await recoveryForm.getByLabel('學號',{exact:true}).inputValue(),'DEMO-RECOVERY');
        await recoveryForm.getByRole('button',{name:'送出',exact:true}).click();await recoveryPage.getByRole('button',{name:'確認無誤，送出…',exact:true}).click();
      }
      await recoveryPage.locator('.housing-receipt-number').waitFor();assert.equal(recoverySnapshot.housing.applications.length,1);
      if(scenario==='changed-agreement'){
        assert.equal(recoveryWrites[1].payload.period_version,'2');assert.notEqual(recoveryWrites[0].payload.request_id,recoveryWrites[1].payload.request_id);
      }else assert.equal(recoveryWrites.length,1,'Saved receipt recovers without another submission.');
    }
    await recoveryContext.close();
  }

  const owner={...affairsTestUser,id:randomUUID(),email:'luxart0317@gmail.com',user_metadata:{name:'QA manager'}};
  const adminContext=await browser.newContext({viewport:{width:1533,height:1000}});await mockAffairsAuth(adminContext,{user:owner});
  const adminSnapshot={...snapshot,profile:{userId:owner.id,email:owner.email,displayName:'QA manager',role:'admin'},housing:{periods:[],applications:[],assignments:[]},
    admin:{profiles:[{user_id:affairsTestUser.id,email:affairsTestUser.email,display_name:'QA Student',role:'student'}],students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[],scholarship:{periods:[],applications:[]},studentAid:{records:[]},housing:{periods:[],applications:[],assignments:[]}}};
  let failManage=true;const managerWrites=[],managerPeriods=[],managerBeds=[];
  await adminContext.route('**/api/affairs-data*',route=>route.fulfill({json:adminSnapshot}));
  await adminContext.route('**/api/affairs-manage',async route=>{
    const action=route.request().postDataJSON();managerWrites.push(action);
    if(failManage){failManage=false;return route.fulfill({status:503,json:{error:'Synthetic housing manager failure.'}});}
    const row=action.payload,target=action.kind==='save_housing_period'?managerPeriods:managerBeds;
    const index=target.findIndex(item=>item.id===row.id),existing=target[index];assert.equal(row.expected_version,String(existing?.version||0));
    const next={...row,academic_year:Number(row.academic_year),semester:Number(row.semester),published:row.published==='true',source_mode:'local_demo',bunk:row.bunk||null,
      accommodation_fee:row.accommodation_fee===''?null:Number(row.accommodation_fee),deposit:row.deposit===''?null:Number(row.deposit),subsidy_amount:row.subsidy_amount===''?null:Number(row.subsidy_amount),version:(existing?.version||0)+1};
    if(existing)target[index]=next;else target.push(next);
    adminSnapshot.admin.housing=mapHousingRecords(managerPeriods,[],managerBeds);
    return route.fulfill({json:{id:row.id,kind:action.kind,version:next.version,summary:'Synthetic manager housing record saved.'}});
  });
  const managerPage=await adminContext.newPage();managerPage.on('pageerror',error=>errors.push(error.message));
  await managerPage.goto(base+'/school-affairs/admin/records');await managerPage.getByRole('heading',{name:'School Affairs administration',exact:true}).waitFor();
  const manager=managerPage.locator('.housing-manager');await manager.waitFor();
  await manager.getByLabel('Housing term',{exact:true}).fill('Synthetic published period');await manager.getByLabel('Academic year · ROC',{exact:true}).fill('116');
  await manager.getByLabel('Housing opens · Taipei time',{exact:true}).fill('2027-01-02T00:00');await manager.getByLabel('Housing closes · Taipei time',{exact:true}).fill('2027-01-01T00:00');
  await manager.getByRole('button',{name:'Save housing period',exact:true}).click();await manager.getByRole('alert').filter({hasText:'Closing time must be after opening time.'}).waitFor();assert.equal(managerWrites.length,0);
  await manager.getByLabel('Housing closes · Taipei time',{exact:true}).fill('2027-02-01T00:00');await manager.getByLabel('Publish housing period',{exact:true}).check();
  await manager.getByRole('button',{name:'Save housing period',exact:true}).click();await managerPage.getByRole('alert').filter({hasText:'Synthetic housing manager failure.'}).waitFor();
  await manager.getByRole('button',{name:'Save housing period',exact:true}).click();await manager.getByText('Synthetic published period',{exact:true}).first().waitFor();
  assert.equal(managerWrites[0].payload.request_id,managerWrites[1].payload.request_id);
  await manager.locator('select[name="user_id"]').selectOption(affairsTestUser.id);await manager.locator('select[name="period_id"]').selectOption(managerPeriods[0].id);
  await manager.getByLabel('Bed number',{exact:true}).fill('TEST-BED');await manager.getByLabel('Dormitory name',{exact:true}).fill('Synthetic dorm');
  await manager.getByLabel('Housing subsidy · TWD',{exact:true}).fill('0');await manager.getByRole('button',{name:'Save bed record',exact:true}).click();
  await manager.getByRole('button',{name:'Edit bed record',exact:true}).waitFor();assert.equal(adminSnapshot.admin.housing.assignments[0].accommodationFee,null);assert.equal(adminSnapshot.admin.housing.assignments[0].subsidyAmount,0);
  await manager.getByRole('button',{name:'Edit bed record',exact:true}).click();assert.equal(await manager.locator('select[name="user_id"]').isDisabled(),true);assert.equal(await manager.locator('select[name="period_id"]').isDisabled(),true);
  await manager.getByLabel('Housing subsidy · TWD',{exact:true}).fill('250.5');await manager.getByRole('button',{name:'Save bed record',exact:true}).click();
  await manager.getByRole('heading',{name:'Add bed record',exact:true}).waitFor();assert.equal(adminSnapshot.admin.housing.assignments[0].version,2);assert.equal(adminSnapshot.admin.housing.assignments[0].subsidyAmount,250.5);
  await managerPage.setViewportSize({width:390,height:844});await check(managerPage,'manager mobile');await manager.screenshot({path:directory+'/manager-390.png'});
  assert.deepEqual(errors,[]);await writeFile(directory+'/result.json',JSON.stringify({status:'passed',syntheticOnly:true,geometry,formValidation:true,confirmationBeforeSubmission:true,stableRetry:true,changedAgreementAndClosedWindowRecovery:true,savedReceiptRecovery:true,receiptReprint:true,historyEightColumns:true,managerPeriodAndBedCRUD:true,unexpectedSeriousAccessibilityIssues:0},null,2)+'\n');
  console.log('Housing synthetic browser checks passed: period states, agreement, real date validation, review, stable retry, receipt/reprint, eight-column desktop/mobile history, manager publishing and nullable fee/subsidy edits; no page overflow or serious/critical axe issues.');
} finally {await browser.close();}
