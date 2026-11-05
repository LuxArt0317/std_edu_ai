import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5173';
if (!['127.0.0.1','localhost'].includes(new URL(origin).hostname)) throw Error('Local fixture only');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  for (const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
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
          setTimeout(()=>controller.enqueue(encoder.encode('event: progress\ndata: {"kind":"knowledge","label":"Checked managed knowledge","detail":"0 excerpts found.","status":"complete"}\n\nevent: progress\ndata: {"kind":"web","label":"Searching school sources","detail":"Checking official pages.","status":"running"}\n\n')),450);
          setTimeout(()=>{controller.enqueue(encoder.encode('event: result\ndata: {"answer":"The registrar phone is listed in the official school directory.","status":"answered","citations":[],"suggestedQuestions":[],"activity":[{"kind":"web","label":"Searched school sources","detail":"One verified page.","status":"complete"}]}\n\n'));controller.close()},1000);
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
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log(JSON.stringify({status:'ok',streamedActivity:true,finalAnswer:true,viewports:[1440,390],pageErrors:0}));
} finally {await browser.close()}
