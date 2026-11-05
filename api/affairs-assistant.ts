import { questionKind } from '../server/schoolWebSearch.js';
import { answerPrivateAffairsQuestion } from '../server/affairsAnswer.js';
import { AffairsWorkspaceError, loadAffairsSnapshot, verifyAffairsToken } from '../server/affairsWorkspace.js';

type ApiRequest = {method?:string;body?:unknown;headers:Record<string,string|string[]|undefined>};
type ApiResponse = {status:(code:number)=>ApiResponse;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
export const config = {maxDuration:60};
const requestWindows = new Map<string,number[]>();
function value(input:string|string[]|undefined) {return Array.isArray(input)?input[0]:input;}
function personal(question:string) {
  return questionKind(question).personal || /\b(?:my|mine|me|i|our)\b.{0,75}\b(?:subjects?|courses?|classes?|grades?|schedule|timetable|attendance|fees?|payments?|balance|announcements?|notices?|account|email|student|program|major|department|tasks?|requests?|record|profile)\b|\b(?:who am i|signed in as|add (?:a )?task|create (?:a )?task|remind me|complete (?:my |the )?task|submit (?:a )?request|publish (?:an? )?announcement)\b|我的.{0,20}(?:課程|科目|成績|課表|出席|學號|帳號|公告|科系|系所|任務|待辦|申請|費用)|(?:新增|建立|完成|提交|發布).{0,25}(?:任務|待辦|申請|公告)/i.test(question);
}

export default async function handler(request:ApiRequest,response:ApiResponse) {
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='POST') {response.setHeader('Allow','POST');response.status(405).json({error:'Method not allowed'});return;}
  const body=typeof request.body==='string' ? (()=>{try{return JSON.parse(request.body);}catch{return null;}})() : request.body;
  const input=body && typeof body==='object' && !Array.isArray(body) ? body as Record<string,unknown> : null;
  const question=typeof input?.question==='string'?input.question.trim():'';
  if(question.length<2||question.length>2000) {response.status(400).json({error:'Provide a question between 2 and 2,000 characters.'});return;}
  let account;
  try {
    const authorization=value(request.headers.authorization);
    account=await verifyAffairsToken(authorization?.startsWith('Bearer ')?authorization.slice(7):'');
  } catch(error) {
    response.status(error instanceof AffairsWorkspaceError?error.status:503).json({error:error instanceof AffairsWorkspaceError?error.message:'School Affairs sign-in could not be checked.'});return;
  }
  const now=Date.now(),active=(requestWindows.get(account.user.id)||[]).filter(time=>time>now-60_000);
  active.push(now);requestWindows.set(account.user.id,active);
  if(active.length>24){response.status(429).json({error:'Too many questions. Please wait a moment.'});return;}
  if(!personal(question)) {
    // Separate deployment function; only public input is forwarded, never the account token.
    try {
      const research=await fetch('https://stu.best/api/research-assistant',{
        method:'POST',signal:AbortSignal.timeout(55_000),
        headers:{'Content-Type':'application/json',...(value(request.headers['x-forwarded-for'])?{'X-Forwarded-For':value(request.headers['x-forwarded-for'])!}:{})},
        body:JSON.stringify({question,history:[],images:input?.images,route:input?.route,consentedResearchUse:false}),
      });
      const result=await research.json().catch(()=>null);
      if(!result || typeof result!=='object' || (!research.ok && typeof result.error!=='string')) {response.status(502).json({error:'School research returned an invalid response.'});return;}
      response.status(research.status).json(result);
    } catch {response.status(503).json({error:'School research is temporarily unavailable. Please try again.'});}
    return;
  }
  if(Array.isArray(input?.images) && input.images.length) {response.status(400).json({error:'For private account questions, remove the image and ask using text. Images are not stored as account records.'});return;}
  const history=Array.isArray(input?.history)?input.history.slice(-4).flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const entry=item as Record<string,unknown>;
    return ['user','assistant'].includes(String(entry.role))&&typeof entry.content==='string'?[{role:String(entry.role),content:entry.content.slice(0,1000)}]:[];
  }):[];
  try {
    const snapshot=await loadAffairsSnapshot(account);
    const answer=await answerPrivateAffairsQuestion(question,snapshot,history);
    response.status(200).json(answer);
  } catch(error) {
    response.status(error instanceof AffairsWorkspaceError?error.status:503).json({error:error instanceof AffairsWorkspaceError?error.message:'Your School Affairs records could not be checked.'});
  }
}
