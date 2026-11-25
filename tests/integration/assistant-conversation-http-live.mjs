/** Actual deployed persistence acceptance. Synthetic conversation content is a
 * fixture, not a generated/model-verified answer. Importing this file is inert. */
import {newConversationId} from '../../src/services/assistantConversationId.js';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {readFile,readdir,mkdir,open,rename,rm,writeFile,lstat,realpath} from 'node:fs/promises';
import {readNativeHttpResponse} from './helpers/native-http-response.mjs';
import {createPinnedDeploymentVerifier} from '../evaluation/pinned-deployment.mjs';
import {conversationDeleteProbeTitles,createTrustedPreviewFetch,isEvaluationPreviewOrigin} from '../evaluation/vercel-preview-transport.mjs';
import {createProtectedConversationBrowserRelay,validateProtectedConversationBrowserResources} from '../evaluation/vercel-preview-browser-transport.mjs';
import {protectedBrowserDenial,requireProtectedBrowser} from '../evaluation/protected-browser-diagnostics.mjs';
import {installProtectedConversationBrowserRoute,protectedConversationQuestions,runProtectedConversationBrowser,verifyProtectedBrowserSave}
  from './helpers/protected-conversation-browser.mjs';


const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const PROJECT='xiftudmvxphxcjtmfmib',ORIGIN='https://stu.best';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CACHE='stu-campus-assistant-sessions-v2';

export function validateConversationTarget({origin,revision,cwd=process.cwd()}={}){
  assert.equal(origin,ORIGIN,'Only the exact deployed production origin is allowed.');
  assert.match(revision||'',/^[a-f0-9]{40}$/,'An exact reviewed production revision is required.');
  assert.equal(resolve(cwd),resolve(ROOT),'Run from the exact client checkout.');
  return {origin,revision};
}
export function validatePreviewConversationDeleteTarget({origin,approvedPreviewOrigin,revision,cwd=process.cwd()}={}){
  assert.ok(isEvaluationPreviewOrigin(origin)&&origin===approvedPreviewOrigin,'The exact protected Preview origin requires explicit approval.');
  assert.match(revision||'',/^[a-f0-9]{40}$/,'An exact reviewed Preview revision is required.');
  assert.equal(resolve(cwd),resolve(ROOT),'Run from the exact client checkout.');
  return {origin,approvedPreviewOrigin,revision};
}
function assertExactPreviewCheckout(revision){
  const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();
  assert.equal(git('rev-parse','HEAD'),revision);
  assert.equal(git('status','--porcelain'),'');
  assert.ok(['https://github.com/LuxArt0317/std_edu_ai.git','git@github.com:LuxArt0317/std_edu_ai.git'].includes(git('remote','get-url','origin')));
}
export function conversationFixture(id,label='HTTP fixture'){
  assert.match(id,UUID);assert.ok(typeof label==='string'&&label.length<=40);
  const prefix=`${label}: synthetic persistence fixture; not a model answer.\n`;
  const answer=prefix+'界'.repeat(8000-prefix.length-12)+' END-RECORD!';
  // 8,000 UTF-16 units, matching the application limit; Chinese exercises bytes.
  assert.equal(answer.length,8000);
  const activity=Array.from({length:40},(_,index)=>({kind:`fixture-${index+1}`,label:`Observed fixture step ${index+1}`,
    detail:`Synthetic persistence observation ${index+1}; no model or school operation ran.`,status:index===17?'unavailable':'complete'}));
  return {id,title:label,version:0,messages:[{id:id+'-question',role:'user',content:label},
    {id:id+'-answer',role:'assistant',content:answer,phase:'complete',activity,
      result:{status:'answered',answer,citations:[],suggestedQuestions:[],activity,verification:{status:'unverified',attempts:0}}}]};
}
export function conversationResponseMatches(operation,response){
  return response?.status===200&&response.body?.id===operation.payload.id&&response.body?.title===operation.payload.title
    &&response.body?.version===operation.expectedVersion&&isDeepStrictEqual(response.body.messages,operation.expectedMessages);
}
export function conversationExpectedVersion(userId,payload,messages,before){
  return before?.user_id===userId&&before.title===payload.title&&isDeepStrictEqual(before.messages,messages)
    ?before.version:payload.version+1;
}
export async function assertConversationDeleteIsolation(read,remove){
  const before=await read();await remove();assert.deepEqual(await read(),before,'Cross-account delete must leave the original read projection untouched.');
}
function markerFor(userId,id){
  const uuidMilliseconds=Number.parseInt(id.replaceAll('-','').slice(0,12),16);
  return {user_id:userId,conversation_id:id,expires_ms:String(uuidMilliseconds+86400000)};
}
export function expectedPreviewDeleteState(before,userId,id){
  const markers=before.markers.filter(marker=>marker.user_id!==userId);
  markers.push(markerFor(userId,id));
  markers.sort((left,right)=>left.user_id.localeCompare(right.user_id));
  return {rows:before.rows.filter(row=>row.user_id!==userId),markers};
}
export async function readProtectedConversationDeleteState(sql,id,{ownerId,title,callerIds}){
  const rows=await sql`select id,user_id,title,messages,version from public.affairs_conversations where id=${id}`;
  const markers=await sql`select user_id,conversation_id,(extract(epoch from expires_at)*1000)::bigint::text as expires_ms
    from private.affairs_conversation_delete_markers where conversation_id=${id} order by user_id`;
  assert.ok(rows.every(row=>row.user_id===ownerId&&row.title===title)
    &&markers.every(marker=>callerIds.includes(marker.user_id)),'Unexpected owner or state at the reserved probe ID.');
  // Compare row contents independently of the database client's Result prototype.
  return {rows:[...rows],markers:[...markers]};
}
/** Evaluate the two serialization orderings with exact HTTP and independent PG checks. */
export async function runProtectedConversationDeleteChecks({owner,other,saved,pending,expectedMessages,request,inspect}){
  const empty={rows:[],markers:[]};
  assert.notEqual(owner.id,other.id);
  for(const fixture of [saved,pending])assert.deepEqual(await inspect(fixture.id),empty);

  const savedBody=await request(owner,{method:'POST',body:saved});
  const ownerState={rows:[{id:saved.id,user_id:owner.id,title:saved.title,messages:expectedMessages,version:1}],markers:[]};
  const saveOperation={payload:saved,expectedMessages,expectedVersion:1};
  assert.ok(conversationResponseMatches(saveOperation,{status:200,body:savedBody}));
  assert.deepEqual(await inspect(saved.id),ownerState);
  const missing={error:'Conversation not found.'};
  assert.deepEqual(await request(other,{id:saved.id,status:404}),missing);
  assert.deepEqual(await request(other,{method:'POST',body:saved,status:403}),{error:'This conversation is unavailable for your account.'});
  assert.deepEqual(await inspect(saved.id),ownerState);

  await assertConversationDeleteIsolation(async()=>{
    const body=await request(owner,{id:saved.id});
    assert.ok(conversationResponseMatches(saveOperation,{status:200,body}));
    return body;
  },async()=>{
    assert.deepEqual(await request(other,{method:'DELETE',id:saved.id}),{deleted:true});
  });
  const afterOther=expectedPreviewDeleteState(ownerState,other.id,saved.id);
  assert.deepEqual(await inspect(saved.id),afterOther);

  const deniedSave={error:'This conversation changed in another tab. Reload it before editing.'};
  for(const [fixture,before] of [[saved,afterOther],[pending,empty]]){
    assert.deepEqual(await request(owner,{method:'DELETE',id:fixture.id}),{deleted:true});
    const deleted=expectedPreviewDeleteState(before,owner.id,fixture.id);
    assert.deepEqual(await inspect(fixture.id),deleted);
    assert.deepEqual(await request(owner,{id:fixture.id,status:404}),missing);
    assert.deepEqual(await request(owner,{method:'POST',body:fixture,status:409}),deniedSave);
    assert.deepEqual(await inspect(fixture.id),deleted);
  }
  assert.deepEqual(await request(owner,{method:'DELETE',id:pending.id}),{deleted:true});
  assert.deepEqual(await inspect(pending.id),expectedPreviewDeleteState(empty,owner.id,pending.id));
}
export function reconcileConversationWrite(operation,rows){
  assert.equal(rows.length,1,'Uncertain save has no unique durable row; retain recovery ledger.');
  const row=rows[0];assert.equal(row.user_id,operation.userId,'Conversation owner changed.');
  assert.equal(row.id,operation.payload.id);assert.equal(row.title,operation.payload.title);
  assert.equal(row.version,operation.expectedVersion,'Cannot establish the uncertain save version.');
  assert.deepEqual(row.messages,operation.expectedMessages,'Cannot establish the uncertain save content.');
  return true;
}
export function reconcileConversationIdentity(request,rows,runId,ownerId){
  assert.equal(request.runId,runId);assert.equal(rows.length,1,'Uncertain Auth creation requires exact reconciliation.');
  const row=rows[0];assert.match(row.id,UUID);assert.notEqual(row.id,ownerId);assert.equal(row.email,request.email);assert.equal(row.run,runId);
  if(request.id)assert.equal(row.id,request.id);return row.id;
}
export function allowedConversationBrowserRequest(method,url,projectOrigin){
  const destination=new URL(url);
  if(destination.origin===projectOrigin)return method==='GET'&&destination.pathname==='/auth/v1/user'
    ||method==='POST'&&destination.pathname==='/auth/v1/token'&&destination.searchParams.get('grant_type')==='refresh_token'
    ||method==='POST'&&destination.pathname==='/auth/v1/logout'&&destination.searchParams.get('scope')==='local';
  if(destination.origin!==ORIGIN)return false;
  if(!destination.pathname.startsWith('/api/'))return method==='GET';
  return method==='GET'&&['/api/affairs-data','/api/affairs-conversations'].includes(destination.pathname)
    ||method==='POST'&&destination.pathname==='/api/affairs-conversations'&&!destination.search;
}
export async function assertConversationRecoveryClear(directories,{list=readdir}={}){
  for(const directory of directories){
    let names;try{names=await list(directory);}catch(error){if(error?.code==='ENOENT')continue;throw new Error('Recovery ledger directory could not be inspected.');}
    assert.equal(names.filter(name=>/^active-fixtures-[a-f0-9-]+\.json(?:\.tmp)?$/.test(name)).length,0,'Existing recovery ledger requires manual reconciliation before another live run.');
  }
}
/** Status-only diagnostics: never persist headers, queries, bodies or tokens. */
export function conversationResponseDiagnostic(method,url,status,projectOrigin){
  let destination;try{destination=new URL(url);}catch{return null;}
  if(!Number.isInteger(status)||status<100||status>599||!['GET','POST','DELETE'].includes(method))return null;
  const path=destination.pathname;
  if(destination.origin===ORIGIN&&['/dtm','/api/affairs-data','/api/affairs-conversations'].includes(path))return {method,path,status};
  if(destination.origin===projectOrigin&&['/auth/v1/user','/auth/v1/token','/auth/v1/logout'].includes(path))return {method,path,status};
  return null;
}
export async function openVerifiedConversationAssistant(page,mark=()=>{}){
  // Auth completion remounts PublicAssistant. Opening its anonymous instance
  // before the verified account menu appears can close the sheet on remount.
  mark('browser: await verified DTM account menu');
  await page.locator('[data-campus-assistant-menu]').waitFor({state:'visible'});
  mark('browser: open campus assistant launcher');
  await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();
}
export async function boundedConversationDiagnostic(work,timeoutMs=3000){
  let timer;
  try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Browser diagnostic timed out.')),timeoutMs);})]);}
  finally{clearTimeout(timer);}
}

export async function main(){
  const previewDelete=process.argv.length===3&&process.argv[2]==='--preview-delete';
  const previewBrowser=process.argv.length===3&&process.argv[2]==='--preview-browser',protectedPreview=previewDelete||previewBrowser;
  assert.ok(protectedPreview||process.argv.length===2,'Use explicit origin/revision environment variables.');
  const requestedTarget={origin:process.env.ASSISTANT_ORIGIN,revision:process.env.EXPECTED_RELEASE_REVISION};
  const target=protectedPreview?validatePreviewConversationDeleteTarget({
    ...requestedTarget,approvedPreviewOrigin:process.env.APPROVED_PREVIEW_ORIGIN,
  }):validateConversationTarget(requestedTarget);
  const probeFixtures=previewDelete?Object.values(conversationDeleteProbeTitles).map(title=>conversationFixture(newConversationId(),title)):null;
  if(protectedPreview)assertExactPreviewCheckout(target.revision);
  const fetchTarget=protectedPreview?createTrustedPreviewFetch({
    origin:target.origin,token:process.env.VERCEL_OIDC_TOKEN,...(previewDelete?{conversationDeleteFixtures:probeFixtures}:{}),
  }):fetch;
  const previewPin=protectedPreview?createPinnedDeploymentVerifier({
    origin:target.origin,approvedPreviewOrigin:target.approvedPreviewOrigin,expectedRevision:target.revision,fetchImpl:fetchTarget,
  }):null;
  const manifest=async()=>{
    if(previewPin){await previewPin.pin();return;}
    const response=await fetch(ORIGIN+'/release.json',{redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});
    const value=await readNativeHttpResponse(response);assert.equal(value.status,200);assert.equal(value.body.revision,target.revision);
    assert.equal(value.body.environment,'production');assert.equal(value.body.source,'vercel-git');
  };
  // Neither secrets nor clients are loaded before exact public release checks.
  await manifest();
  let browserAssets;
  if(previewBrowser){
    const file=process.env.ASSISTANT_PREVIEW_BROWSER_ASSETS;
    assert.ok(typeof file==='string'&&file.length>0,'A build asset allowlist is required for protected browser acceptance.');
    const metadata=await lstat(file);
    assert.ok(metadata.isFile()&&metadata.size<=64000);
    browserAssets=JSON.parse(await readFile(file,'utf8'));
    assert.equal(browserAssets.revision,target.revision);
    assert.ok(Array.isArray(browserAssets.assets)&&browserAssets.assets.length>0);
    validateProtectedConversationBrowserResources({origin:target.origin,assets:browserAssets.assets,dataPaths:browserAssets.dataPaths});
  }
  const deployment=JSON.parse(await readFile(resolve(ROOT,'deployment.json'),'utf8'));
  assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,PROJECT);assert.equal(deployment.vercel.productionUrl,ORIGIN);
  const [{deploymentEnvironment},{createClient},{default:postgres},{chromium},{sanitizeStoredConversation}]=await Promise.all([
    import('../../scripts/deployment-env.mjs'),import('@supabase/supabase-js'),import('postgres'),import('playwright-core'),import('../../server/assistantConversationData.js'),
  ]);
  const env=deploymentEnvironment(),projectOrigin=`https://${PROJECT}.supabase.co`;
  assert.equal(env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL,projectOrigin);
  const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL,dbUrl=new URL(connection);
  assert.ok(['postgres:','postgresql:'].includes(dbUrl.protocol)&&(dbUrl.hostname===`db.${PROJECT}.supabase.co`
    ||dbUrl.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(dbUrl.username).endsWith('.'+PROJECT)),'Exact client database required.');
  const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
  const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;assert.ok(key&&serviceKey);
  process.umask(0o077);
  const runId=randomUUID(),directory=resolve(ROOT,'artifacts/assistant-conversation-http'),ledgerPath=directory+'/active-fixtures-'+runId+'.json';
  await mkdir(directory,{recursive:true,mode:0o700});
  if(protectedPreview){
    const folder=await lstat(directory);
    assert.ok(folder.isDirectory()&&folder.uid===process.getuid()&&(folder.mode&0o777)===0o700&&await realpath(directory)===directory);
  }
  const pool=postgres(connection,{max:1,connect_timeout:10,idle_timeout:5,max_lifetime:0,onnotice:()=>{},
    connection:{application_name:'stu-conversation-http-acceptance',statement_timeout:15000,lock_timeout:3000},
    ssl:{rejectUnauthorized:true,ca:await readFile(resolve(ROOT,'supabase/certs/prod-ca-2021.crt'),'utf8')}});
  const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
  const projectFetch=(input,init={})=>{assert.equal(new URL(typeof input==='string'||input instanceof URL?input:input.url).origin,projectOrigin);
    return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});};
  const admin=createClient(projectOrigin,serviceKey,{auth,global:{fetch:projectFetch}});
  const users=[],operations=[],deletions=[],sessions=new Map(),reservedConversations=new Map(),checks=[],browserErrors=[],activeBrowserWrites=new Set();
  let sql,locked=false,ledgerOwned=false,browser,activePage,ownerId,ownerBefore,phase='preflight',failure=null,cleanupVerified=false,passed=false,browserAcceptance;
  const browserResponses=[],browserDenials=[],browserTurnProofs=[];
  let browserPinQueue=Promise.resolve();
  const withBrowserPin=work=>{
    const finished=browserPinQueue.then(work);
    browserPinQueue=finished.catch(()=>{});
    return finished;
  };
  let httpRequests=0,browserRequests=0,modelRequests=0,officialRequests=0,ledgerQueue=Promise.resolve();
  const ledger=()=>ledgerQueue=ledgerQueue.then(async()=>{
    assert.ok(ledgerOwned);const temp=ledgerPath+'.tmp',handle=await open(temp,'wx',0o600);
    try{
      await handle.writeFile(JSON.stringify({runId,origin:target.origin,revision:target.revision,phase,users,operations,
        ...(previewDelete?{deletions}:{}),
      },null,2));
      await handle.sync();
    }finally{await handle.close();}
    await rename(temp,ledgerPath);
    if(protectedPreview){
      const folder=await open(directory,'r');
      try{await folder.sync();}finally{await folder.close();}
    }
  });
  const fingerprint=async()=>JSON.stringify(await sql`select u.id,md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,
    md5(to_jsonb(p)::text) as profile_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identity_hash,
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb)::text) from public.affairs_conversations c where c.user_id=u.id) as chat_hash
    from auth.users u left join public.affairs_profiles p on p.user_id=u.id where u.id=${ownerId}`);
  const createUser=async()=>{
    const request={email:`conversation-qa-${randomUUID()}@example.invalid`,runId,id:null,state:'pending',sentAt:Date.now()};
    assert.equal((await sql`select id from auth.users where lower(email)=lower(${request.email})`).length,0);
    users.push(request);await ledger();
    const password=randomBytes(32).toString('base64url')+'Aa1!';
    let created;try{created=await admin.auth.admin.createUser({email:request.email,password,email_confirm:true,user_metadata:{full_name:'Conversation acceptance fixture',conversation_qa_run:runId}});}catch{request.state='uncertain';await ledger();throw new Error('Auth create uncertain.');}
    if(created.error||!UUID.test(created.data?.user?.id||'')){
      const status=created.error?.status;request.state=Number.isInteger(status)&&status>=400&&status<500&&![408,409,425,429].includes(status)?'rejected':'uncertain';await ledger();throw new Error('Auth fixture unavailable.');
    }
    assert.equal(created.data.user.email,request.email);request.id=created.data.user.id;request.state='created';await ledger();
    await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values(${request.id},${request.id},${sql.json({sub:request.id,email:request.email,email_verified:true})},'google',now(),now())`;
    const signed=await createClient(projectOrigin,key,{auth,global:{fetch:projectFetch}}).auth.signInWithPassword({email:request.email,password});
    assert.ok(!signed.error&&signed.data.session?.user.id===request.id,'Actual fixture session required.');sessions.set(request.id,signed.data.session);return request;
  };
  const recordWrite=async(user,payload)=>{
    assert.ok(users.includes(user)&&user.id&&UUID.test(payload.id)&&Number.isInteger(payload.version));
    assert.ok(reservedConversations.has(payload.id),'Only an explicitly reserved synthetic conversation may be written.');
    assert.ok(Buffer.byteLength(JSON.stringify(payload),'utf8')<190000);
    const before=(await sql`select user_id,title,messages,version from public.affairs_conversations where id=${payload.id}`)[0]||null;
    const expectedMessages=sanitizeStoredConversation(payload.messages);
    const op={userId:user.id,payload,expectedMessages,expectedVersion:conversationExpectedVersion(user.id,payload,expectedMessages,before),
      beforeVersion:before?.version??null,state:'pending',sentAt:Date.now()};
    operations.push(op);await ledger();return op;
  };
  const finishWrite=async(op,response)=>{
    if(conversationResponseMatches(op,response))op.state='saved';
    else if([400,401,403,409].includes(response.status)&&typeof response.body?.error==='string')op.state='rejected';
    else op.state='uncertain';await ledger();
  };
  const inspectProbe=async id=>{
    const reserved=reservedConversations.get(id);
    assert.ok(previewDelete&&reserved,'Only generated Preview fixture IDs may be inspected.');
    return readProtectedConversationDeleteState(sql,id,{
      ownerId:reserved.userId,title:reserved.payload.title,callerIds:users.map(user=>user.id),
    });
  };
  const requestImpl=async(user,{method='GET',id,body,status=200}={})=>{
    if(previewBrowser)assert.ok(method==='GET'&&body===undefined&&user&&users.includes(user)&&reservedConversations.has(id));
    const dispatch=previewBrowser?createTrustedPreviewFetch({origin:target.origin,token:process.env.VERCEL_OIDC_TOKEN,conversationId:id}):fetchTarget;
    const ticket=previewPin?await previewPin.beforeRequest():null;
    let op;if(method==='POST')op=await recordWrite(user,body);
    let deletion;
    if(previewDelete&&method==='DELETE'){
      assert.ok(users.includes(user)&&reservedConversations.has(id));
      deletion={userId:user.id,conversationId:id,expected:expectedPreviewDeleteState(await inspectProbe(id),user.id,id),state:'pending',sentAt:Date.now()};
      deletions.push(deletion);await ledger();
    }
    let response;httpRequests++;
    try{response=await readNativeHttpResponse(await dispatch(target.origin+'/api/affairs-conversations'+(id?'?id='+id:''),{
      method,redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000),
      headers:{...(user?{Authorization:'Bearer '+sessions.get(user.id).access_token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));
      if(ticket)await previewPin.afterRequest(ticket);
    }catch{
      if(op)op.state='uncertain';
      if(deletion)deletion.state='uncertain';
      if(op||deletion)await ledger();
      throw new Error('Conversation request failed.');
    }
    if(op)await finishWrite(op,response);
    assert.equal(response.status,status,'Unexpected deployed conversation status.');
    if(deletion){
      assert.deepEqual(response.body,{deleted:true});
      assert.deepEqual(await inspectProbe(deletion.conversationId),deletion.expected);
      deletion.state='deleted';await ledger();
    }
    return response.body;
  };
  const request=(user,options)=>previewBrowser?withBrowserPin(()=>requestImpl(user,options)):requestImpl(user,options);
  try{
    sql=await pool.reserve();assert.equal((await sql`select pg_try_advisory_lock(23101314,115100) as held`)[0].held,true);locked=true;
    assert.ok((await sql`select version from supabase_migrations.schema_migrations where version='20261112190000'`).length,'190000 must be applied by release owner first.');
    if(protectedPreview)assert.ok((await sql`select version from supabase_migrations.schema_migrations where version='20261115230000'`).length,'The protected conversation migration is required.');
    await assertConversationRecoveryClear([directory,resolve(ROOT,'artifacts/assistant-evaluation')]);
    const owners=await sql`select id from auth.users where lower(email)=lower(${deployment.supabase.ownerEmail})`;assert.equal(owners.length,1);ownerId=owners[0].id;ownerBefore=await fingerprint();
    const file=await open(ledgerPath,'wx',0o600);ledgerOwned=true;await file.close();await ledger();
    if(previewPin){assertExactPreviewCheckout(target.revision);await previewPin.assertCurrent();}
    phase='actual JWT identities';const first=await createUser(),second=await createUser();
    if(previewDelete){
      phase='protected HTTP deletion and late saves';
      const [saved,pending]=probeFixtures;
      for(const payload of probeFixtures)reservedConversations.set(payload.id,{userId:first.id,payload});
      await runProtectedConversationDeleteChecks({owner:first,other:second,saved,pending,request,inspect:inspectProbe,
        expectedMessages:sanitizeStoredConversation(saved.messages)});
      checks.push('Protected Preview UUIDv7: exact owner save; cross-account GET, POST and DELETE isolation; exact deletion marker; late first-save and stale replay rejected; delete replay idempotent');
      assertExactPreviewCheckout(target.revision);await previewPin.finish();passed=true;return;
    }
    if(previewBrowser){
      phase='protected browser initialisation';
      browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
      const openContext=async(side,knownIds)=>{
        const user=side==='owner'?first:second,session=sessions.get(user.id);
        const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
        const reads=new Set();
        let deny;
        const denied=new Promise(resolve=>{deny=resolve;});
        await context.addInitScript(({session,origin})=>{
          if(location.origin===origin&&!sessionStorage.getItem('conversation-qa-init')){
            localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));
            sessionStorage.setItem('conversation-qa-init','1');
          }
        },{session,origin:target.origin});
        const relay=createProtectedConversationBrowserRelay({origin:target.origin,revision:target.revision,token:process.env.VERCEL_OIDC_TOKEN,
          ownerId:user.id,getCallerToken:()=>sessions.get(user.id)?.access_token,verifyPin:()=>withBrowserPin(()=>previewPin.assertCurrent()),
          assets:browserAssets.assets,dataPaths:browserAssets.dataPaths,
          authorizeSave:async({ownerId,payload,...observed})=>{
            const reservation=reservedConversations.get(payload.id);
            requireProtectedBrowser(ownerId===user.id&&reservation?.userId===user.id,'save fixture owner mismatch');
            const expected=await verifyProtectedBrowserSave({payload,question:reservation.question,...observed});
            requireProtectedBrowser((await sql`select id from public.affairs_conversations where id=${payload.id}`).length===0,
              'save reserved row already present');
            try{await recordWrite(user,payload);}catch{requireProtectedBrowser(false,'save journal write failed');}
            reservation.expected=expected;
            return true;
          },
        });
        for(const id of knownIds){
          assert.equal(reservedConversations.get(id)?.userId,user.id);
          relay.reserve({id,mode:'read'});
        }
        const drain=await installProtectedConversationBrowserRoute(context,{relay,async onReply({url,method,reply}){
          const destination=new URL(url),path=destination.pathname;
          if(!path.startsWith('/api/'))return;
          browserRequests++;
          if(path==='/api/affairs-assistant')modelRequests++;
          if(browserResponses.length<80)browserResponses.push({method,path,status:reply.status});
          if(path!=='/api/affairs-conversations')return;
          if(method==='GET'){reads.add(destination.searchParams.get('id')||'index');return;}
          const body=JSON.parse(reply.body.toString('utf8'));
          const op=operations.find(item=>item.userId===user.id&&item.payload.id===body.id&&item.state==='pending');
          requireProtectedBrowser(op,'save receipt not journaled');
          try{await finishWrite(op,{status:reply.status,body});}catch{requireProtectedBrowser(false,'save journal write failed');}
          requireProtectedBrowser(op.state==='saved','save receipt mismatch');
        },onDenied(request){
          const diagnostic=protectedBrowserDenial({origin:target.origin,...request});
          if(!diagnostic)return;
          if(browserDenials.length<20)browserDenials.push({phase,...diagnostic});
          if(browserErrors.length<20)browserErrors.push('Protected browser application request denied.');
          deny(new Error('Protected browser application request denied.'));
        }});
        const close=async()=>{await context.close();await drain();};
        try{
          const page=await context.newPage();activePage=page;page.setDefaultTimeout(30000);
          page.on('pageerror',()=>{if(browserErrors.length<20)browserErrors.push('Protected browser runtime exception.');});
          const index=page.waitForResponse(response=>response.url()===target.origin+'/api/affairs-conversations'
            &&response.request().method()==='GET'&&response.ok(),{timeout:45000}).then(()=>null,error=>error);
          await page.goto(target.origin+'/dtm',{waitUntil:'domcontentloaded'});
          await openVerifiedConversationAssistant(page,value=>{phase=value;});
          const failed=await Promise.race([index,denied]);if(failed)throw failed;
          return {page,dialog:page.getByRole('dialog',{name:/Assistant/}),reads,denied,close,reserve(reservation){
            assert.equal(side,'owner');assert.ok(!reservedConversations.has(reservation.id));
            relay.reserve(reservation);
            reservedConversations.set(reservation.id,{userId:user.id,question:reservation.question});
          }};
        }catch(error){await close();throw error;}
      };
      browserAcceptance=await runProtectedConversationBrowser({origin:target.origin,openContext,mark:value=>{phase=value;},
        onTurnVerified:proof=>browserTurnProofs.push(proof),
        async verifyPersisted({id,question}){
          const reservation=reservedConversations.get(id);
          assert.equal(reservation?.userId,first.id);assert.equal(reservation.question,question);
          const op=operations.find(row=>row.userId===first.id&&row.payload.id===id&&row.state==='saved');
          assert.ok(op&&reservation.expected);
          if(question===protectedConversationQuestions[0]){
            const profiles=await sql`select display_name,preferred_name from public.affairs_profiles where user_id=${first.id}`;
            const expectedName=profiles[0]?.preferred_name||profiles[0]?.display_name;
            assert.equal(profiles.length,1,'The disposable browser profile must have one stored row.');
            assert.equal(expectedName,'Conversation acceptance fixture');
            assert.ok(reservation.expected.answer.includes('Your display name is ` '+expectedName+' `.'),
              'The browser answer must contain the checked display name from its independently read profile.');
            assert.ok(reservation.expected.activity.some(step=>step.kind==='account-read:profile:1'&&step.status==='complete'));
          }
          const wire=await request(first,{id});
          assert.ok(conversationResponseMatches(op,{status:200,body:wire}));
          assert.ok(reconcileConversationWrite(op,await sql`select id,user_id,title,messages,version from public.affairs_conversations where id=${id}`));
          assert.deepEqual(await request(second,{id,status:404}),{error:'Conversation not found.'});
          return reservation.expected;
        },
      });
      assert.deepEqual(browserErrors,[]);assert.equal(modelRequests,2);assert.equal(operations.length,2);
      assertExactPreviewCheckout(target.revision);await previewPin.finish();
      checks.push('Protected Preview browser: two actual account turns, independently verified Activity and stored answers, cache-empty second conversation restoration and account isolation');
      passed=true;return;
    }
    phase='deployed HTTP save and isolation';
    const primary=conversationFixture(newConversationId(),'HTTP durable activity'),secondary=conversationFixture(newConversationId(),'Other account private activity');
    reservedConversations.set(primary.id,{userId:first.id,payload:primary});reservedConversations.set(secondary.id,{userId:second.id,payload:secondary});
    await request(null,{status:401});
    const firstSaved=await request(first,{method:'POST',body:primary});assert.equal(firstSaved.version,1);assert.deepEqual(firstSaved.messages,sanitizeStoredConversation(primary.messages));
    assert.equal((await request(first,{method:'POST',body:primary})).version,1,'Exact create replay must preserve version.');
    assert.deepEqual((await request(first,{id:primary.id})).messages,firstSaved.messages);
    await request(second,{id:primary.id,status:404});await request(second,{method:'POST',body:primary,status:403});
    await assertConversationDeleteIsolation(()=>request(first,{id:primary.id}),()=>request(second,{method:'DELETE',id:primary.id}));
    const stale={...primary,title:'Stale edit must fail'};await request(first,{method:'POST',body:stale,status:409});
    await request(second,{method:'POST',body:secondary});
    assert.ok(!(await request(second)).conversations.some(row=>row.id===primary.id));
    checks.push('Actual deployed JWT: 8000-unit answer,40 retained steps,exact replay,stale conflict,anonymous/cross-account denial');

    phase='fresh browser remote restoration';
    browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const openContext=async(user,seed)=>{
      const context=await browser.newContext({viewport:{width:390,height:900}});
      const remoteReads=new Set();
      await context.addInitScript(({session,seed,origin,cache})=>{if(location.origin===origin&&!sessionStorage.getItem('conversation-qa-init')){
        localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('conversation-qa-init','1');
        if(seed)sessionStorage.setItem(cache,JSON.stringify({scope:'account:'+session.user.id,activeId:seed.id,chats:[{...seed,updatedAt:new Date().toISOString()}]}));
      }},{session:sessions.get(user.id),seed,origin:ORIGIN,cache:CACHE});
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(/\/api\/(?:affairs-assistant|research-assistant)/.test(url.pathname))modelRequests++;
        if(url.hostname==='stu.edu.tw'||url.hostname.endsWith('.stu.edu.tw'))officialRequests++;
        if(!allowedConversationBrowserRequest(req.method(),req.url(),projectOrigin))return route.abort();
        if(url.pathname.startsWith('/api/')){
          browserRequests++;
          if(req.headers().authorization!=='Bearer '+sessions.get(user.id).access_token){browserErrors.push('Browser caller token mismatch.');return route.abort();}
        }
        if(req.method()!=='POST'||url.origin!==ORIGIN)return route.continue();
        const task=(async()=>{let op;
          try{const payload=req.postDataJSON(),reserved=reservedConversations.get(payload.id);
            assert.equal(reserved?.userId,user.id,'Browser may save only its own reserved synthetic fixture.');
            assert.equal(payload.title,reserved.payload.title);assert.deepEqual(sanitizeStoredConversation(payload.messages),sanitizeStoredConversation(reserved.payload.messages));
            op=await recordWrite(user,payload);await route.continue();}
          catch{if(op){op.state='uncertain';await ledger();}browserErrors.push('Browser write guard failed.');await route.abort().catch(()=>{});}
        })();activeBrowserWrites.add(task);try{await task;}finally{activeBrowserWrites.delete(task);}
      });
      context.on('response',response=>{const req=response.request(),destination=new URL(req.url());
        const diagnostic=conversationResponseDiagnostic(req.method(),req.url(),response.status(),projectOrigin);
        if(diagnostic&&browserResponses.length<80)browserResponses.push(diagnostic);
        if(destination.origin===ORIGIN&&destination.pathname==='/api/affairs-conversations'&&req.method()==='GET'&&response.status()===200)remoteReads.add(destination.searchParams.get('id')||'index');
        if(req.method()!=='POST'||destination.pathname!=='/api/affairs-conversations')return;
        const task=(async()=>{const payload=req.postDataJSON(),op=[...operations].reverse().find(item=>item.userId===user.id&&item.state==='pending'&&JSON.stringify(item.payload)===JSON.stringify(payload));
          if(!op){browserErrors.push('Unjournaled browser mutation response.');return;}
          try{await finishWrite(op,{status:response.status(),body:await response.json()});}catch{op.state='uncertain';browserErrors.push('Browser mutation response incomplete.');}
        })();activeBrowserWrites.add(task);void task.finally(()=>activeBrowserWrites.delete(task));
      });
      const page=await context.newPage();activePage=page;page.setDefaultTimeout(30000);page.on('pageerror',()=>browserErrors.push('Browser runtime exception.'));
      phase='browser: navigate to signed-in DTM';
      await page.goto(ORIGIN+'/dtm',{waitUntil:'domcontentloaded'});
      await openVerifiedConversationAssistant(page,value=>{phase=value;});
      return {context,page,remoteReads,dialog:page.getByRole('dialog',{name:/Assistant/})};
    };
    const assertRestored=async({page,dialog},fixture,forbidden=[secondary.title])=>{
      activePage=page;phase='browser: select saved conversation';
      await dialog.getByLabel('Conversations',{exact:true}).selectOption(fixture.id);
      phase='browser: await account-saved status';
      await dialog.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
      phase='browser: inspect restored activity';
      const timeline=dialog.getByRole('log').locator('details').filter({has:page.locator('summary').filter({hasText:'Activity'})});
      assert.equal(await timeline.count(),1);await timeline.locator('summary').click();
      const steps=timeline.getByRole('list',{name:'Observed assistant steps'});assert.equal(await steps.getByRole('listitem').count(),40);
      await steps.getByText('Observed fixture step 1',{exact:true}).waitFor();await steps.getByText('Observed fixture step 40',{exact:true}).waitFor();
      const transcript=(await dialog.getByRole('log').innerText()).replace(/\s+/g,' ');
      assert.ok(transcript.includes(fixture.messages[1].content.replace(/\s+/g,' ')),'The full long answer must survive browser rendering.');
      const summary=timeline.locator('summary');await summary.focus();await summary.press('Space');assert.equal(await timeline.getAttribute('open'),null);
      await summary.press('Enter');assert.notEqual(await timeline.getAttribute('open'),null);
      for(const marker of forbidden)assert.ok(!(await dialog.getByRole('log').innerText()).includes(marker));
      for(const width of [390,1440]){phase='browser: verify viewport bounds at '+width;await page.setViewportSize({width,height:900});await page.waitForFunction(()=>{
        const box=document.querySelector('[role="dialog"]')?.getBoundingClientRect();return box&&box.left>=-1&&box.right<=innerWidth+1&&box.top>=-1&&box.bottom<=innerHeight+1;
      });assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
    };
    const restored=await openContext(first);await assertRestored(restored,primary);
    assert.ok(restored.remoteReads.has('index')&&restored.remoteReads.has(primary.id),'Fresh browser must restore through the deployed index and detail API.');
    phase='browser: reload saved conversation';await restored.page.reload({waitUntil:'domcontentloaded'});await openVerifiedConversationAssistant(restored.page,value=>{phase=value;});await assertRestored(restored,primary);await restored.context.close();
    // A separate, cache-empty context forces another actual server GET.
    const clean=await openContext(first);await assertRestored(clean,primary);assert.ok(clean.remoteReads.has('index')&&clean.remoteReads.has(primary.id));await clean.context.close();
    const other=await openContext(second);await assertRestored(other,secondary,[primary.title]);
    assert.ok(other.remoteReads.has('index')&&other.remoteReads.has(secondary.id),'Account B must restore its own server conversation.');
    assert.ok(!(await other.dialog.getByLabel('Conversations',{exact:true}).innerText()).includes(primary.title));
    assert.ok(!(await other.dialog.getByRole('log').innerText()).includes(primary.title));await other.context.close();
    checks.push('Fresh-context server restoration,40 mandatory expandable steps,reload,phone/desktop bounds and other-account picker isolation');

    phase='actual browser autosave';const seeded=conversationFixture(newConversationId(),'Browser autosave activity');
    reservedConversations.set(seeded.id,{userId:first.id,payload:seeded});
    const ui=await openContext(first,seeded);phase='browser: await synthetic-turn autosave';await ui.dialog.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
    await assertRestored(ui,seeded);await ui.context.close();
    await Promise.all([...activeBrowserWrites]);
    const browserSaved=await request(first,{id:seeded.id});assert.deepEqual(browserSaved.messages,sanitizeStoredConversation(seeded.messages));
    const final=await openContext(first);await assertRestored(final,seeded);await final.context.close();
    assert.ok(operations.some(op=>op.payload.id===seeded.id&&op.state==='saved'),'Observed browser save must complete on the actual server.');
    checks.push('Synthetic cached turn autosaved through real browser HTTP,then restored in a cache-empty context; no model response mocked');
    phase='signed-out browser isolation';const signedOut=await openContext(first);await assertRestored(signedOut,primary);
    phase='browser: sign out local fixture session';
    await signedOut.page.goto(ORIGIN+'/school-affairs/signed-out',{waitUntil:'domcontentloaded'});
    await signedOut.page.waitForFunction(()=>!localStorage.getItem('stu-school-affairs-auth'));
    await signedOut.page.goto(ORIGIN+'/dtm',{waitUntil:'domcontentloaded'});
    await signedOut.page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();
    await signedOut.dialog.getByRole('link',{name:'School Affairs sign in',exact:true}).waitFor();
    assert.ok(!(await signedOut.dialog.innerText()).includes(primary.title));
    assert.ok(!(await signedOut.page.evaluate(key=>sessionStorage.getItem(key)||'',CACHE)).includes(primary.id));
    await signedOut.context.close();checks.push('Real local-scope sign-out removes the account transcript and private browser cache');
    assert.deepEqual(browserErrors,[]);assert.equal(modelRequests,0);assert.equal(officialRequests,0);await manifest();passed=true;
  }catch(error){
    failure={phase,type:error instanceof assert.AssertionError?'assertion':error?.name==='TimeoutError'?'TimeoutError':'Error'};
    if(activePage&&!activePage.isClosed()&&new URL(activePage.url()).origin===target.origin){
      // This context contains only fresh disposable identities and synthetic
      // records. Save a viewport image before teardown; never storage/headers.
      try{
        failure.browser=await boundedConversationDiagnostic(activePage.evaluate(()=>({
          path:location.pathname==='/dtm'?'/dtm':'other-local-route',
          launchers:document.querySelectorAll('button[aria-label="開啟 AI 校園助理"]').length,
          dialogs:document.querySelectorAll('[role="dialog"]').length,
          pickerPresent:Boolean(document.querySelector('#assistant-conversation-picker')),
          pickerDisabled:document.querySelector('#assistant-conversation-picker')?.disabled??null,
          optionCount:document.querySelector('#assistant-conversation-picker')?.options.length??0,
          alertCount:document.querySelectorAll('[role="alert"]').length,
        })));
        const filename='failure-'+runId+'.png';
        await writeFile(directory+'/'+filename,await activePage.screenshot({fullPage:false,timeout:5000}),{mode:0o600});
        failure.screenshot=filename;
      }catch{failure.browserDiagnosticUnavailable=true;}
    }
  }
  finally{
    phase='cleanup';
    try{
      await browser?.close();await Promise.all([...activeBrowserWrites]);
      if(ledgerOwned){
        for(const user of users){
          const rows=await sql`select id,email,raw_user_meta_data->>'conversation_qa_run' as run from auth.users where lower(email)=lower(${user.email}) or id=${user.id}::uuid`;
          if(user.state==='rejected'&&!rows.length)continue;
          user.id=reconcileConversationIdentity(user,rows,runId,ownerId);user.state='created';
        }
        for(const op of operations.filter(item=>['pending','uncertain'].includes(item.state))){
          // A timeout cannot establish that the server did not commit. Only an
          // exact durable row proves the known write; otherwise preserve fixtures.
          reconcileConversationWrite(op,await sql`select id,user_id,title,messages,version from public.affairs_conversations where id=${op.payload.id}`);op.state='reconciled';
        }
        for(const deletion of deletions.filter(item=>item.state!=='deleted')){
          assert.deepEqual(await inspectProbe(deletion.conversationId),deletion.expected,'An uncertain deletion requires its exact durable marker and row state.');
          deletion.state='reconciled';
        }
        await ledger();
        assert.equal(await fingerprint(),ownerBefore,'Protected owner changed.');
        for(const user of [...users].reverse().filter(item=>item.id)){
          let deleted=false;for(let attempt=0;attempt<3;attempt++){try{const result=await admin.auth.admin.deleteUser(user.id);if(!result.error||result.error.status===404){deleted=true;break;}}catch{/* Bounded retry; exact row removal checked below. */}}
          assert.ok(deleted,'Fixture deletion uncertain; retain ledger.');
        }
        const ids=users.flatMap(user=>user.id?[user.id]:[]);
        if(ids.length)assert.equal((await sql`select id from auth.users where id in ${sql(ids)} union all select id from public.affairs_conversations where user_id in ${sql(ids)} union all select user_id from public.affairs_profiles where user_id in ${sql(ids)}`).length,0);
        if(protectedPreview&&ids.length&&reservedConversations.size){
          const reservedIds=[...reservedConversations.keys()];
          assert.equal((await sql`select id from public.affairs_conversations where id in ${sql(reservedIds)}
            union all select user_id from auth.identities where user_id in ${sql(ids)}
            union all select user_id from private.affairs_conversation_delete_markers where user_id in ${sql(ids)} or conversation_id in ${sql(reservedIds)}
            union all select user_id from private.affairs_conversation_creation_floors where user_id in ${sql(ids)}`).length,0);
        }
        assert.equal(await fingerprint(),ownerBefore,'Protected owner changed after cleanup.');cleanupVerified=true;
      }else cleanupVerified=users.length===0;
    }catch{failure=failure||{phase:'cleanup',type:'unresolved'};cleanupVerified=false;}
    finally{
      sessions.clear();
      try{if(locked)await sql`select pg_advisory_unlock(23101314,115100)`;}catch{cleanupVerified=false;}
      try{await sql?.release();}catch{cleanupVerified=false;}
      try{await pool.end({timeout:5});}catch{cleanupVerified=false;}
    }
    if(cleanupVerified&&ledgerOwned)try{await rm(ledgerPath);}catch{cleanupVerified=false;}
    const report={runId,origin:target.origin,revision:target.revision,status:passed&&cleanupVerified?'passed':'failed',checks,failure,cleanupVerified,
      httpRequests,browserRequests,modelRequests,officialRequests,modelAcceptance:false,browserErrors,browserResponses,
      ...(previewPin?{probe:previewBrowser?'protected-conversation-browser':'uuidv7-conversation-delete',deployment:previewPin.status()}:{}),
      ...(previewBrowser?{browserDenials,browserTurnProofs,incrementalActivityAcceptance:false}:{}),
      ...(browserAcceptance?{browserAcceptance}:{}),
    };
    await writeFile(directory+'/report-'+runId+'.json',JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
