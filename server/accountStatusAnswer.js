import {runAnswerVerification} from './answerVerification.js';
import {accountStatusIntent} from './accountStatusIntent.js';

const evidenceId='account:accountIdentity';
const workspace='/school-affairs';
const login=workspace+'/login';
const chinese=question=>(question.match(/\p{Script=Han}/gu)?.length??0)>(question.match(/[A-Za-z]{2,}/gu)?.length??0);
const knownEmail=value=>typeof value==='string'&&value.length<=254&&
  /^[A-Z0-9.!#$%&'*+/=?^_{}|~-]{1,64}@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/iu.test(value);
const link=(title,url)=>'['+title+']('+url+')';
const local={source:'account',webSearched:false};

export function guestAccountStatusAnswer(question){
  const zh=chinese(question);
  const title=zh?'使用 Google 登入校務系統':'Sign in to School Affairs with Google';
  const summary=zh?'這個對話目前沒有已驗證的校務登入。':'This chat has no verified School Affairs session.';
  return {status:'handoff',answer:summary+'\n\n'+link(title,login),
    citations:[{chunkId:'directory:account-sign-in',title,url:login,sourceName:'School Affairs sign-in'}],
    suggestedQuestions:[],grounding:{source:'directory',webSearched:false}};
}

function format(question,mode,packet){
  if(packet.length!==1||packet[0].id!==evidenceId||packet[0].url!==workspace)throw new TypeError('Invalid sign-in evidence.');
  const {email}=JSON.parse(packet[0].content);
  const zh=chinese(question);
  const title=zh?'開啟校務系統':'Open School Affairs';
  const state=zh?'你已使用 Google 登入 stu.best。':'You’re signed in to stu.best through Google.';
  const details=mode==='email'
    ?email===null?(zh?'登入身分未提供電子郵件地址。':'No email address was returned with this sign-in.')
      :(zh?'登入電子郵件為 ':'Your sign-in email is ')+'\x60'+email+'\x60'+(zh?'。':'.')
    :'';
  return {status:'answered',answer:[state,details,link(title,workspace)].filter(Boolean).join('\n\n'),
    citations:[{chunkId:evidenceId,title,url:workspace,sourceName:'Verified School Affairs sign-in'}],
    suggestedQuestions:[],grounding:local};
}

/** Use the same caller JWT identity that powers the browser indicator. Project
 * no profile, student ID, OAuth token or email for a status-only question. */
export async function answerAccountStatus({account,question,route,deadline,onProgress}){
  const mode=accountStatusIntent(question,route);
  if(!mode||!account.user.id)throw new TypeError('No verified account identity.');
  const email=mode==='email'&&knownEmail(account.user.email)?account.user.email:null;
  const packet=[{id:evidenceId,url:workspace,content:JSON.stringify({email})}];
  const draft=evidence=>format(question,mode,evidence);
  const step={kind:'account-read:accountIdentity:1',label:'Checked School Affairs sign-in',
    detail:'Used the verified sign-in for this account.',status:'complete'};
  try{onProgress?.(step);}catch{/* Closed response stream. */}
  return runAnswerVerification({
    question,initialAnswer:{...draft(packet),activity:[step]},deadline,onProgress,
    loadEvidence:async()=>packet,
    verify:async ({candidate,evidence})=>{
      const verified=draft(evidence);
      return {ok:verified.answer===candidate.answer&&JSON.stringify(verified.citations)===JSON.stringify(candidate.citations)};
    },
    repair:async ({evidence})=>({...draft(evidence),activity:[step]}),
  });
}
