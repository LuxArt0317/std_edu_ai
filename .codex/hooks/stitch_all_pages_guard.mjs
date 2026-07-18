import fs from "node:fs";
import path from "node:path";

const root=process.env.CODEX_PROJECT_DIR || process.cwd();
const plan=fs.readFileSync(path.join(root,"agent/planning-with-files/task_plan.md"),"utf8");
const evidence=fs.readFileSync(path.join(root,"STITCH_ALL_PAGES_EVIDENCE.md"),"utf8");
const phase=plan.match(/## Phase 58:[\s\S]*?(?=\n## Phase \d+:|$)/)?.[0] || "";
const unchecked=[...phase.matchAll(/^- \[ \] (.+)$/gm)].map((match)=>match[1]);
const rows=evidence.split("\n").filter((line)=>/^\| (?!---|Surface)/.test(line));
const incompleteRows=rows.filter((line)=>/\| pending \|/.test(line));
const required=["## Control validation findings","## Implementation evidence","## Production evidence"];
const missing=required.filter((marker)=>!evidence.includes(marker));

if(unchecked.length || rows.length!==23 || incompleteRows.length || missing.length){
  const reasons=[...unchecked, rows.length!==23?`page matrix has ${rows.length}/23 surfaces`:"", incompleteRows.length?`${incompleteRows.length} page rows remain pending`:"", ...missing.map((item)=>`missing ${item}`)].filter(Boolean);
  process.stdout.write(JSON.stringify({continue:false,stopReason:"Issue #58 all-page Stitch coverage is incomplete",systemMessage:`Continue Issue #58; do not claim completion. ${reasons.length} gates remain:\n${reasons.map((item,index)=>`${index+1}. ${item}`).join("\n")}`}));
}
