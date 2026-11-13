import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import captures from '../../src/features/public/mirror/pages.json' with {type:'json'};
import {answerAccountWithVerification} from '../../server/answerVerificationAccount.js';
import {boundedPublicPageEvidence,loadPublicPageContext} from '../../server/publicPageContext.js';
import {buildAccountFixture,EVAL_USER_ID} from './fixtures.mjs';

const page=captures.find(row=>row.title&&row.route.startsWith('/latestnews-single/?'));
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const modelResponse=value=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});

async function run({route=page.route,question='Explain this page and my tuition. PRIVATE-QUESTION-SENTINEL',retry=false}={}) {
  const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='synthetic-mixed-context';
  const snapshot=buildAccountFixture();snapshot.charges[0].userId=EVAL_USER_ID;snapshot.charges[0].label='PRIVATE-TUITION-SENTINEL';
  const requests=[],reviews=[],captureRequests=[],progress=[];
  let refreshes=0,repairs=0;
  try {
    globalThis.fetch=async(url,init)=>{
      if(String(url).startsWith('https://stu.best/school-pages/')) {
        captureRequests.push({url:String(url),init});
        assert.equal(String(url),'https://stu.best'+page.file);
        assert.equal(init.redirect,'error');assert.equal(init.body,undefined);
        assert.doesNotMatch(JSON.stringify({url,init}),/PRIVATE-|evaluation\.student|Bearer/);
        return new Response(await readFile(new URL('../../public'+page.file,import.meta.url)));
      }
      assert.equal(String(url),'https://api.openai.com/v1/responses','No private value may trigger a public web/API search.');
      const body=JSON.parse(init.body),input=JSON.parse(body.input[0].content[0].text);requests.push(body);
      assert.equal(body.tools,undefined,'No web-search tool receives the private question or records.');
      if(body.text.format.name==='account_lookup_plan')return modelResponse({tools:['charges'],publicTopics:[],action:null});
      const evidence=input.evidence;
      assert.ok(bytes(evidence)<=100000,'Combined evidence stays within the shared ceiling.');
      const chargeSource=evidence.find(source=>source.id==='account:charges');assert.ok(chargeSource);
      const charge=JSON.parse(chargeSource.content).records[0];
      assert.equal(charge.label,'PRIVATE-TUITION-SENTINEL');
      assert.equal(charge.amountDue,retry&&refreshes?30000:28000);
      const publicSource=evidence.find(source=>source.id.startsWith('public-page:'));
      if(publicSource) {
        assert.ok(bytes(publicSource)<=6000);
        const metadata=JSON.parse(publicSource.content);
        assert.equal(metadata.localUrl,page.route,'Query route identity survives native route normalization.');
        assert.equal(metadata.pageTitle,page.title);assert.equal(metadata.capturedOn,page.capturedOn);
        assert.equal(metadata.contentAvailable,true);assert.equal(metadata.includedCharacters,metadata.excerpt.length);
        assert.doesNotMatch(publicSource.content,/PRIVATE-|evaluation\.student|amountDue|amountPaid/);
      }
      if(body.text.format.name==='correct_grounded_answer') {
        repairs++;
        return modelResponse({status:'answered',answer:`Your local tuition is ${charge.amountDue}. ${publicSource?`[${page.title}](${page.route})`:'No recognized public page is available.'}`,sourceIds:[chargeSource.id,...(publicSource?[publicSource.id]:[])]});
      }
      assert.equal(body.text.format.name,'answer_evidence_review');reviews.push(input);
      const supported=!retry||reviews.length>1;
      return modelResponse({supported,answersQuestion:supported,claims:[
        {claim:'Saved tuition amount.',supported,evidenceId:chargeSource.id,jsonPaths:['/records/0/amountDue','/records/0/sourceMode'],quotes:[]},
        ...(publicSource?[{claim:'Saved public page identity and snapshot date.',supported,evidenceId:publicSource.id,jsonPaths:['/pageTitle','/localUrl','/capturedOn'],quotes:[]}]:[]),
      ]});
    };
    const result=await answerAccountWithVerification({question,snapshot,route,deadline:Date.now()+55000,onProgress:step=>progress.push(step),loadSnapshot:async()=>{
      refreshes++;const fresh=structuredClone(snapshot);fresh.charges[0].amountDue=30000;return fresh;
    }});
    return {result,requests,reviews,captureRequests,progress,refreshes,repairs};
  } finally {
    globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;
  }
}

test('signed-in mixed page/tuition questions verify owned charges and a separate public snapshot',async()=>{
  const output=await run();
  assert.equal(output.result.verification.status,'verified');assert.equal(output.result.verification.attempts,1);
  assert.equal(output.captureRequests.length,1);assert.equal(output.reviews.length,1);assert.equal(output.refreshes,0);
  assert.ok(output.result.citations.some(item=>item.chunkId==='account:charges'));
  assert.ok(output.result.citations.some(item=>item.url===page.route&&item.sourceName==='Public page snapshot · '+page.capturedOn));
  assert.match(output.result.answer,new RegExp(page.capturedOn));
  assert.ok(output.result.activity.some(step=>step.kind==='page-context'&&step.status==='complete'));
  assert.equal(output.result.proposedAction,undefined);
});

test('the correction retry refreshes only owned records while retaining the pinned public page',async()=>{
  const output=await run({retry:true});
  assert.equal(output.result.verification.status,'verified');assert.equal(output.result.verification.attempts,2);
  assert.equal(output.captureRequests.length,1);assert.equal(output.reviews.length,2);assert.equal(output.refreshes,1);assert.equal(output.repairs,1);
  assert.match(output.result.answer,/30000/);assert.match(output.result.answer,new RegExp(page.capturedOn));
});

test('private, unrecognized and altered-query paths never become public capture targets',async()=>{
  for(const route of ['/school-affairs/services/39-1','/dtm/course/private','/app/knowledge','/invented/',page.route+'&student=PRIVATE-SENTINEL','https://stu.best'+page.route]) {
    const output=await run({route});
    assert.equal(output.captureRequests.length,0,route);
    assert.ok(output.reviews.every(input=>!input.evidence.some(source=>source.id.startsWith('public-page:'))),route);
  }
});

test('a recognized public route alone does not request a page capture for a purely personal question',async()=>{
  const output=await run({question:'What is my tuition?'});
  assert.equal(output.captureRequests.length,0);assert.equal(output.result.verification.status,'verified');
});

test('public context budgeting keeps valid whole JSON, complete metadata and honest multibyte counts',async()=>{
  const context=await loadPublicPageContext(page.route,0),metadata=JSON.parse(context.evidence.content);
  metadata.excerpt='段落🧑🏽‍💻"\\\n'.repeat(5000);metadata.contentAvailable=true;metadata.contentStatus='verified_snapshot';
  metadata.totalCharacters=metadata.excerpt.length+1000;metadata.includedCharacters=metadata.excerpt.length;metadata.excerptTruncated=true;
  context.evidence.content=JSON.stringify(metadata);const original=structuredClone(context);
  const bounded=boundedPublicPageEvidence(context,{budget:6000}),actual=JSON.parse(bounded.content);
  assert.ok(bytes(bounded)<=6000);assert.deepEqual(context,original,'Budgeting does not mutate its verified input.');
  for(const field of ['pageTitle','localUrl','originalSource','capturedOn','provenance','coverage','contentAvailable','contentStatus','totalCharacters'])assert.deepEqual(actual[field],metadata[field],field);
  assert.equal(actual.includedCharacters,actual.excerpt.length);assert.ok(actual.includedCharacters<metadata.includedCharacters);
  assert.equal(actual.excerpted,true);assert.equal(actual.excerptTruncated,true);assert.ok(metadata.excerpt.startsWith(actual.excerpt));
  assert.equal(actual.excerpt.isWellFormed(),true);
  assert.deepEqual(bounded.urls,context.evidence.urls);assert.equal(bounded.capturedOn,context.evidence.capturedOn);
});

test('unavailable content retains unknown counts and an oversized metadata envelope fails closed',async()=>{
  const context=await loadPublicPageContext(page.route,0),bounded=boundedPublicPageEvidence(context);
  const metadata=JSON.parse(bounded.content);
  assert.equal(metadata.contentAvailable,false);assert.equal(metadata.totalCharacters,null);assert.equal(metadata.includedCharacters,0);
  assert.equal(metadata.excerpt,'');assert.equal(metadata.excerpted,false);
  const huge=structuredClone(context);huge.evidence.title='長'.repeat(4000);
  assert.throws(()=>boundedPublicPageEvidence(huge,{budget:6000}),RangeError);
  assert.throws(()=>boundedPublicPageEvidence(context,{budget:100}),RangeError);
  const invalid=structuredClone(context);invalid.evidence.content='{broken';
  assert.throws(()=>boundedPublicPageEvidence(invalid),SyntaxError);
});
