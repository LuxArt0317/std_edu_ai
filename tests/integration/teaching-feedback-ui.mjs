import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceSnapshot,schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {teachingFeedbackPaths,validTeachingFeedbackAction} from '../../server/teachingFeedbackContract.js';

const base=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
assert.ok(['https://stu.best','http://127.0.0.1:5184'].includes(base));
async function verifyRevision(){
  if(base!=='https://stu.best')return;
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision??'',/^[0-9a-f]{40}$/u);
  const manifest=await (await fetch(base+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)})).json();
  assert.equal(manifest.revision,revision);
}
const term={id:randomUUID(),label:'QA Term'};
const course={id:randomUUID(),course:'Web Design',code:'QA-101',term:term.label,section:'A'};
const survey={id:randomUUID(),termId:term.id,term:term.label,phase:'final',questions:['Course clarity','Course resources'],
  opensAt:'2026-11-01T00:00:00Z',closesAt:'2026-11-30T00:00:00Z',version:1,released:false,state:'open'};
const feedback={id:randomUUID(),sectionId:course.id,course:course.course,code:course.code,term:course.term,
  comment:'Please include a practice example.',status:'submitted',submittedAt:'2026-11-14T00:00:00Z',reviewedAt:null};
const empty=user=>({userId:user.id,courses:[],surveys:[],feedback:[],terms:[],results:[]});
let completed=false,feedbackStatus=null;
const errors=[],studentWrites=[],managerWrites=[];
await verifyRevision();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
function observe(page){
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&message.text().includes('[STU_NEXUS_RENDER_FAILURE]'))errors.push(message.text());});
}
try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:850}});
  await mockAffairsAuth(context);
  await context.route('**/api/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url());
      if(url.pathname==='/api/affairs-data'&&url.searchParams.get('scope')==='teaching-feedback'){
        assert.match(req.headers().authorization,/^Bearer /u);
        const view=url.searchParams.get('view');
        if(url.searchParams.has('answer')){
          assert.equal(view,'survey');
          assert.equal(completed,true);
          return route.fulfill({json:{status:'answered',answer:'QA Term · final · 1/1 completed',citations:[],
            grounding:{source:'account',webSearched:false},suggestedQuestions:[]}});
        }
        if(view==='survey')return route.fulfill({json:{...empty(affairsTestUser),surveys:[{...survey,courses:[{...course,completed}]}]}});
        assert.equal(view,'immediate');
        return route.fulfill({json:{...empty(affairsTestUser),courses:[course],feedback:feedbackStatus?[feedbackStatus]:[]}});
      }
      if(url.pathname==='/api/affairs-action'){
        const action=req.postDataJSON();
        assert.ok(validTeachingFeedbackAction(action.kind,action.payload));
        studentWrites.push(action);
        if(action.kind==='submit_teaching_survey'){
          assert.deepEqual(action.payload.ratings,[5,4]);
          assert.equal(action.payload.comment,'Thanks for the example.');
          completed=true;
          if(studentWrites.length===1)return route.fulfill({status:503,json:{error:'Lost response'}});
          assert.deepEqual(studentWrites[0],studentWrites[1]);
          return route.fulfill({json:{surveyId:survey.id,sectionId:course.id,completed:true}});
        }
        assert.equal(action.kind,'submit_teaching_feedback');
        assert.equal(action.payload.comment,feedback.comment);
        feedbackStatus=feedback;
        return route.fulfill({json:feedbackStatus});
      }
      if(url.pathname==='/api/affairs-conversations'&&req.method()==='POST'){
        const chat=req.postDataJSON();
        return route.fulfill({json:{id:chat.id,title:chat.title,messages:chat.messages,version:1,updated_at:new Date().toISOString()}});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,req.method(),affairsTestUser,base)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();observe(page);
  await page.goto(base+'/school-affairs/menu/aca/all');
  await page.getByRole('link',{name:'教學意見問卷調查',exact:true}).click();
  await page.waitForURL(base+teachingFeedbackPaths.survey);
  await page.getByRole('button',{name:'填答 QA-101',exact:true}).click();
  await page.getByRole('group',{name:'Course clarity'}).getByRole('radio',{name:'5',exact:true}).check();
  await page.getByRole('group',{name:'Course resources'}).getByRole('radio',{name:'4',exact:true}).check();
  await page.getByLabel('其他意見（選填）').fill('Thanks for the example.');
  const submit=page.getByRole('button',{name:'檢查並送出問卷'}),dialog=page.getByRole('dialog');
  await submit.click();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(studentWrites.length,0);
  await submit.click();await dialog.getByRole('button',{name:'確認送出',exact:true}).click();
  await dialog.getByRole('alert').waitFor();await dialog.getByRole('button',{name:'重試儲存'}).click();
  await page.getByRole('cell',{name:'已填答',exact:true}).waitFor();
  await page.reload();await page.getByRole('cell',{name:'已填答',exact:true}).waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('What is my teaching evaluation status?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('QA Term · final · 1/1 completed',{exact:true}).first().waitFor();
  await page.goto(base+'/school-affairs/menu/aca/all');
  await page.getByRole('link',{name:'即時反應教學意見',exact:true}).click();
  await page.waitForURL(base+teachingFeedbackPaths.immediate);
  await page.locator('select[name=section]').selectOption(course.id);
  await page.getByLabel('教學意見',{exact:true}).fill(feedback.comment);
  await page.getByRole('button',{name:'檢查並送出意見'}).click();
  await dialog.getByRole('button',{name:'確認送出',exact:true}).click();
  await page.getByRole('cell',{name:'已送出',exact:true}).waitFor();
  await page.reload();await page.getByRole('cell',{name:feedback.comment,exact:true}).waitFor();
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:850});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows at '+width);
    if(width===1280||width===390){
      const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      assert.deepEqual(audit.violations.filter(row=>['serious','critical'].includes(row.impact)).map(row=>row.id),[]);
    }
  }
  assert.equal(studentWrites.length,3);

  const manager={...affairsTestUser,id:randomUUID(),email:'reviewer@example.invalid'};
  const snapshot=schoolServiceSnapshot(manager);snapshot.profile.role='admin';
  snapshot.admin={profiles:[],students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]};
  let saved=false,released=false;
  const admin=await browser.newContext({serviceWorkers:'block'});await mockAffairsAuth(admin,{user:manager});
  await admin.route('**/api/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url());
      if(url.pathname==='/api/affairs-conversations')return route.fulfill({json:{conversations:[]}});
      if(url.pathname==='/api/affairs-data'&&url.searchParams.get('scope')==='teaching-feedback'){
        const selected=url.searchParams.get('term');
        const row={...survey,state:'closed',version:released?2:1,released,courses:[]};
        const results=released?[{surveyId:survey.id,sectionId:course.id,course:course.course,code:course.code,section:course.section,count:5,
          averages:[4.5,4],comments:url.searchParams.has('section')?['Released anonymous text.']:[]}]:[];
        return route.fulfill({json:{...empty(manager),terms:[term],surveys:selected&&saved?[row]:[],feedback:feedbackStatus.status==='submitted'?[feedbackStatus]:[],results}});
      }
      if(url.pathname==='/api/affairs-manage'){
        const action=req.postDataJSON();managerWrites.push(action.kind);
        assert.ok(validTeachingFeedbackAction(action.kind,action.payload));
        if(action.kind==='save_teaching_survey'){
          assert.deepEqual(action.payload.questions,survey.questions);saved=true;
          return route.fulfill({json:{id:survey.id,version:1}});
        }
        if(action.kind==='release_teaching_survey'){
          assert.equal(action.payload.grades_published,true);released=true;
          return route.fulfill({json:{id:survey.id,version:2}});
        }
        assert.equal(action.kind,'review_teaching_feedback');
        feedbackStatus={...feedbackStatus,status:'reviewed',reviewedAt:'2026-11-14T00:30:00Z'};
        return route.fulfill({json:feedbackStatus});
      }
      return route.fulfill({json:snapshot});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const editor=await admin.newPage();observe(editor);await editor.goto(base+'/school-affairs/admin/records');
  const management=editor.getByRole('region',{name:'Teaching feedback management'}),reviewDialog=editor.getByRole('dialog');
  await management.getByRole('button',{name:'Manage teaching feedback',exact:true}).click();
  await management.getByLabel('學期',{exact:true}).selectOption(term.id);
  const final=management.getByRole('region',{name:'期末問卷設定'});
  await final.getByLabel('開放時間（台北）').fill('2026-11-01T08:00');
  await final.getByLabel('截止時間（台北）').fill('2026-11-30T08:00');
  await final.getByLabel('題目（每行一題）').fill(survey.questions.join('\n'));
  await final.getByRole('button',{name:'儲存期末問卷'}).click();
  await reviewDialog.getByRole('button',{name:'確認儲存',exact:true}).click();
  await final.getByRole('button',{name:'發布期末結果'}).click();
  assert.equal(await reviewDialog.getByRole('button',{name:'確認儲存',exact:true}).isEnabled(),false);
  await reviewDialog.getByRole('checkbox').check();await reviewDialog.getByRole('button',{name:'確認儲存',exact:true}).click();
  await management.getByText('5 份填答',{exact:false}).waitFor();
  await management.getByRole('button',{name:'文字意見',exact:true}).click();
  await management.getByText('Released anonymous text.',{exact:true}).waitFor();
  await management.getByRole('button',{name:'標記已檢閱',exact:true}).click();
  await reviewDialog.getByRole('button',{name:'確認儲存',exact:true}).click();
  await management.getByText('目前無待檢閱意見。',{exact:true}).waitFor();
  assert.deepEqual(managerWrites,['save_teaching_survey','release_teaching_survey','review_teaching_feedback']);
  await page.reload();await page.getByRole('cell',{name:'已檢閱',exact:true}).waitFor();
  const guest=await browser.newContext();await mockAffairsAuth(guest,{signedIn:false});
  const gate=await guest.newPage();
  for(const path of Object.values(teachingFeedbackPaths)){
    await gate.goto(base+path);await gate.waitForURL('**/school-affairs/login?next=*');
    assert.equal(new URL(gate.url()).searchParams.get('next'),path);
  }
  assert.deepEqual(errors,[]);
  await verifyRevision();
  console.log('Teaching feedback browser passed: both catalog links, survey/replay, private history, assistant, administration, released comments, contrast and guest returns.');
}finally{await browser.close();}
