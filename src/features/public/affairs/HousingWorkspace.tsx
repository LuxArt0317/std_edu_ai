import {useEffect,useState,type FormEvent} from 'react';
import {Link} from 'react-router';
import {savePersonalSchoolRecord} from '@/services/schoolAffairsWorkspace';
import {housingCategories,housingDate,housingPeriodState,type HousingApplication,type HousingPeriod,type HousingRecords} from '@/services/housing';
import {useAffairsRecords} from './useAffairsRecords';
import './housing.css';

const applicationPath='/school-affairs/services/26-1';
const historyPath='/school-affairs/services/34-1';
const official='https://info.stu.edu.tw/sao/sfzroom/ROOM/main.asp';
type HousingForm=Record<'full_name'|'student_number'|'gender'|'department'|'birth_date'|'home_phone'|'mobile_phone'|'email'|'address'|'postal_code'|'category'|'health_notes',string>;
const emptyForm:HousingForm={full_name:'',student_number:'',gender:'',department:'',birth_date:'',home_phone:'',mobile_phone:'',email:'',address:'',postal_code:'',category:'general',health_notes:''};
const formOf=(row:HousingApplication):HousingForm=>({full_name:row.fullName,student_number:row.studentNumber,gender:row.gender,department:row.department,birth_date:row.birthDate,home_phone:row.homePhone,mobile_phone:row.mobilePhone,email:row.email,address:row.address,postal_code:row.postalCode,category:row.category,health_notes:row.healthNotes});
const categoryLabel=(value:string)=>housingCategories.find(([key])=>key===value)?.[1]||'—';

function DetailsTable({values,editing=false}:{values:HousingForm;editing?:boolean}) {
  const [year]=useState(()=>new Date().getFullYear());
  const field=(name:keyof HousingForm,maxLength:number,type='text')=>editing?<input id={'housing-'+name} name={name} type={type} maxLength={maxLength} required={!['home_phone','mobile_phone'].includes(name)} defaultValue={values[name]}/>:values[name]||'—';
  const label=(name:keyof HousingForm,text:string)=>editing?<label htmlFor={'housing-'+name}>{text}</label>:text;
  return <table className="housing-details"><tbody>
    <tr><th colSpan={4} scope="colgroup">一、學生基本資料</th></tr>
    <tr><th scope="row">{label('full_name','姓名')}</th><td>{field('full_name',80)}</td><th scope="row">性別</th><td>{editing?<div className="housing-gender"><label><input type="radio" name="gender" value="male" required defaultChecked={values.gender==='male'}/>男</label><label><input type="radio" name="gender" value="female" required defaultChecked={values.gender==='female'}/>女</label></div>:values.gender==='male'?'男':values.gender==='female'?'女':'—'}</td></tr>
    <tr><th scope="row">{label('department','系別')}</th><td>{field('department',100)}</td><th scope="row">{label('student_number','學號')}</th><td>{field('student_number',40)}</td></tr>
    <tr><th scope="row">出生日期</th><td>{editing?<div className="housing-birth">
      <select name="birth_year" aria-label="出生年（民國）" required defaultValue={values.birth_date.slice(0,4)}><option value="">民國年</option>{Array.from({length:year-1899},(_,index)=>year-index).map(value=><option key={value} value={value}>{value>1911?value-1911:'前'+(1912-value)}年</option>)}</select>
      <select name="birth_month" aria-label="出生月" required defaultValue={values.birth_date?String(Number(values.birth_date.slice(5,7))):''}><option value="">月</option>{Array.from({length:12},(_,index)=>index+1).map(value=><option key={value} value={value}>{value}月</option>)}</select>
      <select name="birth_day" aria-label="出生日" required defaultValue={values.birth_date?String(Number(values.birth_date.slice(8,10))):''}><option value="">日</option>{Array.from({length:31},(_,index)=>index+1).map(value=><option key={value} value={value}>{value}日</option>)}</select>
    </div>:values.birth_date||'—'}</td><th scope="row">身分證字號</th><td title="stu.best 站內申請不收集身分證字號">—</td></tr>
    <tr><th scope="row">{label('home_phone','住家電話')}</th><td>{field('home_phone',40,'tel')}</td><th scope="row">{label('mobile_phone','行動電話')}</th><td>{field('mobile_phone',40,'tel')}</td></tr>
    <tr><th scope="row">{label('email','E-mail')}</th><td colSpan={3}>{field('email',254,'email')}</td></tr>
    <tr><th scope="row">{label('address','戶籍地址')}</th><td colSpan={3}>{field('address',300)}</td></tr>
    <tr><th scope="row">{label('postal_code','郵遞區號(戶籍地址)')}</th><td colSpan={3}>{field('postal_code',12)}</td></tr>
  </tbody></table>;
}

function ApplicationDocument({values,receipt}:{values:HousingForm;receipt?:HousingApplication}) {
  return <>
    {receipt&&<p className="housing-receipt-number">您的申請單號：<strong>{receipt.receiptNumber}</strong> · {housingDate(receipt.submittedAt)}</p>}
    <DetailsTable values={values}/>
    <table className="housing-details"><tbody>
      <tr><th scope="row">二、申請類別</th></tr><tr><td>{categoryLabel(values.category)}</td></tr>
      <tr><th scope="row">三、身體狀況或特殊疾病說明(250字以內)</th></tr><tr><td className="housing-preserve-text">{values.health_notes||'—'}</td></tr>
    </tbody></table>
    {receipt&&<details className="housing-consent-record"><summary>已同意的申請內容</summary><p className="housing-preserve-text">{receipt.agreementText}</p><p>同意版本：{receipt.agreementVersion}</p></details>}
  </>;
}

export function HousingWorkspace({userId,mode}:{userId:string;mode:'application'|'history'}) {
  const {snapshot,loading,error,refresh}=useAffairsRecords(userId);
  const records:HousingRecords=snapshot?.housing||{periods:[],applications:[],assignments:[]};
  const [now,setNow]=useState(Date.now);
  const [step,setStep]=useState<'overview'|'guide'|'agreement'|'entry'|'review'|'receipt'>('overview');
  const [selectedId,setSelectedId]=useState('');
  const [accepted,setAccepted]=useState<HousingPeriod|null>(null);
  const [draft,setDraft]=useState<HousingForm>(emptyForm);
  const [requestId,setRequestId]=useState('');
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const period=records.periods.find(row=>row.id===selectedId);
  const receipt=records.applications.find(row=>row.periodId===selectedId);
  const unavailable=busy||loading||Boolean(error);
  const acceptanceCurrent=Boolean(accepted&&period&&accepted.version===period.version&&housingPeriodState(period,now)==='open');
  // Reconcile an authoritative refresh before rendering another actionable form.
  // Retain the request ID only while the accepted period is unchanged.
  if(accepted&&(step==='entry'||step==='review')&&!loading&&!error&&!busy){
    if(receipt){setStep('receipt');setAccepted(null);setRequestId('');setActionError('');setMessage('已載入您先前儲存的住宿申請。');}
    else if(!acceptanceCurrent){
      setAccepted(null);setRequestId('');setStep(period&&housingPeriodState(period,now)==='open'?'agreement':'overview');
      setActionError(period&&housingPeriodState(period,now)==='open'?'申請期間或同意書已更新，請重新閱讀並同意。':'申請期間已結束或不再開放，請查看最新公告。');
    }
  }
  function showReceipt(row:HousingApplication){setSelectedId(row.periodId);setStep('receipt');setActionError('');setMessage('');}
  function start(row:HousingPeriod){
    setSelectedId(row.id);setAccepted(null);setActionError('');setMessage('');setStep('agreement');
    setDraft({...emptyForm,full_name:snapshot?.profile.displayName||'',email:snapshot?.profile.email||'',
      student_number:snapshot?.student?.sourceMode==='personal'?snapshot.student.studentNumber:'',
      department:snapshot?.student?.sourceMode==='personal'?snapshot.student.program||'':''});
  }
  function review(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setActionError('');
    const values=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    const birth=[values.birth_year,values.birth_month.padStart(2,'0'),values.birth_day.padStart(2,'0')].join('-');
    const parsed=new Date(birth+'T00:00:00Z');
    if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==birth||birth>new Date().toISOString().slice(0,10)){
      setActionError('請選擇有效的出生日期。');return;
    }
    const next={...emptyForm};
    for(const key of Object.keys(next) as (keyof HousingForm)[])next[key]=key==='birth_date'?birth:(values[key]||'').trim();
    setDraft(next);setRequestId(crypto.randomUUID());setStep('review');
  }
  async function submit(){
    if(!accepted||!requestId||unavailable||!acceptanceCurrent)return;
    setBusy(true);setActionError('');
    try {
      await savePersonalSchoolRecord({kind:'submit_housing_application',payload:{...draft,period_id:accepted.id,period_version:String(accepted.version),expected_version:'0',request_id:requestId,accepted_agreement:'true'}});
      setMessage('您的住宿申請已儲存於 stu.best。');setStep('receipt');refresh();
    }catch(reason){setActionError(reason instanceof Error?reason.message:'申請未完成，請重試。');refresh();}
    finally{setBusy(false);}
  }
  const feedback=<>
    {loading&&!snapshot&&<p role="status">載入住宿資料中…</p>}
    {error&&<p role="alert" className="housing-error">{error} <button type="button" onClick={refresh}>重新載入</button></p>}
    {actionError&&<p role="alert" className="housing-error">{actionError}</p>}
    {message&&<p role="status">{message}</p>}
  </>;
  if(mode==='history')return <div className="housing-history" lang="zh-Hant" id="housing-top">
    <div className="housing-history-shell"><div className="housing-history-strip">學生住宿資訊查詢作業<span>Shu-Te University</span></div>
      <header><img src="/stu-reference/housing-logo.png" alt="" width="42" height="42"/><h1>學生住宿資訊查詢作業</h1></header>
      <a className="housing-history-up" href="#housing-top" aria-label="回到頁首">⬆</a>
      <main>{feedback}<div className="housing-history-table-wrap" role="region" aria-label="住宿床位歷史紀錄" tabIndex={0}><table className="housing-history-table"><colgroup>{Array.from({length:6},(_,index)=><col key={index}/>)}<col className="housing-deposit-column"/><col className="housing-subsidy-column"/></colgroup><thead><tr>{['學年','學期','床位編號','宿舍名稱','上下舖','住宿費','保證金','補助金額'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{records.assignments.length?records.assignments.map(row=><tr key={row.id}><td>{row.academicYear??'—'}</td><td>{row.semester??'—'}</td><td>{row.bedNumber}</td><td>{row.dormitory}</td><td>{row.bunk==='upper'?'上舖':row.bunk==='lower'?'下舖':'—'}</td><td>{row.accommodationFee??'—'}</td><td>{row.deposit??'—'}</td><td>{row.subsidyAmount??'—'}</td></tr>):<tr><td colSpan={8}>{loading?'載入中…':'尚無住宿床位紀錄'}</td></tr>}</tbody></table></div>
        <div className="housing-history-top"><a href="#housing-top">⌃ top</a></div>
      </main>
    </div>
    <footer className="housing-history-footer"><p className="housing-local-note">stu.best 站內床位紀錄，由站內管理員維護；非校方配床或繳費結果。</p><nav className="housing-history-links"><Link to={applicationPath}>學生住宿申請</Link><Link to="/school-affairs">校務資訊首頁</Link></nav></footer>
  </div>;
  return <div className="housing-workspace" lang="zh-Hant">
    <header className="housing-banner">樹德科技大學宿舍管理系統</header>
    <div className="housing-columns"><nav className="housing-navigation" aria-label="住宿申請選單">
      <button type="button" onClick={()=>{setStep('guide');setActionError('');}}>申請範例</button>
      {records.periods.some(row=>housingPeriodState(row,now)==='open')&&<button type="button" onClick={()=>{setStep('overview');setActionError('');}}>住宿申請(舊生)</button>}
      {records.applications.length>0&&<button type="button" onClick={()=>showReceipt(records.applications[0])}>列印存查</button>}
      <Link to={historyPath}>住宿床位查詢</Link><Link to="/school-affairs">校務資訊首頁</Link>
    </nav><main className="housing-main">
      {feedback}
      {step==='overview'&&<>
        <h1 className="housing-board-title">宿舍公告</h1><div className="housing-source-rule" aria-hidden="true"/>
        <p className="housing-local-note">stu.best 站內申請期間（臺北時間）；不會送至校方。</p>
        {!loading&&!records.periods.length&&<p>目前未公告站內申請期間。</p>}
        {records.periods.map(row=>{const saved=records.applications.find(item=>item.periodId===row.id);const state=housingPeriodState(row,now);return <section className="housing-period" key={row.id}>
          <h2>{row.termLabel}</h2><table className="housing-schedule"><tbody><tr><th scope="rowgroup" rowSpan={2}>住宿申請時間：</th><th scope="row">開放時間：</th><td>{housingDate(row.opensAt)}</td></tr><tr><th scope="row">結束時間：</th><td>{housingDate(row.closesAt)}</td></tr></tbody></table>
          {row.instructions&&<p className="housing-preserve-text">{row.instructions}</p>}
          {saved?<button type="button" onClick={()=>showReceipt(saved)}>列印存查</button>:state==='open'?<button type="button" disabled={unavailable} onClick={()=>start(row)}>住宿申請(舊生)</button>:<p>{state==='upcoming'?'申請尚未開始。':'申請已截止。'}</p>}
        </section>;})}
      </>}
      {step==='guide'&&<section className="housing-guide"><h1>學生宿舍申請操作流程</h1><ol><li>選擇開放中的站內申請期間。</li><li>閱讀同意書後，確認基本資料與申請類別。</li><li>送出前再次檢查資料，再按「確認無誤，送出…」。</li><li>完成後列印存查；已儲存的申請不會重複建立。</li></ol><p>床位查詢顯示站內管理員維護的住宿紀錄。本站不辦理校方抽籤、繳費或團體包房。</p><p><a href={official} target="_blank" rel="noopener noreferrer">開啟校方宿舍系統</a></p><button type="button" onClick={()=>setStep('overview')}>回首頁</button></section>}
      {step==='agreement'&&period&&<section className="housing-agreement"><h1>學生宿舍申請同意書</h1><h2>{period.termLabel}</h2><p className="housing-preserve-text">{period.agreementText}</p><p className="housing-local-note">本次確認僅適用於 stu.best 站內紀錄。</p><div className="housing-form-buttons"><button type="button" onClick={()=>setStep('overview')}>不同意</button><button type="button" disabled={unavailable||housingPeriodState(period,now)!=='open'} onClick={()=>{setAccepted({...period});setStep('entry');}}>同意</button></div></section>}
      {step==='entry'&&accepted&&<form className="housing-application-form" onSubmit={review}>
        <h1>{accepted.termLabel} 住宿申請</h1><DetailsTable values={draft} editing/>
        <fieldset className="housing-category"><legend>二、申請類別</legend>{housingCategories.map(([value,label])=><label key={value}><input type="radio" name="category" value={value} required defaultChecked={draft.category===value}/>{label}</label>)}</fieldset>
        <label className="housing-health" htmlFor="housing-health">三、身體狀況或特殊疾病說明(250字以內)<textarea id="housing-health" name="health_notes" maxLength={250} rows={3} defaultValue={draft.health_notes}/></label>
        <div className="housing-form-buttons"><button type="reset">重新填寫</button><button type="submit" disabled={unavailable||!acceptanceCurrent}>送出</button></div>
      </form>}
      {step==='review'&&accepted&&<section className="housing-review"><div className="housing-form-buttons"><button type="button" disabled={busy} onClick={()=>setStep('entry')}>回上一頁</button><button type="button" disabled={unavailable||!acceptanceCurrent} onClick={()=>void submit()}>{busy?'儲存中…':'確認無誤，送出…'}</button></div><h1>{accepted.termLabel} 住宿申請</h1><ApplicationDocument values={draft}/><p className="housing-local-note">確認後儲存於您的 stu.best 帳號，並產生專用申請單號。</p></section>}
      {step==='receipt'&&<section className="housing-receipt">
        {receipt?<><div className="housing-form-buttons housing-no-print"><button type="button" onClick={()=>window.print()}>列印(請務必列印存查)</button><button type="button" onClick={()=>setStep('overview')}>回首頁</button></div><h1>{period?.termLabel||'住宿申請'} · 列印存查</h1><p>您的住宿申請已儲存，申請資料如下。</p><ApplicationDocument values={formOf(receipt)} receipt={receipt}/></>:<p role="status">載入已儲存的申請單中…</p>}
      </section>}
      <footer className="housing-local-note">stu.best 站內紀錄 · 非校方住宿申請或床位保留</footer>
    </main></div>
  </div>;
}
