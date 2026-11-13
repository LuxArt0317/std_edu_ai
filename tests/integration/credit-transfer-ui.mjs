import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceSnapshot,schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {creditTransferPath,creditTransferSave,creditTransferSubmit,creditTransferReview} from '../../server/creditTransferContract.js';

const base=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
const production=base==='https://stu.best';
assert.ok(production||base==='http://127.0.0.1:5184');
async function verifyRevision(){
  if(!production)return;
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision??'',/^[0-9a-f]{40}$/u);
  const manifest=await (await fetch(base+'/release.json',{signal:AbortSignal.timeout(10000),cache:'no-store'})).json();
  assert.equal(manifest.revision,revision);
}
await verifyRevision();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const writes=[],errors=[];
let row;
try{
  const student=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'});
  await mockAffairsAuth(student);
  await student.route('**/api/**',async route=>{
    try{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname==='/api/affairs-data'&&url.searchParams.get('scope')==='credit-transfer'){
        assert.match(request.headers().authorization,/^Bearer /u);
        if(url.searchParams.get('answer')){
          assert.deepEqual(Object.fromEntries(url.searchParams),{scope:'credit-transfer',answer:'en'});
          return route.fulfill({json:{status:'answered',answer:'Synthetic credit transfer status: '+row.status,citations:[],
            suggestedQuestions:[],grounding:{source:'account',webSearched:false}}});
        }
        assert.deepEqual(Object.fromEntries(url.searchParams),{scope:'credit-transfer'});
        return route.fulfill({json:{userId:affairsTestUser.id,rows:row?[row]:[]}});
      }
      if(url.pathname==='/api/affairs-action'){
        const {kind,payload}=request.postDataJSON();
        writes.push({kind,payload});
        if(kind===creditTransferSave){
          if(writes.length===1){
            assert.equal(payload.expected_version,0);
            assert.deepEqual(payload.courses,[{previous_title:'Prior Programming',previous_credits:3,requested_title:'Programming',
              requested_credits:2.5,course_kind:'required'}]);
            row={id:payload.id,user_id:affairsTestUser.id,reason:payload.reason,previous_school:payload.previous_school,
              courses:payload.courses,status:'draft',decisions:null,version:1,submitted_at:null,reviewed_at:null};
            return route.fulfill({status:503,json:{error:'Lost response'}});
          }
          assert.deepEqual(writes[0],writes[1]);
        }else{
          assert.equal(kind,creditTransferSubmit);
          assert.equal(payload.expected_version,1);
          assert.equal(payload.id,row.id);
          row={...row,status:'submitted',version:2,submitted_at:'2026-11-14T00:00:00Z'};
        }
        return route.fulfill({json:row});
      }
      if(url.pathname==='/api/affairs-conversations'&&request.method()==='POST'){
        const message=request.postDataJSON();
        return route.fulfill({json:{id:message.id,title:message.title,messages:message.messages,version:1,updated_at:new Date().toISOString()}});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,request.method(),affairsTestUser,base)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await student.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/school-affairs/menu/aca/all');
  await page.getByRole('link',{name:'抵免學分申請',exact:true}).click();
  await page.waitForURL(base+creditTransferPath);
  await page.getByLabel('原修習學校',{exact:true}).fill('Previous School');
  await page.getByLabel('原修習課程',{exact:true}).fill('Prior Programming');
  await page.getByLabel('原學分',{exact:true}).fill('3');
  await page.getByLabel('擬抵免課程',{exact:true}).fill('Programming');
  await page.getByLabel('擬抵免學分',{exact:true}).fill('2.5');
  await page.getByRole('button',{name:'儲存草稿',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'尚未確認儲存結果'}).waitFor();
  await page.getByRole('button',{name:'重試儲存',exact:true}).click();
  await page.getByRole('heading',{name:'已儲存的申請 · 草稿',exact:true}).waitFor();
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('.credit-transfer-form').isVisible(),false);
  assert.equal(await page.getByRole('cell',{name:'Programming',exact:true}).isVisible(),true);
  await page.emulateMedia({media:'screen'});
  await page.reload();
  assert.equal(await page.getByLabel('擬抵免課程',{exact:true}).inputValue(),'Programming');
  await page.getByRole('button',{name:'送出站內審查',exact:true}).click();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(writes.length,2);
  await page.getByRole('button',{name:'送出站內審查',exact:true}).click();
  await page.getByRole('button',{name:'確認送出',exact:true}).click();
  await page.getByRole('heading',{name:'已儲存的申請 · 待站內審查',exact:true}).waitFor();
  assert.equal(await page.getByLabel('擬抵免課程',{exact:true}).count(),0);
  await page.getByRole('link',{name:'抵免學分紀錄',exact:true}).click();
  await page.waitForURL(base+creditTransferPath+'/history');
  await page.getByRole('heading',{name:'外校轉入 · 待站內審查'}).waitFor();
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:800});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows at '+width);
  }
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('What is my credit transfer status?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Synthetic credit transfer status: submitted').first().waitFor();

  const manager={...affairsTestUser,id:randomUUID(),email:'reviewer@example.invalid'};
  const adminSnapshot=schoolServiceSnapshot(manager);
  adminSnapshot.profile.role='admin';
  adminSnapshot.admin={profiles:[{user_id:affairsTestUser.id,email:affairsTestUser.email,display_name:'QA Student'}],
    students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]};
  const admin=await browser.newContext({serviceWorkers:'block'});
  await mockAffairsAuth(admin,{user:manager});
  await admin.route('**/api/affairs-data*',route=>{
    const query=new URL(route.request().url()).searchParams;
    if(query.get('scope')!=='credit-transfer-admin')return route.fulfill({json:adminSnapshot});
    assert.deepEqual(Object.fromEntries(query),{scope:'credit-transfer-admin',user_id:affairsTestUser.id});
    return route.fulfill({json:{userId:affairsTestUser.id,rows:[row]}});
  });
  await admin.route('**/api/affairs-manage',route=>{
    const {kind,payload}=route.request().postDataJSON();
    assert.equal(kind,creditTransferReview);
    assert.equal(payload.id,row.id);
    assert.equal(payload.expected_version,2);
    assert.deepEqual(payload.decisions,['transferred']);
    row={...row,status:'reviewed',decisions:payload.decisions,version:3,reviewed_at:'2026-11-14T00:30:00Z'};
    return route.fulfill({json:row});
  });
  const adminPage=await admin.newPage();
  adminPage.on('pageerror',error=>errors.push(error.message));
  await adminPage.goto(base+'/school-affairs/admin/records');
  const review=adminPage.getByRole('region',{name:'Credit transfer review'});
  await review.getByLabel('Credit transfer account').selectOption(affairsTestUser.id);
  await review.getByLabel('審查課程 1 · Programming').selectOption('transferred');
  await review.getByRole('button',{name:'儲存站內審查結果'}).click();
  await review.getByText('已儲存審查結果。',{exact:true}).waitFor();
  await page.reload();
  await page.getByRole('cell',{name:'抵修',exact:true}).waitFor();

  const guest=await browser.newContext();
  await mockAffairsAuth(guest,{signedIn:false});
  const gate=await guest.newPage();
  await gate.goto(base+creditTransferPath+'/history');
  await gate.waitForURL('**/school-affairs/login?next=*');
  assert.equal(new URL(gate.url()).searchParams.get('next'),creditTransferPath+'/history');
  assert.deepEqual(errors,[]);
  await verifyRevision();
  console.log('Credit transfer browser passed: catalog, draft, retry, print, confirmation, review, history, assistant, guest return and responsive widths.');
}finally{await browser.close();}
