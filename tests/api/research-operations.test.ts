import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { operationalCorrelation,safeOperationalCode,safeOperationalMetadata } from "../../server/researchOperations.js";

test("operational helpers only emit irreversible identifiers and enumerated metadata",()=>{
  assert.match(operationalCorrelation("a raw question that must not be stored"),/^[0-9a-f]{64}$/);
  assert.equal(safeOperationalCode("provider timed out: secret=abc"),"PROVIDER_TIMED_OUT_SECRET_ABC");
  assert.deepEqual(safeOperationalMetadata({retrieval_count:4,cache_hit:false,question:"private",token:"secret",nested:{bad:true},status_family:5}),{retrieval_count:4,cache_hit:false,status_family:5});
});

test("operations schema is privacy-minimized, immutable, role-protected, and recoverable",()=>{
  const sql=fs.readFileSync("supabase/migrations/20260719104517_research_operations_slo_and_incidents.sql","utf8");
  for(const marker of ["research_slo_definitions","research_operational_events","research_operational_alerts","Operational metadata must use approved non-content fields","Operational events are append-only","Published SLO definitions are immutable","research_operations_report","transition_research_operational_alert","purge_issue125_fixture","No prompts, questions, tokens, private chunks, identities, provider payloads"]){assert.ok(sql.includes(marker),marker);}
  for(const prohibited of ["raw_question text","prompt text","study_token text","provider_payload jsonb"]){assert.equal(sql.includes(prohibited),false,prohibited);}
});

test("required research APIs emit sanitized component observations",()=>{
  const assistant=fs.readFileSync("server/researchAssistantHandler.js","utf8"),route=fs.readFileSync("api/campus-route.ts","utf8"),study=fs.readFileSync("api/research-session.ts","utf8");
  for(const component of ['retrieval','model','citation'])assert.match(assistant,new RegExp(`component\\s*:\\s*"${component}"`));
  assert.ok(route.includes('component:"campus_route"'));
  assert.ok(study.includes('component:"study"'));
});

test("protected UI exposes SLO, incident ownership, and manual evidence boundary",()=>{
  const ui=fs.readFileSync("src/features/research/ResearchOperationsPanel.tsx","utf8");
  for(const marker of ["Service targets","Last 24 hours","Active alerts","Acknowledge","Resolve after verification","VoiceOver, NVDA, TalkBack"]){assert.ok(ui.includes(marker),marker);}
});

test("research analysis RPCs explicitly deny anonymous execution",()=>{
  const migration=fs.readFileSync("supabase/migrations/20260719124500_research_rpc_least_privilege.sql","utf8");
  for(const name of ["research_sus_score(uuid,text)","research_anonymized_export(uuid)"]) assert.match(migration,new RegExp(`revoke execute on function public\\.${name.replace(/[()]/g,"\\$&")} from public,anon`));
  assert.match(migration,/grant execute[\s\S]*to authenticated,service_role/);
});
