import {enrollmentCertificateTimestamp,type EnrollmentCertificateAssessment,type EnrollmentCertificateRecords,type EnrollmentCertificateSnapshot} from './enrollmentCertificate';

type Session={userId:string;token:string}|null;
export type EnrollmentCertificateSessionReader=()=>Promise<Session>;
export class EnrollmentCertificateClientError extends Error{
  status:number;
  constructor(message:string,status=503){super(message);this.name='EnrollmentCertificateClientError';this.status=status;}
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value:unknown,max:number)=>value===null||typeof value==='string'&&[...value].length<=max&&[...value].every(char=>{const code=char.codePointAt(0)!;return code!==0&&!(code>=0xd800&&code<=0xdfff);});
const integer=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isInteger(value)&&value>=min&&value<=max;
const timestamp=(value:unknown)=>typeof value==='string'&&enrollmentCertificateTimestamp(value)!=='—';
function valid(condition:unknown):asserts condition{if(!condition)throw new EnrollmentCertificateClientError('在學證明條件資料格式不正確，請重新載入。');}
/** This batch accepts no documents. Metadata alone can never activate an open action. */
export function parseEnrollmentCertificateData(value:unknown,userId:string):EnrollmentCertificateRecords{
  valid(uuid(userId)&&object(value)&&exact(value,['assessments','documents'])&&Array.isArray(value.assessments)&&value.assessments.length<=1&&Array.isArray(value.documents)&&value.documents.length===0);
  const rows:EnrollmentCertificateAssessment[]=[];
  for(const row of value.assessments){
    valid(object(row)&&exact(row,['id','userId','sourceMode','version','createdAt','updatedAt','academicYear','semester','hasPendingFees','status','resultText','assessedAt','identity'])&&
      uuid(row.id)&&row.userId===userId&&row.sourceMode==='local_demo'&&integer(row.version,1,999999999)&&timestamp(row.createdAt)&&timestamp(row.updatedAt)&&
      (row.academicYear===null||integer(row.academicYear,1,9999))&&(row.semester===null||integer(row.semester,1,3))&&[null,'Y','N'].includes(row.hasPendingFees as null|string)&&
      typeof row.status==='string'&&['unknown','blocked','local_eligible'].includes(row.status)&&text(row.resultText,500)&&(row.assessedAt===null||timestamp(row.assessedAt))&&object(row.identity));
    const identity=row.identity;
    valid(exact(identity,['studentNumber','studentName','departmentName','yearText','classLabel'])&&text(identity.studentNumber,80)&&text(identity.studentName,160)&&
      text(identity.departmentName,160)&&text(identity.yearText,30)&&text(identity.classLabel,80));
    rows.push(row as unknown as EnrollmentCertificateAssessment);
  }
  return {assessments:rows,documents:[]};
}
function sessionWithin(readSession:EnrollmentCertificateSessionReader,signal:AbortSignal):Promise<Session>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(readSession).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolve(value);},()=>{
      signal.removeEventListener('abort',abort);reject(new EnrollmentCertificateClientError('登入狀態暫時無法確認，請稍後再試。'));
    });
  });
}
/** Dependency boundary makes session changes/aborts testable without a real auth session. */
export function createEnrollmentCertificateLoader(readSession:EnrollmentCertificateSessionReader,fetcher:typeof fetch=globalThis.fetch.bind(globalThis)){
  return async(userId:string,signal?:AbortSignal):Promise<EnrollmentCertificateSnapshot>=>{
    if(!uuid(userId))throw new EnrollmentCertificateClientError('請重新登入校務系統。',401);
    const bounded=signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);
    bounded.throwIfAborted();const session=await sessionWithin(readSession,bounded);bounded.throwIfAborted();
    if(!session||session.userId!==userId||typeof session.token!=='string'||!session.token)throw new EnrollmentCertificateClientError('登入帳戶已變更，請重新登入校務系統。',401);
    let response:Response;
    try{response=await fetcher('/api/affairs-data?scope=enrollment-certificate',{method:'GET',headers:{Authorization:`Bearer ${session.token}`,Accept:'application/json'},credentials:'omit',cache:'no-store',redirect:'error',signal:bounded});}
    catch(error){if(bounded.aborted)throw error;throw new EnrollmentCertificateClientError('在學證明條件資料暫時無法載入，請稍後再試。');}
    bounded.throwIfAborted();
    if(!response.ok)throw new EnrollmentCertificateClientError(response.status===401?'登入已逾時，請重新登入校務系統。':response.status===403?'目前帳戶無法讀取這份在學證明條件資料。':'在學證明條件資料暫時無法載入，請稍後再試。',[401,403].includes(response.status)?response.status:503);
    const body:unknown=await response.json().catch(()=>{throw new EnrollmentCertificateClientError('在學證明條件資料格式不正確，請重新載入。');});
    bounded.throwIfAborted();const current=await sessionWithin(readSession,bounded);bounded.throwIfAborted();
    if(!current||current.userId!==userId)throw new EnrollmentCertificateClientError('登入帳戶已變更，請重新載入。',401);
    return {profile:{userId},checkedAt:new Date().toISOString(),enrollmentCertificate:parseEnrollmentCertificateData(body,userId)};
  };
}
/** Uses only the independent School Affairs auth client, never the Nexus session. */
export const loadEnrollmentCertificateData=createEnrollmentCertificateLoader(async()=>{
  const {affairsClient}=await import('../features/public/affairs/authClient');
  if(!affairsClient)return null;
  const {data,error}=await affairsClient.auth.getSession();
  return !error&&data.session?{userId:data.session.user.id,token:data.session.access_token}:null;
});
