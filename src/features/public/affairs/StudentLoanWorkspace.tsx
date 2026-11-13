import {useCallback,useEffect,useRef,useState} from 'react';
import {StudentLoan,type StudentLoanProps} from './StudentLoan';
import {parseStudentLoan,studentLoanClient,type StudentLoanClient,type StudentLoanSnapshot} from '@/services/studentLoanClient';

export type StudentLoanWorkspaceProps=Pick<StudentLoanProps,'userId'|'view'|'onNavigate'|'onLogout'|'onInformation'|'copyrightYear'> & {client?:Pick<StudentLoanClient,'load'>};
/** Navigation stays host controlled; this reader cannot apply, approve, print or download. */
export function StudentLoanWorkspace(props:StudentLoanWorkspaceProps){return <AccountLoanWorkspace key={props.userId} {...props}/>;}
function AccountLoanWorkspace({client=studentLoanClient,...props}:StudentLoanWorkspaceProps){
  const {userId}=props,[data,setData]=useState<StudentLoanSnapshot|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const [loadedClient,setLoadedClient]=useState<typeof client|null>(null),active=useRef<AbortController|null>(null);
  const load=useCallback(()=>{
    active.current?.abort();const controller=new AbortController();active.current=controller;
    void Promise.resolve().then(()=>{controller.signal.throwIfAborted();return client.load(userId,controller.signal);}).then(value=>{
      const next=parseStudentLoan(value,userId);if(!controller.signal.aborted&&active.current===controller){setData(next);setError('');}
    }).catch(()=>{if(!controller.signal.aborted&&active.current===controller){setData(null);setError('站內就學貸款資料暫時無法載入，請重新載入。');}})
      .finally(()=>{if(!controller.signal.aborted&&active.current===controller){setLoadedClient(client);setBusy(false);}});
  },[client,userId]);
  useEffect(()=>{load();return()=>active.current?.abort();},[load]);
  const loading=busy||loadedClient!==client;
  return <StudentLoan {...props} data={loading?{status:'loading'}:data??{status:'unavailable'}} error={loadedClient===client?error:''}
    onReload={()=>{setData(null);setBusy(true);setError('');load();}}/>;
}
