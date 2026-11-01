import assert from "node:assert/strict";
import { test } from "node:test";
import { readContractSource } from '../../scripts/contract-source.mjs';

const read=(path:string)=>readContractSource(path,"utf8");
const portal=read("src/features/school/UnifiedPortal.tsx");
const crm=read("src/features/crm/CRMApp.tsx");
const lms=read("src/features/school/LmsWorkspace.tsx");
const account=read("supabase/functions/provision-role-account/index.ts");
const identity=read("supabase/migrations/20260718002408_complete_identity_governance.sql");
const roles=read("supabase/migrations/20260718003136_align_all_role_rls_catalog.sql");
const initiatives=read("supabase/migrations/20260718004027_institutional_initiatives_and_policy_approvals.sql");
const explanations=read("supabase/migrations/20260718004847_protect_unreleased_assessment_explanations.sql");
const retention=read("supabase/migrations/20260718005248_enforce_crm_retention_no_permanent_delete.sql");

test("temporary credentials require a completed first-login password replacement",()=>{
  assert.match(account,/must_change_password: true/); assert.match(account,/complete_password_change/); assert.match(portal,/PeopleView/); assert.match(read("src/features/auth/SchoolAuth.tsx"),/Replace your temporary password/);
});

test("identity, responsibility, admissions, communication, and sensitive access are governed",()=>{
  assert.match(portal,/accountPhone/); assert.match(identity,/remove_profile_section_assignment/); assert.match(crm,/requestAdmissionHandoff/); assert.match(crm,/approveAndSendCampaign/); assert.match(crm,/recordSensitiveCaseAccess/); assert.match(identity,/controlled_action_audit/);
});

test("all-role policies include registrar, finance, librarian, leadership, and referral duties",()=>{
  for(const marker of ["students_update_registrar","'finance'","'librarian'","'president'","'faculty'"]) assert.match(roles,new RegExp(marker));
});

test("policies and initiatives have proposal, approval, assignment, escalation, and audit evidence",()=>{
  for(const marker of ["institutional_initiatives","approve","assign","complete","reject","escalate","controlled_action_audit"]) assert.match(initiatives,new RegExp(marker));
  assert.match(portal,/Approve policy \/ initiative/); assert.match(portal,/Add project/);
});

test("assessment availability, attempts, duration, score release, and explanations are teacher controlled",()=>{
  for(const marker of ["opensAt","durationMinutes","attemptLimit","releaseScoresImmediately","releaseExplanations"]) assert.match(lms,new RegExp(marker));
  assert.match(explanations,/read_assessment_questions/); assert.match(explanations,/a\.release_explanations/); assert.match(explanations,/revoke select on public\.assessment_questions/);
});

test("institutional CRM records cannot be permanently deleted",()=>{
  assert.match(portal,/Permanent deletion is disabled/); assert.match(retention,/revoke delete on public\.cases/); assert.doesNotMatch(crm,/deleteCrmCase|deleteAdmissionLead|deleteCampaign|deleteKnowledgeArticle|deleteCrmTask/);
});
