import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Check,Info,Landmark,RotateCcw} from 'lucide-react';
import {AnnouncementEmailError,loadAnnouncementEmail,saveAnnouncementEmail} from '@/services/announcementEmail';
import type {AnnouncementEmailChange,AnnouncementEmailPreference} from '../../../../server/announcementEmailContract.js';
import './announcementEmailSettings.css';

type EmailSettings=AnnouncementEmailPreference&{deliveryConfigured:boolean};

const activationDate=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric'});

function SettingsForm({userId,record,reload}:{userId:string;record:AnnouncementEmailPreference;reload:()=>void}){
  const [saved,setSaved]=useState(record);
  const [checked,setChecked]=useState(record.enabled);
  const [busy,setBusy]=useState(false),[conflict,setConflict]=useState(false);
  const [status,setStatus]=useState(''),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null),pending=useRef<AnnouncementEmailChange|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function submit(event:FormEvent){
    event.preventDefault();
    if(active.current||conflict)return;
    if(checked===saved.enabled&&!pending.current){setStatus('設定未變更。');return;}
    const input=pending.current??{enabled:checked,expected_version:saved.version,request_id:crypto.randomUUID()};
    pending.current=input;
    const controller=new AbortController();active.current=controller;
    setBusy(true);setStatus('');setError('');
    try{
      const receipt=await saveAnnouncementEmail(userId,input,controller.signal);
      if(controller.signal.aborted)return;
      pending.current=null;
      const effective=receipt.effectiveAt?new Date(receipt.effectiveAt):null;
      const activeNow=receipt.enabled&&effective!==null&&effective.getTime()<=Date.now();
      setSaved({...receipt,active:activeNow});setChecked(receipt.enabled);
      setStatus(receipt.enabled&&effective&&!activeNow?`設定已儲存，將於 ${activationDate.format(effective)} 生效。`:'設定已儲存。');
    }catch(reason){
      if(controller.signal.aborted)return;
      const changed=reason instanceof AnnouncementEmailError&&reason.status===409;
      setConflict(changed);
      setError(changed?'設定已更新，請重新載入。':'無法確認儲存結果，請重試或重新載入。');
    }finally{
      active.current=null;
      if(!controller.signal.aborted)setBusy(false);
    }
  }
  function cancel(){
    if(pending.current||conflict){reload();return;}
    setChecked(saved.enabled);setStatus('');setError('');
  }
  return <form className="announcement-email-form" onSubmit={event=>void submit(event)} aria-busy={busy}>
    <div className="announcement-email-field">
      <label htmlFor="announcement-email-enabled">校園最新公告直接寄到個人 E-MAIL信箱</label>
      <input id="announcement-email-enabled" type="checkbox" checked={checked} disabled={busy||conflict||Boolean(error)}
        onChange={event=>{setStatus('');setChecked(event.target.checked);}}/>
    </div>
    <div className="announcement-email-actions">
      <button type="submit" disabled={busy||conflict}><Check aria-hidden="true"/>{busy?'儲存中…':'確定'}</button>
      <button type="button" disabled={busy} onClick={cancel}><RotateCcw aria-hidden="true"/>{conflict?'重新載入':'取消'}</button>
    </div>
    {status&&<p className="announcement-email-result" role="status">{status}</p>}
    {error&&<p className="announcement-email-result" role="alert">{error}</p>}
  </form>;
}

export function AnnouncementEmailSettings({userId}:{userId:string}){
  const [result,setResult]=useState<EmailSettings|'error'|null>(null);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void loadAnnouncementEmail(userId,controller.signal).then(value=>{
      if(!controller.signal.aborted)setResult(value);
    },()=>{
      if(!controller.signal.aborted)setResult('error');
    });
    return ()=>controller.abort();
  },[userId,attempt]);
  function reload(){setResult(null);setAttempt(value=>value+1);}
  return <section className="announcement-email-settings" lang="zh-Hant" aria-labelledby="announcement-email-heading">
    <header className="announcement-email-header">
      <h1 id="announcement-email-heading"><Landmark aria-hidden="true"/>校園最新公告個人E-MAIL接收設定</h1>
      <small>» 使用者設定是否使用E-MAIL接收校園公告</small>
    </header>
    {result===null&&<p className="announcement-email-loading" role="status">載入設定中…</p>}
    {result==='error'&&<p className="announcement-email-loading" role="alert">校園公告設定暫時無法載入。 <button type="button" onClick={reload}>重試</button></p>}
    {result&&result!=='error'&&<SettingsForm record={result} userId={userId} reload={reload}/>}
    <section className="announcement-email-notes" aria-label="說明">
      <h2><Info aria-hidden="true"/>說明</h2>
      <ol><li>如要接收校園公告郵件，請勾選欄位。</li><li>啟用設定後，隔日生效。</li></ol>
      {result&&result!=='error'&&!result.deliveryConfigured&&<p className="announcement-email-availability">公告郵件寄送目前未設定，仍可儲存接收偏好。</p>}
    </section>
  </section>;
}
