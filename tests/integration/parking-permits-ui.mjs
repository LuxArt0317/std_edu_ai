import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN ?? 'http://127.0.0.1:5184';
const live=origin==='https://stu.best';
assert.ok(live || origin==='http://127.0.0.1:5184');
if(live) {
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision ?? '',/^[a-f0-9]{40}$/);
  const response=await fetch(origin+'/release.json',{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  const manifest=await response.json();
  assert.equal(manifest.revision,revision);
  assert.equal(manifest.environment,'production');
}
const root='/school-affairs/services/46-1';
const menu='/school-affairs/menu/swd/all';
const source='https://infosys-car.stu.edu.tw/';
const pdf=source+'carticketNotice.pdf';
const failures=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});

async function open(signedIn) {
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  context.on('page',page=>page.on('pageerror',error=>failures.push(error.message)));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (request.url()===pdf && request.method()==='GET') return route.fulfill({body:'Parking instruction fixture'});
    if(url.origin===origin && request.method()==='GET') {
      if(!url.pathname.startsWith('/api/')) return route.continue();
      const data=schoolServiceReadFixture(url.href,'GET',affairsTestUser,origin);
      if(url.pathname==='/api/affairs-data' && !url.search) data.serviceRecords=[{
        id:'parking-note',serviceKey:'46-1',recordType:'note',title:'Synthetic permit note',notes:'',
        status:'draft',startsOn:null,endsOn:null,updatedAt:'2026-11-13T08:00:00Z',reviewStatus:null,
      }];
      return route.fulfill({json:data});
    }
    failures.push(request.method()+' '+url.origin+url.pathname);
    await route.abort('blockedbyclient');
  });
  await mockAffairsAuth(context,{signedIn});
  await context.routeWebSocket('**/*',socket=>socket.close());
  return context.newPage();
}

try {
  const page=await open(true);
  await page.goto(origin+menu);
  const link=page.locator('a[data-program-id="46-1"]');
  assert.equal(await link.getAttribute('href'),root);
  await link.click();
  await page.waitForURL(origin+root);
  const apply=page.getByRole('link',{name:'進入車證申請'});
  assert.equal(await apply.getAttribute('href'),source);
  assert.equal(await apply.getAttribute('target'),'_blank');
  assert.equal(await page.locator('input[type=password]').count(),0);
  const cta=await apply.boundingBox();
  assert.ok(Math.abs(cta.x+cta.width/2-640)<=1);
  assert.equal(cta.y,70);
  assert.equal(cta.height,46);
  const pdfLoaded=page.waitForResponse(pdf);
  await page.getByRole('link',{name:'申請須知',exact:true}).click();
  await page.waitForURL(origin+root+'/instructions');
  assert.equal((await pdfLoaded).status(),200);
  await page.getByRole('heading',{name:'申請需知',exact:true}).waitFor();
  assert.deepEqual(await page.locator('iframe[title="車輛通行證申請須知 PDF"]').boundingBox(),{x:82,y:125,width:1024,height:700});
  assert.equal(await page.getByRole('link',{name:'開啟 PDF'}).getAttribute('href'),pdf);
  for(const width of [768,390,320]) {
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Instructions overflow at '+width);
    await page.getByRole('link',{name:'返回車證申請'}).click();
    await page.waitForURL(origin+root);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Entry overflows at '+width);
    await page.getByRole('link',{name:'申請須知',exact:true}).click();
    await page.waitForURL(origin+root+'/instructions');
  }
  await page.getByRole('link',{name:'返回車證申請'}).click();
  await page.getByRole('link',{name:'個人備註'}).click();
  await page.waitForURL(origin+root+'/notes');
  await page.getByText('Synthetic permit note',{exact:true}).waitFor();
  const guest=await open(false);
  for(const path of [root,root+'/instructions',root+'/notes']) {
    await guest.goto(origin+path);
    await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
    assert.equal(new URL(guest.url()).searchParams.get('next'),path);
  }
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({status:'passed',viewports:[1280,768,390,320],entry:root,instructions:root+'/instructions',notesPreserved:true,guestRoutes:3}));
} finally {
  await browser.close();
}
