// Copied source documents are audited separately by test:school-mirror; this suite covers the React public features.
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import AxeBuilder from "@axe-core/playwright";
import {chromium} from "playwright-core";

const base=process.env.RESEARCH_PUBLIC_BASE||"http://127.0.0.1:4173",local=/127\.0\.0\.1|localhost/.test(base),chrome=process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let preview=null;
async function waitForServer(){for(let i=0;i<60;i++){try{const response=await fetch(base,{signal:AbortSignal.timeout(1000)});if(response.ok)return;}catch{}await delay(250);}throw new Error(`Public test server did not become ready: ${base}`);}
if(local)preview=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--host","127.0.0.1","--port","4173"],{stdio:"ignore"});

const evidence=[];
const study={code:"A11Y-PROTOCOL",title:"STU public information usability study",purpose:"Compare verified public information tasks without collecting direct identifiers.",retentionDays:90,version:1,versionId:"00000000-0000-4000-8000-000000000101",consentText:"Participation is voluntary. You may stop at any time. Do not enter private information while completing the tasks.",taskCount:1,instruments:["SUS","Open response"]};
const session={participantCode:"P-A11Y-001",participantStatus:"active",sessionId:"00000000-0000-4000-8000-000000000102",sessionStatus:"active",sequence:"AB",study:{code:study.code,title:study.title,purpose:study.purpose,version:study.version},tasks:[{id:"00000000-0000-4000-8000-000000000103",key:"find-admissions",domain:"information_retrieval",promptCurrent:"Find the official admissions contact on the current website.",promptEnhanced:"Find the official admissions contact with the enhanced platform.",maxSeconds:300,ordinal:0}],attempts:[],questionnaires:[{id:"00000000-0000-4000-8000-000000000104",instrument:"SUS",version:"1.0",perCondition:true,items:[{id:"00000000-0000-4000-8000-000000000105",key:"sus-1",ordinal:1,prompt:"I would use this information service frequently.",responseType:"likert5"}]},{id:"00000000-0000-4000-8000-000000000106",instrument:"Open response",version:"1.0",perCondition:false,items:[{id:"00000000-0000-4000-8000-000000000107",key:"comment",ordinal:1,prompt:"What made the task easy or difficult?",responseType:"text"}]}]};
const places=[{id:"00000000-0000-4000-8000-000000000201",code:"LIB",name_zh:"圖書館",name_en:"Library",place_type:"building",room:null,status:"active",closure_reason:null,wheelchair_accessible:true,verified_at:"2026-07-01T00:00:00.000Z",description_zh:"圖書資訊服務",description_en:"Library services",contact_phone:null,contact_email:null,building:{name_zh:"圖書館",name_en:"Library"},floor:null,source:{name:"STU official directory",canonical_url:"https://www.stu.edu.tw/"}},{id:"00000000-0000-4000-8000-000000000202",code:"ADMIN",name_zh:"行政大樓",name_en:"Administration Building",place_type:"building",room:null,status:"active",closure_reason:null,wheelchair_accessible:true,verified_at:"2026-07-01T00:00:00.000Z",description_zh:"行政服務",description_en:"Administrative services",contact_phone:null,contact_email:null,building:{name_zh:"行政大樓",name_en:"Administration Building"},floor:null,source:{name:"STU official directory",canonical_url:"https://www.stu.edu.tw/"}}];

function json(route,payload,status=200){return route.fulfill({status,contentType:"application/json",body:JSON.stringify(payload)});}
async function installPublicFixtures(page){
  let enrolled=false;
  await page.route("**/api/research-assistant",route=>json(route,route.request().postDataJSON()?.question?.includes('STU registrar')
    ? {answer:"The registrar office is listed in the STU directory.\n\nWeb sources: [1](https://reg.aca.stu.edu.tw/contact/)",status:"answered",citations:[{chunkId:"web:official-contact",claim:"Live web source; not a reviewed knowledge-base document.",title:"Registrar office",sourceName:"STU official website · Live web",url:"https://reg.aca.stu.edu.tw/contact/",locator:null,effectiveAt:null,reviewedAt:null,origin:"web"}],suggestedQuestions:["How do I contact admissions?"],grounding:{source:"web",webSearched:true,officialOnly:true}}
    : {answer:"招生資訊應以校方招生頁面為準。",status:"answered",citations:[{chunkId:"official-admissions",claim:"Use the official admissions page.",title:"招生資訊",sourceName:"STU official website",url:"https://www.stu.edu.tw/",locator:"招生專區",effectiveAt:"2026-07-01T00:00:00.000Z",reviewedAt:"2026-07-01T00:00:00.000Z"}],suggestedQuestions:[],feedback:{token:"f".repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()}}));
  await page.route("**/api/research-feedback",route=>json(route,{status:"recorded"}));
  await page.route("**/api/campus-route",route=>route.request().method()==="GET"?json(route,{places}):json(route,{status:"verified",origin:places[0],destination:places[1],wheelchair:true,distanceMeters:120,estimatedSeconds:150,steps:[{edgeId:"edge-a11y",distanceMeters:120,estimatedSeconds:150,environment:"outdoor",traversalType:"walkway",wheelchairSuitable:true,instructionZh:"沿無障礙通道前往行政大樓",instructionEn:"Follow the accessible walkway to the Administration Building"}],disclaimer:"This route uses the latest institutionally verified graph; follow posted signs and temporary closure notices."}));
  await page.route("**/api/research-session**",route=>{
    if(route.request().method()==="POST"){enrolled=true;return json(route,{status:"recorded"},201);}
    const url=new URL(route.request().url());
    if(url.searchParams.has("study"))return json(route,study);
    return enrolled?json(route,session):json(route,{error:"No active study session."},401);
  });
}

async function axeEvidence(page,name,expectedStatusSelectors=[]){
  const result=await new AxeBuilder({page}).exclude(".source-mirror").options({iframes:false}).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze();
  const blocking=result.violations.filter(item=>item.impact==="critical"||item.impact==="serious");
  const target=result.violations.filter(item=>item.id==="target-size");
  const unnamed=await page.locator("button:not([aria-label]),a:not([aria-label])").evaluateAll(items=>items.filter(item=>!(item.textContent||"").trim()&&!item.querySelector("img[alt]")&&!item.labels?.length).length);
  const focus=await page.evaluate(()=>{
    const dialog=document.querySelector('[role="dialog"][aria-modal="true"]');
    if(!dialog)return {empty:0,outside:0,obscured:0};
    const panel=dialog.querySelector('section')||dialog;
    const controls=[...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(item=>{const style=getComputedStyle(item);return style.visibility!=="hidden"&&style.display!=="none";});
    let obscured=0;
    for(const item of controls){item.focus();const box=item.getBoundingClientRect();if(document.activeElement!==item||box.top<0||box.left<0||box.bottom>innerHeight||box.right>innerWidth)obscured++;}
    return {empty:controls.length?0:1,outside:document.activeElement&&dialog.contains(document.activeElement)?0:1,obscured};
  });
  let focusCycle=0;
  const dialog=page.locator('[role="dialog"][aria-modal="true"]');
  if(await dialog.count()){
    const panel=dialog.locator('section').first();const scope=await panel.count()?panel:dialog;
    const controls=scope.locator('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])');const count=await controls.count();
    if(count){const first=controls.first(),last=controls.last();await first.focus();await page.keyboard.press('Shift+Tab');if(!(await last.evaluate(item=>document.activeElement===item)))focusCycle++;await last.focus();await page.keyboard.press('Tab');if(!(await first.evaluate(item=>document.activeElement===item)))focusCycle++;}
  }
  let statusMessages=0;for(const selector of expectedStatusSelectors)if(!await page.locator(selector).count())statusMessages++;
  evidence.push({name,criticalSerious:blocking.reduce((n,item)=>n+item.nodes.length,0),violations:blocking.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})),targetSize:target.reduce((n,item)=>n+item.nodes.length,0),unnamedControls:unnamed,focusTraps:focus.empty+focus.outside+focusCycle,obscuredFocus:focus.obscured,statusMessageFailures:statusMessages});
}

async function fresh(page,path="/"){await page.goto(`${base}${path}`,{waitUntil:"domcontentloaded"});}

try{
  await waitForServer();
  const browser=await chromium.launch({headless:true,executablePath:chrome});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",locale:"zh-TW"});
  const page=await context.newPage();
  await installPublicFixtures(page);

  await fresh(page,"/campus-assistant");await page.getByRole("heading",{name:"Campus assistant",exact:true}).waitFor();await axeEvidence(page,"assistant-open");
  await page.getByPlaceholder("Ask a school question…").fill("招生資訊在哪裡？");await page.getByRole("button",{name:"Send",exact:true}).click();await page.getByRole("list",{name:"Sources"}).waitFor();await page.getByRole("heading",{name:"校園助理",exact:true}).waitFor();await axeEvidence(page,"assistant-citation-feedback",['[role="log"][aria-live="polite"]']);
  await page.getByRole("button",{name:"需要修正"}).click();await page.getByRole("button",{name:"送出意見"}).waitFor();await axeEvidence(page,"assistant-correction-expanded");
  await page.getByPlaceholder("Ask a school question…").fill("Where is the STU registrar?");await page.getByRole("button",{name:"Send",exact:true}).click();await page.getByText("Found online · See sources below.").waitFor();
  // The latest user question controls the conversation chrome and feedback,
  // including earlier messages. Locale zh-TW does not force Chinese replies.
  await page.getByRole("heading",{name:"Campus assistant",exact:true}).waitFor();
  await page.getByRole("button",{name:"Send feedback",exact:true}).waitFor();
  const webAnswer=page.getByRole("log").getByRole("article").last();
  if(!await webAnswer.getByRole("link",{name:"Registrar office"}).count() || await webAnswer.getByRole("button",{name:/^(?:Needs improvement|需要修正)$/}).count() || !await webAnswer.getByRole("button",{name:"How do I contact admissions?"}).count())throw Error('Web answer source/feedback/follow-up UI failed');
  await axeEvidence(page,"assistant-web-citation-no-feedback");

  await fresh(page,"/campus-directory");await page.getByRole("button",{name:/開啟校園導覽/}).click();await page.getByRole("heading",{name:"驗證地點與文字路線"}).waitFor();await axeEvidence(page,"campus-directory");
  await page.getByLabel("起點").selectOption("LIB");await page.getByLabel("目的地").selectOption("ADMIN");await page.getByLabel(/只使用無障礙路線/).check();await page.getByRole("button",{name:"建立文字路線"}).click();await page.getByRole("heading",{name:"圖書館 → 行政大樓"}).waitFor();await axeEvidence(page,"campus-route-result",['.campus-route-result[aria-live="polite"]']);

  await fresh(page,`/study/${study.code}`);await page.getByRole("heading",{name:study.title}).waitFor();await axeEvidence(page,"study-consent");
  await page.getByLabel(/I have read the protocol information/).check();await page.getByRole("button",{name:"Consent and begin"}).click();await page.getByRole("heading",{name:"Questionnaires"}).waitFor();await axeEvidence(page,"study-tasks-surveys",['.study-progress[role="status"][aria-live="polite"]']);
  await page.getByRole("button",{name:"Privacy & withdrawal"}).click();await page.getByRole("heading",{name:"Withdraw from this study"}).waitFor();await axeEvidence(page,"study-withdrawal-dialog");

  await page.setViewportSize({width:320,height:720});await fresh(page,"/campus-assistant");const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-window.innerWidth);evidence.push({name:"reflow-320",criticalSerious:0,violations:[],targetSize:0,unnamedControls:0,focusTraps:0,obscuredFocus:0,statusMessageFailures:0,overflowPixels:Math.max(0,overflow)});
  await browser.close();
}finally{preview?.kill("SIGTERM");}

const totals={criticalSerious:evidence.reduce((n,item)=>n+item.criticalSerious,0),targetSize:evidence.reduce((n,item)=>n+(item.targetSize||0),0),unnamedControls:evidence.reduce((n,item)=>n+item.unnamedControls,0),focusTraps:evidence.reduce((n,item)=>n+item.focusTraps,0),obscuredFocus:evidence.reduce((n,item)=>n+(item.obscuredFocus||0),0),statusMessageFailures:evidence.reduce((n,item)=>n+(item.statusMessageFailures||0),0),overflowPixels:evidence.reduce((n,item)=>n+(item.overflowPixels||0),0)};
if(Object.values(totals).some(Boolean))throw new Error(`Automated accessibility gate failed: ${JSON.stringify({totals,evidence})}`);
console.log(JSON.stringify({status:"ok",states:evidence.length,totals,evidence,manualAssistiveTechnologyStillExternal:true}));
