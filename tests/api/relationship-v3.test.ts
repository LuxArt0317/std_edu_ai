import assert from "node:assert/strict";
import test from "node:test";
import { readContractSource } from '../../scripts/contract-source.mjs';

const read=(path:string)=>readContractSource(new URL(`../../${path}`,import.meta.url),"utf8");

test("curriculum placement reuses catalog identities and earlier prerequisite identities",()=>{
  const ui=read("src/features/school/AcademicOperations.tsx");
  const migration=read("supabase/migrations/20260719051051_relationship_first_workflows.sql");
  assert.match(ui,/courseId:course\.id/);
  assert.match(ui,/prerequisiteCourseIds/);
  assert.doesNotMatch(ui,/Comma-separated subject codes|NEW\$\{/);
  assert.match(migration,/selected catalog subject is unavailable/);
  assert.match(migration,/prerequisite must appear before its dependent subject/i);
});

test("dependent selectors cover academic identity, CRM ownership, campaigns, and schedules",()=>{
  const academic=read("src/features/school/AcademicOperations.tsx");
  const people=read("src/features/school/UnifiedPortal.tsx");
  const crm=read("src/features/crm/CrmRecordEditor.tsx");
  assert.match(academic,/eligibleStudentAdvisors/);
  assert.match(academic,/sectionSubjects/);
  assert.match(academic,/Merge duplicate student record/);
  assert.match(people,/profilePrograms/);
  assert.match(people,/profileSections/);
  assert.match(crm,/studentCases/);
  assert.match(crm,/audienceScope/);
  assert.match(crm,/campaign-recipient-review/);
});

test("database rejects mismatched relationships independently of the client",()=>{
  const migration=read("supabase/migrations/20260719054235_enforce_relationship_invariants.sql");
  for(const table of ["courses","profiles","students","cases","admission_leads","crm_tasks","course_sections","profile_section_assignments"]){
    assert.match(migration,new RegExp(`tg_table_name='${table}'`));
  }
  assert.match(migration,/selected case belongs to another student/i);
  assert.match(migration,/belongs to another program/i);
});

test("Nexus must reuse exact authoritative records and refresh stale IDs",()=>{
  const api=read("api/school-assistant.ts");
  assert.match(api,/authoritative catalog/);
  assert.match(api,/reuse its exact ID/);
  assert.match(api,/Refresh context and resolve a stale relationship ID/);
});
