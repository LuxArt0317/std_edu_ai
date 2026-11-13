import {useEffect,useRef,useState} from 'react';
import {TuitionDocuments,type TuitionView} from './TuitionDocuments';
import {parseTuitionDocuments,tuitionDocumentsClient,TuitionDocumentsClientError,type TuitionDocumentsClient,type TuitionDocumentsRecords} from '../../../services/tuitionDocumentsClient';

export type TuitionDocumentsWorkspaceProps={userId:string;view:TuitionView;onLogout:()=>void;client?:Pick<TuitionDocumentsClient,'load'>};
/** Account-scoped host only. This metadata-only batch supplies no document capability. */
export function TuitionDocumentsWorkspace(props:TuitionDocumentsWorkspaceProps){return <AccountTuitionDocuments key={props.userId+':'+props.view} {...props}/>;}
function AccountTuitionDocuments({userId,view,onLogout,client=tuitionDocumentsClient}:TuitionDocumentsWorkspaceProps){
  const [records,setRecords]=useState<TuitionDocumentsRecords|null>(null),[selectedId,setSelectedId]=useState('');
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[queriedId,setQueriedId]=useState<string|null>(null);
  const active=useRef<AbortController|null>(null),lastQuery=useRef<string|null>(null);
  async function load(queryId:string|null){
    active.current?.abort();const task=new AbortController();active.current=task;setBusy(true);setError('');setQueriedId(null);lastQuery.current=queryId;
    try{
      const next=parseTuitionDocuments(await client.load(userId,task.signal),userId);
      if(task.signal.aborted||active.current!==task)return;
      setRecords(next);setQueriedId(queryId);
    }catch(reason){if(!task.signal.aborted&&active.current===task){setRecords(null);setError(reason instanceof TuitionDocumentsClientError?reason.message:'站內繳費資料暫時無法載入，請重新載入。');}}
    finally{if(!task.signal.aborted&&active.current===task)setBusy(false);}
  }
  useEffect(()=>{
    setRecords(null);setSelectedId('');void load(null);
    return()=>{active.current?.abort();};
    // Account/view changes remount. A replacement client invalidates loaded records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[client,userId]);
  const result=queriedId===selectedId?records?.settlements.find(row=>row.periodId===queriedId)??null:null;
  return <TuitionDocuments view={view} userId={userId} busy={busy} error={error} onLogout={onLogout} onReload={()=>void load(lastQuery.current)} document={null}
    settlement={{periods:records?.periods??[],selectedId,onSelect:id=>{if(busy)return;setSelectedId(id);setQueriedId(null);lastQuery.current=null;},
      onQuery:async id=>{if(busy||!records?.periods.some(period=>period.id===id))return;await load(id);},queryCompleted:queriedId!==null,record:result}}/>;
}
