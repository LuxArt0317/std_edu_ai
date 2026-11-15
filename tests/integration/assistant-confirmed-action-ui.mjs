import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mockAffairsAuth} from './helpers/affairs-auth.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Use a local compiled build.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const requestId='a9510000-0000-4000-8000-000000000051';
const recordId='a9510000-0000-4000-8000-000000000052';
const cases=[
  {
    question:'Create a task titled Review notes.',
    label:'Create task: Review notes',
    kind:'create_task',payload:{title:'Review notes'},url:'/school-affairs/records',
    expectedWrite:{kind:'create_task',requestId,payload:{title:'Review notes'}},
    invalidReceipt:{id:recordId,kind:'complete_task',summary:'Unmatched receipt'},
    receipt:{id:recordId,kind:'create_task',summary:'Created task: Review notes'},
    error:'The action receipt could not be verified. Retry the same confirmation.',
    success:'Created task: Review notes',
  },
  {
    question:'Cancel my club equipment request for "Tripod".',
    label:'Cancel Robotics Team · Pickup 2026-11-20 · Tripod',
    kind:'cancel_club_equipment',payload:{id:recordId,expected_version:'2'},url:'/school-affairs/services/40-1/equipment',
    expectedWrite:{kind:'cancel_club_equipment',payload:{request_id:requestId,id:recordId,expected_version:2}},
    invalidReceipt:{id:recordId,version:4,status:'cancelled'},
    receipt:{id:recordId,version:3,status:'cancelled'},
    error:'無法確認借用紀錄。請重新整理。',
    success:'Cancelled your club equipment request',
  },
];
try{
  for(const scenario of cases){
    const context=await browser.newContext({viewport:{width:390,height:900}});
    await mockAffairsAuth(context);
    const writes=[];
    await context.route('**/api/affairs-conversations*',route=>{
      if(route.request().method()==='GET')return route.fulfill({json:{conversations:[]}});
      const draft=route.request().postDataJSON();
      assert.ok(draft.messages.every(message=>!message.result?.proposedAction));
      return route.fulfill({json:{id:draft.id,title:draft.title,messages:draft.messages,version:draft.version+1,updated_at:new Date().toISOString()}});
    });
    await context.route('**/api/affairs-assistant',route=>{
      assert.match(route.request().headers().authorization??'',/^Bearer /u);
      assert.equal(route.request().postDataJSON().question,scenario.question);
      return route.fulfill({json:{
        status:'answered',answer:'Review the proposed change below. I’ll apply it to your stu.best account after you confirm.',citations:[],suggestedQuestions:[],
        verification:{status:'verified',attempts:1},
        proposedAction:{kind:scenario.kind,label:scenario.label,requestId,payload:scenario.payload,url:scenario.url},
      }});
    });
    await context.route('**/api/affairs-action',route=>{
      assert.match(route.request().headers().authorization??'',/^Bearer /u);
      const confirmed=route.request().postDataJSON();
      assert.deepEqual(confirmed,scenario.expectedWrite);
      writes.push(confirmed);
      return route.fulfill({json:writes.length===1?scenario.invalidReceipt:scenario.receipt});
    });
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/campus-assistant');
    await page.getByRole('heading',{name:'校園助理 · Assistant'}).waitFor();
    await page.getByPlaceholder('Ask a school question…').fill(scenario.question);
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await page.getByText(scenario.label,{exact:true}).waitFor();
    assert.equal(writes.length,0);
    const confirm=page.getByRole('button',{name:'Confirm action'});
    await confirm.click();
    await page.getByText(scenario.error).waitFor();
    assert.equal(await page.getByText('✓ '+scenario.success+'.',{exact:false}).count(),0);
    await confirm.click();
    await page.getByText('✓ '+scenario.success+'.',{exact:false}).waitFor();
    assert.equal(await confirm.count(),0);
    assert.equal(writes.length,2);
    assert.deepEqual(writes[0],writes[1]);
    assert.deepEqual(errors,[]);
    assert.equal(await page.getByRole('link',{name:'View updated records'}).getAttribute('href'),scenario.url);
    await context.close();
    console.log(JSON.stringify({action:scenario.kind,status:'ok',prematureWrites:0,unmatchedReceiptWithheld:true,sameRequestIdOnRetry:true,confirmedReceiptDisplayed:true}));
  }
}finally{await browser.close();}
