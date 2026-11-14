import {AffairsWorkspaceError} from './affairsWorkspace.js';
import {readFeeRemissionJson} from './feeRemissionContract.js';
import {elearningScope} from './elearningContract.js';

async function rpc(account,operation,payload){
  const remaining=Math.min(8000,(account.requestDeadline??Date.now()+8000)-Date.now());
  const unavailable=()=>new AffairsWorkspaceError('Remote-learning Moodle is temporarily unavailable.',503);
  if(remaining<=0)throw unavailable();
  let reply;
  try{
    reply=await fetch(account.url+'/rest/v1/rpc/'+operation,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(remaining),
      headers:{apikey:account.key,Authorization:'Bearer '+account.token,'Content-Type':'application/json'},
      body:JSON.stringify(payload),
    });
  }catch{throw unavailable();}
  if(!reply.ok){
    void reply.body?.cancel().catch(()=>{});
    if(reply.status===401||reply.status===403)throw new AffairsWorkspaceError('School Affairs sign-in is required.',403);
    if(reply.status===404)throw new AffairsWorkspaceError('Local self-enrollment is unavailable for this course.',404);
    throw unavailable();
  }
  try{return await readFeeRemissionJson(reply);}catch{throw unavailable();}
}
export async function readElearning(account,query){
  if(query.scope!==elearningScope||Object.keys(query).length!==1)throw new AffairsWorkspaceError('Invalid remote-learning query.',400);
  const workspace=await rpc(account,'elearning_workspace',{});
  if(workspace?.userId!==account.user.id||!['categories','courses','notices','enrollments'].every(key=>Array.isArray(workspace[key])))
    throw new AffairsWorkspaceError('Remote-learning records are unavailable to this account.',403);
  return workspace;
}
export async function enrollElearning(account,payload){
  const id=payload?.course_id;
  if(!payload||Object.keys(payload).length!==1||!Number.isSafeInteger(id)||id<1||id>2147483647)
    throw new AffairsWorkspaceError('Select a valid remote-learning course.',400);
  const receipt=await rpc(account,'elearning_join',{p_course_id:id});
  if(receipt?.courseId!==id||!Number.isFinite(Date.parse(receipt.joinedAt)))
    throw new AffairsWorkspaceError('The enrollment result could not be verified.',503);
  return receipt;
}
