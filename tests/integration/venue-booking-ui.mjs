import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {moveVenueDate,venuePaths,venueWeek} from '../../src/features/public/affairs/venueContract.js';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
const apiOrigin=process.env.VENUE_API_ORIGIN??origin;
if(origin==='https://stu.best'){
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[a-f0-9]{40}$/);
  const manifest=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await manifest.json()).revision,process.env.EXPECTED_RELEASE_REVISION);
}
const manager={...affairsTestUser,id:randomUUID(),email:'venue-manager@example.invalid'};
const row={id:randomUUID(),user_id:affairsTestUser.id,venue:'T0308',booking_date:'',period:'',purpose:'',status:'submitted',review_note:'',version:1};
const errors=[],writes=[];
let exists=false;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function open(user,width){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width,height:900}});
  if(user)await mockAffairsAuth(context,{user});
  else await context.route('**/auth/v1/**',route=>route.fulfill({json:{}}));
  await context.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),scope=url.searchParams.get('scope');
    try{
      if(scope==='venue-search'||scope==='venue-schedule'){
        assert.equal(req.headers().authorization,undefined);
        const response=await fetch(apiOrigin+url.pathname+url.search,{signal:AbortSignal.timeout(25000)});
        return route.fulfill({status:response.status,json:await response.json()});
      }
      if(scope==='venue-requests'){
        assert.match(req.headers().authorization??'',/^Bearer /);
        const isManager=url.searchParams.get('view')==='manage';
        if(isManager&&user!==manager)return route.fulfill({status:403,json:{error:'Denied'}});
        return route.fulfill({json:{userId:user.id,rows:exists&&(!isManager||row.status==='submitted')?[row]:[]}});
      }
      if(url.pathname==='/api/affairs-action'||url.pathname==='/api/affairs-manage'){
        const action=req.postDataJSON();writes.push(action);
        if(action.kind==='submit_venue_request'){
          assert.equal(user,affairsTestUser);assert.equal(action.payload.confirmed,true);
          Object.assign(row,{booking_date:action.payload.booking_date,period:action.payload.period,purpose:action.payload.purpose});
          exists=true;
          if(writes.length===1)return route.fulfill({status:503,json:{error:'Retry requested'}});
          assert.deepEqual(writes[0],action);
        }else{
          assert.equal(action.payload.id,row.id);assert.equal(action.payload.version,row.version);
          if(action.kind==='review_venue_request'){assert.equal(user,manager);row.status=action.payload.status;row.review_note=action.payload.note;}
          else{assert.equal(action.kind,'cancel_venue_request');assert.equal(user,affairsTestUser);row.status='cancelled';}
          row.version++;
        }
        return route.fulfill({json:{id:row.id,version:row.version,status:row.status}});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,req.method(),user??affairsTestUser,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  return page;
}
try{
  await mkdir('artifacts/venue-booking',{recursive:true});
  const student=await open(affairsTestUser,1440);
  await student.goto(origin+'/school-affairs/menu/swd/input');
  await student.locator('a[href="'+venuePaths.apply+'"]').click();
  await student.waitForURL(origin+venuePaths.apply);
  await student.getByLabel('場地：').fill('T0308');
  await student.getByRole('button',{name:/^T0308 /}).click();
  await student.getByRole('region',{name:'每週場地時段'}).getByText('場地: T0308',{exact:false}).waitFor();
  await student.getByRole('button',{name:'下週',exact:true}).click();
  const schedule=student.getByRole('region',{name:'每週場地時段'});
  await schedule.getByRole('button',{name:/申請$/}).first().click();
  const dialog=student.getByRole('dialog');
  await dialog.waitFor();
  await student.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(writes.length,0);
  await schedule.getByRole('button',{name:/申請$/}).first().click();
  await dialog.getByLabel('用途').fill('Venue UI verification');
  assert.equal(await dialog.getByRole('button',{name:'送出申請'}).isEnabled(),false);
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button',{name:'送出申請'}).click();
  await dialog.getByRole('alert').waitFor();
  await dialog.getByRole('button',{name:'送出申請'}).click();
  await student.getByText('已送出',{exact:true}).waitFor();
  const admin=await open(manager,1440);
  await admin.goto(origin+venuePaths.manage);
  await admin.getByRole('button',{name:'核准',exact:true}).click();
  await admin.getByRole('dialog').getByLabel('審核備註').fill('Reviewed');
  await admin.getByRole('button',{name:'確認核准'}).click();
  await admin.getByText('沒有待審核申請。').waitFor();
  await student.reload();
  await student.getByText('已核准',{exact:true}).waitFor();
  await student.getByRole('button',{name:'取消申請'}).click();
  await student.getByRole('button',{name:'確認取消'}).click();
  await student.getByText('已取消',{exact:true}).waitFor();
  const week=venueWeek(),url=origin+venuePaths.schedule+'?'+new URLSearchParams({code:'T0308',week});
  const desktop=await open(affairsTestUser,1440);
  await desktop.goto(url);
  await desktop.getByText('場地: T0308',{exact:false}).waitFor();
  const layout=await desktop.locator('.venue-workspace').boundingBox();
  assert.equal(layout.x,239);assert.equal(layout.width,962);
  await desktop.screenshot({path:'artifacts/venue-booking/schedule-1440.png'});
  const phone=await open(affairsTestUser,390);
  await phone.goto(url);
  await phone.getByText('場地: T0308',{exact:false}).waitFor();
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.equal(await phone.locator('.venue-query tbody td').count(),105);
  await phone.screenshot({path:'artifacts/venue-booking/schedule-390.png'});
  const guest=await open(null,390);await guest.goto(url);
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),new URL(url).pathname+new URL(url).search);
  const denied=await open(affairsTestUser,390);
  await denied.goto(origin+venuePaths.manage);await denied.getByRole('alert').getByText('Denied').waitFor();
  assert.equal(moveVenueDate(week,7)<=row.booking_date,true);
  assert.deepEqual(errors,[]);
  console.log('Venue browser passed: real schedules, menu navigation, protected return, mobile, confirmed submission/retry, review and cancellation.');
}finally{await browser.close();}
