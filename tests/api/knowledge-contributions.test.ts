import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260718230958_knowledge_contribution_context.sql", "utf8");
const ui = fs.readFileSync("src/features/crm/CRMApp.tsx", "utf8");
const repository = fs.readFileSync("src/features/crm/crmRepository.ts", "utf8");
const platformRepository = fs.readFileSync("src/features/school/platformRepository.ts", "utf8");
const platformAi = fs.readFileSync("server/assistantContext.js", "utf8");

test("knowledge contributions retain source, audience, ownership, and review context", () => {
  for (const field of ["source_type", "source_event_id", "source_profile_id", "section_id", "audience_scope", "audience_roles", "reviewed_by", "review_notes"])
    assert.match(migration, new RegExp(field));
  assert.match(migration, /knowledge_insert_contributor/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.can_access_section\(section_id\)/);
  assert.match(migration, /status = 'verified'.*private\.has_role\(array\['owner','admin','librarian'\]/s);
});

test("knowledge publisher links user, class, and campus events and routes review", () => {
  for (const marker of ["Knowledge origin", "User or personal event", "Class event", "Whole-campus event", "Related calendar event", "Audience roles", "Review context", "Add article"])
    assert.match(ui, new RegExp(marker));
  assert.match(repository, /from\("schedule_events"\)/);
  assert.match(repository, /source_profile_id: user\.user\.id/);
  assert.match(repository, /reviewed_by: input\.status === "verified"/);
});

test("verified governed knowledge grounds Nexus", () => {
  assert.match(platformRepository, /from\("knowledge_articles"\)/);
  assert.match(platformAi, /knowledge:\s*\[\s*"knowledge_articles"/);
  assert.match(platformAi, /status=eq\.verified/);
  assert.match(platformAi, /slice\(0,\s*4000\)/);
});
