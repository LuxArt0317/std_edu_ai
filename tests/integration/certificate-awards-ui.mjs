import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {certificateAwardPath as path,certificateProofBucket} from '../../server/certificateAwardsContract.js';
import {affairsTestUser as student,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture,schoolServiceSnapshot} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:54630';
if(origin==='https://stu.best'){
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[0-9a-f]{40}$/);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,process.env.EXPECTED_RELEASE_REVISION);
}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[],writes=[];
const id=randomUUID(),fileId=randomUUID(),filePath=student.id+'/'+id+'/'+fileId;
const certificate={code:'3345',name:'Microsoft Excel Associate',level:'Associate',issuer:'Microsoft'};
const identity={studentNumber:'QA-CERT-01',name:'測試學生'};
const payout={bank:'QA Bank',branch:'QA Branch',account_last_four:'4321',note:'',verified_at:'2026-11-14T03:00:00Z'};
const bytes=Buffer.from('%PDF-1.4\n%%EOF\n');
let record=null,proof=null,receipt=null,failSubmit=true,storageWrites=0;
async function session(user,admin=false){
  const context=await browser.newContext({viewport:{width:1280,height:820},serviceWorkers:'block'});
  await mockAffairsAuth(context,{user});
  await context.route('**/storage/v1/object/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url());
      assert.match(req.headers().authorization??'',/^Bearer /u);
      const base='/storage/v1/object/';
      if(req.method()==='POST'){
        assert.equal(admin,false);assert.equal(url.pathname,base+certificateProofBucket+'/'+filePath);
        assert.deepEqual(req.postDataBuffer(),bytes);
        storageWrites++;return route.fulfill({json:{id:fileId}});
      }
      assert.equal(url.pathname,base+'authenticated/'+certificateProofBucket+'/'+filePath);
      return route.fulfill({body:bytes,contentType:'application/pdf'});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  await context.route('**/api/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url()),scope=url.searchParams.get('scope');
      if(url.pathname==='/api/affairs-conversations'&&req.method()==='POST'){
        const {id:threadId,title,messages}=req.postDataJSON();
        return route.fulfill({json:{id:threadId,title,messages,version:1,updated_at:new Date().toISOString()}});
      }
      if(scope==='certificate-awards'){
        assert.match(req.headers().authorization??'',/^Bearer /u);
        if(url.searchParams.get('view')==='catalog'){
          const key=url.searchParams.get('name')??'';
          const rows=!key||certificate.name.toLowerCase().includes(key.toLowerCase())?[certificate]:[];
          return route.fulfill({json:{rows,total:rows.length,page:Number(url.searchParams.get('page')??0)}});
        }
        assert.equal(url.searchParams.get('view'),admin?'manage':'mine');
        assert.equal(url.searchParams.get('user_id'),admin?student.id:null);
        if(url.searchParams.get('answer')==='en')return route.fulfill({json:{status:'answered',answer:'Microsoft Excel Associate · Submitted',
          citations:[],suggestedQuestions:[],activity:[],grounding:{source:'account',webSearched:false}}});
        return route.fulfill({json:{userId:student.id,identity,payout,rows:record?[record]:[],
          files:proof&&url.searchParams.get('id')===id?[proof]:[]}});
      }
      if(url.pathname==='/api/affairs-action'){
        assert.equal(admin,false);
        const {kind,payload}=req.postDataJSON();
        writes.push({kind,id:payload.request_id});
        if(kind==='certificate_award_draft'){
          assert.equal(payload.certificate_code,certificate.code);
          record={id,certificate_code:certificate.code,name:certificate.name,level:certificate.level,issuer:certificate.issuer,
            status:'draft',version:1,phone:payload.phone,teacher_code:payload.teacher_code,obtained_on:payload.obtained_on,
            wants_award:payload.wants_award,application_fee:null,award_amount:null,review_note:'',updated_at:'2026-11-14T03:00:00Z'};
          return route.fulfill({json:{id,version:1,status:'draft'}});
        }
        assert.equal(payload.id,id);
        assert.equal(payload.expected_version,1);
        if(kind==='certificate_award_reserve'){
          assert.equal(payload.size_bytes,bytes.length);
          assert.equal(payload.content_type,'application/pdf');
          return route.fulfill({json:{id,version:1,fileId,path:filePath}});
        }
        if(kind==='certificate_award_attach'){
          assert.equal(payload.file_id,fileId);
          proof={id:fileId,filename:'proof.pdf',sizeBytes:bytes.length,contentType:'application/pdf',attached:true,path:filePath};
          return route.fulfill({json:{id,version:1,fileId}});
        }
        assert.equal(kind,'certificate_award_submit');
        receipt={id,version:2,status:'submitted'};
        record={...record,...receipt};
        if(failSubmit){failSubmit=false;return route.fulfill({status:503,json:{error:'Retry'}});}
        return route.fulfill({json:receipt});
      }
      if(url.pathname==='/api/affairs-manage'){
        assert.equal(admin,true);
        const {kind,payload}=req.postDataJSON();
        assert.equal(kind,'certificate_award_review');
        assert.equal(payload.id,id);assert.equal(payload.user_id,student.id);
        assert.equal(payload.status,'approved');assert.equal(payload.award_amount,500);
        record={...record,version:3,status:'approved',application_fee:600,award_amount:500};
        return route.fulfill({json:{id,version:3,status:'approved'}});
      }
      if(admin&&url.pathname==='/api/affairs-data'){
        const snapshot=schoolServiceSnapshot(user);snapshot.profile.role='admin';
        return route.fulfill({json:{...snapshot,admin:{profiles:[{user_id:student.id,email:student.email,display_name:'QA Student',role:'student'}],
          students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]}}});
      }
      return route.fulfill({json:schoolServiceReadFixture(req.url(),req.method(),user,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  return page;
}
try{
  const page=await session(student);
  await page.goto(origin+'/school-affairs/menu/rdd/all');
  await page.getByRole('link',{name:'證照獎補助金申請',exact:true}).click();
  await page.waitForURL(origin+path);
  const main=page.locator('.certificate-awards');
  await main.getByLabel('學號',{exact:true}).waitFor();
  assert.equal(await main.getByLabel('學號',{exact:true}).inputValue(),identity.studentNumber);
  assert.equal(await main.getByLabel('帳號',{exact:true}).inputValue(),'••••4321');
  const frame=await main.locator('.certificate-frame').boundingBox(),form=await main.locator('.certificate-entry').boundingBox();
  assert.deepEqual([frame.x,frame.y,frame.width],[159,12,962]);
  assert.ok(Math.abs(form.x-203.9)<3&&Math.abs(form.y-329.95)<8,JSON.stringify(form));
  await mkdir('artifacts/certificate-awards',{recursive:true});
  await page.screenshot({path:'artifacts/certificate-awards/form-1280.png',animations:'disabled'});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:820});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  }
  await page.setViewportSize({width:1280,height:820});
  await main.getByRole('link',{name:'證照名稱',exact:true}).click();
  await page.waitForURL(origin+path+'/catalog');
  await main.getByText(certificate.name,{exact:true}).waitFor();
  await main.getByLabel('證照名稱',{exact:true}).fill('missing');
  await main.getByRole('button',{name:'查詢',exact:true}).click();
  await main.getByText('查無證照資料。').waitFor();
  await main.getByRole('link',{name:'證照記錄',exact:true}).click();
  await main.getByRole('button',{name:'搜尋證照名稱'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'選擇 3345'}).click();
  await main.getByLabel('手機/電話').fill('0900000000');
  await main.getByLabel('證照取得日期').fill('2026-01-10');
  await main.getByRole('radio',{name:'Y-申請證照獎助金'}).check();
  await main.getByRole('button',{name:'上傳證照證明文件',exact:true}).first().click();
  await dialog.locator('input[type=file]').setInputFiles({name:'proof.pdf',mimeType:'application/pdf',buffer:bytes});
  await dialog.getByRole('button',{name:'上傳',exact:true}).click();
  await page.waitForURL(origin+path+'/record/'+id);
  await main.getByRole('button',{name:'proof.pdf'}).waitFor();
  assert.equal(storageWrites,1);
  await main.getByRole('button',{name:'新增',exact:true}).click();
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal(writes.filter(value=>value.kind==='certificate_award_submit').length,0);
  await main.getByRole('button',{name:'新增',exact:true}).click();
  await dialog.getByRole('button',{name:'確認送出'}).click();
  await dialog.getByRole('alert').waitFor();
  await dialog.getByRole('button',{name:'確認送出'}).click();
  await main.getByText('證照資料已送出。').waitFor();
  const submits=writes.filter(value=>value.kind==='certificate_award_submit');
  assert.equal(submits.length,2);assert.equal(submits[0].id,submits[1].id);
  await page.reload();
  await main.getByText('申請中',{exact:true}).waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('What is my certificate award status?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Microsoft Excel Associate · Submitted',{exact:true}).waitFor();
  const manager=await session({...student,id:randomUUID(),email:'certificate-manager@example.invalid'},true);
  await manager.goto(origin+'/school-affairs/admin/records');
  const managerPanel=manager.getByRole('region',{name:'證照獎助金管理'});
  await managerPanel.getByRole('button',{name:'證照獎助金管理'}).click();
  await managerPanel.getByLabel('證照獎助金學生帳戶').selectOption(student.id);
  await managerPanel.getByLabel('證照紀錄',{exact:true}).selectOption(id);
  await managerPanel.getByLabel('審核狀態').selectOption('approved');
  await managerPanel.getByLabel('證照報名費').fill('600');
  await managerPanel.getByLabel('獎補助金額').fill('500');
  await managerPanel.getByRole('button',{name:'儲存審核'}).click();
  await managerPanel.getByText('Microsoft Excel Associate · 通過',{exact:true}).last().waitFor();
  await page.reload();
  await main.getByText('通過',{exact:true}).waitFor();
  const guest=await browser.newPage({serviceWorkers:'block'});
  await guest.goto(origin+path+'/record/'+id);
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),path+'/record/'+id);
  assert.deepEqual(errors,[]);
  console.log('Certificate awards browser passed geometry, navigation, catalog, upload, retry, review, assistant and sign-in.');
}finally{await browser.close();}
