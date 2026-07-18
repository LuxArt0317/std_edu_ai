import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function input() { try { const raw=readFileSync(0,"utf8").trim(); return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
function phaseItems(plan) {
  const phase=plan.match(/## Phase 56:[\s\S]*?(?=\n## Phase |$)/)?.[0] ?? "";
  return [...phase.matchAll(/^- \[([ x])\] (.+)$/gm)].map((match)=>({complete:match[1]==="x",label:match[2].trim()}));
}

const mode=process.argv[2] ?? "stop";
const root=resolve(input().cwd || process.cwd());
const planPath=resolve(root,"agent/planning-with-files/task_plan.md");
const evidencePath=resolve(root,"STITCH_UI_EVIDENCE.md");
let items=[]; let evidence="";
try { items=phaseItems(readFileSync(planPath,"utf8")); evidence=readFileSync(evidencePath,"utf8"); } catch {}
const required=["projects/16353832066758496067","assets/dfc4619bb6af499394c5c7afed65bcda","## Generated screens","## Control validation","## Implementation evidence","## Production evidence"];
const evidenceMissing=required.filter((marker)=>!evidence.includes(marker));
const filesMissing=["scripts/verify-stitch-ui.mjs","tests/api/stitch-ui-workflows.test.ts"].filter((file)=>!existsSync(resolve(root,file)));
const remaining=items.filter((item)=>!item.complete);
if(items.length && !remaining.length && !evidenceMissing.length && !filesMissing.length) process.exit(0);
const problems=[...remaining.map((item)=>item.label),...evidenceMissing.map((item)=>`Evidence marker: ${item}`),...filesMissing.map((item)=>`Required verifier: ${item}`)];
const summary=problems.map((item,index)=>`${index+1}. ${item}`).join("\n");
process.stdout.write(JSON.stringify({
  continue: mode === "session",
  stopReason: mode === "stop" ? "Stitch UI/UX completion evidence is incomplete" : undefined,
  systemMessage: `Issue #56 remains active. Continue the Stitch-driven UI/UX implementation and do not claim completion. ${problems.length} gates remain:\n${summary}`,
}));
