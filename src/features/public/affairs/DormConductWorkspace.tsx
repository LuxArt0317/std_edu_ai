import {useCallback,useEffect,useRef,useState} from 'react';
import {DormConduct,type DormConductProps} from './DormConduct';
import {dormitoryConductClient,parseDormitoryConduct,type DormitoryConductClient,type DormitoryConductData} from '@/services/dormitoryConductClient';

export type DormConductWorkspaceProps=Pick<DormConductProps,'userId'|'identity'|'onHome'> & {
  client?:Pick<DormitoryConductClient,'load'>;
  identityLoading?:boolean;
  identityError?:string|null;
  onReloadIdentity?:()=>void;
};
export function DormConductWorkspace(props:DormConductWorkspaceProps){return <AccountDormConductWorkspace key={props.userId} {...props}/>;}
function AccountDormConductWorkspace({client=dormitoryConductClient,identityLoading=false,identityError,onReloadIdentity,...props}:DormConductWorkspaceProps){
  const {userId}=props,[data,setData]=useState<DormitoryConductData|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const [loadedClient,setLoadedClient]=useState<typeof client|null>(null),active=useRef<AbortController|null>(null);
  const load=useCallback(()=>{
    active.current?.abort();const controller=new AbortController();active.current=controller;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();return client.load(userId,controller.signal);}).then(value=>{
      const next=parseDormitoryConduct(value,userId);if(!controller.signal.aborted&&active.current===controller){setData(next);setError('');}
    }).catch(()=>{if(!controller.signal.aborted&&active.current===controller){setData(null);setError('站內住宿獎懲資料暫時無法載入。');}})
      .finally(()=>{if(!controller.signal.aborted&&active.current===controller){setLoadedClient(client);setBusy(false);}});
  },[client,userId]);
  useEffect(()=>{load();return()=>active.current?.abort();},[load]);
  const loading=busy||loadedClient!==client||identityLoading;
  return <DormConduct {...props} busy={loading} snapshot={loading||identityError?null:data?.snapshot??null}
    error={identityError?'帳戶身分暫時無法確認。':loadedClient===client?error:''}
    onReload={()=>{setData(null);setBusy(true);setError('');load();onReloadIdentity?.();}}/>;
}
