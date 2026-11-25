import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {elearningPath as path,elearningScope,elearningCatalogScope,elearningOutlineScope} from '../../server/elearningContract.js';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:54632';
const revision=process.env.EXPECTED_RELEASE_REVISION;
async function checkRelease(){
  if(origin!=='https://stu.best')return;
  assert.match(revision??'',/^[0-9a-f]{40}$/);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,revision);
}
await checkRelease();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[],writes=[],assistantRequests=[];
const archive=Array.from({length:23},(_,i)=>({id:15000+i,category_id:28,title:'歷年課程 '+(i+1),self_enroll:false,position:i+1}));
const course={id:9718,category_id:41,title:'111-1遠距教學研習_20220902',self_enroll:true,position:1};
const protectedCourse={id:9408,category_id:18,title:'一般安全衛生教育訓練-1100330',self_enroll:false,position:1};
const outlineQuestion='Which videos are listed, and what are my saved remote-learning enrollments?';
let enrolled=null,failFirst=true;
async function fixture(signedIn,courseAccess=signedIn){
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await mockAffairsAuth(context,{signedIn});
  await context.route('**/api/**',async route=>{
    try{
      const request=route.request(),url=new URL(request.url());
      if(url.searchParams.get('scope')===elearningScope){
        assert.equal(signedIn,true);
        assert.equal(request.method(),'GET');
        assert.match(request.headers().authorization??'',/^Bearer /u);
        return route.fulfill({json:{
          userId:user.id,categories:[{id:41,parent_id:null,title:'教務處',source_count:20,position:1},
            {id:28,parent_id:null,title:'其它學期',source_count:23,position:2}],
          courses:[course],notices:[{id:325504,kind:'page',title:'遠距教學轉入TronClass創課',local_body:'課程轉入 TronClass。',position:1}],
          enrollments:enrolled?[enrolled]:[],
        }});
      }
      if(url.searchParams.get('scope')===elearningCatalogScope){
        assert.equal(signedIn,true);
        assert.equal(request.method(),'GET');
        assert.match(request.headers().authorization??'',/^Bearer /u);
        const term=url.searchParams.get('term')??'';
        const category=url.searchParams.get('category'),courseId=url.searchParams.get('course');
        const offset=(Number(url.searchParams.get('page')??1)-1)*20;
        const matching=[course,protectedCourse,...archive].filter(row=>(!category||String(row.category_id)===category)&&
          (!courseId||String(row.id)===courseId)&&row.title.includes(term));
        return route.fulfill({json:{userId:user.id,total:matching.length,courses:matching.slice(offset,offset+20)}});
      }
      if(url.searchParams.get('scope')===elearningOutlineScope){
        assert.equal(signedIn,true);
        assert.match(request.headers().authorization??'',/^Bearer /u);
        const courseId=Number(url.searchParams.get('course'));
        return route.fulfill({json:{userId:user.id,courseId,sections:courseAccess&&courseId===9408
          ?[{position:1,title:'課程主題',activities:[{id:293399,kind:'attendanceregister',title:'出席統計',purpose:'attendance'},
            {id:293395,kind:'url',title:'第一段影片',purpose:'video'}]}]:[]}});
      }
      if(url.pathname==='/api/affairs-assistant'){
        assert.equal(signedIn,true);
        assert.equal(request.method(),'POST');
        const authorization=request.headers().authorization??'';
        assert.match(authorization,/^Bearer /u);
        assert.equal(JSON.parse(Buffer.from(authorization.split('.')[1],'base64url').toString()).sub,user.id);
        const input=request.postDataJSON();
        if([outlineQuestion,'What videos are listed?'].includes(input.question)){
          const mixed=input.question===outlineQuestion;
          assert.equal(input.route,path+'/course/9408'+(mixed?'':'/activity/293395'));
          assistantRequests.push(input.question);
          const answer=`The outline links to [第一段影片](${path}/course/9408/activity/293395).`
            +(mixed?` Your saved enrollment is [${course.title}](${path}/course/9718).`:'');
          return route.fulfill({json:{answer,status:'answered',citations:[],verification:{status:'verified',attempts:1},
            activity:[
              {kind:'account-read:elearningOutline:1',label:'Checked the saved course outline',detail:'Read permitted local activity links.',status:'complete'},
              ...(mixed?[{kind:'account-read:elearningEnrollments:1',label:'Checked saved enrollments',detail:'Read your saved enrollment.',status:'complete'}]:[]),
            ]}});
        }
        assert.equal(input.route,path+'/my-courses');
        assert.ok(['What are my courses?','What are my grades in remote-learning Moodle?'].includes(input.question));
        assistantRequests.push(input.question);
        const grades=input.question.includes('grades');
        const answer=grades?'This account lookup does not provide personal remote-learning grades.'
          : `Your saved remote-learning course is [${course.title}](${path}/course/9718).`;
        return route.fulfill({json:{answer,status:'answered',citations:[],verification:{status:'verified',attempts:1},
          activity:[{kind:'account-read:elearningEnrollments:1',label:'Checked remote-learning scope',detail:'Used the signed-in remote-learning reader.',status:'complete'}]}});
      }
      if(signedIn&&url.pathname==='/api/affairs-conversations'&&request.method()==='POST'){
        const {id,title,messages,version}=request.postDataJSON();
        return route.fulfill({json:{id,title,messages,version:version+1,updated_at:new Date().toISOString()}});
      }
      if(signedIn&&url.pathname==='/api/affairs-action'&&request.method()==='POST'){
        const body=request.postDataJSON();
        assert.deepEqual(body,{kind:'elearning_join',payload:{course_id:9718}});
        writes.push(body.payload.course_id);
        enrolled??={courseId:9718,joinedAt:'2026-11-14T02:00:00.000Z'};
        if(failFirst){failFirst=false;return route.fulfill({status:503,json:{error:'Retry'}});}
        return route.fulfill({json:enrolled});
      }
      return route.fulfill({json:schoolServiceReadFixture(request.url(),request.method(),user,origin)});
    }catch(error){errors.push(error.message);return route.abort();}
  });
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror',cause=>errors.push(cause.message));
  return page;
}
try{
  const page=await fixture(true);
  await page.goto(origin+'/school-affairs/menu/menu/external');
  const link=page.locator('a[href="'+path+'"]').first();
  await link.click();
  await page.waitForURL(origin+path);
  const main=page.locator('#elearning-main');
  await main.getByRole('heading',{name:'系統公告'}).waitFor();
  const header=await page.locator('.elearning-header').boundingBox();
  assert.ok(Math.abs(header.x-38.4)<1&&header.y===25&&Math.abs(header.width-1203.2)<1&&header.height===88,JSON.stringify(header));
  const side=await page.getByRole('heading',{name:'重要消息',exact:true}).boundingBox();
  assert.ok(side.x>=57&&side.x<62);
  const month=page.locator('.elearning-month span');
  const original=await month.textContent();
  await page.getByRole('button',{name:'下個月'}).click();
  assert.notEqual(await month.textContent(),original);
  await page.getByRole('button',{name:'上個月'}).click();
  assert.equal(await month.textContent(),original);
  await main.getByRole('link',{name:'遠距教學轉入TronClass創課'}).click();
  await page.waitForURL(origin+path+'/notice/325504');
  await main.getByText('課程轉入 TronClass。').waitFor();
  await page.goto(origin+path);
  await main.getByRole('link',{name:'教務處'}).click();
  await page.waitForURL(origin+path+'/category/41');
  await main.getByRole('heading',{name:'教務處',exact:true}).waitFor();
  await main.getByRole('link',{name:course.title,exact:true}).waitFor();
  await main.getByLabel('搜尋課程:').fill('20220902');
  await main.getByRole('button',{name:'Go'}).click();
  await page.waitForURL(origin+path+'/search?q=20220902');
  await main.getByRole('link',{name:course.title}).click();
  await page.waitForURL(origin+path+'/course/9718');
  await page.getByRole('button',{name:'將我加入'}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.deepEqual(writes,[]);
  await page.getByRole('button',{name:'將我加入'}).click();
  await page.getByRole('button',{name:'確認',exact:true}).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  await page.getByRole('button',{name:'確認',exact:true}).click();
  await main.getByRole('status').filter({hasText:'已加入'}).waitFor();
  assert.deepEqual(writes,[9718,9718]);
  await page.reload();
  await main.getByRole('status').filter({hasText:'已加入'}).waitFor();
  await page.goto(origin+path+'/my-courses');
  await main.getByRole('link',{name:course.title}).waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('What are my courses?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const assistant=page.getByRole('dialog');
  await assistant.getByRole('link',{name:course.title}).waitFor();
  assert.equal(await assistant.getByRole('link',{name:course.title}).getAttribute('href'),path+'/course/9718');
  await assistant.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
  await page.getByPlaceholder('Ask a school question…').fill('What are my grades in remote-learning Moodle?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await assistant.getByText('This account lookup does not provide personal remote-learning grades.',{exact:true}).waitFor();
  const gradeReply=assistant.locator('article').last();
  await gradeReply.locator('details summary').click();
  await gradeReply.getByText('Checked remote-learning scope',{exact:true}).waitFor();
  assert.deepEqual(assistantRequests,['What are my courses?','What are my grades in remote-learning Moodle?']);
  await page.keyboard.press('Escape');
  await assistant.waitFor({state:'hidden'});
  await page.goto(origin+path+'/course/9408');
  await main.getByRole('link',{name:'第一段影片',exact:true}).waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill(outlineQuestion);
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const outlineReply=assistant.locator('article').filter({hasText:'The outline links to'});
  assert.equal(await outlineReply.getByRole('link',{name:'第一段影片',exact:true}).getAttribute('href'),path+'/course/9408/activity/293395');
  assert.equal(await outlineReply.getByRole('link',{name:course.title,exact:true}).getAttribute('href'),path+'/course/9718');
  await outlineReply.locator('details summary').click();
  await outlineReply.getByText('Checked the saved course outline',{exact:true}).waitFor();
  await outlineReply.getByText('Checked saved enrollments',{exact:true}).waitFor();
  assert.equal(assistantRequests.filter(question=>question===outlineQuestion).length,1);
  await page.keyboard.press('Escape');
  await assistant.waitFor({state:'hidden'});
  await page.goto(origin+path+'/category/28');
  await main.getByRole('link',{name:'下一頁'}).click();
  await page.waitForURL(origin+path+'/category/28?page=2');
  await main.getByRole('link',{name:'歷年課程 23',exact:true}).waitFor();
  await page.reload();
  await main.getByText('第 2 / 2 頁（23 門課程）',{exact:true}).waitFor();
  await main.getByRole('link',{name:'上一頁'}).click();
  await main.getByRole('link',{name:'歷年課程 1',exact:true}).waitFor();
  assert.equal(await main.getByRole('link',{name:'歷年課程 23',exact:true}).count(),0);
  await page.goto(origin+'/school-affairs/services/4-2');
  await page.waitForURL(origin+path);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:800});
    for(const route of [path,path+'/course/9718',path+'/category/41']){
      await page.goto(origin+route);
      await main.getByRole('heading').first().waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' @ '+width);
    }
  }
  await page.goto(origin+'/school-sites/elearning.stu.edu.tw/course/index.php?categoryid=41');
  await page.waitForURL(origin+path+'/category/41');
  await page.setViewportSize({width:1280,height:720});
  await page.goto(origin+path+'/course/9408');
  const firstVideo=main.getByRole('link',{name:'第一段影片'});
  await firstVideo.waitFor();
  await page.locator('.elearning-header').getByRole('heading',{name:protectedCourse.title}).waitFor();
  assert.equal(await main.getByRole('heading',{name:protectedCourse.title}).count(),0);
  assert.equal(await page.locator('.elearning-breadcrumb [aria-current=page]').count(),1);
  const videoRoute=path+'/course/9408/activity/293395';
  assert.equal(await firstVideo.getAttribute('href'),videoRoute);
  await firstVideo.locator('img').evaluate(img=>img.decode());
  assert.equal(await main.getByRole('link',{name:'出席統計'}).getAttribute('href'),
    path+'/course/9408/activity/293399');
  await firstVideo.click();
  await page.waitForURL(origin+videoRoute);
  const officialVideo=main.getByRole('link',{name:'在 Moodle 觀看影片'});
  assert.equal(await officialVideo.getAttribute('href'),'https://elearning.stu.edu.tw/mod/url/view.php?id=293395');
  assert.equal(await officialVideo.getAttribute('target'),'_blank');
  assert.equal(await main.locator('iframe').count(),0);
  await page.reload();
  await officialVideo.waitFor();
  await page.locator('.elearning-breadcrumb [aria-current=page]').filter({hasText:'第一段影片'}).waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('What videos are listed?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const activityReply=page.getByRole('dialog').locator('article').last();
  const activityLink=activityReply.getByRole('link',{name:'第一段影片'});
  assert.equal(await activityLink.getAttribute('href'),videoRoute);
  assert.equal(assistantRequests.filter(question=>question==='What videos are listed?').length,1);
  assert.equal(await page.getByRole('dialog').getByRole('link',{name:'出席統計'}).count(),0);
  await page.keyboard.press('Escape');
  await main.getByRole('link',{name:'返回課程'}).click();
  await firstVideo.waitFor();
  await page.goto(origin+path+'/course/9408/activity/281294');
  await main.getByRole('heading',{name:'無法開啟活動'}).waitFor();
  assert.equal(await main.getByRole('link',{name:/在 Moodle/}).count(),0);
  const unassigned=await fixture(true,false);
  await Promise.all([
    unassigned.waitForResponse(res=>new URL(res.url()).searchParams.get('scope')===elearningOutlineScope),
    unassigned.goto(origin+path+'/course/9408'),
  ]);
  await unassigned.getByRole('heading',{name:protectedCourse.title}).waitFor();
  assert.equal(await unassigned.getByRole('link',{name:'第一段影片'}).count(),0);
  await unassigned.goto(origin+videoRoute);
  await unassigned.locator('#elearning-main').getByRole('heading',{name:'無法開啟活動'}).waitFor();
  assert.equal(await unassigned.locator('#elearning-main').getByRole('link',{name:/在 Moodle/}).count(),0);
  const guest=await fixture(false);
  await guest.goto(origin+videoRoute);
  await guest.waitForURL(url=>url.pathname===path+'/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),videoRoute);
  await guest.getByRole('button',{name:'Continue with Google'}).waitFor();
  assert.equal(await guest.locator('input[type=password]').count(),0);
  assert.deepEqual(errors,[]);
  await checkRelease();
  console.log('Remote-learning layout, enrollment retry, refresh, responsive widths, guest return and authenticated assistant dispatch verified with mocked APIs.');
}catch(error){if(errors.length)console.error(errors);throw error;}
finally{await browser.close();}
