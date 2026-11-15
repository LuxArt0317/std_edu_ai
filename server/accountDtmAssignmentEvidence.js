import {dtmAssignmentEvidenceMaxBytes,dtmAssignmentEnvelope as envelope} from './dtmAssignmentEvidenceContract.js';
export {dtmAssignmentEvidenceMaxBytes,parseDtmAssignmentEvidence,unavailableDtmAssignmentEvidence} from './dtmAssignmentEvidenceContract.js';
import {loadDtmCourseContentAssignment,parseDtmCourseContentAssignmentData} from './dtmCourseContent.js';
import {selectDtmAssignmentEvidence} from './dtmAssignmentEvidenceIntent.js';


const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const rawKeys=['id','userId','courseId','title','details','dueAt','status','submittedAt','sourceMode','meetingId','origin'];
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const data=value=>plain(value)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const exact=(value,keys)=>data(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
export async function readDtmAssignmentEvidence(account,options={},dependencies={}){
  let selection=null,timer;
  const fail=reason=>envelope('unavailable',reason,selection);
  try{
    if(!data(options)||!data(dependencies)||dependencies.load!==undefined&&typeof dependencies.load!=='function')return fail('invalid_context');
    if(!data(account)||!data(account.user)||typeof account.user.id!=='string'||!uuid.test(account.user.id)
      ||!['url','key','token'].every(key=>typeof account[key]==='string'&&account[key].trim())||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/u.test(account.url))return fail('unauthorized');
    const caller={url:account.url,key:account.key,token:account.token,user:{id:account.user.id}};
    selection=selectDtmAssignmentEvidence(options.question,options.route,options.history);
    if(!selection)return fail('unrelated_question');if(selection.reason)return fail(selection.reason);
    for(const value of [options.deadline,account.requestDeadline])if(value!==undefined&&!Number.isFinite(value))return fail('invalid_deadline');
    const deadline=Math.min(options.deadline??Infinity,account.requestDeadline??Infinity,Date.now()+8000);
    if(deadline<=Date.now())return fail('deadline_exceeded');
    const captured=Object.freeze({...caller,user:Object.freeze(caller.user),requestDeadline:deadline});
    const target=Object.freeze({courseId:selection.courseId,assignmentId:selection.assignmentId});
    const load=dependencies.load??loadDtmCourseContentAssignment;
    const raw=await Promise.race([Promise.resolve().then(()=>{if(Date.now()>=deadline)throw {deadline:true};return load(captured,target);}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject({deadline:true}),Math.max(1,deadline-Date.now()));})]);
    if(Date.now()>=deadline)return fail('deadline_exceeded');
    if(!exact(raw,['assignment'])||raw.assignment!==null&&!exact(raw.assignment,rawKeys))return fail('invalid_records');
    let parsed;try{parsed=parseDtmCourseContentAssignmentData(raw,captured.user.id,target.courseId,target.assignmentId);}catch{return fail('invalid_records');}
    if(parsed.assignment===null)return envelope('empty',null,selection,{recordPresent:false,complete:true});
    const row=parsed.assignment,record={sourceMode:row.sourceMode};
    for(const field of selection.fields)record[field]=row[field==='trackerStatus'?'status':field==='trackerSubmittedAt'?'submittedAt':field];
    let result=envelope('ok',null,selection,{recordPresent:true,record,complete:true});
    if(bytes(result)>dtmAssignmentEvidenceMaxBytes){
      const omittedFields=[];
      for(const field of ['details','title'])if(Object.hasOwn(record,field)&&bytes(result)>dtmAssignmentEvidenceMaxBytes){
        delete record[field];omittedFields.push(field);result=envelope('partial','evidence_limit',selection,{recordPresent:true,record,omittedFields,complete:false});}
    }
    return bytes(result)<=dtmAssignmentEvidenceMaxBytes?result:fail('evidence_limit');
  }catch(error){const status=Object.getOwnPropertyDescriptor(error??{},'status')?.value;
    return fail(Object.getOwnPropertyDescriptor(error??{},'deadline')?.value===true?'deadline_exceeded':status===401?'unauthorized':status===403?'forbidden':'read_failed');
  }finally{clearTimeout(timer);}
}
