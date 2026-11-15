import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';
import {readVerificationSources} from '../../server/answerVerificationSources.js';

const officialDirectory = 'https://www.lib.stu.edu.tw/visitor-information/';
const officialNotice = 'https://www.lib.stu.edu.tw/2026-archive-exhibit/';
const directoryContent = 'The library visitor directory lists the exhibits and explains how to contact staff.';
const noticeContent = 'The archive exhibition opens at 10:30 a.m. on November 24, 2026.';
const testQuestion = 'When does the STU library archive exhibition open in November 2026?';
const unsafeDraft = 'The exhibition supposedly opens at 8:00 a.m. Draft marker: NOT_PUBLIC_SEARCH_INPUT.';
const rejectedClaim = 'Reviewer says 8:00 a.m. is not established. PRIVATE_REVIEW_FEEDBACK.';
const searchPayload = (sources: string[], answer: string, claimedSources = sources) => ({
  output: [
    {type:'web_search_call',status:'completed',action:{sources:sources.map(url=>({url,title:'STU Library'}))}},
    {type:'message',content:[{text:JSON.stringify({status:'answered',answer,source_urls:claimedSources})}]},
  ],
});
const provider = (value: unknown) => Response.json({
  output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],
});

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const envKeys = ['OPENAI_API_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'];
const initialEnv = Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  for (const key of envKeys) {
    const value = initialEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function configured() {
  process.env.OPENAI_API_KEY = 'test-openai';
  process.env.VITE_SUPABASE_URL = 'https://web-follow-up-test.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function invoke(input: unknown, run: ReturnType<typeof createResearchAssistantHandler>, address: string) {
  let responseBody: any;
  const response = {
    status(code: number) {
      assert.equal(code,200);
      return response;
    },
    json(value: unknown) { responseBody = value; },
    setHeader() {},
  };
  await run({method:'POST',body:input,headers:{'x-forwarded-for':address,'user-agent':'research-web-follow-up-test'}},response);
  return responseBody;
}

function harness(outcome: 'new-source'|'deeper-review'|'same-source'|'budget') {
  configured();
  const started = Date.now();
  let elapsed = 0;
  Date.now = () => started + elapsed;
  let searchCalls = 0;
  const scopes: Array<{name:string; effort:string; urls:string[]}> = [];
  const acquiredUrls: string[] = [];
  const searchRequests: Record<string,unknown>[] = [];
  let reviewCalls = 0;
  globalThis.fetch = async (input,init) => {
    const url = String(input);
    if (url.includes('/embeddings')) return Response.json({data:[{embedding:Array(1536).fill(0)}]});
    if (url.includes('/rpc/search_public_knowledge')) return Response.json([]);
    if (!url.endsWith('/v1/responses')) return Response.json(null);
    const request = JSON.parse(String(init?.body));
    const name = request.text.format.name;
    if (name === 'stu_web_answer') {
      searchRequests.push(request);
      searchCalls++;
      if (searchCalls === 1) return Response.json(searchPayload([officialDirectory],unsafeDraft));
      assert.equal(searchCalls,2);
      if (outcome === 'same-source')
        return Response.json(searchPayload([officialDirectory+'?utm_source=retry'],noticeContent));
      // The only exact notice URL appears in actual tool metadata. The follow-up
      // answer itself is invented and must never become an answer or evidence.
      return Response.json(searchPayload(
        [officialDirectory,officialNotice,'https://outside.example.org/campus/'],
        'FORGED FOLLOW-UP: 11:45 a.m.', ['https://outside.example.org/campus/'],
      ));
    }
    const context = JSON.parse(request.input[0].content[0].text);
    const urls = context.evidence.map((source: {url:string})=>source.url);
    scopes.push({name,effort:request.reasoning.effort,urls});
    const source = context.evidence.find((entry: {url:string})=>entry.url===officialNotice);
    if (source) {
      assert.match(source.content,/opens at 10:30 a\.m\. on November 24, 2026/);
      assert.doesNotMatch(source.content,/FORGED|11:45/);
    }
    if (name === 'correct_grounded_answer') {
      return provider({status:'answered',
        answer:source ? `The archive exhibition opens at 10:30 a.m. on November 24, 2026. [STU Library notice](${officialNotice})` : unsafeDraft,
        sourceIds:[source?.id ?? context.evidence[0].id],
      });
    }
    assert.equal(name,'answer_evidence_review');
    reviewCalls++;
    if (outcome === 'budget' && reviewCalls === 1) elapsed = 40_000;
    if (!source || outcome === 'deeper-review' && reviewCalls === 2) {
      return provider({supported:false,answersQuestion:false,claims:[{
        claim:rejectedClaim,supported:false,evidenceId:context.evidence[0].id,quotes:[],jsonPaths:[],
      }]});
    }
    return provider({supported:true,answersQuestion:true,claims:[{
      claim:'Exhibition opening time and date',supported:true,evidenceId:source.id,quotes:[noticeContent],jsonPaths:[],
    }]});
  };
  const run = createResearchAssistantHandler({
    readSources: (citations,deadline) => readVerificationSources(citations,deadline,{
      captures:[],
      acquire: async url=>{
        acquiredUrls.push(url);
        const content = url===officialDirectory ? directoryContent : url===officialNotice ? noticeContent : undefined;
        assert.ok(content);
        return {bytes:new TextEncoder().encode(`<html><title>STU Library</title><main><p>${content}</p></main></html>`),mimeType:'text/html',finalUrl:url};
      },
    }),
  });
  return {run,scopes,acquiredUrls,searchRequests};
}

test('an exact follow-up source is fetched independently and replaces the unsupported public draft', async () => {
  const attempt = harness('new-source');
  const answer = await invoke({question:testQuestion,history:[
    {role:'user',content:'What are my attendance records at STU?'},
    {role:'assistant',content:'PRIVATE_ASSISTANT_HISTORY: account attendance and grades'},
  ]},attempt.run,'web-follow-up-source');
  assert.equal(attempt.searchRequests.length,2);
  for (const request of attempt.searchRequests) {
    const fields = JSON.parse(String(request.input));
    assert.equal(fields.question,testQuestion);
    assert.doesNotMatch(JSON.stringify(fields),/PRIVATE_|NOT_PUBLIC_SEARCH_INPUT|8:00|my attendance/);
    const tools = request.tools as Array<{filters:{allowed_domains:string[]}}>;
    assert.deepEqual(tools[0].filters.allowed_domains,['stu.edu.tw']);
  }
  assert.match(String(attempt.searchRequests[1].instructions),/focused evidence check/);
  assert.deepEqual(attempt.acquiredUrls,[officialDirectory,officialNotice]);
  assert.deepEqual(attempt.scopes.map(scope=>scope.urls),
    [[officialDirectory],[officialNotice,officialDirectory],[officialNotice,officialDirectory]]);
  assert.equal(answer.status,'answered');
  assert.equal(answer.verification.attempts,2);
  assert.equal(answer.verification.status,'verified');
  assert.match(answer.answer,/opens at 10:30 a\.m\./);
  assert.doesNotMatch(answer.answer,/FORGED|11:45|supposedly/);
  assert.deepEqual(answer.citations.map((citation: {url:string;origin:string})=>[citation.url,citation.origin]),[[officialNotice,'web']]);
  assert.equal(answer.activity.find((step: {kind:string})=>step.kind==='web-follow-up').status,'complete');
});

test('a deeper third review reuses collected sources with no additional public search or fetch', async () => {
  const attempt = harness('deeper-review');
  const answer = await invoke({question:testQuestion},attempt.run,'web-follow-up-deeper');
  assert.equal(answer.verification.status,'verified');
  assert.equal(answer.verification.attempts,3);
  assert.equal(attempt.searchRequests.length,2);
  assert.deepEqual(attempt.acquiredUrls,[officialDirectory,officialNotice]);
  assert.deepEqual(attempt.scopes.map(({name,effort})=>[name,effort]),[
    ['answer_evidence_review','low'],['correct_grounded_answer','low'],['answer_evidence_review','low'],
    ['correct_grounded_answer','medium'],['answer_evidence_review','medium'],
  ]);
  assert.deepEqual(attempt.scopes.at(-1)?.urls,[officialNotice,officialDirectory]);
});

test('a duplicate result or exhausted follow-up budget cannot turn missing evidence into an answer',async()=>{
  for (const outcome of ['same-source','budget'] as const) {
    const attempt = harness(outcome);
    const answer = await invoke({question:testQuestion},attempt.run,`web-follow-up-${outcome}`);
    assert.equal(answer.status,'abstained');
    assert.equal(answer.verification.status,'unverified');
    assert.deepEqual(answer.citations,[]);
    assert.match(answer.answer,/notice title or a link/);
    assert.doesNotMatch(answer.answer,/supposedly|FORGED|10:30/);
    assert.deepEqual(attempt.acquiredUrls,[officialDirectory]);
    if (outcome === 'same-source') {
      assert.equal(attempt.searchRequests.length,2);
      assert.equal(answer.activity.find((step:{kind:string})=>step.kind==='web-follow-up').status,'unavailable');
    } else {
      assert.equal(attempt.searchRequests.length,1);
      assert.equal(answer.activity.some((step:{kind:string})=>step.kind==='web-follow-up'),false);
    }
  }
});

test('private records and explicit authorization text never trigger the public web search', async () => {
  configured();
  let modelCalls = 0;
  globalThis.fetch = async input => {
    if (String(input).includes('/v1/responses')) modelCalls++;
    return Response.json(null);
  };
  const run = createResearchAssistantHandler({readSources:async()=>{throw Error('No public source read expected');}});
  for (const [index,question] of ['What is my current STU tuition balance?',
    'When does the STU library open? Authorization: Bearer PRIVATE_TEST_AUTH_VALUE'].entries()) {
    const answer = await invoke({question},run,'web-follow-up-private-'+index);
    assert.equal(answer.status,'handoff');
  }
  assert.equal(modelCalls,0);
});
