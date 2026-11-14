import {affairsClient} from '@/features/public/affairs/authClient';
import {certificateAwardScope,certificateProofBucket,certificateProofLimit,type CertificateWorkspace,
  type CertificateCatalogRow,type CertificateAwardReceipt,type CertificateProof,type ManagerAwardOp,type StudentAwardOp} from '../../server/certificateAwardsContract.js';
import {feeRemissionUuid as uuid} from '../../server/feeRemissionContract.js';
import type {AssistantResponse} from './researchAssistant';

export class CertificateAwardError extends Error{
  readonly status:number;
  constructor(status:number,message='證照資料暫時無法處理。'){super(message);this.status=status;}
}

async function access(userId:string,signal:AbortSignal){
  signal.throwIfAborted();
  const client=affairsClient;
  const result=await client?.auth.getSession();
  signal.throwIfAborted();
  if(!client||result?.error||result?.data.session?.user.id!==userId)throw new CertificateAwardError(401,'請重新登入校務系統。');
  return result.data.session.access_token;
}
async function request(userId:string,signal:AbortSignal|undefined,path:string,body?:object){
  const timeout=AbortSignal.timeout(18000),bounded=signal?AbortSignal.any([timeout,signal]):timeout;
  const token=await access(userId,bounded);
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:bounded,
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok){
    void response.body?.cancel().catch(()=>{});
    throw new CertificateAwardError(response.status,response.status===409?'請確認資料版本、證明文件與匯款資料。':undefined);
  }
  const result=await response.json();
  await access(userId,bounded);
  return result;
}
const endpoint=(params:Record<string,string>)=>'/api/affairs-data?'+new URLSearchParams({scope:certificateAwardScope,...params});

export async function loadCertificateWorkspace(userId:string,signal:AbortSignal,id?:string,target?:string):Promise<CertificateWorkspace>{
  const params:Record<string,string>={view:target?'manage':'mine'};
  if(id)params.id=id;
  if(target)params.user_id=target;
  const data=await request(userId,signal,endpoint(params));
  if(data?.userId!==(target??userId)||!Array.isArray(data.rows)||!Array.isArray(data.files)||
    data.files.some((file:CertificateProof)=>!uuid(file.id)||file.path!==`${target??userId}/${id}/${file.id}`))
    throw new CertificateAwardError(503);
  return data;
}
export async function loadCertificateCatalog(userId:string,signal:AbortSignal,query:Record<string,string>={}):Promise<{rows:CertificateCatalogRow[];total:number;page:number}>{
  const data=await request(userId,signal,endpoint({view:'catalog',...query}));
  if(!Array.isArray(data?.rows)||!Number.isInteger(data.total)||!Number.isInteger(data.page))throw new CertificateAwardError(503);
  return data;
}
export async function changeCertificateAward(userId:string,op:StudentAwardOp,payload:object,signal?:AbortSignal):Promise<CertificateAwardReceipt>{
  const data=await request(userId,signal,'/api/affairs-action',{kind:'certificate_award_'+op,payload});
  if(!uuid(data?.id)||!Number.isInteger(data.version))throw new CertificateAwardError(503);
  return data;
}
export function manageCertificateAward(userId:string,op:ManagerAwardOp,payload:object,signal?:AbortSignal){
  return request(userId,signal,'/api/affairs-manage',{kind:'certificate_award_'+op,payload});
}
export async function proofFileType(file:File):Promise<CertificateProof['contentType']>{
  if(file.size<5||file.size>certificateProofLimit)throw new CertificateAwardError(400,'請選擇 5 MiB 以下的 JPG 或 PDF。');
  const signature=new Uint8Array(await file.slice(0,5).arrayBuffer());
  if(signature[0]===255&&signature[1]===216&&signature[2]===255)return 'image/jpeg';
  if(new TextDecoder().decode(signature)==='%PDF-')return 'application/pdf';
  throw new CertificateAwardError(400,'請選擇有效的 JPG 或 PDF。');
}
async function storage(userId:string,signal:AbortSignal,path:string,method:string,body?:BodyInit,type?:string){
  const token=await access(userId,signal);
  const response=await fetch('https://xiftudmvxphxcjtmfmib.supabase.co/storage/v1/object/'+path,{
    method,body,signal,credentials:'omit',redirect:'error',cache:'no-store',
    headers:{apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,
      ...(type?{'Content-Type':type}:{}),...(method==='POST'?{'x-upsert':'false'}:{})},
  });
  await access(userId,signal);
  return response;
}
export async function uploadCertificateProof(userId:string,id:string,reservation:CertificateAwardReceipt,file:File,contentType:string,signal:AbortSignal){
  if(!uuid(reservation.fileId)||reservation.path!==`${userId}/${id}/${reservation.fileId}`)throw new CertificateAwardError(503);
  const response=await storage(userId,signal,certificateProofBucket+'/'+reservation.path,'POST',file,contentType);
  if(!response.ok){
    const detail=await response.json().catch(()=>null);
    if(response.status!==409&&!(response.status===400&&(detail?.error==='Duplicate'||detail?.statusCode==='409')))
      throw new CertificateAwardError(503,'檔案上傳未確認，請重試。');
  }else void response.body?.cancel().catch(()=>{});
}
export async function removeCertificateProof(userId:string,proof:CertificateProof,signal:AbortSignal){
  const response=await storage(userId,signal,certificateProofBucket,'DELETE',JSON.stringify({prefixes:[proof.path]}),'application/json');
  void response.body?.cancel().catch(()=>{});
  if(!response.ok)throw new CertificateAwardError(503,'無法移除未完成的上傳。');
}
export async function downloadCertificateProof(userId:string,proof:CertificateProof,signal:AbortSignal){
  if(!proof.attached)throw new CertificateAwardError(404);
  const response=await storage(userId,signal,'authenticated/'+certificateProofBucket+'/'+proof.path,'GET');
  if(!response.ok){void response.body?.cancel().catch(()=>{});throw new CertificateAwardError(404,'無法下載證明文件。');}
  const data=await response.blob();
  await access(userId,signal);
  if(data.size!==proof.sizeBytes)throw new CertificateAwardError(503);
  const url=URL.createObjectURL(new Blob([data],{type:'application/octet-stream'}));
  const link=document.createElement('a');link.href=url;link.download=proof.filename;link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function readCertificateAwardAnswer(userId:string,question:string,signal?:AbortSignal):Promise<AssistantResponse>{
  const value=await request(userId,signal,endpoint({view:'mine',answer:/[\u3400-\u9fff]/u.test(question)?'zh':'en'}));
  if(typeof value?.answer!=='string'||value.grounding?.source!=='account')throw new CertificateAwardError(503);
  return value;
}
