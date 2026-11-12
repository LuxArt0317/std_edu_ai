import assert from "node:assert/strict";
import fs from "node:fs";
import { after,test } from "node:test";
import handler from "../../api/research-assistant.ts";

type Captured = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
};
const originalFetch = globalThis.fetch;
const saved = {
  openai: process.env.OPENAI_API_KEY,
  url: process.env.VITE_SUPABASE_URL,
  key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
after(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [
    ["OPENAI_API_KEY", saved.openai],
    ["VITE_SUPABASE_URL", saved.url],
    ["VITE_SUPABASE_PUBLISHABLE_KEY", saved.key],
    ["SUPABASE_SERVICE_ROLE_KEY", saved.service],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
function configured() {
  process.env.OPENAI_API_KEY = "test-openai";
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}
async function invoke(body: unknown, address: string) {
  const captured: Captured = { statusCode: 200, body: null, headers: {} };
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return response;
    },
    json(value: unknown) {
      captured.body = value;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
    },
  };
  await handler(
    {
      method: "POST",
      body,
      headers: { "x-forwarded-for": address, "user-agent": "research-test" },
    },
    response,
  );
  return captured;
}
function embedding() {
  return Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));
}
function trace() {
  return new Response(
    JSON.stringify([
      {
        answer_id: "44444444-4444-4444-8444-444444444444",
        feedback_token: "a".repeat(64),
        feedback_expires_at: "2026-08-18T00:00:00Z",
      },
    ]),
    { status: 200 },
  );
}
function metadata(
  result: { document_id: string; content_checksum: string },
  logicalKey = "admissions-policy",
) {
  return new Response(
    JSON.stringify([
      {
        id: result.document_id,
        logical_key: logicalKey,
        content_checksum: result.content_checksum,
      },
    ]),
    { status: 200 },
  );
}

test("public drawer uses the live grounded endpoint and renders official citations", () => {
  const service = fs.readFileSync("src/services/researchAssistant.ts", "utf8");
  const app = fs.readFileSync("src/features/public/PublicAssistant.tsx", "utf8");
  assert.match(service, /fetch\(["']\/api\/research-assistant["']/);
  assert.doesNotMatch(
    service,
    /knowledgeBase|setTimeout|prototype currently focuses/,
  );
  assert.match(app, /Sources/);
  assert.match(app, /PublicAssistantFeedback/);
  assert.match(app, /citation\.url/);
  assert.match(app, /rel="noreferrer"/);
});

test("hybrid retrieval filters governance and freshness before rank fusion", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/20260719070846_public_hybrid_knowledge_search.sql",
    "utf8",
  );
  for (const marker of [
    "websearch_to_tsquery",
    "operator(extensions.<=>)",
    "exact_score",
    "authority_boost",
    "s.active",
    "d.review_status='approved'",
    "d.publication_status='published'",
    "d.sensitivity='public'",
    "d.audience_scope='public'",
    "d.expires_at>now()",
    "c.expires_at>now()",
    "grant execute",
    "to anon, authenticated",
  ])
    assert.ok(migration.includes(marker), `hybrid retrieval missing ${marker}`);
});

test("public assistant rejects invalid input before provider access", async () => {
  const response = await invoke({ question: "" }, "invalid");
  assert.equal(response.statusCode, 400);
});

test("public assistant safely abstains when no eligible evidence passes retrieval", async () => {
  configured();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/v1/embeddings"))
      return new Response(
        JSON.stringify({ data: [{ embedding: embedding() }] }),
        { status: 200 },
      );
    if (url.includes("/rpc/search_public_knowledge"))
      return new Response("[]", { status: 200 });
    if (url.includes("/rpc/record_public_ai_exchange")) return trace();
    throw new Error(`Unexpected fetch ${url}`);
  };
  const response = await invoke(
    { question: "Unknown STU campus service?" },
    "abstain",
  );
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as { status: string }).status, "abstained");
  assert.deepEqual((response.body as { citations: unknown[] }).citations, []);
});

test("answered public responses can cite only retrieved eligible chunk IDs", async () => {
  configured();
  const result = {
    chunk_id: "11111111-1111-4111-8111-111111111111",
    document_id: "22222222-2222-4222-8222-222222222222",
    source_id: "33333333-3333-4333-8333-333333333333",
    source_name: "Official STU",
    authority_level: "primary_official",
    document_title: "Admissions",
    document_domain: "admissions",
    document_language: "mixed",
    source_url: "https://www.stu.edu.tw/admissions",
    source_locator: "section:1",
    effective_at: "2026-01-01T00:00:00Z",
    reviewed_at: "2026-01-02T00:00:00Z",
    content: "Apply through the official admissions page.",
    keyword_score: 0.4,
    vector_score: 0.8,
    exact_score: 0.6,
    fused_score: 0.2,
    document_version: 1,
    content_checksum: "a".repeat(64),
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/v1/embeddings"))
      return new Response(
        JSON.stringify({ data: [{ embedding: embedding() }] }),
        { status: 200 },
      );
    if (url.includes("/rpc/search_public_knowledge"))
      return new Response(JSON.stringify([result]), { status: 200 });
    if (url.includes("/knowledge_documents?")) return metadata(result);
    if (url.includes("/v1/responses"))
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    status: "answered",
                    answer: "Use the official admissions page.",
                    citations: [
                      {
                        chunkId: result.chunk_id,
                        claim:
                          "The official admissions page is the application source.",
                      },
                    ],
                    suggestedQuestions: ["What documents are required?"],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    if (url.includes("/rpc/record_public_ai_exchange")) return trace();
    throw new Error(`Unexpected fetch ${url}`);
  };
  const response = await invoke({ question: "How do I apply?" }, "answered");
  assert.equal(response.statusCode, 200);
  const body = response.body as {
    status: string;
    citations: Array<{ chunkId: string; url: string }>;
    grounding: { retrieved: number };
    feedback: { token: string };
  };
  assert.equal(body.status, "answered");
  assert.equal(body.citations[0].chunkId, result.chunk_id);
  assert.equal(body.citations[0].url, result.source_url);
  assert.equal(body.grounding.retrieved, 1);
  assert.equal(body.feedback.token, "a".repeat(64));
});

test("public traces are synchronous, atomic, and contain no raw query or client metadata", async () => {
  configured();
  const result = {
    chunk_id: "11111111-1111-4111-8111-111111111111",
    document_id: "22222222-2222-4222-8222-222222222222",
    source_id: "33333333-3333-4333-8333-333333333333",
    source_name: "Official STU",
    authority_level: "primary_official",
    document_title: "Admissions",
    document_domain: "admissions",
    document_language: "en",
    source_url: "https://www.stu.edu.tw/admissions",
    source_locator: "section:1",
    effective_at: null,
    reviewed_at: null,
    content: "Official evidence",
    keyword_score: 0.2,
    vector_score: 0.8,
    exact_score: 0,
    fused_score: 0.15,
    document_version: 1,
    content_checksum: "b".repeat(64),
  };
  let traceBody = "";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/v1/embeddings"))
      return new Response(
        JSON.stringify({ data: [{ embedding: embedding() }] }),
        { status: 200 },
      );
    if (url.includes("/rpc/search_public_knowledge"))
      return new Response(JSON.stringify([result]), { status: 200 });
    if (url.includes("/knowledge_documents?")) return metadata(result);
    if (url.includes("/v1/responses"))
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    status: "answered",
                    answer: "Official answer",
                    citations: [
                      { chunkId: result.chunk_id, claim: "Official claim" },
                    ],
                    suggestedQuestions: [],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    if (url.includes("/rpc/record_public_ai_exchange")) {
      traceBody = String(init?.body);
      return trace();
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const response = await invoke(
    { question: "My private raw question", sessionToken: "s".repeat(64) },
    "203.0.113.20",
  );
  assert.equal(response.statusCode, 200);
  assert.match(traceBody, /p_query_hash/);
  assert.match(traceBody, /p_retrieval/);
  assert.match(traceBody, /p_citations/);
  assert.doesNotMatch(
    traceBody,
    /My private raw question|203\.0\.113\.20|research-test|providerPayload/,
  );
});

test("a trace persistence failure returns practical help without claiming an untraceable success", async () => {
  configured();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/v1/embeddings"))
      return new Response(
        JSON.stringify({ data: [{ embedding: embedding() }] }),
        { status: 200 },
      );
    if (url.includes("/rpc/search_public_knowledge"))
      return new Response("[]", { status: 200 });
    if (url.includes("/rpc/record_public_ai_exchange"))
      return new Response(JSON.stringify({ message: "rejected" }), {
        status: 400,
      });
    throw new Error(`Unexpected fetch ${url}`);
  };
  const response = await invoke(
    { question: "Unknown request", sessionToken: "t".repeat(64) },
    "trace-failure",
  );
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {status:string}).status,"handoff");
  assert.deepEqual((response.body as {citations:unknown[]}).citations,[]);
  assert.equal((response.body as {feedback?:unknown}).feedback,undefined);
});

test("fabricated model citation IDs fail closed", async () => {
  configured();
  const result = {
    chunk_id: "11111111-1111-4111-8111-111111111111",
    document_id: "22222222-2222-4222-8222-222222222222",
    source_id: "33333333-3333-4333-8333-333333333333",
    source_name: "Official STU",
    authority_level: "primary_official",
    document_title: "Admissions",
    document_domain: "admissions",
    document_language: "en",
    source_url: "https://www.stu.edu.tw/admissions",
    source_locator: "section:1",
    effective_at: null,
    reviewed_at: null,
    content: "Official evidence",
    keyword_score: 0.2,
    vector_score: 0.8,
    exact_score: 0,
    fused_score: 0.15,
    document_version: 1,
    content_checksum: "b".repeat(64),
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/v1/embeddings"))
      return new Response(
        JSON.stringify({ data: [{ embedding: embedding() }] }),
        { status: 200 },
      );
    if (url.includes("/rpc/search_public_knowledge"))
      return new Response(JSON.stringify([result]), { status: 200 });
    if (url.includes("/knowledge_documents?")) return metadata(result);
    if (url.includes("/v1/responses"))
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    status: "answered",
                    answer: "Unsupported answer",
                    citations: [
                      {
                        chunkId: "99999999-9999-4999-8999-999999999999",
                        claim: "Fabricated",
                      },
                      { chunkId:result.chunk_id,claim:"One valid citation cannot excuse the fabricated one." },
                    ],
                    suggestedQuestions: [],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    throw new Error(`Unexpected fetch ${url}`);
  };
  const response = await invoke(
    { question: "Admissions information" },
    "bad-citation",
  );
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {status:string}).status,"handoff");
  assert.deepEqual((response.body as {citations:unknown[]}).citations,[]);
  assert.equal((response.body as {feedback?:unknown}).feedback,undefined);
});

test("equally ranked conflicting official sources hand off without model guessing", async () => {
  configured();
  const base = {
    source_name: "Official STU",
    authority_level: "primary_official",
    document_title: "Registration policy",
    document_domain: "registration",
    document_language: "en",
    source_locator: "section:1",
    effective_at: null,
    reviewed_at: null,
    keyword_score: 0.4,
    vector_score: 0.8,
    exact_score: 0.6,
    document_version: 1,
  };
  const first = {
    ...base,
    chunk_id: "11111111-1111-4111-8111-111111111111",
    document_id: "22222222-2222-4222-8222-222222222222",
    source_id: "33333333-3333-4333-8333-333333333333",
    source_url: "https://www.stu.edu.tw/a",
    content: "Registration closes Monday.",
    fused_score: 0.2,
    content_checksum: "a".repeat(64),
  };
  const second = {
    ...base,
    chunk_id: "55555555-5555-4555-8555-555555555555",
    document_id: "66666666-6666-4666-8666-666666666666",
    source_id: "77777777-7777-4777-8777-777777777777",
    source_url: "https://www.stu.edu.tw/b",
    content: "Registration closes Friday.",
    fused_score: 0.19,
    content_checksum: "b".repeat(64),
  };
  let modelCalled = false;
  globalThis.fetch = async (input,init) => {
    const url = String(input);
    if (url.includes("/v1/embeddings"))
      return new Response(
        JSON.stringify({ data: [{ embedding: embedding() }] }),
        { status: 200 },
      );
    if (url.includes("/rpc/search_public_knowledge"))
      return new Response(JSON.stringify([first, second]), { status: 200 });
    if (url.includes("/knowledge_documents?"))
      return new Response(
        JSON.stringify([
          {
            id: first.document_id,
            logical_key: "registration-deadline",
            content_checksum: first.content_checksum,
          },
          {
            id: second.document_id,
            logical_key: "registration-deadline",
            content_checksum: second.content_checksum,
          },
        ]),
        { status: 200 },
      );
    if (url.includes("/v1/responses")) {
      if (!JSON.parse(String(init?.body)).tools?.some((tool:{type:string})=>tool.type==='web_search')) modelCalled = true;
      // A real official-source lookup may resolve a conflict, but unsupported
      // model guessing must not replace the two conflicting source citations.
      throw new Error("no verified web source available");
    }
    if (url.includes("/rpc/record_public_ai_exchange")) return trace();
    throw new Error(`Unexpected fetch ${url}`);
  };
  const response = await invoke(
    {
      question: "When does registration close?",
      sessionToken: "u".repeat(64),
    },
    "conflict",
  );
  const body = response.body as { status: string; citations: unknown[] };
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, "handoff");
  assert.equal(body.citations.length, 2);
  assert.equal(modelCalled, false);
});

test('anonymous personal-course questions request sign-in without reading account data or contacting the model', async()=>{
 configured();
 globalThis.fetch=async input=>{
  const url=String(input);
  assert.doesNotMatch(url,/embeddings|responses|profiles|enrollments|search_assistant_knowledge/);
  if(url.includes('record_public_ai_exchange'))return trace();
  return Response.json(null);
 };
 const response=await invoke({question:'What are my current subjects?'},'personal-handoff');
 assert.equal(response.statusCode,200);const result=response.body as {status:string;answer:string;citations:unknown[]};assert.equal(result.status,'handoff');assert.match(result.answer,/sign in/i);assert.deepEqual(result.citations,[]);
});

test('an empty knowledge base is answered from real web-tool sources, without faking curated research citations',async()=>{
 configured();let searchCalls=0, traceCalls=0;
 const source='https://www.stu.edu.tw/office/';
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url.includes('/embeddings'))return Response.json({data:[{embedding:embedding()}]});
  if(url.includes('/rpc/search_public_knowledge'))return Response.json([]);
  if(url.includes('/v1/responses')){
   const request=JSON.parse(String(init?.body));assert.equal(request.tools[0].type,'web_search');searchCalls++;
   return Response.json({output:[{type:'web_search_call',status:'completed',action:{sources:[{url:source,title:'STU office'}]}},{type:'message',content:[{text:JSON.stringify({status:'answered',answer:'You can find office information on the STU office page.',source_urls:[source]})}]}]});
  }
  if(url.includes('record_public_ai_exchange')){traceCalls++;return trace();}
  return Response.json(null);
 };
 const result=await invoke({question:'Where can I find STU office information?'},'web-fallback');
 const body=result.body as {status:string;answer:string;feedback?:unknown;citations:Array<{url:string;reviewedAt:unknown}>;grounding:{source:string;webSearched:boolean}};
 assert.equal(result.statusCode,200);assert.equal(body.status,'answered');assert.equal(body.grounding.source,'web');assert.equal(body.grounding.webSearched,true);assert.equal(body.citations[0].url,source);assert.equal(body.citations[0].reviewedAt,null);assert.match(body.answer,/\[1\]\(/);assert.equal(body.feedback,undefined);assert.equal(traceCalls,0);assert.equal(searchCalls,1);
});

test('a managed-retrieval outage still tries the independent school web search',async()=>{
 configured();let searched=false;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.includes('/embeddings'))return Response.json({data:[{embedding:embedding()}]});
  if(url.includes('search_public_knowledge'))throw Error('backend unavailable');
  if(url.includes('/responses')){searched=true;return Response.json({output:[]});}
  if(url.includes('record_public_ai_exchange'))return trace();
  return Response.json(null);
 };
 const result=await invoke({question:'STU library opening hours?'},'retrieval-outage');
 assert.equal(result.statusCode,200);assert.equal(searched,true);assert.match((result.body as {answer:string}).answer,/student services|office|program/i);
});

test('private conversation history never enters public retrieval or live web search',async()=>{
 configured(); const sent:string[]=[];
 globalThis.fetch=async(input,init)=>{
  const url=String(input), body=String(init?.body||'');
  if(url.includes('/embeddings')){sent.push(body);return Response.json({data:[{embedding:embedding()}]});}
  if(url.includes('search_public_knowledge')){sent.push(body);return Response.json([]);}
  if(url.includes('/responses')){sent.push(body);return Response.json({output:[]});}
  if(url.includes('record_public_ai_exchange'))return trace();
  return Response.json(null);
 };
 const result=await invoke({question:'And the weekday opening hours?',history:[{role:'user',content:'My private grade is 72'},{role:'assistant',content:'Private student record 12345'},{role:'user',content:'Where is the STU library?'}]},'private-history');
 assert.equal(result.statusCode,200);assert.ok(sent.length>=2);
 for(const body of sent)assert.doesNotMatch(body,/private grade|Private student|12345|72/);
 assert.match(sent.join(' '),/STU library/);
});

test('unrelated code generation and greetings are handled without spending search calls',async()=>{
 configured();globalThis.fetch=async()=>{throw Error('no providers expected');};
 const coding=await invoke({question:'Write a Python script to build a trading bot'},'coding-scope');
 assert.equal(coding.statusCode,200);assert.equal((coding.body as {status:string}).status,'handoff');assert.match((coding.body as {answer:string}).answer,/Shu-Te/);
 const hello=await invoke({question:'你好'},'school-greeting');assert.equal(hello.statusCode,200);assert.match((hello.body as {answer:string}).answer,/樹德/);
});
