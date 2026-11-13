import {parseDtmCourseContentData,parseDtmCourseContentCoursesData,parseDtmCourseContentAssignmentData,parseDtmCourseContentReceipt as parseReceipt,validateDtmCourseContentPayload,dtmCourseContentMaxResponseBytes} from '../../server/dtmCourseContent.js';
import type {DtmCourseContentAction,DtmCourseContentData,DtmCourseContentReceipt,DtmCourseContentCoursesData,DtmCourseContentAssignmentData,DtmCourseContentCursor,DtmCourseContentActivity,DtmCourseContentSection} from '../../server/dtmCourseContent.js';
import type {DtmMaterial} from './schoolAffairsWorkspace';
export type {DtmCourseContent,DtmCourseContentRecord,DtmCourseContentReference,DtmCourseContentActivity,DtmCourseContentCourse,DtmCourseContentData,DtmCourseContentCoursesData,DtmCourseContentAssignment,DtmCourseContentAssignmentData,DtmCourseContentAction,DtmCourseContentReceipt,DtmCourseContentCursor,DtmCourseContentSection} from '../../server/dtmCourseContent.js';
export {parseDtmCourseContentData,parseDtmCourseContentCoursesData,parseDtmCourseContentAssignmentData};
export const dtmCourseContentSections=[{key:'assignments',zh:'作業區',en:'Assignments'},{key:'quizzes',zh:'測驗區',en:'Quizzes'},{key:'materials',zh:'教材區',en:'Course materials'}] as const;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export class DtmCourseContentClientError extends Error {status:number;constructor(message:string,status=503){super(message);this.name='DtmCourseContentClientError';this.status=status;}}
const malformed=()=>new DtmCourseContentClientError('課程內容尚無法確認，請重新載入。');
export type DtmCourseContentPageOptions={afterKind?:'assignment'|'material';afterId?:string};
export type DtmCourseContentClient={
 load:(userId:string,courseId:string,options?:DtmCourseContentPageOptions,signal?:AbortSignal)=>Promise<DtmCourseContentData>;
 loadAdmin:(managerId:string,userId:string,courseId:string,options?:DtmCourseContentPageOptions,signal?:AbortSignal)=>Promise<DtmCourseContentData>;
 loadCoursesAdmin:(managerId:string,userId:string,options?:{afterId?:string},signal?:AbortSignal)=>Promise<DtmCourseContentCoursesData>;
 loadAssignment:(userId:string,courseId:string,assignmentId:string,signal?:AbortSignal)=>Promise<DtmCourseContentAssignmentData>;
 manage:(managerId:string,action:DtmCourseContentAction,signal?:AbortSignal)=>Promise<DtmCourseContentReceipt>;
};
export type DtmCourseContentSessionReader=()=>Promise<{userId:string;token:string}|null>;
export function parseDtmCourseContentReceipt(value:unknown,action:DtmCourseContentAction):DtmCourseContentReceipt{try{return parseReceipt(value,action.kind,action.payload);}catch{throw malformed();}}
const parse=<T,>(fn:()=>T):T=>{try{return fn();}catch{throw malformed();}};
function within<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
async function jsonWithin(response:Response,signal:AbortSignal,limit:number):Promise<unknown>{
  if(!response.body||Number(response.headers.get('content-length'))>limit){void response.body?.cancel().catch(()=>{});throw malformed();}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,value='';
  try{for(;;){const part=await within(()=>reader.read(),signal);if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw malformed();value+=decoder.decode(part.value,{stream:true});}return JSON.parse(value+decoder.decode()) as unknown;}
  catch(error){void reader.cancel().catch(()=>{});if(signal.aborted)throw error;throw malformed();}finally{reader.releaseLock();}
}
export function createDtmCourseContentClient(readSession:DtmCourseContentSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),timeoutMs=30000):DtmCourseContentClient {
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Course-content timeout must be between 1 and 30000ms.');
  async function request(callerId:string,path:string,signal?:AbortSignal,action?:DtmCourseContentAction){
    if(!uuid(callerId))throw new DtmCourseContentClientError('請重新登入校務系統。',401);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Course-content request timed out.','TimeoutError')),timeoutMs);
    const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    async function session(){
      let current:Awaited<ReturnType<DtmCourseContentSessionReader>>;
      try{current=await within(readSession,bounded);}catch(error){if(bounded.aborted)throw error;throw new DtmCourseContentClientError('登入狀態暫時無法確認，請重試。');}
      if(!current||current.userId!==callerId||typeof current.token!=='string'||!current.token)throw new DtmCourseContentClientError('登入帳戶已變更，請重新登入校務系統。',401);return current;
    }
    try{
      const before=await session();let response:Response;
      try{response=await within(()=>fetcher(path,{method:action?'POST':'GET',headers:{Authorization:'Bearer '+before.token,Accept:'application/json',...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:bounded}),bounded);}
      catch(error){if(bounded.aborted)throw error;throw new DtmCourseContentClientError('教材網課程內容暫時無法連線，請保留草稿並重試。');}
      if(!response.ok){void response.body?.cancel().catch(()=>{});await session();const status=[400,401,403,409].includes(response.status)?response.status:503;
        throw new DtmCourseContentClientError(status===409?'此課程的課程內容已變更，請重新載入後比較再儲存。':status===401?'登入已逾時，請重新登入。':status===403?'目前帳戶無法執行此課程內容操作。':status===400?'請檢查課程內容欄位。':'教材網課程內容暫時無法確認，請保留草稿並重試。',status);}
      const result=await jsonWithin(response,bounded,action?4096:dtmCourseContentMaxResponseBytes);await session();bounded.throwIfAborted();return result;
    }catch(error){if(signal?.aborted)throw signal.reason;if(controller.signal.aborted)throw new DtmCourseContentClientError('教材網課程內容查詢逾時，請保留草稿並重試。',504);throw error;}finally{clearTimeout(timer);}
  }

 const target=(userId:string,courseId?:string)=>{if(!uuid(userId)||(courseId!==undefined&&!uuid(courseId)))throw new DtmCourseContentClientError('請選擇有效的帳戶及課程。',400);};
 function cursor(options:DtmCourseContentPageOptions):DtmCourseContentCursor|undefined{
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['afterKind','afterId'].includes(key)))throw new DtmCourseContentClientError('課程內容頁碼無效。',400);
  if(Object.keys(options).length===0)return undefined;
  if(Object.keys(options).length!==2||!['assignment','material'].includes(options.afterKind??'')||!uuid(options.afterId))throw new DtmCourseContentClientError('課程內容頁碼無效。',400);
  return {kind:options.afterKind!,id:options.afterId};
 }
 const suffix=(after:DtmCourseContentCursor|undefined)=>after?'&after_kind='+after.kind+'&after_id='+after.id:'';
 return {
  load:async(userId,courseId,options={},signal)=>{target(userId,courseId);const after=cursor(options);const value=await request(userId,'/api/affairs-data?scope=dtm-course-content&course_id='+courseId+suffix(after),signal);return parse(()=>parseDtmCourseContentData(value,userId,courseId,after));
  },
  loadAdmin:async(managerId,userId,courseId,options={},signal)=>{target(userId,courseId);const after=cursor(options);const value=await request(managerId,'/api/affairs-data?scope=dtm-course-content-admin&user_id='+userId+'&course_id='+courseId+suffix(after),signal);return parse(()=>parseDtmCourseContentData(value,userId,courseId,after));},
  loadCoursesAdmin:async(managerId,userId,options={},signal)=>{target(userId);if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='afterId')||Object.hasOwn(options,'afterId')&&!uuid(options.afterId))throw new DtmCourseContentClientError('課程頁碼無效。',400);const afterId=options.afterId;
    const value=await request(managerId,'/api/affairs-data?scope=dtm-course-content-courses-admin&user_id='+userId+(afterId?'&after_id='+afterId:''),signal);return parse(()=>parseDtmCourseContentCoursesData(value,userId,afterId));},
  loadAssignment:async(userId,courseId,assignmentId,signal)=>{target(userId,courseId);if(!uuid(assignmentId))throw new DtmCourseContentClientError('作業識別碼無效。',400);const value=await request(userId,'/api/affairs-data?scope=dtm-course-content-assignment&course_id='+courseId+'&assignment_id='+assignmentId,signal);return parse(()=>parseDtmCourseContentAssignmentData(value,userId,courseId,assignmentId));},
  manage:async(managerId,input,signal)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'kind')||!Object.hasOwn(input,'payload'))throw new DtmCourseContentClientError('請使用完整的課程內容操作。',400);
    const invalid=validateDtmCourseContentPayload(input.kind,input.payload);if(invalid)throw new DtmCourseContentClientError(invalid,400);const action=structuredClone(input);return parseDtmCourseContentReceipt(await request(managerId,'/api/affairs-manage',signal,action),action);},
 };
}
export const dtmCourseContentClient=createDtmCourseContentClient(async()=>{const {affairsClient}=await import('../features/public/affairs/authClient');if(!affairsClient)return null;const {data,error}=await affairsClient.auth.getSession();return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;});

export type DtmCourseContentSnapshot=Omit<DtmCourseContentData,'limit'|'nextCursor'>;
export type DtmCourseContentPageLoader=(options:DtmCourseContentPageOptions,signal:AbortSignal)=>Promise<DtmCourseContentData>;
export const dtmCourseActivityKey=(value:{kind:string;id:string})=>value.kind+':'+value.id;
const snapshotStamp=(page:DtmCourseContentData)=>JSON.stringify([page.revision,page.total,page.unavailableReferenceCount,
 page.course.id,page.course.userId,page.course.title,page.course.code,page.course.term,
 page.content&&[page.content.id,page.content.userId,page.content.courseId,page.content.sourceMode,page.content.version,page.content.createdAt,page.content.updatedAt,page.content.references.map(ref=>[ref.kind,ref.id,ref.section])]]);
/** Assemble a verified complete revision. Limits fail visibly, never truncate. */
export async function loadAllDtmCourseContent(loadPage:DtmCourseContentPageLoader,userId:string,courseId:string,signal?:AbortSignal,timeoutMs=30000):Promise<DtmCourseContentSnapshot>{
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid course-content load timeout.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Course content load timed out.','TimeoutError')),timeoutMs);
 const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 let first:DtmCourseContentData|undefined,after:DtmCourseContentCursor|undefined,bytes=0;const activities:DtmCourseContentActivity[]=[],seen=new Set<string>(),encoder=new TextEncoder();
 try{for(;;){
  bounded.throwIfAborted();const raw=await within(()=>loadPage(after?{afterKind:after.kind,afterId:after.id}:{},bounded),bounded);
  const page=parse(()=>parseDtmCourseContentData(raw,userId,courseId,after));bounded.throwIfAborted();
  if(first&&snapshotStamp(page)!==snapshotStamp(first))throw new DtmCourseContentClientError('課程內容已變更，請重新載入完整資料。',409);
  if(!first){first=page;bytes=encoder.encode(JSON.stringify({course:page.course,content:page.content})).byteLength;}
  for(const activity of page.activities){const key=dtmCourseActivityKey(activity);if(seen.has(key))throw malformed();seen.add(key);bytes+=encoder.encode(JSON.stringify(activity)).byteLength+1;if(bytes>4*1024*1024)throw new DtmCourseContentClientError('課程內容超過此次完整載入的容量，請稍後重試。');activities.push(activity);}
  if(activities.length>first.total||page.nextCursor!==null&&(page.activities.length!==100||activities.length>=first.total))throw malformed();
  if(page.nextCursor===null){
   if(activities.length!==first.total)throw malformed();
   const unavailable=(first.content?.references??[]).filter(ref=>!seen.has(dtmCourseActivityKey(ref))).length;
   if(unavailable!==first.unavailableReferenceCount)throw malformed();
   return {course:first.course,content:first.content,activities,total:first.total,revision:first.revision,unavailableReferenceCount:unavailable};
  }
  after=page.nextCursor;
 }}catch(error){if(signal?.aborted)throw signal.reason;if(controller.signal.aborted)throw new DtmCourseContentClientError('課程內容載入逾時，請重新載入完整資料。',504);throw error;}finally{clearTimeout(timer);}
}
export function orderedDtmCourseSections(snapshot:DtmCourseContentSnapshot):Record<DtmCourseContentSection,DtmCourseContentActivity[]>{
 const sections:Record<DtmCourseContentSection,DtmCourseContentActivity[]>={assignments:[],quizzes:[],materials:[]},byId=new Map(snapshot.activities.map(row=>[dtmCourseActivityKey(row),row])),placed=new Set<string>();
 for(const ref of snapshot.content?.references??[]){const key=dtmCourseActivityKey(ref),row=byId.get(key);if(row&&!placed.has(key)){sections[ref.section].push(row);placed.add(key);}}
 const remaining=snapshot.activities.filter(row=>!placed.has(dtmCourseActivityKey(row)));
 const assignments=remaining.filter((row):row is Extract<DtmCourseContentActivity,{kind:'assignment'}>=>row.kind==='assignment').sort((a,b)=>{
  const dateA=a.dueAt===null?Infinity:Date.parse(a.dueAt),dateB=b.dueAt===null?Infinity:Date.parse(b.dueAt);return (dateA<dateB?-1:dateA>dateB?1:0)||a.id.localeCompare(b.id,'en');});
 const materials=remaining.filter((row):row is Extract<DtmCourseContentActivity,{kind:'material'}>=>row.kind==='material').sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id,'en'));
 sections.assignments.push(...assignments);sections.materials.push(...materials);return sections;
}
export function dtmCourseMaterial(activity:Extract<DtmCourseContentActivity,{kind:'material'}>):DtmMaterial{return {id:activity.id,title:activity.title,kind:activity.materialKind,summary:activity.summary,position:activity.position,sourceMode:activity.sourceMode,sourceUrl:activity.sourceUrl};}
