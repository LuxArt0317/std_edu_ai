import {Link} from 'react-router';
import {ChevronDown} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {pendingFeeBalance,pendingFeeDate,pendingFeeRows,type PendingFeeCharge} from '@/services/pendingFees';
import {studentAidTimestamp} from '@/services/studentAid';
import {useAffairsRecords} from './useAffairsRecords';
import './pendingFees.css';

const path='/school-affairs/services/39-1';
const title='待繳費用明細表查詢 Pending Payment Details';
const headers=[['發生日期','Date'],['發生原因','Details'],['類別','Category'],['待繳金額','Amount'],['連絡單位','Contact Unit'],['連絡分機','Contact Extension'],['繳費單位','Unit in Charge'],['繳費狀態','Payment Status']];
const widths=[94.5234375,342.21875,129.5625,73.8125,83.5078125,120.6015625,85.109375,97.328125];
const money=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2});

export function PendingFees({userId}:{userId:string}) {
  const {snapshot,loading,error,refresh}=useAffairsRecords(userId);
  const rows=pendingFeeRows<PendingFeeCharge>(snapshot?.charges||[]);
  return <div className="pending-fees" id="pending-fees-top" lang="zh-Hant">
    <div className="pending-fees-shell">
      <header className="pending-fees-brand"><Link to={path}><img src="/stu-reference/pending-fees-banner.svg" width="22.3" height="24" alt=""/><span>學生待繳費用管理系統</span></Link><span>Shu-Te University</span></header>
      <nav className="pending-fees-nav" aria-label="待繳費用選單">
        <DropdownMenu><DropdownMenuTrigger className="pending-fees-menu">待繳費用維護<ChevronDown size={10} aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={path}>學生待繳費用查詢</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger className="pending-fees-menu">Index<ChevronDown size={10} aria-hidden="true"/></DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link to="/school-affairs">Index</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/school-affairs/signed-out">Logout</Link></DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </nav>
      <nav className="pending-fees-breadcrumb" aria-label="頁面位置"><i className="portal-icon" aria-hidden="true">{'\uf015'}</i><Link to="/school-affairs">Index</Link><span aria-hidden="true">›</span><Link to={path}>{title}</Link></nav>
      <h1 className="pending-fees-heading"><i className="portal-icon" aria-hidden="true">{'\uf03a'}</i>{title} <small>» 查詢學生個人待繳費用清單</small></h1>
      <main className="pending-fees-main">
        {loading&&!snapshot&&<p role="status">載入待繳費用中…</p>}
        {error&&<p className="pending-fees-error" role="alert">{error} <button type="button" onClick={refresh}>重新載入</button></p>}
        <h2><i className="portal-icon" aria-hidden="true">{'\uf03a'}</i>學生待繳費用明細表 Pending Payment Details</h2>
        <div className="pending-fees-table-wrap" role="region" aria-label="學生待繳費用明細表" tabIndex={0}>
          <table><caption className="pending-fees-sr-only">{rows.length?`您的 stu.best 站內待繳費用，共 ${rows.length} 筆`:'目前沒有待繳費用紀錄'}</caption><colgroup>{widths.map((width,index)=><col key={index} style={{width:`${width/1026.6640625*100}%`}}/>)}</colgroup>
            <thead><tr>{headers.map(([chinese,english])=><th scope="col" key={english}>{chinese}<br/><span lang="en">{english}</span></th>)}</tr></thead>
            <tbody>{rows.map(row=><tr key={row.id}>
              <td>{pendingFeeDate(row.occurrenceOn)}</td><td>{row.label}</td><td>{row.category||'—'}</td>
              <td className="pending-fees-amount">{money.format(pendingFeeBalance(row))}</td><td>{row.contactUnit||'—'}</td><td>{row.contactExtension||'—'}</td><td>{row.paymentUnit||'—'}</td><td className="pending-fees-status">未繳<br/><span lang="en">Pending Payment</span></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!loading&&!error&&!rows.length&&<p className="pending-fees-empty" role="status">目前沒有待繳費用紀錄 No pending payment records.</p>}
        <p className="pending-fees-datetime">Date/Time : {snapshot?studentAidTimestamp(snapshot.checkedAt):'—'}</p>
        <section className="pending-fees-notes" aria-label="校方頁面說明（2026-11-12 擷取）"><hr/><ul>
          <li>請同學確認各項待繳費用是否正確，如有問題可與各項費用連絡人連絡。</li>
          <li>同學可至<span>繳費單位</span>繳清費用。</li>
          <li lang="en">Please make sure the amount of each payment is correct, you can contact.</li>
          <li lang="en">Students can finish the payment at the Payment Unit.</li>
        </ul><hr/></section>
      </main>
      <footer className="pending-fees-footer">Copyright @2026 樹德科技大學</footer>
    </div>
    <div className="pending-fees-bottom"><p>stu.best 站內紀錄 · 非校方欠費證明或繳費交易</p><a href="#pending-fees-top" aria-label="回到頁首">⌃</a></div>
  </div>;
}
