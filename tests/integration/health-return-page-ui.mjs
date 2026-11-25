import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {healthExaminationPath as path,healthExaminationScope as scope} from '../../server/healthExaminationContract.js';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';

const origin=new URL(process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5298');
assert.ok(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)&&origin.pathname==='/'&&!origin.username&&!origin.password&&!origin.search&&!origin.hash);
const pageTwo=path+'?page=2', login='/school-affairs/login';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin.origin&&!new URL(route.request().url()).pathname.startsWith('/api/')
    ?route.continue():route.abort('blockedbyclient'));
  await mockAffairsAuth(context,{signedIn:false});
  const page=await context.newPage(),errors=[],reads=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/api/affairs-conversations'){
      assert.equal(request.method(),'GET');
      assert.match(request.headers().authorization??'',/^Bearer /u);
      return route.fulfill({json:{conversations:[]}});
    }
    assert.equal(url.pathname,'/api/affairs-data');
    assert.equal(request.method(),'GET');
    assert.match(request.headers().authorization??'',/^Bearer /u);
    assert.deepEqual([...url.searchParams.entries()].sort(),[['page','2'],['scope',scope]]);
    reads.push(url.search);
    const row={id:'36000000-0000-4000-8000-000000000001',examination_code:'QA health page 2',
      student_number:'QA student',student_name:'QA name',class_label:'QA class',report_available:false};
    return route.fulfill({json:{userId:user.id,total:26,rows:[row]}});
  });
  for(const localRoute of [path+'/?page=2',pageTwo]){
    await page.goto(new URL(localRoute,origin).href);
    await page.waitForURL(url=>url.pathname===login&&url.searchParams.get('next')===pageTwo);
  }
  // A putative deep link may contain only one in-range page, never a download
  // selector, owner override, fragment, external URL or mixed query.
  const bad=[path+'?page=2&page=1',path+'?page=0',path+'?page=202',path+'?page=02',
    path+'?page=2&report=foreign',path+'?page=-2',path+'?page=2#chart',path+'?page=2\n',
    path+'?page=2&next=https://outside.invalid','https://outside.invalid'+pageTwo];
  for(const next of bad){
    await page.goto(new URL(login+'?next='+encodeURIComponent(next),origin).href);
    await page.getByRole('button',{name:'Continue with Google'}).waitFor();
    const sanitized=await page.evaluate(async value=>{
      const {safeSchoolReturnPath}=await import('/src/features/public/affairs/authClient.ts');
      return safeSchoolReturnPath(value);
    },next);
    assert.equal(sanitized,'/school-affairs',next);
  }
  assert.equal(reads.length,0);
  await page.goto(new URL(login+'?next='+encodeURIComponent(pageTwo),origin).href);
  await page.route('**/auth/v1/authorize?**',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Mock Google authorization</h1>'}));
  await page.getByRole('button',{name:'Continue with Google'}).click();
  await page.getByRole('heading',{name:'Mock Google authorization'}).waitFor();
  await page.goto(new URL('/school-affairs/auth/callback?code=mock-page-two-code',origin).href);
  await page.waitForURL(url=>url.pathname===path&&url.search==='?page=2');
  await page.getByRole('table').getByText('QA health page 2',{exact:true}).waitFor();
  assert.ok(reads.length>=1);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'passed',directGuestVariants:2,invalidReturnPaths:bad.length,pageTwoAfterMockGoogleCallback:true,pageOneRead:false,liveOAuth:false}));
}finally{await browser.close();}
