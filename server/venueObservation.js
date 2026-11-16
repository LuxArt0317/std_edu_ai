import {createHmac,timingSafeEqual} from 'node:crypto';
import {internshipObservationDigest as digest} from './internshipObservation.js';

const route='/school-affairs/services/44-1';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const hash=/^[a-f0-9]{64}$/u;
const preview=/^https:\/\/stdedu-[a-z0-9]{9}-v1-d286\.vercel\.app$/u;
const requestKeys=['question','route','history','stream','consentedResearchUse'];
const scopeKeys=['ownerId','runId','origin','sourceRevision','nonce'];
const bindingKeys=[...scopeKeys,'issuedAt','requestDigest'];
const HMACKey=/^[^\s\p{Cc}]{40,4096}$/u;
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const keyValid=key=>typeof key==='string'&&HMACKey.test(key);
const scopeValid=scope=>exact(scope,scopeKeys)&&scopeKeys.every(key=>typeof scope[key]==='string')
  &&[scope.ownerId,scope.runId,scope.nonce].every(value=>uuid.test(value))
  &&preview.test(scope.origin)&&/^[a-f0-9]{40}$/u.test(scope.sourceRevision);
const requestValid=request=>exact(request,requestKeys)&&typeof request.question==='string'&&request.question.length>=2
  &&request.question.length<=2000&&request.route===route&&Array.isArray(request.history)&&request.history.length===0
  &&typeof request.stream==='boolean'&&request.consentedResearchUse===false;
const requestDigest=(origin,request)=>digest({method:'POST',url:origin+'/api/affairs-assistant',request});
const mac=(kind,payload,key)=>createHmac('sha256',key).update('stu:venue-observation:v1:'+kind+':'+payload).digest();
function seal(kind,value,key){
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
  return payload+'.'+mac(kind,payload,key).toString('base64url');
}
function open(kind,value,key){
  if(!keyValid(key)||typeof value!=='string'||value.length>4096||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value))return null;
  const [payload,signature]=value.split('.'),bytes=Buffer.from(signature,'base64url');
  if(bytes.length!==32||bytes.toString('base64url')!==signature||!timingSafeEqual(bytes,mac(kind,payload,key)))return null;
  try{return JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return null;}
}
const readProof=value=>exact(value,['readDigest','evidenceDigest'])&&hash.test(value.readDigest)&&hash.test(value.evidenceDigest);
export const venueObservationHeader='X-Venue-Observation';
export const venueBrowserObservationEvent='evaluation-venue-observation';

export function createVenueProbe(scope,request,key,now=Date.now()){
  if(!scopeValid(scope)||!requestValid(request)||!keyValid(key)||!Number.isSafeInteger(now))
    throw new Error('Invalid protected Venue read probe.');
  const binding={...scope,issuedAt:now,requestDigest:requestDigest(scope.origin,request)};
  return {binding,body:{...request,evaluationVenueProbe:seal('request',binding,key)}};
}

export function openVenueObservation({body,identity,correlationId},env=process.env,now=Date.now()){
  if(env.VERCEL_ENV!=='preview'||!exact(body,[...requestKeys,'evaluationVenueProbe'])||!uuid.test(correlationId))return null;
  const {evaluationVenueProbe,...request}=body;
  if(!requestValid(request))return null;
  const key=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,binding=open('request',evaluationVenueProbe,key);
  if(!exact(binding,bindingKeys))return null;
  const {issuedAt,requestDigest:declaredDigest,...scope}=binding;
  if(!scopeValid(scope)||scope.origin!=='https://'+env.VERCEL_URL||scope.sourceRevision!==env.VERCEL_GIT_COMMIT_SHA
    ||scope.ownerId!==identity?.id||scope.runId!==identity?.runMarker
    ||!['evaluation.student@example.invalid','evaluation.other.'+scope.runId+'@example.invalid'].includes(identity.email)
    ||!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(now)||issuedAt>now+5000||now-issuedAt>120000
    ||declaredDigest!==requestDigest(scope.origin,request))return null;

  let read=null,verified=false,invalid=false;
  return {
    record(readback,evidence){
      if(read||!readback||readback.ownerId!==scope.ownerId){invalid=true;return;}
      read={readDigest:digest(readback),evidenceDigest:digest(evidence)};
    },
    nativeVerified(){
      if(!read||verified)invalid=true;
      else verified=true;
    },
    finish(body,expectsRead){
      if(invalid||expectsRead!==Boolean(read)||expectsRead!==verified||verified&&(body?.verification?.status!=='verified'||body.verification.attempts!==1))return null;
      return seal('response',{binding,correlationId,read,verificationMethod:verified?'native-exact':'none',
        responseDigest:digest({statusCode:200,body})},key);
    },
  };
}

export function verifyVenueObservation({receipt,binding,correlationId,body},key){
  const proof=open('response',receipt,key);
  if(!exact(proof,['binding','correlationId','read','verificationMethod','responseDigest'])||!exact(proof.binding,bindingKeys)
    ||bindingKeys.some(name=>proof.binding[name]!==binding?.[name])||!uuid.test(correlationId??'')||proof.correlationId!==correlationId
    ||proof.responseDigest!==digest({statusCode:200,body})
    ||(proof.verificationMethod==='native-exact'?!readProof(proof.read):proof.verificationMethod!=='none'||proof.read!==null))
    return null;
  return proof;
}
