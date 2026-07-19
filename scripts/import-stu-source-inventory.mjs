import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {createClient} from "@supabase/supabase-js";

function env(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(fs.readFileSync(path,"utf8").split(/\r?\n/).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const at=line.indexOf("=");return [line.slice(0,at),line.slice(at+1)];}));
}
Object.assign(process.env,env(".env"),env(".env.local"));
const inventory=JSON.parse(fs.readFileSync("docs/research/stu-source-inventory.v1.json","utf8"));
const email=process.env.STU_OWNER_EMAIL||"winsonbaring10@gmail.com";
const secret=spawnSync("/usr/bin/security",["find-internet-password","-w","-s","www.stu.best","-a",email],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
if(secret.status!==0||!secret.stdout.trim())throw new Error("Missing protected owner credential.");
const db=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=await db.auth.signInWithPassword({email,password:secret.stdout.trim()});
if(auth.error)throw auth.error;
try{
  const urls=inventory.candidates.map((item)=>item.canonical_url);
  const beforeSources=await db.from("knowledge_sources").select("id",{count:"exact",head:true}).in("canonical_url",urls);
  if(beforeSources.error)throw beforeSources.error;
  const payload=inventory.candidates.map(({canonical_url,title,inventory_domain,language,source_type,owning_unit,discovery_method,discovered_from,http_status,final_url})=>({canonical_url,title,inventory_domain,language,source_type,owning_unit,discovery_method,discovered_from,http_status,final_url}));
  const imported=await db.rpc("upsert_stu_source_candidates",{p_candidates:payload,p_fixture_marker:null});
  if(imported.error)throw imported.error;
  const rows=await db.from("knowledge_source_candidates").select("canonical_url,inventory_domain,status,source_id,fixture_marker").in("canonical_url",urls);
  if(rows.error)throw rows.error;
  const afterSources=await db.from("knowledge_sources").select("id",{count:"exact",head:true}).in("canonical_url",urls);
  if(afterSources.error)throw afterSources.error;
  const identities=new Set(rows.data.map((row)=>row.canonical_url.replace(/\/+$/,"")));
  const domainCounts=Object.fromEntries(inventory.requiredDomains.map((domain)=>[domain,rows.data.filter((row)=>row.inventory_domain===domain).length]));
  if(rows.data.length!==urls.length||identities.size!==urls.length)throw new Error("Production candidate reconciliation differs from the manifest.");
  if(rows.data.some((row)=>row.status!=="review_needed"||row.source_id||row.fixture_marker))throw new Error("Discovery created a reviewed, linked, or fixture row.");
  if(afterSources.count!==beforeSources.count)throw new Error("Discovery created a governed source without review.");
  if(Object.values(domainCounts).some((count)=>count!==2))throw new Error("Production domain coverage differs from the manifest.");
  console.log(JSON.stringify({manifestCandidates:urls.length,reconciledCandidates:rows.data.length,domainsCovered:Object.values(domainCounts).filter((count)=>count===2).length,inserted:imported.data.inserted,updated:imported.data.updated,duplicateCanonicalIdentities:rows.data.length-identities.size,autoPublished:afterSources.count-beforeSources.count,status:"review_needed"}));
}finally{await db.auth.signOut();}
