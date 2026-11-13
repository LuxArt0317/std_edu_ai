/** Private file workspace only. Never merge its files/paths into model snapshots. */
export const dtmSubmissionBucket='dtm-submissions';
export const dtmSubmissionMaxBytes=10485760;
export const dtmSubmissionMaxPayloadBytes=12000;
export const dtmSubmissionStudentKinds=['begin_dtm_submission_upload','commit_dtm_submission_upload','cancel_dtm_submission_upload'];
const operationBudgetMs=12000,cleanupBudgetMs=8000,cleanupBatchSize=5,downloadLifetimeSeconds=60;
const reviewKind='save_dtm_submission_review';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const integer=(value,max)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;
const safeString=value=>typeof value==='string'&&![...value].some(char=>{const code=char.codePointAt(0);return code===0||code>=0xd800&&code<=0xdfff;});
const validType=value=>typeof value==='string'&&value.length<=120&&/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(value);
const bytes=value=>new TextEncoder().encode(value).byteLength;
// SQL uses this same ECMAScript trim whitespace set; neither layer rewrites names.
const validName=value=>safeString(value)&&bytes(value)>=1&&bytes(value)<=255&&value.trim()!==''&&!['.','..'].includes(value)&&
  ![...value].some(char=>char==='/'||char==='\\'||char.codePointAt(0)<32||char.codePointAt(0)===127);
const validPath=value=>typeof value==='string'&&value.split('/').length===3&&value.split('/').every(part=>uuid.test(part));
const validText=(value,max)=>value===null||safeString(value)&&[...value].length<=max;
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
export class DtmSubmissionError extends Error {
  constructor(message,status=503){super(message);this.name='DtmSubmissionError';this.status=status;}
}
export function validateDtmSubmissionPayload(kind,payload){
  if(!dtmSubmissionStudentKinds.includes(kind)&&kind!==reviewKind)return 'Unsupported submission operation.';
  if(!object(payload))return 'Invalid submission fields.';
  const fields=['assignment_id','request_id','expected_version',...(kind==='begin_dtm_submission_upload'?['filename','size_bytes','content_type']:
    kind===reviewKind?['upload_id','status','grade_text','feedback']:['upload_id'])];
  if(Object.keys(payload).length!==fields.length||!fields.every(key=>Object.hasOwn(payload,key)))return 'Submission fields must match the operation exactly.';
  if(!['assignment_id','request_id',...(kind==='begin_dtm_submission_upload'?[]:['upload_id'])].every(key=>typeof payload[key]==='string'&&uuid.test(payload[key]))||
    !integer(payload.expected_version,999999998))return 'Invalid submission identifier or version.';
  if(kind==='begin_dtm_submission_upload'&&(!validName(payload.filename)||!validType(payload.content_type)||!integer(payload.size_bytes,dtmSubmissionMaxBytes)))return 'Choose one file of at most 10 MiB with a valid name and content type.';
  if(kind===reviewKind&&(!['graded','not_graded'].includes(payload.status)||!validText(payload.grade_text,80)||!validText(payload.feedback,2000)||
    payload.status==='not_graded'&&payload.grade_text!==null))return 'Invalid grading status, grade or feedback.';
  // PostgreSQL jsonb inserts a space after every comma/colon at this flat level.
  if(bytes('{'+Object.entries(payload).map(([key,value])=>JSON.stringify(key)+': '+JSON.stringify(value)).join(', ')+'}')>dtmSubmissionMaxPayloadBytes)return 'Submission metadata is too large.';
  return null;
}
function assertAccount(account){
  if(!object(account)||!uuid.test(account.user?.id||'')||typeof account.token!=='string'||!account.token||typeof account.key!=='string'||!account.key||
    typeof account.url!=='string'||!/^https:\/\/xiftudmvxphxcjtmfmib\.supabase\.co\/?$/.test(account.url))throw new DtmSubmissionError('Submission account access is unavailable.',401);
}
function boundedAccount(account,budgetMs=operationBudgetMs){
  assertAccount(account);
  if(account.requestDeadline!==undefined&&!Number.isFinite(account.requestDeadline))throw new DtmSubmissionError('Submission request deadline is invalid.');
  return {...account,requestDeadline:Math.min(account.requestDeadline??Infinity,Date.now()+budgetMs)};
}
async function request(account,path,{method='POST',body}={}){
  assertAccount(account);let response;
  const remaining=Math.floor(account.requestDeadline-Date.now());
  if(!Number.isFinite(remaining)||remaining<=0)throw new DtmSubmissionError('Submission request time limit reached. Retry the same operation.');
  try{
    response=await fetch(account.url.replace(/\/$/,'')+path,{method,headers:{apikey:account.key,Authorization:`Bearer ${account.token}`,
      ...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(Math.min(operationBudgetMs,remaining))});
  }catch{throw new DtmSubmissionError('Submission storage did not respond. Retry the same operation.');}
  if(!response.ok){
    const status=response.status;
    if(status===401)throw new DtmSubmissionError('Sign in to School Affairs again.',401);
    if(status===403)throw new DtmSubmissionError('This submission is not available to your account.',403);
    if(status===409||status===404)throw new DtmSubmissionError('The submission or upload changed. Refresh and retry.',409);
    if(status===400||status===413)throw new DtmSubmissionError('The file or submission fields were rejected. Check the 10 MiB limit and retry.',400);
    throw new DtmSubmissionError('Submission storage is temporarily unavailable. Retry the same operation.');
  }
  if(response.status===204)return null;
  try{return await response.json();}catch{throw new DtmSubmissionError('Submission storage returned an invalid response.');}
}
const rpc=(account,name,body)=>request(account,'/rest/v1/rpc/'+name,{body});
function checked(kind,payload){const error=validateDtmSubmissionPayload(kind,payload);if(error)throw new DtmSubmissionError(error,400);}
function checkedResult(account,kind,payload,result){
  if(!object(result)||result.kind!==kind||result.assignmentId!==payload.assignment_id||!uuid.test(result.submissionId||'')||!uuid.test(result.uploadId||'')||
    !integer(result.version,999999999)||kind!=='begin_dtm_submission_upload'&&result.uploadId!==payload.upload_id)
    throw new DtmSubmissionError('Submission operation returned an invalid receipt.');
  if(kind==='begin_dtm_submission_upload'&&(result.bucket!==dtmSubmissionBucket||result.maxBytes!==dtmSubmissionMaxBytes||result.path!==`${account.user.id}/${result.submissionId}/${result.uploadId}`||
    result.version!==payload.expected_version||!timestamp(result.expiresAt)))throw new DtmSubmissionError('Upload reservation returned an invalid path or limit.');
  if(kind==='cancel_dtm_submission_upload'&&(result.cancelled!==true||result.version!==payload.expected_version))throw new DtmSubmissionError('Upload cancellation returned an invalid receipt.');
  if(kind==='commit_dtm_submission_upload'&&(result.version!==payload.expected_version+1||!timestamp(result.submittedAt)||!timestamp(result.contentModifiedAt)))throw new DtmSubmissionError('Submission save returned an invalid receipt.');
  if(kind===reviewKind&&(result.version!==payload.expected_version+1||!uuid.test(result.reviewId||'')))throw new DtmSubmissionError('Submission review returned an invalid receipt.');
  return result;
}
function receiptResult(prepared,payload){
  if(!object(prepared))throw new DtmSubmissionError('Submission verification returned an invalid response.');
  if(Object.hasOwn(prepared,'receipt')){
    if(!object(prepared.receipt)||prepared.receipt.kind!=='commit_dtm_submission_upload'||!integer(prepared.receipt.version,999999999)||prepared.receipt.version<1||
      prepared.receipt.assignmentId!==payload.assignment_id||prepared.receipt.uploadId!==payload.upload_id||!uuid.test(prepared.receipt.submissionId||''))throw new DtmSubmissionError('Submission receipt was invalid.');
    return prepared.receipt;
  }
  return null;
}
function uploadContext(account,payload,prepared){
  const upload=prepared.upload;
  if(!object(upload)||upload.id!==payload.upload_id||upload.userId!==account.user.id||!uuid.test(upload.submissionId||'')||
    upload.path!==`${account.user.id}/${upload.submissionId}/${upload.id}`||!integer(upload.sizeBytes,dtmSubmissionMaxBytes)||!validType(upload.contentType))
    throw new DtmSubmissionError('Submission verification returned an invalid account or file.');
  return upload;
}
function verifiedObject(info,upload){
  if(!object(info)||!uuid.test(info.id||'')||info.bucket_id!==dtmSubmissionBucket||info.name!==upload.path||info.is_delete_marker===true)
    throw new DtmSubmissionError('Storage returned an invalid file identity.');
  // Installed storage-js StorageFileApi.info() fetches this raw response then
  // applies recursiveToCamel. We call HTTP directly: FileObjectV2's bucket_id,
  // content_type and etag are snake_case, never SDK bucketId/contentType.
  // Older server metadata contains size/mimetype/eTag. Reject conflicting copies.
  const metadata=object(info.metadata)?info.metadata:{};
  const size=info.size??metadata.size,type=info.content_type??metadata.mimetype,etag=info.etag??metadata.eTag;
  if(!integer(size,dtmSubmissionMaxBytes)||!validType(type)||!safeString(etag)||etag.length<1||etag.length>200)
    throw new DtmSubmissionError('Storage returned invalid file metadata.');
  if(info.size!==undefined&&metadata.size!==undefined&&info.size!==metadata.size||info.content_type!==undefined&&metadata.mimetype!==undefined&&info.content_type!==metadata.mimetype||
    info.etag!==undefined&&metadata.eTag!==undefined&&info.etag!==metadata.eTag)throw new DtmSubmissionError('Storage returned conflicting file metadata.');
  if(size!==upload.sizeBytes||type!==upload.contentType)throw new DtmSubmissionError('The uploaded file does not match its reservation.',400);
  return {id:info.id,size_bytes:size,content_type:type,etag};
}
export async function executeDtmSubmissionAction(account,kind,payload){
  if(!dtmSubmissionStudentKinds.includes(kind))throw new DtmSubmissionError('Unsupported student submission action.',400);
  checked(kind,payload);account=boundedAccount(account);
  const body={p_kind:kind,p_payload:payload};
  if(kind!=='commit_dtm_submission_upload')return checkedResult(account,kind,payload,await rpc(account,'dtm_submission_action',body));
  let prepared;
  try{prepared=await rpc(account,'dtm_submission_prepare',body);}
  catch(error){
    if(!(error instanceof DtmSubmissionError)||error.status!==409)throw error;
    // An identical commit can finish between prepare's receipt and upload
    // reads. Recheck once under the same deadline; only its durable receipt
    // recovers that race. A pending upload never authorizes a fresh commit here.
    const retried=await rpc(account,'dtm_submission_prepare',body),completed=receiptResult(retried,payload);
    if(completed)return checkedResult(account,kind,payload,completed);
    throw error;
  }
  const receipt=receiptResult(prepared,payload);
  if(receipt)return checkedResult(account,kind,payload,receipt);
  const upload=uploadContext(account,payload,prepared);let info;
  try{info=await request(account,`/storage/v1/object/info/${dtmSubmissionBucket}/${upload.path}`,{method:'GET'});}
  catch(error){
    // A parallel identical commit may have succeeded and its revision since
    // been replaced/deleted. Recover its durable receipt before surfacing error.
    const retried=await rpc(account,'dtm_submission_prepare',body),completed=receiptResult(retried,payload);
    if(completed)return checkedResult(account,kind,payload,completed);
    throw error;
  }
  return checkedResult(account,kind,payload,await rpc(account,'dtm_submission_action',{...body,p_verified_object:verifiedObject(info,upload)}));
}
export async function manageDtmSubmissionReview(account,kind,payload){
  if(kind!==reviewKind)throw new DtmSubmissionError('Unsupported submission review action.',400);
  checked(kind,payload);account=boundedAccount(account);
  return checkedResult(account,kind,payload,await rpc(account,'dtm_submission_action',{p_kind:kind,p_payload:payload}));
}
/** Dedicated UI response, intentionally not an AffairsSnapshot collection. */
export async function loadDtmSubmissionWorkspace(account,assignmentId,{admin=false}={}){
  if(!uuid.test(assignmentId||'')||typeof admin!=='boolean')throw new DtmSubmissionError('Invalid assignment identifier.',400);
  account=boundedAccount(account);
  const data=await rpc(account,'dtm_submission_workspace',{p_assignment_id:assignmentId});
  if(!object(data)||data.assignmentId!==assignmentId||!uuid.test(data.userId||'')||!uuid.test(data.courseId||'')||!admin&&data.userId!==account.user.id||
    data.maxBytes!==dtmSubmissionMaxBytes||data.dueAt!==null&&!timestamp(data.dueAt)||!Array.isArray(data.files)||!Array.isArray(data.reviews))throw new DtmSubmissionError('Submission workspace returned an invalid account scope.');
  if(data.submission!==null&&(!object(data.submission)||data.submission.user_id!==data.userId||data.submission.assignment_id!==assignmentId||
    !uuid.test(data.submission.id||'')||!integer(data.submission.version,999999999)))throw new DtmSubmissionError('Submission workspace returned invalid submission metadata.');
  const ids=new Set();let pending=0,current=0;
  for(const file of data.files){
    if(!object(file)||!uuid.test(file.id||'')||ids.has(file.id)||!validName(file.filename)||!integer(file.sizeBytes,dtmSubmissionMaxBytes)||!validType(file.contentType)||
      file.path!==`${data.userId}/${data.submission?.id}/${file.id}`||!timestamp(file.expiresAt)||!['pending','current','retired'].includes(file.state)||
      (file.state==='pending'?file.committedAt!==null:!timestamp(file.committedAt)))throw new DtmSubmissionError('Submission workspace returned invalid file metadata.');
    ids.add(file.id);if(file.state==='pending')pending++;if(file.state==='current')current++;
  }
  if(pending>1||current>1||data.files.some(file=>file.state==='current'&&file.id!==data.submission?.current_upload_id)||
    Boolean(data.submission?.current_upload_id)!==Boolean(current))throw new DtmSubmissionError('Submission workspace returned conflicting files.');
  const reviewedFiles=new Set();
  for(const review of data.reviews){
    if(!object(review)||review.user_id!==data.userId||review.submission_id!==data.submission?.id||!ids.has(review.upload_id)||
      reviewedFiles.has(review.upload_id)||!uuid.test(review.id||'')||!uuid.test(review.reviewed_by||'')||!timestamp(review.reviewed_at)||
      !['graded','not_graded'].includes(review.status)||review.status==='not_graded'&&review.grade_text!==null||!validText(review.grade_text,80)||!validText(review.feedback,2000)||!integer(review.version,999999999)||review.version<1)
      throw new DtmSubmissionError('Submission workspace returned invalid review metadata.');
    reviewedFiles.add(review.upload_id);
  }
  if(data.files.some(file=>file.state==='retired'&&!reviewedFiles.has(file.id)))throw new DtmSubmissionError('Submission workspace returned an unrelated archived file.');
  return data;
}
/** UI-only capability: never persist, log or add its signed URL to a model
 * snapshot. The workspace RPC verifies ownership OR private.affairs_is_admin;
 * Storage signs with that same caller JWT and repeats its object SELECT policy. */
export async function createDtmSubmissionDownload(account,assignmentId,uploadId){
  if(!uuid.test(uploadId||''))throw new DtmSubmissionError('Invalid saved file identifier.',400);
  account=boundedAccount(account);
  const workspace=await loadDtmSubmissionWorkspace(account,assignmentId,{admin:true});
  const file=workspace.files.find(value=>value.id===uploadId&&['current','retired'].includes(value.state));
  if(!file)throw new DtmSubmissionError('This saved file is not available for download.',404);
  const result=await request(account,`/storage/v1/object/sign/${dtmSubmissionBucket}/${file.path}`,{body:{expiresIn:downloadLifetimeSeconds}});
  // createSignedUrl() in installed storage-js consumes raw data.signedURL and
  // prefixes the Storage base URL; signedUrl is only the SDK's returned shape.
  const expectedPath=`/object/sign/${dtmSubmissionBucket}/${file.path}`;
  if(!object(result)||typeof result.signedURL!=='string'||!result.signedURL.startsWith(expectedPath+'?'))
    throw new DtmSubmissionError('Storage returned an invalid download capability.');
  let url;
  try{url=new URL(account.url.replace(/\/$/,'')+'/storage/v1'+result.signedURL);}catch{throw new DtmSubmissionError('Storage returned an invalid download capability.');}
  if(url.origin!==account.url.replace(/\/$/,'')||url.pathname!=='/storage/v1'+expectedPath||url.hash||
    url.searchParams.getAll('token').length!==1||!url.searchParams.get('token')||url.searchParams.get('token').length>16384)
    throw new DtmSubmissionError('Storage returned an invalid download capability.');
  url.searchParams.set('download',file.filename);
  return {uploadId:file.id,signedUrl:url.href,expiresIn:downloadLifetimeSeconds};
}
/** Existing action handler may call this after Save/Cancel and on workspace open.
 * An admin maintenance caller must also sweep files of deleted accounts.
 * Each pass handles at most 5 paths within 8s (or the caller's earlier deadline).
 * remaining counts unacknowledged rows in this batch, not the entire queue. */
export async function cleanupDtmSubmissionUploads(account){
  account=boundedAccount(account,cleanupBudgetMs);
  const rows=await rpc(account,'dtm_submission_cleanup_batch',{p_limit:cleanupBatchSize});
  if(!Array.isArray(rows)||rows.length>cleanupBatchSize||rows.some(row=>!object(row)||Object.keys(row).length!==1||!validPath(row.path))||new Set(rows.map(row=>row.path)).size!==rows.length)
    throw new DtmSubmissionError('Submission cleanup returned an invalid file list.');
  let removed=0;
  for(const row of rows){
    if(account.requestDeadline-Date.now()<=0)break;
    try{
      await request(account,`/storage/v1/object/${dtmSubmissionBucket}`,{method:'DELETE',body:{prefixes:[row.path]}});
      await rpc(account,'dtm_submission_cleanup_ack',{p_path:row.path});removed++;
    }catch{/* Failed or unacknowledged paths remain queued for a later pass. */}
  }
  return {removed,remaining:rows.length-removed};
}
