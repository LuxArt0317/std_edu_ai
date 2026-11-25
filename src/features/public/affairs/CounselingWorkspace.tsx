import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useNavigate} from 'react-router';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {changeCounseling,loadCounseling} from '@/services/counseling';
import {counselingConsentVersion,counselingKinds,counselingPath,counselingStatus,type CounselingKind,
  type CounselingRow,type CounselingWorkspace as Workspace} from '../../../../server/counselingContract.js';
import {CounselingQueue} from './CounselingManagement';
import './counseling.css';

const title='諮商中心訪談預約服務系統';
const consentPath=counselingPath+'/consent';
const appointmentsPath=counselingPath+'/appointments';
const universityAppointment='https://info.stu.edu.tw/SAO/interview/trnFile/mtnApplyFormByStu.asp';
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
const counselingTime=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'});

function Overview(){
  return <article className="counseling-overview">
    <h2>諮商與特教資源中心 心理諮商／心理測驗 線上預約系統</h2>
    <p>諮商與特教資源中心提供談話與心理測驗服務，協助學生面對生活、人際及學習上的困難。</p>
    <h3>什麼是心理諮商？</h3>
    <p>學生可與心理師討論目前遇到的困難，整理感受、釐清需求，並一起探索可行的下一步。</p>
    <h3>什麼是心理測驗？</h3>
    <p>心理測驗可協助學生探索生涯選擇、學習適應及自我了解。可先和心理師討論適合的測驗，之後再安排結果說明。</p>
    <h3>我的資料，會受到保護嗎？</h3>
    <p>預約前請閱讀資料使用說明。諮商內容與保密範圍由提供服務的心理師於初次會談說明。</p>
    <p>校方諮商聯絡窗口 <a href="tel:+88676158000">07-6158000</a> 分機 2151</p>
  </article>;
}
function Consent({onContinue,onDecline}:{onContinue:()=>void;onDecline:()=>void}){
  return <article className="counseling-consent" aria-labelledby="counseling-notice-title">
    <section className="counseling-notice">
      <h2 id="counseling-notice-title">預約資料使用說明</h2>
      <p>stu.best 使用您的帳戶及所選服務、日期和時段來安排本站預約。獲授權的預約承辦人可讀取這些資料及帳戶聯絡信箱。</p>
      <p>請勿在本站提供病史、心理測驗結果或諮商內容。若您需要向校方預約，請使用下方校方服務連結。</p>
      <p>繼續後可填寫預約偏好。送出時才會將預約資料及此說明的版本存入您的帳戶。您可在預約紀錄取消尚未結案的預約。</p>
    </section>
    <div className="counseling-controls counseling-consent-actions">
      <Link to={counselingPath} onClick={onDecline}>不同意</Link>
      <button type="button" className="counseling-primary" onClick={onContinue}>同意</button>
    </div>
    <p className="counseling-official"><a href={universityAppointment} target="_blank" rel="noreferrer">前往校方預約服務</a></p>
  </article>;
}

function Appointments({userId,consented}:{userId:string;consented:boolean}){
  const [data,setData]=useState<Workspace|'error'|null>(null),[revision,setRevision]=useState(0);
  const [kind,setKind]=useState<CounselingKind>('counseling'),[date,setDate]=useState(''),[period,setPeriod]=useState('morning');
  const [confirmation,setConfirmation]=useState<'request'|CounselingRow|null>(null);
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [today]=useState(()=>dayFormat.format(new Date()));
  const active=useRef<AbortController|null>(null),retry=useRef<{key:string;id:string}|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  useEffect(()=>{
    const refresh=()=>setRevision(value=>value+1);
    window.addEventListener('school-affairs:updated',refresh);
    return ()=>window.removeEventListener('school-affairs:updated',refresh);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    void loadCounseling(userId,'mine',controller.signal).then(value=>{if(!controller.signal.aborted)setData(value);},
      ()=>{if(!controller.signal.aborted)setData('error');});
    return ()=>controller.abort();
  },[userId,revision]);
  function reload(){setData(null);setRevision(value=>value+1);}
  function request(event:FormEvent){event.preventDefault();if(date&&consented)setConfirmation('request');}
  async function save(){
    if(!confirmation||active.current)return;
    const op=confirmation==='request'?'request':'cancel';
    const fields=confirmation==='request'
      ?{kind,preferred_on:date,preferred_period:period,consent_version:counselingConsentVersion}
      :{id:confirmation.id,expected_version:confirmation.version};
    const key=JSON.stringify([op,fields]);
    const id=retry.current?.key===key?retry.current.id:crypto.randomUUID();
    retry.current={key,id};
    const controller=new AbortController();active.current=controller;
    setBusy(true);setError('');setStatus('');
    try{
      await changeCounseling(userId,op,{...fields,request_id:id},controller.signal);
      if(controller.signal.aborted)return;
      retry.current=null;
      setConfirmation(null);setStatus(op==='request'?'已送出預約偏好，請等候安排。':'已取消預約。');reload();
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'預約結果未確認，請重試。');}
    finally{active.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  const open=data&&data!=='error'&&data.rows.some(row=>['requested','scheduled'].includes(row.status));
  return <section className="counseling-appointments">
    <h2>預約紀錄</h2>
    {!data&&<p role="status">讀取預約中…</p>}
    {data==='error'&&<p role="alert">無法載入預約。 <button type="button" onClick={reload}>重試</button></p>}
    {data&&data!=='error'&&<>
      {data.canCoordinate&&<p><Link to={counselingPath+'/queue'}>預約處理</Link></p>}
      {!data.available&&<p>本站目前尚未開放安排預約。 <a href={universityAppointment} target="_blank" rel="noreferrer">前往校方預約服務</a></p>}
      {data.available&&!consented&&!open&&<p><Link to={consentPath}>閱讀資料使用說明並預約</Link></p>}
      {consented&&data.available&&!open&&<form className="counseling-form" onSubmit={request}>
        <label>服務項目<select value={kind} onChange={event=>setKind(event.target.value as CounselingKind)}>
          {Object.entries(counselingKinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>希望日期<input required type="date" min={today} value={date} onChange={event=>setDate(event.target.value)}/></label>
        <label>希望時段<select value={period} onChange={event=>setPeriod(event.target.value)}><option value="morning">上午</option><option value="afternoon">下午</option></select></label>
        <div className="counseling-controls"><button type="submit" className="counseling-primary" disabled={busy||!date}>送出</button></div>
      </form>}
      <div className="counseling-table-wrap" role="region" aria-label="預約明細" tabIndex={0}>
        <table><thead><tr>{['服務項目','希望日期','時段','狀態','安排時間','操作'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{data.rows.map(row=><tr key={row.id}>
          <td>{counselingKinds[row.kind]}</td><td>{row.preferred_on}</td><td>{row.preferred_period==='morning'?'上午':'下午'}</td>
          <td>{counselingStatus[row.status][0]}</td><td>{row.scheduled_at?counselingTime.format(new Date(row.scheduled_at)):'—'}</td>
          <td>{['requested','scheduled'].includes(row.status)&&<button type="button" onClick={()=>{setError('');setConfirmation(row);}}>取消預約</button>}</td>
        </tr>)}
        {!data.rows.length&&<tr><td colSpan={6}>目前沒有預約紀錄。</td></tr>}</tbody></table>
      </div>
    </>}
    {status&&<p role="status">{status}</p>}
    <Dialog open={Boolean(confirmation)} onOpenChange={value=>{if(!value&&!busy){setConfirmation(null);setError('');}}}>
      <DialogContent>
        <DialogTitle>{confirmation==='request'?'確認送出預約':'確認取消預約'}</DialogTitle>
        <DialogDescription>{confirmation==='request'?'送出後請等候承辦人安排時間。':'取消後，承辦人將無法再安排此筆預約。'}</DialogDescription>
        {error&&<p role="alert">{error}</p>}
        <div className="counseling-controls"><button type="button" className="counseling-primary" disabled={busy} onClick={()=>void save()}>{busy?'處理中…':'確認'}</button>
          {error&&<button type="button" onClick={()=>{setConfirmation(null);setError('');reload();}}>重新載入</button>}</div>
      </DialogContent>
    </Dialog>
  </section>;
}

export function CounselingWorkspace({userId,view}:{userId:string;view:'home'|'consent'|'appointments'|'queue'}){
  const [consented,setConsented]=useState(false);
  const navigate=useNavigate();
  useEffect(()=>{document.title=title;},[]);
  return <main className="counseling-workspace" lang="zh-Hant">
    <div className="counseling-frame">
      <header><div className="counseling-banner"><span>諮商中心訪談預約服務系統</span><span>Shu-Te University</span></div>
        <div className="counseling-heading"><img src="/stu-reference/counseling/heading.png" width="42" height="42" alt=""/><h1>{title}</h1></div>
        {view!=='consent'&&<nav aria-label="諮商預約"><Link to={counselingPath}>Home</Link><Link to={consentPath}>預約申請</Link>
          {view==='home'&&<Link to={appointmentsPath}>預約紀錄</Link>}</nav>}
      </header>
      {view==='home'?<Overview/>:view==='consent'?
        <Consent onDecline={()=>setConsented(false)} onContinue={()=>{setConsented(true);navigate(appointmentsPath);}}/>:
        view==='queue'?<CounselingQueue userId={userId}/>:
        <Appointments userId={userId} consented={consented}/>}
    </div>
    <footer><Link to="/">學校首頁</Link> · <Link to="/school-affairs">校務資訊系統</Link></footer>
  </main>;
}
