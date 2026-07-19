import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path:string)=>readFile(new URL(`../../${path}`,import.meta.url),"utf8");

test("Academic Office exposes manual curriculum creation and visible placement CRUD",async()=>{
  const [operations,repository,migration]=await Promise.all([
    read("src/platform/AcademicOperations.tsx"),
    read("src/platform/platformRepository.ts"),
    read("supabase/migrations/20260719003437_nexus_attachments_queue_and_manual_curricula.sql"),
  ]);
  for(const marker of ["+ Create curriculum","Create {selectedProgram.code} curriculum","Add existing catalog subject","Effective year","Year","Semester","Delete draft","Duplicate as new version"])
    assert.match(operations,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(repository,/createManualAcademicCurriculum/);
  assert.match(repository,/deleteDraftAcademicCurriculum/);
  assert.match(migration,/create_manual_academic_curriculum[\s\S]*security invoker/i);
  assert.match(migration,/delete_draft_academic_curriculum[\s\S]*Only a draft curriculum can be deleted/i);
  assert.doesNotMatch(migration,/create_manual_academic_curriculum[\s\S]*security definer/i);
});

test("role policy uses an accessible governed capability picker",async()=>{
  const [portal,styles]=await Promise.all([read("src/platform/UnifiedPortal.tsx"),read("src/platform/platform.css")]);
  assert.match(portal,/function RoleCapabilityPicker/);
  assert.match(portal,/role="combobox"/);
  assert.match(portal,/role="listbox"/);
  assert.match(portal,/Selected capabilities/);
  assert.doesNotMatch(portal,/Capabilities, one per line/);
  assert.match(styles,/\.capability-combobox/);
});

test("Nexus supports governed attachments, durable queues, and QA versus Agentic modes",async()=>{
  const [portal,client,api,migration]=await Promise.all([
    read("src/platform/UnifiedPortal.tsx"),read("src/platform/platformRepository.ts"),read("api/school-assistant.ts"),read("supabase/migrations/20260719003437_nexus_attachments_queue_and_manual_curricula.sql"),
  ]);
  for(const marker of ["Answers only","Can prepare actions","Attach images or files","Queue →","queuedPrompts"])
    assert.match(portal,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  for(const operation of ["uploadNexusAttachments","enqueueNexusPrompt","loadNexusPromptQueue","updateNexusPromptQueue"])
    assert.match(client,new RegExp(`export async function ${operation}`));
  assert.match(api,/You are in QA mode[\s\S]*never propose/i);
  assert.match(api,/input_image/);
  assert.match(api,/input_file/);
  assert.match(migration,/create table if not exists public\.nexus_prompt_queue/);
  assert.match(migration,/alter table public\.nexus_prompt_queue enable row level security/);
  assert.match(migration,/nexus_attachments_owner_insert/);
});
