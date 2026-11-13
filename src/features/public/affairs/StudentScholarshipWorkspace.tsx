import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {savePersonalSchoolRecord} from '@/services/schoolAffairsWorkspace';
import {scholarshipDate,scholarshipPeriodState,scholarshipStatusLabels,type ScholarshipApplication,type ScholarshipPeriod} from '@/services/scholarship';
import {campusAssistantOpenEvent} from '../PublicAssistant';
import {referenceAsset} from '../site/reference';
import {useAffairsRecords} from './useAffairsRecords';
import './student-scholarship.css';

const sourceUrl='https://info.stu.edu.tw/FRN/Scholarship/myApplication.asp';
type Confirmation={kind:'apply_scholarship'|'cancel_scholarship';period:ScholarshipPeriod;application?:ScholarshipApplication;requestId:string};

export function StudentScholarshipWorkspace({userId}:{userId:string}) {
  return <ScholarshipSession key={userId} userId={userId}/>;
}

function ScholarshipSession({userId}:{userId:string}) {
  const {snapshot,loading,error,refresh}=useAffairsRecords(userId);
  const [now,setNow]=useState(Date.now);
  const [confirmation,setConfirmation]=useState<Confirmation|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [actionError,setActionError]=useState('');
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const records=snapshot?.scholarship;
  const periods=records?.periods ?? [];
  const applications=records?.applications ?? [];
  const periodById=new Map(periods.map(period=>[period.id,period]));
  const applicationByPeriod=new Map(applications.map(application=>[application.periodId,application]));
  function confirm(kind:Confirmation['kind'],period:ScholarshipPeriod,application?:ScholarshipApplication) {
    setActionError('');setConfirmation({kind,period,application,requestId:crypto.randomUUID()});
  }
  async function submit() {
    if (!confirmation || busy || pending.current) return;
    const controller=new AbortController();pending.current=controller;
    setBusy(true);setActionError('');
    try {
      await savePersonalSchoolRecord({kind:confirmation.kind,payload:{period_id:confirmation.period.id,
        expected_version:String(confirmation.application?.version ?? 0),request_id:confirmation.requestId}},{expectedUserId:userId,signal:controller.signal});
      if(controller.signal.aborted)return;
      setMessage(confirmation.kind==='apply_scholarship'?'申請已儲存於您的 stu.best 帳號。':'已取消這筆 stu.best 申請。');
      setConfirmation(null);refresh();
    } catch (reason) {
      if(!controller.signal.aborted){setActionError(reason instanceof Error?reason.message:'申請未完成，請重試。');refresh();}
    } finally {if(pending.current===controller)pending.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <div className="student-scholarship" lang="zh-Hant">
    <header className="scholarship-navbar">
      <Link to="/school-affairs"><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="25" height="29" alt=""/>校務資訊系統</Link>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" data-campus-assistant-menu>
        {snapshot?.profile.displayName || '我的帳號'}<ChevronDown size={14} aria-hidden="true"/>
      </Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to="/school-affairs">校務資訊首頁</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/school-affairs/records">個人資料</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={()=>window.dispatchEvent(new Event(campusAssistantOpenEvent))}>校園助理</DropdownMenuItem>
        <DropdownMenuItem asChild><a href={sourceUrl} target="_blank" rel="noopener noreferrer">校方獎助學金系統</a></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/school-affairs/signed-out">登出</Link></DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </header>
    <main className="scholarship-main"><div className="scholarship-content">
      <header className="scholarship-heading"><h1>境外學生獎助學金申請</h1><p>供境外學生申請獎助學金，及查詢歷史申請紀錄</p></header>
      <details className="scholarship-notice"><summary>申請須知</summary><div>
        <p>申請期間內，尚未審核的申請可以取消，並於截止前重新申請。已審核的申請無法變更。</p>
        <p>本頁為 stu.best 站內示範。申請與審核儲存於本網站，不會送至校方；正式申請請使用<a href={sourceUrl} target="_blank" rel="noopener noreferrer">校方獎助學金系統</a>。</p>
      </div></details>
      <p className="scholarship-local-label">stu.best 站內示範申請 · 申請期間以臺北時間顯示</p>
      {loading && !snapshot && <p role="status">載入申請資料中…</p>}
      {error && <p role="alert" className="scholarship-error">{error} <Button variant="outline" size="sm" onClick={refresh}>重新載入</Button></p>}
      {message && <p role="status" className="scholarship-message">{message}</p>}
      {snapshot && periods.length===0 && <section className="scholarship-period"><h2>目前尚無開放的申請期間</h2><p>站內管理員尚未公布獎助學金申請期間。已儲存的紀錄會保留於下方。</p></section>}
      {periods.map(period=>{
        const application=applicationByPeriod.get(period.id);
        const state=scholarshipPeriodState(period,now);
        const actionable=state==='open' && (!application || application.status==='cancelled' || application.status==='pending');
        return <section className="scholarship-period" key={period.id}>
          <h2>{period.termLabel} 獎助學金申請</h2>
          <p>申請期間：{scholarshipDate(period.opensAt)} ～ {scholarshipDate(period.closesAt)}</p>
          {period.instructions && <p className="scholarship-instructions">{period.instructions}</p>}
          {application && <p>{application.status==='pending'?'您已成功申請，請等待審核。':scholarshipStatusLabels[application.status]}</p>}
          {state==='closed' && <p>本學期申請已截止。</p>}{state==='upcoming' && <p>本學期申請尚未開始。</p>}
          {actionable && <Button className="scholarship-action" disabled={busy || loading || Boolean(error)} onClick={()=>confirm(application?.status==='pending'?'cancel_scholarship':'apply_scholarship',period,application)}>
            {application?.status==='pending'?'取消申請':'申請獎助學金'}
          </Button>}
        </section>;
      })}
      <h2 className="scholarship-history-title">歷史申請紀錄</h2>
      <div className="scholarship-table-wrap" role="region" aria-label="歷史申請紀錄" tabIndex={0}><table>
        <thead><tr><th scope="col">獎助學期</th><th scope="col">審核情形【說明】</th><th scope="col">獎助金額</th><th scope="col">應服務時數</th><th scope="col">實際服務時數</th></tr></thead>
        <tbody>{applications.length?applications.map(application=><tr key={application.id}>
          <td>{periodById.get(application.periodId)?.termLabel ?? '學期資料未載入'}</td>
          <td>{scholarshipStatusLabels[application.status]}{application.reviewNote && <span className="scholarship-review-note">【{application.reviewNote}】</span>}</td>
          <td>{application.awardAmount===null?'—':`NT$${application.awardAmount.toLocaleString('zh-TW')}`}</td>
          <td>{application.requiredHours ?? '—'}</td><td>{application.actualHours ?? '—'}</td>
        </tr>):<tr><td colSpan={5}>{loading?'載入中…':'尚無申請紀錄'}</td></tr>}</tbody>
      </table></div>
    </div></main>
    <footer className="scholarship-footer">stu.best · 獨立校園網站</footer>
    <Dialog open={Boolean(confirmation)} onOpenChange={open=>{if(!open&&!busy)setConfirmation(null);}}><DialogContent>
      <DialogHeader><DialogTitle>{confirmation?.kind==='cancel_scholarship'?'取消獎助學金申請':'確認獎助學金申請'}</DialogTitle>
        <DialogDescription>{confirmation?.period.termLabel} · stu.best 站內示範申請</DialogDescription></DialogHeader>
      <p>{confirmation?.kind==='cancel_scholarship'?'取消後仍保留申請紀錄。可於申請期間內重新申請。':'確認後將建立本學期的申請，並交由站內管理員審核。'}</p>
      {actionError && <p role="alert" className="scholarship-error">{actionError}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={()=>setConfirmation(null)}>返回</Button>
        <Button type="button" disabled={busy} onClick={()=>void submit()}>{busy?'處理中…':'確認'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
