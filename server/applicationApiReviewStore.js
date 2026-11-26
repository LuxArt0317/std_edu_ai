import {createHmac,timingSafeEqual} from 'node:crypto';
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
function signingKey(){const key=process.env.ASSISTANT_API_SIGNING_SECRET||process.env.OPENAI_API_KEY;if(typeof key!=='string'||key.length<24)throw Object.assign(Error('Server action signing is not configured.'),{status:503});return key;}
function signature(kind,payload){return createHmac('sha256',signingKey()).update('stu-application-api:'+kind+'\n'+JSON.stringify(stable(payload))).digest('hex');}
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/u.test(a)&&/^[a-f0-9]{64}$/u.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
export function signApiReview(record){const payload={...record};delete payload.signature;return {...payload,signature:signature('review',payload)};}
export function validApiReview(record){if(!record||typeof record!=='object')return false;const {signature:given,...payload}=record;return equal(given,signature('review',payload));}
export function signApiReceipt(userId,requestId,receipt){return {...receipt,signature:signature('receipt',{userId,requestId,receipt})};}
export function verifiedApiReceipt(userId,requestId,signed){if(!signed||typeof signed!=='object')throw Object.assign(Error('The API receipt is unavailable.'),{status:503});const {signature:given,...receipt}=signed;if(!equal(given,signature('receipt',{userId,requestId,receipt})))throw Object.assign(Error('The API receipt signature could not be verified.'),{status:503});return receipt;}
export async function apiReviewRpc(account,name,payload,deadline=Date.now()+7000){
 if(!['assistant_api_create_review','assistant_api_claim_review','assistant_api_finish_review'].includes(name)||!Number.isFinite(deadline)||deadline<=Date.now())throw Object.assign(Error('Action review storage is unavailable.'),{status:503});
 const result=await fetch(new URL('/rest/v1/rpc/'+name,account.url),{method:'POST',headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(Math.max(1,Math.min(7000,deadline-Date.now()))),redirect:'error'});
 if(!result.ok){const status=[401,403,404,409,429].includes(result.status)?result.status:503;throw Object.assign(Error(status===409?'This action is already running or needs a new review.':'Action review storage is unavailable; apply its migration before enabling production API actions.'),{status});}
 const text=await result.text();if(Buffer.byteLength(text)>64000)throw Object.assign(Error('Action review response exceeded its limit.'),{status:503});return JSON.parse(text);
}
