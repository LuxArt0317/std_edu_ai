import { AffairsWorkspaceError } from './affairsWorkspace.js';
import { clubRpc } from './clubServices.js';
import { clubUuid } from './clubServicesContract.js';

export const clubDocumentScope='club-activity-documents';
export const clubDocumentLimit=2097152;
export const clubDocumentJsonLimit=2797200;
export const clubDocumentActions=['upload_club_activity_document','remove_club_activity_document'];
const kinds=['proposal','closeout'];
const validId=value=>typeof value==='string'&&clubUuid.test(value)&&value===value.toLowerCase();
const messages={
  400:'請選擇有效的 PDF 檔案（上限 2 MiB）。',401:'請重新登入校務系統。',403:'無法存取此附件。',
  404:'找不到可存取的申請或附件。',409:'申請或附件已變更，請重新載入。',
};

export async function readClubDocuments(account,query) {
  const {scope,application_id,download,version,...extra}=query;
  if(scope!==clubDocumentScope||Object.keys(extra).length||!validId(application_id)||
    (download===undefined?version!==undefined:!kinds.includes(download)||
      typeof version!=='string'||!/^([1-9][0-9]{0,5}|1000000)$/u.test(version)))
    throw new AffairsWorkspaceError('附件查詢參數有誤。',400);
  const response=await clubRpc(account,'affairs_read_club_activity_documents',{
    p_application_id:application_id,p_download_kind:download??null,
  },messages);
  if(response?.userId!==account.user.id||response.applicationId!==application_id)
    throw new AffairsWorkspaceError('無法確認附件資料。',503);
  if(!download)return response;
  const file=response.file;
  if(file?.kind!==download||typeof file.filename!=='string'||typeof file.content!=='string'||
    file.content.length>2834000||!/^[A-Za-z0-9+/=\s]+$/u.test(file.content))
    throw new AffairsWorkspaceError('無法確認附件檔案。',503);
  if(file.version!==Number(version))throw new AffairsWorkspaceError(messages[409],409);
  const bytes=Buffer.from(file.content,'base64');
  if(bytes.length>clubDocumentLimit||bytes.subarray(0,5).toString('ascii')!=='%PDF-')
    throw new AffairsWorkspaceError('無法確認附件檔案。',503);
  return {filename:file.filename,bytes};
}

export async function writeClubDocument(account,kind,payload) {
  if(!clubDocumentActions.includes(kind)||!validId(payload?.application_id))
    throw new AffairsWorkspaceError('附件操作有誤。',400);
  const operation=kind==='upload_club_activity_document'?'upload':'remove';
  const response=await clubRpc(account,'affairs_write_club_activity_document',{p_operation:operation,p_payload:payload},messages);
  if(response?.applicationId!==payload?.application_id||response?.kind!==payload?.kind||
    response?.version!==payload?.expected_version+1||
    response?.filename!==(operation==='upload'?payload.filename:null))
    throw new AffairsWorkspaceError('無法確認附件操作。',503);
  return response;
}
