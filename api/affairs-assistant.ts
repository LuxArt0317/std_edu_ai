import publicAssistant from './research-assistant.ts';
import { questionKind } from '../server/schoolWebSearch.js';
import { answerDirectoryQuestion } from '../server/schoolAffairsDirectory.js';

type ApiRequest = {method?:string;body?:unknown;headers:Record<string,string|string[]|undefined>;socket?:{remoteAddress?:string}};
type ApiResponse = {status:(code:number)=>ApiResponse;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
export const config = {maxDuration:60};
const requestWindows = new Map<string,number[]>();
const env = () => ({url:process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,key:process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY});
function value(input:string|string[]|undefined) {return Array.isArray(input)?input[0]:input;}
function personal(question:string) {return questionKind(question).personal || /\b(?:my|mine|me)\b.{0,45}\b(?:subjects?|courses?|classes?|grades?|schedule|timetable|attendance|fees?|announcements?|account|email|student record|program|major|department)\b|\b(?:who am i|signed in as)\b|我的.{0,15}(?:課程|科目|成績|課表|出席|學號|帳號|公告|科系|系所)/i.test(question);}

export default async function handler(request:ApiRequest,response:ApiResponse) {
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(request.method!=='POST') {response.setHeader('Allow','POST');response.status(405).json({error:'Method not allowed'});return;}
  const body=typeof request.body==='string' ? (()=>{try{return JSON.parse(request.body);}catch{return null;}})() : request.body;
  const input=body && typeof body==='object' && !Array.isArray(body) ? body as Record<string,unknown> : null;
  const question=typeof input?.question==='string'?input.question.trim():'';
  if(question.length<2||question.length>2000) {response.status(400).json({error:'Provide a question between 2 and 2,000 characters.'});return;}
  const {url,key}=env();
  if(!url||!key) {response.status(503).json({error:'School Affairs sign-in is not configured.'});return;}
  const authorization=value(request.headers.authorization);
  if(!authorization?.startsWith('Bearer ')||authorization.length<32) {response.status(401).json({error:'Sign in to School Affairs again.'});return;}
  let account:{id:string;email?:string};
  try {
    const verified=await fetch(`${url.replace(/\/$/,'')}/auth/v1/user`,{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(8000)});
    if(!verified.ok) {response.status(401).json({error:'Your School Affairs session expired. Please sign in again.'});return;}
    const user=await verified.json();
    if(typeof user.id!=='string'||!user.id) {response.status(401).json({error:'Your School Affairs session is invalid.'});return;}
    account={id:user.id,email:typeof user.email==='string'?user.email:undefined};
  } catch {response.status(503).json({error:'School Affairs sign-in could not be checked.'});return;}
  const now=Date.now(),active=(requestWindows.get(account.id)||[]).filter(time=>time>now-60_000);
  active.push(now);requestWindows.set(account.id,active);
  if(active.length>24){response.status(429).json({error:'Too many questions. Please wait a moment.'});return;}
  if(!personal(question)) {
    // Public research receives no JWT, account ID, email or Nexus context.
    await publicAssistant({...request,headers:{...request.headers,authorization:undefined},body:{question,history:[],images:input?.images,route:input?.route,consentedResearchUse:false}},response);
    return;
  }
  if(Array.isArray(input?.images) && input.images.length) {response.status(400).json({error:'For private account questions, remove the image and ask using text. Images are not stored as account records.'});return;}
  const chinese=/[\u3400-\u9fff]/.test(question);
  const accountOnly=/\b(?:my (?:google |school affairs )?(?:account|email)|who am i)\b|我的(?:帳號|電子郵件)/i.test(question);
  const service=answerDirectoryQuestion('我的功課表')!;
  const answer=accountOnly
    ? (chinese?`您目前的 stu.best 帳號是 ${account.email || '已登入的 Google 帳號'}。此登入不會匯入正式校務資料。`:`Your stu.best account is ${account.email || 'the signed-in Google account'}. This sign-in does not import official university records.`)
    : (chinese?`stu.best 沒有連接校方的正式選課、成績、課表或個人公告，因此無法確認您的個人資料。您可以從[我的功課表](/school-affairs/menu/aca/query)前往[校方服務](${service.citations[0].url})，另行登入後查詢。`:`stu.best is not connected to official university enrollments, grades, schedules or personal announcements, so I cannot verify those here. Open [My course schedule](/school-affairs/menu/aca/query) or the [official service](${service.citations[0].url}) and sign in there separately.`);
  response.status(200).json({status:'answered',answer,citations:accountOnly?[]:service.citations,suggestedQuestions:[],grounding:{source:'account',webSearched:false,checkedAt:new Date().toISOString()},activity:[{kind:'account',label:'Verified the stu.best account session',detail:'No university or Nexus records were accessed',status:'complete'}]});
}
