import {composeEvidenceAnswer,verifyEvidenceAnswer} from './answerVerificationModel.js';

/** Rephrase trusted public facts, never an evaluation reference or private snapshot. */
export async function conversationalGuidance(question,history,reply,{deadline=Date.now()+40000,onProgress=()=>{}}={}){
 if(!process.env.OPENAI_API_KEY||!reply?.answer||reply.proposedAction)return reply;
 const evidence=publicGuidanceEvidence(reply);
 const step=(status,detail)=>({kind:'conversational-guidance',label:'Preparing a conversational answer',detail,status});
 onProgress(step('running','Using the checked facts and your current question.'));
 try{
  const candidate=await composeEvidenceAnswer({question,history,evidence,deadline,
   feedback:['Explain only what the current turn needs. This factual brief is not a script: write a natural reply, preserve its scope and necessary qualifications, and use conversation context only for references and tone. Do not claim a private record was checked.']});
  const review=await verifyEvidenceAnswer({question,candidate,evidence,deadline});
  if(!review.ok)throw Object.assign(Error('Composition did not pass evidence review'),{code:review.reason});
  const activity=step('complete','Checked the new wording against the supplied public facts.');onProgress(activity);
  return {...reply,answer:candidate.answer,citations:candidate.citations,suggestedQuestions:candidate.suggestedQuestions||[],
   verification:{status:'verified',attempts:1},activity:[...(reply.activity||[]),activity]};
 }catch(error){
  console.info('Conversational guidance retained',{reason:typeof error?.code==='string'&&/^[a-zA-Z_]{1,60}$/.test(error.code)?error.code:'composition_unavailable',invalidLinks:error?.invalidLinks===true,invalidSourceIds:error?.invalidSourceIds===true});
  const activity=step('unavailable','Kept the checked guidance because the new wording could not be verified.');onProgress(activity);
  return {...reply,activity:[...(reply.activity||[]),activity]};
 }
}

/** Only server-authored public briefs may supply these local destinations. */
export function publicGuidanceEvidence(reply){
 const links=(reply.citations||[]).map(({title,url})=>({title,url}));
 for(const match of reply.answer.matchAll(/\[([^\]\n]+)\]\(([^\s)]+)\)/gu)){
  const url=match[2];
  if((url.startsWith('/')&&!url.startsWith('//')||url.startsWith('https://stu.best/'))&&!links.some(link=>link.url===url))links.push({title:match[1],url});
 }
 const originalUrls=links.map(item=>item.url).filter(url=>typeof url==='string');
 const urls=[...new Set(originalUrls.flatMap(url=>url.startsWith('/')?[url,new URL(url,'https://stu.best').href]:[url]))];
 return [{id:'published-guidance',title:'Checked public service guidance',urls,url:urls[0],
  content:JSON.stringify({facts:reply.answer,links,scope:'Public instructions only; no private records were read.'})}];
}
