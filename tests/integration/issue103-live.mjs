import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {createClient} from "@supabase/supabase-js";

function env(path){if(!fs.existsSync(path))return{};return Object.fromEntries(fs.readFileSync(path,"utf8").split(/\r?\n/).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1)];}));}
Object.assign(process.env,env(".env"),env(".env.local"));
const email="winsonbaring10@gmail.com";
const secret=spawnSync("/usr/bin/security",["find-internet-password","-w","-s","www.stu.best","-a",email],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
if(secret.status!==0||!secret.stdout.trim())throw new Error("Missing protected owner credential.");
const client=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=await client.auth.signInWithPassword({email,password:secret.stdout.trim()});
if(auth.error||!auth.data.user)throw auth.error||new Error("Owner sign-in failed.");

const suffix=Date.now().toString(36).toUpperCase();
const code=`R${suffix.slice(-6)}`;
let programId="",firstCourseId="",secondCourseId="",planId="",campaignId="";let campaignOriginal=null;let campaignRecipientIds=[];
try{
  const departments=await client.from("departments").select("id").eq("status","active").limit(2);
  if(departments.error||!departments.data?.[0])throw departments.error||new Error("No active department exists.");
  const departmentId=departments.data[0].id;
  const program=await client.from("academic_programs").insert({department_id:departmentId,code,name:`Relationship verification ${suffix}`,level:"bachelor",duration_years:1,description:"Temporary relationship-first verification.",status:"active"}).select("id").single();
  if(program.error)throw program.error;programId=program.data.id;
  const courses=await client.from("courses").insert([
    {department_id:departmentId,program_id:programId,code:`${code}101`,title:"Authoritative Foundation",description:"Temporary exact-ID subject.",credits:3,status:"active"},
    {department_id:departmentId,program_id:programId,code:`${code}102`,title:"Authoritative Continuation",description:"Temporary prerequisite target.",credits:3,status:"active"},
  ]).select("id,code");
  if(courses.error||courses.data.length!==2)throw courses.error||new Error("Catalog subjects were not created.");
  firstCourseId=courses.data.find((item)=>item.code===`${code}101`)?.id??"";secondCourseId=courses.data.find((item)=>item.code===`${code}102`)?.id??"";
  const payload={programCode:code,programName:`Relationship verification ${suffix}`,description:"Exact catalog relationship test.",durationYears:1,effectiveYear:2196,subjects:[
    {courseId:firstCourseId,code:`${code}101`,title:"Authoritative Foundation",description:"",units:3,yearLevel:1,semester:1,category:"core",sortOrder:1,prerequisiteCodes:[],prerequisiteCourseIds:[]},
    {courseId:secondCourseId,code:`${code}102`,title:"Authoritative Continuation",description:"",units:3,yearLevel:1,semester:2,category:"core",sortOrder:2,prerequisiteCodes:[`${code}101`],prerequisiteCourseIds:[firstCourseId]},
  ],blocks:[{yearLevel:1,blockCode:`${code}-1A`,capacity:35}]};
  const plan=await client.from("curriculum_plans").insert({program_id:programId,effective_year:2196,status:"draft",source_payload:payload,idempotency_key:`relationship-${suffix}`,created_by:auth.data.user.id}).select("id").single();
  if(plan.error)throw plan.error;planId=plan.data.id;
  const updated=await client.rpc("update_academic_curriculum",{p_plan_id:planId,p_status:"draft",p_payload:payload,p_reason:"Verify exact catalog relationships"});
  if(updated.error||updated.data?.subjects!==2||updated.data?.prerequisites!==1)throw updated.error||new Error("Exact-ID curriculum update failed.");
  const mappings=await client.from("curriculum_plan_courses").select("course_id,curriculum_course_prerequisites(prerequisite_course_id)").eq("plan_id",planId);
  if(mappings.error||mappings.data.length!==2||!mappings.data.some((item)=>item.course_id===secondCourseId&&item.curriculum_course_prerequisites.some((prerequisite)=>prerequisite.prerequisite_course_id===firstCourseId)))throw mappings.error||new Error("Catalog placement or prerequisite identity drifted.");

  if(departments.data[1]){
    const invalid=await client.from("courses").update({department_id:departments.data[1].id}).eq("id",firstCourseId);
    if(!invalid.error)throw new Error("Mismatched subject department/program was accepted.");
  }

  const students=await client.from("students").select("id").eq("record_status","active").limit(2);
  if(students.error||!students.data?.length)throw students.error||new Error("No students exist for audience verification.");
  const campaign=await client.from("campaigns").select("id,audience_scope,audience_definition,program_id,section_id,status").in("status",["draft","scheduled"]).limit(1).single();
  if(campaign.error)throw campaign.error;campaignId=campaign.data.id;campaignOriginal=campaign.data;
  const originalRecipients=await client.from("campaign_recipients").select("student_id").eq("campaign_id",campaignId);if(originalRecipients.error)throw originalRecipients.error;campaignRecipientIds=originalRecipients.data.map((item)=>item.student_id);
  const audienceUpdate=await client.from("campaigns").update({audience_scope:"explicit",audience_definition:{},program_id:null,section_id:null}).eq("id",campaignId);if(audienceUpdate.error)throw audienceUpdate.error;
  const synced=await client.rpc("sync_campaign_recipients",{p_campaign_id:campaignId,p_student_ids:students.data.map((item)=>item.id)});
  if(synced.error||synced.data?.recipients!==students.data.length)throw synced.error||new Error("Explicit campaign recipients were not generated.");

  const supportCase=await client.from("cases").select("id,student_id").limit(1).single();
  if(supportCase.error)throw supportCase.error;
  const differentStudent=students.data.find((item)=>item.id!==supportCase.data.student_id);
  if(differentStudent){const invalidTask=await client.from("crm_tasks").insert({title:`Invalid relationship ${suffix}`,student_id:differentStudent.id,case_id:supportCase.data.id,assigned_to:auth.data.user.id,priority:"normal"});if(!invalidTask.error)throw new Error("A task was allowed to link a case to the wrong student.");}
  const studentProfile=await client.from("students").select("profile_id").not("profile_id","is",null).limit(1).single();
  if(studentProfile.error)throw studentProfile.error;
  const invalidCase=await client.from("cases").insert({student_id:students.data[0].id,title:`Invalid owner ${suffix}`,category:"Verification",priority:"normal",status:"open",owner_id:studentProfile.data.profile_id});
  if(!invalidCase.error)throw new Error("A student profile was accepted as a case owner.");

  const lead=await client.from("admission_leads").select("id,program_id,program_interest,owner_id,last_activity_at").neq("stage","closed").limit(1).single();
  if(lead.error)throw lead.error;
  const leadUpdate=await client.from("admission_leads").update({program_id:lead.data.program_id,owner_id:lead.data.owner_id,last_activity_at:new Date().toISOString()}).eq("id",lead.data.id).select("program_id,program_interest,owner_id").single();
  if(leadUpdate.error||!leadUpdate.data.program_id||!leadUpdate.data.program_interest)throw leadUpdate.error||new Error("Admission program relationship snapshot failed.");
  await client.from("admission_leads").update({last_activity_at:lead.data.last_activity_at}).eq("id",lead.data.id);

  console.log(JSON.stringify({ownerRole:true,curriculumCourseIds:true,prerequisiteCourseIds:true,mismatchRejected:true,taskCaseChain:true,caseOwnerRole:true,campaignRecipients:true,admissionProgramSnapshot:true}));
}finally{
  if(campaignId&&campaignOriginal){await client.from("campaigns").update({audience_scope:campaignOriginal.audience_scope,audience_definition:campaignOriginal.audience_definition,program_id:campaignOriginal.program_id,section_id:campaignOriginal.section_id}).eq("id",campaignId);await client.rpc("sync_campaign_recipients",{p_campaign_id:campaignId,p_student_ids:campaignOriginal.audience_scope==="explicit"?campaignRecipientIds:undefined});}
  if(planId)await client.from("curriculum_plans").delete().eq("id",planId);
  if(firstCourseId||secondCourseId)await client.from("courses").delete().in("id",[firstCourseId,secondCourseId].filter(Boolean));
  if(programId)await client.from("academic_programs").delete().eq("id",programId);
  await client.auth.signOut();
}
