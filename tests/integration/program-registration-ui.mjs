import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN ?? 'http://127.0.0.1:5184';
const root='/school-affairs/services/7-3';
assert.ok(['https://stu.best','http://127.0.0.1:5184'].includes(origin));
if(origin==='https://stu.best'){
  const manifest=await (await fetch(origin+'/release.json',{signal:AbortSignal.timeout(10000)})).json();
  assert.equal(manifest.revision,process.env.EXPECTED_RELEASE_REVISION);
}
const userId=affairsTestUser.id;
let records=[];
const writes=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[];
async function open(signedIn){
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await context.route(/^https?:\/\//,async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){
      errors.push(url.origin);
      return route.abort();
    }
    if(url.pathname==='/api/affairs-action'){
      const {kind,payload}=request.postDataJSON();
      assert.match(request.headers().authorization,/^Bearer /);
      assert.equal(kind,'change_program_registration');
      writes.push(payload);
      if(writes.length===1)return route.fulfill({status:503,json:{error:'Temporary failure'}});
      if(payload.operation==='register')records=[{user_id:userId,program_code:'PU002',academic_year:115,semester:1,
        withdrawn_year:null,withdrawn_semester:null,completed_year:null,completed_semester:null,version:1}];
      else records=[{...records[0],withdrawn_year:115,withdrawn_semester:1,version:2}];
      return route.fulfill({json:{userId,requestId:payload.request_id,programCode:'PU002',version:payload.expected_version+1}});
    }
    if(url.pathname==='/api/affairs-data' && url.searchParams.get('scope')==='program-registrations'){
      assert.match(request.headers().authorization,/^Bearer /);
      if(url.searchParams.get('answer')==='en')return route.fulfill({json:{
        status:'answered',answer:'Your stu.best account has 1 interdisciplinary program registration. PU002',
        citations:[],suggestedQuestions:[],grounding:{source:'account'},activity:[
          {kind:'program-registrations',status:'complete',label:'Checked interdisciplinary program registrations',detail:'PU002'},
        ],
      }});
      return route.fulfill({json:{userId,records}});
    }
    if(url.pathname==='/api/affairs-data' && url.searchParams.get('scope')==='interdisciplinary-programs')
      return route.fulfill({json:{programs:[{code:'PU002',name:'日語領隊導遊證照',department:'休觀系',partners:'應外系',year:'096',credits:'20',document_sha256:'a'.repeat(64)}]}});
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:schoolServiceReadFixture(url.href,'GET',affairsTestUser,origin)});
    return route.continue();
  });
  await mockAffairsAuth(context,{signedIn});
  await context.routeWebSocket('**/*',socket=>socket.close());
  return context.newPage();
}
try {
  const page=await open(true);
  await page.goto(origin+'/school-affairs/menu/aca/all');
  await page.locator('a[data-program-id="7-3"]').click();
  await page.waitForURL(origin+root);
  const register=page.getByRole('link',{name:'我還要登記其他學程'});
  await register.waitFor();
  const shell=await page.locator('.program-registration > main').boundingBox();
  assert.deepEqual([shell.x,shell.y,shell.width],[159,12,962]);
  assert.equal(await page.getByRole('columnheader').count(),10);
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}px`);
  }
  await register.click();
  await page.waitForURL(origin+root+'/register');
  await page.getByLabel('學分學程名稱').selectOption('PU002');
  await page.getByRole('button',{name:'登記',exact:true}).click();
  assert.equal(writes.length,0);
  await page.getByRole('button',{name:'確定',exact:true}).click();
  await page.getByRole('button',{name:'重試',exact:true}).click();
  await page.getByText('已儲存站內學程登記。').waitFor();
  assert.deepEqual(writes[0],writes[1]);
  await page.getByRole('link',{name:'返回登記紀錄'}).click();
  await page.getByRole('rowheader',{name:'PU002'}).waitFor();
  await page.reload();
  await page.getByRole('rowheader',{name:'PU002'}).waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('Which interdisciplinary programs have I registered for?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Your stu.best account has 1 interdisciplinary program registration. PU002').waitFor();
  await page.locator('summary').filter({hasText:'Activity'}).click();
  await page.getByText('Checked interdisciplinary program registrations').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('link',{name:'檢視',exact:true}).click();
  await page.waitForURL(origin+root+'/progress/PU002');
  await page.getByRole('button',{name:'放棄登記',exact:true}).click();
  await page.getByRole('button',{name:'確定',exact:true}).click();
  await page.getByText('已放棄站內學程登記。').waitFor();
  assert.equal(writes.length,3);
  assert.equal(writes[2].expected_version,1);
  const guest=await open(false);
  await guest.goto(origin+root+'/progress/PU002');
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),root+'/progress/PU002');
  await page.goto(origin+root+'/notes');
  await page.locator('.student-service').waitFor();
  assert.deepEqual(errors,[]);
  console.log('Program registration menu, geometry, confirmation, idempotent UI retry, reload, withdrawal, notes and guest return passed.');
} finally {await browser.close();}
