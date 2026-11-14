import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { affairsTestUser as user,mockAffairsAuth } from './helpers/affairs-auth.mjs';
import { clubOfficerMenu,clubOfficerScope } from '../../server/clubOfficerContract.js';
import { clubPath } from '../../server/clubServicesContract.js';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:54635';
async function pin(){
  if(origin!=='https://stu.best')return;
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[a-f0-9]{40}$/u);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,process.env.EXPECTED_RELEASE_REVISION);
}
await pin();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'});
  await mockAffairsAuth(context);
  const club={id:'bc198d1b-b888-441f-8150-cbc7395a3c80',name:'QA Club'};
  const recordId='c929fde5-7740-4ba4-b1f4-6c102111bd0e';
  const period={academic_year:115,term:1};
  const next=[];
  const writes=[];
  let fail=true;
  await context.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),view=url.searchParams.get('view');
    if(url.searchParams.get('scope')===clubOfficerScope){
      assert.equal(req.method(),'GET');
      assert.match(req.headers().authorization??'',/^Bearer /u);
      const clubId=url.searchParams.get('club');
      if(view==='review')return route.fulfill({status:403,json:{error:'Denied'}});
      const student={id:recordId,student_number:'QA-01',student_name:'QA Student',club_name:club.name,...period};
      const rows=view==='applications'?next:view==='completion'?[]:view==='profiles'?
        [{...club,location:'QA Club room',advisor:'QA Advisor',member_count:2,lead_name:null,lead_email:null,lead_phone:null,
          lead_mobile:null,review_status:null,lending_status:null,...period}]:clubId!==club.id?[]:
        view==='members'?[{...student,role_label:'QA Officer',officer:true,contact_email:null,contact_phone:null}]:
        [{...student,title:'QA Activity',starts_at:'2026-11-29T02:00:00Z'}];
      return route.fulfill({json:{userId:user.id,view,clubs:[club],rows}});
    }
    if(url.pathname==='/api/affairs-action'){
      const {kind,payload}=req.postDataJSON();
      writes.push(payload.request_id);
      assert.match(payload.request_id,/^[a-f0-9-]{36}$/u);
      if(kind==='submit_club_application'){
        const details=payload.application;
        assert.equal(details.club_id,club.id);
        assert.equal(details.starts_at,'2026-11-29T10:00+08:00');
        assert.deepEqual(details.sdgs,['4']);
        if(fail){fail=false;return route.fulfill({status:503,json:{error:'請重試。'}});}
        assert.equal(writes[0],writes[1]);
        next.push({...details,id:recordId,club_name:club.name,can_edit:true,academic_year:null,term:null,details,
          hours:Number(details.hours),review_note:'',completion_note:'',version:1,status:'submitted'});
      }else{
        assert.equal(kind,'withdraw_club_application');
        assert.equal(payload.id,recordId);
        assert.equal(payload.expected_version,1);
        next[0].status='withdrawn';next[0].version=2;
      }
      return route.fulfill({json:{id:recordId,version:next[0].version,status:next[0].status}});
    }
    if(url.pathname==='/api/affairs-conversations'){
      if(req.method()==='GET')return route.fulfill({json:{conversations:[]}});
      const {id,title,messages,version}=req.postDataJSON();
      return route.fulfill({json:{id,title,messages,version:version+1,updated_at:new Date().toISOString()}});
    }
    throw new Error('Unexpected QA call '+url.pathname);
  });
  const page=await context.newPage();
  page.setDefaultTimeout(9000);
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(origin+clubPath);
  for(const [path,label,title] of clubOfficerMenu){
    await page.getByRole('button',{name:'社團幹部',exact:true}).click();
    await page.getByRole('menuitem',{name:label,exact:true}).click();
    await page.waitForURL(url=>url.pathname===clubPath+'/'+path);
    await page.getByRole('heading',{name:new RegExp(title)}).waitFor();
  }
  await page.getByLabel('社團名稱',{exact:true}).selectOption(club.id);
  await page.getByRole('button',{name:'查詢',exact:true}).click();
  await page.getByText('QA Activity',{exact:true}).waitFor();
  await page.goto(origin+clubPath+'/officer/members?club='+club.id);
  await page.getByText('QA Officer',{exact:true}).waitFor();
  await page.goto(origin+clubPath+'/officer/profiles');
  await page.getByText('QA Club room',{exact:true}).waitFor();
  await page.goto(origin+clubPath+'/officer/applications');
  await page.getByRole('link',{name:'新增',exact:true}).click();
  await page.getByLabel('社團名稱',{exact:true}).selectOption(club.id);
  await page.getByLabel('活動名稱',{exact:true}).fill('QA Workshop');
  await page.getByLabel('主辦單位',{exact:true}).fill('QA Club');
  await page.getByLabel('開始時間',{exact:true}).fill('2026-11-29T10:00');
  await page.getByLabel('結束時間',{exact:true}).fill('2026-11-29T12:00');
  await page.getByLabel('活動小時',{exact:true}).fill('2');
  await page.getByLabel('活動地點',{exact:true}).fill('QA Room');
  await page.getByRole('checkbox',{name:'SDG4-優質教育'}).check();
  if(process.env.CLUB_OFFICER_SCREENSHOT)await page.screenshot({path:process.env.CLUB_OFFICER_SCREENSHOT});
  await page.getByRole('button',{name:'送出',exact:true}).click();
  await page.getByRole('alert').getByText('請重試。').waitFor();
  await page.getByRole('button',{name:'送出',exact:true}).click();
  await page.getByText('待審核',{exact:true}).waitFor();
  await page.getByRole('link',{name:'編輯',exact:true}).click();
  assert.equal(await page.getByLabel('活動名稱',{exact:true}).inputValue(),'QA Workshop');
  await page.getByRole('link',{name:'回列表',exact:true}).click();
  await page.getByRole('button',{name:'撤回',exact:true}).click();
  await page.getByRole('button',{name:'確認撤回'}).click();
  await page.getByText('已撤回',{exact:true}).waitFor();
  assert.equal(writes.length,3);
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('Where are my club activity applications?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const assistant=page.getByRole('dialog');
  await assistant.getByText(/Club officers can create applications/).waitFor();
  assert.equal(await assistant.getByRole('link',{name:'Club activity applications'}).first().getAttribute('href'),clubPath+'/officer/applications');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:320,height:700});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.locator('.club-officer-table').evaluate(node=>node.scrollWidth>node.clientWidth));
  await page.goto(origin+clubPath+'/officer/review');
  await page.getByRole('alert').getByText('Denied').waitFor();
  assert.deepEqual(pageErrors,[]);
  await pin();
  console.log('Five local officer routes, filtered rosters, exact application fields, submit retry, edit preload, withdrawal and mobile table passed.');
}finally{await browser.close();}
