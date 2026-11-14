import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {elearningPath as path,elearningScope} from '../../server/elearningContract.js';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:54632';
const revision=process.env.EXPECTED_RELEASE_REVISION;
async function checkRelease(){
  if(origin!=='https://stu.best')return;
  assert.match(revision??'',/^[0-9a-f]{40}$/);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,revision);
}
await checkRelease();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[],writes=[];
const course={id:9718,category_id:41,title:'111-1遠距教學研習_20220902',self_enroll:true,position:1};
let enrolled=null,failFirst=true;
async function fixture(signedIn){
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await mockAffairsAuth(context,{signedIn});
  await context.route('**/api/**',async route=>{
    try{
      const request=route.request(),url=new URL(request.url());
      if(url.searchParams.get('scope')===elearningScope){
        assert.equal(signedIn,true);
        assert.equal(request.method(),'GET');
        assert.match(request.headers().authorization??'',/^Bearer /u);
        return route.fulfill({json:{
          userId:user.id,categories:[{id:41,parent_id:null,title:'教務處',source_count:20,position:1}],
          courses:[course],notices:[{id:325504,kind:'page',title:'遠距教學轉入TronClass創課',local_body:'課程轉入 TronClass。',position:1}],
          enrollments:enrolled?[enrolled]:[],
        }});
      }
      if(signedIn&&url.pathname==='/api/affairs-action'&&request.method()==='POST'){
        const body=request.postDataJSON();
        assert.deepEqual(body,{kind:'elearning_join',payload:{course_id:9718}});
        writes.push(body.payload.course_id);
        enrolled??={courseId:9718,joinedAt:'2026-11-14T02:00:00.000Z'};
        if(failFirst){failFirst=false;return route.fulfill({status:503,json:{error:'Retry'}});}
        return route.fulfill({json:enrolled});
      }
      return route.fulfill({json:schoolServiceReadFixture(request.url(),request.method(),user,origin)});
    }catch(error){errors.push(error.message);return route.abort();}
  });
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror',cause=>errors.push(cause.message));
  return page;
}
try{
  const page=await fixture(true);
  await page.goto(origin+'/school-affairs/menu/menu/external');
  const link=page.locator('a[href="'+path+'"]').first();
  await link.click();
  await page.waitForURL(origin+path);
  const main=page.locator('#elearning-main');
  await main.getByRole('heading',{name:'系統公告'}).waitFor();
  const header=await page.locator('.elearning-header').boundingBox();
  assert.ok(Math.abs(header.x-38.4)<1&&header.y===25&&Math.abs(header.width-1203.2)<1&&header.height===88,JSON.stringify(header));
  const side=await page.getByRole('heading',{name:'重要消息',exact:true}).boundingBox();
  assert.ok(side.x>=57&&side.x<62);
  const month=page.locator('.elearning-month span');
  const original=await month.textContent();
  await page.getByRole('button',{name:'下個月'}).click();
  assert.notEqual(await month.textContent(),original);
  await page.getByRole('button',{name:'上個月'}).click();
  assert.equal(await month.textContent(),original);
  await main.getByRole('link',{name:'遠距教學轉入TronClass創課'}).click();
  await page.waitForURL(origin+path+'/notice/325504');
  await main.getByText('課程轉入 TronClass。').waitFor();
  await page.goto(origin+path);
  await main.getByRole('link',{name:'教務處'}).click();
  await page.waitForURL(origin+path+'/category/41');
  await main.getByLabel('搜尋課程:').fill('20220902');
  await main.getByRole('button',{name:'Go'}).click();
  await page.waitForURL(origin+path+'/search?q=20220902');
  await main.getByRole('link',{name:course.title}).click();
  await page.waitForURL(origin+path+'/course/9718');
  await page.getByRole('button',{name:'將我加入'}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.deepEqual(writes,[]);
  await page.getByRole('button',{name:'將我加入'}).click();
  await page.getByRole('button',{name:'確認',exact:true}).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  await page.getByRole('button',{name:'確認',exact:true}).click();
  await main.getByRole('status').filter({hasText:'已加入'}).waitFor();
  assert.deepEqual(writes,[9718,9718]);
  await page.reload();
  await main.getByRole('status').filter({hasText:'已加入'}).waitFor();
  await page.goto(origin+path+'/my-courses');
  await main.getByRole('link',{name:course.title}).waitFor();
  await page.goto(origin+'/school-affairs/services/4-2');
  await page.waitForURL(origin+path);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:800});
    for(const route of [path,path+'/course/9718',path+'/category/41']){
      await page.goto(origin+route);
      await main.getByRole('heading').first().waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' @ '+width);
    }
  }
  await page.goto(origin+'/school-sites/elearning.stu.edu.tw/course/index.php?categoryid=41');
  await page.waitForURL(origin+path+'/category/41');
  const guest=await fixture(false);
  await guest.goto(origin+path+'/course/9718');
  await guest.waitForURL(url=>url.pathname===path+'/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),path+'/course/9718');
  await guest.getByRole('button',{name:'Continue with Google'}).waitFor();
  assert.equal(await guest.locator('input[type=password]').count(),0);
  assert.deepEqual(errors,[]);
  await checkRelease();
  console.log('Remote-learning menu, layout, notice, search, enrollment retry, refresh, responsive widths and guest return verified.');
}catch(error){if(errors.length)console.error(errors);throw error;}
finally{await browser.close();}
