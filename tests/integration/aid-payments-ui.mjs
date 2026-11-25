import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {aidPaymentsFields,aidPaymentsPaths,aidPaymentsScope} from '../../server/aidPaymentsContract.js';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:54635';
const release=process.env.EXPECTED_RELEASE_REVISION;
async function pin(){
  if(origin==='https://stu.best'){
    assert.match(release??'',/^[0-9a-f]{40}$/u);
    const result=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
    assert.equal((await result.json()).revision,release);
  }
}
await pin();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await mockAffairsAuth(context);
  const id='10000000-0000-4000-8000-000000000001';
  const claim={id,reason:'QA claim',amount:0,approval_result:null,approval_status:'QA only'};
  const salary={id,...Object.fromEntries(aidPaymentsFields.salary.map(([key])=>[key,null])),appointment_type:'QA appointment',bank_last4:'0012',net:500};
  const page2=aidPaymentsPaths.salary+'?page=2';
  const assistantRoutes=[];
  let claimsFailure=true;
  await context.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),view=url.searchParams.get('view');
    if(url.searchParams.get('scope')===aidPaymentsScope){
      assert.equal(request.method(),'GET');
      assert.match(request.headers().authorization??'',/^Bearer /u);
      const summary=url.searchParams.get('summary')==='1';
      if(claimsFailure&&view==='claims'){claimsFailure=false;return route.fulfill({status:503,json:{error:'Retry'}});}
      return route.fulfill({json:{userId:user.id,view,total:26,
        rows:summary?[]:view==='salary'?[{...salary,appointment_type:url.searchParams.get('page')==='2'?'QA final appointment':'QA appointment'}]
          :[{...claim,reason:url.searchParams.get('page')==='2'?'QA final claim':'QA claim'}]}});
    }
    if(url.pathname==='/api/affairs-assistant'){
      assert.equal(request.method(),'POST');
      const token=(request.headers().authorization??'').split(' ')[1];
      assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub,user.id);
      const input=request.postDataJSON();
      assistantRoutes.push(input.route);
      const navigation=input.question==='Where can I see my student salary?';
      const path=navigation?aidPaymentsPaths.salary:page2;
      if(!navigation)assert.match(input.question,/page|net pay/u);
      return route.fulfill({json:{status:'answered',answer:navigation?'[Open student salary records]('+path+')':'Your saved net pay on page 2 is 0 for the QA final appointment.',
        grounding:{source:'account',webSearched:false},verification:navigation?undefined:{status:'verified',attempts:1},
        citations:[{chunkId:'account:aidPayments',title:'Salary records',url:path,claim:'Salary records',sourceName:'School Affairs'}],
        suggestedQuestions:[]}});
    }
    if(url.pathname==='/api/affairs-conversations'){
      if(request.method()==='GET')return route.fulfill({json:{conversations:[]}});
      const {id,title,messages,version}=request.postDataJSON();
      return route.fulfill({json:{id,title,messages,version:version+1,updated_at:new Date().toISOString()}});
    }
    throw new Error('Unexpected QA call: '+url.pathname);
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+aidPaymentsPaths.claims);
  await page.getByRole('alert').getByRole('button',{name:'重試'}).click();
  const table=page.getByRole('table');
  await table.getByText('QA claim',{exact:true}).waitFor();
  assert.equal(await table.getByRole('columnheader').count(),4);
  assert.equal(await table.getByText('0',{exact:true}).count(),1);
  const bounds=await page.locator('.aid-payment-panel').boundingBox();
  assert.ok(Math.abs(bounds.x-218.6)<3&&Math.abs(bounds.y-111)<4,JSON.stringify(bounds));
  await page.getByRole('link',{name:'下一頁'}).click();
  await table.getByText('QA final claim',{exact:true}).waitFor();
  await page.getByRole('link',{name:'薪資查詢作業'}).click();
  await page.waitForURL(origin+aidPaymentsPaths.salary);
  await table.getByText('•••• 0012',{exact:true}).waitFor();
  assert.equal(await table.getByRole('columnheader').count(),17);
  assert.equal(await table.getByText('QA final claim').count(),0);
  await page.reload();
  await table.getByText('QA appointment').waitFor();
  if(process.env.AID_PAYMENTS_SCREENSHOT)await page.screenshot({path:process.env.AID_PAYMENTS_SCREENSHOT});
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('Where can I see my student salary?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const assistant=page.getByRole('dialog');
  await assistant.getByRole('link',{name:'Open student salary records',exact:true}).waitFor();
  assert.equal(await assistant.getByText(/0012|QA appointment/).count(),0);
  await page.keyboard.press('Escape');
  await page.getByRole('link',{name:'下一頁'}).click();
  await page.waitForURL(origin+page2);
  await table.getByText('QA final appointment').waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await assistant.getByPlaceholder('Ask a school question…').fill('What is the net pay on this page?');
  await assistant.getByRole('button',{name:'Send',exact:true}).click();
  await assistant.getByText(/saved net pay on page 2 is 0/).waitFor();
  assert.deepEqual(assistantRoutes,[aidPaymentsPaths.salary,page2]);
  assert.equal(await assistant.getByText(/0012/).count(),0);
  await page.keyboard.press('Escape');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:750});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await page.locator('.aid-payment-table').evaluate(node=>node.scrollWidth>node.clientWidth));
  }
  const guest=await browser.newContext({serviceWorkers:'block'});
  await mockAffairsAuth(guest,{signedIn:false});
  const login=await guest.newPage();
  await login.goto(origin+page2);
  await login.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(login.url()).searchParams.get('next'),page2);
  for(const query of ['page=202','page=2&page=1','page=2#extra']){
    await login.goto(origin+aidPaymentsPaths.salary+'?'+query);
    await login.waitForURL(url=>url.pathname==='/school-affairs/login');
    assert.equal(new URL(login.url()).searchParams.get('next'),aidPaymentsPaths.salary+(query.includes('#')?'#extra':''));
  }
  assert.deepEqual(errors,[]);
  await pin();
  console.log('Aid claim and salary layouts, pagination, masked bank data, verified assistant dispatch with the exact page and sign-in return passed.');
}finally{await browser.close();}
