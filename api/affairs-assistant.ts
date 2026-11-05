import { questionKind } from '../server/schoolWebSearch.js';
import { answerPrivateAffairsQuestion } from '../server/affairsAnswer.js';
import { AffairsWorkspaceError, loadAffairsSnapshot, verifyAffairsToken } from '../server/affairsWorkspace.js';
import { createAssistantStream } from '../server/assistantStream.js';
import { readAssistantReply } from '../src/services/assistantStreamReader.js';

type ApiRequest = {method?:string;body?:unknown;headers:Record<string,string|string[]|undefined>};
type ApiResponse = {status:(code:number)=>ApiResponse;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void;write?:(chunk:string)=>void;end?:()=>void;flushHeaders?:()=>void};
export const config = {maxDuration:60};
const requestWindows = new Map<string,number[]>();
function value(input:string|string[]|undefined) {return Array.isArray(input)?input[0]:input;}
function personal(question:string) {
  return questionKind(question).personal || /\b(?:my|mine|me|i|our)\b.{0,75}\b(?:subjects?|courses?|classes?|grades?|schedule|timetable|attendance|fees?|payments?|balance|announcements?|notices?|account|email|student|program|major|department|tasks?|requests?|record|profile|materials?|moodle|dtm)\b|\b(?:dtm|moodle|materials?)\b.{0,60}\b(?:i|my|mine)\b|\b(?:who am i|signed in as|add (?:a )?task|create (?:a )?task|remind me|complete (?:my |the )?task|submit (?:a )?request|publish (?:an? )?announcement)\b|我的.{0,20}(?:課程|科目|成績|課表|出席|學號|帳號|公告|科系|系所|任務|待辦|申請|費用|教材)|我.{0,20}教材|(?:新增|建立|完成|提交|發布).{0,25}(?:任務|待辦|申請|公告)/i.test(question);
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
  const stream=createAssistantStream(input?.stream===true,response);
  if(!personal(question)) {
    // Separate deployment function; only public input is forwarded, never the account token.
    stream.progress('public','Checking public school information','This question does not need your account records.');
    try {
      const research=await fetch('https://stu.best/api/research-assistant',{
        method:'POST',signal:AbortSignal.timeout(55_000),
        headers:{'Content-Type':'application/json',...(value(request.headers['x-forwarded-for'])?{'X-Forwarded-For':value(request.headers['x-forwarded-for'])!}:{})},
        body:JSON.stringify({question,history:[],images:input?.images,route:input?.route,consentedResearchUse:false,stream:stream.enabled}),
      });
      const result=await readAssistantReply(research,step=>stream.progress(step.kind,step.label,step.detail,step.status)) as Record<string,unknown>|null;
      if(!result || typeof result!=='object' || (!research.ok && typeof result.error!=='string')) {stream.send(502,{error:'School research returned an invalid response.'});return;}
      stream.progress('public','Checked public information','The public school lookup finished.','complete');
      stream.send(research.status,result);
    } catch {stream.send(503,{error:'School research is temporarily unavailable. Please try again.'});}
    return;
  }
  if(Array.isArray(input?.images) && input.images.length) {stream.send(400,{error:'For private account questions, remove the image and ask using text. Images are not stored as account records.'});return;}
  const history=Array.isArray(input?.history)?input.history.slice(-4).flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const entry=item as Record<string,unknown>;
    return ['user','assistant'].includes(String(entry.role))&&typeof entry.content==='string'?[{role:String(entry.role),content:entry.content.slice(0,1000)}]:[];
  }):[];
  try {
    stream.progress('account','Loading your account records','Checking School Affairs and DTM records for this signed-in Google account.');
    const snapshot=await loadAffairsSnapshot(account);
    stream.progress('account','Loaded your account records','Only records linked to this Google account were read.','complete');
    stream.progress('answer','Preparing your answer','Checking the account data and any requested stu.best action.');
    const answer=await answerPrivateAffairsQuestion(question,snapshot,history);
    stream.progress('answer','Answer ready','The answer is based on your account records.','complete');
    stream.send(200,answer);
  } catch(error) {
    stream.send(error instanceof AffairsWorkspaceError?error.status:503,{error:error instanceof AffairsWorkspaceError?error.message:'Your School Affairs records could not be checked.'});
  }
}
