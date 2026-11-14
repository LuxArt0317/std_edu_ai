import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {permanentCoursesPath as path} from '../../src/features/public/affairs/permanentCourseRouting.js';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
const apiOrigin=process.env.PERMANENT_COURSE_API_ORIGIN??origin;
if(origin==='https://stu.best'){
  const revision=process.env.EXPECTED_RELEASE_REVISION??'';
  assert.match(revision,/^[a-f0-9]{40}$/);
  assert.equal((await (await fetch(origin+'/release.json',{cache:'no-store'})).json()).revision,revision);
}
const output='artifacts/permanent-courses';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[];
const reads=[];
async function contextFor(width,signedIn){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width,height:900}});
  if(signedIn) await mockAffairsAuth(context,{user:affairsTestUser});
  else await context.route('**/auth/v1/**',route=>route.fulfill({json:{}}));
  await context.route('**/api/**',async route=>{
    try{
      const request=route.request(),url=new URL(request.url());
      if(url.searchParams.get('scope')==='permanent-courses'){
        assert.equal(request.method(),'GET');
        assert.equal(request.headers().authorization,undefined);
        reads.push(Object.fromEntries(url.searchParams));
        const response=await fetch(apiOrigin+url.pathname+url.search,{signal:AbortSignal.timeout(25000)});
        return route.fulfill({status:response.status,json:await response.json()});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,request.method(),affairsTestUser,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  return page;
}
try {
  const page=await contextFor(1440,true);
  await page.goto(origin+'/school-affairs/menu/aca/query');
  await page.locator(`a[href="${path}"]`).click();
  await page.waitForURL(origin+path);
  const catalog=page.locator('.permanent-course-catalog');
  await catalog.getByRole('button',{name:'AAJ00101',exact:true}).waitFor();
  assert.equal(await catalog.locator('tbody tr').count(),51);
  const bounds=await catalog.boundingBox();
  assert.equal(bounds.x,160);
  assert.equal(bounds.width,1120);
  await page.screenshot({path:output+'/catalog-1440.png'});
  await catalog.getByRole('button',{name:'查詢條件輸入'}).click();
  assert.equal(await catalog.locator('form').isVisible(),false);
  await catalog.getByRole('button',{name:'查詢條件輸入'}).click();
  await catalog.getByRole('button',{name:'AAJ00101',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByText('Introduction to Computer',{exact:true}).waitFor();
  const descriptionBounds=await dialog.boundingBox();
  assert.equal(descriptionBounds.x,270);
  assert.equal(descriptionBounds.y,30);
  assert.equal(await dialog.getByRole('button',{name:'列印'}).isEnabled(),true);
  await page.screenshot({path:output+'/description-1440.png'});
  await page.evaluate(()=>{window.print=()=>{document.body.dataset.testPrinted='true';};});
  await dialog.getByRole('button',{name:'列印'}).click();
  assert.equal(await page.locator('body').getAttribute('data-test-printed'),'true');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.textContent==='AAJ00101');
  await catalog.locator('select[name=kind]').selectOption('IM');
  await catalog.locator('select[name=division]').selectOption('U');
  await catalog.getByRole('button',{name:'查詢',exact:true}).click();
  await catalog.getByRole('button',{name:'IMU00101',exact:true}).waitFor();
  const next=catalog.getByRole('button',{name:'下一頁'});
  await next.click();
  await page.waitForURL(url=>url.searchParams.get('page')==='1');
  await page.waitForFunction(()=>document.querySelector('.permanent-course-catalog tbody tr td')?.textContent==='51');
  await catalog.locator('input[name=keyword]').fill('IMU00101');
  await catalog.getByRole('button',{name:'查詢',exact:true}).click();
  await catalog.getByRole('button',{name:'IMU00101',exact:true}).waitFor();
  assert.equal(await catalog.locator('tbody tr').count(),2);
  const mobile=await contextFor(390,true);
  await mobile.goto(origin+path+'?kind=IM&division=U&keyword=IMU00101&course=AAJ00101');
  await mobile.getByRole('dialog').getByText('Introduction to Computer',{exact:true}).waitFor();
  const mobileDialog=await mobile.getByRole('dialog').boundingBox();
  assert.ok(mobileDialog.x>=0 && mobileDialog.x+mobileDialog.width<=390);
  await mobile.keyboard.press('Escape');
  await mobile.locator('.permanent-course-catalog').getByRole('button',{name:'IMU00101',exact:true}).waitFor();
  assert.equal(await mobile.locator('select[name=kind]').inputValue(),'IM');
  assert.equal(await mobile.locator('select[name=division]').inputValue(),'U');
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
  await mobile.screenshot({path:output+'/catalog-390.png'});
  const guest=await contextFor(1440,false);
  await guest.goto(origin+path+'?course=AAJ00101');
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),path+'?course=AAJ00101');
  const signedInReturn=await contextFor(1440,true);
  await signedInReturn.goto(guest.url());
  await signedInReturn.waitForURL(origin+path+'?course=AAJ00101');
  await signedInReturn.getByRole('dialog').getByText('Introduction to Computer',{exact:true}).waitFor();
  await signedInReturn.goto(origin+'/school-affairs/login?next='+encodeURIComponent(path+'?course=AAJ00101&next=https://example.invalid'));
  await signedInReturn.waitForURL(origin+'/school-affairs');
  assert.equal(reads.filter(read=>read.code==='AAJ00101').length,3);
  assert.deepEqual(errors,[]);
  console.log('Permanent courses browser passed with actual catalog API, search, pagination, detail, print, keyboard, mobile, and sign-in return.');
}finally{await browser.close();}
