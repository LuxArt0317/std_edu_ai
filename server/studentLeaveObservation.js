import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {maxAnswerVerificationChecks} from '../src/services/assistantVerificationLimits.js';

const endpoint='/api/affairs-assistant';
const keyPattern=/^[^\s\p{Cc}]{40,4096}$/u;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const revision=/^[a-f0-9]{40}$/u;
const preview=/^https:\/\/stdedu-[a-z0-9]{9}-v1-d286\.vercel\.app$/u;
const routePattern=/^\/(?:school-affairs\/services\/leave(?:\/(?:history|archive|periods|edit\/[a-f0-9-]{36}))?)?$/u;
const requestKeys=['question','route','history','stream','consentedResearchUse'];
const scopeKeys=['ownerId','runId','origin','sourceRevision','nonce'];
const attemptKeys=['reads','evidenceDigest'];
const modelOperations=new Set(['compose_grounded_answer','answer_evidence_review','correct_grounded_answer']);
const maxModelOperations=maxAnswerVerificationChecks*2;
const lifetimeMs=120000;
export const leaveObservationHeader='X-Student-Leave-Observation';

const exact=(value,keys)=>Boolean(value)&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)??{},'value'));
const scopeValid=value=>scopeKeys.every(key=>typeof value[key]==='string')
  &&uuid.test(value.ownerId)&&uuid.test(value.runId)&&preview.test(value.origin)
  &&revision.test(value.sourceRevision)&&uuid.test(value.nonce);
export const studentLeaveObservationDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const studentLeaveRowsDigest=rows=>studentLeaveObservationDigest(rows.map(row=>
  Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]]))));
const requestDigest=(origin,request)=>studentLeaveObservationDigest({method:'POST',url:origin+endpoint,request});
const validRequest=request=>exact(request,requestKeys)&&typeof request.question==='string'
  &&request.question.length>=2&&request.question.length<=2000&&typeof request.route==='string'&&routePattern.test(request.route)
  &&Array.isArray(request.history)&&request.history.length<=6&&request.history.every(row=>exact(row,['role','content'])
    &&['user','assistant'].includes(row.role)&&typeof row.content==='string'&&row.content.length<=1000)
  &&request.stream===false&&request.consentedResearchUse===false;
const keyIsValid=key=>typeof key==='string'&&keyPattern.test(key);

function signature(domain,payload,key){
  const scopedKey=createHmac('sha256',key).update('stu:student-leave-observation:v1:'+domain).digest();
  return createHmac('sha256',scopedKey).update(payload).digest();
}
function seal(domain,value,key){
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
  return payload+'.'+signature(domain,payload,key).toString('base64url');
}
function unseal(domain,value,key){
  if(!keyIsValid(key)||typeof value!=='string'||value.length>4096||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value))return null;
  const [payload,mac]=value.split('.');
  const supplied=Buffer.from(mac,'base64url');
  if(supplied.length!==32||supplied.toString('base64url')!==mac||!timingSafeEqual(supplied,signature(domain,payload,key)))return null;
  try{return JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return null;}
}

export function createStudentLeaveProbe(scope,request,key,now=Date.now()){
  if(!exact(scope,scopeKeys)||!scopeValid(scope)||!validRequest(request)||!keyIsValid(key)||!Number.isSafeInteger(now))
    throw new Error('Invalid Student Leave observation request.');
  const binding={...scope,issuedAt:now,requestDigest:requestDigest(scope.origin,request)};
  return {binding,body:{...request,evaluationLeaveProbe:seal('request',binding,key)}};
}

function evidenceDigest(result){
  const {content,id,title,url,urls,provenance}=result.evidence;
  const {checkedAt,rules,...selected}=JSON.parse(content);
  void checkedAt;void rules;
  return studentLeaveObservationDigest({id,title,url,urls,provenance,dtoDigest:studentLeaveObservationDigest(selected)});
}

/** A normal request carries no probe. A protected probe can observe only the
 * real native reader for the authenticated, reserved disposable caller. */
export function openStudentLeaveObservation({body,identity,correlationId},env=process.env,now=Date.now()){
  if(env.VERCEL_ENV!=='preview'||!exact(body,[...requestKeys,'evaluationLeaveProbe'])||!uuid.test(correlationId))return null;
  const {evaluationLeaveProbe,...request}=body;
  if(!validRequest(request))return null;
  const key=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  const binding=unseal('request',evaluationLeaveProbe,key);
  if(!exact(binding,[...scopeKeys,'issuedAt','requestDigest'])||!scopeValid(binding)
    ||binding.origin!=='https://'+env.VERCEL_URL||binding.sourceRevision!==env.VERCEL_GIT_COMMIT_SHA
    ||binding.ownerId!==identity?.id||binding.runId!==identity?.runMarker||identity.email!=='evaluation.student@example.invalid'
    ||!Number.isSafeInteger(binding.issuedAt)||!Number.isSafeInteger(now)||binding.issuedAt>now+5000||now-binding.issuedAt>lifetimeMs
    ||binding.requestDigest!==requestDigest(binding.origin,request))return null;
  const attempts=[],completedModelOperations=[];
  let invalid=false,nativeChecked=false;
  return {
    async observe(reader){
      const reads=[];
      const attempt={reads,evidenceDigest:null};
      if(attempts.length>=maxAnswerVerificationChecks)invalid=true;
      else attempts.push(attempt);
      const value=await reader({observeRead(digest){
        if(reads.length>=2||!sha.test(digest))invalid=true;
        else reads.push(digest);
      }});
      try{attempt.evidenceDigest=evidenceDigest(value);}catch{invalid=true;}
      return value;
    },
    modelCompleted(operation){
      if(nativeChecked||completedModelOperations.length>=maxModelOperations||!modelOperations.has(operation))invalid=true;
      else completedModelOperations.push(operation);
    },
    nativeCheckCompleted(){
      if(nativeChecked||completedModelOperations.length)invalid=true;
      else nativeChecked=true;
    },
    finish(payload){
      if(invalid||!attempts.length||attempts.some(row=>!row.reads.length||!sha.test(row.evidenceDigest)))return null;
      return seal('receipt',{binding,correlationId,attempts,completedModelOperations,verificationMethod:nativeChecked?'native-exact':'model',
        responseDigest:studentLeaveObservationDigest({statusCode:200,body:payload})},key);
    },
  };
}

export function verifyStudentLeaveObservation({receipt,binding,correlationId,body},key){
  const observed=unseal('receipt',receipt,key);
  if(!exact(observed,['binding','correlationId','attempts','completedModelOperations','verificationMethod','responseDigest'])
    ||!exact(observed.binding,[...scopeKeys,'issuedAt','requestDigest'])
    ||Object.keys(observed.binding).some(name=>observed.binding[name]!==binding?.[name])
    ||!uuid.test(correlationId)||observed.correlationId!==correlationId
    ||observed.responseDigest!==studentLeaveObservationDigest({statusCode:200,body})
    ||!Array.isArray(observed.attempts)||observed.attempts.length<1||observed.attempts.length>maxAnswerVerificationChecks
    ||!Array.isArray(observed.completedModelOperations)||observed.completedModelOperations.length>maxModelOperations
    ||observed.completedModelOperations.some(operation=>!modelOperations.has(operation))
    ||!['native-exact','model'].includes(observed.verificationMethod)
    ||observed.verificationMethod==='native-exact'&&observed.completedModelOperations.length!==0
    ||observed.attempts.some(row=>!exact(row,attemptKeys)||!sha.test(row.evidenceDigest)
      ||!Array.isArray(row.reads)||row.reads.length<1||row.reads.length>2||row.reads.some(read=>!sha.test(read))))return null;
  return observed;
}
