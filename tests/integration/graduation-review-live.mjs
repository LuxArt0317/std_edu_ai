import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright-core';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

// Run only after the native route and reviewed migration are integrated.
// Mutations and cleanup are restricted to exact, newly generated fixture IDs.
process.umask(0o077);
const deployment=JSON.parse(await readFile('deployment.json','utf8')),env=deploymentEnvironment();Object.assign(process.env,env);
const origin=process.env.NATIVE_ORIGIN||deployment.vercel.productionUrl,local=new URL(origin).hostname==='127.0.0.1';
assert.ok(local||origin===deployment.vercel.productionUrl,'Use the configured production origin or loopback.');
const catalog=JSON.parse(await readFile('src/features/public/affairs/catalog.json','utf8'));
assert.equal(catalog[14][3][0][1],'infosys.stu.edu.tw/AcademicServices/Login/AspLoginGradReview','Catalog 15-1 is the native graduation report source.');
assert.equal(catalog[14][3][1][1],'info.stu.edu.tw/aca/grdcheckreport/index.asp','Catalog 15-2 remains a distinct older service.');
// Local record coverage is deterministic unless explicitly opting into the real model.
const liveModel=process.argv.includes('--live-model');
assert.ok(!local||!liveModel||Boolean(process.env.OPENAI_API_KEY?.trim()),'--live-model requires an already configured local OPENAI_API_KEY; no fixtures were created.');
const assistantMode=local?(liveModel?'local_model':'local_deterministic'):'deployed_model';
const assistantCheck=assistantMode==='local_deterministic'
  ? 'deterministic native answers from fresh real caller-JWT snapshots; model verification not exercised'
  : `${assistantMode}: actual assistant API answers with verified model account evidence`;
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
assert.equal(new URL(url).hostname,deployment.supabase.projectRef+'.supabase.co');
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL,target=new URL(connection);
assert.ok(target.hostname===`db.${deployment.supabase.projectRef}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+deployment.supabase.projectRef));
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,{auth}),ownerClient=createClient(url,key,{auth});
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const runId=randomUUID(),users=[],requests=new Set(),ids=Array.from({length:4},()=>randomUUID()),checks=[];
const path='/school-affairs/services/13-1/graduation',catalogPath='/school-affairs/services/15-1',legacyPath='/school-affairs/services/15-2',kind='save_graduation_review';
const output=`artifacts/graduation-review/${local?'local':'production'}-${runId}`;
// Production verification uses only the deployed API. Working-tree handlers are
// loaded exclusively for local Vite, which does not host the serverless routes.
const deterministicModules=assistantMode==='local_deterministic'
  ? await Promise.all([import('../../server/affairsWorkspace.js'),import('../../server/affairsAnswer.js')]):null;
async function deterministicAssistant(request,response){
  assert.equal(request.method,'POST','The deterministic bridge supports only the fixture question calls.');
  const {verifyAffairsToken,loadAffairsSnapshot}=deterministicModules[0];
  const {answerPrivateAffairsQuestion}=deterministicModules[1];
  const account=await verifyAffairsToken(request.headers.authorization?.slice(7)||'');
  const fresh=await loadAffairsSnapshot(account,false,{initialize:false,deadline:Date.now()+55000});
  response.json(await answerPrivateAffairsQuestion(request.body.question,fresh,request.body.history||[],request.body.route||'',{draftOnly:true}));
}
function checkedAssistantResult(endpoint,result){
  if(new URL(endpoint,origin).pathname==='/api/affairs-assistant'&&result.status===200){
    assert.equal(result.body?.status,'answered',`${assistantMode}: expected a native account answer, not an abstention.`);
    if(assistantMode==='local_deterministic')assert.equal(result.body.verification,undefined,'Deterministic drafts must not claim model verification.');
    else assert.equal(result.body.verification?.status,'verified',`${assistantMode}: model answers must pass actual account-evidence verification.`);
  }
  return result;
}
const handlers=local?{
  '/api/affairs-data':(await import('../../api/affairs-data.ts')).default,
  '/api/affairs-manage':(await import('../../api/affairs-manage.ts')).default,
  '/api/affairs-assistant':assistantMode==='local_deterministic'?deterministicAssistant:(await import('../../api/affairs-assistant.ts')).default,
}:{};
const title='QA graduation course '+runId.slice(0,8),otherTitle='Private other-account course '+runId.slice(0,8),legacyTitle='Legacy graduation course '+runId.slice(0,8);
let browser,ownerId,ownerBefore,ownerSession,ownerUnchanged=false,largeEnvelopeBytes=0,schemaReady=false,phase='setup';
const fingerprint=async()=>(await sql`select md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,
  md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identity_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${ownerId}`)[0];
async function authenticateOwner(){
  const file=await stat('.env.owner.local');assert.equal(file.mode&0o077,0,'Owner credential file must remain private.');
  const credentials=parseEnv(await readFile('.env.owner.local','utf8'));
  assert.equal(credentials.CRM_ADMIN_EMAIL?.toLowerCase(),deployment.supabase.ownerEmail.toLowerCase());assert.ok(credentials.CRM_ADMIN_PASSWORD,'Existing owner credentials are required.');
  const signed=await ownerClient.auth.signInWithPassword({email:credentials.CRM_ADMIN_EMAIL,password:credentials.CRM_ADMIN_PASSWORD});
  ownerSession=signed.data.session;assert.ok(!signed.error&&ownerSession,'Existing administrator sign-in failed.');
  const verified=await ownerClient.auth.getUser(ownerSession.access_token);assert.ok(!verified.error&&verified.data.user,'Existing administrator JWT verification failed.');
  assert.equal(verified.data.user.id,ownerId);assert.equal(verified.data.user.email?.toLowerCase(),deployment.supabase.ownerEmail.toLowerCase());
  assert.ok(verified.data.user.email_confirmed_at&&verified.data.user.identities?.some(identity=>identity.provider==='google'),'Existing administrator must retain its verified Google identity.');
  // No owner snapshot/initialization endpoint is called by this harness.
}
const jsonbText=value=>Array.isArray(value)?'['+value.map(jsonbText).join(', ')+']':value&&typeof value==='object'
  ? '{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+': '+jsonbText(item)).join(', ')+'}':JSON.stringify(value);
async function invoke(endpoint,{token,method='GET',body}={}){
  if(!local){
    const response=await fetch(origin+endpoint,{method,redirect:'error',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
    const result={status:response.status,body:await response.json()};
    if(endpoint==='/api/affairs-assistant')await writeFile(output+'/last-assistant.json',JSON.stringify({question:body.question,route:body.route,...result.body},null,2));
    return checkedAssistantResult(endpoint,result);
  }
  const parsed=new URL(endpoint,origin),handler=handlers[parsed.pathname];assert.ok(handler);
  const result={status:200,body:undefined},response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(){}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},query:Object.fromEntries(parsed.searchParams),body},response);return checkedAssistantResult(endpoint,result);
}
async function request(endpoint,options={}){const result=await invoke(endpoint,options);assert.equal(result.status,options.status??200,`${phase}: ${endpoint} status ${result.status}`);return result.body;}
const snapshot=session=>request('/api/affairs-data',{token:session.access_token});
const answer=(session,question)=>request('/api/affairs-assistant',{method:'POST',token:session.access_token,body:{question,route:path}});
function assertReport(data,expected,id,userId,version,reportKind='academic_services'){
  assert.ok(data&&Array.isArray(data.reports),'Snapshot includes structured graduation reports.');
  assert.ok(data.reports.every(row=>row.userId===userId&&['academic_services','legacy'].includes(row.reportKind)),'Every report is owned and explicitly source-scoped.');
  const rows=data.reports.filter(row=>row.reportKind===reportKind);assert.equal(rows.length,1,'An account receives only one report of each kind.');
  const {id:actualId,userId:actualUser,reportKind:actualKind,version:actualVersion,sourceMode,createdAt,updatedAt,...content}=rows[0];
  assert.equal(actualKind,reportKind);
  assert.equal(actualId,id);assert.equal(actualUser,userId);assert.equal(actualVersion,version);assert.equal(sourceMode,'local_demo');
  assert.ok(Number.isFinite(Date.parse(createdAt)));assert.ok(Number.isFinite(Date.parse(updatedAt)));
  assert.deepEqual(content,expected,'Every literal field, nested ID, array order and nullable value survives persistence.');
  return rows[0];
}
async function fixture(number){
  const email=`graduation-review-qa-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Graduation QA ${number}`}});
  if(created.error||!created.data.user)throw new Error('Synthetic account creation failed.');
  const id=created.data.user.id;users.push(id);
  await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values(${id},${id},${sql.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
  const signed=await createClient(url,key,{auth}).auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session)throw new Error('Synthetic account sign-in failed.');
  await snapshot(signed.data.session);return signed.data.session;
}
async function save(payload,status=200){
  assert.ok(ownerSession&&ids.includes(payload.id)&&users.includes(payload.user_id)&&payload.user_id!==ownerId,'Exact synthetic fixture operation and administrator JWT required.');
  assert.match(payload.request_id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);requests.add(payload.request_id);
  const [existing]=await sql`select user_id from public.affairs_graduation_reviews where id=${payload.id}`;
  if(existing)assert.ok(users.includes(existing.user_id)&&existing.user_id!==ownerId,'An existing target must belong to this run’s synthetic accounts.');
  return request('/api/affairs-manage',{token:ownerSession.access_token,method:'POST',body:{kind,payload},status});
}
function report(courseTitle){
  const course={id:randomUUID(),sequenceText:'1',title:courseTitle,credits:0,requiredElectiveText:'必',yearText:'一',transferText:null};
  return {reportedAt:'2026-11-12T10:00:00Z',identity:{studentNumber:'QA-GRAD',studentName:'Synthetic Graduation Student',departmentName:'QA Department',yearText:'四',enrollmentStatusText:'Synthetic active',curriculumCohortText:'QA cohort',doubleMajorText:null,minorText:null},
    educationProgram:{text:'N',indicator:null},foreignLanguageCompletion:{text:'N',indicator:'attention'},englishRequirement:{text:'QA pending',indicator:'attention'},graduationReview:{text:'QA review pending',indicator:'attention',note:'Synthetic report; no eligibility decision'},
    languageRequirements:[{id:randomUUID(),label:'QA language requirement',status:{text:'Explicit pending',indicator:'attention'},requiredCredits:8,matchedCredits:0,missingCredits:7.5}],
    categories:[{id:randomUUID(),label:'QA Required category',requiredElectiveText:'必',requiredCredits:12,completedCredits:9,matchedCredits:6,excludedCredits:2,status:{text:'Explicit pending',indicator:'attention'},detailSubtotalCredits:2.5,
      requirements:[{id:randomUUID(),sequenceText:'1',title:'QA Requirement',moduleText:'QA module',credits:3,requiredElectiveText:'必',yearText:'一',transferText:null,indicator:'attention',matchedCourses:[course]}]},
    {id:randomUUID(),label:'QA Empty category',requiredElectiveText:'選',requiredCredits:null,completedCredits:0,matchedCredits:null,excludedCredits:null,status:{text:null,indicator:null},requirements:[],detailSubtotalCredits:null}],
    otherCourses:[{...course,id:randomUUID(),sequenceText:'9'}]};
}
async function pageFor(session){
  const context=await browser.newContext({viewport:{width:1533,height:1399},locale:'zh-TW',reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{if(window.top!==window||location.origin!==origin||sessionStorage.getItem('graduation-qa'))return;
    localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('graduation-qa','1');},{origin,session});
  if(local)await context.route('**/api/**',async route=>{const req=route.request(),endpoint=new URL(req.url());if(!handlers[endpoint.pathname])return route.continue();
    const result=await invoke(endpoint.pathname+endpoint.search,{method:req.method(),token:req.headers().authorization?.slice(7),body:req.postData()?JSON.parse(req.postData()):undefined});await route.fulfill({status:result.status,json:result.body});});
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));return {context,page,errors};
}
async function legacyBitmaps(page,expected,checked){
  const rendered=await page.locator('.legacy-graduation').evaluate(async root=>{
    const images=[...root.querySelectorAll('img')];await Promise.all(images.map(image=>image.decode()));
    if(images.some(image=>!image.complete||image.naturalWidth===0||image.naturalHeight===0))throw new Error('A legacy report bitmap did not decode.');
    const backgrounds=[...root.querySelectorAll('*')].flatMap(element=>[...getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match=>match[1]));
    return [...new Set([...images.map(image=>image.currentSrc||image.src),...backgrounds])];
  });
  const paths=rendered.map(value=>{const asset=new URL(value,origin);assert.equal(asset.origin,new URL(origin).origin,'Legacy bitmaps must use the local clone.');assert.ok(asset.pathname.startsWith('/school-assets/'));return asset.pathname;});
  for(const asset of expected)assert.ok(paths.includes(asset),'The source bitmap is rendered: '+asset);
  for(const asset of new Set(paths)){
    if(checked.has(asset))continue;
    const response=await page.request.get(origin+asset);assert.equal(response.status(),200,'Legacy bitmap HTTP success: '+asset);
    const bytes=await response.body(),mime=response.headers()['content-type']||'';
    if(asset.endsWith('.png')){assert.match(mime,/^image\/png(?:;|$)/i);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
    else if(asset.endsWith('.gif')){assert.match(mime,/^image\/gif(?:;|$)/i);assert.match(bytes.subarray(0,6).toString('ascii'),/^GIF8[79]a$/);}
    else if(/\.jpe?g$/.test(asset)){assert.match(mime,/^image\/jpeg(?:;|$)/i);assert.equal(bytes.subarray(0,3).toString('hex'),'ffd8ff');}
    else assert.fail('Unexpected legacy bitmap format: '+asset);
    checked.add(asset);
  }
}
try{
  await mkdir(output,{recursive:true,mode:0o700});
  const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id
    where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
    and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(owner,'Configured Google administrator must already exist.');ownerId=owner.id;ownerBefore=await fingerprint();
  await authenticateOwner();
  assert.ok((await sql`select to_regclass('public.affairs_graduation_reviews') as name`)[0].name,'Apply graduation migration before running.');schemaReady=true;
  const first=await fixture(1),second=await fixture(2),firstReport=report(title),secondReport=report(otherTitle),legacyReport=report(legacyTitle);
  legacyReport.graduationReview.text='Legacy QA review pending';
  const payload={id:ids[0],user_id:first.user.id,report_kind:'academic_services',request_id:randomUUID(),expected_version:'0',report:firstReport};
  phase='authorization and records';await request('/api/affairs-data',{status:401});await request('/api/affairs-data?scope=admin',{token:first.access_token,status:403});
  await request('/api/affairs-manage',{token:first.access_token,method:'POST',body:{kind,payload},status:403});
  await request('/api/affairs-manage',{token:first.access_token,method:'POST',body:{kind,payload:[]},status:400});
  const initial=await save(payload);assert.equal(initial.version,1);assert.equal(initial.report_kind,'academic_services');assert.deepEqual(await save(payload),initial);
  const otherPayload={id:ids[1],user_id:second.user.id,report_kind:'academic_services',request_id:randomUUID(),expected_version:'0',report:secondReport};await save(otherPayload);
  const legacyPayload={id:ids[2],user_id:first.user.id,report_kind:'legacy',request_id:randomUUID(),expected_version:'0',report:legacyReport};
  const legacyReceipt=await save(legacyPayload);assert.equal(legacyReceipt.version,1);assert.equal(legacyReceipt.report_kind,'legacy');assert.deepEqual(await save(legacyPayload),legacyReceipt);
  let data=(await snapshot(first)).graduationReview;const modern=assertReport(data,firstReport,ids[0],first.user.id,1);assert.equal(data.reports.length,2);
  assertReport(data,legacyReport,ids[2],first.user.id,1,'legacy');
  const otherData=(await snapshot(second)).graduationReview;assertReport(otherData,secondReport,ids[1],second.user.id,1);assert.equal(otherData.reports.length,1);
  assert.equal(modern.categories[0].requirements[0].matchedCourses[0].credits,0);assert.equal(modern.categories[1].requiredCredits,null);
  assert.equal(modern.languageRequirements[0].missingCredits,7.5);assert.equal(modern.categories[0].detailSubtotalCredits,2.5);
  assert.equal(modern.educationProgram.indicator,null);assert.equal(modern.foreignLanguageCompletion.indicator,'attention');
  assert.ok(!JSON.stringify(data).includes(otherTitle));assert.ok(!JSON.stringify((await snapshot(second)).graduationReview).includes(title));
  await save({...payload,request_id:randomUUID(),expected_version:'1',report:{...firstReport,categories:[{...firstReport.categories[0],unexpected:'rejected'},firstReport.categories[1]]}},400);
  const missingKind={...payload,request_id:randomUUID(),expected_version:'1'};delete missingKind.report_kind;await save(missingKind,400);
  await save({...payload,request_id:randomUUID(),expected_version:'1',report_kind:'unknown'},400);
  await save({...payload,report_kind:'legacy'},409);
  await save({...otherPayload,request_id:randomUUID(),expected_version:'1',report_kind:'legacy'},400);
  for(const existing of [payload,legacyPayload])await save({...existing,id:ids[3],request_id:randomUUID()},409);
  checks.push('actual administrator JWT manager API create/replay and HTTP 400/409/403 checks; own-account modern/legacy coexistence, required immutable report kind (including a free target kind), owner+kind uniqueness, 401/403, strict nested keys and literal credits/statuses');

  phase='private graduation assistant';
  const response=await answer(first,'Show my graduation credit review and required course details');
  assert.ok(response.answer.includes('QA review pending'));assert.ok(!response.answer.includes(otherTitle));assert.ok(!response.answer.includes(legacyTitle)&&!response.answer.includes('Legacy QA review pending'));
  assert.equal(response.grounding.source,'account');assert.equal(response.grounding.webSearched,false);assert.ok(response.citations.some(item=>item.url===path));assert.equal(response.proposedAction,undefined);
  const secondAnswer=await answer(second,'Show my graduation credit review and required course details');
  assert.ok(secondAnswer.answer.includes(otherTitle));assert.ok(!secondAnswer.answer.includes(title));
  checks.push(assistantCheck+'; private graduation answers, literal saved review status, local citation, no web search or implicit write');

  phase='native report navigation';browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {context,page,errors}=await pageFor(first);await page.goto(origin+'/school-affairs/menu/aca/query');
  const catalogLink=page.locator('[data-program-id="15-1"]');await catalogLink.waitFor();
  assert.equal(await catalogLink.innerText(),catalog[14][3][0][0]);
  assert.ok([path,catalogPath].includes(await catalogLink.getAttribute('href')),'Catalog 15-1 navigates to the native report or its direct alias.');
  assert.equal(await page.locator('[data-program-id="15-2"]').getAttribute('href'),legacyPath,'The older catalog service must stay distinct.');
  await catalogLink.click();await page.locator('.graduation-review').waitFor();await page.getByText('QA review pending',{exact:true}).waitFor();
  await page.goto(origin+catalogPath);await page.locator('.graduation-review').waitFor();await page.getByText('QA review pending',{exact:true}).waitFor();
  await page.goto(origin+'/school-affairs/services/13-1');await page.locator('.academic-grade-index-table').getByRole('link',{name:'畢業學分檢核表',exact:true}).click();
  await page.getByRole('heading',{name:'學生畢業學分檢核表',exact:true}).waitFor();await page.getByText('QA review pending',{exact:true}).waitFor();
  assert.deepEqual(await page.locator('.graduation-review-language tbody tr td').allTextContents(),['QA language requirement','Explicit pending','8','0','7.5']);
  assert.deepEqual((await page.locator('.graduation-review-category').nth(1).locator('td').allTextContents()).slice(0,7),['QA Empty category','選','—','0','—','—','—']);
  assert.equal(await page.getByRole('button',{name:'展開全部資料明細',exact:true}).getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.graduation-review-requirements').count(),0,'Nested contents start collapsed.');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:output+'/collapsed-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'展開全部資料明細',exact:true}).click();
  // The source-faithful cell also contains a status-icon glyph; assert the row,
  // rather than requiring its complete text to equal only the course label.
  await page.locator('.graduation-review-required').filter({hasText:'QA Requirement'}).waitFor();
  assert.match(await page.locator('.graduation-review-matched td').nth(1).innerText(),new RegExp(title));
  assert.equal(await page.locator('.graduation-review-matched td').nth(3).innerText(),'0');
  assert.equal(await page.locator('.graduation-review-other tbody td').nth(1).innerText(),title);
  assert.ok(!(await page.locator('.graduation-review').innerText()).includes(legacyTitle),'Modern page must select only academic_services despite the same-owner legacy report.');
  assert.equal(await page.locator('.graduation-review-other tbody td').nth(2).innerText(),'0');
  assert.equal(await page.locator('.graduation-review-subtotal td').nth(1).innerText(),'2.5','Subtotal is explicit, not derived from the zero-credit matched row.');
  await page.screenshot({path:output+'/expanded-desktop.png',fullPage:true});await page.reload();await page.getByText('QA review pending',{exact:true}).waitFor();
  for(const width of[390,320]){await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'展開全部資料明細',exact:true}).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow at '+width);await page.screenshot({path:`${output}/expanded-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'收合全部資料明細',exact:true}).click();}
  phase='legacy report navigation';await page.setViewportSize({width:1533,height:1399});await page.goto(origin+'/school-affairs/menu/aca/query');
  const legacyLink=page.locator('[data-program-id="15-2"]');await legacyLink.waitFor();assert.equal(await legacyLink.innerText(),catalog[14][3][1][0]);
  assert.equal(await legacyLink.getAttribute('href'),legacyPath);await legacyLink.click();await page.waitForURL(origin+legacyPath);
  await page.locator('.legacy-graduation').waitFor();await page.getByText('Legacy QA review pending',{exact:true}).waitFor();
  assert.equal(await page.locator('.graduation-review').count(),0,'Legacy routing mounts its distinct source layout.');
  assert.equal(await page.locator('.legacy-graduation-heading h1').innerText(),'畢業檢核表');
  assert.deepEqual(await page.locator('.legacy-graduation-banner span').allTextContents(),['Campus Information Services','Shu-Te University']);
  assert.deepEqual(await page.locator('.legacy-graduation-language thead th').allTextContents(),['課程類別','是否通過','應修學分','符合學分','尚缺學分']);
  assert.deepEqual(await page.locator('.legacy-graduation-categories>thead>tr>th').allTextContents(),['課程類別','必/選','應修學分','已修學分','符合學分','不計入此類學分','通過','']);
  assert.deepEqual(await page.locator('.legacy-graduation-other thead th').allTextContents(),['#','實際修習課程','學分','必/選修','年級','抵免']);
  assert.equal(await page.locator('.legacy-graduation-other tbody td').nth(1).innerText(),legacyTitle);
  assert.equal(await page.locator('.legacy-graduation-other tbody td').nth(2).innerText(),'0');
  const legacyText=await page.locator('.legacy-graduation').innerText();assert.ok(!legacyText.includes(title)&&!legacyText.includes(otherTitle),'Legacy report excludes modern-kind and other-account courses.');
  assert.equal(await page.locator('.legacy-graduation-requirements').count(),0);const legacyToggle=page.locator('.legacy-graduation-toggle').first();
  assert.equal(await legacyToggle.getAttribute('aria-expanded'),'false');
  const checkedBitmaps=new Set();await legacyBitmaps(page,[
    '/school-assets/03599fb12dbe1c0d2b5c.png','/school-assets/ba103f41fe0ee059b99b.gif','/school-assets/6172815f3391f37b1b6a.gif',
    '/school-assets/827a59e0174289f1388c.png','/school-assets/cf10a5c7cb6973669783.png','/school-assets/0960ed37e10f8775354c.jpg',
  ],checkedBitmaps);
  await legacyToggle.click();await page.locator('.legacy-graduation-matched').waitFor();assert.equal(await legacyToggle.getAttribute('aria-expanded'),'true');
  assert.deepEqual(await page.locator('.legacy-graduation-requirements thead th').allTextContents(),['#','應修習課程','模組','學分','必/選修','年級','抵免']);
  assert.equal(await page.locator('.legacy-graduation-matched td').nth(1).innerText(),legacyTitle);assert.equal(await page.locator('.legacy-graduation-matched td').nth(3).innerText(),'0');
  assert.equal(await page.locator('.legacy-graduation-subtotal td').nth(1).innerText(),'2.5','Legacy subtotal remains explicit.');
  await legacyBitmaps(page,['/school-assets/f0e515db0bd6dc759cce.gif','/school-assets/4bd0c7cd8dc640cface9.png'],checkedBitmaps);
  await page.getByRole('button',{name:'收合全部資料明細',exact:true}).click();assert.equal(await page.locator('.legacy-graduation-requirements').count(),0);assert.equal(await legacyToggle.getAttribute('aria-expanded'),'false');
  await page.getByRole('button',{name:'展開全部資料明細',exact:true}).click();await page.locator('.legacy-graduation-matched').waitFor();assert.equal(await legacyToggle.getAttribute('aria-expanded'),'true');
  await page.reload();await page.getByText('Legacy QA review pending',{exact:true}).waitFor();assert.equal(await page.locator('.legacy-graduation-requirements').count(),0);
  assert.equal(await page.locator('.legacy-graduation-other tbody td').nth(1).innerText(),legacyTitle);
  assert.deepEqual(errors,[]);await context.close();const other=await pageFor(second);await other.page.goto(origin+path);await other.page.getByText('QA review pending',{exact:true}).waitFor();
  await other.page.getByRole('button',{name:'展開全部資料明細',exact:true}).click();await other.page.locator('.graduation-review-matched').waitFor();
  assert.equal(await other.page.locator('.graduation-review-other tbody td').nth(1).innerText(),otherTitle);assert.ok(!(await other.page.locator('.graduation-review').innerText()).includes(title));
  await other.page.goto(origin+legacyPath);await other.page.getByRole('status').filter({hasText:'目前沒有站內舊版畢業檢核紀錄。'}).waitFor();
  const emptyLegacy=await other.page.locator('.legacy-graduation').innerText();assert.ok(!emptyLegacy.includes(title)&&!emptyLegacy.includes(legacyTitle)&&!emptyLegacy.includes(otherTitle));
  assert.equal(await other.page.locator('.legacy-graduation-data,.graduation-review').count(),0,'Missing own legacy report must not fall back to modern or another account.');
  assert.deepEqual(other.errors,[]);await other.context.close();
  checks.push('catalog 15-1/15-2 click-through, modern alias and grade-index navigation; distinct legacy source headers, HTTP/decode-verified bitmaps, own-kind literals/zero/subtotal, category/all expansion and reload; other-account isolation and no modern fallback for missing legacy; modern desktop/390/320 containment');

  phase='version and replay';
  const boundaryRows=Array.from({length:32},(_,index)=>({...firstReport.otherCourses[0],id:randomUUID(),sequenceText:String(index+10),title:'Synthetic boundary '+index+' '+ '課'.repeat(120),credits:index%2?0:null}));
  const changed={...payload,request_id:randomUUID(),expected_version:'1',report:{...firstReport,reportedAt:null,otherCourses:[...firstReport.otherCourses,...boundaryRows]}};
  largeEnvelopeBytes=Buffer.byteLength(JSON.stringify({kind,payload:changed}),'utf8');
  assert.ok(largeEnvelopeBytes>12000&&largeEnvelopeBytes<=140000,'A valid graduation save must exercise its larger API envelope.');
  assert.ok(Buffer.byteLength(jsonbText(changed),'utf8')<=131072,'The full payload remains within the SQL JSONB limit.');
  assert.equal((await save(changed)).version,2);await save({...changed,request_id:randomUUID()},409);
  await save({...changed,report:{...changed.report,reportedAt:firstReport.reportedAt}},409);assert.deepEqual(await save(payload),initial);
  await save({...changed,request_id:randomUUID(),expected_version:'2',user_id:second.user.id},403);
  data=(await snapshot(first)).graduationReview;assertReport(data,changed.report,ids[0],first.user.id,2);
  assertReport(data,legacyReport,ids[2],first.user.id,1,'legacy');assert.equal(data.reports.length,2);
  assert.equal((await sql`select id from public.affairs_agent_audit where user_id=${ownerId} and target_id in ${sql(ids)} and action_kind=${kind}`).length,4);
  assert.equal((await sql`select request_id from private.affairs_graduation_review_operations where user_id=${ownerId} and request_id in ${sql([...requests])} and payload->>'id' in ${sql(ids)}`).length,4);
  checks.push('actual administrator JWT manager API update >12000 bytes within graduation/SQL limits; modern null clearing leaves legacy unchanged; HTTP 409/403 conflicts and immutable owner, stable late replay and exactly four receipt/audit entries');
}catch(error){process.exitCode=1;console.error(`${phase}: ${error instanceof assert.AssertionError?error.message:error.name||'Error'}`);}
finally{
  const failures=[],clean=async(label,operation)=>{try{await operation();}catch{failures.push(label);}};
  await clean('Browser cleanup failed',()=>browser?.close());
  if(schemaReady&&ownerId){if(requests.size)await clean('Exact operation cleanup failed',()=>sql`delete from private.affairs_graduation_review_operations where user_id=${ownerId} and request_id in ${sql([...requests])} and payload->>'id' in ${sql(ids)}`);
    await clean('Exact audit cleanup failed',()=>sql`delete from public.affairs_agent_audit where user_id=${ownerId} and target_id in ${sql(ids)} and action_kind=${kind}`);}
  for(const id of users)await clean('Synthetic account cleanup failed',async()=>{const result=await admin.auth.admin.deleteUser(id);if(result.error)throw new Error('Synthetic deletion failed');});
  await clean('Exact fixture cleanup verification failed',async()=>{
    if(users.length){assert.equal((await sql`select id from auth.users where id in ${sql(users)}`).length,0);assert.equal((await sql`select user_id from auth.identities where user_id in ${sql(users)}`).length,0);assert.equal((await sql`select user_id from public.affairs_profiles where user_id in ${sql(users)}`).length,0);}
    if(schemaReady){assert.equal((await sql`select id from public.affairs_graduation_reviews where id in ${sql(ids)}`).length,0);assert.equal((await sql`select id from public.affairs_agent_audit where target_id in ${sql(ids)}`).length,0);
      if(requests.size)assert.equal((await sql`select request_id from private.affairs_graduation_review_operations where user_id=${ownerId} and request_id in ${sql([...requests])}`).length,0);}
  });
  if(ownerSession)await clean('Administrator local session sign-out failed',async()=>{const result=await ownerClient.auth.signOut({scope:'local'});assert.ok(!result.error);});
  if(ownerBefore)await clean('Existing administrator immutable fingerprint changed',async()=>{assert.deepEqual(await fingerprint(),ownerBefore);ownerUnchanged=true;});
  await clean('Database connection cleanup failed',()=>sql.end());if(failures.length){process.exitCode=1;console.error(failures.join('; '));}
  const result={origin,assistantMode,adminWrites:local?'actual_jwt_local_handler':'deployed_actual_jwt_api',ownerUnchanged,largeEnvelopeBytes,passed:!process.exitCode,checks,cleanupFailures:failures,screenshots:output};await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
