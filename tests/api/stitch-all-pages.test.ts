import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");

test("every CRM surface has independently generated and HTML-validated Stitch evidence",()=>{
  const rows=read("docs/design/STITCH_ALL_PAGES_EVIDENCE.md").split("\n").filter((line)=>/^\| (?!---|Surface)/.test(line));
  assert.equal(rows.length,23);
  for(const row of rows){assert.match(row,/[a-f0-9]{32}/);assert.match(row,/\| \d+ controls \|/)}
});

test("shared Stitch improvements cover platform and nested CRM pages",()=>{
  const portal=read("src/platform/UnifiedPortal.tsx");
  const crm=read("src/crm/CRMApp.tsx");
  assert.match(portal,/data-workspace=\{view\}/);
  assert.match(portal,/aria-current=\{view === item/);
  assert.match(crm,/data-section=\{section\}/);
  assert.match(crm,/exportWorkspaceSnapshot/);
});

test("Stitch auth findings are implemented through Supabase recovery",()=>{
  const root=read("src/crm/CRMRoot.tsx");
  const auth=read("src/crm/authService.ts");
  assert.match(root,/PASSWORD_RECOVERY/);
  assert.match(root,/Forgot password\?/);
  assert.match(auth,/resetPasswordForEmail/);
  assert.match(auth,/completeCrmPasswordRecovery/);
});

test("the public landing page remains isolated from authenticated Stitch work",()=>{
  const landing=read("src/App.tsx");
  assert.doesNotMatch(landing,/school-workspace-context|nexus-workspace-context|stitch-all-pages/i);
});
