import {createHmac,timingSafeEqual} from 'node:crypto';
import {internshipObservationDigest as digest} from './internshipObservation.js';
import {clubAttendancePath} from './clubAttendanceIntent.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const sha=/^[a-f0-9]{40}$/u;
const hash=/^[a-f0-9]{64}$/u;
const preview=/^https:\/\/stdedu-[a-z0-9]{9}-v1-d286\.vercel\.app$/u;
const keyValid=key=>typeof key==='string'&&/^[^\s\p{Cc}]{40,4096}$/u.test(key);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const requestKeys=['question','route','history','images','stream'];
const scopeKeys=['ownerId','runId','origin','sourceRevision','nonce','mode'];
const bindingKeys=[...scopeKeys,'issuedAt','requestDigest'];
const recordQuestion='Show my saved club activity attendance records.';
const cases=Object.freeze({record:recordQuestion,multipart:recordQuestion+' Also show my tuition balance.',empty:recordQuestion,
  foreign:'Show another student’s club activity attendance records.','read-failure':recordQuestion});
const requestValid=(request,mode)=>exact(request,requestKeys)&&Object.hasOwn(cases,mode)&&request.question===cases[mode]
  &&request.route===clubAttendancePath&&request.stream===true&&Array.isArray(request.history)&&!request.history.length
  &&Array.isArray(request.images)&&!request.images.length;
const scopeValid=scope=>exact(scope,scopeKeys)&&scopeKeys.every(key=>typeof scope[key]==='string')
  &&[scope.ownerId,scope.runId,scope.nonce].every(value=>uuid.test(value))&&preview.test(scope.origin)
  &&sha.test(scope.sourceRevision)&&Object.hasOwn(cases,scope.mode);
const requestDigest=(origin,request)=>digest({method:'POST',url:origin+'/api/affairs-assistant',request});
const signature=(kind,payload,key)=>createHmac('sha256',key).update('stu:club-attendance-observation:v1:'+kind+':'+payload).digest();
function seal(kind,value,key){
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
  return payload+'.'+signature(kind,payload,key).toString('base64url');
}
function open(kind,value,key){
  if(!keyValid(key)||typeof value!=='string'||value.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value))return null;
  const [payload,mac]=value.split('.'),bytes=Buffer.from(mac,'base64url');
  if(bytes.length!==32||bytes.toString('base64url')!==mac||!timingSafeEqual(bytes,signature(kind,payload,key)))return null;
  try{return JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return null;}
}

export const clubAttendanceBrowserObservationEvent='evaluation-club-attendance';

export function createClubAttendanceBrowserProbe(scope,request,key,now=Date.now()){
  if(!scopeValid(scope)||!requestValid(request,scope.mode)||!keyValid(key)||!Number.isSafeInteger(now))
    throw new Error('Invalid protected club attendance request.');
  const binding={...scope,issuedAt:now,requestDigest:requestDigest(scope.origin,request)};
  return {binding,body:{...request,evaluationClubAttendanceProbe:seal('request',binding,key)}};
}

function shapeMatches(mode,reads,checked,body){
  if(body?.grounding?.webSearched!==false||body.proposedAction!==undefined||!Array.isArray(reads)||!Array.isArray(checked))return false;
  const keys=reads.map(read=>[read.tool,read.attempt,read.status]);
  const attendance=keys.filter(([tool])=>tool==='clubAttendance');
  const charges=keys.filter(([tool])=>tool==='charges');
  const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
  if(mode==='foreign')return !reads.length&&!checked.length&&body.status==='handoff'&&!body.verification;
  if(mode==='read-failure')return keys.length===2&&!checked.length&&equal(attendance,[['clubAttendance',1,'unavailable'],['clubAttendance',2,'unavailable']])
    &&reads.every(read=>read.rowCount===null&&read.inputDigests.length===1)
    &&body.status==='abstained'&&body.verification?.status==='unverified'&&body.verification.attempts===2;
  const attendanceRead=reads.find(read=>read.tool==='clubAttendance');
  return reads.length===(mode==='multipart'?2:1)&&equal(attendance,[['clubAttendance',1,'complete']])
    &&equal(charges,mode==='multipart'?[['charges',1,'complete']]:[])&&equal(checked,[1])
    &&attendanceRead.inputDigests.length===1&&Number.isSafeInteger(attendanceRead.rowCount)&&attendanceRead.rowCount<=25
    &&(mode==='empty'?attendanceRead.rowCount===0:attendanceRead.rowCount>0)
    &&body.status==='answered'&&body.verification?.status==='verified'&&body.verification.attempts===1;
}

/** Retains digests of actual reader returns in the current request only. */
export function openClubAttendanceBrowserObservation({body,identity,correlationId},env=process.env,now=Date.now()){
  if(env.VERCEL_ENV!=='preview'||!exact(body,[...requestKeys,'evaluationClubAttendanceProbe'])||!uuid.test(correlationId??''))return null;
  const {evaluationClubAttendanceProbe,...request}=body;
  const key=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,binding=open('request',evaluationClubAttendanceProbe,key);
  if(!exact(binding,bindingKeys))return null;
  const {issuedAt,requestDigest:declared,...scope}=binding;
  if(!scopeValid(scope)||!requestValid(request,scope.mode)||scope.origin!=='https://'+env.VERCEL_URL||scope.sourceRevision!==env.VERCEL_GIT_COMMIT_SHA
    ||scope.ownerId!==identity?.id||scope.runId!==identity?.runMarker
    ||!['evaluation.student@example.invalid','evaluation.other.'+scope.runId+'@example.invalid'].includes(identity.email)
    ||!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(now)||issuedAt>now+5000||now-issuedAt>120000
    ||declared!==requestDigest(scope.origin,request))return null;
  const reads=[],checked=[];
  let invalid=false,finished=false;
  return Object.freeze({
    record(tool,attempt,rawReads,success){
      if(finished||reads.length>=4||!['clubAttendance','charges'].includes(tool)||![1,2].includes(attempt)
        ||reads.some(row=>row.tool===tool&&row.attempt===attempt)||!Array.isArray(rawReads)||rawReads.length>20
        ||rawReads.some(read=>read?.ownerId!==scope.ownerId)){
        invalid=true;return;
      }
      if(success&&(tool==='clubAttendance'?(rawReads.length!==1||!Array.isArray(rawReads[0].workspace?.rows)):!rawReads.length)
        ||!success&&tool==='clubAttendance'&&rawReads.some(read=>{
          const status=read.transportUnavailable;
          return status!=='network-error'&&status!==408&&status!==429&&!(Number.isInteger(status)&&status>=500&&status<=599);
        })){
        invalid=true;return;
      }
      reads.push({tool,attempt,status:success?'complete':'unavailable',
        rowCount:tool==='clubAttendance'&&success?rawReads[0].workspace.rows.length:null,inputDigests:rawReads.map(digest)});
    },
    verified(attempt){
      if(finished||checked.includes(attempt)||![1,2].includes(attempt))invalid=true;
      else checked.push(attempt);
    },
    finish(result){
      if(finished)return null;
      finished=true;
      if(invalid||!shapeMatches(scope.mode,reads,checked,result))return null;
      return seal('response',{binding,correlationId,reads,checked,responseDigest:digest(result)},key);
    },
  });
}

export function verifyClubAttendanceBrowserObservation({receipt,binding,correlationId,body},key){
  const proof=open('response',receipt,key);
  if(!exact(proof,['binding','correlationId','reads','checked','responseDigest'])||!exact(proof.binding,bindingKeys)
    ||bindingKeys.some(name=>binding?.[name]!==proof.binding[name])||!uuid.test(correlationId??'')||proof.correlationId!==correlationId
    ||proof.responseDigest!==digest(body)||!Array.isArray(proof.reads)||proof.reads.length>4
    ||proof.reads.some(row=>!exact(row,['tool','attempt','status','rowCount','inputDigests'])||!Array.isArray(row.inputDigests)
      ||row.inputDigests.length>20||row.inputDigests.some(value=>!hash.test(value)))
    ||!shapeMatches(proof.binding.mode,proof.reads,proof.checked,body))return null;
  return proof;
}
