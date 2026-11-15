import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {createResearchAssistantHandler} from '../../api/research-assistant.ts';
import {readVerificationSources} from '../../server/answerVerificationSources.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';

const officialDirectory = 'https://www.lib.stu.edu.tw/visitor-information/';
const officialNotice = 'https://www.lib.stu.edu.tw/2026-archive-exhibit/';
const officialOffice = 'https://www.lib.stu.edu.tw/archive-office/';
const eventCalendar = 'https://www.lib.stu.edu.tw/archive-calendar/';
const officeContent = 'The archive office will open the exhibition in November, with hours to be announced.';
const calendarContent = 'The library lists the archive exhibition on November 24 and refers visitors to the organizer for hours.';
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
async function invoke(input: Record<string,unknown>, run: ReturnType<typeof createResearchAssistantHandler>, address: string, progress?: Progress[], deadline?:number) {
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
  await run({method:'POST',body:{...input,stream:Boolean(progress)},headers:{'x-forwarded-for':address,'user-agent':'research-web-follow-up-test'}},response,deadline===undefined?undefined:{deadline});
  return responseBody;
}

function harness(outcome: 'new-source'|'deeper-review'|'same-source'|'budget'|'tool-links'|'unreadable-tool-link'|'unused-tool-lead'|'third-pass-discovery'|'incomplete-office'|'fourth-check'|'fourth-rejected'|'fourth-budget'|'mirror'|'transient-lead'|'transient-initial'|'transient-uncited') {
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
      if (outcome === 'tool-links' || outcome === 'unreadable-tool-link' || outcome === 'transient-uncited') {
        return Response.json(searchCalls === 1
          ? searchPayload([officialNotice,'https://outside.example.org/campus/'],unsafeDraft,['https://invented.example.org/'])
          : {output:[]});
      }
      if (outcome === 'transient-initial') {
        assert.equal(searchCalls,1);
        return Response.json(searchPayload([officialNotice],unsafeDraft));
      }
      if (searchCalls === 1) return Response.json(outcome === 'unused-tool-lead'
        ? searchPayload([officialDirectory,officialNotice,'https://outside.example.org/campus/'],unsafeDraft,[officialDirectory])
        : searchPayload([officialDirectory],unsafeDraft));
      if (outcome === 'transient-lead' || (outcome === 'deeper-review' && searchCalls === 3))
        return Response.json(searchPayload([officialDirectory,officialNotice],unsafeDraft));
      if (outcome === 'incomplete-office' || outcome === 'fourth-check' || outcome === 'fourth-rejected' || outcome === 'fourth-budget' || outcome === 'mirror') {
        const source = searchCalls === 2 ? officialOffice
          : searchCalls === 3 && outcome !== 'incomplete-office' ? eventCalendar : officialNotice;
        return Response.json(searchPayload([source],unsafeDraft));
      }
      if (outcome === 'same-source' || (outcome === 'third-pass-discovery' && searchCalls === 2))
        return Response.json(searchPayload([officialDirectory+'?utm_source=retry'],noticeContent));
      if (outcome === 'third-pass-discovery' && searchCalls === 3)
        return Response.json(searchPayload([officialDirectory,officialNotice],unsafeDraft,[officialDirectory]));
      assert.equal(searchCalls,2);
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
    if (outcome === 'fourth-budget' && reviewCalls === 3) elapsed = 47_000;
    if (outcome === 'third-pass-discovery' && reviewCalls === 2)
      return provider({supported:false,answersQuestion:false,claims:[]});
    if (!source || outcome === 'fourth-rejected' || outcome === 'deeper-review' && reviewCalls === 2) {
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
        if (outcome === 'unreadable-tool-link' || ((outcome === 'transient-lead' || outcome === 'transient-initial' || outcome === 'transient-uncited') && url === officialNotice
          && acquiredUrls.filter(visited => visited === officialNotice).length === 1)) throw Error('Controlled source read failure');
        const content = new Map([
          [officialDirectory,directoryContent], [officialNotice,noticeContent], [officialOffice,officeContent],
          [eventCalendar,outcome === 'mirror' ? officeContent : calendarContent],
        ]).get(url);
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

test('a deeper third review looks for more evidence and can still correct a draft using previously read sources', async () => {
  const attempt = harness('deeper-review');
  const answer = await invoke({question:testQuestion},attempt.run,'web-follow-up-deeper');
  assert.equal(answer.verification.status,'verified');
  assert.equal(answer.verification.attempts,3);
  assert.equal(attempt.searchRequests.length,3);
  assert.deepEqual(attempt.acquiredUrls,[officialDirectory,officialNotice]);
  assert.deepEqual(attempt.scopes.map(({name,effort})=>[name,effort]),[
    ['answer_evidence_review','low'],['correct_grounded_answer','low'],['answer_evidence_review','low'],
    ['correct_grounded_answer','medium'],['answer_evidence_review','medium'],
  ]);
  assert.deepEqual(attempt.scopes.at(-1)?.urls,[officialNotice,officialDirectory]);
});

test('an uncited official tool lead is independently read before repeating search', async () => {
  const attempt = harness('unused-tool-lead');
  const answer = await invoke({question:testQuestion},attempt.run,'web-unused-tool-lead');
  assert.equal(attempt.searchRequests.length,1);
  assert.deepEqual(attempt.acquiredUrls,[officialDirectory,officialNotice]);
  assert.deepEqual(answer.verification,{status:'verified',attempts:2});
  assert.match(answer.answer,/opens at 10:30 a\.m\./u);
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
  assert.equal(answer.activity.find(({kind}: Progress)=>kind==='web-alternate-source').status,'complete');
  assert.doesNotMatch(JSON.stringify(answer),/outside\.example|NOT_PUBLIC_SEARCH_INPUT/);
});

test('two rejected drafts can discover and check a primary source even without new reviewer feedback', async () => {
  const attempt = harness('third-pass-discovery');
  const progress:Progress[] = [];
  const answer = await invoke({question:testQuestion},attempt.run,'web-third-pass-discovery',progress);
  assert.equal(attempt.searchRequests.length,3);
  assert.match(String(attempt.searchRequests[2].instructions),/Change the search approach/);
  assert.deepEqual(attempt.searchRequests[2].reasoning,{effort:'medium'});
  for (const request of attempt.searchRequests) {
    assert.equal(JSON.parse(String(request.input)).question,testQuestion);
    assert.doesNotMatch(String(request.input),/PRIVATE_REVIEW_FEEDBACK|NOT_PUBLIC_SEARCH_INPUT/);
  }
  assert.deepEqual(attempt.acquiredUrls,[officialDirectory,officialNotice]);
  assert.deepEqual(answer.verification,{status:'verified',attempts:3});
  assert.match(answer.answer,/opens at 10:30 a\.m\./u);
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
  assert.deepEqual(progress.filter(({kind,status})=>/^verification-\d+$/u.test(kind)&&status!=='running').map(({kind,status})=>[kind,status]),
    [['verification-1','unavailable'],['verification-2','unavailable'],['verification-3','complete']]);
  const restored=sanitizeStoredConversation([{id:'recovered',role:'assistant',content:answer.answer,activity:answer.activity,result:answer}]);
  assert.equal(restored[0].activity.find(({kind}: Progress)=>kind==='web-deeper-discovery').status,'complete');
  assert.equal(restored[0].result.verification.attempts,3);
});

test('a fresh but incomplete office page does not prevent discovery of the primary notice', async () => {
  const attempt = harness('incomplete-office');
  const progress: Progress[] = [];
  const answer = await invoke({question:testQuestion},attempt.run,'web-incomplete-office',progress);
  assert.deepEqual(attempt.acquiredUrls,[officialDirectory,officialOffice,officialNotice]);
  assert.equal(attempt.searchRequests.length,3);
  assert.deepEqual(answer.verification,{status:'verified',attempts:3});
  assert.match(answer.answer,/opens at 10:30 a\.m\./u);
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
  assert.equal(progress.some(({kind})=>kind==='verification-stop'),false);
});

test('the fourth check follows a different strategy after three incomplete drafts and survives saved-chat reload', async () => {
  const attempt = harness('fourth-check');
  const progress: Progress[] = [];
  const answer = await invoke({question:testQuestion},attempt.run,'web-fourth-check',progress);
  assert.deepEqual(attempt.acquiredUrls,[officialDirectory,officialOffice,eventCalendar,officialNotice]);
  assert.equal(attempt.searchRequests.length,4);
  assert.match(String(attempt.searchRequests[3].instructions),/independent official publication/u);
  for (const request of attempt.searchRequests) {
    assert.equal(JSON.parse(String(request.input)).question,testQuestion);
    assert.doesNotMatch(String(request.input),/PRIVATE_REVIEW_FEEDBACK|NOT_PUBLIC_SEARCH_INPUT/u);
  }
  assert.deepEqual(answer.verification,{status:'verified',attempts:4});
  assert.match(answer.answer,/opens at 10:30 a\.m\./u);
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
  assert.deepEqual(progress.filter(({kind,status})=>/^verification-\d+$/u.test(kind)&&status!=='running').map(({kind,status})=>[kind,status]),
    [['verification-1','unavailable'],['verification-2','unavailable'],['verification-3','unavailable'],['verification-4','complete']]);
  assert.equal(progress.some(({kind})=>kind==='verification-stop'),false);
  const restored=sanitizeStoredConversation([{id:'fourth',role:'assistant',content:answer.answer,activity:answer.activity,result:answer}]);
  assert.equal(restored[0].result.verification.attempts,4);
  assert.equal(restored[0].activity.find(({kind}:Progress)=>kind==='verification-4').status,'complete');
});

test('a public handler with an expired caller budget reports the stop without calling a provider',async()=>{
  configured();
  let requests=0;
  globalThis.fetch=async()=>{requests++;return Response.json(null);};
  const progress:Progress[]=[];
  const answer=await invoke({question:testQuestion,deadline:Date.now()+120_000},createResearchAssistantHandler(),
    'web-outer-deadline',progress,Date.now()+1);
  assert.equal(requests,0);
  assert.deepEqual(answer.verification,{status:'unverified',attempts:0,reason:'timeout'});
  assert.deepEqual(progress.filter(({kind})=>kind==='verification-stop'),answer.activity);
  assert.match(answer.activity.at(-1).detail,/too little time/u);
});

test('an additional source never bypasses the fourth verdict or the remaining time', async () => {
  for (const scenario of ['fourth-rejected','fourth-budget'] as const) {
    const attempt = harness(scenario);
    const progress: Progress[] = [];
    const answer = await invoke({question:testQuestion},attempt.run,'web-'+scenario,progress);
    const hasTime = scenario === 'fourth-rejected';
    assert.equal(attempt.searchRequests.length,hasTime ? 4 : 3);
    assert.equal(answer.verification.attempts,hasTime ? 4 : 3);
    assert.equal(answer.verification.status,'unverified');
    assert.deepEqual(answer.citations,[]);
    assert.doesNotMatch(answer.answer,/10:30|8:00/u);
    const stops = progress.filter(({kind})=>kind==='verification-stop');
    assert.equal(stops.length,1);
    assert.match(stops[0].detail,hasTime ? /details still unverified/u : /too little time/u);
  }
});

test('a mirrored page supplies no new lead for a fourth review', async () => {
  const attempt = harness('mirror');
  const progress: Progress[] = [];
  const answer=await invoke({question:testQuestion},attempt.run,'web-mirrored-evidence',progress);
  assert.deepEqual(attempt.acquiredUrls,[officialDirectory,officialOffice,eventCalendar]);
  assert.equal(attempt.searchRequests.length,3);
  assert.equal(answer.verification.status,'unverified');
  assert.equal(answer.verification.attempts,3);
  assert.deepEqual(answer.citations,[]);
  const stops = progress.filter(({kind})=>kind==='verification-stop');
  assert.equal(stops.length,1);
  assert.match(stops[0].detail,/additional usable evidence/u);
});

test('a transient read failure does not discard the safe notice URL permanently', async () => {
  const attempt = harness('transient-lead');
  const answer=await invoke({question:testQuestion},attempt.run,'web-transient-lead');
  assert.deepEqual(attempt.acquiredUrls,[officialDirectory,officialNotice,officialNotice]);
  assert.equal(answer.verification.status,'verified');
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
});

test('a timed-out initially cited page can be reread without a duplicate search', async () => {
  const attempt = harness('transient-initial');
  const answer=await invoke({question:testQuestion},attempt.run,'web-transient-initial');
  assert.equal(attempt.searchRequests.length,1);
  assert.deepEqual(attempt.acquiredUrls,[officialNotice,officialNotice]);
  assert.equal(answer.verification.status,'verified');
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
});

test('a source discovered before the first draft remains eligible after a transient read failure',async()=>{
  const attempt=harness('transient-uncited');
  const progress:Progress[]=[];
  const answer=await invoke({question:testQuestion},attempt.run,'web-transient-before-first-draft',progress);
  assert.deepEqual(attempt.acquiredUrls,[officialNotice,officialNotice]);
  assert.deepEqual(answer.verification,{status:'verified',attempts:1});
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
  assert.ok(answer.activity.some(({kind,status}:Progress)=>kind==='web-bootstrap-reread'&&status==='complete'));
  assert.equal(progress.some(({kind})=>kind==='verification-stop'),false);
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
      assert.equal(attempt.searchRequests.length,3);
      assert.equal(answer.activity.find((step:{kind:string})=>step.kind==='web-follow-up').status,'unavailable');
      assert.equal(answer.activity.find((step:{kind:string})=>step.kind==='web-deeper-discovery').status,'unavailable');
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
  assert.deepEqual(attempt.acquiredUrls,[officialNotice,officialNotice]);
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
function managedHarness(outcome: 'verified-web'|'no-web-result'|'budget'|'review-outage'|'early-web'|'early-web-recovery'|'verified-knowledge'|'source-switch-repair'|'source-switch-stall'|'final-check-lead'|'bootstrap-reread'|'bootstrap-next-lead'|'bootstrap-unreadable'|'bootstrap-budget'|'bootstrap-alternate') {
  configured();
  const started = Date.now();
  let elapsed = 0;
  Date.now = () => started + elapsed;
  let knowledgeReviews = 0;
  let knowledgeReads = 0;
  const failedRefresh = outcome === 'source-switch-repair' || outcome === 'source-switch-stall';
  const bootstrap = outcome.startsWith('bootstrap-');
  const leadOnly = outcome === 'final-check-lead' || bootstrap;
  const otherLeads = [1,2,3,4].map(number => 'https://lib.stu.edu.tw/news/secondary-' + number);
  const reads: string[][] = [];
  const calls: string[] = [];
  const searches: Array<{question:string}> = [];
  const run = createResearchAssistantHandler({
    readSources: async citations => {
      calls.push('read-public-page');
      const urls=citations.map(citation=>citation.url);
      reads.push(urls);
      if(outcome==='bootstrap-alternate'){
        assert.deepEqual(urls,reads.length<=2?[eventCalendar,officialDirectory]:[officialNotice]);
        return citations.filter(citation=>citation.url===officialNotice).map(citation=>({id:citation.chunkId,url:citation.url,content:noticeContent}));
      }
      if(outcome==='bootstrap-next-lead'){
        if(reads.length===1){assert.deepEqual(urls,otherLeads);return [];}
        assert.deepEqual(urls,[officialNotice,officialDirectory,...otherLeads.slice(0,2)]);
        return citations.filter(citation=>citation.url===officialNotice).map(citation=>({id:citation.chunkId,url:citation.url,content:noticeContent}));
      }
      assert.deepEqual(urls,leadOnly?[officialNotice,officialDirectory]:
        [failedRefresh && searches.length === 1 ? officialDirectory : officialNotice]);
      if(outcome==='bootstrap-budget'){elapsed=44_001;return [];}
      if(outcome==='bootstrap-unreadable'||outcome==='bootstrap-reread'&&reads.length===1)return [];
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
        if (outcome==='no-web-result'||outcome==='early-web'||(outcome==='early-web-recovery'&&searches.length<3))
          return Response.json({output:[]});
        if (outcome==='early-web-recovery') {
          assert.match(request.instructions,/Change the search approach/u);
          assert.doesNotMatch(request.input,/PRIVATE_REVIEW_FEEDBACK|NOT_PUBLIC_SEARCH_INPUT/u);
        }
        if (outcome==='bootstrap-alternate') {
          if (searches.length===1)
            return Response.json(searchPayload([officialDirectory,eventCalendar],unsafeDraft,[officialDirectory]));
          assert.match(request.instructions,/independent official publication/u);
          assert.doesNotMatch(request.input,/PRIVATE_REVIEW_FEEDBACK|NOT_PUBLIC_SEARCH_INPUT/u);
          return Response.json(searchPayload([officialNotice],unsafeDraft));
        }
        if (outcome==='bootstrap-unreadable'&&searches.length>1) return Response.json({output:[]});
        if (leadOnly) return Response.json(searchPayload([officialDirectory,...(outcome==='bootstrap-next-lead'?otherLeads:[]),officialNotice],unsafeDraft,[officialDirectory]));
        if (failedRefresh && searches.length===1) return Response.json(searchPayload([officialDirectory],unsafeDraft));
        if (outcome==='source-switch-stall') return Response.json(searchPayload([officialDirectory+'?utm_source=retry'],unsafeDraft));
        return Response.json(searchPayload([officialNotice],noticeContent));
      case 'compose_grounded_answer': {
        assert.ok(leadOnly||outcome==='early-web-recovery');
        const local=JSON.parse(request.input[0].content[0].text);
        assert.equal(local.evidence[0].content,noticeContent);
        assert.doesNotMatch(JSON.stringify(local),/NOT_PUBLIC_SEARCH_INPUT/);
        return provider({status:'answered',answer:noticeContent,sourceIds:[local.evidence[0].id]});
      }
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
          assert.equal(review.evidence.length,leadOnly&&outcome!=='bootstrap-next-lead'&&outcome!=='bootstrap-alternate'?2:1);
          assert.equal(review.evidence[0].content,noticeContent);
          return provider({supported:true,answersQuestion:true,claims:[{
            claim:'Exhibition time and date',supported:true,evidenceId:review.evidence[0].id,quotes:[noticeContent],jsonPaths:[],
          }]});
        }
        knowledgeReviews++;
        if(outcome==='budget'&&knowledgeReviews===2)elapsed=32_000;
        if(outcome==='verified-web'&&knowledgeReviews===2)elapsed=25_000;
        if(outcome==='early-web-recovery'&&knowledgeReviews===2)elapsed=32_000;
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
  return {run,searches,calls,reads};
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

test('the last remaining check uses an uncited lead instead of repeating the search provider draft',async()=>{
  const attempt=managedHarness('final-check-lead');
  const answer=await invoke({question:knowledgeQuestion},attempt.run,'knowledge-final-check-lead');
  assert.deepEqual(attempt.calls,[
    'public_grounded_answer','answer_evidence_review','correct_grounded_answer','answer_evidence_review',
    'stu_web_answer','read-public-page','compose_grounded_answer','answer_evidence_review',
  ]);
  assert.deepEqual(answer.verification,{status:'verified',attempts:3});
  assert.match(answer.answer,/opens at 10:30 a\.m\./u);
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
  assert.equal(answer.activity.find(({kind}: Progress)=>kind==='web-alternate-source').status,'complete');
});

test('the last managed recovery check can retry the safe source read or advance to the next uncited lead',async()=>{
  for(const scenario of ['bootstrap-reread','bootstrap-next-lead'] as const){
    const attempt=managedHarness(scenario),progress:Progress[]=[];
    const answer=await invoke({question:knowledgeQuestion},attempt.run,'knowledge-'+scenario,progress);
    assert.equal(attempt.searches.length,1,scenario);
    assert.equal(attempt.reads.length,2,scenario);
    assert.deepEqual(attempt.calls,[
      'public_grounded_answer','answer_evidence_review','correct_grounded_answer','answer_evidence_review',
      'stu_web_answer','read-public-page','read-public-page','compose_grounded_answer','answer_evidence_review',
    ],scenario);
    assert.deepEqual(answer.verification,{status:'verified',attempts:3},scenario);
    assert.match(answer.answer,/opens at 10:30 a\.m\./u);
    assert.doesNotMatch(answer.answer,/supposedly/u);
    assert.deepEqual(answer.citations.map((citation:{url:string})=>citation.url),[officialNotice]);
    assert.equal(progress.filter(step=>step.kind==='web-bootstrap-reread'&&step.status==='complete').length,1);
    const saved=sanitizeStoredConversation([{id:'bootstrap',role:'assistant',content:answer.answer,activity:answer.activity,result:answer}]);
    assert.equal(saved[0].activity.filter((step:Progress)=>step.kind==='web-bootstrap-reread'&&step.status==='complete').length,1);
  }
});

test('two rejected managed drafts can reach an alternate publication after rereading an unreadable lead',async()=>{
  const attempt=managedHarness('bootstrap-alternate'),progress:Progress[]=[];
  const answer=await invoke({question:knowledgeQuestion},attempt.run,'knowledge-bootstrap-alternate',progress);
  assert.deepEqual(attempt.searches.map(({question})=>question),[knowledgeQuestion,knowledgeQuestion]);
  assert.deepEqual(attempt.reads,[[eventCalendar,officialDirectory],[eventCalendar,officialDirectory],[officialNotice]]);
  assert.deepEqual(answer.verification,{status:'verified',attempts:3});
  assert.match(answer.answer,/opens at 10:30 a\.m\./u);
  assert.deepEqual(answer.citations.map(({url}: {url:string})=>url),[officialNotice]);
  assert.doesNotMatch(answer.answer,/supposedly|PRIVATE_REVIEW_FEEDBACK/u);
  assert.equal(answer.activity.filter(({kind,status}:Progress)=>kind==='web-bootstrap-discovery'&&status==='complete').length,1);
  const saved=sanitizeStoredConversation([{id:'new-publication',role:'assistant',content:answer.answer,activity:answer.activity,result:answer}]);
  assert.equal(saved[0].activity.filter((step:Progress)=>step.kind==='web-bootstrap-discovery'&&step.status==='complete').length,1);
  assert.equal(progress.some(({kind})=>kind==='verification-stop'),false);
});

test('bootstrap recovery stops truthfully when its second read is empty or the verification reserve is exhausted',async()=>{
  for(const scenario of ['bootstrap-unreadable','bootstrap-budget'] as const){
    const attempt=managedHarness(scenario),progress:Progress[]=[];
    const answer=await invoke({question:knowledgeQuestion},attempt.run,'knowledge-'+scenario,progress);
    assert.equal(attempt.searches.length,scenario==='bootstrap-unreadable'?2:1);
    assert.equal(attempt.reads.length,scenario==='bootstrap-unreadable'?2:1);
    assert.equal(answer.status,'abstained');
    assert.equal(answer.verification.attempts,2);
    assert.deepEqual(answer.citations,[]);
    assert.doesNotMatch(answer.answer,/supposedly/u);
    const stops=progress.filter(step=>step.kind==='verification-stop');
    assert.equal(stops.length,1);
    assert.match(stops[0].detail,scenario==='bootstrap-budget'?/time left/u:/usable evidence/u);
    assert.deepEqual(answer.activity.at(-1),stops[0]);
    if(scenario==='bootstrap-unreadable'){
      const saved=sanitizeStoredConversation([{id:'empty-bootstrap',role:'assistant',content:answer.answer,activity:answer.activity,result:answer}]);
      assert.equal(saved[0].activity.filter((step:Progress)=>step.kind==='web-bootstrap-reread'&&step.status==='unavailable').length,1);
    }
  }
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

test('an empty early search keeps a targeted source switch after two failed managed checks',async()=>{
  const attempt=managedHarness('early-web-recovery');
  const progress:Progress[]=[];
  const answer=await invoke({question:testQuestion},attempt.run,'knowledge-web-without-leads',progress);
  assert.deepEqual(attempt.calls,[
    'stu_web_answer','stu_web_answer','public_grounded_answer','answer_evidence_review','correct_grounded_answer',
    'answer_evidence_review','stu_web_answer','read-public-page','compose_grounded_answer','answer_evidence_review',
  ]);
  assert.deepEqual(answer.verification,{status:'verified',attempts:3});
  assert.deepEqual(answer.citations.map(({url}:{url:string})=>url),[officialNotice]);
  assert.equal(answer.activity.find(({kind}:Progress)=>kind==='web').status,'unavailable');
  assert.equal(answer.activity.find(({kind}:Progress)=>kind==='web-after-empty').status,'complete');
  assert.equal(progress.some(({kind})=>kind==='verification-stop'),false);
});

test('an empty follow-up, expired reserve or verifier outage stops without repeated source switches',async()=>{
  for(const outcome of ['early-web','budget','review-outage','verified-knowledge'] as const){
    const attempt=managedHarness(outcome);
    const answer=await invoke({question:outcome==='early-web'?testQuestion:knowledgeQuestion},attempt.run,'knowledge-'+outcome);
    assert.equal(answer.grounding.source,'knowledge',outcome);
    assert.equal(answer.status,outcome==='verified-knowledge'?'answered':'abstained',outcome);
    assert.equal(attempt.searches.length,outcome==='early-web'?3:0,outcome);
    assert.equal(answer.activity.some((step:Progress)=>step.kind==='verification-source-switch'),outcome==='early-web',outcome);
    if (outcome==='budget') assert.match(answer.activity.at(-1).detail,/too little time/u);
    if (outcome==='review-outage') assert.match(answer.activity.at(-1).detail,/checker could not complete/u);
  }
});

test('a gated original notice can still lead to a separate public publication after two empty searches',async()=>{
  const question='Find the latest STU announcement about OneDrive storage quotas for students. What quota and publication date does it give?';
  const originalNotice='https://dtm.stu.edu.tw/mod/page/view.php?id=625803';
  const secondPublication='https://www.cc.stu.edu.tw/notice/onedrive-public-test/';
  const contents='The student OneDrive allocation is 25 GB. This computing center notice was published on May 12, 2026.';
  for(const scenario of ['new-publication','empty','no-time','not-gated'] as const){
    configured();
    const started=originalNow();
    let elapsed=0,searches=0,managedReviews=0;
    Date.now=()=>started+elapsed;
    const readUrls:string[]=[];
    const run=createResearchAssistantHandler({readSources:async(citations,_deadline,options)=>citations.flatMap(citation=>{
      readUrls.push(citation.url);
      if(citation.url===originalNotice){
        if(scenario!=='not-gated')options?.onAccessRequired?.({url:originalNotice,title:'Microsoft 365 and OneDrive storage quotas'});
        return [];
      }
      assert.equal(citation.url,secondPublication);
      return [{id:citation.chunkId,url:citation.url,content:contents}];
    })});
    globalThis.fetch=async(input,init)=>{
      const url=String(input);
      if(url.endsWith('/v1/embeddings'))return Response.json({data:[{embedding:Array(1536).fill(0)}]});
      if(url.includes('/rpc/search_public_knowledge'))return Response.json([managedExcerpt]);
      if(url.includes('/knowledge_documents?'))return Response.json([{
        id:managedExcerpt.document_id,logical_key:'unrelated-archive',content_checksum:managedExcerpt.content_checksum,
      }]);
      if(url.includes('/rpc/record_public_ai_exchange'))return Response.json([{
        feedback_token:'a'.repeat(64),feedback_expires_at:'2026-12-01T00:00:00Z',
      }]);
      if(!url.endsWith('/v1/responses'))return Response.json(null);
      const request=JSON.parse(String(init?.body));
      const name=request.text.format.name;
      if(name==='stu_web_answer'){
        searches++;
        assert.doesNotMatch(request.input,/PRIVATE_REVIEW_FEEDBACK|NOT_PUBLIC_SEARCH_INPUT|625803/u);
        if(searches===3)elapsed=scenario==='no-time'?43_000:36_000;
        if(searches!==4)return Response.json({output:[]});
        assert.match(request.instructions,/independent official publication/u);
        return Response.json(scenario==='new-publication'?searchPayload([secondPublication],unsafeDraft):{output:[]});
      }
      if(name==='public_grounded_answer')return provider({status:'answered',answer:unsafeDraft,
        citations:[{chunkId:managedExcerpt.chunk_id,claim:'Storage claim'}],suggestedQuestions:[]});
      if(name==='correct_grounded_answer')return provider({status:'answered',answer:unsafeDraft,sourceIds:[managedExcerpt.chunk_id]});
      const payload=JSON.parse(request.input[0].content[0].text);
      if(name==='compose_grounded_answer'){
        assert.equal(payload.evidence[0].url,secondPublication);
        assert.equal(payload.evidence[0].content,contents);
        return provider({status:'answered',answer:contents,sourceIds:[payload.evidence[0].id]});
      }
      assert.equal(name,'answer_evidence_review');
      const evidence=payload.evidence[0];
      if(evidence.id===managedExcerpt.chunk_id){
        if(++managedReviews===2)elapsed=32_000;
        return provider({supported:false,answersQuestion:false,claims:[{claim:rejectedClaim,supported:false,
          evidenceId:evidence.id,quotes:[],jsonPaths:[]}]});
      }
      assert.equal(evidence.url,secondPublication);
      return provider({supported:true,answersQuestion:true,missingRequestedDetails:[],claims:[{
        claim:'Allocation and publication date',supported:true,evidenceId:evidence.id,quotes:[contents],jsonPaths:[],
      }]});
    };
    const progress:Progress[]=[];
    const reply=await invoke({question},run,'known-notice-alternate-'+scenario,progress);
    const alternate=['new-publication','empty'].includes(scenario);
    assert.equal(searches,alternate?4:3,scenario);
    assert.equal(progress.some(step=>step.kind==='web-notice-alternate'),alternate,scenario);
    assert.equal(reply.activity.some((step:Progress)=>step.kind==='web-notice-alternate'),alternate,scenario);
    const saved=sanitizeStoredConversation([{id:'notice-'+scenario,role:'assistant',content:reply.answer,activity:reply.activity,result:reply}]);
    assert.equal(saved[0].activity.some((step:Progress)=>step.kind==='web-notice-alternate'),alternate,scenario);
    assert.equal(readUrls.includes(secondPublication),scenario==='new-publication',scenario);
    assert.match(reply.answer,/625803/u,scenario);
    assert.doesNotMatch(reply.answer,/NOT_PUBLIC_SEARCH_INPUT|PRIVATE_REVIEW_FEEDBACK/u,scenario);
    if(scenario==='new-publication'){
      assert.deepEqual(reply.verification,{status:'verified',attempts:3});
      assert.match(reply.answer,/25 GB/u);
      assert.deepEqual(reply.citations.map((citation:{url:string})=>citation.url),[secondPublication]);
    }else{
      assert.equal(reply.verification.attempts,2);
      assert.match(reply.answer,/could not verify the notice contents/iu);
    }
  }
});

test('a verified public limitation can advance with a fresh school source and keep its supported answer if no source helps',async()=>{
  for(const scenario of ['new-fact','unreadable','same-coverage','no-time','already-complete'] as const){
    configured();
    const started=originalNow();
    let elapsed=0,searches=0,reviews=0,corrections=0;
    Date.now=()=>started+elapsed;
    const urls:string[]=[];
    const initialUrl=scenario==='already-complete'?officialNotice:officialDirectory;
    const partial='The STU library visitor directory explains how to contact staff. It does not give the exhibition opening time.';
    const run=createResearchAssistantHandler({readSources:async citations=>citations.flatMap(citation=>{
      urls.push(citation.url);
      if(citation.url===officialDirectory)return [{id:citation.chunkId,url:citation.url,content:directoryContent}];
      assert.equal(citation.url,officialNotice);
      return scenario==='unreadable'?[]:[{id:citation.chunkId,url:citation.url,content:noticeContent}];
    })});
    globalThis.fetch=async(input,init)=>{
      const url=String(input);
      if(url.includes('/embeddings'))return Response.json({data:[{embedding:Array(1536).fill(0)}]});
      if(url.includes('/rpc/search_public_knowledge'))return Response.json([]);
      if(!url.endsWith('/v1/responses'))return Response.json(null);
      const call=JSON.parse(String(init?.body));
      const name=call.text.format.name;
      if(name==='stu_web_answer'){
        searches++;
        assert.doesNotMatch(call.input,/NOT_PUBLIC_SEARCH_INPUT|PRIVATE_GAP_LABEL/u);
        return Response.json(searches===1?searchPayload([officialDirectory,officialNotice],scenario==='already-complete'?noticeContent:partial,[initialUrl]):{output:[]});
      }
      const context=JSON.parse(call.input[0].content[0].text);
      if(name==='correct_grounded_answer'){
        corrections++;
        assert.match(call.instructions,/prior answer verified/u);
        assert.ok(context.evidence.some((item:{content:string})=>item.content===noticeContent));
        const selected=context.evidence.find((item:{url:string})=>item.url===(scenario==='same-coverage'?officialDirectory:officialNotice));
        return provider({status:'answered',answer:scenario==='same-coverage'?'The visitor directory gives contact options and no opening time.':noticeContent,
          sourceIds:[selected.id]});
      }
      assert.equal(name,'answer_evidence_review');
      assert.ok(call.text.format.schema.required.includes('missingRequestedDetails'));
      reviews++;
      if(scenario==='no-time')elapsed=43_000;
      const found=context.evidence.find((item:{url:string})=>item.url===(reviews===1?initialUrl:scenario==='same-coverage'?officialDirectory:officialNotice));
      const full=scenario==='already-complete'||reviews===2&&scenario==='new-fact';
      return provider({supported:true,answersQuestion:true,
        missingRequestedDetails:full?[]:['exhibition opening time PRIVATE_GAP_LABEL'],
        claims:[{claim:full?'Opening time':'Directory scope',supported:true,evidenceId:found.id,
          quotes:[found.content],jsonPaths:[]}]});
    };
    const progress:Progress[]=[];
    const answer=await invoke({question:testQuestion},run,'partial-verified-'+scenario,progress);
    const retried=!['already-complete','no-time'].includes(scenario);
    assert.equal(progress.some(step=>step.kind==='verification-partial-follow-up'),retried,scenario);
    const kept=['unreadable','same-coverage'].includes(scenario);
    assert.equal(progress.some(step=>step.kind==='verification-kept-partial'),kept,scenario);
    assert.equal(reviews,['new-fact','same-coverage'].includes(scenario)?2:1,scenario);
    assert.equal(corrections,reviews-1,scenario);
    assert.equal(urls.includes(officialNotice),retried||scenario==='already-complete',scenario);
    assert.deepEqual(answer.verification,{status:'verified',attempts:reviews},scenario);
    const complete=['new-fact','already-complete'].includes(scenario);
    assert.equal(answer.answer.split('\n\n')[0],complete?noticeContent:partial,scenario);
    assert.equal(answer.citations[0].url,complete?officialNotice:officialDirectory);
    assert.doesNotMatch(JSON.stringify(answer),/PRIVATE_GAP_LABEL/u);
    assert.ok(!progress.some(step=>step.kind==='verification-stop'));
  }
});

test('verified public detail can advance through four checks and survives stalled or rejected follow-ups',async()=>{
  const admissible='The STU library archive exhibition has free admission.';
  const entrance='Visitors enter the STU archive exhibition through the North Reading Room.';
  const identity='Visitors bring school identification to the STU archive exhibition. The venue has step-free access.';
  const mirror=officialDirectory+'archive-mirror/';
  const sourceUrls=[officialDirectory,officialOffice,eventCalendar,officialNotice];
  const gaps=[['entrance PRIVATE_GAP_LABEL','visitor identification','step-free access','opening time'],
    ['visitor identification','step-free access','opening time'],['opening time'],[]];
  const statements=[admissible,entrance,identity,noticeContent];
  const question=testQuestion+' Please also confirm admission, the entrance, visitor identification, and step-free access.';
  for(const outcome of ['complete','still-partial','rejected-then-recovered','mirror','swapped-gaps','relabeled','outage','time'] as const){
    configured();
    const unresolved=outcome==='still-partial'?['guide handouts']:[];
    const missingAt=(index:number)=>[...gaps[index],...unresolved];
    const started=originalNow();
    let elapsed=0,searches=0,reviews=0,corrections=0;
    Date.now=()=>started+elapsed;
    const acquired:string[]=[];
    const claimIndices=(count:number)=>Array.from({length:count},(_,index)=>index);
    const run=createResearchAssistantHandler({readSources:async citations=>citations.map(citation=>{
      const index=sourceUrls.indexOf(citation.url);
      assert.ok(index>=0||citation.url===mirror, citation.url);
      acquired.push(citation.url);
      return {id:citation.chunkId,url:citation.url,content:citation.url===mirror?'  '+entrance.replace('North','North   ')+'  ':statements[index]};
    })});
    globalThis.fetch=async(input,init)=>{
      const url=String(input);
      if(url.includes('/embeddings'))return Response.json({data:[{embedding:Array(1536).fill(0)}]});
      if(url.includes('/rpc/search_public_knowledge'))return Response.json([]);
      if(!url.endsWith('/v1/responses'))return Response.json(null);
      const call=JSON.parse(String(init?.body)),name=call.text.format.name;
      if(name==='stu_web_answer'){
        const index=searches++;
        assert.doesNotMatch(call.input,/PRIVATE_GAP_LABEL|previousMissingRequestedDetails|REJECTED_(?:DRAFT|FEEDBACK)_MARKER/u);
        assert.ok(index<4,'No fifth discovery pass.');
        const source=outcome==='mirror'&&index===2?mirror:sourceUrls[index];
        return Response.json(searchPayload([source],admissible+' The entrance, identification, step-free access, and opening time remain unresolved.'));
      }
      const context=JSON.parse(call.input[0].content[0].text);
      const evidence=context.evidence as Array<{url:string;id:string;content:string}>;
      const found=(index:number)=>evidence.find(source=>source.url===sourceUrls[index])!;
      if(name==='correct_grounded_answer'){
        corrections++;
        assert.match(call.instructions,/The prior answer verified/u);
        if(outcome==='rejected-then-recovered'&&evidence.length===4){
          assert.match(context.previousAnswer,/free admission.+North Reading Room/u);
          assert.doesNotMatch(context.previousAnswer,/REJECTED_DRAFT_MARKER/u);
          assert.match(context.unsupportedClaims.join(' '),/REJECTED_FEEDBACK_MARKER/u);
        }
        const facts=claimIndices(evidence.length).filter(index=>!(outcome==='swapped-gaps'&&evidence.length===3&&index===0));
        const unverifiedOpening=outcome==='rejected-then-recovered'&&evidence.length===3?' The opening time is 8:00 a.m. REJECTED_DRAFT_MARKER.':'';
        return provider({status:'answered',answer:facts.map(index=>statements[index]).join(' ')
          +(evidence.length===4?unresolved.length?' I could not verify whether guide handouts are available.':'':' Some requested details remain unverified.')+unverifiedOpening,
          sourceIds:facts.map(index=>found(index).id)});
      }
      assert.equal(name,'answer_evidence_review');
      assert.equal(call.text.format.schema.required.includes('missingRequestedDetails'),true);
      const index=reviews++;
      const resolveGap=(name:string)=>name.toLowerCase();
      const prior=outcome==='rejected-then-recovered'&&index===3?1:index-1;
      assert.deepEqual(context.previousMissingRequestedDetails,index?missingAt(prior).map(resolveGap):undefined);
      if(outcome==='outage'&&index===2)return Response.json({error:{code:'service_unavailable'}},{status:503});
      if(outcome==='rejected-then-recovered'&&index===2){
        assert.match(context.answer,/REJECTED_DRAFT_MARKER/u);
        return provider({supported:false,answersQuestion:false,missingRequestedDetails:['opening time'],claims:[{
          claim:'The opening time remains unsupported. REJECTED_FEEDBACK_MARKER.',supported:false,evidenceId:found(2).id,quotes:[],jsonPaths:[],
        }]});
      }
      if(outcome==='time'&&index===1)elapsed=44_000;
      const swapped=outcome==='swapped-gaps'&&index===2;
      const claims=claimIndices(index+1).filter(fact=>!swapped||fact!==0).map(fact=>({claim:statements[fact],supported:true,
        evidenceId:found(fact).id,quotes:[found(fact).content],jsonPaths:[]}));
      let missing=missingAt(index);
      if(swapped)missing=['admission','opening time'];
      else if(index===2)missing=[outcome==='relabeled'?'start time':' Ｏｐｅｎｉｎｇ   Ｔｉｍｅ ',...unresolved];
      return provider({supported:true,answersQuestion:true,missingRequestedDetails:missing,claims});
    };
    const progress:Progress[]=[];
    const answer=await invoke({question:question+(unresolved.length?' Are guide handouts available?':'')},run,'verified-public-continuation-'+outcome,progress);
    const reachedFourth=['complete','still-partial','rejected-then-recovered'].includes(outcome),expectedReviews=reachedFourth?4:['outage','swapped-gaps','relabeled'].includes(outcome)?3:2;
    assert.deepEqual(answer.verification,{status:'verified',attempts:expectedReviews},outcome);
    assert.equal(reviews,expectedReviews,outcome);
    assert.equal(corrections,expectedReviews-1,outcome);
    assert.equal(searches,reachedFourth?4:outcome==='time'?2:3,outcome);
    assert.deepEqual(acquired,reachedFourth?sourceUrls:[...sourceUrls.slice(0,2),...(outcome==='time'?[]:[outcome==='mirror'?mirror:eventCalendar])]);
    assert.doesNotMatch(JSON.stringify(answer),/PRIVATE_GAP_LABEL|REJECTED_(?:DRAFT|FEEDBACK)_MARKER/u);
    assert.ok(answer.answer.includes(entrance),outcome);
    assert.ok(answer.answer.includes(admissible),outcome);
    assert.equal(answer.answer.includes(noticeContent),reachedFourth,outcome);
    assert.equal(answer.answer.includes(identity),reachedFourth,outcome);
    assert.equal(answer.answer.includes('whether guide handouts are available'),Boolean(unresolved.length),outcome);
    assert.deepEqual(answer.citations.map((source:{url:string})=>source.url).sort(),(reachedFourth?[...sourceUrls]:sourceUrls.slice(0,2)).sort());
    assert.equal(progress.some(step=>step.kind==='verification-partial-follow-up-3'),outcome!=='time',outcome);
    assert.equal(progress.some(step=>step.kind==='verification-extended-review'),reachedFourth,outcome);
    assert.equal(progress.some(step=>step.kind==='web-alternate-discovery'&&step.status==='complete'),reachedFourth,outcome);
    assert.equal(progress.some(step=>step.kind==='verification-kept-partial'),!reachedFourth&&outcome!=='time',outcome);
    if(outcome==='rejected-then-recovered'||outcome==='outage')
      assert.ok(progress.some(step=>step.kind==='verification-3'&&step.status==='unavailable'));
    assert.equal(progress.filter(step=>/^verification-[1-4]$/u.test(step.kind)&&step.status!=='running').length,expectedReviews,outcome);
    if(reachedFourth){
      const restored=sanitizeStoredConversation([{id:'verified-continuation',role:'assistant',content:answer.answer,activity:answer.activity,result:answer}]);
      assert.ok(restored[0].activity.some((step:Progress)=>step.kind==='verification-partial-follow-up-3'));
      assert.ok(restored[0].activity.some((step:Progress)=>step.kind==='verification-4'&&step.status==='complete'));
      assert.doesNotMatch(JSON.stringify(restored),/PRIVATE_GAP_LABEL/u);
    }
  }
});

test('a truncated managed reviewer can verify the answer with an independently read public notice', async () => {
  const attempt = managedHarness('verified-web');
  const controlledFetch = globalThis.fetch;
  const reviews: Array<{ effort: string; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/v1/responses')) {
      const request = JSON.parse(String(init?.body));
      if (request.text.format.name === 'answer_evidence_review') {
        const { evidence } = JSON.parse(request.input[0].content[0].text);
        reviews.push({ effort: request.reasoning.effort, url: evidence[0].url });
        if (evidence[0].id === managedExcerpt.chunk_id) {
          return Response.json({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } });
        }
      }
    }
    return controlledFetch(input, init);
  };

  const progress: Progress[] = [];
  const answer = await invoke({ question: knowledgeQuestion }, attempt.run, 'knowledge-review-output-limit', progress);
  assert.deepEqual(reviews, [
    { effort: 'low', url: officialDirectory }, { effort: 'low', url: officialDirectory },
    { effort: 'medium', url: officialNotice },
  ]);
  assert.deepEqual(attempt.reads, [[officialNotice]]);
  assert.deepEqual(progress.filter(step => /^verification-\d$/u.test(step.kind) && step.status !== 'running')
    .map(({ kind,status }) => [kind,status]), [
    ['verification-1','unavailable'],['verification-2','unavailable'],['verification-3','complete'],
  ]);
  assert.deepEqual(answer.verification, { status: 'verified', attempts: 3 });
  assert.match(answer.answer, /opens at 10:30 a\.m\./u);
  assert.doesNotMatch(answer.answer, /supposedly/u);
  assert.deepEqual(answer.citations.map(({ url }: { url: string }) => url), [officialNotice]);
  assert.equal(progress.some(step => step.kind === 'verification-stop'), false);
});

test('a managed verified partial searches fresh public evidence while preserving its supported source',async()=>{
  const question=knowledgeQuestion+' Also explain how to contact the exhibition staff.';
  const baseline='Archive visitors can contact the library staff through the visitor directory. The exhibition opening time is still unverified.';
  const completed='Archive visitors can contact the library staff through the visitor directory. '+noticeContent;
  const pending=['Exhibition opening time PRIVATE_GAP_LABEL'];
  const priorClaim='Archive visitor contact guidance PRIVATE_DRAFT_SENTINEL';
  for(const rejectedFirst of [false,true]){
    const attempt=managedHarness('verified-knowledge');
    const controlledFetch=globalThis.fetch;
    const progress:Progress[]=[];
    const stages:string[]=[];
    const measuredCoverage:boolean[]=[];
    let managedReviews=0;
    globalThis.fetch=async (input,init)=>{
      if(!String(input).endsWith('/v1/responses'))return controlledFetch(input,init);
      const call=JSON.parse(String(init?.body)),name=call.text.format.name;
      stages.push(name);
      if(name==='stu_web_answer'){
        assert.equal(JSON.parse(call.input).question,question);
        assert.doesNotMatch(call.input,/PRIVATE_|my attendance/u);
        return controlledFetch(input,init);
      }
      if(name==='public_grounded_answer')return provider({status:'answered',answer:baseline,
        citations:[{chunkId:managedExcerpt.chunk_id,claim:priorClaim}],suggestedQuestions:[]});
      const context=JSON.parse(call.input[0].content[0].text);
      if(name==='correct_grounded_answer'){
        assert.equal(context.previousAnswer,baseline);
        if(context.evidence.length===1){
          assert.equal(rejectedFirst,true);
          return provider({status:'answered',answer:baseline,sourceIds:[managedExcerpt.chunk_id]});
        }
        assert.deepEqual(context.evidence.map((item:{url:string})=>item.url).sort(),[officialDirectory,officialNotice].sort());
        return provider({status:'answered',answer:completed,sourceIds:context.evidence.map((item:{id:string})=>item.id)});
      }
      assert.equal(name,'answer_evidence_review');
      measuredCoverage.push(call.text.format.schema.required.includes('missingRequestedDetails'));
      const managed=context.evidence.find((item:{id:string})=>item.id===managedExcerpt.chunk_id);
      const web=context.evidence.find((item:{url:string})=>item.url===officialNotice);
      if(web)assert.deepEqual(context.previousMissingRequestedDetails,[pending[0].toLowerCase()]);
      if(!web&&rejectedFirst&&++managedReviews===1)return provider({supported:false,answersQuestion:false,missingRequestedDetails:pending,
        claims:[{claim:'The first managed draft needs rechecking',supported:false,evidenceId:managed.id,jsonPaths:[],quotes:[]}]});
      return provider({supported:true,answersQuestion:true,missingRequestedDetails:web?[]:pending,claims:[
        {claim:priorClaim,supported:true,evidenceId:managed.id,jsonPaths:['/content'],quotes:[]},
        ...(web?[{claim:'Exhibition opening time',supported:true,evidenceId:web.id,jsonPaths:[],quotes:[noticeContent]}]:[]),
      ]});
    };
    const answer=await invoke({question,history:[
      {role:'user',content:'What are my attendance records at STU?'},
      {role:'assistant',content:'PRIVATE_HISTORY_SENTINEL'},
    ]},attempt.run,'managed-verified-partial-fresh-'+rejectedFirst,progress);
    assert.deepEqual(stages,['public_grounded_answer','answer_evidence_review',
      ...(rejectedFirst?['correct_grounded_answer','answer_evidence_review']:[]),'stu_web_answer','correct_grounded_answer','answer_evidence_review']);
    const checks=rejectedFirst?3:2;
    assert.deepEqual(measuredCoverage,Array(checks).fill(true));
    assert.deepEqual(answer.verification,{status:'verified',attempts:checks});
    assert.equal(answer.answer,completed);
    assert.deepEqual(answer.citations.map(({url}:{url:string})=>url).sort(),[officialDirectory,officialNotice].sort());
    assert.ok(progress.some(step=>step.kind==='verification-source-switch'&&step.status==='complete'));
    assert.doesNotMatch(JSON.stringify(answer.activity),/PRIVATE_(?:GAP|DRAFT|HISTORY)/u);
  }
});

test('managed public recovery keeps verified text and citations through stalls, changed missing details and time limits',async()=>{
  const question=knowledgeQuestion+' Include how to contact staff and which entrance to use.';
  const baseline='The visitor directory explains how to contact the library staff. The exhibition time and entrance are unverified.';
  const firstGaps=['opening time PRIVATE_GAP_LABEL','entrance'];
  for(const outcome of ['same-coverage','lost-known-detail','uncited-new-source','unreadable','mirror','no-time','complete'] as const){
    managedHarness('verified-knowledge');
    const controlledFetch=globalThis.fetch;
    const start=Date.now();
    const progress:Progress[]=[];
    const run=createResearchAssistantHandler({readSources:async citations=>outcome==='unreadable'?[]:citations.map(source=>({
      id:source.chunkId,url:source.url,content:outcome==='mirror'?directoryContent:noticeContent,
    }))});
    let reviews=0,searches=0,repairs=0;
    globalThis.fetch=async (input,init)=>{
      if(!String(input).endsWith('/v1/responses'))return controlledFetch(input,init);
      const call=JSON.parse(String(init?.body)),name=call.text.format.name;
      if(name==='stu_web_answer'){
        searches++;
        assert.equal(JSON.parse(call.input).question,question);
        assert.doesNotMatch(call.input,/PRIVATE_|exhibition time and entrance are unverified/u);
        return Response.json(searchPayload([officialNotice],noticeContent));
      }
      if(name==='public_grounded_answer')return provider({status:'answered',answer:baseline,
        citations:[{chunkId:managedExcerpt.chunk_id,claim:'Contact guidance'}],suggestedQuestions:[]});
      const context=JSON.parse(call.input[0].content[0].text);
      if(name==='correct_grounded_answer'){
        repairs++;
        return provider({status:'answered',answer:outcome==='lost-known-detail'||outcome==='uncited-new-source'
          ?noticeContent:'The directory gives staff contact information.',
          sourceIds:outcome==='uncited-new-source'?[managedExcerpt.chunk_id]:context.evidence.map((source:{id:string})=>source.id)});
      }
      assert.equal(name,'answer_evidence_review',outcome);
      reviews++;
      const web=context.evidence.find((source:{url:string})=>source.url===officialNotice);
      const missing=outcome==='complete'||outcome==='uncited-new-source'&&web?[]:outcome==='lost-known-detail'&&web?['staff contact']:firstGaps;
      const claims=web&&outcome==='lost-known-detail'
        ?[{claim:'Exhibition opening',supported:true,evidenceId:web.id,quotes:[noticeContent],jsonPaths:[]}]
        :[{claim:'Archive visitor contact guidance',supported:true,evidenceId:managedExcerpt.chunk_id,quotes:[],jsonPaths:['/content']}];
      return provider({supported:true,answersQuestion:true,missingRequestedDetails:missing,claims});
    };
    const answer=await invoke({question},run,'managed-partial-'+outcome,progress,outcome==='no-time'?start+23_900:undefined);
    const improvedRead=['same-coverage','lost-known-detail','uncited-new-source'].includes(outcome);
    assert.equal(reviews,improvedRead?2:1,outcome);
    assert.equal(repairs,improvedRead?1:0,outcome);
    if(outcome==='no-time'||outcome==='complete')assert.equal(searches,0,outcome);
    else assert.ok(searches>=1&&searches<=2,outcome);
    assert.deepEqual(answer.verification,{status:'verified',attempts:reviews},outcome);
    assert.equal(answer.answer,baseline,outcome);
    assert.deepEqual(answer.citations.map(({url}:{url:string})=>url),[officialDirectory],outcome);
    assert.equal(answer.grounding.source,'knowledge',outcome);
    const kept=answer.activity.filter((step:Progress)=>step.kind==='verification-kept-partial');
    assert.equal(kept.length,outcome==='complete'?0:1,outcome);
    if(outcome==='no-time')assert.match(kept[0].detail,/time left/u);
    assert.doesNotMatch(JSON.stringify(answer.activity),/PRIVATE_GAP_LABEL/u);
    const saved=sanitizeStoredConversation([{id:outcome,role:'assistant',content:answer.answer,activity:answer.activity,result:answer}]);
    assert.deepEqual(saved[0].result.verification,{status:'verified',attempts:reviews});
    assert.equal(saved[0].activity.filter(({kind}:Progress)=>kind==='verification-kept-partial').length,kept.length);
  }
});

test('a managed excerpt permits one original-page read and reviews only genuinely new readable content',async()=>{
  const question=knowledgeQuestion+' Include how to contact the exhibition staff.';
  const baseline='The library visitor directory explains how to contact staff. The opening time is unverified.';
  const full=directoryContent+' '+noticeContent;
  for(const mode of ['expanded','identical','older-capture','external-original'] as const){
    const pageUrl=mode==='external-original'?'https://outside.example.org/visitor-information/':officialDirectory;
    managedHarness('verified-knowledge');
    const controlledFetch=globalThis.fetch;
    const pages:string[]=[];
    const handler=createResearchAssistantHandler({readSources:async citations=>citations.map(source=>{
      pages.push(source.url);
      const content=mode==='expanded'?full:mode==='older-capture'
        ?JSON.stringify({content:directoryContent,capturedOn:'2026-01-02'}):'  '+directoryContent.replaceAll(' ','  ')+'  ';
      return {id:source.chunkId,url:source.url,content,...(mode==='older-capture'?{capturedOn:'2026-01-02'}:{})};
    })});
    const progress:Progress[]=[];
    let reviews=0,repairs=0;
    globalThis.fetch=async (input,init)=>{
      const url=String(input);
      if(mode==='external-original'&&url.includes('/rpc/search_public_knowledge'))
        return Response.json([{...managedExcerpt,source_url:pageUrl}]);
      if(!url.endsWith('/v1/responses'))return controlledFetch(input,init);
      const call=JSON.parse(String(init?.body)),name=call.text.format.name;
      if(name==='stu_web_answer'){
        assert.equal(JSON.parse(call.input).question,question);
        assert.doesNotMatch(call.input,/PRIVATE_|opening time is unverified|my attendance/u);
        return Response.json(searchPayload([pageUrl],unsafeDraft));
      }
      if(name==='public_grounded_answer')return provider({status:'answered',answer:baseline,
        citations:[{chunkId:managedExcerpt.chunk_id,claim:'Verified staff contacts'}],suggestedQuestions:[]});
      const context=JSON.parse(call.input[0].content[0].text);
      const original=context.evidence.find((source:{id:string})=>source.id!==managedExcerpt.chunk_id);
      if(name==='correct_grounded_answer'){
        repairs++;
        assert.equal(context.previousAnswer,baseline);
        assert.equal(original.content,full);
        assert.equal(original.url,officialDirectory);
        assert.equal(context.evidence.length,2);
        return provider({status:'answered',answer:full,sourceIds:context.evidence.map((source:{id:string})=>source.id)});
      }
      assert.equal(name,'answer_evidence_review');
      reviews++;
      if(original)assert.deepEqual(context.previousMissingRequestedDetails,['opening time private_gap_label']);
      return provider({supported:true,answersQuestion:true,missingRequestedDetails:original?[]:['opening time PRIVATE_GAP_LABEL'],
        claims:[
          {claim:'Verified staff contact guidance',supported:true,evidenceId:managedExcerpt.chunk_id,jsonPaths:['/content'],quotes:[]},
          ...(original?[{claim:'Verified exhibition opening time',supported:true,evidenceId:original.id,jsonPaths:[],quotes:[noticeContent]}]:[]),
        ]});
    };
    const answer=await invoke({question,history:[
      {role:'user',content:'What are my attendance records at STU?'},
      {role:'assistant',content:'PRIVATE_HISTORY_SENTINEL'},
    ]},handler,'managed-original-page-'+mode,progress);
    assert.deepEqual(pages,mode==='external-original'?[]:[officialDirectory],mode);
    assert.equal(repairs,mode==='expanded'?1:0,mode);
    assert.equal(reviews,mode==='expanded'?2:1,mode);
    assert.deepEqual(answer.verification,{status:'verified',attempts:reviews},mode);
    assert.equal(answer.answer,mode==='expanded'?full:baseline,mode);
    assert.equal(answer.citations.some(({chunkId}:{chunkId:string})=>chunkId===managedExcerpt.chunk_id),true,mode);
    assert.equal(answer.citations.some(({chunkId,url}:{chunkId:string;url:string})=>chunkId!==managedExcerpt.chunk_id&&url===officialDirectory),mode==='expanded',mode);
    assert.equal(answer.activity.some(({kind}:Progress)=>kind==='verification-kept-partial'),mode!=='expanded',mode);
  }
});
