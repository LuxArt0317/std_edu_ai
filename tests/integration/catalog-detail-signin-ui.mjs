import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Use a local compiled build.');
const id='2a000000-0000-4000-8000-000000000001';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  for(const kind of ['course','syllabus']){
    const context=await browser.newContext({viewport:{width:390,height:900}});
    try{
      await mockAffairsAuth(context,{signedIn:false});
      const selected='/school-affairs/services/12-4?'+kind+'='+id;
      const reads=[],errors=[];
      await context.route('**/auth/v1/authorize?**',async request=>{
        const redirect=new URL(request.request().url()).searchParams.get('redirect_to');
        assert.equal(redirect,origin+'/school-affairs/auth/callback');
        await request.fulfill({status:200,contentType:'text/html',body:'<h1>Test authorization</h1>'});
      });
      await context.route('**/api/affairs-data*',route=>{
        const url=new URL(route.request().url());
        if(url.searchParams.get('scope')==='catalog'){
          assert.match(route.request().headers().authorization??'',/^Bearer /u);
          assert.deepEqual([...url.searchParams], [['scope','catalog'],['id',id]]);
          assert.equal(route.request().method(),'GET');
          reads.push(id);
          return route.fulfill({json:{admin:false,rows:[{...newCourseOffering(),id,version:1,published:true,
            course_code:'CAT101',course_name:'Fixture Catalog Course',instructor:'Fixture Instructor',
            syllabus:{...newCourseSyllabus(),objectives:'Check the selected syllabus objective'}}]}});
        }
        return route.fulfill({json:schoolServiceReadFixture(url.href,route.request().method(),affairsTestUser,origin)});
      });
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+selected+'&keyword=previous+search');
      await page.waitForURL(origin+'/school-affairs/login?next='+encodeURIComponent(selected));
      await page.getByRole('button',{name:'Continue with Google',exact:true}).click();
      await page.getByRole('heading',{name:'Test authorization',exact:true}).waitFor();
      await page.goto(origin+'/school-affairs/auth/callback?code=catalog-fixture');
      await page.waitForURL(origin+selected);
      await page.getByRole('cell',{name:kind==='course'?'CAT101':'Check the selected syllabus objective',exact:true}).first().waitFor();
      assert.equal(reads.length,1);
      await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).waitFor();
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
  console.log(JSON.stringify({status:'ok',courseReturn:true,syllabusReturn:true,auth:'synthetic'}));
}finally{await browser.close();}
