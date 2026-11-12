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
        const steps=[
          {kind:'verification-1',label:'Answer could not be verified',detail:'The current draft was withheld.',status:'unavailable'},
          {kind:'verification-retry',label:'Rechecking and correcting the answer',detail:'Reloading the evidence and preparing one corrected draft.',status:'complete'},
          {kind:'verification-2',label:'Answer checked against evidence',detail:'The answer passed the evidence checks.',status:'complete'},
        ];
        const result={answer:'The checked tuition balance is NT$600.',status:'answered',citations:[],suggestedQuestions:[],activity:steps,verification:{status:'verified',attempts:2}};
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
      await activity.getByText('Answer could not be verified',{exact:true}).waitFor();
      await activity.getByText('Rechecking and correcting the answer',{exact:true}).waitFor();
      await activity.getByText('Answer checked against evidence',{exact:true}).waitFor();
      assert.equal(await activity.locator('li').count(),3);
    }
    const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('stu-campus-assistant-conversation-v1')));
    assert.deepEqual(stored.messages.at(-1).result.verification,{status:'verified',attempts:2});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log(JSON.stringify({status:'ok',viewports:[1440,390],retryHistoryPersists:true,verificationMetadataPersists:true,pageErrors:0}));
} finally {await browser.close();}
