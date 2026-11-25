import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Local UI fixture only');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  for(const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.addInitScript(()=>{
      const original=window.fetch.bind(window);
      window.fetch=(input,init)=>{
        if(String(input)!=='/api/research-assistant')return original(input,init);
        const question=JSON.parse(String(init?.body)).question;
        const unresolved=question.includes('storage quota');
        const alternate=question.includes('archive exhibition');
        const checkedSteps=[
          {kind:'verification-1',label:'Draft did not pass verification',detail:'Some claims could not be matched to the available evidence.',status:'unavailable'},
          {kind:'verification-retry',label:'Rechecking and correcting the answer',detail:'Checking the available evidence again and preparing a correction.',status:'complete'},
          {kind:'verification-2',label:'Draft did not pass verification',detail:'The reviewer reached its output limit.',status:'unavailable'},
          {kind:'verification-deeper-review',label:'Taking a closer look at the answer',detail:'Reconsidering the unresolved claims using the same authorized evidence.',status:'complete'},
          {kind:'verification-3',label:'Answer checked against evidence',detail:'The answer passed the evidence checks.',status:'complete'},
        ];
        const steps=unresolved?[...checkedSteps.slice(0,3),
          {kind:'verification-stop',label:'Why verification stopped',detail:'There was no additional usable evidence for another check.',status:'unavailable'}]:alternate?[
          ...checkedSteps.slice(0,4),
          {kind:'verification-3',label:'Draft did not pass verification',detail:'The available evidence did not answer the requested detail.',status:'unavailable'},
          {kind:'verification-extended-review',label:'Looking for another source',detail:'Looking for an unread school page or another publication that can verify the remaining detail.',status:'complete'},
          {kind:'web-alternate-discovery',label:'Checking a different official publication',detail:'Read additional official source contents.',status:'complete'},
          {...checkedSteps[4],kind:'verification-4'},
        ]:checkedSteps;
        const answer=unresolved?'The pages I checked do not establish the storage quota.':alternate?'The checked exhibition opening time is 10:30 a.m.':'The checked tuition balance is NT$600.';
        const result={answer,
          status:unresolved?'abstained':'answered',citations:[],suggestedQuestions:[],activity:steps,
          verification:unresolved?{status:'unverified',attempts:2}:{status:'verified',attempts:alternate?4:3}};
        return Promise.resolve(new Response(steps.map(step=>'event: progress\ndata: '+JSON.stringify(step)+'\n\n').join('')+'event: result\ndata: '+JSON.stringify(result)+'\n\n',{headers:{'content-type':'text/event-stream'}}));
      };
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/campus-assistant');
    await page.getByPlaceholder('Ask a school question…').fill('What is the tuition balance?');
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await page.getByText('The checked tuition balance is NT$600.').waitFor();
    for(let pass=0;pass<2;pass++) {
      if(pass)await page.reload();
      const activity=page.locator('article').last().locator('details');
      await activity.locator('summary').click();
      await activity.getByText('Some claims could not be matched to the available evidence.',{exact:true}).waitFor();
      await activity.getByText('Rechecking and correcting the answer',{exact:true}).waitFor();
      await activity.getByText('The reviewer reached its output limit.',{exact:true}).waitFor();
      await activity.getByText('Taking a closer look at the answer',{exact:true}).waitFor();
      await activity.getByText('Answer checked against evidence',{exact:true}).waitFor();
      assert.equal(await activity.locator('li').count(),5);
    }
    const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('stu-campus-assistant-conversation-v1')));
    assert.deepEqual(stored.messages.at(-1).result.verification,{status:'verified',attempts:3});
    await page.getByPlaceholder('Ask a school question…').fill('What is the storage quota?');
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await page.getByText('The pages I checked do not establish the storage quota.').waitFor();
    for(let pass=0;pass<2;pass++) {
      if(pass)await page.reload();
      const activity=page.locator('article').last().locator('details');
      await activity.locator('summary').click();
      await activity.getByText('Why verification stopped',{exact:true}).waitFor();
      await activity.getByText('There was no additional usable evidence for another check.',{exact:true}).waitFor();
      assert.equal(await activity.locator('li').count(),4);
    }
    const savedStop=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('stu-campus-assistant-conversation-v1')).messages.at(-1).result);
    assert.deepEqual(savedStop.verification,{status:'unverified',attempts:2});
    assert.equal(savedStop.activity.at(-1).kind,'verification-stop');
    await page.getByPlaceholder('Ask a school question…').fill('When does the archive exhibition open?');
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await page.getByText('The checked exhibition opening time is 10:30 a.m.').waitFor();
    for(let pass=0;pass<2;pass++) {
      if(pass)await page.reload();
      const activity=page.locator('article').last().locator('details');
      await activity.locator('summary').click();
      await activity.getByText('Looking for another source',{exact:true}).waitFor();
      await activity.getByText('Checking a different official publication',{exact:true}).waitFor();
      await activity.getByText('Answer checked against evidence',{exact:true}).waitFor();
      assert.equal(await activity.locator('li').count(),8);
    }
    const savedAlternate=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('stu-campus-assistant-conversation-v1')).messages.at(-1).result);
    assert.deepEqual(savedAlternate.verification,{status:'verified',attempts:4});
    assert.equal(savedAlternate.activity.at(-1).kind,'verification-4');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log(JSON.stringify({status:'ok',viewports:[1440,390],retryHistoryPersists:true,alternateDiscoveryPersists:true,stopReasonPersists:true,verificationMetadataPersists:true,pageErrors:0}));
} finally {await browser.close();}
