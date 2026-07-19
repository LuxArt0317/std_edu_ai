import assert from "node:assert/strict";
import fs from "node:fs";
import {after, test} from "node:test";
import handler from "../../api/research-assistant.ts";

type Captured = {statusCode:number;body:unknown;headers:Record<string,string>};
const originalFetch=globalThis.fetch;
const saved={openai:process.env.OPENAI_API_KEY,url:process.env.VITE_SUPABASE_URL,key:process.env.VITE_SUPABASE_PUBLISHABLE_KEY,service:process.env.SUPABASE_SERVICE_ROLE_KEY};
after(()=>{
  globalThis.fetch=originalFetch;
  for(const [name,value] of [["OPENAI_API_KEY",saved.openai],["VITE_SUPABASE_URL",saved.url],["VITE_SUPABASE_PUBLISHABLE_KEY",saved.key],["SUPABASE_SERVICE_ROLE_KEY",saved.service]] as const){
    if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
});
function configured(){
  process.env.OPENAI_API_KEY="test-openai";
  process.env.VITE_SUPABASE_URL="https://test.supabase.co";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_test";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}
async function invoke(body:unknown,address:string){
  const captured:Captured={statusCode:200,body:null,headers:{}};
  const response={status(code:number){captured.statusCode=code;return response;},json(value:unknown){captured.body=value;},setHeader(name:string,value:string){captured.headers[name]=value;}};
  await handler({method:"POST",body,headers:{"x-forwarded-for":address,"user-agent":"research-test"}},response);
  return captured;
}
function embedding(){return Array.from({length:1536},(_,index)=>index===0?1:0);}

test("public drawer uses the live grounded endpoint and renders official citations",()=>{
  const service=fs.readFileSync("src/services/researchAssistant.ts","utf8");
  const app=fs.readFileSync("src/App.tsx","utf8");
  assert.match(service,/fetch\('\/api\/research-assistant'/);
  assert.doesNotMatch(service,/knowledgeBase|setTimeout|prototype currently focuses/);
  assert.match(app,/assistant-citations/);
  assert.match(app,/citation\.url/);
  assert.match(app,/rel="noreferrer"/);
});

test("hybrid retrieval filters governance and freshness before rank fusion",()=>{
  const migration=fs.readFileSync("supabase/migrations/20260719070846_public_hybrid_knowledge_search.sql","utf8");
  for(const marker of [
    "websearch_to_tsquery", "operator(extensions.<=>)", "exact_score", "authority_boost",
    "s.active", "d.review_status='approved'", "d.publication_status='published'",
    "d.sensitivity='public'", "d.audience_scope='public'", "d.expires_at>now()",
    "c.expires_at>now()", "grant execute", "to anon, authenticated",
  ])assert.ok(migration.includes(marker), `hybrid retrieval missing ${marker}`);
});

test("public assistant rejects invalid input before provider access",async()=>{
  const response=await invoke({question:""},"invalid");
  assert.equal(response.statusCode,400);
});

test("public assistant safely abstains when no eligible evidence passes retrieval",async()=>{
  configured();
  globalThis.fetch=async(input)=>{
    const url=String(input);
    if(url.includes("/v1/embeddings"))return new Response(JSON.stringify({data:[{embedding:embedding()}]}),{status:200});
    if(url.includes("/rpc/search_public_knowledge"))return new Response("[]",{status:200});
    throw new Error(`Unexpected fetch ${url}`);
  };
  const response=await invoke({question:"Unknown private decision?"},"abstain");
  assert.equal(response.statusCode,200);
  assert.equal((response.body as {status:string}).status,"abstained");
  assert.deepEqual((response.body as {citations:unknown[]}).citations,[]);
});

test("answered public responses can cite only retrieved eligible chunk IDs",async()=>{
  configured();
  const result={chunk_id:"11111111-1111-4111-8111-111111111111",document_id:"22222222-2222-4222-8222-222222222222",source_id:"33333333-3333-4333-8333-333333333333",source_name:"Official STU",authority_level:"primary_official",document_title:"Admissions",document_domain:"admissions",document_language:"mixed",source_url:"https://www.stu.edu.tw/admissions",source_locator:"section:1",effective_at:"2026-01-01T00:00:00Z",reviewed_at:"2026-01-02T00:00:00Z",content:"Apply through the official admissions page.",keyword_score:0.4,vector_score:0.8,exact_score:0.6,fused_score:0.2,document_version:1,content_checksum:"a".repeat(64)};
  globalThis.fetch=async(input)=>{
    const url=String(input);
    if(url.includes("/v1/embeddings"))return new Response(JSON.stringify({data:[{embedding:embedding()}]}),{status:200});
    if(url.includes("/rpc/search_public_knowledge"))return new Response(JSON.stringify([result]),{status:200});
    if(url.includes("/v1/responses"))return new Response(JSON.stringify({output:[{content:[{text:JSON.stringify({status:"answered",answer:"Use the official admissions page.",citations:[{chunkId:result.chunk_id,claim:"The official admissions page is the application source."}],suggestedQuestions:["What documents are required?"]})}]}]}),{status:200});
    throw new Error(`Unexpected fetch ${url}`);
  };
  const response=await invoke({question:"How do I apply?"},"answered");
  assert.equal(response.statusCode,200);
  const body=response.body as {status:string;citations:Array<{chunkId:string;url:string}>;grounding:{retrieved:number}};
  assert.equal(body.status,"answered");
  assert.equal(body.citations[0].chunkId,result.chunk_id);
  assert.equal(body.citations[0].url,result.source_url);
  assert.equal(body.grounding.retrieved,1);
});

test("fabricated model citation IDs fail closed",async()=>{
  configured();
  const result={chunk_id:"11111111-1111-4111-8111-111111111111",document_id:"22222222-2222-4222-8222-222222222222",source_id:"33333333-3333-4333-8333-333333333333",source_name:"Official STU",authority_level:"primary_official",document_title:"Admissions",document_domain:"admissions",document_language:"en",source_url:"https://www.stu.edu.tw/admissions",source_locator:"section:1",effective_at:null,reviewed_at:null,content:"Official evidence",keyword_score:0.2,vector_score:0.8,exact_score:0,fused_score:0.15,document_version:1,content_checksum:"b".repeat(64)};
  globalThis.fetch=async(input)=>{
    const url=String(input);
    if(url.includes("/v1/embeddings"))return new Response(JSON.stringify({data:[{embedding:embedding()}]}),{status:200});
    if(url.includes("/rpc/search_public_knowledge"))return new Response(JSON.stringify([result]),{status:200});
    if(url.includes("/v1/responses"))return new Response(JSON.stringify({output:[{content:[{text:JSON.stringify({status:"answered",answer:"Unsupported answer",citations:[{chunkId:"99999999-9999-4999-8999-999999999999",claim:"Fabricated"}],suggestedQuestions:[]})}]}]}),{status:200});
    throw new Error(`Unexpected fetch ${url}`);
  };
  const response=await invoke({question:"Admissions information"},"bad-citation");
  assert.equal(response.statusCode,502);
});
