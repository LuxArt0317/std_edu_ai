import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import fs from "node:fs";
import {createClient} from "@supabase/supabase-js";

function env(path){if(!fs.existsSync(path))return{};return Object.fromEntries(fs.readFileSync(path,"utf8").split(/\r?\n/).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1)];}));}
Object.assign(process.env,env(".env"),env(".env.local"));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const client=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
async function login(email){const secret=spawnSync("/usr/bin/security",["find-internet-password","-w","-s","www.stu.best","-a",email],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});if(secret.status!==0||!secret.stdout.trim())throw new Error(`Missing protected credential for ${email}`);const db=client();const auth=await db.auth.signInWithPassword({email,password:secret.stdout.trim()});if(auth.error||!auth.data.user)throw auth.error||new Error("Authentication failed");return{db,user:auth.data.user};}
function required(result,label){if(result.error)throw new Error(`${label}: ${result.error.message}`);if(result.data===null||result.data===undefined)throw new Error(`${label}: no data`);return result.data;}
const [owner,admin,librarian,student]=await Promise.all([
  login("winsonbaring10@gmail.com"),login("winsonbaring10+admin@gmail.com"),login("winsonbaring10+librarian@gmail.com"),login("winsonbaring10+student@gmail.com")
]);
const suffix=Date.now().toString(36).toUpperCase();
let datasetId="",versionId="",runId="",cleanup=null,workflowError=null;
const fixtureCases=[
  ["admissions-en", "admissions","en","answerable","answered",false],
  ["enrollment-zh","enrollment","zh-Hant","ambiguous","clarification",true],
  ["graduation-mixed","graduation","mixed","conflict","handoff",true],
  ["rules-expired","academic_rules","en","expired","abstained",true],
  ["program-private","programs","zh-Hant","private","abstained",true],
  ["services-unanswerable","student_services","mixed","unanswerable","abstained",true],
  ["campus-decision","campus_places","en","official_decision","handoff",true],
  ["faq-answer","faq","zh-Hant","answerable","answered",false],
];
try{
  const dataset=required(await owner.db.from("ai_eval_datasets").insert({name:`Issue124 verification ${suffix}`,description:"Reversible synthetic evaluation fixture.",owner_profile_id:owner.user.id,status:"draft",is_fixture:true}).select("id").single(),"dataset");datasetId=dataset.id;
  const version=required(await owner.db.from("ai_eval_dataset_versions").insert({dataset_id:datasetId,version:1,status:"draft",required_case_count:150}).select("id").single(),"version");versionId=version.id;
  const premature=await owner.db.rpc("freeze_ai_eval_dataset",{p_version_id:versionId,p_fixture_override:false});
  if(!premature.error)throw new Error("Ordinary freeze accepted fewer than 150 cases.");
  const rows=fixtureCases.map(([key,domain,language,failure,state,abstain],index)=>{
    const expected=abstain?[]:[randomUUID()];const forbidden=["expired","private"].includes(failure)?[randomUUID()]:[];
    return {dataset_version_id:versionId,author_id:owner.user.id,case_key:`issue124-${suffix}-${key}`,domain,language,query:`Synthetic ${key} evaluation question ${suffix}`,expected_chunk_ids:expected,expected_claims:[{claim:"synthetic",required:!abstain}],expect_abstention:abstain,rubric:{synthetic_only:true,ordinal:index},failure_class:failure,critical:["admissions","graduation","academic_rules"].includes(domain),expected_terminal_state:state,forbidden_chunk_ids:forbidden,lifecycle_status:"review",reviewed_by:null,reviewed_at:null};
  });
  const created=required(await owner.db.from("ai_eval_cases").insert(rows).select("id,expected_chunk_ids,forbidden_chunk_ids,expect_abstention"),"cases");
  const selfReview=await owner.db.rpc("review_ai_eval_case",{p_case_id:created[0].id,p_decision:"approve",p_evidence_accuracy:1,p_rubric_clarity:1,p_notes:"Author self review must fail."});
  if(!selfReview.error)throw new Error("Author self-approval was accepted.");
  for(const item of created){
    required(await admin.db.rpc("review_ai_eval_case",{p_case_id:item.id,p_decision:"approve",p_evidence_accuracy:1,p_rubric_clarity:1,p_notes:"Independent administrator evidence review approved."}),"admin review");
    required(await librarian.db.rpc("review_ai_eval_case",{p_case_id:item.id,p_decision:"approve",p_evidence_accuracy:1,p_rubric_clarity:1,p_notes:"Independent librarian source and rubric review approved."}),"librarian review");
  }
  const duplicate=await admin.db.rpc("review_ai_eval_case",{p_case_id:created[0].id,p_decision:"approve",p_evidence_accuracy:1,p_rubric_clarity:1,p_notes:"Duplicate review must fail."});
  if(!duplicate.error)throw new Error("Duplicate reviewer approval was accepted.");
  const eligible=required(await owner.db.from("ai_eval_cases").select("id,lifecycle_status").eq("dataset_version_id",versionId),"eligible cases");
  if(eligible.length!==fixtureCases.length||eligible.some((item)=>item.lifecycle_status!=="eligible"))throw new Error("Two approvals did not make every case eligible.");
  const reviewEvidence=required(await owner.db.from("ai_eval_case_reviews").select("case_id,reviewer_id,decision").in("case_id",created.map((item)=>item.id)),"reviews");
  if(reviewEvidence.length!==fixtureCases.length*2||new Set(reviewEvidence.map((item)=>`${item.case_id}:${item.reviewer_id}`)).size!==reviewEvidence.length)throw new Error("Independent review evidence is incomplete.");
  const frozen=required(await owner.db.rpc("freeze_ai_eval_dataset",{p_version_id:versionId,p_fixture_override:true}),"fixture freeze");
  if(!/^[0-9a-f]{64}$/.test(frozen.checksum)||frozen.coverage.cases!==fixtureCases.length||frozen.fixture_override!==true)throw new Error("Frozen fixture checksum or coverage is invalid.");
  const mutate=await owner.db.from("ai_eval_cases").update({query:"mutation forbidden"}).eq("id",created[0].id).select("id");
  if(!mutate.error&&mutate.data?.length)throw new Error("Frozen case mutation was accepted.");
  const missingConfig=await owner.db.rpc("start_ai_eval_run",{p_dataset_version_id:versionId,p_corpus_version:"",p_retriever_version:"hybrid-v1",p_prompt_version:"prompt-v1",p_model:"model-v1",p_evaluator_version:"eval-v1",p_top_k:5,p_baseline_run_id:null});
  if(!missingConfig.error)throw new Error("A run with missing version configuration was accepted.");
  runId=required(await owner.db.rpc("start_ai_eval_run",{p_dataset_version_id:versionId,p_corpus_version:"fixture-corpus-v1",p_retriever_version:"hybrid-v1",p_prompt_version:"public-rag-v2",p_model:"gpt-4.1-mini",p_evaluator_version:"deterministic-v1",p_top_k:5,p_baseline_run_id:null}),"start run");
  for(let index=0;index<created.length;index++){
    const item=created[index],answerable=!item.expect_abstention,retrieved=answerable?[item.expected_chunk_ids[0]]:[],cited=answerable?[item.expected_chunk_ids[0]]:[];
    required(await owner.db.rpc("record_ai_eval_result",{p_run_id:runId,p_case_id:item.id,p_answer_id:null,p_retrieved_chunk_ids:retrieved,p_cited_chunk_ids:cited,p_supported_answer_correctness:1,p_unsupported_material_claims:0,p_material_claims:answerable?1:0,p_contradiction_correct:fixtureCases[index][3]==="conflict"?true:null,p_bilingual_equivalence:1,p_latency_ms:700+index*100,p_estimated_cost_usd:0.001,p_reviewer_notes:"Synthetic deterministic reconciliation."}),"score case");
  }
  const finalized=required(await owner.db.rpc("finalize_ai_eval_run",{p_run_id:runId}),"finalize");
  if(finalized.gate_status!=="passed"||Number(finalized.metrics.recall_at_5)!==1||Number(finalized.metrics.mrr)!==1||Number(finalized.metrics.citation_precision)!==1||Number(finalized.metrics.citation_completeness)!==1||Number(finalized.metrics.leakage_count)!==0)throw new Error(`Reference-perfect run did not reconcile exactly: ${JSON.stringify(finalized)}`);
  const report=required(await owner.db.rpc("ai_eval_report",{p_run_id:runId}),"report");
  const sections=new Set(report.map((item)=>item.section));
  if(!["overall","domain","language","failure_class"].every((section)=>sections.has(section)))throw new Error("Report lacks required breakdowns.");
  const anonymous=client();const anonRead=await anonymous.from("ai_eval_datasets").select("id").eq("id",datasetId);
  if(!anonRead.error)throw new Error("Anonymous evaluation read succeeded.");
  const studentRead=await student.db.from("ai_eval_datasets").select("id").eq("id",datasetId);
  if(!studentRead.error&&studentRead.data?.length)throw new Error("Student evaluation read succeeded.");
  const studentRun=await student.db.rpc("start_ai_eval_run",{p_dataset_version_id:versionId,p_corpus_version:"x1",p_retriever_version:"x1",p_prompt_version:"x1",p_model:"x1",p_evaluator_version:"x1",p_top_k:5,p_baseline_run_id:null});
  if(!studentRun.error)throw new Error("Student evaluation mutation succeeded.");
}catch(error){workflowError=error;}finally{
  if(datasetId){const result=await owner.db.rpc("purge_ai_eval_fixture",{p_dataset_id:datasetId});if(result.error&&!workflowError)workflowError=result.error;else cleanup=result.data;}
  const residue=datasetId?await owner.db.from("ai_eval_datasets").select("id").eq("id",datasetId):{data:[]};
  if(residue.data?.length&&!workflowError)workflowError=new Error("Evaluation fixture cleanup left residue.");
  await Promise.all([owner.db.auth.signOut(),admin.db.auth.signOut(),librarian.db.auth.signOut(),student.db.auth.signOut()]);
}
if(workflowError)throw workflowError;
if(!cleanup?.purged||cleanup.cases!==fixtureCases.length||cleanup.reviews!==fixtureCases.length*2||cleanup.runs!==1||cleanup.results!==fixtureCases.length)throw new Error(`Unexpected cleanup evidence: ${JSON.stringify(cleanup)}`);
console.log(JSON.stringify({ordinaryFreezeBelow150:0,fixtureCases:fixtureCases.length,languages:3,domains:8,failureClasses:7,independentApprovals:fixtureCases.length*2,selfApprovals:0,duplicateApprovals:0,frozenMutations:0,missingVersionRuns:0,metricReconciliationDifference:0,aggregateBreakdowns:["overall","domain","language","failure_class"],privateExpiredLeakage:0,unauthorizedReads:0,unauthorizedMutations:0,cleanup,residualFixtures:0,syntheticOnly:true}));
