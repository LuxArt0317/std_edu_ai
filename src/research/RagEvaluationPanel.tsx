import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmUser } from "../crm/authService";
import { supabase } from "../utils/supabase";

type Dataset = { id:string; name:string; description:string; status:string; owner_profile_id:string; is_fixture:boolean };
type Version = { id:string; dataset_id:string; version:number; status:string; required_case_count:number; checksum:string|null; coverage:Record<string,number>; frozen_at:string|null };
type Case = { id:string; dataset_version_id:string|null; case_key:string; domain:string; language:string; query:string; failure_class:string; expected_terminal_state:string; lifecycle_status:string; author_id:string|null; expected_chunk_ids:string[]; forbidden_chunk_ids:string[] };
type Review = { id:string; case_id:string; reviewer_id:string; decision:string };
type Run = { id:string; dataset_version_id:string|null; status:string; gate_status:string; model:string; corpus_version:string; retriever_version:string; prompt_version:string; evaluator_version:string|null; metrics:Record<string,number>; created_at:string };
type ReportRow = { section:string; dimension:string; case_count:number; metrics:Record<string,number> };
type JsonObject = Record<string, unknown>;

const permittedRoles = new Set(["owner","admin","librarian"]);
const apiUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/,"");
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function dataRequest<T>(path:string, init:RequestInit={}):Promise<T> {
  if (!supabase || !apiUrl || !publishableKey) throw new Error("Evaluation storage is not configured.");
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("Your authenticated session has expired.");
  const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type":"application/json",
      ...(init.method && init.method !== "GET" ? {Prefer:"return=representation"} : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Evaluation request failed.");
  return payload as T;
}
async function rpc<T>(name:string, body:JsonObject):Promise<T> {
  return dataRequest<T>(`rpc/${name}`, {method:"POST",body:JSON.stringify(body)});
}
function download(name:string,content:string,type:string) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const anchor=document.createElement("a"); anchor.href=url; anchor.download=name; anchor.click();
  URL.revokeObjectURL(url);
}
function csvCell(value:unknown) { return `"${String(value ?? "").replaceAll('"','""')}"`; }

export function RagEvaluationPanel({currentUser,onMessage}:{currentUser?:CrmUser;onMessage:(message:string)=>void}) {
  const allowed=Boolean(currentUser&&permittedRoles.has(currentUser.role));
  const [datasets,setDatasets]=useState<Dataset[]>([]);
  const [versions,setVersions]=useState<Version[]>([]);
  const [cases,setCases]=useState<Case[]>([]);
  const [reviews,setReviews]=useState<Review[]>([]);
  const [runs,setRuns]=useState<Run[]>([]);
  const [selectedDataset,setSelectedDataset]=useState("");
  const [selectedVersion,setSelectedVersion]=useState("");
  const [selectedRun,setSelectedRun]=useState("");
  const [report,setReport]=useState<ReportRow[]>([]);
  const [busy,setBusy]=useState(false);
  const [datasetName,setDatasetName]=useState("");
  const [caseDraft,setCaseDraft]=useState({caseKey:"",domain:"admissions",language:"en",query:"",failureClass:"answerable",terminalState:"answered",expectedChunks:"",forbiddenChunks:""});
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
  const [runConfig,setRunConfig]=useState({corpus:"stu-public-v1",retriever:"hybrid-v1",prompt:"public-rag-v2",model:"gpt-4.1-mini",evaluator:"deterministic-v1"});
  const [resultImport,setResultImport]=useState("");

  const load=useCallback(async()=>{
    const [d,v,c,rv,r]=await Promise.all([
      dataRequest<Dataset[]>("ai_eval_datasets?select=*&order=created_at.desc"),
      dataRequest<Version[]>("ai_eval_dataset_versions?select=*&order=created_at.desc"),
      dataRequest<Case[]>("ai_eval_cases?select=id,dataset_version_id,case_key,domain,language,query,failure_class,expected_terminal_state,lifecycle_status,author_id,expected_chunk_ids,forbidden_chunk_ids&order=updated_at.desc"),
      dataRequest<Review[]>("ai_eval_case_reviews?select=id,case_id,reviewer_id,decision&order=created_at.desc"),
      dataRequest<Run[]>("ai_eval_runs?select=id,dataset_version_id,status,gate_status,model,corpus_version,retriever_version,prompt_version,evaluator_version,metrics,created_at&order=created_at.desc"),
    ]);
    setDatasets(d);setVersions(v);setCases(c);setReviews(rv);setRuns(r);
    setSelectedDataset((value)=>value||d[0]?.id||"");
  },[]);
  useEffect(()=>{if(allowed)void load().catch((error)=>onMessage(error instanceof Error?error.message:"Evaluation evidence could not load."));},[allowed,load,onMessage]);
  useEffect(()=>{
    const valid=versions.filter((item)=>item.dataset_id===selectedDataset);
    setSelectedVersion((value)=>valid.some((item)=>item.id===value)?value:valid[0]?.id||"");
  },[selectedDataset,versions]);

  const version=versions.find((item)=>item.id===selectedVersion);
  const visibleCases=cases.filter((item)=>item.dataset_version_id===selectedVersion);
  const eligible=visibleCases.filter((item)=>item.lifecycle_status==="eligible");
  const reviewable=visibleCases.filter((item)=>item.author_id!==currentUser?.id&&["draft","review"].includes(item.lifecycle_status));
  const run=runs.find((item)=>item.id===selectedRun);
  const approvals=useMemo(()=>new Map(visibleCases.map((item)=>[item.id,reviews.filter((review)=>review.case_id===item.id&&review.decision==="approve").length])),[visibleCases,reviews]);

  async function perform(work:()=>Promise<void>,success:string) {
    setBusy(true);
    try { await work(); await load(); onMessage(success); }
    catch(error){onMessage(error instanceof Error?error.message:"Evaluation action failed.");}
    finally{setBusy(false);}
  }
  if(!allowed)return null;
  return <section className="rag-evaluation">
    <header>
      <div><span>RESEARCH EVALUATION CONTROL PLANE</span><h3>Gold set, scoring, and regression gates</h3><p>Only frozen, independently reviewed cases can enter a production run. Synthetic fixtures never count toward the ≥150-case research claim.</p></div>
      <button type="button" disabled={busy} onClick={()=>void perform(async()=>undefined,"Evaluation evidence refreshed.")}>{busy?"Working…":"Refresh"}</button>
    </header>

    <div className="rag-eval-metrics">
      <article><span>Datasets</span><strong>{datasets.length}</strong></article>
      <article><span>Frozen versions</span><strong>{versions.filter((item)=>item.status==="frozen").length}</strong></article>
      <article><span>Eligible cases</span><strong>{cases.filter((item)=>item.lifecycle_status==="eligible").length}</strong></article>
      <article><span>Completed runs</span><strong>{runs.filter((item)=>item.status==="completed").length}</strong></article>
    </div>

    <div className="rag-eval-selectors">
      <label>Dataset<select value={selectedDataset} onChange={(event)=>setSelectedDataset(event.target.value)}><option value="">Select dataset</option>{datasets.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Version<select value={selectedVersion} onChange={(event)=>setSelectedVersion(event.target.value)}><option value="">Select version</option>{versions.filter((item)=>item.dataset_id===selectedDataset).map((item)=><option key={item.id} value={item.id}>v{item.version} · {item.status}</option>)}</select></label>
      <label>Run<select value={selectedRun} onChange={(event)=>{setSelectedRun(event.target.value);setReport([]);}}><option value="">Select run</option>{runs.filter((item)=>!selectedVersion||item.dataset_version_id===selectedVersion).map((item)=><option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString()} · {item.status}/{item.gate_status}</option>)}</select></label>
    </div>

    {!datasets.length&&<details open className="rag-eval-action"><summary>Create the first governed dataset</summary><form onSubmit={(event)=>{event.preventDefault();void perform(async()=>{const rows=await dataRequest<Dataset[]>("ai_eval_datasets",{method:"POST",body:JSON.stringify({name:datasetName,description:"Governed bilingual RAG evaluation dataset.",owner_profile_id:currentUser?.id,status:"draft"})});await dataRequest<Version[]>("ai_eval_dataset_versions",{method:"POST",body:JSON.stringify({dataset_id:rows[0].id,version:1,status:"draft",required_case_count:150})});setDatasetName("");},"Evaluation dataset and version created.");}}><label>Dataset name<input required minLength={3} value={datasetName} onChange={(event)=>setDatasetName(event.target.value)}/></label><button disabled={busy}>Create dataset</button></form></details>}

    {selectedDataset&&<details className="rag-eval-action"><summary>Create another dataset version</summary><button type="button" disabled={busy} onClick={()=>void perform(async()=>{const next=Math.max(0,...versions.filter((item)=>item.dataset_id===selectedDataset).map((item)=>item.version))+1;await dataRequest("ai_eval_dataset_versions",{method:"POST",body:JSON.stringify({dataset_id:selectedDataset,version:next,status:"draft",required_case_count:150})});},"Draft dataset version created.")}>Create next version</button></details>}

    {version&&<section className="rag-eval-version">
      <div><span>VERSION STATE</span><strong>v{version.version} · {version.status}</strong><small>{eligible.length} eligible / {version.required_case_count} required{version.checksum?` · checksum ${version.checksum.slice(0,12)}…`:""}</small></div>
      {version.status==="draft"&&<button type="button" disabled={busy} onClick={()=>void perform(async()=>{await rpc("freeze_ai_eval_dataset",{p_version_id:version.id,p_fixture_override:false});},"Dataset version frozen.")}>Freeze when complete</button>}
    </section>}

    {version?.status==="draft"&&<details className="rag-eval-action"><summary>Author a gold case</summary><form className="rag-eval-case-form" onSubmit={(event)=>{event.preventDefault();void perform(async()=>{
      const expected=caseDraft.expectedChunks.split(/[\s,]+/).filter(Boolean), forbidden=caseDraft.forbiddenChunks.split(/[\s,]+/).filter(Boolean);
      await dataRequest("ai_eval_cases",{method:"POST",body:JSON.stringify({dataset_version_id:version.id,author_id:currentUser?.id,case_key:caseDraft.caseKey,domain:caseDraft.domain,language:caseDraft.language,query:caseDraft.query,expected_chunk_ids:expected,expected_claims:[],expect_abstention:caseDraft.terminalState!=="answered",rubric:{scoring:"independent_review"},failure_class:caseDraft.failureClass,critical:["admissions","graduation","academic_rules"].includes(caseDraft.domain),expected_terminal_state:caseDraft.terminalState,forbidden_chunk_ids:forbidden,lifecycle_status:"review"})});
      setCaseDraft({...caseDraft,caseKey:"",query:"",expectedChunks:"",forbiddenChunks:""});
    },"Gold case submitted for independent review.");}}><label>Case key<input required value={caseDraft.caseKey} onChange={(event)=>setCaseDraft({...caseDraft,caseKey:event.target.value})}/></label><label>Domain<select value={caseDraft.domain} onChange={(event)=>setCaseDraft({...caseDraft,domain:event.target.value})}>{["admissions","enrollment","graduation","academic_rules","programs","student_services","campus_places","faq"].map((item)=><option key={item}>{item}</option>)}</select></label><label>Language<select value={caseDraft.language} onChange={(event)=>setCaseDraft({...caseDraft,language:event.target.value})}><option value="en">English</option><option value="zh-Hant">Traditional Chinese</option><option value="mixed">Mixed</option></select></label><label>Failure class<select value={caseDraft.failureClass} onChange={(event)=>setCaseDraft({...caseDraft,failureClass:event.target.value})}>{["answerable","ambiguous","conflict","expired","private","unanswerable","official_decision"].map((item)=><option key={item}>{item}</option>)}</select></label><label>Expected state<select value={caseDraft.terminalState} onChange={(event)=>setCaseDraft({...caseDraft,terminalState:event.target.value})}>{["answered","clarification","abstained","handoff"].map((item)=><option key={item}>{item}</option>)}</select></label><label className="wide">Question<textarea required value={caseDraft.query} onChange={(event)=>setCaseDraft({...caseDraft,query:event.target.value})}/></label><label className="wide">Expected chunk UUIDs <small>Comma or whitespace separated; leave empty only for abstention/handoff cases.</small><textarea value={caseDraft.expectedChunks} onChange={(event)=>setCaseDraft({...caseDraft,expectedChunks:event.target.value})}/></label><label className="wide">Forbidden private/expired chunk UUIDs<textarea value={caseDraft.forbiddenChunks} onChange={(event)=>setCaseDraft({...caseDraft,forbiddenChunks:event.target.value})}/></label><button disabled={busy}>Submit for review</button></form></details>}

    <details className="rag-eval-action"><summary>Independent review queue ({reviewable.length})</summary><div className="rag-eval-review-list">{reviewable.map((item)=><article key={item.id}><div><span>{item.language} · {item.domain} · {item.failure_class}</span><strong>{item.query}</strong><small>{approvals.get(item.id)||0} of 2 approvals</small></div><textarea aria-label={`Review notes for ${item.case_key}`} placeholder="Evidence and rubric review notes" value={reviewNotes[item.id]||""} onChange={(event)=>setReviewNotes({...reviewNotes,[item.id]:event.target.value})}/><div>{(["approve","request_changes","reject"] as const).map((decision)=><button key={decision} type="button" disabled={busy||reviews.some((review)=>review.case_id===item.id&&review.reviewer_id===currentUser?.id)} onClick={()=>void perform(async()=>{await rpc("review_ai_eval_case",{p_case_id:item.id,p_decision:decision,p_evidence_accuracy:decision==="approve"?1:0.5,p_rubric_clarity:decision==="approve"?1:0.5,p_notes:reviewNotes[item.id]||`${decision.replace("_"," ")} after independent evidence review.`});},"Independent review recorded.")}>{decision.replace("_"," ")}</button>)}</div></article>)}</div></details>

    {version?.status==="frozen"&&<details className="rag-eval-action"><summary>Start a reproducible evaluation run</summary><form className="rag-eval-run-form" onSubmit={(event)=>{event.preventDefault();void perform(async()=>{const id=await rpc<string>("start_ai_eval_run",{p_dataset_version_id:version.id,p_corpus_version:runConfig.corpus,p_retriever_version:runConfig.retriever,p_prompt_version:runConfig.prompt,p_model:runConfig.model,p_evaluator_version:runConfig.evaluator,p_top_k:5,p_baseline_run_id:selectedRun||null});setSelectedRun(id);},"Evaluation run started.");}}>{Object.entries(runConfig).map(([key,value])=><label key={key}>{key}<input required value={value} onChange={(event)=>setRunConfig({...runConfig,[key]:event.target.value})}/></label>)}<button disabled={busy}>Start frozen run</button></form></details>}

    {run?.status==="running"&&<details className="rag-eval-action"><summary>Import deterministic case observations</summary><p>JSON array fields: caseId, answerId, retrievedChunkIds, citedChunkIds, correctness, unsupportedClaims, materialClaims, contradictionCorrect, bilingualEquivalence, latencyMs, costUsd, notes.</p><textarea value={resultImport} onChange={(event)=>setResultImport(event.target.value)} placeholder='[{"caseId":"…","retrievedChunkIds":[],"citedChunkIds":[],"correctness":1,…}]'/><button disabled={busy} type="button" onClick={()=>void perform(async()=>{const rows=JSON.parse(resultImport) as JsonObject[];for(const row of rows)await rpc("record_ai_eval_result",{p_run_id:run.id,p_case_id:row.caseId,p_answer_id:row.answerId||null,p_retrieved_chunk_ids:row.retrievedChunkIds||[],p_cited_chunk_ids:row.citedChunkIds||[],p_supported_answer_correctness:row.correctness,p_unsupported_material_claims:row.unsupportedClaims,p_material_claims:row.materialClaims,p_contradiction_correct:row.contradictionCorrect??null,p_bilingual_equivalence:row.bilingualEquivalence??null,p_latency_ms:row.latencyMs,p_estimated_cost_usd:row.costUsd,p_reviewer_notes:row.notes||null});await rpc("finalize_ai_eval_run",{p_run_id:run.id});setResultImport("");},"Run observations reconciled and finalized.")}>Score and finalize</button></details>}

    {run?.status==="completed"&&<section className="rag-eval-report"><header><div><span>{run.gate_status.toUpperCase()}</span><h4>Versioned evaluation report</h4><p>{run.model} · {run.corpus_version} · {run.retriever_version} · {run.prompt_version} · {run.evaluator_version}</p></div><div><button type="button" onClick={()=>void perform(async()=>{const rows=await rpc<ReportRow[]>("ai_eval_report",{p_run_id:run.id});setReport(rows);},"Evaluation breakdown loaded.")}>Load breakdown</button><button type="button" onClick={()=>download(`rag-eval-${run.id}.json`,JSON.stringify({run,report},null,2),"application/json")}>Export JSON</button><button type="button" onClick={()=>download(`rag-eval-${run.id}.csv`,["section,dimension,case_count,metrics",...report.map((row)=>[row.section,row.dimension,row.case_count,JSON.stringify(row.metrics)].map(csvCell).join(","))].join("\n"),"text/csv")}>Export CSV</button></div></header><div className="rag-eval-metrics">{Object.entries(run.metrics||{}).map(([key,value])=><article key={key}><span>{key.replaceAll("_"," ")}</span><strong>{typeof value==="number"?Number(value).toFixed(3):String(value)}</strong></article>)}</div>{report.length>0&&<table><thead><tr><th>Section</th><th>Dimension</th><th>Cases</th><th>Metrics</th></tr></thead><tbody>{report.map((row)=><tr key={`${row.section}-${row.dimension}`}><td>{row.section}</td><td>{row.dimension}</td><td>{row.case_count}</td><td><code>{JSON.stringify(row.metrics)}</code></td></tr>)}</tbody></table>}</section>}
  </section>;
}

