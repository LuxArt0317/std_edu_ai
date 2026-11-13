import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {createDtmSubmissionsClient,DtmSubmissionSession,dtmSubmissionDetailReport,validDtmSubmissionAssignment,
  type DtmSubmissionAssignment,type DtmSubmissionsClient} from '../../../services/dtmSubmissions';
import {DtmAssignmentDetail} from './DtmAssignmentDetail';
import {DtmSubmissionEditor} from './DtmSubmissionEditor';

export type DtmSubmissionWorkspaceProps={
  userId:string;assignment:DtmSubmissionAssignment|null;view:'detail'|'edit';
  onNavigate:(view:'detail'|'edit')=>void;onSaved?:()=>void;
  client?:DtmSubmissionsClient;
  /** Optional host download sink; receives bytes, never a signed capability. */
  onDownloaded?:(download:{blob:Blob;filename:string})=>void;
};
function saveDownload({blob,filename}:{blob:Blob;filename:string}){
  const href=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=href;anchor.download=filename;anchor.style.display='none';
  try{document.body.append(anchor);anchor.click();}
  finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);}
}
function Ready({session,...props}:DtmSubmissionWorkspaceProps&{assignment:DtmSubmissionAssignment;session:DtmSubmissionSession}){
  const state=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
  function saved(){if(session.active){props.onSaved?.();props.onNavigate('detail');}}
  async function refresh(){if(await session.refresh())saved();}
  async function download(uploadId:string){const result=await session.download(uploadId);if(result&&session.active)(props.onDownloaded??saveDownload)(result);}
  const current=state.workspace?.files.find(row=>row.id===state.workspace?.submission?.currentUploadId&&row.state==='current');
  if(props.view==='edit')return <DtmSubmissionEditor userId={props.userId} assignment={props.assignment}
    savedFile={current?{id:current.id,userId:props.userId,assignmentId:props.assignment.id,filename:current.filename,sizeBytes:current.sizeBytes,contentType:current.contentType}:null}
    selectedFile={state.file} selectedFileScope={state.file?{userId:props.userId,assignmentId:props.assignment.id}:null}
    busy={state.busy} status={state.status} error={state.error} onReload={refresh}
    onChoose={async file=>{await session.choose(file);}} onRemovePending={async()=>{await session.removePending();}}
    onSave={async()=>{if(await session.save())saved();}}
    onCancel={async()=>{if(await session.cancel()&&session.active)props.onNavigate('detail');}} onDownload={download}/>;
  return <DtmAssignmentDetail userId={props.userId} courseId={props.assignment.courseId}
    report={state.workspace?dtmSubmissionDetailReport(props.assignment,state.workspace):null} busy={state.busy} error={state.error}
    onReload={()=>void refresh()} onEdit={()=>props.onNavigate('edit')} onDownload={download}/>;
}
function Scoped(props:DtmSubmissionWorkspaceProps&{assignment:DtmSubmissionAssignment}){
  const defaultClient=useMemo(()=>createDtmSubmissionsClient(props.userId),[props.userId]),client=props.client??defaultClient;
  const [session,setSession]=useState<DtmSubmissionSession|null>(null);
  const {id,userId,courseId,title}=props.assignment;
  useEffect(()=>{
    const next=new DtmSubmissionSession({id,userId,courseId,title},client);
    queueMicrotask(()=>{if(next.active)setSession(next);});void next.refresh();
    return()=>next.dispose();
  },[client,id,userId,courseId,title]);
  return session?.active?<Ready {...props} session={session}/>:<DtmAssignmentDetail userId={props.userId} report={null} busy/>;
}
/** Route-independent full-page content. The host supplies the existing course
 * shell and owns navigation/Escape; this module installs no routes or chat data. */
export function DtmSubmissionWorkspace(props:DtmSubmissionWorkspaceProps){
  if(!validDtmSubmissionAssignment(props.assignment,props.userId))return <DtmAssignmentDetail userId={props.userId} report={null}/>;
  return <Scoped key={`${props.userId}:${props.assignment.courseId}:${props.assignment.id}`} {...props} assignment={props.assignment}/>;
}
