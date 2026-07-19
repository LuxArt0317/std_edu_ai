import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {createClient} from "@supabase/supabase-js";

function env(path){if(!fs.existsSync(path))return{};return Object.fromEntries(fs.readFileSync(path,"utf8").split(/\r?\n/).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1)];}));}
Object.assign(process.env,env(".env"),env(".env.local"));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const client=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
async function login(email){const secret=spawnSync("/usr/bin/security",["find-internet-password","-w","-s","www.stu.best","-a",email],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});if(secret.status!==0)throw new Error(`Missing credential ${email}`);const db=client();const auth=await db.auth.signInWithPassword({email,password:secret.stdout.trim()});if(auth.error)throw auth.error;return db;}
const [owner,librarian,student]=await Promise.all([login("winsonbaring10@gmail.com"),login("winsonbaring10+librarian@gmail.com"),login("winsonbaring10+student@gmail.com")]);
const anon=client(),suffix=Date.now().toString(36).toUpperCase(),marker=`Issue127-${suffix}`;
const domains=["admissions","enrollment","graduation","academic_rules","programs","administrative_services","student_services","campus_places","faq","forms_policies"];
const payload=domains.map((domain,index)=>({canonical_url:`https://issue127-${suffix.toLowerCase()}.stu.edu.tw/${domain}`,title:`Issue 127 ${domain} candidate`,inventory_domain:domain,language:index%2?"zh-Hant":"mixed",source_type:index===7?"map":"website",owning_unit:"Issue 127 verification owner",discovery_method:"owner_submission",discovered_from:"https://www.stu.edu.tw/",http_status:200,final_url:`https://issue127-${suffix.toLowerCase()}.stu.edu.tw/${domain}`}));
let cleanup=null,workflowError=null,acceptedSourceId="";
try{
  const created=await owner.rpc("upsert_stu_source_candidates",{p_candidates:payload,p_fixture_marker:marker});
  if(created.error||created.data.seen!==10||created.data.inserted!==10||created.data.autoPublished!==0)throw created.error||new Error("Initial fixture reconciliation failed.");
  const replay=await owner.rpc("upsert_stu_source_candidates",{p_candidates:payload,p_fixture_marker:marker});
  if(replay.error||replay.data.inserted!==0||replay.data.updated!==10)throw replay.error||new Error("Replay was not idempotent.");
  const ownerRows=await owner.from("knowledge_source_candidates").select("*").eq("fixture_marker",marker);
  const librarianRows=await librarian.from("knowledge_source_candidates").select("id").eq("fixture_marker",marker);
  const studentRows=await student.from("knowledge_source_candidates").select("id").eq("fixture_marker",marker);
  const anonRows=await anon.from("knowledge_source_candidates").select("id").eq("fixture_marker",marker);
  if(ownerRows.error||ownerRows.data.length!==10||librarianRows.error||librarianRows.data.length!==10)throw ownerRows.error||librarianRows.error||new Error("Authorized inventory read failed.");
  if((!studentRows.error&&studentRows.data.length)||(!anonRows.error&&anonRows.data.length))throw new Error("Protected candidate inventory leaked.");
  const unauthorized=await student.rpc("upsert_stu_source_candidates",{p_candidates:payload,p_fixture_marker:null});
  const unauthorizedReport=await student.rpc("stu_source_inventory_report");
  if(!unauthorized.error||!unauthorizedReport.error)throw new Error("Student inventory authority was accepted.");
  const external=[{...payload[0],canonical_url:`https://example.com/${suffix}`,final_url:`https://example.com/${suffix}`}];
  const invalid=await owner.rpc("upsert_stu_source_candidates",{p_candidates:external,p_fixture_marker:marker});
  if(!invalid.error)throw new Error("External-host candidate was accepted.");
  const directTransition=await owner.from("knowledge_source_candidates").update({status:"rejected",reviewed_by:(await owner.auth.getUser()).data.user.id,review_reason:"Attempted direct governance bypass."}).eq("id",ownerRows.data[2].id);
  if(!directTransition.error)throw new Error("Direct candidate governance transition succeeded.");
  const accepted=await owner.rpc("review_stu_source_candidate",{p_candidate_id:ownerRows.data[0].id,p_decision:"accepted",p_reason:"Verified reversible acceptance into an inactive governed source.",p_department_id:null});
  if(accepted.error||accepted.data.status!=="accepted"||!accepted.data.source_id)throw accepted.error||new Error("Governed acceptance failed.");
  acceptedSourceId=accepted.data.source_id;
  const source=await owner.from("knowledge_sources").select("id,active,official_domain,canonical_url").eq("id",acceptedSourceId).single();
  const documents=await owner.from("knowledge_documents").select("id").eq("source_id",acceptedSourceId);
  if(source.error||source.data.active||!source.data.official_domain||documents.error||documents.data.length)throw source.error||documents.error||new Error("Acceptance bypassed inactive/review-only boundaries.");
  const rejected=await librarian.rpc("review_stu_source_candidate",{p_candidate_id:ownerRows.data[1].id,p_decision:"rejected",p_reason:"Reversible librarian rejection proves the governed decision path.",p_department_id:null});
  if(rejected.error||rejected.data.status!=="rejected")throw rejected.error||new Error("Librarian review failed.");
}catch(error){workflowError=error;}finally{
  cleanup=await owner.rpc("purge_issue127_fixture",{p_fixture_marker:marker});
  const residue=await owner.from("knowledge_source_candidates").select("id").eq("fixture_marker",marker);
  const sourceResidue=acceptedSourceId?await owner.from("knowledge_sources").select("id").eq("id",acceptedSourceId):{data:[],error:null};
  if((cleanup.error||cleanup.data?.candidates!==10||cleanup.data?.inactiveSources!==1||residue.error||residue.data.length||sourceResidue.error||sourceResidue.data.length)&&!workflowError)workflowError=cleanup.error||residue.error||sourceResidue.error||new Error("Issue 127 cleanup reconciliation failed.");
  await Promise.all([owner.auth.signOut(),librarian.auth.signOut(),student.auth.signOut()]);
}
if(workflowError)throw workflowError;
console.log(JSON.stringify({domainsCovered:10,fixtureCandidates:10,idempotentReplay:true,externalHostsAccepted:0,unauthorizedReads:0,unauthorizedMutations:0,directGovernanceBypasses:0,acceptedSourcesInactive:1,documentsAutoCreated:0,librarianReview:true,cleanupCandidates:cleanup.data.candidates,cleanupSources:cleanup.data.inactiveSources,residualFixtures:0}));
