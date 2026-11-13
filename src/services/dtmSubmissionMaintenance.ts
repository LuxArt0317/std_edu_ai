/** One explicit authorized batch. No paths, user selectors or signed URLs. */
export type DtmSubmissionCleanupResult={removed:number;remaining:number};
type Dependencies={fetch?:typeof fetch;getSession?:()=>Promise<{userId:string;accessToken:string}|null>};
export async function cleanupDtmSubmissionBatch(userId:string,signal:AbortSignal,dependencies:Dependencies={}):Promise<DtmSubmissionCleanupResult>{
  const getSession=dependencies.getSession??(async()=>{
    const {affairsClient}=await import('../features/public/affairs/authClient');
    const response=await affairsClient?.auth.getSession(),session=response?.data.session;
    return response?.error||!session?null:{userId:session.user.id,accessToken:session.access_token};
  });
  signal.throwIfAborted();let session:Awaited<ReturnType<typeof getSession>>;
  try{session=await getSession();}catch{signal.throwIfAborted();throw new Error('Sign in again before running submission maintenance.');}
  signal.throwIfAborted();
  if(!userId||session?.userId!==userId||!session.accessToken)throw new Error('Sign in again before running submission maintenance.');
  let response:Response;
  try{response=await (dependencies.fetch??fetch)('/api/affairs-action',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
    headers:{Authorization:'Bearer '+session.accessToken,'Content-Type':'application/json'},body:JSON.stringify({kind:'cleanup_dtm_submission_uploads',payload:{}}),
    signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});}
  catch{signal.throwIfAborted();throw new Error('Cleanup was not confirmed. You can retry another bounded batch.');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new Error(response.status===401||response.status===403?'This account cannot run submission maintenance.':'Cleanup was not confirmed. You can retry another bounded batch.');}
  const value:unknown=await response.json().catch(()=>null);signal.throwIfAborted();
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!('removed'in value)||!('remaining'in value)||
    typeof value.removed!=='number'||typeof value.remaining!=='number'||!Number.isSafeInteger(value.removed)||!Number.isSafeInteger(value.remaining)||
    value.removed<0||value.remaining<0||value.removed+value.remaining>5)throw new Error('The cleanup batch result was invalid. Refresh before retrying.');
  return {removed:value.removed,remaining:value.remaining};
}
