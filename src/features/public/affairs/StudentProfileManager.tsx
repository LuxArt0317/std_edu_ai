import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {loadStudentProfile,saveStudentProfile,StudentProfileError} from '@/services/studentProfile';
import {profileFieldLabels,profileFieldLengths,validProfileAction,type SaveStudentProfile,type StudentProfileFields,
  type StudentProfileRecord} from '../../../../server/studentProfileContract.js';

type Account={user_id:string;display_name:string;email:string};
type Field=keyof StudentProfileFields;
const fields=Object.keys(profileFieldLabels) as Field[];
const required=(key:Field)=>key==='student_number'||key==='name_zh';
const choices:Partial<Record<Field,Array<[string,string]>>>={gender:[['male','男'],['female','女']],
  overseas:[['true','是'],['false','否']],indigenous:[['true','是'],['false','否']]};

function ProfileEditor({managerId,target,record,reload}:{managerId:string;target:string;record:StudentProfileRecord|null;reload:()=>void}){
  const [version,setVersion]=useState(record?.version??0);
  const [confirmedAt,setConfirmedAt]=useState(record?.confirmed_at??null);
  const [status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stale,setStale]=useState(false);
  const active=useRef<AbortController|null>(null);
  const pending=useRef<SaveStudentProfile|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(active.current||stale)return;
    const data=new FormData(event.currentTarget);
    const values=Object.fromEntries(fields.map(key=>{
      const raw=String(data.get(key)??'').trim();
      return [key,raw===''?null:key==='overseas'||key==='indigenous'?raw==='true':raw];
    })) as StudentProfileFields;
    if(!pending.current||JSON.stringify(values)!==JSON.stringify(pending.current.record)){
      pending.current={user_id:target,expected_version:version,request_id:crypto.randomUUID(),record:values};
    }
    const payload=pending.current;
    setError('');setStatus('');
    if(!validProfileAction('save',payload)){setError('請檢查學生基本資料。');return;}
    const controller=new AbortController();active.current=controller;
    setBusy(true);
    try{
      const receipt=await saveStudentProfile(managerId,payload,controller.signal);
      if(controller.signal.aborted)return;
      pending.current=null;
      setVersion(receipt.version);setConfirmedAt(receipt.confirmedAt);setStatus('基本資料已儲存，等待學生確認。');
    }catch(reason){
      if(controller.signal.aborted)return;
      const conflict=reason instanceof StudentProfileError&&[404,409].includes(reason.status);
      setStale(conflict);
      setError(conflict?'帳戶或資料已更新，請重新載入。':'儲存未確認，請重試。');
    }finally{
      active.current=null;
      if(!controller.signal.aborted)setBusy(false);
    }
  }
  return <form onSubmit={event=>void submit(event)}>
    {version>0&&<p>{confirmedAt?'學生已確認。':'等待學生確認。'}</p>}
    {record?.updated_mobile&&<p>學生更新的行動電話：{record.updated_mobile}</p>}
    <fieldset disabled={busy||stale} className="grid gap-3 sm:grid-cols-2">
      {fields.map(key=>{
        const options=choices[key],initial=String(record?.[key]??'');
        return <label key={key} className="grid gap-1 text-sm">
          <span>{profileFieldLabels[key]}</span>
          {options?<select className="rounded-md border px-2 py-1" name={key} defaultValue={initial}>
            <option value="">未設定</option>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>:<Input name={key} defaultValue={initial} maxLength={profileFieldLengths[key]} required={required(key)}
            pattern={key==='identity_last_four'?'[A-Za-z0-9]{4}':undefined}/>}
        </label>;
      })}
    </fieldset>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button type="submit" disabled={busy||stale}>{busy?'儲存中…':'儲存學生基本資料'}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={reload}>重新載入</Button>
    </div>
    {status&&<p role="status">{status}</p>}
    {error&&<p role="alert">{error}</p>}
  </form>;
}

function SelectedProfile({managerId,target}:{managerId:string;target:string}){
  const [load,setLoad]=useState<{record:StudentProfileRecord|null}|{error:true}|null>(null);
  const [attempt,setAttempt]=useState(0);
  function reload(){setLoad(null);setAttempt(current=>current+1);}
  useEffect(()=>{
    const controller=new AbortController();
    void loadStudentProfile(managerId,controller.signal,target).then(data=>{
      if(!controller.signal.aborted)setLoad({record:data.record});
    },()=>{
      if(!controller.signal.aborted)setLoad({error:true});
    });
    return ()=>controller.abort();
  },[managerId,target,attempt]);
  if(!load)return <p role="status">載入學生基本資料中…</p>;
  if('error'in load)return <p role="alert">無法載入學生基本資料。 <Button type="button" onClick={reload}>重試</Button></p>;
  return <ProfileEditor managerId={managerId} target={target} record={load.record} reload={reload}/>;
}

export function StudentProfileManager({managerId,profiles}:{managerId:string;profiles:Account[]}){
  const [open,setOpen]=useState(false),[target,setTarget]=useState('');
  const selected=profiles.some(profile=>profile.user_id===target)?target:'';
  return <section className="affairs-record-form" lang="zh-Hant">
    <h2><Button type="button" variant="outline" aria-expanded={open} onClick={()=>{setOpen(!open);setTarget('');}}>學生基本資料管理</Button></h2>
    {open&&<>
      <label className="grid gap-1 text-sm">學生帳戶
        <select className="rounded-md border px-2 py-1" value={selected} onChange={event=>setTarget(event.target.value)}>
          <option value="">選擇學生帳戶</option>
          {profiles.map(item=><option key={item.user_id} value={item.user_id}>{item.display_name} · {item.email}</option>)}
        </select>
      </label>
      {selected&&<SelectedProfile key={selected} managerId={managerId} target={selected}/>}
    </>}
  </section>;
}
