import { affairsClient } from '@/features/public/affairs/authClient';
import { clubRequest } from './clubServices';

const scope='club-activity-documents';
export const clubPdfLimit=2097152;
export type DocumentKind='proposal'|'closeout';
export type ClubDocument={kind:DocumentKind;filename:string|null;version:number;size:number|null;updatedAt:string|null;editable:boolean};
export type ClubDocuments={userId:string;applicationId:string;applicationVersion:number;rows:ClubDocument[]};
type DocumentTarget={application_id:string;application_version:number;kind:DocumentKind;expected_version:number;request_id:string};
type WriteReceipt={applicationId:string;kind:DocumentKind;version:number;filename:string|null};
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const version=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=1000000;
const query=(id:string,document?:ClubDocument)=>'/api/affairs-data?'+new URLSearchParams({
  scope,application_id:id,...(document?{download:document.kind,version:String(document.version)}:{}),
});

export async function loadClubDocuments(userId:string,applicationId:string,signal:AbortSignal):Promise<ClubDocuments> {
  const value=await clubRequest(userId,query(applicationId),signal);
  if(!object(value)||value.userId!==userId||value.applicationId!==applicationId||
    !version(value.applicationVersion)||!value.applicationVersion||!Array.isArray(value.rows)||value.rows.length!==2||
    !value.rows.every((row,index)=>object(row)&&row.kind===(index===0?'proposal':'closeout')&&version(row.version)&&
      typeof row.editable==='boolean'&&(row.updatedAt===null||typeof row.updatedAt==='string')&&
      (row.filename===null?row.size===null:typeof row.filename==='string'&&typeof row.size==='number'&&
        row.size>=5&&row.size<=clubPdfLimit))) throw new Error('無法確認附件清單。');
  return {userId,applicationId,applicationVersion:value.applicationVersion,rows:value.rows as ClubDocument[]};
}

export async function clubPdfContent(file:File):Promise<string> {
  if(!/\.pdf$/i.test(file.name)||file.name.length>120||file.size<5||file.size>clubPdfLimit)
    throw new Error('請選擇有效的 PDF 檔案（上限 2 MiB）。');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-')throw new Error('請選擇有效的 PDF 檔案。');
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=16384)binary+=String.fromCharCode(...bytes.subarray(offset,offset+16384));
  return btoa(binary);
}

export async function saveClubDocument(userId:string,target:DocumentTarget,signal:AbortSignal,file?:{filename:string;content:string}) {
  const kind=file?'upload_club_activity_document':'remove_club_activity_document';
  const value=await clubRequest(userId,'/api/affairs-action',signal,{kind,payload:{...target,...file}});
  if(!object(value)||value.applicationId!==target.application_id||value.kind!==target.kind||
    value.version!==target.expected_version+1||value.filename!==(file?.filename??null))
    throw new Error('無法確認附件操作。');
  return value as WriteReceipt;
}

export async function downloadClubDocument(userId:string,id:string,documentRow:ClubDocument,cancel:AbortSignal) {
  if(!documentRow.filename)throw new Error('找不到附件。');
  const signal=AbortSignal.any([cancel,AbortSignal.timeout(18000)]);
  const authorize=async()=> {
    signal.throwIfAborted();
    const result=await affairsClient?.auth.getSession();
    signal.throwIfAborted();
    if(result?.error||result?.data.session?.user.id!==userId)throw new Error('請重新登入校務系統。');
    return result.data.session.access_token;
  };
  const response=await fetch(query(id,documentRow),{
    credentials:'omit',redirect:'error',cache:'no-store',signal,headers:{Authorization:'Bearer '+await authorize()},
  });
  const size=Number(response.headers.get('content-length'));
  if(!response.ok||response.headers.get('content-type')!=='application/pdf'||
    !Number.isSafeInteger(size)||size<5||size>clubPdfLimit||size!==documentRow.size) {
    void response.body?.cancel().catch(()=>{});
    throw new Error('無法下載附件。');
  }
  const blob=await response.blob();
  if(blob.size!==size)throw new Error('無法確認附件檔案。');
  await authorize();
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  try {
    link.href=url;
    link.download=documentRow.filename;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}
