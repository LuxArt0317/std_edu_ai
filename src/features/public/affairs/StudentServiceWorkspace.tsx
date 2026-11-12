import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, ChevronDown, ClipboardList, ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { savePersonalSchoolRecord, type ServiceRecord } from '@/services/schoolAffairsWorkspace';
import { campusAssistantOpenEvent } from '../PublicAssistant';
import { referenceAsset } from '../site/reference';
import { StudentRecordQuery } from './StudentRecordQuery';
import { accountQueryByService, internshipPath, officialInternshipUrl, studentServiceByKey } from './studentServices.js';
import { useAffairsRecords } from './useAffairsRecords';
import './student-services.css';

const statuses = {draft:'草稿 · Draft',filed:'自行標記已送出 · Marked filed',withdrawn:'已取消追蹤 · Withdrawn'};
const reviewStatuses = {open:'站內待審 · Awaiting site review',in_review:'站內審核中 · In site review',resolved:'站內已處理 · Site review resolved'};
const internshipViews = [
  ['contract','Internship contract'],
  ['self_assessment',"Self-assessment form for students’ off-campus internship"],
  ['company','Company list application (cooperation with the business contractor for follow-up review)'],
  ['directory','List of enterprises'],
] as const;
const internshipTitle = 'Student off-campus internship management system';

function InternshipFrame({view,children}:{view:string;children?:ReactNode}) {
  const selected = internshipViews.find(([key])=>key===view);
  return <div className="student-internship" lang="en">
    <header className="internship-brand">
      <Link to={internshipPath}>
        <img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="25" height="29" alt=""/>
        {internshipTitle}
      </Link>
      <span>Shu-Te University</span>
    </header>
    <nav className="internship-menu" aria-label="Internship navigation">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost">Student Zone <ChevronDown size={14} aria-hidden="true"/></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {internshipViews.map(([key,label])=><DropdownMenuItem key={key} asChild><Link to={internshipPath+'/'+key}>{label}</Link></DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" data-campus-assistant-menu>Index <ChevronDown size={14} aria-hidden="true"/></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link to={internshipPath}>Internship index</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/school-affairs/menu/rdd/all">School Affairs</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={()=>window.dispatchEvent(new Event(campusAssistantOpenEvent))}>Campus assistant</DropdownMenuItem>
          <DropdownMenuItem asChild><a href={officialInternshipUrl} target="_blank" rel="noopener noreferrer">Official service</a></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
    <nav className="internship-breadcrumb" aria-label="Breadcrumb">
      <i className="portal-icon" aria-hidden="true">{"\uf015"}</i><Link to={internshipPath}>index</Link>
      <span aria-hidden="true">›</span><span>{selected?.[1] ?? 'Report'}</span>
    </nav>
    <main className="internship-content">
      <h1><i className="portal-icon" aria-hidden="true">{"\uf19c"}</i>
        {selected?.[1] ?? <>Index <small>» Student Out-of-school Internship Management System Index</small></>}
      </h1>
      {selected ? children : <>
        <h2>Description of system functions…</h2>
        <section className="internship-block">
          <h3>Student Zone</h3>
          <ul>{internshipViews.map(([key,label])=><li key={key}><Link to={internshipPath+'/'+key}>{label}</Link></li>)}</ul>
        </section>
        <section className="internship-block"><h3>Remarks</h3></section>
      </>}
    </main>
    <footer>stu.best · Independent campus website</footer>
  </div>;
}

function ServiceForm({serviceKey,recordType,record,close,saved}:{
  serviceKey:string;recordType:ServiceRecord['recordType'];record?:ServiceRecord;close:()=>void;saved:()=>void;
}) {
  const [id] = useState(()=>record?.id || crypto.randomUUID());
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const isContract = recordType==='contract';
  const submit = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    if (Boolean(values.starts_on) !== Boolean(values.ends_on) || (values.starts_on && values.ends_on < values.starts_on)) {
      setError('請確認起訖日期。 Enter both dates in chronological order.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await savePersonalSchoolRecord({kind:'save_service_record',payload:{...values,id,service_key:serviceKey,record_type:recordType}});
      saved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this record.');
    } finally {
      setBusy(false);
    }
  };
  return <form className="student-service-form" onSubmit={submit}>
    <label>{recordType==='company'?'企業名稱 · Company name':isContract?'實習機構 · Placement organization':'標題 · Title'}
      <Input name="title" defaultValue={record?.title ?? ''} required maxLength={160} />
    </label>
    {isContract && <div className="student-service-fields">
      <label>開始日期 · Start date<Input type="date" name="starts_on" defaultValue={record?.startsOn ?? ''} min="2000-01-01" max="2100-12-31"/></label>
      <label>結束日期 · End date<Input type="date" name="ends_on" defaultValue={record?.endsOn ?? ''} min="2000-01-01" max="2100-12-31"/></label>
    </div>}
    <label>{recordType==='self_assessment'?'學習成果與反思 · Reflection':'備註 · Notes'}
      <Textarea name="notes" defaultValue={record?.notes ?? ''} maxLength={2000} rows={4}/>
    </label>
    <label>紀錄狀態 · Tracking status<select name="status" defaultValue={record?.status ?? 'draft'}>
      {Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label>
    <p className="student-service-note">儲存在您的 stu.best 帳號。正式文件請在校方網站送出。<br/>Saved to your stu.best account. File official forms on the university site.</p>
    {error && <p role="alert" className="student-service-error">{error}</p>}
    <div className="student-service-actions">
      <Button type="submit" disabled={busy}>{busy?'儲存中… · Saving…':'儲存紀錄 · Save record'}</Button>
      <Button type="button" variant="outline" onClick={close} disabled={busy}>取消 · Cancel</Button>
    </div>
  </form>;
}

export function StudentServiceWorkspace({serviceKey,view,userId}:{serviceKey:string;view:string;userId:string}) {
  const service = studentServiceByKey(serviceKey);
  const isInternship = serviceKey==='internship';
  const accountQuery = accountQueryByService[serviceKey];
  const internshipView = isInternship ? internshipViews.find(([key])=>key===view)?.[0] : undefined;
  const {snapshot,error,loading,refresh} = useAffairsRecords(isInternship && !internshipView ? undefined : userId);
  const [editor,setEditor] = useState<ServiceRecord|'new'|null>(null);
  const [confirmation,setConfirmation] = useState<{kind:'review'|'delete';record:ServiceRecord}|null>(null);
  const [busy,setBusy] = useState(false);
  const [actionError,setActionError] = useState('');
  const [status,setStatus] = useState('');
  const recordType = internshipView==='directory'?'company':internshipView ?? 'note';
  const records = (snapshot?.serviceRecords ?? []).filter(row=>row.serviceKey===serviceKey && row.recordType===recordType);
  if (!service || (view && !internshipView)) return <section className="student-service"><h1>找不到服務 · Service not found</h1><Link to="/school-affairs/menu/sao/all">返回學務資訊 · Student Affairs</Link></section>;
  if (isInternship && !view) return <InternshipFrame view={view}/>;
  const title = service.title;
  const saved = () => {
    setEditor(null);
    setStatus('已儲存於 stu.best。 Saved to stu.best.');
    refresh();
  };
  const confirm = (kind:'review'|'delete', record:ServiceRecord) => {
    setConfirmation({kind,record});
    setActionError('');
  };
  const apply = async () => {
    if (!confirmation || busy) return;
    setBusy(true);
    setActionError('');
    const review = confirmation.kind==='review';
    try {
      await savePersonalSchoolRecord({kind:review?'submit_service_record_for_review':'delete_service_record',payload:{id:confirmation.record.id}});
      setConfirmation(null);
      setStatus(review?'已送出站內審核。 Sent for stu.best review.':'已刪除紀錄。 Record deleted.');
      refresh();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not complete this action.');
    } finally {
      setBusy(false);
    }
  };
  const back = service.group==='sysmenu' ? 'menu/external' : service.group==='sysDoc' ? 'menu/help' : service.group+'/all';
  const content = <section className="student-service" aria-label={title}>
    {!isInternship && <>
    <Link className="student-service-back" to={'/school-affairs/menu/'+back}><ArrowLeft size={16}/> 服務選單 · Service menu</Link>
    <header className="student-service-title">
      <ClipboardList aria-hidden="true"/>
      <div><span>{service.section}</span><h1>{title}</h1></div>
    </header>
    <div className="student-service-bar">
      <a className="student-service-official" href={service.officialUrl} target="_blank" rel="noopener noreferrer">
        開啟校方服務 · Official service <ExternalLink size={15} aria-hidden="true"/>
      </a>
    </div>
    </>}
    <div className="student-service-body">
      {!isInternship && !accountQuery && <p>在此記錄辦理進度。請在校方網站查詢正式資料或提交申請。<br/>Track your next steps here. Use the official service to view school records or submit an application.</p>}
      {loading && !snapshot && <p role="status">載入紀錄中… · Loading records…</p>}
      {error && <p className="student-service-error" role="alert">{error} <Button size="sm" variant="outline" onClick={refresh}>重試 · Retry</Button></p>}
      {status && <p role="status" className="student-service-status">{status}</p>}
      {accountQuery && snapshot && <StudentRecordQuery kind={accountQuery} snapshot={snapshot} title={title}/>}
      {snapshot && (!accountQuery || records.length>0) && <>
        <div className="student-service-section">
          <h2>{isInternship?'Saved records':'我的紀錄 · My records'}</h2>
          {!editor && (!isInternship || internshipView!=='directory') &&
            <Button type="button" variant="outline" onClick={()=>{setEditor('new');setStatus('');}}><Plus size={16}/>新增紀錄 · New record</Button>}
        </div>
        {editor && <ServiceForm key={editor==='new'?recordType:editor.id} serviceKey={serviceKey} recordType={recordType}
          record={editor==='new'?undefined:editor} close={()=>setEditor(null)} saved={saved}/>}
        {records.length ? <div className="student-service-table-scroll" role="region" aria-label="Saved service records" tabIndex={0}>
          <table className="student-service-table">
            <thead><tr><th scope="col">名稱 · Title</th>{recordType==='contract'&&<th scope="col">起訖日期 · Dates</th>}<th scope="col">狀態 · Status</th><th scope="col">操作 · Actions</th></tr></thead>
            <tbody>{records.map(record=><tr key={record.id}>
              <th scope="row"><strong>{record.title}</strong></th>
              {recordType==='contract'&&<td>{record.startsOn?record.startsOn+' → '+record.endsOn:'未設定'}</td>}
              <td>{statuses[record.status]}{record.reviewStatus&&<small>{reviewStatuses[record.reviewStatus]}</small>}</td>
              <td><div className="student-service-actions">
                <Button size="sm" variant="outline" onClick={()=>{setEditor(record);setStatus('');}}>編輯 · Edit</Button>
                {isInternship && !record.reviewStatus && record.status!=='withdrawn' &&
                  <Button size="sm" variant="outline" onClick={()=>confirm('review',record)}>送站內審核 · Request site review</Button>}
                <Button size="sm" variant="ghost" onClick={()=>confirm('delete',record)}>刪除 · Delete</Button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="student-service-empty">目前沒有已儲存的紀錄。 No saved records yet.</p>}
      </>}
    </div>
    <Dialog open={Boolean(confirmation)} onOpenChange={open=>{if(!open&&!busy)setConfirmation(null);}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmation?.kind==='review'?'送站內審核 · Request site review':'刪除紀錄 · Delete record'}</DialogTitle>
          <DialogDescription>{confirmation?.record.title}
            {confirmation?.kind==='review'&&<span className="block mt-2">站內管理員會收到名稱、日期和節次。私人備註仍保存在您的帳號。<br/>The stu.best administrator receives the title, dates and class periods. Your notes stay private.</span>}
            {confirmation?.kind==='delete'&&confirmation.record.reviewStatus&&<span className="block mt-2">已送出的站內審核仍保留。<br/>The submitted site request will remain in your account.</span>}
          </DialogDescription>
        </DialogHeader>
        {actionError&&<p role="alert" className="student-service-error">{actionError}</p>}
        <DialogFooter><Button variant="outline" onClick={()=>setConfirmation(null)} disabled={busy}>取消 · Cancel</Button>
          <Button variant={confirmation?.kind==='review'?'default':'destructive'} onClick={()=>void apply()} disabled={busy}>
            {confirmation?.kind==='review'?'送出 · Send request':'刪除 · Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
  return isInternship ? <InternshipFrame view={view}>{content}</InternshipFrame> : content;
}
