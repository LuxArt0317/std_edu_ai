import {answerLinksSupported,validEvidence} from './answerVerificationModel.js';

const publicId=id=>id==='published-guidance'||typeof id==='string'&&/^(?:public-page|public-document):[^\s]+$/u.test(id);
const urlValue=value=>typeof value==='string'&&value.length>0&&value.length<=4000&&!/[\u0000-\u0020\u007f]/u.test(value);
function publicEvidence(evidence){
 try{return validEvidence(evidence)&&evidence.some(source=>source.id!=='published-guidance')&&evidence.every(source=>publicId(source.id)
  &&(source.url===undefined||urlValue(source.url))&&(source.urls===undefined||Array.isArray(source.urls)&&source.urls.every(urlValue)));}
 catch{return false;}
}
function draftShape(candidate,evidence){
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||!['answered','abstained'].includes(candidate.status)
  ||typeof candidate.answer!=='string'||!candidate.answer.trim()||candidate.answer.length>8000
  ||'verification' in candidate||candidate.proposedAction!=null||'account' in candidate||'accountSnapshot' in candidate||!Array.isArray(candidate.citations))return false;
 return candidate.citations.every(citation=>citation&&typeof citation==='object'&&typeof citation.chunkId==='string'&&urlValue(citation.url)&&evidence.some(source=>source.id===citation.chunkId
  &&[source.url,...(source.urls||[])].includes(citation.url)));
}
function invalidDraft(){return Object.assign(new Error('Saved public source correction did not produce a safe draft.'),{code:'SAVED_PUBLIC_SOURCE_INVALID_DRAFT'});}

/** Correct one malformed public link before discarding already-read evidence.
 * Every returned object is still a draft: the caller must independently verify it. */
export async function composeSavedPublicSource(context,{compose,repair,onActivity,now=Date.now}){
 const evidence=context?.evidence,deadline=context?.deadline;
 if(typeof compose!=='function'||typeof repair!=='function'||!Number.isFinite(deadline)||!publicEvidence(evidence))
  throw Object.assign(new TypeError('Saved source composition requires public evidence, a finite deadline and compose/repair dependencies.'),{code:'PUBLIC_SOURCE_CONTEXT_REQUIRED'});
 const cap=()=>Math.min(deadline-22000,now()+28000);
 const emit=step=>{try{const pending=onActivity?.(step);if(pending&&typeof pending.catch==='function')pending.catch(()=>{});}catch{/* Presentation cannot approve or reject a draft. */}};
 let failure;
 try{
  const candidate=await compose({...context,evidence,deadline:cap()});
  if(!draftShape(candidate,evidence)||!answerLinksSupported(candidate.answer,evidence))throw invalidDraft();
  return candidate;
 }catch(error){failure=error;}
 const candidate=Object.getOwnPropertyDescriptor(failure||{},'unverifiedCandidate')?.value;
 if(failure?.code!=='CORRECTION_UNSUPPORTED'||failure.invalidLinks!==true||failure.invalidSourceIds!==false
  ||!draftShape(candidate,evidence)||candidate.status!=='answered'||!candidate.citations.length||answerLinksSupported(candidate.answer,evidence))throw failure;
 const allowed=[...new Set(evidence.flatMap(source=>[source.url,...(source.urls||[])]).filter(urlValue))];
 if(!allowed.length||cap()-now()<750)throw failure;
 const feedback=[...(context.feedback||[]),
  'The draft used an unsupported link. Correct its Markdown destinations using only these exact supplied URL values: '+JSON.stringify(allowed)+'. Do not invent or complete a route. Remove a link if none of the supplied destinations matches. Recheck claims against the same evidence; do not introduce new facts or change scope merely to fix a link. This is an unverified correction, not approval.'];
 const event={kind:'saved-source-link-correction',label:'Correcting saved source links',detail:'Checking the draft against destinations supplied by the same public sources.',status:'running'};
 emit(event);
 try{
  const corrected=await repair({...context,evidence,candidate,feedback,deadline:cap()});
  if(corrected===candidate||!draftShape(corrected,evidence)||!answerLinksSupported(corrected.answer,evidence))throw invalidDraft();
  emit({...event,status:'complete',detail:'The corrected draft still needs an independent evidence check.'});
  return corrected;
 }catch(error){
  emit({...event,status:'unavailable',detail:'The source-link correction did not produce a usable draft.'});
  throw error;
 }
}
