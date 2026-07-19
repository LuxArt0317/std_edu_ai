import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import handler from "../../api/research-session.ts";
const runner=fs.readFileSync("supabase/migrations/20260719080500_pseudonymous_research_runner.sql","utf8");
const completion=fs.readFileSync("supabase/migrations/20260719082000_research_completion_and_export.sql","utf8");
const ui=fs.readFileSync("src/research/StudyApp.tsx","utf8");
const api=fs.readFileSync("api/research-session.ts","utf8");

test("participant tokens are opaque, hashed, revocable, expiring, and table-inaccessible",()=>{
  for(const marker of ["research_participant_tokens","token_hash text not null unique","extensions.digest(p_token,'sha256')","revoked_at is null","expires_at>now()","revoke all on public.research_participant_tokens from public, anon, authenticated"])assert.ok(runner.includes(marker),`missing token boundary ${marker}`);
  assert.match(api,/HttpOnly; Secure; SameSite=Strict/);assert.match(api,/delete payload\.token/);assert.doesNotMatch(ui,/token_hash|participant_token|localStorage/);
});

test("frozen consent and counterbalancing precede connected participant/session creation",()=>{
  for(const marker of ["status in ('recruiting','active')","frozen_at is not null","p_consent","pg_advisory_xact_lock","v_ab<=v_ba","research_consent_records","research_sessions"])assert.ok(runner.includes(marker),`missing protocol invariant ${marker}`);
  assert.match(runner,/Task does not belong to this protocol/);assert.match(runner,/Active consent is required/);
});

test("standard SUS, completion, withdrawal, deletion, and anonymized export are explicit",()=>{
  assert.match(runner,/count\(\*\)=10[\s\S]*ordinal%2=1[\s\S]*numeric_value-1[\s\S]*5-r\.numeric_value[\s\S]*2\.5/);
  assert.match(completion,/v_attempts<v_tasks\*2/);assert.match(runner,/withdrawn_at=now\(\)/);assert.match(runner,/delete from public\.research_participants/);
  const corrected=fs.readFileSync("supabase/migrations/20260719083200_research_task_and_completion_contract.sql","utf8");assert.match(corrected,/v_sus_responses<v_sus_items\*2/);assert.match(corrected,/promptCurrent/);assert.match(corrected,/promptEnhanced/);
  for(const field of ["participantKey","populationRole","familiarity","protocolVersion","durationMs","susCurrent","susEnhanced"])assert.ok(completion.includes(`'${field}'`),`export missing ${field}`);
  for(const forbidden of ["contact_ciphertext","token_hash","ip_hash","profile_id"])assert.doesNotMatch(completion,new RegExp(`'${forbidden}'`));
});

test("study route exposes consent, assigned conditions, timed task evidence, surveys, completion, and withdrawal",()=>{
  for(const marker of ["Consent and begin","session.sequence","Date.now()-active.startedAt","wrongPageVisits","How easy was this task?","Save questionnaire responses","Complete study","Privacy & withdrawal","Delete my study data now"])assert.ok(ui.includes(marker),`study UI missing ${marker}`);
  const main=fs.readFileSync("src/main.tsx","utf8");assert.match(main,/startsWith\('\/study\/'\)/);assert.match(main,/StudyApplication/);
});

test("an existing browser research cookie cannot create a duplicate active session",async()=>{
  const previousUrl=process.env.VITE_SUPABASE_URL;const previousKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;process.env.VITE_SUPABASE_URL="https://test.supabase.co";process.env.VITE_SUPABASE_PUBLISHABLE_KEY="test";
  const captured:{status:number;body:unknown;headers:Record<string,string>}={status:200,body:null,headers:{}};const response={status(code:number){captured.status=code;return response;},json(body:unknown){captured.body=body;},setHeader(name:string,value:string){captured.headers[name]=value;}};
  await handler({method:"POST",body:{action:"start",studyCode:"STUDY",studyVersionId:"11111111-1111-4111-8111-111111111111",populationRole:"student",familiarityLevel:"new",consent:true},query:{},headers:{cookie:"stu_research_token=existing","x-stu-research":"1","x-forwarded-for":"duplicate-test"}},response);
  assert.equal(captured.status,409);assert.match(String((captured.body as {error:string}).error),/already has an active/);
  if(previousUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=previousUrl;if(previousKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=previousKey;
});
