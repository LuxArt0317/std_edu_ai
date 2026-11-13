import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validatePreviewTarget,verifyPreviewRelease} from './verified-preview.mjs';

export function dtmSubmissionBrowserMode(origin,previewApproval={}){
  if(origin==='http://127.0.0.1:5184')return 'local_working_tree';
  if(origin!=='https://stu.best')validatePreviewTarget(origin,previewApproval);
  return 'deployed_http';
}

/** Optional actual UI/API acceptance. The parent owns every fixture,
 * recovery-ledger write and Storage cleanup. No credentials/artifacts/logs here.
 * Local Vite needs tsx for the working-tree TS handlers. Deployed modes import no
 * handlers and forward only real deployed HTTP responses, without redirects. */
export async function runDtmSubmissionsBrowser({origin,projectUrl,publishableKey,sessions,assignment,
  beforeAction,rememberReservation,assertFixturePath,deadline,chromePath,previewOrigin,expectedReleaseRevision}){
  const previewApproval={previewOrigin,expectedReleaseRevision};
  const mode=dtmSubmissionBrowserMode(origin,previewApproval),local=mode==='local_working_tree';
  const preview=!local&&origin!=='https://stu.best';
  // The fixture parent must already gate before resolving credentials. Recheck
  // here before opening a browser, seeding a session, or sending any API request.
  const verifiedRelease=preview?await verifyPreviewRelease(origin,previewApproval):null;
  assert.equal(projectUrl,'https://xiftudmvxphxcjtmfmib.supabase.co');
  assert.equal(sessions.length,2);assert.notEqual(sessions[0].user.id,sessions[1].user.id);
  for(const session of sessions){
    assert.ok(session.user.email?.endsWith('@example.invalid'));
    assert.ok(session.user.identities.some(identity=>identity.provider==='google'));
    assert.ok(session.access_token&&session.refresh_token);
  }
  assert.equal(assignment.userId,sessions[0].user.id);
  const stopAt=Math.min(deadline,Date.now()+150000);
  assert.ok(stopAt>Date.now());
  const previousEnv=new Map(local?['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].map(key=>[key,process.env[key]]):[]);
  if(local){process.env.VITE_SUPABASE_URL=projectUrl;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=publishableKey;}
  const stats={passed:false,mode,targetEnvironment:local?'local':preview?'preview':'production',verifiedRelease,
    checks:0,apiRequests:0,uploads:0,uploadedBytes:0,downloads:0,bridgeFailures:0,pageErrors:0,blockedRequests:0};
  const pending=new Set(),contexts=[],reservations=new Map(),writes=[];
  const studentKinds=new Set(['begin_dtm_submission_upload','commit_dtm_submission_upload','cancel_dtm_submission_upload']);
  let browser,timer,stopping=false,uncertainUntil=0;
  function track(task){pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task;}
  const ensureTime=()=>assert.ok(Date.now()<stopAt,'Browser acceptance deadline exhausted.');
  const pathFor=file=>'/storage/v1/object/dtm-submissions/'+file.path;
  const coursePath='/dtm/course/'+assignment.courseId,detailPath=coursePath+'/assignment/'+assignment.id;
  try{
    const {chromium}=await import('playwright-core');
    const endpoints=new Set(['/api/affairs-data','/api/affairs-action','/api/affairs-manage','/api/affairs-conversations']);
    let handlers;
    if(local){
      const [data,action,manage]=await Promise.all([import('../../api/affairs-data.ts'),import('../../api/affairs-action.ts'),import('../../api/affairs-manage.ts')]);
      handlers={'/api/affairs-data':data.default,'/api/affairs-action':action.default,'/api/affairs-manage':manage.default,
        '/api/affairs-conversations':data.default};
    }
    async function forwardStorage(route,url){
      ensureTime();const sentAt=Date.now();let upstream;
      try{
        upstream=await route.fetch({maxRedirects:0,maxRetries:0,timeout:Math.max(1,Math.min(30000,stopAt-Date.now()))});
        assert.equal(upstream.url(),url.href);assert.ok(upstream.status()<300||upstream.status()>=400,'Storage redirects are forbidden.');
        await route.fulfill({response:upstream});
      }catch(error){
        if(route.request().method()==='POST')uncertainUntil=Math.max(uncertainUntil,sentAt+20000);
        throw error;
      }finally{await upstream?.dispose().catch(()=>{});}
    }
    async function invoke(url,request,session,route){
      ensureTime();const endpoint=url.pathname,headers=request.headers(),token=headers.authorization?.replace(/^Bearer /,'');
      assert.ok(token===undefined||token===session.access_token,'Only this synthetic browser account may invoke a handler.');
      const method=request.method(),body=request.postData()?JSON.parse(request.postData()):undefined;
      if(endpoint==='/api/affairs-conversations'){
        // The mounted launcher reads its empty synthetic conversation index.
        // Match the production rewrite, but permit no conversation mutations.
        assert.equal(method,'GET');assert.equal(url.search,'');assert.equal(body,undefined);
      }else if(endpoint==='/api/affairs-data'){
        assert.equal(method,'GET');assert.ok(!url.searchParams.has('resource'));
        const scope=url.searchParams.get('scope');assert.ok([null,'dtm-submission','dtm-submission-download'].includes(scope));
        if(scope===null)assert.equal(url.search,'');
        else{
          const allowed=scope==='dtm-submission-download'?['scope','assignment_id','upload_id']:['scope','assignment_id'];
          assert.deepEqual([...url.searchParams.keys()].sort(),allowed.sort());
          assert.equal(url.searchParams.get('assignment_id'),assignment.id);
          if(scope==='dtm-submission-download')assert.ok([...reservations.values()].some(file=>file.uploadId===url.searchParams.get('upload_id')));
        }
      }else{
        assert.equal(method,'POST');assert.equal(body?.payload?.assignment_id,assignment.id);
        if(!local)assert.ok(stopAt-Date.now()>25000,'Do not start a deployed mutation near the browser deadline.');
        if(endpoint==='/api/affairs-action'){
          assert.equal(session.user.id,assignment.userId);assert.ok(studentKinds.has(body.kind));
        }else{assert.equal(endpoint,'/api/affairs-manage');assert.equal(body.kind,'save_dtm_submission_review');}
        if(body.kind!=='begin_dtm_submission_upload')assert.ok([...reservations.values()].some(file=>file.uploadId===body.payload.upload_id));
        await beforeAction(session.user.id,body.kind,body.payload);
      }
      const result={status:200,body:undefined,headers:{}},response={status(value){result.status=value;return response;},
        json(value){result.body=value;},setHeader(key,value){result.headers[key]=String(value);}};
      stats.apiRequests++;
      const sentAt=Date.now();let upstream;
      try{
        if(local){
          await handlers[endpoint]({method,headers:token?{authorization:'Bearer '+token}:{},
            query:endpoint==='/api/affairs-conversations'?{resource:'conversations'}:Object.fromEntries(url.searchParams),body},response);
        }else{
          // Never substitute a local handler or fabricated JSON in production.
          // The ledger callback above completes before this actual HTTP send.
          upstream=await route.fetch({maxRedirects:0,maxRetries:0,timeout:Math.max(1,Math.min(30000,stopAt-Date.now()))});
          assert.equal(upstream.url(),url.href);assert.ok(upstream.status()<300||upstream.status()>=400,'Deployed API redirects are forbidden.');
          result.status=upstream.status();result.headers=upstream.headers();result.body=await upstream.json();
        }
        if(endpoint==='/api/affairs-action'&&result.status===200){
          if(body.kind==='begin_dtm_submission_upload'){
            await rememberReservation(session.user.id,result.body);
            reservations.set(result.body.path,result.body);
          }
          writes.push({kind:body.kind,requestId:body.payload.request_id,receipt:result.body});
        }
        return {...result,upstream};
      }catch(error){
        // A lost POST response is not proof that the deployed handler stopped.
        // Its17s mutation budget must settle before the parent's exact recovery
        // query/cleanup. No mutation is retried by this transport.
        if(!local&&method==='POST')uncertainUntil=Math.max(uncertainUntil,sentAt+20000);
        await upstream?.dispose().catch(()=>{});throw error;
      }
    }
    async function pageFor(session){
      const context=await browser.newContext({viewport:{width:1280,height:900},locale:'zh-TW',timezoneId:'Asia/Taipei',acceptDownloads:true,serviceWorkers:'block'});
      contexts.push(context);
      await context.addInitScript(({origin,session})=>{
        if(window.top!==window||location.origin!==origin||sessionStorage.getItem('dtm-submission-live-seeded'))return;
        localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));localStorage.setItem('stu-dtm-language','zh-Hant');
        sessionStorage.setItem('dtm-submission-live-seeded','1');
      },{origin,session});
      await context.route('**/*',route=>track((async()=>{
        if(stopping)return route.abort().catch(()=>{});
        const request=route.request(),url=new URL(request.url());
        if(url.origin===origin){
          if(!url.pathname.startsWith('/api/'))return route.continue();
          assert.ok(endpoints.has(url.pathname),'An unapproved API endpoint was requested.');
          const result=await invoke(url,request,session,route);
          try{return await (local?route.fulfill({status:result.status,headers:result.headers,json:result.body}):route.fulfill({response:result.upstream}));}
          finally{await result.upstream?.dispose().catch(()=>{});}
        }
        assert.equal(url.origin,projectUrl,'Browser request left the exact fixture project.');
        if(url.pathname==='/auth/v1/user'){
          assert.ok(['GET','OPTIONS'].includes(request.method()));
          if(request.method()!=='OPTIONS')assert.equal(request.headers().authorization,'Bearer '+session.access_token);
          return route.continue();
        }
        const uploadPath=url.pathname.replace(/^\/storage\/v1\/object\/dtm-submissions\//,'');
        const downloadPath=url.pathname.replace(/^\/storage\/v1\/object\/sign\/dtm-submissions\//,'');
        const file=reservations.get(uploadPath)||reservations.get(downloadPath);
        assert.ok(file,'Browser Storage request was not reserved by this fixture.');assertFixturePath(file.path);
        assert.equal(session.user.id,assignment.userId);
        if(url.pathname===pathFor(file)){
          assert.ok(['POST','OPTIONS'].includes(request.method()));
          if(request.method()==='POST'){
            assert.equal(request.headers().authorization,'Bearer '+session.access_token);
            assert.equal(request.headers()['x-upsert'],'false');
            const bytes=request.postDataBuffer();assert.ok(bytes&&bytes.length<1024);
          }
        }else{
          assert.equal(request.method(),'GET');assert.equal(url.pathname,'/storage/v1/object/sign/dtm-submissions/'+file.path);
          assert.equal(url.searchParams.getAll('token').length,1);assert.ok(url.searchParams.get('token'));
        }
        // Track the real production Storage request through completion too;
        // route.continue alone would settle before its upload finished.
        return local?route.continue():forwardStorage(route,url);
      })().catch(async()=>{if(!stopping){stats.bridgeFailures++;stats.blockedRequests++;}await route.abort().catch(()=>{});} )));
      context.on('response',response=>{
        const url=new URL(response.url()),request=response.request();
        if(url.origin===projectUrl&&url.pathname.startsWith('/storage/v1/object/dtm-submissions/')&&request.method()==='POST'&&response.ok()){
          stats.uploads++;stats.uploadedBytes+=request.postDataBuffer()?.length??0;
        }
      });
      const page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(30000);
      page.on('pageerror',()=>{stats.pageErrors++;});return page;
    }
    const api=(page,endpoint,{body,authenticated=true}={})=>page.evaluate(async({endpoint,body,authenticated})=>{
      const session=JSON.parse(localStorage.getItem('stu-school-affairs-auth'));
      const response=await fetch(endpoint,{method:body===undefined?'GET':'POST',redirect:'error',cache:'no-store',
        headers:{...(authenticated?{Authorization:'Bearer '+session.access_token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,body:await response.json()};
    },{endpoint,body,authenticated});
    const workspace=page=>api(page,'/api/affairs-data?scope=dtm-submission&assignment_id='+assignment.id);
    async function detailReady(page){
      await page.locator('.dtm-assignment-detail[aria-busy="false"] .dtm-assignment-status-table').waitFor();
      assert.equal(await page.locator('.dtm-assignment-detail [role="alert"]').count(),0);
      assert.equal(await page.locator('.dtm-assignment-detail>h2').textContent(),assignment.title);
      assert.deepEqual(await page.locator('.dtm-assignment-status-table th').allTextContents(),['繳交狀態','評分狀態','規定繳交時間','剩餘時間','最後修改','提交檔案','優秀作品']);
      assert.equal(await page.locator('[role="dialog"]').count(),0,'Assignment must open a full page.');
    }
    async function editor(page){
      await page.locator('.dtm-assignment-action button').click();
      await page.waitForURL(origin+detailPath+'/edit');await page.locator('.dtm-editor-form[aria-busy="false"]').waitFor();
    }
    async function chooseAndSave(page,name,bytes){
      ensureTime();await page.locator('.dtm-editor-file-input').setInputFiles({name,mimeType:'text/plain',buffer:bytes});
      await page.locator('.dtm-editor-form[aria-busy="false"] .dtm-editor-filename').filter({hasText:name}).waitFor();
      await page.getByRole('button',{name:'儲存更改',exact:true}).click();
      await page.waitForURL(origin+detailPath);await detailReady(page);
      assert.equal(await page.locator('.dtm-assignment-file-download').textContent(),name);
    }
    async function downloaded(page,name,bytes){
      const pendingDownload=page.waitForEvent('download');await page.locator('.dtm-assignment-file-download').click();
      const download=await pendingDownload;
      try{
        assert.equal(download.suggestedFilename(),name);const stream=await download.createReadStream();assert.ok(stream);
        const chunks=[];let length=0;for await(const chunk of stream){length+=chunk.length;assert.ok(length<1024);chunks.push(chunk);}
        assert.deepEqual(Buffer.concat(chunks),bytes);stats.downloads++;
      }finally{await download.delete();}
    }
    async function contained(page,selector,width){
      await page.setViewportSize({width,height:900});await page.locator(selector).waitFor();
      const measured=await page.locator(selector).evaluate(element=>{
        const rect=element.getBoundingClientRect();return {left:rect.left,right:rect.right,viewport:innerWidth,
          documentWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)};
      });
      assert.ok(measured.left>=-1&&measured.right<=width+1&&measured.documentWidth<=width+1,'Mobile page must contain the submission panel.');
    }
    browser=await chromium.launch({headless:true,executablePath:chromePath||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    // Stop new dispatch at the deadline; never close a context ahead of its
    // in-flight API work. Page waits are individually bounded as well.
    timer=setTimeout(()=>{stopping=true;},Math.max(1,stopAt-Date.now()));
    const page=await pageFor(sessions[0]);
    await page.goto(origin+coursePath);await page.locator('#assignment-'+assignment.id+' button').click();
    await page.waitForURL(origin+detailPath);await detailReady(page);
    assert.match(await page.locator('.dtm-assignment-status-table').innerText(),/尚未繳交（本站紀錄）/);stats.checks++;
    const firstBytes=Buffer.from('Synthetic browser submission A\n'),secondBytes=Buffer.from('Synthetic browser submission B\n');
    const firstName='synthetic-browser-a.txt',secondName='synthetic-browser-b.txt';
    await editor(page);await chooseAndSave(page,firstName,firstBytes);
    let saved=await workspace(page);assert.equal(saved.status,200);assert.equal(saved.body.submission.version,1);
    assert.match(await page.locator('.dtm-assignment-status-table').innerText(),/已繳交（本站紀錄）/);
    await downloaded(page,firstName,firstBytes);await page.reload();await detailReady(page);
    assert.equal(await page.locator('.dtm-assignment-file-download').textContent(),firstName);stats.checks++;
    await editor(page);await chooseAndSave(page,secondName,secondBytes);
    saved=await workspace(page);assert.equal(saved.body.submission.version,2);
    const currentId=saved.body.submission.current_upload_id;assert.equal(saved.body.files.find(file=>file.id===currentId).filename,secondName);
    await downloaded(page,secondName,secondBytes);stats.checks++;

    // Real interrupted-session recovery: create/upload a third reservation via
    // the real API/Storage, reload the editor and cancel its pending file in UI.
    const pendingBody={kind:'begin_dtm_submission_upload',payload:{assignment_id:assignment.id,request_id:randomUUID(),expected_version:2,
      filename:'synthetic-browser-cancel.txt',size_bytes:19,content_type:'text/plain'}};
    const reserved=await api(page,'/api/affairs-action',{body:pendingBody});assert.equal(reserved.status,200);
    const uploaded=await page.evaluate(async({storageUrl,key,path})=>{
      const session=JSON.parse(localStorage.getItem('stu-school-affairs-auth'));
      const response=await fetch(storageUrl+'/storage/v1/object/dtm-submissions/'+path,{method:'POST',redirect:'error',
        headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'text/plain','x-upsert':'false'},body:'Synthetic pending C'});
      await response.arrayBuffer();return response.status;
    },{storageUrl:projectUrl,key:publishableKey,path:reserved.body.path});assert.ok([200,201].includes(uploaded));
    await page.goto(origin+detailPath+'/edit');await page.locator('.dtm-editor-form[aria-busy="false"] .dtm-editor-error').waitFor();
    await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForURL(origin+detailPath);await detailReady(page);
    saved=await workspace(page);assert.equal(saved.body.submission.version,2);assert.equal(saved.body.submission.current_upload_id,currentId);
    assert.equal(saved.body.files.some(file=>file.state==='pending'),false);assert.ok(writes.some(write=>write.kind==='cancel_dtm_submission_upload'&&write.receipt.uploadId===reserved.body.uploadId));
    await downloaded(page,secondName,secondBytes);stats.checks++;
    for(const width of [360,320]){
      await contained(page,'.dtm-assignment-detail',width);await editor(page);await contained(page,'.dtm-submission-editor',width);
      await page.locator('.dtm-editor-file-input').setInputFiles({name:'synthetic-unsaved.txt',mimeType:'text/plain',buffer:Buffer.from('Unsaved selection')});
      await page.locator('.dtm-editor-form[aria-busy="false"] .dtm-editor-filename').filter({hasText:'synthetic-unsaved.txt'}).waitFor();
      await contained(page,'.dtm-submission-editor',width);await page.getByRole('button',{name:'取消',exact:true}).click();
      await page.waitForURL(origin+detailPath);await detailReady(page);assert.equal(await page.locator('.dtm-assignment-file-download').textContent(),secondName);
      stats.checks++;
    }
    const rejected=await api(page,'/api/affairs-manage',{body:{kind:'save_dtm_submission_review',payload:{assignment_id:assignment.id,
      request_id:randomUUID(),expected_version:0,upload_id:currentId,status:'graded',grade_text:'Synthetic unauthorized',feedback:null}}});
    assert.equal(rejected.status,403);assert.equal((await workspace(page)).body.reviews.length,0);
    assert.equal((await api(page,'/api/affairs-data?scope=dtm-submission&assignment_id='+assignment.id,{authenticated:false})).status,401);stats.checks++;
    const other=await pageFor(sessions[1]);await other.goto(origin+detailPath);
    await other.getByRole('heading',{name:'找不到課程或頁面',exact:true}).waitFor();
    assert.equal(await other.locator('.dtm-assignment-file-download,.dtm-submission-editor').count(),0);
    assert.equal((await other.locator('body').innerText()).includes(secondName),false);
    assert.equal((await workspace(other)).status,403);
    assert.equal((await api(other,'/api/affairs-data?scope=dtm-submission-download&assignment_id='+assignment.id+'&upload_id='+currentId)).status,403);stats.checks++;
    assert.equal(writes.filter(write=>write.kind==='begin_dtm_submission_upload').length,3);
    assert.equal(writes.filter(write=>write.kind==='commit_dtm_submission_upload').length,2);
    assert.equal(writes.filter(write=>write.kind==='cancel_dtm_submission_upload').length,1);
    assert.equal(stats.uploads,3);assert.equal(stats.downloads,3);assert.equal(stats.bridgeFailures+stats.pageErrors+stats.blockedRequests,0);
    stats.passed=true;return stats;
  }finally{
    clearTimeout(timer);stopping=true;
    try{
      // Keep contexts alive until actual API work has settled. Closing first
      // would cancel remote transport while a deployed mutation could continue.
      while(pending.size)await Promise.allSettled([...pending]);
      if(uncertainUntil>Date.now())await new Promise(resolve=>setTimeout(resolve,uncertainUntil-Date.now()));
      await Promise.allSettled(contexts.map(context=>context.close()));
      if(browser)await browser.close();
    }finally{
      for(const [key,value] of previousEnv){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    }
  }
}
