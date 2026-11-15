import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';
import {readVerificationSources} from '../../server/answerVerificationSources.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';

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

type Progress = {kind:string;label:string;detail:string;status:string};
async function invoke(input: Record<string,unknown>, run: ReturnType<typeof createResearchAssistantHandler>, address: string, progress?: Progress[]) {
  let responseBody: any;
  const response = {
    status(code: number) {
      assert.equal(code,200);
      return response;
    },
    json(value: unknown) { responseBody = value; },
    setHeader() {},
    write(packet: string) {
      const [,event,payload] = /^event: (\w+)\ndata: (.+)\n\n$/u.exec(packet) ?? [];
      if (event === 'progress') progress?.push(JSON.parse(payload));
      if (event === 'result') responseBody = JSON.parse(payload);
    },
    end() {},
  };
  await run({method:'POST',body:{...input,stream:Boolean(progress)},headers:{'x-forwarded-for':address,'user-agent':'research-web-follow-up-test'}},response);
  return responseBody;
}

function harness(outcome: 'new-source'|'deeper-review'|'same-source'|'budget'|'tool-links'|'unreadable-tool-link') {
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
      if (outcome === 'tool-links' || outcome === 'unreadable-tool-link') {
        return Response.json(searchCalls === 1
          ? searchPayload([officialNotice,'https://outside.example.org/campus/'],unsafeDraft,['https://invented.example.org/'])
          : {output:[]});
      }
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
    if (name === 'correct_grounded_answer' || name === 'compose_grounded_answer') {
      if (name === 'compose_grounded_answer') {
        assert.equal(context.previousAnswer,undefined);
        assert.equal(context.unsupportedClaims,undefined);
      }
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
        if (outcome === 'unreadable-tool-link') throw Error('Controlled source read failure');
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
    assert.doesNotMatch(JSON.stringify(fields),/PRIVATE_|NOT_PUBLIC_SEARCH_INPUT|8:00 a\.m\.|my attendance/u);
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

test('independently reads a tool-returned official page even when the search draft invents a link',async()=>{
  const attempt=harness('tool-links');
  const progress:Progress[]=[];
  const answer=await invoke({question:testQuestion},attempt.run,'web-discarded-draft',progress);
  assert.equal(attempt.searchRequests.length,2);
  assert.deepEqual(attempt.acquiredUrls,[officialNotice]);
  assert.deepEqual(attempt.scopes.map(({name})=>name),['compose_grounded_answer','answer_evidence_review']);
  assert.deepEqual(answer.verification,{status:'verified',attempts:1});
  assert.match(answer.answer,/opens at 10:30 a\.m\./u);
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
  assert.doesNotMatch(JSON.stringify(answer),/invented\.example|outside\.example|NOT_PUBLIC_SEARCH_INPUT|supposedly/);
  assert.equal(progress.some(step=>step.kind==='verification-stop'),false);
});

test('an unreadable tool-returned page cannot become an answer or an invented citation',async()=>{
  const attempt=harness('unreadable-tool-link');
  const progress:Progress[]=[];
  const answer=await invoke({question:testQuestion},attempt.run,'web-unreadable-tool-link',progress);
  assert.deepEqual(attempt.acquiredUrls,[officialNotice]);
  assert.deepEqual(attempt.scopes,[]);
  assert.ok(['abstained','handoff'].includes(answer.status));
  assert.deepEqual(answer.citations,[]);
  const stops=progress.filter(step=>step.kind==='verification-stop');
  assert.equal(stops.length,1);
  assert.match(stops[0].detail,/usable evidence/u);
  assert.deepEqual(answer.activity.at(-1),stops[0]);
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

const knowledgeQuestion = 'What time does the STU library archive exhibition open?';
const managedExcerpt = {
  chunk_id:'10000000-0000-4000-8000-000000000001',
  document_id:'20000000-0000-4000-8000-000000000001',
  source_id:'30000000-0000-4000-8000-000000000001',
  source_name:'STU library',authority_level:'primary_official',document_title:'Archive exhibition overview',
  document_domain:'library',document_language:'en',source_url:officialDirectory,source_locator:'section:1',
  effective_at:null,reviewed_at:'2026-01-02T00:00:00Z',content:directoryContent,
  exact_score:0.8,keyword_score:0.7,vector_score:0.6,fused_score:0.2,
  document_version:1,content_checksum:'a'.repeat(64),
};
function managedHarness(outcome: 'verified-web'|'no-web-result'|'budget'|'review-outage'|'early-web'|'verified-knowledge'|'source-switch-repair'|'source-switch-stall') {
  configured();
  const started = Date.now();
  let elapsed = 0;
  Date.now = () => started + elapsed;
  let knowledgeReviews = 0;
  let knowledgeReads = 0;
  const failedRefresh = outcome === 'source-switch-repair' || outcome === 'source-switch-stall';
  const calls: string[] = [];
  const searches: Array<{question:string}> = [];
  const run = createResearchAssistantHandler({
    readSources: async citations => {
      calls.push('read-public-page');
      assert.deepEqual(citations.map(citation=>citation.url),[failedRefresh && searches.length === 1 ? officialDirectory : officialNotice]);
      return citations.map(citation=>({id:citation.chunkId,url:citation.url,content:citation.url===officialDirectory?directoryContent:noticeContent}));
    },
  });
  globalThis.fetch = async (input,init) => {
    const url = String(input);
    if (url.endsWith('/v1/embeddings')) return Response.json({data:[{embedding:Array(1536).fill(0)}]});
    if (url.includes('/rpc/search_public_knowledge')) {
      knowledgeReads++;
      return Response.json(failedRefresh && knowledgeReads > 1 ? [] : [managedExcerpt]);
    }
    if (url.includes('/knowledge_documents?')) return Response.json([{
      id:managedExcerpt.document_id,logical_key:'archive-exhibit',content_checksum:managedExcerpt.content_checksum,
    }]);
    if (url.includes('/rpc/record_public_ai_exchange')) return Response.json([{
      feedback_token:'a'.repeat(64),feedback_expires_at:'2026-12-01T00:00:00Z',
    }]);
    if (!url.endsWith('/v1/responses')) return Response.json(null);
    const request=JSON.parse(String(init?.body));
    const name=request.text.format.name;
    calls.push(name);
    switch(name) {
      case 'public_grounded_answer':
        return provider({status:'answered',answer:outcome==='verified-knowledge'
          ? 'The library visitor directory explains how to contact staff. The directory gives no exhibition opening time.' : unsafeDraft,
          citations:[{chunkId:managedExcerpt.chunk_id,claim:'Archive exhibition opening'}],suggestedQuestions:[]});
      case 'correct_grounded_answer': {
        const repair=JSON.parse(request.input[0].content[0].text);
        if (failedRefresh) {
          assert.equal(outcome,'source-switch-repair');
          assert.equal(request.reasoning.effort,'medium');
          const notice=repair.evidence.find((item: {url:string})=>item.url===officialNotice);
          assert.equal(notice.content,noticeContent);
          return provider({status:'answered',answer:noticeContent,sourceIds:[notice.id]});
        }
        return provider({status:'answered',answer:unsafeDraft,sourceIds:[managedExcerpt.chunk_id]});
      }
      case 'stu_web_answer':
        searches.push(JSON.parse(request.input));
        if (outcome==='no-web-result'||outcome==='early-web') return Response.json({output:[]});
        if (failedRefresh && searches.length===1) return Response.json(searchPayload([officialDirectory],unsafeDraft));
        if (outcome==='source-switch-stall') return Response.json(searchPayload([officialDirectory+'?utm_source=retry'],unsafeDraft));
        return Response.json(searchPayload([officialNotice],noticeContent));
      case 'answer_evidence_review': {
        const review=JSON.parse(request.input[0].content[0].text);
        if (review.evidence[0].id!==managedExcerpt.chunk_id) {
          if (failedRefresh && review.evidence[0].url===officialDirectory) {
            // The reviewer rejects the draft without concrete repair guidance.
            // Only new independently read material can justify another check.
            return provider({supported:false,answersQuestion:false,claims:[]});
          }
          if (failedRefresh) {
            assert.equal(request.reasoning.effort,'medium');
            assert.equal(review.evidence[0].content,noticeContent);
            return provider({supported:true,answersQuestion:true,claims:[{
              claim:'Exhibition time and date',supported:true,evidenceId:review.evidence[0].id,quotes:[noticeContent],jsonPaths:[],
            }]});
          }
          assert.equal(review.evidence.length,1);
          assert.equal(review.evidence[0].content,noticeContent);
          return provider({supported:true,answersQuestion:true,claims:[{
            claim:'Exhibition time and date',supported:true,evidenceId:review.evidence[0].id,quotes:[noticeContent],jsonPaths:[],
          }]});
        }
        knowledgeReviews++;
        if(outcome==='budget'&&knowledgeReviews===2)elapsed=32_000;
        if(outcome==='verified-web'&&knowledgeReviews===2)elapsed=25_000;
        if(outcome==='review-outage')return new Response(null,{status:503});
        if(outcome==='verified-knowledge')return provider({supported:true,answersQuestion:true,claims:[{
          claim:'Verified managed content',supported:true,evidenceId:managedExcerpt.chunk_id,quotes:[],jsonPaths:['/content'],
        }]});
        return provider({supported:false,answersQuestion:false,claims:[{
          claim:rejectedClaim,supported:false,evidenceId:managedExcerpt.chunk_id,quotes:[],jsonPaths:[],
        }]});
      }
      default:
        throw Error('Unexpected controlled provider request '+name);
    }
  };
  return {run,searches,calls};
}

test('two failed managed checks can switch to separately read public evidence within the same check budget',async()=>{
  const attempt=managedHarness('verified-web');
  const progress:Progress[]=[];
  const answer=await invoke({question:knowledgeQuestion,history:[
    {role:'user',content:'What are my attendance records at STU?'},
    {role:'assistant',content:'PRIVATE_ASSISTANT_HISTORY: account attendance and grades'},
  ]},attempt.run,'knowledge-verified-web',progress);
  assert.deepEqual(attempt.calls,[
    'public_grounded_answer','answer_evidence_review','correct_grounded_answer','answer_evidence_review',
    'stu_web_answer','read-public-page','answer_evidence_review',
  ]);
  assert.equal(attempt.searches.length,1);
  assert.equal(attempt.searches[0].question,knowledgeQuestion);
  assert.doesNotMatch(JSON.stringify(attempt.searches),/PRIVATE_|NOT_PUBLIC_SEARCH_INPUT|8:00 a\.m\.|my attendance/u);
  assert.equal(answer.status,'answered');
  assert.equal(answer.grounding.source,'web');
  assert.deepEqual(answer.verification,{status:'verified',attempts:3});
  assert.match(answer.answer,/opens at 10:30 a\.m\./u);
  assert.doesNotMatch(answer.answer,/supposedly|PRIVATE_REVIEW_FEEDBACK/);
  assert.deepEqual(answer.citations.map((citation:{url:string})=>citation.url),[officialNotice]);
  const checks=[
    ['verification-1','unavailable'],['verification-retry','complete'],['verification-2','unavailable'],
    ['verification-source-switch','complete'],['verification-3','complete'],
  ];
  const finalSteps=(steps:Progress[])=>steps.filter(step=>step.status!=='running'&&/^verification-/u.test(step.kind))
    .map(({kind,status})=>[kind,status]);
  assert.deepEqual(finalSteps(answer.activity),checks);
  assert.deepEqual(finalSteps(progress),checks);
});

test('an attempted evidence switch preserves both managed checks when the web search finds no candidate',async()=>{
  const attempt=managedHarness('no-web-result');
  const answer=await invoke({question:knowledgeQuestion},attempt.run,'knowledge-no-web-result');
  assert.equal(answer.status,'abstained');
  assert.equal(answer.grounding.source,'knowledge');
  assert.equal(answer.grounding.webSearched,true);
  assert.equal(answer.verification.attempts,2);
  assert.deepEqual(answer.citations,[]);
  assert.equal(attempt.searches.length,2,'one web lookup tries official sources then broader results');
  assert.deepEqual(answer.activity.map(({kind}:Progress)=>kind),
    ['knowledge','verification-1','verification-retry','verification-2','verification-source-switch','web','verification-stop']);
  assert.equal(answer.activity.at(-1).status,'unavailable');
});

test('one completed managed check leaves room to verify a more specific page after a source switch',async()=>{
  const attempt=managedHarness('source-switch-repair');
  const progress:Progress[]=[];
  const answer=await invoke({question:knowledgeQuestion},attempt.run,'knowledge-source-switch-repair',progress);
  assert.deepEqual(attempt.calls,[
    'public_grounded_answer','answer_evidence_review','stu_web_answer','read-public-page','answer_evidence_review',
    'stu_web_answer','read-public-page','correct_grounded_answer','answer_evidence_review',
  ]);
  assert.deepEqual(attempt.searches.map(({question})=>question),[knowledgeQuestion,knowledgeQuestion]);
  assert.deepEqual(answer.verification,{status:'verified',attempts:3});
  assert.match(answer.answer,/opens at 10:30 a\.m\./u);
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
  assert.deepEqual(answer.activity.filter(({kind}: Progress)=>/^verification-\d+$/u.test(kind)).map(({kind}: Progress)=>kind),
    ['verification-1','verification-2','verification-3']);
  assert.ok(answer.activity.some(({kind}: Progress)=>kind==='verification-preparation-2'));
  assert.equal(progress.some(step=>step.kind==='verification-stop'),false);
});

test('duplicate pages and no actionable feedback stop a source switch without spending the remaining check',async()=>{
  const attempt=managedHarness('source-switch-stall');
  const progress:Progress[]=[];
  const answer=await invoke({question:knowledgeQuestion},attempt.run,'knowledge-source-switch-stall',progress);
  assert.deepEqual(attempt.calls,[
    'public_grounded_answer','answer_evidence_review','stu_web_answer','read-public-page','answer_evidence_review','stu_web_answer',
  ]);
  assert.equal(answer.status,'abstained');
  assert.equal(answer.verification.attempts,2);
  assert.deepEqual(answer.citations,[]);
  const stops=progress.filter(step=>step.kind==='verification-stop');
  assert.equal(stops.length,1);
  assert.match(stops[0].detail,/usable evidence/u);
  assert.deepEqual(answer.activity.at(-1),stops[0]);
  assert.deepEqual(answer.activity.filter(({kind}: Progress)=>/^verification-\d+$/u.test(kind)).map(({kind}: Progress)=>kind),
    ['verification-1','verification-2']);
  assert.ok(answer.activity.some(({kind}: Progress)=>kind==='verification-preparation-3'));
  const restored=sanitizeStoredConversation([{id:'a-stop',role:'assistant',content:answer.answer,activity:answer.activity,result:answer}]);
  assert.deepEqual(restored[0].activity.at(-1),stops[0]);
  assert.deepEqual(restored[0].result.activity.at(-1),stops[0]);
});

test('an already attempted web lookup, expired reserve or verifier outage does not trigger a new source switch',async()=>{
  for(const outcome of ['early-web','budget','review-outage','verified-knowledge'] as const){
    const attempt=managedHarness(outcome);
    const answer=await invoke({question:outcome==='early-web'?testQuestion:knowledgeQuestion},attempt.run,'knowledge-'+outcome);
    assert.equal(answer.grounding.source,'knowledge',outcome);
    assert.equal(answer.status,outcome==='verified-knowledge'?'answered':'abstained',outcome);
    assert.equal(attempt.searches.length,outcome==='early-web'?2:0,outcome);
    assert.equal(answer.activity.some((step:Progress)=>step.kind==='verification-source-switch'),false,outcome);
    if (outcome==='budget') assert.match(answer.activity.at(-1).detail,/too little time/u);
    if (outcome==='review-outage') assert.match(answer.activity.at(-1).detail,/checker could not complete/u);
  }
});
