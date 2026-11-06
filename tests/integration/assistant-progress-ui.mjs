import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5173';
if (!['127.0.0.1','localhost'].includes(new URL(origin).hostname)) throw Error('Local fixture only');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  await mkdir('artifacts/assistant-activity',{recursive:true});
  for (const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      const original=window.fetch.bind(window);
      window.fetch=(input,init)=>{
        if (String(input)!=='/api/research-assistant') return original(input,init);
        const request=JSON.parse(String(init?.body));
        if (request.stream!==true) throw Error('Progress mode not requested');
        const encoder=new TextEncoder();
        const body=new ReadableStream({start(controller){
          controller.enqueue(encoder.encode('event: progress\ndata: {"kind":"knowledge","label":"Searching managed knowledge","detail":"Checking reviewed school information.","status":"running"}\n\n'));
          if(request.question==='Slow question')return;
          if(request.question==='Fail question'){
            setTimeout(()=>{controller.enqueue(encoder.encode('event: error\ndata: {"error":"School sources are temporarily unavailable."}\n\n'));controller.close()},250);
            return;
          }
          setTimeout(()=>controller.enqueue(encoder.encode('event: progress\ndata: {"kind":"knowledge","label":"Checked managed knowledge","detail":"0 excerpts found.","status":"complete"}\n\nevent: progress\ndata: {"kind":"web","label":"Searching school sources","detail":"Checking official pages.","status":"running"}\n\n')),450);
          setTimeout(()=>{controller.enqueue(encoder.encode('event: result\ndata: {"answer":"The registrar phone is listed in the official school directory.","status":"answered","citations":[{"chunkId":"registrar","claim":"Registrar contact","title":"Registrar contact page","sourceName":"School directory","url":"https://www.stu.edu.tw/","locator":null,"effectiveAt":null,"reviewedAt":null}],"suggestedQuestions":[],"activity":[{"kind":"web","label":"Searched school sources","detail":"One verified page.","status":"complete"}]}\n\n'));controller.close()},1000);
        }});
        return Promise.resolve(new Response(body,{headers:{'content-type':'text/event-stream'}}));
      };
    });
    await page.goto(origin+'/campus-assistant');
    await page.getByRole('heading',{name:'校園助理 · Assistant'}).waitFor();
    await page.getByPlaceholder('Ask a school question…').fill('Registrar phone?');
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await page.getByRole('status',{name:'Assistant activity'}).getByText('Searching managed knowledge').waitFor();
    await page.getByRole('status',{name:'Assistant activity'}).getByText('Searching school sources').waitFor();
    await page.getByText('The registrar phone is listed in the official school directory.').waitFor();
    assert.equal(await page.getByRole('status',{name:'Assistant activity'}).count(),0);
    const activity=page.locator('article').last().locator('details');
    await activity.locator('summary').click();
    await activity.getByText('Checked managed knowledge').waitFor();
    await activity.getByText('Searched school sources').waitFor();
    assert.equal(await activity.locator('li').count(),2,'the final payload must not erase an observed lookup');
    await page.getByRole('link',{name:'Registrar contact page'}).waitFor();
    const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(a11y.violations.filter(item=>['serious','critical'].includes(item.impact)).map(item=>item.id),[]);
    await page.screenshot({path:`artifacts/assistant-activity/final-${width}.png`,fullPage:false});
    await page.reload();
    await page.getByText('The registrar phone is listed in the official school directory.').waitFor();
    const restored=page.locator('article').last().locator('details');
    await restored.locator('summary').click();
    await restored.getByText('Checked managed knowledge').waitFor();
    await restored.getByText('Searched school sources').waitFor();
    await page.getByRole('link',{name:'Registrar contact page'}).waitFor();
    await page.getByPlaceholder('Ask a school question…').fill('Fail question');
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await page.getByRole('alert').getByText('School sources are temporarily unavailable.').waitFor();
    const failed=page.locator('article').last().locator('details');
    await failed.locator('summary').click();
    await failed.getByText('Searching managed knowledge').waitFor();
    assert.match(await failed.innerText(),/interrupted/i);
    await page.getByPlaceholder('Ask a school question…').fill('Slow question');
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await page.getByRole('status',{name:'Assistant activity'}).getByText('Searching managed knowledge').waitFor();
    await page.reload();
    await page.getByText('This answer was interrupted by navigation or refresh. Please ask again.').waitFor();
    await page.locator('article').last().locator('details').locator('summary').click();
    assert.match(await page.locator('article').last().innerText(),/response was interrupted/i);
    await page.getByRole('button',{name:'New chat'}).click();
    await page.reload();
    assert.equal(await page.locator('article').count(),0,'New chat must clear the current-tab transcript');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log(JSON.stringify({status:'ok',streamedActivity:true,persistedAnswerAndActivity:true,failedAndInterruptedSteps:true,newChatClears:true,viewports:[1440,390],seriousAccessibility:0,pageErrors:0}));
} finally {await browser.close()}
