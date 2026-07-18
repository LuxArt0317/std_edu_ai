import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.platform !== "darwin") throw new Error("The role evidence test requires the protected macOS Keychain credentials.");
const environment = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const at=line.indexOf("="); return [line.slice(0,at),line.slice(at+1)]; }));
const accounts = [
  ["owner","winsonbaring10@gmail.com"],["admin","winsonbaring10+admin@gmail.com"],["president","winsonbaring10+president@gmail.com"],["vice_president","winsonbaring10+vice-president@gmail.com"],["dean","winsonbaring10+dean@gmail.com"],["registrar","winsonbaring10+registrar@gmail.com"],["department_head","winsonbaring10+department-head@gmail.com"],["faculty","winsonbaring10+faculty@gmail.com"],["advisor","winsonbaring10+advisor@gmail.com"],["admissions","winsonbaring10+admissions@gmail.com"],["finance","winsonbaring10+finance@gmail.com"],["support","winsonbaring10+support@gmail.com"],["librarian","winsonbaring10+librarian@gmail.com"],["student","winsonbaring10+student@gmail.com"],
];
const visibility = {
  owner:["profiles","students","courses","cases","campaigns","knowledge_articles","institutional_initiatives"], admin:["profiles","students","cases","campaigns","knowledge_articles","institutional_initiatives"], president:["profiles","students","cases","campaigns","institutional_initiatives"], vice_president:["profiles","students","cases","campaigns","institutional_initiatives"], dean:["profiles","students","courses","course_sections","institutional_initiatives"], registrar:["profiles","students","academic_terms","admission_handoffs","institutional_initiatives"], department_head:["profiles","students","course_sections","student_signals","institutional_initiatives"], faculty:["profiles","course_sections","assessment_answer_keys","cases"], advisor:["profiles","students","cases","student_signals"], admissions:["profiles","admission_leads","campaigns","admission_handoffs"], finance:["profiles","students","cases","student_signals"], support:["profiles","students","cases","knowledge_articles"], librarian:["profiles","knowledge_articles","announcements"], student:["profiles","students","course_sections","grades"],
};
const sensitiveAllowed = new Set(["owner","admin","president","vice_president","dean","registrar","advisor","finance","support"]);
const campaignAllowed = new Set(["owner","admin","president","vice_president","admissions","support"]);
const handoffAllowed = new Set(["owner","admin","admissions"]);
const assignmentRemovalAllowed = new Set(["owner","admin","registrar","dean","department_head"]);
const accountDirectoryAllowed = new Set(["owner","admin"]);
const initiativeAllowed = new Set(["owner","admin","president","vice_president","dean","department_head"]);
const missingId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function passwordFor(email) {
  const result=spawnSync("/usr/bin/security",["find-internet-password","-w","-s","www.stu.best","-a",email],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
  if(result.status!==0 || !result.stdout.trim()) throw new Error(`Keychain credential missing for ${email}.`);
  return result.stdout.trim();
}
function denied(error) { return Boolean(error && /not authorized|permission denied/i.test(error.message)); }

const results=[];
for (const [role,email] of accounts) {
  const client=createClient(environment.VITE_SUPABASE_URL,environment.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await client.auth.signInWithPassword({email,password:passwordFor(email)});
  if(auth.error || auth.data.user?.app_metadata.role!==role) throw auth.error || new Error(`${role} trusted role mismatch.`);
  const counts={};
  for(const table of visibility[role]) { const query=await client.from(table).select("*",{count:"exact",head:true}); if(query.error) throw new Error(`${role} cannot read required ${table}: ${query.error.message}`); counts[table]=query.count ?? 0; }
  const keys=await client.from("assessment_answer_keys").select("*",{count:"exact",head:true}); if(keys.error) throw keys.error;
  if(role==="student" && keys.count!==0) throw new Error("Student can read protected answer keys.");
  if(role==="student" || role==="faculty") {
    const directExplanation=await client.from("assessment_questions").select("id,explanation").limit(1); if(!directExplanation.error) throw new Error(`${role} bypassed the governed explanation reader.`);
    const governedQuestions=await client.rpc("read_assessment_questions"); if(governedQuestions.error) throw governedQuestions.error;
    if(role==="student" && governedQuestions.data.some((item)=>item.explanation)) throw new Error("Student received an unreleased answer explanation.");
    if(role==="faculty" && !governedQuestions.data.some((item)=>item.explanation)) throw new Error("Faculty could not review assessment explanations.");
  }
  const checks=[
    [sensitiveAllowed.has(role),await client.rpc("record_sensitive_case_access",{p_case_id:missingId,p_purpose:"Production authorization evidence check."}),"sensitive case"],
    [campaignAllowed.has(role),await client.rpc("approve_and_send_campaign",{p_campaign_id:missingId,p_reason:"Production authorization evidence check."}),"bulk campaign"],
    [handoffAllowed.has(role),await client.rpc("request_admission_handoff",{p_lead_id:missingId,p_notes:"Production authorization evidence check."}),"admission handoff"],
    [assignmentRemovalAllowed.has(role),await client.rpc("remove_profile_section_assignment",{p_assignment_id:missingId,p_reason:"Production authorization evidence check."}),"responsibility removal"],
    [initiativeAllowed.has(role),await client.rpc("transition_institutional_initiative",{p_initiative_id:missingId,p_action:"assign",p_owner_id:auth.data.user.id,p_reason:"Production authorization evidence check."}),"institutional initiative"],
  ];
  for(const [allowed,outcome,label] of checks) { if(allowed ? denied(outcome.error) : !denied(outcome.error)) throw new Error(`${role} ${label} authorization did not match the catalog.`); }
  const directory=await client.functions.invoke("provision-role-account",{body:{action:"directory"}});
  if(accountDirectoryAllowed.has(role) ? (directory.error || !Array.isArray(directory.data?.accounts)) : !directory.error) throw new Error(`${role} account-directory authorization did not match the catalog.`);
  await client.auth.signOut(); results.push({role,requiredTables:Object.keys(counts).length,protectedAnswerKeys:keys.count,controlledChecks:checks.length});
  console.log(`${role} required=${Object.keys(counts).length} controlled=5 forbidden=verified`);
}
console.log(JSON.stringify({roles:results.length,requiredVisibilityChecks:results.reduce((sum,item)=>sum+item.requiredTables,0),controlledAuthorizationChecks:results.length*5,accountBoundaryChecks:results.length,studentAnswerKeys:0,status:"verified"}));
