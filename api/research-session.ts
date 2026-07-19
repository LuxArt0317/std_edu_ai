import {createHash} from "node:crypto";
type ApiRequest={method?:string;body?:unknown;query?:Record<string,string|string[]|undefined>;headers:Record<string,string|string[]|undefined>;socket?:{remoteAddress?:string}};
type ApiResponse={status:(code:number)=>ApiResponse;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
const windows=new Map<string,number[]>();export const config={maxDuration:30};
function value(item:string|string[]|undefined){return Array.isArray(item)?item[0]:item;}
function client(request:ApiRequest){return value(request.headers["x-forwarded-for"])?.split(",")[0].trim()||request.socket?.remoteAddress||"unknown";}
function limited(key:string,max=30){const cutoff=Date.now()-60_000;const active=(windows.get(key)||[]).filter((time)=>time>cutoff);active.push(Date.now());windows.set(key,active);return active.length>max;}
function cookie(request:ApiRequest,name:string){return (value(request.headers.cookie)||"").split(";").map((item)=>item.trim().split("=")).find(([key])=>key===name)?.[1]||"";}
function parse(body:unknown){if(typeof body==="string"){try{return JSON.parse(body) as Record<string,unknown>;}catch{return null;}}return body&&typeof body==="object"&&!Array.isArray(body)?body as Record<string,unknown>:null;}
async function rpc(url:string,key:string,name:string,args:Record<string,unknown>){const response=await fetch(`${url.replace(/\/$/,"")}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(args),signal:AbortSignal.timeout(12_000)});const payload=await response.json().catch(()=>({message:"Invalid research service response"}));if(!response.ok)throw new Error(typeof payload.message==="string"?payload.message:"The research service rejected this request.");return payload;}
function secureCookie(token:string,maxAge:number){return `stu_research_token=${token}; Path=/api/research-session; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
function headers(response:ApiResponse){response.setHeader("Cache-Control","no-store, max-age=0");response.setHeader("Content-Type","application/json; charset=utf-8");response.setHeader("X-Content-Type-Options","nosniff");response.setHeader("Referrer-Policy","no-referrer");}
export default async function handler(request:ApiRequest,response:ApiResponse){
  headers(response);const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;if(!url||!key){response.status(503).json({error:"The research study service is not configured."});return;}
  const fingerprint=createHash("sha256").update(`${process.env.SAFETY_HASH_SALT||"stu-research"}:${client(request)}`).digest("hex");if(limited(fingerprint,120)){response.status(429).json({error:"Too many research requests. Please wait and try again."});return;}
  try{
    if(request.method==="GET"){
      const study=value(request.query?.study);const language=value(request.query?.language)==="zh-Hant"?"zh-Hant":"en";
      if(study){if(!/^[A-Za-z0-9_-]{2,80}$/.test(study)){response.status(400).json({error:"Invalid study code."});return;}const payload=await rpc(url,key,"public_research_study",{p_study_code:study,p_language:language});if(!payload){response.status(404).json({error:"This study is not currently recruiting."});return;}response.status(200).json(payload);return;}
      const token=cookie(request,"stu_research_token");if(!token){response.status(401).json({error:"No active research session."});return;}response.status(200).json(await rpc(url,key,"get_research_session",{p_token:token,p_language:language}));return;
    }
    if(request.method!=="POST"){response.setHeader("Allow","GET, POST");response.status(405).json({error:"Method not allowed"});return;}
    if(value(request.headers["x-stu-research"])!=="1"){response.status(403).json({error:"Research request verification failed."});return;}
    const input=parse(request.body);if(!input||typeof input.action!=="string"){response.status(400).json({error:"A valid research action is required."});return;}
    if(input.action==="start"){
      if(cookie(request,"stu_research_token")){response.status(409).json({error:"This browser already has an active research session. Resume or withdraw it before starting another."});return;}
      if(typeof input.studyCode!=="string"||typeof input.studyVersionId!=="string"||typeof input.populationRole!=="string"||typeof input.familiarityLevel!=="string"||input.consent!==true){response.status(400).json({error:"Study, participant profile, and active consent are required."});return;}
      const payload=await rpc(url,key,"begin_research_participation",{p_study_code:input.studyCode,p_study_version_id:input.studyVersionId,p_population_role:input.populationRole,p_familiarity_level:input.familiarityLevel,p_consent:true,p_user_agent_family:(value(request.headers["user-agent"])||"").slice(0,120)});
      const maxAge=Math.max(3600,Math.min(31536000,Math.floor((new Date(payload.expiresAt).getTime()-Date.now())/1000)));response.setHeader("Set-Cookie",secureCookie(payload.token,maxAge));delete payload.token;response.status(201).json(payload);return;
    }
    const token=cookie(request,"stu_research_token");if(!token){response.status(401).json({error:"No active research session."});return;}
    if(input.action==="attempt")response.status(200).json({id:await rpc(url,key,"submit_research_attempt",{p_token:token,p_task_id:input.taskId,p_condition:input.condition,p_metrics:input.metrics})});
    else if(input.action==="response")response.status(200).json({id:await rpc(url,key,"submit_research_response",{p_token:token,p_item_id:input.itemId,p_condition:input.condition??null,p_numeric_value:input.numericValue??null,p_text_value:input.textValue??null})});
    else if(input.action==="pause"||input.action==="resume")response.status(200).json({status:await rpc(url,key,"set_research_session_status",{p_token:token,p_status:input.action==="pause"?"paused":"started"})});
    else if(input.action==="complete")response.status(200).json({completed:await rpc(url,key,"complete_research_session",{p_token:token})});
    else if(input.action==="withdraw"){const deleted=input.deleteNow===true;await rpc(url,key,"withdraw_research_participation",{p_token:token,p_delete_now:deleted});response.setHeader("Set-Cookie",secureCookie("",0));response.status(200).json({withdrawn:true,deleted});}
    else response.status(400).json({error:"Unsupported research action."});
  }catch(error){const message=error instanceof Error?error.message:"The research service is unavailable.";const status=/Invalid or expired|No active|consent/i.test(message)?401:/not recruiting|not found/i.test(message)?404:/required|invalid|belong|condition|range|missing/i.test(message)?400:503;response.status(status).json({error:message});}
}
