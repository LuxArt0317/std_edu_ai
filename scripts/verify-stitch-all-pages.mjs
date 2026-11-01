import fs from "node:fs";

const evidence=fs.readFileSync("docs/design/STITCH_ALL_PAGES_EVIDENCE.md","utf8");
const portal=fs.readFileSync("src/platform/UnifiedPortal.tsx","utf8");
const crm=fs.readFileSync("src/crm/CRMApp.tsx","utf8");
const auth=fs.readFileSync("src/crm/CRMRoot.tsx","utf8");
const rows=evidence.split("\n").filter((line)=>/^\| (?!---|Surface)/.test(line));
if(rows.length!==23) throw new Error(`Expected 23 Stitch page rows; found ${rows.length}.`);
for(const row of rows){
  if(!/[a-f0-9]{32}/.test(row)) throw new Error(`Missing screen ID: ${row}`);
  if(!/\| \d+ controls \|/.test(row)) throw new Error(`Missing HTML control count: ${row}`);
}
for(const marker of ["All 23 generated HTML artifacts","Incomplete or ambiguous Stitch controls","never remove"]){if(!evidence.includes(marker))throw new Error(`Missing evidence marker: ${marker}`)}
for(const marker of ["school-workspace-context","aria-current","school-workspace-content"]){if(!portal.includes(marker))throw new Error(`Missing platform marker: ${marker}`)}
for(const marker of ["nexus-workspace-context","exportWorkspaceSnapshot","Open today's action list","Open case notifications"]){if(!crm.includes(marker))throw new Error(`Missing CRM marker: ${marker}`)}
for(const marker of ["showPassword","Forgot password?","passwordRecovery","requestCrmPasswordReset"]){if(!auth.includes(marker))throw new Error(`Missing auth marker: ${marker}`)}
if(fs.readFileSync("src/App.tsx","utf8").includes("school-workspace-context"))throw new Error("Authenticated Stitch styling leaked into the public landing component.");
console.log("All-page Stitch evidence verified: 23/23 CRM surfaces.");
