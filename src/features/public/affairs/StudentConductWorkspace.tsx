import {useCallback,useEffect,useRef,useState} from 'react';
import {StudentConduct} from './StudentConduct';
import type {StudentConductIdentity} from '@/services/studentConduct';
import {parseStudentConduct,studentConductClient,StudentConductClientError,type StudentConductClient,type StudentConductRecords} from '@/services/studentConductClient';

export type StudentConductWorkspaceProps={userId:string;identity:StudentConductIdentity|null;identityLoading?:boolean;identityError?:string|null;onReloadIdentity?:()=>void;client?:Pick<StudentConductClient,'load'>};
/** The root supplies current caller identity separately; rows never populate identity fields. */
export function StudentConductWorkspace(props:StudentConductWorkspaceProps){return <AccountConductWorkspace key={props.userId} {...props}/>;}
function AccountConductWorkspace({userId,identity,identityLoading=false,identityError=null,onReloadIdentity,client=studentConductClient}:StudentConductWorkspaceProps){
  const [records,setRecords]=useState<StudentConductRecords|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const [loadedClient,setLoadedClient]=useState<typeof client|null>(null);
  const active=useRef<AbortController|null>(null);
  const load=useCallback(()=>{
    active.current?.abort();const controller=new AbortController();active.current=controller;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();return client.load(userId,controller.signal);}).then(value=>{
      const next=parseStudentConduct(value,userId);if(!controller.signal.aborted&&active.current===controller){setRecords(next);setError('');}
    }).catch(reason=>{if(!controller.signal.aborted&&active.current===controller){setRecords(null);setError(reason instanceof StudentConductClientError?reason.message:'站內獎懲資料暫時無法載入，請重新載入。');}})
      .finally(()=>{if(!controller.signal.aborted&&active.current===controller){setLoadedClient(client);setBusy(false);}});
  },[client,userId]);
  useEffect(()=>{load();return()=>active.current?.abort();},[load]);
  return <StudentConduct userId={userId} identity={identity} records={loadedClient===client?records:null} busy={busy||loadedClient!==client||identityLoading} error={identityError||(loadedClient===client?error:'')}
    onReload={()=>{setRecords(null);setBusy(true);setError('');load();onReloadIdentity?.();}}/>;
}
