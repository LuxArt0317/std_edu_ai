import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import AxeBuilder from "@axe-core/playwright";
import {chromium} from "playwright-core";

const base=process.env.RESEARCH_PUBLIC_BASE||"http://127.0.0.1:4173",local=/127\.0\.0\.1|localhost/.test(base),chrome=process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let preview=null;
async function waitForServer(){for(let i=0;i<60;i++){try{const response=await fetch(base,{signal:AbortSignal.timeout(1000)});if(response.ok)return;}catch{}await delay(250);}throw new Error(`Public test server did not become ready: ${base}`);}
if(local){preview=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--host","127.0.0.1","--port","4173"],{stdio:"ignore"});}
const evidence=[];
try{
  await waitForServer();
  const browser=await chromium.launch({headless:true,executablePath:chrome});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",locale:"zh-TW"});
  const page=await context.newPage();
  async function audit(name,prepare){await page.goto(`${base}/`,{waitUntil:"networkidle"});if(prepare)await prepare(page);const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze();const blocking=result.violations.filter((item)=>item.impact==="critical"||item.impact==="serious");const unnamed=await page.locator("button:not([aria-label]),a:not([aria-label])").evaluateAll((items)=>items.filter((item)=>!(item.textContent||"").trim()&&!item.querySelector("img[alt]")).length);const traps=await page.locator('[role="dialog"][aria-modal="true"]').count()?await page.locator('[role="dialog"][aria-modal="true"] button, [role="dialog"][aria-modal="true"] a, [role="dialog"][aria-modal="true"] input, [role="dialog"][aria-modal="true"] select, [role="dialog"][aria-modal="true"] textarea').count()===0?1:0:0;evidence.push({name,criticalSerious:blocking.reduce((n,item)=>n+item.nodes.length,0),violations:blocking.map((item)=>item.id),unnamedControls:unnamed,focusTraps:traps});}
  await audit("public-home");
  await audit("assistant-open",async(p)=>{await p.getByRole("button",{name:"開啟 AI 校園助理"}).click();await p.getByRole("heading",{name:"STU AI 校園助理"}).waitFor();});
  await audit("campus-directory",async(p)=>{await p.getByRole("button",{name:/開啟校園導覽/}).click();await p.getByRole("heading",{name:"驗證地點與文字路線"}).waitFor();});
  await page.goto(`${base}/study/INVALID-A11Y-FIXTURE`,{waitUntil:"networkidle"});const unavailable=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze();const unavailableBlocking=unavailable.violations.filter((item)=>item.impact==="critical"||item.impact==="serious");evidence.push({name:"study-unavailable",criticalSerious:unavailableBlocking.reduce((n,item)=>n+item.nodes.length,0),violations:unavailableBlocking.map((item)=>item.id),unnamedControls:0,focusTraps:0});
  await page.setViewportSize({width:320,height:720});await page.goto(`${base}/`,{waitUntil:"networkidle"});const overflow=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-window.innerWidth);evidence.push({name:"reflow-320",criticalSerious:0,violations:[],unnamedControls:0,focusTraps:0,overflowPixels:Math.max(0,overflow)});
  await browser.close();
}finally{preview?.kill("SIGTERM");}
const totals={criticalSerious:evidence.reduce((n,item)=>n+item.criticalSerious,0),unnamedControls:evidence.reduce((n,item)=>n+item.unnamedControls,0),focusTraps:evidence.reduce((n,item)=>n+item.focusTraps,0),overflowPixels:evidence.reduce((n,item)=>n+(item.overflowPixels||0),0)};
if(Object.values(totals).some(Boolean))throw new Error(`Automated accessibility gate failed: ${JSON.stringify({totals,evidence})}`);
console.log(JSON.stringify({status:"ok",states:evidence.length,totals,evidence,manualAssistiveTechnologyStillExternal:true}));
