import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {maxAnswerVerificationChecks} from '../src/services/assistantVerificationLimits.js';

export const teachingObservationHeader='X-Teaching-Feedback-Observation';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[a-f0-9]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const preview=/^https:\/\/stdedu-[a-z0-9]{9}-v1-d286\.vercel\.app$/u;
const routes=['/school-affairs/services/7-5','/school-affairs/services/7-6'];
const views=['survey','immediate'];
const operations=['compose_grounded_answer','answer_evidence_review','correct_grounded_answer'];
const requestKeys=['question','route','history','stream','consentedResearchUse'];
const scopeKeys=['ownerId','runId','origin','sourceRevision','nonce'];
const bindingKeys=[...scopeKeys,'issuedAt','requestDigest'];
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const keyValid=key=>typeof key==='string'&&/^[^\s\p{Cc}]{40,4096}$/u.test(key);
const scopeValid=scope=>exact(scope,scopeKeys)&&scopeKeys.every(name=>typeof scope[name]==='string')
  &&[scope.ownerId,scope.runId,scope.nonce].every(value=>uuid.test(value))
  &&preview.test(scope.origin)&&/^[a-f0-9]{40}$/u.test(scope.sourceRevision);
const requestValid=request=>exact(request,requestKeys)&&typeof request.question==='string'
  &&request.question.length>=2&&request.question.length<=2000&&routes.includes(request.route)
  &&Array.isArray(request.history)&&request.history.length===0&&request.stream===false&&request.consentedResearchUse===false;

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export const teachingObservationDigest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const requestDigest=(origin,request)=>teachingObservationDigest({method:'POST',url:origin+'/api/affairs-assistant',request});
const sign=(kind,encoded,key)=>createHmac('sha256',key).update('stu:teaching-observation:v1:'+kind+':'+encoded).digest();
function seal(kind,value,key){
  const encoded=Buffer.from(JSON.stringify(value)).toString('base64url');
  return encoded+'.'+sign(kind,encoded,key).toString('base64url');
}
function unseal(kind,value,key){
  if(!keyValid(key)||typeof value!=='string'||value.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value))return null;
  const [payload,mac]=value.split('.'),decoded=Buffer.from(mac,'base64url');
  if(decoded.length!==32||decoded.toString('base64url')!==mac||!timingSafeEqual(decoded,sign(kind,payload,key)))return null;
  try{return JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return null;}
}

function normalizeInstants(value){
  if(Array.isArray(value))return value.map(normalizeInstants);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>
    [key,['submittedAt','reviewedAt','opensAt','closesAt'].includes(key)&&typeof entry==='string'
      ?new Date(entry).toISOString():normalizeInstants(entry)]));
  return value;
}
export const teachingReadDigest=(view,dto)=>teachingObservationDigest({view,dto:normalizeInstants(dto)});
export const teachingProjectionDigest=projection=>teachingObservationDigest(normalizeInstants(projection));
function projection(result){
  const {collection,selection,readState,complete,provenance,capability,views}=JSON.parse(result.evidence.content);
  return {collection,selection,readState,complete,provenance,capability,views};
}

export function createTeachingProbe(scope,request,key,now=Date.now()){
  if(!scopeValid(scope)||!requestValid(request)||!keyValid(key)||!Number.isSafeInteger(now))
    throw new Error('Invalid teaching observation request.');
  const binding={...scope,issuedAt:now,requestDigest:requestDigest(scope.origin,request)};
  return {binding,body:{...request,evaluationTeachingProbe:seal('request',binding,key)}};
}

export function openTeachingObservation({body,identity,correlationId},env=process.env,now=Date.now()){
  if(env.VERCEL_ENV!=='preview'||!uuid.test(correlationId)||!exact(body,[...requestKeys,'evaluationTeachingProbe']))return null;
  const {evaluationTeachingProbe,...request}=body;
  if(!requestValid(request))return null;
  const key=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,binding=unseal('request',evaluationTeachingProbe,key);
  if(!exact(binding,bindingKeys))return null;
  const {issuedAt,requestDigest:declaredDigest,...scope}=binding;
  if(!scopeValid(scope)||scope.origin!=='https://'+env.VERCEL_URL||scope.sourceRevision!==env.VERCEL_GIT_COMMIT_SHA
    ||scope.ownerId!==identity?.id||scope.runId!==identity?.runMarker
    ||!['evaluation.student@example.invalid','evaluation.other.'+scope.runId+'@example.invalid'].includes(identity.email)
    ||!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(now)||issuedAt>now+5000||now-issuedAt>120000
    ||declaredDigest!==requestDigest(scope.origin,request))return null;

  const attempts=[],modelOperations=[];
  let invalid=false;
  return Object.freeze({
    async observe(read){
      const attempt={reads:[],projectionDigest:null};
      if(attempts.length>=2)invalid=true;
      else attempts.push(attempt);
      const result=await read({observeRead(view,dto){
        if(!views.includes(view)||attempt.reads.some(row=>row.view===view)||dto?.userId!==scope.ownerId){invalid=true;return;}
        try{attempt.reads.push({view,digest:teachingReadDigest(view,dto)});}catch{invalid=true;}
      }});
      try{attempt.projectionDigest=teachingProjectionDigest(projection(result));}catch{invalid=true;}
      return result;
    },
    modelCompleted(operation){
      if(!operations.includes(operation)||modelOperations.length>=maxAnswerVerificationChecks*2)invalid=true;
      else modelOperations.push(operation);
    },
    finish(body,expectsRead){
      if(invalid||expectsRead!==Boolean(attempts.length)||!expectsRead&&modelOperations.length
        ||attempts.some(row=>!sha.test(row.projectionDigest)))return null;
      return seal('response',{binding,correlationId,attempts,modelOperations,
        responseDigest:teachingObservationDigest({statusCode:200,body})},key);
    },
  });
}

export function verifyTeachingObservation({receipt,binding,correlationId,body},key){
  const observed=unseal('response',receipt,key);
  if(!exact(observed,['binding','correlationId','attempts','modelOperations','responseDigest'])
    ||!exact(observed.binding,bindingKeys)||bindingKeys.some(name=>observed.binding[name]!==binding?.[name])
    ||!uuid.test(correlationId)||observed.correlationId!==correlationId
    ||observed.responseDigest!==teachingObservationDigest({statusCode:200,body})
    ||!Array.isArray(observed.attempts)||observed.attempts.length>2
    ||observed.attempts.some(row=>!exact(row,['reads','projectionDigest'])||!sha.test(row.projectionDigest)
      ||!Array.isArray(row.reads)||row.reads.length>2||new Set(row.reads.map(read=>read?.view)).size!==row.reads.length
      ||row.reads.some(read=>!exact(read,['view','digest'])||!views.includes(read.view)||!sha.test(read.digest)))
    ||!Array.isArray(observed.modelOperations)||observed.modelOperations.length>maxAnswerVerificationChecks*2
    ||observed.modelOperations.some(operation=>!operations.includes(operation)))return null;
  return observed;
}
