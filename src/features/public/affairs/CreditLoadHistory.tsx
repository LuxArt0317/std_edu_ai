import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {creditLoadApplicationPath,creditLoadHistoryNotes,creditLoadHistoryPath,creditLoadHistoryTimestamp} from '@/services/creditLoadHistory';
import {referenceAsset} from '../site/reference';
import {useAffairsRecords} from './useAffairsRecords';
import {CreditLoadHistoryTable} from './CreditLoadHistoryTable';
import './CreditLoadHistory.css';

const menus=[
  {title:'選課資訊',links:[['選課記錄查詢','/school-affairs/services/11-1'],['我的課表','/school-affairs/services/11-2'],['選課確認','/school-affairs/services/6-6'],['棄選','/school-affairs/services/6-4'],['即時教學反應','/school-affairs/services/7-6']]},
  {title:'超、減修學分',links:[['超減修學分申請',creditLoadApplicationPath],['歷年超減修申請紀錄',creditLoadHistoryPath]]},
  {title:'抵免學分',links:[['抵免學分申請','/school-affairs/services/7-2'],['已抵免學分記錄查詢','https://infosys.stu.edu.tw/WebSelectCourse/StuCcredit/GetCreditTransfer']]},
];
export function CreditLoadHistory({userId}:{userId:string}) {
  const {snapshot,loading,error,refresh}=useAffairsRecords(userId);
  return <div className="credit-load-history" lang="zh-Hant">
    <div className="credit-load-frame">
      <header className="credit-load-brand"><Link to="/school-affairs"><img src={referenceAsset('https://info.stu.edu.tw/ePortal/assets/img/stu/stuBanner.svg')} width="22" height="24" alt=""/>校務資訊管理系統</Link><span>Shu-Te University</span></header>
      <nav className="credit-load-nav" aria-label="選課系統選單">
        {menus.map(menu=><DropdownMenu key={menu.title}><DropdownMenuTrigger asChild><Button variant="ghost">{menu.title}<ChevronDown size={10} aria-hidden="true"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          {menu.links.map(([label,path])=><DropdownMenuItem asChild key={path}>{path.startsWith('https:')?<a href={path} target="_blank" rel="noopener noreferrer">{label}</a>:<Link to={path}>{label}</Link>}</DropdownMenuItem>)}
        </DropdownMenuContent></DropdownMenu>)}
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost">Index<ChevronDown size={10} aria-hidden="true"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link to="/school-affairs">Index</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/school-affairs/signed-out">Logout</Link></DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </nav>
      <nav className="credit-load-breadcrumb" aria-label="頁面位置"><i className="portal-icon" aria-hidden="true">{'\uf015'}</i><Link to="/school-affairs">Index</Link><span aria-hidden="true">›</span><span>歷年超減修申請紀錄</span></nav>
      <main className="credit-load-main">
        <header className="credit-load-heading"><h1><i className="portal-icon" aria-hidden="true">{'\uf19c'}</i>歷年超減修申請紀錄 <small>» 申請紀錄</small></h1></header>
        <h2 className="credit-load-record-heading"><i className="portal-icon" aria-hidden="true">{'\uf03a'}</i>申請紀錄</h2>
        {loading && !snapshot && <p role="status">載入紀錄中…</p>}
        {error && <p className="credit-load-error" role="alert">{error} <Button type="button" variant="outline" size="sm" onClick={refresh}>重新載入</Button></p>}
        <CreditLoadHistoryTable userId={userId} records={snapshot?.creditLoadHistory?.records ?? []}/>
        <p className="credit-load-datetime">Date/Time : {creditLoadHistoryTimestamp(snapshot?.checkedAt)}</p>
        <section className="credit-load-notes" aria-label="校方頁面說明（2026-11-12 擷取）"><h2><i className="portal-icon" aria-hidden="true">{'\uf129'}</i>說明</h2><ol>{creditLoadHistoryNotes.map(note=><li key={note}>{note}</li>)}</ol></section>
      </main>
    </div>
    <footer className="credit-load-footer">Copyright © 2026 樹德科技大學電算中心<small className="credit-load-provenance">stu.best · 站內示範紀錄 · 校方畫面與說明擷取於 2026-11-12</small></footer>
  </div>;
}
