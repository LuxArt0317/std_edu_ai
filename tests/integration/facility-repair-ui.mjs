import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {repairPaths} from '../../src/features/public/affairs/facilityRepair.js';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
if(origin==='https://stu.best'){
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[a-f0-9]{40}$/);
  const manifest=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await manifest.json()).revision,process.env.EXPECTED_RELEASE_REVISION);
}
const manager={...affairsTestUser,id:randomUUID(),email:'repair-manager@example.invalid'};
const date=new Date().toISOString();
const row={id:randomUUID(),user_id:affairsTestUser.id,created_at:date,updated_at:date,status:'submitted',version:1};
const errors=[],writes=[],events=[];
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function open(user,width){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width,height:900}});
  if(user)await mockAffairsAuth(context,{user});
  else await context.route('**/auth/v1/**',route=>route.fulfill({json:{}}));
  await context.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    try{
      if(url.searchParams.get('scope')==='facility-repairs'){
        assert.match(req.headers().authorization??'',/^Bearer /);
        if(url.searchParams.get('view')==='catalog')return route.fulfill({json:schoolServiceReadFixture(url.href,req.method(),user,origin)});
        if(url.searchParams.get('view')==='manage'&&user!==manager)return route.fulfill({status:403,json:{error:'Denied'}});
        if(url.searchParams.has('answer')){
          assert.equal(user,affairsTestUser);
          assert.equal(url.searchParams.get('id'),row.id);
          assert.equal(url.searchParams.get('view'),'mine');
          return route.fulfill({json:{status:'answered',answer:'Your repair is resolved.',grounding:{source:'account',webSearched:false},
            citations:[],suggestedQuestions:[],activity:[{kind:'facility-repairs',label:'Checked your repair reports',detail:'Resolved',status:'complete'}]}});
        }
        if(url.searchParams.has('id'))return route.fulfill({json:{userId:user.id,detail:row,events}});
        const status=url.searchParams.get('status');
        const rows=events.length&&(!status||status===row.status)?[row]:[];
        return route.fulfill({json:{userId:user.id,rows,total:rows.length,page:Number(url.searchParams.get('page')),pageSize:25}});
      }
      if(url.pathname==='/api/affairs-conversations'&&req.method()==='POST'){
        const {id,title,messages}=req.postDataJSON();
        assert.equal(user,affairsTestUser);
        assert.ok(messages.some(message=>message.activity?.some(step=>step.kind==='facility-repairs'&&step.status==='complete')));
        return route.fulfill({json:{id,title,messages,version:1,updated_at:date}});
      }
      if(url.pathname==='/api/affairs-action'||url.pathname==='/api/affairs-manage'){
        const action=req.postDataJSON();writes.push(action);
        if(action.kind==='submit_facility_repair'){
          assert.equal(user,affairsTestUser);assert.equal(action.payload.confirmed,true);
          assert.equal(action.payload.area_code,'AR0500');
          assert.equal(action.payload.equipment_code,'RI2004');
          Object.assign(row,{...action.payload,building:'管理大樓',location:action.payload.room,item:'日光燈'});
          if(writes.length===1){
            events.push({version:1,status:'submitted',note:'',occurred_at:date});
            return route.fulfill({status:503,json:{error:'Retry requested'}});
          }
          assert.deepEqual(writes[0],action);
        }else{
          assert.equal(action.kind,'review_facility_repair');
          assert.equal(user,manager);
          assert.equal(action.payload.id,row.id);assert.equal(action.payload.version,row.version);
          row.status=action.payload.status;row.version++;
          events.push({version:row.version,status:row.status,note:action.payload.note,occurred_at:date});
        }
        return route.fulfill({json:{id:row.id,version:row.version,status:row.status}});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,req.method(),user??affairsTestUser,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  return page;
}
try{
  await mkdir('artifacts/facility-repair',{recursive:true});
  const student=await open(affairsTestUser,1440);
  await student.goto(origin+'/school-affairs/menu/swd/input');
  await student.locator('a[href="'+repairPaths.report+'"]').click();
  await student.waitForURL(origin+repairPaths.report);
  await student.getByRole('link',{name:'管理大樓'}).waitFor();
  await student.screenshot({path:'artifacts/facility-repair/areas-1440.png'});
  const areaLayout=await student.locator('.facility-repair').boundingBox();
  assert.equal(areaLayout.width,1060);
  await student.getByRole('link',{name:'管理大樓'}).click();
  await student.waitForURL(origin+repairPaths.report+'/area/AR0500');
  await student.waitForFunction(()=>[...document.querySelectorAll('.repair-form input[readonly]')].some(input=>input.value==='QA Student'));
  await student.getByLabel('申請人電話').fill('0221');
  await student.getByLabel('請修房間').fill('QA room');
  await student.getByLabel('請修樓層').selectOption('2樓');
  await student.getByRole('button',{name:'選擇',exact:true}).click();
  await student.getByLabel('關鍵字').fill('RI2004');
  await student.getByRole('dialog').screenshot({path:'artifacts/facility-repair/equipment-picker.png'});
  await student.getByRole('button',{name:'選取 日光燈'}).click();
  await student.getByRole('dialog').waitFor({state:'hidden'});
  await student.getByLabel('損壞情形').fill('Private detail');
  await student.screenshot({path:'artifacts/facility-repair/report-1440.png'});
  const dialog=student.getByRole('dialog');
  await student.getByRole('button',{name:'送出',exact:true}).click();
  await dialog.waitFor();
  await student.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(writes.length,0);
  await student.getByRole('button',{name:'送出',exact:true}).click();
  await dialog.getByRole('button',{name:'送出報修'}).click();
  await dialog.getByRole('alert').getByText('Retry requested').waitFor();
  await dialog.getByRole('button',{name:'返回'}).click();
  await student.getByRole('button',{name:'送出',exact:true}).click();
  await dialog.getByRole('button',{name:'送出報修'}).click();
  const detail=repairPaths.history+'/'+row.id;
  await student.waitForURL(origin+detail);
  await student.getByText('Private detail',{exact:true}).waitFor();
  const admin=await open(manager,1440);
  await admin.goto(origin+repairPaths.manage);
  await admin.getByLabel('狀態').selectOption('submitted');
  await admin.getByRole('link',{name:row.id.slice(0,8).toUpperCase()}).click();
  await admin.getByRole('button',{name:'開始處理'}).click();
  await admin.getByLabel('處理備註').fill('Technician assigned');
  await admin.getByRole('dialog').getByRole('button',{name:'確認變更'}).click();
  await admin.getByRole('button',{name:'完成報修'}).click();
  await admin.getByRole('dialog').getByRole('button',{name:'確認變更'}).click();
  await admin.getByRole('button',{name:'重新處理'}).waitFor();
  await student.reload();
  await student.getByText('Technician assigned',{exact:true}).waitFor();
  await student.getByText('已完成',{exact:false}).first().waitFor();
  assert.equal(await student.getByRole('button',{name:'取消報修'}).count(),0);
  await student.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await student.getByPlaceholder('Ask a school question…').fill('What is the status?');
  await student.getByRole('button',{name:'Send',exact:true}).click();
  await student.getByText('Your repair is resolved.',{exact:true}).waitFor();
  await student.locator('details summary').filter({hasText:'Activity'}).last().click();
  await student.getByText('Checked your repair reports',{exact:true}).waitFor();
  await student.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
  await student.reload();
  await student.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await student.getByText('Your repair is resolved.',{exact:true}).waitFor();
  await student.locator('details summary').filter({hasText:'Activity'}).last().click();
  await student.getByText('Checked your repair reports',{exact:true}).waitFor();
  await student.keyboard.press('Escape');
  const phone=await open(affairsTestUser,390);
  await phone.goto(origin+repairPaths.history);
  await phone.getByText('管理大樓',{exact:false}).waitFor();
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth),390);
  const a11y=await new AxeBuilder({page:phone}).include('.facility-repair').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(a11y.violations.map(item=>[item.id,item.nodes.map(node=>node.target)]),[]);
  await phone.screenshot({path:'artifacts/facility-repair/history-390.png'});
  const guest=await open(null,390);await guest.goto(origin+detail);
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),detail);
  const denied=await open(affairsTestUser,390);await denied.goto(origin+repairPaths.manage);
  await denied.getByRole('alert').getByText('Denied').waitFor();
  assert.deepEqual(errors,[]);
  console.log('Facility repair browser passed: distinct menu destination, confirmation, Escape, retry, private history, admin transitions and mobile.');
}finally{await browser.close();}
