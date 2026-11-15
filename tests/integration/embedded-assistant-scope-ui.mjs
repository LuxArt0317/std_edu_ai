import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {affairsTestSession,affairsTestUser as user} from './helpers/affairs-auth.mjs';

// Run with tsx from the checkout. This exercises the normal Vite public page,
// actual assistant iframe and HTTP handlers with a synthetic Google session.
// It does not perform a live sign-in, provider read, model call or deployment check.
const authority='https://xiftudmvxphxcjtmfmib.supabase.co';
const publishableKey='OFFLINE_EMBEDDED_ASSISTANT_BROWSER';
process.env.VITE_SUPABASE_URL=authority;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY=publishableKey;
const embed='/campus-assistant?embed=1';
const hostContext='/?entry=offline-embed';
const hostOnlyFragment='#HOST_FRAGMENT_NOT_CHAT_CONTEXT';
const session=affairsTestSession();
const token='Bearer '+session.access_token;
const denied='This chat has no verified School Affairs session.';
const accountQuestion='Which Google account am I signed in with?';
const publicQuestion='Where can I find the campus Wi-Fi setup guide?';
const forbid=()=>assert.fail('The embedded account question must never read student records or use external research.');
const signed=createAffairsAssistantHandler({loadSnapshot:forbid,answerAccount:forbid,publicResearch:forbid});
const guest=createResearchAssistantHandler({readSources:forbid,loadPublicPage:forbid});
const cache=await mkdtemp(join(tmpdir(),'stu-embedded-assistant-'));

let browser,server,serverVerificationCount=0;
const routeResults=[];
async function assistantResponse(route,signedIn){
  const request=route.request(),headers=request.headers(),body=request.postDataJSON();
  assert.equal(headers.authorization,signedIn?token:undefined);
  assert.equal(body.route,hostContext);
  assert.equal(body.stream,true);
  assert.deepEqual(body.images,[]);
  for(const privateField of [user.id,user.email,session.access_token,hostOnlyFragment,embed])
    assert.ok(!JSON.stringify(body).includes(privateField),'Browser request contains unrelated frame or account context.');

  let status=200, json;
  const responseHeaders={}, chunks=[];
  const response={
    status(code){status=code;return response;},
    setHeader(key,value){responseHeaders[key]=value;},
    json(value){json=value;},write(value){chunks.push(value);},end(){},
  };
  const realFetch=globalThis.fetch;
  globalThis.fetch=async (target,init)=>{
    assert.equal(signedIn,true);
    assert.equal(target,authority+'/auth/v1/user');
    assert.equal(init.headers.Authorization,token);
    assert.equal(init.headers.apikey,publishableKey);
    serverVerificationCount++;
    return Response.json(user);
  };
  try{await (signedIn?signed:guest)({method:request.method(),headers,body},response);}
  finally{globalThis.fetch=realFetch;}
  assert.equal(status,200);
  assert.ok(chunks.length,'The actual handler must return an assistant event stream.');
  assert.equal(json,undefined);
  return route.fulfill({status,headers:responseHeaders,body:chunks.join('')});
}

async function observe(signedIn,origin){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:signedIn?390:1440,height:900}});
  const calls=[], errors=[];
  let browserVerificationCount=0;
  try{
    if(signedIn)await context.addInitScript(({origin,session})=>{
      if(window===window.top&&location.origin===origin)
        localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));
    },{origin,session});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      try{
        if(url.origin===authority){
          const cors={'access-control-allow-origin':origin,'access-control-allow-methods':'GET','access-control-allow-headers':'*'};
          if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
          assert.equal(signedIn,true);assert.equal(url.pathname,'/auth/v1/user');
          assert.equal(request.method(),'GET');assert.equal(request.headers().authorization,token);
          browserVerificationCount++;
          return route.fulfill({headers:cors,json:user});
        }
        assert.equal(url.origin,origin);
        if(!url.pathname.startsWith('/api/')){
          // Static captures link to an extensive asset archive. Assets unrelated
          // to the assistant are optional for this controlled interaction.
          if(url.pathname.startsWith('/school-assets/'))return route.fulfill({status:204});
          return route.continue();
        }
        if(signedIn&&url.pathname==='/api/affairs-conversations'){
          assert.equal(request.headers().authorization,token);
          if(request.method()==='GET')return route.fulfill({json:{conversations:[]}});
          assert.equal(request.method(),'POST');
          const {id,title,messages,version}=request.postDataJSON();
          return route.fulfill({json:{id,title,messages,version:version+1,updated_at:new Date().toISOString()}});
        }
        const endpoint=signedIn?'/api/affairs-assistant':'/api/research-assistant';
        assert.equal(url.pathname,endpoint);
        assert.equal(request.method(),'POST');
        calls.push({endpoint,question:request.postDataJSON().question,route:request.postDataJSON().route});
        return await assistantResponse(route,signedIn);
      }catch(error){errors.push(error);await route.abort('blockedbyclient');}
    });
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror',error=>errors.push(error));
    assert.equal((await page.goto(origin+hostContext+hostOnlyFragment,{waitUntil:'domcontentloaded'})).status(),200);
    const launcher=page.getByRole('button',{name:'開啟 AI 校園助理'});
    await launcher.press('Enter');
    const panel=page.locator('#stu-assistant-panel');
    assert.equal(await panel.locator('iframe').getAttribute('src'),embed);
    const frame=panel.frameLocator('iframe.stu-assistant-frame');
    await frame.getByRole('heading',{name:'校園助理 · Assistant'}).waitFor();
    const accountLink=frame.getByRole('link',{name:signedIn?'School Affairs account':'School Affairs sign in',exact:true});
    assert.equal(await accountLink.getAttribute('target'),'_top');
    const composer=frame.getByPlaceholder('Ask a school question…');
    const ask=async question=>{await composer.fill(question);await composer.press('Enter');};
    const expectedEndpoint=signedIn?'/api/affairs-assistant':'/api/research-assistant';
    const expectedQuestions=signedIn?[accountQuestion]:[publicQuestion,accountQuestion];
    if(!signedIn){
      await ask(publicQuestion);
      await frame.getByRole('link',{name:'Open on stu.best',exact:true}).waitFor();
      assert.equal(await frame.getByRole('link',{name:'Open on stu.best',exact:true}).getAttribute('href'),
        '/school-sites/help.ecc.stu.edu.tw/wireless-setting/');
    }
    await ask(accountQuestion);
    const reply=signedIn?frame.getByText(user.email,{exact:true}):frame.getByText(denied,{exact:true});
    await reply.waitFor();
    if(!signedIn){
      assert.equal(await frame.getByText(user.email,{exact:true}).count(),0);
      await frame.getByRole('link',{name:'Sign in to School Affairs with Google',exact:true}).first().waitFor();
    }
    await composer.press('Escape');
    await panel.waitFor({state:'hidden'});
    await launcher.press('Enter');
    await reply.waitFor();
    assert.deepEqual(calls,expectedQuestions.map(question=>({endpoint:expectedEndpoint,question,route:hostContext})));
    assert.equal(browserVerificationCount>0,signedIn);
    if(!signedIn){
      await accountLink.click();
      await page.waitForURL(origin+'/school-affairs/login');
      assert.equal(await page.locator('iframe.stu-assistant-frame').count(),0);
      const signIn=page.getByRole('button',{name:'Continue with Google',exact:true});
      await signIn.waitFor();
      assert.equal(await signIn.isEnabled(),true);
    }
    assert.deepEqual(errors,[]);
    routeResults.push({route:embed,scenario:'embedded',frame:'iframe',status:'passed',authenticated:signedIn,
      assistantPresent:true,keyboardUsable:true,sessionVerified:true,hostContextVerified:true,answerScopeVerified:true,
      observedHostRoute:hostContext,observedEndpoint:expectedEndpoint});
  }finally{await context.close();}
}

try{
  server=await createServer({cacheDir:cache,logLevel:'silent',server:{host:'127.0.0.1',port:0}});
  await server.listen();
  const address=server.httpServer.address(),origin='http://127.0.0.1:'+address.port;
  browser=await chromium.launch({headless:true,args:['--disable-background-networking'],
    executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const signedIn of [false,true])await observe(signedIn,origin);
  assert.equal(serverVerificationCount,1);
  console.log(JSON.stringify({status:'passed',sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    workingTreeClean:!execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(),
    provenance:'local-browser-and-http-handlers-with-synthetic-auth',liveBrowserAcceptance:false,liveProviderRequests:0,routeResults},null,2));
}finally{
  await browser?.close();
  await server?.close();
  await rm(cache,{recursive:true,force:true});
}
