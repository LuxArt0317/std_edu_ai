import {parseDtmGradeReportData,parseDtmGradeReportCoursesData,parseDtmGradeReportOverviewData,parseDtmGradeReportReceipt as parseReceipt,validateDtmGradeReportPayload,dtmGradeReportMaxResponseBytes} from '../../server/dtmGradeReport.js';
import type {DtmGradeCells,DtmGradeReportAction,DtmGradeReportData,DtmGradeReportReceipt,DtmGradeReportCoursesData,DtmGradeReportOverviewData} from '../../server/dtmGradeReport.js';
export type {DtmGradeCells,DtmGradeReportItem,DtmGradeReportContent,DtmGradeReportRecord,DtmGradeReportData,DtmGradeReportAction,DtmGradeReportReceipt,DtmGradeReportKind,DtmGradeReportCourse,DtmGradeReportCoursesData,DtmGradeReportOverviewData} from '../../server/dtmGradeReport.js';

export const dtmGradeReportTextFields=[
  {key:'weightText',label:'計算後權量原文'}, {key:'weightNote',label:'權量附註原文'},
  {key:'gradeText',label:'成績原文'}, {key:'rangeText',label:'全距原文'},
  {key:'percentageText',label:'百分比原文'}, {key:'rankText',label:'排名原文'},
  {key:'feedbackText',label:'回饋原文'}, {key:'contributionText',label:'貢獻到課程總分原文'},
] as const;
export const emptyDtmGradeCells=():DtmGradeCells=>({score:null,maximum:null,weightText:null,weightNote:null,gradeText:null,rangeText:null,percentageText:null,rankText:null,feedbackText:null,contributionText:null});
export const dtmGradeLiteral=(value:string|null)=>value===null?'-':value;
export const dtmGradeUuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export class DtmGradeReportClientError extends Error {
  status:number;
  constructor(message:string,status=503){super(message);this.name='DtmGradeReportClientError';this.status=status;}
}
const malformed=()=>new DtmGradeReportClientError('教材網成績報告資料尚無法確認，請重新載入。');
export function parseDtmGradeReport(value:unknown,userId:string,courseId:string):DtmGradeReportData {
  try{return parseDtmGradeReportData(value,userId,courseId);}catch{throw malformed();}
}
export function parseDtmGradeCourses(value:unknown,userId:string,afterId?:string):DtmGradeReportCoursesData {
  try{return parseDtmGradeReportCoursesData(value,userId,afterId);}catch{throw malformed();}
}
export {parseDtmGradeReportOverviewData};
export type DtmGradeReportClient={
  loadOverview:(userId:string,options?:{afterId?:string},signal?:AbortSignal)=>Promise<DtmGradeReportOverviewData>;
  load:(userId:string,courseId:string,signal?:AbortSignal)=>Promise<DtmGradeReportData>;
  loadCoursesAdmin:(managerId:string,userId:string,options?:{afterId?:string},signal?:AbortSignal)=>Promise<DtmGradeReportCoursesData>;
  loadAdmin:(managerId:string,userId:string,courseId:string,signal?:AbortSignal)=>Promise<DtmGradeReportData>;
  manage:(managerId:string,action:DtmGradeReportAction,signal?:AbortSignal)=>Promise<DtmGradeReportReceipt>;
};
export type DtmGradeReportSessionReader=()=>Promise<{userId:string;token:string}|null>;
export function parseDtmGradeReportReceipt(value:unknown,action:DtmGradeReportAction):DtmGradeReportReceipt {
  try{return parseReceipt(value,action.kind,action.payload);}catch{throw malformed();}
}
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
export function createDtmGradeReportClient(readSession:DtmGradeReportSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),timeoutMs=30000):DtmGradeReportClient {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Grade-report timeout must be between 1 and 30000ms.');
  async function request(callerId:string,path:string,signal?:AbortSignal,action?:DtmGradeReportAction){
    if(!dtmGradeUuid(callerId))throw new DtmGradeReportClientError('請重新登入校務系統。',401);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('Grade-report request timed out.','TimeoutError')),timeoutMs);
    const bounded=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    async function session(){
      let current:Awaited<ReturnType<DtmGradeReportSessionReader>>;
      try{current=await within(readSession,bounded);}catch(error){if(bounded.aborted)throw error;throw new DtmGradeReportClientError('登入狀態暫時無法確認，請重試。');}
      if(!current||current.userId!==callerId||typeof current.token!=='string'||!current.token)throw new DtmGradeReportClientError('登入帳戶已變更，請重新登入校務系統。',401);return current;
    }
    try{
      const before=await session();let response:Response;
      try{response=await within(()=>fetcher(path,{method:action?'POST':'GET',headers:{Authorization:'Bearer '+before.token,Accept:'application/json',...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify(action)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:bounded}),bounded);}
      catch(error){if(bounded.aborted)throw error;throw new DtmGradeReportClientError('教材網成績報告暫時無法連線，請保留草稿並重試。');}
      if(!response.ok){void response.body?.cancel().catch(()=>{});await session();const status=[400,401,403,409].includes(response.status)?response.status:503;
        throw new DtmGradeReportClientError(status===409?'此課程的成績報告已變更，請重新載入後比較再儲存。':status===401?'登入已逾時，請重新登入。':status===403?'目前帳戶無法執行此成績報告操作。':status===400?'請檢查成績報告欄位。':'教材網成績報告暫時無法確認，請保留草稿並重試。',status);}
      const result=await jsonWithin(response,bounded,action?4096:dtmGradeReportMaxResponseBytes);await session();bounded.throwIfAborted();return result;
    }catch(error){if(signal?.aborted)throw signal.reason;if(controller.signal.aborted)throw new DtmGradeReportClientError('教材網成績報告查詢逾時，請保留草稿並重試。',504);throw error;}finally{clearTimeout(timer);}
  }
  const validTarget=(userId:string,courseId:string)=>{if(!dtmGradeUuid(userId)||!dtmGradeUuid(courseId))throw new DtmGradeReportClientError('請選擇有效的帳戶及課程。',400);};
  return {
    loadOverview:async(userId,options={},signal)=>{
      if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='afterId')||options.afterId!==undefined&&!dtmGradeUuid(options.afterId))throw new DtmGradeReportClientError('請選擇有效的課程頁碼。',400);
      const afterId=options.afterId;
      const value=await request(userId,'/api/affairs-data?scope=dtm-grade-report-overview'+(afterId?'&after_id='+afterId:''),signal);
      try{return parseDtmGradeReportOverviewData(value,userId,afterId);}catch{throw malformed();}
    },
    load:async(userId,courseId,signal)=>{validTarget(userId,courseId);return parseDtmGradeReport(await request(userId,'/api/affairs-data?scope=dtm-grade-report&course_id='+courseId,signal),userId,courseId);},
    loadCoursesAdmin:async(managerId,userId,options={},signal)=>{
      if(!dtmGradeUuid(userId)||!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='afterId')||options.afterId!==undefined&&!dtmGradeUuid(options.afterId))throw new DtmGradeReportClientError('請選擇有效的學生帳戶與課程頁碼。',400);
      const afterId=options.afterId;
      return parseDtmGradeCourses(await request(managerId,'/api/affairs-data?scope=dtm-grade-report-courses-admin&user_id='+userId+(afterId?'&after_id='+afterId:''),signal),userId,afterId);
    },
    loadAdmin:async(managerId,userId,courseId,signal)=>{validTarget(userId,courseId);return parseDtmGradeReport(await request(managerId,'/api/affairs-data?scope=dtm-grade-report-admin&user_id='+userId+'&course_id='+courseId,signal),userId,courseId);},
    manage:async(managerId,input,signal)=>{
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'kind')||!Object.hasOwn(input,'payload'))throw new DtmGradeReportClientError('請使用完整的成績報告操作。',400);
      const invalid=validateDtmGradeReportPayload(input.kind,input.payload);if(invalid)throw new DtmGradeReportClientError(invalid,400);
      // Capture the whole nested command before session resolution or any other await.
      const action=structuredClone(input);
      return parseDtmGradeReportReceipt(await request(managerId,'/api/affairs-manage',signal,action),action);
    },
  };
}
export const dtmGradeReportClient=createDtmGradeReportClient(async()=>{
  const {affairsClient}=await import('../features/public/affairs/authClient');if(!affairsClient)return null;
  const {data,error}=await affairsClient.auth.getSession();return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;
});
