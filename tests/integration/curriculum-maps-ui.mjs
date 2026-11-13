import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {curriculumMapColleges} from '../../src/features/public/affairs/curriculumMaps.js';

const origin=process.env.PUBLIC_SITE_ORIGIN ?? 'http://127.0.0.1:5184';
const live=origin==='https://stu.best';
assert.ok(live || origin==='http://127.0.0.1:5184');
if(live) {
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision ?? '',/^[a-f0-9]{40}$/);
  const response=await fetch(origin+'/release.json',{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  assert.equal((await response.json()).revision,revision);
}
const root='/school-affairs/services/12-7';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const failures=[];
const selections=[];
let rejectLookup=false;

async function open(signedIn) {
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  context.on('page',page=>page.on('pageerror',error=>failures.push(error.message)));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin===origin && request.method()==='GET') {
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname==='/api/affairs-data' && url.searchParams.get('scope')==='curriculum-map') {
        const [program,year,track]=['program','year','track'].map(key=>url.searchParams.get(key));
        selections.push([program,year,track]);
        if (rejectLookup) return route.fulfill({status:502,json:{error:'fixture'}});
        if (live) return route.continue();
        return route.fulfill({json:{title:year+'學年度 · '+track.slice(1),tables:[],semesters:[
          {label:'一上',courses:[{title:year==='115'?'程式設計':'資料庫',category:'required'}]},
        ]}});
      }
      const data=schoolServiceReadFixture(url.href,'GET',affairsTestUser,origin);
      if (url.pathname==='/api/affairs-data'&&!url.search) data.serviceRecords=[{
        id:'map-note',serviceKey:'12-7',recordType:'note',title:'Synthetic map note',notes:'',
        status:'draft',startsOn:null,endsOn:null,updatedAt:'2026-11-13T08:00:00Z',reviewStatus:null,
      }];
      return route.fulfill({json:data});
    }
    failures.push(request.method()+' '+url.origin+url.pathname);
    return route.abort();
  });
  await mockAffairsAuth(context,{signedIn});
  await context.routeWebSocket('**/*',socket=>socket.close());
  return context.newPage();
}

try {
  const page=await open(true);
  await page.goto(origin+'/school-affairs/menu/aca/all');
  await page.locator('a[data-program-id="12-7"]').click();
  await page.waitForURL(origin+root);
  const list=page.getByRole('navigation',{name:'學院與系所'});
  await list.getByRole('link',{name:'資訊管理系',exact:true}).waitFor();
  assert.equal(await list.getByRole('link').count(),42);
  for(const program of curriculumMapColleges.flatMap(college=>college.entries)) {
    await list.getByRole('link',{name:program.label,exact:true}).click();
    await page.waitForURL(origin+root+'/program/'+program.id);
    const nav=page.getByRole('navigation',{name:'系所課程地圖'});
    await nav.getByRole('link',{name:'課程路徑',exact:true}).waitFor();
    assert.equal(await nav.getByRole('link',{name:'課程路徑',exact:true}).getAttribute('href'),root+'/program/'+program.id+'/courses');
    await nav.getByRole('link',{name:'回課程地圖首頁',exact:true}).click();
    await list.getByRole('link',{name:program.label,exact:true}).waitFor();
  }
  await list.getByRole('link',{name:'資訊管理系',exact:true}).click();
  await page.getByRole('link',{name:'就業導向',exact:true}).click();
  await page.getByRole('heading',{name:'就業導向',exact:true}).waitFor();
  assert.match(await page.getByRole('link',{name:'開啟校方就業導向'}).getAttribute('href'),/\/career\.asp\?/);
  await page.getByRole('link',{name:'能力指標',exact:true}).click();
  await page.getByRole('heading',{name:'能力指標',exact:true}).waitFor();
  assert.match(await page.getByRole('link',{name:'開啟校方能力指標'}).getAttribute('href'),/\/abtab\.asp\?/);
  await page.getByRole('link',{name:'課程路徑',exact:true}).click();
  const submit=page.getByRole('button',{name:'確定'});
  await submit.click();
  const flow=page.locator('.curriculum-map-flow');
  await flow.getByRole('caption').filter({hasText:/115學年度/}).waitFor({state:'attached'});
  assert.match(await flow.innerText(),/程式設計/);
  await page.getByLabel('瀏覽學年').selectOption('114');
  await page.getByLabel('學程名稱').selectOption({label:'智慧商務'});
  rejectLookup=true;
  await submit.click();
  await page.getByRole('alert').filter({hasText:'課程地圖暫時無法載入'}).waitFor();
  assert.equal(await flow.count(),0);
  rejectLookup=false;
  await submit.click();
  await flow.getByRole('caption').filter({hasText:/114學年度/}).waitFor({state:'attached'});
  assert.deepEqual(selections,[['1','115','L創新應用'],['1','114','N智慧商務'],['1','114','N智慧商務']]);
  for(const width of [1280,768,390,320]) {
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Map overflow at '+width);
  }
  await page.getByRole('link',{name:'回課程地圖首頁',exact:true}).click();
  await page.getByRole('link',{name:'個人備註'}).click();
  await page.getByText('Synthetic map note',{exact:true}).waitFor();
  const guest=await open(false);
  await guest.goto(origin+root+'/program/1/courses');
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),root+'/program/1/courses');
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({status:'passed',overviewCount:42,viewports:[1280,768,390,320],lookups:selections.length,realSource:live,notesPreserved:true,guestRedirect:true}));
} finally {
  await browser.close();
}
