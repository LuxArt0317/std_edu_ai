import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const portal = fs.readFileSync("src/platform/UnifiedPortal.tsx", "utf8");
const styles = fs.readFileSync("src/platform/platform.css", "utf8");
const schema = fs.readFileSync("supabase/migrations/20260716154728_all_in_one_school_platform.sql", "utf8");
const model = fs.readFileSync("src/platform/schoolCalendar.ts", "utf8");

test("calendar combines every important authoritative source", () => {
  for (const source of ["schedule", "assessment", "attendance", "learning", "grade", "initiative", "term"])
    assert.match(model, new RegExp(`source: "${source}"`));
  assert.match(model, /assessment\.type === "exam" \? "urgent"/);
  assert.match(model, /initiative\.ownerId === user\.id \? "For you"/);
  assert.match(model, /if \(!item\.dueAt \|\| item\.assessmentId/);
});

test("calendar UI provides useful views, filters, details, and existing CRUD", () => {
  for (const marker of ["month", "week", "agenda", "Everything important", "calendar-event-detail", "ScheduleOperations"])
    assert.match(portal, new RegExp(marker));
  assert.match(styles, /\.unified-month-grid/);
  assert.match(styles, /\.unified-calendar-event\.assessment/);
});

test("schedule schema supports personal, class, and role-wide targeting under RLS", () => {
  for (const column of ["section_id", "owner_profile_id", "audience_roles", "starts_at", "ends_at", "location", "event_type"])
    assert.match(schema, new RegExp(column));
  assert.match(schema, /alter table public\.schedule_events enable row level security/);
  assert.match(schema, /private\.can_access_section\(section_id\)/);
});
