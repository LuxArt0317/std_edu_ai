import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import schoolHandler from "../../api/school-assistant.ts";

function env(path){if(!fs.existsSync(path))return {};return Object.fromEntries(fs.readFileSync(path,"utf8").split(/\r?\n/).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const at=line.indexOf("=");return [line.slice(0,at),line.slice(at+1)];}));}
Object.assign(process.env,env(".env"),env(".env.local"));
const email="winsonbaring10@gmail.com";
const secret=spawnSync("/usr/bin/security",["find-internet-password","-w","-s","www.stu.best","-a",email],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
if(secret.status!==0||!secret.stdout.trim())throw new Error("Missing protected owner credential.");
const supabase=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:auth,error:signInError}=await supabase.auth.signInWithPassword({email,password:secret.stdout.trim()});
if(signInError||!auth.session||!auth.user)throw signInError||new Error("Owner sign-in failed.");

const suffix=Date.now().toString(36).toUpperCase();
const code=`M${suffix.slice(-7)}`;
let programId="";let planId="";let threadId="";let queueId="";let storagePath="";
try{
  const department=await supabase.from("departments").select("id").eq("status","active").limit(1).single();
  if(department.error)throw department.error;
  const program=await supabase.from("academic_programs").insert({department_id:department.data.id,code,name:`Manual curriculum verification ${suffix}`,level:"bachelor",duration_years:1,description:"Temporary Issue 90 verification record.",status:"active"}).select("id").single();
  if(program.error)throw program.error;programId=program.data.id;
  const payload={programCode:code,programName:`Manual curriculum verification ${suffix}`,description:"One-year manual curriculum verification.",durationYears:1,effectiveYear:2198,subjects:[{code:`${code}-101`,title:"Curriculum Studio Verification",description:"Temporary subject placement.",units:3,yearLevel:1,semester:2,category:"core",sortOrder:1,prerequisiteCodes:[]}],blocks:[{yearLevel:1,blockCode:`${code}-1A`,capacity:35}]};
  const created=await supabase.rpc("create_manual_academic_curriculum",{p_program_id:programId,p_idempotency_key:`manual-live-${suffix}`,p_payload:payload,p_reason:"Verify manual curriculum creation"});
  if(created.error||created.data?.subjects!==1)throw created.error||new Error("Manual curriculum creation did not persist one subject.");planId=created.data.planId;
  const placed=await supabase.from("curriculum_plan_courses").select("year_level,semester,courses!curriculum_plan_courses_course_id_fkey(code)").eq("plan_id",planId).single();
  if(placed.error||placed.data.year_level!==1||placed.data.semester!==2)throw placed.error||new Error("Curriculum placement was not persisted.");
  const deleted=await supabase.rpc("delete_draft_academic_curriculum",{p_plan_id:planId,p_reason:"Remove temporary live curriculum"});
  if(deleted.error||deleted.data?.status!=="deleted")throw deleted.error||new Error("Draft curriculum deletion failed.");planId="";

  const thread=await supabase.from("chat_threads").insert({owner_id:auth.user.id,title:`Issue 90 ${suffix}`}).select("id").single();if(thread.error)throw thread.error;threadId=thread.data.id;
  const bytes=new TextEncoder().encode("Nexus attachment verification");storagePath=`${auth.user.id}/${threadId}/${suffix}.txt`;
  const upload=await supabase.storage.from("nexus-attachments").upload(storagePath,bytes,{contentType:"text/plain"});if(upload.error)throw upload.error;
  const attachment={name:"verification.txt",mimeType:"text/plain",size:bytes.byteLength,storagePath};
  const message=await supabase.from("chat_messages").insert({thread_id:threadId,author_role:"user",content:"Review the attachment",attachments:[attachment]}).select("attachments").single();
  if(message.error||message.data.attachments?.[0]?.storagePath!==storagePath)throw message.error||new Error("Chat attachment metadata did not persist.");
  const queued=await supabase.from("nexus_prompt_queue").insert({owner_id:auth.user.id,thread_id:threadId,prompt:"Queued verification question",mode:"qa",attachments:[attachment]}).select("id,status").single();
  if(queued.error||queued.data.status!=="queued")throw queued.error||new Error("Queue insertion failed.");queueId=queued.data.id;
  const progressed=await supabase.from("nexus_prompt_queue").update({status:"processing",started_at:new Date().toISOString()}).eq("id",queueId).select("status").single();
  if(progressed.error||progressed.data.status!=="processing")throw progressed.error||new Error("Queue transition failed.");

  const capture={status:200,body:null};const response={status(value){capture.status=value;return response;},json(value){capture.body=value;},setHeader(){}};
  await schoolHandler({method:"POST",body:{message:"What exact phrase is written in the attached text file?",history:[],context:{view:"academics"},agent:null,mode:"qa",attachments:[{name:"verification.txt",mimeType:"text/plain",size:bytes.byteLength,dataUrl:`data:text/plain;base64,${Buffer.from(bytes).toString("base64")}`}]},headers:{authorization:`Bearer ${auth.session.access_token}`,"x-forwarded-for":"issue90-live"},socket:{}},response);
  if(capture.status!==200||capture.body?.proposedAction!==null||capture.body?.agent?.status!=="complete")throw new Error("QA mode did not remain non-mutating and terminal.");
  if(!/Nexus attachment verification/i.test(capture.body?.answer??""))throw new Error("Nexus did not inspect the attached text content.");
  console.log(JSON.stringify({manualCurriculum:true,yearSemesterPlacement:true,draftDelete:true,privateAttachment:true,attachmentAnalysis:true,durableQueue:true,qaModeNoAction:true}));
}finally{
  if(queueId)await supabase.from("nexus_prompt_queue").delete().eq("id",queueId);
  if(storagePath)await supabase.storage.from("nexus-attachments").remove([storagePath]);
  if(threadId)await supabase.from("chat_threads").delete().eq("id",threadId);
  if(planId)await supabase.from("curriculum_plans").delete().eq("id",planId);
  if(programId){await supabase.from("courses").delete().eq("program_id",programId);await supabase.from("academic_programs").delete().eq("id",programId);}
  await supabase.auth.signOut();
}
