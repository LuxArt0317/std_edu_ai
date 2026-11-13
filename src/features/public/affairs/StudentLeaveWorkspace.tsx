import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { savePersonalSchoolRecord, type AffairsSnapshot, type ServiceRecord } from '@/services/schoolAffairsWorkspace';
import { campusAssistantOpenEvent } from '../PublicAssistant';
import { referenceAsset } from '../site/reference';
import { leavePath, officialLeaveUrl } from './studentServices.js';
import { useAffairsRecords } from './useAffairsRecords';
import './student-leave.css';

const categories = [
  ['personal','事假','Personal leave'], ['sick','病假','Sick leave'],
  ['official','公假','Official duty'], ['bereavement','喪假','Bereavement leave'],
  ['nursing','哺育假','Nursing leave'], ['mental_health','心理假','Mental health leave'],
  ['maternity','產假','Maternity leave'], ['menstrual','生理假','Menstrual leave'],
] as const;
const leaveTimes = [['am','上午(08-13時)'],['pm','下午(13-18時)'],['day','全天']] as const;
const statuses = {draft:'草稿',filed:'自行標記已送出',withdrawn:'已取消追蹤'};
const reviews = {open:'站內待審',in_review:'站內審核中',resolved:'站內已處理'};
const historyPath = leavePath+'/history';
const processUrl = 'https://info.stu.edu.tw/SAO/SLA/readme/111請假流程說明.pdf';
const weekdays = ['','一','二','三','四','五','六','日'];

function schedulePeriods(courses:AffairsSnapshot['courses'],start:string,end:string) {
  if (!start || !end || start>end) return [];
  const options = new Map<string,string>();
  for (const course of courses) {
    if (!course.weekday || !course.startsAt || course.status!=='enrolled') continue;
    const first = new Date((course.termStartsOn && course.termStartsOn>start ? course.termStartsOn : start)+'T00:00:00Z');
    const last = new Date((course.termEndsOn && course.termEndsOn<end ? course.termEndsOn : end)+'T00:00:00Z');
    const offset = (course.weekday+7-first.getUTCDay())%7;
    if (first.getTime()+offset*86_400_000>last.getTime()) continue;
    const value = '週'+weekdays[course.weekday]+course.startsAt.slice(0,5);
    options.set(value,[options.get(value),course.title].filter(Boolean).join('、'));
  }
  return [...options.entries()];
}

function LeaveFrame({page,children}:{page:string;children:ReactNode}) {
  return <div className="student-leave" lang="zh-Hant">
    <div className="leave-shell">
      <header className="leave-banner">
        <Link to={leavePath+'/index'}>
          <img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="22" height="26" alt=""/>
          學生請假系統
        </Link>
        <span>樹德科技大學</span>
      </header>
      <nav className="leave-nav" aria-label="學生請假選單">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" data-campus-assistant-menu>Index<ChevronDown size={13} aria-hidden="true"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link to={leavePath+'/index'}>Index</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/school-affairs/menu/sao/all">校務資訊系統</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>window.dispatchEvent(new Event(campusAssistantOpenEvent))}>校園助理</DropdownMenuItem>
            <DropdownMenuItem asChild><a href={officialLeaveUrl} target="_blank" rel="noopener noreferrer">校方請假系統</a></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost">學生<ChevronDown size={13} aria-hidden="true"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link to={leavePath}>假單填寫作業</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to={historyPath}>請假紀錄</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to={leavePath+'/archive'}>歷史請假假單(107學年以前)</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to={leavePath+'/periods'}>請假節次</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <nav className="leave-breadcrumb" aria-label="頁面位置">
        <i className="portal-icon" aria-hidden="true">{"\uf015"}</i>
        <Link to={leavePath+'/index'}>Home</Link><span aria-hidden="true">›</span><span>{page}</span>
      </nav>
      <main className="leave-content">{children}</main>
      <footer className="leave-footer">stu.best · 獨立校園網站</footer>
    </div>
  </div>;
}

function LeaveTitle({children}:{children:ReactNode}) {
  return <header className="leave-heading">
    <h1>程式名稱 <small>› {children}</small></h1>
  </header>;
}

function LeaveForm({snapshot,record,saved,userId}:{snapshot:AffairsSnapshot;record?:ServiceRecord;saved:()=>void;userId:string}) {
  const [id] = useState(()=>record?.id ?? crypto.randomUUID());
  const initialCategory = record?.leaveCategory ?? '';
  const [category,setCategory] = useState(initialCategory);
  const [startsOn,setStartsOn] = useState(record?.startsOn ?? '');
  const [endsOn,setEndsOn] = useState(record?.endsOn ?? '');
  const [periods,setPeriods] = useState(record?.periods ?? '');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const pending = useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const {student,profile} = snapshot;
  const slots = schedulePeriods(snapshot.courses,startsOn,endsOn);
  const chosen = new Set(periods.split(/[,、]\s*/).filter(Boolean));
  function updateDates(start:string,end:string,kind=category) {
    setStartsOn(start);
    setEndsOn(end);
    const scheduled = schedulePeriods(snapshot.courses,start,end).map(([value])=>value).join('、');
    setPeriods(kind && kind!=='official' && scheduled.length<=80 ? scheduled : '');
  }
  function choosePeriods(values:string[]) {
    const next = values.join('、');
    if (next.length>80) {
      setError('請縮小日期範圍或在請假節次欄手動填寫。');
      return;
    }
    setError('');
    setPeriods(next);
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || pending.current) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    if (fields.starts_on > fields.ends_on) {
      setError('結束請假日期必須晚於或等於開始日期。');
      return;
    }
    if (!fields.periods.trim()) {
      setError('請填寫請假節次。');
      return;
    }
    const phone = fields.contact_phone.trim();
    if (phone && !/^[+0-9 ()#.-]{3,32}$/.test(phone)) {
      setError('請輸入有效的電話號碼。');
      return;
    }
    const label = categories.find(([key])=>key===category)?.[2] ?? 'Leave';
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    try {
      await savePersonalSchoolRecord({kind:'save_service_record',payload:{
        ...fields,id,service_key:'leave',record_type:'leave',leave_category:category,contact_phone:phone,
        leave_time_period:category==='mental_health' ? fields.leave_time_period : '',
        title:record?.title ?? label+' · '+fields.starts_on,status:record?.status ?? 'draft',
      }},{expectedUserId:userId,signal:controller.signal});
      if (!controller.signal.aborted) saved();
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '無法儲存假單。');
    } finally {
      if (pending.current===controller) pending.current=null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <>
    <p className="leave-form-note">假單會儲存在您的 stu.best 帳號。正式請假請使用校方請假系統。</p>
    <LeaveTitle>填寫假單作業 <a href={processUrl} target="_blank" rel="noopener noreferrer">請假流程說明</a></LeaveTitle>
    <form className="leave-form" onSubmit={submit} onReset={()=>{
      setCategory(initialCategory);
      setStartsOn(record?.startsOn ?? '');
      setEndsOn(record?.endsOn ?? '');
      setPeriods(record?.periods ?? '');
      setError('');
    }}>
      <div className="leave-row">
        <label htmlFor="leave-tutor">導師/系主任</label>
        <div className="leave-identity"><input id="leave-tutor" value="—" readOnly/><input aria-label="系主任" value="—" readOnly/></div>
      </div>
      <div className="leave-row">
        <label htmlFor="leave-student">學號</label>
        <div className="leave-identity">
          <input id="leave-student" value={student?.studentNumber ?? '—'} readOnly/>
          <input aria-label="姓名" value={student?.fullName ?? profile.displayName} readOnly/>
          <input aria-label="假單號碼" value={record?.id.slice(0,8) ?? '—'} readOnly/>
        </div>
      </div>
      <div className="leave-row">
        <label htmlFor="leave-phone">電話</label>
        <input id="leave-phone" name="contact_phone" type="tel" autoComplete="tel" maxLength={32} defaultValue={record?.contactPhone ?? ''}/>
      </div>
      <div className="leave-row">
        <label htmlFor="leave-start">開始請假日期</label>
        <input id="leave-start" name="starts_on" type="date" min="2000-01-01" max="2100-12-31"
          value={startsOn} onChange={event=>updateDates(event.target.value,endsOn)} required/>
      </div>
      <div className="leave-row">
        <label htmlFor="leave-end">結束請假日期</label>
        <input id="leave-end" name="ends_on" type="date" min="2000-01-01" max="2100-12-31"
          value={endsOn} onChange={event=>updateDates(startsOn,event.target.value)} required/>
      </div>
      <div className="leave-row leave-radio-row">
        <span id="leave-category-label">請假類別</span>
        <div role="radiogroup" aria-labelledby="leave-category-label" className="leave-categories">
          {categories.map(([key,label])=><label key={key}><input type="radio" name="leave_category" value={key} checked={category===key}
            required onChange={()=>{setCategory(key);if(!periods)updateDates(startsOn,endsOn,key);}}/>{label}</label>)}
          {initialCategory==='other'&&<label><input type="radio" name="leave_category" value="other" checked={category==='other'} onChange={()=>setCategory('other')}/>其他</label>}
          <span className="leave-category-note">請假類別請參閱請假流程說明</span>
        </div>
      </div>
      {category==='mental_health'&&<div className="leave-row leave-radio-row">
        <span id="leave-time-label">心理假時段</span>
        <div role="radiogroup" aria-labelledby="leave-time-label" className="leave-times">
          {leaveTimes.map(([value,label])=><label key={value}>
            <input type="radio" name="leave_time_period" value={value} defaultChecked={record?.leaveTimePeriod===value} required/>{label}
          </label>)}
        </div>
      </div>}
      <div className="leave-row leave-period-row">
        <span id="leave-slot-label">節次</span>
        <div aria-labelledby="leave-slot-label" role="group" className="leave-period-picker">
          <div className="leave-period-buttons">
            <Button type="button" variant="outline" disabled={!slots.length} onClick={()=>choosePeriods(slots.map(([value])=>value))}>全選</Button>
            <Button type="button" variant="outline" disabled={!periods} onClick={()=>choosePeriods([])}>取消</Button>
          </div>
          {slots.length>0&&<div className="leave-slot-list">{slots.map(([value,title])=><label key={value}>
            <input type="checkbox" checked={chosen.has(value)} onChange={event=>{
              if (event.target.checked) chosen.add(value);
              else chosen.delete(value);
              choosePeriods([...chosen]);
            }}/>{value} · {title}
          </label>)}</div>}
          <p>一般假別會選取課表上的節次。公假請依實際需求勾選。</p>
        </div>
      </div>
      <div className="leave-row">
        <label htmlFor="leave-periods">請假節次</label>
        <input id="leave-periods" className="leave-period-input" name="periods" maxLength={80}
          value={periods} onChange={event=>setPeriods(event.target.value)} required/>
      </div>
      <div className="leave-row">
        <label htmlFor="leave-reason">請假事由</label>
        <textarea id="leave-reason" name="notes" maxLength={2000} rows={2} defaultValue={record?.notes ?? ''}/>
      </div>
      <div className="leave-actions">
        {error&&<p className="student-service-error" role="alert">{error}</p>}
        <Button className="leave-primary" type="submit" disabled={busy}><i className="portal-icon" aria-hidden="true">{"\uf00c"}</i>{busy?'儲存中…':'送出'}</Button>
        <Button className="leave-reset" variant="outline" type="reset" disabled={busy}><i className="portal-icon" aria-hidden="true">{"\uf0e2"}</i>取消</Button>
        <Link className="leave-button leave-return" to={historyPath}><i className="portal-icon" aria-hidden="true">{"\uf104"}</i>回列表</Link>
      </div>
    </form>
  </>;
}

export default function StudentLeaveWorkspace({view,userId}:{view:string;userId:string}) {
  return <LeaveSession key={userId} view={view} userId={userId}/>;
}

function LeaveSession({view,userId}:{view:string;userId:string}) {
  const navigate = useNavigate();
  const {state} = useLocation();
  const {snapshot,error,loading,refresh} = useAffairsRecords(view==='index'?undefined:userId);
  const [confirmation,setConfirmation] = useState<{kind:'review'|'delete';record:ServiceRecord}|null>(null);
  const [busy,setBusy] = useState(false);
  const [actionError,setActionError] = useState('');
  const pending = useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const records = (snapshot?.serviceRecords ?? []).filter(row=>row.serviceKey==='leave' && row.recordType==='leave');
  const editId = /^edit\/([0-9a-f-]{36})$/i.exec(view)?.[1];
  const edited = records.find(record=>record.id===editId);
  const form = !view || Boolean(editId);
  const archive = view==='archive';
  const periods = view==='periods';
  const rows = archive?records.filter(row=>row.startsOn && row.startsOn<'2019-08-01'):records;
  const page = form?'填寫假單':archive?'歷史請假假單':periods?'請假節次':'Index';
  async function apply() {
    if (!confirmation || busy || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setActionError('');
    try {
      await savePersonalSchoolRecord({kind:confirmation.kind==='review'?'submit_service_record_for_review':'delete_service_record',payload:{id:confirmation.record.id}},{expectedUserId:userId,signal:controller.signal});
      if (controller.signal.aborted) return;
      setConfirmation(null);
      refresh();
    } catch (reason) {
      if (!controller.signal.aborted) setActionError(reason instanceof Error?reason.message:'無法完成操作。');
    } finally {
      if (pending.current===controller) pending.current=null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <LeaveFrame page={page}>
    {loading && !snapshot && <p role="status">載入紀錄中…</p>}
    {error && <p role="alert" className="student-service-error">{error} <Button variant="outline" onClick={refresh}>重試</Button></p>}
    {view==='index'?<>
      <LeaveTitle>系統首頁暨功能說明</LeaveTitle>
      <h2 className="leave-index-heading">學生請假填表作業</h2>
      <div className="leave-index-panel"><Link to={leavePath}>學生請假填表作業</Link></div>
    </>:form? snapshot && (!editId || edited
      ? <LeaveForm snapshot={snapshot} record={edited} userId={userId} saved={()=>navigate(historyPath,{state:{saved:true}})}/>
      : <p>找不到假單。 <Link to={historyPath}>回列表</Link></p>)
      : view==='history'||archive||periods ? <>
        <LeaveTitle>{archive?'歷史請假假單(107學年以前)':periods?'請假節次':'學生請假填表功能'}</LeaveTitle>
        {view==='history'&&<section className="leave-list-intro">
          <h2>★請假前請務必詳閱請假流程及注意事項</h2>
          <a href={processUrl} target="_blank" rel="noopener noreferrer">請假流程說明</a>
          {state?.saved&&<p role="status">假單已儲存於 stu.best。</p>}
        </section>}
        {view==='history'&&<Link className="leave-button leave-primary leave-new" to={leavePath}>新增假單</Link>}
        {snapshot&&<div className="leave-table-scroll" role="region" aria-label={periods?'請假節次':'請假紀錄'} tabIndex={0}>
          <table className="leave-table">
            <thead><tr>{(periods?['請假單號','起訖日期','請假節次']:
              ['請假單號','假單申請人','起訖日期','類別','請假節次','請假事由','公假學生清單','公假未通過學生清單','考試週','附件數目','導師簽核','紀錄狀態','簽核說明','資料操作'])
              .map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{rows.map(record=><tr key={record.id}>
              <th scope="row" title={record.id}>{record.id.slice(0,8)}</th>
              {periods?<><td>{record.startsOn} ~ {record.endsOn}</td><td>{record.periods}</td></>:<>
                <td>{snapshot.student?.fullName ?? snapshot.profile.displayName}</td>
                <td>{record.startsOn} ~ {record.endsOn}</td><td>{categories.find(([key])=>key===record.leaveCategory)?.[1] ?? '其他'}</td>
                <td>{record.periods}</td><td>{record.notes||'—'}</td>
                <td>—</td><td>—</td><td>—</td><td>0</td><td>—</td><td>{statuses[record.status]}</td>
                <td>{record.reviewStatus ? reviews[record.reviewStatus] : '—'}</td>
                <td><div className="leave-table-actions">
                  <Link to={leavePath+'/edit/'+record.id}>編輯</Link>
                  {!record.reviewStatus && record.status!=='withdrawn' && <Button variant="ghost" onClick={()=>{setActionError('');setConfirmation({kind:'review',record});}}>送站內審核</Button>}
                  <Button variant="ghost" onClick={()=>{setActionError('');setConfirmation({kind:'delete',record});}}>刪除</Button>
                </div></td>
              </>}
            </tr>)}
            {!rows.length&&<tr><td colSpan={periods?3:14}>目前沒有請假紀錄。</td></tr>}</tbody>
          </table>
        </div>}
      </>:<p>找不到頁面。 <Link to={historyPath}>回列表</Link></p>}
    <Dialog open={Boolean(confirmation)} onOpenChange={open=>{if(!open&&!busy)setConfirmation(null);}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmation?.kind==='review'?'送站內審核':'刪除假單'}</DialogTitle>
          <DialogDescription>{confirmation?.kind==='review'?'stu.best 管理員會收到日期和節次。':'這會刪除您在 stu.best 儲存的假單。'}</DialogDescription>
        </DialogHeader>
        {actionError&&<p role="alert" className="student-service-error">{actionError}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setConfirmation(null)}>取消</Button>
          <Button disabled={busy} onClick={()=>void apply()}>{busy?'處理中…':confirmation?.kind==='review'?'送出':'刪除'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </LeaveFrame>;
}
