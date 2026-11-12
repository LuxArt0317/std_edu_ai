import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { mockAffairsAuth, affairsTestUser } from './helpers/affairs-auth.mjs';

const base = process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5173';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local fixture only');
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
await mkdir('artifacts/dtm', {recursive:true});
const sample = {checkedAt:'2026-11-05T00:00:00Z',officialUniversityData:false,profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'},student:null,courses:[],charges:[],assignments:[{id:'assignment-qa',title:'Practice reflection',details:'Sample work',dueAt:'2026-11-18T15:59:00Z',status:'open',submittedAt:null,sourceMode:'sample',enrollmentId:null,dtmCourseId:'course-qa',course:'DTM-SAMPLE-101'}],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'sample',courses:[{id:'course-qa',code:'DTM-SAMPLE-101',title:'Digital Learning Orientation',term:'115學年度第1學期',role:'student',sourceMode:'sample',materials:[{id:'material-qa',title:'Getting started guide',kind:'file',summary:'Sample guide.',position:1,sourceMode:'sample'}]}],notices:[{id:'notice-qa',title:'Welcome to DTM',body:'Sample notice.',publishedAt:'2026-11-05T00:00:00Z',sourceMode:'sample'}]}};
try {
  const guest = await browser.newContext();
  await mockAffairsAuth(guest,{signedIn:false});
  const guestPage = await guest.newPage();
  const guestErrors=[];guestPage.on('pageerror',error=>guestErrors.push(error.message));
  await guestPage.goto(base+'/school-sites/dtm.stu.edu.tw/login/index.php');
  await guestPage.getByRole('button',{name:'Continue with Google'}).waitFor();
  assert.equal(await guestPage.getByText('Digital Learning Orientation').count(),0);
  assert.equal(await guestPage.locator('input[type=password]').count(),0);
  await guestPage.goto(base+'/dtm');
  await guestPage.getByRole('button',{name:'Continue with Google'}).waitFor();
  assert.equal(new URL(guestPage.url()).pathname,'/dtm/login');
  await guestPage.goto(base+'/');
  await guestPage.frameLocator('iframe.stu-account-status').getByRole('link',{name:'Sign in with Google'}).waitFor();
  assert.equal(await guestPage.frameLocator('iframe.stu-account-status').getByText('student.qa@gmail.com').count(),0);
  await guestPage.goto(base+'/dtm/login');
  await guestPage.route('**/api/affairs-data*',route=>route.fulfill({json:sample}));
  await guestPage.route('**/auth/v1/authorize?**',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Mock Google authorization</h1>'}));
  await guestPage.getByRole('button',{name:'Continue with Google'}).click();
  await guestPage.getByRole('heading',{name:'Mock Google authorization'}).waitFor();
  await guestPage.goto(base+'/dtm/login');
  assert.equal(await guestPage.evaluate(()=>sessionStorage.getItem('stu-school-affairs-return')),'/dtm');
  await guestPage.goto(base+'/school-affairs/auth/callback?code=dtm-qa-code');
  await guestPage.getByRole('heading',{name:'系統公告'}).waitFor();
  assert.equal(new URL(guestPage.url()).pathname,'/dtm');
  assert.deepEqual(guestErrors,[]);
  await guest.close();

  const signed = await browser.newContext();
  await mockAffairsAuth(signed);
  await signed.route('**/api/affairs-data*',route=>{
    assert.match(route.request().headers().authorization || '',/^Bearer /);
    return route.fulfill({json:sample});
  });
  const page = await signed.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for (const width of [1533,1440,768,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.goto(base+'/dtm/login');
    await page.getByRole('heading',{name:'系統公告'}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/dtm');
    assert.equal(await page.getByRole('heading',{name:'系統公告'}).count(),1);
    assert.equal(await page.locator('.dtm-notices a[href^="https://dtm.stu.edu.tw/"]').count(),14);
    assert.equal(await page.locator('.dtm-categories details').count(),20);
    assert.ok((await page.locator('.dtm-reference-note').innerText()).includes('2026-11-12'));
    if (width===1533) {
      for (const [selector,expected] of [['.dtm-left',[20,120,351]],['.dtm-center',[400,120,731]],['.dtm-right',[1169,120,345]]]) {
        const box=await page.locator(selector).boundingBox();
        assert.ok([box.x,box.y,box.width].every((value,index)=>Math.abs(value-expected[index])<=1),selector+' reference geometry');
      }
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`DTM overflow at ${width}`);
    if (width === 1440 || width === 390) await page.screenshot({path:`artifacts/dtm/dashboard-${width}.png`,fullPage:true});
    const axe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(axe.violations.filter(item=>['critical','serious'].includes(item.impact)).map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})),[]);
  }
  await page.locator('.dtm-categories details').first().locator('summary').click();
  await page.locator('.dtm-categories details').first().getByRole('link',{name:'Digital Learning Orientation'}).waitFor();
  await page.getByRole('searchbox',{name:'搜尋我的課程'}).fill('no matching course');
  await page.getByText('沒有符合的課程。').waitFor();
  await page.getByRole('searchbox',{name:'搜尋我的課程'}).fill('Digital');
  await page.getByRole('link',{name:'DTM-SAMPLE-101 · Digital Learning Orientation',exact:true}).click();
  await page.getByText('Getting started guide',{exact:true}).waitFor();
  await page.getByRole('link',{name:'作業',exact:true}).click();
  await page.getByText('Practice reflection',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/dtm/course/course-qa/assignments');
  await page.locator('.dtm-user').click();
  await page.getByRole('menuitem',{name:'校園助理',exact:true}).click();
  await page.getByRole('dialog',{name:/Assistant/}).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.matches('.dtm-user'));
  await page.goto(base+'/');
  await page.frameLocator('iframe.stu-account-status').getByText('Signed in: student.qa@gmail.com').waitFor();
  await page.screenshot({path:'artifacts/dtm/landing-status.png',fullPage:false});
  await page.goto(base+'/school-sites/dtm.stu.edu.tw/');
  await page.getByRole('heading',{name:'系統公告'}).waitFor();
  assert.deepEqual(errors,[]);
  await signed.close();
  console.log(JSON.stringify({status:'ok',guestRedirect:true,sharedGoogleSession:true,courseMaterials:true,landingStatus:true,alias:true,viewports:[1533,1440,768,390,320],seriousCriticalAccessibility:0}));
} finally {await browser.close();}
