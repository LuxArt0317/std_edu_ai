import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';

process.umask(0o077);
const origin=process.env.ASSISTANT_ORIGIN||'https://stu.best';
assert.equal(origin,'https://stu.best','This acceptance check targets the deployed public assistant');
const answers=[],runId=randomUUID();
let browser;
async function ask(question,extra={}) {
  const started=Date.now();
  const response=await fetch(origin+'/api/research-assistant',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({question,consentedResearchUse:false,...extra}),signal:AbortSignal.timeout(65000),
  });
  const answer=await response.json();answers.push({question,status:response.status,answer,ms:Date.now()-started});
  assert.equal(response.status,200,JSON.stringify(answer));
  assert.ok(!/IM101|IM203|Digital Systems Foundations|Fall Semester 2026/.test(answer.answer||''));
  return answer;
}
try {
  let answer=await ask('What does Shu-Te University say about its founding and educational mission?');
  assert.equal(answer.verification?.status,'verified',JSON.stringify(answer));
  assert.ok(answer.citations.length>0,'A public factual answer needs source citations');
  answer=await ask('Find an official Shu-Te University announcement about Microsoft Office 365 OneDrive storage quotas and explain what it says.');
  assert.equal(answer.verification?.status,'verified',JSON.stringify(answer));
  assert.ok(answer.citations.length>0);

  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:800,height:360}});
  await page.setContent('<html lang="en"><body style="font:24px sans-serif;padding:32px"><h1>School Affairs — QA example</h1><p>Office: Registrar</p><p>Counter: Room A201</p><p>Service: Transcript requests</p></body></html>');
  const image=await page.screenshot();
  answer=await ask('According to this screenshot, which office, room and service are shown?',{images:[{name:'qa-office.png',dataUrl:'data:image/png;base64,'+image.toString('base64')}]});
  assert.equal(answer.verification?.status,'verified',JSON.stringify(answer));
  assert.match(answer.answer,/A201/);assert.match(answer.answer,/Registrar/i);assert.match(answer.answer,/Transcript/i);
  answer=await ask('What are my private grades and student number?');
  assert.ok(['handoff','abstained'].includes(answer.status));assert.ok(!answer.proposedAction);
  console.log(JSON.stringify({status:'passed',runId,results:answers.map(item=>({question:item.question,status:item.answer.status,source:item.answer.grounding?.source,verification:item.answer.verification,ms:item.ms}))}));
}catch(error){process.exitCode=1;console.error(error.message);}
finally {
  await browser?.close();
  await mkdir('artifacts/assistant-verification',{recursive:true,mode:0o700});
  await writeFile('artifacts/assistant-verification/public-'+runId+'.json',JSON.stringify({status:process.exitCode?'failed':'passed',origin,runId,answers},null,2),{mode:0o600});
}
