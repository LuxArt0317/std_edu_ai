import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const schema=fs.readFileSync("supabase/migrations/20260719081744_administrative_workload_measurement.sql","utf8");
const cleanup=fs.readFileSync("supabase/migrations/20260719082540_administrative_workload_fixture_cleanup.sql","utf8");
const panel=fs.readFileSync("src/research/WorkloadEvidencePanel.tsx","utf8");
const service=fs.readFileSync("src/research/workloadService.ts","utf8");
const crm=fs.readFileSync("src/crm/CRMApp.tsx","utf8");

test("workload evidence uses comparable governed windows and independent review",()=>{
  for(const marker of ["administrative_workload_windows","source_extract_sha256","suppression_threshold between 5 and 50","cannot overlap","must have equal duration","verified_by<>created_by","A different authorized reviewer must verify"])assert.ok(schema.includes(marker),`missing workload governance ${marker}`);
});

test("confirmed resolution is explicit, aggregate, append-only, and not inferred from AI",()=>{
  for(const marker of ["explicit_user_confirmation","staff_verified_resolution","ticket_closed_with_confirmation","AI answers are not confirmed resolutions","Workload observations are append-only","source_record_count","Category inquiry totals must equal"])assert.ok(schema.includes(marker),`missing resolution boundary ${marker}`);
  assert.doesNotMatch(schema,/respondent_name|student_number|email_address|message_content/);
});

test("reports suppress small cells and prohibit premature outcome claims",()=>{
  for(const marker of ["Suppressed small cell","claimPermitted',false","Descriptive comparison only","approved analysis","uncertainty","participating-office sign-off"])assert.ok(schema.includes(marker),`missing reporting boundary ${marker}`);
  for(const marker of ["Do not enter names, emails, student numbers","Claim status: not established","AI replies alone never count as deflection","Not measured","Export governed JSON"])assert.ok(panel.includes(marker),`missing honest UI state ${marker}`);
});

test("unsupported hard-coded analytics are removed and reversible validation is narrow",()=>{
  for(const marker of ["Information deflection","67%","User satisfaction","4.7","Intervention response","74%"] )assert.ok(!crm.includes(marker),`unsupported outcome remains: ${marker}`);
  assert.match(crm,/WorkloadEvidencePanel/);assert.match(service,/crypto\.subtle\.digest\("SHA-256"/);
  for(const marker of ["Only the protected owner","Synthetic workload validation%","stu.allow_workload_fixture_cleanup"])assert.ok(cleanup.includes(marker),`missing narrow cleanup ${marker}`);
});
