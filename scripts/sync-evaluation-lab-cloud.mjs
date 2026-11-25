/** Explicit, recoverable replacement of the shared lab; never changes application/student records. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import postgres from 'postgres';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf('--'+name);return i<0?null:args[i+1]};
const apply=args.includes('--apply');
const stateFile=option('local-state'),envFile=option('env-file');
if(!stateFile||!envFile)throw Error('Specify --local-state and --env-file; add --apply only for authorized replacement.');
const configuration=JSON.parse(await fs.readFile('deployment.json','utf8'));
if(configuration.repository!=='LuxArt0317/std_edu_ai'||configuration.supabase.projectRef!=='xiftudmvxphxcjtmfmib')throw Error('Unexpected project configuration');
const local=JSON.parse(await fs.readFile(stateFile,'utf8'));
if(!Array.isArray(local.cases)||!Array.isArray(local.runs)||local.cases.length>250||Buffer.byteLength(JSON.stringify(local))>3_000_000)throw Error('Invalid or oversized local state');
if(new Set(local.cases.map(row=>row.id)).size!==local.cases.length||new Set(local.runs.map(row=>row.id)).size!==local.runs.length)throw Error('Duplicate question/run IDs');
const canonical=value=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const imageIds=[...new Set([...local.cases,...local.runs].flatMap(row=>row.attachments||[]).map(file=>file.id))];
const images=[];
for(const id of imageIds){
 if(typeof id!=='string'||!/^[a-f0-9]{64}\.(png|jpeg|webp)$/.test(id))throw Error('Invalid attachment ID');
 const bytes=await fs.readFile(path.join(path.dirname(stateFile),'attachments',id));
 if(createHash('sha256').update(bytes).digest('hex')!==id.split('.')[0])throw Error('Attachment hash mismatch');
 images.push({id,content:bytes.toString('base64')});
}
const env=parseEnv(await fs.readFile(envFile,'utf8'));
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL;
if(!connection)throw Error('Database credential reference has no connection');
const target=new URL(connection),project=configuration.supabase.projectRef;
if(!['postgres:','postgresql:'].includes(target.protocol)||!(target.hostname==='db.'+project+'.supabase.co'||target.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(target.username).endsWith('.'+project)))throw Error('Database target mismatch');
const sql=postgres(connection,{max:1,connect_timeout:15,ssl:{rejectUnauthorized:true,ca:await fs.readFile('supabase/certs/prod-ca-2021.crt','utf8')},onnotice:()=>{},connection:{application_name:'answer-lab-authorized-sync',statement_timeout:20000,lock_timeout:5000}});
let backupFile;
try{
 const summary=await sql.begin(async tx=>{
  const owners=await tx`select u.id from auth.users u where lower(u.email)='luxart0317@gmail.com' and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  if(owners.length!==1)throw Error('Shared lab owner unavailable');
  const owner=owners[0].id;
  const functions=await tx`select pg_get_functiondef('public.evaluation_lab_read()'::regprocedure) as definition`;
  if(!functions[0]?.definition.includes('evaluation_lab_shared_owner'))throw Error('Shared workspace access is not configured');
  await tx`select pg_advisory_xact_lock(hashtextextended(${'evaluation-lab:'+owner},0))`;
  await tx`select pg_advisory_xact_lock(hashtextextended(${'evaluation-images:'+owner},0))`;
  const existing=await tx`select owner_id,revision,document,updated_at from public.evaluation_lab_workspaces where owner_id=${owner} for update`;
  const attachments=await tx`select id,content,created_at from public.evaluation_lab_attachments where owner_id=${owner}`;
  const previous=existing[0]||null;
  const overview={applied:apply,localCases:local.cases.length,localRuns:local.runs.length,localAttachments:images.length,cloudCases:previous?.document?.cases?.length||0,cloudRuns:previous?.document?.runs?.length||0,cloudScoredRuns:(previous?.document?.runs||[]).filter(run=>Number.isFinite(run.judge?.score)).length,cloudRevision:previous?.revision??0,localDigest:digest(local),cloudDigest:previous?digest(previous.document):null};
  if(!apply)return overview;
  const directory=path.join(path.dirname(stateFile),'cloud-backups');await fs.mkdir(directory,{recursive:true,mode:0o700});
  backupFile=path.join(directory,'before-sync-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
  await fs.writeFile(backupFile,JSON.stringify({version:1,savedAt:new Date().toISOString(),workspace:previous,attachments,localDigest:digest(local)},null,2)+'\n',{flag:'wx',mode:0o600});
  const backup=JSON.parse(await fs.readFile(backupFile,'utf8'));
  if(digest(backup.workspace)!==digest(previous)||digest(backup.attachments)!==digest(attachments))throw Error('Backup verification failed');
  const revision=Number(previous?.revision||0)+1;
  await tx`insert into public.evaluation_lab_workspaces(owner_id,revision,document) values(${owner},${revision},${tx.json(local)}) on conflict(owner_id) do update set revision=excluded.revision,document=excluded.document,updated_at=now()`;
  await tx`delete from public.evaluation_lab_attachments where owner_id=${owner}`;
  for(const image of images)await tx`insert into public.evaluation_lab_attachments(owner_id,id,content) values(${owner},${image.id},${image.content})`;
  const readback=await tx`select document from public.evaluation_lab_workspaces where owner_id=${owner}`;
  if(digest(readback[0]?.document)!==digest(local))throw Error('Document readback mismatch');
  const savedImages=await tx`select id,content from public.evaluation_lab_attachments where owner_id=${owner} order by id`;
  if(digest(savedImages)!==digest([...images].sort((a,b)=>a.id.localeCompare(b.id))))throw Error('Attachment readback mismatch');
  return {...overview,cloudRevision:revision,verified:true,backupFile};
 });
 console.log(JSON.stringify(summary));
}catch(error){console.error(JSON.stringify({error:'Cloud lab synchronization failed',code:typeof error.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:'SYNC_FAILED',backupSaved:Boolean(backupFile)}));process.exitCode=1;}
finally{await sql.end({timeout:5});}
