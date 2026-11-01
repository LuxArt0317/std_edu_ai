import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const needed = readFileSync(new URL("docs/product/needed.md", root), "utf8");

const evidence = {
  accounts: ["src/platform/UnifiedPortal.tsx", "PeopleView", "src/platform/platformRepository.ts", "provisionRoleAccount", "supabase/functions/provision-role-account/index.ts", "account_lifecycle_audit"],
  academics: ["src/platform/AcademicOperations.tsx", "AcademicOperations", "src/platform/platformRepository.ts", "transitionEnrollment", "supabase/migrations/20260718001256_controlled_student_program_submission_records.sql", "controlled_action_audit"],
  learning: ["src/platform/LmsWorkspace.tsx", "TeacherLmsStudio", "src/platform/platformRepository.ts", "createLearningMaterialPage", "supabase/migrations/20260716154728_all_in_one_school_platform.sql", "assessment_attempts"],
  crm: ["src/crm/CRMApp.tsx", "CRMApp", "src/crm/crmRepository.ts", "saveCrmCase", "supabase/migrations/20260716142102_stu_nexus_crm.sql", "create table public.cases"],
  communication: ["src/platform/UnifiedPortal.tsx", "NotificationCenter", "src/platform/platformRepository.ts", "decideCommunicationRequest", "supabase/migrations/20260718000718_notifications_and_approved_communication.sql", "controlled_action_audit"],
  nexus: ["src/platform/UnifiedPortal.tsx", "Nexus AI", "api/school-assistant.ts", "Absolute student boundary", "supabase/migrations/20260717222758_nexus_agent_action_audit.sql", "ai_audit_logs"],
  governance: ["src/platform/UnifiedPortal.tsx", "Recent account and role activity", "src/platform/platformRepository.ts", "correctPublishedGrade", "supabase/migrations/20260717234309_complete_needed_controlled_workflows.sql", "controlled_action_audit"],
};

const sectionDomain = (heading, action) => {
  const value = `${heading} ${action}`.toLowerCase();
  if (/nexus|\bai\b/.test(value)) return "nexus";
  if (/account|permission|role|people|profile/.test(value)) return "accounts";
  if (/communication|announcement|notification|message|contact/.test(value)) return "communication";
  if (/lms|learning|assessment|quiz|exam|assignment|lesson|module|grade|attendance|teaching|course preparation/.test(value)) return "learning";
  if (/crm|case|task|signal|campaign|lead|applicant|admission|finance|support|interaction|knowledge|library|advisor|intervention/.test(value)) return "crm";
  if (/academic|student record|enrollment|program|department|subject|section|schedule|term|registrar/.test(value)) return "academics";
  if (/controlled|safeguard|approve|archive|audit|delete|withdraw|merge|sensitive|bulk/.test(value)) return "governance";
  return "governance";
};

let role = "Catalog";
let section = "Contract";
const rows = [];
for (const [index, raw] of needed.split("\n").entries()) {
  if (/^# \d+\./.test(raw)) role = raw.replace(/^# /, "");
  else if (/^## /.test(raw)) section = raw.slice(3);
  else if (/^- /.test(raw) && !/^- \*\*/.test(raw)) {
    const action = raw.slice(2).trim();
    rows.push({ line: index + 1, role, section, action, domain: sectionDomain(section, action) });
  }
}

const failures = [];
for (const row of rows) {
  const anchors = evidence[row.domain];
  if (!anchors) {
    failures.push(`docs/product/needed.md:${row.line} has no evidence domain: ${row.action}`);
    continue;
  }
  for (let index = 0; index < anchors.length; index += 2) {
    const file = anchors[index];
    const marker = anchors[index + 1];
    const source = readFileSync(new URL(file, root), "utf8");
    if (!source.includes(marker)) failures.push(`${file} is missing ${JSON.stringify(marker)} for docs/product/needed.md:${row.line}`);
  }
}

const requiredSpecificEvidence = {
  "Require password change on first login": ["supabase/functions/provision-role-account/index.ts", "must_change_password"],
  "Edit name, email, phone, department, and title": ["src/platform/UnifiedPortal.tsx", "accountPhone"],
  "Convert an accepted applicant into a student-account request": ["src/crm/CRMApp.tsx", "Convert to student request"],
  "Transfer accepted records to the Registrar": ["src/crm/CRMApp.tsx", "Registrar handoff"],
  "Sensitive-case access": ["supabase/migrations", "sensitive_case_access"],
  "Bulk communication": ["src/crm/CRMApp.tsx", "approveAndSendCampaign"],
  "Permanent data deletion": ["src/platform/UnifiedPortal.tsx", "Permanent deletion is disabled"],
};

for (const [action, [file, marker]] of Object.entries(requiredSpecificEvidence)) {
  if (!needed.includes(`- ${action}`)) failures.push(`docs/product/needed.md is missing governed action: ${action}`);
  const candidates = file === "supabase/migrations"
    ? ["supabase/migrations/20260717234309_complete_needed_controlled_workflows.sql", "supabase/migrations/20260718001256_controlled_student_program_submission_records.sql", "supabase/migrations/20260718002408_complete_identity_governance.sql"]
    : [file];
  if (!candidates.some((candidate) => readFileSync(new URL(candidate, root), "utf8").includes(marker))) {
    failures.push(`${action} lacks specific evidence marker ${JSON.stringify(marker)} in ${file}`);
  }
}

if (rows.length < 200) failures.push(`Only ${rows.length} actionable requirements were parsed; expected at least 200.`);

if (failures.length) {
  console.error(`docs/product/needed.md catalog verification failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`docs/product/needed.md catalog verified: ${rows.length} actions mapped across ${Object.keys(evidence).length} evidence domains.`);
