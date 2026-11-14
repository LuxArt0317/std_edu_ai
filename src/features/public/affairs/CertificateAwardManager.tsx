import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {loadCertificateWorkspace,manageCertificateAward} from '@/services/certificateAwards';
import {certificateAwardLabels,type CertificateWorkspace,type ManagerAwardOp} from '../../../../server/certificateAwardsContract.js';
import {CertificateProofList} from './CertificateAwardWorkspace';

type Account={user_id:string;display_name:string;email:string};

function ManagerForm({managerId,target,id,refresh}:{managerId:string;target:string;id:string;refresh:()=>void}){
  const [data,setData]=useState<CertificateWorkspace|'error'|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null);
  const pending=useRef<{key:string;requestId:string}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void loadCertificateWorkspace(managerId,controller.signal,id||undefined,target).then(value=>{if(!controller.signal.aborted)setData(value);},
      ()=>{if(!controller.signal.aborted)setData('error');});
    return ()=>{controller.abort();active.current?.abort();};
  },[managerId,target,id]);
  async function save(event:FormEvent<HTMLFormElement>,op:ManagerAwardOp,payload:(form:FormData)=>object){
    event.preventDefault();
    if(active.current)return;
    const fields=payload(new FormData(event.currentTarget));
    const key=JSON.stringify([op,fields]);
    const requestId=pending.current?.key===key?pending.current.requestId:crypto.randomUUID();
    pending.current={key,requestId};
    const controller=new AbortController();active.current=controller;setBusy(true);setError('');
    try{
      await manageCertificateAward(managerId,op,{...fields,request_id:requestId},controller.signal);
      if(!controller.signal.aborted){pending.current=null;refresh();}
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'無法儲存。');}
    finally{active.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  if(!data)return <p role="status">載入證照資料中…</p>;
  if(data==='error')return <p role="alert">無法載入證照資料。 <Button onClick={refresh}>重試</Button></p>;
  const row=data.rows.find(item=>item.id===id);
  const reviewable=row&&['submitted','reviewing','needs_documents'].includes(row.status);
  return <>
    {error&&<p role="alert">{error}</p>}
    {id?<>
      <CertificateProofList userId={managerId} files={data.files}/>
      {reviewable&&<form className="grid max-w-lg gap-2" onSubmit={event=>void save(event,'review',form=>({
        id,user_id:target,expected_version:row.version,status:form.get('status'),review_note:form.get('note'),
        application_fee:form.get('fee')===''?null:Number(form.get('fee')),award_amount:form.get('award')===''?null:Number(form.get('award')),
      }))}>
        <label>審核狀態 <select name="status" aria-label="審核狀態" defaultValue={row.status==='submitted'?'reviewing':row.status} disabled={busy}>
          {(['reviewing','needs_documents','approved'] as const).map(value=><option key={value} value={value}>{certificateAwardLabels[value][0]}</option>)}
        </select></label>
        <label>證照報名費 <Input name="fee" type="number" min={0} max={1000000} defaultValue={row.application_fee??''} disabled={busy}/></label>
        {row.wants_award&&<label>獎補助金額 <Input name="award" type="number" min={0} max={1000000} defaultValue={row.award_amount??''} disabled={busy}/></label>}
        <label>審核意見 <Input name="note" maxLength={1200} defaultValue={row.review_note} disabled={busy}/></label>
        <Button type="submit" disabled={busy}>儲存審核</Button>
      </form>}
      {row&&!reviewable&&<p>{row.name} · {certificateAwardLabels[row.status][0]}</p>}
    </>:<>
      <form className="grid max-w-lg gap-2" onSubmit={event=>void save(event,'payout',form=>({
        user_id:target,bank:form.get('bank'),branch:form.get('branch'),account_last_four:form.get('last4'),note:form.get('note'),
      }))}>
        <label>銀行名稱 <Input name="bank" required maxLength={100} defaultValue={data.payout?.bank??''} disabled={busy}/></label>
        <label>分行名稱 <Input name="branch" required maxLength={100} defaultValue={data.payout?.branch??''} disabled={busy}/></label>
        <label>匯款帳號末四碼 <Input name="last4" required pattern="[0-9]{4}" maxLength={4} defaultValue={data.payout?.account_last_four??''} disabled={busy}/></label>
        <label>帳號備註 <Input name="note" maxLength={160} defaultValue={data.payout?.note??''} disabled={busy}/></label>
        <Button type="submit" disabled={busy}>儲存已核對的匯款資料</Button>
      </form>
      <p>{data.rows.length} 筆證照紀錄</p>
    </>}
  </>;
}

function CatalogEditor({managerId}:{managerId:string}){
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null),pending=useRef<{key:string;requestId:string}|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(active.current)return;
    const form=new FormData(event.currentTarget),payload={
      code:form.get('code'),name:form.get('name'),level:form.get('level'),issuer:form.get('issuer'),active:form.has('active'),
    };
    const key=JSON.stringify(payload),requestId=pending.current?.key===key?pending.current.requestId:crypto.randomUUID();
    pending.current={key,requestId};
    const controller=new AbortController();active.current=controller;setBusy(true);setStatus('');setError('');
    try{await manageCertificateAward(managerId,'catalog',{...payload,request_id:requestId},controller.signal);
      if(!controller.signal.aborted){pending.current=null;setStatus('證照目錄已儲存。');}
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'無法儲存。');}
    finally{active.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <details><summary>證照目錄管理</summary>
    <form className="grid max-w-lg gap-2" onSubmit={event=>void save(event)}>
      <label>證照編號 <Input name="code" required maxLength={12} pattern="[0-9]{1,12}" disabled={busy}/></label>
      <label>證照名稱 <Input name="name" required maxLength={240} disabled={busy}/></label>
      <label>級數 <Input name="level" maxLength={280} disabled={busy}/></label>
      <label>發照單位 <Input name="issuer" required maxLength={240} disabled={busy}/></label>
      <label><input type="checkbox" name="active" defaultChecked disabled={busy}/> 開放學生選擇</label>
      <Button type="submit" disabled={busy}>儲存證照</Button>
    </form>
    {status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}
  </details>;
}

function StudentAwards({managerId,target}:{managerId:string;target:string}){
  const [data,setData]=useState<CertificateWorkspace|'error'|null>(null);
  const [selected,setSelected]=useState(''),[revision,setRevision]=useState(0);
  function refresh(){setRevision(n=>n+1);}
  useEffect(()=>{
    const controller=new AbortController();
    void loadCertificateWorkspace(managerId,controller.signal,undefined,target).then(value=>{if(!controller.signal.aborted)setData(value);},
      ()=>{if(!controller.signal.aborted)setData('error');});
    return ()=>controller.abort();
  },[managerId,target,revision]);
  if(data==='error')return <p role="alert">無法載入證照紀錄。 <Button onClick={refresh}>重試</Button></p>;
  if(!data)return <p role="status">載入證照紀錄中…</p>;
  return <><label>證照紀錄 <select aria-label="證照紀錄" value={selected} onChange={event=>setSelected(event.target.value)}>
    <option value="">匯款資料</option>
    {data.rows.map(row=><option key={row.id} value={row.id}>{row.name} · {certificateAwardLabels[row.status][0]}</option>)}
  </select></label>
  <ManagerForm key={selected+revision} managerId={managerId} target={target} id={selected} refresh={refresh}/></>;
}

export function CertificateAwardManager({managerId,profiles}:{managerId:string;profiles:Account[]}){
  const [open,setOpen]=useState(false),[target,setTarget]=useState('');
  const selected=profiles.some(profile=>profile.user_id===target)?target:'';
  return <section className="affairs-record-form" lang="zh-Hant" aria-label="證照獎助金管理">
    <h2><Button variant="outline" type="button" aria-expanded={open} onClick={()=>{setOpen(!open);setTarget('');}}>證照獎助金管理</Button></h2>
    {open&&<><CatalogEditor managerId={managerId}/>
      <label>學生帳戶 <select aria-label="證照獎助金學生帳戶" value={selected} onChange={event=>setTarget(event.target.value)}>
        <option value="">選擇學生帳戶</option>
        {profiles.map(profile=><option key={profile.user_id} value={profile.user_id}>{profile.display_name} · {profile.email}</option>)}
      </select></label>
      {selected&&<StudentAwards key={selected} managerId={managerId} target={selected}/>}
    </>}
  </section>;
}
