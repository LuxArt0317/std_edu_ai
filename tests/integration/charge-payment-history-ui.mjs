import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';

const base=new URL(process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5309');
assert.ok(['localhost','127.0.0.1'].includes(base.hostname),'Local synthetic browser fixtures only.');
const pending='/school-affairs/services/39-1',history=pending+'/payment-history';
const id=index=>'84000000-0000-4000-8000-'+String(index).padStart(12,'0');
const historyUrl=(query='')=>new URL(history+query,base).href;
const rowBase={chargeId:id(1000),chargeLabel:'學雜費 Synthetic tuition',chargeCategory:'學雜費',amount:'2000.25',currency:'TWD',sourceMode:'local_recorded'};
const rows=Array.from({length:26},(_,index)=>({...rowBase,id:id(100-index),
  paidOn:'2026-11-'+String(30-index).padStart(2,'0'),
  entryKind:index===0?'reversal':'payment',reversesPaymentId:index===0?id(99):null,
  ...(index===2?{chargeLabel:'<img src=x onerror="window.paymentInjection=true">',chargeCategory:null}:{}),
}));
const profile={userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'};
const snapshot={checkedAt:'2026-11-12T13:00:00Z',officialUniversityData:false,profile,student:null,
  courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
  scholarship:{periods:[],applications:[]},studentAid:{records:[]},housing:{periods:[],applications:[],assignments:[]}};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function openContext(signedIn=true){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base.origin?route.continue():route.abort());
  await mockAffairsAuth(context,{signedIn});
  return context;
}

try{
  await mkdir('artifacts/charge-payment-history',{recursive:true});
  const context=await openContext();
  const reads=[],writes=[],errors=[];
  let mode='normal';
  await context.route('**/api/affairs-{action,manage}',route=>{writes.push(route.request().url());return route.abort();});
  await context.route('**/api/affairs-data*',route=>{
    const request=route.request(),params=new URL(request.url()).searchParams;
    if(!params.has('scope'))return route.fulfill({json:snapshot});
    assert.equal(params.get('scope'),'fee-payment-history');
    assert.equal(request.method(),'GET');
    const auth=request.headers().authorization||'';
    assert.match(auth,/^Bearer /u);
    assert.equal(JSON.parse(Buffer.from(auth.split('.')[1],'base64url').toString()).sub,affairsTestUser.id);
    assert.ok([...params.keys()].every(key=>['scope','from','through','charge_id','page'].includes(key)));
    reads.push(Object.fromEntries(params));
    if(mode==='failure')return route.fulfill({status:503,json:{error:'internal synthetic detail'}});
    const data=rows.filter(row=>(!params.has('from')||row.paidOn>=params.get('from'))&&(!params.has('through')||row.paidOn<=params.get('through'))
      &&(!params.has('charge_id')||row.chargeId===params.get('charge_id')));
    const page=Number(params.get('page')||1);
    return route.fulfill({json:{userId:mode==='foreign'?id(2000):affairsTestUser.id,studentRecordFound:mode!=='unlinked',
      rows:mode==='unlinked'||mode==='empty'?[]:data.slice((page-1)*25,page*25),
      total:mode==='unlinked'||mode==='empty'?0:data.length,
      hasUndatedPaidAmount:mode!=='unlinked'&&mode!=='empty'}});
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL(pending,base).href);
  await page.getByRole('link',{name:'繳費紀錄',exact:true}).click();
  await page.waitForURL(historyUrl());
  await page.getByRole('heading',{name:'繳費紀錄 Payment History',exact:true}).waitFor();
  const table=page.getByRole('table',{name:'繳費紀錄 Payment history'});
  await table.getByRole('cell',{name:'沖銷 Reversal',exact:true}).waitFor();
  assert.equal(await table.locator('tbody tr').count(),25);
  const reversal=table.locator('tbody tr').first();
  assert.equal(await reversal.locator('time').getAttribute('datetime'),'2026-11-30');
  assert.match(await reversal.locator('.pending-fees-amount').innerText(),/^-\s*TWD\s*2,000\.25$/u);
  assert.equal(await page.getByText('Some earlier paid amounts', {exact:false}).count(),1);
  assert.equal(await table.getByText('<img src=x onerror="window.paymentInjection=true">',{exact:true}).count(),1);
  assert.equal(await table.locator('img').count(),0);
  assert.equal(await page.evaluate(()=>window.paymentInjection),undefined);

  await page.getByLabel('開始日期 From').fill('2026-11-01');
  await page.getByLabel('結束日期 Through').fill('2026-11-30');
  await page.getByRole('button',{name:'查詢 Search'}).click();
  await page.waitForURL(historyUrl('?from=2026-11-01&through=2026-11-30'));
  await page.getByRole('link',{name:'下一頁 Next'}).click();
  await page.waitForURL(historyUrl('?from=2026-11-01&through=2026-11-30&page=2'));
  await table.locator('time[datetime="2026-11-05"]').waitFor();
  assert.deepEqual(reads.at(-1),{scope:'fee-payment-history',from:'2026-11-01',through:'2026-11-30',page:'2'});
  assert.equal(await table.locator('tbody tr').count(),1);
  await page.getByRole('link',{name:'上一頁 Previous'}).click();
  await table.getByRole('cell',{name:'沖銷 Reversal'}).waitFor();
  const existingReads=reads.length;
  await page.getByLabel('開始日期 From').fill('2026-12-01');
  await page.getByRole('button',{name:'查詢 Search'}).click();
  await page.getByRole('alert').filter({hasText:'Enter valid dates'}).waitFor();
  assert.equal(reads.length,existingReads,'Invalid date ranges do not reach the endpoint.');
  await page.getByLabel('開始日期 From').fill('2026-10-01');
  await page.getByLabel('結束日期 Through').fill('2026-10-31');
  await page.getByRole('button',{name:'查詢 Search'}).click();
  await page.getByRole('status').filter({hasText:'No dated payments match these filters.'}).waitFor();
  assert.equal(await table.count(),0);
  assert.equal(await page.getByText('Some earlier paid amounts', {exact:false}).count(),1);

  await page.goto(historyUrl('?charge_id='+id(1000)+'&page=9'));
  await page.getByRole('status').filter({hasText:'There are no entries on this page.'}).waitFor();
  await page.getByRole('link',{name:'最後一頁 Last page'}).click();
  await table.locator('time[datetime="2026-11-05"]').waitFor();
  assert.deepEqual(reads.at(-1),{scope:'fee-payment-history',charge_id:id(1000),page:'2'});

  for(const query of ['?from=2026-11-31','?page=2&page=3','?user_id='+id(2000)]){
    const started=reads.length;
    await page.goto(historyUrl(query));
    await page.getByRole('alert').filter({hasText:'Invalid filters.'}).waitFor();
    assert.equal(reads.length,started);
    assert.equal(await table.count(),0);
  }
  mode='empty';await page.goto(historyUrl());
  await page.getByRole('status').filter({hasText:'No dated payments are saved.'}).waitFor();
  assert.equal(await page.getByText('Some earlier paid amounts',{exact:false}).count(),0);
  mode='unlinked';await page.reload();
  await page.getByRole('status').filter({hasText:'No student record is linked to this account.'}).waitFor();
  assert.equal(await page.getByText('No dated payments are saved.',{exact:false}).count(),0);
  for(const invalidMode of ['foreign','failure']){
    mode=invalidMode;await page.reload();
    await page.getByRole('alert').filter({hasText:'Payment history could not be loaded.'}).waitFor();
    assert.equal(await table.count(),0);
    assert.equal(await page.getByText('internal synthetic detail',{exact:false}).count(),0);
  }
  mode='normal';await page.getByRole('button',{name:'重試 Retry'}).click();
  await table.getByRole('cell',{name:'沖銷 Reversal'}).waitFor();
  for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'artifacts/charge-payment-history/'+width+'.png',fullPage:true});
  }
  const axe=await new AxeBuilder({page}).include('.pending-fees').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(axe.violations.filter(item=>['serious','critical'].includes(item.impact)),[]);
  await page.getByRole('link',{name:'待繳費用明細',exact:true}).click();
  await page.waitForURL(new URL(pending,base).href);
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[]);
  await context.close();

  const guest=await openContext(false);
  const guestReads=[];
  await guest.route('**/api/affairs-data*',route=>{guestReads.push(route.request().url());return route.abort();});
  const login=await guest.newPage();
  const returnPath=history+'?from=2026-11-01&through=2026-11-30&page=2';
  await login.goto(new URL(returnPath,base).href);
  await login.waitForURL('**/school-affairs/login?next=*');
  assert.equal(new URL(login.url()).searchParams.get('next'),returnPath);
  assert.deepEqual(guestReads,[]);
  await guest.close();
  console.log('Payment history UI passed signed-in navigation, scoped dates and pagination, empty and failed reads, isolation, and 320px layout.');
}finally{await browser.close();}
