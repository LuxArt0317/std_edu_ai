import {CounselingAccessManager} from './CounselingManagement';
import {CertificateAwardManager} from './CertificateAwardManager';
import {useEffect,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {manageSchoolAffairsRecord,performSchoolAffairsAction,type AffairsAction,type AffairsManagerAction,type AffairsSnapshot} from '@/services/schoolAffairsWorkspace';
import {StudentProfileManager} from './StudentProfileManager';
import {SchoolRecordManager} from './SchoolRecordManager';
import {useAffairsRecords} from './useAffairsRecords';
import {repairPaths} from './facilityRepair.js';
import {venuePaths} from './venueContract.js';

type Props={userId:string;identity?:AffairsSnapshot;identityLoading:boolean;identityError?:string;onReloadIdentity:()=>void};

/** Existing administrative capabilities, separate from the source-shaped student portal. */
export function SchoolAccountAdmin(props:Props){return <AdminSession key={props.userId} {...props}/>;}

function AdminSession({userId,identity,identityLoading,identityError,onReloadIdentity}:Props){
  const allowed=!identityLoading&&!identityError&&identity?.profile.userId===userId&&identity.profile.role==='admin';
  const {snapshot,loading,error,refresh}=useAffairsRecords(allowed?userId:undefined,true);
  const authorized=Boolean(allowed&&!loading&&!error&&snapshot?.profile.userId===userId&&snapshot.profile.role==='admin'&&snapshot.admin);
  const current=useRef(false);
  const mounted=useRef(true),pending=useRef<AbortController|null>(null);
  const [busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[actionStatus,setActionStatus]=useState('');
  const [noticeTitle,setNoticeTitle]=useState(''),[noticeBody,setNoticeBody]=useState('');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort();};},[]);
  useLayoutEffect(()=>{current.current=authorized;if(!authorized)pending.current?.abort();},[authorized]);
  useEffect(()=>{
    window.addEventListener('school-affairs:updated',refresh);
    return()=>window.removeEventListener('school-affairs:updated',refresh);
  },[refresh]);
  async function mutate(operation:(signal:AbortSignal)=>Promise<{summary:string}>,after?:()=>void){
    if(!current.current||pending.current)return false;
    const controller=new AbortController();pending.current=controller;
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]);
    setBusy(true);setActionError('');setActionStatus('');
    try{
      const result=await operation(signal);
      if(controller.signal.aborted||!mounted.current||!current.current)return false;
      setActionStatus(result.summary);after?.();refresh();return true;
    }catch(reason){
      if(!controller.signal.aborted&&mounted.current&&current.current)setActionError(reason instanceof Error?reason.message:'The administrative operation could not be completed.');
      return false;
    }finally{
      if(pending.current===controller)pending.current=null;
      if(mounted.current)setBusy(false);
    }
  }
  const manage=(action:AffairsManagerAction)=>mutate(signal=>manageSchoolAffairsRecord(action,{expectedUserId:userId,signal}));
  const act=(action:AffairsAction,after?:()=>void)=>mutate(signal=>performSchoolAffairsAction(action,{expectedUserId:userId,signal}),after);
  function publish(event:FormEvent){event.preventDefault();void act({kind:'publish_announcement',payload:{title:noticeTitle.trim(),body:noticeBody.trim()}},()=>{setNoticeTitle('');setNoticeBody('');});}
  if(identityLoading)return <p role="status">Checking administrative access…</p>;
  if(identityError)return <div role="alert"><p>Administrative access could not be verified.</p><Button variant="outline" onClick={onReloadIdentity}>Try again</Button></div>;
  if(!allowed)return <p role="alert">Administration requires a verified site administrator.</p>;
  const verifiedSnapshot=snapshot?.profile.userId===userId&&snapshot.profile.role==='admin'&&snapshot.admin;
  if(loading&&!verifiedSnapshot)return <p role="status">Loading administrative records…</p>;
  if(error&&!verifiedSnapshot)return <div role="alert"><p>{error}</p><Button variant="outline" onClick={refresh}>Try again</Button></div>;
  if(!verifiedSnapshot||!snapshot?.admin)return <p role="alert">Administrative records are unavailable.</p>;
  const admin=snapshot.admin;
  return <section className="affairs-admin" aria-label="School Affairs administration">
    <h1>School Affairs administration</h1>
    <Link to={venuePaths.manage}>Review venue requests</Link>
    <Link to={repairPaths.manage}>Review facility repairs</Link>
    {loading&&<p role="status">Loading administrative records…</p>}
    {error&&<div role="alert"><p>{error}</p><Button variant="outline" onClick={refresh}>Try again</Button></div>}
    {authorized&&<StudentProfileManager managerId={userId} profiles={admin.profiles.filter(profile=>profile.role==='student')}/>}
    {authorized&&<CertificateAwardManager managerId={userId} profiles={admin.profiles.filter(profile=>profile.role==='student')}/>}
    {authorized&&<CounselingAccessManager userId={userId} profiles={admin.profiles}/>}
    <SchoolRecordManager admin={admin} busy={busy||!authorized} onManage={manage} onRefresh={refresh}/>
    <div className="affairs-record-grid">
      <section><h3>Accounts ({admin.profiles.length})</h3><ul>{admin.profiles.map(item=><li key={item.user_id}><strong>{item.display_name}</strong><span>{item.email} · {item.role}</span></li>)}</ul></section>
      <section><h3>Site requests</h3><ul>{admin.requests.map(item=><li key={item.id}>
        <strong>{item.title}</strong><span>{item.status} · {item.request_type}</span><p className="whitespace-pre-wrap break-words">{item.details}</p>
        {item.status!=='resolved'&&<Button size="sm" variant="outline" disabled={busy||!authorized} onClick={()=>void act({kind:'resolve_service_request',payload:{request_id:item.id}})}>Resolve</Button>}
      </li>)}</ul></section>
      <section><h3>Publish a stu.best notice</h3><form onSubmit={publish} className="affairs-record-form">
        <Input aria-label="Announcement title" value={noticeTitle} onChange={event=>setNoticeTitle(event.target.value)} minLength={3} maxLength={160} required placeholder="Title" disabled={busy||!authorized}/>
        <Textarea aria-label="Announcement body" value={noticeBody} onChange={event=>setNoticeBody(event.target.value)} minLength={5} maxLength={2000} required placeholder="Message" disabled={busy||!authorized}/>
        <Button disabled={busy||!authorized} type="submit">Publish notice</Button>
      </form></section>
    </div>
    {actionError&&<p role="alert" className="affairs-record-error">{actionError}</p>}{actionStatus&&<p role="status" className="affairs-record-success">{actionStatus}</p>}
  </section>;
}
