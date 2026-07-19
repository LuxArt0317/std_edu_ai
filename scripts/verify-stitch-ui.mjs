import { readFileSync } from "node:fs";

const evidence=readFileSync("STITCH_UI_EVIDENCE.md","utf8");
const lms=readFileSync("src/platform/LmsWorkspace.tsx","utf8");
const portal=readFileSync("src/platform/UnifiedPortal.tsx","utf8");
const crm=readFileSync("src/crm/CRMApp.tsx","utf8");
const requiredEvidence=["projects/16353832066758496067","assets/dfc4619bb6af499394c5c7afed65bcda","## Generated screens","## Control validation","## Implementation evidence","## Production evidence"];
const missing=requiredEvidence.filter((marker)=>!evidence.includes(marker));
const sourceContracts={
  "teacher material open action":lms.includes("Open lesson"),
  "teacher lesson preview":lms.includes("Student lesson preview"),
  "teacher lesson edit":lms.includes("Edit lesson"),
  "student course outline":lms.includes("Course outline"),
  "student active lesson":lms.includes("aria-current"),
  "student lesson navigation":lms.includes("Next lesson"),
  "assessment creation":lms.includes("+ New assessment"),
  "account provisioning":portal.includes("Add account"),
  "Registrar handoff":crm.includes("Registrar handoff"),
  "campaign approval":crm.includes("approveAndSendCampaign") && crm.includes("Approve &amp; send campaign"),
};
for(const [label,valid] of Object.entries(sourceContracts)) if(!valid) missing.push(label);
if(missing.length){console.error(`Stitch UI verification failed:\n${missing.map((item)=>`- ${item}`).join("\n")}`);process.exit(1);}
console.log(`Stitch UI evidence verified: ${Object.keys(sourceContracts).length} critical workflow controls.`);
