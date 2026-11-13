import {useId,useRef,useState} from 'react';
import {dtmAssignmentDetailLabels,dtmAssignmentPdfIcon,dtmAssignmentTimestamp,dtmPrivateFileHref,ownDtmAssignmentDetail,type DtmAssignmentDetailReport} from '../../../services/dtmAssignmentDetail';
import './dtmAssignmentDetail.css';

export type DtmAssignmentDetailProps={
  userId:string;courseId?:string;report:DtmAssignmentDetailReport|null;
  busy?:boolean;error?:string;onReload?:()=>void;
  approvedPrivateFileHrefs?:readonly string[];
  onEdit?:(assignmentId:string)=>void|Promise<void>;
  onDownload?:(uploadId:string)=>void|Promise<void>;
};
function Timestamp({value}:{value:string|null}) {
  const label=dtmAssignmentTimestamp(value);
  return label==='—'?<>—</>:<time dateTime={value!}>{label}</time>;
}
function Report({report,busy,onEdit,onDownload,approvedPrivateFileHrefs=[]}:{report:DtmAssignmentDetailReport;busy:boolean;onEdit?:DtmAssignmentDetailProps['onEdit'];onDownload?:DtmAssignmentDetailProps['onDownload'];approvedPrivateFileHrefs?:readonly string[]}) {
  const [editing,setEditing]=useState(false),[editError,setEditError]=useState('');
  const inFlight=useRef(false);
  async function edit(){
    if(inFlight.current||busy||!onEdit||report.canEditSubmission!==true)return;
    inFlight.current=true;setEditing(true);setEditError('');
    try{await onEdit(report.id);}catch(reason){setEditError(reason instanceof Error?reason.message:'無法開啟作業編輯，請重試。');}
    finally{inFlight.current=false;setEditing(false);}
  }
  async function download(uploadId:string){
    if(inFlight.current||busy||!onDownload)return;
    inFlight.current=true;setEditing(true);setEditError('');
    try{await onDownload(uploadId);}catch{setEditError('下載未完成，請重試。');}
    finally{inFlight.current=false;setEditing(false);}
  }
  const values=[report.submissionStatusText??'—',report.gradingStatusText??'—',<Timestamp key="due" value={report.dueAt}/>,
    report.timingText??'—',<Timestamp key="modified" value={report.modifiedAt}/>,
    report.submittedFiles===null?'—':<ul className="dtm-assignment-files" key="files">{report.submittedFiles.map((file,index)=>{
      const href=dtmPrivateFileHref(file.href,approvedPrivateFileHrefs);
      const content=<>{/\.pdf$/i.test(file.filename)&&<img src={dtmAssignmentPdfIcon} width="16" height="16" alt=""/>}<span>{file.filename}</span></>;
      return <li key={file.id??index}>{file.id&&onDownload?<button className="dtm-assignment-file-download" type="button" disabled={busy||editing} onClick={()=>void download(file.id!)}>{content}</button>:
        href?<a href={href}>{content}</a>:<span className="dtm-assignment-inert-file">{content}</span>}</li>;
    })}</ul>,report.excellentWorkText??'—'];
  return <div className="dtm-assignment-submission">
    <h3>繳交狀態</h3>
    <div className="dtm-assignment-table-wrap" role="region" aria-label="作業繳交狀態，可左右捲動" tabIndex={0}>
      <table className="dtm-assignment-status-table" aria-label="作業繳交狀態"><colgroup><col style={{width:'30%'}}/><col style={{width:'70%'}}/></colgroup>
        <tbody>{dtmAssignmentDetailLabels.map((label,index)=><tr key={label}><th scope="row">{label}</th><td className={
          index===1&&report.gradingAppearance==='ungraded'?'dtm-assignment-ungraded':index===3&&report.timingAppearance==='late'?'dtm-assignment-late':undefined}>{values[index]}</td></tr>)}</tbody>
      </table>
    </div>
    {report.canEditSubmission===true&&<div className="dtm-assignment-action"><button type="button" disabled={busy||editing||!onEdit} onClick={()=>void edit()}>{report.editLabel??'修改我已繳交的作業'}</button>
      {report.editDescription!==null&&<p>{report.editDescription??'更改你所繳交的作業'}</p>}</div>}
    {editError&&<p className="dtm-assignment-detail-error" role="alert">{editError}</p>}
  </div>;
}

// This component owns the white report panel only. Course shell, breadcrumbs,
// route lookup and the existing assistant remain responsibilities of the host.
export function DtmAssignmentDetail({userId,courseId,report,busy=false,error,onReload,onEdit,onDownload,approvedPrivateFileHrefs}:DtmAssignmentDetailProps){
  const own=ownDtmAssignmentDetail(report,userId,courseId),titleId=useId();
  return <section className="dtm-assignment-detail" lang="zh-Hant" aria-labelledby={titleId} aria-busy={busy}>
    <span className="dtm-assignment-content-start" aria-hidden="true"/>
    <h2 id={titleId}>{own?.title??'作業'}</h2>
    {busy&&<p role="status">載入作業繳交資料中…</p>}
    {error&&<p className="dtm-assignment-detail-error" role="alert">{error}{onReload&&<> <button type="button" disabled={busy} onClick={onReload}>重新載入</button></>}</p>}
    {!busy&&!error&&!own&&<p role="status">目前沒有可顯示的作業繳交資料。</p>}
    {own&&<Report key={`${userId}:${own.id}`} report={own} busy={busy} onEdit={onEdit} onDownload={onDownload} approvedPrivateFileHrefs={approvedPrivateFileHrefs}/>}
  </section>;
}
