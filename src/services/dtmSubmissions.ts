import {dtmEditorContentType,dtmEditorFileError,dtmEditorMaxFileBytes} from './dtmSubmissionEditor';
import type {DtmAssignmentDetailReport} from './dtmAssignmentDetail';

/** Private UI data only: never persist this workspace or pass it to chat. */
export type DtmSubmissionAssignment={id:string;userId:string;courseId:string;title:string};
export type DtmSubmissionFile={id:string;filename:string;sizeBytes:number;contentType:string;path:string;state:'pending'|'current'|'retired';expiresAt:string;committedAt:string|null};
export type DtmSubmissionReview={id:string;uploadId:string;status:'graded'|'not_graded';gradeText:string|null;feedback:string|null;version:number;reviewedAt:string};
export type DtmSubmissionWorkspaceData={assignmentId:string;userId:string;courseId:string;dueAt:string|null;maxBytes:number;
  submission:{id:string;currentUploadId:string|null;version:number;submittedAt:string|null;modifiedAt:string|null;dueAtAtSubmission:string|null}|null;
  files:DtmSubmissionFile[];reviews:DtmSubmissionReview[]};
export type DtmSubmissionBegin={assignment_id:string;request_id:string;expected_version:number;filename:string;size_bytes:number;content_type:string};
export type DtmSubmissionChange={assignment_id:string;request_id:string;expected_version:number;upload_id:string};
export type DtmSubmissionReviewInput=DtmSubmissionChange&{status:'graded'|'not_graded';grade_text:string|null;feedback:string|null};
export type DtmSubmissionReservation={kind:'begin_dtm_submission_upload';assignmentId:string;submissionId:string;uploadId:string;version:number;
  bucket:'dtm-submissions';path:string;expiresAt:string;maxBytes:number};
export type DtmSubmissionReceipt={kind:string;assignmentId:string;submissionId:string;uploadId:string;version:number;submittedAt?:string;contentModifiedAt?:string;cancelled?:boolean;reviewId?:string};
export interface DtmSubmissionsClient{
  load(assignment:DtmSubmissionAssignment,signal:AbortSignal,admin?:boolean):Promise<DtmSubmissionWorkspaceData>;
  begin(payload:DtmSubmissionBegin,signal:AbortSignal):Promise<DtmSubmissionReservation>;
  commit(payload:DtmSubmissionChange,signal:AbortSignal):Promise<DtmSubmissionReceipt>;
  cancel(payload:DtmSubmissionChange,signal:AbortSignal):Promise<DtmSubmissionReceipt>;
  upload(reservation:DtmSubmissionReservation,file:File,signal:AbortSignal):Promise<void>;
  download(assignment:DtmSubmissionAssignment,file:DtmSubmissionFile,signal:AbortSignal):Promise<Blob>;
  review(payload:DtmSubmissionReviewInput,signal:AbortSignal):Promise<DtmSubmissionReceipt>;
}
export class DtmSubmissionClientError extends Error{
  status:number;uncertain:boolean;
  constructor(message:string,status=503,uncertain=false){super(message);this.name='DtmSubmissionClientError';this.status=status;this.uncertain=uncertain;}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown,max=999999999):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const nullableDate=(value:unknown):value is string|null=>value===null||date(value);
const nullableText=(value:unknown,max:number):value is string|null=>value===null||typeof value==='string'&&[...value].length<=max;
const id=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
function valid(condition:unknown):asserts condition{if(!condition)throw new DtmSubmissionClientError('作業資料格式不正確，請重新載入。');}
export function validDtmSubmissionAssignment(value:DtmSubmissionAssignment|null,userId:string):value is DtmSubmissionAssignment{
  return Boolean(value&&Object.hasOwn(value,'userId')&&id(userId)&&value.userId===userId&&id(value.id)&&id(value.courseId)&&typeof value.title==='string');
}
export function parseDtmSubmissionWorkspace(value:unknown,assignment:DtmSubmissionAssignment):DtmSubmissionWorkspaceData{
  valid(object(value)&&Object.hasOwn(value,'userId')&&value.userId===assignment.userId&&value.assignmentId===assignment.id&&value.courseId===assignment.courseId&&
    value.maxBytes===dtmEditorMaxFileBytes&&nullableDate(value.dueAt)&&Array.isArray(value.files)&&Array.isArray(value.reviews));
  let submission:DtmSubmissionWorkspaceData['submission']=null;
  if(value.submission!==null){
    const row=value.submission;
    valid(object(row)&&id(row.id)&&row.user_id===assignment.userId&&row.assignment_id===assignment.id&&row.course_id===assignment.courseId&&
      row.source_mode==='local_submission'&&integer(row.version)&&(row.current_upload_id===null||id(row.current_upload_id))&&
      nullableDate(row.submitted_at)&&nullableDate(row.content_modified_at)&&nullableDate(row.due_at_at_submission));
    valid(row.current_upload_id===null?row.version===0&&row.submitted_at===null&&row.content_modified_at===null:row.version>0&&date(row.submitted_at)&&date(row.content_modified_at));
    submission={id:row.id,currentUploadId:row.current_upload_id,version:row.version,submittedAt:row.submitted_at,modifiedAt:row.content_modified_at,dueAtAtSubmission:row.due_at_at_submission};
  }
  const files:DtmSubmissionFile[]=[],seen=new Set<string>();
  for(const row of value.files){
    valid(object(row)&&id(row.id)&&!seen.has(row.id)&&typeof row.filename==='string'&&integer(row.sizeBytes,dtmEditorMaxFileBytes)&&typeof row.contentType==='string'&&
      dtmEditorFileError({name:row.filename,size:row.sizeBytes,type:row.contentType})===null&&row.path===`${assignment.userId}/${submission?.id}/${row.id}`&&
      ['pending','current','retired'].includes(String(row.state))&&date(row.expiresAt)&&nullableDate(row.committedAt)&&
      (row.state==='pending'?row.committedAt===null:date(row.committedAt)));
    seen.add(row.id);files.push({id:row.id,filename:row.filename,sizeBytes:row.sizeBytes,contentType:row.contentType,path:row.path as string,
      state:row.state as DtmSubmissionFile['state'],expiresAt:row.expiresAt,committedAt:row.committedAt});
  }
  valid(files.filter(row=>row.state==='pending').length<=1&&files.filter(row=>row.state==='current').length===(submission?.currentUploadId?1:0)&&
    files.every(row=>row.state!=='current'||row.id===submission?.currentUploadId));
  const reviews:DtmSubmissionReview[]=[],reviewed=new Set<string>();
  for(const row of value.reviews){
    valid(object(row)&&id(row.id)&&row.user_id===assignment.userId&&row.submission_id===submission?.id&&id(row.upload_id)&&!reviewed.has(row.upload_id)&&
      files.some(file=>file.id===row.upload_id&&file.state!=='pending')&&['graded','not_graded'].includes(String(row.status))&&
      nullableText(row.grade_text,80)&&nullableText(row.feedback,2000)&&integer(row.version)&&row.version>0&&date(row.reviewed_at)&&
      (row.status==='graded'||row.grade_text===null));
    reviewed.add(row.upload_id);reviews.push({id:row.id,uploadId:row.upload_id,status:row.status as DtmSubmissionReview['status'],gradeText:row.grade_text,feedback:row.feedback,version:row.version,reviewedAt:row.reviewed_at});
  }
  valid(files.every(row=>row.state!=='retired'||reviewed.has(row.id)));
  return {assignmentId:assignment.id,userId:assignment.userId,courseId:assignment.courseId,dueAt:value.dueAt,maxBytes:dtmEditorMaxFileBytes,submission,files,reviews};
}
type Session={userId:string;accessToken:string};
export type DtmSubmissionsDependencies={getSession?:()=>Promise<Session|null>;fetch?:typeof fetch;storageUrl?:string;publishableKey?:string};
export function createDtmSubmissionsClient(userId:string,dependencies:DtmSubmissionsDependencies={}):DtmSubmissionsClient{
  const request=dependencies.fetch??globalThis.fetch;
  const storageUrl=(dependencies.storageUrl??import.meta.env?.VITE_SUPABASE_URL??'').replace(/\/$/,'');
  const key=dependencies.publishableKey??import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY??'';
  const getSession=dependencies.getSession??(async()=>{
    const {affairsClient}=await import('../features/public/affairs/authClient');
    const result=await affairsClient?.auth.getSession(),session=result?.data.session;
    return session?{userId:session.user.id,accessToken:session.access_token}:null;
  });
  async function auth(signal:AbortSignal){
    signal.throwIfAborted();const session=await getSession();signal.throwIfAborted();
    if(!id(userId)||session?.userId!==userId||!session.accessToken)throw new DtmSubmissionClientError('請重新登入同一個帳號。',401);
    return session.accessToken;
  }
  function storage(){valid(storageUrl==='https://xiftudmvxphxcjtmfmib.supabase.co'&&key.length>20);return storageUrl;}
  async function send(path:string,signal:AbortSignal,body?:unknown):Promise<unknown>{
    const token=await auth(signal);let response:Response;
    try{response=await request(path,{method:body===undefined?'GET':'POST',credentials:'omit',cache:'no-store',redirect:'error',
      headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});}
    catch{signal.throwIfAborted();throw new DtmSubmissionClientError('無法確認操作結果，請保留檔案並重試。',503,body!==undefined);}
    signal.throwIfAborted();
    if(!response.ok){await response.body?.cancel();throw new DtmSubmissionClientError(response.status===409?'作業資料已變更，請重新載入後確認。':
      response.status===401?'請重新登入同一個帳號。':response.status===403?'此帳號無法存取這份作業。':'作業操作未完成，請重試。',response.status,body!==undefined&&response.status>=500);}
    try{return await response.json();}catch{signal.throwIfAborted();throw new DtmSubmissionClientError('無法確認回應，請保留檔案並重試。',503,body!==undefined);}
  }
  async function change(kind:string,payload:DtmSubmissionChange|DtmSubmissionReviewInput,signal:AbortSignal){
    valid(id(payload.assignment_id)&&id(payload.request_id)&&id(payload.upload_id)&&integer(payload.expected_version,999999998));
    const review=kind==='save_dtm_submission_review';
    const row=await send('/api/'+(review?'affairs-manage':'affairs-action'),signal,{kind,payload});
    valid(object(row)&&row.kind===kind&&row.assignmentId===payload.assignment_id&&id(row.submissionId)&&row.uploadId===payload.upload_id&&
      row.version===payload.expected_version+(kind==='cancel_dtm_submission_upload'?0:1));
    valid(kind==='cancel_dtm_submission_upload'?row.cancelled===true:review?id(row.reviewId):date(row.submittedAt)&&date(row.contentModifiedAt));
    return {kind,assignmentId:row.assignmentId,submissionId:row.submissionId,uploadId:row.uploadId,version:row.version as number,
      ...(review?{reviewId:row.reviewId as string}:kind==='cancel_dtm_submission_upload'?{cancelled:true}:{submittedAt:row.submittedAt as string,contentModifiedAt:row.contentModifiedAt as string})};
  }
  return {
    async load(assignment,signal,admin=false){
      valid(id(assignment.userId)&&id(assignment.id)&&id(assignment.courseId)&&(admin||assignment.userId===userId));
      return parseDtmSubmissionWorkspace(await send('/api/affairs-data?scope='+(admin?'dtm-submission-admin':'dtm-submission')+'&assignment_id='+assignment.id,signal),assignment);
    },
    async begin(payload,signal){
      valid(id(payload.assignment_id)&&id(payload.request_id)&&integer(payload.expected_version,999999998)&&
        dtmEditorFileError({name:payload.filename,size:payload.size_bytes,type:payload.content_type})===null);
      const row=await send('/api/affairs-action',signal,{kind:'begin_dtm_submission_upload',payload});
      valid(object(row)&&row.kind==='begin_dtm_submission_upload'&&row.assignmentId===payload.assignment_id&&id(row.submissionId)&&id(row.uploadId)&&row.version===payload.expected_version&&
        row.bucket==='dtm-submissions'&&row.path===`${userId}/${row.submissionId}/${row.uploadId}`&&row.maxBytes===dtmEditorMaxFileBytes&&date(row.expiresAt));
      return {kind:row.kind,assignmentId:row.assignmentId,submissionId:row.submissionId,uploadId:row.uploadId,version:row.version as number,bucket:'dtm-submissions',path:row.path as string,expiresAt:row.expiresAt,maxBytes:dtmEditorMaxFileBytes};
    },
    commit:(payload,signal)=>change('commit_dtm_submission_upload',payload,signal),
    cancel:(payload,signal)=>change('cancel_dtm_submission_upload',payload,signal),
    review:(payload,signal)=>{valid(['graded','not_graded'].includes(payload.status)&&nullableText(payload.grade_text,80)&&nullableText(payload.feedback,2000)&&(payload.status==='graded'||payload.grade_text===null));return change('save_dtm_submission_review',payload,signal);},
    async upload(reservation,file,signal){
      const failure=dtmEditorFileError(file);if(failure)throw new DtmSubmissionClientError(failure,400);
      valid(id(reservation.submissionId)&&id(reservation.uploadId)&&reservation.path===`${userId}/${reservation.submissionId}/${reservation.uploadId}`&&reservation.bucket==='dtm-submissions');
      const token=await auth(signal);let response:Response;
      try{response=await request(storage()+'/storage/v1/object/dtm-submissions/'+reservation.path,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',
        headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':dtmEditorContentType(file.type)!,'x-upsert':'false'},body:file,
        signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});}
      catch{signal.throwIfAborted();throw new DtmSubmissionClientError('上傳結果尚未確認；重試時會先檢查這次儲存。',503,true);}
      await response.body?.cancel();signal.throwIfAborted();
      if(!response.ok)throw new DtmSubmissionClientError('上傳未確認，請保留檔案並重試。',response.status,true);
    },
    async download(assignment,file,signal){
      valid(id(assignment.id)&&id(assignment.userId)&&id(assignment.courseId)&&id(file.id)&&file.state!=='pending'&&file.path.split('/').length===3&&file.path.split('/').every(id)&&file.path.startsWith(assignment.userId+'/')&&
        dtmEditorFileError({name:file.filename,size:file.sizeBytes,type:file.contentType})===null);
      const capability=await send('/api/affairs-data?scope=dtm-submission-download&assignment_id='+assignment.id+'&upload_id='+file.id,signal);
      valid(object(capability)&&capability.uploadId===file.id&&capability.expiresIn===60&&typeof capability.signedUrl==='string');
      let destination:URL;try{destination=new URL(capability.signedUrl);}catch{throw new DtmSubmissionClientError('下載連結無效，請重試。');}
      valid(destination.origin===storage()&&destination.pathname==='/storage/v1/object/sign/dtm-submissions/'+file.path&&!destination.hash&&!destination.username&&!destination.password&&
        destination.searchParams.getAll('token').length===1&&Boolean(destination.searchParams.get('token'))&&destination.searchParams.get('token')!.length<=16384&&destination.searchParams.get('download')===file.filename);
      let response:Response;try{response=await request(destination.href,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});}
      catch{signal.throwIfAborted();throw new DtmSubmissionClientError('下載未完成，請重試。');}
      if(!response.ok){await response.body?.cancel();throw new DtmSubmissionClientError('下載未完成，請重新取得連結。',response.status);}
      const blob=await response.blob();signal.throwIfAborted();valid(blob.size===file.sizeBytes&&blob.size<=dtmEditorMaxFileBytes);return blob;
    },
  };
}

export function dtmSubmissionDetailReport(assignment:DtmSubmissionAssignment,data:DtmSubmissionWorkspaceData):DtmAssignmentDetailReport{
  valid(data.userId===assignment.userId&&data.assignmentId===assignment.id&&data.courseId===assignment.courseId);
  const current=data.files.find(file=>file.id===data.submission?.currentUploadId&&file.state==='current');
  const review=data.reviews.find(row=>row.uploadId===current?.id);
  return {id:assignment.id,userId:assignment.userId,courseId:assignment.courseId,title:assignment.title,
    submissionStatusText:current?'已繳交（本站紀錄）':'尚未繳交（本站紀錄）',gradingStatusText:review?.status==='graded'?'已評分（本站紀錄）':'尚未評分',
    gradingAppearance:review?.status==='graded'?null:'ungraded',dueAt:data.dueAt,timingText:null,timingAppearance:null,modifiedAt:data.submission?.modifiedAt??null,
    submittedFiles:current?[{id:current.id,filename:current.filename}]:[],excellentWorkText:null,canEditSubmission:true,
    ...(current?{}:{editLabel:'提交作業',editDescription:null})};
}

type Pending={file:File;begin:DtmSubmissionBegin;reservation:DtmSubmissionReservation|null;commit:DtmSubmissionChange|null;cancel:DtmSubmissionChange|null;uploadStarted:boolean;uploadConfirmed:boolean};
export type DtmSubmissionState={workspace:DtmSubmissionWorkspaceData|null;file:File|null;busy:boolean;status:'idle'|'uploading'|'saving';error:string;requiresReload:boolean};
/** One in-memory operation per account/assignment. Disposal aborts transport,
 * never cancels or removes a saved server file. No global cleanup is invoked. */
export class DtmSubmissionSession{
  readonly assignment:DtmSubmissionAssignment;private client:DtmSubmissionsClient;private controller=new AbortController();
  private listeners=new Set<()=>void>();private pending:Pending|null=null;private recoveredCancel:DtmSubmissionChange|null=null;
  private state:DtmSubmissionState={workspace:null,file:null,busy:false,status:'idle',error:'',requiresReload:false};
  constructor(assignment:DtmSubmissionAssignment,client:DtmSubmissionsClient){this.assignment=assignment;this.client=client;}
  getSnapshot=()=>this.state;
  get active(){return !this.controller.signal.aborted;}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  dispose(){this.controller.abort();this.pending=null;this.state={...this.state,file:null,workspace:null};this.listeners.clear();}
  private update(patch:Partial<DtmSubmissionState>){if(this.controller.signal.aborted)return;this.state={...this.state,...patch};for(const listener of this.listeners)listener();}
  private async run<T>(operation:()=>Promise<T>):Promise<T|undefined>{
    if(this.controller.signal.aborted||this.state.busy)return;
    this.update({busy:true,error:''});
    try{return await operation();}catch(error){if(!this.controller.signal.aborted)this.update({error:error instanceof DtmSubmissionClientError?error.message:'操作未完成，請保留檔案並重試。'});}
    finally{this.update({busy:false,status:'idle'});}
  }
  private async read(){
    this.controller.signal.throwIfAborted();
    const data=await this.client.load(this.assignment,this.controller.signal);this.controller.signal.throwIfAborted();
    valid(data.userId===this.assignment.userId&&data.assignmentId===this.assignment.id&&data.courseId===this.assignment.courseId);
    this.update({workspace:data});return data;
  }
  private completed(data:DtmSubmissionWorkspaceData){
    if(!this.pending?.reservation||data.submission?.currentUploadId!==this.pending.reservation.uploadId)return false;
    this.pending=null;this.recoveredCancel=null;this.update({file:null,requiresReload:false,error:''});return true;
  }
  async refresh(){return this.run(async()=>{
    const data=await this.read();if(this.completed(data))return true;
    if(this.state.requiresReload){
      const ownPending=data.files.find(file=>file.state==='pending'&&file.id===this.pending?.reservation?.uploadId);
      if(!ownPending)this.pending=null;
      this.update({requiresReload:false});
    }
    if(data.files.some(file=>file.state==='pending')&&!this.state.file)this.update({error:'仍有待儲存的上傳。重新選擇檔案會先取消該上傳；取消不會移除已儲存的檔案。'});
    return false;
  });}
  private async reservation(pending:Pending){
    if(!pending.reservation){pending.reservation=await this.client.begin(pending.begin,this.controller.signal);this.controller.signal.throwIfAborted();
      pending.commit={assignment_id:this.assignment.id,request_id:crypto.randomUUID(),expected_version:pending.begin.expected_version,upload_id:pending.reservation.uploadId};}
    return pending.reservation;
  }
  private async reconcileCancellation(error:unknown,uploadId:string){
    const data=await this.read();if(this.completed(data))return true;
    // Expired/cancelled reservations are intentionally absent from this
    // caller-scoped workspace. A successful read can release stale local
    // selection after a conflict; a failed read must retain its retry IDs.
    if(error instanceof DtmSubmissionClientError&&error.status===409&&!data.files.some(file=>file.id===uploadId&&file.state==='pending')){
      this.pending=null;this.recoveredCancel=null;this.update({file:null,requiresReload:false,error:''});return true;
    }
    return false;
  }
  private async cancelPending(){
    if(this.pending){
      const reservation=await this.reservation(this.pending);
      this.pending.cancel??={assignment_id:this.assignment.id,request_id:crypto.randomUUID(),expected_version:this.pending.begin.expected_version,upload_id:reservation.uploadId};
      try{await this.client.cancel(this.pending.cancel,this.controller.signal);}
      catch(error){if(await this.reconcileCancellation(error,reservation.uploadId))return;throw error;}
    }else{
      const pending=this.state.workspace?.files.find(file=>file.state==='pending');
      if(pending){this.recoveredCancel??={assignment_id:this.assignment.id,request_id:crypto.randomUUID(),expected_version:this.state.workspace?.submission?.version??0,upload_id:pending.id};
        try{await this.client.cancel(this.recoveredCancel,this.controller.signal);}
        catch(error){if(await this.reconcileCancellation(error,pending.id))return;throw error;}}
    }
    await this.read();this.pending=null;this.recoveredCancel=null;
  }
  async choose(file:File){return this.run(async()=>{
    const failure=dtmEditorFileError(file);if(failure)throw new DtmSubmissionClientError(failure,400);
    if(!this.state.workspace)await this.read();
    if(this.pending||this.state.workspace?.files.some(row=>row.state==='pending'))await this.cancelPending();
    this.update({file,requiresReload:false,error:''});
  });}
  async removePending(){return this.run(async()=>{await this.cancelPending();this.update({file:null,requiresReload:false});});}
  async cancel(){return this.run(async()=>{await this.cancelPending();this.update({file:null,requiresReload:false});return true;});}
  private async recover(error:unknown){
    try{const data=await this.read();if(this.completed(data))return true;}catch{/* Keep the original operation IDs and selected File if reconciliation also fails. */}
    if(error instanceof DtmSubmissionClientError&&error.status===409)this.update({requiresReload:true});
    throw error;
  }
  async save(){return this.run(async()=>{
    if(this.state.requiresReload)throw new DtmSubmissionClientError('請先重新載入並確認變更，再儲存所選檔案。',409);
    const file=this.state.file,failure=dtmEditorFileError(file);if(failure||!file)throw new DtmSubmissionClientError(failure??'請選擇檔案。',400);
    const data=this.state.workspace??await this.read();
    if(!this.pending&&data.files.some(row=>row.state==='pending'))throw new DtmSubmissionClientError('已有待儲存的上傳，請重新選擇檔案或取消。',409);
    this.pending??={file,begin:{assignment_id:this.assignment.id,request_id:crypto.randomUUID(),expected_version:data.submission?.version??0,
      filename:file.name,size_bytes:file.size,content_type:dtmEditorContentType(file.type)!},reservation:null,commit:null,cancel:null,uploadStarted:false,uploadConfirmed:false};
    const pending=this.pending;
    try{
      this.update({status:'saving'});const reservation=await this.reservation(pending);
      if(pending.uploadStarted&&!pending.uploadConfirmed){
        // A previous upload response was lost. Probe the same durable commit
        // first; only a still-pending, same-version reservation may be retried.
        try{await this.client.commit(pending.commit!,this.controller.signal);await this.read();this.pending=null;this.update({file:null});return true;}
        catch(error){
          if(!(error instanceof DtmSubmissionClientError)||error.status!==409)return await this.recover(error);
          const current=await this.read();if(this.completed(current))return true;
          if(current.submission?.version!==pending.begin.expected_version||!current.files.some(row=>row.id===reservation.uploadId&&row.state==='pending'))return await this.recover(error);
        }
      }
      if(!pending.uploadConfirmed){
        const retrying=pending.uploadStarted;pending.uploadStarted=true;this.update({status:'uploading'});
        try{await this.client.upload(reservation,file,this.controller.signal);pending.uploadConfirmed=true;}
        catch(error){if(!(retrying&&error instanceof DtmSubmissionClientError&&error.status===409))return await this.recover(error);}
      }
      this.controller.signal.throwIfAborted();this.update({status:'saving'});await this.client.commit(pending.commit!,this.controller.signal);
      // Receipt is durable even when refresh fails. Keep IDs/file until read
      // succeeds so retry recovers the same receipt, never starts a replacement.
      await this.read();this.pending=null;this.recoveredCancel=null;this.update({file:null,requiresReload:false});return true;
    }catch(error){return await this.recover(error);}
  });}
  async download(uploadId:string){return this.run(async()=>{
    const file=this.state.workspace?.files.find(row=>row.id===uploadId&&row.state!=='pending');
    if(!file)throw new DtmSubmissionClientError('目前無法下載這個檔案。',404);
    const blob=await this.client.download(this.assignment,file,this.controller.signal);this.controller.signal.throwIfAborted();return {blob,filename:file.filename};
  });}
}
