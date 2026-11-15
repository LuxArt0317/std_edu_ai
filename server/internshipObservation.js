import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {maxAnswerVerificationChecks} from '../src/services/assistantVerificationLimits.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const preview=/^https:\/\/stdedu-[a-z0-9]{9}-v1-d286\.vercel\.app$/u;
const route=/^\/school-affairs\/services\/internship\/(?:contract|self_assessment|company|directory)$/u;
const keyPattern=/^[^\s\p{Cc}]{40,4096}$/u;
const requestKeys=['question','route','history','stream','consentedResearchUse'];
const scopeKeys=['ownerId','runId','origin','sourceRevision','nonce','companion'];
const receiptKeys=['binding','correlationId','attempts','companionAttempts','modelOperations','verificationMethod','responseDigest'];
const modelOperationsAllowed=new Set(['compose_grounded_answer','answer_evidence_review','correct_grounded_answer']);
export const internshipObservationHeader='X-Internship-Observation';

const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const keyValid=key=>typeof key==='string'&&keyPattern.test(key);
const scopeValid=scope=>exact(scope,scopeKeys)&&scopeKeys.filter(key=>key!=='companion').every(key=>typeof scope[key]==='string')&&[null,'charges','courses'].includes(scope.companion)
  &&uuid.test(scope.ownerId)&&uuid.test(scope.runId)&&uuid.test(scope.nonce)&&preview.test(scope.origin)&&/^[a-f0-9]{40}$/u.test(scope.sourceRevision);
const requestValid=request=>exact(request,requestKeys)&&typeof request.question==='string'
  &&request.question.length>=2&&request.question.length<=2000&&typeof request.route==='string'&&route.test(request.route)
  &&Array.isArray(request.history)&&request.history.length===0&&request.stream===false&&request.consentedResearchUse===false;

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export const internshipObservationDigest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const requestDigest=(origin,request)=>internshipObservationDigest({method:'POST',url:origin+'/api/affairs-assistant',request});
const sign=(domain,payload,key)=>createHmac('sha256',key).update('stu:internship-observation:v2:'+domain+':'+payload).digest();
const seal=(domain,value,key)=>{
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
  return payload+'.'+sign(domain,payload,key).toString('base64url');
};
function unseal(domain,value,key){
  if(!keyValid(key)||typeof value!=='string'||value.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value))return null;
  const [payload,mac]=value.split('.'),actual=Buffer.from(mac,'base64url');
  if(actual.length!==32||actual.toString('base64url')!==mac||!timingSafeEqual(actual,sign(domain,payload,key)))return null;
  try{return JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return null;}
}

export function createInternshipProbe(scope,request,key,now=Date.now()){
  scope={companion:null,...scope};
  if(!scopeValid(scope)||!requestValid(request)||!keyValid(key)||!Number.isSafeInteger(now))
    throw new Error('Invalid internship observation request.');
  const binding={...scope,issuedAt:now,requestDigest:requestDigest(scope.origin,request)};
  return {binding,body:{...request,evaluationInternshipProbe:seal('request',binding,key)}};
}

/** Holds only digests of the real native read and bounded evidence projection. */
export function openInternshipObservation({body,identity,correlationId},env=process.env,now=Date.now()){
  if(env.VERCEL_ENV!=='preview'||!exact(body,[...requestKeys,'evaluationInternshipProbe'])||!uuid.test(correlationId))return null;
  const {evaluationInternshipProbe,...request}=body;
  if(!requestValid(request))return null;
  const key=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,binding=unseal('request',evaluationInternshipProbe,key);
  if(!exact(binding,[...scopeKeys,'issuedAt','requestDigest']))return null;
  const {issuedAt,requestDigest:declaredDigest,...scope}=binding;
  if(!scopeValid(scope)||scope.origin!=='https://'+env.VERCEL_URL||scope.sourceRevision!==env.VERCEL_GIT_COMMIT_SHA
    ||scope.ownerId!==identity?.id||scope.runId!==identity?.runMarker
    ||!['evaluation.student@example.invalid','evaluation.other.'+scope.runId+'@example.invalid'].includes(identity.email)
    ||!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(now)||issuedAt>now+5000||now-issuedAt>120000
    ||declaredDigest!==requestDigest(scope.origin,request))return null;
  const attempts=[],companionAttempts=[],modelOperations=[];
  let invalid=false,nativeChecked=false;
  return {
    companion:scope.companion,
    async observeCompanion(kind,reader){
      const reads=[],attempt={reads,evidenceDigest:null};
      if(!scope.companion||scope.companion!==kind||companionAttempts.length>=2)invalid=true;
      else companionAttempts.push(attempt);
      const value=await reader(read=>{
        if(reads.length>=2)invalid=true;
        else reads.push(internshipObservationDigest(read));
      });
      if(typeof value?.studentRecordFound!=='boolean'||!Array.isArray(value[kind]))invalid=true;
      else attempt.evidenceDigest=internshipObservationDigest({studentRecordFound:value.studentRecordFound,[kind]:value[kind]});
      return value;
    },
    async observe(reader){
      const reads=[],attempt={reads,evidenceDigest:null};
      if(attempts.length>=maxAnswerVerificationChecks)invalid=true;
      else attempts.push(attempt);
      const result=await reader({observeRead(read){
        if(reads.length)invalid=true;
        else reads.push(internshipObservationDigest(read));
      }});
      try{
        const {collection,readState,reason,selection,complete,counts,records,provenance}=JSON.parse(result.evidence.content);
        attempt.evidenceDigest=internshipObservationDigest({collection,readState,reason,selection,complete,counts,records,provenance});
      }catch{invalid=true;}
      return result;
    },
    modelCompleted(operation){
      if(nativeChecked||!modelOperationsAllowed.has(operation)||modelOperations.length>=maxAnswerVerificationChecks*2)invalid=true;
      else modelOperations.push(operation);
    },
    nativeCheckCompleted(){
      if(nativeChecked||scope.companion==='courses'||modelOperations.length)invalid=true;
      else nativeChecked=true;
    },
    finish(payload,expectsRead){
      if(invalid||expectsRead!==Boolean(attempts.length)||!expectsRead&&modelOperations.length
        ||nativeChecked&&(!expectsRead||attempts.some(attempt=>attempt.reads.length!==1))
        ||scope.companion!==null&&(!expectsRead||companionAttempts.length!==attempts.length||!companionAttempts.length
          ||companionAttempts.some(attempt=>attempt.reads.length!==2||!sha.test(attempt.evidenceDigest)))
        ||scope.companion===null&&companionAttempts.length!==0
        ||attempts.some(attempt=>!sha.test(attempt.evidenceDigest)))return null;
      const verificationMethod=nativeChecked?'native-exact':expectsRead?'model':'none';
      return seal('response',{binding,correlationId,attempts,companionAttempts,modelOperations,verificationMethod,
        responseDigest:internshipObservationDigest({statusCode:200,body:payload})},key);
    },
  };
}

export function verifyInternshipObservation({receipt,binding,correlationId,body},key){
  const observed=unseal('response',receipt,key);
  if(!exact(observed,receiptKeys)||!exact(observed.binding,[...scopeKeys,'issuedAt','requestDigest'])
    ||Object.keys(observed.binding).some(name=>observed.binding[name]!==binding?.[name])
    ||!uuid.test(correlationId)||observed.correlationId!==correlationId
    ||observed.responseDigest!==internshipObservationDigest({statusCode:200,body})
    ||!Array.isArray(observed.attempts)||observed.attempts.length>maxAnswerVerificationChecks
    ||observed.attempts.some(row=>!exact(row,['reads','evidenceDigest'])||!sha.test(row.evidenceDigest)
      ||!Array.isArray(row.reads)||row.reads.length>1||row.reads.some(digest=>!sha.test(digest)))
    ||!Array.isArray(observed.companionAttempts)||observed.companionAttempts.length>2
    ||(observed.binding.companion!==null?(observed.companionAttempts.length!==observed.attempts.length||observed.verificationMethod==='none'
      ||observed.binding.companion==='courses'&&observed.verificationMethod!=='model')
      :observed.companionAttempts.length!==0)
    ||observed.companionAttempts.some(row=>!exact(row,['reads','evidenceDigest'])||!sha.test(row.evidenceDigest)
      ||!Array.isArray(row.reads)||row.reads.length!==2||row.reads.some(read=>!sha.test(read)))
    ||!Array.isArray(observed.modelOperations)||observed.modelOperations.length>maxAnswerVerificationChecks*2
    ||observed.modelOperations.some(operation=>!modelOperationsAllowed.has(operation))
    ||!['native-exact','model','none'].includes(observed.verificationMethod)
    ||observed.verificationMethod==='none'&&(observed.attempts.length!==0||observed.modelOperations.length!==0)
    ||observed.verificationMethod!=='none'&&observed.attempts.length===0
    ||observed.verificationMethod==='native-exact'&&(observed.modelOperations.length!==0||observed.attempts.some(attempt=>attempt.reads.length!==1)))return null;
  return observed;
}
