import type {ReactNode} from 'react';
import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {chargePaymentHistoryPath} from '../../../../server/chargePaymentContract.js';
import './pendingFees.css';

const path='/school-affairs/services/39-1';
const pendingFeesTitle='待繳費用明細表查詢 Pending Payment Details';
const paymentHistoryTitle='繳費紀錄 Payment History';

export function PendingFeesLayout({history=false,children}:{history?:boolean;children:ReactNode}){
  return <div className={history?'pending-fees pending-fees-history':'pending-fees'} id="pending-fees-top" lang="zh-Hant">
    <div className="pending-fees-shell">
      <header className="pending-fees-brand"><Link to={path}><img src="/stu-reference/pending-fees-banner.svg" width="22.3" height="24" alt=""/><span>學生待繳費用管理系統</span></Link><span>Shu-Te University</span></header>
      <nav className="pending-fees-nav" aria-label="待繳費用選單">
        <Link to={chargePaymentHistoryPath} className="pending-fees-menu pending-fees-history-link" aria-current={history?'page':undefined}>繳費紀錄</Link>
        <DropdownMenu><DropdownMenuTrigger className="pending-fees-menu">待繳費用維護<ChevronDown size={10} aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={path}>學生待繳費用查詢</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger className="pending-fees-menu">Index<ChevronDown size={10} aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link to="/school-affairs">Index</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/school-affairs/signed-out">Logout</Link></DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </nav>
      <nav className="pending-fees-breadcrumb" aria-label="頁面位置">
        <i className="portal-icon" aria-hidden="true">{'\uf015'}</i><Link to="/school-affairs">Index</Link><span aria-hidden="true">›</span><Link to={path}>{history?'待繳費用明細':pendingFeesTitle}</Link>
        {history&&<><span aria-hidden="true">›</span><span aria-current="page" className="pending-fees-current">繳費紀錄</span></>}
      </nav>
      <h1 className="pending-fees-heading"><i className="portal-icon" aria-hidden="true">{'\uf03a'}</i>{history?paymentHistoryTitle:pendingFeesTitle} {!history&&<small>» 查詢學生個人待繳費用清單</small>}</h1>
      <main className="pending-fees-main">{children}</main>
      <footer className="pending-fees-footer">Copyright @2026 樹德科技大學</footer>
    </div>
    <div className="pending-fees-bottom">
      <p>{history?'stu.best 站內繳費紀錄':'stu.best 站內紀錄 · 非校方欠費證明或繳費交易'}</p>
      <a href="#pending-fees-top" aria-label="回到頁首">⌃</a>
    </div>
  </div>;
}
