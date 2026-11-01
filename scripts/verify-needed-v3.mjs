import { readContractSource } from './contract-source.mjs';

const read=(path)=>readContractSource(new URL(`../${path}`,import.meta.url),"utf8");
const files={
  contract:read("docs/product/neededv3.md"),
  academic:read("src/features/school/AcademicOperations.tsx"),
  people:read("src/features/school/UnifiedPortal.tsx"),
  lms:read("src/features/school/LmsWorkspace.tsx"),
  crm:read("src/features/crm/CrmRecordEditor.tsx"),
  repository:read("src/features/crm/crmRepository.ts"),
  agent:read("api/school-assistant.ts"),
  schema:read("supabase/migrations/20260719054235_enforce_relationship_invariants.sql"),
};
const required=[
  [files.academic,"courseId:course.id","curriculum catalog identity"],
  [files.academic,"prerequisiteCourseIds","curriculum prerequisite identities"],
  [files.academic,"Link this legacy row","legacy curriculum recovery"],
  [files.academic,"Merge duplicate student record","student merge picker"],
  [files.academic,"sectionSubjects","program-scoped class subject"],
  [files.people,"profilePrograms","department-scoped profile program"],
  [files.people,"profileSections","scoped class responsibility"],
  [files.lms,"Request attendance correction","attendance correction form"],
  [files.crm,'name="ownerId"',"accountable CRM owners"],
  [files.crm,'name="assignedTo"',"task assignee picker"],
  [files.crm,"audienceScope","structured campaign audience"],
  [files.repository,"sync_campaign_recipients","reviewable campaign recipients"],
  [files.agent,"authoritative catalog","Nexus exact-record rule"],
  [files.schema,"validate_relationship_invariants","database relationship enforcement"],
];
const forbidden=[
  [files.academic,"Comma-separated subject codes","typed curriculum prerequisite codes"],
  [files.academic,"Target student number for merging","typed merge target"],
  [files.people,'window.prompt("Assign profile ID"',"typed initiative owner ID"],
  [files.crm,'name="program"\n                    required',"free-text CRM program relationship"],
];
const failures=[];
for(const [content,marker,label] of required)if(!content.includes(marker))failures.push(`Missing ${label}`);
for(const [content,marker,label] of forbidden)if(content.includes(marker))failures.push(`Forbidden ${label}`);
if(!files.contract.includes("## Verification gate"))failures.push("neededv3 verification gate missing");
if(failures.length){console.error(failures.join("\n"));process.exit(1);}
console.log(`neededv3 relationship contract verified: ${required.length} implementation markers and ${forbidden.length} regression guards.`);
