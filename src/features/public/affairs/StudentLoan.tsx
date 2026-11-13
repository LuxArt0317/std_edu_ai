import {useId,useRef,type MouseEvent} from 'react';
import {Link} from 'react-router';
import {Dialog as DialogPrimitive} from 'radix-ui';
import {ChevronDown} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {referenceAsset} from '../site/reference';
import {ownStudentLoanData,studentLoanNotice,studentLoanPaths,type StudentLoanData,type StudentLoanView} from '@/services/studentLoan';
import './studentLoan.css';

const currentCopyrightYear=new Date().getFullYear();
export type StudentLoanProps={
  userId:string;view:StudentLoanView;data:StudentLoanData;error?:string|null;onReload:()=>void;onLogout:()=>void;
  onNavigate:(view:StudentLoanView,options?:{newTab:true})=>void;
  /** Public information only: the host maps its verified local copy, never an owned-record redirect. */
  onInformation:()=>void;
  copyrightYear?:number;
};
function Icon({children}:{children:string}){return <i className="student-loan-icon" aria-hidden="true">{children}</i>;}
/** Controlled, unmounted source view. Callbacks navigate only; no API, application or document operations. */
export function StudentLoan(props:StudentLoanProps){return <AccountStudentLoan key={props.userId} {...props}/>;}
function AccountStudentLoan({userId,view,data,error,onReload,onLogout,onNavigate,onInformation,copyrightYear=currentCopyrightYear}:StudentLoanProps){
  const topId=useId(),safe=ownStudentLoanData(data,userId),busy=safe.status==='loading',record=!error&&safe.status==='loaded'?safe.record:null;
  const launch=useRef<HTMLElement|null>(null),progress=useRef<HTMLAnchorElement|null>(null),history=useRef<HTMLAnchorElement|null>(null),documentLink=useRef<HTMLAnchorElement|null>(null);
  const open=view!=='index',unavailable=!busy&&!error&&!record;
  function navigate(event:MouseEvent<HTMLAnchorElement>,next:StudentLoanView,newTab=false){
    if(busy){event.preventDefault();return;}
    if(!newTab&&(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey))return;
    event.preventDefault();onNavigate(next,newTab?{newTab:true}:undefined);
  }
  const notice=busy?'載入站內就學貸款紀錄中…':error?'站內就學貸款紀錄暫時無法載入，請重新載入。':studentLoanNotice(view==='index'?'progress':view,record);
  return <div className="student-loan" lang="zh-Hant" id={topId}><div className="student-loan-shell">
    <header className="student-loan-brand"><span className="student-loan-brand-first"><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} alt=""/>就學貸款申請</span><span>Shu-Te University</span></header>
    <nav className="student-loan-nav" aria-label="就學貸款選單"><DropdownMenu modal={false}><DropdownMenuTrigger className="student-loan-menu">Index<ChevronDown aria-hidden="true"/></DropdownMenuTrigger>
      <DropdownMenuContent className="student-loan-dropdown" align="end"><DropdownMenuItem asChild><Link to={studentLoanPaths.index} onClick={event=>navigate(event,'index')}>Index</Link></DropdownMenuItem><DropdownMenuItem onSelect={onLogout}>登出</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu></nav>
    <nav className="student-loan-breadcrumb" aria-label="頁面位置"><ol><li><Icon>{'\uf015'}</Icon>{' '}<Link to={studentLoanPaths.index} onClick={event=>navigate(event,'index')}>Index</Link></li>{' '}<li><Icon>{'\uf105'}</Icon><Link to={studentLoanPaths.index} onClick={event=>navigate(event,'index')}>就學貸款申請須知</Link></li></ol></nav>
    <main className="student-loan-main" aria-busy={busy}><header className="student-loan-heading"><h1><Icon>{'\uf19c'}</Icon>系統首頁 <small>» 就學貸款申請須知</small></h1></header>
      <div className="student-loan-action-row"><div className="student-loan-action-column"><hr/><p className="student-loan-actions">
        <Link ref={progress} to={studentLoanPaths.progress} aria-disabled={busy} onClick={event=>navigate(event,'progress')}>1.查詢當期就學貸款進度</Link>{' '}
        <Link ref={documentLink} to={studentLoanPaths.document} target="_blank" rel="noopener noreferrer" aria-disabled={busy} title="查詢站內文件狀態；不產生或列印文件" onClick={event=>navigate(event,'document',true)}>2.列印當期就學貸款資料</Link>{' '}
        <button type="button" onClick={onInformation}>3.就學貸款資訊專區</button>{' '}
        <Link ref={history} to={studentLoanPaths.history} aria-disabled={busy} onClick={event=>navigate(event,'history')}>4.歷年申請記錄{record?.historyCount!==null&&record?.historyCount!==undefined?`(${record.historyCount})`:''}</Link>
      </p></div></div>
      {busy&&<p className="student-loan-state" role="status">載入站內就學貸款紀錄中…</p>}
      {error&&<p className="student-loan-state student-loan-error" role="alert">站內就學貸款紀錄暫時無法載入，請重新載入。 <button type="button" disabled={busy} onClick={onReload}>重新載入</button></p>}
      {unavailable&&<p className="student-loan-state" role="status">目前無法確認站內就學貸款紀錄。 <button type="button" onClick={onReload}>重新載入</button></p>}
      {record?.currentApplicationState==='unknown'&&<p className="student-loan-state" role="status">目前無法確認當期就學貸款申請狀態。</p>}
    </main>
  </div><footer className="student-loan-footer">Copyright © {Number.isSafeInteger(copyrightYear)&&copyrightYear>0?copyrightYear:currentCopyrightYear} 樹德科技大學電算中心</footer><a className="student-loan-top" href={'#'+topId} aria-label="回到頁首"><Icon>{'\uf106'}</Icon></a>
    <DialogPrimitive.Root open={open} onOpenChange={next=>{if(!next)onNavigate('index');}}><DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="student-loan-overlay"/>
      <DialogPrimitive.Content className="student-loan-dialog" onOpenAutoFocus={()=>{launch.current=document.activeElement instanceof HTMLElement?document.activeElement:null;}}
        onCloseAutoFocus={event=>{event.preventDefault();const fallback=view==='history'?history.current:view==='document'?documentLink.current:progress.current;(launch.current?.isConnected&&launch.current!==document.body?launch.current:fallback)?.focus();}}>
        <DialogPrimitive.Title className="student-loan-sr-only">就學貸款查詢訊息</DialogPrimitive.Title>
        <div className="student-loan-dialog-body"><DialogPrimitive.Description className="student-loan-notice">{notice}</DialogPrimitive.Description><DialogPrimitive.Close className="student-loan-close" aria-label="關閉">×</DialogPrimitive.Close></div>
        <div className="student-loan-dialog-footer"><DialogPrimitive.Close className="student-loan-ok">OK</DialogPrimitive.Close></div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal></DialogPrimitive.Root>
  </div>;
}
