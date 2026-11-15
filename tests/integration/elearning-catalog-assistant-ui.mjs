import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Use a local compiled build.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const catalogPath='/elearning/search?q=QA+Catalog&page=2';
const loginPath='/elearning/login?next='+encodeURIComponent(catalogPath);
const course={id:81,category_id:48,position:21,title:'QA Catalog course',self_enroll:false};
const catalog={userId:affairsTestUser.id,total:21,courses:[course]};
const provider='https://catalog-qa.invalid';
const transportFetch=globalThis.fetch;
const forbidden=()=>assert.fail('Unexpected broad account or provider request.');
async function fulfillFromHandler(route,handler){
  const chunks=[],headers={};
  let status=200,json;
  const response={
    status(code){status=code;return this;},json(value){json=value;},setHeader(name,value){headers[name]=value;},
    write(chunk){chunks.push(chunk);},end(){},flushHeaders(){},
  };
  await handler({
    method:route.request().method(),headers:route.request().headers(),body:route.request().postDataJSON(),
  },response);
  return chunks.length?route.fulfill({status,headers,body:chunks.join('')}):route.fulfill({status,headers,json});
}
try{
  for(const signedIn of [true,false]){
    const context=await browser.newContext({viewport:{width:390,height:900}});
    try{
      await mockAffairsAuth(context,{signedIn});
      let catalogRequests=0,questionRequests=0;
      const errors=[];
      globalThis.fetch=async(input,init)=>{
        assert.equal(String(input),provider+'/rest/v1/rpc/elearning_catalog');
        assert.equal(init.method,'POST');
        assert.equal(init.headers.Authorization,'Bearer qa-catalog-account');
        assert.deepEqual(JSON.parse(init.body),{p_category:null,p_term:'QA Catalog',p_page:2,p_course:null});
        catalogRequests++;
        return Response.json(catalog);
      };
      const account=createAffairsAssistantHandler({
        verifyToken:async token=>{
          assert.ok(token.endsWith('.qa-only-signature'));
          return {user:affairsTestUser,url:provider,key:'fixture',token:'qa-catalog-account'};
        },
        loadSnapshot:forbidden,publicResearch:forbidden,answerAccount:forbidden,
      });
      const publicHandler=createResearchAssistantHandler();
      await context.route('**/api/**',async route=>{
        const path=new URL(route.request().url());
        if(path.pathname==='/api/affairs-data'){
          const scope=path.searchParams.get('scope');
          assert.ok(signedIn&&['elearning-catalog','elearning-workspace'].includes(scope));
          return route.fulfill({json:scope==='elearning-catalog'?catalog:{userId:affairsTestUser.id,categories:[],courses:[],notices:[],enrollments:[]}});
        }
        if(path.pathname==='/api/affairs-conversations'){
          if(route.request().method()==='GET')return route.fulfill({json:{conversations:[]}});
          const {id,title,messages,version}=route.request().postDataJSON();
          return route.fulfill({json:{id,title,messages,version:version+1,updated_at:'2026-11-15T02:00:00Z'}});
        }
        assert.equal(path.pathname,signedIn?'/api/affairs-assistant':'/api/research-assistant');
        assert.equal(route.request().postDataJSON().route,signedIn?catalogPath:loginPath);
        questionRequests++;
        await fulfillFromHandler(route,signedIn?account:publicHandler);
      });
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+catalogPath);
      if(signedIn)await page.getByRole('link',{name:course.title,exact:true}).waitFor();
      else await page.waitForURL(origin+loginPath);
      await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
      const dialog=page.getByRole('dialog');
      await dialog.getByRole('link',{name:signedIn?'School Affairs account':'School Affairs sign in',exact:true}).waitFor();
      await dialog.getByPlaceholder('Ask a school question…').fill('Which courses are on this page?');
      await dialog.getByRole('button',{name:'Send',exact:true}).click();
      const answer=dialog.locator('article').last();
      const expected=signedIn?course.title:'Sign in to view this Digital Academy catalog page';
      const link=answer.getByRole('link',{name:expected,exact:true});
      await link.first().waitFor({timeout:8000});
      assert.equal(await link.first().getAttribute('href'),signedIn?'/elearning/course/81':loginPath);
      assert.equal(new URL(page.url()).pathname,signedIn?'/elearning/search':'/elearning/login');
      assert.equal(questionRequests,1);
      assert.equal(catalogRequests,signedIn?1:0);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
  console.log(JSON.stringify({status:'ok',signedInScopedCatalog:true,guestExactReturn:true,hostedRequests:0}));
}finally{globalThis.fetch=transportFetch;await browser.close();}
