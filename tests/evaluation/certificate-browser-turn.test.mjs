import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement as html} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Markdown from 'react-markdown';
import {chromium} from 'playwright-core';
import {inspectProtectedCertificateBrowserReply} from './certificate-browser-turn.mjs';
import {verifyRenderedCertificateBrowserTurn} from '../integration/helpers/protected-conversation-browser.mjs';
import {certificateAwardBankReceiptNote,certificateAwardPath} from '../../server/certificateAwardsContract.js';

const title='Certificate award applications',summary='Your recent certificate applications:';
const certificate='(MOS)Excel Associate Microsoft 365 Apps · Approved · NT$900';
const bankNote=certificateAwardBankReceiptNote[1];
const activity=[
  {kind:'certificate-awards',label:title,detail:summary,status:'complete'},
  {kind:'certificate-awards-bank-receipt',label:'Bank receipt confirmation',detail:bankNote,status:'unavailable'},
];
const citation={chunkId:'account:certificate-awards',claim:summary,title,url:certificateAwardPath,sourceName:'My stu.best records'};
const answer=[summary,'- '+certificate,bankNote,`[${title}](${certificateAwardPath})`].join('\n\n');
const reply={status:'answered',answer,activity,citations:[citation],suggestedQuestions:[],grounding:{source:'account',webSearched:false}};

test('certificate replies require the exact two source dispositions and local claim',()=>{
  assert.deepEqual(inspectProtectedCertificateBrowserReply(reply,{bankReceipt:true}),{
    summary,items:[certificate],bankNote,title,url:certificateAwardPath,sourceName:citation.sourceName,
  });
  const mutations=[
    value=>{value.activity[1].status='complete';},
    value=>{value.answer=value.answer.replace(bankNote,'Your award was paid.');},
    value=>{value.citations[0].url='/dtm';},
    value=>{value.verification={status:'verified',attempts:0};},
    value=>{value.proposedAction={kind:'write'};},
    value=>{value.answer=value.answer.replace('- '+certificate,'- [A different source](/dtm)');value.citations=[];},
  ];
  for(const mutate of mutations){
    const changed=structuredClone(reply);mutate(changed);
    assert.throws(()=>inspectProtectedCertificateBrowserReply(changed,{bankReceipt:true}),{code:'invalid-certificate-response'});
  }
});

const chrome=process.env.STU_CERTIFICATE_BROWSER_CHROME;
test('real local Chromium checks displayed text, exact link, and expanded certificate Activity', {skip:!chrome,timeout:20_000},async()=>{
  const question='What is the status of my professional certificate subsidy application? Also tell me whether its payout has reached my bank.';
  const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--disable-background-networking']});
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    const screen=html('div',{role:'dialog','aria-label':'Campus Assistant'},html('div',{role:'log','aria-label':'Assistant conversation'},
      html('article',null,html('p',null,'You'),html('p',null,question)),
      html('article',null,html('p',null,'Assistant'),html('div',{className:'nexus-message-markdown'},html(Markdown,null,answer)),
        html('details',null,html('summary',null,html('span',null,'Activity')),html('ol',{'aria-label':'Observed assistant steps'},
          ...activity.map((step,index)=>html('li',{key:step.kind},html('span',{'aria-hidden':true}),
            html('span',null,html('span',null,index?'Unavailable: ':'Completed: '),html('strong',null,step.label),html('span',null,step.detail)))))),
        html('ul',{'aria-label':'Sources'},html('li',null,html('a',{href:citation.url},citation.title),html('span',null,citation.sourceName))))));
    await page.setContent(renderToStaticMarkup(screen));
    const dialog=page.getByRole('dialog');
    const expected={question,display:inspectProtectedCertificateBrowserReply(reply,{bankReceipt:true}),activity,requestSequence:5};
    const verify=()=>verifyRenderedCertificateBrowserTurn({dialog,expected});
    assert.deepEqual(await verify(),{requestSequence:5,observedSteps:2});
    assert.deepEqual(await verify(),{requestSequence:5,observedSteps:2},'An already expanded timeline stays open.');
    const link=dialog.getByRole('list',{name:'Sources'}).getByRole('link');
    await link.evaluate(element=>element.setAttribute('href','/dtm'));
    await assert.rejects(verify(),{code:'rendered-certificate-transcript-mismatch'});
    await link.evaluate((element,path)=>element.setAttribute('href',path),certificateAwardPath);
    await dialog.getByText('Bank receipt confirmation',{exact:true}).evaluate(element=>{element.textContent='Bank receipt verified';});
    await assert.rejects(verify(),{code:'rendered-certificate-activity-mismatch'});
    await context.close();
  }finally{await browser.close();}
});
