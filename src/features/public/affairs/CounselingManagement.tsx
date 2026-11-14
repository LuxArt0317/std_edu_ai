import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {Button} from '@/components/ui/button';
import {changeCounseling,loadCounseling,CounselingError,type CounselingViews} from '@/services/counseling';
import {counselingKinds,counselingPath,counselingStatus,type CounselingQueueRow} from '../../../../server/counselingContract.js';

type View='access'|'queue';
const taipeiTime=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'});

function useCounselingManagement<V extends View>(userId:string,view:V){
  const [result,setResult]=useState<CounselingViews[V]|null>(null);
  const [readError,setReadError]=useState('');
  const [saveError,setSaveError]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const mutation=useRef<AbortController|null>(null);
  const retry=useRef<{key:string;id:string}|null>(null);

  useEffect(()=>()=>mutation.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();
    void loadCounseling(userId,view,controller.signal).then(
      data=>{if(!controller.signal.aborted)setResult(data);},
      reason=>{if(!controller.signal.aborted)setReadError(reason instanceof CounselingError&&reason.status===403
        ?'此帳戶無權使用此功能。':'無法載入資料，請重試。');},
    );
    return ()=>controller.abort();
  },[userId,view,revision]);

  function reload(){
    setResult(null);
    setReadError('');
    setSaveError('');
    setRevision(value=>value+1);
  }

  async function save(fields:Record<string,unknown>,message:string){
    if(mutation.current||!result)return;
    const key=JSON.stringify(fields);
    const requestId=retry.current?.key===key?retry.current.id:crypto.randomUUID();
    retry.current={key,id:requestId};
    const controller=new AbortController();
    mutation.current=controller;
    setBusy(true);
    setSaveError('');
    setStatus('');
    try{
      await changeCounseling(userId,view==='queue'?'review':'access',{...fields,request_id:requestId},controller.signal);
      if(controller.signal.aborted)return;
      retry.current=null;
      setStatus(message);
      reload();
    }catch(reason){
      if(controller.signal.aborted)return;
      if(reason instanceof CounselingError&&reason.status===403){
        setResult(null);
        setReadError(reason.message);
      }else{
        setSaveError(reason instanceof Error?reason.message:'儲存結果未確認，請重試。');
      }
    }finally{
      mutation.current=null;
      if(!controller.signal.aborted)setBusy(false);
    }
  }
  return {result,busy,readError,saveError,status,reload,save};
}

type Account={user_id:string;email:string};
export function CounselingAccessManager({userId,profiles}:{userId:string;profiles:Account[]}){
  const [open,setOpen]=useState(false);
  return <section className="affairs-record-form">
    <h3>Counseling appointment access</h3>
    <Button type="button" variant="outline" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
      {open?'Hide coordinator settings':'Manage coordinators'}
    </Button>
    {open&&<CoordinatorSettings userId={userId} profiles={profiles}/>}
  </section>;
}

function CoordinatorSettings({userId,profiles}:{userId:string;profiles:Account[]}){
  const management=useCounselingManagement(userId,'access');
  const [selected,setSelected]=useState('');
  const granted=management.result?.rows??[];
  const names=new Map(profiles.map(profile=>[profile.user_id,profile.email]));
  const options=[...new Set([...names.keys(),...granted])];

  function submit(event:FormEvent){
    event.preventDefault();
    if(!options.includes(selected))return;
    const enabled=!granted.includes(selected);
    void management.save({user_id:selected,enabled},enabled?'已授權承辦人。':'已撤銷承辦權限。');
  }

  return <div className="affairs-record-form">
    <p>Assign access only to the staff member responsible for scheduling. Coordinators can see student appointment preferences and contact emails.</p>
    {management.readError&&<p role="alert">{management.readError} <Button onClick={management.reload}>Retry</Button></p>}
    {!management.result&&!management.readError&&<p role="status">Loading coordinator settings…</p>}
    {management.result&&<>
      <p>{granted.length} assigned · {management.result.available?'Booking enabled':'Booking unavailable'}</p>
      {management.result.canCoordinate&&<Link to={counselingPath+'/queue'}>Open the appointment queue</Link>}
      <form onSubmit={submit} className="affairs-record-form">
        <label htmlFor="counseling-coordinator">School Affairs account</label>
        <select id="counseling-coordinator" value={selected} onChange={event=>setSelected(event.target.value)} disabled={management.busy}>
          <option value="">Choose an account</option>
          {options.map(id=><option value={id} key={id}>{names.get(id)??id}{granted.includes(id)?' · Coordinator':''}</option>)}
        </select>
        <Button type="submit" disabled={!selected||management.busy}>{granted.includes(selected)?'Revoke coordinator access':'Grant coordinator access'}</Button>
      </form>
    </>}
    {management.saveError&&<p role="alert">{management.saveError} <Button onClick={management.reload}>Refresh</Button></p>}
    {management.status&&<p role="status">{management.status}</p>}
  </div>;
}

export function CounselingQueue({userId}:{userId:string}){
  const management=useCounselingManagement(userId,'queue');
  const [selected,setSelected]=useState('');
  const [time,setTime]=useState('');
  const [error,setError]=useState('');
  const row=management.result?.rows.find(item=>item.id===selected);
  function review(appointment:CounselingQueueRow,status:'scheduled'|'closed'){
    const proposed=new Date(time+'+08:00');
    if(status==='scheduled'&&(!Number.isFinite(proposed.getTime())||proposed.getTime()<=Date.now())){
      setError('請輸入未來的預約時間。');
      return;
    }
    setError('');
    void management.save({
      id:appointment.id,expected_version:appointment.version,status,
      scheduled_at:status==='scheduled'?proposed.toISOString():null,
    },status==='scheduled'?'已儲存預約時間。':'已結案。');
  }
  return <section className="counseling-appointments">
    <h2>預約處理</h2>
    {!management.result&&!management.readError&&<p role="status">讀取預約中…</p>}
    {management.readError&&<p role="alert">{management.readError} <button type="button" onClick={management.reload}>重試</button></p>}
    {management.result&&<>
      <div className="counseling-table-wrap" role="region" aria-label="待處理預約" tabIndex={0}>
        <table>
          <thead><tr>{['帳戶','服務項目','希望日期','時段','狀態','安排時間','操作'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>
            {management.result.rows.map(item=><tr key={item.id}>
              <td>{item.contact_email}</td>
              <td>{counselingKinds[item.kind]}</td>
              <td>{item.preferred_on}</td>
              <td>{item.preferred_period==='morning'?'上午':'下午'}</td>
              <td>{counselingStatus[item.status][0]}</td>
              <td>{item.scheduled_at?taipeiTime.format(new Date(item.scheduled_at)):'—'}</td>
              <td><button type="button" aria-pressed={selected===item.id} disabled={management.busy}
                onClick={()=>{setSelected(item.id);setTime('');setError('');}}>處理</button></td>
            </tr>)}
            {!management.result.rows.length&&<tr><td colSpan={7}>沒有待處理的預約。</td></tr>}
          </tbody>
        </table>
      </div>
      {row&&<form className="counseling-form" onSubmit={event=>{event.preventDefault();review(row,'scheduled');}}>
        <p>{row.contact_email}</p>
        <label>時間（臺北）<input type="datetime-local" value={time}
          onChange={event=>setTime(event.target.value)} required disabled={management.busy}/></label>
        <div className="counseling-controls">
          <button type="submit" className="counseling-primary" disabled={management.busy||!time}>儲存時間</button>
          <button type="button" disabled={management.busy} onClick={()=>review(row,'closed')}>結案</button>
        </div>
      </form>}
    </>}
    {error&&<p role="alert">{error}</p>}
    {management.saveError&&<p role="alert">{management.saveError} <button type="button" onClick={management.reload}>重新載入</button></p>}
    {management.status&&<p role="status">{management.status}</p>}
  </section>;
}
